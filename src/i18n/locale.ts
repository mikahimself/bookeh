/** Spine, AD-15: two locales and no locale in the URL; the language lives on the profile. */
export const locales = ['en', 'fi'] as const
export type Locale = (typeof locales)[number]
export const defaultLocale: Locale = 'en'
export const timeZone = 'Europe/Helsinki'

const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (locales as readonly string[]).includes(value)

const languageRange = /^[a-z]{1,8}(-[a-z0-9]{1,8})*$/i
const weight = /^q\s*=\s*(0(\.\d{0,3})?|1(\.0{0,3})?)$/i

/**
 * Best supported locale for an `Accept-Language` header (RFC 9110, 12.5.4):
 * the highest q wins, header order breaks ties, `q=0` means not acceptable,
 * and a range matches on its primary subtag, case-insensitively. Malformed
 * entries are skipped.
 */
function matchAcceptLanguage(header: string): Locale | undefined {
  let best: { locale: Locale; q: number } | undefined
  for (const entry of header.split(',')) {
    const [range = '', ...params] = entry.split(';').map((part) => part.trim())
    if (!languageRange.test(range) || params.length > 1) continue
    const m = params.length === 1 ? weight.exec(params[0]!) : null
    if (params.length === 1 && !m) continue
    const q = m ? Number(m[1]) : 1
    const primary = range.split('-')[0]!.toLowerCase()
    if (q > 0 && isLocale(primary) && (best === undefined || q > best.q)) {
      best = { locale: primary, q }
    }
  }
  return best?.locale
}

/** The signed-in user's language first, then the browser's best match, then `en`. */
export function resolveLocale(
  language: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (isLocale(language)) return language
  return (acceptLanguage ? matchAcceptLanguage(acceptLanguage) : undefined) ?? defaultLocale
}
