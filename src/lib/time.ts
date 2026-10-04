import type { Entry } from '../api';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** A calendar month in local time; `month` is 0-based like Date. */
export type Month = { year: number; month: number };

export function currentMonth(): Month {
  const now = new Date();
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function shiftMonth({ year, month }: Month, delta: number): Month {
  const date = new Date(year, month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

export function sameMonth(a: Month, b: Month): boolean {
  return a.year === b.year && a.month === b.month;
}

export function monthRange({ year, month }: Month): { from: number; to: number } {
  return { from: new Date(year, month, 1).getTime(), to: new Date(year, month + 1, 1).getTime() };
}

export function daysInMonth({ year, month }: Month): number {
  return new Date(year, month + 1, 0).getDate();
}

export function monthLabel({ year, month }: Month): string {
  const label = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(new Date(year, month, 1));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function isInMonth(ts: number, { year, month }: Month): boolean {
  const date = new Date(ts);
  return date.getFullYear() === year && date.getMonth() === month;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day as YYYY-MM-DD; doubles as the value of <input type="date">. */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function timeInput(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fromInputs(date: string, time: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const [h, min] = (time || '00:00').split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime();
}

export function entryDuration(entry: Entry, now: number): number {
  return Math.max(0, (entry.endedAt ?? now) - entry.startedAt);
}

export function totalDuration(entries: Entry[], now: number): number {
  return entries.reduce((sum, entry) => sum + entryDuration(entry, now), 0);
}

/** "45m", "3h 05m", "0m" */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / MINUTE);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours ? `${hours}h ${pad(minutes)}m` : `${minutes}m`;
}

/** "1:04:09" — for the live counter. */
export function formatClock(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${pad(m)}:${pad(s)}`;
}

export function formatDecimalHours(ms: number): string {
  return (ms / HOUR).toFixed(ms / HOUR >= 100 ? 0 : 1);
}

export function formatTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(ts);
}

export function formatDay(key: string): string {
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(
    fromInputs(key, '12:00'),
  );
}

export function formatDateTime(ts: number): string {
  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(ts);
}

export type DayGroup = { key: string; total: number; entries: Entry[] };

/** Groups entries by the local day they started on, newest day first. */
export function groupByDay(entries: Entry[], now: number): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const entry of entries) {
    const key = dayKey(entry.startedAt);
    const group = groups.get(key) ?? { key, total: 0, entries: [] };
    group.total += entryDuration(entry, now);
    group.entries.push(entry);
    groups.set(key, group);
  }
  return [...groups.values()]
    .sort((a, b) => b.key.localeCompare(a.key))
    .map((group) => ({ ...group, entries: group.entries.sort((a, b) => b.startedAt - a.startedAt) }));
}
