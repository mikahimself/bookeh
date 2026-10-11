// Helpers every source adapter shares: JSON guards, text cleaning, language codes and the
// logged fetch, the one failure path for all sources.
import { logger } from '@/lib/errors'

import type { SourceResult } from '../source'

const TIMEOUT_MS = 10_000

// --- Guards ------------------------------------------------------------------------------

export type Json = Record<string, unknown>

export function isObject(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function strings(value: unknown): string[] {
  return list(value).filter((v): v is string => typeof v === 'string')
}

/** NFC and trimmed; undefined for anything that is not a non-empty string. */
export function clean(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  return value.normalize('NFC').trim() || undefined
}

const NO_LANGUAGE = new Set(['und', 'mul', 'zxx', 'mis'])

/** To ISO 639-1 where one exists: `fin` gives `fi`, `ger` gives `de`, `iw` gives `he`. */
export function isoLanguage(code: unknown): string | undefined {
  const text = clean(code)
  if (!text) return undefined
  try {
    const tag = new Intl.Locale(text).language
    return tag && !NO_LANGUAGE.has(tag) ? tag : undefined
  } catch {
    return undefined
  }
}

/** The result without its undefined fields: a value the source lacks is left out. */
export function compact(result: SourceResult): SourceResult {
  return Object.fromEntries(
    Object.entries(result).filter(([, value]) => value !== undefined),
  ) as SourceResult
}

// --- Request -----------------------------------------------------------------------------

/** Logs one failed lookup; always undefined, so a caller can `return lookupFailed(…)`. */
export function lookupFailed(
  label: string,
  isbn13: string,
  reason: string,
  details?: Json,
): undefined {
  logger().warn({ isbn13, ...details }, `${label} lookup failed: ${reason}`)
  return undefined
}

const timedOut = (err: unknown): boolean => err instanceof Error && err.name === 'TimeoutError'

/**
 * The parsed JSON body of a 2xx answer; undefined after one logged failure for a network
 * error, a timeout, a non-2xx status or a body that is not JSON. The URL is never logged.
 */
export async function getJson(label: string, url: string, isbn13: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (err) {
    return lookupFailed(label, isbn13, timedOut(err) ? 'timeout' : 'network error', { err })
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    return lookupFailed(label, isbn13, `HTTP ${response.status}`)
  }
  try {
    return (await response.json()) as unknown
  } catch (err) {
    // The timeout signal also covers reading the body.
    return lookupFailed(label, isbn13, timedOut(err) ? 'timeout' : 'response is not JSON', { err })
  }
}
