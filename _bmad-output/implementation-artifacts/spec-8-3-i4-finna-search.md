---
title: '8.3 [I4] Finna search'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_revision: 'a21f5b55d9a6343ceca16987bff11044afc772c3'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The shop check needs a book found by title or author when there is no readable barcode, but no source implements `search`: `Source.search?(query)` and `SearchHit` are declared in `src/lib/metadata/source.ts` and nothing satisfies them, so Story 8.5's `searchBooks` and Story 8.8's Lookup screen have nothing to call (FR-20, AD-9).

**Approach:** Give the Finna adapter a `search(query)` that asks `api.finna.fi` the same `AllFields` search with the query as `lookfor`, over a narrow field set, and turns the answer into `SearchHit`s — one per ISBN-13, because Finna returns one record per library holding and the same edition comes back many times. The existing `toResult()` parses each record, so title, authors, publisher, year, binding and cover follow exactly the rules the ISBN lookup already uses. Tests run against recorded search responses captured by `npm run fixtures`, never the network.

## Boundaries & Constraints

**Always:**
- `finna.search(query)` resolves a `SearchHit[]` and never throws or rejects: a bad answer (`status` not `OK`, `records` not an array), a network error, a timeout, a non-2xx status or a body that is not JSON each give `[]` after one logged warning. `undefined` stays `lookupByIsbn`'s failure signal alone (spine, AD-9).
- One hit per distinct ISBN-13, in Finna's own order, first occurrence wins. A record's `isbns` entries are expanded: each distinct ISBN-13 the record names gives its own hit, carrying that entry's own binding text, because `isbns` holds one entry per binding (`978-952-04-0805-3 kovakantinen`).
- `hasCover` is true when any record carrying that ISBN-13 has a cover: the duplicates are different libraries' records for one edition and only some of them hold an image, and the hit says whether a cover exists for the ISBN, which is what Story 8.5 records and the cover route serves by ISBN (AD-14).
- A record whose `isbns` yields no valid ISBN-13 is dropped, as is one without a title or without `id` (`toResult()`'s existing rule).
- Every field of a hit comes from the fields the lookup already parses: `title` is `shortTitle` then `title` (ISBD punctuation trimmed), `authors` are "Given Family" with the inverted `sortName` where Finna gives one, `publisher` the first publisher, `year` the four digits in `year`, `binding` the text after the ISBN in the matching `isbns` entry, `source` is `'finna'`.
- The search request is its own URL builder and its own narrow field list (`FINNA_SEARCH_FIELDS`): only the fields a `SearchHit` needs, `limit=20`. `FINNA_FIELDS` and `finnaUrl()` are untouched, so `tests/fixtures/REPORT.md` does not have to be regenerated (CLAUDE.md, Metadata sources).
- Search fixtures are captured by `npm run fixtures` from a committed query list and committed under `tests/fixtures/finna/search/`, one file per query (spine, Tests: no test reaches the network). The capture is skipped for a query whose fixture exists, as the ISBN capture is.
- The recorded queries include a Finnish title query, an author query, and one query Finna has no match for.
- `src/lib/metadata/sources/shared.ts` keeps one logged fetch: `getJson()` takes the log context (`{ isbn13 }` or `{ query }`) instead of an ISBN, so a search failure is logged with its query and the URL is still never logged.

**Never:**
- No `searchBooks`, no merge across sources, no rate limiting, no cover recording, no cache: Story 8.5 owns all of it and is the only caller of a source's `search()` (spine, AD-9). Nothing imports `finna.search` when this story lands.
- No Google Books `search` (Story 8.4), no change to `google.ts` beyond the `getJson` call site, and no change to `sources/index.ts`, `lookup.ts`, `merge.ts` or the `fixture` source.
- No change to `lookupByIsbn`, `finnaResults()`, `finnaMatches()`, `leanFinnaBody()`, `FINNA_FIELDS` or any field helper: the search path reuses them read-only, so a Finna lookup behaves exactly as before.
- No spine edit: `SearchHit`, `Source.search?()` and "`searchBooks` is the only caller" are already stated and unchanged; the adapter's request shape has never been spine material (CLAUDE.md names `finna.ts` as its authority).
- No filter on Finna's `formats`: the acceptance criteria name the ISBN as the only drop rule, and an ISBN-less record is already out.
- No `raw`, no `recordId`, no themes, pages, series, language or description on a hit: `SearchHit` is the narrow shape the spine defines and binding is display-only, never stored.
- No database access, no collection change, no migration, no screen, so no integration test and no Playwright walk.
- No network in any test, and no fixture written by hand.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Title query | recorded response for a Finnish title | hits in Finna's order, one per ISBN-13, each with title, authors, publisher, year and `source: 'finna'` | — |
| Same edition from many libraries | several records naming one ISBN | exactly one hit for that ISBN, the first record's fields | — |
| Record with two bindings | one record, `isbns` naming two ISBNs | two hits, each with its own ISBN and its own binding text | — |
| Binding not stated | `isbns` entry is the ISBN alone | the hit has no `binding` key | — |
| Cover on a later duplicate | first record for an ISBN has `images: []`, a later one has an image | one hit, `hasCover: true` | — |
| No cover anywhere | no record for the ISBN has an image | `hasCover: false` | — |
| Record without an ISBN | `isbns` missing, empty, or only unparseable tokens | that record contributes no hit | — |
| Record without a title or id | `shortTitle`/`title` or `id` missing | that record contributes no hit | — |
| Nothing found | recorded response with `resultCount: 0` and no `records` | `[]`, nothing logged | — |
| Status not OK | body with `status: 'ERROR'` | `[]` | one logged warning naming the status |
| Records not an array | `status: 'OK'`, `records: {}` | `[]` | one logged warning |
| Body not an object | `"nope"`, `null`, an array | `[]` | one logged warning |
| Request fails | fetch rejects, times out, 500, or a body that is not JSON | `[]` | one logged warning carrying the query, never the URL |

</intent-contract>

## Code Map

- `src/lib/metadata/sources/finna.ts` -- the adapter to extend. `:17-50` `FINNA_FIELDS` (do not touch) and `:55-64` `finnaUrl()`, the pattern for the new builder; `:71-73` `cleanIsbd`; `:78-82` `matchingIsbnEntry(record, isbn13)` -- the `isbns` entry naming an ISBN, which is also what expansion needs in reverse; `:86-92` `finnaMatches`; `:204-218` `coverUrl(record)`; `:221-224` `binding(record, isbn13)`; `:226-248` `toResult(record, isbn13, raw)` -- reuse it per record × ISBN and project; `:258-287` `finnaResults()` -- the guard order and `lookupFailed` usage to mirror; `:289-298` the `Source` object to extend with `search`.
- `src/lib/metadata/source.ts:31-33` -- `SearchHit = Pick<SourceResult, 'isbn13' | 'title' | 'authors' | 'publisher' | 'year' | 'binding' | 'source'> & { hasCover: boolean }`; `:44-65` the `Source` doc comment and `search?(query)`. Read-only: the contract already fits.
- `src/lib/metadata/sources/shared.ts:60-72` `lookupFailed()`, `:76-103` `getJson(label, url, isbn13)` -- the one logged fetch (10 s timeout, URL never logged); change its third parameter to a log-context object and log it. `:14-38` `isObject`, `list`, `strings`, `clean`, `isoLanguage`; `:40-46` `compact()`.
- `src/lib/metadata/sources/google.ts:149` -- the other `getJson` call site, updated to pass `{ isbn13 }`; nothing else in that file changes.
- `src/fields/isbn.ts` -- `toIsbn13()`, which normalises an `isbns` token (ISBN-10, hyphens, spaces).
- `scripts/capture-fixtures.ts` -- the capture script. `:40-52` `readIsbnList()`, the pattern for a committed query list; `:120-200` `capture()` -- existing fixtures are never fetched again, one request per second, failures reported and never written; `:330-400` `buildReport()` -- `## Requests` lists each request shape and the Finna field list; `:430-470` `main()` -- `.env`, the fixtures directory, the logging fetch that strips `field[]` from the printed URL.
- `tests/fixtures/isbns.txt` -- the committed ISBN list, the model for the new query list. `tests/fixtures/finna/*.json` -- the recorded lookup responses; the search fixtures land in `tests/fixtures/finna/search/`.
- `tests/fixtures/REPORT.md` -- generated; `npm run fixtures` rewrites it. It must stay truthful about what was captured.
- `tests/unit/finna.unit.spec.ts:1-66` -- the fixture-serving `fetch` stub, the `warn` spy and the `afterEach` cleanup to copy; `:330-366` the failure cases (`status is not OK`, `records is not an array`) and their one-warning assertions.
- `tests/unit/captureFixtures.unit.spec.ts:31-56` -- the list-parsing and matching tests to extend for the query list.
- `tests/unit/google.unit.spec.ts:281-282` -- the assertion that no secret reaches the log; the search path keeps that property (Finna needs no key).
- `_bmad-output/planning-artifacts/epics.md:3493-3505` -- Story 8.3's acceptance criteria, verbatim source of the rules above.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:175,178` -- the source contract and `searchBooks` as the only caller of `search()`; `:319` the Tests row (fixtures, never the network); `:403` `SearchHit`. All unchanged by this story.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/sources/shared.ts` -- `getJson(label, url, subject: Json)` logs the given context instead of an ISBN -- a search failure must be logged with its query, and there stays one fetch path for every source.
- `src/lib/metadata/sources/google.ts` -- pass `{ isbn13 }` at the one `getJson` call site -- the signature change, nothing else.
- `src/lib/metadata/sources/finna.ts` -- add `FINNA_SEARCH_FIELDS`, `finnaSearchUrl(query)`, an exported pure `finnaSearchHits(body)` and `finna.search(query)`; `finnaSearchHits` expands each record's `isbns` into one hit per distinct ISBN-13 through `toResult()`, keeps the first per ISBN, ORs `hasCover`, and returns `[]` after one logged warning for an unusable body -- one parser states every field rule (FR-20, AD-9).
- `tests/fixtures/queries.txt` -- new: the committed search queries, one per line, `#` comments and blank lines skipped -- a Finnish title, an author, and one with no match (the story's "a few title and author queries").
- `scripts/capture-fixtures.ts` -- capture each missing query to `tests/fixtures/finna/search/<slug>.json` through the same retry, gap and never-write-a-failure rules, and record the search request, its field list and the captured queries in `REPORT.md` -- fixtures are captured by the script, not by hand (CLAUDE.md, Metadata sources).
- `tests/fixtures/finna/search/*.json`, `tests/fixtures/REPORT.md` -- generated by `npm run fixtures` -- the recorded responses the tests run against.
- `tests/unit/finnaSearch.unit.spec.ts` -- new: the I/O matrix over the recorded responses and edited copies of them, with the `fetch` stub and `warn` spy of `finna.unit.spec.ts` -- the story's criteria name the hit shape, the per-ISBN rule and never throwing.
- `tests/unit/captureFixtures.unit.spec.ts` -- extend with the query list parsing, the slug, and that an existing search fixture is not fetched again -- the script gained a second input.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `8-3-i4-finna-search: done` when the story is done.

**Acceptance Criteria:**
- Given the recorded response for each query in `tests/fixtures/queries.txt`, when `finna.search(query)` runs, then it returns `SearchHit`s with `isbn13`, `title`, `authors`, `publisher`, `year`, `binding` where Finna states one, `source: 'finna'` and `hasCover`, and no other keys.
- Given a recorded response in which one edition is held by several libraries, when `search` runs, then the result holds exactly one hit for that ISBN-13 and the hits keep Finna's order.
- Given a recorded response, when `search` runs, then no hit comes from a record whose `isbns` yields no valid ISBN-13, and every ISBN-13 a kept record names has its own hit with that entry's binding.
- Given any unusable answer — `status` not `OK`, `records` not an array, a body that is not an object, a rejected fetch, a timeout, a non-2xx status, a body that is not JSON — when `search` runs, then it resolves `[]`, never throws and never returns `undefined`, and logs exactly one warning that carries the query and not the URL.
- Given `npm run fixtures` with every fixture already on disk, when it runs, then it makes no Finna search request and `REPORT.md` still names the search request, its field list and the captured queries.
- Given `npm run typecheck`, `npm run lint` and `npm run test:unit`, when they run, then all pass, and the Finna lookup tests, the Google tests and the fixture-source tests are unchanged in behaviour.
- Given the whole story, when the diff is read, then nothing imports `finna.search` yet: `searchBooks` is Story 8.5's.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why one hit per ISBN and not per record.** Finna's search returns one record per library holding: `lookfor=sapiens harari` gives 94 records, the first three being `ekk.…`, `3amk.…` and `helle.…` for the same two editions. A hit per record would fill Lookup with duplicates, and the story's criteria say "one per ISBN". The ISBN is therefore the unit of a hit, which also makes `isbns` the natural source of the hit's identity and binding.

**Reuse `toResult`, project at the end.** `toResult(record, isbn13, raw)` already states every field rule the hit needs, including the ISBD trimming of the title, the author roles and `binding(record, isbn13)`. Calling it once per record × ISBN and projecting to the seven `SearchHit` fields keeps a single parser; the narrow field set simply leaves its other fields empty.

```ts
const seen = new Map<string, SearchHit>()
for (const record of records)
  for (const isbn13 of isbnsOf(record)) {
    const result = toResult(record, isbn13, {})
    if (!result) continue
    const hit = seen.get(isbn13)
    if (hit) hit.hasCover ||= result.coverUrl !== undefined
    else seen.set(isbn13, toHit(result))
  }
```

**Why a narrow field list and `limit=20`.** `FINNA_FIELDS` exists for the lookup, where `fullRecord` and `imagesExtended` earn their place; asking for them on a search makes a 100-record answer hundreds of kilobytes. Measured against the live API with the nine fields a hit needs: `tuntematon sotilas` is 8 KB at `limit=20` (7 distinct ISBNs) against 233 KB at `limit=40`. Twenty records is a readable Lookup list after de-duplication and a committable fixture, and Story 8.5 merges several sources on top.

## Verification

**Commands:**
- `npm run fixtures` -- expected: the three search fixtures captured (or no request when they exist), `REPORT.md` rewritten, exit 0 with nothing reported as not captured.
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including `tests/unit/finnaSearch.unit.spec.ts`.

**Manual checks (if no CLI):**
- No screen changes, so no Playwright walk: nothing mounts `finna.search` in this story.
