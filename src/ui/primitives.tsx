import Feather from '@expo/vector-icons/Feather';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Text } from './Text';
import { color, radius, space, touch } from './theme';

export type IconName = React.ComponentProps<typeof Feather>['name'];

export function Icon({ name, size = 20, tint = color.ink }: { name: IconName; size?: number; tint?: string }) {
  return <Feather name={name} size={size} color={tint} accessibilityElementsHidden importantForAccessibility="no" />;
}

/** Scrollable page with safe areas and a left-aligned title block. */
export function Screen({
  title,
  subtitle,
  children,
  footer,
  testID,
  edges = ['top'],
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
  edges?: ('top' | 'bottom')[];
}) {
  return (
    <SafeAreaView style={styles.screen} edges={edges} testID={testID}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        {title ? (
          <View style={styles.titleBlock}>
            <Text variant="title" accessibilityRole="header">
              {title}
            </Text>
            {subtitle ? (
              <Text tone="slate" style={{ marginTop: space.xs }}>
                {subtitle}
              </Text>
            ) : null}
          </View>
        ) : null}
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

/** A labelled group of rows on one white surface, separated by hairlines. */
export function Group({ label, children, note }: { label?: string; children: ReactNode; note?: string }) {
  const items = (Array.isArray(children) ? children : [children]).filter(Boolean);
  return (
    <View style={styles.groupWrap}>
      {label ? (
        <Text variant="label" tone="slate" style={styles.groupLabel} accessibilityRole="header">
          {label}
        </Text>
      ) : null}
      <View style={styles.group}>
        {items.map((child, i) => (
          <View key={i}>
            {i > 0 ? <View style={styles.divider} /> : null}
            {child}
          </View>
        ))}
      </View>
      {note ? (
        <Text variant="caption" tone="slate" style={styles.groupNote}>
          {note}
        </Text>
      ) : null}
    </View>
  );
}

export function Row({
  icon,
  title,
  detail,
  right,
  onPress,
  testID,
  accessibilityLabel,
}: {
  icon?: IconName;
  title: string;
  detail?: string;
  right?: ReactNode;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const body = (
    <View style={styles.row}>
      {icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={18} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        {detail ? (
          <Text variant="caption" tone="slate" style={{ marginTop: 2 }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right}
      {onPress && !right ? <Icon name="chevron-right" size={18} tint={color.slate} /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID}>{body}</View>;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      style={({ pressed }) => pressed && { backgroundColor: color.mist }}
    >
      {body}
    </Pressable>
  );
}

/** Custom switch: ink when on. Used for blocking toggles. */
export function Toggle({
  value,
  onChange,
  label,
  disabled,
  testID,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
  label: string;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="switch"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      aria-checked={value}
      aria-disabled={!!disabled}
      disabled={disabled}
      onPress={() => onChange(!value)}
      hitSlop={8}
      style={[styles.track, value && styles.trackOn, disabled && { opacity: 0.45 }]}
    >
      <View style={[styles.knob, value && styles.knobOn]} />
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  testID,
  accessibilityLabel,
  style,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  testID?: string;
  accessibilityLabel?: string;
  style?: ViewStyle;
}) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected }}
      aria-selected={selected}
      style={[styles.chip, selected && styles.chipOn, style]}
    >
      <Text variant="label" style={{ color: selected ? color.onInk : color.ink }}>
        {label}
      </Text>
    </Pressable>
  );
}

type NoticeTone = 'pending' | 'alert' | 'calm' | 'info';

export function Notice({
  tone = 'info',
  icon,
  title,
  body,
  action,
  testID,
}: {
  tone?: NoticeTone;
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
  testID?: string;
}) {
  const bg = { pending: color.pendingTint, alert: color.alertTint, calm: color.calmTint, info: color.mist }[tone];
  const tint = { pending: color.ink, alert: color.alert, calm: color.calm, info: color.ink }[tone];
  return (
    <View
      testID={testID}
      style={[styles.notice, { backgroundColor: bg }]}
      accessibilityRole="summary"
      accessible
      accessibilityLabel={body ? `${title}. ${body}` : title}
    >
      {icon ? <Icon name={icon} size={18} tint={tint} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="bodyStrong" style={{ color: tint }}>
          {title}
        </Text>
        {body ? <Text variant="caption">{body}</Text> : null}
        {action}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.paper },
  scroll: { paddingHorizontal: space.lg + 4, paddingBottom: space.xxxl },
  titleBlock: { paddingTop: space.xl, paddingBottom: space.xl },
  footer: {
    paddingHorizontal: space.lg + 4,
    paddingTop: space.md,
    paddingBottom: space.lg,
    backgroundColor: color.paper,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.hairline,
  },
  groupWrap: { marginBottom: space.xl },
  groupLabel: { marginBottom: space.sm, marginLeft: space.xs },
  groupNote: { marginTop: space.sm, marginHorizontal: space.xs },
  group: { backgroundColor: color.surface, borderRadius: radius.group, overflow: 'hidden' },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: color.hairline, marginLeft: space.lg },
  row: {
    minHeight: touch + 16,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  rowIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: color.mist,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    width: 50,
    height: 30,
    borderRadius: radius.pill,
    backgroundColor: color.hairline,
    padding: 3,
    justifyContent: 'center',
  },
  trackOn: { backgroundColor: color.ink },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: color.surface },
  knobOn: { alignSelf: 'flex-end' },
  chip: {
    minHeight: 40,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: color.hairline,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: color.ink, borderColor: color.ink },
  notice: {
    flexDirection: 'row',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.group,
    alignItems: 'flex-start',
  },
});
