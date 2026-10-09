import { useId, type ComponentProps } from 'react'

export type TextFieldProps = Omit<
  ComponentProps<'input'>,
  'id' | 'className' | 'aria-invalid' | 'aria-describedby'
> & {
  label: string
  /** A message for this field; draws the danger underline. */
  error?: string
}

/**
 * DESIGN.md, Text field: label above, value on an underline, no box. An empty
 * field's underline is dim; the `" "` placeholder lets CSS tell it is empty.
 */
export function TextField({ label, error, placeholder = ' ', ...props }: TextFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const underline = error ? 'border-danger' : 'border-text placeholder-shown:border-text-dim'

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-text-muted">
        {label}
      </label>
      <input
        {...props}
        id={id}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={`w-full border-b-2 ${underline} bg-transparent py-1 text-control text-text max-wide:min-h-tap`}
      />
      {error && (
        <p id={errorId} className="text-meta">
          {error}
        </p>
      )}
    </div>
  )
}
