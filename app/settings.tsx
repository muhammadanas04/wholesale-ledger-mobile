import { Text, View } from 'react-native';

export default function SettingsScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900 px-4">
      <Text className="text-xl font-bold text-slate-900 dark:text-slate-50">Settings</Text>
      <Text className="text-slate-500 dark:text-slate-400 mt-2">Configure sync settings here.</Text>
    </View>
  );
}
