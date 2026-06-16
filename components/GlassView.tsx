import React from 'react';
import { View, StyleSheet, Platform, ViewProps } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

interface GlassViewProps extends ViewProps {
  intensity?: number;
  tint?: 'light' | 'dark' | 'default';
  borderRadius?: number;
  borderColor?: string;
  backgroundColor?: string;
}

export function GlassView({
  children,
  style,
  intensity = 35,
  tint,
  borderRadius = 24,
  borderColor,
  backgroundColor,
  ...otherProps
}: GlassViewProps) {
  const colorScheme = useColorScheme();

  const resolvedBorderColor = borderColor || Colors[colorScheme].border;
  const resolvedBgColor = backgroundColor || Colors[colorScheme].surface;

  const glassStyle = {
    borderRadius,
    overflow: 'hidden' as const,
    borderWidth: 1,
    borderColor: resolvedBorderColor,
    backgroundColor: resolvedBgColor,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: colorScheme === 'dark' ? 0.25 : 0.06,
        shadowRadius: 16,
      },
      android: {
        elevation: 2,
        shadowColor: colorScheme === 'dark' ? '#000' : '#475569',
      },
      web: {
        boxShadow: colorScheme === 'dark' 
          ? '0 8px 32px 0 rgba(0, 0, 0, 0.4)' 
          : '0 8px 32px 0 rgba(148, 163, 184, 0.1)',
      }
    }),
  };

  return (
    <View style={[glassStyle, style]} {...otherProps}>
      {children}
    </View>
  );
}
