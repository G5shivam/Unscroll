import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import { SURFACES as SURFACE_KEYS } from '../../core/types';
import type { Surface } from '../../core/types';
import { t } from '../../i18n';
import { surfaceName } from '../../ui/copy';
import { useController, useUnscroll } from '../../state/provider';
import { Button } from '../../ui/Button';
import { Group, Notice, Row, Screen, Toggle } from '../../ui/primitives';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme';


export default function Settings() {
  const { state, status, enforcerSynced } = useUnscroll();
  const ctrl = useController();
  const [message, setMessage] = useState<string | null>(null);
  const IOS = Platform.OS === 'ios';

  const toggle = async (key: Surface, hide: boolean) => {
    const r = await ctrl.setSurface(key, hide);
    if (!r.ok) setMessage(t('msg_failed'));
    else if (r.applied === 'pending') setMessage(t('msg_pending', { name: surfaceName(key) }));
    else setMessage(null);
  };

  const describe = (p: (typeof state.pending)[number]) => {
    if (p.kind === 'surface-off' && p.surface) return t('pending_show', { name: surfaceName(p.surface) });
    const s = state.policy.schedules.find((x) => x.id === p.scheduleId);
    const name = s ? s.name : t('schedule_fallback');
    return p.kind === 'schedule-delete' ? t('pending_remove', { name }) : t('pending_change', { name });
  };

  return (
    <Screen title={t('settings_title')} testID="screen-settings">
      {message ? (
        <View style={{ marginBottom: space.xl }}>
          <Notice tone="pending" icon="clock" title={t('waiting_title')} body={message} testID="settings-message" />
        </View>
      ) : null}

      <Group label={t('hidden_group')} note={t('hidden_note')}>
        {SURFACE_KEYS.map((key) => {
          const s = { key, title: surfaceName(key) };
          const pending = state.pending.find((p) => p.kind === 'surface-off' && p.surface === s.key);
          return (
            <Row
              key={s.key}
              title={s.title}
              detail={pending ? t('after_focus') : undefined}
              right={
                <Toggle
                  testID={`surface-${s.key}`}
                  label={t('hide_x', { name: s.title })}
                  value={state.policy.surfaces[s.key] && !pending}
                  onChange={(v) => void toggle(s.key, v)}
                />
              }
            />
          );
        })}
      </Group>

      {state.pending.length > 0 ? (
        <Group label={t('waiting_group')}>
          {state.pending.map((p) => (
            <Row
              key={p.id}
              testID={`pending-${p.id}`}
              title={describe(p)}
              detail={t('after_focus')}
              right={
                <Button
                  kind="secondary"
                  label={t('cancel')}
                  testID={`cancel-${p.id}`}
                  onPress={() => void ctrl.cancelPending(p.id)}
                  style={{ minHeight: 40, paddingHorizontal: space.lg }}
                />
              }
            />
          ))}
        </Group>
      ) : null}

      <Group label={t('protection')}>
        <Row
          icon="shield"
          title={IOS ? t('screen_time_access') : t('blocking_service')}
          detail={
            !status?.blockerEnabled
              ? t('prot_off')
              : enforcerSynced
                ? t('on')
                : t('prot_confirming')
          }
          testID="protection-row"
          right={
            status?.blockerEnabled ? undefined : (
              <Button
                kind="secondary"
                label={t('turn_on')}
                onPress={() => void ctrl.requestPermission()}
                style={{ minHeight: 40, paddingHorizontal: space.lg }}
              />
            )
          }
        />
        {!IOS ? (
          <Row
            icon="battery-charging"
            title={t('bg_title')}
            detail={t('bg_detail')}
            onPress={() => void ctrl.openBatterySettings()}
          />
        ) : null}
      </Group>

      <Group label={t('privacy')}>
        <Row icon="smartphone" title={t('nothing_leaves')} detail={t('no_account')} />
        <Row
          icon="eye"
          title={t('what_checks')}
          detail={
            IOS
              ? t('checks_ios')
              : t('checks_android')
          }
        />
      </Group>

      <Group label={t('leaving')}>
        <Row
          icon="trash-2"
          title={t('uninstall_title')}
          detail={
            IOS
              ? t('uninstall_ios')
              : t('uninstall_android')
          }
        />
      </Group>

      <Text variant="caption" tone="slate" style={{ textAlign: 'center' }}>
        {t('version', { v: Constants.expoConfig?.version ?? '1.0.0' })}
      </Text>
    </Screen>
  );
}
