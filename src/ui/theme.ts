/**
 * Unscroll design tokens.
 * Study-desk palette: cool paper, navy ink, and a highlighter yellow that is
 * reserved for the lock itself. Nothing else in the app uses yellow.
 */
export const color = {
  paper: '#EEF1F4',
  surface: '#FFFFFF',
  ink: '#14213D',
  inkSoft: '#2B3A5C',
  slate: '#5C677D',
  hairline: '#D9DEE6',
  mist: '#E3E8EF',
  highlighter: '#F5DD4B',
  highlighterDeep: '#E4C82A',
  calm: '#2F8F6B',
  calmTint: '#E2F2EA',
  alert: '#C8443B',
  alertTint: '#F8E4E2',
  pendingTint: '#FFF6D1',
  onInk: '#F3F5F9',
  onInkMuted: '#A9B3C7',
} as const;

export const font = {
  display: 'BricolageGrotesque_700Bold',
  displaySemi: 'BricolageGrotesque_600SemiBold',
  displayHeavy: 'BricolageGrotesque_800ExtraBold',
  body: 'InstrumentSans_400Regular',
  bodyMedium: 'InstrumentSans_500Medium',
  bodySemi: 'InstrumentSans_600SemiBold',
} as const;

/** Type scale (modular, ratio ~1.25). */
export const type = {
  hero: { fontFamily: font.displayHeavy, fontSize: 44, lineHeight: 48, letterSpacing: -1 },
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 36, letterSpacing: -0.6 },
  heading: { fontFamily: font.displaySemi, fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },
  body: { fontFamily: font.body, fontSize: 16, lineHeight: 23 },
  bodyStrong: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 23 },
  label: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20 },
  caption: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;

/** Radii by role, not one radius for everything. */
export const radius = { control: 12, group: 18, panel: 28, pill: 999 } as const;

export const touch = 48;
