# Epic 9 Context: Tag, genre and theme my books

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let users classify and find their books through private tags, genres and themes alongside shared system classification. Provide tagging on Book detail, Edit book and selections, filters and Settings management, plus bilingual system genres derived from source metadata. Close preceding search and metadata verification gaps, expose effective descriptions on Book detail, and measure Phase 1 acceptance on the catalogued collection.

## Stories

- Story 9.17: Sequential own-search hydration
- Story 9.18: Independent search and Answer cover previews
- Story 9.19: Production Kirjasampo adapter verification
- Story 9.20: Description on Book detail
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

- Personal classifications remain private for every role, including admin. Shared system genres and themes cannot be overridden; private genres and themes supplement them. Do not restore the retired genre-override slice.
- User genres cannot use a system genre's English or Finnish name; user themes cannot use a system theme name on a Book the user holds. A system genre introduced later leaves an existing user genre intact. Name matching normalizes whitespace and case without accent folding.
- Classification belongs to the Book for a user: tagging either copy changes both. Private-label usage counts are copy counts; system genre administration uses Book counts.
- Filters combine fields with AND and values within a field with OR. Theme filtering uses strings: system themes match exactly apart from case, without accent folding; user themes match through the viewer's private theme tags by name. Active themes appear in the count line. Theme suggestions cover system and private themes in use on the viewer's copies through `/data/suggest`.
- Seed system genres with reviewed Finnish names. Shared-Book saves derive genres from Google categories, creating unmatched English-only genres. If Google covers fewer than half the fixture books or remains unavailable, also map stored Finna genre terms. Admin re-runs fill empty assignments only. Lookup previews creation without writing.
- Preserve own-search visibility, deduplication, order and limits. Search and edition Answer cover previews survive collisions in either direction, retaining authentication, user isolation, expiry, bounded storage and host checks; clients never supply remote URLs.
- Cover previews distinguish Answer and search contexts, share bounded storage caps, and count once per context against lookup limits. Authentication precedes parameter validation; invalid contexts or candidate indexes fail with 404.
- Phase 1 acceptance records catalogue/location coverage, five phone location checks each under 10 seconds, lookup and entry speed evidence, and the restore rehearsal. Known-book lookup targets 2 seconds, external lookup 5 seconds, and saving without edits under 20 seconds. Flag manual corrections above one in ten held Books for a decision; record results in `docs/phase-1-acceptance.md`.

## Technical Decisions

- Private labels share one owner-scoped `tags` collection with kind `tag`, `genre` or `theme` and database uniqueness on `(owner, kind, nameKey)`. `user-books.tags` references owned labels only. Missing user Book state means no tags. `upsertUserBook` is its sole writer.
- Shelf reads use one visible-copy rule and readable Book joins; every row is one copy. All shelf matching, options and suggestions use `lib/shelf`. Option counts are distinct readable own copies, including ordered copies, independent of current filters. Private labels require viewer ownership and the correct kind, including for admins. Suggestions are bounded and blank input returns none.
- Preserve numeric system genre URLs; private genre values use `tag:<id>`, ordinary tags their numeric tag field. System and private genres OR together and remain distinct choices even with equal names. Query parsing and writing stay centralized; filters and open Book live in the URL.
- `lib/tags` owns private-label matching and mutations; `lib/catalogue` owns system genres behind `canEditShared`. Screens do not match names. Non-admin system administration fails with `NOT_FOUND`.
- Mutations share a transaction and request context; gateway operations on that context run sequentially. Selection actions authorize every copy before writes, apply to distinct Books and commit all or none. Merge moves references and deletes the source atomically; delete removes references first.
- Tag Undo restores prior Book assignments and retains inline-created labels. Edit book saves classification with its form transaction and has no Undo. Rename, merge, delete and system genre administration have no Undo.
- Retain raw source metadata for repeatable genre mapping. Ordinary-source categories feed genres; enrichment subjects do not. Kirjasampo contributes Finnish themes and a missing description; failure returns `undefined`. Verify production adapters with recorded-response fetch stubs, without live test requests.
- Database constraints enforce expressible invariants from the first migration. Owner foreign keys cascade on user deletion; relationship-table keys retain cascade.
- Schema initialization rejects unclassified or invalid foreign-key actions.

## UX & Interaction Patterns

- Book detail shows nonempty classification groups as Filter chips. Chips add to existing collection filters; another value widens its field. Phone detail closes after applying a chip. From loans or wishlists, navigate to the collection with that filter.
- Theme, author, series and publisher filters use comboboxes that add values to short lists. Listed genres show system choices in the viewer's language first, then private genres; Finnish falls back to English when no translation exists.
- Use a kind-aware combobox for private labels with inline creation. Book detail saves immediately with a tagging toast and Undo; Edit book saves on Save. Selection tagging offers add-to-all and remove-from-all. Validation messages appear beneath the field.
- Pickers use phone bottom sheets and wide-screen dialogs; overlays stay one level deep. Settings separates private-label groups, supports inline rename, offers merge on conflicts, and confirms merge/delete with affected-book counts. The admin Genres group edits bilingual names and marks missing Finnish names.
- Render options and record Mika's choice in `EXPERIENCE.md` before building the tag picker or admin Genres group.
- Book detail displays the full nonblank effective description after classification and before source actions/the foot as plain text preserving line breaks and wrapping long words. Omit empty or cleared descriptions. Use Description/Kuvaus at both widths; Answer and wishlist entry detail are outside this change.

## Cross-Story Dependencies

- Run retrospective follow-ups 9.17–9.19 first, in order; independent 9.20 can follow.
- Private-label model and services underpin pickers, Settings and filters. System genre vocabulary and mapping underpin saved classification and Answer creation markers.
- Run 9.16 before 9.11 when Google Books recovers. An outage leaves 9.16 open while 9.11 proceeds with Finna.
- Final acceptance draws on the production catalogue, earlier lookup/entry measurements and backup restore rehearsal.
