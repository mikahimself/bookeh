# Epic 9 Context: Tag, genre and theme my books

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let users classify and find their books through private tags, genres and themes alongside shared system classification. Provide tagging on Book detail, Edit book and selections, filters, Settings management, and bilingual system genres derived from source metadata. Close the preceding epic's search and metadata verification gaps, expose effective descriptions on Book detail, and measure Phase 1 acceptance on the catalogued collection.

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

- Personal classifications are private for every role, including admin. System genres are shared; system genres and themes cannot be overridden. User genres and themes supplement them. The retired genre-override slice must not return.
- User genres cannot use a system genre's English or Finnish name; user themes cannot use a system theme name on a Book the user holds. A system genre introduced later leaves an existing user genre intact. Matching normalizes whitespace and case without accent folding.
- Classification belongs to the Book for a user, so tagging either copy changes both. Private-label usage counts are copy counts; system genre administration uses Book counts. Filters combine fields with AND and values within a field with OR. Options come from the viewer's copies without narrowing by active filters; theme matching is exact apart from case.
- Seed system genres with reviewed Finnish names. Derive genres on shared-Book saves from Google categories, creating unmatched English-only genres. If Google covers fewer than half the fixture books, or remains unavailable, also map stored Finna genre terms. An admin re-run fills only empty assignments. Lookup previews creation without writing.
- Preserve own-search visibility, deduplication, order and limits. Search and indexed edition Answer cover previews must survive collisions in either direction, retaining authentication, user isolation, expiry, bounded storage and host restrictions. Clients never supply remote cover URLs.
- Phase 1 acceptance records catalogue/location coverage, five phone location checks each under 10 seconds, lookup and entry speed evidence, and the restore rehearsal. Known-book lookup targets 2 seconds, external lookup 5 seconds, and saving without edits under 20 seconds. Flag manual corrections above one in ten held Books for a decision; record results in `docs/phase-1-acceptance.md`.

## Technical Decisions

- Private labels use one owner-scoped `tags` collection with `kind` of `tag`, `genre` or `theme`, and database uniqueness on `(owner, kind, nameKey)`. `ownerField()` controls immutable ownership; `nameKeyField()` normalizes matching. `user-books.tags` is a has-many `ownedRelation('tags')`, rejecting foreign targets. A missing user Book state means no tags.
- `lib/tags` owns private label matching and mutations; `upsertUserBook` remains the sole writer of user Book state. `lib/catalogue` owns system genres behind `canEditShared`; genre administration never reads or writes private rows. Screens do not match names. Non-admin system administration fails with `NOT_FOUND`.
- Mutations share the request context and transaction. Selection actions authorize every copy before any write, apply to distinct Books, and commit all or none. Merge moves references and deletes the source atomically; delete removes references first. Gateway operations sharing a context execute sequentially.
- Database constraints enforce expressible invariants from the collection's first migration. Owner foreign keys cascade on user deletion; relationship-table keys retain cascade. Schema initialization rejects unclassified or invalid foreign-key actions.
- Tag Undo restores each Book's previous assignments and retains labels created inline. Edit book saves classification with the form transaction and has no Undo. Rename, merge, delete and system genre administration have no Undo.
- Cover previews distinguish Answer and search contexts, share bounded storage caps, and count once per context against lookup limits. Authentication precedes parameter validation; invalid contexts or candidate indexes fail with 404.
- Retain raw source metadata for repeatable genre mapping. Ordinary-source categories feed genres; enrichment subjects do not. Kirjasampo contributes Finnish themes and a missing description; failure returns `undefined`. Verify adapters through their production request path using recorded responses, without live test requests.

## UX & Interaction Patterns

- Book detail shows nonempty classification groups as Filter chips. Chips add to existing collection filters; another value widens its field. Phone detail closes after applying a chip. From loans or wishlists, navigate to the collection with that filter.
- Use a kind-aware combobox with existing private labels and inline creation. Book detail saves immediately with a tagging toast and Undo; Edit book saves on Save. Selection tagging offers add-to-all and remove-from-all. Validation messages appear beneath the field.
- Pickers are phone bottom sheets and wide-screen dialogs; overlays stay one level deep. Settings separates private-label groups, supports inline rename, offers merge on conflicts, and confirms merge/delete with affected-book counts. The admin-only Genres group manages bilingual names and marks missing Finnish names.
- Render options and record Mika's choice in `EXPERIENCE.md` before building the tag picker or admin Genres group. System genres use Finnish when available for Finnish users, otherwise English. Interface strings exist in both languages.
- Book detail displays the nonblank effective description after classification and before source actions/the foot, as full plain text preserving line breaks and wrapping long words. Omit empty or cleared descriptions. Use Description/Kuvaus at both widths; Answer and wishlist entry detail remain outside this change.

## Cross-Story Dependencies

- Run retrospective follow-ups 9.17–9.19 first, in order. Story 9.20 is independent of tagging and can run next.
- The private-label model and services underpin pickers, Settings and filters. System genre vocabulary and mapping underpin saved classification and Answer creation markers.
- Run 9.16 before 9.11 when Google Books recovers. An outage leaves 9.16 open while 9.11 proceeds with Finna.
- Final acceptance draws on the production catalogue, earlier lookup/entry measurements and the backup restore rehearsal.
