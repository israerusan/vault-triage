const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Whole days between two epoch-ms timestamps (absolute value, floored). */
export function daysBetween(a: number, b: number): number {
  return Math.floor(Math.abs(a - b) / MS_PER_DAY);
}

/**
 * True when `mtime` is older than `days` before `now`. A future mtime (clock
 * skew) is never "old". `now` defaults to the current time.
 */
export function isOlderThanDays(mtime: number, days: number, now: number): boolean {
  if (mtime > now) return false;
  return now - mtime > days * MS_PER_DAY;
}
