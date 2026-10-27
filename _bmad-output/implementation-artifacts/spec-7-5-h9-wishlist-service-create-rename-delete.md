---
title: '7.5 [H9] Wishlist service: create, rename, delete'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_revision: '3e66ee5845fd82f77e8d165132f2799f8037ba30'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `wishlists` has no owning service: nothing resolves a wishlist `Ref` for the coming save-to-a-wishlist (7.6), creates a list from the "New list" dialog (7.10), or renames and deletes a list with its entries (7.11). The spine (AD-18) puts all of that in `lib/wishlists`, which does not exist yet.

**Approach:** Create `src/lib/wishlists/wishlists.ts` mirroring `lib/people`: `resolveWishlist(ctx, ref)`, `createWishlist(ctx, name)`, `renameWishlist(ctx, id, name)`, `deleteWishlist(ctx, id)`. Names match by `nameKey` among the viewer's own lists; delete removes every entry of the list, open and closed, then the list, in one transaction.

## Boundaries & Constraints

**Always:**
- Same shape and rules as `src/lib/people/people.ts` (`resolvePerson`, `createPerson`, `renamePerson`, `deletePerson`): names through `normaliseName`, blank fails `VALIDATION` and longer than `limits.name` fails `VALIDATION` with the field marked `TOO_LONG`, both before any read; keys through `toNameKey`; every read filters `owner = tx.user.id` explicitly (the admin held to their own lists, FR-48); ownership checked with `gateway.count`, never `findByID`; ids checked with `isRowId`.
- `resolveWishlist`: an id that is not a row id or not the viewer's list fails `VALIDATION` with `fields: { wishlist: 'VALIDATION' }`; a `{ create }` name (errors on `wishlist`) matches the viewer's list by `nameKey` or creates it. Runs on the caller's context, opens no transaction; a list created here stays after Undo.
- `createWishlist`: name errors on `name`; a `nameKey` in use fails `NAME_TAKEN` with `conflictId`; creates in the caller's transaction or its own (`withTransaction`); returns the new id.
- `renameWishlist`: bad or foreign id fails `NOT_FOUND`; name errors on `name`; another of the viewer's lists with the same `nameKey` fails `NAME_TAKEN` with `conflictId`; a case-only rename succeeds (own id excluded from the check). All before any write.
- `deleteWishlist`: bad or foreign id fails `NOT_FOUND` before any write; then every entry of the list (`wishlist = id`, `owner = tx.user.id`, open and closed) is deleted through the gateway one after the other (AD-16, no `Promise.all`), then the list, all in one `withTransaction`.
- Doc comments in the `people.ts` style (Spine, AD-18, FR-38/FR-39; no Undo where none; the unique-index race surfaces as `ValidationError`, unchanged).
- Spine: the source-tree line `wishlists/` (`ARCHITECTURE-SPINE.md:600`) gains `# resolveWishlist, createWishlist, rename, delete` in this commit.

**Never:**
- No migration, no collection or FK change, no listing/count function (`/wishlists` counts are 7.10's), no entry writes other than delete-with-list (7.6–7.9), no actions or screens, no Undo.
- `lib/wishlists` imports no other service in this story (the lint allowance for `copies` and `people` is for 7.8/7.9).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Resolve own id | A's list L | returns L.id | — |
| Resolve foreign / bad id | B's list id; `0`; `2**31` | nothing written | `VALIDATION`, `fields.wishlist` |
| Resolve name match | A has "Joulu"; ref `{ create: '  joulu ' }` | returns that list's id; no new row | — |
| Resolve new name | `{ create: 'Me' }`; B has a list "Me" | a new list "Me" for A | — |
| Resolve blank / too long | `{ create: '   ' }`; 101+ chars | nothing written | `VALIDATION` on `wishlist` (`TOO_LONG` when long) |
| Create | "Christmas" new; then "christmas" | first returns id; second fails, one row | `NAME_TAKEN`, `conflictId` = first id |
| Rename onto taken | A's "Me" → "JOULU" while "Joulu" exists | name unchanged | `NAME_TAKEN`, `conflictId` = Joulu's id |
| Rename case only | "Joulu" → "JOULU" | name "JOULU", same id | — |
| Rename foreign / bad id | B's list; `-1` | nothing written | `NOT_FOUND` |
| Delete | L with an open and a closed entry; A's other list M with an entry; B's list | L and both its entries gone; M, its entry and B's rows unchanged | — |
| Delete foreign / bad id | B's list (as A and as admin) | B's list and entries unchanged | `NOT_FOUND` |
| Delete atomic | an entry delete or the list delete fails mid-way | list and all entries still there | rolled back |

</intent-contract>

## Code Map

- `src/lib/people/people.ts` -- the golden pattern: `normalisedName(name, field)` (`:25-32`), `takenBy(tx, key, exceptId?)` (`:35-50`), `ownsPeople` / `assertOwnPeople` (`:58-70`), `resolvePerson` (`:84-104`), `createPerson` (`:116-133`), `renamePerson` (`:148-164`), `entriesOf` loop and `deletePerson` (`:217-262`). Copy the structure; do not import it (people imports nothing, and wishlists must not depend on a private helper).
- `src/lib/copies/locations.ts:126-180` -- `assertOwnLocations`, `deleteLocation`: same transaction-and-repoint shape.
- `src/collections/Wishlists.ts` -- `name` (`maxLength: limits.name`), `nameKeyField()` hook sets `nameKey`; create data needs `owner` and `nameKey: ''` to satisfy the type (hooks set both). Read-only.
- `src/collections/WishlistEntries.ts` -- `wishlist` required `ownedRelation`, `closedAt`. Read-only. FK `wishlist_entries.wishlist_id` is NOT NULL with `ON DELETE set null` (migration `20261027_125540`), so an entry committed concurrently after the entry read makes the list delete fail as `INTERNAL` and roll back; note it in the doc comment as `mergePerson` does for loans.
- `src/lib/payload/ref.ts` -- `Ref`, `isRowId`. `src/lib/payload/gateway.ts`, `src/lib/payload/transaction.ts` (`withTransaction`), `src/lib/errors.ts` (`DomainError`, codes `VALIDATION`, `NAME_TAKEN`, `NOT_FOUND`, `TOO_LONG`), `src/fields/nameKey.ts` (`toNameKey`), `src/fields/sortName.ts` (`normaliseName`), `src/fields/limits.ts`.
- `eslint.config.mjs:24` -- `wishlists: ['copies', 'people', 'payload', 'undo']` already allowed; no change.
- `tests/int/peopleService.int.spec.ts:1-140` -- harness pattern: `getPayload({ config })`, `createUser`, `contextFor`, a shared Book created with `overrideAccess`, `failure(promise)`, row helpers through `gateway.create` (wishlists need `nameKey: 'ignored'`), reads back through `payload.find`/`findByID`. Rollback test pattern: `peopleService.int.spec.ts` merge rollback (`withTransaction` wrapping the call then throwing).
- `tests/int/wishlists.int.spec.ts`, `tests/int/wishlistEntries.int.spec.ts` -- collection access tests; do not duplicate.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:600` -- `wishlists/` line in the source tree.

## Tasks & Acceptance

**Execution:**
- `src/lib/wishlists/wishlists.ts` -- new: `resolveWishlist`, `createWishlist`, `renameWishlist`, `deleteWishlist` with private `normalisedName`, `takenBy`, `ownsWishlist`/`assertOwnWishlist` helpers.
- `tests/int/wishlistsService.int.spec.ts` -- new: one test per matrix group (resolve id/foreign/bad; resolve name match/new/other user's same name; resolve blank/too long; create + `NAME_TAKEN`; rename taken / case-only / foreign and bad id; delete with entries open and closed, others untouched; delete foreign as user and as admin; delete rolled back with the caller's transaction leaves list and entries).
- `ARCHITECTURE-SPINE.md` -- source-tree `wishlists/` line.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-5-h9-wishlist-service-create-rename-delete: done` when done.

**Acceptance Criteria:**
- Given `lib/wishlists`, when a wishlist `Ref` is resolved, then an id is checked against the viewer's own lists and a name matches by `nameKey` or creates the list.
- Given another of the viewer's lists has the `nameKey`, when a list is renamed onto it, then it fails with `NAME_TAKEN` and that list's id as `conflictId`; a case-only rename succeeds.
- Given a list with open and closed entries, when it is deleted, then its entries and the list are gone in one transaction and nothing else changes.
- Given the matrix rows, then integration tests cover each.

## Spec Change Log

## Review Triage Log

### 2026-10-27 — Review pass
- verdicts: 9 findings — high 0, medium 0, low 3, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Verification gap: delete atomicity is only shown through the caller's transaction, never by a failure inside `deleteWishlist`'s own `withTransaction` — the wrapper is there and is the project's shared pattern (`deletePerson`, `deleteLocation`); forcing a mid-way failure needs a fault-injection hook or a concurrent writer, more than a direct correction, and the same limit was accepted for `mergePerson` (7.4).
  - `[low]` `[patch]` Verification gap: `renameWishlist` name normalisation and validation untested — the case-only rename test now also sends a blank and a `limits.name + 1` name (`VALIDATION` / `TOO_LONG` on `name`) and a padded `' JOULU '` stored as `'JOULU'` (spine, Text input).
  - `[low]` `[reject]` Blind: the "Delete atomic" matrix row is not tested by a failure inside the function — same root cause and reason as the first verification-gap row.
  - `[false]` `[reject]` Blind: deleting a list leaves private Books and `user-books` rows nothing reaches — the project keeps Books on purpose when their last holding goes: `removeCopies` says "The Book stays, even with no copy left" (`src/lib/copies/removeCopies.ts:19-20`); only Undo of a save removes unreferenced rows (spine AD-20), and list delete has no Undo.
  - `[false]` `[reject]` Blind: no hand-off to 7.6/7.7 for an Undo whose entry was deleted with its list — no undoable entry write exists in this diff or the codebase; 7.6's restore is specified by its own AC ("its restore deletes the entry ... an integration test undoes it"), where an already-gone entry is that story's case.
  - `[false]` `[reject]` Blind: sprint-status says done while the spec is in review — the workflow sets done at finalization and commits both together; nothing ships between.
  - `[false]` `[reject]` Blind: `normalisedName`/`takenBy` copied from `lib/people` — the spec's Code Map chooses the copy so services stay independent; locations already keep their own (`src/lib/copies/locations.ts`); no caller diverges today, and a shared helper is an abstraction "for later" (CLAUDE.md).
  - `[false]` `[reject]` Blind: a lost create/rename race surfaces as a raw `ValidationError` with no translation — `runAction` already maps `ValidationError` to `VALIDATION` with field paths (`src/lib/errors.ts:74-79`); same documented behaviour as `lib/people` and locations; single user in Phase 1.
  - `[false]` `[reject]` Intent: no commit, and sprint-status done vs spec in-review — the commit and status flip happen at finalization of this run; the other divergences it lists (no UI, `createWishlist` beyond the ACs) are its descriptive notes, matched by the spec's Never list and Design Notes.

## Design Notes

**Why `createWishlist` here.** The story title says create, and 7.10's "New list" dialog rejects a name in use under the field, which a `Ref` cannot do (it matches instead). Spine line 256 gives exactly this split for Settings lists; the same applies to the New list dialog.

**Ref error field `wishlist`.** `SaveInput.save.wishlist` is the field the picker sends, so 7.6's action maps the error onto it unchanged, as `resolvePerson` uses `person`.

## Verification

**Commands:**
- `npx tsc --noEmit --incremental false` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `wishlistsService.int.spec.ts`.

## Auto Run Result

**Summary.** `lib/wishlists` now owns wishlists (AD-18): `resolveWishlist` checks an id against the viewer's own lists or matches a name by `nameKey` and creates it otherwise (errors on `wishlist`, no transaction of its own); `createWishlist` ("New list") and `renameWishlist` fail `NAME_TAKEN` with `conflictId`, a case-only rename succeeds; `deleteWishlist` deletes every entry of the list, open and closed, then the list, in one transaction. Foreign and bad ids write nothing, for the admin too.

**Files changed.**
- `src/lib/wishlists/wishlists.ts` -- new service: `resolveWishlist`, `createWishlist`, `renameWishlist`, `deleteWishlist`.
- `tests/int/wishlistsService.int.spec.ts` -- new: 7 integration tests covering every matrix row.
- `ARCHITECTURE-SPINE.md` -- source-tree `wishlists/` line.
- `sprint-status.yaml` -- 7.5 done.

**Review.** One pass, 9 findings (low 3, false 6). Patched 1 entry (low): rename blank / too-long / padded-name assertions. Deferred none. Rejected: delete atomicity through a failure inside the function's own transaction (two rows; needs fault injection, same limit accepted in 7.4), and the false rows (orphaned private Books, Undo hand-off, early sprint status, copied helpers, race `ValidationError`, intent process notes), each with its reason in the triage log.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 1.

**Verification.** After implementation and again after the review patch: `tsc --noEmit --incremental false` clean; lint 0 errors (56 pre-existing warnings); `test:reset && test:int` 622 passed (74 files). Matrix audit: all 12 rows covered by passing tests (too-long uses `limits.name + 1`, 200 being the limit, not the matrix's "101+").

**Residual risks.**
- A wishlist or entry committed concurrently with a create, rename or delete surfaces as the unique index's `ValidationError` or as `INTERNAL` (NOT NULL `wishlist_id` with `ON DELETE set null`), rolled back; single user in Phase 1.
- No caller yet: 7.6 (Ref in a save), 7.10 (New list) and 7.11 (rename, delete) wire the functions in.

