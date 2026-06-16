const tintColorLight = '#0D9488'; // Teal 600
const tintColorDark = '#2DD4BF';  // Teal 400

export default {
  light: {
    text: '#0F172A', // Slate 900
    background: '#F1F5F9', // Slate 100
    surface: '#FFFFFF',
    surfaceSolid: '#FFFFFF',
    border: '#E2E8F0', // Solid Slate 200 border
    tint: tintColorLight,
    tabIconDefault: '#94A3B8', // Slate 400
    tabIconSelected: tintColorLight,
    accent: '#0284C7', // Sky 600
    success: '#10B981', // Emerald 500
    danger: '#EF4444', // Red 500
    warning: '#F59E0B', // Amber 500
  },
  dark: {
    text: '#F8FAFC', // Slate 50
    background: '#0F172A', // Slate 900
    surface: '#1E293B',
    surfaceSolid: '#1E293B',
    border: '#334155', // Solid Slate 700 border
    tint: tintColorDark,
    tabIconDefault: '#64748B', // Slate 500
    tabIconSelected: tintColorDark,
    accent: '#38BDF8', // Sky 400
    success: '#34D399', // Emerald 400
    danger: '#F87171', // Red 400
    warning: '#FBBF24', // Amber 400
  },
};
