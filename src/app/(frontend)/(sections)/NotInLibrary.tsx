'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { useToast } from '../components/toast/ToastProvider'

/**
 * `?book=` names a Book the viewer does not hold (EXPERIENCE.md, States):
 * the notice "Not in library", a success-kind toast as on Edit book, and the
 * section's address without `book` (`back`), replacing and keeping the
 * list where it is. Renders nothing.
 */
export function NotInLibrary({ back }: { back: string }) {
  const t = useTranslations('answer')
  const { show } = useToast()
  const router = useRouter()

  useEffect(() => {
    show({ kind: 'success', message: t('notInLibrary') })
    router.replace(back, { scroll: false })
  }, [show, t, router, back])

  return null
}
