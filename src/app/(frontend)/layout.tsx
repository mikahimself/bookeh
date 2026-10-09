import type { Metadata, Viewport } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Open_Sans } from 'next/font/google'
import React from 'react'

import { NavigationTracker } from './components/navigation'
import { ToastProvider } from './components/toast/ToastProvider'
import { devicePrefs } from './prefs'
import { ICONS, themeColorFor } from './pwa'
import './styles.css'

// Publishes `--font-open-sans`; `styles.css` applies it.
const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400'],
  variable: '--font-open-sans',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app')
  return {
    title: t('name'),
    icons: {
      icon: [{ url: ICONS.icon192, sizes: '192x192', type: 'image/png' }],
      apple: [{ url: ICONS.apple, sizes: '180x180' }],
    },
    // The status bar stays opaque, so nothing runs under it at the top.
    appleWebApp: { capable: true, title: t('name'), statusBarStyle: 'default' },
  }
}

// `cover` gives `env(safe-area-inset-*)` its values; WebKit reports 0 without it.
export async function generateViewport(): Promise<Viewport> {
  return { viewportFit: 'cover', themeColor: themeColorFor((await devicePrefs()).theme) }
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props
  // Decided on the server from the cookie, so the first paint has the right colours.
  const { theme } = await devicePrefs()

  return (
    <html lang={await getLocale()} className={openSans.variable} data-theme={theme}>
      <body>
        <NextIntlClientProvider>
          {/* Above the pages (spine, Toasts): a toast survives navigation. */}
          <NavigationTracker />
          <ToastProvider>
            {/* `peer`: the toast region rises above a bar pinned to the bottom. */}
            <main className="peer">{children}</main>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
