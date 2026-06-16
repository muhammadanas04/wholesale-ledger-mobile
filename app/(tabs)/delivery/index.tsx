import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  SafeAreaView,
  Pressable,
  StyleSheet,
  Platform,
} from 'react-native';
import { Link, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { FlashList } from '@shopify/flash-list';
import Toast from 'react-native-toast-message';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '../../../db';
import Delivery from '../../../db/models/Delivery';
import { useQuery, useRelation } from '../../../db/hooks';
import { runSync } from '../../../lib/sync';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';

type DeliveryStatus = 'pending' | 'in_progress' | 'completed';

// Extracted Subcomponent to render details reactively for each Delivery
function DeliveryCard({ delivery }: { delivery: Delivery }) {
  const driver = useRelation(delivery.driver);
  const items = useQuery(useMemo(() => delivery.items, [delivery]));
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const completedStops = useMemo(() => {
    return items.filter((item) => item.status === 'done').length;
  }, [items]);

  const totalStops = items.length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          bg: colorScheme === 'dark' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(209, 250, 229, 0.6)',
          text: colors.success,
        };
      case 'in_progress':
        return {
          bg: colorScheme === 'dark' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(224, 242, 254, 0.6)',
          text: colors.accent,
        };
      default:
        return {
          bg: colorScheme === 'dark' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(254, 243, 199, 0.6)',
          text: colors.warning,
        };
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

  const statusStyle = getStatusColor(delivery.status);

  return (
    <Pressable
      onPress={() => router.push(`/delivery/${delivery.id}`)}
      style={styles.cardPressable}
    >
      {({ pressed }) => (
        <GlassView
          style={[
            styles.deliveryCard,
            {
              borderColor: colors.border,
              backgroundColor: pressed
                ? (colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(255, 255, 255, 0.95)')
                : colors.surface,
            }
          ]}
          borderRadius={20}
        >
          <View style={styles.cardHeader}>
            <View style={styles.cardHeaderLeft}>
              <Text style={[styles.driverName, { color: colors.text }]} numberOfLines={1}>
                {driver ? driver.name : 'Unassigned Driver'}
              </Text>
              <Text style={[styles.cardDate, { color: colors.tabIconDefault }]}>
                {formattedDate}
              </Text>
            </View>

            <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
              <Text style={[styles.statusText, { color: statusStyle.text }]}>
                {getStatusLabel(delivery.status)}
              </Text>
            </View>
          </View>

          {/* stops details */}
          <View style={[styles.stopsBox, { backgroundColor: colors.background }]}>
            <SymbolView
              name={{ ios: 'mappin.and.ellipse', android: 'local_shipping', web: 'local_shipping' }}
              tintColor={colors.tint}
              size={14}
            />
            <Text style={[styles.stopsText, { color: colors.text }]}>
              {completedStops} / {totalStops} stops completed
            </Text>
          </View>

          {delivery.notes && (
            <Text style={[styles.notesText, { color: colors.tabIconDefault }]} numberOfLines={2}>
              {delivery.notes}
            </Text>
          )}
        </GlassView>
      )}
    </Pressable>
  );
}

export default function DeliveryDashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

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
    <ScreenBackground>
      {/* Set padding top for safe area in custom stack headers */}
      <View style={styles.rootContainer}>
        
        {/* Top Quick Sub-Navigation Buttons Bar */}
        <View style={styles.quickNav}>
          <TouchableOpacity
            onPress={() => router.push('/delivery/drivers')}
            style={[styles.quickNavBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <SymbolView
              name={{ ios: 'person.2.fill', android: 'people', web: 'people' }}
              tintColor={colors.tint}
              size={14}
            />
            <Text style={[styles.quickNavText, { color: colors.text }]}>
              Drivers List
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => router.push('/delivery/map')}
            style={[styles.quickNavBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
          >
            <SymbolView
              name={{ ios: 'map.fill', android: 'map', web: 'map' }}
              tintColor={colors.tint}
              size={14}
            />
            <Text style={[styles.quickNavText, { color: colors.text }]}>
              Live tracker
            </Text>
          </TouchableOpacity>
        </View>

        {/* Tab Selection Bar */}
        <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
          {(['pending', 'in_progress', 'completed'] as const).map((status) => (
            <TouchableOpacity
              key={status}
              style={[
                styles.tabButton,
                activeTab === status && { borderBottomColor: colors.tint, borderBottomWidth: 2 }
              ]}
              onPress={() => setActiveTab(status)}
            >
              <Text
                style={[
                  styles.tabButtonText,
                  { 
                    color: activeTab === status ? colors.tint : colors.tabIconDefault,
                    fontWeight: activeTab === status ? '700' : '500',
                  }
                ]}
              >
                {status === 'in_progress' ? 'In Progress' : status === 'completed' ? 'Completed' : 'Pending'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Deliveries List */}
        <View style={styles.listContainer}>
          <FlashList
            data={deliveries}
            renderItem={({ item }) => <DeliveryCard delivery={item} />}
            keyExtractor={(item) => item.id}
            estimatedItemSize={120}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <SymbolView
                  name={{ ios: 'shippingbox.fill', android: 'local_shipping', web: 'local_shipping' }}
                  tintColor={colors.tabIconDefault}
                  size={48}
                />
                <Text style={[styles.emptyTitle, { color: colors.text }]}>
                  No deliveries created.
                </Text>
                <Text style={[styles.emptySub, { color: colors.tabIconDefault }]}>
                  There are no deliveries listed under the &ldquo;{activeTab === 'in_progress' ? 'In Progress' : activeTab === 'completed' ? 'Completed' : 'Pending'}&rdquo; status tab.
                </Text>
              </View>
            }
          />
        </View>

        {/* Floating Action Button */}
        <Link href="/delivery/new-delivery" asChild>
          <TouchableOpacity
            style={[
              styles.fab,
              { 
                backgroundColor: colors.tint, 
                shadowColor: colors.tint,
                bottom: Platform.OS === 'ios' ? insets.bottom + 80 : 80 
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
        </Link>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  quickNav: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
  },
  quickNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  quickNavText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 8,
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    marginBottom: 10,
    marginHorizontal: 20,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonText: {
    fontSize: 12,
  },
  listContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 110, // clear floating tab dock
  },
  cardPressable: {
    marginBottom: 10,
  },
  deliveryCard: {
    borderWidth: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  cardHeaderLeft: {
    flex: 1,
    paddingRight: 12,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '700',
  },
  cardDate: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stopsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 6,
  },
  stopsText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
  },
  notesText: {
    fontSize: 10,
    marginTop: 4,
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
