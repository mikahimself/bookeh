---
title: '8.15 [I16] Kirjasampo enrichment'
type: 'feature'
created: '2026-11-04'
baseline_revision: 'eb647310c9a1c0e8745db5f78e48c5703bfab80c'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: []
deferred:
  - summary: >-
      Measure scan-to-Answer on Mika's phone over 4G against the deployed app with all five sources available.
    evidence: |-
      The localhost Chromium walk with all five sources reached the Answer in 2056 ms. It does not measure the deployed phone and 4G path required by NFR-1.
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Finnish fiction lacks Kirjasampo's work-level themes and descriptions beside the library's edition metadata.

**Approach:** Add a last-priority enrichment adapter for Finnish ISBNs, querying the public Kirjasampo SPARQL endpoint and passing only work-level themes and a Finnish description into the existing enrichment merge.

## Boundaries & Constraints

**Always:** Preserve Finna's edition identity, title, authors and publisher. Query exact ISBN literals for all hyphenations of ISBN-13 and equivalent ISBN-10, with Finnish, Swedish and untagged forms; return no result on ambiguous work matches. Use Finnish work labels and `teema` labels only. Capture live responses once; tests use fixtures. Measure scan-to-Answer latency again with all sources present.

**Never:** No enrichment search hits, candidate identity, edition fields, backfill, stripped-string SPARQL filter, or live requests in tests.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
| --- | --- | --- | --- |
| Non-Finnish ISBN | ISBN outside 978-951/952 | `[]` without request | None |
| One work | ISBN-13 or ISBN-10 with any stored hyphenation/tag | Finnish themes and optional description, work URI provenance | None |
| More than one work | Same ISBN matches distinct works | `[]` | Log ambiguity |
| Endpoint outage/malformed response | Request fails or answer unusable | `undefined` | Logged, ordinary lookup unaffected |

</intent-contract>

## Code Map

- `src/lib/metadata/sources/index.ts` -- register Kirjasampo after Hardcover; fixture mode substitutes `fixture` entirely.
- `src/lib/metadata/source.ts` -- `enrichment?: true` and `SourceResult` already support work-only enrichment; `lookup.ts` and `merge.ts` isolate it from edition identity and failures.
- `src/lib/metadata/sources/shared.ts` -- reuse `getJson`, `clean`, `lookupFailed`, guards and logger conventions.
- `src/fields/isbn.ts` -- ISBN conversion/check-digit logic; inspect before writing variant generation.
- `scripts/capture-fixtures.ts`, `tests/fixtures/isbns.txt`, `tests/fixtures/REPORT.md` -- add source capture and report rows, including ISBN-10 and X cases and a miss.
- `tests/unit/metadata.unit.spec.ts`, `tests/unit/kirjasampo.unit.spec.ts` -- adapter and capture behavior from recorded responses; keep live network out of tests.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- name Kirjasampo as the only enrichment source in AD-9.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark 8.15 done after review.

## Tasks & Acceptance

**Execution:**

- `src/lib/metadata/sources/kirjasampo.ts` -- build exact ISBN variants, one SELECT, parse Finnish work labels/themes/description, reject ambiguity and failures.
- `src/lib/metadata/sources/index.ts` -- register last as enrichment.
- `scripts/capture-fixtures.ts`, `tests/fixtures/isbns.txt` -- capture Kirjasampo responses and report coverage for ISBN-13, ISBN-10, X and miss.
- `tests/unit/kirjasampo.unit.spec.ts` -- exercise query variants, parsing, ambiguity, no-request gate and fixture pipeline.
- `ARCHITECTURE-SPINE.md` -- document the adapter and sole enrichment role.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- mark done after verification and review.

**Acceptance Criteria:**

- Given the first step, when implementation starts, then the dataset licence and endpoint terms are recorded in Design Notes and allow this use.
- Given a 978-951 or 978-952 ISBN, when lookup runs, then one SELECT matches every hyphenation of ISBN-13 and equivalent ISBN-10, including X check digit, as `@fi`, `@sv`, and plain literals against `schema:isbn` and `kaunokki:ISBN`; an out-of-prefix ISBN makes no request.
- Given one matched work, when parsed, then only Finnish `teema` labels become themes, Finnish `kuvaus` becomes description, the Finnish work label is contract title, lists for authors and subjects are empty, and recordId is its URI; multiple works answer `[]` with a log.
- Given a Finna-held Finnish ISBN, when Answer and save run against fixtures, then the saved Book keeps Finna edition fields and `books.source=finna`, with Kirjasampo's new themes joined to Finna themes.
- Given the source lands, when fixtures and spine are read, then four required cases are captured, tests consume fixtures only, and AD-9 names the only enrichment source.
- Given all sources are present, when scan-to-Answer is measured as in Story 8.2, then the result is recorded here and the source case meets the 5 second NFR-1 target, or the failure is reported explicitly.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Completion review

- `medium` patched — fixture mode used `source: fixture`, so the saved Book could not prove Finna provenance; it now keeps `finna` and the browser save asserts source, title, author, publisher, and both theme sets.
- `medium` patched — the captured X input was a miss, so the ISBN-10 X case lacked a matching-work proof; live SPARQL returned `951-578-963-X` for `9789515789631`, and the unit test asserts its captured work.
- `low` patched — production Compose did not forward `OPEN_LIBRARY_CONTACT`; it now passes the value to the app container.
- `low` patched — README lacked Kirjasampo credit; it now names the Finnish Public Libraries and SeCo and links CC BY 4.0.
- `medium` deferred — the phone-over-4G measurement against the deployed app remains owed; localhost Chromium and live-source timings are recorded below.
- Review was performed in this session. The four simultaneous review subagents required by the original unattended workflow were unavailable after its implementation agent hit a 429 retry limit; a separate follow-up review is recommended before the next story.

## Design Notes

**Licence and terms (checked 2026-11-04):** [Kirjasampo's dataset metadata](https://www.ldf.fi/dataset/kirjasampo/dataset.js) describes this endpoint's openly available subset with copyrighted back-cover synopses removed. Its blank `license` field renders as [CC BY 4.0 in LDF's page code](https://www.ldf.fi/js/functions.js); [LDF's publishing terms](https://www.ldf.fi/your-data/instructions.html) say the service is free of charge, as-is, without guarantees. [The 2025 research publication](https://asistdl.onlinelibrary.wiley.com/doi/10.1002/asi.24984) confirms the copyright-free public SPARQL subset is CC BY 4.0. Attribution to Kirjasampo / Finnish Public Libraries and SeCo should accompany the source; no endpoint rate allowance is promised.

## Verification

**Live latency (2026-11-04):** A fresh Kirjasampo lookup for `9789520408053` took 425 ms and returned one work with nine Finnish themes. After `OPEN_LIBRARY_CONTACT` was set, `sources/index.ts` listed all five sources and a fresh `lookupSources` call returned a Finna candidate in 838 ms (Google answered HTTP 503). A localhost desktop Chromium scan-to-Answer with all five live sources took **2056 ms**, within the 5 second source target; its Answer/save also persisted the Finna edition and Kirjasampo themes. A phone-over-4G measurement against the deployed app is still owed.

**Commands:**

- `npm run fixtures` -- capture source responses and regenerate the report.
- `npm run test:unit -- --run tests/unit/metadata.unit.spec.ts tests/unit/kirjasampo.unit.spec.ts` -- focused behavior passes without network.
- `npm run typecheck` and `npm run lint` -- pass.
- `npm run test:e2e -- tests/e2e/scanToSave.spec.ts tests/e2e/shopCheck.spec.ts tests/e2e/kirjasampo.spec.ts --workers=1` -- browser suite passes.
- `git diff --check` -- no whitespace errors.

## Auto Run Result

**Status:** done. The Kirjasampo adapter, source registration, captured responses, generated report, fixture enrichment path, tests, architecture note, production contact forwarding, and source credit are implemented. Sprint status is done.

**Verification:** `npm run fixtures` passed with 0 missing responses; 23 focused unit tests, typecheck, lint (60 existing migration warnings), and `git diff --check` passed. Three browser tests passed serially. The five-source localhost browser walk took 2056 ms; live configured-source lookup took 838 ms.

**Residual risks:** The deployed phone-over-4G check is owed. The live-source result is sensitive to upstream outages and latency; Google returned HTTP 503 during the fresh lookup. The original four-layer unattended review did not complete, so a follow-up review is recommended before the next story.

**Files:** `kirjasampo.ts` implements exact ISBN variants and SPARQL parsing; `index.ts` registers the source; `fixture.ts` serves captured Finna and Kirjasampo data in test mode; `capture-fixtures.ts`, `isbns.txt`, `REPORT.md`, and `kirjasampo/` record responses; unit and browser tests cover adapter, merge, Answer and save; the Epic 8 context, architecture spine, README and production Compose config document and enable the source.

## Owner verification — 2026-11-04

Mika confirms the deployed app met the scan-to-Answer targets on mobile over **4G**. Source result: **3.2 s** (target ≤5 s); held Book: **1.2 s** (target ≤2 s). This closes the phone/4G timing check recorded as owed above. Exact device/browser, deployed revision, ISBNs and cache state were not supplied. Source: Mika’s retrospective reply on 2026-11-04. Historical verification notes are retained.
