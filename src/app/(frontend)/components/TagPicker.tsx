'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'

import type { TagKind } from '@/lib/books/effectiveBook'
import type { Named, Ref } from '@/lib/payload/ref'

import { ActionLink } from './Link'
import { TextSwitch } from './TextSwitch'
import { Combobox } from './ui/Combobox'
import { PickerFrame } from './ui/Picker'

export const TAG_KINDS: TagKind[] = ['tag', 'genre', 'theme']
export type TagOptions = Record<TagKind, readonly Named[]>
export type TagSelection = Partial<Record<TagKind, Ref[]>>

export function TagPicker({
  open,
  onOpenChange,
  options,
  selected,
  onAdd,
  onRemove,
  errors = {},
  pending = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: TagOptions
  selected: TagSelection
  onAdd: (kind: TagKind, ref: Ref) => Promise<boolean> | boolean
  onRemove: (kind: TagKind, ref: Ref) => void
  errors?: Partial<Record<TagKind, string>>
  pending?: boolean
}) {
  const t = useTranslations('tagPicker')
  const [kind, setKind] = useState<TagKind>('tag')
  const [reset, setReset] = useState(0)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      const rejected = TAG_KINDS.find((kind) => errors[kind])
      if (rejected) setKind(rejected)
    }
  }
  const values = selected[kind] ?? []
  const name = (ref: Ref) =>
    typeof ref === 'number'
      ? (options[kind].find(({ id }) => id === ref)?.name ?? String(ref))
      : ref.create

  return (
    <PickerFrame open={open} onOpenChange={onOpenChange} title={t('heading')}>
      <div className="flex flex-col gap-4">
        <TextSwitch
          label={t('kind')}
          value={kind}
          options={TAG_KINDS.map((value) => ({ value, label: t(value) }))}
          disabled={pending}
          onChange={(next) => {
            setKind(next)
            setReset((value) => value + 1)
          }}
        />
        <Combobox
          resetKey={reset}
          label={t(`find.${kind}`)}
          value={null}
          options={options[kind]
            .filter(({ id }) => !values.includes(id))
            .map(({ id, name }) => ({ id, label: name }))}
          error={errors[kind]}
          disabled={pending}
          onValueChange={(ref) => {
            if (ref !== null)
              Promise.resolve(onAdd(kind, ref)).then((ok) => {
                if (ok) setReset((value) => value + 1)
              })
          }}
        />
        {values.length === 0 ? (
          <p className="text-meta text-text-muted">{t('empty')}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {values.map((ref, index) => (
              <li key={index} className="flex items-center justify-between gap-4">
                <span className="min-w-0 text-body break-words normal-case wrap-anywhere">
                  {name(ref)}
                </span>
                <span className="shrink-0">
                  <ActionLink
                    disabled={pending}
                    aria-label={t('remove', { name: name(ref) })}
                    onClick={() => onRemove(kind, ref)}
                  >
                    {t('removeSymbol')}
                  </ActionLink>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PickerFrame>
  )
}
