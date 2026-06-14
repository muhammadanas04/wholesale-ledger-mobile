import React, { useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Pressable,
} from 'react-native';
import { Link, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { FlashList } from '@shopify/flash-list';
import Toast from 'react-native-toast-message';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../db';
import Delivery from '../../../db/models/Delivery';
import { useQuery, useRelation } from '../../../db/hooks';
import { runSync } from '../../../lib/sync';

type DeliveryStatus = 'pending' | 'in_progress' | 'completed';

// Extracted Subcomponent to render details (like Driver name & stop counts) reactively for each Delivery
function DeliveryCard({ delivery }: { delivery: Delivery }) {
  const driver = useRelation(delivery.driver);
  const items = useQuery(useMemo(() => delivery.items, [delivery]));

  const completedStops = useMemo(() => {
    return items.filter((item) => item.status === 'done').length;
  }, [items]);

  const totalStops = items.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400';
      case 'in_progress':
        return 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400';
      default:
        return 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      default:
        return 'Pending';
    }
  };

  const formattedDate = useMemo(() => {
    if (!delivery.createdAt) return '';
    try {
      const date = new Date(delivery.createdAt);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [delivery.createdAt]);

  return (
    <Pressable
      onPress={() => router.push(`/delivery/${delivery.id}`)}
      className="bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 mb-4 shadow-sm active:scale-[0.99]"
    >
      <View className="flex-row justify-between items-start mb-3">
        <View className="flex-1 pr-3">
          <Text className="text-base font-bold text-slate-900 dark:text-slate-50" numberOfLines={1}>
            {driver ? driver.name : 'Unassigned Driver'}
          </Text>
          <Text className="text-slate-400 dark:text-slate-500 text-xs mt-0.5 font-mono">
            {formattedDate}
          </Text>
        </View>

        <View className={`px-2.5 py-1 rounded-full ${getStatusColor(delivery.status)}`}>
          <Text className="text-[10px] font-bold uppercase">
            {getStatusLabel(delivery.status)}
          </Text>
        </View>
      </View>

      {/* stops details */}
      <View className="flex-row items-center bg-slate-50 dark:bg-slate-900/50 rounded-xl px-4 py-2.5 mb-2.5">
        <SymbolView
          name={{ ios: 'mappin.and.ellipse', android: 'local_shipping', web: 'local_shipping' }}
          tintColor="#4F46E5"
          size={16}
        />
        <Text className="text-xs text-slate-600 dark:text-slate-300 font-semibold ml-2">
          {completedStops} / {totalStops} stops completed
        </Text>
      </View>

      {delivery.notes ? (
        <Text className="text-slate-400 dark:text-slate-500 text-xs mt-1" numberOfLines={2}>
          {delivery.notes}
        </Text>
      ) : null}
    </Pressable>
  );
}

// Stably defined renderItem outside component body to avoid rebuilding on every render
const renderItem = ({ item }: { item: Delivery }) => {
  return <DeliveryCard delivery={item} />;
};

export default function DeliveryDashboardScreen() {
  const [activeTab, setActiveTab] = useState<DeliveryStatus>('pending');
  const [refreshing, setRefreshing] = useState(false);

  // Construct reactive query filter based on active status tab
  const deliveriesQuery = useMemo(() => {
    return database.collections
      .get<Delivery>('deliveries')
      .query(Q.where('status', activeTab), Q.sortBy('created_at', Q.desc));
  }, [activeTab]);

  const deliveries = useQuery(deliveriesQuery);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await runSync(database);
    } catch (e: any) {
      console.error('Deliveries pull refresh failed:', e);
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: e.message || 'Could not connect to sync server.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
      
      {/* Top Quick Sub-Navigation Buttons Bar */}
      <View className="flex-row px-5 pt-4 pb-2 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800/40">
        <TouchableOpacity
          onPress={() => router.push('/delivery/drivers')}
          className="flex-1 flex-row items-center justify-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 py-3 rounded-xl mr-2 active:scale-95"
        >
          <SymbolView
            name={{ ios: 'person.2.fill', android: 'people', web: 'people' }}
            tintColor="#4F46E5"
            size={16}
          />
          <Text className="font-semibold text-xs text-slate-700 dark:text-slate-300 ml-2">
            Drivers List
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => router.push('/delivery/map')}
          className="flex-1 flex-row items-center justify-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 py-3 rounded-xl ml-2 active:scale-95"
        >
          <SymbolView
            name={{ ios: 'map.fill', android: 'map', web: 'map' }}
            tintColor="#4F46E5"
            size={16}
          />
          <Text className="font-semibold text-xs text-slate-700 dark:text-slate-300 ml-2">
            Live tracker
          </Text>
        </TouchableOpacity>
      </View>

      {/* Tab Selection Bar */}
      <View className="flex-row border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-3">
        {(['pending', 'in_progress', 'completed'] as const).map((status) => (
          <TouchableOpacity
            key={status}
            className={`flex-1 py-3.5 items-center border-b-2 ${
              activeTab === status
                ? 'border-indigo-600 dark:border-indigo-500'
                : 'border-transparent'
            }`}
            onPress={() => setActiveTab(status)}
          >
            <Text
              className={`font-semibold text-xs capitalize ${
                activeTab === status
                  ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                  : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {status === 'in_progress' ? 'In Progress' : status}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Deliveries List */}
      <View className="flex-1 px-5 pt-4">
        <FlashList
          data={deliveries}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          estimatedItemSize={140}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
          }
          ListEmptyComponent={
            <View className="py-20 items-center justify-center">
              <SymbolView
                name={{ ios: 'shippingbox.fill', android: 'local_shipping', web: 'local_shipping' }}
                tintColor="#CBD5E1"
                size={64}
              />
              <Text className="text-slate-700 dark:text-slate-300 font-bold text-lg mt-4 text-center">
                No deliveries created.
              </Text>
              <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center max-w-[260px]">
                There are no deliveries listed under the &ldquo;{activeTab === 'in_progress' ? 'In Progress' : activeTab}&rdquo; status tab.
              </Text>
            </View>
          }
        />
      </View>

      {/* Floating Action Button */}
      <Link href="/delivery/new-delivery" asChild>
        <TouchableOpacity
          className="absolute bottom-6 right-6 h-14 w-14 rounded-full bg-indigo-600 dark:bg-indigo-500 shadow-lg items-center justify-center active:scale-95"
          style={{ shadowColor: '#4F46E5', shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }}
        >
          <SymbolView
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            tintColor="#FFFFFF"
            size={24}
          />
        </TouchableOpacity>
      </Link>

    </SafeAreaView>
  );
}
