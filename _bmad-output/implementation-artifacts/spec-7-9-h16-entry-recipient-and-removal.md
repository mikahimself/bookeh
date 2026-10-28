---
title: '7.9 [H16] Entry recipient and removal'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '8361067d436d4f008dac2079f31ac873f6c097e3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** An entry's recipient can only be written by hand through the gateway, and nothing removes an entry. The opened entry sheet (7.12, 7.13) has a "For" combobox that saves at once and a confirmed Remove, with no service behind either (FR-38).

**Approach:** Two services in `src/lib/wishlists/entries.ts`: `setEntryRecipient(ctx, entryId, person: Ref | null)` sets, changes or clears `forPerson` on one of the user's open entries, resolving the `Ref` through `resolvePerson()`; `removeEntry(ctx, entryId)` deletes one of the user's open entries. Neither has Undo.

## Boundaries & Constraints

**Always:**
- Signatures: `setEntryRecipient(ctx: Context, entryId: number, person: Ref | null): Promise<number | null>` resolving to the recipient's Person id (`null` once cleared), so 7.12 knows the id of an inline-created Person; `removeEntry(ctx: Context, entryId: number): Promise<void>`.
- Both: `!isRowId(entryId)` → `DomainError('NOT_FOUND')` before any read. Then one `withTransaction(ctx, …)` joining the caller's: find the entry with `id = entryId`, `owner = tx.user.id` (explicit owner filter, FR-48) and `closedAt` empty, as `closeEntry` does. None found (gone, closed, or another user's, the admin's included) → `NOT_FOUND`, no write. "Entry" means an open entry (epic context).
- `setEntryRecipient`: the entry check comes before `resolvePerson()`, so a foreign or closed entry never creates a Person. `null` writes `forPerson: null`. A `Ref` goes through `resolvePerson(tx, person)` (`lib/people`, its errors unchanged: `VALIDATION` on `person` for a foreign/bad id or a blank/too-long name); an inline name matching an existing Person by `nameKey` reuses it. Then `gateway.updateByID` with `forPerson`. Setting the same recipient again is a harmless rewrite. Nothing else on the entry changes.
- `removeEntry`: `gateway.deleteByID` of the row. `user-books` and the list are left alone.
- Records nothing and returns no restore: no Undo (UX: Remove is confirmed by a dialog; the For combobox saves at once).
- Doc comments in the file's style, naming AD-18 and FR-38.
- Spine in this commit: the `wishlists/` source-tree line gains `setEntryRecipient, removeEntry`; the `lib/wishlists` writer paragraph (line ~251) gains one sentence on both.

**Never:**
- No action, screen, i18n string, migration or collection change (7.12/7.13 build those).
- No new import direction (`wishlists` → `people` is allowed). No `wishlist-entries` write outside `lib/wishlists`; no Person insert outside `lib/people`.
- No change to closed entries, and no write to another user's entry.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Set by id | own open entry E, no recipient; own Person P | `forPerson = P`; resolves `P` | — |
| Change | E for P; own Person Q | `forPerson = Q` | — |
| Clear | E for P, `null` | `forPerson` empty; resolves `null` | — |
| Inline create | E; `{ create: 'Liisa' }`, no such Person | new Person "Liisa" of A; `forPerson` = it | — |
| Inline match | E; `{ create: ' liisa ' }`, Person "Liisa" exists | no new Person; existing one set | — |
| Bad person | E; B's Person id, or `{ create: '  ' }` | E unchanged, no Person created | `VALIDATION` on `person` |
| Bad entry (set) | closed E, B's entry, `0`, unknown id; with `{ create: 'Uusi' }` | no write, no Person created | `NOT_FOUND` |
| Remove | own open entry E | row gone; other entries stay | — |
| Bad entry (remove) | closed E, B's entry, `0`, unknown id | no row deleted | `NOT_FOUND` |

</intent-contract>

## Code Map

- `src/lib/wishlists/entries.ts` -- add both services here, after `closeEntry`. `closeEntry` (~line 137) is the golden pattern: `isRowId` guard, owner + `closedAt: { exists: false }` find, `NOT_FOUND`. `deleteEntry` (bottom) is the restore helper with a count-first guard; `removeEntry` does its own find, so it can call `gateway.deleteByID` directly.
- `src/lib/people/people.ts:85` `resolvePerson(ctx, ref)` -- runs on the caller's context (opens no transaction), `VALIDATION` on `person`; a created Person stays.
- `src/lib/loans/loans.ts:88` -- existing `resolvePerson(tx, person)` call inside a service transaction: same shape.
- `src/lib/payload/ref.ts` -- `Ref`, `isRowId`, `idOf`.
- `src/collections/WishlistEntries.ts:34` -- `forPerson` is an `ownedRelation('people')`, optional.
- `tests/int/closeEntry.int.spec.ts` -- harness to mirror: `createUser`/`contextFor`, `sharedBook`, `ownEntry` (`createWishlist` + `createEntry`), `entryForPerson` (gateway), the NOT_FOUND loop over `[closed, foreign, 0, 2147483647]`.
- `ARCHITECTURE-SPINE.md:251,601` -- writer paragraph and `wishlists/` source-tree line.

## Tasks & Acceptance

**Execution:**
- `src/lib/wishlists/entries.ts` -- add `setEntryRecipient` and `removeEntry` with doc comments; import `resolvePerson` from `@/lib/people/people`.
- `tests/int/entryRecipient.int.spec.ts` -- new: set by id, change, clear; inline create and inline match (Person count of the user checked); bad person (B's Person id, blank name) with E unchanged; `NOT_FOUND` for closed/foreign/non-row ids with `{ create }` and no Person created; remove deletes only that row; remove `NOT_FOUND` for closed/foreign/non-row ids with nothing deleted.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- lines 251 and 601 as above.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-9-h16-entry-recipient-and-removal: done` when done.

**Acceptance Criteria:**
- Given one of my open entries, when `setEntryRecipient` runs with a Person id, a `{ create }` name, or `null`, then the recipient is set, changed or cleared, and an inline name is resolved through `resolvePerson()` (`lib/people`).
- Given one of my open entries, when `removeEntry` runs, then the row is deleted and no restore is returned.
- Given another user's, a closed, or a non-row entry id, when either service runs, then it fails with `NOT_FOUND` and writes nothing (no Person created).
- Given the existing `closeEntry`, `saveClosesEntries`, `wishlistEntries` and `people` suites, when run, then they pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 8, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: a second concurrent Remove passes the count, then `deleteByID` finds the row gone and Payload's `NotFound` surfaces as `INTERNAL`, not `NOT_FOUND` — real only for two confirms landing inside one transaction's span behind a confirm dialog; the fix is a row lock or a caught error, extra complexity for a race 7.13's dialog makes unlikely. Same ground as 7.8's rejected double-tap race.
  - `[low]` `[reject]` Blind: `setEntryRecipient` can write a recipient onto an entry a concurrent `closeEntry`/save closed between check and update — same race; the outcome is a recipient on a closed row no screen shows. Rejected on the same grounds.
  - `[false]` `[reject]` Blind: the doc's "Nothing else on the entry changes" hides that the recipient drives `closeEntriesForBook()`/`closeEntry()` — the sentence is accurate (only `forPerson` is written), and the spine paragraph the new sentence joins already states both recipient rules.
  - `[low]` `[patch]` Blind: `removeEntry` doesn't say what happens to a private Book with nothing else referencing it — doc comment now says the Book stays, even with no copy or entry left, as `removeCopies()` does.
  - `[low]` `[patch]` Blind: no test runs as the admin, though the explicit `owner` filter exists for FR-48 — both `NOT_FOUND` tests now also call the service as an admin against A's open entry, expecting `NOT_FOUND`, A's entry unchanged and no Person created.
  - `[false]` `[reject]` Blind: spec status disagrees with sprint-status — the run was mid-review; status is set at finalize.
  - `[false]` `[reject]` Blind: no Residual risks section — residual risks are recorded under Auto Run Result at finalize; the story was not built beside others in parallel worktrees, so CLAUDE.md's shared-files rule doesn't apply.
  - `[low]` `[reject]` Blind: tests don't check that `book`/`wishlist`/`closedAt` and `user-books` stay unchanged — the update's `data` is `{ forPerson }` alone and the delete touches one row by construction; a test restating that guards no named criterion or spine rule (CLAUDE.md, Tests).
  - `[low]` `[reject]` Edge: concurrent close between check and `forPerson` update — duplicate of the Blind race row, rejected on the same grounds.
  - `[low]` `[reject]` Edge: concurrent close between check and delete deletes a closed entry; its Undo then skips the gone entry — same race; Undo still deletes the copy and succeeds. Rejected on the same grounds.
  - `[low]` `[reject]` Edge: concurrently deleted entry makes `updateByID`/`deleteByID` surface `INTERNAL` — duplicate of the first Blind row.
  - `[false]` `[reject]` Intent: "at any time" (FR-38) narrowed to open entries — no surface reaches a closed entry (`?entry=` of a closed entry toasts "Not on this list", EXPERIENCE.md), and the epic context fixes "entry" as an open entry; the narrowing has no user-visible effect.
  - `[false]` `[reject]` Intent: only the service layer is exercised, not the sheet — the story is "as the developer"; the action and sheet are 7.12/7.13.
  - `[false]` `[reject]` Intent: admin part of FR-48 not exercised — no longer true after the admin patch above.
  - `[false]` `[reject]` Intent: remove test doesn't check `user-books` or the list — same as the rejected Blind test-only row; no criterion names it.
  - `[false]` `[reject]` Intent: spec file uncommitted and `in-review` while sprint-status says `done` — mid-run bookkeeping; finalize sets and commits both.

## Design Notes

**Open entries only.** The epic context fixes "entry" as an open entry unless stated otherwise, and the sheet never opens a closed one (`?entry=` of a closed entry toasts "Not on this list"). Restricting both services to open entries matches `closeEntry` and keeps a closed entry's recipient, which `deletePerson`'s in-use rule relies on, as it was at close.

**Entry check before resolve.** `resolvePerson()` creates on a new name, and that Person would outlive the call only if the transaction committed; checking the entry first means a `NOT_FOUND` never even reaches the create, so the "no Person created" row holds without relying on rollback.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `entryRecipient.int.spec.ts`.

## Auto Run Result

**Summary.** The opened entry sheet now has its two services (FR-38, AD-18). `setEntryRecipient(ctx, entryId, person: Ref | null)` in `lib/wishlists` sets, changes or clears the recipient of one of the user's open entries and resolves to the Person id (`null` once cleared). An inline name goes through `resolvePerson()` in `lib/people`, so a matching Person is reused and a new name creates one. `removeEntry(ctx, entryId)` deletes one open entry, with no Undo; the Book, `user-books` and the list stay. Both check the entry first: a gone, closed, foreign (the admin's included) or non-row id fails with `NOT_FOUND` and writes nothing, so no Person is ever created for it.

**Files changed.**
- `src/lib/wishlists/entries.ts` -- `setEntryRecipient`, `removeEntry` and the shared `assertOpenEntry` check (a `count` with owner and `closedAt` filters).
- `tests/int/entryRecipient.int.spec.ts` -- new: 7 tests (set/change/clear, inline create, inline match, `VALIDATION` on `person`, `NOT_FOUND` for both services including an admin caller, remove deletes one row).
- `ARCHITECTURE-SPINE.md` -- writer paragraph and `wishlists/` source-tree line gain both services.
- `sprint-status.yaml` -- 7.9 done.

**Review.** One pass, 16 findings (low 8, false 8). Patched 2 low entries: the `removeEntry` doc says the Book stays; both `NOT_FOUND` tests also run as the admin (FR-48). Rejected, with reasons in the triage log: the check-then-write races under concurrent Remove/close (rare behind a confirm dialog; needs row locks, as in 7.8), test-only rows restating that only `forPerson` is written, the doc wording on recipient effects (already in the spine), the open-entries-only reading of "at any time" (no screen reaches a closed entry), and mid-run bookkeeping. Nothing deferred.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 2.

**Verification.** After implementation and again after the patches:
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (56 existing warnings).
- `npm run test:reset && npm run test:int`: 659 passed (78 files). The `UNDO_FAILED` lines are the expected log from lent-copy tests.

Matrix audit: all 9 rows are covered by passing tests.

**Residual risks.**
- Two concurrent Removes (or a Remove/For racing a close) can surface Payload's `NotFound` as `INTERNAL`, or write to an entry just closed; 7.12/7.13 should keep the controls from firing twice.
- The implementation subagent committed the code early (`888e082`) before review; the review patches and the finished spec land in a follow-up commit.
- Built in a cloud session against a locally created Postgres 16 cluster (ICU fi-FI), not the Docker Compose database.
