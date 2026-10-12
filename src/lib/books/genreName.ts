import type { Locale } from '@/i18n/locale'
import type { Genre } from '@/payload-types'

/** The genre's name for `locale`: the Finnish name when there is one, else the English. */
export function genreName(genre: Pick<Genre, 'name' | 'nameFi'>, locale: Locale): string {
  const fi = genre.nameFi?.trim()
  return locale === 'fi' && fi ? fi : genre.name
}
