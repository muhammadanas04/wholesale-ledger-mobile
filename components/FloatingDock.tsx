import React from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Platform } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { GlassView } from './GlassView';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

export interface BottomTabBarProps {
  state: any;
  descriptors: any;
  navigation: any;
}

export function FloatingDock({ state, descriptors, navigation }: BottomTabBarProps) {
  const colorScheme = useColorScheme();
  const colors = Colors[colorScheme];

  // We only render the tabs we expect in our navigation restructure
  // Route names: "index", "ledger", "customers", "delivery"
  const visibleRoutes = state.routes.filter((route: any) => 
    ['index', 'ledger', 'customers', 'delivery'].includes(route.name)
  );

  const getIconConfig = (routeName: string) => {
    switch (routeName) {
      case 'index':
        return {
          ios: 'square.grid.2x2.fill',
          android: 'dashboard',
          web: 'dashboard',
          label: 'Home',
        };
      case 'ledger':
        return {
          ios: 'doc.text.fill',
          android: 'receipt_long',
          web: 'receipt_long',
          label: 'Ledger',
        };
      case 'customers':
        return {
          ios: 'person.2.fill',
          android: 'group',
          web: 'group',
          label: 'Clients',
        };
      case 'delivery':
        return {
          ios: 'shippingbox.fill',
          android: 'local_shipping',
          web: 'local_shipping',
          label: 'Delivery',
        };
      default:
        return {
          ios: 'questionmark.circle.fill',
          android: 'help',
          web: 'help',
          label: 'Help',
        };
    }
  };

  return (
    <View style={styles.outerContainer} pointerEvents="box-none">
      <GlassView 
        style={styles.dock}
        intensity={Platform.OS === 'ios' ? 45 : 0}
        borderRadius={32}
      >
        <View style={styles.innerContainer}>
          {visibleRoutes.map((route: any, index: number) => {
            const { options } = descriptors[route.key];
            const isFocused = state.index === state.routes.indexOf(route);

            const onPress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name, route.params);
              }
            };

            const onLongPress = () => {
              navigation.emit({
                type: 'tabLongPress',
                target: route.key,
              });
            };

            const config = getIconConfig(route.name);

            return (
              <TouchableOpacity
                key={route.key}
                accessibilityRole="button"
                accessibilityState={isFocused ? { selected: true } : {}}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
                onPress={onPress}
                onLongPress={onLongPress}
                style={styles.tabButton}
                activeOpacity={0.7}
              >
                {/* Visual Active Pill Background */}
                {isFocused && (
                  <View 
                    style={[
                      styles.activePill,
                      { backgroundColor: colorScheme === 'dark' ? 'rgba(45, 212, 191, 0.15)' : 'rgba(13, 148, 136, 0.08)' }
                    ]}
                  />
                )}

                <SymbolView
                  name={{
                    ios: config.ios,
                    android: config.android,
                    web: config.web,
                  } as any}
                  size={20}
                  tintColor={isFocused ? colors.tint : colors.tabIconDefault}
                  style={isFocused ? styles.activeIcon : undefined}
                />
                
                <Text 
                  style={[
                    styles.label, 
                    { 
                      color: isFocused ? colors.tint : colors.tabIconDefault,
                      fontWeight: isFocused ? '700' : '500',
                    }
                  ]}
                  numberOfLines={1}
                >
                  {config.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </GlassView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  dock: {
    width: '100%',
    maxWidth: 400,
    height: 66,
  },
  innerContainer: {
    flexDirection: 'row',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 8,
  },
  tabButton: {
    flex: 1,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    width: '85%',
    height: '75%',
    borderRadius: 20,
  },
  label: {
    fontSize: 9,
    marginTop: 3,
  },
  activeIcon: {
    transform: [{ scale: 1.1 }],
  },
});
