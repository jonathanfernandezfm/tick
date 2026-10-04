/**
 * Fills a throwaway database with demo data (used for the README screenshots).
 *   DATA_DIR=./data-demo node scripts/seed.ts
 */
import fs from 'node:fs';
import path from 'node:path';

process.env.DATA_DIR ??= './data-demo';
const dataDir = path.resolve(process.env.DATA_DIR);
fs.rmSync(dataDir, { recursive: true, force: true });

const db = await import('../server/db.ts');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Deterministic pseudo-random numbers so screenshots are stable.
let state = 42;
const random = () => ((state = (state * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);

const logo = (bg: string, fg: string, glyph: string) =>
  `data:image/svg+xml;base64,${Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" fill="${bg}"/>${glyph.replaceAll('FG', fg)}</svg>`,
  ).toString('base64')}`;

const projects = [
  db.createProject({
    name: 'Northwind Studio',
    color: '#1b1a17',
    image: logo('#1b1a17', '#f3efe6', '<path d="M18 46V18l28 28V18" fill="none" stroke="FG" stroke-width="6" stroke-linejoin="round"/>'),
    hourlyRate: 55,
  }),
  db.createProject({
    name: 'Atlas Mobile',
    color: '#3a5a98',
    image: logo('#3a5a98', '#ffffff', '<circle cx="32" cy="32" r="15" fill="none" stroke="FG" stroke-width="6"/><circle cx="32" cy="32" r="4" fill="FG"/>'),
    hourlyRate: 48,
  }),
  db.createProject({ name: 'Kiosko Coffee', color: '#c9a227', image: null, hourlyRate: null }),
];

const notes = ['', '', 'Design review', 'API integration', 'Bug fixing', 'Sprint planning', 'Client call', 'Refactor'];
const now = new Date();

function at(date: Date, hour: number, minute = 0): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute).getTime();
}

for (let back = 40; back >= 0; back--) {
  const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - back);
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  if (weekend && random() > 0.15) continue;
  if (back === 0) break;

  let cursor = at(day, 9, Math.floor(random() * 40));
  for (const project of projects) {
    if (random() < (project.id === projects[0].id ? 0.1 : 0.55)) continue;
    const length = Math.round((0.75 + random() * 3.5) * 4) * 15 * MINUTE;
    if (random() < 0.35) {
      db.createManualEntry({
        projectId: project.id,
        startedAt: cursor,
        endedAt: cursor + length,
        note: notes[Math.floor(random() * notes.length)],
      });
    } else {
      const entry = db.startTimer(project.id);
      db.updateEntry(entry.id, {
        startedAt: cursor,
        endedAt: cursor + length,
        note: notes[Math.floor(random() * notes.length)],
      });
    }
    cursor += length + Math.round(random() * 4) * 15 * MINUTE;
  }
}

// Today: a finished morning block, a quick manual add, and a live timer.
const today = new Date();
db.createManualEntry({ projectId: projects[0].id, startedAt: at(today, 9), endedAt: at(today, 11, 30), note: 'Landing page polish' });
db.createManualEntry({ projectId: projects[1].id, startedAt: at(today, 12), endedAt: at(today, 12, 30), note: '' });
const live = db.startTimer(projects[0].id);
db.updateEntry(live.id, { startedAt: Date.now() - (HOUR + 23 * MINUTE + 17_000), endedAt: null, note: '' });

const share = db.createShare(projects[0].id, 'Northwind — monthly report', Date.now() + 30 * 24 * HOUR);
console.log(`Seeded ${dataDir}`);
console.log(`share token: ${share.token}`);
