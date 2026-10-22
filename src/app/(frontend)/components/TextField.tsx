import { useId, type ComponentProps, type ReactNode } from 'react'

export type TextFieldProps = Omit<
  ComponentProps<'input'>,
  'id' | 'className' | 'aria-invalid' | 'aria-describedby'
> & {
  label: string
  /** A message for this field, a Link included where one helps; draws the danger underline. */
  error?: ReactNode
}

/**
 * The Text field's input: the value on an underline, `danger` with an error,
 * dim while empty (needs the `" "` placeholder). Shared with the Combobox.
 */
export function fieldClass(error: boolean): string {
  const underline = error ? 'border-danger' : 'border-text placeholder-shown:border-text-dim'
  return `w-full border-b-2 ${underline} bg-transparent py-1 text-control text-text max-wide:min-h-tap disabled:border-text-dim disabled:text-text-dim`
}

/** The label above a field and its message below, shared by the input and the multi-line field. */
function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: ReactNode
  children: (props: {
    id: string
    'aria-invalid'?: true
    'aria-describedby'?: string
    className: string
  }) => ReactNode
}) {
  const id = useId()
  const errorId = `${id}-error`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-label text-text-muted">
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error ? errorId : undefined,
        className: fieldClass(Boolean(error)),
      })}
      {error && (
        <p id={errorId} className="text-meta">
          {error}
        </p>
      )}
    </div>
  )
}

/**
 * DESIGN.md, Text field: label above, value on an underline, no box. An empty
 * field's underline is dim; the `" "` placeholder lets CSS tell it is empty.
 */
export function TextField({ label, error, placeholder = ' ', ...props }: TextFieldProps) {
  return (
    <Field label={label} error={error}>
      {(field) => <input {...props} {...field} placeholder={placeholder} />}
    </Field>
  )
}

export type TextAreaFieldProps = Omit<
  ComponentProps<'textarea'>,
  'id' | 'className' | 'aria-invalid' | 'aria-describedby'
> & {
  label: string
  /** A message for this field; draws the danger underline. */
  error?: string
}

/** The Text field for several lines (a description): the same label, underline and message. */
export function TextAreaField({
  label,
  error,
  placeholder = ' ',
  rows = 4,
  ...props
}: TextAreaFieldProps) {
  return (
    <Field label={label} error={error}>
      {({ className, ...field }) => (
        <textarea
          {...props}
          {...field}
          rows={rows}
          placeholder={placeholder}
          className={`${className} resize-y`}
        />
      )}
    </Field>
  )
}
