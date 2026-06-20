import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Link, router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { FlashList } from '@shopify/flash-list';
import Toast from 'react-native-toast-message';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import { useQuery } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';

// Extracted Row Item component
function CustomerRow({ item }: { item: Customer }) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  return (
    <Link href={`/customers/${item.id}`} asChild>
      <Pressable>
        {({ pressed }) => (
          <GlassView
            style={[
              styles.row,
              {
                borderColor: colors.border,
                backgroundColor: pressed
                  ? (colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.95)')
                  : colors.surface,
              }
            ]}
            borderRadius={20}
          >
            <View style={styles.rowLeft}>
              <Text style={[styles.nameText, { color: colors.text }]} numberOfLines={1}>
                {item.name}
              </Text>
              {item.phone && (
                <Text style={[styles.phoneText, { color: colors.tabIconDefault }]}>
                  {item.phone}
                </Text>
              )}
            </View>
            <View style={styles.rowRight}>
              <Text
                style={[
                  styles.balanceText,
                  { color: item.balance > 0 ? colors.danger : colors.success }
                ]}
              >
                {formatCurrency(item.balance)}
              </Text>
              <Text style={[styles.syncText, { color: colors.tabIconDefault }]}>
                {item.synced === 1 ? 'Synced' : 'Pending'}
              </Text>
            </View>
          </GlassView>
        )}
      </Pressable>
    </Link>
  );
}

export default function CustomerListScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

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

  return (
    <ScreenBackground>
      <Stack.Screen
        options={{
          headerRight: () => (
            <TouchableOpacity
              onPress={() => router.push('/customers/new')}
              style={{ marginRight: 15, padding: 8 }}
            >
              <SymbolView
                name={{ ios: 'person.fill.badge.plus', android: 'person_add', web: 'person_add' }}
                tintColor={colors.tint}
                size={22}
              />
            </TouchableOpacity>
          ),
        }}
      />
      {/* Set padding top for safe area in custom stack headers */}
      <View style={styles.rootContainer}>
        {/* Search Header */}
        <View style={styles.searchHeader}>
          <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <SymbolView
              name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
              tintColor={colors.tabIconDefault}
              size={16}
            />
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              placeholder="Search customers by name or phone..."
              placeholderTextColor={colors.tabIconDefault}
              value={inputText}
              onChangeText={setInputText}
              autoCorrect={false}
            />
            {inputText ? (
              <TouchableOpacity onPress={() => setInputText('')} style={styles.clearBtn}>
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
                  tintColor={colors.tabIconDefault}
                  size={16}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Customers List */}
        <FlashList
          data={customers}
          renderItem={({ item }) => <CustomerRow item={item} />}
          keyExtractor={(item) => item.id}
          estimatedItemSize={76}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <SymbolView
                name={{ ios: 'person.crop.circle.badge.questionmark', android: 'person_search', web: 'person_search' }}
                tintColor={colors.tabIconDefault}
                size={48}
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {searchQuery ? 'No Results Found' : 'No customers yet.'}
              </Text>
              <Text style={[styles.emptySub, { color: colors.tabIconDefault }]}>
                {searchQuery
                  ? `We couldn't find any customer matching "${searchQuery}".`
                  : 'Tap + to add one.'}
              </Text>
            </View>
          }
        />

        <TouchableOpacity
          onPress={() => router.push('/customers/new')}
          style={[
            styles.fab,
            { 
              backgroundColor: colors.tint, 
              shadowColor: colors.tint,
              bottom: Platform.OS === 'ios' ? insets.bottom + 110 : 110 
            }
          ]}
          activeOpacity={0.8}
        >
          <SymbolView
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            tintColor="#FFFFFF"
            size={22}
          />
        </TouchableOpacity>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  searchHeader: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    paddingVertical: 10,
  },
  clearBtn: {
    padding: 2,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 110, // clear floating tab dock
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowLeft: {
    flex: 1,
    paddingRight: 12,
  },
  nameText: {
    fontSize: 14,
    fontWeight: '700',
  },
  phoneText: {
    fontSize: 11,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  rowRight: {
    alignItems: 'flex-end',
  },
  balanceText: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  syncText: {
    fontSize: 8,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    height: 54,
    width: 54,
    borderRadius: 27,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
