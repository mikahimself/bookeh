import { toNameKey } from '@/fields/nameKey'
import { DomainError } from '@/lib/errors'
import type { Context } from '@/lib/payload/context'
import * as gateway from '@/lib/payload/gateway'
import { systemThemes } from '@/lib/shelf/systemThemes'
import type { Tag } from '@/payload-types'

/** Lazily reads system names once per operation, after existing-label lookup. */
export function systemNameValidator(ctx: Context, kind: Tag['kind'], field: string) {
  let keys: Set<string> | undefined
  return async (name: string): Promise<void> => {
    if (kind === 'tag') return
    if (!keys) {
      const names =
        kind === 'theme'
          ? await systemThemes(ctx)
          : (
              await gateway.find(ctx, { collection: 'genres', pagination: false, depth: 0 })
            ).docs.flatMap((genre) => [genre.name, ...(genre.nameFi ? [genre.nameFi] : [])])
      keys = new Set(names.map(toNameKey))
    }
    if (keys.has(toNameKey(name))) {
      throw new DomainError('VALIDATION', { fields: { [field]: 'SYSTEM_NAME' } })
    }
  }
}
