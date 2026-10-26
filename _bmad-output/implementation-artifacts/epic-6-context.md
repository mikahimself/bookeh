# Epic 6 Context: Lend books and see who has them

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Answer "who has it?" from the phone. Mika keeps a private People list, lends an owned copy from Book detail and marks it Returned, both with Undo. Lent copies carry a marker with the borrower's name on collection rows, tiles, Book detail and the Answer. The Loans section at `/loans` lists what is out, by person or by date, with returned loans below, and Book detail shows "Lent before". People are renamed, merged and deleted in Settings. The data layer comes first (`people`, `loans`, the People service, loans removed with their copy, lend and return, loans in holdings); the screens build on it.

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

- **`people` (built, 6.1):** `ownerField()`, `nameKeyField()`, `name`, unique `(owner, nameKey)`. Read, update and delete are `owner = current user` for every role, admin included.
- **`loans` (built, 6.2):** `ownerField()`; `copy` and `person` are required `ownedRelation`s (foreign ids rejected). `lentOn` / `returnedOn` are calendar dates: sent as `YYYY-MM-DD`, a field hook stores any value at 12:00 UTC of its UTC date, read back by the UTC date (`value.slice(0, 10)`; the read-back helper belongs to the first story that reads a loan date, 6.6). `returnedOn` is empty while open. A collection hook already rejects `returnedOn` before `lentOn` on path `returnedOn`. "One open loan per copy" is the partial unique index `loans_copy_open_idx` on `copy_id` where `returned_on is null`; its violation surfaces as a `ValidationError` on path `copy_id`, so 6.5's service must check first and raise its own `DomainError`. 6.5 adds only the future-lending-date and owned-copy checks.
- **`lib/people` (built, 6.3):** the only code that matches, creates, renames, merges and deletes People; imports no other service. Exports `resolvePerson(ctx, ref)`, `createPerson`, `renamePerson`, `mergePerson`, `deletePerson`, `personUse`.
  - A `Ref` is an id or `{ create: name }`. An id must be the viewer's own (else `VALIDATION` on `person`); a name matches by `nameKey` or creates. It resolves on the caller's context, inside the action's transaction; a Person created this way stays after Undo.
  - Renaming onto an existing `nameKey` fails `NAME_TAKEN` with `conflictId`; a case-only rename is allowed. "Add person" by name (`createPerson`) fails the same way; only a `Ref` matches.
  - Merge moves every loan to the target and deletes the source, in one transaction. Delete with any loan fails `PERSON_IN_USE` (already in `ErrorCode`, with en/fi strings).
  - `personUse(ctx)` returns `PersonUse[]` (`Named & { loans: number }`), every Person by name. Epic 7 adds entries.
- **`lib/loans` (6.5):** `lendCopy(ctx, copyId, person: Ref, lentOn)` and `returnLoan(ctx, loanId, returnedOn?)`; may import `copies` and `people`; the only writer of `loans`. Undoable in the `lib/undo` pattern: take a context, open no transaction, return `Undone<T>`; the action wraps its one call in `withUndo`. Lend's restore deletes the loan; return's restore reopens it. Integration tests undo both.
- **Copy removal (6.4):** `removeCopies` deletes the removed copies' loans, open and returned, in the same transaction, through the gateway; `copies` does not import `loans`. Bulk remove still skips ordered copies. Until 6.4, removing a copy with a loan fails on the FK.
- **Save Undo:** undoing a save once its copy has a loan fails `UNDO_FAILED` and changes nothing (the rule is in the spine; 6.5 tests it).
- **Holdings (6.6):** `getHoldings` fills `CopyLine.loan` as `{ loanId, person: Named, since }` for an open loan, else `null`. Rows, Book detail and the Answer read loans only from here. Two-user test.
- **Loans list:** not a shelf query. Hydrates Books through `getEffectiveBooks()`, never sorts or filters on Book fields; order comes from loan dates. `?book=<bookId>` on `/loans` renders the same Book detail server component, gated by `requireOwnBook()`.
- **Loans order** (by person / by date) is a device preference in the `bookeh_prefs` cookie, read by `devicePrefs()` at render; never on the profile.
- **Server actions:** ids validated with `isRowId()`; body in `runAction()` returning `ActionResult` (with `undoToken`/`undoSeconds` when undoable). An action used from several pages lives in `src/app/(frontend)/actions/<domain>.ts`. Actions on the collection report through `afterAction(result)` and never patch rows locally.
- **Input and overlays:** a typed Person name is trimmed, NFC-normalised and whitespace-collapsed at the boundary; over its limit is `TOO_LONG`. Pickers, dialogs and the combobox come from the `components/ui` Base UI wrappers.

## UX & Interaction Patterns

- **Lend picker (6.7):** starts with Mika choosing among rendered mock-ups, recorded in EXPERIENCE.md before the screen is built. Person combobox (existing or new), the platform date field (today by default) and the confirm in one overlay: bottom sheet on the phone, dialog on wide screens, one overlay deep.
- **Book detail copy lines:** owned — Lend, Move, Remove; lent — the lent marker with "Lent to {person} since {date}", and Returned; ordered — "Ordered" and Received. Lend and Returned are reachable in the half-open sheet. "Lent before" lists the Book's closed loans newest first as "{person} · {from} to {to}"; absent when none.
- **Lent marker:** an 8px accent square (never a dot), always with its text in the normal text colour. A row ends with "Lent · {person}" in place of the location; a tile has the marker before its title; the Answer's copy line shows the same.
- **Covers:** use the shared `Cover` component (frame and cloth placeholder already built). Cloth colours are cover art and never mark loan state.
- **Removal dialog:** when any copy being removed is lent, the dialog adds that its loans go too, for one copy and for a selection.
- **Loans section:** a by person / by date text switch. By date: one list, longest out first, rows show the copy (cover, title, author) and "{person} · since {date}". By person: borrower's name as typed heads each group, rows show "Since {date}". Returned group below the open loans in both orders, newest first, "{person} · {from} to {to}". A Returned Link on an open row closes the loan today and moves it to the returned group. Tapping a row opens Book detail on `/loans`; a Filter chip there opens the collection with only that filter.
- **States:** "Nothing lent" with "Either everyone returns things or nobody asks."; returned loans still show below. Load failure: "Couldn't load. Try again." with a retry Link.
- **Toasts:** "Lent to {person} · Undo" and "Returned · Undo".
- **Settings, People group:** each Person a List row with its use ("2 loans") and Rename, Merge, Delete (second line on the phone). "Add person" opens an empty name field in place at the top; Enter or blur saves, empty is dropped, a name in use is rejected under the field. Renaming onto a name in use offers a merge; Merge is confirmed by a dialog. Deleting a Person with loans says they can't be deleted and offers Merge.
- **Names:** a borrower's name is never lowercased, even as a heading. In Finnish strings a typed name goes where it needs no inflection, such as after a separator.

## Cross-Story Dependencies

- **Status:** 6.1–6.3 done; 6.4–6.13 backlog. Epic 5 (Book detail, select mode, Settings, collection rows) and the cover frame / cloth placeholder are done.
- **Order:** 6.4 needs 6.2. 6.5 needs 6.2 and 6.3. 6.6 needs 6.2. 6.7 and 6.12 need 6.5 (and 6.6 for the copy-line loan). 6.8 needs 6.5 and 6.6. 6.9 needs 6.5; 6.10 and 6.11 extend 6.9. 6.13 needs 6.3.
- **6.9 owns** the deferred 5.21 clause: a chip in Book detail opened from `/loans` opens the collection with only that filter.
- **Epic 7 extends** People: wishlist entries join `PERSON_IN_USE`, merge and `personUse`, and entries carry a "for" Person resolved through `lib/people`.
- **Spine edits are acceptance criteria:** a story that changes a contract (a new `ErrorCode`, a `CopyLine` change, new `lib/loans` types) updates ARCHITECTURE-SPINE.md in the same commit.
