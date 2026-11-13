import { MINUTE, MINUTES_PER_DAY } from '../core/constants';

/**
 * Typed time entry. Kept as two small number fields (hours, minutes) instead of
 * free text, so it works the same in every language and on number keypads.
 */

const pad2 = (n: number) => String(n).padStart(2, '0');
const DIGITS = /^\d{1,2}$/;

export interface TimeParts {
  h: string;
  m: string;
  pm: boolean;
}

/** Minute of day -> the fields shown when the user starts typing. */
export function toTimeParts(minuteOfDay: number, uses24h: boolean): TimeParts {
  const h24 = Math.floor(minuteOfDay / 60) % 24;
  const m = pad2(minuteOfDay % 60);
  if (uses24h) return { h: pad2(h24), m, pm: h24 >= 12 };
  return { h: String(h24 % 12 === 0 ? 12 : h24 % 12), m, pm: h24 >= 12 };
}

/**
 * Typed fields -> minute of day, or null if invalid. Empty minutes mean :00.
 * On a 12-hour clock, 0 and 13–23 are also understood as 24-hour times,
 * so typing "19" works everywhere.
 */
export function fromTimeParts(h: string, m: string, pm: boolean, uses24h: boolean): number | null {
  const hs = h.trim();
  const ms = m.trim();
  if (!DIGITS.test(hs) || (ms !== '' && !DIGITS.test(ms))) return null;
  const hh = Number(hs);
  const mm = ms === '' ? 0 : Number(ms);
  if (hh > 23 || mm > 59) return null;
  if (uses24h || hh === 0 || hh >= 13) return hh * 60 + mm;
  return ((hh % 12) + (pm ? 12 : 0)) * 60 + mm;
}

/** Duration fields (hours, minutes) -> milliseconds, or null if not numbers. */
export function durationFromParts(h: string, m: string): number | null {
  const hs = h.trim();
  const ms = m.trim();
  if ((hs !== '' && !DIGITS.test(hs)) || (ms !== '' && !DIGITS.test(ms))) return null;
  if (hs === '' && ms === '') return null;
  const hh = hs === '' ? 0 : Number(hs);
  const mm = ms === '' ? 0 : Number(ms);
  if (mm > 59) return null;
  return (hh * 60 + mm) * MINUTE;
}

export function durationToParts(ms: number): { h: string; m: string } {
  const total = Math.round(ms / MINUTE);
  return { h: String(Math.floor(total / 60)), m: pad2(total % 60) };
}

/** Keep only digits, at most two (paste-safe). */
export const cleanDigits = (s: string): string => s.replace(/\D/g, '').slice(0, 2);

export const isMinuteOfDay = (v: number): boolean => Number.isInteger(v) && v >= 0 && v < MINUTES_PER_DAY;
