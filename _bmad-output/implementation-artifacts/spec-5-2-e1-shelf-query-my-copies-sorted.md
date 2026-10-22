---
title: '5.2 [E1] Shelf query: my copies, sorted'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: 'e4bb5d643962e1178fc524fe855bfe19815cb6ee'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `lib/shelf` has a URL contract (5.1) but nothing turns a `ShelfQuery` into ordered copies. AD-7 makes it the only code that sorts copies on Book fields.

**Approach:** Add `visibleCopies(viewer)` and a read-only Drizzle query, `shelfIds(ctx, query, range)`, returning the viewer's copy ids (with Book ids) sorted by effective title, effective year or date added, plus the total.

## Boundaries & Constraints

**Always:**
- Read-only SQL through `drizzleFor(ctx)` (`src/lib/payload/drizzle.ts`), with no writes. This is the `lib/shelf` system-privilege place (AD-3).
- `visibleCopies(viewer)` is the one SQL condition that decides which copies a viewer sees. Today it is `copies.owner_id = viewer.id`. Every shelf query, the count included, builds on it.
- The `books` join applies the AD-4 read rule the way `catalogueAccess` does (`src/access/catalogue.ts`): the admin reads every Book; a user reads `visibility = 'shared' OR created_by_id = viewer`. It is a SQL fragment that 5.3–5.5 reuse for the `authors` and `series` joins.
- `user_books` is left-joined on the **viewer** (`owner_id = viewer.id`), never on the copy's owner (AD-6). With no row, the shared values apply.
- An effective field reads the `user_books` column only when the field name is in `user_books.overridden` (a jsonb array). Otherwise it reads the `books` column. A stored override value whose name is not listed is ignored.
- Sorts:
  - `title`: effective title, in the database's default collation (ICU `fi-FI`; no explicit `COLLATE`).
  - `year`: effective year, `NULLS LAST` in both directions.
  - `added`: `copies.created_at`.
- `dir` applies to the sort key. Every sort ends on copy id in the same direction.
- `SHELF_PAGE_SIZE` and `ShelfRange` (the spine's type) live in `query.ts`, which stays free of imports, so the client list (5.11) can use them.

**Never:**
- No `author` sort. That is Story 5.6. `shelfIds` takes a `ShelfQuery` whose `sort` is narrowed to `'title' | 'year' | 'added'`, and 5.6 widens it. There is no runtime fallback or throw.
- No `q` or filters; those are Stories 5.3–5.5, and `query.filters` and `query.q` are not read yet. No `getShelfRows`, hydration, `/data/shelf` or screens (5.8+). No indexes (5.7).
- Nothing lists `books` on its own: every row starts from `copies`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Finnish order | A has copies titled "Zorro" and "Örkki", `sort: 'title', dir: 'asc'` | "Zorro" before "Örkki" | — |
| Override sorts | A overrides shared "Aapinen" to title "Ööpinen" | sorts with "Ö", after "Zorro" | — |
| Year, no year | Books with 1990, 2005, no year; `asc` then `desc` | 1990, 2005, none / 2005, 1990, none | — |
| Two copies of one Book | A has 2 copies of one Book | two rows, ordered by copy id | — |
| Other users | B owns copies of the same and other Books | none of B's copies are in A's result or total | — |
| Paging | `range` past the last row | `ids: []`, `total` unchanged | — |

</intent-contract>

## Code Map

- `src/lib/payload/drizzle.ts` -- `drizzleFor(ctx)`: use per query, never keep the handle. Run the SQL with `.execute(sql\`…\`)`, as in `tests/int/transaction.int.spec.ts:54`. `sql` comes from `@payloadcms/db-postgres/drizzle`.
- `src/access/roles.ts` -- `isAdmin(ctx.user)` for the read rule; `lib/catalogue` imports it the same way.
- `src/access/catalogue.ts:8-12` -- `sharedOrOwnPrivate`, the rule to mirror in SQL.
- `src/lib/shelf/query.ts` -- `ShelfQuery` type; add `ShelfRange` and `SHELF_PAGE_SIZE` here (no imports).
- `src/fields/bookFields.ts` -- `OVERRIDABLE_BOOK_FIELDS`; type the effective-column helper's field argument with `OverridableBookField` so only real fields are accepted.
- Tables: `copies(id, owner_id, book_id, status, notes, created_at)`; `books(id, title, year numeric, visibility, created_by_id)`; `user_books(owner_id, book_id, title, year numeric, overridden jsonb)`. Raw rows come back as `Record<string, unknown>`: convert ids and `count(*)` (bigint, returned as a string) with `Number()`.
- `tests/int/holdings.int.spec.ts:39-64` -- test seeding pattern: books via `payload.create(... overrideAccess: true, req)`, copies via `gateway.create`; overrides via `upsertUserBook(ctx, bookId, { overrides: { title } })` (`src/lib/books/upsertUserBook.ts`). Tests never truncate, so use fresh users per test; the owner scoping isolates them.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/query.ts` -- add `export type ShelfRange = { offset: number; limit: number }` and `export const SHELF_PAGE_SIZE = 50` -- one fixed page size (AD-7), importable by the client list.
- `src/lib/shelf/visibleCopies.ts` -- create `visibleCopies(viewer)` (SQL condition on `copies`) and `readableBy(viewer, alias)` (AD-4 read condition on a `books`/`authors`/`series` alias) -- the two fragments every shelf query shares.
- `src/lib/shelf/shelfIds.ts` -- create `shelfIds(ctx, query, range): Promise<{ ids: { copyId: number; bookId: number }[]; total: number }>`. It runs a page query and a count over the same FROM/WHERE: copies, inner join on readable `books`, left join on the viewer's `user_books`. A private helper builds each effective column -- the ordered ids that `getShelfRows` (5.8) hydrates.
- `tests/int/shelfIds.int.spec.ts` -- create the tests the story names:
  - a two-user test: B's copies never appear in A's ids or total;
  - a title sort test: "Örkki" after "Zorro", with an overridden title sorting by its override;
  - a year test: no year last in `asc` and `desc`.

**Acceptance Criteria:**
- Given users A and B with copies of shared Books, some of the same Book, when `shelfIds` runs as A, then only A's copies appear and `total` counts only them.
- Given A's copies titled "Zorro" and "Örkki", and a shared Book A has overridden to a title starting with "Ö", when sorted by `title` `asc`, then both "Ö" titles come after "Zorro".
- Given Books with and without a year, when sorted by `year` `asc` and then `desc`, then the Books with no year come last both times.
- Given any sort, when two rows tie on the sort key, then they are ordered by copy id; and `range` maps to `offset`/`limit`.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 23 findings — high 0, medium 4, low 13, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: the "Örkki after Zorro" test also passes under C (byte) collation, so it doesn't guard fi-FI — the title test now adds "Åke" and "Ärrä" (Finnish Å < Ä, bytes Ä < Å) and asserts the full order.
  - `[low]` `[reject]` Blind: the `readableBy` inner join hides a viewer's copies of a Book that stopped being readable — AD-7 requires the AD-4 rule in the joins; a shared Book turns private only by a back-office edit, which no flow makes.
  - `[medium]` `[patch]` Blind: the two-user test has no `user_books` row of B's, so a join on the copy's owner instead of the viewer would pass (AD-6) — B now overrides Book x's title before A's queries; exact ids and total catch a leak or duplication.
  - `[low]` `[patch]` Blind: the `effective('year')` override branch never runs — the year test adds a 1980 Book whose year A cleared, expected with the no-year copies, last both ways. The "unlisted stored value" half cannot occur: `upsertUserBook` nulls a dropped field's value.
  - `[low]` `[reject]` Blind: `range` reaches SQL unchecked and `limit` is uncapped — no caller yet; `/data/shelf` (5.11) validates client input and 5.12 sets its own cap; guards here add branches for input nothing builds.
  - `[low]` `[reject]` Blind: page and count are two statements, so `total` can drift if a copy changes in between — a millisecond window, and the list reloads after every action (AD-7); a single-statement count with an empty-page fallback adds a branch.
  - `[low]` `[reject]` Blind: `readableBy`'s `alias` is `string`, not a union — only `'b'` exists; a union of future aliases builds ahead of 5.3–5.5.
  - `[low]` `[reject]` Blind: `readableBy` lives in `visibleCopies.ts` — internal to `lib/shelf`, not a spine contract; the file holds the visibility fragments, and a rename names no harm.
  - `[low]` `[reject]` Edge: negative or NaN `offset`/`limit` gives a database error — same root as the unchecked-`range` finding; rejected on the same grounds.
  - `[low]` `[reject]` Edge: page and count can disagree outside a transaction — same root as the two-statement finding; rejected on the same grounds.
  - `[false]` `[reject]` Edge: a null effective title sorts first in `desc` — `upsertUserBook` throws `VALIDATION` on a title override that normalises to null, and `books.title` is required, so no null title reaches the sort.
  - `[medium]` `[patch]` Verification gap: the `user_books` join on the viewer is unguarded — grouped with the Blind finding; same patch.
  - `[medium]` `[patch]` Verification gap: `readableBy`'s own-private arm is never exercised, so dropping `created_by_id = viewer` would hide every manually entered Book — the two-user test adds A's copy of a private Book A created, expected in ids and total.
  - `[low]` `[patch]` Verification gap: overridden or cleared year is unverified — grouped with the Blind year finding; same patch.
  - `[low]` `[reject]` Intent: `SHELF_PAGE_SIZE` is not used by `shelfIds` — the page size is the callers' fetch unit (5.8, 5.11); same root as the unchecked-`range` finding.
  - `[medium]` `[patch]` Intent: the AD-4 read rule is applied only to `books` and no test drives `readableBy` — no `authors` or `series` join exists before 5.3–5.5; the untested half is grouped with the private-arm finding; same patch.
  - `[false]` `[reject]` Intent: copy-id tie direction follows `dir` — the AC fixes no direction; the spec chose it and the test pins it.
  - `[low]` `[reject]` Intent: the `added` test cannot tell `created_at` order from copy-id order — both rise on every insert and no path backfills `created_at`, so the difference is unreachable in use.
  - `[low]` `[patch]` Intent: year overrides and the unlisted-value rule are untested — grouped with the Blind year finding; same patch.
  - `[false]` `[reject]` Intent: collation comes from the database default, not the query — AD-7 says text sort relies on the database's fi-FI collation; `tests/int/collation.int.spec.ts` checks the databases, and the patched title test now fails under C.
  - `[false]` `[reject]` Intent: `shelfIds` does not accept `sort: 'author'` — author sort is Story 5.6 (STORY-SLICING E15); the narrowed type is the spec's choice.
  - `[false]` `[reject]` Intent: no screen shows Finnish order — E1 is a service story; the collection screen is Story 5.10.
  - `[false]` `[reject]` Intent: sprint status and spec are not committed — finalization commits both and sets 5.2 to done.

## Design Notes

The effective column, as a pattern. The field name is a typed constant, never input:

```sql
CASE WHEN ub.overridden ? 'title' THEN ub.title ELSE b.title END
```

A missing `user_books` row makes the test null, so the `books` value applies.

`shelfIds` returns Book ids next to copy ids so 5.8 can hydrate without a second lookup. It also returns `total`, because the count must share this query's FROM/WHERE. Neither is a new shared shape: `shelfIds` is internal to `lib/shelf` and not in the spine.

## Verification

**Commands:**
- `npm run test:int -- tests/int/shelfIds.int.spec.ts` -- expected: passes
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary:** Added the base of the shelf query (AD-7). `shelfIds(ctx, query, range)` returns the viewer's copy ids with their Book ids, plus the total. Rows are sorted by effective title (fi-FI), effective year (no year last both ways) or date added, and every sort ends on copy id. `visibleCopies(viewer)` decides which copies are seen; `readableBy(viewer, alias)` applies the AD-4 read rule to the `books` join; `user_books` joins on the viewer. `SHELF_PAGE_SIZE` and `ShelfRange` are in `query.ts`.

**Files changed:**
- `src/lib/shelf/query.ts`: `ShelfRange` and `SHELF_PAGE_SIZE = 50`; still no imports.
- `src/lib/shelf/visibleCopies.ts`: `visibleCopies` and `readableBy` SQL fragments.
- `src/lib/shelf/shelfIds.ts`: the page and count queries, the `effective()` column helper (title and year), sorts `title`, `year` and `added`.
- `tests/int/shelfIds.int.spec.ts`: 3 integration tests: two users (with B's override and A's private Book), Finnish title order with an override, year with no year and a cleared year.

**Review findings:** 23 in all: 4 patch groups (2 `medium`, 2 `low`), 0 deferred, 13 rejected. The reasons are in the Review Triage Log.
- **Patched:** test gaps only.
  - The title test now fails under C collation.
  - B's override can't reach A's rows.
  - A's private Book is listed.
  - A cleared year sorts last.
  - The implementer put each of the four bugs into the source in turn and confirmed the matching test fails.
- **Rejected:**
  - unchecked or uncapped `range` (3 rows);
  - separate page and count statements (2 rows);
  - copies hidden when their Book stops being readable;
  - the `alias` type and the file name;
  - the `added` order test;
  - 6 `false` rows, including the null-title case, which cannot occur because `upsertUserBook` rejects it.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 2, low 2. Both medium patches were test gaps, closed by assertions that fail when the bug is put back, so no unverified risk is left.

**Verification:**
- `npm run test:int -- tests/int/shelfIds.int.spec.ts`: 3 passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors (the 40 warnings were already there).
- Matrix audit: every row is covered by a test that ran.

**Residual risks:**
- `range` is not validated; the `/data/shelf` handler (5.11) must validate client input before calling.
- `total` comes from a second statement, so it can be off for a moment if a copy changes in between.
- Nothing calls `shelfIds` yet; `getShelfRows` arrives in 5.8.
