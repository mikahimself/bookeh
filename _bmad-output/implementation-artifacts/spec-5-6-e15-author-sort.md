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

### 2026-10-22 — Review pass
- verdicts: 19 findings — high 0, medium 3, low 8, false 8, maybe-false 0
- findings:
  - `[medium]` `[patch]` Verification gap: no test shows the author sort skipping an author the viewer cannot read; dropping `readableBy` from `firstAuthorSortName` still passed — AC 1 names "first readable", and a shared Book can carry another user's private author (`effectiveBook.int.spec.ts:71-87`). Extended the author-sort test: [B's private `Aaltonen, X`, Kivi] sorts among the Kivi copies, B's private author alone sorts with the no-author copies, both directions; the implementer confirmed it fails with `readableBy` removed.
  - `[false]` `[reject]` Intent: Reading B, nothing user-visible changes — STORY-SLICING lists E15 as Service and the epic context places collection screens after 5.7.
  - `[false]` `[reject]` Intent: AC 3 is exercised only at the type level for `getShelfRows` — `getShelfRows` passes `query` unchanged to `shelfIds` and keeps its id order (`ids.flatMap`), so rows cannot come out in any other order.
  - `[medium]` `[patch]` Intent: the "readable" narrowing is untested and the spine wording omits it — same root as the verification-gap row (test patched); the spine wording is the Blind spine row below.
  - `[false]` `[reject]` Intent: the title tie-break following `dir` and no-author-last both ways go beyond the epic text — both are tested and follow the existing `year` and copy-id rules; no bad outcome named.
  - `[false]` `[reject]` Intent: the test passes explicit `sortName` and does not check derivation from "Aleksis Kivi" — derivation belongs to 3.13 (`src/fields/sortName.ts`) and has its own tests; this story sorts on the stored value.
  - `[false]` `[reject]` Intent: sprint status `done` while the spec says `in-review` — finalization sets the spec to `done` in the same run.
  - `[low]` `[reject]` Edge: ties or a null `order` in rels make the first author arbitrary — Payload is the only writer of `books_rels`/`user_books_rels` and always writes `order` 1..n per parent; a tie-break guards a state never shown to occur.
  - `[low]` `[patch]` Blind: AD-7 still says "first effective author" without the readable rule, the title tie-break or no-author-last — amended that one sentence in ARCHITECTURE-SPINE.md (CLAUDE.md: a story that settles a spine contract updates it in the same commit).
  - `[medium]` `[patch]` Blind: the readable rule is a privacy rule with no test — same root as the verification-gap row; fixed by the same test.
  - `[low]` `[reject]` Blind: the I/O matrix has no unreadable-author row — the fix edits this build's spec.
  - `[false]` `[reject]` Blind: nothing tells 5.7 to time author sort — 5.7's acceptance criteria (epics.md:2194) name "author sort" explicitly.
  - `[low]` `[reject]` Blind: `epic-5-context.md` still says 5.6 is next — it is a compiled cache; the spine edit in this commit makes it stale by timestamp, so the next story recompiles it.
  - `[false]` `[reject]` Blind: sprint status and spec status disagree — same as the Intent status row; finalization reconciles them.
  - `[low]` `[reject]` Blind: the `author()` helper duplicates `unique()`/`record()` from `getShelfRows.int.spec.ts` — a shared seeding module is an abstraction no story asks for; rejected on the same grounds in 5.3–5.5.
  - `[low]` `[reject]` Blind: test author names are built from the inverted sort name — cosmetic; the explicit `sortName` is what the test asserts on and is kept by the hook.
  - `[low]` `[reject]` Blind: `type Viewer` declared a fifth time — rejected in 5.5 for the same reason; a shared export saves one line per file and no caller diverges.
  - `[low]` `[patch]` Blind: the `shelfIds` doc comment breaks mid-sentence — reflowed, wording unchanged.
  - `[false]` `[reject]` Blind: AC 3 covered only by the type checker — same refutation as the Intent AC 3 row.

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

## Auto Run Result

**Summary:** `shelfIds` and `getShelfRows` now run the `author` sort, the collection's default. The key is the `sortName` of the Book's first effective author (lowest rels `order`) that the viewer may read, under the database's `fi-FI` collation, `nulls last` both ways, then the effective title, then copy id, all in `dir`. Both functions take the full `ShelfQuery`; `SortedQuery` is gone. AD-7 in the spine now states the rule.

**Files changed:**
- `src/lib/shelf/effective.ts`: `effectiveAuthorRows` (ids with `order`), `effectiveAuthorIds` derived from it with the same meaning, and `firstAuthorSortName(viewer)`.
- `src/lib/shelf/shelfIds.ts`: `author` sort key; takes `ShelfQuery`; doc comment.
- `src/lib/shelf/getShelfRows.ts`: takes `ShelfQuery`.
- `tests/int/shelfIds.int.spec.ts`: one author-sort test, asc and desc: family-name order, Zorn before Örn, first author by position, an override, an unreadable first author skipped, an unreadable-only author and no author last, title tie-break.
- `ARCHITECTURE-SPINE.md`: AD-7 author-sort sentence.
- `sprint-status.yaml`: 5.6 `done`.

**Review findings:** 19 (medium 3, low 8, false 8).
- **Patched (3 entries):** unreadable-author test (medium; Verification gap, Intent, Blind); AD-7 wording (low); doc comment reflow (low).
- **Deferred:** none.
- **Rejected (13 rows):**
  - Reading B, no UI: E15 is a Service story.
  - AC 3 type-only (2 rows): `getShelfRows` keeps `shelfIds`' order.
  - Spec choices on tie-break direction and nulls: tested, follow existing rules.
  - `sortName` derivation: belongs to 3.13.
  - Status mismatch (2 rows): reconciled at finalization.
  - Rels `order` ties: Payload always writes `order`.
  - Matrix row: fix edits the spec.
  - 5.7 timing note: 5.7's AC names author sort.
  - Stale epic context: recompiled by the next run.
  - Shared test helpers, test author names, `Viewer` type: no named harm, or an unasked-for abstraction.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 1, low 2. The medium patch adds a test that passes against unchanged query code and was shown to fail without `readableBy`.

**Verification:**
- `npm run test:int` on `shelfIds`, `shelfFilters`, `shelfSearch`, `getShelfRows`, `shelfValues`: 22 passed (5 files).
- `npx eslint src tests`: 0 errors, 40 warnings in untouched files.
- `npm run typecheck`: exit 0.
- Matrix audit: all six rows are asserted in the author-sort test, which ran and passed.

**Residual risks:**
- The author key is a correlated subquery per visible copy, and `effectiveAuthorIds` now goes through a derived table. Timing at 10,000 copies is 5.7's job, and its AC names author sort.
