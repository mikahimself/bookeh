---
title: '9.17 [K34] Sequential own-search hydration'
type: 'bugfix'
created: '2026-11-04'
status: 'done'
baseline_revision: 'e2b7f8b6aa9a6f880580c991be1a6689b29bbed1'
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

**Problem:** Own-library search hydrates effective Books and holdings concurrently on a shared Payload context, violating the shared-context serialization contract identified by Epic 8 retrospective X1/item 80.

**Approach:** Await effective Books before starting holdings hydration. Preserve own-search results and verify the real own-title search navigation before closing item 80.

## Boundaries & Constraints

**Always:** Preserve visibility, deduplication, ordering and the 20-Book result limit. Keep both hydration calls on the supplied context and serialize them. Verify existing integration coverage and an uncommitted fixture-server browser walk.

**Never:** Change search SQL, public APIs, preview identity, metadata adapters or other Epic 9 stories. Commit browser walkthrough files or introduce permanent Playwright coverage outside the spine's allowed flows.

</intent-contract>

## Code Map

- `src/lib/shelf/searchMine.ts:42` — own-search service; the Promise.all at hydration is the defect. Replace it with two sequential awaits, retaining id order and result assembly.
- `src/lib/books/effectiveBook.ts` and `src/lib/books/holdings.ts` — existing readers; reuse without changes.
- `tests/int/searchMine.int.spec.ts` — six existing database cases cover holdings, effective values, privacy, closed entries, ordering and limit.
- `tests/unit/` — add one focused serialization regression using a deferred hydration promise; test that holdings does not begin while effective Books remain pending, rather than merely asserting a mocked call order. This guards AD-16 and the explicit story criterion.
- `tests/e2e/shopCheck.spec.ts`, `tests/e2e/account.ts`, `tests/e2e/seed.ts` — reuse login, fixture ISBN and save flow for the uncommitted walk.
- `src/app/(frontend)/scan/find/page.tsx` — own-title search page; read to locate result controls; no UI change required.
- `playwright.config.ts` — port 3100 fixture server, isolated `bookeh_test`, push disabled. Run the walk via this config.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 9.17 and retrospective item 80. Mark done only after verification; epic 9 becomes in-progress.
- `_bmad-output/implementation-artifacts/epic-8-retro-2026-11-04.md` — historical record; append a dated item-80 closure without rewriting history.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/shelf/searchMine.ts` — serialize hydration with an explanatory shared-context comment.
- [x] `tests/unit/searchMine.unit.spec.ts` — add one deferred-promise regression for the serialization rule.
- [x] `tests/e2e/searchMine.walk.spec.ts` (ignored, uncommitted) — login, save a fixture Book, search its title, open its own result, inspect held Answer and use Back; record observations below.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and `epic-8-retro-2026-11-04.md` — close item 80 after checks; update story and epic status.

**Acceptance Criteria:**
- Given matching Book ids, when `searchMine` hydrates them, then effective Books completes before holdings starts on the same context.
- Given the existing own-search integration cases, when they run, then visibility, deduplication, effective values, ordering and limits still pass.
- Given a held fixture Book, when its title is searched in the browser, then opening its own result displays the held Answer with its location, and Back returns to the search results.
- Given implementation and verification have passed, when tracking is updated, then story 9.17 and retrospective item 80 are done and the retrospective records the evidence.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass
- verdicts: 5 findings — high 0, medium 0, low 0, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` Spec status differs from done tracking — in-review was the required transient workflow status during review; finalization now sets done.
  - `[false]` `[reject]` Empty unit hydration maps leave assembly unverified — existing integration case “finds a copy, an entry-only Book and one held both ways” asserts returned Books and both holding types. All six integration cases passed again in parent verification; assembly is unchanged.
  - `[false]` `[reject]` Missing rejected-read unit case — no failing behavior demonstrated; the first awaited rejection propagates before the second call can execute. Additional test-only coverage is unnecessary under repository conventions.
  - `[false]` `[reject]` Missing pending-holdings unit case — holdings is explicitly awaited and its map is consumed immediately afterward; no missing asynchronous boundary exists in the implementation.
  - `[false]` `[reject]` Single-row unit case leaves deduplication/order unverified — existing integration cases cover the held-both-ways single row and author/title ordering and limit. SQL, id deduplication and assembly are unchanged.
- Edge-case hunter returned no findings; verification-gap reviewer found no gaps. Intent auditor found no functional scope divergence. Its evidence limits are addressed by parent execution of all five verification commands and inspection of the ignored walk.
- Review scheduling: three reviewers launched first due to the platform's three-child concurrency limit; the fourth launched as soon as a slot became available, before any result was triaged.

## Verification

**Commands:**
- `npm run test:unit -- searchMine` — serialization regression passes.
- `npm run test:int -- searchMine` — all own-search integration cases pass against migrated test database.
- `npm run test:e2e -- tests/e2e/searchMine.walk.spec.ts` — ignored browser walk passes against fixture server.
- `npm run typecheck` — no type errors.
- `npx eslint src/lib/shelf/searchMine.ts tests/unit/searchMine.unit.spec.ts` — no lint errors.

**Results (2026-11-04):** All commands above passed: 1 focused unit test, all 6 existing integration cases against migrated `bookeh_test`, 1 Chromium browser walk, typecheck and scoped ESLint. Temporarily restoring concurrent hydration made the regression fail while effective Books remained pending; sequential hydration was restored and the unit test passed again.

**Browser observations:** Signed in and saved fixture ISBN `9789523520660` (Lihan loppu) to E2E shelf. Searched `Lihan loppu` through the title field; the In your library group contained one own result. Opening it reached `/scan?book=<id>`, displayed In library and `E2E shelf · owned`; Back returned to `/scan/find?q=Lihan%20loppu` with the text and result retained. The walk used the configured fixture server on port 3100, isolated `bookeh_test`, and push disabled. Its file stays ignored and uncommitted. Initial sandbox execution hit tsx IPC `listen EPERM`; the approved escalated run passed.

## Auto Run Result

Implemented and verified. Story 9.17 and retrospective item 80 are done; Epic 9 is in progress.

Files changed:
- `src/lib/shelf/searchMine.ts` — serialize effective Books and holdings hydration on the shared context.
- `tests/unit/searchMine.unit.spec.ts` — deferred-promise serialization regression.
- `sprint-status.yaml` — story/item closure and epic status.
- `epic-8-retro-2026-11-04.md` — dated item-80 closure and verification evidence.
- `epic-9-context.md` — generated epic planning context.
- This spec — intent, acceptance, verification and review record.

Parent verification independently passed all five commands: focused unit (1 test), integration (6 tests), Chromium fixture browser walk (1 test, 9.2 seconds), typecheck and scoped ESLint. The ignored walk was inspected and remains uncommitted. The implementer also confirmed the regression fails with the original concurrent implementation.

Review: 0 patches, 0 deferred items, 5 rejected findings with individual reasons above. Patched counts: high 0, medium 0, low 0. Follow-up review recommended: false. No remaining implementation work or known residual risk within this story. The retrospective retains earlier open-item statements as historical entries, with the new dated closure recording the current outcome.
