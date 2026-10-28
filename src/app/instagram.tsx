import { router } from 'expo-router';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewNavigation } from 'react-native-webview';
import {
  START_URL,
  blockedSurface,
  buildInjectedScript,
  configFor,
  isAllowedNavigation,
  parsePageMessage,
} from '../inject/config';
import { useController, useUnscroll } from '../state/provider';
import { LockPanel } from '../ui/LockPanel';
import { Icon, Notice, Screen } from '../ui/primitives';
import { Text } from '../ui/Text';
import { color, space } from '../ui/theme';

/** Safari-like suffix: Instagram treats unknown in-app browsers with more login checks. */
const UA_SUFFIX = 'Version/26.0 Mobile/15E148 Safari/604.1';

/**
 * Clean Instagram (iOS): instagram.com with Feed, Reels and Explore removed.
 * During Focus the web view is unmounted entirely, so nothing can load.
 */
export default function CleanInstagram() {
  const { state, focus } = useUnscroll();
  const ctrl = useController();
  const cfg = useMemo(() => configFor(state.policy.surfaces), [state.policy.surfaces]);
  const script = useMemo(() => buildInjectedScript(cfg), [cfg]);

  if (Platform.OS !== 'ios') {
    return (
      <Screen title="Instagram" edges={['top', 'bottom']}>
        <Notice
          icon="info"
          title="Use the Instagram app"
          body="On Android, Unscroll blocks the feed and Reels inside the official Instagram app, so you don’t need this view."
        />
        <Pressable onPress={() => router.back()} style={{ marginTop: space.xl }} accessibilityRole="button">
          <Text variant="bodyStrong">Close</Text>
        </Pressable>
      </Screen>
    );
  }

  const onNav = (req: WebViewNavigation & { isTopFrame?: boolean }): boolean => {
    // Sub-frames (e.g. a login captcha) can't take over the page; allow https only.
    if (req.isTopFrame === false) return req.url.startsWith('https://');
    if (!isAllowedNavigation(req.url)) return false;
    if (blockedSurface(req.url, cfg)) {
      void ctrl.recordCleanBlock();
      return false;
    }
    return true;
  };

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.bar}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Close Instagram" hitSlop={12}>
          <Icon name="x" size={22} />
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text variant="bodyStrong">Instagram</Text>
          <Text variant="caption" tone="slate">
            Feed and Reels hidden
          </Text>
        </View>
        <View style={{ width: 22 }} />
      </View>
      {focus.active ? (
        <View style={{ padding: space.lg }}>
          <LockPanel focus={focus} surfaces={state.policy.surfaces} schedules={state.policy.schedules} />
        </View>
      ) : (
        <WebView
          source={{ uri: START_URL }}
          injectedJavaScriptBeforeContentLoaded={script}
          injectedJavaScriptForMainFrameOnly
          injectedJavaScriptBeforeContentLoadedForMainFrameOnly
          onShouldStartLoadWithRequest={onNav}
          onMessage={(e: { nativeEvent: { data: string } }) => {
            if (parsePageMessage(e.nativeEvent.data)) void ctrl.recordCleanBlock();
          }}
          originWhitelist={['https://*']}
          applicationNameForUserAgent={UA_SUFFIX}
          javaScriptCanOpenWindowsAutomatically={false}
          allowsLinkPreview={false}
          allowsBackForwardNavigationGestures
          mediaPlaybackRequiresUserAction
          dataDetectorTypes="none"
          style={{ flex: 1 }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: color.hairline,
  },
});
