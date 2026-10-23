'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useLocale, useTranslations } from 'next-intl'
import {
  createContext,
  use,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

import { languageName } from '@/lib/books/languageName'
import { parseShelfQuery, shelfHref, type FilterValues, type SuggestField } from '@/lib/shelf/query'

import { useTaskBack } from '../components/navigation'
import { useSuggestions } from '../components/suggest'
import { markerSlotClass } from '../components/ui/classes'
import { Combobox, type ComboboxOption } from '../components/ui/Combobox'
import { useWide } from '../components/ui/overlay'
import { Sheet } from '../components/ui/Sheet'

import { toggleFilter, type ListedField, type ListedValue } from './filterToggle'

/**
 * Wide but under 1200px: room for one side panel, so Filter and Book detail
 * exclude each other (EXPERIENCE.md, Responsive).
 */
export const ONE_PANEL_QUERY = '(900px <= width < 1200px)'

function subscribeOnePanel(onChange: () => void): () => void {
  const query = window.matchMedia(ONE_PANEL_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

/** Whether only one side panel fits; `false` on the server and during hydration. */
function useOnePanel(): boolean {
  return useSyncExternalStore(
    subscribeOnePanel,
    () => window.matchMedia(ONE_PANEL_QUERY).matches,
    () => false,
  )
}

type FilterPanelState = { open: boolean; toggle: () => void; close: () => void }

const FilterPanelContext = createContext<FilterPanelState | null>(null)

/** The Filter panel's open state, from `FilterPanelProvider`. */
export function useFilterPanel(): FilterPanelState {
  const state = use(FilterPanelContext)
  if (!state) throw new Error('useFilterPanel needs a FilterPanelProvider')
  return state
}

/**
 * Whether the Filter panel is open: local state, neither in the address nor
 * a device preference. At 900–1199px it and Book detail exclude each other:
 * opening Filter while `?book=` is set closes Book detail as its own X does
 * (`useTaskBack`), and `book` appearing or changing while Filter is open
 * closes Filter.
 */
export function FilterPanelProvider({ children }: { children: ReactNode }) {
  const params = useSearchParams()
  const onePanel = useOnePanel()
  const { query, book } = parseShelfQuery(params)
  const closeBook = useTaskBack(shelfHref(query), true)
  const [open, setOpen] = useState(false)
  const [seenBook, setSeenBook] = useState(book)
  if (book !== seenBook) {
    setSeenBook(book)
    if (open && book !== null && onePanel) setOpen(false)
  }

  const state: FilterPanelState = {
    open,
    toggle: () => {
      if (open) {
        setOpen(false)
        return
      }
      setOpen(true)
      if (book !== null && onePanel) closeBook()
    },
    close: () => setOpen(false),
  }
  return <FilterPanelContext value={state}>{children}</FilterPanelContext>
}

/**
 * The Filter panel (EXPERIENCE.md, Filter panel): from 900px plain layout
 * left of the list, under it the bottom sheet. `values` are the server
 * render's `filterValues()`; `null` when that read failed, leaving the panel
 * without lists. `labels` are the server render's `ShelfRows.labels`; the
 * panel reads only their `author:` and `series:` names.
 */
export function FilterPanel({
  values,
  labels,
}: {
  values: FilterValues | null
  labels: Record<string, string>
}) {
  const t = useTranslations('collection')
  const wide = useWide()
  const { open, close } = useFilterPanel()

  if (wide) {
    return open ? (
      <aside aria-label={t('filter')} className="w-filter-width shrink-0 pb-6">
        {values && <OptionLists values={values} labels={labels} />}
      </aside>
    ) : null
  }
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
      label={t('filter')}
    >
      <div className="flex flex-col gap-4">
        <h2 className="text-heading-group ui-case">{t('filter')}</h2>
        {values && <OptionLists values={values} labels={labels} />}
      </div>
    </Sheet>
  )
}

type Option = { key: string; label: string; count: number; on: boolean; tap: () => void }

/**
 * Location, status, read, genre and language as option lists of the values
 * in use, then author, series and publisher as comboboxes with short lists;
 * those only for a viewer with copies. A tap replaces the address at once,
 * keeping search, sort, the other fields and `book`. Until the address
 * reaches the last tap, the next tap builds on it, so quick taps add up. Once
 * it does, or the address goes somewhere no tap wrote (Clear, Back), the
 * address counts again.
 */
function OptionLists({ values, labels }: { values: FilterValues; labels: Record<string, string> }) {
  const t = useTranslations('collection')
  const locale = useLocale()
  const router = useRouter()
  const params = useSearchParams()
  const address = params.toString()
  /** The addresses of the taps not yet reached, after the one the first was made on. */
  const [pending, setPending] = useState<string[]>([])
  const last = pending.at(-1)
  if (last !== undefined && (address === last || !pending.includes(address))) setPending([])
  const waiting = last !== undefined && address !== last && pending.includes(address)
  const built = waiting ? last : address
  // Held while the address stands, so the short lists' values keep their identity.
  const { query, book } = useMemo(() => parseShelfQuery(new URLSearchParams(built)), [built])
  const f = query.filters

  const tap =
    <F extends ListedField>(field: F, value: ListedValue<F>) =>
    () => {
      const href = shelfHref(toggleFilter(query, field, value), { book })
      const to = new URL(href, 'http://shelf').searchParams.toString()
      setPending(waiting ? [...pending, to] : [address, to])
      router.replace(href, { scroll: false })
    }
  const collator = new Intl.Collator(locale)
  const languages = values.language
    .map(({ value, count }) => ({ value, count, name: languageName(value, locale) }))
    .sort((a, b) => collator.compare(a.name, b.name))

  return (
    <div className="flex flex-col gap-4">
      <Field
        heading={t('filterFields.location')}
        options={values.location.map(({ id, name, count }) => ({
          key: String(id),
          label: name,
          count,
          on: f.location?.includes(id) ?? false,
          tap: tap('location', id),
        }))}
      />
      <Field
        heading={t('filterFields.status')}
        options={values.status.map(({ value, count }) => ({
          key: value,
          label: t(`filterValues.${value}`),
          count,
          on: f.status?.includes(value) ?? false,
          tap: tap('status', value),
        }))}
      />
      <Field
        heading={t('filterFields.read')}
        options={values.read.map(({ value, count }) => ({
          key: String(value),
          label: t(value ? 'filterValues.read' : 'filterValues.unread'),
          count,
          on: f.read === value,
          tap: tap('read', value),
        }))}
      />
      <Field
        heading={t('filterFields.genre')}
        options={values.genre.map(({ id, name, count }) => ({
          key: String(id),
          label: name,
          count,
          on: f.genre?.includes(id) ?? false,
          tap: tap('genre', id),
        }))}
      />
      <Field
        heading={t('filterFields.language')}
        options={languages.map(({ value, count, name }) => ({
          key: value,
          label: name,
          count,
          on: f.language?.includes(value) ?? false,
          tap: tap('language', value),
        }))}
      />
      {values.status.length > 0 &&
        (['author', 'series', 'publisher'] as const).map((field) => (
          <AddedValues
            key={field}
            field={field}
            on={f[field] ?? NONE}
            labels={labels}
            tap={(value) => tap(field, value)()}
          />
        ))}
    </div>
  )
}

type AddedValue = number | string

const NONE: AddedValue[] = []

/**
 * EXPERIENCE.md, Filter panel: a combobox over `/data/suggest` for a field
 * with too many values to list, and under it the values that are on, in
 * address order. Choosing a suggestion adds it, tapping a listed value
 * removes it; both through `tap`. A suggestion's value is its id, or a
 * publisher's name. An id is named by `labels`, or until the server render
 * brings that by the suggestion chosen here; an id named by neither is not
 * listed.
 */
function AddedValues({
  field,
  on,
  labels,
  tap,
}: {
  field: SuggestField
  on: readonly AddedValue[]
  labels: Record<string, string>
  tap: (value: AddedValue) => void
}) {
  const t = useTranslations('collection')
  const [text, setText] = useState('')
  const [chosen, setChosen] = useState<Record<string, string>>({})
  const suggestions = useSuggestions(field, text)
  const offered = useMemo(
    () => suggestions.filter((s) => !on.includes(s.id ?? s.name)),
    [suggestions, on],
  )
  // Positional ids: publishers have none of their own.
  const options = useMemo<ComboboxOption[]>(
    () => offered.map(({ name }, i) => ({ id: i, label: name })),
    [offered],
  )
  const nameOf = (value: AddedValue): string | undefined =>
    typeof value === 'string' ? value : (labels[`${field}:${value}`] ?? chosen[value])

  return (
    <div className="flex flex-col">
      {/* `value` stays null: Base UI empties the text once the popup closes. */}
      <Combobox
        label={t(`filterFields.${field}`)}
        options={options}
        value={null}
        create={false}
        onInputValueChange={setText}
        onValueChange={(next) => {
          const suggestion = typeof next === 'number' ? offered[next] : undefined
          if (!suggestion) return
          setText('')
          if (suggestion.id !== null) setChosen({ ...chosen, [suggestion.id]: suggestion.name })
          tap(suggestion.id ?? suggestion.name)
        }}
      />
      {on.map((value) => {
        const name = nameOf(value)
        return name === undefined ? null : (
          <OptionLine
            key={value}
            label={name}
            on
            aria-label={t('filterRemove', { name })}
            onClick={() => tap(value)}
          />
        )
      })}
    </div>
  )
}

/**
 * DESIGN.md, Option list: the field's heading, then one value per line in
 * `body`, its count after it in `text-muted`; a value that is on is `text`
 * with the 8px accent marker. Nothing when the field has no values in use.
 */
function Field({ heading, options }: { heading: string; options: Option[] }) {
  const id = useId()
  if (options.length === 0) return null
  return (
    <div role="group" aria-labelledby={id} className="flex flex-col">
      <h3 id={id} className="text-heading-group text-text-muted ui-case">
        {heading}
      </h3>
      {options.map(({ key, label, count, on, tap }) => (
        <OptionLine key={key} label={label} count={count} on={on} aria-pressed={on} onClick={tap} />
      ))}
    </div>
  )
}

/**
 * One value line: `body`, `text-muted` with its count after it; when on,
 * `text` with the 8px accent marker. A 44px tap.
 */
function OptionLine({
  label,
  count,
  on,
  onClick,
  ...aria
}: {
  label: string
  count?: number
  on: boolean
  onClick: () => void
  'aria-pressed'?: boolean
  'aria-label'?: string
}) {
  return (
    <button
      type="button"
      {...aria}
      onClick={onClick}
      className={`flex min-h-tap items-center gap-2 text-left text-body ${
        on ? 'text-text' : 'text-text-muted'
      }`}
    >
      <span aria-hidden="true" className={on ? `${markerSlotClass} bg-accent` : markerSlotClass} />
      <span className="min-w-0 truncate">{label}</span>
      {count !== undefined && <span className="text-text-muted">{count}</span>}
    </button>
  )
}
