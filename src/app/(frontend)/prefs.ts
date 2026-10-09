import { cookies } from 'next/headers'

/**
 * Spine, Device preferences: what this device remembers, in one cookie.
 * Never on the profile; interface language is not one of them (AD-15).
 */
export const PREFS_COOKIE = 'bookeh_prefs'

export const LAYOUTS = ['rows', 'covers'] as const
export const SIZES = ['s', 'm', 'l'] as const
export const THEMES = ['light', 'dark', 'system'] as const
export const LOANS_ORDERS = ['person', 'date'] as const

export type DevicePrefs = {
  layout: (typeof LAYOUTS)[number]
  size: (typeof SIZES)[number]
  theme: (typeof THEMES)[number]
  loans: (typeof LOANS_ORDERS)[number]
}

const OPTIONS: { [K in keyof DevicePrefs]: readonly DevicePrefs[K][] } = {
  layout: LAYOUTS,
  size: SIZES,
  theme: THEMES,
  loans: LOANS_ORDERS,
}

const FIELDS = Object.keys(OPTIONS) as (keyof DevicePrefs)[]

export const DEFAULT_PREFS: Readonly<DevicePrefs> = Object.freeze({
  layout: 'rows',
  size: 'm',
  theme: 'system',
  loans: 'person',
})

/** 400 days, the cap browsers put on a cookie's lifetime. Only the server reads it. */
export const PREFS_COOKIE_OPTIONS = {
  path: '/',
  maxAge: 400 * 24 * 60 * 60,
  sameSite: 'lax',
  httpOnly: true,
} as const

const isOption = <K extends keyof DevicePrefs>(field: K, value: unknown): value is DevicePrefs[K] =>
  (OPTIONS[field] as readonly unknown[]).includes(value)

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value))

function pick<K extends keyof DevicePrefs>(
  stored: Record<string, unknown>,
  field: K,
): DevicePrefs[K] {
  const value = stored[field]
  return isOption(field, value) ? value : DEFAULT_PREFS[field]
}

/**
 * Reads a cookie value. Each field falls back to its default on its own, so a
 * value written by a later version does not reset the others. Never throws.
 */
export function parseDevicePrefs(raw: string | undefined): DevicePrefs {
  let stored: unknown
  try {
    stored = raw === undefined ? undefined : JSON.parse(decodeURIComponent(raw))
  } catch {
    stored = undefined
  }
  if (!isPlainObject(stored)) return { ...DEFAULT_PREFS }
  return {
    layout: pick(stored, 'layout'),
    size: pick(stored, 'size'),
    theme: pick(stored, 'theme'),
    loans: pick(stored, 'loans'),
  }
}

/**
 * Validates a patch from the client: a plain object with only known fields,
 * each holding one of its options. Anything else is `null`, never repaired.
 */
export function parsePrefsPatch(value: unknown): Partial<DevicePrefs> | null {
  if (!isPlainObject(value)) return null
  const patch: Partial<Record<keyof DevicePrefs, unknown>> = {}
  for (const [key, option] of Object.entries(value)) {
    const field = FIELDS.find((f) => f === key)
    if (field === undefined || !isOption(field, option)) return null
    patch[field] = option
  }
  return patch as Partial<DevicePrefs>
}

/** The cookie value: all four fields, URL-encoded JSON. */
export function serializeDevicePrefs(prefs: DevicePrefs): string {
  const { layout, size, theme, loans } = prefs
  return encodeURIComponent(JSON.stringify({ layout, size, theme, loans }))
}

/** The preferences of the requesting device. The only reader of the cookie. */
export async function devicePrefs(): Promise<DevicePrefs> {
  return parseDevicePrefs((await cookies()).get(PREFS_COOKIE)?.value)
}
