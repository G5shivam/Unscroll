import { StyleSheet, View } from 'react-native';
import { weekHeadline, type WeekInsight } from '../core/insights';
import { t } from '../i18n';
import { headlineText } from './copy';
import { dayLetters, formatDuration } from './format';
import { Text } from './Text';
import { color, radius, space } from './theme';

const BAR_MAX = 72;

/** Seven-day focus chart. Bars are focus minutes; the number under each is blocked attempts. */
export function WeekCard({ week }: { week: WeekInsight }) {
  const peak = Math.max(60, ...week.days.map((d) => d.focusMinutes));
  const trend = week.focusMinutes - week.prevFocusMinutes;
  const headline = headlineText(weekHeadline(week));
  const letters = dayLetters();
  const summary = t('week_a11y', { d: formatDuration(week.focusMinutes * 60_000), n: week.blocks });

  return (
    <View style={styles.card} testID="week-card" accessible accessibilityLabel={`${headline} ${summary}`}>
      <Text variant="bodyStrong" testID="week-headline">
        {headline}
      </Text>
      <View style={styles.chart}>
        {week.days.map((d) => {
          const h = d.focusMinutes > 0 ? Math.max(6, Math.round((d.focusMinutes / peak) * BAR_MAX)) : 3;
          return (
            <View key={d.key} style={styles.col}>
              <View style={styles.track}>
                <View
                  style={[
                    styles.bar,
                    { height: h },
                    d.focusMinutes > 0 ? styles.barOn : styles.barOff,
                    d.isToday && d.focusMinutes > 0 && styles.barToday,
                  ]}
                />
              </View>
              <Text variant="caption" tone={d.isToday ? undefined : 'slate'} style={d.isToday ? styles.today : undefined}>
                {letters[d.dow]}
              </Text>
            </View>
          );
        })}
      </View>
      <View style={styles.totals}>
        <Total
          label={t('week_focus')}
          value={week.focusMinutes > 0 ? formatDuration(week.focusMinutes * 60_000) : '—'}
          note={
            week.prevFocusMinutes > 0 && trend !== 0
              ? t('week_vs_last', { sign: trend > 0 ? '+' : '−', d: formatDuration(Math.abs(trend) * 60_000) })
              : undefined
          }
          testID="stat-focus"
        />
        <Total label={t('week_stopped')} value={String(week.blocks)} testID="week-blocks" />
      </View>
    </View>
  );
}

function Total({ label, value, note, testID }: { label: string; value: string; note?: string; testID?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <Text variant="caption" tone="slate">
        {label}
      </Text>
      <Text variant="heading" testID={testID}>
        {value}
      </Text>
      {note ? (
        <Text variant="caption" tone="slate">
          {note}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: color.surface, borderRadius: radius.group, padding: space.lg, gap: space.lg },
  chart: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  col: { alignItems: 'center', gap: space.xs, flex: 1 },
  track: { height: BAR_MAX, justifyContent: 'flex-end' },
  bar: { width: 18, borderRadius: 6 },
  barOn: { backgroundColor: color.ink },
  barOff: { backgroundColor: color.hairline },
  barToday: { backgroundColor: color.calm },
  today: { fontWeight: '700', color: color.ink },
  totals: { flexDirection: 'row', gap: space.lg },
});
