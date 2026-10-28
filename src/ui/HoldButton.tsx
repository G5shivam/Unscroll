import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, View } from 'react-native';
import { haptic } from './haptics';
import { Text } from './Text';
import { color, radius, touch } from './theme';

export const HOLD_MS = 3000;

/**
 * "Hold to lock": the commitment gesture before a Focus session (PRD flow).
 * A highlighter stroke fills left to right while held; letting go early resets.
 * Screen-reader users get a two-step confirm instead of a timed hold.
 */
export function HoldButton({
  label,
  holdingLabel = 'Keep holding…',
  onComplete,
  disabled,
  testID,
  holdMs = HOLD_MS,
}: {
  label: string;
  holdingLabel?: string;
  onComplete: () => void;
  disabled?: boolean;
  testID?: string;
  holdMs?: number;
}) {
  // Held in state (not a ref) so it can be read safely during render.
  const [progress] = useState(() => new Animated.Value(0));
  const [holding, setHolding] = useState(false);
  const [armed, setArmed] = useState(false);
  const [srOn, setSrOn] = useState(false);
  const done = useRef(false);
  const [w, setW] = useState(0);
  const width = useMemo(() => progress.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }), [progress]);

  useEffect(() => {
    // react-native-web always reports a screen reader as on, so only trust native platforms.
    if (Platform.OS === 'web') return;
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled()
      .then((v) => alive && setSrOn(v))
      .catch(() => undefined);
    const sub = AccessibilityInfo.addEventListener?.('screenReaderChanged', (v: boolean) => setSrOn(v));
    return () => {
      alive = false;
      sub?.remove?.();
    };
  }, []);

  const start = () => {
    if (disabled) return;
    done.current = false;
    setHolding(true);
    haptic('light');
    Animated.timing(progress, {
      toValue: 1,
      duration: holdMs,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start(({ finished }) => {
      if (finished && !done.current) {
        done.current = true;
        setHolding(false);
        haptic('success');
        onComplete();
      }
    });
  };

  const cancel = () => {
    if (done.current) return;
    setHolding(false);
    progress.stopAnimation();
    Animated.timing(progress, { toValue: 0, duration: 220, useNativeDriver: false }).start();
  };

  if (srOn) {
    return (
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={armed ? 'Confirm lock' : label}
        accessibilityHint={armed ? 'Starts the lock. It cannot be stopped.' : 'Double tap, then confirm.'}
        disabled={disabled}
        onPress={() => (armed ? onComplete() : setArmed(true))}
        style={[styles.base, disabled && styles.disabled]}
      >
        <Text variant="bodyStrong" style={styles.label}>
          {armed ? 'Confirm lock' : label}
        </Text>
      </Pressable>
    );
  }


  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={`Press and hold for ${Math.round(holdMs / 1000)} seconds`}
      accessibilityState={{ disabled: !!disabled, busy: holding }}
      disabled={disabled}
      onPressIn={start}
      onPressOut={cancel}
      onLayout={(e) => setW(e.nativeEvent.layout.width)}
      style={[styles.base, disabled && styles.disabled]}
      // Prevent long-press context menus on web from interrupting the hold.
      {...(Platform.OS === 'web' ? { onContextMenu: (e: { preventDefault(): void }) => e.preventDefault() } : {})}
    >
      <View style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
        <Text variant="bodyStrong" style={styles.label}>
          {holding ? holdingLabel : label}
        </Text>
      </View>
      {/* The highlighter stroke carries its own ink-coloured copy of the label, clipped to the fill. */}
      <Animated.View style={[styles.fill, { width }]} pointerEvents="none">
        <View style={[styles.center, { width: w, height: '100%' }]}>
          <Text variant="bodyStrong" style={styles.labelOnFill}>
            {holding ? holdingLabel : label}
          </Text>
        </View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: touch + 12,
    borderRadius: radius.control,
    backgroundColor: color.ink,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: color.highlighter,
    overflow: 'hidden',
  },
  center: { alignItems: 'center', justifyContent: 'center' },
  label: { color: color.onInk },
  labelOnFill: { color: color.ink },
  disabled: { opacity: 0.45 },
});
