---
id: SPEC-bookeh
companions:
  - ../../planning-artifacts/prds/prd-bookeh-2026-10-02/prd.md
  - ../../planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md
  - ../../planning-artifacts/architecture/architecture-bookeh-2026-10-03/STORY-SLICING.md
  - ../../planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md
  - ../../planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md
  - ../../planning-artifacts/epics.md
  - ../../../CLAUDE.md
sources:
  - ../../planning-artifacts/prds/prd-bookeh-2026-10-02/addendum.md
---

> **Canonical contract.** This SPEC and the files in `companions:` are the complete, preservation-validated contract for what to build, test, and validate. Source documents listed in frontmatter are for traceability — consult them only if you need narrative rationale or prose color this contract intentionally omits.

# Bookie — Phase 1 (v1)

Terms follow the PRD Glossary: a **Book** is one shared edition, a **copy** is one user's physical item. The interface calls the product **bookeh**. `FR-n` and `NFR-n` point into the PRD, `AD-n` into the architecture spine, track letters into the story slicing; screens are specified in EXPERIENCE.md and DESIGN.md.

## Why

A pain to solve. Mika's roughly 200 mostly Finnish books sit in several homes, so he buys duplicates and loses track of loans. From the phone, Bookie must answer three questions in seconds: do I already have this, where is it, and who has it. Phase 1 delivers that for Mika alone on the tailnet. The data model is multi-user from the start, so family and friends can join later without a rebuild.

## Capabilities

- **CAP-1 Sign-in**
  - **intent:** The seeded user signs in with email and password, and every page requires a signed-in user (FR-1).
  - **success:** An unauthenticated request to any page except sign-in redirects to sign-in and, after it, returns to the address the user wanted. The first user, seeded on an empty database, can sign in and out.

- **CAP-2 Private data isolation**
  - **intent:** Each user's private data is readable and writable only by that user. The admin role does not open it (FR-48, PRD Visibility table).
  - **success:** For every private collection, a two-user test shows that another user and an admin cannot read, change, delete or reference the owner's rows, by foreign id or through shelf queries. A private Book, author or series is readable only by its creator and the admin. A guessed Book id opens nothing the user does not hold.

- **CAP-3 Profile and device preferences**
  - **intent:** The user sets a display name, an interface language, an optional default location, and profile and collection visibility on the profile, and layout, size, theme and loans order per device (FR-4, FR-51).
  - **success:** Changing the language switches the whole interface between English and Finnish. A new owned copy saved without a chosen location lands at the default location. The two visibility settings are stored with their defaults (hidden, closed), switch in Settings, and change nothing else in Phase 1. Layout, size, theme and loans order are remembered on the device, not on the account, and are right on the first paint.

- **CAP-4 ISBN capture**
  - **intent:** The user scans an ISBN barcode with the phone camera inside the installed app, or types the ISBN (FR-10).
  - **success:** Scanning works on iOS Safari and Android and reads only ISBN barcodes. ISBN-10 and ISBN-13 input with hyphens or spaces normalises to the same 13 digits. The camera stays on across scan and answer until the user leaves scanning.

- **CAP-5 Lookup**
  - **intent:** For an ISBN, or a title or author, the user gets an existing Book or fetched metadata from pluggable sources, without anything being saved (FR-11, FR-18, FR-20).
  - **success:** A Book the user can read is returned before any source is called. Otherwise each field takes the first non-empty value in source order, Finna then Google Books. The outcome is found, none, or "the sources did not answer"; the last is never cached and the Answer offers Try again before entering the book by hand. A failing or slow source does not fail the lookup. Lookup writes no rows and is rate-limited per user. Adding a source changes no code in the add-book flow. The raw source response is stored on save and readable only by the admin. Searching by title or author shows the user's own copies and open wishlist entries first, then the sources. When the sources hold several records for one ISBN, the Answer lists the editions, preselects the best and the user picks; the Book keeps the ISBN scanned. Search rows show binding, year and publisher.

- **CAP-6 Answer and Edit book**
  - **intent:** After a scan or lookup the user sees what the book is and whether it is in the library, saves it as fetched, and edits the fetched data afterwards (FR-13, FR-14, FR-16).
  - **success:** The Answer shows cover, title, author and edition, names the original source and never another user, says which author or series the save would create, and lists the user's copies when the edition is already owned while still allowing another copy. Add to library saves at once. Edit book, reached from the save toast or Book detail, pre-fills every field, lets the user edit all of them and the personal tags, and from the toast also the new copy's status and location. A user's edits to a shared Book are their overrides and the shared record keeps the source's values; the admin's edits change the shared Book for everyone; edits to the user's private Book change the Book. The admin on a shared Book, and the creator of a private Book, add, replace or remove its cover from Edit book: a photo straightened and cropped to 2:3 by marking its four corners, with image metadata stripped; no one else can (FR-47, Phase 1 part).

- **CAP-7 Save and Undo**
  - **intent:** One save creates the Book if needed and the copy or wishlist entry, and the user can undo it and other simple actions (FR-15, FR-17).
  - **success:** A save is all or nothing, puts an owned copy at the default location, and returns to the scanner with a toast offering Edit and Undo that stays until the next Answer. Undo removes the copy or entry plus any Book, author or series nothing else references, and reopens entries the save closed. Undo is also offered after move, tag, read, lend, returned, received, bought and ordered, single or on a selection; removals, deletes and merges are confirmed first and have no Undo. Undo is unavailable after an app restart, expires 30 minutes after the action, and the toast hides it then; every toast can be closed. A failed save shows an error toast and leaves the screen as it was. A double tap saves once. Scan to save takes under 20 s (NFR-2).

- **CAP-8 Manual entry**
  - **intent:** The user adds a book that no source knows, with title and author as the only required fields (FR-12, FR-22).
  - **success:** The Not found Answer asks for title and author, also when reached from a title search with the typed text filled in. The save creates a private Book visible only to its creator. Scanning it again returns that Book, not a duplicate. When the creator later saves it, or runs Look it up again from the Book, and the sources now answer for its ISBN, the Book becomes shared with the source's values; the creator's differing values become their overrides, except the admin's, which are dropped. A Book without an ISBN is never merged automatically; its creator can add an ISBN on Edit book.

- **CAP-9 Shop check**
  - **intent:** The user scans a barcode or searches by title or author and sees whether they already have the book (FR-20 to FR-22).
  - **success:** The Answer's heading is the first fact that applies — In library, Ordered, On wishlist, Not in library, Not found — and every other fact is a line under the book: each copy with its location, Ordered, and each wishlist it is on. Not in library offers Add to wishlist, Add to library and Back with no rescan; In library offers Open book and Add another copy; Ordered offers Received. Search covers the user's collection and the external sources, never the rest of the shared catalogue. On 4G the answer arrives within 2 s for a known Book and 5 s for an external one (NFR-1).

- **CAP-10 Collection**
  - **intent:** The user browses, searches, filters, sorts and selects copies in their collection (FR-23 to FR-25, FR-33).
  - **success:** The app opens in the collection; there is no home screen, and Scan book is within reach on every section. One row is one copy. The list shows rows or covers in three sizes, remembered per device, scrolls endlessly, and keeps its position when the user comes back from scanning or editing. Search matches title, author, series, ISBN and notes. Filters on author, series, genre, theme, personal tag, publisher, year, language, page range, status, location, read and rating combine with AND, values within a field with OR, and both filters and sort use the user's overrides; author sort is by family name. An opened Book's author, series, genres, themes, tags and location are chips that add a filter. A selection can be moved, tagged, marked read or unread, or removed, all or none. Results appear in under 1 s at 10,000 copies (NFR-3). Sorting follows Finnish collation and "a" never matches "ä" (NFR-7).

- **CAP-11 Book detail**
  - **intent:** The user sees and acts on everything they hold on a Book in one place (FR-26, FR-27, FR-29, FR-30).
  - **success:** Book detail opens over the collection or loans as a bottom sheet on the phone and a side panel beside the list on wide screens, addressed by `?book=`, and only for a Book the user has a copy or open wishlist entry of. It shows the Book, read flag, 1–5 rating, each copy with its location, status, note and actions (Lend, Returned, Move, Remove, Received), past loans, wishlist entries, system genres and themes, the user's genres, themes and tags, with Edit and Add to wishlist at the foot. Read, rating, notes and tags change in place; Book fields change on Edit book. Read and rating belong to the user and the Book, not to a copy. A user can own several copies of one edition.

- **CAP-12 Copy status**
  - **intent:** The user tracks whether a copy is ordered or owned (FR-28).
  - **success:** Status is ordered or owned and nothing else, and an ordered copy has no location. Ordered is set on Edit book right after adding a book, or by marking a wishlist entry ordered. Received turns an ordered copy into an owned one at the default location. A copy can be removed after confirmation, which removes its loans.

- **CAP-13 Locations**
  - **intent:** The user records where each copy is and manages the list of places (FR-31 to FR-33).
  - **success:** Locations are private and can be added inline wherever one is picked. A user with no locations sees no location fields. Several selected copies change location in one action. In settings a location can be renamed, merged into another or deleted; deleting clears it from copies and from the profile default, and renaming onto an existing name offers a merge.

- **CAP-14 People and loans**
  - **intent:** The user lends an owned copy to a Person and sees what is out (FR-34 to FR-37).
  - **success:** A loan has a Person, picked or added inline, and a lending date. A copy has at most one open loan and keeps its location while lent. Returned closes the loan and history is kept. The loans view lists what is out by person or by date, with returned loans below; collection rows and Book detail show who has a lent copy. In settings a Person can be renamed or merged; a Person with a loan or wishlist entry, open or closed, cannot be deleted.

- **CAP-15 Wishlists**
  - **intent:** The user keeps several named private wishlists, with entries optionally meant for a Person (FR-38, FR-39, FR-28).
  - **success:** The wishlists section lists every list with its count; a list shows its entries with their recipients and can be renamed or deleted, which deletes its entries. Adding to a wishlist asks which list. An opened entry has a For field that can be set, changed or cleared at any time; empty means for the user. Bought or Ordered closes the entry and creates an owned or ordered copy, unless the entry is for a Person, which closes it without a copy. Remove deletes the entry.

- **CAP-16 Genres and themes**
  - **intent:** Books carry shared system genres from Google Books categories and system themes from Finna's subject terms; users add their own genres and themes beside them (FR-17, FR-17a).
  - **success:** A save matches Google's categories to the seeded genre list by English name and creates the missing ones; the mapping can be re-run over stored subjects; the Answer says which genre a save would create. Genres show in the user's language, English when there is no Finnish name. The admin edits names, adds, merges and deletes genres in Settings, touching shared rows only, and edits a shared Book's genres on Edit book; no user can override them. Finna's subject terms are stored as themes, shown as chips and filterable, never edited, and filled by a re-fetch when empty. User genres and themes work like personal tags and may not take a system name.

- **CAP-17 Admin re-fetch**
  - **intent:** The admin re-fetches metadata for a shared Book (FR-19).
  - **success:** Only the admin can trigger it, from Book detail. It fills empty shared fields, themes and the cover included, overwrites no existing value (an uploaded cover counts), and touches no user's overrides.

- **CAP-18 Install**
  - **intent:** The app installs as a PWA on iOS and Android and works in desktop browsers (FR-50).
  - **success:** The app opens from the home screen on an iPhone and an Android phone, with the camera working over HTTPS.

- **CAP-19 Deploy and backups**
  - **intent:** The app runs in production on the LXC over the tailnet, with nightly backups that can be restored (NFR-6).
  - **success:** A push to `main` yields an image the LXC pulls; migrations apply at start. The database and media are backed up nightly to the NAS, readable by the operator only. One restore has been rehearsed and written down.

- **CAP-20 Personal tags**
  - **intent:** The user tags Books for themselves and manages the tags (FR-17, FR-25, FR-33).
  - **success:** Personal tags, user genres and user themes are one private collection in three kinds, matched within the user's own values of that kind. In Settings each kind has its own list to rename, merge and delete; a user genre or theme may not take a system name. A tag is added or removed on one Book from Book detail or Edit book, and on a selection in one action. Tags filter the collection. In settings a tag can be renamed, merged or deleted.

## Constraints

- Only Phase 1 is built. The multi-user data model is built now, and no Phase 1 decision may rule out Phases 2–3 (public ingress, invites, friends, sharing, curation, OAuth, email).
- AD-1 to AD-20, the layer import rules and the conventions in the spine bind every story. Changing one is a spine change, not a story decision.
- The interface follows DESIGN.md (look) and EXPERIENCE.md (behaviour); the two documents win over any mock-up. Overlays come from the project's Base UI wrappers, the typeface is Open Sans, and no other component or animation library is added.
- The stack is decided and not reopened: Payload 3.x on Next.js, Postgres 16, a PWA with `@zxing/browser`, one LXC with Docker Compose, `tailscale serve`, no Kubernetes, exactly one app instance.
- The custom frontend is the product. Payload admin is the back office and is themed only. The frontend never calls Payload REST or GraphQL.
- Shared facts, private everything else. Nothing in the shared layer reveals what a user owns, wants or wrote. Shared Book values come only from server-held source responses or the admin. Users never browse the shared catalogue.
- Lookup order is existing Book, then Finna, then Google Books, never Google before Finna.
- v1 is reachable on the tailnet only. Every NFR-5 item must hold before any public exposure. No email is sent. No service worker, and no cross-request caching of anything derived from user data.
- Sorting uses the `fi-FI` ICU collation. Search and name matching never fold accents.
- Every interface string exists in English and Finnish from the story that adds it.
- A story is one concern (one collection, one service or one screen), about 300 hand-written changed lines, and leaves `main` deployable. Schema stories merge one at a time with a committed migration.
- Strict TypeScript; `any` only for `rawMetadata`.

## Non-goals

- Phase 2: public internet ingress, invites and password resets, change password, email change, session list, data export, account deletion and deactivation, admin action log, friends, open collections and friend chips.
- Phase 3: sharing wishlists in the app or by link, suggestions, merges of Books, promotion of private Books, non-admin cover uploads on shared Books, cover approval and alternative covers.
- AI recommendations, email delivery, OAuth, open self-registration, a moderator role.
- Offline use, bulk ISBN import, order details such as shop and due date, view tracking, selling or valuing books.
- Per-copy or per-friend visibility within an open collection.
- A home screen, a review step before saving, and Edit book inside the detail panel on wide screens.
- Restructuring the Payload admin beyond a light theme.
- Migrating data from the old single-copy collections; they are replaced.

## Success signal

All of Mika's roughly 200 books are catalogued in the production database with locations set, each added in under 20 s. In a shop, a scan answers "do I have this?" within NFR-1, and "where is it?" takes under 10 s from the phone. No duplicate is bought after cataloguing. If more than one book in ten needs a manual correction after saving, the shared metadata is costing more than it saves.

## Assumptions

- The spec covers Phase 1 only, because it is the only committed phase.
- The PRD, the spine, the story slicing, the UX documents and CLAUDE.md stay the owners of their detail and are read alongside this spec; nothing is copied out of them.
- Where companions disagree, the PRD decides what is built, the spine how, the UX documents how it looks and behaves; CLAUDE.md yields to all three.
- The `[ASSUMPTION]` tags left in EXPERIENCE.md and DESIGN.md stand as written until a story touches them.
- The PRD's Assumptions Index stands for the items Phase 1 touches (FR-12, FR-14 as refined on 2026-10-06, FR-28).

## Open Questions

None open. The FR-4 visibility fields are built in Phase 1 (D-1); genre seeding and mapping are decided (D-2, D-6).
