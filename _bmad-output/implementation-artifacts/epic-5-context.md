# Epic 5 Context: Browse, organise and move my collection

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the collection at `/` the screen Mika uses every day: his own copies in Finnish order, with search, filters, sort, rows or covers in three sizes and endless scrolling, holding up at 10,000 copies. Book detail opens as a sheet on the phone and a side panel on wide screens; read, rating, copy notes, Received, Move and Remove happen there, and select mode does bulk read, move and remove. Locations show on rows and are managed in Settings; a user without locations never sees a location field. The admin extras are re-fetch, looking a hand-entered Book up again, a tidier back office and the last-backup line. Two clean-up stories from the Epic 5 retrospective close the epic so Epic 6 starts from a reconciled spine and a clean tree.

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
- Story 5.38: [K19] Collection clean-up
- Story 5.39: [K20] Epic 4 leftovers

## Requirements & Constraints

- The app opens on the collection; no home screen. One row is one copy; only the viewer's own copies are listed, counted or searched. Search covers title, author, series, ISBN and notes, nothing outside the collection.
- Filters, sort and search use the viewer's effective values (overrides). Fields combine with AND, values within a field with OR. Finnish collation for sort; search ignores case but never folds å, ä, ö. Results under 1 s at 10,000 copies.
- Read and rating belong to the user and the Book, not a copy; a missing `user-books` row means unread and unrated. Notes belong to each copy.
- Copy status is `ordered | owned` only. An ordered copy has no location; Received makes it owned at the default location.
- Locations are optional and private. With none, no location field, filter, row ending or Move appears anywhere. They are added inline, renamed, merged and deleted; a delete clears copies and the profile default.
- Bulk actions apply to every sent copy or none, in one transaction. Removals are confirmed by a dialog and have no Undo; Move, Read and Received have Undo; rating saves at once without Undo.
- The admin never reads users' private data. Re-fetch and look-it-up-again are the only app-side source calls on an existing Book and share the lookup rate limit.
- Every story ships English and Finnish strings, tokens only, 44px tap areas on the phone, keyboard reach on wide screens; sheets and dialogs trap focus, the wide panel does not.
- A schema change is verified against a restored production dump before merge. Tests only where an acceptance criterion or a spine rule names the behaviour.

## Technical Decisions

- **Shelf module (`src/lib/shelf`)** is the only code that filters, sorts or searches copies on Book fields: read-only Drizzle through the `lib/payload` helper, every query built on `visibleCopies(viewer)` with the shared/private read rule in its joins. Nothing lists `books`, `authors` or `series` on their own. Offset/limit paging at one page size, every sort ending on copy id, no page number in the URL. Text search is `ILIKE`; indexes come only if the CI timing test fails.
- **The URL is the state.** Search, filters, sort and the open Book are search params on `/`, read and written only by the pure `lib/shelf/query.ts`; Filter chips are links built from it.
- **Client rows:** one list keyed by the query without `book`, never patched locally. Every action reports through `afterAction(result)`: `ok` reloads rows 0..held via `/data/shelf`, `NOT_FOUND` toasts "Not in library" then reloads, anything else is a failure report; a toast Undo reloads through `onUndone`. 5.38 adds a `router.refresh()` after the reload so filter values and the cached first page follow, and updates the spine's AD-7 paragraph in the same commit. Per query, `sessionStorage` keeps only row count and scroll position.
- **Client-initiated reads** are route handlers under `(frontend)/data/`, never `/api`: `/data/shelf` for row ranges, `/data/suggest` for author, series and publisher (max 10, blank `q` answers `[]`, 401 signed out).
- **Book detail** is one server component rendered by the section page on `?book=`, in an addressed Sheet on the phone and a 360px plain-layout panel on wide screens. Every client `{ bookId }` starts with `requireOwnBook()`; surface code sees only `EffectiveBook` and `UserBookState`.
- **One writer per row kind:** `lib/copies` owns copies and locations; `lib/books` owns `user-books` through `upsertUserBook()` (`setRead` takes copy ids or a Book id and `value | 'toggle'`); `lib/catalogue` owns `refetchBook()` and `lookupAgain()`. Selection actions take copy ids in one transaction; a single-row action is the same call with one id. An inline-picked or created location is a `Ref` resolved in the transaction; Undo leaves a created row. Adding or renaming onto an existing name fails with `NAME_TAKEN` and `conflictId`.
- **Server actions** validate ids as positive safe integers (else `VALIDATION`, no write), run in `runAction()`, and wrap one undoable service call in `withUndo`. A restore writes recorded values to rows that still exist and skips rows that are gone; 5.38 extends this to restore targets (a deleted or merged location restores as `null`, mirrored in receive).
- **Re-fetch:** admin-only on a shared Book, gated like cover upload, fills only empty shared fields (themes and cover included) in a transaction that re-reads the Book, returns `filled | nothing | unavailable`, never touches `user-books`, copies or genres, not undoable.
- **Look it up again:** the creator's own private Book with an ISBN only. Merges into an existing shared Book without asking the sources, otherwise asks fresh and runs the auto-share transaction without a copy. Returns `shared | editions | none | unavailable`; the edition round trip reuses the Answer's candidate mechanism. Counts the lookup limit only when it asks the sources (5.38). Not undoable.
- **Text input** is trimmed and NFC-normalised at the boundary; 5.38 applies this to the shelf and suggest `q`, 5.39 names one whitespace-collapse rule shared by edit, user-book and manual-entry writers and one `isRowId()` helper with the int4 bound.
- Client imports from `src/lib` are types and pure modules only. Overlays come from the Base UI wrappers. Layout and size are device preferences in one cookie, known at server render. Opening Book detail pushes history; swapping the Book or changing the query replaces it.
- Back office: grouped collections and light theming through `admin.css` only; read current Payload docs first, no restructuring.

## UX & Interaction Patterns

- **Collection controls:** search; layout and size (s / m / l) per device; Filter; count line under the search ("{n} books" or "Tampere, unread · 14 books · Clear"); Select; endless scrolling. Row ending: location, "Lent · {person}" or "Ordered"; blank with no locations.
- **Covers (decided; 5.38 updates DESIGN.md):** column minimums 150 / 96 / 70px for l / m / s, auto-fill, so 375–390px phones get 4 / 3 / 2 columns. No cover: the typeset paperback placeholder (outline kept, title bottom-left wrapped and clamped, author under it; title only at s and in rows). An ordered tile carries a red-white-blue airmail band across its top-left corner.
- **Filter panel:** left of the list on wide screens (220px), a bottom sheet on the phone; filters apply as changed. Value lists for location, status, read, genre, language; comboboxes for author, series, publisher; Rating means "at least"; year and pages from/to. Sort by author (default), title, year, date added; tapping the chosen sort reverses it. Under 1200px only one side panel fits: Filter and Book detail close each other.
- **Book detail:** header (cover, title, author and series chips, edition line), read switch and Rating, copy lines with location chip and status (owned: Move, Remove; ordered: Received) and an in-place note under each, classification chips, then the Re-fetch or Look it up again line, a foot with Edit. Changes save at once. Rating: tap sets, another star changes, the current star does nothing; Clear Link while set.
- **Select mode:** entering closes Book detail; a tap ticks. Selection survives search, filter and scroll; no select all. Bar order: count, Move, Tag (Epic 9), Read, Remove, Done; two rows on the phone. Actions disabled while nothing is ticked or one is in flight; after an action the sent ids untick and select mode stays on; Done or `Esc` leaves. 5.38: Move and Remove skip ordered copies, leave them ticked and the toast says how many were skipped.
- **Toasts:** "Marked {n} read · Undo" (or "unread"), "{n} moved to {location} · Undo", "Saved to {location} · Undo", "Shared · from {source}", "Still not found.", "Filled {fields} · from {source}", "Nothing to fill.", "{sources} didn't answer."; dialog "Remove {n} books from library?".
- **Location picker:** sheet on the phone, dialog on wide screens; "New location" field (max 200) with a secondary Move beside it, disabled while blank. One overlay deep; `Esc` closes dialog, then panel, then select mode.
- **Settings:** Locations as List rows with use counts and Rename / Merge / Delete; "Add location" opens an empty field in place. Admin-only "Last backup: {date}", in danger with "Backup is overdue." when older than 48 h, missing or failed.
- **States:** "No books yet", "No books match" with Clear, "Couldn't load. Try again.", "Not in library" toast for a `?book=` no longer held; an open Book whose row leaves the list stays open until closed.

## Cross-Story Dependencies

- **Status:** 5.1–5.37 are done. 5.38 and 5.39 are the retrospective's clean-up stories and land before Epic 6 starts.
- **5.38 owns:** the stale filter counts after an action (the `afterAction` refresh), the Move Undo gap when a location was deleted, ordered copies in bulk Move/Remove, `lookupAgain`'s lookup counting, the covers layout decision in DESIGN.md and `styles.css`, dropping `tag`/`theme` from the parsed query until Epic 9, and the test gaps the retro named (Rating payload and no Undo toast, look-it-up-again round trip and toasts, Re-fetch link admin-only, `/data/suggest` 401).
- **5.39 owns:** the Epic 4 leftovers (non-admin cover sharing on promote and merge with AD-5 updated, dropping an override by retyping the shared value, cover-fetch lookup counting with AD-9 updated, `isRowId()`, edit length limits and the shared normalisation rule, lint rule tests), document reconciliations across the spine, epics, DESIGN.md, CLAUDE.md and earlier context files, and tree hygiene (lint ignores `.claude/**`, CI builds the image on every branch, the `oversized` threshold raised).
- **Spine edits are acceptance criteria:** a story that changes a contract updates ARCHITECTURE-SPINE.md in the same commit.
- **Later epics add to these screens:** lent markers, Lend / Returned and `/loans` Book detail (Epic 6); wishlist lines and Add to wishlist (Epic 7); Tag on the action bar, tag/genre/theme chips and filters (Epic 9). Chips opening the collection with only that filter from `/loans` and wishlist entries belong to 6.9 and 7.12.
