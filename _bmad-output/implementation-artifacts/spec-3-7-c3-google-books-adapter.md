---
title: 'Story 3.7: [C3] Google Books adapter'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: 'c1a40ad390f36a8b1592b1777fc0030842283832'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Google's spurious 200 with totalItems 0 during an outage is taken as "none", so a lookup can say "no such book" while Google is degraded.
    evidence: |-
      On 2026-10-11 Google's isbn: search alternated 503 backendFailed and 200 totalItems 0 all day, while other queries worked. Nothing in a single response tells the spurious zero from a real one. Story 3.9 decides the outcome (none vs unavailable) and the cache rules, and is where any mitigation belongs, for example not caching none when only Google answered empty.
    location: >-
      src/lib/metadata/sources/google.ts (fetchBody, lookupByIsbn)
    severity: medium
  - summary: >-
      The Google adapter is tested on by-id volumes wrapped in a search body, not on recorded isbn: search answers.
    evidence: |-
      Google's isbn: search was down on 2026-10-11, so 3.2 captured no Google responses. A search item can differ from a by-id volume: shorter categories, plain descriptions, possibly several volumes per ISBN. When npm run fixtures succeeds, the fixture-wide test in tests/unit/google.unit.spec.ts runs over the new tests/fixtures/google/<isbn13>.json files. Its results, and the ranking with several matching volumes, should be read against this adapter then.
    location: >-
      tests/unit/google.unit.spec.ts, tests/fixtures/google/volumes/README.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** Finna is the only source, so books Finna does not know cannot be looked up (FR-11). The second source in the spine's order, Google Books, has no adapter, and there is no `sources/index.ts` listing the sources in order.

**Approach:** Add `src/lib/metadata/sources/google.ts`, a `Source` with id `google`, which queries `volumes?q=isbn:<isbn13>` and maps each volume that carries the ISBN asked for to a `SourceResult`. Move the JSON guards, text cleaning, language conversion and the logged fetch that Finna and Google share into one module. Add `sources/index.ts`: `[finna, google]`.

## Boundaries & Constraints

**Always:**
- The `Source` contract (`src/lib/metadata/source.ts`): never throws or rejects; `[]` for none; `isbn13` is the ISBN asked for; `source: 'google'`; `raw: { google: body }` with the body untouched; a value the volume lacks is left out (lists `[]`); strings NFC and trimmed.
- A volume counts only when an `industryIdentifiers[].identifier` converts with `toIsbn13` (from `@/fields/isbn`) to the ISBN asked for, so an `ISBN_10` entry matches too. No matching volume gives `[]`.
- `subjects` are the volume's `categories` as given (cleaned, repeats dropped, order kept). `themes` is `[]`. No `series`, `seriesIndex` or `binding` (Google gives no series name and no binding).
- Authors are "Given Family". A Google name with a comma (`Martin, George R. R.`) is flipped and keeps the given form as `sortName`; other names get no `sortName`.
- Request: `GET https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn13>`, plus `key=<GOOGLE_BOOKS_API_KEY>` only when that env var is non-empty, read at call time. The key never appears in a log line.
- Any non-2xx answer (429, 403, 5xx included), a network error, a timeout, a body that is not JSON, or `items` present but not an array is a failure: one `warn` log line through `logger()` and `[]`, the same failure path Finna uses. A 2xx answer without matching volumes is "none": `[]` and no log.
- Finna's behaviour is unchanged: `tests/unit/finna.unit.spec.ts` passes unedited.
- Tests use only files under `tests/fixtures/google/` and stub `fetch`; nothing reaches the network.

**Never:**
- No failure signal on the `Source` contract and no `lookupSources`, timeout budget, cache or breaker (3.9). No merge changes.
- No second request per lookup (for example `volumes/<id>`), and no `search()` (8.4).
- Never write `tests/fixtures/google/<isbn13>.json`, `REPORT.md` or `scripts/capture-fixtures.ts`: those are story 3.2's capture output, and a file there would stop `npm run fixtures` fetching that ISBN.
- No database or Payload value imports in `lib/metadata`. No `console.*`. No `any`.

## I/O & Edge-Case Matrix

Volumes are files in `tests/fixtures/google/volumes/<volumeId>.json`, served wrapped in a search body `{ kind: 'books#volumes', totalItems, items }`.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Full volume | `3Wf_ffkFQmgC`, ask `9780007448036` | one result, strict-equal: `title 'A Game of Thrones'`, `authors [{name:'George R. R. Martin'}]`, `publisher 'Harper Voyager'`, `year 2011`, `language 'en'`, `pages 694`, `description` (the volume's text), `subjects` the 7 categories in order, `themes []`, `coverUrl` per Design Notes, `source 'google'`, `raw {google: body}` | — |
| Finnish, no cover or categories | `MF11zQEACAAJ`, ask `9789518581041` | `language 'fi'`, `pages 413`, `subjects []`, no `coverUrl` | — |
| Sparse volume | `D-Py0AEACAAJ`, ask `9789523521957` | no `description`, no `pages` | — |
| Subtitle | `DWvlNEkUDPUC`, ask `9780007447848` | `subtitle 'Steel and Snow'` | — |
| HTML description | `GzENB4wePpEC`, ask `9780007447855` | `description` has no `<`; starts `HBO's hit series`; paragraphs joined by `\n\n`; contains `The Starks are scattered.` | — |
| Other edition in the answer | items `[GzENB4wePpEC, DWvlNEkUDPUC]`, ask `9780007447848` | only the `DWvlNEkUDPUC` result | — |
| ISBN-10 only | `DWvlNEkUDPUC` with its `ISBN_13` entry removed, ask `9780007447848` | one result | — |
| No match | items `[GzENB4wePpEC]`, ask `9780007447848`; also `{totalItems: 0}` without `items` | `[]` | no log |
| Inverted author | `3Wf_ffkFQmgC` with `authors ['Martin, George R. R.']` | `[{name:'George R. R. Martin', sortName:'Martin, George R. R.'}]` | — |
| Language codes | `language` `iw`; `und` | `he`; left out | — |
| Cover link forms | only `smallThumbnail`, `http:` with `&edge=curl`; a `data:` link | `https:`, no `edge`, `fife=w2000`; left out | — |
| Cover ranks first | two matching volumes, the first without `imageLinks` | the one with a cover first | — |
| Key | `GOOGLE_BOOKS_API_KEY` set; empty | request has `key=<value>`; no `key` param; `q=isbn:<isbn13>` both times | — |
| Failure | HTTP 429, 403, 503; fetch rejects; body not JSON; `items: {}` | `[]` | one `warn`; with a key set, no logged value contains it |

</intent-contract>

## Code Map

- `src/lib/metadata/sources/finna.ts` -- the 3.5/3.6 adapter. Its private helpers move to the shared module: `Json`, `isObject`, `list`, `strings` (lines 60-72), `clean` (75-78), `NO_LANGUAGE` + the `Intl.Locale` body of `language` (201-213), the `undefined`-dropping `Object.fromEntries` in `toResult` (260-263), and the HTTP part of `fetchBody` (268-295: timeout, `!response.ok` with body cancel, JSON parse, timeout-vs-network reason). `fetchBody` keeps the Finna-only checks (`status !== 'OK'`, `records`). `cleanIsbd`, `nameParts` and all MARC logic stay in Finna. The warn message stays `Finna lookup failed: <reason>`.
- `src/lib/metadata/source.ts` -- `Source`, `SourceResult`. Read only.
- `src/lib/metadata/merge.ts` -- read only. `FIELDS` gap-fill: Google emits no `series`/`seriesIndex`, so the 3.6 deferral (series and number from different sources) cannot be triggered by this adapter; it stays with 3.9.
- `src/fields/isbn.ts:16` -- `toIsbn13(text)` converts ISBN-10 and ISBN-13 with check digit, `null` otherwise (an `OTHER` identifier such as `UOM:39015…` gives `null`).
- `src/lib/errors.ts` -- `logger()`, as Finna imports it.
- `scripts/capture-fixtures.ts:51-53,215-226` -- `googleUrl` and `googleMatches`, the same query and match rule. Not touched (the script stays independent of `src`).
- `scripts/capture-fixtures.ts:148-157` -- capture skips any existing `google/<isbn13>.json`; it reads files only by that path, so a `google/volumes/` subdirectory does not affect it or `REPORT.md`.
- `.env.example:19-21` -- `GOOGLE_BOOKS_API_KEY` already listed; its comment names only the fixture script.
- `tests/unit/finna.unit.spec.ts` -- pattern to follow: `vi.stubGlobal('fetch', …)`, `warn = vi.spyOn(logger(), 'warn')`, `vi.unstubAllGlobals()`/`restoreAllMocks()` in `afterEach`, failure `it.each` (lines 336-351).
- Recorded volumes, ready in `/private/tmp/claude-501/-Users-mika-development-bookeh/734a28cd-a615-4970-bc32-f2e8982e4348/scratchpad/vol/<volumeId>.json`: 19 real `GET /books/v1/volumes/<id>` responses (2026-10-11, keyed) for shelf ISBNs, ids found through `books.google.fi/books?vid=ISBN<isbn>` canonical links. Google's `isbn:` search answered 503 or a spurious `totalItems: 0` all day, so 3.2's search fixtures do not exist yet. No file contains the key. Facts from them:
  - `volumeInfo` keys used: `title`, `subtitle`, `authors` (all already "Given Family"), `publisher`, `publishedDate` (`2011`, `2005-11-15`), `industryIdentifiers` (`ISBN_10` + `ISBN_13`), `pageCount`, `categories` (BISAC paths such as `Fiction / Fantasy / Epic`, only on the 5 English volumes), `imageLinks` (`smallThumbnail` `zoom=5`, `thumbnail` `zoom=1`, both `http://books.google.com/books/content?…&imgtk=…&source=gbs_api`), `language`, `description`. No `seriesInfo`.
  - `GzENB4wePpEC`'s description is HTML (`<p>`, `<br>`); the others are plain.
  - A by-id volume carries more than a search item (`printedPageCount`, `dimensions`, full BISAC categories, HTML descriptions); the adapter reads only fields search items also have.
- Cover sizes, measured on these links: `zoom=0` (and `zoom=3`/`6`) returns the largest scan when Google has one (1540×2329) but Google's "image not available" placeholder when it does not (`E5TOygAACAAJ`: 575×750, while `zoom=1` is a real 128×199 cover). `&fife=w2000` returns the largest real image up to 2000 px wide (1625×2500 on `3Wf_ffkFQmgC`, 300×466 on `E5TOygAACAAJ`) and never the placeholder, from either thumbnail link.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/sources/shared.ts` -- new: the helpers moved out of Finna (Code Map), with `language` as `isoLanguage(code: unknown)`, the `undefined`-dropping step as `compact(result)`, and the fetch as `getJson(label, url, isbn13)` resolving the parsed body or `undefined` after one `warn` `${label} lookup failed: <reason>`; plus the matching `lookupFailed(label, isbn13, reason, details?)` for source-specific checks. 10 s timeout as today. -- One failure path for both adapters, the one 3.9 will extend.
- `src/lib/metadata/sources/finna.ts` -- use `shared.ts`; no behaviour change.
- `src/lib/metadata/sources/google.ts` -- new: `google: Source`, `toResult(volume, isbn13, body)`, ranking (cover first, otherwise Google's order, stable). Header comment as Finna's.
- `src/lib/metadata/sources/index.ts` -- new: `export const sources: readonly Source[] = [finna, google]`, with a one-line comment that the order is the merge priority (AD-9).
- `tests/fixtures/google/volumes/` -- new: copy the 19 scratchpad volume files unchanged, plus `README.md` stating what they are, why (Google's `isbn:` search down on 2026-10-11), how they were recorded, that tests wrap them in a search body, and that the search responses from `npm run fixtures` will sit beside this directory.
- `.env.example` -- the `GOOGLE_BOOKS_API_KEY` comment also names the Google Books source (optional; sent when set).
- `tests/unit/google.unit.spec.ts` -- new: one test per Matrix row; plus one invariant test over every recorded response under `tests/fixtures/google/` (top-level `*.json` search responses as they are, volumes wrapped): each result's `isbn13` is the ISBN asked for, no author `name` contains a comma, every `coverUrl` is `https:` with `fife=w2000`, and `lookupByIsbn` resolves.

**Acceptance Criteria:**
- Given the change, when `npm run test:unit`, `npm run lint` and `npm run typecheck` run, then all pass with `tests/unit/finna.unit.spec.ts` unedited, and `git status --short src/migrations src/payload-types.ts scripts tests/fixtures/finna tests/fixtures/REPORT.md` is empty.
- Given `src/lib/metadata/sources/index.ts`, when it is read, then it lists `finna` first and `google` second and nothing else.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass

- **verdicts:** 25 findings. High 0, medium 1, low 19, false 5, maybe-false 0.
- **findings:**

Blind review:

- `[low]` `[reject]` **(blind 1) The author flip breaks suffixes and names with two commas.** `Kurt Vonnegut, Jr.` would give `Jr. Kurt Vonnegut`. All 19 recorded Google names are already "Given Family", and 3.6 rejected the same unseen third-comma case. A suffix list adds branches for a case not seen. Grouped with edge 1 and 2.
- `[low]` `[patch]` **(blind 2) HTML to text.** Two parts are real and have direct fixes: entities are decoded only when the description has a tag (grouped with edge 3, VG 1, VG other), and a bare `<` deletes text (edge 6). Fix applied: entities are decoded on every description, and only real tags are stripped. The rest is rejected as low: unclosed `<p>`, `<li>`, `<div>`, headings, `&nbsp;` and numeric entities (edge 4, 5). The only HTML in the fixtures is `<p>`/`<br>`, and each extra form adds a rule.
- `[low]` `[reject]` **(blind 3) The key could reach a log through the raw `err`.** `getJson` never logs the URL. Undici's `fetch failed`, `TimeoutError` and redirect errors carry no request URL, and the one URL-bearing message (`Failed to parse URL`) needs an invalid URL, which `googleUrl` cannot build. If it did happen, it would be the owner's key in the owner's own server log: low. Grouped with intent 4.
- `[low]` `[reject]` **(blind 4) The script repeats Google's URL and match rule.** Correct: `scripts/capture-fixtures.ts` already imports Finna's helpers from `src`, so the spec's reason ("independent of src") is wrong for Finna. The two rules are the same today (`toIsbn13` over `industryIdentifiers`). The script is a one-off capture tool, and moving it onto `google.ts` edits a file this story's contract keeps out.
- `[low]` `[patch]` **(blind 5) `toResult` and `googleUrl` are exported and unused.** Fix applied: both are now module-private.
- `[false]` `[reject]` **(blind 6) `fife=w2000` is too large for the preview and the stored cover.** The story's criterion asks for "the largest image size Google offers". The size limit for stored covers belongs to the download in 3.32 (AD-14).
- `[low]` `[reject]` **(blind 7) Ranking looks only at the cover, so a sparse library stub can rank first.** Real if Google returns two volumes for one ISBN. No recorded answer shows it (no search fixtures exist yet), and a completeness tie-break is a ranking rule designed without data. Recorded as a residual risk.
- `[low]` `[reject]` **(blind 8) The fixture-wide test runs search fixtures with `matches: false`, and `find(ISBN_13)!` would throw on a volume without one.** All 19 committed volumes carry an ISBN-13. Deriving `matches` from the report adds machinery to a test helper, for fixtures that do not exist yet.
- `[low]` `[reject]` **(blind 9) The timeout path is untested in both adapters.** The timeout only changes the reason in the log line. 3.5 rejected the same request (VG 4), and 3.9 owns the time budget and its tests.
- `[low]` `[reject]` **(blind 10) The `response is not an object` branch is untested.** It behaves like every other failure (one warn, `[]`). A JSON `null` or array body from Google has not been seen. A finding that only asks for a test needs a reason.
- `[false]` `[reject]` **(blind 11) The hand-recorded volumes skipped the capture script's key check.** Verification greps every file under `tests/fixtures` and `src` for the key, with no hits. The volumes do not contain it.

Edge cases:

- `[low]` `[reject]` **(edge 1) `Kurt Vonnegut, Jr.` is flipped.** Grouped with blind 1.
- `[low]` `[reject]` **(edge 2) A name with two commas keeps one.** Grouped with blind 1.
- `[low]` `[patch]` **(edge 3) Entities in a description without tags are kept.** Grouped with blind 2. Fixed.
- `[low]` `[reject]` **(edge 4) `&nbsp;`, numeric and named entities are not decoded.** Grouped with blind 2's rejected part.
- `[low]` `[reject]` **(edge 5) Block tags other than `<br>`/`</p>` run text together.** Grouped with blind 2's rejected part.
- `[low]` `[patch]` **(edge 6) A bare `<` inside an HTML description deletes text.** Fixed: only `<\/?[a-z][^>]*>` tags are stripped.
- `[medium]` `[defer]` **(edge 7) Google's spurious `200 totalItems: 0` during outages reads as "none".** Seen all day on 2026-10-11. Nothing in the body tells it apart. Deferred to 3.9, the story that decides the outcome.

Verification gaps:

- `[low]` `[patch]` **(VG 1) Entity decoding has no test.** Fix applied: description edits pin the decoded text, a tag-free description and a bare `<`.
- `[low]` `[patch]` **(VG other) Entities are decoded only with a tag.** Grouped with blind 2. Fixed.

Intent alignment:

- `[false]` `[reject]` **(intent 1) No failure signal reaches a caller, so `unavailable` is not delivered.** `unavailable` is an outcome of `lookupSources`, and story 3.9's criteria include telling failure from none. Under the AD-9 contract an adapter returns empty and logs. A 429 or 403 here goes down the shared failure path, never parsed as an empty answer. 3.5 left the signal to 3.9 the same way.
- `[low]` `[defer]` **(intent 2) The fixtures are by-id volumes wrapped in a search body, not recorded search answers.** Forced by Google's `isbn:` outage, and documented in the README. Deferred: when 3.2's capture succeeds, the fixture-wide test runs over the real search answers, and they should be read against this adapter.
- `[false]` `[reject]` **(intent 3) "Largest image" is checked as a URL, not a size.** No test may reach the network (story criterion). The size behaviour is measured and recorded in the Code Map.
- `[low]` `[reject]` **(intent 4) The key-not-logged test uses only a synthetic error.** Grouped with blind 3.
- `[false]` `[reject]` **(intent 5) The diff lacks the volume JSON and the spec, and the sprint-status change is not in this story.** The review diff left out the raw data files and the claims file on purpose, and both are committed with the story. The sprint-status change was committed as its own chore, `c1a40ad`, because this workflow needs a clean tree before it starts.

## Design Notes

**Cover link.** Take the first of `thumbnail`, `smallThumbnail`, `small`, `medium`, `large`, `extraLarge` in `imageLinks` that is an `http:` or `https:` URL. Set the scheme to `https:`, delete `edge`, set `fife=w2000` (replacing any), keep every other parameter (`imgtk` is needed). `fife` asks Google for its largest image (see Code Map measurements); `zoom=0` is not used because it swaps a real small cover for the placeholder. Example: `https://books.google.com/books/content?id=3Wf_ffkFQmgC&printsec=frontcover&img=1&zoom=1&imgtk=…&source=gbs_api&fife=w2000`. Story 3.32's host allowlist will need `books.google.com`.

**Description.** Google sometimes sends HTML. Turn `<br>` and `</p>` into line breaks, drop every other tag, decode `&lt; &gt; &quot; &#39;` and then `&amp;`, trim each line, drop empty lines and join with `\n\n`. Plain descriptions pass through as one paragraph.

**Year.** The leading four digits of `publishedDate`. **Pages.** `pageCount` when it is a positive integer.

**Failure versus none.** As in 3.5, a failure and "none" both resolve `[]` under today's contract; the difference is that a failure goes through the shared logged failure path, which is where 3.9 adds its signal. A 2xx with `totalItems: 0` is taken as none; Google's spurious zero during outages cannot be told apart here (residual risk).

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, `finna.unit.spec.ts` and `google.unit.spec.ts` included.
- `npm run lint` -- expected: 0 errors.
- `npm run typecheck` -- expected: exit 0.
- `grep -rl "$(sed -n 's/^GOOGLE_BOOKS_API_KEY=//p' .env)" tests/fixtures src` -- expected: no output (skip if the key is empty).
- `git status --short src/migrations src/payload-types.ts scripts tests/fixtures/finna tests/fixtures/REPORT.md` -- expected: empty.

## Auto Run Result

Status: done

**Summary.** Google Books is now the second source. `google.lookupByIsbn(isbn13)` queries `volumes?q=isbn:<isbn13>`, adding `key` only when `GOOGLE_BOOKS_API_KEY` is set. It keeps only volumes whose `industryIdentifiers` convert to the ISBN asked for, with ISBN-10 counting, and maps each volume to a `SourceResult`.

- **Fields:** title, subtitle, "Given Family" authors (an inverted name is flipped and kept as `sortName`), publisher, year, ISO 639-1 language, pages, and the description. An HTML description becomes paragraphs, and entities are decoded on every description. `categories` become `subjects`, and `themes` is `[]`.
- **Cover:** an `https` link without `edge` and with `fife=w2000`. This gets the largest real image Google has; `zoom=0` is not used because it returns Google's placeholder when there is no large scan.
- **Ranking:** a volume with a cover comes first.
- **Failures:** 429, 403, 5xx, network errors, timeouts, non-JSON bodies and malformed bodies go down one logged failure path and resolve `[]`. A 2xx with no matching volume is "none" and is not logged.
- **Shared module:** the JSON guards, text cleaning, language conversion and the logged fetch moved out of Finna into `sources/shared.ts`, so both adapters use one failure path, the one 3.9 will extend. Finna's tests pass unedited.
- **Source order:** `sources/index.ts` lists `[finna, google]`.

**Fixtures.** Google's `isbn:` search was down all day, so 3.2 has no Google search answers yet. The tests run on 19 real by-id volumes for books on the shelf, in `tests/fixtures/google/volumes/`, with a README on how they were recorded. Each volume id came from the book's `books.google.fi/books?vid=ISBN…` canonical link. Tests wrap the volumes in a search body. Nothing was written where `npm run fixtures` writes, so the capture still fetches all 30.

**Files changed.**
- `src/lib/metadata/sources/shared.ts`: new. Guards, `clean`, `isoLanguage`, `compact`, `lookupFailed`, `getJson`.
- `src/lib/metadata/sources/finna.ts`: uses `shared.ts`. No behaviour change.
- `src/lib/metadata/sources/google.ts`: new. The Google Books adapter.
- `src/lib/metadata/sources/index.ts`: new. `[finna, google]`.
- `tests/unit/google.unit.spec.ts`: new, 44 tests. Every Matrix row, entity decoding, and a test over every recorded response.
- `tests/fixtures/google/volumes/`: new. 19 recorded volumes and a README.
- `.env.example`: the key comment names the Google Books source.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 3.7 `done`.

**Review findings.** 25 findings. Every finding has its own row in the Review Triage Log.
- **Patched (all low):** entities decoded on every description; only real tags stripped, so a bare `<` is kept; `toResult` and `googleUrl` no longer exported; entity-decoding tests added.
- **Deferred (2):**
  - medium: Google's spurious `totalItems: 0` during outages reads as "none" (3.9).
  - low: tests run on by-id volumes until 3.2's capture succeeds.
- **Rejected, low.** Unseen in the recorded data, and the fix adds rules or machinery:
  - author suffixes and names with two commas
  - unclosed and other block tags; `&nbsp;` and numeric entities
  - the key reaching a log through a fetch error (no fetch error carries the URL; it would be the owner's own log)
  - the script's duplicate Google URL and match rule
  - a cover-only ranking with a sparse library stub
  - the fixture-wide test's `matches` and `!`
  - untested timeout and "not an object" branches
  - the key-log test using a synthetic error
- **Rejected, false:**
  - `fife=w2000` too large: the criterion asks for the largest size
  - the volumes' key check: grep finds no key
  - no failure signal: `unavailable` is 3.9's outcome
  - "largest" checked as a URL, not a size: tests may not reach the network
  - files missing from the review diff and the sprint-status commit: left out on purpose; committed separately

**Follow-up review recommendation:** false. Patched high 0, medium 0, low 4 entries.

**Verification.**
- `npm run test:unit`: 26 files, 450 tests pass. `finna.unit.spec.ts` is unedited (65 pass), and `google.unit.spec.ts` has 44.
- `npm run lint`: 0 errors. The 8 warnings were already there, in old migrations.
- `npm run typecheck`: exit 0.
- Prettier is clean.
- The key grep over `tests/fixtures` and `src` finds nothing.
- `git status --short src/migrations src/payload-types.ts scripts tests/fixtures/finna tests/fixtures/REPORT.md`: empty.
- Matrix audit: every row has a passing test.

**Residual risks.**
- **Search answers not seen yet.** The adapter has never seen a real `isbn:` search answer. Search items can be leaner than by-id volumes (shorter categories, no HTML), and Google can return several volumes for one ISBN, where only the cover decides the order.
- **Spurious zero.** Google's false `totalItems: 0` during an outage is "none" (deferred to 3.9).
- **Failure looks like none.** Failure and none both resolve `[]` until 3.9 adds the signal.
- **Cover host.** `books.google.com` must be on 3.32's download allowlist. A `fife=w2000` image can be about 300 KB.
