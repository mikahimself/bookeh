import type { MetadataRoute } from 'next'

import { ICONS, THEME_COLORS } from './(frontend)/pwa'

/**
 * Served at `/manifest.webmanifest`, signed out (the proxy skips files). One
 * manifest for every locale: the request carries no user, and "bookeh" is the
 * same in both languages. No service worker (FR-50).
 */
export default function manifest(): MetadataRoute.Manifest {
  const icon = (src: string, sizes: string, purpose: 'any' | 'maskable') => ({
    src,
    sizes,
    type: 'image/png',
    purpose,
  })
  return {
    id: '/',
    name: 'bookeh',
    short_name: 'bookeh',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    theme_color: THEME_COLORS.light,
    background_color: THEME_COLORS.light,
    // Listed once per purpose: Chrome warns on the combined "any maskable".
    // The mark stays inside the central 80% circle, so one image serves both.
    icons: [
      icon(ICONS.icon192, '192x192', 'any'),
      icon(ICONS.icon192, '192x192', 'maskable'),
      icon(ICONS.icon512, '512x512', 'any'),
      icon(ICONS.icon512, '512x512', 'maskable'),
    ],
  }
}
