# Epic 6 Context: Lend books and see who has them

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Answer "who has it?" from the phone. Mika keeps a private People list, lends an owned copy from Book detail and marks it Returned, both with Undo. Lent copies carry a marker with the borrower's name on collection rows, tiles, Book detail and the Answer. The Loans section at `/loans` lists what is out, by person or by date, with returned loans below, and Book detail shows "Lent before". People are renamed, merged and deleted in Settings. The data layer is built (`people`, `loans`, the People service, loans removed with their copy, lend and return, loans in holdings), and Book detail lends and returns (6.7); what remains is the lent marker on rows and the Answer, the Loans section, Lent before and People in Settings.

## Stories

- Story 6.1: [J1] `people` collection
- Story 6.2: [J2] `loans` collection
- Story 6.3: [J7] People service
- Story 6.4: [J6] Removing a copy removes its loans
- Story 6.5: [J3] Lend and return
- Story 6.6: [J10] Loans in holdings
- Story 6.7: [J4] Lend and Returned in Book detail
- Story 6.8: [J11] Lent marker on rows and the Answer
- Story 6.9: [J5] Loans section by date
- Story 6.10: [J12] Loans by person
- Story 6.11: [J13] Returned loans
- Story 6.12: [J9] Lent before
- Story 6.13: [J8] People in Settings

## Requirements & Constraints

- People are private per user and are not user accounts. People and loans are never visible to anyone else, the admin included, and never part of an open collection.
- Only an owned copy can be lent; a copy has at most one open loan. A lent copy keeps its location: a loan is never a location or a copy status.
- Returned closes the loan and keeps the row as history.
- Lending and return dates default to today in `Europe/Helsinki`. A lending date in the future, or a return date before the lending date, is a field error.
- People can be renamed and merged. A Person with any loan, open or returned, cannot be deleted (Epic 7 adds wishlist entries to this rule).
- Lend and Returned have Undo. Removals, deletes and merges are confirmed and have no Undo.
- Every story ships English and Finnish strings, uses tokens only, gives 44px tap areas on the phone and keyboard reach on wide screens.
- A schema change is verified against a restored production dump before merge. Tests only where an acceptance criterion or a spine rule names the behaviour (access, transactions, Undo, migrations).

## Technical Decisions

- **`people` / `loans` (built):** both owner-scoped for every role, admin included. `people` has `name` + `nameKey`, unique per owner. `loans.copy` and `loans.person` are required owned relations; one open loan per copy is a partial unique index (`returned_on is null`).
- **Loan dates:** calendar dates sent as `YYYY-MM-DD`, stored at 12:00 UTC, read back by their UTC date (`slice(0, 10)`). `lib/loans/dates.ts` has `helsinkiToday()` and `isCalendarDate()`. Show dates with next-intl `format.dateTime` (`dateStyle: 'medium'`), parsing `${date}T12:00:00Z` so the day never shifts.
- **`lib/people` (built):** the only code that matches, creates, renames, merges and deletes People; imports no other service. `createPerson` and `renamePerson` fail `NAME_TAKEN` with `conflictId` on a name in use (case-only rename allowed); `mergePerson` moves every loan and deletes the source in one transaction; `deletePerson` with any loan fails `PERSON_IN_USE`. `personUse(ctx)` gives `Named & { loans }` by name (Settings); `lendingPeople(ctx)` gives `Named[]` by latest loan (Lend picker).
- **`lib/loans` and actions (built):** `lendCopy` / `returnLoan` are the only loan writers besides merge and copy removal; both are undoable. `lendCopyAction` and `returnLoanAction` in `src/app/(frontend)/actions/loans.ts` wrap them in `withUndo`; 6.11 reuses `returnLoanAction`. A loan already returned is `VALIDATION` on `loan`; bad or foreign ids are `NOT_FOUND`.
- **Holdings (built):** `getHoldings` fills `CopyLine.loan` as `{ loanId, person: Named, since }` for an open loan, else `null`; returned loans never appear there. Rows, Book detail, removal dialogs and the Answer read loan state only from here. "Lent before" and the returned group need their own read of closed loans.
- **Loans list:** not a shelf query. Hydrates Books through `getEffectiveBooks()`, never sorts or filters on Book fields; order comes from loan dates. `?book=<bookId>` on `/loans` renders the same Book detail server component, gated by `requireOwnBook()`.
- **Loans order** (by person / by date) is a device preference in the `bookeh_prefs` cookie, read by `devicePrefs()` at render; never on the profile.
- **Server actions:** ids validated with `isRowId()`; body in `runAction()` returning `ActionResult` (with `undoToken`/`undoSeconds` when undoable). An action used from several pages lives in `src/app/(frontend)/actions/<domain>.ts`. Actions on the collection report through `afterAction(result)` and never patch rows locally.
- **Input and overlays:** a typed Person name is trimmed, NFC-normalised and whitespace-collapsed at the boundary; over its limit is `TOO_LONG`. Pickers, dialogs and the combobox come from the `components/ui` Base UI wrappers.

## UX & Interaction Patterns

- **Book detail copy lines (built in 6.7):** owned has Lend, Move, Remove; lent has the marker with "Lent to {person} since {date}" and only Returned (a Link, no picker, closes today); ordered has "Ordered" and Received. Lend opens the Lend picker (mock-up B, recorded in EXPERIENCE.md).
- **Lent before:** the Book's closed loans newest first as "{person} · {from} to {to}"; absent when none.
- **Lent marker:** an 8px accent square (never a dot), always with its text in the normal text colour. A row ends with "Lent · {person}" in place of the location; a tile has the marker before its title; the Answer's copy line shows the same. Cover cloth colours are cover art and never mark loan state.
- **Loans section:** a by person / by date text switch. By date: one list, longest out first, rows show the copy (cover, title, author) and "{person} · since {date}". By person: borrower's name as typed heads each group, rows show "Since {date}". Returned group below the open loans in both orders, newest first, "{person} · {from} to {to}". A Returned Link on an open row closes the loan today and moves it to the returned group. Tapping a row opens Book detail on `/loans`; a Filter chip there opens the collection with only that filter.
- **States:** "Nothing lent" with "Either everyone returns things or nobody asks."; returned loans still show below. Load failure: "Couldn't load. Try again." with a retry Link.
- **Toasts:** "Lent to {person} · Undo" and "Returned · Undo".
- **Settings, People group:** each Person a List row with its use ("2 loans") and Rename, Merge, Delete (second line on the phone). "Add person" opens an empty name field in place at the top; Enter or blur saves, empty is dropped, a name in use is rejected under the field. Renaming onto a name in use offers a merge; Merge is confirmed by a dialog. Deleting a Person with loans says they can't be deleted and offers Merge.
- **Names:** a borrower's name is never lowercased, even as a heading. In Finnish strings a typed name goes where it needs no inflection, such as after a separator.

## Cross-Story Dependencies

- **Status:** 6.1–6.7 done; 6.8–6.13 backlog. Epic 5 (Book detail, select mode, Settings, collection rows) and the cover frame / cloth placeholder are done.
- **Order:** 6.6 supplies the lent state everywhere (rows, Book detail, dialogs, Answer); 6.7 supplies the lend/return actions and the lent copy line in Book detail. 6.8, 6.9 and 6.12 build on holdings; 6.10 and 6.11 extend 6.9 (6.11 reuses 6.7's return action). 6.13 needs only `lib/people`.
- **6.9 owns** the deferred 5.21 clause: a chip in Book detail opened from `/loans` opens the collection with only that filter. `FilterChip` today builds on the current address's query, right only on `/`; off `/` it must start from an empty query and go to `/`.
- **Known open items:** deleting a copy with loans in Payload admin fails on the `loans.copy_id` foreign key (deferred from 6.4). `setStatus` can still turn a lent copy into ordered (rejected in 6.5, not scheduled). The Lend picker's `today` is fixed at server render and goes stale past Helsinki midnight (deferred from 6.7; the client fix needs a lint allowlist and spine change).
- **Epic 7 extends** People: wishlist entries join `PERSON_IN_USE`, merge and `personUse`, and entries carry a "for" Person resolved through `lib/people`.
- **Spine edits are acceptance criteria:** a story that changes a contract (a new `ErrorCode`, a `CopyLine` change, new `lib/loans` types or functions) updates ARCHITECTURE-SPINE.md in the same commit.
