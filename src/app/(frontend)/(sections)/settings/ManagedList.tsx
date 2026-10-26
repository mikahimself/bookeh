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

/** A managed name as Settings lists it: its name and its use (a location's copies, a Person's loans). */
export type ManagedItem = { id: number; name: string; count: number }

/** The group's server actions; each answers `null` and the list refreshes on success. */
export type ManagedListActions = {
  create: (name: string) => Promise<ActionResult<null>>
  rename: (id: number, name: string) => Promise<ActionResult<null>>
  merge: (source: number, target: number) => Promise<ActionResult<null>>
  remove: (id: number) => Promise<ActionResult<null>>
}

/**
 * The `<typed>` tag of a rich title: a name the user typed keeps its case in a
 * lowercased heading (DESIGN.md, Lowercase).
 */
export const typed = (chunks: ReactNode) => <span className="normal-case">{chunks}</span>

/** The group's own strings, translated by its wrapper; titles name items through `typed`. */
export type ManagedListStrings = {
  empty: string
  add: string
  count: (item: ManagedItem) => string
  mergeInto: (item: ManagedItem) => ReactNode
  mergeTitle: (source: ManagedItem, target: ManagedItem) => ReactNode
  mergeBody: (source: ManagedItem, target: ManagedItem) => string
  deleteTitle: (item: ManagedItem) => ReactNode
  /** The delete dialog's body; without it the dialog has only its title. */
  deleteBody?: (item: ManagedItem) => string
}

/**
 * An item that cannot be deleted (a Person with loans): Delete opens a dialog
 * titled `title` with `body` instead, and, with another item in the list,
 * `mergeOffer` and a Merge that opens the merge Picker once it has closed.
 */
export type InUseRule = {
  test: (item: ManagedItem) => boolean
  title: (item: ManagedItem) => ReactNode
  body: (item: ManagedItem) => string
  mergeOffer: string
}

/** The service's normalisation, repeated only to tell an empty or unchanged name. */
const normalise = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ')

/** What a failed save shows under the field: a message, and for a rename the item in the way. */
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
  /** Given the item in the way, what a Merge Link after "That name is already in use." does. */
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
    if (code === 'VALIDATION' && fields?.name === 'TOO_LONG') return t('errors.TOO_LONG')
    if (code === 'VALIDATION' && fields?.name) return t('settings.nameRequired')
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
        label={t('settings.name')}
        name="name"
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

type Merge = { source: ManagedItem; target: ManagedItem }

/** A failure after which the list on screen is stale: refresh it. */
const STALE: readonly ErrorCode[] = ['NOT_FOUND', 'PERSON_IN_USE']

/**
 * A Settings managed list, Locations (FR-31) and People (FR-34), UX-DR50: one
 * List row per item with its use and Rename, Merge (only with another item)
 * and Delete Links; `strings.add` opens a name field at the top of the group;
 * `strings.empty` when there are none. Merge picks the target in a Picker,
 * then a Dialog confirms; Delete is confirmed by a Dialog, or, for an item
 * `inUse` holds, a Dialog says it can't be deleted and offers Merge (no delete
 * call: the service's `PERSON_IN_USE` guards a stale list); a rename onto a
 * used name offers the same merge Dialog from a Link under the field. Every
 * success calls `router.refresh()`, as do `NOT_FOUND` and `PERSON_IN_USE`; no
 * Undo, no toast.
 */
export function ManagedList({
  items,
  actions,
  strings,
  inUse,
}: {
  items: readonly ManagedItem[]
  actions: ManagedListActions
  strings: ManagedListStrings
  inUse?: InUseRule
}) {
  const t = useTranslations('settings')
  const router = useRouter()
  const report = useReportFailure()
  const [pending, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [renaming, setRenaming] = useState<number | null>(null)
  const [picking, setPicking] = useState<ManagedItem | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Each dialog keeps its last content while it closes, so the exit shows no blank title.
  const [merge, setMerge] = useState<Merge | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [deleting, setDeleting] = useState<ManagedItem | null>(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [blocked, setBlocked] = useState<ManagedItem | null>(null)
  const [blockedOpen, setBlockedOpen] = useState(false)
  // Nothing opens on top of a dialog: the in-use dialog's Merge opens the Picker once it has closed.
  const mergeAfterClose = useRef(false)

  const byId = (id: number) => items.find((item) => item.id === id)

  /** Runs a confirmed merge or delete; success and a stale list both refresh it. */
  const run = (call: () => Promise<ActionResult<null>>) => {
    startTransition(async () => {
      const result = await settleAction(call())
      if (!result.ok) report(result.code)
      if (result.ok || STALE.includes(result.code)) startTransition(() => router.refresh())
    })
  }

  const openPicker = (source: ManagedItem) => {
    setPicking(source)
    setPickerOpen(true)
  }

  const confirmMerge = (next: Merge) => {
    setMerge(next)
    setMergeOpen(true)
  }

  const offerMerge = (source: ManagedItem) => (conflictId: number) => {
    const target = byId(conflictId)
    // Created elsewhere since this list was read: refresh so the next attempt finds it.
    if (!target) {
      router.refresh()
      return null
    }
    return () => confirmMerge({ source, target })
  }

  const canMerge = items.length > 1

  return (
    <>
      {items.length === 0 && !adding && (
        <p className="text-body text-text-muted">{strings.empty}</p>
      )}
      {(adding || items.length > 0) && (
        <ul>
          {adding && <NameField initial="" save={actions.create} onDone={() => setAdding(false)} />}
          {items.map((item) =>
            renaming === item.id ? (
              <NameField
                key={item.id}
                initial={item.name}
                save={(name) => actions.rename(item.id, name)}
                // Only this row's field: another row's Rename may have opened meanwhile.
                onDone={() => setRenaming((open) => (open === item.id ? null : open))}
                mergeInto={offerMerge(item)}
              />
            ) : (
              <ListRow key={item.id} title={item.name} meta={strings.count(item)}>
                <ActionLink disabled={pending} onClick={() => setRenaming(item.id)}>
                  {t('rename')}
                </ActionLink>
                {canMerge && (
                  <ActionLink disabled={pending} onClick={() => openPicker(item)}>
                    {t('merge')}
                  </ActionLink>
                )}
                <ActionLink
                  destructive
                  disabled={pending}
                  onClick={() => {
                    if (inUse?.test(item)) {
                      setBlocked(item)
                      setBlockedOpen(true)
                      return
                    }
                    setDeleting(item)
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
          <ActionLink onClick={() => setAdding(true)}>{strings.add}</ActionLink>
        </div>
      )}

      <Picker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        title={picking ? strings.mergeInto(picking) : ''}
        options={items
          .filter((item) => item.id !== picking?.id)
          .map((item) => ({ value: item.id, label: item.name }))}
        value={null}
        onChoose={(targetId) => {
          const target = byId(targetId)
          if (picking && target) confirmMerge({ source: picking, target })
        }}
      />
      <Dialog
        open={mergeOpen}
        onOpenChange={setMergeOpen}
        title={merge ? strings.mergeTitle(merge.source, merge.target) : ''}
        confirm={
          <Button
            variant="primary"
            onClick={() => {
              if (!merge || !mergeOpen) return
              const { source, target } = merge
              setMergeOpen(false)
              run(() => actions.merge(source.id, target.id))
            }}
          >
            {t('merge')}
          </Button>
        }
      >
        {merge && <p className="text-body">{strings.mergeBody(merge.source, merge.target)}</p>}
      </Dialog>
      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={deleting ? strings.deleteTitle(deleting) : ''}
        confirm={
          <Button
            variant="destructive"
            onClick={() => {
              if (!deleting || !deleteOpen) return
              const { id } = deleting
              setDeleteOpen(false)
              run(() => actions.remove(id))
            }}
          >
            {t('delete')}
          </Button>
        }
      >
        {deleting && strings.deleteBody && (
          <p className="text-body">{strings.deleteBody(deleting)}</p>
        )}
      </Dialog>
      {inUse && (
        <Dialog
          open={blockedOpen}
          onOpenChange={setBlockedOpen}
          onClosed={() => {
            if (!mergeAfterClose.current) return
            mergeAfterClose.current = false
            if (blocked) openPicker(blocked)
          }}
          title={blocked ? inUse.title(blocked) : ''}
          confirm={
            canMerge ? (
              <Button
                variant="primary"
                onClick={() => {
                  if (!blockedOpen) return
                  mergeAfterClose.current = true
                  setBlockedOpen(false)
                }}
              >
                {t('merge')}
              </Button>
            ) : undefined
          }
        >
          {blocked && (
            <p className="text-body">
              {inUse.body(blocked)}
              {canMerge && ` ${inUse.mergeOffer}`}
            </p>
          )}
        </Dialog>
      )}
    </>
  )
}
