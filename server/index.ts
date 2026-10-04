import fs from 'node:fs';
import path from 'node:path';
import { Hono } from 'hono';
import type { Context } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { config } from './config.ts';
import * as db from './db.ts';
import {
  checkCredentials,
  clearFailedLogins,
  endSession,
  isAuthenticated,
  isRateLimited,
  recordFailedLogin,
  requireAuth,
  startSession,
} from './auth.ts';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MAX_IMAGE_CHARS = 400_000;
const MAX_SHARE_DAYS = 365;

class BadRequest extends Error {}

function fail(message: string): never {
  throw new BadRequest(message);
}

async function body(c: Context): Promise<Record<string, unknown>> {
  const data = await c.req.json().catch(() => null);
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail('Expected a JSON object');
  return data as Record<string, unknown>;
}

function idParam(c: Context, name = 'id'): number {
  const id = Number(c.req.param(name));
  if (!Number.isInteger(id) || id <= 0) fail('Invalid id');
  return id;
}

function timestamp(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) fail(`${field} must be a timestamp`);
  return Math.round(value);
}

function text(value: unknown, field: string, max: number): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') fail(`${field} must be text`);
  const trimmed = value.trim();
  if (trimmed.length > max) fail(`${field} is too long`);
  return trimmed;
}

function parseProject(data: Record<string, unknown>): db.ProjectInput {
  const name = text(data.name, 'Name', 60);
  if (!name) fail('Name is required');
  const color = typeof data.color === 'string' && /^#[0-9a-f]{6}$/i.test(data.color) ? data.color : '#e4572e';
  let image: string | null = null;
  if (data.image != null) {
    if (typeof data.image !== 'string' || !/^data:image\/(png|jpeg|webp|gif);base64,/.test(data.image)) {
      fail('Image must be a PNG, JPEG, WebP or GIF');
    }
    if (data.image.length > MAX_IMAGE_CHARS) fail('Image is too large');
    image = data.image;
  }
  let hourlyRate: number | null = null;
  if (data.hourlyRate !== null && data.hourlyRate !== undefined && data.hourlyRate !== '') {
    const rate = Number(data.hourlyRate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100_000) fail('Hourly rate is invalid');
    hourlyRate = rate;
  }
  return { name, color, image, hourlyRate };
}

function validateRange(startedAt: number, endedAt: number | null): void {
  if (startedAt > Date.now() + 60_000) fail('An entry cannot start in the future');
  if (endedAt === null) return;
  if (endedAt <= startedAt) fail('An entry must end after it starts');
  if (endedAt - startedAt > DAY) fail('An entry cannot be longer than 24 hours');
}

function monthRange(c: Context): { from: number; to: number } {
  const from = Number(c.req.query('from'));
  const to = Number(c.req.query('to'));
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from > 62 * DAY) {
    fail('Provide a valid from/to range');
  }
  return { from, to };
}

const api = new Hono();

api.onError((error, c) => {
  if (error instanceof BadRequest) return c.json({ error: error.message }, 400);
  console.error('[tick]', error);
  return c.json({ error: 'Something went wrong' }, 500);
});

api.get('/health', (c) => c.json({ ok: true }));

// Session

api.post('/login', async (c) => {
  if (isRateLimited(c)) return c.json({ error: 'Too many attempts. Try again in a few minutes.' }, 429);
  const data = await body(c);
  if (!checkCredentials(String(data.email ?? ''), String(data.password ?? ''))) {
    recordFailedLogin(c);
    return c.json({ error: 'Wrong email or password' }, 401);
  }
  clearFailedLogins(c);
  startSession(c);
  return c.json({ email: config.email });
});

api.post('/logout', (c) => {
  endSession(c);
  return c.json({ ok: true });
});

api.get('/me', (c) => (isAuthenticated(c) ? c.json({ email: config.email }) : c.json({ error: 'Not signed in' }, 401)));

// Public share view — the only data route that does not need a session.

api.get('/public/:token', (c) => {
  const share = db.getActiveShare(c.req.param('token'));
  if (!share) return c.json({ error: 'This link has expired or does not exist' }, 404);
  const project = db.getProject(share.projectId);
  if (!project) return c.json({ error: 'This link has expired or does not exist' }, 404);
  const { from, to } = monthRange(c);
  return c.json({
    project: { name: project.name, color: project.color, image: project.image },
    expiresAt: share.expiresAt,
    entries: db.listEntries(from, to, project.id),
  });
});

// Everything below requires a session.
const privateApi = new Hono();
privateApi.use('*', requireAuth);

privateApi.get('/projects', (c) => c.json(db.listProjects()));

privateApi.post('/projects', async (c) => c.json(db.createProject(parseProject(await body(c))), 201));

privateApi.put('/projects/:id', async (c) => {
  const project = db.updateProject(idParam(c), parseProject(await body(c)));
  return project ? c.json(project) : c.json({ error: 'Project not found' }, 404);
});

privateApi.delete('/projects/:id', (c) =>
  db.deleteProject(idParam(c)) ? c.json({ ok: true }) : c.json({ error: 'Project not found' }, 404),
);

privateApi.post('/projects/:id/start', (c) => {
  const id = idParam(c);
  if (!db.getProject(id)) return c.json({ error: 'Project not found' }, 404);
  return c.json(db.startTimer(id));
});

privateApi.post('/timer/stop', (c) => c.json(db.stopTimer() ?? null));

privateApi.get('/entries', (c) => {
  const { from, to } = monthRange(c);
  return c.json(db.listEntries(from, to));
});

privateApi.post('/entries', async (c) => {
  const data = await body(c);
  const projectId = Number(data.projectId);
  if (!db.getProject(projectId)) return c.json({ error: 'Project not found' }, 404);
  const startedAt = timestamp(data.startedAt, 'startedAt');
  const endedAt = timestamp(data.endedAt, 'endedAt');
  validateRange(startedAt, endedAt);
  const note = text(data.note, 'Note', 500);
  return c.json(db.createManualEntry({ projectId, startedAt, endedAt, note }), 201);
});

privateApi.put('/entries/:id', async (c) => {
  const entry = db.getEntry(idParam(c));
  if (!entry) return c.json({ error: 'Entry not found' }, 404);
  const data = await body(c);
  const startedAt = timestamp(data.startedAt, 'startedAt');
  // A running timer stays running; only its start time and note are editable.
  const endedAt = entry.endedAt === null ? null : timestamp(data.endedAt, 'endedAt');
  validateRange(startedAt, endedAt);
  return c.json(db.updateEntry(entry.id, { startedAt, endedAt, note: text(data.note, 'Note', 500) }));
});

privateApi.delete('/entries/:id', (c) =>
  db.deleteEntry(idParam(c)) ? c.json({ ok: true }) : c.json({ error: 'Entry not found' }, 404),
);

privateApi.get('/projects/:id/shares', (c) => c.json(db.listShares(idParam(c))));

privateApi.post('/projects/:id/shares', async (c) => {
  const id = idParam(c);
  if (!db.getProject(id)) return c.json({ error: 'Project not found' }, 404);
  const data = await body(c);
  const days = Number(data.days);
  if (!Number.isFinite(days) || days <= 0 || days > MAX_SHARE_DAYS) fail('Pick a valid expiry');
  return c.json(db.createShare(id, text(data.label, 'Label', 80), Date.now() + days * DAY), 201);
});

privateApi.delete('/shares/:token', (c) =>
  db.deleteShare(c.req.param('token')) ? c.json({ ok: true }) : c.json({ error: 'Link not found' }, 404),
);

api.route('/', privateApi);
api.all('*', (c) => c.json({ error: 'Not found' }, 404));

const app = new Hono();
app.route('/api', api);

// Serve the built SPA in production.
const distDir = path.resolve('dist');
const indexFile = path.join(distDir, 'index.html');
if (fs.existsSync(indexFile)) {
  const indexHtml = fs.readFileSync(indexFile, 'utf8');
  app.use('/assets/*', async (c, next) => {
    await next();
    c.header('Cache-Control', 'public, max-age=31536000, immutable');
  });
  app.use('*', serveStatic({ root: path.relative(process.cwd(), distDir) || '.' }));
  app.get('*', (c) => c.html(indexHtml));
}

db.pruneExpiredShares();
setInterval(db.pruneExpiredShares, HOUR).unref();

serve({ fetch: app.fetch, port: config.port }, ({ port }) => {
  console.log(`[tick] listening on http://localhost:${port} (data: ${config.dataDir})`);
});
