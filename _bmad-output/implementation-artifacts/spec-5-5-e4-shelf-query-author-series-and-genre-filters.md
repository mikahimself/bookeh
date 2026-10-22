---
title: '5.5 [E4] Shelf query: author, series and genre filters'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: '41ab1a3da30315231c8b3a31f678d7f1aad4600a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `shelfIds` ignores `filters.author`, `filters.series` and `filters.genre`, so the collection cannot show everything by one writer, in one series or of one genre (FR-25).

**Approach:** Add `relationFilters(viewer, filters): SQL | undefined` to `src/lib/shelf/filters.ts`, beside `scalarFilters`. It returns one condition on the shelf aliases, and `shelfIds` ANDs it into the shared `where`, so the page and `total` both apply it.

## Boundaries & Constraints

**Always:**
- Fields AND together with each other and with the scalar filters; several values in one field OR. An absent field or an empty list adds no condition.
- **Author:** a copy matches when one of its Book's effective authors (`effectiveAuthorIds`, AD-6) is readable by the viewer (`readableBy`) and has the `name_key` of a readable author whose id is in the filter. So a shared and a private author with the same name match together, and an override decides which authors a copy has.
- **Series:** the same rule on the effective series (`effective('series')`) against the `name_key` of readable series in the filter.
- An id the viewer cannot read (another user's private record) contributes no `name_key`. This is the same rule `shelfLabels` uses to name records.
- **Genre:** a copy matches when its Book's system genres (`books_rels`, path `genres`, on `b`) include a filter id. Genres cannot be overridden, so they are always read from `b`.
- Values are bound parameters.

**Never:**
- No user genre tag ids in `genre`: their encoding is settled in the spine before Epic 9. No tag or theme filter.
- No author sort (5.6), no indexes (5.7), no change to `query.ts` or `scalarFilters`.
- No second effective-value implementation in TypeScript.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Same name, shared and private | A's copies of shared Book X (shared "Kivi") and private Book P (A's private "kivi"); `author: [shared id]` or `[private id]` | both copies; total 2 | — |
| Override changes author | Shared Book Y by "Leino"; A overrides authors to "Kivi"; `author: [Kivi]` / `author: [Leino]` | Y listed / Y not listed | — |
| Unreadable id | B's private author named "Kivi"; A filters `author: [B's id]` | nothing listed | — |
| Series | Copies in series "Muumit" (shared) and none; `series: [Muumit]` | the Muumit copy only | — |
| Genre OR | Books with genre G1, G2 and none; `genre: [G1, G2]` | the G1 and G2 copies | — |

</intent-contract>

## Code Map

- `src/lib/shelf/filters.ts`: `scalarFilters(filters)`. Add `relationFilters` beside it in the same style.
- `src/lib/shelf/effective.ts`: reuse `effective('series')` (the series id) and `effectiveAuthorIds` (author id rows for `b`/`ub`) unchanged.
- `src/lib/shelf/visibleCopies.ts`: `readableBy(viewer, alias)`, the AD-4 read rule (`true` for the admin).
- `src/lib/shelf/search.ts:28-33` and `labels.ts:31-55`: the same `exists`/`name_key` shapes. Keep the semantics aligned with labels.
- `src/lib/shelf/shelfIds.ts:28-32`: the `conditions` array. Its doc comment still says that author, series and genre are "not applied yet (5.5)".
- `src/lib/shelf/filterValues.ts:47-48`: the genre join, `books_rels` `path = 'genres'`, column `genres_id`.
- Tests: `tests/int/shelfFilters.int.spec.ts` (`sharedBook`, `copyOf`, `listed`). Use the `record(by, collection, name, visibility)` helper, the genre create and `unique()` from `tests/int/getShelfRows.int.spec.ts:39-51,126-131`, because shared `name_key` values are unique. Overrides use `upsertUserBook(ctx, bookId, { overrides: { authors: [id] } })`. For a private Book, create `books` with `visibility: 'private'` by A.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/filters.ts`: add `relationFilters(viewer: Context['user'], filters): SQL | undefined` for `author`, `series` and `genre`, wrapped in parentheses, or `undefined` when no field applies. Update the `scalarFilters` doc comment's last sentence so it points to `relationFilters`.
- `src/lib/shelf/shelfIds.ts`: add `relationFilters(viewer, query.filters)` to `conditions` and update the doc comment.
- `tests/int/shelfFilters.int.spec.ts`: add a `describe` or tests covering:
  1. a shared and a private author with the same name matching together, from either id, and an unreadable id of another user's matching nothing;
  2. an override changing which author a copy matches;
  3. series by `name_key` and genre OR within the field, with `total`, and one genre case ANDed with a scalar filter.

**Acceptance Criteria:**
- Given author or series ids in the filters, when `shelfIds` runs, then a copy is listed when an effective author or series of its Book is readable and shares its `name_key` with a readable record among those ids, and `total` counts only listed copies.
- Given A has overridden a Book's authors, when A filters by author, then only the override's authors decide the match.
- Given genre ids, when they apply, then a copy is listed when its Book's system genres include any of them.
- Given author, series or genre together with a scalar filter or `q`, when they apply, then every field must match.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 17 findings — high 0, medium 5, low 7, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: the series test never exercises the `name_key` rule (one shared series filtered by its own id) — AC 1 and spine AD-7 name it; added A's private same-name series on a private Book (both ids list both copies) and B's private same-name series (lists nothing).
  - `[medium]` `[patch]` Blind: the effective-series path is untested; `b.series_id` would pass — AC 1 names the effective series (AD-6); added a series override S1 → S2 that flips the match.
  - `[low]` `[patch]` Blind: AC 4 names `q`, but no test combines a relation filter with `q` — the code ANDs it into the same `conditions` (verified), but the AC names it, so one `q` + relation assertion was added.
  - `[false]` `[reject]` Blind: nothing guards "one row is one copy" for a Book with several matching values — every condition is an `exists` subquery, so no join can multiply rows; the claimed duplicate rows cannot happen in this code, and the finding only asks for a test.
  - `[low]` `[reject]` Blind: the spec's matrix has no series rows — the fix edits this build's spec, which triage rejects; the gaps it would expose are the two patched test rows above.
  - `[low]` `[patch]` Blind: the `genre` field is documented to carry user genre tag ids, which `relationFilters` would read as system genre ids — no tags collection exists yet, so nothing reaches this today; the harm lands on Epic 9's genre-tag filter. The `relationFilters` doc now says every id is a system genre id until the spine settles the tag encoding.
  - `[low]` `[patch]` Blind: the test file's `describe` and header still say "scalar filters" — renamed to `shelf filters`, header adjusted.
  - `[low]` `[reject]` Blind: test factories copied instead of shared — a shared seeding module is an abstraction no story has asked for (CLAUDE.md); rejected on the same grounds in 5.3 and 5.4.
  - `[low]` `[reject]` Blind: author and series branches repeat one query shape; `Viewer` declared a fourth time — `search.ts` and `labels.ts` use the same two explicit branches; a `sameNameKey(table, match, ids)` helper adds a parameterised SQL builder for two call sites, more complexity than the repetition costs.
  - `[medium]` `[patch]` Edge: series `name_key` matching untested, a regression to `s.id in ${series}` would pass — same root as the first Blind row; fixed by the same test.
  - `[medium]` `[patch]` Verification gap: series `name_key` match and unreadable-id rule never exercised — same root as the first Blind row; fixed by the same test.
  - `[medium]` `[patch]` Verification gap: the effective (overridden) series never exercised — same root as the second Blind row; fixed by the same test.
  - `[false]` `[reject]` Intent: nothing reaches a user-visible surface — the story is "Shelf query: …" and its AC sits on the query; the epic places the screen and filter panel in 5.10, 5.14 and 5.15.
  - `[false]` `[reject]` Intent: the "readable record" wording also allows reading (a), where an unreadable id contributes its `name_key` — under (a), A could pass another user's private author id and learn from their own list whether that record's name matches, which the AD-4 read rule and the AD-7 no-browsing rule forbid; `shelfLabels` already applies (b). Only one reading is consistent with the spine.
  - `[low]` `[patch]` Intent: the tests do not cover the spec's "with `q`" clause — same root as the Blind `q` row; fixed by the same assertion.
  - `[false]` `[reject]` Intent: FR-25's user genres are not implemented — the story's AC says "the Book's system genres", and the epic context sends user genre tags to Epic 9.
  - `[false]` `[reject]` Intent: `sprint-status.yaml` still lists 5.5 as backlog — story commits set it on completion (as 5.22's did); this run sets it to `done` in the story commit, so the stale state never ships.

## Design Notes

The `name_key` is matched through a subquery on the filter's own ids, so an unreadable id drops out:

```ts
if (author?.length) conditions.push(sql`exists (select 1 from authors a
  where a.id in (${effectiveAuthorIds}) and ${readableBy(viewer, 'a')}
    and a.name_key in (select f.name_key from authors f
      where f.id in ${author} and ${readableBy(viewer, 'f')}))`)
if (genre?.length) conditions.push(sql`exists (select 1 from books_rels g
  where g.parent_id = b.id and g.path = 'genres' and g.genres_id in ${genre})`)
```

## Verification

**Commands:**
- `npm run test:int -- tests/int/shelfFilters.int.spec.ts tests/int/shelfIds.int.spec.ts tests/int/shelfSearch.int.spec.ts tests/int/getShelfRows.int.spec.ts`: expected to pass.
- `npm run lint`: expected to report no errors.
- `npm run typecheck`: expected to report no errors.

## Auto Run Result

**Summary:** `shelfIds` now applies the author, series and genre filters in `ShelfQuery.filters` (FR-25). `relationFilters(viewer, filters)` sits next to `scalarFilters` and returns one condition on the shelf aliases. Fields combine with AND, values within a field with OR, and an empty list adds nothing.
- **Author:** a copy matches when a readable effective author of its Book (AD-6) has the `name_key` of a readable author among the ids. So a shared and a private "Kivi" match together whichever id is passed.
- **Series:** the same rule, applied to the effective series.
- **Unreadable ids:** an id the viewer cannot read adds no `name_key`, which is the same rule as `shelfLabels`.
- **Genre:** a copy matches when its Book has one of the system genre ids among its own genres.

The condition is ANDed into the shared `where` next to `visibleCopies`, `textSearch` and `scalarFilters`, so `total` and `getShelfRows` apply it too. Tag and theme filters stay ignored until Epic 9, and so do user genre tag ids.

**Files changed:**
- `src/lib/shelf/filters.ts`: adds `relationFilters()`. The `scalarFilters` doc now points to it.
- `src/lib/shelf/shelfIds.ts`: the `where` includes `relationFilters`. Doc comment updated.
- `tests/int/shelfFilters.int.spec.ts`: renamed to `shelf filters`, `listed()` takes an optional `q`, and 4 integration tests are added:
  - **author:** shared and private with the same name match from either id; another user's private id matches nothing.
  - **author override:** the override decides the match.
  - **series:** the same name-key and unreadable-id rules as author, and a series override that flips the match.
  - **genre:** OR within the field, and AND with `language`, `series` and `q`.
- `sprint-status.yaml`: 5.5 set to `done`.

**Review findings:** 17 in all, triaged as 5 medium, 7 low and 5 false. The reasons are in the Review Triage Log.
- **Patched:** 4 entries, 2 medium and 2 low:
  - series `name_key` and unreadable-id test (Blind, Edge and Verification gap);
  - series override test (Blind and Verification gap);
  - `q` with a relation filter (Blind and Intent);
  - genre ids documented as system genre ids, and the test file renamed.
- **Deferred:** none.
- **Rejected:** 9.
  - **Duplicate rows:** cannot happen, because every condition is an `exists`.
  - **Spec matrix:** the fix would edit this spec.
  - **Shared test helpers:** an abstraction no story asks for.
  - **Author/series branch helper:** more complexity than the repetition costs.
  - **No UI surface:** later stories own the UI.
  - **Unreadable-id reading (a):** forbidden by AD-4 and AD-7.
  - **User genres:** belong to Epic 9.
  - **Sprint status:** set in this commit.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 2, low 2. Both medium patches only add test assertions. They pass against the unchanged query code, so no unverified risk is left to name.

**Verification:**
- `npm run test:int -- tests/int/shelfFilters.int.spec.ts tests/int/shelfIds.int.spec.ts tests/int/shelfSearch.int.spec.ts tests/int/getShelfRows.int.spec.ts`: 18 passed, against Postgres on port 5432.
- `npm run lint`:
  - The repo-wide run reports 22 errors. All of them are in `.claude/worktrees/story-5-31-delete-a-location/.next/types/validator.ts`, the build output of another session's worktree.
  - `eslint src tests` reports 0 errors and 40 warnings, none of them in files this story touches.
- `npm run typecheck`: exit 0.
- Matrix audit: every row is covered by a test that ran and passed.

**Residual risks:**
- No indexes yet. The timing of filters at 10,000 copies is measured in 5.7.
- `query.ts` still documents `genre` as also carrying user genre tag ids. Epic 9 has to settle that encoding in the spine before tags reach the filter.
