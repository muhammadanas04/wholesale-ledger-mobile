import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Crypto from 'expo-crypto';
import Toast from 'react-native-toast-message';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { GlassView } from '@/components/GlassView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppStore } from '@/store/app';
import { database } from '@/db';
import Customer from '@/db/models/Customer';
import TmpRecord from '@/db/models/TmpRecord';
import { runSync } from '@/lib/sync';
import { Q } from '@nozbe/watermelondb';

interface AddTmpRecordModalProps {
  visible: boolean;
  onClose: () => void;
  editRecord?: TmpRecord | null;
}

export default function AddTmpRecordModal({
  visible,
  onClose,
  editRecord = null,
}: AddTmpRecordModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const { setTabBarHidden } = useAppStore();

  const [type, setType] = useState<'sale' | 'payment' | 'other'>('sale');
  
  // Customer suggestions
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [customerPhone, setCustomerPhone] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Customer[]>([]);

  // Form inputs (stored as string values to prevent formatting issues)
  const [qty, setQty] = useState('');
  const [weight, setWeight] = useState('');
  const [discount, setDiscount] = useState('');
  const [totalValue, setTotalValue] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  
  const [saving, setSaving] = useState(false);

  // Initialize form fields when modal opens / editRecord changes
  useEffect(() => {
    if (visible) {
      if (editRecord) {
        setType(editRecord.type as 'sale' | 'payment' | 'other');
        setCustomerName(editRecord.customerName || '');
        setCustomerId(editRecord.customerId || null);
        setCustomerPhone(editRecord.customerPhone || null);
        setQty(editRecord.qty ? String(editRecord.qty) : '');
        setWeight(editRecord.weight ? String(editRecord.weight) : '');
        setDiscount(editRecord.discount ? String(editRecord.discount / 100) : '');
        setTotalValue(editRecord.totalValue ? String(editRecord.totalValue / 100) : '');
        setAmount(editRecord.amount ? String(editRecord.amount / 100) : '');
        setReason(editRecord.reason || '');
      } else {
        // Reset form
        setType('sale');
        setCustomerName('');
        setCustomerId(null);
        setCustomerPhone(null);
        setQty('');
        setWeight('');
        setDiscount('');
        setTotalValue('');
        setAmount('');
        setReason('');
      }
      setSuggestions([]);
    }
  }, [visible, editRecord]);

  // Manage tab bar visibility
  useEffect(() => {
    setTabBarHidden(visible);
    return () => {
      setTabBarHidden(false);
    };
  }, [visible, setTabBarHidden]);

  // Handle autocomplete query
  const handleCustomerNameChange = async (text: string) => {
    setCustomerName(text);
    // If user typed away from suggestion, reset FK/phone
    setCustomerId(null);
    setCustomerPhone(null);

    if (!text.trim()) {
      setSuggestions([]);
      return;
    }

    try {
      const results = await database.collections
        .get<Customer>('customers')
        .query(Q.where('name', Q.like(`%${Q.sanitizeLikeString(text)}%`)))
        .fetch();
      setSuggestions(results.slice(0, 5));
    } catch (e) {
      console.error('Failed to query customer autocomplete:', e);
    }
  };

  const handleSelectCustomer = (customer: Customer) => {
    setCustomerName(customer.name);
    setCustomerId(customer.id);
    setCustomerPhone(customer.phone || null);
    setSuggestions([]);
  };

  // Switch pill tabs and clear corresponding fields
  const handleTypeChange = (newType: 'sale' | 'payment' | 'other') => {
    setType(newType);
    setQty('');
    setWeight('');
    setDiscount('');
    setTotalValue('');
    setAmount('');
    setReason('');
    setSuggestions([]);
  };

  // Calculated rate
  const computedRate = useMemo(() => {
    const wVal = parseFloat(weight);
    const tVal = parseFloat(totalValue);
    if (!isNaN(wVal) && wVal > 0 && !isNaN(tVal) && tVal > 0) {
      return (tVal / wVal).toFixed(2);
    }
    return null;
  }, [weight, totalValue]);

  const handleSave = async () => {
    // 1. Validate
    if (type !== 'other' && !customerName.trim()) {
      Toast.show({ type: 'error', text1: 'Customer name is required' });
      return;
    }
    if (type === 'other' && (!amount || parseFloat(amount) <= 0)) {
      Toast.show({ type: 'error', text1: 'Expense amount is required' });
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const dateStr = editRecord ? editRecord.date : now.slice(0, 10); // YYYY-MM-DD

      // Parse values
      const discountVal = parseFloat(discount);
      const discountPaise = isNaN(discountVal) ? 0 : Math.round(discountVal * 100);

      const totalVal = parseFloat(totalValue);
      const totalValuePaise = isNaN(totalVal) ? 0 : Math.round(totalVal * 100);

      const amountVal = parseFloat(amount);
      const amountPaise = isNaN(amountVal) ? 0 : Math.round(amountVal * 100);

      const qtyVal = parseFloat(qty);
      const weightVal = parseFloat(weight);

      const parsedRate = computedRate ? Math.round(parseFloat(computedRate) * 100) : null;

      await database.write(async () => {
        if (editRecord) {
          // Update Record
          await editRecord.update((r) => {
            r.type = type;
            r.customerId = customerId || undefined;
            r.customerName = customerName.trim() || undefined;
            r.customerPhone = customerPhone || undefined;
            r.qty = isNaN(qtyVal) ? undefined : qtyVal;
            r.weight = isNaN(weightVal) ? undefined : weightVal;
            r.rate = parsedRate || undefined;
            r.discount = discountPaise;
            r.totalValue = totalValuePaise || undefined;
            r.amount = amountPaise || undefined;
            r.reason = reason.trim() || undefined;
            r.updatedAt = now;
            r.synced = 0;
          });
        } else {
          // Create Record
          await database.collections.get<TmpRecord>('tmp_records').create((r) => {
            r._raw.id = Crypto.randomUUID();
            r.type = type;
            r.customerId = customerId || undefined;
            r.customerName = customerName.trim() || undefined;
            r.customerPhone = customerPhone || undefined;
            r.qty = isNaN(qtyVal) ? undefined : qtyVal;
            r.weight = isNaN(weightVal) ? undefined : weightVal;
            r.rate = parsedRate || undefined;
            r.discount = discountPaise;
            r.totalValue = totalValuePaise || undefined;
            r.amount = amountPaise || undefined;
            r.reason = reason.trim() || undefined;
            r.date = dateStr;
            r.createdAt = now;
            r.updatedAt = now;
            r.synced = 0;
          });
        }
      });

      // Close modal
      onClose();

      Toast.show({
        type: 'success',
        text1: editRecord ? 'Record Updated' : 'Record Saved',
        text2: editRecord ? 'Temporary record details updated.' : 'Temporary record saved successfully.',
      });

      // Run sync in background
      runSync(database).catch(() => {});
    } catch (e: any) {
      console.error('Failed to save temporary record:', e);
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: e.message || 'Error occurred while saving.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <Pressable style={styles.modalOverlay} onPress={() => setSuggestions([])}>
          <Pressable style={{ width: '100%' }} onPress={(e) => e.stopPropagation()}>
            <View style={[
              styles.modalContent,
              {
                backgroundColor: colors.background,
                borderColor: colors.border,
                paddingBottom: Math.max(insets.bottom, 24),
              }
            ]}>
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: colors.border }]}>
              <TouchableOpacity onPress={onClose} style={styles.headerBtn}>
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
                  tintColor={colors.tabIconDefault}
                  size={22}
                />
              </TouchableOpacity>
              <Text style={[styles.headerTitle, { color: colors.text }]}>
                {editRecord ? 'Edit Record' : 'Add Record'}
              </Text>
              <View style={styles.headerBtnPlaceholder} />
            </View>

            <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              {/* Type Switcher Pills */}
              <View style={[styles.typeContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                {(['sale', 'payment', 'other'] as const).map((t) => {
                  const isActive = type === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      onPress={() => handleTypeChange(t)}
                      style={[
                        styles.typePill,
                        isActive && {
                          backgroundColor: colors.tint,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.typeText,
                          {
                            color: isActive ? '#FFFFFF' : colors.tabIconDefault,
                            fontWeight: isActive ? '700' : '600',
                          },
                        ]}
                      >
                        {t.toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Customer Autocomplete Section */}
              {type !== 'other' && (
                <View style={styles.fieldWrapper}>
                  <Text style={[styles.fieldLabel, { color: colors.tabIconDefault }]}>
                    Customer Name *
                  </Text>
                  <TextInput
                    style={[
                      styles.input,
                      { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                    ]}
                    value={customerName}
                    onChangeText={handleCustomerNameChange}
                    placeholder="Enter customer name..."
                    placeholderTextColor={colors.tabIconDefault}
                    autoCorrect={false}
                  />
                  {/* Suggestions List Overlay */}
                  {suggestions.length > 0 && (
                    <View
                      style={[
                        styles.suggestionsList,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      {suggestions.map((item) => (
                        <TouchableOpacity
                          key={item.id}
                          onPress={() => handleSelectCustomer(item)}
                          style={[styles.suggestionItem, { borderBottomColor: colors.border }]}
                        >
                          <Text style={[styles.suggestionText, { color: colors.text }]}>
                            {item.name}
                          </Text>
                          {item.phone && (
                            <Text style={[styles.suggestionPhone, { color: colors.tabIconDefault }]}>
                              {item.phone}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              )}

              {/* Sale Fields */}
              {type === 'sale' && (
                <>
                  {/* Side-by-side inputs (Qty & Weight) */}
                  <View style={styles.row}>
                    <View style={[styles.fieldWrapper, { flex: 1, marginRight: 8 }]}>
                      <Text style={[styles.fieldLabel, { color: colors.tabIconDefault }]}>Qty</Text>
                      <TextInput
                        style={[
                          styles.input,
                          { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                        ]}
                        keyboardType="numeric"
                        value={qty}
                        onChangeText={setQty}
                        placeholder="0"
                        placeholderTextColor={colors.tabIconDefault}
                      />
                    </View>
                    <View style={[styles.fieldWrapper, { flex: 1, marginLeft: 8 }]}>
                      <Text style={[styles.fieldLabel, { color: colors.tabIconDefault }]}>Weight (kg)</Text>
                      <TextInput
                        style={[
                          styles.input,
                          { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                        ]}
                        keyboardType="decimal-pad"
                        value={weight}
                        onChangeText={setWeight}
                        placeholder="0.0"
                        placeholderTextColor={colors.tabIconDefault}
                      />
                    </View>
                  </View>

                  {/* Calculated rate display */}
                  <View style={styles.fieldWrapper}>
                    <Text style={[styles.fieldLabel, { color: colors.tabIconDefault }]}>Rate (₹/kg)</Text>
                    <View
                      style={[
                        styles.input,
                        styles.disabledInput,
                        { backgroundColor: colors.surface, borderColor: colors.border },
                      ]}
                    >
                      <Text style={{ color: computedRate ? colors.text : colors.tabIconDefault, fontWeight: '600' }}>
                        {computedRate ? `₹${computedRate}/kg (Auto-calculated)` : '—'}
                      </Text>
                    </View>
                  </View>
                </>
              )}

              {/* Common Sale / Payment Fields */}
              {type !== 'other' && (
                <View style={styles.row}>
                  <View style={[styles.fieldWrapper, { flex: 1, marginRight: 8 }]}>
                    <Text style={[styles.fieldLabel, { color: colors.tabIconDefault }]}>Discount (₹)</Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                      ]}
                      keyboardType="decimal-pad"
                      value={discount}
                      onChangeText={setDiscount}
                      placeholder="0.0"
                      placeholderTextColor={colors.tabIconDefault}
                    />
                  </View>
                  <View style={[styles.fieldWrapper, { flex: 1, marginLeft: 8 }]}>
                    <Text style={[styles.fieldLabel, { color: colors.tabIconDefault }]}>Total Value (₹)</Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                      ]}
                      keyboardType="decimal-pad"
                      value={totalValue}
                      onChangeText={setTotalValue}
                      placeholder="0.0"
                      placeholderTextColor={colors.tabIconDefault}
                    />
                  </View>
                </View>
              )}

              {/* Other Expense Fields */}
              {type === 'other' && (
                <>
                  <View style={styles.fieldWrapper}>
                    <Text style={[styles.fieldLabel, { color: colors.tabIconDefault }]}>Amount (₹) *</Text>
                    <TextInput
                      style={[
                        styles.input,
                        { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                      ]}
                      keyboardType="decimal-pad"
                      value={amount}
                      onChangeText={setAmount}
                      placeholder="0.0"
                      placeholderTextColor={colors.tabIconDefault}
                    />
                  </View>

                  <View style={styles.fieldWrapper}>
                    <Text style={[styles.fieldLabel, { color: colors.tabIconDefault }]}>Reason</Text>
                    <TextInput
                      style={[
                        styles.notesInput,
                        { backgroundColor: colors.surface, color: colors.text, borderColor: colors.border },
                      ]}
                      value={reason}
                      onChangeText={setReason}
                      placeholder="Truck fuel, tea, etc..."
                      placeholderTextColor={colors.tabIconDefault}
                      multiline
                      numberOfLines={3}
                    />
                  </View>
                </>
              )}

              {/* Save Button */}
              <TouchableOpacity
                style={[
                  styles.saveButton,
                  { backgroundColor: colors.tint },
                  saving && { opacity: 0.8 },
                ]}
                onPress={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.saveButtonText}>
                    {editRecord ? 'Update Record' : 'Save Record'}
                  </Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </Pressable>
      </Pressable>
    </KeyboardAvoidingView>
  </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  keyboardContainer: {
    width: '100%',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderBottomWidth: 0,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  headerBtn: {
    padding: 4,
  },
  headerBtnPlaceholder: {
    width: 30,
  },
  formContent: {
    padding: 20,
    paddingBottom: 40,
  },
  typeContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
    marginBottom: 20,
  },
  typePill: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  typeText: {
    fontSize: 11,
    letterSpacing: 0.5,
  },
  fieldWrapper: {
    marginBottom: 16,
    position: 'relative',
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 14,
    justifyContent: 'center',
  },
  disabledInput: {
    opacity: 0.8,
  },
  notesInput: {
    minHeight: 80,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  row: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  suggestionsList: {
    position: 'absolute',
    top: 72,
    left: 0,
    right: 0,
    zIndex: 2000,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    maxHeight: 200,
    overflow: 'scroll',
  },
  suggestionItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  suggestionPhone: {
    fontSize: 11,
  },
  saveButton: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
