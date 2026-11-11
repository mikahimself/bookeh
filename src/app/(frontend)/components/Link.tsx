import NextLink from 'next/link'
import type { ComponentProps } from 'react'

/**
 * DESIGN.md, Tap area ("by padding, whatever its drawn height"): on the phone
 * a pseudo-element 44px high, centred on the control and as wide as it, takes
 * the taps, so the control is drawn at its own height and its tap area takes
 * no layout room. The compact button's pattern (`buttonClass`), centred
 * rather than bottom-anchored. Callers space their controls so no two areas
 * overlap.
 */
export const tapOutsideClass =
  "relative max-wide:before:absolute max-wide:before:inset-x-0 max-wide:before:top-1/2 max-wide:before:-translate-y-1/2 max-wide:before:h-tap max-wide:before:content-['']"

/**
 * DESIGN.md, Link: `text` with a 2px underline 3px below, accent or, when
 * destructive, danger. At least 44px high on the phone; with `tapOutside`,
 * drawn at its line's height with the tap area outside the layout
 * (`tapOutsideClass`).
 */
export function linkClass(destructive = false, tapOutside = false): string {
  return `inline-flex items-center text-text underline decoration-2 underline-offset-3 ${
    destructive ? 'decoration-danger' : 'decoration-accent'
  } ${tapOutside ? tapOutsideClass : 'max-wide:min-h-tap'} disabled:text-text-dim disabled:decoration-text-dim`
}

export type TextLinkProps = Omit<ComponentProps<typeof NextLink>, 'className'> & {
  /** The tap area outside the layout (`tapOutsideClass`), as in Book detail's header. */
  tapOutside?: boolean
}

/** A Link that goes somewhere. */
export function TextLink({ tapOutside, ...props }: TextLinkProps) {
  return <NextLink {...props} className={linkClass(false, tapOutside)} />
}

export type ActionLinkProps = Omit<ComponentProps<'button'>, 'className' | 'type'> & {
  destructive?: boolean
  /** The tap area outside the layout (`tapOutsideClass`), as in Book detail's header. */
  tapOutside?: boolean
}

/** A Link that acts in place ("Clear", "Try again"), destructive when it removes something. */
export function ActionLink({ destructive, tapOutside, ...props }: ActionLinkProps) {
  return <button {...props} type="button" className={linkClass(destructive, tapOutside)} />
}

/**
 * DESIGN.md, Back link: a Link in `meta` above a screen heading. Its caller
 * labels it with the section it returns to.
 */
export function BackLink(props: TextLinkProps) {
  return <NextLink {...props} className={`${linkClass()} text-meta`} />
}
