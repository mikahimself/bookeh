# Epic 8 Context: Shop check — "do I already have this?"

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make "do I already have this?" answerable in a shop, in seconds, with the full truth. The Answer screen gains its complete form: one heading that states the first fact that applies (In library, Ordered, On wishlist, Not in library) and every remaining fact as its own line, so nothing a user holds is hidden. Lookup by title or author arrives for books with no readable barcode and for web-shop checks from the desktop, showing what the user already has before anything from outside. The epic also closes the lookup contract: a Book without an ISBN can open its own Answer, "Add by hand" catches a search that finds nothing, an end-to-end test guards the whole check, the app gets its own not-found page, and three more metadata sources join behind the existing source contract — Open Library and Hardcover as ordinary sources, Kirjasampo as the first *enrichment* source, which can add to a found book but never name one.

## Stories

- Story 8.1: Answer heading and fact lines
- Story 8.2: In library, Ordered and On wishlist Answers
- Story 8.3: Finna search
- Story 8.4: Google Books search
- Story 8.5: Search across sources
- Story 8.6: Search my copies and wishes
- Story 8.7: Look up a Book without an ISBN
- Story 8.8: Lookup by title or author
- Story 8.9: Add by hand from Lookup
- Story 8.10: End-to-end: shop check
- Story 8.11: Page not found
- Story 8.12: Open Library source
- Story 8.13: Hardcover source
- Story 8.14: Enrichment sources
- Story 8.15: Kirjasampo enrichment

## Requirements & Constraints

- **The Answer must state every fact.** Heading is the first that applies; all other facts (each copy with its location and lent marker, each ordered copy, each open wishlist entry) appear as lines. A Book held only through open wishlist entries — the user's own or made for a Person — reads as On wishlist, replacing the Not in library stopgap left by Epic 7.
- **Search covers the user's own holdings, then the external sources, and never the rest of the shared catalogue.** Own results come from the user's copies and open wishlist entries only; a two-user test must prove another user's holdings never leak.
- **Shop-check speed is a measured requirement:** on a phone over 4G, scan to Answer within 2 s for a Book the user already holds and 5 s when it comes from a source. Measure it when the Answer lands and again once the new sources are in, since a lookup waits for its slowest source; record the figures in the story notes.
- **A scan never resets silently.** Every finished lookup ends on an Answer, or back on Scan with a stated error.
- **Adding a book is still possible when nothing is found:** the typed text carries into the Not found Answer, and both Add to library and Add to wishlist can save a private Book without an ISBN.
- **New sources must not make the app depend on them.** A source whose credential is absent is simply left out, so development, CI and a fresh deploy work without it; credentials stay server-side, never logged, documented in the example env file and the deploy notes.
- **Licence and terms come before code** for any new third-party data source: confirm them in the story notes first, and stop for the owner's decision if they do not permit the use. The same applies when a new source turns out to add no fields the existing ones already have.

## Technical Decisions

- **Lookup writes nothing.** All source access goes through the metadata module; the catalogue module owns the two entry points — lookup by ISBN or Book id, and text search — and is the only caller of a source's `search()`.
- **One source contract.** A source exposes an id, a lookup-by-ISBN that returns its records best-first, `[]` for "answered, none" and `undefined` for failure, and optionally a search returning hits. Nothing throws to the caller. Adding a source is one adapter file plus one array entry, no schema change. Merging builds candidates from the first source with records and gap-fills field by field in array order, so **Finna always wins over Google Books, Open Library and Hardcover** for any field they share.
- **Enrichment sources are a new flag on that contract.** An enrichment source is asked in parallel under the same timeout and circuit breaker, but it can never be a candidate's first source: no edition field, id or title may come from it, a record from it alone is not a "found" outcome, and its failure stays out of the partial-line/unavailable machinery and never shortens a cache lifetime. Its themes union onto the others' (order preserved, case-insensitive de-dup), its description gap-fills last, and its raw response is kept under its id in the stored raw metadata. The re-fetch rule still holds: empty fields only, no backfill job.
- **Search hits are a narrow shape** — ISBN-13, title, authors, publisher, year, binding, source, plus whether a cover exists. Merge in source order, one hit per ISBN-13, drop records with no ISBN. Binding is display-only and never stored.
- **Own-library search is a shelf query**, not a catalogue scan: a text search over the viewer's visible copies plus a visible-entries fragment mirroring it, using effective (override-aware) values, one result per Book.
- **Holdings have one reader.** The Answer, Book detail, shelf rows and Lookup results all get copies, open loans and open entries from the same holdings function.
- **A Book id from a client is always gated** by the own-book check (a copy or open entry of that Book), and such a lookup never calls the sources.
- **Rate limiting is shared** across lookup, search, re-fetch, look-it-up-again, retry, a save that asks the sources, and cover previews — one per-user in-process limit, surfaced to the user as a wait message.
- **Covers are never loaded from a source by the browser.** A search records each hit's source cover URL server-side so the authenticated cover route can preview it by ISBN; the handler never takes a URL from the client. Cover downloads refuse redirects, so a source whose cover URLs redirect sets no cover URL at all and its host does not join the allowed cover hosts.
- **Fixtures, not the network.** Every source test runs against recorded fixtures, captured through the fixtures script, including at least one Finnish ISBN and one the source does not hold.
- **Spine updates ship in the same commit** as the change: the source list and array order, the `Source` and result-shape comments, the context diagram, and the Routes table row for the not-found page.

## UX & Interaction Patterns

- **Answer buttons per heading:** In library offers Open book, Add another copy and Back (Back primary); Ordered offers Back only, with a Received link on each ordered copy's line that makes that copy owned at the default location with a "Saved to {location} · Undo" toast; On wishlist offers Add to library (primary) and Back; Not in library keeps Add to wishlist and Add to library. Adding to the library from On wishlist closes the user's own open entries for that Book.
- **Lookup screen:** one field for title or author, searched on Go rather than as the user types, with the progress line while it runs. Results in two groups — "In your library" first, then "Elsewhere" — each row showing cover, title, author and binding · year · publisher so editions of one title can be told apart; placeholder where a cover cannot be served. A lent copy in the user's group shows the lent marker with the borrower. Tapping a result opens its Answer; Back returns to the results. Nothing found shows "Nothing found" and an "Add by hand" link.
- **Scan, Lookup and Answer are one full-screen task:** X leaves it entirely, Back steps back one level, and each new Answer replaces the previous history entry.
- **Not-found page** uses the frontend layout, design tokens, both themes and the terse voice: one heading and a single link back to the collection. No user data, no service call, identical signed out, both languages, and the accessibility floor (one `h1`, keyboard-reachable focus-visible link). The Payload admin keeps its own.
- Author names from a source are passed through as given; a name in the wrong order is corrected on the edit screen, never guessed at in an adapter.

## Cross-Story Dependencies

- Story 8.1's heading-and-lines function is the basis of Story 8.2's Answer and is used by Lookup result rows.
- Story 8.8's Lookup page needs both halves of search: own holdings (8.6) and across-sources (8.5), which in turn needs the Finna and Google Books search methods (8.3, 8.4). Story 8.9 hangs off 8.8's empty state, reusing the title-prefilled Not found Answer built in Epic 3.
- Story 8.2 depends on Epic 7's entry-closing behaviour and supersedes the stopgap Answer that Epic 7 left for Books held only through entries.
- Stories 8.12 and 8.13 are new sources against the existing contract; 8.14 extends that contract with the enrichment flag and must land before 8.15, which is its only consumer. Story 8.15 also re-measures the shop-check speed target that 8.2 first measured, because the slowest source sets it.
- Story 8.10's end-to-end test exercises the flows from 8.2 together with Epic 7's wishlist actions, against a fixture source and hand-entered ISBNs, with no network call outside the app.
- Epic 9 later adds tags, user genres and themes on top of the themes this epic begins filling from enrichment; the subjects an enrichment source returns are deliberately kept out of genre mapping so that work stays independent.
