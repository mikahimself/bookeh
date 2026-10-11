---
title: 'Story 3.2: [C9] Real-book fixture capture'
type: 'chore'
created: '2026-10-11'
status: 'blocked'
baseline_revision: '7f99668701212caacb4ff80c213dbf39f9be60b7'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: [oversized]
deferred:
  - summary: >-
      CLAUDE.md's Finna line still gives `https://api.finna.fi/v1/search?lookfor=isbn:"<isbn13>"&type=AllFields` with no field list and no warning that `isbn:` matches the whole work.
    evidence: |-
      The swagger (`https://api.finna.fi/api/v1/?openapi`, server `/api/v1`) was verified in this story: the default fields omit isbns, publishers, genres and fullRecord, and `isbn:"9789520408053"` returns five records of which one carries the ISBN. `scripts/capture-fixtures.ts` FINNA_FIELDS and tests/fixtures/REPORT.md record it; the Finna adapter story (3.5) should start from those, and CLAUDE.md should point there. Deferred because the fix edits an agent-context file.
    location: >-
      CLAUDE.md (Metadata sources)
    severity: low
---

<intent-contract>

## Intent

**Problem:** The Finna and Google Books adapters (3.5–3.7), the fixture source (3.52) and the genre decision for Epic 9 (D-2) need real responses for real books from Mika's shelf. Nothing has been recorded yet, and nobody knows how much of the shelf Google's categories cover.

**Approach:** A one-off `scripts/capture-fixtures.ts` reads Mika's 30 ISBNs from `tests/fixtures/isbns.txt` and stores each live response unchanged (pretty-printed JSON) as `tests/fixtures/finna/<isbn13>.json` and `tests/fixtures/google/<isbn13>.json`. It then writes `tests/fixtures/REPORT.md` from the files on disk, including the D-2 checkpoint result.

## Boundaries & Constraints

**Always:** The Finna request follows the swagger at `https://api.finna.fi/api/v1/?openapi` (OpenAPI 3.0.3, API 11.0.3, server `/api/v1`): `GET https://api.finna.fi/api/v1/search?lookfor=isbn:"<isbn13>"&type=AllFields&limit=100` plus one `field[]` per entry of a `FINNA_FIELDS` constant listed in the script. Google: `GET https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn13>&key=<GOOGLE_BOOKS_API_KEY>`. The key is read from `.env` via `dotenv/config`; the script refuses to run without it, and it never appears in a fixture or in the report. Input ISBNs (ISBN-10/13, hyphens, spaces) are normalised to ISBN-13 with check-digit validation; an invalid line stops the run before any request is made. An empty result (`resultCount: 0`, `totalItems: 0`) is stored like any other response. A fixture that already exists is not fetched again, so a re-run only fills gaps and regenerates the report. Output goes through `process.stdout`/`process.stderr` (`no-console` is an error project-wide). No `any`.

**Never:** No test reads the network, and the script is not part of any test project or CI step. A failed request (network error, timeout, 429 or 5xx once retries run out) is never written as a fixture; it is listed as not captured. No parser or `SourceResult` mapping here: that belongs to 3.4–3.7. Nothing under `src/` changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ISBN-10 line | `951-578-275-9` | Requested and stored as `9789515782755` | No error expected |
| Bad line | `978-952-04-0805-4` (wrong check digit) | Script exits non-zero naming the line; nothing fetched | Fix the list |
| Finna returns other editions | `isbn:"9789520408053"` → 5 records, one carrying the ISBN | Whole response stored; the report counts only records whose `isbns` normalise to the ISBN as matches | No error expected |
| Google degraded | 503 `backendFailed` | Retried with backoff (4 attempts); still failing → no file, listed under not captured, exit code 1 | Re-run later fills the gap |
| Re-run with all files present | every fixture exists | No network calls; REPORT.md regenerated | No error expected |

</intent-contract>

## Code Map

- `scripts/capture-fixtures.ts` -- new. Run with `npx tsx scripts/capture-fixtures.ts` (`tsx` 4.22.4 is a devDependency; `npm run fixtures` alias). Sequential requests, `AbortSignal.timeout(20_000)`, about one request per second per source, retries on network error/429/5xx with 2, 4 and 8 s backoff. A local `toIsbn13()` (3.3 adds the canonical `normaliseIsbn` in `src/fields`; the script stays independent of `src`). Export the pure parts and the capture loop for the unit spec: `toIsbn13`, `readIsbnList(text)` (throws naming the bad line), the Finna/Google match counting the report uses, and `capture(isbns, dir, fetchFn, sleepFn)` with `fetch` and the backoff sleep injected. `main()` loads `dotenv/config` and runs only when the file is the entry point (`import.meta.url === pathToFileURL(process.argv[1]).href`), so importing it from a test has no side effects.
- `scripts/export-icons.mjs` -- the existing script pattern: header comment naming the run command.
- `tests/fixtures/isbns.txt` -- new: the 30 ISBNs exactly as Mika supplied them, one per line; `#` comments allowed.
- `tests/fixtures/finna/`, `tests/fixtures/google/` -- new: `<isbn13>.json` = `JSON.stringify(body, null, 2) + '\n'`.
- `tests/fixtures/REPORT.md` -- generated: capture date; both request URLs with the key replaced by `<key>`; the Finna field list; a per-ISBN table (as listed, ISBN-13, Finna records/matching, Finna cover, Google items/matching, Google cover, Google categories, title); totals found by Finna, by Google, by both, by neither; covers per source; Google results with `categories`; top Finna subjects (themes) and all Finna `genres` terms with counts; Google categories with counts; not-captured list; the D-2 checkpoint sentence.
- `.env.example` -- add `GOOGLE_BOOKS_API_KEY=` with a comment: keyless requests hit Google's shared daily quota (429 observed 2026-10-11).
- `package.json` -- `"fixtures": "tsx scripts/capture-fixtures.ts"`.
- `tests/unit/captureFixtures.unit.spec.ts` -- new, node env: one case per I/O matrix row. ISBN-10 → 13; a bad check digit makes `readIsbnList` throw naming the line; Finna matching on the recorded `tests/fixtures/finna/9789520408053.json` (several records, one match); `capture` with a fake fetch answering 503 four times writes no file and reports the ISBN as not captured; `capture` with every file present never calls fetch. Write into a `mkdtemp` directory under `os.tmpdir()`; sleep injected as a no-op.
- `vitest.config.mts` -- read only: test globs are `tests/unit/**/*.unit.spec.ts` and `tests/int/**/*.int.spec.ts`, so nothing under `tests/fixtures` runs.
- `eslint.config.mjs:189` -- `no-console: 'error'` applies to `scripts/`; `tsconfig.json` includes `**/*.ts`, so `npm run typecheck` checks the script.

## Tasks & Acceptance

**Execution:**
- `tests/fixtures/isbns.txt` -- write Mika's list -- the capture input.
- `scripts/capture-fixtures.ts` -- the capture and report generator -- the AC's script.
- `.env.example`, `package.json` -- the key variable and the `fixtures` alias -- discoverability.
- `tests/unit/captureFixtures.unit.spec.ts` -- the matrix rows -- the match counting decides D-2, and a failure stored as an empty result would make the adapter tests lie.
- Run `npm run fixtures`; re-run until nothing is listed as not captured, or record why something stays missing -- the recorded responses and REPORT.md.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-2-c9-real-book-fixture-capture` → `done`.

**Acceptance Criteria:**
- Given the 30 ISBNs and the key in `.env`, when `npm run fixtures` runs, then `tests/fixtures/finna/` and `tests/fixtures/google/` each hold one `<isbn13>.json` per ISBN, empty results included, and no file contains the key.
- Given the fixtures on disk, when REPORT.md is read, then it states found by Finna, by Google and by neither, covers per source, how many Google results have `categories`, sample Finna subjects and Finna genre terms, and the D-2 result: Google categories cover N of 30 books (denominator is every listed book, epics.md:214: "many Books will have no genre"). At least half means Epic 9 maps Google categories only; under half means Epic 9 also maps Finna genre terms (Story 9.11).
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit`, when they run, then they pass and no test touches the network.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 34 findings — high 5, medium 5, low 20, false 3, maybe-false 1
- findings:
  - `[high]` `[patch]` blind: story marked `done` in sprint-status while `google/` is empty and D-2 reads "Not decided" — `3-2-…` set back to `in-progress`; the run ends `blocked` on the Google outage, not `done`.
  - `[low]` `[patch]` blind: `Captured:` date moves on a run that wrote nothing — `capture()` returns files written; the previous date is kept when 0.
  - `[low]` `[reject]` blind: one capture date for both sources — git history dates each fixture; per-source dates add report machinery for a cosmetic gain.
  - `[medium]` `[patch]` blind: a spurious Google 0 after the health check passes becomes a permanent fixture — demonstrated (Google alternated 503/0 during planning); a second health check after the loop deletes this run's Google writes when it fails.
  - `[low]` `[patch]` blind: a body-read timeout is reported as "not JSON" and not retried — the catch around `response.json()` maps TimeoutError/AbortError to a retryable timeout.
  - `[low]` `[reject]` blind: 429 ignores `Retry-After` and quota exhaustion — the script refuses to run keyless, and a keyed quota 429 is not met in a 30-book run; telling quota from rate limit adds branches.
  - `[medium]` `[patch]` blind: D-2 verdict logic in `buildReport` untested — one `buildReport` case pins the threshold, matched-only categories and "Not decided".
  - `[low]` `[reject]` blind: subject tally joins hierarchy parts and keeps MARC punctuation (`Stark,`/`Stark`) — the report shows a raw sample by design; normalising subjects is 3.6's parser work.
  - `[low]` `[reject]` blind: Finna terms mixed across languages/vocabularies — the AC asks for samples; separating by `subjectsExtended.source` adds logic Story 9.11 will own.
  - `[low]` `[reject]` blind: `resultCount` above `limit=100` not flagged — the largest result count in the 30 captures is 6; a guard for an unseen case.
  - `[low]` `[patch]` blind: nothing stops Prettier rewriting fixtures and REPORT.md — `.prettierignore` with `tests/fixtures/`.
  - `[low]` `[defer]` blind: CLAUDE.md still names `/v1/search` without the field list or the work-level `isbn:` behaviour — fix edits an agent-context file.
  - `[low]` `[reject]` blind: empty `google/` not tracked by git — the script creates the directory; it fills on the next successful capture.
  - `[medium]` `[patch]` edge: Google degrades mid-run after the health check (same root as the spurious-0 row) — second health check, as above.
  - `[low]` `[patch]` edge: body-read timeout misreported (same root as above) — patched with it.
  - `[low]` `[patch]` edge: `Captured:` date changes on failed re-runs (same root as above) — patched with it.
  - `[low]` `[reject]` edge: empty `isbns.txt` yields "0 of 0 … at least half" — the list is committed with 30 lines; a guard for an input nobody produces.
  - `[low]` `[reject]` edge: duplicate ISBN (as -10 and -13) double counts — the list has no duplicates; a guard for an unseen input.
  - `[low]` `[reject]` edge: matching record beyond `limit=100` (same root as the blind `resultCount` row) — rejected with it.
  - `[maybe-false]` `[reject]` edge: symlinked repo path makes `main()` silently not run — would need a symlinked checkout to show; if true only low (the run prints nothing and writes nothing, which is noticed at once).
  - `[low]` `[patch]` edge: newline in a title breaks the report table — `cell()` collapses line breaks to a space.
  - `[low]` `[patch]` edge: test key `'k'` matches any lowercase k in a fake body — tests use `TEST_KEY`.
  - `[high]` `[patch]` edge (claim): story `done` while AC1 and AC2 are unmet (same root as the first row) — patched with it.
  - `[medium]` `[patch]` verification-gap: Google capture after a passing health check and `googleMatches` on a real match untested — one `capture` case with a matching volume asserts both files are written.
  - `[medium]` `[patch]` verification-gap: D-2 verdict untested (same root as the blind row) — patched with it.
  - `[low]` `[reject]` verification-gap: key-leak guard untested (filed defer) — Google bodies are not known to echo the key, and the Verification grep checks the actual files after each run.
  - `[high]` `[patch]` verification-gap other: `done` vs unmet ACs (same root as the first row) — patched with it.
  - `[low]` `[patch]` verification-gap other: Totals "Found by Google: 0 of 30" while nothing was captured — the line appends "(N not captured)".
  - `[low]` `[patch]` verification-gap other: `Captured:` date (same root as above) — patched with it.
  - `[high]` `[patch]` intent: Google files absent and status `done` (same root as the first row) — patched with it.
  - `[false]` `[reject]` intent: the health check replaces "store empty results" — in a run where Google finds the health ISBN every response is written whatever `totalItems` says; only runs where Google demonstrably fails withhold responses, which "a failed request is never written" already covers.
  - `[high]` `[patch]` intent: D-2 not decided (same root as the first row) — patched with it.
  - `[false]` `[reject]` intent: "runs once" vs re-runnable — the contract requires that existing fixtures are not re-fetched, so one run per gap is the specified behaviour, and a full capture is still one run.
  - `[false]` `[reject]` intent: `isbns.txt` adds a header and blank lines — the blank lines are Mika's own grouping from the paste; the parser skips the `#` header, and the ISBNs and their order are exact.

## Auto Run Result

Status: blocked
Blocking condition: Google Books `isbn:` search is down (503 `backendFailed` or spurious `totalItems: 0` all day on 2026-10-11, keyed free-text search working), so the Google fixtures and the D-2 verdict are not captured. Unblock by running `npm run fixtures` once Google answers; it fetches only the 30 missing Google responses and rewrites REPORT.md with the D-2 result. Then set `3-2-c9-real-book-fixture-capture` to `done` in sprint-status.yaml.

**Summary.** `scripts/capture-fixtures.ts` (`npm run fixtures`) reads Mika's 30 ISBNs from `tests/fixtures/isbns.txt` (ISBN-10/13 normalised with check digits, a bad line stops the run). It stores each live response pretty-printed as `tests/fixtures/<source>/<isbn13>.json` and writes `tests/fixtures/REPORT.md` from the files on disk. Finna uses the swagger-documented `https://api.finna.fi/api/v1/search` with `limit=100` and the 35 fields in `FINNA_FIELDS` (including `fullRecord` MARC XML). Requests are sequential with a 20 s timeout, and network errors, timeouts (including slow bodies), 429 and 5xx get 4 attempts. Failures are never written, existing fixtures are never fetched again, and a response containing the key is refused. Google is captured only in a run where a health-check ISBN (`9780141439518`) is found, before and after the loop; files written in a run whose closing check fails are deleted. Finna found all 30 books (5 with covers, 21 with genre terms); several queries also return other editions of the work, so a match is a record whose own `isbns` carry the ISBN.

**Files changed.**
- `scripts/capture-fixtures.ts` — new: the capture, matching and report generator.
- `tests/unit/captureFixtures.unit.spec.ts` — new: 8 cases (ISBN rows, Finna matching on a real fixture, failure writes nothing, failed health check stores no Google, Google success path, no requests when complete, D-2 verdict and "Not decided").
- `tests/fixtures/isbns.txt` — new: Mika's list.
- `tests/fixtures/finna/*.json` — new: 30 recorded Finna responses.
- `tests/fixtures/REPORT.md` — new, generated: Finna side complete, Google "not captured", D-2 "Not decided".
- `.env.example` — `GOOGLE_BOOKS_API_KEY`.
- `.prettierignore` — new: `tests/fixtures/`.
- `package.json` — `fixtures` script.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 3.2 `in-progress`.

**Review findings.** 34 rows: 21 patched in 10 entries (high 1: story status; medium 3: Google degrading mid-run, the D-2 verdict test, the Google success-path test; low 6: capture date, body-read timeout, `.prettierignore`, table line breaks, distinctive test key, "not captured" in Totals), 1 deferred (CLAUDE.md's Finna URL and field list, an agent-context file), 12 rejected: blind per-source dates, 429/Retry-After, subject joining, vocabulary split, `resultCount` over 100, untracked empty `google/` (lows whose fixes add machinery for unseen cases); edge empty list, duplicate ISBN, `limit` overflow (same reason), symlinked path (maybe-false, low if true); verification-gap key-guard test (the Verification grep checks the actual files); intent health-check vs empty results, "runs once", list formatting (false, refutations in the triage log).

**Follow-up review recommendation:** true. Patched by verdict: high 1, medium 3, low 6. The specific unverified risk: the Google capture path (`googleMatches` on a real volume, the closing health check, the D-2 sentence over real categories) has run only against fakes. The first successful `npm run fixtures` should be read before 3.7 builds on its output.

**Verification.** `npm run fixtures`: 30 Finna files, 0 Google, exit 1 with every Google ISBN listed as not captured (health check HTTP 503 after 4 attempts). A re-run makes one request and keeps the `Captured:` date. `grep -rl "$GOOGLE_BOOKS_API_KEY" tests/fixtures scripts`: no output. `npm run lint`: 0 errors (8 pre-existing warnings in migrations). `npm run typecheck`: clean. `npm run test:unit`: 22 files, 310 tests pass. Prettier clean on the changed code.

**Residual risks.** D-2 and the Google fixtures wait on Google. If Google's `isbn:` search stays broken for days, Story 3.7 (Google adapter) has no positive fixture; it may need to start from a hand-trimmed recorded volume or wait. Production lookups will need the key as well (Story 3.7 should read `GOOGLE_BOOKS_API_KEY`). Finna `isbn:` returns the whole work, so Story 3.5 must filter on `isbns`.

## Design Notes

**Finna's `isbn:` query matches the work, not just the edition.** For `9789520408053` it returns the hardcover plus the audiobook, the e-book, the Celia Daisy edition and a later pocket edition. Only one of these records carries the ISBN in `isbns` (`"978-952-04-0805-3 kovakantinen"`, binding text after a space). The adapter (3.5) must filter on `isbns`. The report counts matches the same way. ISBN-13 queries also find ISBN-10-only records (`9515781841 pehmeäkantinen`, 1994).

**Field list.** The Finna default fields leave out ISBNs, publishers, physical descriptions, genres and the MARC record. `FINNA_FIELDS` requests every field 3.5/3.6 may read: `id, recordPage, formats, title, shortTitle, subTitle, titleSection, uniformTitles, authors, primaryAuthors, nonPresenterAuthors, secondaryAuthors, corporateAuthors, isbns, cleanIsbn, languages, originalLanguages, publishers, publicationDates, placesOfPublication, year, edition, physicalDescriptions, series, subjects, subjectsExtended, genres, majorGenres, classifications, images, imagesExtended, summary, sectors, dedupIds, fullRecord`. `fullRecord` is MARC21 XML (about 3 KB) and the authority for binding (`020 $q`) and series numbers. `rawData` (Solr internals) is left out.

**Google during planning.** Keyless calls returned 429 (shared daily quota). Keyed `isbn:` calls returned mostly 503 `backendFailed` and sometimes `totalItems: 0`, even for `9780141439518` (Penguin Classics), while keyed free-text search worked. A spurious 0 cannot be told apart from a real one, so a 0 is stored. If the report shows Google missing books it plainly should know (the HarperCollins `978000744…` editions), the D-2 sentence says the Google side was captured while Google was degraded.

**Google health check (added at implementation).** The first capture stored `totalItems: 0` for all 30 books, the HarperCollins editions included, while keyed `isbn:` queries alternated between 503 and empty. Those files were deleted. Before any Google request, `capture()` now looks up `GOOGLE_HEALTH_ISBN` (`9780141439518`). If that fails or has no match, no Google response is stored that run and every missing Google fixture is listed as not captured. When any Google response is missing, the D-2 sentence reads "Not decided" instead of giving a verdict. On 2026-10-11 the check failed all day, so the Google side and D-2 wait for a re-run of `npm run fixtures`.

## Verification

**Commands:**
- `npm run fixtures` -- expected: 30 + 30 files; re-run makes no requests and rewrites the same report.
- `grep -rl "$GOOGLE_BOOKS_API_KEY" tests/fixtures` -- expected: no output.
- `npm run lint && npm run typecheck && npm run test:unit` -- expected: pass, including `captureFixtures.unit.spec.ts`.
