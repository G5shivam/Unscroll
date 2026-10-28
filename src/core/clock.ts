import type { ClockSample, ClockState } from './types';

/**
 * Tamper-resistant clock.
 *
 * Threat: the user changes the phone's date/time to end a Focus lock early.
 *
 * - Same boot: trusted time = anchor + monotonic delta. The wall clock is
 *   ignored entirely, so changing it does nothing.
 * - After a reboot the monotonic clock restarts. We then accept, in order:
 *     1. network time (Android 13+), if present;
 *     2. the wall clock, if the OS guarantees it is set automatically;
 *     3. otherwise a conservative lower bound: last trusted time + time since
 *        boot (assumes the phone was off for zero time). This can only make a
 *        lock last longer, never shorter ("fail closed").
 * - Trusted time never moves backwards.
 */
export function readTrustedTime(
  prev: ClockState | null,
  s: ClockSample,
): { trusted: number; state: ClockState } {
  if (!isFiniteSample(s)) {
    // A broken platform reading: never move time forward on bad data.
    const t = prev ? prev.lastTrusted : 0;
    return { trusted: t, state: prev ?? fresh(s, t) };
  }

  if (prev === null) {
    const t = s.networkMs ?? s.wallMs;
    return { trusted: t, state: fresh(s, t) };
  }

  const sameBoot = s.bootId === prev.bootId && s.monoMs >= prev.anchorMono;
  if (sameBoot) {
    const t = Math.max(prev.lastTrusted, prev.anchorTrusted + (s.monoMs - prev.anchorMono));
    return { trusted: t, state: { ...prev, lastTrusted: t } };
  }

  // Rebooted (or monotonic clock went backwards, which we treat the same way).
  const lowerBound = prev.lastTrusted + Math.max(0, s.monoMs);
  let candidate: number;
  if (s.networkMs !== null) candidate = s.networkMs;
  else if (s.wallTrusted) candidate = s.wallMs;
  else candidate = lowerBound;

  const t = Math.max(candidate, prev.lastTrusted);
  return {
    trusted: t,
    state: { anchorMono: s.monoMs, anchorTrusted: t, bootId: s.bootId, lastTrusted: t },
  };
}

function fresh(s: ClockSample, t: number): ClockState {
  return { anchorMono: s.monoMs, anchorTrusted: t, bootId: s.bootId, lastTrusted: t };
}

function isFiniteSample(s: ClockSample): boolean {
  return (
    Number.isFinite(s.wallMs) &&
    Number.isFinite(s.monoMs) &&
    s.monoMs >= 0 &&
    typeof s.bootId === 'string' &&
    s.bootId.length > 0 &&
    (s.networkMs === null || Number.isFinite(s.networkMs))
  );
}
