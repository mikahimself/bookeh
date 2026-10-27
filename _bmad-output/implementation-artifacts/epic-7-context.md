# Epic 7 Context: Keep wishlists

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Mika keeps several named, private wishlists ("Me", "Christmas") of Books he does not own yet, adds to them from the Answer and Book detail without rescanning, marks entries for a Person as gift ideas, and closes them as bought or ordered, which puts a copy on his own shelf only when the wish was his own. Adding a Book to the library ticks off his own matching wishes. Entries count as holding a Book, so a wished-for Book opens in Book detail and shows up in holdings. This completes the "do I want it / have I got it" half that Epic 8's shop check relies on.

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

## Requirements & Constraints

- Several named wishlists per user, all private. Admin cannot read them (admin role never reads users' private data). Sharing lists with friends or by link is Phase 2–3: do not build, do not rule out (no share collections now).
- An entry is a Book on one list, optionally *for* a Person; empty recipient means for the user. The recipient can be set, changed or cleared any time after adding.
- The wishlists page lists every list with its open-entry count; a list shows its open entries with recipients.
- Add to wishlist is offered for a Book the user doesn't own (Not in library and Not found Answers, Book detail foot); Not found saves the typed title and author as a private Book. Lookup stays read-only; the Book is created on save.
- Adding a Book to the library closes the user's own open entries for it (no recipient); entries for a Person stay open.
- Bought/Ordered close the entry; for the user they create an owned copy at the default location (bought) or an ordered copy (ordered); for a Person no copy is made.
- Undoable: Add to wishlist, Bought, Ordered (and the save's closing of wishes). Remove entry and delete list are confirmed, no Undo. Undo of a save removes any Book, author, series or media row nothing else references.
- A Person with any entry, open or closed, cannot be deleted; merging People moves entries; a Person's use count includes entries ("2 loans, 1 wish").
- Every story: English and Finnish strings in the terse voice (user-typed names placed where they need no inflection), accessibility floor, design tokens only.

## Technical Decisions

- **Collections:** `wishlists` (`ownerField()`, `nameKeyField()`, `name`; `(owner, nameKey)` unique as a DB constraint) and `wishlist-entries` (`ownerField()`, `wishlist` and optional `forPerson` as `ownedRelation`, `book` as `readableRelation`, `closedAt` empty while open). Read/update/delete access is `owner = current user` for every role, admin included. Each collection's access test covers a foreign id.
- **An entry is never a copy** and never a copy status. Closing keeps the row with `closedAt`; Remove deletes it. "Entry" means open entry unless stated. Entries are addressed by their own id (the same Book can be on a list twice).
- **One writer:** `lib/wishlists` is the only writer of `wishlist-entries` and owns wishlists by `nameKey` (resolve `Ref`, create, rename, delete). Rename onto an existing `nameKey` fails `NAME_TAKEN` with `conflictId`; a case-only rename is allowed. Deleting a list deletes its entries (open and closed) in one transaction. Screens never match names; pickers send a `Ref` (`number | { create: string }`), resolved in the action's transaction; Undo leaves a row created this way.
- **Functions:** `closeEntriesForBook()` (called by `saveCopy()` before `createCopy()` in the same transaction, folded into the save's restore); `closeEntry(ctx, entryId, 'bought' | 'ordered')` (calls `createCopy()` unless for a Person); `setEntryRecipient(ctx, entryId, Ref | null)` (inline Person via `lib/people`); `removeEntry(ctx, entryId)`. `saveEntry` lives in `lib/catalogue`, takes `SaveInput` with `save: { kind: 'entry', wishlist: Ref }`, returns `SaveResult` with `entryId` and the list as `savedTo`; same `requestId` idempotency, target kinds (`isbn13`/`bookId`/`manual`), held-outcome and transaction rules as `saveCopy`.
- **Import direction:** `catalogue` may import `wishlists`; `wishlists` may import `copies` and `people`. Nothing else new.
- **Private-Book merge:** when a save or Look it up again merges a private Book into an existing shared Book, the user's entries move to the shared Book first.
- **Holdings and access:** `getHoldings()` in `lib/books` returns `entries: EntryLine[]` (`{ entryId, wishlist: Named, forPerson: Named | null }`, open only, viewer's own). `requireOwnBook()` passes for a Book held only through an open entry. `upsertUserBook()` remains the only `user-books` writer; read/tags work for wishlist-only Books. A save's restore deletes a created `user-books` row only when the user has no other copy or entry for the Book.
- **Lists that are not copies** (a wishlist) hydrate Books through `getEffectiveBooks()` and don't sort or filter on Book fields.
- **Undo (AD-20):** service functions return `Undone<T>`, open no transaction, record nothing; the action wraps one call in `withUndo`. Closing restores reopen the entry and delete the copy made; the save's copy restore refuses `UNDO_FAILED` once the copy has a loan.
- **People:** `PersonUse` gains entries; `PERSON_IN_USE` covers entries.
- **Foreign keys:** decided in the Epic 6 retro: references refuse (`ON DELETE restrict` with a readable `beforeDelete` refusal), `owner_id` cascades. New entry FKs to people/wishlists/books should follow it.
- **Routes:** `/wishlists`, `/wishlists/[listId]`, `?entry=<entryId>` on its list. Opening an entry pushes history; closing is history back.
- A story that changes a spine contract (shared types, service functions, imports) updates ARCHITECTURE-SPINE.md in the same commit. Schema stories merge one at a time.

## UX & Interaction Patterns

- **Wishlists section:** List rows with name and count; "New list" dialog, a name in use rejected under the field; empty: "No wishlists" + "New list"; load failure "Couldn't load. Try again." with retry Link.
- **One wishlist:** Back link, heading is the name as typed (never lowercased), Links Rename (in place) and Delete (destructive Link, dialog says entries go too). Entry rows: cover, title, author, "For {person}" at the end. Empty: "Nothing on this list."
- **Opened entry:** bottom sheet on phone, side panel on wide; Book header, "On {list}", "For" combobox of People saving at once; Bought (the layer's one primary), Ordered, Remove (destructive button, confirmed). Closed/foreign entry at `?entry=` opens the list without it and toasts "Not on this list". Filter chips from here open the collection with only that filter (start from an empty query, go to `/`).
- **Toasts:** "Added to {list} · Undo"; Bought for me "Saved to {location} · Undo"; Ordered "Ordered · Undo"; Bought for a Person "Bought · Undo".
- **Add to wishlist:** opens the wishlist picker every time (sheet on phone, dialog on wide; one choice then closes); skipped with exactly one list; with none it offers only "New list". How a list is created from an empty picker is decided by Mika from rendered mock-ups, within one overlay, and recorded in EXPERIENCE.md before building. From the Answer it returns to Scan. Recipient is set later on the entry.
- **Answer lines:** "On {list}" per entry; the On wishlist heading (Add to library · Back) is Epic 8's full Answer.
- **Book detail:** "On wishlists" group, "{list} · for {person}" or "{list}" alone, absent when none; a Book held only through entries opens with no copies group. Foot: Edit and Add to wishlist, no primary.
- One overlay deep: a sheet may open one picker or dialog, nothing on top. Modals hold and return focus; the side panel is not modal. Mock-up: `ux-designs/ux-bookeh-2026-10-03/mockups/key-wishlists.html`.

## Cross-Story Dependencies

- 7.1 → 7.2 → 7.3 / 7.4 → 7.5 → 7.6–7.9 (services) → 7.10–7.15 (screens). 7.6 needs 7.5's `Ref` resolution; 7.8 and 7.13 need `createCopy` and the default location; 7.9 and 7.12 need `lib/people` (Epic 6). 7.12–7.13 build on 7.11; 7.14 on 7.6; 7.15 on 7.3.
- 7.7 touches `saveCopy` (Epic 3) and the private-Book merge paths of Story 3.39 and Look it up again (Story 5.35).
- 7.4 extends Epic 6's `lib/people` delete, merge and `personUse`, and the People group in Settings.
- Reuses Epic 5's Book detail content component, sheet/panel, Book row, Filter chip; Epic 6's Person combobox and Picker wrappers.
- Epic 8 builds on this: `visibleEntries(viewer)` in Lookup's own-library search, the On wishlist Answer heading, and Add to wishlist from Lookup results.
- Open Epic 6 retro item: foreign-key rule (restrict references, cascade owners) is not applied yet; coordinate if it lands during this epic.
