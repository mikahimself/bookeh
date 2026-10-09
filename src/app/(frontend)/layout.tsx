import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { Open_Sans } from 'next/font/google'
import React from 'react'
import './styles.css'

// Publishes `--font-open-sans`; `styles.css` applies it.
const openSans = Open_Sans({
  subsets: ['latin'],
  weight: ['300', '400'],
  variable: '--font-open-sans',
})

export const metadata = {
  description: 'A blank template using Payload in a Next.js app.',
  title: 'Payload Blank Template',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang={await getLocale()} className={openSans.variable}>
      <body>
        <NextIntlClientProvider>
          <main>{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
