/**
 * A stored language's name in `locale`: languages are ISO 639 codes (spine,
 * Conventions), but an override may be free text. The value as stored when
 * `Intl` has no name for it or rejects it.
 */
export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language', fallback: 'none' }).of(code) ?? code
  } catch {
    return code
  }
}
