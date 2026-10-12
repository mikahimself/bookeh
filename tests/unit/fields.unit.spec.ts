import type { FieldHook, FieldHookArgs, TextField, Validate } from 'payload'
import { describe, expect, it } from 'vitest'

import { isbnField, normaliseIsbn, toIsbn13 } from '@/fields/isbn'
import { nameKeyField, toNameKey } from '@/fields/nameKey'
import { deriveSortName, sortNameField } from '@/fields/sortName'
import { runAction } from '@/lib/errors'

const t = (key: string): string => key
const req = { t, payload: { config: {} } }

function hookOf(field: TextField): FieldHook {
  const hook = field.hooks?.beforeValidate?.[0]
  if (!hook) throw new Error(`${field.name} has no beforeValidate hook`)
  return hook
}

const callHook = (field: TextField, args: Partial<FieldHookArgs>): unknown =>
  hookOf(field)({ collection: { slug: 'authors' }, req, ...args } as unknown as FieldHookArgs)

describe('toIsbn13 / normaliseIsbn', () => {
  it.each([
    ['ISBN-13 plain', '9789515782755', '9789515782755'],
    ['ISBN-13 hyphens and spaces', '978-951-578 275-5', '9789515782755'],
    ['ISBN-10', '951-578-275-9', '9789515782755'],
    ['ISBN-10 upper-case X', '0-8044-2957-X', '9780804429573'],
    ['ISBN-10 lower-case x', '080442957x', '9780804429573'],
  ])('%s', (_, input, expected) => {
    expect(toIsbn13(input)).toBe(expected)
    expect(normaliseIsbn(input)).toBe(expected)
  })

  it.each([
    ['bad ISBN-13 check digit', '9789515782754'],
    ['bad ISBN-10 check digit', '9515782758'],
    ['empty', ''],
    ['letters', 'abc'],
    ['too short', '12345'],
    ['13 digits starting 977', '9779515782755'],
  ])('%s fails with INVALID_ISBN', async (_, input) => {
    expect(toIsbn13(input)).toBeNull()
    expect(await runAction(async () => normaliseIsbn(input))).toEqual({
      ok: false,
      code: 'INVALID_ISBN',
    })
  })
})

describe('isbnField', () => {
  const field = isbnField()
  // isbnField is single-valued; its validate takes one string.
  const fieldValidate = field.validate as Validate<string, unknown, unknown, TextField>
  const validate = (value: unknown) =>
    fieldValidate(
      value as string | null,
      {
        req,
        required: false,
      } as unknown as Parameters<typeof fieldValidate>[1],
    )

  it('stores the 13-digit form of a convertible ISBN', async () => {
    const stored = callHook(field, { value: '951-578-275-9' })
    expect(stored).toBe('9789515782755')
    expect(await validate(stored)).toBe(true)
  })

  it('stores blank as null', async () => {
    expect(callHook(field, { value: '  ' })).toBeNull()
    expect(await validate(null)).toBe(true)
  })

  it('rejects text that is not an ISBN', async () => {
    const stored = callHook(field, { value: '9789515782754' })
    expect(stored).toBe('9789515782754')
    expect(await validate(stored)).toBe('validation:invalidInput')
  })

  // Admin form state validates the raw input before the hook runs.
  it.each([
    ['raw ISBN-10', '951-578-275-9'],
    ['raw hyphenated ISBN-13', '978-951-578-275-5'],
    ['cleared field', ''],
  ])('accepts a %s', async (_, value) => {
    expect(await validate(value)).toBe(true)
  })

  it('rejects a non-string value', async () => {
    expect(callHook(field, { value: 9515782759 })).toBe(9515782759)
    expect(await validate(9515782759)).toBe('validation:invalidInput')
  })
})

describe('toNameKey', () => {
  it('trims, collapses inner whitespace and lower-cases', () => {
    expect(toNameKey('  Väinö   Linna ')).toBe('väinö linna')
  })

  it('does not fold accents', () => {
    expect(toNameKey('Äiti')).toBe('äiti')
    expect(toNameKey('Äiti')).not.toBe(toNameKey('aiti'))
  })

  it('normalises to NFC', () => {
    expect(toNameKey('A\u0308iti')).toBe(toNameKey('Äiti'))
  })
})

describe('nameKeyField', () => {
  const field = nameKeyField()

  it('keys the incoming name, ignoring any nameKey in the input', () => {
    const siblingData = { name: '  Väinö   Linna ', nameKey: 'forged' }
    expect(callHook(field, { siblingData, operation: 'create' })).toBe('väinö linna')
  })

  it('keys the stored name on an update without one', () => {
    const previousSiblingDoc = { name: 'Väinö Linna', nameKey: 'stale' }
    expect(callHook(field, { siblingData: {}, previousSiblingDoc, operation: 'update' })).toBe(
      'väinö linna',
    )
  })

  it('rejects a blank name on name', async () => {
    const result = await runAction(async () =>
      callHook(field, { siblingData: { name: '   ' }, operation: 'create' }),
    )
    expect(result).toEqual({ ok: false, code: 'VALIDATION', fields: { name: 'VALIDATION' } })
  })

  it('rejects an explicit null name on update, not keying the stored one', async () => {
    const previousSiblingDoc = { name: 'Väinö Linna', nameKey: 'väinö linna' }
    const result = await runAction(async () =>
      callHook(field, { siblingData: { name: null }, previousSiblingDoc, operation: 'update' }),
    )
    expect(result).toEqual({ ok: false, code: 'VALIDATION', fields: { name: 'VALIDATION' } })
  })
})

describe('deriveSortName', () => {
  it.each([
    ['two-word name', 'Tove Jansson', 'Jansson, Tove'],
    ['Finnish name', 'Aleksis Kivi', 'Kivi, Aleksis'],
    ['particle name', 'Ludwig van Beethoven', 'Beethoven, Ludwig van'],
    ['single name', 'Homeros', 'Homeros'],
    ['already inverted', 'Jansson, Tove', 'Jansson, Tove'],
    ['messy whitespace', '  Väinö   Linna ', 'Linna, Väinö'],
    ['decomposed accents', 'Va\u0308ino\u0308 Linna', 'Linna, Väinö'],
    [
      'corporate name (wrong, accepted)',
      'Werner Söderström Osakeyhtiö',
      'Osakeyhtiö, Werner Söderström',
    ],
    ['blank name', '   ', null],
  ])('%s', (_, input, expected) => {
    expect(deriveSortName(input)).toBe(expected)
  })
})

describe('sortNameField', () => {
  const field = sortNameField()

  it('keeps a passed-in sortName that differs from the derived one, trimmed', () => {
    const siblingData = { name: 'Aleksis Kivi', sortName: ' Stenvall, Alexis ' }
    expect(callHook(field, { value: ' Stenvall, Alexis ', siblingData, operation: 'create' })).toBe(
      'Stenvall, Alexis',
    )
  })

  it.each([
    ['inner whitespace', 'Kivi,  Aleksis', 'Kivi, Aleksis'],
    ['decomposed accents', 'Linna, Va\u0308ino\u0308', 'Linna, Väinö'],
  ])('normalises a kept sortName with %s', (_, value, expected) => {
    expect(callHook(field, { value, siblingData: { name: 'X Y' }, operation: 'create' })).toBe(
      expected,
    )
  })

  it.each([
    ['blank', '   '],
    ['null', null],
    ['missing', undefined],
  ])('derives from name when sortName is %s', (_, value) => {
    const siblingData = { name: 'Aleksis Kivi', sortName: value }
    expect(callHook(field, { value, siblingData, operation: 'create' })).toBe('Kivi, Aleksis')
  })

  it('keeps the stored sortName when name changes', () => {
    const previousSiblingDoc = { name: 'Kivi', sortName: 'Stenvall, Alexis' }
    expect(
      callHook(field, {
        value: 'Stenvall, Alexis',
        siblingData: { name: 'Aleksis Kivi' },
        previousSiblingDoc,
        operation: 'update',
      }),
    ).toBe('Stenvall, Alexis')
  })

  it('derives from the new name when the stored sortName is empty', () => {
    const previousSiblingDoc = { name: 'Kivi', sortName: null }
    expect(
      callHook(field, {
        value: null,
        siblingData: { name: 'Aleksis Kivi' },
        previousSiblingDoc,
        operation: 'update',
      }),
    ).toBe('Kivi, Aleksis')
  })

  it('derives from the stored name on an update without one', () => {
    const previousSiblingDoc = { name: 'Aleksis Kivi', sortName: null }
    expect(
      callHook(field, { value: null, siblingData: {}, previousSiblingDoc, operation: 'update' }),
    ).toBe('Kivi, Aleksis')
  })

  it.each([
    ['blank', { name: '   ' }],
    ['missing', {}],
  ])('gives null for a %s name without throwing', (_, siblingData) => {
    expect(callHook(field, { siblingData, operation: 'create' })).toBeNull()
  })
})
