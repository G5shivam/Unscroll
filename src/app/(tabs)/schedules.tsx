import { router } from 'expo-router';
import { View } from 'react-native';
import { realEnv } from '../../core/env';
import { minutesUntilEnd } from '../../core/schedule';
import { t } from '../../i18n';
import { useUnscroll } from '../../state/provider';
import { Button } from '../../ui/Button';
import { formatDays, formatRange, formatUntil } from '../../ui/format';
import { Group, Icon, Notice, Row, Screen } from '../../ui/primitives';
import { Text } from '../../ui/Text';
import { color, radius, space } from '../../ui/theme';

export default function Schedules() {
  const { state, now } = useUnscroll();
  const local = realEnv.toLocal(now);
  const { schedules } = state.policy;

  return (
    <Screen title={t('schedules_title')} subtitle={t('schedules_subtitle')} testID="screen-schedules">
      {schedules.length === 0 ? (
        <View style={{ marginBottom: space.xl }}>
          <Notice
            icon="calendar"
            title={t('no_schedules_title')}
            body={t('no_schedules_body')}
          />
        </View>
      ) : (
        <Group>
          {schedules.map((s) => {
            const running = minutesUntilEnd(s, local) >= 0;
            const pending = state.pending.find((p) => p.scheduleId === s.id);
            return (
              <Row
                key={s.id}
                testID={`schedule-${s.id}`}
                title={s.name}
                detail={
                  pending
                    ? t(pending.kind === 'schedule-delete' ? 'removal_takes' : 'change_takes', {
                        when: formatUntil(pending.effectiveAt, now),
                      })
                    : `${formatDays(s.days)}, ${formatRange(s.startMin, s.endMin)}`
                }
                onPress={() => router.push(`/schedule/${s.id}`)}
                right={
                  running ? (
                    <View style={badge}>
                      <Icon name="lock" size={12} tint={color.ink} />
                      <Text variant="caption" style={{ color: color.ink }}>
                        {t('running')}
                      </Text>
                    </View>
                  ) : undefined
                }
              />
            );
          })}
        </Group>
      )}
      <Button label={t('new_schedule')} kind={schedules.length ? 'secondary' : 'primary'} onPress={() => router.push('/schedule/new')} testID="new-schedule" />
    </Screen>
  );
}

const badge = {
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 4,
  backgroundColor: color.highlighter,
  paddingHorizontal: space.sm,
  paddingVertical: 4,
  borderRadius: radius.pill,
};
