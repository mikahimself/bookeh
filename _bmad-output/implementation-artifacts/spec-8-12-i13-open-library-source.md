---
title: '8.12 [I13] Open Library source'
type: 'feature'
created: '2026-11-03'
baseline_revision: '29a561e8f3086fa32b527acd666277d0ec3bff3f'
status: 'in-review'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Only Finna and Google Books are asked. A book neither holds, or a field they both leave empty, cannot be filled, and Google answers for only 17 of the 30 shelf ISBNs (`tests/fixtures/REPORT.md`, Totals).

**Approach:** One more adapter file, `sources/openLibrary.ts`, third in `sources/index.ts` (`[finna, google, openLibrary]`), implementing the existing `Source` contract: `lookupByIsbn` over the Books API `jscmd=data` endpoint and `search` over `search.json`, both against recorded fixtures. No schema change, no merge change, no new behaviour for the Answer beyond one more name in the partial line.

## Boundaries & Constraints

**Always:**

- Third in source order, so Finna wins every shared field over Google Books and Open Library, and Google wins over Open Library (AD-9).
- One request per lookup: `GET https://openlibrary.org/api/books?bibkeys=ISBN:<isbn13>&jscmd=data&format=json`. `{}` (no key for the ISBN) is `[]`; a network error, timeout or non-2xx is `undefined`, logged through `shared.ts`.
- Every Open Library request carries `User-Agent: bookeh (<contact>)` with the contact read from `OPEN_LIBRARY_CONTACT` at call time — Open Library's stated requirement for identified requests. The value lives only in `.env`, documented (empty) in `.env.example`.
- `OPEN_LIBRARY_CONTACT` unset means the source is left out of `sources` entirely, so dev, CI and a fresh deploy work without it and the partial line never names it (epic: "a new source must never become a dependency"). Every request that *is* sent therefore carries the contact.
- `themes` stays `[]` (FR-17a: themes come from Finna). Open Library's subject names are the source's `subjects`, which `mapSubjectsToGenres()` does not read — it reads `rawMetadata.subjects.google` only (`src/lib/catalogue/genres.ts`).
- No `coverUrl`, in a lookup or a search: `covers.openlibrary.org` answers 302 and AD-14 downloads with `redirect: 'error'` (verified 2026-11-03: `HTTP/2 302` for `/b/id/11023404-L.jpg`). `COVER_HOSTS` and AD-14 are untouched.
- `search` returns `SearchHit`s built from each work's **edition** docs, never from the work-level `isbn` list, which mixes every edition of the work. It never throws.
- Author names pass through as Open Library gives them ("Jalonen Olli" for 9789511319177); no reordering in the adapter.
- Tests read only `tests/fixtures/openlibrary/`; no test reaches the network.
- The spine's source list, AD-9's array order and the context diagram name Open Library in the same commit.

**Never:**

- No `description`: `jscmd=data` has no description field. Do not reach for a second endpoint (`jscmd=details`, the Works API) to find one — one call per lookup.
- No change to `mergeResults`, `lookupSources`, `searchSources`, the Answer, the Lookup page, `COVER_HOSTS`, AD-14, or any collection or migration.
- No `language`: `jscmd=data` does not carry one for these records; do not guess from the ISBN prefix or the publisher.
- No retry, no caching, no rate limiting inside the adapter — `lookupSources` owns all three.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Lookup, held | `9789511319177`, fixture answers one key | one `SourceResult`: title `Taivaanpallo`, author `{ name: 'Jalonen Olli' }` (no `sortName`), publisher `Otava`, `year: 2018` from `"May 05, 2018"`, `pages: 461`, `subjects` the six subject names, `themes: []`, no `coverUrl`, no `description`, no `language`, `source: 'openlibrary'`, `recordId: '/books/OL32370247M'`, `raw: { openlibrary: <body> }` | No error expected |
| Lookup, not held | `9789510397077`, fixture is `{}` | `[]` | No error expected |
| Lookup, failure | fetch rejects, times out, or answers 500 | `undefined`, one warning logged with `{ isbn13 }` and no URL | `shared.getJson` |
| Lookup, unusable body | body is an array or a string | `undefined`, one warning `response is not an object` | `lookupFailed` |
| Lookup, wrong key | body holds only `ISBN:<other>` | `[]` — only the `ISBN:<isbn13>` key is read | No error expected |
| Lookup, year unparsable | `publish_date: "May"` or absent | `year` left out | No error expected |
| Lookup, no title or no key | entry without `title` or without `key` | `[]` (record skipped) | No error expected |
| Search, hits | `tuntematon sotilas` fixture | one hit per distinct ISBN-13 of each work's edition docs, in Open Library's order, first occurrence winning; `title`/`publisher`/`year` from the edition doc (title falling back to the work's), `authors` from the work's `author_name`, `binding` from `physical_format` when present, no `coverUrl` | No error expected |
| Search, no match | `qwzxvb kirjaton teos 12345`, `docs: []` | `[]` | No error expected |
| Search, failure or unusable body | fetch rejects, 500, or `docs` is not an array | `[]`, one warning logged with `{ query }` | `sourceFailed` |
| Search, blank query | `''` or whitespace | `[]`, no request | No error expected |
| Search, edition without ISBN | edition doc with no `isbn` | that edition contributes nothing | No error expected |

</intent-contract>

## Code Map

- `src/lib/metadata/source.ts` -- the `Source`, `SourceResult` and `SearchHit` contract the adapter implements. Read-only; `SourceId` is already `string`.
- `src/lib/metadata/sources/google.ts` -- the closest model: `volumesUrl()` reading its env at call time, `toResult`/`toHit` split, cover-first sort, `fetchBody` guarding the body shape. Follow its shape and comment density.
- `src/lib/metadata/sources/finna.ts:338-392` -- `toHit()` and `finnaSearchHits()`: the one-hit-per-ISBN map with `seen.coverUrl ??=`. Open Library has no cover URL, so the map keeps the first hit and nothing is gap-filled.
- `src/lib/metadata/sources/shared.ts` -- `clean`, `compact`, `isObject`, `list`, `strings`, `lookupFailed`, `sourceFailed`, `getJson` (10 s timeout). **`getJson` sends a fixed `Accept` header only and must gain an optional extra-headers argument** for the Open Library User-Agent; Finna and Google pass nothing and keep today's behaviour.
- `src/lib/metadata/sources/index.ts` -- the one array; becomes `[finna, google, openLibrary]` under the real-source branch, with `openLibrary` entered only when `OPEN_LIBRARY_CONTACT` is set. The `BOOKEH_SOURCES=fixture` branch is untouched.
- `src/lib/metadata/merge.ts` -- read-only evidence that order alone decides priority: `records.find(…)` over `lists` in source order. No change needed for a third source.
- `src/lib/catalogue/covers.ts:16` -- `COVER_HOSTS = ['api.finna.fi', 'books.google.com']`. Read-only: unchanged, because the adapter sets no `coverUrl`.
- `src/lib/catalogue/genres.ts` -- `mapSubjectsToGenres()` reads `rawMetadata.subjects.google` only. Read-only evidence that Open Library's subjects do not feed genre mapping.
- `messages/en.json:197-204`, `messages/fi.json:197-204` -- `sources` and `sourcesPartitive`; gain `"openlibrary"`: `Open Library` / `Open Library` and `Open Library` / `Open Librarya`.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx:20-34` -- read-only: shows why both message maps need the key (the partial line declines the source name in Finnish).
- `scripts/capture-fixtures.ts` -- `SOURCES`, `fixturePath()`, `searchFixturePath()` (hard-coded `finna/search/`), `attempt()` (fixed headers), `capture()`, `buildRow()`/`buildReport()`. Open Library joins `SOURCES`; the search-fixture path becomes per source; `attempt()` takes per-request headers; the report gains Open Library columns and totals.
- `tests/fixtures/isbns.txt`, `tests/fixtures/queries.txt` -- the capture inputs; unchanged (the 30 shelf ISBNs already include 9789511319177, which Open Library holds, and several it does not).
- `tests/fixtures/REPORT.md` -- generated by `npm run fixtures`; regenerated, never hand-edited.
- `tests/unit/captureFixtures.unit.spec.ts` -- 256 lines; its `capture` and `buildReport` cases assert the two-source behaviour and will need the third source threaded through.
- `tests/unit/google.unit.spec.ts` -- the adapter-test pattern: `vi.stubGlobal('fetch', …)`, `serve(body)`, `requested(mock)`, `logger().warn` spy. The new spec follows it, reading fixtures from disk.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:53` (diagram `EXT`), `:174` (AD-9 array order "Finna, then Google Books"), `:381` (`SourceId` comment) -- the three places that name the sources.
- `.env.example` -- the Google key block at the end is the model for the `OPEN_LIBRARY_CONTACT` block.
- `deploy/README.md` -- where deploy-time env vars are described; `OPEN_LIBRARY_CONTACT` is named there too.

## Tasks & Acceptance

**Execution:**

- `src/lib/metadata/sources/shared.ts` -- give `getJson` an optional `headers` argument merged over `Accept` -- the adapter cannot send a User-Agent otherwise, and all source fetches stay on one logged path.
- `src/lib/metadata/sources/openLibrary.ts` -- new adapter: `openLibraryUrl()`, `openLibrarySearchUrl()`, `OPEN_LIBRARY_FIELDS` (the `search.json` `fields` list), `openLibraryHeaders()`, `toResult`, `toHit`, and the exported `openLibrary: Source` -- the story.
- `src/lib/metadata/sources/index.ts` -- `[finna, google, openLibrary]`, Open Library only when `OPEN_LIBRARY_CONTACT` is set -- third place in the merge order; never a dependency.
- `messages/en.json`, `messages/fi.json` -- `sources.openlibrary` and `sourcesPartitive.openlibrary` -- the partial line reads correctly in both languages.
- `.env.example`, `deploy/README.md` -- document `OPEN_LIBRARY_CONTACT` (empty in the example), why Open Library asks for it, and that an unset value leaves the source out -- the contact is never written in the repo.
- `scripts/capture-fixtures.ts` -- add `openlibrary` to `SOURCES` with its lookup URL and its headers, make the search-fixture path per source, capture Open Library search fixtures for the same queries, and add its columns and totals to `REPORT.md` -- one command captures every source.
- `tests/fixtures/openlibrary/` -- captured by `npm run fixtures`; `tests/fixtures/REPORT.md` regenerated by the same run.
- `tests/unit/openLibrary.unit.spec.ts` -- new: the I/O matrix rows above, against the captured fixtures -- one focused test per behaviour that can break.
- `tests/unit/captureFixtures.unit.spec.ts` -- extend the existing cases for the third source and the per-source search path -- the capture script is covered today and must stay covered.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- name Open Library in the context diagram, AD-9's array order and the `SourceId` comment -- a spine contract change ships in the same commit.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `8-12-i13-open-library-source: done` at finalization.

**Acceptance Criteria:**

- Given `sources/index.ts` with `OPEN_LIBRARY_CONTACT` set, when `sources` is read, then it is `[finna, google, openLibrary]` in that order; with the variable unset, Open Library is absent and the other two are unchanged.
- Given a lookup whose Finna and Open Library fixtures both hold the ISBN, when `lookupSources` merges them, then every field both have comes from Finna and the candidate's `source` is `finna`; a field only Open Library has (for example `pages` where Finna's `physicalDescriptions` gives none) comes from Open Library.
- Given any Open Library request the adapter or the capture script makes, when the request is inspected, then it carries `User-Agent: bookeh (<contact>)` with the contact from the environment, and no fixture, log line or committed file contains that contact.
- Given `npm run fixtures`, when it runs, then `tests/fixtures/openlibrary/` holds one response per ISBN in `isbns.txt` — including 9789511319177, which Open Library holds, and ISBNs it answers `{}` for — plus one search fixture per query in `queries.txt`, and `REPORT.md` reports Open Library beside Finna and Google.
- Given the story's own notes, when the story lands, then `## Auto Run Result` records Open Library's licence and terms of use (API terms, data licence, the 1/3-per-second rate limit and the User-Agent requirement) and which fields it adds over Finna and Google Books on the shelf's ISBNs.
- Given `npm run typecheck`, `npm run lint`, `npx prettier --check` on changed files, `npm run test:unit` and `npm run test:int`, when they run, then all pass.
- Given this story changes no screen, when it lands, then no Playwright walk is run and none is added.

## Spec Change Log

## Review Triage Log

Round 1 (coordinator review), 9 findings, all patched:

- `[patch]` The int lane read the developer's `.env`, so `sources` had two entries in CI and three on a configured machine -- `vitest.setup.ts` now pins `OPEN_LIBRARY_CONTACT=int-tests@bookeh.invalid` beside the `MEDIA_DIR` and `SEED_*` handling, so the lane always exercises the three-source fan-out.
- `[patch]` Nothing asserted how Open Library's answer reaches an outcome -- one case in `saveCopyAction.int.spec.ts`, in the file's hostname-stub style, over the real `lookupSources`: `{}` keeps the outcome (`none`), a 500 makes it `unavailable` with `failed: ['openlibrary']`.
- `[patch]` The capture script's secret check guarded the per-ISBN write only -- extracted as `leaks()` and run on the search write too.
- `[patch]` `main()` refused to run without a contact, making `capture()`'s `noContact` branch unreachable and blocking Finna/Google capture -- it now warns and proceeds, Open Library reported as not captured.
- `[patch]` The new module-level `names()` was shadowed by `buildReport`'s own `const names` -- renamed `subjectNames`.
- `[patch]` `limit=20` caps works, not hits (`yuval noah harari` gives 40 edition ISBNs from 20 works) -- the hits are capped at `MAX_RESULTS` after parsing and the comment corrected.
- `[patch]` `pages` ignored `pagination`, dropping a field this source exists to gap-fill (`9780007466061` has `pagination: "690p."` and no `number_of_pages`) -- it now falls back to the first number in `pagination`.
- `[patch]` The comment on `openLibraryContact` claimed call-time reading although `sources` is built once at module load -- corrected.
- `[patch]` AD-9's "Given Family"/`sortName` rule had an unrecorded exception -- AD-9 now names it: a source that states no form and no order (Open Library) is passed through as given, with the edit screen as the correction path.

## Design Notes

**Why the contact gates the source.** Open Library asks every API client to identify itself with `User-Agent: <app> (<contact>)`; unidentified clients get 1 request per second instead of 3. The contact is an email address, so it cannot be committed. The epic's standing rule for a new source is that an absent credential leaves the source out of the array rather than degrading it, so an unset `OPEN_LIBRARY_CONTACT` does exactly that: every request that goes out is identified, and dev, CI and a fresh deploy work without the variable. Story 8.13 states the same shape for `HARDCOVER_API_TOKEN` explicitly.

**Why search reads `editions`, not `docs[].isbn`.** A `search.json` doc is a *work*, and its `isbn` array holds every edition's ISBNs — `tuntematon sotilas` returns one work carrying `9789519912066` and `9789510251874` together. Presenting either as "this one's" is exactly what the criterion forbids. The `editions` sub-document carries the editions matching the query, each with its own `key`, `title`, `isbn`, `publisher` and `publish_year`; a hit is built from an edition doc, with `author_name` taken from its work. Requested `fields`:

```
key,title,author_name,editions,editions.key,editions.title,
editions.isbn,editions.publisher,editions.publish_year,editions.physical_format
```

**Year from `publish_date`.** Free-form: `"2012"`, `"May 05, 2018"`, `"1977"`. Take the first four-digit run (`/\d{4}/`), as Finna's `year()` does; a value with no four-digit run leaves `year` out.

## Auto Run Result

Status: done

**Implemented.** Open Library is the third source. `sources/index.ts` is `[finna, google, openLibrary]` when `OPEN_LIBRARY_CONTACT` is set and `[finna, google]` when it is not, so the source is never a dependency and every request that goes out carries `User-Agent: bookeh (<contact>)`. The adapter makes one request per lookup (`api/books?jscmd=data`) and one per search (`search.json`), sets no `coverUrl`, no `description` and no `language`, keeps `themes` empty and Open Library's subject names as `subjects`. `getJson` gained an optional headers argument; Finna and Google pass nothing. No merge, Answer, collection, migration or `COVER_HOSTS` change.

**Licence and terms of use** (checked 2026-11-03, `openlibrary.org/developers/api` and `/developers/licensing`):

- **Data.** No licence is named for the API data. The licensing page states that the Internet Archive "does not assert any new copyright or other proprietary rights over any of the material in the Open Library database", with the caveat that "There may be existing rights issues on some contributions and in some jurisdictions". Terms of use are archive.org's site terms. Nothing forbids the use here: per-ISBN and per-query reads of bibliographic facts into a private catalogue, no redistribution.
- **Rate limit.** 1 request per second for non-identified requests, 3 per second for "Identified requests (with `User-Agent` and `email`)". The page asks clients to "add a HEADER that specifies a `User-Agent` string with (a) the name of your application", example `User-Agent: MyLibraryApp (contact@example.org)` — hence `bookeh (<contact>)` on every request and the contact gate. bookeh makes at most one Open Library request per lookup or search, well inside either tier; `lookupSources` still owns the retry, cache and breaker.
- **Bulk.** The page says bulk metadata should come from the monthly dumps, not the API. bookeh never bulk-reads; `npm run fixtures` captures one response per ISBN, once, about one per second.
- **Covers.** `covers.openlibrary.org` answers `HTTP/2 302` (verified for `/b/id/11023404-L.jpg`), and AD-14 downloads with `redirect: 'error'`, so no cover URL is set and the host does not join `COVER_HOSTS`.

**What it adds on the shelf** (`tests/fixtures/REPORT.md`, captured 2026-11-03): Open Library holds 7 of the 30 shelf ISBNs, against Finna's 30 and Google's 18 — the five Martin volumes, `9789511319177` (Taivaanpallo) and `9789523934870`. On two of those it fills a field neither of the other two gives: `subjects` for 9789511319177 (six English subject names) and `subtitle` for 9780007448036. Everything else it carries, Finna already has, so for this shelf it is a gap-filler, not a finder. Its search is worth more than its lookup: `tuntematon sotilas` yields 10 hits against Finna's 7 and `yuval noah harari` 20 against 18, with English editions Finna does not hold.

**Files changed**

- `src/lib/metadata/sources/openLibrary.ts` -- new adapter (urls, headers, `openLibraryResults`, `openLibrarySearchHits`, the `Source`).
- `src/lib/metadata/sources/shared.ts` -- `getJson` takes optional headers, merged over `Accept`.
- `src/lib/metadata/sources/index.ts` -- the third entry, gated on the contact.
- `src/lib/metadata/source.ts` -- `SourceId` comment names `openlibrary`.
- `messages/en.json`, `messages/fi.json` -- `sources.openlibrary`, `sourcesPartitive.openlibrary` (`Open Library` / `Open Librarya`).
- `.env.example`, `deploy/README.md` -- `OPEN_LIBRARY_CONTACT` documented, empty.
- `scripts/capture-fixtures.ts` -- Open Library in `SOURCES`, `SEARCH_SOURCES` and per-source search paths, per-request headers, an options object in place of the trailing positional arguments, and Open Library columns, totals, subjects and search rows in `REPORT.md`.
- `tests/fixtures/openlibrary/` (33 new files), `tests/fixtures/google/9789515782755.json` (captured at last, Google was degraded before), `tests/fixtures/REPORT.md`.
- `tests/unit/openLibrary.unit.spec.ts` (new), `tests/unit/captureFixtures.unit.spec.ts` (third source threaded through).
- `ARCHITECTURE-SPINE.md` -- context diagram, AD-9 array order and the credential rule, `SourceId` comment.
- `sprint-status.yaml` -- 8-12 done.

## Verification

**Commands:**

- `npm run fixtures` -- expected: Open Library fixtures and search fixtures written, `REPORT.md` regenerated, exit 0 (no "not captured" lines for Open Library).
- `npm run test:unit` -- expected: all pass, including `openLibrary.unit.spec.ts` and the extended `captureFixtures.unit.spec.ts`.
- `npm run test:int` -- expected: all pass (no app behaviour change expected).
- `npm run typecheck`, `npm run lint`, `npx prettier --check` on changed files -- expected: clean.
- `git grep -i "<the contact value>"` -- expected: no match outside `.env`.

**Results.**

- `npm run fixtures` -- exit 0, 36 requests; `tests/fixtures/openlibrary/` holds 30 lookup responses (including `9789511319177`, held, and the ISBNs it answers `{}` for) and 3 search fixtures; `REPORT.md` regenerated; no "not captured" line. The same run finally captured `tests/fixtures/google/9789515782755.json`, missing before because Google was degraded.
- `npm run test:unit` -- 1276 passed (91 files).
- `npm run test:int` -- 709 passed (81 files). Three int specs needed one line each (below).
- `npm run typecheck` -- clean. `npm run lint` -- 0 errors (60 pre-existing migration warnings). `npx prettier --check` on every changed `.ts`/`.json` -- clean. `deploy/README.md` and `ARCHITECTURE-SPINE.md` are not Prettier-clean at `HEAD` either, so they were left as written.
- `git grep -i <contact>` -- no match in this story's diff; the two pre-existing hits are older specs quoting `SEED_EMAIL`.

**Deviation from the task list.** Three int specs stub `fetch` per hostname and fell through to `404` (or, in `saveCopy`, to a JPEG) for any other host. With Open Library in the array that read as a source *failure*, turning `none` into `unavailable` and adding `openlibrary` to `failed`, so four tests failed. Each stub gained one branch: `if (url.hostname === 'openlibrary.org') return Response.json({})` — Open Library answered, does not hold the ISBN. `tests/int/pickEdition.int.spec.ts` (1), `tests/int/saveCopyAction.int.spec.ts` (4 stubs), `tests/int/saveCopy.int.spec.ts` (1). No assertion changed.

