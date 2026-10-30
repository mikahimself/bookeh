import { describe, expect, it } from 'vitest'

import { limits } from '@/fields/limits'
import { clipCandidate } from '@/lib/catalogue/clipCandidate'
import type { SourceResult } from '@/lib/metadata/source'

const candidate = (extra: Partial<SourceResult>): SourceResult => ({
  isbn13: '9789510396358',
  title: 'Tuntematon sotilas',
  authors: [],
  subjects: [],
  themes: [],
  source: 'finna',
  recordId: 'r1',
  raw: {},
  ...extra,
})

describe('clipCandidate', () => {
  it('clips publisher and language to their limits', () => {
    const clipped = clipCandidate(
      candidate({
        publisher: 'x'.repeat(limits.publisher + 1),
        language: 'x'.repeat(limits.language + 1),
      }),
    )

    expect(clipped.publisher).toHaveLength(limits.publisher)
    expect(clipped.language).toHaveLength(limits.language)
  })

  it('leaves a negative number out and keeps zero', () => {
    const clipped = clipCandidate(candidate({ year: -5, pages: -1, seriesIndex: 0 }))

    expect(clipped).not.toHaveProperty('year')
    expect(clipped).not.toHaveProperty('pages')
    expect(clipped.seriesIndex).toBe(0)
  })
})
