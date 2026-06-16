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
  StyleSheet,
} from 'react-native';
import { router } from 'expo-router';
import Toast from 'react-native-toast-message';
import * as Crypto from 'expo-crypto';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import { sanitizePhone } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';

export default function NewCustomerScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
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

      await database.write(async () => {
        await database.collections.get<Customer>('customers').create((customer) => {
          customer._raw.id = customerId;
          customer.name = name.trim();
          customer.phone = sanitizedPhone;
          customer.address = address.trim() || undefined;
          customer.balance = 0;
          customer.createdAt = timestamp;
          customer.updatedAt = timestamp;
          customer.synced = 0;
        });
      });

      Toast.show({
        type: 'success',
        text1: 'Customer Created',
        text2: `${name.trim()} added successfully!`,
      });

      runSync(database).catch((err) => {
        console.error('Post-creation sync run failed:', err);
      });

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
    <ScreenBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView 
          contentContainerStyle={[styles.scrollContent, { paddingTop: 16 }]} 
          style={styles.scrollView}
          keyboardShouldPersistTaps="handled"
        >
          {/* Form Container */}
          <GlassView style={styles.card}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>
              Customer Details
            </Text>

            {/* Name Field */}
            <View style={styles.inputField}>
              <Text style={[styles.inputLabel, { color: colors.tabIconDefault }]}>
                Full Name *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Enter customer's full name"
                placeholderTextColor={colors.tabIconDefault}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>

            {/* Phone Field */}
            <View style={styles.inputField}>
              <Text style={[styles.inputLabel, { color: colors.tabIconDefault }]}>
                Phone Number *
              </Text>
              <TextInput
                style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="e.g. 9876543210"
                placeholderTextColor={colors.tabIconDefault}
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                maxLength={15}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Text style={[styles.hintText, { color: colors.tabIconDefault }]}>
                Spaces, hyphens, and formatting will be automatically cleaned.
              </Text>
            </View>

            {/* Address Field */}
            <View style={[styles.inputField, { marginBottom: 0 }]}>
              <Text style={[styles.inputLabel, { color: colors.tabIconDefault }]}>
                Delivery/Billing Address
              </Text>
              <TextInput
                style={[styles.notesInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                placeholder="Enter customer address (optional)"
                placeholderTextColor={colors.tabIconDefault}
                value={address}
                onChangeText={setAddress}
                multiline
                autoCapitalize="sentences"
              />
            </View>
          </GlassView>

          {/* Action Button */}
          <TouchableOpacity
            style={[styles.saveBtn, { backgroundColor: colors.tint }]}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Text style={styles.saveBtnText}>Save Customer</Text>
            )}
          </TouchableOpacity>
        </ScrollView>
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
    paddingBottom: 40,
  },
  card: {
    padding: 20,
    marginBottom: 20,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    marginBottom: 20,
  },
  inputField: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  notesInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  hintText: {
    fontSize: 8,
    marginTop: 4,
    fontWeight: '600',
  },
  saveBtn: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
});
