import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { HOUR, MAX_SESSION_MS, MIN_SESSION_MS, MINUTE } from '../core/constants';
import { useController, useUnscroll } from '../state/provider';
import { formatClock, formatDuration } from '../ui/format';
import { HoldButton } from '../ui/HoldButton';
import { Chip, Icon, Notice, Screen } from '../ui/primitives';
import { Text } from '../ui/Text';
import { color, radius, space } from '../ui/theme';

const PRESETS = [25 * MINUTE, 50 * MINUTE, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR];
const STEP = 15 * MINUTE;

export default function StartFocus() {
  const { now, focus } = useUnscroll();
  const ctrl = useController();
  const extending = focus.active && focus.source === 'session';
  const remaining = extending ? focus.remainingMs : 0;
  const minimum = extending ? Math.min(MAX_SESSION_MS, Math.ceil((remaining + MINUTE) / STEP) * STEP) : MIN_SESSION_MS;
  const [duration, setDuration] = useState(() => Math.max(minimum, HOUR));
  const [error, setError] = useState<string | null>(null);
  const valid = duration >= minimum && duration <= MAX_SESSION_MS;

  const lock = async () => {
    setError(null);
    const r = await ctrl.startFocus(duration);
    if (r.ok) router.back();
    else if (r.error === 'would-shorten') setError('A lock can only be made longer, not shorter.');
    else if (r.error === 'enforcer-refused') setError('Blocking is off. Turn it on in Settings, then try again.');
    else setError('Pick between 15 minutes and 12 hours.');
  };

  return (
    <Screen
      edges={['top', 'bottom']}
      testID="screen-focus"
      footer={<HoldButton label="Hold to lock" onComplete={lock} disabled={!valid} testID="hold-to-lock" />}
    >
      <View style={styles.top}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          hitSlop={12}
          testID="close-focus"
        >
          <Icon name="x" size={24} />
        </Pressable>
      </View>
      <Text variant="title" accessibilityRole="header">
        {extending ? 'Extend this focus' : 'Start a focus'}
      </Text>
      <Text tone="slate" style={{ marginTop: space.xs }}>
        {extending
          ? `${formatDuration(remaining)} left. You can add time, but not take it away.`
          : 'Instagram locks completely until the timer ends.'}
      </Text>

      <View style={styles.chips}>
        {PRESETS.filter((p) => p >= minimum).map((p) => (
          <Chip
            key={p}
            label={formatDuration(p)}
            selected={duration === p}
            onPress={() => setDuration(p)}
            testID={`preset-${p / MINUTE}`}
          />
        ))}
      </View>

      <View style={styles.stepper}>
        <StepButton
          icon="minus"
          label="15 minutes less"
          disabled={duration - STEP < minimum}
          onPress={() => setDuration((d) => Math.max(minimum, d - STEP))}
          testID="duration-minus"
        />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <Text variant="title" testID="duration-value">
            {formatDuration(duration)}
          </Text>
          <Text tone="slate" variant="caption" testID="ends-at">
            {now ? `Ends at ${formatClock(now + duration)}` : ' '}
          </Text>
        </View>
        <StepButton
          icon="plus"
          label="15 minutes more"
          disabled={duration + STEP > MAX_SESSION_MS}
          onPress={() => setDuration((d) => Math.min(MAX_SESSION_MS, d + STEP))}
          testID="duration-plus"
        />
      </View>

      <Notice
        tone="pending"
        icon="alert-circle"
        title="You won’t be able to stop this"
        body="Unscroll has no stop button. Switching Unscroll off in your phone’s settings, or uninstalling it, ends the lock and resets your streak."
      />
      {error ? (
        <View style={{ marginTop: space.md }}>
          <Notice tone="alert" icon="x-circle" title={error} testID="focus-error" />
        </View>
      ) : null}
    </Screen>
  );
}

function StepButton({
  icon,
  label,
  onPress,
  disabled,
  testID,
}: {
  icon: 'plus' | 'minus';
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.stepBtn, pressed && { backgroundColor: color.mist }, disabled && { opacity: 0.35 }]}
    >
      <Icon name={icon} size={22} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  top: { paddingTop: space.lg, paddingBottom: space.xl, alignItems: 'flex-start' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xl },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.group,
    padding: space.md,
    marginVertical: space.xl,
  },
  stepBtn: {
    width: 52,
    height: 52,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: color.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
