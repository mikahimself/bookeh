---
title: 'Story 3.5: [C2] Finna adapter: core fields'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: '05751786fb4b1933a7cb9edb40b8fc4b04d96933'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** No source exists yet, so the lookup lane cannot recognise a book. Finna comes first because the books are mostly Finnish (FR-11, AD-9).

**Approach:** `src/lib/metadata/sources/finna.ts` exports a `finna: Source`. It requests the same URL the fixture script records, keeps only records whose own `isbns` normalise to the ISBN asked for, maps each to a `SourceResult` with the core fields, and orders them best first. The fixture script imports the request and the ISBN match from the adapter, so fixtures are always recorded from the adapter's own request.

## Boundaries & Constraints

**Always:**
- Emitted strings are `.normalize('NFC').trim()`. A field the record does not have is left out, never sent as `''` or `0`.
- `isbn13` is the argument. `source: 'finna'`. `raw: { finna: <whole response body> }`. `subjects: []` and `themes: []`.
- Any failure (network error, timeout, non-2xx, body not JSON, `status` not `'OK'`, `records` neither an array nor left out of a `resultCount:0` answer) is logged through `logger()` from `src/lib/errors.ts` and resolves `[]`. A record without a title is skipped.
- The adapter bounds its fetch with `AbortSignal.timeout(10_000)`.

**Never:**
- No series, series index, themes or `sortName` (3.6).
- No `sources/index.ts` (3.7), and no `lookupSources`, cache or breaker (3.9).
- No database or Payload value imports in `lib/metadata`.
- No `console.*`.
- No test reaches the network.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One match among other editions | `9789524035699` (5 records, 1 with that ISBN) | one result: `title:'Sapiens'`, `subtitle:'ihmisen lyhyt historia'`, `authors:[{name:'Yuval Noah Harari'}]` (translator left out), `publisher:'Bazar'`, `year:2024`, `language:'fi'`, `pages:491`, `binding:'pehmeäkantinen'`, `coverUrl:'https://api.finna.fi/Cover/Show?source=Solr&id=helle.1637236&index=0&size=large'` | — |
| Several matches, best first | `9780007466061` (2 matching) | 2 results; `kirkes.399381` (has a cover) first, with `binding:'nidottu'`; the other has no `binding` (its ISBN has no qualifier) | — |
| Role-less translator | `9789515789631` | each result's `authors` is `[{name:'Erlend Loe'}]`; Outi Menna (no role, not first) is left out; `pages:222` from `222, [1] sivua` | — |
| Description | `9789511319177` | `description` is the record's first `summary`, trimmed | — |
| Empty | `{resultCount:0,status:'OK',records:[]}`, or the same with `records` left out | `[]` | no log line |
| Failure | fetch rejects / HTTP 500 / body `not json` / `{status:'ERROR'}` | `[]`, never rejects | one log line per failure |

</intent-contract>

## Code Map

- `src/lib/metadata/source.ts`: the `SourceResult` and `Source` types and the contract in JSDoc. Read only.
- `scripts/capture-fixtures.ts:11-48,88-96,247-273`: `FINNA_FIELDS`, `finnaUrl()` and `finnaIsbn`/`finnaMatches`. The URL is `https://api.finna.fi/api/v1/search` with `lookfor=isbn:"…"`, `type=AllFields`, `limit=100` and one `field[]` per field. Move these to the adapter. The script keeps `isObject`/`list`/`strings` for its other uses. It reads `.images` and `.title` from match results, and `REPORT.md` prints `FINNA_FIELDS`.
- `tests/unit/captureFixtures.unit.spec.ts:10,50`: imports `finnaMatches` from the script. Repoint it to the adapter.
- `src/fields/isbn.ts`: `toIsbn13(text)`. Reuse it for matching. `@/fields` is importable from `lib/metadata`, because the lint bans only `payload`, the config, Drizzle and collections there (`eslint.config.mjs:274-292`).
- `src/lib/errors.ts:32-36`: a private lazy `log()` pino with `defaultLoggerOptions` (what `payload.logger` is). Export it as `logger()`, because `lib/metadata` cannot value-import `payload`.
- `tests/fixtures/finna/*.json`: 30 recorded responses, all `status:'OK'`. Record fields used: `shortTitle`, `title`, `subTitle`, `nonPresenterAuthors[{name, role?, type}]`, `isbns` (`"978-… pehmeäkantinen"`), `languages` (MARC codes such as `fin`, `eng`), `publishers`, `year`, `physicalDescriptions`, `summary`, `images` (relative `/Cover/Show?…`), `subjects`. `api.finna.fi/Cover/Show` was verified to serve the image. A record without an image yields a placeholder GIF there, so `coverUrl` is set only when `images` is non-empty.
- `tests/unit/metadata.unit.spec.ts`: the existing unit spec for `lib/metadata`. The adapter gets its own file.

## Tasks & Acceptance

**Execution:**
- `src/lib/errors.ts`: rename `log` to exported `logger()` and update its uses. Keep the comment.
- `src/lib/metadata/sources/finna.ts`: new. Export:
  - `FINNA_FIELDS` and `finnaUrl()`, moved verbatim from the script
  - `finnaMatches(body, isbn13)`: the matching records
  - `finna: Source`, with `id: 'finna'` and `lookupByIsbn`. It parses `unknown` with small guards and no `any`.
- `scripts/capture-fixtures.ts`: drop the moved code and import it from `@/lib/metadata/sources/finna`. Its behaviour and the `REPORT.md` output stay unchanged.
- `tests/unit/captureFixtures.unit.spec.ts`: import `finnaMatches` from the adapter.
- `tests/unit/finna.unit.spec.ts`: new. Stub `fetch` with `vi.stubGlobal` to serve `tests/fixtures/finna/<isbn>.json` by the ISBN in the URL. Cover every Matrix row, plus one pass over all 30 fixtures asserting the invariants: at least one result, `isbn13` is the one asked for, a non-empty title, every string trimmed and NFC, no author name containing a comma. For failures, spy on `logger().warn`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: `3-5-c2-finna-adapter-core-fields` → `done` at finalisation.

**Acceptance Criteria:**
- Given the change, when `npm run test:unit`, `npm run lint` and `npm run typecheck` run, then all pass, and `git status --short src/migrations src/payload-types.ts tests/fixtures` is empty.

## Spec Change Log

### 2026-10-11 — Owner rulings on the blocked review pass
- **Trigger:** the review pass halted on an intent gap (blind 1, Swedish summaries) and asked Mika to confirm one implementation deviation (no `records` key).
- **Rulings (Mika):** a Swedish summary is an acceptable description. A `resultCount:0` answer without `records` is an empty result, not a failure.
- **Amended:**
  - the intent contract's failure rule and its Empty row, by the owner's authority
  - the description rule in Design Notes
- **Known-bad state avoided:** every real Finna miss being logged as a failure.
- **KEEP:** the saved attempt was re-applied unchanged, with the patch-level review fixes on top.

## Review Triage Log

### 2026-10-11 — Review pass

The pass halted on blind 1 (intent gap) and the attempt was reverted. Mika then ruled to keep Swedish summaries. The attempt was re-applied, and every row marked `[patch]` below has its fix applied.

- **verdicts:** 34 findings. High 0, medium 1, low 24, false 9, maybe-false 0.
- **findings:**

Intent alignment:

- `[false]` `[reject]` **(intent 1) Empty and failure tests use inline bodies, not fixture files.** The AC means no network. The Matrix gives these bodies inline, and nothing reaches the network.
- `[low]` `[reject]` **(intent 2) Language mapping cases are untested.** These are `ger`→`de`, `smn`, `und`, and `Intl` throwing. The fixtures hold only `fin` and `eng`. `Intl.Locale` canonicalisation is stable platform behaviour. A test for it would only be asked for "more tests", with no failure behind it.
- `[low]` `[patch]` **(intent 3) The subjects tie-break and "ties keep Finna's order" are untested.** Grouped with VG 1. Fix applied.
- `[low]` `[reject]` **(intent 4) The timeout path is untested.** Grouped with VG 4.
- `[low]` `[reject]` **(intent 5) The stub reads only `lookfor`, so `type`, `limit` and `field[]` are not asserted.** The URL was moved verbatim, and the rebuilt `REPORT.md` was byte-identical before and after the move.
- `[false]` `[reject]` **(intent 6) The capture-script refactor goes beyond the epic AC.** No bad outcome. Behaviour is unchanged, and `captureFixtures.unit.spec.ts` passes.
- `[false]` `[reject]` **(intent 7) The URL differs from CLAUDE.md's `api.finna.fi/v1/search`.** CLAUDE.md says to verify against swagger. `/api/v1/search` is the path verified and recorded in 3.2.
- `[false]` `[reject]` **(intent 8) It returns every match instead of picking the best.** The epic AC and the `Source` contract require all matches, best first.
- `[false]` `[reject]` **(intent 9) Sprint status and the commit are pending.** These are interim states that finalisation sets.
- `[false]` `[reject]` **(intent 10) Series, themes and failure signalling are left out.** Stories 3.6 and 3.9 own them, per the slicing.

Verification gaps:

- `[low]` `[patch]` **(VG 1) Deleting the sort leaves every test green.** No fixture has a better record behind a worse one. Fix: serve one fixture with its records reversed, and add a subjects-only tie case. Fix applied.
- `[low]` `[patch]` **(VG 2) The author-role rules are unpinned.** Uncovered: `författare`, comma-split roles, and exact match (`loppusanojen kirjoittaja`). Fix: assert non-empty `authors` in the all-fixtures loop, and pin `9789517685535` and `9789523521957`. Fix applied.
- `[low]` `[patch]` **(VG 3) The `s.` page word is unpinned.** Fix: assert that `9789510397077` gives `pages: 200`. Fix applied.
- `[low]` `[reject]` **(VG 4) The 10 s timeout is untested.** A timer test against `AbortSignal.timeout` adds harness complexity. Story 3.9 owns the time budget and tests timeouts.

Edge cases:

- `[low]` `[reject]` **(edge 1) With no MARC 100, a role-less first person (an editor) counts as author.** Not seen in 30 fixtures. Fixing it adds a branch.
- `[low]` `[reject]` **(edge 2) Role-less co-authors after the first person are dropped.** This is the documented trade-off. Role-less added entries are translators in every fixture, and the proposed fix would make Outi Menna an author.
- `[low]` `[patch]` **(edge 3) `mis` is not in `NO_LANGUAGE`.** The fix is a one-word addition. The local `qaa`–`qtz` codes were left alone as unlikely. Fix applied.
- `[low]` `[reject]` **(edge 4) `languages[0]` is `und` while a later entry is real.** Unlikely. Fixing it adds a loop.
- `[low]` `[reject]` **(edge 5) A record listing the same ISBN twice could lose its binding.** No fixture record has two matching entries. Fixing it adds a branch.
- `[low]` `[reject]` **(edge 6) A qualifier with a price (`(nid.) : 25 €`).** No `isbns` entry in the fixtures contains `(` or `:`.
- `[low]` `[reject]` **(edge 7) A qualifier glued to the ISBN (`…(nid.)`).** Same evidence as edge 6.
- `[false]` `[reject]` **(edge 8) `resultCount` over the limit of 100.** An exact-ISBN query returns at most 6 records in the fixtures.
- `[low]` `[reject]` **(edge 9) The same edition from several libraries gives duplicate candidates.** Examples: `9789515789631` and `9780007447855`. The epic AC requires every matching record. Collapsing them belongs to the picker (3.53) or to candidate building (3.9).
- `[low]` `[patch]` **(edge 10) A non-OK response body is never cancelled.** Fix applied: `await response.body?.cancel().catch(() => {})`, so cancelling can never reject.
- `[low]` `[patch]` **(edge 11) A timeout while reading the body is logged as "not JSON".** Fix: check the error name in both catches. Fix applied.
- `[false]` `[reject]` **(edge 12) Unnormalised input could be passed as a Solr query.** The `Source` contract takes a normalised `isbn13`, and the only caller (3.9) receives it from `normaliseIsbn`.
- `[low]` `[patch]` **(edge 13) A `.DS_Store` in the fixtures directory breaks the all-fixtures test on macOS.** Fix: filter for `.json`. Fix applied.

Blind review:

- `[medium]` `[intent_gap]` **(blind 1) Swedish descriptions on Finnish books.** `anders.*` records come from Finland's Swedish-language libraries and carry Swedish summaries. 2 of the 5 fixture descriptions are Swedish:
  - `9789511463788`, "Erään kissan tutkimuksia" (`language: 'fi'`), gets "I ”Kattens undersökningar” följer vi…". It is the only matching record.
  - `9789520436322` gets "Under en stor del av sitt vuxna liv…".

  Merge takes the first non-empty field, so this text would also beat Google's description. Neither the intent nor the spec said which languages a description may be in. **Resolved by Mika: keep the summary as given.** No code change.
- `[low]` `[patch]` **(blind 2) A timeout while reading the body is mislabelled.** Grouped with edge 11. Fix applied.
- `[low]` `[patch]` **(blind 3) A non-OK body is not cancelled.** Grouped with edge 10. Fix applied.
- `[low]` `[patch]` **(blind 4) Failure logs leave out Finna's `status` and `statusMessage`.** Fix: add them to the log object. Fix applied.
- `[low]` `[reject]` **(blind 5) Ranking ignores how complete a record is.** The AC fixes the ranking as cover, then subjects. The duplicates are covered under edge 9.
- `[false]` `[reject]` **(blind 6) `lib/metadata` pulls in `payload` through `@/lib/errors`.** No database access happens, and the lint rule bans only direct imports of the database layer. The spec chose `errors.ts` as the logger's home because `lib/metadata` may import it.
- `[low]` `[patch]` **(blind 7) The Finna host is written twice (`finnaUrl` and `ORIGIN`).** Fix: build the URL from `ORIGIN`. Fix applied.

## Design Notes

**Field rules** (from the 30 fixtures):

- **title** is `shortTitle`, falling back to `title`. **subtitle** is `subTitle`. Both, and `publishers[0]`, lose trailing ISBD punctuation (`/ : ; = ,`) and surrounding space.
- **year** is the first 4-digit run in `year`.
- **language**: `languages[0]` through `new Intl.Locale(code).language`, which maps `fin`→`fi` and the bibliographic `ger`→`de`, and keeps `smn` as is. Leave it out for `und`, `mul`, `zxx` or when `Intl` throws.
- **pages**: take `physicalDescriptions[0]` up to the first ` :` or ` ;`. If it contains a page word (`sivua`, `sivu`, `s.`, `p.`, `pages`, `sidor`, `sid.`), pages is the largest integer in it: `222, [1] sivua` gives 222, and `19 h 22 min` gives nothing.
- **description** is the first string in `summary`, in whatever language Finna gives it. A Swedish summary on a Finnish book is accepted (owner ruling, 2026-10-11).
- **cover**: if `images[0]` starts with `/`, prefix `https://api.finna.fi`. An absolute `https:` URL is kept. Anything else is left out.
- **binding** is the text after the ISBN token in the matching `isbns` entry, with enclosing parentheses removed. It is kept as Finna states it (`pehmeäkantinen`), because the vocabulary is open and the field is display only.
- **Authors** are persons in `nonPresenterAuthors` (type absent or `Personal Name`), deduplicated by name. An entry counts when:
  - one of its comma-separated roles is `kirjoittaja`, `tekijä`, `författare`, `author` or `aut`, or
  - it is the first person and has no role (the MARC 100 main entry).

  Translators, narrators, afterword writers (`loppusanojen kirjoittaja`) and role-less added entries (all translators in the fixtures) are left out. A name `Family, Given (qualifier)` becomes `Given Family`, and a name without a comma is kept as is.
- **Best first**: a stable sort on (has a cover, has subjects), both descending. Ties keep Finna's order.

**Failure versus none.** The AC and the `Source` contract say a failure returns nothing. Story 3.9 must still tell failure from none for `unavailable`. That signal is 3.9's to design, and it may extend the contract. This story follows its AC.

## Verification

**Commands:**
- `npm run test:unit`: all pass, including `finna.unit.spec.ts` and `captureFixtures.unit.spec.ts`.
- `npm run lint`: no errors.
- `npm run typecheck`: no errors.
- `git status --short src/migrations src/payload-types.ts tests/fixtures`: empty.

## Auto Run Result

Status: done

**Summary.** `src/lib/metadata/sources/finna.ts` adds `finna: Source`. `lookupByIsbn(isbn13)`:
- requests the same Finna search that records the fixtures
- keeps only records whose own `isbns` normalise to the ISBN asked for
- maps each to a `SourceResult` with title, subtitle, "Given Family" authors (translators, narrators and afterword writers left out), publisher, year, ISO 639-1 language via `Intl.Locale`, pages, description, cover URL and per-ISBN binding
- orders the results by cover, then subjects
- never throws: each failure logs one `warn` line through the newly exported `logger()` and resolves `[]`

The fixture script now imports the Finna request and the ISBN match from the adapter.

A first review pass halted on an intent gap: Swedish summaries from Swedish-language library records. Mika ruled to keep them. He also confirmed that a `resultCount:0` answer without `records` is an empty result, not a failure. The saved attempt was re-applied with the patch-level review fixes.

**Files changed.**
- `src/lib/metadata/sources/finna.ts`: new. Exports the adapter, `FINNA_FIELDS`, `finnaUrl()` (built from `ORIGIN`) and `finnaMatches()`.
- `src/lib/errors.ts`: the lazy pino logger is exported as `logger()`.
- `scripts/capture-fixtures.ts`: the Finna request and match come from the adapter. `REPORT.md` output is unchanged.
- `tests/unit/captureFixtures.unit.spec.ts`: `finnaMatches` is imported from the adapter.
- `tests/unit/finna.unit.spec.ts`: new. Covers the Matrix rows, all 30 fixtures against the contract invariants, best-first order (reversed records and a subjects tie), author roles, the `s.` page word, empty answers and five failure kinds.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 3.5 `done`.

**Review findings.** 34 rows, 0 deferred.

Patched (all `low`):
- sort tests (VG 1, intent 3)
- author-role pins and non-empty authors (VG 2)
- the `s.` pages assertion (VG 3)
- `mis` in `NO_LANGUAGE` (edge 3)
- cancel a non-OK body (edge 10, blind 3)
- a timeout while reading the body logged as a timeout (edge 11, blind 2)
- `.json` filter on fixtures (edge 13)
- Finna `status`/`statusMessage` in the log (blind 4)
- URL from `ORIGIN` (blind 7)

Intent gap, resolved by the owner with no code change:
- Swedish summaries (blind 1)

Rejected `low`:
- language-mapping and URL-parameter tests (intent 2, 5)
- timeout test (VG 4, intent 4): 3.9 owns the time budget
- role-less first person or co-authors (edge 1, 2): the documented trade-off
- `und` first (edge 4), duplicate ISBN entries (edge 5), price or glued qualifiers (edge 6, 7): none in the fixtures
- duplicate candidates across libraries (edge 9): the AC requires every record
- completeness ranking (blind 5): the AC fixes the ranking

Rejected `false`:
- inline failure bodies (intent 1)
- script refactor scope (intent 6)
- CLAUDE.md URL (intent 7)
- all matches instead of a pick (intent 8)
- interim status (intent 9)
- 3.6/3.9 scope (intent 10)
- more than 100 results (edge 8)
- unnormalised input (edge 12)
- Payload pulled in through `errors.ts` (blind 6)

**Follow-up review recommendation:** false. Patched by entry verdict: high 0, medium 0, low 9.

**Verification.**
- `npm run test:unit`: 25 files, 388 tests pass.
- Removing the sort fails the two new order tests, checked by mutation and then restored.
- `npm run lint`: 0 errors (8 existing warnings in old migrations).
- `npm run typecheck`: clean.
- Prettier is clean on the touched files.
- `git status --short src/migrations src/payload-types.ts tests/fixtures` is empty.

**Residual risks.**
- `Source` returns `[]` for both failure and none. Story 3.9 has to add a failure signal to tell `unavailable` from `none`.
- The same edition catalogued by several libraries comes back as separate candidates (`9789515789631`, `9780007447855`). Candidate building (3.9) or the picker (3.53) should collapse them.
- Descriptions from Swedish-language library records are in Swedish, which Mika accepted.
