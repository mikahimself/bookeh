'use client'

import { useTranslations } from 'next-intl'
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'

import type { ErrorCode } from '@/lib/errors'

import { Button } from '../components/Button'
import { ProgressLine } from '../components/ProgressLine'
import { TextField } from '../components/TextField'

import { saveManualAction } from './actions'
import { AnswerBack } from './AnswerBack'
import { useAddToLibrary } from './useAddToLibrary'

/**
 * The Not found Answer's form: Title (focused; Enter moves to Author) and
 * Author (Enter submits), then Add to library above Back. The text goes as
 * typed with the ISBN, if any; the service checks it, and a missing or too
 * long title or author shows its message under the field (the field's code:
 * `VALIDATION` is the required message, `TOO_LONG` "Too long."), the text
 * kept and the first marked field focused. The save, toast and return are
 * Add to library's (`useAddToLibrary()`). No `required`: the browser's own
 * bubbles would show instead.
 */
export function NotFoundForm({ isbn13, title }: { isbn13: string | null; title: string }) {
  const t = useTranslations()
  const { pending, add } = useAddToLibrary()
  const titleField = useRef<HTMLInputElement>(null)
  const authorField = useRef<HTMLInputElement>(null)
  const [marks, setMarks] = useState<{ title?: ErrorCode; author?: ErrorCode }>({})

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setMarks({})
    const typed = {
      title: titleField.current?.value ?? '',
      author: authorField.current?.value ?? '',
    }
    add(
      (requestId) =>
        saveManualAction(
          isbn13 === null ? { requestId, ...typed } : { requestId, isbn13, ...typed },
        ),
      (failure) => {
        if (failure.code !== 'VALIDATION' || !failure.fields) return false
        const marked = { title: failure.fields.title, author: failure.fields.authors }
        if (marked.title === undefined && marked.author === undefined) return false
        setMarks(marked)
        // Back to the field to fix, with the keyboard up.
        const field = marked.title === undefined ? authorField : titleField
        field.current?.focus()
        return true
      },
    )
  }

  const message = (
    code: ErrorCode | undefined,
    required: 'answer.titleRequired' | 'answer.authorRequired',
  ) => (code === undefined ? undefined : t(code === 'TOO_LONG' ? 'errors.TOO_LONG' : required))

  const nextOnEnter = (event: KeyboardEvent<HTMLInputElement>) => {
    // The Enter that confirms an IME composition is not a move.
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    authorField.current?.focus()
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-6">
      {pending && <ProgressLine label={t('progress.loading')} />}
      <div className="flex flex-col gap-4">
        <TextField
          ref={titleField}
          name="title"
          label={t('answer.title')}
          defaultValue={title}
          error={message(marks.title, 'answer.titleRequired')}
          autoFocus
          enterKeyHint="next"
          onKeyDown={nextOnEnter}
        />
        <TextField
          ref={authorField}
          name="author"
          label={t('answer.author')}
          error={message(marks.author, 'answer.authorRequired')}
          enterKeyHint="go"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Button variant="primary" type="submit" disabled={pending}>
          {t('answer.addToLibrary')}
        </Button>
        <AnswerBack label={t('answer.back')} />
      </div>
    </form>
  )
}
