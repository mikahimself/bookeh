# Epic 4 Context: Fix fetched data and add covers

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make saved Books correctable. After a one-tap save, Edit book (from the save toast or by address) lets Mika fix any fetched field and, when opened from the toast, set the new copy's status and location. As admin his edits change a shared Book for everyone, other users' edits become their overrides, and edits to a private Book change that Book. The admin, or a private Book's creator, can add, replace or remove a cover, straightened and cropped to 2:3 by dragging four corners. The epic opened with eleven stories from the Epic 3 and Epic 1 retrospectives (conventions, a hardened save path, housekeeping). With Edit book in place real cataloguing in production can begin, and a rehearsed restore proves the backups work.

## Stories

Run order: 4.15–4.25 first, then 4.1–4.14. As of 2026-10-21 only 4.10 and 4.14 are open; the rest are done.

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

- Edit book pre-fills every field with the viewer's effective values. ISBN is editable only on the user's own private Book; system genres on a private Book and, on a shared Book, by the admin only; themes are shown, never edited.
- Who an edit changes: the admin's edit to a shared Book writes the shared Book and clears the admin's own override of that field; a non-admin's edit becomes their override (a cleared field included); an edit to one's own private Book changes the Book itself.
- Edit book and covers have no Undo. Save shows "Saved". A rejected field shows its message under the field.
- Cover controls exist only for the admin on a shared Book and the creator of a private Book. Uploads accept JPEG, PNG or WebP up to about 5 MB and strip all metadata, location included. The admin's upload on a shared Book is shared; a private Book's cover is visible only to its creator and the admin. Other users' uploads on shared Books are Phase 3, not built.
- Promoting a private Book with an uploaded cover never leaves a private cover on the shared Book: an admin's cover row becomes shared; anyone else's is replaced by the source's cover and deleted when unreferenced.
- Backups hold users' private data and are readable by the operator only; at least one restore must be tested. The rehearsal restores into a scratch Postgres created with the Finnish ICU collation; a restore into a database created without it silently keeps the libc sort order.
- Cataloguing gate: real cataloguing starts once Epics 1–3, Stories 4.1–4.9 and 4.15–4.20 are done, Epic 2 is deployed and the default location is set; covers may land later. Before it, production must hold no test books, authors, series or covers (recreate the database if any). After the gate, a schema story applies its migration to a restored copy of the latest production dump before merging.
- Every story: interface text in English and Finnish, the accessibility floor, tokens-only styling.

## Technical Decisions

- **Reaching a Book by id.** `requireOwnBook(ctx, bookId)` in `lib/books` gates Edit book and every client-sent `{ bookId }`; it fails `NOT_FOUND` unless the viewer holds a copy (open wishlist entries join in Epic 7). No code lists or searches `books`, `authors` or `series` directly.
- **`editBook(ctx, EditBookInput)`** in `lib/catalogue` is the only path for Book values after a save. The client sends sparse `BookEdits` (changed fields only); the server never diffs. Overrides go only through `upsertUserBook()`; ISBN, cover, genres and themes are not overridable. The copy's status and location go in the same transaction through `lib/copies`; the cover goes through `setCover()` / `removeCover()` in the same server action.
- **`lib/copies`** is the only writer of `copies`. Ordered clears the location; owned uses the default unless given. A location `Ref` of `undefined` means the default, `null` none.
- **System privileges** only by spreading `system(ctx)` from `src/lib/catalogue/system.ts` inside `lib/catalogue`; lint (`bookeh/system-privileges`) fails on `overrideAccess` anywhere else but the first-user seed. The admin's in-app edits to shared records (Edit book, cover upload) are guarded by `canEditShared`.
- **Covers.** `setCover(ctx, bookId, file, corners: Corners)` is the only upload path; `Corners` is `[tl, tr, br, bl]` of `Point { x, y }` in the uploaded image's pixels, clockwise, origin top left. Errors: `NOT_AN_IMAGE`, `IMAGE_TOO_LARGE`, `INVALID_CORNERS`, `COVER_FAILED`; anyone not allowed gets `NOT_FOUND`. File and corners arrive as form data in a server action (body limit raised to about 5 MB). The replaced media row is deleted when `isUnreferenced()`. Admin re-fetch never replaces an uploaded cover. Covers render only through `coverUrl()` and the `Cover` component.
- **Crop in the browser.** Decode with orientation applied, shrink to about 2000 px, re-encode as JPEG; corners are in that image's pixels. HEIC is handled this way, so only the JPEG is uploaded. `checkCorners`, `Point` and `Corners` from `lib/catalogue/corners.ts` are the only `src/lib` runtime import allowed in client components. No crop library.
- **Surface.** Mutations are server actions inside `runAction()` returning `ActionResult`; error messages at `errors.<CODE>`. Overlays only from the Base UI wrappers. Edit book is a page at `/books/[bookId]/edit`; `?copy=<copyId>` adds that copy's status and location.
- **Tests.** Only where acceptance criteria name the behaviour or a spine rule needs guarding (two-user access, transactions, Undo, migrations, source order). Playwright only for scan-to-save and shop check. A story that changes a spine contract updates ARCHITECTURE-SPINE.md in the same commit.

## UX & Interaction Patterns

- **Edit book** is a full-screen task sliding in over the section, a centred phone-width column on wide screens. First screen: cover (with its controls where allowed), title, author, source, and from the toast the copy's owned / ordered switch and location combobox; Save pinned at the bottom as the one primary button. "More details" unfolds the rest in place. Save returns to where the user came from (`/` fallback; Scan when opened from the toast) with "Saved". X or Back with unsaved changes asks "Discard changes?"; unsaved changes live in `sessionStorage` per Book and survive a trip through sign-in.
- **Cover controls** sit beside the cover: "Add cover" (no cover) or "Replace cover", and a destructive "Remove cover" with no dialog, since it takes effect on Save and "Discard changes?" can still cancel it. The file input accepts `image/*` and offers the camera on the phone; choosing a file opens the Corner crop, and Use shows the straightened 2:3 preview in place of the cover until Save. A rejected file shows "Not an image." or "Image too large." under the cover.
- **Corner crop** is a full-screen step, always in the dark palette: four handles joined by an outline starting as a centred 2:3 rectangle, outside dimmed, hint "Shoot it straight on", Use (primary, disabled while the corners cross, fold or line up) and Cancel at the foot; keyboard handle moves on wide screens.
- Look: no fills, square corners, outlined boxes, interface text lowercase through CSS (book data shown as written).

## Cross-Story Dependencies

- 4.14 builds on 4.7 (Edit book screen and its Save), 4.12 (`setCover` / `removeCover`) and 4.13 (the Corner crop component), all done. It also closes the promote-with-uploaded-cover case deferred from 4.12.
- 4.10 needs the nightly backup and media copy from Epic 2 and real books and covers in production; it is done by the operator, with the steps and time taken written in `deploy/README.md`.
- Handed onward: author and series suggestions on Edit book (Story 5.9); Edit from Book detail and admin re-fetch (Epic 5); loans removed with their copy (Epic 6); wishlist entries in `requireOwnBook` (Epic 7); the Ordered heading on the Answer (Story 8.2, until then a line "Ordered"); tags, user genres and themes on Edit book (Epic 9).
