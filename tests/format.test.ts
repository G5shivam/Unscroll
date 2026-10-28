import { nextStart } from '../src/core/next';
import { countdownParts, formatDays, formatDuration, formatMinuteOfDay, formatRange, formatUntil } from '../src/ui/format';
import { DAY, HOUR, MIN, at, testEnv } from './helpers';

describe('formatting', () => {
  test.each([
    [0, '12:00 am'],
    [9 * 60, '9:00 am'],
    [12 * 60, '12:00 pm'],
    [13 * 60 + 5, '1:05 pm'],
    [23 * 60 + 59, '11:59 pm'],
  ])('minute %i -> %s', (m, s) => expect(formatMinuteOfDay(m)).toBe(s));

  test('ranges mark overnight windows', () => {
    expect(formatRange(540, 780)).toBe('9:00 am – 1:00 pm');
    expect(formatRange(1380, 420)).toBe('11:00 pm – 7:00 am (next day)');
  });

  test('days', () => {
    expect(formatDays(127)).toBe('Every day');
    expect(formatDays(62)).toBe('Weekdays');
    expect(formatDays(65)).toBe('Weekends');
    expect(formatDays(0b0001010)).toBe('Mon, Wed');
  });

  test('durations and countdowns', () => {
    expect(formatDuration(25 * MIN)).toBe('25 min');
    expect(formatDuration(2 * HOUR)).toBe('2 h');
    expect(formatDuration(90 * MIN)).toBe('1 h 30 min');
    expect(countdownParts(3_725_000)).toEqual({ h: '01', m: '02', s: '05' });
    expect(countdownParts(-5)).toEqual({ h: '00', m: '00', s: '00' });
    expect(formatUntil(1000, 0)).toBe('in under a minute');
    expect(formatUntil(DAY, 0)).toBe('in 24 h');
  });
});

describe('nextStart', () => {
  const study = { id: 's', name: 'Study', days: 62, startMin: 540, endMin: 780 };
  test('later today', () => {
    expect(nextStart([study], at(1, 8), testEnv.toLocal)?.startsAt).toBe(at(1, 9));
  });
  test('skips to the next enabled day', () => {
    expect(nextStart([study], at(5, 10), testEnv.toLocal)?.startsAt).toBe(at(1, 9, 0, 1));
  });
  test('picks the earliest of several', () => {
    const night = { id: 'n', name: 'Night', days: 127, startMin: 1380, endMin: 420 };
    expect(nextStart([study, night], at(1, 10), testEnv.toLocal)?.schedule.id).toBe('n');
  });
  test('none', () => expect(nextStart([], at(1, 8), testEnv.toLocal)).toBeNull());
});
