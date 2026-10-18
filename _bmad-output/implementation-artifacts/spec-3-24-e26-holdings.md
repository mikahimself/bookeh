---
title: 'Story 3.24: [E26] Holdings'
type: 'feature'
created: '2026-10-18'
baseline_revision: 'e913a40400c9d60da302fe41fa1bd8ecd1b0652a'
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

**Problem:** `copies` and `locations` exist (3.20, 3.21) but nothing reads what a viewer holds of a Book. The Answer (D25), Book detail (E8), shelf rows (E17) and `lookupBook` (C6) would each query copies their own way and disagree; AD-9 names one reader.

**Approach:** Add `getHoldings(ctx, bookIds)` to `lib/books` with the spine's `CopyLine`, `EntryLine` and `Holdings` shapes: one gateway read of the viewer's copies on those Books, one of their locations, mapped to lines. Loans and entries are typed now and stay empty until Epics 6 and 7. A two-user integration test proves another user's copies never appear.

## Boundaries & Constraints

**Always:**
- Declare `CopyLine`, `EntryLine` and `Holdings` in `src/lib/books/holdings.ts` exactly as the spine's Shared shapes (`// src/lib/books`), reusing `Named` from `./effectiveBook`. Document that `loan` (J10, Epic 6) and `entries` (H14, Epic 7) are typed now and filled later.
- `getHoldings(ctx, bookIds: readonly number[]): Promise<Map<number, Holdings>>`, keyed by Book id. Every requested id gets an entry, `{ copies: [], entries: [] }` when the viewer holds nothing of it (a Book they cannot read included: nothing of theirs can point at it). An empty input returns an empty map without a query.
- Reads go through `gateway.find` (AD-2, AD-16). `copies` and `locations` are scoped to the viewer by their access alone (AD-6/AD-17: `owner = current user`, the admin included); no `owner` condition in the query. `pagination: false` on both reads: Payload's default page is 10 docs.
- The `copies` read is `depth: 0` (a populated `book` would carry the whole Book doc, `rawMetadata` for the admin, AD-9); locations come from one `locations` find on the distinct location ids, skipped when none. A copy whose location id did not come back (none exist today; `ownedRelation` refuses foreign ones at write time) has `location: null`.
- Copies are in creation order, oldest first, ties by id (`sort: ['createdAt', 'id']`; AD-7: every sort ends on copy id). A `CopyLine` is `{ copyId, status, location: Named | null, note, loan: null }`; `note` is `copy.notes`, with `''` and `undefined` as `null`. `entries` is `[]`.
- No `any`; strict TS; no `console.*`. Service style as `effectiveBook.ts`: `import * as gateway`, doc comments citing the spine.

**Never:**
- No writer of copies (`createCopy()` is D3), no Drizzle (AD-7: the shelf alone), no `requireOwnBook` (E21), no loan or wishlist reads, no `src/app` change, no barrel `index.ts`, no caching (Caching convention), no schema or migration change.
- No merge with `getEffectiveBooks()`: callers (E17, E8, C6) compose the two readers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own copies | A has an owned copy at location "Hylly" with a note, then an ordered copy without a location, on shared Book X | `copies` has two lines in that order: `{ status: 'owned', location: { id, name: 'Hylly' }, note }`, then `{ status: 'ordered', location: null, note: null }`; both `loan: null`; `entries: []` | No error expected |
| Another user's copies | B holds a copy of X; A asks for X | A's lines are A's copies only; B's `copyId` never appears. B asking sees only B's | No error expected |
| Admin | The admin asks for X holding nothing | `{ copies: [], entries: [] }`: the admin reads no one else's copies | No error expected |
| Nothing held | A asks for shared Book Y with no copies of A's | Y maps to `{ copies: [], entries: [] }` | No error expected |
| Unreadable Book | A holds a copy of A's private Book P; B asks for `[X, P]` | Both keys present; P is empty for B | No error expected |
| Many copies | A holds 11 copies of one Book | All 11 lines returned, in creation order | No error expected |
| Empty input | `[]` | Empty map, no query | No error expected |

</intent-contract>

## Code Map

- `src/lib/books/effectiveBook.ts` -- the sibling reader, untouched: `Named` (exported), `populated()`/`idOf()` helpers (local; `holdings.ts` declares its own one-line id narrowing), the `Map`-keyed signature, `gateway.find` with `depth`, `select`, `pagination: false`, the empty-input short circuit. Mirror its doc-comment style.
- `src/lib/books/coverUrl.ts`, `src/lib/books/genreName.ts` -- the other files in `lib/books`; no barrel.
- `src/lib/payload/gateway.ts` -- `find(ctx, { collection, where, depth, sort, pagination, select })`; `sort` is Payload's `Sort = string | string[]` (`node_modules/payload/dist/types/index.d.ts:114`).
- `src/lib/payload/context.ts` -- `Context = { req, user, transactionID? }`.
- `src/collections/Copies.ts` -- fields `owner`, `book` (`readableRelation`), `status: 'ordered' | 'owned'`, `location` (`ownedRelation('locations')`, none when ordered), `notes` (textarea). Access `ownerAccess`: read is `owner = current user` for every role.
- `src/collections/Locations.ts` -- `ownerAccess`, `name`, `nameKey`; generated interface `UserLocation`.
- `src/payload-types.ts:277-286` -- `Copy` (`book: number | Book`, `location?: (number | null) | UserLocation`, `notes?: string | null`); `:184-191` `UserLocation`.
- `eslint.config.mjs:24-36` -- `lib/books` may import from `src/lib` only `payload`, `undo`, `errors`, `processState`.
- `tests/int/copies.int.spec.ts` -- `systemBook(user, visibility)` (system create with `req` from `contextFor(user)`), `copyAs(user, data)` through the gateway, `ownerId()`. `tests/int/locations.int.spec.ts:32-38` -- `locationAs(user, { name })` through the gateway. `tests/int/effectiveBook.int.spec.ts` -- the three-user layout, `randomIsbn`, `unique()` names.
- `tests/helpers/harness.ts` -- `createUser()`, `contextFor()`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:96` -- `3-24-e26-holdings: backlog` → `in-progress` at implementation, `done` at the end.

## Tasks & Acceptance

**Execution:**
- `src/lib/books/holdings.ts` -- new: `CopyLine`, `EntryLine`, `Holdings`, `getHoldings()` per Always -- AD-9's one reader.
- `tests/int/holdings.int.spec.ts` -- new: the matrix rows with users A, B and an admin, Books X (shared), Y (shared), P (A's private), a location of A's; the 11-copy paging pin.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-24-e26-holdings` status.

**Acceptance Criteria:**
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (lint: 0 errors in `src` and `tests`).
- Given `src/lib/books/holdings.ts`, when inspected, then the `copies` read is `depth: 0` with `pagination: false`, and no `owner` condition appears in any `where`.
- Given the two-user test, when A's and B's holdings of the same Book are read, then each result lists only that user's copy ids and the other user's ids appear in neither.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 20 findings — high 0, medium 0, low 11, false 9, maybe-false 0
- findings:
  - `[low]` `[patch]` blind: the doc comment states "nothing of theirs can point at an unreadable Book" as an invariant; the admin can make a shared Book private in the back office (`catalogueAccess.update` is admin-only, `visibility` is an editable select), after which a viewer's copies point at a Book they cannot read while `getHoldings` still returns them. Patched: the comment says copies are returned regardless of the Book's current readability and callers take readability from `getEffectiveBooks()`.
  - `[low]` `[patch]` blind: the `''` → `null` note fold is unpinned and the comment is wrong; a probe shows an omitted `notes` is stored and returned as `null`. Patched: `orderedByA` is created with `notes: ''` and the comment says `''` arrives only from a submitted empty field.
  - `[low]` `[reject]` blind: `sprint-status.yaml` says `done` while the spec says `in-review` inside one diff. Finalization writes `done` to both in the closing commit; nothing reads the pair in between.
  - `[low]` `[reject]` blind: `systemBook`/`copyAs` helpers repeated across three int specs. Test-only repetition of five-line helpers; hoisting is a new module, more than a direct correction (owner: no abstractions for later).
  - `[low]` `[reject]` blind: `idOf` duplicated from `effectiveBook.ts`. A one-line narrowing; exporting it would touch `effectiveBook.ts`, which the spec keeps untouched while 3.23 builds beside this story.
  - `[low]` `[reject]` blind: the `id` tie-break in `sort` is inspection-only. Same-millisecond `createdAt` is unreachable through any Phase 1 write path (one copy per save), and pinning it needs a system write with a forced timestamp; recorded under Verification instead.
  - `[low]` `[reject]` blind: divergence from STORY-SLICING E26 ("later slices add location") unrecorded. The epic AC names `location` and F1 is done; the fix is a spec edit, recorded in the Auto Run Result instead.
  - `[low]` `[patch]` blind: the `locations` read returns fields the line discards. Patched: `select: { name: true }`.
  - `[low]` `[patch]` blind: `result.get(...)?.copies.push(line)` would drop a copy silently if the `where` stopped matching. Patched: explicit lookup with a comment on why a miss is unreachable.
  - `[low]` `[patch]` blind: `shelf: { id: number; name: string }` in the test restates `Named`. Patched: imports `Named`.
  - `[low]` `[reject]` edge: a whitespace-only note reaches `CopyLine` as is. The reader reports the stored value; trimming belongs to the note writer (Edit book, Epic 4), and no surface renders notes yet. More guards than a correction.
  - `[low]` `[patch]` verification-gap: the locations read's `pagination: false` is unpinned (reviewer's mutation kept 7/7 green; an 11th location came back `null`). Patched: the 11-copy case gives each copy its own location and asserts the ids in order.
  - `[low]` `[reject]` verification-gap: the sort tie-break on `id` is untested. Same root cause as the blind row above; rejected on the same grounds (the reviewer's own disposition was defer).
  - `[false]` `[reject]` intent: the "so that" screens (Answer, Book detail, rows) do not consume the reader. D25, E8, E17 and C6 are later stories that depend on E26; the AC is written at the function.
  - `[false]` `[reject]` intent: STORY-SLICING defers location lines. The epic AC lists `location`; the epic is the intent here.
  - `[false]` `[reject]` intent: every requested id present, unlike `getEffectiveBooks()`; a nonexistent id gets empty holdings. No caller is harmed: the Answer's `mine` and a shelf row's `copy` always need a value, and readability is `getEffectiveBooks()`'s answer. Design Notes record the choice.
  - `[false]` `[reject]` intent: ownership by access rather than an `owner` filter. AD-2 forbids filtering by user id as authorisation outside AD-3 modules.
  - `[false]` `[reject]` intent: the admin case is beyond the AC. `ownerAccess` binds the admin; a widening, no bad outcome.
  - `[false]` `[reject]` intent: `Map`, ordering, `depth: 0`, `''` → `null`, the paging test are unasked. All from the spine's shapes and conventions; no bad outcome claimed.
  - `[false]` `[reject]` intent: spec and sprint statuses disagree. Same root cause as the blind row; finalization sets both.

## Design Notes

A `Map` with every requested id present, unlike `getEffectiveBooks()` where absence means "unreadable": holdings have no unreadable state. A viewer's copies all point at Books they could read when written, and the Answer's `mine: Holdings` and a shelf row's `copy` always need a value, so callers never test for a missing key.

Two finds at `depth: 0` rather than one at `depth: 1`: the only relation worth populating is `location`, and `depth: 1` would also fetch the Book and owner docs for every copy. The shape:

```ts
const { docs: copies } = await gateway.find(ctx, {
  collection: 'copies',
  where: { book: { in: ids } },
  sort: ['createdAt', 'id'],
  depth: 0,
  pagination: false,
})
```

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, `holdings` included (needs the Postgres on `DATABASE_URL`, here port 5435).

## Auto Run Result

**Summary.** `lib/books` now holds the spine's `CopyLine`, `EntryLine` and `Holdings` shapes and the one reader `getHoldings(ctx, bookIds)`: a `Map` keyed by Book id with every requested id present (empty holdings when the viewer holds nothing, a Book they cannot read included). One gateway read of `copies` (`book in ids`, `sort: ['createdAt', 'id']`, `depth: 0`, `pagination: false`, no `owner` condition: `ownerAccess` scopes it, the admin included), one of the distinct `locations` (`select: { name: true }`, `pagination: false`), mapped to lines with `note` folded from `''`/`null` to `null`, `loan: null`, `entries: []`. Location lines land here, not in a later slice as STORY-SLICING E26 once planned, because the epic AC names `location` and F1 (3.21) is done.

**Files changed.**
- `src/lib/books/holdings.ts` -- new: shapes and `getHoldings()`.
- `tests/int/holdings.int.spec.ts` -- new: 7 tests over the 7 matrix rows, with the 11-copy case also pinning the locations read's paging.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.24 done.

**Review.** 20 findings (low 11, false 9). Patched 6 rows in 6 entries, all low: the readability claim in the doc comment reworded (the admin can make a shared Book private later; callers take readability from `getEffectiveBooks()`); the `notes` comment corrected and the `''` → `null` fold pinned by creating `orderedByA` with `notes: ''`; `select: { name: true }` on the locations read; the silent optional chain replaced by an explicit lookup with a comment; the 11-copy test gives each copy its own location and asserts the ids in order; the test reuses `Named`. Deferred 0. Rejected:
- Spec and sprint statuses disagreeing mid-diff (two rows): finalization sets both to `done` in one commit.
- Test helpers repeated across int specs: hoisting is a new module, more than a direct correction.
- `idOf` duplicated from `effectiveBook.ts`: one line; the spec keeps `effectiveBook.ts` untouched while 3.23 builds beside this story.
- The `id` tie-break in `sort` untested (two rows): same-millisecond `createdAt` is unreachable through any Phase 1 write path, and pinning it needs a forced timestamp; inspected, not tested.
- STORY-SLICING divergence unrecorded: recorded here; the epic AC is the intent.
- Whitespace-only notes pass through: the reader reports the stored value; trimming belongs to the note writer (Epic 4).
- Intent audit rows (screens not consuming the reader, slicing vs epic, every-id key set, ownership by access, the admin case, unasked details): no bad outcome; the AC is written at the function, AD-2 forbids `owner` filters as authorisation, and the key-set choice is in Design Notes.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 6.

**Verification** (worktree `story-3-24-holdings`, Postgres on 5435, after the patches).
- `npx eslint src tests`: 0 errors (36 pre-existing warnings in generated migrations).
- `npm run typecheck`: clean.
- `npm run test:unit`: 29 files, 500 passed.
- `npm run test:int`: 26 files passed, 1 skipped (`migrationSchema`, push on); `holdings` 7/7.
- `npx prettier --check` on the two new files: clean.
- Probes: an omitted `notes` is stored and returned as `null`; removing `pagination: false` from the locations read makes the 11th location `null` (reviewer's mutation, now caught by the test).
- Playwright not run (service story, no UI).

**Residual risks.** The `id` tie-break on equal `createdAt` is inspected, not tested. The every-id key set differs from `getEffectiveBooks()`, where a missing key means unreadable; E17/E8/C6 should key on the effective-book map and look holdings up by id.
