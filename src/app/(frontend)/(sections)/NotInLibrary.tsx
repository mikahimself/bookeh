'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { shelfHref, type ShelfQuery } from '@/lib/shelf/query'

import { useToast } from '../components/toast/ToastProvider'

/**
 * `?book=` names a Book the viewer does not hold (EXPERIENCE.md, States):
 * the notice "Not in library", a success-kind toast as on Edit book, and the
 * address without `book`, replacing and keeping the list where it is.
 * Renders nothing.
 */
export function NotInLibrary({ query }: { query: ShelfQuery }) {
  const t = useTranslations('answer')
  const { show } = useToast()
  const router = useRouter()
  const href = shelfHref(query)

  useEffect(() => {
    show({ kind: 'success', message: t('notInLibrary') })
    router.replace(href, { scroll: false })
  }, [show, t, router, href])

  return null
}
