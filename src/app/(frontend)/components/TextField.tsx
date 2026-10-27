import { useTranslations } from 'next-intl'
import { useId, type ComponentProps, type ReactNode } from 'react'

export type TextFieldProps = Omit<
  ComponentProps<'input'>,
  'id' | 'className' | 'aria-invalid' | 'aria-describedby'
> & {
  label: string
  /** A message for this field, a Link included where one helps; draws the danger underline. */
  error?: ReactNode
  /** A control beside the input, level with its underline whatever the message below (Scan's "find"). */
  action?: ReactNode
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
export function TextField({ label, error, action, placeholder = ' ', ...props }: TextFieldProps) {
  const clearable = props.type === undefined || CLEARABLE.has(props.type)
  return (
    <Field label={label} error={error}>
      {({ className, ...field }) => {
        const input = clearable ? (
          <div className="relative min-w-0 flex-1">
            <input
              {...props}
              {...field}
              placeholder={placeholder}
              className={`${className} ${clearPeerClass}`}
            />
            <ClearButton label={label} />
          </div>
        ) : (
          <input {...props} {...field} placeholder={placeholder} className={className} />
        )
        return action ? (
          <div className="flex items-end gap-2">
            {input}
            {action}
          </div>
        ) : (
          input
        )
      }}
    </Field>
  )
}

/** Single-line text types that get the clear X; never password, date or number. */
const CLEARABLE = new Set(['text', 'search', 'email', 'tel', 'url'])

/** For the input before a `ClearButton`: the X reads its state, and the value stops short of it. */
export const clearPeerClass = 'peer pr-11'

/**
 * DESIGN.md, Text field: the clear X at the right end of a single-line field,
 * two `text` strokes like the Close (X) but drawn at `size-3`, in a tap-high
 * box. It must follow its input (marked `clearPeerClass`) as a sibling: CSS
 * hides it while the field is empty (the `" "` placeholder) or disabled.
 * Clearing goes through the native value setter and a bubbling `input` event,
 * so a controlled field's `onChange` sees `""` too; focus stays in the field.
 */
export function ClearButton({ label }: { label: string }) {
  const t = useTranslations('field')
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-label={t('clear', { label })}
      // Keep focus in the field rather than moving it to the X.
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        const input = event.currentTarget.previousElementSibling
        if (!(input instanceof HTMLInputElement)) return
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, '')
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.focus()
      }}
      className="absolute inset-y-0 right-0 flex w-tap items-center justify-center bg-transparent text-text max-wide:min-h-tap peer-placeholder-shown:hidden peer-disabled:hidden"
    >
      <svg viewBox="0 0 12 12" aria-hidden="true" className="size-3 shrink-0">
        <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" strokeWidth="2" />
      </svg>
    </button>
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
