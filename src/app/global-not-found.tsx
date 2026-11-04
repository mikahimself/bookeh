import type { Metadata, Viewport } from 'next'
import { headers } from 'next/headers'

import { resolveLocale, type Locale } from '@/i18n/locale'

import { TextLink } from './(frontend)/components/Link'
import { devicePrefs } from './(frontend)/prefs'
import { ICONS, themeColorFor } from './(frontend)/pwa'
import { openSans } from '@/lib/fonts'
import './(frontend)/styles.css'

import en from '../../messages/en.json'
import fi from '../../messages/fi.json'

/**
 * Spine, Routes (the Not found row): the page for an address no route
 * answers, served with HTTP 404. Next's `global-not-found` is the only hook
 * for unmatched addresses in an app with two root layouts ((frontend) and
 * (payload)), and it bypasses every layout, so this file supplies the whole
 * document — and, with no layout above it, its own metadata and viewport.
 *
 * It reads no user data and calls no service — the theme cookie and
 * `Accept-Language` are its only inputs — so `getTranslations`/`getLocale` are
 * out (`src/i18n/request.ts` calls `currentUser()`); the strings come straight
 * from the catalogues instead.
 */
const messages: Record<Locale, typeof en> = { en, fi }

async function locale(): Promise<Locale> {
  return resolveLocale(undefined, (await headers()).get('accept-language'))
}

export async function generateMetadata(): Promise<Metadata> {
  const name = messages[await locale()].app.name
  return {
    title: name,
    icons: {
      icon: [{ url: ICONS.icon192, sizes: '192x192', type: 'image/png' }],
      apple: [{ url: ICONS.apple, sizes: '180x180' }],
    },
    // The status bar stays opaque, so nothing runs under it at the top.
    appleWebApp: { capable: true, title: name, statusBarStyle: 'default' },
  }
}

// `cover` gives `env(safe-area-inset-*)` its values; WebKit reports 0 without it.
export async function generateViewport(): Promise<Viewport> {
  return { viewportFit: 'cover', themeColor: themeColorFor((await devicePrefs()).theme) }
}

export default async function GlobalNotFound() {
  const lang = await locale()
  const t = messages[lang].notFoundPage
  // Decided on the server from the cookie, so the first paint has the right colours.
  const { theme } = await devicePrefs()

  return (
    <html lang={lang} className={openSans.variable} data-theme={theme}>
      <body>
        <main>
          <div className="flex max-w-panel-width flex-col gap-7 p-page-margin-phone wide:p-page-margin">
            <h1 className="text-heading-section-phone ui-case wide:text-heading-section">
              {t.heading}
            </h1>
            <div className="flex flex-col items-start">
              <TextLink href="/">{t.collection}</TextLink>
            </div>
          </div>
        </main>
      </body>
    </html>
  )
}
