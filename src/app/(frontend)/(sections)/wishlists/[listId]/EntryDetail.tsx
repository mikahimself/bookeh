import { getTranslations } from 'next-intl/server'

import type { EffectiveBook, Named } from '@/lib/books/effectiveBook'
import type { ListEntry } from '@/lib/wishlists/wishlists'

import { BookDetailFrame } from '../../BookDetailPanel'
import { BookHeader } from '../../BookHeader'

import { EntryActions } from './EntryActions'
import { EntryFor } from './EntryFor'

/**
 * The opened entry (EXPERIENCE.md, Wishlists → Entry opened; FR-38, UX-DR49)
 * in Book detail's frame: the bottom sheet on the phone, the panel beside the
 * list from 900px, closing back to the list. The Book's header
 * (`BookHeader`), "On {list}" with the name as typed, and "For" (`EntryFor`)
 * over the viewer's `people`, then the Buttons Bought (the one primary),
 * Ordered and Remove (`EntryActions`), each closing back to a fresh list. Not
 * Book detail: no read switch, copies, genres or foot.
 */
export async function EntryDetail({
  listId,
  listName,
  entry,
  book,
  people,
}: {
  listId: number
  listName: string
  entry: ListEntry
  book: EffectiveBook
  people: Named[]
}) {
  const t = await getTranslations('wishlists')
  const back = `/wishlists/${listId}`
  return (
    <BookDetailFrame label={book.title} back={back} openId={entry.entryId}>
      <div className="flex flex-col gap-6">
        <BookHeader book={book}>
          <p className="text-meta text-text-muted">{t('onList', { list: listName })}</p>
        </BookHeader>
        <EntryFor
          key={entry.entryId}
          entryId={entry.entryId}
          people={people}
          initial={entry.forPerson?.id ?? null}
        />
        <EntryActions entryId={entry.entryId} listName={listName} back={back} />
      </div>
    </BookDetailFrame>
  )
}
