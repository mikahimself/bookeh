---
title: 'Story 4.13: [D30] Four-corner crop'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: 'd45681901b1e4e07fbafff7b211f0f794e053785'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `setCover` (4.12) needs a cover's four corners in a decoded image, and nothing in the browser decodes a phone photo or lets Mika place those corners (D-4, UX-DR47a).

**Approach:** `decodePhoto(file)` decodes with orientation, shrinks to 2000 px on the long side and re-encodes as JPEG. `CornerCrop`, a full-screen, always-dark step (DESIGN.md → Corner crop, option B picked 2026-10-21 in `d456819`), shows that JPEG with four draggable corner handles and returns `{ image, corners }` on Use. The check that disables Use is the server's own `checkCorners`, moved into a pure module the client may import.

## Boundaries & Constraints

**Always:**
- Decode with `createImageBitmap(file, { imageOrientation: 'from-image' })`; shrink only when the long side is over 2000; JPEG via canvas `toBlob('image/jpeg', 0.9)`. Corners are in that JPEG's pixels, clockwise from top left.
- Start: a centred 2:3 rectangle, height `min(0.6·H, 0.9·W)`.
- Handles are buttons with 44px tap areas and 20px drawn squares. Pointer drags them (touch or mouse, clamped to the image). Arrow keys move the focused one 1 screen px, or 10 with Shift. Tab order: TL, TR, BR, BL, Cancel, Use.
- Use is disabled unless `checkCorners(corners, size)` holds.
- Cancel, Esc and Back return nothing.
- The step's subtree uses the dark palette whatever the theme. `crop-dim` and `crop-halo` become tokens.
- Overlay rules: Base UI only in `components/ui`; one overlay deep; Back closes; swipe suspended.
- English and Finnish text.

**Never:**
- No Edit book wiring, cover buttons, file input, preview or upload (4.14).
- No crop library, no loupe.
- No second copy of the corner rule in the client.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Photo | 4000×3000 / 800×600 file | JPEG 2000×1500 / 800×600 (never enlarged); step opens | No error expected |
| Not decodable | text file, or `createImageBitmap` rejects | step doesn't open; `onReject('NOT_AN_IMAGE')` ("Not an image.") | caller shows it (4.14) |
| Use | valid quad | `onUse({ image: Blob(JPEG), corners })`, corners in JPEG pixels | No error expected |
| Bad shape | crossed, folded or collinear | Use disabled | No error expected |
| Cancel / Esc / Back | open step | `onCancel()`, nothing returned | No error expected |

</intent-contract>

## Code Map

- `src/app/(frontend)/components/ui/Dialog.tsx`, `ui/overlay.tsx`, `components/swipe.ts` -- wrapper pattern (`useOverlayLayer`, `useCloseOnBack`, `useSuspendSwipe`).
- `components/Button.tsx` -- primary/secondary, `disabled:` styles. `errors.NOT_AN_IMAGE` exists in `messages/*.json`.
- `tests/unit/picker.unit.spec.ts` -- jsdom overlay test template (`next-intl` mock, `installNavigationTracking`, `matchMedia`, popstate).

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/corners.ts` -- new, pure: `Point`, `Corners`, `checkCorners` moved from `warpCover.ts:5-10,67-77`; update imports in `warpCover.ts`, `setCover.ts:11`, `tests/unit/warpCover.unit.spec.ts:4`.
- `eslint.config.mjs:91-117`, `tests/unit/clientLibImports.unit.spec.ts` -- `clientLibImports` also allows `lib/catalogue/corners`; one valid client case.
- `src/app/(frontend)/styles.css` -- `@theme`: `--color-crop-dim: #00000099`, `--color-crop-halo: #0000008c`. The explicit dark block's selector also matches `[data-palette='dark']`.
- `src/app/(frontend)/components/ui/FullScreenDialog.tsx` -- new wrapper: a Base UI Dialog filling the screen, labelled by `label`, with `data-palette="dark"` and `bg-background`. Uses `useOverlayLayer('dialog')`, `useCloseOnBack` and `useSuspendSwipe`. Any close calls `onOpenChange(false)`.
- `src/app/(frontend)/components/cornerCrop/decodePhoto.ts` -- `decodePhoto(file: Blob): Promise<Photo | null>`, where `Photo = { image: Blob; width; height }`. It returns null on any decode failure and closes the bitmap.
- `src/app/(frontend)/components/cornerCrop/CornerCrop.tsx` -- `'use client'`. Props: `{ file: Blob | null; onUse(r: { image: Blob; corners: Corners }); onCancel(); onReject(code: 'NOT_AN_IMAGE') }`. On a new `file` it decodes: on null it calls `onReject`, otherwise it opens `FullScreenDialog`. Inside: hint; stage fitting the image (object URL, revoked on close); SVG with the `crop-dim` evenodd path and outline over its `crop-halo` line; four handle buttons; foot with Cancel and Use.
- `messages/{en,fi}.json` -- `cornerCrop.label` "Crop cover"/"Rajaa kansi", `hint` "Shoot it straight on"/"Kuvaa suoraan edestä", `use` "Use"/"Käytä", `cancel` "Cancel"/"Peruuta", `tl` `tr` `br` `bl` "Top left corner"/"Vasen yläkulma" etc.
- `tests/unit/cornerCrop.unit.spec.ts` -- jsdom; `decodePhoto` mocked for the component, stubbed (`createImageBitmap`, canvas) for itself: undecodable → `onReject`, no step; 4000×3000 → 2000×1500 and 800×600 → 800×600 JPEG; Use returns the start rectangle of a 1000×1500 photo; arrows moving TL past TR disable Use; Cancel, Esc and Back → `onCancel`, never `onUse`.
- `ARCHITECTURE-SPINE.md:64` -- client components may also import `lib/catalogue/corners.ts` (pure).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `4-13-d30-four-corner-crop: done`.

**Acceptance Criteria:**
- Given an open crop step, when it renders in the light theme, then its subtree uses the dark palette (`data-palette="dark"`) and shows the hint, four labelled handles, Cancel and Use.
- Given the spine, when the story is done, then line 64 names `lib/catalogue/corners.ts`, and lint passes with `CornerCrop` importing `checkCorners` at runtime.
- Given the repository, when the story is done, then `package.json` gains no dependency.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 24 findings — high 0, medium 4, low 15, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) The screen-to-JPEG mapping (`scale`, `left`/`top`, `atPointer`, grab offset, clamp, `/ scale` on arrows) only runs at scale 1, and no pointer event is fired. Dropping any of these passes the suite, which leaves the matrix row "corners in JPEG pixels" unguarded. Fixed: one test at scale 0.5 drags TL by pointer, checks JPEG pixels and the clamp at 0, and checks that one ArrowRight moves 2 JPEG px.
  - `[low]` `[reject]` (edge) A Use and a Cancel inside the 200ms exit fade overwrite each other's outcome. This needs taps on opposite buttons within one fade, and the fix is a new guard.
  - `[low]` `[reject]` (edge) A stage of 40px or less gives a scale of 0 or below. No phone or window gives the full-screen step that size, and the fix is a new branch.
  - `[low]` `[reject]` (edge) A second finger on another handle takes over the grab, and the first finger's lift ends it. Two fingers on two handles isn't how the step is used, and the fix adds pointer-id state.
  - `[low]` `[reject]` (edge) A right or middle click starts a drag. The grab offset keeps the corner in place unless the pointer moves with the button held, and the fix is a new guard for a desktop-only slip.
  - `[low]` `[reject]` (edge) The Cancel/Use contract can invert during the fade. Same root as the first edge row.
  - `[medium]` `[patch]` (blind) `[data-palette='dark']` changes the Styling contract, but the spine's Styling row still names only the root theme cases. Fixed: the Styling row and the styles.css header now name the `data-palette="dark"` subtree.
  - `[medium]` `[patch]` (blind) CornerCrop uses an inline `style` and number literals, which the Styling row forbids. Fixed: the stroke widths and the halo use token utilities and variables. The spine now allows an inline `style` for positions computed from measured geometry, with px constants named after their token.
  - `[false]` `[reject]` (blind) The sprint status says `done` while the spec says `in-review`. Both are the committed end state: Finalize sets the spec to `done` in the same commit.
  - `[false]` `[reject]` (blind) Verification leaves out the integration tests, so a broken import in `tests/int/setCover.int.spec.ts` would go unnoticed. `npm run typecheck` covers `**/*.ts` (tsconfig `include`), tests included. The file also passed against Postgres on 5433 during implementation.
  - `[low]` `[reject]` (blind) The 1000×1500 start-rectangle test can't tell `0.6·H` from `0.9·W`. This finding only asks for a test, and the start formula is a spec detail rather than a story criterion or spine rule (CLAUDE.md, Tests).
  - `[low]` `[reject]` (blind) No test checks `{ imageOrientation: 'from-image' }`. The only test possible in jsdom would assert a stubbed call's argument, which CLAUDE.md rules out. The source line is the criterion's own text.
  - `[medium]` `[patch]` (blind) Pointer dragging is untested. Same root as the verification-gap row, and fixed by the same test.
  - `[low]` `[reject]` (blind) Every decode failure, a memory failure on a huge photo included, reads "Not an image.". iPhone photos are 12–24 MP, and telling the failures apart needs new codes and branches.
  - `[low]` `[reject]` (blind) Nothing shows while a photo decodes, and the caller gets no pending signal. Decoding and re-encoding take well under a second on a current phone, and the fix adds public surface. 4.14 can show progress from the file choice until a callback arrives.
  - `[low]` `[patch]` (blind) The first render can paint the photo at scale 1, off-centre, before the ResizeObserver fires. Under reduced motion there is no fade to hide it. Fixed: the ref callback measures synchronously with `getBoundingClientRect()` before observing.
  - `[low]` `[reject]` (blind) Handles tell a screen reader nothing beyond their label. They are labelled buttons in tab order and the arrow keys work. A description needs new strings, which go beyond the accessibility floor.
  - `[low]` `[reject]` (blind) Pointer handling checks neither the pointer nor the button. Same as the edge pointer rows.
  - `[low]` `[reject]` (blind) The object URL is revoked in two places and `step` outlives the close. A second revoke is a no-op, and the caller clears `file`, which runs the cleanup. One JPEG is held until then.
  - `[low]` `[patch]` (blind) A rewrapped JSDoc line in `eslint.config.mjs` is about 120 characters. Fixed: rewrapped.
  - `[false]` `[reject]` (intent) No consumer opens the step, and "Not an image." is never rendered. Story 4.14's criteria own the file input, the opening of the crop and "a rejected file shows 'Not an image.' … under the cover". 4.13 hands over `onReject('NOT_AN_IMAGE')`, as its Design Notes record.
  - `[low]` `[reject]` (intent) DESIGN.md says "the photo fills the screen", but the stage keeps a 20px gap. Without it, a corner at the photo's edge would put half of its 44px tap area off the screen. The photo still fills the stage.
  - `[false]` `[reject]` (intent) The `imageOrientation` option is unasserted. Same as the blind row: the criterion is met in `decodePhoto.ts`, and the only test possible would restate a stub.
  - `[false]` `[reject]` (intent) The sprint status says `done` while the spec says `in-review`. Same refutation as the blind row.

## Design Notes

The 4.13 criterion "a file the browser can't decode shows 'Not an image.'" is met through `onReject('NOT_AN_IMAGE')`, whose message is `errors.NOT_AN_IMAGE`. 4.14's criteria own the file input and "a rejected file shows … under the cover", so the text appears where 4.14 renders it.

Stage: a `ResizeObserver` gives the size; `scale = min((w − 40)/W, (h − 40)/H)`, image centred; `scale` is 1 when the stage measures 0 (jsdom).

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npm run lint` -- no errors
- `npm run test:unit` -- all pass
- `npm run build` -- succeeds

## Auto Run Result

Status: done

**Summary:** the four-corner crop step (D30), built as a component for 4.14 to mount on Edit book.
- `decodePhoto(file)` decodes in the browser with `imageOrientation: 'from-image'`. It shrinks a photo that is over 2000 px on the long side, never enlarging one, and re-encodes it as JPEG. It returns null when the browser can't decode the file.
- `CornerCrop` takes `file`, `onUse`, `onCancel` and `onReject`. It is a full-screen step that is always dark (DESIGN.md → Corner crop, option B):
  - the photo fitted to the stage, dimmed outside the four corners;
  - a 2px outline over a 4px halo;
  - four 20px handles with 44px tap areas, dragged by pointer or moved with the arrow keys;
  - Use, which returns `{ image, corners }` in the JPEG's pixels, and Cancel.
- Use is disabled by the server's own `checkCorners`, now in the pure `lib/catalogue/corners.ts`, which client components may import.
- An undecodable file never opens the step and calls `onReject('NOT_AN_IMAGE')`. 4.14 shows the message under the cover.

**Files changed:**
- `src/lib/catalogue/corners.ts`: new. `Point`, `Corners` and `checkCorners`, moved out of `warpCover.ts`. Imports updated in `warpCover.ts`, `setCover.ts`, `tests/unit/warpCover.unit.spec.ts` and `tests/int/setCover.int.spec.ts`.
- `eslint.config.mjs`, `tests/unit/clientLibImports.unit.spec.ts`: client components may import `lib/catalogue/corners`.
- `src/app/(frontend)/styles.css`: `crop-dim` and `crop-halo` tokens. The explicit dark block also matches `[data-palette='dark']`.
- `src/app/(frontend)/components/ui/FullScreenDialog.tsx`: new. A full-screen Base UI dialog in the dark palette; Back closes it and section swipe is suspended while it is open.
- `src/app/(frontend)/components/cornerCrop/decodePhoto.ts`, `CornerCrop.tsx`: new. The decode and the step.
- `messages/en.json`, `messages/fi.json`: `cornerCrop.*` strings.
- `tests/unit/cornerCrop.unit.spec.ts`: new tests:
  - an undecodable file;
  - the dark palette and controls in the light theme;
  - the start rectangle on Use;
  - arrows that cross the corners disabling Use;
  - a scaled pointer drag with the clamp, and an arrow step in JPEG pixels;
  - Cancel, Esc and Back;
  - the `decodePhoto` sizes.
- `ARCHITECTURE-SPINE.md`: client imports may include `lib/catalogue/corners.ts`. The Styling row adds the `data-palette="dark"` subtree and the inline-`style` exception for measured geometry.
- `sprint-status.yaml`: 4.13 is done.

**Review findings:** 24 in total (high 0, medium 4, low 15, false 5).
- 5 patch entries:
  - the scaled pointer and arrow test (medium; the verification-gap and blind pointer rows);
  - the spine Styling row for `data-palette` (medium);
  - the inline-style and literal exception in the spine, with token utilities in the component (medium);
  - a synchronous first measure (low);
  - an ESLint comment rewrap (low).
- 0 deferred.
- 19 rejected. The reasons are in the Review Triage Log:
  - edge cases in the fade, tiny stages, multi-touch and the non-primary button;
  - a start-rectangle test and an orientation test (test-only);
  - "Not an image." for every decode failure;
  - no pending signal;
  - screen reader descriptions;
  - URL ownership;
  - the 20px stage gap;
  - five false findings: sprint status twice, integration tests, no consumer, orientation.

**Follow-up review recommended:** true. Three medium entries and two low entries were patched (high 0, medium 3, low 2). The named unverified risk: the step has never rendered in a real browser. Touch dragging with pointer capture on iOS Safari, the dark-palette subtree inside the portal, and the safe-area padding are checked only in jsdom. They should be looked at on the phone once 4.14 mounts the step.

**Verification:** worktree `.claude/worktrees/story-4-13-four-corner-crop`, Postgres on 5433.
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. The 40 warnings were all there before.
- `npm run test:unit`: 47 files, 725 tests passed.
- `npm run build`: compiled successfully.
- `tests/int/setCover.int.spec.ts`: 6 passed, run during implementation after the `Corners` import moved.
- Every matrix row is covered by a test that ran.

**Residual risks:**
- The caller must set `file` back to null on every outcome, or the same file won't reopen the step. This is documented on the prop.
- A very large photo that runs out of memory while decoding reads "Not an image.".
- The `setPointerCapture` stub in `cornerCrop.unit.spec.ts` stays on the prototype for the rest of that file.

