'use client'

import { useTranslations } from 'next-intl'

import type { SaveResult } from '@/lib/catalogue/saveCopy'
import type { Undoable } from '@/lib/undo/undo'

import { useTaskBack } from '../components/navigation'
import { useToast } from '../components/toast/ToastProvider'
import { type OnRefused, type PressCall, useSavePress } from '../components/useSavePress'

/** The save a press runs, with the press's `requestId`. */
export type SaveCall = PressCall<Undoable<SaveResult>>

/**
 * The press behind every Add to library button (EXPERIENCE.md, Answer):
 * `add(call)` runs the save (`useSavePress()`, latched), then raises the held
 * "Saved to {location}" toast with the save's Edit (Edit book for the new
 * copy) and Undo, and returns to Scan. When the Answer has already been left
 * (Back, X), the toast still shows and nothing navigates.
 */
export function useAddToLibrary(): {
  pending: boolean
  add: (call: SaveCall, onRefused?: OnRefused) => void
} {
  const t = useTranslations()
  const { show } = useToast()
  const back = useTaskBack('/scan')
  const { pending, press } = useSavePress<Undoable<SaveResult>>(
    ({ bookId, copyId, savedTo, undoToken, undoSeconds }, mounted) => {
      show({
        kind: 'success',
        message: savedTo ? t('toast.savedTo', { location: savedTo.name }) : t('toast.saved'),
        hold: true,
        undo: { token: undoToken, seconds: undoSeconds },
        edit: `/books/${bookId}/edit?copy=${copyId}`,
      })
      if (mounted) back()
    },
  )

  return { pending, add: press }
}
