/**
 * Regression tests for the independent security review (see SECURITY.md).
 */
import { COOLING_OFF_MS } from '../src/core/constants';
import { addSchedule, deleteSchedule, focusStatus, initialState, setSurface, sync, updateSchedule } from '../src/core/engine';
import type { Env } from '../src/core/engine';
import type { AppState, Schedule } from '../src/core/types';
import { SimulatedBlocker } from '../src/native/simulated';
import { UnscrollController } from '../src/state/controller';
import { DAY, FakeClock, HOUR, MIN, at, testEnv } from './helpers';

const study: Schedule = { id: 'study', name: 'Study', days: 0b0111110, startMin: 9 * 60, endMin: 13 * 60 };

function must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

describe('H1: moving the clock forward and rebooting does not skip the 24 h wait', () => {
  test('pending loosening only matures on real elapsed time', () => {
    const clock = new FakeClock(at(6, 12));
    let s: AppState = sync({ ...initialState(), onboarded: true }, clock.sample(), testEnv).state;
    s = must(setSurface(s, 'reels', false, clock.wall, testEnv)).state;

    // Attack: set the date a week ahead, then reboot with a "trusted" wall clock.
    clock.wall += 7 * DAY;
    clock.mono = 5 * MIN;
    clock.bootId = 'boot-2';
    s = sync(s, clock.sample({ wallTrusted: true }), testEnv).state;
    expect(s.policy.surfaces.reels).toBe(true);
    expect(s.pending).toHaveLength(1);

    // Only real time completes the wait.
    clock.advance(COOLING_OFF_MS);
    s = sync(s, clock.sample(), testEnv).state;
    expect(s.policy.surfaces.reels).toBe(false);
  });
});

describe('H2: clock or time-zone changes cannot end a running schedule window', () => {
  /** An env whose time zone can be shifted at runtime. */
  function shiftingEnv(offset: { ms: number }): Env {
    return {
      ...testEnv,
      toLocal: (ms) => testEnv.toLocal(ms + offset.ms),
      dayKey: (ms) => testEnv.dayKey(ms + offset.ms),
    };
  }

  test('changing the time zone mid-window keeps the lock until the window’s real end', () => {
    const offset = { ms: 0 };
    const env = shiftingEnv(offset);
    const clock = new FakeClock(at(1, 10)); // Monday 10:00, study runs 9–13
    let s = must(addSchedule(sync({ ...initialState(), onboarded: true }, clock.sample(), env).state, study));
    s = sync(s, clock.sample(), env).state;
    expect(focusStatus(s, clock.wall, env)).toMatchObject({ active: true, remainingMs: 3 * HOUR });

    offset.ms = 6 * HOUR; // jump to a zone where it is already 16:00
    clock.advance(MIN);
    s = sync(s, clock.sample(), env).state;
    const f = focusStatus(s, clock.wall, env);
    expect(f.active).toBe(true);
    if (f.active) expect(f.remainingMs).toBe(3 * HOUR - MIN);
  });

  test('widening a running window extends its lock; nothing shortens it', () => {
    const clock = new FakeClock(at(1, 10));
    let s = must(addSchedule(sync({ ...initialState(), onboarded: true }, clock.sample(), testEnv).state, study));
    s = sync(s, clock.sample(), testEnv).state;
    s = must(updateSchedule(s, { ...study, endMin: 15 * 60 }, clock.wall, testEnv)).state;
    s = sync(s, clock.sample(), testEnv).state;
    const f = focusStatus(s, clock.wall, testEnv);
    expect(f.active && f.remainingMs).toBe(5 * HOUR);
    expect(deleteSchedule(s, 'study', clock.wall, testEnv)).toEqual({ ok: false, error: 'locked' });
  });
});

describe('H3: app and enforcer cannot drift apart', () => {
  test('a refused push is retried until the enforcer’s own wait has matured', async () => {
    const clock = new FakeClock(at(6, 12));
    const blocker = new SimulatedBlocker(
      () => clock.wall,
      () => clock.mono,
    );
    const mem = new Map<string, string>();
    const ctrl = new UnscrollController(
      blocker,
      { getItem: async (k) => mem.get(k) ?? null, setItem: async (k, v) => void mem.set(k, v) },
      testEnv,
    );
    await ctrl.init();
    await blocker.requestPermission();
    await ctrl.completeOnboarding();
    await ctrl.setSurface('reels', false);

    // The enforcer registered its grant 2 s after the app queued the change.
    blocker.grants = blocker.grants.map((g) => ({ ...g, registeredMono: g.registeredMono + 2000 }));
    clock.advance(COOLING_OFF_MS);
    await ctrl.tick();
    expect(ctrl.getSnapshot().state.policy.surfaces.reels).toBe(false); // app applied
    expect(blocker.policy?.surfaces.reels).toBe(true); // enforcer refused (2 s short)

    clock.advance(3000);
    await ctrl.tick();
    expect(blocker.policy?.surfaces.reels).toBe(false); // retried and accepted

    // Later stricter changes reach the enforcer again.
    await ctrl.setSurface('stories', true);
    expect(blocker.policy?.surfaces.stories).toBe(true);
  });

  test('a stricter change withdraws the matching native grant', async () => {
    const clock = new FakeClock(at(6, 12));
    const blocker = new SimulatedBlocker(
      () => clock.wall,
      () => clock.mono,
    );
    const ctrl = new UnscrollController(blocker, { getItem: async () => null, setItem: async () => {} }, testEnv);
    await ctrl.init();
    await ctrl.completeOnboarding();
    await ctrl.setSurface('feed', false);
    expect(blocker.grants).toHaveLength(1);
    await ctrl.setSurface('feed', true);
    expect(blocker.grants).toHaveLength(0);
  });

  test('page messages from Clean Instagram are rate-limited', async () => {
    const clock = new FakeClock(at(6, 12));
    const blocker = new SimulatedBlocker(
      () => clock.wall,
      () => clock.mono,
    );
    const ctrl = new UnscrollController(blocker, { getItem: async () => null, setItem: async () => {} }, testEnv);
    await ctrl.init();
    for (let i = 0; i < 50; i++) await ctrl.recordCleanBlock();
    const day = testEnv.dayKey(ctrl.getSnapshot().now);
    expect(ctrl.getSnapshot().state.stats.blocks[day]).toBe(1);
  });
});

describe('review: refused grant registration', () => {
  test('if the enforcer refuses a loosening, the app withdraws it instead of drifting', async () => {
    const clock = new FakeClock(at(6, 12));
    const blocker = new SimulatedBlocker(
      () => clock.wall,
      () => clock.mono,
    );
    blocker.registerLoosening = async () => {
      throw new Error('grant refused');
    };
    const ctrl = new UnscrollController(blocker, { getItem: async () => null, setItem: async () => {} }, testEnv);
    await ctrl.init();
    await ctrl.completeOnboarding();
    expect(await ctrl.setSurface('reels', false)).toEqual({ ok: false, error: 'enforcer-refused' });
    expect(ctrl.getSnapshot().state.pending).toHaveLength(0);
    clock.advance(2 * DAY);
    await ctrl.tick();
    expect(ctrl.getSnapshot().state.policy.surfaces.reels).toBe(true);
    expect(ctrl.getSnapshot().enforcerSynced).toBe(true);
  });
});
