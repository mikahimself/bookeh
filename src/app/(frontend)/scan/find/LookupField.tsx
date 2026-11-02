'use client'

import { useTranslations } from 'next-intl'
import { useRouter } from 'next/navigation'
import { useRef, useTransition, type FormEvent } from 'react'

import { buttonClass } from '../../components/Button'
import { ProgressLine } from '../../components/ProgressLine'
import { TextField } from '../../components/TextField'

/**
 * EXPERIENCE.md, Lookup: one field for a title or an author, searched on Go
 * (not as you type). Go pushes `/scan/find?q=<trimmed text>` in a transition, with the
 * progress line while the server searches; the push, not a replace, is what
 * lets Back on a result's Answer land on the results. An empty field submits
 * nothing. Without JS the field still submits as a GET form.
 *
 * `q` is the text in the address, kept in the field.
 */
export function LookupField({ q }: { q: string }) {
  const t = useTranslations()
  const router = useRouter()
  const field = useRef<HTMLInputElement>(null)
  const [pending, startTransition] = useTransition()

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // Trimmed, so the address, the field and the search the page runs agree:
    // one search is one address.
    const text = (field.current?.value ?? '').trim()
    if (!text) return
    startTransition(() => {
      router.push(`/scan/find?q=${encodeURIComponent(text)}`)
    })
  }

  return (
    <>
      {pending && <ProgressLine label={t('progress.loading')} />}
      <form action="/scan/find" onSubmit={submit}>
        <TextField
          // A new address resets the field to its text.
          key={q}
          ref={field}
          name="q"
          label={t('lookup.field')}
          defaultValue={q}
          enterKeyHint="search"
          autoComplete="off"
          action={
            <button type="submit" className={buttonClass('secondary', { compact: true })}>
              {t('lookup.submit')}
            </button>
          }
        />
      </form>
    </>
  )
}
