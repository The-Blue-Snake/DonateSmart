import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />

        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="barcode-scan"
            options={{ presentation: 'modal', headerShown: true, title: 'Scan Barcode' }}
          />
          <Stack.Screen
            name="photo-scan"
            options={{ presentation: 'modal', headerShown: true, title: 'Take a Photo' }}
          />
          <Stack.Screen
            name="manual-entry"
            options={{ presentation: 'modal', headerShown: true, title: 'Choose Category' }}
          />
          <Stack.Screen name="result" options={{ headerShown: true, title: 'Where to Donate' }} />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}