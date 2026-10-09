import type { ComponentProps } from 'react'

const outlines = {
  primary: 'border-accent',
  secondary: 'border-text',
  destructive: 'border-danger',
} as const

export type ButtonVariant = keyof typeof outlines

/** The Button look, shared with links drawn as a button (Scan book). */
export function buttonClass(variant: ButtonVariant): string {
  return `border-2 ${outlines[variant]} bg-transparent px-4 py-2 text-button text-text ui-case max-wide:min-h-tap disabled:border-text-dim disabled:text-text-dim`
}

export type ButtonProps = Omit<ComponentProps<'button'>, 'className'> & {
  variant: ButtonVariant
}

/** DESIGN.md, Button: transparent, outlined, square, lowercase. One primary per layer. */
export function Button({ variant, type = 'button', ...props }: ButtonProps) {
  return <button {...props} type={type} className={buttonClass(variant)} />
}
