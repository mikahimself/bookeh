'use client'

import { useTranslations } from 'next-intl'

import {
  createLocationAction,
  deleteLocationAction,
  mergeLocationAction,
  renameLocationAction,
} from './actions'
import { ManagedList, typed, type ManagedItem } from './ManagedList'

/** A location as Settings lists it: its name and how many of the user's copies are there. */
export type CountedLocation = ManagedItem

const actions = {
  create: createLocationAction,
  rename: renameLocationAction,
  merge: mergeLocationAction,
  remove: deleteLocationAction,
}

/**
 * Settings → Locations (FR-31, UX-DR50): the managed list with each
 * location's copy count; Delete says how many books lose their location.
 */
export function LocationsGroup({ locations }: { locations: readonly CountedLocation[] }) {
  const t = useTranslations('settings')
  return (
    <ManagedList
      items={locations}
      actions={actions}
      strings={{
        empty: t('noLocations'),
        add: t('addLocation'),
        count: ({ count }) => t('locationCount', { count }),
        mergeInto: ({ name }) => t.rich('mergeInto', { name, typed }),
        mergeTitle: (source, target) =>
          t.rich('mergeTitle', { source: source.name, target: target.name, typed }),
        mergeBody: (source, target) => t('mergeBody', { count: source.count, target: target.name }),
        deleteTitle: ({ name }) => t.rich('deleteTitle', { name, typed }),
        deleteBody: ({ count }) => t('deleteBody', { count }),
      }}
    />
  )
}
