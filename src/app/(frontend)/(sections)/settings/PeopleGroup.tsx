'use client'

import { useLocale, useTranslations } from 'next-intl'

import type { PersonUse } from '@/lib/people/people'

import {
  createPersonAction,
  deletePersonAction,
  mergePersonAction,
  renamePersonAction,
} from './actions'
import { ManagedList, typed } from './ManagedList'

const actions = {
  create: createPersonAction,
  rename: renamePersonAction,
  merge: mergePersonAction,
  remove: deletePersonAction,
}

/**
 * Settings → People (FR-34, UX-DR50): the managed list with each Person's
 * uses, loans (open and returned) and wishes (open and closed entries), as
 * "2 loans, 1 wish". A Person with any use can't be deleted: Delete says so
 * and offers Merge instead. The list's `count` is the sum; the text is built
 * here, the only place that knows a Person has two kinds of use.
 */
export function PeopleGroup({ people }: { people: readonly PersonUse[] }) {
  const t = useTranslations('settings')
  const list = new Intl.ListFormat(useLocale(), { type: 'conjunction' })
  const byId = new Map(people.map((person) => [person.id, person]))
  /** The non-zero uses, loans first; empty when there are none. */
  const parts = (id: number): string[] => {
    const person = byId.get(id)
    if (person === undefined) return []
    return [
      ...(person.loans > 0 ? [t('personCount', { count: person.loans })] : []),
      ...(person.entries > 0 ? [t('personWishes', { count: person.entries })] : []),
    ]
  }
  /** The uses inside a sentence: "2 loans and 1 wish". */
  const uses = (id: number): string => list.format(parts(id))

  return (
    <ManagedList
      items={people.map(({ id, name, loans, entries }) => ({
        id,
        name,
        count: loans + entries,
      }))}
      actions={actions}
      strings={{
        empty: t('noPeople'),
        add: t('addPerson'),
        count: ({ id, count }) =>
          count > 0 ? parts(id).join(', ') : t('personCount', { count: 0 }),
        mergeInto: ({ name }) => t.rich('personMergeInto', { name, typed }),
        mergeTitle: (source, target) =>
          t.rich('personMergeTitle', { source: source.name, target: target.name, typed }),
        mergeBody: (source, target) =>
          source.count > 0
            ? t('personMergeBody', { uses: uses(source.id), target: target.name })
            : t('personMergeNone', { target: target.name }),
        deleteTitle: ({ name }) => t.rich('deleteTitle', { name, typed }),
      }}
      inUse={{
        test: ({ count }) => count > 0,
        title: ({ name }) => t.rich('personInUseTitle', { name, typed }),
        body: ({ id }) => t('personInUseBody', { uses: uses(id) }),
        mergeOffer: t('personInUseMerge'),
      }}
    />
  )
}
