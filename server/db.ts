import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.ts';

export type Project = {
  id: number;
  name: string;
  color: string;
  image: string | null;
  hourlyRate: number | null;
  createdAt: number;
};

export type Entry = {
  id: number;
  projectId: number;
  startedAt: number;
  endedAt: number | null;
  source: 'timer' | 'manual';
  note: string;
  createdAt: number;
};

export type Share = {
  token: string;
  projectId: number;
  label: string;
  expiresAt: number;
  createdAt: number;
};

export type ProjectInput = Pick<Project, 'name' | 'color' | 'image' | 'hourlyRate'>;

fs.mkdirSync(config.dataDir, { recursive: true });
const db = new DatabaseSync(path.join(config.dataDir, 'tick.db'));

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS projects (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    color       TEXT    NOT NULL,
    image       TEXT,
    hourly_rate REAL,
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    started_at INTEGER NOT NULL,
    ended_at   INTEGER,
    source     TEXT    NOT NULL CHECK (source IN ('timer', 'manual')),
    note       TEXT    NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS entries_started ON entries(started_at);
  -- At most one timer can run at a time.
  CREATE UNIQUE INDEX IF NOT EXISTS entries_single_running ON entries((1)) WHERE ended_at IS NULL;

  CREATE TABLE IF NOT EXISTS shares (
    token      TEXT    PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label      TEXT    NOT NULL DEFAULT '',
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
`);

const PROJECT_COLUMNS = 'id, name, color, image, hourly_rate AS hourlyRate, created_at AS createdAt';
const ENTRY_COLUMNS =
  'id, project_id AS projectId, started_at AS startedAt, ended_at AS endedAt, source, note, created_at AS createdAt';
const SHARE_COLUMNS = 'token, project_id AS projectId, label, expires_at AS expiresAt, created_at AS createdAt';

function transaction<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

// node:sqlite returns null-prototype rows; copy them into plain objects for JSON.
function one<T>(row: unknown): T | undefined {
  return row ? ({ ...(row as object) } as T) : undefined;
}
function many<T>(rows: unknown[]): T[] {
  return rows.map((row) => ({ ...(row as object) }) as T);
}

// Projects

export function listProjects(): Project[] {
  return many(db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects ORDER BY created_at`).all());
}

export function getProject(id: number): Project | undefined {
  return one(db.prepare(`SELECT ${PROJECT_COLUMNS} FROM projects WHERE id = ?`).get(id));
}

export function createProject(input: ProjectInput): Project {
  const { lastInsertRowid } = db
    .prepare('INSERT INTO projects (name, color, image, hourly_rate, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(input.name, input.color, input.image, input.hourlyRate, Date.now());
  return getProject(Number(lastInsertRowid))!;
}

export function updateProject(id: number, input: ProjectInput): Project | undefined {
  db.prepare('UPDATE projects SET name = ?, color = ?, image = ?, hourly_rate = ? WHERE id = ?').run(
    input.name,
    input.color,
    input.image,
    input.hourlyRate,
    id,
  );
  return getProject(id);
}

export function deleteProject(id: number): boolean {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id).changes > 0;
}

// Entries

/** Entries started inside [from, to), plus the running timer wherever it started. */
export function listEntries(from: number, to: number, projectId?: number): Entry[] {
  const where = '((started_at >= ? AND started_at < ?) OR ended_at IS NULL)';
  if (projectId === undefined) {
    return many(db.prepare(`SELECT ${ENTRY_COLUMNS} FROM entries WHERE ${where} ORDER BY started_at DESC`).all(from, to));
  }
  return many(
    db
      .prepare(`SELECT ${ENTRY_COLUMNS} FROM entries WHERE ${where} AND project_id = ? ORDER BY started_at DESC`)
      .all(from, to, projectId),
  );
}

export function getEntry(id: number): Entry | undefined {
  return one(db.prepare(`SELECT ${ENTRY_COLUMNS} FROM entries WHERE id = ?`).get(id));
}

export function getRunningEntry(): Entry | undefined {
  return one(db.prepare(`SELECT ${ENTRY_COLUMNS} FROM entries WHERE ended_at IS NULL`).get());
}

function stopRunning(now: number): void {
  db.prepare('UPDATE entries SET ended_at = MAX(?, started_at) WHERE ended_at IS NULL').run(now);
}

/** Starts a timer on the project, stopping whatever else was running. */
export function startTimer(projectId: number): Entry {
  return transaction(() => {
    const running = getRunningEntry();
    if (running?.projectId === projectId) return running;
    const now = Date.now();
    stopRunning(now);
    const { lastInsertRowid } = db
      .prepare(
        "INSERT INTO entries (project_id, started_at, ended_at, source, note, created_at) VALUES (?, ?, NULL, 'timer', '', ?)",
      )
      .run(projectId, now, now);
    return getEntry(Number(lastInsertRowid))!;
  });
}

export function stopTimer(): Entry | undefined {
  return transaction(() => {
    const running = getRunningEntry();
    if (!running) return undefined;
    stopRunning(Date.now());
    return getEntry(running.id);
  });
}

export function createManualEntry(input: {
  projectId: number;
  startedAt: number;
  endedAt: number;
  note: string;
}): Entry {
  const { lastInsertRowid } = db
    .prepare(
      "INSERT INTO entries (project_id, started_at, ended_at, source, note, created_at) VALUES (?, ?, ?, 'manual', ?, ?)",
    )
    .run(input.projectId, input.startedAt, input.endedAt, input.note, Date.now());
  return getEntry(Number(lastInsertRowid))!;
}

export function updateEntry(id: number, input: Pick<Entry, 'startedAt' | 'endedAt' | 'note'>): Entry | undefined {
  db.prepare('UPDATE entries SET started_at = ?, ended_at = ?, note = ? WHERE id = ?').run(
    input.startedAt,
    input.endedAt,
    input.note,
    id,
  );
  return getEntry(id);
}

export function deleteEntry(id: number): boolean {
  return db.prepare('DELETE FROM entries WHERE id = ?').run(id).changes > 0;
}

// Shares

export function listShares(projectId: number): Share[] {
  return many(
    db
      .prepare(`SELECT ${SHARE_COLUMNS} FROM shares WHERE project_id = ? AND expires_at > ? ORDER BY created_at DESC`)
      .all(projectId, Date.now()),
  );
}

export function createShare(projectId: number, label: string, expiresAt: number): Share {
  const token = randomBytes(18).toString('base64url');
  db.prepare('INSERT INTO shares (token, project_id, label, expires_at, created_at) VALUES (?, ?, ?, ?, ?)').run(
    token,
    projectId,
    label,
    expiresAt,
    Date.now(),
  );
  return one<Share>(db.prepare(`SELECT ${SHARE_COLUMNS} FROM shares WHERE token = ?`).get(token))!;
}

export function getActiveShare(token: string): Share | undefined {
  return one(db.prepare(`SELECT ${SHARE_COLUMNS} FROM shares WHERE token = ? AND expires_at > ?`).get(token, Date.now()));
}

export function deleteShare(token: string): boolean {
  return db.prepare('DELETE FROM shares WHERE token = ?').run(token).changes > 0;
}

export function pruneExpiredShares(): void {
  db.prepare('DELETE FROM shares WHERE expires_at <= ?').run(Date.now());
}
