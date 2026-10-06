---
title: Sprint Change Proposal — sync the planning documents to epic decisions D-1 to D-8
status: approved, applied 2026-10-06
created: 2026-10-06
project: bookeh
trigger: bmad-create-epics-and-stories, 2026-10-06
---

# Sprint Change Proposal — 2026-10-06

## 1. Issue summary

**Problem.** While the epics and stories were written on 2026-10-06, eight planning decisions (D-1 to D-8) and a handful of smaller rulings were taken and recorded in `epics.md` under "Planning decisions taken while writing the epics". The documents that bind every story still say otherwise: the PRD, the architecture spine with STORY-SLICING.md, EXPERIENCE.md, DESIGN.md and SPEC.md. `epics.md` itself names this as a precondition for sprint planning ("so no story is built to a superseded rule").

**Discovery.** Reported by the epics workflow at the end of planning. No sprint has started; there is no sprint status file and no code beyond the scaffold (`f8f104e`, `7d34440`).

**Evidence.** `epics.md` lines 205–241 (the decisions), line 388 (the precondition), and the 184 stories that cite D-1 to D-8. The contradictions per document are listed in section 2.

**Category.** New requirements and refined understanding during planning. Not a technical limitation, not a pivot.

The decisions, in short:

| # | Decision | Changes |
|---|---|---|
| D-1 | Profile and collection visibility fields built in v1, shown in Settings, no effect yet | spine Deferred, SPEC |
| D-2 | System genres from Google Books categories; saves create them; admin manages names in Settings | PRD FR-17, spine AD-5, SPEC CAP-16 |
| D-3 | Finna subject terms stored as themes, a filter and chips, never overridden | PRD (new FR-17a), spine shapes |
| D-4 | Cover upload with four-corner straighten and 2:3 crop, admin on shared Books and creators on private Books, in Phase 1 | PRD FR-47, spine AD-14, UX |
| D-5 | Edit book (with the copy's status and location) before the collection | STORY-SLICING order |
| D-6 | System vs user genres and themes; user ones are tags with a kind; no genre override | spine AD-6, AD-8, AD-19, UX |
| D-7 | Edition picker when several records share an ISBN; `binding` display-only | spine AD-9, AD-11, UX Answer |
| D-8 | Admin edits change the shared Book; "Look it up again" for hand-entered Books | PRD FR-14, spine AD-5, UX |
| rulings | Rating "Clear" Link; close (X) on every toast; Undo receipts 30 min and hidden when expired; Received per ordered copy line; Settings two columns; `requestId` as its own slice; K7 after the users migration; Phase 1 acceptance story; "Add without ISBN" on Scan; last backup shown to the admin | UX, spine, STORY-SLICING |

## 2. Impact analysis

### Epic impact

None. The nine epics and 184 stories already embody the decisions. No epic is added, removed, re-scoped or resequenced. Two housekeeping lines in `epics.md` are out of step with its own stories (section 4.7).

### Story impact

None now. The purpose of this change is that no story is later built against a superseded rule.

### Artifact conflicts

| Document | Where it contradicts the epics |
|---|---|
| `prds/prd-bookeh-2026-10-02/prd.md` | Glossary (genre, no theme); FR-11 (no edition pick); FR-12 (auto-share only on save); FR-13 (new-marker for authors and series only; no cover on the edit screen); FR-14 (all edits are overrides); FR-17 (curated list, no creation, no user genres); no FR-17a; FR-25/26/27 (no theme, admin suggests fixes); FR-47 (all P3); FR-48; Build Order; Assumptions Index; Open Questions 3 and 4 |
| `architecture/.../ARCHITECTURE-SPINE.md` | AD-3 allowlist (no `genres`); AD-5 ("Saves never create genres", "Admin edits shared records in the back office", auto-share only in the save); AD-6 (genres overridable); AD-8 (tags without kinds); AD-9 (single merged result, no candidates or `binding`); AD-11 (`{ isbn13 }` only); AD-14 (download only; `media` without visibility); AD-18, AD-19, AD-20 (lifetime deferred); Toasts convention; Stack (no sharp); Entities (genre override edge); Shared shapes; Routes; Deployment seed; Source tree; Capability map; Deferred (visibility, genre curation, media fields) |
| `architecture/.../STORY-SLICING.md` | 38 slices missing (A26, B11, C9–C12, D25–D33, E29–E33, G11–G15, H14–H17, J10–J13, K10–K14); G6 not retired; order puts the collection before Edit book; K7 and K5 dependencies; totals (147 vs 184) |
| `ux-designs/.../EXPERIENCE.md` | Rating (tap again to clear); Toast (no X, no expiry); Settings (no visibility, genres, my genres/themes, last backup); Book detail (no themes, no Look it up again, no Re-fetch); Filter panel (no theme); Answer (no edition pick; Ordered offers Received as a button); Edit book (overrides only; no cover); Scan (no Add without ISBN); Lookup rows (no binding) |
| `ux-designs/.../DESIGN.md` | Rating and Toast rows; no crop-step component |
| `specs/spec-bookeh/SPEC.md` | CAP-3, 5, 6, 7, 8, 10, 11, 16, 17, 20; Non-goals (visibility in Phase 2, all cover uploads in Phase 3); Assumptions (genres never created); both Open Questions |

### Technical impact

No code exists yet for any of this. The decisions add bounded work already sized in the epics: two profile fields and two switches (D-1), a `kind` on `tags` and a `themes` field on `books` (D-3, D-6), `nameFi` on `genres` (D-2), `visibility` and `createdBy` on `media` plus sharp image processing (D-4), candidates in lookup (D-7), two new service functions (D-8). The Phase 1 MVP goal is unchanged.

## 3. Recommended approach

**Direct Adjustment.** Edit the six documents so they state the decisions. Effort: low to medium, about a day of document work; no code. Risk: low, and the risk of not doing it is high, since the documents are what stories are built against.

Alternatives considered:

- **Rollback.** Not applicable; nothing is built and the decisions were taken by Mika in review.
- **MVP review.** Not needed. Phase 1 keeps its goal and success metrics. It grows by two small, already-decided pieces (visibility fields, the admin/creator cover upload) and neither threatens the cataloguing gate, which explicitly excludes covers.

## 4. Detailed change proposals

All six were approved one by one on 2026-10-06 (incremental mode). Quoted text is the current wording; "→" gives the replacement. Where an item is an addition, the insertion point is named.

### 4.1 PRD — `prds/prd-bookeh-2026-10-02/prd.md`

1. **Glossary.** Replace
   `- **Genre.** A shared, curated classification.`
   `- **Personal tag.** A user's private label.`
   →
   `- **System genre.** A shared classification with an English and a Finnish name. The list is seeded from Google Books' top-level categories, grows when a save meets a category it lacks, and is managed by the admin.`
   `- **Theme.** A shared subject term stored on a Book as Finna gives it (a **system theme**). Not translated, not overridable.`
   `- **Personal tag, user genre, user theme.** A user's private labels, in three kinds. They sit beside the system genres and themes and are visible only to that user.`

2. **FR-11.** After the three sub-bullets add
   `  - When the sources hold several records for one ISBN (a paperback and a hardcover, several printings), the answer lists them, preselects the best and lets the user pick whose details the Book takes. The Book keeps the ISBN that was looked up.`

3. **FR-12.** `It becomes shared only through admin approval (FR-46), or automatically when a later external lookup matches its ISBN [ASSUMPTION].`
   → `It becomes shared only through admin approval (FR-46), or automatically when a later external lookup matches its ISBN [ASSUMPTION]: on the creator's next save of it, or when the creator runs **Look it up again** from the Book. Hand-entered values that differ from the source's become the creator's overrides, except the admin's, which are dropped.`

4. **FR-13.** `says whether each author and series is new or already exists` → `says whether each author, series and genre is new or already exists`.
   `lets the user edit all of them, along with the user's personal tags.` → `lets the user edit all of them, along with the user's personal tags, genres and themes (FR-17), and, for the admin on a shared Book or the creator of a private Book, its cover (FR-47).`

5. **FR-14.** `  - A shared Book keeps the source's values, and a user's edits are stored as their overrides [ASSUMPTION].`
   → `  - A shared Book keeps the source's values, and a user's edits are stored as their overrides [ASSUMPTION]. The admin's edits change the shared Book itself, for everyone. System genres and themes cannot be overridden (FR-17, FR-17a).`

6. **FR-17 and new FR-17a.** Replace FR-17 with
   `- **FR-17** Authors and series are matched to existing shared records by name, ignoring case, and created if missing. Those created from a private Book stay private along with it. System genres come from Google Books categories: a save matches them by English name to the seeded genre list and creates the missing ones, without a Finnish name. The admin adds Finnish names, adds genres, and merges or deletes duplicates. System genres are shared and not overridable; each user can add their own user genres to a Book alongside them. Personal tags, user genres and user themes are matched within the user's own, and the user can rename, merge and delete them. A user genre or theme may not take a system genre's or theme's name.`
   `- **FR-17a** A shared Book stores Finna's subject terms as themes, as given. Themes are shown on the Book and are a filter. They are source data: not overridable, and filled by a re-fetch when empty (FR-19). Each user can add their own user themes alongside them.`

7. **FR-25.** `  - author, series, genre and personal tag` → `  - author, series, genre, theme and personal tag (genre and theme cover the system values and the user's own)`.
   `its author, series, genres, tags and location are shortcuts` → `its author, series, genres, themes, tags and location are shortcuts`.
   **FR-26.** `read flag, rating, notes and personal tags.` → `read flag, rating, notes, genres, themes and personal tags.`
   **FR-27.** `To change a shared value, the user suggests a fix (FR-45).` → `To change a shared value, the user suggests a fix (FR-45); the admin changes it directly on the edit screen (FR-14).`

8. **FR-47.** Replace with
   `- **FR-47** A user can upload a cover for a Book, straightened and cropped to 2:3 by marking its four corners on the photo. Uploads must be images within a size limit, and location and other image metadata are stripped. In Phase 1 the admin's upload sets a shared Book's cover for everyone, and a private Book's creator sets that Book's cover, visible only to them; both from the edit screen (FR-13). Any other user's upload on a shared Book is visible only to the uploader until the admin approves it; after approval it is an alternative cover anyone can pick, and it never replaces another user's choice.`

9. **FR-48.** After the first sentence add `Shared records are edited in the back office and, for a Book's fields, its genres and its cover, on the edit screen (FR-14, FR-17, FR-47).`

10. **Build Order, Phase 1.** `- The data model, and sign-in for a single seeded user (FR-1, FR-4)` → `- The data model, and sign-in for a single seeded user (FR-1, FR-4, including the two visibility settings, which have no effect until F8)`. Add bullets `- System genres and themes from the sources, and the admin's genre management (FR-17, FR-17a)` and `- Cover upload for the admin and for private Books (FR-47, Phase 1 part)`.
    **Phase 3.** `- Curation: suggestions, merges, promotion and covers (F9)` → `- Curation: suggestions, merges, promotion, and the rest of FR-47: other users' uploads, approval and alternative covers (F9)`.

11. **Assumptions Index.** `| FR-12 | A private Book becomes shared on its own when a later external lookup matches its ISBN. |` → `| FR-12 | A private Book becomes shared on its own when a later external lookup matches its ISBN, on the creator's next save or on Look it up again (refined 2026-10-06). |`
    `| FR-14 | A user's edits on a shared Book become their overrides, not shared values. |` → `| FR-14 | A user's edits on a shared Book become their overrides, not shared values; the admin's edits change the shared Book (Mika, 2026-10-06). |`

12. **Open Questions.** 3 → `Decided in the architecture (AD-9): the sources are called in parallel and merged field by field; with several records for one ISBN the user picks the edition (2026-10-06).` 4 → `Decided in the architecture (AD-6): a sparse override layer on top of the shared record.`

### 4.2 Architecture spine — `architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md`

1. **AD-3.** `src/lib/catalogue, for writes to books, authors, series and media` → `..., for writes to books, authors, series, genres and media`. Add a bullet: `The admin edits shared records from the app in three places, all in src/lib/catalogue and guarded by canEditShared: Edit book (editBook() writes the shared Book for an admin), genre management in Settings, and cover upload (AD-14). This is the deliberate exception to "admin edits shared records in the back office" (Mika, 2026-10-06).`

2. **AD-5, who edits.** `Admin edits shared records in the back office.` → `The admin edits shared records in the back office and, through lib/catalogue, on Edit book, in genre management and by cover upload (AD-3).`
   `On a shared Book, the edits become that user's overrides (AD-6). On the user's own private Book, they update the Book itself.` → `On a shared Book, a user's edits become their overrides (AD-6); an admin's edits are written to the shared Book itself (scalar fields, authors and series matched among shared records, system genres) and clear the admin's own override of each edited field. Themes are never edited. On the user's own private Book, edits update the Book itself.`

3. **AD-5, client values.** After `except the title and authors of a manual Book, which is private.` add `With several candidates held for an ISBN it carries only pick, the index of the chosen candidate (AD-9).`

4. **AD-5, auto-share.** `ISBN auto-share happens only inside the save transaction, for the acting user's own private Book, when ...` → `ISBN auto-share happens in two places and nowhere else: inside the save transaction, for the acting user's own private Book, when the server-held source outcome for its ISBN is found (AD-9) and no shared Book exists; and in lookupAgain(), which the creator runs from Book detail or the In library Answer, which calls the sources (rate-limited) and runs the same transaction without creating a copy. The save never calls the sources itself. Then: ... the creator's former values that differ become their overrides (an admin's are dropped), ...` (rest unchanged).

5. **AD-5, genres.** Replace the "Saves never create genres" bullet with `System genres: on a shared Book, books.genres is written only by mapSubjectsToGenres() in lib/catalogue. It matches the Google Books categories in rawMetadata.subjects.google to genres by nameKey on the English name, creates the missing ones with no Finnish name, and can be re-run over stored subjects; until the genre stories land it returns none. The admin edits a shared Book's system genres on Edit book and manages the list (English and Finnish names, add, merge, delete) through lib/catalogue; a merge or delete touches shared rows only. On a private Book, genres are its creator's picks from the existing list, written by editBook(). Users have no write access on genres.`

6. **AD-5, re-fetch.** `It fills empty shared fields only and never touches user-books.` → `It fills empty shared fields only, themes and the cover included; an uploaded cover is an existing value. It never touches user-books.`

7. **AD-6.** `read flag, rating with ratedAt, and personal tags.` → `read flag, rating with ratedAt, and the user's tags of every kind (AD-8).`
   `ISBN-13 is identity and is not overridable.` → `ISBN-13 is identity, and genres and themes are system data; none of the three is overridable.`
   `Relationship overrides (authors, series, genres) are relationship fields to the same collections. A typed author or series name that matches nothing becomes a private record (AD-5). A genre override picks from existing genres.` → `Relationship overrides (authors, series) are relationship fields to the same collections. A typed author or series name that matches nothing becomes a private record (AD-5). A user classifies a shared Book for themselves with user genres and user themes, which are tags (AD-8), not overrides.`

8. **AD-8.** `Read flag, rating and personal tags are on user-books; notes are on copies.` → `Read flag, rating and the user's tags are on user-books; notes are on copies. Personal tags, user genres and user themes are one tags collection with kind: tag | genre | theme. A user's name in a kind may not equal a system genre's English or Finnish name, nor a system theme on a Book the user holds (SYSTEM_NAME). A system genre created later with a user genre's name leaves the user genre in place.`

9. **AD-9.** Replace the lookupSources bullet with `lookupSources(isbn13) in lib/metadata calls every source in sources/index.ts in parallel, each under a timeout. A source's lookupByIsbn returns its matching records best first. lookupSources builds one candidate per record of the first source that answered, each gap-filled field by field from the other sources' best record in array order (Finna, then Google Books). It reports one of three outcomes: found, with the candidates best first and RawMetadata; none, when every source answered and none has the ISBN; or unavailable, when there is no result and at least one source failed or timed out. A source that has failed or timed out several times in a row is skipped for a cooldown (a circuit breaker in process state, AD-12) and counts as failed. Results and none are cached in process by ISBN-13; unavailable, and a result merged while a source failed or timed out, are never cached.`
   Source bullet: `It returns SourceResult or nothing` → `It returns a list of SourceResult, empty for none`. Add: `A result carries the ISBN asked for, never another ISBN in the record. binding is display-only and never stored. Finna's subject terms become themes; a source's own categories are kept as its subjects.`
   lookupBook bullet: add `The source kind carries the candidates and the matches for the picked one; the Answer selects a candidate with ?pick=<n>, an out-of-range pick falls back to the best, and once a shared Book exists for the ISBN there is nothing to pick.`
   searchBooks: `keeps one hit per ISBN-13` → `keeps one hit per ISBN-13 with its binding`.
   Rate limit: `lookupBook and searchBooks share one per-user rate limit` → `lookupBook, searchBooks and lookupAgain share one per-user rate limit`.

10. **AD-11.** `An Answer opened by ISBN sends { isbn13 }.` → `An Answer opened by ISBN sends { isbn13, pick? }.`

11. **AD-14.** Title → `Covers are stored locally; downloaded and uploaded only by lib/catalogue`. Binds add FR-47. Download bullet: add `Downloads use https from an allowlist of source image hosts, with a size limit and a timeout. Files are written under a temporary name and renamed into place when complete; onInit removes files without a media row that are older than an hour.`
    New bullet: `setCover(ctx, bookId, file, corners) in lib/catalogue is the only upload path: the admin for a shared Book, the creator for their private Book; anyone else fails with NOT_FOUND. It accepts JPEG, PNG or WebP within a size limit, warps the four-corner quadrilateral into a 2:3 rectangle with sharp (a closed-form square-to-quad projective mapping with bilinear sampling, hand-written; no crop library, no general solver), strips all metadata, resizes and re-encodes, creates the media row with a random filename and sets books.cover; the replaced row is deleted when isUnreferenced(). removeCover() clears the cover. Neither is undoable. The browser decodes the photo with its orientation applied, shrinks it to about 2000 px and sends the image and the four corner points in a server action, whose body size limit is raised for it.`
    Media bullet: `media read requires a signed-in user.` → `media carries visibility: shared | private and createdBy as in AD-4: a source-downloaded cover and the admin's upload on a shared Book are shared; a private Book's cover is private, readable by its creator and the admin. Read requires a signed-in user and follows that constraint.`

12. **AD-18.** `tags in lib/books` → `tags of every kind in lib/books`; `The profile is read and updated only through lib/account.` → `The profile, profileVisibility and collectionVisibility included, is read and updated only through lib/account. System genres are managed only through lib/catalogue, admin only.`

13. **AD-19.** `and (createdBy, nameKey) or (owner, nameKey) among private rows` → `and (createdBy, nameKey) or (owner, nameKey) among private rows; (owner, kind, nameKey) for tags`.

14. **AD-20.** `After a restart or once the token has expired, Undo is unavailable.` → `Receipts live 30 minutes; a result carries the seconds remaining on its token and the toast hides Undo when they run out. After a restart or once the token has expired, Undo is unavailable.` `Removals, deletes, merges and editBook are not.` → `Removals, deletes, merges, editBook, setCover, lookupAgain and genre administration are not.`

15. **Toasts convention.** `an action's result carries the names its toast shows.` → `an action's result carries the names its toast shows and the seconds remaining on its undoToken. Every toast has a close (X).`

16. **Stack.** Add `| sharp (already a Payload dependency) | as installed; used by setCover() for the cover warp |`.

17. **Entities.** Remove `USER_BOOKS }o--o{ GENRES : "override"`.

18. **Shared shapes.**
    - `SourceResult`: add `themes: string[] // Finna subject terms as given` and `binding?: string // "paperback", "hardcover"; display only`.
    - `SourcesOutcome`: `{ kind: 'found'; result: SourceResult }` → `{ kind: 'found'; candidates: SourceResult[]; raw: RawMetadata } // best first`.
    - `SearchHit`: Pick adds `'binding'`.
    - `EffectiveBook`: add `themes: string[]`; comment `genres: Named[] // system genres`.
    - `lib/books`: add `type TagKind = 'tag' | 'genre' | 'theme'`; `UserBookState = { read: boolean; rating: number | null; tags: (Named & { kind: TagKind })[] }`.
    - `LookupResult` source kind → `{ kind: 'source'; candidates: Draft[]; pick: number; matches: { authors: Match[]; series: Match | null; genres: Match[] } }` with `type Draft = Omit<SourceResult, 'raw' | 'coverUrl'> & { hasCover: boolean }` and the comment `// matches are for candidates[pick]`.
    - `LookupTarget`: `{ isbn: string; pick?: number } | { bookId: number }`.
    - `BookEdits.genres`: comment → `// system genre ids: private Books, and shared Books for the admin`.
    - `SaveInput.target`: `{ isbn13: string }` → `{ isbn13: string; pick?: number }`.
    - `EditBookInput.tags?: Ref[]` → `tags?: Partial<Record<TagKind, Ref[]>> // the full set per kind`; add comment `// the cover goes through setCover() in the same action`.
    - `ShelfQuery.filters`: comment `genre: number[] // system genre ids and the user's genre tag ids`; add `theme: string[] // by text: system themes exactly, the user's themes by name`.
    - `Undoable<T> = T & { undoToken: string; undoSeconds: number }`.

19. **Routes.** `/scan` row: `With ?isbn=<text> or ?book=<bookId>, the Answer, rendered by the page.` → `With ?isbn=<text> or ?book=<bookId>, the Answer, rendered by the page; &pick=<n> selects an edition.` `With ?title=<text>, the Not found Answer with the title filled in.` → `With ?title=<text>, the Not found Answer with the title filled in; also reached from Scan's "Add without ISBN" Link, for a book with no barcode.`

20. **Deployment seed, backups.** Add `The script refuses to dump a database with no users and writes last-backup.json where the app can read it; Settings shows the last backup to the admin and flags one older than 48 hours.` `One restore is rehearsed before Phase 1 is called done (NFR-6).` → `One restore is rehearsed at the cataloguing gate, once the first real books are in, and written down (NFR-6).`

21. **Source tree.** `catalogue/` → `... covers (download, upload and warp), re-fetch, lookupAgain, genre admin`; `books/` → `... changeTags and tags of every kind, coverUrl`; `account/` → `profile read and update, visibility`.

22. **Capability map.** F1: `(Phase 1: FR-1, FR-4)` → `(Phase 1: FR-1, FR-4 with the visibility fields)`. F9: `Not built, except admin re-fetch (FR-19). Enters through visibility and the back office.` → `Phase 1 builds admin re-fetch (FR-19), the admin's edits of shared Books on Edit book (FR-14), genre management (FR-17) and the Phase 1 part of FR-47 (cover upload). The rest enters through visibility and the back office.` Governed by adds AD-14.

23. **Deferred.** Remove `media gains visibility and createdBy when user uploads arrive.` and the whole "Profile visibility and collection visibility" entry. Add `Non-admin cover uploads on shared Books, approval and alternative covers (FR-47). Phase 3.` Replace "Genre curation" with `Genre vocabulary. The seeded list and its Finnish names are written in the seed story (G4). Whether Finna's genre terms are also mapped is decided by the fixture checkpoint (C9).` "Undo tuning" → `Undo store size is set in the lib/undo story; the lifetime is 30 minutes (Mika, 2026-10-06).` "Lookup tuning" adds `circuit-breaker thresholds`.

### 4.3 Story slicing — `architecture/architecture-bookeh-2026-10-03/STORY-SLICING.md`

1. **Intro.** After `It is input for epics and stories, not the stories themselves` add `The stories live in epics.md; this view was brought into line with them on 2026-10-06.` Add slicing rule 10: `A screen that is not mocked (the Genres group in Settings, the corner-crop step) starts with a rendered mock-up choice, as an acceptance criterion of its first story.`

2. **Recommended sequence.** Replace the paragraph with: `Recommended sequence, as the epics order it: A with K1, K5, K9 and K10; K2 to K4; then D9, C9, B, U, C, D1 to D8, D10, D15 to D18, D23, D25, D26, D32, E26, F1, F2, I9, K11 and C12 for the first saved book; then A20, E21, D5, D19 to D22, D24, D27 and F6 for Edit book with the copy's status and location, which with K2 to K4 opens the cataloguing gate (K12 rehearses the restore once real books are in); then D28 to D31 (covers), E, F3 to F5, F7, F8, H13, D33, K6 and K14; then J, H, I, G, and K13 last. Edit book comes before the collection (D-5) so real cataloguing never produces a book without a location.`

3. **New rows.**

   | # | Slice | Kind | Depends on | Governed by |
   |---|---|---|---|---|
   | A26 | Swiping between sections, wrap-round, edge-swipe ignored | Screen | A22 | UX: Information Architecture |
   | B11 | `bookFields`: the Book field set and the overridable list (not ISBN, genres, themes) | Library | B1 | AD-6 |
   | C9 | Real-book fixture capture (~30 ISBNs) and the genre coverage checkpoint | Setup | none | Tests, D-2 |
   | C10 | Finna adapter: series, themes and author `sortName` | Adapter | C2 | AD-9, D-3 |
   | C11 | `matches` on the lookup result: new authors and series | Service | C6 | AD-9, FR-13 |
   | C12 | Edition picker on the Answer, `?pick`, `{ isbn13, pick }` | Screen | D16, C4 | AD-9, AD-11, D-7 |
   | D25 | Answer: in library, with Add another copy | Screen | D17, E26 | FR-16, FR-20 |
   | D26 | Answer: not found, entered by hand; "Add without ISBN" on Scan | Screen | D17, D7 | FR-12, FR-22 |
   | D27 | More details on Edit book | Screen | D21 | FR-13 |
   | D28 | `media` visibility and `createdBy` | Collection | A18, B2 | AD-4, AD-14 |
   | D29 | `setCover` and `removeCover`: validation, four-corner warp with sharp, metadata stripped | Service | D28, D1 | AD-14, FR-47 |
   | D30 | Four-corner crop component, after a rendered mock-up choice | Screen | A20 | UX: Edit book |
   | D31 | Add, Replace and Remove cover on Edit book | Screen | D29, D30, D21 | AD-14, FR-47 |
   | D32 | `requestId`: a repeated save returns the first result | Service | D4, A24 | AD-11, AD-12 |
   | D33 | `lookupAgain`: Look it up again for a hand-entered Book | Service | D8, C6, E8 | AD-5, AD-9, D-8 |
   | E29 | Book detail as the side panel on wide screens | Screen | E8 | UX: Book detail |
   | E30 | Open book on the In library Answer | Screen | E8, D25 | UX: Answer screens |
   | E31 | Filter panel: author, series and publisher comboboxes | Screen | E7, E18 | FR-25 |
   | E32 | Filter panel: year, pages and rating | Screen | E7 | FR-25 |
   | E33 | Sort, with reversal | Screen | E7 | FR-25 |
   | G11 | Genre admin service: names, add, merge, delete, `genreUse` | Service | B5, D1 | AD-3, AD-5, D-2 |
   | G12 | Genres in Settings, admin only, after a rendered mock-up choice | Screen | G11, K5 | UX: Settings |
   | G13 | Theme filter: system themes by text, user themes by tag | Service | E3, E18, G1 | AD-7, FR-17a |
   | G14 | Genres, themes and tags on Book detail | Screen | E8, E22, G1 | FR-26 |
   | G15 | `matches.genres` and "New genre" on the Answer | Service | G5, C11 | FR-13, D-2 |
   | H14 | Open entries in `getHoldings` and `requireOwnBook` | Service | H2, E26, E21 | AD-7, AD-9 |
   | H15 | A Person with wishlist entries cannot be deleted | Service | H2, J7 | AD-18 |
   | H16 | Entry recipient and removal services | Service | H2, J7 | AD-8, AD-18 |
   | H17 | On wishlists in Book detail | Screen | H2, E8 | UX: Book detail |
   | J10 | Loans in `getHoldings` | Service | J2, E26 | AD-9 |
   | J11 | Lent marker on rows and the Answer | Screen | J3, E6, D25 | FR-37 |
   | J12 | Loans by person | Screen | J5 | FR-37 |
   | J13 | Returned loans group | Screen | J5 | FR-36 |
   | K10 | `users.profileVisibility` and `collectionVisibility`, through `lib/account`, switches in Settings | Collection | A8, K5, K9 | AD-18, FR-4, D-1 |
   | K11 | Default location in Settings | Screen | K5, F1 | UX: Settings |
   | K12 | Rehearsed restore at the cataloguing gate | Setup | K4, D22 | NFR-6 |
   | K13 | Phase 1 acceptance: the success metrics measured and written down | Test | everything | PRD Success Metrics |
   | K14 | Last backup in Settings, admin only | Screen | K4, K5 | NFR-6 |

4. **Changed rows.** B2 depends on `A12, B1, B11`. B5 → `genres: name, nameFi, nameKey; shared only, admin-managed; access test`. C1 → `Source contract: SourceResult with sortName, themes and binding, record lists, and the merge function`. C2 → `Finna adapter: core fields`. C4 → `lookupSources: parallel calls with timeouts, candidates, the three outcomes, cache and circuit breaker`. D4 → `saveCopy: one transaction, an owned copy` (requestId to D32). D5 → `editBook: scalar edits; overrides for a user, the shared Book for the admin`. D21 → `Edit book screen: first screen, Save, Discard changes` (More details to D27). D22 depends on `D21, D17, D24, F6`. E7 → `Filter panel: value lists`. E8 → `Book detail, display only: the sheet on the phone`. E13 → `Admin re-fetch: fills empty fields, themes and the cover included`. G1 → `tags with kind and nameKey unique per owner and kind, and user-books.tags`. G2 → `The picker for tags, genres and themes in Book detail and on Edit book`. G3 → `Tag and user-genre filters`. G4 → `Seeded system genres with Finnish names (migration)`. G5 → `mapSubjectsToGenres: Google categories on save, create missing, admin re-run`. G7 → `changeTags of any kind, SYSTEM_NAME, with Undo`. G8 → `Rename, merge and delete for each kind`. G9 → `Settings: Tags, My genres and My themes`. I2 → `In library, Ordered and On wishlist Answers; Received on each ordered copy's line`, depends on `I1, D25, E30, H13`. I7 → `Add by hand from Lookup's "Nothing found"`, depends on `I6, D26`. J5 → `Loans section by date; lent marker` depends unchanged. K4 → `Nightly backup script and timer, writes last-backup.json; the rehearsal is K12`. K5 → `Settings section: display name, language, theme, sign out; two-column layout`, depends on `A22, A21, K9`. K7 depends on `A2, A8`.

5. **Retired slices.** Add `| G6 | Genre override on Edit book | nothing; genres are system data (D-6, dropped 2026-10-06) |`.

6. **Slices most likely to outgrow the limit.** Replace the table with: `Every split suggested here on 2026-10-05 was made when the stories were written: B11, C10, C11, D27, D32, E29, E31 to E33, A26, J12 and J13.`

7. **Total.** `Total: 147 slices across 12 tracks, with 11 numbers retired.` → `Total: 184 slices across 12 tracks, with 12 numbers retired.`

### 4.4 EXPERIENCE.md — `ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md`

1. **Information Architecture.** Settings purpose → `Profile, language, theme, profile and collection visibility, default location; manage locations, People, tags, my genres and my themes; for the admin, genres and the last backup; sign out.` Scan purpose → `Camera, ISBN entry, "Find by title or author" and "Add without ISBN".` Answer address → `/scan?isbn={isbn13}, with &pick={n} for a chosen edition`. Edit book purpose → `Book fields, the user's tags, genres and themes, and the cover where the user may change it.`

2. **Component Patterns.** Filter chip use → `Author, series, genre, theme, tag and location on an opened Book`. Combobox use adds `theme`. Rating → `Five stars. Tap a star to set that rating; tap another to change it; tapping the current star does nothing. A "Clear" Link beside the stars, shown only while a rating is set, clears it. Saved at once (FR-29).` Toast: add `Every toast has a close (X). Undo is hidden once its receipt has expired (30 minutes).` New row: `Corner crop | Cover upload on Edit book | A full-screen step: the photo with four corner handles joined by a 2px outline, starting as a 2:3 rectangle in the middle, the outside dimmed by the scrim, and the hint "Shoot it straight on". Drag each handle onto a corner of the cover; on wide screens Tab moves between handles and the arrow keys move the focused one. Use (primary) is disabled while the corners cross, fold or line up; Cancel returns nothing. Not mocked; its story starts with a rendered mock-up choice.`

3. **Undo table.** `Tag (many) | "Tagged {n} · Undo"` → `Tag (one or many, any kind) | "Tagged {n} · Undo" | Restores each Book's tags.` Add `Look it up again | "Shared · from {source}" | No Undo.` and `Cover on Edit book | "Saved" | No Undo.`

4. **Filter panel.** Value-list row: `genre` → `genre (system genres in the user's language, then the user's own)`. Combobox row: `Author, series, publisher` → `Author, series, publisher, theme (Finna's and the user's)`. Rating row: `The Rating component, meaning "at least"` → `The Rating component, meaning "at least"; removed with its Clear Link`.

5. **Book detail.** Genres and tags row → `Classification | System genres (in the user's language), the user's genres, system themes, the user's themes and personal tags as Filter chips; empty kinds are absent. "Add tag" opens the picker for tags, genres and themes.` New rows: `Look it up again | On the creator's own private Book with an ISBN: a Link that calls the sources. Found: the Book takes the source's values and becomes shared (the edition picker when there are several), toast "Shared · from {source}". None: toast "Still not found." Sources didn't answer: the toast names them. Without an ISBN the line reads "Add the ISBN on Edit book to look it up." Not undoable.` and `Re-fetch | Admin only, on a shared Book: fills empty fields, themes and the cover included; never overwrites.`

6. **Scan.** New row `Add without ISBN | A Link that opens the Not found Answer with an empty title field and no ISBN, so a book with no barcode can be catalogued.` **Lookup** results → `Rows show cover, title, author, and binding · year · publisher, so editions of one title can be told apart.`

7. **Answer screens.** Ordered row → `Ordered | The user's only copies are ordered | **Back**; each ordered copy's line carries its own Received Link`. In library row adds `; Look it up again on the creator's private Book`. New paragraph after the table: `**Several editions.** When the sources hold several records for the ISBN, the Answer says "{n} editions found" under the Book, preselects the best and offers a picker listing each candidate's binding, year, publisher, pages and cover. Picking one re-renders the Answer with ?pick={n}, replacing the history entry, with its cover and new-record notes; Add to library and Add to wishlist save the picked one, and the Book keeps the scanned ISBN. Nothing about editions is shown with one candidate or an existing shared Book.`

8. **Edit book.** First screen → `Cover, with "Add cover" or "Replace cover" and a destructive "Remove cover" beside it for the admin on a shared Book or the creator of a private Book, absent for anyone else; title, author, source. The user's tags, genres and themes. When opened from a save toast, also that copy's status (owned / ordered) and location, showing their saved values. **Save** is pinned at the bottom.` More details → `A Link that unfolds the remaining fields in place: title, subtitle, authors, series, number in series, publisher, year, language, pages, description, system genres and themes. Every field is editable (FR-13) with three exceptions: on a shared Book, system genres are editable for the admin and read-only for others; themes are shown and never edited; ISBN is editable on the user's own private Book only.` New row `Cover | Choosing a file (the camera is offered on the phone) opens the Corner crop; Use shows the straightened 2:3 preview in place of the cover until Save. A rejected file shows "Not an image." or "Image too large." under the cover. The cover changes on Save, with no Undo, like the rest of Edit book.` Saving → `Returns to where the user came from, with the toast "Saved". A user's edits to a shared Book are stored as their overrides (FR-14); the admin's change the shared Book for everyone; edits to the user's own private Book change it. The screen does not explain this.`

9. **Settings.** Add before the table: `Two columns on wide screens: profile, language, theme, visibility, default location and Sign out in the first; the managed lists in the second. One column on the phone.` New row after Theme: `Profile and collection visibility | Two Text switches: public / hidden and open / closed. Both on the profile, default hidden and closed; no effect until friends exist (FR-4).` `Locations, People, Tags` → `Locations, People, Tags, My genres, My themes | One List row each, with what uses it ("31 books", "2 loans"). Each row has Rename, Merge and Delete. On the phone these three sit on a second line. "Add location" and "Add person" add one; genres and themes are added from a Book.` Rename → add `A user genre or theme may not take a system genre's or theme's name.` New rows: `Genres (admin only) | One List row per system genre in the user's language with its Book count and a "No Finnish name" mark where missing. The English and Finnish names are edited in place; "Add genre" adds one; Merge and Delete are confirmed by a dialog and have no Undo. Absent for other users. Not mocked; its story starts with a rendered mock-up choice.` and `Last backup (admin only) | "Last backup: {date}". Marked in {colors.danger} with "Backup is overdue." when the last successful backup is older than 48 hours, missing or failed.`

10. **State patterns.** Add `Rejected cover file | Edit book | "Not an image." or "Image too large." under the cover.`, `Still not found | Book detail, after Look it up again | Toast "Still not found."` and `Undo expired | Toast | The Undo Link is hidden once the receipt has expired.`

11. **Mock-ups, record, flows.** Not-mocked list adds `the Genres group in Settings and the Corner crop step, which start with a rendered mock-up choice`. After "Changes to the sources" add: `**Brought in from the epics on 2026-10-06** (Mika's rulings in the story review): the Rating's Clear Link; a close (X) on every toast and Undo hidden after 30 minutes; Received on each ordered copy's line of the Answer; "Add without ISBN" on Scan; the two-column Settings; the edition picker (D-7); Look it up again (D-8); system and user genres and themes (D-2, D-3, D-6); cover upload with the Corner crop (D-4); the visibility switches (D-1); the admin's last-backup line.` UJ-2 gains a variant: `Variant, two editions: Finna lists the paperback and the hardcover for the ISBN. The Answer says "2 editions found" with the paperback preselected; he taps the hardcover, then Add to library.` Frontmatter sources add `_bmad-output/planning-artifacts/epics.md`.

### 4.5 DESIGN.md — `ux-designs/ux-bookeh-2026-10-03/DESIGN.md`

1. **Rating row** → `Five 22px star outlines. Rated stars are stroked in {colors.text}, the rest in {colors.text-dim}. No star is filled. A "Clear" Link in {typography.meta} sits beside the stars while a rating is set.`
2. **Toast row**: `message on the left, actions as Links on the right` → `message on the left, actions as Links and a Close (X) on the right`.
3. **New Components row**: `Corner crop | The photo full screen under the {colors.scrim}; the quadrilateral inside the four handles is undimmed and outlined in {spacing.stroke-control} {colors.text}. Four square handles at the corners, outlined in {spacing.stroke-control} {colors.text}, each with a 44px tap area; the hint in {typography.meta} above; Use (primary) and Cancel at the foot. [ASSUMPTION: handles 20px, like the checkbox.]`

### 4.6 SPEC.md — `specs/spec-bookeh/SPEC.md`

1. **CAP-3.** Intent adds `profile visibility and collection visibility`; success adds `The two visibility settings are stored with their defaults (hidden, closed), switch in Settings, and change nothing else in Phase 1.`
2. **CAP-5.** Success adds `When the sources hold several records for one ISBN, the Answer lists the editions, preselects the best and the user picks; the Book keeps the ISBN scanned. Search rows show binding, year and publisher.`
3. **CAP-6.** `Edits to a shared Book are that user's overrides and the shared record keeps the source's values; edits to the user's private Book change the Book.` → `A user's edits to a shared Book are their overrides and the shared record keeps the source's values; the admin's edits change the shared Book for everyone; edits to the user's private Book change the Book. The admin on a shared Book, and the creator of a private Book, add, replace or remove its cover from Edit book: a photo straightened and cropped to 2:3 by marking its four corners, with image metadata stripped; no one else can (FR-47, Phase 1 part).`
4. **CAP-7.** Success adds `Undo expires 30 minutes after the action and the toast hides it then; every toast can be closed.`
5. **CAP-8.** `When the creator later saves it and the sources now answer for its ISBN, the Book becomes shared with the source's values and the creator's differing values become their overrides.` → `When the creator later saves it, or runs Look it up again from the Book, and the sources now answer for its ISBN, the Book becomes shared with the source's values; the creator's differing values become their overrides, except the admin's, which are dropped.`
6. **CAP-10.** Filters list adds `theme`; `An opened Book's author, series, genres, tags and location are chips` → `..., genres, themes, tags and location are chips`. **CAP-11.** `genres and tags` → `system genres and themes, the user's genres, themes and tags`.
7. **CAP-16** → `**CAP-16 Genres and themes** — intent: Books carry shared system genres from Google Books categories and system themes from Finna's subject terms; users add their own genres and themes beside them (FR-17, FR-17a). success: A save matches Google's categories to the seeded genre list by English name and creates the missing ones; the mapping can be re-run over stored subjects; the Answer says which genre a save would create. Genres show in the user's language, English when there is no Finnish name. The admin edits names, adds, merges and deletes genres in Settings, touching shared rows only, and edits a shared Book's genres on Edit book; no user can override them. Finna's subject terms are stored as themes, shown as chips and filterable, never edited, and filled by a re-fetch when empty. User genres and themes work like personal tags and may not take a system name.`
8. **CAP-17.** `It fills empty shared fields, overwrites no existing value and touches no user's overrides.` → `It fills empty shared fields, themes and the cover included, overwrites no existing value (an uploaded cover counts), and touches no user's overrides.`
9. **CAP-20.** `Tags are private to the user and matched within their own tags.` → `Personal tags, user genres and user themes are one private collection in three kinds, matched within the user's own values of that kind. In Settings each kind has its own list to rename, merge and delete; a user genre or theme may not take a system name.`
10. **Non-goals.** Phase 2 line: remove `profile and collection visibility`. Phase 3 line: `cover uploads` → `non-admin cover uploads on shared Books, cover approval and alternative covers`.
11. **Assumptions and Open Questions.** Remove `FR-13's new-or-existing marker applies to authors and series only, because saves never create genres (AD-5).` `The PRD's Assumptions Index stands for the items Phase 1 touches (FR-12, FR-14, FR-28).` → `... (FR-12, FR-14 as refined on 2026-10-06, FR-28).` Open Questions → `None open. The FR-4 visibility fields are built in Phase 1 (D-1); genre seeding and mapping are decided (D-2, D-6).` Companions add `../../planning-artifacts/epics.md`.

### 4.7 Housekeeping in `epics.md` (two lines)

- Line 388: `updated for decisions D-1 to D-5 and the new slice numbers` → `updated for decisions D-1 to D-8, the smaller rulings and the new slice numbers`.
- Line 243: `Undo receipt lifetime and store size (U1)` → `Undo receipt store size (U1; the lifetime is 30 minutes)`.

## 5. Implementation handoff

**Scope: Moderate.** Every planning artifact changes and sprint planning waits on it, but no epic or story moves and no code exists. The edits are exact text, so they need no further design.

**Recipient.** The developer agent in this session, acting as doc editor, right after approval:

1. Apply 4.1 to 4.7 in that order, preserving each document's frontmatter (`updated: 2026-10-06` already holds on all of them).
2. Re-read each changed section once for internal consistency (cross-references FR-17a, AD-14, slice numbers).
3. Commit: `docs: sync planning documents to epic decisions D-1 to D-8`, including the still-uncommitted `epics.md` and this proposal.
4. Hand to `bmad-sprint-planning`.

**Success criteria.**

- Grepping the six documents finds no "Saves never create genres", "tap the current rating again", "Admin edits shared records in the back office" without the exception, or "when user uploads arrive".
- STORY-SLICING lists all 184 slice codes that `epics.md` uses, and G6 under retired.
- SPEC.md has no open question and no Phase 2 or Phase 3 non-goal that an epic builds.
- `bmad-sprint-planning`'s readiness check passes without a document conflict.

## Checklist record

| Item | Status |
|---|---|
| 1.1 Triggering story | N/A: planning-time trigger, recorded in `epics.md` |
| 1.2 Problem defined | Done |
| 1.3 Evidence | Done |
| 2.1–2.5 Epic impact | Done: none |
| 3.1 PRD | Done: edits in 4.1 |
| 3.2 Architecture | Done: edits in 4.2, 4.3 |
| 3.3 UX | Done: edits in 4.4, 4.5 |
| 3.4 Other artifacts | Done: SPEC in 4.6; `deploy/`, CI and tests have no code yet |
| 4.1 Direct adjustment | Viable, selected |
| 4.2 Rollback | Not viable: nothing built |
| 4.3 MVP review | Not needed |
| 5.1–5.5 Proposal components | Done |
| 6.4 sprint-status.yaml | N/A: not created yet |
