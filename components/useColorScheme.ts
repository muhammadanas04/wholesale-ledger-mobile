import { useColorScheme as useNativeWindColorScheme } from 'nativewind';

export const useColorScheme = () => {
  const { colorScheme } = useNativeWindColorScheme();
  return colorScheme || 'light';
};
