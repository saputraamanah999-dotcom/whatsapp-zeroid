import { Platform, useColorScheme, TextStyle } from 'react-native';
import { useSyncExternalStore } from 'react';

export type ThemeMode = 'system' | 'light' | 'dark';

export type Theme = {
  dark: boolean;
  bg: string;
  surface: string;
  text: string;
  sub: string;
  faint: string;
  accent: string;
  accent2: string;
  accentSoft: string;
  danger: string;
  success: string;
  warning: string;
  bubbleMe: string;
  bubbleOther: string;
  border: string;
  bg2: string;
  dangerSoft: string;
  raised: string;
  raisedSm: string;
  inset: string;
  insetSm: string;
};

const light: Theme = {
  dark: false,
  bg: '#E9EDF3',
  surface: '#EEF1F6',
  text: '#1B2433',
  sub: '#5F6B7D',
  faint: '#9AA5B5',
  accent: '#1E6BFF',
  accent2: '#00B2FF',
  accentSoft: 'rgba(30,107,255,0.12)',
  danger: '#FF3B5C',
  success: '#14C47A',
  warning: '#FF9F0A',
  bubbleMe: '#1E6BFF',
  bubbleOther: '#F3F5F9',
  border: 'rgba(163,177,198,0.35)',
  bg2: '#F0F3F8',
  dangerSoft: 'rgba(255,59,92,0.12)',
  raised: '7px 7px 14px rgba(163,177,198,0.75), -7px -7px 14px rgba(255,255,255,0.95)',
  raisedSm: '4px 4px 9px rgba(163,177,198,0.7), -4px -4px 9px rgba(255,255,255,0.95)',
  inset: 'inset 5px 5px 10px rgba(163,177,198,0.7), inset -5px -5px 10px rgba(255,255,255,0.95)',
  insetSm: 'inset 3px 3px 6px rgba(163,177,198,0.7), inset -3px -3px 6px rgba(255,255,255,0.95)',
};

const dark: Theme = {
  dark: true,
  bg: '#1D222B',
  surface: '#222833',
  text: '#E9EEF6',
  sub: '#9AA6B8',
  faint: '#677386',
  accent: '#3D86FF',
  accent2: '#22C3FF',
  accentSoft: 'rgba(61,134,255,0.18)',
  danger: '#FF5A74',
  success: '#2BD68E',
  warning: '#FFB340',
  bubbleMe: '#2F74F5',
  bubbleOther: '#272E3A',
  border: 'rgba(255,255,255,0.06)',
  bg2: '#262D39',
  dangerSoft: 'rgba(255,90,116,0.16)',
  raised: '7px 7px 14px rgba(10,13,18,0.75), -6px -6px 13px rgba(48,56,70,0.6)',
  raisedSm: '4px 4px 9px rgba(10,13,18,0.7), -4px -4px 8px rgba(48,56,70,0.55)',
  inset: 'inset 5px 5px 10px rgba(10,13,18,0.75), inset -5px -5px 10px rgba(48,56,70,0.6)',
  insetSm: 'inset 3px 3px 6px rgba(10,13,18,0.7), inset -3px -3px 6px rgba(48,56,70,0.55)',
};

// --- theme mode store (persisted by store.ts through prefs) ---
let mode: ThemeMode = 'light';
const listeners = new Set<() => void>();
export function setThemeMode(m: ThemeMode) {
  mode = m;
  listeners.forEach((l) => l());
}
export function getThemeMode() {
  return mode;
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useThemeMode() {
  return useSyncExternalStore(subscribe, getThemeMode, getThemeMode);
}

export function useTheme(): Theme {
  const scheme = useColorScheme();
  const m = useThemeMode();
  const isDark = m === 'dark' || (m === 'system' && scheme === 'dark');
  return isDark ? dark : light;
}

export const font: TextStyle =
  Platform.OS === 'web'
    ? ({ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Helvetica Neue", Inter, Roboto, sans-serif' } as TextStyle)
    : Platform.OS === 'ios'
    ? { fontFamily: 'System' }
    : { fontFamily: 'sans-serif' };

export const R = { sm: 12, md: 18, lg: 24, xl: 32, pill: 999 };

export const AVATAR_COLORS = ['#1E6BFF', '#00B2FF', '#7B61FF', '#FF5A8A', '#FF9F0A', '#14C47A', '#00C2B8', '#FF6B3D'];

export const STORY_BGS = ['#1E6BFF', '#7B61FF', '#FF5A8A', '#14C47A', '#FF9F0A', '#0F172A', '#00B2FF'];
