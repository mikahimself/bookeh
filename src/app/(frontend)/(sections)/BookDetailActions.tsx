'use client'

import Link from 'next/link'
import { useFormatter, useTranslations } from 'next-intl'
import { useRef, useState, useTransition, type ReactNode } from 'react'

import type { CopyLine } from '@/lib/books/holdings'
import type { LocationOption } from '@/lib/copies/locations'
import type { Named } from '@/lib/payload/ref'

import { AppBar, AppBarButton, AppBarLink } from '../components/AppBar'
import { Button, buttonClass } from '../components/Button'
import { ActionLink } from '../components/Link'
import { settleAction } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'
import { Dialog } from '../components/ui/Dialog'
import { Menu, type MenuItem } from '../components/ui/Menu'
import { useWide } from '../components/ui/overlay'
import { Picker } from '../components/ui/Picker'

import { receiveCopyAction, removeCopiesAction } from './actions'
import { BookDetailFooter } from './BookDetailPanel'
import { copyActions, type CopyAction, type CopyActionName } from './copyActions'
import { useReturnLoan } from './CopyLine'
import { useCloseDetail } from './detailClose'
import { LendPicker } from './LendPicker'
import { useDetailLookUpAgain } from './LookUpAgain'
import { MovePicker } from './MovePicker'
import { useAddReadingDates } from './ReadAndRating'
import { useRefetch } from './Refetch'
import { useAfterAction } from './ShelfRows'

type Props = {
  bookId: number
  title: string
  copies: readonly CopyLine[]
  hasEntries: boolean
  locations: readonly LocationOption[]
  people: readonly Named[]
  utility: 'refetch' | 'lookup' | 'no-isbn' | null
  children: ReactNode
}

type Step = { name: 'lend' | 'move' | 'remove'; copy: CopyLine }

/** One controller owns mutations and overlays for both responsive surfaces. */
export function BookDetailActions({
  bookId,
  title,
  copies,
  hasEntries,
  locations,
  people,
  utility,
  children,
}: Props) {
  const t = useTranslations()
  const format = useFormatter()
  const wide = useWide()
  const afterAction = useAfterAction()
  const closeDetail = useCloseDetail()
  const { show } = useToast()
  const [pending, startTransition] = useTransition()
  const returned = useReturnLoan()
  const refetch = useRefetch(bookId)
  const lookup = useDetailLookUpAgain(bookId)
  const addDates = useAddReadingDates()
  const [choosing, setChoosing] = useState<CopyAction | null>(null)
  const [choosingOpen, setChoosingOpen] = useState(false)
  const [step, setStep] = useState<Step | null>(null)
  const [stepOpen, setStepOpen] = useState(false)
  const confirmed = useRef<CopyLine | null>(null)
  const busy = pending || returned.pending || lookup.pending
  const focusCopies = () => document.getElementById(`your-copies-${bookId}`)?.focus()
  const focusDetail = () =>
    (
      document.getElementById(`your-copies-${bookId}`) ??
      document.getElementById(`on-wishlists-${bookId}`)
    )?.focus()
  const runUtility = (run: () => void) => () => {
    focusDetail()
    run()
  }
  const actions = copyActions(copies).filter(({ name }) => name !== 'move' || locations.length > 0)
  const labels: Record<CopyActionName, string> = {
    returned: t('loans.returned'),
    received: t('detail.received'),
    lend: t('loans.lend'),
    move: t('collection.move'),
    remove: t('collection.remove'),
  }

  const run = (name: CopyActionName, copy: CopyLine) => {
    if (busy) return
    // Immediate actions can disable or remove their opener before the refresh.
    focusCopies()
    if (name === 'returned') {
      if (copy.loan) returned.returned(copy.loan.loanId, focusCopies)
    } else if (name === 'received') {
      startTransition(async () => {
        const result = await settleAction(receiveCopyAction({ copyId: copy.copyId }))
        if (result.ok) {
          const { savedTo, undoToken, undoSeconds } = result.data
          show({
            kind: 'success',
            message: savedTo ? t('toast.savedTo', { location: savedTo.name }) : t('toast.saved'),
            undo: { token: undoToken, seconds: undoSeconds },
          })
        }
        afterAction(result)
        focusCopies()
      })
    } else {
      setStep({ name, copy })
      setStepOpen(true)
    }
  }
  const choose = (action: CopyAction) => {
    if (busy) return
    if (action.copies.length === 1) run(action.name, action.copies[0])
    else {
      focusCopies()
      setChoosing(action)
      setChoosingOpen(true)
    }
  }
  const remove = () => {
    const copy = confirmed.current
    confirmed.current = null
    if (!copy) return
    focusCopies()
    startTransition(async () => {
      const result = await settleAction(removeCopiesAction([copy.copyId]))
      afterAction(result)
      if (result.ok && result.data.removed > 0 && copies.length === 1) {
        if (!hasEntries) closeDetail()
        else document.getElementById(`on-wishlists-${bookId}`)?.focus()
      } else focusCopies()
    })
  }

  const utilities: MenuItem[] = []
  if (utility === 'refetch')
    utilities.push({
      label: refetch.label,
      disabled: refetch.pending,
      onSelect: runUtility(refetch.run),
    })
  if (utility === 'lookup')
    utilities.push({
      label: lookup.label,
      disabled: lookup.pending,
      onSelect: runUtility(lookup.run),
    })
  if (addDates)
    utilities.push({ label: t('detail.addReadingDates'), onSelect: runUtility(addDates) })
  // Edit and at most three copy actions; additional actions and utilities use More.
  const shown = actions.slice(0, 3)
  const overflow = [
    ...actions.slice(shown.length).map((action) => ({
      label: labels[action.name],
      disabled: busy,
      destructive: action.name === 'remove',
      onSelect: () => choose(action),
    })),
    ...utilities,
  ]
  const edit = `/books/${bookId}/edit`

  return (
    <>
      {wide && (
        <div className="flex flex-col items-start gap-1">
          {utility === 'refetch' && (
            <>
              <ActionLink disabled={refetch.pending} onClick={runUtility(refetch.run)}>
                {refetch.label}
              </ActionLink>
              <p className="text-meta text-text-muted">{t('detail.refetchHint')}</p>
            </>
          )}
          {utility === 'lookup' && (
            <ActionLink disabled={lookup.pending} onClick={runUtility(lookup.run)}>
              {lookup.label}
            </ActionLink>
          )}
          {utility === 'no-isbn' && (
            <p className="text-meta text-text-muted">{t('detail.lookUpNeedsIsbn')}</p>
          )}
          {addDates && <ActionLink onClick={addDates}>{t('detail.addReadingDates')}</ActionLink>}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {wide && (
          <>
            <Link
              href={edit}
              transitionTypes={['task-open']}
              className={`${buttonClass('secondary')} inline-flex items-center justify-center`}
            >
              {t('detail.edit')}
            </Link>
            {actions.map((action) => (
              <Button
                key={action.name}
                variant={action.name === 'remove' ? 'destructive' : 'secondary'}
                disabled={busy}
                onClick={() => choose(action)}
              >
                {labels[action.name]}
              </Button>
            ))}
          </>
        )}
        <div className="flex w-full flex-1 flex-col [&>button]:w-full">{children}</div>
      </div>
      {!wide && (
        <BookDetailFooter>
          <AppBar standalone>
            <AppBarLink icon="edit" primary href={edit} transitionTypes={['task-open']}>
              {t('detail.edit')}
            </AppBarLink>
            {shown.map((action) => (
              <AppBarButton
                key={action.name}
                icon={action.name}
                destructive={action.name === 'remove'}
                disabled={busy}
                onClick={() => choose(action)}
              >
                {labels[action.name]}
              </AppBarButton>
            ))}
            {overflow.length > 0 && (
              <Menu
                trigger={<AppBarButton icon="more">{t('detail.moreActions')}</AppBarButton>}
                items={overflow}
              />
            )}
          </AppBar>
        </BookDetailFooter>
      )}
      {/* 11.7 replaces this close-then-open choice with a shared two-step Picker and Back. */}
      <Picker<number>
        open={choosingOpen}
        onOpenChange={setChoosingOpen}
        title={t('detail.chooseCopy')}
        description={<p className="text-meta text-text-muted">{title}</p>}
        value={null}
        options={(choosing?.copies ?? []).map((copy, index) => ({
          value: copy.copyId,
          label: `${index + 1}. ${copy.location ? `${copy.location.name} · ` : ''}${copy.status === 'owned' && copy.loan ? t('loans.lentMarker', { person: copy.loan.person.name }) : t('answer.copy', { status: copy.status })} · ${format.dateTime(new Date(`${copy.acquiredAt}T12:00:00Z`), { dateStyle: 'medium' })}`,
        }))}
        onChoose={(copyId) => {
          const copy = choosing?.copies.find((copy) => copy.copyId === copyId)
          if (choosing && copy) run(choosing.name, copy)
        }}
      />
      {step?.name === 'move' && (
        <MovePicker
          open={stepOpen}
          onOpenChange={setStepOpen}
          locations={locations}
          value={step.copy.location?.id ?? null}
          copyIds={[step.copy.copyId]}
          startTransition={startTransition}
          onSettled={focusCopies}
        />
      )}
      {step?.name === 'lend' && (
        <LendPicker
          open={stepOpen}
          onOpenChange={setStepOpen}
          context={step.copy.location ? `${title} · ${step.copy.location.name}` : title}
          people={people}
          copyId={step.copy.copyId}
          startTransition={startTransition}
          pending={pending}
          onSettled={focusCopies}
        />
      )}
      {step?.name === 'remove' && (
        <Dialog
          open={stepOpen}
          onOpenChange={setStepOpen}
          onClosed={remove}
          title={t('collection.removeTitle', { n: 1 })}
          confirm={
            <Button
              variant="destructive"
              onClick={() => {
                if (!stepOpen) return
                confirmed.current = step.copy
                setStepOpen(false)
              }}
            >
              {t('collection.remove')}
            </Button>
          }
        />
      )}
      {lookup.picker}
    </>
  )
}
