'use client'

import { useTranslations } from 'next-intl'
import { useRef, type ReactNode } from 'react'

import { CloseButton } from './CloseButton'
import { useCloseTask } from './navigation'
import { useSuspendSwipe } from './swipe'

/**
 * A full-screen task (EXPERIENCE.md): covers the screen and scrolls within
 * itself. On wide screens the content is a centred column the width of a
 * large phone. The X goes back, sliding the task away, or to `/` when the
 * task was opened directly. While it is open, swiping between sections is
 * suspended.
 */
export function FullScreenTask({ title, children }: { title: string; children?: ReactNode }) {
  const t = useTranslations('task')
  const close = useCloseTask()
  const frame = useRef<HTMLDivElement>(null)
  useSuspendSwipe()

  return (
    <div ref={frame} className="fixed inset-0 overflow-y-auto bg-background">
      <div className="mx-auto flex w-full max-w-task-width flex-col gap-6 px-page-margin-phone pt-page-margin-phone wide:px-page-margin wide:pt-page-margin">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-heading-section-phone ui-case wide:text-heading-section">{title}</h1>
          <CloseButton label={t('close')} onClick={() => close(frame.current)} />
        </header>
        {children}
      </div>
    </div>
  )
}
