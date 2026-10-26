import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf } from '@/lib/payload/ref'

import type { Named } from './effectiveBook'

// Spine, Structural Seed (Shared shapes, `src/lib/books`).

/**
 * One of the viewer's copies of a Book as the surface shows it. `loan` is the
 * copy's open loan, or `null` when the copy is not lent (returned loans are
 * history, not holdings); `since` is its lending date as `YYYY-MM-DD`.
 */
export type CopyLine = {
  copyId: number
  status: 'owned' | 'ordered'
  location: Named | null
  note: string | null
  loan: { loanId: number; person: Named; since: string } | null
}

/**
 * An open wishlist entry of the viewer's on a Book. Typed now; filled when
 * the wishlist reader arrives (H14, Epic 7).
 */
export type EntryLine = { entryId: number; wishlist: Named; forPerson: Named | null }

/** What the viewer holds of a Book: their copies and their open entries. */
export type Holdings = { copies: CopyLine[]; entries: EntryLine[] }

const empty = (): Holdings => ({ copies: [], entries: [] })

/**
 * Spine, AD-9 (Lookup) and the shelf (AD-7): the one reader of what the
 * viewer holds of a Book, keyed by Book id. Every requested id is present,
 * `{ copies: [], entries: [] }` when they hold nothing of it. The Book's
 * current readability plays no part: `readableRelation` checks it at write
 * time only, and a shared Book the admin later made private still lists the
 * viewer's copies; callers take readability from `getEffectiveBooks()`. The
 * gateway's `find` on `copies` and `locations` reaches the viewer's own rows
 * alone (AD-6/AD-17, the admin included), so no `owner` condition is needed;
 * so do its reads of `loans` and `people` (`ownerAccess`, FR-48). Copies are
 * read at `depth: 0`, since a populated `book` would carry the whole Book doc
 * (`rawMetadata` for the admin, AD-9); their locations come from one read of
 * the distinct ids. Their open loans (`returnedOn` unset, at most one per
 * copy, AD-19) come from one read on the copy ids, and the borrowers from one
 * read of the distinct Person ids. Oldest copy first, ties by id (AD-7).
 * `entries` stays empty until Epic 7.
 */
export async function getHoldings(
  ctx: Context,
  bookIds: readonly number[],
): Promise<Map<number, Holdings>> {
  const result = new Map<number, Holdings>()
  if (bookIds.length === 0) return result
  for (const id of bookIds) result.set(id, empty())

  const { docs: copies } = await gateway.find(ctx, {
    collection: 'copies',
    where: { book: { in: [...bookIds] } },
    sort: ['createdAt', 'id'],
    depth: 0,
    pagination: false,
  })
  if (copies.length === 0) return result

  const locationIds = [
    ...new Set(copies.flatMap((copy) => (copy.location == null ? [] : [idOf(copy.location)]))),
  ]
  const locationById = new Map<number, Named>()
  if (locationIds.length > 0) {
    const { docs: locations } = await gateway.find(ctx, {
      collection: 'locations',
      where: { id: { in: locationIds } },
      select: { name: true },
      depth: 0,
      pagination: false,
    })
    for (const { id, name } of locations) locationById.set(id, { id, name })
  }

  const loanByCopy = await openLoansOf(
    ctx,
    copies.map((copy) => copy.id),
  )

  for (const copy of copies) {
    const line: CopyLine = {
      copyId: copy.id,
      status: copy.status,
      location: copy.location == null ? null : (locationById.get(idOf(copy.location)) ?? null),
      // An omitted `notes` is stored as `null`; a form submitting the field
      // empty stores `''`. Both are no note here.
      note: copy.notes ? copy.notes : null,
      loan: loanByCopy.get(copy.id) ?? null,
    }
    // Never missing: the `where` is `book in bookIds` and every id was seeded.
    result.get(idOf(copy.book))!.copies.push(line)
  }
  return result
}

/** The open loan of each of `copyIds` that has one, with its borrower. */
async function openLoansOf(
  ctx: Context,
  copyIds: number[],
): Promise<Map<number, NonNullable<CopyLine['loan']>>> {
  const loanByCopy = new Map<number, NonNullable<CopyLine['loan']>>()
  const { docs: loans } = await gateway.find(ctx, {
    collection: 'loans',
    where: { copy: { in: copyIds }, returnedOn: { exists: false } },
    select: { copy: true, person: true, lentOn: true },
    depth: 0,
    pagination: false,
  })
  if (loans.length === 0) return loanByCopy

  const { docs: people } = await gateway.find(ctx, {
    collection: 'people',
    where: { id: { in: [...new Set(loans.map((loan) => idOf(loan.person)))] } },
    select: { name: true },
    depth: 0,
    pagination: false,
  })
  const personById = new Map<number, Named>(people.map(({ id, name }) => [id, { id, name }]))

  for (const loan of loans) {
    const person = personById.get(idOf(loan.person))
    // Spine, Dates: `lentOn` is stored at 12:00 UTC and read back by its UTC date.
    if (person) {
      loanByCopy.set(idOf(loan.copy), { loanId: loan.id, person, since: loan.lentOn.slice(0, 10) })
    }
  }
  return loanByCopy
}
