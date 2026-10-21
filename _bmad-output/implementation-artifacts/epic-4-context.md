# Epic 4 Context: Fix fetched data and add covers

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make saved Books correctable. After a one-tap save, Edit book (reached from the save toast or by address) lets Mika fix any fetched field and, when opened from the toast, set the new copy's status and location. As admin his edits change a shared Book for everyone, other users' edits become their overrides, and edits to a private Book change that Book. The admin, or a private Book's creator, can add, replace or remove a cover, straightened and cropped to 2:3 by dragging four corners. The epic opens with eleven stories from the Epic 3 and Epic 1 retrospectives: written conventions, a hardened save path for Edit book to build on, and housekeeping. With Edit book in place, real cataloguing in production can begin, and a rehearsed restore proves the backups work.

## Stories

Run order: 4.15–4.25 first, in number order, then 4.1–4.14. Stories 4.15–4.22 are done.

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

- Every field Edit book shows starts with the viewer's effective values and is editable, except: ISBN only on the user's own private Book (a shared Book's ISBN never changes); system genres on a private Book and, on a shared Book, for the admin only (read-only for others); themes shown, never edited.
- Who an edit changes: the admin's edit to a shared Book writes the shared Book and clears the admin's own override of that field. A non-admin's edit to a shared Book becomes that user's override, a cleared field included. An edit to the user's own private Book changes the Book itself. The screen does not explain this.
- Edit book and covers have no Undo. Save shows "Saved". A rejected field shows its message under the field.
- Copy status is only `owned` or `ordered`; an ordered copy has no location. Setting ordered clears the location; setting owned uses the default location unless one is given. Moving several copies is all or nothing and has Undo.
- Cover upload accepts JPEG, PNG or WebP up to about 5 MB and strips all metadata, location included. An admin's upload on a shared Book is shared; a private Book's cover is visible only to its creator and the admin. Uploads by other users are Phase 3, not built.
- Cataloguing gate: real cataloguing starts once Epics 1–3, Stories 4.1–4.9 and 4.15–4.20 are done, Epic 2 is deployed and the default location is set. Covers (4.11–4.14) may land later. Story 4.10 rehearses one restore of the production backup holding the first real books and covers, and writes it down. After the gate, a schema story applies its migration to a restored copy of the latest production dump before merging.
- Every story: interface text in English and Finnish, the accessibility floor, tokens-only styling.

## Technical Decisions

- **Reaching a Book by id.** `requireOwnBook(ctx, bookId)` in `lib/books` is the only gate: it passes only when the viewer has a copy (open wishlist entries join in Epic 7), otherwise `NOT_FOUND`. Edit book, every client-sent `{ bookId }` and `saveCopy`'s `{ bookId }` target start with it. No code lists or searches `books`, `authors` or `series` directly, so Edit book has no author or series suggestions until Story 5.9.
- **`editBook(ctx, EditBookInput)` in `lib/catalogue`** is the only path for Book values after a save. The client sends a sparse `BookEdits` with only the changed fields; the server never diffs. Admin writes to shared rows are guarded by `canEditShared`. Overrides are written only through `upsertUserBook()` in `lib/books`, only on shared Books. The overridable set is declared once in `bookFields.ts` and excludes ISBN, cover, genres and themes. A field is overridden only when its name is in `overridden`; an empty stored value then means cleared. `EditBookInput.copy` (status, location) is written in the same transaction through `lib/copies`. Personal tags on Edit book belong to Epic 9; `catalogue` may not import `lib/tags`, a spine conflict to settle before Story 9.2.
- **Authors and series** are matched only by `findOrCreateByName()` (`equals` on `nameKey`, no accent folding). For a shared Book the admin's names match and create among shared records only. A user's override or private Book matches shared records first, then the user's private ones, and creates private.
- **`lib/copies`** is the only writer of `copies`: `setStatus`, `setNote`, `removeCopies`, `moveCopies`. Selection actions take a list of copy ids and run in one transaction, all or none. A location is a `Ref` (id, or `{ create: name }`); `undefined` means the default location, `null` none. `moveCopies` returns `Undone<T>` whose restore puts each copy back; a location created inline stays after Undo. Undo goes through `withUndo` in `lib/undo`; the undo test is required.
- **System privileges.** Only `lib/catalogue` (writes to `books`, `authors`, `series`, `genres`, `media`, plus `isUnreferenced()`), `lib/shelf` (read-only Drizzle) and the first-user seed may use them. In `lib/catalogue` every privileged Local API call spreads `system(ctx)` from `src/lib/catalogue/system.ts` (`req`, `overrideAccess: true`, `depth: 0`; set another `depth` after the spread). Lint rule `bookeh/system-privileges` fails on importing `system()` outside `lib/catalogue` and on any `overrideAccess` other than `false` elsewhere in `src`, the seed excepted. Private collections are always written through the gateway.
- **The save path Edit book builds on (4.16–4.20, done).** `SaveInput`'s ISBN target is `{ isbn13, pick?, candidate? }`, `candidate` being the shown candidate's `{ source, recordId }`. A save resolves the sources' outcome once, before its transaction opens, from the lookup cache, asking the sources only on a miss; no source is called inside a transaction. `chooseCandidate()` in `lib/catalogue` picks the candidate for both a new shared Book and an auto-share, and returns `NOT_FOUND` when the requested candidate has gone. A result merged while a source failed is cached for 5 minutes. Source values are clipped to field lengths. Saves that ask the sources and cover-preview fetches share the per-user lookup limit. A private-Book merge deletes the private Book only when `isUnreferenced()` (otherwise the save rolls back) and then removes its orphaned private authors, series and cover. A non-admin's typed value that differs from the source only by case, whitespace or punctuation becomes no override.
- **Covers.** `setCover(ctx, bookId, file, corners)` and `removeCover()` in `lib/catalogue` are the only upload path; anyone but the admin (shared Book) or creator (private Book) gets `NOT_FOUND`. Warp to 2:3 with sharp using hand-written Heckbert closed-form square-to-quad mapping and bilinear sampling (no crop library, no general solver). Write under a temporary name, rename into place, random filename. A replaced media row is deleted only when `isUnreferenced()`. `media` gains `visibility` and `createdBy`, read as `shared OR createdBy = me`, all for admin; create and delete only via `lib/catalogue` or admin. Admin re-fetch never replaces an uploaded cover. The browser applies orientation, shrinks to about 2000 px and sends the image and corners as form data in a server action; `serverActions.bodySizeLimit` is raised (read the bundled Next.js docs first).
- **Surface.** Mutations are server actions inside `runAction()` returning `ActionResult`; errors are `ErrorCode`s with messages at `errors.<CODE>`. Overlays only from the Base UI wrappers in `components/ui`. Edit book is a page on every width at `/books/[bookId]/edit`; `?copy=<copyId>` adds that copy's status and location.
- **Schema changes.** Dev uses push; a schema story commits its migration and regenerated `payload-types.ts`, schema stories merge one at a time (regenerate the migration after rebasing), and `payload migrate` never runs against dev. Integration and e2e lanes run on a migration-built `bookeh_test` with push off, locally as in CI; `scripts/test-db.ts` refuses a pushed one and names `npm run test:reset`. Production migrates at start, never pushes.
- **Tests.** Add a test only when the acceptance criteria name the behaviour or it guards a spine rule: access (two-user tests), transactions, Undo, migrations, a stated source order. One focused test per behaviour that can break; none restating markup, CSS, config or a mocked call sequence. Services get integration tests, pure functions `*.unit.spec.ts`. Use `createUser()` and `as(user)` from `tests/helpers/harness.ts`; tests create their own rows and never truncate; no network (fixtures under `tests/fixtures/<source>/`). Playwright only for scan-to-save and shop check.
- **Story conventions.** Compact stories (a spec and diff Mika can scan in one review; about 300 hand-written lines). A story that changes a spine contract updates ARCHITECTURE-SPINE.md in the same commit, as an acceptance criterion. One conventional commit per story.

## UX & Interaction Patterns

- **Edit book** is a full-screen task sliding in over the section, a centred column no wider than a phone on wide screens. First screen: cover, title, author, source, Save pinned at the bottom as the one primary button. From the toast it also shows the copy's owned / ordered switch and a location combobox with inline add; choosing ordered hides the location. "More details" unfolds the remaining fields in place.
- Save returns to where the user came from (history back, `/` fallback) with "Saved"; from the toast it returns to Scan. X or Back with unsaved changes asks "Discard changes?" in a dialog. Unsaved changes live in `sessionStorage` per Book so they survive a trip through sign-in, cleared on Save or Discard. A Book the user doesn't hold shows the section without it and the toast "Not in library".
- **Cover controls** sit beside the cover, only for those allowed: "Add cover" or "Replace cover", and a destructive "Remove cover" with no dialog (it takes effect on Save, so "Discard changes?" is its confirmation). The file input accepts `image/*` and offers the camera on the phone; Use shows the straightened preview until Save. A rejected file shows "Not an image." or "Image too large." under the cover.
- **Corner crop** is a full-screen step: the photo under the scrim, four handles with 44px tap areas joined by a 2px outline starting as a centred 2:3 rectangle, the outside dimmed, the hint "Shoot it straight on", Use (primary) and Cancel at the foot. Use is disabled while the corners cross, fold or line up. On wide screens Tab moves between handles and arrow keys move the focused one. Not mocked: Story 4.13 starts with rendered mock-up options for Mika to pick from.
- Look: no fills, square corners, outlined boxes, interface text lowercase through CSS (book data shown as written).

## Cross-Story Dependencies

- 4.23–4.25 run before 4.1. Within 4.1–4.14: 4.2 before 4.3 and 4.4; 4.7 needs 4.1 and 4.2; 4.8 needs 4.7; 4.9 needs 4.7, 4.5 and 4.6; 4.11 before 4.12; 4.13 needs only Epic 3's dialog wrappers; 4.14 needs 4.12, 4.13 and 4.7.
- 4.10 needs 4.9, the nightly backup from Epic 2, and real books and covers in production. Before real cataloguing began, production must have been confirmed free of test books, authors, series and covers; any found were removed by recreating the database.
- Handed onward: author and series suggestions on Edit book (Story 5.9); Edit from Book detail and re-fetch (Epic 5); loans removed with their copy (Epic 6); wishlist entries in `requireOwnBook` (Epic 7); the Ordered heading on the Answer (Story 8.2, until then a line "Ordered"); tags, user genres and themes on Edit book (Epic 9).
