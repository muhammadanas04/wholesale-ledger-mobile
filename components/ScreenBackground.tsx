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
    ? ['#121212', '#151515'] as const
    : ['#EAEAE6', '#E5E5DF'] as const;

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
