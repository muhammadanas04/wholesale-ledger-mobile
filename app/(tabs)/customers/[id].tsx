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
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../db';
import Customer from '../../../db/models/Customer';
import Sale from '../../../db/models/Sale';
import SaleItem from '../../../db/models/SaleItem';
import Payment from '../../../db/models/Payment';
import { useQuery, useRelation } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';

// Sub-component to render individual sale item rows and join Product relation reactively
function SaleItemRow({ item }: { item: SaleItem }) {
  const product = useRelation(item.product);
  const lineTotal = item.totalPrice || item.qty * item.unitPrice;

  return (
    <View className="flex-row justify-between py-2 border-b border-slate-100/60 dark:border-slate-800/30 last:border-b-0">
      <View className="flex-1">
        <Text className="text-xs font-semibold text-slate-700 dark:text-slate-300">
          {product ? product.name : 'Loading product...'}
        </Text>
        <Text className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
          {item.qty} {product ? product.unit : 'pcs'} x {formatCurrency(item.unitPrice)}
        </Text>
      </View>
      <Text className="text-xs font-mono font-semibold text-slate-800 dark:text-slate-200">
        {formatCurrency(lineTotal)}
      </Text>
    </View>
  );
}

// Sub-component to render a list of sale items within the accordion drawer
function SaleItemsList({ sale }: { sale: Sale }) {
  const itemsQuery = useMemo(() => sale.items, [sale]);
  const items = useQuery(itemsQuery);

  if (items.length === 0) {
    return (
      <View className="py-3 px-5 bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800/40">
        <Text className="text-xs text-slate-400 dark:text-slate-500">No items found for this sale.</Text>
      </View>
    );
  }

  return (
    <View className="bg-slate-50 dark:bg-slate-900/50 border-t border-slate-100 dark:border-slate-800/40 px-5 py-2">
      {items.map((item) => (
        <SaleItemRow key={item.id} item={item} />
      ))}
    </View>
  );
}

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [, setTick] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'sales' | 'payments' | 'bill'>('sales');
  const [expandedSaleId, setExpandedSaleId] = useState<string | null>(null);

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

  // Dummy query fallbacks for null configurations (Issue 19)
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

  // 4. Sum transactions reactively to build dynamic stats (Issue 17)
  const totalSalesPaise = useMemo(() => {
    return sales.reduce((sum, s) => sum + (s.totalAmount || 0), 0);
  }, [sales]);

  const totalPaidPaise = useMemo(() => {
    return payments.reduce((sum, p) => sum + (p.amount || 0), 0);
  }, [payments]);

  const totalDiscountsPaise = useMemo(() => {
    return payments.reduce((sum, p) => sum + (p.discount || 0), 0);
  }, [payments]);

  const previousBalancePaise = useMemo(() => {
    if (!customer) return 0;
    return customer.balance - (totalSalesPaise - totalPaidPaise - totalDiscountsPaise);
  }, [customer, totalSalesPaise, totalPaidPaise, totalDiscountsPaise]);

  const formattedDate = useMemo(() => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  }, []);

  // 5. Ledger Bill Text Generation (Issue 17 & 27)
  const billText = useMemo(() => {
    if (!customer) return '';
    return `Wholesale Ledger
Date: ${formattedDate}

Customer: ${customer.name}
Phone: ${customer.phone || 'N/A'}

Previous Balance: ${formatCurrency(previousBalancePaise)}
Total Sales:      +${formatCurrency(totalSalesPaise)}
Total Paid:       -${formatCurrency(totalPaidPaise)}
Total Discount:   -${formatCurrency(totalDiscountsPaise)}
──────────────────────
Balance Due:      ${formatCurrency(customer.balance)}`;
  }, [customer, formattedDate, previousBalancePaise, totalSalesPaise, totalPaidPaise, totalDiscountsPaise]);

  if (loading) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-900">
        <ActivityIndicator size="large" color="#4F46E5" />
      </View>
    );
  }

  if (!customer) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-50 dark:bg-slate-900 px-6">
        <Text className="text-lg font-bold text-slate-800 dark:text-slate-100">Customer Not Found</Text>
        <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center">
          The selected client record does not exist or has been removed.
        </Text>
      </View>
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

  const getBalanceStyle = (balance: number) => {
    if (balance > 0) return 'text-rose-600 dark:text-rose-400';
    if (balance === 0) return 'text-emerald-600 dark:text-emerald-400';
    return 'text-amber-600 dark:text-amber-400';
  };

  return (
    <View className="flex-1 bg-slate-50 dark:bg-slate-900">
      <ScrollView contentContainerStyle={{ paddingBottom: 110 }} className="flex-1">
        {/* Sticky Profile Header Card */}
        <View className="bg-white dark:bg-slate-800 px-5 pt-6 pb-5 border-b border-slate-100 dark:border-slate-800/50 shadow-sm">
          <View className="flex-row justify-between items-start">
            <View className="flex-1 pr-4">
              <Text className="text-2xl font-bold text-slate-900 dark:text-slate-50">
                {customer.name}
              </Text>
              {customer.phone ? (
                <Text className="text-slate-400 dark:text-slate-500 font-mono text-sm mt-1">
                  {customer.phone}
                </Text>
              ) : (
                <Text className="text-slate-400 dark:text-slate-500 text-xs italic mt-1">
                  No registered phone
                </Text>
              )}
            </View>
            <View className="items-end">
              <Text className="text-slate-400 dark:text-slate-500 text-[10px] uppercase font-bold tracking-wider">
                Balance Due
              </Text>
              <Text className={`text-2xl font-mono ${getBalanceStyle(customer.balance)} mt-0.5`}>
                {formatCurrency(customer.balance)}
              </Text>
            </View>
          </View>

          {customer.address ? (
            <View className="mt-4 bg-slate-50 dark:bg-slate-900/60 rounded-xl p-3 flex-row items-start">
              <SymbolView
                name={{ ios: 'mappin.circle', android: 'location_on', web: 'location_on' }}
                tintColor="#94A3B8"
                size={16}
                style={{ marginTop: 2 }}
              />
              <Text className="text-slate-500 dark:text-slate-400 text-xs ml-2 flex-1">
                {customer.address}
              </Text>
            </View>
          ) : null}

          {/* Quick Actions Profile Contact Buttons */}
          <View className="flex-row mt-5">
            <TouchableOpacity
              onPress={handleCall}
              disabled={!customer.phone}
              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl mr-2 border border-slate-200 dark:border-slate-700 active:scale-95 ${
                customer.phone ? 'bg-slate-50 dark:bg-slate-900/50' : 'opacity-40'
              }`}
            >
              <SymbolView
                name={{ ios: 'phone.fill', android: 'call', web: 'call' }}
                tintColor={customer.phone ? '#4F46E5' : '#94A3B8'}
                size={16}
              />
              <Text className={`font-semibold text-xs ml-2 ${customer.phone ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                Call Client
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSMS}
              disabled={!customer.phone}
              className={`flex-1 flex-row items-center justify-center py-3 rounded-xl ml-2 border border-slate-200 dark:border-slate-700 active:scale-95 ${
                customer.phone ? 'bg-slate-50 dark:bg-slate-900/50' : 'opacity-40'
              }`}
            >
              <SymbolView
                name={{ ios: 'message.fill', android: 'sms', web: 'sms' }}
                tintColor={customer.phone ? '#4F46E5' : '#94A3B8'}
                size={16}
              />
              <Text className={`font-semibold text-xs ml-2 ${customer.phone ? 'text-slate-700 dark:text-slate-300' : 'text-slate-400'}`}>
                Send Message
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Tab Selection Bar */}
        <View className="flex-row border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 px-2 mt-4">
          {(['sales', 'payments', 'bill'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              className={`flex-1 py-3.5 items-center border-b-2 ${
                activeTab === tab
                  ? 'border-indigo-600 dark:border-indigo-500'
                  : 'border-transparent'
              }`}
              onPress={() => setActiveTab(tab)}
            >
              <Text
                className={`font-semibold text-sm capitalize ${
                  activeTab === tab
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-slate-400 dark:text-slate-500'
                }`}
              >
                {tab === 'bill' ? 'Share Bill' : tab}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content Panels */}
        <View className="mt-2">
          {/* Sales Tab Panel */}
          {activeTab === 'sales' && (
            <View>
              {sales.length === 0 ? (
                <View className="py-12 items-center justify-center">
                  <SymbolView
                    name={{ ios: 'doc.plaintext', android: 'receipt', web: 'receipt' }}
                    tintColor="#CBD5E1"
                    size={48}
                  />
                  <Text className="text-slate-400 dark:text-slate-500 text-sm mt-3">
                    No sales recorded for this customer.
                  </Text>
                </View>
              ) : (
                sales.map((sale) => {
                  const isExpanded = expandedSaleId === sale.id;
                  return (
                    <View
                      key={sale.id}
                      className="border-b border-slate-100 dark:border-slate-800/40 bg-white dark:bg-slate-800"
                    >
                      <TouchableOpacity
                        className="flex-row justify-between items-center px-5 py-4 active:bg-slate-50 dark:active:bg-slate-700/20"
                        onPress={() => setExpandedSaleId(isExpanded ? null : sale.id)}
                      >
                        <View>
                          <Text className="text-sm font-bold text-slate-800 dark:text-slate-100">
                            Sale — {sale.date}
                          </Text>
                          {sale.notes ? (
                            <Text
                              className="text-xs text-slate-400 dark:text-slate-500 mt-1 max-w-[240px]"
                              numberOfLines={1}
                            >
                              {sale.notes}
                            </Text>
                          ) : null}
                        </View>
                        <View className="flex-row items-center">
                          <Text className="text-sm font-mono font-bold text-rose-600 dark:text-rose-400 mr-2">
                            +{formatCurrency(sale.totalAmount)}
                          </Text>
                          <SymbolView
                            name={{
                              ios: isExpanded ? 'chevron.up' : 'chevron.down',
                              android: isExpanded ? 'expand_less' : 'expand_more',
                              web: isExpanded ? 'expand_less' : 'expand_more',
                            }}
                            tintColor="#94A3B8"
                            size={16}
                          />
                        </View>
                      </TouchableOpacity>
                      {isExpanded ? <SaleItemsList sale={sale} /> : null}
                    </View>
                  );
                })
              )}
            </View>
          )}

          {/* Payments Tab Panel */}
          {activeTab === 'payments' && (
            <View>
              {payments.length === 0 ? (
                <View className="py-12 items-center justify-center">
                  <SymbolView
                    name={{ ios: 'indianrupeesign.square', android: 'payments', web: 'payments' }}
                    tintColor="#CBD5E1"
                    size={48}
                  />
                  <Text className="text-slate-400 dark:text-slate-500 text-sm mt-3">
                    No payments recorded for this customer.
                  </Text>
                </View>
              ) : (
                payments.map((payment) => (
                  <View
                    key={payment.id}
                    className="flex-row justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-800/40 bg-white dark:bg-slate-800"
                  >
                    <View className="flex-1 pr-4">
                      <Text className="text-sm font-bold text-slate-800 dark:text-slate-100">
                        Payment — {payment.date}
                      </Text>
                      {payment.notes ? (
                        <Text className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                          {payment.notes}
                        </Text>
                      ) : null}
                      {payment.discount > 0 ? (
                        <Text className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-1">
                          Discount Applied: {formatCurrency(payment.discount)}
                        </Text>
                      ) : null}
                    </View>
                    <Text className="text-sm font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      -{formatCurrency(payment.amount)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          {/* Bill Generation Tab Panel */}
          {activeTab === 'bill' && (
            <View className="px-5 py-4">
              <View className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700/60 rounded-2xl p-5 mb-5 shadow-inner">
                <Text className="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-widest font-semibold mb-3">
                  Preview Message
                </Text>
                <Text className="text-slate-800 dark:text-slate-200 text-sm font-mono leading-6">
                  {billText}
                </Text>
              </View>

              <View className="flex-row justify-between">
                <TouchableOpacity
                  onPress={handleCopyBill}
                  className="flex-1 flex-row items-center justify-center bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700/80 py-3.5 rounded-xl mr-2 active:scale-95"
                >
                  <SymbolView
                    name={{ ios: 'doc.on.doc.fill', android: 'content_copy', web: 'content_copy' }}
                    tintColor="#4F46E5"
                    size={14}
                  />
                  <Text className="font-semibold text-xs text-slate-700 dark:text-slate-300 ml-1.5">
                    Copy
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSendSMS}
                  className="flex-1 flex-row items-center justify-center bg-slate-200 dark:bg-slate-800 border border-slate-300 dark:border-slate-700/80 py-3.5 rounded-xl mx-1 active:scale-95"
                >
                  <SymbolView
                    name={{ ios: 'message.fill', android: 'sms', web: 'sms' }}
                    tintColor="#4F46E5"
                    size={14}
                  />
                  <Text className="font-semibold text-xs text-slate-700 dark:text-slate-300 ml-1.5">
                    Send SMS
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleShareBill}
                  className="flex-1 flex-row items-center justify-center bg-indigo-600 dark:bg-indigo-500 py-3.5 rounded-xl ml-2 active:scale-95 shadow-sm shadow-indigo-600/10"
                >
                  <SymbolView
                    name={{ ios: 'square.and.arrow.up.fill', android: 'share', web: 'share' }}
                    tintColor="#FFFFFF"
                    size={14}
                  />
                  <Text className="font-bold text-xs text-white ml-1.5">
                    Share
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky Bottom Comfort Zone CTAs */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-800/95 border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex-row justify-between backdrop-blur-md"
        style={{ paddingBottom: Platform.OS === 'ios' ? 24 : 16 }}
      >
        <TouchableOpacity
          className="flex-1 bg-emerald-600 dark:bg-emerald-500 py-3.5 rounded-xl flex-row justify-center items-center active:scale-[0.98] mr-2 shadow-sm shadow-emerald-600/10"
          onPress={() => router.push(`/payments/new?customerId=${customer.id}`)}
        >
          <Text className="text-white font-bold text-sm">Record Payment</Text>
        </TouchableOpacity>

        <TouchableOpacity
          className="flex-1 bg-indigo-600 dark:bg-indigo-500 py-3.5 rounded-xl flex-row justify-center items-center active:scale-[0.98] ml-2 shadow-sm shadow-indigo-600/10"
          onPress={() => router.push(`/sales/new?customerId=${customer.id}`)}
        >
          <Text className="text-white font-bold text-sm">New Sale</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
