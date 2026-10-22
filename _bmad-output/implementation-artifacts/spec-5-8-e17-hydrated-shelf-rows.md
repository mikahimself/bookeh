---
title: '5.8 [E17] Hydrated shelf rows'
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

**Problem:** `shelfIds` (5.2) returns ordered copy and Book ids, but nothing turns them into rows a screen can render. AD-7 requires one hydrated read, used by the first page and every later page.

**Approach:** Add `getShelfRows(ctx, query, range): Promise<ShelfRows>` in `lib/shelf`. It hydrates `shelfIds`' ids through `getEffectiveBooks` and `getHoldings`, keeps their order, and adds `total` and `labels`, the display names of the id-valued filter values in `query`.

## Boundaries & Constraints

**Always:**
- Each `shelfIds` pair becomes `{ copy, book }`: the `CopyLine` with that `copyId` from `getHoldings`, and the `EffectiveBook` from `getEffectiveBooks`. Each reader is called once, with the distinct Book ids. Order and `total` are `shelfIds`' own. A pair missing from the hydration (copy removed between the reads) is dropped.
- `labels` is keyed `` `${field}:${id}` `` (for example `author:12`). It holds the id-valued filters only: `location`, `genre`, `author` and `series`.
  - `location`: the name of the viewer's own location (`locations.owner_id = viewer`).
  - `genre`: `genreName(genre, ctx.user.language)` of the system genre.
  - `author`, `series`: the record's own `name`, only when it passes `readableBy` and its `name_key` equals that of a readable record among the effective authors (series) of a Book behind `visibleCopies(viewer)` — the AD-7 no-browsing rule. Effective means the `user_books` value when `'authors'`/`'series'` is in `overridden` (AD-6).
  - Any other id gets no entry.
- Label reads are read-only Drizzle via `drizzleFor(ctx)`. `getShelfRows` takes `shelfIds`' narrowed query type; 5.6 widens both.

**Never:**
- No `/data/shelf` handler, request serializer or screens (5.10, 5.11).
- No labels for `tag` (Epic 9), text values (`theme`, `language`, `publisher`: shown as themselves), or `status`, `read`, `ratingMin`, ranges (interface text).
- No second effective-value implementation in TypeScript.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Paging | 5 copies; range `{0,5}`, then `{0,2}` + `{2,3}` | concatenated pages equal the full read, same rows in the same order | — |
| Two copies, one Book | 2 copies of Book x | two rows with distinct `copy.copyId`, the same `book` | — |
| Override | A overrides x's title | `row.book.title` is A's override | — |
| Author through a copy | `author: [s]`, where s is a shared author whose `name_key` matches one on A's copy | `labels['author:s']` = s's name | — |
| Author not reached | readable shared author on no copy of A's; B's private author | no entry for either | — |
| Location / genre | A's location id, B's location id, a system genre id | A's name; no entry for B's; genre name in A's language | — |

</intent-contract>

## Code Map

- `src/lib/shelf/shelfIds.ts` -- `shelfIds`, unexported `SortedQuery`.
- `src/lib/shelf/visibleCopies.ts` -- `visibleCopies(viewer)`, `readableBy(viewer, alias)`; reuse in label SQL.
- `src/lib/books/effectiveBook.ts` -- `getEffectiveBooks` → `Map<bookId, EffectiveBook>`; `Named`.
- `src/lib/books/holdings.ts` -- `getHoldings` → `Map<bookId, Holdings>`; `CopyLine`.
- `src/lib/books/genreName.ts` -- `genreName({ name, nameFi }, ctx.user.language)`.
- Tables: `books(series_id)`, `books_rels(parent_id, path='authors', authors_id)`, `user_books(id, owner_id, book_id, series_id, overridden)`, `user_books_rels(parent_id→user_books.id, path, authors_id)`, `authors`/`series(id, name, name_key, visibility, created_by_id)`, `genres(id, name, name_fi)`, `locations(id, owner_id, name)`. Wrap raw ids in `Number()`.
- `tests/int/shelfIds.int.spec.ts` -- seeding helpers (`sharedBook`, `copyOf`, `upsertUserBook`), fresh users per test.
- `ARCHITECTURE-SPINE.md:497` -- `ShelfRows` comment.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/shelfIds.ts` -- export `SortedQuery`.
- `src/lib/shelf/labels.ts` -- create `shelfLabels(ctx, filters)`: one query per id field present, none for absent fields.
- `src/lib/shelf/getShelfRows.ts` -- create `ShelfRow`, `ShelfRows` (spine types) and `getShelfRows`; labels run alongside `shelfIds`, the two readers after it.
- `tests/int/getShelfRows.int.spec.ts` -- (1) paging and order, (2) labels: the matrix rows.
- `ARCHITECTURE-SPINE.md` -- `ShelfRows` comment: labels keyed `field:id` for location, genre, author, series; author and series named only through a visible copy.

**Acceptance Criteria:**
- Given A's copies, when `getShelfRows` runs over `{0,n}` and over two consecutive ranges, then the rows match in order, each row's ids equal the `shelfIds` pair, and `total` is `shelfIds`' total.
- Given filter ids in the query, when it runs, then `labels` names only ids the rules allow; no author or series is named by id alone.
- Given the commit, when the spine's Shared shapes are read, then its `ShelfRows` comment states the label key format.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 18 findings — high 0, medium 1, low 9, false 8, maybe-false 0
- findings:
  - `[medium]` `[patch]` Verification gap: no test fails without `readableBy` on the requested author or series. B's private `secret` shares no `name_key` with any author on A's copies, so `throughCopy` alone excludes it. A private record can share a `name_key` with a shared one (per-scope unique indexes). — The labels test now adds B's private author and series named like the labelled ones and asserts they get no entry.
  - `[low]` `[reject]` Verification gap: no test covers the drop of a pair missing from hydration. — It can happen only in a delete race, and covering it needs a stubbed reader. That is out of proportion under the functional-minimum test rule.
  - `[low]` `[patch]` Edge: a filter id above int4 (`?author=99999999999`) passes `parseShelfQuery` and makes the label query throw, failing the whole read. — `id()` in `query.ts` now rejects ids above 2147483647.
  - `[false]` `[reject]` Edge: a failing label query takes the rows read down with it. — Once ids are bounded, no input is known to make it fail. Any other database failure fails the read as a whole, and that is correct.
  - `[low]` `[reject]` Edge: a negative, fractional or NaN `range` reaches SQL. — Same claim as 5.2's rejected unchecked-`range` row. `/data/shelf` (5.11) validates client input; the page passes constants.
  - `[false]` `[reject]` Edge: a dropped row with `total` unchanged makes paging by rows held overlap. — A row is dropped only when its copy is deleted between the reads. The next read no longer has that copy, so offset = rows held is correct. A Book can't fall out of `getEffectiveBooks` while `shelfIds`' `readableBy` join admits it, because both apply AD-4 at the same moment.
  - `[false]` `[reject]` Edge: genre-tag ids could take a system genre's label. — In this epic the `genre` filter carries system genre ids only. The spine's open item settles the tag-id encoding before Epic 9's genre-tag filter.
  - `[false]` `[reject]` Blind: genre labels mix system genre and tag ids. — Same refutation as the Edge genre-tag row.
  - `[low]` `[reject]` Blind: `throughCopy` repeats the AD-7 base FROM (also inlined in `shelfIds`, `filterValues`, `suggest`). — This is the existing pattern across the module, and the visibility and read rules stay in the shared `visibleCopies` and `readableBy`. Extracting a FROM fragment means refactoring three committed stories. 5.5's filter predicate is the natural point to share the `name_key` check.
  - `[false]` `[reject]` Blind: a dropped row leaves the paging contract unstated. — Same refutation as the Edge paging row.
  - `[low]` `[patch]` Blind: `ShelfRow` and `ShelfRows` sit in `getShelfRows.ts`, while every other shelf shared shape is in the client-importable `query.ts`. — Moved to `query.ts` with type-only imports.
  - `[low]` `[reject]` Blind: `range.limit` is uncapped. — Same as 5.2's rejected row. The restore cap belongs to 5.12, and the page size to the callers.
  - `[low]` `[reject]` Blind: seeding helpers are copied into the 7th test file, with `nameKey` placeholders that differ. — The duplication was already there before this story. The placeholder is overwritten by a hook, so nothing goes wrong. A shared helper means refactoring other stories' tests.
  - `[low]` `[patch]` Blind: the spine's `ShelfRows` comment reads as "the record itself is on a copy" and leaves out the location and genre rules. — The comment is reworded to the `nameKey` rule and now includes location (owner only) and genre (viewer's language).
  - `[false]` `[reject]` Intent: dropping a pair whose Book is missing is wider than the intent. — The intent drops "a pair missing from the hydration", which covers both readers.
  - `[low]` `[reject]` Intent: the Book's own (non-override) author path and the series override branch are not exercised by the labels test. — `effectiveAuthorIds` and `effective('series')` are 5.9's and 5.2's shared fragments, and `shelfValues.int.spec.ts` already covers the `books_rels` and override branches. The label test covers the `name_key` join that is new here.
  - `[false]` `[reject]` Intent: the label check also requires the Book behind the copy to pass `readableBy`. — AD-7 applies the AD-4 read rule in every join to `books`. This is `shelfIds`' own FROM, not a widening.
  - `[false]` `[reject]` Intent: genre has no explicit system-only filter. — `genres` holds system genres only (Genres collection, admin-written). The test covers the Finnish name.

## Design Notes

Effective author ids of a visible Book, the shape 5.5 will also need:

```sql
select r.authors_id from books_rels r
 where r.parent_id = b.id and r.path = 'authors' and not coalesce(ub.overridden ? 'authors', false)
union all
select r.authors_id from user_books_rels r
 where r.parent_id = ub.id and r.path = 'authors' and ub.overridden ? 'authors'
```

The label is the requested record's own name: the filter matches by `name_key`, so it is right and stable.

## Verification

**Commands:**
- `npm run test:int -- tests/int/getShelfRows.int.spec.ts tests/int/shelfIds.int.spec.ts` -- expected: passes
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

## Auto Run Result

**Summary:** Added the one hydrated shelf read (AD-7).
- `getShelfRows(ctx, query, range)` turns `shelfIds`' ordered pairs into `{ copy, book }` rows through `getEffectiveBooks` and `getHoldings`. Each reader runs once, over the distinct Book ids. Rows keep `shelfIds`' order and `total`.
- `labels` names the id-valued filter values, keyed `field:id`:
  - location: the viewer's own only;
  - genre: in the viewer's language;
  - author and series: only when readable and sharing a `nameKey` with a readable effective value on a visible copy (the no-browsing rule).
- Filter ids above int4 are now dropped at parse time.
- The run was first blocked by concurrent 5.3 and 5.9 work in the same tree. It resumed after they were committed (`fa3724a`, `cb11637`), with the baseline moved to `cb11637`.

**Files changed:**
- `src/lib/shelf/getShelfRows.ts`: `getShelfRows`.
- `src/lib/shelf/labels.ts`: `shelfLabels`, one read-only query per id field present. Reuses 5.9's `effectiveAuthorIds` and `effective('series')`.
- `src/lib/shelf/query.ts`: `ShelfRow` and `ShelfRows` (type-only imports); `id()` capped at int4.
- `src/lib/shelf/shelfIds.ts`: exports `SortedQuery`.
- `tests/int/getShelfRows.int.spec.ts`: paging and order; labels.
- `ARCHITECTURE-SPINE.md`: the `ShelfRows` comment states the label key format and rules.

**Review findings:** 18 in all: 4 patched (1 `medium`, 3 `low`), 0 deferred, 14 rejected. Reasons are in the Review Triage Log.
- **Patched:**
  - The labels test now fails without `readableBy` on the requested author or series. The implementer removed each guard in turn and saw the test fail.
  - An int4 bound on filter ids.
  - The shared row types moved to `query.ts`.
  - Clearer spine wording.
- **Rejected:**
  - `low`, not worth the added complexity: the race-only drop path is untested; `range` is unchecked and `limit` uncapped (as in 5.2); the base FROM repeats across the module; test helpers are duplicated; the Book's own-author and series-override branches aren't covered by the labels test (5.9's tests cover them).
  - `false`: label failures failing the read; paging after a dropped row (2 rows); genre-tag id collisions (2 rows); the wider drop rule; the `readableBy` join on Books; the system-only genre filter.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 1, low 3. The one medium was a test gap, and its patched test was shown to fail when the bug is put back.

**Verification:**
- `npm run test:int -- tests/int/getShelfRows.int.spec.ts tests/int/shelfIds.int.spec.ts`: 5 passed.
- `tests/unit/shelfQuery.unit.spec.ts` and `tests/unit/clientLibImports.unit.spec.ts`: 22 passed.
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors; the warnings are in `src/migrations` and another session's `.claude/worktrees`, none in the changed files.
- Matrix audit: every row is covered by a test that ran.

**Residual risks:**
- `range` is not validated; the `/data/shelf` handler (5.11) must validate it.
- When 5.5 adds the author and series filters, it should reuse the label check's `name_key` join so the label and the filter can't disagree.
