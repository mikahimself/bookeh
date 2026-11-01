---
title: '8.4 [I5] Google Books search'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_revision: 'a21f5b55d9a6343ceca16987bff11044afc772c3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      `SearchHit` carries `hasCover` but no cover URL, so `searchBooks` has no way to record a hit's
      source cover URL for `/data/cover/[isbn13]`.
    evidence: |-
      The spine (AD-12, line 226) says the cover route serves "the source cover URL the server recorded
      for that ISBN during a lookup or a search", and Story 8.5's criteria say `searchBooks` "records each
      hit's cover URL server-side". The spine's `SearchHit` (line 403) is `Pick<SourceResult, 'isbn13' |
      'title' | 'authors' | 'publisher' | 'year' | 'binding' | 'source'> & { hasCover: boolean }` — no URL —
      and Story 8.4's criteria say the adapter returns `SearchHit`s, so the adapter cannot hand one over
      without changing a spine contract this story's criteria do not name. The adapter computes the URL
      (via `coverUrl()`) to decide `hasCover`, so the value exists and is thrown away.
    location: >-
      src/lib/metadata/source.ts:31
    severity: low
  - summary: >-
      Nothing pins the shape of a failed `lookupByIsbn` log, so the `getJson` / `getSearchJson`
      reporter wiring could be swapped without a test noticing.
    evidence: |-
      The verification-gap layer wired `getJson` to `searchFailed` and all 129 lookup tests
      (`tests/unit/google.unit.spec.ts`, `tests/unit/finna.unit.spec.ts`) stayed green: both assert
      only that the call resolves `undefined` and `warn` fired once, never the payload key or the
      message. Every source-outage line would then read "search failed" with the ISBN under `query`.
      One assertion — `expect(logged(warn.mock.calls)).toContain('<isbn>')` — closes it; this story's
      criteria say `lookupByIsbn`'s existing tests stay unchanged, so it belongs to whichever story
      next touches that test.
    location: >-
      tests/unit/google.unit.spec.ts:425
    severity: low
  - summary: >-
      The failure path logs the raw error as `{ err }`, and pino's serializer may print a URL that
      carries `key=` for some undici errors.
    evidence: |-
      `searchFailed` and `lookupFailed` both pass `{ err }` through (`shared.ts`), and pino prints
      message, stack and cause. The tests only reject with a synthetic `TypeError('fetch failed')`
      and an error named `TimeoutError`, neither of which carries a URL, so the "never logs the key"
      promise is unproven for real failures. `getJson` has always done this, so this is not caused by
      Story 8.4. What would settle it: capture a real undici failure (DNS, TLS, redirect) against
      googleapis.com and check whether the URL appears in `err.message`, `err.stack` or `err.cause`.
    location: >-
      src/lib/metadata/sources/shared.ts:90
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** `Source.search?(query)` is declared in the contract (`src/lib/metadata/source.ts:65`) but no source implements it, so Lookup by title or author has nothing to call. Google Books must be searchable so books Finna does not list are still found (FR-20, AD-9).

**Approach:** Implement `search(query)` on the Google adapter: one `volumes?q=<text>` request through the shared logged fetch, each volume mapped to a `SearchHit` with the fields the contract names, volumes without a usable ISBN dropped, one hit per ISBN-13 in Google's relevance order, and `[]` — never a throw — when Google fails or answers nothing. The shared fetch helper gains a search-shaped sibling so a failure is logged with the query instead of an ISBN.

## Boundaries & Constraints

**Always:**
- `search(query)` returns `SearchHit[]`: `isbn13`, `title`, `authors` (the adapter's existing "Given Family" mapping with `sortName`), `publisher`, `year`, `source: 'google'`, `hasCover`. A field Google does not give is left out, never a placeholder.
- A volume's ISBN-13 is the first of its `industryIdentifiers` that normalises through `toIsbn13()`, `ISBN_13` entries before `ISBN_10` ones. A volume with no identifier that normalises (none, an ISSN, an `OTHER` id) is dropped, as is one without a title.
- One hit per ISBN-13: the first volume with that ISBN wins, and Google's relevance order is otherwise preserved (no cover-first re-sort — that is `lookupByIsbn`'s rule, where every record is the same book).
- `hasCover` is true exactly when the existing `coverUrl()` yields a URL, so a hit claims a cover only where `/data/cover/[isbn13]` could later serve one.
- `binding` is always absent: Google Books states no binding (`printType` is BOOK/MAGAZINE, not a binding).
- Never throws and never rejects: a network error, timeout, non-2xx status, non-JSON body, non-object body or non-array `items` gives `[]` after one logged warning that carries the query and no URL or API key. A blank query returns `[]` with no request made.
- The request is `https://www.googleapis.com/books/v1/volumes?q=<query>&printType=books&maxResults=20`, with `key` added only when `GOOGLE_BOOKS_API_KEY` is set, read at call time like `googleUrl()` does.
- Tests run against the recorded volume fixtures in `tests/fixtures/google/volumes/` composed into a `books#volumes` body, the way `tests/unit/google.unit.spec.ts` already tests `lookupByIsbn`. No network call in any lane.

**Never:**
- No change to `lookupByIsbn`, its matching, ordering or logging, and no change to `finna.ts` — Finna's `search` is Story 8.3's, built in parallel.
- No change to the `Source`, `SearchHit` or `SourceResult` types, no new field on them, and so no spine contract change: this story implements a method the spine already declares (spine lines 175, 403).
- No caller: `searchBooks(ctx, text)`, the merge across sources, the per-user rate limit, the cover recording and the Lookup page are Stories 8.5, 8.6 and 8.8. Nothing imports `google.search` when this story lands.
- No new fixture capture, no change to `scripts/capture-fixtures.ts`, `tests/fixtures/isbns.txt` or `tests/fixtures/REPORT.md`: the report describes the ISBN-lookup capture, and search fixtures are not part of it.
- No integration or e2e test, no screen, no message catalogue entry, no migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full volume | `search('a game of thrones')`, body with `3Wf_ffkFQmgC` | one hit: ISBN-13 `9780007448036`, title, `[{ name: 'George R. R. Martin' }]`, publisher `Harper Voyager`, year 2011, `hasCover: true`, `source: 'google'`, no `binding` | — |
| Sparse volume | body with `D-Py0AEACAAJ` (no cover, no page count) | one hit with `hasCover: false`; `publisher`/`year` present as recorded | — |
| Inverted author | recorded volume with `authors: ['Martin, George R. R.']` | hit's author is `{ name: 'George R. R. Martin', sortName: 'Martin, George R. R.' }` | — |
| ISBN-10 only | recorded volume with its `ISBN_13` entry removed | one hit whose `isbn13` is the converted 13-digit form | — |
| No usable ISBN | volumes with `industryIdentifiers` removed, and with only `{ type: 'ISSN', identifier: '03178471' }` | both dropped; `[]` with no warning | — |
| No title | recorded volume with `title` removed | dropped | — |
| Same ISBN twice | the same volume twice, second copy with a different `id` | one hit | — |
| Different editions | `DWvlNEkUDPUC` and `GzENB4wePpEC` (two ISBNs, same title) | two hits, in body order | — |
| Order kept | three volumes, the one with a cover last | hits in body order, cover-bearing hit last | — |
| Nothing found | `{ kind: 'books#volumes', totalItems: 0 }` (no `items`) | `[]` | no warning |
| Blank query | `search('   ')` | `[]`, `fetch` never called | no warning |
| Google fails | HTTP 429 / 403 / 503, fetch rejects, body not JSON, body not an object, `items` not an array | `[]` | one `warn` per call, carrying the query, never the key or URL |
| Key handling | `GOOGLE_BOOKS_API_KEY` set, then unset | `key` present in the first request only; `q`, `printType=books`, `maxResults=20` in both | — |

</intent-contract>

## Code Map

- `src/lib/metadata/sources/google.ts` -- the adapter. `:19-24` `googleUrl()`, the pattern for the key read at call time; `:28-33` `hasIsbn()` reads `industryIdentifiers` through `toIsbn13` (the ISBN rule to reuse, not to duplicate); `:36-53` `authors()`, `:55-58` `year()`, `:99-120` `coverUrl()` — all reusable as they are; `:122-141` `toResult()`, the shape to mirror for `toHit()`; `:145-156` `fetchBody()`, the body guards to mirror; `:158-172` the exported `google` object, where `search` is added.
- `src/lib/metadata/source.ts:31-34` -- `SearchHit` (`Pick<SourceResult, 'isbn13' | 'title' | 'authors' | 'publisher' | 'year' | 'binding' | 'source'> & { hasCover: boolean }`); `:44-65` the `Source` doc, which already states that `search` resolves a list and never throws. Read-only: no type change in this story.
- `src/lib/metadata/sources/shared.ts:47-52` -- `compact()`, typed `(result: SourceResult) => SourceResult`; widen to `<T extends object>(value: T) => T` so a hit can drop its undefined fields (one-line signature change, no behaviour change, both adapters keep compiling). `:58-70` `lookupFailed()`; `:74-100` `getJson(label, url, isbn13)`, whose third argument is only a log field — keep its signature and add a search sibling beside it so `finna.ts` is untouched.
- `src/lib/metadata/sources/finna.ts` -- read-only. Story 8.3 adds Finna's `search` in parallel; do not edit this file or reorder `sources/index.ts`.
- `tests/unit/google.unit.spec.ts` -- the conventions to follow: `volume(id)` reads a recorded fixture, `searchBody(items)` wraps them as `books#volumes`, `serve(body)`/`fetchMock(impl)` stub `fetch`, `requested(mock)` inspects URLs, `logged()` proves the key never reaches the log, and edge cases are recorded fixtures with one field edited. New `describe('google.search')` blocks go in this file.
- `tests/fixtures/google/volumes/` -- 20 recorded `books#volume` records, every one with both ISBN types: `3Wf_ffkFQmgC` (A Game of Thrones, cover, categories), `DWvlNEkUDPUC` + `GzENB4wePpEC` (two editions of A Storm of Swords), `D-Py0AEACAAJ` (sparse, no cover), `MF11zQEACAAJ` (Finnish, no cover).
- `_bmad-output/planning-artifacts/epics.md:3506-3517` -- Story 8.4's acceptance criteria, verbatim source of the rules above.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:175` -- the source contract (optional `search`, no throw, `binding` display-only); `:178` `searchBooks`' merge, one hit per ISBN-13 (Story 8.5); `:226` the cover route's recorded URL (see `deferred`); `:403` `SearchHit`. All read-only.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/sources/shared.ts` -- widen `compact()` to a generic `<T extends object>`; extract `getJson`'s body into one private request helper taking a failure callback, and export `getSearchJson(label, url, query)` and `searchFailed(label, query, reason, details?)` (returning `[]`) beside the lookup pair -- a search has no ISBN to log, and the fetch/timeout/status/JSON handling must not be duplicated.
- `src/lib/metadata/sources/google.ts` -- add `searchUrl(query)`, `searchIsbn13(info)`, `toHit(volume)` and `search(query)` on the exported source -- the story's one behaviour.
- `tests/unit/google.unit.spec.ts` -- add `describe('google.search')` and a failure `describe` covering every I/O matrix row -- the story's criteria name this behaviour.

**Acceptance Criteria:**
- Given the recorded volume fixtures composed into a `books#volumes` body, when `google.search(query)` runs, then it resolves `SearchHit`s whose `isbn13`, `title`, `authors`, `publisher`, `year`, `source` and `hasCover` match the records, with `binding` absent for every hit.
- Given a volume whose only ISBN is an `ISBN_10` entry, when `search` runs, then its hit's `isbn13` is the converted 13-digit form; and given a volume with no identifier that normalises through `toIsbn13`, then no hit is produced for it.
- Given two volumes in one response with the same ISBN-13, when `search` runs, then one hit is returned; and given volumes with different ISBN-13s, then one hit each, in the order Google sent them.
- Given any failure from Google (network error, timeout, non-2xx, non-JSON, non-object body, `items` not an array), when `search` runs, then it resolves `[]`, never rejects, and logs exactly one warning that contains the query and neither the request URL nor `GOOGLE_BOOKS_API_KEY`'s value.
- Given a query that is blank after trimming, when `search` runs, then it resolves `[]` and no request is made.
- Given `GOOGLE_BOOKS_API_KEY` set and then unset, when `search` runs, then the request is `https://www.googleapis.com/books/v1/volumes` with `q` the query, `printType=books` and `maxResults=20`, and `key` present only while the variable is set.
- Given `npm run typecheck`, `npm run lint` and `npm run test:unit`, when they run, then all pass with no network access in any test, and `lookupByIsbn`'s existing tests are unchanged.

## Spec Change Log

## Review Triage Log

### 2026-11-01 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 8, false 7, maybe-false 1
- findings:
  - `[low]` `[defer]` Blind: `toHit` computes the cover URL only to collapse it to `hasCover`, while AD-12 has the cover route serve a URL recorded "during a lookup or a search" — verified: `recordCoverPreview()` has only `lookupBook` and `lookupAgain` as callers, so nothing records a search's URL today. Adding `coverUrl` to `SearchHit` is a spine contract change this story's criteria do not name, and Story 8.5's criteria already carry the obligation; the `deferred` entry stands as its plan-time input.
  - `[low]` `[reject]` Blind: dedup keeps the first volume for an ISBN, so a later duplicate carrying `imageLinks` cannot raise `hasCover` — real but cosmetic (a placeholder instead of a thumbnail in one Lookup row), it needs Google to send a cover-less stub ahead of the fuller record for the same ISBN, and the fix adds a comparison branch; `[patch]` requires a fix that adds no branch for undemonstrated state.
  - `[false]` `[reject]` Blind: the spec has no Residual risks section naming `shared.ts` as shared with Story 8.3 — the fix is an edit to this build's spec, which triage rejects by rule; the shared file is named under `## Auto Run Result` → Residual risks, where this story's record lives.
  - `[low]` `[patch]` Blind: the search failure table had no timeout case although the criteria name timeout and the refactor moved the timeout plumbing into `request` — added a row rejecting with an error whose `name` is `'TimeoutError'`, run through the table's `[]`, one-warning, query-present, no-key assertions.
  - `[low]` `[patch]` Blind: nothing proved a hit leaves out a field Google did not send, the one reason `compact` was widened — added a case from `3Wf_ffkFQmgC` with `publisher` and `publishedDate` deleted, asserting the hit has neither property.
  - `[low]` `[patch]` Blind: every fixture's `ISBN_10` normalises to the same ISBN-13, so `searchIsbn13`'s two-pass preference was indistinguishable from one pass — added a case whose `ISBN_10` entry is another fixture's ISBN-10, asserting the `ISBN_13` entry wins.
  - `[low]` `[patch]` Blind: `googleUrl` and `searchUrl` each hard-coded the volumes endpoint and repeated the key read — extracted `volumesUrl(params)`, both now one-liners over it, key still read at call time.
  - `[low]` `[reject]` Blind: the body guards are duplicated between `fetchBody` and `search`, and `'google'` appears in three places — collapsing them rewires `lookupByIsbn`'s request path, which the intent contract's Never list excludes from this story; the `'google'` triplication is cosmetic with no named harm.
  - `[low]` `[patch]` Blind: the two new describes sat between the `lookupByIsbn` describes — moved to the end of the file, so each method's tests are contiguous.
  - `[low]` `[patch]` Blind: three small test gaps — `drops a volume without a title` lacked its sibling's `warn` assertion (added), "unset key" was modelled as `''` rather than an absent variable (now `vi.stubEnv(…, undefined)`, exercising the `?.trim()` guard), and `title?: string` loosened the test-local `Volume` type for every lookup test (type restored, one cast at the `delete` site).
  - `[low]` `[defer]` Blind (relayed note, same claim as the verification-gap finding below): the lookup failure tests never assert the log payload, so the `getJson`/`getSearchJson` reporter wiring could be swapped unnoticed — deferred on the gap layer's filed disposition; see that row.
  - `[low]` `[reject]` Edge: dedup first-wins can report `hasCover: false` and drop fields a duplicate carried — grouped with the second Blind row above (same root cause), rejected for the same reason.
  - `[low]` `[reject]` Edge: when every volume lacks a normalising ISBN the result is a silent `[]`, with no paging and no dropped-count log — dropping those volumes is the story's stated rule, ISBN-less volumes are a minority of `printType=books` results, and the proposed guard adds paging (`startIndex`) that no criterion asks for.
  - `[low]` `[defer]` Edge: `hasCover: true` would 404 at `/data/cover/[isbn13]` because no search records a preview — verified against `coverPreview.ts`; same root cause as the first Blind row and carried by the same `deferred` entry. No consumer exists yet (nothing imports `search`), so no user meets it in this story.
  - `[maybe-false]` `[defer]` Edge: the failure path passes `{ err }` to pino, whose serializer prints message, stack and cause, which for some undici errors can carry the fetched URL and therefore `key=` — would be medium if true; `getJson` has always done this, so it is not caused by this story. What would settle it: a capture of a real undici failure (DNS, TLS, redirect) against `googleapis.com` showing whether the URL appears in `err.message`, `err.stack` or `err.cause`.
  - `[low]` `[defer]` Verification gap (pre-verified): nothing pins the lookup failure log's shape, so wiring `getJson` to `searchFailed` keeps all 129 lookup tests green while every lookup outage logs `{ query: <isbn> }` under "search failed" — the gap layer demonstrated it. Deferred on its filed disposition: the spine requires only that failures are logged, the story's criteria pin the log for the search path alone (asserted), and the fix is a one-line addition to a test this story's criteria say stays unchanged.
  - `[false]` `[reject]` Intent: the diff tests against recorded volume records composed into a `books#volumes` body rather than captured free-text responses — Story 8.4's criteria say only "tests run only against fixtures"; the "recorded for a few title and author queries" phrase belongs to Story 8.3's criteria, and no network call happens in any lane.
  - `[false]` `[reject]` Intent: parity with Finna is asserted against the `SearchHit` type rather than against Finna's `search`, which does not exist on this branch — Story 8.3 owns that method in a parallel worktree, so there is nothing to compare against and no bad outcome; `SearchHit` is the contract both must meet.
  - `[false]` `[reject]` Intent: `shared.ts` is changed although the intent names the Google adapter, and the shared-file note sits in Design Notes rather than Residual risks — `getJson`'s signature and `finna.ts`'s call sites are unchanged, so no consumer diverges; the note's placement is a spec edit, rejected by rule and recorded under Residual risks instead.
  - `[false]` `[reject]` Intent: two test blocks pin `maxResults=20` and `printType=books`, configuration the criteria do not name — the spec states both and the request shape is the only observable surface of a method with no caller yet; pinning it causes no bad outcome.
  - `[false]` `[reject]` Intent: dedup to one hit per ISBN-13 goes beyond 8.4's stated criteria — it is the spine's rule for merged hits (line 178) and 8.3's criteria state it for Finna, so "`SearchHit`s like Finna's" reads with it rather than against it; no bad outcome.

## Design Notes

**One request helper, two log shapes.** `getJson(label, url, isbn13)` logs failures with `{ isbn13 }`; a search has a query instead. The fetch, timeout, status and JSON handling stay in one private function that takes the failure reporter:

```ts
type Fail = (reason: string, details?: Json) => void
async function request(url: string, fail: Fail): Promise<unknown> { /* the current getJson body */ }

export function getJson(label: string, url: string, isbn13: string): Promise<unknown> {
  return request(url, (reason, details) => void lookupFailed(label, isbn13, reason, details))
}
export function getSearchJson(label: string, url: string, query: string): Promise<unknown> {
  return request(url, (reason, details) => void searchFailed(label, query, reason, details))
}
```

`finna.ts` keeps calling `getJson` unchanged, which matters because Story 8.3 is editing that file in a parallel worktree.

**Relevance order, not cover-first.** `lookupByIsbn` sorts a volume with a cover first because every record it returns is the same book, so the better-illustrated record is simply the better one. In a search the records are different books and Google's order is the relevance signal; re-sorting would hide the match the user typed for. Story 8.5 merges in source order on top of this.

**Why `maxResults=20`.** Google's default is 10, which is thin for "is this the edition I am holding?", and 40 is the cap. 20 keeps one screen of Lookup results per source while Finna returns its own page, and the number lives in one constant beside the URL builder.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including the new `google.search` blocks and the unchanged `lookupByIsbn` ones.

**Manual checks (if no CLI):**
- No screen change, so no Playwright walk: nothing imports `search` until Story 8.5.

## Auto Run Result

**Summary.** The Google Books adapter now implements the contract's optional `search(query)` (FR-20, AD-9): one `volumes?q=<text>&printType=books&maxResults=20` request, each volume mapped to a `SearchHit` (`isbn13`, `title`, `authors`, `publisher`, `year`, `source`, `hasCover`), volumes without a title or a normalising ISBN dropped, one hit per ISBN-13 with Google's relevance order kept, and `[]` — never a throw — for a blank query, an empty answer or any failure. `binding` is always absent, because Google states none. Nothing imports it yet; Story 8.5's `searchBooks` is its first caller.

**Files changed.**
- `src/lib/metadata/sources/google.ts` -- `volumesUrl(params)` (endpoint and the call-time key read, shared with `googleUrl`), `searchUrl`, `searchIsbn13` (ISBN-13 entries before ISBN-10 ones, both through `toIsbn13`), `toHit` and `search` on the exported source. `lookupByIsbn` is untouched.
- `src/lib/metadata/sources/shared.ts` -- `compact()` widened to `<T extends object>`; `getJson`'s body extracted into one private `request(url, fail)`, with `getJson` (logs the ISBN) and the new `getSearchJson` (logs the query) over it, plus `searchFailed()` returning `[]`. `getJson`'s signature is unchanged, so `finna.ts` is untouched.
- `tests/unit/google.unit.spec.ts` -- `describe('google.search')` (15 cases) and `describe('google.search without a usable answer')` (8 cases) at the end of the file, over the recorded volume fixtures composed into a `books#volumes` body. Every I/O matrix row is covered, plus timeout, omitted fields, and the ISBN-13-over-ISBN-10 preference.

**Review.** One pass, four layers, 21 findings (low 8, false 7, maybe-false 1 — no medium or high). Patched 8: the timeout case, the omitted-field case, the ISBN-13 preference case, the missing silent-drop assertion, an absent-variable "unset key" case, the loosened test-local `Volume` type, the test block order, and the duplicated volumes URL and key read. Deferred 3: the `SearchHit` cover-URL gap (unchanged, Story 8.5's plan-time decision, verified against `recordCoverPreview`'s callers), the unpinned lookup failure log shape, and the `{ err }` payload possibly carrying a URL (medium if true, pre-existing on the lookup path). Rejected 10, each with its refutation in the triage log: dedup first-wins losing a duplicate's cover (low, the fix adds a branch for undemonstrated state), silent `[]` when every volume lacks an ISBN (the story's own rule; the guard adds paging), the duplicated body guards (rewiring `lookupByIsbn` is excluded by the intent contract), the two Residual-risks/spec-placement findings (the fix edits this build's spec), and the intent layer's five descriptive divergences — fixture provenance (8.4's criteria say only "tests run only against fixtures"; the title/author capture phrase is 8.3's), Finna parity (no `search` on this branch to compare against), the `shared.ts` surface, the pinned request config, and dedup as forward-consistency with the spine.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 8.

**Verification.**
- `npm run typecheck` -- clean, before and after the patches.
- `npm run lint` -- 0 errors (60 pre-existing warnings, all unused args in migration files; none in the touched files).
- `npm run test:unit` -- 84 files, 1131 tests before the patches, 1134 after, all passing. No network in any lane: `fetch` is stubbed in every case, and the blank-query case asserts it was never called.
- Matrix audit: all 13 rows covered by tests that ran and passed.
- No screen change, so no Playwright walk: nothing imports `search` until Story 8.5.

**Residual risks.**
- Built beside Stories 8.2 (main checkout) and 8.3 (own worktree). The one file shared with them is `src/lib/metadata/sources/shared.ts`: `compact`'s signature, the `request`/`getJson` split and the new `getSearchJson`/`searchFailed`. Story 8.3 needs the same two helpers for Finna's `search`, so expect a conflict there if it added its own; `getJson`'s signature and `finna.ts` are deliberately untouched to keep that conflict to one hunk. `sources/index.ts`, the fixtures script and `tests/fixtures/REPORT.md` were left alone for the same reason.
- `sprint-status.yaml` is not updated in this worktree, to avoid a three-way conflict with the stories running beside it: mark `8-4-i5-google-books-search: done` when this branch merges.
- `search` has no caller, so the adapter's behaviour is unexercised on a real surface until Story 8.5; the cover-URL deferral has to be settled at that story's plan time before `hasCover` means anything to a user.

**Rebase onto main (2026-11-01).** Stories 8.2 and 8.3 landed first, and 8.3 restructured the same shared helper differently: `getJson(label, action, url, subject)` with `sourceFailed(label, action, subject, …)`. The conflict was resolved by adopting main's design wholesale — this story's `getSearchJson`, `searchFailed` and the generic `compact` are gone, so `src/lib/metadata/sources/shared.ts` is now untouched by Story 8.4 and the parallel-worktree risk above is closed. `google.search` calls `getJson(LABEL, 'search', …, { query })` and reports body-shape failures through `sourceFailed`, `toHit` builds its fields with conditional spreads like Finna's `toHit`, and the dedup now raises `hasCover` from a later duplicate of the same ISBN-13, which is `finnaSearchHits`' rule — the review finding rejected before 8.3 existed, now justified by parity with the merged sibling and pinned by a new test. Verified after the rebase: typecheck clean, lint 0 errors, unit lane green.
