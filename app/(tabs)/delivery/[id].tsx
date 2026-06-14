import React, { useState, useEffect, useMemo } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../db';
import Driver from '../../../db/models/Driver';
import Delivery from '../../../db/models/Delivery';
import DeliveryItem from '../../../db/models/DeliveryItem';
import { useQuery, useRelation } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';

// Subcomponent to render each Stop/DeliveryItem row reactively, joining Customer relation if linked
function StopRowItem({ item, index }: { item: DeliveryItem; index: number }) {
  const customer = useRelation(item.customer);
  const isDone = item.status === 'done';

  return (
    <View className="flex-row items-start bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-800/40 mb-3 shadow-sm">
      {/* Read-only status checkbox indicator representing driver progress */}
      <View className="mr-3 mt-1">
        <SymbolView
          name={
            isDone
              ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
              : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }
          }
          tintColor={isDone ? '#10B981' : '#94A3B8'}
          size={22}
        />
      </View>

      <View className="flex-1">
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase">
            STOP #{index + 1}
          </Text>
          <View className={`px-2 py-0.5 rounded-full ${isDone ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-amber-50 dark:bg-amber-950/40'}`}>
            <Text className={`text-[9px] font-bold uppercase ${isDone ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
              {isDone ? 'Delivered' : 'Pending'}
            </Text>
          </View>
        </View>

        <Text className="text-sm font-bold text-slate-850 dark:text-slate-100 mb-1">
          {item.address}
        </Text>

        <View className="flex-row items-center mt-1">
          <SymbolView
            name={{ ios: 'cube.box.fill', android: 'inventory_2', web: 'inventory_2' }}
            tintColor="#64748B"
            size={12}
          />
          <Text className="text-xs text-slate-500 dark:text-slate-400 font-semibold ml-1.5">
            {item.stockAmount}
          </Text>
        </View>

        {customer ? (
          <View className="flex-row items-center mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/40">
            <SymbolView
              name={{ ios: 'person.crop.circle.fill', android: 'person', web: 'person' }}
              tintColor="#4F46E5"
              size={12}
            />
            <Text className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 ml-1.5">
              Client: {customer.name}
            </Text>
            <Text className="text-[10px] text-slate-400 font-mono ml-2">
              (Bal: {formatCurrency(customer.balance)})
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export default function DeliveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [delivery, setDelivery] = useState<Delivery | null>(null);
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 1. Reactive subscription to Delivery record
  useEffect(() => {
    if (!id) return;
    const subscription = database.collections
      .get<Delivery>('deliveries')
      .findAndObserve(id)
      .subscribe({
        next: (record) => {
          setDelivery(record);
          setTick((t) => t + 1);
          setLoading(false);
        },
        error: (err) => {
          console.error(`Error loading delivery ${id}:`, err);
          setLoading(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [id]);

  const driver = useRelation(delivery ? delivery.driver : null) as Driver | null;

  // 2. Reactive subscription to stops list
  const stopsQuery = useMemo(() => {
    if (!delivery) return database.collections.get<DeliveryItem>('delivery_items').query(Q.where('id', ''));
    return delivery.items;
  }, [delivery]);

  const stops = useQuery(stopsQuery);

  // Calculate progress stats
  const progressStats = useMemo(() => {
    const total = stops.length;
    const completed = stops.filter((s) => s.status === 'done').length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, [stops]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await runSync(database);
    } catch (e: any) {
      console.error('Delivery detail refresh failed:', e);
    } finally {
      setRefreshing(false);
    }
  };

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
    if (!delivery || !delivery.createdAt) return '';
    try {
      const date = new Date(delivery.createdAt);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [delivery]);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-900">
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!delivery) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-900 px-6">
        <Text className="text-lg font-bold text-slate-800 dark:text-slate-100">Task Not Found</Text>
        <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center">
          The selected delivery route record does not exist or has been removed.
        </Text>
      </View>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
      <ScrollView
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
        className="flex-1 px-5 py-6"
      >
        {/* Header/Driver Info Card */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5">
          <View className="flex-row justify-between items-start mb-3">
            <View className="flex-1 pr-3">
              <Text className="text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                Assigned Driver
              </Text>
              <Text className="text-xl font-bold text-slate-900 dark:text-slate-50 mt-1">
                {driver ? driver.name : 'Loading driver details...'}
              </Text>
              {driver?.phone ? (
                <Text className="text-slate-400 dark:text-slate-500 text-xs mt-0.5 font-mono">
                  {driver.phone}
                </Text>
              ) : null}
            </View>

            <View className={`px-2.5 py-1 rounded-full ${getStatusColor(delivery.status)}`}>
              <Text className="text-[10px] font-bold uppercase">
                {getStatusLabel(delivery.status)}
              </Text>
            </View>
          </View>

          <Text className="text-slate-400 dark:text-slate-550 text-[10px] font-mono mt-2 pt-2 border-t border-slate-100 dark:border-slate-700/40">
            Dispatched: {formattedDate}
          </Text>
        </View>

        {/* Dynamic Route Progress Card */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5">
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-sm font-bold text-slate-800 dark:text-slate-100">
              Route Progress
            </Text>
            <Text className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
              {progressStats.percent}% Done
            </Text>
          </View>
          
          <Text className="text-xs text-slate-450 dark:text-slate-400">
            {progressStats.completed} of {progressStats.total} stops completed
          </Text>

          {/* Custom Dynamic Progress Bar Track */}
          <View className="h-2 w-full bg-slate-100 dark:bg-slate-900 rounded-full mt-4 overflow-hidden border border-slate-200/50 dark:border-slate-850">
            <View
              className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full"
              style={{ width: `${progressStats.percent}%` }}
            />
          </View>
        </View>

        {delivery.notes ? (
          <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5">
            <Text className="text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px] font-bold mb-2">
              Dispatch Instructions
            </Text>
            <Text className="text-sm text-slate-700 dark:text-slate-350 leading-5">
              {delivery.notes}
            </Text>
          </View>
        ) : null}

        {/* Stops Checklist Section */}
        <Text className="text-slate-800 dark:text-slate-100 font-bold text-base mb-3.5 mt-1">
          Stops Checklist
        </Text>

        <View className="pb-8">
          {stops.length === 0 ? (
            <View className="bg-white dark:bg-slate-800 rounded-2xl py-8 px-6 items-center justify-center border border-slate-100 dark:border-slate-800/40">
              <Text className="text-xs text-slate-400 dark:text-slate-500">No stops associated with this delivery.</Text>
            </View>
          ) : (
            stops.map((stop, index) => (
              <StopRowItem key={stop.id} item={stop} index={index} />
            ))
          )}
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}
