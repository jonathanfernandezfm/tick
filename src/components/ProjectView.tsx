import { useState } from 'react';
import type { Entry, Project } from '../api';
import {
  dayKey,
  entryDuration,
  formatClock,
  formatDuration,
  formatTime,
  fromInputs,
  MINUTE,
  totalDuration,
} from '../lib/time';
import type { Month } from '../lib/time';
import { Avatar } from './Avatar';
import { MonthNav, Stats } from './Stats';

const QUICK_ADD = [
  { minutes: 15, value: '15', unit: 'min', label: '15m' },
  { minutes: 30, value: '30', unit: 'min', label: '30m' },
  { minutes: 60, value: '1', unit: 'hour', label: '1h' },
];

type Props = {
  project: Project;
  entries: Entry[];
  running: Entry | null;
  runningProject: Project | null;
  now: number;
  month: Month;
  onMonthChange: (month: Month) => void;
  onStart: () => void;
  onStop: () => void;
  onAddTime: (startedAt: number, endedAt: number, label: string) => void;
  onEditEntry: (entry: Entry) => void;
  onEditProject: () => void;
  onShare: () => void;
};

export function ProjectView(props: Props) {
  const { project, entries, running, runningProject, now, month } = props;
  const [logDate, setLogDate] = useState(() => dayKey(Date.now()));
  const today = dayKey(now);
  const isRunningHere = running?.projectId === project.id;

  /** Today: the block ends now. Past days: blocks stack from 09:00 so the log reads naturally. */
  function quickAdd(minutes: number, label: string) {
    const duration = minutes * MINUTE;
    if (logDate === today) {
      props.onAddTime(Date.now() - duration, Date.now(), label);
      return;
    }
    const dayEnds = entries
      .filter((e) => e.endedAt !== null && dayKey(e.startedAt) === logDate)
      .map((e) => e.endedAt!);
    const startedAt = Math.max(fromInputs(logDate, '09:00'), ...dayEnds);
    props.onAddTime(startedAt, startedAt + duration, label);
  }

  return (
    <div className="project-view">
      <header className="project-header">
        <Avatar project={project} size={56} />
        <div className="project-header-text">
          <h1 className="display">{project.name}</h1>
          <p className="muted">
            {formatDuration(totalDuration(entries, now))} this month
            {project.hourlyRate ? ` · ${project.hourlyRate}/h` : ''}
          </p>
        </div>
        <div className="project-header-actions">
          <button className="btn btn-ghost" onClick={props.onShare}>
            Share
          </button>
          <button className="btn btn-ghost" onClick={props.onEditProject}>
            Edit
          </button>
        </div>
      </header>

      <section className="track-grid" aria-label="Track time">
        <div className={`timer-card${isRunningHere ? ' is-running' : ''}`}>
          <div className="timer-card-top">
            <span className="eyebrow">{isRunningHere ? 'Tracking now' : 'Timer'}</span>
            {isRunningHere && <span className="live-pill">Live</span>}
          </div>
          <div className="timer-clock" aria-live="off">
            {isRunningHere ? formatClock(entryDuration(running, now)) : '0:00:00'}
          </div>
          <div className="timer-card-bottom">
            <span className="timer-hint">
              {isRunningHere
                ? `Started at ${formatTime(running.startedAt)}`
                : running && runningProject
                  ? `Stops the timer on ${runningProject.name}`
                  : 'Start when you sit down to work'}
            </span>
            {isRunningHere ? (
              <button className="btn btn-signal btn-lg" onClick={props.onStop}>
                <span className="btn-icon btn-icon-stop" aria-hidden="true" /> Stop
              </button>
            ) : (
              <button className="btn btn-paper btn-lg" onClick={props.onStart}>
                <span className="btn-icon btn-icon-play" aria-hidden="true" /> Start
              </button>
            )}
          </div>
        </div>

        <div className="quick-add">
          <div className="quick-add-head">
            <span className="eyebrow">Log time</span>
            <label className="date-pill">
              <span className="sr-only">Day to log time on</span>
              <span aria-hidden="true">{logDate === today ? 'Today' : 'On'}</span>
              <input
                type="date"
                value={logDate}
                max={today}
                onChange={(e) => setLogDate(e.target.value || today)}
              />
            </label>
          </div>
          <div className="quick-add-cards">
            {QUICK_ADD.map(({ minutes, value, unit, label }) => (
              <button key={minutes} className="add-card" onClick={() => quickAdd(minutes, label)}>
                <span className="add-card-plus" aria-hidden="true">
                  +
                </span>
                <span className="add-card-value">{value}</span>
                <span className="add-card-unit">{unit}</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      <MonthNav month={month} onChange={props.onMonthChange} />
      <Stats entries={entries} month={month} now={now} hourlyRate={project.hourlyRate} onEditEntry={props.onEditEntry} />
    </div>
  );
}
