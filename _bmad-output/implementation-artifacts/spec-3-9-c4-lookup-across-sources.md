---
title: 'Story 3.9: [C4] Lookup across sources'
type: 'feature'
created: '2026-10-12'
baseline_revision: '1675477e5b584f9b29d41684c91eade749fa7a07'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      `found.raw` is the best candidate's RawMetadata, so a save of `pick > 0` that stores it unchanged keeps candidate 0's `coverUrl` and first-source subjects.
    evidence: |-
      Settled by how 3.53 (or the save in 3.35) builds the stored `rawMetadata`: it must take `coverUrl` and the first source's subjects from the picked candidate (spec Design Notes). Unverified until that code exists.
    location: >-
      src/lib/metadata/lookup.ts (found outcome, raw: merged[0].raw)
    severity: medium (unverified)
  - summary: >-
      A `found` merged while a source failed is not cached (AC), so a save re-runs the lookup; if the failed source answers by then, `pick` indexes a different candidate list.
    evidence: |-
      Spine line 115: the save reads the held outcome, re-fetched on a miss. Settled by how 3.35/3.53 check a pick against the re-run (e.g. refuse or re-answer when the candidate list changed). Unverified until that code exists.
    location: >-
      src/lib/metadata/lookup.ts (cache rule for found with failed sources)
    severity: medium (unverified)
  - summary: >-
      The spine (AD-9) and epic-3-context still describe the source contract as "a list, empty for none" and candidates from "the first source that answered"; the code now resolves `undefined` on failure and takes the first source with records.
    evidence: |-
      ARCHITECTURE-SPINE.md:169-170 and epic-3-context.md Technical Decisions. A future adapter written from the spine alone could return [] on failure and turn outages into "none". Editing the binding architecture document is the owner's call.
    location: >-
      _bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:169
    severity: low
---

<intent-contract>

## Intent

**Problem:** There is no `lookupSources(isbn13)`: nothing asks Finna and Google Books together, bounds a slow source, builds candidates, caches outcomes or pauses a failing source (AD-9, NFR-1). And a source answers `[]` both for "no such book" and for a failure, so an outage cannot be told from `none`.

**Approach:** Extend the `Source` contract so `lookupByIsbn` resolves `undefined` for a failure (still never throws), and add `src/lib/metadata/lookup.ts` with `lookupSources(isbn13): Promise<SourcesOutcome>`: all sources in parallel under a per-source timeout, candidates via `mergeResults`, a bounded TTL cache and a per-source circuit breaker, both held in `processState`.

## Boundaries & Constraints

**Always:** Sources run in `sources/index.ts` order and are merged in that order. A source that resolves `undefined`, rejects (contract breach, still handled), times out or is skipped by its breaker counts as failed. `found` when the first source with records exists; `none` only when every source answered `[]`; otherwise `unavailable` with `failed` listing the failed ids in source order. Cache `found` and `none` only when no source failed; `unavailable` never. No database, Payload or collection import in `lib/metadata` (lint-enforced). Strict TS, no `any`.

**Never:** No change to `mergeResults` or adapter parsing. No collapsing of duplicate records into one candidate (the AC asks for one per record; the picker, 3.53, owns how they show). No in-flight request de-duplication, no rate limit (3.30), no `lookupBook` (3.28). No reset API exported for tests: tests clear the containers through `processState` with the same keys.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Found | A: `[a1, a2]`, B: `[b1]` | `found`, candidates `merge([[a1],[b1]])`, `merge([[a2],[b1]])`; `raw` = first candidate's; cached | No error expected |
| First source empty | A: `[]`, B: `[b1, b2]` | `found`, one candidate per B record, gap-filled from A (nothing) | No error expected |
| None | every source `[]` | `none`; cached | No error expected |
| Unavailable | A: `[]`, B: `undefined` | `unavailable`, `failed: ['B']`; not cached | No error expected |
| Found while one failed | A: `[a1]`, B: `undefined` | `found` from A alone; not cached, next call asks the sources again | No error expected |
| Timeout | B never settles | after `SOURCE_TIMEOUT_MS` B counts as failed; outcome as above; warn logged | Logged, not thrown |
| Rejecting source | B rejects | counts as failed | Logged, not thrown |
| Breaker opens | B failed `BREAKER_FAILURES` lookups in a row | next lookups skip B (not called), B in `failed`, no caching | Warn once when it opens |
| Breaker cooldown over | `BREAKER_COOLDOWN_MS` passed | B is called again; an answer closes it, one more failure reopens it | No error expected |
| Cache expiry / bound | entry older than its TTL; more than `CACHE_SIZE` entries | expired entry is a miss; oldest entry evicted | No error expected |

</intent-contract>

## Code Map

- `src/lib/metadata/source.ts:44-62` -- `Source` contract; `lookupByIsbn` returns `Promise<SourceResult[]>` today. `SourcesOutcome` (lines 25-28) is the return type; unchanged.
- `src/lib/metadata/merge.ts:47` -- `mergeResults(lists, now)` reads only each list's first record; call it per candidate as `[[record], ...otherSourcesLists]` (design from 3.4). Returns `{ result, raw }`.
- `src/lib/metadata/sources/index.ts` -- `sources: readonly Source[]` = `[finna, google]`; the only list `lookupSources` reads.
- `src/lib/metadata/sources/finna.ts:265-268`, `google.ts:159-161` -- `if (!body) return []` is the failure branch (`fetchBody` resolves `undefined` only after a logged failure); becomes `return undefined`. Empty answers (`records` or `items` left out) already return the body and yield `[]`.
- `src/lib/metadata/sources/shared.ts:6` -- adapters' own fetch timeout `TIMEOUT_MS = 10_000`; stays as the socket backstop, the lookup budget lives in `lookup.ts`.
- `src/lib/processState.ts` -- `processState<T extends object>(key, init)`; keys namespaced, e.g. `'metadata.cache'`.
- `src/lib/errors.ts:35` -- `logger()` for warn lines (already used by `sources/shared.ts`).
- `tests/unit/finna.unit.spec.ts:341-350`, `tests/unit/google.unit.spec.ts:259-275` -- failure cases expect `[]`; become `undefined`. Empty-answer cases (`finna` 329-337, `google` 166-174) stay `[]`.
- `tests/unit/metadata.unit.spec.ts:40-44` -- fake `Source` style to copy.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/source.ts` -- `lookupByIsbn(isbn13: string): Promise<SourceResult[] | undefined>`; doc: `[]` means the source answered and has none, `undefined` means it failed (logged); still never throws -- the failure signal 3.5 and 3.7 left to this story.
- `src/lib/metadata/sources/finna.ts`, `src/lib/metadata/sources/google.ts` -- failure branch returns `undefined` instead of `[]` -- adapters report failure.
- `src/lib/metadata/lookup.ts` -- new. Exports `lookupSources(isbn13)`. Constants: `SOURCE_TIMEOUT_MS = 4_000`, `BREAKER_FAILURES = 3`, `BREAKER_COOLDOWN_MS = 60_000`, `CACHE_SIZE = 500`, `FOUND_TTL_MS = 24 h`, `NONE_TTL_MS = 10 min`. Cache `Map<isbn13, { outcome, expiresAt }>` under `'metadata.cache'` (hit moves the entry to the end; insert evicts the first key past `CACHE_SIZE`). Breaker `Map<SourceId, { failures, openUntil }>` under `'metadata.breaker'`: an answer deletes the entry; a failure increments and, at `failures >= BREAKER_FAILURES`, sets `openUntil = now + cooldown` (warn). Timer cleared after each race. -- the story.
- `tests/unit/finna.unit.spec.ts`, `tests/unit/google.unit.spec.ts` -- failure cases expect `undefined`.
- `tests/unit/lookup.unit.spec.ts` -- new. Fake sources via `vi.mock('@/lib/metadata/sources', …)` over a hoisted mutable array; clear both `processState` containers in `beforeEach`; fake timers for timeout, TTL and cooldown. Cover every matrix row.

**Acceptance Criteria:**
- Given fake sources, when `lookupSources` runs, then each matrix row's outcome, caching and breaker behaviour hold (`npm run test:unit`).
- Given the real `finna` and `google` adapters, when their fetch fails, then `lookupByIsbn` resolves `undefined`; when the source answers with no match, it resolves `[]`.
- Given the changed files, when lint and typecheck run, then both are clean.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 22 findings — high 0, medium 1, low 11, false 7, maybe-false 3
- findings:
  - `[medium]` `[patch]` verification-gap: the timeout test keeps A answering records, so a timeout resolved as `[]` (read as "answered, none") would still pass — the test now has the hung source as the only possible answer and asserts `unavailable` with `failed: ['B']`.
  - `[low]` `[reject]` edge: a cache hit returns the stored outcome by reference, so a mutating caller would corrupt it — nothing calls `lookupSources` yet and the planned readers (3.28, the save) only read; a copy or deep freeze per hit adds code for a caller nobody writes.
  - `[low]` `[reject]` edge: overlapping lookups of one ISBN both reach the sources and both count toward the breaker — one user, one scan at a time; the spec excludes in-flight de-duplication.
  - `[low]` `[reject]` edge: after a cooldown, concurrent lookups all probe the source instead of one — one user, rarely concurrent; a probe lock is state for an unseen case.
  - `[low]` `[reject]` edge: the 4 s budget does not abort the adapter's fetch, which runs to its own 10 s timeout — the user-facing wait is bounded; an `AbortSignal` in the contract changes every adapter for a background socket and an extra log line.
  - `[maybe-false]` `[defer]` edge: `found.raw` describes candidate 0, so a save of `pick > 0` could store the wrong `coverUrl` and first-source subjects — settled by how 3.53 builds the saved `rawMetadata`; Design Notes say it takes them from the candidate. If true, medium.
  - `[false]` `[reject]` edge: a source resolving `null` or a non-array would make `list.length` throw — the `Source` type forbids it and both adapters are typed; a rejection, the only breach a typed adapter can make, is handled.
  - `[maybe-false]` `[defer]` blind: `found` merged while a source failed is not cached (AC), so a save re-runs the lookup; if the failed source answers by then, `pick` indexes a different list — settled by how 3.35/3.53 validate a pick against the re-run. If true, medium.
  - `[low]` `[reject]` blind: cached outcomes returned by reference — same root as the edge finding above, same reason.
  - `[low]` `[reject]` blind: no cache bypass for `lookupAgain()` — that caller arrives in 5.35 and can add a bypass then; adding one now is an abstraction for later.
  - `[low]` `[reject]` blind: the timeout does not cancel the fetch (double warn, late success discarded, a 4–10 s source gets paused) — same root as the edge abort finding; a source slower than the budget is meant to count as failed under NFR-1.
  - `[low]` `[patch]` blind: a failure while the breaker is already open warns "paused" again and pushes `openUntil` forward — `track` now opens and warns only when the source is not currently open.
  - `[low]` `[reject]` blind: one ISBN whose response fails to parse, retried three times, pauses the source for every ISBN — the parse failures are whole-response shape errors, not ISBN-specific; per-ISBN counting adds state for a case not seen in the fixtures.
  - `[low]` `[defer]` blind: the spine (AD-9) and the epic context still say a source returns a list "empty for none" and that candidates come from "the first source that answered" — fix edits the binding architecture document, the owner's call.
  - `[low]` `[patch]` blind: the shared doc line "Neither method ever throws or rejects: a failure is logged" reads as if `search` also has the `undefined` signal — doc now says the signal is `lookupByIsbn`'s only.
  - `[low]` `[defer]` intent: the code's `Source` contract (`undefined` on failure) is stricter than the spine text — same root as the blind spine finding, same route.
  - `[false]` `[reject]` intent: the user-facing benefit is unreachable and no test runs `lookupSources` over real adapters — the AC asks for `lookupSources` in `lib/metadata` tested with fake sources; adapters' failure signal has its own tests; the caller is 3.28.
  - `[low]` `[reject]` intent: a timed-out source keeps fetching in the background — same root as the edge abort finding.
  - `[false]` `[reject]` intent: expiry times are additions beyond the AC — spine "Lookup tuning" (line 608) asks this story for cache lifetime, shorter for `none`.
  - `[maybe-false]` `[reject]` intent: half-open probe not serialised — same root as the edge cooldown finding; if true only low.
  - `[false]` `[reject]` intent: numbers not tuned against the fixtures — the AC says "may"; recorded fixtures carry no latency.
  - `[false]` `[reject]` intent: the cache key is not checked to be an ISBN-13 — AD-9 puts normalisation in `lookupBook`, the only caller.

## Design Notes

**Failure signal.** `undefined`, not a thrown error and not a wrapper object: the adapters' `fetchBody` and `lookupFailed` already end in `undefined` after logging, so the contract keeps "never throws, failures are logged" and adds one value. AD-9's wording ("a list, empty for none") still holds.

**`found.raw`.** `SourcesOutcome` carries one `RawMetadata`; it is the best candidate's. Every record's `raw` is the source's complete response, so `raw.sources` is the same for every candidate; only `coverUrl` and the first source's `subjects` differ, and both are on the candidate itself. A save of `pick > 0` (3.53) takes them from the candidate.

**Tuning.** 4 s per source leaves room inside NFR-1's 5 s scan-to-result. `none` lives 10 min, not 24 h: Google answered a spurious `200 totalItems: 0` during an outage all of 2026-10-11 (3.7 deferral), and a short `none` limits how long such an answer sticks. The breaker counts lookups, not requests; after the cooldown the first failure reopens it (half-open without extra state).

**Candidate build:**
```ts
const first = lists.findIndex((list) => list !== undefined && list.length > 0)
const others = lists.flatMap((list, i) => (i === first ? [] : [list ?? []]))
const merged = lists[first]!.map((record) => mergeResults([[record], ...others], now)!)
```

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including `lookup.unit.spec.ts`, `finna`, `google`, `metadata`
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary.** Added `lookupSources(isbn13)` in `src/lib/metadata/lookup.ts`. It asks every source in parallel, each with a 4 s budget. It builds one candidate per record of the first source with records, gap-filled through `mergeResults`, and returns `found | none | unavailable`. Two in-process stores hold its state, both through `processState`. The cache keeps up to 500 entries in LRU order, `found` for 24 h and `none` for 10 min, and stores an outcome only when no source failed. The circuit breaker is per source: it opens after 3 failed lookups in a row, skips the source for 60 s, and reopens on the first failure after the cooldown. The `Source` contract gained a failure signal: `lookupByIsbn` resolves `undefined` when the source failed (logged) and `[]` when it answered with no match. Finna and Google now use it.

**Files changed.**
- `src/lib/metadata/lookup.ts`: new. `lookupSources`, the cache, the breaker, and the tuning constants.
- `src/lib/metadata/source.ts`: `lookupByIsbn` returns `Promise<SourceResult[] | undefined>`. The doc comment covers the failure signal.
- `src/lib/metadata/sources/finna.ts`, `src/lib/metadata/sources/google.ts`: the failure branch returns `undefined`.
- `tests/unit/lookup.unit.spec.ts`: new, 18 tests. They cover every matrix row using fake sources and fake timers.
- `tests/unit/finna.unit.spec.ts`, `tests/unit/google.unit.spec.ts`: failure cases expect `undefined`. A small `lookup()` helper narrows the type on the happy paths.
- `tests/unit/metadata.unit.spec.ts`: its helper maps `undefined` to `[]` (needed for typecheck).
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 3.9 `done`.

**Review findings.** 22 findings, each with its own row in the Review Triage Log.
- **Patched (3):** medium, the timeout test now proves a hung source counts as failed. Low, the breaker opens and warns only when it is not already open. Low, the `source.ts` doc says the failure signal is `lookupByIsbn`'s only.
- **Deferred (3):** `found.raw` is candidate 0's when a later candidate is picked (3.53). A `pick` could shift after a re-run of an uncached partial `found` (3.35/3.53). The spine and epic context still describe the old contract.
- **Rejected:** cache returned by reference (blind and edge): no mutating caller exists. In-flight de-duplication: excluded by the spec. Half-open probe not serialised (edge and intent): one user. Fetch not aborted on timeout (edge, blind and intent): the wait is bounded and the fix is a contract change. No cache bypass for `lookupAgain`: belongs to 5.35. Per-ISBN breaker counting: parse failures are whole-response. Null from a source: the types forbid it. Unreachable user surface: the caller is 3.28. Expiry beyond the AC: the spine asks for it. Fixture tuning: the AC says "may". Cache key not normalised: `lookupBook`'s job.

**Follow-up review recommendation:** false. Patched high 0, medium 1, low 2.

**Verification.**
- `npm run test:unit`: 28 files, 471 tests pass. This run was after the patches.
- `npm run lint`: 0 errors. The 8 warnings are in old migrations.
- `npm run typecheck`: clean.
- Prettier: clean.
- Matrix audit: every row has a passing test.

**Residual risks.**
- A Google spurious `totalItems: 0` next to an empty Finna still gives `none` for 10 min. The short TTL limits it.
- A timed-out adapter fetch keeps running until the adapter's own 10 s timeout.
- No test covers the breaker-already-open race that the low patch fixed.

