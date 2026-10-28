import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import type { Surface, SurfaceSettings } from '../core/types';
import { useController, useUnscroll } from '../state/provider';
import { Button } from '../ui/Button';
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
      Step {n} of {STEPS}
    </Text>
  );
}

function Welcome({ onNext }: { onNext: () => void }) {
  return (
    <Screen
      testID="onboarding-welcome"
      edges={['top', 'bottom']}
      footer={<Button label="Get started" onPress={onNext} testID="get-started" />}
    >
      <View style={{ paddingTop: space.xxxl }}>
        <View style={styles.mark}>
          <View style={styles.markStroke} />
          <Text variant="hero" style={{ position: 'relative' }}>
            Unscroll
          </Text>
        </View>
        <Text variant="title" style={{ marginTop: space.xl }}>
          Keep your messages.{'\n'}Lose the scroll.
        </Text>
        <Text tone="slate" style={{ marginTop: space.md, maxWidth: 360 }}>
          Unscroll hides Instagram’s feed and Reels, and locks the whole app during the hours you choose to
          focus.
        </Text>
      </View>
      <View style={{ marginTop: space.xxl, gap: space.xl }}>
        <Rule
          icon="eye-off"
          title="Feed and Reels stay hidden"
          body="DMs, posting and your profile keep working."
        />
        <Rule
          icon="lock"
          title="A focus lock can’t be cancelled"
          body="Once it starts, it runs to the end. There is no pause button."
        />
        <Rule
          icon="log-out"
          title="Leaving takes a deliberate step"
          body="No stop button. Only switching Unscroll off in your phone’s settings, or uninstalling it, ends a lock, and that resets your streak."
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
        <Button label="Agree and continue" onPress={accept} disabled={!agreed} testID="agree-continue" />
      }
    >
      <View style={{ paddingTop: space.xl }}>
        <StepCaption n={1} />
        <Text variant="title" accessibilityRole="header">
          What Unscroll can see
        </Text>
        <Text tone="slate" style={{ marginTop: space.md }}>
          {IOS
            ? 'Unscroll uses Apple’s Screen Time to lock the Instagram app. You’ll use Instagram inside Unscroll instead, where the feed and Reels are removed. Apple does not let any app see your activity or messages.'
            : 'To find the feed and Reels inside Instagram, Unscroll uses Android’s Accessibility service. It reads the screen only in Instagram, your web browsers, and the Settings pages that could switch Unscroll off.'}
        </Text>
      </View>
      <View style={{ marginTop: space.xl }}>
        <Group>
          <Row icon="smartphone" title="Nothing leaves this phone" detail="Unscroll has no account and no server." />
          <Row
            icon="message-circle"
            title="Messages and posts are never stored"
            detail="Screen content is checked and immediately discarded."
          />
          <Row icon="bar-chart-2" title="Only counts are kept" detail="Blocked attempts and focus minutes, by day." />
        </Group>
      </View>
      <Pressable
        testID="consent-check"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: agreed }}
        aria-checked={agreed}
        accessibilityLabel="I understand how Unscroll uses this permission"
        onPress={() => setAgreed((v) => !v)}
        style={styles.consent}
      >
        <View style={[styles.box, agreed && styles.boxOn]}>
          {agreed ? <Icon name="check" size={16} tint={color.onInk} /> : null}
        </View>
        <Text style={{ flex: 1 }}>I understand how Unscroll uses this permission.</Text>
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
      footer={<Button label="Continue" onPress={onNext} disabled={!ready} testID="permissions-continue" />}
    >
      <View style={{ paddingTop: space.xl }}>
        <StepCaption n={2} />
        <Text variant="title" accessibilityRole="header">
          {IOS ? 'Connect Screen Time' : 'Turn on blocking'}
        </Text>
        <Text tone="slate" style={{ marginTop: space.md }}>
          {IOS
            ? 'Allow access, then pick Instagram in Apple’s list. Unscroll keeps the Instagram app locked and gives you a clean version inside Unscroll.'
            : 'Android opens its Accessibility settings. Tap Unscroll, switch it on, then come back here.'}
        </Text>
      </View>
      <View style={{ marginTop: space.xl }}>
        <Group>
          <Row
            icon="shield"
            title={IOS ? 'Screen Time access' : 'Unscroll in Accessibility'}
            detail={authorized ? 'On' : 'Off'}
            testID="perm-row"
            right={
              authorized ? (
                <Icon name="check-circle" tint={color.calm} />
              ) : (
                <Button
                  kind="secondary"
                  label={IOS ? 'Allow' : 'Open settings'}
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
              title="Choose Instagram"
              detail={picked > 0 || (status?.selectedCount ?? 0) > 0 ? 'Selected' : 'Not chosen yet'}
              right={
                <Button
                  kind="secondary"
                  label="Choose"
                  disabled={!authorized}
                  onPress={async () => setPicked(await ctrl.pickApps())}
                  style={{ minHeight: 40, paddingHorizontal: space.lg }}
                />
              }
            />
          ) : (
            <Row
              icon="battery-charging"
              title="Keep running in the background"
              detail="Recommended on Xiaomi, Vivo, Oppo, Realme and Samsung"
              onPress={() => void ctrl.openBatterySettings()}
              testID="battery-row"
            />
          )}
        </Group>
      </View>
      {!IOS ? (
        <Notice
          icon="info"
          title="Why Android asks about this"
          body="Accessibility is the only way an app can tell the feed apart from your messages. Unscroll does not use it for anything else."
        />
      ) : null}
    </Screen>
  );
}

const SURFACE_COPY: { key: Surface; title: string; detail: string }[] = [
  { key: 'feed', title: 'Home feed', detail: 'Posts and suggestions on the first tab' },
  { key: 'reels', title: 'Reels', detail: 'The Reels tab, and Reels opened from links' },
  { key: 'explore', title: 'Explore', detail: 'The search grid of suggested posts' },
  { key: 'stories', title: 'Stories', detail: 'Off by default. Turn on if they pull you in' },
];

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
      footer={<Button label="Finish setup" onPress={finish} busy={busy} testID="finish-setup" />}
    >
      <View style={{ paddingTop: space.xl }}>
        <StepCaption n={3} />
        <Text variant="title" accessibilityRole="header">
          What should disappear?
        </Text>
        <Text tone="slate" style={{ marginTop: space.md }}>
          These stay hidden all the time, not only during focus.
        </Text>
      </View>
      <View style={{ marginTop: space.xl }}>
        <Group note="You can hide more at any time. Showing something again takes 24 hours.">
          {SURFACE_COPY.map((s) => (
            <Row
              key={s.key}
              title={s.title}
              detail={s.detail}
              right={
                <Toggle
                  testID={`default-${s.key}`}
                  label={`Hide ${s.title}`}
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
