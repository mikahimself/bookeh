import { RequestCookies, ResponseCookies } from 'next/dist/server/web/spec-extension/cookies'
import { cookies } from 'next/headers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_PREFS,
  devicePrefs,
  parseDevicePrefs,
  parsePrefsPatch,
  PREFS_COOKIE,
  PREFS_COOKIE_OPTIONS,
  serializeDevicePrefs,
  type DevicePrefs,
} from '@/app/(frontend)/prefs'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

const encode = (value: unknown) => encodeURIComponent(JSON.stringify(value))

const defaults: DevicePrefs = { layout: 'rows', size: 'm', theme: 'system', loans: 'person' }

describe('parseDevicePrefs', () => {
  it('has the spine defaults', () => {
    expect(DEFAULT_PREFS).toEqual(defaults)
  })

  it('answers the defaults with no cookie', () => {
    expect(parseDevicePrefs(undefined)).toEqual(defaults)
  })

  it('reads a full valid cookie as is', () => {
    const stored: DevicePrefs = { layout: 'covers', size: 'l', theme: 'dark', loans: 'date' }
    expect(parseDevicePrefs(encode(stored))).toEqual(stored)
  })

  it('fills the missing fields of a partial cookie with defaults', () => {
    expect(parseDevicePrefs(encode({ theme: 'dark' }))).toEqual({ ...defaults, theme: 'dark' })
  })

  it('falls back for one unknown value only, keeping the others', () => {
    expect(
      parseDevicePrefs(encode({ layout: 'covers', size: 'xl', theme: 'dark', loans: 'date' })),
    ).toEqual({ layout: 'covers', size: 'm', theme: 'dark', loans: 'date' })
  })

  it('ignores unknown extra keys', () => {
    expect(parseDevicePrefs(encode({ theme: 'light', font: 'serif' }))).toEqual({
      ...defaults,
      theme: 'light',
    })
  })

  it.each([
    ['junk', 'not json'],
    ['bad percent-encoding', '%E0%A4%A'],
    ['an empty string', ''],
    ['a JSON scalar', encode(42)],
    ['a JSON string', encode('dark')],
    ['null', encode(null)],
    ['an array', encode(['covers', 'l', 'dark', 'date'])],
    ['wrong value types', encode({ layout: 1, size: true, theme: null, loans: ['date'] })],
  ])('answers all defaults for %s, without throwing', (_, raw) => {
    expect(parseDevicePrefs(raw)).toEqual(defaults)
  })

  it('returns a fresh object, never the shared defaults', () => {
    const prefs = parseDevicePrefs(undefined)
    expect(prefs).not.toBe(DEFAULT_PREFS)
    expect(Object.isFrozen(prefs)).toBe(false)
  })
})

describe('serializeDevicePrefs', () => {
  it('round-trips through parseDevicePrefs', () => {
    const prefs: DevicePrefs = { layout: 'covers', size: 's', theme: 'light', loans: 'date' }
    expect(parseDevicePrefs(serializeDevicePrefs(prefs))).toEqual(prefs)
  })

  it('survives the wire: Next encodes on set and decodes on read', () => {
    const prefs: DevicePrefs = { layout: 'covers', size: 'l', theme: 'dark', loans: 'date' }
    const responseHeaders = new Headers()
    new ResponseCookies(responseHeaders).set(
      PREFS_COOKIE,
      serializeDevicePrefs(prefs),
      PREFS_COOKIE_OPTIONS,
    )
    const pair = responseHeaders.get('set-cookie')?.split(';')[0] ?? ''
    expect(pair.startsWith(`${PREFS_COOKIE}=`)).toBe(true)

    const request = new RequestCookies(new Headers({ cookie: pair }))
    expect(parseDevicePrefs(request.get(PREFS_COOKIE)?.value)).toEqual(prefs)
  })

  it('writes all four fields, URL-encoded, and nothing else', () => {
    const extra = { ...defaults, font: 'serif' } as DevicePrefs
    const value = serializeDevicePrefs(extra)
    expect(value).not.toMatch(/[;",\s]/)
    expect(JSON.parse(decodeURIComponent(value))).toEqual(defaults)
  })
})

describe('parsePrefsPatch', () => {
  it.each<[string, unknown]>([
    ['an empty patch', {}],
    ['one field', { theme: 'dark' }],
    ['all four fields', { layout: 'covers', size: 'l', theme: 'light', loans: 'date' }],
  ])('accepts %s', (_, patch) => {
    expect(parsePrefsPatch(patch)).toEqual(patch)
  })

  it.each<[string, unknown]>([
    ['undefined', undefined],
    ['null', null],
    ['a string', 'dark'],
    ['a number', 1],
    ['an array', [['theme', 'dark']]],
    ['a Map', new Map([['theme', 'dark']])],
    ['an unknown key', { font: 'x' }],
    ['an unknown key next to a valid one', { theme: 'dark', font: 'x' }],
    ['an unknown value', { theme: 'blue' }],
    ['a value of the wrong type', { theme: 1 }],
    ['undefined as a value', { theme: undefined }],
    ['a prototype key', JSON.parse('{"__proto__": {"theme": "dark"}}')],
  ])('rejects %s', (_, patch) => {
    expect(parsePrefsPatch(patch)).toBeNull()
  })
})

describe('devicePrefs', () => {
  const store = (value: string | undefined) => {
    const get = vi.fn((name: string) =>
      name === PREFS_COOKIE && value !== undefined ? { name, value } : undefined,
    )
    vi.mocked(cookies).mockResolvedValue({ get } as never)
    return get
  }

  afterEach(() => {
    vi.mocked(cookies).mockReset()
  })

  it('reads the bookeh_prefs cookie of the request', async () => {
    const get = store(encode({ layout: 'covers', theme: 'dark' }))
    expect(await devicePrefs()).toEqual({ ...defaults, layout: 'covers', theme: 'dark' })
    expect(get).toHaveBeenCalledWith('bookeh_prefs')
  })

  it('answers the defaults without the cookie', async () => {
    store(undefined)
    expect(await devicePrefs()).toEqual(defaults)
  })
})
