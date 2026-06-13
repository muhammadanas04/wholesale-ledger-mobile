import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function DeliveryLayout() {
  const colorScheme = useColorScheme();

  return (
    <Stack
      screenOptions={{
        headerStyle: {
          backgroundColor: Colors[colorScheme].background,
        },
        headerTintColor: Colors[colorScheme].text,
        headerTitleStyle: {
          fontWeight: 'bold',
        },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Delivery Dashboard' }} />
      <Stack.Screen name="drivers" options={{ title: 'Driver Management' }} />
      <Stack.Screen name="new-delivery" options={{ title: 'Create Delivery' }} />
      <Stack.Screen name="map" options={{ title: 'Live Driver Tracker' }} />
      <Stack.Screen name="[id]" options={{ title: 'Delivery Details' }} />
    </Stack>
  );
}
