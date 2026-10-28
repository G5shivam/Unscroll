import { ActivityIndicator, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { Text } from './Text';
import { color, radius, space, touch } from './theme';

type Kind = 'primary' | 'secondary' | 'quiet' | 'onInk';

export function Button({
  label,
  onPress,
  kind = 'primary',
  disabled,
  busy,
  style,
  testID,
  accessibilityHint,
}: {
  label: string;
  onPress?: () => void;
  kind?: Kind;
  disabled?: boolean;
  busy?: boolean;
  style?: ViewStyle;
  testID?: string;
  accessibilityHint?: string;
}) {
  const s = styles[kind];
  const inactive = disabled || busy;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!busy }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [styles.base, s, pressed && styles.pressed, inactive && styles.disabled, style]}
    >
      <View style={styles.row}>
        {busy ? <ActivityIndicator color={kind === 'primary' ? color.onInk : color.ink} /> : null}
        <Text
          variant="bodyStrong"
          style={{ color: kind === 'primary' ? color.onInk : kind === 'onInk' ? color.ink : color.ink }}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: touch + 4,
    paddingHorizontal: space.xl,
    borderRadius: radius.control,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  primary: { backgroundColor: color.ink },
  secondary: { backgroundColor: color.surface, borderWidth: 1, borderColor: color.hairline },
  quiet: { backgroundColor: 'transparent', minHeight: touch, paddingHorizontal: space.md },
  onInk: { backgroundColor: color.onInk },
  pressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  disabled: { opacity: 0.45 },
});
