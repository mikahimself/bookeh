---
title: 'Story 4.4: [D20] Edit my private Book'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: '1d0e834c54b698e56714812f547fe00ed56d9dbb'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      A private Book given the ISBN of an existing shared Book stays a separate private Book, and a scan of that ISBN answers with the shared Book as not in the library.
    evidence: |-
      lookupBook() answers a shared Book before the viewer's own private Book with the same ISBN (AD-9), and the viewer holds nothing on the shared one. 4.4 now lets editBook() add such an ISBN, but the same state was already reachable: createPrivateBook() with an ISBN when no shared Book existed yet, followed by a shared Book for that ISBN. AD-5 rules out an auto-share or merge from editBook(), so the follow-up belongs to lookupAgain() or the Answer's handling of a held private Book.
    location: >-
      src/lib/catalogue/lookupBook.ts:79
    severity: low
---

<intent-contract>

## Intent

**Problem:** `editBook()` (4.2) refuses every edit to a private Book, so a hand-entered Book can never be corrected, given an ISBN or given genres (FR-14, AD-5).

**Approach:** On a private Book its creator holds, `editBook()` writes the edits to the Book itself with system privileges: the 4.2 scalar keys, `genres` (system genre ids, for any creator) and a new `isbn13` key. The ISBN is normalised, and a clash with another of the creator's private Books fails as a field error on `isbn13`.

## Boundaries & Constraints

**Always:** Same sparse rules as 4.2 (only keys whose value is not `undefined`, `null` clears, text trimmed and NFC-normalised with `''` stored as `null`, `genres` deduplicated, a cleared `title` or an unknown key fails with `VALIDATION` naming it before any read). `isbn13` goes through `toIsbn13()`: anything that does not convert, blank and `null` included, fails before any read with `VALIDATION` and `fields: { isbn13: 'INVALID_ISBN' }`. Inside the transaction: `requireOwnBook()`, then the Book's `visibility` and `createdBy` as the viewer reads them. A private Book whose `createdBy` is not `ctx.user.id` fails with `NOT_FOUND`; this covers the admin, who can read and hold another user's private Book. On a shared Book, `isbn13` fails with `VALIDATION` naming it, and `genres` from a non-admin still fails the same way; all other shared-Book behaviour stays exactly as in 4.2. A private Book's write is one system `update` and touches no `user-books` row. The private-scope unique index (AD-19) is the only clash check: its `ValidationError`, when `isbn13` was submitted, is rethrown as `DomainError('VALIDATION', { fields: { isbn13: 'VALIDATION' } })`, and the transaction rolls back. Any other error passes through unchanged.

**Never:** No `authors`/`series` keys (4.3), no `copy`/`tags`, no action, page or UI (4.7), no Undo. An ISBN is never removed (spine `BookEdits.isbn13: string`). Editing in an ISBN starts no auto-share or merge: the spine allows those only in the save transaction and `lookupAgain()` (AD-5). No pre-read query for the clash. No spine edit: AD-5 and the `BookEdits` seed already state this, and the code type now gains `isbn13`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Creator edits | A holds own private P; `{ title: ' P2 ', publisher: null, genres: [g, g], isbn13: <hyphenated ISBN-10> }` | P itself has the new title, no publisher, genre g and the ISBN-13; A's view has `overridden: []` | No error expected |
| Clash | A also has private P1 with ISBN i; edits P with `isbn13: i` | P unchanged | `VALIDATION`, `fields: { isbn13: 'VALIDATION' }` |
| Invalid ISBN | `isbn13: 'abc'` or `''` | nothing written | `VALIDATION`, `fields: { isbn13: 'INVALID_ISBN' }` |
| Not the creator | the admin holds a copy of A's private P; any edit | P unchanged | `NOT_FOUND` |
| Shared ISBN | admin edits shared X with `isbn13` | X unchanged | `VALIDATION` naming `isbn13` |

</intent-contract>

## Code Map

- `src/lib/catalogue/editBook.ts` -- the 4.2 service to extend. `BookEdits` lacks `isbn13`. The pre-read loop rejects `genres` for non-admins, which must move after the visibility read. The private branch is `if (book.visibility !== 'shared') throw invalid(keys)`. Reuse its admin write (`assertLive`, `update` with `system(tx)`).
- `src/fields/isbn.ts` -- `toIsbn13(text)` returns `null` when invalid; use it rather than `normaliseIsbn()`, which throws a field-less `INVALID_ISBN`.
- `src/collections/catalogueIndexes.ts` -- `books_created_by_isbn13_private_idx` on `(createdBy, isbn13)` where private. Payload's `handleUpsertError` (`@payloadcms/drizzle`) makes it a `ValidationError` whose `path` is taken from the constraint detail, not `isbn13`; hence the remap.
- `src/lib/books/requireOwnBook.ts` -- passes on a copy alone; the admin can hold another user's private Book, hence the `createdBy` check.
- `tests/int/editBook.int.spec.ts` -- the 4.2 cases; its third case asserts private Books are rejected (A's P, the admin's Q), which this story reverses. Its helpers are reusable. `tests/int/createPrivateBook.int.spec.ts:39` has `hyphenatedIsbn10()` to copy.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/editBook.ts` -- add `isbn13?: string` to `BookEdits` and `EDIT_KEYS`. Normalise it pre-read. Read `createdBy` with `visibility`. Branch: private and own → one system update of `changes`; private and not own → `NOT_FOUND`; shared → reject `isbn13`, and `genres` for non-admins, then the 4.2 paths unchanged. Remap the clash error. Update the doc comment (AD-5, FR-14, AD-19). -- the story's service.
- `tests/int/editBook.int.spec.ts` -- replace the private-Book rows of the rejection case with a private-Book `describe`: the creator edit (matrix row 1, read back through `seen`), then one case for the clash, invalid ISBN and not-the-creator rows, each leaving P unchanged. Add the shared `isbn13` rejection to the existing rejection case. -- AC proof; the not-the-creator row guards the access rule.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `4-4-d20-edit-my-private-book: done` when finished.

**Acceptance Criteria:**
- Given my own private Book, when I submit `BookEdits`, then the Book itself changes and no `user-books` override is written.
- Given a private Book I hold but did not create, or another user's private Book, when I call `editBook`, then it fails with `NOT_FOUND` and writes nothing.
- Given any `editBook` call on a private Book, when it resolves, then it returns no undo token.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 26 findings — high 0, medium 0, low 19, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification-gap) No test shows that `isbn13: null` is refused, so a later change could let it clear the ISBN against the spine's `isbn13: string`. Patched: the private rejection case sends `untyped({ isbn13: null })` and expects `INVALID_ISBN`; `untyped` moved to `describe` scope.
  - `[low]` `[reject]` (verification-gap) No test shows a non-clash `ValidationError` on the private write passing through unchanged. Test-only, and no acceptance criterion or spine rule names it (tests convention). The clash test already fails if the remap stops matching.
  - `[low]` `[patch]` (blind) `hyphenatedIsbn10()` was copied into a third test file. Patched: it now lives in `tests/helpers/isbn.ts`, and `editBook`, `createPrivateBook` and `lookupBook` int specs import it.
  - `[low]` `[reject]` (blind) The spine's ISBN row says services "fail with `INVALID_ISBN`", while `editBook` reports it as the `isbn13` field's code under `VALIDATION`. That code is still `INVALID_ISBN` (same message key), and the Errors row's field errors are how Edit book shows a rejected field. The intent contract fixed this shape and rules out a spine edit. Raised in the run result so Mika can decide on a spine line.
  - `[low]` `[reject]` (blind) On a shared Book a malformed ISBN gets `INVALID_ISBN` before the read, while a valid one gets `VALIDATION` after it. Edit book never shows the ISBN on a shared Book, so only a hand-made request meets this, and the fix adds a branch.
  - `[low]` `[reject]` (blind) The private write repeats the admin's system `update`. Both are one call with `system(tx)`, the same pattern as `sharePrivateBook`; a helper would add surface for two call sites.
  - `[low]` `[reject]` (blind) A genre id deleted after the screen loaded fails the `books_rels` foreign key and becomes `INTERNAL`. That needs the admin to delete a genre while a user is editing, and the fix is an existence check or a second remap.
  - `[low]` `[reject]` (blind) The clash error has no distinct code or `conflictId`. The criterion asks only for a field error. A pointer to the other Book is a 4.7 screen decision, and adding one now would add surface.
  - `[low]` `[defer]` (blind) Adding a shared Book's ISBN to a private Book leaves a private duplicate that a scan answers as not in the library. The state predates 4.4 (createPrivateBook with an ISBN), and AD-5 rules out a share from editBook. Deferred.
  - `[false]` `[reject]` (blind) A non-creator who holds a private Book cannot edit it. Refuted: the story's criterion requires `NOT_FOUND` for another user's private Book, and the admin does not edit users' private data (FR-48).
  - `[low]` `[reject]` (blind) The clash check depends on Payload deriving the path from the constraint detail. The doc comment on `isIsbnClash` says so, and the clash test fails if a Payload upgrade changes it. `fieldConstraints` is not exposed on the error.
  - `[false]` `[reject]` (blind) Sprint status says done while the spec says in review. Refuted: both land in the one story commit, with the spec set to done.
  - `[low]` `[patch]` (blind) The clash row's `p1.isbn13 ?? ''` would turn a missing ISBN into an `INVALID_ISBN` failure. Patched: `p1.isbn13!`, as `lookupBook.int.spec.ts` does.
  - `[low]` `[reject]` (edge) A concurrent promotion between the visibility read and the update could write the creator's values onto a now-shared Book. Both writes are the same user's, and the fix needs row locking; 4.2 rejected the same race.
  - `[low]` `[reject]` (edge) A non-array `genres` throws a `TypeError` (`INTERNAL`), and a string spreads into characters. The value shape is validated at the action boundary (4.7), as in 4.2's triage.
  - `[low]` `[patch]` (edge) A `__proto__` key slipped past the unknown-key check, because assigning to `rejected['__proto__']` is ignored. Patched: `rejected` is a `Map`, turned into `fields` with `Object.fromEntries`.
  - `[low]` `[reject]` (edge) A creator whose shared Book the admin made private may keep stale overrides that hide the edit. That needs a back-office visibility flip of a Book the admin had overridden, and the fix adds a write path.
  - `[low]` `[reject]` (edge) A non-admin's `genres` together with a cleared title names only `title`; `genres` shows on the resubmit. Two-stage checks name each stage's keys, and merging them adds a branch.
  - `[false]` `[reject]` (edge) A non-holder's `genres` now gets `NOT_FOUND`, not `VALIDATION`. Refuted as a defect: the spec moved that check after the read on purpose, and `NOT_FOUND` is the gate's own answer.
  - `[low]` `[reject]` (edge) The admin's empty edit on A's private Book resolves rather than failing `NOT_FOUND`. It writes nothing and reveals nothing, since the gate has passed (the admin holds a copy). Failing it would also block a copy-only edit once 4.9 adds `copy`.
  - `[low]` `[reject]` (edge) The spec's "all other shared-Book behaviour stays exactly as in 4.2" is loose about the moved `genres` check. The fix would edit this build's spec.
  - `[false]` `[reject]` (intent) No screen or action reaches `editBook`. Refuted: the criteria are at the service, and the screen is Story 4.7.
  - `[false]` `[reject]` (intent) Nothing is committed. Refuted: finalize commits the story.
  - `[false]` `[reject]` (intent) `NOT_FOUND` for another user's private Book is tested only through the admin. Refuted: a non-admin cannot hold another user's private Book (catalogue read access), so they fail at `requireOwnBook`, which 4.2's non-holder case covers.
  - `[low]` `[reject]` (intent) A missing genre id is not exercised. This has the same root cause and reason as the deleted-genre row above.
  - `[false]` `[reject]` (intent) The moved `genres` refusal changes a non-holder's answer. Same refutation as the edge row above.

## Design Notes

Remapping the index error keeps the database the only clash check (AD-19), with no race between a pre-check and the write. Map it only when `isbn13` was submitted, so a too-long title keeps its own path.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npx eslint src tests` -- expected: no errors (incl. `bookeh/system-privileges`)
- `npm run test:int -- tests/int/editBook.int.spec.ts` then `npm run test:int` -- expected: all pass

## Auto Run Result

Status: done

**Summary:** `editBook()` now edits a private Book's creator's Book itself: the 4.2 scalar keys, system genres (picked by any creator) and a new `isbn13` key, in one system `update` with no `user-books` row and no Undo. Before any read, `isbn13` goes through `toIsbn13()`; anything else, blank and `null` included, fails with `VALIDATION` and `fields: { isbn13: 'INVALID_ISBN' }`. Inside the transaction, after `requireOwnBook()`, the Book's `visibility` and `createdBy` are read as the viewer. A private Book the viewer did not create (the admin holding one) fails with `NOT_FOUND`. A clash on the private-scope ISBN index (AD-19) is rethrown as `VALIDATION` on `isbn13`, matched by the error's path so a too-long title keeps its own. On a shared Book, `isbn13`, and `genres` from a non-admin, are refused after the read; otherwise 4.2 is unchanged. The spine is unchanged.

**Files changed:**
- `src/lib/catalogue/editBook.ts`: private-Book path, `isbn13` key, clash remap, doc comment.
- `tests/int/editBook.int.spec.ts`: private-Book `describe` (creator edit; clash, invalid, `null` and non-creator), shared `isbn13` refusal.
- `tests/helpers/isbn.ts`: `hyphenatedIsbn10()`, now shared; `tests/int/createPrivateBook.int.spec.ts` and `tests/int/lookupBook.int.spec.ts` import it instead of their copies.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.4 is done.

**Review findings:** 26 in total: 19 `low`, 7 `false`.
- 4 patches, all `low`: the `isbn13: null` test, the shared `hyphenatedIsbn10()` helper, `p1.isbn13!` in the clash row, and `rejected` as a `Map` (a `__proto__` key slipped past the unknown-key check).
- 1 deferred: a private Book given a shared Book's ISBN is answered as not in the library by a scan (predates 4.4).
- 14 rejected as `low`, each with its reason in the triage log:
  - the spine ISBN row's wording against the field-level `INVALID_ISBN`;
  - a malformed ISBN on a shared Book;
  - the repeated system `update`;
  - a deleted genre id becoming `INTERNAL` (raised twice);
  - no `conflictId` on the clash;
  - the clash check depending on Payload's error path;
  - an untested non-clash pass-through;
  - the visibility race;
  - non-array `genres`;
  - stale overrides after a back-office flip;
  - two-stage error naming;
  - the admin's empty edit;
  - the spec's "exactly as in 4.2" wording.
- 7 rejected as `false`:
  - a non-creator unable to edit (the criterion requires it);
  - sprint status before the commit (raised twice);
  - no screen yet (Story 4.7);
  - the `NOT_FOUND` test only via the admin (a non-admin cannot hold the Book);
  - the moved `genres` check (raised twice).

**Follow-up review recommended:** false. Patched by verdict: high 0, medium 0, low 4.

**Verification:**
- `npm run typecheck`: clean.
- `npx eslint src tests`: 0 errors; the 40 warnings are older migration files.
- `npm run test:int`: 47 files, 440 tests passed, before and after the patches. `editBook.int.spec.ts` covers every matrix row.
- The implementer turned the remap off once and saw the clash test fail on Payload's raw `ValidationError` (path `created_by_id, isbn13`).

**Residual risks:**
- The clash remap relies on Payload's `handleUpsertError` putting `isbn13` in the error path; the clash test catches a change on upgrade.
- `editBook` checks key names, not value types; 4.7's action has to validate the shape.
- The spine's ISBN row says services fail with `INVALID_ISBN`; `editBook` reports it as a field code under `VALIDATION`. A one-line spine note would settle it.

**Rebased onto 4.3 (87e7c8a):** 4.3 added `authors` and `series` to `editBook`, resolved in the `'shared'` scope for the admin. After the merge, names on a private Book always resolve in the `'private'` scope, the admin's own private Book included (AD-5). Two cases were added: the creator's new author is private, and the admin's names on the admin's own private Book are private. The clash case now also shows that names resolved before the failed write are rolled back. Checks after the rebase: typecheck clean, eslint 0 errors, int 443/443, unit 690/690.
