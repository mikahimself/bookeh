---
title: '8.14 [I15] Enrichment sources'
type: 'feature'
created: '2026-11-04'
baseline_revision: '1701a3e8c0d77e2b128d58153c95babbe252e8cf'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Work-level metadata can add themes and a description, but must never identify an edition or turn an otherwise missing lookup into a found Book.

**Approach:** Mark an optional `Source.enrichment` capability, ask those sources with the existing timeout and breaker, and restrict their contribution at merge time to ordered themes, a missing description, and raw provenance.

## Boundaries & Constraints

**Always:** Ordinary sources alone choose candidates and determine `none`, `unavailable`, `failed`, and cache lifetime. Enrichment sources run in parallel and failures are logged and tracked by their breaker. Their records contribute only themes, a missing description after all ordinary sources, and `raw.sources` under the source id. Theme union preserves ordinary terms first, then each new enrichment term as given, deduplicated without regard to case. Existing saved themes remain unchanged by re-fetch and Look it up again.

**Never:** No enrichment adapter, new endpoint, backfill job, schema migration, screen change, or genre mapping from enrichment subjects in this story.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Enrichment only | Ordinary sources answer `[]`; enrichment returns a record | `none`; no candidate | None |
| Ordinary outage | Ordinary source fails; enrichment returns a record | `unavailable` naming only ordinary source | Enrichment record cannot mask outage |
| Enrichment outage | Ordinary source finds a record; enrichment fails, rejects, or times out | Same candidate and `failed: []`; full found TTL | Warning and breaker tracking |
| Mixed merge | Ordinary terms `['Sota']`, enrichment `['sota', 'Ystävyys']` | `['Sota', 'Ystävyys']`; ordinary identity and fields retained | None |
| Saved themes | Book already has themes | Re-fetch and Look it up again preserve them | No backfill |

</intent-contract>

## Code Map

- `src/lib/metadata/source.ts` -- `Source` has no enrichment marker; `SourceResult` says themes are Finna-only.
- `src/lib/metadata/lookup.ts` -- `lookupSources` fans out with `ask`, `track`, breaker and cache; currently any nonempty source can choose candidates, and any failure enters `failed`.
- `src/lib/metadata/merge.ts` -- `mergeResults` takes best record per list, gap-fills all fields, and builds `RawMetadata`; it needs an explicit enrichment input so only allowed fields pass through.
- `src/lib/metadata/sources/index.ts` -- ordinary source order Finna, Google, optional Open Library, optional Hardcover; no new source is registered here.
- `src/lib/catalogue/refetchBook.ts` -- `fill('themes', ...)` only when stored themes are empty; `lookupAgain.ts` and `sharePrivateBook.ts` settle a source candidate without replacing existing shared data.
- `tests/unit/lookup.unit.spec.ts`, `tests/unit/metadata.unit.spec.ts` -- fake-source orchestration and merge tests; cover results, timeouts, breaker, TTL, provenance and order here.
- `tests/int/refetchBook.int.spec.ts`, `tests/int/lookupAgain.int.spec.ts` -- existing FR-19 behavior; extend only if current tests do not prove a saved nonempty theme list survives an enriched candidate.
- `_bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/prd.md` -- FR-11 and FR-17a still describe only ordinary lookup and Finna themes.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- AD-9, shared `Source` shape and `themes` comment need the contract in this same change.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 8.14 is backlog; mark done after review and verification.

## Tasks & Acceptance

**Execution:**

- `src/lib/metadata/source.ts`, `src/lib/metadata/lookup.ts` -- add `enrichment?: true`, separate ordinary outcomes from enrichment responses and failures while retaining timeout and breaker behavior.
- `src/lib/metadata/merge.ts` -- merge enrichment terms, missing description and raw response after ordinary sources; block every other enrichment field.
- `tests/unit/lookup.unit.spec.ts`, `tests/unit/metadata.unit.spec.ts` -- use fake sources to test the matrix, Finna-first priority, raw provenance, ordinary outcomes and TTL.
- `tests/int/refetchBook.int.spec.ts`, `tests/int/lookupAgain.int.spec.ts` -- verify existing themes survive when appropriate with an enriched result; keep focused coverage.
- `prd.md`, `ARCHITECTURE-SPINE.md` at the paths above -- update FR-11, FR-17a, AD-9, `Source`, and `SourceResult.themes` in the same change.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark story done after verification and review.

**Acceptance Criteria:**

- Given ordinary and enrichment fake sources, when ISBN lookup runs, then they are asked in parallel under the same per-source timeout and breaker, and only ordinary records create candidates.
- Given ordinary sources return no records, when enrichment answers or fails, then the lookup outcome is the same `none` or `unavailable` it would have been without enrichment, and only ordinary failures appear in `failed`.
- Given an ordinary candidate and enrichment result, when merged, then the ordinary source and record identity and all edition fields survive; themes are an ordered case-insensitive union, a missing description is filled after ordinary sources, and the enrichment response appears under its id in `raw.sources` without feeding `raw.subjects` genre mapping.
- Given enrichment fails or times out, when an ordinary result is found, then it is logged and tracked by the breaker but does not enter `failed`, change the partial line or shorten the cache TTL.
- Given a Book with nonempty themes, when re-fetch or Look it up again sees enriched themes, then FR-19 preserves the stored themes; an empty field can be filled and no backfill runs.
- Given the story lands, when the PRD and spine are read, then FR-11, FR-17a, AD-9, `Source`, and `SourceResult.themes` describe enrichment in the same commit.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass

- verdicts: 10 findings — high 0, medium 2, low 3, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Enrichment could produce a free-text search hit — `searchSources` now skips enrichment sources; a focused test covers the skip.
  - `[medium]` `[patch]` No successful enriched ISBN lookup test — added a found lookup test for themes, description, raw provenance, and exclusion of edition fields and subjects.
  - `[low]` `[patch]` Enrichment breaker cooldown lacked direct evidence — added a repeated-failure test proving the breaker skips enrichment while ordinary lookup continues.
  - `[low]` `[patch]` A later ordinary description was not tested against enrichment — added an ordinary-donor priority assertion.
  - `[false]` `[reject]` Later records from one enrichment source are ignored — the source contract returns records best first and `mergeResults` takes each source's best record, as it does for ordinary donors; multiple work records are not a union contract.
  - `[false]` `[reject]` Spec and sprint statuses differed during review — `in-review` was the required transient workflow state; the finalizer writes the completion record and `done` status.
  - `[low]` `[patch]` AD-9's first bullet still implied every source can establish a candidate or failure — revised its candidate, failure, cache, and search wording to name ordinary sources.
  - `[false]` `[reject]` No real enrichment adapter exercises the user surface — Story 8.14 establishes the contract; Story 8.15 explicitly adds Kirjasampo, and the current fake-source tests cover this story's behavior.
  - `[false]` `[reject]` No auto-run result was present in the in-review diff — the workflow writes that result at finalization, after review.
  - `[false]` `[reject]` The terse invocation could mean only a workflow run — the canonical Epic 8 story identifies the implementation and the selected BMAD workflow includes it.

## Verification

**Commands:**

- `npm run typecheck` -- TypeScript passes.
- `npm run test:unit -- --run tests/unit/lookup.unit.spec.ts tests/unit/metadata.unit.spec.ts` -- focused contract tests pass.
- `npm run test:int -- --run tests/int/refetchBook.int.spec.ts tests/int/lookupAgain.int.spec.ts` -- saved-theme behavior passes.
- `npm run lint` -- lint passes apart from existing warnings.

## Auto Run Result

**Status:** complete. Story 8.14 adds the enrichment-source contract to lookup and merge, preserves stored themes, and updates the PRD and spine.

**Review:** 2 medium and 3 low findings patched; 5 rejected with reasons recorded above; none deferred. Follow-up review recommended because two medium findings required patches. The contract is currently exercised with fake sources; Story 8.15 will add the first real enrichment adapter.

**Verification:** `npm run typecheck` passed; focused unit tests 34/34 passed; focused integration tests 22/22 passed; `npm run lint` passed with 60 existing migration warnings; changed TypeScript files were formatted with Prettier; `git diff --check` passed. No screen changed, so no Playwright walk applies.

**Files:** `source.ts`, `lookup.ts`, `merge.ts` add the contract and orchestration; `sharePrivateBook.ts` preserves themes on promotion; four test files cover lookup, merge, re-fetch and promotion; PRD, spine, Epic 8 context and sprint status record the change.
