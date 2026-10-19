---
title: 'Story 3.28: [C6] Look up a Book by ISBN'
type: 'feature'
created: '2026-10-19'
baseline_revision: '5d2fbee83f166bf24cbe17278c9007d0c691f62e'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Answer needs one service that says what an ISBN is: a Book the user already has access to, or what the sources know. Nothing in `src/lib/catalogue` exists yet, and the scan flow cannot answer "In library" fast or keep lookups read-only without it (FR-11, AD-9).

**Approach:** Add `lookupBook(ctx, target)` as the first `lib/catalogue` module. It normalises the ISBN, answers `existing` from a shared Book or the user's own private Book (hydrated through `getEffectiveBooks` and `getHoldings`), and otherwise maps `lookupSources` to `source`, `none` or `unavailable`. Integration tests prove each kind, the private-Book isolation and that nothing is written.

## Boundaries & Constraints

**Always:**
- One module `src/lib/catalogue/lookupBook.ts` (no barrel), exporting the spine's shapes (`// src/lib/catalogue`) as this story needs them: `Draft = Omit<SourceResult, 'raw' | 'coverUrl'> & { hasCover: boolean }`, `LookupTarget = { isbn: string; pick?: number }` (the ISBN as entered), and `LookupResult = { kind: 'existing'; book: EffectiveBook; mine: Holdings } | { kind: 'source'; candidates: Draft[]; pick: number } | { kind: 'none' } | { kind: 'unavailable'; failed: SourceId[] }`. Doc comments cite AD-9 and FR-11.
- `normaliseIsbn(target.isbn)` from `@/fields/isbn` runs first; `INVALID_ISBN` propagates before any read or source call.
- The existing-Book read is one `gateway.find` on `books` with `where: { and: [{ isbn13: { equals: isbn13 } }, { or: [{ visibility: { equals: 'shared' } }, { createdBy: { equals: ctx.user.id } }] }] }`, `select: { visibility: true }`, `depth: 0`, `limit: 2`. The explicit `or` is required: the admin's read access reaches every private Book, and this answer is only ever shared or the viewer's own. A shared row wins over the viewer's private row when both exist (AD-5 auto-share not yet run).
- `existing` carries `book` from `getEffectiveBooks(ctx, [id])` and `mine` from `getHoldings(ctx, [id])` (`lib/books`), both for that one id. When the winning row is the viewer's private Book, `await lookupSources(isbn13)` also runs and its outcome is discarded; it warms the in-process cache so the next save can auto-share (AD-5, AD-9). A shared Book never calls the sources.
- With no readable Book: `lookupSources(isbn13)` maps `none` → `{ kind: 'none' }`, `unavailable` → `{ kind: 'unavailable', failed }` (the list passed through unchanged), `found` → `{ kind: 'source', candidates, pick }` where each candidate is the `SourceResult` without `raw` and `coverUrl`, plus `hasCover: coverUrl !== undefined`, in the outcome's order (best first). `pick` is `target.pick` when it is an integer in `[0, candidates.length)`, else `0` (an out-of-range pick falls back to the best, AD-9).
- No write of any kind: no `create`, `update`, `delete`, no transaction. Imports from `src/lib` only `books`, `metadata`, `payload` and `errors` (lint zone `catalogue`); `@/fields/isbn` for the normaliser.

**Never:**
- No `matches` on the `source` kind (C11, story 3.29 adds it with `findOrCreateByName`); no `{ bookId }` target (I12); no rate limit (C7, 3.30); no `searchBooks`, `lookupAgain` or save; no change to `lookupSources`, `lib/books`, the gateway or the collections; no surface code (D16+); no `rawMetadata` in any returned value (AD-9); no `overrideAccess`; no admin special case beyond the explicit `or`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Invalid ISBN | `{ isbn: '12345' }` | Rejects before any read; `lookupSources` not called | `DomainError('INVALID_ISBN')` |
| Shared Book, as entered | Shared Book X with ISBN-13; A owns a copy of X at a location; A looks up X's ISBN-10 with hyphens | `{ kind: 'existing', book: EffectiveBook of X, mine: { copies: [A's copy with location name], entries: [] } }`; `lookupSources` not called | No error expected |
| Own private Book | A's private Book P with ISBN; A looks it up | `existing` with P's `EffectiveBook` (`visibility: 'private'`), `mine` empty; `lookupSources` called once with P's ISBN-13 | No error expected |
| Another user's private Book | Same P; B and the admin look up P's ISBN with `lookupSources` faked `none` | `{ kind: 'none' }` for both, never P | No error expected |
| Shared beats private | A has private Q and a shared Book with the same ISBN exists | `existing` with the shared Book; `lookupSources` not called | No error expected |
| Found, picked | No Book; `lookupSources` faked `found` with 2 candidates, one with `coverUrl`; `pick: 1` | `{ kind: 'source', candidates: [Draft, Draft], pick: 1 }`; no `raw`/`coverUrl` key on a Draft; `hasCover` true only for the covered one | No error expected |
| Pick out of range | As above with `pick` 5, -1, 0.5 or absent | `pick: 0` | No error expected |
| None / unavailable | `lookupSources` faked `{ kind: 'none' }` / `{ kind: 'unavailable', failed: ['finna'] }` | `{ kind: 'none' }` / `{ kind: 'unavailable', failed: ['finna'] }` | No error expected |
| Writes nothing | After the `found` and `none` lookups | `books` count for that ISBN is still 0 | No error expected |

</intent-contract>

## Code Map

- `src/lib/metadata/lookup.ts:112-146` -- `lookupSources(isbn13): Promise<SourcesOutcome>`; never throws; caches `found`/`none` in process. The only source call this story makes.
- `src/lib/metadata/source.ts:5-30` -- `SourceResult` (has `coverUrl?`, `raw`, `source`), `SourcesOutcome` (`found.candidates` best first, `unavailable.failed: SourceId[]`), `SourceId`.
- `src/lib/books/effectiveBook.ts:131-165` -- `getEffectiveBooks(ctx, ids): Map<number, EffectiveBook>`; absent for unreadable ids; never carries `rawMetadata`. `EffectiveBook` type at lines 20-39.
- `src/lib/books/holdings.ts:27,50-100` -- `Holdings`, `getHoldings(ctx, ids): Map<number, Holdings>`; every requested id present.
- `src/fields/isbn.ts:36-40` -- `normaliseIsbn(text)`: ISBN-10/13, hyphens, spaces → 13 digits or `DomainError('INVALID_ISBN')`. `lib/books` already imports from `@/fields`, so the lint zones allow it.
- `src/lib/payload/gateway.ts:37-42` -- `gateway.find(ctx, options)`; runs as the user with `overrideAccess: false`.
- `src/access/catalogue.ts:9-13` -- `sharedOrOwnPrivate`: a user reads shared rows and their own private rows; the admin reads all. Why the explicit `or` in the where.
- `src/collections/Books.ts` / `src/payload-types.ts:143-144` -- `visibility: 'shared' | 'private'`, `createdBy?: number | User | null`, `isbn13?`.
- `src/collections/catalogueIndexes.ts:46` -- one shared Book per ISBN-13, one private per creator and ISBN-13: the find returns at most one shared and one own private row.
- `eslint.config.mjs:21` -- `catalogue: ['copies', 'wishlists', 'books', 'metadata', 'payload', 'undo']`: the zone already exists for `src/lib/catalogue`.
- `tests/int/holdings.int.spec.ts:1-80` -- test style to copy: `systemBook(user, visibility)` (a `payload.create` on `books` with `overrideAccess: true` and the user's `req`, as `lib/catalogue` writes), `locationOfA()`, `copyAs()` through `gateway.create`; `contextFor`, `createUser` from `tests/helpers/harness.ts`; `randomIsbn()` from `tests/helpers/isbn.ts`.
- `tests/unit/lookup.unit.spec.ts:16-17` -- `vi.hoisted` + `vi.mock` pattern. Here fake the service's dependency directly: `vi.mock('@/lib/metadata/lookup', () => ({ lookupSources: vi.fn() }))` and set the outcome per test with `vi.mocked(lookupSources).mockResolvedValue(...)`; this bypasses the real cache and sources.
- `src/fields/isbn.ts:13-32` -- `toIsbn13` for building the ISBN-10-with-hyphens input in the test: take a `randomIsbn()` starting `978`, derive the ISBN-10 (digits 4-12 plus mod-11 check digit) and hyphenate it; or simply pass the ISBN-13 with hyphens and spaces inserted, which exercises the same normaliser.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:100` -- `3-28-c6-look-up-a-book-by-isbn: backlog` → `in-progress` at implementation, `done` at the end.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/lookupBook.ts` -- new: `Draft`, `LookupTarget`, `LookupResult`, `lookupBook(ctx, target)` per Always -- AD-9's first layer, the Answer's one data call.
- `tests/int/lookupBook.int.spec.ts` -- new: the matrix rows with users A, B and an admin, `lookupSources` faked, Books created as `lib/catalogue` would -- the AC's "integration tests cover each kind and prove another user's private Book is never returned".
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-28-c6-look-up-a-book-by-isbn` status.

**Acceptance Criteria:**
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (lint: 0 errors in `src` and `tests`).
- Given `src/lib/catalogue/lookupBook.ts`, when inspected, then it contains exactly one gateway call (`find` on `books`), no `create`/`update`/`delete`/`withTransaction`, and every `source`-kind value is built without `raw` and `coverUrl`.
- Given the integration test, when the admin looks up the ISBN of another user's private Book, then the result kind is what the faked `lookupSources` returned, not `existing`.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 18 findings — high 0, medium 1, low 13, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` blind: `hasCover` is per candidate but the server-held `raw.coverUrl` is the best candidate's, so the cover route cannot serve `pick > 0`. The spine defines `Draft.hasCover` per candidate; the cached `found` outcome keeps every candidate's `coverUrl`, and 3.9's Design Notes assign `pick > 0` cover handling to 3.53, which "takes them from the candidate". No bad outcome at this location.
  - `[low]` `[reject]` blind: `books.get(existing.id)!` can be `undefined` if an admin flips the shared Book private or deletes it between the two reads. Verified real: separate reads, no transaction. A millisecond window that needs an admin edit at that instant; the fix adds a branch. Residual risk recorded.
  - `[low]` `[patch]` blind: the `books` find with `limit: 2` and default pagination runs a `countDistinct` before the select (`@payloadcms/drizzle/dist/find/findMany.js:125`). Verified. Patched: `pagination: false` on the find.
  - `[low]` `[reject]` blind: `sprint-status.yaml` says `done` while the spec says `in-review` and is not in the diff. The implementer set `done` early, as in 3.25; finalization writes `done` to the spec in the closing commit and nothing reads the pair in between.
  - `[low]` `[patch]` blind: the narrowed `LookupTarget` and `source` kind carry no note on why `{ bookId }` and `matches` are absent. Verified: a reader diffing against the spine sees drift. Patched: one doc-comment line on each naming I12 and 3.29.
  - `[low]` `[reject]` blind: the private-Book warm-up is awaited before the gateway reads and can add up to 4 s; `unavailable` is never cached so a down source adds it on every rescan. Verified real; the spec chose awaiting deliberately (Design Notes). Running it beside the reads saves only the read time; `void` contradicts the contract. Hand-entered Books with a slow source are rare and the answer stays inside NFR-1.
  - `[low]` `[reject]` blind: no test feeds a hyphenated ISBN-10 to the sources path. The shared-Book test proves `isbn13` is the normalised value; the same variable is passed to `lookupSources`. A test would restate the code.
  - `[low]` `[patch]` blind: the standalone "writes nothing" test is order-coupled and passes vacuously when run alone. Verified. Patched: the count assertion moved into the `found` and `none`/`unavailable` tests; the standalone test deleted.
  - `[low]` `[reject]` blind: `hyphenatedIsbn10` re-implements the ISBN-10 check digit in test code. The test passes only when the real normaliser accepts the derived ISBN-10 and maps it to the stored ISBN-13, so the two implementations check each other; the spec allowed either form.
  - `[low]` `[reject]` edge: Book made unreadable or deleted between the find and `getEffectiveBooks` yields `book: undefined`. Same root cause as the blind race row; same disposition.
  - `[low]` `[reject]` edge: the warm-up blocks the In-library answer up to 4 s. Same root cause as the blind warm-up row; same disposition.
  - `[medium]` `[patch]` verification-gap: the shared-over-private test passes because `sharedTwin` is created after `q` and the default sort is `-createdAt`, so `docs[0]` is already the shared row; `const existing = docs[0]` keeps all tests green. Pre-verified by the layer (demonstrated). Patched: `sharedTwin` created before `q` with the same ISBN, so the private row is the newer one.
  - `[false]` `[reject]` intent (3a): the exported types are narrower than the spine's (`matches`, `{ bookId }`). The intent's ACs name neither; STORY-SLICING's C11 and I12 rows own them and 3.29 is a separate sprint entry. No bad outcome.
  - `[false]` `[reject]` intent (3b): the warm-up is verified at the call surface only; the cache behaviour is mocked away. The caching is `lookupSources`' own contract, pinned by `tests/unit/lookup.unit.spec.ts`; this story's obligation is to call it with the normalised ISBN, which the test asserts.
  - `[false]` `[reject]` intent (3c): the isolation proof is only as strong as the mock. The admin test returns `none` only because of the explicit `or`; dropping it would return `existing` regardless of the mock. No bad outcome.
  - `[low]` `[reject]` intent (3d): "writes nothing" rests on code shape with one narrow probe. Every path reads through `gateway.find`, `getEffectiveBooks` and `getHoldings`; no writer is imported. The probe tripwire is kept (and un-coupled by the patch above).
  - `[low]` `[reject]` intent (3e): the hyphenated input is exercised only on the shared-Book path. Same root cause as the blind test-coverage row; same disposition.
  - `[low]` `[reject]` intent (3f): sprint status and spec status disagree mid-review. Same root cause as the blind bookkeeping row; same disposition.

## Design Notes

**Why `matches` and `{ bookId }` are absent.** STORY-SLICING places `matches` in C11 (3.29, depends on C5's `findOrCreateByName`, which is being built in parallel) and the Book-id target in I12. Typing them now with empty placeholders would make the Answer read "no new authors" for a book whose authors are all new. 3.29 widens the `source` kind; I12 widens `LookupTarget`.

**Why the sources are awaited on a private Book.** The spine says lookup "also runs `lookupSources`" so the save can auto-share from the cache; awaiting makes the warm-up observable and keeps the service free of fire-and-forget promises. The cost is at most one source budget (4 s) on the rare hand-entered Book.

```ts
const shared = docs.find((b) => b.visibility === 'shared') ?? docs[0]
if (shared) {
  if (shared.visibility === 'private') await lookupSources(isbn13)
  // One after the other: calls on one context never run concurrently (gateway, AD-16).
  const book = await getEffectiveBooks(ctx, [shared.id])
  const mine = await getHoldings(ctx, [shared.id])
  return { kind: 'existing', book: book.get(shared.id)!, mine: mine.get(shared.id)! }
}
```
`book.get(id)!` is safe: the row was just read through the same access, and `getEffectiveBooks` applies that scope.

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass (unchanged).
- `npm run test:int` -- expected: all pass, `lookupBook` included (needs the Postgres on `DATABASE_URL`, here `localhost:5437`).

## Auto Run Result

**Summary.** `lib/catalogue` exists: `src/lib/catalogue/lookupBook.ts` exports `Draft`, `LookupTarget` (`{ isbn, pick? }`) and `LookupResult` (`existing | source | none | unavailable`, without `matches`, which 3.29 adds) and `lookupBook(ctx, target)`. It normalises the ISBN first (`INVALID_ISBN` before any read), reads at most one shared and one own-private Book for it through one `gateway.find` whose `where` is explicit about shared-or-mine (the admin's access would otherwise reach other users' private Books), prefers the shared row, hydrates `existing` through `getEffectiveBooks` and `getHoldings`, awaits `lookupSources` only when the answer is the viewer's private Book (cache warm-up for auto-share), and otherwise maps the sources' outcome: `none` and `unavailable` pass through, `found` becomes `source` with `Draft` candidates (no `raw`, no `coverUrl`, `hasCover`) and a validated `pick` that falls back to 0. It writes nothing.

**Files changed.**
- `src/lib/catalogue/lookupBook.ts` -- new: shapes and `lookupBook`.
- `tests/int/lookupBook.int.spec.ts` -- new: 11 tests covering the 9 matrix rows (the writes-nothing probe runs inside the `found` and `none`/`unavailable` tests).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.28 done.

**Review.** 18 findings (medium 1, low 13, false 4). Patched 4 entries (medium 1, low 3): the shared-over-private test fixture now creates the shared twin before the private row, so the default `-createdAt` sort no longer makes the test pass for the wrong reason; `pagination: false` on the `books` find removes a count query from the scan hot path; doc comments name where `{ bookId }` (I12) and `matches` (3.29) arrive; the writes-nothing assertion moved into the tests whose lookups it checks. Deferred 0. Rejected:
- `hasCover` per candidate vs the server-held best-candidate cover: the spine's `Draft` is per candidate, the cache keeps every candidate's `coverUrl`, and 3.53 owns `pick > 0` covers.
- `books.get(id)!` after an admin edit between the two reads (two rows): a millisecond race needing an admin edit at that instant; the fix adds a branch. Residual risk below.
- Awaiting the warm-up on a private Book (two rows): deliberate in the spec; `void` contradicts the contract and parallelising saves only the read time; rare case, inside NFR-1.
- Sprint status `done` while the spec was in review (two rows): finalization writes `done` in the closing commit, as in earlier stories.
- A hyphenated-ISBN test on the sources path (two rows): the shared-Book test proves the normalised value and the same variable feeds the sources.
- `hyphenatedIsbn10` in test code: the real normaliser must accept and map it for the test to pass.
- Intent audit rows: the narrowed types follow C11/I12 and the ACs name neither; the cache behaviour is `lookupSources`' own tested contract; the admin isolation test fails without the explicit `or`; every path reads through the gateway readers only.

**Follow-up review:** not recommended. Patched entries: high 0, medium 1, low 3.

**Verification** (worktree `story-3-28-isbn-lookup`, Postgres on `localhost:5437`, after the patches).
- `npx eslint src tests`: 0 errors (36 pre-existing warnings in generated migrations).
- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 29 files, 501 passed.
- `npm run test:int`: 29 files passed, 1 skipped (`migrationSchema`, push on); `lookupBook` 11/11.
- Matrix audit: every row has a passing test in `tests/int/lookupBook.int.spec.ts`.
- Playwright not run (service story, no UI).

**Residual risks.** A shared Book made private or deleted by the admin between the scoped find and `getEffectiveBooks` would return `existing` with an undefined `book`; the window is one request's two reads. On a hand-entered private Book the In-library answer waits for the sources, up to 4 s when one is down, on every rescan (`unavailable` is never cached). Built in a worktree beside 3.26 and 3.27; all three touch adjacent `sprint-status.yaml` lines and will conflict on merge (keep each as `done`). 3.29 adds `matches` to the `source` kind and depends on 3.27's `findOrCreateByName`.
