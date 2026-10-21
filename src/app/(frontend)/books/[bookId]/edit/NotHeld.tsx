'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect } from 'react'

import { useToast } from '../../../components/toast/ToastProvider'

/**
 * Edit book for a Book the viewer does not hold (EXPERIENCE.md, Edit book):
 * the notice "Not in library", a success-kind toast as it is no failure, over
 * the section, which replaces this address. Renders nothing.
 */
export function NotHeld() {
  const t = useTranslations('answer')
  const { show } = useToast()
  const router = useRouter()

  useEffect(() => {
    show({ kind: 'success', message: t('notInLibrary') })
    router.replace('/')
  }, [show, t, router])

  return null
}
