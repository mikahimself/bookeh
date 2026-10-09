import type { Metadata } from 'next'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getTranslations } from 'next-intl/server'
import { Open_Sans } from 'next/font/google'
import React from 'react'

import { ToastProvider } from './components/toast/ToastProvider'
import { devicePrefs } from './prefs'
import './styles.css'

// Publishes `--font-open-sans`; `styles.css` applies it.
const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400'],
  variable: '--font-open-sans',
})

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app')
  return { title: t('name') }
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
          <ToastProvider>
            <main>{children}</main>
          </ToastProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
