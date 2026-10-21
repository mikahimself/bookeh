---
title: '4.20 [C14] Lean Finna raw data and the source order check'
type: 'refactor'
created: '2026-10-21'
status: 'done'
baseline_revision: '0aa89e2ceb32fa94c249cb5f0200186dbc51a5a0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Finna answers `isbn:"<isbn13>"` with other editions too (up to 6 records, ~66 KB), and the adapter stores the whole body as `raw.finna` on every Book (Epic 3 retro R7). Nothing tests that Finna comes before Google Books (R13).

**Approach:** The adapter stores the Finna body with `records` cut to `finnaMatches()`. A data-only migration trims existing Books with the same function and logs the count; production runs it once at start (`prodMigrations`). One int test saves an ISBN both sources answer and checks Finna's title and `source` win and Google fills the description.

## Boundaries & Constraints

**Always:** One exported function in `finna.ts` trims for both adapter and migration. Other body keys stay as received; kept records stay whole (`fullRecord` included). The migration changes a Book only when its Finna body has a `records` array that trimming shrinks. It writes with SQL through the migration's `db` (no hooks) and logs `Trimmed Finna raw data on <n> of <total> Books` via `payload.logger.info`. The order test uses the real `sources` array and stubs only `fetch`.

**Never:** Changing `finnaMatches()`, the merge, or Google's raw. A schema change. A `down` that restores records (no-op). A standalone `tsx` script: the LXC has no checkout and the image has no `tsx`. Running anything against production from here.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lookup, other editions | Finna body, 2 records, 1 matching | `raw.finna` = body with `records: [match]`, record unchanged | No error expected |
| Existing Book, untrimmed | stored Finna body, 2 records, 1 matching its `isbn13` | trimmed to the match; counted | No error expected |
| Existing Book, odd shape | `{ title }`, `{ records: [] }`, already lean, no `finna` | untouched, not counted | No error expected |

</intent-contract>

## Code Map

- `src/lib/metadata/sources/finna.ts` -- `finnaMatches()` :76 is the rule; `toResult()` :211 sets `raw: { finna: body }`; `finnaResults()` :242 should build the lean body once and pass it in.
- `src/lib/metadata/sources/fixture.ts:66-77` -- sets `raw: { fixture: body }`; use `result.raw.finna`.
- `src/lib/metadata/source.ts:44-48` -- `Source` doc says `raw` is the complete response; reword.
- `src/lib/metadata/sources/index.ts` -- `[finna, google]`, read only.
- `src/migrations/` -- `npm run payload migrate:create lean_finna_raw` (blank; accept the prompt or `--force-accept-warning`) on the worktree DB. Column `books.raw_metadata` (jsonb). `MigrateUpArgs.db` is `PostgresDB`, so a test can pass `payload.db.drizzle`. `db.execute(sql…)` example: `20261018_164917_locations.ts`.
- Fixtures: `tests/fixtures/finna/9780007447831.json` (A clash of kings: 2 records, 1 matching, no `summary`); `tests/fixtures/google/volumes/zlwlTfBeiSoC.json` (same book, "A Clash of Kings", has a description; wrap as `{ kind: 'books#volumes', totalItems: 1, items: [volume] }`).
- `tests/int/saveCopyAction.int.spec.ts:147-180` -- the `fetch` stub and fresh-ISBN `replaceAll` pattern; add the order case beside it.
- `tests/unit/finna.unit.spec.ts:92,255-261` -- expect the full fixture as `raw.finna`; update.
- `tests/int/books.int.spec.ts:30`, `ensureSharedBook.int.spec.ts:32`, `sharePrivateBook.int.spec.ts:61,230` -- odd Finna shapes in `bookeh_test` the migration must skip.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/sources/finna.ts` -- export `leanFinnaBody(body: unknown, isbn13: string): unknown` (records cut to `finnaMatches()` when an array, else body unchanged); use it for `raw.finna`.
- `src/lib/metadata/sources/fixture.ts`, `src/lib/metadata/source.ts` -- as in the Code Map.
- `src/migrations/<timestamp>_lean_finna_raw.ts` -- `up`: read `id, isbn13, raw_metadata` from `books` where `raw_metadata->'sources' ? 'finna'`; rewrite those whose records shrink; log the count. `down`: no-op with a reason.
- `tests/unit/finna.unit.spec.ts` -- update both expectations; the case at :255 asserts `raw.finna.records` is exactly the unchanged matching record.
- `tests/int/leanFinnaRaw.int.spec.ts` (new) -- a Book for a fresh ISBN storing `9780007447831.json` re-keyed to it; plus a Book storing `{ records: [] }`; run `up`; assert only the match remains on the first, the second is unchanged, and the log reports ≥ 1 Book.
- `tests/int/saveCopyAction.int.spec.ts` -- both sources answer for a fresh ISBN; Book has title `A clash of kings`, `source: 'finna'`, a non-empty description.

**Acceptance Criteria:**
- Given a Finna response holding other editions, when the adapter builds `raw.finna`, then it keeps only the records `finnaMatches()` keeps, each whole, `fullRecord` included.
- Given Books saved before this story, when the migration runs, then their `rawMetadata.sources.finna` is trimmed the same way, no other Book changes, and the log reports how many changed.
- Given both sources answer for an ISBN, when it is saved, then the Book takes Finna's title and `source: 'finna'` and Google's description; with `sources/index.ts` reversed the test fails.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 17, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: the migration wipes every record when a Book's `isbn13` was edited after the save (admin `update` is allowed), since `0 < before` passes — guard now skips a row whose trim leaves zero records; zero-match Book added to the int test.
  - `[low]` `[reject]` Blind: AC 2 barely seeded (no already-lean or `{ title }` Book) — rewriting an already-lean body would write identical data; only the zero-match case can lose data, and it is now seeded (row above).
  - `[low]` `[reject]` Blind: count asserted only as `>= 1` — an exact count over the shared, concurrently written `bookeh_test` needs scoping the migration for tests; the harm is a log number only.
  - `[low]` `[patch]` Blind: order test does not prove Google filled the description — it now asserts a phrase from the Google volume's description.
  - `[low]` `[patch]` Blind: dead `.replaceAll('978-0-00-744783-1', …)` in `leanFinnaRaw.int.spec.ts` (fixture has no hyphenated form, count 0) — deleted.
  - `[low]` `[reject]` Blind: `resultCount` disagrees with the trimmed `records` length — kept as received on purpose; `finnaResults` reads `resultCount` only when `records` is absent, so a re-run parser is unaffected.
  - `[low]` `[reject]` Blind: the narrowing is documented only in the spec, and "(Finna)" omits the fixture source — the `Source` contract in `source.ts` now states it; the fixture source stores Finna's lean body, which that line covers.
  - `[low]` `[patch]` Blind: `finnaMatches` runs twice in `finnaResults`; `toResult`'s param still named `body` — param renamed; the second match pass is kept (≤ 100 records, removing it would bypass the shared `leanFinnaBody`).
  - `[low]` `[patch]` Edge: zero-match Book wiped by the migration — same root as row 1; fixed there.
  - `[low]` `[reject]` Edge: Books saved through the fixture source keep untrimmed `sources.fixture` — fixture Books exist only in e2e test databases, which are rebuilt; never production.
  - `[low]` `[patch]` Edge: `src/fields/rawMetadata.ts:6` doc still says "complete response" — reworded to match `source.ts`.
  - `[low]` `[reject]` Verification gap: over-counting would pass the `>= 1` check — same as row 3.
  - `[low]` `[reject]` Verification gap: fixture source's lean raw untested — no acceptance criterion names the test-only source (tests rule, CLAUDE.md).
  - `[low]` `[patch]` Verification gap (other): zero-match wipe — same root as row 1.
  - `[false]` `[reject]` Intent: the backfill has not run against production — `prodMigrations` runs it once at the next production start, which is how this deployment reaches production; nothing in the code prevents it. Checking the log is Mika's after deploy.
  - `[low]` `[reject]` Intent: `{ title }`, already-lean and no-`finna` shapes not asserted — same as row 2.
  - `[false]` `[reject]` Intent: stored-Book `rawMetadata.sources.finna` trimming not asserted at the save surface — `mergeResults` copies each source's `raw` unchanged (tested in `metadata.unit.spec.ts`), and the adapter's `raw.finna` is asserted whole in `finna.unit.spec.ts`.
  - `[low]` `[reject]` Intent: fixture source raw untested — same as row 13.
  - `[low]` `[patch]` Intent: description not compared with Google's text — same as row 4.
  - `[false]` `[reject]` Intent: reverse-and-fail check not shown — run in step 3: with `[google, finna]` the case failed (`source: 'google'`, `A Clash of Kings`); file restored.
  - `[false]` `[reject]` Intent: no commit yet — the commit is made at finalisation, after review.

## Design Notes

A migration, not a script: `prodMigrations` runs at start and records it in `payload_migrations`, so it runs once in production (and on any older restored dump). It imports `leanFinnaBody` rather than freezing a copy, so "the same way" holds by construction. The spine names only the `RawMetadata` shape, not what `raw` holds, so it does not change. AD-13: if a parallel schema story merges first, regenerate this migration after the rebase.

## Verification

**Commands:**
- `npm run typecheck`, `npm run lint` -- expected: no errors
- `npm run test:unit`, `npm run test:int` (worktree Postgres, port 5439) -- expected: all pass
- Swap `sources/index.ts` to `[google, finna]`, run the order case -- expected: fails; restore.

**Manual checks (if no CLI):**
- After the next deploy, the app log shows the trim report once (Mika, on the LXC).

## Auto Run Result

Status: done

**Summary.** A Book's `rawMetadata.sources.finna` now holds only its own edition's Finna records. `leanFinnaBody()` in `finna.ts` cuts the response's `records` to `finnaMatches()` and keeps each record whole and every other key as received. The adapter and the fixture source store that body. A data-only migration, `20261021_072731_lean_finna_raw`, trims Books saved earlier with the same function and logs `Trimmed Finna raw data on <n> of <total> Books`. It skips a Book whose stored records match none of its current ISBN, so it never wipes a Book's records. Production runs it once at its next start (`prodMigrations`). A new integration case saves an ISBN that both sources answer. It proves the Book takes Finna's title and `source: 'finna'` and Google's description, and it fails with `sources/index.ts` reversed.

**Files changed**
- `src/lib/metadata/sources/finna.ts`: `leanFinnaBody()`; `finnaResults()` stores it as `raw.finna`.
- `src/lib/metadata/sources/fixture.ts`: stores the lean body.
- `src/lib/metadata/source.ts`, `src/fields/rawMetadata.ts`: doc comments say what `raw` holds now.
- `src/migrations/20261021_072731_lean_finna_raw.ts` (+ generated `.json` snapshot with no schema change, `index.ts`): the one-off trim, SQL through `db`, `down` a no-op.
- `tests/unit/finna.unit.spec.ts`: `raw.finna` expectations now the lean body; one case checks the kept record is whole.
- `tests/int/leanFinnaRaw.int.spec.ts` (new): trims an untrimmed Book, leaves `{ records: [] }` and an unmatched-ISBN Book alone, reports ≥ 1.
- `tests/int/saveCopyAction.int.spec.ts`: Finna before Google, Google filling the description.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.20 done.

**Review findings.** 21 findings: 17 low, 4 false.
- **Patched (low, 5 entries):**
  - the migration skips a zero-match row, with a test
  - the order test asserts Google's description text
  - a dead `replaceAll` removed
  - the `rawMetadata.ts` doc reworded
  - `toResult`'s parameter renamed
- **Deferred:** none.
- **Rejected (reasons in the Review Triage Log):**
  - only the shapes that could lose data are seeded
  - the count is asserted only as ≥ 1 on the shared test DB
  - `resultCount` is kept as received
  - the narrowing is documented in `source.ts` only
  - the double `finnaMatches` pass
  - untrimmed `sources.fixture` in e2e databases
  - the fixture source's lean raw is untested
  - the production run waits for the next deploy (false)
  - the stored-Book raw is not asserted at the save surface (false)
  - the reverse check was not shown (false; it was run)
  - no commit yet (false)

**Follow-up review:** false. Only low entries were patched (high 0, medium 0, low 5).

**Verification**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (36 warnings already there).
- `npm run test:unit`: 670 tests. `scanScreen.unit.spec.ts` failed once under load, a known flake that Story 4.22 fixes, then passed 3 of 3 alone; the rest passed.
- `npm run test:int` on the worktree's Postgres (port 5439): 41 files passed, 1 skipped (`migrationSchema`), 398 tests passed.
- With `sources/index.ts` swapped to `[google, finna]`, the order case failed (`source: 'google'`, `A Clash of Kings`). The file is restored.
- The implementation subagent ran `payload migrate` from the CLI on a throwaway database. Every migration ran, this one included, so the `@/` import also resolves in the CLI.

**Residual risks**
- The production run is not yet seen: after the next deploy, the app log should show the trim report once.
- If a parallel schema story (4.17–4.19, 4.21) merges first, this migration and its snapshot have to be regenerated after the rebase (AD-13).
- The int test runs `up` over the shared `bookeh_test` database, so it also trims untrimmed Finna data that other tests left there. This is harmless.
