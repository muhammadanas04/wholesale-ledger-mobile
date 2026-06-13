import { Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

export default function DeliveryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <Text className="text-lg font-semibold text-slate-950 dark:text-slate-50">Delivery Stop Details</Text>
      <Text className="text-slate-500 dark:text-slate-400 mt-1">ID: {id}</Text>
      <Text className="text-slate-500 dark:text-slate-400 mt-1">Milestone 8 will implement the checklist of stops and delivery task items here.</Text>
    </View>
  );
}
