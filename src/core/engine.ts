import { readTrustedTime } from './clock';
import {
  COOLING_OFF_MS,
  DAY,
  MAX_ESCAPES,
  MAX_PENDING,
  MAX_SCHEDULES,
  MAX_SESSION_HISTORY,
  MINUTE,
  STATS_RETENTION_DAYS,
} from './constants';
import {
  coversSuperset,
  minutesUntilEnd,
  sameSchedule,
  validateSchedule,
  type LocalTime,
} from './schedule';
import { isValidDuration, newSession, remainingMs, tickSession, tickWait } from './session';
import type {
  AppState,
  ClockSample,
  EscapeKind,
  FocusStatus,
  PendingChange,
  Policy,
  Result,
  Schedule,
  Session,
  Surface,
} from './types';

/** Platform services the pure engine needs. Injected so tests are deterministic. */
export interface Env {
  toLocal(ms: number): LocalTime;
  dayKey(ms: number): string;
  newId(): string;
}

export const DEFAULT_POLICY: Policy = {
  surfaces: { feed: true, reels: true, explore: true, stories: false },
  schedules: [],
};

export function initialState(): AppState {
  return {
    version: 1,
    onboarded: false,
    consentAt: null,
    policy: { surfaces: { ...DEFAULT_POLICY.surfaces }, schedules: [] },
    pending: [],
    sessions: [],
    windowLocks: [],
    clock: null,
    stats: { blocks: {}, focusMinutes: {} },
    escapes: [],
    streak: { current: 0, best: 0, lastDay: null },
    enforcementArmed: false,
  };
}

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: import('./types').EngineError): Result<T> => ({ ok: false, error });

export function activeSession(state: AppState): Session | undefined {
  return state.sessions.find((s) => !s.completed && remainingMs(s) > 0);
}

/** What is locked right now, and until when. */
export function focusStatus(state: AppState, now: number, env: Env): FocusStatus {
  let best: FocusStatus = { active: false };
  const sess = activeSession(state);
  if (sess) {
    const rem = remainingMs(sess);
    best = { active: true, source: 'session', endsAt: now + rem, remainingMs: rem, sessionId: sess.id };
  }
  for (const lock of state.windowLocks) {
    const rem = remainingMs(lock);
    if (rem <= 0) continue;
    if (!best.active || now + rem > best.endsAt) {
      best = { active: true, source: 'schedule', endsAt: now + rem, remainingMs: rem, scheduleId: lock.id };
    }
  }
  const local = env.toLocal(now);
  const minuteStart = now - (((now % MINUTE) + MINUTE) % MINUTE);
  for (const s of state.policy.schedules) {
    const mins = minutesUntilEnd(s, local);
    if (mins < 0) continue;
    const endsAt = minuteStart + mins * MINUTE;
    if (!best.active || endsAt > best.endsAt) {
      best = { active: true, source: 'schedule', endsAt, remainingMs: endsAt - now, scheduleId: s.id };
    }
  }
  return best;
}

/** Is a specific schedule the one currently holding a lock? */
export function isScheduleRunning(state: AppState, id: string, now: number, env: Env): boolean {
  if (state.windowLocks.some((l) => l.id === id && remainingMs(l) > 0)) return true;
  const s = state.policy.schedules.find((x) => x.id === id);
  return !!s && minutesUntilEnd(s, env.toLocal(now)) >= 0;
}

export interface SyncResult {
  state: AppState;
  now: number;
  completedSessions: string[];
  appliedPending: string[];
}

/**
 * Advance the engine to the current clock reading: update trusted time, tick
 * sessions, record completions, and apply matured pending changes.
 */
export function sync(prev: AppState, sample: ClockSample, env: Env): SyncResult {
  const { trusted: now, state: clock } = readTrustedTime(prev.clock, sample);
  let state: AppState = { ...prev, clock, pending: prev.pending.map((p) => tickWait(p, sample)) };

  // Running schedule windows: tick their monotonic locks, record completions,
  // then open or extend a lock for every window active right now.
  const finishedWindows: Session[] = [];
  let windowLocks = state.windowLocks.map((l) => {
    const t = tickSession(l, sample);
    if (t.completed && !l.completed) finishedWindows.push(t);
    return t;
  });
  const local = env.toLocal(now);
  const intoMinute = ((now % MINUTE) + MINUTE) % MINUTE;
  for (const s of state.policy.schedules) {
    const mins = minutesUntilEnd(s, local);
    if (mins < 0) continue;
    const rem = mins * MINUTE - intoMinute;
    const live = windowLocks.find((l) => l.id === s.id && remainingMs(l) > 0);
    if (!live) windowLocks = [...windowLocks.filter((l) => l.id !== s.id || l.completed), newSession(s.id, rem, sample, now)];
    else if (remainingMs(live) < rem) {
      // Never shorten; extend if the window grew (or the clock went back).
      windowLocks = windowLocks.map((l) => (l === live ? { ...l, durationMs: l.consumedMs + rem } : l));
    }
  }
  state = { ...state, windowLocks };
  for (const w of finishedWindows) {
    state = recordCompletion(state, now, Math.round(w.durationMs / MINUTE), env);
  }

  const completedSessions: string[] = [];
  const sessions = state.sessions.map((s) => {
    const t = tickSession(s, sample);
    if (t.completed && !s.completed) completedSessions.push(t.id);
    return t;
  });
  state = { ...state, sessions };
  for (const id of completedSessions) {
    const s = sessions.find((x) => x.id === id)!;
    state = recordCompletion(state, now, Math.round(s.durationMs / MINUTE), env);
  }

  const applied = applyDuePending(state, now, env);
  state = applied.state;
  state = prune(state);
  return { state, now, completedSessions, appliedPending: applied.applied };
}

function recordCompletion(state: AppState, now: number, minutes: number, env: Env): AppState {
  const day = env.dayKey(now);
  const yesterday = env.dayKey(now - DAY);
  const { streak } = state;
  let current = streak.current;
  if (streak.lastDay === day) {
    // already counted today
  } else if (streak.lastDay === yesterday) current += 1;
  else current = 1;
  return {
    ...state,
    streak: { current, best: Math.max(streak.best, current), lastDay: day },
    stats: {
      ...state.stats,
      focusMinutes: {
        ...state.stats.focusMinutes,
        [day]: (state.stats.focusMinutes[day] ?? 0) + Math.max(0, minutes),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Sessions (Rule 2)
// ---------------------------------------------------------------------------

/**
 * Start a one-off Focus session. If a session is already running, the new
 * duration may only extend it — there is deliberately no stop or shorten API.
 */
export function startSession(
  state: AppState,
  durationMs: number,
  sample: ClockSample,
  now: number,
  env: Env,
): Result<AppState> {
  if (!isValidDuration(durationMs)) return fail('invalid');
  const current = activeSession(state);
  if (current) {
    const rem = remainingMs(current);
    if (durationMs <= rem) return fail('would-shorten');
    const extended: Session = { ...current, durationMs: current.consumedMs + durationMs };
    return ok({ ...state, sessions: state.sessions.map((s) => (s.id === current.id ? extended : s)) });
  }
  const sess = newSession(env.newId(), durationMs, sample, now);
  return ok({ ...state, sessions: [...state.sessions, sess] });
}

// ---------------------------------------------------------------------------
// Schedules
// ---------------------------------------------------------------------------

export function addSchedule(state: AppState, input: unknown): Result<AppState> {
  const v = validateSchedule(input);
  if (!v.ok) return fail('invalid');
  if (state.policy.schedules.length >= MAX_SCHEDULES) return fail('too-many');
  if (state.policy.schedules.some((s) => s.id === v.value.id)) return fail('invalid');
  // Adding a schedule only ever blocks more: applies immediately.
  return ok({ ...state, policy: { ...state.policy, schedules: [...state.policy.schedules, v.value] } });
}

export type ChangeOutcome = { state: AppState; applied: 'now' | 'pending'; pendingId?: string };

/** Edit a schedule. Stricter edits apply now; looser ones wait 24 h. */
export function updateSchedule(
  state: AppState,
  input: unknown,
  now: number,
  env: Env,
): Result<ChangeOutcome> {
  const v = validateSchedule(input);
  if (!v.ok) return fail('invalid');
  const next = v.value;
  const prev = state.policy.schedules.find((s) => s.id === next.id);
  if (!prev) return fail('not-found');
  if (sameSchedule(prev, next)) return ok({ state, applied: 'now' });

  const nameOnly = prev.days === next.days && prev.startMin === next.startMin && prev.endMin === next.endMin;
  if (nameOnly || coversSuperset(prev, next)) {
    const schedules = state.policy.schedules.map((s) => (s.id === next.id ? next : s));
    // A stricter edit supersedes any pending loosening for this schedule.
    const pending = state.pending.filter((p) => p.scheduleId !== next.id || p.kind === 'schedule-delete');
    return ok({ state: { ...state, policy: { ...state.policy, schedules }, pending }, applied: 'now' });
  }
  if (isScheduleRunning(state, prev.id, now, env)) return fail('locked');
  return queue(state, { kind: 'schedule-edit', scheduleId: prev.id, next }, now, env);
}

/** Delete a schedule: always a loosening, so it waits 24 h. Refused while it is running. */
export function deleteSchedule(state: AppState, id: string, now: number, env: Env): Result<ChangeOutcome> {
  const prev = state.policy.schedules.find((s) => s.id === id);
  if (!prev) return fail('not-found');
  if (isScheduleRunning(state, id, now, env)) return fail('locked');
  return queue(state, { kind: 'schedule-delete', scheduleId: id }, now, env);
}

// ---------------------------------------------------------------------------
// Surfaces (Rule 1)
// ---------------------------------------------------------------------------

export function setSurface(
  state: AppState,
  surface: Surface,
  blocked: boolean,
  now: number,
  env: Env,
): Result<ChangeOutcome> {
  if (!(surface in state.policy.surfaces)) return fail('invalid');
  const current = state.policy.surfaces[surface];
  if (blocked) {
    // Blocking more is immediate and cancels a pending unblock.
    const pending = state.pending.filter((p) => !(p.kind === 'surface-off' && p.surface === surface));
    const surfaces = { ...state.policy.surfaces, [surface]: true };
    return ok({ state: { ...state, policy: { ...state.policy, surfaces }, pending }, applied: 'now' });
  }
  if (!current) return ok({ state, applied: 'now' });
  return queue(state, { kind: 'surface-off', surface }, now, env);
}

// ---------------------------------------------------------------------------
// Pending changes (cooling-off)
// ---------------------------------------------------------------------------

function queue(
  state: AppState,
  change: Pick<PendingChange, 'kind' | 'surface' | 'scheduleId' | 'next'>,
  now: number,
  env: Env,
): Result<ChangeOutcome> {
  // One pending change per target. A newer request replaces the older one and
  // restarts the 24-hour wait from now, so a fresh (possibly looser) request
  // can never inherit an older request's head start.
  const sameTarget = (p: PendingChange) =>
    change.surface !== undefined ? p.surface === change.surface : p.scheduleId === change.scheduleId;
  const others = state.pending.filter((p) => !sameTarget(p));
  if (others.length >= MAX_PENDING) return fail('too-many');
  // Start counting from the monotonic reading behind `now` (exact on the same boot).
  const c = state.clock;
  const p: PendingChange = {
    id: env.newId(),
    ...change,
    requestedAt: now,
    effectiveAt: now + COOLING_OFF_MS,
    waitedMs: 0,
    lastMono: c ? c.anchorMono + (now - c.anchorTrusted) : null,
    lastBootId: c ? c.bootId : null,
  };
  return ok({ state: { ...state, pending: [...others, p] }, applied: 'pending', pendingId: p.id });
}

/** Cancelling a loosening request is a stricter action: always allowed. */
export function cancelPending(state: AppState, id: string): AppState {
  return { ...state, pending: state.pending.filter((p) => p.id !== id) };
}

export function applyDuePending(
  state: AppState,
  now: number,
  env: Env,
): { state: AppState; applied: string[] } {
  if (focusStatus(state, now, env).active) return { state, applied: [] };
  const due = state.pending.filter((p) => p.waitedMs >= COOLING_OFF_MS).sort((a, b) => a.requestedAt - b.requestedAt);
  if (due.length === 0) return { state, applied: [] };

  let policy = state.policy;
  let pending = state.pending;
  const applied: string[] = [];
  for (const p of due) {
    pending = pending.filter((x) => x.id !== p.id);
    if (p.kind === 'surface-off' && p.surface) {
      policy = { ...policy, surfaces: { ...policy.surfaces, [p.surface]: false } };
    } else if (p.kind === 'schedule-delete' && p.scheduleId) {
      policy = { ...policy, schedules: policy.schedules.filter((s) => s.id !== p.scheduleId) };
      pending = pending.filter((x) => x.scheduleId !== p.scheduleId);
    } else if (p.kind === 'schedule-edit' && p.next) {
      const v = validateSchedule(p.next);
      if (!v.ok || !policy.schedules.some((s) => s.id === v.value.id)) continue;
      policy = { ...policy, schedules: policy.schedules.map((s) => (s.id === v.value.id ? v.value : s)) };
    } else continue;
    applied.push(p.id);
  }
  return { state: { ...state, policy, pending }, applied };
}

// ---------------------------------------------------------------------------
// Stats, escapes, housekeeping
// ---------------------------------------------------------------------------

export function recordBlock(state: AppState, now: number, env: Env): AppState {
  const day = env.dayKey(now);
  return {
    ...state,
    stats: { ...state.stats, blocks: { ...state.stats.blocks, [day]: (state.stats.blocks[day] ?? 0) + 1 } },
  };
}

/**
 * Called whenever the platform reports whether the blocker is enabled.
 * A blocker that was armed and is now off is an escape (PRD FR-11).
 */
export function reconcileEnforcement(
  state: AppState,
  blockerEnabled: boolean,
  now: number,
  env: Env,
): { state: AppState; escaped: boolean } {
  if (blockerEnabled) {
    return { state: state.enforcementArmed ? state : { ...state, enforcementArmed: true }, escaped: false };
  }
  if (!state.enforcementArmed) return { state, escaped: false };
  return { state: recordEscape(state, 'permission-revoked', now, env), escaped: true };
}

export function recordEscape(state: AppState, kind: EscapeKind, now: number, env: Env): AppState {
  const duringFocus = focusStatus(state, now, env).active;
  return {
    ...state,
    enforcementArmed: false,
    escapes: [...state.escapes, { kind, at: now, duringFocus }].slice(-MAX_ESCAPES),
    streak: { ...state.streak, current: 0 },
  };
}

function prune(state: AppState): AppState {
  const finished = state.sessions.filter((s) => s.completed);
  const live = state.sessions.filter((s) => !s.completed);
  const sessions = [...finished.slice(-MAX_SESSION_HISTORY), ...live];
  const windowLocks = state.windowLocks.filter((l) => !l.completed);
  const keep = (rec: Record<string, number>) => {
    const keys = Object.keys(rec).sort();
    if (keys.length <= STATS_RETENTION_DAYS) return rec;
    const out: Record<string, number> = {};
    for (const k of keys.slice(-STATS_RETENTION_DAYS)) out[k] = rec[k];
    return out;
  };
  return {
    ...state,
    sessions,
    windowLocks,
    stats: { blocks: keep(state.stats.blocks), focusMinutes: keep(state.stats.focusMinutes) },
  };
}

/** The policy the native enforcer should hold right now. */
export function nativePolicy(state: AppState): Policy {
  return {
    surfaces: { ...state.policy.surfaces },
    schedules: state.policy.schedules.map((s: Schedule) => ({ ...s })),
  };
}
