import type { ErrorCode } from '@/lib/errors'

import type { ToastInput } from './store'

/**
 * Spine, Toasts: the flash cookie. `flashToast()` sets it; the provider reads
 * it. The server sets plain JSON, Next percent-encodes it on the wire, the
 * browser hands it back verbatim and the client decodes it once. Never read
 * it on the server with `cookies().get()`: that decodes once too, so
 * `decodeFlash` on its value would double-decode. Only the client reads it,
 * from `document.cookie`. (The prefs cookie is read server-side and differs
 * on purpose.)
 */
export const FLASH_COOKIE = 'bookeh_flash'

// Exhaustive: adding an ErrorCode fails typecheck until it is listed here.
const codes = Object.keys({
  UNAUTHENTICATED: true,
  WRONG_CREDENTIALS: true,
  NOT_FOUND: true,
  VALIDATION: true,
  INVALID_ISBN: true,
  INTERNAL: true,
  UNDO_FAILED: true,
  RATE_LIMITED: true,
  NO_CONNECTION: true,
  APP_UPDATED: true,
} satisfies Record<ErrorCode, true>)

const isErrorCode = (value: unknown): value is ErrorCode =>
  typeof value === 'string' && codes.includes(value)

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

/** A well-formed `undo` (string token, finite seconds) or nothing: a forged one is dropped, like a forged `hold`. */
function decodeUndo(value: unknown): { token: string; seconds: number } | null {
  if (typeof value !== 'object' || value === null) return null
  const { token, seconds } = value as Record<string, unknown>
  return typeof token === 'string' && typeof seconds === 'number' && Number.isFinite(seconds)
    ? { token, seconds }
    : null
}

/**
 * Decodes a raw `document.cookie` value (percent-encoded JSON, as Next wrote
 * it) back into a `ToastInput`. The cookie is not HttpOnly, so anything
 * malformed — junk, the wrong shape, an unknown error code — is answered with
 * `null`, never a throw.
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
    const input: ToastInput = { kind: 'success', message: value.message }
    if (value.hold === true) input.hold = true
    const undo = decodeUndo(value.undo)
    if (undo) input.undo = undo
    return input
  }
  if (value.kind === 'error' && isErrorCode(value.code)) {
    return { kind: 'error', code: value.code }
  }
  return null
}
