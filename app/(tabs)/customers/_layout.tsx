import { Stack } from 'expo-router';
import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function CustomersLayout() {
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
      <Stack.Screen name="index" options={{ title: 'Customers' }} />
      <Stack.Screen name="[id]" options={{ title: 'Customer Details' }} />
      <Stack.Screen name="new" options={{ title: 'New Customer' }} />
    </Stack>
  );
}
