'use client'

export type TextSwitchOption<V extends string> = { value: V; label: string }

export type TextSwitchProps<V extends string> = {
  label: string
  value: V
  options: readonly TextSwitchOption<V>[]
  onChange: (value: V) => void
  /** Keeps the options' own case (language names); lowercased otherwise. */
  properNames?: boolean
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
  value,
  options,
  onChange,
  properNames = false,
}: TextSwitchProps<V>) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-4">
      {options.map((option) => {
        const chosen = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={chosen}
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
