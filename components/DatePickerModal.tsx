import React, { useState, useMemo, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import { SymbolView } from 'expo-symbols';
import { useColorScheme } from './useColorScheme';
import Colors from '../constants/Colors';
import { GlassView } from './GlassView';

interface DatePickerModalProps {
  visible: boolean;
  value: string; // YYYY-MM-DD
  onChange: (dateStr: string) => void;
  onClose: () => void;
}

export function DatePickerModal({ visible, value, onChange, onClose }: DatePickerModalProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  // Parse initial value YYYY-MM-DD
  const initialDate = useMemo(() => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      const parsed = new Date(y, m - 1, d);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return new Date();
  }, [value]);

  // Keep track of the currently viewed month & year
  const [viewedDate, setViewedDate] = useState(initialDate);
  // Keep track of the temporarily selected date
  const [selectedDate, setSelectedDate] = useState(initialDate);

  // Sync state with props when modal opens
  useEffect(() => {
    if (visible) {
      setViewedDate(initialDate);
      setSelectedDate(initialDate);
    }
  }, [visible, initialDate]);

  const year = viewedDate.getFullYear();
  const month = viewedDate.getMonth(); // 0-indexed

  // Helper to change month
  const handlePrevMonth = () => {
    setViewedDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setViewedDate(new Date(year, month + 1, 1));
  };

  // Build grid days
  const calendarDays = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const startDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sunday, 1 = Monday...

    const list: (number | null)[] = [];
    // Pad days from start week
    for (let i = 0; i < startDayOfWeek; i++) {
      list.push(null);
    }
    // Month days
    for (let d = 1; d <= daysInMonth; d++) {
      list.push(d);
    }
    return list;
  }, [year, month]);

  const handleDaySelect = (day: number) => {
    setSelectedDate(new Date(year, month, day));
  };

  const handleConfirm = () => {
    const y = selectedDate.getFullYear();
    const m = String(selectedDate.getMonth() + 1).padStart(2, '0');
    const d = String(selectedDate.getDate()).padStart(2, '0');
    onChange(`${y}-${m}-${d}`);
    onClose();
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const weekdayLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.cardContainer} pointerEvents="box-none">
          <GlassView style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]} borderRadius={28}>
            {/* Header: Month / Year selection */}
            <View style={styles.header}>
              <TouchableOpacity onPress={handlePrevMonth} style={styles.navBtn}>
                <SymbolView
                  name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
                  tintColor={colors.tint}
                  size={20}
                />
              </TouchableOpacity>

              <Text style={[styles.monthLabel, { color: colors.text }]}>
                {monthNames[month]} {year}
              </Text>

              <TouchableOpacity onPress={handleNextMonth} style={styles.navBtn}>
                <SymbolView
                  name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }}
                  tintColor={colors.tint}
                  size={20}
                />
              </TouchableOpacity>
            </View>

            {/* Weekday headers */}
            <View style={styles.weekdaysRow}>
              {weekdayLabels.map((label) => (
                <Text key={label} style={[styles.weekdayText, { color: colors.tabIconDefault }]}>
                  {label}
                </Text>
              ))}
            </View>

            {/* Days Grid */}
            <View style={styles.daysGrid}>
              {calendarDays.map((day, index) => {
                const isSelected =
                  day !== null &&
                  selectedDate.getDate() === day &&
                  selectedDate.getMonth() === month &&
                  selectedDate.getFullYear() === year;

                return (
                  <View key={index} style={styles.dayCellWrapper}>
                    {day !== null ? (
                      <TouchableOpacity
                        onPress={() => handleDaySelect(day)}
                        style={[
                          styles.dayButton,
                          isSelected && { backgroundColor: colors.tint }
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            { color: colors.text },
                            isSelected && { color: '#FFFFFF', fontWeight: '800' }
                          ]}
                        >
                          {day}
                        </Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.emptyCell} />
                    )}
                  </View>
                );
              })}
            </View>

            {/* Action Buttons */}
            <View style={[styles.actionsRow, { borderTopColor: colors.border }]}>
              <TouchableOpacity onPress={onClose} style={[styles.actionBtn, styles.cancelBtn]}>
                <Text style={[styles.actionBtnText, { color: colors.tabIconDefault }]}>
                  Cancel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handleConfirm} style={[styles.actionBtn, styles.confirmBtn, { backgroundColor: colors.tint }]}>
                <Text style={[styles.actionBtnText, { color: '#FFFFFF' }]}>
                  Select
                </Text>
              </TouchableOpacity>
            </View>
          </GlassView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardContainer: {
    width: '90%',
    maxWidth: 340,
  },
  card: {
    padding: 20,
    alignItems: 'center',
    width: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    marginBottom: 20,
  },
  navBtn: {
    padding: 8,
  },
  monthLabel: {
    fontSize: 16,
    fontWeight: '800',
  },
  weekdaysRow: {
    flexDirection: 'row',
    width: '100%',
    marginBottom: 10,
  },
  weekdayText: {
    width: '14.28%',
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    width: '100%',
    marginBottom: 20,
  },
  dayCellWrapper: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  dayButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyCell: {
    width: 32,
    height: 32,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    width: '100%',
    borderTopWidth: 1,
    paddingTop: 16,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    marginLeft: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  cancelBtn: {
    backgroundColor: 'transparent',
  },
  confirmBtn: {
    elevation: 2,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
