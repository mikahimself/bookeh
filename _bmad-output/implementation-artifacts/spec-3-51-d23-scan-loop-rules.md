---
title: 'Story 3.51: [D23] Scan loop rules'
type: 'feature'
created: '2026-10-20'
baseline_revision: '01efa9337f248e34c3fa82eac584d5715b91d2a8'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      No test walks the history rule end to end: Scan, Answer A, Back, Answer B, Back, then Back from Scan lands on the section.
    evidence: |-
      Story 3.51 changes no history code; the rule holds because Back and Add to library traverse back (useTaskBack) and the next Answer's push drops the old entry. Unit suites cannot reproduce browser history, so only 3.52's Playwright scan-to-save can assert it, for example by entering two ISBNs in turn and checking that Back from Scan reaches the section.
    location: >-
      src/app/(frontend)/scan/ScanScreen.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** Back from an Answer, or a save, remounts `ScanScreen` with no memory, so the barcode still in front of the camera is read again at once and the same Answer reopens. On Scan with an `isbn` in the address (invalid ISBN, rate limit, and the in-library / not-found / couldn't-look-it-up kinds until 3.48–3.50 land), every read is dropped until the address changes. EXPERIENCE.md (Scan) only pauses reading during a lookup and while an Answer shows.

**Approach:** Add a task-scoped read gate held by `CameraSession`. It remembers the last ISBN the camera handled and ignores that ISBN until the camera has seen it missing for `LEFT_VIEW_MS` (1500 ms) of decoding. `ScanScreen` pauses reads only while its own lookup transition is pending, and otherwise passes every decode attempt through the gate. The history rule (UX-DR8) already holds; this story keeps it and covers it with tests.

## Boundaries & Constraints

**Always:**
- **The gate.** `scan/readGate.ts` exports `LEFT_VIEW_MS = 1500` and `createReadGate(leftViewMs = LEFT_VIEW_MS)`. It is a pure module: no React and no clock of its own, and `now` is always passed in. It holds at most one ISBN, plus the time that ISBN was last seen. Its operations:
  - `see(isbn | null, now) → string | null`, called on every decode attempt. A `null` (nothing decoded) or another ISBN does not refresh the held one's clock. Once `now − lastSeen ≥ leftViewMs`, the hold is released. Reading the held ISBN refreshes `lastSeen` and returns `null`. Any other read returns the ISBN. `see` never holds anything.
  - `hold(isbn, now)` replaces any earlier hold.
  - `resume(now)` sets `lastSeen = now` if something is held. Call it when the decode loop starts, so time spent on an Answer (no decoding) does not count as out of view.
- **Where it lives.** `CameraSession` creates one gate per mount (lazy `useState`/`useRef`) and exposes it on the context as `gate`. So it survives Scan → Answer → Scan and is gone when the task closes (X).
- **ScanScreen reading.** On each zxing callback, compute `read = result ? isbnFromBarcode(...) : null` and `fresh = gate.see(read, performance.now())`. Act only when `fresh` is set and reading is not paused: `gate.hold(fresh, now)`, then `go(fresh)`. `gate.resume(performance.now())` runs when the loop starts. Note that zxing calls back with `undefined` after every failed attempt, which is what moves the clock.
- **Pause.** Reading pauses from `go()` (a read or a Go submit) until that navigation's transition is no longer pending. It is set synchronously in `go()`, because `pending` commits a render later, and cleared once `pending` is false again. Nothing else pauses reading on Scan: an `isbn` in the address no longer does. A read with an `isbn` in the address replaces, as before. The Answer branch unmounts `ScanScreen`, which already stops the loop while an Answer shows; keep it that way.
- Only camera reads are held. A typed entry holds nothing (Design Notes).
- History stays as built: a read or Go from `/scan` pushes, from `/scan?isbn=` replaces, and Back / Add to library traverse back to Scan (`useTaskBack`), so the next Answer's push drops the old Answer's entry.

**Never:**
- No change to `page.tsx`, the Answer components, `AddToLibrary`, `navigation.ts`, the lookup or any `lib` service.
- No module-level gate state, which would outlive the task and leak between tests. No `Date.now()` for the gate clock.
- No browser normalisation of typed text in order to hold it.
- No new strings, no Playwright (3.52).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Back to Scan, book still in view | X read, Answer, Back; X keeps decoding | no navigation | held |
| Book removed | after Back, no X decoded for 1500 ms of decoding | next X read pushes `/scan?isbn=X` | hold released |
| Long Answer | 10 s on the Answer, then Back, X in view | still ignored (clock restarts on resume) | `resume` |
| Next book | X held, Y read | push `/scan?isbn=Y`; Y now held | — |
| During lookup | read X → push pending; Y read | ignored | pause |
| Scan with error | `/scan?isbn=X` rate-limited; X still in view; then Y read | X ignored; Y replaces `/scan?isbn=Y` | — |
| Typed Go | type, Go; read during pending | ignored; after the transition settles, reads act | pause |
| Task closed | X, then reopen Scan with X in view | X read (new gate) | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/ScanScreen.tsx` -- `handled` ref (line 40) and its `[isbn]` reset effect (56-58) are the old rule; replace them with the pause ref plus the gate. The decode callback is at 88-92, `go()` at 43-50, `useEffectEvent(go)` at 52. Rewrite the header comment's last sentences to match the new rules.
- `src/app/(frontend)/scan/CameraSession.tsx` -- the `Camera` type (16-22) and the context value `useMemo` (79); add `gate: ReadGate`. Update the doc comment.
- `src/app/(frontend)/scan/barcode.ts` -- `isbnFromBarcode`, read-only. Its 13-digit text is the ISBN-13 the gate compares.
- `src/app/(frontend)/scan/page.tsx` -- read-only. The Answer branch renders no `ScanScreen` (pause while an Answer shows).
- `src/app/(frontend)/components/navigation.ts` -- `useTaskBack` (206-217), read-only. History behaviour is already covered by `tests/unit/navigation.unit.spec.ts`.
- `tests/unit/scanScreen.unit.spec.ts` -- mocks zxing's `scan` and hands the test the callback (`decoder()`). `tree()` wraps `ScanScreen` in `CameraSession`. To show an Answer, rerender `CameraSession` without `ScanScreen`. Tests that change: "pushes … once" (now a held duplicate plus a pending pause), "ignores reads while an isbn is in the address" (now reads and replaces), and "typed text … then ignores reads" (now only while pending). The mocked `push` settles the transition at once. To hold `pending`, make the `push` mock start a state update that suspends, or wrap `useTransition` in a controllable `vi.mock('react', …)`. Use whichever stays readable.
- `@zxing/browser` `scan()` -- calls `callbackFn(undefined, error)` on every failed attempt (`node_modules/@zxing/browser/esm/readers/BrowserCodeReader.js`, `scan` loop).

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/scan/readGate.ts` -- new pure gate as specified -- the one rule for "left the camera's view".
- `src/app/(frontend)/scan/CameraSession.tsx` -- create and expose `gate` -- it has to outlive `ScanScreen` across Answers.
- `src/app/(frontend)/scan/ScanScreen.tsx` -- the gate in the decode callback, `resume` on loop start, and a pause only while the lookup is pending; drop the `isbn`-based ignore.
- `tests/unit/readGate.unit.spec.ts` -- new: held ISBN ignored while seen, released after 1500 ms without it (and not at 1499), `null` and other ISBNs not refreshing it, `resume` restarting the clock, `hold` replacing.
- `tests/unit/scanScreen.unit.spec.ts` -- update the three tests above. Add, with `performance.now` stubbed:
  - Back from an Answer with X still read: no push.
  - X missing for 1500 ms after the remount: X pushes again.
  - Y pushes at once.
  - A read during a pending lookup is ignored.
  - With `isbn` in the address, a held X is ignored and Y replaces.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.51 `done` when finished.

**Acceptance Criteria:**
- Given Scan with the camera on, when a barcode is read and the lookup is running, then further reads do nothing until the lookup has landed.
- Given an Answer opened by reading X, when the user taps Back (or Add to library) with X still in front of the camera, then Scan stays on Scan; once X has been out of view for 1.5 s, reading X opens its Answer again, and any other ISBN opens at once.
- Given Scan → Answer A → Back → Answer B → Back, when the user presses Back on Scan, then they are on the section they opened Scan from.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 21 findings — high 0, medium 2, low 12, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: the gate counts wall-clock time, not decoding time. With X held, a phone lock, an app switch or a hidden tab releases the hold on return, and X's Answer reopens. Patched: the decode-loop effect calls `gate.resume()` on `visibilitychange` to visible, and a unit test covers a hidden → visible gap.
  - `[low]` `[reject]` Blind: the hold starts at the read, so it also covers a read that lands back on Scan (rate limit). This is deliberate (I/O matrix row "Scan with error"). Without it, a rate-limited Scan with the book in view would loop lookups. The suggested fix is a spec edit.
  - `[low]` `[patch]` Blind: `submit` guards with `pending`, which commits a render after a camera read's `go()`, so a Go in that gap starts a second navigation. Patched: `submit` guards with `paused.current`, one rule for camera and Go.
  - `[false]` `[reject]` Blind: sprint status `done` while the spec is `in-review`. Finalization sets the spec to `done` and commits both together.
  - `[false]` `[reject]` Blind: a held read is ignored without any sign. That is the specified behaviour (EXPERIENCE.md, Scan: "is ignored"). Feedback would be a new UX rule.
  - `[false]` `[reject]` Blind: the module-level `startLookup` could call a stale setter. Every `holdLookup()` runs after `await decoder()`, by which time the current tree's `Lookup` effect has run. No test reaches the stale path.
  - `[false]` `[reject]` Blind: an exact-count `decoder(loop)` could spin until timeout. `waitFor` fails with the actual call count, which is a clear failure. The effect's deps (`state`, `stream`, the stable `gate`) do not re-run it spuriously, and the suite passes.
  - `[low]` `[reject]` Blind: the Code Map line numbers go stale. The fix is a spec edit.
  - `[low]` `[reject]` Blind: the spec repeats the gate's design in several sections. The fix is a spec edit.
  - `[medium]` `[patch]` Edge (same root as the wall-clock row): with the tab hidden, the hold is released on return. Patched by the same `visibilitychange` resume.
  - `[low]` `[reject]` Edge: after a remount, blank frames before the video plays count as out of view. `resume` runs after `await element.play()`, which resolves once a live, already-running stream is playing. A rejected play is the rare interrupted-load case. Guarding on `playing` / `readyState` adds a branch for a case not shown to occur.
  - `[low]` `[patch]` Edge (same root as the `submit` row): Go during the pre-commit gap. Patched by the same `paused.current` guard.
  - `[low]` `[patch]` Edge claim (same root as the wall-clock row): "1500 ms of decoding" is not what wall-clock `see()` measures across gaps. Patched by the same resume on visibility.
  - `[low]` `[patch]` Verification gap: nothing proves that empty decodes reach `gate.see` and release a timed-out hold. Restoring `if (!result) return` would pass every test. Patched: a scanScreen case where X is read, empty decodes run for `LEFT_VIEW_MS`, then Answer, Back, and X reads again.
  - `[low]` `[patch]` Verification gap (other): the decode-callback comment says empty callbacks "move the gate's clock". They only let a timed-out hold be released. Patched: comment reworded.
  - `[false]` `[reject]` Intent: in-library, not-found and couldn't-look-it-up outcomes, still shown as Scan with `?isbn=`, now read again. The screen shown is Scan, where EXPERIENCE.md does not pause reading. The handled X stays held, so it does not loop.
  - `[low]` `[reject]` Intent: "left view" is 1.5 s without decoding X, tested with synthetic callbacks. A camera cannot observe absence directly. The phone check covers the real device, and no automated surface has a camera.
  - `[low]` `[reject]` Intent: typed entries are not held, and holds also cover error outcomes. Typed: a typed ISBN means the camera did not read that book, and holding it would need browser normalisation (Design Notes). The error outcomes are covered by the second Blind row.
  - `[false]` `[reject]` Intent: "lookup running" is the transition's `pending`. `pending` is exactly the wait for the server render that runs the lookup in `page.tsx`, so it is no proxy for something else.
  - `[low]` `[defer]` Intent: the history clause is asserted, not exercised. No test walks Scan → A → Back → B → Back → Back to the section. The behaviour existed before this story and needs real browser history. Deferred to 3.52's Playwright scan-to-save.
  - `[false]` `[reject]` Intent: sprint status `done` before review. Same as the Blind row; finalization aligns them.

## Design Notes

**Time out of view, not attempts.** zxing attempts every 100 ms plus decode time, which varies by phone, so a count of misses would mean a different wait on each device. A held barcode that is still in view can fail to decode for a moment (blur, a hand moving). 1500 ms is long enough to ride that out, and short enough that a second copy of the same edition (duplicates are real) only needs a brief move out of frame. A different ISBN is never delayed.

**Camera reads only.** The rule stops the camera from rereading the book in front of it. A typed ISBN means the camera did not read that book. Holding it would mean normalising typed text in the browser, which the spine forbids.

**Why the gate lives in `CameraSession`.** `ScanScreen` unmounts for every Answer, and the layout-held session is the one thing that lives exactly as long as the scan task (same lifetime as the stream).

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: 0 errors
- `npm run test:unit` -- expected: all pass (`scanScreen`'s first barcode test is a known flake under parallel worktrees; re-run it alone before treating it as a failure)
- `npm run test:int` -- expected: all pass (Postgres on 5435)

**Manual checks:**
- On the phone over `tailscale serve`: scan a fixture book and tap Back with the book still in frame, and the Answer does not reopen. Move it away for about 2 s and back, and it reopens. A second book opens at once.

## Auto Run Result

**Summary:** Scan now follows EXPERIENCE.md's scan loop rules.
- **The gate.** A task-scoped read gate (`scan/readGate.ts`, held by `CameraSession`) remembers the last ISBN the camera handled. It ignores that ISBN until the ISBN has gone unread for 1500 ms while the camera is decoding. A different ISBN is never delayed.
- **Time that does not count.** Time on an Answer, and time with the page hidden, does not count as out of view: `resume` runs on loop start and on `visibilitychange` to visible.
- **When reading pauses.** Only from a read or a Go until that lookup's transition is no longer pending. An Answer still unmounts the scanner. An `isbn` in the address no longer stops reading; a read there replaces.
- **History.** The rule was already met by `useTaskBack` and push/replace, and is unchanged.

**Files changed:**
- `src/app/(frontend)/scan/readGate.ts` (new): the pure gate (`see`, `hold`, `resume`, `LEFT_VIEW_MS`).
- `src/app/(frontend)/scan/CameraSession.tsx`: one gate per scan task, on the context.
- `src/app/(frontend)/scan/ScanScreen.tsx`:
  - the gate in the decode callback;
  - `resume` on loop start and on visibility;
  - the `paused` ref replacing the `isbn`-based ignore;
  - one guard for camera and Go.
- `tests/unit/readGate.unit.spec.ts` (new): the gate's timing rules.
- `tests/unit/scanScreen.unit.spec.ts`:
  - a suspending `Lookup` stand-in for a pending lookup;
  - tests for each I/O matrix row, the empty-decode release and the hidden page.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.51 `done`.

**Review findings:** 21 in total (medium 2, low 12, false 7).
- **Patched, 4 entries:**
  - the gate counting hidden-page time (medium; Blind, Edge and an Edge claim);
  - the `submit` guard for the gap before `pending` commits (low; Blind and Edge);
  - a test for empty decodes releasing a timed-out hold (low);
  - the decode-callback comment (low).
- **Deferred, 1:** an end-to-end walk of the history rule, to 3.52's Playwright.
- **Rejected:**
  - the hold covering error outcomes on Scan: deliberate, and it prevents a lookup loop;
  - sprint `done` before review: aligned at commit (two rows);
  - no feedback for a held read: the specified behaviour;
  - the stale `startLookup` setter: no test reaches it;
  - `decoder(loop)` spinning: it fails clearly, and the deps are stable;
  - stale Code Map lines and repetition in the spec: spec edits;
  - blank frames after a remount: `resume` runs after `play()`, and the rejected play is rare;
  - Answer kinds still shown as Scan reading again: they are Scan on screen, and X stays held;
  - "left view" being a time proxy: no camera without a device;
  - typed entries not held: browser normalisation would be needed;
  - `pending` as the lookup signal: it is exactly the server render's wait.

**Follow-up review recommended:** false. Patched counts by verdict: high 0, medium 1, low 3.

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (36 warnings, all pre-existing in migrations).
- `npm run test:unit`: 620 passed.
- `npm run test:int`: 371 passed, 1 skipped (Postgres on 5435).
- The implementer showed that each new test fails without its rule (pause, hold, resume, visibility listener, empty-decode pass-through).
- The manual phone check was not run.

**Residual risks:**
- **Not run on a phone:**
  - real decode cadence;
  - a barcode in view that fails to decode for more than 1.5 s, which would reopen its Answer;
  - behaviour after lock and unlock.
- **Reading could stay paused.** The pause clears when `pending` flips back to false. If a navigation ever failed to commit `pending = true`, reading would stay paused until Scan remounts.
- **Typed ISBNs are not held.** A typed ISBN whose barcode is readable in frame reopens its Answer after Back.
- **Merge conflict ahead.** Story 3.48 (in its own worktree) will add Answer kinds in `page.tsx`. This story did not touch that file, but whichever story merges second should check that its Answers still unmount `ScanScreen`.
