# Epic 5 Context: Browse, organise and move my collection

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the collection at `/` the place Mika uses every day: a fast list of his own copies in Finnish order, with search, filters, sort, rows or covers in three sizes and endless scrolling. Book detail opens as a sheet on the phone and as a side panel on wide screens, and read, rating, notes, Received, Move and Remove happen there. Select mode handles bulk read, move and remove. Locations show on rows and are managed in Settings. The admin extras are re-fetch, looking up a hand-entered Book again, the back-office tidy-up and the last backup line. The collection answers "have I got it, and where is it?" in seconds and holds up at 10,000 copies.

## Stories

- Story 5.1: [E16] Shelf query parameters
- Story 5.2: [E1] Shelf query: my copies, sorted
- Story 5.3: [E2] Shelf query: text search
- Story 5.4: [E3] Shelf query: scalar filters
- Story 5.5: [E4] Shelf query: author, series and genre filters
- Story 5.6: [E15] Author sort
- Story 5.7: [E14] Shelf timing at 10,000 copies
- Story 5.8: [E17] Hydrated shelf rows
- Story 5.9: [E18] Filter values and suggestions
- Story 5.10: [E6] Collection screen
- Story 5.11: [E19] Endless scrolling
- Story 5.12: [E28] Keep my place
- Story 5.13: [E20] Covers layout and sizes
- Story 5.14: [E7] Filter panel: value lists
- Story 5.15: [E31] Filter panel: author, series and publisher
- Story 5.16: [E32] Filter panel: year, pages and rating
- Story 5.17: [E33] Sort
- Story 5.18: [E8] Book detail
- Story 5.19: [E29] Book detail beside the list on wide screens
- Story 5.20: [E30] Open book from the Answer
- Story 5.21: [E22] Filter chips on Book detail
- Story 5.22: [E24] Mark read
- Story 5.23: [E11] Read and rating in Book detail
- Story 5.24: [E12] Copy notes and removing a copy
- Story 5.25: [H13] Received
- Story 5.26: [F3] Locations on rows, lines and filters
- Story 5.27: [E23] Select mode
- Story 5.28: [E25] Remove a selection
- Story 5.29: [E27] Mark a selection read
- Story 5.30: [F4] Move, one copy or a selection
- Story 5.31: [F5] Delete a location
- Story 5.32: [F7] Rename and merge locations
- Story 5.33: [F8] Locations in Settings
- Story 5.34: [E13] Admin re-fetch
- Story 5.35: [D33] Look up a hand-entered Book again
- Story 5.36: [K6] Back office tidy-up
- Story 5.37: [K14] Last backup in Settings

## Requirements & Constraints

- The app opens on the collection; there is no home screen. One row is one copy, and only the viewer's own copies are ever listed.
- Filters, sort and search all use the viewer's effective values (their overrides). Fields combine with AND, values within one field with OR. Read and rating come from the viewer's `user-books` row; a missing row means unread and unrated.
- Read and rating belong to the user and the Book, not to a copy. Notes belong to each copy.
- Received makes an ordered copy owned at the default location. Ordered copies have no location.
- Locations are optional. A user with no locations sees no location field, filter, row ending or Move anywhere.
- Bulk actions apply to every ticked copy or to none. Removals are confirmed by a dialog and have no Undo. Move, Read and Received have Undo. Rating saves at once, without Undo.
- Re-fetch is admin-only. It fills only empty shared fields, themes and the cover included (an uploaded cover counts as a value), and never touches `user-books`. A non-admin call fails with `NOT_FOUND`.
- Every story ships its strings in English and Finnish (ICU plurals), uses design tokens only, and meets the accessibility floor: 44px tap areas and keyboard reach. The modal sheet and dialogs trap focus; the wide panel does not.
- A story that changes the schema is verified against a restored production dump before merge.
- Tests only where an acceptance criterion or a spine rule names the behaviour.

## Technical Decisions

- **Shelf module (`src/lib/shelf`)** is the only code that filters, sorts or searches copies on Book fields. It uses read-only Drizzle through the `lib/payload` helper and starts every query from `visibleCopies(viewer)`. Nothing lists or searches `books`, `authors` or `series` on their own; they are reached only through a copy the viewer can see.
- **The URL is the state.** Search, filters, sort and the open Book live in the search params of `/`. Only the pure `lib/shelf/query.ts` reads or writes them, through `parseShelfQuery` and `shelfHref(query, { book })`. Filter chips are links built with `shelfHref()`.
- **Client rows:** the loaded rows live in `ShelfRowsProvider`, read with `useShelfRows()`, and are keyed by the query without `book`. Rows are never patched locally. Every action on the collection (Book detail, the select bar) reports its result through `afterAction(result)` from `useAfterAction()`. The unkeyed `ShelfActionsProvider` provides it above the tools, the columns and `SelectBar`, and the mounted rows register their reload with it.
  - `ok` reloads rows 0..held.
  - `NOT_FOUND` toasts "Not in library", then reloads.
  - Any other code goes to `reportFailure`.
  - A successful toast Undo reloads through `ToastProvider`'s `onUndone`.
- **Book detail** is one server component (`BookDetail`). It renders in an addressed `Sheet` on the phone and in the 360px panel on wide screens, and later stories add groups to it only. Its single close is `useTaskBack(shelfHref(query), true)`. Every `{ bookId }` from the client starts with `requireOwnBook(ctx, bookId)`. Surface code sees only `EffectiveBook` and `UserBookState`.
- **One writer per row kind:**
  - `lib/copies` owns copies and locations: `moveCopies`, `removeCopies`, `setNote` and the location functions (built), and receive (to build in 5.25).
  - `lib/books` owns `user-books`, through `upsertUserBook()` only: `setRead` and `setRating(ctx, bookId, rating | null)` with `ratedAt` (both built).
  - `lib/catalogue` owns re-fetch and `lookupAgain()`.
  - Selection actions take copy ids and run in one transaction. A single-row action calls the same function with one id.
  - A location picked or created inline is a `Ref` (an id, or `{ create: name }`), resolved inside the action's transaction. Undo leaves a row created this way.
- **`setRead(ctx, target, value | 'toggle')`** (built) takes copy ids or a Book id and applies to the distinct Books. `toggle` resolves to unread only when every Book is already read. It returns `Undone<{ read, count }>`; Book detail's switch and the select bar's Read already call it.
- **Server actions** live in `(sections)/actions.ts` (`removeCopiesAction` is the pattern). Each validates its input as an array of positive safe integers (anything else is `VALIDATION`, with no write) and runs `requireUserOrThrow()` inside `runAction()`. An undoable action wraps its one service call in `withUndo`. Undoable service functions return `Undone<T>`, join the caller's transaction, and ship an integration test that undoes them. The undoable actions are exactly those EXPERIENCE.md lists with an Undo; removals, deletes, merges and `lookupAgain` are not undoable.
- **Look it up again:** the lookup is rate-limited, and `unavailable` is never cached. On `found` it runs the auto-share transaction without creating a copy: it either promotes the Book in place, or moves the copies and the `user-books` row to an existing shared Book and deletes the private one when nothing else references it. The admin's differing hand-entered values are dropped; another user's become overrides.
- **Client imports from `src/lib`** are limited to types and pure modules: `lib/shelf/query.ts`, `lib/catalogue/corners.ts` and `lib/books/languageName.ts`.
- **Overlays** come from the Base UI wrappers in `components/ui` (Sheet, Dialog, Combobox, Picker, Menu). The wide panel is plain layout, not a drawer.
- **History:** opening Book detail pushes an entry. Swapping the Book, or changing search, filters or sort, replaces it. Navigation uses `scroll: false` and no prefetch.

## UX & Interaction Patterns

- **Row ending:** the location, the lent marker or "Ordered". It is blank when the user has no locations.
- **Book detail content:** the header, the read switch and Rating, then "your copies" lines (location and status). An owned copy has Move and Remove; an ordered copy has Received. A note sits under each copy and saves on blur. The foot has Edit.
- **Filter chips:** styled as Links. A chip adds its value to the current filters (a second value in the same field widens it), and on the phone the sheet closes. A chip in Book detail opened from `/loans`, or in a wishlist entry, opens the collection with only that filter.
- **Rating:** a tap sets it and tapping another star changes it. Tapping the current star does nothing. A Clear Link shows while a rating is set.
- **Select mode:**
  - Entering it closes Book detail, and a tap ticks a row instead of opening it.
  - The bar's order is count, then Move, Tag, Read, Remove, Done. On the phone it has two rows: the count and Done above, the actions below. On wide screens it is one row at the bottom.
  - Actions are disabled while nothing is ticked or while one is in flight.
  - The selection survives search, filtering and scrolling. There is no select all.
  - After an action, the sent ids are unticked and select mode stays on. Only Done or `Esc` leaves.
- **Toasts and dialogs:**
  - "Marked {n} read · Undo" ("unread" when it marks them unread)
  - "{n} moved to {location} · Undo"
  - "Saved to {location} · Undo" (Received)
  - "Shared · from {source}"
  - "Still not found."
  - "Add the ISBN on Edit book to look it up."
  - The dialog "Remove {n} books from library?"
- **Admin Re-fetch:** Mika picks its placement and result display from rendered mock-up options, and the pick is recorded in EXPERIENCE.md before building.
- **Overlay depth:** one overlay deep. A sheet or panel may open one picker or dialog. `Esc` closes the topmost thing: dialog, then panel, then select mode.

## Cross-Story Dependencies

- **Status:** done are 5.1–5.23, 5.27–5.29, 5.31–5.33, 5.36 and 5.37. Still open are 5.24–5.26, 5.30, 5.34 and 5.35.
- **Action bar:** it now holds Read and Remove, with a `--spacing-pinned-bar` override so the toast clears the phone's two rows. 5.30 adds Move and 9.8 adds Tag. The phone's actions row has to fit four buttons at 390px, and the toast override assumes one row of actions.
- **Stale filter counts (deferred from 5.28):** Filter panel counts and value lists come from the server render, and `afterAction` reloads only the rows. They go stale after any action that changes rows (Remove, Read, Move, Received) until the next navigation. The fix belongs to the `afterAction` contract in the spine, not to one action.
- **Esc inside the wide panel:** Base UI's `Esc` listener is registered after the panel's, so one `Esc` may close both a picker or dialog inside the panel and the panel itself. 5.24 and 5.30 must handle this.
- **Filter chips (built):** authors, series, genres and each owned copy's location in Book detail are already chips via `FilterChip`. 5.26 adds the row ending, the Answer's location and the no-locations absence. Closing Book detail goes through `useTaskBack`; when filters changed under it, the close keeps the list as shown.
- **5.30 Move:** wires the existing `moveCopies` and reuses the location picker with inline create. Known gap: Undo of a move fails with `UNDO_FAILED` if a location it would restore has since been deleted (possible from Settings).
- **5.24 Remove:** wires the existing `removeCopies` (all or none). After the last copy is removed, the detail closes.
- **5.35:** reuses Epic 3's auto-share and edition picker. Split `sharePrivateBook.ts` at its D-8 compare seam when 5.34 or 5.35 touches it. Wishlist entries move too once Epic 7 lands.
- **Other epics:** the `genre` filter carries only system genre ids for now; Epic 9 settles user genre tags. Lent markers and loan actions arrive with Epic 6, tags and themes with Epic 9. Chips from `/loans` (6.9) and wishlist entries (Epic 7) opening the collection with only that filter are deferred to those stories.
