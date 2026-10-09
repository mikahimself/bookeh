import { getRequestConfig } from 'next-intl/server'
import { headers as getHeaders } from 'next/headers'
import { getPayload } from 'payload'

import config from '@/payload.config'

import en from '../../messages/en.json'
import fi from '../../messages/fi.json'
import { resolveLocale, timeZone, type Locale } from './locale'

const messages: Record<Locale, typeof en> = { en, fi }

/**
 * The language of the signed-in user, if any. Payload returns no user for a
 * missing or invalid token, so the sign-in page renders anonymously. A broken
 * config throws from `getPayload`; only a failing `auth` is logged and treated
 * as anonymous, so the page still renders in the browser's language.
 */
async function sessionLanguage(headers: Headers): Promise<string | undefined> {
  const payload = await getPayload({ config })
  try {
    const { user } = await payload.auth({ headers })
    return user?.language
  } catch (err) {
    payload.logger.error(
      { err },
      'Reading the session for the locale failed; using the browser language.',
    )
    return undefined
  }
}

/** The single next-intl configuration (Spine, AD-15). Found by `createNextIntlPlugin()`. */
export default getRequestConfig(async () => {
  const headers = await getHeaders()
  const locale = resolveLocale(await sessionLanguage(headers), headers.get('accept-language'))
  return { locale, timeZone, messages: messages[locale] }
})
