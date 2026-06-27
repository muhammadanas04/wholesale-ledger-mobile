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
  StyleSheet,
  Platform,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { FlashList } from '@shopify/flash-list';
import Toast from 'react-native-toast-message';
import * as Clipboard from 'expo-clipboard';
import * as Crypto from 'expo-crypto';
import { Q } from '@nozbe/watermelondb';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

import { database } from '../../../db';
import Driver from '../../../db/models/Driver';
import { useQuery } from '../../../db/hooks';
import { runSync } from '../../../lib/sync';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';
import { GlassView } from '../../../components/GlassView';
import { ScreenBackground } from '../../../components/ScreenBackground';

// Row Item component
const DriverRow = React.memo(({ item, onToggleActive }: { item: Driver; onToggleActive: (driver: Driver) => void }) => {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const isActive = item.active === 1;

  return (
    <GlassView
      style={[
        styles.row,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }
      ]}
      borderRadius={20}
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.nameText, { color: colors.text }]} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.metaRow}>
          <Text style={[styles.phoneText, { color: colors.tabIconDefault }]}>
            {item.phone}
          </Text>
          <View style={[styles.dot, { backgroundColor: colors.border }]} />
          <View style={[styles.statusBadge, { backgroundColor: isActive ? (colorScheme === 'dark' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(209, 250, 229, 0.6)') : (colorScheme === 'dark' ? 'rgba(100, 116, 139, 0.15)' : 'rgba(241, 245, 249, 0.6)') }]}>
            <Text style={[styles.statusBadgeText, { color: isActive ? colors.success : colors.tabIconDefault }]}>
              {isActive ? 'Active' : 'Inactive'}
            </Text>
          </View>
        </View>
      </View>

      <TouchableOpacity
        onPress={() => onToggleActive(item)}
        style={[
          styles.actionBtn,
          { 
            borderColor: isActive ? colors.border : colors.tint,
            backgroundColor: isActive ? 'transparent' : (colorScheme === 'dark' ? 'rgba(45, 212, 191, 0.12)' : 'rgba(13, 148, 136, 0.06)'),
          }
        ]}
      >
        <Text style={[styles.actionBtnText, { color: isActive ? colors.tabIconDefault : colors.tint }]}>
          {isActive ? 'Deactivate' : 'Activate'}
        </Text>
      </TouchableOpacity>
    </GlassView>
  );
});

export default function DriversScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

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
      const randomInt = Crypto.getRandomBytes(4).reduce((acc, val) => (acc << 8) | val, 0) >>> 0;
      const otpCode = (100000 + (randomInt % 900000)).toString();
      const timestamp = new Date().toISOString();
      const formattedName = driverName.trim() || 'Unnamed Driver';

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

      setDriverName('');
      setDriverPhone('');
      setAddModalVisible(false);

      setCreatedDriverName(formattedName);
      setCreatedOtp(otpCode);
      setOtpModalVisible(true);

      Toast.show({
        type: 'success',
        text1: 'Driver Registered',
        text2: `${formattedName} created successfully.`,
      });

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

  const renderItem = useCallback(({ item }: { item: Driver }) => {
    return <DriverRow item={item} onToggleActive={handleToggleActive} />;
  }, [handleToggleActive]);

  return (
    <ScreenBackground>
      {/* Set padding top for safe area in custom stack headers */}
      <View style={styles.rootContainer}>
        {/* Drivers List */}
        <FlashList
          data={drivers}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          estimatedItemSize={76}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.tint} />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <SymbolView
                name={{ ios: 'person.badge.plus', android: 'person_add', web: 'person_add' }}
                tintColor={colors.tabIconDefault}
                size={48}
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No Registered Drivers
              </Text>
              <Text style={[styles.emptySub, { color: colors.tabIconDefault }]}>
                Register new delivery drivers using the plus button or pull down to sync.
              </Text>
            </View>
          }
        />

        {/* Floating Action Button */}
        <TouchableOpacity
          onPress={() => setAddModalVisible(true)}
          style={[
            styles.fabContainer,
            { 
              bottom: Platform.OS === 'ios' ? insets.bottom + 110 : 110 
            }
          ]}
          activeOpacity={0.85}
        >
          <LinearGradient
            colors={colorScheme === 'dark' ? ['#2DD4BF', '#0D9488'] : ['#14B8A6', '#0D9488']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <SymbolView
              name={{ ios: 'person.badge.plus.fill', android: 'person_add', web: 'person_add' }}
              tintColor="#FFFFFF"
              size={18}
            />
            <Text style={styles.fabText}>Add Driver</Text>
          </LinearGradient>
        </TouchableOpacity>

        {/* ----------------- REGISTER DRIVER MODAL ----------------- */}
        <Modal visible={addModalVisible} animationType="slide" transparent>
          <View style={styles.modalOverlay}>
            <GlassView style={styles.modalContent} intensity={Platform.OS === 'ios' ? 40 : 0} borderRadius={28}>
              <View style={styles.modalHeader}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>Register Driver</Text>
                <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.modalCloseBtn}>
                  <SymbolView
                    name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
                    tintColor={colors.tabIconDefault}
                    size={22}
                  />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalScroll}>
                {/* Driver Name Input */}
                <View style={styles.inputField}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>
                    Driver Name (Optional)
                  </Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                    placeholder="Enter full name"
                    placeholderTextColor={colors.tabIconDefault}
                    value={driverName}
                    onChangeText={setDriverName}
                    autoCorrect={false}
                  />
                </View>

                {/* Driver Phone Input */}
                <View style={styles.inputField}>
                  <Text style={[styles.inputLabel, { color: colors.text }]}>
                    Phone Number (Required) *
                  </Text>
                  <TextInput
                    style={[styles.textInput, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }]}
                    placeholder="10-digit mobile number"
                    placeholderTextColor={colors.tabIconDefault}
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
                  style={[styles.modalSubmitBtn, { backgroundColor: colors.tint }]}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.modalSubmitBtnText}>Register Account</Text>
                  )}
                </TouchableOpacity>
              </ScrollView>
            </GlassView>
          </View>
        </Modal>

        {/* ----------------- OTP SUCCESS DISPLAY MODAL ----------------- */}
        <Modal visible={otpModalVisible} animationType="fade" transparent>
          <View style={styles.otpOverlay}>
            <GlassView style={styles.otpContent} intensity={Platform.OS === 'ios' ? 40 : 0} borderRadius={28}>
              <View style={[styles.otpIconBox, { backgroundColor: colorScheme === 'dark' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(209, 250, 229, 0.6)' }]}>
                <SymbolView
                  name={{ ios: 'checkmark.shield.fill', android: 'check_circle', web: 'check_circle' }}
                  tintColor={colors.success}
                  size={24}
                />
              </View>

              <Text style={[styles.otpTitle, { color: colors.text }]}>
                Account Created Successfully
              </Text>
              <Text style={[styles.otpSub, { color: colors.tabIconDefault }]}>
                Registered credentials for {createdDriverName}
              </Text>

              {/* OTP Large display container */}
              <View style={[styles.otpCodeContainer, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.otpCodeText, { color: colors.text }]}>
                  {createdOtp}
                </Text>
              </View>

              <TouchableOpacity
                onPress={handleCopyOtp}
                style={styles.copyOtpBtn}
              >
                <SymbolView
                  name={{ ios: 'doc.on.doc.fill', android: 'content_copy', web: 'content_copy' }}
                  tintColor={colors.tint}
                  size={14}
                />
                <Text style={[styles.copyOtpText, { color: colors.tint }]}>
                  Copy OTP Code
                </Text>
              </TouchableOpacity>

              <Text style={[styles.otpWarningText, { color: colors.danger }]}>
                * Note: Share this code with the driver. For safety reasons, it will not be displayed again once you close this.
              </Text>

              <TouchableOpacity
                onPress={() => setOtpModalVisible(false)}
                style={[styles.otpDoneBtn, { backgroundColor: colors.text }]}
              >
                <Text style={[styles.otpDoneBtnText, { color: colors.background }]}>
                  Done
                </Text>
              </TouchableOpacity>
            </GlassView>
          </View>
        </Modal>
      </View>
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 110, // clear floating tab dock
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 8,
  },
  rowLeft: {
    flex: 1,
    paddingRight: 10,
  },
  nameText: {
    fontSize: 14,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  phoneText: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    marginHorizontal: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  statusBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 84,
  },
  actionBtnText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 20,
    height: 54,
    width: 54,
    borderRadius: 27,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabContainer: {
    position: 'absolute',
    right: 20,
    height: 54,
    width: 140,
    borderRadius: 27,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
    zIndex: 99,
    overflow: 'hidden',
  },
  fabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    width: '100%',
    paddingHorizontal: 16,
    gap: 8,
  },
  fabText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    width: '100%',
    padding: 20,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  modalCloseBtn: {
    padding: 2,
  },
  modalScroll: {
    marginBottom: 8,
  },
  inputField: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  textInput: {
    height: 44,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  modalSubmitBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  modalSubmitBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  otpOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  otpContent: {
    width: '100%',
    maxWidth: 320,
    padding: 24,
    alignItems: 'center',
  },
  otpIconBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  otpTitle: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
  },
  otpSub: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 20,
  },
  otpCodeContainer: {
    borderWidth: 1,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 24,
    width: '100%',
    alignItems: 'center',
    marginBottom: 4,
  },
  otpCodeText: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    letterSpacing: 2,
  },
  copyOtpBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 16,
  },
  copyOtpText: {
    fontSize: 11,
    fontWeight: '700',
    marginLeft: 6,
  },
  otpWarningText: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 13,
  },
  otpDoneBtn: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpDoneBtnText: {
    fontWeight: '800',
    fontSize: 13,
  },
});
