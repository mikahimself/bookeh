---
title: Spine review — reconciliation against the UX inputs
type: review
reviews: ../ARCHITECTURE-SPINE.md
inputs:
  - ../../../ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md
  - ../../../ux-designs/ux-bookeh-2026-10-03/DESIGN.md
created: '2026-10-05'
---

# Spine review: reconciliation against EXPERIENCE.md and DESIGN.md

## Verdict

The update landed every decision the UX handed back by name: save-first, the routes, the overlay, generalised Undo, merge, the `unavailable` outcome, device preferences, Base UI, Open Sans, tokens. Open items 5, 6 and 7 are answered. Nothing in the spine contradicts a decision the memlog records as Mika's.

What did not land is the layer underneath those decisions: the data several screens share, and the client-side contracts that many small stories touch. Four gaps would make stories diverge or show wrong lists (R1 to R4). Fourteen more are quieter (R5 to R18). The rest is wording. No finding needs a new layer, collection or dependency; each fix is a few lines in an AD, a convention row or a seed shape.

Counts: critical 0, high 4, medium 14, low 9.

## How this was checked

`EXPERIENCE.md` was read in full, `DESIGN.md` for anything with consequences outside CSS, and the mock-ups `key-scan-phone`, `key-wishlists` and `key-settings` for the content of screens the text leaves open. Each behaviour was traced to an AD, a convention, a seed shape or route, or a Deferred entry, and tested with one question: could two stories built from spine plus UX documents disagree? `STORY-SLICING.md` was used only to see which stories share a gap. The pre-update spine and the memlog entries after "Update run started 2026-10-05" were used to tell new text from old and Mika's decisions from drafter calls. One Next.js fact was checked in `node_modules/next/dist/docs` (R9).

Tiers: **Critical** means wrong stored data or a privacy leak. **High** means several stories will build incompatible things, or the user sees wrong content. **Medium** means two stories can diverge, or a spine rule and a UX rule cannot both hold as written. **Low** means wording, a trap, or a hand-back to the UX.

Not reported: visual detail, copy text, exact numbers, anything the spine's Deferred list already names (change password, undo tuning, section slide and list sweep).

## Findings

### High

#### R1 — The facts a Book detail and an Answer show have no shared shape, and `lookupBook` cannot reach them

- **UX.** Answer screens: "Every other fact that applies is listed under the Book as its own line ... each copy with its location, 'Ordered', and 'On {list}' for each wishlist", plus the heading precedence (owned copy, only ordered, only on a wishlist). Component Patterns → Lent marker: shown on the Answer; the scan mock-up has "Mökki · lent to Antti". Book detail → Your copies (location, status, loan, note per copy), On wishlists ("{list} · for {person}"), Lent before. Lookup → "In your library" rows.
- **Spine.** `LookupResult.existing.mine` is `{ copyIds: number[]; entryIds: number[] }`. `ShelfRow` has location and loan but no note. AD-6 names only `EffectiveBook` and `UserBookState` as what the surface receives. The import rule lets `catalogue` import `copies`, `wishlists`, `books` and `metadata`, so not `loans`, `people` or `shelf`. No function is named for "this viewer's copies and entries of one Book".
- **Why it matters.** Ids alone cannot produce a heading or a fact line, so the Answer needs a second read that nothing owns. `lookupBook` cannot supply the lent fact under the import rule. Slicing already assumes otherwise (I1: "Answer facts from `lookupBook`"). E8 (Book detail), I1/I2 (Answer), I11/I6 (Lookup rows), F3 and J9 would each write their own copies-of-a-Book read, some through the gateway and some in Drizzle, with different ordering and different treatment of ordered and lent copies. It also puts two reads on the NFR-1 path.
- **Amendment.**
  - Seed, under `src/lib/shelf`:
    ```ts
    type CopyLine = Omit<ShelfRow, 'book'> & { note: string | null }
    type EntryLine = { entryId: number; wishlist: Named; forPerson: Named | null } // open entries
    type Holdings = { copies: CopyLine[]; entries: EntryLine[] }
    ```
  - AD-7, new bullet: "`getHoldings(ctx, bookIds)` in `lib/shelf` is the one read of a viewer's copies and open entries per Book, built on `visibleCopies` and `visibleEntries`. Book detail, the Answer and Lookup's own-library rows use it. `answerHeading(holdings)` beside it is the only code that decides an Answer's heading."
  - `LookupResult.existing` becomes `{ kind: 'existing'; book: EffectiveBook; mine: Holdings }`, and the import rule gains "`catalogue` may import `shelf`" (no cycle: `shelf` imports only `books`).
  - "Lent before" is `closedLoans(ctx, copyIds)` in `lib/loans`, called by the Book detail component.

#### R2 — An opened wishlist entry is not Book detail, and `?book=` cannot name an entry

- **UX.** Wishlists → Entry opened: "Sheet or panel with the Book's header, 'On {list}', and a 'For' combobox". The mock-up shows Bought, Ordered and Remove on it and none of Book detail's groups. Component Patterns: "Bottom sheet: Book detail and a wishlist entry", "Button, primary: Bought on a wishlist entry". The IA table says tapping a wishlist row opens Book detail; the UX is inconsistent with itself here, and the Wishlists table and mock-up are the more specific.
- **Spine.** Routes: "`?book=<bookId>` on `/`, `/loans` and `/wishlists/[listId]` — Book detail: one server component". No address for an entry. AD-19 has no uniqueness on `(wishlist, book)`, and AD-18's `createCopy` rule speaks of "open wishlist entries for that Book" in the plural.
- **Why it matters.** H8, H11 and H12 build the entry sheet; E8 builds Book detail. With `?book=` on a wishlist, one of them is wrong. The same Book can be on one list twice (a copy for Äiti and one for Leena is the gift case the UX is written around; Book detail's foot offers "Add to wishlist" for a Book already listed), and then `?book=` cannot say which entry "For", Bought and Remove act on.
- **Amendment.** Routes: "`?book=<bookId>` on `/` and `/loans`: Book detail. `?entry=<entryId>` on `/wishlists/[listId]`: the opened entry, its own server component, resolved through the gateway (a foreign or closed id is the 'no longer there' state of R10)." Add to AD-8: "A Book may have several open entries, also on one list; entries are addressed by entry id, never by Book." If Mika would rather forbid duplicates, the alternative is a unique constraint in AD-19 on open `(wishlist, book, forPerson)` and an `ALREADY_LISTED` code; either way the spine has to say which.

#### R3 — The list has no rule for what happens after a change, and offset paging then skips rows

- **UX.** Select mode: "Rows that no longer match the active filters leave the list." Moving a box flow: twelve rows leave, the count line drops to 19, Undo "puts all twelve back in Tampere and in the list". State Patterns → Book has left the list. Loans → Returned: "The row moves to the returned group." Bottom sheet: "The list keeps its scroll position."
- **Spine.** AD-7: first page from the page, later pages from one route handler, offset paging with one page size, "the client drops rows whose copy id it already holds". The memlog adds that opening a Book re-renders the page and "the list keeps its loaded rows in client state" (a drafter call, memlog line 70). Nothing says when the client replaces its rows, or how a mutation or an Undo reaches rows the client already holds.
- **Why it matters.** Two separate problems. (a) Every mutating story (F4 move, E24 read, E25 remove, G7 tag, J4 lend and return, D21 edit, H13 received, U2 undo) must update a list it does not own; each will pick its own way (local patch, `router.refresh()`, revalidation), and Undo cannot patch locally at all. (b) Dropping repeated ids covers rows that were inserted, not rows that left: after twelve rows leave a filtered list, the next offset page starts twelve rows too far and those books never appear until a reload, while the count line says they exist.
- **Amendment.** AD-7, replacing the paging bullet's last sentence and adding one:
  - "The client list is keyed by the shelf query (`shelfHref()` of search, filters and sort, without the open Book). A new key replaces its rows with the server's first page; a re-render under the same key keeps them."
  - "After any action or Undo that returns `ok`, the caller calls one `reloadList()` from the list's context. It re-requests `/data/shelf` from offset 0 for as many rows as it held and replaces rows and total. `getShelfRows(ctx, query, { offset, limit })` takes an offset and a capped limit; the next page's offset is the number of rows held. No screen patches rows locally."
  - "Sections that are not paged (loans, a wishlist, settings) re-render from the server after an action; the action's caller refreshes the route."

#### R4 — The History rules have no home: push or replace, where a task returns to, and Back on overlays with no address

- **UX.** Information Architecture → History: Back closes the topmost thing (picker, then sheet or panel, then task); on an Answer it returns to Scan, on Scan to the section; each Answer replaces the last. Component Patterns: Detail panel "Clicking another row swaps its content without closing it"; Bottom sheet (Book detail, the Filter panel, pickers) "Back closes it"; Close (X) "returns to the section underneath"; Text field "Search filters as the user types". Edit book: "Returns to where the user came from." Lookup: "Back from the Answer returns to the results."
- **Spine.** Absent. The Routes table gives addresses only. Slicing puts "each Answer replaces the last in history" in D23 and nothing elsewhere.
- **Why it matters.** At least nine stories navigate (E6, E7, E8, E22, D9, D17, D21, I6, A20/A23). Without a rule, opening a second Book pushes in one story and replaces in another, each keystroke of a search may become a history step, and "return to where the user came from" is `router.back()` in one story (breaks on a reload or a direct address) and a `from` parameter in another. Pickers, dialogs and the phone Filter sheet have no address, so Back closes them only if the shared wrappers do something about it; left to stories it will be done per picker or not at all.
- **Amendment.** New convention row, "History":
  - "Push: opening Book detail or an entry from a closed state; entering Scan, Lookup or Edit book; the first Answer after Scan; a Filter chip. Replace: swapping the open Book; every search, filter and sort change; an Answer that follows an Answer; returning to Scan after a save."
  - "A full-screen task returns with history back when the app itself pushed the entry, and otherwise navigates to `/`. X on a task goes back to the entry before the task began. There is no `from` or `returnTo` parameter."
  - "Overlays without an address (pickers, dialogs, the Filter sheet on the phone) get Back through one hook in the `components/ui` wrappers; screens never touch `history` themselves."
  - "`detailHref()` beside `shelfHref()` is the only code that adds or removes `book` or `entry`."

### Medium

#### R5 — Read and tag are keyed by copy in AD-18, but Book detail sets them on Books that may have no copy; the bulk Read toggle needs the server to decide

- **UX.** Book detail → Read and rating: "Both belong to the Book, not a copy"; Genres and tags: "Add tag". Book detail opens for a Book that is only on a wishlist (spine AD-7, `requireOwnBook`). Select mode → Read: "Marks every ticked Book read, or unread if all are already read." Undo table: "Tag (many)" but "Read (one or many)" and "Move (one or many)".
- **Spine.** AD-18: every selection action "takes a list of copy ids ... Tag and read apply to the distinct Books of those copies. The single-row action calls the same function with one id." `ShelfRow` carries no read flag. AD-20: the actions with a receipt are "exactly those listed".
- **Why it matters.** A wishlist-only Book has no copy id to pass, so E11 and G2 cannot follow AD-18 as written. The client cannot know whether all ticked Books are read (the rows do not carry it, and ticked rows may be out of view), so E24 has to choose between a client-supplied boolean and a server toggle. Whether a single "Add tag" in Book detail raises an Undo toast is undecided: the UX table says no, AD-18's "same function" says a token comes back anyway.
- **Amendment.** AD-18, selection bullet: "Move and remove take copy ids. Tag and read take Book ids; the selection passes the distinct Book ids of its rows, and Book detail passes one. `setRead(ctx, bookIds, 'toggle' | boolean)` decides the direction on the server for `'toggle'` (read unless all are read) and returns it with the count, for the toast." AD-20: "An action yields a receipt whenever its row in the Undo table applies; a single tag change in Book detail returns a token that the interface does not offer." (Or hand "Tag (many)" back to the UX to become "one or many".)

#### R6 — An undoable writer that another service calls: the split is described but not named

- **UX.** Undo table: Move, Received, Bought and Ordered each have Undo; Save on Edit book has none, yet Edit book changes a copy's status and location (Edit book → First screen).
- **Spine.** AD-20: "The service function the action calls records it after its transaction commits ... A function called by another service returns its restore data to the caller and records nothing." AD-5: `editBook` writes status and location "through their own writers (AD-18)".
- **Why it matters.** `move` in `lib/copies` is called by the Move action (must record) and by `editBook` (must not). `createCopy` is called by `saveCopy` and `closeEntry`. One function cannot return both `Undoable<T>` and restore data, so F6, H6, H13 and D22 will each invent a flag or a twin.
- **Amendment.** AD-20, third bullet, add: "Each undoable change is two functions in its service. The writer, suffixed `Tx` (`moveCopiesTx`), requires a context that carries a transaction and returns `{ data, restore }`. The action-facing function (`moveCopies`) opens the transaction, calls the writer, records the receipt after commit and returns `Undoable<T>`. Other services call only the `Tx` form." Add `type Change<T> = { data: T; restore: Restore }` to the seed.

#### R7 — "Existing or new" in one field: inputs take an id in one place and a name in another

- **UX.** Combobox: "A value that does not exist can be created from the same field (FR-31, FR-34)". Used for location (Move picker, Edit book, default location), Person (Lend, "For"), tags, and "New list" in the wishlist picker. Edit book: "Leaving with changes asks 'Discard changes?'".
- **Spine.** `EditBookInput.copy.location` is `number | null`; `tags` are names; `SaveInput.save.wishlist` is a number. AD-18: owning services match and create, "screens never match names". Nothing says whether a new name travels inside the action that uses it or is created by the combobox first.
- **Why it matters.** F4, D22, J4, H12, K5 and H10 each need this. Created-on-select leaves a location behind after "Discard changes?"; carried-in-the-action does not. The two also differ in what Undo may see.
- **Amendment.** Seed, in `src/lib/payload` or `src/lib/errors.ts`: `type RefInput = number | { name: string }`. AD-18, name-keyed bullet: "An action input that names a location, Person, tag or wishlist the user may create inline is a `RefInput`. The owning service resolves it inside the action's transaction; a combobox never calls a create action of its own. Undo leaves a row created this way in place." Change `EditBookInput.copy.location` to `RefInput | null` and `SaveInput.save.wishlist` to `RefInput`.

#### R8 — `NAME_TAKEN` must carry an id that `ActionResult` cannot hold; creating onto an existing name is undefined

- **UX.** Settings → Rename: "Renaming to a name that already exists offers to merge instead." Wishlists: "a name already in use is rejected under the field."
- **Spine.** AD-18: `NAME_TAKEN` "carrying the existing row's id". Seed: the failure arm of `ActionResult` is `{ ok: false; code; fields? }`. AD-18 states the rule for rename only.
- **Why it matters.** F8, J8 and G9 need the id to offer the merge. With no field for it, each will re-find the row by name on the client, which AD-18 forbids. "Add location" and "New list" with a name in use will match silently in one story and fail in another.
- **Amendment.** Seed: `| { ok: false; code: ErrorCode; fields?: Record<string, ErrorCode>; ref?: number }`, with "`ref` is the existing row's id for `NAME_TAKEN`". AD-18: "Creating by name from a settings list or 'New list' fails with `NAME_TAKEN` on the name field; resolving a `RefInput` (R7) matches the existing row instead."

#### R9 — "Back to the address the user wanted" has no mechanism, and `requireUser()` redirecting inside `runAction()` or a `/data` handler misbehaves

- **UX.** State Patterns → Signed out or session ended: "Sign in, then back to the address the user wanted." Applies to "Any" surface, so also to a scan in progress.
- **Spine.** AD-2: "Every page, server action and route handler starts with `requireUser()`, which redirects to sign-in." No return address, no validation of one. Errors convention: `runAction()` maps "anything else to `INTERNAL`".
- **Why it matters.** Three things. The wanted address has to travel and be checked (an unchecked `next` is an open redirect once the app has a public ingress). A redirect answered to a client `fetch` of `/data/*` is followed and returns the sign-in page as HTML, which the scanner reports as "Couldn't load". And Next signals `redirect` by throwing (bundled docs, `redirect.md`: call it outside `try`), so a `requireUser()` inside `runAction()`'s body is swallowed by the catch-all and comes back as `INTERNAL`. A16 covers pages only.
- **Amendment.** AD-2, fourth bullet: "In a page, `requireUser()` redirects to `/login?next=<path and search>`. Sign-in goes to `next` only when it is a path on this origin starting with one `/`, otherwise to `/`. In a server action and a `/data` handler, `requireUser()` does not redirect: it throws `UNAUTHENTICATED`, which `runAction()` and the handler wrapper (R11) return, and the client's one call helper navigates to `/login?next=` with the current address." Name how `requireUser()` learns the path (one place in `lib/payload`).

#### R10 — Toasts must outlive navigation and be raised from a server render; "Book no longer there" is handled nowhere

- **UX.** Answer screens: Add to library returns "to Scan with the save toast". Edit book → Saving: "Returns to where the user came from, with the toast 'Saved'." State Patterns → Book no longer there: "The section opens without the detail, with the toast 'Not in library'." Toast: "one at a time, a new one replacing the old".
- **Spine.** Errors: "Toasts render from `ActionResult`." AD-7: `requireOwnBook` "fails with `NOT_FOUND`". Routes: Book detail is "one server component, rendered by the section's page". Nothing on where the toast lives, whether actions may redirect, or what the detail component does with `NOT_FOUND`.
- **Why it matters.** An action that redirects on the server never hands the client its result, so the toast and its `undoToken` are lost; one story will do that and another will not. The "no longer there" notice is found during a server render on three sections; without a rule it becomes an error page in one and a silent close in another. It is also reached in normal use: removing the last copy of the open Book re-renders the section with `?book=` still set.
- **Amendment.** New convention row, "Toasts": "One `ToastHost` in the frontend root layout holds the single toast in client state, so it survives client navigation. Server actions never redirect on success; they return `ActionResult`, and the caller raises the toast and then navigates. A condition found during a server render raises a toast by rendering `<Notice code>`; toast text and undo tokens never go into the URL or a cookie." Routes, Book detail row: "On `NOT_FOUND` from `requireOwnBook` the component renders only `<Notice>` and the client drops `book` from the address with a replace."

#### R11 — Reads that fail have no contract: `/data` handlers, and failures that never reach the server

- **UX.** State Patterns: Too many lookups (toast on Scan), Load failed ("Couldn't load. Try again." with retry), Action with no connection ("No connection." in an error toast), Save failed.
- **Spine.** Errors convention covers server actions through `runAction()` only. AD-10 names four `/data` handlers and no response shape or error mapping for them. A rejected network call produces no `ActionResult` at all.
- **Why it matters.** C8, E19, E18 and D10 will each choose a JSON shape and status codes. "No connection." needs one place on the client that turns a rejected call into a result, or every screen catches it differently.
- **Amendment.** Errors row: "`runRead()` wraps every `/data` handler as `runAction()` wraps actions and answers `ActionResult<T>` as JSON, with status 200, 401 for `UNAUTHENTICATED`, 429 for `RATE_LIMITED`, 4xx or 5xx otherwise. On the client, `callAction()` and `fetchData()` in `src/app/(frontend)` are the only callers of actions and `/data`; a rejected call becomes `{ ok: false, code: 'OFFLINE' }`."

#### R12 — The Answer can be produced two ways; the UX states have gaps the spine now creates

- **UX.** Scan → "A read barcode goes straight to the Answer"; Camera "stays on across Scan, Answer and back"; Lookup → tapping a result opens the Answer, and "Add by hand" opens the Not found Answer "with the typed text in the title field". Changes to the sources: "Until it can, both show Not found."
- **Spine.** Routes: `/scan` with `?isbn=` or `?book=` is the Answer; `/data/lookup` is also a route handler for the "scanner lookup" (AD-10). `unavailable` is a fourth `LookupResult` kind with no screen in the UX. No address exists for a Not found Answer without an ISBN.
- **Why it matters.** D9, D16, I2, I6 and I7 can split between "the client fetches `/data/lookup` and draws the Answer" and "the client navigates and the page calls `lookupBook`". If both happen, each scan counts twice against the rate limit, and a page that swaps Scan for Answer in its tree stops the camera. I9 has to invent what `unavailable` looks like.
- **Amendment.** AD-10 or the Routes table: "The Answer has one producer. The `/scan` page never calls `lookupBook`; the Scan client component, which owns the camera and stays mounted for the whole task, reads `isbn`, `book` or `title` from the address, fetches `/data/lookup` once per address and renders the Answer from the result." Routes: add "`/scan?title=<text>`: the Not found Answer with no ISBN, from Lookup's 'Add by hand'". Deferred, or back to the UX: "The `unavailable` Answer offers Try again and the same manual fields as Not found; a Book entered that way is auto-shared later (AD-5)."

#### R13 — Names for the ids in a shelf query have no source, and the obvious one browses the shared catalogue

- **UX.** Collection controls → Count line: "the active values, the count, and 'Clear'", for example "Tampere, unread · 14 books · Clear". Filter panel: author, series and publisher show "a short list" of chosen values.
- **Spine.** `ShelfQuery` holds ids for location, genre, tag, author and series. Facet lists cover only "values in use", and suggestions answer typed text. AD-7 forbids reaching authors and series except through a visible copy; AD-4 read access lets any signed-in user read any shared author by id.
- **Why it matters.** E6 and E7 both need id-to-name. A value can be active and no longer in use (the Tampere filter after everything moved out). Resolving through the gateway shows the name of any shared author or series for `?author=<n>`, which is the browsing AD-7 exists to prevent.
- **Amendment.** AD-7, facets bullet: "`describeShelfQuery(ctx, query)` in `lib/shelf` returns a `Named` for every id in the query. Locations and tags resolve among the viewer's own rows; authors, series and genres only when a visible copy has them. An id that does not resolve is dropped from the query before it runs."

#### R14 — "31 books", "2 loans", "1 wish": usage counts have no provider and no unit

- **UX.** Settings → Locations, People, Tags: "One List row each, with what uses it"; Delete: "a dialog that says what will lose its location or tag". Wishlists → List of lists: "its name and count". Foundation: "Counts count rows and are labelled 'books'."
- **Spine.** Absent. Facets are "values in use" with no counts. `copies`, `people` and `books` import no other service, and counting copies per tag needs the `copies` to `user-books` join that only `lib/shelf` may write in Drizzle.
- **Why it matters.** F8, G9, J8 and H5 each need counts. A tag's "14 books" is copies under the UX's own rule and `user-books` rows under the obvious query; they differ when a Book has two copies or none.
- **Amendment.** AD-7: "`countCopiesBy(ctx, 'location' | 'tag')` in `lib/shelf` returns copies per value on `visibleCopies`; every count labelled 'books' is a count of copies." AD-18, name-keyed bullet: "Each owning service lists its rows for settings. People carry open loans, closed loans and open entries, counted through the gateway; wishlists carry open entries. The settings page joins lists and counts; services do not import `shelf`."

#### R15 — Toasts need facts the results do not carry

- **UX.** Undo table: "Saved to {location} · Edit · Undo" for Add to library, Bought, Ordered and Received; "Saved" when there is no default location; Bought for a Person creates no copy ("A gift for Äiti").
- **Spine.** `SaveResult = { undoToken; bookId; copyId?; entryId? }`. No result shape for `closeEntry` or `receive`.
- **Why it matters.** The location is chosen on the server (the profile default at that moment). D17, H8 and H13 will otherwise read the default on the client, three different ways, and H8 cannot tell whether a copy was made.
- **Amendment.** Seed, `src/lib/copies`: `type Placed = { copyId: number; status: 'owned' | 'ordered'; location: Named | null }`. `SaveResult` becomes `{ undoToken; bookId; placed?: Placed; entryId?: number }`. `closeEntry` returns `Undoable<{ placed: Placed | null }>` and `receive` returns `Undoable<Placed>`.

#### R16 — Whether an ordered copy has a location is undecided

- **UX.** Edit book: status "owned / ordered" and location side by side. Book detail: Received "makes it owned at the default location". Collection controls → Row ending: "'Ordered' for an ordered copy". Undo table: Ordered on an entry toasts "Saved to {location}".
- **Spine.** AD-18: "`undefined` on an owned copy means the profile's default location; `null` means none". Silent on ordered copies, on what Received does to a location already set, and on what `editBook` does to the location when the status flips.
- **Why it matters.** D3/F2 (`createCopy`), H6 (`closeEntry`), H13 (Received), D22 (Edit) and E3 (does an ordered copy count under the Tampere filter?) each need the answer.
- **Amendment.** AD-8: "An ordered copy may hold a location, meaning where it will go. `createCopy` gives an ordered copy none unless one is passed. Received sets the default location only when the copy has none. Changing status in `editBook` leaves the location alone." If Mika prefers "ordered copies never have a location", state that instead and drop location from the Edit screen while the status is ordered.

#### R17 — Edit book "in the detail panel's place" on wide screens does not fit a page route

- **UX.** Edit book → On wide screens: "Opens in the detail panel's place, not full screen. [ASSUMPTION]"
- **Spine.** Routes: `/books/[bookId]/edit` is a page of its own. Not in Deferred.
- **Why it matters.** As a separate page the collection is not beside it, and the list's loaded rows, scroll position and selection are gone on return. D21 will either ignore the UX line or invent a second way to render Edit.
- **Amendment.** Either Routes: "Edit book is `?book=<bookId>&edit` on a section when opened from Book detail, rendered where the detail renders; `/books/[bookId]/edit` remains for the save toast, where no section is underneath." Or Deferred: "Edit book in the panel's place on wide screens. Phase 1 builds Edit as a centred column on its own page; the UX assumption goes back to Mika."

#### R18 — The scanner needs `normaliseIsbn`, which lives where the frontend may not import

- **UX.** Scan: "Only ISBN barcodes count (EAN-13 starting 978 or 979)"; ISBN field accepts ISBN-10 and hyphens; State Patterns → Not an ISBN, under the field; the Answer's address is `/scan?isbn={isbn13}`.
- **Spine.** ISBN convention: "`normaliseIsbn` lives in `src/fields` with the ISBN field." The paradigm's arrows give the surface no import from `src/fields`, and that module sits beside Payload field configs.
- **Why it matters.** D9 must turn typed input into the 13-digit address and reject bad input before a lookup is spent. It will copy the function into the frontend, giving the app two normalisers.
- **Amendment.** ISBN convention: "`normaliseIsbn` is a pure module, `src/lib/isbn.ts`, with no imports. `src/fields`, the services and client components may all import it." Add that arrow to the paradigm.

### Low

#### R19 — Tailwind's default scales stay available beside the tokens

- **UX.** `DESIGN.md`: "no other radius", "There is no bold", one shadow, no status colours; the breakpoints 900px and 1200px in `EXPERIENCE.md` → Responsive.
- **Spine.** Styling convention: tokens declared as theme variables; "no colour or size literals in components". `rounded-lg`, `bg-slate-100`, `shadow-md`, `font-bold` and `md:` are not literals and still resolve.
- **Amendment.** Styling row: "The theme clears Tailwind's default colour, radius, shadow, font-size, font-weight and breakpoint namespaces, so only `DESIGN.md` tokens resolve. Two breakpoints are declared there: `wide` (900px) and `two-panel` (1200px)." (Tailwind 4 clears a namespace with `--color-*: initial`; confirm in its theme docs in A14.)

#### R20 — The lookup draft carries the source's cover URL to the browser

- **UX.** Lookup → Covers: "Shown only where the architecture can serve them (AD-14)".
- **Spine.** `LookupResult.source.draft` is `Omit<SourceResult, 'raw'>`, which keeps `coverUrl`; AD-14 says the browser never loads a cover from a source. `SearchHit` already does this right with `hasCover`.
- **Amendment.** `draft: Omit<SourceResult, 'raw' | 'coverUrl'> & { hasCover: boolean }`.

#### R21 — The codes behind the UX's named failures are not listed

- **UX.** Voice and Tone: "Failure messages come from the architecture's `errors.<CODE>` message keys"; named cases: too many lookups, not an ISBN, wrong email or password, couldn't undo, no connection, a Person that cannot be deleted.
- **Spine.** Names `NOT_FOUND`, `VALIDATION`, `INTERNAL`, `NAME_TAKEN`, `UNDO_FAILED`. A wrong password is a Payload authentication error, which `runAction()` maps to `INTERNAL` as written.
- **Amendment.** Errors row: "The union starts with `NOT_FOUND`, `VALIDATION`, `INTERNAL`, `UNAUTHENTICATED`, `BAD_CREDENTIALS`, `RATE_LIMITED`, `NOT_ISBN`, `NAME_TAKEN`, `IN_USE`, `UNDO_FAILED` (also for an expired token) and the client-made `OFFLINE`. `runAction()` maps Payload's authentication and lockout errors to `BAD_CREDENTIALS`. A screen may give a code its own wording under `errors.<CODE>.<context>`; the bare key is the fallback."

#### R22 — Remove on a wishlist entry: delete or close

- **UX.** Wishlists → Closed entries: "A bought, ordered or removed entry leaves the list." Settings → Delete: a Person with wishlist entries cannot be deleted.
- **Spine.** AD-8: "a closed entry keeps its row with `closedAt`". AD-18 lists delete cascades but not an entry's removal, and does not say whether closed entries block deleting a Person.
- **Amendment.** AD-18: "Remove on an entry deletes the row. Bought and Ordered close it. A Person is blocked from deletion by any loan and by any entry, open or closed."

#### R23 — Search fields and the search cache are unstated

- **UX.** Collection controls → Search: "title, author, series, ISBN and notes". Lookup: results by "title or author"; "Back from the Answer returns to the results."
- **Spine.** AD-7: "Text search is `ILIKE`", no field list for either use. AD-9 caches `lookupSources` only, so Back to the results runs the sources' search again and spends the rate limit.
- **Amendment.** AD-7: "Collection search covers effective title, author names, series name, ISBN-13 and the copy's note. Lookup's own-library search covers title and author names." AD-9: "`searchBooks` results are cached in process by normalised query, bounded (AD-12)."

#### R24 — "No locations" is needed by many screens and read by none in particular

- **UX.** State Patterns → No locations: location fields, the filter, Move and the row ending are absent "Everywhere".
- **Spine.** Absent. F3, F4, E6, E7, D22 and the toast each need the same yes or no.
- **Amendment.** AD-18 or conventions: "`hasLocations(ctx)` in `lib/copies` is the one test; the frontend root layout reads it once and provides it to components."

#### R25 — The spine adds an admin action to a screen the UX has specified without it; "new genre" can never show

- **UX.** Book detail → Foot: "Edit ... and Add to wishlist. No primary button." Answer screens: names "any author, series or genre that this save would create".
- **Spine.** AD-5: re-fetch is "triggered by an admin-only action on the Book detail page" (a drafter assumption in the memlog). AD-5 also says saves never create genres, and `LookupResult.matches` has no genres.
- **Amendment.** AD-5: "The re-fetch action is a Link in Book detail's foot, rendered for admins only." Hand back to the UX: drop "or genre" from the Answer line.

#### R26 — A row carries the whole effective Book

- **UX.** `DESIGN.md` → Collection density: a row shows cover, title, author, year and publisher. Size "changes what fits on screen, not how much is fetched".
- **Spine.** `ShelfRow.book` is `EffectiveBook`, description included, for every row of every page over `/data/shelf`.
- **Amendment.** Optional. `ShelfRow.book` becomes `Pick<EffectiveBook, 'bookId' | 'title' | 'authors' | 'series' | 'seriesIndex' | 'publisher' | 'year' | 'coverUrl'>`; Book detail reads the full Book by id. Decide when E14 measures.

#### R27 — Small items for one line each

- **Selection bar and duplicates.** "Marks the copy whose Book is showing". With two copies of a Book in the list and only `book` in the address, a reload cannot tell which row was tapped. State in the Routes row that the bar marks every row of the open Book, or hand it back to the UX.
- **Copy notes and rating.** Both "save at once" (Book detail). Add `setNote` to the `lib/copies` line and `setRating` to the `lib/books` line of the source tree so E11 and E12 do not write through the gateway from an action.
- **Page language.** Accessibility Floor: the `lang` attribute follows the interface language. One clause in AD-15.
- **Returned loans.** The returned group grows without bound and AD-7 pages only the shelf. Say in AD-7's last bullet that other lists are unpaged in Phase 1, or give the returned group a limit.
- **Filter chip and the sheet.** "The sheet closes on the phone" but a chip is a server-built link that cannot know the width. `detailHref()` (R4) should let the client decide whether to keep `book`.

## What landed cleanly

For the record, checked and found supported: the four sections and their addresses; no home; one row is one copy; AND across fields and OR within; every Filter panel field and all four sorts against `ShelfQuery`; values in use and suggestions as shelf queries; Finnish sort and author `sortName`; save-first with `SaveInput` (`bookId`, `isbn13`, manual with title and authors); Edit after save with `?copy=`; status ordered through Edit; every Undo row has a receipt path in AD-20, and Remove, Delete, Merge and Edit have none; Undo of a save reopens entries; merge and the Person delete rule; bulk all-or-none; `unavailable` as its own outcome; Lookup's two groups and `SearchHit`; cover preview by ISBN; device preferences in a cookie readable at render, language on the profile; tokens, dark values, Base UI wrappers and self-hosted Open Sans; section slide and list sweep deferred as enhancements; change password deferred to Mika.
