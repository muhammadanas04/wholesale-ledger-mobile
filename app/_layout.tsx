import '../global.css';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useState } from 'react';
import 'react-native-reanimated';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Toast from 'react-native-toast-message';
import { View, Text, TouchableOpacity } from 'react-native';
import { useNetInfo } from '@react-native-community/netinfo';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { useColorScheme as useNativeWindColorScheme } from 'nativewind';
import { database } from '../db';
import { useAppStore } from '../store/app';
import { runSync, setupSyncTriggers } from '../lib/sync';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const { setColorScheme } = useNativeWindColorScheme();
  const themeSetting = useAppStore((state) => state.themeSetting);
  const initStore = useAppStore((state) => state.initStore);
  const insets = useSafeAreaInsets();
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;
  const syncStatus = useAppStore((state) => state.syncStatus);

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 2,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  useEffect(() => {
    setColorScheme(themeSetting);
  }, [themeSetting, setColorScheme]);

  useEffect(() => {
    let unsubscribe: (() => void) | null = null;
    let active = true;

    initStore().then(() => {
      if (!active) return;
      unsubscribe = setupSyncTriggers(database);
      // Run initial sync cycle in background on start
      runSync(database).catch(() => {});
    });

    return () => {
      active = false;
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [initStore]);

  const handleRetrySync = () => {
    runSync(database).catch(() => {});
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <View className="flex-1">
          {/* Global network status banners */}
          {isOffline ? (
            <View style={{ paddingTop: insets.top }} className="bg-amber-500">
              <View className="px-4 py-2 flex-row items-center justify-center">
                <Text className="text-white text-xs font-bold text-center">
                  You're offline — changes will sync when connected
                </Text>
              </View>
            </View>
          ) : syncStatus === 'error' ? (
            <View style={{ paddingTop: insets.top }} className="bg-rose-600">
              <View className="px-4 py-2.5 flex-row items-center justify-between">
                <Text className="text-white text-xs font-semibold flex-1 mr-3">
                  Sync failed. Will retry.
                </Text>
                <TouchableOpacity
                  onPress={handleRetrySync}
                  className="bg-white/20 px-3 py-1.5 rounded-lg active:scale-95"
                >
                  <Text className="text-white text-xs font-bold">Retry</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="settings" options={{ presentation: 'modal', title: 'Settings' }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
          </Stack>
        </View>
      </ThemeProvider>
      <Toast />
    </QueryClientProvider>
  );
}
