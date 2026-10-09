import type { Viewport } from 'next'

import type { DevicePrefs } from './prefs'

/**
 * DESIGN.md, App Icon & Theme Colour (T1): the `theme-color` is the
 * `--color-background` of the theme in use. Literals because meta tags and the
 * manifest cannot read CSS variables; a unit test pins them to `styles.css`.
 */
export const THEME_COLORS = { light: '#FFFFFF', dark: '#14181D' } as const

/** Exported from `public/icons/icon.svg` by `npm run icons`. */
export const ICONS = {
  icon192: '/icons/icon-192.png',
  icon512: '/icons/icon-512.png',
  apple: '/icons/apple-touch-icon.png',
} as const

/** One colour for a fixed theme; a light and dark pair following the OS for `system`. */
export function themeColorFor(theme: DevicePrefs['theme']): Viewport['themeColor'] {
  if (theme !== 'system') return THEME_COLORS[theme]
  return [
    { media: '(prefers-color-scheme: light)', color: THEME_COLORS.light },
    { media: '(prefers-color-scheme: dark)', color: THEME_COLORS.dark },
  ]
}
