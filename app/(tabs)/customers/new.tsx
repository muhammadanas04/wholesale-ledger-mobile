import React, { useState } from 'react';
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import * as Crypto from 'expo-crypto';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import { sanitizePhone } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';

export default function NewCustomerScreen() {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    // 1. Validations
    if (!name.trim()) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please enter the customer name.',
      });
      return;
    }

    const sanitizedPhone = sanitizePhone(phone);
    if (!sanitizedPhone) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please enter a phone number.',
      });
      return;
    }

    if (sanitizedPhone.length !== 10) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Phone number must be exactly 10 digits.',
      });
      return;
    }

    setSaving(true);
    try {
      const customerId = Crypto.randomUUID();
      const timestamp = new Date().toISOString();

      // Write to WatermelonDB in a write transaction
      await database.write(async () => {
        await database.collections.get<Customer>('customers').create((customer) => {
          customer._raw.id = customerId;
          customer.name = name.trim();
          customer.phone = sanitizedPhone;
          customer.address = address.trim() || undefined;
          customer.balance = 0; // Starts with zero balance
          customer.createdAt = timestamp;
          customer.updatedAt = timestamp;
          customer.synced = 0; // Unsynced local change
        });
      });

      Toast.show({
        type: 'success',
        text1: 'Customer Created',
        text2: `${name.trim()} added successfully!`,
      });

      // Trigger background synchronization loop
      runSync(database).catch((err) => {
        console.error('Post-creation sync run failed:', err);
      });

      // Navigate back
      router.back();
    } catch (e: any) {
      console.error('Failed to create customer:', e);
      Toast.show({
        type: 'error',
        text1: 'Error',
        text2: e.message || 'Failed to save customer.',
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
      <ScrollView className="flex-1 px-6 py-6" keyboardShouldPersistTaps="handled">
        {/* Form Container */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-6 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-6">
          <Text className="text-slate-800 dark:text-slate-100 font-bold text-lg mb-6">
            Customer Details
          </Text>

          {/* Name Field */}
          <View className="mb-5">
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Full Name *
            </Text>
            <TextInput
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm"
              placeholder="Enter customer's full name"
              placeholderTextColor="#94A3B8"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

          {/* Phone Field */}
          <View className="mb-5">
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Phone Number *
            </Text>
            <TextInput
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm font-mono"
              placeholder="e.g. 9876543210"
              placeholderTextColor="#94A3B8"
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              maxLength={15} // Allow spaces/hyphens during entry
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text className="text-slate-400 dark:text-slate-500 text-[10px] mt-1.5">
              Spaces, hyphens, and formatting will be automatically cleaned.
            </Text>
          </View>

          {/* Address Field */}
          <View className="mb-2">
            <Text className="text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">
              Delivery/Billing Address
            </Text>
            <TextInput
              className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm min-h-[80px]"
              placeholder="Enter customer address (optional)"
              placeholderTextColor="#94A3B8"
              value={address}
              onChangeText={setAddress}
              multiline
              autoCapitalize="sentences"
            />
          </View>
        </View>

        {/* Action Button - bottom 60% comfort zone */}
        <TouchableOpacity
          className="w-full bg-indigo-600 dark:bg-indigo-500 py-4 rounded-xl flex-row justify-center items-center active:scale-[0.98] shadow-md shadow-indigo-600/20 mb-12"
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-base">Save Customer</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
