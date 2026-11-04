---
title: '9.5 G13 Theme filter'
type: feature
created: '2026-11-04'
status: done
baseline_revision: 9166c67f98f538e4eb8c908f31ce18af71060b8e
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

**Problem:** The collection cannot yet filter by system themes or the viewer's private themes.

**Approach:** Add text-valued theme filtering to the existing shelf URL and query, expose used themes through the suggestion endpoint and Filter panel's combobox/short list, and show active themes in the count line.

## Boundaries & Constraints

**Always:** Theme values are strings, matching system Book themes exactly apart from case, without accent folding or substring matching. Private themes match viewer-owned kind-theme tags assigned through the viewer's user-books row by name. Values within theme OR together; theme ANDs with other fields. Suggestions include only themes on readable own copies, including ordered copies, independent of active filters, deduplicated case-insensitively, bounded to ten and sorted by name. Suggestion search treats wildcard characters literally, blank text returns none, authentication and route validation remain intact. System and private names share the same theme value; one value can match either. Preserve centralized URL parsing/writing, both languages and existing filter behavior. Record the extended suggestion contract in the architecture spine. Run and record an ignored fixture browser acceptance walk before done.

**Never:** Add schema changes, tagging controls, Settings management, Book detail classification (story 9.6), permanent browser tests, or mutate development data.

</intent-contract>

## Code Map

- `src/lib/shelf/query.ts` — ShelfQuery currently lacks theme; SUGGEST_FIELDS and Suggestion support author/series/publisher, with null id for text values. Add theme:string[] to URL parse/write and theme suggestions using null id.
- `src/lib/shelf/filters.ts` — relationFilters combines OR values with AND fields on b/ub/copies; add exact case-insensitive system/private theme EXISTS matching, respecting tag ownership/kind.
- `src/lib/shelf/suggest.ts` — visibleCopies/readableBy scope; add case-insensitively distinct system/private theme union with literal containsPattern, ten-result cap and null ids.
- `src/lib/shelf/systemThemes.ts` — existing books_texts path='themes', text column; reuse schema and visibility pattern. `src/fields/bookFields.ts` defines themes as hasMany text, not overridable.
- `src/app/(frontend)/data/suggest/route.ts` and `components/suggest.ts` — route field allowlist is centralized, existing hook debounces and rejects stale results. Read relevant installed Next.js route docs before editing.
- `src/app/(frontend)/(sections)/FilterPanel.tsx` — AddedValues already implements suggestion combobox plus selected short list; add theme and reuse string handling.
- `src/app/(frontend)/(sections)/filterToggle.ts`, `countLine.ts`, `CollectionList.tsx` — typed listed fields, active count values and existing removable classification chips; integrate theme names in active count without losing other address fields.
- `messages/en.json`, `messages/fi.json` — collection.filterFields; add Theme/Teema if needed.
- `tests/unit/shelfQuery.unit.spec.ts`, `filterPanel.unit.spec.ts`, `collectionCountLine.unit.spec.ts`, `suggestRoute.unit.spec.ts` — URL, selection/removal, count-line and endpoint behavior.
- `tests/int/shelfFilters.int.spec.ts`, `shelfValues.int.spec.ts` — real database matching, suggestions, privacy and literal wildcard checks; existing builders/harness support scoped fixtures.
- `playwright.config.ts`, `tests/e2e/tag-filters.walk.spec.ts` — configured fixture server on bookeh_test and ignored acceptance walk pattern.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` — existing theme:string[] contract; extend SuggestField, null-id comment, route and AD-7 suggestion semantics.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story progress/completion.

## Tasks & Acceptance

**Execution:**
- [x] Shelf query codec, matching and suggestion files above — add text-valued themes with exact matching and scoped suggestions.
- [x] Filter panel, toggle, count line and translations above — expose selection, short-list removal and active names.
- [x] Existing unit/integration suites above — verify named acceptance behaviors at functional boundaries.
- [x] Architecture spine — document extended suggestions and theme semantics.
- [x] Ignored `tests/e2e/theme-filter.walk.spec.ts`, this spec and sprint status — walk real fixture surface, record evidence and completion.

**Acceptance Criteria:**
- Given own copies with system themes and assigned private theme tags, when filtering by a theme name, then exact case-insensitive matches from either source appear, while substrings and accent variants do not; multiple themes OR together and another field intersects them without duplicating copies.
- Given duplicate and ordered copies, unused and wishlist-only labels, other users' assignments, wrong tag kinds and unreadable Books, when requesting theme suggestions, then only distinct used readable own system/private themes appear, case-insensitively deduplicated, ordered and capped at ten; foreign private labels stay hidden even for admins, blank input returns none and wildcards are literal.
- Given a signed-out request or invalid suggestion field, when calling the endpoint, then its existing authentication and validation behavior remains intact; theme is accepted for authenticated viewers.
- Given the Filter panel, when typing and selecting system and private themes, then suggestions come through `/data/suggest`, values enter the short list, matching copies and active count-line names update, and removal preserves unrelated filters/search/sort.
- Given active theme values in the URL, when reloading or parsing/serializing repeated parameters, then themes survive with distinct values and no open-Book or other filter regression; empty values do not add a filter.
- Given the extended suggestion contract, when inspecting the spine, then AD-7, shared types and endpoint table agree with the implementation.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass
- verdicts: 13 findings — high 0, medium 4, low 4, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: case-varied URL theme can be offered again — exact-value selection follows existing text-filter behavior; redundant equivalent values require manual case-varied URLs or changed source spelling. Their OR does not alter results. Adding theme-specific comparison branches for this negligible address edge case is not justified.
  - `[low]` `[reject]` Blind: case-varied URL values are not collapsed — valid strings round-trip with exact-value deduplication as other text fields do. Repeated equivalent case variants are cosmetic and require manually constructed input; a separate normalization contract and branches are not justified.
  - `[medium]` `[patch]` Blind: cross-source suggestion collision untested — add a system/private name collision and assert a single suggestion, guarding the explicitly shared theme-value contract.
  - `[medium]` `[patch]` Blind: overlapping assignments untested — assign the same name through both sources on a Book with multiple copies and assert rows/total once per copy (AD-7).
  - `[low]` `[patch]` Blind: sort assertion uses English locale — use explicit Finnish names and expected Finnish ordering instead of an English runtime collator.
  - `[medium]` `[patch]` Blind: theme navigation test omits open Book — include book in selection/removal expectations, covering the named address-preservation acceptance criterion.
  - `[false]` `[reject]` Blind: browser evidence is not durable — the tracked spec records actions, observations and outcomes. Temporary screenshots and ignored walks are intentionally uncommitted under project conventions; permanent visual artifacts are not required.
  - `[low]` `[patch]` Blind: compiled epic summary omitted prior constraints — restored the factual cover-context counting and schema-initialization statements in the generated planning summary. The authoritative spine retains both rules; no implementation rule changes.
  - `[medium]` `[patch]` Verification gap: ordered-copy test is supplied by an owned duplicate — add ordered-only system/private theme fixtures and assert both suggestion names.
  - `[false]` `[reject]` Intent: diff cannot prove workflow invocation — the tool history establishes invocation and rendered-step execution; encoding execution machinery into the product diff is not required.
  - `[false]` `[reject]` Intent: screen expectations exercised in separate retained layers — permanent unit/integration tests plus the required ignored real-browser acceptance walk meet repository conventions; the latter verifies integrated behavior.
  - `[false]` `[reject]` Intent: integrated browser walk absent from diff — intentional per the repository's Tests convention; parent reran it successfully and inspected the selected-state screenshot.
  - `[false]` `[reject]` Intent: completion still shows review — this is the required intermediate state while review runs; finalization below sets spec/sprint done and commits the reviewed result.

## Verification

**Commands:**
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run typecheck` — passes.
- `npm run test:unit -- tests/unit/shelfQuery.unit.spec.ts tests/unit/filterPanel.unit.spec.ts tests/unit/filterToggle.unit.spec.ts tests/unit/collectionCountLine.unit.spec.ts tests/unit/collectionList.unit.spec.ts tests/unit/suggestRoute.unit.spec.ts tests/unit/suggest.unit.spec.ts` — passes.
- `npm run test:int -- tests/int/shelfFilters.int.spec.ts tests/int/shelfValues.int.spec.ts` — passes against migrated bookeh_test.
- Scoped ESLint for changed TypeScript and `git diff --check` — passes.
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run test:e2e -- tests/e2e/theme-filter.walk.spec.ts --reporter=line` — ignored fixture acceptance walk passes and observations are recorded.


**Acceptance walk observations (2026-11-04):**
- Ignored `tests/e2e/theme-filter.walk.spec.ts` passed on Chromium against the configured fixture server on port 3100 and migrated `bookeh_test` (1 test, 9.9 seconds).
- Typed system and private theme searches through `/data/suggest` (200), selected both null-id names, and saw both short-list entries and count-line names. The two copies of the classified Book, including its ordered copy, remained visible; the unrelated Book disappeared.
- Reload retained both URL theme values, count-line names and matching copies. Removing each short-list entry retained `q=Theme`, `sort=title`, and `dir=desc`; removing the last theme restored the unrelated Book.
- Screenshots: `/private/tmp/bookeh-theme-filter-selected.png` and `/private/tmp/bookeh-theme-filter-removed.png`. The fixture inserts and cleanup used only asserted `bookeh_test`; development data was not modified. The walk remains ignored, not a permanent browser test.
- Targeted unit suites: 80 tests passed. Targeted integration suites: 19 tests passed, including user/admin private-label isolation, wrong kinds, malformed foreign assignments, unreadable Books, literal wildcard search, case-insensitive deduplication, exact theme matching without accent folding, OR/AND behavior and the ten-result bound.

**Residual risks:** Case-varied manually supplied theme values may appear separately in the short list; matching remains correct. Physical-device checks were not part of this fixture Chromium walk.


## Auto Run Result

Status: done

Implemented text-valued theme filters across the shelf URL, matching, suggestions and Filter panel. A name matches system themes or the viewer's assigned private themes exactly apart from case, without accent folding. Suggestions use readable own copies and retain private owner/kind checks for admins. Active names appear in the count line; selection and removal preserve the remaining address.

Files changed:
- `src/lib/shelf/query.ts`: theme codec and suggestion allowlist.
- `src/lib/shelf/filters.ts`: exact system/private theme union with owner checks.
- `src/lib/shelf/suggest.ts`: bounded, case-insensitively distinct theme suggestions.
- `src/app/(frontend)/data/suggest/route.ts`: extended route contract comment; centralized allowlist admits theme.
- `src/app/(frontend)/(sections)/FilterPanel.tsx`, `filterToggle.ts`, `countLine.ts`: theme combobox, short list, toggling and active names.
- `messages/en.json`, `messages/fi.json`: Theme/Teema labels.
- `tests/int/shelfFilters.int.spec.ts`, `shelfValues.int.spec.ts`: matching, privacy, suggestions, overlap, ordered-only and Finnish sorting checks.
- `tests/unit/shelfQuery.unit.spec.ts`, `filterPanel.unit.spec.ts`, `collectionCountLine.unit.spec.ts`, `suggestRoute.unit.spec.ts`: codec, navigation, active names and endpoint checks.
- Architecture spine: suggestion types, route and AD-7 contract.
- Epic context, this spec and sprint status: refreshed planning context, verification/review evidence and completion.

All four review layers completed; the fourth started after the platform's three-reviewer limit freed a slot. Thirteen observations were individually triaged above: six patches (medium 4, low 2), no deferred findings, two negligible case-variant address findings rejected, and five false findings rejected with evidence. The edge-case hunter reported no findings. Patches strengthen coverage and restore two statements in the compiled planning summary; no production behavior changed during review.

Follow-up review recommendation: false. Although four medium coverage patches were applied, all passed focused regression verification and the actual browser flow was rerun. No specific unverified implementation risk remains.

Parent verification after patches:
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run typecheck`: passed.
- All seven unit suites listed in Verification: 80 tests passed.
- Both integration suites listed in Verification: 19 tests passed on migrated bookeh_test.
- Scoped ESLint across all changed TypeScript and `git diff --check HEAD`: passed.
- Ignored fixture Chromium acceptance walk: passed, 1 test, 10.4 seconds. System/private suggestions, two matching owned/ordered copies, committed URL values, count line, reload and removal preserving search/sort/direction verified. Selected-state screenshot inspected.
- Sandbox restrictions on Git metadata and local test IPC were handled through approved escalated commands. No development data or schema changed.

Residual risks: manually supplied case variants can be listed separately although their result union is correct. Browser evidence covers fixture Chromium; physical devices are outside this story. No parallel worktrees or shared-file conflicts.
