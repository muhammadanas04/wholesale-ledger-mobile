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
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Toast from 'react-native-toast-message';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import Product from '../../../db/models/Product';
import Sale from '../../../db/models/Sale';
import SaleItem from '../../../db/models/SaleItem';
import { useQuery } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';

interface LocalLineItem {
  id: string;
  product: Product;
  qtyStr: string;
  priceStr: string;
  weightStr: string;
}

export default function NewSaleScreen() {
  const { customerId } = useLocalSearchParams<{ customerId?: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

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

  // Live calculation of line item totals in paise to prevent float rounding errors
  const lineItemPaiseTotals = useMemo(() => {
    return lineItems.map((item) => {
      const qty = parseFloat(item.qtyStr) || 0;
      const price = parseFloat(item.priceStr) || 0;
      return Math.round(qty * price * 100);
    });
  }, [lineItems]);

  const invoiceTotalPaise = useMemo(() => {
    return lineItemPaiseTotals.reduce((sum, val) => sum + val, 0);
  }, [lineItemPaiseTotals]);

  const handleAddLineItem = (product: Product) => {
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

    const cleanDate = saleDate.trim();
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

    if (lineItems.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please add at least one product line item.',
      });
      return;
    }

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
      const timestamp = new Date().toISOString();

      await database.write(async () => {
        // 1. Create Sale Header
        await database.collections.get<Sale>('sales').create((sale) => {
          sale._raw.id = saleId;
          sale.customerId = selectedCustomer.id;
          sale.date = cleanDate;
          sale.totalAmount = invoiceTotalPaise;
          sale.discount = 0;
          sale.notes = notes.trim() || undefined;
          sale.createdAt = timestamp;
          sale.updatedAt = timestamp;
          sale.synced = 0;
        });

        // 2. Create Sale Items
        for (let i = 0; i < lineItems.length; i++) {
          const item = lineItems[i];
          const qty = parseFloat(item.qtyStr);
          const priceRupees = parseFloat(item.priceStr);
          const weight = parseFloat(item.weightStr) || undefined;
          const itemTotalPaise = lineItemPaiseTotals[i];

          await database.collections.get<SaleItem>('sale_items').create((saleItem) => {
            saleItem._raw.id = Crypto.randomUUID();
            saleItem.saleId = saleId;
            saleItem.productId = item.product.id;
            saleItem.qty = qty;
            saleItem.unitPrice = Math.round(priceRupees * 100);
            saleItem.weight = weight;
            saleItem.totalPrice = itemTotalPaise;
            saleItem.createdAt = timestamp;
            saleItem.updatedAt = timestamp;
            saleItem.synced = 0;
          });
        }

        // 3. Update Customer Balance
        await selectedCustomer.update((cust) => {
          cust.balance += invoiceTotalPaise;
          cust.updatedAt = timestamp;
          cust.synced = 0;
        });
      });

      Toast.show({
        type: 'success',
        text1: 'Sale Saved',
        text2: `Invoice of ${formatCurrency(invoiceTotalPaise)} saved successfully.`,
      });

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
    <ScreenBackground>
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

          {/* Invoice Date Field */}
          <GlassView style={styles.dateCard}>
            <Text style={[styles.dateLabel, { color: colors.text }]}>
              Invoice Date
            </Text>
            <TextInput
              style={[styles.dateInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={colors.tabIconDefault}
              value={saleDate}
              onChangeText={setSaleDate}
              autoCorrect={false}
              maxLength={10}
            />
          </GlassView>

          {/* Invoice Items Block */}
          <GlassView style={styles.card}>
            <View style={styles.itemsHeader}>
              <Text style={[styles.itemsTitle, { color: colors.text }]}>
                Line Items
              </Text>
              <TouchableOpacity
                onPress={() => setProductModalVisible(true)}
                style={[
                  styles.addItemBtn,
                  { backgroundColor: colorScheme === 'dark' ? 'rgba(45, 212, 191, 0.12)' : 'rgba(13, 148, 136, 0.06)' }
                ]}
              >
                <SymbolView
                  name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}
                  tintColor={colors.tint}
                  size={16}
                />
                <Text style={[styles.addItemBtnText, { color: colors.tint }]}>
                  Add Item
                </Text>
              </TouchableOpacity>
            </View>

            {lineItems.length === 0 ? (
              <View style={[styles.emptyItemsContainer, { borderTopColor: colors.border }]}>
                <SymbolView
                  name={{ ios: 'cart.badge.plus', android: 'add_shopping_cart', web: 'add_shopping_cart' }}
                  tintColor={colors.tabIconDefault}
                  size={36}
                />
                <Text style={[styles.emptyItemsText, { color: colors.tabIconDefault }]}>
                  Add products to build the invoice.
                </Text>
              </View>
            ) : (
              <View style={[styles.itemsListContainer, { borderTopColor: colors.border }]}>
                {lineItems.map((item, index) => {
                  const subTotalPaise = lineItemPaiseTotals[index];

                  return (
                    <View
                      key={item.id}
                      style={[styles.lineItemRow, { borderBottomColor: colors.border }]}
                    >
                      <View style={styles.lineItemHeader}>
                        <View style={styles.lineItemHeaderLeft}>
                          <Text style={[styles.lineItemName, { color: colors.text }]} numberOfLines={1}>
                            {item.product.name}
                          </Text>
                          <Text style={[styles.lineItemUnit, { color: colors.tabIconDefault }]}>
                            Unit: {item.product.unit}
                          </Text>
                        </View>
                        
                        <TouchableOpacity
                          onPress={() => handleRemoveLineItem(item.id)}
                          style={styles.deleteBtn}
                        >
                          <SymbolView
                            name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }}
                            tintColor={colors.danger}
                            size={18}
                          />
                        </TouchableOpacity>
                      </View>

                      {/* Inputs Row */}
                      <View style={styles.lineItemInputs}>
                        {/* Qty */}
                        <View style={styles.inputCol}>
                          <Text style={[styles.inputColLabel, { color: colors.tabIconDefault }]}>Qty</Text>
                          <TextInput
                            style={[styles.smallInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                            placeholder="0"
                            placeholderTextColor={colors.tabIconDefault}
                            keyboardType="decimal-pad"
                            value={item.qtyStr}
                            onChangeText={(val) => handleUpdateLineItem(item.id, 'qtyStr', val)}
                          />
                        </View>

                        {/* Price */}
                        <View style={[styles.inputCol, { flex: 1.5 }]}>
                          <Text style={[styles.inputColLabel, { color: colors.tabIconDefault }]}>Price (₹)</Text>
                          <TextInput
                            style={[styles.smallInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                            placeholder="Rate"
                            placeholderTextColor={colors.tabIconDefault}
                            keyboardType="decimal-pad"
                            value={item.priceStr}
                            onChangeText={(val) => handleUpdateLineItem(item.id, 'priceStr', val)}
                          />
                        </View>

                        {/* Weight */}
                        <View style={styles.inputCol}>
                          <Text style={[styles.inputColLabel, { color: colors.tabIconDefault }]}>Wt (kg)</Text>
                          <TextInput
                            style={[styles.smallInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                            placeholder="Opt"
                            placeholderTextColor={colors.tabIconDefault}
                            keyboardType="decimal-pad"
                            value={item.weightStr}
                            onChangeText={(val) => handleUpdateLineItem(item.id, 'weightStr', val)}
                          />
                        </View>

                        {/* Subtotal */}
                        <View style={[styles.subtotalCol, { flex: 1.5 }]}>
                          <Text style={[styles.inputColLabel, { color: colors.tabIconDefault }]}>Subtotal</Text>
                          <Text style={[styles.subtotalValue, { color: colors.text }]}>
                            {formatCurrency(subTotalPaise)}
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </GlassView>

          {/* Notes Input Field */}
          <GlassView style={styles.card}>
            <Text style={[styles.notesLabel, { color: colors.text }]}>
              Invoice Notes
            </Text>
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="Add ledger remarks (optional)..."
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
                Total Amount
              </Text>
              <Text style={[styles.footerValue, { color: colors.text }]}>
                {formatCurrency(invoiceTotalPaise)}
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!selectedCustomer || lineItems.length === 0 || saving)
                  ? { backgroundColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1' }
                  : { backgroundColor: colors.tint }
              ]}
              onPress={handleSaveInvoice}
              disabled={!selectedCustomer || lineItems.length === 0 || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Save Invoice</Text>
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

        {/* ----------------- PRODUCT SEARCH MODAL ----------------- */}
        <Modal 
          visible={productModalVisible} 
          animationType="slide"
          onRequestClose={() => { setProductModalVisible(false); setProductSearch(''); }}
        >
          <ScreenBackground>
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select Product</Text>
                <TouchableOpacity onPress={() => { setProductModalVisible(false); setProductSearch(''); }} style={styles.modalCloseBtn}>
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
                    placeholder="Search products by name..."
                    placeholderTextColor={colors.tabIconDefault}
                    value={productSearch}
                    onChangeText={setProductSearch}
                    autoCorrect={false}
                  />
                </View>
              </View>

              <ScrollView style={styles.modalList}>
                {products.length === 0 ? (
                  <View style={styles.modalEmpty}>
                    <Text style={[styles.emptyProductsText, { color: colors.tabIconDefault }]}>
                      No products matched. Pull sync settings to reload products inventory database.
                    </Text>
                  </View>
                ) : (
                  products.map((p) => (
                    <TouchableOpacity
                      key={p.id}
                      onPress={() => handleAddLineItem(p)}
                      style={[styles.modalListItem, { borderBottomColor: colors.border }]}
                    >
                      <View style={styles.modalListLeft}>
                        <Text style={[styles.modalItemName, { color: colors.text }]}>{p.name}</Text>
                        <Text style={[styles.modalItemPhone, { color: colors.tabIconDefault }]}>Unit: {p.unit}</Text>
                      </View>
                      <Text style={[styles.modalItemBal, { color: colors.tabIconDefault }]}>
                        Stock: {p.currentStock} {p.unit}
                      </Text>
                    </TouchableOpacity>
                  ))
                )}
              </ScrollView>
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
    width: 120,
    textAlign: 'center',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemsTitle: {
    fontSize: 16,
    fontWeight: '800',
  },
  addItemBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  addItemBtnText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  emptyItemsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderTopWidth: 1,
    marginTop: 8,
  },
  emptyItemsText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  itemsListContainer: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  lineItemRow: {
    borderBottomWidth: 1,
    paddingBottom: 12,
    marginBottom: 12,
  },
  lineItemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  lineItemHeaderLeft: {
    flex: 1,
    paddingRight: 12,
  },
  lineItemName: {
    fontSize: 14,
    fontWeight: '700',
  },
  lineItemUnit: {
    fontSize: 10,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginTop: 2,
  },
  deleteBtn: {
    padding: 2,
  },
  lineItemInputs: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputCol: {
    flex: 1,
    marginRight: 6,
  },
  inputColLabel: {
    fontSize: 9,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  smallInput: {
    height: 34,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    fontSize: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    textAlign: 'center',
  },
  subtotalCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginLeft: 6,
  },
  subtotalValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginTop: 4,
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
  emptyProductsText: {
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '600',
  },
});
