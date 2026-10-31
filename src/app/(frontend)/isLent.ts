import type { CopyLine } from '@/lib/books/holdings'

/**
 * Whether a copy is out on a loan: an owned copy with an open loan. An ordered
 * copy is never lent. Not in `src/lib`: client components may not import it
 * from there.
 */
export const isLent = <C extends Pick<CopyLine, 'status' | 'loan'>>(
  copy: C,
): copy is C & { loan: NonNullable<CopyLine['loan']> } =>
  copy.status === 'owned' && copy.loan !== null
