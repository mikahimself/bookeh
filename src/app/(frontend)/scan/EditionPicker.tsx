'use client'

import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { useState, useTransition } from 'react'

import { Cover } from '../components/Cover'
import { ActionLink } from '../components/Link'
import { ProgressLine } from '../components/ProgressLine'
import { Picker } from '../components/ui/Picker'

/**
 * A candidate's row: its preview cover, if any, its title for the cover
 * placeholder, and its line from `editionLines()`, computed on the server.
 */
export type EditionRow = {
  cover: string | null
  title: string
  language: string | null
  line: string
}

/** An edition Picker row's label: the cover at Rows m beside the edition line. */
export function EditionLabel({ cover, title, language, line }: EditionRow) {
  return (
    <span className="flex items-center gap-3">
      <span className="w-cover-row shrink-0">
        <Cover src={cover} title={title} language={language} />
      </span>
      <span>{line}</span>
    </span>
  )
}

/**
 * EXPERIENCE.md, Answer, Several editions (D-7): "{n} editions found" under
 * the Book, opening a Picker of the candidates, each row a cover at Rows m
 * beside its edition line; the shown one carries the marker. Picking another
 * replaces the Answer's address with `&pick=<n>`, so Back still returns to
 * Scan; the server renders that candidate. Its data is the server-rendered
 * Answer's: nothing is asked from here. The progress line runs while the
 * picked Answer renders.
 */
export function EditionPicker({
  isbn13,
  pick,
  editions,
}: {
  isbn13: string
  pick: number
  editions: EditionRow[]
}) {
  const t = useTranslations()
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  const choose = (index: number) => {
    startTransition(() => {
      router.replace(`/scan?isbn=${encodeURIComponent(isbn13)}&pick=${index}`)
    })
  }

  return (
    <div>
      {pending && <ProgressLine label={t('progress.loading')} />}
      <ActionLink onClick={() => setOpen(true)}>
        {t('answer.editionsFound', { n: editions.length })}
      </ActionLink>
      <Picker<number>
        open={open}
        onOpenChange={setOpen}
        title={t('answer.editions')}
        value={pick}
        onChoose={choose}
        options={editions.map((row, index) => ({
          value: index,
          label: <EditionLabel {...row} />,
        }))}
      />
    </div>
  )
}
