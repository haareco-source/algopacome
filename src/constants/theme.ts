import '@/global.css';

import { Platform } from 'react-native';

// Marca Algopacome: naranja (acción principal), verde (abierto, confirmaciones, novedades),
// blanco y negro de base.
export const Colors = {
  light: {
    text: '#111111',
    background: '#FFFFFF',
    backgroundElement: '#F4F4F5',
    backgroundSelected: '#E4E4E7',
    border: '#E4E4E7',
    textSecondary: '#6B6B70',
    primary: '#FF6B00',
    primarySoft: '#FFF1E6',
    onPrimary: '#FFFFFF',
    accent: '#16A34A',
    accentSoft: '#E8F7EE',
    onAccent: '#FFFFFF',
    danger: '#DC2626',
  },
  dark: {
    text: '#FFFFFF',
    background: '#000000',
    backgroundElement: '#1C1C1E',
    backgroundSelected: '#2C2C2E',
    border: '#2C2C2E',
    textSecondary: '#A1A1AA',
    primary: '#FF7A1A',
    primarySoft: '#3A1E08',
    onPrimary: '#FFFFFF',
    accent: '#22C55E',
    accentSoft: '#0F2E1A',
    onAccent: '#000000',
    danger: '#F87171',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
export const Radius = { card: 16, pill: 999 } as const;
