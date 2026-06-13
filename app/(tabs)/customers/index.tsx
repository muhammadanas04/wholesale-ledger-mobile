import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Pressable,
} from 'react-native';
import { Link } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { FlashList } from '@shopify/flash-list';
import Toast from 'react-native-toast-message';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import { useQuery } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';

export default function CustomerListScreen() {
  const [inputText, setInputText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Debounce search query by 150ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setSearchQuery(inputText);
    }, 150);

    return () => clearTimeout(handler);
  }, [inputText]);

  // Construct query memoizing it for stability
  const customersQuery = useMemo(() => {
    const cleanSearch = Q.sanitizeLikeString(searchQuery.trim());
    const clauses: any[] = [];

    if (cleanSearch) {
      clauses.push(
        Q.or(
          Q.where('name', Q.like(`%${cleanSearch}%`)),
          Q.where('phone', Q.like(`%${cleanSearch}%`))
        )
      );
    }
    
    clauses.push(Q.sortBy('balance', Q.desc));

    return database.collections.get<Customer>('customers').query(...clauses);
  }, [searchQuery]);

  const customers = useQuery(customersQuery);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await runSync(database);
    } catch (e: any) {
      console.error('Pull-to-refresh sync failed:', e);
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: e.message || 'Could not connect to sync server.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const getBalanceStyle = (balance: number) => {
    if (balance > 0) return 'text-rose-600 dark:text-rose-400 font-semibold';
    if (balance === 0) return 'text-emerald-600 dark:text-emerald-400 font-semibold';
    return 'text-amber-600 dark:text-amber-400 font-semibold';
  };

  const renderItem = ({ item }: { item: Customer }) => {
    return (
      <Link href={`/customers/${item.id}`} asChild>
        <Pressable className="flex-row justify-between items-center bg-white dark:bg-slate-800 px-5 py-4 border-b border-slate-100 dark:border-slate-800/40 active:bg-slate-50 dark:active:bg-slate-700/30">
          <View className="flex-1 pr-4">
            <Text className="text-base font-bold text-slate-900 dark:text-slate-50" numberOfLines={1}>
              {item.name}
            </Text>
            {item.phone ? (
              <Text className="text-slate-400 dark:text-slate-500 text-xs mt-0.5 font-mono">
                {item.phone}
              </Text>
            ) : null}
          </View>
          <View className="items-end">
            <Text className={`text-base font-mono ${getBalanceStyle(item.balance)}`}>
              {formatCurrency(item.balance)}
            </Text>
            <Text className="text-slate-300 dark:text-slate-600 text-[10px] uppercase font-bold mt-0.5">
              {item.synced === 1 ? 'Synced' : 'Pending'}
            </Text>
          </View>
        </Pressable>
      </Link>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
      {/* Search Header */}
      <View className="px-5 pt-4 pb-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800/50 shadow-sm">
        <View className="flex-row items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2">
          <SymbolView
            name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
            tintColor="#94A3B8"
            size={18}
          />
          <TextInput
            className="flex-1 ml-3 text-slate-900 dark:text-slate-50 text-sm py-1.5"
            placeholder="Search by name or phone..."
            placeholderTextColor="#94A3B8"
            value={inputText}
            onChangeText={setInputText}
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
          {inputText ? (
            <TouchableOpacity onPress={() => setInputText('')} className="p-1">
              <SymbolView
                name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
                tintColor="#94A3B8"
                size={16}
              />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {/* Customers List */}
      <FlashList
        data={customers}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        estimatedItemSize={72}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20 px-8">
            <SymbolView
              name={{ ios: 'person.crop.circle.badge.questionmark', android: 'person_search', web: 'person_search' }}
              tintColor="#CBD5E1"
              size={64}
            />
            <Text className="text-slate-700 dark:text-slate-300 font-bold text-lg mt-4 text-center">
              {searchQuery ? 'No Results Found' : 'No Customers Yet'}
            </Text>
            <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center max-w-[260px]">
              {searchQuery
                ? `We couldn't find any customer matching "${searchQuery}".`
                : 'Add customers using the plus button or configure your sync credentials in Settings.'}
            </Text>
          </View>
        }
      />

      {/* Floating Action Button */}
      <Link href="/customers/new" asChild>
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
