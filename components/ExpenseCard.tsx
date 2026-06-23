import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Platform } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { GlassView } from './GlassView';
import { useColorScheme } from './useColorScheme';
import Colors from '../constants/Colors';

export interface Expense {
  id: string;
  driver_id: string;
  driver_name?: string;
  category: string;
  amount: number;
  image_url: string;
  note: string;
  created_at: string;
}

interface ExpenseCardProps {
  expense: Expense;
  onImagePress: (url: string) => void;
}

export function ExpenseCard({ expense, onImagePress }: ExpenseCardProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const formattedDate = useMemo(() => {
    if (!expense.created_at) return '';
    try {
      const date = new Date(expense.created_at);
      return date.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }, [expense.created_at]);

  const formattedAmount = useMemo(() => {
    if (expense.category === 'defective_item') {
      return `${expense.amount}`;
    }
    return `₹${(expense.amount / 100).toFixed(2)}`;
  }, [expense.amount, expense.category]);

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'fuel':
        return 'fuelpump.fill';
      case 'maintenance':
        return 'wrench.and.screwdriver.fill';
      case 'challan':
        return 'doc.plaintext.fill';
      default:
        return 'creditcard.fill';
    }
  };

  return (
    <GlassView
      style={[styles.card, { borderColor: colors.border, backgroundColor: colors.surface }]}
      borderRadius={16}
    >
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={[styles.driverName, { color: colors.text }]} numberOfLines={1}>
            {expense.driver_name || 'Driver'}
          </Text>
          <Text style={[styles.date, { color: colors.tabIconDefault }]}>
            {formattedDate}
          </Text>
        </View>
        <Text style={[styles.amount, { color: colors.tint }]}>{formattedAmount}</Text>
      </View>

      <View style={styles.body}>
        <View style={styles.infoContainer}>
          <View style={styles.categoryRow}>
            <SymbolView 
              name={{ ios: getCategoryIcon(expense.category) as any, android: 'receipt', web: 'receipt' }} 
              tintColor={colors.tabIconDefault} 
              size={14} 
            />
            <Text style={[styles.category, { color: colors.text }]}>
              {expense.category.charAt(0).toUpperCase() + expense.category.slice(1)}
            </Text>
          </View>
          {expense.note ? (
            <Text style={[styles.note, { color: colors.tabIconDefault }]} numberOfLines={3}>
              {expense.note}
            </Text>
          ) : null}
        </View>

        {expense.image_url ? (
          <TouchableOpacity onPress={() => onImagePress(expense.image_url)}>
            <Image source={{ uri: expense.image_url }} style={[styles.thumbnail, { borderColor: colors.border }]} />
          </TouchableOpacity>
        ) : null}
      </View>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerLeft: {
    flex: 1,
    paddingRight: 12,
  },
  driverName: {
    fontSize: 15,
    fontWeight: '700',
  },
  date: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    marginTop: 4,
  },
  amount: {
    fontSize: 16,
    fontWeight: '800',
  },
  body: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  infoContainer: {
    flex: 1,
    paddingRight: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  category: {
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 6,
  },
  note: {
    fontSize: 12,
    lineHeight: 18,
  },
  thumbnail: {
    width: 60,
    height: 60,
    borderRadius: 8,
    borderWidth: 1,
  },
});
