import { DAY } from './constants';
import type { EscapeEvent, Stats, Streak } from './types';

/** One day of the weekly view, oldest first. */
export interface DayInsight {
  key: string;
  /** 0 = Sunday … 6 = Saturday. */
  dow: number;
  focusMinutes: number;
  blocks: number;
  isToday: boolean;
}

export interface WeekInsight {
  days: DayInsight[];
  focusMinutes: number;
  blocks: number;
  /** Same totals for the 7 days before, to show a trend. */
  prevFocusMinutes: number;
  prevBlocks: number;
  /** Days this week with any completed focus. */
  focusDays: number;
}

/** Last 7 days (today included) from the per-day stats the app already keeps. */
export function weekInsight(stats: Stats, now: number, dayKey: (ms: number) => string): WeekInsight {
  const days: DayInsight[] = [];
  let prevFocusMinutes = 0;
  let prevBlocks = 0;
  for (let i = 13; i >= 0; i--) {
    const at = now - i * DAY;
    const key = dayKey(at);
    const focusMinutes = stats.focusMinutes[key] ?? 0;
    const blocks = stats.blocks[key] ?? 0;
    if (i >= 7) {
      prevFocusMinutes += focusMinutes;
      prevBlocks += blocks;
    } else {
      days.push({ key, dow: new Date(at).getDay(), focusMinutes, blocks, isToday: i === 0 });
    }
  }
  return {
    days,
    focusMinutes: days.reduce((n, d) => n + d.focusMinutes, 0),
    blocks: days.reduce((n, d) => n + d.blocks, 0),
    prevFocusMinutes,
    prevBlocks,
    focusDays: days.filter((d) => d.focusMinutes > 0).length,
  };
}

export type WeekHeadline =
  | { kind: 'empty' }
  | { kind: 'better'; days: number }
  | { kind: 'most'; days: number }
  | { kind: 'some'; days: number }
  | { kind: 'caught' };

/** Which short, honest sentence describes the week. Never shames a quiet week. */
export function weekHeadline(w: WeekInsight): WeekHeadline {
  if (w.focusMinutes === 0 && w.blocks === 0) return { kind: 'empty' };
  if (w.prevFocusMinutes > 0 && w.focusMinutes > w.prevFocusMinutes) return { kind: 'better', days: w.focusDays };
  if (w.focusDays >= 5) return { kind: 'most', days: w.focusDays };
  if (w.focusDays > 0) return { kind: 'some', days: w.focusDays };
  return { kind: 'caught' };
}

/** How long the "fresh start" message shows after an escape. */
export const FRESH_START_MS = 3 * DAY;

/**
 * After switching Unscroll off, the streak resets. Instead of only showing
 * "0 days", offer a fresh start for a few days: lapses are normal, and
 * shame makes people quit the habit entirely.
 */
export function freshStart(escapes: EscapeEvent[], streak: Streak, now: number): { best: number } | null {
  if (streak.current > 0) return null;
  const last = escapes[escapes.length - 1];
  if (!last || now - last.at < 0 || now - last.at > FRESH_START_MS) return null;
  return { best: streak.best };
}

/** Number of offline suggestions (translated as alt_0 … alt_N-1). */
export const ALTERNATIVE_COUNT = 7;

/** Stable for a given seed (e.g. the lock's end time), so it doesn't flicker every second. */
export function alternativeIndex(seed: number): number {
  return Math.abs(Math.floor(seed / 60_000)) % ALTERNATIVE_COUNT;
}
