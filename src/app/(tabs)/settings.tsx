import Constants from 'expo-constants';
import { useState } from 'react';
import { Platform, View } from 'react-native';
import type { Surface } from '../../core/types';
import { useController, useUnscroll } from '../../state/provider';
import { Button } from '../../ui/Button';
import { formatUntil } from '../../ui/format';
import { Group, Notice, Row, Screen, Toggle } from '../../ui/primitives';
import { Text } from '../../ui/Text';
import { space } from '../../ui/theme';

const SURFACES: { key: Surface; title: string }[] = [
  { key: 'feed', title: 'Home feed' },
  { key: 'reels', title: 'Reels' },
  { key: 'explore', title: 'Explore' },
  { key: 'stories', title: 'Stories' },
];

const SURFACE_NAME: Record<Surface, string> = { feed: 'Home feed', reels: 'Reels', explore: 'Explore', stories: 'Stories' };

export default function Settings() {
  const { state, now, status, enforcerSynced } = useUnscroll();
  const ctrl = useController();
  const [message, setMessage] = useState<string | null>(null);
  const IOS = Platform.OS === 'ios';

  const toggle = async (key: Surface, hide: boolean) => {
    const r = await ctrl.setSurface(key, hide);
    if (!r.ok) setMessage('That change could not be saved. Try again.');
    else if (r.applied === 'pending') setMessage(`${SURFACE_NAME[key]} will show again in 24 hours. You can cancel before then.`);
    else setMessage(null);
  };

  const describe = (p: (typeof state.pending)[number]) => {
    if (p.kind === 'surface-off' && p.surface) return `Show ${SURFACE_NAME[p.surface]} again`;
    const s = state.policy.schedules.find((x) => x.id === p.scheduleId);
    const name = s ? s.name : 'schedule';
    return p.kind === 'schedule-delete' ? `Remove “${name}”` : `Change “${name}”`;
  };

  return (
    <Screen title="Settings" testID="screen-settings">
      {message ? (
        <View style={{ marginBottom: space.xl }}>
          <Notice tone="pending" icon="clock" title="Waiting 24 hours" body={message} testID="settings-message" />
        </View>
      ) : null}

      <Group label="Hidden in Instagram" note="Hiding more takes effect now. Showing something again takes 24 hours.">
        {SURFACES.map((s) => {
          const pending = state.pending.find((p) => p.kind === 'surface-off' && p.surface === s.key);
          return (
            <Row
              key={s.key}
              title={s.title}
              detail={pending ? `Shows again ${formatUntil(pending.effectiveAt, now)}` : undefined}
              right={
                <Toggle
                  testID={`surface-${s.key}`}
                  label={`Hide ${s.title}`}
                  value={state.policy.surfaces[s.key] && !pending}
                  onChange={(v) => void toggle(s.key, v)}
                />
              }
            />
          );
        })}
      </Group>

      {state.pending.length > 0 ? (
        <Group label="Waiting to take effect">
          {state.pending.map((p) => (
            <Row
              key={p.id}
              testID={`pending-${p.id}`}
              title={describe(p)}
              detail={formatUntil(p.effectiveAt, now)}
              right={
                <Button
                  kind="secondary"
                  label="Cancel"
                  testID={`cancel-${p.id}`}
                  onPress={() => void ctrl.cancelPending(p.id)}
                  style={{ minHeight: 40, paddingHorizontal: space.lg }}
                />
              }
            />
          ))}
        </Group>
      ) : null}

      <Group label="Protection">
        <Row
          icon="shield"
          title={IOS ? 'Screen Time access' : 'Blocking service'}
          detail={
            !status?.blockerEnabled
              ? 'Off — Instagram is not blocked'
              : enforcerSynced
                ? 'On'
                : 'On — confirming your latest change'
          }
          testID="protection-row"
          right={
            status?.blockerEnabled ? undefined : (
              <Button
                kind="secondary"
                label="Turn on"
                onPress={() => void ctrl.requestPermission()}
                style={{ minHeight: 40, paddingHorizontal: space.lg }}
              />
            )
          }
        />
        {!IOS ? (
          <Row
            icon="battery-charging"
            title="Background running"
            detail="Stops your phone from switching Unscroll off"
            onPress={() => void ctrl.openBatterySettings()}
          />
        ) : null}
      </Group>

      <Group label="Privacy">
        <Row icon="smartphone" title="Nothing leaves this phone" detail="No account, no server, no ads." />
        <Row
          icon="eye"
          title="What Unscroll checks"
          detail={
            IOS
              ? 'Apple’s Screen Time locks Instagram. Unscroll never sees your activity.'
              : 'Screens in Instagram, browsers and the Settings pages that could switch Unscroll off. Nothing is stored.'
          }
        />
      </Group>

      <Group label="Leaving Unscroll">
        <Row
          icon="trash-2"
          title="Uninstall to remove every block"
          detail={
            IOS
              ? 'Delete Unscroll from your Home Screen. Turning off Screen Time access also ends it and resets your streak.'
              : 'Uninstall Unscroll, or switch it off in Settings › Accessibility. Either one ends a lock and resets your streak.'
          }
        />
      </Group>

      <Text variant="caption" tone="slate" style={{ textAlign: 'center' }}>
        Unscroll {Constants.expoConfig?.version ?? '1.0.0'}
      </Text>
    </Screen>
  );
}
