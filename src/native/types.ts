import type { LooseningGrant } from '../core/ratchet';
import type { ClockSample, Policy } from '../core/types';

export type PlatformKind = 'android' | 'ios' | 'web';

export interface BlockerStatus {
  platform: PlatformKind;
  /** Android: Accessibility service on. iOS: Screen Time authorised and Instagram shielded. */
  blockerEnabled: boolean;
  /** iOS only: Screen Time (Family Controls) access granted. */
  authorized?: boolean;
  /** iOS only: number of apps/sites chosen in Apple's picker. */
  selectedCount?: number;
}

export interface ApplyResult {
  accepted: boolean;
  reason?: string;
}

/**
 * The contract every platform blocker implements. Note what is missing on
 * purpose: there is no stopSession, shortenSession or disable call.
 */
export interface Blocker {
  readonly platform: PlatformKind;
  getStatus(): Promise<BlockerStatus>;
  getClockSample(): Promise<ClockSample>;
  /** Android: open Accessibility settings. iOS: request Screen Time access. */
  requestPermission(): Promise<void>;
  /** iOS: present Apple's app picker so the user can select Instagram. */
  pickApps(): Promise<{ selectedCount: number }>;
  /** Hand the policy to the enforcer, which re-checks it with the lock ratchet. */
  applyPolicy(policy: Policy, grants: LooseningGrant[]): Promise<ApplyResult>;
  /** Record a loosening request; the enforcer measures the wait on its own monotonic clock. */
  registerLoosening(grant: Omit<LooseningGrant, 'waitedMs'>): Promise<void>;
  cancelLoosening(id: string): Promise<void>;
  startSession(id: string, durationMs: number): Promise<ApplyResult>;
  /** Number of blocked attempts the enforcer saw since the last call. */
  takeBlockCount(): Promise<number>;
  /** Android: open the battery-optimisation screen for this app. */
  openBatterySettings(): Promise<void>;
}
