---
title: '5.7 [E14] Shelf timing at 10,000 copies'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: '0529c79a0909c2e85fe7978bbc2e68ba8bc368e7'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** NFR-3 (results under 1 s at 10,000 copies) is unmeasured, and every collection screen (5.10 on) builds on `getShelfRows`. The spine defers trigram indexes until `ILIKE` is measured to miss.

**Approach:** One integration test seeds 10,000 varied copies for one viewer in `bookeh_test` and asserts four first-page `getShelfRows` reads each take under 1 s. A planning prototype measured 15–365 ms locally (slowest: cold text search), so **no indexes**; if CI ever misses, the AC's index fallback becomes a follow-up.

## Boundaries & Constraints

**Always:**
- Time what the page will call: `getShelfRows(ctx, query, { offset: 0, limit: SHELF_PAGE_SIZE })` (ids, count, labels and hydration together), each case's **first** call, with `performance.now()`, asserting `< 1000` ms.
- The four cases match the AC one to one. **No filter:** sort `title`, nothing else. **Text search:** `q: 'nen'` under the default sort; it matches seeded author family names on about half the shelf, so it searches and sorts many rows. **Three combined filters:** `language`, a `year` range and `genre` under the default sort. **Author sort:** `parseShelfQuery({}).query`, the query the collection opens with.
- Each case also asserts the data is there: no filter → `total === 10000`, every other case → `rows.length > 0`. A timing pass over an empty shelf proves nothing.
- Seed with set-based SQL (`generate_series`) through `payload.db.drizzle`: 10,000 Local API creates take minutes. Set hook-derived `name_key` and `sort_name` explicitly. Names carry a per-run tag and shared ISBN-13s a per-run random base (both unique for shared rows).
- Seed variety (as the prototype): ~9,000 Books (shared by a second user, some private to the viewer), 1–2 of ~440 authors each (a few private), series, own genres, ~1,000 second copies, notes, ordered copies without location, locations, `user_books` with title and author overrides, read and rating.
- `afterAll` deletes the seeded rows in foreign-key order (copies, user_books, locations, books, authors, series, genres; rels cascade); users stay. Otherwise `bookeh_test` grows ~30,000 rows per run.

**Never:**
- No `pg_trgm` extension, no indexes, no migration, no change to `src/lib/shelf`: measured not needed.
- No timing of `shelfIds` alone, and no warm-up call before the timed one.
- No new test helper module and no `analyze` (measured: it changes nothing).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No filter | sort `title` | `total` 10,000, first 50 rows, < 1 s | — |
| Text search | `q: 'nen'`, default sort | rows > 0, < 1 s | — |
| Three filters | `language: ['fi']`, `year: [1950, 2000]`, `genre: [seeded id]` | rows > 0, < 1 s | — |
| Author sort | `parseShelfQuery({}).query` | rows > 0, < 1 s | — |

</intent-contract>

## Code Map

- `/private/tmp/claude-501/-Users-mika-development-bookeh/44e3955b-3293-4fa2-84ad-f56b091b97c8/scratchpad/shelfTiming.prototype.ts` -- the measured prototype; its seed SQL runs (ids `::int`, enums cast). Reuse it; replace the loop and logging with the cases above; seed own genres (CI's fresh database has none).
- `src/lib/shelf/getShelfRows.ts` -- the read under test (read-only here).
- `src/lib/shelf/query.ts:43` -- `SHELF_PAGE_SIZE` (50); `parseShelfQuery` gives the default author sort.
- `tests/helpers/harness.ts` -- `createUser`, `contextFor`.
- `tests/int/getShelfRows.int.spec.ts:23` -- per-run `unique()` naming precedent.
- Schema: `copies.book_id` not null with `on delete set null` (copies go first); rels cascade from parents; `user_books.overridden` is `jsonb`.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:625` -- Deferred "Search indexing" bullet.

## Tasks & Acceptance

**Execution:**
- `tests/int/shelfTiming.int.spec.ts` -- new: seed in `beforeAll` (generous hook timeout), one `it` per case, cleanup in `afterAll`; a header comment naming NFR-3 and why seeding is SQL.
- `ARCHITECTURE-SPINE.md` -- amend the Deferred "Search indexing" bullet: measured by `tests/int/shelfTiming.int.spec.ts` (5.7), plain `ILIKE` meets NFR-3 at 10,000 copies; indexes only if that test fails.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.7 to `done` in the story commit.

**Acceptance Criteria:**
- Given 10,000 seeded copies for one viewer across varied Books, authors and overrides, when the test runs each of the four cases, then each first-page `getShelfRows` call returns data and takes under 1 s.
- Given the test has finished, when `bookeh_test` is inspected, then none of its seeded copies, Books, authors, series, genres, locations or `user_books` rows remain.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 9, false 10, maybe-false 0
- note: story 5.32 (`0529c79`) landed on `main` from another session during this run; `baseline_revision` was moved to it so the reviewed diff holds only 5.7's changes.
- findings:
  - `[low]` `[patch]` Intent: the spine bullet says plain `ILIKE` "meets NFR-3" while only local runs were observed and the AC judges the limit on the CI runner — reworded to state the rule (timed by the test on every CI run, passed locally) instead of an unobserved CI result.
  - `[low]` `[reject]` Intent: the spec hands a CI miss to a follow-up while the AC says this story adds the indexes before any collection screen — if CI misses, the timing test is red on `main` and stays red until indexes land, so 5.10 cannot be accepted first; the remaining fix would edit this build's spec.
  - `[false]` `[reject]` Intent: only the service is timed, not a rendered screen — no collection screen exists, and the AC places the measurement "before any collection screen is built".
  - `[false]` `[reject]` Intent: `q: 'nen'` matches mainly author names and there is no series override — rows that miss the author branch (about half) go through every OR branch, and the `effective()` CASE is evaluated on every row whether or not a field is overridden.
  - `[false]` `[reject]` Edge: no `analyze` after the bulk seed gives stale-stat plans that flake — measured both ways in planning (Design Notes table), and every case stayed far under 1 s.
  - `[low]` `[reject]` Edge: a text search matching nothing (every ILIKE branch on every row) is not timed — the planning prototype timed a 3-hit search at 85–88 ms; adding a case is more than a direct fix for a path measured 10× under the limit.
  - `[low]` `[reject]` Edge: a `beforeAll` timeout mid-INSERT could commit rows after cleanup — needs a seed that runs 60+ s against a measured 1.3–4.4 s; guarding it adds a transaction around the seed.
  - `[false]` `[reject]` Edge: a slow runner failing would be read as needing indexes — that is the AC's own rule ("if any misses … this story adds … indexes").
  - `[false]` `[reject]` Edge: the spine claim implies a cold worst case was measured — the test times the AC's four cases at 10,000 copies; a 10,000-copy collection is a few MB and stays in Postgres buffers in production too.
  - `[low]` `[reject]` Edge: cleanup is skipped when `viewerId` is undefined, a late commit escapes it, and users stay — with no viewer nothing was seeded; users stay by spec (`createUser` is never cleaned up); the late-commit part is the timeout row above.
  - `[false]` `[reject]` Blind: `filterValues` counts are not timed though the spine says `ILIKE` meets NFR-3 — `filterValues` uses no `ILIKE`; the spine sentence is about search indexing, and the AC lists the four cases.
  - `[low]` `[patch]` Blind: the data assertions (`rows.length > 0`) would pass on a nearly empty result — now asserts `total` floors: text search > 4,000, three filters > 100, author sort exactly 10,000.
  - `[false]` `[reject]` Blind: two users only, so `readableBy` never excludes and NFR-4 scale is missed — Phase 1 is one user and the AC binds NFR-3 at 10,000 copies; in CI the shared tables also hold every other int spec's rows.
  - `[low]` `[reject]` Blind: seeded Books have no covers, so hydration skips media population — that adds one batched media read for 50 ids against 900+ ms of headroom; seeding media rows adds setup for no named failure.
  - `[false]` `[reject]` Blind: warm cache and fixed case order, spine unqualified — same refutation as the Edge cold-cache row.
  - `[false]` `[reject]` Blind: no scalar overrides, so the filter's override path is unmeasured — the `effective()` CASE tests `ub.overridden ? field` on every row either way, so its cost does not depend on the override being present.
  - `[low]` `[patch]` Blind: hook timeouts of 300 s and 120 s against a seed measured at 1.3–4.4 s hold the serial int lane for minutes when stuck — lowered to 60 s and 30 s.
  - `[low]` `[reject]` Blind: cleanup stops at the first failed delete — a new FK onto these tables would fail loudly in this test and be fixed there; a transaction or try/finally guards a state never shown.
  - `[false]` `[reject]` Blind: the decision stays under Deferred and the NFR-3 traceability row does not name the test — that table maps requirements to modules and ADs, not tests; the Deferred bullet is where the open index trigger lives, and it remains open (indexes if the test fails).

## Design Notes

Prototype, `getShelfRows`, three calls each (ms, local), with and without `analyze` after the seed:

| Case | total | with analyze | without |
|---|---|---|---|
| no filter (title) | 10,000 | 47 / 46 / 19 | 58 / 33 / 23 |
| text `nen` | 4,980 | 365 / 110 / 109 | 107 / 86 / 88 |
| three filters | 393 | 20 / 16 / 15 | 34 / 31 / 29 |
| author sort | 10,000 | 48 / 46 / 46 | 42 / 42 / 45 |

A runner 2–3× slower still fits under 1 s. Seeding took 1.3–4.4 s.

## Verification

**Commands:**
- `npm run test:int -- tests/int/shelfTiming.int.spec.ts` -- expected: 4 passed; run it twice, and the second run passes too (no unique-key collisions).
- `docker exec bookeh-postgres-1 psql -U bookeh -d bookeh_test -tAc "select count(*) from copies"` -- the same before and after a run.
- `npx eslint tests/int/shelfTiming.int.spec.ts` -- no errors; `npm run typecheck` -- exit 0.

## Auto Run Result

**Summary:** A new integration test seeds 10,000 copies for one viewer with set-based SQL: about 9,000 Books, 440 authors (some private), series, genres, locations, ordered copies, notes, and title and author overrides. It then times the first `getShelfRows` page for the AC's four cases: no filter, text search, three combined filters and author sort. Each case must answer in under 1 s and return a result of realistic size. `afterAll` deletes every seeded row. The test passed locally with a wide margin, so no indexes were added and `src/lib/shelf` is unchanged.

**Files changed:**
- `tests/int/shelfTiming.int.spec.ts`: new timing test (seed, four cases, cleanup).
- `ARCHITECTURE-SPINE.md`: the Deferred "Search indexing" bullet now names the test as the trigger for indexes.
- `sprint-status.yaml`: 5.7 `done`.

**Review findings:** 19 (low 9, false 10).
- **Patched (3):**
  - The spine wording no longer states an unobserved CI result.
  - The tests assert `total` floors (text search > 4,000, three filters > 100, author sort exactly 10,000).
  - Hook timeouts are lowered to 60 s and 30 s.
- **Deferred:** none.
- **Rejected (16), with the reasons recorded in the Review Triage Log:**
  - A CI miss is handled by a follow-up: a red test on `main` blocks it.
  - Service-level surface only: no screen exists yet.
  - The `nen` search matches only author names, and the seed has no series override: the OR branches and the CASE are evaluated anyway.
  - `analyze`: measured both ways.
  - A search that matches nothing: measured at 85 ms in planning.
  - A seed timeout or late commit: needs 60+ s against a 4 s seed.
  - A slow runner failing the test: that is the AC's rule.
  - Cold-cache claims (2): a 10,000-copy collection stays in buffers.
  - Cleanup edge cases: nothing seeded, or users stay by spec.
  - `filterValues`: uses no `ILIKE`.
  - NFR-4 scale: out of Phase 1.
  - Covers: one batched read.
  - Scalar overrides: the CASE costs the same either way.
  - Cleanup stops at the first failed delete: it would fail loudly.
  - Traceability row: maps modules, not tests.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 0, low 3.

**Verification:**
- `npm run test:int -- tests/int/shelfTiming.int.spec.ts`: 4 passed, twice in a row, with no unique-key collisions. Local times were 22–99 ms per case, and the file took about 2.5 s including the seed.
- `bookeh_test` row counts for copies, books, authors, genres, user_books, series and locations were identical before and after each run: 4225, 4353, 2061, 184, 1020, 728, 1818.
- `npx eslint tests/int/shelfTiming.int.spec.ts`: clean. `npm run typecheck`: exit 0.
- Matrix audit: each of the four rows is its own `it`, and all four ran and passed.

**Residual risks:**
- The 1 s limit is proven only locally. This session has no `gh` CLI, so CI results could not be read, and nothing was pushed. If the CI runner misses, the AC's `pg_trgm` index fallback is next, and it must land before 5.10.
- Story 5.32 (`0529c79`) was committed to `main` by another session during this run. `baseline_revision` points at it, so this spec's diff covers only 5.7.
