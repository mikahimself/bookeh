---
title: '11.9 Add book target and bar'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: '6bff5bced599914b6e418fc00f6ae385cf965f2c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Add book (`/scan`) shows the camera in a plain bordered box with a bare guide line, and the other ways in (find by title / author, add without ISBN) are two Links under the field, with no torch for a dark shop.

**Approach:** Draw the Camera frame (four white corner brackets, the accent guide line, a hint at the foot). On the phone an `AppBar` holds torch, add without ISBN and find by title / author; the two Links stay on wide screens only.

## Boundaries & Constraints

**Always:**
- Camera frame (DESIGN.md): four 40px arms in a 4px white line, inset from the view's edges; the `accent` guide line across the middle; the hint "Hold the barcode inside the corners" in light ink at the foot of the view. The video keeps its accessible name "Point the camera at the barcode".
- Phone (under 900px): the `AppBar` (standalone, no "top") is pinned to the bottom of the Add book task, in this order: torch, add without ISBN (`/scan?title=`), find by title / author (`/scan/find`). The two Links under the field show from 900px up only. The ISBN field and Find are unchanged.
- Torch shows only when the camera's video track reports torch support; it toggles the light, has `aria-pressed` and a filled circle while on, and the light goes off when Scan unmounts (an Answer, or the task closing). With no camera or no torch it is absent; the other two buttons stay.
- Strings in English and Finnish.

**Never:** No new route, action or service. No change to the read gate, the decode loop or the camera session. No torch state outside `ScanScreen`. No committed Playwright spec beyond the two flows that already exist; nothing for wide screens beyond hiding the bar.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Torch supported | Camera on, track reports `torch` | Torch button first in the bar; tap lights, shows pressed; tap again turns off | Rejected switch: button state unchanged |
| No torch | Camera on, no `torch` capability | Bar has the two other buttons only | None |
| No camera | State `off` | No frame, no torch; the two buttons remain | None |
| Leave Scan lit | Torch on, a barcode opens an Answer | Light goes off; on return the button is unpressed | Switch-off rejection ignored |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/ScanScreen.tsx`: the frame `div` (`border-2 border-text`, guide line, hint under it) becomes the Camera frame; the Links block gets `hidden wide:flex`; add torch state and the bar. In `run()`, after `loadZxing()`, find the torch track with `BrowserMultiFormatReader.mediaStreamIsTorchCompatibleTrack` over `stream.getVideoTracks()` and keep `{ set: (on) => BrowserMultiFormatReader.mediaStreamSetTorch(track, on) }` in state; effect cleanup switches a lit torch off and clears both.
- `node_modules/@zxing/browser/esm/readers/BrowserCodeReader.js` (~1074 `scan`, ~765 `switchTorch`): `reader.scan()` returns controls with `stop` only; `switchTorch` exists only on `decodeFromStream` controls. So the torch uses the reader's static torch helpers on the stream's track, which are what `switchTorch` calls.
- `src/app/(frontend)/components/AppBar.tsx`: add an optional `className` for the root (Scan needs `-mx-page-margin-phone mt-auto`, since the task column has side padding and short content must still pin it low); add icons `torch`, `noIsbn`, `find` (22×22 box paths); `item` gains `group`, circle gains `group-aria-pressed:bg-bar-ink group-aria-pressed:text-bar` for the pressed look.
- `src/app/(frontend)/components/FullScreenTask.tsx`: the column (`flex min-h-full flex-col`, `px-page-margin-phone`); the bar is a direct child, so `sticky bottom-0` pins to the scrolling frame. No change expected.
- `messages/en.json`, `messages/fi.json` (`scan`): add `torch`, `frameHint`, `findBar` ("Find by title / author"); `addWithoutIsbn` is reused for the bar; `cameraHint` stays as the video's name. `ui-case` lowercases bar labels.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/mockups/bold-metro/Scan.dc.html`: look reference (brackets 44px in from the sides, hint 16px from the foot, bar order).
- `tests/unit/scanScreen.unit.spec.ts`: the zxing mock class gets the two static helpers; the "links to Lookup…" test now sees each href twice (bar and Links), so assert the distinct set; one new test for torch (shown when the track supports it, absent otherwise, off on unmount).
- `tests/e2e/scanToSave.spec.ts`, `shopCheck.spec.ts`: desktop Chromium, no bar; they must still pass unchanged. `tests/e2e/appBar.walk.spec.ts` (ignored): precedent for a phone-viewport walk.

## Tasks & Acceptance

**Execution:**
- `AppBar.tsx` -- `className`, three icons, pressed look -- the bar's new buttons and one reusable pressed state
- `ScanScreen.tsx` -- Camera frame, torch state, bar, wide-only Links -- the story
- `messages/*.json` -- three strings in both languages
- `scanScreen.unit.spec.ts` -- helper statics in the mock, adapted Links test, one torch test -- the torch rule is named by the AC
- `tests/e2e/addBookBar.walk.spec.ts` (git-ignored) -- walk the criteria below; record what was seen under `## Auto Run Result`

**Acceptance Criteria:**
- Given Add book with the camera running, when it shows, then four 40px white corner brackets, the accent guide line and the hint "Hold the barcode inside the corners" sit over the view, in both themes.
- Given a phone viewport, when Add book shows, then the App bar holds add without ISBN and find by title / author (and torch when supported), the two Links are not shown, and each button leads to `/scan?title=` and `/scan/find`.
- Given a wide viewport, when Add book shows, then there is no App bar and both Links show under the field.
- Given a camera with torch support, when I tap torch, then the light is on and the button pressed; when I tap it again or an Answer opens, then it is off.
- Given no camera or no torch, when Add book shows, then there is no torch button.
- Given the e2e scan-to-save and shop-check flows, when they run, then both still pass.
- Given English and Finnish, then all new text is translated.

## Spec Change Log

## Review Triage Log

### 2026-11-11 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 19, false 2, maybe-false 0 (3 low patched as 2 entries, 16 low and 2 false rejected)
- findings (layer order):
  - Verification Gap
    - `[low]` `[patch]` Torch rejected switch, second tap and the no-camera row untested — the spec's I/O matrix names all three; added three unit cases, and `torchSupported` now resets in `afterEach`.
    - `[low]` `[reject]` Pressed styling (`group-aria-pressed`) is CSS only and untested — the rule is markup; no test restates it.
    - `[low]` `[reject]` Effect re-run path untested — `gate` is stable state and `state`/`stream` change once per session; not reachable in everyday use.
  - Intent Alignment auditor: descriptive, no findings. Its notes (e2e flows unchanged, torch detected by static helpers rather than `controls.switchTorch`) are covered by the spec's Design Notes; both flows were run and pass.
  - Edge Case Hunter
    - `[low]` `[reject]` Toggle resolves after cleanup, so `setLit(true)` is late — the screen is unmounted by then, or the effect re-runs only on a new stream; no everyday path.
    - `[low]` `[reject]` Double tap reads stale `lit` — both taps ask for the same state, so UI and light agree; no desync.
    - `[false]` `[reject]` Cleanup runs `controls.stop()` before the torch switch-off — `scan()`'s stop leaves the stream and its track alone, so the switch-off applies.
    - `[low]` `[reject]` Effect re-run while lit switches the light off — same as the re-run row above.
    - `[false]` `[reject]` `group-aria-pressed` may not match — `AppBarButton` spreads `aria-pressed` onto the button that carries `item` (`group`); the circle is its child.
    - `[low]` `[reject]` Hint and brackets over bright video without a scrim — DESIGN.md specifies light ink with no scrim; shop use is dim; the owner walk judges it.
    - `[low]` `[reject]` Brackets inset 24px against the mock-up's 44px — DESIGN.md gives no value; the mock-up's view is narrower.
    - `[low]` `[reject]` Bar links stay active during a pending lookup — the old Links did the same; pre-existing.
  - Blind Hunter
    - `[low]` `[reject]` Torch state duplicated in state and refs — the cleanup closure cannot read state; merging is a refactor with no named harm.
    - `[low]` `[reject]` No in-flight guard and silent failure — see the double-tap row; a failed switch leaves the button as it was.
    - `[false]` `[reject]` Torch state set after an await can outlive the effect — `cancelled` is checked and the state set follows with no await between.
    - `[low]` `[reject]` Hint inside `aria-hidden`, label unchanged when pressed — the video carries the name "Point the camera at the barcode"; `aria-pressed` states the toggle.
    - `[low]` `[reject]` `bar-ink` used for the overlay colour — it is white (`#E3E8EE` in dark); DESIGN.md says white for brackets and light ink for the hint.
    - `[low]` `[reject]` No-camera phone has only the bar as a route — intended; now covered by the new test (patched above).
    - `[low]` `[reject]` Same links twice, different labels, `new Set` in the test — the bar label is the AC's; the Links keep theirs; one dedupe is what the test needs.
    - `[low]` `[reject]` `className` escape hatch on `AppBar` — one caller, documented in its comment.
    - `[low]` `[reject]` Hand-drawn icons and the 40px literal — 40px is the AC; the icons go to the owner walk.
    - `[low]` `[patch]` Finnish bar label long and "kirjailijalla" against "tekijällä" elsewhere — changed to "Hae nimellä / tekijällä"; wrapping to two lines is allowed by DESIGN.md.

## Design Notes

The epic's wording ("when the scanner's controls offer `switchTorch`") assumed controls from `decodeFromStream`; `reader.scan()` on the existing video element, which the read gate and Strict Mode handling depend on, returns none. The observable rule is unchanged: the button shows only when the camera reports torch. Not switching readers keeps the decode loop untouched.

The bar sits in the task's own column with negative side margins rather than in `FullScreenTask`'s `foot`: the torch state lives in `ScanScreen`, and `foot` would add padding around a band that is meant to run edge to edge.

## Verification

**Commands:**
- `npm run test:unit` -- all pass
- `npm run typecheck` -- no errors
- `npm run lint` -- no new errors in committed files
- `npm run test:e2e -- tests/e2e/scanToSave.spec.ts tests/e2e/shopCheck.spec.ts --workers=1` -- both pass
- `npm run test:e2e -- tests/e2e/addBookBar.walk.spec.ts --workers=1` -- walk passes on the fixture server

**Walk:** 390px and 1300px: frame, bar order and links, no-camera state, torch absence with the fake camera, Finnish, both themes. The iPhone and Android torch check cannot run here; it stays an owner walk (record it as owed).

## Auto Run Result

Walk (`tests/e2e/addBookBar.walk.spec.ts`, ignored), no camera in the e2e browser: at 390px the bar sits flush at the bottom (gap 0) with "add without isbn", "find by title / author", the two Links hidden; at 1300px no bar and both Links visible. Frame, torch with a real camera, Finnish and both themes were not walked; owner walk owed (frame look, iPhone and Android torch).

Summary: Add book has the Camera frame (four white 40px brackets, accent guide line, hint) and, on the phone, a standalone App bar with torch (only when the video track reports it), add without ISBN and find by title / author; the two Links show from 900px up.

Files changed:
- `src/app/(frontend)/scan/ScanScreen.tsx` -- frame, torch state, bar, wide-only Links
- `src/app/(frontend)/components/AppBar.tsx` -- `className`, three icons, pressed look
- `messages/en.json`, `messages/fi.json` -- `scan.torch`, `scan.frameHint`, `scan.findBar`
- `tests/unit/scanScreen.unit.spec.ts` -- torch cases (shown, absent, toggle, rejected, unmount, no camera), adapted Links test
- `_bmad-output/implementation-artifacts/epic-11-context.md` -- recompiled (stale against the planning docs)

Review: 21 findings, none high or medium; 2 entries patched (3 low: the missing matrix tests, the Finnish label), 16 low and 2 false rejected with reasons in the log. Patched counts by verdict: low 3. Follow-up review: false.

Verification: `npm run typecheck` clean; `npm run test:unit` 1407 pass; eslint clean on the touched files; scan-to-save and shop-check e2e pass; the walk passed (phone bar and hidden Links, wide Links and no bar).

Residual risks: the Camera frame was never rendered (the e2e browser has no camera), nor were the torch, Finnish or the dark theme; the three new icon paths are unseen. Owner walk owed on an iPhone and an Android phone: frame look, hint legibility on a bright image, torch on and off, Back from an Answer.
