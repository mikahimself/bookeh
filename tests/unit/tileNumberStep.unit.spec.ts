import { describe, expect, it } from 'vitest'

import { tileNumberStep } from '@/app/(frontend)/(sections)/stats/tileNumberStep'

describe('tileNumberStep', () => {
  it('keeps the largest step for short values', () => {
    expect(tileNumberStep(['14', '420', '€86', '1.3'])).toBe('xl')
  })

  it('steps all four down when one value is long', () => {
    expect(tileNumberStep(['14', '1,772', '1.3'])).toBe('l')
    expect(tileNumberStep(['14', '€47.90', '1.3'])).toBe('m')
    expect(tileNumberStep(['14', '123 456', '€1 234', '1.3'])).toBe('s')
  })

  it('falls to the smallest step when nothing fits', () => {
    expect(tileNumberStep(['1234567890123'])).toBe('s')
  })
})
