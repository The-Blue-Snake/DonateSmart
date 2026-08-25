import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      labelStyle={{ selected: { color: colors.text } }}
    >
      <NativeTabs.Trigger
        name="index"
        options={{
          title: 'Donate',
          icon: { sf: 'house.fill' },
        }}
      />

      <NativeTabs.Trigger
        name="centers"
        options={{
          title: 'Centers',
          icon: { sf: 'location.fill' },
        }}
      />

      <NativeTabs.Trigger
        name="map"
        options={{
          title: 'Map',
          icon: { sf: 'map.fill' },
        }}
      />
    </NativeTabs>
  );
}