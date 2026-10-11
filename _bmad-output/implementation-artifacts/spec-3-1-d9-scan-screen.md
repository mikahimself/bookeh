---
title: 'Story 3.1: [D9] Scan screen'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: '4ff7d3a3f20e48acad10cfa5cf2e4ee2402e28bc'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: [multiple-goals, oversized]
deferred:
  - summary: >-
      Story AC 7, the owner's acceptance on the iPhone (installed PWA over HTTPS: camera starts, a barcode navigates to the Answer address, one permission prompt per launch), is not performed by this run.
    evidence: |-
      The only camera, zxing and next/form paths this run exercises are jsdom unit tests with those APIs mocked; the device surface the AC names cannot be reached from this machine. The Design Notes record the standalone-mode permission behaviour the AC asks for. Settled by opening /scan in the installed app, granting the camera, scanning one book, and tapping X.
    location: >-
      src/app/(frontend)/scan/ScanScreen.tsx
    severity: medium (unverified)
  - summary: >-
      After the camera lands in `off` inside one task (a track `ended`, which iOS may raise when the installed app is backgrounded mid-session) there is no way back to the frame short of closing and reopening Scan.
    evidence: |-
      CameraSession.start() is one-shot by design (started ref). Whether iOS ends the track or only mutes it while backgrounded is not established; if it ends it, a long shelf session interrupted by a phone call shows "No camera. Type the ISBN." until X. Settled by backgrounding the installed app on the Scan screen for a minute and returning.
    location: >-
      src/app/(frontend)/scan/CameraSession.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** `/scan` is an empty full-screen task. The primary flow needs a camera that reads ISBN barcodes and an ISBN field, both leading to `/scan?isbn=`, and the task's X (retro action item 10) breaks once the tab's history reaches the browser's 50-entry cap, exactly in a long scanning session.

**Approach:** A camera session held by a `/scan` layout provider for the life of the task; a Scan screen in the page with the camera frame (zxing, EAN-13 only, 978/979), the ISBN field as a `next/form` GET form, the no-camera state, and the submitted text under the field until the Answer exists. Task close tracks in-app history entries directly by stamping history state, and ignores a second tap while closing.

## Boundaries & Constraints

**Always:** Only EAN-13 results whose text starts with 978 or 979 are read; the browser never normalises what is typed and navigates to `/scan?isbn=<text as typed>`. The camera is requested only after Scan mounts, with the environment camera preferred, and is stopped when the `/scan` segment unmounts (X, browser Back to a section). Stopping the decode loop never stops the stream. From `/scan` a read pushes; from `/scan?isbn=` it replaces (the Answer replaces the previous one in history). Reading is ignored while an `isbn` is in the address and after a read until the address changes. zxing is imported lazily inside the client component, never in a server component or a section bundle. Strings in `messages/en.json` and `fi.json`. Pinned dependency versions. Keep `FullScreenTask`, the view-transition CSS and `useSuspendSwipe` as they are.

**Never:** Call the lookup or any source (3.9, 3.28, 3.45). Normalise, validate or mark the ISBN (3.3, 3.45). The "Find by title or author" and "Add without ISBN" Links (Epics 8, 3.49). The same-book-twice rule and the lookup pause (3.51). Torch, zoom or device pickers. A Playwright test. A tests-only change to `vitest.config.mts`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Barcode read | zxing result, format `EAN_13`, text `9789510123456` | `isbnFromBarcode()` → `9789510123456`; `router.push('/scan?isbn=9789510123456')` | No error expected |
| Not an ISBN barcode | `EAN_13` text `5901234123457`; `EAN_8`, `UPC_A`, `QR_CODE` results; `NotFoundException` between frames | `null`; nothing happens, loop continues | Decode errors are swallowed by the loop |
| Read while handled | address already `/scan?isbn=…`, or a read just navigated | ignored | No error expected |
| Read on an Answer address | `/scan?isbn=a`, read `b` | `router.replace('/scan?isbn=b')` | No error expected |
| No camera | `getUserMedia` rejects (denied, none, insecure context) or `navigator.mediaDevices` missing | the frame is replaced by "No camera. Type the ISBN." and the field takes focus | Rejection caught; nothing logged to console |
| Camera lost mid-session | the video track fires `ended` | same as no camera | No error expected |
| Task close with in-app entries | `/` → Scan book → `/scan` (depth 1), X | `router.back()`, slide-away as today, even with `history.length` at the cap | No error expected |
| Task close opened directly | `/scan` loaded in a fresh tab (no stamp) | `router.replace('/')` | No error expected |
| Double tap on X | second tap during the closing transition | ignored | No error expected |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/page.tsx` -- today renders an empty `FullScreenTask` inside `<ViewTransition enter="task-enter" exit="task-exit">`. Read `searchParams` (Promise; `isbn` may be `string | string[] | undefined`, take the first string) and render `<ScanScreen submitted={isbn} />` as the task's children. Next keys the page subtree without search params (`layout-router.js:549`, `createRouterCacheKey(segment, true)`), so client state survives `/scan` → `/scan?isbn=`; the Answer page (3.45) will not render the frame, which is why the stream lives above the page.
- `src/app/(frontend)/scan/layout.tsx` -- new, server: `<CameraSession>{children}</CameraSession>`. Layouts persist across search-param changes and never re-render on them (`node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:43`). No `requireUser()` here; the page does it.
- `src/app/(frontend)/scan/CameraSession.tsx` -- new, client provider. State `idle | starting | on | off` plus the `MediaStream`; `start()` is idempotent, guards `navigator.mediaDevices?.getUserMedia`, calls `getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false })`, listens for the video track's `ended` → `off`, stops all tracks on unmount. Nothing touches the camera until `start()`.
- `src/app/(frontend)/scan/ScanScreen.tsx` -- new, client: calls `start()` on mount; renders the camera frame (DESIGN.md Components, Camera frame: `border-2 border-text`, a `<video autoPlay playsInline muted>` filling it, an absolute `h-stroke-control bg-accent` guide line across the middle; the hint text under or over it) or, when `off`, the no-camera message in its place and focuses the field; the ISBN field as `<Form action="/scan" replace={submitted !== undefined}>` from `next/form` (string action = GET, client-side navigation, `docs/01-app/03-api-reference/02-components/form.md`) with `<TextField name="isbn" enterKeyHint="go" autoComplete="off" autoCapitalize="off" autoCorrect="off">` and no button (implicit submission); the submitted text in `text-meta` under the field when `submitted` is set. Decode loop: when `on`, set `video.srcObject`, `await video.play()`, lazy `import('@zxing/browser')` and `import('@zxing/library')`, `new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 100, delayBetweenScanSuccess: 500 })` with `DecodeHintType.POSSIBLE_FORMATS = [BarcodeFormat.EAN_13]`, then `reader.scan(video, callback)` (public on `BrowserCodeReader`; its `stop()` only ends the loop, unlike `decodeFromStream`'s stop which disposes the stream — `BrowserCodeReader.js:693-710`). Cleanup: `controls.stop()`, `video.srcObject = null`. A `handledRef` is set true on a read and reset from `submitted` on every prop change.
- `src/app/(frontend)/scan/barcode.ts` -- new, pure: `isbnFromBarcode(format: string, text: string): string | null` — `format === 'EAN_13'` and `/^97[89]\d{10}$/`. Takes the format name (`BarcodeFormat[result.getBarcodeFormat()]`) so the unit test needs no zxing import; the component maps the enum.
- `src/app/(frontend)/components/navigation.ts` -- rework for retro item 10. `NavigationTracker` installs once (module flag) wrappers on `history.pushState` / `replaceState` that stamp `__bookehDepth` on the state object (push: `depth + 1`; replace: current depth) and a `popstate` listener that reads the stamp (`event.state?.__bookehDepth ?? 0`); initial depth from `history.state?.__bookehDepth ?? 0` so a reload keeps it. Next passes its own fresh state object on every internal push (`app-router.js:51-67`), and its public patch copies only `__NA` and the tree (`app-router.js:84-96`), so the stamp must be added by our wrapper, not by spreading `history.state`. `useCloseTask()`: `depth > 0` → back branch, else `router.replace('/')`; a module `closing` flag set on the back branch and cleared on `popstate` or the timeout makes a second tap a no-op. Keep the view-transition choreography and `EXIT_TIMEOUT_MS`. Drop `loadedLength` and every read of `history.length`. Export a small pure core (`stampPush(state, depth)`, `depthOf(state)`, `canGoBackInApp()`) for the test.
- `src/app/(frontend)/layout.tsx:46` -- `<NavigationTracker />` stays where it is.
- `src/app/(frontend)/components/TextField.tsx` -- reuse; accepts `name`, `enterKeyHint`, `ref` (React 19 ref prop) through `ComponentProps<'input'>`.
- `src/app/(frontend)/components/FullScreenTask.tsx` -- unchanged; `children` is already supported.
- `messages/en.json`, `messages/fi.json` -- under `scan`: `cameraHint` "Point the camera at the barcode" / "Osoita kameralla viivakoodia", `isbn` "Or type an ISBN" / "Tai kirjoita ISBN", `noCamera` "No camera. Type the ISBN." / "Ei kameraa. Kirjoita ISBN." `tests/unit/messages.unit.spec.ts` enforces parity.
- `package.json` -- add `@zxing/browser` `0.2.1` and its peer `@zxing/library` `0.23.0` (spine Dependencies table), exact pins like the rest.
- `eslint.config.mjs:254` -- `react/jsx-no-literals` with `noStrings`: every visible string through `t()`; the submitted text is a value, fine.
- `tests/unit/scanScreen.unit.spec.ts` -- new, jsdom: render `ScanScreen` inside a `CameraSession` with `navigator.mediaDevices.getUserMedia` stubbed and `@zxing/browser` / `@zxing/library` mocked so the test drives the decode callback by hand; mock `next/navigation` (`push`, `replace`) and `next/form` as a plain form. Rows: a read on `/scan` pushes; a read with `submitted` set is ignored; a second read before the prop changes is ignored; a read on an Answer address replaces; a rejected `getUserMedia` shows the no-camera message and focuses the field; a track `ended` event does the same.
- `tests/unit/signOutButton.unit.spec.ts` -- the jsdom pattern (`// @vitest-environment jsdom` docblock, `@testing-library/react`).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-1-d9-scan-screen` → `done`; action item `epic-1-retro-item-10-…` → `done` with a `resolution:` line, at the end.

## Tasks & Acceptance

**Execution:**
- `package.json`, `package-lock.json` -- add `@zxing/browser@0.2.1`, `@zxing/library@0.23.0` -- the spine's pinned scanner.
- `src/app/(frontend)/scan/barcode.ts` -- `isbnFromBarcode()` -- the one rule that decides what counts as a read.
- `src/app/(frontend)/scan/CameraSession.tsx`, `scan/layout.tsx` -- the stream held for the task's lifetime -- "stays on until the task is closed".
- `src/app/(frontend)/scan/ScanScreen.tsx` -- frame, decode loop, field, no-camera state, submitted text -- the screen.
- `src/app/(frontend)/scan/page.tsx` -- read `isbn`, render `ScanScreen` inside the task -- the Answer's future home reads the same param.
- `src/app/(frontend)/components/navigation.ts` -- stamped depth tracker and the closing guard -- retro item 10.
- `messages/en.json`, `messages/fi.json` -- the three strings.
- `tests/unit/barcode.unit.spec.ts` -- the I/O rows for reads -- pure rule.
- `tests/unit/scanScreen.unit.spec.ts` (jsdom) -- the read, handled, no-camera and camera-lost rows -- the rules that can break without anyone noticing.
- `tests/unit/navigation.unit.spec.ts` (jsdom) -- push stamps, replace carries, popstate restores, unstamped entry means no in-app back -- pins the cap fix without `history.length`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- status and action item 10.

**Acceptance Criteria:**
- Given a signed-in user on a section, when Scan book is tapped, then `/scan` shows the heading, the camera frame (2px text rectangle with the accent guide line) with the live video once permission is granted, and the ISBN field under it.
- Given the camera is on and an EAN-13 starting 978/979 is in view, when zxing decodes it, then the address becomes `/scan?isbn=<13 digits>` with no tap, and no further navigation happens while that address holds.
- Given text in the field, when Go/Enter is pressed, then the address becomes `/scan?isbn=<text as typed>` by client-side navigation (the video keeps playing) and the text shows under the field.
- Given no camera or a refusal, when Scan opens, then "No camera. Type the ISBN." stands where the frame was and the field has focus.
- Given Scan was opened from a section, when X is tapped, then the task slides away to the section regardless of how long the tab's history is; a second tap during the slide does nothing.
- Given `npm run test:unit`, `npm run lint`, `npm run typecheck` and `npm run build`, when they run, then all pass; `@zxing` chunks are absent from the section pages' client bundles.
- Given Mika's iPhone with the installed PWA over HTTPS, when `/scan` opens, then the camera starts and a book's barcode navigates to the Answer address — performed by the owner; this run records it as unverified and writes the standalone camera-permission notes below.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 26 findings — high 0, medium 7, low 16, false 1, maybe-false 2 (the intent-alignment layer is descriptive; its observation (a) is routed below, (b) and (c) coincide with blind 2 and verification-gap 4, (d) is refuted: whichever wrapper is installed first, Next's internal push passes through ours, so the stamp lands in both orders)
- findings:
  - `[medium]` `[patch]` (blind 1) `closing = true` lived inside `back()`, which the view-transition branch runs from `startViewTransition`'s deferred callback, so a second X tap in that window started a second transition and a second `router.back()` — Fix applied: the flag is set synchronously before any branching and cleared in `done`.
  - `[low]` `[reject]` (blind 2) The spec's matrix row "Read on an Answer address → replace" contradicts its own row 3, Boundaries and AC 2 — real, but the fix edits this build's spec. The code follows the repeated rule, which EXPERIENCE.md states ("Reading pauses … while an Answer is showing"); only the typed field replaces, through `<Form replace>`. Recorded under Auto Run Result for Stories 3.45 and 3.51.
  - `[low]` `[patch]` (blind 3) Go on an empty field gave `submitted=''`, which stopped reading and drew an empty line — Fix applied: `page.tsx` passes `undefined` when the text is empty after trimming.
  - `[low]` `[patch]` (blind 4) While the permission prompt was pending the screen showed an empty frame and the hint; EXPERIENCE.md line 339 says Scan shows the no-camera state until permission is given — Fix applied: the message renders whenever the state is not `on`; the field is focused only on `off`.
  - `[maybe-false]` `[defer]` (blind 5) No recovery once the camera is `off` within a task (iOS ending tracks when backgrounded) — if true, medium; not established from the diff. Deferred: settled by backgrounding the installed app on Scan and returning.
  - `[low]` `[reject]` (blind 6) `@zxing/library@0.23.0` declares `engines.node >= 24` while the image and CI run Node 22.23.3 — verified in the lockfile; `.npmrc` sets no `engine-strict`, so `npm ci` warns (EBADENGINE) and continues; the library runs in the browser. A Node bump for a warning is not worth it; recorded as a residual.
  - `[low]` `[patch]` (blind 7) `next/form` prefetched `/scan` while the user was on it — Fix applied: `prefetch={false}`.
  - `[low]` `[patch]` (blind 8) The last navigation test left `closing` true with a pending timer under fake timers — Fix applied: `afterEach` runs all timers; `requestAnimationFrame` is faked too.
  - `[false]` `[reject]` (blind 9) Spec `in-review` while sprint-status says `done`, and no results recorded — the review's interim state; finalisation writes `done` and the results below.
  - `[low]` `[patch]` (blind 10) `<video>` had no accessible name — Fix applied: `aria-label={t('cameraHint')}`.
  - `[medium]` `[patch]` (edge-case 1) Same defect as blind 1 — Fix applied with it.
  - `[low]` `[patch]` (edge-case 2) Same defect as blind 3 — Fix applied with it.
  - `[low]` `[reject]` (edge-case 3) A failed dynamic zxing import leaves the video playing with no message — without a service worker an offline PWA cannot load the page at all, and the fix adds a state and a branch for an undemonstrated path.
  - `[low]` `[reject]` (edge-case 4) `play()` rejecting outside cleanup gives zxing a 0×0 canvas and a silently dead loop — `play()` resolving implies the dimensions are known, and a rejection with a live stream (muted inline autoplay is allowed) was not shown reachable; the fix adds a guard.
  - `[maybe-false]` `[reject]` (edge-case 5) A `mute` event should land in `off` — iOS mutes and unmutes the track while the app is backgrounded and the video resumes by itself; treating mute as off would break the normal return; if true, low.
  - `[low]` `[reject]` (edge-case 6) A barcode decoded while the X close is in flight pushes against the pending back — needs a barcode entering view during the ~200 ms slide; the fix exports a flag and adds a branch. Handed to Story 3.51 (scan loop rules) under residual risks.
  - `[medium]` `[patch]` (edge-case 7, claim) Same defect as blind 1 — Fix applied with it.
  - `[medium]` `[patch]` (verification-gap 1) Removing the `popstate` listener still passed because `runAllTimers()` fired the 1 s fallback — Fix applied: with `requestAnimationFrame` faked, a popstate plus one frame makes the next tap live without reaching `EXIT_TIMEOUT_MS`, and with no popstate the tap stays dead at 999 ms and is live at 1000 ms.
  - `[low]` `[patch]` (verification-gap 2) The reload-keeps-depth seed was unpinned — Fix applied: a `vi.resetModules()` case installs against a state stamped with depth 1 and expects in-app back.
  - `[medium]` `[patch]` (verification-gap 3) Nothing asserted the stream stops when the segment unmounts — Fix applied: `unmount()` → `track.stop`; a stream resolving after unmount → `track.stop` and no `scan`.
  - `[low]` `[patch]` (verification-gap 4) The `next/form` mock dropped `replace` — Fix applied: forwarded as `data-replace`, asserted present with `submitted` and absent without.
  - `[low]` `[patch]` (verification-gap 5) `getUserMedia` constraints unasserted — Fix applied: asserted `{ video: { facingMode: { ideal: 'environment' } }, audio: false }`.
  - `[low]` `[reject]` (verification-gap, other 1) Same as blind 2 — spec edit.
  - `[medium]` `[patch]` (verification-gap, other 2) Same defect as blind 1 — Fix applied with it.
  - `[low]` `[reject]` (verification-gap, other 3) The view-transition branch of `useCloseTask` has no test — pre-existing; jsdom has no `startViewTransition`. The guard that lived there is now set before the branch and pinned by the two-tap test.
  - `[medium]` `[defer]` (intent-alignment a) AC 7's acceptance lives on the iPhone; this run reaches only jsdom — deferred as unverified in the frontmatter; the owner's check settles it.

## Auto Run Result

Status: done

**Summary.** `/scan` is the Scan screen. A `/scan` layout holds the camera stream in `CameraSession` for the life of the task (requested once, environment camera preferred, stopped when the segment unmounts, a track ending lands in `off`). `ScanScreen` renders the camera frame (2px text rectangle, accent guide line, live video) once the camera is on, and "No camera. Type the ISBN." while the permission prompt is pending or the camera is refused or missing (then the field takes focus). zxing is imported lazily inside the screen and driven through `reader.scan()` with EAN-13 as the only format; `isbnFromBarcode()` accepts 978/979 only, and a read pushes `/scan?isbn=<digits>`; reads are ignored while an `isbn` is in the address and after a read until it changes. The ISBN field is a `next/form` GET form (client-side navigation, `enterKeyHint="go"`, no prefetch) that replaces the entry when submitted from an Answer address; the submitted text shows under the field until the Answer exists; an empty submission is no submission. Retro action item 10 is done: `navigation.ts` stamps a depth on every history state it writes and follows `popstate`, so the X goes back when an in-app entry sits below and replaces to `/` otherwise, never reading `history.length`; a second tap while a close is in flight is a no-op.

**Files changed.**
- `src/app/(frontend)/scan/layout.tsx`, `CameraSession.tsx` — new: the stream provider for the segment.
- `src/app/(frontend)/scan/ScanScreen.tsx`, `barcode.ts` — new: the screen, the decode loop, the ISBN rule.
- `src/app/(frontend)/scan/page.tsx` — reads `isbn`, renders the screen inside the task.
- `src/app/(frontend)/components/navigation.ts` — depth-stamped history tracking; closing guard.
- `messages/en.json`, `messages/fi.json` — `scan.cameraHint`, `scan.isbn`, `scan.noCamera`.
- `package.json`, `package-lock.json` — `@zxing/browser` 0.2.1, `@zxing/library` 0.23.0.
- `tests/unit/barcode.unit.spec.ts`, `navigation.unit.spec.ts`, `scanScreen.unit.spec.ts` — new.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 3.1 done; retro item 10 done with its resolution.

**Review findings.** 26 rows: 15 patched (grouped into 10 entries: 3 medium — the double-tap guard, the popstate liveness test, the camera-stop test — and 7 low), 2 deferred (phone acceptance; recovery after `off`, both unverified medium), 9 rejected: blind 2 and verification-gap other 1 (spec edit; the code follows EXPERIENCE.md — Stories 3.45 and 3.51 should read "reading pauses on an Answer" and "the typed field replaces", not "a read replaces"), blind 6 (engine warning only), blind 9 (interim status), edge-case 3, 4 and 6 (guard-adding fixes for undemonstrated paths; edge-case 6 handed to 3.51), edge-case 5 (mute is temporary on iOS), verification-gap other 3 (pre-existing untestable branch).

**Follow-up review recommendation:** true. Patched by verdict: high 0, medium 3, low 7. The specific unverified risk: the view-transition branch of `useCloseTask` — where the double-tap defect lived — runs only in a browser with `startViewTransition`; the flag is pinned in the no-transition branch alone.

**Verification.** `npm run test:unit` 21 files / 302 tests pass; `npm run test:int` 13 files / 107 pass, 1 pre-existing skip; `npm run lint` 0 errors (8 pre-existing warnings in `src/migrations`); `npm run typecheck` clean; prettier clean on the changed files; `DATABASE_URL= npm run build` succeeds with `/scan` dynamic (with the dev `DATABASE_URL` set, `next build` runs `prodMigrations` and waits on Payload's interactive prompt — pre-existing). Only `.next/server/app/(frontend)/scan/page_client-reference-manifest.js` references the zxing chunk. Not performed: the iPhone acceptance (deferred).

**Residual risks.** The phone acceptance and the standalone permission behaviour (Design Notes) await the owner. `npm ci` prints an EBADENGINE warning for `@zxing/library` on Node 22. A barcode decoded during the X slide can push against the pending back (Story 3.51). The camera stays on across `/scan/find` once Lookup exists (Epic 8 decides). `--pass-with-no-tests` still applies to Playwright until Story 3.52.

## Design Notes

**Why the stream lives in the layout.** Next renders the page subtree under one key for `/scan` and `/scan?isbn=`, so this story alone would survive in the page. Story 3.45 replaces the page's children with the Answer, which has no frame; a stream owned by `ScanScreen` would stop on every Answer and re-request (and on iOS re-prompt) on every Back. The layout provider outlives both and stops the tracks only when the `/scan` segment unmounts. Lookup (`/scan/find`, Epic 8) shares the segment; pausing or stopping the camera there is that epic's call.

**Camera permission in standalone mode (for the AC's notes).** WebKit bug 215884 ("getUserMedia recurring permissions prompts in standalone when hash changes"): on iOS 13 a home-screen web app lost camera permission on every hash/route change; a commenter reports "In 14.5 the prompt for camera permission does not show on every page anymore"; the bug is closed CONFIGURATION CHANGED with the engineer noting the fix sits in Safari's standalone implementation, not WebKit. What still holds: the grant is not persisted across launches of the installed app (reports up to iOS 18.5 of the setting reverting to "Ask"), so expect one prompt per launch of bookeh, before the first frame shows. Within a launch the stream is requested once and held by the provider, so pushes to `/scan?isbn=` and back never call `getUserMedia` again. If the phone does re-prompt on the push, the fallback is to drive the Answer without a URL change, which contradicts the spine (the page renders the Answer from search params) and would need a decision, not a patch. The app runs only over HTTPS on the phone (`tailscale serve`); `http://<lan-ip>` is not a secure context and shows the no-camera state by design.

**Depth tracker sketch.**
```ts
const install = () => {
  const push = history.pushState.bind(history)
  history.pushState = (state, unused, url) => push(stamp(state, depth + 1), unused, url)
  // replaceState: stamp(state, depth); popstate: depth = depthOf(event.state)
}
```
`stamp` adds `__bookehDepth` to an object state and wraps anything else; Next's own `__NA` and tree keys stay. `depth` is module state, like `holds` in `swipe.ts`.

## Verification

**Commands:**
- `npm run test:unit` -- expected: pass, including `barcode` and `navigation`.
- `npm run lint && npm run typecheck` -- expected: clean (no literals in JSX, no `any`).
- `npm run build` -- expected: succeeds; `/scan` is dynamic; grep `.next/static/chunks` to confirm the zxing chunk is loaded only by the scan screen.
- `npm run test:int` -- expected: unchanged, pass (Postgres up).

**Manual checks (if no CLI):**
- Desktop browser, `http://localhost:3000/scan`: with a webcam the prompt appears and the frame shows video; denied → no-camera message and focused field; Enter in the field → `/scan?isbn=…` with the text under the field, video still playing; X slides back to the section.
- iPhone, installed PWA over HTTPS: the owner's acceptance, recorded as unverified by this run.
