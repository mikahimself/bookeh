---
title: 'Story 1.20 [A26] Swiping between sections'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: 'a3a3d59ecd3ca12a1be59ae8b77b015de8a23b5b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** On the phone, the only way to change section is to tap a heading, and the clipped row hides most of them. A section change also swaps the screen at once, although EXPERIENCE.md (Motion) has the headings row and the content slide in the direction of travel. 1.19 left both to this story (UX-DR6, UX-DR54).

**Approach:** A client `SectionSwipe`, mounted in the `(sections)` layout, listens for single-finger touches under 900px. A clear sideways swipe pushes the next or previous section, wrapping round. Swipes that start near an edge are ignored, and so are swipes made while anything is registered through the new `useSuspendSwipe()`. Section changes, by swipe or by heading, carry a `section-next` or `section-prev` transition type. A `<ViewTransition>` around the headings row and the content turns that type into a sideways slide. Scan book and the toasts stay still.

## Boundaries & Constraints

**Always:**
- **Direction:** a swipe to the left (finger moves left) opens the next section in the fixed order; a swipe to the right opens the previous one. Both wrap: next after settings is collection, previous before collection is settings.
- **A swipe** is one finger from `touchstart` to `touchend`, with a horizontal travel `|dx| ≥ 48px` and `|dx| ≥ 2·|dy|`. There is no time limit. A second finger, or `touchcancel`, drops the gesture.
- **Ignored:** a start `clientX < 24` or `clientX > viewport width − 24`; a viewport of 900px or wider (`(width >= 900px)`, the `wide` breakpoint); any moment while a suspension is held. Suspension is checked at both the start and the end of the gesture.
- **History:** a swipe is `router.push(href, { transitionTypes: [type] })`, the same push as tapping a heading.
- **`useSuspendSwipe(active = true)`:** while a component calling it is mounted with `active` true, it holds one suspension and releases it on unmount or when `active` turns false. Holds are counted, so two holders need two releases, and a release is idempotent. This is module state, like `navigation.ts`, so it works from outside the `(sections)` layout too. `FullScreenTask` holds one, so every full-screen task suspends swiping without its story doing anything. The overlay wrappers (3.40, 3.41) will call the hook themselves.
- **Heading taps** also change section, so the three heading `<Link>`s carry `transitionTypes={['section-next']}`: every other heading sits to the right of the current one, so travel is always forward.
- **Slide:** in the `(sections)` layout, the header and the content sit in one wrapper inside `<ViewTransition update={{ 'section-next': 'section-next', 'section-prev': 'section-prev', default: 'none' }} default="none">`. Under `section-next`, the old snapshot leaves to the left (`translate` 0 → −100%) and the new one comes in from the right (100% → 0). Under `section-prev`, the reverse. The motion uses `--default-transition-duration` and `--default-transition-timing-function`, with `mix-blend-mode: normal`. The existing `::view-transition { pointer-events: none }` keeps input open, and the existing reduced-motion block makes the change immediate.
- **Still during a section slide:** while `section-next` or `section-prev` is active, the pinned Scan bar (`[data-pinned-bottom]`) and the toast region (`[data-toast-region]`, a new marker on the `role="status"` element) get their own `view-transition-name`s (`pinned-bottom`, `toast-region`). Their old and new snapshots do not animate, so they stay put above the sliding content. Outside those types they get no name, so the 1.19 task transitions are unchanged.
- The keyframe `task-slide` is renamed `slide-from-right` and shared by tasks and sections. `slide-to-left` (to `translate: -100% 0`) is added. The 1.19 task rules keep their behaviour.
- `ViewTransition` lives in a new `components/SectionTransition.tsx`, so the shell unit test can mock it: the installed `react@19.2.6` that Vitest uses does not export it.
- Tokens only. No inline styles, no literals in components; the 24px and 48px thresholds are named constants in `swipe.ts`.

**Never:**
- No browser Back or popstate animation: Back between sections changes the screen at once, as the 1.19 decision on Back did.
- No drag-follow (content tracking the finger), no momentum and no rubber-band. The section changes on `touchend`.
- No mouse or pen swipes, no `touch-action` or `preventDefault` changes: vertical scrolling stays native.
- No list sweep (an enhancement for the lists, not this story). No PWA manifest or `viewport-fit` (1.21).
- No new strings, no animation library, no Base UI.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Next | on loans, swipe from x 300 to x 100, dy 10, width 390 | wishlists, type `section-next` | — |
| Previous | on loans, swipe from x 100 to x 300 | collection, type `section-prev` | — |
| Wrap forward | on settings, swipe left | collection | — |
| Wrap back | on collection, swipe right | settings | — |
| Left edge | start x 23, width 390 | nothing | ignored |
| Right edge | start x 367 (390 − 23), width 390 | nothing | ignored |
| Just inside | start x 24, swipe left | next section | — |
| Too short | dx −47 | nothing | ignored |
| Too steep | dx −100, dy 51 | nothing | ignored |
| Wide | viewport 900px, swipe left | nothing | ignored |
| Suspended | one hold active | nothing | ignored |
| Holds counted | two holds, one released | still suspended | — |
| Second finger | a second `touchstart` mid-gesture | nothing | gesture dropped |

</intent-contract>

## Code Map

- `src/app/(frontend)/components/sections.ts` -- `SECTIONS`, `sectionOf`, `sectionRow`. Add `sectionAfter(current, step: 1 | -1)` with wrap-round.
- `src/app/(frontend)/components/navigation.ts` -- precedent for a `'use client'` module with module state (`loadedLength`) and a null-rendering component (`NavigationTracker`). Follow its shape for `swipe.ts`.
- `src/app/(frontend)/components/SectionNav.tsx:28-32` -- the heading `<Link>`s. Add `transitionTypes`. The live region (`aria-live`) stays mounted across changes and must stay outside any keyed remount.
- `src/app/(frontend)/(sections)/layout.tsx:32-46` -- the column: header, `flex-1` content, the pinned bar. Wrap header and content (not the bar) in one `flex flex-1 flex-col` element inside `SectionTransition`. Mount `<SectionSwipe />`.
- `src/app/(frontend)/components/FullScreenTask.tsx` -- add `useSuspendSwipe()`.
- `src/app/(frontend)/components/toast/ToastProvider.tsx:66-68` -- the `role="status"` region. Add `data-toast-region`.
- `src/app/(frontend)/styles.css:178-235` -- the view-transition block. Extend the still-snapshot rule (root) to `pinned-bottom` and `toast-region`, add the scoped names, the section slide rules and the keyframes. Update the block comment.
- `node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:14327,14371,19478` -- React starts a view transition only when a `<ViewTransition>` boundary has something to apply. With no boundary in the sections, a type alone does nothing, hence `SectionTransition`. Read-only.
- `node_modules/next/dist/client/components/app-router-instance.js:349` -- `router.push(href, { transitionTypes })` is supported. Read-only.
- `node_modules/@types/react/canary.d.ts:46-99` -- `ViewTransitionClassPerType` (a type-to-class map with a `default`) for `update`. Read-only; `src/react-canary.d.ts` already references it.
- `tests/unit/shell.unit.spec.ts:27-71` -- renders `SectionsLayout` and `FullScreenTask` with the installed React. Mock `SectionTransition` as a passthrough there.
- `tests/unit/styles.unit.spec.ts:162-200` -- pins the view-transition CSS, including the `task-slide` name. Update for the rename and extend.
- `tests/e2e/sections.e2e.spec.ts:20-75` -- `probeViewTransitions()`, `transitionOfType()` and the seeded user. Reuse them for the swipe spec.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/components/sections.ts` -- `sectionAfter()` -- wrap-round neighbour.
- `src/app/(frontend)/components/swipe.ts` -- NEW `'use client'`: `SWIPE_EDGE_PX = 24`, `SWIPE_MIN_PX = 48`; pure `swipeDirection(start, end, viewportWidth): 'next' | 'prev' | null`; `suspendSwipe(): () => void` (idempotent release) and `swipeSuspended()`; `useSuspendSwipe(active = true)`; `SectionSwipe` (renders null): passive `touchstart` / `touchend` / `touchcancel` listeners on `document`, applying the rules above, then `router.push` with the type.
- `src/app/(frontend)/components/SectionTransition.tsx` -- NEW: the `ViewTransition` with the `update` map around its children.
- `src/app/(frontend)/(sections)/layout.tsx` -- the wrapper and `SectionSwipe`.
- `src/app/(frontend)/components/SectionNav.tsx` -- `transitionTypes={['section-next']}` on the links.
- `src/app/(frontend)/components/FullScreenTask.tsx` -- `useSuspendSwipe()`.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- `data-toast-region`.
- `src/app/(frontend)/styles.css` -- the rename, `slide-to-left`, the section slide rules, the scoped names and the still snapshots.
- `tests/unit/sections.unit.spec.ts` -- `sectionAfter` both ways, with wrap.
- `tests/unit/swipe.unit.spec.ts` -- NEW: the matrix rows for `swipeDirection`, and suspension counting and idempotent release.
- `tests/unit/shell.unit.spec.ts` -- mock `SectionTransition`; the heading links still render; the toast region carries `data-toast-region`.
- `tests/unit/styles.unit.spec.ts` -- the rename; `@keyframes slide-to-left`; the four section slide selectors with their animations; the scoped `view-transition-name`s under `:active-view-transition-type(section-next, section-prev)`; the still `pinned-bottom` and `toast-region` snapshots.
- `tests/e2e/swipe.e2e.spec.ts` -- NEW: the ACs below, with `hasTouch` and real touches dispatched through CDP `Input.dispatchTouchEvent`, and its own seeded user.

**Acceptance Criteria:**
- Given a signed-in user on `/loans` at 390×844 with touch, when they swipe left across the middle of the screen, then the URL is `/wishlists`, the h1 is "Wishlists", the live region reads "Wishlists", and a view transition with the type `section-next` ran 200 ms animations on a `::view-transition-old(…)` and a `::view-transition-new(…)` other than `root`.
- Given `/`, when they swipe right, then the URL is `/settings`, through a `section-prev` transition. Given `/settings`, when they swipe left, then the URL is `/`. After a swipe, browser Back returns to the previous section.
- Given `/loans`, when a swipe starts 10px from the left edge, or 10px from the right edge, or travels mostly downwards, then the URL stays `/loans`.
- Given 1280×800 with touch, when they swipe left on `/loans`, then the URL stays `/loans`.
- Given reduced motion emulated, when they swipe left on `/loans`, then the URL is `/wishlists` and no `::view-transition` animation longer than 0 ms ran.
- Given `/` at 390×844, when the "loans" heading is tapped, then a `section-next` transition ran with 200 ms animations, and the Scan book bar had its own `pinned-bottom` snapshots, on which no animation ran.
- Given the 1.19 suite (`sections.e2e`), then it still passes, including the task-open and close slides.
- Given `npm run lint`, `npm run typecheck` and `npm run build`, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 26 findings — high 0, medium 0, low 21, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) From 900px the Scan book copy in the header sits inside the sliding boundary, so a heading click slides it, against the Intent's "Scan book and the toasts stay still". Patched: the wide copy carries `data-scan-book`, named `scan-book` only under the section types, with still snapshots; styles unit and a 1280px e2e assert it.
  - `[low]` `[reject]` (blind) Sideways drags inside inputs, sliders or horizontal scrollers would change section. No section has such an element today (Settings has only Sign out). The guard covers a state not yet reachable; 1.23's display-name field is the first place it matters (residual risk).
  - `[low]` `[reject]` (blind) `FullScreenTask`'s hold has no visible effect today (`/scan` sits outside `(sections)`), and the hook's effect is untested. The spec chose the hold so every task suspends without its story doing anything; the suspension decision itself is unit-tested through `swipeTarget` with a hold active. Testing the effect needs a DOM harness the unit lane lacks.
  - `[low]` `[reject]` (blind) A second swipe before the first push commits works from the stale pathname and repeats the same target. The window is one server round trip on the tailnet; a pending-navigation guard is added state for a case not demonstrated.
  - `[false]` `[reject]` (blind) The slide may land on the loading state. EXPERIENCE.md has a section show its heading at once with the progress line while it loads, which is what the new snapshot holds; the list sweep is a separate enhancement.
  - `[low]` `[reject]` (blind) `SWIPE_WIDE_PX` repeats the 900px breakpoint. `innerWidth` and the CSS `width` query both include the scrollbar, so they agree; the duplicate is one named constant, and tying it to the CSS token adds machinery for no observed drift.
  - `[low]` `[reject]` (blind) The listener's `touchcancel`, mid-gesture suspension and second-finger-lifts-first paths have no tests. The unit lane has no DOM; e2e covers the second-finger case. Rare paths, harness work beyond a correction.
  - `[low]` `[reject]` (blind) Unit tests share the module's hold count, so a failure between a hold and its release cascades. It only matters once a test already fails.
  - `[low]` `[reject]` (blind) The e2e hydration wait reads a React-internal fiber key, which does not prove the effect attached. 57/57 serial repeat runs passed; an effect-set marker adds test-only surface to the component.
  - `[low]` `[patch]` (blind) The heading-tap e2e asserts the `pinned-bottom` group but not `toast-region`. Patched: the same three assertions for `toast-region`.
  - `[low]` `[patch]` (blind) The section group's own morph keeps the browser's ~250 ms default when sizes differ. Patched: the `.section-next` / `.section-prev` groups use the motion tokens; pinned in styles unit.
  - `[low]` `[reject]` (edge) Drags inside inputs, sliders or horizontal scrollers. Same as the blind row; same reason.
  - `[low]` `[reject]` (edge) A one-finger pan while pinch-zoomed changes section. Rare in everyday use, and the fix is a new guard (`visualViewport.scale`); recorded as a residual risk.
  - `[low]` `[reject]` (edge) A winding drag is judged only on its end points. The spec sets no time limit by design; a scroll that returns to its start height and ends sideways is rare, and tracking the path is added machinery.
  - `[low]` `[reject]` (edge) A second swipe while the push is pending. Same as the blind row; same reason.
  - `[low]` `[patch]` (edge) A scrolled page makes the section group move vertically at a different duration. Same root cause as the group-morph row; same patch (the vertical part stays, in step with the slide).
  - `[low]` `[reject]` (edge) Hydration gap before the listener attaches. Same as the blind row; same reason.
  - `[low]` `[patch]` (edge) Wide-screen Scan book slides with the header. Same as the first row; same patch.
  - `[low]` `[patch]` (verification-gap) No test checks the slide's direction: a `section-prev` slide going the wrong way passes. Patched: the probe records `animationName` and play direction, and the e2e asserts `slide-to-left`/`slide-from-right` normal under `section-next` and reversed under `section-prev`.
  - `[low]` `[reject]` (intent) Suspension is tested only at module level, and its one consumer is outside the sections layout. Same as the blind suspension row.
  - `[low]` `[reject]` (intent) "A screen edge" could include the top and bottom. EXPERIENCE.md gives the reason as the device's back gesture, which starts at the sides; a sideways swipe starting in the top or bottom 24px is rare, and extending the rule changes the spec's chosen reading. Recorded as a residual risk.
  - `[low]` `[reject]` (intent) Only emulated Chromium is exercised. Safari and device testing need tooling the suite lacks (as in 1.19).
  - `[false]` `[reject]` (intent) "Doesn't block input" is untested. `::view-transition { pointer-events: none }` is unchanged from 1.19 and pinned by `styles.unit`.
  - `[false]` `[reject]` (intent) Heading taps also slide, beyond the swipe AC. The story cites UX-DR54, and EXPERIENCE.md Motion slides every section change; 1.19 deferred the section slide here. The keyframe rename and the shared test helper support it.
  - `[false]` `[reject]` (intent) The 48px, 2:1, decide-on-lift, both-way wrap and push parameters are not in the AC. They are the spec's design choices, not defects.
  - `[false]` `[reject]` (intent) `epic-1-context.md` changes on this branch with 1.21 content. It is the workflow's regenerated epic context, compiled from planning docs that already record those decisions.

## Design Notes

**Why a `<ViewTransition>` and not a hand-started transition.** React starts a view transition only when a boundary has something to apply. A type on a push into the sections does nothing on its own. Hand-starting one, as the X does, would need a promise that resolves on commit, which a push does not signal. An `update` boundary around the header and the content lets React snapshot both states, and the type picks the class. Under any other transition the map's `default: 'none'` keeps the boundary unnamed, so the task transitions from 1.19 are untouched.

```css
::view-transition-new(.section-next) { animation: slide-from-right var(--default-transition-duration) var(--default-transition-timing-function) both; }
::view-transition-old(.section-next) { animation: slide-to-left … both; }
::view-transition-new(.section-prev) { animation: slide-to-left … both reverse; }
::view-transition-old(.section-prev) { animation: slide-from-right … both reverse; }
```

**Why heading taps slide forward.** EXPERIENCE.md has every section change slide, not just swipes, and 1.19 deferred the section slide here. The row shows only the sections after the current one, wrapping round, so a tapped heading is always ahead.

**Why the gesture is judged at `touchend`.** Passive listeners leave scrolling alone, and nothing moves until the finger lifts. Following the finger would need `touch-action` and non-passive listeners that fight vertical scrolling, for an effect EXPERIENCE.md does not ask for.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including the new `swipe` cases and the updated `sections`, `shell` and `styles` cases.
- `npm run lint` and `npm run typecheck` -- expected: 0 errors.
- `npm run build` -- expected: success. This proves the new CSS survives Lightning CSS and that `ViewTransition` resolves in the layout.
- `npx playwright test tests/e2e/swipe.e2e.spec.ts tests/e2e/sections.e2e.spec.ts tests/e2e/frontend.e2e.spec.ts` -- expected: all pass against this worktree's own dev server. Confirm port 3000 is not served by another checkout first.

## Auto Run Result

Status: done

**Summary:** swiping between sections, and the section slide.
- **Swipe:** under 900px, a one-finger sideways swipe of at least 48px (and at least twice as far sideways as up or down) pushes the next section (finger left) or the previous one (finger right), wrapping round. It is judged on lift. Swipes starting within 24px of the left or right edge are ignored, and so is a second finger or a cancel.
- **Suspension:** `useSuspendSwipe(active)` holds a counted, idempotently released suspension. `FullScreenTask` holds one, so every task suspends swiping. The overlay wrappers (3.40, 3.41) call the hook themselves.
- **Slide:** a `<ViewTransition>` around the header and content turns `section-next` / `section-prev` into a 200 ms sideways slide in the direction of travel. Heading taps carry `section-next`. The phone Scan bar, the wide Scan book and the toast region keep still snapshots of their own. Input is never blocked, and reduce motion makes it immediate. Browser Back between sections stays immediate.

**Files changed:**
- `src/app/(frontend)/components/swipe.ts`: new. Thresholds, `swipeDirection`, `swipeTarget`, the suspension counter, `useSuspendSwipe`, and `SectionSwipe` (passive document touch listeners).
- `src/app/(frontend)/components/SectionTransition.tsx`: new. The `ViewTransition` with the type-to-class `update` map.
- `src/app/(frontend)/components/sections.ts`: `sectionAfter()` with wrap-round.
- `src/app/(frontend)/(sections)/layout.tsx`: header and content in the sliding wrapper; `SectionSwipe`; `data-scan-book` on the wide Scan book.
- `src/app/(frontend)/components/SectionNav.tsx`: heading links carry `section-next`.
- `src/app/(frontend)/components/FullScreenTask.tsx`: `useSuspendSwipe()`.
- `src/app/(frontend)/components/toast/ToastProvider.tsx`: `data-toast-region`.
- `src/app/(frontend)/styles.css`:
  - `task-slide` renamed to `slide-from-right`; `slide-to-left` added.
  - Section slide rules, plus the group timing on the motion tokens.
  - Scoped still names: `pinned-bottom`, `scan-book` and `toast-region`.
- Tests:
  - New: `tests/unit/swipe.unit.spec.ts`, `tests/e2e/swipe.e2e.spec.ts`, `tests/helpers/viewTransitions.ts` (probe shared with `sections.e2e`; it now records the keyframes name and direction).
  - Extended: `sections.unit`, `shell.unit`, `styles.unit`.

**Review findings (one pass, 26 findings):**
- **Patched (all low):**
  - The wide Scan book now stays still during a section slide.
  - The section group's morph uses the motion tokens.
  - The e2e asserts the slide's keyframes and direction for both types.
  - The e2e asserts the toast-region still snapshot.
  - Also before review, at verification: `swipeTarget` was extracted, so the suspension matrix row is unit-tested.
- **Rejected:**
  - Drags inside inputs or scrollers (none exist in sections yet).
  - The `FullScreenTask` hold has no visible effect today, and its effect is untested.
  - A swipe while a push is pending.
  - The breakpoint constant repeats the CSS token.
  - Listener paths without a DOM harness.
  - Shared hold state in unit tests.
  - The e2e hydration wait reads a React internal.
  - Pinch-zoom panning.
  - Winding drags.
  - Top and bottom edges.
  - Chromium-only motion evidence.
  - Five false findings: loading-state snapshot; non-blocking untested; heading-tap scope; unstated parameters; epic-context refresh.
- Reasons for each finding are in the Review Triage Log.
- **Deferred:** none.

**Follow-up review: not recommended (`false`).** The pass patched high 0, medium 0, low 4.

**Verification (final tree):**
- `npm run test:unit`: 460 passed.
- `npm run lint`: 0 errors; the 5 warnings are in untouched files.
- `npm run typecheck`: clean. `npm run build`: clean.
- `npx playwright test tests/e2e/swipe.e2e.spec.ts tests/e2e/sections.e2e.spec.ts tests/e2e/frontend.e2e.spec.ts` on this worktree's own dev server (port 3000 free): 26 passed.
- Matrix audit: every row has a test that ran and passed. Direction, edge, threshold, wide and suspension rows are in `swipe.unit` (`swipeDirection`, `swipeTarget`). Hold counting is in `swipe.unit`. The second finger is in `swipe.e2e`.

**Residual risks:**
- **Inputs.** A sideways drag inside a text field will change section. 1.23 (display name in Settings) should exclude form controls from the gesture.
- **Pinch zoom.** A one-finger pan while zoomed in can change section.
- **Top and bottom edges.** Only the side edges are excluded. A sideways swipe starting in the bottom 24px (the iOS home indicator) still counts.
- **Quick double swipe.** Two swipes before the first push commits go to the same section twice.
- **Motion verified only in Chromium.** View-transition types need Safari 18+.
- **Scrolled sections.** Once sections have long lists, a slide from a scrolled position also moves the snapshot vertically, in step with the slide.

**Rebased onto 1.21 (2026-10-10):**
- The branch was rebased onto main after 1.21 (installable PWA) merged.
- This run's own epic-context refresh was dropped in favour of main's recompiled `epic-1-context.md`.
- The feature commit applied cleanly. 1.21 sets `viewport-fit=cover`, so the 24px edge exclusion now measures from the physical screen edge, as intended.
- Re-verified on the rebased tree:
  - `npm run test:unit`: 478 passed.
  - lint: 0 errors.
  - typecheck and build: clean.
  - `npx playwright test` (all specs, including 1.21's `pwa.e2e`): 40 passed.
