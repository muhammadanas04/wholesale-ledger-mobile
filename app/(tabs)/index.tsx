import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Pressable,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Toast from 'react-native-toast-message';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../db';
import Customer from '../../db/models/Customer';
import Driver from '../../db/models/Driver';
import Sale from '../../db/models/Sale';
import Payment from '../../db/models/Payment';
import Delivery from '../../db/models/Delivery';
import { useQuery, useRelation } from '../../db/hooks';
import { formatCurrency } from '../../lib/utils';
import { runSync } from '../../lib/sync';
import { useAppStore } from '../../store/app';

// Render individual activity row items resolving the customer reactively
interface ActivityItem {
  id: string;
  type: 'sale' | 'payment';
  customerId: string;
  amount: number;
  date: string;
  createdAt?: string;
  notes?: string;
  record: Sale | Payment;
}

function ActivityRow({ item }: { item: ActivityItem }) {
  const customer = useRelation(item.record.customer);

  const isSale = item.type === 'sale';

  return (
    <Pressable
      onPress={() => router.push(`/customers/${item.customerId}`)}
      className="flex-row justify-between items-center bg-white dark:bg-slate-800 px-5 py-4 border-b border-slate-100 dark:border-slate-800/40 active:bg-slate-50 dark:active:bg-slate-700/30"
    >
      <View className="flex-row items-center flex-1 pr-4">
        {/* Type Icon */}
        <View
          className={`h-10 w-10 rounded-full items-center justify-center mr-3.5 ${
            isSale
              ? 'bg-rose-50 dark:bg-rose-950/40'
              : 'bg-emerald-50 dark:bg-emerald-950/40'
          }`}
        >
          <SymbolView
            name={
              isSale
                ? { ios: 'arrow.up.right.circle.fill', android: 'arrow_outward', web: 'arrow_outward' }
                : { ios: 'arrow.down.left.circle.fill', android: 'arrow_downward', web: 'arrow_downward' }
            }
            tintColor={isSale ? '#E11D48' : '#059669'}
            size={20}
          />
        </View>

        {/* Customer & Type details */}
        <View className="flex-1">
          <Text className="text-sm font-bold text-slate-900 dark:text-slate-50" numberOfLines={1}>
            {customer ? customer.name : 'Loading customer...'}
          </Text>
          <View className="flex-row items-center mt-0.5">
            <Text className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 font-mono">
              {item.date}
            </Text>
            <View className="h-1 w-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-1.5" />
            <Text className="text-[10px] text-slate-400 dark:text-slate-500 truncate max-w-[150px]" numberOfLines={1}>
              {item.notes || (isSale ? 'Sale Invoice' : 'Payment Recorded')}
            </Text>
          </View>
        </View>
      </View>

      {/* Amount and status details */}
      <View className="items-end">
        <Text
          className={`text-sm font-bold font-mono ${
            isSale ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'
          }`}
        >
          {isSale ? '-' : '+'}{formatCurrency(item.amount)}
        </Text>
        <Text className="text-[9px] text-slate-300 dark:text-slate-600 uppercase font-bold mt-0.5">
          {item.record.synced === 1 ? 'Synced' : 'Pending'}
        </Text>
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const [refreshing, setRefreshing] = useState(false);
  const { syncStatus, lastSyncTime } = useAppStore();

  // Queries
  const customers = useQuery(useMemo(() => database.collections.get<Customer>('customers').query(), []));
  const activeDrivers = useQuery(useMemo(() => database.collections.get<Driver>('drivers').query(Q.where('active', 1)), []));
  const deliveries = useQuery(useMemo(() => database.collections.get<Delivery>('deliveries').query(), []));
  const sales = useQuery(useMemo(() => database.collections.get<Sale>('sales').query(Q.sortBy('created_at', Q.desc), Q.take(10)), []));
  const payments = useQuery(useMemo(() => database.collections.get<Payment>('payments').query(Q.sortBy('created_at', Q.desc), Q.take(10)), []));

  // Compute stats
  const totalOutstandingBalance = useMemo(() => {
    return customers.reduce((sum, c) => sum + (c.balance || 0), 0);
  }, [customers]);

  const activeDriversCount = activeDrivers.length;

  const deliveriesProgress = useMemo(() => {
    const pending = deliveries.filter((d) => d.status === 'pending').length;
    const inProgress = deliveries.filter((d) => d.status === 'in_progress').length;
    const completed = deliveries.filter((d) => d.status === 'completed').length;
    return { pending, inProgress, completed };
  }, [deliveries]);

  // Combine and sort activities
  const recentActivities = useMemo(() => {
    const list: ActivityItem[] = [];

    sales.forEach((sale) => {
      list.push({
        id: sale.id,
        type: 'sale',
        customerId: sale.customerId,
        amount: sale.totalAmount,
        date: sale.date,
        createdAt: sale.createdAt,
        notes: sale.notes,
        record: sale,
      });
    });

    payments.forEach((pay) => {
      list.push({
        id: pay.id,
        type: 'payment',
        customerId: pay.customerId,
        amount: pay.amount,
        date: pay.date,
        createdAt: pay.createdAt,
        notes: pay.notes,
        record: pay,
      });
    });

    return list
      .sort((a, b) => {
        const timeA = a.createdAt || a.date;
        const timeB = b.createdAt || b.date;
        return timeB.localeCompare(timeA);
      })
      .slice(0, 10);
  }, [sales, payments]);

  // Sync refresh
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await runSync(database);
      Toast.show({
        type: 'success',
        text1: 'Sync Completed',
        text2: 'Data is now up to date.',
      });
    } catch (e: any) {
      console.error('Dashboard pull refresh failed:', e);
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: e.message || 'Could not connect to sync server.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  // Format last sync time string
  const formattedSyncTime = useMemo(() => {
    if (!lastSyncTime || lastSyncTime.startsWith('1970')) {
      return 'Never synced';
    }
    try {
      const d = new Date(lastSyncTime);
      return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) + ' ' + d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    } catch {
      return 'Unknown';
    }
  }, [lastSyncTime]);

  const getSyncBadge = () => {
    switch (syncStatus) {
      case 'syncing':
        return {
          bg: 'bg-blue-50 dark:bg-blue-950/40 border-blue-200 dark:border-blue-800',
          text: 'text-blue-600 dark:text-blue-400',
          label: 'Syncing',
          icon: 'arrow.triangle.2.circlepath',
        };
      case 'error':
        return {
          bg: 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800',
          text: 'text-rose-600 dark:text-rose-400',
          label: 'Sync Error',
          icon: 'exclamationmark.triangle.fill',
        };
      case 'not-configured':
        return {
          bg: 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800',
          text: 'text-slate-400 dark:text-slate-500',
          label: 'Unconfigured',
          icon: 'gearshape.fill',
        };
      default:
        return {
          bg: 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800',
          text: 'text-emerald-600 dark:text-emerald-400',
          label: 'Synced',
          icon: 'checkmark.circle.fill',
        };
    }
  };

  const syncBadge = getSyncBadge();

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
      <ScrollView
        className="flex-1"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
      >
        {/* Welcome Header */}
        <View className="px-5 pt-5 pb-4 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800/40 flex-row justify-between items-center">
          <View>
            <Text className="text-xl font-black text-slate-900 dark:text-slate-50">
              Wholesale Ledger
            </Text>
            <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-mono mt-0.5">
              Last sync: {formattedSyncTime}
            </Text>
          </View>

          {/* Sync Status Badge */}
          <View className={`flex-row items-center px-2.5 py-1.5 rounded-full border ${syncBadge.bg}`}>
            <SymbolView
              name={{ ios: syncBadge.icon as any, android: syncStatus === 'error' ? 'warning' : 'sync', web: 'sync' }}
              tintColor={syncStatus === 'syncing' ? '#2563EB' : syncStatus === 'error' ? '#E11D48' : syncStatus === 'not-configured' ? '#94A3B8' : '#059669'}
              size={12}
            />
            <Text className={`text-[10px] font-black uppercase ml-1.5 ${syncBadge.text}`}>
              {syncBadge.label}
            </Text>
          </View>
        </View>

        {/* Metrics Grid */}
        <View className="p-5">
          <View className="flex-row mb-4">
            {/* Outstanding Balance Receivables Card */}
            <TouchableOpacity
              onPress={() => router.push('/customers')}
              className="flex-1 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm mr-2 active:scale-[0.98]"
            >
              <View className="flex-row justify-between items-center mb-2.5">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Receivables
                </Text>
                <View className="h-6 w-6 rounded-full bg-rose-50 dark:bg-rose-950/40 items-center justify-center">
                  <SymbolView
                    name={{ ios: 'indianrupeesign.circle.fill', android: 'payments', web: 'payments' }}
                    tintColor="#E11D48"
                    size={14}
                  />
                </View>
              </View>
              <Text
                className="text-lg font-mono font-black text-rose-600 dark:text-rose-400"
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatCurrency(totalOutstandingBalance)}
              </Text>
              <Text className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">
                Outstanding balance due
              </Text>
            </TouchableOpacity>

            {/* Active Drivers Card */}
            <TouchableOpacity
              onPress={() => router.push('/delivery/drivers')}
              className="flex-1 bg-white dark:bg-slate-800 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm ml-2 active:scale-[0.98]"
            >
              <View className="flex-row justify-between items-center mb-2.5">
                <Text className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                  Drivers
                </Text>
                <View className="h-6 w-6 rounded-full bg-indigo-50 dark:bg-indigo-950/40 items-center justify-center">
                  <SymbolView
                    name={{ ios: 'person.2.fill', android: 'people', web: 'people' }}
                    tintColor="#4F46E5"
                    size={14}
                  />
                </View>
              </View>
              <Text className="text-xl font-black text-indigo-600 dark:text-indigo-400">
                {activeDriversCount}
              </Text>
              <Text className="text-[9px] text-slate-400 dark:text-slate-500 mt-1">
                Active drivers in system
              </Text>
            </TouchableOpacity>
          </View>

          {/* Delivery Summary Banner */}
          <TouchableOpacity
            onPress={() => router.push('/delivery')}
            className="bg-white dark:bg-slate-800 p-4 rounded-2xl border border-slate-100 dark:border-slate-800/60 shadow-sm flex-row justify-between items-center active:scale-[0.99]"
          >
            <View className="flex-row items-center flex-1 pr-4">
              <View className="h-10 w-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 items-center justify-center mr-3.5">
                <SymbolView
                  name={{ ios: 'shippingbox.fill', android: 'local_shipping', web: 'local_shipping' }}
                  tintColor="#4F46E5"
                  size={20}
                />
              </View>
              <View className="flex-1">
                <Text className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  Delivery Progress
                </Text>
                <View className="flex-row items-center mt-0.5">
                  <Text className="text-xs text-slate-400 dark:text-slate-500">
                    {deliveriesProgress.pending} Pending
                  </Text>
                  <View className="h-1 w-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-1.5" />
                  <Text className="text-xs text-slate-400 dark:text-slate-500">
                    {deliveriesProgress.inProgress} In Progress
                  </Text>
                  <View className="h-1 w-1 bg-slate-300 dark:bg-slate-700 rounded-full mx-1.5" />
                  <Text className="text-xs text-slate-400 dark:text-slate-500">
                    {deliveriesProgress.completed} Completed
                  </Text>
                </View>
              </View>
            </View>
            <SymbolView
              name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
              tintColor="#94A3B8"
              size={18}
            />
          </TouchableOpacity>
        </View>

        {/* Recent Activity Header */}
        <View className="px-5 pt-2 pb-1.5 flex-row justify-between items-end">
          <View>
            <Text className="text-base font-bold text-slate-800 dark:text-slate-100">
              Recent Activity
            </Text>
            <Text className="text-xs text-slate-400 dark:text-slate-500">
              Latest invoices and receipts
            </Text>
          </View>
        </View>

        {/* Activity List Container */}
        <View className="bg-white dark:bg-slate-800 border-t border-b border-slate-100 dark:border-slate-800/40 mt-3 mb-10 shadow-sm">
          {recentActivities.length === 0 ? (
            <View className="py-12 items-center justify-center px-6">
              <SymbolView
                name={{ ios: 'doc.plaintext.fill', android: 'receipt_long', web: 'receipt_long' }}
                tintColor="#CBD5E1"
                size={40}
              />
              <Text className="text-slate-500 dark:text-slate-400 font-semibold text-sm mt-3 text-center">
                No recent activity.
              </Text>
              <Text className="text-slate-400 dark:text-slate-500 text-xs mt-0.5 text-center max-w-[240px]">
                Create new sales or record payments to see them listed here.
              </Text>
            </View>
          ) : (
            recentActivities.map((activity) => (
              <ActivityRow key={`${activity.type}-${activity.id}`} item={activity} />
            ))
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
