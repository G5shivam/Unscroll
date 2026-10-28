import {
  addSchedule,
  cancelPending,
  deleteSchedule,
  focusStatus,
  nativePolicy,
  reconcileEnforcement,
  recordBlock,
  setSurface,
  startSession,
  sync,
  updateSchedule,
  type Env,
} from '../core/engine';
import { realEnv } from '../core/env';
import type { LooseningGrant } from '../core/ratchet';
import type { AppState, EngineError, FocusStatus, PendingChange, Surface } from '../core/types';
import type { Blocker, BlockerStatus } from '../native/types';
import { parseState, serializeState, STORAGE_KEY } from './persist';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface Snapshot {
  ready: boolean;
  state: AppState;
  now: number;
  focus: FocusStatus;
  status: BlockerStatus | null;
  /** False while the enforcer has not yet accepted the latest policy (being retried). */
  enforcerSynced: boolean;
}

export type ActionResult =
  | { ok: true; applied: 'now' | 'pending'; effectiveAt?: number }
  | { ok: false; error: EngineError | 'enforcer-refused' };

const SAVE_EVERY_MS = 5_000;

/**
 * Glue between the pure engine, the platform blocker and storage.
 * Every user action runs through the engine first; the result is then pushed
 * to the native enforcer, which independently re-checks it.
 */
export class UnscrollController {
  private state: AppState = parseState(null);
  private now = 0;
  private status: BlockerStatus | null = null;
  private ready = false;
  private snapshot: Snapshot;
  private listeners = new Set<() => void>();
  private lastSave = 0;
  /** Set when the enforcer refused a push; retried every tick with these grants. */
  private retryGrants: LooseningGrant[] | null = null;
  private lastCleanBlockAt = -Infinity;
  private busy: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly blocker: Blocker,
    private readonly storage: KeyValueStorage,
    private readonly env: Env = realEnv,
  ) {
    this.snapshot = this.buildSnapshot();
  }

  subscribe = (fn: () => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  getSnapshot = (): Snapshot => this.snapshot;

  private buildSnapshot(): Snapshot {
    return {
      ready: this.ready,
      state: this.state,
      now: this.now,
      focus: this.ready ? focusStatus(this.state, this.now, this.env) : { active: false },
      status: this.status,
      enforcerSynced: this.retryGrants === null,
    };
  }

  private emit() {
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  /** Serialise all mutations so overlapping ticks/actions cannot race. */
  private exclusive<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.busy.then(fn, fn);
    this.busy = run.catch(() => undefined);
    return run;
  }

  async init(): Promise<void> {
    return this.exclusive(async () => {
      let raw: string | null = null;
      try {
        raw = await this.storage.getItem(STORAGE_KEY);
      } catch {
        raw = null;
      }
      this.state = parseState(raw);
      await this.syncNow();
      await this.refreshStatusInner();
      if (this.state.onboarded) await this.pushPolicy();
      this.ready = true;
      await this.save(true);
      this.emit();
    });
  }

  tick(): Promise<void> {
    return this.exclusive(async () => {
      await this.syncNow();
      await this.save(false);
      this.emit();
    });
  }

  refreshStatus(): Promise<void> {
    return this.exclusive(async () => {
      await this.refreshStatusInner();
      this.emit();
    });
  }

  private async syncNow() {
    const sample = await this.blocker.getClockSample();
    const pendingBefore = this.state.pending;
    const r = sync(this.state, sample, this.env);
    this.state = r.state;
    this.now = r.now;
    if (r.appliedPending.length > 0) {
      const applied = new Set(r.appliedPending);
      await this.pushPolicy(pendingBefore.filter((p) => applied.has(p.id)).map(toGrant));
      // Changes dropped as a side effect (e.g. edits to a removed schedule) are withdrawn natively too.
      await this.cancelDropped(pendingBefore, applied);
    } else if (this.retryGrants) {
      // The enforcer measures its own wait and may mature a moment after us: retry.
      await this.pushPolicy([]);
    }
    let blocks = 0;
    try {
      blocks = await this.blocker.takeBlockCount();
    } catch {
      blocks = 0;
    }
    for (let i = 0; i < Math.min(blocks, 1000); i++) this.state = recordBlock(this.state, this.now, this.env);
  }

  private async refreshStatusInner() {
    try {
      this.status = await this.blocker.getStatus();
    } catch {
      this.status = null;
      return;
    }
    if (!this.state.onboarded) return;
    const r = reconcileEnforcement(this.state, this.status.blockerEnabled, this.now, this.env);
    this.state = r.state;
    if (r.escaped) await this.save(true);
  }

  /**
   * Push the current policy; `grants` justify any loosening it contains.
   * If the enforcer refuses (e.g. its own 24 h wait ends a second after ours),
   * the grants are kept and the push is retried on every tick until accepted,
   * so the two sides cannot drift apart permanently.
   */
  private async pushPolicy(grants: LooseningGrant[] = []): Promise<boolean> {
    const all = [...(this.retryGrants ?? []), ...grants.filter((g) => !this.retryGrants?.some((x) => x.id === g.id))];
    let accepted = false;
    try {
      accepted = (await this.blocker.applyPolicy(nativePolicy(this.state), all)).accepted;
    } catch {
      accepted = false;
    }
    this.retryGrants = accepted ? null : all;
    return accepted;
  }

  private async cancelDropped(before: PendingChange[], keep: Set<string>) {
    const now = new Set(this.state.pending.map((p) => p.id));
    for (const p of before) {
      if (!now.has(p.id) && !keep.has(p.id)) await this.blocker.cancelLoosening(p.id).catch(() => undefined);
    }
  }

  private async save(force: boolean) {
    if (!force && this.now - this.lastSave < SAVE_EVERY_MS) return;
    this.lastSave = this.now;
    try {
      await this.storage.setItem(STORAGE_KEY, serializeState(this.state));
    } catch {
      // Storage full or unavailable: the native enforcer still holds the lock.
    }
  }

  // --- user actions ----------------------------------------------------------

  acceptDisclosure(): Promise<void> {
    return this.exclusive(async () => {
      this.state = { ...this.state, consentAt: this.now };
      await this.save(true);
      this.emit();
    });
  }

  completeOnboarding(): Promise<void> {
    return this.exclusive(async () => {
      this.state = { ...this.state, onboarded: true };
      await this.refreshStatusInner();
      await this.pushPolicy();
      await this.save(true);
      this.emit();
    });
  }

  requestPermission(): Promise<void> {
    return this.exclusive(async () => {
      await this.blocker.requestPermission();
      await this.refreshStatusInner();
      this.emit();
    });
  }

  /** Optional battery-optimisation screen (Android). Failures are ignored. */
  openBatterySettings(): Promise<void> {
    return this.blocker.openBatterySettings().catch(() => undefined);
  }

  pickApps(): Promise<number> {
    return this.exclusive(async () => {
      const r = await this.blocker.pickApps();
      await this.refreshStatusInner();
      this.emit();
      return r.selectedCount;
    });
  }

  /** Initial blocking choices during onboarding (before any lock exists). */
  setInitialSurfaces(surfaces: Record<Surface, boolean>): Promise<void> {
    return this.exclusive(async () => {
      if (this.state.onboarded) return;
      this.state = { ...this.state, policy: { ...this.state.policy, surfaces: { ...surfaces } } };
      this.emit();
    });
  }

  startFocus(durationMs: number): Promise<ActionResult> {
    return this.exclusive(async () => {
      const sample = await this.blocker.getClockSample();
      const synced = sync(this.state, sample, this.env);
      this.state = synced.state;
      this.now = synced.now;
      const r = startSession(this.state, durationMs, sample, this.now, this.env);
      if (!r.ok) return { ok: false, error: r.error } as ActionResult;
      this.state = r.value;
      const sess = this.state.sessions.find((s) => !s.completed)!;
      const native = await this.blocker.startSession(sess.id, sess.durationMs - sess.consumedMs).catch(() => ({
        accepted: false,
      }));
      await this.save(true);
      this.emit();
      return native.accepted ? { ok: true, applied: 'now' } : ({ ok: false, error: 'enforcer-refused' } as const);
    });
  }

  addSchedule(input: unknown): Promise<ActionResult> {
    return this.mutate(async () => {
      const r = addSchedule(this.state, input);
      if (!r.ok) return { ok: false, error: r.error };
      this.state = r.value;
      await this.pushPolicy();
      return { ok: true, applied: 'now' };
    });
  }

  updateSchedule(input: unknown): Promise<ActionResult> {
    return this.mutate(async () => {
      const r = updateSchedule(this.state, input, this.now, this.env);
      return this.afterChange(r);
    });
  }

  deleteSchedule(id: string): Promise<ActionResult> {
    return this.mutate(async () => this.afterChange(deleteSchedule(this.state, id, this.now, this.env)));
  }

  setSurface(surface: Surface, blocked: boolean): Promise<ActionResult> {
    return this.mutate(async () => this.afterChange(setSurface(this.state, surface, blocked, this.now, this.env)));
  }

  cancelPending(id: string): Promise<void> {
    return this.exclusive(async () => {
      this.state = cancelPending(this.state, id);
      await this.blocker.cancelLoosening(id).catch(() => undefined);
      await this.save(true);
      this.emit();
    });
  }

  /** A blocked route inside the Clean Instagram view (iOS). Rate-limited: the page could spam it. */
  recordCleanBlock(): Promise<void> {
    return this.exclusive(async () => {
      if (this.now - this.lastCleanBlockAt < 1000) return;
      this.lastCleanBlockAt = this.now;
      this.state = recordBlock(this.state, this.now, this.env);
      this.emit();
    });
  }

  private mutate(fn: () => Promise<ActionResult>): Promise<ActionResult> {
    return this.exclusive(async () => {
      const before = this.state.pending;
      const res = await fn();
      await this.cancelDropped(before, new Set());
      await this.save(true);
      this.emit();
      return res;
    });
  }

  private async afterChange(
    r: ReturnType<typeof setSurface> | ReturnType<typeof updateSchedule>,
  ): Promise<ActionResult> {
    if (!r.ok) return { ok: false, error: r.error };
    this.state = r.value.state;
    if (r.value.applied === 'pending') {
      const p = this.state.pending.find((x) => x.id === r.value.pendingId);
      if (p) {
        const { waitedMs: _ignored, ...grant } = toGrant(p);
        try {
          await this.blocker.registerLoosening(grant);
        } catch {
          // The enforcer refused it, so it would never accept this change: withdraw it.
          this.state = cancelPending(this.state, p.id);
          return { ok: false, error: 'enforcer-refused' };
        }
      }
      return { ok: true, applied: 'pending', effectiveAt: p?.effectiveAt };
    }
    await this.pushPolicy();
    return { ok: true, applied: 'now' };
  }
}

function toGrant(p: PendingChange): LooseningGrant {
  return { id: p.id, kind: p.kind, surface: p.surface, scheduleId: p.scheduleId, waitedMs: p.waitedMs };
}
