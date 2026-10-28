import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

export function haptic(kind: 'light' | 'success' | 'warning'): void {
  if (Platform.OS === 'web') return;
  const run =
    kind === 'light'
      ? Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
      : Haptics.notificationAsync(
          kind === 'success' ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning,
        );
  run.catch(() => undefined);
}
