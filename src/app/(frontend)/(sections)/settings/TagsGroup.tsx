'use client'

import { useTranslations } from 'next-intl'

import { deleteTagAction, mergeTagAction, renameTagAction } from './actions'
import { ManagedList, typed, type ManagedItem } from './ManagedList'

const actions = {
  rename: renameTagAction,
  merge: mergeTagAction,
  remove: deleteTagAction,
}

/**
 * Settings → Tags, My genres and My themes (UX-DR50): one managed list per
 * label kind with each label's copy count. Labels are created from a Book, so
 * there is no Add; Merge and Delete say how many books are affected.
 */
export function TagsGroup({
  kind,
  items,
}: {
  kind: 'tag' | 'genre' | 'theme'
  items: readonly ManagedItem[]
}) {
  const t = useTranslations('settings')
  return (
    <ManagedList
      items={items}
      actions={actions}
      strings={{
        empty: t(`${kind}Empty`),
        count: ({ count }) => t('locationCount', { count }),
        mergeInto: ({ name }) => t.rich('tagMergeInto', { name, typed }),
        mergeTitle: (source, target) =>
          t.rich('tagMergeTitle', { source: source.name, target: target.name, typed }),
        mergeBody: (source, target) =>
          t('tagMergeBody', { count: source.count, target: target.name }),
        deleteTitle: ({ name }) => t.rich('deleteTitle', { name, typed }),
        deleteBody: ({ count }) => t('tagDeleteBody', { count }),
      }}
    />
  )
}
