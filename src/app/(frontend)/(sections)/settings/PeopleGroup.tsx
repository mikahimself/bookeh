'use client'

import { useTranslations } from 'next-intl'

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
 * loans, open and returned. A Person with loans can't be deleted: Delete says
 * so and offers Merge instead.
 */
export function PeopleGroup({ people }: { people: readonly PersonUse[] }) {
  const t = useTranslations('settings')
  return (
    <ManagedList
      items={people.map(({ id, name, loans }) => ({ id, name, count: loans }))}
      actions={actions}
      strings={{
        empty: t('noPeople'),
        add: t('addPerson'),
        count: ({ count }) => t('personCount', { count }),
        mergeInto: ({ name }) => t.rich('personMergeInto', { name, typed }),
        mergeTitle: (source, target) =>
          t.rich('personMergeTitle', { source: source.name, target: target.name, typed }),
        mergeBody: (source, target) =>
          t('personMergeBody', { count: source.count, target: target.name }),
        deleteTitle: ({ name }) => t.rich('deleteTitle', { name, typed }),
      }}
      inUse={{
        test: ({ count }) => count > 0,
        title: ({ name }) => t.rich('personInUseTitle', { name, typed }),
        body: ({ count }) => t('personInUseBody', { count }),
        mergeOffer: t('personInUseMerge'),
      }}
    />
  )
}
