/*
const palette = {
  primary: '#38BDF8',      // Sky blue
  primaryDark: '#0284C7',  // Deep sky
  background: '#0B1120',   // Rich navy
  card: '#151F32',         // Slightly blue-tinted card
  white: '#F8FAFC',        // Soft white
  text: '#F8FAFC',
  textMuted: '#94A3B8',    // Slate
  border: '#263449',       // Subtle border
  accent: '#A3E635',       // Lime
  accentDark: '#65A30D',   // Deep lime
} as const;
*/

/*
const palette = {
  primary: '#F97316',
  primaryDark: '#C2410C',
  background: '#111111',
  card: '#1E1E1E',
  white: '#FAFAFA',
  text: '#F5F5F5',
  textMuted: '#A3A3A3',
  border: '#333333',
  accent: '#FACC15',
  accentDark: '#CA8A04',
} as const;
*/
const palette = {
  primary: '#3B82F6',
  primaryDark: '#2563EB',
  background: '#EFF6FF',
  card: '#FFFFFF',
  white: '#FFFFFF',
  text: '#172033',
  textMuted: '#64748B',
  border: '#DBEAFE',
  accent: '#F97316',
  accentDark: '#C2410C',
} as const;

export const Colors = {
  ...palette,
  light: { ...palette },
  dark: { ...palette },
} as const;

export const Spacing = {
  screen: 24,
} as const;
