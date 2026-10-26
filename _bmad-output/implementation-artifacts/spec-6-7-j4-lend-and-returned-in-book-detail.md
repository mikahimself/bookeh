---
title: '6.7 [J4] Lend and Returned in Book detail'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_revision: '2b2840b330d92fde186df65b3c81b969325121f0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The Lend picker's default date and max are fixed at server render, so a Book detail left open past Helsinki midnight defaults to yesterday and blocks the real today.
    evidence: |-
      BookDetail passes `helsinkiToday()` down as `today`; LendPicker resets to it at each open. Computing it on the client fails lint `bookeh/client-lib-imports` (spine, Design Paradigm), which allows a client component only types and an allowlist from `src/lib`. A fix needs `lib/loans/dates` on that allowlist with a spine update, or a frontend copy of `helsinkiToday`. Any refresh (another action, navigation) corrects it.
    location: >-
      src/app/(frontend)/(sections)/LendPicker.tsx; src/app/(frontend)/(sections)/BookDetail.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** `lib/loans` can lend and return (6.5) and holdings carry the open loan (6.6), but Book detail offers neither. Mika can't lend the book to Antti at the door, and a lent copy's line looks the same as an owned one (FR-35, FR-36, UX-DR43, UX-DR16).

**Approach:** An owned, unlent copy's line gets **Lend**. It opens the Lend picker as Mika picked it (mock-up B, EXPERIENCE.md → Loans → Lend). On confirm a new server action wraps `lendCopy` in `withUndo` and the toast says "Lent to {person} · Undo". A lent copy's line shows the lent marker with "Lent to {person} since {date}" and only **Returned**, which calls a second undoable action wrapping `returnLoan` with the toast "Returned · Undo". The rows read People through a new `lib/people` function, most recently lent-to first.

## Boundaries & Constraints

**Always:**
- The picker follows EXPERIENCE.md → Loans → Lend (mock-up B, `ux-designs/ux-bookeh-2026-10-03/.working/lend-picker.html`):
  - One overlay: the Bottom sheet on the phone, the Dialog on wide screens. The form is taken at open and held, as `Picker` does (`useWide`, `heldWide`). One overlay deep.
  - Title "Lend", with "{title} · {location}" muted under it ("{title}" alone when the copy has no location).
  - Rows hold the first six People from `lendingPeople()`. A tap marks a row with the 8px marker (`aria-pressed`). Tapping the marked row again unmarks it. A tap never lends.
  - When the viewer has more than six People, a last row "Find a person…" swaps itself for the Person `Combobox` (`create={false}`, all People) in place, focused. A value chosen there is the Person, and no row is marked.
  - Under the rows a "New person" `TextField` (max `limits.name`). Typing a non-blank name clears the marked row and the Combobox value, and marking a row or choosing in the Combobox clears the field.
  - Then the Date field "Lent on": `<input type="date">` through `TextField`, defaulting to today in Helsinki, with `max` today.
  - **Lend** is the one primary button: full width at the sheet's foot, right of Cancel in the dialog (`Dialog`'s `confirm`, `form=`). It is disabled until a Person is marked, chosen or typed, and while the lend runs. Enter in the form lends.
- The person sent is a `Ref`: the marked or chosen Person's id, or `{ create: typed }`. `lendCopy` matches a typed name to an existing Person by `nameKey`. The picker never matches names.
- The picker stays open while the lend runs. On `ok` it closes and the toast "Lent to {person} · Undo" names `data.person.name` as stored. A failure with `fields.person` shows its message under New person, or under the Combobox when one is in use: `TOO_LONG` gives `errors.TOO_LONG`, anything else `loans.personRequired`. A failure with `fields.lentOn` shows `loans.lentOnInvalid` under the date. Both keep the picker open. Any other failure closes the picker and goes to `afterAction`.
- Every result that closes the picker goes to `afterAction`, which reloads the rows and refreshes Book detail. Focus then moves to the copies' `section`, as `MoveCopy` does.
- Book detail lines, by state:
  - **owned, no open loan:** Lend, then Move (when there are locations) and Remove. Lend comes first.
  - **owned with `loan`:** the line keeps its location chip. Under it, the 8px accent marker (`markerSlotClass bg-accent`, never a dot) before "Lent to {person} since {date}" in `text-text`. The only Link is Returned: no Lend, Move or Remove.
  - **ordered:** unchanged ("Ordered", Received), even if a loan is open (deferred from 6.6).
- `{date}` is `since` formatted by next-intl `format.dateTime` with `dateStyle: 'medium'`, parsed as `${since}T12:00:00Z` so the time zone never shifts the day. A borrower's name is never lowercased. In Finnish strings the name sits where it needs no inflection.
- Returned calls the return action with no date (today) and no picker. It is disabled while it runs. On `ok` the toast is "Returned · Undo". Every result goes to `afterAction`, then focus moves to the section.
- The actions live in `src/app/(frontend)/actions/loans.ts` (6.11 reuses return from `/loans`). Each is `runAction` + `requireUserOrThrow` + `withUndo(ctx, (tx) => …)`. Input is checked, never repaired: `copyId` and `loanId` must pass `isRowId`, `person` must pass `parseRef`, and `lentOn` must be absent or a string. Otherwise the result is `VALIDATION` with no write. The date check itself is `lendCopy`'s.
- `lendingPeople(ctx): Named[]` in `lib/people` lists every one of the viewer's People: those with a loan by their latest `lentOn`, newest first (ties by name), then those never lent to, by name. It filters on `owner` explicitly as well as through `ownerAccess`, so the admin gets only their own. It reads `loans` through the gateway (as `personUse` does) and imports no other service.
- Book detail reads `lendingPeople()` and `helsinkiToday()` itself, and only when some copy is owned and not lent. A failed People read logs and gives `[]`: the picker still offers New person.
- English and Finnish strings; tokens only; 44px tap areas on the phone (`max-wide:min-h-tap`); every control reachable by keyboard on wide screens.

**Never:**
- No change to `lib/loans`, the collections, migrations or `payload-types.ts`. No schema change.
- No lent marker on rows, tiles or the Answer (6.8). No `/loans` page (6.9), no "Lent before" (6.12), no People in Settings (6.13).
- No date picker for Returned. No Lend on an ordered copy. No fix to `setStatus` making a lent copy ordered.
- No client-side REST: the picker gets People from Book detail's props.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lend to a known Person | Owned copy, Antti marked, today | Loan opens; toast "Lent to Antti · Undo"; line shows marker "Lent to Antti since 26 Oct 2026" and Returned | — |
| Lend to a new name | "Liisa" typed, not in People | `{ create: 'Liisa' }` → Person created; toast names "Liisa" | — |
| Typed name exists | "antti" typed | Matched by `nameKey`; toast "Lent to Antti" | — |
| Earlier date | Date set to 24.10.2026 | Line says "since 24 Oct 2026" | — |
| Future date | Date past `max` (typed) | Picker stays open | `loans.lentOnInvalid` under the date |
| Name too long | 201+ characters typed | Picker stays open | `errors.TOO_LONG` under New person |
| Stale copy | Lent or removed elsewhere | Picker closes | `afterAction`: error toast, or refresh on `NOT_FOUND` |
| Undo lend | Undo on the toast | Loan deleted; line back to Lend, Move, Remove | `UNDO_FAILED` toast if the copy changed |
| Returned | Lent line, Returned tapped | Loan closed today; toast "Returned · Undo"; line back to owned | `afterAction` on failure |
| Undo returned | Undo on the toast | Loan reopened; lent line back | `UNDO_FAILED` if lent again |
| Bad input | `copyId: 'x'`, `person: { name }` | `VALIDATION`, no write | — |
| More than six People | 9 People | Six rows, then "Find a person…"; the Combobox lists all 9 | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx:113-145` -- the copy line. `status === 'owned'` renders `MoveCopy` and `RemoveCopy` (with `lent={loan !== null}`); `ordered` renders `ReceiveCopy`. Split owned into lent and not lent. `getHoldings` already returns `loan`. The header comment (`:27-49`) lists the line's Links: update it.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- `MoveCopy` (`:115-148`) shows the pattern for a Link plus picker: `useTransition`, a `link` ref, focusing `closest('section')`. `ReceiveCopy` (`:186-221`) shows an undoable Link: `settleAction`, `show({ kind:'success', message, undo:{ token, seconds } })`, `afterAction`. Add `LendCopy` and `ReturnLoan` here.
- `src/app/(frontend)/(sections)/MovePicker.tsx` and `components/ui/Picker.tsx` -- `useWide()` + `heldWide` held at open; `Sheet` (`label`, `onClosed`) holding an `h2.text-heading-group.ui-case`; `Dialog` (`title`, `confirm`, `onClosed`); row markup (`aria-pressed`, `markerSlotClass`, `max-wide:min-h-tap`). `Picker` closes on a choice, so the Lend picker is a new `LendPicker.tsx` built on `Sheet`/`Dialog` directly, not on `Picker`.
- `src/app/(frontend)/components/ui/Combobox.tsx` -- `{ label, options: {id,label}[], value: Ref|null, onValueChange, error, create }`. Use `create={false}`.
- `src/app/(frontend)/components/TextField.tsx:63` -- `TextField({ label, error, ...input props })`. Use it for both New person and `type="date"`.
- `src/app/(frontend)/(sections)/actions.ts:76-84` -- `receiveCopyAction` is the action shape. `src/app/(frontend)/ref.ts` has `parseRef`. The new file `src/app/(frontend)/actions/loans.ts` follows `actions/catalogue.ts`'s header style.
- `src/lib/loans/loans.ts` -- `lendCopy(ctx, copyId, person: Ref, lentOn?)` → `Undone<Lent>` (`Lent = { loanId, person: Named }`); `returnLoan(ctx, loanId, returnedOn?)` → `Undone<{ loanId }>`. Field keys: `person`, `lentOn`, `copy`, `loan`. Read-only.
- `src/lib/loans/dates.ts` -- `helsinkiToday()`. Read-only.
- `src/lib/people/people.ts:232-256` -- `personUse`, the pattern for `lendingPeople` (an own-filtered `people` read and a `loans` read with `select`, `depth: 0`, `pagination: false`). `Named` is declared locally.
- `src/lib/undo/undo.ts` -- `withUndo`, `Undoable`.
- `src/app/(frontend)/(sections)/ShelfRows.tsx:96-104` -- `afterAction`: a failure other than `NOT_FOUND` goes to `reportFailure`; `NOT_FOUND` toasts and refreshes; `ok` reloads and refreshes.
- `messages/en.json`, `messages/fi.json` -- namespaces `toast`, `detail`, `errors`, `overlay`. Add a `loans` namespace.
- `tests/int/peopleService.int.spec.ts` -- the People service suite (users, `lendCopy` to make loans): add the `lendingPeople` test here.
- `ARCHITECTURE-SPINE.md:512-513` -- the `// src/lib/people` Shared shapes line: add `lendingPeople`. `:247` -- the `lib/people` Binds list needs no change.

## Tasks & Acceptance

**Execution:**
- `src/lib/people/people.ts` -- add `lendingPeople(ctx): Promise<Named[]>` as described in Always, with a doc comment. Two reads, sorted in memory: People by name, then loans `select: { person, lentOn }`.
- `tests/int/peopleService.int.spec.ts` -- one test: A lends to Leena on 2026-10-01 and to Antti on 2026-10-20, and has a third Person "Bea" with no loan. B has People and loans too. A's `lendingPeople` is `[Antti, Leena, Bea]`. B's lists only B's People, and the admin's is `[]`.
- `src/app/(frontend)/actions/loans.ts` -- `lendCopyAction(input)` → `ActionResult<Undoable<Lent>>`; `returnLoanAction(input)` → `ActionResult<Undoable<{ loanId: number }>>`, as described in Always.
- `src/app/(frontend)/(sections)/LendPicker.tsx` -- the picker (client), with props `open`, `onOpenChange`, `context` (the muted line), `people: Named[]`, `today`, `copyId`, `startTransition`, `onSettled`. State: the marked id, the Combobox value, the typed name, the date and field errors. All of it resets at each open (to the date `today`).
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- `LendCopy` (a Link that opens `LendPicker`, disabled while pending) and `ReturnLoan` (a Link, as `ReceiveCopy` is).
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- read `lendingPeople` and `helsinkiToday` when needed. Render the three line states, and update the header comment.
- `messages/en.json`, `messages/fi.json` -- add `loans.lend`, `lendTitle`, `lentOnLabel`, `newPerson`, `findPerson`, `person`, `personRequired`, `lentOnInvalid`, `lentTo` ("Lent to {person} since {date}"), `returned`, and `toast.lent` ("Lent to {person}") and `toast.returned` ("Returned"). The Finnish names sit after a separator or colon: "Lainassa: {person} · {date} alkaen", "Lainattu: {person}" (the toast).
- `ARCHITECTURE-SPINE.md` -- extend the `// src/lib/people` line with `lendingPeople(ctx): Named[]` (by latest loan, then by name).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `6-7-j4-lend-and-returned-in-book-detail: done` when the story is done.

**Acceptance Criteria:**
- Given an owned copy with no open loan in Book detail, when I tap Lend, mark or type a Person, keep or change the date and confirm, then the copy is lent with the toast "Lent to {person} · Undo", and the line shows the 8px marker with "Lent to {person} since {date}" and Returned only.
- Given the Lend picker, when it opens, then it is a bottom sheet on the phone and a dialog on wide screens. It has the title "Lend" and the "{title} · {location}" line, up to six People rows (most recently lent-to first), "Find a person…" when there are more, the New person field and "Lent on" set to today. Lend stays disabled until a Person is given.
- Given a lent copy's line, when I tap Returned, then the loan closes today with "Returned · Undo", and Undo brings the lent line back.
- Given the toast after Lend, when I tap Undo, then the loan is gone and the line offers Lend, Move and Remove again.
- Given the phone, when Book detail is half open, then the first copy's Lend or Returned is visible and tappable without opening the sheet further.
- Given two users and the admin, when each calls `lendingPeople`, then each gets only their own People, ordered by latest loan and then by name.
- Given the spine, when this story merges, then the `lib/people` Shared shapes line names `lendingPeople`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 28 findings — high 0, medium 0, low 19, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` Intent: half-open sheet reach of Lend/Returned is not tested — jsdom cannot measure the sheet's half-open height; the copies group follows read and rating as in every earlier Book detail story. Left as a manual check under Residual risks.
  - `[low]` `[reject]` Intent: no test taps Undo on the Lend/Returned toasts — the restores are covered by 6.5's `loansService` tests (lend Undo deletes, return Undo reopens, `UNDO_FAILED` once lent again); the toast Undo mechanism is shared and tested in earlier stories. Test-only finding.
  - `[low]` `[reject]` Intent: Sheet vs Dialog choice not distinguished in tests — the `useWide`/`heldWide` pattern is `Picker`'s, already tested there. Test-only.
  - `[low]` `[reject]` Intent: the date reads "Oct 20, 2026", not the matrix example "26 Oct 2026" — the Always rule fixes the format (next-intl `dateStyle: 'medium'`), which the `en` locale renders US-style, as the backup date in Settings does; the matrix date was an illustration.
  - `[low]` `[patch]` Intent: the Combobox path behind "Find a person…" is not exercised — same root cause as the verification-gap Combobox row; patched there.
  - `[low]` `[reject]` Intent: `returnLoanAction` input check untested — test-only, no criterion names it.
  - `[low]` `[reject]` Intent: "Find a person…" shows only past six People, while EXPERIENCE.md shows it after the rows unconditionally — the spec's Design Notes record this as a veto point for Mika; the fix would edit the spec. Raised to Mika in the run summary.
  - `[false]` `[reject]` Intent: R1 asks for a Person combobox, the diff offers rows — the recorded pick (mock-up B, EXPERIENCE.md → Loans → Lend) supersedes the epics wording.
  - `[false]` `[reject]` Intent: the one-copy Remove dialog loses its "its loans go too" line — a lent line no longer offers Remove (Mika, 2026-10-26), so the line could never show; select mode's bulk dialog keeps it.
  - `[false]` `[reject]` Intent: `epic-6-context.md` is modified outside the diff — it is this run's recompiled epic context (EXPERIENCE.md changed), committed with the story as in 6.6.
  - `[low]` `[patch]` Verification gap: `lendCopyAction`'s success path is never run, so a dropped `lentOn` or person would pass — added "lends to a named Person on the given date, with a receipt" to `loansAction.int.spec.ts`.
  - `[low]` `[reject]` Verification gap: typing a name after marking a row is not tested — names a Boundaries rule, not a criterion (CLAUDE.md, Tests).
  - `[low]` `[patch]` Verification gap: "Find a person…" and the Combobox over all People are not exercised (matrix row "More than six People") — added "finds any of the People in the Combobox and lends to the one chosen".
  - `[low]` `[patch]` Verification gap: `lendingPeople`'s latest-loan rule is tested with one loan per Person — Antti now has a second, older loan created after the newer one, so only the newest date gives the expected order.
  - `[low]` `[reject]` Verification gap: the People read failure fallback is untested — a Boundaries rule; test-only.
  - `[low]` `[defer]` Edge: `today` fixed at server render goes stale past Helsinki midnight — the client-side fix fails lint `bookeh/client-lib-imports`; needs an allowlist and spine change. Added to `deferred`.
  - `[low]` `[reject]` Edge: a marked Person deleted elsewhere shows "Name a person." under the empty New person field — needs a delete in another tab (People delete arrives in 6.13) during an open picker; the fix adds a branch.
  - `[low]` `[reject]` Edge: a field error after the picker was closed mid-lend reaches `afterAction` as a generic toast — needs a cancel during the request plus a field error; the toast is accurate if terse.
  - `[low]` `[reject]` Blind: marked Person deleted elsewhere loops on the wrong error — same as the Edge row; rejected there.
  - `[low]` `[reject]` Blind: a copy lent or ordered elsewhere toasts without refreshing the line — matches the matrix's Stale copy row (`afterAction`: error toast); the next action or navigation refreshes. Changing `afterAction` is shared behaviour.
  - `[low]` `[reject]` Blind: Returned on a loan closed elsewhere toasts without refreshing — same reasoning; `NOT_FOUND` does refresh.
  - `[false]` `[reject]` Blind: `sprint-status.yaml` not updated — finalization sets it and commits it with the diff.
  - `[low]` `[reject]` Blind: date format differs from the spec example — same as the Intent date row.
  - `[low]` `[patch]` Blind: clearing "Lent on" leaves Lend enabled and shows the wrong message; `today` goes stale — Lend is now disabled while the date is empty (`blocked`); the stale `today` part is the deferred Edge row.
  - `[false]` `[reject]` Blind: a cancelled lend can toast a bare error — same as the Edge row; rejected there (counted false here: the toast reports a real failure of a request the user sent).
  - `[false]` `[reject]` Blind: `lendingPeople` reads the whole loan history — one user's loans are a few hundred rows at most; `sort: '-lentOn'` would still read them all. No harm named.
  - `[low]` `[patch]` Blind: the date error is a verbless fragment — en "Can't be later than today.", fi "Ei voi olla tulevaisuudessa."; test updated.
  - `[false]` `[reject]` Blind: `fieldsOf` adds a third input-check style — it is the same inline check, named once because two actions in the file use it; no caller diverges.

## Design Notes

**Why a new `lendingPeople`, not `personUse`.** The picker's order is most recently lent-to, while `personUse` is by name for Settings, and 6.13 and Epic 7 extend `personUse`'s counts. One more read in `lib/people` keeps both shapes plain.

**"Find a person…" only past six.** The mock-up shows it beside three rows. With six People or fewer every Person already has a row, and the row would open a Combobox holding the same names. This is a veto point for Mika, and showing it always is a one-line change.

**Lend keeps the picker open.** `Picker` closes before it acts. Lend has field errors a user can fix (a date, a long name), so `LendPicker` waits for the result and closes only on `ok` or an error it cannot show in a field.

```tsx
const person: Ref | null = marked ?? found ?? (typed.trim() ? { create: typed } : null)
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `peopleService.int.spec.ts`.

**Manual checks (if no CLI):**
- Run the dev server and open a Book on the phone width (≈390px) and wide. Lend to a marked Person, then to a new name, then Undo. Mark Returned, then Undo. Check that the half-open sheet shows Lend or Returned, and check dark theme.

## Auto Run Result

**Summary.** Book detail now lends and returns. An owned, unlent copy's line offers Lend, Move and Remove. Lend opens the picker Mika picked (mock-up B): a bottom sheet on the phone or a dialog on wide screens. It shows up to six People, most recently lent-to first. Past six, "Find a person…" opens the Person Combobox. Under the rows are a New person field and "Lent on", which defaults to today. Lend sends the loan through `lendCopyAction` (with Undo) and toasts "Lent to {person} · Undo". A lent line keeps its location and shows the 8px marker with "Lent to {person} since {date}". Its only Link is Returned, which closes the loan today with "Returned · Undo". The picker's order comes from a new `lendingPeople()` in `lib/people`.

**Files changed.**
- `src/lib/people/people.ts` -- `lendingPeople(ctx)`: own People by latest `lentOn`, then by name.
- `src/app/(frontend)/actions/loans.ts` -- new: `lendCopyAction`, `returnLoanAction` (input checked, `withUndo`).
- `src/app/(frontend)/(sections)/LendPicker.tsx` -- new: the Lend picker.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- `LendCopy` and `ReturnLoan`. `RemoveCopy` drops its `lent` prop, since a lent line has no Remove.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- the three line states. It reads People and today only when a copy can be lent.
- `messages/en.json`, `messages/fi.json` -- the `loans` namespace, plus `toast.lent` and `toast.returned`.
- `tests/int/peopleService.int.spec.ts` -- `lendingPeople` order and isolation (two users, the admin).
- `tests/int/loansAction.int.spec.ts` -- new: `VALIDATION` on bad input, and a lend with a typed name and a date.
- `tests/unit/collectionPage.unit.spec.ts` -- picker contents and the lend, the Combobox past six, typed names and field errors, Returned, and the lent line.
- `ARCHITECTURE-SPINE.md` -- `lendingPeople` in Shared shapes and the source tree.
- `_bmad-output/implementation-artifacts/epic-6-context.md` -- recompiled after the Lend picker pick.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 6.7 done.

**Review.** One pass found 28 findings: 19 low, 9 false.

Six entries were patched (low):
- the action's success path is tested;
- the Combobox past six is tested;
- `lendingPeople` is tested on the latest of several loans;
- Lend is disabled while the date is empty;
- the date error is reworded in English and Finnish;
- the Intent Combobox row shares the second fix.

One item is deferred (low): the default date is fixed at server render.

Rejected, with the reasons in the triage log:
- test-only requests (half-open reach, toast Undo, Sheet/Dialog, the return input, typing after marking, the People-failure fallback);
- the date format, which follows the Always rule;
- stale-screen refreshes, which match the matrix's Stale copy row;
- rare races (a Person deleted mid-picker, a cancel during a request);
- the full loan read and the `fieldsOf` style;
- "Find a person…" only past six, a veto point for Mika.

**Follow-up review:** not recommended (`false`). Patched this pass: high 0, medium 0, low 6.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. The 48 warnings are in existing migrations.
- `npm run test:unit`: 935 passed.
- `npm run test:reset && npm run test:int`: 596 passed in 71 files.
- Matrix audit: the service rows (known Person, new name, typed name matched, earlier date, future date, too long, stale copy, both Undos) are covered by 6.5's `loansService.int.spec.ts` and `peopleService` tests. The UI rows (lend and toast, typed name, field errors, Returned, more than six with the Combobox) are covered by the new `collectionPage` tests. Bad input is covered by `loansAction.int.spec.ts`. All of them ran and passed.
- No schema change, so no migration or production-dump check.
- Not run in a browser.

**Residual risks.**
- **Not checked in a browser.** The manual checks are still open: phone and wide, the half-open sheet showing Lend or Returned, dark theme, and focus after a lend (it relies on Base UI's focus return).
- **"Find a person…" appears only past six People.** EXPERIENCE.md shows it after the rows unconditionally. This is a veto point for Mika; showing it always is a one-line change in `LendPicker.tsx`.
- **A stale screen keeps a stale line.** A copy lent or ordered elsewhere, or a loan returned elsewhere, gets an error toast without a refresh. A stale unlent line can still remove a copy that was lent in another tab, loans included.
- **Flaky Move tests.** Two Move tests in `collectionPage.unit.spec.ts` time out now and then under full-suite load (`findByRole` at 1 s). This predates 6.7: the baseline failed 2 of 8 runs.
- **Shared files with the parallel 6.13 worktree.** The `story-6-13-people-in-settings` worktree likely edits `src/lib/people/people.ts`, the `lib/people` lines in `ARCHITECTURE-SPINE.md`, and the message files, so expect a merge overlap.
