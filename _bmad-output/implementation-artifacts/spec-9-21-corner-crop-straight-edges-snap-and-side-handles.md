---
title: 'Corner crop shows straight edges, snaps to them and has larger handles and side handles'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_revision: 'b455fe4f8ee70468bcaef049ab9976a14ebeae23'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/.working/corner-crop-snap.html'
warnings: []
deferred:
  - summary: >-
      tests/unit/loansPage.unit.spec.ts and tests/unit/bookDetailCopyLine.unit.spec.ts fail (3 tests, "Cannot read properties of undefined (reading 'payload')").
    evidence: |-
      Both fail identically on a clean checkout of the baseline revision (b455fe4), so this story did not cause them.
    location: >-
      tests/unit/loansPage.unit.spec.ts, tests/unit/bookDetailCopyLine.unit.spec.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The Corner crop gives no sign that a side of the quadrilateral is vertical or horizontal, so lining a cover up is guesswork, and the 20px handles are small to grab and the only way to move a side is to move both its corners.

**Approach:** Mark each side within 1° of an axis (4px accent over a 6px halo instead of 2px text), pull a dragged corner's sides gently toward straight, add a 16px diamond handle at each side's midpoint that moves the whole side, and grow the corner handles to 24px. Choices made on 2026-11-05 from `.working/corner-crop-straight.html` (option A) and `.working/corner-crop-snap.html` (option C, sticky zone, diamonds).

## Boundaries & Constraints

**Always:** Angles are measured on the photo's pixels (the stage scales x and y equally, so screen angles match). Straight is within 1° of vertical or horizontal, judged per side. The indication changes weight, not colour alone (UX-DR55), uses tokens only and is the same in both themes. Straightness and snap are pure functions in `src/lib/catalogue/corners.ts`. `checkCorners()` is unchanged, so Use enables exactly as before. The 44px tap area, halo, focus ring and a handle's position over its corner are unchanged. Side handles are reached by Tab after the corners and carry the focus ring. DESIGN.md and EXPERIENCE.md → Corner crop change in the same commit.

**Never:** Snap on arrow keys or while a side handle moves a side (it keeps its angle). Change `checkCorners()`, the server, the spine contracts, or the Use/Cancel flow. Add a toggle or setting for snap. Commit the Playwright walk.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Within tolerance | side 0.5° off an axis | `isStraight` true; side drawn heavy | n/a |
| Outside tolerance | side 1.5° off an axis | `isStraight` false; side drawn normal | n/a |
| Snap inside zone | pointer 0.5° off axis | dragged corner lands exactly on the axis from its neighbour | n/a |
| Snap in zone | pointer 2° off axis | side angle becomes 1.5° (`(d-1)·1.5`) | n/a |
| Snap outside zone | pointer 4° off axis | side angle stays 4° | n/a |
| Neighbour under 1px away | corner dragged onto its neighbour | no pull (length too small) | n/a |

</intent-contract>

## Code Map

- `src/lib/catalogue/corners.ts` -- add `STRAIGHT_TOLERANCE = 1`, `offAxis(a, b)` (degrees from the nearest axis), `isStraight(a, b)` and `snapToStraight(from, to)` (angle `d` ≤ 1 → 0, ≥ 3 → d, else `(d-1)·1.5`; sign kept; length kept; no change under 1px). Beside `checkCorners()`; client-safe, pure.
- `src/app/(frontend)/components/cornerCrop/CornerCrop.tsx` -- `CropStage`: `withCorner` clamps; `onPointerMove` snaps against both neighbours `(i+3)%4`, `(i+1)%4` in turn unless `event.altKey`; arrow keys unchanged (never snap). SVG polygon becomes four `<line>`s (halo 4/6px, stroke `stroke-text` 2 / `stroke-accent` 4). Corner handle span 20 → 24px (`inset-3` → 10px inset). New side buttons after the corner buttons: 44px tap area, 16px square rotated 45° with the same outline and halo shadow, at each midpoint (inline `style` allowed, spine Styling); drag stores the corners and pointer at grab, new corners = grab + pointer delta, delta clamped so both ends stay inside the image; arrow keys move both ends by the same 1/10 screen px.
- `messages/en.json`, `messages/fi.json` -- `cornerCrop.top|right|bottom|left` labels for the side handles (en: "Top edge" …; fi: "Yläreuna", "Oikea reuna", "Alareuna", "Vasen reuna"), beside `tl`…`bl` (line 197).
- `tests/unit/cornerCrop.unit.spec.ts` -- existing handle tests (read-only evidence: queries by name `tl`, `use`); must still pass.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md` (Corner crop row, line 414) and `EXPERIENCE.md` (Corner crop row, line 124) -- handle 24px, straight-side indication, side handles, snap and keys.
- `.working/corner-crop-snap.html` -- the chosen behaviour in running form (`snapPoint` sticky branch, side `move`); reference only.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/corners.ts` -- add `STRAIGHT_TOLERANCE`, `offAxis`, `isStraight`, `snapToStraight` -- pure rule beside `checkCorners()`
- `tests/unit/straightEdges.unit.spec.ts` -- one test for within/outside tolerance (0.5°, 1.5°, all four axis directions), one for the snap map at 0.5°, 2° and 4° -- the criteria name both
- `src/app/(frontend)/components/cornerCrop/CornerCrop.tsx` -- sides as lines with the indication, snap on pointer drags, 24px corners, side handles -- the visible behaviour
- `messages/en.json`, `messages/fi.json` -- side handle labels -- accessible names in both locales
- `DESIGN.md`, `EXPERIENCE.md` -- Corner crop rows updated -- same-commit rule
- `tests/e2e/cornerCrop.walk.spec.ts` (git-ignored, uncommitted) -- phone walk against the e2e server: drag onto straight, off straight, snap onto two sides, move a side, skewed photo, handle feel; record observations under `## Auto Run Result`

**Acceptance Criteria:**
- Given a side within 1° of vertical or horizontal, when I drag, use the arrow keys or move a side by its handle, then that side is 4px accent over a 6px halo, and returns to 2px text when it is not straight, each side on its own.
- Given I drag a corner so a touching side is 1°–3° off an axis, when the pointer moves, then the side angle follows `(d-1)·1.5` and is exactly straight within 1°; arrow keys and Alt-drag never snap.
- Given a side handle, when I drag it or press the arrows on it, then both ends move together, the side keeps its angle and both ends stay on the photo.
- Given the corner handles, then each draws 24px with the 44px tap area, halo and focus ring unchanged.
- Given a corner near a vertical from one neighbour and a horizontal from the other, when dragged, then it lands on both at once; Alt-drag skips the snap; a side moved past the image edge clamps both ends together.
- Given any corners, then `checkCorners()` accepts and rejects exactly as before and Use is enabled or disabled as before.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 17 findings — high 0, medium 1, low 10, false 5 (the Blind, Edge, Gap and Intent layers repeated several; each distinct claim has one row)
- findings:
  - `[medium]` `patch` Sequential snaps against both neighbours let the second undo the first (Blind, Edge x2, Gap other) — fixed: private `snapBoth` takes each pull from the raw point and places the corner where the two pulled lines cross, so both-in-zone lands on both. The reviewer's example (prev side 4.5° off) is outside the 3° zone and was never meant to snap.
  - `[low]` `patch` Side handles' tap areas sit over corner handles on short sides (Blind, Edge) — fixed: `z-10` on the corner buttons, DOM and Tab order unchanged.
  - `[low]` `reject` Clamp after snap breaks the snapped angle at the photo edge (Edge) — cosmetic, only at the image edge; the fix adds a recompute branch.
  - `[low]` `reject` Zero-length side counts as straight (Blind, Edge) — needs two corners dragged onto one point, where Use is disabled anyway; the fix adds a guard.
  - `[low]` `reject` Multi-touch: release clears both refs; a corner and a side grabbed together (Blind, Edge x2) — two-finger crops are unlikely; the fix adds pointer-id bookkeeping.
  - `[low]` `reject` No `lostpointercapture` release; per-axis clamp in `withSide` stops sliding on one axis (Blind) — no named harm.
  - `[false]` `reject` `withSide` bounds invert when an end is outside the image (Edge) — every corner is clamped on entry, so no state has an end outside.
  - `[false]` `reject` `stroke-4`/`stroke-6` instead of `stroke-selection` (Blind) — the existing outline already used `stroke-4`/`stroke-2`; 4px equals `stroke-selection`.
  - `[false]` `reject` JSDoc "from 3° on unchanged" vs `d >= 3` (Blind) — they agree.
  - `[false]` `reject` EXPERIENCE.md still says "2px outline" (Edge) — the same row states the heavy accent state.
  - `[false]` `reject` Side handles keep rendering when `checkCorners` fails (Blind) — the handles are the way out of an invalid quad.
  - `[low]` `reject` Touch users cannot skip the snap (Blind) — the owner chose sticky snap with side handles for the phone; Alt is the desktop bypass.
  - `[low]` `reject` Side handles not explained to assistive tech (Blind) — each has an `aria-label`; the hint is unchanged by design.
  - `[low]` `reject` No test runs `withSide`, the clamp or side keys (Gap) — CLAUDE.md: a test-only finding is rejected unless it names the criterion or spine rule; the criteria name unit tests for the pure rules only.
  - `[low]` `reject` Pointer snap, Alt and arrow-key rules not pinned by a test (Gap, Blind) — same reason; the walk observed them.
  - `[low]` `reject` Snap test has only positive offsets, one axis, no 1°/3° boundaries (Gap other, Blind) — the criterion asks for one test at 0.5°, 2° and 4°.
  - `[false]` `reject` Intent audit: the tests exercise pure math, not the component — descriptive; the walk covers the rendered surface and the criteria ask for no component test.

## Design Notes

Snap is applied to the dragged corner against each neighbour in turn, so a corner near a vertical from one neighbour and a horizontal from the other lands on both: after the first pull the second side is judged from the pulled point. The pointer offset from the grab is kept as today, so a snapped corner does not jump when the pull releases.

## Verification

**Commands:**
- `npm run lint` -- expected: no errors
- `npx tsc --noEmit` -- expected: no errors
- `npx vitest run tests/unit/straightEdges.unit.spec.ts tests/unit/cornerCrop.unit.spec.ts tests/unit/warpCover.unit.spec.ts` -- expected: all pass

**Manual checks (if no CLI):**
- The uncommitted phone walk above; record what it saw in `## Auto Run Result`.

## Auto Run Result

Phone walk (uncommitted `tests/e2e/cornerCrop.walk.spec.ts`, 390×844 touch viewport, e2e server, a generated 800×1200 photo), run after fixing the handle sizing:

- Start: all four sides heavy (the starting rectangle is straight). Corner handle draws 24×24; the side diamond is a 16px square turned 45° (22.6px across). Tab order: four corners, Top, Right, Bottom, Left edge, Cancel, Use.
- Lifting the top right corner 30px drops the top side's indication (3 heavy). Dropping it back to about 2px off leaves it heavy (the sticky pull carries it to straight), and the last 3px keeps it heavy.
- Dragging the bottom right corner near its square position leaves all four heavy; the screenshot shows 4px accent edges over the halo and the focus ring on the dragged handle.
- Left edge handle moved 25px right: the top left corner moved dx 25, dy 0, so the side kept its angle. Shift+ArrowDown on the Top edge handle moved the corner 10px; the focus ring shows round the diamond. Use stayed enabled.
- Found and fixed during the walk: `inset-2.5` and `inset-3.5` do not exist in the token scale (the handles drew 4px); they are now `size-6` and `size-4` centred.
- Review (one pass): 2 patches applied (`snapBoth`, corner `z-10`), 1 deferred (two unit files that fail on the baseline too), 14 rejected with reasons in the triage log. Follow-up review recommended: false (patched: medium 1, low 1). After the patches: `tsc` clean, lint 0 errors, the three specified vitest files pass (3 files, 24 tests), and the walk reran green (lift 3 heavy, near-square 4, side move dx 25 dy 0).

Residual risks: the full unit run has 3 failures in `loansPage` and `bookDetailCopyLine` that also fail on baseline. `snapBoth` has no unit test (private to the component; observed through the walk only). Not checked: a real finger on a phone (the walk drives a mouse in a touch viewport), the Alt bypass (no phone equivalent), and a photo with real perspective.
