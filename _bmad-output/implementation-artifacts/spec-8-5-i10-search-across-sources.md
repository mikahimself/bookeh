---
title: '8.5 [I10] Search across sources'
type: 'feature'
created: '2026-11-01'
status: 'done'
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

### 2026-11-01 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 10, false 10, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: `recordCoverPreview`'s doc and `coverPreview.ts`'s header said "Called by `lookupBook` and `lookupAgain` alone", which `searchBooks` falsified — verified at `coverPreview.ts:52`; both comments now name `searchBooks` and state that a search's `urls` is one element, so the route's `pick` resolves to index 0.
  - `[low]` `[reject]` Blind: one search can evict the cover-preview store (`PREVIEW_SIZE` 500, LRU across users), blanking an open Answer's previews — real but bounded far below the claimed hundreds (Finna asks `SEARCH_LIMIT = 20` records, Google `maxResults` 20; `limit=100` is the lookup URL), the only effect is one re-fetch of an evicted cover, and nothing calls `searchBooks` until Story 8.8. The fix is a cap parameter, which the reject rule excludes for a low. Carried into Residual risks for 8.8.
  - `[low]` `[reject]` Blind: `searchSources` returns an unbounded list, so Story 8.8 has no stated page size — the per-source requests bound it (20 + 20) and the decision is now stated in `searchSources`' JSDoc; adding a cap here would invent 8.8's page size.
  - `[low]` `[patch]` Blind: `searchSources` is an ordinary export, so a future caller could skip `limitLookups` and the cover record — no enforcement exists (as with `system()`, the guarantee is the module boundary); its JSDoc now says it is called by `searchBooks` alone, which owns the limit and the record.
  - `[low]` `[patch]` Blind: the spine's source-contract bullet still said only "`search` returns a list" while `source.ts` gained the cover-URL obligation on adapter authors — the bullet now carries the `coverUrl`, server-side clause.
  - `[low]` `[patch]` Blind: `SearchDraft` was declared in the spine's `src/lib/metadata` block although it is exported from `lib/catalogue` — moved under `type Draft` in the `// src/lib/catalogue` block, `SearchHit` left in place.
  - `[low]` `[reject]` Blind: the `epic-8-context.md` rewrite dropped "lookupAgain" from the rate-limit list and "from the desktop" — that file is generated: this run recompiled it because the spine was newer, which is the workflow's own step, not a story edit, and neither omission changes code or a spine rule.
  - `[low]` `[patch]` Blind: the new Google assertions exceeded `printWidth` 100 and repeated the same URL expression — `npx prettier --check tests/unit/google.unit.spec.ts` failed; a local `coverOf(volume)` helper now serves both new assertions and the pre-existing lookup one, and the file is prettier-clean.
  - `[low]` `[reject]` Blind: the test helpers recompute the adapters' cover-URL transforms instead of asserting the production builder — test-only, with no named breakage (the fixtures' own image paths are the input), and the convention rejects a finding that only asks for a different test.
  - `[low]` `[patch]` Blind: `serve`'s `search` closure carried a dead `'nosearch'` arm — a `nosearch` fake is pushed without a `search`, so the arm was unreachable; `serve` now returns early for it.
  - `[low]` `[reject]` Blind: the two cover cases drive `fetchCoverPreview` with `sharp` instead of spying on `recordCoverPreview` — they prove the criterion's own wording ("so `/data/cover/[isbn13]` can preview it") end to end, run in 18 ms with no network, and state is cleared per test; a thinner double would prove less.
  - `[false]` `[reject]` Blind: Story 8.4's deferral is consumed but not closed on the record — 8.4's `deferred` list is append-only by the workflow's own rule, and this spec's Intent cites it as the driver; its resolution is recorded under `## Auto Run Result` here.
  - `[low]` `[reject]` Edge: a search hit sharing an ISBN with the user's last lookup replaces that lookup's multi-candidate record, so `?pick=n` collapses to index 0 and held bytes are re-fetched — verified against `recordCoverPreview`; grouped with the eviction finding (same root: the per-user-and-ISBN record is shared and uncapped). Low: it needs a search for the same ISBN while an Answer is open, costs one re-fetch and a wrong picker thumbnail, and is unreachable until Story 8.8 wires a caller. Carried into Residual risks.
  - `[low]` `[reject]` Edge: up to ~40 preview entries per search evict the store — same root cause and reasoning as the Blind eviction row.
  - `[false]` `[reject]` Edge: `text` arriving non-string would throw a `TypeError` instead of answering `[]` — `searchBooks(ctx: Context, text: string)` is strict TS with `no-explicit-any`, and it has no caller yet; guarding a type the compiler forbids is the kind of branch the reject rule excludes.
  - `[false]` `[reject]` Edge: a source returning an unbounded hit list grows the merge map — same claim as the Blind unbounded-list row; the sources are this repo's own adapters and both cap their requests at 20.
  - `[low]` `[patch]` Edge: `recordCoverPreview`'s doc contract was not updated for its third caller — same finding as the first Blind row, patched with it.
  - `[low]` `[patch]` Verification gap (pre-verified, `Other findings`): the `coverPreview.ts` header and `recordCoverPreview` doc name only the lookup paths — patched with the rows above. The layer reported `No verification gaps found` for the change itself, having traced every `SearchHit`/`hasCover` consumer and run the three specs (127 tests).
  - `[low]` `[reject]` Verification gap (`Other findings`): the shared preview record and the uncapped hit list are one root cause, "worth a decision in 8.8 rather than here" — accepted as filed and carried into Residual risks; no code change here.
  - `[false]` `[reject]` Intent (a): six of seven behavioural clauses live in `lib/metadata`'s `searchSources`, not in the `lib/catalogue` function the criteria name — the layer itself records that the tests drive everything through `searchBooks`, so the named surface is the tested one, and the spine sentence was rewritten in the same commit, which is the convention for a layering change.
  - `[false]` `[reject]` Intent (b): the cover clause was met by replacing `hasCover` on a published type, which the criteria do not ask for — the criteria require the URL to be recorded server-side, and `SearchHit` carried no URL; the spine change is an acceptance criterion of this story. The epic-context line about "whether a cover exists" is in a generated file, regenerated from the planning docs, not a spine contract.
  - `[false]` `[reject]` Intent (c): `recordCoverPreview`'s doc and the shared-record interaction — the doc half is patched above; the interaction half is the rejected low carried into Residual risks.
  - `[false]` `[reject]` Intent (d): the cover tests stub `fetch` and build a JPEG rather than using fake sources alone — the criteria say tests use fake sources, which they do for the sources; proving the recorded URL needs the preview path, and no network is used.
  - `[false]` `[reject]` Intent (e): the `/data/cover/[isbn13]` handler is never exercised with a search-written record — the handler is unchanged and its per-user isolation is already covered by `tests/int/coverPreview.int.spec.ts`; an integration test for a route with no caller yet belongs to Story 8.8.
  - `[false]` `[reject]` Intent (f): `epic-8-context.md`'s editorial rewrite is out of scope — it is the workflow's own recompile of a stale generated file (the spine was newer), not a story edit.

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

## Auto Run Result

**Summary.** `searchBooks(ctx, text)` in `lib/catalogue` is the one search over all sources (FR-20, AD-9): blank text answers `[]` untouched, otherwise one `limitLookups(ctx)` — the limit it shares with `lookupBook` — then `searchSources(query)` in `lib/metadata`, which asks every source implementing `search` in parallel, each raced against `SOURCE_TIMEOUT_MS`, logs a timeout or a contract-breaking rejection and merges the lists in source order, one hit per ISBN-13 with a missing `coverUrl` filled from a later source's hit. Each hit's cover URL is recorded as that user's preview for the ISBN-13, so `/data/cover/[isbn13]` can serve it (AD-14), and the caller receives `SearchDraft[]` — the hit without its URL, plus `hasCover`. Nothing is written to the database and nothing is cached.

**Files changed.**
- `src/lib/metadata/source.ts` -- `SearchHit` carries `coverUrl?: string` in place of `hasCover`; the `Source` doc states that the URL stays server-side.
- `src/lib/metadata/sources/finna.ts`, `src/lib/metadata/sources/google.ts` -- `toHit` carries the cover URL it already computed; a duplicate ISBN fills a missing one.
- `src/lib/metadata/lookup.ts` -- `askSearch` (the per-source timeout race, mirroring `ask`) and `searchSources` (parallel, source-order merge, one hit per ISBN-13, never throws, no cache, no breaker).
- `src/lib/catalogue/searchBooks.ts` -- new: `SearchDraft`, `toSearchDraft`, `searchBooks`.
- `src/lib/catalogue/lookupLimit.ts`, `src/lib/catalogue/coverPreview.ts` -- comments record their new caller.
- `ARCHITECTURE-SPINE.md` -- AD-9's search rule and source contract, `SearchHit`, and `SearchDraft` in the `lib/catalogue` shapes.
- `tests/unit/searchBooks.unit.spec.ts` -- new, 14 cases over fake sources; `tests/unit/finnaSearch.unit.spec.ts`, `tests/unit/google.unit.spec.ts` -- `coverUrl` in place of `hasCover`.

**Review.** One pass, four layers, 25 findings (low 10, false 10 — no medium or high; the verification-gap layer reported no gaps). Patched 6, all low: the stale `recordCoverPreview` doc and file header (three layers, one root cause), `searchSources`' JSDoc gaining its caller rule and the no-cap decision, the spine's source-contract bullet, `SearchDraft`'s block in the spine, the dead `'nosearch'` arm in the test helper, and `tests/unit/google.unit.spec.ts`'s prettier failure (a `coverOf` helper). Deferred 0. Rejected 19, each with its refutation in the triage log; the substantive one is the shared, uncapped cover-preview record — a search can evict the store or replace a lookup's multi-candidate record for the same ISBN. It is real, costs one re-fetch and an index-0 picker thumbnail, and cannot be reached until Story 8.8 wires a caller, so it is carried below for that story's plan time rather than guarded here.

**Story 8.4's deferral is closed.** Its filed entry — `SearchHit` carries `hasCover` but no URL, so `searchBooks` cannot record a hit's cover — is resolved by this story's contract change; `recordCoverPreview` now has a search caller, which is what AD-12's "during a lookup or a search" required.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 6.

**Verification.**
- `npm run typecheck` -- clean.
- `npm run lint` -- 0 errors (60 pre-existing warnings, all unused args in migration files).
- `npm run test:unit` -- 88 files, 1227 tests, all passing, including the 14 new `searchBooks` cases. No network in any lane. (An earlier run showed one failure in `tests/unit/suggest.unit.spec.ts`, a jsdom `waitFor` timing flake unrelated to this story; it passes on re-run.)
- `npx prettier --check` -- clean across all ten touched files.
- Matrix audit: all 14 rows covered by tests that ran and passed.
- No screen change, so no Playwright walk: nothing renders a `SearchDraft` until Story 8.8.

**Residual risks.**
- The cover-preview store is shared per user and ISBN-13 and neither the hit list nor the recording is capped. A search records one entry per hit with a cover (up to about 40, with Finna at 20 records and Google at 20 volumes), so repeated searches can LRU-evict live records out of `PREVIEW_SIZE` (500), and a hit for an ISBN the user just looked up replaces that lookup's candidate URLs with one element, collapsing `?pick=n` to index 0. Story 8.8 should settle the page size and whether a search records at all for an ISBN that already has a lookup record.
- `searchSources` is exported and only a comment keeps callers out; the rate limit and the cover record live in `searchBooks`, so a future direct caller would bypass both.
- Shares `src/lib/metadata/lookup.ts`, `src/lib/metadata/source.ts`, both adapters and the spine with any parallel Epic 8 story; the `SearchHit` change touches every consumer of a hit, while `lookupBook`'s `Draft.hasCover` is untouched.
- `sprint-status.yaml` is not updated here; mark `8-5-i10-search-across-sources: done`.
