'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type TransitionStartFunction } from 'react'

import { limits } from '@/fields/limits'
import type { Named } from '@/lib/books/effectiveBook'
import type { ActionResult } from '@/lib/errors'
import { helsinkiToday } from '@/lib/loans/dates'
import type { Ref } from '@/lib/payload/ref'

import { lendCopyAction } from '../actions/loans'
import { Button } from '../components/Button'
import { settleAction } from '../components/request'
import { TextField } from '../components/TextField'
import { useToast } from '../components/toast/ToastProvider'
import { markerSlotClass } from '../components/ui/classes'
import { Combobox } from '../components/ui/Combobox'
import { Dialog } from '../components/ui/Dialog'
import { useWide } from '../components/ui/overlay'
import { Sheet } from '../components/ui/Sheet'

import { useAfterAction } from './ShelfRows'

/** At most this many People as rows; past it, "Find a person…" opens the Combobox. */
const ROWS = 6

type LendResult = Awaited<ReturnType<typeof lendCopyAction>>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The muted line under the title: "{title} · {location}", or the title alone. */
  context: string
  /** The viewer's People, most recently lent-to first (`lendingPeople()`). */
  people: readonly Named[]
  copyId: number
  /** The caller's transition, so its pending state covers the lend. */
  startTransition: TransitionStartFunction
  /** Whether that transition runs: Lend is disabled meanwhile. */
  pending: boolean
  /** Runs once the picker has closed after a lend, before `afterAction`. */
  onSettled?: (result: LendResult) => void
}

/**
 * EXPERIENCE.md, Loans → Lend (mock-up B): the Bottom sheet on the phone, the
 * Dialog on wide screens (the form held from the open), titled "Lend" with
 * the copy's line muted under it. Up to six People as rows; a tap marks or
 * unmarks one and never lends. Past six, "Find a person…" swaps itself for
 * the Person Combobox over every Person. A "New person" field takes a name
 * (matched or created by `lib/people`); typing clears the row and the
 * Combobox, and marking or choosing clears the field. Then "Lent on",
 * today by default and at most: today in `Europe/Helsinki` when the picker
 * opens, so a screen left open past midnight offers the new day (Epic 6
 * retro decision 4). Lend (or Enter) needs a Person and a date and sends
 * them; the picker stays open
 * meanwhile and on a field error it can show, and closes on anything else.
 * After the close, `ok` shows "Lent to {person}" with Undo, and every result
 * goes to `afterAction`. All of it resets at each open.
 */
export function LendPicker({
  open,
  onOpenChange,
  context,
  people,
  copyId,
  startTransition,
  pending,
  onSettled,
}: Props) {
  const t = useTranslations()
  const { show } = useToast()
  const afterAction = useAfterAction()
  const formId = useId()
  const wide = useWide()
  const [heldWide, setHeldWide] = useState(wide)
  const [marked, setMarked] = useState<number | null>(null)
  const [finding, setFinding] = useState(false)
  const [found, setFound] = useState<number | null>(null)
  const [typed, setTyped] = useState('')
  const [today, setToday] = useState(helsinkiToday)
  const [lentOn, setLentOn] = useState(today)
  const [errors, setErrors] = useState<{ person?: string; lentOn?: string; inCombobox?: boolean }>(
    {},
  )
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setHeldWide(wide)
      setMarked(null)
      setFinding(false)
      setFound(null)
      setTyped('')
      const now = helsinkiToday()
      setToday(now)
      setLentOn(now)
      setErrors({})
    }
  }
  /** A result waiting for the close to finish. */
  const settled = useRef<LendResult | null>(null)
  /** A lend is running; a close meanwhile (Cancel, Back) leaves its result to `finish`. */
  const running = useRef(false)
  const closedWhileRunning = useRef(false)
  const finder = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (finding) finder.current?.querySelector('input')?.focus()
  }, [finding])

  const person: Ref | null = marked ?? found ?? (typed.trim() ? { create: typed } : null)
  /** Lend waits for a Person and a date, and for the lend running. */
  const blocked = pending || person === null || lentOn === ''

  const finish = (result: LendResult) => {
    if (result.ok) {
      const { person: lentTo, undoToken, undoSeconds } = result.data
      show({
        kind: 'success',
        message: t('toast.lent', { person: lentTo.name }),
        undo: { token: undoToken, seconds: undoSeconds },
      })
    }
    onSettled?.(result)
    afterAction(result)
  }

  const onClosed = () => {
    const result = settled.current
    settled.current = null
    if (result) finish(result)
    else if (running.current) closedWhileRunning.current = true
  }

  /** The field errors this picker shows, or `null` when the result closes it. */
  const fieldErrors = (result: ActionResult<unknown>): typeof errors | null => {
    if (result.ok || !result.fields) return null
    const { person: onPerson, lentOn: onDate } = result.fields
    if (onPerson === undefined && onDate === undefined) return null
    return {
      ...(onPerson !== undefined && {
        person: onPerson === 'TOO_LONG' ? t('errors.TOO_LONG') : t('loans.personRequired'),
        inCombobox: found !== null,
      }),
      ...(onDate !== undefined && { lentOn: t('loans.lentOnInvalid') }),
    }
  }

  const lend = () => {
    if (!open || blocked || person === null) return
    const sent = { copyId, person, lentOn }
    running.current = true
    closedWhileRunning.current = false
    startTransition(async () => {
      const result = await settleAction(lendCopyAction(sent))
      running.current = false
      if (closedWhileRunning.current) {
        closedWhileRunning.current = false
        finish(result)
        return
      }
      const shown = fieldErrors(result)
      if (shown) {
        setErrors(shown)
        return
      }
      settled.current = result
      onOpenChange(false)
    })
  }

  const mark = (id: number) => {
    setMarked(marked === id ? null : id)
    setFound(null)
    setTyped('')
    setErrors(({ lentOn: dateError }) => ({ lentOn: dateError }))
  }

  const rows = people.slice(0, ROWS)
  const rowClass =
    'flex w-full items-center gap-2 bg-transparent py-2 text-left text-control text-text max-wide:min-h-tap'

  const form = (
    <form
      id={formId}
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        lend()
      }}
    >
      {rows.length > 0 && (
        <ul>
          {rows.map(({ id, name }) => (
            <li key={id}>
              <button
                type="button"
                aria-pressed={marked === id}
                onClick={() => mark(id)}
                className={rowClass}
              >
                <span
                  aria-hidden="true"
                  className={marked === id ? `${markerSlotClass} bg-accent` : markerSlotClass}
                />
                <span>{name}</span>
              </button>
            </li>
          ))}
          {people.length > ROWS && !finding && (
            <li>
              <button type="button" onClick={() => setFinding(true)} className={rowClass}>
                <span aria-hidden="true" className={markerSlotClass} />
                <span className="underline decoration-accent decoration-2 underline-offset-3">
                  {t('loans.findPerson')}
                </span>
              </button>
            </li>
          )}
        </ul>
      )}
      {finding && (
        <div ref={finder}>
          <Combobox
            label={t('loans.person')}
            options={people.map(({ id, name }) => ({ id, label: name }))}
            value={found}
            onValueChange={(value) => {
              const id = typeof value === 'number' ? value : null
              setFound(id)
              if (id !== null) {
                setMarked(null)
                setTyped('')
              }
              setErrors(({ lentOn: dateError }) => ({ lentOn: dateError }))
            }}
            create={false}
            error={errors.inCombobox ? errors.person : undefined}
          />
        </div>
      )}
      <TextField
        label={t('loans.newPerson')}
        value={typed}
        maxLength={limits.name}
        autoComplete="off"
        onChange={(event) => {
          const text = event.target.value
          setTyped(text)
          if (text.trim() !== '') {
            setMarked(null)
            setFound(null)
          }
          setErrors(({ lentOn: dateError }) => ({ lentOn: dateError }))
        }}
        error={errors.inCombobox ? undefined : errors.person}
      />
      <TextField
        type="date"
        label={t('loans.lentOnLabel')}
        value={lentOn}
        max={today}
        onChange={(event) => {
          setLentOn(event.target.value)
          setErrors(({ lentOn: _, ...rest }) => rest)
        }}
        error={errors.lentOn}
      />
      {!heldWide && (
        <Button type="submit" variant="primary" disabled={blocked}>
          {t('loans.lend')}
        </Button>
      )}
    </form>
  )
  const muted = <p className="text-meta text-text-muted">{context}</p>

  return heldWide ? (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={t('loans.lendTitle')}
      onClosed={onClosed}
      confirm={
        <Button type="submit" form={formId} variant="primary" disabled={blocked}>
          {t('loans.lend')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {muted}
        {form}
      </div>
    </Dialog>
  ) : (
    <Sheet open={open} onOpenChange={onOpenChange} label={t('loans.lendTitle')} onClosed={onClosed}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-heading-group ui-case">{t('loans.lendTitle')}</h2>
          {muted}
        </div>
        {form}
      </div>
    </Sheet>
  )
}
