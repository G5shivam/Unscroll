import { Platform } from 'react-native';
import { requireOptionalNativeModule } from 'expo';
import type { LooseningGrant } from '../core/ratchet';
import type { ClockSample, Policy } from '../core/types';
import { SimulatedBlocker } from './simulated';
import type { ApplyResult, Blocker, BlockerStatus } from './types';

export type { Blocker, BlockerStatus, ApplyResult } from './types';

/** Shape of the native module in modules/unscroll-blocker (Kotlin + Swift). */
interface NativeModuleShape {
  getStatus(): Promise<{ blockerEnabled: boolean; authorized?: boolean; selectedCount?: number }>;
  getClockSample(): Promise<ClockSample>;
  requestPermission(): Promise<void>;
  pickApps(): Promise<{ selectedCount: number }>;
  applyPolicy(policyJson: string, grantIdsJson: string): Promise<ApplyResult>;
  registerLoosening(grantJson: string): Promise<void>;
  cancelLoosening(id: string): Promise<void>;
  startSession(id: string, durationMs: number): Promise<ApplyResult>;
  takeBlockCount(): Promise<number>;
  openBatterySettings(): Promise<void>;
}

class NativeBlocker implements Blocker {
  constructor(
    private readonly m: NativeModuleShape,
    readonly platform: 'android' | 'ios',
  ) {}

  async getStatus(): Promise<BlockerStatus> {
    const s = await this.m.getStatus();
    return { platform: this.platform, ...s };
  }
  async getClockSample(): Promise<ClockSample> {
    const s = await this.m.getClockSample();
    // Normalise: a missing networkMs must read as null, never undefined.
    return { ...s, networkMs: typeof s.networkMs === 'number' ? s.networkMs : null };
  }
  requestPermission() {
    return this.m.requestPermission();
  }
  pickApps() {
    return this.m.pickApps();
  }
  applyPolicy(policy: Policy, grants: LooseningGrant[]) {
    // Only grant ids cross the bridge: the enforcer uses its own timestamps.
    return this.m.applyPolicy(JSON.stringify(policy), JSON.stringify(grants.map((g) => g.id)));
  }
  registerLoosening(grant: Omit<LooseningGrant, 'waitedMs'>) {
    return this.m.registerLoosening(JSON.stringify(grant));
  }
  cancelLoosening(id: string) {
    return this.m.cancelLoosening(id);
  }
  startSession(id: string, durationMs: number) {
    return this.m.startSession(id, durationMs);
  }
  takeBlockCount() {
    return this.m.takeBlockCount();
  }
  openBatterySettings() {
    return this.m.openBatterySettings();
  }
}

let instance: Blocker | null = null;

export function getBlocker(): Blocker {
  if (instance) return instance;
  const native =
    Platform.OS === 'web' ? null : requireOptionalNativeModule<NativeModuleShape>('UnscrollBlocker');
  if (native && (Platform.OS === 'android' || Platform.OS === 'ios')) {
    instance = new NativeBlocker(native, Platform.OS);
  } else {
    const sim = new SimulatedBlocker();
    instance = sim;
    installE2EHooks(sim);
  }
  return instance;
}

/** Test-only override. */
export function setBlockerForTests(b: Blocker | null): void {
  instance = b;
}

/**
 * E2E hooks exist only in bundles built with EXPO_PUBLIC_E2E=1. In any other
 * build this whole branch is removed at compile time (verified by a test that
 * scans the production web bundle).
 */
function installE2EHooks(sim: SimulatedBlocker): void {
  if (process.env.EXPO_PUBLIC_E2E === '1') {
    (globalThis as Record<string, unknown>).__unscrollE2E = {
      advance(ms: number) {
        sim.offsetMs += ms;
      },
      setEnabled(on: boolean) {
        sim.enabled = on;
      },
      addBlocks(n: number) {
        sim.pendingBlocks += n;
      },
    };
  }
}
