'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react'

import type { Named } from '@/lib/books/effectiveBook'
import type { LocationOption } from '@/lib/copies/locations'

import { returnLoanAction } from '../actions/loans'

import { Button } from '../components/Button'
import { ActionLink } from '../components/Link'
import { settleAction } from '../components/request'
import { TextAreaField } from '../components/TextField'
import { useToast } from '../components/toast/ToastProvider'
import { Dialog } from '../components/ui/Dialog'

import { receiveCopyAction, removeCopiesAction, setNoteAction } from './actions'
import { useCloseDetail } from './detailClose'
import { LendPicker } from './LendPicker'
import { MovePicker } from './MovePicker'
import { useAfterAction } from './ShelfRows'

/**
 * EXPERIENCE.md, Book detail: the note under a copy's line. It saves on blur
 * (`Esc` blurs too) when the trimmed, NFC text differs from the last saved
 * one, and shows the saved text on success. Every result goes to
 * `afterAction`, since search covers notes; on failure the typed text stays
 * and the next blur tries again. A note left without a blur (Back, another
 * Book) is saved as the field unmounts. No Undo.
 */
export function CopyNote({ copyId, note }: { copyId: number; note: string }) {
  const t = useTranslations('detail')
  const afterAction = useAfterAction()
  const [value, setValue] = useState(note)
  /** The value as typed, for the save on unmount. */
  const latest = useRef(note)
  const saved = useRef(note.trim().normalize('NFC'))

  const save = async () => {
    const sent = latest.current
    const text = sent.trim().normalize('NFC')
    if (text === saved.current) return
    const result = await settleAction(setNoteAction({ copyId, note: text }))
    if (result.ok) {
      saved.current = text
      // Typing since the blur stays.
      if (latest.current === sent) {
        latest.current = text
        setValue(text)
      }
    }
    afterAction(result)
  }

  const saveOnUnmount = useEffectEvent(() => void save())
  useEffect(() => () => saveOnUnmount(), [])

  return (
    <TextAreaField
      label={t('note')}
      rows={2}
      maxLength={2000}
      value={value}
      onChange={(event) => {
        latest.current = event.target.value
        setValue(event.target.value)
      }}
      onBlur={() => void save()}
      onKeyDown={(event) => {
        if (event.key === 'Escape') event.currentTarget.blur()
      }}
    />
  )
}

/**
 * FR-33: an owned copy's Move, a Link before Remove that opens the Move
 * picker (`MovePicker`) on the copy's location; disabled while its move
 * runs. `afterAction`'s refresh after `ok` or `NOT_FOUND` re-renders Book
 * detail, so the line shows its new location or goes. Focus goes to the
 * copies' section once the move settles: the disabled Link would drop it to
 * the body, outside the sheet. After the toast's Undo, the line returns to
 * its old location through `ReadAndRating`'s `onUndone` refresh, while Book
 * detail is mounted.
 */
export function MoveCopy({
  copyId,
  location,
  locations,
}: {
  copyId: number
  location: number | null
  locations: readonly LocationOption[]
}) {
  const t = useTranslations('collection')
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const link = useRef<HTMLButtonElement>(null)

  return (
    <>
      <ActionLink ref={link} disabled={pending} onClick={() => setOpen(true)}>
        {t('move')}
      </ActionLink>
      <MovePicker
        open={open}
        onOpenChange={setOpen}
        locations={locations}
        value={location}
        copyIds={[copyId]}
        startTransition={startTransition}
        onSettled={() => link.current?.closest('section')?.focus()}
      />
    </>
  )
}

/**
 * EXPERIENCE.md, Book detail: an owned, unlent copy's Remove, confirmed by
 * the one-copy dialog; no toast and no Undo (a lent line offers Returned
 * only). The removal starts once the dialog's history entry
 * is gone (`onClosed`), so closing Book detail after the last copy never
 * overlaps it. `last` means removing it leaves the viewer holding nothing
 * (no other copy, no open entry): `ok` then closes Book detail. Otherwise
 * `afterAction`'s refresh after `ok` or `NOT_FOUND` re-renders it (a Book
 * gone entirely then closes as "Not in library"), and focus goes to the
 * copies' section, or, with `focusAfter` (the only copy, entries remaining),
 * to that element, since the copies' section unmounts with the refresh.
 */
export function RemoveCopy({
  copyId,
  last,
  focusAfter,
}: {
  copyId: number
  last: boolean
  focusAfter?: string
}) {
  const t = useTranslations('collection')
  const afterAction = useAfterAction()
  const closeDetail = useCloseDetail()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const confirmed = useRef(false)
  const link = useRef<HTMLButtonElement>(null)

  const remove = () => {
    startTransition(async () => {
      const result = await settleAction(removeCopiesAction([copyId]))
      afterAction(result)
      // Removed nothing (the copy turned ordered elsewhere): the refresh shows its line.
      if (result.ok && last && result.data.removed > 0) {
        closeDetail()
        return
      }
      // The line goes with the refresh; focus would fall to the body, outside the sheet.
      if (!result.ok) return
      const after = focusAfter !== undefined && result.data.removed > 0
      const target = after ? document.getElementById(focusAfter) : link.current?.closest('section')
      target?.focus()
    })
  }

  return (
    <>
      <ActionLink ref={link} destructive disabled={pending} onClick={() => setOpen(true)}>
        {t('remove')}
      </ActionLink>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        onClosed={() => {
          if (!confirmed.current) return
          confirmed.current = false
          remove()
        }}
        title={t('removeTitle', { n: 1 })}
        confirm={
          <Button
            variant="destructive"
            onClick={() => {
              if (!open) return
              confirmed.current = true
              setOpen(false)
            }}
          >
            {t('remove')}
          </Button>
        }
      />
    </>
  )
}

/**
 * EXPERIENCE.md, Book detail: an ordered copy's Received (FR-28). The copy
 * becomes owned at the default location; the toast says where it landed
 * ("Saved to {location}", or "Saved" without one) with Undo, which orders it
 * again. Every result goes to `afterAction`, whose refresh after `ok` or
 * `NOT_FOUND` re-renders Book detail and unmounts this Link, so focus moves
 * to Your copies first. A toast Undo is refreshed by `ReadAndRating`'s
 * `onUndone` listener.
 */
export function ReceiveCopy({ copyId }: { copyId: number }) {
  const t = useTranslations()
  const { show } = useToast()
  const afterAction = useAfterAction()
  const [pending, startTransition] = useTransition()
  const link = useRef<HTMLButtonElement>(null)

  const receive = () => {
    startTransition(async () => {
      const result = await settleAction(receiveCopyAction({ copyId }))
      if (result.ok) {
        const { savedTo, undoToken, undoSeconds } = result.data
        show({
          kind: 'success',
          message: savedTo ? t('toast.savedTo', { location: savedTo.name }) : t('toast.saved'),
          undo: { token: undoToken, seconds: undoSeconds },
        })
      }
      afterAction(result)
      // The line changes with the refresh; focus would fall to the body, outside the sheet.
      if (result.ok || result.code === 'NOT_FOUND') link.current?.closest('section')?.focus()
    })
  }

  return (
    <ActionLink ref={link} disabled={pending} onClick={receive}>
      {t('detail.received')}
    </ActionLink>
  )
}

/**
 * FR-35, EXPERIENCE.md, Loans → Lend: an owned, unlent copy's Lend, a Link
 * before Move that opens the Lend picker (`LendPicker`); disabled while its
 * lend runs. `afterAction`'s refresh re-renders Book detail with the lent
 * line, so focus goes to the copies' section once the lend settles. The
 * toast's Undo is refreshed by `ReadAndRating`'s `onUndone` listener, and
 * on `/loans` by `RefreshOnUndo` too.
 */
export function LendCopy({
  copyId,
  context,
  people,
  today,
}: {
  copyId: number
  context: string
  people: readonly Named[]
  today: string
}) {
  const t = useTranslations('loans')
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const link = useRef<HTMLButtonElement>(null)

  return (
    <>
      <ActionLink ref={link} disabled={pending} onClick={() => setOpen(true)}>
        {t('lend')}
      </ActionLink>
      <LendPicker
        open={open}
        onOpenChange={setOpen}
        context={context}
        people={people}
        today={today}
        copyId={copyId}
        startTransition={startTransition}
        pending={pending}
        onSettled={() => link.current?.closest('section')?.focus()}
      />
    </>
  )
}

/**
 * FR-36: a lent copy's Returned, a Link with no picker. It closes the loan
 * today with the toast "Returned" and Undo, which reopens it. Every result
 * goes to `afterAction`, whose refresh re-renders the line without this
 * Link, so focus moves first to its section (Your copies, or the Loans list).
 */
export function ReturnLoan({ loanId }: { loanId: number }) {
  const t = useTranslations()
  const { show } = useToast()
  const afterAction = useAfterAction()
  const [pending, startTransition] = useTransition()
  const link = useRef<HTMLButtonElement>(null)

  const returned = () => {
    startTransition(async () => {
      const result = await settleAction(returnLoanAction({ loanId }))
      if (result.ok) {
        const { undoToken, undoSeconds } = result.data
        show({
          kind: 'success',
          message: t('toast.returned'),
          undo: { token: undoToken, seconds: undoSeconds },
        })
      }
      afterAction(result)
      link.current?.closest('section')?.focus()
    })
  }

  return (
    <ActionLink ref={link} disabled={pending} onClick={returned}>
      {t('loans.returned')}
    </ActionLink>
  )
}
