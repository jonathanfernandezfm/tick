import type { Entry } from '../api';
import {
  currentMonth,
  dayKey,
  daysInMonth,
  entryDuration,
  formatDateTime,
  formatDay,
  formatDecimalHours,
  formatDuration,
  formatTime,
  groupByDay,
  HOUR,
  monthLabel,
  sameMonth,
  shiftMonth,
  totalDuration,
} from '../lib/time';
import type { DayGroup, Month } from '../lib/time';

export function MonthNav({ month, onChange }: { month: Month; onChange: (month: Month) => void }) {
  const isCurrent = sameMonth(month, currentMonth());
  return (
    <div className="month-nav">
      <h2 className="month-title">{monthLabel(month)}</h2>
      <div className="month-nav-buttons">
        <button className="icon-btn" onClick={() => onChange(shiftMonth(month, -1))} aria-label="Previous month">
          <Chevron direction="left" />
        </button>
        {!isCurrent && (
          <button className="link-btn" onClick={() => onChange(currentMonth())}>
            This month
          </button>
        )}
        <button
          className="icon-btn"
          onClick={() => onChange(shiftMonth(month, 1))}
          aria-label="Next month"
          disabled={isCurrent}
        >
          <Chevron direction="right" />
        </button>
      </div>
    </div>
  );
}

function Chevron({ direction }: { direction: 'left' | 'right' }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d={direction === 'left' ? 'M10 3 5 8l5 5' : 'm6 3 5 5-5 5'} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type StatsProps = {
  entries: Entry[];
  month: Month;
  now: number;
  hourlyRate?: number | null;
  /** Omit for read-only views such as share links. */
  onEditEntry?: (entry: Entry) => void;
};

export function Stats({ entries, month, now, hourlyRate, onEditEntry }: StatsProps) {
  const days = groupByDay(entries, now);
  const total = totalDuration(entries, now);
  const isCurrent = sameMonth(month, currentMonth());
  const todayTotal = days.find((d) => d.key === dayKey(now))?.total ?? 0;
  const bestDay = days.reduce<DayGroup | null>((best, d) => (!best || d.total > best.total ? d : best), null);

  return (
    <>
      <section className="kpis" aria-label="Month summary">
        <Kpi label="This month" value={formatDuration(total)} detail={`${formatDecimalHours(total)} hours`} accent />
        {isCurrent ? (
          <Kpi label="Today" value={formatDuration(todayTotal)} detail={formatDay(dayKey(now))} />
        ) : (
          <Kpi
            label="Best day"
            value={bestDay ? formatDuration(bestDay.total) : '—'}
            detail={bestDay ? formatDay(bestDay.key) : 'No entries'}
          />
        )}
        <Kpi label="Days worked" value={String(days.length)} detail={`of ${daysInMonth(month)} days`} />
        <Kpi
          label="Daily average"
          value={days.length ? formatDuration(total / days.length) : '—'}
          detail="on days worked"
        />
        {hourlyRate ? (
          <Kpi
            label="Earned"
            value={((total / HOUR) * hourlyRate).toLocaleString(undefined, { maximumFractionDigits: 0 })}
            detail={`at ${hourlyRate} per hour`}
          />
        ) : null}
      </section>

      <DayChart days={days} month={month} now={now} />
      <DayLog days={days} now={now} onEditEntry={onEditEntry} />
    </>
  );
}

function Kpi({ label, value, detail, accent }: { label: string; value: string; detail: string; accent?: boolean }) {
  return (
    <div className={`kpi${accent ? ' kpi-accent' : ''}`}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      <span className="kpi-detail">{detail}</span>
    </div>
  );
}

function DayChart({ days, month, now }: { days: DayGroup[]; month: Month; now: number }) {
  const totals = new Map(days.map((d) => [d.key, d.total]));
  const max = Math.max(HOUR * 4, ...totals.values());
  const today = dayKey(now);
  const count = daysInMonth(month);

  return (
    <section className="chart" aria-label="Hours per day">
      <div className="chart-bars">
        {Array.from({ length: count }, (_, i) => {
          const date = new Date(month.year, month.month, i + 1);
          const key = dayKey(date.getTime());
          const value = totals.get(key) ?? 0;
          const weekend = date.getDay() === 0 || date.getDay() === 6;
          const label = `${formatDay(key)} · ${value ? formatDuration(value) : 'no time'}`;
          return (
            <div
              key={key}
              className={`chart-col${weekend ? ' is-weekend' : ''}${key === today ? ' is-today' : ''}`}
              title={label}
              aria-label={label}
              role="img"
            >
              <div className="chart-bar" style={{ height: `${(value / max) * 100}%` }} />
              <span className="chart-day">{i + 1}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DayLog({ days, now, onEditEntry }: { days: DayGroup[]; now: number; onEditEntry?: (entry: Entry) => void }) {
  if (!days.length) {
    return <p className="log-empty">No time tracked this month.</p>;
  }
  return (
    <section className="log" aria-label="Tracked time by day">
      {days.map((day) => (
        <div className="log-day" key={day.key}>
          <div className="log-day-head">
            <span className="log-day-name">{formatDay(day.key)}</span>
            <span className="log-day-rule" aria-hidden="true" />
            <span className="log-day-total">{formatDuration(day.total)}</span>
          </div>
          <ul className="log-entries">
            {day.entries.map((entry) => (
              <EntryRow key={entry.id} entry={entry} now={now} onEdit={onEditEntry} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

function EntryRow({ entry, now, onEdit }: { entry: Entry; now: number; onEdit?: (entry: Entry) => void }) {
  const isRunning = entry.endedAt === null;
  const content = (
    <>
      <span className={`entry-kind${isRunning ? ' is-live' : ''}`}>
        {isRunning ? 'Live' : entry.source === 'timer' ? 'Timer' : 'Logged'}
      </span>
      <span className="entry-main">
        <span className="entry-range">
          {formatTime(entry.startedAt)} → {isRunning ? 'now' : formatTime(entry.endedAt!)}
        </span>
        {entry.note && <span className="entry-note">{entry.note}</span>}
      </span>
      <span className="entry-reported" title="When this entry was recorded">
        {entry.source === 'manual' ? `added ${formatDateTime(entry.createdAt)}` : ''}
      </span>
      <span className="entry-duration">{formatDuration(entryDuration(entry, now))}</span>
    </>
  );
  return (
    <li>
      {onEdit ? (
        <button className="entry-row" onClick={() => onEdit(entry)} title="Edit entry">
          {content}
        </button>
      ) : (
        <div className="entry-row">{content}</div>
      )}
    </li>
  );
}
