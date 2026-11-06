'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from 'react'

import { finishedDays, helsinkiToday } from '@/fields/readingDates'
import type { UserBookState } from '@/lib/books/effectiveBook'
import type { ActionResult } from '@/lib/errors'

import { ActionLink } from '../components/Link'

import { Rating } from '../components/Rating'
import { TextSwitch } from '../components/TextSwitch'
import { useSavedSwitch } from '../components/useSavedSwitch'
import { useToast } from '../components/toast/ToastProvider'

import { setRatingAction, setReadAction } from './actions'
import { ReadingDatesPicker } from './ReadingDatesPicker'
import { readingLine, type ReadingDates } from './readingLine'
import { useAfterAction, useClaimUndoRefresh } from './ShelfRows'

type Props = {
  bookId: number
  /** The Book's title: the finish toast and the Picker name it. */
  title: string
  initial: Pick<UserBookState, 'state' | 'readingSince' | 'finishedAt' | 'rating'>
}

/**
 * EXPERIENCE.md, Book detail → Reading and rating: the unread / reading /
 * read switch, the muted dates line under it and, while the switch shows
 * read, the Rating, stacked, with no heading. Each change saves at once and
 * shows the tapped value, falling back to the stored one on failure
 * (`useSavedSwitch`). Every result goes to `afterAction`. Only Reading → Read,
 * from the switch or the Picker, toasts: "Finished {title} · {n} days", with
 * no Undo (PRD FR-15, FR-53); select mode's mark read keeps its Undo. The
 * line's dates and "Add dates" open the reading-dates Picker (FR-54).
 *
 * After a successful Undo from the toast the route is refreshed and the
 * group remounted in the same transition, so the switch seeds from the
 * restored values: a refresh can bring back the very values the group was
 * rendered with, so a prop-change key would not remount it. The refresh
 * follows any toast Undo, so it refreshes Book detail after one from another
 * group too; `ReceiveCopy` relies on it. While mounted it claims that refresh
 * from the rows (`useClaimUndoRefresh`), so on `/` it runs once; on `/loans`
 * `RefreshOnUndo` refreshes as well.
 */
export function ReadAndRating(props: Props) {
  const router = useRouter()
  const { onUndone } = useToast()
  const [, startTransition] = useTransition()
  const [generation, setGeneration] = useState(0)
  useClaimUndoRefresh()

  useEffect(
    () =>
      onUndone(() =>
        startTransition(() => {
          router.refresh()
          setGeneration((g) => g + 1)
        }),
      ),
    [onUndone, router],
  )

  return <Group key={generation} {...props} />
}

function Group({ bookId, title, initial }: Props) {
  const t = useTranslations()
  const format = useFormatter()
  const { show } = useToast()
  const afterAction = useAfterAction()
  const ratingId = useId()
  const [picking, setPicking] = useState(false)
  const group = useRef<HTMLDivElement>(null)
  // The line follows each stored result (the switch's or the Picker's), not the props.
  const [dates, setDates] = useState<ReadingDates>({
    state: initial.state,
    readingSince: initial.readingSince,
    finishedAt: initial.finishedAt,
  })

  const finishToast = (days: number) =>
    show({ kind: 'success', message: t('toast.finished', { title, n: days }) })

  const [state, setState, storeState] = useSavedSwitch(
    initial.state,
    (next) => setReadAction({ bookId, state: next }),
    (data) => {
      const { state: stored, finishedDays } = data
      setDates({
        state: stored.state,
        readingSince: stored.readingSince,
        finishedAt: stored.finishedAt,
      })
      if (finishedDays !== null) finishToast(finishedDays)
      afterAction({ ok: true, data })
    },
    afterAction,
  )
  const [rating, setRating] = useSavedSwitch(
    initial.rating,
    (next) => setRatingAction({ bookId, rating: next }),
    (data) => afterAction({ ok: true, data }),
    afterAction,
  )

  const onDatesSaved = (result: ActionResult<UserBookState>) => {
    if (result.ok) {
      const stored = result.data
      setDates({
        state: stored.state,
        readingSince: stored.readingSince,
        finishedAt: stored.finishedAt,
      })
      storeState(stored.state)
      if (
        dates.state === 'reading' &&
        stored.state === 'read' &&
        stored.readingSince &&
        stored.finishedAt
      ) {
        finishToast(finishedDays(stored.readingSince, stored.finishedAt))
      }
    }
    // The Link that opened the Picker can be gone ("Add dates" → "Started {date}").
    group.current?.focus()
    afterAction(result)
  }

  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: 'medium' })
  const open = () => setPicking(true)
  const link = (chunks: ReactNode) => <ActionLink onClick={open}>{chunks}</ActionLink>
  const line = readingLine(dates, helsinkiToday())

  return (
    <div ref={group} tabIndex={-1} className="flex flex-col gap-2">
      <TextSwitch
        label={t('detail.reading')}
        value={state}
        options={[
          { value: 'unread', label: t('collection.unread') },
          { value: 'reading', label: t('collection.reading') },
          { value: 'read', label: t('collection.read') },
        ]}
        onChange={setState}
      />
      {line.kind !== 'none' && (
        <p className="text-meta text-text-muted">
          {line.kind === 'since' &&
            t.rich('detail.readingSince', { date: day(line.start), n: line.days, link })}
          {line.kind === 'range' &&
            t.rich('detail.readingRange', {
              start: day(line.start),
              finish: day(line.finish),
              n: line.days,
              startLink: link,
              finishLink: link,
            })}
          {line.kind === 'started' &&
            t.rich('detail.readingStarted', { date: day(line.start), link })}
          {line.kind === 'finished' &&
            t.rich('detail.readingFinished', { date: day(line.finish), link })}
          {line.kind === 'addDates' && link(t('detail.addDates'))}
        </p>
      )}
      {state === 'read' && (
        <>
          <span id={ratingId} className="sr-only">
            {t('detail.rating')}
          </span>
          <Rating
            value={rating}
            onRate={setRating}
            onClear={() => setRating(null)}
            aria-labelledby={ratingId}
          />
        </>
      )}
      <ReadingDatesPicker
        open={picking}
        onOpenChange={setPicking}
        bookId={bookId}
        title={title}
        dates={dates}
        onSettled={onDatesSaved}
      />
    </div>
  )
}
