import { cookies } from 'next/headers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { flashToast } from '@/app/(frontend)/components/toast/flash'
import {
  decodeFlash,
  encodeFlash,
  FLASH_COOKIE,
  takeFlash,
} from '@/app/(frontend)/components/toast/flashCookie'
import type { ToastInput } from '@/app/(frontend)/components/toast/store'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

describe('flash codec', () => {
  it.each<[string, ToastInput]>([
    ['a success', { kind: 'success', message: 'Saved to Tampere' }],
    ['a held success', { kind: 'success', message: 'Saved', hold: true }],
    ['an error', { kind: 'error', code: 'INTERNAL' }],
  ])('round-trips %s', (_, input) => {
    expect(decodeFlash(encodeFlash(input))).toEqual(input)
  })

  it('URL-encodes, so the value is cookie-safe', () => {
    const encoded = encodeFlash({ kind: 'success', message: 'ä; ö="x"' })
    expect(encoded).not.toMatch(/[;",\s]/)
    expect(decodeFlash(encoded)).toEqual({ kind: 'success', message: 'ä; ö="x"' })
  })

  it.each([
    ['no cookie', undefined],
    ['junk', 'not%20json'],
    ['bad percent-encoding', '%E0%A4%A'],
    ['a JSON scalar', encodeURIComponent('"hi"')],
    ['null', encodeURIComponent('null')],
    ['a wrong shape', encodeURIComponent(JSON.stringify({ kind: 'success' }))],
    ['a non-string message', encodeURIComponent(JSON.stringify({ kind: 'success', message: 1 }))],
    ['an unknown kind', encodeURIComponent(JSON.stringify({ kind: 'info', message: 'x' }))],
    ['an unknown code', encodeURIComponent(JSON.stringify({ kind: 'error', code: 'NO_SUCH' }))],
    ['a missing code', encodeURIComponent(JSON.stringify({ kind: 'error' }))],
  ])('decodes %s to null without throwing', (_, raw) => {
    expect(decodeFlash(raw)).toBeNull()
  })

  it('drops a forged non-boolean hold', () => {
    const raw = encodeURIComponent(JSON.stringify({ kind: 'success', message: 'x', hold: 'yes' }))
    expect(decodeFlash(raw)).toEqual({ kind: 'success', message: 'x' })
  })
})

describe('takeFlash', () => {
  const input: ToastInput = { kind: 'success', message: 'Saved' }
  const clearing = `${FLASH_COOKIE}=; max-age=0; path=/`

  /** A fake `document.cookie`: reads a fixed jar, records every write. */
  const jarOf = (cookie: string) => {
    const writes: string[] = []
    return { jar: { read: () => cookie, write: (c: string) => void writes.push(c) }, writes }
  }

  it('shows a flash once: the decoded input comes back and the cookie is cleared', () => {
    const { jar, writes } = jarOf(`other=1; ${FLASH_COOKIE}=${encodeFlash(input)}; more=2`)
    expect(takeFlash(jar)).toEqual(input)
    expect(writes).toEqual([clearing])

    // The clearing write took effect: the next take finds nothing.
    const cleared = jarOf('other=1; more=2')
    expect(takeFlash(cleared.jar)).toBeNull()
    expect(cleared.writes).toEqual([])
  })

  it('clears a malformed flash and shows nothing', () => {
    const { jar, writes } = jarOf(`${FLASH_COOKIE}=not%20json`)
    expect(takeFlash(jar)).toBeNull()
    expect(writes).toEqual([clearing])
  })

  it('writes nothing without the cookie', () => {
    const { jar, writes } = jarOf('')
    expect(takeFlash(jar)).toBeNull()
    expect(writes).toEqual([])
  })
})

describe('flashToast', () => {
  const cookieStore = { set: vi.fn() }

  afterEach(() => {
    cookieStore.set.mockReset()
    vi.mocked(cookies).mockReset()
  })

  it('sets the flash cookie with the spine attributes, readable by the client', async () => {
    vi.mocked(cookies).mockImplementation(async () => cookieStore as never)
    const input: ToastInput = { kind: 'success', message: 'Saved' }

    await flashToast(input)

    expect(cookieStore.set).toHaveBeenCalledExactlyOnceWith(FLASH_COOKIE, encodeFlash(input), {
      path: '/',
      maxAge: 60,
      sameSite: 'lax',
      httpOnly: false,
      // Production-gated (Story 2.2): outside production the cookie must
      // stay non-Secure so http://localhost dev keeps working.
      secure: false,
    })
    expect(FLASH_COOKIE).toBe('bookeh_flash')
  })
})
