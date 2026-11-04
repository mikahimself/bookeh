---
title: '9.19 [K36] Production Kirjasampo adapter verification'
type: 'chore'
created: '2026-11-04'
status: 'done'
baseline_revision: '26f66babab48891afd6685505ff4e3a59562bf6e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /Users/mika/development/bookeh/CLAUDE.md
  - /Users/mika/development/bookeh/_bmad-output/implementation-artifacts/epic-9-context.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Existing Kirjasampo tests exercise query generation, parsing and fixture adapters separately, leaving the production request wiring unverified (Epic 8 retrospective item 82).

**Approach:** Invoke the production adapter with fetch stubbed to a recorded successful response and a request failure, asserting the outgoing query and parsed enrichment.

## Boundaries & Constraints

**Always:** Use recorded fixtures without live external requests. Preserve existing non-Finnish no-request, query, parser and merge cases. Assert the expected request independently of the query helper so broken wiring cannot pass by comparing a helper with itself. Close retrospective item 82 only after focused verification.

**Never:** Change metadata contracts, expand enrichment scope, change screens, or fetch new fixtures. Production changes are needed only if the specified verification exposes a defect.

</intent-contract>

## Code Map

- `src/lib/metadata/sources/kirjasampo.ts` — production `kirjasampo.lookupByIsbn` POSTs URLSearchParams to the SPARQL endpoint, passes JSON through `kirjasampoResults`, and returns undefined on request failure. Read-only unless a defect is found.
- `tests/unit/kirjasampo.unit.spec.ts` — existing query/parser/merge/non-Finnish coverage; extend with production adapter cases. Restore fetch mocks reliably after each case.
- `tests/fixtures/kirjasampo/9789520408053.json` — recorded Finnish work `http://data.kirjasampo.fi/abstractWork_4149488`, title `Ei enää Eddy`, nine Finnish themes including `erilaisuus` and `köyhyys`. Reuse without modification.
- `src/lib/metadata/sources/shared.ts` — existing lookup failure logging contract; inspect as needed.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 9.19 and action item 82 tracking.
- `_bmad-output/implementation-artifacts/epic-8-retro-2026-11-04.md` — append dated item 82 closure preserving historical findings.

## Tasks & Acceptance

**Execution:**
- [x] `tests/unit/kirjasampo.unit.spec.ts` — add successful recorded-response production lookup test and request-failure test, restoring fetch stubs reliably.
- [x] Run focused tests and scoped lint; retain existing coverage.
- [x] Update sprint story/action item and retrospective after tests pass.

**Acceptance Criteria:**
- Given the recorded successful response for Finnish ISBN 9789520408053, when production `kirjasampo.lookupByIsbn` runs with fetch stubbed, then it sends one POST to the Kirjasampo endpoint with SPARQL accept and form content headers, a decoded query containing that ISBN and supported ISBN properties and Finnish field clauses, and returns the recorded work identity, title and Finnish themes.
- Given a rejected fetch request, when the production adapter runs for a Finnish ISBN, then it returns undefined rather than an empty source result.
- Given the extended suite, when focused tests run, then no live external requests occur and existing non-Finnish no-request and parser cases still pass.
- Given passing focused verification, when reviewing tracking, then story 9.19 and Epic 8 retrospective item 82 are marked done with dated evidence.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass
- verdicts: 10 findings — high 0, medium 0, low 0, false 10, maybe-false 0
- findings:
  - `[false]` `[reject]` Production test needs further ISBN variants — existing query test independently covers hyphenated ISBN-13, equivalent ISBN-10 and language forms; production test verifies the requested ISBN and query clauses. No lost form or wiring defect was demonstrated; another test is not required by the story.
  - `[false]` `[reject]` Missing HTTP-failure case — story explicitly accepts a request or HTTP failure; the rejected-fetch case verifies production failure returns undefined. No broken HTTP branch is shown.
  - `[false]` `[reject]` Missing invalid-JSON case — unchanged JSON decoding is inside the same catch as fetch rejection; story requests one request-failure case, not exhaustive transport failure coverage. No defect demonstrated.
  - `[false]` `[reject]` Missing authors/subjects/raw assertions — existing parser test asserts empty authors/subjects, and production code passes the unmodified parsed JSON to that parser, which retains raw. No metadata loss is shown; story names work identity and Finnish themes.
  - `[false]` `[reject]` Spec in-review differs from done tracking — transient review state required by the workflow; finalization sets the spec done before commit.
  - `[false]` `[reject]` Diff cannot prove every workflow step ran — process evidence is established by this parent run: rendered workflow, context compilation, planning, implementation, independent verification and four reviewers. A diff is not intended to contain tool history.
  - `[false]` `[reject]` Mocked boundary does not cover live endpoint or end-user flow — story explicitly requires recorded responses through production lookupByIsbn and no live requests. The tests exercise precisely that surface.
  - `[false]` `[reject]` Offline scope has no substantive mismatch — confirmed against Story 9.19 acceptance criteria; this is a positive observation, with no defect to patch.
  - `[false]` `[reject]` Context refresh describes separate preview feature — workflow required recompilation because the spine was newer; refreshed cached context accurately carries the completed 9.18 contract and adds no implementation scope.
  - `[false]` `[reject]` Intent auditor observes done/in-review discrepancy — required temporary workflow state, resolved in finalization before commit.

Edge-case reviewer returned no findings. Verification-gap reviewer found no gaps. Four review layers ran; the fourth started when a child slot became available, before triage, due to the platform limit of three concurrent child agents.

## Verification

- `npm run test:unit -- kirjasampo` — all focused cases pass, including production success/failure and existing cases.
- `npx eslint tests/unit/kirjasampo.unit.spec.ts` — no errors.
- `git diff --check` — no whitespace errors.

2026-11-04: All three checks passed; focused suite passed all 9 cases offline. Production adapter and recorded fixtures required no changes.

## Auto Run Result

Status: done. Added production Kirjasampo recorded-response success and rejected-request coverage. No production adapter or fixture changes were needed.

Files changed:
- `tests/unit/kirjasampo.unit.spec.ts` — independent request/query assertions, captured work/title/nine themes, failure result, reliable mock cleanup and network-blocking non-Finnish spy.
- `sprint-status.yaml` — story 9.19 and retrospective item 82 done with evidence.
- `epic-8-retro-2026-11-04.md` — dated item 82 closure preserving history.
- `epic-9-context.md` — workflow-required refresh after architecture changes from 9.18.
- This spec — plan, verification and review record.

Parent verification: `npm run test:unit -- kirjasampo` passed all 9 tests; scoped ESLint and `git diff --check` passed. No screen change, so no browser walk was required. Initial working tree was clean; metadata refresh required sandbox escalation and succeeded. Context refresh was generated by this workflow.

Review: 0 patches, 0 deferred items, 10 rejected observations with individual evidence in the triage log. Patched high/medium/low: 0/0/0. Follow-up review recommended: false. No known remaining story defect. Verification is intentionally offline and does not establish current live endpoint availability.
