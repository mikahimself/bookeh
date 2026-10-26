import { readFile } from 'node:fs/promises'

import { isAdmin, type RoleHolder } from '@/access/roles'

/**
 * The nightly backup's status file: `BACKUP_STATUS_FILE`, or the read-only
 * mount of the backup status directory in `deploy/compose.prod.yml`.
 */
export const BACKUP_STATUS_FILE =
  process.env.BACKUP_STATUS_FILE?.trim() || '/app/backup-status/last-backup.json'

/** A successful backup older than this is overdue. */
const MAX_AGE_MS = 48 * 60 * 60 * 1000

export type LastBackup =
  { kind: 'success' | 'failure'; time: Date; overdue: boolean } | { kind: 'missing'; overdue: true }

const MISSING: LastBackup = { kind: 'missing', overdue: true }

/**
 * NFR-6: the outcome of the nightly backup (story 2.3) as Settings shows it.
 * `null` for a non-admin, whose request never reads the file. A file that
 * cannot be read or parsed is `missing`; never throws. A failure is always
 * overdue, a success once it is more than 48 hours old.
 */
export async function readLastBackup(
  user: RoleHolder,
  file = BACKUP_STATUS_FILE,
  now = new Date(),
): Promise<LastBackup | null> {
  if (!isAdmin(user)) return null
  let status: unknown
  try {
    status = JSON.parse(await readFile(file, 'utf8'))
  } catch {
    return MISSING
  }
  if (typeof status !== 'object' || status === null) return MISSING
  const { time, outcome } = status as { time?: unknown; outcome?: unknown }
  if (typeof time !== 'string' || (outcome !== 'success' && outcome !== 'failure')) return MISSING
  const date = new Date(time)
  if (Number.isNaN(date.getTime())) return MISSING
  const overdue = outcome === 'failure' || now.getTime() - date.getTime() > MAX_AGE_MS
  return { kind: outcome, time: date, overdue }
}
