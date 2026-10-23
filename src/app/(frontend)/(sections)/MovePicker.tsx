'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import type { TransitionStartFunction } from 'react'

import type { LocationOption } from '@/lib/copies/locations'
import type { ActionResult } from '@/lib/errors'
import type { Ref } from '@/lib/payload/ref'

import { settleAction } from '../components/request'
import { useToast } from '../components/toast/ToastProvider'
import { Picker } from '../components/ui/Picker'

import { moveCopiesAction } from './actions'
import { useAfterAction } from './ShelfRows'

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
  onSettled?: (result: ActionResult<unknown>, copyIds: number[]) => void
}

/**
 * EXPERIENCE.md, Picker (Location); FR-33: Move's location Picker, a row per
 * location and a "New location" field under them. A choice moves `copyIds`
 * all or none (`moveCopiesAction`). On `ok` the success toast "{n} moved to
 * {location}" with Undo, then a refresh, so Book detail's lines and the
 * bar's locations read anew; every result goes to `afterAction`, which
 * reloads the rows. The toast's Undo reloads them through `onUndone`.
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
  const router = useRouter()
  const afterAction = useAfterAction()

  const move = (location: Ref) => {
    const sent = [...copyIds]
    startTransition(async () => {
      const result = await settleAction(moveCopiesAction({ copyIds: sent, location }))
      if (result.ok) {
        const { location: target, count, undoToken, undoSeconds } = result.data
        show({
          kind: 'success',
          message: tToast('moved', { n: count, location: target.name }),
          undo: { token: undoToken, seconds: undoSeconds },
        })
        router.refresh()
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
        onCreate: (name) => move({ create: name }),
      }}
    />
  )
}
