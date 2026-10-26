---
title: '6.11 [J13] Returned loans'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_revision: 'a3b052668fb0e1c0bc6b741a8a284a5f79fd565a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `/loans` (6.9, 6.10) lists only open loans. History is missing, and a return can only be made from Book detail (FR-36, FR-37, EXPERIENCE.md Loans).

**Approach:** Add `returnedLoans(ctx)` to `lib/loans`. The page renders a "Returned" group below the open loans in both orders, newest first, each row "{person} · {from} to {to}". Every open row gets a Returned Link that reuses 6.7's `ReturnLoan` (`returnLoanAction`, toast "Returned · Undo"); the refresh moves the row to the returned group, and a toast Undo refreshes `/loans` so it moves back.

## Boundaries & Constraints

**Always:**
- `lib/loans/loans.ts` gains `ReturnedLoan = { loanId, copyId, bookId, person: Named, lentOn: string, returnedOn: string }` (both `YYYY-MM-DD`, read back with `slice(0, 10)`) and `returnedLoans(ctx): Promise<ReturnedLoan[]>`: the viewer's loans with `returnedOn` set, newest first (`returnedOn` desc, then `lentOn` desc, then id desc). It filters on `owner` explicitly (FR-48, admin sees only their own), reads at `depth: 0`, and leaves out a loan whose copy or Person has gone, exactly like `openLoans`. Share the copy/Person hydration with `openLoans` through one private helper instead of duplicating it; `openLoans`' output and order stay unchanged.
- The page reads open and returned loans in one `loanItems` call and hydrates all Book ids with one `getEffectiveBooks()` call. A loan whose Book is unreadable is left out of either list. If either read fails, the page shows `LoadFailed` alone, as today.
- The returned group is rendered **once**, after `LoansOrder` (never inside its `byPerson`/`byDate` nodes), so it shows under both orders. It shows whenever there is at least one returned loan, including under Nothing lent. With none, there is no group and no heading.
- Group markup: `<div className="pt-4">` with `<h2 className="text-heading-group text-text-muted ui-case">{t('returnedGroup')}</h2>` and a `<ul>` of `LoanRow`s whose line is `t('lentBetween', { person, from, to })`. Dates are formatted as the open rows' (`format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: 'medium' })`). Returned rows link to `/loans?book=<bookId>` with the same `replace` / `open` props as open rows, and have no action.
- `LoanRow` gains an optional `action?: ReactNode`, rendered after the row's Link inside the `<li>` (never inside the Link: no nested interactive elements). The `<li>` becomes a flex row; the Link keeps `flex-1 min-w-0` so titles still truncate. Without `action`, a row looks as before.
- Every open row, in both orders, passes `action={<ReturnLoan loanId={loan.loanId} />}` (from `../CopyLine`, unchanged in behaviour). `ReturnLoan` already calls `returnLoanAction`, shows "Returned" with Undo, reports through `afterAction` (whose refresh re-renders `/loans`) and focuses `closest('section')`.
- The list column (`<div className="min-w-0 flex-1">`) becomes `<section tabIndex={-1} className="min-w-0 flex-1">`, the same pattern as Book detail's copies section, so focus lands on the list after a Returned instead of the body.
- A new client component `loans/RefreshOnUndo.tsx` (returns `null`) subscribes to `useToast().onUndone` and calls `router.refresh()` in a transition. The page mounts it inside `ShelfActionsProvider` in every state. Without it, an Undo with no Book detail open would leave the list stale (`ReadAndRating` refreshes only while Book detail is mounted).
- Strings in `messages/en.json` and `messages/fi.json`, namespace `loans`:
  - `returnedGroup`: en "Returned", fi "Palautetut"
  - `lentBetween`: en "{person} · {from} to {to}", fi "{person} · {from}–{to}"
- The spine (ARCHITECTURE-SPINE.md) gets `ReturnedLoan` and `returnedLoans(ctx)` in Shared shapes next to `OpenLoan`, and `returnedLoans` in the `loans/` line of the source tree.
- Tokens only. `ActionLink` is already tap-high on the phone (`max-wide:min-h-tap`) and a button, so it has keyboard reach.

**Never:**
- No Lent before on Book detail (6.12), no People in Settings (6.13).
- No change to `returnLoan`, `returnLoanAction`, `openLoans`' shape, `LoansOrder`, `TextSwitch` or prefs.
- No schema change (`returnedOn` exists). No paging, no client fetch, no limit on the returned group.
- The borrower's name is never lowercased: only the "Returned" heading uses `ui-case`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Both orders | Open: Leena 2 Jul (Puhdistus). Returned: Antti 3 Mar–20 Apr (Sinuhe), Leena 14 Jan–2 Feb (Kätilö) | Under the open loans, by person or by date: heading "Returned", then Sinuhe "Antti · Mar 3, 2026 to Apr 20, 2026", then Kätilö "Leena · Jan 14, 2026 to Feb 2, 2026" | — |
| Nothing lent | No open, two returned | Switch, "Nothing lent" and its remark, then the returned group | — |
| No history | Open loans, none returned | No "Returned" heading | — |
| Returned on a row | Tap Returned on Puhdistus | `returnLoanAction({ loanId })`; toast "Returned" with Undo; `router.refresh()` | A failure goes to `afterAction` (error toast), the row stays |
| Undo | Toast Undo after a Returned | `/loans` refreshes; the loan is open again | — |
| Returned rows | Any returned row | No Returned Link; tapping opens Book detail on `/loans` | — |
| Read fails | `returnedLoans` throws | Load failed only | Try again refreshes |
| Ownership | Another user's and the admin's returned loans exist | `returnedLoans(ctx)` lists only the viewer's | — |

</intent-contract>

## Code Map

- `src/lib/loans/loans.ts:205-260`: `OpenLoan` and `openLoans`. The copy and Person reads (`owner` filter, `idOf`, `bookByCopy`, `personById`, drop if gone) move into a private helper used by both readers; `returnedLoans` queries `returnedOn: { exists: true }`, `sort: ['-returnedOn', '-lentOn', '-id']`, and selects `returnedOn` too.
- `src/app/(frontend)/(sections)/loans/page.tsx`: `loanItems` (one Books read for both lists), the `row()` helper (add `action`), the `LoansOrder` branches, and the header comment (the returned group, Returned on rows). Wrap the column in the `<section>`, add the returned group after `LoansOrder`, and mount `RefreshOnUndo`.
- `src/app/(frontend)/(sections)/loans/LoanRow.tsx`: add `action`; update the doc comment.
- `src/app/(frontend)/(sections)/CopyLine.tsx:278-310`: `ReturnLoan`, reused unchanged. Its doc says focus moves to "Your copies"; reword it to "its section (Your copies, or the Loans list)".
- `src/app/(frontend)/(sections)/ReadAndRating.tsx:33-48`: the `onUndone` + `router.refresh()` pattern to copy into `RefreshOnUndo`.
- `src/app/(frontend)/(sections)/BookDetail.tsx:127`: the `<section tabIndex={-1}>` precedent.
- `src/app/(frontend)/(sections)/ShelfRows.tsx:81-104`: `afterAction` refreshes when no rows are registered (the Loans page has none).
- `messages/en.json`, `messages/fi.json`: the `loans` namespace (`returned` is the Link label; `toast.returned` the toast). `tests/unit/messages.unit.spec.ts` checks key parity.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:518,597`: `OpenLoan` line and the `loans/` tree line.
- `tests/int/loansService.int.spec.ts:312-361`: the `openLoans` test to mirror (helpers `lender`, `copyAs`, `personAs`, `createUser`, `contextFor`).
- `tests/unit/loansPage.unit.spec.ts`: mocks `@/lib/loans/loans` as `{ openLoans }` (add `returnedLoans`, default `[]`), `returnLoanAction` (make it a shared `vi.fn`), and the toast's `onUndone` (capture the listener for the Undo test).

## Tasks & Acceptance

**Execution:**
- `src/lib/loans/loans.ts`: add `ReturnedLoan` and `returnedLoans` with a doc comment (spine, AD-7, FR-36, FR-37, FR-48); extract the shared hydration.
- `src/app/(frontend)/(sections)/loans/LoanRow.tsx`: the `action` slot.
- `src/app/(frontend)/(sections)/loans/RefreshOnUndo.tsx`: new, with a doc comment.
- `src/app/(frontend)/(sections)/loans/page.tsx`: as under Always.
- `src/app/(frontend)/(sections)/CopyLine.tsx`: the `ReturnLoan` doc wording only.
- `messages/en.json`, `messages/fi.json`: the two strings.
- `ARCHITECTURE-SPINE.md`: `ReturnedLoan` / `returnedLoans` in Shared shapes and the tree line.
- `tests/int/loansService.int.spec.ts`: one test: only the viewer's returned loans (not open ones, not another user's or the admin's), newest first by `returnedOn`, ties by `lentOn` then id, with `lentOn` / `returnedOn` as `YYYY-MM-DD`.
- `tests/unit/loansPage.unit.spec.ts`: cover the matrix's page rows: the group under both orders with its line and order (as served); under Nothing lent; absent with no history; Returned calls `returnLoanAction({ loanId })`, shows the toast with Undo and refreshes; a toast Undo refreshes; returned rows have no Returned Link; `returnedLoans` failing shows Load failed.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: `6-11-j13-returned-loans: done` when done.

**Acceptance Criteria:**
- Given `/loans` in either order, when it renders, then returned loans form a group below the open ones, newest first, each "{person} · {from} to {to}".
- Given an open row, when I tap Returned, then the loan closes today with "Returned · Undo", and after the refresh the row is in the returned group.
- Given a Returned just made, when I tap Undo on the toast, then `/loans` refreshes and the loan is open again.
- Given no open loans and some returned ones, when `/loans` renders, then Nothing lent shows with the returned group below it.
- Given this story, when it is committed, then ARCHITECTURE-SPINE.md lists `ReturnedLoan` and `returnedLoans`.

## Spec Change Log

## Review Triage Log

## Design Notes

**The returned group sits outside the switch.** 6.10 sends both orders to the client; the returned group is the same in both, so rendering it once after `LoansOrder` keeps the payload from doubling again (6.10 residual risk).

**Newest first means most recently returned.** The group is history of returns, and the walkthrough has the returned row "drop to the returned group under today's date", i.e. at its top. Ties fall back to `lentOn` then id, descending, so the order is total.

**`ReturnLoan` is reused as is.** Its `closest('section')` focus works on `/loans` once the list column is a focusable `<section>`, so no new prop is needed.

## Verification

**Commands:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors.
- `npm run test:unit`: all pass.
- `npm run test:int -- tests/int/loansService.int.spec.ts`: all pass (needs the test Postgres).

**Manual checks (if no CLI):**
- Phone and wide, light and dark: Returned on a row moves it to the group; Undo moves it back; the Link is tap-high and keyboard-reachable; titles still truncate beside the Link.
