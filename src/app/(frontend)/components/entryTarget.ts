import type { IsbnInput, ManualInput } from '../saveInput'

/**
 * What Add to wishlist saves (`saveEntryAction`): the ISBN's Book with the
 * candidate shown, the Not found form's typed text with its ISBN, if any, or
 * a Book the user holds. Not in a `'use server'` file: those export only
 * async functions.
 */
export type EntryTarget = IsbnInput | { manual: ManualInput } | { bookId: number }
