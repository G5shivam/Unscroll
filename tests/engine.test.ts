import { COOLING_OFF_MS } from '../src/core/constants';
import {
  addSchedule,
  applyDuePending,
  cancelPending,
  deleteSchedule,
  focusStatus,
  initialState,
  reconcileEnforcement,
  recordBlock,
  setSurface,
  startSession,
  sync,
  updateSchedule,
} from '../src/core/engine';
import type { AppState, Schedule } from '../src/core/types';
import { DAY, FakeClock, HOUR, MIN, at, testEnv } from './helpers';

const study: Schedule = { id: 'study', name: 'Study', days: 0b0111110, startMin: 9 * 60, endMin: 13 * 60 };

function ready(clock: FakeClock, state: AppState = initialState()): AppState {
  return sync({ ...state, onboarded: true }, clock.sample(), testEnv).state;
}

function must<T>(r: { ok: true; value: T } | { ok: false; error: string }): T {
  if (!r.ok) throw new Error(`expected ok, got ${r.error}`);
  return r.value;
}

describe('focus sessions (Rule 2)', () => {
  test('a session locks immediately and ends exactly when its time is consumed', () => {
    const clock = new FakeClock(at(1, 20));
    let s = ready(clock);
    s = must(startSession(s, HOUR, clock.sample(), clock.wall, testEnv));
    expect(focusStatus(s, clock.wall, testEnv)).toMatchObject({ active: true, source: 'session', remainingMs: HOUR });

    clock.advance(HOUR - 1);
    s = sync(s, clock.sample(), testEnv).state;
    expect(focusStatus(s, clock.wall, testEnv).active).toBe(true);

    clock.advance(1);
    const r = sync(s, clock.sample(), testEnv);
    expect(r.completedSessions).toHaveLength(1);
    expect(focusStatus(r.state, r.now, testEnv).active).toBe(false);
  });

  test('changing the wall clock does not shorten a session', () => {
    const clock = new FakeClock(at(1, 20));
    let s = must(startSession(ready(clock), 2 * HOUR, clock.sample(), clock.wall, testEnv));
    clock.mono += 10 * MIN; // 10 real minutes pass…
    clock.wall += 5 * DAY; // …while the user jumps the clock 5 days ahead
    const r = sync(s, clock.sample(), testEnv);
    s = r.state;
    const f = focusStatus(s, r.now, testEnv);
    expect(f.active).toBe(true);
    if (f.active) expect(f.remainingMs).toBe(2 * HOUR - 10 * MIN);
  });

  test('a session can be extended but never shortened', () => {
    const clock = new FakeClock(at(1, 20));
    let s = must(startSession(ready(clock), 2 * HOUR, clock.sample(), clock.wall, testEnv));
    expect(startSession(s, HOUR, clock.sample(), clock.wall, testEnv)).toEqual({ ok: false, error: 'would-shorten' });
    expect(startSession(s, 2 * HOUR, clock.sample(), clock.wall, testEnv)).toEqual({ ok: false, error: 'would-shorten' });
    s = must(startSession(s, 3 * HOUR, clock.sample(), clock.wall, testEnv));
    const f = focusStatus(s, clock.wall, testEnv);
    expect(f.active && f.remainingMs).toBe(3 * HOUR);
    expect(s.sessions.filter((x) => !x.completed)).toHaveLength(1);
  });

  test('durations outside 15 min – 12 h are rejected', () => {
    const clock = new FakeClock(at(1, 20));
    const s = ready(clock);
    for (const d of [0, 14 * MIN, 12 * HOUR + 1, -HOUR, Number.NaN, 1.5 * HOUR + 0.5]) {
      expect(startSession(s, d, clock.sample(), clock.wall, testEnv).ok).toBe(false);
    }
    expect(startSession(s, 15 * MIN, clock.sample(), clock.wall, testEnv).ok).toBe(true);
    expect(startSession(s, 12 * HOUR, clock.sample(), clock.wall, testEnv).ok).toBe(true);
  });

  test('completing focus on consecutive days builds a streak', () => {
    const clock = new FakeClock(at(1, 20));
    let s = ready(clock);
    for (let day = 0; day < 3; day++) {
      s = must(startSession(s, 30 * MIN, clock.sample(), clock.wall, testEnv));
      clock.advance(30 * MIN);
      s = sync(s, clock.sample(), testEnv).state;
      clock.advance(DAY - 30 * MIN);
      s = sync(s, clock.sample(), testEnv).state;
    }
    expect(s.streak).toMatchObject({ current: 3, best: 3 });
    clock.advance(3 * DAY);
    s = must(startSession(s, 30 * MIN, clock.sample(), clock.wall, testEnv));
    clock.advance(30 * MIN);
    s = sync(s, clock.sample(), testEnv).state;
    expect(s.streak).toMatchObject({ current: 1, best: 3 });
  });
});

describe('schedules', () => {
  test('a schedule locks during its window and records completion afterwards', () => {
    const clock = new FakeClock(at(1, 8, 59));
    let s = must(addSchedule(ready(clock), study));
    expect(focusStatus(s, clock.wall, testEnv).active).toBe(false);
    clock.advance(MIN);
    s = sync(s, clock.sample(), testEnv).state;
    const f = focusStatus(s, clock.wall, testEnv);
    expect(f).toMatchObject({ active: true, source: 'schedule', scheduleId: 'study', remainingMs: 4 * HOUR });
    clock.advance(4 * HOUR);
    const r = sync(s, clock.sample(), testEnv);
    expect(focusStatus(r.state, r.now, testEnv).active).toBe(false);
    expect(r.state.stats.focusMinutes[testEnv.dayKey(r.now)]).toBe(240);
  });

  test('stricter edits apply now, looser edits wait 24 hours', () => {
    // Saturday noon: 24 h later is Sunday noon, outside the weekday window.
    const clock = new FakeClock(at(6, 12));
    let s = must(addSchedule(ready(clock), study));
    const wider = { ...study, endMin: 14 * 60 };
    let r = must(updateSchedule(s, wider, clock.wall, testEnv));
    expect(r.applied).toBe('now');
    s = r.state;
    expect(s.policy.schedules[0].endMin).toBe(14 * 60);

    const narrower = { ...study, endMin: 11 * 60 };
    r = must(updateSchedule(s, narrower, clock.wall, testEnv));
    expect(r.applied).toBe('pending');
    s = r.state;
    expect(s.policy.schedules[0].endMin).toBe(14 * 60);
    expect(s.pending[0]).toMatchObject({ kind: 'schedule-edit', effectiveAt: clock.wall + COOLING_OFF_MS });

    clock.advance(COOLING_OFF_MS - MIN);
    s = sync(s, clock.sample(), testEnv).state;
    expect(s.policy.schedules[0].endMin).toBe(14 * 60);
    clock.advance(MIN);
    const done = sync(s, clock.sample(), testEnv);
    expect(done.appliedPending).toHaveLength(1);
    expect(done.state.policy.schedules[0].endMin).toBe(11 * 60);
  });

  test('a running schedule cannot be loosened or deleted', () => {
    const clock = new FakeClock(at(2, 10));
    const s = must(addSchedule(ready(clock), study));
    expect(updateSchedule(s, { ...study, endMin: 11 * 60 }, clock.wall, testEnv)).toEqual({ ok: false, error: 'locked' });
    expect(deleteSchedule(s, 'study', clock.wall, testEnv)).toEqual({ ok: false, error: 'locked' });
    // …but it can be extended while running.
    expect(must(updateSchedule(s, { ...study, endMin: 15 * 60 }, clock.wall, testEnv)).applied).toBe('now');
  });

  test('pending changes never apply while focus is active', () => {
    const clock = new FakeClock(at(6, 12));
    let s = must(addSchedule(ready(clock), study));
    s = must(deleteSchedule(s, 'study', clock.wall, testEnv)).state;
    clock.advance(COOLING_OFF_MS);
    s = must(startSession(s, HOUR, clock.sample(), clock.wall, testEnv));
    s = sync(s, clock.sample(), testEnv).state;
    expect(s.policy.schedules).toHaveLength(1);
    clock.advance(HOUR);
    s = sync(s, clock.sample(), testEnv).state;
    expect(s.policy.schedules).toHaveLength(0);
  });

  test('a matured change waits while its schedule window is running', () => {
    const clock = new FakeClock(at(0, 12)); // Sunday noon
    let s = must(addSchedule(ready(clock), study));
    s = must(deleteSchedule(s, 'study', clock.wall, testEnv)).state;
    clock.advance(COOLING_OFF_MS); // Monday noon, study (9–13) is running
    s = sync(s, clock.sample(), testEnv).state;
    expect(s.policy.schedules).toHaveLength(1);
    clock.advance(HOUR); // 13:00, window over
    s = sync(s, clock.sample(), testEnv).state;
    expect(s.policy.schedules).toHaveLength(0);
  });

  test('re-requesting a loosening restarts the 24-hour wait', () => {
    const clock = new FakeClock(at(0, 12));
    let s = must(addSchedule(ready(clock), study));
    s = must(updateSchedule(s, { ...study, endMin: 12 * 60 }, clock.wall, testEnv)).state;
    clock.advance(20 * HOUR);
    s = must(updateSchedule(s, { ...study, endMin: 10 * 60 }, clock.wall, testEnv)).state;
    expect(s.pending).toHaveLength(1);
    expect(s.pending[0].effectiveAt).toBe(clock.wall + COOLING_OFF_MS);
  });

  test('cancelling a pending change keeps the stricter setting', () => {
    const clock = new FakeClock(at(0, 12));
    let s = must(addSchedule(ready(clock), study));
    const r = must(deleteSchedule(s, 'study', clock.wall, testEnv));
    s = cancelPending(r.state, r.pendingId!);
    clock.advance(2 * DAY);
    s = sync(s, clock.sample(), testEnv).state;
    expect(s.policy.schedules).toHaveLength(1);
  });

  test('invalid or duplicate schedules are rejected; at most 20', () => {
    const clock = new FakeClock(at(0, 12));
    let s = ready(clock);
    expect(addSchedule(s, { ...study, startMin: 600, endMin: 600 }).ok).toBe(false);
    s = must(addSchedule(s, study));
    expect(addSchedule(s, study).ok).toBe(false);
    for (let i = 1; i < 20; i++) s = must(addSchedule(s, { ...study, id: `s${i}` }));
    expect(addSchedule(s, { ...study, id: 'one-too-many' })).toEqual({ ok: false, error: 'too-many' });
  });
});

describe('surfaces (Rule 1)', () => {
  test('hiding is immediate; showing again waits 24 hours', () => {
    const clock = new FakeClock(at(0, 12));
    let s = ready(clock);
    let r = must(setSurface(s, 'stories', true, clock.wall, testEnv));
    expect(r.applied).toBe('now');
    s = r.state;
    expect(s.policy.surfaces.stories).toBe(true);

    r = must(setSurface(s, 'reels', false, clock.wall, testEnv));
    expect(r.applied).toBe('pending');
    s = r.state;
    expect(s.policy.surfaces.reels).toBe(true);
    clock.advance(COOLING_OFF_MS);
    s = sync(s, clock.sample(), testEnv).state;
    expect(s.policy.surfaces.reels).toBe(false);
  });

  test('turning a surface back on cancels its pending unblock', () => {
    const clock = new FakeClock(at(0, 12));
    let s = must(setSurface(ready(clock), 'feed', false, clock.wall, testEnv)).state;
    s = must(setSurface(s, 'feed', true, clock.wall, testEnv)).state;
    expect(s.pending).toHaveLength(0);
    clock.advance(2 * DAY);
    expect(sync(s, clock.sample(), testEnv).state.policy.surfaces.feed).toBe(true);
  });
});

describe('escape detection (FR-11)', () => {
  test('a blocker that was on and is now off is recorded as an escape and resets the streak', () => {
    const clock = new FakeClock(at(1, 20));
    let s = ready(clock);
    s = { ...s, streak: { current: 4, best: 4, lastDay: '2026-01-04' } };
    s = reconcileEnforcement(s, true, clock.wall, testEnv).state;
    expect(s.enforcementArmed).toBe(true);
    s = must(startSession(s, HOUR, clock.sample(), clock.wall, testEnv));
    const r = reconcileEnforcement(s, false, clock.wall, testEnv);
    expect(r.escaped).toBe(true);
    expect(r.state.escapes[0]).toMatchObject({ kind: 'permission-revoked', duringFocus: true });
    expect(r.state.streak).toMatchObject({ current: 0, best: 4 });
    // Not counted twice.
    expect(reconcileEnforcement(r.state, false, clock.wall, testEnv).escaped).toBe(false);
  });

  test('never-armed blockers are not escapes', () => {
    const clock = new FakeClock(at(1, 20));
    expect(reconcileEnforcement(ready(clock), false, clock.wall, testEnv).escaped).toBe(false);
  });
});

describe('stats housekeeping', () => {
  test('blocks are counted per day and old days are pruned', () => {
    const clock = new FakeClock(at(0, 12));
    let s = ready(clock);
    for (let d = 0; d < 100; d++) {
      s = recordBlock(s, clock.wall, testEnv);
      clock.advance(DAY);
      s = sync(s, clock.sample(), testEnv).state;
    }
    expect(Object.keys(s.stats.blocks)).toHaveLength(90);
  });

  test('applyDuePending is a no-op with nothing due', () => {
    const clock = new FakeClock(at(0, 12));
    const s = ready(clock);
    expect(applyDuePending(s, clock.wall, testEnv).applied).toEqual([]);
  });
});
