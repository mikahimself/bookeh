import { describe, expect, it } from 'vitest'

import { safeNextPath } from '@/app/(frontend)/login/nextPath'

describe('safeNextPath', () => {
  it.each([
    ['missing', undefined],
    ['null', null],
    ['a number', 42],
    ['an array', ['/loans']],
    ['empty', ''],
    ['relative', 'foo'],
    ['protocol-relative', '//evil.example'],
    ['protocol-relative with a path', '//evil.example/loans'],
    ['backslash', '/\\evil.example'],
    ['a dot segment to //', '/..//evil.example'],
    ['a dot segment to // with a path', '/.//evil.example/x'],
    ['a parent segment to //', '/a/..//evil.example'],
    ['absolute URL', 'https://evil.example/'],
    ['a tab', '/x\tevil'],
    ['a newline', '/x\n'],
    ['a carriage return', '/x\r//evil.example'],
    ['/login', '/login'],
    ['/login with a next', '/login?next=/x'],
    ['/login/', '/login/'],
  ])('turns %s into /', (_, value) => {
    expect(safeNextPath(value)).toBe('/')
  })

  it.each(['/', '/loans', '/?q=a&b=1', '/wishlists/3?entry=5#x', '/loans?x=1'])(
    'returns %s unchanged',
    (value) => {
      expect(safeNextPath(value)).toBe(value)
    },
  )
})
