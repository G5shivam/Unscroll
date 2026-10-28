import { checkPolicyChange, type LooseningGrant } from '../core/ratchet';
import type { ClockSample, Policy } from '../core/types';
import type { ApplyResult, Blocker, BlockerStatus } from './types';

/**
 * In-memory blocker used on web (preview + E2E) and in unit tests.
 * It runs the same lock ratchet as the native enforcers.
 */
export class SimulatedBlocker implements Blocker {
  readonly platform = 'web' as const;
  enabled = false;
  policy: Policy | null = null;
  /** Grants with the monotonic reading at which the enforcer registered them. */
  grants: (Omit<LooseningGrant, 'waitedMs'> & { registeredMono: number })[] = [];
  sessions: { id: string; durationMs: number }[] = [];
  /** Offset added to both clocks: lets tests and E2E move time forward. */
  offsetMs = 0;
  pendingBlocks = 0;
  private readonly bootId = 'sim-boot';

  constructor(
    private readonly wall: () => number = () => Date.now(),
    private readonly mono: () => number = defaultMono,
  ) {}

  async getStatus(): Promise<BlockerStatus> {
    return { platform: 'web', blockerEnabled: this.enabled };
  }

  async getClockSample(): Promise<ClockSample> {
    return {
      wallMs: this.wall() + this.offsetMs,
      monoMs: this.mono() + this.offsetMs,
      bootId: this.bootId,
      networkMs: null,
      wallTrusted: true,
    };
  }

  async requestPermission(): Promise<void> {
    this.enabled = true;
  }

  async pickApps(): Promise<{ selectedCount: number }> {
    return { selectedCount: 1 };
  }

  async applyPolicy(policy: Policy, grants: LooseningGrant[]): Promise<ApplyResult> {
    if (this.policy) {
      const mono = this.mono() + this.offsetMs;
      const own = this.grants
        .filter((g) => grants.some((x) => x.id === g.id))
        .map(({ registeredMono, ...g }) => ({ ...g, waitedMs: mono - registeredMono }));
      // The simulator does not track focus itself; the engine refuses loosening during focus.
      const d = checkPolicyChange(this.policy, policy, own, false);
      if (!d.ok) return { accepted: false, reason: d.reason };
    }
    this.policy = JSON.parse(JSON.stringify(policy)) as Policy;
    return { accepted: true };
  }

  async registerLoosening(grant: Omit<LooseningGrant, 'waitedMs'>): Promise<void> {
    // One grant per target: a new request restarts the wait (mirrors Enforcer.kt).
    const others = this.grants.filter(
      (g) =>
        g.id !== grant.id &&
        !(grant.surface && g.surface === grant.surface) &&
        !(grant.scheduleId && g.scheduleId === grant.scheduleId),
    );
    if (others.length >= 50) throw new Error('grant refused');
    this.grants = [
      ...this.grants.filter(
        (g) =>
          g.id !== grant.id &&
          !(grant.surface && g.surface === grant.surface) &&
          !(grant.scheduleId && g.scheduleId === grant.scheduleId),
      ),
      { ...grant, registeredMono: this.mono() + this.offsetMs },
    ];
  }

  async cancelLoosening(id: string): Promise<void> {
    this.grants = this.grants.filter((g) => g.id !== id);
  }

  async startSession(id: string, durationMs: number): Promise<ApplyResult> {
    this.sessions.push({ id, durationMs });
    return { accepted: true };
  }

  async takeBlockCount(): Promise<number> {
    const n = this.pendingBlocks;
    this.pendingBlocks = 0;
    return n;
  }

  async openBatterySettings(): Promise<void> {}
}

function defaultMono(): number {
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  return perf ? perf.now() : Date.now();
}
