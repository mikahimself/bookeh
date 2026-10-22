'use client'

import { useEffect, useState } from 'react'

import type { Suggestion, SuggestField } from '@/lib/shelf/query'

import { fetchData } from './request'

/** The pause in typing before suggestions are asked for. */
const DELAY_MS = 250

type Answer = { field: SuggestField; q: string; suggestions: Suggestion[] }

/** One empty list, so a memo over the result holds while nothing is suggested. */
const NONE: Suggestion[] = []

/**
 * Spine, AD-7: `/data/suggest`'s names for `field` containing the trimmed
 * `text`, asked for once typing pauses. Only the answer for the current text
 * is returned: during the pause, and for an older text's late answer, the
 * list is empty. A failed request is an empty list, with no toast. Blank text
 * suggests nothing.
 */
export function useSuggestions(field: SuggestField, text: string): Suggestion[] {
  const [answer, setAnswer] = useState<Answer | null>(null)
  const q = text.trim()

  useEffect(() => {
    if (!q) return
    let current = true
    const timer = setTimeout(() => {
      void fetchData<Suggestion[]>(`/data/suggest?${new URLSearchParams({ field, q })}`).then(
        (result) => {
          if (current) setAnswer({ field, q, suggestions: result.ok ? result.data : [] })
        },
      )
    }, DELAY_MS)
    return () => {
      current = false
      clearTimeout(timer)
    }
  }, [field, q])

  return answer?.q === q && answer.field === field ? answer.suggestions : NONE
}
