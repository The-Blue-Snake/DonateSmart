
/*
const palette = {
  primary: '#4C8763',
  primaryDark: '#2E5940',

  background: '#0A0C0A',
  card: '#131512',

  white: '#D9DED2',
  text: '#D9DED2',
  textMuted: '#7A8177',

  border: '#242621',

  accent: '#8FA35C',
  accentDark: '#5C6A38',
} as const;

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
  primary: '#5D7A9C',
  primaryDark: '#3A4E63',

  background: '#0A0A0C',
  card: '#151618',

  white: '#DADCDE',
  text: '#DADCDE',
  textMuted: '#7D818A',

  border: '#242628',

  accent: '#8CA4BE',
  accentDark: '#576F87',
} as const;

export const Colors = {
  ...palette,
  light: { ...palette },
  dark: { ...palette },
} as const;

export const Spacing = {
  screen: 12,
} as const;
