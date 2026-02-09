import type { UsageWindow } from '../types/user';

/**
 * Computes the period key for a given time and window.
 * - daily: "daily:YYYY-MM-DD" (UTC)
 * - monthly: "monthly:YYYY-MM" (UTC)
 * - rolling_24h: "rolling:YYYY-MM-DDTHH" (UTC hour bucket; aggregate last 24 for current usage)
 */
export function getPeriodKey(window: UsageWindow, date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');

  switch (window) {
    case 'daily':
      return `daily:${y}-${m}-${d}`;
    case 'monthly':
      return `monthly:${y}-${m}`;
    case 'rolling_24h':
      return `rolling:${y}-${m}-${d}T${h}`;
    default:
      return `daily:${y}-${m}-${d}`;
  }
}

/** Returns period keys for the last N hours (for rolling_24h aggregation). */
export function getRolling24hPeriodKeys(date: Date): string[] {
  const keys: string[] = [];
  const t = new Date(date);
  for (let i = 0; i < 24; i++) {
    keys.push(getPeriodKey('rolling_24h', t));
    t.setUTCHours(t.getUTCHours() - 1);
  }
  return keys;
}
