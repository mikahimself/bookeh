import Link from 'next/link'

import { Cover } from '../../components/Cover'
import { markerSlotClass } from '../../components/ui/classes'

import type { LookupRowData } from './lookupRows'

/**
 * DESIGN.md, Book row: one Lookup result -- the cover, the title, the authors
 * and the edition line, and, for an own Book with a lent copy, the lent marker
 * and its borrower (FR-37). The whole row is a link to its Answer, pushed so
 * Back on the Answer returns to the results. One row per Book, the same in
 * both groups; hook-free, so the caller passes the lent wording.
 */
export function LookupRow({ row, lent }: { row: LookupRowData; lent: (person: string) => string }) {
  return (
    <li>
      <Link
        href={row.href}
        scroll={false}
        prefetch={false}
        className="flex items-center gap-4 py-2"
      >
        <div className="w-cover-row shrink-0">
          <Cover src={row.cover} title={row.title} language={row.language} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <p className="truncate text-title text-text">{row.title}</p>
          {[row.authors, row.edition]
            .filter((line) => line !== '')
            .map((line, i) => (
              <p key={i} className="min-w-0 truncate text-meta text-text-muted">
                {line}
              </p>
            ))}
        </div>
        {row.lentTo !== null && (
          <span className="flex max-w-1/3 shrink-0 items-center gap-2 text-meta text-text">
            <span aria-hidden="true" className={`${markerSlotClass} bg-accent`} />
            <span className="min-w-0 truncate">{lent(row.lentTo)}</span>
          </span>
        )}
      </Link>
    </li>
  )
}
