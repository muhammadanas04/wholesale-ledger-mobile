import React, { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Stack } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useQuery } from '@tanstack/react-query';
import { SymbolView } from 'expo-symbols';

import { ScreenBackground } from '../../../components/ScreenBackground';
import { ExpenseCard, Expense } from '../../../components/ExpenseCard';
import { ImageViewerModal } from '../../../components/ImageViewerModal';
import { api } from '../../../lib/api';
import { useColorScheme } from '../../../components/useColorScheme';
import Colors from '../../../constants/Colors';

export default function ExpensesScreen() {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  const [selectedImage, setSelectedImage] = useState<string | null>(null);

  const { data: expenses, error, isLoading, isError, refetch, isRefetching } = useQuery<Expense[]>({
    queryKey: ['expenses'],
    queryFn: () => api.getExpenses(),
  });

  const renderEmpty = () => {
    if (isLoading) {
      return (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
        </View>
      );
    }

    if (isError) {
      return (
        <View style={styles.centerContainer}>
          <SymbolView name={{ ios: 'exclamationmark.triangle.fill', android: 'error', web: 'error' }} tintColor={colors.warning} size={48} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Failed to load expenses</Text>
          <Text style={[styles.emptySub, { color: colors.tabIconDefault }]}>
            {(error as Error)?.message || 'Please pull to refresh and try again.'}
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.centerContainer}>
        <SymbolView name={{ ios: 'receipt.fill', android: 'receipt', web: 'receipt' }} tintColor={colors.tabIconDefault} size={48} />
        <Text style={[styles.emptyTitle, { color: colors.text }]}>No Expenses</Text>
        <Text style={[styles.emptySub, { color: colors.tabIconDefault }]}>There are currently no expenses reported.</Text>
      </View>
    );
  };

  return (
    <ScreenBackground>
      <Stack.Screen
        options={{
          title: 'Recent Expenses',
          headerLargeTitle: false,
        }}
      />

      <View style={styles.container}>
        <FlashList
          data={expenses || []}
          renderItem={({ item }) => (
            <ExpenseCard
              expense={item}
              onImagePress={(url) => setSelectedImage(url)}
            />
          )}
          keyExtractor={(item) => item.id}
          estimatedItemSize={150}
          contentContainerStyle={styles.listContent}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={renderEmpty}
        />
      </View>

      <ImageViewerModal
        visible={!!selectedImage}
        imageUrls={selectedImage ? [{ url: selectedImage }] : []}
        onClose={() => setSelectedImage(null)}
      />
    </ScreenBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 40,
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 16,
  },
  emptySub: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
  },
});
