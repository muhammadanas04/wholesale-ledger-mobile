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
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Toast from 'react-native-toast-message';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../db';
import Driver from '../../../db/models/Driver';
import Customer from '../../../db/models/Customer';
import Delivery from '../../../db/models/Delivery';
import DeliveryItem from '../../../db/models/DeliveryItem';
import { useQuery } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';

interface StopItem {
  id: string;
  address: string;
  stockAmount: string;
  selectedCustomer: Customer | null;
}

export default function NewDeliveryScreen() {
  const [selectedDriver, setSelectedDriver] = useState<Driver | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [stops, setStops] = useState<StopItem[]>([]);
  const [saving, setSaving] = useState(false);

  // Modals Visibility
  const [driverModalVisible, setDriverModalVisible] = useState(false);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);

  // Modals Search Filters
  const [driverSearch, setDriverSearch] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');

  // Target Stop tracker for Customer Modal linking
  const [targetStopId, setTargetStopId] = useState<string | null>(null);

  // 1. Query active drivers reactively
  const activeDriversQuery = useMemo(() => {
    const clean = Q.sanitizeLikeString(driverSearch.trim());
    const clauses: any[] = [Q.where('active', 1)];
    if (clean) {
      clauses.push(
        Q.or(
          Q.where('name', Q.like(`%${clean}%`)),
          Q.where('phone', Q.like(`%${clean}%`))
        )
      );
    }
    clauses.push(Q.sortBy('name', Q.asc));
    return database.collections.get<Driver>('drivers').query(...clauses);
  }, [driverSearch]);

  const activeDrivers = useQuery(activeDriversQuery);

  // 2. Query customers reactively for Stops Client Link
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

  // Actions for Stops List
  const handleAddStop = () => {
    const newStop: StopItem = {
      id: Crypto.randomUUID(),
      address: '',
      stockAmount: '',
      selectedCustomer: null,
    };
    setStops((prev) => [...prev, newStop]);
  };

  const handleUpdateStop = (id: string, field: 'address' | 'stockAmount', value: string) => {
    setStops((prev) =>
      prev.map((stop) => (stop.id === id ? { ...stop, [field]: value } : stop))
    );
  };

  const handleRemoveStop = (id: string) => {
    setStops((prev) => prev.filter((stop) => stop.id !== id));
  };

  const handleOpenCustomerModal = (stopId: string) => {
    setTargetStopId(stopId);
    setCustomerModalVisible(true);
  };

  const handleLinkCustomer = (customer: Customer) => {
    if (targetStopId) {
      setStops((prev) =>
        prev.map((stop) =>
          stop.id === targetStopId ? { ...stop, selectedCustomer: customer, address: customer.address || stop.address } : stop
        )
      );
    }
    setCustomerModalVisible(false);
    setTargetStopId(null);
    setCustomerSearch('');
  };

  const handleUnlinkCustomer = (stopId: string) => {
    setStops((prev) =>
      prev.map((stop) => (stop.id === stopId ? { ...stop, selectedCustomer: null } : stop))
    );
  };

  const handleSaveDelivery = async () => {
    if (!selectedDriver) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please select a driver first.',
      });
      return;
    }

    if (stops.length === 0) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Please add at least one stop stop.',
      });
      return;
    }

    // Stop-level checks
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      if (!stop.address.trim()) {
        Toast.show({
          type: 'error',
          text1: 'Validation Error',
          text2: `Address is required for Stop #${i + 1}.`,
        });
        return;
      }
      if (!stop.stockAmount.trim()) {
        Toast.show({
          type: 'error',
          text1: 'Validation Error',
          text2: `Stock description is required for Stop #${i + 1}.`,
        });
        return;
      }
    }

    setSaving(true);
    try {
      const deliveryId = Crypto.randomUUID();
      const timestamp = new Date().toISOString();

      // Write atomically to SQLite
      await database.write(async () => {
        // 1. Create Delivery header
        await database.collections.get<Delivery>('deliveries').create((del) => {
          del._raw.id = deliveryId;
          del.driverId = selectedDriver.id;
          del.status = 'pending';
          del.notes = deliveryNotes.trim() || undefined;
          del.createdAt = timestamp;
          del.updatedAt = timestamp;
          del.synced = 0;
        });

        // 2. Create individual DeliveryItems
        for (let i = 0; i < stops.length; i++) {
          const stop = stops[i];
          await database.collections.get<DeliveryItem>('delivery_items').create((delItem) => {
            delItem._raw.id = Crypto.randomUUID();
            delItem.deliveryId = deliveryId;
            delItem.address = stop.address.trim();
            delItem.stockAmount = stop.stockAmount.trim();
            delItem.status = 'pending';
            delItem.customerId = stop.selectedCustomer?.id || undefined;
            delItem.createdAt = timestamp;
            delItem.updatedAt = timestamp;
            delItem.synced = 0;
          });
        }
      });

      Toast.show({
        type: 'success',
        text1: 'Delivery Dispatched',
        text2: `Assigned successfully to ${selectedDriver.name}.`,
      });

      // Background synchronization
      runSync(database).catch((err) => {
        console.error('Post delivery creation sync failed:', err);
      });

      router.back();
    } catch (e: any) {
      console.error('Failed to create delivery:', e);
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: e.message || 'Error occurred while saving task.',
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
        
        {/* Driver Selection Card */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5">
          <Text className="text-slate-400 dark:text-slate-500 uppercase tracking-wider text-[10px] font-bold mb-2">
            Assigned Driver *
          </Text>

          {selectedDriver ? (
            <View className="flex-row justify-between items-center mt-1">
              <View className="flex-1 pr-4">
                <Text className="text-lg font-bold text-slate-800 dark:text-slate-100">
                  {selectedDriver.name}
                </Text>
                <Text className="text-slate-400 dark:text-slate-500 text-xs mt-0.5 font-mono">
                  {selectedDriver.phone}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDriverModalVisible(true)}
                className="px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg active:scale-95"
              >
                <Text className="text-indigo-600 dark:text-indigo-400 text-xs font-bold">
                  Change
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              onPress={() => setDriverModalVisible(true)}
              className="border-2 border-dashed border-slate-200 dark:border-slate-850 py-6 rounded-xl justify-center items-center flex-row active:scale-[0.98]"
            >
              <SymbolView
                name={{ ios: 'person.badge.plus.fill', android: 'person_add', web: 'person_add' }}
                tintColor="#4F46E5"
                size={20}
              />
              <Text className="text-indigo-600 dark:text-indigo-400 font-bold text-sm ml-2">
                Choose Driver
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* General Delivery Notes Card */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5">
          <Text className="text-slate-800 dark:text-slate-100 font-bold text-sm mb-2">
            Delivery Notes (Optional)
          </Text>
          <TextInput
            className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm min-h-[60px]"
            placeholder="E.g., route directions, key handover remarks..."
            placeholderTextColor="#94A3B8"
            value={deliveryNotes}
            onChangeText={setDeliveryNotes}
            multiline
            autoCapitalize="sentences"
          />
        </View>

        {/* Stops/Tasks List Card */}
        <View className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-100 dark:border-slate-800/50 shadow-sm mb-5">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-slate-800 dark:text-slate-100 font-bold text-base">
              Route Stops
            </Text>
            <TouchableOpacity
              onPress={handleAddStop}
              className="bg-indigo-50 dark:bg-indigo-950/40 px-3.5 py-2 rounded-xl flex-row items-center active:scale-95"
            >
              <SymbolView
                name={{ ios: 'plus.circle.fill', android: 'add_circle', web: 'add_circle' }}
                tintColor="#4F46E5"
                size={16}
              />
              <Text className="text-indigo-600 dark:text-indigo-400 font-bold text-xs ml-1.5">
                Add Stop
              </Text>
            </TouchableOpacity>
          </View>

          {stops.length === 0 ? (
            <View className="py-10 items-center justify-center border-t border-slate-100 dark:border-slate-800/30">
              <SymbolView
                name={{ ios: 'mappin.and.ellipse', android: 'add_location', web: 'add_location' }}
                tintColor="#CBD5E1"
                size={40}
              />
              <Text className="text-slate-400 dark:text-slate-500 text-xs mt-3.5 text-center max-w-[200px]">
                Add stops to plan the delivery layout stop-by-stop.
              </Text>
            </View>
          ) : (
            <View className="border-t border-slate-100 dark:border-slate-800/30 pt-4">
              {stops.map((stop, index) => (
                <View
                  key={stop.id}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-2xl p-4 mb-4 last:mb-0 relative"
                >
                  <View className="flex-row justify-between items-center mb-3">
                    <Text className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      STOP #{index + 1}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveStop(stop.id)}
                      className="p-1"
                    >
                      <SymbolView
                        name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }}
                        tintColor="#EF4444"
                        size={16}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Stop Address */}
                  <View className="mb-3">
                    <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1">
                      Delivery Address *
                    </Text>
                    <TextInput
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-50 text-xs"
                      placeholder="Enter destination address"
                      placeholderTextColor="#94A3B8"
                      value={stop.address}
                      onChangeText={(val) => handleUpdateStop(stop.id, 'address', val)}
                    />
                  </View>

                  {/* Stock Description */}
                  <View className="mb-3">
                    <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase mb-1">
                      Stock Details *
                    </Text>
                    <TextInput
                      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-slate-900 dark:text-slate-50 text-xs"
                      placeholder="E.g., 5 bags Rice, 1 tin Ghee"
                      placeholderTextColor="#94A3B8"
                      value={stop.stockAmount}
                      onChangeText={(val) => handleUpdateStop(stop.id, 'stockAmount', val)}
                    />
                  </View>

                  {/* Client Association */}
                  <View className="mt-1 flex-row items-center justify-between border-t border-slate-200/50 dark:border-slate-800/60 pt-3">
                    {stop.selectedCustomer ? (
                      <View className="flex-1 flex-row items-center justify-between">
                        <View className="flex-1 pr-2">
                          <Text className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase">
                            Linked Client
                          </Text>
                          <Text className="text-xs font-semibold text-slate-700 dark:text-slate-300 mt-0.5" numberOfLines={1}>
                            {stop.selectedCustomer.name}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleUnlinkCustomer(stop.id)}
                          className="px-2.5 py-1 bg-rose-50 dark:bg-rose-950/20 rounded-lg active:scale-95"
                        >
                          <Text className="text-rose-600 dark:text-rose-400 font-bold text-[10px]">
                            Unlink
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <TouchableOpacity
                        onPress={() => handleOpenCustomerModal(stop.id)}
                        className="flex-row items-center active:scale-95 py-1"
                      >
                        <SymbolView
                          name={{ ios: 'link.badge.plus', android: 'link', web: 'link' }}
                          tintColor="#4F46E5"
                          size={14}
                        />
                        <Text className="text-indigo-600 dark:text-indigo-400 font-bold text-xs ml-1.5">
                          Link Customer Account
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* Sticky Bottom Actions Bar */}
      <View
        className="absolute bottom-0 left-0 right-0 bg-white/95 dark:bg-slate-800/95 border-t border-slate-200 dark:border-slate-800 px-6 py-4 flex-row justify-between items-center backdrop-blur-md"
        style={{ paddingBottom: Platform.OS === 'ios' ? 24 : 16 }}
      >
        <View>
          <Text className="text-[10px] text-slate-400 dark:text-slate-500 uppercase font-bold tracking-wider">
            Planned Route
          </Text>
          <Text className="text-xl font-bold text-slate-800 dark:text-slate-50">
            {stops.length} Stops
          </Text>
        </View>

        <TouchableOpacity
          className={`px-8 py-3.5 rounded-xl justify-center items-center active:scale-[0.98] ${
            !selectedDriver || stops.length === 0 || saving
              ? 'bg-slate-300 dark:bg-slate-700'
              : 'bg-indigo-600 dark:bg-indigo-500 shadow-sm shadow-indigo-600/20'
          }`}
          onPress={handleSaveDelivery}
          disabled={!selectedDriver || stops.length === 0 || saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text className="text-white font-bold text-sm">Send to Driver</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ----------------- DRIVER SELECTOR MODAL ----------------- */}
      <Modal visible={driverModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
          <View className="flex-row justify-between items-center px-5 py-4 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800/50">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">Select Active Driver</Text>
            <TouchableOpacity onPress={() => { setDriverModalVisible(false); setDriverSearch(''); }} className="p-1">
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
                placeholder="Search by name or phone..."
                placeholderTextColor="#94A3B8"
                value={driverSearch}
                onChangeText={setDriverSearch}
                autoCorrect={false}
              />
            </View>
          </View>

          <ScrollView className="flex-1">
            {activeDrivers.length === 0 ? (
              <View className="py-20 items-center justify-center">
                <Text className="text-slate-400 dark:text-slate-500 text-sm">No active drivers found.</Text>
              </View>
            ) : (
              activeDrivers.map((d) => (
                <TouchableOpacity
                  key={d.id}
                  onPress={() => {
                    setSelectedDriver(d);
                    setDriverModalVisible(false);
                    setDriverSearch('');
                  }}
                  className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/30 bg-white dark:bg-slate-800 flex-row justify-between items-center active:bg-slate-50 dark:active:bg-slate-700/20"
                >
                  <View className="flex-1 pr-4">
                    <Text className="text-sm font-bold text-slate-800 dark:text-slate-100">{d.name}</Text>
                    <Text className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{d.phone}</Text>
                  </View>
                  <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor="#CBD5E1" size={16} />
                </TouchableOpacity>
              ))
            )}
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* ----------------- CUSTOMER SELECTOR MODAL ----------------- */}
      <Modal visible={customerModalVisible} animationType="slide">
        <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
          <View className="flex-row justify-between items-center px-5 py-4 bg-white dark:bg-slate-800 border-b border-slate-100 dark:border-slate-800/50">
            <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">Link Customer Account</Text>
            <TouchableOpacity onPress={() => { setCustomerModalVisible(false); setCustomerSearch(''); setTargetStopId(null); }} className="p-1">
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
                  onPress={() => handleLinkCustomer(c)}
                  className="px-5 py-4 border-b border-slate-100 dark:border-slate-800/30 bg-white dark:bg-slate-800 flex-row justify-between items-center active:bg-slate-50 dark:active:bg-slate-700/20"
                >
                  <View className="flex-1 pr-4">
                    <Text className="text-sm font-bold text-slate-800 dark:text-slate-100">{c.name}</Text>
                    {c.phone ? (
                      <Text className="text-xs text-slate-400 dark:text-slate-500 font-mono mt-0.5">{c.phone}</Text>
                    ) : null}
                  </View>
                  <Text className="text-xs font-mono font-bold text-slate-550 dark:text-slate-400">
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
