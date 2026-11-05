'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useState, useTransition, type ReactNode } from 'react'

import { limits } from '@/fields/limits'
import type { ActionResult, ErrorCode } from '@/lib/errors'

import { Button } from '../../components/Button'
import { settleAction, useReportFailure } from '../../components/request'
import { TextField } from '../../components/TextField'
import { useToast } from '../../components/toast/ToastProvider'
import {
  addGenreAction,
  deleteGenreAction,
  mergeGenreAction,
  remapGenresAction,
  renameGenreAction,
  setGenreNameFiAction,
} from './actions'
import { ManagedList, typed, type ManagedItem } from './ManagedList'

/** A system genre as Settings lists it: `name` is shown, `nameEn` and `nameFi` are what Edit changes. */
export type GenreItem = ManagedItem & { nameEn: string; nameFi: string }

const normalise = (value: string) => value.normalize('NFC').trim().replace(/\s+/g, ' ')

type FieldName = 'name' | 'nameFi'

/**
 * The Edit fields under a genre's row: English and Suomi. Save sends only the
 * names that changed (English first); a name in use or blank shows under its
 * own field, any other failure is reported and `NOT_FOUND` refreshes.
 */
function GenreEditor({ genre, done }: { genre: GenreItem; done: () => void }) {
  const t = useTranslations('settings')
  const tErrors = useTranslations('errors')
  const router = useRouter()
  const report = useReportFailure()
  const [english, setEnglish] = useState(genre.nameEn)
  const [finnish, setFinnish] = useState(genre.nameFi)
  const [errors, setErrors] = useState<Partial<Record<FieldName, ReactNode>>>({})
  const [pending, startTransition] = useTransition()

  const failure = (field: FieldName, code: ErrorCode, fields?: Record<string, ErrorCode>) => {
    if (code === 'NAME_TAKEN') return tErrors('NAME_TAKEN')
    if (code === 'VALIDATION' && fields?.[field] === 'TOO_LONG') return tErrors('TOO_LONG')
    if (code === 'VALIDATION' && fields?.[field]) return t('nameRequired')
    return null
  }

  const save = () => {
    const calls: { field: FieldName; call: () => Promise<ActionResult<null>> }[] = []
    if (normalise(english) !== normalise(genre.nameEn)) {
      calls.push({ field: 'name', call: () => renameGenreAction(genre.id, english) })
    }
    if (normalise(finnish) !== normalise(genre.nameFi)) {
      calls.push({ field: 'nameFi', call: () => setGenreNameFiAction(genre.id, finnish) })
    }
    if (calls.length === 0) {
      done()
      return
    }
    startTransition(async () => {
      let wrote = false
      for (const { field, call } of calls) {
        const result = await settleAction(call())
        if (result.ok) {
          wrote = true
          continue
        }
        const message = failure(field, result.code, result.fields)
        if (message !== null) setErrors({ [field]: message })
        else report(result.code)
        // An earlier name was saved, or the genre is gone: the list on screen is stale.
        if (wrote || result.code === 'NOT_FOUND') {
          startTransition(() => {
            if (result.code === 'NOT_FOUND') done()
            router.refresh()
          })
        }
        return
      }
      startTransition(() => {
        done()
        router.refresh()
      })
    })
  }

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(event) => {
        event.preventDefault()
        if (!pending) save()
      }}
    >
      <TextField
        label={t('nameEnglish')}
        name="name"
        autoComplete="off"
        maxLength={limits.name}
        autoFocus
        value={english}
        onChange={(event) => {
          setEnglish(event.target.value)
          setErrors((current) => ({ ...current, name: undefined }))
        }}
        error={errors.name}
      />
      <TextField
        label={t('nameFinnish')}
        name="nameFi"
        autoComplete="off"
        maxLength={limits.name}
        value={finnish}
        onChange={(event) => {
          setFinnish(event.target.value)
          setErrors((current) => ({ ...current, nameFi: undefined }))
        }}
        error={errors.nameFi}
      />
      <div className="flex gap-4">
        <Button variant="primary" type="submit" disabled={pending}>
          {t('save')}
        </Button>
        <Button variant="secondary" disabled={pending} onClick={done}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  )
}

const actions = {
  create: addGenreAction,
  merge: mergeGenreAction,
  remove: deleteGenreAction,
}

/**
 * Settings → Genres, admin only (UX-DR50, 9.14): the system genres as a managed
 * list with Book counts and a "No Finnish name" mark, Edit for both names,
 * Add genre, Merge and Delete confirmed by dialogs, then Re-map genres.
 * Nothing here is undoable.
 */
export function GenresGroup({ items }: { items: readonly GenreItem[] }) {
  const t = useTranslations('settings')
  const router = useRouter()
  const report = useReportFailure()
  const { show } = useToast()
  const [pending, startTransition] = useTransition()

  const remap = () => {
    startTransition(async () => {
      const result = await settleAction(remapGenresAction())
      if (!result.ok) {
        report(result.code)
        return
      }
      show({ kind: 'success', message: t('genresRemapped', { n: result.data.updated }) })
      startTransition(() => router.refresh())
    })
  }

  return (
    <>
      <ManagedList<GenreItem>
        items={items}
        actions={actions}
        editor={{
          label: t('edit'),
          render: (genre, done) => <GenreEditor genre={genre} done={done} />,
        }}
        strings={{
          empty: t('genreEmpty'),
          add: t('addGenre'),
          count: ({ count }) => t('locationCount', { count }),
          mergeInto: ({ name }) => t.rich('tagMergeInto', { name, typed }),
          mergeTitle: (source, target) =>
            t.rich('tagMergeTitle', { source: source.name, target: target.name, typed }),
          mergeBody: (source, target) =>
            t('tagMergeBody', { count: source.count, target: target.name }),
          deleteTitle: ({ name }) => t.rich('deleteTitle', { name, typed }),
          deleteBody: ({ count }) => t('genreDeleteBody', { count }),
        }}
      />
      <div>
        <Button variant="secondary" disabled={pending} onClick={remap}>
          {t('remapGenres')}
        </Button>
      </div>
    </>
  )
}
