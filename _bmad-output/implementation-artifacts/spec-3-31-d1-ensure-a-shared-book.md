---
title: 'Story 3.31: [D1] Ensure a shared Book'
type: 'feature'
created: '2026-10-19'
baseline_revision: 'f0a69b3e50d55c221408beaa463887e78146f513'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A `found` outcome merged while a source failed can become a permanent shared Book built from the other source's values only.
    evidence: |-
      `lookupSources` returns `found` even when Finna failed (`lookup.ts:126-133`). It only skips caching it, and the `found` variant carries no `failed` list. If Finna times out at save time and Google answers, `ensureSharedBook` creates the shared Book with `source: 'google'`, no Finna themes and no Finna raw. Admin re-fetch (FR-19) later fills only empty fields. The cause is the 3.9 / AD-9 outcome contract, not this story.
    location: >-
      src/lib/metadata/lookup.ts:126
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The save (3.35) needs a Book to attach a copy to, and nothing creates a shared Book yet. Its values must come only from the source outcome the server holds for the ISBN, never from the client (AD-5, FR-18).

**Approach:** Add `ensureSharedBook(ctx, isbn13)` to `lib/catalogue`. It returns the shared Book that already has this ISBN. If there is none, it creates one from the best candidate of `lookupSources(isbn13)`, which reads the in-process cache and re-runs the sources on a miss. Authors and series go through `findOrCreateByName()` in the shared scope, and `genres` come from a new stub `mapSubjectsToGenres()` that returns none until Epic 9. Integration tests cover create, reuse and two concurrent creates.

## Boundaries & Constraints

**Always:**
- `src/lib/catalogue/ensureSharedBook.ts` exports `ensureSharedBook(ctx: Context, isbn13: string): Promise<FoundOrCreated>`, which reuses `FoundOrCreated` (`{ id, created }`) from `./findOrCreateByName`. Its doc comment cites AD-5 and FR-18.
- `normaliseIsbn(isbn13)` runs first. `INVALID_ISBN` is raised before any read or source call.
- All work runs in `withTransaction(ctx, …)`, so a call inside a transaction joins it and a call outside opens its own. Every Payload call is preceded by `assertLive(tx)` and runs with system privileges (`req: tx.req, overrideAccess: true, depth: 0`), as in `findOrCreateByName`. Calls run one after another, never concurrently on one context.
- The function first looks for an existing shared Book: `payload.find` on `books` with `isbn13 = <isbn13>` and `visibility = shared`, `limit: 1`, `pagination: false`. If one is found, it returns `{ id, created: false }` without calling the sources and without writing anything.
- Otherwise it calls `await lookupSources(isbn13)`:
  - `none` → `DomainError('NOT_FOUND')`.
  - `unavailable` → a plain `Error` naming the failed sources, which `runAction` maps to a logged `INTERNAL`.
  - `found` → the function builds the Book from `candidates[0]`.
- On `found`:
  - **Authors:** for each author in order, call `findOrCreateByName(tx, 'authors', 'shared', { name, sortName })`, passing `sortName` only when the source gave one. Deduplicate the resulting ids, keeping the first occurrence.
  - **Series:** `findOrCreateByName(tx, 'series', 'shared', { name })` when the candidate has a series.
  - **Genres:** `genres = await mapSubjectsToGenres(tx, outcome.raw)`.
  - **Create:** `payload.create` on `books` with `isbn13`, `title`, `subtitle`, `authors`, `series`, `seriesIndex`, `publisher`, `year`, `language`, `pages`, `description`, `themes`, `genres`, `source: candidate.source`, `rawMetadata: outcome.raw` and `visibility: 'shared'`. A field the candidate lacks is left out.
  - **Return:** `{ id, created: true }`.
- `src/lib/catalogue/mapSubjectsToGenres.ts` exports `mapSubjectsToGenres(ctx: Context, raw: RawMetadata): Promise<number[]>`, which resolves `[]`. Its doc comment says that Epic 9 (G5) matches `raw.subjects.google` to genres there. It makes no read and no write.
- If two concurrent creates race for one ISBN, the loser fails with the unique index's `ValidationError`, unchanged. This is the codebase precedent (`findOrCreateByName`, `upsertUserBook`; AD-19).

**Never:**
- No Book value taken from the client. There is no `pick` parameter (3.53 adds it). `candidates[0]` is always used.
- No update of an existing shared Book (re-fetch is admin-only, FR-19).
- No cover, `media` row or download (3.32).
- No look at private Books (auto-share is 3.39, manual Books are 3.38).
- No `saveCopy`, copy, `user-books` row, undo receipt or surface code.
- No change to `lookupSources`, `findOrCreateByName`, the gateway or the collections.
- No raw SQL and no advisory lock.
- No truncation of source values.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Create | No Book for the ISBN. `found` with 2 candidates: the best has 2 authors (one with `sortName`), a series, themes and source `finna`. A **shared** author already exists whose name differs only in case. A has a **private** author with the other name. | `{ id, created: true }`. Read with system privileges, the Book has the best candidate's values, `source: 'finna'`, `rawMetadata` deep-equal to `outcome.raw`, `visibility: 'shared'`, `createdBy` null and `genres` `[]`. Its authors are the existing shared author plus a newly created shared author (not A's private one), in candidate order. Its series is shared. | No error expected |
| Reuse | A shared Book exists for the ISBN | `{ id: existing, created: false }`. `lookupSources` is not called. The Book count for the ISBN stays 1. | No error expected |
| Invalid ISBN | `'12345'` | Nothing is read and `lookupSources` is not called | `DomainError('INVALID_ISBN')` |
| None / unavailable | `lookupSources` is faked to return `none` / `unavailable` | Rejects. No Book is created for the ISBN. | `NOT_FOUND` / plain `Error` |
| Inside a rolled-back transaction | `withTransaction(asA, tx => ensureSharedBook(tx, isbn).then(() => { throw e }))` | Rejects with `e`. No Book and no new author or series remains. | Rollback |
| Concurrent | Two independent contexts (users A and B) call it for one new ISBN through `Promise.allSettled` | At least one call fulfils with `created: true`. Every fulfilled call has the same id. Every rejected call is a `ValidationError`. Afterwards there is exactly one shared Book for the ISBN and one shared author per name. | Lost race → `ValidationError` |

</intent-contract>

## Code Map

- `src/lib/catalogue/findOrCreateByName.ts:43-130`: the pattern to copy. It shows `withTransaction` plus `assertLive`, the `system` options object, and the `{ id, created }` return. It also handles the shared scope (matches and creates among shared rows only), which is how AD-4's rule that a shared Book references only shared records is met. Do not modify it.
- `src/lib/catalogue/lookupBook.ts:1-8`: the imports to mirror (`normaliseIsbn`, `lookupSources`, `Context`). The lint zone `catalogue` (`eslint.config.mjs:22`) already allows `metadata` and `payload`.
- `src/lib/metadata/lookup.ts:102`: `lookupSources(isbn13): Promise<SourcesOutcome>`. It never throws, caches `found`/`none` for 24 h/10 min and re-runs the sources on a miss. This function is the "held server-side outcome".
- `src/lib/metadata/source.ts:5-41`: `SourceResult` (with optional fields left out, `authors[].sortName?`, `binding`/`coverUrl`/`subjects` not stored on `books`), `SourcesOutcome` (`found.raw: RawMetadata`) and `RawMetadata`.
- `src/lib/payload/transaction.ts:18-59`: `assertLive`, `withTransaction` (joins an existing transaction; no savepoints).
- `src/collections/Books.ts`, `src/fields/bookFields.ts:46-67`, `src/fields/rawMetadata.ts`, `src/fields/visibility.ts`: the Book fields. `title` is required (max 500). `createdBy` is set by a hook and is null for shared Books. `rawMetadata` is admin-read only, so tests read it with `overrideAccess: true`.
- `src/collections/catalogueIndexes.ts:41`: the partial unique index on `books(isbn13)` for shared Books. This is the race guard.
- `tests/int/lookupBook.int.spec.ts:1-80`: the test style. `vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn() }))`, a `candidate()` builder, `contextFor`/`createUser` from `tests/helpers/harness.ts`, `randomIsbn()` from `tests/helpers/isbn.ts`, and `unique()` names.
- `tests/int/upsertUserBook.int.spec.ts:198-210`: the concurrent-write test shape (two `contextFor` contexts, `Promise.allSettled`, `ValidationError`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml:103`: `3-31-d1-ensure-a-shared-book`.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/mapSubjectsToGenres.ts`: new. The stub described in Always. It is the single place where G5 lands.
- `src/lib/catalogue/ensureSharedBook.ts`: new. `ensureSharedBook` as described in Always. It is D1's one function.
- `tests/int/ensureSharedBook.int.spec.ts`: new. One test per matrix row, with `lookupSources` mocked. Book, author and series rows are read with `overrideAccess: true`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: set the 3.31 status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then all pass with 0 lint errors.
- Given `ensureSharedBook.ts`, when inspected, then its only writers are `findOrCreateByName`, `mapSubjectsToGenres` and one `payload.create` on `books`, and no value in that create comes from anywhere other than `outcome` or the normalised ISBN.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 22 findings — high 0, medium 3, low 13, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: `lookupSources` is awaited inside the transaction, so a cache miss holds a pooled connection for up to 4 s. Verified real on a miss only. Nothing locks before the call (the shared-Book find takes no lock). 3.35 downloads the cover before the transaction and so warms the cache first. Moving the call outside would add a joined/own branch for a rare case in a one-user app.
  - `[medium]` `[defer]` blind: a `found` outcome merged while Finna failed builds a permanent shared Book from Google values only. Verified real. The cause is `lookupSources`' contract (3.9, AD-9): `found` carries no `failed` list, and the Answer shows the same degraded values. Not caused by this story; deferred.
  - `[low]` `[patch]` blind: the concurrent test's contested write is the new author's `nameKey` index, never the `books(isbn13)` shared index. Verified. Patched: the concurrent candidate has no authors and no series.
  - `[medium]` `[patch]` blind: no test proves that a private Book with the ISBN is ignored. Same root cause as the verification-gap row below. Patched with that row.
  - `[low]` `[reject]` blind: an over-long source value (title over 500, description over 10,000) fails every save of that ISBN with `VALIDATION`. Verified real, and recorded in the spec's Design Notes as a known boundary. No such value has been seen in the 3.2 fixtures. A guard belongs in the adapters' normalisation and is more than a direct correction. Listed under residual risks.
  - `[low]` `[reject]` blind: a lost race surfaces as `VALIDATION` with `fields.isbn13`, although an own-transaction call could retry. Verified real. This is the same precedent as `findOrCreateByName` and `upsertUserBook`, and a retry branch adds complexity for a near-impossible race in a one-user app.
  - `[low]` `[reject]` blind: on a cache miss the re-run may save values that differ from what the Answer showed. Verified real when the Answer's outcome was degraded (never cached) or expired. AD-5 specifies exactly this ("lookup cache, re-fetched on a miss"); 3.53's `pick` is the place to carry more.
  - `[low]` `[reject]` edge: an over-long title or description fails the create. Same root cause as the blind over-long row; same disposition.
  - `[false]` `[reject]` edge: a blank author or series name aborts the save through `findOrCreateByName`'s `VALIDATION`. Both adapters drop blank names (`finna.ts:130-131`, `google.ts:42-43`), and the source contract forbids placeholders (`source.ts`).
  - `[low]` `[reject]` edge: the sources are called inside the open transaction. Same root cause as the first blind row; same disposition.
  - `[low]` `[reject]` edge: two concurrent saves of different ISBNs that share a new author fail one save on the author's index. Verified real. This is `findOrCreateByName`'s documented lost race (3.27), and it is near impossible for one user.
  - `[low]` `[reject]` edge: inserting the same two new authors in opposite order in two concurrent saves can deadlock. Verified real in theory: it needs two simultaneous first saves sharing two new authors in reverse order. Sorting the inserts adds code for a case no user meets.
  - `[medium]` `[patch]` verification-gap: the `visibility: 'shared'` filter on the existing-Book find is untested; dropping it would return a private Book. Pre-verified. Patched: a test with A's private Book for the ISBN expects a new shared Book.
  - `[low]` `[patch]` verification-gap: author-id dedupe is never exercised, although adapters dedupe only by exact display name. Pre-verified. Patched: the create test adds a case-variant author and asserts two ids.
  - `[low]` `[patch]` verification-gap: the normalised ISBN is not exercised with non-canonical input. Pre-verified. Patched: the reuse test passes the ISBN with hyphens.
  - `[low]` `[reject]` intent (3.1): the tests mock `lookupSources`, so cache hit and miss are not exercised here. The caching is `lookupSources`' own contract, pinned by `tests/unit/lookup.unit.spec.ts`. The degraded-outcome part shares its root cause with the blind re-run row.
  - `[false]` `[reject]` intent (3.2): the ensure semantics could be read as "both callers get the Book" (B1) and the test cannot tell B1 from B2. The spec settles B2 on AD-19's precedent, and the test accepts either outcome by design. No bad outcome at this location.
  - `[false]` `[reject]` intent (3.3): "never from the client" is shown only structurally. The story is a service; the client surface is 3.35/3.46, and the signature has no client channel.
  - `[false]` `[reject]` intent (3.4): the diff always uses `candidates[0]`. Epics 3.53 (C12) owns `pick` explicitly.
  - `[false]` `[reject]` intent (3.5): behaviour beyond the Given (`none`, `unavailable`, `INVALID_ISBN`) is descriptive only, with no bad outcome named.
  - `[low]` `[reject]` intent (3.6): the `mapSubjectsToGenres` signature differs from 9.11's `(ctx, book)`, and no test checks the call. It is a stub returning `[]`; Design Notes record why, and 9.11 may change it.
  - `[false]` `[reject]` intent (3.7): the transaction surface matches; the auditor reports no divergence.

## Design Notes

**Why there is no lock for the race.** A lost race fails inside the save's transaction, and that transaction cannot recover from it without savepoints. A per-ISBN advisory lock would let both callers succeed, but it would add the first raw SQL write path to `lib/catalogue`. The two existing writers already let the unique index decide, and a single-user app scanning the same new ISBN twice at the same instant is a retry, not a loss.

**Why `mapSubjectsToGenres(ctx, raw)` and not `(ctx, book)`.** Story 9.11 names `(ctx, book)`. Here the genres must be known before the create, because system genres are written only by this function (AD-5). Taking the `RawMetadata` lets G5's admin re-run call it with a stored Book's `rawMetadata` and write the ids itself. G5 can change the signature freely while it is a stub.

**Why `unavailable` is not a new error code.** The Answer already showed candidates, so `unavailable` at save time means the cache dropped the outcome and a source is down at that moment. That is rare enough for the generic error toast. A dedicated code would need messages and surface handling that 3.50 does not ask for.

**Over-long source values** (a description over 10,000 characters, for example) fail the create with `VALIDATION`. If real data shows this, the fix belongs in the adapters' normalisation in `lib/metadata`, not here.

```ts
const outcome = await lookupSources(isbn13)
if (outcome.kind === 'none') throw new DomainError('NOT_FOUND')
if (outcome.kind === 'unavailable') throw new Error(`Sources unavailable: ${outcome.failed.join(', ')}`)
const best = outcome.candidates[0]! // `found` always has at least one candidate
```

## Verification

**Commands:**
- `npx eslint src tests`: expected 0 errors.
- `npx tsc --noEmit`: expected clean.
- `npm run test:unit`: expected all pass (unchanged).
- `npm run test:int`: expected all pass, `ensureSharedBook` included. This needs the worktree's Postgres on `localhost:5440` through `.env`.

## Auto Run Result

**Summary.** `ensureSharedBook(ctx, isbn13)` in `src/lib/catalogue/ensureSharedBook.ts` returns `{ id, created }`:
- It normalises the ISBN first, so `INVALID_ISBN` comes before any read. It then runs in the caller's transaction or one of its own.
- If a shared Book with the ISBN exists, it returns it with no source call and no write. Private Books are never considered.
- Otherwise it takes `lookupSources(isbn)`, which is the cache or, on a miss, a fresh source call. `none` raises `NOT_FOUND`, and `unavailable` raises a plain `Error` (logged `INTERNAL`) naming the failed sources.
- On `found` it creates the shared Book from `candidates[0]`:
  - Authors are matched or created in shared scope one at a time through `findOrCreateByName`, with ids deduplicated, keeping the first.
  - The series goes the same way, and genres come from the new stub `mapSubjectsToGenres(ctx, raw)`, which returns `[]` until Epic 9.
  - The candidate's scalar fields, `themes` and `source` are stored, with `rawMetadata` = `outcome.raw`.
- A lost race between concurrent creates surfaces as the unique index's `ValidationError`.

**Files changed.**
- `src/lib/catalogue/ensureSharedBook.ts`: new. The service.
- `src/lib/catalogue/mapSubjectsToGenres.ts`: new. The genre stub that G5 fills.
- `tests/int/ensureSharedBook.int.spec.ts`: new. 7 tests covering every matrix row, plus the private-Book-ignored case.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.31 is done.

**Review.** 22 findings: medium 3, low 13, false 6.

Patched 4 entries (medium 1, low 3), all in the test file:
- A private Book with the ISBN is ignored. Checked by mutation: dropping the `visibility` filter fails the new test.
- Author dedupe is exercised with a case-variant name.
- The reuse test passes a hyphenated ISBN.
- The concurrent test uses an authorless candidate, so the `books(isbn13)` shared index is the contested write.

Deferred 1: a degraded `found` outcome, from the 3.9 / AD-9 contract (see frontmatter).

Rejected:
- Sources called inside the transaction (2 rows). Only on a cache miss, nothing locks before the call, and 3.35's cover download warms the cache first.
- Over-long source values fail the save (2 rows). A known boundary; the fix belongs in the adapters.
- Lost race reported as `VALIDATION`. Codebase precedent; a retry branch is not worth it in a one-user app.
- Re-run on a miss can differ from the Answer (2 rows, blind and intent 3.1). This is AD-5 as written; `pick` arrives in 3.53.
- Different-ISBN author race. `findOrCreateByName`'s documented lost race.
- Opposite-order author deadlock. Needs two simultaneous first saves sharing two new authors in reverse order.
- Blank author name. False: the adapters drop blank names.
- Intent rows 3.2 to 3.7. B2 is settled on AD-19 and the test accepts both outcomes; the client surface is 3.35 / 3.46; `pick` is 3.53; behaviour beyond the Given has no harm; the `mapSubjectsToGenres` signature is a stub that 9.11 may change; the transaction surface matches.

**Follow-up review:** not recommended. Patched entries: high 0, medium 1, low 3.

**Verification.** Run in worktree `story-3-31-ensure-shared-book`, Postgres on `localhost:5440`, after the patches:
- `npx eslint src tests`: 0 errors (36 pre-existing warnings in the generated migrations).
- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 30 files, 520 passed. One earlier run had a single failure that did not reproduce in four reruns. It is unrelated: no unit test touches these files, and it was probably load from the parallel 3.29 and 3.30 builds.
- `npm run test:int`: 32 files passed, 1 skipped (`migrationSchema`, push on). `ensureSharedBook` passed 7/7.
- Matrix audit: every row has a passing test.
- Playwright not run (service story).

**Residual risks.**
- **Over-long values:** a source value over a field limit (title or subtitle over 500, description over 10,000) makes that ISBN unsaveable by scanning, and the `found` outcome stays cached for 24 h.
- **Lost race:** the loser of a concurrent first save gets `VALIDATION` instead of the Book.
- **Degraded outcome:** see the deferred item in the frontmatter.
- **Merge conflict:** built in a worktree beside 3.29 and 3.30. All three touch adjacent `sprint-status.yaml` lines and will conflict on merge; keep each as `done`. 3.29 also edits `lib/catalogue` (`lookupBook`) but not these files. No migration, so no type regeneration after a rebase.
