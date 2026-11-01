---
title: '8.3 [I4] Finna search'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_revision: 'a21f5b55d9a6343ceca16987bff11044afc772c3'
review_loop_iteration: 0
followup_review_recommended: true
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

### 2026-11-01 — Review pass
- verdicts: 32 findings — high 0, medium 4, low 11, false 11, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: the reviewed patch omits the fixtures its assertions depend on — deliberate staging choice of this run, not a defect in the change: 1.3 MB of recorded API payloads were excluded so the layers reviewed hand-written code; the fixtures are committed in `dc715e0`.
  - `[medium]` `[patch]` Blind: `REPORT.md` is committed describing Google fixtures the commit does not contain — real: `git ls-tree dc715e0 tests/fixtures/google/` holds only `volumes/`. The owner chose to fold the capture into this story, so the 29 `tests/fixtures/google/*.json` are committed with the report in this story's final commit.
  - `[low]` `[patch]` Blind: the Google re-capture is undeclared scope — true, `npm run fixtures` captured what Story 3.2 could not. Carried as the owner's decision and recorded under Auto Run Result, not reverted.
  - `[low]` `[patch]` Blind: `getJson` changed every source's transport-failure log text from `lookup failed` to `request failed` — real and unannounced. Fixed: `getJson(label, action, url, subject)`; the two lookup call sites pass `'lookup'` (text identical to before) and only `search` passes `'search'`.
  - `[false]` `[reject]` Blind: `lookfor` takes the raw query with no escaping, so `:`/`+`/`AND`/`/`/`"` change or break the search — checked against the live API: `Harari: Sapiens` (94 results, correct), `C++`, `"unclosed`, `tuntematon AND sotilas` and `Muutos / metodi` all answer `status: OK` with sensible records. No bad outcome at the cited line.
  - `[medium]` `[patch]` Blind + Edge: no guard on an empty or whitespace query — verified live: `lookfor=` answers `status: OK`, `resultCount: 19802268`, so 20 arbitrary books would become hits. Fixed: `search` trims and returns `[]` with no request, and the trimmed query is what reaches the URL, the log and the parser.
  - `[low]` `[patch]` Blind + Edge + Intent: `hasCover` is per record, not per ISBN, so a record naming four bindings and holding one image marks all four — real, but the dedup is intended and the cover route serves by ISBN. Fixed as an overclaim in the comments: `finnaSearchHits` and `toHit` now state "any kept record naming that ISBN-13 reported an image", no logic added.
  - `[low]` `[patch]` Blind + Edge + Verification gap: `querySlug` collisions are not detected, so two accepted queries can share one fixture — real (`tuntematon sotilas` / `Tuntematon Sotilas!` both slug to `tuntematon-sotilas`). Fixed: `readQueryList` compares slugs and names the colliding line and the query it clashes with.
  - `[low]` `[patch]` Blind: the `isbns` token rule is duplicated in `matchingIsbnEntry` and `recordIsbns` — real duplication of the rule CLAUDE.md names. Fixed: one `entryIsbn(entry)` helper called by both; no behaviour change, the 65 Finna lookup tests still pass.
  - `[medium]` `[patch]` Blind: the test's hard-coded `SLUGS` map makes an unknown query throw inside the fetch stub, which `getJson` swallows as a network error, so a missing fixture reads as a plausible `[]` plus one warning — real developer trap. Fixed: the file name comes from the exported `querySlug`, the body is read and edited before the stub is installed, and the stub asserts the request's `lookfor`.
  - `[false]` `[reject]` Blind: `NotCaptured` grew a sentinel (`isbn13: ''`) instead of a union — the sentinel is documented and both renderers use `m.query ?? m.isbn13`; no wrong output was shown, and the proposed discriminated-union refactor is more than a direct correction for a defect nobody meets.
  - `[low]` `[reject]` Blind: the report's Hits column runs the production parser, so an unusable fixture logs a warning during `npm run fixtures` and 0 is ambiguous — true but negligible: the script is run by hand and the Not-captured list names a missing fixture. The same coupling already exists for `finnaMatches` in the ISBN rows.
  - `[medium]` `[patch]` Edge: an empty or whitespace query issues a live request — same root cause and same fix as the Blind row above.
  - `[low]` `[reject]` Edge: a record listing one edition as both ISBN-10 and ISBN-13 loses the second entry's binding text — real but a tie-break, not a wrong answer: `binding()` takes the first entry naming that ISBN-13. Carrying the entry through `recordIsbns` adds a parameter for a case no fixture shows.
  - `[low]` `[reject]` Edge: a record with an image but no title or id contributes no cover, so `hasCover` can be false although an image exists — a dropped record contributes nothing at all, which is the stated drop rule; computing covers before the drop would add a branch. Recorded instead in the corrected `hasCover` comment.
  - `[low]` `[reject]` Edge: `querySlug` collision — same finding as the Blind/Verification-gap row; patched there (this row shares that route).
  - `[low]` `[reject]` Edge: the search capture writes an HTTP 200 body with `status: 'ERROR'` as a fixture — the ISBN capture has always written any 200 body, so this is the script's existing contract, and the report's Hits column shows 0 for such a body. The fix adds a guard for a case the live API did not produce for any plain query I tried.
  - `[low]` `[reject]` Edge: `buildQueryRow`'s `JSON.parse` is unguarded, so a truncated fixture throws out of `buildReport` — the existing `readFixture` for ISBN rows parses the same way; matching it is worth more than a second error path, and a corrupt committed fixture is a loud failure, not a silent one.
  - `[low]` `[patch]` Edge: `getJson` failures now log `request failed` — same root cause and fix as the Blind row.
  - `[medium]` `[patch]` Edge: the committed report describes fixtures absent from the repo — same root cause and fix as the Blind row.
  - `[false]` `[reject]` Edge: the spec called `finnaSearchHits(body)` pure while it is `(body, query)` and logs — the second parameter is what carries the query into the log the criteria require, and the only fix would be to edit this build's spec. The signature is recorded accurately under Auto Run Result.
  - `[medium]` `[patch]` Verification gap: the `## Search queries` table, the `Finna search:` request line, the `Finna search fields:` line and `buildQueryRow` are generated but never exercised — demonstrated: both `buildReport` tests pass no queries, so deleting the field-list line keeps the suite green. Fixed: a `buildReport` case writes a search fixture into the temp dir and asserts the row with its record and hit counts, the two request lines, the not-captured query row and that the uncaptured query reaches `missing` with its `query`.
  - `[low]` `[patch]` Verification gap: `readQueryList` de-duplicates on query text while the fixture is keyed on the slug — same root cause and fix as the slug-collision row.
  - `[medium]` `[patch]` Verification gap: the committed `REPORT.md` describes Google fixtures that are not in the commit — same root cause and fix as the Blind row.
  - `[false]` `[reject]` Intent: the user-value surface (a working shop check) is untouched and no test reaches it — that is the epic's own split: the criteria name `search(query)` and fixtures, Story 8.5 adds `searchBooks` and Story 8.8 the Lookup screen. The intent excludes nothing this story skipped.
  - `[false]` `[reject]` Intent: expanding `isbns` adds rows differing only in `isbn13` and `binding`, judgeable only on the rendered list — the criteria say "one per ISBN", which makes the ISBN the unit of a hit; how the list reads is Story 8.8's. Recorded under Residual risks.
  - `[false]` `[reject]` Intent: `limit=20` applies before de-duplication, so some queries yield few hits — true and deliberate (measured: 8 KB at 20 against 233 KB at 40). Not a defect at the adapter; list length is Story 8.8's call. Recorded under Residual risks.
  - `[false]` `[reject]` Intent: `hasCover` reads `images` only, not `imagesExtended` — the narrow field set is the story's stated request shape, and `coverUrl()` has always read `images`. The claim's scope is now stated in the comment.
  - `[low]` `[patch]` Intent: the transport-failure log wording changed outside the story's intent — same root cause and fix as the Blind row.
  - `[medium]` `[patch]` Intent: the committed report is not reproducible from committed files — same root cause and fix as the Blind row.
  - `[low]` `[patch]` Intent: tests use edited copies of recordings, and one case restates configuration (the field list and `limit=20`) — the edited copies match the existing `serveFixtures(edit)` lane and are how the matrix rows are reached, so they stand; the configuration restatement was dropped and replaced by the behavioural trimming case (CLAUDE.md, Tests).
  - `[false]` `[reject]` Intent: noted in the diff's favour — never-throw is implemented and tested at the surface the intent names, and `search` returns `[]` where `lookupByIsbn` returns `undefined`. Not a defect.

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

## Auto Run Result

**Summary.** The Finna adapter can be searched by title or author: `finna.search(query)` asks `api.finna.fi` the same `AllFields` search with the query as `lookfor`, over its own narrow field set (`FINNA_SEARCH_FIELDS`, `limit=20`) so a 20-record answer stays committable, and `finnaSearchHits(body, query)` turns the answer into `SearchHit`s — one per distinct ISBN-13 in Finna's order, because Finna answers with one record per library holding. Each record's `isbns` is expanded, so a record naming four bindings gives four hits with their own binding text; `hasCover` is ORed across the records naming an ISBN. An empty query answers `[]` without a request, and every unusable answer (status not OK, `records` not an array, non-object body, rejected fetch, timeout, non-2xx, non-JSON) answers `[]` after exactly one logged warning that carries the query and never the URL. Nothing imports `finna.search`: Story 8.5's `searchBooks` is its only caller.

**Files changed.**
- `src/lib/metadata/sources/finna.ts` -- `FINNA_SEARCH_FIELDS`, `finnaSearchUrl()`, `entryIsbn()` (the one `isbns` token rule, now shared with the lookup's `matchingIsbnEntry`), `recordIsbns()`, `toHit()`, the exported pure-but-logging `finnaSearchHits(body, query)` and `finna.search`. `FINNA_FIELDS`, `finnaUrl`, `finnaResults`, `finnaMatches`, `leanFinnaBody` and every field helper untouched.
- `src/lib/metadata/sources/shared.ts` -- `sourceFailed(label, action, subject, reason, details?)` as the one warn path; `getJson(label, action, url, subject)` takes the action and the log context, so a lookup still logs `lookup failed` and a search logs `search failed`. `lookupFailed()` delegates, its log object unchanged.
- `src/lib/metadata/sources/google.ts` -- the one `getJson` call site passes `'lookup'` and `{ isbn13 }`.
- `scripts/capture-fixtures.ts` -- `readQueryList()` (slug-unique), `querySlug()`, `searchFixturePath()`; `capture()` takes the queries and writes `tests/fixtures/finna/search/<slug>.json` under the existing retry, gap and never-write-a-failure rules, skipping fixtures that exist; `buildReport()` emits the search request line, the search field list and a `## Search queries` table, and names a missing query in `## Not captured`.
- `tests/fixtures/queries.txt` -- new: a Finnish title, an author, and a query with no match.
- `tests/fixtures/finna/search/*.json` -- new, generated: the three recorded answers (12.7 KB, 13.4 KB, 41 B).
- `tests/fixtures/google/*.json` (29 files) and `tests/fixtures/REPORT.md` -- generated: the same `npm run fixtures` run captured the Google responses Story 3.2 could not, and the owner chose to fold them into this story.
- `tests/unit/finnaSearch.unit.spec.ts` -- new, 16 tests over every I/O matrix row plus the trimming rule.
- `tests/unit/captureFixtures.unit.spec.ts` -- the query list, the slug-collision message, no request when every fixture exists, a query that fails, and a `buildReport` run with queries.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 8.3 done.

**Review.** One pass, 32 findings from four layers (medium 4, low 11, false 11; no high). Patched 8 root causes, several of them raised by three layers independently: the empty-query guard (verified against the live API), the `lookup failed` log text restored for both lookup sources, the duplicated `isbns` token rule extracted, the `hasCover` overclaim corrected in the comments, the slug-collision check, the fixture-serving stub that swallowed a missing recording as a network error, the configuration-restating test replaced by a behavioural one, and the untested `## Search queries` report path. Rejected 11 false and 6 low: the `lookfor` escaping fear did not reproduce against the live API (`Harari: Sapiens`, `C++`, `"unclosed`, `tuntematon AND sotilas`, `Muutos / metodi` all answer correctly); the adapter-only scope, the `limit=20` choice and the ISBN-expansion shape are the epic's split and this story's stated decisions; the remaining lows (ISBN-10/13 binding tie-break, a dropped record's cover, an HTTP 200 error body as a fixture, unguarded `JSON.parse` in the report, the `NotCaptured` sentinel, the report's parser coupling) each match a pattern the script or adapter already had, and their fixes add guards or type refactors for cases nobody meets. Deferred 0.

**Follow-up review:** recommended. Patched entries this pass: high 0, medium 4, low 4. The named risk: nothing mounts `finna.search`, so the patched behaviours are proven only by unit tests and one live `npm run fixtures` run — in particular the empty-query guard and the slug-uniqueness rule have no caller yet, and the hit-list shape (a record's bindings as separate rows, 20 records before de-duplication) is first observable when Story 8.8 renders it. There is no screen to walk in this story; the review belongs with 8.5/8.8 when a caller exists.

**Verification.**
- Implementer, after the patches: typecheck clean, eslint and prettier clean on the six touched files, 198 tests across the six affected specs.
- Re-run here on the patched tree: `npm run typecheck` clean; `npm run lint` 0 errors (60 pre-existing warnings, all in `src/migrations/*`); `npm run test:unit` 85 files, 1160 tests passed.
- `npm run fixtures`: the three search fixtures captured; a later run reported `google 9789515782755` as not captured because Google answered 503 to the health check, so one Google response is still missing and the report's D-2 checkpoint stays "Not decided".
- Matrix audit: all 13 rows covered by tests that ran and passed, re-checked after the patches restructured the file — including "binding not stated" (`expect(hits[0]).not.toHaveProperty('binding')`) and the nine unusable-answer shapes.
- No screen change, so no Playwright walk.

**Residual risks.**
- `tests/fixtures/REPORT.md`'s D-2 checkpoint still reads "Not decided: 1 of 30 Google responses are not captured" — Google answered 503 during this story's runs. The Google columns, totals and category tally are now real; the checkpoint text resolves on the next `npm run fixtures` while Google is up, which is what Epic 9 (Story 9.11) needs.
- The hit-list shape is unproven on a surface: a record naming several bindings yields rows differing only in `binding`, which `SearchHit` marks display-only, and `limit=20` applies before de-duplication (the recorded `tuntematon sotilas` answer gives 7 hits from 20 records). Story 8.8 decides how that list reads and whether 20 is enough.
- `hasCover` is per record, not per edition: a record holding one image marks every ISBN it names as covered, and a record dropped for a missing title or id contributes no cover. Story 8.5 records the cover URLs the route serves by ISBN and will meet this.
- Shared files with the parallel 8.2 worktree: none in `src`. `_bmad-output/implementation-artifacts/sprint-status.yaml` is the one file both stories write (one line each). Story 8.4 (Google search) will touch `shared.ts` and `google.ts`, whose `getJson` signature changed here.
