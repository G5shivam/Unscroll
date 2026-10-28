/**
 * Core domain types for Unscroll.
 *
 * These types are mirrored 1:1 by the Kotlin enforcement core
 * (modules/unscroll-blocker/android/.../core). Shared JSON test vectors in
 * /shared-test-vectors keep the two implementations in agreement.
 */

/** Instagram surfaces that can be blocked outside Focus Hours (PRD Rule 1). */
export type Surface = 'feed' | 'reels' | 'explore' | 'stories';

export const SURFACES: readonly Surface[] = ['feed', 'reels', 'explore', 'stories'] as const;

export type SurfaceSettings = Record<Surface, boolean>;

/** Days are a bitmask: bit 0 = Sunday … bit 6 = Saturday (matches JS Date#getDay). */
export type DayMask = number;

/**
 * A recurring Focus window. `startMin`/`endMin` are minutes after local midnight.
 * When `endMin <= startMin` the window runs overnight and ends the next day.
 * `days` refers to the day the window STARTS on.
 */
export interface Schedule {
  id: string;
  name: string;
  days: DayMask;
  startMin: number;
  endMin: number;
}

/** The enforceable policy shared with the native blocker. */
export interface Policy {
  surfaces: SurfaceSettings;
  schedules: Schedule[];
}

/** One clock reading from the platform. */
export interface ClockSample {
  /** Wall-clock time (user-changeable). */
  wallMs: number;
  /** Monotonic time since boot, including deep sleep. Not user-changeable. */
  monoMs: number;
  /** Identifier that changes on every reboot. */
  bootId: string;
  /** Network-provided time if the OS exposes one (Android 13+), else null. */
  networkMs: number | null;
  /** True when the OS guarantees the wall clock is set automatically. */
  wallTrusted: boolean;
}

/** Persisted state for the tamper-resistant clock. */
export interface ClockState {
  anchorMono: number;
  anchorTrusted: number;
  bootId: string;
  /** Highest trusted time ever returned; trusted time never goes backwards. */
  lastTrusted: number;
}

/**
 * A one-off Focus session. Time is consumed by monotonic ticks, so changing
 * the clock never shortens a session; powered-off time does not count.
 */
export interface Session {
  id: string;
  durationMs: number;
  consumedMs: number;
  /** Monotonic reading at the last tick, and the boot it came from. */
  lastMono: number;
  lastBootId: string;
  /** Trusted wall time when the session started (display only). */
  startedAt: number;
  completed: boolean;
}

export type PendingKind = 'surface-off' | 'schedule-delete' | 'schedule-edit';

/** A loosening change waiting out the 24-hour cooling-off period. */
export interface PendingChange {
  id: string;
  kind: PendingKind;
  surface?: Surface;
  scheduleId?: string;
  next?: Schedule;
  /** Trusted wall time of the request (display only). */
  requestedAt: number;
  /** Expected time it takes effect (display only). */
  effectiveAt: number;
  /**
   * Time actually waited, accumulated from the monotonic clock like a session.
   * Maturity is decided by this, so moving the clock forward never skips the wait.
   */
  waitedMs: number;
  lastMono: number | null;
  lastBootId: string | null;
}

export type EscapeKind = 'uninstall' | 'permission-revoked';

export interface EscapeEvent {
  kind: EscapeKind;
  at: number;
  duringFocus: boolean;
}

export interface Streak {
  current: number;
  best: number;
  /** Local day key (YYYY-MM-DD) of the last completed focus. */
  lastDay: string | null;
}

export interface Stats {
  /** dayKey -> number of blocked attempts. */
  blocks: Record<string, number>;
  /** dayKey -> focus minutes completed. */
  focusMinutes: Record<string, number>;
}

export interface AppState {
  version: 1;
  onboarded: boolean;
  consentAt: number | null;
  policy: Policy;
  pending: PendingChange[];
  sessions: Session[];
  /**
   * A running schedule window becomes a monotonic lock (keyed by schedule id),
   * so changing the clock or time zone mid-window cannot end it early.
   */
  windowLocks: Session[];
  clock: ClockState | null;
  stats: Stats;
  escapes: EscapeEvent[];
  streak: Streak;
  /** Set while the platform blocker is confirmed active; used to detect revokes. */
  enforcementArmed: boolean;
}

export type FocusStatus =
  | { active: false }
  | {
      active: true;
      source: 'session' | 'schedule';
      /** Trusted wall time the lock is expected to lift. */
      endsAt: number;
      remainingMs: number;
      sessionId?: string;
      scheduleId?: string;
    };

export type Result<T> = { ok: true; value: T } | { ok: false; error: EngineError };

export type EngineError =
  | 'locked'
  | 'invalid'
  | 'not-found'
  | 'would-shorten'
  | 'too-many';
