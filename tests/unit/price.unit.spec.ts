import { describe, expect, it } from 'vitest'

import { parsePrice } from '@/app/(frontend)/(sections)/price'

describe('parsePrice', () => {
  it.each([
    ['24,90', 2490],
    ['24.90', 2490],
    ['24', 2400],
    ['24,9', 2490],
    [' 24,90 € ', 2490],
    ['€24.90', 2490],
    ['1 234,50', 123450],
    ['0', 0],
    ['99999,99', 9_999_999],
    ['', null],
    ['  ', null],
    ['€', 'invalid'],
    ['€ ', 'invalid'],
    ['abc', 'invalid'],
    ['-1', 'invalid'],
    ['1,234', 'invalid'],
    ['24,', 'invalid'],
    ['100000', 'tooLarge'],
  ] as const)('reads %j as %j', (text, expected) => {
    expect(parsePrice(text)).toBe(expected)
  })
})
