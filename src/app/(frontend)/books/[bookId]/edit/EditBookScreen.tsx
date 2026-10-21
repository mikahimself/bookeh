'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from 'react'

import type { Named } from '@/lib/books/effectiveBook'
import type { LocationOption } from '@/lib/copies/locations'
import type { ErrorCode } from '@/lib/errors'

import { Button } from '../../../components/Button'
import { Cover } from '../../../components/Cover'
import { FullScreenTask } from '../../../components/FullScreenTask'
import { useCloseTask } from '../../../components/navigation'
import { ProgressLine } from '../../../components/ProgressLine'
import { settleAction, useReportFailure } from '../../../components/request'
import { useToast } from '../../../components/toast/ToastProvider'
import { Dialog } from '../../../components/ui/Dialog'
import { useCloseOnBack } from '../../../components/ui/overlay'

import { editBookAction } from './actions'
import { CopyFields, type CopyChange } from './CopyFields'
import { clearDraft, isEmpty, readDraft, setEdit, writeDraft, type Draft } from './draft'
import { MoreDetails, type EffectiveEdits, type OnEdit } from './MoreDetails'
import type { SavedCopy } from './savedCopy'

const subscribeNothing = () => () => undefined
const onClient = () => true
const onServer = () => false

/**
 * Edit book (EXPERIENCE.md, Edit book): the cover beside the title, the
 * author and source lines under it, and Save pinned at the bottom, the one
 * primary.
 *
 * Opened for one of the viewer's copies (`copy`, from the save toast's
 * Edit), the first screen shows that copy's Status and Location
 * (CopyFields) between the header and More details.
 *
 * The draft is the sparse `BookEdits` of unsaved changes, with the copy's
 * sparse change under `copy`, restored from `sessionStorage` once mounted
 * (draft.ts; a restored `copy` for another copy is dropped) and state from
 * the first edit on. More details' fields change it with `setEdit(draft,
 * key, value, effective)`, so it holds only keys that differ from the
 * `effective` values, the copy fields with `setEdit(draft, 'copy', change)`,
 * and every change is written through `writeDraft`; it drives `dirty` and
 * the guard. The fields show the `marks` a rejected Save left under them
 * (the copy's `location` under its combobox); editing a field clears its
 * mark.
 *
 * Save sends the draft (`editBookAction`), `copy` apart from the Book's
 * `edits`: "Saved", the draft cleared and the task closed (history back, so
 * Scan when opened from its toast; `/` fallback), unless the task has already
 * gone. A signed-out session goes to sign in and keeps the draft; with the
 * guard armed, only once its entry is gone, so sign in replaces the task's
 * own entry and the return lands on it; a `VALIDATION` naming fields keeps the marks;
 * every failure is reported and the task stays.
 *
 * With changes, X and Back ask "Discard changes?". Back is guarded by one
 * same-URL entry above the task's own (`useCloseOnBack`): Back pops it and
 * opens the dialog, which disarms the guard; Cancel re-arms it once the
 * dialog's own entry is gone, so a second Back asks again. Discard clears the
 * draft and closes the task, stepping over a guard entry still there (the X)
 * from the task's base (layout.tsx). Before any close, `leaving` is set so
 * the guard's own `popstate` is no question.
 */
export function EditBookScreen({
  bookId,
  title,
  authors,
  source,
  cover,
  effective,
  isbnEditable,
  genreOptions,
  genres,
  themes,
  copy,
  locations,
}: {
  bookId: number
  title: string
  /** Joined ", ". */
  authors: string
  /** "From {source}", or `null` with no or an unknown source. */
  source: string | null
  cover: string | null
  /** The `BookEdits` values as the viewer sees the Book. */
  effective: EffectiveEdits
  isbnEditable: boolean
  /** The system genres to choose from; `null` when the viewer may not change them. */
  genreOptions: Named[] | null
  genres: Named[]
  themes: string[]
  /** The copy the screen was opened for (`?copy=`); `null` shows no copy fields. */
  copy: SavedCopy | null
  /** The viewer's locations, for the copy's Location. */
  locations: readonly LocationOption[]
}) {
  const t = useTranslations()
  const { show } = useToast()
  const reportFailure = useReportFailure()
  const closeTask = useCloseTask()
  const mounted = useSyncExternalStore(subscribeNothing, onClient, onServer)
  // Read once mounted: the server has no `sessionStorage`, and a hydrating
  // render must match its HTML.
  const restored = useMemo<Draft>(() => {
    if (!mounted) return {}
    const stored = readDraft(bookId)
    if (stored.copy === undefined || stored.copy.id === copy?.id) return stored
    const { copy: _other, ...rest } = stored
    return rest
  }, [mounted, bookId, copy?.id])
  const [edits, setEdits] = useState<Draft | null>(null)
  const draft = edits ?? restored
  // Per key, the code of a field Save had rejected.
  const [marks, setMarks] = useState<Record<string, ErrorCode>>({})
  const [asking, setAsking] = useState(false)
  const [armed, setArmed] = useState(true)
  const [pending, startTransition] = useTransition()
  const inFlight = useRef(false)
  const leaving = useRef(false)
  const discarding = useRef(false)
  /** The X's close while its dialog is open; `null` when Back opened it. */
  const closeFromX = useRef<(() => void) | null>(null)
  /** Signed out on Save: reported once the guard's entry is gone. */
  const signedOut = useRef(false)
  /** Still mounted: a Save answered after Discard has left closes nothing. */
  const alive = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const dirty = !isEmpty(draft)
  const { copy: copyChange, ...bookEdits } = draft

  const update = (next: Draft, mark: string) => {
    setEdits(next)
    writeDraft(bookId, next)
    if (marks[mark] !== undefined) {
      const { [mark]: _cleared, ...rest } = marks
      setMarks(rest)
    }
  }

  const edit: OnEdit = (key, value) => update(setEdit(draft, key, value, effective[key]), key)
  const editCopy = (change: CopyChange | undefined) =>
    update(setEdit(draft, 'copy', change, undefined), 'location')

  const guarding = dirty && armed
  useCloseOnBack(
    guarding,
    () => {
      if (leaving.current) return
      closeFromX.current = null
      setArmed(false)
      setAsking(true)
    },
    () => {
      if (!signedOut.current) return
      signedOut.current = false
      reportFailure('UNAUTHENTICATED')
    },
  )

  const onClose = (close: () => void) => {
    if (!dirty) {
      close()
      return
    }
    closeFromX.current = close
    setAsking(true)
  }

  const onDialogClosed = () => {
    if (discarding.current) {
      discarding.current = false
      leaving.current = true
      clearDraft(bookId)
      const close = closeFromX.current ?? (() => closeTask(null))
      closeFromX.current = null
      close()
      return
    }
    if (!leaving.current) setArmed(true)
  }

  const save = () => {
    if (inFlight.current) return
    inFlight.current = true
    startTransition(async () => {
      try {
        const result = await settleAction(
          editBookAction({ bookId, edits: bookEdits, copy: copyChange }),
        )
        if (!result.ok && result.code === 'UNAUTHENTICATED' && guarding) {
          leaving.current = true
          signedOut.current = true
          setArmed(false)
          return
        }
        if (!result.ok) {
          setMarks(result.code === 'VALIDATION' && result.fields ? result.fields : {})
          reportFailure(result.code)
          return
        }
        leaving.current = true
        clearDraft(bookId)
        show({ kind: 'success', message: t('toast.saved') })
        if (alive.current) closeTask(null)
      } finally {
        // Latched once saved: a tap before the task is gone would save again.
        if (!leaving.current) inFlight.current = false
      }
    })
  }

  return (
    <FullScreenTask
      title={t('editBook.heading')}
      onClose={onClose}
      foot={
        <>
          {pending && <ProgressLine label={t('progress.loading')} />}
          <Button variant="primary" onClick={save} disabled={pending}>
            {t('editBook.save')}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-4">
        <div className="w-cover-detail shrink-0">
          <Cover src={cover} title={title} />
        </div>
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-heading-detail break-words text-text">{title}</h2>
          {authors !== '' && <p className="text-body text-text">{authors}</p>}
          {source !== null && <p className="text-meta text-text-muted">{source}</p>}
        </div>
      </div>
      {copy !== null && (
        <CopyFields
          saved={copy}
          locations={locations}
          value={copyChange}
          error={marks.location === undefined ? undefined : t('editBook.checkField')}
          onChange={editCopy}
        />
      )}
      <MoreDetails
        effective={effective}
        draft={bookEdits}
        marks={marks}
        isbnEditable={isbnEditable}
        genreOptions={genreOptions}
        genres={genres}
        themes={themes}
        onEdit={edit}
      />
      <Dialog
        open={asking}
        onOpenChange={setAsking}
        title={t('editBook.discardTitle')}
        confirm={
          <Button
            variant="destructive"
            onClick={() => {
              discarding.current = true
              setAsking(false)
            }}
          >
            {t('editBook.discard')}
          </Button>
        }
        onClosed={onDialogClosed}
      />
    </FullScreenTask>
  )
}
