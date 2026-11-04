import { describe, expect, it } from 'vitest'

import { lookupRows } from '@/app/(frontend)/scan/find/lookupRows'

import { copy, hit, mine } from '../helpers/lookupFixtures'

// EXPERIENCE.md, Lookup: the two groups, their hrefs, their edition lines, the
// own group's lent marker, and the overlap an own Book takes out of Elsewhere.

describe('lookupRows', () => {
  it('groups own Books first and keeps each search its own order', () => {
    const { mine: own, elsewhere } = lookupRows(
      [mine(), mine({ bookId: 2, isbn13: null, title: 'Taikatalvi' })],
      [hit(), hit({ isbn13: '9789510222222', title: 'Komisario Palmu' })],
    )
    expect(own.map((row) => row.title)).toEqual(['Tuntematon sotilas', 'Taikatalvi'])
    expect(elsewhere.map((row) => row.title)).toEqual(['Sinuhe egyptiläinen', 'Komisario Palmu'])
  })

  it('addresses an own row by Book id and an Elsewhere row by ISBN', () => {
    const { mine: own, elsewhere } = lookupRows([mine({ bookId: 7 })], [hit()])
    expect(own[0].href).toBe('/scan?book=7')
    expect(elsewhere[0].href).toBe('/scan?isbn=9789511111118')
  })

  it('addresses an own Book without an ISBN by Book id too, and never drops it', () => {
    const { mine: own, elsewhere } = lookupRows([mine({ bookId: 9, isbn13: null })], [hit()])
    expect(own[0].href).toBe('/scan?book=9')
    expect(elsewhere).toHaveLength(1)
  })

  it('drops an Elsewhere hit for a Book already in the own group', () => {
    const { mine: own, elsewhere } = lookupRows(
      [mine({ isbn13: '9789511111118' })],
      [hit(), hit({ isbn13: '9789510222222', title: 'Komisario Palmu' })],
    )
    expect(own).toHaveLength(1)
    expect(elsewhere.map((row) => row.title)).toEqual(['Komisario Palmu'])
  })

  it('writes the authors line and the edition line of each group', () => {
    const { mine: own, elsewhere } = lookupRows(
      [
        mine({
          authors: [
            { id: 3, name: 'Väinö Linna' },
            { id: 4, name: 'Toinen' },
          ],
        }),
      ],
      [hit()],
    )
    expect(own[0].authors).toBe('Väinö Linna, Toinen')
    // `EffectiveBook` stores no binding.
    expect(own[0].edition).toBe('1954 · WSOY')
    expect(elsewhere[0].authors).toBe('Mika Waltari')
    expect(elsewhere[0].edition).toBe('nidottu · 1945 · WSOY')
  })

  it('leaves no stray separator for a hit with a year alone', () => {
    const { elsewhere } = lookupRows(
      [],
      [hit({ binding: undefined, publisher: undefined, authors: [] })],
    )
    expect(elsewhere[0].edition).toBe('1945')
    expect(elsewhere[0].authors).toBe('')
  })

  it('takes a cover from the preview route only when a source had one', () => {
    const { mine: own, elsewhere } = lookupRows(
      [mine({ coverUrl: '/api/media/file/cover.jpg' })],
      [hit({ hasCover: true }), hit({ isbn13: '9789510222222' })],
    )
    expect(own[0].cover).toBe('/api/media/file/cover.jpg')
    expect(elsewhere[0].cover).toBe('/data/cover/9789511111118?context=search')
    expect(elsewhere[1].cover).toBe(null)
  })

  it('ends an own row with the first lent copy’s borrower, and no other row', () => {
    const lent = copy({
      copyId: 12,
      loan: { loanId: 4, person: { id: 5, name: 'Hilla' }, since: '2026-01-02' },
    })
    const { mine: own, elsewhere } = lookupRows(
      [
        mine({}, [copy(), lent]),
        // An ordered copy is never lent, open loan or not.
        mine({ bookId: 2 }, [{ ...lent, status: 'ordered' }]),
      ],
      [hit()],
    )
    expect(own.map((row) => row.lentTo)).toEqual(['Hilla', null])
    expect(elsewhere[0].lentTo).toBe(null)
  })
})
