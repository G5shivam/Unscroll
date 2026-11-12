import { render, screen } from '@testing-library/react-native';
import { DAY, HOUR } from '../src/core/constants';
import { realEnv } from '../src/core/env';
import { ALTERNATIVE_COUNT, alternativeIndex, freshStart, weekHeadline, weekInsight } from '../src/core/insights';
import { alternativeText, headlineText } from '../src/ui/copy';
import { validateSchedule } from '../src/core/schedule';
import { scheduleFromTemplate, templateByKey, TEMPLATES } from '../src/core/templates';
import { LockPanel } from '../src/ui/LockPanel';
import { WeekCard } from '../src/ui/WeekCard';

const NOW = new Date(2026, 10, 11, 12, 0).getTime(); // local noon, Wed 11 Nov 2026
const key = (daysAgo: number) => realEnv.dayKey(NOW - daysAgo * DAY);

describe('weekInsight', () => {
  test('sums the last 7 days and the 7 before separately', () => {
    const stats = {
      focusMinutes: { [key(0)]: 60, [key(6)]: 30, [key(7)]: 45, [key(13)]: 15, [key(14)]: 999 },
      blocks: { [key(0)]: 3, [key(3)]: 2, [key(8)]: 4 },
    };
    const w = weekInsight(stats, NOW, realEnv.dayKey);
    expect(w.days).toHaveLength(7);
    expect(w.days[6]).toMatchObject({ key: key(0), isToday: true, focusMinutes: 60, blocks: 3 });
    expect(w.days[0].key).toBe(key(6));
    expect(w.focusMinutes).toBe(90);
    expect(w.blocks).toBe(5);
    expect(w.prevFocusMinutes).toBe(60);
    expect(w.prevBlocks).toBe(4);
    expect(w.focusDays).toBe(2);
  });

  test('headline is encouraging, never shaming', () => {
    const empty = weekInsight({ focusMinutes: {}, blocks: {} }, NOW, realEnv.dayKey);
    expect(headlineText(weekHeadline(empty))).toMatch(/first focus/);
    const better = weekInsight({ focusMinutes: { [key(0)]: 60, [key(8)]: 10 }, blocks: {} }, NOW, realEnv.dayKey);
    expect(weekHeadline(better)).toEqual({ kind: 'better', days: 1 });
    expect(headlineText(weekHeadline(better))).toBe('More focus than last week, on 1 day.');
    const blocksOnly = weekInsight({ focusMinutes: {}, blocks: { [key(1)]: 2 } }, NOW, realEnv.dayKey);
    expect(headlineText(weekHeadline(blocksOnly))).toMatch(/caught the scroll/);
  });
});

describe('freshStart', () => {
  const esc = (at: number) => [{ kind: 'permission-revoked' as const, at, duringFocus: true }];
  test('shows for a few days after an escape when the streak was reset', () => {
    expect(freshStart(esc(NOW - HOUR), { current: 0, best: 5, lastDay: null }, NOW)).toEqual({ best: 5 });
  });
  test('hidden once a new streak starts, when old, or without escapes', () => {
    expect(freshStart(esc(NOW - HOUR), { current: 1, best: 5, lastDay: null }, NOW)).toBeNull();
    expect(freshStart(esc(NOW - 4 * DAY), { current: 0, best: 5, lastDay: null }, NOW)).toBeNull();
    expect(freshStart([], { current: 0, best: 0, lastDay: null }, NOW)).toBeNull();
  });
});

describe('alternatives', () => {
  test('stable within a minute and always from the list', () => {
    expect(alternativeIndex(NOW)).toBe(alternativeIndex(NOW + 30_000));
    for (let i = 0; i < 20; i++) {
      const idx = alternativeIndex(NOW + i * 60_000);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(ALTERNATIVE_COUNT);
    }
  });
});

describe('schedule templates', () => {
  test.each(TEMPLATES.map((t) => [t.key, t]))('%s is a valid schedule', (_k, t) => {
    expect(validateSchedule(scheduleFromTemplate(t, 'id1', 'Template')).ok).toBe(true);
  });
  test('unknown keys are ignored', () => {
    expect(templateByKey('nope')).toBeUndefined();
    expect(templateByKey(undefined)).toBeUndefined();
    expect(templateByKey('sleep')?.endMin).toBeLessThan(templateByKey('sleep')!.startMin); // overnight
  });
});

describe('wellbeing UI', () => {
  test('WeekCard shows totals and the trend', async () => {
    const w = weekInsight({ focusMinutes: { [key(0)]: 90, [key(9)]: 30 }, blocks: { [key(0)]: 4 } }, NOW, realEnv.dayKey);
    await render(<WeekCard week={w} />);
    expect(screen.getByTestId('stat-focus').props.children).toBe('1 h 30 min');
    expect(screen.getByTestId('week-blocks').props.children).toBe('4');
    expect(screen.getByText('+1 h vs last week')).toBeTruthy();
  });

  test('locked panel suggests something to do instead', async () => {
    await render(
      <LockPanel
        focus={{ active: true, source: 'session', endsAt: NOW + HOUR, remainingMs: HOUR }}
        surfaces={{ feed: true, reels: true, explore: false, stories: false }}
        schedules={[]}
      />,
    );
    expect(screen.getByText(alternativeText(NOW + HOUR))).toBeTruthy();
  });
});
