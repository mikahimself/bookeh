import type { CandidateId } from '@/lib/catalogue/pick'

/**
 * What Add to wishlist saves (`saveEntryAction`): the ISBN's Book with the
 * candidate shown, the Not found form's typed text with its ISBN, if any, or
 * a Book the user holds. Not in a `'use server'` file: those export only
 * async functions.
 */
export type EntryTarget =
  | { isbn13: string; pick?: number; candidate?: CandidateId }
  | { manual: { title: string; author: string; isbn13?: string } }
  | { bookId: number }
