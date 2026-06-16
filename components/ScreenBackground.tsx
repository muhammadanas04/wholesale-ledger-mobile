import React from 'react';
import { StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useColorScheme } from '@/components/useColorScheme';

interface ScreenBackgroundProps {
  children: React.ReactNode;
}

export function ScreenBackground({ children }: ScreenBackgroundProps) {
  const colorScheme = useColorScheme();

  const colors = colorScheme === 'dark'
    ? ['#000000', '#020203', '#050507'] as const
    : ['#F8FAFC', '#F1F5F9', '#E0F2FE'] as const;

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
