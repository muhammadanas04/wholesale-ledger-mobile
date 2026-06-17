import React, { useState, useEffect, useMemo } from 'react';
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Modal,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  FlatList,
  StyleSheet,
  BackHandler,
} from 'react-native';
import { useLocalSearchParams, router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Toast from 'react-native-toast-message';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import Payment from '../../../db/models/Payment';
import { useQuery } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';
import { DatePickerModal } from '../../../components/DatePickerModal';

export default function RecordPaymentScreen() {
  const { customerId, referrer } = useLocalSearchParams<{ customerId?: string; referrer?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  // Main Form States
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [amountStr, setAmountStr] = useState('');
  const [discountStr, setDiscountStr] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  // Selector Modal Visibility
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');

  // 1. Fetch pre-selected customer if customerId query parameter is provided
  useEffect(() => {
    if (customerId) {
      database.collections
        .get<Customer>('customers')
        .find(customerId)
        .then((record) => {
          setSelectedCustomer(record);
        })
        .catch((err) => {
          console.error('Failed to pre-select customer:', err);
        });
    }
  }, [customerId]);

  const handleNavigationBack = () => {
    if (referrer === 'customer-details' && selectedCustomer) {
      router.push(`/customers/${selectedCustomer.id}?referrer=ledger`);
    } else {
      router.back();
    }
  };

  useEffect(() => {
    if (Platform.OS === 'android') {
      const backAction = () => {
        handleNavigationBack();
        return true;
      };
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        backAction
      );
      return () => backHandler.remove();
    }
  }, [referrer, selectedCustomer]);

  // 2. Query customers reactively for Customer Picker
  const customersQuery = useMemo(() => {
    const clean = Q.sanitizeLikeString(customerSearch.trim());
    const clauses: any[] = [];
    if (clean) {
      clauses.push(
        Q.or(
          Q.where('name', Q.like(`%${clean}%`)),
          Q.where('phone', Q.like(`%${clean}%`))
        )
      );
    }
    clauses.push(Q.sortBy('name', Q.asc));
    return database.collections.get<Customer>('customers').query(...clauses);
  }, [customerSearch]);

  const customers = useQuery(customersQuery);

  // Parse strings to integers in paise
  const amountPaise = useMemo(() => {
    const parsed = parseFloat(amountStr) || 0;
    return Math.round(parsed * 100);
  }, [amountStr]);

  const discountPaise = useMemo(() => {
    const parsed = parseFloat(discountStr) || 0;
    return Math.round(parsed * 100);
  }, [discountStr]);

  const totalReductionPaise = useMemo(() => {
    return amountPaise + discountPaise;
  }, [amountPaise, discountPaise]);

  const handleSavePayment = async () => {
    if (!selectedCustomer) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please select a customer first.',
      });
      return;
    }

    const cleanDate = paymentDate.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Date must be in YYYY-MM-DD format.',
      });
      return;
    }

    const [year, month, day] = cleanDate.split('-').map(Number);
    const parsedDate = new Date(year, month - 1, day);
    if (
      parsedDate.getFullYear() !== year ||
      parsedDate.getMonth() !== month - 1 ||
      parsedDate.getDate() !== day
    ) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please enter a valid calendar date.',
      });
      return;
    }

    if (amountPaise <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Amount must be greater than zero.',
      });
      return;
    }

    if (discountPaise < 0) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Discount cannot be negative.',
      });
      return;
    }

    setSaving(true);
    try {
      const paymentId = Crypto.randomUUID();
      const timestamp = new Date().toISOString();

      await database.write(async () => {
        // 1. Create Payment record
        await database.collections.get<Payment>('payments').create((payment) => {
          payment._raw.id = paymentId;
          payment.customerId = selectedCustomer.id;
          payment.amount = amountPaise;
          payment.discount = discountPaise;
          payment.date = cleanDate;
          payment.notes = notes.trim() || undefined;
          payment.createdAt = timestamp;
          payment.updatedAt = timestamp;
          payment.synced = 0;
        });

        // 2. Subtract paid/discount amount from customer balance
        await selectedCustomer.update((cust) => {
          cust.balance -= totalReductionPaise;
          cust.updatedAt = timestamp;
          cust.synced = 0;
        });
      });

      Toast.show({
        type: 'success',
        text1: 'Payment Recorded',
        text2: `Successfully logged payment of ${formatCurrency(amountPaise)} for ${selectedCustomer.name}.`,
      });

      runSync(database).catch((err) => {
        console.error('Post-payment creation sync failed:', err);
      });

      handleNavigationBack();
    } catch (e: any) {
      console.error('Failed to save payment transaction:', e);
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: e.message || 'Error occurred while saving transaction.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenBackground>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <TouchableOpacity onPress={handleNavigationBack} style={{ marginLeft: 15, padding: 8 }}>
              <SymbolView
                name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }}
                tintColor={colors.tint}
                size={22}
              />
            </TouchableOpacity>
          ),
        }}
      />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scrollView}>
          {/* Customer Selection Block */}
          <GlassView style={styles.card}>
            <Text style={[styles.cardSub, { color: colors.tabIconDefault }]}>
              Selected Client *
            </Text>

            {selectedCustomer ? (
              <View style={styles.customerHeaderRow}>
                <View style={styles.customerTextContainer}>
                  <Text style={[styles.customerName, { color: colors.text }]}>
                    {selectedCustomer.name}
                  </Text>
                  {selectedCustomer.phone && (
                    <Text style={[styles.customerPhone, { color: colors.tabIconDefault }]}>
                      {selectedCustomer.phone}
                    </Text>
                  )}
                </View>

                {!customerId && (
                  <TouchableOpacity
                    onPress={() => setCustomerModalVisible(true)}
                    style={[styles.changeBtn, { borderColor: colors.border }]}
                  >
                    <Text style={[styles.changeBtnText, { color: colors.tint }]}>
                      Change
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setCustomerModalVisible(true)}
                style={[styles.chooseBtn, { borderColor: colors.border }]}
              >
                <SymbolView
                  name={{ ios: 'person.fill.badge.plus', android: 'person_add', web: 'person_add' }}
                  tintColor={colors.tint}
                  size={20}
                />
                <Text style={[styles.chooseBtnText, { color: colors.tint }]}>
                  Choose Customer
                </Text>
              </TouchableOpacity>
            )}
          </GlassView>

          {/* Date Field */}
          <GlassView style={styles.dateCard}>
            <Text style={[styles.dateLabel, { color: colors.text }]}>
              Payment Date
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setDatePickerOpen(true)}
              style={[styles.dateInput, { backgroundColor: colors.background, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' }]}
            >
              <Text style={{ color: colors.text, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', fontSize: 13 }}>
                {paymentDate}
              </Text>
            </TouchableOpacity>
          </GlassView>

          <DatePickerModal
            visible={datePickerOpen}
            value={paymentDate}
            onChange={setPaymentDate}
            onClose={() => setDatePickerOpen(false)}
          />

          {/* Amount & Discount Card */}
          <GlassView style={styles.card}>
            {/* Amount Paid */}
            <View style={styles.inputField}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Amount Paid (₹) *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Enter amount paid"
                placeholderTextColor={colors.tabIconDefault}
                keyboardType="decimal-pad"
                value={amountStr}
                onChangeText={setAmountStr}
                autoCorrect={false}
              />
            </View>

            {/* Cash Discount */}
            <View style={[styles.inputField, { marginBottom: 0 }]}>
              <Text style={[styles.inputLabel, { color: colors.text }]}>
                Cash Discount (₹) [Optional]
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Enter discount amount"
                placeholderTextColor={colors.tabIconDefault}
                keyboardType="decimal-pad"
                value={discountStr}
                onChangeText={setDiscountStr}
                autoCorrect={false}
              />
            </View>
          </GlassView>

          {/* Notes Input Field */}
          <GlassView style={styles.card}>
            <Text style={[styles.notesLabel, { color: colors.text }]}>
              Payment Notes
            </Text>
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="Add payment/discount details..."
              placeholderTextColor={colors.tabIconDefault}
              value={notes}
              onChangeText={setNotes}
              multiline
              autoCapitalize="sentences"
            />
          </GlassView>
        </ScrollView>

        {/* Sticky Bottom Actions Glass Bar */}
        <GlassView
          style={[styles.stickyFooter, { paddingBottom: Platform.OS === 'ios' ? insets.bottom + 8 : 16 }]}
          borderRadius={0}
          borderColor="transparent"
          backgroundColor={colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)'}
        >
          <View style={styles.footerRow}>
            <View>
              <Text style={[styles.footerLabel, { color: colors.tabIconDefault }]}>
                Ledger Reduction
              </Text>
              <Text style={[styles.footerValue, { color: colors.text }]}>
                {formatCurrency(totalReductionPaise)}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!selectedCustomer || amountPaise <= 0 || saving)
                  ? { backgroundColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1' }
                  : { backgroundColor: colors.tint }
              ]}
              onPress={handleSavePayment}
              disabled={!selectedCustomer || amountPaise <= 0 || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Payment</Text>
              )}
            </TouchableOpacity>
          </View>
        </GlassView>

        {/* ----------------- CUSTOMER SEARCH MODAL ----------------- */}
        <Modal 
          visible={customerModalVisible} 
          animationType="slide"
          onRequestClose={() => { setCustomerModalVisible(false); setCustomerSearch(''); }}
        >
          <ScreenBackground>
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Choose Client</Text>
                <TouchableOpacity onPress={() => { setCustomerModalVisible(false); setCustomerSearch(''); }} style={styles.modalCloseBtn}>
                  <SymbolView
                    name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
                    tintColor={colors.tabIconDefault}
                    size={22}
                  />
                </TouchableOpacity>
              </View>

              <View style={styles.modalSearchBox}>
                <View style={[styles.searchBarContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={colors.tabIconDefault} size={16} />
                  <TextInput
                    style={[styles.modalSearchInput, { color: colors.text }]}
                    placeholder="Search name or phone number..."
                    placeholderTextColor={colors.tabIconDefault}
                    value={customerSearch}
                    onChangeText={setCustomerSearch}
                    autoCorrect={false}
                  />
                </View>
              </View>

              <FlatList
                style={styles.modalList}
                data={customers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedCustomer(item);
                      setCustomerModalVisible(false);
                      setCustomerSearch('');
                    }}
                    style={[styles.modalListItem, { borderBottomColor: colors.border }]}
                  >
                    <View style={styles.modalListLeft}>
                      <Text style={[styles.modalItemName, { color: colors.text }]}>{item.name}</Text>
                      {item.phone && (
                        <Text style={[styles.modalItemPhone, { color: colors.tabIconDefault }]}>{item.phone}</Text>
                      )}
                    </View>
                    <Text style={[styles.modalItemBal, { color: colors.tabIconDefault }]}>
                      Bal: {formatCurrency(item.balance)}
                    </Text>
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.modalEmpty}>
                    <Text style={{ color: colors.tabIconDefault }}>No customers found.</Text>
                  </View>
                }
              />
            </SafeAreaView>
          </ScreenBackground>
        </Modal>
      </KeyboardAvoidingView>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 120, // clear sticky footer
  },
  card: {
    padding: 20,
    marginBottom: 16,
  },
  cardSub: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  customerHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  customerTextContainer: {
    flex: 1,
    paddingRight: 16,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '800',
  },
  customerPhone: {
    fontSize: 12,
    marginTop: 2,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  changeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 10,
  },
  changeBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  chooseBtn: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 16,
    paddingVertical: 24,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  chooseBtnText: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 8,
  },
  dateCard: {
    padding: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dateLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  dateInput: {
    height: 38,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    width: 140,
    textAlign: 'center',
  },
  inputField: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  notesInput: {
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  stickyFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.15)',
    paddingHorizontal: 20,
    paddingTop: 12,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  footerLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  footerValue: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginTop: 2,
  },
  saveBtn: {
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  modalSafeArea: {
    flex: 1,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseBtn: {
    padding: 2,
  },
  modalSearchBox: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  modalSearchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    paddingVertical: 6,
  },
  modalList: {
    flex: 1,
    paddingHorizontal: 20,
  },
  modalListItem: {
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalListLeft: {
    flex: 1,
    paddingRight: 16,
  },
  modalItemName: {
    fontSize: 15,
    fontWeight: '700',
  },
  modalItemPhone: {
    fontSize: 11,
    marginTop: 2,
  },
  modalItemBal: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  modalEmpty: {
    paddingVertical: 40,
    alignItems: 'center',
  },
});
