import type { Env } from '../src/core/engine';
import type { LocalTime } from '../src/core/schedule';
import type { ClockSample } from '../src/core/types';

/**
 * Deterministic environment: time 0 is Sunday 00:00 "local" (we model local
 * time as UTC so tests do not depend on the machine's time zone).
 */
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;

/** Monday 2026-01-05 00:00 UTC is a Monday; use an epoch-aligned Sunday instead. */
export const SUNDAY = Date.UTC(2026, 0, 4); // Sunday 4 Jan 2026

export function at(dow: number, hh: number, mm = 0, week = 0): number {
  return SUNDAY + week * 7 * DAY + dow * DAY + hh * HOUR + mm * MIN;
}

let ids = 0;
export const testEnv: Env = {
  toLocal(ms: number): LocalTime {
    const d = new Date(ms);
    return { dow: d.getUTCDay(), minute: d.getUTCHours() * 60 + d.getUTCMinutes() };
  },
  dayKey(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  },
  newId(): string {
    ids += 1;
    return `id${ids}`;
  },
};

/** A clock whose wall and monotonic readings move together (same boot). */
export class FakeClock {
  constructor(
    public wall: number,
    public mono = 1_000,
    public bootId = 'boot-1',
  ) {}
  advance(ms: number) {
    this.wall += ms;
    this.mono += ms;
  }
  sample(over: Partial<ClockSample> = {}): ClockSample {
    return { wallMs: this.wall, monoMs: this.mono, bootId: this.bootId, networkMs: null, wallTrusted: true, ...over };
  }
}
