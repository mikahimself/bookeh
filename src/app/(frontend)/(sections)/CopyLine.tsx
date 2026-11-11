'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useEffect, useEffectEvent, useRef, useState, useTransition, type ReactNode } from 'react'

import { returnLoanAction } from '../actions/loans'

import { ActionLink } from '../components/Link'
import { settleAction } from '../components/request'
import { TextAreaField } from '../components/TextField'
import { useToast } from '../components/toast/ToastProvider'
import { focusSectionRow } from '../components/ui/Accordion'

import { setNoteAction } from './actions'
import { PurchasePicker } from './PurchasePicker'
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
 * EXPERIENCE.md, Book detail → Your copies (FR-55); DESIGN.md, Reading dates
 * line: the muted line under a copy's line, "Acquired {date} · €{price}"
 * ("Ordered {date}" on an ordered copy, "Add price" for no price). The date
 * and the price are Links opening one `PurchasePicker`. Its result goes to
 * `afterAction`, whose refresh re-renders the line; no toast, no Undo. Focus
 * goes to the Your copies row once it settles.
 */
export function CopyPurchase({
  copyId,
  status,
  acquiredAt,
  price,
  title,
}: {
  copyId: number
  status: 'owned' | 'ordered'
  acquiredAt: string
  price: number | null
  title: string
}) {
  const t = useTranslations('detail')
  const format = useFormatter()
  const afterAction = useAfterAction()
  const [open, setOpen] = useState(false)
  const line = useRef<HTMLParagraphElement>(null)

  const link = (chunks: ReactNode) => (
    <ActionLink onClick={() => setOpen(true)}>{chunks}</ActionLink>
  )
  const date = format.dateTime(new Date(`${acquiredAt}T12:00:00Z`), { dateStyle: 'medium' })

  return (
    <>
      <p ref={line} className="text-meta text-text-muted">
        {t.rich('acquiredOn', {
          status,
          date,
          price:
            price === null
              ? t('addPrice')
              : format.number(price / 100, { style: 'currency', currency: 'EUR' }),
          dateLink: link,
          priceLink: link,
        })}
      </p>
      <PurchasePicker
        open={open}
        onOpenChange={setOpen}
        copyId={copyId}
        status={status}
        title={title}
        acquiredAt={acquiredAt}
        price={price}
        onSettled={(result) => {
          afterAction(result)
          focusSectionRow(line.current)
        }}
      />
    </>
  )
}

/**
 * FR-36: a lent copy's Returned, a Link with no picker. It closes the loan
 * today with the toast "Returned" and Undo, which reopens it. Every result
 * goes to `afterAction`, whose refresh re-renders the line without this
 * Link, so focus moves first to its section (the Your copies row, or the Loans list).
 */
export function useReturnLoan() {
  const t = useTranslations()
  const { show } = useToast()
  const afterAction = useAfterAction()
  const [pending, startTransition] = useTransition()

  const returned = (loanId: number, onSettled: () => void) => {
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
      onSettled()
    })
  }

  return { pending, returned }
}

export function ReturnLoan({ loanId }: { loanId: number }) {
  const t = useTranslations('loans')
  const link = useRef<HTMLButtonElement>(null)
  const { pending, returned } = useReturnLoan()
  return (
    <ActionLink
      ref={link}
      disabled={pending}
      onClick={() =>
        returned(loanId, () => {
          // The Loans list is a plain section, not a Folding section.
          if (!focusSectionRow(link.current)) link.current?.closest('section')?.focus()
        })
      }
    >
      {t('returned')}
    </ActionLink>
  )
}
