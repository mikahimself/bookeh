'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useEffect, useId, useState, useTransition } from 'react'

import type { UserBookState } from '@/lib/books/effectiveBook'

import { Rating } from '../components/Rating'
import { TextSwitch } from '../components/TextSwitch'
import { useSavedSwitch } from '../components/useSavedSwitch'
import { useToast } from '../components/toast/ToastProvider'

import { setRatingAction, setReadAction } from './actions'
import { useAfterAction, useClaimUndoRefresh } from './ShelfRows'

type Props = { bookId: number; initial: Pick<UserBookState, 'read' | 'rating'> }

/**
 * EXPERIENCE.md, Book detail: the read / unread switch and the Rating,
 * stacked, with no heading. Each change saves at once and shows the tapped
 * value, falling back to the stored one on failure (`useSavedSwitch`). Every
 * result goes to `afterAction`. Neither toasts nor offers Undo: one tap puts
 * either back (PRD FR-15); select mode's mark read keeps its Undo.
 *
 * After a successful Undo from the toast the route is refreshed and the
 * group remounted in the same transition, so the switch seeds from the
 * restored flag: a refresh can bring back the very value the group was
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

function Group({ bookId, initial }: Props) {
  const t = useTranslations()
  const afterAction = useAfterAction()
  const ratingId = useId()

  const [read, setRead] = useSavedSwitch(
    initial.read,
    (next) => setReadAction({ bookId, read: next }),
    (data) => afterAction({ ok: true, data }),
    afterAction,
  )
  const [rating, setRating] = useSavedSwitch(
    initial.rating,
    (next) => setRatingAction({ bookId, rating: next }),
    (data) => afterAction({ ok: true, data }),
    afterAction,
  )

  return (
    <div className="flex flex-col gap-2">
      <TextSwitch
        label={t('detail.read')}
        value={read ? 'read' : 'unread'}
        options={[
          { value: 'read', label: t('collection.read') },
          { value: 'unread', label: t('collection.unread') },
        ]}
        onChange={(value) => setRead(value === 'read')}
      />
      <span id={ratingId} className="sr-only">
        {t('detail.rating')}
      </span>
      <Rating
        value={rating}
        onRate={setRating}
        onClear={() => setRating(null)}
        aria-labelledby={ratingId}
      />
    </div>
  )
}
