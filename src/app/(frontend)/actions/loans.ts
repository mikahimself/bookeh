'use server'

import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { lendCopy, returnLoan, type Lent } from '@/lib/loans/loans'
import { requireUserOrThrow } from '@/lib/payload/context'
import { isRowId } from '@/lib/payload/ref'
import { withUndo, type Undoable } from '@/lib/undo/undo'

import { parseRef } from '../ref'

// Lend and Returned, from Book detail and (6.11) the Loans section. Client
// input is checked here, never repaired: an id that is not a row id, a person
// that is not a `Ref` or a `lentOn` that is not a string is `VALIDATION` with
// no write. Dates and ownership are `lib/loans`'s. Both are undoable (AD-20).

function fieldsOf(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null) throw new DomainError('VALIDATION')
  return input as Record<string, unknown>
}

/**
 * FR-35: lends one of the viewer's owned copies to a Person (an id, or
 * `{ create }` matched by name or created), on `lentOn` or today, with Undo.
 */
export async function lendCopyAction(input: unknown): Promise<ActionResult<Undoable<Lent>>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const { copyId, person, lentOn } = fieldsOf(input)
    const ref = parseRef(person)
    if (!isRowId(copyId) || ref === undefined) throw new DomainError('VALIDATION')
    if (lentOn !== undefined && typeof lentOn !== 'string') throw new DomainError('VALIDATION')
    return withUndo(ctx, (tx) => lendCopy(tx, copyId, ref, lentOn))
  })
}

/** FR-36: Returned. Closes one of the viewer's open loans today, with Undo. */
export async function returnLoanAction(
  input: unknown,
): Promise<ActionResult<Undoable<{ loanId: number }>>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    const { loanId } = fieldsOf(input)
    if (!isRowId(loanId)) throw new DomainError('VALIDATION')
    return withUndo(ctx, (tx) => returnLoan(tx, loanId))
  })
}
