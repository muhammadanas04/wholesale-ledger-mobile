import React, { useState, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Modal,
  TextInput,
  Pressable,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { FlashList } from '@shopify/flash-list';
import Toast from 'react-native-toast-message';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '../../../db';
import Sale from '../../../db/models/Sale';
import Payment from '../../../db/models/Payment';
import Customer from '../../../db/models/Customer';
import SaleItem from '../../../db/models/SaleItem';
import { useQuery, useRelation } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';

interface UnifiedTransaction {
  id: string;
  type: 'sale' | 'payment';
  customerId: string;
  amount: number;
  discount: number;
  date: string;
  notes?: string;
  createdAt?: string;
  synced: number;
  record: Sale | Payment;
}

function LedgerRow({ item }: { item: UnifiedTransaction }) {
  const customer = useRelation(item.record.customer);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const isSale = item.type === 'sale';

  const finalValue = item.amount - item.discount;

  return (
    <Pressable
      onPress={() => router.push(`/customers/${item.customerId}`)}
      style={({ pressed }) => [
        styles.row,
        {
          borderBottomColor: colors.border,
          backgroundColor: pressed 
            ? (colorScheme === 'dark' ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.03)')
            : 'transparent',
        }
      ]}
    >
      {/* Date Cell */}
      <Text style={[styles.cell, styles.dateCell, { color: colors.tabIconDefault, width: 90 }]}>
        {item.date}
      </Text>

      {/* Customer Cell */}
      <Text style={[styles.cell, styles.customerCell, { color: colors.text, width: 115 }]} numberOfLines={1}>
        {customer ? customer.name : (customer === null ? 'Unknown' : 'Loading...')}
      </Text>

      {/* Sale (Debit) Cell */}
      <Text style={[styles.cell, styles.amountCell, { color: isSale ? colors.danger : colors.tabIconDefault, width: 85 }]}>
        {isSale ? formatCurrency(item.amount) : '-'}
      </Text>

      {/* Paid (Credit) Cell */}
      <Text style={[styles.cell, styles.amountCell, { color: !isSale ? colors.success : colors.tabIconDefault, width: 85 }]}>
        {!isSale ? formatCurrency(item.amount) : '-'}
      </Text>

      {/* Discount Cell */}
      <Text style={[styles.cell, styles.amountCell, { color: colors.danger, width: 80 }]}>
        {item.discount > 0 ? `-${formatCurrency(item.discount)}` : '-'}
      </Text>

      {/* Final Value Cell */}
      <Text style={[styles.cell, styles.amountCell, styles.finalValueCell, { color: colors.text, width: 100 }]}>
        {formatCurrency(finalValue)}
      </Text>
    </Pressable>
  );
}

export default function LedgerScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const [refreshing, setRefreshing] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'sales' | 'payments'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'today' | 'month'>('all');
  
  // Customer Picker Modal
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // 1. Fetch Customers for filter dropdown
  const customersQuery = useMemo(() => {
    const clean = Q.sanitizeLikeString(customerSearch.trim());
    const clauses = [];
    if (clean) {
      clauses.push(Q.where('name', Q.like(`%${clean}%`)));
    }
    clauses.push(Q.sortBy('name', Q.asc));
    return database.collections.get<Customer>('customers').query(...clauses);
  }, [customerSearch]);

  const customerList = useQuery(customersQuery);

  // Helper date queries
  const getDateRangeClause = () => {
    const today = new Date().toISOString().split('T')[0];
    if (timeFilter === 'today') {
      return [Q.where('date', today)];
    }
    if (timeFilter === 'month') {
      const firstDay = new Date();
      firstDay.setDate(1);
      const firstDayStr = firstDay.toISOString().split('T')[0];
      return [Q.where('date', Q.between(firstDayStr as any, today as any))];
    }
    return [];
  };

  // 2. Fetch Sales reactively
  const salesQuery = useMemo(() => {
    const clauses: any[] = [...getDateRangeClause()];
    if (selectedCustomer) {
      clauses.push(Q.where('customer_id', selectedCustomer.id));
    }
    clauses.push(Q.sortBy('date', Q.desc));
    return database.collections.get<Sale>('sales').query(...clauses);
  }, [selectedCustomer, timeFilter]);

  const sales = useQuery(salesQuery);

  // 3. Fetch Payments reactively
  const paymentsQuery = useMemo(() => {
    const clauses: any[] = [...getDateRangeClause()];
    if (selectedCustomer) {
      clauses.push(Q.where('customer_id', selectedCustomer.id));
    }
    clauses.push(Q.sortBy('date', Q.desc));
    return database.collections.get<Payment>('payments').query(...clauses);
  }, [selectedCustomer, timeFilter]);

  const payments = useQuery(paymentsQuery);

  // 4. Combine and filter transaction records
  const combinedTransactions = useMemo(() => {
    const list: UnifiedTransaction[] = [];

    if (typeFilter === 'all' || typeFilter === 'sales') {
      sales.forEach(sale => {
        list.push({
          id: sale.id,
          type: 'sale',
          customerId: sale.customerId,
          amount: sale.totalAmount,
          discount: sale.discount,
          date: sale.date,
          notes: sale.notes,
          createdAt: sale.createdAt,
          synced: sale.synced,
          record: sale,
        });
      });
    }

    if (typeFilter === 'all' || typeFilter === 'payments') {
      payments.forEach(pay => {
        list.push({
          id: pay.id,
          type: 'payment',
          customerId: pay.customerId,
          amount: pay.amount,
          discount: pay.discount,
          date: pay.date,
          notes: pay.notes,
          createdAt: pay.createdAt,
          synced: pay.synced,
          record: pay,
        });
      });
    }

    return list.sort((a, b) => {
      const timeA = a.createdAt || a.date;
      const timeB = b.createdAt || b.date;
      return timeB.localeCompare(timeA);
    });
  }, [sales, payments, typeFilter]);

  // 5. Calculate summary metrics
  const summary = useMemo(() => {
    let totalSales = 0;
    let totalPaid = 0;
    let totalDiscount = 0;

    sales.forEach(s => totalSales += (s.totalAmount || 0));
    payments.forEach(p => {
      totalPaid += (p.amount || 0);
      totalDiscount += (p.discount || 0);
    });

    return {
      sales: totalSales,
      paid: totalPaid,
      discount: totalDiscount,
      balance: totalSales - totalPaid - totalDiscount,
    };
  }, [sales, payments]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await runSync(database);
    } catch (e: any) {
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: e.message || 'Error occurred during sync',
      });
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <ScreenBackground>
      <View style={[styles.headerContainer, { paddingTop: insets.top }]}>
        <View style={styles.headerTitleRow}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>Ledger</Text>
          <View style={styles.shortcuts}>
            <TouchableOpacity
              onPress={() => router.push('/ledger/new-sale')}
              style={[styles.shortcutButton, { backgroundColor: colors.tint }]}
            >
              <Text style={styles.shortcutText}>+ Sale</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push('/ledger/new-payment')}
              style={[styles.shortcutButton, { backgroundColor: colors.accent }]}
            >
              <Text style={styles.shortcutText}>+ Payment</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Filters Panel */}
        <View style={styles.filtersWrapper}>
          {/* Customer filter bar */}
          <TouchableOpacity
            style={[styles.customerPickerButton, { backgroundColor: colors.surface, borderColor: colors.border }]}
            onPress={() => setCustomerModalVisible(true)}
          >
            <View style={styles.customerPickerLeft}>
              <SymbolView
                name={{ ios: 'person.crop.circle', android: 'person', web: 'person' }}
                tintColor={selectedCustomer ? colors.tint : colors.tabIconDefault}
                size={16}
              />
              <Text style={[styles.customerPickerLabel, { color: selectedCustomer ? colors.text : colors.tabIconDefault }]}>
                {selectedCustomer ? selectedCustomer.name : 'Filter by Customer'}
              </Text>
            </View>
            {selectedCustomer ? (
              <TouchableOpacity onPress={() => setSelectedCustomer(null)} style={styles.clearBtn}>
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                  tintColor={colors.tabIconDefault}
                  size={14}
                />
              </TouchableOpacity>
            ) : (
              <SymbolView
                name={{ ios: 'chevron.down', android: 'arrow_drop_down', web: 'arrow_drop_down' }}
                tintColor={colors.tabIconDefault}
                size={14}
              />
            )}
          </TouchableOpacity>

          {/* Type filters segment */}
          <View style={[styles.segmentContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {(['all', 'sales', 'payments'] as const).map(type => (
              <TouchableOpacity
                key={type}
                onPress={() => setTypeFilter(type)}
                style={[
                  styles.segmentButton,
                  typeFilter === type && {
                    backgroundColor: colors.surfaceSolid,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 1,
                  }
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { 
                      color: typeFilter === type ? colors.tint : colors.tabIconDefault,
                      fontWeight: typeFilter === type ? '700' : '500' 
                    }
                  ]}
                >
                  {type === 'all' ? 'All' : type === 'sales' ? 'Sales' : 'Paid'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Time filters segment */}
          <View style={[styles.segmentContainer, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            {(['all', 'today', 'month'] as const).map(time => (
              <TouchableOpacity
                key={time}
                onPress={() => setTimeFilter(time)}
                style={[
                  styles.segmentButton,
                  timeFilter === time && {
                    backgroundColor: colors.surfaceSolid,
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.1,
                    shadowRadius: 2,
                    elevation: 1,
                  }
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { 
                      color: timeFilter === time ? colors.tint : colors.tabIconDefault,
                      fontWeight: timeFilter === time ? '700' : '500' 
                    }
                  ]}
                >
                  {time === 'all' ? 'All Time' : time === 'today' ? 'Today' : 'Month'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Totals Summary Panel */}
        <GlassView style={styles.summaryCard} intensity={Platform.OS === 'ios' ? 25 : 0}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: colors.tabIconDefault }]}>Sales</Text>
              <Text style={[styles.summaryValue, { color: colors.danger }]}>{formatCurrency(summary.sales)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: colors.tabIconDefault }]}>Payments</Text>
              <Text style={[styles.summaryValue, { color: colors.success }]}>{formatCurrency(summary.paid)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryCol}>
              <Text style={[styles.summaryLabel, { color: colors.tabIconDefault }]}>Discount</Text>
              <Text style={[styles.summaryValue, { color: colors.accent }]}>{formatCurrency(summary.discount)}</Text>
            </View>
          </View>
          <View style={[styles.netRow, { borderTopColor: colors.border }]}>
            <Text style={[styles.netLabel, { color: colors.text }]}>Net Balance:</Text>
            <Text style={[styles.netValue, { color: summary.balance >= 0 ? colors.danger : colors.success }]}>
              {formatCurrency(summary.balance)}
            </Text>
          </View>
        </GlassView>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.horizontalScroll}>
        <View style={styles.tableContainer}>
          {/* Table Header Row */}
          <View style={[styles.tableHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.headerCell, { color: colors.tabIconDefault, width: 90 }]}>DATE</Text>
            <Text style={[styles.headerCell, { color: colors.tabIconDefault, width: 115 }]}>CUSTOMER</Text>
            <Text style={[styles.headerCell, styles.headerCellRight, { color: colors.tabIconDefault, width: 85 }]}>SALE</Text>
            <Text style={[styles.headerCell, styles.headerCellRight, { color: colors.tabIconDefault, width: 85 }]}>PAID</Text>
            <Text style={[styles.headerCell, styles.headerCellRight, { color: colors.tabIconDefault, width: 80 }]}>DISCOUNT</Text>
            <Text style={[styles.headerCell, styles.headerCellRight, { color: colors.tabIconDefault, width: 100 }]}>FINAL VALUE</Text>
          </View>

          <FlashList
            data={combinedTransactions}
            renderItem={({ item }) => <LedgerRow item={item} />}
            keyExtractor={item => item.id}
            estimatedItemSize={50}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <SymbolView
                  name={{ ios: 'doc.plaintext', android: 'receipt', web: 'receipt' }}
                  tintColor={colors.tabIconDefault}
                  size={44}
                />
                <Text style={[styles.emptyText, { color: colors.tabIconDefault }]}>
                  No matching ledger entries found.
                </Text>
              </View>
            }
          />
        </View>
      </ScrollView>

      {/* Customer Selector Modal */}
      <Modal
        visible={customerModalVisible}
        animationType="slide"
        onRequestClose={() => setCustomerModalVisible(false)}
        transparent
      >
        <View style={styles.modalOverlay}>
          <GlassView style={styles.modalContent} intensity={Platform.OS === 'ios' ? 40 : 0} borderRadius={28}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Customer</Text>
              <TouchableOpacity onPress={() => setCustomerModalVisible(false)} style={styles.closeBtn}>
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
                  tintColor={colors.text}
                  size={20}
                />
              </TouchableOpacity>
            </View>

            <TextInput
              style={[styles.searchInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="Search customers..."
              placeholderTextColor={colors.tabIconDefault}
              value={customerSearch}
              onChangeText={setCustomerSearch}
              autoCapitalize="words"
            />

            <FlashList
              data={customerList}
              estimatedItemSize={56}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={[styles.modalItem, { borderBottomColor: colors.border }]}
                  onPress={() => {
                    setSelectedCustomer(item);
                    setCustomerModalVisible(false);
                    setCustomerSearch('');
                  }}
                >
                  <Text style={[styles.modalItemName, { color: colors.text }]}>{item.name}</Text>
                  {item.phone && (
                    <Text style={[styles.modalItemPhone, { color: colors.tabIconDefault }]}>{item.phone}</Text>
                  )}
                </TouchableOpacity>
              )}
            />
          </GlassView>
        </View>
      </Modal>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  headerContainer: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 12,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
  },
  shortcuts: {
    flexDirection: 'row',
  },
  shortcutButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 8,
  },
  shortcutText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  filtersWrapper: {
    marginBottom: 10,
  },
  customerPickerButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  customerPickerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  customerPickerLabel: {
    fontSize: 13,
    marginLeft: 8,
    fontWeight: '600',
  },
  clearBtn: {
    padding: 2,
  },
  segmentContainer: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 14,
    padding: 3,
    marginBottom: 6,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
  },
  segmentText: {
    fontSize: 11,
  },
  summaryCard: {
    padding: 12,
    marginTop: 4,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    marginBottom: 8,
  },
  summaryCol: {
    alignItems: 'center',
  },
  summaryLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginTop: 2,
  },
  summaryDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(148, 163, 184, 0.2)',
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    paddingTop: 8,
    marginTop: 4,
  },
  netLabel: {
    fontSize: 12,
    fontWeight: '700',
  },
  netValue: {
    fontSize: 15,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  listContent: {
    paddingBottom: 110, // clear floating dock
  },
  horizontalScroll: {
    flex: 1,
  },
  tableContainer: {
    width: 590,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1.5,
  },
  headerCell: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  headerCellRight: {
    textAlign: 'right',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
  },
  cell: {
    fontSize: 13,
    fontWeight: '500',
  },
  dateCell: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  customerCell: {
    fontWeight: '700',
  },
  amountCell: {
    textAlign: 'right',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  finalValueCell: {
    fontWeight: '800',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
    textAlign: 'center',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    height: '75%',
    width: '100%',
    padding: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  searchInput: {
    height: 42,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    marginBottom: 16,
    fontSize: 14,
  },
  modalItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalItemPhone: {
    fontSize: 12,
    marginTop: 2,
  },
});
