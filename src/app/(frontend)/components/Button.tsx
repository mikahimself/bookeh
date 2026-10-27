import type { ComponentProps } from 'react'

const outlines = {
  primary: 'border-accent',
  secondary: 'border-text',
  destructive: 'border-danger',
} as const

export type ButtonVariant = keyof typeof outlines

/**
 * The Button look, shared with links drawn as a button (Scan book). `compact`
 * (DESIGN.md, Button, compact) pads less and is drawn under the tap height;
 * on the phone a pseudo-element grows its tap area up from its bottom edge to
 * 44px, so it never reaches below the row it sits in.
 */
export function buttonClass(variant: ButtonVariant, { compact = false } = {}): string {
  const size = compact
    ? "relative shrink-0 px-3 py-1 max-wide:before:absolute max-wide:before:inset-x-0 max-wide:before:bottom-0 max-wide:before:h-tap max-wide:before:content-['']"
    : 'px-4 py-2 max-wide:min-h-tap'
  return `border-2 ${outlines[variant]} bg-transparent ${size} text-button text-text ui-case disabled:border-text-dim disabled:text-text-dim`
}

export type ButtonProps = Omit<ComponentProps<'button'>, 'className'> & {
  variant: ButtonVariant
}

/** DESIGN.md, Button: transparent, outlined, square, lowercase. One primary per layer. */
export function Button({ variant, type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={buttonClass(variant)} />
}
