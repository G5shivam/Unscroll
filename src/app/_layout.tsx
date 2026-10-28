// Import single weights so only the fonts we use are bundled.
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';
import { InstrumentSans_400Regular } from '@expo-google-fonts/instrument-sans/400Regular';
import { InstrumentSans_500Medium } from '@expo-google-fonts/instrument-sans/500Medium';
import { InstrumentSans_600SemiBold } from '@expo-google-fonts/instrument-sans/600SemiBold';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { UnscrollProvider, useUnscroll } from '../state/provider';
import { color } from '../ui/theme';

export default function RootLayout() {
  const [loaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    InstrumentSans_400Regular,
    InstrumentSans_500Medium,
    InstrumentSans_600SemiBold,
  });
  return (
    <SafeAreaProvider>
      <UnscrollProvider>
        <StatusBar style="dark" />
        {loaded ? <Navigator /> : <Splash />}
      </UnscrollProvider>
    </SafeAreaProvider>
  );
}

function Navigator() {
  const { ready } = useUnscroll();
  if (!ready) return <Splash />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.paper } }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="focus" options={{ presentation: 'modal' }} />
      <Stack.Screen name="schedule/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="instagram" options={{ presentation: 'fullScreenModal' }} />
    </Stack>
  );
}

function Splash() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: color.paper }}>
      <ActivityIndicator color={color.ink} />
    </View>
  );
}
