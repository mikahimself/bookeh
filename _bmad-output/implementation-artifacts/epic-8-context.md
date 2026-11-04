# Epic 8 Context: Shop check — "do I already have this?"

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make a shop check answer what the user already has before showing outside results. A scan or title/author search should show owned, ordered and wished copies, allow an unknown book to be added by hand, and enrich new Books with metadata from Finna, Google Books, Open Library and Hardcover. Kirjasampo later contributes themes and descriptions without naming a Book on its own.

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
- Story 8.10: End-to-end shop check
- Story 8.11: Page not found
- Story 8.12: Open Library source
- Story 8.13: Hardcover source
- Story 8.14: Enrichment sources
- Story 8.15: Kirjasampo enrichment

## Requirements & Constraints

- The Answer chooses its heading in order: In library, Ordered, On wishlist, Not in library. It still lists every applicable copy and open wishlist entry, including location and lent state. A lookup completes on an Answer or returns to Scan with a stated error.
- Search shows the viewer's holdings before outside sources. Own-library search reads only the viewer's visible copies and open entries, never the shared catalogue or another user's holdings. Search hits distinguish editions with binding, year and publisher.
- On a phone over 4G, scan to Answer should take at most 2 seconds for a held Book and 5 seconds for a source result. Measure again after adding sources because the slowest source sets lookup latency.
- A missing source credential leaves that source out of the array and out of partial-result wording. Credentials remain on the server, out of logs and committed files. Confirm a new source's licence and terms before implementing it; if use is not permitted, or the source contributes no missing fields, stop for the owner's decision.
- Tests use recorded external responses, never live requests. Include a Finnish ISBN and a missing ISBN in each source's capture. The browser never loads a remote source cover directly.

## Technical Decisions

- Metadata lookup and search write nothing. Sources share `id`, `lookupByIsbn` and optional `search`: ISBN lookup returns records best first, `[]` for an answered miss and `undefined` for failure; neither method throws to its caller. Lookup fans out in parallel with per-source timeouts and a breaker. A failure must not become a false “not found.”
- Merge makes one candidate for each record from the first source with records and fills its empty fields from later sources in priority order. The first source's `source` and `recordId` stay attached to that candidate. The intended order is Finna, Google Books, Open Library, Hardcover; a source with no credential is absent. A Book already shared for an ISBN wins before any source query.
- Search fans out only to sources with `search`, then merges in source order to one hit per ISBN-13. It can fill a kept hit's missing cover from a later hit; failures contribute no hits. Nonblank search shares the per-user lookup limit. Cover URLs remain server-side, and an authenticated preview route serves allowed HTTPS hosts without following redirects.
- A Book without an ISBN can open its Answer by Book id only after an own-book gate; that path asks no metadata source. For a source answer with several editions, the Answer chooses a candidate by index and the save uses the server-held candidate, never client-supplied metadata.
- An enrichment source contributes themes and a missing description only. It cannot supply an edition identity, title or found outcome, and its failure cannot turn lookup unavailable. Source themes union in order with case-insensitive deduplication; re-fetch fills only empty saved fields.

## UX & Interaction Patterns

- Scan and Lookup form one full-screen task. Lookup searches on Go and groups results as “In your library” then “Elsewhere”; each row opens its Answer, and Back returns to the results. Empty results offer Add by hand with the typed title carried into the Not found Answer.
- In library offers Open book and Add another copy; Ordered offers Back and a Received action per ordered copy; On wishlist offers Add to library and Back. Not in library offers Add to library and Add to wishlist.
- An unknown frontend address uses the app's own accessible, localised not-found page with a link to the collection and no user data.

## Cross-Story Dependencies

- Story 8.8 uses own-book search (8.6) and cross-source search (8.5), which in turn uses Finna and Google search (8.3–8.4). Story 8.9 uses 8.8's empty result and the existing manual-book Answer. Story 8.7 supplies the Book-id Answer path for ISBN-free results.
- Open Library (8.12) precedes Hardcover (8.13) in source order. Enrichment contract changes (8.14) precede Kirjasampo (8.15). Story 8.15 remeasures lookup speed after the new sources are present.
