'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

/**
 * EXPERIENCE.md, Scrolling: the phone's back-to-top square beside Scan book
 * in the pinned bar (which only the phone draws). It shows once the window is
 * scrolled past two screens and hides again within one, so it does not
 * flicker at a single threshold. The jump is smooth, or instant under reduced
 * motion.
 */
export function BackToTop() {
  const t = useTranslations('sections')
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const { scrollY, innerHeight } = window
      setShown((was) => (was ? scrollY > innerHeight : scrollY > 2 * innerHeight))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    // A rotate changes the screen height the thresholds are counted in.
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  if (!shown) return null

  return (
    <button
      type="button"
      aria-label={t('backToTop')}
      onClick={() => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
      }}
      className="flex size-tap shrink-0 items-center justify-center border-2 border-text bg-transparent text-text"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0">
        <path d="M8 14 V2 M3 7 L8 2 L13 7" fill="none" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>
  )
}
