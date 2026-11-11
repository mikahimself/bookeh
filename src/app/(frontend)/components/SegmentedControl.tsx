'use client'

import { ToggleGroup, ToggleGroupItem } from './ui/ToggleGroup'

export type SegmentedOption<V extends string> = { value: V; label: string }

/**
 * DESIGN.md, Segmented control: equal parts in a `stroke-button` `text`
 * outline with `stroke-button` dividers, each 48px tall, labels in `control`
 * type, lowercase; the chosen part filled `accent-fill` under `on-fill`
 * text. Switches at once, no confirm; tapping the chosen part does nothing.
 * One Tab stop, the arrow keys move between parts (`ToggleGroup`). Each part
 * is a button with `aria-pressed`, so the choice is announced, not conveyed
 * by the fill alone. One equal part per option; used for reading status,
 * three parts.
 */
export function SegmentedControl<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: V
  options: readonly SegmentedOption<V>[]
  onChange: (value: V) => void
}) {
  return (
    <ToggleGroup
      aria-label={label}
      value={value}
      onChange={onChange}
      className="grid auto-cols-fr grid-flow-col border-(length:--spacing-stroke-button) border-text"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="min-h-segmented-height border-text text-control text-text ui-case not-first:border-l-(length:--spacing-stroke-button) focus-visible:relative focus-visible:z-1 data-pressed:bg-accent-fill data-pressed:text-on-fill"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
