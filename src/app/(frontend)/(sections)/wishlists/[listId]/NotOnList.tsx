'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { useToast } from '../../../components/toast/ToastProvider'

/**
 * `?entry=` names no open entry of this list (EXPERIENCE.md, States, Entry
 * gone): closed, removed, on another list or another user's. The notice
 * "Not on this list", a success-kind toast as `NotInLibrary`'s, and the
 * list's own address (`back`), replacing and keeping the list where it is.
 * Renders nothing.
 */
export function NotOnList({ back }: { back: string }) {
  const t = useTranslations('wishlists')
  const { show } = useToast()
  const router = useRouter()

  useEffect(() => {
    show({ kind: 'success', message: t('notOnList') })
    router.replace(back, { scroll: false })
  }, [show, t, router, back])

  return null
}
