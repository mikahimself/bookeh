'use client'

export type TextSwitchOption<V extends string> = { value: V; label: string }

export type TextSwitchProps<V extends string> = (
  | { label: string; labelledBy?: never }
  | {
      /** Ids of visible text naming the group (`aria-labelledby`), in reading order. */
      labelledBy: string
      label?: never
    }
) & {
  value: V
  options: readonly TextSwitchOption<V>[]
  onChange: (value: V) => void
  /** Keeps the options' own case (language names); lowercased otherwise. */
  properNames?: boolean
  /** Every option disabled; the chosen one stays in text. */
  disabled?: boolean
  /** The id of a message about the group, such as its error (`aria-describedby`). */
  describedBy?: string
}

/**
 * DESIGN.md, Text switch: the options as plain words, the chosen one in
 * text, the others dim; no outline, underline or fill. Switches at once, no
 * confirm. Buttons with `aria-pressed`, not radios: operable with Tab alone,
 * and the state is announced, not conveyed by colour only. Tapping the chosen
 * option does nothing.
 */
export function TextSwitch<V extends string>({
  label,
  labelledBy,
  value,
  options,
  onChange,
  properNames = false,
  disabled = false,
  describedBy,
}: TextSwitchProps<V>) {
  return (
    <div
      role="group"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className="flex flex-wrap gap-4"
    >
      {options.map((option) => {
        const chosen = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={chosen}
            disabled={disabled}
            onClick={() => {
              if (!chosen) onChange(option.value)
            }}
            className={`text-control ${chosen ? 'text-text' : 'text-text-dim'}${
              properNames ? '' : ' ui-case'
            } max-wide:min-h-tap`}
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
