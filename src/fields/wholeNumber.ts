import type { NumberFieldValidation } from 'payload'
import { number } from 'payload/shared'

/** Payload's number check (`min`/`max`), then whole numbers only: `admin.step` binds the form alone. */
export const wholeNumber: NumberFieldValidation = (value, options) => {
  const builtIn = number(value, options)
  if (builtIn !== true) return builtIn
  if (value === undefined || value === null || Number.isInteger(value)) return true
  return options.req.t('validation:invalidInput')
}
