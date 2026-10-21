---
title: 'Story 4.3: [D19] Edit authors and series'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: '1d0e834c54b698e56714812f547fe00ed56d9dbb'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `editBook()` (4.2) edits only a shared Book's scalar fields and system genres. A misspelt or missing author or series cannot be fixed, and the spine's `BookEdits` already includes `authors` and `series` as names (FR-13, FR-14, AD-5, AD-6, D-8).

**Approach:** Accept `authors: string[]` and `series: string | null` in `BookEdits`. Inside the edit's transaction, after the visibility check, resolve each name to an id through `findOrCreateByName()`. The admin's names use the `'shared'` scope and are written to the shared Book. A non-admin's names use the `'private'` scope and are stored as their overrides.

## Boundaries & Constraints

**Always:**
- Names resolve one by one, in the order given, through `findOrCreateByName(tx, collection, scope, { name })`. Never pass `sortName`: it comes only from sources (AD-5).
- Author ids are deduplicated and keep first-occurrence order. `authors: []` clears the authors. `series: null`, or a series name blank after trimming, clears the series.
- An author name blank after trimming fails with `VALIDATION` naming `authors`. This is a pure check, made before any read, alongside 4.2's checks.
- Names resolve only after `requireOwnBook` and the shared-visibility check. A rejected edit therefore creates no author or series.
- The admin's path keeps dropping its own override of each edited field. `authors` and `series` are already in `OVERRIDABLE_BOOK_FIELDS`.

**Never:** No `isbn13` key and no private-Book edit (4.4). No orphan clean-up of authors or series that an edit unlinks. No author or series suggestions (5.9). No action, page or UI (4.7). No changes to `findOrCreateByName` or `upsertUserBook`. No spine edit: AD-5, AD-6 and the `BookEdits` seed already state this.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Admin edits | admin and B hold shared X; shared author S exists; the admin has a private author named N and overrides X's `authors`; the admin edits `{ authors: [upper-cased S.name, N], series: 'Uusi sarja' }` | X's authors are [S, a new shared N, not the admin's private N]; X's series is a new shared row; the admin's `authors` override is dropped; B sees the same authors and series | No error expected |
| User edits | B holds X; B edits `{ authors: [S.name, 'B Kirjoittaja', S.name], series: null }` | B's override is `authors` [S, new private P created by B] and `series` cleared; X is unchanged; the admin sees X's own values; A cannot read P | No error expected |
| Blank author | anyone edits `{ authors: ['  '] }` | nothing written | `VALIDATION` naming `authors` |
| Private Book | A edits `authors` on A's own private Book | nothing written, and no author created | `VALIDATION` naming `authors` (until 4.4) |

</intent-contract>

## Code Map

- `src/lib/catalogue/editBook.ts` -- 4.2's service, to extend. `BookEdits` and `EDIT_KEYS` gain `authors` and `series`. The pure-check loop builds `changes`. Inside the transaction: the gate, the visibility read, then the admin branch (`payload.update` with `system(tx)` plus `dropOverrides`) or the user branch (`upsertUserBook` with `overrides`). `isOverridable` already admits `authors` and `series`. Update the doc comment: 4.3 is no longer "joins later".
- `src/lib/catalogue/findOrCreateByName.ts:94` -- `findOrCreateByName(ctx, 'authors' | 'series', 'shared' | 'private', { name })` returns `{ id, created }`. It normalises the name, throws `VALIDATION` on `name` for a blank one, and runs inside the caller's `tx`. Read-only for this story.
- `src/lib/catalogue/ensureSharedBook.ts:74` -- the same loop over author names in the shared scope (pattern only).
- `src/lib/books/upsertUserBook.ts:14` -- `BookOverrides` types `authors` as `number[]` and `series` as `number | null`. It deduplicates arrays itself. Read-only.
- `src/access/catalogue.ts` -- the admin can read private authors (FR-48 applies to user data, not to catalogue rows). That is why the "cannot read P" check uses A, a non-admin.
- `tests/int/editBook.int.spec.ts` -- the 4.2 fixtures to extend: `sharedX()`, `seen()`, `rejectsNaming`, `systemBook`, `holdCopy`.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/editBook.ts` -- Add `authors: string[]` and `series: string | null` to `BookEdits` and `EDIT_KEYS`. In the pure checks, reject an author name that is blank after trimming, and normalise `series` (`''` becomes `null`). In the transaction, after the visibility check, resolve the names (scope `'shared'` for the admin, `'private'` otherwise) to `authors: number[]` and `series: number | null`, then write them through the existing admin and user branches. -- AD-5 matching for both roles.
- `tests/int/editBook.int.spec.ts` -- One admin case and one user case from the matrix, each read through `getEffectiveBooks` for both viewers. In the user case, `gateway.findByID` as A on P fails. Add the blank-author case and the private-Book `authors` case to the existing rejection test, and check that no author named in a rejected edit exists afterwards. -- The criteria name this two-user proof (access spine rule).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- Set `4-3-d19-edit-authors-and-series: done` when finished.

**Acceptance Criteria:**
- Given a shared Book the admin holds, when the admin submits `authors` or `series` names, then each name matches or is created among shared records only, the shared Book's authors and series are updated, and the admin's own override of each submitted field is dropped.
- Given a shared Book a non-admin holds, when they submit names, then each name matches shared records first and then their own private ones, a name matching nothing becomes their private record, and the ids are stored as their relationship override.
- Given both edits, when another user reads the Book, then they see the admin's change, and see neither the user's override nor the user's new private author.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 13, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) A non-string `series` gets past the pure check and throws a `TypeError` in `normaliseName`, which becomes `INTERNAL`. The 4.2 triage rejected runtime value types the same way: the shape is validated at the action boundary, which is 4.7's action. No caller exists yet, and a guard here adds surface.
  - `[low]` `[reject]` (blind) An author or series name over `limits.name` (200) fails late, as a Payload `ValidationError` keyed `name` rather than `authors` or `series`. A 200-character author name is unlikely in everyday use, and the fix would be a new guard or an error remap. Field limits stay with the collections, as in 4.2.
  - `[low]` `[reject]` (blind) Clearing `series` leaves `seriesIndex` in place. Edits are sparse and the server never diffs or infers (AD-5), so the edit screen sends both fields when the user clears both. A server-side auto-clear would break that rule.
  - `[false]` `[reject]` (blind) The story is marked done before review, and the spec is untracked. Refuted: the spec, sprint-status and code land in one story commit at finalize, with the spec's status set to done in that commit.
  - `[low]` `[patch]` (blind) `expect(sharedN?.id).not.toBe(privateN.id)` passes when `sharedN` is undefined. Patched: the test now asserts that `sharedN` and `series` are defined before comparing.
  - `[low]` `[patch]` (blind) The `authors` branch widens the value to `unknown` and then casts it. Patched: a type-guard predicate replaces the cast.
  - `[low]` `[patch]` (blind) The rewrapped doc comment breaks a sentence mid-line. Patched: the paragraph is reflowed.
  - `[low]` `[patch]` (blind) The non-holder rejection sends no `series`, so rollback of a series is checked only on the private-Book path (transaction rule). Patched: C's edit now carries `series: ghostSeries`.
  - `[low]` `[reject]` (edge) A non-string `series` throws `INTERNAL`. Same root cause and reason as the first row.
  - `[low]` `[reject]` (edge) An over-long name fails under `name`. Same root cause and reason as the second row.
  - `[low]` `[patch]` (verification-gap) Author-id dedupe is untested on the admin path, the one path where nothing downstream dedupes (`books_rels` has no unique index). Patched: the admin edit sends `[S upper-cased, N, S]`, and the existing assertion pins `[S, N]`.
  - `[low]` `[reject]` (verification-gap) Clearing with `authors: []` or a blank `series` is not exercised. The ask is test-only and is not tied to an acceptance criterion or a spine rule (tests convention). Both go through the same branches the tested `series: null` uses.
  - `[false]` `[reject]` (intent) There is no UI surface, so the user value (R2) is not reached. Refuted: every acceptance criterion is at `editBook()`, and the screen is Story 4.7.
  - `[false]` `[reject]` (intent) The admin's fix relinks the Book rather than renaming the shared record. Refuted: the criteria say names are "matched and created". Renaming an author or series is back-office work (CLAUDE.md).
  - `[low]` `[reject]` (intent) No test shows a non-admin's name matching their own private record. That matching is `findOrCreateByName()`'s, already covered in `findOrCreateByName.int.spec.ts`. `editBook` only picks the scope, and the user test proves it with a private create.
  - `[low]` `[reject]` (intent) A blank `series` is untested. Same root cause and reason as the clearing row above.

## Design Notes

Names resolve inside the transaction after the gate, so a rejected edit (not held, private Book) rolls back and leaves no new author or series. An unlinked author is left in place: orphan clean-up exists only for the private-Book merge (4.19), and an override change does not call for it.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npx eslint src tests` -- expected: no errors (incl. `bookeh/system-privileges`)
- `npm run test:int -- tests/int/editBook.int.spec.ts`, then `npm run test:int` -- expected: all pass

## Auto Run Result

Status: done

**Summary:** `editBook()` now takes `authors: string[]` and `series: string | null` as names. Before any read, an author name that is blank after trimming fails with `VALIDATION` naming `authors`; a blank series means cleared. Inside the transaction, after `requireOwnBook` and the shared-visibility check, each name resolves in order through `findOrCreateByName()`: the admin's in the `'shared'` scope, anyone else's in the `'private'` scope. Author ids are deduplicated in first-occurrence order. The admin's resolved ids are written to the shared Book with system privileges, and the admin's own override is dropped; anyone else's become their relationship overrides through `upsertUserBook()`. A rejected edit creates no author or series. No spine change: AD-5, AD-6 and the `BookEdits` seed already state this.

**Files changed:**
- `src/lib/catalogue/editBook.ts`: `authors` and `series` keys, the blank-name check, and name resolution by scope.
- `tests/int/editBook.int.spec.ts`: an admin case and a user case, each read by two viewers, plus rejection rows for a blank author, a non-holder and a private Book, with a check that rejected names create no rows.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.3 is done.

**Review findings:** 16 in total: high 0, medium 0, low 13, false 3.
- 5 patches, all `low`:
  - the admin test now pins id dedupe on the admin path;
  - a vacuous `?.` assertion now asserts the values exist;
  - C's rejected edit now also sends a series;
  - a type guard replaces a cast;
  - a doc paragraph is reflowed.
- 0 deferred.
- 8 rejected as `low`:
  - runtime type of a non-string `series`, twice: the shape is validated at the action boundary in 4.7, as in the 4.2 triage;
  - a name over 200 characters reports its error under `name`, twice: unlikely, and the fix needs a guard;
  - clearing `series` leaves `seriesIndex`: edits are sparse and the server never infers;
  - two test-only asks with no criterion or spine rule behind them: clearing via `[]` or a blank series (raised twice);
  - a non-admin matching their own private record: already covered by `findOrCreateByName`'s tests.
- 3 rejected as `false`:
  - spec untracked and status early: they land together at finalize;
  - no UI: that is Story 4.7;
  - relinking instead of renaming: the criteria say "matched and created", and renaming is back-office work.

**Follow-up review recommended:** false. Patched by verdict: high 0, medium 0, low 5.

**Verification:**
- `npm run typecheck`: clean.
- `npx eslint src tests`: 0 errors; the 40 warnings were already there, all in migration files.
- `npm run test:int`: 47 files, 440 tests passed, after the patches.
- All four matrix rows are covered by `editBook.int.spec.ts`, which ran.

**Residual risks:**
- A non-string `series` or an over-long name still fails as `INTERNAL` or under the `name` key. Story 4.7's action has to validate the shape and map the errors.
- An author or series that an edit unlinks stays as an orphan, private ones included.
