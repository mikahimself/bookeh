---
title: '8.13 [I14] Hardcover source'
type: 'feature'
created: '2026-11-04'
baseline_revision: 'b0b1c88de122eaef5617b69393c3da3be1af1245'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Finna, Google Books and Open Library leave some edition metadata empty, especially covers for Finnish books. Hardcover can fill those gaps for books it holds.

**Approach:** Add a server-only Hardcover GraphQL adapter as the fourth optional metadata source. Record real responses first, then implement lookup and search against those fixtures, update the fixture report and source documentation.

## Boundaries & Constraints

**Always:**

- `HARDCOVER_API_TOKEN` gates membership in `sources` at module load. The token has only `read:catalog`; never expose, log, or commit it. A missing token leaves development, CI and a fresh deploy working without Hardcover.
- Lookup makes one POST GraphQL request selecting `editions` by exact `isbn_13`. `[]` means an answered miss; `undefined` means a failure, including GraphQL errors and 401/403. Log only the ISBN and a renewal hint on 401/403.
- The documented edition `description` field is absent from the live schema (observed 2026-11-04); use `book.description` only when present. Read no field the live response rejects. Leave absent fields out and `themes` as `[]`.
- Search returns one `SearchHit` per edition ISBN-13. Hardcover `search.results.hits[].document.isbns` is work-wide, so resolve search book IDs to their editions before making hits; never present a work ISBN with another edition's metadata. Cap to one screen of hits.
- Only use a cover URL if its HTTPS host serves the image without redirect. The observed `assets.hardcover.app` edition image answered HEAD 200 with no Location on 2026-11-04.
- Terms and field-addition checkpoint precede implementation. This is a private, authenticated, self-hosted catalogue making per-book reads. The API terms permit catalogue reads but warn that public image use needs a DMCA takedown policy; any public deployment must meet that condition. The captured `9789511319177` has a direct Hardcover cover whereas the first three adapters yield no usable cover, so the addition checkpoint passes.
- Preserve merge order: Finna, Google Books, Open Library, Hardcover. Tests use recorded fixtures only.

**Never:** No Hardcover library/account data, write scope, schema change, work-level ISBN-to-edition fabrication, token in URL, or browser-side API request. No Playwright walk because no screen changes.

## I/O & Edge-Case Matrix

| Scenario     | Input / State                                          | Expected Output / Behavior                                                                           | Error Handling                |
| ------------ | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- | ----------------------------- |
| Held English | `9780007448036`, captured response                     | Edition result with `recordId` 25383277, book description, publisher, author, pages and direct cover | None                          |
| Held Finnish | `9789511319177`, captured response                     | Edition result, author Olli Jalonen, 461 pages and direct cover; absent description stays absent     | None                          |
| Miss         | `9789517685535`, captured response                     | `[]`                                                                                                 | None                          |
| Bad response | non-object, missing `data.editions`, malformed edition | `undefined` for malformed envelope; skip individual unusable records                                 | One warning, no token         |
| Auth failure | HTTP 401 or 403                                        | `undefined`                                                                                          | Renewal hint; no token or URL |
| Search       | title or author query with recorded response           | Distinct ISBN-13 edition hits in search relevance order                                              | Failures log and return `[]`  |
| Blank search | whitespace                                             | `[]`, no request                                                                                     | None                          |

</intent-contract>

## Code Map

- `src/lib/metadata/source.ts` defines `Source`, `SourceResult` and `SearchHit`; `themes` stays `[]`, binding is display-only.
- `src/lib/metadata/sources/index.ts` builds the source array once; add Hardcover after the conditional Open Library entry.
- `src/lib/metadata/sources/google.ts` supplies field mapping and cover-first lookup sorting patterns; `openLibrary.ts` supplies failure handling and search de-dup patterns.
- `src/lib/metadata/sources/shared.ts` supplies JSON guards and logging; its `getJson` is GET-only, so the adapter needs a POST path with the same timeout and no secret-bearing errors.
- `src/lib/metadata/merge.ts` uses array order for field priority; read-only.
- `scripts/capture-fixtures.ts` owns `SOURCES`, `SEARCH_SOURCES`, request retry, secret-leak guard, per-source files and `REPORT.md`; extend it for POST lookup and two-stage search.
- `tests/fixtures/isbns.txt`, `queries.txt` supply capture inputs. Real probes on 2026-11-04: English and Finnish held, `9789517685535` absent. The current 30-book report already proves the first three sources lack a usable cover for `9789511319177`.
- `src/lib/catalogue/covers.ts` contains `COVER_HOSTS`; add `assets.hardcover.app` only for direct images. `messages/en.json`, `messages/fi.json` contain `sources` and `sourcesPartitive` names.
- `.env.example`, `deploy/README.md` describe optional server credentials; the spine's context diagram, AD-9 order and `SourceId` comment name sources.
- `tests/unit/openLibrary.unit.spec.ts`, `captureFixtures.unit.spec.ts` show adapter/capture test patterns; `vitest.setup.ts` and three int specs stub source hosts under pinned test environment.

## Tasks & Acceptance

**Execution:**

- `src/lib/metadata/sources/hardcover.ts` -- add exact-ISBN lookup, edition-backed search and safe POST handling from the observed schema.
- `src/lib/metadata/sources/index.ts`, `src/lib/metadata/source.ts` -- gate the fourth source on `HARDCOVER_API_TOKEN` and name it.
- `scripts/capture-fixtures.ts`, `tests/fixtures/hardcover/`, `tests/fixtures/REPORT.md` -- capture every shelf ISBN and search query, support GraphQL POST, update coverage and field-addition summary, guard token on every write.
- `src/lib/catalogue/covers.ts`, `messages/en.json`, `messages/fi.json`, `.env.example`, `deploy/README.md`, `ARCHITECTURE-SPINE.md` -- allow verified direct cover host, name and document the source and renewal path.
- `tests/unit/hardcover.unit.spec.ts`, `tests/unit/captureFixtures.unit.spec.ts`, `tests/int/pickEdition.int.spec.ts`, `tests/int/saveCopy.int.spec.ts`, `tests/int/saveCopyAction.int.spec.ts` -- cover the matrix, token gating, merge priority, capture and app outcome with fixture-only stubs.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark 8.13 done only after verification and review.

**Acceptance Criteria:**

- Given the token is set, when the source array loads, then its order is `[finna, google, openLibrary, hardcover]` if Open Library is configured; without the token Hardcover is absent and never named in the partial line.
- Given the captured English, Finnish and absent ISBNs, when lookup runs, then the adapter returns exactly the mapped edition records, or `[]` for the miss, without a network call from any test.
- Given a lookup where Finna also has a field, when results merge, then Finna's value and identity win; a direct Hardcover cover gap-fills a missing cover.
- Given `npm run fixtures`, when it completes, then all Hardcover ISBN and search fixtures are recorded, the token is absent from files and logs, and `REPORT.md` says which fields Hardcover adds over the three existing sources.
- Given an expired or under-scoped token, when lookup receives 401/403, then it returns `undefined` and logs a renewal hint without the credential.
- Given a direct HTTPS cover, when downloaded by the existing cover route, then the verified host is allowed without a redirect.
- Given the story lands, when the deploy guide and story notes are read, then they state the licence/terms check, `read:catalog` scope, token expiration and renewal path.

## Spec Change Log

- 2026-11-04: Implemented against recorded live edition and search responses; no scope change.

## Review Triage Log

- 2026-11-04: Reviewed token handling, exact ISBN matching, edition-backed search, cover host policy and fixture coverage. No open findings.

### 2026-11-04 — Adversarial review pass 1

|   # | Source       | Verdict | Route  | Resolution                                                                                                                                                                           |
| --: | ------------ | ------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|   1 | Blind        | medium  | patch  | Bound each of the two search requests to 1.8 seconds and abort timed-out fetches so the adapter stays inside the four-second source budget.                                          |
|   2 | Blind        | medium  | patch  | Requested `contributor_role_id`, retained author-role contributions only, and recaptured fixtures.                                                                                   |
|   3 | Blind        | medium  | patch  | Rejected Typesense hits that required dropped query tokens, eliminating the recorded nonsense-query false positive.                                                                  |
|   4 | Blind        | medium  | patch  | Raised nested edition resolution from five to twenty editions per work.                                                                                                              |
|   5 | Blind        | medium  | patch  | Round-robined editions across relevant works so one prolific work cannot consume the result screen.                                                                                  |
|   6 | Blind        | low     | patch  | Skipped and warned on an individually malformed work while preserving valid neighboring works.                                                                                       |
|   7 | Blind        | medium  | patch  | Validated lookup and both search GraphQL envelopes before fixture writes.                                                                                                            |
|   8 | Blind        | low     | patch  | Recorded a no-ID search as `{data: {books: []}}`, matching the normal empty result shape.                                                                                            |
|   9 | Blind        | low     | patch  | Counted only usable Google cover URLs in the field-addition report.                                                                                                                  |
|  10 | Blind        | low     | patch  | Exercised a recorded Hardcover image through the real `fetchCover` policy path.                                                                                                      |
|  11 | Edge         | medium  | patch  | Duplicate of #7; the capture shape guards and malformed-response regression test cover it.                                                                                           |
|  12 | Edge         | low     | patch  | Duplicate of #8; the empty books envelope is now recorded and accepted.                                                                                                              |
|  13 | Edge         | medium  | patch  | Duplicate of #4; nested edition resolution now uses a twenty-edition ceiling.                                                                                                        |
|  14 | Verification | medium  | patch  | Added an explicit assertion that the recorded search edition retains its direct cover URL.                                                                                           |
|  15 | Verification | low     | patch  | Added a synthetic report regression proving Hardcover-only additions are attributed correctly.                                                                                       |
|  16 | Intent       | false   | reject | The terse invocation resolves unambiguously through the canonical 8.13 story and the selected BMAD workflow.                                                                         |
|  17 | Intent       | false   | reject | English description mapping and Finnish cover gap-filling are both fixture-proven; the rationale did not restrict the acceptance corpus to English books.                            |
|  18 | Intent       | low     | patch  | AD-14 now names every approved metadata cover host, including `assets.hardcover.app`.                                                                                                |
|  19 | Intent       | low     | reject | Localized source labels are direct message-map data rendered by an already-tested generic partial-results component; a source-specific rendering test would duplicate that contract. |
|  20 | Intent       | false   | reject | Existing orchestration tests cover the generic cross-source search path, while adapter tests cover the new boundary; composition is deterministic.                                   |
|  21 | Intent       | low     | patch  | The recorded Hardcover cover now passes the production download validator; existing route tests cover preview delivery.                                                              |
|  22 | Intent       | false   | reject | The token is read only by the server source adapter and tests verify it appears solely in the authorization header, never in URLs, logs, or fixtures.                                |
|  23 | Intent       | false   | reject | No screen changed; fixture-backed service and integration tests are the story-prescribed end-to-end boundary, so a Playwright walk is intentionally excluded.                        |

Totals: 0 high, 9 medium, 9 low, 0 maybe-false, 5 false. All accepted findings were patched except #19, which was rejected as duplicative test coverage. No item was deferred.

## Design Notes

Hardcover's current docs say `read:catalog` covers public catalog lookups and search. Its API guide says PATs expire, 401 indicates an expired or invalid token, and 403 may mean missing scope. The guide restricts access to other users' data and calls for a DMCA takedown policy if images are publicly exposed. This app's use is authenticated per-book catalogue retrieval; no personal Hardcover data is queried. Sources: https://github.com/hardcoverapp/hardcover-docs/blob/main/capabilities.json and https://github.com/hardcoverapp/hardcover-docs/blob/main/src/content/docs/api/Getting-Started.mdx.

The live probe used `editions(where: {isbn_13: {_eq: $isbn}})` and returned 200 for three ISBNs. An attempted `editions.description` field returned a GraphQL error; `book.description` works. Hardcover search returns work-level IDs and ISBN lists, which require edition resolution for an honest ISBN-specific row.

## Verification

**Commands:**

- `npm run fixtures` -- all Hardcover fixtures present and report regenerated without token leakage.
- `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:int` -- pass.
- `npx prettier --check` on changed supported files -- pass.

**Results (2026-11-04):** Captured 30 ISBN and 3 search fixtures; 19 ISBNs matched and 9 books gained a field over the first three sources. Fixture and report scan found no token. The Finnish cover returned HEAD 200 with no redirect. Typecheck, lint (existing migration warnings only), 1,293 unit tests, and 711 integration tests passed. Prettier check passed on changed supported code, messages, deploy guide and report; the architecture spine retains its pre-existing formatting to avoid unrelated edits.

## Auto Run Result

**Status:** complete. Story 8.13 is implemented, reviewed, verified, and marked done with no deferred items.

**Follow-up review recommended:** yes. Nine medium findings were patched in this pass. A follow-up should focus on real-world two-stage Hardcover search latency within the four-second source budget and on whether the strict zero-dropped-token relevance filter omits useful partial searches beyond the three captured queries.
