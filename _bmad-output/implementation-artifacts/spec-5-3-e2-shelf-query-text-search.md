---
title: '5.3 [E2] Shelf query: text search'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: '72bac2fcbe62a1b58b6e7445f71487e8f95dd25c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `shelfIds` (5.2) ignores `ShelfQuery.q`, so the collection cannot be searched (FR-24, NFR-7).

**Approach:** Add a `textSearch(viewer, q)` SQL condition in `lib/shelf` that matches the viewer's effective title, effective author names, effective series name, ISBN-13 and the copy's own notes. `shelfIds` ANDs it into the shared FROM/WHERE, so the page and the count both apply it.

## Boundaries & Constraints

**Always:**
- Plain `ILIKE '%…%' ESCAPE '\'`, with no `unaccent`, `lower()` or explicit `COLLATE`. Case-insensitive, no accent folding: "a" never matches "ä".
- Escape `\`, `%` and `_` in `q` before wrapping it in `%…%`, so each matches literally. `q` is a bound parameter, never raw SQL.
- `q` is trimmed. An empty or whitespace-only `q` adds no condition.
- One pattern, matched as a whole substring against each field and OR'd. No word splitting.
- Effective values follow AD-6, as in `shelfIds`: title and series read `ub` only when listed in `ub.overridden`. Authors read `user_books_rels` (`parent_id = ub.id`) when `'authors'` is listed, and `books_rels` (`parent_id = b.id`) otherwise. An overridden but empty author list or series matches nothing.
- Joined `authors` and `series` rows pass `readableBy(viewer, alias)` (AD-4/AD-7).
- Notes match per copy: a note on one copy matches that copy's row only. A title, author, series or ISBN match lists every copy of that Book.

**Never:**
- No ISBN normalisation (hyphens, ISBN-10). No subtitle, publisher or description search. No indexes or `pg_trgm` (5.7). No filters (5.4–5.5) and no author sort (5.6).
- No code that searches `books`, `authors` or `series` on their own. Every match is reached from `copies` through `visibleCopies`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Author substring | A has a Book by "Aleksis Kivi"; `q: 'kivi'` | that copy listed | — |
| Accents | Title "Ärrä"; `q: 'arra'` / `q: 'ÄRRÄ'` | no match / match | — |
| Literal `%` `_` `\` | Titles "100% totta", "100 totta", "a_b", "axb", "C:\\kansio"; `q` each special char | only the title holding that char | — |
| Override | A overrides title "Vanha" to "Uusi" and replaces the author | `vanha` and the old author no longer match; `uusi` and the new author do | — |
| Notes | Two copies of one Book, one with note "vintti" | `vintti` lists only that copy; total 1 | — |
| Blank | `q: '   '` | same as no `q` | — |

</intent-contract>

## Code Map

- `src/lib/shelf/shelfIds.ts` -- `from` fragment (aliases `copies`, `b`, `ub`) shared by page and count; the private `effective()` helper (title, year). The `where` gains `and ${search}` when `textSearch` returns one. Update its doc comment on `q`.
- `src/lib/shelf/visibleCopies.ts` -- `readableBy(viewer, alias)`; reuse it for the `authors` and `series` aliases.
- Tables: `books(isbn13, title, series_id)`, `books_rels(parent_id, path, authors_id)` with `path = 'authors'`, `user_books(id, title, series_id, overridden jsonb)`, `user_books_rels(parent_id, path, authors_id)`, `authors(id, name, visibility, created_by_id)`, `series(id, name, visibility, created_by_id)`, `copies(notes)`.
- `tests/int/shelfIds.int.spec.ts:24-45` -- seeding helpers and fresh users per test. Authors and series: `payload.create` as in `tests/int/authors.int.spec.ts:44`. Overrides: `upsertUserBook(ctx, bookId, { overrides: { title, authors: [id] } })`.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/effective.ts` -- move `effective()` here from `shelfIds.ts`. Widen it to `'title' | 'year' | 'series'`, with `series` reading column `series_id`. Search and sort then share one AD-6 rule.
- `src/lib/shelf/search.ts` -- create `textSearch(viewer, q: string | undefined): SQL | undefined`, built from the escaped pattern and five OR'd arms: effective title; an EXISTS over effective authors joined to readable `authors`; an EXISTS on readable `series` by effective `series_id`; `b.isbn13`; `copies.notes`.
- `src/lib/shelf/shelfIds.ts` -- import `effective`, apply `textSearch(viewer, query.q)` in `from`'s `where`.
- `tests/int/shelfSearch.int.spec.ts` -- the tests the AC names: fields matched (title, author substring, series, ISBN-13, notes per copy) with `total`; no accent folding and case-insensitivity on "Ä"; `%`, `_` and `\` matched literally; overridden title and authors searched by the override only.

**Acceptance Criteria:**
- Given A's copies, when `shelfIds` runs with `q`, then exactly the copies whose effective title, effective author name, effective series name, ISBN-13 or own notes contain `q` case-insensitively are listed, and `total` counts only them.
- Given a title "Ärrä", when `q` is "arra", then it is not listed; when `q` is "ÄRRÄ", then it is.
- Given titles with and without `%`, `_` or `\`, when `q` is that one character, then only titles containing it are listed.
- Given A has overridden a Book's title and authors, when A searches the shared value, then the copy is not listed; when A searches the override, then it is.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 22 findings — high 0, medium 6, low 11, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: AD-7 says effective values in SQL are "for filter and sort only", but search now uses them — the spine phrase now reads "filter, sort and search" (CLAUDE.md: a story that changes a spine contract updates it in the same commit).
  - `[low]` `[reject]` Blind: a hyphenated ISBN-13 or an ISBN-10 finds nothing — the AC names `ILIKE` on ISBN-13; a printed ISBN is normally scanned, not typed into the collection search; a `toIsbn13` arm adds a branch.
  - `[medium]` `[patch]` Blind: the `ub.series_id` side of `effective('series')` never runs in a test — grouped with the verification-gap series finding; same patch.
  - `[low]` `[reject]` Blind: the working tree's `shelfIds.ts` carries story 5.8's `export` on `SortedQuery` — not a code defect; finalization stages only the 5.3 hunks and leaves 5.8's change to its own session.
  - `[low]` `[reject]` Blind: `sharedBook`/`copyOf` duplicated from `shelfIds.int.spec.ts` — a shared seeding module is an abstraction for 5.4–5.6 that none of them has asked for yet (CLAUDE.md: no abstractions "for later").
  - `[low]` `[reject]` Blind: inner double spaces are kept, so "uusi  kirj" misses — typing two spaces is rare, and collapsing would make notes stored with two spaces unfindable instead.
  - `[low]` `[reject]` Blind: the author arm ignores `sortName` — the AC names author names; "kivi" already matches "Aleksis Kivi", and a surname-first query with a comma is unlikely.
  - `[low]` `[reject]` Edge: a NUL in `q` (`/?q=%00`) makes Postgres reject the parameter — no input in the app produces it; only a hand-made URL does, and the error page is the result.
  - `[low]` `[reject]` Edge: hyphenated ISBN-13 / ISBN-10 not matched — same root as the Blind ISBN finding; rejected on the same grounds.
  - `[false]` `[reject]` Edge: trimming `q` matches more than "contains q" — trimming is the spec's rule; a leading or trailing space carries no meaning in a search typed as you go, so no user meets a wrong match.
  - `[medium]` `[patch]` Verification gap: no test overrides `series`, so the `ub` side could read the wrong column unnoticed — the override test now also overrides the series and asserts which name matches.
  - `[medium]` `[patch]` Verification gap: the `books_rels` author arm is untested with a `ub` row that does not override authors — a new case overrides only another field and still finds the Book's author; mutated to `ub.id is null`, it fails.
  - `[low]` `[patch]` Verification gap (other): fixtures attach private authors and series to shared Books, which AD-4 forbids — the fixtures now create shared authors and series with a per-run unique name.
  - `[false]` `[reject]` Intent: no search box at `/` and no timing — the epic places the screen in 5.10 and timing in 5.7; the story's AC is on the shelf query.
  - `[low]` `[reject]` Intent: `textSearch` is written for copies and cannot serve Lookup's copies-plus-entries search — wishlist entries arrive in Epic 7; reshaping it now builds ahead of a story.
  - `[medium]` `[patch]` Intent: the spine says effective values are "for filter and sort only" — grouped with the Blind spine finding; same patch.
  - `[medium]` `[patch]` Intent: the effective-series path is untested — grouped with the verification-gap series finding; same patch.
  - `[low]` `[reject]` Intent: authors overridden to an empty list are untested — the same `overridden ? 'authors'` guard is tested with a replaced list; an empty list only empties the `user_books_rels` EXISTS.
  - `[false]` `[reject]` Intent: `readableBy` on joined authors and series is never exercised with another user's private record — no reachable data has one: a shared Book references only shared records and a private Book its creator's (AD-4), so the guard cannot change a result.
  - `[low]` `[reject]` Intent: ISBN typed as printed is not matched — same root as the Blind ISBN finding; rejected on the same grounds.
  - `[false]` `[reject]` Intent: "a" against "ä" is tested as `arra` against "Ärrä" — the auditor itself finds it equivalent at the SQL surface, run on the fi-FI database.
  - `[false]` `[reject]` Intent: the working tree holds 5.8 files and an export the diff lacks — outside 5.3's surface; same handling as the Blind working-tree finding.

## Design Notes

Effective authors as two guarded arms. With no `ub` row, the `?` test is null, so the `books_rels` arm applies:

```sql
(ub.overridden ? 'authors' and exists (select 1 from user_books_rels r join authors a on a.id = r.authors_id
   where r.parent_id = ub.id and r.path = 'authors' and <readable a> and a.name ilike $p escape '\'))
or (coalesce(not ub.overridden ? 'authors', true) and exists (… books_rels r … r.parent_id = b.id …))
```

The pattern is built in TS as `'%' + q.replace(/[\\%_]/g, '\\$&') + '%'`. `ILIKE` under the database's ICU `fi-FI` default case-folds "Ä" to "ä" and never folds it to "a".

## Verification

**Commands:**
- `npm run test:int -- tests/int/shelfSearch.int.spec.ts tests/int/shelfIds.int.spec.ts` -- expected: passes
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary:** `shelfIds` now applies `ShelfQuery.q` (FR-24, NFR-7). `textSearch(viewer, q)` trims `q` and escapes `\`, `%` and `_`. It then matches the one pattern with plain `ILIKE … ESCAPE '\'` (case-folded, never accent-folded) against five things:
- the effective title;
- an effective author's name (`user_books_rels` when `authors` is overridden, `books_rels` otherwise);
- the effective series' name;
- ISBN-13;
- the copy's own notes.

Joined authors and series pass `readableBy`. The condition sits in the shared FROM/WHERE, so `total` applies it too. `effective()` moved to its own module and now covers `series` (its `series_id` column).

**Files changed:**
- `src/lib/shelf/effective.ts`: `effective()` moved out of `shelfIds.ts`, now title, year and series.
- `src/lib/shelf/search.ts`: `textSearch()`, the search condition.
- `src/lib/shelf/shelfIds.ts`: ANDs `textSearch` into the shared `where`; doc comment updated.
- `tests/int/shelfSearch.int.spec.ts`: 4 integration tests:
  - every field (with a viewer row that overrides only `year`), notes per copy, and blank `q`;
  - "Ärrä" against `arra` and `ÄRRÄ`;
  - literal `%`, `_` and `\`;
  - overridden title, authors and series.
- `ARCHITECTURE-SPINE.md` AD-7: effective values are "used for filter, sort and search".

**Review findings:** 22 in all: 4 patch groups (3 `medium`, 1 `low`), 0 deferred, 14 rejected. The reasons are in the Review Triage Log.
- **Patched:**
  - The spine's AD-7 wording now includes search.
  - A series override is tested.
  - The Book's authors are tested for a viewer whose row overrides another field.
  - Fixtures use shared authors and series, as AD-4 requires of a shared Book.
  - The implementer broke the guard (`ub.id is null`) and the series arm (`b.series_id`) in turn and confirmed the matching test fails.
- **Rejected:**
  - ISBN typed with hyphens or as ISBN-10 (3 rows);
  - NUL in `q`;
  - trimming;
  - inner double spaces;
  - `sortName` search;
  - duplicated test helpers;
  - the working-tree 5.8 export (2 rows);
  - Lookup/wishlist reuse;
  - empty author override;
  - `readableBy` with unreachable data;
  - no screen or timing;
  - the "a"/"ä" phrasing.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 3, low 1. Two medium patches closed test gaps with assertions that fail when the bug is put back; the third is a one-phrase spine correction. No unverified risk is left.

**Verification:**
- `npm run test:int -- tests/int/shelfSearch.int.spec.ts tests/int/shelfIds.int.spec.ts`: 7 passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors (40 warnings, all in files this story does not touch).
- Matrix audit: every row is covered by a test that ran.

**Residual risks:**
- An ISBN typed as printed (hyphens) or as ISBN-10 finds nothing; only a plain digit substring of the ISBN-13 matches.
- No indexes; the 10,000-copy timing for text search is measured in 5.7.
- Stories 5.8 and 5.9 were being built in the same working tree during this run. The 5.3 commit holds only 5.3's hunks: `shelfIds.ts` without 5.8's `export` on `SortedQuery`, and the spine without 5.8's `ShelfRows` comment.
