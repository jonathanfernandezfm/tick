import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { config } from './config.ts';

const COOKIE_NAME = 'tick_session';
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

/** Constant-time comparison that also hides length differences. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

function sign(value: string): string {
  return createHmac('sha256', config.secret).update(value).digest('base64url');
}

function isHttps(c: Context): boolean {
  return c.req.header('x-forwarded-proto') === 'https' || new URL(c.req.url).protocol === 'https:';
}

export function checkCredentials(email: string, password: string): boolean {
  // Evaluate both so a wrong email takes as long as a wrong password.
  const emailOk = safeEqual(email.trim().toLowerCase(), config.email);
  const passwordOk = safeEqual(password, config.password);
  return emailOk && passwordOk;
}

export function startSession(c: Context): void {
  const expires = Date.now() + SESSION_SECONDS * 1000;
  setCookie(c, COOKIE_NAME, `${expires}.${sign(String(expires))}`, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isHttps(c),
    path: '/',
    maxAge: SESSION_SECONDS,
  });
}

export function endSession(c: Context): void {
  deleteCookie(c, COOKIE_NAME, { path: '/' });
}

export function isAuthenticated(c: Context): boolean {
  const [expires, signature] = (getCookie(c, COOKIE_NAME) ?? '').split('.');
  if (!expires || !signature) return false;
  return safeEqual(signature, sign(expires)) && Number(expires) > Date.now();
}

export const requireAuth: MiddlewareHandler = async (c, next) => {
  if (!isAuthenticated(c)) return c.json({ error: 'Not signed in' }, 401);
  await next();
};

// Naive in-memory brute-force guard: plenty for a single-user app.
const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 15 * 60 * 1000;

function clientIp(c: Context): string {
  return c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
}

export function isRateLimited(c: Context): boolean {
  const entry = attempts.get(clientIp(c));
  return !!entry && entry.resetAt > Date.now() && entry.count >= MAX_ATTEMPTS;
}

export function recordFailedLogin(c: Context): void {
  const ip = clientIp(c);
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || entry.resetAt <= now) attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  else entry.count += 1;
}

export function clearFailedLogins(c: Context): void {
  attempts.delete(clientIp(c));
}
