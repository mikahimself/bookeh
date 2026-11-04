---
title: '9.18 [K35] Independent search and Answer cover previews'
type: 'bugfix'
created: '2026-11-04'
status: 'done'
baseline_revision: '04dae8ebd3902174043f0c1c6b8d64e0fe2e726c'
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

**Problem:** Search and indexed Answer previews share a per-user, per-ISBN record, so a search in another tab can replace the selected edition's cover and Answer lookup can replace the search cover.

**Approach:** Distinguish search and Answer preview contexts throughout recording, URL production and serving while retaining existing candidate indexing.

## Boundaries & Constraints

**Always:** Preserve authentication, user isolation, expiry, bounded record and byte storage, lookup limits and remote host restrictions. Only server-recorded URLs can be fetched. Preserve search order, visibility and result shapes. Update the architecture contract in the same commit. Run an ignored fixture-server browser walk and close retrospective item 81 only after verification.

**Never:** Accept a remote URL from a client, change metadata adapters or add permanent browser tests outside scan-to-save and shop check. Other Epic 9 stories are out of scope.

</intent-contract>

## Code Map

- `src/lib/catalogue/coverPreview.ts` — `keyOf`, `recordCoverPreview`, `fetchCoverPreview` currently share user:ISBN identity; introduce a typed context discriminator with Answer as backward-compatible default. Keep both contexts under the same caps.
- `src/lib/catalogue/searchBooks.ts:40` — record hits in search context.
- `src/lib/books/coverUrl.ts` — sole URL producer; extend preview input with typed context and serialize it only for search.
- `src/app/(frontend)/scan/find/lookupRows.ts:63` — source search-row preview URL must select search context. Saved own covers remain unchanged.
- `src/app/(frontend)/data/cover/[isbn13]/route.ts` — authenticate before parsing; select and validate context query parameter, retaining pick validation and response policy.
- `src/lib/catalogue/lookupBook.ts:145`, `lookupAgain.ts:89`, `src/app/(frontend)/scan/answer.ts` — Answer records and candidate URLs retain default Answer identity; inspect callers to confirm.
- `tests/int/coverPreview.int.spec.ts` — existing local image fixture and route/security/expiry/bounds coverage; add focused bidirectional collision behavior with distinguishable cover bytes and indexed candidates, including public route selection.
- `tests/unit/searchBooks.unit.spec.ts` — existing search preview retrieval must select search context; preserve its service coverage.
- `tests/e2e/`, `playwright.config.ts` — reuse fixture login and edition flow for ignored `*.walk.spec.ts`, isolated bookeh_test server.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` — update preview identity and route contract.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` and `epic-8-retro-2026-11-04.md` — mark 9.18/item 81 done after evidence; append dated closure preserving history.

## Tasks & Acceptance

**Execution:**
- [x] Update preview service, URL helper, search recorder and row producer, and route to distinguish search and Answer contexts.
- [x] Add focused bidirectional collision regression in `tests/int/coverPreview.int.spec.ts` and adapt affected existing tests.
- [x] Update architecture spine for identity and route.
- [x] Run ignored `tests/e2e/coverPreview.walk.spec.ts` against fixture server; record Lookup and edition Answer observations.
- [x] Update sprint tracking and retrospective after verification.

**Acceptance Criteria:**
- Given an open multi-candidate Answer and a search hit with the same user and ISBN, when search records its preview, then each indexed Answer preview retains its original cover and the search preview serves its own cover.
- Given a recorded search preview, when Answer candidates are recorded for the same ISBN, then the search preview still serves its own cover.
- Given a preview request, when its context is selected, then authentication, owner isolation, host validation, expiry and common storage caps still apply and no client URL can select a remote resource.
- Given the changed preview contract, when reviewing the architecture spine, then it documents the context identity and route parameter.
- Given fixture Lookup and an edition Answer, when walked in the browser, then rows and candidate covers request the appropriate preview context; tracking closes item 81 after verification.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass
- verdicts: 11 findings — high 0, medium 0, low 0, false 11, maybe-false 0
- findings:
  - `[false]` `[reject]` Collision test should prefetch held bytes — no cache corruption demonstrated: context keys isolate both records, and recording copies held bytes only from the same key. The browser walk additionally fetched Answer before search and search before Answer reload.
  - `[false]` `[reject]` Pending downloads might cross contexts — fetchAndHold receives the fully context-qualified key and looks up only that key on completion; it cannot populate the other context. Extra concurrency test does not guard a demonstrated missing boundary.
  - `[false]` `[reject]` Capacity test should assert both search eviction directions — mixed-context writes exceed the single PREVIEW_SIZE map and demonstrably evict the oldest Answer; search entries count identically with no separate branch or cap. Existing regression catches accidental separation of caps.
  - `[false]` `[reject]` Missing shared-byte-cap test — unchanged keepWithinBytes enumerates all values in the one map; contexts do not partition it. No changed or missing byte-bound enforcement was identified.
  - `[false]` `[reject]` Missing search-specific first-fetch rate tests — both contexts call the same unconditional limitLookups branch and per-user limiter, already covered by 429/no-request integration coverage. The discriminator only selects the record; no bypass exists.
  - `[false]` `[reject]` Missing search-specific expiry test — expiry is checked unconditionally after lookup by fully qualified key; existing lifetime regression covers deletion and no fetch. Context introduces no expiry branch.
  - `[false]` `[reject]` Sprint done while spec in-review — required transient workflow review state, resolved during finalization; final committed tracking and spec agree.
  - `[false]` `[reject]` Intent auditor cannot establish workflow completion from diff — review snapshot necessarily precedes completion. Parent executed implementation, independent verification, all four reviewers and finalization in this run.
  - `[false]` `[reject]` Permanent tests observe services/routes rather than cross-tab UI — the required ignored fixture browser walk additionally exercised the actual Lookup and Answer surfaces. Permanent browser expansion would conflict with repository test conventions.
  - `[false]` `[reject]` Browser walk absent from diff and uses one covered candidate — intentionally ignored by project rules. Parent ran and inspected it; the fixture second candidate has no cover. Three-image identity is established by the route-level collision test, with browser rendering/URL wiring checked separately and limitations recorded.
  - `[false]` `[reject]` Separate tabs within one context still share state — story 9.18 explicitly requires search-versus-indexed-Answer independence, not per-session identities. The broader reading originates from the auditor, not the story's acceptance criteria.

Edge-case reviewer: no findings. Verification-gap reviewer: no gaps. Review scheduling used three initial reviewers and started the fourth as soon as a slot opened, before triage, because this platform has three child slots.

## Verification

- `npm run test:unit -- searchBooks` — search service coverage passes.
- `npm run test:int -- coverPreview` — preview behavior and security coverage passes, including collisions.
- `npm run test:e2e -- tests/e2e/coverPreview.walk.spec.ts` — ignored fixture browser walk passes.
- `npm run typecheck` — no type errors.
- Run scoped ESLint on changed TypeScript files — no errors.

## Auto Run Result

Implemented, independently verified and reviewed. Story 9.18 and retrospective item 81 are done. The preview identity is user + ISBN + context, with Answer the default and search using `?context=search`. Both share the existing global record/byte caps.

Browser walk: Chromium fixture server, isolated bookeh_test, ISBN 9780007466061. Opened its two-edition Answer at pick=0 (the covered edition); verified loaded image bytes. In another tab, Lookup displayed an Elsewhere row whose search-context image loaded. Answer image request still returned 200 after search, and search image returned 200 after reloading Answer. Opening the search row reached Not in library. The fixture source has no search implementation, so the walk temporarily supplied a local hit from the same recorded fixture; that change was restored afterward. The second candidate has no fixture cover; distinct images for both indexed candidates are verified by integration tests. Initial walk failures were harness mistakes (sign-in navigation race and selecting the coverless candidate), corrected before the passing run. Walk file is ignored and uncommitted.

Files changed:
- `src/lib/catalogue/coverPreview.ts` — context-qualified identity within existing shared caches and limits.
- `src/lib/catalogue/searchBooks.ts` — record search previews in search context.
- `src/lib/books/coverUrl.ts` — typed context and search query parameter.
- `src/app/(frontend)/scan/find/lookupRows.ts` — select search context for source row covers.
- `src/app/(frontend)/data/cover/[isbn13]/route.ts` — validate context after authentication and serve matching record.
- `tests/int/coverPreview.int.spec.ts` — bidirectional indexed-cover collisions, context authentication/isolation and mixed-context record cap.
- `tests/unit/{searchBooks,lookupRows,lookupPage}.unit.spec.ts` — adapt existing expectations for search context.
- Architecture spine — document preview identity and route contracts.
- Sprint status and Epic 8 retrospective — close story/item with evidence.
- This spec — plan, verification and review record.

Parent verification passed: 34 affected unit tests (`npm run test:unit -- searchBooks lookupRows lookupPage`), 17 integration tests (`npm run test:int -- coverPreview`), Chromium ignored browser walk (1 passed, 10.2 seconds), `npm run typecheck`, scoped ESLint and diff whitespace check. Typecheck initially encountered sandbox denial of the installed SWC cache; elevated rerun passed. Integration and browser checks used the isolated migrated test database.

Review outcome: 0 patches, 0 deferred items, 11 rejected observations with individual evidence above. Patched high/medium/low: 0/0/0. Follow-up review recommended: false. No known remaining story defect. Preview state remains deliberately bounded and expiring, and identities distinguish search from Answer rather than individual tabs. Browser walkthrough requires the documented temporary local fixture search shim; it and the walk are not committed.
