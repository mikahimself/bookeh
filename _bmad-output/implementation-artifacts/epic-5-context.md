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
- Search covers effective title, author names, series name, ISBN-13 and copy notes: case-insensitive `ILIKE`, no accent folding ("a" never matches "ä"), `%`, `_`, `\` matched literally. It never searches outside the collection.
- Filters: location and status (copy); read and rating "at least" (the viewer's `user-books` row, a missing row = unread, unrated); genre (system genres); language, publisher (exact effective value); author, series; year and pages ranges, inclusive, either end open, an active range excluding Books with no effective value (a cleared override included). Fields AND, values within a field OR. Filters, sort and search use the viewer's overrides.
- Sort: author (default; first effective author's `sortName`, then title; no author last), title, year (no year last both directions), date added; `fi-FI` collation ("Örkki" after "Zorro"); every sort ends on copy id.
- First page for no filter, text search, three combined filters and author sort under 1 s at 10,000 copies on the CI runner.
- Read and rating belong to the user and the Book, not a copy. Notes are per copy.
- Received makes an ordered copy owned at the default location. Ordered copies have no location.
- Locations are optional: a user with none sees no location field, filter, row ending or Move anywhere.
- Bulk actions apply to all ticked copies or none. Removals are confirmed by a dialog and have no Undo; Move, Read and Received have Undo. Rating saves at once without Undo.
- Re-fetch is admin-only, fills only empty shared fields (themes and cover included; an uploaded cover counts as a value), never touches `user-books`. Non-admin calls fail `NOT_FOUND`.
- Every story: strings in English and Finnish, tokens only, accessibility floor (44px tap areas, keyboard reachable; modal sheet and dialogs trap focus, the wide panel does not). Schema-changing stories are verified against a restored production dump before merge.

## Technical Decisions

- **Shelf module (`src/lib/shelf`)** is the only code that filters, sorts or searches copies on Book fields: read-only Drizzle through the `lib/payload` helper. Every query starts from `visibleCopies(viewer)` (today `owner = viewer`) and applies the shared-or-own read rule (`readableBy`) in joins to `books`, `authors`, `series`. Effective values in SQL test whether the field name is in `overridden`; no second effective-value implementation in TypeScript. Author/series filter values are ids matching every readable record with the same `nameKey`. All values are bound parameters.
- **No browsing the catalogue:** nothing lists or searches `books`, `authors` or `series` on their own; they are reached through a copy the viewer can see, or by exact ISBN-13 / `nameKey` match.
- **URL is the state.** Search, filters, sort and the open Book live in `/` search params; only the pure, client-importable `lib/shelf/query.ts` reads or writes them (`parseShelfQuery` → `ShelfAddress { query, book }`, never throws, bad values drop to defaults; `shelfHref(query, { book })`). Filter chips are links built with `shelfHref()`. No page number in the URL. The `/data/shelf` request serializer does not exist yet; add it to `query.ts` with the handler rather than encoding shelf params a second time.
- **One hydrated read:** `getShelfRows(ctx, query, range)` → `ShelfRows { rows, total, labels }`, hydrating ordered ids through `getEffectiveBooks()` and `getHoldings()` (a copy gone between reads is dropped). `labels` is keyed `field:id` for id-valued filters only: a location named for its owner only, a genre in the viewer's language, an author or series only when readable and sharing its `nameKey` with an effective author or series on a visible copy. The page uses it for the first rows, `/data/shelf` (inside `runRoute`) for other ranges. Offset/limit, one fixed page size; `range` is not validated by the shelf module, so `/data/shelf` must validate client input.
- **Filter values and suggestions:** `filterValues(ctx, locale)` returns locations, statuses, genres and languages in use on the viewer's copies with copy counts, never narrowed by the current query (no read/rating values; tags in Epic 9). `/data/suggest?field=author|series|publisher&q=` answers `ActionResult<Suggestion[]>`, at most 10 by name, distinct on `nameKey` preferring the shared record's id (publisher id null); blank `q` → `[]`; bad `field` or `q` over 200 chars → `VALIDATION`.
- **Client list** holds loaded rows keyed by the query without `book`; after any successful action or Undo that can change rows (and after a `NOT_FOUND` action), it reloads rows 0..n via `/data/shelf`. Rows are never patched locally. `sessionStorage` keeps only row count and scroll position per query, restored in one capped request.
- **Indexes** (only if timing fails): `pg_trgm` GIN on stored columns (`books.title`, `authors.name`, `series.name`, `user-books` override columns, `copies.notes`), OR'd in the query; never on computed effective values; keep plain `ILIKE`.
- **Book detail** is one server component rendered by the section page when `?book=` is set; later epics add groups to it only. Every `{ bookId }` from the client and Book detail itself starts with `requireOwnBook(ctx, bookId)` (`NOT_FOUND` unless the viewer holds a copy; open wishlist entries join in Epic 7). Surface code sees only `EffectiveBook` and `UserBookState`.
- **Writers (one per row kind):** `lib/copies` owns copies and locations (move, receive, note, remove, delete/rename/merge location); `lib/books` owns `user-books` via `upsertUserBook()` only (`setRead`, `setRating(ctx, bookId, rating | null)` with `ratedAt`); `lib/catalogue` owns re-fetch and `lookupAgain()`. Selection actions take copy ids and run in one transaction; a single-row action calls the same function with one id. Location picks/creations are a `Ref` (id or `{ create: name }`) resolved inside the action's transaction; Undo leaves a row created this way.
- **`setRead(ctx, target, value | 'toggle')`**, `ReadTarget = { copyIds } | { bookId }`: copy ids not all the viewer's (or empty, or malformed) fail `NOT_FOUND` before any write; applies to the distinct Books; `toggle` → unread only when every Book is read; Books already at the value are not written. Returns `Undone<{ read, count }>` (count = distinct target Books, for "Marked {n} read"); the restore skips Books whose row is gone.
- **Locations:** rename onto an existing `nameKey` fails `NAME_TAKEN` with `conflictId` (case-only rename of itself allowed); merge moves every copy and the default location, then deletes the source; delete clears copies and the default location, then deletes. Each is one transaction, no Undo.
- **Undo:** undoable service functions return `Undone<T>`, open no transaction of their own beyond joining the caller's, and record nothing; the server action wraps its one call in `withUndo`. Each undoable function ships an integration test that undoes it.
- **Look it up again:** rate-limited lookup, `unavailable` never cached; on `found` runs the auto-share transaction without creating a copy (promote in place, or move copies and `user-books` to an existing shared Book and delete the private one only if unreferenced, with its unreferenced private authors, series and cover). Admin's differing hand values are dropped; another user's become overrides. Not undoable.
- **Back office:** grouping, list columns and a light theme via `admin.css` and collection config only; read current Payload admin docs first.
- **Device preferences** (layout, size) live in the `bookeh_prefs` cookie read at render, so first paint is right. Overlays come from the `components/ui` Base UI wrappers (Sheet, Dialog, Combobox, Picker, Menu); the wide side panel is plain layout, not a drawer.
- **History:** opening Book detail pushes; swapping the Book or changing search/filters/sort replaces; closing is history back (fallback `/`). Overlay links use router navigation with `scroll: false`, no prefetch.

## UX & Interaction Patterns

- **Tools row:** search, Filter, rows/covers, s/m/l, Select. Count line: "{n} books", or active values · count · Clear. Search applies after a short pause; `/` focuses it on wide screens. Row ending: location, lent marker, or "Ordered"; blank with no locations.
- **States:** "No books yet" + one dry remark (+ Scan book on wide only); "No books match" + Clear; "Couldn't load. Try again." with a retry Link; a progress line for loading more, no skeletons. `?book=` for a Book not held → toast "Not in library". A row that stops matching leaves; open detail stays until closed.
- **Density:** follow DESIGN.md's density table; covers 2:3; size changes what fits, not what is fetched.
- **Filter panel:** left of the list on wide, bottom sheet on phone; applies instantly, no Apply. Option lists with counts and the marker; author/series/publisher comboboxes add to a short list; rating "at least" with a Clear Link; year/pages from–to with an inline error when from > to. Tapping the chosen sort reverses it. 900–1200px: Filter and Book detail are mutually exclusive.
- **Book detail:** phone bottom sheet (a little over half, list dimmed, modal); ≥900px a 360px right panel, not modal, no scrim, clicking another row swaps, X/`Esc` close, `Enter` on a row opens. Content: header, read switch and Rating, "your copies" lines (location + status; owned: Move, Remove; ordered: Received), note saved on blur, foot with Edit. Filter chips (Link style) add to current filters; from `/loans` or a wishlist entry they open the collection with only that filter.
- **Rating:** tap sets, another star changes, tapping the current star does nothing, Clear Link while set.
- **Select mode:** entering closes Book detail; tap ticks; action bar replaces Scan book on phone (count + Done above, actions below), bottom on wide. Actions disabled with nothing ticked; selection survives search, filter, scroll; no select all; Done or `Esc` exits.
- **Toasts / dialogs:** "Marked {n} read · Undo", "{n} moved to {location} · Undo", "Saved to {location} · Undo" (Received), "Shared · from {source}", "Still not found.", "Add the ISBN on Edit book to look it up."; dialogs "Remove {n} books from library?".
- **Settings → Locations:** reusable List row (name, count in muted meta; built here, reused by People, tags, wishlists) with Rename, Merge, Delete Links; "Add location"; "No locations"; rename onto a used name offers merge; Merge and Delete confirmed by dialog (Delete says how many books lose their location).
- **Admin:** Re-fetch placement and result display are picked by Mika from rendered mock-up options and recorded in EXPERIENCE.md before building. "Last backup: {date}"; `danger` "Backup is overdue." when >48 h, missing or failed; absent for non-admins.
- One overlay deep: a sheet or panel may open one picker or dialog.

## Cross-Story Dependencies

- Order: query slices 5.5, 5.6 → **5.7 timing (and any indexes) before any collection screen** → screens. Done: 5.1, 5.2, 5.3, 5.4, 5.8, 5.9, 5.22.
- `getShelfRows` and `shelfIds` accept the sort type without `author`; 5.6 widens both. 5.5 adds author, series and genre conditions beside 5.4's `scalarFilters`.
- 5.10 renders the first page through `getShelfRows`; 5.11 builds `/data/shelf` (range validation, request serializer in `query.ts`) and the reload rule; 5.12 builds on 5.11.
- 5.18 builds Book detail's content component; 5.19 renders it in the wide panel; later groups (here and Epics 6, 7, 9) depend only on that component. 5.18 also carries Epic 4's open phone check (camera picker, touch corner crop, HEIC cover upload).
- 5.22 `setRead` serves 5.23 and 5.29. `moveCopies` and `removeCopies` already exist in `lib/copies`; 5.24, 5.28 and 5.30 wire them. 5.27 builds the action bar with count and Done only; Remove, Read, Move (and Tag in 9.8) are added by 5.28–5.30.
- 5.31–5.32 services precede the 5.33 Settings UI. 5.30 Move reuses the location picker with inline create.
- 5.35 reuses Epic 3's auto-share and edition picker; consider splitting `sharePrivateBook.ts` at its compare seam when touched. Entries move too once Epic 7 lands.
- 5.37 reads `last-backup.json` written by the Epic 2 backup script.
- The `genre` filter carries only system genre ids here; the encoding for user genre tag ids must be settled in the spine before Epic 9's genre-tag filter.
- Lent markers and loan actions arrive with Epic 6; tags/themes chips and filters with Epic 9.
