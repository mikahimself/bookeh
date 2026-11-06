import { describe, expect, it } from 'vitest'

import type { CopyLine, EntryLine, Holdings } from '@/lib/books/holdings'
import { answerFacts, type AnswerHeading } from '@/lib/catalogue/answerFacts'

const HOME = { id: 1, name: 'Home' }

const ownedCopy: CopyLine = {
  copyId: 10,
  status: 'owned',
  location: HOME,
  note: null,
  loan: null,
  acquiredAt: '2026-10-12',
  price: null,
}
const lentCopy: CopyLine = {
  copyId: 11,
  status: 'owned',
  location: HOME,
  note: null,
  loan: { loanId: 5, person: { id: 2, name: 'Anni' }, since: '2026-10-01' },
  acquiredAt: '2026-10-12',
  price: null,
}
const orderedCopy: CopyLine = {
  copyId: 12,
  status: 'ordered',
  location: null,
  note: 'from the shop',
  loan: null,
  acquiredAt: '2026-10-12',
  price: null,
}
const ownEntry: EntryLine = { entryId: 20, wishlist: { id: 3, name: 'Mine' }, forPerson: null }
const personEntry: EntryLine = {
  entryId: 21,
  wishlist: { id: 4, name: 'Gifts' },
  forPerson: { id: 2, name: 'Anni' },
}

type Flags = { owned: boolean; lent: boolean; ordered: boolean; wished: boolean }

const holdingsFor = ({ owned, lent, ordered, wished }: Flags): Holdings => ({
  copies: [
    ...(owned ? [ownedCopy] : []),
    ...(lent ? [lentCopy] : []),
    ...(ordered ? [orderedCopy] : []),
  ],
  entries: wished ? [ownEntry] : [],
})

const combinations: Flags[] = [false, true].flatMap((owned) =>
  [false, true].flatMap((lent) =>
    [false, true].flatMap((ordered) =>
      [false, true].map((wished) => ({ owned, lent, ordered, wished })),
    ),
  ),
)

const expectedHeading = ({ owned, lent, ordered, wished }: Flags): AnswerHeading =>
  owned || lent ? 'inLibrary' : ordered ? 'ordered' : wished ? 'onWishlist' : 'notInLibrary'

describe('answerFacts', () => {
  it.each(combinations)(
    'heading for owned=$owned lent=$lent ordered=$ordered wished=$wished',
    (flags) => {
      const holdings = holdingsFor(flags)
      const { heading, lines } = answerFacts(holdings)

      expect(heading).toBe(expectedHeading(flags))
      expect(lines).toEqual([
        ...holdings.copies.map((copy) => ({ kind: 'copy', copy })),
        ...holdings.entries.map((entry) => ({ kind: 'entry', entry })),
      ])
    },
  )

  it('states nothing for empty holdings', () => {
    expect(answerFacts({ copies: [], entries: [] })).toEqual({
      heading: 'notInLibrary',
      lines: [],
    })
  })

  it('reads ordered from several ordered copies and lines them all', () => {
    const second: CopyLine = { ...orderedCopy, copyId: 13, note: null }

    expect(answerFacts({ copies: [orderedCopy, second], entries: [] })).toEqual({
      heading: 'ordered',
      lines: [
        { kind: 'copy', copy: orderedCopy },
        { kind: 'copy', copy: second },
      ],
    })
  })

  it('lines every entry of a Book held only by wishes, in order', () => {
    expect(answerFacts({ copies: [], entries: [ownEntry, personEntry] })).toEqual({
      heading: 'onWishlist',
      lines: [
        { kind: 'entry', entry: ownEntry },
        { kind: 'entry', entry: personEntry },
      ],
    })
  })

  it('reads onWishlist from an entry made for a Person', () => {
    expect(answerFacts({ copies: [], entries: [personEntry] })).toEqual({
      heading: 'onWishlist',
      lines: [{ kind: 'entry', entry: personEntry }],
    })
  })

  it('keeps copies before entries, each in holdings order, rows unchanged', () => {
    const holdings: Holdings = {
      copies: [lentCopy, ownedCopy, orderedCopy],
      entries: [personEntry, ownEntry],
    }

    const before = structuredClone(holdings)

    const { lines } = answerFacts(holdings)

    expect(lines).toEqual([
      { kind: 'copy', copy: lentCopy },
      { kind: 'copy', copy: ownedCopy },
      { kind: 'copy', copy: orderedCopy },
      { kind: 'entry', entry: personEntry },
      { kind: 'entry', entry: ownEntry },
    ])
    expect(holdings).toEqual(before)
  })

  it('reads inLibrary from an owned copy behind an ordered one', () => {
    expect(answerFacts({ copies: [orderedCopy, ownedCopy], entries: [] })).toEqual({
      heading: 'inLibrary',
      lines: [
        { kind: 'copy', copy: orderedCopy },
        { kind: 'copy', copy: ownedCopy },
      ],
    })
  })
})
