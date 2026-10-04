import { useEffect, useState } from 'react';

/** Current time, refreshed every `intervalMs`. */
export function useNow(intervalMs: number): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Runs `callback` every `intervalMs` and whenever the tab regains focus. */
export function useRefresh(callback: () => void, intervalMs: number): void {
  useEffect(() => {
    const id = setInterval(callback, intervalMs);
    const onVisible = () => document.visibilityState === 'visible' && callback();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [callback, intervalMs]);
}
