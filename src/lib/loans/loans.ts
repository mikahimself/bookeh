import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { idOf, isRowId, type Ref } from '@/lib/payload/ref'
import { withTransaction } from '@/lib/payload/transaction'
import { resolvePerson } from '@/lib/people/people'
import type { Undone } from '@/lib/undo/undo'

import { helsinkiToday, isCalendarDate } from './dates'

/** Spine, Shared shapes. Declared here, as in `lib/people`. */
type Named = { id: number; name: string }

/** Spine, Shared shapes: the loan `lendCopy()` opened and its borrower. */
export type Lent = { loanId: number; person: Named }

/** A given date checked as a calendar date (`VALIDATION` on `field`), or today in Helsinki. */
function dateOrToday(value: string | undefined, field: 'lentOn' | 'returnedOn'): string {
  if (value === undefined) return helsinkiToday()
  if (!isCalendarDate(value))
    throw new DomainError('VALIDATION', { fields: { [field]: 'VALIDATION' } })
  return value
}

/**
 * Spine, AD-18, AD-19 and AD-20, FR-35: Lend. Opens a loan of one of the
 * context user's owned copies to a Person, in the caller's transaction or one
 * of its own, and resolves to the loan's id and the borrower with the restore
 * that deletes the loan. Records nothing: callers wrap it in `withUndo()`.
 *
 * An id that is not a row id (`isRowId()`), or not the viewer's copy (a gone
 * copy, or another user's, for the admin too), fails with `NOT_FOUND`; the
 * reads filter on `owner` explicitly as well as through `ownerAccess` (FR-48).
 * `lentOn` defaults to today in `Europe/Helsinki`; one that is not a
 * `YYYY-MM-DD` calendar date or is after today fails with `VALIDATION` on
 * `lentOn` before any read. An ordered copy, or one with an open loan, fails
 * with `VALIDATION` on `copy`. The copy is never written: it keeps its status
 * and location. `person` resolves through `resolvePerson()` (`VALIDATION` on
 * `person`); a Person created there stays after Undo. A lend that loses a race
 * against a concurrent one surfaces as the open-loan index's `ValidationError`
 * on `copy_id`, unchanged.
 *
 * The restore deletes the loan through the gateway as the restoring user and
 * skips a loan that is gone. It closes over the loan's id only.
 */
export async function lendCopy(
  ctx: Context,
  copyId: number,
  person: Ref,
  lentOn?: string,
): Promise<Undone<Lent>> {
  if (!isRowId(copyId)) throw new DomainError('NOT_FOUND')
  const date = dateOrToday(lentOn, 'lentOn')
  if (date > helsinkiToday()) {
    throw new DomainError('VALIDATION', { fields: { lentOn: 'VALIDATION' } })
  }

  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'copies',
      where: { and: [{ id: { equals: copyId } }, { owner: { equals: tx.user.id } }] },
      select: { status: true },
      limit: 1,
      depth: 0,
      pagination: false,
    })
    const copy = docs[0]
    if (!copy) throw new DomainError('NOT_FOUND')
    if (copy.status !== 'owned') {
      throw new DomainError('VALIDATION', { fields: { copy: 'VALIDATION' } })
    }

    // AD-19: the index is the guarantee; this check only raises the error first.
    const open = await gateway.count(tx, {
      collection: 'loans',
      where: {
        and: [
          { copy: { equals: copyId } },
          { owner: { equals: tx.user.id } },
          { returnedOn: { exists: false } },
        ],
      },
    })
    if (open.totalDocs > 0) {
      throw new DomainError('VALIDATION', { fields: { copy: 'VALIDATION' } })
    }

    const personId = await resolvePerson(tx, person)
    // `owner` is what Payload's create type requires; the hook sets it from the request.
    const loan = await gateway.create(tx, {
      collection: 'loans',
      data: { owner: tx.user.id, copy: copyId, person: personId, lentOn: date },
      depth: 0,
    })
    const { name } = await gateway.findByID(tx, {
      collection: 'people',
      id: personId,
      select: { name: true },
      depth: 0,
    })

    const loanId = loan.id
    return {
      data: { loanId, person: { id: personId, name } },
      restore: (rtx) => deleteLoan(rtx, loanId),
    }
  })
}

/**
 * Spine, AD-18 and AD-20, FR-36: Returned. Closes one of the context user's
 * open loans, in the caller's transaction or one of its own, and resolves to
 * its id with the restore that opens it again. The row stays as history.
 * Records nothing: callers wrap it in `withUndo()`.
 *
 * An id that is not a row id, or not the viewer's loan (gone, or another
 * user's, for the admin too), fails with `NOT_FOUND`; the read filters on
 * `owner` explicitly as well as through `ownerAccess` (FR-48). `returnedOn`
 * defaults to today in `Europe/Helsinki`; one that is not a `YYYY-MM-DD`
 * calendar date fails with `VALIDATION` on `returnedOn` before any read, and
 * one before the lending day fails the same way with no write. A loan already
 * returned fails with `VALIDATION` on `loan`.
 *
 * The restore clears `returnedOn` through the gateway as the restoring user
 * and skips a loan that is gone. When the copy has been lent again since, the
 * open-loan index refuses it and `undo()` fails with `UNDO_FAILED`.
 */
export async function returnLoan(
  ctx: Context,
  loanId: number,
  returnedOn?: string,
): Promise<Undone<{ loanId: number }>> {
  if (!isRowId(loanId)) throw new DomainError('NOT_FOUND')
  const date = dateOrToday(returnedOn, 'returnedOn')

  return withTransaction(ctx, async (tx) => {
    const { docs } = await gateway.find(tx, {
      collection: 'loans',
      where: { and: [{ id: { equals: loanId } }, { owner: { equals: tx.user.id } }] },
      select: { lentOn: true, returnedOn: true },
      limit: 1,
      depth: 0,
      pagination: false,
    })
    const loan = docs[0]
    if (!loan) throw new DomainError('NOT_FOUND')
    if (loan.returnedOn) {
      throw new DomainError('VALIDATION', { fields: { loan: 'VALIDATION' } })
    }
    if (date < loan.lentOn.slice(0, 10)) {
      throw new DomainError('VALIDATION', { fields: { returnedOn: 'VALIDATION' } })
    }

    await gateway.updateByID(tx, {
      collection: 'loans',
      id: loanId,
      data: { returnedOn: date },
      depth: 0,
    })
    return { data: { loanId }, restore: (rtx) => reopenLoan(rtx, loanId) }
  })
}

// `count` first: a failed `deleteByID` or `updateByID` (`NotFound`) would end the transaction.
async function loanExists(ctx: Context, id: number): Promise<boolean> {
  const { totalDocs } = await gateway.count(ctx, {
    collection: 'loans',
    where: { and: [{ id: { equals: id } }, { owner: { equals: ctx.user.id } }] },
  })
  return totalDocs > 0
}

async function deleteLoan(ctx: Context, id: number): Promise<void> {
  if (!(await loanExists(ctx, id))) return
  await gateway.deleteByID(ctx, { collection: 'loans', id, depth: 0 })
}

async function reopenLoan(ctx: Context, id: number): Promise<void> {
  if (!(await loanExists(ctx, id))) return
  await gateway.updateByID(ctx, {
    collection: 'loans',
    id,
    data: { returnedOn: null },
    depth: 0,
  })
}

/** Spine, Shared shapes: an open loan as the Loans section lists it. */
export type OpenLoan = {
  loanId: number
  copyId: number
  bookId: number
  person: Named
  since: string
}

/**
 * Spine, AD-7, FR-37: the context user's open loans (no `returnedOn`), the
 * longest out first: by `lentOn`, then by loan id. Each with its copy, the
 * copy's Book id, the borrower and `since`, the lending day as `YYYY-MM-DD`.
 * Every read filters on `owner` explicitly as well as through `ownerAccess`
 * (FR-48), so the admin sees only their own. Read whole, at `depth: 0`: the
 * caller hydrates the Books (`getEffectiveBooks()`). A loan whose copy or
 * Person has gone between the reads is left out.
 */
export async function openLoans(ctx: Context): Promise<OpenLoan[]> {
  const owner = { owner: { equals: ctx.user.id } }
  const { docs: loans } = await gateway.find(ctx, {
    collection: 'loans',
    where: { and: [owner, { returnedOn: { exists: false } }] },
    select: { copy: true, person: true, lentOn: true },
    sort: ['lentOn', 'id'],
    depth: 0,
    pagination: false,
  })
  if (loans.length === 0) return []

  const [{ docs: copies }, { docs: people }] = await Promise.all([
    gateway.find(ctx, {
      collection: 'copies',
      where: { and: [owner, { id: { in: [...new Set(loans.map((loan) => idOf(loan.copy)))] } }] },
      select: { book: true },
      depth: 0,
      pagination: false,
    }),
    gateway.find(ctx, {
      collection: 'people',
      where: {
        and: [owner, { id: { in: [...new Set(loans.map((loan) => idOf(loan.person)))] } }],
      },
      select: { name: true },
      depth: 0,
      pagination: false,
    }),
  ])
  const bookByCopy = new Map(copies.map((copy) => [copy.id, idOf(copy.book)]))
  const personById = new Map<number, Named>(people.map(({ id, name }) => [id, { id, name }]))

  return loans.flatMap((loan) => {
    const copyId = idOf(loan.copy)
    const bookId = bookByCopy.get(copyId)
    const person = personById.get(idOf(loan.person))
    if (bookId === undefined || !person) return []
    // Spine, Dates: `lentOn` is stored at 12:00 UTC and read back by its UTC date.
    return [{ loanId: loan.id, copyId, bookId, person, since: loan.lentOn.slice(0, 10) }]
  })
}
