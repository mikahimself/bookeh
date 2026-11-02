# Epic 8 Context: Shop check — "do I already have this?"

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make "do I already have this?" answerable in a shop, in seconds, with the full truth. The Answer screen reaches its complete form: one heading stating the first fact that applies (In library, Ordered, On wishlist, Not in library) and every remaining fact as its own line, so nothing the user holds is hidden. Lookup by title or author arrives for books with no readable barcode and for web-shop checks, showing what the user already has before anything from outside. The epic also closes the lookup contract: a Book without an ISBN opens its own Answer, "Add by hand" catches a search that finds nothing, an end-to-end test guards the whole check, the app gets its own not-found page, and three more metadata sources join behind the existing source contract — Open Library and Hardcover as ordinary sources, Kirjasampo as the first *enrichment* source, which can add to a found book but never name one.

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

- **The Answer states every fact.** The heading is the first that applies; all other facts — each copy with its location and lent marker, each ordered copy, each open wishlist entry — appear as lines. A Book held only through open entries (the user's own or made for a Person) reads as On wishlist, replacing the stopgap Epic 7 left behind.
- **Search covers the user's own holdings first, then the outside sources, and never the rest of the shared catalogue.** Own results come only from the user's copies and open entries; a two-user test must prove another user's holdings never leak.
- **Shop-check speed is measured, not assumed:** on a phone over 4G, scan to Answer within 2 s for a Book already held and 5 s when it comes from a source. Measure when the Answer lands and again once the new sources are in, since a lookup waits for its slowest source; record figures in the story notes.
- **A scan never resets silently** — every finished lookup ends on an Answer or back on Scan with a stated error.
- **Nothing found is still a path in:** the typed text carries into the Not found Answer, and both Add to library and Add to wishlist can save a private Book without an ISBN.
- **A new source must never become a dependency.** A source whose credential is absent is left out entirely, so development, CI and a fresh deploy work without it; credentials stay server-side, are never logged, and are documented in the example env file and deploy notes.
- **Licence and terms come before code** for any new third-party data source: confirm them in the story notes first and stop for the owner's decision if they do not permit the use — likewise if a new source turns out to add no fields the existing ones already have.

## Technical Decisions

- **Lookup writes nothing.** Source access goes through the metadata module, which fans a text search out to the sources; the catalogue module owns the entry points (lookup by ISBN or Book id, and text search) and its search entry point is the only caller of that fan-out, and so the only path to a source's `search()`.
- **One source contract.** A source exposes an id, a lookup-by-ISBN returning records best-first (`[]` for "answered, none", `undefined` for failure), and optionally a search. Nothing throws to the caller. A new source is one adapter file plus one array entry, no schema change. Merging builds the candidate from the first source with records and gap-fills field by field in array order, so **Finna always wins** over Google Books, Open Library and Hardcover for any shared field.
- **Enrichment is a new flag on that contract.** An enrichment source is asked in parallel under the same timeout and breaker but can never be a candidate's first source: no edition field, id or title comes from it, a record from it alone is not a "found" outcome, and its failure stays out of the partial-line/unavailable machinery and never shortens a cache lifetime. Its themes union onto the others' (order preserved, case-insensitive de-dup), its description gap-fills last, its raw response is kept under its id, and its subjects deliberately stay out of genre mapping. The re-fetch rule holds: empty fields only, no backfill job.
- **Search hits are a narrow shape** — ISBN-13, title, authors, publisher, year, binding, source, plus the source's own cover URL, which stays server-side; what reaches the client replaces that URL with a "has a cover" flag. Sources are asked in parallel under the same per-source timeout as a lookup, but without the cache and without the circuit breaker, since `search` has no failure signal: a timeout or rejection is logged and that source simply contributes nothing. Merge in source order, one hit per ISBN-13, gap-fill a kept hit's missing cover URL from a later source's hit for the same ISBN, drop records without an ISBN. Blank text asks no source and counts nothing; otherwise a search counts one lookup against the shared rate limit. Binding is display-only, never stored.
- **Own-library search is a shelf query**, not a catalogue scan: over the viewer's visible copies plus a visible-entries fragment mirroring it, on effective (override-aware) values, one result per Book.
- **Holdings have one reader** shared by the Answer, Book detail, shelf rows and Lookup results.
- **A Book id from a client is always gated** by the own-book check, and such a lookup never calls the sources.
- **Rate limiting is shared** across lookup, search, re-fetch, retry, saves that ask the sources, and cover previews — one per-user in-process limit, surfaced as a wait message.
- **The browser never loads a cover from a source.** A search records each hit's cover URL server-side so the authenticated cover route can preview it by ISBN; the handler never takes a URL from the client. Cover downloads refuse redirects, so a source whose cover URLs redirect sets no cover URL and its host does not join the allowed hosts.
- **Fixtures, not the network.** Every source test runs against recorded fixtures captured through the fixtures script, including a Finnish ISBN and one the source does not hold.
- **Spine updates ship in the same commit:** source list and array order, the `Source` and result-shape comments, the context diagram, and the Routes row for the not-found page.

## UX & Interaction Patterns

- **Answer buttons per heading:** In library offers Open book, Add another copy and Back (Back primary); Ordered offers Back only, with a Received link on each ordered copy's line that makes that copy owned at the default location with a "Saved to {location} · Undo" toast; On wishlist offers Add to library (primary) and Back, and adding closes the user's own open entries for that Book; Not in library keeps Add to wishlist and Add to library.
- **Lookup screen:** one field for title or author, searched on Go (not as you type), with the progress line while it runs. Results in two groups — "In your library", then "Elsewhere" — each row showing cover, title, author and binding · year · publisher so editions of one title can be told apart; placeholder where a cover cannot be served. A lent copy in the own group shows the lent marker with the borrower. Tapping a result opens its Answer; Back returns to the results. Nothing found shows "Nothing found" plus "Add by hand".
- **Scan, Lookup and Answer are one full-screen task:** X leaves it entirely, Back steps back one level, each new Answer replaces the previous history entry.
- **Not-found page:** frontend layout, design tokens, both themes, terse voice — one heading and a single link back to the collection. No user data, no service call, identical signed out, both languages, accessibility floor (one `h1`, keyboard-reachable focus-visible link). The Payload admin keeps its own.
- Author names from a source pass through as given; a name in the wrong order is corrected on the edit screen, never guessed at in an adapter.

## Cross-Story Dependencies

- Story 8.1's heading-and-lines function underpins 8.2's Answer and the Lookup result rows.
- Story 8.8's Lookup page needs both halves of search — own holdings (8.6) and across-sources (8.5) — which in turn needs the Finna and Google Books search methods (8.3, 8.4). Story 8.9 hangs off 8.8's empty state, reusing the title-prefilled Not found Answer from Epic 3.
- Story 8.2 depends on Epic 7's entry-closing behaviour and supersedes Epic 7's stopgap Answer for Books held only through entries.
- Stories 8.12 and 8.13 are new sources against the existing contract; 8.14 extends that contract with the enrichment flag and must land before 8.15, its only consumer. Story 8.15 re-measures the speed target 8.2 first measured, because the slowest source sets it.
- Story 8.10's end-to-end test exercises 8.2's flows together with Epic 7's wishlist actions, against a fixture source and hand-entered ISBNs, with no network call outside the app.
- Epic 9 later builds tags, user genres and themes on top of the themes this epic begins filling.
