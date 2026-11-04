// Hardcover catalogue reads. The credential never enters a URL or a logged error.
import { toIsbn13 } from '@/fields/isbn'

import type { SearchHit, Source, SourceResult } from '../source'
import { clean, compact, isObject, list, lookupFailed, sourceFailed, type Json } from './shared'

const LABEL = 'Hardcover'
const ENDPOINT = 'https://api.hardcover.app/v1/graphql'
const MAX_RESULTS = 20
const LOOKUP_TIMEOUT_MS = 10_000
// Search is two sequential requests under lookup.ts's 4 s per-source budget.
const SEARCH_REQUEST_TIMEOUT_MS = 1_800

const EDITION_FIELDS = `id book_id isbn_13 title subtitle physical_format pages release_date publisher { name } image { url } book { title description contributions { contributor_role_id author { name } } }`
export const HARDCOVER_LOOKUP_QUERY = `query HardcoverIsbn($isbn: String!) { editions(where: { isbn_13: { _eq: $isbn } }) { ${EDITION_FIELDS} } }`
export const HARDCOVER_SEARCH_QUERY = `query HardcoverSearch($query: String!) { search(query: $query, query_type: "Book", per_page: 20) { results } }`

/** One top-level field keeps the request inside Hardcover's burst limit. Each work gets
 * the full result budget; hit construction then interleaves works in search relevance order. */
export function hardcoverEditionsRequest(ids: number[]): { query: string; variables: Json } {
  return {
    query: `query HardcoverEditions($ids: [Int!]!) { books(where: { id: { _in: $ids } }) { id editions(where: { isbn_13: { _is_null: false } }, limit: ${MAX_RESULTS}, order_by: { users_count: desc }) { ${EDITION_FIELDS} } } }`,
    variables: { ids },
  }
}

export function hardcoverToken(
  env: Readonly<Record<string, string | undefined>> = process.env,
): string | undefined {
  return env.HARDCOVER_API_TOKEN?.trim() || undefined
}

export async function hardcoverPost(
  query: string,
  variables: Json,
  subject: Json,
  action: string,
  timeoutMs = LOOKUP_TIMEOUT_MS,
): Promise<unknown> {
  const token = hardcoverToken()
  if (!token) return sourceFailed(LABEL, action, subject, 'HARDCOVER_API_TOKEN is not set')
  let response: Response
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch {
    return sourceFailed(LABEL, action, subject, 'network error or timeout')
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => {})
    const authorizationFailure = response.status === 401 || response.status === 403
    return sourceFailed(
      LABEL,
      action,
      authorizationFailure && action === 'search' ? {} : subject,
      authorizationFailure
        ? `HTTP ${response.status}; renew HARDCOVER_API_TOKEN with read:catalog scope`
        : `HTTP ${response.status}`,
    )
  }
  try {
    const body: unknown = await response.json()
    if (!isObject(body) || (Array.isArray(body.errors) && body.errors.length > 0))
      return sourceFailed(LABEL, action, subject, 'GraphQL response error')
    return body
  } catch {
    return sourceFailed(LABEL, action, subject, 'response is not JSON')
  }
}

function editionFields(
  edition: Json,
): Omit<SourceResult, 'isbn13' | 'source' | 'recordId' | 'raw'> | undefined {
  const book = isObject(edition.book) ? edition.book : {}
  const title = clean(edition.title) ?? clean(book.title)
  if (!title) return undefined
  const publisher = isObject(edition.publisher) ? clean(edition.publisher.name) : undefined
  const image = isObject(edition.image) ? clean(edition.image.url) : undefined
  const coverUrl =
    image &&
    URL.canParse(image) &&
    new URL(image).protocol === 'https:' &&
    new URL(image).hostname === 'assets.hardcover.app'
      ? image
      : undefined
  const year = /^\d{4}/.exec(clean(edition.release_date) ?? '')
  const pages =
    typeof edition.pages === 'number' && Number.isInteger(edition.pages) && edition.pages > 0
      ? edition.pages
      : undefined
  const authors = [
    ...new Set(
      list(book.contributions)
        .filter(isObject)
        .filter((item) => item.contributor_role_id === 1)
        .flatMap((item) => (isObject(item.author) ? (clean(item.author.name) ?? []) : [])),
    ),
  ].map((name) => ({ name }))
  return {
    title,
    subtitle: clean(edition.subtitle),
    authors,
    publisher,
    binding: clean(edition.physical_format),
    year: year ? Number(year[0]) : undefined,
    pages,
    description: clean(book.description),
    subjects: [],
    themes: [],
    coverUrl,
  }
}

function validEdition(value: unknown): value is Json {
  return (
    isObject(value) &&
    (typeof value.id === 'number' || typeof value.id === 'string') &&
    Boolean(clean(String(value.id)))
  )
}

export function hardcoverResults(body: unknown, isbn13: string): SourceResult[] | undefined {
  if (!isObject(body) || !isObject(body.data) || !Array.isArray(body.data.editions))
    return lookupFailed(LABEL, isbn13, 'editions is not an array')
  return body.data.editions
    .filter(validEdition)
    .flatMap((edition) => {
      if (edition.isbn_13 !== isbn13) return []
      const fields = editionFields(edition)
      return fields
        ? [
            compact({
              ...fields,
              isbn13,
              source: 'hardcover',
              recordId: String(edition.id),
              raw: { hardcover: body },
            }),
          ]
        : []
    })
    .sort((a, b) => Number(Boolean(b.coverUrl)) - Number(Boolean(a.coverUrl)))
}

export function hardcoverSearchIds(body: unknown, query: string): number[] {
  const data = isObject(body) && isObject(body.data) ? body.data : undefined
  const search = data && isObject(data.search) ? data.search : undefined
  const results = search && isObject(search.results) ? search.results : undefined
  if (!results || !Array.isArray(results.hits)) {
    sourceFailed(LABEL, 'search', { query }, 'hits is not an array')
    return []
  }
  return [
    ...new Set(
      results.hits.flatMap((hit) => {
        const match =
          isObject(hit) && isObject(hit.text_match_info) ? hit.text_match_info : undefined
        // Typesense may drop most query tokens and return an unrelated numeric match. A Lookup
        // no-result fixture must stay a no-result across sources.
        if (!match || match.num_tokens_dropped !== 0) return []
        const document = isObject(hit) && isObject(hit.document) ? hit.document : undefined
        const id = document && Number(document.id)
        return id && Number.isSafeInteger(id) && id > 0 ? [id] : []
      }),
    ),
  ].slice(0, MAX_RESULTS)
}

export function hardcoverSearchHits(body: unknown, ids: number[], query: string): SearchHit[] {
  if (!isObject(body) || !isObject(body.data) || !Array.isArray(body.data.books)) {
    sourceFailed(LABEL, 'search', { query }, 'books is not an array')
    return []
  }
  const byBook = new Map<number, unknown[]>()
  for (const book of body.data.books) {
    if (!isObject(book) || !Number.isSafeInteger(book.id) || !Array.isArray(book.editions)) {
      sourceFailed(LABEL, 'search', { query }, 'book editions is not an array')
      continue
    }
    byBook.set(book.id as number, book.editions)
  }
  const hits = new Map<string, SearchHit>()
  // One edition from each relevant work before a second edition from any work.
  for (let editionIndex = 0; editionIndex < MAX_RESULTS; editionIndex++) {
    for (const id of ids) {
      const edition = (byBook.get(id) ?? []).filter(validEdition)[editionIndex]
      if (!edition) continue
      if (edition.book_id !== id) continue
      const isbn13 = typeof edition.isbn_13 === 'string' ? toIsbn13(edition.isbn_13) : undefined
      if (!isbn13 || edition.isbn_13 !== isbn13) continue
      const fields = editionFields(edition)
      if (!fields) continue
      const hit: SearchHit = {
        isbn13,
        title: fields.title,
        authors: fields.authors,
        source: 'hardcover',
        ...(fields.publisher && { publisher: fields.publisher }),
        ...(fields.year && { year: fields.year }),
        ...(fields.binding && { binding: fields.binding }),
        ...(fields.coverUrl && { coverUrl: fields.coverUrl }),
      }
      const previous = hits.get(isbn13)
      if (!previous) hits.set(isbn13, hit)
      else if (hit.coverUrl) previous.coverUrl ??= hit.coverUrl
      if (hits.size >= MAX_RESULTS) return [...hits.values()]
    }
  }
  return [...hits.values()]
}

export const hardcover: Source = {
  id: 'hardcover',
  async lookupByIsbn(isbn13) {
    const body = await hardcoverPost(HARDCOVER_LOOKUP_QUERY, { isbn: isbn13 }, { isbn13 }, 'lookup')
    return body === undefined ? undefined : hardcoverResults(body, isbn13)
  },
  async search(query) {
    const text = clean(query)
    if (!text) return []
    const searchBody = await hardcoverPost(
      HARDCOVER_SEARCH_QUERY,
      { query: text },
      { query: text },
      'search',
      SEARCH_REQUEST_TIMEOUT_MS,
    )
    if (searchBody === undefined) return []
    const ids = hardcoverSearchIds(searchBody, text)
    if (!ids.length) return []
    const editionsRequest = hardcoverEditionsRequest(ids)
    const editionsBody = await hardcoverPost(
      editionsRequest.query,
      editionsRequest.variables,
      { query: text },
      'search',
      SEARCH_REQUEST_TIMEOUT_MS,
    )
    return editionsBody === undefined ? [] : hardcoverSearchHits(editionsBody, ids, text)
  },
}
