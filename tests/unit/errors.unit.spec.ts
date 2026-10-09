import { notFound, redirect } from 'next/navigation'
import { APIError, defaultLoggerOptions, Forbidden, NotFound, ValidationError } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { type ActionResult, DomainError, runAction, runRoute } from '@/lib/errors'

const { logError, pinoMock } = vi.hoisted(() => {
  const logError = vi.fn()
  return { logError, pinoMock: vi.fn(() => ({ error: logError })) }
})
vi.mock('pino', () => ({ pino: pinoMock }))

beforeEach(() => {
  logError.mockClear()
})

type Settled = { body: ActionResult<unknown>; status?: number }

const wrappers: [string, (fn: () => Promise<unknown>) => Promise<Settled>][] = [
  ['runAction', async (fn) => ({ body: await runAction(fn) })],
  [
    'runRoute',
    async (fn) => {
      const res = await runRoute(fn)
      expect(res.headers.get('cache-control')).toBe('no-store')
      expect(res.headers.get('content-type')).toMatch(/^application\/json/)
      return { body: (await res.json()) as ActionResult<unknown>, status: res.status }
    },
  ],
]

const fails = (err: unknown) => () => Promise.reject(err)

const validationError = new ValidationError({
  collection: 'users',
  errors: [
    { path: 'email', message: 'Email is taken' },
    { path: 'displayName', message: 'Required' },
  ],
})

type Row = [
  scenario: string,
  fn: () => Promise<unknown>,
  body: ActionResult<unknown>,
  status: number,
  logs: boolean,
]

const rows: Row[] = [
  ['success', () => Promise.resolve({ id: 1 }), { ok: true, data: { id: 1 } }, 200, false],
  [
    'a DomainError',
    fails(new DomainError('UNAUTHENTICATED')),
    { ok: false, code: 'UNAUTHENTICATED' },
    401,
    false,
  ],
  [
    'a DomainError with extras',
    fails(new DomainError('VALIDATION', { fields: { name: 'VALIDATION' }, conflictId: 7 })),
    { ok: false, code: 'VALIDATION', fields: { name: 'VALIDATION' }, conflictId: 7 },
    200,
    false,
  ],
  ['Payload Forbidden', fails(new Forbidden()), { ok: false, code: 'NOT_FOUND' }, 200, false],
  ['Payload NotFound', fails(new NotFound()), { ok: false, code: 'NOT_FOUND' }, 200, false],
  [
    'Payload ValidationError',
    fails(validationError),
    { ok: false, code: 'VALIDATION', fields: { email: 'VALIDATION', displayName: 'VALIDATION' } },
    200,
    false,
  ],
  [
    'a ValidationError without field errors',
    fails(new ValidationError({ errors: [] })),
    { ok: false, code: 'VALIDATION' },
    200,
    false,
  ],
  [
    'a DomainError INTERNAL',
    fails(new DomainError('INTERNAL')),
    { ok: false, code: 'INTERNAL' },
    200,
    true,
  ],
  ['another APIError', fails(new APIError('x', 400)), { ok: false, code: 'INTERNAL' }, 200, true],
  ['an Error', fails(new Error('boom')), { ok: false, code: 'INTERNAL' }, 200, true],
  ['a non-Error', fails('str'), { ok: false, code: 'INTERNAL' }, 200, true],
]

it('builds no logger on import', () => {
  expect(pinoMock).not.toHaveBeenCalled()
})

describe.each(wrappers)('%s', (name, run) => {
  it.each(rows)('maps %s', async (_, fn, body, status, logs) => {
    const loggersBefore = pinoMock.mock.calls.length
    const settled = await run(fn)

    expect(settled.body).toStrictEqual(body)
    if (name === 'runRoute') expect(settled.status).toBe(status)
    if (logs) {
      expect(logError).toHaveBeenCalledOnce()
      const [[context]] = logError.mock.calls as [[{ err: unknown }]]
      expect(context.err).toBe(await fn().catch((err: unknown) => err))
      expect(pinoMock).toHaveBeenCalledOnce()
    } else {
      expect(logError).not.toHaveBeenCalled()
      expect(pinoMock.mock.calls.length).toBe(loggersBefore)
    }
  })

  it('leaks no message or stack', async () => {
    const settled = await run(fails(new Error('secret detail')))
    expect(JSON.stringify(settled.body)).not.toContain('secret')
  })

  it.each([
    ['redirect()', () => redirect('/x'), 'NEXT_REDIRECT'],
    ['notFound()', () => notFound(), 'NEXT_HTTP_ERROR_FALLBACK;404'],
  ])('rethrows %s without logging', async (_, control, digest) => {
    await expect(
      run(async () => {
        control()
      }),
    ).rejects.toMatchObject({ digest: expect.stringContaining(digest) })
    expect(logError).not.toHaveBeenCalled()
  })
})

it("builds one logger, from Payload's defaultLoggerOptions", () => {
  expect(pinoMock).toHaveBeenCalledOnce()
  expect(pinoMock).toHaveBeenCalledWith(defaultLoggerOptions)
})
