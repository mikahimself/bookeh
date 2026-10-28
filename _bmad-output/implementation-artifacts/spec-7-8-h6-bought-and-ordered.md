---
title: '7.8 [H6] Bought and ordered'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '5a9409068fc18edc91660f2fc2512ff7b146c98a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** An open entry can only be closed by Add to library (7.7). Bought and Ordered on an entry (FR-28, AD-18) have no service, so the entry sheet of 7.12/7.13 has nothing to call, and a gift bought for someone must never land on the user's own shelf.

**Approach:** `closeEntry(ctx, entryId, 'bought' | 'ordered')` in `src/lib/wishlists/entries.ts`: one transaction that sets the entry's `closedAt` and, only for an entry with no recipient, creates an owned copy at the default location (bought) or an ordered copy (ordered) through `createCopy()`. It returns `Undone<…>` whose restore deletes the created copy and reopens the entry.

## Boundaries & Constraints

**Always:**
- Signature: `closeEntry(ctx: Context, entryId: number, as: 'bought' | 'ordered'): Promise<Undone<ClosedEntry>>` with exported `type ClosedEntry = { copyId: number | null; savedTo: LocationOption | null }`. `copyId` is the created copy, `null` for a Person's entry. `savedTo` is where a bought own copy landed (the default location, `null` without one), `null` for ordered and for a Person's entry. This is what 7.13's toasts need ("Saved to {location}", "Ordered", "Bought").
- `!isRowId(entryId)` → `DomainError('NOT_FOUND')` before any read (as `receiveCopy`).
- In one `withTransaction(ctx, …)` joining the caller's: find the entry with `id = entryId`, `owner = tx.user.id` (explicit owner filter, so the admin is held to their own, FR-48) and `closedAt` empty; select `forPerson` and `book`. None found (gone, foreign, or already closed) → `NOT_FOUND`, no write. "Entry" means an open entry.
- Set `closedAt` to `new Date().toISOString()` through `gateway.updateByID`. Then, when `forPerson` is empty: `createCopy(tx, { bookId, status: 'owned' })` for bought (location undefined, so the default) or `createCopy(tx, { bookId, status: 'ordered' })` for ordered. For bought, read the landed location's name back as `saveOwnedCopy` / `receiveCopy` do.
- Restore (AD-20), closes over ids only: the copy's restore first (it refuses with `UNDO_FAILED` once the copy has any loan, and `undo()` rolls the whole restore back so the entry stays closed), then reopen the entry: `closedAt: null` if it still exists (count or find first; a gone entry is skipped). A Person's entry's restore only reopens.
- It does not close other entries for the same Book, and does not touch `user-books`. Records nothing: callers wrap it in `withUndo()`.
- Doc comment in the file's style, naming AD-18, AD-20 and FR-28.
- Spine in this commit: source-tree `wishlists/` line gains `closeEntry`.

**Never:**
- No action, screen, toast, i18n string, migration or collection field change (7.13 builds the screen and action).
- No `setEntryRecipient` / `removeEntry` (7.9). No new import direction (`wishlists` → `copies` is allowed).
- No write to another user's entry; no `wishlist-entries` write outside `lib/wishlists`; no copy insert outside `createCopy()`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bought, own | A has default location L; open own entry E for Book X | E `closedAt` set; one owned copy of X at L; `{ copyId, savedTo: L }` | — |
| Ordered, own | open own entry E for X | E closed; one ordered copy, no location; `savedTo: null` | — |
| Bought, for Person | open entry E for Person P | E closed; no copy; `{ copyId: null, savedTo: null }` | — |
| Ordered, for Person | open entry E for P | E closed; no copy | — |
| Undo own | undo the Bought-own close (via `withUndo` + `undo`) | copy gone; E open | — |
| Undo Person | undo the Bought-for-Person close | E open; no copies changed | — |
| Undo, lent | Bought own, lend the copy, undo | copy and closed E stay | `UNDO_FAILED` |
| Undo, entry gone | Bought own, delete E, undo | copy gone; undo succeeds | — |
| Not open | E already closed; or B's entry; or id `0` / unknown | no write, no copy | `NOT_FOUND` |

</intent-contract>

## Code Map

- `src/lib/wishlists/entries.ts` -- add `closeEntry` and `ClosedEntry` here; reuse `reopenEntries(rtx, [id])` (find-first, skips gone rows) for the reopen. `createEntry` / `closeEntriesForBook` show the doc and transaction style.
- `src/lib/copies/createCopy.ts` -- `createCopy(ctx, { bookId, status })`; its restore `deleteCopy` throws `UNDO_FAILED` on any loan.
- `src/lib/copies/locations.ts:51,66` -- `CopyStatus`, `LocationOption`.
- `src/lib/copies/receiveCopy.ts` -- golden pattern: `isRowId` guard, owner-filtered find, location read-back (`findByID` depth 1, `populate: { locations: { name: true } }`).
- `src/lib/catalogue/saveCopy.ts:282-305` `saveOwnedCopy` -- same read-back and restore composition (copy first, then entries).
- `src/lib/payload/ref.ts` -- `isRowId`.
- `src/lib/undo/undo.ts:54,78` -- `withUndo`, `undo` (one transaction, rollback on throw).
- `tests/int/saveClosesEntries.int.spec.ts` -- harness to mirror: `freshUser`, `sharedBook`, `ownEntry` via `createEntry`, `entryForPerson` via gateway, `closedAtOf`, `copyIds`, lent undo with `lendCopy(ctx, copyId, { create: 'Liisa' })`.
- `tests/int/receiveCopy.int.spec.ts:40-58` -- `userWithDefault` (default location setup), `withUndo` + `undo` use.
- `ARCHITECTURE-SPINE.md:601` -- `wishlists/` source-tree line.

## Tasks & Acceptance

**Execution:**
- `src/lib/wishlists/entries.ts` -- add `closeEntry` and `ClosedEntry` with a doc comment.
- `tests/int/closeEntry.int.spec.ts` -- new: one test per matrix group: bought own (closed, owned copy at default, `savedTo`); ordered own (ordered copy, no location); for a Person, both kinds (no copy); undo own and undo Person; undo lent (`UNDO_FAILED`, unchanged); undo with entry gone; `NOT_FOUND` for a closed, a foreign and a non-row id with no copy written.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- `wishlists/` source-tree line gains `closeEntry`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-8-h6-bought-and-ordered: done` when done.

**Acceptance Criteria:**
- Given an open entry with no recipient, when `closeEntry(ctx, id, 'bought' | 'ordered')` runs, then `closedAt` is set and `createCopy` makes an owned copy at the default location (bought) or an ordered copy (ordered), in one transaction.
- Given an open entry for a Person, when `closeEntry` runs with either kind, then `closedAt` is set and no copy is created.
- Given either close, when its restore runs through `undo()`, then the created copy is deleted and the entry is open again; integration tests undo both cases.
- Given the existing `saveClosesEntries`, `saveEntry`, `wishlistEntries` and `receiveCopy` suites, when run, then they pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 11, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: two concurrent Bought calls on one entry can both find it open and create two copies — real under read committed, but needs a double tap landing inside one transaction's span; a conditional update through Payload is still find-then-update, so the fix is a row lock, extra complexity for a race the screen (7.13, closing back in history) makes unlikely. Same ground as 7.7's rejected save race.
  - `[low]` `[patch]` Blind: doc comment credits the write order for a failed copy leaving the entry open, but the transaction rollback does it — sentence reworded to credit `withTransaction()`'s rollback.
  - `[low]` `[reject]` Blind: the location read-back is now in three places (`saveOwnedCopy`, `receiveCopy`, `closeEntry`) — a helper means touching two other services for a five-line block; no caller is shown to diverge.
  - `[low]` `[reject]` Blind: Bought with no default location untested — the narrowing is the same as `saveOwnedCopy`'s and `createCopy()`'s no-default path is tested in its own suite; no acceptance criterion names the no-default case (CLAUDE.md, Tests).
  - `[low]` `[patch]` Blind: "reopens a Person entry" runs only `'bought'` — grouped with the next row: both undo tests now run over both kinds with `it.each`.
  - `[low]` `[patch]` Blind: undo of an own Ordered close untested, though AC3 says "either close" — undo tests run over `'bought'` and `'ordered'`.
  - `[low]` `[patch]` Blind: a Book the user can no longer read surfaces as a `ValidationError` on `book`, undocumented — one sentence added to the doc comment (the close rolls back with it).
  - `[false]` `[reject]` Blind: spec status disagrees with sprint-status — the run was mid-review; status is set at finalize.
  - `[low]` `[reject]` Blind: parameter name `as` is awkward; export a union type — `as` is legal, the signature is the spec's; renaming and a new exported type would edit the spec's contract for a naming taste.
  - `[low]` `[reject]` Edge: concurrent `closeEntry` creates two copies — same as the Blind race finding, rejected on the same grounds.
  - `[false]` `[reject]` Edge: a runtime `as` other than `'bought'`/`'ordered'` makes an ordered copy — no caller exists; the parameter is typed, and 7.13's action validates its input before calling (spine, actions convention).
  - `[false]` `[reject]` Edge: location may come back as a bare id, giving `savedTo: null` — `findByID` at depth 1 with `populate` as the copy's owner always populates the owner's own location; same read as `saveOwnedCopy` and `receiveCopy`.
  - `[low]` `[patch]` Verification gap: no test that the close and the copy are one transaction (AD-16) — added "leaves the entry open when the copy fails after the close": `createCopy` mocked to fail once; the call rejects, `closedAt` stays `null`, no copy.
  - `[low]` `[reject]` Verification gap: Bought own with no default location untested — same as the Blind no-default finding; no criterion names it.
  - `[false]` `[reject]` Intent: "undo both cases" read as bought vs ordered left uncovered — no longer true: the patched undo tests cover both kinds for both recipients.
  - `[false]` `[reject]` Intent: no-default location path not exercised — descriptive restatement of the rejected no-default finding; the AC's "at the default location" is tested.
  - `[false]` `[reject]` Intent: Person fixture written through the gateway, not a service — the recipient service is 7.9; a hand-made `forPerson` is the same row the service will write.

## Design Notes

**Only this entry.** Bought on an own entry creates a copy through `createCopy()`, not `saveCopy()`, so the user's other open own entries for the same Book stay open. The epic AC and AD-18 name `createCopy()` for `closeEntry()` and keep `closeEntriesForBook()` on `saveCopy()`; the entry sheet acts on one entry.

**Close before copy.** `closedAt` is written first so a `createCopy()` failure rolls back the close in the same transaction; the restore order (copy first) lets a lent copy's `UNDO_FAILED` abort before the reopen, though `undo()`'s rollback is what guarantees nothing changes.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `closeEntry.int.spec.ts`.

## Auto Run Result

**Summary.** Bought and Ordered now have their service (FR-28, AD-18). `closeEntry(ctx, entryId, 'bought' | 'ordered')` in `lib/wishlists` closes one of the user's open entries in one transaction. For the user's own entry it creates a copy through `createCopy()`: owned at the default location for Bought, ordered for Ordered. For an entry for a Person it creates no copy, so a gift never lands on the user's shelf. It returns `ClosedEntry` (`copyId`, `savedTo`) for 7.13's toasts. A gone, closed, foreign or non-row id fails with `NOT_FOUND` and writes nothing. Its restore deletes the copy and reopens the entry; a lent copy fails the Undo with `UNDO_FAILED` and nothing changes; a deleted entry is skipped.

**Files changed.**
- `src/lib/wishlists/entries.ts` -- `closeEntry` and `ClosedEntry`, with the restore.
- `tests/int/closeEntry.int.spec.ts` -- new: 12 tests (both kinds for own and Person entries, undo of each, lent undo, undo with the entry gone, rollback on a failed copy, `NOT_FOUND`).
- `ARCHITECTURE-SPINE.md` -- `wishlists/` source-tree line gains `closeEntry`.
- `sprint-status.yaml` -- 7.8 done.
- `epic-7-context.md` -- regenerated at the start of the run (the cache predated spine edits from 7.5–7.7).

**Review.** One pass, 17 findings (low 11, false 6). Patched 5 low rows in 3 entries:
- the doc comment now credits the transaction rollback, and says what happens for a Book the user can no longer read;
- the undo tests run for both Bought and Ordered;
- a rollback test for the one-transaction close.

Rejected, with reasons in the triage log: the concurrent double-tap race (rare; needs row locks), the triple location read-back (refactor across services), the untested no-default Bought (no criterion names it), renaming `as` (the spec's signature), and the false ones (status mid-run, untyped `as`, bare-id location, intent restatements). Nothing deferred.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 3.

**Verification.** After implementation and again after the patches:
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (56 existing warnings).
- Prettier on the touched files: clean.
- `npm run test:reset && npm run test:int`: 652 passed (77 files). The `UNDO_FAILED` lines in the output are the expected log from lent-copy tests.

Matrix audit: all 9 rows are covered by passing tests.

**Residual risks.**
- Two concurrent Bought calls on one entry can both create a copy; 7.13's screen should keep the button from firing twice.
- Bought on an own entry closes only that entry; the user's other open own entries for the same Book stay open (AD-18 keeps `closeEntriesForBook()` on `saveCopy()`).
- `epic-7-context.md` still lists `closeEntry` as still to come; it is a generated cache.
- Built in a cloud session and carried over to the local workspace by hand; the rollback test was rewritten in the carry-over and now also checks, inside the mocked `createCopy`, that the close was written before the copy failed.
