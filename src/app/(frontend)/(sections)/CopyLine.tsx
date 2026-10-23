'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useRef, useState, useTransition } from 'react'

import type { LocationOption } from '@/lib/copies/locations'

import { Button } from '../components/Button'
import { ActionLink } from '../components/Link'
import { settleAction } from '../components/request'
import { TextAreaField } from '../components/TextField'
import { useToast } from '../components/toast/ToastProvider'
import { Dialog } from '../components/ui/Dialog'

import { receiveCopyAction, removeCopiesAction, setNoteAction } from './actions'
import { useCloseDetail } from './detailClose'
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
 * runs. `ok` or `NOT_FOUND` refreshes Book detail, so the line shows its new
 * location or goes. Focus goes to the copies' section once the move
 * settles: the disabled Link would drop it to the body, outside the sheet.
 * After the toast's Undo, the line returns to its old location through
 * `ReadAndRating`'s `onUndone` refresh, while Book detail is mounted.
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
  const router = useRouter()
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
        onSettled={(result) => {
          link.current?.closest('section')?.focus()
          // `MovePicker` refreshes on `ok`.
          if (!result.ok && result.code === 'NOT_FOUND') router.refresh()
        }}
      />
    </>
  )
}

/**
 * EXPERIENCE.md, Book detail: an owned copy's Remove, confirmed by the
 * one-copy dialog; no toast and no Undo. The removal starts once the
 * dialog's history entry is gone (`onClosed`), so closing Book detail after
 * the last copy never overlaps it. `ok` on the last copy closes Book detail;
 * `ok` otherwise, or `NOT_FOUND`, refreshes it (a Book gone entirely then
 * closes as "Not in library").
 */
export function RemoveCopy({ copyId, last }: { copyId: number; last: boolean }) {
  const t = useTranslations('collection')
  const router = useRouter()
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
      if (result.ok && last) {
        closeDetail()
        return
      }
      // The line goes with the refresh; focus would fall to the body, outside the sheet.
      if (result.ok) link.current?.closest('section')?.focus()
      if (result.ok || result.code === 'NOT_FOUND') router.refresh()
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
 * again. Every result goes to `afterAction`. `ok` or `NOT_FOUND` moves focus
 * to Your copies and refreshes Book detail, which unmounts this Link. A toast
 * Undo is refreshed by `ReadAndRating`'s `onUndone` listener.
 */
export function ReceiveCopy({ copyId }: { copyId: number }) {
  const t = useTranslations()
  const router = useRouter()
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
      if (result.ok || result.code === 'NOT_FOUND') {
        // The line changes with the refresh; focus would fall to the body, outside the sheet.
        link.current?.closest('section')?.focus()
        router.refresh()
      }
    })
  }

  return (
    <ActionLink ref={link} disabled={pending} onClick={receive}>
      {t('detail.received')}
    </ActionLink>
  )
}
