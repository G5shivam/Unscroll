/**
 * Integration: controller + engine + simulated enforcer + storage.
 */
import { COOLING_OFF_MS } from '../src/core/constants';
import { SimulatedBlocker } from '../src/native/simulated';
import { UnscrollController, type KeyValueStorage } from '../src/state/controller';
import { STORAGE_KEY } from '../src/state/persist';
import { FakeClock, HOUR, MIN, at, testEnv } from './helpers';

class MemoryStorage implements KeyValueStorage {
  data = new Map<string, string>();
  fail = false;
  async getItem(k: string) {
    if (this.fail) throw new Error('disk');
    return this.data.get(k) ?? null;
  }
  async setItem(k: string, v: string) {
    if (this.fail) throw new Error('disk');
    this.data.set(k, v);
  }
}

function setup(start = at(6, 12)) {
  const clock = new FakeClock(start);
  const blocker = new SimulatedBlocker(
    () => clock.wall,
    () => clock.mono,
  );
  const storage = new MemoryStorage();
  const ctrl = new UnscrollController(blocker, storage, testEnv);
  return { clock, blocker, storage, ctrl };
}

async function onboard(ctrl: UnscrollController, blocker: SimulatedBlocker) {
  await ctrl.init();
  await ctrl.acceptDisclosure();
  await blocker.requestPermission();
  await ctrl.completeOnboarding();
}

describe('UnscrollController', () => {
  test('onboarding arms enforcement and pushes the policy to the enforcer', async () => {
    const { ctrl, blocker, storage } = setup();
    await onboard(ctrl, blocker);
    const snap = ctrl.getSnapshot();
    expect(snap.ready).toBe(true);
    expect(snap.state.onboarded).toBe(true);
    expect(snap.state.enforcementArmed).toBe(true);
    expect(blocker.policy?.surfaces.reels).toBe(true);
    expect(JSON.parse(storage.data.get(STORAGE_KEY)!).onboarded).toBe(true);
  });

  test('starting focus reaches the enforcer and survives a restart', async () => {
    const { ctrl, blocker, storage, clock } = setup();
    await onboard(ctrl, blocker);
    expect(await ctrl.startFocus(HOUR)).toEqual({ ok: true, applied: 'now' });
    expect(blocker.sessions).toHaveLength(1);
    expect(ctrl.getSnapshot().focus.active).toBe(true);

    clock.advance(10 * MIN);
    const again = new UnscrollController(blocker, storage, testEnv);
    await again.init();
    const f = again.getSnapshot().focus;
    expect(f.active).toBe(true);
    if (f.active) expect(f.remainingMs).toBe(50 * MIN);
  });

  test('a loosening is registered with the enforcer, which only accepts it after 24 hours', async () => {
    const { ctrl, blocker, clock } = setup();
    await onboard(ctrl, blocker);
    const r = await ctrl.setSurface('reels', false);
    expect(r).toMatchObject({ ok: true, applied: 'pending' });
    expect(blocker.grants).toHaveLength(1);

    // A premature push is refused by the enforcer's own ratchet.
    const early = await blocker.applyPolicy(
      { ...blocker.policy!, surfaces: { ...blocker.policy!.surfaces, reels: false } },
      blocker.grants.map((g) => ({ ...g, waitedMs: 0 })),
    );
    expect(early.accepted).toBe(false);

    clock.advance(COOLING_OFF_MS);
    await ctrl.tick();
    expect(ctrl.getSnapshot().state.policy.surfaces.reels).toBe(false);
    expect(blocker.policy?.surfaces.reels).toBe(false);
  });

  test('turning the blocker off after onboarding is recorded as an escape', async () => {
    const { ctrl, blocker } = setup();
    await onboard(ctrl, blocker);
    blocker.enabled = false;
    await ctrl.refreshStatus();
    const s = ctrl.getSnapshot().state;
    expect(s.escapes).toHaveLength(1);
    expect(s.enforcementArmed).toBe(false);
  });

  test('blocked attempts reported by the enforcer are counted', async () => {
    const { ctrl, blocker, clock } = setup();
    await onboard(ctrl, blocker);
    blocker.pendingBlocks = 3;
    clock.advance(1000);
    await ctrl.tick();
    const day = testEnv.dayKey(ctrl.getSnapshot().now);
    expect(ctrl.getSnapshot().state.stats.blocks[day]).toBe(3);
  });

  test('broken storage does not crash the app or drop the lock in memory', async () => {
    const { ctrl, blocker, storage } = setup();
    storage.fail = true;
    await onboard(ctrl, blocker);
    expect((await ctrl.startFocus(HOUR)).ok).toBe(true);
    expect(ctrl.getSnapshot().focus.active).toBe(true);
  });

  test('concurrent actions are serialised', async () => {
    const { ctrl, blocker } = setup();
    await onboard(ctrl, blocker);
    const results = await Promise.all([
      ctrl.addSchedule({ id: 'a', name: 'A', days: 1, startMin: 0, endMin: 60 }),
      ctrl.addSchedule({ id: 'b', name: 'B', days: 2, startMin: 0, endMin: 60 }),
      ctrl.tick(),
      ctrl.addSchedule({ id: 'c', name: 'C', days: 4, startMin: 0, endMin: 60 }),
    ]);
    expect(results.filter((r) => r && (r as { ok: boolean }).ok)).toHaveLength(3);
    expect(ctrl.getSnapshot().state.policy.schedules.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });

  test('subscribers are notified on change', async () => {
    const { ctrl, blocker } = setup();
    const fn = jest.fn();
    ctrl.subscribe(fn);
    await onboard(ctrl, blocker);
    expect(fn).toHaveBeenCalled();
  });
});
