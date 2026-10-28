import { COOLING_OFF_MS } from '../src/core/constants';
import { initialState } from '../src/core/engine';
import { parseState, serializeState } from '../src/state/persist';

describe('persisted state parsing', () => {
  test('round-trips a valid state', () => {
    const s = initialState();
    s.onboarded = true;
    s.policy.schedules.push({ id: 'a', name: 'Study', days: 62, startMin: 540, endMin: 780 });
    s.pending.push({
      id: 'p1',
      kind: 'surface-off',
      surface: 'reels',
      requestedAt: 1000,
      effectiveAt: 1000 + COOLING_OFF_MS,
      waitedMs: 5000,
      lastMono: 42,
      lastBootId: 'b1',
    });
    s.stats.blocks['2026-10-28'] = 3;
    expect(parseState(serializeState(s))).toEqual(s);
  });

  test.each([null, '', 'null', '[]', '{', '"x"', '{"version":2}', '{"version":1,"policy":42}'])(
    'garbage %p falls back to a fresh, valid state',
    (raw) => {
      const s = parseState(raw as string | null);
      expect(s.version).toBe(1);
      expect(s.onboarded).toBe(false);
      expect(s.policy.surfaces.reels).toBe(true);
    },
  );

  test('a tampered pending change can never take effect before 24 hours', () => {
    const raw = JSON.stringify({
      ...initialState(),
      pending: [{ id: 'p', kind: 'surface-off', surface: 'feed', requestedAt: 5_000, effectiveAt: 0 }],
    });
    expect(parseState(raw).pending[0].effectiveAt).toBe(5_000 + COOLING_OFF_MS);
  });

  test('invalid schedules, pending changes, sessions and stats are dropped', () => {
    const raw = JSON.stringify({
      ...initialState(),
      policy: {
        surfaces: { feed: true, reels: true, explore: true, stories: false },
        schedules: [
          { id: 'ok', name: 'Fine', days: 1, startMin: 0, endMin: 60 },
          { id: 'bad', name: 'Zero', days: 1, startMin: 60, endMin: 60 },
          { id: '<script>', name: 'x', days: 1, startMin: 0, endMin: 60 },
        ],
      },
      pending: [{ id: 'p', kind: 'surface-off', surface: 'everything', requestedAt: 1, effectiveAt: 2 }],
      sessions: [{ id: 's', durationMs: -5 }],
      stats: { blocks: { '2026-01-01': 2, hack: 9, '2026-01-02': -1 }, focusMinutes: 'x' },
      streak: { current: -3, best: 'many', lastDay: 'yesterday' },
    });
    const s = parseState(raw);
    expect(s.policy.schedules.map((x) => x.id)).toEqual(['ok']);
    expect(s.pending).toEqual([]);
    expect(s.sessions).toEqual([]);
    expect(s.stats.blocks).toEqual({ '2026-01-01': 2 });
    expect(s.streak).toEqual({ current: 0, best: 0, lastDay: null });
  });

  test('random fuzz never throws and always yields a valid shape', () => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const atoms = [null, true, false, 0, -1, 1e308, 'x', '', [], {}, 'surface-off', 62, 540];
    const gen = (depth: number): unknown => {
      if (depth > 3 || rnd() < 0.3) return atoms[Math.floor(rnd() * atoms.length)];
      if (rnd() < 0.5) return Array.from({ length: Math.floor(rnd() * 4) }, () => gen(depth + 1));
      const keys = ['version', 'policy', 'surfaces', 'schedules', 'pending', 'sessions', 'clock', 'stats', 'streak', 'id', 'kind'];
      const o: Record<string, unknown> = { version: 1 };
      for (let i = 0; i < 4; i++) o[keys[Math.floor(rnd() * keys.length)]] = gen(depth + 1);
      return o;
    };
    for (let i = 0; i < 2000; i++) {
      const s = parseState(JSON.stringify(gen(0)));
      expect(typeof s.onboarded).toBe('boolean');
      expect(Array.isArray(s.policy.schedules)).toBe(true);
      expect(typeof s.policy.surfaces.feed).toBe('boolean');
    }
  });
});
