# Epic 6 Context: Lend books and see who has them

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Answer "who has it?" from the phone. Mika keeps a private People list, lends an owned copy from Book detail and marks it Returned, both with Undo. Lent copies carry a marker with the borrower's name on collection rows, tiles, Book detail and the Answer. The Loans section at `/loans` lists what is out, by person or by date, with returned loans below, and Book detail shows "Lent before". People are renamed, merged and deleted in Settings. The data comes first: the `people` and `loans` collections, the People service, loans removed with their copy, lend and return services, and loans in holdings. The screens build on that.

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

- People are private per user and are not user accounts. People and loans are never visible to anyone else, the admin included, and are never part of an open collection.
- Only an owned copy can be lent, and a copy has at most one open loan. A lent copy keeps its location: a loan is never a location or a copy status.
- Returned closes the loan and keeps the row as history.
- The lending date and the return date both default to today in `Europe/Helsinki`. A lending date in the future, or a return date before the lending date, is a field error.
- People can be renamed and merged. A Person with any loan, open or returned, cannot be deleted. Epic 7 adds wishlist entries to this rule.
- Lend and Returned have Undo. Removals, deletes and merges are confirmed and have no Undo.
- Every story ships English and Finnish strings, uses tokens only, gives 44px tap areas on the phone and keyboard reach on wide screens.
- A schema change is verified against a restored production dump before merge. Add a test only where an acceptance criterion or a spine rule names the behaviour (access, transactions, Undo, migrations).

## Technical Decisions

- **`people`:** has `ownerField()` and `nameKeyField()`, with `name` and a database-unique `(owner, nameKey)`. Read, update and delete are `owner = current user` for every role, admin included. It ships a two-user access test.
- **`loans`:** has `ownerField()`. `copy` and `person` are `ownedRelation`s, so their validation re-reads the target and rejects foreign ids. `lentOn` and `returnedOn` are calendar dates: sent as `YYYY-MM-DD`, stored at 12:00 UTC and read back by their UTC date. `returnedOn` is empty while the loan is open. "One open loan per copy" is a partial unique constraint on `loans(copy)` where `returnedOn` is null, present from the table's first migration. A service check for the same rule exists only to raise a `DomainError` first. The access test uses foreign ids. Built in 6.2: a field hook stores any date at 12:00 UTC of its UTC date, the index is `loans_copy_open_idx` (its unique violation surfaces on path `copy_id`, not `copy`), and a collection hook already rejects a `returnedOn` before `lentOn` on path `returnedOn`; 6.5 adds only the future-lending-date and owned-copy checks.
- **Schema stories** (6.1, 6.2) merge one at a time. Each commits its migration and the regenerated `payload-types.ts`, and regenerates its migration after a rebase.
- **`lib/people`** is the only code that matches, creates, renames, merges and deletes People, and it imports no other service.
  - A Person `Ref` is an id (checked) or `{ create: name }`, which matches by `nameKey` or creates. It resolves inside the action's transaction.
  - Renaming onto an existing `nameKey` fails with `NAME_TAKEN` and `conflictId`. A rename that only changes case is allowed. "Add person" by name fails the same way; only a `Ref` matches an existing name.
  - A merge moves every loan to the target, then deletes the source, in one transaction.
  - A delete with loans fails with `PERSON_IN_USE`.
  - `personUse(ctx)` gives each Person's loan count. Epic 7 adds entries to it.
- **`lib/loans`** has `lendCopy(ctx, copyId, person: Ref, lentOn)` and `returnLoan(ctx, loanId, returnedOn?)`. It may import `copies` and `people`. Both functions are undoable in the `lib/undo` pattern: they take a context, open no transaction and return `Undone<T>`. The action wraps its one call in `withUndo`.
  - Lend's restore deletes the loan; return's restore reopens it. A Person created inline stays after Undo.
  - Integration tests undo both.
- **Copy removal:** `removeCopies` in `lib/copies` deletes the removed copies' loans, open and returned, in the same transaction. Cross-collection deletes go through the gateway, and `copies` does not import `loans`. Bulk remove still skips ordered copies.
- **Save Undo:** undoing a save fails with `UNDO_FAILED` and changes nothing once its copy has a loan. 6.5 tests this.
- **Holdings:** `getHoldings` fills `CopyLine.loan` as `{ loanId, person: Named, since }` for an open loan, otherwise `null`. Rows, Book detail and the Answer read loans only from here. It ships a two-user test.
- **Loans list:** it is not a shelf query. It hydrates Books through `getEffectiveBooks()` and never sorts or filters on Book fields; the order comes from loan dates. `?book=<bookId>` on `/loans` renders the same Book detail server component, gated by `requireOwnBook()`.
- **Loans order** (by person / by date) is a device preference in the `bookeh_prefs` cookie, read by `devicePrefs()` at render so the first paint is right. It is never stored on the profile.
- **Server actions:**
  - Ids are validated with `isRowId()`.
  - Each action runs in `runAction()` and returns an `ActionResult` that carries the toast's names and the seconds left on its `undoToken`.
  - An action used from several pages lives in `src/app/(frontend)/actions/<domain>.ts`.
  - Actions on the collection report through `afterAction(result)` and never patch rows locally.
- **Text and pickers:** a typed Person name is trimmed, NFC-normalised and whitespace-collapsed at the boundary; a value over its limit is `TOO_LONG`. Overlays (the picker, dialogs, the combobox) come from the `components/ui` Base UI wrappers.

## UX & Interaction Patterns

- **Lend picker (6.7):** the story starts with Mika choosing among rendered mock-ups. The picker holds the Person combobox (existing or new), the date field (the platform's control, today by default) and the confirm in one overlay. The choice is recorded in EXPERIENCE.md before the screen is built. It is a bottom sheet on the phone and a dialog on wide screens, one overlay deep.
- **Book detail copy lines:**
  - owned: Lend, Move, Remove.
  - lent: the lent marker with "Lent to {person} since {date}", and Returned.
  - ordered: "Ordered" and Received.

  Lend and Returned are reachable in the half-open sheet. A "Lent before" group lists the Book's closed loans newest first as "{person} · {from} to {to}". It is absent when there are none.
- **Lent marker:** an 8px accent square, never a dot, always with its text in the normal text colour. A row ends with "Lent · {person}" in place of the location. A tile has the marker before its title, below the cover. The Answer's copy line shows the same.
- **Covers:** every cover on these screens (Loans rows, Book detail, the Answer) comes from the shared `Cover` component, which already draws the 1px cover frame and, for a Book without a cover, the cloth placeholder (colour picked by a hash of the title; at row size under 48px wide, cloth only, no title). Do not restyle covers or add a separate placeholder; the cloth colours are cover art and never mark loan state.
- **Removal dialog:** when any copy being removed is lent, the dialog adds that its loans go too. This applies to one copy and to a selection.
- **Loans section:**
  - A by person / by date text switch.
  - By date: one list, longest out first. Each row shows the copy (cover, title, author) and "{person} · since {date}".
  - By person: each borrower's name heads a group, shown as typed. Rows show the copy and "Since {date}".
  - Returned group: below the open loans in both orders, newest first, "{person} · {from} to {to}".
  - A Returned Link on an open row closes the loan today, and the row moves to the returned group.
  - Tapping a row opens Book detail on `/loans`. A Filter chip there opens the collection with only that filter.
- **States:** "Nothing lent" with the remark "Either everyone returns things or nobody asks.", and returned loans still show below it. A load failure shows "Couldn't load. Try again." with a retry Link.
- **Toasts:** "Lent to {person} · Undo" and "Returned · Undo".
- **Settings, People group:**
  - Each Person is a List row with a use count ("2 loans") and Rename, Merge, Delete. On the phone these sit on a second line.
  - "Add person" opens an empty name field in place at the top of the group. Enter or leaving the field saves it, an empty field is dropped, and a name in use is rejected under the field.
  - Renaming onto a name in use offers a merge. Merge is confirmed by a dialog.
  - Deleting a Person with loans says they can't be deleted and offers Merge.
- **Names:** a borrower's name is never lowercased, even as a heading. In Finnish strings, a name the user typed goes where it needs no inflection, such as after a separator.

## Cross-Story Dependencies

- **Status:** 6.1 is done; 6.2–6.13 are backlog. Epic 5, including its retrospective clean-ups 5.38 and 5.39, is done, and so is the cloth-placeholder and cover-frame change to covers.
- **Order:**
  - 6.1 comes before 6.2, because loans reference People.
  - 6.3 needs 6.1, and its merge moves loans, so it needs 6.2 too.
  - 6.4 needs 6.2.
  - 6.5 needs 6.2 and 6.3.
  - 6.6 needs 6.2.
  - 6.7 and 6.12 need 6.5, on Book detail from Epic 5.
  - 6.8 needs 6.5 and 6.6.
  - 6.9 needs 6.5 and the hydrated rows. 6.10 and 6.11 extend 6.9.
  - 6.13 needs 6.3 and Settings.
- **6.9 owns** the deferred 5.21 clause: a chip in Book detail opened from `/loans` opens the collection with only that filter.
- **Epic 7 extends** People rules: wishlist entries join `PERSON_IN_USE` and `personUse`, and entries carry a "for" Person from `lib/people`.
- **Spine edits are acceptance criteria:** a story that changes a contract (for example a new `ErrorCode` or a `CopyLine` change) updates ARCHITECTURE-SPINE.md in the same commit.
