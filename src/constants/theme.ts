
const palette = {
  primary: '#D75C52',
  primaryDark: '#B7473E',
  secondary: '#5AA7A1',
  secondaryDark: '#357B79',
  background: '#D7D9D7',
  card: '#F3F3F1',
  white: '#FBFBFA',
  text: '#1F2428',
  textMuted: '#5F676D',
  border: '#2B2F33',
  accent: '#5AA7A1',
  accentDark: '#357B79',
  surface: '#E9E8E5',
  surfaceAlt: '#E0E2E1',
  danger: '#D75C52',
  success: '#5AA7A1',
} as const;

export const Colors = {
  ...palette,
  light: { ...palette },
  dark: {
    ...palette,
    background: '#171B1E',
    card: '#1F2529',
    surface: '#20272C',
    surfaceAlt: '#151B20',
    text: '#F2F4F4',
    textMuted: '#9AA6AE',
    border: '#3A4248',
    white: '#F9FAF9',
  },
} as const;

export const Spacing = {
  screen: 14,
  card: 18,
  section: 24,
} as const;

export const Border = {
  width: 1.25,
  radius: 18,
  largeRadius: 24,
} as const;
