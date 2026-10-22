---
title: '5.6 [E15] Author sort'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: 'bf0bdf9b6ed0d9d2b5ef8799cd3683923b07b93f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `shelfIds` and `getShelfRows` accept only the `title`, `year` and `added` sorts, yet `author` is the collection's default sort (`parseShelfQuery` falls back to it). So the default query cannot run, and Kivi cannot sit under K (AD-7, PRD sort rule).

**Approach:** Add an `author` key to `shelfIds`' sort map: the `sort_name` of the Book's first readable effective author (lowest rels `order`), `nulls last`, then the effective title, then copy id. Widen `shelfIds` and `getShelfRows` to the full `ShelfQuery` and drop `SortedQuery`.

## Boundaries & Constraints

**Always:**
- "First effective author" is the first author in `order` of the effective list (AD-6: `user_books_rels` when `ub.overridden ? 'authors'`, else `books_rels`) that passes `readableBy(viewer, 'a')`. That is the first author `getEffectiveBooks` shows, because it drops unreadable authors.
- Text order comes from the database's `fi-FI` ICU collation (plain `order by`, no `collate` clause).
- `dir` reverses the author key and the title tie-break; copy id follows in the same direction (existing rule). A Book with no (readable) effective author sorts last in both directions, like `year`.
- The effective author rows come from `effective.ts`; `effectiveAuthorIds` keeps its current meaning for its callers (`search`, `filters`, `labels`, `suggest`).

**Never:**
- No indexes (5.7), no change to `query.ts`, filters or search.
- No sorting in TypeScript; no second effective-value implementation.
- No `coalesce` onto `name`: `sortName` is always derived on save (spine AD-4).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Family name | "Aleksis Kivi" (`Kivi, Aleksis`), "Tove Jansson" (`Jansson, Tove`), "Zacharias Topelius" (`Topelius, Zacharias`) | asc: Jansson, Kivi, Topelius | — |
| Finnish collation | sortName `Örn, Ari` and `Zorn, Ari` | asc: Zorn before Örn | — |
| First author | Book with authors [Topelius, Jansson] | sorts under Topelius | — |
| Override | Shared Book by Jansson; viewer overrides authors to [Kivi] | sorts under Kivi | — |
| No author | Book with no authors | last in asc and desc | — |
| Same author | Two Books by Kivi, titles "Seitsemän veljestä" and "Nummisuutarit" | asc: Nummisuutarit first; desc: reversed | — |

</intent-contract>

## Code Map

- `src/lib/shelf/shelfIds.ts:12-13` -- `SortedQuery` (remove); `:44-49` the `key` map to extend with `author`; doc comment to update.
- `src/lib/shelf/getShelfRows.ts:7,17` -- takes `SortedQuery`; switch to `ShelfQuery` from `./query`.
- `src/lib/shelf/effective.ts:31-41` -- `effectiveAuthorIds`, the AD-6 union over `books_rels` / `user_books_rels` (`path = 'authors'`, column `authors_id`, position column `"order"`). Add the ordered rows here and derive the ids from them, or add a sibling fragment.
- `src/lib/shelf/visibleCopies.ts:20` -- `readableBy(viewer, alias)`.
- `src/lib/books/effectiveBook.ts:102-105` -- evidence: shown authors drop unreadable ones, so "first" means first readable.
- `src/fields/sortName.ts` -- `sortName` "Family, Given", kept when given on create; derived from the last word of `name` otherwise.
- `tests/int/shelfIds.int.spec.ts` -- `sharedBook`, `copyOf`, `copyIds` (typed to three sorts; widen). Shared `name_key` is unique and rows stay, so authors need a per-run unique `name` and an explicit `sortName`; see `unique()` and `record()` in `tests/int/getShelfRows.int.spec.ts:23,39-51`. Overrides: `upsertUserBook(ctx, bookId, { overrides: { authors: [id] } })`.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/effective.ts` -- expose the effective author rows with their `order`, and a `firstAuthorSortName(viewer)` scalar subquery (first readable by `order`) -- the sort key, kept beside the other AD-6 fragments.
- `src/lib/shelf/shelfIds.ts` -- add the `author` key (`sort_name ${dir} nulls last`, then effective title `${dir}`), take `ShelfQuery`, remove `SortedQuery`, update the doc comment.
- `src/lib/shelf/getShelfRows.ts` -- take `ShelfQuery`.
- `tests/int/shelfIds.int.spec.ts` -- one test covering the matrix rows (asc and desc).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.6 to `done` in the story commit.

**Acceptance Criteria:**
- Given sort `author`, when `shelfIds` orders, then copies follow the `sortName` of their Book's first readable effective author under the `fi-FI` collation, then the effective title, then copy id, all in `dir`.
- Given a Book with no effective author, when sort is `author` in either direction, then its copies come after every copy with an author.
- Given a `ShelfQuery` from `parseShelfQuery` with default sort, when passed to `getShelfRows`, then it type-checks and returns rows in author order.

## Spec Change Log

## Review Triage Log

## Design Notes

`dir` reversing the title tie-break follows the existing rule that the copy-id tie-break shares the sort's direction, and EXPERIENCE's "tapping the chosen sort reverses it". Sketch:

```ts
export const firstAuthorSortName = (viewer: Viewer): SQL => sql`(
  select a.sort_name from (${effectiveAuthorRows}) e
  join authors a on a.id = e.authors_id and ${readableBy(viewer, 'a')}
  order by e."order" limit 1)`
```

## Verification

**Commands:**
- `npm run test:int -- tests/int/shelfIds.int.spec.ts tests/int/shelfFilters.int.spec.ts tests/int/shelfSearch.int.spec.ts tests/int/getShelfRows.int.spec.ts tests/int/shelfValues.int.spec.ts` -- expected: pass.
- `npx eslint src tests` -- expected: no errors.
- `npm run typecheck` -- expected: exit 0.
