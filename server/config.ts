import { createHash } from 'node:crypto';
import path from 'node:path';

const isProd = process.env.NODE_ENV === 'production';

function required(name: string, devFallback: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (isProd) {
    console.error(`[tick] Missing required environment variable ${name}`);
    process.exit(1);
  }
  return devFallback;
}

const email = required('TICK_EMAIL', 'admin@tick.local').toLowerCase();
const password = required('TICK_PASSWORD', 'tick');

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 3000),
  dataDir: path.resolve(process.env.DATA_DIR ?? './data'),
  email,
  password,
  // Deriving the default secret from the credentials means rotating them invalidates every session.
  secret:
    process.env.TICK_SECRET?.trim() ||
    createHash('sha256').update(`tick:${email}:${password}`).digest('hex'),
};
