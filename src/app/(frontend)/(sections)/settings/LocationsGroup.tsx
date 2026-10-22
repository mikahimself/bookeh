'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from 'react'

import type { ActionResult, ErrorCode } from '@/lib/errors'

import { Button } from '../../components/Button'
import { ActionLink } from '../../components/Link'
import { ListRow } from '../../components/ListRow'
import { settleAction, useReportFailure } from '../../components/request'
import { TextField } from '../../components/TextField'
import { Dialog } from '../../components/ui/Dialog'
import { Picker } from '../../components/ui/Picker'
import {
  createLocationAction,
  deleteLocationAction,
  mergeLocationAction,
  renameLocationAction,
} from './actions'

/** A location as Settings lists it: its name and how many of the user's copies are there. */
export type CountedLocation = { id: number; name: string; count: number }

/** The service's normalisation, repeated only to tell an empty or unchanged name. */
const normalise = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ')

/** What a failed save shows under the field: a message, and for a rename the location in the way. */
type FieldError = { message: ReactNode; sent: string }

/**
 * The inline name field of Add and Rename: Enter or leaving the field saves;
 * an empty or unchanged name, or `Esc`, drops it with no call. A blank or
 * taken name keeps the field open with its message (and, given `mergeInto`,
 * a Merge Link);
 * leaving the field again with the same name sends nothing. Any other
 * failure is reported, and `NOT_FOUND` refreshes the list. Success refreshes
 * and closes the field in one transition, so the new list replaces it.
 */
function NameField({
  initial,
  save,
  onDone,
  mergeInto,
}: {
  initial: string
  save: (name: string) => Promise<ActionResult<null>>
  onDone: () => void
  /** Given the location in the way, what a Merge Link after "That name is already in use." does. */
  mergeInto?: (conflictId: number) => (() => void) | null
}) {
  const t = useTranslations()
  const router = useRouter()
  const report = useReportFailure()
  const [value, setValue] = useState(initial)
  const [error, setError] = useState<FieldError | null>(null)
  const [pending, startTransition] = useTransition()
  const dropping = useRef(false)

  const fieldFailure = (
    code: ErrorCode,
    fields?: Record<string, ErrorCode>,
    conflictId?: number,
  ) => {
    if (code === 'VALIDATION' && fields?.name) return t('settings.locationNameRequired')
    if (code !== 'NAME_TAKEN') return null
    const merge = conflictId === undefined ? null : (mergeInto?.(conflictId) ?? null)
    if (merge === null) return t('errors.NAME_TAKEN')
    return (
      <>
        {t('errors.NAME_TAKEN')} <ActionLink onClick={merge}>{t('settings.merge')}</ActionLink>
      </>
    )
  }

  const commit = () => {
    const sent = normalise(value)
    if (dropping.current || sent === '' || sent === normalise(initial)) {
      dropping.current = false
      onDone()
      return
    }
    // The same name already failed in the field: nothing new to send (a tap on its Merge Link blurs).
    if (pending || error?.sent === sent) return
    startTransition(async () => {
      const result = await settleAction(save(sent))
      if (result.ok) {
        startTransition(() => {
          onDone()
          router.refresh()
        })
        return
      }
      const message = fieldFailure(result.code, result.fields, result.conflictId)
      if (message !== null) {
        setError({ message, sent })
        return
      }
      report(result.code)
      if (result.code === 'NOT_FOUND') {
        startTransition(() => {
          onDone()
          router.refresh()
        })
      }
    })
  }

  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') event.currentTarget.blur()
    if (event.key === 'Escape') {
      dropping.current = true
      event.currentTarget.blur()
    }
  }

  return (
    <li className="py-1">
      <TextField
        label={t('settings.locationName')}
        name="locationName"
        autoComplete="off"
        maxLength={200}
        enterKeyHint="done"
        autoFocus
        value={value}
        onChange={(event) => {
          setValue(event.target.value)
          setError(null)
        }}
        onBlur={commit}
        onKeyDown={keys}
        error={error?.message}
      />
    </li>
  )
}

type Merge = { source: CountedLocation; target: CountedLocation }

/**
 * Settings → Locations (FR-31, UX-DR50): one List row per location with its
 * copy count and Rename, Merge (only with another location) and Delete
 * Links; "Add location" opens a name field at the top of the group; "No
 * locations" when there are none. Merge picks the target in a Picker, then a
 * Dialog confirms; Delete is confirmed by a Dialog saying how many books lose
 * their location; a rename onto a used name offers the same merge Dialog
 * from a Link under the field. Every success calls `router.refresh()`; no
 * Undo, no toast.
 */
export function LocationsGroup({ locations }: { locations: readonly CountedLocation[] }) {
  const t = useTranslations('settings')
  const router = useRouter()
  const report = useReportFailure()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [picking, setPicking] = useState<CountedLocation | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Each dialog keeps its last content while it closes, so the exit shows no blank title.
  const [merge, setMerge] = useState<Merge | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [deleting, setDeleting] = useState<CountedLocation | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const byId = (id: number) => locations.find((location) => location.id === id)

  /** Runs a confirmed merge or delete; success and `NOT_FOUND` both refresh the list. */
  const run = (call: () => Promise<ActionResult<null>>) => {
    startTransition(async () => {
      const result = await settleAction(call())
      if (!result.ok) report(result.code)
      if (result.ok || result.code === 'NOT_FOUND') startTransition(() => router.refresh())
    })
  }

  const confirmMerge = (next: Merge) => {
    setMerge(next)
    setMergeOpen(true)
  }

  const offerMerge = (source: CountedLocation) => (conflictId: number) => {
    const target = byId(conflictId)
    // Created elsewhere since this list was read: refresh so the next attempt finds it.
    if (!target) {
      router.refresh()
      return null
    }
    return () => confirmMerge({ source, target })
  }

  return (
    <>
      {locations.length === 0 && !adding && (
        <p className="text-body text-text-muted">{t('noLocations')}</p>
      )}
      {(adding || locations.length > 0) && (
        <ul>
          {adding && (
            <NameField
              initial=""
              save={(name) => createLocationAction(name)}
              onDone={() => setAdding(false)}
            />
          )}
          {locations.map((location) =>
            renaming === location.id ? (
              <NameField
                key={location.id}
                initial={location.name}
                save={(name) => renameLocationAction(location.id, name)}
                // Only this row's field: another row's Rename may have opened meanwhile.
                onDone={() => setRenaming((open) => (open === location.id ? null : open))}
                mergeInto={offerMerge(location)}
              />
            ) : (
              <ListRow
                key={location.id}
                title={location.name}
                meta={t('locationCount', { count: location.count })}
              >
                <ActionLink disabled={pending} onClick={() => setRenaming(location.id)}>
                  {t('rename')}
                </ActionLink>
                {locations.length > 1 && (
                  <ActionLink
                    disabled={pending}
                    onClick={() => {
                      setPicking(location)
                      setPickerOpen(true)
                    }}
                  >
                    {t('merge')}
                  </ActionLink>
                )}
                <ActionLink
                  destructive
                  disabled={pending}
                  onClick={() => {
                    setDeleting(location)
                    setDeleteOpen(true)
                  }}
                >
                  {t('delete')}
                </ActionLink>
              </ListRow>
            ),
          )}
        </ul>
      )}
      {!adding && (
        <div>
          <ActionLink onClick={() => setAdding(true)}>{t('addLocation')}</ActionLink>
        </div>
      )}

      <Picker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={t('mergeInto', { name: picking?.name ?? '' })}
        options={locations
          .filter((location) => location.id !== picking?.id)
          .map((location) => ({ value: location.id, label: location.name }))}
        value={null}
        onChoose={(targetId) => {
          const target = byId(targetId)
          if (picking && target) confirmMerge({ source: picking, target })
        }}
      />
      <Dialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        title={
          merge ? t('mergeTitle', { source: merge.source.name, target: merge.target.name }) : ''
        }
        confirm={
          <Button
            variant="primary"
            onClick={() => {
              if (!merge || !mergeOpen) return
              const { source, target } = merge
              setMergeOpen(false)
              run(() => mergeLocationAction(source.id, target.id))
            }}
          >
            {t('merge')}
          </Button>
        }
      >
        {merge && (
          <p className="text-body">
            {t('mergeBody', { count: merge.source.count, target: merge.target.name })}
          </p>
        )}
      </Dialog>
      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={deleting ? t('deleteTitle', { name: deleting.name }) : ''}
        confirm={
          <Button
            variant="destructive"
            onClick={() => {
              if (!deleting || !deleteOpen) return
              const { id } = deleting
              setDeleteOpen(false)
              run(() => deleteLocationAction(id))
            }}
          >
            {t('delete')}
          </Button>
        }
      >
        {deleting && <p className="text-body">{t('deleteBody', { count: deleting.count })}</p>}
      </Dialog>
    </>
  )
}
