import React, { useState, useEffect, useMemo } from 'react';
import {
  Text,
  View,
  ScrollView,
  ActivityIndicator,
  SafeAreaView,
  RefreshControl,
  StyleSheet,
  Platform,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '../../../db';
import Driver from '../../../db/models/Driver';
import Delivery from '../../../db/models/Delivery';
import DeliveryItem from '../../../db/models/DeliveryItem';
import { useQuery, useRelation } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';

// Subcomponent to render each Stop/DeliveryItem row reactively
function StopRowItem({ item, index }: { item: DeliveryItem; index: number }) {
  const customer = useRelation(item.customer);
  const isDone = item.status === 'done';
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  return (
    <GlassView
      style={[
        styles.stopRow,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }
      ]}
      borderRadius={16}
    >
      {/* Read-only status checkbox indicator */}
      <View style={styles.checkboxWrapper}>
        <SymbolView
          name={
            isDone
              ? { ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }
              : { ios: 'circle', android: 'radio_button_unchecked', web: 'radio_button_unchecked' }
          }
          tintColor={isDone ? colors.success : colors.tabIconDefault}
          size={22}
        />
      </View>

      <View style={styles.stopDetails}>
        <View style={styles.stopHeaderRow}>
          <Text style={[styles.stopLabel, { color: colors.tabIconDefault }]}>
            STOP #{index + 1}
          </Text>
          <View style={[styles.badge, { backgroundColor: isDone ? (colorScheme === 'dark' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(209, 250, 229, 0.6)') : (colorScheme === 'dark' ? 'rgba(251, 191, 36, 0.15)' : 'rgba(254, 243, 199, 0.6)') }]}>
            <Text style={[styles.badgeText, { color: isDone ? colors.success : colors.warning }]}>
              {isDone ? 'Delivered' : 'Pending'}
            </Text>
          </View>
        </View>

        <Text style={[styles.stopAddress, { color: colors.text }]}>
          {item.address}
        </Text>

        <View style={styles.stopMeta}>
          <SymbolView
            name={{ ios: 'cube.box.fill', android: 'inventory_2', web: 'inventory_2' }}
            tintColor={colors.tabIconDefault}
            size={12}
          />
          <Text style={[styles.stopMetaText, { color: colors.tabIconDefault }]}>
            {item.stockAmount}
          </Text>
        </View>

        {customer && (
          <View style={[styles.stopLink, { borderTopColor: colors.border }]}>
            <SymbolView
              name={{ ios: 'person.crop.circle.fill', android: 'person', web: 'person' }}
              tintColor={colors.tint}
              size={12}
            />
            <Text style={[styles.stopLinkText, { color: colors.tint }]}>
              Client: {customer.name}
            </Text>
            <Text style={[styles.stopLinkBal, { color: colors.tabIconDefault }]}>
              (Bal: {formatCurrency(customer.balance)})
            </Text>
          </View>
        )}
      </View>
    </GlassView>
  );
}

export default function DeliveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

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
      <ScreenBackground>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </ScreenBackground>
    );
  }

  if (!delivery) {
    return (
      <ScreenBackground>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Task Not Found</Text>
          <Text style={[styles.errorSub, { color: colors.tabIconDefault }]}>
            The selected delivery route record does not exist or has been removed.
          </Text>
        </View>
      </ScreenBackground>
    );
  }

  const statusStyle = getStatusColor(delivery.status);

  return (
    <ScreenBackground>
      {/* Set padding top for safe area in custom stack headers */}
      <View style={styles.rootContainer}>
        <ScrollView
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
          }
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Header/Driver Info Card */}
          <GlassView style={styles.card}>
            <View style={styles.cardHeader}>
              <View style={styles.headerTextContainer}>
                <Text style={[styles.cardLabel, { color: colors.tabIconDefault }]}>
                  Assigned Driver
                </Text>
                <Text style={[styles.driverName, { color: colors.text }]}>
                  {driver ? driver.name : 'Loading driver details...'}
                </Text>
                {driver?.phone && (
                  <Text style={[styles.driverPhone, { color: colors.tabIconDefault }]}>
                    {driver.phone}
                  </Text>
                )}
              </View>

              <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                <Text style={[styles.statusText, { color: statusStyle.text }]}>
                  {getStatusLabel(delivery.status)}
                </Text>
              </View>
            </View>

            <Text style={[styles.dispatchedText, { color: colors.tabIconDefault, borderTopColor: colors.border }]}>
              Dispatched: {formattedDate}
            </Text>
          </GlassView>

          {/* Dynamic Route Progress Card */}
          <GlassView style={styles.card}>
            <View style={styles.progressHeader}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>
                Route Progress
              </Text>
              <Text style={[styles.progressPercent, { color: colors.tint }]}>
                {progressStats.percent}% Done
              </Text>
            </View>
            
            <Text style={[styles.progressStopsText, { color: colors.tabIconDefault }]}>
              {progressStats.completed} of {progressStats.total} stops completed
            </Text>

            {/* Custom Dynamic Progress Bar Track */}
            <View style={[styles.progressBarTrack, { backgroundColor: colors.background, borderColor: colors.border }]}>
              <View
                style={[styles.progressBarFill, { backgroundColor: colors.tint, width: `${progressStats.percent}%` }]}
              />
            </View>
          </GlassView>

          {delivery.notes && (
            <GlassView style={styles.card}>
              <Text style={[styles.cardLabel, { color: colors.tabIconDefault, marginBottom: 8 }]}>
                Dispatch Instructions
              </Text>
              <Text style={[styles.instructionsText, { color: colors.text }]}>
                {delivery.notes}
              </Text>
            </GlassView>
          )}

          {/* Stops Checklist Section */}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Stops Checklist
          </Text>

          <View style={styles.stopsListContainer}>
            {stops.length === 0 ? (
              <GlassView style={styles.emptyCard}>
                <Text style={{ color: colors.tabIconDefault, fontSize: 12 }}>No stops associated with this delivery.</Text>
              </GlassView>
            ) : (
              stops.map((stop, index) => (
                <StopRowItem key={stop.id} item={stop} index={index} />
              ))
            )}
          </View>
        </ScrollView>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  errorSub: {
    fontSize: 13,
    marginTop: 6,
    textAlign: 'center',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerTextContainer: {
    flex: 1,
    paddingRight: 12,
  },
  cardLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  driverName: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 4,
  },
  driverPhone: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  dispatchedText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  progressPercent: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  progressStopsText: {
    fontSize: 11,
    fontWeight: '600',
  },
  progressBarTrack: {
    height: 8,
    width: '100%',
    borderRadius: 4,
    marginTop: 14,
    overflow: 'hidden',
    borderWidth: 1,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  instructionsText: {
    fontSize: 13,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 12,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  stopsListContainer: {
    marginBottom: 24,
  },
  emptyCard: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
  },
  checkboxWrapper: {
    marginRight: 12,
    marginTop: 2,
  },
  stopDetails: {
    flex: 1,
  },
  stopHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  stopLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  badgeText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  stopAddress: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 6,
  },
  stopMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  stopMetaText: {
    fontSize: 11,
    fontWeight: '600',
    marginLeft: 6,
  },
  stopLink: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
  },
  stopLinkText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
  },
  stopLinkBal: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginLeft: 6,
  },
});
