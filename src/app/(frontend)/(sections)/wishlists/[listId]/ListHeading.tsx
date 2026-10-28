'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { deleteWishlistAction, renameWishlistAction } from '../../../actions/wishlists'
import { Button } from '../../../components/Button'
import { ActionLink } from '../../../components/Link'
import { settleAction, useReportFailure } from '../../../components/request'
import { Dialog } from '../../../components/ui/Dialog'
import { NameField, typed } from '../../settings/ManagedList'

/**
 * The head of one wishlist (EXPERIENCE.md, Wishlists; FR-39): the list's name
 * as typed as the page's `h1` (never lowercased), then "{n} books" and the
 * Links Rename and Delete. Rename swaps the heading for Settings' name field
 * (Enter or leaving it saves, `Esc` drops it; a taken name keeps it open with
 * its message; no merge: wishlists have none); the refresh brings the new
 * name. Delete opens a Dialog saying the entries go too; its confirm deletes
 * the list, and success or `NOT_FOUND` (gone already) replaces to
 * `/wishlists`. Failures are reported; no Undo, no toast on success.
 */
export function ListHeading({ id, name, count }: { id: number; name: string; count: number }) {
  const t = useTranslations()
  const router = useRouter()
  const report = useReportFailure()
  const [pending, startTransition] = useTransition()
  const [renaming, setRenaming] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const remove = () => {
    if (!deleteOpen) return
    setDeleteOpen(false)
    startTransition(async () => {
      const result = await settleAction(deleteWishlistAction(id))
      if (!result.ok) report(result.code)
      if (result.ok || result.code === 'NOT_FOUND') {
        startTransition(() => router.replace('/wishlists'))
      }
    })
  }

  return (
    <div className="flex flex-col gap-1 pt-2 pb-2">
      {renaming ? (
        <NameField
          initial={name}
          save={(next) => renameWishlistAction(id, next)}
          onDone={() => setRenaming(false)}
        />
      ) : (
        <h1 className="text-heading-section-phone break-words text-text wide:text-heading-section">
          {name}
        </h1>
      )}
      <div className="flex flex-wrap items-baseline gap-x-4 text-meta">
        <span className="text-text-muted">{t('collection.count', { n: count })}</span>
        <ActionLink disabled={pending || renaming} onClick={() => setRenaming(true)}>
          {t('settings.rename')}
        </ActionLink>
        <ActionLink destructive disabled={pending || renaming} onClick={() => setDeleteOpen(true)}>
          {t('settings.delete')}
        </ActionLink>
      </div>
      <Dialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={t.rich('wishlists.deleteTitle', { name, typed })}
        confirm={
          <Button variant="destructive" onClick={remove}>
            {t('settings.delete')}
          </Button>
        }
      >
        <p className="text-body">{t('wishlists.deleteBody')}</p>
      </Dialog>
    </div>
  )
}
