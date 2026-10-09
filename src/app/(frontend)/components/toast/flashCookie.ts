import type { ErrorCode } from '@/lib/errors'

import type { ToastInput } from './store'

/** Spine, Toasts: the flash cookie. `flashToast()` sets it; the provider reads it. */
export const FLASH_COOKIE = 'bookeh_flash'

// Exhaustive: adding an ErrorCode fails typecheck until it is listed here.
const codes = Object.keys({
  UNAUTHENTICATED: true,
  WRONG_CREDENTIALS: true,
  NOT_FOUND: true,
  VALIDATION: true,
  INTERNAL: true,
} satisfies Record<ErrorCode, true>)

const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && codes.includes(value)

export function encodeFlash(input: ToastInput): string {
  return encodeURIComponent(JSON.stringify(input))
}

/**
 * Takes the flash toast out of a cookie jar: when the cookie is present it is
 * always cleared — also when malformed — and the decoded input (or `null`)
 * comes back, so a flash shows at most once. The provider passes
 * `document.cookie` through `jar`.
 */
export function takeFlash(jar: {
  read: () => string
  write: (cookie: string) => void
}): ToastInput | null {
  const raw = jar
    .read()
    .split('; ')
    .find((part) => part.startsWith(`${FLASH_COOKIE}=`))
    ?.slice(FLASH_COOKIE.length + 1)
  if (raw === undefined) return null
  jar.write(`${FLASH_COOKIE}=; max-age=0; path=/`)
  return decodeFlash(raw)
}

/**
 * Decodes a flash cookie value back into a `ToastInput`. The cookie is not
 * HttpOnly, so anything malformed — junk, the wrong shape, an unknown error
 * code — is answered with `null`, never a throw.
 */
export function decodeFlash(raw: string | undefined): ToastInput | null {
  if (raw === undefined) return null
  let parsed: unknown
  try {
    parsed = JSON.parse(decodeURIComponent(raw))
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null
  const value = parsed as Record<string, unknown>
  if (value.kind === 'success' && typeof value.message === 'string') {
    return value.hold === true
      ? { kind: 'success', message: value.message, hold: true }
      : { kind: 'success', message: value.message }
  }
  if (value.kind === 'error' && isErrorCode(value.code)) {
    return { kind: 'error', code: value.code }
  }
  return null
}
