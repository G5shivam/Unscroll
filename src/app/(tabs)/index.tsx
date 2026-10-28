import { router } from 'expo-router';
import { Platform, View } from 'react-native';
import { DAY } from '../../core/constants';
import { realEnv } from '../../core/env';
import { nextStart } from '../../core/next';
import { useController, useUnscroll } from '../../state/provider';
import { Button } from '../../ui/Button';
import { formatClock, formatDuration } from '../../ui/format';
import { LockPanel } from '../../ui/LockPanel';
import { Group, Icon, Notice, Row, Screen } from '../../ui/primitives';
import { Text } from '../../ui/Text';
import { color, space } from '../../ui/theme';

export default function Today() {
  const { state, now, focus, status } = useUnscroll();
  const ctrl = useController();
  const blockerOff = status !== null && !status.blockerEnabled;
  const next = nextStart(state.policy.schedules, now, realEnv.toLocal);

  const today = realEnv.dayKey(now);
  const blockedToday = state.stats.blocks[today] ?? 0;
  let weekMinutes = 0;
  for (let i = 0; i < 7; i++) weekMinutes += state.stats.focusMinutes[realEnv.dayKey(now - i * DAY)] ?? 0;

  const dateLine = new Date(now).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <Screen title="Today" subtitle={dateLine} testID="screen-today">
      {blockerOff ? (
        <View style={{ marginBottom: space.xl }}>
          <Notice
            tone="alert"
            icon="alert-triangle"
            title="Blocking is off"
            body={
              Platform.OS === 'ios'
                ? 'Screen Time access was turned off, so Instagram is not locked.'
                : 'Unscroll was switched off in Accessibility, so Instagram is not blocked.'
            }
            testID="blocker-off"
            action={
              <Button
                kind="secondary"
                label="Turn it back on"
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
            label="Extend focus"
            onPress={() => router.push('/focus')}
            testID="extend-focus"
          />
        ) : (
          <Button label="Start focus" onPress={() => router.push('/focus')} testID="start-focus" />
        )}
        {Platform.OS === 'ios' ? (
          <Button
            kind="secondary"
            label="Open Instagram"
            onPress={() => router.push('/instagram')}
            testID="open-clean-instagram"
            accessibilityHint="Opens Instagram inside Unscroll with the feed and Reels removed"
          />
        ) : null}
      </View>

      <Group label="Next lock">
        {next ? (
          <Row
            icon="clock"
            title={next.schedule.name}
            detail={`${relativeDay(next.startsAt, now)} at ${formatClock(next.startsAt)}`}
            onPress={() => router.push(`/schedule/${next.schedule.id}`)}
            testID="next-lock"
          />
        ) : (
          <Row
            icon="plus"
            title="Add your study or work hours"
            detail="Instagram will lock on its own at those times."
            onPress={() => router.push('/schedule/new')}
            testID="add-first-schedule"
          />
        )}
      </Group>

      <Group label="Progress">
        <Row
          icon="shield"
          title="Feed and Reels stopped"
          right={<Value testID="stat-blocked">{blockedToday === 1 ? '1 time' : `${blockedToday} times`}</Value>}
          detail="Today"
        />
        <Row
          icon="target"
          title="Focus time"
          detail="Last 7 days"
          right={<Value testID="stat-focus">{weekMinutes > 0 ? formatDuration(weekMinutes * 60_000) : '—'}</Value>}
        />
        <Row
          icon="award"
          title="Streak"
          detail={state.streak.best > 0 ? `Best ${state.streak.best} days` : 'Finish a focus to start one'}
          right={
            <Value testID="stat-streak">
              {state.streak.current === 1 ? '1 day' : `${state.streak.current} days`}
            </Value>
          }
        />
      </Group>
      {focus.active ? (
        <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
          <Icon name="info" size={14} tint={color.slate} />
          <Text variant="caption" tone="slate" style={{ flex: 1 }}>
            Schedules and settings that loosen the lock wait until this focus ends.
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
  if (a === realEnv.dayKey(now)) return 'Today';
  if (a === realEnv.dayKey(now + DAY)) return 'Tomorrow';
  return new Date(at).toLocaleDateString('en-IN', { weekday: 'long' });
}
