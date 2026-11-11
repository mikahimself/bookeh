'use client'

import { useTranslations } from 'next-intl'
import Link from 'next/link'
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'

/**
 * The slot is a state-held element so a section below the layout (the
 * collection, inside its own providers) can portal buttons into a bar it
 * does not render. Null until the bar has mounted.
 */
const SlotContext = createContext<{
  slot: HTMLElement | null
  setSlot: (el: HTMLElement | null) => void
}>({ slot: null, setSlot: () => {} })

export function AppBarProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  return <SlotContext value={{ slot, setSlot }}>{children}</SlotContext>
}

/** A section's own buttons, drawn in the App bar after its primary. Nothing until the bar exists. */
export function AppBarItems({ children }: { children: ReactNode }) {
  const { slot } = useContext(SlotContext)
  return slot ? createPortal(children, slot) : null
}

const circle = (primary: boolean, destructive = false) =>
  `flex size-tap items-center justify-center rounded-full border-(length:--spacing-stroke-control) ${
    destructive ? 'border-bar-danger' : primary ? 'border-accent' : 'border-bar-ink'
  }`
const item = 'flex min-w-0 flex-col items-center gap-1 text-center text-label text-bar-ink ui-case'

export type AppBarIcon =
  | 'plus'
  | 'filter'
  | 'select'
  | 'up'
  | 'edit'
  | 'returned'
  | 'received'
  | 'lend'
  | 'move'
  | 'remove'
  | 'more'

const paths: Record<AppBarIcon, string> = {
  plus: 'M11 4 V18 M4 11 H18',
  edit: 'M4 15 L14 5 L17 8 L7 18 H4 Z M12 7 L15 10',
  returned: 'M8 5 L3 10 L8 15 M3 10 H13 A5 5 0 0 1 13 20',
  received: 'M4 11 L9 16 L18 6',
  lend: 'M3 11 H19 M13 5 L19 11 L13 17',
  move: 'M3 11 H19 M7 7 L3 11 L7 15 M15 7 L19 11 L15 15',
  remove: 'M4 6 H18 M8 6 V3 H14 V6 M6 6 L7 19 H15 L16 6 M10 9 V16 M13 9 V16',
  more: 'M4 11 H6 M10 11 H12 M16 11 H18',
  filter: 'M3 5 H19 M6 11 H16 M9 17 H13',
  select: 'M4 4 H18 V18 H4 Z M7.5 11 L10 13.5 L14.5 8.5',
  up: 'M11 18 V4 M5 10 L11 4 L17 10',
}

function Icon({ name }: { name: AppBarIcon }) {
  return (
    <svg viewBox="0 0 22 22" aria-hidden="true" className="size-5 shrink-0">
      <path d={paths[name]} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** A bar button that goes somewhere: a circle with an icon over its lowercase label. */
export function AppBarLink({
  icon,
  primary = false,
  children,
  ...props
}: Omit<ComponentProps<typeof Link>, 'className'> & { icon: AppBarIcon; primary?: boolean }) {
  return (
    <Link {...props} className={item}>
      <span className={circle(primary)}>
        <Icon name={icon} />
      </span>
      {children}
    </Link>
  )
}

/** A bar button that acts in place. */
export function AppBarButton({
  icon,
  children,
  destructive = false,
  ...props
}: Omit<ComponentProps<'button'>, 'className' | 'type'> & {
  icon: AppBarIcon
  destructive?: boolean
}) {
  return (
    <button {...props} type="button" className={`${item} disabled:opacity-50`}>
      <span className={circle(false, destructive)}>
        <Icon name={icon} />
      </span>
      {children}
    </button>
  )
}

/**
 * EXPERIENCE.md and DESIGN.md, App bar: the phone's slate band pinned to the
 * bottom, drawn under 900px only. The primary comes as children, a section's
 * own buttons through `AppBarItems`, and "top" joins once the window is
 * scrolled past two screens and leaves within one (so it does not flicker at
 * a single threshold). The jump is smooth, or instant under reduced motion.
 */
export function AppBar({
  children,
  standalone = false,
}: {
  children: ReactNode
  standalone?: boolean
}) {
  const t = useTranslations('sections')
  const { setSlot } = useContext(SlotContext)
  const [top, setTop] = useState(false)

  useEffect(() => {
    if (standalone) return
    const onScroll = () => {
      const { scrollY, innerHeight } = window
      setTop((was) => (was ? scrollY > innerHeight : scrollY > 2 * innerHeight))
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    // A rotate changes the screen height the thresholds are counted in.
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [standalone])

  return (
    <div
      data-pinned-bottom
      data-app-bar
      className={`sticky bottom-0 flex items-start justify-center ${standalone ? 'gap-3' : 'gap-5'} bg-bar px-page-margin-phone pt-3 pb-[calc(var(--spacing-2)+env(safe-area-inset-bottom))] wide:hidden`}
    >
      {children}
      {!standalone && <div ref={setSlot} className="contents" />}
      {!standalone && top && (
        <AppBarButton
          icon="up"
          onClick={() => {
            const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
            window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
          }}
        >
          {t('backToTop')}
        </AppBarButton>
      )}
    </div>
  )
}
