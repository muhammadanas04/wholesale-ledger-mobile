import React, { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import {
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNetInfo } from '@react-native-community/netinfo';

import { api } from '../../../lib/api';
import { LeafletMap } from '../../../components/maps/LeafletMap';
import type {
  RawDriverLocation,
  EnrichedDriverLocation,
  LeafletMapRef,
} from '../../../components/maps/types';
import { STALE_THRESHOLD_MINUTES } from '../../../components/maps/types';

export default function LiveMapScreen() {
  const navigation = useNavigation();
  const [isFocused, setIsFocused] = useState(true);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<LeafletMapRef>(null);
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;
  const [tileError, setTileError] = useState(false);

  // ── Focus/blur tracking (pause polling when not visible) ──
  useEffect(() => {
    const unsubscribeFocus = navigation.addListener('focus', () => {
      setIsFocused(true);
    });
    const unsubscribeBlur = navigation.addListener('blur', () => {
      setIsFocused(false);
    });
    return () => {
      unsubscribeFocus();
      unsubscribeBlur();
    };
  }, [navigation]);

  // ── Poll driver locations every 15 seconds ──
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['driver-locations'],
    queryFn: () => api.getDriverLocations(),
    refetchInterval: 15000, // 15s to match driver reporting cadence
    enabled: isFocused && !isOffline,
  });

  // ── Enrich raw locations with staleness (computed ONCE in RN) ──
  const enrichedLocations: EnrichedDriverLocation[] = useMemo(() => {
    const raw: RawDriverLocation[] = data?.locations || [];
    const now = new Date();

    return raw.map((loc) => {
      const recordedAt = loc.recorded_at ? new Date(loc.recorded_at) : null;
      const isValidDate = recordedAt !== null && !isNaN(recordedAt.getTime());
      const diffMs = isValidDate ? now.getTime() - recordedAt!.getTime() : Infinity;
      const diffMins = Math.floor(diffMs / 60000);
      const isStale = !isValidDate || diffMins > STALE_THRESHOLD_MINUTES;

      let lastSeenText: string;
      if (!isValidDate) {
        lastSeenText = 'N/A';
      } else if (isStale) {
        lastSeenText = `Last seen ${diffMins} min ago`;
      } else {
        lastSeenText = `Updated: ${recordedAt!.toLocaleTimeString('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
        })}`;
      }

      return {
        id: loc.driver_id,
        name: loc.driver_name,
        phone: loc.phone,
        latitude: loc.latitude,
        longitude: loc.longitude,
        isStale,
        lastSeenText,
      };
    });
  }, [data]);

  // ── Handlers ──

  const handleRecenter = useCallback(() => {
    mapRef.current?.fitAllMarkers();
  }, []);

  const handleCarouselCardPress = useCallback((driverId: string) => {
    mapRef.current?.panToDriver(driverId);
  }, []);

  const handleMarkerClick = useCallback((driverId: string) => {
    // Future: could scroll carousel to this driver's card
    // For now, the popup opens inside the WebView
  }, []);

  const handleTileError = useCallback((failedCount: number) => {
    setTileError(true);
  }, []);

  // ── Offline state ──
  if (isOffline) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-900 px-6">
        <SymbolView
          name={{ ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' }}
          tintColor="#EF4444"
          size={48}
        />
        <Text className="text-base font-bold text-slate-800 dark:text-slate-100 mt-4 text-center">
          Location data unavailable offline
        </Text>
        <Text className="text-xs text-slate-400 dark:text-slate-500 mt-1 text-center max-w-[240px]">
          Please reconnect to the internet to track driver locations in real time.
        </Text>
      </View>
    );
  }



  // ── Main render ──
  return (
    <View className="flex-1 relative">
      {/* ════════════ Floating Header Panel ════════════ */}
      <View
        style={{ paddingTop: 10 }}
        className="absolute top-0 left-4 right-4 z-10"
      >
        <View className="bg-white/95 dark:bg-slate-800/95 border border-slate-100 dark:border-slate-800/60 p-4 rounded-2xl shadow-lg flex-row justify-between items-center backdrop-blur-md">
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-slate-900 dark:text-slate-50">
              Live Tracker
            </Text>
            <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
              {enrichedLocations.length} active drivers • updates every 15s
            </Text>
          </View>

          <View className="flex-row">
            {/* Refresh Button */}
            <TouchableOpacity
              onPress={() => refetch()}
              disabled={isFetching}
              className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl mr-2 active:scale-95"
            >
              {isFetching ? (
                <ActivityIndicator size="small" color="#4F46E5" style={{ width: 16, height: 16 }} />
              ) : (
                <SymbolView
                  name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
                  tintColor="#4F46E5"
                  size={16}
                />
              )}
            </TouchableOpacity>

            {/* Recenter Button */}
            <TouchableOpacity
              onPress={handleRecenter}
              disabled={enrichedLocations.length === 0}
              className={`p-2.5 border rounded-xl active:scale-95 ${
                enrichedLocations.length === 0
                  ? 'bg-slate-100 border-slate-200 opacity-50'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-750'
              }`}
            >
              <SymbolView
                name={{ ios: 'scope', android: 'my_location', web: 'my_location' }}
                tintColor={enrichedLocations.length === 0 ? '#94A3B8' : '#4F46E5'}
                size={16}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Error banner: API poll failure */}
        {error && (
          <View className="mt-2 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 p-2.5 rounded-xl flex-row items-center">
            <SymbolView
              name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
              tintColor="#EF4444"
              size={12}
            />
            <Text className="text-[10px] text-rose-600 dark:text-rose-450 font-semibold ml-2 flex-1">
              Offline or failed to poll latest coordinates.
            </Text>
          </View>
        )}

        {/* Error banner: OSM tile loading failure */}
        {tileError && !error && (
          <View className="mt-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 p-2.5 rounded-xl flex-row items-center">
            <SymbolView
              name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
              tintColor="#F59E0B"
              size={12}
            />
            <Text className="text-[10px] text-amber-600 dark:text-amber-450 font-semibold ml-2 flex-1">
              Map tiles failed to load. The map may appear incomplete.
            </Text>
          </View>
        )}
      </View>

      {/* ════════════ Leaflet Map (replaces <MapView>) ════════════ */}
      <LeafletMap
        ref={mapRef}
        locations={enrichedLocations}
        onMarkerClick={handleMarkerClick}
        onTileError={handleTileError}
      />

      {/* ════════════ Bottom Driver Carousel ════════════ */}
      {enrichedLocations.length > 0 ? (
        <View
          style={{ bottom: insets.bottom + 20 }}
          className="absolute left-4 right-4 z-10"
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 2 }}
            className="flex-row"
          >
            {enrichedLocations.map((driver) => (
              <TouchableOpacity
                key={driver.id}
                onPress={() => handleCarouselCardPress(driver.id)}
                className="bg-white/95 dark:bg-slate-800/95 border border-slate-100 dark:border-slate-800/60 py-3.5 px-4 rounded-2xl mr-3 shadow-md min-w-[150px] flex-row items-center active:scale-95"
              >
                <View
                  className={`h-2.5 w-2.5 rounded-full mr-2.5 ${
                    driver.isStale ? 'bg-slate-350 dark:bg-slate-500' : 'bg-emerald-500'
                  }`}
                />
                <View>
                  <Text className="text-xs font-bold text-slate-800 dark:text-slate-100">
                    {driver.name}
                  </Text>
                  <Text className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                    {driver.isStale ? 'Inactive / Stale' : 'Active tracking'}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      ) : (
        <View
          style={{ bottom: insets.bottom + 20 }}
          className="absolute left-4 right-4 z-10 bg-white/95 dark:bg-slate-800/95 border border-slate-100 dark:border-slate-800/60 p-4 rounded-2xl shadow-md items-center justify-center backdrop-blur-md"
        >
          {isLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#4F46E5" style={{ marginRight: 8 }} />
              <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Loading live tracker data...
              </Text>
            </View>
          ) : (
            <Text className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              No drivers are currently active.
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
