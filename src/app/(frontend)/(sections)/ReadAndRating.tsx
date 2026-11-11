'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useContext,
  useEffect,
  useId,
  useState,
  useTransition,
  type ReactNode,
} from 'react'

import { finishedDays, helsinkiToday } from '@/fields/readingDates'
import type { UserBookState } from '@/lib/books/effectiveBook'
import type { ActionResult } from '@/lib/errors'

import { ActionLink } from '../components/Link'

import { Rating } from '../components/Rating'
import { SegmentedControl } from '../components/SegmentedControl'
import { useSavedSwitch } from '../components/useSavedSwitch'
import { useToast } from '../components/toast/ToastProvider'

import { setRatingAction, setReadAction } from './actions'
import { ReadingDatesPicker } from './ReadingDatesPicker'
import { detailsRowId, readingLine, type ReadingDates, type ReadingLine } from './readingLine'
import { useAfterAction, useClaimUndoRefresh } from './ShelfRows'

type Props = {
  bookId: number
  /** The Book's title: the finish toast and the Picker name it. */
  title: string
  initial: Pick<UserBookState, 'state' | 'readingSince' | 'finishedAt' | 'rating'>
  /** Book detail's header, rendered above the switch; its `HeaderRating` follows the switch. */
  header: ReactNode
  /** Book detail's folding sections, rendered after the reading control inside its context (`ReadingRow`). */
  children?: ReactNode
}

type HeaderRatingState = {
  /** Whether the switch shows read. */
  read: boolean
  rating: number | null
  setRating: (rating: number | null) => void
  /** The dates line (FR-54) and the opener of its Picker, for `ReadingRow`. */
  line: ReadingLine
  openDates: () => void
}

const HeaderRatingContext = createContext<HeaderRatingState | null>(null)

/**
 * EXPERIENCE.md, Book detail → Reading and rating: the `header`, then the
 * unread / reading / read Segmented control, with no heading; the dates
 * line lives in Description & details (`ReadingRow`). While the switch
 * shows read, the Rating shows in the header's text column (`HeaderRating`, through a context this group
 * provides, so it follows the switch live). Each change saves at once and
 * shows the tapped value, falling back to the stored one on failure
 * (`useSavedSwitch`). Every result goes to `afterAction`. Only Reading → Read,
 * from the switch or the Picker, toasts: "Finished {title} · {n} days", with
 * no Undo (PRD FR-15, FR-53); select mode's mark read keeps its Undo. The
 * line's dates and "Add dates" open the reading-dates Picker (FR-54).
 *
 * After a successful Undo from the toast the route is refreshed and the
 * group remounted in the same transition, so the switch and the Rating seed
 * from the restored values: a refresh can bring back the very values the
 * group was rendered with, so a prop-change key would not remount it. The refresh
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

function Group({ bookId, title, initial, header, children }: Props) {
  const t = useTranslations()
  const { show } = useToast()
  const afterAction = useAfterAction()
  const [picking, setPicking] = useState(false)
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
    document.getElementById(detailsRowId(bookId))?.focus()
    afterAction(result)
  }

  const open = () => setPicking(true)
  const line = readingLine(dates, helsinkiToday())

  return (
    <>
      <HeaderRatingContext
        value={{ read: state === 'read', rating, setRating, line, openDates: open }}
      >
        {header}
        <div className="flex flex-col gap-2">
          <SegmentedControl
            label={t('detail.reading')}
            value={state}
            options={[
              { value: 'unread', label: t('collection.unread') },
              { value: 'reading', label: t('collection.reading') },
              { value: 'read', label: t('collection.read') },
            ]}
            onChange={setState}
          />
          <ReadingDatesPicker
            open={picking}
            onOpenChange={setPicking}
            bookId={bookId}
            title={title}
            dates={dates}
            onSettled={onDatesSaved}
          />
        </div>
        {children}
      </HeaderRatingContext>
    </>
  )
}

/**
 * The Rating in Book detail's header, while the reading switch shows read;
 * a star tap saves at once. Its tap areas sit outside the layout, like the
 * header's chips (`Rating`'s `tapOutside`). Nothing outside `ReadAndRating`'s header.
 */
export function HeaderRating() {
  const t = useTranslations()
  const ratingId = useId()
  const context = useContext(HeaderRatingContext)
  if (!context?.read) return null
  const { rating, setRating } = context
  return (
    <>
      <span id={ratingId} className="sr-only">
        {t('detail.rating')}
      </span>
      <Rating
        value={rating}
        onRate={setRating}
        onClear={() => setRating(null)}
        aria-labelledby={ratingId}
        tapOutside
      />
    </>
  )
}

/**
 * Description & details' Reading row (FR-54): "Reading" at the left and the
 * dates line at the right, its dates and "Add dates" opening the
 * reading-dates Picker. Nothing outside `ReadAndRating`'s children or while
 * the Book is unread.
 */
export function ReadingRow() {
  const t = useTranslations()
  const format = useFormatter()
  const context = useContext(HeaderRatingContext)
  if (!context || context.line.kind === 'none') return null
  const { line, openDates } = context
  const day = (date: string) =>
    format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: 'medium' })
  const link = (chunks: ReactNode) => <ActionLink onClick={openDates}>{chunks}</ActionLink>
  return (
    <div className="flex items-baseline justify-between gap-4 text-body text-text-muted">
      <dt>{t('detail.reading')}</dt>
      <dd className="text-right">
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
      </dd>
    </div>
  )
}
