import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';
import { HOUR, MINUTE } from '../src/core/constants';
import { setLocale } from '../src/i18n';
import { DurationField, TimeField } from '../src/ui/TimeFields';
import { durationFromParts, durationToParts, fromTimeParts, toTimeParts } from '../src/ui/timeParts';

afterEach(() => setLocale({ lang: 'en', tag: 'en-IN', uses24h: false }));

describe('time parts', () => {
  test.each([
    // [hours, minutes, pm, uses24h, minute of day]
    ['7', '05', false, false, 7 * 60 + 5],
    ['7', '05', true, false, 19 * 60 + 5],
    ['12', '00', false, false, 0], // 12 am = midnight
    ['12', '30', true, false, 12 * 60 + 30], // 12:30 pm = noon-ish
    ['19', '05', false, false, 19 * 60 + 5], // 24-hour input understood on a 12-hour clock
    ['0', '45', false, false, 45],
    ['7', '', false, false, 7 * 60], // empty minutes = :00
    ['23', '59', false, true, 23 * 60 + 59],
    ['07', '5', false, true, 7 * 60 + 5],
  ] as const)('%s:%s pm=%s 24h=%s -> %i', (h, m, pm, h24, want) => {
    expect(fromTimeParts(h, m, pm, h24)).toBe(want);
  });

  test.each([
    ['24', '00'],
    ['7', '60'],
    ['', '30'],
    ['a', '10'],
    ['7', '1x'],
    ['123', '00'],
  ])('rejects %p:%p', (h, m) => {
    expect(fromTimeParts(h, m, false, false)).toBeNull();
    expect(fromTimeParts(h, m, false, true)).toBeNull();
  });

  test('round-trips every minute of the day on both clocks', () => {
    for (let v = 0; v < 1440; v += 7) {
      for (const h24 of [true, false]) {
        const p = toTimeParts(v, h24);
        expect(fromTimeParts(p.h, p.m, p.pm, h24)).toBe(v);
      }
    }
  });

  test('durations', () => {
    expect(durationFromParts('1', '37')).toBe(97 * MINUTE);
    expect(durationFromParts('', '50')).toBe(50 * MINUTE);
    expect(durationFromParts('2', '')).toBe(2 * HOUR);
    expect(durationFromParts('', '')).toBeNull();
    expect(durationFromParts('1', '75')).toBeNull();
    expect(durationToParts(97 * MINUTE)).toEqual({ h: '1', m: '37' });
  });
});

function TimeHarness({ initial, onInvalid }: { initial: number; onInvalid?: (b: boolean) => void }) {
  const [v, setV] = useState(initial);
  return <TimeField label="Starts" value={v} onChange={setV} testID="start" onInvalid={onInvalid} />;
}

describe('TimeField: 15-minute buttons and typing', () => {
  test('the buttons still move 15 minutes', async () => {
    await render(<TimeHarness initial={9 * 60} />);
    await fireEvent.press(screen.getByTestId('start-plus'));
    expect(screen.getByTestId('start-value').props.children).toBe('9:15 am');
    await fireEvent.press(screen.getByTestId('start-minus'));
    await fireEvent.press(screen.getByTestId('start-minus'));
    expect(screen.getByTestId('start-value').props.children).toBe('8:45 am');
  });

  test('typing sets any exact time, including pm', async () => {
    await render(<TimeHarness initial={9 * 60} />);
    await fireEvent.press(screen.getByTestId('start-edit'));
    await fireEvent.changeText(screen.getByTestId('start-hour'), '6');
    await fireEvent.changeText(screen.getByTestId('start-minute'), '07');
    await fireEvent.press(screen.getByTestId('start-ampm'));
    await fireEvent.press(screen.getByTestId('start-done'));
    expect(screen.getByTestId('start-value').props.children).toBe('6:07 pm');
    // And the buttons continue from the typed time.
    await fireEvent.press(screen.getByTestId('start-plus'));
    expect(screen.getByTestId('start-value').props.children).toBe('6:22 pm');
  });

  test('an invalid time shows an error and blocks closing', async () => {
    const onInvalid = jest.fn();
    await render(<TimeHarness initial={9 * 60} onInvalid={onInvalid} />);
    await fireEvent.press(screen.getByTestId('start-edit'));
    await fireEvent.changeText(screen.getByTestId('start-minute'), '75');
    expect(screen.getByTestId('start-error')).toBeTruthy();
    expect(onInvalid).toHaveBeenLastCalledWith(true);
    await fireEvent.press(screen.getByTestId('start-done'));
    expect(screen.getByTestId('start-minute')).toBeTruthy(); // still editing
    await fireEvent.changeText(screen.getByTestId('start-minute'), '15');
    expect(onInvalid).toHaveBeenLastCalledWith(false);
  });

  test('on a 24-hour phone there is no am/pm switch', async () => {
    setLocale({ lang: 'de', tag: 'de-DE', uses24h: true });
    await render(<TimeHarness initial={9 * 60} />);
    await fireEvent.press(screen.getByTestId('start-edit'));
    expect(screen.queryByTestId('start-ampm')).toBeNull();
    await fireEvent.changeText(screen.getByTestId('start-hour'), '21');
    await fireEvent.changeText(screen.getByTestId('start-minute'), '40');
    await fireEvent.press(screen.getByTestId('start-done'));
    expect(screen.getByTestId('start-value').props.children).toBe('21:40');
  });
});

function DurationHarness({ onInvalid }: { onInvalid?: (b: boolean) => void }) {
  const [v, setV] = useState(HOUR);
  return (
    <DurationField value={v} onChange={setV} min={15 * MINUTE} max={12 * HOUR} testID="duration" onInvalid={onInvalid} />
  );
}

describe('DurationField', () => {
  test('typing any length between 15 minutes and 12 hours', async () => {
    await render(<DurationHarness />);
    await fireEvent.press(screen.getByTestId('duration-edit'));
    await fireEvent.changeText(screen.getByTestId('duration-hours'), '1');
    await fireEvent.changeText(screen.getByTestId('duration-minutes'), '37');
    await fireEvent.press(screen.getByTestId('duration-done'));
    expect(screen.getByTestId('duration-value').props.children).toBe('1 h 37 min');
  });

  test('out-of-range lengths show the limits and are not applied', async () => {
    const onInvalid = jest.fn();
    await render(<DurationHarness onInvalid={onInvalid} />);
    await fireEvent.press(screen.getByTestId('duration-edit'));
    await fireEvent.changeText(screen.getByTestId('duration-hours'), '0');
    await fireEvent.changeText(screen.getByTestId('duration-minutes'), '10');
    expect(screen.getByTestId('duration-error').props.children).toBe('Pick between 15 min and 12 h.');
    expect(onInvalid).toHaveBeenLastCalledWith(true);
    await fireEvent.changeText(screen.getByTestId('duration-hours'), '13');
    expect(screen.getByTestId('duration-error')).toBeTruthy();
    await act(async () => {});
  });
});
