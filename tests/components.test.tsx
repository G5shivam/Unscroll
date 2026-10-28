import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { AccessibilityInfo } from 'react-native';
import { HoldButton } from '../src/ui/HoldButton';
import { LockPanel } from '../src/ui/LockPanel';
import { Toggle } from '../src/ui/primitives';

const surfaces = { feed: true, reels: true, explore: false, stories: false };

describe('HoldButton (commitment gesture)', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.spyOn(AccessibilityInfo, 'isScreenReaderEnabled').mockResolvedValue(false);
  });
  afterEach(() => jest.useRealTimers());

  test('completes only after the full hold', async () => {
    const done = jest.fn();
    await render(<HoldButton label="Hold to lock" onComplete={done} testID="hold" holdMs={3000} />);
    await act(async () => {});
    await fireEvent(screen.getByTestId('hold'), 'pressIn');
    await act(async () => { jest.advanceTimersByTime(2900); });
    expect(done).not.toHaveBeenCalled();
    await act(async () => { jest.advanceTimersByTime(200); });
    expect(done).toHaveBeenCalledTimes(1);
  });

  test('releasing early cancels', async () => {
    const done = jest.fn();
    await render(<HoldButton label="Hold to lock" onComplete={done} testID="hold" holdMs={3000} />);
    await act(async () => {});
    await fireEvent(screen.getByTestId('hold'), 'pressIn');
    await act(async () => { jest.advanceTimersByTime(1500); });
    await fireEvent(screen.getByTestId('hold'), 'pressOut');
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(done).not.toHaveBeenCalled();
  });

  test('disabled buttons never complete', async () => {
    const done = jest.fn();
    await render(<HoldButton label="Hold to lock" onComplete={done} testID="hold" disabled holdMs={3000} />);
    await act(async () => {});
    await fireEvent(screen.getByTestId('hold'), 'pressIn');
    await act(async () => { jest.advanceTimersByTime(5000); });
    expect(done).not.toHaveBeenCalled();
  });

  test('screen-reader users get a two-step confirm instead of a timed hold', async () => {
    (AccessibilityInfo.isScreenReaderEnabled as jest.Mock).mockResolvedValue(true);
    const done = jest.fn();
    await render(<HoldButton label="Hold to lock" onComplete={done} testID="hold" />);
    await act(async () => {});
    await fireEvent.press(screen.getByTestId('hold'));
    expect(done).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Confirm lock')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('hold'));
    expect(done).toHaveBeenCalledTimes(1);
  });
});

describe('LockPanel', () => {
  test('open state lists the hidden surfaces', async () => {
    await render(<LockPanel focus={{ active: false }} surfaces={surfaces} schedules={[]} />);
    expect(screen.getByTestId('lock-panel-open')).toBeTruthy();
    expect(screen.getByText('Feed and Reels hidden')).toBeTruthy();
  });

  test('locked state shows the countdown and has no stop control', async () => {
    const endsAt = Date.UTC(2026, 9, 28, 7, 30); // 1:00 pm IST
    await render(
      <LockPanel
        focus={{ active: true, source: 'session', endsAt, remainingMs: 3_725_000 }}
        surfaces={surfaces}
        schedules={[]}
      />,
    );
    const panel = screen.getByTestId('lock-panel-locked');
    expect(panel.props.accessibilityLabel).toContain('1 hours 2 minutes remaining');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText(/stop/i, { exact: false })).toBeTruthy(); // only the explanatory sentence
    expect(screen.queryByText(/^stop$/i)).toBeNull();
  });

  test('a running schedule shows its name', async () => {
    await render(
      <LockPanel
        focus={{ active: true, source: 'schedule', scheduleId: 's', endsAt: Date.now() + 60_000, remainingMs: 60_000 }}
        surfaces={surfaces}
        schedules={[{ id: 's', name: 'Board exam prep', days: 127, startMin: 0, endMin: 60 }]}
      />,
    );
    expect(screen.getByText('Board exam prep')).toBeTruthy();
  });
});

describe('Toggle', () => {
  test('exposes switch semantics and toggles', async () => {
    const onChange = jest.fn();
    await render(<Toggle label="Hide Reels" value={false} onChange={onChange} testID="t" />);
    const t = screen.getByTestId('t');
    expect(t.props.accessibilityRole).toBe('switch');
    expect(t.props.accessibilityState).toMatchObject({ checked: false });
    await fireEvent.press(t);
    expect(onChange).toHaveBeenCalledWith(true);
  });
});
