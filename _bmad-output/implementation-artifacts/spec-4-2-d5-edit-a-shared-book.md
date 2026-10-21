---
title: 'Story 4.2: [D5] Edit a shared Book'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: 'd3abc955381ef1336d82d4bc0f9c4ee9ac00cc28'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      AD-5 says a shared Book's `books.genres` is written only by `mapSubjectsToGenres()`, while the same bullet lets the admin edit them on Edit book, which `editBook()` now does.
    evidence: |-
      ARCHITECTURE-SPINE.md AD-5, "System genres" bullet: the first sentence says "written only by mapSubjectsToGenres()", and a later sentence says "The admin edits a shared Book's system genres on Edit book". The conflict predates 4.2. To fix it, reword the first sentence to name `editBook()` for the admin.
    location: >-
      _bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:120
    severity: low
  - summary: >-
      Book `publisher` and `language` have no maxLength, and `year`, `pages` and `seriesIndex` have no min or integer rule, so editBook can store unbounded text or negative or fractional numbers.
    evidence: |-
      src/fields/bookFields.ts `overridable()` declares maxLength only for title, subtitle and description, and the number fields have no min or integer rule. This is a pre-existing schema gap. Since 4.2, the admin can write these values to a shared Book and any user to their own override. Fixing it is a schema change (migration).
    location: >-
      src/fields/bookFields.ts:49
    severity: low
---

<intent-contract>

## Intent

**Problem:** A saved Book's values cannot be corrected. AD-5 makes `editBook()` in `lib/catalogue` the only path for that, and 4.3, 4.4 and 4.7 build on it.

**Approach:** Add `editBook(ctx, { bookId, edits })` for the scalar fields and system genres of a shared Book the viewer holds. The admin's edit writes the shared Book with system privileges and drops the admin's own override of each edited field. A non-admin's edit becomes their overrides through `upsertUserBook()`. The whole edit runs in one transaction and has no Undo.

## Boundaries & Constraints

**Always:** `requireOwnBook(tx, bookId)` runs first inside the transaction. Admin means `canEditShared(ctx.user)`. Sparse edits: only keys whose value is not `undefined` are written, `null` clears, and nothing is compared with stored values. Text is trimmed and NFC-normalised, `''` stored as `null`. Accepted keys: `title`, `subtitle`, `seriesIndex`, `publisher`, `year`, `language`, `pages`, `description`, and `genres` (system genre ids, admin only, deduplicated). Any other key, `themes` included, and a cleared `title` fail with `VALIDATION` naming the key, before any read. Field limits stay with the collections.

**Never:** No server action, page or UI (4.7). No `authors`, `series` (4.3) or `isbn13` (4.4) keys yet; they fail as unknown keys. No `tags` or `copy` on the input yet (Epic 9, 4.9). No private-Book edit: a held private Book fails with `VALIDATION` naming each submitted key and writes nothing, until 4.4. No `withUndo` and no undo token. No spine edit: AD-5/AD-6 already state this; the code types grow toward the spine's `BookEdits` and `EditBookInput` story by story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin edits | admin holds shared X and overrides X's title; edits `{ title, subtitle: null, genres: [g] }` | X has the new title, no subtitle and genre g; the admin's title override is gone; B (holding X, no row) sees all three; `publisher` unchanged | No error expected |
| User edits | B holds shared X; edits `{ title, subtitle: null }` | B's row overrides both (subtitle cleared); X unchanged; the admin sees X's values | No error expected |
| Rejected keys | B sends `genres`; anyone sends `themes`; anyone clears `title` | nothing written | `VALIDATION` naming the key |
| Not held | C has no copy of X | nothing written | `NOT_FOUND` |
| Private Book | A holds own private P; any edit | nothing written | `VALIDATION` naming each key (until 4.4) |

</intent-contract>

## Code Map

- `src/lib/books/upsertUserBook.ts` -- `upsertUserBook(ctx, bookId, { overrides })` for the user path and `{ dropOverrides }` for the admin path (built for D5; a drop with no row writes nothing). It already normalises text, rejects a `null` title, and rejects overrides on a private Book. Do not change it.
- `src/lib/books/requireOwnBook.ts` (gate, on `tx`), `src/access/roles.ts:20` (`canEditShared`), `src/lib/payload/transaction.ts` (`withTransaction`, `assertLive`).
- `src/lib/catalogue/sharePrivateBook.ts:285` -- the admin write's pattern: `assertLive(tx)`, then `payload.update({ collection: 'books', ..., ...system(tx) })`.
- `src/lib/payload/gateway.ts` -- `findByID(tx, { collection: 'books', id, select: { visibility: true }, depth: 0 })` reads visibility as the viewer.
- `src/fields/bookFields.ts` -- `OVERRIDABLE_BOOK_FIELDS` picks the keys the admin path drops (`genres` is not overridable).
- `tests/int/requireOwnBook.int.spec.ts`, `tests/int/effectiveBook.int.spec.ts` -- setup to copy (`createUser({ roles: ['admin', 'user'] })`, system-created Books and genres, copies via `gateway.create`, views via `getEffectiveBooks(ctx, [id])`).

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/editBook.ts` -- new: the exported `BookEdits` (the accepted keys, typed as in the spine), `EditBookInput = { bookId: number; edits: BookEdits }`, and `editBook(ctx, input): Promise<void>`. Order: pure checks (unknown keys, non-admin `genres`, cleared title), then `withTransaction`: gate, visibility read, then admin `payload.update` plus `upsertUserBook(tx, id, { dropOverrides })`, or user `upsertUserBook(tx, id, { overrides })`. A doc comment cites AD-5, AD-6 and D-8 and says there is no Undo. -- the story's service.
- `tests/int/editBook.int.spec.ts` -- new, admin and B both holding shared X: the admin and user rows of the matrix, each read through `getEffectiveBooks` for both viewers; one rejection case covers the remaining rows (B's `genres`, the admin's `themes`, a cleared title, a non-holder, A's private P) and leaves X unchanged. -- the AC's two-user proof (access spine rule).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `4-2-d5-edit-a-shared-book: done` when finished.

**Acceptance Criteria:**
- Given a shared Book the admin holds, when the admin submits sparse `BookEdits`, then each submitted field (a cleared one included, `genres` allowed) is written to the shared Book with system privileges, the admin's own override of each is cleared, and unsubmitted fields are untouched.
- Given a shared Book a non-admin holds, when they submit `BookEdits`, then each submitted field (a cleared one included) becomes their override and the shared Book does not change. `genres` fails with `VALIDATION`.
- Given `themes` in the edits, when anyone submits them, then `editBook` fails with `VALIDATION` and writes nothing.
- Given an admin and a user holding the same shared Book, when each edits it, then the user sees the admin's edit and the admin does not see the user's.
- Given any `editBook` call, when it resolves, then it returns no undo token and registers no restore.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 19, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` (blind) The spec is outside the diff while sprint-status says done. Refuted: the spec, sprint-status and code land in one story commit at finalize, and the spec's status is set to done in that commit.
  - `[low]` `[defer]` (blind) AD-5 says shared `books.genres` is written "only by `mapSubjectsToGenres()`", but `editBook` now writes them for the admin. The very next clause of the same AD-5 bullet already allows the admin's genre edit on Edit book, so the contract allows it and the wording conflict predates this story. Deferred as a spine wording fix.
  - `[low]` `[reject]` (blind) No runtime type check of values: `genres: "12"`, `genres: 5`, `title: 42`. No caller exists yet. By convention, input shape is validated at the action boundary (`isSaveInput` in `scan/actions.ts`, triaged the same way in 4.1), and 4.7's action is that boundary. A guard here would add surface for later.
  - `[low]` `[defer]` (blind) `publisher` and `language` have no `maxLength`, and the number fields have no `min` or integer rule. This is a pre-existing gap in the `bookFields.ts` schema, not caused by this story. A shared write needs the admin; a user's bad value only reaches their own override.
  - `[low]` `[patch]` (blind) No test shows that the admin keeps overrides of fields they did not edit (AC1). Patched: the admin also overrides `language` and keeps it.
  - `[low]` `[patch]` (blind) AC4's "each edits the same Book" is never shown, nor that an admin edit leaves B's override in place. Patched: the user test has the admin edit `title` after B, and B keeps B's title.
  - `[low]` `[patch]` (blind) `toMatchObject` matches `fields` as a subset, so a wrongly flagged extra key would pass. Patched: the exact `fields` are pinned.
  - `[low]` `[patch]` (blind) A held Book the viewer cannot read fails with `NOT_FOUND` from the visibility read, which is undocumented. The behaviour is fine. Patched with a doc sentence.
  - `[low]` `[reject]` (blind) The visibility read and the write are not atomic. A concurrent visibility flip during a single admin edit is very unlikely, and the fix would need row locking.
  - `[low]` `[patch]` (blind) An empty edit succeeds silently on a private Book. It now passes the gate and writes nothing (gate moved before the early return in step 3). Patched with a doc sentence.
  - `[low]` `[reject]` (edge) Non-array or non-integer `genres` is accepted. Same root cause and reason as the runtime-type row above.
  - `[low]` `[reject]` (edge) A scalar of the wrong runtime type is accepted. Same root cause and reason.
  - `[low]` `[reject]` (edge) `edits` set to `null` throws a `TypeError` that becomes `INTERNAL`. Same root cause and reason.
  - `[low]` `[defer]` (edge) Negative, fractional or infinite `year`, `pages` or `seriesIndex` is accepted. Same root cause and deferral as the schema-limits row above.
  - `[low]` `[patch]` (verification-gap) The private-Book guard is tested only for a non-admin, where `upsertUserBook` rejects anyway. Patched: an admin-held private Book is rejected and reads back unchanged.
  - `[low]` `[patch]` (verification-gap) The admin path's text normalisation is never exercised. Patched: the admin sends a padded title and `subtitle: ''`.
  - `[false]` `[reject]` (intent) The UI surface (reading R2) is not reached. Refuted: the story's criteria are all at the service, and the screen is Story 4.7.
  - `[low]` `[patch]` (intent) An admin edit against B's existing override is not asserted. Same root cause and patch as the AC4 row above.
  - `[false]` `[reject]` (intent) A cleared title is rejected although the criterion says "including a cleared field". Refuted: `books.title` is required and `upsertUserBook` already rejects a `null` title override, so the cleared title cannot be stored for anyone.
  - `[low]` `[reject]` (intent) Only `title` and `subtitle` are exercised among the scalar fields. Every scalar goes through the same loop and the same writer, so a per-field test would only restate it (tests convention).
  - `[low]` `[reject]` (intent) "Server never diffs" is not exercised. Test-only: no code compares values, so there is no behaviour that could break.
  - `[low]` `[reject]` (intent) Themes are tested only for the admin. The key check does not depend on role. Test-only.
  - `[false]` `[reject]` (intent) "Not undoable" is shown only by the `void` result. Refuted: the signature is `Promise<void>` and there is no `withUndo` or restore.
  - `[false]` `[reject]` (intent) The spec is outside the diff. Same refutation as the first row.

## Design Notes

Pure checks run before the transaction, so a rejected edit reveals nothing about the Book. The user path reads visibility twice (here and in `upsertUserBook`), which keeps that writer unchanged.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors (incl. `bookeh/system-privileges`)
- `npm run test:int -- tests/int/editBook.int.spec.ts` then `npm run test:int` -- expected: all pass

## Auto Run Result

Status: done

**Summary:** Added `editBook(ctx, { bookId, edits })` in `lib/catalogue` for a held shared Book's scalar fields and system genres. These checks run before any read: unknown keys (`themes` included), `genres` from a non-admin, and a cleared title all fail with `VALIDATION` naming the key. Then one transaction runs `requireOwnBook`, then a visibility read as the viewer; a private Book fails with `VALIDATION` until 4.4. The admin's edit writes the shared Book with `system(tx)` and drops the admin's own override of each edited field. Anyone else's edit becomes their overrides through `upsertUserBook`. Text is trimmed and NFC-normalised, `''` becomes `null`, and genres are deduplicated. The function has no Undo. The spine already states this contract, so it is unchanged (one wording conflict is deferred).

**Files changed:**
- `src/lib/catalogue/editBook.ts`: new service with its `BookEdits` and `EditBookInput` types.
- `tests/int/editBook.int.spec.ts`: two-user test covering the admin edit, the user edit and every rejection row.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.2 is done.

**Review findings:** 24 in total, all `low` or `false`.
- 7 patches, all `low`. One is a doc sentence for each of two undocumented outcomes (an empty edit passes the gate and writes nothing; a held Book the viewer cannot read gives `NOT_FOUND`). The test now shows that:
  - the admin keeps an override of a field they did not edit;
  - the admin path normalises text;
  - both users editing the same Book leaves B's override in place;
  - the exact `fields` are named;
  - an admin-held private Book is rejected.
- 3 deferred, as two entries: the AD-5 genre-writer wording, and missing schema limits on publisher, language and the number fields (raised twice).
- 9 rejected as `low`:
  - runtime value types, four times (the shape is validated at the action boundary, 4.7);
  - the non-atomic visibility read (a rare race, the fix needs locking);
  - three test-only asks with nothing that can break (other scalars, "never diffs", themes as a non-admin).
- 5 rejected as `false`: the spec outside the diff (twice), the UI surface (that is Story 4.7), the cleared title (a Book always has a title), and "not undoable" (the signature has no undo).
- The step-3 check also moved the empty-edit early return after `requireOwnBook`, so the gate always runs.

**Follow-up review recommended:** false. Patched by verdict: high 0, medium 0, low 7.

**Verification:**
- `npm run typecheck`: clean.
- `npx eslint src tests`: 0 errors, the 36 warnings that were already there. Plain `npm run lint` also picks up errors from other worktrees' `.next` folders.
- `npm run test:int`: 44 files, 427 tests passed.
- `npm run test:unit`: 690 passed.
- Every matrix row is covered by `editBook.int.spec.ts`, which ran.

**Residual risks:**
- `editBook` checks key names but not value types. 4.7's server action has to validate the shape before calling it.
- The visibility read and the write are unlocked, so a concurrent visibility flip could slip between them.

