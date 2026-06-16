const tintColorLight = '#0D9488'; // Teal 600
const tintColorDark = '#2DD4BF';  // Teal 400

export default {
  light: {
    text: '#111115', // Deep charcoal black
    background: '#EAEAE6', // Warm premium off-white/beige grey
    surface: '#FFFFFF', // Solid pure white
    surfaceSolid: '#FFFFFF',
    border: '#D2D2CC', // Subtle warm grey border
    tint: tintColorLight,
    tabIconDefault: '#8E8E93',
    tabIconSelected: tintColorLight,
    accent: '#0284C7', // Sky 600
    success: '#10B981', // Emerald 500
    danger: '#EF4444', // Red 500
    warning: '#F59E0B', // Amber 500
  },
  dark: {
    text: '#F2F2F7', // Creamy off-white text
    background: '#121212', // Solid dark neutral gray
    surface: '#1C1C1E', // iOS-style dark card surface
    surfaceSolid: '#1C1C1E',
    border: '#2C2C2E', // Subtle dark gray border
    tint: tintColorDark,
    tabIconDefault: '#8E8E93',
    tabIconSelected: tintColorDark,
    accent: '#38BDF8', // Sky 400
    success: '#34D399', // Emerald 400
    danger: '#F87171', // Red 400
    warning: '#FBBF24', // Amber 400
  },
};
