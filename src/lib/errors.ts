import { unstable_rethrow } from 'next/navigation'
import { defaultLoggerOptions, Forbidden, NotFound, ValidationError } from 'payload'
import { pino, type Logger } from 'pino'

/** Spine, Errors convention. The message key for a code is `errors.<CODE>`. */
export type ErrorCode = 'UNAUTHENTICATED' | 'NOT_FOUND' | 'VALIDATION' | 'INTERNAL'

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ErrorCode; fields?: Record<string, ErrorCode>; conflictId?: number }

type Failure = Extract<ActionResult<never>, { ok: false }>

export class DomainError extends Error {
  readonly code: ErrorCode
  readonly fields?: Record<string, ErrorCode>
  readonly conflictId?: number

  constructor(
    code: ErrorCode,
    extras: { fields?: Record<string, ErrorCode>; conflictId?: number } = {},
  ) {
    super(code)
    this.name = 'DomainError'
    this.code = code
    if (extras.fields !== undefined) this.fields = extras.fields
    if (extras.conflictId !== undefined) this.conflictId = extras.conflictId
  }
}

// `payload.logger` is out of reach here (this file imports nothing from the
// project). With no `logger` in the config, Payload's logger is this same
// `pino(defaultLoggerOptions)`. Built on first use: importing has no side effect.
let logger: Logger | undefined
const log = (): Logger => (logger ??= pino(defaultLoggerOptions))

function toFailure(err: unknown, where: 'action' | 'route'): Failure {
  const failure = mapError(err)
  if (failure.code === 'INTERNAL') {
    log().error({ err }, `Unexpected error in ${where === 'action' ? 'runAction' : 'runRoute'}`)
  }
  return failure
}

function mapError(err: unknown): Failure {
  if (err instanceof DomainError) {
    const failure: Failure = { ok: false, code: err.code }
    if (err.fields !== undefined) failure.fields = err.fields
    if (err.conflictId !== undefined) failure.conflictId = err.conflictId
    return failure
  }
  // Forbidden reads as NOT_FOUND: a row the user may not see does not exist for them.
  if (err instanceof Forbidden || err instanceof NotFound) return { ok: false, code: 'NOT_FOUND' }
  if (err instanceof ValidationError) {
    const fields: Record<string, ErrorCode> = {}
    for (const { path } of err.data.errors) fields[path] = 'VALIDATION'
    return Object.keys(fields).length > 0
      ? { ok: false, code: 'VALIDATION', fields }
      : { ok: false, code: 'VALIDATION' }
  }
  return { ok: false, code: 'INTERNAL' }
}

async function settle<T>(
  fn: () => Promise<T>,
  where: 'action' | 'route',
): Promise<ActionResult<T>> {
  try {
    return { ok: true, data: await fn() }
  } catch (err) {
    unstable_rethrow(err)
    return toFailure(err, where)
  }
}

/** Runs a server action body. Never throws, except Next.js control flow. */
export function runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  return settle(fn, 'action')
}

/** Runs a `/data` route handler body and answers with its `ActionResult` as JSON. */
export async function runRoute<T>(fn: () => Promise<T>): Promise<Response> {
  const result = await settle(fn, 'route')
  const status = !result.ok && result.code === 'UNAUTHENTICATED' ? 401 : 200
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
}
