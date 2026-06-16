import React, { useState, useEffect, useMemo } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Linking,
  Share,
  Platform,
  StyleSheet,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import Sale from '../../../db/models/Sale';
import SaleItem from '../../../db/models/SaleItem';
import Payment from '../../../db/models/Payment';
import { useQuery, useRelation } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';

// Sub-component to render individual sale item rows
function SaleItemRow({ item }: { item: SaleItem }) {
  const product = useRelation(item.product);
  const lineTotal = item.totalPrice || item.qty * item.unitPrice;
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  return (
    <View style={[styles.itemRow, { borderBottomColor: colors.border }]}>
      <View style={styles.itemRowLeft}>
        <Text style={[styles.itemRowName, { color: colors.text }]}>
          {product ? product.name : 'Loading product...'}
        </Text>
        <Text style={[styles.itemRowMeta, { color: colors.tabIconDefault }]}>
          {item.qty} {product ? product.unit : 'pcs'} x {formatCurrency(item.unitPrice)}
        </Text>
      </View>
      <Text style={[styles.itemRowTotal, { color: colors.text }]}>
        {formatCurrency(lineTotal)}
      </Text>
    </View>
  );
}

// Sub-component to render a list of sale items within the accordion drawer
function SaleItemsList({ sale }: { sale: Sale }) {
  const itemsQuery = useMemo(() => sale.items, [sale]);
  const items = useQuery(itemsQuery);
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  if (items.length === 0) {
    return (
      <View style={[styles.emptyItemsContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
        <Text style={{ color: colors.tabIconDefault, fontSize: 11 }}>No items found for this sale.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.itemsContainer, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
      {items.map((item) => (
        <SaleItemRow key={item.id} item={item} />
      ))}
    </View>
  );
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sales' | 'payments' | 'bill'>('sales');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

  // Selection states for custom bill generation
  const [selectedSaleIds, setSelectedSaleIds] = useState<Set<string>>(new Set());
  const [selectedPaymentIds, setSelectedPaymentIds] = useState<Set<string>>(new Set());
  const [initializedSelection, setInitializedSelection] = useState(false);

  // 1. Reactive subscription to Customer record by ID
  useEffect(() => {
    if (!id) return;
    const subscription = database.collections
      .get<Customer>('customers')
      .findAndObserve(id)
      .subscribe({
        next: (record) => {
          setCustomer(record);
          setTick((t) => t + 1);
          setLoading(false);
        },
        error: (err) => {
          console.error(`Error loading customer ${id}:`, err);
          setLoading(false);
        },
      });

    return () => subscription.unsubscribe();
  }, [id]);

  // Dummy query fallbacks
  const dummySalesQuery = useMemo(() => {
    return database.collections.get<Sale>('sales').query(Q.where('id', ''));
  }, []);

  const dummyPaymentsQuery = useMemo(() => {
    return database.collections.get<Payment>('payments').query(Q.where('id', ''));
  }, []);

  // 2. Reactive subscription to Customer Sales
  const salesQuery = useMemo(() => {
    if (!customer) return dummySalesQuery;
    return customer.sales.extend(Q.sortBy('date', Q.desc));
  }, [customer, dummySalesQuery]);

  const sales = useQuery(salesQuery);

  // 3. Reactive subscription to Customer Payments
  const paymentsQuery = useMemo(() => {
    if (!customer) return dummyPaymentsQuery;
    return customer.payments.extend(Q.sortBy('date', Q.desc));
  }, [customer, dummyPaymentsQuery]);

  const payments = useQuery(paymentsQuery);

  // Initialize selection sets to include all transactions by default on load
  useEffect(() => {
    if (!initializedSelection && (sales.length > 0 || payments.length > 0)) {
      setSelectedSaleIds(new Set(sales.map((s) => s.id)));
      setSelectedPaymentIds(new Set(payments.map((p) => p.id)));
      setInitializedSelection(true);
    }
  }, [sales, payments, initializedSelection]);

  // Calculations for all transactions (full ledger)
  const totalSalesPaise = useMemo(() => {
    return sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  }, [sales]);

  const totalPaidPaise = useMemo(() => {
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [payments]);

  const totalDiscountsPaise = useMemo(() => {
    return payments.reduce((sum, p) => sum + (p.discount || 0), 0);
  }, [payments]);

  // Calculations for selected transactions only (custom bill)
  const selectedSalesPaise = useMemo(() => {
    return sales
      .filter((s) => selectedSaleIds.has(s.id))
      .reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  }, [sales, selectedSaleIds]);

  const selectedPaidPaise = useMemo(() => {
    return payments
      .filter((p) => selectedPaymentIds.has(p.id))
      .reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [payments, selectedPaymentIds]);

  const selectedDiscountsPaise = useMemo(() => {
    return payments
      .filter((p) => selectedPaymentIds.has(p.id))
      .reduce((sum, p) => sum + (p.discount || 0), 0);
  }, [payments, selectedPaymentIds]);

  const selectedBalanceDue = useMemo(() => {
    return selectedSalesPaise - selectedPaidPaise - selectedDiscountsPaise;
  }, [selectedSalesPaise, selectedPaidPaise, selectedDiscountsPaise]);

  const formattedDate = useMemo(() => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, []);

  // 5. Custom Bill Text Generation based on selections
  const billText = useMemo(() => {
    if (!customer) return '';
    return `Wholesale Ledger
Date: ${formattedDate}

Customer: ${customer.name}
Phone: ${customer.phone || 'N/A'}

Selected Sales:    +${formatCurrency(selectedSalesPaise)}
Selected Received: -${formatCurrency(selectedPaidPaise)}
Selected Discount: -${formatCurrency(selectedDiscountsPaise)}
──────────────────────
Balance Due:       ${formatCurrency(selectedBalanceDue)}`;
  }, [customer, formattedDate, selectedSalesPaise, selectedPaidPaise, selectedDiscountsPaise, selectedBalanceDue]);

  if (loading) {
    return (
      <ScreenBackground>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      </ScreenBackground>
    );
  }

  if (!customer) {
    return (
      <ScreenBackground>
        <View style={styles.errorContainer}>
          <Text style={[styles.errorTitle, { color: colors.text }]}>Customer Not Found</Text>
          <Text style={[styles.errorSub, { color: colors.tabIconDefault }]}>
            The selected client record does not exist or has been removed.
          </Text>
        </View>
      </ScreenBackground>
    );
  }

  const handleCall = () => {
    if (customer.phone) {
      Linking.openURL(`tel:${customer.phone}`);
    }
  };

  const handleSMS = () => {
    if (customer.phone) {
      Linking.openURL(`sms:${customer.phone}`);
    }
  };

  const handleSendSMS = async () => {
    if (!customer.phone) {
      Toast.show({
        type: 'error',
        text1: 'SMS Error',
        text2: 'No phone number saved for this customer.',
      });
      return;
    }

    const cleanPhone = customer.phone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      Toast.show({
        type: 'error',
        text1: 'SMS Error',
        text2: 'Invalid phone number format.',
      });
      return;
    }

    const url = `sms:${cleanPhone}${Platform.OS === 'ios' ? '&' : '?'}body=${encodeURIComponent(billText)}`;

    try {
      const canOpen = await Linking.canOpenURL(`sms:${cleanPhone}`);
      if (canOpen) {
        await Linking.openURL(url);
      } else {
        Toast.show({
          type: 'error',
          text1: 'SMS Not Supported',
          text2: 'SMS is not available on this device. Copy the bill and send manually.',
        });
      }
    } catch (e) {
      console.error('Failed to open SMS link:', e);
      Toast.show({
        type: 'error',
        text1: 'SMS Failed',
        text2: 'Could not open SMS application.',
      });
    }
  };

  const handleShareBill = async () => {
    try {
      await Share.share({
        message: billText,
      });
    } catch (e) {
      console.error('Failed to share bill:', e);
    }
  };

  const handleCopyBill = async () => {
    try {
      await Clipboard.setStringAsync(billText);
      Toast.show({
        type: 'success',
        text1: 'Copied to Clipboard',
        text2: 'Ledger balance details copied successfully!',
      });
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: 'Copy Failed',
        text2: 'Failed to write to clipboard.',
      });
    }
  };

  // Toggle sale selection
  const toggleSaleSelection = (saleId: string) => {
    const next = new Set(selectedSaleIds);
    if (next.has(saleId)) {
      next.delete(saleId);
    } else {
      next.add(saleId);
    }
    setSelectedSaleIds(next);
  };

  // Toggle payment selection
  const togglePaymentSelection = (paymentId: string) => {
    const next = new Set(selectedPaymentIds);
    if (next.has(paymentId)) {
      next.delete(paymentId);
    } else {
      next.add(paymentId);
    }
    setSelectedPaymentIds(next);
  };

  // Select/Deselect All Transactions
  const toggleSelectAll = () => {
    const allSalesSelected = selectedSaleIds.size === sales.length;
    const allPaymentsSelected = selectedPaymentIds.size === payments.length;

    if (allSalesSelected && allPaymentsSelected) {
      // Deselect all
      setSelectedSaleIds(new Set());
      setSelectedPaymentIds(new Set());
    } else {
      // Select all
      setSelectedSaleIds(new Set(sales.map((s) => s.id)));
      setSelectedPaymentIds(new Set(payments.map((p) => p.id)));
    }
  };

  const isAllSelected = selectedSaleIds.size === sales.length && selectedPaymentIds.size === payments.length;

  return (
    <ScreenBackground>
      {/* Set padding top for safe area in custom stack headers */}
      <View style={styles.rootContainer}>
        <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scrollView}>
          {/* Sticky Profile Header Card */}
          <GlassView style={styles.profileCard}>
            <View style={styles.profileHeaderRow}>
              <View style={styles.profileTextCol}>
                <Text style={[styles.clientName, { color: colors.text }]}>
                  {customer.name}
                </Text>
                {customer.phone ? (
                  <Text style={[styles.clientPhone, { color: colors.tabIconDefault }]}>
                    {customer.phone}
                  </Text>
                ) : (
                  <Text style={[styles.clientPhoneNo, { color: colors.tabIconDefault }]}>
                    No registered phone
                  </Text>
                )}
              </View>
              <View style={styles.balanceCol}>
                <Text style={[styles.balanceLabel, { color: colors.tabIconDefault }]}>
                  Balance Due
                </Text>
                <Text style={[styles.balanceValue, { color: customer.balance > 0 ? colors.danger : colors.success }]}>
                  {formatCurrency(customer.balance)}
                </Text>
              </View>
            </View>

            {customer.address ? (
              <View style={[styles.addressBox, { backgroundColor: colors.background }]}>
                <SymbolView
                  name={{ ios: 'mappin.circle', android: 'location_on', web: 'location_on' }}
                  tintColor={colors.tabIconDefault}
                  size={16}
                  style={styles.addressIcon}
                />
                <Text style={[styles.addressText, { color: colors.text }]}>
                  {customer.address}
                </Text>
              </View>
            ) : null}

            {/* Quick Actions Buttons */}
            <View style={styles.quickActionsRow}>
              <TouchableOpacity
                onPress={handleCall}
                disabled={!customer.phone}
                style={[
                  styles.quickActionBtn,
                  { borderColor: colors.border },
                  customer.phone ? { backgroundColor: colors.surface } : { opacity: 0.4 }
                ]}
              >
                <SymbolView
                  name={{ ios: 'phone.fill', android: 'call', web: 'call' }}
                  tintColor={customer.phone ? colors.tint : colors.tabIconDefault}
                  size={14}
                />
                <Text style={[styles.quickActionText, { color: customer.phone ? colors.text : colors.tabIconDefault }]}>
                  Call Client
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleSMS}
                disabled={!customer.phone}
                style={[
                  styles.quickActionBtn,
                  { borderColor: colors.border },
                  customer.phone ? { backgroundColor: colors.surface } : { opacity: 0.4 }
                ]}
              >
                <SymbolView
                  name={{ ios: 'message.fill', android: 'sms', web: 'sms' }}
                  tintColor={customer.phone ? colors.tint : colors.tabIconDefault}
                  size={14}
                />
                <Text style={[styles.quickActionText, { color: customer.phone ? colors.text : colors.tabIconDefault }]}>
                  Message
                </Text>
              </TouchableOpacity>
            </View>
          </GlassView>

          {/* Selection tools / select all bar */}
          {(activeTab === 'sales' || activeTab === 'payments') && (sales.length > 0 || payments.length > 0) && (
            <View style={styles.selectionBar}>
              <TouchableOpacity
                style={[styles.selectAllBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={toggleSelectAll}
              >
                <SymbolView
                  name={{
                    ios: isAllSelected ? 'checkmark.circle.fill' : 'circle',
                    android: isAllSelected ? 'check_circle' : 'radio_button_unchecked',
                    web: isAllSelected ? 'check_circle' : 'radio_button_unchecked',
                  }}
                  tintColor={isAllSelected ? colors.tint : colors.tabIconDefault}
                  size={16}
                />
                <Text style={[styles.selectAllText, { color: colors.text }]}>
                  {isAllSelected ? 'Deselect All' : 'Select All Ledger'}
                </Text>
              </TouchableOpacity>
              <Text style={[styles.selectedCountText, { color: colors.tabIconDefault }]}>
                {selectedSaleIds.size + selectedPaymentIds.size} items selected
              </Text>
            </View>
          )}

          {/* Tab Selection Bar */}
          <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.surface }]}>
            {(['sales', 'payments', 'bill'] as const).map((tab) => (
              <TouchableOpacity
                key={tab}
                style={[
                  styles.tabButton,
                  activeTab === tab && { borderBottomColor: colors.tint, borderBottomWidth: 2 }
                ]}
                onPress={() => setActiveTab(tab)}
              >
                <Text
                  style={[
                    styles.tabButtonText,
                    { 
                      color: activeTab === tab ? colors.tint : colors.tabIconDefault,
                      fontWeight: activeTab === tab ? '700' : '500',
                    }
                  ]}
                >
                  {tab === 'bill' ? 'Share Bill' : tab === 'sales' ? 'Sales' : 'Payments'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Tab Content Panels */}
          <View style={styles.tabContentContainer}>
            {/* Sales Tab Panel */}
            {activeTab === 'sales' && (
              <View>
                {sales.length === 0 ? (
                  <View style={styles.emptyPanel}>
                    <SymbolView
                      name={{ ios: 'doc.plaintext', android: 'receipt', web: 'receipt' }}
                      tintColor={colors.tabIconDefault}
                      size={44}
                    />
                    <Text style={[styles.emptyPanelText, { color: colors.tabIconDefault }]}>
                      No sales recorded for this customer.
                    </Text>
                  </View>
                ) : (
                  sales.map((sale) => {
                    const isExpanded = expandedSaleId === sale.id;
                    const isSelected = selectedSaleIds.has(sale.id);
                    return (
                      <GlassView
                        key={sale.id}
                        style={styles.saleRowContainer}
                        borderRadius={16}
                      >
                        <View style={styles.saleRowHeader}>
                          {/* Checkbox selector */}
                          <TouchableOpacity
                            onPress={() => toggleSaleSelection(sale.id)}
                            style={styles.checkboxContainer}
                          >
                            <SymbolView
                              name={{
                                ios: isSelected ? 'checkmark.circle.fill' : 'circle',
                                android: isSelected ? 'check_circle' : 'radio_button_unchecked',
                                web: isSelected ? 'check_circle' : 'radio_button_unchecked',
                              }}
                              tintColor={isSelected ? colors.tint : colors.tabIconDefault}
                              size={18}
                            />
                          </TouchableOpacity>

                          <TouchableOpacity
                            style={styles.saleRowClickable}
                            onPress={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                          >
                            <View style={styles.saleDetailsCol}>
                              <Text style={[styles.transactionTitle, { color: colors.text }]}>
                                Sale — {sale.date}
                              </Text>
                              {sale.notes && (
                                <Text
                                  style={[styles.transactionNotes, { color: colors.tabIconDefault }]}
                                  numberOfLines={1}
                                >
                                  {sale.notes}
                                </Text>
                              )}
                            </View>
                            <View style={styles.saleAmountRow}>
                              <Text style={[styles.saleAmountValue, { color: colors.danger }]}>
                                +{formatCurrency(sale.totalAmount)}
                              </Text>
                              <SymbolView
                                name={{
                                  ios: isExpanded ? 'chevron.up' : 'chevron.down',
                                  android: isExpanded ? 'expand_less' : 'expand_more',
                                  web: isExpanded ? 'expand_less' : 'expand_more',
                                }}
                                tintColor={colors.tabIconDefault}
                                size={14}
                                style={styles.arrowIcon}
                              />
                            </View>
                          </TouchableOpacity>
                        </View>
                        {isExpanded ? <SaleItemsList sale={sale} /> : null}
                      </GlassView>
                    );
                  })
                )}
              </View>
            )}

            {/* Payments Tab Panel */}
            {activeTab === 'payments' && (
              <View>
                {payments.length === 0 ? (
                  <View style={styles.emptyPanel}>
                    <SymbolView
                      name={{ ios: 'indianrupeesign.square', android: 'payments', web: 'payments' }}
                      tintColor={colors.tabIconDefault}
                      size={44}
                    />
                    <Text style={[styles.emptyPanelText, { color: colors.tabIconDefault }]}>
                      No payments recorded for this customer.
                    </Text>
                  </View>
                ) : (
                  payments.map((payment) => {
                    const isSelected = selectedPaymentIds.has(payment.id);
                    return (
                      <GlassView
                        key={payment.id}
                        style={styles.paymentRowContainer}
                        borderRadius={16}
                      >
                        <View style={styles.paymentCheckboxRow}>
                          <TouchableOpacity
                            onPress={() => togglePaymentSelection(payment.id)}
                            style={styles.checkboxContainer}
                          >
                            <SymbolView
                              name={{
                                ios: isSelected ? 'checkmark.circle.fill' : 'circle',
                                android: isSelected ? 'check_circle' : 'radio_button_unchecked',
                                web: isSelected ? 'check_circle' : 'radio_button_unchecked',
                              }}
                              tintColor={isSelected ? colors.tint : colors.tabIconDefault}
                              size={18}
                            />
                          </TouchableOpacity>

                          <View style={styles.paymentDetailsRow}>
                            <View style={styles.paymentDetailsLeft}>
                              <Text style={[styles.transactionTitle, { color: colors.text }]}>
                                Payment — {payment.date}
                              </Text>
                              {payment.notes && (
                                <Text style={[styles.transactionNotes, { color: colors.tabIconDefault }]}>
                                  {payment.notes}
                                </Text>
                              )}
                              {payment.discount > 0 && (
                                <Text style={[styles.discountTagText, { color: colors.success }]}>
                                  Discount Applied: {formatCurrency(payment.discount)}
                                </Text>
                              )}
                            </View>
                            <Text style={[styles.paymentAmountText, { color: colors.success }]}>
                              -{formatCurrency(payment.amount)}
                            </Text>
                          </View>
                        </View>
                      </GlassView>
                    );
                  })
                )}
              </View>
            )}

            {/* Bill Generation Tab Panel */}
            {activeTab === 'bill' && (
              <View>
                <GlassView style={styles.billPreviewCard}>
                  <Text style={[styles.billPreviewSub, { color: colors.tabIconDefault }]}>
                    Preview Message ({selectedSaleIds.size + selectedPaymentIds.size} transactions)
                  </Text>
                  <Text style={[styles.billTextContent, { color: colors.text }]}>
                    {billText}
                  </Text>
                </GlassView>

                <View style={styles.billActionsRow}>
                  <TouchableOpacity
                    onPress={handleCopyBill}
                    style={[styles.billActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <SymbolView
                      name={{ ios: 'doc.on.doc.fill', android: 'content_copy', web: 'content_copy' }}
                      tintColor={colors.tint}
                      size={14}
                    />
                    <Text style={[styles.billActionBtnText, { color: colors.text }]}>
                      Copy
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleSendSMS}
                    style={[styles.billActionBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                  >
                    <SymbolView
                      name={{ ios: 'message.fill', android: 'sms', web: 'sms' }}
                      tintColor={colors.tint}
                      size={14}
                    />
                    <Text style={[styles.billActionBtnText, { color: colors.text }]}>
                      Send SMS
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleShareBill}
                    style={[styles.billActionBtnPrimary, { backgroundColor: colors.tint }]}
                  >
                    <SymbolView
                      name={{ ios: 'square.and.arrow.up.fill', android: 'share', web: 'share' }}
                      tintColor="#FFFFFF"
                      size={14}
                    />
                    <Text style={styles.billActionBtnTextPrimary}>
                      Share
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </ScrollView>

        {/* Sticky Bottom Actions Comfort Zone CTAs */}
        <GlassView
          style={[styles.stickyFooter, { paddingBottom: Platform.OS === 'ios' ? insets.bottom + 8 : 16 }]}
          borderRadius={0}
          borderColor="transparent"
          backgroundColor={colorScheme === 'dark' ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.92)'}
        >
          <View style={styles.footerActions}>
            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: colors.accent }]}
              onPress={() => router.push(`/ledger/new-payment?customerId=${customer.id}`)}
            >
              <Text style={styles.footerBtnText}>Record Payment</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.footerBtn, { backgroundColor: colors.tint }]}
              onPress={() => router.push(`/ledger/new-sale?customerId=${customer.id}`)}
            >
              <Text style={styles.footerBtnText}>New Sale</Text>
            </TouchableOpacity>
          </View>
        </GlassView>
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
    paddingTop: 16,
    paddingBottom: 110,
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
  profileCard: {
    padding: 20,
    marginBottom: 16,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  profileTextCol: {
    flex: 1,
    paddingRight: 16,
  },
  clientName: {
    fontSize: 22,
    fontWeight: '800',
  },
  clientPhone: {
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 14,
    marginTop: 4,
  },
  clientPhoneNo: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  balanceCol: {
    alignItems: 'flex-end',
  },
  balanceLabel: {
    fontSize: 9,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 22,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '800',
    marginTop: 2,
  },
  addressBox: {
    marginTop: 16,
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  addressIcon: {
    marginTop: 2,
  },
  addressText: {
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
    lineHeight: 16,
  },
  quickActionsRow: {
    flexDirection: 'row',
    marginTop: 16,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginHorizontal: 4,
  },
  quickActionText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  selectionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  selectAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  selectAllText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
  },
  selectedCountText: {
    fontSize: 11,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 8,
    marginBottom: 16,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabButtonText: {
    fontSize: 13,
  },
  tabContentContainer: {
    marginTop: 4,
  },
  emptyPanel: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyPanelText: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 10,
  },
  saleRowContainer: {
    marginBottom: 10,
    borderWidth: 1,
  },
  saleRowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  checkboxContainer: {
    padding: 6,
    marginRight: 6,
  },
  saleRowClickable: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  saleDetailsCol: {
    flex: 1,
    paddingRight: 10,
  },
  transactionTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  transactionNotes: {
    fontSize: 11,
    marginTop: 2,
  },
  saleAmountRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  saleAmountValue: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginRight: 8,
  },
  arrowIcon: {
    marginTop: 1,
  },
  paymentRowContainer: {
    marginBottom: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  paymentCheckboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentDetailsRow: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentDetailsLeft: {
    flex: 1,
    paddingRight: 10,
  },
  discountTagText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  paymentAmountText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  billPreviewCard: {
    padding: 20,
    marginBottom: 16,
  },
  billPreviewSub: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  billTextContent: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    lineHeight: 20,
  },
  billActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  billActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginRight: 8,
  },
  billActionBtnText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 4,
  },
  billActionBtnPrimary: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
  },
  billActionBtnTextPrimary: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
    marginLeft: 4,
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
  footerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 4,
  },
  footerBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  emptyItemsContainer: {
    paddingVertical: 12,
    alignItems: 'center',
    borderTopWidth: 1,
  },
  itemsContainer: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 4,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
  },
  itemRowLeft: {
    flex: 1,
  },
  itemRowName: {
    fontSize: 11,
    fontWeight: '700',
  },
  itemRowMeta: {
    fontSize: 9,
    marginTop: 1,
  },
  itemRowTotal: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontWeight: '700',
  },
});
