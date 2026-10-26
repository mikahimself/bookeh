---
title: '6.5 [J3] Lend and return'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_revision: '0c7b9012f9346650bceca445046daea32a5130a3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Loans exist as a collection (6.2) and People can be resolved (6.3), but nothing lends or returns a copy: there is no `lib/loans`, no Helsinki "today", no Undo for either, and the save's Undo only refuses a lent copy by accident (the `loans.copy_id` NOT NULL foreign key), which 6.4 may change (FR-35, FR-36, AD-11, AD-20).

**Approach:** Add `lib/loans` with the undoable `lendCopy` and `returnLoan` on the pattern of `receiveCopy`, plus a small dates module that gives today in `Europe/Helsinki` and checks a `YYYY-MM-DD` calendar date. Make the created-copy restore refuse a copy with a loan explicitly, and the Received restore refuse a copy with an open loan, both with `UNDO_FAILED`. Record the `lib/loans` shapes in the spine and cover each rule with an integration test.

## Boundaries & Constraints

**Always:**
- `lib/loans` is the only writer of `loans` (AD-18, except People merge and copy removal). It imports only `@/lib/people`, `@/lib/payload/*`, `@/lib/errors`, `@/lib/undo/undo` (types), `@/i18n/locale` (`timeZone`) and `@/payload-types`. It reads copies through the gateway and does not import `lib/copies`.
- Both functions are undoable in the `lib/undo` pattern: take a context, record nothing, return `Undone<T>`, run in `withTransaction(ctx, …)` so they join the caller's (as `receiveCopy`). Restores close over ids only, run through the gateway as the restoring user, and skip a loan that is gone (`count` first: a `NotFound` would end the transaction).
- Every read and write filters on `owner = ctx.user.id` explicitly as well as through `ownerAccess`, so the admin is held to their own rows (FR-48).
- Ids are checked with `isRowId()` before any read; a bad, gone or foreign copy or loan id is `NOT_FOUND` (as `receiveCopy`). Dates are checked before any read.
- A date is a calendar date string `YYYY-MM-DD` that names a real day; anything else is `VALIDATION` on that field. It is written as sent; the collection's `toNoonUtc` hook stores it at 12:00 UTC.
- Today is the calendar date in `timeZone` (`Europe/Helsinki`, from `src/i18n/locale.ts`) at the moment of the call, from one helper.
- Lending: an owned copy (`status: 'owned'`) without an open loan. The copy is not written: it keeps its location and status.
- A Person given as `{ create: name }` is created by `resolvePerson` inside the transaction and stays after Undo (nothing records it).
- The service checks the one-open-loan rule before the insert to raise its own `DomainError`; the partial unique index `loans_copy_open_idx` stays the guarantee (AD-19).

**Never:**
- No server actions, screens, toasts or strings (6.7, 6.9); no holdings or `CopyLine.loan` (6.6); no loans read-back for display (6.6).
- No change to the `loans` or `people` collections, their hooks, migrations or `payload-types.ts`.
- No new `ErrorCode`. No check that a return date is not in the future (not asked; the screens default it to today).
- No change to `removeCopies` or copy removal (6.4, built in parallel on main).
- No refusal of a status change to ordered on a lent copy in `setStatus` (not an acceptance criterion; Residual risk).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lend, existing Person | A's owned copy at "Olohuone", A's Person id, no date | Loan `{ copy, person, lentOn: today 12:00Z, returnedOn: null }`; data `{ loanId, person: { id, name } }`; copy unchanged | — |
| Lend, date given | `lentOn: '2026-10-01'` | Stored `2026-10-01T12:00:00.000Z` | — |
| Lend, Person by name | `{ create: 'Liisa K' }`, none so named | New Person; loan on it; data names "Liisa K" | — |
| Lend Undo | Undo the lend | Loan gone; copy unchanged; an inline-created Person stays | — |
| Lend, future date | `lentOn` = tomorrow in Helsinki, or `'2999-01-01'` | Nothing written | `VALIDATION`, `fields: { lentOn: 'VALIDATION' }` |
| Lend, malformed date | `'2026-02-30'`, `'26.10.2026'`, `''` | Nothing written | `VALIDATION`, `lentOn` |
| Lend, ordered copy | A's ordered copy | Nothing written | `VALIDATION`, `fields: { copy: 'VALIDATION' }` |
| Lend, already lent | A's copy with an open loan | Nothing written | `VALIDATION`, `copy` |
| Lend again after return | Copy whose only loan is returned | New open loan | — |
| Lend, foreign or bad copy | B's copy, a deleted id, `0`, as A and as the admin | Nothing written | `NOT_FOUND` |
| Lend, foreign Person | B's Person id | Nothing written | `VALIDATION`, `person` (from `resolvePerson`) |
| Return | A's open loan lent 2026-10-01, no date | `returnedOn` = today 12:00Z; row kept; data `{ loanId }` | — |
| Return, date given | `returnedOn: '2026-10-01'` (= lent day) | Stored | — |
| Return, before lent | `returnedOn: '2026-09-30'` | Nothing written | `VALIDATION`, `fields: { returnedOn: 'VALIDATION' }` |
| Return, malformed | `'2026-13-01'` | Nothing written | `VALIDATION`, `returnedOn` |
| Return, already returned | A's returned loan | Nothing written | `VALIDATION`, `fields: { loan: 'VALIDATION' }` |
| Return, foreign or bad loan | B's loan, a deleted id, `0`, as A and as the admin | Nothing written | `NOT_FOUND` |
| Return Undo | Undo the return | `returnedOn` null again | — |
| Return Undo, lent again | Returned, then the copy lent again, then Undo the return | Both loans as they were | `UNDO_FAILED` (the open-loan index refuses) |
| Save Undo with a loan | Save, lend the saved copy, Undo the save | Copy, Book and loan unchanged | `UNDO_FAILED` |
| Received Undo while lent | Receive an ordered copy, lend it, Undo the Received | Copy stays owned at its location; loan open | `UNDO_FAILED` |
| Today in Helsinki | `2026-10-26T21:59:59Z` / `2026-10-26T22:00:00Z` | `'2026-10-26'` / `'2026-10-27'` | — |

</intent-contract>

## Code Map

- `src/lib/copies/receiveCopy.ts` -- the template for an undoable copy service: `isRowId` → `NOT_FOUND`, `withTransaction(ctx, …)`, `gateway.find` with `id` + `owner`, `select`, `limit: 1`; field error via `DomainError('VALIDATION', { fields })`; restore `restoreOrdered` (`count` then `updateByID`). Its doc comment (lines 28–29) defers "Epic 6 makes the restore fail with `UNDO_FAILED` when the copy has gained a loan since" — this story does it (open loan) and rewrites that sentence.
- `src/lib/copies/createCopy.ts:42-50` -- `deleteCopy`, the restore of every created copy (the save's, `saveOwnedCopy` in `src/lib/catalogue/saveCopy.ts:184-213`, runs it first, then the Book's). Add a `gateway.count` on `loans` where `copy = id`; any loan, open or returned → `throw new DomainError('UNDO_FAILED')`. Update the doc comment (lines 24–26). `undo()` turns any throw into `UNDO_FAILED` and rolls back, so the Book restore never runs.
- `src/lib/people/people.ts` -- `resolvePerson(ctx, ref: Ref): Promise<number>` (id must be own, else `VALIDATION` on `person`; a name matches or creates). Read-only.
- `src/collections/Loans.ts` -- fields `copy`, `person`, `lentOn` (required), `returnedOn`; `toNoonUtc` hook; `returnedNotBeforeLent` collection hook (path `returnedOn`); `openLoanIndex` (`loans_copy_open_idx`, violation as `ValidationError` on `copy_id`). Doc comment already names `lib/loans` as writer. Read-only.
- `src/lib/undo/undo.ts` -- `Undone<T>`, `withUndo`, `undo` (any restore throw → `UNDO_FAILED`, rolled back). Read-only.
- `src/lib/payload/ref.ts` -- `Ref`, `isRowId`. `src/lib/payload/gateway.ts` -- `find`, `count`, `create`, `findByID`, `updateByID`, `deleteByID`. `src/lib/payload/transaction.ts` -- `withTransaction`.
- `src/i18n/locale.ts:5` -- `export const timeZone = 'Europe/Helsinki'`. No "today" helper exists anywhere yet.
- An open loan in a `where`: `{ returnedOn: { exists: false } }` (Postgres: `IS NULL`).
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:508` (Shared shapes, after `// src/lib/people`), `:592` (file tree `loans/  wishlists/`). AD-11 (`:198`) already states the save rule; no change there.
- `tests/int/loans.int.spec.ts:20-60` -- `copyAs`, `personAs`, `loanAs` helpers and the shared Book via `overrideAccess`. `tests/int/receiveCopy.int.spec.ts:17-95` -- `copyFor`, `userWithDefault`, `failure()`, `withUndo` + `undo` usage. `tests/int/saveCopy.int.spec.ts:677-720` -- the `undo` describe, `freshUser`, `inputFor`, mocked `lookupSources`, `copiesOf`, `booksWithIsbn`. `tests/int/peopleService.int.spec.ts` -- the foreign-and-bad-id loop as a user and the admin.
- `tests/helpers/harness.ts` -- `createUser`, `contextFor`.

## Tasks & Acceptance

**Execution:**
- `src/lib/loans/dates.ts` -- new. `helsinkiToday(now = new Date()): string` (`Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })`) and `isCalendarDate(value: unknown): value is string` (`/^\d{4}-\d{2}-\d{2}$/` and the UTC round trip names the same day). Doc comment: spine Dates convention; 6.6 adds the read-back here.
- `src/lib/loans/loans.ts` -- new. `lendCopy(ctx, copyId: number, person: Ref, lentOn?: string): Promise<Undone<Lent>>` with `type Lent = { loanId: number; person: Named }`, and `returnLoan(ctx, loanId: number, returnedOn?: string): Promise<Undone<{ loanId: number }>>`. `Named` declared locally (as `lib/people`). Lend: id check, date check (calendar date, not after today) → in `withTransaction`: find copy (`id` + `owner`, `select: { status: true }`) → `NOT_FOUND`; not owned → `VALIDATION` `copy`; open loan count > 0 → `VALIDATION` `copy`; `resolvePerson`; `gateway.create` the loan; read the Person's name (`findByID` `select: { name: true }`); restore deletes the loan. Return: id check, date check → find loan (`id` + `owner`, `select: { lentOn: true, returnedOn: true }`) → `NOT_FOUND`; already returned → `VALIDATION` `loan`; date before `lentOn.slice(0, 10)` → `VALIDATION` `returnedOn`; `updateByID` `returnedOn`; restore sets `returnedOn: null`. Doc comments in the `receiveCopy` style (Spine AD-18, AD-19, AD-20, FR-35, FR-36), naming the lost-race behaviour (a concurrent lend surfaces as the index's `ValidationError` on `copy_id`) and that a return's restore fails when the copy has been lent again.
- `src/lib/copies/createCopy.ts` -- `deleteCopy` refuses a copy with any loan (`UNDO_FAILED`); doc comment updated.
- `src/lib/copies/receiveCopy.ts` -- `restoreOrdered` refuses a copy with an open loan (`UNDO_FAILED`) after the gone-copy skip; doc comment's Epic 6 sentence rewritten as current behaviour.
- `ARCHITECTURE-SPINE.md` -- Shared shapes: `// src/lib/loans` with `type Lent = { loanId: number; person: Named } // lendCopy(ctx, copyId, person: Ref, lentOn?): Undone<Lent>; returnLoan(ctx, loanId, returnedOn?): Undone<{ loanId }>; dates default to helsinkiToday()`; file tree: `loans/  # lendCopy, returnLoan; dates: helsinkiToday, isCalendarDate` on its own line, `wishlists/` kept.
- `tests/int/loansService.int.spec.ts` -- new; one test per matrix row group: lend with an id and default date (copy unchanged) and its Undo; lend by name and Undo keeping the Person; lend with a date; future and malformed dates; ordered and already-lent copies; lend again after return; foreign/bad copy ids as A and the admin; foreign Person; return default and given date, and Undo reopening; return before lent, malformed, already returned; foreign/bad loan ids as A and the admin; return Undo after the copy is lent again.
- `tests/int/saveCopy.int.spec.ts` -- in `describe('undo')`: save, lend the copy, Undo fails `UNDO_FAILED`; copy, Book and loan remain.
- `tests/int/receiveCopy.int.spec.ts` -- receive, lend, Undo fails `UNDO_FAILED`; copy stays owned at the default location, loan open.
- `tests/unit/loanDates.unit.spec.ts` -- new; `helsinkiToday` either side of Helsinki midnight (winter and summer offset) and `isCalendarDate` on valid, impossible and malformed strings.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `6-5-j3-lend-and-return: done` when the story is done.

**Acceptance Criteria:**
- Given `lendCopy` and `returnLoan` in `lib/loans`, when they run, then lending works only on the viewer's owned copy without an open loan and otherwise fails with a field error on `copy`, and the copy keeps its location and status.
- Given no date, when lending or returning, then the date is today in `Europe/Helsinki`; a lending date after today, or a return date before the lending date, fails with a field error on that date, and nothing is written.
- Given an open loan, when `returnLoan` runs, then `returnedOn` is set and the row is kept as history.
- Given a lend or a return wrapped in `withUndo`, when it is undone, then the lend's loan is deleted and the returned loan is open again; an inline-created Person stays.
- Given a saved copy that has since been lent, when the save is undone, then it fails with `UNDO_FAILED` and the copy, its Book and the loan are unchanged (AD-11).
- Given a received copy that has since been lent, when the Received is undone, then it fails with `UNDO_FAILED` and the copy stays owned.
- Given the spine, when this story merges, then Shared shapes and the source tree name `lendCopy`, `returnLoan`, `Lent` and `helsinkiToday`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 28 findings — high 0, medium 0, low 18, false 10, maybe-false 0
- findings:
  - `[false]` `[reject]` Intent: the 3.37 criterion's toast text ("Couldn't undo.") is not exercised — `undoAction` and the toast already map `UNDO_FAILED` to that message (3.26, 3.47); 6.5's criterion is the service outcome, which is tested.
  - `[false]` `[reject]` Intent: `lentOn` is optional where the epic signature lists it — the criterion says it defaults to today; optional satisfies both and is recorded in Design Notes and the spine.
  - `[low]` `[reject]` Intent: a lend that loses a race surfaces as the index's `ValidationError` on `copy_id`, not a field error on `copy` — grouped with the edge and blind race rows; one user lending from one phone does not meet it, a catch-and-rethrow adds a branch; documented in the doc comment, as for locations and People.
  - `[false]` `[reject]` Intent: the return-before-lent rule is enforced twice — the collection hook guards back-office writes and the service raises its `DomainError` first; that is the AD-19 pattern, not a defect.
  - `[false]` `[reject]` Intent: the `receiveCopy` restore change is beyond 6.5's criteria — its own doc comment deferred it to Epic 6, and lending is what makes it reachable; it is in this story's matrix.
  - `[false]` `[reject]` Intent: the return restore failing once the copy is lent again is not a stated criterion — it is the AD-20 "any step fails → `UNDO_FAILED`" consequence of the open-loan index, tested, with nothing written.
  - `[false]` `[reject]` Intent: createCopy's restore refuses any loan, receiveCopy's only an open one — same as the blind asymmetry row; see there.
  - `[low]` `[reject]` Intent: no Residual risks naming the files shared with 6.4 — the Auto Run Result written at finalization names them; the fix is an edit of this spec.
  - `[low]` `[patch]` Verification: the save-Undo test passes without the new loan count, because the `loans.copy_id` NOT NULL foreign key already refuses the delete (AD-11) — the test now asserts the logged restore error is the `DomainError('UNDO_FAILED')` from `deleteCopy`.
  - `[low]` `[patch]` Verification: neither loan restore is tested on a loan that is gone (AD-20) — new test: lend and return in `withUndo`, delete the loan, both Undos resolve.
  - `[low]` `[reject]` Verification: no test that a returned loan does not block the Received Undo — asks only for a test, and no criterion or spine rule names that case (CLAUDE.md, Tests).
  - `[false]` `[reject]` Edge: `returnLoan` accepts a future `returnedOn` — no caller passes a return date: the screens' Returned closes the loan today (EXPERIENCE, Loans), so the state is unreachable from the product.
  - `[false]` `[reject]` Edge: undoing a lend after its return deletes the returned row — AD-20: a restore writes the recorded previous state (no loan) to rows that still exist, whatever they hold now.
  - `[low]` `[reject]` Edge: a return's Undo can reopen a loan on a copy set to ordered since — grouped with the `setStatus` rows: nobody marks a lent book "ordered" in everyday use, and guards in `setStatus` and the restore add branches to another story's surface; named in Residual risks.
  - `[low]` `[reject]` Edge: the receiveCopy comment assumes an ordered copy is never lent while `setStatus` allows it — same group.
  - `[low]` `[reject]` Edge: concurrent lend surfaces a raw `ValidationError` on `copy_id` — same group as the intent race row.
  - `[low]` `[reject]` Edge: a default-date return of a loan whose `lentOn` is after today (back-office edit) errors on `returnedOn` — needs the user to set a future lending date by hand in the back office; a special case adds a branch.
  - `[low]` `[patch]` Blind: AD-20 not updated for the Received restore's new refusal — AD-20's restore bullet now names both copy restores' loan refusals.
  - `[low]` `[reject]` Blind: `setStatus` lets a lent copy become ordered — same group as the edge `setStatus` rows.
  - `[false]` `[reject]` Blind: the two copy restores disagree, leaving an ordered copy with loan history after receive, lend, return, Undo — the rule Received protects is "no open loan on an ordered copy"; a returned loan is true history and breaks no PRD or spine rule.
  - `[low]` `[reject]` Blind: lost lend race has a different error shape — same group as the intent race row.
  - `[low]` `[patch]` Blind: `helsinkiToday` depends on `en-CA` formatting as `YYYY-MM-DD` (CLDR data that has changed between ICU releases) — now assembled from `formatToParts`.
  - `[low]` `[reject]` Blind: `isCalendarDate` accepts year 0, which Postgres refuses as a raw error — the platform date picker never sends it; a year floor adds a guard for input nobody types.
  - `[false]` `[reject]` Blind: undoing a lend after its return silently erases history — same as the edge row: AD-20 behaviour.
  - `[low]` `[reject]` Blind: `returnLoan`'s already-returned check is not race-safe (double tap) — the client helper holds a pending action, and the worst case is the same date written twice; a conditional update or row lock adds machinery.
  - `[low]` `[reject]` Blind: default-date tests can flake when a run crosses Helsinki midnight — a run spanning midnight within a few seconds; the fix (bounding by two dates) adds test complexity.
  - `[low]` `[reject]` Blind: no Residual risks naming shared files — same as the intent row; written at finalization.
  - `[low]` `[reject]` Blind: `helsinkiToday` lives in `lib/loans`, out of reach for other consumers — there is no other consumer; it moves when one appears (CLAUDE.md: no abstractions for later).

## Design Notes

**Field keys.** The lend picker (6.7) has a Person and a date field, so `person` and `lentOn` errors land under them; the copy itself is implicit, and a copy that is ordered or already lent (a stale tab) is a field error on `copy`, which the picker shows as its form error. A returned loan given to `returnLoan` again is the same kind of stale-screen error, on `loan`. Gone or foreign ids are `NOT_FOUND`, as for every copy service.

**Why `lentOn` is optional.** The epic signature lists it; the acceptance criterion says it defaults to today. Optional satisfies both and keeps "today" in one server helper; the picker may still send the date the user chose.

**Why the copy restores check loans explicitly.** Today the save's Undo fails on the `loans.copy_id` foreign key by accident. 6.4 (in parallel) teaches copy removal to delete loans; an explicit check keeps the AD-11 rule from depending on how a foreign key behaves. Received is checked for an open loan only: an ordered copy may not be lent, while loan history on it is harmless.

```ts
const { totalDocs } = await gateway.count(ctx, { collection: 'loans', where: { copy: { equals: id } } })
if (totalDocs > 0) throw new DomainError('UNDO_FAILED')
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including `loanDates.unit.spec.ts`.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `loansService.int.spec.ts`, `saveCopy.int.spec.ts`, `receiveCopy.int.spec.ts`. The worktree's `.env` points at its own Postgres on port 5433.

## Auto Run Result

**Summary.** `lib/loans` now lends and returns. `lendCopy(ctx, copyId, person: Ref, lentOn?)` opens a loan of the viewer's owned copy:
- An ordered copy, or one that already has an open loan, fails with `VALIDATION` on `copy`.
- A lending date after today, or one that is not a calendar date, fails on `lentOn`.
- A bad, gone or foreign copy id fails with `NOT_FOUND`, for the admin too.
- The Person resolves through `resolvePerson`. The copy is never written, so it keeps its location and status.

`returnLoan(ctx, loanId, returnedOn?)` closes an open loan and keeps the row:
- A loan that is already returned fails on `loan`.
- A date before the lending day fails on `returnedOn`.

Both dates default to `helsinkiToday()`. Both functions are undoable:
- Lend's restore deletes the loan, and a Person created inline stays.
- Return's restore reopens the loan, and fails with `UNDO_FAILED` once the copy has been lent again.
- Both skip a loan that is gone.

The save's Undo now refuses a copy with any loan through an explicit check, no longer only through the foreign key (AD-11). The Received Undo refuses a copy with an open loan. The spine records `Lent`, the signatures, `lib/loans` in the source tree, and the copy-restore refusals in AD-20.

**Files changed.**
- `src/lib/loans/loans.ts` -- new: `lendCopy`, `returnLoan`, `Lent`, and the restores.
- `src/lib/loans/dates.ts` -- new: `helsinkiToday` (from `formatToParts`) and `isCalendarDate`.
- `src/lib/copies/createCopy.ts` -- the created-copy restore refuses a copy with any loan (`UNDO_FAILED`).
- `src/lib/copies/receiveCopy.ts` -- the Received restore refuses a copy with an open loan (`UNDO_FAILED`), and the doc comment no longer defers this to Epic 6.
- `ARCHITECTURE-SPINE.md` -- the `src/lib/loans` shared shape, `loans/` in the source tree, and the AD-20 copy-restore sentence.
- `tests/int/loansService.int.spec.ts` -- new: 13 tests covering the lend and return matrix, Undo, and gone loans.
- `tests/int/saveCopy.int.spec.ts` -- the save's Undo with a lent copy fails with `UNDO_FAILED` from the explicit check, and the copy, Book and loan remain.
- `tests/int/receiveCopy.int.spec.ts` -- the Received Undo with a lent copy fails, and the copy stays owned.
- `tests/unit/loanDates.unit.spec.ts` -- new: Helsinki midnight in winter and summer, and valid, impossible and malformed dates.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 6.5 done.

**Review.** One pass found 28 findings: 18 low and 10 false. Four low findings were patched:
- The save-Undo test now proves the refusal comes from the explicit check and not from the foreign key.
- A test shows that undoing a lend or a return whose loan is gone still resolves (AD-20).
- AD-20 states the copy-restore refusals.
- `helsinkiToday` no longer depends on the `en-CA` date pattern.

Deferred: none.

Rejected, with the reasons recorded in the triage log:
- The lost lend race, which surfaces as the index error on `copy_id`.
- `setStatus` letting a lent copy become ordered, and a return's Undo reopening a loan on such a copy.
- A test for loan history on a received copy.
- A future-dated `lentOn` entered by hand in the back office.
- Year 0 in `isCalendarDate`.
- A double-tap race on Returned.
- Test flakiness when a run crosses midnight.
- The location of `helsinkiToday`.
- Residual risks text, which belongs in this section.

The false rows:
- Toast text not exercised.
- The optional `lentOn`.
- The return rule enforced twice.
- The `receiveCopy` scope.
- The return restore's refusal.
- The asymmetry between the two copy restores.
- A future `returnedOn`, which no caller sends.
- Lend Undo after a return, which is AD-20 behaviour.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 4.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. The 48 warnings are all in existing generated migrations.
- `npm run test:unit`: 929 passed (63 files).
- `npm run test:reset && npm run test:int`: 588 passed (70 files), against the worktree's own Postgres on port 5433.
- Matrix audit: all 22 rows are covered by passing tests.
- There is no schema change, so no migration or production-dump check was needed.

**Residual risks.**
- **Built beside 6.4 on main.** Shared files:
  - `ARCHITECTURE-SPINE.md` (AD-18, AD-20, Shared shapes, the source tree);
  - `_bmad-output/implementation-artifacts/sprint-status.yaml`;
  - the `src/lib/copies` folder (6.4 edits `removeCopies.ts`; this story edits `createCopy.ts` and `receiveCopy.ts`).

  Whichever merges second rebases those files. If 6.4 changes the `loans.copy_id` foreign key to cascade, the save-Undo test still holds, because the check is explicit.
- `setStatus` can still set a lent copy to ordered. A return's Undo can then reopen a loan on an ordered copy.
- A lend that loses a race surfaces as the open-loan index's `ValidationError` on `copy_id`. A double Returned writes the same date twice.
- The default-date tests could fail if a run crosses Helsinki midnight.
- Story 6.7 adds the actions that wrap these functions in `withUndo`.
