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
  Pressable,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Toast from 'react-native-toast-message';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import Product from '../../../db/models/Product';
import Sale from '../../../db/models/Sale';
import SaleItem from '../../../db/models/SaleItem';
import { useQuery } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';

interface LocalLineItem {
  id: string;
  product: Product;
  qtyStr: string;
  priceStr: string;
  weightStr: string;
}

export default function NewSaleScreen() {
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();

  // Main Form States
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [saleDate, setSaleDate] = useState(() => new Date().toISOString().split('T')[0]); // YYYY-MM-DD
  const [lineItems, setLineItems] = useState<LocalLineItem[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Selector Modal Visibility States
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  const [productModalVisible, setProductModalVisible] = useState(false);

  // Modal Search Filter Inputs
  const [customerSearch, setCustomerSearch] = useState('');
  const [productSearch, setProductSearch] = useState('');

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

  // 3. Query products reactively for Product Picker
  const productsQuery = useMemo(() => {
    const clean = Q.sanitizeLikeString(productSearch.trim());
    const clauses: any[] = [];
    if (clean) {
      clauses.push(Q.where('name', Q.like(`%${clean}%`)));
    }
    clauses.push(Q.sortBy('name', Q.asc));
    return database.collections.get<Product>('products').query(...clauses);
  }, [productSearch]);

  const products = useQuery(productsQuery);

  // Live calculation of invoice total (in Rupees)
  const invoiceTotal = useMemo(() => {
    return lineItems.reduce((sum, item) => {
      const qty = parseFloat(item.qtyStr) || 0;
      const price = parseFloat(item.priceStr) || 0;
      return sum + qty * price;
    }, 0);
  }, [lineItems]);

  const handleAddLineItem = (product: Product) => {
    // Add product to state with default blank strings to allow clean keyboard entry
    const newItem: LocalLineItem = {
      id: Crypto.randomUUID(),
      product,
      qtyStr: '1',
      priceStr: '',
      weightStr: '',
    };
    setLineItems((prev) => [...prev, newItem]);
    setProductModalVisible(false);
    setProductSearch('');
  };

  const handleUpdateLineItem = (id: string, field: 'qtyStr' | 'priceStr' | 'weightStr', value: string) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  };

  const handleRemoveLineItem = (id: string) => {
    setLineItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleSaveInvoice = async () => {
    if (!selectedCustomer) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please select a customer first.',
      });
      return;
    }

    if (lineItems.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please add at least one product line item.',
      });
      return;
    }

    // Validate that quantities and prices are populated and valid
    for (let i = 0; i < lineItems.length; i++) {
      const item = lineItems[i];
      const qty = parseFloat(item.qtyStr) || 0;
      const price = parseFloat(item.priceStr) || 0;

      if (qty <= 0) {
        Toast.show({
          type: 'error',
          text1: 'Validation Error',
          text2: `Invalid quantity for ${item.product.name}.`,
        });
        return;
      }

      if (price <= 0) {
        Toast.show({
          type: 'error',
          text1: 'Validation Error',
          text2: `Invalid price for ${item.product.name}.`,
        });
        return;
      }
    }

    setSaving(true);
    try {
      const saleId = Crypto.randomUUID();
      const totalAmountPaise = Math.round(invoiceTotal * 100);
      const timestamp = new Date().toISOString();

      // Write atomically in a single transaction block
      await database.write(async () => {
        // 1. Create Sale Header
        await database.collections.get<Sale>('sales').create((sale) => {
          sale._raw.id = saleId;
          sale.customerId = selectedCustomer.id;
          sale.date = saleDate;
          sale.totalAmount = totalAmountPaise;
          sale.discount = 0;
          sale.notes = notes.trim() || undefined;
          sale.createdAt = timestamp;
          sale.updatedAt = timestamp;
          sale.synced = 0;
        });

        // 2. Create Sale Items
        for (const item of lineItems) {
          const qty = parseFloat(item.qtyStr);
          const priceRupees = parseFloat(item.priceStr);
          const weight = parseFloat(item.weightStr) || undefined;

          await database.collections.get<SaleItem>('sale_items').create((saleItem) => {
            saleItem._raw.id = Crypto.randomUUID();
            saleItem.saleId = saleId;
            saleItem.productId = item.product.id;
            saleItem.qty = qty;
            saleItem.unitPrice = Math.round(priceRupees * 100);
            saleItem.weight = weight;
            saleItem.totalPrice = Math.round(qty * priceRupees * 100);
            saleItem.createdAt = timestamp;
            saleItem.updatedAt = timestamp;
            saleItem.synced = 0;
          });
        }

        // 3. Update Customer Balance
        await selectedCustomer.update((cust) => {
          cust.balance += totalAmountPaise;
          cust.updatedAt = timestamp;
          cust.synced = 0; // Mark customer unsynced to push updated balance
        });
      });

      Toast.show({
        type: 'success',
        text1: 'Sale Saved',
        text2: `Invoice of ${formatCurrency(totalAmountPaise)} saved successfully.`,
      });

      // Trigger background sync push
      runSync(database).catch((err) => {
        console.error('Post-sale creation sync failed:', err);
      });

      router.back();
    } catch (e: any) {
      console.error('Failed to save sale transaction:', e);
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

        {/* Invoice Date Field */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5 flex-row items-center justify-between">
          <Text className="text-slate-800 dark:text-slate-100 font-bold text-sm">
            Invoice Date
          </Text>
          <TextInput
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2.5 text-slate-900 dark:text-slate-50 text-sm font-mono w-32 text-center"
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#94A3B8"
            value={saleDate}
            onChangeText={setSaleDate}
            autoCorrect={false}
            maxLength={10}
          />
        </View>

        {/* Invoice Items Block */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-slate-800 dark:text-slate-100 font-bold text-base">
              Line Items
            </Text>
            <TouchableOpacity
              onPress={() => setProductModalVisible(true)}
              className="bg-indigo-50 dark:bg-indigo-950/40 px-3.5 py-2 rounded-xl flex-row items-center active:scale-95"
            >
              <SymbolView
                name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}
                tintColor="#4F46E5"
                size={16}
              />
              <Text className="text-indigo-600 dark:text-indigo-400 font-bold text-xs ml-1.5">
                Add Item
              </Text>
            </TouchableOpacity>
          </View>

          {/* Added Line Items Editor Row List */}
          {lineItems.length === 0 ? (
            <View className="py-8 items-center justify-center border-t border-slate-100 dark:border-slate-800/30">
              <SymbolView
                name={{ ios: 'cart.badge.plus', android: 'add_shopping_cart', web: 'add_shopping_cart' }}
                tintColor="#CBD5E1"
                size={36}
              />
              <Text className="text-slate-400 dark:text-slate-500 text-xs mt-2 text-center">
                Add products to build the invoice.
              </Text>
            </View>
          ) : (
            <View className="border-t border-slate-100 dark:border-slate-800/30 pt-4">
              {lineItems.map((item) => {
                const subTotal = (parseFloat(item.qtyStr) || 0) * (parseFloat(item.priceStr) || 0);

                return (
                  <View
                    key={item.id}
                    className="border-b border-slate-100 dark:border-slate-800/40 pb-4 mb-4 last:border-b-0 last:pb-0 last:mb-0"
                  >
                    <View className="flex-row justify-between items-start mb-2">
                      <View className="flex-1 pr-3">
                        <Text className="text-sm font-bold text-slate-800 dark:text-slate-100" numberOfLines={1}>
                          {item.product.name}
                        </Text>
                        <Text className="text-[10px] text-slate-400 uppercase font-semibold">
                          Unit: {item.product.unit}
                        </Text>
                      </View>
                      
                      <TouchableOpacity
                        onPress={() => handleRemoveLineItem(item.id)}
                        className="p-1 active:scale-90"
                      >
                        <SymbolView
                          name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }}
                          tintColor="#EF4444"
                          size={18}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Editor Inputs */}
                    <View className="flex-row items-center mt-1">
                      {/* Quantity Input */}
                      <View className="flex-1 mr-2">
                        <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1">Qty</Text>
                        <TextInput
                          className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono text-center"
                          placeholder="0"
                          placeholderTextColor="#94A3B8"
                          keyboardType="decimal-pad"
                          value={item.qtyStr}
                          onChangeText={(val) => handleUpdateLineItem(item.id, 'qtyStr', val)}
                        />
                      </View>

                      {/* Unit Price Input */}
                      <View className="flex-2 mx-2">
                        <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1">Price (₹)</Text>
                        <TextInput
                          className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono text-center"
                          placeholder="Rate"
                          placeholderTextColor="#94A3B8"
                          keyboardType="decimal-pad"
                          value={item.priceStr}
                          onChangeText={(val) => handleUpdateLineItem(item.id, 'priceStr', val)}
                        />
                      </View>

                      {/* Weight (Optional) Input */}
                      <View className="flex-1 mx-2">
                        <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1">Wt (kg)</Text>
                        <TextInput
                          className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2 text-slate-900 dark:text-slate-50 text-sm font-mono text-center"
                          placeholder="Opt"
                          placeholderTextColor="#94A3B8"
                          keyboardType="decimal-pad"
                          value={item.weightStr}
                          onChangeText={(val) => handleUpdateLineItem(item.id, 'weightStr', val)}
                        />
                      </View>

                      {/* Subtotal Display */}
                      <View className="flex-2 items-end justify-center ml-2">
                        <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1">Subtotal</Text>
                        <Text className="text-sm font-mono font-bold text-slate-800 dark:text-slate-200 mt-2">
                          {formatCurrency(Math.round(subTotal * 100))}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Notes Input Field */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-4">
          <Text className="text-slate-800 dark:text-slate-100 font-bold text-sm mb-2">
            Invoice Notes
          </Text>
          <TextInput
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm min-h-[60px]"
            placeholder="Add ledger remarks (optional)..."
            placeholderTextColor="#94A3B8"
            value={notes}
            onChangeText={setNotes}
            multiline
            autoCapitalize="sentences"
          />
        </View>
      </ScrollView>

      {/* Sticky Bottom Actions Comfort Area */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-800/95 border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex-row justify-between items-center backdrop-blur-md"
        style={{ paddingBottom: Platform.OS === 'ios' ? 24 : 16 }}
      >
        <View>
          <Text className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">
            Total Amount
          </Text>
          <Text className="text-xl font-mono font-bold text-slate-800 dark:text-slate-50">
            {formatCurrency(Math.round(invoiceTotal * 100))}
          </Text>
        </View>

        <TouchableOpacity
          className={`px-8 py-3.5 rounded-xl justify-center items-center active:scale-[0.98] ${
            !selectedCustomer || lineItems.length === 0 || saving
              ? 'bg-slate-300 dark:bg-slate-700'
              : 'bg-indigo-600 dark:bg-indigo-500 shadow-sm shadow-indigo-600/20'
          }`}
          onPress={handleSaveInvoice}
          disabled={!selectedCustomer || lineItems.length === 0 || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-sm">Save Invoice</Text>
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

      {/* ----------------- PRODUCT SEARCH MODAL ----------------- */}
      <Modal visible={productModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
          <View className="flex-row justify-between items-center px-5 py-4 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800/50">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">Select Product</Text>
            <TouchableOpacity onPress={() => { setProductModalVisible(false); setProductSearch(''); }} className="p-1">
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
                placeholder="Search products by name..."
                placeholderTextColor="#94A3B8"
                value={productSearch}
                onChangeText={setProductSearch}
                autoCorrect={false}
              />
            </View>
          </View>

          <ScrollView className="flex-1">
            {products.length === 0 ? (
              <View className="py-20 items-center justify-center px-6">
                <Text className="text-slate-400 dark:text-slate-500 text-sm text-center">
                  No products matched. Pull sync settings to reload products inventory database.
                </Text>
              </View>
            ) : (
              products.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => handleAddLineItem(p)}
                  className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/30 bg-white dark:bg-slate-800 flex-row justify-between items-center active:bg-slate-50 dark:active:bg-slate-700/20"
                >
                  <View className="flex-1 pr-4">
                    <Text className="text-sm font-bold text-slate-800 dark:text-slate-100">{p.name}</Text>
                    <Text className="text-[10px] text-slate-400 uppercase font-semibold mt-0.5">Unit: {p.unit}</Text>
                  </View>
                  <Text className="text-xs font-mono font-bold text-slate-500 dark:text-slate-400">
                    Stock: {p.currentStock} {p.unit}
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
