import { getRequestConfig } from 'next-intl/server'
import { headers as getHeaders } from 'next/headers'

import { currentUser } from '@/lib/payload/context'

import en from '../../messages/en.json'
import fi from '../../messages/fi.json'
import { resolveLocale, timeZone, type Locale } from './locale'

const messages: Record<Locale, typeof en> = { en, fi }

/**
 * The single next-intl configuration (Spine, AD-15). Found by
 * `createNextIntlPlugin()`. Without a session (the sign-in page) the locale
 * comes from the browser.
 */
export default getRequestConfig(async () => {
  const user = await currentUser()
  const acceptLanguage = (await getHeaders()).get('accept-language')
  const locale = resolveLocale(user?.language, acceptLanguage)
  return { locale, timeZone, messages: messages[locale] }
})
