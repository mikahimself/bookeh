'use client'

import { useTranslations } from 'next-intl'
import { useId, useRef, useState, useTransition } from 'react'

import { helsinkiToday } from '@/fields/readingDates'
import type { UserBookState } from '@/lib/books/effectiveBook'
import type { ActionResult } from '@/lib/errors'

import { Button } from '../components/Button'
import { settleAction } from '../components/request'
import { TextField } from '../components/TextField'
import { PickerFrame } from '../components/ui/Picker'

import { setReadingDatesAction } from './actions'
import type { ReadingDates } from './readingLine'

type Result = ActionResult<UserBookState>
type Field = 'readingSince' | 'finishedAt'
type Errors = Partial<Record<Field, string>>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  bookId: number
  /** The Book's title, muted under the Picker's. */
  title: string
  /** The stored values the fields start with at each open. */
  dates: ReadingDates
  /** Runs once the Picker has closed after a save, with its result. */
  onSettled: (result: Result) => void
}

/**
 * EXPERIENCE.md, Book detail → Reading and rating (FR-54): the Bottom sheet on
 * the phone, the Dialog on wide screens, titled "Reading dates" with the
 * Book's title muted under it. Started and Finished Date fields start with
 * the stored dates, empty when there are none, at most today in
 * `Europe/Helsinki` when the Picker opens. Save checks a finish before the
 * start, a date after today and Started cleared on a Book being read, and
 * shows each under its field without sending; a server field error it did
 * not predict shows under that field too. Anything else closes it, and the
 * result goes to `onSettled` after the close. All of it resets at each open.
 */
export function ReadingDatesPicker({ open, onOpenChange, bookId, title, dates, onSettled }: Props) {
  const t = useTranslations()
  const formId = useId()
  const [pending, startTransition] = useTransition()
  const [today, setToday] = useState(helsinkiToday)
  const [started, setStarted] = useState(dates.readingSince ?? '')
  const [finished, setFinished] = useState(dates.finishedAt ?? '')
  const [errors, setErrors] = useState<Errors>({})
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setToday(helsinkiToday())
      setStarted(dates.readingSince ?? '')
      setFinished(dates.finishedAt ?? '')
      setErrors({})
    }
  }
  /** A result waiting for the close to finish. */
  const settled = useRef<Result | null>(null)
  /** A save is running; a close meanwhile (Cancel, Back) leaves its result to the save. */
  const running = useRef(false)
  const closedWhileRunning = useRef(false)

  const onClosed = () => {
    const result = settled.current
    settled.current = null
    if (result) onSettled(result)
    else if (running.current) closedWhileRunning.current = true
  }

  const rejections = (): Errors => {
    const found: Errors = {}
    if (started > today) found.readingSince = t('detail.dateInFuture')
    else if (started === '' && dates.state === 'reading')
      found.readingSince = t('detail.startRequired')
    if (finished > today) found.finishedAt = t('detail.dateInFuture')
    else if (started !== '' && finished !== '' && finished < started)
      found.finishedAt = t('detail.finishBeforeStart')
    return found
  }

  const save = () => {
    if (!open || pending) return
    const found = rejections()
    if (Object.keys(found).length > 0) {
      setErrors(found)
      return
    }
    const sent = { bookId, readingSince: started || null, finishedAt: finished || null }
    running.current = true
    closedWhileRunning.current = false
    startTransition(async () => {
      const result = await settleAction(setReadingDatesAction(sent))
      running.current = false
      if (closedWhileRunning.current) {
        closedWhileRunning.current = false
        onSettled(result)
        return
      }
      const onFields = !result.ok && result.fields
      if (onFields && (onFields.readingSince || onFields.finishedAt)) {
        setErrors({
          ...(onFields.readingSince && { readingSince: t('errors.VALIDATION') }),
          ...(onFields.finishedAt && { finishedAt: t('errors.VALIDATION') }),
        })
        return
      }
      settled.current = result
      onOpenChange(false)
    })
  }

  const clearError = (field: Field) => setErrors(({ [field]: _, ...rest }) => rest)

  return (
    <PickerFrame
      open={open}
      onOpenChange={onOpenChange}
      title={t('detail.readingDates')}
      description={<p className="text-meta text-text-muted">{title}</p>}
      onClosed={onClosed}
      confirm={
        <Button type="submit" form={formId} variant="primary" disabled={pending}>
          {t('detail.saveDates')}
        </Button>
      }
    >
      {/* The checks are this Picker's, so the browser's own `max` check stays out of the way. */}
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        <TextField
          type="date"
          label={t('detail.started')}
          value={started}
          max={today}
          onChange={(event) => {
            setStarted(event.target.value)
            // Finished's "before the start" is about Started too.
            setErrors({})
          }}
          error={errors.readingSince}
        />
        <TextField
          type="date"
          label={t('detail.finished')}
          value={finished}
          max={today}
          onChange={(event) => {
            setFinished(event.target.value)
            clearError('finishedAt')
          }}
          error={errors.finishedAt}
        />
      </form>
    </PickerFrame>
  )
}
