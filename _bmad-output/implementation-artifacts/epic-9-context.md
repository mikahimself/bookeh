# Epic 9 Context: Tag, genre and theme my books

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let users classify and find their books through private tags, genres and themes alongside shared system classification. Provide tagging on Book detail, Edit book and selections, filters, Settings management, and bilingual system genres derived from source metadata. Close the preceding epic's search and metadata verification gaps, then measure Phase 1 acceptance on the catalogued collection.

## Stories

- Story 9.17: Sequential own-search hydration
- Story 9.18: Independent search and Answer cover previews
- Story 9.19: Production Kirjasampo adapter verification
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
- Classification belongs to the Book for a user, so tagging either copy changes both. Usage counts for private labels are copy counts; system genre administration uses Book counts. Filters combine fields with AND and values within a field with OR; options come from the viewer's copies without narrowing by active filters. Theme matching is exact apart from case.
- Seed system genres with reviewed Finnish names. Map Google categories on shared-Book saves, creating unmatched English-only genres. If Google covers fewer than half the fixture books, or remains unavailable, also map stored Finna genre terms. An admin re-run fills only empty genre assignments. Lookup previews creation without writing.
- Preserve existing own-search visibility, deduplication, order and limits. Search cover previews and indexed edition Answer previews must survive collisions in either direction while retaining authentication, user isolation, expiry, bounded storage and remote-host restrictions; clients never supply remote URLs. Preview records distinguish Answer and search contexts, share storage caps, and count once per context against the lookup limit.
- Phase 1 acceptance records catalogue/location coverage, five phone location checks each under 10 seconds, existing lookup and entry speed measurements, and the restore rehearsal. Targets are at most 2 seconds for known-book lookup, 5 seconds from external sources, and under 20 seconds to save without edits. Flag manual corrections above one in ten held Books for a decision. Record results in `docs/phase-1-acceptance.md`.

## Technical Decisions

- Use one owner-scoped `tags` collection with `kind` of `tag`, `genre` or `theme`, and database uniqueness on `(owner, kind, nameKey)`. Authorize relationship targets through `ownedRelation`; `user-books` references tags and holds all private classification. Missing user state means no tags.
- `lib/tags` owns private label matching and mutations; `upsertUserBook` remains the sole writer of user Book state. `lib/catalogue` owns system genres behind `canEditShared`; its administration never reads or writes private user rows. Screens do not match names. Non-admin system administration fails with `NOT_FOUND`.
- Mutations share the request context and transaction. Selection actions authorize every copy before any write, apply to distinct Books, and commit all or none. Merge moves references and deletes the source atomically; deletion removes references first. Gateway operations sharing a context must execute sequentially, including effective-Book and holdings hydration.
- Tag Undo restores each Book's prior assignments and retains labels created inline. Edit book saves classification with the form transaction and has no Undo. Rename, merge, delete and system genre administration have no Undo.
- Cover previews default to Answer context; the search context is selected explicitly. Each context retains its own indexed covers, and recording one cannot replace the other. Authentication precedes parameter validation; unknown contexts or invalid candidate indexes fail with 404.
- Keep raw source metadata for repeatable genre mapping. Ordinary-source categories feed genres; Kirjasampo enrichment subjects do not. Kirjasampo contributes Finnish themes and a missing description, with failure returning `undefined` rather than an empty result. Adapter verification must exercise the production request path using recorded responses and no live requests.
- System genres display Finnish when available for Finnish users, otherwise English. Add interface text in both English and Finnish message catalogues. Update the architecture contract with any cover-preview identity or route change.

## UX & Interaction Patterns

- Book detail shows nonempty classification groups as Filter chips. A chip adds to existing collection filters; another value widens its field. Phone detail closes after applying it. From loans or a wishlist, navigate to the collection with that filter.
- Use a kind-aware combobox for private classification, supporting existing values and inline creation. Book detail saves immediately with a tagging toast and Undo; Edit book saves on Save. Selection tagging provides add-to-all and remove-from-all. Show validation messages beneath the field.
- Present pickers as phone bottom sheets and wide-screen dialogs; keep overlays one level deep. Do not confirm actions with Undo. Settings uses separate private-label groups with inline rename, a merge offer on name conflicts, and affected-book counts in merge/delete confirmations. The admin-only Genres group supports bilingual names and marks missing Finnish names.
- Render mock-up options and record Mika's choice in `EXPERIENCE.md` before building the tag picker or admin Genres group.

## Cross-Story Dependencies

- Run 9.17, 9.18 and 9.19 first, in order; they close Epic 8 retrospective follow-ups after verification.
- The private-label model and services underpin pickers, Settings and filters. System genre vocabulary and mapping underpin save classification and the Answer's creation markers.
- Run 9.16 before 9.11 when Google Books recovers. An outage leaves 9.16 open but must not block 9.11's Finna branch.
- Final acceptance draws on the catalogue in production, earlier lookup/entry performance evidence and the backup restore rehearsal.
