import React, { useState, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  FlatList,
  Alert,
  Platform,
  Linking,
  SafeAreaView,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import * as Clipboard from 'expo-clipboard';
import Toast from 'react-native-toast-message';

import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';
import { GlassView } from '@/components/GlassView';
import { database } from '@/db';
import TmpRecord from '@/db/models/TmpRecord';
import { useAppStore } from '@/store/app';
import { formatCurrency } from '@/lib/utils';
import AddTmpRecordModal from './AddTmpRecordModal';

interface TmpRecordsViewerModalProps {
  visible: boolean;
  onClose: () => void;
  records: TmpRecord[];
}

export default function TmpRecordsViewerModal({
  visible,
  onClose,
  records,
}: TmpRecordsViewerModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];
  const { shopName } = useAppStore();

  const [filter, setFilter] = useState<'all' | 'sale' | 'payment' | 'other'>('all');
  const [editingRecord, setEditingRecord] = useState<TmpRecord | null>(null);

  // Filter records
  const filteredRecords = useMemo(() => {
    if (filter === 'all') return records;
    return records.filter((r) => r.type === filter);
  }, [records, filter]);

  // Build share text
  const buildMessage = (record: TmpRecord): string => {
    switch (record.type) {
      case 'sale': {
        const parts = [`${shopName} - Order booked:`];
        if (record.weight) parts.push(`${record.weight}kg`);
        if (record.totalValue) parts.push(`₹${(record.totalValue / 100).toLocaleString('en-IN')}`);
        if (record.customerName) parts.push(`for ${record.customerName}`);
        return parts.join(' ');
      }
      case 'payment': {
        const amt = record.totalValue
          ? `₹${(record.totalValue / 100).toLocaleString('en-IN')}`
          : '';
        return `${shopName} - Payment received: ${amt} from ${record.customerName || 'Customer'}`;
      }
      case 'other': {
        const amt = record.amount
          ? `₹${(record.amount / 100).toLocaleString('en-IN')}`
          : '';
        const reason = record.reason ? ` (${record.reason})` : '';
        return `${shopName} - Expense: ${amt}${reason}`;
      }
      default:
        return '';
    }
  };

  const handleCopy = async (record: TmpRecord) => {
    const message = buildMessage(record);
    await Clipboard.setStringAsync(message);
    Toast.show({
      type: 'success',
      text1: 'Copied to Clipboard',
      text2: 'Message copied successfully.',
    });
  };

  const handleSMS = async (record: TmpRecord) => {
    const message = buildMessage(record);
    const encodedBody = encodeURIComponent(message);
    
    let smsUrl = `sms:?body=${encodedBody}`;
    if (record.customerPhone) {
      // Strip spaces/hyphens
      const cleanPhone = record.customerPhone.replace(/[^0-9+]/g, '');
      smsUrl = `sms:${cleanPhone}?body=${encodedBody}`;
    }

    try {
      const canOpen = await Linking.canOpenURL('sms:');
      if (canOpen) {
        await Linking.openURL(smsUrl);
      } else {
        throw new Error('SMS app not available');
      }
    } catch (err) {
      // Fallback to clipboard
      await Clipboard.setStringAsync(message);
      Toast.show({
        type: 'info',
        text1: 'SMS Not Available',
        text2: 'Copied statement text to clipboard instead.',
      });
    }
  };

  const handleDelete = (record: TmpRecord) => {
    Alert.alert(
      'Delete Record',
      'Are you sure you want to permanently delete this temporary record? This will not affect ledger balances.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await database.write(async () => {
                await record.destroyPermanently();
              });
              Toast.show({
                type: 'success',
                text1: 'Record Deleted',
                text2: 'Temporary record deleted from device.',
              });
            } catch (e) {
              console.error('Failed to delete temporary record:', e);
              Toast.show({
                type: 'error',
                text1: 'Delete Failed',
                text2: 'Unable to remove record.',
              });
            }
          },
        },
      ]
    );
  };

  const formatDate = (dateStr: string) => {
    try {
      const [year, month, day] = dateStr.split('-');
      const d = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const renderItem = ({ item }: { item: TmpRecord }) => {
    let typeBgColor = 'rgba(56, 189, 248, 0.15)'; // sale: blue
    let typeTextColor = colors.accent;
    let typeText = 'SALE';

    if (item.type === 'payment') {
      typeBgColor = 'rgba(52, 211, 153, 0.15)'; // payment: green
      typeTextColor = colors.success;
      typeText = 'PAYMENT';
    } else if (item.type === 'other') {
      typeBgColor = 'rgba(251, 146, 60, 0.15)'; // other: orange
      typeTextColor = colors.warning;
      typeText = 'OTHER';
    }

    const secondaryTextParts = [];
    if (item.type === 'sale') {
      if (item.qty) secondaryTextParts.push(`${item.qty} items`);
      if (item.weight) secondaryTextParts.push(`${item.weight} kg`);
      if (item.rate) secondaryTextParts.push(`₹${item.rate / 100}/kg`);
    }

    return (
      <GlassView style={styles.card} borderRadius={18}>
        {/* Top Info Header */}
        <View style={styles.cardHeader}>
          <View style={[styles.typeBadge, { backgroundColor: typeBgColor }]}>
            <Text style={[styles.typeBadgeText, { color: typeTextColor }]}>
              {typeText}
            </Text>
          </View>
          <Text style={[styles.dateText, { color: colors.tabIconDefault }]}>
            {formatDate(item.date)}
          </Text>
        </View>

        {/* Primary Content (Customer Name or Reason) */}
        <Text style={[styles.primaryText, { color: colors.text }]} numberOfLines={2}>
          {item.type === 'other' ? item.reason : item.customerName}
        </Text>

        {/* Secondary Info Line (Sale metrics) */}
        {secondaryTextParts.length > 0 && (
          <Text style={[styles.secondaryText, { color: colors.tabIconDefault }]}>
            {secondaryTextParts.join('  ·  ')}
          </Text>
        )}

        {/* Amounts Line */}
        <View style={[styles.amountRow, { borderBottomColor: colors.border }]}>
          {item.type !== 'other' ? (
            <>
              {item.discount ? (
                <Text style={[styles.amountText, { color: colors.tabIconDefault }]}>
                  Disc: ₹{item.discount / 100}
                </Text>
              ) : null}
              <Text style={[styles.amountText, { color: colors.text, fontWeight: '700' }]}>
                Total: {formatCurrency(item.totalValue || 0)}
              </Text>
            </>
          ) : (
            <Text style={[styles.amountText, { color: colors.text, fontWeight: '700' }]}>
              Spent: {formatCurrency(item.amount || 0)}
            </Text>
          )}
        </View>

        {/* Action Buttons Console */}
        <View style={styles.actionsConsole}>
          {/* Delete */}
          <TouchableOpacity onPress={() => handleDelete(item)} style={styles.consoleBtn}>
            <SymbolView
              name={{ ios: 'trash.fill', android: 'delete', web: 'delete' }}
              tintColor={colors.danger}
              size={18}
            />
            <Text style={[styles.consoleBtnText, { color: colors.danger }]}>Delete</Text>
          </TouchableOpacity>

          {/* Edit */}
          <TouchableOpacity onPress={() => setEditingRecord(item)} style={styles.consoleBtn}>
            <SymbolView
              name={{ ios: 'pencil', android: 'edit', web: 'edit' }}
              tintColor={colors.tint}
              size={18}
            />
            <Text style={[styles.consoleBtnText, { color: colors.tint }]}>Edit</Text>
          </TouchableOpacity>

          {/* Copy */}
          <TouchableOpacity onPress={() => handleCopy(item)} style={styles.consoleBtn}>
            <SymbolView
              name={{ ios: 'doc.on.doc.fill', android: 'content_copy', web: 'content_copy' }}
              tintColor={colors.text}
              size={18}
            />
            <Text style={[styles.consoleBtnText, { color: colors.text }]}>Copy</Text>
          </TouchableOpacity>

          {/* SMS */}
          <TouchableOpacity onPress={() => handleSMS(item)} style={styles.consoleBtn}>
            <SymbolView
              name={{ ios: 'message.fill', android: 'sms', web: 'sms' }}
              tintColor={colors.success}
              size={18}
            />
            <Text style={[styles.consoleBtnText, { color: colors.success }]}>SMS</Text>
          </TouchableOpacity>
        </View>
      </GlassView>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
    >
      <SafeAreaView style={[styles.modalSafeArea, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            Temporary Records
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <SymbolView
              name={{ ios: 'xmark.circle.fill', android: 'close', web: 'close' }}
              tintColor={colors.tabIconDefault}
              size={22}
            />
          </TouchableOpacity>
        </View>

        {/* Filters pills */}
        <View style={styles.filterWrapper}>
          <View style={[styles.filterContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            {(['all', 'sale', 'payment', 'other'] as const).map((f) => {
              const isActive = filter === f;
              return (
                <TouchableOpacity
                  key={f}
                  onPress={() => setFilter(f)}
                  style={[
                    styles.filterPill,
                    isActive && {
                      backgroundColor: colors.tint,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.filterText,
                      {
                        color: isActive ? '#FFFFFF' : colors.tabIconDefault,
                        fontWeight: isActive ? '700' : '600',
                      },
                    ]}
                  >
                    {f.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* FlatList of Cards */}
        <FlatList
          data={filteredRecords}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <SymbolView
                name={{ ios: 'clock.badge.fill', android: 'schedule', web: 'schedule' }}
                tintColor={colors.tabIconDefault}
                size={42}
              />
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                No temporary records yet
              </Text>
              <Text style={[styles.emptySub, { color: colors.tabIconDefault }]}>
                Tap "+ Add Record" on the dashboard to create your first one.
              </Text>
            </View>
          }
        />

        {/* Embedded edit modal */}
        <AddTmpRecordModal
          visible={!!editingRecord}
          onClose={() => setEditingRecord(null)}
          editRecord={editingRecord}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalSafeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    padding: 4,
  },
  filterWrapper: {
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  filterContainer: {
    flexDirection: 'row',
    borderRadius: 14,
    borderWidth: 1,
    padding: 4,
  },
  filterPill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
  },
  filterText: {
    fontSize: 10,
    letterSpacing: 0.5,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
  },
  card: {
    padding: 16,
    marginBottom: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  typeBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  dateText: {
    fontSize: 10,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  primaryText: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 6,
  },
  secondaryText: {
    fontSize: 11,
    fontWeight: '500',
    marginBottom: 10,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    borderBottomWidth: 1,
    paddingBottom: 10,
    marginBottom: 10,
    gap: 16,
  },
  amountText: {
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  actionsConsole: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  consoleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 6,
  },
  consoleBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
    marginTop: 12,
  },
  emptySub: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
});
