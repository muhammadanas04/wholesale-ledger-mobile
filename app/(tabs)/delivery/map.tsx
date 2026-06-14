import React, { useMemo, useRef, useState, useEffect } from 'react';
import {
  Text,
  View,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  Platform,
} from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useNavigation } from 'expo-router';
import MapView, { Marker, Callout, PROVIDER_GOOGLE } from 'react-native-maps';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { api } from '../../../lib/api';
import { formatCurrency } from '../../../lib/utils';

export default function LiveMapScreen() {
  const navigation = useNavigation();
  const [isFocused, setIsFocused] = useState(true);
  const insets = useSafeAreaInsets();
  const mapRef = useRef<MapView | null>(null);

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

  // Poll driver locations from Cloudflare worker every 30 seconds
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['driver-locations'],
    queryFn: () => api.getDriverLocations(),
    refetchInterval: 30000, // poll every 30s
    enabled: isFocused, // only poll when map screen is focused
  });

  const activeLocations = useMemo(() => {
    return data?.locations || [];
  }, [data]);

  const defaultLatitude = 27.6094;
  const defaultLongitude = 75.1398;

  const initialRegion = useMemo(() => {
    if (activeLocations.length === 0) {
      return {
        latitude: defaultLatitude,
        longitude: defaultLongitude,
        latitudeDelta: 0.0522,
        longitudeDelta: 0.0221,
      };
    }

    // Centered around the first driver's coordinates
    return {
      latitude: activeLocations[0].latitude,
      longitude: activeLocations[0].longitude,
      latitudeDelta: 0.0522,
      longitudeDelta: 0.0221,
    };
  }, [activeLocations]);

  // Recenter map to focus on all active markers
  const handleRecenter = () => {
    if (activeLocations.length === 0 || !mapRef.current) return;

    if (activeLocations.length === 1) {
      mapRef.current.animateToRegion({
        latitude: activeLocations[0].latitude,
        longitude: activeLocations[0].longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      }, 1000);
    } else {
      mapRef.current.fitToCoordinates(
        activeLocations.map((loc: any) => ({
          latitude: loc.latitude,
          longitude: loc.longitude,
        })),
        {
          edgePadding: { top: 120, right: 50, bottom: 220, left: 50 },
          animated: true,
        }
      );
    }
  };

  const renderedMarkers = useMemo(() => {
    return activeLocations.map((loc: any) => {
      const recordedAt = loc.recorded_at ? new Date(loc.recorded_at) : new Date();
      const isValidDate = !isNaN(recordedAt.getTime());
      const now = new Date();
      const diffMs = isValidDate ? now.getTime() - recordedAt.getTime() : 0;
      const diffMins = Math.floor(diffMs / 60000);
      const isStale = !isValidDate || diffMins > 15;

      const recordedTime = isValidDate
        ? recordedAt.toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit',
          })
        : 'N/A';

      // Pin Color: Gray for stale/offline, Indigo for active
      const pinColor = isStale ? '#94A3B8' : '#4F46E5';

      return (
        <Marker
          key={loc.driver_id}
          coordinate={{ latitude: loc.latitude, longitude: loc.longitude }}
          pinColor={pinColor}
        >
          <Callout tooltip>
            <View className="bg-white dark:bg-slate-800 p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 shadow-lg min-w-[160px]">
              <Text className="font-bold text-sm text-slate-900 dark:text-slate-50">
                {loc.driver_name}
              </Text>
              <Text className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">
                {loc.phone}
              </Text>
              <Text className="text-[10px] text-slate-550 dark:text-slate-400 mt-2 font-semibold">
                {isStale ? `Last seen ${diffMins} min ago` : `Updated: ${recordedTime}`}
              </Text>
            </View>
          </Callout>
        </Marker>
      );
    });
  }, [activeLocations]);

  if (isLoading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-900">
        <ActivityIndicator size="large" color="#4F46E5" />
        <Text className="text-sm font-semibold text-slate-500 dark:text-slate-400 mt-4">
          Loading live tracker map...
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 relative">
      {/* Floating Header Panel */}
      <View
        style={{ paddingTop: insets.top + 10 }}
        className="absolute top-0 left-4 right-4 z-10"
      >
        <View className="bg-white/95 dark:bg-slate-800/95 border border-slate-100 dark:border-slate-800/60 p-4 rounded-2xl shadow-lg flex-row justify-between items-center backdrop-blur-md">
          <View className="flex-1 pr-3">
            <Text className="text-base font-bold text-slate-900 dark:text-slate-50">
              Live Tracker
            </Text>
            <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
              {activeLocations.length} active drivers • updates every 30s
            </Text>
          </View>

          <View className="flex-row">
            <TouchableOpacity
              onPress={() => refetch()}
              className="p-2.5 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-750 rounded-xl mr-2 active:scale-95"
            >
              <SymbolView
                name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }}
                tintColor="#4F46E5"
                size={16}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleRecenter}
              disabled={activeLocations.length === 0}
              className={`p-2.5 border rounded-xl active:scale-95 ${
                activeLocations.length === 0
                  ? 'bg-slate-100 border-slate-200 opacity-50'
                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-750'
              }`}
            >
              <SymbolView
                name={{ ios: 'scope', android: 'my_location', web: 'my_location' }}
                tintColor={activeLocations.length === 0 ? '#94A3B8' : '#4F46E5'}
                size={16}
              />
            </TouchableOpacity>
          </View>
        </View>

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
      </View>

      {/* Map View */}
      <MapView
        ref={mapRef}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        className="flex-1 w-full h-full"
        initialRegion={initialRegion}
      >
        {renderedMarkers}
      </MapView>

      {/* Bottom Horizontal Drivers Carousel */}
      {activeLocations.length > 0 && (
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
            {activeLocations.map((loc: any) => {
              const recordedAt = loc.recorded_at ? new Date(loc.recorded_at) : new Date();
              const isValidDate = !isNaN(recordedAt.getTime());
              const now = new Date();
              const diffMs = isValidDate ? now.getTime() - recordedAt.getTime() : 0;
              const diffMins = Math.floor(diffMs / 60000);
              const isStale = !isValidDate || diffMins > 15;

              return (
                <TouchableOpacity
                  key={loc.driver_id}
                  onPress={() => {
                    mapRef.current?.animateToRegion(
                      {
                        latitude: loc.latitude,
                        longitude: loc.longitude,
                        latitudeDelta: 0.015,
                        longitudeDelta: 0.015,
                      },
                      1000
                    );
                  }}
                  className="bg-white/95 dark:bg-slate-800/95 border border-slate-100 dark:border-slate-800/60 py-3.5 px-4 rounded-2xl mr-3 shadow-md min-w-[150px] flex-row items-center active:scale-95"
                >
                  <View
                    className={`h-2.5 w-2.5 rounded-full mr-2.5 ${
                      isStale ? 'bg-slate-350 dark:bg-slate-500' : 'bg-emerald-500'
                    }`}
                  />
                  <View>
                    <Text className="text-xs font-bold text-slate-800 dark:text-slate-100">
                      {loc.driver_name}
                    </Text>
                    <Text className="text-[9px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                      {isStale ? 'Inactive / Stale' : 'Active tracking'}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}
    </View>
  );
}
