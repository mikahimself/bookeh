import { maxPrice } from '@/fields/limits'

/**
 * FR-55: a price as typed, in euros, to whole cents. Spaces anywhere (NBSP
 * too) and a leading or trailing `€` are dropped, so "1 234,50" parses; a
 * comma or a point marks the cents, at most two digits after it. Empty or
 * blank input is `null`, no price; over `maxPrice` is `'tooLarge'`; anything
 * else, a lone `€`, a sign or a comma or point grouping included, is
 * `'invalid'`.
 */
export function parsePrice(text: string): number | null | 'invalid' | 'tooLarge' {
  // `\s` covers NBSP and the narrow NBSP that formatted prices carry.
  const bare = text.replace(/\s/g, '').replace(/^€|€$/g, '')
  if (bare === '') return text.trim() === '' ? null : 'invalid'
  const match = /^(\d+)(?:[.,](\d{1,2}))?$/.exec(bare)
  if (!match) return 'invalid'
  const [, euros = '', cents = ''] = match
  const value = Number(euros) * 100 + Number(cents.padEnd(2, '0'))
  if (!Number.isSafeInteger(value) || value > maxPrice) return 'tooLarge'
  return value
}
