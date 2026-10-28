import { ALL_DAYS, MAX_SCHEDULE_NAME, MINUTES_PER_DAY, MINUTES_PER_WEEK } from './constants';
import type { Schedule } from './types';

/** Local calendar position: day of week (0 = Sunday) and minute of day. */
export interface LocalTime {
  dow: number;
  minute: number;
}

export function hasDay(days: number, dow: number): boolean {
  return ((days >> dow) & 1) === 1;
}

export function isOvernight(s: Pick<Schedule, 'startMin' | 'endMin'>): boolean {
  return s.endMin <= s.startMin;
}

/** Length of one occurrence in minutes. */
export function windowLength(s: Pick<Schedule, 'startMin' | 'endMin'>): number {
  return isOvernight(s) ? MINUTES_PER_DAY - s.startMin + s.endMin : s.endMin - s.startMin;
}

/**
 * Is the schedule active at this local time? If so, how many minutes until it ends?
 * Returns -1 when inactive.
 */
export function minutesUntilEnd(s: Schedule, t: LocalTime): number {
  const { dow, minute } = t;
  if (!isOvernight(s)) {
    if (hasDay(s.days, dow) && minute >= s.startMin && minute < s.endMin) {
      return s.endMin - minute;
    }
    return -1;
  }
  // Overnight: started today and runs past midnight…
  if (hasDay(s.days, dow) && minute >= s.startMin) {
    return MINUTES_PER_DAY - minute + s.endMin;
  }
  // …or started yesterday and has not ended yet.
  const prev = (dow + 6) % 7;
  if (hasDay(s.days, prev) && minute < s.endMin) {
    return s.endMin - minute;
  }
  return -1;
}

export function isScheduleActive(s: Schedule, t: LocalTime): boolean {
  return minutesUntilEnd(s, t) >= 0;
}

/**
 * Week coverage as a bitmap of 10,080 minutes (Sunday 00:00 first).
 * Used to decide whether an edit is stricter (covers a superset) or looser.
 */
export function coverage(s: Pick<Schedule, 'days' | 'startMin' | 'endMin'>): Uint8Array {
  const map = new Uint8Array(MINUTES_PER_WEEK);
  const len = windowLength(s);
  for (let d = 0; d < 7; d++) {
    if (!hasDay(s.days, d)) continue;
    const base = d * MINUTES_PER_DAY + s.startMin;
    for (let i = 0; i < len; i++) map[(base + i) % MINUTES_PER_WEEK] = 1;
  }
  return map;
}

/** True when `next` covers every minute `prev` covered (the edit is not looser). */
export function coversSuperset(prev: Schedule, next: Schedule): boolean {
  const a = coverage(prev);
  const b = coverage(next);
  for (let i = 0; i < MINUTES_PER_WEEK; i++) {
    if (a[i] === 1 && b[i] !== 1) return false;
  }
  return true;
}

export type ScheduleValidation = { ok: true; value: Schedule } | { ok: false; reason: string };

/** Validate and normalise untrusted schedule input. */
export function validateSchedule(input: unknown): ScheduleValidation {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'Not an object' };
  const o = input as Record<string, unknown>;
  const { id, name, days, startMin, endMin } = o;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
    return { ok: false, reason: 'Invalid id' };
  }
  if (typeof name !== 'string') return { ok: false, reason: 'Invalid name' };
  // Strip control characters and trim; names are display-only.
  const cleanName = name.replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (cleanName.length === 0 || cleanName.length > MAX_SCHEDULE_NAME) {
    return { ok: false, reason: `Name must be 1–${MAX_SCHEDULE_NAME} characters` };
  }
  if (!Number.isInteger(days) || (days as number) < 1 || (days as number) > ALL_DAYS) {
    return { ok: false, reason: 'Pick at least one day' };
  }
  for (const [k, v] of [
    ['startMin', startMin],
    ['endMin', endMin],
  ] as const) {
    if (!Number.isInteger(v) || (v as number) < 0 || (v as number) >= MINUTES_PER_DAY) {
      return { ok: false, reason: `Invalid ${k}` };
    }
  }
  if (startMin === endMin) return { ok: false, reason: 'Start and end must differ' };
  const len = windowLength({ startMin: startMin as number, endMin: endMin as number });
  if (len < 15) return { ok: false, reason: 'A schedule must be at least 15 minutes' };
  return {
    ok: true,
    value: {
      id,
      name: cleanName,
      days: days as number,
      startMin: startMin as number,
      endMin: endMin as number,
    },
  };
}

export function sameSchedule(a: Schedule, b: Schedule): boolean {
  return (
    a.id === b.id &&
    a.name === b.name &&
    a.days === b.days &&
    a.startMin === b.startMin &&
    a.endMin === b.endMin
  );
}
