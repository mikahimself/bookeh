---
title: '10.1 Reading state on user-books'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_revision: 'ca1a9d64f45fd3c10a2bb636e9ffcf7baee881f5'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The catalogue stores only a read flag. It cannot represent current reading or the dates needed for reading progress and statistics.

**Approach:** Add private start and finish dates to user-books, derive its three-state reading status, implement the approved transitions and date-edit service, and preserve bulk Read Undo. Keep existing frontend actions compatible until story 10.2 mounts the new controls.

## Boundaries & Constraints

**Always:** Follow AD-6/7/8/13/16/18/20. Reading belongs to the viewer and Book, including wishlist-only holdings. Book targets pass requireOwnBook; copy selections validate every id before writing and deduplicate Books. Service changes use upsertUserBook sequentially within a transaction. Enforce date invariants in collection beforeValidate, including back-office updates. Use strict YYYY-MM-DD inputs, noon UTC storage, UTC date read-back, and Europe/Helsinki today. Preserve ratings, tags, overrides, privacy, and no-op states. Commit generated types and migration together and reconcile the spine.

**Never:** Add new reading UI, stats, acquisition data, re-read history, or a new merge-date policy. Do not migrate the dev database, use schema push in tests, or claim a production-dump check without running it. Add only the three integration cases specified by story 10.1; adapt existing assertions as needed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Missing state | No user-books row | unread, read false, dates null | No error |
| Start | unread → reading | read false, Started today, Finished null | No error |
| Finish | reading → read | retain Started, Finished today; single changed Book reports calendar finishedDays, minimum 1 | No error |
| Direct read | unread → read | read true, no dates | No error |
| Resume | read → reading | retain Started or use today; clear Finished | No error |
| Clear | any changed state → unread | read false, both dates null | No error |
| No-op | state already requested | no write or Undo entry; retain dates | No error |
| Toggle | all targets read / otherwise | unread / read, reading counts as not read | Invalid/unowned target: NOT_FOUND, no writes |
| Date edit | Finished supplied on reading | mark read, retain valid dates; return UserBookState, no Undo | Clearing Started while reading: VALIDATION on readingSince |
| Invariant | Finished without read, start after finish, future date, malformed date | refuse write; keep previous row | VALIDATION on offending field |
| Bulk Undo | mixed reading/unread/read Books | restore all three previous values for changed Books only; skip missing rows | Transactional |

</intent-contract>

## Code Map

- `src/collections/UserBooks.ts:27` — ownerAccess collection; add optional day-only dates and collection hook. `src/collections/Loans.ts:19` demonstrates noon normalization and Payload ValidationError. Collections cannot import lib/i18n.
- `src/lib/books/upsertUserBook.ts:32` — extend UserBookChanges, RowData, hasState and data assignment; undefined unchanged, null cleared. Existing mergeUserBook policy remains unchanged.
- `src/lib/books/effectiveBook.ts:42` and `userBookState.ts:8` — define ReadState and add state/dates to the reader and missing-row defaults.
- `src/lib/books/setRead.ts:38` — existing transactional owner gate, distinct Books, and boolean Undo; expand to ReadState and full previous reading values.
- `src/lib/books/setRating.ts:23` — pattern for the new setReadingDates service; requireOwnBook already supports open wishlist entries.
- `src/lib/loans/dates.ts` — strict date and Helsinki-today logic; books cannot import loans. Put shared reading field/date primitives under `src/fields` without broadening import rules.
- `src/app/(frontend)/(sections)/actions.ts:93,135` — translate boolean action inputs to read/unread and map service state back to boolean action results, preserving Undo callback.
- `tests/int/setRead.int.spec.ts` — retain ownership, deduplication, no-op Undo and gone-row cases; add the three required integration cases here. `tests/helpers/builders.ts` supplies failure and builders.
- `tests/int/{foreignKeys,setRating,userBooks}.int.spec.ts`, `tests/helpers/collectionPage.ts`, `tests/unit/bookDetail.unit.spec.ts` — adapt direct boolean callers and complete state fixtures/assertions.
- `scripts/test-db.ts`, `.github/workflows/ci.yml:66`, `src/migrations/index.ts` — isolated test migration and drift-check conventions. Latest snapshot is 20261104_151042_tags; registry also contains data-only seed migration.
- `ARCHITECTURE-SPINE.md:448` under planning architecture — already declares target ReadState, setRead, setReadingDates and UserBookState; check implementation against it.
- `deploy/README.md:415` — restored latest-production-dump rehearsal is an LXC procedure; no local dump or LXC destination was discovered. Record concrete local migration verification and the unavailable external check honestly.

## Tasks & Acceptance

**Execution:**

- [x] `src/fields/readingDates.ts`, `src/collections/UserBooks.ts` — implement calendar date primitives and invariant, normalize valid stored dates to noon UTC.
- [x] `src/lib/books/{effectiveBook,userBookState,upsertUserBook,setRead,setReadingDates}.ts` — extend state and writer, apply transitions, complete Undo, and date-edit service.
- [x] `src/app/(frontend)/(sections)/actions.ts` and existing tests/fixtures listed above — preserve current action contracts while adopting new service signature and state shape.
- [x] `tests/int/setRead.int.spec.ts` — add exactly three integration cases covering transition/toggle matrix, invariant/date edits through service, and bulk finish Undo.
- [x] `src/payload-types.ts`, `src/migrations/*` — generate types and additive nullable-date migration, migrate only bookeh_test and check schema drift.
- [x] `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` — reconcile signatures and any shared helper placement in the same commit.
- [x] Spec and `sprint-status.yaml` — record validation, review and external production-rehearsal limitation; synchronize story status accurately.

**Acceptance Criteria:**

- Given each matrix state, when the public reading services execute, then the matrix results hold and getUserBookState returns the complete state with calendar dates.
- Given service or back-office writes, when a date violates AD-8, then the collection refuses it with a field validation error and previous state remains unchanged.
- Given a copy selection including a reading Book and duplicates, when Read is toggled and undone, then each changed distinct Book regains its exact read/start/finish values while unchanged Books remain outside the restore.
- Given existing frontend consumers, when their boolean Read actions execute, then they keep their current result/Undo contract using the new service internally.
- Given a migrated test database, when generated types, schema drift and the required suites are checked, then they pass; the spine matches built signatures and production-dump rehearsal evidence or its unavailable prerequisite is recorded.

## Spec Change Log

## Review Triage Log

### 2026-11-06 — Implementation self-review

- Checked every reading transition, no-op state, distinct-Book toggle and changed-only restore against the intent matrix and AD-6/7/8/13/16/18/20.
- Confirmed date edits gate Book ownership, including wishlist-only holdings, and collection validation covers partial back-office writes while preserving previous rows after errors.
- Confirmed current boolean action contracts and their select-mode restore callback remain intact. No new frontend controls or merge-date policy were added.
- Independent review pending; story is ready for review. Latest-production-dump rehearsal remains unavailable because neither a production dump nor an LXC destination/access was supplied.

### 2026-11-06 — Review pass

- verdicts: 19 findings/observations — high 0, medium 9, low 4, false 6, maybe-false 0
- findings (all four layers launched before triage; the intent layer waited for a concurrency slot):
  - `[false]` `[reject]` Blind: hook newly creates stale-date overwrite risk — Payload 3.90.2 beforeValidate/promise.js:237 already refills every omitted field before the collection hook runs (utilities/update.js:108–145); normalizing those same values does not introduce the alleged extra overwrite. General concurrent full-row update behavior predates this story.
  - `[low]` `[reject]` Blind: zone-less back-office timestamp depends on host timezone — real but outside everyday paths: services accept strict day-only inputs and the admin day picker sends UTC ISO values. An extra timestamp-format guard adds branching for this uncommon legacy API input; no change under the low-finding complexity rule.
  - `[medium]` `[patch]` Blind: year 0000 passes calendar validation but PostgreSQL rejects it — independently confirmed SQLSTATE 22008 on read-only conversion. Minimal year-zero rejection and assertions requested; shared root with edge finding.
  - `[low]` `[patch]` Blind: finish-before-start error is always on Started — real misleading field attribution; chronological-pair error will attach to Finished, following Loans.returnedOn.
  - `[medium]` `[patch]` Blind: Helsinki future-day boundary is unverified — current 2999 rejection misses adjacent dates near UTC/Helsinki midnight; extend the existing invariant case with controlled Date and restore it afterwards.
  - `[low]` `[patch]` Blind: privacy tests do not populate reading dates — ownerAccess already hides the whole row, but the named AD-6 privacy invariant merits assertions against populated dates for another owner and admin inside the existing case.
  - `[medium]` `[patch]` Blind: Undo never restores a populated finish — dated read target in the mixed selection was unchanged; extend bulk case with dated all-read → unread → Undo.
  - `[medium]` `[patch]` Blind: Started-only and Finished-only read states unverified — extend existing date case with accepted single-date saves and noon UTC persistence; shared root with verification finding.
  - `[low]` `[patch]` Blind: changed bulk action suite was omitted from focused execution — run existing toggleCopiesReadAction suite alongside setRead after action-coverage patch; no edit to the spec is the proposed fix.
  - `[false]` `[reject]` Blind: production-dump check must precede merge — this is an explicit outstanding pre-merge gate, accurately recorded; this run performs no merge or deployment and does not claim the rehearsal passed. Local completion cannot serve as production rehearsal evidence.
  - `[medium]` `[patch]` Verification: Book-detail action mapping has no execution coverage — pre-verified component tests mock the action. Extend the existing action integration case with true/false result and persistence checks; shared root with intent action observation.
  - `[medium]` `[patch]` Verification: Undo restoration of populated Finished unverified — pre-verified mutation witness would escape current tests; same patch as blind Undo finding.
  - `[medium]` `[patch]` Verification: exactly-one-date states unverified — pre-verified mutation witness rejects both supported combinations without failing tests; same patch as blind single-date finding.
  - `[false]` `[reject]` Intent: collection/service behavior aligns with numbered story — descriptive confirmation, no defect to fix.
  - `[medium]` `[patch]` Intent: compatibility action behavior is asserted only through mocks — verified by action imports and tests; same action integration patch as verification layer.
  - `[false]` `[reject]` Intent: no new user-visible reading controls — story 10.2 explicitly owns these controls; 10.1 is the data/service foundation.
  - `[false]` `[reject]` Intent: diff cannot independently prove complete workflow execution — review is still running; this is an observation about evidence, not a demonstrated skipped step.
  - `[false]` `[reject]` Intent: review-ready diff is not merged/deployed — current intermediate status is accurate; no deployment was requested and workflow forbids pushing.
  - `[medium]` `[patch]` Edge: year 0000 yields INTERNAL from PostgreSQL — confirmed by validator and SQL conversion; same minimal year-zero patch as blind finding.

## Design Notes

The state is derived, never another stored column: read takes precedence over Started. Domain input validation rejects malformed calendar dates before JavaScript Date can normalize them. The collection hook owns cross-field validation even for partial back-office updates. Existing bool action contracts form a temporary boundary until 10.2; this story changes no frontend screen.

## Verification

**Commands:**

- `npm run generate:types` — date fields reflected in generated types.
- `DATABASE_PUSH=false npm run payload -- migrate:create reading_state --skip-empty` — additive nullable columns only; inspect generated SQL.
- `npm run test:int -- setRead setRating userBooks foreignKeys` — isolated migrations and focused integration suites pass.
- `npm run test:unit` — full suite passes, including shared fixtures consuming the changed type.
- `npm run typecheck`, scoped ESLint, `git diff --check` — pass.
- CI-style migration snapshot comparison — no schema drift after applying committed migrations.
- Latest production dump rehearsal — use documented deployment procedure if access becomes available; otherwise record the missing dump/host without claiming success.

### 2026-11-06 — Executed validation

- `npm run generate:types` — passed; both optional reading dates appear in `UserBook` and selection types.
- `DATABASE_PUSH=false npm run payload -- migrate:create reading_state --skip-empty` — generated `20261106_144405_reading_state`; inspected SQL adds only the two nullable `timestamp(3) with time zone` columns, with matching down statements.
- `npm run test:int -- setRead setRating userBooks foreignKeys` — passed, 4 files / 22 tests. Exactly three integration cases added: transition/toggle matrix, date edit/invariant coverage, and mixed bulk finish Undo. Test runner migrated only `bookeh_test`, with schema push disabled.
- Read-only SQL on `bookeh_test` — one applied reading-state migration, zero `payload_migrations.batch = -1` rows, and both new columns nullable `timestamp with time zone`. Development database was not migrated.
- `npm run test:unit` — passed, 101 files / 1,345 tests.
- `npm run typecheck` — passed after correcting required wishlist fixture data and the copy-array type.
- Scoped ESLint across all changed handwritten TypeScript and `git diff --check` — passed.
- CI-style `migrate:create ci_drift_check --force-accept-warning` snapshot comparison — passed against the new reading-state snapshot after test migration, ignoring only `id` and `prevId`; temporary migration and registry edits removed.
- Production rehearsal — not run: no latest production dump or reachable LXC destination/access was available. The procedure remains `deploy/README.md`'s restore rehearsal. Local test migration and drift evidence do not claim this external check passed.

Residual risks: production-dump rehearsal is still required before merge under the epic's deployment constraint. No new screen was mounted, so no browser acceptance walk applies to 10.1. Schema-changing stories must merge serially and regenerate their migration after rebasing.

### Parent verification and matrix audit

- All eleven matrix rows are exercised by the passing eight setRead integration cases: the transition matrix covers missing/start/finish/direct-read/resume/clear/no-op; existing and new toggle cases cover ownership/deduplication; date-edit/invariant case covers validation and atomicity; mixed bulk Undo plus the existing gone-row case cover restore.
- Parent rerun: 22 focused integration tests passed; typecheck, generated types, scoped ESLint, diff checks and independently regenerated migration snapshot comparison passed.
- Initial parent unit rerun hit worker-start timeouts and one existing wishlist Remove test timeout; retry with `npm run test:unit -- --maxWorkers=2` passed all 101 files / 1,345 tests in 30.75 seconds. No code or expectations were changed for that retry.
- Initial sandboxed Next type generation could not open the SWC cache pruning lock; the same check passed with cache access.

## Auto Run Result

Status: done

Implemented private three-state reading with optional calendar start/finish dates, collection-level invariants for service and back-office writes, transition/date-edit services, and complete bulk Undo. Existing frontend boolean Read actions remain compatible. Story 10.2 supplies the new reading controls.

Files changed:

- `src/collections/UserBooks.ts` — optional day-only fields and cross-field validation/normalization.
- `src/fields/readingDates.ts` — real calendar validation, Helsinki today, noon UTC and calendar-day arithmetic.
- `src/lib/books/effectiveBook.ts`, `userBookState.ts` — ReadState and complete private state with UTC calendar read-back.
- `src/lib/books/upsertUserBook.ts` — sole service writer accepts nullable reading dates.
- `src/lib/books/setRead.ts` — transition table, changed-only writes, finish-day result and full-value transactional restore.
- `src/lib/books/setReadingDates.ts` — owner-gated date edits, finish-on-reading and Started-clear refusal, without Undo.
- `src/app/(frontend)/(sections)/actions.ts` — preserve boolean action result/input shapes and select-mode restore.
- `src/migrations/20261106_144405_reading_state.{ts,json}`, `src/migrations/index.ts`, `src/payload-types.ts` — two additive nullable columns, schema snapshot, registration and generated types.
- `tests/int/setRead.int.spec.ts` — exactly three new integration cases covering the transition matrix, service/back-office date validation and bulk Undo.
- `tests/int/toggleCopiesReadAction.int.spec.ts` — existing success case now executes both boolean single-Book inputs as well as bulk action/Undo.
- `tests/int/{foreignKeys,setRating,userBooks}.int.spec.ts`, `tests/helpers/collectionPage.ts`, `tests/unit/bookDetail.unit.spec.ts` — service signature and complete state fixture adaptations.
- Architecture spine — reconciled shared helper location, finish-day semantics and temporary action compatibility.
- `epic-10-context.md`, this spec and `sprint-status.yaml` — context, review/validation evidence and story completion; Epic 10 in progress.

Review resolution:

- Four independent layers completed. The 19 per-layer findings/observations are preserved individually in Review Triage Log; shared-root grouping produced eight patched entries: five medium, three low; no high entries, no deferrals.
- Patches applied: year-zero rejection (PostgreSQL SQLSTATE 22008 reproduced), chronological error on Finished, adjacent Helsinki-day validation coverage, populated-date owner/admin privacy coverage, non-null finish-date Undo coverage, both valid one-date combinations, boolean single-Book action execution, and execution of the changed bulk action suite. Test additions extend existing cases; total new cases remains exactly three.
- Rejections: stale-overwrite attribution was disproved by Payload's prior field refill; zone-less admin timestamps were low impact outside normal day-only/UTC input paths and did not justify another guard; production rehearsal remains an honest external pre-merge gate rather than a claimed merge; the intent layer's aligned service surface, separately scoped 10.2 controls, in-flight workflow evidence and intermediate review status are not defects. Each reason remains in its original triage row.
- Follow-up review recommendation: false. The first-pass volume threshold is met (five medium patched entries), but all patched behaviors now have executed coverage; no specific remaining unverified risk arises from those patches. The external production rehearsal is separate from code-review convergence.

Final parent verification after patches:

- `npm run test:int -- setRead setRating userBooks foreignKeys toggleCopiesReadAction` — 5 files / 24 tests passed, with migrations and schema push disabled on `bookeh_test`.
- `npm run test:unit -- --maxWorkers=2` — 101 files / 1,345 tests passed in 31.84 seconds.
- `npm run typecheck`, `npm run generate:types`, scoped ESLint on every changed handwritten TypeScript file, and `git diff --check` — passed.
- Final independent CI-style drift snapshot — equals the reading-state migration after excluding only generated snapshot ids; temporary files removed and registry preserved.
- Matrix audit — every row exercised and passed. Review additions cover boundary, privacy, non-null restore and adapter gaps without adding cases.
- No frontend screen added or changed; no browser acceptance walk applies to this service-foundation story.

Residual risks and deployment gate: latest-production-dump rehearsal has not run because this environment has neither the dump nor LXC destination/access. AD-13 still requires the documented restore rehearsal before merge/deployment. No development database migration, merge, deployment or push was performed. Schema changes must merge serially and regenerate their migration after rebasing.
