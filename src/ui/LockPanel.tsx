import { StyleSheet, View } from 'react-native';
import type { FocusStatus, Schedule, SurfaceSettings } from '../core/types';
import { joinList, t } from '../i18n';
import { alternativeText, surfaceShort } from './copy';
import { countdownParts, formatClock } from './format';
import { Icon } from './primitives';
import { Text } from './Text';
import { color, font, radius, space } from './theme';

const SURFACE_ORDER: (keyof SurfaceSettings)[] = ['feed', 'reels', 'explore', 'stories'];

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
    const spoken = t('lock_a11y', { h: Number(h), m: Number(m), time: formatClock(focus.endsAt) });
    return (
      <View style={[styles.panel, styles.locked]} testID="lock-panel-locked" accessible accessibilityLabel={spoken}>
        <View style={styles.headRow}>
          <Icon name="lock" size={16} tint={color.highlighter} />
          <Text variant="label" tone="onInkMuted">
            {sched ? sched.name : t('lock_session')}
          </Text>
        </View>
        <Text variant="heading" tone="onInk" style={{ marginTop: space.lg }}>
          {t('lock_title')}
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
            {t('unlocks_at')}{' '}
          </Text>
          <View style={styles.marker}>
            <Text variant="bodyStrong" style={{ color: color.ink }} testID="unlock-time">
              {formatClock(focus.endsAt)}
            </Text>
          </View>
        </View>
        <View style={styles.instead} testID="lock-alternative">
          <Text variant="label" tone="onInkMuted">
            {t('instead')}
          </Text>
          <Text variant="body" tone="onInk" style={{ marginTop: 2 }}>
            {alternativeText(focus.endsAt)}
          </Text>
        </View>
        <Text variant="caption" tone="onInkMuted" style={{ marginTop: space.lg }}>
          {t('lock_note')}
        </Text>
      </View>
    );
  }

  const hidden = SURFACE_ORDER.filter((k) => surfaces[k]);
  return (
    <View style={[styles.panel, styles.open]} testID="lock-panel-open">
      <View style={styles.headRow}>
        <Icon name="eye-off" size={16} tint={color.slate} />
        <Text variant="label" tone="slate">
          {t('open_label')}
        </Text>
      </View>
      <Text variant="title" style={{ marginTop: space.md }}>
        {hidden.length > 0 ? t('hidden_list', { list: joinList(hidden.map(surfaceShort)) }) : t('nothing_hidden')}
      </Text>
      <Text tone="slate" style={{ marginTop: space.xs }}>
        {hidden.length > 0 ? t('open_body') : t('open_body_none')}
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
  instead: {
    marginTop: space.lg,
    paddingTop: space.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: color.inkSoft,
  },
  untilRow: { flexDirection: 'row', alignItems: 'center', marginTop: space.sm, flexWrap: 'wrap' },
  marker: {
    backgroundColor: color.highlighter,
    paddingHorizontal: 6,
    borderRadius: 4,
    transform: [{ rotate: '-1deg' }],
  },
});
