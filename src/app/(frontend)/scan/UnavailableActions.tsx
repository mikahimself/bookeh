'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import type { WishlistLine } from '@/lib/wishlists/wishlists'

import { Button } from '../components/Button'
import { ActionLink } from '../components/Link'
import { ProgressLine } from '../components/ProgressLine'

import { AnswerBack } from './AnswerBack'
import { NotFoundForm } from './NotFoundForm'

/**
 * Couldn't look it up's controls: the Add by hand Link, then Try again
 * (primary) above Back. Try again re-renders the same address on the server,
 * so the lookup runs once more (an outage is never cached) with no new
 * history entry; the progress line runs meanwhile. Add by hand puts the Not
 * found form in place of the Link and the foot, for good: one primary and one
 * Back per layer; its Add to wishlist offers `lists`.
 */
export function UnavailableActions({
  isbn13,
  lists,
}: {
  isbn13: string
  lists: readonly WishlistLine[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const [byHand, setByHand] = useState(false)
  const [pending, startTransition] = useTransition()

  if (byHand) return <NotFoundForm isbn13={isbn13} title="" lists={lists} />

  const retry = () => {
    startTransition(() => {
      router.refresh()
    })
  }

  return (
    <>
      {pending && <ProgressLine label={t('progress.loading')} />}
      <div>
        <ActionLink onClick={() => setByHand(true)} disabled={pending}>
          {t('answer.addByHand')}
        </ActionLink>
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={retry} disabled={pending}>
          {t('answer.tryAgain')}
        </Button>
        <AnswerBack label={t('answer.back')} />
      </div>
    </>
  )
}
