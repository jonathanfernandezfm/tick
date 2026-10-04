import type { Entry, Project } from '../api';
import { entryDuration, formatClock, formatDuration } from '../lib/time';
import { Avatar } from './Avatar';
import { Wordmark } from './Wordmark';

type Props = {
  projects: Project[];
  selectedId: number | null;
  monthEntries: Entry[];
  running: Entry | null;
  now: number;
  email: string;
  onSelect: (project: Project) => void;
  onAdd: () => void;
  onSignOut: () => void;
};

export function Sidebar({ projects, selectedId, monthEntries, running, now, email, onSelect, onAdd, onSignOut }: Props) {
  const monthTotal = (projectId: number) =>
    monthEntries.filter((e) => e.projectId === projectId).reduce((sum, e) => sum + entryDuration(e, now), 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <Wordmark live={!!running} />
      </div>

      <div className="sidebar-heading">
        <span>Projects</span>
        <button className="icon-btn" onClick={onAdd} aria-label="New project" title="New project">
          +
        </button>
      </div>

      <nav className="project-list" aria-label="Projects">
        {projects.map((project) => {
          const isRunning = running?.projectId === project.id;
          return (
            <button
              key={project.id}
              className={`project-item${project.id === selectedId ? ' is-active' : ''}`}
              onClick={() => onSelect(project)}
              aria-current={project.id === selectedId ? 'page' : undefined}
            >
              <span className="project-item-avatar">
                <Avatar project={project} size={32} />
                {isRunning && <span className="live-dot" aria-label="Timer running" />}
              </span>
              <span className="project-item-text">
                <span className="project-item-name">{project.name}</span>
                <span className={`project-item-meta${isRunning ? ' is-live' : ''}`}>
                  {isRunning ? formatClock(entryDuration(running, now)) : formatDuration(monthTotal(project.id))}
                </span>
              </span>
            </button>
          );
        })}
        <button className="project-item project-item-add" onClick={onAdd}>
          <span className="avatar avatar-ghost" aria-hidden="true">
            +
          </span>
          <span className="project-item-name">New project</span>
        </button>
      </nav>

      <footer className="sidebar-footer">
        <span className="sidebar-email" title={email}>
          {email}
        </span>
        <button className="link-btn" onClick={onSignOut}>
          Sign out
        </button>
      </footer>
    </aside>
  );
}
