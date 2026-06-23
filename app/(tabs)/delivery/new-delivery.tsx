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
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import Toast from 'react-native-toast-message';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { database } from '../../../db';
import Driver from '../../../db/models/Driver';
import Customer from '../../../db/models/Customer';
import Delivery from '../../../db/models/Delivery';
import DeliveryItem from '../../../db/models/DeliveryItem';
import { useQuery } from '../../../db/hooks';
import { formatCurrency } from '../../../lib/utils';
import { runSync } from '../../../lib/sync';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';

interface StopItem {
  id: string;
  address: string;
  stockAmount: string;
  qtyStr: string;
  selectedCustomer: Customer | null;
}

export default function NewDeliveryScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

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
      qtyStr: '',
      selectedCustomer: null,
    };
    setStops((prev) => [...prev, newStop]);
  };

  const handleUpdateStop = (id: string, field: 'address' | 'stockAmount' | 'qtyStr', value: string) => {
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
        text2: 'Please add at least one stop.',
      });
      return;
    }

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
            delItem.qty = parseFloat(stop.qtyStr) || 0;
            delItem.status = 'pending';
            delItem.customerId = stop.selectedCustomer?.id || undefined;
            delItem.customerName = stop.selectedCustomer?.name || undefined;
            delItem.customerPhone = stop.selectedCustomer?.phone || undefined;
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
    <ScreenBackground>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.scrollContent} style={styles.scrollView}>
          
          {/* Driver Selection Card */}
          <GlassView style={styles.card}>
            <Text style={[styles.cardSub, { color: colors.tabIconDefault }]}>
              Assigned Driver *
            </Text>

            {selectedDriver ? (
              <View style={styles.headerRow}>
                <View style={styles.textContainer}>
                  <Text style={[styles.driverName, { color: colors.text }]}>
                    {selectedDriver.name}
                  </Text>
                  <Text style={[styles.driverPhone, { color: colors.tabIconDefault }]}>
                    {selectedDriver.phone}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setDriverModalVisible(true)}
                  style={[styles.changeBtn, { borderColor: colors.border }]}
                >
                  <Text style={[styles.changeBtnText, { color: colors.tint }]}>
                    Change
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setDriverModalVisible(true)}
                style={[styles.chooseBtn, { borderColor: colors.border }]}
              >
                <SymbolView
                  name={{ ios: 'person.badge.plus.fill', android: 'person_add', web: 'person_add' }}
                  tintColor={colors.tint}
                  size={20}
                />
                <Text style={[styles.chooseBtnText, { color: colors.tint }]}>
                  Choose Driver
                </Text>
              </TouchableOpacity>
            )}
          </GlassView>

          {/* General Delivery Notes Card */}
          <GlassView style={styles.card}>
            <Text style={[styles.inputLabel, { color: colors.text }]}>
              Delivery Notes (Optional)
            </Text>
            <TextInput
              style={[styles.notesInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
              placeholder="E.g., route directions, key handover remarks..."
              placeholderTextColor={colors.tabIconDefault}
              value={deliveryNotes}
              onChangeText={setDeliveryNotes}
              multiline
              autoCapitalize="sentences"
            />
          </GlassView>

          {/* Stops/Tasks List Card */}
          <GlassView style={styles.card}>
            <View style={styles.itemsHeader}>
              <Text style={[styles.itemsTitle, { color: colors.text }]}>
                Route Stops
              </Text>
              <TouchableOpacity
                onPress={handleAddStop}
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
                  Add Stop
                </Text>
              </TouchableOpacity>
            </View>

            {stops.length === 0 ? (
              <View style={[styles.emptyStopsContainer, { borderTopColor: colors.border }]}>
                <SymbolView
                  name={{ ios: 'mappin.and.ellipse', android: 'add_location', web: 'add_location' }}
                  tintColor={colors.tabIconDefault}
                  size={36}
                />
                <Text style={[styles.emptyStopsText, { color: colors.tabIconDefault }]}>
                  Add stops to plan the delivery layout stop-by-stop.
                </Text>
              </View>
            ) : (
              <View style={[styles.stopsListContainer, { borderTopColor: colors.border }]}>
                {stops.map((stop, index) => (
                  <View
                    key={stop.id}
                    style={[styles.stopBlock, { backgroundColor: colors.background, borderColor: colors.border }]}
                  >
                    <View style={styles.stopHeader}>
                      <Text style={[styles.stopTitle, { color: colors.tabIconDefault }]}>
                        STOP #{index + 1}
                      </Text>
                      <TouchableOpacity
                        onPress={() => handleRemoveStop(stop.id)}
                        style={styles.deleteBtn}
                      >
                        <SymbolView
                          name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }}
                          tintColor={colors.danger}
                          size={16}
                        />
                      </TouchableOpacity>
                    </View>

                    {/* Stop Address */}
                    <View style={styles.stopInputGroup}>
                      <Text style={[styles.stopInputLabel, { color: colors.tabIconDefault }]}>
                        Delivery Address *
                      </Text>
                      <TextInput
                        style={[styles.stopInput, { backgroundColor: colors.surfaceSolid, color: colors.text, borderColor: colors.border }]}
                        placeholder="Enter destination address"
                        placeholderTextColor={colors.tabIconDefault}
                        value={stop.address}
                        onChangeText={(val) => handleUpdateStop(stop.id, 'address', val)}
                      />
                    </View>

                    {/* Stock Description & Qty */}
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                      <View style={{ flex: 2 }}>
                        <Text style={[styles.stopInputLabel, { color: colors.tabIconDefault }]}>
                          Stock Details *
                        </Text>
                        <TextInput
                          style={[styles.stopInput, { backgroundColor: colors.surfaceSolid, color: colors.text, borderColor: colors.border }]}
                          placeholder="E.g., 5 bags Rice"
                          placeholderTextColor={colors.tabIconDefault}
                          value={stop.stockAmount}
                          onChangeText={(val) => handleUpdateStop(stop.id, 'stockAmount', val)}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={[styles.stopInputLabel, { color: colors.tabIconDefault }]}>
                          Qty (Optional)
                        </Text>
                        <TextInput
                          style={[styles.stopInput, { backgroundColor: colors.surfaceSolid, color: colors.text, borderColor: colors.border }]}
                          placeholder="0"
                          placeholderTextColor={colors.tabIconDefault}
                          value={stop.qtyStr}
                          onChangeText={(val) => handleUpdateStop(stop.id, 'qtyStr', val)}
                          keyboardType="numeric"
                        />
                      </View>
                    </View>

                    {/* Client Association */}
                    <View style={[styles.linkContainer, { borderTopColor: colors.border }]}>
                      {stop.selectedCustomer ? (
                        <View style={styles.linkHeader}>
                          <View style={styles.linkedTextContainer}>
                            <Text style={[styles.stopInputLabel, { color: colors.tabIconDefault }]}>
                              Linked Client
                            </Text>
                            <Text style={[styles.linkedCustomerName, { color: colors.text }]} numberOfLines={1}>
                              {stop.selectedCustomer.name}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleUnlinkCustomer(stop.id)}
                            style={styles.unlinkBtn}
                          >
                            <Text style={[styles.unlinkBtnText, { color: colors.danger }]}>
                              Unlink
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <TouchableOpacity
                          onPress={() => handleOpenCustomerModal(stop.id)}
                          style={styles.linkCustomerBtn}
                        >
                          <SymbolView
                            name={{ ios: 'link.badge.plus', android: 'link', web: 'link' }}
                            tintColor={colors.tint}
                            size={14}
                          />
                          <Text style={[styles.linkCustomerBtnText, { color: colors.tint }]}>
                            Link Customer Account
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
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
                Planned Route
              </Text>
              <Text style={[styles.footerValue, { color: colors.text }]}>
                {stops.length} Stops
              </Text>
            </View>

            <TouchableOpacity
              style={[
                styles.saveBtn,
                (!selectedDriver || stops.length === 0 || saving)
                  ? { backgroundColor: colorScheme === 'dark' ? '#334155' : '#CBD5E1' }
                  : { backgroundColor: colors.tint }
              ]}
              onPress={handleSaveDelivery}
              disabled={!selectedDriver || stops.length === 0 || saving}
            >
              {saving ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.saveBtnText}>Send to Driver</Text>
              )}
            </TouchableOpacity>
          </View>
        </GlassView>

        {/* ----------------- DRIVER SELECTOR MODAL ----------------- */}
        <Modal 
          visible={driverModalVisible} 
          animationType="slide"
          onRequestClose={() => { setDriverModalVisible(false); setDriverSearch(''); }}
        >
          <ScreenBackground>
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Select Active Driver</Text>
                <TouchableOpacity onPress={() => { setDriverModalVisible(false); setDriverSearch(''); }} style={styles.modalCloseBtn}>
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
                    placeholder="Search by name or phone..."
                    placeholderTextColor={colors.tabIconDefault}
                    value={driverSearch}
                    onChangeText={setDriverSearch}
                    autoCorrect={false}
                  />
                </View>
              </View>

              <FlatList
                style={styles.modalList}
                data={activeDrivers}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedDriver(item);
                      setDriverModalVisible(false);
                      setDriverSearch('');
                    }}
                    style={[styles.modalListItem, { borderBottomColor: colors.border }]}
                  >
                    <View style={styles.modalListLeft}>
                      <Text style={[styles.modalItemName, { color: colors.text }]}>{item.name}</Text>
                      <Text style={[styles.modalItemPhone, { color: colors.tabIconDefault }]}>{item.phone}</Text>
                    </View>
                    <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} tintColor={colors.tabIconDefault} size={14} />
                  </TouchableOpacity>
                )}
                ListEmptyComponent={
                  <View style={styles.modalEmpty}>
                    <Text style={{ color: colors.tabIconDefault }}>No active drivers found.</Text>
                  </View>
                }
              />
            </SafeAreaView>
          </ScreenBackground>
        </Modal>

        {/* ----------------- CUSTOMER SELECTOR MODAL ----------------- */}
        <Modal 
          visible={customerModalVisible} 
          animationType="slide"
          onRequestClose={() => { setCustomerModalVisible(false); setCustomerSearch(''); setTargetStopId(null); }}
        >
          <ScreenBackground>
            <SafeAreaView style={styles.modalSafeArea}>
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Link Customer Account</Text>
                <TouchableOpacity onPress={() => { setCustomerModalVisible(false); setCustomerSearch(''); setTargetStopId(null); }} style={styles.modalCloseBtn}>
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
                    onPress={() => handleLinkCustomer(item)}
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
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  textContainer: {
    flex: 1,
    paddingRight: 16,
  },
  driverName: {
    fontSize: 18,
    fontWeight: '800',
  },
  driverPhone: {
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
  inputLabel: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  notesInput: {
    minHeight: 60,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    textAlignVertical: 'top',
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
  emptyStopsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    borderTopWidth: 1,
    marginTop: 8,
  },
  emptyStopsText: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  stopsListContainer: {
    borderTopWidth: 1,
    paddingTop: 12,
  },
  stopBlock: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  stopHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  stopTitle: {
    fontSize: 10,
    fontWeight: '700',
  },
  deleteBtn: {
    padding: 2,
  },
  stopInputGroup: {
    marginBottom: 10,
  },
  stopInputLabel: {
    fontSize: 9,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  stopInput: {
    height: 38,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 12,
  },
  linkContainer: {
    borderTopWidth: 1,
    paddingTop: 10,
    marginTop: 4,
  },
  linkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkedTextContainer: {
    flex: 1,
    paddingRight: 10,
  },
  linkedCustomerName: {
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  unlinkBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  unlinkBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  linkCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  linkCustomerBtnText: {
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 6,
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
