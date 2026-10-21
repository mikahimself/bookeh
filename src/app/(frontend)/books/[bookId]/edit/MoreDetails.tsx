'use client'

import { useTranslations } from 'next-intl'
import { useId, useState } from 'react'

import type { Named } from '@/lib/books/effectiveBook'
import type { BookEdits } from '@/lib/catalogue/editBook'
import type { ErrorCode } from '@/lib/errors'

import { ActionLink } from '../../../components/Link'
import { TextAreaField, TextField } from '../../../components/TextField'
import { markerSlotClass } from '../../../components/ui/classes'

import { isEmpty } from './draft'

/**
 * Every `BookEdits` key's value as the viewer sees the Book: author and
 * series names, genre ids sorted ascending. `isbn13` is absent on a Book
 * without one, so an emptied ISBN field matches it.
 */
export type EffectiveEdits = Required<Omit<BookEdits, 'isbn13'>> & Pick<BookEdits, 'isbn13'>

export type OnEdit = <K extends keyof BookEdits>(key: K, value: BookEdits[K]) => void

type Props = {
  effective: EffectiveEdits
  /** The draft's Book edits, without its `copy`. */
  draft: BookEdits
  /** Per key, the code of a field Save rejected. */
  marks: Record<string, ErrorCode>
  isbnEditable: boolean
  /** The system genres to choose from; `null` when the viewer may not change them. */
  genreOptions: Named[] | null
  /** The Book's system genres, shown when they are read-only. */
  genres: Named[]
  themes: string[]
  onEdit: OnEdit
}

/**
 * EXPERIENCE.md, Edit book, More details: a Link that unfolds the fields in
 * place, open from the start when the restored draft holds changes. Each
 * field shows the draft's value, or the effective one, and hands every change
 * to `onEdit` as its `BookEdits` value: text `''` is `null` (a title stays
 * `''`), an emptied ISBN `undefined`, number fields keep digits only, authors
 * are the non-blank trimmed names of their rows, genres the chosen ids sorted
 * ascending. Read-only genres and themes are lines, absent when empty.
 */
export function MoreDetails(props: Props) {
  const t = useTranslations('editBook')
  const [unfolded, setUnfolded] = useState(false)
  // Unfolded by the Link, whose focus moves to Title; a restored draft's unfold takes none.
  const [byLink, setByLink] = useState(false)

  // Only reachable while unfolded, so an edit back to an empty draft keeps it open.
  if (!unfolded && isEmpty(props.draft)) {
    return (
      <div>
        <ActionLink
          onClick={() => {
            setByLink(true)
            setUnfolded(true)
          }}
        >
          {t('moreDetails')}
        </ActionLink>
      </div>
    )
  }
  return (
    <Fields
      {...props}
      focusTitle={byLink}
      onEdit={(key, value) => {
        setUnfolded(true)
        props.onEdit(key, value)
      }}
    />
  )
}

type TextKey = 'subtitle' | 'series' | 'publisher' | 'language' | 'description'
type NumberKey = 'seriesIndex' | 'year' | 'pages'

const ascending = (a: number, b: number) => a - b

function Fields({
  effective,
  draft,
  marks,
  isbnEditable,
  genreOptions,
  genres,
  themes,
  onEdit,
  focusTitle,
}: Props & { focusTitle: boolean }) {
  const t = useTranslations()
  const genresLabel = useId()
  // Local, so a blank row being typed into stays; only the names go into the draft.
  const [rows, setRows] = useState<string[]>(() => {
    const names = draft.authors ?? effective.authors
    return names.length > 0 ? [...names] : ['']
  })
  const [focusRow, setFocusRow] = useState<number | null>(null)
  // Local, so an emptied ISBN stays empty: its `undefined` leaves the draft.
  const [isbn, setIsbn] = useState(() => draft.isbn13 ?? effective.isbn13 ?? '')

  const shown = (key: 'title' | TextKey | NumberKey): string => {
    const value = Object.hasOwn(draft, key) ? draft[key] : effective[key]
    return value === null || value === undefined ? '' : String(value)
  }

  const message = (key: keyof BookEdits): string | undefined => {
    const code = marks[key]
    if (code === undefined) return undefined
    if (code === 'INVALID_ISBN') return t('errors.INVALID_ISBN')
    if (code === 'TOO_LONG') return t('errors.TOO_LONG')
    return t('editBook.checkField')
  }

  const text = (key: TextKey) => ({
    label: t(`editBook.field.${key}`),
    value: shown(key),
    error: message(key),
    onChange: ({ target }: { target: { value: string } }) =>
      onEdit(key, target.value === '' ? null : target.value),
  })

  const number = (key: NumberKey) => ({
    label: t(`editBook.field.${key}`),
    value: shown(key),
    error: message(key),
    inputMode: 'numeric' as const,
    maxLength: 9,
    onChange: ({ target }: { target: { value: string } }) => {
      const digits = target.value.replace(/\D/g, '')
      onEdit(key, digits === '' ? null : Number(digits))
    },
  })

  const setRow = (index: number, name: string) => {
    const next = rows.map((row, at) => (at === index ? name : row))
    setRows(next)
    onEdit(
      'authors',
      next.map((row) => row.trim()).filter((row) => row !== ''),
    )
  }

  const chosen = new Set(draft.genres ?? effective.genres)
  const toggle = (id: number) => {
    const next = new Set(chosen)
    if (!next.delete(id)) next.add(id)
    onEdit('genres', [...next].sort(ascending))
  }

  return (
    <div className="flex flex-col gap-4">
      <TextField
        label={t('editBook.field.title')}
        value={shown('title')}
        error={message('title')}
        autoFocus={focusTitle}
        onChange={({ target }) => onEdit('title', target.value)}
      />
      <TextField {...text('subtitle')} />
      <div className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <TextField
            key={index}
            label={t('editBook.field.author')}
            value={row}
            error={index === 0 ? message('authors') : undefined}
            autoFocus={index === focusRow}
            onChange={({ target }) => setRow(index, target.value)}
          />
        ))}
        <div>
          <ActionLink
            onClick={() => {
              setFocusRow(rows.length)
              setRows([...rows, ''])
            }}
          >
            {t('editBook.addAuthor')}
          </ActionLink>
        </div>
      </div>
      <TextField {...text('series')} />
      <TextField {...number('seriesIndex')} />
      <TextField {...text('publisher')} />
      <TextField {...number('year')} />
      <TextField {...text('language')} />
      <TextField {...number('pages')} />
      <TextAreaField {...text('description')} />
      {isbnEditable && (
        <TextField
          label={t('editBook.field.isbn')}
          value={isbn}
          error={message('isbn13')}
          onChange={({ target }) => {
            setIsbn(target.value)
            onEdit('isbn13', target.value === '' ? undefined : target.value)
          }}
        />
      )}
      {genreOptions !== null ? (
        <div className="flex flex-col gap-1">
          <p id={genresLabel} className="text-label text-text-muted">
            {t('editBook.field.genres')}
          </p>
          <div role="group" aria-labelledby={genresLabel} className="flex flex-col">
            {genreOptions.map(({ id, name }) => {
              const on = chosen.has(id)
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(id)}
                  className={`flex items-center gap-2 text-left text-body max-wide:min-h-tap ${
                    on ? 'text-text' : 'text-text-muted'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={on ? `${markerSlotClass} bg-accent` : markerSlotClass}
                  />
                  {name}
                </button>
              )
            })}
          </div>
          {marks.genres !== undefined && <p className="text-meta">{message('genres')}</p>}
        </div>
      ) : (
        <Line label={t('editBook.field.genres')} values={genres.map(({ name }) => name)} />
      )}
      <Line label={t('editBook.field.themes')} values={themes} />
    </div>
  )
}

/** A read-only value list: its label above, the values joined ", "; nothing when empty. */
function Line({ label, values }: { label: string; values: string[] }) {
  if (values.length === 0) return null
  return (
    <div className="flex flex-col gap-1">
      <p className="text-label text-text-muted">{label}</p>
      <p className="text-body text-text">{values.join(', ')}</p>
    </div>
  )
}
