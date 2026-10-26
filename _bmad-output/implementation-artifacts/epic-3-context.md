# Epic 3 Context: Scan a book and add it to my library

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Build the product's primary flow end to end: scan or type an ISBN, see an Answer saying what the book is and whether it is already in the library, and add it in one tap as an owned copy at the default location, with Undo on the toast. Along the way the epic creates the catalogue data model (Book / copy / override, authors, series, genres, locations, media), the pluggable lookup (Finna first, then Google Books), the one-transaction save, the Undo mechanism and the only scan-to-save Playwright test. It ends with real books saved; Edit book, covers and the collection follow in Epic 4.

## Stories

- Story 3.54: [K15] Epic 1 test and toast clean-up (runs first)
- Story 3.1: [D9] Scan screen
- Story 3.2: [C9] Real-book fixture capture
- Story 3.3: [B1] ISBN and name-key fields
- Story 3.4: [C1] Source contract and merge
- Story 3.5: [C2] Finna adapter: core fields
- Story 3.6: [C10] Finna adapter: series, themes and author sort names
- Story 3.7: [C3] Google Books adapter
- Story 3.8: [A24] In-process state helper
- Story 3.9: [C4] Lookup across sources
- Story 3.10: [A11] Transactions and the Drizzle helper
- Story 3.11: [A12] Owner and relation fields
- Story 3.12: [A18] Media
- Story 3.13: [B10] Author sort names
- Story 3.14: [B11] Book field set
- Story 3.15: [B3] `authors` collection
- Story 3.16: [B4] `series` collection
- Story 3.17: [B5] `genres` collection
- Story 3.18: [B2] `books` collection
- Story 3.19: [B6] `user-books` collection
- Story 3.20: [B7] `copies` collection
- Story 3.21: [F1] Locations and the default location
- Story 3.22: [B8] Effective Book
- Story 3.23: [B9] `upsertUserBook`
- Story 3.24: [E26] Holdings
- Story 3.25: [U1] Undo receipts
- Story 3.26: [U2] Undo on the toast
- Story 3.27: [C5] Name matching for authors and series
- Story 3.28: [C6] Look up a Book by ISBN
- Story 3.29: [C11] New authors and series on the lookup result
- Story 3.30: [C7] Lookup rate limit
- Story 3.31: [D1] Ensure a shared Book
- Story 3.32: [D2] Cover download
- Story 3.33: [D3] Create a copy
- Story 3.34: [F2] Default location on new copies
- Story 3.35: [D4] Save a copy
- Story 3.36: [D32] A repeated save returns the first result
- Story 3.37: [D6] Undo a save
- Story 3.38: [D7] Private Book from manual entry
- Story 3.39: [D8] Share my private Book when a source knows it
- Story 3.40: [A20] Dialog and sheet wrappers
- Story 3.41: [A23] Base UI and the combobox, menu and picker wrappers
- Story 3.42: [K11] Default location in Settings
- Story 3.43: [D10] Cover component and cover preview
- Story 3.44: [A25] Client helper for actions and data requests
- Story 3.45: [D16] Answer: not in library
- Story 3.46: [D17] Add to library
- Story 3.47: [D18] Undo on the save toast
- Story 3.48: [D25] Answer: in library
- Story 3.49: [D26] Answer: not found, entered by hand
- Story 3.50: [I9] Answer: couldn't look it up
- Story 3.51: [D23] Scan loop rules
- Story 3.52: [D15] End-to-end: scan to save
- Story 3.53: [C12] Pick the edition

## Requirements & Constraints

- ISBN-10/13 with hyphens or spaces are accepted; the first service to receive the text normalises to 13 digits or fails with `INVALID_ISBN`. The browser never normalises. Only EAN-13 barcodes starting 978/979 are read.
- Lookup is read-only and rate-limited per user (`RATE_LIMITED`); a Book is created only on save. Order: existing shared Book or the user's own private Book, then the sources, Finna before Google Books. An outage or timeout is never reported as "no such book".
- Saved as fetched, no review step; scan to save under 20 s on the phone. The Answer names the source, previews the cover, marks new authors/series and never names another user. An owned edition answers "In library" and still allows another copy.
- No source knows the ISBN: typed title and author (both required) make a **private Book**, shared automatically on the creator's next save once a source knows the ISBN. Books with no barcode can be added without an ISBN. Authors/series match by name, case-insensitive, no accent folding; private-Book records stay private.
- Each source's complete raw response and its subjects per source (Google's categories) are stored admin-only from the first save, so Epic 9 can derive genres; the Finna adapter keeps themes.
- Locations are private and optional; new owned copies land at the profile's default location (none if unset), set in Settings with inline creation.
- Camera needs HTTPS: Scan is accepted in the installed PWA on the iPhone via production or `tailscale serve` to the dev machine.

## Technical Decisions

- **Layers.** The frontend has no business rules and calls services only; `lib/metadata` has no database access; `lib/catalogue` alone holds system privileges for `books`, `authors`, `series`, `genres`, `media` and `isUnreferenced()`. Import directions are lint-enforced.
- **Source contract.** A source is `{ id, lookupByIsbn(isbn13), search?() }`, returns `SourceResult[]` best first and never throws. Results carry the ISBN asked for, "Given Family" names with the inverted form as `sortName`, ISO 639-1 language, trimmed NFC text, Finna subjects as `themes`, per-source `subjects`, display-only `binding`. `lookupSources` runs all sources in parallel under timeouts, makes one candidate per record of the first source that answered, gap-fills in array order, and yields `found | none | unavailable`. Only `found` and `none` are cached (bounded, in process); a `found` merged while a source failed is held for 5 minutes only. Each candidate carries its source's `recordId`. Per-source circuit breaker. A new source is one adapter plus one entry in `sources/index.ts`.
- **In-process state** (lookup cache, breaker, rate limit, `requestId` memory, Undo receipts) only through `processState(key, init)` on `globalThis`: bounded, lost on restart, one app instance.
- **Catalogue model.** `books`, `authors`, `series` carry `visibility: shared | private` with `createdBy` on private rows; `genres` are shared only; users never write any of them. Shared Book values come only from the server-held source outcome, never from the client: a save uses the held outcome and asks the sources only on a miss, before the transaction opens. Database constraints from the first migration: one shared Book per ISBN-13, one private per creator and ISBN-13, `nameKey` unique among shared and per creator/owner among private, `user-books(owner, book)`.
- **Private collections** (`copies`, `user-books`, `locations`) use `ownerField()` set from `req.user`; read/update/delete are `owner = current user` for every role, admin included. Relations use `ownedRelation` / `readableRelation`, which reject targets the user cannot read. Hooks query only through `asRequestUser(req)`.
- **Overrides** are a sparse layer on `user-books` with an `overridden` name list; the overridable set is declared once in `bookFields.ts` (not ISBN, cover, genres, themes). Screens see only `EffectiveBook` and `Holdings` from `lib/books`. One writer per row kind: `upsertUserBook()`, `createCopy()`, `findOrCreateByName()`.
- **Save.** `withTransaction(ctx, fn)` is the only transaction opener and joins an existing one. A save is one transaction: ensure the Book (cover bytes fetched beforehand from an https host allowlist with size/time limits; media row inside; file removed on rollback), then `createCopy()` (`location: undefined` = default, `null` = none). A repeated `requestId` from the same user returns the first result. Auto-share of the user's private Book happens only inside this transaction with a held `found` outcome: same row, source values win, the creator's former values that differ beyond case, whitespace and punctuation become their overrides (an admin's are dropped). One rule for the sources: a save uses the held outcome and asks the sources only on a miss, at most once and before the transaction opens, never inside it; a held Book's save never asks them. The save carries the shown candidate's `{ source, recordId }` and uses that candidate or fails `NOT_FOUND`, never another.
- **Undo.** An undoable service returns `Undone<T>`; `withUndo()` records the receipt after commit; `undo(ctx, token)` behind one `undoAction` runs it once, all or nothing (`UNDO_FAILED`). Receipts live 30 minutes; results carry seconds remaining, not a timestamp. A save's restore deletes the copy and created catalogue rows only when `isUnreferenced()`; after an auto-share the Book stays shared.
- **Surface.** The `/scan` page renders the Answer on the server from search params; the browser makes no lookup request. Mutations are server actions inside `runAction()` returning `ActionResult`; client reads are route handlers under `(frontend)/data/`; the pre-save cover streams from `/data/cover/[isbn13]` using the URL the server recorded. One client helper maps network failure to `NO_CONNECTION` and `UNAUTHENTICATED` to `/login?next=`. Overlays only via Base UI wrappers in `components/ui` (lint-enforced). Strings in `messages/en.json` and `fi.json`.
- **Schema stories** commit their migration and regenerated types and merge one at a time; CI applies all migrations to an empty database and fails on drift.
- **Tests** at a functional minimum, against `bookeh_test` via the harness (`createUser()`, `as(user)`). Collection stories: a two-user access test, with a foreign id where there is a relation. Undoable services also test their undo. Adapters run only against `tests/fixtures/<source>/`; no test touches the network. Playwright covers only scan-to-save here, using a fixture source under `BOOKEH_SOURCES=fixture` (refused in production).

## UX & Interaction Patterns

- **Scan** (`/scan`): the camera stays on across Scan and Answer until X. A read barcode goes straight to `/scan?isbn=` with no confirm; the field submits on Go. Reading pauses during lookup and while an Answer shows; the ISBN just handled is ignored until it leaves view. No camera: "No camera. Type the ISBN." replaces the frame and the field takes focus. Invalid ISBN is marked under the field; a rate limit is a toast; the progress line runs during lookup. An "Add without ISBN" Link opens the Not found Answer with no ISBN.
- **Answer** (`/scan?isbn=`, `&pick=<n>`): full screen; the heading is the answer (in library / not in library / not found / couldn't look it up). Under the Book: copies with locations, "From {source}", "New author"/"New series", and "{n} editions found" as a Link to a picker when there are several candidates (picking replaces the history entry). One primary button per layer. X leaves scanning; Back returns to the camera with nothing saved; each Answer replaces the previous one in history. Couldn't look it up names the silent sources, offers Try again and an "Add by hand" Link that unfolds the manual fields. Wide screens: a centred phone-width column.
- **Toasts and Undo**: "Saved to {location} · Edit · Undo" ("Saved" with no default; Edit arrives in Epic 4). A toast raised on Scan has no timer and stays until the next Answer opens; leaving Scan gives it the usual 4 s. Elsewhere about 4 s, one at a time. Error toasts stay until dismissed and leave the screen as it was ("Couldn't save. Try again."). Every toast has a close (X). Undo shows "Undone" briefly or "Couldn't undo."; the Undo Link hides when its seconds run out.
- **Look**: no fills, square corners, outlined boxes without shadow; covers 2:3 with an outlined placeholder; pickers are a bottom sheet under 900px and a dialog above.

## Cross-Story Dependencies

- 3.54 first: it empties `tests/e2e/` so 3.52 adds the only spec, and fixes the `flashToast()` cookie round trip the save toast relies on. 3.1 and 3.2 open the epic; 3.2's fixtures feed the adapters and 3.52's fixture source.
- Lookup lane 3.3–3.9 (no database) and schema lane 3.10–3.26 run side by side; the schema lane starts once 3.3 and 3.8 merge. Lanes join from 3.27, services before the screens that use them. Base UI: 3.40 before 3.41.
- Handed onward: Edit on the toast, `{ bookId }` saves via `requireOwnBook()`, cover upload (Epic 4); Open book on the Answer (Epic 5); the loan check in a save's restore (Epic 6); Add to wishlist (Epic 7); `mapSubjectsToGenres()` returns nothing until Epic 9. The Playwright test-database move deferred from Story 1.4 lands in 3.52. Epic 3 does not wait on Epic 2.
