import { Text, View } from 'react-native';

export default function LiveMapScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <Text className="text-lg font-semibold text-slate-950 dark:text-slate-50">Live Driver Tracker Map</Text>
      <Text className="text-slate-500 dark:text-slate-400 mt-1">Milestone 9 will implement real-time tracking polling and visual markers here.</Text>
    </View>
  );
}
