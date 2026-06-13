import { SymbolView } from 'expo-symbols';
import { Link, Tabs } from 'expo-router';
import { Pressable } from 'react-native';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        tabBarInactiveTintColor: Colors[colorScheme].tabIconDefault,
        headerStyle: {
          backgroundColor: Colors[colorScheme].background,
        },
        headerTintColor: Colors[colorScheme].text,
        tabBarStyle: {
          backgroundColor: Colors[colorScheme].background,
          borderTopWidth: 1,
          borderTopColor: colorScheme === 'dark' ? '#1E293B' : '#E2E8F0',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'square.grid.2x2.fill',
                android: 'dashboard',
                web: 'dashboard',
              }}
              tintColor={color}
              size={24}
            />
          ),
          headerRight: () => (
            <Link href="/settings" asChild>
              <Pressable style={{ marginRight: 15 }}>
                {({ pressed }) => (
                  <SymbolView
                    name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
                    size={24}
                    tintColor={Colors[colorScheme].text}
                    style={{ opacity: pressed ? 0.5 : 1 }}
                  />
                )}
              </Pressable>
            </Link>
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: 'Customers',
          tabBarLabel: 'Customers',
          headerShown: false, // Customers sub-stack will handle its own header
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'person.2.fill',
                android: 'group',
                web: 'group',
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="sales"
        options={{
          title: 'Sales',
          tabBarLabel: 'Sales',
          headerShown: false, // Sales sub-stack will handle its own header
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'doc.text.fill',
                android: 'receipt_long',
                web: 'receipt_long',
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="payments"
        options={{
          title: 'Payments',
          tabBarLabel: 'Payments',
          headerShown: false, // Payments sub-stack will handle its own header
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'indianrupeesign.circle.fill',
                android: 'payments',
                web: 'payments',
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="delivery"
        options={{
          title: 'Delivery',
          tabBarLabel: 'Delivery',
          headerShown: false, // Delivery sub-stack will handle its own header
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{
                ios: 'shippingbox.fill',
                android: 'local_shipping',
                web: 'local_shipping',
              }}
              tintColor={color}
              size={24}
            />
          ),
        }}
      />
    </Tabs>
  );
}
