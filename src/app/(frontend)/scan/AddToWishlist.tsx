'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useEffect, useRef, useState, useTransition } from 'react'

import type { EntrySaveResult } from '@/lib/catalogue/saveCopy'
import { limits } from '@/fields/limits'
import type { Ref } from '@/lib/payload/ref'
import type { Undoable } from '@/lib/undo/undo'
import type { WishlistLine } from '@/lib/wishlists/wishlists'

import { useTaskBack } from '../components/navigation'
import { Button } from '../components/Button'
import { ProgressLine } from '../components/ProgressLine'
import { useToast } from '../components/toast/ToastProvider'
import { Picker } from '../components/ui/Picker'

import { saveEntryAction } from './actions'
import type { EntryTarget } from './entryTarget'
import { type OnRefused, useSavePress } from './useAddToLibrary'

/** Between a row's name and its count, for assistive technology only. */
const SEPARATOR = ', '

/**
 * Add to wishlist (EXPERIENCE.md, Answer → Add to wishlist; FR-21, FR-22):
 * a secondary Button that opens the wishlist Picker on every press, titled
 * "Add to wishlist" with `title` muted under it, a row per list with its open
 * count, and the "New list" field under them. With exactly one list the
 * picker is skipped and the press saves to it; with none, only the field
 * shows, focused. A row saves to its id, the field to `{ create }` as typed:
 * the server matches the name to a list or makes one, never the client.
 *
 * The save (`saveEntryAction`) has Add to library's press semantics
 * (`useSavePress()`): the toast "Added to {list}" with Undo, held, and back
 * to Scan. `stay` (Book detail): the toast is not held, nothing navigates,
 * the server render refreshes (`router.refresh()`), so the new entry and any
 * list made on the way show, and the next press is a new save. `NOT_FOUND`
 * re-renders the address with no toast, as Add to library does; any other
 * failure goes to `onRefused` first, then is reported.
 *
 * `target` as a function is read at the press (the Not found form's typed
 * text): `null` saves nothing and opens no picker.
 *
 * `onBusyChange` hears whether a save is in flight, or, without `stay`, has
 * succeeded and is leaving: the Not found form disables Add to library
 * meanwhile, so no second private Book lands beside the wish.
 */
export function AddToWishlist({
  lists,
  title,
  target,
  stay = false,
  onRefused,
  disabled = false,
  onBusyChange,
}: {
  lists: readonly WishlistLine[]
  title: string
  target: EntryTarget | (() => EntryTarget | null)
  stay?: boolean
  onRefused?: OnRefused
  disabled?: boolean
  onBusyChange?: (busy: boolean) => void
}) {
  const t = useTranslations()
  const router = useRouter()
  const { show } = useToast()
  const back = useTaskBack('/scan')
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [refreshing, startTransition] = useTransition()
  /** The target read at the press, saved when the picker's choice comes. */
  const chosen = useRef<EntryTarget | null>(null)
  const { pending, press } = useSavePress<Undoable<EntrySaveResult>>(
    ({ savedTo, undoToken, undoSeconds }, mounted) => {
      show({
        kind: 'success',
        message: t('toast.addedTo', { list: savedTo.name }),
        ...(!stay && { hold: true }),
        undo: { token: undoToken, seconds: undoSeconds },
      })
      if (!mounted) return
      if (stay) {
        // Book detail's On wishlists group and the picker's lists follow the save.
        startTransition(() => {
          router.refresh()
        })
      } else {
        setLeaving(true)
        back()
      }
    },
    { latch: !stay },
  )

  // Hidden under Activity, the press's latch is released; so is this, for a revived instance.
  useEffect(() => () => setLeaving(false), [])

  const saving = pending || leaving
  useEffect(() => {
    onBusyChange?.(saving)
  }, [saving, onBusyChange])

  const save = (wishlist: Ref) => {
    const sent = chosen.current
    if (!sent) return
    press(
      (requestId) => saveEntryAction({ requestId, wishlist, target: sent }),
      (failure) => {
        if (failure.code !== 'NOT_FOUND') return onRefused?.(failure) ?? false
        startTransition(() => {
          router.refresh()
        })
        return true
      },
    )
  }

  const start = () => {
    const read = typeof target === 'function' ? target() : target
    if (!read) return
    chosen.current = read
    const only = lists.length === 1 ? lists[0] : undefined
    if (only) save(only.id)
    else setOpen(true)
  }

  const busy = pending || refreshing
  return (
    <>
      {busy && <ProgressLine label={t('progress.loading')} />}
      <Button variant="secondary" onClick={start} disabled={disabled || busy}>
        {t('wishlists.addToWishlist')}
      </Button>
      <Picker<number>
        open={open}
        onOpenChange={setOpen}
        title={t('wishlists.addToWishlist')}
        description={<p className="text-meta text-text-muted">{title}</p>}
        options={lists.map(({ id, name, count }) => ({
          value: id,
          label: (
            <span className="flex items-baseline justify-between gap-4">
              <span>{name}</span>
              <span className="sr-only">{SEPARATOR}</span>
              <span className="text-meta text-text-muted">{count}</span>
            </span>
          ),
        }))}
        value={null}
        onChoose={save}
        create={{
          label: t('wishlists.newList'),
          submit: t('wishlists.add'),
          maxLength: limits.name,
          onCreate: (name) => save({ create: name }),
        }}
      />
    </>
  )
}
