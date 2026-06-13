import { Text, View } from 'react-native';

export default function DashboardScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-slate-50 dark:bg-slate-900 px-6">
      <Text className="text-2xl font-bold text-slate-900 dark:text-slate-50">Dashboard</Text>
      <View className="h-[2px] w-1/3 bg-indigo-600 dark:bg-indigo-400 my-4 rounded-full" />
      <Text className="text-slate-500 dark:text-slate-400 text-center">
        Welcome to Wholesale Ledger Admin.
      </Text>
      <Text className="text-slate-400 dark:text-slate-500 text-xs text-center mt-1">
        Milestone 1 completed. Project scaffolded successfully!
      </Text>
    </View>
  );
}
