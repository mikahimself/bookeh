---
title: '8.5 [I10] Search across sources'
type: 'feature'
created: '2026-11-01'
status: 'in-progress'
baseline_revision: '72706fab12ea466aa6e46d42543117ffa1603795'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Finna and Google Books each implement `search(query)` (Stories 8.3, 8.4) but nothing calls them: Lookup by title or author (Story 8.8) has no entry point, and a hit's cover URL is thrown away inside the adapters, so `/data/cover/[isbn13]` cannot preview a search result (AD-14's "recorded … during a lookup or a search", Story 8.4's filed deferral).

**Approach:** Add `searchBooks(ctx, text)` to `lib/catalogue` — the shared per-user rate limit, then a parallel `searchSources(query)` in `lib/metadata` that asks every source's `search` under the lookup timeout and merges the lists in source order, one hit per ISBN-13. A hit carries the source's `coverUrl` (replacing `hasCover` on the `SearchHit` contract, a spine change this story makes), `searchBooks` records those URLs for the preview route and returns the client shape with `hasCover`, mirroring `lookupBook`'s `Draft`.

## Boundaries & Constraints

**Always:**
- `SearchHit` (the source contract, `src/lib/metadata/source.ts`) carries `coverUrl?: string` in place of `hasCover`; both adapters set it from the `coverUrl` they already compute, and a duplicate ISBN-13 fills a missing `coverUrl` the way it used to raise `hasCover`. The spine's `SearchHit` and AD-9's search rule are updated in the same commit.
- `searchSources(query)` in `src/lib/metadata/lookup.ts`: asks every source in `sources/index.ts` that implements `search` in parallel, each raced against `SOURCE_TIMEOUT_MS` with a logged warning naming the source and the query on timeout; a source that rejects (a contract breach) is one logged warning and `[]`. Merges in source order, keeps the first hit per ISBN-13 and fills that hit's missing `coverUrl` from a later source's hit for the same ISBN. Drops a hit without an `isbn13`. Never throws. Writes nothing, caches nothing.
- `searchBooks(ctx, text)` in `src/lib/catalogue/searchBooks.ts`: `limitLookups(ctx)` once per call before any source is asked (so `RATE_LIMITED` surfaces with no request made), then `searchSources`. For every hit with a `coverUrl` it calls `recordCoverPreview(ctx, isbn13, [coverUrl])`, so `/data/cover/[isbn13]` can serve it; it returns `SearchDraft[]` — the hit without `coverUrl`, plus `hasCover` — in merge order.
- A blank or whitespace-only `text` returns `[]` with no rate-limit count and no source call.
- Tests use fake sources through `vi.mock('@/lib/metadata/sources')`, the pattern `tests/unit/lookup.unit.spec.ts` already uses. No network in any lane.

**Never:**
- No screen, no route, no server action, no message-catalogue entry: `/scan/find` and the two result groups are Stories 8.6 and 8.8. Nothing renders a `SearchDraft` in this story.
- No in-process cache of search results, and no circuit breaker: the spine states neither for search (a cache by query was proposed in planning and left out of AD-9), and `search` has no failure signal to track — it answers with a list either way. `lookupSources`' cache, breaker and `ask()` behaviour are untouched.
- No change to `lookupByIsbn`, `lookupBook`, `Draft`, `toDraft`, `clipCandidate`, `recordCoverPreview`'s signature or body, `lookupLimit.ts`'s counting rules, or the `/data/cover/[isbn13]` handler.
- No `search` on the fixture source: the e2e shop check (Story 8.10) owns that, and the fixture source is the only source under `BOOKEH_SOURCES=fixture`, so `searchBooks` simply returns `[]` there.
- No new cover host allowlist entry, no cover download, no migration, no integration or e2e test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Both sources answer | A returns hits for ISBNs 1, 2; B for 3 | three drafts, order 1, 2, 3 (source order, then each source's own order) | — |
| Same ISBN from both | A returns ISBN 1 without a cover; B returns ISBN 1 with one | one draft for ISBN 1, `source` A's, `hasCover: true`, and A's title kept | — |
| Cover recorded | A returns ISBN 1 with `coverUrl` | `recordCoverPreview` called with `(ctx, '…1', [url])`; `fetchCoverPreview` then serves that URL | — |
| No cover | every hit without `coverUrl` | no `recordCoverPreview` call for them; drafts have `hasCover: false` | — |
| Source order with a gap | A returns `[]`, B returns hits | B's hits, in B's order | — |
| A source without `search` | one fake implements `search`, one does not | only the implementing source is asked; its hits returned | — |
| One source times out | A hangs past `SOURCE_TIMEOUT_MS`, B answers | B's hits after the timer runs out; one warning naming A and the query | no throw |
| A source rejects | A's `search` rejects | B's hits; one warning naming A and the query | no throw |
| Every source fails | both hang or reject | `[]` | two warnings, no throw |
| Nothing found | both return `[]` | `[]` | — |
| Hit without an ISBN-13 | a fake returns a hit whose `isbn13` is `''` | dropped | — |
| Blank text | `searchBooks(ctx, '   ')` | `[]`, no source asked, no lookup counted | — |
| Rate limited | `LOOKUP_LIMIT` already spent in the window | throws `DomainError('RATE_LIMITED')`, no source asked | the thrown domain error |
| Counts once | one `searchBooks` call over two sources | the user's lookup count rises by 1 | — |

</intent-contract>

## Code Map

- `src/lib/metadata/source.ts:29-32` -- `SearchHit = Pick<SourceResult, 'isbn13' | 'title' | 'authors' | 'publisher' | 'year' | 'binding' | 'source'> & { hasCover: boolean }`: `hasCover` becomes `coverUrl?: string`. `:44-65` the `Source` doc (`search` resolves a list, never throws) — extend the `search` sentence to say the hit carries the source's cover URL, which only the server sees.
- `src/lib/metadata/lookup.ts:10` -- `SOURCE_TIMEOUT_MS` (4 s, inside NFR-1's 5 s budget), to reuse. `:88-108` `ask(source, isbn13)`: the exact timeout/race/reject-logging shape to mirror for a search (`Promise.race` with a `setTimeout` resolving `undefined`, `clearTimeout` in `finally`, a `logger().warn` per timeout and per rejection). `:112-156` `lookupSources`: the parallel `Promise.all` over `sources` and the source-order handling to mirror. Cache (`:33-62`), breaker (`:64-86`) and `heldOutcome` (`:45-47`) stay untouched — a search uses none of them.
- `src/lib/metadata/sources/index.ts` -- `sources`, in merge order (`[finna, google]`, or `[fixture]` under `BOOKEH_SOURCES=fixture`). The array `searchSources` iterates; `fixture` has no `search`, which is the "source without search" matrix row.
- `src/lib/metadata/sources/finna.ts:341-352` -- `toHit(result, hasCover)`: take the URL instead (`...(result.coverUrl !== undefined && { coverUrl: result.coverUrl })`) and drop the second parameter. `:386-389` the dedup — `seen.hasCover ||= cover` becomes `seen.coverUrl ??= result.coverUrl`. Nothing else in the file changes.
- `src/lib/metadata/sources/google.ts:179-194` -- `toHit(volume)`: `hasCover: coverUrl(info) !== undefined` becomes the conditional `coverUrl` spread. `:244-249` the dedup — same `??=` change.
- `src/lib/catalogue/lookupBook.ts:18-22` -- `Draft = Omit<SourceResult, 'raw' | 'coverUrl'> & { hasCover: boolean }` and `:56-60` `toDraft`: the precedent `SearchDraft` mirrors (the server holds the URL; the client sees only `hasCover`). Read-only.
- `src/lib/catalogue/coverPreview.ts:55-88` -- `recordCoverPreview(ctx, isbn13, urls)`: keyed per user and ISBN-13, bounded to `PREVIEW_SIZE` (500) with LRU eviction, `PREVIEW_TTL_MS` 1 h, and it *forgets* the entry when every URL is undefined — so call it only for a hit that has a URL. A one-element array is the search's record; `fetchCoverPreview`'s `pick` then resolves to index 0. Read-only.
- `src/lib/catalogue/lookupLimit.ts:11,39` -- the two comments that say "`searchBooks` (I10) must call it too when it arrives": update both to state that it does, once per call. `limitLookups(ctx)` throws `DomainError('RATE_LIMITED')`.
- `tests/unit/lookup.unit.spec.ts:19-20,39-52` -- `vi.hoisted` fake array + `vi.mock('@/lib/metadata/sources')`, and `serve(...answers)` installing fakes with ids A, B, …; `:57` the `logger()` warn spy; fake timers for the timeout cases. The harness to copy for `searchSources`.
- `tests/unit/finnaSearch.unit.spec.ts` (9 `hasCover` assertions) and `tests/unit/google.unit.spec.ts` (5) -- the only other `hasCover` users to update; `src/app/(frontend)/scan/answer.ts`, `tests/unit/answer.unit.spec.ts`, `tests/int/lookupBook.int.spec.ts` and `tests/int/pickEdition.int.spec.ts` use `Draft.hasCover` and must stay unchanged.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:178` -- AD-9's `searchBooks` rule (merge in source order, one hit per ISBN-13, drops hits without one, writes nothing): extend with the timeout, the `searchSources` split and the recorded cover URL. `:403` the `SearchHit` type. `:181` the shared rate limit (already names `searchBooks`; no change). `:226` AD-14's recorded-URL sentence (already correct; no change).
- `_bmad-output/planning-artifacts/epics.md:3519-3533` -- Story 8.5's acceptance criteria, the source of the rules above.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/source.ts` -- swap `hasCover` for `coverUrl?: string` on `SearchHit` and extend the `search` contract doc -- the adapters already compute the URL and `searchBooks` cannot record it otherwise.
- `src/lib/metadata/sources/finna.ts`, `src/lib/metadata/sources/google.ts` -- carry `coverUrl` through `toHit` and fill a missing one from a later duplicate -- the contract change, kept to one hunk per adapter.
- `src/lib/metadata/lookup.ts` -- add `searchSources(query)`: parallel `search` calls under `SOURCE_TIMEOUT_MS`, logged timeout and rejection, merge in source order, one hit per ISBN-13 with `coverUrl` gap-filled, hits without an ISBN dropped -- the story's merge behaviour, beside the lookup machinery it mirrors.
- `src/lib/catalogue/searchBooks.ts` -- new: `SearchDraft`, `toSearchDraft` and `searchBooks(ctx, text)` (blank guard, `limitLookups`, `searchSources`, `recordCoverPreview` per hit with a URL, drafts in merge order) -- the entry point Story 8.8 calls.
- `src/lib/catalogue/lookupLimit.ts` -- update the two "must call it when it arrives" comments to record that `searchBooks` counts one per call -- the file is the rate limit's documentation.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- update AD-9's `searchBooks` rule and the `SearchHit` shape -- a story that changes a spine contract updates the spine in the same commit.
- `tests/unit/searchBooks.unit.spec.ts` -- new: every I/O matrix row over fake sources, with a stub for `recordCoverPreview`/`limitLookups` assertions -- the story's criteria name the merge, the recording and the shared limit.
- `tests/unit/finnaSearch.unit.spec.ts`, `tests/unit/google.unit.spec.ts` -- replace the `hasCover` assertions with `coverUrl` ones (URL present, absent, and filled from a duplicate) -- the adapters' contract changed.

**Acceptance Criteria:**
- Given fake sources A and B whose `search` resolves hits, when `searchBooks(ctx, 'tove')` runs, then it resolves drafts in source order with one entry per ISBN-13, each carrying `isbn13`, `title`, `authors`, `publisher`, `year`, `binding`, `source` and `hasCover`, and no `coverUrl` property.
- Given a hit whose `coverUrl` is set, when `searchBooks` runs, then `recordCoverPreview` has been called for that ISBN-13 with that single URL, so `fetchCoverPreview(ctx, isbn13)` resolves the fetched bytes for it; and given hits without a cover, then no record is written for them.
- Given a source whose `search` hangs past `SOURCE_TIMEOUT_MS` or rejects, when `searchBooks` runs, then it resolves the other source's hits, logs one warning naming the source and the query, and never throws.
- Given `text` that is blank after trimming, when `searchBooks` runs, then it resolves `[]`, no source is asked and the user's lookup count is unchanged.
- Given the user has spent `LOOKUP_LIMIT` in the current window, when `searchBooks` runs, then it throws `DomainError('RATE_LIMITED')` before any source is asked; and given one successful call over two sources, then the count rises by exactly 1.
- Given the spine, when the commit lands, then AD-9's `searchBooks` rule and the `SearchHit` shape describe `coverUrl`, `searchSources` and the per-source timeout.
- Given `npm run typecheck`, `npm run lint` and `npm run test:unit`, when they run, then all pass, with no network in any lane and `lookupBook`'s `Draft.hasCover` behaviour unchanged.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why `coverUrl` replaces `hasCover` on the contract rather than joining it.** The two carry the same fact, and a hit holding both would let them disagree. The lookup path already solved this: `SourceResult.coverUrl` stays on the server and `Draft` is the client shape with `hasCover`. Search gets the same split:

```ts
export type SearchDraft = Omit<SearchHit, 'coverUrl'> & { hasCover: boolean }
export const toSearchDraft = ({ coverUrl, ...rest }: SearchHit): SearchDraft => ({
  ...rest,
  hasCover: coverUrl !== undefined,
})
```

so AD-14 holds by construction: the only way a browser reaches a search cover is `/data/cover/[isbn13]`.

**Why the timeout and merge live in `lib/metadata`.** `searchSources` sits beside `lookupSources` because the per-source race is the same mechanism, and `lib/metadata` is where the sources array is read. `searchBooks` keeps what needs a `Context`: the rate limit and the cover-preview record. The spine line is updated to match rather than left to drift.

**Why no cache and no breaker.** Free-text queries repeat far less than ISBNs, so a query cache would hold mostly misses while hiding a source that came back; the per-user rate limit is what protects the sources. The breaker counts `lookupByIsbn`'s `undefined` failures, and `search` has no such signal — folding search into it would make a search outcome depend on lookup history, which no criterion asks for.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including the new `searchBooks` spec and the adjusted Finna/Google search specs.

**Manual checks (if no CLI):**
- No screen change, so no Playwright walk: nothing renders a `SearchDraft` until Story 8.8.
