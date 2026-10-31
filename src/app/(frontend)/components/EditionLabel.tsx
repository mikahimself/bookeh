import { Cover } from './Cover'

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
