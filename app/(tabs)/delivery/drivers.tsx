import React, { useState, useMemo, useCallback } from 'react';
import {
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  SafeAreaView,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { FlashList } from '@shopify/flash-list';
import Toast from 'react-native-toast-message';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';

import { database } from '../../../db';
import Driver from '../../../db/models/Driver';
import { useQuery } from '../../../db/hooks';
import { runSync } from '../../../lib/sync';

// Memoized Row Item component to allow FlashList optimal recycling
const DriverRow = React.memo(({ item, onToggleActive }: { item: Driver; onToggleActive: (driver: Driver) => void }) => {
  const isActive = item.active === 1;

  return (
    <View className="flex-row justify-between items-center bg-white dark:bg-slate-800 px-5 py-4 border-b border-slate-100 dark:border-slate-850">
      <View className="flex-1 pr-4">
        <Text className="text-base font-bold text-slate-900 dark:text-slate-50" numberOfLines={1}>
          {item.name}
        </Text>
        <View className="flex-row items-center mt-1">
          <Text className="text-slate-400 dark:text-slate-500 text-xs font-mono">
            {item.phone}
          </Text>
          <View className="h-1.5 w-1.5 rounded-full mx-2 bg-slate-300 dark:bg-slate-700" />
          <View className={`px-2 py-0.5 rounded-full ${isActive ? 'bg-emerald-50 dark:bg-emerald-950/40' : 'bg-slate-100 dark:bg-slate-900/60'}`}>
            <Text className={`text-[10px] font-bold uppercase ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
      </View>

      {/* 48x48dp Min Target Area Button */}
      <TouchableOpacity
        onPress={() => onToggleActive(item)}
        style={{ minWidth: 90, minHeight: 48 }}
        className={`px-3 py-2 border rounded-xl items-center justify-center active:scale-95 ${
          isActive
            ? 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
            : 'border-indigo-600 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-950/20'
        }`}
      >
        <Text className={`text-xs font-bold ${isActive ? 'text-slate-500 dark:text-slate-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
          {isActive ? 'Deactivate' : 'Activate'}
        </Text>
      </TouchableOpacity>
    </View>
  );
});

export default function DriversScreen() {
  const [refreshing, setRefreshing] = useState(false);
  
  // Registration Form Modal State
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [driverName, setDriverName] = useState('');
  const [driverPhone, setDriverPhone] = useState('');
  const [saving, setSaving] = useState(false);

  // OTP Display Modal State
  const [otpModalVisible, setOtpModalVisible] = useState(false);
  const [createdOtp, setCreatedOtp] = useState('');
  const [createdDriverName, setCreatedDriverName] = useState('');

  // 1. Query all drivers sorted by name
  const driversQuery = useMemo(() => {
    return database.collections.get<Driver>('drivers').query(Q.sortBy('name', Q.asc));
  }, []);

  const drivers = useQuery(driversQuery);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await runSync(database);
    } catch (e: any) {
      console.error('Drivers pull refresh failed:', e);
      Toast.show({
        type: 'error',
        text1: 'Sync Failed',
        text2: e.message || 'Could not connect to the sync server.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleRegisterDriver = async () => {
    // Validation
    const cleanPhone = driverPhone.replace(/\D/g, '');
    if (cleanPhone.length !== 10) {
      Toast.show({
        type: 'error',
        text1: 'Validation Error',
        text2: 'Phone number must be exactly 10 digits.',
      });
      return;
    }

    setSaving(true);
    try {
      // Uniqueness check
      const phoneExists = await database.collections
        .get<Driver>('drivers')
        .query(Q.where('phone', cleanPhone))
        .fetchCount();

      if (phoneExists > 0) {
        Toast.show({
          type: 'error',
          text1: 'Validation Error',
          text2: 'A driver with this phone number already exists.',
        });
        setSaving(false);
        return;
      }

      const driverId = Crypto.randomUUID();
      const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
      const timestamp = new Date().toISOString();
      const formattedName = driverName.trim() || 'Unnamed Driver';

      // Atomic DB write
      await database.write(async () => {
        await database.collections.get<Driver>('drivers').create((driver) => {
          driver._raw.id = driverId;
          driver.name = formattedName;
          driver.phone = cleanPhone;
          driver.otp = otpCode;
          driver.otpUsed = 0;
          driver.active = 1;
          driver.createdAt = timestamp;
          driver.updatedAt = timestamp;
          driver.synced = 0;
        });
      });

      // Clear Form
      setDriverName('');
      setDriverPhone('');
      setAddModalVisible(false);

      // Open OTP view
      setCreatedDriverName(formattedName);
      setCreatedOtp(otpCode);
      setOtpModalVisible(true);

      Toast.show({
        type: 'success',
        text1: 'Driver Registered',
        text2: `${formattedName} created successfully.`,
      });

      // Run sync in background
      runSync(database).catch((err) => {
        console.error('Post driver registration sync failed:', err);
      });
    } catch (e: any) {
      console.error('Failed to register driver:', e);
      Toast.show({
        type: 'error',
        text1: 'Save Failed',
        text2: e.message || 'Error occurred while registering driver.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = useCallback(async (driver: Driver) => {
    try {
      const nextActive = driver.active === 1 ? 0 : 1;
      const timestamp = new Date().toISOString();

      await database.write(async () => {
        await driver.update((d) => {
          d.active = nextActive;
          d.updatedAt = timestamp;
          d.synced = 0;
        });
      });

      Toast.show({
        type: 'success',
        text1: 'Status Updated',
        text2: `${driver.name} is now ${nextActive === 1 ? 'Active' : 'Inactive'}.`,
      });

      runSync(database).catch((err) => {
        console.error('Post status toggle sync failed:', err);
      });
    } catch (e: any) {
      console.error('Failed to toggle status:', e);
      Toast.show({
        type: 'error',
        text1: 'Update Failed',
        text2: e.message || 'Error updating status.',
      });
    }
  }, []);

  const handleCopyOtp = async () => {
    try {
      await Clipboard.setStringAsync(createdOtp);
      Toast.show({
        type: 'success',
        text1: 'Copied to Clipboard',
        text2: 'OTP copied to clipboard successfully!',
      });
    } catch (e) {
      Toast.show({
        type: 'error',
        text1: 'Copy Failed',
        text2: 'Failed to write to clipboard.',
      });
    }
  };

  // Stably defined renderItem using useCallback to optimize FlashList recycling
  const renderItem = useCallback(({ item }: { item: Driver }) => {
    return <DriverRow item={item} onToggleActive={handleToggleActive} />;
  }, [handleToggleActive]);

  return (
    <SafeAreaView className="flex-1 bg-slate-50 dark:bg-slate-900">
      
      {/* Drivers List */}
      <FlashList
        data={drivers}
        renderItem={renderItem}
        keyExtractor={(item) => item.id}
        estimatedItemSize={78}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#4F46E5" />
        }
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-20 px-8">
            <SymbolView
              name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
              tintColor="#CBD5E1"
              size={64}
            />
            <Text className="text-slate-700 dark:text-slate-300 font-bold text-lg mt-4 text-center">
              No Registered Drivers
            </Text>
            <Text className="text-slate-400 dark:text-slate-500 text-sm mt-1 text-center max-w-[260px]">
              Register new delivery drivers using the plus button or pull down to sync.
            </Text>
          </View>
        }
      />

      {/* Floating Action Button */}
      <TouchableOpacity
        onPress={() => setAddModalVisible(true)}
        className="absolute bottom-6 right-6 h-14 w-14 rounded-full bg-indigo-600 dark:bg-indigo-500 shadow-lg items-center justify-center active:scale-95"
        style={{ shadowColor: '#4F46E5', shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 }}
      >
        <SymbolView
          name={{ ios: 'plus', android: 'add', web: 'add' }}
          tintColor="#FFFFFF"
          size={24}
        />
      </TouchableOpacity>

      {/* ----------------- REGISTER DRIVER MODAL ----------------- */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View className="flex-1 justify-end bg-black/50">
          <View className="bg-white dark:bg-slate-800 rounded-t-3xl p-6 border-t border-slate-100 dark:border-slate-700/60 max-h-[90%]">
            <View className="flex-row justify-between items-center mb-5">
              <Text className="text-lg font-bold text-slate-900 dark:text-slate-50">Register Driver</Text>
              <TouchableOpacity onPress={() => setAddModalVisible(false)} className="p-1">
                <SymbolView
                  name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
                  tintColor="#94A3B8"
                  size={22}
                />
              </TouchableOpacity>
            </View>

            <ScrollView className="mb-4">
              {/* Driver Name Input */}
              <View className="mb-4">
                <Text className="text-slate-800 dark:text-slate-100 font-bold text-sm mb-2">
                  Driver Name (Optional)
                </Text>
                <TextInput
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm"
                  placeholder="Enter full name"
                  placeholderTextColor="#94A3B8"
                  value={driverName}
                  onChangeText={setDriverName}
                  autoCorrect={false}
                />
              </View>

              {/* Driver Phone Input */}
              <View className="mb-6">
                <Text className="text-slate-800 dark:text-slate-100 font-bold text-sm mb-2">
                  Phone Number (Required) *
                </Text>
                <TextInput
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-850 rounded-xl px-4 py-3 text-slate-900 dark:text-slate-50 text-sm font-mono"
                  placeholder="10-digit mobile number"
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={10}
                  value={driverPhone}
                  onChangeText={setDriverPhone}
                  autoCorrect={false}
                />
              </View>

              {/* Submit Button */}
              <TouchableOpacity
                onPress={handleRegisterDriver}
                disabled={saving}
                className="bg-indigo-600 dark:bg-indigo-500 py-3.5 rounded-xl justify-center items-center active:scale-[0.98] shadow-sm shadow-indigo-600/10"
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text className="text-white font-bold text-sm">Register Account</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ----------------- OTP SUCCESS DISPLAY MODAL ----------------- */}
      <Modal visible={otpModalVisible} animationType="fade" transparent>
        <View className="flex-1 justify-center items-center bg-black/60 px-6">
          <View className="bg-white dark:bg-slate-800 rounded-3xl p-6 border border-slate-100 dark:border-slate-700/60 w-full max-w-sm items-center">
            
            <View className="h-12 w-12 rounded-full bg-emerald-50 dark:bg-emerald-950/30 items-center justify-center mb-4">
              <SymbolView
                name={{ ios: 'checkmark.shield.fill', android: 'check_circle', web: 'check_circle' }}
                tintColor="#10B981"
                size={28}
              />
            </View>

            <Text className="text-base font-bold text-slate-900 dark:text-slate-50 text-center mb-1">
              Account Created Successfully
            </Text>
            <Text className="text-slate-400 dark:text-slate-500 text-xs text-center mb-6">
              Registered credentials for {createdDriverName}
            </Text>

            {/* OTP Large display container */}
            <View className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-855 rounded-2xl py-4 px-6 mb-2 flex-row items-center justify-center w-full">
              <Text className="text-3xl font-bold font-mono tracking-widest text-slate-800 dark:text-slate-100">
                {createdOtp}
              </Text>
            </View>

            <TouchableOpacity
              onPress={handleCopyOtp}
              className="flex-row items-center justify-center py-2 px-4 mb-6 active:scale-95"
            >
              <SymbolView
                name={{ ios: 'doc.on.doc.fill', android: 'content_copy', web: 'content_copy' }}
                tintColor="#4F46E5"
                size={14}
              />
              <Text className="text-indigo-600 dark:text-indigo-400 font-bold text-xs ml-1.5">
                Copy OTP Code
              </Text>
            </TouchableOpacity>

            <Text className="text-[10px] text-rose-500 font-bold text-center mb-6 max-w-[240px]">
              * Note: Share this code with the driver. For safety reasons, it will not be displayed again once you close this.
            </Text>

            <TouchableOpacity
              onPress={() => setOtpModalVisible(false)}
              className="bg-slate-900 dark:bg-slate-50 w-full py-3 rounded-xl justify-center items-center active:scale-[0.98]"
            >
              <Text className="text-white dark:text-slate-900 font-bold text-sm">
                Done
              </Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

    </SafeAreaView>
  );
}
