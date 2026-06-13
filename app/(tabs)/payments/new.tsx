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
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Toast from 'react-native-toast-message';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import Payment from '../../../db/models/Payment';
import { useQuery } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';

export default function RecordPaymentScreen() {
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();

  // Main Form States
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [amountStr, setAmountStr] = useState('');
  const [discountStr, setDiscountStr] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

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

    // Validate Date format & calendar validity
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

    // Amount validation (> 0)
    if (amountPaise <= 0) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Amount must be greater than zero.',
      });
      return;
    }

    // Discount validation (>= 0)
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

      // Write atomically in a single database transaction block
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
          cust.synced = 0; // Mark customer unsynced to push updated balance
        });
      });

      Toast.show({
        type: 'success',
        text1: 'Payment Recorded',
        text2: `Successfully logged payment of ${formatCurrency(amountPaise)} for ${selectedCustomer.name}.`,
      });

      // Trigger background sync push
      runSync(database).catch((err) => {
        console.error('Post-payment creation sync failed:', err);
      });

      router.back();
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className="flex-1 bg-slate-50 dark:bg-slate-900"
    >
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} className="flex-1 px-5 py-6">
        
        {/* Customer Selection Block */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5">
          <Text className="text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px] font-bold mb-2">
            Selected Client *
          </Text>

          {selectedCustomer ? (
            <View className="flex-row justify-between items-center mt-1">
              <View className="flex-1 pr-4">
                <Text className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {selectedCustomer.name}
                </Text>
                {selectedCustomer.phone ? (
                  <Text className="text-slate-400 dark:text-slate-500 text-xs mt-0.5 font-mono">
                    {selectedCustomer.phone}
                  </Text>
                ) : null}
              </View>

              {!customerId && (
                <TouchableOpacity
                  onPress={() => setCustomerModalVisible(true)}
                  className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg active:scale-95"
                >
                  <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                    Change
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setCustomerModalVisible(true)}
              className="border-2 border-dashed border-slate-200 dark:border-slate-800 py-6 rounded-xl justify-center items-center flex-row active:scale-[0.98]"
            >
              <SymbolView
                name={{ ios: 'person.fill.badge.plus', android: 'person_add', web: 'person_add' }}
                tintColor="#4F46E5"
                size={20}
              />
              <Text className="text-indigo-600 dark:text-indigo-400 font-bold text-sm ml-2">
                Choose Customer
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Date Field */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5 flex-row items-center justify-between">
          <Text className="text-slate-800 dark:text-slate-100 font-bold text-sm">
            Payment Date
          </Text>
          <TextInput
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-50 text-sm font-mono w-36 text-center"
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94A3B8"
            value={paymentDate}
            onChangeText={setPaymentDate}
            autoCorrect={false}
            maxLength={10}
          />
        </View>

        {/* Amount & Discount Card */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5">
          {/* Amount Paid */}
          <View className="mb-4">
            <Text className="text-slate-850 dark:text-slate-100 font-bold text-sm mb-2">
              Amount Paid (₹) *
            </Text>
            <TextInput
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm font-mono"
              placeholder="Enter amount paid"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              value={amountStr}
              onChangeText={setAmountStr}
              autoCorrect={false}
            />
          </View>

          {/* Cash Discount */}
          <View>
            <Text className="text-slate-855 dark:text-slate-100 font-bold text-sm mb-2">
              Cash Discount (₹) [Optional]
            </Text>
            <TextInput
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm font-mono"
              placeholder="Enter discount amount"
              placeholderTextColor="#94A3B8"
              keyboardType="decimal-pad"
              value={discountStr}
              onChangeText={setDiscountStr}
              autoCorrect={false}
            />
          </View>
        </View>

        {/* Notes Input Field */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-4">
          <Text className="text-slate-800 dark:text-slate-100 font-bold text-sm mb-2">
            Payment Notes
          </Text>
          <TextInput
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm min-h-[60px]"
            placeholder="Add payment/discount details..."
            placeholderTextColor="#94A3B8"
            value={notes}
            onChangeText={setNotes}
            multiline
            autoCapitalize="sentences"
          />
        </View>
      </ScrollView>

      {/* Sticky Bottom Actions Area */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-800/95 border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex-row justify-between items-center backdrop-blur-md"
        style={{ paddingBottom: Platform.OS === 'ios' ? 24 : 16 }}
      >
        <View>
          <Text className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">
            Ledger Reduction
          </Text>
          <Text className="text-xl font-mono font-bold text-slate-800 dark:text-slate-50">
            {formatCurrency(totalReductionPaise)}
          </Text>
        </View>

        <TouchableOpacity
          className={`px-8 py-3.5 rounded-xl justify-center items-center active:scale-[0.98] ${
            !selectedCustomer || amountPaise <= 0 || saving
              ? 'bg-slate-300 dark:bg-slate-700'
              : 'bg-indigo-600 dark:bg-indigo-500 shadow-sm shadow-indigo-600/20'
          }`}
          onPress={handleSavePayment}
          disabled={!selectedCustomer || amountPaise <= 0 || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-sm">Save Payment</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ----------------- CUSTOMER SEARCH MODAL ----------------- */}
      <Modal visible={customerModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
          <View className="flex-row justify-between items-center px-5 py-4 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800/50">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">Choose Client</Text>
            <TouchableOpacity onPress={() => { setCustomerModalVisible(false); setCustomerSearch(''); }} className="p-1">
              <SymbolView
                name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
                tintColor="#94A3B8"
                size={22}
              />
            </TouchableOpacity>
          </View>

          <View className="px-5 py-3 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800/40">
            <View className="flex-row items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2">
              <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor="#94A3B8" size={16} />
              <TextInput
                className="flex-1 ml-2.5 text-slate-900 dark:text-slate-50 text-sm py-1.5"
                placeholder="Search name or phone number..."
                placeholderTextColor="#94A3B8"
                value={customerSearch}
                onChangeText={setCustomerSearch}
                autoCorrect={false}
              />
            </View>
          </View>

          <ScrollView className="flex-1">
            {customers.length === 0 ? (
              <View className="py-20 items-center justify-center">
                <Text className="text-slate-400 dark:text-slate-500 text-sm">No customers found.</Text>
              </View>
            ) : (
              customers.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => {
                    setSelectedCustomer(c);
                    setCustomerModalVisible(false);
                    setCustomerSearch('');
                  }}
                  className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/30 bg-white dark:bg-slate-800 flex-row justify-between items-center active:bg-slate-50 dark:active:bg-slate-700/20"
                >
                  <View className="flex-1 pr-4">
                    <Text className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.name}</Text>
                    {c.phone ? (
                      <Text className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{c.phone}</Text>
                    ) : null}
                  </View>
                  <Text className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                    Bal: {formatCurrency(c.balance)}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

    </KeyboardAvoidingView>
  );
}
