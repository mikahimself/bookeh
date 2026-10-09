import { describe, expect, it } from 'vitest'

import { Users } from '@/collections/Users'
import { defaultLocale, locales, resolveLocale } from '@/i18n/locale'

describe('locales', () => {
  it("match the Users collection's language field", () => {
    const language = Users.fields.find((field) => 'name' in field && field.name === 'language')
    expect(language).toMatchObject({
      type: 'select',
      options: [...locales],
      defaultValue: defaultLocale,
    })
  })
})

describe('resolveLocale', () => {
  it.each([
    ['a Finnish browser', 'fi-FI,fi;q=0.9,en;q=0.8', 'fi'],
    ['q order over header order', 'en;q=0.5, fi;q=0.8', 'fi'],
    ['header order on equal q', 'fi;q=0.8, en;q=0.8', 'fi'],
    ['header order on equal q, reversed', 'en, fi', 'en'],
    ['region and case', 'FI-fi', 'fi'],
    ['unsupported languages', 'de-DE, sv;q=0.9', 'en'],
    ['q=0 as not acceptable', 'fi;q=0, de', 'en'],
    ['q=0.000 as not acceptable', 'fi;q=0.000', 'en'],
    ['an empty header', '', 'en'],
    ['junk', ';;,q=x', 'en'],
    ['a malformed q next to a valid entry', 'fi;q=abc, en;q=0.1', 'en'],
    ['a wildcard', '*', 'en'],
  ])('reads %s', (_, header, expected) => {
    expect(resolveLocale(undefined, header)).toBe(expected)
  })

  it('falls back to en without a header', () => {
    expect(resolveLocale(undefined, undefined)).toBe('en')
    expect(resolveLocale(null, null)).toBe('en')
  })

  it("prefers the user's language over the browser's", () => {
    expect(resolveLocale('fi', 'en-US')).toBe('fi')
    expect(resolveLocale('en', 'fi-FI')).toBe('en')
  })

  it('ignores an unsupported user language', () => {
    expect(resolveLocale('de', 'fi-FI')).toBe('fi')
  })
})
