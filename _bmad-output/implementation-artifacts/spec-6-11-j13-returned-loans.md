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

### 2026-10-26 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 11, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: every row of the open Book (open plus returned loans of it) gets the selection bar. Book detail is keyed by Book, so marking each of its rows is consistent with 6.9, where several open copies of one Book were already all marked. Keying it to one row would add state for a rare case.
  - `[low]` `[reject]` Blind: one Undo fires two `router.refresh()` calls when Book detail is open (`RefreshOnUndo` and `ReadAndRating`). The result is one extra server render and no wrong state. Skipping one of them needs coordination between the components.
  - `[low]` `[patch]` Blind: the `ShelfActionsProvider` and `LendCopy` doc comments name only `ReadAndRating` for the Undo refresh. Fixed: both now also name `RefreshOnUndo` on `/loans`.
  - `[low]` `[reject]` Blind: the focus target `<section tabIndex={-1}>` has no accessible name. Book detail's copies section, the precedent, has none either. Naming it adds wiring that no criterion asks for.
  - `[low]` `[reject]` Blind: a failed returned read blanks the open loans as well. This is stated under Always ("If either read fails, the page shows `LoadFailed` alone"). Both reads hit the same database in the same render, so one failing alone is unlikely, and splitting the failure adds a branch.
  - `[low]` `[reject]` Blind / Edge: the returned history is unbounded (`pagination: false`). The spec's Never rules out a limit, and a person's lending history grows by dozens of loans a year at most. Noted in Residual risks.
  - `[low]` `[patch]` Blind: `sinceDate` now formats `lentOn` and `returnedOn` too, so the name is wrong. Fixed: renamed to `day`. The suggested `dateTimeRange` is rejected: the line is "{person} · {from} to {to}" as EXPERIENCE.md and the epic word it.
  - `[low]` `[patch]` Blind: the spine's `ReturnedLoan` line reads as if only `returnedOn` sorts descending. Fixed: "returnedOn, then lentOn, then loan id, all descending (newest first)".
  - `[false]` `[reject]` Blind: the `loan.returnedOn ?` check is a dead guard that could silently drop rows. The rows come from a `returnedOn: { exists: true }` query, so it never drops one. The check is there to narrow the generated `string | null | undefined` type.
  - `[false]` `[reject]` Blind: the spec change is missing from the diff and commit. The spec was left out of the review diff on purpose. It is committed with the story at finalization.
  - `[low]` `[reject]` Edge: unbounded returned history. This is the same as the Blind row above, with the same reason.
  - `[low]` `[reject]` Edge: two refreshes per Undo with Book detail open. This is the same as the Blind row above, with the same reason.
  - `[low]` `[reject]` Verification gap: focus landing on the list `<section>` after Returned is not asserted. The finding only asks for a test, and no criterion or spine rule names focus here (CLAUDE.md, Tests).
  - `[false]` `[reject]` Intent: "the copy" in EXPERIENCE.md might mean copy-level identity, such as the location. The open rows' "Rows show the copy" is already rendered as cover, title and authors (6.9, 6.10), and the returned rows use the same wording for the same row.
  - `[false]` `[reject]` Intent: no test shows the row moving into the returned group end to end. The finding only asks for a test. The move is composed of a tested refresh, a tested `returnedLoans` order and a tested render, and CLAUDE.md keeps Playwright to scan-to-save and shop check.
  - `[false]` `[reject]` Intent: the Finnish "{from}–{to}" is untested and not stated in the epic. The spec states it under Always, and strings are covered by key parity (CLAUDE.md, Tests).

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

## Auto Run Result

Status: done

**Summary.** `/loans` now shows a "Returned" group below the open loans in both orders, and under Nothing lent. It lists the newest return first, and each row shows the copy (cover, title, authors) and "{person} · {from} to {to}". Every open row has a Returned Link, which reuses Book detail's `ReturnLoan`. It closes the loan today with "Returned · Undo", and the refresh moves the row into the group. A toast Undo refreshes `/loans` through the new `RefreshOnUndo`, so the row moves back even with no Book detail open. `lib/loans` gains `returnedLoans(ctx)` and `ReturnedLoan`, which share the copy and Person lookup with `openLoans`. The spine is updated.

**Files changed.**
- `src/lib/loans/loans.ts`: `ReturnedLoan`, `returnedLoans`, and the shared private helper `withCopyAndPerson`.
- `src/app/(frontend)/(sections)/loans/page.tsx`:
  - one read for open and returned loans and their Books;
  - Returned on open rows;
  - the returned group, rendered once outside the switch;
  - the list column is a focusable `<section>`;
  - `RefreshOnUndo` mounted;
  - the date helper is now `day`.
- `src/app/(frontend)/(sections)/loans/LoanRow.tsx`: an optional `action` slot after the row's link.
- `src/app/(frontend)/(sections)/loans/RefreshOnUndo.tsx`: new. It refreshes after a toast Undo.
- `src/app/(frontend)/(sections)/CopyLine.tsx`, `ShelfRows.tsx`: doc comments only.
- `messages/en.json`, `messages/fi.json`: `loans.returnedGroup` and `loans.lentBetween`.
- `ARCHITECTURE-SPINE.md`: `ReturnedLoan` / `returnedLoans`.
- `tests/int/loansService.int.spec.ts`: one test for `returnedLoans`: viewer only, admin only their own, order with both tie-breaks.
- `tests/unit/loansPage.unit.spec.ts`: the returned group in both orders, under Nothing lent, absent with no history, and Load failed; Returned with its toast and refresh; Undo's refresh.
- `sprint-status.yaml`: 6.11 is done.

**Review.** One pass found 16 findings: 11 low and 5 false.
- **Patched (all low):**
  - Stale Undo-refresh doc comments in `ShelfRows.tsx` and `CopyLine.tsx`.
  - `sinceDate` renamed to `day`.
  - The spine's sort wording.
- **Deferred:** none.
- **Rejected, with reasons in the triage log:**
  - The selection bar on every row of the open Book.
  - Two refreshes per Undo with Book detail open (reported twice).
  - No accessible name on the focus section.
  - A failed returned read blanks the page (as specified).
  - Unbounded history (reported twice).
  - `dateTimeRange`.
  - The narrowing guard (false).
  - The spec missing from the diff (false).
  - A focus test.
  - "The copy" meaning location (false).
  - An end-to-end move test (false).
  - The untested Finnish dash (false).

**Follow-up review:** not recommended (`false`). Patched by verdict: 0 high, 0 medium, 3 low.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (the 48 warnings were already there).
- `npm run test:unit`: 65 files and 959 tests pass.
- `npm run test:int -- tests/int/loansService.int.spec.ts`: 15 pass.
- No schema change.
- Not run in a browser.

**Residual risks.**
- **Not checked in a browser:** phone and wide, light and dark, the row moving on Returned and back on Undo, the Link's tap height, and titles truncating beside the Link.
- **The returned history is unbounded.** `/loans` reads and renders every returned loan on each render and refresh.
- **Two refreshes per Undo** while Book detail is open on `/loans`.
- **Finnish range wording** ("{from}–{to}") and "Palautetut" are worth a look by Mika.
- **Parallel worktree:** a `bookeh-postgres-people-settings` container on port 5433 suggests 6.13 is in progress elsewhere. Files shared with it are likely `messages/*.json`, the spine's people and loans lines, and `sprint-status.yaml`.
- **Process note:** the implementation subagent committed the code (`35f34b5`) before review, against the workflow. The review patches and this spec are in a second commit.
