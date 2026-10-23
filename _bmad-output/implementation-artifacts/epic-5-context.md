# Epic 5 Context: Browse, organise and move my collection

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make the collection at `/` the place Mika uses every day: a fast, Finnish-ordered list of his own copies with search, filters, sort, rows or covers in three sizes and endless scrolling; Book detail (phone sheet, wide side panel) where read, rating, notes, Received, Move and Remove happen in place; select mode for bulk read, move and remove; locations shown on rows and managed in Settings; plus the admin extras (re-fetch, look a hand-entered Book up again, back-office tidy-up, last backup). It answers "have I got it, and where is it?" in seconds and holds up at 10,000 copies.

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

- The app opens on the collection; there is no home screen. One row is one copy; only the viewer's own copies are ever listed.
- Scrolling is endless: the next page loads as the end approaches, with the progress line, and the list stays usable. No page buttons, no page number in the URL, no skeletons.
- Search covers effective title, author names, series name, ISBN-13 and copy notes: case-insensitive `ILIKE`, no accent folding ("a" never matches "ä"), `%`, `_`, `\` matched literally. It never searches outside the collection.
- Filters: location and status (copy); read and rating "at least" (the viewer's `user-books` row, a missing row = unread, unrated); genre (system genres); language, publisher (exact effective value); author, series; year and pages ranges, inclusive, either end open, an active range excluding Books with no effective value. Fields AND, values within a field OR. Filters, sort and search use the viewer's overrides.
- Sort: author (default; `sortName` of the Book's first effective author the viewer may read, then effective title, both in the sort's direction; no readable author last both ways), title, year (no year last both directions), date added; `fi-FI` collation ("Örkki" after "Zorro"); every sort ends on copy id.
- First page for no filter, text search, three combined filters and author sort under 1 s at 10,000 copies on the CI runner.
- Read and rating belong to the user and the Book, not a copy. Notes are per copy.
- Received makes an ordered copy owned at the default location. Ordered copies have no location.
- Locations are optional: a user with none sees no location field, filter, row ending or Move anywhere.
- Bulk actions apply to all ticked copies or none. Removals are confirmed by a dialog and have no Undo; Move, Read and Received have Undo. Rating saves at once without Undo.
- Re-fetch is admin-only, fills only empty shared fields (themes and cover included; an uploaded cover counts as a value), never touches `user-books`. Non-admin calls fail `NOT_FOUND`.
- Every story: strings in English and Finnish, tokens only, accessibility floor (44px tap areas, keyboard reachable; modal sheet and dialogs trap focus, the wide panel does not). Schema-changing stories are verified against a restored production dump before merge. Tests only where an AC or spine rule names the behaviour; no markup/CSS tests.

## Technical Decisions

- **Shelf module (`src/lib/shelf`)** is the only code that filters, sorts or searches copies on Book fields: read-only Drizzle through the `lib/payload` helper. Every query starts from `visibleCopies(viewer)` (today `owner = viewer`) and applies the shared-or-own read rule in joins to `books`, `authors`, `series`. Effective values in SQL test whether the field name is in `overridden`. Author/series filter values are ids matching every readable record with the same `nameKey`. All values are bound parameters.
- **No browsing the catalogue:** nothing lists or searches `books`, `authors` or `series` on their own; they are reached through a copy the viewer can see, or by exact ISBN-13 / `nameKey` match.
- **URL is the state.** Search, filters, sort and the open Book live in `/` search params; only the pure, client-importable `lib/shelf/query.ts` reads or writes them (`parseShelfQuery` → `ShelfAddress { query, book }`, never throws, bad values drop to defaults; one param writer behind `shelfHref(query, { book })` for links and `shelfRowsPath(query, range)` for `/data/shelf`; `SHELF_PAGE_SIZE`, `SHELF_MAX_ROWS`). Filter chips are links built with `shelfHref()`.
- **One hydrated read:** `getShelfRows(ctx, query, range)` → `ShelfRows { rows, total, labels }`, hydrating ordered ids through `getEffectiveBooks()` and `getHoldings()` (a copy gone between reads is dropped). `labels` is keyed `field:id` for location, genre, author, series only. The page calls it for the first rows; the `/data/shelf` route handler calls it for every other range. Offset/limit, one fixed page size, every sort ends on copy id.
- **`/data/shelf?<shelf params>&offset&limit`** (built) answers `ActionResult<ShelfRows>`; `book` ignored; `offset` ≥ 0, `limit` 1–1000 (`SHELF_MAX_ROWS`), anything else `VALIDATION` with no query run; 401 when signed out. The client reaches it only through `fetchData` and `shelfRowsPath`.
- **Client list** (built): rows live in `ShelfRowsProvider`, read with `useShelfRows()` → `{ shelf, loading, loadMore, afterAction }`; the provider keys its inner state by `shelfHref(query)` itself (a `?book=` change keeps held rows). Any sibling that acts on the collection (Book detail, select bar) reports through `afterAction(result)`: `ok` reloads, `NOT_FOUND` toasts "Not in library" then reloads, anything else goes to `reportFailure`. A successful toast Undo reloads via `ToastProvider`'s `onUndone`. A reload fetches rows 0..min(held, `SHELF_MAX_ROWS`) and replaces them; stale answers are dropped. Rows are never patched locally. Keep my place (built): `sessionStorage` holds only `{ rows, scrollY }` per query (never row data); on return from another route the first query mounted reloads that many rows in one request and restores the position; a search, filter or sort change on `/` never restores.
- **Filter values and suggestions** (built): `filterValues` gives locations, statuses, genres and languages in use on the viewer's copies with counts, never narrowed by the current query; `/data/suggest` gives author, series and publisher suggestions distinct on `nameKey`, preferring the shared record's id.
- **Timing and indexes:** the 10,000-copy timing test runs on every CI run; plain `ILIKE` passes, so there are no search indexes. Add `pg_trgm` GIN on stored columns only if that test fails; never on computed effective values.
- **Book detail** is one server component rendered by the section page when `?book=` is set; later epics add groups to it only. Every `{ bookId }` from the client and Book detail itself starts with `requireOwnBook(ctx, bookId)` (`NOT_FOUND` unless the viewer holds a copy or, from Epic 7, an open wishlist entry). Surface code sees only `EffectiveBook` and `UserBookState`.
- **Writers (one per row kind):** `lib/copies` owns copies and locations (move, receive, note, remove, create/rename/merge/delete location); `lib/books` owns `user-books` via `upsertUserBook()` only (`setRead`; `setRating(ctx, bookId, rating | null)` with `ratedAt`, still to build); `lib/catalogue` owns re-fetch and `lookupAgain()`. Selection actions take copy ids and run in one transaction; a single-row action calls the same function with one id. A location picked or created inline is a `Ref` (id or `{ create: name }`) resolved inside the action's transaction; Undo leaves a row created this way.
- **`setRead`** (built) takes copy ids or a Book id, applies to the distinct Books, `toggle` → unread only when every Book is read, returns `Undone<{ read, count }>`. 5.23 and 5.29 call it.
- **Locations** (built in `lib/copies`): rename onto an existing `nameKey`, and adding by name from a Settings list (`createLocation`), fail `NAME_TAKEN` with the other row's id as `conflictId` (a case-only rename of itself is allowed); only a `Ref` matches an existing name instead. Merge moves copies and the default location, then deletes the source; delete clears copies and the default location. One transaction each, no Undo. The profile default changes only through `lib/account`.
- **Undo:** undoable service functions return `Undone<T>` and join the caller's transaction; the server action wraps its one call in `withUndo`. Each undoable function ships an integration test that undoes it.
- **Look it up again:** rate-limited lookup, `unavailable` never cached; on `found` runs the auto-share transaction without creating a copy (promote in place, or move copies and `user-books` to an existing shared Book and delete the private one only if unreferenced, with its unreferenced private authors, series and cover). Admin's differing hand values are dropped; another user's become overrides. Not undoable.
- **Device preferences** (layout, size) live in the `bookeh_prefs` cookie read at render, so first paint is right. Overlays come from the `components/ui` Base UI wrappers (Sheet, Dialog, Combobox, Picker, Menu); the wide side panel is plain layout, not a drawer.
- **History:** opening Book detail pushes; swapping the Book or changing search/filters/sort replaces; closing is history back (fallback `/`). Overlay and search navigation use `scroll: false`, no prefetch.

## UX & Interaction Patterns

- **Tools row:** search, Filter, Select, rows/covers, s/m/l. Count line: "{n} books", or active values · count · Clear. Row ending: location, lent marker, or "Ordered"; blank with no locations.
- **States:** "No books yet" + dry remark (+ Scan book on wide only); "No books match" + Clear; "Couldn't load. Try again." with a retry Link; "Loading more": progress line, list stays usable. `?book=` for a Book not held → toast "Not in library". A row that stops matching leaves; open detail stays until closed.
- **Density:** DESIGN.md's density table; covers 2:3; size changes what fits, not what is fetched.
- **Filter panel:** left of the list on wide, bottom sheet on phone; applies instantly, no Apply. Option lists with counts and the marker (languages need display names); author/series/publisher comboboxes add to a short list; rating "at least" with a Clear Link; year/pages from–to with an inline error when from > to. Tapping the chosen sort reverses it. 900–1200px: Filter and Book detail are mutually exclusive.
- **Book detail:** phone bottom sheet (a little over half, list dimmed and keeping its scroll position, modal); ≥900px a 360px right panel, not modal, no scrim, clicking another row swaps, X/`Esc` close, `Enter` on a row opens. Content: header, read switch and Rating, "your copies" lines (location + status; owned: Move, Remove; ordered: Received), note saved on blur, foot with Edit. Filter chips (Link style) add to current filters; from `/loans` or a wishlist entry they open the collection with only that filter.
- **Rating:** tap sets, another star changes, tapping the current star does nothing, Clear Link while set.
- **Select mode:** entering closes Book detail; tap ticks; action bar replaces Scan book on phone (count + Done above, actions below), bottom on wide. Actions disabled with nothing ticked; selection survives search, filter, scroll; no select all; Done or `Esc` exits.
- **Toasts / dialogs:** "Marked {n} read · Undo", "{n} moved to {location} · Undo", "Saved to {location} · Undo" (Received), "Shared · from {source}", "Still not found.", "Add the ISBN on Edit book to look it up."; dialog "Remove {n} books from library?".
- **Admin:** Re-fetch placement and result display are picked by Mika from rendered mock-up options and recorded in EXPERIENCE.md before building.
- One overlay deep: a sheet or panel may open one picker or dialog.

## Cross-Story Dependencies

- Done: 5.1–5.12, 5.22, 5.31–5.33, 5.36, 5.37. Next: 5.13.
- The server page seeds `ShelfRowsProvider` with the first `SHELF_PAGE_SIZE` rows; `BookRow` takes a `ShelfRow` and uses no hooks. Filter, Select and the layout/size switches are rendered disabled until 5.14, 5.27 and 5.13 enable them in place. The search field replaces the URL itself and tells its own replace from outside navigation (Clear, Back); keep that intact.
- Actions in 5.18 and 5.23–5.30 call `afterAction`; none patch rows. Open check from 5.12: the restore after a history Back (X on Scan or Edit book) is verified only in jsdom; confirm it in a real browser when a later story touches the list.
- 5.18 builds Book detail's content component; 5.19 renders it in the wide panel; later groups (here and Epics 6, 7, 9) depend only on that component. 5.18 also carries Epic 4's open phone check (camera picker, touch corner crop, HEIC cover upload) and adds the modal guard to the `/` search shortcut.
- 5.14 must name languages for display; the count line shows raw codes until then.
- `moveCopies` and `removeCopies` exist in `lib/copies`; 5.24, 5.28 and 5.30 wire them. 5.27 builds the action bar with count and Done only; Remove, Read, Move (and Tag in 9.8) come with 5.28–5.30. 5.30 reuses the location picker with inline create. Known gap: Undo of a move fails `UNDO_FAILED` if a location it would restore was deleted since (now reachable via Settings).
- 5.33 built the reusable `ListRow` (People, tags, wishlists reuse it).
- 5.35 reuses Epic 3's auto-share and edition picker; split `sharePrivateBook.ts` at its D-8 compare seam when 5.34 or 5.35 touches it. Entries move too once Epic 7 lands.
- The `genre` filter carries only system genre ids here; Epic 9 settles user genre tags. Lent markers and loan actions arrive with Epic 6; tags/themes with Epic 9.
