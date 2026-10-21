# Epic 4 Context: Fix fetched data and add covers

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make saved Books correctable. After a one-tap save, Edit book (reached from the save toast or by address) lets Mika fix any fetched field and, when opened from the toast, set the new copy's status and location. As admin his edits change a shared Book for everyone, other users' edits become their overrides, and edits to a private Book change that Book. The admin, or a private Book's creator, can add, replace or remove a cover, straightened and cropped to 2:3 by dragging four corners. The epic opened with eleven stories from the Epic 3 and Epic 1 retrospectives (conventions, a hardened save path, housekeeping). With Edit book in place real cataloguing in production can begin, and a rehearsed restore proves the backups work.

## Stories

Run order: 4.15–4.25 first, then 4.1–4.14. As of 2026-10-21 still open: 4.7, 4.8, 4.9, 4.10, 4.13, 4.14; the rest are done.

- Story 4.15: [K16] Conventions for tests, story size and the spine
- Story 4.16: [D34] Save failures that lead somewhere
- Story 4.17: [D35] One lookup outcome per save
- Story 4.18: [D36] Lookup limit on saves and cover previews
- Story 4.19: [D37] Private-Book merge clean-up and the D-8 merge rule
- Story 4.20: [C14] Lean Finna raw data and the source order check
- Story 4.21: [A27] One helper for system privileges
- Story 4.22: [K17] Test lanes that pass on their own
- Story 4.23: [A28] Settings switches that keep up
- Story 4.24: [A29] Server-side guards from Epic 1
- Story 4.25: [K18] Checks that test themselves
- Story 4.1: [E21] Only my own Books by id
- Story 4.2: [D5] Edit a shared Book
- Story 4.3: [D19] Edit authors and series
- Story 4.4: [D20] Edit my private Book
- Story 4.5: [D24] Copy status, note and removal
- Story 4.6: [F6] Move copies
- Story 4.7: [D21] Edit book screen
- Story 4.8: [D27] More details on Edit book
- Story 4.9: [D22] Edit from the save toast
- Story 4.10: [K12] Rehearsed restore at the cataloguing gate
- Story 4.11: [D28] Media visibility
- Story 4.12: [D29] Cover upload service
- Story 4.13: [D30] Four-corner crop
- Story 4.14: [D31] Cover on Edit book

## Requirements & Constraints

- Every field Edit book shows starts with the viewer's effective values and is editable, except: ISBN only on the user's own private Book (a shared Book's ISBN never changes); system genres editable on a private Book and, on a shared Book, by the admin only (read-only for others); themes shown, never edited.
- Who an edit changes: the admin's edit to a shared Book writes the shared Book and clears the admin's own override of that field. A non-admin's edit to a shared Book becomes that user's override, a cleared field included. An edit to the user's own private Book changes the Book itself. The screen does not explain this.
- Edit book and covers have no Undo. Save shows "Saved". A rejected field shows its message under the field.
- Copy status is only `owned` or `ordered`; an ordered copy has no location. Setting ordered clears the location; setting owned uses the default location unless one is given. Moving several copies is all or nothing and has Undo.
- Cover upload accepts JPEG, PNG or WebP up to about 5 MB and strips all metadata, location included. An admin's upload on a shared Book is shared; a private Book's cover is visible only to its creator and the admin. Uploads by other users on shared Books are Phase 3, not built.
- Promoting a private Book that has an uploaded cover never leaves a private cover on the shared Book: an admin's cover row becomes shared; anyone else's is replaced by the source's cover and deleted when unreferenced.
- Cataloguing gate: real cataloguing starts once Epics 1–3, Stories 4.1–4.9 and 4.15–4.20 are done, Epic 2 is deployed and the default location is set. Covers (4.11–4.14) may land later. Until the gate, phone testing runs against dev, never production. Story 4.10 rehearses one restore of the production backup holding the first real books and covers and writes it down. After the gate, a schema story applies its migration to a restored copy of the latest production dump before merging.
- Every story: interface text in English and Finnish, the accessibility floor, tokens-only styling.

## Technical Decisions

- **Reaching a Book by id.** `requireOwnBook(ctx, bookId)` in `lib/books` is the only gate: it passes only when the viewer has a copy (open wishlist entries join in Epic 7), otherwise `NOT_FOUND`. Edit book and every client-sent `{ bookId }` start with it. No code lists or searches `books`, `authors` or `series` directly, so Edit book has no author or series suggestions until Story 5.9.
- **`editBook(ctx, EditBookInput)` in `lib/catalogue`** is the only path for Book values after a save. The client sends a sparse `BookEdits` with only changed fields; the server never diffs. Overrides go only through `upsertUserBook()`, only on shared Books; the overridable set (declared once in `bookFields.ts`) excludes ISBN, cover, genres and themes. A field is overridden only when named in `overridden`; an empty stored value then means cleared. `EditBookInput.copy` (status, location) is written in the same transaction through `lib/copies`. Personal tags on Edit book belong to Epic 9.
- **Authors and series** on Edit book are text fields matched on Save by `findOrCreateByName()` (`equals` on `nameKey`, no accent folding). The admin's names on a shared Book match and create among shared records only; a user's override or private Book matches shared first, then the user's private ones, and creates private.
- **`lib/copies`** is the only writer of `copies` (`setStatus`, `setNote`, `removeCopies`, `moveCopies`). A location is a `Ref` (id, or `{ create: name }`); `undefined` means the default location, `null` none. `moveCopies` returns `Undone<T>` via `withUndo`; a location created inline stays after Undo.
- **System privileges** only in `lib/catalogue` (via `system(ctx)` from `src/lib/catalogue/system.ts`; set another `depth` after the spread), `lib/shelf` (read-only Drizzle) and the first-user seed; lint rule `bookeh/system-privileges` enforces it. Private collections are written through the gateway.
- **Save path (done).** A save resolves the sources' outcome once, before its transaction, from the lookup cache; no source is called inside a transaction. Saves that ask the sources and cover-preview fetches share the per-user lookup limit.
- **Covers.** `setCover(ctx, bookId, file, corners: Corners)` and `removeCover()` in `lib/catalogue` are the only upload path (done in 4.12); `Corners` is `[tl, tr, br, bl]` of `Point { x, y }` in the uploaded image's pixels, clockwise, origin top left. Anyone but the admin (shared Book) or creator (private Book) gets `NOT_FOUND`; errors `NOT_AN_IMAGE`, `IMAGE_TOO_LARGE`, `INVALID_CORNERS`, `COVER_FAILED`. The file and corners arrive as form data in a server action. `media` reads as `shared OR createdBy = me`, all for admin. Admin re-fetch never replaces an uploaded cover.
- **Crop in the browser (4.13).** Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`, shrink to about 2000 px on the long side, re-encode as JPEG; corners are in that image's pixels. HEIC from iPhone is handled this way, so only the JPEG is uploaded. No crop library.
- **Surface.** Mutations are server actions inside `runAction()` returning `ActionResult`; errors are `ErrorCode`s with messages at `errors.<CODE>`. Overlays only from the Base UI wrappers in `components/ui`. Edit book is a page on every width at `/books/[bookId]/edit`; `?copy=<copyId>` adds that copy's status and location.
- **Tests.** Only where the acceptance criteria name the behaviour or a spine rule needs guarding (access with two users, transactions, Undo, migrations, source order). Playwright only for scan-to-save and shop check. A story that changes a spine contract updates ARCHITECTURE-SPINE.md in the same commit.

## UX & Interaction Patterns

- **Edit book** is a full-screen task sliding in over the section, a centred column no wider than a phone on wide screens. First screen: cover, title, author, source, Save pinned at the bottom as the one primary button. From the toast it also shows the copy's owned / ordered switch and a location combobox with inline add; choosing ordered hides the location. "More details" unfolds the remaining fields in place.
- Save returns to where the user came from (history back, `/` fallback) with "Saved"; from the toast it returns to Scan. X or Back with unsaved changes asks "Discard changes?" in a dialog. Unsaved changes live in `sessionStorage` per Book so they survive a trip through sign-in, cleared on Save or Discard. A Book the user doesn't hold shows the section without it and the toast "Not in library".
- **Cover controls** sit beside the cover, only for those allowed: "Add cover" or "Replace cover", and a destructive "Remove cover" with no dialog (it takes effect on Save, so "Discard changes?" is its confirmation). The file input accepts `image/*` and offers the camera on the phone; Use shows the straightened preview until Save. A rejected file shows "Not an image." or "Image too large." under the cover.
- **Corner crop** is a full-screen step, always in the dark palette whatever the theme (Mika picked option B on 2026-10-21; DESIGN.md → Corner crop): the photo on the dark ground, four 20px square handles with 44px tap areas joined by a 2px light outline starting as a centred 2:3 rectangle, both drawn over a 4px `crop-halo` line, the outside dimmed by `crop-dim`, the hint "Shoot it straight on", Use (primary) and Cancel at the foot. Use is disabled while the corners cross, fold or line up. On wide screens Tab moves between handles and arrow keys move the focused one. Mock-up: `ux-designs/ux-bookeh-2026-10-03/.working/corner-crop.html`.
- Look: no fills, square corners, outlined boxes, interface text lowercase through CSS (book data shown as written).

## Cross-Story Dependencies

- Within the open stories: 4.8 needs 4.7; 4.9 needs 4.7, 4.5 and 4.6; 4.13 needs only Epic 3's dialog wrappers; 4.14 needs 4.12, 4.13 and 4.7.
- 4.10 needs 4.9, the nightly backup from Epic 2, and real books and covers in production. Before real cataloguing began, production must have been confirmed free of test books, authors, series and covers; any found were removed by recreating the database.
- Handed onward: author and series suggestions on Edit book (Story 5.9); Edit from Book detail and re-fetch (Epic 5); loans removed with their copy (Epic 6); wishlist entries in `requireOwnBook` (Epic 7); the Ordered heading on the Answer (Story 8.2, until then a line "Ordered"); tags, user genres and themes on Edit book (Epic 9).
