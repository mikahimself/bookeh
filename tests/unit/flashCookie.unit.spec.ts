import { ResponseCookies } from 'next/dist/server/web/spec-extension/cookies'
import { cookies } from 'next/headers'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { flashToast } from '@/app/(frontend)/components/toast/flash'
import { decodeFlash, FLASH_COOKIE, takeFlash } from '@/app/(frontend)/components/toast/flashCookie'
import type { ToastInput } from '@/app/(frontend)/components/toast/store'

vi.mock('next/headers', () => ({ cookies: vi.fn() }))

/** What Next writes to `document.cookie`: percent-encoded JSON. */
const wire = (value: unknown) => encodeURIComponent(JSON.stringify(value))

/** A fake `document.cookie`: reads a fixed jar, records every write. */
const jarOf = (cookie: string) => {
  const writes: string[] = []
  return { jar: { read: () => cookie, write: (c: string) => void writes.push(c) }, writes }
}

const clearing = `${FLASH_COOKIE}=; max-age=0; path=/`

describe('flashToast', () => {
  afterEach(() => {
    vi.mocked(cookies).mockReset()
  })

  /** Runs `flashToast` against the serialiser behind `cookies().set()`. */
  async function flash(input: ToastInput) {
    const headers = new Headers()
    vi.mocked(cookies).mockResolvedValue(new ResponseCookies(headers) as never)
    await flashToast(input)
    const header = headers.get('set-cookie') ?? ''
    const [pair, ...attributes] = header.split(';').map((part) => part.trim())
    return { pair, attributes }
  }

  it.each<[string, ToastInput]>([
    ['a success', { kind: 'success', message: 'Saved to Tampere; "ä" 100%' }],
    ['a held success', { kind: 'success', message: 'Saved', hold: true }],
    ['an error', { kind: 'error', code: 'INTERNAL' }],
  ])(
    'round-trips %s through the wire: Next encodes once, the client decodes once',
    async (_, input) => {
      const { pair } = await flash(input)
      expect(pair.startsWith(`${FLASH_COOKIE}=`)).toBe(true)
      // The browser hands the pair back verbatim in `document.cookie`.
      expect(takeFlash(jarOf(pair).jar)).toEqual(input)
    },
  )

  it('sets the spine attributes, readable by the client', async () => {
    const { attributes } = await flash({ kind: 'success', message: 'Saved' })
    // Next adds a matching Expires next to Max-Age; the spine names these three.
    expect(attributes).toEqual(expect.arrayContaining(['Path=/', 'Max-Age=60', 'SameSite=lax']))
    // Not HttpOnly: the client must read and clear it. Production-gated
    // Secure (Story 2.2): http://localhost dev keeps working.
    expect(attributes).not.toContain('HttpOnly')
    expect(attributes).not.toContain('Secure')
  })
})

describe('decodeFlash', () => {
  it.each([
    ['no cookie', undefined],
    ['junk', 'not%20json'],
    ['bad percent-encoding', '%E0%A4%A'],
    ['a JSON scalar', wire('hi')],
    ['null', wire(null)],
    ['a wrong shape', wire({ kind: 'success' })],
    ['a non-string message', wire({ kind: 'success', message: 1 })],
    ['an unknown kind', wire({ kind: 'info', message: 'x' })],
    ['an unknown code', wire({ kind: 'error', code: 'NO_SUCH' })],
    ['a missing code', wire({ kind: 'error' })],
  ])('decodes %s to null without throwing', (_, raw) => {
    expect(decodeFlash(raw)).toBeNull()
  })

  it('drops a forged non-boolean hold', () => {
    expect(decodeFlash(wire({ kind: 'success', message: 'x', hold: 'yes' }))).toEqual({
      kind: 'success',
      message: 'x',
    })
  })
})

describe('takeFlash', () => {
  const input: ToastInput = { kind: 'success', message: 'Saved' }

  it('shows a flash once: the decoded input comes back and the cookie is cleared', () => {
    const { jar, writes } = jarOf(`other=1; ${FLASH_COOKIE}=${wire(input)}; more=2`)
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
