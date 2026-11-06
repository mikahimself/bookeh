'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useId, useRef, useState, useTransition } from 'react'

import { maxPrice } from '@/fields/limits'
import { helsinkiToday } from '@/fields/readingDates'
import type { ActionResult } from '@/lib/errors'

import { Button } from '../components/Button'
import { settleAction } from '../components/request'
import { TextField } from '../components/TextField'
import { PickerFrame } from '../components/ui/Picker'

import { setCopyPurchaseAction } from './actions'
import { parsePrice } from './price'

type Result = ActionResult<null>
type Field = 'acquiredAt' | 'price'
type Errors = Partial<Record<Field, string>>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  copyId: number
  status: 'owned' | 'ordered'
  /** The Book's title, the Picker's. */
  title: string
  /** The stored values the fields start with at each open. */
  acquiredAt: string
  price: number | null
  /** Runs once the Picker has closed after a save, with its result. */
  onSettled: (result: Result) => void
}

/**
 * EXPERIENCE.md, Book detail → Your copies (FR-55): the Bottom sheet on the
 * phone, the Dialog on wide screens, titled with the Book's title. An
 * Acquired Date field ("Ordered" on an ordered copy), at most today in
 * `Europe/Helsinki` when the Picker opens, and a Price field in euros
 * (`parsePrice()`), both starting with the stored values, the price empty
 * when there is none. Save checks an empty or future date and a price that
 * does not parse or is too large, and shows each under its field without
 * sending; a server field error shows under its field too. Anything else
 * closes it, and the result goes to `onSettled` after the close. No toast,
 * no Undo. All of it resets at each open.
 */
export function PurchasePicker({
  open,
  onOpenChange,
  copyId,
  status,
  title,
  acquiredAt,
  price,
  onSettled,
}: Props) {
  const t = useTranslations()
  const format = useFormatter()
  const formId = useId()
  const [pending, startTransition] = useTransition()
  const stored = () =>
    price === null
      ? ''
      : format.number(price / 100, { minimumFractionDigits: 2, useGrouping: false })
  const [today, setToday] = useState(helsinkiToday)
  const [date, setDate] = useState(acquiredAt)
  const [priceText, setPriceText] = useState(stored)
  const [errors, setErrors] = useState<Errors>({})
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setToday(helsinkiToday())
      setDate(acquiredAt)
      setPriceText(stored())
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

  const save = () => {
    if (!open || pending) return
    const cents = parsePrice(priceText)
    const found: Errors = {}
    if (date === '') found.acquiredAt = t('detail.enterDate')
    else if (date > today) found.acquiredAt = t('detail.dateInFuture')
    if (cents === 'invalid') found.price = t('detail.enterPrice')
    else if (cents === 'tooLarge') found.price = t('detail.priceTooLarge', { max: maxPrice / 100 })
    // `typeof` narrows `cents` to cents or none; a string has its message already.
    if (Object.keys(found).length > 0 || typeof cents === 'string') {
      setErrors(found)
      return
    }
    const sent = { copyId, acquiredAt: date, price: cents }
    running.current = true
    closedWhileRunning.current = false
    startTransition(async () => {
      const result = await settleAction(setCopyPurchaseAction(sent))
      running.current = false
      if (closedWhileRunning.current) {
        closedWhileRunning.current = false
        onSettled(result)
        return
      }
      const onFields = !result.ok && result.fields
      if (onFields && (onFields.acquiredAt || onFields.price)) {
        setErrors({
          ...(onFields.acquiredAt && { acquiredAt: t('errors.VALIDATION') }),
          ...(onFields.price && { price: t('errors.VALIDATION') }),
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
      title={title}
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
          label={t('detail.acquired', { status })}
          value={date}
          max={today}
          onChange={(event) => {
            setDate(event.target.value)
            clearError('acquiredAt')
          }}
          error={errors.acquiredAt}
        />
        <TextField
          label={t('detail.price')}
          inputMode="decimal"
          autoComplete="off"
          value={priceText}
          onChange={(event) => {
            setPriceText(event.target.value)
            clearError('price')
          }}
          error={errors.price}
        />
      </form>
    </PickerFrame>
  )
}
