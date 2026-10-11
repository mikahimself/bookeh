---
title: 'Story 3.4: [C1] Source contract and merge'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: 'a1813c39fd33099c5e2f99281ca9d47eaa6d38c9'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The lookup lane (Finna, Google Books, `lookupSources`) has no shared result shape and no merge, so each adapter story would invent its own (AD-9).

**Approach:** Declare the spine's source types and a `Source` interface in `src/lib/metadata/source.ts`, plus one pure `mergeResults()` in `src/lib/metadata/merge.ts` that fills each field from the first source that has it and builds `RawMetadata` per source. Fake sources test it.

## Boundaries & Constraints

**Always:** Types match the spine's Shared shapes exactly (`SourceId`, `SourceResult`, `SourcesOutcome`, `SearchHit`, `RawMetadata`). `Source` = `{ id: SourceId; lookupByIsbn(isbn13: string): Promise<SourceResult[]>; search?(query: string): Promise<SearchHit[]> }`: records best first, `[]` for none, never throws (documented on the type). `mergeResults` is pure apart from the optional clock argument. Empty means `undefined`, `null`, `''` or `[]`. Every `SourceResult` field except `source` and `raw` is merged by the same rule, and the compiler fails if a new field is left out of the merge.

**Never:** No adapter, no `sources/index.ts`, no `lookupSources`, no candidate building, cache, timeouts or breaker (3.5–3.9). No database, Payload or collection imports in `lib/metadata` (the lint rule already exists). No per-field special cases, and no merging of author lists element by element.

## I/O & Edge-Case Matrix

`lists` is one entry per source in source order, each that source's records best first. Only `lists[i][0]` is read.

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Field by field | finna `[{title:'A', authors:[x], subjects:[], publisher: undefined}]`, google `[{title:'B', publisher:'P', pages:300, subjects:['Fiction']}, {…second}]` | `title:'A'`, `authors:[x]`, `publisher:'P'`, `pages:300`, `subjects:['Fiction']`, `source:'finna'`; google's second record unused | — |
| Empty first source | `[[], [googleRecord]]` | the result's values are google's, with `source:'google'` | — |
| Raw per source | both answered, with raw `{finna:F}` / `{google:G}` | `result.raw` and `raw.sources` = `{finna:F, google:G}`; `raw.subjects` = `{finna:[], google:['Fiction']}`; `raw.coverUrl` = merged `coverUrl ?? null`; `v:1`; `fetchedAt` = clock ISO | — |
| Nothing | `[]` or `[[], []]` | `null` | — |

</intent-contract>

## Code Map

- `src/lib/metadata/` -- does not exist yet. The spine source tree puts "source contract, sources/, merge, lookupSources, cache" here.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:371-401` -- Shared shapes: copy the `src/lib/metadata` types verbatim (comments included). Lines 169-170 (AD-9) hold the contract rules.
- `eslint.config.mjs:274-292` -- `lib/metadata` already bans `payload`, the config, Drizzle and collections (type imports allowed). `serviceImports.metadata: []` (line 32) allows only `errors` and `processState` from `src/lib`. Nothing to change.
- `vitest.config.mts` -- the unit project picks up `tests/unit/**/*.unit.spec.ts`, with no database.
- Later readers: 3.9 calls `mergeResults([[record], ...otherLists])` once per record of the first source that answered; 3.5/3.7 adapters return `SourceResult` with `source` = own id and `raw` = `{ [id]: completeResponse }`.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/source.ts` -- new: the five spine types plus `Source`, exported. JSDoc on `Source` gives the contract: best first, `[]` for none, never throws, `isbn13` is the ISBN asked for, and `binding` is display only.
- `src/lib/metadata/merge.ts` -- new: `mergeResults(lists: SourceResult[][], now: Date = new Date()): { result: SourceResult; raw: RawMetadata } | null`. It takes each list's best record in order, skipping empty lists. Each field takes its first non-empty value, using a `Record<Field, true>` key table so the compiler forces exhaustiveness. `source` is the first record's source, `raw` is the union of the records' `raw` (first wins), and `RawMetadata` is built from the same records.
- `tests/unit/metadata.unit.spec.ts` -- new: two fake `Source` objects whose `lookupByIsbn` resolves fixed records, fed through `Promise.all` into `mergeResults`, covering every Matrix row.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-4-c1-source-contract-and-merge` → `done` at finalisation.

**Acceptance Criteria:**
- Given `src/lib/metadata`, when an adapter is typed as `Source`, then it must return `Promise<SourceResult[]>` from `lookupByIsbn`, and `search` is optional.
- Given the change, when `npm run test:unit`, `npm run lint` and `npm run typecheck` run, then all pass, and `git status --short src/migrations src/payload-types.ts` is empty.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 23 findings — high 0, medium 0, low 13, false 10, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind 1) `series`/`seriesIndex` (and `title`/`subtitle`) can come from different sources. Real, but the intent (epic AC, AD-9, D-7) asks for a field-by-field merge. Google's adapter (3.7) does not list series, so a mixed pair needs an unlikely source combination, and grouping the fields adds a per-field branch.
  - `[low]` `[reject]` (blind 2) A field that is empty in every source keeps the first record's `''`, and `result.coverUrl` `''` differs from `raw.coverUrl` `null`. This only happens when an adapter sends `''`, which the `Source` contract now forbids (patch to blind 3). Deleting empty keys adds a branch for input the contract rules out.
  - `[low]` `[patch]` (blind 3) Placeholders (`0`, `NaN`, `'  '`) count as filled, and the `Source` contract did not forbid them. Fix applied: `Source` JSDoc says a missing value is left out (or `[]`), never sent as a placeholder such as `''`, `0` or an author without a name.
  - `[low]` `[reject]` (blind 4) The merge output shares arrays with its inputs. Nothing mutates them today. Copying them guards a mutation no caller has, and 3.9's cache can copy on its own terms if it needs to.
  - `[false]` `[reject]` (blind 5) Language code format unspecified. The epic context and 3.5's AC already fix ISO 639-1, so both adapter stories build to the same rule.
  - `[low]` `[reject]` (blind 6) `lookupByIsbn` takes no `AbortSignal`, so a timed-out fetch keeps running. The spine fixes the signature `lookupByIsbn(isbn13)`, an adapter can bound its own fetch with `AbortSignal.timeout`, and a lingering fetch in a one-user app costs nothing noticeable.
  - `[low]` `[patch]` (blind 7) The `SourcesOutcome` comment "candidates best first" sat on the `unavailable` member. Fix applied: the comment is split onto the `found` and `unavailable` lines.
  - `[false]` `[reject]` (blind 8) Sprint status `done` during review. This is an interim state: finalisation writes `done` to both in this run (same refutation as story 3.3).
  - `[low]` `[patch]` (blind 9) No test uses `''`, so the `value === ''` branch was untested. Grouped with verification-gap 1. Fix applied: `finnaRecord.publisher` is `''` and the `publisher: 'P'` expectation covers it.
  - `[low]` `[patch]` (edge 1) A whitespace-only string beats a later source. Grouped with blind 3: adapters trim (AD-9) and the JSDoc forbids placeholders.
  - `[low]` `[patch]` (edge 2) `NaN`/`0` for year, pages or index beats a later source. Grouped with blind 3.
  - `[low]` `[patch]` (edge 3) An author list with only empty names beats a later source. Grouped with blind 3.
  - `[low]` `[reject]` (edge 4) Same as blind 1.
  - `[low]` `[reject]` (edge 5) Same as blind 4.
  - `[false]` `[reject]` (edge 6) An invalid `Date` makes `toISOString` throw. No caller passes one (the default is `new Date()`), and a loud failure on an impossible input is correct.
  - `[false]` `[reject]` (edge 7, claim) `coverUrl || null` vs the spec's `?? null`. The two differ only for `''`, which the spec's own empty rule treats as empty, so `null` is the consistent outcome and no bad state results.
  - `[low]` `[patch]` (verification-gap 1) The `''` empty rule is untested. Grouped with blind 9. Fix applied there.
  - `[false]` `[reject]` (intent 1) Merge takes record lists rather than single results. This follows STORY-SLICING C1 ("record lists") and the 3.9 call pattern `[[record], ...rest]` (Design Notes).
  - `[false]` `[reject]` (intent 2) Per-source subjects live in `RawMetadata`, not `SourceResult`. That is the spine's Shared shape, and the epic AC's "per-source subjects" is the source's own `subjects` field.
  - `[false]` `[reject]` (intent 3) `RawMetadata.sources` reads only each source's best record. Under the `Source` contract every record carries the complete response, so nothing is lost.
  - `[false]` `[reject]` (intent 4) No check that `lib/metadata` has no database access. The ESLint rule at `eslint.config.mjs:274-292` enforces it, and `npm run lint` passes.
  - `[false]` `[reject]` (intent 5) Same as edge 7.
  - `[false]` `[reject]` (intent 6) Spec status, sprint status and the missing commit. These are interim states that finalisation in this run resolves.

## Design Notes

**Why lists and not single results.** Slicing gives candidate building to C4 (3.9). Taking each source's list lets "an empty first source" be a real input, and 3.9 reuses the same merge per candidate by passing `[[record], ...rest]`.

**Why `RawMetadata` comes out of the merge.** The merged `subjects` is one list, so per-source subjects can only be read from the input records. Each call's `RawMetadata` therefore matches its candidate (its `coverUrl`, its first-source subjects). Which one `SourcesOutcome.found.raw` holds is decided in 3.9.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including `metadata.unit.spec.ts`
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors
- `git status --short src/migrations src/payload-types.ts` -- expected: empty

## Auto Run Result

Status: done

**Summary.** `src/lib/metadata/source.ts` declares the spine's source shapes (`SourceId`, `SourceResult`, `SourcesOutcome`, `SearchHit`, `RawMetadata`) and the `Source` type. Its JSDoc states the contract:
- records best first, `[]` for none
- never throws
- `isbn13` is the ISBN asked for
- `raw` is `{ [id]: completeResponse }`
- no placeholders for missing values
- `binding` is display only

`src/lib/metadata/merge.ts` adds `mergeResults(lists, now?)`:
- It reads each source's best record in source order and skips empty lists.
- Each field takes the first non-empty value (`undefined`, `null`, `''` and `[]` are empty). The field table is exhaustive at compile time.
- `source` comes from the first answering source. `raw` is the union of the records' `raw`.
- It returns `{ result, raw: RawMetadata }` with per-source responses and subjects, or `null` when no source has a record.

No adapter, `sources/index.ts`, migration or generated-type change.

**Files changed.**
- `src/lib/metadata/source.ts`: new, the source types and the `Source` contract.
- `src/lib/metadata/merge.ts`: new, `mergeResults`.
- `tests/unit/metadata.unit.spec.ts`: new, fake sources covering field-by-field merging (including `''`), an empty first source, `RawMetadata` per source, a missing cover and no records.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 3.4 `done`.

**Deviation from the spec.** `raw.coverUrl` is `result.coverUrl || null`, not `?? null`, so an all-`''` cover becomes `null`, consistent with the empty rule.

**Review findings.** 23 rows, 0 deferred. Three entries were patched, all `low`:
- the `Source` JSDoc now forbids placeholders (blind 3, edge 1–3)
- the misplaced `SourcesOutcome` comment was moved (blind 7)
- a `''` fixture now covers the empty rule (blind 9, verification-gap 1)

Rejected `low`:
- separate `series`/`seriesIndex` and `title`/`subtitle`: the intent asks for field-by-field, and the mixed pair needs an unlikely source combination
- empty values kept when no source fills a field: the contract now forbids `''`
- shared array references: nothing mutates them
- no `AbortSignal`: the spine fixes the signature, and an adapter can time out its own fetch

Rejected `false`:
- language code format (fixed by the epic context and 3.5)
- interim sprint and spec status (twice)
- invalid `Date` (no such caller)
- `||` vs `??` (twice; consistent with the empty rule)
- record-list input (STORY-SLICING C1)
- per-source subjects location (the spine shape)
- best-record raw (the contract's complete response)
- the no-database check (enforced by the lint rule)

**Follow-up review recommendation:** false. Patched by entry verdict: high 0, medium 0, low 3.

**Verification.**
- `npm run test:unit`: 24 files, 341 tests pass.
- `npm run lint`: 0 errors (8 existing warnings in old migrations).
- `npm run typecheck`: clean.
- Prettier is clean on the touched files.
- `git status --short src/migrations src/payload-types.ts` is empty.

**Residual risks.** The contract has only met fake sources. Its first real test is the Finna adapter (3.5) and the per-candidate call in 3.9. Which candidate's `RawMetadata` becomes `SourcesOutcome.found.raw` (and so what a picked edition stores) is decided in 3.9.
