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

- The app opens on the collection; there is no home screen. One row is one copy, and only the viewer's own copies are ever listed.
- Search covers title, author, series, ISBN-13 and copy notes: case-insensitive, no accent folding ("a" never matches "ä"), `%`, `_`, `\` matched literally. It never searches outside the collection.
- Filters: location, status, read, rating (at least), genre, language, author, series, publisher, year and pages ranges (either end open; an active range excludes Books with no value). Fields AND, values within a field OR. Filters and sort use the viewer's overrides. Missing `user-books` row = unread, unrated.
- Sort: author (default, by first effective author's sort name, no-author last), title, year (no year last both directions), date added; Finnish collation ("Örkki" after "Zorro"); every sort ends on copy id.
- First page for no filter, text search, three combined filters and author sort under 1 s at 10,000 copies on the CI runner.
- Read and rating belong to the user and the Book, not a copy. Notes are per copy.
- Received makes an ordered copy owned at the default location. Ordered copies have no location.
- Locations are optional: a user with none sees no location field, filter, row ending or Move anywhere.
- Bulk actions apply to all ticked copies or none. Removals are confirmed by a dialog and have no Undo; Move, Read and Received have Undo.
- Re-fetch is admin-only, fills only empty shared fields (themes and cover included; an uploaded cover counts as a value), never touches `user-books`. Non-admin calls fail `NOT_FOUND`.
- Every story: strings in English and Finnish, tokens only, accessibility floor (44px tap areas, keyboard reachable, modal sheet/dialogs trap focus, panel does not). Schema-changing stories are verified against a restored production dump before merge (real data exists now).

## Technical Decisions

- **Shelf module (`src/lib/shelf`)** is the only code that filters, sorts or searches copies on Book fields: read-only Drizzle through the `lib/payload` helper (one of the three system-privilege places). Every query starts from `visibleCopies(viewer)` (today `owner = viewer`) and applies the shared-or-own read rule in joins to `books`, `authors`, `series`. Effective values in SQL test whether the field name is in `overridden`. Author/series filter values are ids matching every readable record with the same `nameKey`; genre matches system genres.
- **URL is the state.** `ShelfQuery` (q, filters, sort, dir) plus `book` lives in search params; only `parseShelfQuery()` and `shelfHref(query, { book })` in the pure `lib/shelf/query.ts` read or write them (client components may import it). Unknown params fall back to defaults; no page number in the URL.
- **One hydrated read:** `getShelfRows(ctx, query, range)` → `ShelfRows { rows, total, labels }`, hydrating ordered ids through `getEffectiveBooks()` and `getHoldings()`. The page uses it for the first rows, `/data/shelf` (inside `runRoute`) for any other range. Offset/limit, one fixed page size.
- **Client list** holds loaded rows keyed by the query without `book`; after any successful action or Undo that can change rows, it reloads rows 0..n via `/data/shelf`. Never patch rows locally. `sessionStorage` keeps only row count and scroll position per query, restored in one capped request.
- **Filter values and suggestions** are shelf queries on `visibleCopies` with copy counts; suggestions (`/data/suggest`) are distinct on `nameKey`, preferring the shared record's id. Location use counts come from here.
- **Indexes** (only if timing fails): `pg_trgm` GIN on stored columns (`books.title`, `authors.name`, `series.name`, `user-books` override columns, `copies.notes`), OR'd in the query; never an index on computed effective values; keep plain `ILIKE`.
- **Book detail** is one server component rendered by the section page when `?book=` is set; later epics add groups to it only. Every `{ bookId }` from the client and Book detail itself starts with `requireOwnBook(ctx, bookId)` (`NOT_FOUND` unless the viewer holds a copy or open entry). Surface code sees only `EffectiveBook` and `UserBookState`.
- **Writers (one per row kind):** `lib/copies` owns copies and locations (move, receive, note, remove, `deleteLocation`, `renameLocation`, `mergeLocation`); `lib/books` owns `user-books` via `upsertUserBook()` (`setRead(ctx, target, value | 'toggle')`, `setRating(ctx, bookId, rating | null)`); `lib/catalogue` owns re-fetch and `lookupAgain()`. Selection actions take a list of copy ids, run in one transaction; read applies to distinct Books; `toggle` resolves to unread only when every Book is read. Single-row actions call the same function with one id. Location picks/creations are a `Ref` (id or name) resolved by `lib/copies` inside the action's transaction.
- **Locations:** rename onto an existing `nameKey` fails `NAME_TAKEN` with `conflictId` (case-only rename of itself allowed); merge moves every copy and the default location then deletes the source; delete clears copies and the default location then deletes — each one transaction, no Undo.
- **Undo:** undoable service functions return `Undone<T>` (result + restore over ids and previous values), open no transaction; the action wraps its one call in `withUndo`. Each undoable function ships an integration test that undoes it.
- **Look it up again** (`lookupAgain`): rate-limited `lookupBook`, `unavailable` never cached; on `found` runs the auto-share transaction without creating a copy (promote in place, or merge into an existing shared Book and delete the private one only if unreferenced, cleaning up unreferenced private authors/series/cover). Admin's differing hand values dropped; another user's become overrides. Not undoable; other users' private Books untouched.
- **Back office:** theme and grouping via `admin.css` and collection config only; read current Payload admin docs first; no restructured components.
- **Device preferences** (layout, size) live in the `bookeh_prefs` cookie read at render, so first paint is right. Overlays come from the `components/ui` Base UI wrappers; the wide side panel is plain layout, not a drawer.
- **History:** opening Book detail pushes; swapping the Book, changing search/filters/sort replaces; closing is history back (fallback `/`).

## UX & Interaction Patterns

- **Collection tools row:** search, Filter, rows/covers, s/m/l, Select. Count line under search: "{n} books", or active values · count · Clear. Search filters after a short pause; `/` focuses it on wide screens. Row ending: location, or lent marker "Lent · {person}", or "Ordered"; blank with no locations.
- **States:** "No books yet" + one dry remark (+ Scan book on wide only); "No books match" + Clear; "Couldn't load. Try again." with retry Link; progress line for loading more, no skeletons. `?book=` for a Book not held → section without detail, toast "Not in library". A row that stops matching filters leaves; open detail stays until closed.
- **Density:** follow DESIGN.md's density table (rows 16×24 / 32×48 / 44×66 covers; cover columns ≥76/116/160px); covers 2:3; size changes what fits, not what is fetched.
- **Filter panel:** left of the list on wide (separated by space), bottom sheet on phone; applies instantly, no Apply. Option lists with counts and the 8px accent marker; author/series/publisher are comboboxes adding to a short list; rating "at least" with Clear Link; year/pages from–to with an inline error when from > to. Sort by author/title/year/date added; tapping the chosen sort reverses it. 900–1200px: Filter and Book detail are mutually exclusive.
- **Book detail:** phone bottom sheet (a little over half, list dimmed, modal; half-open shows header, read/rating and first copies); wide ≥900px a 360px right panel, hairline left border and the one shadow, no scrim, not modal, click another row swaps, X/`Esc` close, `Enter` opens a focused row; reduce motion → immediate. Content: header (cover, title, author, series and number, edition line), read/unread switch and Rating, "your copies" lines (location chip + status; owned: Move, Remove; ordered: "Ordered" + Received), note edited in place saved on blur, foot with Edit. Selection bar marks the open row. Filter chips are styled as Links and add to current filters (phone sheet closes); from `/loans` or a wishlist they open the collection with only that filter.
- **Rating:** tap sets, another star changes, current star does nothing, Clear Link while set; saves at once with `ratedAt`, no Undo.
- **Select mode:** entering closes Book detail; checkboxes on rows/tiles; tap ticks. Action bar replaces Scan book on phone (two rows: count + Done above, actions below); bottom on wide with Scan book in header. Actions disabled while nothing is ticked; selection survives search, filter, scroll; no select all; Done or `Esc` exits and clears.
- **Toasts:** "Marked {n} read · Undo", "{n} moved to {location} · Undo", "Saved to {location} · Undo" (Received), "Shared · from {source}", "Still not found."; remove dialogs "Remove {n} books from library?" (destructive button/Link, Cancel).
- **Settings → Locations:** List row (name in title, count right in meta, `text-muted`; built here, reused later by People, tags, wishlists) with Rename, Merge, Delete Links (second line on phone); "Add location" opens an empty field in place; "No locations" when empty; rename onto a used name offers merge; Merge and Delete confirmed by dialog (Delete says how many books lose their location).
- **Admin:** Re-fetch placement and result display are chosen by Mika from rendered mock-up options and recorded in EXPERIENCE.md before the screen is built. "Last backup: {date}"; `danger` with "Backup is overdue." when >48 h, missing or failed; absent for non-admins.
- One overlay deep: a sheet or panel may open one picker/dialog (the edition picker over Book detail counts as that one).

## Cross-Story Dependencies

- Order: 5.1 → query slices 5.2–5.6 → **5.7 timing (and any indexes) before any collection screen** → 5.8, 5.9 → screens.
- 5.18 builds Book detail's content component; 5.19 renders the same component in the wide panel; all later groups (here and in Epics 6, 7, 9) depend only on the content component.
- 5.22 `setRead` serves 5.23 and 5.29. 5.27 builds the action bar with count and Done only; Remove, Read, Move and Tag are added by 5.28–5.30 and Story 9.8.
- 5.9 also turns Edit book's author/series fields (Story 4.8) into comboboxes over `/data/suggest`.
- 5.31–5.32 services precede 5.33 Settings UI. 5.30 Move reuses the location picker with inline create.
- 5.18 carries the phone check left open by Epic 4: from Book detail's Edit, the `image/*` picker offers the camera, an iPhone photo goes through the corner crop by touch, and a HEIC photo uploads as the cover.
- 5.35 reuses Epic 3's auto-share (`sharePrivateBook`) and edition picker; entries moving with the Book arrive in Epic 7 (Story 7.7). The Epic 4 retro suggests splitting `sharePrivateBook.ts` at its D-8 compare seam when this epic's re-fetch/look-again work touches it.
- 5.37 reads `last-backup.json` written by the Epic 2 backup script.
- Lent markers, Lend/Returned on copy lines and loan removal on delete arrive with Epic 6; tags/genres/themes chips and filters with Epic 9.
