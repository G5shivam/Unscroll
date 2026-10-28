import { StyleSheet, View } from 'react-native';
import type { FocusStatus, Schedule, SurfaceSettings } from '../core/types';
import { countdownParts, formatClock } from './format';
import { Icon } from './primitives';
import { Text } from './Text';
import { color, font, radius, space } from './theme';

const SURFACE_LABEL: Record<keyof SurfaceSettings, string> = {
  feed: 'Feed',
  reels: 'Reels',
  explore: 'Explore',
  stories: 'Stories',
};

/** The signature element: the state of the lock, at a glance. */
export function LockPanel({
  focus,
  surfaces,
  schedules,
}: {
  focus: FocusStatus;
  surfaces: SurfaceSettings;
  schedules: Schedule[];
}) {
  if (focus.active) {
    const { h, m, s } = countdownParts(focus.remainingMs);
    const sched = focus.source === 'schedule' ? schedules.find((x) => x.id === focus.scheduleId) : undefined;
    const spoken = `Instagram is locked. ${Number(h)} hours ${Number(m)} minutes remaining. Unlocks at ${formatClock(focus.endsAt)}.`;
    return (
      <View style={[styles.panel, styles.locked]} testID="lock-panel-locked" accessible accessibilityLabel={spoken}>
        <View style={styles.headRow}>
          <Icon name="lock" size={16} tint={color.highlighter} />
          <Text variant="label" tone="onInkMuted">
            {sched ? sched.name : 'Focus session'}
          </Text>
        </View>
        <Text variant="heading" tone="onInk" style={{ marginTop: space.lg }}>
          Instagram is locked
        </Text>
        <View style={styles.countRow}>
          <Digits value={h} />
          <Text style={styles.colon}>:</Text>
          <Digits value={m} />
          <Text style={styles.colon}>:</Text>
          <Digits value={s} />
        </View>
        <View style={styles.untilRow}>
          <Text variant="bodyStrong" tone="onInk">
            Unlocks at{' '}
          </Text>
          <View style={styles.marker}>
            <Text variant="bodyStrong" style={{ color: color.ink }} testID="unlock-time">
              {formatClock(focus.endsAt)}
            </Text>
          </View>
        </View>
        <Text variant="caption" tone="onInkMuted" style={{ marginTop: space.lg }}>
          There’s no stop button. Switching Unscroll off or uninstalling it resets your streak.
        </Text>
      </View>
    );
  }

  const hidden = (Object.keys(SURFACE_LABEL) as (keyof SurfaceSettings)[]).filter((k) => surfaces[k]);
  return (
    <View style={[styles.panel, styles.open]} testID="lock-panel-open">
      <View style={styles.headRow}>
        <Icon name="eye-off" size={16} tint={color.slate} />
        <Text variant="label" tone="slate">
          Instagram is open
        </Text>
      </View>
      <Text variant="title" style={{ marginTop: space.md }}>
        {hidden.length > 0 ? `${joinList(hidden.map((k) => SURFACE_LABEL[k]))} hidden` : 'Nothing hidden'}
      </Text>
      <Text tone="slate" style={{ marginTop: space.xs }}>
        {hidden.length > 0 ? 'Messages, posting and your profile work as usual.' : 'Turn on hiding in Settings.'}
      </Text>
    </View>
  );
}

function Digits({ value }: { value: string }) {
  return (
    <View style={styles.digitPair}>
      {value.split('').map((d, i) => (
        <Text key={i} style={styles.digit}>
          {d}
        </Text>
      ))}
    </View>
  );
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const styles = StyleSheet.create({
  panel: { borderRadius: radius.panel, padding: space.xl, marginBottom: space.xl },
  locked: { backgroundColor: color.ink },
  open: { backgroundColor: color.surface },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  countRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: space.sm },
  digitPair: { flexDirection: 'row' },
  digit: {
    fontFamily: font.displayHeavy,
    fontSize: 64,
    lineHeight: 72,
    color: color.highlighter,
    width: 38,
    textAlign: 'center',
  },
  colon: { fontFamily: font.display, fontSize: 48, lineHeight: 72, color: color.highlighterDeep, marginHorizontal: 2 },
  untilRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, flexWrap: 'wrap' },
  marker: {
    backgroundColor: color.highlighter,
    paddingHorizontal: 6,
    borderRadius: 4,
    transform: [{ rotate: '-1deg' }],
  },
});
