'use client'

import { useTranslations } from 'next-intl'
import type { TransitionStartFunction } from 'react'

import type { LocationOption } from '@/lib/copies/locations'
import type { Ref } from '@/lib/payload/ref'

import { settleAction } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'
import { Picker } from '../components/ui/Picker'

import { moveCopiesAction } from './actions'
import { useAfterAction } from './ShelfRows'

/** What a move settled with: `skipped` names the ordered copies left alone. */
export type MoveSettled = Awaited<ReturnType<typeof moveCopiesAction>>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  locations: readonly LocationOption[]
  /** The copy's location on a Book detail line; `null` in the action bar. */
  value: number | null
  copyIds: readonly number[]
  /** The caller's transition, so its pending state covers the move. */
  startTransition: TransitionStartFunction
  /** Runs once the move settles, with the ids sent, before `afterAction`. */
  onSettled?: (result: MoveSettled, copyIds: number[]) => void
}

/**
 * EXPERIENCE.md, Picker (Location); FR-33: Move's location Picker, a row per
 * location and a "New location" field (at most 200 characters, the name's
 * limit) under them. A choice moves the owned copies among `copyIds`
 * (`moveCopiesAction`). On `ok` the success toast "{n} moved to {location}"
 * with Undo; when ordered copies were skipped it says how many, counts only
 * what moved and offers Undo only when something did. Every result goes to
 * `afterAction`, which reloads the rows and then refreshes the server render,
 * so Book detail's lines and the bar's locations read anew. The toast's Undo
 * reloads the rows through `onUndone`.
 */
export function MovePicker({
  open,
  onOpenChange,
  locations,
  value,
  copyIds,
  startTransition,
  onSettled,
}: Props) {
  const t = useTranslations('collection')
  const tToast = useTranslations('toast')
  const { show } = useToast()
  const afterAction = useAfterAction()

  const move = (location: Ref) => {
    const sent = [...copyIds]
    startTransition(async () => {
      const result = await settleAction(moveCopiesAction({ copyIds: sent, location }))
      if (result.ok) {
        const { location: target, count, skipped, undoToken, undoSeconds } = result.data
        const values = { n: count, location: target?.name ?? '', skipped: skipped.length }
        const undo = { token: undoToken, seconds: undoSeconds }
        // Nothing written (all ordered, or all at the target already): no Undo to offer.
        show({
          kind: 'success',
          message: tToast(skipped.length === 0 ? 'moved' : 'movedSkipped', values),
          ...(count > 0 && { undo }),
        })
      }
      onSettled?.(result, sent)
      afterAction(result)
    })
  }

  return (
    <Picker<number>
      open={open}
      onOpenChange={onOpenChange}
      title={t('moveTitle')}
      options={locations.map(({ id, name }) => ({ value: id, label: name }))}
      value={value}
      onChoose={move}
      create={{
        label: t('newLocation'),
        submit: t('move'),
        maxLength: 200,
        onCreate: (name) => move({ create: name }),
      }}
    />
  )
}
