'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import type { TagKind, UserBookState } from '@/lib/books/effectiveBook'
import type { Ref } from '@/lib/payload/ref'

import { ActionLink } from '../components/Link'
import { settleAction, useReportFailure } from '../components/request'
import { TagPicker, type TagOptions } from '../components/TagPicker'
import { useToast } from '../components/toast/ToastProvider'
import { changeBookTagsAction } from './actions'

export function DetailTags({
  bookId,
  initial,
  options,
}: {
  bookId: number
  initial: UserBookState['tags']
  options: TagOptions
}) {
  const t = useTranslations()
  const router = useRouter()
  const { show } = useToast()
  const reportFailure = useReportFailure()
  const [open, setOpen] = useState(false)
  const [tags, setTags] = useState(initial)
  const [errors, setErrors] = useState<Partial<Record<TagKind, string>>>({})
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)
  // Server refreshes (including Undo) always become the next mutation's state.
  const [previousInitial, setPreviousInitial] = useState(initial)
  if (initial !== previousInitial) {
    setPreviousInitial(initial)
    setTags(initial)
  }

  const mutate = (kind: TagKind, add: Ref[], remove: number[]): Promise<boolean> => {
    if (inFlight.current) return Promise.resolve(false)
    inFlight.current = true
    return new Promise((resolve) => {
      startTransition(async () => {
        try {
          const result = await settleAction(changeBookTagsAction({ bookId, kind, add, remove }))
          if (!result.ok) {
            const code = result.fields?.tags ?? result.code
            if (result.fields?.tags || code === 'SYSTEM_NAME' || code === 'NAME_TAKEN')
              setErrors({ [kind]: t(`errors.${code}`) })
            else reportFailure(result.code)
            resolve(false)
            return
          }
          setErrors({})
          setTags(result.data.tags)
          show({
            kind: 'success',
            message: t('tagPicker.tagged', { count: result.data.count }),
            undo: { token: result.data.undoToken, seconds: result.data.undoSeconds },
          })
          router.refresh()
          resolve(true)
        } finally {
          inFlight.current = false
        }
      })
    })
  }
  const available: TagOptions = {
    tag: [...options.tag],
    genre: [...options.genre],
    theme: [...options.theme],
  }
  for (const tag of tags) {
    if (!available[tag.kind].some(({ id }) => id === tag.id))
      available[tag.kind] = [...available[tag.kind], tag]
  }
  return (
    <div>
      <ActionLink onClick={() => setOpen(true)}>{t('tagPicker.add')}</ActionLink>
      <TagPicker
        open={open}
        onOpenChange={setOpen}
        options={available}
        selected={{
          tag: tags.filter(({ kind }) => kind === 'tag').map(({ id }) => id),
          genre: tags.filter(({ kind }) => kind === 'genre').map(({ id }) => id),
          theme: tags.filter(({ kind }) => kind === 'theme').map(({ id }) => id),
        }}
        pending={pending}
        errors={errors}
        onAdd={(kind, ref) => mutate(kind, [ref], [])}
        onRemove={(kind, ref) => {
          if (typeof ref === 'number') void mutate(kind, [], [ref])
        }}
      />
    </div>
  )
}
