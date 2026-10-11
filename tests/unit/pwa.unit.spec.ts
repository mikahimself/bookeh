import { describe, expect, it } from 'vitest'

import { themeColorFor } from '../../src/app/(frontend)/pwa'

describe('themeColorFor', () => {
  it('gives one colour for a fixed theme', () => {
    expect(themeColorFor('light')).toBe('#FFFFFF')
    expect(themeColorFor('dark')).toBe('#14181D')
  })

  it('gives a light and dark pair following the OS for system', () => {
    expect(themeColorFor('system')).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
      { media: '(prefers-color-scheme: dark)', color: '#14181D' },
    ])
  })
})
