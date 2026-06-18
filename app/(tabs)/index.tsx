import { Q } from '@nozbe/watermelondb';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';

import AddTmpRecordModal from '../../components/AddTmpRecordModal';
import { GlassView } from '../../components/GlassView';
import { ScreenBackground } from '../../components/ScreenBackground';
import TmpRecordsViewerModal from '../../components/TmpRecordsViewerModal';
import { useColorScheme } from '../../components/useColorScheme';
import Colors from '../../constants/Colors';
import { database } from '../../db';
import { useQuery, useRelation } from '../../db/hooks';
import Customer from '../../db/models/Customer';
import Delivery from '../../db/models/Delivery';
import Driver from '../../db/models/Driver';
import Payment from '../../db/models/Payment';
import Sale from '../../db/models/Sale';
import TmpRecord from '../../db/models/TmpRecord';
import { runSync } from '../../lib/sync';
import { formatCurrency } from '../../lib/utils';
import { useAppStore } from '../../store/app';

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

function ActivityRow({ item, isFirst, isLast }: { item: ActivityItem; isFirst: boolean; isLast: boolean }) {
  const customer = useRelation(item.record.customer);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const isSale = item.type === 'sale';

  return (
    <Pressable
      onPress={() => router.push(`/customers/${item.customerId}?referrer=dashboard`)}
      style={({ pressed }) => [
        styles.activityRow,
        {
          borderBottomColor: colors.border,
          borderBottomWidth: isLast ? 0 : 1,
          paddingTop: isFirst ? 20 : 14,
          paddingBottom: isLast ? 20 : 14,
          backgroundColor: pressed
            ? (colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)')
            : 'transparent'
        }
      ]}
    >
      <View style={styles.activityRowLeft}>
        {/* Type Icon */}
        <View
          style={[
            styles.activityIconContainer,
            {
              backgroundColor: isSale
                ? (colorScheme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(254, 226, 226, 0.6)')
                : (colorScheme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(209, 250, 229, 0.6)')
            }
          ]}
        >
          <SymbolView
            name={
              isSale
                ? { ios: 'arrow.up.right.circle.fill', android: 'arrow_outward', web: 'arrow_outward' }
                : { ios: 'arrow.down.left.circle.fill', android: 'arrow_downward', web: 'arrow_downward' }
            }
            tintColor={isSale ? colors.danger : colors.success}
            size={20}
          />
        </View>

        {/* Customer & Type details */}
        <View style={styles.activityDetails}>
          <Text style={[styles.activityCustomerName, { color: colors.text }]} numberOfLines={1}>
            {customer ? customer.name : (customer === null ? 'Unknown' : 'Loading customer...')}
          </Text>
          <View style={styles.activityMetaRow}>
            <Text style={[styles.activityDate, { color: colors.tabIconDefault }]}>
              {item.date}
            </Text>
            <View style={[styles.dot, { backgroundColor: colors.border }]} />
            <Text style={[styles.activityNotes, { color: colors.tabIconDefault }]} numberOfLines={1}>
              {item.notes || (isSale ? 'Sale' : 'Payment')}
            </Text>
          </View>
        </View>
      </View>

      {/* Amount and status details */}
      <View style={styles.activityRowRight}>
        <Text
          style={[
            styles.activityAmount,
            { color: isSale ? colors.danger : colors.success }
          ]}
        >
          {isSale ? '-' : '+'}{formatCurrency(item.amount)}
        </Text>
        <Text style={[styles.activitySyncBadge, { color: colors.tabIconDefault }]}>
          {item.record.synced === 1 ? 'Synced' : 'Pending'}
        </Text>
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewerModal, setShowViewerModal] = useState(false);
  const { syncStatus, lastSyncTime, shopName } = useAppStore();

  // Queries
  const customers = useQuery(useMemo(() => database.collections.get<Customer>('customers').query(), []));
  const activeDrivers = useQuery(useMemo(() => database.collections.get<Driver>('drivers').query(Q.where('active', 1)), []));
  const deliveries = useQuery(useMemo(() => database.collections.get<Delivery>('deliveries').query(), []));
  const sales = useQuery(useMemo(() => database.collections.get<Sale>('sales').query(Q.sortBy('created_at', Q.desc), Q.take(10)), []));
  const payments = useQuery(useMemo(() => database.collections.get<Payment>('payments').query(Q.sortBy('created_at', Q.desc), Q.take(10)), []));
  const tmpRecords = useQuery(useMemo(() => database.collections.get<TmpRecord>('tmp_records').query(Q.sortBy('created_at', Q.desc)), []));

  const tmpRecordsCount = tmpRecords.length;

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
          bg: colorScheme === 'dark' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(224, 242, 254, 0.6)',
          border: colorScheme === 'dark' ? 'rgba(56, 189, 248, 0.3)' : 'rgba(186, 230, 253, 0.6)',
          text: colors.accent,
          label: 'Syncing',
          icon: 'arrow.triangle.2.circlepath',
        };
      case 'error':
        return {
          bg: colorScheme === 'dark' ? 'rgba(248, 113, 113, 0.15)' : 'rgba(254, 226, 226, 0.6)',
          border: colorScheme === 'dark' ? 'rgba(248, 113, 113, 0.3)' : 'rgba(254, 205, 211, 0.6)',
          text: colors.danger,
          label: 'Sync Error',
          icon: 'exclamationmark.triangle.fill',
        };
      case 'not-configured':
        return {
          bg: colorScheme === 'dark' ? 'rgba(100, 116, 139, 0.15)' : 'rgba(241, 245, 249, 0.6)',
          border: colorScheme === 'dark' ? 'rgba(100, 116, 139, 0.3)' : 'rgba(226, 232, 240, 0.6)',
          text: colors.tabIconDefault,
          label: 'Unconfigured',
          icon: 'gearshape.fill',
        };
      default:
        return {
          bg: colorScheme === 'dark' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(209, 250, 229, 0.6)',
          border: colorScheme === 'dark' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(167, 243, 208, 0.6)',
          text: colors.success,
          label: 'Synced',
          icon: 'checkmark.circle.fill',
        };
    }
  };

  const syncBadge = getSyncBadge();

  return (
    <ScreenBackground>
      {/* Set padding top for safe area in custom stack headers */}
      <View style={styles.rootContainer}>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
          }
        >
          {/* Welcome Header */}
          <GlassView style={styles.welcomeCard} borderRadius={24}>
            <View>
              <Text style={[styles.welcomeTitle, { color: colors.text }]}>
                {shopName}
              </Text>
              <Text style={[styles.welcomeSub, { color: colors.tabIconDefault }]}>
                Last sync: {formattedSyncTime}
              </Text>
            </View>

            {/* Sync Status Badge */}
            <View style={[styles.badgeContainer, { backgroundColor: syncBadge.bg, borderColor: syncBadge.border }]}>
              <SymbolView
                name={{ ios: syncBadge.icon as any, android: syncStatus === 'error' ? 'warning' : 'sync', web: 'sync' }}
                tintColor={syncBadge.text}
                size={12}
              />
              <Text style={[styles.badgeText, { color: syncBadge.text }]}>
                {syncBadge.label}
              </Text>
            </View>
          </GlassView>

          {/* Metrics Grid */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricsRow}>
              {/* Receivables Card */}
              <TouchableOpacity
                onPress={() => router.push('/customers')}
                style={styles.metricCardContainer}
                activeOpacity={0.9}
              >
                <GlassView style={{ ...styles.metricCard, marginRight: 6 }} borderRadius={24}>
                  <View style={styles.metricHeader}>
                    <Text style={[styles.metricLabel, { color: colors.tabIconDefault }]}>
                      Receivables
                    </Text>
                    <View style={[styles.metricIconBox, { backgroundColor: colorScheme === 'dark' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(254, 226, 226, 0.6)' }]}>
                      <SymbolView
                        name={{ ios: 'indianrupeesign.circle.fill', android: 'payments', web: 'payments' }}
                        tintColor={colors.danger}
                        size={14}
                      />
                    </View>
                  </View>
                  <Text
                    style={[styles.metricValueLarge, { color: colors.danger }]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                  >
                    {formatCurrency(totalOutstandingBalance)}
                  </Text>
                  <Text style={[styles.metricSubtext, { color: colors.tabIconDefault }]}>
                    Outstanding balance due
                  </Text>
                </GlassView>
              </TouchableOpacity>

              {/* Drivers Card */}
              <TouchableOpacity
                onPress={() => router.push('/delivery/drivers')}
                style={styles.metricCardContainer}
                activeOpacity={0.9}
              >
                <GlassView style={styles.metricCard} borderRadius={24}>
                  <View style={styles.metricHeader}>
                    <Text style={[styles.metricLabel, { color: colors.tabIconDefault }]}>
                      Drivers
                    </Text>
                    <View style={[styles.metricIconBox, { backgroundColor: colorScheme === 'dark' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(224, 242, 254, 0.6)' }]}>
                      <SymbolView
                        name={{ ios: 'person.2.fill', android: 'people', web: 'people' }}
                        tintColor={colors.accent}
                        size={14}
                      />
                    </View>
                  </View>
                  <Text style={[styles.metricValueText, { color: colors.accent }]}>
                    {activeDriversCount}
                  </Text>
                  <Text style={[styles.metricSubtext, { color: colors.tabIconDefault }]}>
                    Active drivers in system
                  </Text>
                </GlassView>
              </TouchableOpacity>
            </View>

            {/* Delivery Progress Card */}
            <TouchableOpacity
              onPress={() => router.push('/delivery')}
              activeOpacity={0.9}
            >
              <GlassView style={styles.deliveryProgressCard} borderRadius={24}>
                <View style={styles.deliveryCardHeader}>
                  <View style={styles.deliveryCardTitleRow}>
                    <View style={[styles.deliveryProgressIconBox, { backgroundColor: colorScheme === 'dark' ? 'rgba(13, 148, 136, 0.15)' : 'rgba(204, 251, 241, 0.6)' }]}>
                      <SymbolView
                        name={{ ios: 'shippingbox.fill', android: 'local_shipping', web: 'local_shipping' }}
                        tintColor={colors.tint}
                        size={20}
                      />
                    </View>
                    <Text style={[styles.deliveryCardTitle, { color: colors.text }]}>
                      Delivery Progress
                    </Text>
                  </View>
                  <SymbolView
                    name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                    tintColor={colors.tabIconDefault}
                    size={20}
                  />
                </View>

                {/* Delivery Stats Row */}
                <View style={styles.deliveryStatsRow}>
                  <View style={styles.deliveryStatItem}>
                    <Text style={[styles.deliveryStatValue, { color: colors.warning }]}>
                      {deliveriesProgress.pending}
                    </Text>
                    <Text style={[styles.deliveryStatLabel, { color: colors.tabIconDefault }]}>
                      Pending
                    </Text>
                  </View>
                  <View style={[styles.deliveryStatDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.deliveryStatItem}>
                    <Text style={[styles.deliveryStatValue, { color: colors.accent }]}>
                      {deliveriesProgress.inProgress}
                    </Text>
                    <Text style={[styles.deliveryStatLabel, { color: colors.tabIconDefault }]}>
                      Active
                    </Text>
                  </View>
                  <View style={[styles.deliveryStatDivider, { backgroundColor: colors.border }]} />
                  <View style={styles.deliveryStatItem}>
                    <Text style={[styles.deliveryStatValue, { color: colors.success }]}>
                      {deliveriesProgress.completed}
                    </Text>
                    <Text style={[styles.deliveryStatLabel, { color: colors.tabIconDefault }]}>
                      Completed
                    </Text>
                  </View>
                </View>

                {/* Progress Bar */}
                {(() => {
                  const total = deliveriesProgress.pending + deliveriesProgress.inProgress + deliveriesProgress.completed;
                  const percent = total > 0 ? Math.round((deliveriesProgress.completed / total) * 100) : 0;
                  return (
                    <View style={styles.deliveryProgressWrapper}>
                      <View style={styles.deliveryProgressBarHeader}>
                        <Text style={[styles.deliveryProgressPercentText, { color: colors.tabIconDefault }]}>
                          {percent}% overall completion
                        </Text>
                      </View>
                      <View style={[styles.deliveryProgressBarTrack, { backgroundColor: colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)', borderColor: colors.border }]}>
                        <View
                          style={[
                            styles.deliveryProgressBarFill,
                            { backgroundColor: colors.tint, width: `${percent}%` }
                          ]}
                        />
                      </View>
                    </View>
                  );
                })()}
              </GlassView>
            </TouchableOpacity>

            {/* Add Record Card (New) */}
            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              activeOpacity={0.9}
              style={{ marginTop: 16 }}
            >
              <GlassView style={styles.addRecordCardLarge} borderRadius={24}>
                <View style={styles.addRecordCardLeftLarge}>
                  <View style={[styles.addRecordIconBoxLarge, { backgroundColor: colorScheme === 'dark' ? 'rgba(45, 212, 191, 0.15)' : 'rgba(204, 251, 241, 0.6)' }]}>
                    <SymbolView
                      name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}
                      tintColor={colors.tint}
                      size={24}
                    />
                  </View>
                  <View style={styles.addRecordTextCol}>
                    <Text style={[styles.addRecordTitleLarge, { color: colors.text }]}>
                      Add Temporary Record
                    </Text>
                    <Text style={[styles.addRecordSubtitleLarge, { color: colors.tabIconDefault }]}>
                      Quick log sales, payments, or other expenses
                    </Text>
                  </View>
                </View>
                <SymbolView
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                  tintColor={colors.tabIconDefault}
                  size={20}
                />
              </GlassView>
            </TouchableOpacity>

            {/* Temporary Records Count Banner (New) */}
            <TouchableOpacity
              onPress={() => setShowViewerModal(true)}
              activeOpacity={0.9}
              style={{ marginTop: 16 }}
            >
              <GlassView style={styles.tmpRecordsStatusCard} borderRadius={24}>
                <View style={styles.tmpRecordsLeft}>
                  <View style={[styles.tmpRecordsIconBox, { backgroundColor: colorScheme === 'dark' ? 'rgba(56, 189, 248, 0.15)' : 'rgba(224, 242, 254, 0.6)' }]}>
                    <SymbolView
                      name={{ ios: 'clock.badge.fill', android: 'schedule', web: 'schedule' }}
                      tintColor={colors.accent}
                      size={22}
                    />
                  </View>
                  <View style={styles.tmpRecordsTextCol}>
                    <Text style={[styles.tmpRecordsTitle, { color: colors.text }]}>
                      Active Temp Records
                    </Text>
                    <Text style={[styles.tmpRecordsSub, { color: colors.tabIconDefault }]}>
                      Tap to view or delete temporary logs
                    </Text>
                  </View>
                </View>
                <View style={styles.tmpRecordsRight}>
                  <View style={[styles.tmpRecordsBadge, { backgroundColor: tmpRecordsCount > 0 ? colors.accent : (colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)') }]}>
                    <Text style={[styles.tmpRecordsBadgeText, { color: tmpRecordsCount > 0 ? '#FFFFFF' : colors.tabIconDefault }]}>
                      {tmpRecordsCount}
                    </Text>
                  </View>
                  <SymbolView
                    name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                    tintColor={colors.tabIconDefault}
                    size={20}
                  />
                </View>
              </GlassView>
            </TouchableOpacity>
          </View>

          {/* Recent Activity Section */}
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              Recent Activity
            </Text>
            <Text style={[styles.sectionSub, { color: colors.tabIconDefault }]}>
              Latest invoices and receipts
            </Text>
          </View>

          {/* Activity List Container */}
          <GlassView style={styles.activityCard} borderRadius={24}>
            {recentActivities.length === 0 ? (
              <View style={styles.emptyActivity}>
                <SymbolView
                  name={{ ios: 'doc.plaintext.fill', android: 'receipt_long', web: 'receipt_long' }}
                  tintColor={colors.tabIconDefault}
                  size={36}
                />
                <Text style={[styles.emptyActivityTitle, { color: colors.text }]}>
                  No recent activity.
                </Text>
                <Text style={[styles.emptyActivitySub, { color: colors.tabIconDefault }]}>
                  Create new sales or record payments to see them listed here.
                </Text>
              </View>
            ) : (
              recentActivities.map((activity, index) => (
                <ActivityRow
                  key={`${activity.type}-${activity.id}`}
                  item={activity}
                  isFirst={index === 0}
                  isLast={index === recentActivities.length - 1}
                />
              ))
            )}
          </GlassView>
        </ScrollView>

        <AddTmpRecordModal
          visible={showAddModal}
          onClose={() => setShowAddModal(false)}
        />

        <TmpRecordsViewerModal
          visible={showViewerModal}
          onClose={() => setShowViewerModal(false)}
          records={tmpRecords}
        />
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 110, // clear floating dock
  },
  welcomeCard: {
    padding: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '800',
  },
  welcomeSub: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginTop: 4,
  },
  badgeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 9,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginLeft: 6,
  },
  metricsGrid: {
    marginBottom: 20,
  },
  metricsRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  metricCardContainer: {
    flex: 1,
  },
  metricCard: {
    padding: 20,
    height: 136,
    justifyContent: 'space-between',
  },
  metricHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  metricIconBox: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricValueLarge: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  metricValueText: {
    fontSize: 26,
    fontWeight: '800',
  },
  metricSubtext: {
    fontSize: 10,
    fontWeight: '600',
  },
  deliveryProgressCard: {
    padding: 20,
    marginTop: 16,
  },
  deliveryCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  deliveryCardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deliveryProgressIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliveryCardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginLeft: 12,
  },
  deliveryStatsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 8,
  },
  deliveryStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  deliveryStatValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  deliveryStatLabel: {
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  deliveryStatDivider: {
    width: 1,
    height: 24,
  },
  deliveryProgressWrapper: {
    marginTop: 4,
  },
  deliveryProgressBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  deliveryProgressPercentText: {
    fontSize: 11,
    fontWeight: '600',
  },
  deliveryProgressBarTrack: {
    height: 8,
    width: '100%',
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
  },
  deliveryProgressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  addRecordCardLarge: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  addRecordCardLeftLarge: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  addRecordIconBoxLarge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  addRecordTextCol: {
    flex: 1,
  },
  addRecordTitleLarge: {
    fontSize: 15,
    fontWeight: '800',
  },
  addRecordSubtitleLarge: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 15,
  },
  tmpRecordsStatusCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
  },
  tmpRecordsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  tmpRecordsIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  tmpRecordsTextCol: {
    flex: 1,
  },
  tmpRecordsTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  tmpRecordsSub: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 15,
  },
  tmpRecordsRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tmpRecordsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 10,
    minWidth: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tmpRecordsBadgeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  sectionHeader: {
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  sectionSub: {
    fontSize: 11,
    marginTop: 1,
  },
  activityCard: {
    paddingVertical: 8,
    paddingHorizontal: 8,

  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  activityRowLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
  },
  activityIconContainer: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  activityDetails: {
    flex: 1,
  },
  activityCustomerName: {
    fontSize: 15,
    fontWeight: '700',
  },
  activityMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  activityDate: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 6,
  },
  activityNotes: {
    fontSize: 11,
    flex: 1,
  },
  activityRowRight: {
    alignItems: 'flex-end',
  },
  activityAmount: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  activitySyncBadge: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  emptyActivity: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  emptyActivityTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 10,
  },
  emptyActivitySub: {
    fontSize: 11,
    marginTop: 2,
    textAlign: 'center',
  },
});
