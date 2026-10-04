import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import type { PublicView } from '../api';
import { useNow, useRefresh } from '../lib/hooks';
import { currentMonth, entryDuration, formatClock, formatDateTime, isInMonth, monthRange } from '../lib/time';
import type { Month } from '../lib/time';
import { Avatar } from './Avatar';
import { MonthNav, Stats } from './Stats';
import { Wordmark } from './Wordmark';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; view: PublicView };

export function SharePage({ token }: { token: string }) {
  const [month, setMonth] = useState<Month>(currentMonth);
  const [state, setState] = useState<State>({ status: 'loading' });

  const load = useCallback(() => {
    const { from, to } = monthRange(month);
    api
      .publicView(token, from, to)
      .then((view) => setState({ status: 'ready', view }))
      .catch((error: Error) => setState({ status: 'error', message: error.message }));
  }, [token, month]);

  useEffect(load, [load]);
  useRefresh(load, 60_000);

  const running = state.status === 'ready' ? state.view.entries.find((e) => e.endedAt === null) : undefined;
  const now = useNow(running ? 1000 : 30_000);

  if (state.status === 'loading') return <div className="splash" aria-busy="true" />;
  if (state.status === 'error') {
    return (
      <main className="share-page share-page-error">
        <Wordmark large />
        <p className="display">{state.message}</p>
        <p className="muted">Ask for a fresh link if you still need access.</p>
      </main>
    );
  }

  const { view } = state;
  const entries = view.entries.filter((e) => isInMonth(e.startedAt, month));

  return (
    <main className="share-page">
      <header className="share-header">
        <Avatar project={view.project} size={56} />
        <div className="project-header-text">
          <p className="eyebrow">Shared timesheet</p>
          <h1 className="display">{view.project.name}</h1>
        </div>
        {running && (
          <div className="share-live">
            <span className="live-pill">Working now</span>
            <span className="share-live-clock">{formatClock(entryDuration(running, now))}</span>
          </div>
        )}
      </header>

      <MonthNav month={month} onChange={setMonth} />
      <Stats entries={entries} month={month} now={now} />

      <footer className="share-footer">
        <Wordmark />
        <span className="muted small">Read-only link · expires {formatDateTime(view.expiresAt)}</span>
      </footer>
    </main>
  );
}
