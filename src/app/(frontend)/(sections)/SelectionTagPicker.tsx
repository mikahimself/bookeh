'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState, type TransitionStartFunction } from 'react'

import type { TagKind } from '@/lib/books/effectiveBook'
import type { Ref } from '@/lib/payload/ref'

import { settleAction } from '../components/request'
import { TAG_KINDS, type TagOptions } from '../components/TagPicker'
import { TextSwitch } from '../components/TextSwitch'
import { useToast } from '../components/toast/ToastProvider'
import { Combobox } from '../components/ui/Combobox'
import { PickerFrame } from '../components/ui/Picker'

import { changeSelectionTagsAction } from './actions'
import { LoadFailed } from './LoadFailed'
import { useAfterAction } from './ShelfRows'

export type SelectionTagSettled = Awaited<ReturnType<typeof changeSelectionTagsAction>>

export function SelectionTagPicker({
  open,
  onOpenChange,
  onClosed,
  options,
  copyIds,
  pending,
  startTransition,
  onSettled,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onClosed: () => void
  options: TagOptions | null
  copyIds: readonly number[]
  pending: boolean
  startTransition: TransitionStartFunction
  onSettled: (result: SelectionTagSettled, sent: number[]) => void
}) {
  const t = useTranslations()
  const { show } = useToast()
  const afterAction = useAfterAction()
  const [kind, setKind] = useState<TagKind>('tag')
  const [addition, setAddition] = useState<Ref | null>(null)
  const [error, setError] = useState<string>()
  const [reset, setReset] = useState(0)
  const inFlight = useRef(false)
  const [wasOpen, setWasOpen] = useState(open)
  if (wasOpen !== open) {
    setWasOpen(open)
    if (open) {
      setError(undefined)
      setAddition(null)
      setReset((value) => value + 1)
    }
  }

  const choose = (ref: Ref | null, remove: boolean) => {
    if (ref === null || !open || pending || inFlight.current || copyIds.length === 0) return
    if (remove && typeof ref !== 'number') return
    if (!remove) setAddition(ref)
    inFlight.current = true
    const sent = [...copyIds]
    startTransition(async () => {
      try {
        const result = await settleAction(
          changeSelectionTagsAction({
            copyIds: sent,
            kind,
            add: remove ? [] : [ref],
            remove: remove ? [ref] : [],
          }),
        )
        onSettled(result, sent)
        if (!result.ok) {
          const code = result.fields?.tags ?? result.code
          if (!remove && (result.fields?.tags || code === 'SYSTEM_NAME' || code === 'NAME_TAKEN')) {
            setError(t(`errors.${code}`))
            return
          }
          afterAction(result)
          return
        }
        setError(undefined)
        show({
          kind: 'success',
          message: t('tagPicker.tagged', { count: result.data.count }),
          undo: { token: result.data.undoToken, seconds: result.data.undoSeconds },
        })
        onOpenChange(false)
        afterAction(result)
      } finally {
        inFlight.current = false
      }
    })
  }

  const choices = (options?.[kind] ?? []).map(({ id, name }) => ({ id, label: name }))
  return (
    <PickerFrame
      open={open}
      onOpenChange={onOpenChange}
      onClosed={onClosed}
      title={t('tagPicker.heading')}
    >
      <div className="flex flex-col gap-4">
        <TextSwitch
          label={t('tagPicker.kind')}
          value={kind}
          options={TAG_KINDS.map((value) => ({ value, label: t(`tagPicker.${value}`) }))}
          disabled={pending}
          onChange={(next) => {
            setKind(next)
            setAddition(null)
            setError(undefined)
            setReset((value) => value + 1)
          }}
        />
        {options === null ? (
          <LoadFailed />
        ) : (
          <>
            <Combobox
              resetKey={reset}
              label={t(`selectionTags.add.${kind}`)}
              value={addition}
              options={choices}
              onInputValueChange={() => setError(undefined)}
              error={error}
              disabled={pending || copyIds.length === 0}
              onValueChange={(ref) => choose(ref, false)}
            />
            <Combobox
              resetKey={reset}
              label={t(`selectionTags.remove.${kind}`)}
              value={null}
              options={choices}
              create={false}
              disabled={pending || copyIds.length === 0}
              onValueChange={(ref) => choose(ref, true)}
            />
          </>
        )}
      </div>
    </PickerFrame>
  )
}
