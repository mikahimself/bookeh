---
title: '5.4 [E3] Shelf query: scalar filters'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: 'cb11637b73bd9befd9c4b5906f115314efb651e2'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `shelfIds` ignores `ShelfQuery.filters`, so the collection cannot be narrowed by publisher, year, language, pages, status, location, read or rating (FR-25).

**Approach:** Add `scalarFilters(filters): SQL | undefined` in `lib/shelf` that turns those eight fields into one condition on the shelf aliases. `shelfIds` ANDs it into the shared FROM/WHERE next to `textSearch`, so the page and the count both apply it.

## Boundaries & Constraints

**Always:**
- Fields AND together; several values in one field OR (`in (…)`). An absent field, or an empty value list, adds no condition.
- Book fields use effective values (AD-6) through `effective()`: `publisher`, `language`, `year`, `pages`. Add `pages` to `ShelfField` in `effective.ts`.
- `publisher` and `language` match the effective value exactly, as `filterValues()` and `suggest()` hand them out.
- `year` and `pages` are inclusive ranges, either end open. An active range (at least one end set) excludes copies whose effective value is null, including an override that cleared it. `[undefined, undefined]` adds no condition.
- `location` matches `copies.location_id`, `status` matches `copies.status`.
- `read` and `ratingMin` read the viewer's `ub` row; a missing row is unread and unrated. `read: true` → `ub.read` is true; `read: false` → not read, missing row included. `ratingMin: n` → `ub.rating >= n`; unrated never matches.
- All values are bound parameters, never raw SQL.

**Never:**
- No author, series or genre filter (5.5); no tag or theme filter (Epic 9). Those keys stay ignored.
- No indexes (5.7), no change to `query.ts` parsing, no new sort.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| OR within a field | Copies with language `fi`, `sv`, `en`; `language: ['fi','sv']` | the `fi` and `sv` copies; total 2 | — |
| AND across fields | `status: ['owned']`, `language: ['fi']` | only owned `fi` copies | — |
| Open range | Years 1990, 2000, null; `year: [2000, undefined]` | the 2000 copy only | — |
| Override | Shared year 1990, A overrides 2005; `year: [2000, undefined]` | listed for A | — |
| Cleared override | Shared pages 300, A clears pages; `pages: [undefined, 500]` | not listed for A | — |
| No user-books row | `read: false` / `ratingMin: 1` | listed / not listed | — |
| Rating at least | Ratings 2, 4, unrated; `ratingMin: 3` | the 4 only | — |

</intent-contract>

## Code Map

- `src/lib/shelf/shelfIds.ts` -- shared `from` (aliases `copies`, `b`, `ub`); `where` already appends `textSearch`. Doc comment says filters are not applied yet; update it (5.5 adds author, series, genre).
- `src/lib/shelf/effective.ts` -- `effective(field)`, `ShelfField` and `COLUMNS`; widen with `pages`.
- `src/lib/shelf/query.ts:17-36` -- `ShelfQuery['filters']` shape; read only.
- Columns: `copies(status, location_id)`, `books`/`user_books` `publisher varchar`, `language varchar`, `year numeric`, `pages numeric`; `user_books(read boolean default false, rating numeric)`.
- Drizzle `sql` expands an interpolated JS array to `($1, $2, …)`, so `x in ${values}` works.
- Tests: `tests/int/shelfIds.int.spec.ts:24-45` (`sharedBook`, `copyOf`, fresh users); copy data with `status`/`location` and `locationOf` in `tests/int/shelfValues.int.spec.ts:60-80`; read, rating and overrides via `upsertUserBook(ctx, bookId, { read, rating, overrides, dropOverrides })` in `src/lib/books/upsertUserBook.ts:82`.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/effective.ts` -- add `pages` to `ShelfField` and `COLUMNS`.
- `src/lib/shelf/filters.ts` -- create `scalarFilters(filters: ShelfQuery['filters']): SQL | undefined`, one condition per present field joined with `and`, wrapped in parentheses; `undefined` when none applies.
- `src/lib/shelf/shelfIds.ts` -- AND `scalarFilters(query.filters)` into `from`'s `where`; update the doc comment.
- `tests/int/shelfFilters.int.spec.ts` -- integration tests: each of the eight fields (with `total`), OR within one field, AND across two, open-ended ranges excluding null, effective values (override and cleared override), missing `user-books` row for `read` and `ratingMin`.

**Acceptance Criteria:**
- Given A's copies and `ShelfQuery.filters` with several fields, when `shelfIds` runs, then only copies matching every field are listed, a field with several values matches any of them, and `total` counts only the listed copies.
- Given an active `year` or `pages` range with one end open, when it applies, then copies whose effective value is null are not listed and the open end is unbounded.
- Given A has overridden a Book's publisher, language, year or pages, when A filters on that field, then the override decides the match, not the shared value.
- Given A has no `user-books` row for a Book, when A filters `read: false`, then its copies are listed; when A filters `read: true` or any `ratingMin`, then they are not.
- Given `location` or `status` values, when they apply, then they match the copy's own location and status, so two copies of one Book can differ.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 13 findings — high 0, medium 1, low 7, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: `ratingMin` "at least" is not pinned; `>=` mutated to `>` passes both assertions — added `ratingMin: 4` → the rating-4 copy only, guarding the AC's "rating means at least".
  - `[low]` `[reject]` Blind: `q` and filters are never tested together — the code ANDs both into the shared `from` (read and confirmed); no AC or spine rule names the combination, so CLAUDE.md rejects a test-only ask.
  - `[low]` `[patch]` Blind: the `narrowing` list prefixes ` and ` and joins with no separator — the where is now one `sql.join([visibleCopies, …conditions], ' and ')`.
  - `[false]` `[reject]` Blind: the range tuple type is written twice — `inRange` is called with `filters.year`/`pages`, so any change to `ShelfQuery`'s tuple fails typecheck at the call; they cannot drift silently.
  - `[low]` `[patch]` Blind: `shelfIds` doc omits `tag` and `theme` as ignored — comment now names them (Epic 9).
  - `[false]` `[reject]` Blind: "exactly" in the `filters.ts` comment is vague — the comment already names `filterValues()` and `suggest()` as the suppliers; exact means exact.
  - `[low]` `[reject]` Blind: test helpers copied into a fourth file — a shared seeding module is an abstraction no story has asked for (CLAUDE.md), rejected on the same grounds in 5.3.
  - `[low]` `[patch]` Blind: `randomUUID` location suffix is needless (fresh users, uniqueness per owner) and `nameKey: 'ignored'` is unexplained — suffix dropped, comment says the `nameKeyField` hook derives it.
  - `[low]` `[patch]` Blind: the regenerated `epic-5-context.md` is not in the reviewed patch and drops some detail — it is this run's required recompile (the spine changed after it); committed separately as `docs:` so the 5.4 diff stays scannable. The compile rules ask for a distilled file; the dropped details remain in DESIGN.md/EXPERIENCE.md.
  - `[low]` `[reject]` Verification gap: search text and filters together never tested — same root as the Blind `q`+filters row; the layer itself filed it `defer` and notes CLAUDE.md rejects it.
  - `[false]` `[reject]` Intent: no user surface applies a filter (R2) — the story's AC is on `ShelfQuery.filters`; the epic places `getShelfRows` and the screens in 5.8+.
  - `[false]` `[reject]` Intent: OR not shown for publisher and status — the AC asks for "OR within one" field; language and location show it.
  - `[false]` `[reject]` Intent: publisher/language could match case-insensitively — publishers have no `nameKey`, and the only values reaching the filter are the exact strings `suggest()` and `filterValues()` return, so a case-folded reading has no supplier.

## Design Notes

Exact match for `publisher` and `language` is deliberate: the Filter panel offers them from `filterValues()` and `suggest()`, which return the stored effective strings, so a chip or a pick always matches itself.

```ts
const conditions: SQL[] = []
if (f.language?.length) conditions.push(sql`${effective('language')} in ${f.language}`)
if (f.year) range(effective('year'), f.year) // `>= from` and/or `<= to`; nulls fail both
if (f.read !== undefined) conditions.push(f.read ? sql`ub.read is true` : sql`ub.read is not true`)
return conditions.length ? sql`(${sql.join(conditions, sql` and `)})` : undefined
```

## Verification

**Commands:**
- `npm run test:int -- tests/int/shelfFilters.int.spec.ts tests/int/shelfIds.int.spec.ts tests/int/shelfSearch.int.spec.ts` -- expected: passes
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary:** `shelfIds` now applies the scalar filters in `ShelfQuery.filters` (FR-25). `scalarFilters(filters)` builds one condition on the shelf aliases: fields AND, values within a field OR (`in (…)`).
- Publisher and language match the effective value (AD-6) exactly.
- Year and pages are inclusive ranges, either end open. A null effective value, including a cleared override, never matches an active range.
- Status and location read the copy itself.
- Read and rating read the viewer's `user_books` row: `read: false` includes a missing row, and `ratingMin` never matches unrated.

The condition joins `visibleCopies` and `textSearch` in the shared `where`, so `total` narrows with the page. Author, series and genre (5.5), tag and theme (Epic 9) stay ignored.

**Files changed:**
- `src/lib/shelf/filters.ts`: new, `scalarFilters()`.
- `src/lib/shelf/effective.ts`: `pages` added to `ShelfField`.
- `src/lib/shelf/shelfIds.ts`: the `where` is one `and`-join of `visibleCopies`, `textSearch` and `scalarFilters`; doc comment updated.
- `tests/int/shelfFilters.int.spec.ts`: 5 integration tests: OR and AND with `total`; publisher and language exact and by override; year and pages ranges (open ends, no value, override, cleared override); location and status per copy; read and rating with a missing row and another user's row.
- `epic-5-context.md`: recompiled because the spine changed after it was built (separate `docs:` commit).

**Review findings:** 13 in all, 1 medium and 4 low patched, 0 deferred, 8 rejected. The reasons are in the Review Triage Log.
- **Patched:** rating "at least" pinned with `ratingMin: 4`; the where built as one join; `tag` and `theme` named as ignored in the doc comment; test location names simplified and `nameKey` explained; the regenerated epic context committed separately.
- **Rejected:** `q` with filters untested (2 rows, test-only ask with no named criterion); range tuple duplicated; vague "exactly"; shared test helpers; no user surface; OR for every field; case-insensitive publisher/language.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 1, low 4. The medium patch is a test assertion that fails when `>=` becomes `>`.

**Verification:**
- `npm run test:int -- tests/int/shelfFilters.int.spec.ts tests/int/shelfIds.int.spec.ts tests/int/shelfSearch.int.spec.ts`: 12 passed, against the worktree's own Postgres on port 5434.
- `npm run lint`: 0 errors (40 warnings, all in files this story does not touch).
- `tsc --noEmit`: exit 0.
- Matrix audit: every row is covered by a test that ran.

**Residual risks:**
- No indexes; filter timing at 10,000 copies is measured in 5.7.
- Publisher and language are case- and whitespace-sensitive by design; "WSOY" and "Wsoy" are separate values.
- Built in the worktree `.claude/worktrees/story-5-4-scalar-filters` on branch `story/5-4-scalar-filters` while 5.8 is in progress on main. 5.8 touches `shelfIds.ts` (`export` on `SortedQuery`), so expect a small merge there.
