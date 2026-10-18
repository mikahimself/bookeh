---
title: 'Story 3.22: [B8] Effective Book'
type: 'feature'
created: '2026-10-18'
baseline_revision: 'c4e7d3bb0eeab67b17d4bf6f951fe4bad4e71550'
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

**Problem:** `books` and `user-books` exist (3.18, 3.19) but nothing reads them together: every later screen, the shelf hydration (E17), Book detail (E8) and the lookup's "existing" answer (C6) would each re-derive which value the viewer sees. Nothing produces a media URL either, and AD-10 allows exactly one producer.

**Approach:** Add `lib/books` with the shared shapes `EffectiveBook` and `UserBookState`, `getEffectiveBooks(ctx, bookIds)` (the one reader that lays the viewer's `user-books` row over the Book) and the pure `coverUrl()`. Integration tests prove the override rules with two users on one Book.

## Boundaries & Constraints

**Always:**
- Declare `Named`, `EffectiveBook`, `TagKind` and `UserBookState` in `src/lib/books` exactly as the spine's Shared shapes (`// src/lib/books`). `UserBookState.tags` is typed now; its reader arrives with E11/G-stories. Document that.
- `getEffectiveBooks(ctx, bookIds: readonly number[]): Promise<Map<number, EffectiveBook>>`, keyed by Book id. Ids the viewer cannot read (AD-4: another user's private Book) are absent, not an error. An empty input returns an empty map without a query.
- Reads go through `gateway.find` on `books` and `user-books` (AD-2, AD-16). `user-books` is scoped to the viewer by its access alone; no `owner` condition in the query (AD-6: the row is always the viewer's). Pass `pagination: false`: Payload's default page is 10 docs.
- A field is overridden iff its name is in the row's `overridden`; then the row's stored value applies, an empty value (`null`, `''`, `[]`) meaning cleared. A stored value whose name is not listed is ignored. A cleared text or number field is `null`; `title` is a `string` in the shape, so a cleared title is `''`. A missing row means no overrides (`overridden: []`).
- Relationship overrides (`authors`, `series`) and shared relations map to `Named` (`{ id, name }`); an unpopulated id (unreadable target) is dropped. `genres` names come from `genreName(genre, ctx.user.language)` (3.17 placed it here for this). `themes` is the Book's list or `[]`. `overridden` is the row's list as stored.
- `coverUrl(cover: { filename: string } | { isbn13: string }): string` is pure: a saved cover is `/api/media/file/<encodeURIComponent(filename)>`, byte-identical to the `url` Payload computes (`node_modules/payload/dist/uploads/generateFilePathOrURL.js`, `serverURL` unset here); an unsaved Book's preview is `/data/cover/<isbn13>` (AD-14; the handler lands in D10). `EffectiveBook.coverUrl` is `coverUrl({ filename })` of the populated cover, else `null`.
- `rawMetadata` never reaches `EffectiveBook` (AD-9).
- No `any`; strict TS; no `console.*`.

**Never:**
- No writer of `user-books`: `upsertUserBook()` is B9. Enforcing "overrides only on shared Books" is the writer's; this reader applies whatever a row lists.
- No `getUserBookState` reader, no `requireOwnBook`, no `getHoldings` (E21, E26), no Drizzle (AD-7: the shelf alone), no `Cover` component or route handler (D10), no `src/app` change.
- No barrel `index.ts`, no caching (Caching convention), no schema or migration change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No row | Shared Book with authors, series, genres, themes; viewer has no `user-books` row | Book values; `authors`/`series`/`genres` as `Named`, genre names by viewer language; `overridden: []`; `coverUrl: null` without a cover | No error expected |
| An override | Row `overridden: ['title', 'authors']`, stored title and other authors; also a stored `publisher` not listed | Row title and authors; Book publisher; `overridden: ['title', 'authors']` | No error expected |
| A cleared field | Row `overridden: ['subtitle', 'series']` with `null` values | `subtitle: null`, `series: null` though the Book has both | No error expected |
| Two viewers | A has an override row, B has none, same Book | A sees the override; B sees Book values | No error expected |
| Unreadable id | B's private Book id in A's request | Absent from the map; readable ids still present | No error expected |
| Cover | Book with a `media` cover | `coverUrl` equals Payload's `url` for that media doc | No error expected |
| Empty input | `[]` | Empty map | No error expected |

</intent-contract>

## Code Map

- `src/lib/books/genreName.ts` -- the only file in `lib/books`; `genreName(genre, locale)`. `ctx.user.language` is `'en' | 'fi'`, assignable to `Locale` (`src/i18n/locale.ts`).
- `src/lib/payload/gateway.ts` -- `find(ctx, { collection, where, depth, pagination, select })`: Local API with the context user and `overrideAccess: false`. Option types from `Parameters<typeof payload.find>`; `pagination?: boolean` exists (`node_modules/payload/dist/collections/operations/local/find.d.ts:68`).
- `src/lib/payload/context.ts` -- `Context = { req, user, transactionID? }`; `user` is `TypedUser` with `language`.
- `src/lib/account/profile.ts` -- service style: `import * as gateway`, named verb-first exports, a `toX()` mapper, doc comments citing the spine.
- `src/payload-types.ts` -- `Book` (`authors?: (number | Author)[] | null`, `series?: (number | null) | Series`, `cover?: (number | null) | Media`, `genres`, `themes?: string[] | null`, `source`, `visibility`, `isbn13`), `UserBook` (the same override fields, `overridden` typed to the ten names), `Media.url`/`filename`. Populated relations are `number | Doc` unions: one narrowing helper (`typeof v === 'object'`) serves all.
- `src/fields/bookFields.ts` -- `OVERRIDABLE_BOOK_FIELDS` / `OverridableBookField`: iterate this, not a hand-written list, so the reader and the field stay one declaration (AD-6).
- `src/collections/UserBooks.ts:16-25` -- doc comment says `EffectiveBook` (B8) "will read it"; reword to present tense. `src/fields/bookFields.ts:97-101` likewise mentions B8.
- `src/access/owner.ts`, `src/access/catalogue.ts` -- `read` is `owner = user` and shared-or-own-private: the gateway `find` on each collection already applies AD-6 and AD-4.
- `node_modules/payload/dist/uploads/generateFilePathOrURL.js:17-24` -- `url` = `formatAdminURL({ apiRoute: '/api', path: '/media/file/' + encodeURIComponent(filename) })`, relative when `serverURL` is unset (`src/payload.config.ts` sets none).
- `eslint.config.mjs:24-36` -- `lib/books` may import from `src/lib` only `payload`, `undo`, `errors`, `processState`. `src/i18n` is outside `src/lib`, so `genreName`'s import stands.
- `tests/int/userBooks.int.spec.ts` -- `bookFor()` (system create of a Book with `req` from `contextFor(user)`), `createRow()` through the gateway, `randomIsbn` from `tests/helpers/isbn.ts`. `tests/int/media.int.spec.ts:21-48` -- `png()` with sharp and `systemCreate` of a media doc; `afterAll` deletes the rows so files go too.
- `tests/int/books.int.spec.ts:42-55` -- `systemCreate(user, visibility, isbn13, extra)` with `overrideAccess: true`. Authors, series and genres rows: `payload.create` with `overrideAccess: true` and unique names (`nameKey` is unique among shared rows; use a UUID suffix).
- `tests/helpers/harness.ts` -- `createUser()`, `contextFor()`.

## Tasks & Acceptance

**Execution:**
- `src/lib/books/effectiveBook.ts` -- new: `Named`, `EffectiveBook`, `TagKind`, `UserBookState`, `getEffectiveBooks()` per Always -- AD-6's one reader.
- `src/lib/books/coverUrl.ts` -- new: `coverUrl()` per Always -- AD-10's one URL producer.
- `src/collections/UserBooks.ts`, `src/fields/bookFields.ts` -- comments: B8 exists now.
- `tests/int/effectiveBook.int.spec.ts` -- new: the matrix rows (two users, one Book; a media doc for the cover row, deleted in `afterAll`).

**Acceptance Criteria:**
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (lint: 0 errors in `src` and `tests`).
- Given a `media` doc created in the test, when `coverUrl({ filename })` runs, then it equals that doc's `url` and starts with `/api/media/file/`; given `{ isbn13: '9789510000000' }`, then it is `/data/cover/9789510000000`.
- Given `src/lib/books/effectiveBook.ts`, when inspected, then the override loop is driven by `OVERRIDABLE_BOOK_FIELDS` and no field name list is repeated.

## Spec Change Log

## Review Triage Log

### 2026-10-18 — Review pass
- verdicts: 18 findings — high 0, medium 0, low 13, false 4, maybe-false 1
- findings:
  - `[low]` `[patch]` blind: a listed text override stored as `''` reaches `EffectiveBook` as `''`, not `null` (Payload folds `''` only for number, checkbox and relationship fields). Patched: `pick()` folds `''` to `null`; `title` still becomes `''` through `?? ''`.
  - `[low]` `[reject]` blind: `depth: 1` on `user-books` also populates `book` and `owner`. Real but one batched find each, milliseconds at a page of rows; the fix is `select`/`populate` tuning, more than a direct correction, and E14's shelf timing test at 10,000 copies is where it would show.
  - `[low]` `[patch]` blind: the `books` find populates `createdBy` and returns `rawMetadata` to an admin viewer (the owner is the admin). Patched: `select: { rawMetadata: false, createdBy: false }` on that find.
  - `[low]` `[patch]` blind: `...picked` spreads raw `authors`/`series` relation values and relies on key order to replace them. Patched: destructured `{ authors, series, ...scalars }` and spread `scalars`.
  - `[low]` `[patch]` blind: `coverUrl({ isbn13 })` accepts any string with no documented contract. Patched: the value is URI-encoded and the doc comment names the argument a normalised ISBN-13 as `SourceResult.isbn13` and `books.isbn13` carry it.
  - `[maybe-false]` `[reject]` blind: `Named` in `lib/books` cannot be imported by `lib/copies`, `lib/wishlists`, `lib/people` under the lint zones. The spine declares `CopyLine`, `EntryLine` and `Holdings` in `lib/books` too, so no such import is planned; if a consumer ever needs it, the fix is one `except` line (would be low).
  - `[low]` `[reject]` blind: test helpers rebuild `contextFor(user)` per call, and the unreadable-target drop is proven for the Book's relations only. Cosmetic noise plus a test-only ask with no reachable row-side case today (`readableRelation` refuses an unreadable override target at write time).
  - `[low]` `[patch]` blind: `bookFields.ts` comment names `upsertUserBook()` as if written. Patched: "(B9, not yet written)".
  - `[low]` `[reject]` edge: a cleared `title` yields `''` with no fallback to the shared title. That is AD-6's cleared-vs-not-overridden rule as the spec states it; the proposed fallback contradicts it, and whether a title may be cleared at all is `upsertUserBook()`'s (B9) to decide. No screen clears a title today.
  - `[low]` `[patch]` edge: `isbn13` in `coverUrl` is not encoded or validated. Same root cause as the blind finding above; patched together.
  - `[low]` `[patch]` verification-gap: `pagination: false` is unpinned (removing both lines keeps 6/6 passing; a shelf page over ten Books would silently truncate). Patched: an 11-Book case asserts 11 entries.
  - `[low]` `[patch]` verification-gap: cleared `title` → `''` is unpinned. Patched with the `''` fold: B's row on the same Book clears `title` (`null`) and `subtitle` (`''`), asserting `''` and `null`.
  - `[false]` `[reject]` intent: "the only media URLs the frontend uses" is not exercised at the frontend. The slicing assigns the `Cover` component and `/data/cover` handler to D10, which depends on B8; nothing under `(frontend)` renders a cover yet, so there is no second producer to catch.
  - `[false]` `[reject]` intent: "every screen shows a Book the same way" is a screen-level property. Same reasoning: a service story can only make it possible; E8/E17/C6 consume this reader.
  - `[low]` `[patch]` intent: the AC's "two users seeing their own overrides on one Book" was tested with one row. Patched: A and B both hold a row on the same Book and each sees their own; a third user without a row keeps the no-row shape assertion.
  - `[low]` `[patch]` intent: `''`/`[]` stored under `overridden` were not normalised. Same root cause as the first blind finding; patched together (`[]` already maps to `[]`/`null` through the relation mapping).
  - `[false]` `[reject]` intent: additions beyond the AC (unreadable ids absent, per-viewer genre names, empty-input short-circuit, `UserBookState` declared). All from the spine and the slicing; no bad outcome claimed.
  - `[false]` `[reject]` intent: tests build contexts with `contextFor()` and write the row with `gateway.create`. AD-16 sanctions explicit-user contexts in tests; the sanctioned writer (B9) does not exist yet. No bad outcome claimed.


## Design Notes

A `Map` rather than an array: callers (E17 shelf rows, E8 detail, C6) hold ordered ids and look each one up; a missing key is "not readable", which is exactly the AD-4 answer and needs no sentinel. Two finds, one per collection, both with `depth: 1` so relations arrive as docs; the row is keyed by its `book` id. The merge is one pass over `OVERRIDABLE_BOOK_FIELDS`:

```ts
const overridden = new Set(row?.overridden ?? [])
const pick = <K extends OverridableBookField>(key: K) =>
  overridden.has(key) ? (row?.[key] ?? null) : (book[key] ?? null)
```

`coverUrl` takes the filename, not the `Media` doc, so the unsaved-Book form and the saved form sit in one function and no caller touches `media.url`. It stays pure (no `ctx`): `routes.api` is Payload's default and the int test pins the string against Payload's own `url`, so a route change fails loudly.

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, `effectiveBook` included (needs the Postgres on `DATABASE_URL`, here port 5434).

## Auto Run Result

**Summary.** `lib/books` now holds the spine's shapes (`Named`, `EffectiveBook`, `TagKind`, `UserBookState`) and the one reader `getEffectiveBooks(ctx, bookIds)`: two gateway finds (`books` without `rawMetadata`/`createdBy`, then the viewer's `user-books` rows, both `depth: 1`, `pagination: false`), merged in one pass over `OVERRIDABLE_BOOK_FIELDS`. A field is overridden iff listed; a listed `null` or `''` is cleared (`null`, `title` `''`); unlisted stored values are ignored; a missing row means no overrides; unreadable Book ids are absent from the returned `Map`; relations map to `Named`, genre names by the viewer's language; `themes` pass through. `coverUrl()` is the pure producer of `/api/media/file/<filename>` (pinned against Payload's own `url`) and `/data/cover/<isbn13>`.

**Files changed.**
- `src/lib/books/effectiveBook.ts` -- new: shapes and `getEffectiveBooks()`.
- `src/lib/books/coverUrl.ts` -- new: `coverUrl()`.
- `src/collections/UserBooks.ts`, `src/fields/bookFields.ts` -- comments: the reader exists, the writer (B9) does not yet.
- `tests/int/effectiveBook.int.spec.ts` -- new: 8 tests over the 7 matrix rows plus the two-row and 11-Book cases.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.22 done.

**Review.** 18 findings (low 13, false 4, maybe-false 1). Patched 7 rows in 5 entries, all low: `''` folded to `null` in the merge; `select` excludes `rawMetadata` and `createdBy` on the `books` read; relations destructured out of the spread; `coverUrl`'s ISBN branch encoded and documented; one comment tense; tests gained B's row on the same Book (cleared `title` → `''`, `subtitle` `''` → `null`), a third user for the no-row shape and an 11-Book paging pin. Deferred 0. Rejected:
- `depth: 1` on `user-books` populating `book` and `owner`: one batched find each; tuning is more than a correction and E14 times the shelf.
- `Named` unreachable from `lib/copies` and friends under the lint zones: `CopyLine`/`Holdings` live in `lib/books` per the spine, so no such import is planned (maybe-false, low if true).
- Test helper noise and a row-side unreadable-target test: no reachable case today.
- A cleared `title` falling back to the shared title: contradicts AD-6; whether a title may be cleared is B9's.
- Frontend-surface claims ("only media URLs", "every screen"): D10 and the screens consume this reader; nothing renders a cover yet.
- Spine-driven additions and the test context style: no defect claimed.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 5.

**Verification** (worktree `story-3-22-effective-book`, Postgres on 5434).
- `npx eslint src tests`: 0 errors (28 pre-existing warnings in generated migrations).
- `npm run typecheck`: clean.
- `npm run test:unit`: 29 files, 500 passed.
- `npm run test:int`: 23 files passed, 1 skipped (`migrationSchema`, push on); `effectiveBook` 8/8.
- Reviewer probes: removing `pagination: false` fails the 11-Book case; a `subtitle: ''` override reads as `null`.
- Playwright not run (service story, no UI).

**Residual risks.** `coverUrl` does not honour `NEXT_BASE_PATH`/`NEXT_TRAILING_SLASH`; neither is set, and the int test would fail if Payload's `url` changed. `user-books` is read at `depth: 1`, which also populates `book` and `owner`; revisit if E14 shows it.
