import type { ComponentProps } from 'react'

export type CheckboxProps = Omit<ComponentProps<'input'>, 'className' | 'type'>

/**
 * DESIGN.md, Checkbox: a native checkbox drawn as a 20px square with a 2px
 * `text` outline; checked draws a tick in `text` and is not filled. Its
 * caller labels it, usually with a `<label>` around it.
 */
export function Checkbox(props: CheckboxProps) {
  return (
    <span className="relative inline-flex size-5 shrink-0">
      <input
        {...props}
        type="checkbox"
        className="peer m-0 size-5 shrink-0 appearance-none border-2 border-text bg-transparent"
      />
      <svg
        aria-hidden
        viewBox="0 0 20 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className="pointer-events-none absolute inset-0 hidden size-5 text-text peer-checked:block"
      >
        <path d="M5.5 10.5 8.5 13.5 14.5 6.5" />
      </svg>
    </span>
  )
}
