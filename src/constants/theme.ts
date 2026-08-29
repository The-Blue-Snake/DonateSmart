
const palette = {
  primary: '#B86B43',
  primaryDark: '#79432D',

  background: '#090909',
  card: '#141311',

  white: '#DDD6C8',
  text: '#DDD6C8',
  textMuted: '#817B72',

  border: '#282521',

  accent: '#B89A55',
  accentDark: '#74602F',
} as const;

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

export const Colors = {
  ...palette,
  light: { ...palette },
  dark: { ...palette },
} as const;

export const Spacing = {
  screen: 12,
} as const;
