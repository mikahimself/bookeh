---
title: '11.3 Rows and covers as icon buttons'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: '5122b9dea850ac3994017e0773282dbc212237c1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Collection layout is still a words-only switch, placed before Size and away from the count. Rows and covers should each be one recognisable icon button beside Size.

**Approach:** Reuse the Toggle Group supplied by 11.4 for an outlined rows/covers Icon switch, following the existing s/m/l Text switch on the count line at every width. Keep the device preference persistence and server-seeded first paint.

## Boundaries & Constraints

**Always:**
- Left to right: count line, s/m/l Text switch, rows/covers Icon switch. Preserve the count's active values, removable chips, Clear link and polite announcements. Allow a long count to wrap without pushing controls off screen. Currently reading stays above the count.
- Two 40px squares with a 4–6px gap, using `stroke-button` (2px) and `text` outlines. The chosen square uses `accent-fill` for both fill and outline, white `on-fill` icon, following current DESIGN.md → Icon switch. Inline line SVG icons; all colours and sizes use tokens declared in `styles.css`. Preserve the phone's minimum 44px tap height without enlarging the drawn squares.
- One shared Base UI Toggle Group wrapper under frontend `components/ui`; reuse the existing one. Exactly one option remains pressed, arrow keys move focus between options, Space/Enter select. Rows and Covers have English/Finnish accessible names using existing strings.
- Switching updates the list immediately and saves per device via the existing provider. Clicking the chosen option leaves it selected. Reload and first paint honour the saved cookie. A failed save uses existing rollback/toast behaviour. Switches remain available when the shelf read fails.
- All implementation and artifacts belong to the separate story worktree. Commit the completed story with a conventional commit, after verification/review.

**Never:** new committed tests, schema or service changes, a new preference mechanism, a second Base UI wrapper, changes to the reading switch, phone App bar or wide Filter/Select behaviour.

</intent-contract>

## Code Map

For this run, all paths and commands resolve from the worktree `/Users/mika/development/bookeh/.claude/worktrees/story-11-3-rows-and-covers-as-icon-buttons`, never the main checkout. Baseline is main after 11.2, and 11.4 is already included.

- `src/app/(frontend)/(sections)/CollectionTools.tsx` -- currently search + wide Filter/Select + App bar items, followed by Layout then Size Text switches. Remove display controls from this search row.
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- owns the live count, including narrowed values/chips/Clear; has access to the current shelf count and keeps Currently reading above it. Place display controls right of its count paragraph without changing count logic.
- `src/app/(frontend)/(sections)/CollectionDisplayControls.tsx` -- suggested new client component containing Size followed by the icon Toggle Group; share it between the live count row and the page's failed-read branch.
- `src/app/(frontend)/(sections)/page.tsx` -- currently renders CollectionTools outside ShelfRowsProvider, so controls work on failed read. Keep this property by mounting the display controls beside/above LoadFailed only in that branch. Avoid broadening ShelfRowsProvider or moving count logic into the server page.
- `src/app/(frontend)/(sections)/CollectionDisplay.tsx`, `src/app/(frontend)/components/useSavedSwitch.ts`, `src/app/(frontend)/prefs.ts` -- read-only reuse: cookie seeds the provider, layout/size save independently, failures roll back.
- `src/app/(frontend)/components/ui/ToggleGroup.tsx` -- existing generic single-choice wrapper and ToggleGroupItem. Item accepts `aria-label`; Base UI rejects deselecting the sole pressed item. Do not import Base UI into screens.
- `src/app/(frontend)/styles.css` -- declares stroke-button and on-fill, tap=44px, spacing scale through 28px. Add a named 40px icon-switch size token.
- `src/app/(frontend)/components/TextSwitch.tsx` -- reuse for size, unchanged.
- `messages/en.json`, `messages/fi.json` -- already have collection.layout, layouts.rows/covers, size, sizes.s/m/l. No new strings needed.
- `tests/helpers/collectionPage.ts:269` -- existing `pressed()` helper reads textContent; an icon-only button instead needs its accessible label. Adapt helper to prefer aria-label then textContent so existing behavioural tests remain valid; add no tests.
- `tests/unit/collectionPage.unit.spec.ts` -- existing first-paint, immediate switching, failed-save rollback and failed shelf tests must pass unchanged.
- `playwright.config.ts` -- fixture server on port 3100, bookeh_test and BOOKEH_SOURCES=fixture. It seeds fixed credentials from tests/e2e/account.ts. No listener was on 3100 during planning.
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` -- read before coding; this Next version's local guide is authoritative.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- already names Toggle Group after 11.4; no contract change expected.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/CollectionDisplayControls.tsx` -- implement size then icon layout controls using existing state and Toggle Group.
- `src/app/(frontend)/(sections)/CollectionTools.tsx` -- keep search, Filter, Select and App bar; remove old display switches and refresh comment.
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- put count and display controls in one responsive row, preserving count and Currently reading behaviour.
- `src/app/(frontend)/(sections)/page.tsx` -- retain display controls when shelf read fails.
- `src/app/(frontend)/styles.css` -- named square-size token.
- `tests/helpers/collectionPage.ts` -- adjust the existing pressed helper for icon accessible labels.
- `tests/e2e/layoutIcons.walk.spec.ts` -- uncommitted, ignored walk against fixture e2e server, recording screenshots and observations under Auto Run Result. Cover phone/desktop, both themes, switching and reload; also observe keyboard, selected click, first paint before hydration, empty/narrowed counts and Finnish labels where practical.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- sync 11.3 to in-progress during implementation; reviewer/root sets done when complete.

**Acceptance Criteria:**
- Given the collection at phone and desktop widths, when it renders, then the count line, s/m/l and rows/covers icon buttons appear left to right, and Currently reading remains above them when present.
- Given either theme, when the layout pair renders, then each drawn square is 40px with a 2px outline, the chosen square has accent-fill fill/outline and a white icon, and the other has text outline on the plain ground.
- Given a chosen layout, when its button is clicked again, then exactly one remains pressed; when arrow keys move between options and Space/Enter selects, then the named choice updates the visible list.
- Given a layout change, when the save completes and the page reloads, then the same layout is pressed and drawn on first paint; a failed save retains the existing rollback and toast behaviour.
- Given a failed shelf read or an empty/narrowed count, when the page renders, then display controls remain usable and do not overflow the viewport.
- Given either language, when the layout buttons are announced, then their accessible names are Rows/Covers or the existing Finnish translations.

## Spec Change Log

## Review Triage Log

### 2026-11-11 — Review pass
- verdicts: 13 findings — high 0, medium 0, low 3, false 10, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind 1: a long count becomes a tall narrow column at 320px — changed its flex basis from `flex-1` to `flex-auto`; short counts share the row, long counts take full width with switches below. The ignored walk checks this geometry.
  - `[false]` `[reject]` Blind 2: folding-section requirements were lost — only the generated overview was condensed. The exact order, summaries, closed state, row sizing and focus contract remain in unchanged Epic 11.5 and DESIGN/EXPERIENCE; the context compiler explicitly excludes individual story details.
  - `[false]` `[reject]` Blind 3: copy-action requirements were lost — exact ordering, capacity and placements remain in unchanged Epic 11.6 and UX sources. The regenerated epic overview is not a replacement for those story criteria.
  - `[false]` `[reject]` Blind 4: Copy picker requirements were lost — eligible summaries, immediate actions and Back/Cancel behaviour remain in unchanged Epic 11.7 and EXPERIENCE; omitting story-level detail follows the context compiler's instructions and changes no caller or product contract.
  - `[false]` `[reject]` Blind 5: Stats requirements were lost — unchanged Epic 11.8 and DESIGN still specify layout, gaps, type steps, markers and month labels. The cache describes the epic rather than duplicating a full future story spec.
  - `[false]` `[reject]` Blind 6: App bar inventory and rings were lost — unchanged Epic 11.2/11.6/11.9 and DESIGN retain the inventory and rings; the compiled overview also explicitly limits the bar to below 900px, preserving the wide-screen restriction.
  - `[low]` `[patch]` Blind 7: constrained panels, removable chips and Currently reading were not walked — expanded the ignored walk for both panels together, a real genre chip and removal, and Currently reading above the count on desktop and phone.
  - `[false]` `[reject]` Intent 1: isolation and workflow cannot be established from a unified diff — tool evidence establishes a new worktree and story branch at the full recorded baseline, and the exact skill renderer invocation succeeded. Diff format alone is not the workflow's evidence boundary.
  - `[false]` `[reject]` Intent 2: the reviewed snapshot is not finalized — in-review/in-progress are the required review-stage states; finalization changes them to done and creates the commit after review.
  - `[false]` `[reject]` Intent 3: the committed helper change does not verify visuals — the story explicitly requires no new committed tests and uses an ignored browser walk; that walk executed and its screenshots/measurements were inspected. Existing behavioural tests still cover preference changes and rollback.
  - `[false]` `[reject]` Intent 4: browser artifacts are absent from the diff — their omission is explicitly required. The ignored walk and artifacts exist locally and were independently inspected during this run.
  - `[false]` `[reject]` Intent 5: context regeneration exceeds story scope — the invoked workflow requires regeneration when any planning file is newer than the cache; DESIGN.md was newer. No authoritative planning requirement changed.
  - `[low]` `[patch]` Gap 1: failed-shelf control operability lacked direct verification — temporarily extended the existing failed-read case to select Covers and L, verify both save/pressed states and the retained load error; it passed (1 case, 16 skipped), then the test file was restored byte-for-byte to honour the story's no-tests requirement. This adds verification evidence without a committed regression guard.

## Design Notes

11.4 already provided the shared Toggle Group and updated the spine. Current DESIGN.md clarifies the chosen outline also uses accent-fill. Use the existing wrapper without changing its reading-control consumer. A separate display-controls component lets the count remain under ShelfRowsProvider and keeps controls available on load failure.

For local verification, the worktree initially has no dependencies or environment file. Reuse the main checkout's ignored .env privately and provision dependencies inside this worktree without exposing environment contents. Avoid changing the shared dependency tree or running tests against another worktree's server. The root will perform the full verification commands after implementation; the implementer should run focused checks and leave review/commit to the root.

## Verification

**Commands:**
- `npm run typecheck` -- no TypeScript errors.
- `npm run lint` -- no lint errors.
- `npm run test:unit` -- all existing unit tests pass.
- `npx playwright test tests/e2e/scanToSave.spec.ts tests/e2e/shopCheck.spec.ts tests/e2e/layoutIcons.walk.spec.ts --workers=1 --reporter=line` -- both committed flows and the uncommitted acceptance walk pass against this worktree's fixture server.

Inspect the walk's phone/desktop screenshots in both themes. Record evidence, limitations and files shared with parallel stories under Auto Run Result before completion.

## Auto Run Result

Implementation completed in the story worktree. Size now precedes the existing shared Toggle Group beside the live count; the failed-shelf branch mounts the same controls. Rows/Covers are named inline SVG icon buttons, with a 40px square token and separate 44px phone tap height. Count/chip/Clear logic and Currently reading stay in `CollectionList`; preference saving still uses the existing provider.

Focused verification: `npx vitest run --config ./vitest.config.mts --project unit tests/unit/collectionPage.unit.spec.ts` passed all 17 existing cases, including cookie-seeded display, immediate switching, rollback, failed shelf and Currently reading. The existing next-intl timezone fallback warning remains in the reading cases. Focused ESLint on changed TypeScript files and the ignored walk passed; `git diff --check` passed.

The ignored `tests/e2e/layoutIcons.walk.spec.ts` passed against this worktree's fixture server; the final combined browser run passed all three files in 26.1s. Reviewed screenshots and measurements in `test-results/layout-icons-walk/`: 390px and 1300px, rows and covers, light and dark; 40 × 40px drawn squares, 2px outlines, 44px phone tap height, 4px gap. Chosen fill and outline are rgb(209, 67, 47), icon white; unchosen outline/icon match each theme's text. Count, size and layout remain left to right. Reselect retains exactly one pressed; arrows move focus, Space/Enter select. Reload retains layout. At 320px, a long narrowed count wraps without horizontal overflow; Finnish labels work. The starting shelf was empty and retained controls.

First-paint verification blocked external application scripts while allowing Next's inline streaming reveal scripts: saved Covers and S were visible and pressed before hydration. Fully disabling JavaScript leaves Next's streamed collection in hidden containers; its server HTML nevertheless contains the correct pressed choice. This is a limitation of a no-JavaScript check, not a new client-only preference read.

Full verification: typecheck passed with `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-11-3-swc-cache` (the default cache location is outside the sandbox); lint passed with 0 errors and 68 existing migration warnings; all 1,400 unit tests in 104 files passed; committed scan-to-save and shop-check browser flows both passed. The walk needed corrections to its cookie decoding, visible-content selectors for Next's hidden cached DOM, and the no-matches paragraph selector; no product changes were needed after verification.

Shared files potentially touched by parallel stories: frontend `styles.css`, Collection tools/list/page, `tests/helpers/collectionPage.ts`, `sprint-status.yaml`, and the generated `epic-11-context.md` (the latter was already modified before this implementation and is unchanged by the implementer). The shared Toggle Group, Text switch, reading control, preferences and schema/services are unchanged. No committed tests added.


**Final verification after review patches.** Typecheck passed; lint passed (0 errors, 68 pre-existing migration warnings); all 1,400 unit tests in 104 files passed. The expanded ignored acceptance walk, scan-to-save and shop-check passed together (3 passed, 26.1s). `git diff --check` passed. A concurrent main-checkout test server briefly occupied port 3100; this run waited for it to exit, then started its own server with reuse disabled.

The expanded screenshots were inspected: Filter and Book detail together at 1200px retain the count and switches inside the list; a Fiction chip can be removed and Clear remains; Currently reading stays above the count on desktop and phone. The 320px long count now spans the full 280px content width, with controls beneath it and no viewport overflow.

**Files changed.**
- `src/app/(frontend)/(sections)/CollectionDisplayControls.tsx` — shared Size and icon Layout controls.
- `src/app/(frontend)/(sections)/CollectionTools.tsx` — search and Filter/Select remain; old display switches removed.
- `src/app/(frontend)/(sections)/CollectionList.tsx` — count and display controls share a row with content-aware wrapping.
- `src/app/(frontend)/(sections)/page.tsx` — controls remain on failed shelf reads.
- `src/app/(frontend)/styles.css` — named 40px Icon switch token.
- `tests/helpers/collectionPage.ts` — existing pressed helper reads icon accessible labels.
- `_bmad-output/implementation-artifacts/epic-11-context.md` — required refreshed overview from current planning sources.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 11.3 marked done.
- This spec — planning, review triage and verification evidence.

**Review outcome.** Three low findings addressed: long-count wrapping, additional panel/chip/reading browser observations, and direct failed-read operability verification. Ten findings rejected with individual reasons above. No deferrals. Follow-up review recommended: false (patched high 0, medium 0, low 3).

**Residual risks.** Browser evidence uses Chromium phone emulation and desktop, not physical devices. The failed-read assertions were temporary verification and are not a committed regression guard, as this story requires no tests. The file-sharing risks with parallel stories are listed above. No schema, service or shared UI primitive contract changed.
