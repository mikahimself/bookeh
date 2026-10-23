'use server'

import { getTranslations } from 'next-intl/server'

import { lookupAgain, type LookupAgainResult } from '@/lib/catalogue/lookupAgain'
import { type CandidateId, isCandidateId } from '@/lib/catalogue/pick'
import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'

import { answerEditions, editionLines } from '../scan/answer'
import type { EditionRow } from '../scan/EditionPicker'

/**
 * What Look it up again answers the client: `lookupAgain()`'s result, with
 * `editions` as the Picker's rows (lines built here, `editionLines()`) and
 * each row's candidate identity, which the second call sends back.
 */
export type LookUpAgainOutcome =
  | Exclude<LookupAgainResult, { kind: 'editions' }>
  | { kind: 'editions'; pick: number; rows: EditionRow[]; ids: CandidateId[] }

const isId = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0

/**
 * FR-12, D-8: Look it up again from Book detail or the In library Answer.
 * Anything but `{ bookId }` with an optional `candidate` (the edition picked)
 * is `VALIDATION`. The gate is the service's (`NOT_FOUND`). No Undo.
 */
export async function lookUpAgainAction(input: unknown): Promise<ActionResult<LookUpAgainOutcome>> {
  return runAction(async () => {
    const ctx = await requireUserOrThrow()
    if (typeof input !== 'object' || input === null) throw new DomainError('VALIDATION')
    const { bookId, candidate } = input as Record<string, unknown>
    if (!isId(bookId) || (candidate !== undefined && !isCandidateId(candidate))) {
      throw new DomainError('VALIDATION')
    }
    const result = await lookupAgain(ctx, {
      bookId,
      ...(candidate !== undefined && {
        candidate: { source: candidate.source, recordId: candidate.recordId },
      }),
    })
    if (result.kind !== 'editions') return result

    const { candidates, pick } = result
    const t = await getTranslations('answer')
    // Every candidate carries the ISBN asked for (the `Source` contract).
    const editions = answerEditions(candidates[0]!.isbn13, candidates)
    const lines = editionLines(editions, {
      pages: (pages) => t('pages', { pages }),
      unnamed: (n) => t('unnamedEdition', { n }),
    })
    return {
      kind: 'editions',
      pick,
      rows: editions.map(({ cover, title }, i) => ({ cover, title, line: lines[i]! })),
      ids: candidates.map(({ source, recordId }) => ({ source, recordId })),
    }
  })
}
