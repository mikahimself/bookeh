'use server'

import { cookies } from 'next/headers'

import { DomainError, runAction, type ActionResult } from '@/lib/errors'
import { requireUserOrThrow } from '@/lib/payload/context'

import {
  devicePrefs,
  parsePrefsPatch,
  PREFS_COOKIE,
  PREFS_COOKIE_OPTIONS,
  serializeDevicePrefs,
  type DevicePrefs,
} from '../prefs'

/**
 * The only writer of the device preferences cookie: merges a partial update
 * over the current values and stores all four. The patch comes from the
 * client, so anything outside the known fields and options is `VALIDATION`.
 */
export async function setDevicePrefsAction(patch: unknown): Promise<ActionResult<DevicePrefs>> {
  return runAction(async () => {
    await requireUserOrThrow()
    const valid = parsePrefsPatch(patch)
    if (valid === null) throw new DomainError('VALIDATION')
    const next: DevicePrefs = { ...(await devicePrefs()), ...valid }
    ;(await cookies()).set(PREFS_COOKIE, serializeDevicePrefs(next), PREFS_COOKIE_OPTIONS)
    return next
  })
}
