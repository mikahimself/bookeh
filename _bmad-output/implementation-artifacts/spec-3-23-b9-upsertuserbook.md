---
title: 'Story 3.23: [B9] `upsertUserBook`'
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

**Problem:** `user-books` has a reader (3.22) but no writer. `editBook` (D5), `setRead` (E24) and `setRating` (E11) would each have to find-or-create the lazy row, keep `overridden` in step with the stored override values and keep `rating` in step with `ratedAt`; AD-6 and AD-18 allow exactly one writer.

**Approach:** Add `upsertUserBook(ctx, bookId, changes)` to `lib/books`: inside the context's transaction it finds the viewer's row for the Book, creates it on the first write and updates it after, computing `overridden` from the override fields it writes and drops. Integration tests cover create, update, the shared-Book rule and a concurrent second create.

## Boundaries & Constraints

**Always:**
- `src/lib/books/upsertUserBook.ts` exports `upsertUserBook(ctx: Context, bookId: number, changes: UserBookChanges): Promise<void>` and the types `UserBookChanges` and `BookOverrides`. `UserBookChanges = { overrides?: BookOverrides; dropOverrides?: readonly OverridableBookField[]; read?: boolean; rating?: number | null }`. `BookOverrides` maps each `OverridableBookField` to its stored value type: `authors` is `number[]`, `series` is `number | null`, the rest `NonNullable<UserBook[K]> | null`. Ids only: name matching is `findOrCreateByName()` (C5), the caller's.
- The whole function body runs in `withTransaction(ctx, fn)` (AD-16): it joins the caller's transaction or opens its own. Every read and write goes through the gateway on the transaction context, `depth: 0`.
- The row is found by `book` alone: `user-books` access already scopes to the viewer (AD-6), no `owner` condition. `owner` is passed as `tx.user.id` on create only because Payload's create type requires it; the hook sets it from the request.
- `overridden` after the write = (the row's current list ∪ keys of `overrides`) − `dropOverrides`, emitted in `OVERRIDABLE_BOOK_FIELDS` order. A key present in `overrides` is written as its value, `null` meaning cleared (AD-6); text values are trimmed and NFC-normalised (Text input convention) and `''` becomes `null`. A dropped field's stored value is set to `null`. Iterate `OVERRIDABLE_BOOK_FIELDS`; no second field-name list.
- `rating` present: write it and `ratedAt` = now (ISO) for a number, `null` for `null`. Whole stars and 1–5 are the field's validation (`VALIDATION` through `runAction()`); do not re-check.
- Overrides exist only on shared Books (AD-6): when `overrides` has at least one key, read the Book's `visibility` (`gateway.findByID` with `select: { visibility: true }`); a private Book fails with `DomainError('VALIDATION', { fields })` naming each key in `overrides`, before any write. `read`, `rating` and `dropOverrides` need no Book read.
- A change set with nothing to store (no `overrides` keys, no `read`, no `rating`, and either no row or no `dropOverrides` entries) writes nothing and creates no row (the row is lazy).
- A lost race: two first writes for one viewer and Book run in separate transactions; the second insert waits on the unique index and fails with Postgres `23505`, which Payload's `handleUpsertError` turns into a `ValidationError`. Let it propagate unchanged; no retry (the transaction is dead after a failed call, and a joined one is the caller's). One row remains.
- Update the doc comments in `src/collections/UserBooks.ts` and `src/fields/bookFields.ts` that say the writer does not exist yet.
- No `any`; strict TS; no `console.*`.

**Never:**
- No `setRead`, `setRating`, `editBook`, Undo or restore value (E24, E11, D5, U1); no return value beyond `void`.
- No tags (`UserBookState.tags`, G1), no deletion of the row (AD-6: never deleted), no validation duplicated from the collection (`overridden` members, `rating` range, readable relation targets).
- No `src/app` change, no barrel, no schema or migration change, no Drizzle.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First write | No row; `{ overrides: { title: ' Oma ', subtitle: '' }, read: true, rating: 4 }` on a shared Book | One row: `title: 'Oma'`, `subtitle: null`, `overridden: ['title', 'subtitle']`, `read: true`, `rating: 4`, `ratedAt` set | No error expected |
| Update | That row; `{ overrides: { authors: [id] }, dropOverrides: ['subtitle'], rating: null }` | Same row id: `overridden: ['title', 'authors']`, `subtitle: null`, `authors: [id]`, `title` kept, `read` kept, `rating: null`, `ratedAt: null`; still one row | No error expected |
| Relation cleared | `{ overrides: { authors: [], series: null } }` | `authors: []`, `series: null`, both listed in `overridden` | No error expected |
| Private Book | Viewer's own private Book; `{ overrides: { title: 'x' } }` | No row written | `DomainError` `VALIDATION`, `fields.title` |
| Private Book, state only | Same Book; `{ read: true, rating: 5 }` | Row created with the flag and rating | No error expected |
| Unreadable Book | Another user's private Book id | Nothing written | `NotFound` from the gateway |
| Nothing to store | No row; `{}` or `{ dropOverrides: ['title'] }` | No row created | No error expected |
| Caller's transaction | `withTransaction(ctx, tx => upsertUserBook(tx, …) then throw)` | No row after the rollback | The caller's error, unchanged |
| Concurrent first write | Two contexts for one user, `Promise.allSettled` of two first writes on one shared Book | One fulfilled, one rejected; exactly one row | `ValidationError` |

</intent-contract>

## Code Map

- `src/lib/books/effectiveBook.ts` -- the reader this writer pairs with: `overridden` semantics (listed = applies, empty = cleared, `''` folded to `null`), `Overridable = Pick<UserBook, OverridableBookField>`, `populated()`/`idOf()` style. Read-only.
- `src/fields/bookFields.ts` -- `OVERRIDABLE_BOOK_FIELDS`, `OverridableBookField`; `overriddenField()` validates membership and uniqueness. Lines 97-101: the doc comment "(B9, not yet written)" to reword.
- `src/collections/UserBooks.ts:16-25` -- doc comment "will be its single writer ... does not exist yet" to reword. Fields: `owner`, `book` (`readableRelation`, required), the ten override fields, `overridden`, `read` (default `false`), `rating` (1–5, whole), `ratedAt` (date). Unique `(owner, book)` index: `owner_book_idx` in `src/migrations/20261017_074009_user_books.ts:45`.
- `src/payload-types.ts` -- `UserBook`: `authors?: (number | Author)[] | null`, `series?: (number | null) | Series`, `overridden` typed to the ten names, `ratedAt?: string | null`. Payload's create data requires `owner` and `book`.
- `src/lib/payload/transaction.ts` -- `withTransaction(ctx, fn)`: joins when `ctx.transactionID` is set, else a fresh req and transaction; rolls back and rethrows on throw. `assertLive()` explains why no call can follow a failed one.
- `src/lib/payload/gateway.ts` -- `find`, `findByID`, `create`, `updateByID` with the context user and `overrideAccess: false`; writes by id only. `select` on `findByID` is typed through `TypedCollectionSelect`.
- `src/lib/account/profile.ts` -- service style: `import * as gateway`, `Changes` type where an absent key is left as is, trim + NFC, `DomainError('VALIDATION', { fields })`, doc comments citing the spine.
- `src/lib/errors.ts` -- `DomainError`, `ErrorCode` (`VALIDATION`, `NOT_FOUND`); `runAction()` maps Payload `ValidationError` to `VALIDATION` with field paths.
- `node_modules/@payloadcms/drizzle/dist/upsertRow/handleUpsertError.js` -- Postgres `23505` becomes `ValidationError` (path from the constraint or the `Key (...)` detail); other errors rethrown.
- `eslint.config.mjs:22-34` -- `lib/books` may import from `src/lib` only `payload`, `undo`, `errors`, `processState`; `src/fields` is outside `src/lib`.
- `tests/int/userBooks.int.spec.ts` -- `bookFor(user, visibility)` (system create with the user's req, `randomIsbn()`), `createRow()`, the duplicate-row `ValidationError` assertion. `tests/int/effectiveBook.int.spec.ts` -- `createAuthor()` with `unique()` names, `contextFor()` per user. `tests/int/transaction.int.spec.ts` -- rollback assertion pattern, `payload.find` with `overrideAccess: true` to count persisted rows.
- `tests/helpers/harness.ts` -- `createUser()`, `contextFor(user)` (a fresh req each call: two calls give two independent contexts for the race).

## Tasks & Acceptance

**Execution:**
- `src/lib/books/upsertUserBook.ts` -- new: `UserBookChanges`, `BookOverrides`, `upsertUserBook()` per Always -- AD-6/AD-18's one writer.
- `src/collections/UserBooks.ts`, `src/fields/bookFields.ts` -- comments: the writer exists.
- `tests/int/upsertUserBook.int.spec.ts` -- new: the matrix rows; one shared Book and one private Book per user as needed, a shared author for the relation override; the race with two `contextFor()` contexts and `Promise.allSettled`; the row count through `payload.count` with `overrideAccess: true`.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npm run typecheck` and `npm run test:int`, when they run, then all pass (lint: 0 errors).
- Given `src/lib/books/upsertUserBook.ts`, when inspected, then every gateway call takes the context `withTransaction()` handed in, and the override loop iterates `OVERRIDABLE_BOOK_FIELDS`.
- Given a row written by `upsertUserBook`, when `getEffectiveBooks()` reads the Book, then the overridden fields show the written values and a dropped field shows the Book's value again.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 28 findings — high 0, medium 1, low 17, false 9, maybe-false 1
- findings:
  - `[low]` `[patch]` blind: the error for an unreadable Book depends on the change set (override write: `NotFound` from the visibility read; state-only write: the `book` relation's `ValidationError` on `book`). Verified with the reviewer's probe. Patched: the doc comment states both answers; nothing is written either way, and `requireOwnBook()` (E21) gates client ids.
  - `[low]` `[patch]` blind: a key in both `overrides` and `dropOverrides` — the comment's set formula drops it, the loop lets the override win. Patched: the comment now says a key in both is overridden; a caller sending both has a bug either way.
  - `[low]` `[patch]` blind: `overridden` is an unlocked read-modify-write, so two concurrent writes on one existing row can lose the earlier list. Real under READ COMMITTED; one user, two tabs, within milliseconds. Patched: state-only writes no longer touch `overridden` (shrinks the window to two concurrent override writes); the remaining window is documented. No row lock: the spec excludes Drizzle and the gateway offers none.
  - `[low]` `[patch]` blind: `overridden` and the dropped fields are written on every update, state-only ones included. Same root cause; patched together.
  - `[low]` `[patch]` blind: the drop-only write on an existing row is untested, the path D5 takes next to the early return. Patched: a case drops the only override and asserts `overridden: []`, `title: null` and the Book's title through the reader.
  - `[false]` `[reject]` blind: the `UserBookChanges` comment names an admin edit this writer cannot serve. D5 (epics 1735) clears the admin's *own* override of the edited field; the comment meant that row. Wording tightened in the precedence patch.
  - `[low]` `[patch]` blind: nothing says the function applies no ownership gate (any readable Book gets a row). Patched: doc comment names `requireOwnBook()` (E21) as the caller's gate.
  - `[false]` `[reject]` blind: `ratedAt` moves on a same-value re-rating. The spec defines `ratedAt` as the time of the last rating write (FR-46 "most recent rating wins"); E11 keeps the same-star tap from reaching the server. No bad outcome shown.
  - `[low]` `[patch]` edge: state-only or drop-only change on an unreadable Book fails as `VALIDATION` on `book`, not `NOT_FOUND`. Same root cause as the first blind finding; patched together (documented, not changed: the spec sends no Book read for state-only writes).
  - `[low]` `[patch]` edge: concurrent override writes on one row overwrite `overridden`. Same root cause as the unlocked read-modify-write; patched together.
  - `[low]` `[patch]` edge: same key in `overrides` and `dropOverrides`. Same root cause as the precedence comment; patched together.
  - `[false]` `[reject]` edge: `ratedAt` moves when the rating did not change. Same as the blind finding: specified behaviour, no bad outcome.
  - `[false]` `[reject]` edge: Book visibility flips to private between the visibility read and the write. No code path makes a shared Book private (AD-5: sharing is one-way; users have no write access on `books`); only a back-office edit in the same millisecond could, and the window is one transaction.
  - `[medium]` `[patch]` edge: a `title` override of `null` or whitespace blanks the viewer's title (`EffectiveBook.title` becomes `''`; pinned by the 3.22 test). A Book always has a title (`books.title` required, the shape is `string`); the 3.22 triage left the rule to this writer. Patched: a `title` override that normalises to `null` fails with `VALIDATION` on `title` before any write, with a test.
  - `[low]` `[patch]` edge: duplicate ids in `overrides.authors` store duplicate rels rows (no unique index on `user_books_rels`) and the reader shows the author twice. Patched: the array is deduped; the test passes the id twice.
  - `[low]` `[reject]` edge: negative, fractional or infinite `seriesIndex`/`year`/`pages` are stored or fail as `INTERNAL`. Field limits belong to the collection's field set (3.14), not this writer; nothing in everyday use produces `Infinity`, and the fix adds validation beyond a direct correction.
  - `[low]` `[patch]` verification-gap: NFC normalisation unpinned (removing `.normalize('NFC')` keeps every test green). Patched: a decomposed publisher is asserted precomposed.
  - `[low]` `[patch]` verification-gap: `read: false` is never written, so a truthiness slip would pass. Patched: the second write sends `read: false` and asserts it.
  - `[low]` `[patch]` verification-gap: an explicit `undefined` override key is meant to be a no-op but unpinned. Patched: the nothing-to-store case sends `{ overrides: { title: undefined } }`.
  - `[low]` `[patch]` verification-gap (other): error contract differs by input shape on a foreign private Book. Same root cause as the first blind finding; patched together.
  - `[maybe-false]` `[reject]` verification-gap (other): the race test depends on both transactions reaching their find before either commits. Both writers start in one tick with identical round-trip sequences and passed 3/3 for the reviewer and 2/2 here; a forced interleaving would need a hook inside the service. If it ever flakes the harm is a flaky test (low), so rejected with the note.
  - `[false]` `[reject]` intent: tests weight the open-own transaction path; the join path is observed through rollback alone. The rollback assertion does pin the join: an own transaction would have committed the row and the count would be 1.
  - `[low]` `[reject]` intent: the lost race surfaces through `runAction()` as `VALIDATION` with a field path no screen has; the race test is timing-dependent. A double-tapped first write is rare, and a cleaner answer needs a new error code (public surface); the timing point is the maybe-false row above.
  - `[false]` `[reject]` intent: `dropOverrides` is an addition the story does not name. It follows from AD-6 (cleared vs not overridden) and D5; no bad outcome claimed.
  - `[low]` `[patch]` intent: the shared-only rule answers differently at the service and collection surfaces, one path untested. Same root cause as the first blind finding; patched together.
  - `[false]` `[reject]` intent: text normalisation sits in the service, below the "action boundary" the convention names. `lib/account/profile.ts` sets the precedent; the service is the first code to receive the text from every caller.
  - `[false]` `[reject]` intent: seven tests for a three-case AC. The extra cases pin behaviour the diff adds; no bad outcome claimed.
  - `[false]` `[reject]` intent: `ratedAt` refresh on a same-value rating. Same as the blind and edge rows: specified behaviour.

## Design Notes

`overrides` (sparse object, key present = override, `null` = cleared) and `dropOverrides` (names) are two inputs because "clear the title" and "stop overriding the title" are different outcomes under AD-6 and both reach this writer: a user's edit sends the first, an admin's edit of the shared Book sends the second (D5). One pass builds the data:

```ts
const listed = new Set(row?.overridden ?? [])
for (const key of OVERRIDABLE_BOOK_FIELDS) {
  if (overrides && key in overrides) { data[key] = normalise(key, overrides[key]); listed.add(key) }
  else if (drop.has(key)) { data[key] = null; listed.delete(key) }
}
data.overridden = OVERRIDABLE_BOOK_FIELDS.filter((key) => listed.has(key))
```

The shared-Book check reads `visibility` only when `overrides` has keys, so `setRead` and `setRating` on a private Book cost one find and one write.

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:int` -- expected: all pass, `upsertUserBook` included (Postgres on `DATABASE_URL`, `bookeh_test`).
- `npm run test:unit` -- expected: unchanged, all pass.

## Auto Run Result

**Summary.** `lib/books` now has the one writer of `user-books`: `upsertUserBook(ctx, bookId, changes)` runs in `withTransaction()` (joins the caller's transaction or opens its own), finds the viewer's row by Book alone, creates it on the first write and updates it after. `changes` carries `overrides` (sparse, ids only, `null` = cleared), `dropOverrides`, `read` and `rating`. `overridden` is recomputed only when the change set touches overrides, in `OVERRIDABLE_BOOK_FIELDS` order; a dropped field's value is nulled; text is trimmed, NFC-normalised and `''` folded to `null`; author id lists are deduplicated; `rating` moves `ratedAt`. Overrides are refused on a private Book (`VALIDATION` naming each key) and a `title` override that clears the title is refused (`VALIDATION` on `title`), both before any write. A change set with nothing to store creates no row. A lost race between two first writes surfaces as the unique index's `ValidationError`, unchanged.

**Files changed.**
- `src/lib/books/upsertUserBook.ts` -- new: `BookOverrides`, `UserBookChanges`, `upsertUserBook()`.
- `src/collections/UserBooks.ts`, `src/fields/bookFields.ts` -- comments: the writer exists.
- `tests/int/upsertUserBook.int.spec.ts` -- new: 9 tests over the 9 matrix rows plus the drop-only and cleared-title cases.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.23 done.

**Review.** 28 findings (medium 1, low 17, false 9, maybe-false 1). Patched 11 entries (medium 1, low 10): cleared `title` refused; state-only writes no longer rewrite `overridden` (shrinks the unlocked read-modify-write window, now documented); author ids deduplicated; doc comments on precedence of a key in both inputs, the admin's own override (D5), the error on an unreadable Book per input shape, and the absent ownership gate (`requireOwnBook()`, E21); tests gained the drop-only write on an existing row, a decomposed NFC input, `read: false`, an `undefined` override key, a duplicated author id and the cleared-title refusal. Deferred 0. Rejected:
- `ratedAt` moving on a same-value re-rating (three rows): specified as the time of the last rating write; E11 keeps the same-star tap from reaching the server.
- The `UserBookChanges` comment naming an admin edit this writer cannot serve: D5 clears the admin's own override; wording tightened anyway.
- Book visibility flipping to private between the read and the write: no code path makes a shared Book private.
- Unbounded `seriesIndex`/`year`/`pages` values: field limits belong to the collection's field set (3.14).
- The race test's timing dependence (maybe-false, low if true): two writers start in one tick with identical round trips, 5/5 passes across reviewer and run.
- The lost race surfacing as `VALIDATION` with a constraint-derived field path: rare double tap; a cleaner answer needs a new error code.
- Descriptive intent rows (join path pinned by rollback, `dropOverrides` as an AD-6 addition, normalisation in the service as `lib/account` does, seven tests for a three-case AC): no bad outcome claimed.

**Follow-up review:** not recommended. Patched entries: high 0, medium 1, low 10.

**Verification** (main, Postgres on 5432, `bookeh_test`).
- `npx eslint src tests`: 0 errors (36 pre-existing warnings in generated migrations).
- `npm run typecheck`: clean.
- `npm run test:unit`: 29 files, 500 passed.
- `npm run test:int`: 26 files passed, 1 skipped (`migrationSchema`, CI only); `upsertUserBook` 9/9.
- Matrix audit: every row covered by a test that ran and passed.
- Playwright not run (service story, no UI).

**Residual risks.** Two concurrent override writes on one existing row (not first writes) can lose the earlier `overridden` list: the read-modify-write has no row lock and the gateway offers none; one user, two tabs, within milliseconds. A state-only write on an unreadable Book answers `VALIDATION` on `book` from the collection rather than `NOT_FOUND`; callers gate client ids with `requireOwnBook()` (E21). The race test depends on real interleaving of two transactions started in one tick.
