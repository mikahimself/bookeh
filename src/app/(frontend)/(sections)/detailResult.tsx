import { logger } from '@/lib/errors'

import type { DetailResult } from './BookDetailSlot'
import { LoadFailed } from './LoadFailed'

/** Await the server renderer itself: try/catch around unresolved JSX cannot
 * catch an async detail read. Missing data remains its existing notice. */
export async function detailResult(read: () => Promise<DetailResult>): Promise<DetailResult> {
  try {
    return await read()
  } catch (err) {
    logger().error({ err }, 'The detail failed to load')
    return { kind: 'failed', content: <LoadFailed /> }
  }
}
