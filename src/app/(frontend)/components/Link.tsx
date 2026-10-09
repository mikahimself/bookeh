import NextLink from 'next/link'
import type { ComponentProps } from 'react'

/** DESIGN.md, Link: `text` with a 2px underline 3px below, accent or, when destructive, danger. */
export function linkClass(destructive = false): string {
  return `inline-flex items-center text-text underline decoration-2 underline-offset-3 ${
    destructive ? 'decoration-danger' : 'decoration-accent'
  } max-wide:min-h-tap disabled:text-text-dim disabled:decoration-text-dim`
}

export type TextLinkProps = Omit<ComponentProps<typeof NextLink>, 'className'>

/** A Link that goes somewhere. */
export function TextLink(props: TextLinkProps) {
  return <NextLink {...props} className={linkClass()} />
}

export type ActionLinkProps = Omit<ComponentProps<'button'>, 'className' | 'type'> & {
  destructive?: boolean
}

/** A Link that acts in place ("Clear", "Try again"), destructive when it removes something. */
export function ActionLink({ destructive, ...props }: ActionLinkProps) {
  return <button {...props} type="button" className={linkClass(destructive)} />
}

/**
 * DESIGN.md, Back link: a Link in `meta` above a screen heading. Its caller
 * labels it with the section it returns to.
 */
export function BackLink(props: TextLinkProps) {
  return <NextLink {...props} className={`${linkClass()} text-meta`} />
}
