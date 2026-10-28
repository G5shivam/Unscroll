import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { color, font } from '../../ui/theme';

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: color.ink,
        tabBarInactiveTintColor: color.slate,
        // Height includes the device's bottom safe-area inset (home indicator).
        tabBarStyle: {
          backgroundColor: color.surface,
          borderTopColor: color.hairline,
          height: 72 + insets.bottom,
          paddingTop: 4,
          paddingBottom: Math.max(insets.bottom, 10),
        },
        tabBarLabelStyle: { fontFamily: font.bodyMedium, fontSize: 12, lineHeight: 16 },
        sceneStyle: { backgroundColor: color.paper },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Today',
          tabBarButtonTestID: 'tab-today',
          tabBarIcon: ({ color: c }) => <Feather name="sun" size={20} color={c as string} />,
        }}
      />
      <Tabs.Screen
        name="schedules"
        options={{
          title: 'Schedules',
          tabBarButtonTestID: 'tab-schedules',
          tabBarIcon: ({ color: c }) => <Feather name="calendar" size={20} color={c as string} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarButtonTestID: 'tab-settings',
          tabBarIcon: ({ color: c }) => <Feather name="sliders" size={20} color={c as string} />,
        }}
      />
    </Tabs>
  );
}
