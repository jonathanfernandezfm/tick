import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { Entry, Project, ProjectInput } from '../api';
import { useNow, useRefresh } from '../lib/hooks';
import { currentMonth, isInMonth, monthRange } from '../lib/time';
import type { Month } from '../lib/time';
import { EntryDialog } from './EntryDialog';
import { ProjectDialog } from './ProjectDialog';
import { ProjectView } from './ProjectView';
import { ShareDialog } from './ShareDialog';
import { Sidebar } from './Sidebar';

type Dialog =
  | { kind: 'project'; project?: Project }
  | { kind: 'entry'; entry: Entry }
  | { kind: 'share'; project: Project };

type Toast = { id: number; message: string; undo?: () => void };

type Props = { email: string; onSignOut: () => void };

function initialProjectId(): number | null {
  return Number(new URLSearchParams(location.search).get('p')) || null;
}

export function Dashboard({ email, onSignOut }: Props) {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [month, setMonth] = useState<Month>(currentMonth);
  const [selectedId, setSelectedId] = useState<number | null>(initialProjectId);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const running = entries.find((entry) => entry.endedAt === null) ?? null;
  const now = useNow(running ? 1000 : 30_000);

  const notify = useCallback((message: string, undo?: () => void) => {
    clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, undo });
    toastTimer.current = setTimeout(() => setToast(null), undo ? 6000 : 3500);
  }, []);

  /** Runs an API action, surfacing errors and bouncing to login if the session expired. */
  const attempt = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await action();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) onSignOut();
        else notify(error instanceof Error ? error.message : 'Something went wrong');
        return undefined;
      }
    },
    [notify, onSignOut],
  );

  const loadProjects = useCallback(() => attempt(async () => setProjects(await api.projects())), [attempt]);
  const loadEntries = useCallback(() => {
    const { from, to } = monthRange(month);
    return attempt(async () => setEntries(await api.entries(from, to)));
  }, [attempt, month]);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);
  useEffect(() => {
    loadEntries();
  }, [loadEntries]);
  // Keeps the view in sync when the timer is started from another device.
  useRefresh(loadEntries, 30_000);

  const selected = projects?.find((p) => p.id === selectedId) ?? projects?.[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    const url = new URL(location.href);
    url.searchParams.set('p', String(selected.id));
    history.replaceState(null, '', url);
  }, [selected]);

  const monthEntries = useMemo(() => entries.filter((e) => isInMonth(e.startedAt, month)), [entries, month]);

  async function startTimer(project: Project) {
    await attempt(() => api.startTimer(project.id));
    await loadEntries();
  }

  async function stopTimer() {
    const stopped = await attempt(() => api.stopTimer());
    await loadEntries();
    if (stopped) notify('Timer stopped');
  }

  async function addTime(project: Project, startedAt: number, endedAt: number, label: string) {
    const entry = await attempt(() => api.addEntry({ projectId: project.id, startedAt, endedAt }));
    if (!entry) return;
    if (!isInMonth(entry.startedAt, month)) setMonth(currentMonthOf(entry.startedAt));
    else await loadEntries();
    notify(`Added ${label} to ${project.name}`, async () => {
      await attempt(() => api.deleteEntry(entry.id));
      await loadEntries();
    });
  }

  async function saveProject(input: ProjectInput, existing?: Project) {
    const saved = await attempt(() =>
      existing ? api.updateProject(existing.id, input) : api.createProject(input),
    );
    if (!saved) return;
    setDialog(null);
    await loadProjects();
    setSelectedId(saved.id);
  }

  async function removeProject(project: Project) {
    if (!(await attempt(() => api.deleteProject(project.id)))) return;
    setDialog(null);
    setSelectedId(null);
    await Promise.all([loadProjects(), loadEntries()]);
    notify(`Deleted ${project.name}`);
  }

  async function saveEntry(entry: Entry, input: { startedAt: number; endedAt: number | null; note: string }) {
    if (!(await attempt(() => api.updateEntry(entry.id, input)))) return;
    setDialog(null);
    await loadEntries();
  }

  async function removeEntry(entry: Entry) {
    if (!(await attempt(() => api.deleteEntry(entry.id)))) return;
    setDialog(null);
    await loadEntries();
    notify('Entry deleted');
  }

  return (
    <div className="app">
      <Sidebar
        projects={projects ?? []}
        selectedId={selected?.id ?? null}
        monthEntries={monthEntries}
        running={running}
        now={now}
        email={email}
        onSelect={(project) => setSelectedId(project.id)}
        onAdd={() => setDialog({ kind: 'project' })}
        onSignOut={onSignOut}
      />

      <main className="main">
        {projects === null ? null : selected ? (
          <ProjectView
            key={selected.id}
            project={selected}
            entries={monthEntries.filter((e) => e.projectId === selected.id)}
            running={running}
            runningProject={projects.find((p) => p.id === running?.projectId) ?? null}
            now={now}
            month={month}
            onMonthChange={setMonth}
            onStart={() => startTimer(selected)}
            onStop={stopTimer}
            onAddTime={(startedAt, endedAt, label) => addTime(selected, startedAt, endedAt, label)}
            onEditEntry={(entry) => setDialog({ kind: 'entry', entry })}
            onEditProject={() => setDialog({ kind: 'project', project: selected })}
            onShare={() => setDialog({ kind: 'share', project: selected })}
          />
        ) : (
          <EmptyState onAdd={() => setDialog({ kind: 'project' })} />
        )}
      </main>

      {dialog?.kind === 'project' && (
        <ProjectDialog
          project={dialog.project}
          onClose={() => setDialog(null)}
          onSave={(input) => saveProject(input, dialog.project)}
          onDelete={dialog.project ? () => removeProject(dialog.project!) : undefined}
        />
      )}
      {dialog?.kind === 'entry' && (
        <EntryDialog
          entry={dialog.entry}
          onClose={() => setDialog(null)}
          onSave={(input) => saveEntry(dialog.entry, input)}
          onDelete={() => removeEntry(dialog.entry)}
        />
      )}
      {dialog?.kind === 'share' && (
        <ShareDialog project={dialog.project} onClose={() => setDialog(null)} attempt={attempt} />
      )}

      {toast && (
        <div className="toast" key={toast.id} role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              className="toast-action"
              onClick={() => {
                toast.undo?.();
                setToast(null);
              }}
            >
              Undo
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function currentMonthOf(ts: number): Month {
  const date = new Date(ts);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <section className="empty-hero">
      <p className="eyebrow">Nothing tracked yet</p>
      <h1 className="display">
        Start with a <em>project</em>.
      </h1>
      <p className="muted">Give it a name and a logo. Then start a timer or log time in one tap.</p>
      <button className="btn btn-ink" onClick={onAdd}>
        New project
      </button>
    </section>
  );
}
