import type { ComponentProps } from 'react'

const outlines = {
  primary: 'border-accent',
  secondary: 'border-text',
  destructive: 'border-danger',
} as const

export type ButtonProps = Omit<ComponentProps<'button'>, 'className'> & {
  variant: keyof typeof outlines
}

/** DESIGN.md, Button: transparent, outlined, square, lowercase. One primary per layer. */
export function Button({ variant, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`border-2 ${outlines[variant]} bg-transparent px-4 py-2 text-button text-text ui-case max-wide:min-h-tap disabled:border-text-dim disabled:text-text-dim`}
    />
  )
}
