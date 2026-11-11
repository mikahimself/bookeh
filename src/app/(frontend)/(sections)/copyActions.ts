import type { CopyLine } from '@/lib/books/holdings'

import { isLent } from '../isLent'

export type CopyActionName = 'returned' | 'received' | 'lend' | 'move' | 'remove'
export type CopyAction = { name: CopyActionName; copies: CopyLine[] }

/** Copy state alone determines eligibility; location availability belongs to the surface. */
export function copyActions(lines: readonly CopyLine[]): CopyAction[] {
  const eligible: Record<CopyActionName, CopyLine[]> = {
    returned: [],
    received: [],
    lend: [],
    move: [],
    remove: [],
  }
  for (const copy of lines) {
    if (copy.status === 'ordered') eligible.received.push(copy)
    else if (isLent(copy)) eligible.returned.push(copy)
    else {
      eligible.lend.push(copy)
      eligible.move.push(copy)
      eligible.remove.push(copy)
    }
  }
  return (Object.keys(eligible) as CopyActionName[])
    .filter((name) => eligible[name].length > 0)
    .map((name) => ({ name, copies: eligible[name] }))
}
