import { router } from 'expo-router';
import { Platform, View } from 'react-native';
import { DAY } from '../../core/constants';
import { realEnv } from '../../core/env';
import { freshStart, weekInsight } from '../../core/insights';
import { nextStart } from '../../core/next';
import { templateByKey, type ScheduleTemplate } from '../../core/templates';
import { useController, useUnscroll } from '../../state/provider';
import { Button } from '../../ui/Button';
import { t, tn } from '../../i18n';
import { templateName, templateWhy } from '../../ui/copy';
import { formatClock, formatDate, formatRange } from '../../ui/format';
import { LockPanel } from '../../ui/LockPanel';
import { Group, Icon, Notice, Row, Screen } from '../../ui/primitives';
import { Text } from '../../ui/Text';
import { color, space } from '../../ui/theme';
import { WeekCard } from '../../ui/WeekCard';

/** Sleep first: late-night scrolling is where the feed costs the most. */
const SUGGESTED = (['sleep', 'study'] as const).map((k) => templateByKey(k)).filter(Boolean) as ScheduleTemplate[];

export default function Today() {
  const { state, now, focus, status } = useUnscroll();
  const ctrl = useController();
  const blockerOff = status !== null && !status.blockerEnabled;
  const next = nextStart(state.policy.schedules, now, realEnv.toLocal);

  const today = realEnv.dayKey(now);
  const blockedToday = state.stats.blocks[today] ?? 0;
  const week = weekInsight(state.stats, now, realEnv.dayKey);
  const fresh = freshStart(state.escapes, state.streak, now);

  const dateLine = formatDate(now, { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Screen title={t('today_title')} subtitle={dateLine} testID="screen-today">
      {blockerOff ? (
        <View style={{ marginBottom: space.xl }}>
          <Notice
            tone="alert"
            icon="alert-triangle"
            title={t('blocker_off_title')}
            body={
              Platform.OS === 'ios'
                ? t('blocker_off_ios')
                : t('blocker_off_android')
            }
            testID="blocker-off"
            action={
              <Button
                kind="secondary"
                label={t('turn_back_on')}
                onPress={() => void ctrl.requestPermission()}
                style={{ marginTop: space.md, alignSelf: 'flex-start', minHeight: 40 }}
              />
            }
          />
        </View>
      ) : null}

      <LockPanel focus={focus} surfaces={state.policy.surfaces} schedules={state.policy.schedules} />

      <View style={{ marginBottom: space.xl, gap: space.md }}>
        {focus.active ? (
          <Button
            kind="secondary"
            label={t('extend_focus')}
            onPress={() => router.push('/focus')}
            testID="extend-focus"
          />
        ) : (
          <Button label={t('start_focus')} onPress={() => router.push('/focus')} testID="start-focus" />
        )}
        {Platform.OS === 'ios' ? (
          <Button
            kind="secondary"
            label={t('open_instagram')}
            onPress={() => router.push('/instagram')}
            testID="open-clean-instagram"
            accessibilityHint={t('open_instagram_hint')}
          />
        ) : null}
      </View>

      {fresh ? (
        <View style={{ marginBottom: space.xl }}>
          <Notice
            tone="calm"
            icon="sunrise"
            title={t('fresh_title')}
            body={
              fresh.best > 0 ? tn('fresh_body_best', fresh.best) : t('fresh_body')
            }
            testID="fresh-start"
          />
        </View>
      ) : null}

      {next ? (
        <Group label={t('next_lock')}>
          <Row
            icon="clock"
            title={next.schedule.name}
            detail={t('next_at', { day: relativeDay(next.startsAt, now), time: formatClock(next.startsAt) })}
            onPress={() => router.push(`/schedule/${next.schedule.id}`)}
            testID="next-lock"
          />
        </Group>
      ) : (
        <Group label={t('suggested')} note={t('suggested_note')}>
          {SUGGESTED.map((tpl) => (
            <Row
              key={tpl.key}
              icon={tpl.key === 'sleep' ? 'moon' : 'book-open'}
              title={templateName(tpl.key)}
              detail={`${formatRange(tpl.startMin, tpl.endMin)} · ${templateWhy(tpl.key)}`}
              onPress={() => router.push(`/schedule/new?template=${tpl.key}`)}
              testID={tpl.key === 'study' ? 'add-first-schedule' : `suggest-${tpl.key}`}
            />
          ))}
        </Group>
      )}

      <Group label={t('this_week')}>
        <WeekCard week={week} />
      </Group>

      <Group label={t('today_group')}>
        <Row
          icon="shield"
          title={t('stat_blocked_title')}
          right={<Value testID="stat-blocked">{tn('times', blockedToday)}</Value>}
          detail={t('stat_blocked_detail')}
        />
        <Row
          icon="award"
          title={t('streak')}
          detail={state.streak.best > 0 ? tn('streak_best', state.streak.best) : t('streak_none')}
          right={
            <Value testID="stat-streak">
              {tn('days', state.streak.current)}
            </Value>
          }
        />
      </Group>
      {focus.active ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Icon name="info" size={14} tint={color.slate} />
          <Text variant="caption" tone="slate" style={{ flex: 1 }}>
            {t('focus_active_note')}
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

function Value({ children, testID }: { children: string; testID?: string }) {
  return (
    <Text variant="bodyStrong" testID={testID}>
      {children}
    </Text>
  );
}

function relativeDay(at: number, now: number): string {
  const a = realEnv.dayKey(at);
  if (a === realEnv.dayKey(now)) return t('day_today');
  if (a === realEnv.dayKey(now + DAY)) return t('day_tomorrow');
  return formatDate(at, { weekday: 'long' });
}
