import { MAX_SESSION_MS, MIN_SESSION_MS } from './constants';
import type { ClockSample, Session } from './types';

/**
 * Advance a session by monotonic time.
 *
 * - Same boot: consume the monotonic delta.
 * - After a reboot: consume only the time since this boot (powered-off time
 *   is not counted, so a reboot can only extend a lock, never shorten it).
 * - A monotonic clock that goes backwards on the same boot is treated as a reboot.
 */
export function tickSession(sess: Session, s: Pick<ClockSample, 'monoMs' | 'bootId'>): Session {
  if (sess.completed) return sess;
  if (!Number.isFinite(s.monoMs) || s.monoMs < 0) return sess;

  const sameBoot = s.bootId === sess.lastBootId && s.monoMs >= sess.lastMono;
  const delta = sameBoot ? s.monoMs - sess.lastMono : s.monoMs;
  const consumed = Math.min(sess.durationMs, sess.consumedMs + Math.max(0, delta));
  return {
    ...sess,
    consumedMs: consumed,
    lastMono: s.monoMs,
    lastBootId: s.bootId,
    completed: consumed >= sess.durationMs,
  };
}

/** Anything that accumulates real elapsed time (pending changes, grants). */
export interface Waiting {
  waitedMs: number;
  lastMono: number | null;
  lastBootId: string | null;
}

/** Same counting rules as tickSession: powered-off time never counts. */
export function tickWait<T extends Waiting>(w: T, s: Pick<ClockSample, 'monoMs' | 'bootId'>): T {
  if (!Number.isFinite(s.monoMs) || s.monoMs < 0) return w;
  if (w.lastMono === null || w.lastBootId === null) return { ...w, lastMono: s.monoMs, lastBootId: s.bootId };
  const sameBoot = s.bootId === w.lastBootId && s.monoMs >= w.lastMono;
  const delta = sameBoot ? s.monoMs - w.lastMono : s.monoMs;
  return { ...w, waitedMs: w.waitedMs + Math.max(0, delta), lastMono: s.monoMs, lastBootId: s.bootId };
}

export function remainingMs(sess: Session): number {
  return sess.completed ? 0 : Math.max(0, sess.durationMs - sess.consumedMs);
}

export function isValidDuration(ms: number): boolean {
  return Number.isInteger(ms) && ms >= MIN_SESSION_MS && ms <= MAX_SESSION_MS;
}

export function newSession(
  id: string,
  durationMs: number,
  sample: Pick<ClockSample, 'monoMs' | 'bootId'>,
  trustedNow: number,
): Session {
  return {
    id,
    durationMs,
    consumedMs: 0,
    lastMono: sample.monoMs,
    lastBootId: sample.bootId,
    startedAt: trustedNow,
    completed: false,
  };
}
