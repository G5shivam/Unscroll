/**
 * Shared test vectors. The Kotlin enforcer runs the SAME files
 * (native-tests/kotlin), so both platforms are proven to agree.
 */
import clockVectors from '../shared-test-vectors/clock.json';
import ratchetVectors from '../shared-test-vectors/ratchet.json';
import scheduleVectors from '../shared-test-vectors/schedule.json';
import sessionVectors from '../shared-test-vectors/session.json';
import { readTrustedTime } from '../src/core/clock';
import { checkPolicyChange, type LooseningGrant } from '../src/core/ratchet';
import { coversSuperset, minutesUntilEnd, validateSchedule } from '../src/core/schedule';
import { tickSession } from '../src/core/session';
import type { ClockState, Policy, Schedule, Session } from '../src/core/types';

const S = scheduleVectors.schedules as Record<string, Schedule>;

describe('schedule vectors', () => {
  test.each(scheduleVectors.minutesUntilEnd)('$s at dow $dow minute $minute -> $expect', (c) => {
    expect(minutesUntilEnd(S[c.s], { dow: c.dow, minute: c.minute })).toBe(c.expect);
  });

  test.each(scheduleVectors.coversSuperset)('superset case %#', (c) => {
    expect(coversSuperset(S[c.prev], c.next as Schedule)).toBe(c.expect);
  });

  test.each(scheduleVectors.validate)('validate case %#', (c) => {
    const r = validateSchedule(c.input);
    expect(r.ok).toBe(c.ok);
    if (r.ok && 'name' in c) expect(r.value.name).toBe(c.name);
  });
});

describe('clock vectors', () => {
  test.each(clockVectors.sequences)('$name', (seq) => {
    let state: ClockState | null = null;
    for (const step of seq.steps) {
      const r = readTrustedTime(state, step.sample);
      expect(r.trusted).toBe(step.expect);
      state = r.state;
    }
  });
});

describe('session vectors', () => {
  test.each(sessionVectors.sequences)('$name', (seq) => {
    let s: Session = { ...seq.start, startedAt: 0 };
    for (const t of seq.ticks) {
      s = tickSession(s, { monoMs: t.monoMs, bootId: t.bootId });
      expect(s.consumedMs).toBe(t.consumedMs);
      expect(s.completed).toBe(t.completed);
    }
  });
});

describe('ratchet vectors', () => {
  const current = ratchetVectors.current as Policy;
  test.each(ratchetVectors.cases)('$name', (c) => {
    const incoming: Policy = JSON.parse(JSON.stringify(current));
    const cc = c as Record<string, unknown>;
    if (cc.patch) Object.assign(incoming.surfaces, (cc.patch as { surfaces: object }).surfaces);
    if (cc.addSchedule) incoming.schedules.push(cc.addSchedule as Schedule);
    if (cc.removeSchedule) incoming.schedules = incoming.schedules.filter((s) => s.id !== cc.removeSchedule);
    if (cc.replaceSchedule) {
      const r = cc.replaceSchedule as Schedule;
      incoming.schedules = incoming.schedules.map((s) => (s.id === r.id ? r : s));
    }
    const d = checkPolicyChange(current, incoming, c.grants as LooseningGrant[], c.focus);
    expect(d.ok).toBe(c.ok);
  });
});
