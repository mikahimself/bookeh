# Epic 9 Context: Tag, genre and theme my books

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let Mika classify and find his books through private tags, user genres and user themes, alongside shared system genres and themes taken from source metadata. The epic delivers tagging on Book detail, Edit book and selections (with Undo), filters, and management in Settings, plus bilingual system genres created on save from Google Books categories (and Finna genre terms) and administered by the admin. It also closes Epic 8 verification follow-ups, a few small UI backlog items, and ends with Phase 1 acceptance on the real collection.

## Stories

- Story 9.17: Sequential own-search hydration
- Story 9.18: Independent search and Answer cover previews
- Story 9.19: Production Kirjasampo adapter verification
- Story 9.20: Description on Book detail
- Story 9.21: Corner crop straight edges, snap, side handles and larger handles
- Story 9.22: Suggest existing authors when adding by hand
- Story 9.23: Close X on the wishlist screen
- Story 9.1: Tags collection with kinds
- Story 9.2: Change tags
- Story 9.3: Rename, merge and delete tags
- Story 9.4: Tag and user-genre filters
- Story 9.5: Theme filter
- Story 9.6: Genres, themes and tags on Book detail
- Story 9.7: Tag picker on Book detail and Edit book
- Story 9.8: Tag a selection
- Story 9.9: Tags, my genres and my themes in Settings
- Story 9.10: Seeded system genres
- Story 9.16: Revalidate Google Books
- Story 9.11: Genres from Google Books on save
- Story 9.12: New genre on the Answer
- Story 9.13: Genre admin service
- Story 9.14: Genres in Settings, admin only
- Story 9.15: Phase 1 acceptance

## Requirements & Constraints

- Personal tags, user genres and user themes are private to their owner; the admin role cannot read them. A user's name within a kind may not equal a system genre's English or Finnish name, nor a system theme on a Book the user holds. A system genre created later with a user genre's name leaves the user genre alone.
- System genres are shared, have English and Finnish names, are shown in the user's language, and are not overridable. The list is seeded from Google Books' top-level categories and grows when a save meets a missing one (created with no Finnish name). The admin adds Finnish names, adds genres, merges and deletes duplicates; a merge or delete touches shared rows only.
- System themes are source data (ordinary sources first, then enrichment terms, deduplicated case-insensitively), not translated, not overridable, and filled by re-fetch when empty. Enrichment subjects never create genres.
- Tags apply to the Book, so every copy of a Book changes together; they work for a Book that is only on a wishlist.
- Filters: genre, theme and tag cover system and user values; values within one field widen (OR). Chips on an opened Book add that value to the active filters.
- Rename, merge and delete exist for tags of every kind; renaming onto an existing name offers a merge; delete confirms what loses its tag.
- Answer screen says when a save would create a genre ("New genre").
- Book detail shows the effective description as read-only escaped plain text, honouring an explicitly cleared override.

## Technical Decisions

- One `tags` collection with `kind: tag | genre | theme`, using `ownerField()` and `nameKeyField()`; `(owner, kind, nameKey)` is a database unique constraint. `user-books.tags` is a has-many owned relation to it. Read, update and delete are owner-only for every role, admin included; a foreign tag id must be rejected.
- Writers (AD-18): `changeTags()` in `lib/tags` is the single tag writer and accepts copy ids or a Book id; `upsertUserBook()` in `lib/books` is the only `user-books` writer. Tags are matched by `nameKey`, created, renamed, merged and deleted only by `lib/tags`.
- Import direction: `tags` may import `books` and `shelf`; `catalogue` may import `tags`.
- System genres: `mapSubjectsToGenres()` in `lib/catalogue` writes `books.genres` on a shared Book from Google categories in `rawMetadata.subjects.google` (match by English `nameKey`, create missing). Finna genre terms map match-only (English or Finnish name, never create) and are used when Google coverage is under half or unchecked. Google's ids come first, ids distinct. `remapGenres(ctx)` is admin-only, fills only Books with empty genres, and returns `NOT_FOUND` to others. Users have no write access to `genres`; all writes go through `lib/catalogue`, guarded by `canEditShared`.
- Undo (AD-20): a tag change is undoable through server-held receipts in `lib/undo` (restores each Book's previous tags). Removals, deletes, merges, `editBook`, and genre administration are not undoable.
- Genre URL filter values: system genres `genre=42`, private genres `genre=tag:42`, tags `tag=42`; malformed ids ignored, repeats deduplicated.
- Shared-context contract (AD-16): gateway reads sharing one context run sequentially, not concurrently (story 9.17); cover preview state must distinguish search and Answer contexts (9.18).
- Slice G6 (genre override on Edit book) is retired; genres and themes are never overridable.
- Tests only where acceptance criteria or a spine rule name the behaviour (access, Undo, source order); integration tests use stored fixture raw data.
- Spine changes ship with the story that changes a contract.
- Stories that change UI docs (9.21, 9.23) update DESIGN.md / EXPERIENCE.md in the same commit.

## UX & Interaction Patterns

- Tag picker: Tag / Genre / Theme tabs above a kind-aware find-or-create combobox, then the selected values with × removal; each add or remove saves immediately. Book detail opens it via "Add tag"; Edit book hosts the same picker.
- Book detail Classification group shows system genres (user's language), user genres, system themes, user themes and tags as Filter chips; empty kinds are absent.
- Select mode: the Tag action offers add-to-all and remove-from-all; toast "Tagged {n}" with Undo. Pickers are bottom sheets on phone, dialogs on wide screens.
- Settings lists Tags, My genres, My themes as rows with usage counts and Rename / Merge / Delete; admin-only Genres list shows Book counts, a "No Finnish name" mark, in-place English/Finnish editing and Add genre.
- Description section sits after classification and before source actions, headed "Description" / "Kuvaus", omitted when blank, no truncation.
- Corner crop (9.21): a side within 1 degree of an axis (measured on the photo) is drawn heavier (weight change, not colour alone; accent dark value in both themes, tokens only). While a corner is dragged by pointer, touching sides are pulled toward straight between 1 and 3 degrees; arrow keys never snap and Alt skips it on desktop. Each side gets a diamond midpoint handle (44px tap area, keyboard-movable, Tab after corners) that moves the whole side keeping angle and staying on the photo. Corner handles grow 20px to 24px, 44px tap area unchanged. Straightness and snap are pure functions beside `checkCorners()` in `lib/catalogue/corners.ts` and do not change what it accepts. Indication, snap and side handles were chosen from rendered mock-ups.
- Wishlist close X (9.23): phone only (absent from 900px), 44px target, goes to `/wishlists`, Back link stays.
- Author field on the Not found Answer (9.22) reuses Edit book's `/data/suggest` name Combobox; free text still accepted.

## Cross-Story Dependencies

- Run order: 9.17 to 9.19 first, then 9.20 (independent of tagging); 9.1 underpins 9.2 to 9.9 (collection, then writer, then filters, detail, pickers, selection, Settings).
- 9.10 seeds genres before 9.11 maps them; 9.16 runs before 9.11 when Google answers, but 9.11 never waits for it and falls back to Finna mapping.
- 9.12 (Answer "New genre") and 9.13 to 9.14 (admin service, then Settings UI) build on 9.11.
- 9.15 (Phase 1 acceptance) closes the epic and depends on the rest.
- Depends on earlier epics: Book/user-books model, selection mode, Settings, filters, Undo receipts, Answer screen, and metadata sources (Finna, Google, Kirjasampo).
