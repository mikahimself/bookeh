import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import React from 'react'
import './styles.css'

export const metadata = {
  description: 'A blank template using Payload in a Next.js app.',
  title: 'Payload Blank Template',
}

export default async function RootLayout(props: { children: React.ReactNode }) {
  const { children } = props

  return (
    <html lang={await getLocale()}>
      <body>
        <NextIntlClientProvider>
          <main>{children}</main>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
