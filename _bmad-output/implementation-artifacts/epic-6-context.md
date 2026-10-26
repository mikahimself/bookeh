# Epic 6 Context: Lend books and see who has them

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Answer "who has it?" from the phone. Mika keeps a private People list, lends an owned copy from Book detail and marks it Returned, both with Undo. Lent copies carry a marker with the borrower's name on collection rows, tiles, Book detail and the Answer. The Loans section at `/loans` lists what is out, by person or by date, with returned loans below, and Book detail shows "Lent before". People are renamed, merged and deleted in Settings. The data layer is built (`people`, `loans`, the People service, loans removed with their copy, lend and return, loans in holdings); what remains is the screens on top of it.

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

- **`people` / `loans` (built):** both `ownerField()`; read, update and delete are `owner = current user` for every role, admin included. `people` has `name` + `nameKeyField()`, unique `(owner, nameKey)`. `loans.copy` and `loans.person` are required `ownedRelation`s. "One open loan per copy" is the partial unique index on `copy_id` where `returned_on is null`.
- **Loan dates:** a calendar date, sent as `YYYY-MM-DD`, stored at 12:00 UTC, read back by its UTC date. `lib/loans/dates.ts` holds `helsinkiToday()` and `isCalendarDate()`; the read-back is the stored value's UTC date (`slice(0, 10)`), done inline in `getHoldings` (6.6) and `returnLoan`, with no shared helper. Shown dates are formatted by `next-intl` (time zone set once).
- **`lib/people` (built):** the only code that matches, creates, renames, merges and deletes People; imports no other service. `resolvePerson(ctx, ref)` takes an id (must be the viewer's, else `VALIDATION` on `person`) or `{ create: name }` (matches by `nameKey` or creates, inside the caller's transaction; stays after Undo). `createPerson` ("Add person") and `renamePerson` fail `NAME_TAKEN` with `conflictId` on a name in use; a case-only rename is allowed. `mergePerson` moves every loan and deletes the source in one transaction; `deletePerson` with any loan fails `PERSON_IN_USE`. `personUse(ctx): PersonUse[]` (`Named & { loans }`), by name.
- **`lib/loans` (built):** the only writer of `loans` (besides People merge and copy removal); may import `copies` and `people`. `lendCopy(ctx, copyId, person: Ref, lentOn?): Undone<Lent>` with `Lent = { loanId; person: Named }`; `returnLoan(ctx, loanId, returnedOn?): Undone<{ loanId }>`. Both are undoable: the action wraps its one call in `withUndo`. Field keys for the picker: `person`, `lentOn`, `returnedOn`; an ordered or already-lent copy (a stale screen) is `VALIDATION` on `copy`, an already-returned loan on `loan`; bad, gone or foreign ids are `NOT_FOUND`. Lend's restore deletes the loan; return's restore reopens it (and fails `UNDO_FAILED` if the copy was lent again).
- **Copy restores and loans (built):** a save's Undo fails `UNDO_FAILED` once the copy has any loan; a Received Undo fails on an open loan.
- **Copy removal (built):** `removeCopies` deletes the removed copies' loans, open and returned, in the same transaction; bulk remove still skips ordered copies. Both removal dialogs already add the "its loans go too" line, reading lent state from `CopyLine.loan` (inert until 6.6 fills it; select mode records lent state when a copy is ticked).
- **Holdings (built):** `getHoldings` fills `CopyLine.loan` as `{ loanId, person: Named, since }` for an open loan (`since` as `YYYY-MM-DD`), else `null`; returned loans never appear there. Rows, Book detail, removal dialogs and the Answer read loans only from here. Two-user test.
- **Loans list:** not a shelf query. Hydrates Books through `getEffectiveBooks()`, never sorts or filters on Book fields; order comes from loan dates. `?book=<bookId>` on `/loans` renders the same Book detail server component, gated by `requireOwnBook()`.
- **Loans order** (by person / by date) is a device preference in the `bookeh_prefs` cookie, read by `devicePrefs()` at render; never on the profile.
- **Server actions:** ids validated with `isRowId()`; body in `runAction()` returning `ActionResult` (with `undoToken`/`undoSeconds` when undoable). An action used from several pages lives in `src/app/(frontend)/actions/<domain>.ts`. Actions on the collection report through `afterAction(result)` and never patch rows locally.
- **Input and overlays:** a typed Person name is trimmed, NFC-normalised and whitespace-collapsed at the boundary; over its limit is `TOO_LONG`. Pickers, dialogs and the combobox come from the `components/ui` Base UI wrappers.

## UX & Interaction Patterns

- **Lend picker (6.7, picked: mock-up B, `ux-designs/ux-bookeh-2026-10-03/.working/lend-picker.html`):** one Picker (bottom sheet on the phone, dialog on wide screens, one overlay deep) holds Person, date and the confirm, and does not close on a choice. Title "Lend" with "{title} · {location}" muted under it. People as rows, most recently lent-to first, at most six, then a "Find a person…" row that opens the Person Combobox in place. Tapping a row marks it with the 8px marker and does not lend. Under the rows a "New person" Text field (existing or new); typing clears the row's marker, marking a row clears the field. Then the Date field "Lent on", today by default. Lend (primary; full width on the phone, right of Cancel in the dialog) is disabled until a Person is marked or typed. The built `personUse` orders by name, so the recency order needs its own read.
- **Returned** on a lent line is a Link with no picker: it closes the loan today.
- **Book detail copy lines:** owned — Lend, Move, Remove; lent — the lent marker with "Lent to {person} since {date}", and Returned only (no Move or Remove; select-mode Remove still takes a lent copy and its loans); ordered — "Ordered" and Received. Lend and Returned are reachable in the half-open sheet. "Lent before" lists the Book's closed loans newest first as "{person} · {from} to {to}"; absent when none.
- **Lent marker:** an 8px accent square (never a dot), always with its text in the normal text colour. A row ends with "Lent · {person}" in place of the location; a tile has the marker before its title; the Answer's copy line shows the same. Cover cloth colours are cover art and never mark loan state.
- **Loans section:** a by person / by date text switch. By date: one list, longest out first, rows show the copy (cover, title, author) and "{person} · since {date}". By person: borrower's name as typed heads each group, rows show "Since {date}". Returned group below the open loans in both orders, newest first, "{person} · {from} to {to}". A Returned Link on an open row closes the loan today and moves it to the returned group. Tapping a row opens Book detail on `/loans`; a Filter chip there opens the collection with only that filter.
- **States:** "Nothing lent" with "Either everyone returns things or nobody asks."; returned loans still show below. Load failure: "Couldn't load. Try again." with a retry Link.
- **Toasts:** "Lent to {person} · Undo" and "Returned · Undo".
- **Settings, People group:** each Person a List row with its use ("2 loans") and Rename, Merge, Delete (second line on the phone). "Add person" opens an empty name field in place at the top; Enter or blur saves, empty is dropped, a name in use is rejected under the field. Renaming onto a name in use offers a merge; Merge is confirmed by a dialog. Deleting a Person with loans says they can't be deleted and offers Merge.
- **Names:** a borrower's name is never lowercased, even as a heading. In Finnish strings a typed name goes where it needs no inflection, such as after a separator.

## Cross-Story Dependencies

- **Status:** 6.1–6.6 done; 6.7–6.13 backlog. Epic 5 (Book detail, select mode, Settings, collection rows) and the cover frame / cloth placeholder are done.
- **Order:** 6.6 (done) supplies the lent state everywhere (rows, Book detail, dialogs, Answer). 6.7 adds the lend/return actions wrapping `lib/loans` in `withUndo`. 6.8, 6.9 and 6.12 build on holdings; 6.10 and 6.11 extend 6.9 (6.11 reuses 6.7's return action). 6.13 needs only `lib/people`.
- **6.9 owns** the deferred 5.21 clause: a chip in Book detail opened from `/loans` opens the collection with only that filter.
- **Known open items:** deleting a copy with loans in Payload admin fails on the `loans.copy_id` foreign key (deferred from 6.4). `setStatus` can still turn a lent copy into ordered (rejected in 6.5, not scheduled).
- **Epic 7 extends** People: wishlist entries join `PERSON_IN_USE`, merge and `personUse`, and entries carry a "for" Person resolved through `lib/people`.
- **Spine edits are acceptance criteria:** a story that changes a contract (a new `ErrorCode`, a `CopyLine` change, new `lib/loans` types or functions) updates ARCHITECTURE-SPINE.md in the same commit.
