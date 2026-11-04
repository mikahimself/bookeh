---
title: '8.12 [I13] Open Library source'
type: 'feature'
created: '2026-11-03'
baseline_revision: '29a561e8f3086fa32b527acd666277d0ec3bff3f'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The story's criterion names the literal array `[finna, google,
      openLibrary]`, but membership is gated on `OPEN_LIBRARY_CONTACT`, so a
      clone or deploy without that variable runs two sources and Open Library's
      new source names, the three-way merge order and its place in the partial
      line are unreachable there.
    evidence: |-
      `src/lib/metadata/sources/index.ts` builds
      `[finna, google, ...(openLibraryContact() ? [openLibrary] : [])]`, and
      `.env.example` ships `OPEN_LIBRARY_CONTACT=` empty. The reading is
      deliberate and recorded in this spec's Boundaries and in AD-9: Open
      Library asks every client to identify itself, and the epic's standing
      rule is that a source whose credential is absent is left out rather than
      degraded. The competing reading is the criterion's literal one — the
      source is always third and the variable only supplies the header's text,
      Open Library permitting unidentified calls at 1 request per second. The
      test-parity half of the harm is fixed: `vitest.setup.ts` pins a
      test-only contact, so the int lane always runs three sources. What would
      settle the rest: the owner's call on whether an environment with no
      contact should have Open Library at all. Either way it is one line in
      `sources/index.ts` plus a documentation line.
    location: >-
      src/lib/metadata/sources/index.ts:12
    severity: medium
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

### 2026-11-04 — Review pass

- verdicts: 31 findings — high 0, medium 6, low 22, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind hunter) `npm run fixtures` hard-gated on the contact while the docs say the variable may stay empty, leaving `capture()`'s `noContact` branch unreachable — real: `main()` returned 1 before `capture()` ran. Fixed: it warns and proceeds, Open Library reported as not captured.
  - `[medium]` `[patch]` (blind hunter) The int specs' Open Library stubs are conditional on the developer's ambient `.env` — verified: `vitest.setup.ts` only imported `dotenv/config`, and CI's `check` job sets just `DATABASE_URL` and `PAYLOAD_SECRET`. Fixed: the lane pins a test-only contact, so the three-source fan-out is what runs everywhere. Grouped with the edge-case and verification-gap findings on the same cause.
  - `[low]` `[reject]` (blind hunter) `openLibraryHeaders()` fails open, returning `{}` instead of refusing — membership is decided once at module load and no caller uses `openLibrary` outside the array, so the unidentified request needs a contact present at boot and removed mid-process; the fix adds a branch for a state not shown reachable.
  - `[low]` `[patch]` (blind hunter) Search results uncapped: `limit=20` caps works, not hits — confirmed against the recorded `yuval noah harari` fixture, 40 edition ISBNs from 20 works. Fixed: hits capped at `MAX_RESULTS` and the comment corrected.
  - `[low]` `[patch]` (blind hunter) `pages` has no `pagination` fallback — confirmed: fixture `9780007466061` carries `pagination: "690p."` and no `number_of_pages`, so the gap-fill this source exists for dropped it. Fixed.
  - `[low]` `[patch]` (blind hunter) Author names pass through unnormalised against AD-9's "Given Family" rule with no recorded exception — real as a convention gap: the story's own criterion mandates the pass-through, so AD-9 now names the exception in the same commit.
  - `[medium]` `[patch]` (blind hunter) The fixture secret-leak guard covered the lookup writes only — verified: the search loop called `writeFile` with no check, and this story's secret is an email, likelier to be echoed back than a key. Fixed: one `leaks()` helper on both write paths.
  - `[low]` `[reject]` (blind hunter) The report's degraded-Google caveat (`englishMissing`) not extended to the third source — generated prose in `REPORT.md` that regenerates on every capture; no user or developer acts on it, and the fix edits report wording only.
  - `[low]` `[reject]` (blind hunter) Pairwise totals stopped at two sources (no Finna ∧ Open Library figure) — same generated-report prose; `openLibraryAdds` already carries the claim the story rests on, per-book and in the totals.
  - `[low]` `[patch]` (blind hunter) Two different `names` identifiers in `capture-fixtures.ts`, the new module-level one shadowed inside `buildReport` — real and confusing. Fixed: renamed `subjectNames()`.
  - `[low]` `[reject]` (blind hunter) The unit spec reads a Finna fixture, contradicting the spec's "tests read only `tests/fixtures/openlibrary/`" — the only fix edits this build's spec; the test itself guards the AD-9 merge order and is worth keeping.
  - `[low]` `[reject]` (blind hunter) Six identical copy-pasted stub comments across three int specs — a shared stub helper is an abstraction "for later" (CLAUDE.md); the repetition is local to test setup and costs no correctness.
  - `[low]` `[patch]` (edge-case) Hits exceed one screen when 20 works each yield several edition ISBNs — same cause as the blind hunter's cap finding; grouped and fixed there.
  - `[false]` `[reject]` (edge-case) One edition doc listing two distinct ISBN-13s makes two hits share one printing's publisher, year and binding — no edition doc in any recorded search fixture carries two distinct ISBN-13s (checked all three), and Finna's adapter deliberately does the same per binding.
  - `[false]` `[reject]` (edge-case) `publish_date` as a number drops the year — it is a string in every one of the 30 recorded responses (`'2012'`, `'May 05, 2018'`); the numeric case is not shown to exist.
  - `[low]` `[reject]` (edge-case) A first four-digit run that is not a year ('0000') stores a nonsense year — identical to Finna's `year()` rule (`/\d{4}/`) on the same kind of free text; adding a range guard to one adapter only would diverge from the codebase for a case not shown reachable.
  - `[false]` `[reject]` (edge-case) Multi-valued `edition.publish_year` shows a reprint year — no edition doc in the recorded fixtures carries more than one year.
  - `[low]` `[reject]` (edge-case) A short or common contact substring would reject every fixture as leaked — the contact is the owner's own email in his own `.env`; a length floor guards a self-inflicted, immediately visible state.
  - `[low]` `[patch]` (edge-case) `sources` is a module-level const, so a contact arriving later never adds the source — true; grouped with the comment fix below rather than made dynamic, since the environment is fixed at boot.
  - `[low]` `[patch]` (edge-case) The "read at call time" comment overstates what setting the variable does — fixed: the comment now says `sources` is built once at module load.
  - `[medium]` `[patch]` (edge-case) CI has no contact, so the new `openlibrary.org` branches are never taken and CI diverges from a local run — same cause as the blind hunter's; grouped and fixed in `vitest.setup.ts`.
  - `[low]` `[patch]` (edge-case) `main()` exits before the documented no-contact capture path, so a contributor without the variable cannot capture Finna or Google fixtures — grouped with the first finding and fixed.
  - `[medium]` `[patch]` (verification-gap) No test in the normal verification path asserts app-level lookup behaviour with Open Library in the array; the `none` → `unavailable` flip the build already hit by accident would ship green — filed pre-verified. Fixed: the lane pins the contact and `saveCopyAction.int.spec.ts` gains one case asserting `{}` leaves the outcome and 500 puts `openlibrary` in `failed`.
  - `[low]` `[patch]` (verification-gap) The "contact never written to a fixture" loop passes vacuously if no fixture is written — real; fixed directly by asserting the file count (2) before the loop.
  - `[low]` `[patch]` (verification-gap) The adapter's "read at call time" comment overstates, since the gate is evaluated at module load — grouped with the edge-case comment finding and fixed.
  - `[medium]` `[defer]` (intent alignment) The criterion names the literal array `[finna, google, openLibrary]`; the build makes membership conditional on `OPEN_LIBRARY_CONTACT`, so a clone without it runs two sources and the new source names and three-way order are unreachable — real, and a deliberate reading recorded in the spec and in AD-9. The test-parity half is fixed (the lane now pins a contact); whether a fresh environment should have Open Library at all is the owner's call, so it is deferred as a question, not a defect.
  - `[low]` `[reject]` (intent alignment) The AD-9 edit is wider than the criterion asked, adding a general credential-gated-membership rule — the criterion asked for the spine to name the source and its order; the gating rule had to be recorded somewhere, and an unwritten contract would be worse than a written one.
  - `[low]` `[reject]` (intent alignment) Behaviours the criterion calls fixture-verified are tested against hand-written bodies — a malformed body, a missing key and an HTTP 500 are states no recorded response exhibits; no test reaches the network either way, which is what the criterion protects.
  - `[medium]` `[patch]` (intent alignment) The fan-out surface is edited only to stop existing tests 404-ing, with no assertion about a third source — same cause as the verification-gap finding; grouped and fixed.
  - `[low]` `[reject]` (intent alignment) `getJson`'s signature widened for all sources with no test that the other two still send only `Accept` — the parameter defaults to `{}` and both adapters pass nothing; a test asserting an absent header restates config.
  - `[low]` `[reject]` (intent alignment) The capture-script refactor is wider than "capture the new source" — the per-source search path and the report columns are required by the criterion; the options object replaced six positionals the third source would have forced.

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

**Implemented.** Open Library is the third metadata source. `sources/openLibrary.ts` implements the existing `Source` contract: one `GET /api/books?bibkeys=ISBN:<isbn13>&jscmd=data&format=json` per lookup (`{}` or another key gives `[]`; a non-object body, an HTTP error or a network failure gives `undefined`, logged), `year` from the first four-digit run of the free-form `publish_date`, `recordId` the edition key (`/books/OL32370247M`), `pages` from `number_of_pages` or the free-text `pagination`, the source's subject names as its `subjects`, `themes` left `[]` (FR-17a), author names passed through exactly as given with no `sortName`, and no `coverUrl` on either path. `search` reads `search.json` with an explicit `fields` list and builds hits from each work's **edition** docs — never the work-level `isbn` list, which mixes every edition of the work — one per distinct ISBN-13, capped at 20. Every request carries `User-Agent: bookeh (<contact>)`; Open Library joins `sources` only when `OPEN_LIBRARY_CONTACT` is set, so nothing unidentified is ever sent and dev, CI and a fresh deploy work without it.

**Licence and terms** (openlibrary.org/developers/api and the Internet Archive's pages, checked 2026-11-03). The API is free and keyless, intended for "human-centered discovery" and not as "a data backend for third-party services"; bulk metadata is to come from the monthly dumps, not the API. Rate limits are 1 request per second unidentified and 3 identified, identification being a `User-Agent` naming the application and a contact. The Internet Archive "does not assert any new copyright or other proprietary rights over any of the material in the Open Library database", with a rights-issues caveat; the terms of service are archive.org's. A single-user self-hosted catalogue doing per-book lookups is squarely the intended use, so nothing here blocks it and no owner decision was needed.

**What Open Library adds.** It holds **7 of the 30 shelf ISBNs** (Finna 30, Google 18): the five Martin volumes, `9789511319177` and `9789523934870`. On **2** of those it fills a field neither other source gives — `subjects` for `9789511319177` and `subtitle` for `9780007448036` (`REPORT.md`, Totals). For this shelf it is a gap-filler, not a finder. Its search is the stronger half: 10 hits against Finna's 7 for `tuntematon sotilas`, 20 against 18 for `yuval noah harari`, including English editions Finna does not hold. The epic's "stop if it adds no fields the others have" condition is met, narrowly on the lookup side.

**Files changed**

- `src/lib/metadata/sources/openLibrary.ts` — the adapter (new).
- `src/lib/metadata/sources/index.ts` — `[finna, google, openLibrary]`, Open Library entered only with a contact.
- `src/lib/metadata/sources/shared.ts` — `getJson` takes optional `headers`, merged over `Accept`.
- `src/lib/metadata/source.ts`, `ARCHITECTURE-SPINE.md` — the `SourceId` comment, the context diagram, AD-9's array order, the credential-gated-membership rule and the author-name exception.
- `messages/en.json`, `messages/fi.json` — `sources.openlibrary`, `sourcesPartitive.openlibrary` (`Open Librarya`).
- `.env.example`, `deploy/README.md` — `OPEN_LIBRARY_CONTACT` documented, empty.
- `scripts/capture-fixtures.ts` — Open Library in `SOURCES`, `SEARCH_SOURCES`, per-source search-fixture paths, per-request headers, one secret-leak helper on both write paths, and its report columns, totals, subject tally and search rows.
- `tests/fixtures/openlibrary/` — 30 lookup and 3 search responses; `tests/fixtures/google/9789515782755.json` captured at last; `REPORT.md` regenerated.
- `vitest.setup.ts` — pins a test-only contact so the int lane runs the full fan-out in CI and locally alike.
- `tests/unit/openLibrary.unit.spec.ts` (new), `tests/unit/captureFixtures.unit.spec.ts`, `tests/int/pickEdition.int.spec.ts`, `tests/int/saveCopy.int.spec.ts`, `tests/int/saveCopyAction.int.spec.ts` — the adapter's behaviour, the capture script's, and the fan-out's.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — 8-12 done.

**Review findings.** Four layers ran; 31 findings. **Patched (9 entries):** the int lane depending on the developer's `.env` so CI verified a two-source app while a configured machine verified three (medium, found by three layers independently); no assertion anywhere that Open Library's answer reaches an outcome (medium); the fixture secret-leak guard covering the lookup writes only while the search loop wrote unchecked (medium); `npm run fixtures` refusing to run without a contact and so making its own documented no-contact path unreachable; uncapped search hits (40 from 20 works) and a wrong parity comment; `pages` dropping `pagination`; the AD-9 author-name exception unrecorded; a shadowed `names` identifier; and a "read at call time" comment that overstated what setting the variable does, plus a vacuous assertion in the leak-guard loop. **Deferred (1, medium):** the criterion names the literal array `[finna, google, openLibrary]` while membership is gated on the contact, so a clone without it runs two sources — the owner's call, recorded in `deferred`. **Rejected (13):** three refuted against the recorded fixtures (`publish_date` is a string in all 30; no edition doc carries two distinct ISBN-13s or two `publish_year`s), the rest on convention or on harm that could not be named — generated report prose, a shared test helper "for later", a fix that would only edit this build's spec, a year guard that would diverge from Finna's identical rule, and a test asserting an absent header.

**Follow-up review recommended: true.** Patched entries by verdict: high 0, medium 2, low 7. The named unverified risk: pinning the contact in `vitest.setup.ts` makes every int spec that reaches the sources responsible for stubbing `openlibrary.org`, and the three patched specs are the only ones doing so today — a spec added later that asks the sources without that stub will read a 404 as a source failure and flip `none` to `unavailable`, the same way this build did. Story 8.13 meets the same stubs for `hardcover.app`.

**Verification** (re-run by the parent on the patched tree)

- `npm run typecheck` — clean.
- `npm run test:unit` — 1278 passed (91 files). `npm run test:int` — 710 passed (81 files), with the pinned contact in effect, so the three-source fan-out is what ran.
- `npm run lint` — 0 errors (60 pre-existing migration warnings). `eslint` clean on every changed file.
- `npx prettier --check` — clean on every changed file. `ARCHITECTURE-SPINE.md` and `deploy/README.md` are not Prettier-clean at the baseline commit either (verified against `29a561e`), so their formatting was left alone.
- `npm run fixtures` — exit 0, no "not captured" line; byte-identical `REPORT.md` after the `pagination` fix.
- Contact leak: `git grep` finds the address only in two older specs quoting `SEED_EMAIL`; no fixture, log line or committed file of this story carries it.
- No Playwright walk: no screen was added or changed, so this project's walk rule does not apply.

**Residual risks.** The gating decision above means the production deploy and a fresh clone can run different source arrays; the int lane no longer varies, but a human reading `sources` still has to check the environment. The three int specs' `openlibrary.org` stubs are the only ones that exist, as noted under the follow-up recommendation. The hand-written diff is about 900 lines excluding fixtures, over this project's ~500-line guideline: the capture script took roughly 300 of them because a third source forced the search-fixture layout and the report to become per-source, and splitting the story after the fact would not have made either half reviewable on its own.

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

