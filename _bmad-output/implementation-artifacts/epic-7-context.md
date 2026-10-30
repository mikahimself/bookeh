# Epic 7 Context: Keep wishlists

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Mika keeps several named, private wishlists of Books he doesn't own yet, adds to them from the Answer and Book detail, marks entries as gift ideas for a Person, and closes them as bought or ordered. A save ticks off his own matching wishes, and entries count as holding a Book. Epic 8's shop check builds on this. The epic closes with twelve clean-up stories that take every open retrospective item and the deferred-items triage (`deferred-triage-2026-10-30.md`), so Epics 8 and 9 start from one version of the code and from documents they can trust.

## Stories

- Story 7.1: `wishlists` collection
- Story 7.2: `wishlist-entries` collection
- Story 7.3: Entries in holdings and Book access
- Story 7.4: People with wishlist entries can't be deleted
- Story 7.5: Wishlist service: create, rename, delete
- Story 7.6: Save to a wishlist
- Story 7.7: A save closes matching wishes
- Story 7.8: Bought and ordered
- Story 7.9: Entry recipient and removal
- Story 7.10: Wishlists section
- Story 7.11: One wishlist
- Story 7.12: Opened entry
- Story 7.13: Bought, Ordered and Remove
- Story 7.14: Add to wishlist
- Story 7.15: On wishlists in Book detail
- Story 7.16: Conventions builds read
- Story 7.17: Wishlist and loan clean-up
- Story 7.18: Foreign keys that refuse or cascade
- Story 7.19: Own email and password closed over REST
- Story 7.20: Scan and collection leftovers
- Story 7.21: Checks that guard the spine
- Story 7.22: Repo tidy
- Story 7.23: Shared service code
- Story 7.24: Shared frontend code
- Story 7.25: Shared test helpers
- Story 7.26: Spec reconciliation
- Story 7.27: Owed checks on the phone and the LXC

## Requirements & Constraints

- Wishlists are private, per user; the admin role cannot read them. Sharing lists is a later phase: don't build it or rule it out.
- An entry is a Book on one list, optionally for a Person; no recipient means it is the user's own wish.
- Adding a Book to the library closes the user's own open entries for it; entries for a Person stay open.
- Bought and Ordered close the entry. An own entry closes every own open entry for that Book, on any list, and makes one copy; an entry for a Person closes alone with no copy.
- A Person with any entry or loan, open or closed, cannot be deleted.
- Every story: English and Finnish strings in the terse voice, the accessibility floor, design tokens only.
- Folding copied code keeps behaviour unchanged.

## Technical Decisions

- **Entries:** an entry is never a copy or a copy status. Closing keeps the row and sets `closedAt`; Remove deletes it. Entries are addressed by their own id, since a Book can be on a list twice. `lib/wishlists` is the only writer of `wishlist-entries`.
- **Service imports are one-way:** `catalogue` may import `copies`, `wishlists`, `books`, `metadata`; `wishlists` and `loans` may import `copies`, `people`; `shelf` may import `books`; `people`, `books` and `metadata` import no other service, so anything `lib/books` shares must live in a module free of service imports. New edges are named in the spine's import table in the same commit. Client components import from `src/lib` only types and the listed pure modules.
- **Names:** screens never match names. Pickers send a `Ref` (`number | { create: string }`), resolved inside the action's transaction by the owning service; a row created that way survives Undo.
- **Undo:** service functions return `Undone<T>`, open no transaction and record nothing; the action wraps one call in `withUndo`. A restore skips rows that are gone. The save's restore refuses with `UNDO_FAILED` once the copy has any loan, by an explicit check, not the foreign key; Received's on an open loan only; Lend's once the loan is returned.
- **Lookup:** sources run in parallel, Finna before Google Books. Outcomes are `found`, `none`, `unavailable` (`failed` names the sources); a result merged while a source failed is cached for 5 minutes only, so the save uses the outcome the Answer showed. No source call inside a transaction.
- **Shelf refresh:** rows are never patched locally. After an action, rows reload through `/data/shelf`, then `afterAction` calls `router.refresh()` in a transition so the Filter panel's values follow; a component reporting through `afterAction` does not refresh on its own. Toast Undo reloads through `ToastProvider`'s `onUndone`.
- **Foreign keys:** owners and creators cascade, references restrict, optional links `set null`, set by `foreignKeyActions` in `afterSchemaInit`; `refuseWhileReferenced` gives the back office a readable 409. A new relationship must be listed there, or schema init fails.
- **Migrations:** schema stories commit a generated migration and merge one at a time. Production applies migrations at start and never pushes.
- **Copies and accounts:** an ordered copy has no location and is never lent. Only the admin changes a user's `email` or `password`.
- **Tests:** a test exists only when the criteria name the behaviour or it guards a spine rule; services are tested through integration tests, against `bookeh_test`; nothing reaches the network. A story that adds or changes a screen runs one uncommitted Playwright walk before done and records it in the Auto Run Result.
- **Story shape:** one conventional commit, about 500 hand-written changed lines. A story that changes a spine contract updates ARCHITECTURE-SPINE.md in the same commit.

## UX & Interaction Patterns

- Terse states: "Couldn't load. Try again." with a retry Link on a failed list; Couldn't look it up names the sources that didn't answer, with Try again.
- A row reads "Ordered" for an ordered copy; the cover tile's airmail band stays decorative.
- Overlays go one deep. Modals hold and return focus; the side panel is not modal.
- Book detail closes by history back, falling back to `/`.
- Wording and placement a story has to pick come from a rendered mock-up and are recorded in EXPERIENCE.md before the build.

## Cross-Story Dependencies

- Stories 7.1–7.19 are done. Clean-up runs in order to 7.27.
- 7.23–7.25 fold copied code so Epics 8 and 9 build on one version; 7.24 lets Epic 8 rework the Answer without pulling Book detail along, and Epic 9's `lib/tags` takes the shared resolver from 7.23.
- 7.26 reconciles the documents with the code, so it runs after the code stories, and recompiles this file.
- 7.27 is Mika's on-device session, and an unattended build stops there. It runs on production with 7.16–7.26 deployed, includes the `foreign_keys` migration on a restored production dump, and then sets epics 5, 6 and 7 to `done`.
- Epic 8 adds the On wishlist Answer, which replaces the Not in library stopgap for a Book held only through entries.
