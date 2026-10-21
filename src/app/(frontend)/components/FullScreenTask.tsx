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
 *
 * `foot` is pinned to the bottom edge on every width (Save on Edit book):
 * the column fills the height, so the foot sits at the bottom when the
 * content is short and sticks there, below the content, when it scrolls.
 * It carries `data-pinned-wide` too, so the toast rises above it on wide
 * screens as well. `onClose` intercepts the X: it receives the close the X would run, to call
 * now or after a confirmation.
 */
export function FullScreenTask({
  title,
  children,
  foot,
  onClose,
}: {
  title: string
  children?: ReactNode
  foot?: ReactNode
  onClose?: (close: () => void) => void
}) {
  const t = useTranslations('task')
  const closeTask = useCloseTask()
  const frame = useRef<HTMLDivElement>(null)
  useSuspendSwipe()

  const close = () => closeTask(frame.current)

  return (
    <div ref={frame} className="fixed inset-0 overflow-y-auto bg-background">
      <div className="mx-auto flex min-h-full w-full max-w-task-width flex-col gap-6 px-page-margin-phone pt-page-margin-phone wide:px-page-margin wide:pt-page-margin">
        <header className="flex items-start justify-between gap-4">
          <h1 className="text-heading-section-phone ui-case wide:text-heading-section">{title}</h1>
          <CloseButton label={t('close')} onClick={() => (onClose ? onClose(close) : close())} />
        </header>
        {children}
        {foot != null && (
          <div
            data-pinned-bottom
            data-pinned-wide
            className="sticky bottom-0 mt-auto flex flex-col gap-2 bg-background pt-4 pb-[calc(var(--spacing-4)+env(safe-area-inset-bottom))]"
          >
            {foot}
          </div>
        )}
      </div>
    </div>
  )
}
