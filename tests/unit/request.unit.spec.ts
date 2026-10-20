// @vitest-environment jsdom
import { UnrecognizedActionError } from 'next/dist/client/components/unrecognized-action-error'
import { redirect } from 'next/navigation'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Not under test, and its module pulls in the undo action.
vi.mock('@/app/(frontend)/components/toast/ToastProvider', () => ({ useToast: vi.fn() }))

const { fetchData, reportFailure, settleAction } =
  await import('@/app/(frontend)/components/request')

describe('settleAction', () => {
  it.each([
    ['an ok result', { ok: true, data: 1 }],
    [
      'a domain failure, fields kept',
      { ok: false, code: 'VALIDATION', fields: { a: 'VALIDATION' } },
    ],
  ] as const)('resolves to %s as is', async (_, result) => {
    expect(await settleAction(Promise.resolve(result))).toEqual(result)
  })

  it.each([
    ['a dropped connection', new TypeError('Failed to fetch'), 'NO_CONNECTION'],
    ['an action from an older build', new UnrecognizedActionError('gone'), 'APP_UPDATED'],
    ['anything else', new Error('An unexpected response was received'), 'INTERNAL'],
  ])('maps %s to its code', async (_, err, code) => {
    expect(await settleAction(Promise.reject(err))).toEqual({ ok: false, code })
  })

  it('lets Next.js control flow through', async () => {
    let thrown: unknown
    try {
      redirect('/login')
    } catch (err) {
      thrown = err
    }
    await expect(settleAction(Promise.reject(thrown))).rejects.toBe(thrown)
  })
})

describe('fetchData', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const stub = (impl: () => Promise<Response>) => vi.stubGlobal('fetch', vi.fn(impl))

  it('returns a JSON body as the result, also on 401', async () => {
    const body = { ok: false, code: 'UNAUTHENTICATED' }
    stub(async () => Response.json(body, { status: 401 }))
    expect(await fetchData('/data/x')).toEqual(body)
  })

  it.each([
    [502, 'INTERNAL'],
    [401, 'UNAUTHENTICATED'],
  ])('maps a body that is not JSON on %i to %s', async (status, code) => {
    stub(async () => new Response('<html>Bad gateway</html>', { status }))
    expect(await fetchData('/data/x')).toEqual({ ok: false, code })
  })

  it('maps a rejected fetch to NO_CONNECTION', async () => {
    stub(() => Promise.reject(new TypeError('Failed to fetch')))
    expect(await fetchData('/data/x')).toEqual({ ok: false, code: 'NO_CONNECTION' })
  })
})

describe('reportFailure', () => {
  const targets = () => ({ show: vi.fn(), dismiss: vi.fn(), replace: vi.fn() })

  it('sends a signed-out session to sign in, back to the address it is on now', () => {
    history.replaceState(null, '', '/scan?isbn=9789510000000')
    const t = targets()
    reportFailure('UNAUTHENTICATED', t)
    expect(t.dismiss).toHaveBeenCalled()
    expect(t.replace).toHaveBeenCalledWith('/login?next=%2Fscan%3Fisbn%3D9789510000000')
    expect(t.show).not.toHaveBeenCalled()
  })

  it('toasts any other failure and stays', () => {
    const t = targets()
    reportFailure('NO_CONNECTION', t)
    expect(t.show).toHaveBeenCalledWith({ kind: 'error', code: 'NO_CONNECTION' })
    expect(t.replace).not.toHaveBeenCalled()
    expect(t.dismiss).not.toHaveBeenCalled()
  })
})
