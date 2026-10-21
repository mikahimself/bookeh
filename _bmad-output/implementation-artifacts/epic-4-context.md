# Epic 4 Context: Fix fetched data and add covers

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make fetched data fixable after the save, and make the save path solid enough to catalogue the real collection on. The epic opens with eleven stories from the Epic 3 retrospective: conventions, a save that fails usefully, uses the edition the Answer showed, counts against the lookup limit and merges private Books cleanly, plus housekeeping. Then it builds Edit book, reached from the save toast (with the new copy's status and location) or by address. The admin's edits change a shared Book for everyone, other users' edits become their overrides, and edits to one's own private Book change the Book. Cover upload comes last: four-corner straighten and crop to 2:3. Stories 4.1–4.9 and 4.15–4.20, with Epics 1–3, open the cataloguing gate. 4.10 rehearses the restore once real books are in. The cover stories may land after cataloguing starts.

## Stories

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

- Saving stays one tap with no review step; fixes happen afterwards on Edit book, which pre-fills every field. Edits, cover changes, status changes and removals have no Undo. Moving copies does.
- Who gets an edit: the admin's edit on a shared Book changes it for everyone. Another user's edit is their override, visible only to them. Edits to one's own private Book change the Book. Themes are never edited. ISBN is editable only on one's own private Book, where a clash with another of one's private Books is a field error.
- A Book is reachable by id only when the viewer holds a copy of it (open wishlist entries are added in Epic 7). Otherwise it fails with `NOT_FOUND`, and a guessed id never reveals the shared catalogue.
- A save that cannot succeed must lead somewhere. If no source knows the ISBN any more, the scan screen shows the Not found Answer again. Source values over a field's length limit (title and subtitle 500, description 10 000, author and series names 200) are clipped. Manual values over the limit are marked "too long" on their own field. Every other failure is "Couldn't save. Try again.".
- The edition saved is the one the Answer showed. If that candidate is gone, the save fails with `NOT_FOUND` and never saves another edition. Every path that asks the sources in a user's name (lookup, a save with no held outcome, a cover preview fetch) shares the per-user limit of 30 per 60 s (`RATE_LIMITED`).
- When a private Book is shared or merged into an existing shared Book, it is deleted only when unreferenced. Its own orphaned private authors, series and cover are removed. A non-admin's typed value that differs from the source only by case, whitespace or punctuation becomes no override.
- `raw.finna` keeps only the records matching the ISBN, each one whole with `fullRecord`. A one-off script trims Books already saved.
- Covers: JPEG, PNG or WebP up to about 5 MB (`NOT_AN_IMAGE`, `IMAGE_TOO_LARGE`). EXIF and GPS data are stripped. Invalid corners give `INVALID_CORNERS` and a failed write gives `COVER_FAILED`. Only the admin (shared Book) or the creator (private Book) may change a cover. A private Book's cover is visible only to its creator and the admin.
- At the gate, before real cataloguing, confirm that production holds no catalogue rows. After the gate, a story that changes schema applies its migration to a restored production dump before merge.

## Technical Decisions

- **One lookup outcome per save.** A save uses the held source outcome. It asks the sources again only on a miss, and always before the transaction opens. No source call ever runs inside a transaction. The one outcome feeds both the cover download and `ensureSharedBook()`. The Answer sends `pick` together with the candidate's identity (source and record id). A `found` merged while a source failed is held for a few minutes. Auto-share takes the picked candidate (D-7). This replaces Epic 3's "the save never calls the sources" wording.
- **System privileges** go through one `system(tx)` helper (`{ req, overrideAccess: true, depth: 0 }`). Lint bans `overrideAccess: true` in `src` outside the helper and the first-user seed. Privileges stay limited to `lib/catalogue` (writes to books, authors, series, genres, media and `isUnreferenced()`), `lib/shelf` reads and the seed.
- **`requireOwnBook(ctx, bookId)`** in `lib/books` guards Edit book, Book detail and every client `{ bookId }`. `saveCopy` gains a `{ bookId }` target.
- **`editBook(ctx, EditBookInput)`** in `lib/catalogue` is the only path for Book values. The client sends a sparse `BookEdits` with only the changed fields, cleared fields included, and the server never diffs. Admin on a shared Book: writes the Book with system privileges, guarded by `canEditShared`, matches names among shared records only, may set system genres, and clears the admin's own override of each edited field. Other users: `upsertUserBook()` overrides, names matched by `findOrCreateByName()` (shared first, then own private, otherwise created private), genres rejected. Private Book: edits the Book itself, ISBN normalised, system genres picked from the existing list. Copy status and location sent with the edit are written in the same transaction through `lib/copies`.
- **`lib/copies`** is the only writer of copies. `setStatus` to ordered clears the location; owned uses the default location unless one is given. `setNote` trims and NFC-normalises. `removeCopies(ids)` and `moveCopies(ids, Ref | null)` are all or none in one transaction, and a single-row action calls the same function with one id. `moveCopies` is undoable and fails the whole move with a field error if any copy is ordered. A location created inline stays after Undo. Pickers take a `Ref`: an id, or a name to create.
- **Covers** (AD-14): `setCover(ctx, bookId, file, corners)` and `removeCover` in `lib/catalogue` are the only upload path. The four corners are warped to 2:3 with sharp, using a hand-written closed-form square-to-quad projective mapping (Heckbert) and bilinear sampling, with no solver or crop library. The output is resized, re-encoded and written under a temporary name, then renamed into place. The replaced media row is deleted when unreferenced, and re-fetch never replaces an uploaded cover. `media` gains `visibility` and `createdBy`, read `shared OR createdBy = me`, with existing rows migrated to shared. The file arrives as form data in a server action; raise `serverActions.bodySizeLimit` to about 5 MB after reading the bundled Next.js docs.
- **Spine changes travel with the story.** A story that changes a spine contract updates ARCHITECTURE-SPINE.md in the same commit, as an acceptance criterion. A deferred item handed to a later story becomes that story's acceptance criterion.
- **Tests.** Add a test only when an acceptance criterion names the behaviour or a spine rule is at stake (access, transactions, Undo, migrations, a stated order such as Finna before Google). Write one focused test per behaviour that can break, and no tests of markup, CSS, config or mocked call sequences. The shared-Book `editBook` stories prove with two users who sees an edit. Undoable services test their undo. Playwright stays limited to scan-to-save. The integration lane runs on the migration-built `bookeh_test` with push off, as in CI.
- **Story size.** A story is a spec and diff Mika can scan in one review. Split a spec that warns oversized before building it.

## UX & Interaction Patterns

- **Edit book** (`/books/[bookId]/edit`, `?copy=<copyId>` from the toast): full screen, a centred phone-width column on wide screens. The first screen shows the cover, title, author and source, with Save as the one primary button, pinned at the bottom. From the toast it also shows the copy's owned/ordered Text switch and its location (combobox with inline add). Choosing ordered hides the location. Save returns to where the user came from (history back, `/` as fallback), or to Scan from the toast, with the toast "Saved" and no Undo. X or Back with changes asks "Discard changes?" in a dialog. Unsaved changes live in `sessionStorage` per Book until Save or Discard. A rejected field shows its message under the field. A Book the user does not hold shows the section and the toast "Not in library". An ordered copy shows as an "Ordered" line on the In library Answer.
- **More details** is a Link that unfolds every field in place, pre-filled with effective values. Authors and series are text fields; suggestions come in Epic 5. System genres are read-only for non-admins on a shared Book. Themes are shown but never editable.
- **Cover:** "Add cover" or "Replace cover" and a destructive "Remove cover" (no dialog, since Discard can still cancel it), shown only to those allowed. The file input is `image/*` and offers the camera on the phone. The Corner crop is full screen: four 2px-outlined square handles with 44px tap areas, the outside under the scrim, the hint "Shoot it straight on", Use (primary, disabled for an invalid shape) and Cancel. On wide screens, Tab and the arrow keys move the handles. The browser decodes the file with its orientation applied (HEIC included), shrinks it to about 2000 px and uploads a JPEG. Errors show under the cover: "Not an image." or "Image too large.". The crop step starts with a rendered mock-up choice.
- **Settings switches** show the value of the last tap and ignore stale results. Each switch group has a distinct accessible name. An error toast clears when a retry succeeds.
- All strings are in English and Finnish. Error toasts stay until dismissed and leave the screen as it was.

## Cross-Story Dependencies

- Order: 4.15–4.25 first, in number order, then 4.1–4.14. 4.16 comes before 4.17, whose gone-candidate `NOT_FOUND` uses 4.16's handling. 4.18 builds on 4.17's held outcome. The stories from 4.16 to 4.19 all touch `saveCopy`, `ensureSharedBook` and `sharePrivateBook`, so they merge one at a time.
- Service chain: 4.1 (E21) → 4.2 (D5) → 4.3 and 4.4. 4.7 (D21) needs 4.1 and 4.2. 4.8 needs 4.7. 4.9 needs 4.7, 4.5 and 4.6. 4.10 needs 4.9 and Epic 2's backups.
- Covers: 4.11 → 4.12. 4.13 needs only the dialog wrappers. 4.14 needs 4.12, 4.13 and 4.7.
- Handed onward: author and series suggestions on Edit book (Story 5.9), Book detail's Edit entry (Epic 5), loans removed with copies (Epic 6), wishlist entries in `requireOwnBook` (Epic 7), personal tags, user genres and themes on Edit book (Epic 9). The spine catch-up from Epic 3 (AD-9 contract, Toasts row, AD-17 signatures, seed) is done by whichever story touches each area.
