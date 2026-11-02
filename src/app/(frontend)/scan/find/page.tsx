import { getTranslations } from 'next-intl/server'
import { ViewTransition } from 'react'

import { searchBooks, type SearchDraft } from '@/lib/catalogue/searchBooks'
import { DomainError } from '@/lib/errors'
import { requireUser } from '@/lib/payload/context'
import { searchMine } from '@/lib/shelf/searchMine'

import { FullScreenTask } from '../../components/FullScreenTask'
import { RaiseToast } from '../../components/toast/RaiseToast'

import { LookupField } from './LookupField'
import { LookupRow } from './LookupRow'
import { lookupRows, type LookupRowData } from './lookupRows'

/** The `q` as typed; a repeated param takes the first value. */
const queryOf = (value: string | string[] | undefined): string =>
  (Array.isArray(value) ? value[0] : value) ?? ''

/**
 * Lookup by title or author (EXPERIENCE.md, Lookup; spine, Routes
 * `/scan/find`), a full-screen task inside the `/scan` segment, so the camera
 * session, the task base and the held-save toast are the same as Scan's. The
 * camera stays off: only Scan starts it.
 *
 * `?q=` is the search, run here on the server with the text trimmed: the
 * viewer's own holdings first (`searchMine`, which counts nothing), then the
 * sources (`searchBooks`, one lookup against the rate limit), one after the
 * other (AD-16). A blank or missing `q` asks nothing and renders the field
 * alone -- "Nothing found" is a search's answer, never the opening state.
 *
 * A refused source search (`RATE_LIMITED`) keeps the own group, which has
 * already been read, drops the Elsewhere group and raises the error toast, as
 * Scan does for a refused lookup; any other failure goes to Next's error
 * handling. A result opens its Answer, pushed, so Back returns here.
 */
export default async function LookupPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const ctx = await requireUser()
  const t = await getTranslations()
  const text = queryOf((await searchParams).q)
  const query = text.trim()

  let groups: { mine: LookupRowData[]; elsewhere: LookupRowData[] } | null = null
  let limited = false
  if (query !== '') {
    const own = await searchMine(ctx, query)
    let hits: SearchDraft[] = []
    try {
      hits = await searchBooks(ctx, query)
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== 'RATE_LIMITED') throw error
      limited = true
    }
    groups = lookupRows(own, hits)
  }
  const lent = (person: string) => t('loans.lentMarker', { person })

  const group = (heading: string, rows: LookupRowData[]) => (
    <div>
      <h2 className="text-heading-group text-text-muted ui-case">{heading}</h2>
      <ul>
        {rows.map((row) => (
          <LookupRow key={row.href} row={row} lent={lent} />
        ))}
      </ul>
    </div>
  )

  return (
    <ViewTransition enter="task-enter" exit="task-exit" default="none">
      <FullScreenTask title={t('lookup.heading')}>
        <LookupField q={text} />
        {groups !== null && groups.mine.length > 0 && group(t('lookup.mine'), groups.mine)}
        {groups !== null &&
          !limited &&
          groups.elsewhere.length > 0 &&
          group(t('lookup.elsewhere'), groups.elsewhere)}
        {/* Only a search that ran and found nothing: the refused half never answered. */}
        {groups !== null && !limited && groups.mine.length + groups.elsewhere.length === 0 && (
          <p className="text-control text-text">{t('lookup.nothing')}</p>
        )}
        {limited && (
          // Fresh per render, so a repeated search raises it again.
          <RaiseToast key={crypto.randomUUID()} input={{ kind: 'error', code: 'RATE_LIMITED' }} />
        )}
      </FullScreenTask>
    </ViewTransition>
  )
}
