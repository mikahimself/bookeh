---
title: '6.4 [J6] Removing a copy removes its loans'
type: 'feature'
created: '2026-10-26'
baseline_revision: '0c7b9012f9346650bceca445046daea32a5130a3'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Deleting a copy that has loans in Payload admin fails on the loans.copy_id foreign key with a raw database error.
    evidence: |-
      Copies sits in the admin "My data" group with ownerAccess, so the owner can delete a copy there; that delete bypasses removeCopies, and loans.copy_id is NOT NULL with ON DELETE set null. Pre-existing since 6.2 added the FK; found in the 6.4 review.
    location: >-
      src/collections/Copies.ts:38
    severity: low
---

<intent-contract>

## Intent

**Problem:** `removeCopies` deletes copies only, so removing a copy that has a loan, open or returned, fails on the `loans.copy_id` foreign key (NOT NULL) and rolls back as `INTERNAL`. Neither removal dialog warns that a lent copy's loans would go with it (AD-18, EXPERIENCE.md Select mode → Remove).

**Approach:** In `removeCopies`, delete the removed copies' loans through the gateway inside the same transaction, before the copies. Both removal dialogs (the one-copy dialog in Book detail and the action bar's dialog) add one line saying the loans go too when any copy being removed is lent. They read lent state only from holdings' `CopyLine.loan`, which stays `null` until 6.6 fills it.

## Boundaries & Constraints

**Always:**
- Loans are deleted in `removeCopies`'s transaction (the caller's or its own, AD-16), through `gateway`, after the ownership check and before the copies. They are read with `copy in <owned ids>` and `owner = tx.user.id` (FR-48), and deleted one after the other (AD-16: calls on one context never run concurrently).
- Every loan of a removed copy goes, open and returned. An ordered (skipped) copy keeps its loans; it cannot have an open one, since only an owned copy is lent.
- `lib/copies` does not import `lib/loans` or `lib/people` (spine, Module boundaries); it writes `loans` only through the gateway.
- Lent means `CopyLine.loan !== null` (an open loan), read from the row or holdings data the surface already has (spine: rows and Book detail read loans only from holdings). In select mode, a copy's lent state is recorded when it is ticked, so ticked copies out of view still count.
- The dialog line appears only when at least one copy being removed is lent. Its wording does not depend on how many copies are lent: en `{n, plural, one {Its loans go too.} other {Their loans go too.}}`, fi `{n, plural, one {Myös sen lainat poistetaan.} other {Myös niiden lainat poistetaan.}}`, with `n` the dialog's count. It is a `text-body` paragraph in the dialog body, as in `LocationsGroup`'s delete dialog.
- No Undo, no toast change. A partial removal is not possible: a foreign id still fails the whole call with `NOT_FOUND`, and no loan is deleted.

**Never:**
- No `lib/loans`, lend, return or Returned link (6.5, 6.7), and no filling of `CopyLine.loan` in holdings (6.6).
- Do not decide which Links a lent copy's line shows in Book detail. That is 6.7's job. In this story an owned line keeps Move and Remove whatever its loan.
- No schema, migration, collection or `payload-types.ts` change. No change to the save Undo rule (`UNDO_FAILED` once a loan exists is 6.5's).
- No server round trip to find out whether copies are lent.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lent copy | A's copy X with an open loan and a returned loan; `removeCopies(asA, [X])` | `{ removed: 1, skipped: [] }`; X and both its loans gone; the Person and A's other loans stay | — |
| Mixed list | X lent, Y with no loans, Z ordered; `[X, Y, Z]` | `{ removed: 2, skipped: [Z] }`; X's loans gone; Z unchanged | — |
| Foreign id | X lent (A's) plus B's copy | Nothing deleted, X's loans kept | `NOT_FOUND` |
| Caller rolls back | `removeCopies` inside a caller's `withTransaction` that then throws | X and its loans still there | Caller's error rethrown |
| One-copy dialog, lent | Book detail; the owned line's `loan` set; Remove tapped | Dialog "Remove 1 book from library?" with "Its loans go too." | — |
| One-copy dialog, not lent | `loan: null` | Dialog without the line | — |
| Bulk dialog | Two ticked, one of them lent (it may be out of view when Remove is tapped) | "Remove 2 books from library?" with "Their loans go too." | — |
| Bulk dialog, none lent | Ticked copies all `loan: null` | No line | — |

</intent-contract>

## Code Map

- `src/lib/copies/removeCopies.ts:23-47` -- the change. The `find` with `owner` and the length check are the ownership gate. Add a `gateway.find` on `loans` (`copy: { in: owned ids }`, `owner: { equals: tx.user.id }`, `select: {}` or `{ copy: true }`, `depth: 0`, `pagination: false`) and a sequential `gateway.deleteByID` per loan before the copy loop. Rewrite the doc comment's last sentence ("Epic 6 deletes the copies' loans here as well") to state the rule.
- `src/lib/payload/gateway.ts:41,84` -- `find`, `deleteByID`. There is no bulk delete; per-row deletes match `mergePerson` and `deleteLocation`.
- `src/lib/people/people.ts:158-200` -- `loansOf` and `mergePerson`: the same "find loans by owner, then write one by one" shape. Read-only.
- `src/collections/Loans.ts` -- `copy` is a required `ownedRelation`; the doc comment already names copy removal as a writer (6.3). Read-only.
- `src/lib/books/holdings.ts:10-18,86` -- `CopyLine.loan` (typed, `null` until 6.6). Read-only.
- `src/app/(frontend)/(sections)/CopyLine.tsx:115-170` -- `RemoveCopy({ copyId, last })`: add `lent: boolean`, and render the line as the `Dialog`'s children when `lent`.
- `src/app/(frontend)/(sections)/BookDetail.tsx:111-141` -- the copies map destructures `{ copyId, location, status, note }`. Add `loan` and pass `lent={loan !== null}` to `RemoveCopy`.
- `src/app/(frontend)/(sections)/Selection.tsx` -- `SelectionValue`, `toggle`, `untick`, `start`, `done`. `toggle(copyId, lent)` also keeps `lent: ReadonlySet<number>`, the ticked ids that were lent when ticked: always a subset of `ticked`, cleared by `start` and `done`, pruned by `untick` and by untoggling.
- `src/app/(frontend)/(sections)/CollectionList.tsx:80-87` -- `opens(row)`: `onToggle: () => toggle(row.copy.copyId, row.copy.loan !== null)`.
- `src/app/(frontend)/(sections)/SelectBar.tsx:48-55,128-136,152-172` -- `removing` (the count kept while the dialog closes) becomes `{ n, lent }`, set when Remove opens the dialog, with `lent` = `lent.size > 0` from `useSelection()`. The `Dialog` renders the line as children when `removing.lent`.
- `src/app/(frontend)/components/ui/Dialog.tsx:37-68` -- children of a confirm dialog become its Description. Read-only.
- `src/app/(frontend)/(sections)/settings/LocationsGroup.tsx:315` -- body paragraph pattern `<p className="text-body">`. Read-only.
- `messages/en.json:220-221`, `messages/fi.json:220-221` -- `collection.remove`, `collection.removeTitle`; add `collection.removeLoans` after `removeTitle`.
- `tests/int/copyWrites.int.spec.ts:100-130` -- the removal tests (`copyOf`, `systemRead`, `notFound`). `tests/int/loans.int.spec.ts:20-60` -- `personAs` and the loan-creation shape through `gateway.create` with `lentOn: '2026-10-20'`. `tests/int/renameMergeLocation.int.spec.ts` -- the caller-rollback test shape.
- `tests/unit/collectionPage.unit.spec.ts:202-218` (`row`, `copy` helpers with `loan: null`), `:441-446` (`confirm`), `:513-541` (bulk remove test), `:1044-1048` (`confirmRemove`), `:1101-1115` (one-copy remove test).

## Tasks & Acceptance

**Execution:**
- `src/lib/copies/removeCopies.ts` -- delete the owned copies' loans (open and returned) through the gateway inside the transaction, before the copies; update the doc comment (AD-18).
- `src/app/(frontend)/(sections)/Selection.tsx` -- `toggle(copyId, lent)` and the `lent` set as described in the Code Map; document it on `SelectionValue`.
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- pass the row's lent state to `toggle`.
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- capture `{ n, lent }` on opening the dialog; render the loans line when `lent`; update the doc comment's Remove sentence.
- `src/app/(frontend)/(sections)/CopyLine.tsx`, `src/app/(frontend)/(sections)/BookDetail.tsx` -- `RemoveCopy` takes `lent` and shows the line; Book detail passes `loan !== null`.
- `messages/en.json`, `messages/fi.json` -- `collection.removeLoans` with the wording from Boundaries.
- `tests/int/copyWrites.int.spec.ts` -- two tests: (1) removing a lent copy (one open and one returned loan) with a loan-free copy and an ordered copy deletes the lent copy's loans and leaves another copy's loan, the Person and the ordered copy alone; (2) inside a caller's `withTransaction` that throws, the copy and its loans remain. Update the file's header comment.
- `tests/unit/collectionPage.unit.spec.ts` -- the bulk dialog shows "Their loans go too." when a ticked row has a loan, and only then (assert it is absent in the existing two-row test). The one-copy dialog shows "Its loans go too." for a line whose `loan` is set.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `6-4-j6-removing-a-copy-removes-its-loans: done` when the story is done.

**Acceptance Criteria:**
- Given copies with loans, open and returned, when `removeCopies` removes them, then their loans are deleted in the same transaction: the call succeeds, and a rollback by the caller keeps the copies and the loans.
- Given a removal dialog for one copy or for a selection, when any copy being removed is lent, then the dialog adds "Its loans go too." / "Their loans go too." (fi "Myös sen lainat poistetaan." / "Myös niiden lainat poistetaan."); when none is lent, it does not.
- Given the story is done, when `npm run test:int` runs, then an integration test removes a lent copy and finds its loans gone.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 21 findings — high 0, medium 1, low 14, false 5, maybe-false 1
- findings:
  - `[low]` `[reject]` Intent: the dialog line is inert in the running app until 6.6 fills `CopyLine.loan`, and is proven only on mocked rows — by design: the spine makes holdings the only loan source for rows and Book detail, 6.6 fills it with no dialog change, and no loan can be made from the frontend before 6.5 and 6.7.
  - `[false]` `[reject]` Intent: "lent" read as an open loan while returned loans are deleted too — "lent" is the product's state for a copy that is out (EXPERIENCE.md: the lent line and the lent marker), and Select mode → Remove says "If any are lent, the dialog says their loans go too"; deleting returned history without a line follows it.
  - `[false]` `[reject]` Intent: AC1 and AC3 live at the service and the int tests run there — a match, no defect.
  - `[false]` `[reject]` Intent: selection state, the all-ordered early return and the `owner` filter go past the AC's words — the selection change is what makes "a selection" work for ticked rows out of view; the filter is FR-48; the early return only skips a query that would find nothing.
  - `[low]` `[patch]` Verification gap: no test that a skipped ordered copy keeps its loans (matrix "Mixed list": Z unchanged) — the mixed-list int test now gives the ordered copy a returned loan and asserts it survives.
  - `[low]` `[reject]` Verification gap: no test that unticking a lent row clears its lent flag — two lines in one state update in `Selection.tsx`, inert until 6.6; tests stay at the functional minimum.
  - `[medium]` `[patch]` Edge: `{lent && …}` passes `false` as Dialog children and `Dialog.tsx:51` checks `children != null`, so every unlent removal dialog rendered an empty Description (an extra `gap-6` row, `aria-describedby` on an empty element) — both dialogs now pass `null` when not lent.
  - `[low]` `[patch]` Edge: a loan committed between the loans read and the copy delete rolls the call back as `INTERNAL` — grouped with the blind race row; the doc comment now says so, as `mergePerson` and `deletePerson` do. A lock is not worth it for one user.
  - `[false]` `[reject]` Edge: a copy with only returned loans loses them with no warning — same as the intent "lent" row: by EXPERIENCE.md.
  - `[low]` `[reject]` Edge: lent state recorded at tick goes stale if the loan changes while ticked — needs a lend or return from another device while select mode is open, then a refresh; syncing it adds state logic for a case nobody meets (Select mode closes Book detail in this tab).
  - `[maybe-false]` `[reject]` Edge: `lent.size` counts a ticked ordered copy, whose loans are kept — needs an ordered copy with an open loan, i.e. `setStatus` on a lent copy, which 6.5's rules settle; nothing creates loans yet. If true it would only be low.
  - `[low]` `[patch]` Blind: the out-of-view unit test never shows the lent row left the list — it now asserts Kätilö is gone before Remove.
  - `[false]` `[reject]` Blind: returned-loan history deleted without warning — same as the intent "lent" row.
  - `[low]` `[defer]` Blind: deleting a copy with loans in Payload admin fails on the `loans.copy_id` FK — pre-existing since 6.2 added the FK; the admin delete never went through `removeCopies`. Recorded in `deferred`.
  - `[low]` `[reject]` Blind: recorded lent flag never updates while ticked — grouped with the edge stale-state row; same reason.
  - `[low]` `[patch]` Blind: a loan created mid-removal gives `INTERNAL` — grouped with the edge race row; documented.
  - `[low]` `[reject]` Blind: the loans query selects `copy`, which is unused — same shape as `loansOf` in `lib/people`; harmless.
  - `[low]` `[reject]` Blind: one `deleteByID` per loan — matches `mergePerson` and `deleteLocation`; a copy has a handful of loans.
  - `[low]` `[reject]` Blind: "Their loans go too." keyed on the full count overstates which books had loans — the spec's wording; a book without loans has none to lose, so the sentence stays true.
  - `[low]` `[patch]` Blind: `RemoveCopy` doc comment half-reflowed — reflowed.
  - `[low]` `[patch]` Blind: `both.rows[0]!` vs `both.rows[0]` in one test — made consistent.

## Design Notes

**Why the line reads `CopyLine.loan` although it is always `null` today.** The spine has rows and Book detail read loans only from holdings, and 6.6 fills `loan` there. Wiring the dialogs to it now means 6.6 needs no dialog change. Until then no loan can be made from the frontend anyway (6.5 and 6.7). A server count before the dialog would be a second source of loan state and a round trip on every Remove.

**Why lent state is recorded on tick.** The action bar removes every ticked copy, in view or not. A ticked row can drop out of the loaded rows after a new search, so the bar cannot look its lent state up when Remove is tapped. Select mode closes Book detail, so a copy's loan cannot change from this tab while it is ticked.

**One-copy dialog vs. EXPERIENCE.md.** EXPERIENCE.md gives a lent line Returned instead of Lend, Move, Remove. If 6.7 follows it, the one-copy line is never shown on a lent copy. It is wired anyway because the epic names "one copy or a selection" and it costs one prop. 6.7 settles the lent line's Links.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including `collectionPage.unit.spec.ts` and `messages.unit.spec.ts`.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `copyWrites.int.spec.ts`.

## Auto Run Result

**Summary.** `removeCopies` now deletes every loan of the copies it removes, open and returned, before the copies and in the same transaction. It reads them with `copy in` the removed ids and `owner` = the viewer, and deletes them one by one through the gateway. A skipped ordered copy keeps its loans, and a caller's rollback keeps both the copies and the loans. Removing a lent copy no longer fails on the `loans.copy_id` foreign key. Both removal dialogs add "Its loans go too." / "Their loans go too." (fi "Myös sen lainat poistetaan." / "Myös niiden lainat poistetaan.") when a copy being removed has an open loan. They read `CopyLine.loan`. In select mode, a copy's lent state is recorded when it is ticked, so ticked copies out of view still count.

**Files changed.**
- `src/lib/copies/removeCopies.ts` -- deletes the removed copies' loans in the transaction; doc comment states the rule and the lost-race behaviour.
- `src/app/(frontend)/(sections)/Selection.tsx` -- `toggle(copyId, lent)` and a `lent` set kept as a subset of `ticked` in one state.
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- passes the row's `loan !== null` to `toggle`.
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- captures `{ n, lent }` when the dialog opens; shows the loans line.
- `src/app/(frontend)/(sections)/CopyLine.tsx`, `BookDetail.tsx` -- `RemoveCopy` takes `lent`; Book detail passes `loan !== null`.
- `messages/en.json`, `messages/fi.json` -- `collection.removeLoans`.
- `tests/int/copyWrites.int.spec.ts` -- a mixed-list removal with a lent copy (open and returned loans), a loan-free copy and an ordered copy with a returned loan; a caller rollback; the foreign-id test now checks a loan survives.
- `tests/unit/collectionPage.unit.spec.ts` -- the bulk dialog line with a lent copy out of view and its absence otherwise; the one-copy line with a lent copy and its absence otherwise.
- `_bmad-output/implementation-artifacts/epic-6-context.md` -- recompiled (the spine had changed in 6.3).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 6.4 done.

**Review.** One pass with 21 findings: medium 1, low 14, false 5, maybe-false 1.

Patched (one medium and four low):
- Medium: the empty dialog Description. With `{lent && …}` the dialog got `false` as children, which passes `children != null`.
- An ordered copy's loan is now asserted to survive the removal.
- The out-of-view unit test now asserts the row actually left the list.
- The lost-race sentence in the doc comment.
- The doc reflow and the test's `!` consistency.

Deferred: the Payload admin delete of a copy with loans fails on the foreign key. This is pre-existing since 6.2, low, and recorded in `deferred`.

Rejected, with the reasons in the triage log:
- The dialog stays inert until 6.6. This is by design.
- "Lent" means an open loan (false, per EXPERIENCE.md, three rows).
- The intent auditor's match and scope rows (false).
- No test for unticking a lent row.
- Lent state can go stale while a copy is ticked (two rows).
- An ordered ticked copy counts as lent (maybe-false, low if true).
- The unused `select` field.
- Per-row loan deletes.
- The bulk wording.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 1, low 4.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. The 48 warnings were already in the generated migrations.
- `npm run test:unit`: 912 passed. One earlier run had 2 failures that did not recur in three later runs. They look like load flakes, outside this change.
- `npm run test:reset && npm run test:int`: 575 passed, including `copyWrites.int.spec.ts` (7).
- Matrix audit: all 8 rows are covered by passing tests.
- No schema change, so there was no migration or production-dump check.
- The spine needed no edit: AD-18 already states that deleting a copy deletes its loans.

**Residual risks.**
- The dialog line shows in the running app only once 6.6 fills `CopyLine.loan` in holdings. No dialog change is needed then.
- A loan committed between the loans read and the copy delete rolls the removal back as `INTERNAL`. This is documented.
- Deleting a copy with loans in Payload admin still fails on the foreign key (deferred).
- A `bookeh-postgres-6-5` container was running, which suggests 6.5 is being built in a parallel worktree. Files it may share with this story: `_bmad-output/implementation-artifacts/sprint-status.yaml`, `messages/en.json`, `messages/fi.json` and `tests/int/copyWrites.int.spec.ts`.
