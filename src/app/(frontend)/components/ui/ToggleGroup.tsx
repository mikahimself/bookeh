'use client'

import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group'
import type { ReactNode } from 'react'

/**
 * DESIGN.md, Segmented control and Icon switch: a single choice among
 * buttons, each exposed with `aria-pressed`, in one `role="group"` named by
 * `aria-label`. Exactly one is pressed: tapping the pressed one does nothing
 * (Base UI reports `[]` then, which is dropped). The group is one Tab stop;
 * the arrow keys move between items, looping, and Space or Enter presses
 * the focused one (EXPERIENCE.md, Segmented control). Unstyled: the pressed
 * item carries `data-pressed`.
 */
export function ToggleGroup<V extends string>({
  value,
  onChange,
  'aria-label': label,
  className,
  children,
}: {
  value: V
  onChange: (value: V) => void
  'aria-label': string
  className?: string
  children: ReactNode
}) {
  return (
    <BaseToggleGroup<V>
      value={[value]}
      onValueChange={(next) => {
        const [chosen] = next
        if (chosen !== undefined && chosen !== value) onChange(chosen)
      }}
      aria-label={label}
      className={className}
    >
      {children}
    </BaseToggleGroup>
  )
}

/** One item of a `ToggleGroup`: a button, pressed while `value` is the group's. */
export function ToggleGroupItem<V extends string>({
  value,
  className,
  'aria-label': label,
  children,
}: {
  value: V
  className?: string
  /** Names an item whose content is not text (an Icon switch's icon). */
  'aria-label'?: string
  children: ReactNode
}) {
  return (
    <Toggle value={value} aria-label={label} className={className}>
      {children}
    </Toggle>
  )
}
