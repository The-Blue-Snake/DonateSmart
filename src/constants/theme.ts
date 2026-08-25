const palette = {
  primary: '#60A5FA',
  primaryDark: '#2563EB',
  cream: '#0F172A',
  card: '#1E293B',
  white: '#F8FAFC',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  border: '#334155',
  background: '#0B1120',
  backgroundElement: '#1E293B',
  backgroundSelected: '#334155',
  textSecondary: '#94A3B8',
  accent: '#22C55E',
  accentDark: '#15803D',
} as const;

export const Colors = {
  ...palette,
  light: { ...palette },
  dark: { ...palette },
} as const;

export const Spacing = {
  screen: 24,
} as const;
