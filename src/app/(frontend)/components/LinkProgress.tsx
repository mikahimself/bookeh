'use client'

import { useLinkStatus } from 'next/link'
import { useTranslations } from 'next-intl'

import { ProgressLine } from './ProgressLine'

/** The Progress line while the enclosing `<Link>` is pending; renders inside it. */
export function LinkProgress() {
  const { pending } = useLinkStatus()
  const t = useTranslations('progress')
  return pending ? <ProgressLine label={t('loading')} /> : null
}
