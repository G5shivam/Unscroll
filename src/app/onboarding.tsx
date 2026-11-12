import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SURFACES, type SurfaceSettings } from '../core/types';
import { t } from '../i18n';
import { useController, useUnscroll } from '../state/provider';
import { Button } from '../ui/Button';
import { surfaceDetail, surfaceName } from '../ui/copy';
import { Group, Icon, Notice, Row, Screen, Toggle, type IconName } from '../ui/primitives';
import { Text } from '../ui/Text';
import { color, radius, space } from '../ui/theme';

const IOS = Platform.OS === 'ios';
const STEPS = 3;

export default function Onboarding() {
  const [step, setStep] = useState(0);
  return (
    <View style={{ flex: 1, backgroundColor: color.paper }}>
      {step === 0 && <Welcome onNext={() => setStep(1)} />}
      {step === 1 && <Disclosure onNext={() => setStep(2)} />}
      {step === 2 && <Permissions onNext={() => setStep(3)} />}
      {step === 3 && <Defaults />}
    </View>
  );
}

function StepCaption({ n }: { n: number }) {
  return (
    <Text variant="label" tone="slate" style={{ marginBottom: space.sm }}>
      {t('step', { n, total: STEPS })}
    </Text>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <Screen
      testID="onboarding-welcome"
      edges={['top', 'bottom']}
      footer={<Button label={t('get_started')} onPress={onNext} testID="get-started" />}
    >
      <View style={{ paddingTop: space.xxxl }}>
        <View style={styles.mark}>
          <View style={styles.markStroke} />
          <Text variant="hero" style={{ position: 'relative' }}>
            Unscroll
          </Text>
        </View>
        <Text variant="title" style={{ marginTop: space.xl }}>
          {t('tagline')}
        </Text>
        <Text tone="slate" style={{ marginTop: space.md, maxWidth: 360 }}>
          {t('welcome_body')}
        </Text>
      </View>
      <View style={{ marginTop: space.xxl, gap: space.xl }}>
        <Rule
          icon="eye-off"
          title={t('rule1_title')}
          body={t('rule1_body')}
        />
        <Rule
          icon="lock"
          title={t('rule2_title')}
          body={t('rule2_body')}
        />
        <Rule
          icon="log-out"
          title={t('rule3_title')}
          body={t('rule3_body')}
        />
      </View>
    </Screen>
  );
}

function Rule({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: space.lg }}>
      <View style={styles.ruleIcon}>
        <Icon name={icon} size={18} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong">{title}</Text>
        <Text tone="slate" variant="caption" style={{ marginTop: 2 }}>
          {body}
        </Text>
      </View>
    </View>
  );
}

function Disclosure({ onNext }: { onNext: () => void }) {
  const ctrl = useController();
  const [agreed, setAgreed] = useState(false);
  const accept = async () => {
    await ctrl.acceptDisclosure();
    onNext();
  };
  return (
    <Screen
      testID="onboarding-disclosure"
      edges={['top', 'bottom']}
      footer={
        <Button label={t('agree_continue')} onPress={accept} disabled={!agreed} testID="agree-continue" />
      }
    >
      <View style={{ paddingTop: space.xl }}>
        <StepCaption n={1} />
        <Text variant="title" accessibilityRole="header">
          {t('disclosure_title')}
        </Text>
        <Text tone="slate" style={{ marginTop: space.md }}>
          {IOS
            ? t('disclosure_ios')
            : t('disclosure_android')}
        </Text>
      </View>
      <View style={{ marginTop: space.xl }}>
        <Group>
          <Row icon="smartphone" title={t('nothing_leaves')} detail={t('d_no_server')} />
          <Row
            icon="message-circle"
            title={t('d_never_stored')}
            detail={t('d_discarded')}
          />
          <Row icon="bar-chart-2" title={t('d_counts')} detail={t('d_counts_detail')} />
        </Group>
      </View>
      <Pressable
        testID="consent-check"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        aria-checked={agreed}
        accessibilityLabel={t('consent')}
        onPress={() => setAgreed((v) => !v)}
        style={styles.consent}
      >
        <View style={[styles.box, agreed && styles.boxOn]}>
          {agreed ? <Icon name="check" size={16} tint={color.onInk} /> : null}
        </View>
        <Text style={{ flex: 1 }}>{t('consent')}</Text>
      </Pressable>
    </Screen>
  );
}

function Permissions({ onNext }: { onNext: () => void }) {
  const ctrl = useController();
  const { status } = useUnscroll();
  const [picked, setPicked] = useState(0);
  const enabled = !!status?.blockerEnabled;
  const authorized = IOS ? !!status?.authorized : enabled;
  const ready = IOS ? authorized && (picked > 0 || (status?.selectedCount ?? 0) > 0) : enabled;

  return (
    <Screen
      testID="onboarding-permissions"
      edges={['top', 'bottom']}
      footer={<Button label={t('continue')} onPress={onNext} disabled={!ready} testID="permissions-continue" />}
    >
      <View style={{ paddingTop: space.xl }}>
        <StepCaption n={2} />
        <Text variant="title" accessibilityRole="header">
          {IOS ? t('perm_title_ios') : t('perm_title_android')}
        </Text>
        <Text tone="slate" style={{ marginTop: space.md }}>
          {IOS
            ? t('perm_body_ios')
            : t('perm_body_android')}
        </Text>
      </View>
      <View style={{ marginTop: space.xl }}>
        <Group>
          <Row
            icon="shield"
            title={IOS ? t('screen_time_access') : t('perm_row_android')}
            detail={authorized ? t('on') : t('off')}
            testID="perm-row"
            right={
              authorized ? (
                <Icon name="check-circle" tint={color.calm} />
              ) : (
                <Button
                  kind="secondary"
                  label={IOS ? t('allow') : t('open_settings')}
                  onPress={() => void ctrl.requestPermission()}
                  testID="perm-open"
                  style={{ minHeight: 40, paddingHorizontal: space.lg }}
                />
              )
            }
          />
          {IOS ? (
            <Row
              icon="instagram"
              title={t('choose_ig')}
              detail={picked > 0 || (status?.selectedCount ?? 0) > 0 ? t('selected') : t('not_chosen')}
              right={
                <Button
                  kind="secondary"
                  label={t('choose')}
                  disabled={!authorized}
                  onPress={async () => setPicked(await ctrl.pickApps())}
                  style={{ minHeight: 40, paddingHorizontal: space.lg }}
                />
              }
            />
          ) : (
            <Row
              icon="battery-charging"
              title={t('keep_bg')}
              detail={t('keep_bg_detail')}
              onPress={() => void ctrl.openBatterySettings()}
              testID="battery-row"
            />
          )}
        </Group>
      </View>
      {!IOS ? (
        <Notice
          icon="info"
          title={t('why_android_title')}
          body={t('why_android_body')}
        />
      ) : null}
    </Screen>
  );
}


function Defaults() {
  const ctrl = useController();
  const { state } = useUnscroll();
  const [surfaces, setSurfaces] = useState<SurfaceSettings>({ ...state.policy.surfaces });
  const [busy, setBusy] = useState(false);
  const finish = async () => {
    setBusy(true);
    await ctrl.setInitialSurfaces(surfaces);
    await ctrl.completeOnboarding();
    router.replace('/(tabs)');
  };
  return (
    <Screen
      testID="onboarding-defaults"
      edges={['top', 'bottom']}
      footer={<Button label={t('finish_setup')} onPress={finish} busy={busy} testID="finish-setup" />}
    >
      <View style={{ paddingTop: space.xl }}>
        <StepCaption n={3} />
        <Text variant="title" accessibilityRole="header">
          {t('defaults_title')}
        </Text>
        <Text tone="slate" style={{ marginTop: space.md }}>
          {t('defaults_body')}
        </Text>
      </View>
      <View style={{ marginTop: space.xl }}>
        <Group note={t('defaults_note')}>
          {SURFACES.map((key) => ({ key, title: surfaceName(key), detail: surfaceDetail(key) })).map((s) => (
            <Row
              key={s.key}
              title={s.title}
              detail={s.detail}
              right={
                <Toggle
                  testID={`default-${s.key}`}
                  label={t('hide_x', { name: s.title })}
                  value={surfaces[s.key]}
                  onChange={(v) => setSurfaces((cur) => ({ ...cur, [s.key]: v }))}
                />
              }
            />
          ))}
        </Group>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  mark: { alignSelf: 'flex-start', position: 'relative' },
  markStroke: {
    position: 'absolute',
    left: -4,
    right: -6,
    bottom: 6,
    height: 18,
    backgroundColor: color.highlighter,
    borderRadius: 3,
    transform: [{ rotate: '-1.5deg' }],
  },
  ruleIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.control,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  consent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingVertical: space.lg,
    marginTop: space.sm,
  },
  box: {
    width: 26,
    height: 26,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: color.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxOn: { backgroundColor: color.ink },
});
