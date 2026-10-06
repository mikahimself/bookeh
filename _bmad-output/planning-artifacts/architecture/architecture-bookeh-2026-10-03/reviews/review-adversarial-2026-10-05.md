---
title: Adversarial review — Architecture Spine after the UX update
reviewed: ../ARCHITECTURE-SPINE.md (status draft, updated 2026-10-05)
against: ../../../ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md, ../../../prds/prd-bookeh-2026-10-02/prd.md, ../STORY-SLICING.md, the pre-update spine, review-adversarial.md (2026-10-03)
created: 2026-10-05
---

# Adversarial review, second pass: what the UX update opened

## Verdict

Not safe to slice the D, E, F, G, H, I and J tracks yet. The update names the right mechanisms (one Undo store, save-first, one hydrated shelf read, three lookup outcomes), but it stops at "each action has a function" and leaves open how those functions compose, what they take and return, and what the list does after they run. One finding can silently damage shared data, eight mean certain rework between stories that are already in STORY-SLICING, and the rest are contract gaps of one sentence each.

Counts: 1 critical, 8 high, 11 medium, 5 low.

The first-pass closures (AD-16 context, AD-17 relation targets, AD-19 constraints, `nameKey`, lazy `user-books`) hold up. Nothing below re-opens them.

## How to read the findings

Each finding names units one level down (slice ids from STORY-SLICING where they exist), shows that each obeys the spine and EXPERIENCE.md as written, shows the clash, and gives the tightest amendment.

Payload behaviour cited below was read in `node_modules` at 3.88.0:

| Fact | Where |
| --- | --- |
| A `hasMany` relationship row in `<table>_rels` has `ON DELETE CASCADE` towards the related document. Deleting an author silently removes it from every `books_rels` and `user_books_rels` row. | `@payloadcms/drizzle/dist/schema/build.js`, line 571 |
| A single relationship column has `ON DELETE SET NULL`. Deleting a series silently empties `books.series` and `user_books.series`; a required column fails instead. | `@payloadcms/drizzle/dist/schema/traverseFields.js`, line 749 |
| A `req` whose `transactionID` belongs to a finished transaction does not fail. It falls back to the pool and writes outside any transaction. | `@payloadcms/drizzle/dist/utilities/getTransaction.js` |

Not verified: `@base-ui/react` is not installed, so whether its sheet covers the half-open, draggable bottom sheet (EXPERIENCE open item 6) is still open. The module-instance behaviour in M10 is from memory of Next.js issues, not from the bundled docs; it needs a five-minute test.

---

## Critical

### C1 — Undo of a save can delete an author or series that another Book or another user's override still uses

- **Units:** D6 (save receipt and restore) against C5/D1 (`findOrCreateByName` matching an existing shared author for a later Book) and D19 (author overrides).
- **Each complies:** AD-11: the restore "deletes a created Book, author, series or media row only when no row of any user references it". AD-3: `lib/catalogue` has system privileges "for writes to `books`, `authors`, `series` and `media` only", and private collections go through the gateway, which shows only the acting user's rows. D6 therefore checks what it can see: the user's copies, entries and `user-books` rows. A strict reader also takes "row of any user" to exclude `books` rows, which belong to nobody.
- **Incompatibility:**
  - Save A creates shared author X. Before A's receipt expires, save B (another tab, the desktop beside the phone, or a second user in Phase 2) creates Book B and matches X. Undo of A finds no user row pointing at X and deletes it. `books_rels` cascades: shared Book B loses its author with no error. For a series, `books.series` becomes null.
  - In Phase 2 another user's override may point at X or at Book A. The gateway check cannot see it. The author vanishes from their `user_books_rels`; their row still lists `authors` in `overridden`, which AD-6 reads as "cleared".
  - The rule as written has no legal implementation: reading every user's rows is not on the AD-3 allowlist.
- **Reachability:** low with one user on one device, because a new Answer replaces the toast. Real with two tabs, and a certainty class in Phase 2. The receipt lifetime is deferred, which widens the window.
- **Severity:** critical (silent loss in shared data and in another user's private data).
- **Amendment (AD-11, AD-3):** A created Book, author, series or media row is deleted only when `isUnreferenced()` in `lib/catalogue` says no row in any table references it, including `books` and `user-books` relation rows. `isUnreferenced()` is a read-only system-privilege query that returns a boolean and is added to the AD-3 allowlist; the restore deletes in dependency order (copy or entry, `user-books`, Book, then authors, series, media).

---

## High

### H1 — Who records the receipt, and in which transaction, is decided per function

- **Units:** F6 (move with Undo), H13 (Received with Undo), E24, G7, J3 as callees; D22 (`editBook` writes the copy's status and location "through their own writers"), D6 and H6 (restores that call `remove`, reopen entries), U1 (`undo` runs the restore "through the owning services' writers"), A11 (`withTransaction`).
- **Each complies:** AD-20: "The service function the action calls records it after its transaction commits... A function called by another service returns its restore data to the caller and records nothing." F6 exports `moveCopies(ctx, ids, location): Undoable<...>`, which opens a transaction, commits and records. D22 must call that same writer inside `editBook`'s transaction. U1's restore for a save calls `remove`; the restore for Move calls `moveCopies`.
- **Incompatibility:**
  - One function cannot be both forms. D22 either gets a receipt recorded mid-transaction (AD-20 says `editBook` records none), adds a flag F6 did not design, or writes `copies` through the gateway (a second writer).
  - "Restore data" has no shape. H7 returns `closedEntryIds: number[]`; D6 expects a `Restore` it can compose; H6 expects something else again.
  - A11 does not say what `withTransaction` does on a context that already carries a transaction. If it opens a new one, `saveCopy` → `createCopy` cannot see the uncommitted Book; if a callee commits, `undo` is not "nothing is restored" on failure.
  - A restore, or post-commit code, that holds the original transaction context does not fail. Per the facts table it silently runs on the pool, outside `undo`'s transaction, and the "ships a test that undoes it" convention passes.
- **Severity:** high.
- **Amendment (AD-20, AD-16):** An undoable operation is written once as `op(ctx, input): Promise<{ data: T; restore: Restore }>` that neither opens a transaction nor records; `undoable(op)` from `lib/undo` is the only wrapper that opens the transaction, records after commit and returns `Undoable<T>`, and only server actions call the wrapped form. `withTransaction` on a context that already carries a transaction runs `fn` in it; a `Restore` uses only the context it is handed.

### H2 — A copy's status, location and notes have no named updater

- **Units:** D22 (`EditBookInput.copy` with `status?: 'owned' | 'ordered'`, `location?`), H13 (`receive`), F6 (`move`), E12 (note editing on a copy's line), B7 (`copies` hooks).
- **Each complies:** `lib/copies` lists `createCopy, move, receive, remove`. AD-5 and AD-11 send copy edits "through their own writers". Nothing sets owned → ordered, and nothing writes notes. D22 calls `receive` for ordered → owned, which "makes it owned at the default location", then `move` with the submitted location, or the other way round. E12, a screen story, updates `notes` through the gateway.
- **Incompatibility:**
  - `receive` overwrites a location the same edit set, or the edit's location is overwritten by the default, depending on call order.
  - "Add to library, then Edit, then status ordered" leaves the copy ordered at Tampere. The location filter then counts a book that is not there, while the row ends in "Ordered". Whether an ordered copy may have a location is a `copies` hook in one story, a service rule in another, and no rule in a third. H13's restore ("sets the copy back to ordered") does not know which location to put back.
  - Owned → ordered on a lent copy: `lendCopy` checks "owned" once; nobody checks afterwards.
- **Severity:** high.
- **Amendment (AD-18, AD-8):** `updateCopy(ctx, copyId, { status?, location?, notes? })` in `lib/copies` is the only updater of a `copies` row; `move`, `receive` and `editBook` call it. An ordered copy has no location (a `copies` hook clears it), `receive` applies the `undefined`-means-default rule, and a copy with an open loan cannot be set to ordered (`COPY_LENT`).

### H3 — Read and tag take copy ids, but Book detail is keyed by Book and may have no copy

- **Units:** E24 (mark read on a selection, with Undo) and G7 (tag on a selection) against E11 (read and rating in Book detail, sliced on `upsertUserBook`) and G2 (tag picker in Book detail).
- **Each complies:** AD-18: selection actions "take a list of copy ids... The single-row action calls the same function with one id." EXPERIENCE: read, rating and tags belong to the Book; Book detail opens for a Book the user only has on a wishlist (`requireOwnBook`: copy or entry). The Undo table says "Read (one or many)" and "Tag (many)".
- **Incompatibility:**
  - A wishlist-only Book has no copy id to pass. E11 calls `upsertUserBook` directly, so the single read switch has no Undo, against the table; or it picks "one of the copies" and fails for wishlist-only Books.
  - "Marks every ticked Book read, or unread if all are already read": `ShelfRow` carries no read flag and the selection includes rows not loaded, so the client cannot decide. E24 builds a toggle; E11 needs an explicit value. The toast needs the direction and a count, and "{n}" is copies in one story and Books in another.
  - G2's single tag calls G7's function (AD-18) and so records a receipt, while the table lists Undo for "Tag (many)" only.
- **Severity:** high.
- **Amendment (AD-18, AD-20):** Book-level functions in `lib/books` take `{ copyIds: number[] } | { bookId: number }`: `setRead(ctx, target, read: boolean | 'toggle')` returns `{ books: number; read: boolean }`, `changeTags(ctx, target, { add, remove })` returns `{ books: number }`, and both are undoable for every caller. EXPERIENCE's Undo row for Tag loses "(many)".

### H4 — The collection list has no contract for what happens after a change

- **Units:** E19 (endless scrolling over `/data/shelf`) against F4/F6 (Move), E25 (Remove), E24, J4 (Lend and Returned in the sheet), U2 (Undo), A21 (preferences action), E8 (`?book=` navigation).
- **Each complies:** AD-7: offset paging, one fixed page size, `getShelfRows(ctx, query, page)`, "the client drops rows whose copy id it already holds". EXPERIENCE: moved rows "leave the list", the count line drops from 31 to 19, Undo puts them back "in the list", a lent row gains its marker, the list keeps its scroll position.
- **Incompatibility:**
  - Twelve of 150 held rows leave. E19 asks for page 4 at offset 150; the server list is twelve shorter, so twelve rows are skipped and never shown. De-duplication covers inserts before the offset, not removals.
  - Undo returns rows to positions the client cannot know. `total` in the count line is whatever the last page said.
  - A server action that sets a cookie or calls `revalidatePath`, and every `?book=` navigation, re-renders the server page, which holds page 1 only. One story resets the client list and loses the scroll position; another keeps stale rows, so a row on page 4 never shows "Lent · Antti".
- **Severity:** high.
- **Amendment (AD-7):** `getShelfRows(ctx, query, { offset, limit })` returns `{ rows, total }`; scrolling asks for `offset = rows held` with the fixed page size, and after any action or Undo that succeeds the list reloads `offset 0, limit = rows held` through `/data/shelf` and replaces its rows and `total`. The list's client state is keyed by the shelf query alone, so `?book=` and preference changes never reset it, and services never call `revalidatePath`.

### H5 — The surface may call the gateway directly, around every single-writer rule

- **Units:** E12 (copy note and removal on a copy's line, a screen story), D21 (Edit book's author and series combobox), any settings screen, against the service stories that own those rows.
- **Each complies:** The diagram has `FE --> GW`, and AD-2 only demands that frontend-reachable code use the gateway. AD-18 names sole inserters and matchers, not sole updaters. AD-7's ban reads "No *service* lists or searches `books`, `authors` or `series`". AD-6 forbids the surface reading a `books` document, nothing else.
- **Incompatibility:**
  - E12 updates `copies.notes` in its action; H2's updater never sees it. Two owners of one row.
  - D21 fills the author combobox with a gateway `find` on `authors` (`like`), which AD-4 read access allows over every shared author. That is the browse path AD-7 says it prevents, built by a story that broke no rule.
- **Severity:** high (privacy path in Phase 2, two writers now).
- **Amendment (Design Paradigm, AD-7):** `app/(frontend)` imports from `lib/payload` only `requireUser` and the `Context` type, enforced by lint; every read and write is a service function, the profile fields in a small `lib/profile`. AD-7's sentence binds all code, and author, series and publisher options everywhere come from `/data/suggest`.

### H6 — "This user's copies and entries of a Book" is assembled three times

- **Units:** I1 (Answer facts from `lookupBook`), E8 with J4, J9 and the "On wishlists" group (Book detail), I11/I6 (Lookup's "In your library" rows), E17 (`ShelfRow`).
- **Each complies:** `LookupResult.existing.mine` is `{ copyIds, entryIds }`. The Answer needs each copy's location and status, the lent marker with the borrower, and "On {list}" per entry. Book detail needs the same plus notes, loan dates and recipients. AD-7 gives Lookup's own-library search a `visibleEntries` fragment and no return type. Each story fetches the rest itself.
- **Incompatibility:** Three derivations of "open loan", "open entry" and "ordered". `ShelfRow.loan` has no loan id, so the Loans section returns by loan id and Book detail by copy id: two `return` signatures in J3. Entry rows in Lookup results get a shape I6 invents.
- **Severity:** high.
- **Amendment (Seed, AD-9):** `lib/books` declares `CopyLine = { copyId; status; location: Named | null; loan: { loanId; person: Named; since: string } | null; notes: string | null }`, `EntryLine = { entryId; wishlist: Named; forPerson: Named | null }` and `getHoldings(ctx, bookIds): Map<number, { copies: CopyLine[]; entries: EntryLine[] }>`. `LookupResult.existing.mine` is that value, `ShelfRow` is `CopyLine & { book }`, own-library search returns `{ book: EffectiveBook; copies; entries }[]`, and `returnLoan` takes a copy id.

### H7 — Wishlist entries have two writers of `closedAt`, an undefined Remove, and "entry" means open in one AD and any in another

- **Units:** H6 (`closeEntry`), H7 (`createCopy` closes entries), H8 (Remove on an entry), H3 (`saveEntry`), E21 (`requireOwnBook`), C6/I1 (`mine.entryIds`, the "On wishlist" heading), D6 (restore rule), J7 (Person delete rule).
- **Each complies:** AD-18: `createCopy` in `lib/copies` "closes the user's open wishlist entries for that Book that have no recipient". `lib/copies` imports no service, so it sets `closedAt` through the gateway while `closeEntry` in `lib/wishlists` does the same. AD-8: "a closed entry keeps its row". EXPERIENCE: "A bought, ordered or removed entry leaves the list". AD-7: `requireOwnBook` passes with "a copy or wishlist entry". AD-11: the `user-books` row goes when the user has "no other copy or entry".
- **Incompatibility:**
  - `closeEntry` → `createCopy` closes the same entry twice, or in an order the receipt does not expect. Bought on "Me" also closes the same Book on "Christmas"; EXPERIENCE's Undo "reopens the entry", singular.
  - H8 deletes the row; another reading sets `closedAt`. A Person delete then fails or passes depending on which.
  - E21 counts closed entries and I1 does not: `?book=` opens a detail for a Book the Answer calls "Not in library", or the reverse after Bought for Äiti.
  - Nothing says who inserts an entry or whether a Book can be on one list twice. H3 inserts in `lib/catalogue`; a wishlist screen story adds `addEntry` in `lib/wishlists`.
- **Severity:** high.
- **Amendment (AD-8, AD-18):** `lib/wishlists` is the only writer of `wishlist-entries`: `createEntry`, `closeEntries`, `reopenEntries`, `setRecipient`, `removeEntry` (deletes the row). `saveCopy` and `closeEntry` call `closeEntriesForBook()` and then `createCopy()`, which no longer touches entries. A list has at most one open entry per Book; "entry" means an open entry in AD-7, AD-9 and AD-11, and any entry in the Person delete rule and in C1's reference check.

### H8 — A wishlist's overlay is addressed as Book detail, but its actions need the entry

- **Units:** H11 (one wishlist), E8 (Book detail, "one server component"), H8 (Bought, Ordered, Remove "on an opened entry"), H12 (the For field).
- **Each complies:** Routes: "`?book=<bookId>` on `/`, `/loans` and `/wishlists/[listId]` — Book detail: one server component". H11 links rows to `?book=`. EXPERIENCE's "Entry opened" is a different sheet: Book header, "On {list}", For, Bought.
- **Incompatibility:** H8 and H12 have no entry id in the address and no place in E8's component. One story adds `?entry=`, another passes a "wishlist mode" into Book detail and resolves the entry from (list, Book), which is unique only if H7's rule exists.
- **Severity:** high (URL contract; H11, H8 and H12 cannot all merge as written).
- **Amendment (Routes):** On `/wishlists/[listId]` the overlay is `?entry=<entryId>`, the entry view, its own component. `?book=` applies to `/` and `/loans` only. For Mika: Book detail of a wished Book is then reached only if the entry view links to it.

---

## Medium

### M1 — Inline creation: some inputs take ids, some names

- **Units:** J3/J4 (Lend with a new Person), F6/F4 (Move to a new location), G7/G2 (tags), H10 (New list in the picker), H12 (For), A23 (the combobox wrapper).
- **Each complies:** `EditBookInput.tags` is names, `copy.location` an id, `SaveInput.save.wishlist` an id, `BookEdits.authors` names. EXPERIENCE: a combobox value "can be created from the same field". AD-18: "Screens never match names."
- **Incompatibility:** J3 takes a name and find-or-creates inside the lend transaction; F6 takes an id, so F4 needs a separate create action that commits before the move; A23 is built for one of the two. On Undo, one story deletes the row it created and another leaves it.
- **Amendment (AD-18):** A service input that refers to a private name-keyed row is `number | { name: string }`, resolved by the owning service inside the action's transaction; there is no stand-alone create action behind a combobox. Undo never deletes a name-keyed row.

### M2 — `ActionResult` cannot carry what the spine promises

- **Units:** F7, G8, J7 (rename fails with "`NAME_TAKEN` carrying the existing row's id") against A13 (`ActionResult`), F8, G9, J8 (offer the merge); D17, F4, H8, E24 (toasts).
- **Each complies:** The failure arm is `{ ok: false; code; fields? }`. `SaveResult` is `{ undoToken, bookId, copyId?, entryId? }`.
- **Incompatibility:** The id has nowhere to go, so the screen looks the row up by name (AD-18 forbids it). "Saved to {location}", "{n} moved to {location}", "Lent to {person}", "Marked {n} read" need values the results do not hold; D17 reads the default location at render and is wrong when `createCopy` chose otherwise. Bought for a Person creates no copy, and no result says so.
- **Amendment (Errors, Seed):** The failure arm gains `details?: Record<string, string | number>`, passed through by `runAction`. `SaveResult` gains `location: Named | null`, and the seed prints the result type of each undoable action (`MoveResult`, `CloseEntryResult` with `copyId?`, and so on).

### M3 — Client-initiated reads have no error, sign-out or ownership contract

- **Units:** C8 (`/data/lookup`), D9/D16 (Scan and Answer), E19, E18, D10 (handlers), I6 (`/scan/find` renders `searchBooks`), A10/A16 (`requireUser`, sign-in).
- **Each complies:** `runAction` and `ActionResult` are for server actions. "Every... route handler starts with `requireUser()`, which redirects to sign-in." Routes: `/scan?isbn=` is the Answer.
- **Incompatibility:**
  - One handler returns `ActionResult` JSON with HTTP 200, another returns 429 with a text body; "Too many lookups" and "Couldn't load" are wired per screen. A rate-limit `DomainError` thrown while `/scan/find` renders reaches an error boundary.
  - A `fetch` that hits the redirect receives the sign-in page as HTML.
  - D9 fetches `/data/lookup` and swaps the URL; D16 reads `searchParams` and calls `lookupBook` at render. Both are legal; a reload, the rate limit and the camera staying on behave differently.
  - The return address after sign-in has no parameter name shared by A10 and A16.
- **Amendment (AD-10, Errors):** `/data/*` handlers run inside `runRead()` from `lib/errors` and answer `ActionResult<T>` as JSON, with 401 and no redirect when signed out; pages catch `DomainError` and render the state. The Scan client is the only caller of `/data/lookup`, the server renders the Answer only on a direct load of `/scan?isbn=`, and sign-in returns to `/login?next=<path>`.

### M4 — Edit book: where it returns, how the toast survives, and the wide layout

- **Units:** D21, D22, D17, A17/U2 (toast), E8.
- **Each complies:** Routes: `/books/[bookId]/edit` is a page. EXPERIENCE: Save "returns to where the user came from, with the toast 'Saved'"; on wide screens Edit book "opens in the detail panel's place, not full screen"; Add to library returns to Scan with the toast.
- **Incompatibility:** The address carries no origin, so D21 redirects to `/?book=` while D22 expects `/scan`. An action that calls `redirect()` never returns its `ActionResult`, so there is no toast and no `undoToken`. A page of its own cannot render "in the panel's place" beside a list whose query it does not have.
- **Amendment (Routes, AD-10):** Edit book is a full page at every width in Phase 1 and returns with history back (carried back to EXPERIENCE). Actions never redirect on success; the client navigates, and one toaster mounted in the frontend root layout holds the toast across the navigation.

### M5 — The lookup draft carries the remote cover URL to the browser

- **Units:** C6 (`lookupBook`), D16 (Answer), D10 (`Cover`, preview handler).
- **Each complies:** `draft: Omit<SourceResult, 'raw'>` keeps `coverUrl`, which in `SourceResult` is the source's URL. AD-14: "`coverUrl()` produces that URL too". C6 leaves the field alone, or rewrites it; D16 renders what it gets.
- **Incompatibility:** With C6 leaving it, the phone loads the cover from Finna or Google, against AD-14, and the URL is in the `/data/lookup` response either way. `SearchHit` already avoids this with `hasCover`.
- **Amendment (Seed, AD-14):** `draft` is `Omit<SourceResult, 'raw' | 'coverUrl'> & { coverUrl: string | null }`, and every `coverUrl` that leaves `lib/catalogue` is the output of `coverUrl()`. `SearchHit` uses the same field.

### M6 — ISBN auto-share has no reachable trigger

- **Units:** C6 (`lookupBook`), D8 (auto-share during save), I9 (Answer when sources did not answer).
- **Each complies:** AD-9: the order is a readable Book first, "then the user's own private Book", then `lookupSources`, so a private Book ends the lookup. AD-5: auto-share happens in the save "when a source now answers". EXPERIENCE: until told otherwise, `unavailable` shows Not found with the manual form.
- **Incompatibility:** Nobody asks the sources again. D8 either reads a cache nothing filled (dead code) or calls the sources on every save to a private Book, a network wait on "Add another copy". A Book entered by hand during a Finna outage stays private and poor for good. What Undo does after an auto-share is also unsaid.
- **Amendment (AD-9, AD-5, AD-11):** When the ISBN resolves to the user's own private Book, `lookupBook` also runs `lookupSources`; the save auto-shares only when the server-held outcome for that ISBN is `found` and never calls sources for a private Book itself. Undo of that save removes the copy and leaves the Book shared, with the `user-books` row the auto-share wrote.

### M7 — Which target the Answer sends, and the manual Answer has no address

- **Units:** D17, I2, I7 (Answer buttons), D4 (`saveCopy`), I6 (Lookup's "Add by hand").
- **Each complies:** `SaveInput.target` allows `{ bookId }` for any Book the gateway can read, which AD-4 makes every shared Book. Routes give the Answer `?isbn=` or `?book=`. EXPERIENCE: "Add by hand" opens the Not found Answer "with the typed text in the title field".
- **Incompatibility:** D17 sends `{ bookId }` for a shared Book the user no longer owns (the last copy was removed, the Book stayed); a D4 that applies `requireOwnBook` answers `NOT_FOUND`, and a D4 that does not lets any shared Book be reached by guessing ids. I6 has no URL for the typed title and invents one that I7 does not read.
- **Amendment (AD-11, Routes):** A `{ bookId }` target must pass `requireOwnBook`; the Answer sends `{ isbn13 }` whenever it was opened by ISBN. `/scan?title=<text>` is the Not found Answer with the title filled in.

### M8 — Author and series filters split one name across a private and a shared record

- **Units:** E4 (relation filters by id), E18 (suggestions), E22 (Filter chips), D7/D19 (private authors).
- **Each complies:** AD-5: a private Book or an override creates a private author when no shared one matches; a later source save creates the shared namesake "among shared records only". `ShelfQuery.filters.author` is ids.
- **Incompatibility:** Reachable with one user: a hand-entered Linna, then a Finna Linna. The chip on one Book shows half his books; suggestions list "Väinö Linna" twice, or once with one of the two ids.
- **Amendment (AD-7):** An author or series filter value is an id, and its predicate is "any readable record with that record's `nameKey`". Suggestions are distinct on `nameKey` and prefer the shared id.

### M9 — What a restore puts back when the row changed again

- **Units:** F6, G7, E24, H13, J3 restores against E12 (notes), E11 (rating), G2 (single tag), settings deletes.
- **Each complies:** AD-20: "puts back the recorded previous values on rows that still exist... never touches a row its action did not change." Row-level only. Several edits raise no toast (notes, rating, recipient, settings), so the earlier Undo stays on screen.
- **Incompatibility:** A restore that snapshots the row reverts a note or rating typed inside the eight seconds. G7's restore writes the whole previous tag set over a tag added since. H13's restore sets ordered and the old location over a move. When every row is skipped the result is still `ok`, and the toast says "Undone".
- **Amendment (AD-20):** A restore writes only the fields its action wrote, and only on rows where each of those fields still holds the value the action set; other rows are skipped. If it changes nothing the result is `UNDO_FAILED`.

### M10 — In-process state may not be one instance per process

- **Units:** C4 (lookup cache), C7/I10 (rate limit), D10 (preview handler reading the recorded cover URL), U1 (receipts), D4 (`requestId` memory).
- **Each complies:** AD-12 allows module-level state. Each story writes `const store = new Map()` at the top of its file.
- **Incompatibility:** Next.js can evaluate a module separately for route handlers and for server components or actions. If it does here, `/data/lookup` fills one cache and the save action or `/data/cover` reads another: the preview 404s, the rate limit is halved, the save re-fetches. Unverified for 16.3; cheap to test.
- **Amendment (AD-12):** All in-process state is created through one helper, `processState(key, init)` in `lib/payload`, which keeps it on `globalThis`. A test reads from a route handler what a server action stored.

### M11 — `shelfHref` must run in client components and own the `book` parameter

- **Units:** E16 (`parseShelfQuery`, `shelfHref`), E7 (Filter panel, a client component that applies filters as they change), E22 (chips), E6 (count line), E8.
- **Each complies:** AD-7 puts both functions "in `lib/shelf`", the Drizzle module, and makes them the only writers of the shelf params. `?book=` is read by three section pages.
- **Incompatibility:** A client import of `lib/shelf` pulls server code, so E7 writes its own URL builder. A chip built with `shelfHref()` drops `book` (the panel closes on wide screens, where it should stay) or keeps it (the sheet stays open on the phone, where it should close), per story. The count line needs names for filter ids, which `ShelfQuery` does not hold and facets do not cover for authors.
- **Amendment (AD-7):** `lib/shelf/query.ts` is pure and is the only shelf file a client component imports. `shelfHref(query, { book? })` writes every search param of `/`, and `getShelfRows` returns `labels` for the ids in the query.

---

## Low

### L1 — `requestId` and double taps outside saves

`requestId` memory is not said to be keyed by user, to be minted once per Answer (so a retry after a lost response repeats it), or to hold the in-flight promise. Bought, Lend and Returned have no such guard: the second tap fails on the closed entry or the open-loan constraint, and its error toast replaces the Undo toast. **Amendment (AD-11, AD-20):** `requestId` moves into `undoable()` (H1), keyed by user, and covers every undoable action.

### L2 — Actions used from several pages have no home

"Server actions live in `actions.ts` beside the page." Book detail renders on two or three sections, and `undoAction`, the preferences action, Received and Add to wishlist are called from several pages. **Amendment (Service naming):** actions used by more than one page live in `src/app/(frontend)/actions/<domain>.ts`.

### L3 — "31 books" in settings and in the Filter panel are different counts

F8, G9 and J8 count in their owning services; E18 counts on `visibleCopies`. A tag on a Book with two copies is 1 or 2; a tag on a wishlist-only Book is 1 or 0. **Amendment (AD-7):** usage counts shown beside a location or tag are copy rows from the shelf facets; People count loans and entries in `lib/people`.

### L4 — A derived `sortName` is permanent

"An existing author keeps its `sortName`." An author first created from Google or by hand gets "Guin, Ursula K. Le" and keeps it when Finna later supplies "Le Guin, Ursula K.". **Amendment (AD-4):** when a source passes an inverted form and the stored `sortName` equals the hook's derivation from `name`, `findOrCreateByName` replaces it.

### L5 — AD-5 contradicts itself on a private Book

Edits to the user's own private Book "update the Book itself", yet "`books.genres` is written only by `mapSubjectsToGenres()`". `BookEdits` has no `isbn13`, so a Book entered by hand without an ISBN can never get one outside the back office, and so never auto-shares. **Amendment (AD-5):** say which wins for genres on a private Book, and add `isbn13` to `BookEdits` for private Books only.

---

## Checked and not reported

- **`sortName` writers.** The derivation is one field hook, so override-created private authors, back-office edits and auto-share re-matching all pass through it. Only L4 remains.
- **Stale context in a restore.** `Restore` takes a fresh context by signature; the residual risk is in H1.
- **Lazy `user-books` and Undo of read.** A row left behind with `read: false` is indistinguishable from no row (AD-6).
- **Device preferences, tokens, UI wrappers.** One owner each (A21, A14, A20/A23). The only interaction is the re-render in H4.
- **Import cycles.** None. The one required call the rules forbid is `lib/copies` closing entries (H7); merges and deletes writing other collections are explicitly allowed through the gateway.
- **Recipient of an entry.** One owner (H12 in `lib/wishlists`, which may import `lib/people`).
- **Sort tie-breakers, facet scope, URL encoding of several values.** One owner, `lib/shelf`.
- **Heading precedence.** One owner once H6 gives I1 its input. Two ordered copies fall through to "Not in library" by the letter of EXPERIENCE; that is a UX fix.

## Proposed order of fixes

1. H1 and C1, before U1 and D6: they fix the signature of every undoable function.
2. H2, H3, H6, H7, before D22, E11, E24, H6 and I1: they fix service inputs and the shared read shape.
3. H4, H5, H8, M3, M4, M11, before E6, E19 and the first sheet: they fix addresses and list behaviour.
4. M1, M2, M5 to M10, then the lows, each inside the story it names.
