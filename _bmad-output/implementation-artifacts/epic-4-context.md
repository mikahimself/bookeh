# Epic 4 Context: Fix fetched data and add covers

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make saved Books correctable. After a one-tap save, Edit book (reached from the save toast or by address) lets Mika fix any fetched field and, from the toast, set the new copy's status and location. As admin his edits change a shared Book for everyone, other users' edits become their overrides, and edits to a private Book change that Book. The admin, or a private Book's creator, can add, replace or remove a cover, straightened and cropped to 2:3 by dragging four corners. The epic opens with eleven stories from the Epic 3 and Epic 1 retrospectives: written conventions, a hardened save path for Edit book to build on, and housekeeping. With Edit book in place, real cataloguing in production can begin, and a rehearsed restore proves the backups work.

## Stories

Run order: 4.15–4.25 first, in number order, then 4.1–4.14.

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

- Every field Edit book shows starts filled with the viewer's effective values and can be edited. The exceptions: ISBN is editable only on the user's own private Book, and a shared Book's ISBN never changes. System genres are editable on a private Book and, on a shared Book, by the admin only. Themes are shown but never edited.
- Who an edit changes: the admin's edit to a shared Book writes the shared Book and clears the admin's own override of that field. A non-admin's edit to a shared Book becomes that user's override, a cleared field included. An edit to the user's own private Book changes the Book itself. The screen does not explain any of this.
- Saving Edit book or a cover has no Undo. Save shows "Saved". A failed save shows an error toast and leaves the screen as it was. A rejected field shows its message under the field.
- Copy status is only `owned` or `ordered`. An ordered copy has no location, so setting a copy to ordered clears its location. Setting it to owned uses the default location unless one is given. Moving several copies is all or nothing, and the move has Undo.
- Cover upload accepts JPEG, PNG or WebP up to about 5 MB and strips all metadata, location included. An admin's upload on a shared Book is shared. A private Book's cover is visible only to its creator and the admin. Uploads by other users are not built (Phase 3).
- Cataloguing gate: real cataloguing starts once Epics 1–3, Stories 4.1–4.9 and 4.15–4.20 are done, Epic 2 is deployed and the default location is set. Covers (4.11–4.14) may land later. Story 4.10 rehearses one restore of the production backup holding the first real books and covers, and writes it down. After the gate, a story that changes the schema applies its migration to a restored copy of the latest production dump before it merges.
- Every story adds its interface text in English and Finnish, and follows the accessibility floor and the tokens-only styling rule.

## Technical Decisions

- **Reaching a Book by id.** `requireOwnBook(ctx, bookId)` in `lib/books` is the only gate: it passes only when the viewer has a copy (open wishlist entries are added in Epic 7) and fails with `NOT_FOUND` otherwise. Edit book, every `{ bookId }` a client sends and `saveCopy`'s `{ bookId }` target start with it. No code lists or searches `books`, `authors` or `series` directly, so Edit book has no author or series suggestions until shelf suggestions arrive in Epic 5.
- **`editBook(ctx, EditBookInput)` in `lib/catalogue`** is the only path for Book values after a save. The client sends a sparse `BookEdits` holding only the fields that changed, and the server never diffs. The admin's writes to shared rows use system privileges, guarded by `canEditShared`. Overrides are written only through `upsertUserBook()`, and only on shared Books. The overridable set is declared once in `bookFields.ts` and excludes ISBN, cover, genres and themes. A field counts as overridden only when its name is in `overridden`; an empty stored value then means cleared. A copy's status and location sent with the same edit are written in the same transaction through `lib/copies`. Personal tags on Edit book belong to Epic 9; a spine conflict (`catalogue` may not import `lib/tags`) must be settled before Story 9.2.
- **Authors and series** are matched only by `findOrCreateByName()`, by `equals` on `nameKey`, with no accent folding. For a shared Book the admin's names match and create among shared records only. A user's override or private Book matches shared records first, then the user's own private ones, and creates a private record.
- **`lib/copies`** is the only writer of `copies`: `setStatus`, `setNote`, `removeCopies`, `moveCopies`. Functions that act on a selection take a list of copy ids and run in one transaction, all or none. A location input is a `Ref`, either an id or a name to create; `undefined` means the default location and `null` means none. `moveCopies` returns `Undone<T>`, and its restore puts each copy back; a location created inline stays after Undo. The undo test is required.
- **Covers.** `setCover(ctx, bookId, file, corners)` and `removeCover()` in `lib/catalogue` are the only upload path. They warp the corners to 2:3 with sharp, using Heckbert's hand-written closed-form square-to-quad mapping and bilinear sampling, with no crop library and no general solver. The file is written under a temporary name and renamed into place, with a random filename. A replaced media row is deleted only when `isUnreferenced()`. `media` gains `visibility` and `createdBy`, following the same rule as Books. Admin re-fetch never replaces an uploaded cover. The browser decodes the photo with its orientation applied, shrinks it to about 2000 px and sends it as form data in a server action, with `serverActions.bodySizeLimit` raised. Read the bundled Next.js docs before changing that limit.
- **Save path hardening (4.16–4.20).** A save resolves the sources' outcome once, before its transaction opens, and asks the sources again only when no outcome is held; no source is called inside a transaction. The save carries the picked candidate's identity. A save whose candidate has gone, or whose ISBN no source knows any more, returns `NOT_FOUND`, which leads back to the Answer. Source values are clipped to their field lengths. Saves that ask the sources, and cover previews, count against the per-user lookup limit. A private-Book merge or promote checks `isUnreferenced()` and deletes orphaned private authors, series and covers. Under D-8, a value that differs from the source only by case, whitespace or punctuation is not kept as an override. Finna raw data keeps only the records that match the ISBN.
- **System privileges** go through one `system(tx)` helper. Lint fails on `overrideAccess: true` anywhere else, except the first-user seed. They are allowed only in `lib/catalogue` (writes to `books`, `authors`, `series`, `genres` and `media`, plus `isUnreferenced()`), `lib/shelf` and the seed.
- **Surface.** Mutations are server actions that run inside `runAction()` and return `ActionResult`. Overlays come only from the Base UI wrappers in `components/ui`. Edit book is a page on every screen width, at `/books/[bookId]/edit`, with `?copy=<copyId>` adding that copy's status and location.
- **Tests.** A story adds a test only when its acceptance criteria name the behaviour or the test guards a spine rule: access (a collection story ships a two-user access test, as does the shelf module), transactions, Undo (a service that records an Undo receipt ships a test that undoes it), migrations, or a stated order such as Finna before Google. One focused test per behaviour that can break; none that restate markup, class names, CSS, config or a mocked call sequence. Services are tested through integration tests, pure functions in `*.unit.spec.ts`. Tests run against `bookeh_test`, never the dev database, use `createUser()` and `as(user)` from `tests/helpers/harness.ts`, create their own rows and never truncate. No test reaches the network: adapters run against recorded responses in `tests/fixtures/<source>/`. Playwright covers only scan-to-save and shop check, using the fixture source (`BOOKEH_SOURCES=fixture`, refused in production) and ISBNs entered by hand. In review triage, a finding that only asks for a test is rejected unless it names the criterion or spine rule it would guard.
- **Story conventions.** Stories stay compact: a spec and diff Mika can scan in one review. A story that changes a spine contract updates ARCHITECTURE-SPINE.md in the same commit, as an acceptance criterion, never a deferral. One conventional commit per story.

## UX & Interaction Patterns

- **Edit book** is a full-screen task: a centred column no wider than a phone on wide screens, sliding in over the section. The first screen shows the cover, title, author and source, and Save is pinned at the bottom as the one primary button. Opened from the toast, it also shows the copy's owned / ordered text switch and a location combobox with inline add. Choosing ordered hides the location. A "More details" Link unfolds the remaining fields in place.
- Save returns to where the user came from: history back, or `/` when there is nothing to go back to. From the toast, it returns to Scan with "Saved". X or Back with unsaved changes asks "Discard changes?" in a dialog. Unsaved changes are kept in `sessionStorage` per Book, so they survive a trip through sign-in. A Book the user doesn't hold shows the section without it and the toast "Not in library".
- **Cover controls** sit beside the cover, only for those allowed to change it: "Add cover" or "Replace cover", plus a destructive "Remove cover" with no dialog, because it takes effect on Save and "Discard changes?" can still cancel it. The file input accepts `image/*` and offers the camera on the phone. A rejected file shows "Not an image." or "Image too large." under the cover.
- **Corner crop** is a full-screen step: the photo under the scrim, four square handles with 44px tap areas joined by a 2px outline that starts as a centred 2:3 rectangle, the outside dimmed, and the hint "Shoot it straight on". Use (primary) and Cancel sit at the foot. Use is disabled while the corners cross, fold or line up. On wide screens, Tab moves between handles and the arrow keys move the focused one. It is not mocked: Story 4.13 starts with rendered mock-up options for Mika to choose from.
- Look: no fills, square corners, outlined boxes, interface text lowercase through CSS (book data is shown as written).

## Cross-Story Dependencies

- 4.15–4.25 run before 4.1. 4.16 defines the `NOT_FOUND` save outcome that 4.17 reuses. 4.18 builds on 4.17's held outcome. 4.17–4.19 change the save and auto-share code from Epic 3 that Edit book builds on.
- Within 4.1–4.14:
  - Services: 4.2 comes before 4.3 and 4.4.
  - Edit book screen: 4.7 needs 4.1 and 4.2. 4.8 needs 4.7. 4.9 needs 4.7, 4.5 and 4.6.
  - Covers: 4.11 comes before 4.12. 4.13 depends only on the dialog wrappers from Epic 3. 4.14 needs 4.12, 4.13 and 4.7.
- 4.10 needs 4.9 and the nightly backup from Epic 2, with real books and covers in production. Before real cataloguing began, it must be confirmed that production held no test data; any found was removed by recreating the database.
- Handed onward: author and series suggestions on Edit book (Story 5.9); Edit from Book detail and re-fetch (Epic 5); loans removed along with their copy (Epic 6); wishlist entries in `requireOwnBook` (Epic 7); the Ordered heading on the Answer (Story 8.2); tags, user genres and themes on Edit book (Epic 9).
