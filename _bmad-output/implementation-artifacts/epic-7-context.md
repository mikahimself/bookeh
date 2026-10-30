# Epic 7 Context: Keep wishlists

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Mika keeps several named, private wishlists of Books he doesn't own yet. He adds to them from the Answer and from Book detail without rescanning, marks an entry as a gift idea for a Person, and closes entries as bought or ordered. Closing puts a copy on his own shelf only when the wish was his own. Adding a Book to the library ticks off his own matching wishes. Entries count as holding a Book, so a wished-for Book opens in Book detail and shows up in holdings. Epic 8's shop check builds on this. The epic closes with twelve clean-up stories (7.16–7.27) that take every open retrospective item and the deferred-items triage (`deferred-triage-2026-10-30.md`) before Epic 8.

## Stories

- Story 7.1: `wishlists` collection
- Story 7.2: `wishlist-entries` collection
- Story 7.3: Entries in holdings and Book access
- Story 7.4: People with wishlist entries can't be deleted
- Story 7.5: Wishlist service: create, rename, delete
- Story 7.6: Save to a wishlist
- Story 7.7: A save closes matching wishes
- Story 7.8: Bought and ordered
- Story 7.9: Entry recipient and removal
- Story 7.10: Wishlists section
- Story 7.11: One wishlist
- Story 7.12: Opened entry
- Story 7.13: Bought, Ordered and Remove
- Story 7.14: Add to wishlist
- Story 7.15: On wishlists in Book detail
- Story 7.16: [K22] Conventions builds read
- Story 7.17: [K23] Wishlist and loan clean-up
- Story 7.18: [K24] Foreign keys that refuse or cascade
- Story 7.19: [K25] Own email and password closed over REST
- Story 7.20: [K26] Scan and collection leftovers
- Story 7.21: [K27] Checks that guard the spine
- Story 7.22: [K28] Repo tidy
- Story 7.23: [K29] Shared service code
- Story 7.24: [K30] Shared frontend code
- Story 7.25: [K31] Shared test helpers
- Story 7.26: [K32] Spec reconciliation
- Story 7.27: [K33] Owed checks on the phone and the LXC

## Requirements & Constraints

- Each user has several named wishlists, all private. The admin role cannot read them. Sharing lists is Phase 2–3: don't build it, don't rule it out, and add no share collections now.
- An entry is a Book on one list, optionally *for* a Person. An empty recipient means it is for the user. The recipient can be set, changed or cleared at any time.
- Add to wishlist appears on the Not in library and Not found Answers and in Book detail's foot. From Not found it saves the typed title and author as a private Book. Lookup stays read-only, and the Book is created on save.
- Adding a Book to the library closes the user's own open entries for it (those with no recipient). Entries for a Person stay open.
- Bought and Ordered close the entry. For the user's own entry, Bought creates an owned copy at the default location and Ordered creates an ordered copy. For a Person's entry, no copy is made.
- Add to wishlist, Bought, Ordered and the save's closing of wishes can be undone. Removing an entry or deleting a list is confirmed by a dialog and has no Undo. Undoing a save removes any Book, author, series or media row that nothing else references.
- A Person with any entry, open or closed, cannot be deleted. Merging People moves their entries. A Person's use count includes entries.
- Every story: English and Finnish strings in the terse voice (user-typed names placed where they need no inflection), the accessibility floor, and design tokens only.

## Technical Decisions

- **Entry is never a copy** and never a copy status. Closing keeps the row and sets `closedAt`. Remove deletes the row. "Entry" means an open entry unless stated otherwise. Entries are addressed by their own id, because one Book can be on a list twice.
- **Access:** read, update and delete are `owner = current user` for every role, admin included. Relations: `wishlist` and `forPerson` are owned relations, and `book` is a readable relation. Access tests cover foreign ids.
- **One writer:** `lib/wishlists` is the only writer of `wishlist-entries`, and it owns wishlists by `nameKey`. Renaming onto a taken `nameKey` fails with `NAME_TAKEN` and `conflictId`; a rename that only changes case is allowed. Deleting a list deletes all its entries in one transaction. Screens never match names: pickers send a `Ref` (`number | { create: string }`), which is resolved inside the action's transaction. Undo leaves a row created that way in place.
- **Entry services:** `closeEntriesForBook()` is called by `saveCopy()` before `createCopy()`, in the same transaction, and what it closed goes into the save's restore. `closeEntry(ctx, id, 'bought' | 'ordered')`: an entry for a Person closes alone with no copy; an entry with no recipient closes through `closeEntriesForBook()` (every own open entry for the Book, on any list), then calls `createCopy()` once, and its restore removes the copy and reopens every entry it closed. `setEntryRecipient(ctx, id, Ref | null)` sets, changes or clears an open entry's recipient, resolving an inline name through `resolvePerson()` in `lib/people`. `removeEntry(ctx, id)` deletes an open entry's row; the Book stays. Neither has Undo.
- **`saveEntry`** lives in `lib/catalogue` and takes `save: { kind: 'entry', wishlist: Ref }`. It returns `EntrySaveResult` (`bookId`, `entryId`, `savedTo`: the list, never null); `saveCopy` returns `SaveResult` (`bookId`, `copyId`, `savedTo`: the location or null). It follows the same target kinds (`isbn13` / `bookId` / `manual`), held-outcome rule and single-transaction rule as `saveCopy`. A repeated `requestId` returns the first result only for the same user and the same kind of save.
- **Imports:** `catalogue` may import `wishlists`, and `wishlists` may import `copies` and `people`. No other new import directions.
- **Private-Book merge:** when a save or Look it up again merges the user's private Book into an existing shared Book, `moveEntriesToBook()` in `lib/wishlists` moves the user's entries to the shared Book first.
- **`lib/wishlists` surface (complete for this epic):** writers `resolveWishlist`, `createWishlist`, rename, delete; `createEntry`, `closeEntriesForBook`, `closeEntry`, `moveEntriesToBook`, `setEntryRecipient`, `removeEntry`. Readers: `listWishlists(ctx)` returns `WishlistLine[]` (`Named & { count }`, the viewer's lists by name, count = open entries); `getWishlist(ctx, id)` returns `WishlistView` (`Named & { entries: ListEntry[] }`, open entries newest first, each `{ entryId, bookId, forPerson: Named | null }`), or null when the list is not the viewer's. The screen stories call these through server actions and add no new writers.
- **People use count:** `personUse()` returns `PersonUse` with `loans` and `entries`, both counting open and closed rows.
- **Holdings and access:** `Holdings.entries` holds the viewer's own open entries only, as `EntryLine` (`entryId`, `wishlist`, `forPerson`). `requireOwnBook()` passes for a Book held only through an open entry. `setRead()` and `changeTags()` work for a Book that is only on a wishlist. A save's restore deletes a `user-books` row it created only when the user has no other copy or entry for that Book.
- **Lists that are not copies** (a wishlist) load their Books through `getEffectiveBooks()` and don't sort or filter on Book fields. A wishlist's count is its open entries.
- **Undo:** service functions return `Undone<T>`, open no transaction and record nothing. The action wraps a single call in `withUndo`. A close's restore reopens the entry and deletes the copy it made. A save's copy restore refuses with `UNDO_FAILED` once the copy has any loan (explicit check, not the foreign key); Received's on an open loan only; Lend's once the loan has been returned.
- **Routes:** `/wishlists`, `/wishlists/[listId]`, and `?entry=<entryId>` on the entry's own list. Opening an entry pushes a history entry. Closing it goes back in history.
- **Copy status:** an ordered copy has no location and is never lent; `setStatus()` refuses ordered on a copy with an open loan.
- **Foreign keys (AD-19, Story 7.18):** owners and creators cascade, references restrict, optional links `set null`; `foreignKeyActions` (`src/collections/foreignKeys.ts`) sets them in `afterSchemaInit`, and `refuseWhileReferenced` (`src/collections/deleteGuards.ts`) gives the back office a readable 409.
- **Accounts:** the profile is read and updated only through `lib/account`; the admin role does not read users' private data. Field-level access cannot reach `password`, which is not a Payload field.
- **Clean-up stories** keep the spine's rules: one conventional commit each, about 500 hand-written changed lines, tests only where the criteria name the behaviour or a spine rule. A story that adds or changes a screen runs one uncommitted Playwright walk before done.
- A story that changes a spine contract (shared types, service functions, imports) updates ARCHITECTURE-SPINE.md in the same commit. Schema stories merge one at a time.

## UX & Interaction Patterns

- **Wishlists section:** each list is a List row with its name and count. "New list" opens a dialog, and a name already in use is rejected under the field. With no lists: "No wishlists" and "New list". On a load failure: "Couldn't load. Try again." with a retry Link.
- **One wishlist:** a Back link sits above the heading. The heading is the list's name as typed, never lowercased. Under it are the Links Rename (edits in place) and Delete (destructive Link; its dialog says the entries go too). Entry rows show cover, title, author, and "For {person}" at the end. An empty list shows "Nothing on this list."
- **Opened entry:** a bottom sheet on the phone and a side panel on wide screens. It shows the Book header, "On {list}" and a "For" combobox of People that saves at once. Buttons: Bought (the layer's one primary), Ordered, and Remove (destructive, confirmed). A closed or foreign entry at `?entry=` opens the list without it and toasts "Not on this list". A filter chip opened from here goes to `/` with only that filter.
- **Toasts:** "Added to {list} · Undo"; Bought for the user: "Saved to {location} · Undo"; Ordered: "Ordered · Undo"; Bought for a Person: "Bought · Undo".
- **Add to wishlist:** opens the wishlist picker every time (a sheet on the phone, a dialog on wide screens; one choice, then it closes). The picker is skipped when there is exactly one list. Decided (mock-up A, `ux-designs/ux-bookeh-2026-10-03/.working/wishlist-picker-new-list.html`): the picker is titled "Add to wishlist" with the Book's title muted under it, then one row per list with its count, then a "New list" Text field with a secondary Add button beside it, disabled while the field is blank, built the same way as Move's "New location". A typed name and Add (or Enter) save to the list of that name, creating it when none matches; the picker sends a `Ref`, never matches names itself. With no lists the rows are absent and only the field shows, focused on open. Undo removes the entry and keeps a list made on the way. From the Answer, it returns to Scan.
- **Book detail:** an "On wishlists" group shows "{list} · for {person}", or "{list}" alone for the user's own entries, and is absent when there are none. A Book held only through entries opens with no copies group. Removing the last copy while open entries remain keeps Book detail open. The foot has Edit and Add to wishlist, with no primary button.
- Overlays go only one deep: a sheet may open one picker or dialog, and nothing goes on top of that. Modals hold and return focus; the side panel is not modal. Mock-up: `ux-designs/ux-bookeh-2026-10-03/mockups/key-wishlists.html`.

## Cross-Story Dependencies

- Feature stories 7.1–7.15 are done. Clean-up runs 7.16 → 7.27; 7.16 (conventions) comes first so the rest read its rules, and 7.27 is Mika's on-device session, which an unattended build stops at.
- 7.23–7.25 fold copied code (services, frontend, test helpers) so Epics 8 and 9 build on one version. 7.26 reconciles the spine, PRD and UX documents with the code and recompiles this file.
- 7.27 runs on production with 7.16–7.26 deployed, including Story 7.18's `foreign_keys` migration on a restored production dump, and then sets epics 5, 6 and 7 to `done`.
- Epic 8 builds on this epic: `visibleEntries(viewer)` in Lookup's own-library search, the On wishlist Answer heading, and Add to wishlist from Lookup results.
