import type { ComponentProps } from 'react'

export type CloseButtonProps = Omit<
  ComponentProps<'button'>,
  'className' | 'children' | 'aria-label'
> & {
  /** The accessible name — the X draws no text. */
  label: string
}

/**
 * DESIGN.md, Close (X): two 2px `text` strokes forming an X, no circle and
 * no box around it. The strokes live in the viewBox, so the drawn size is
 * the `size-4` box and no CSS size literal is needed.
 */
export function CloseButton({ label, type = 'button', ...props }: CloseButtonProps) {
  return (
    <button
      {...props}
      type={type}
      aria-label={label}
      className="flex items-center justify-center bg-transparent px-2 text-text max-wide:min-h-tap"
    >
      <svg viewBox="0 0 16 16" aria-hidden="true" className="size-4 shrink-0">
        <path d="M2 2 L14 14 M14 2 L2 14" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>
  )
}
