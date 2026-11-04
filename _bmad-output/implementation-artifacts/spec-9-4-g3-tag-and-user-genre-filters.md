---
title: '9.4 G3 Tag and user-genre filters'
type: feature
created: '2026-11-04'
status: done
baseline_revision: 3472585c46e86f4fad254b6bf59359d4362961e7
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

**Problem:** Private tags and user genres cannot yet filter the shelf or appear in the Filter panel.

**Approach:** Extend the existing shelf address, matching, labels and counted options through the Filter panel. Preserve system genre URLs and distinguish private genre identifiers explicitly.

## Boundaries & Constraints

**Always:** Owner isolation includes admin. Match private labels through the viewer's user-books.tags and tags owner/kind. Fields combine with AND, values within a field with OR, including system and private genres together. Counts are distinct visible own copies with readable Books, include ordered copies, and are independent of active filters. Preserve numeric system genre IDs and existing URLs; encode private genre IDs as `tag:<positive-id>` in the genre field so independent ID spaces cannot collide. Keep same-name system and private genres as distinct choices, system genres first. Private ordinary tags have their own numeric tag field and option list. Update the architecture contract in this story. Both interface languages work.

**Never:** Add theme filters, tagging controls, Settings management, schema changes, permanent browser tests or mutate development data.

</intent-contract>

## Code Map

- `src/lib/shelf/query.ts` — ShelfQuery, FilterValues, URL parse/write; add GenreFilterId (number | `tag:${number}`), private tag field and typed counted genre choices while preserving numeric system ids.
- `src/lib/shelf/filters.ts` — relationFilters builds OR within genre, AND across fields; aliases b/ub are scoped by shelfIds; still explicitly scope private labels to viewer and kind.
- `src/lib/shelf/filterValues.ts`, `tagValues.ts` — system counted genres and existing grouped private copy counts; append private genre values and expose tag choices. Gateway operations sharing a transaction context run sequentially.
- `src/lib/shelf/labels.ts` — labels keyed field:id; resolve encoded genre and tag labels only for their owner and correct kind.
- `src/app/(frontend)/(sections)/FilterPanel.tsx`, `FilterChip.tsx`, `filterToggle.ts` — existing counted multi-select groups, chips and toggle types; extend for new genre representation and Tags group. Read these and related collection callers before changing.
- `messages/en.json`, `messages/fi.json` — existing filter interface translations, add Tags if absent.
- `tests/unit/shelfQuery.unit.spec.ts`, `filterPanel.unit.spec.ts`, related filter tests — existing URL and UI behavior coverage; adapt fixtures to extended shape.
- `tests/int/shelfFilters.int.spec.ts` — shelf matching/count/label service behavior; use existing builders from tests/helpers for private-label fixtures.
- `playwright.config.ts`, `tests/e2e/` — fixture e2e server and existing login/setup helpers for ignored `*.walk.spec.ts` acceptance walk.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` — update AD-7 and shared shelf shapes with genre encoding, tags, labels and counted options.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — progress and completion.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/shelf/query.ts`, `filters.ts`, `labels.ts` — extend address and matching/labels safely across both ID spaces.
- [x] `src/lib/shelf/filterValues.ts` and Filter panel/chips/locale files — expose counted options and working selection.
- [x] Shelf query unit and shelf filter integration tests — verify new behavior at existing service boundaries.
- [x] Architecture spine — record the changed contract.
- [x] Ignored browser walk, this spec and sprint status — verify actual screen and record results.

**Acceptance Criteria:**
- Given multiple own tags and user genres assigned through user-books, when the viewer selects any in the Filter panel, then matching copies appear, selections become URL filters and removable chips, and reload preserves them.
- Given system genres and private genre labels with equal numeric ids or names, when either is selected, then only its own assignments match; when both are selected, then their union matches, with no duplicated shelf rows. Given another filter field, when combined, then it intersects that union.
- Given used ordinary tags, system genres and user genres, duplicate and ordered copies, unused labels and wishlist-only assignments, when Filter options load, then only values on readable own copies appear with distinct copy counts, ordinary tags have their own list, and private genres follow sorted system genres as distinct choices.
- Given another user's labels and assignments, when filtering, resolving labels or listing options as user or admin, then foreign labels never appear or match via private state. Given wrong-kind or missing IDs, when supplied in the URL, then they cannot match a different classification kind or leak its name.
- Given valid, repeated and malformed tag/private-genre URL values, when parsing and serializing, then valid choices round-trip and deduplicate, malformed values are ignored, and existing numeric genre links continue to work.
- Given the changed shelf contract, when reviewing the spine, then it documents the same identifier encoding, counted values, owner restrictions and filter semantics as implementation.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass
- verdicts: 13 findings — high 0, medium 6, low 3, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind hunter: same-name system/private genres are indistinguishable — independent option keys do not distinguish displayed meaning; add localized personal-genre qualifiers in the panel and active chips.
  - `[low]` `[reject]` Blind hunter: rapid removal can restore a pending selection — links derive from the rendered address, consistent with existing filter chip navigation. Accumulating speculative multiple clicks requires new pending state and coordination; negligible ordinary-use impact does not justify that complexity.
  - `[medium]` `[patch]` Blind hunter: removal-link regression coverage absent — acceptance explicitly requires removal and persistence; add rendered mixed-selection link destinations preserving all unrelated query state.
  - `[medium]` `[patch]` Blind hunter: overlap union lacks duplicate-row coverage — add a Book with both system and private assignments and assert copy ids and total once each.
  - `[medium]` `[patch]` Blind hunter: foreign owner guard lacks independently isolating fixture — inject a test-only foreign relation into own state and assert matching, options and names stay private for user/admin.
  - `[medium]` `[patch]` Blind hunter: unreadable-Book exclusion unverified — add a held Book made private by another creator and verify private filter/count behavior by role under existing readability rules.
  - `[false]` `[reject]` Blind hunter: duplicate relationship rows need a count test — implementation already uses count(distinct copies.id), inherited from tagValues; assigning duplicates cannot alter that aggregate. A test restating this query expression names no uncovered failure beyond the existing distinct-copy acceptance coverage.
  - `[low]` `[reject]` Blind hunter: random fixture primary-key collision could flake — the fixture chooses from a 100-million-id interval outside ordinary sequence allocations, before creating references. Collision is negligible in everyday test use; allocation checks add complexity without a demonstrated failure.
  - `[medium]` `[patch]` Verification-gap: rendered removal URLs untested — same root cause as blind removal coverage; one component regression covers names and destinations for all three identifier forms.
  - `[false]` `[reject]` Intent auditor: diff cannot establish workflow execution — invocation uses the rendered workflow; execution evidence is in tool history, and source changes need not encode the orchestration itself.
  - `[low]` `[reject]` Intent auditor: retained tests cover services/components more directly than browser interactions — repository conventions explicitly use an ignored acceptance walk for this surface; it passed and its screenshot was inspected. Permanent browser coverage is reserved for scan-to-save and shop check.
  - `[false]` `[reject]` Intent auditor: walk and removable-link test absent from diff — walk is intentionally ignored and verified locally; the component regression is added under the separate accepted finding.
  - `[false]` `[reject]` Intent auditor: artifacts show an intermediate review state — this is the required state while review runs; finalization follows the review and sets done.

## Design Notes

`genre=42` continues to identify system genre 42; `genre=tag:42` identifies own kind-genre tag 42. This is an address/type contract change, not a database change. Ordinary `tag=42` only matches kind-tag label 42. Labels remain keyed `genre:tag:42` or `tag:42` respectively.

## Verification

**Commands:**
- `npm run typecheck` — passes.
- Focused unit tests for shelf query and filter behavior using the repository unit script — pass.
- Focused integration tests for shelf filtering and private-label options against bookeh_test — pass.
- Scoped ESLint for changed TypeScript and `git diff --check` — pass.
- One ignored `tests/e2e/*.walk.spec.ts` Playwright acceptance walk against configured fixture e2e server — tag and private-genre selections, chips, reload and results work; record observations.


**Implementation observations (2026-11-04):**
- Numeric system genre URLs remain intact; private genre values use `tag:<id>`, with ordinary tags in `tag`. Matching and names explicitly require owner and kind, including for admins.
- The panel offers counted Tags and private genres after system genres. Active genre/tag selections are removable links in the count line and persist across reloads.
- Focused unit suite: 68 tests passed across shelf query, Filter panel/toggle, collection count line and list. Focused integration suite: 14 tests passed across shelf filters and values, including deliberately equal system/private numeric ids and names, owner isolation for user/admin, wrong kinds, ordered duplicate copies and wishlist-only exclusion.
- Ignored `tests/e2e/tag-filters.walk.spec.ts`: Chromium fixture walk passed on configured port 3100 against `bookeh_test` (9.6 s). Selected a tag and private genre, observed both URL values and removable chips, two matching copy rows (owned and ordered), reload persistence, and removal restoring the other Book. Inspected `/private/tmp/bookeh-tag-filter-selected.png`: separate Genre and Tags groups show count 2 and active markers; the count line has both removal links and two results. The walk cleans its temporary fixture rows and remains ignored.
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run typecheck` passed; the cache override avoids a sandbox-denied default SWC cache. Scoped ESLint and `git diff --check` passed. Browser execution required escalation because the sandbox denied tsx's local IPC socket; the fixture server then ran successfully.
- No development data or schema changed. No incomplete implementation items; awaiting parent workflow review.


## Auto Run Result

Status: done

Implemented owner-isolated ordinary tag and private genre filtering throughout the shelf and Filter panel. Existing numeric system genre addresses remain valid; private genres use `tag:<id>`, with OR within genres and AND between fields. Counted options exclude unused and wishlist-only classifications. Private genres carry a localized qualifier so equal names stay distinguishable. Active classification chips remove one value while retaining the remaining address.

Files changed:
- `src/lib/shelf/query.ts`: genre identifier type, ordinary tag field, counted values and URL codec.
- `src/lib/shelf/filters.ts`: owner/kind-scoped tag matching and system/private genre union.
- `src/lib/shelf/filterValues.ts`, `labels.ts`: sequential counted option queries and scoped names.
- `src/app/(frontend)/(sections)/FilterPanel.tsx`, `CollectionList.tsx`: option lists, qualified private genres and removable chips.
- `FilterChip.tsx`, `filterToggle.ts`, `countLine.ts` in the same directory: extended typed filter values and active classification handling.
- `messages/en.json`, `messages/fi.json`: Tags and personal genre translations.
- `tests/int/shelfFilters.int.spec.ts`, `shelfValues.int.spec.ts`: matching, counts, collisions, overlap, privacy, readability and fixture shape.
- `tests/unit/shelfQuery.unit.spec.ts`, `filterPanel.unit.spec.ts`, `collectionList.unit.spec.ts`: URL round trips, distinct choices and removal destinations.
- Architecture spine: identifier, labels, options and privacy contract updated.
- This spec and sprint status: workflow evidence and done status.

Review: all four layers completed; the fourth waited for the platform's three-reviewer concurrency limit. Thirteen observations triaged individually above. Six medium finding rows produced five grouped patches: localized qualifiers, removal-link regression, overlapping union regression, inconsistent-owner fixture and readability fixture. No deferrals. Rejections and evidence are recorded in the Review Triage Log; the edge-case hunter reported no findings.

Follow-up review recommendation: false. More than two medium patches were applied, but each has focused regression coverage and the actual screen was walked again; no specific unverified risk remains from them. Patches by grouped verdict: high 0, medium 5, low 0.

Parent verification after patches:
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run typecheck`: passed.
- `npm run test:unit -- tests/unit/shelfQuery.unit.spec.ts tests/unit/filterPanel.unit.spec.ts tests/unit/filterToggle.unit.spec.ts tests/unit/collectionCountLine.unit.spec.ts tests/unit/collectionList.unit.spec.ts`: 69 passed.
- `npm run test:int -- tests/int/shelfFilters.int.spec.ts tests/int/shelfValues.int.spec.ts`: 14 passed on migrated bookeh_test.
- Scoped ESLint for all changed TypeScript: passed. `git diff --check HEAD`: passed.
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run test:e2e -- tests/e2e/tag-filters.walk.spec.ts --reporter=line`: passed in Chromium, 9.1 seconds, after patches. Selected tag and private genre, saw two matching owned/ordered copies, verified both chips and URL values survive reload, then removed them and saw the other Book return. Screenshot inspected; walk remains ignored and uncommitted.
- Integration/browser commands initially encountered sandbox-denied tsx IPC; approved escalation reruns passed. No application test failure remained.

Residual risks: rapid clicks on multiple removal links before navigation settles use the currently rendered address, consistent with existing link navigation; no pending-query coordination added. No schema changes, development data mutations or parallel worktrees. Browser verification covers the fixture Chromium surface; physical-device testing is outside this story.
