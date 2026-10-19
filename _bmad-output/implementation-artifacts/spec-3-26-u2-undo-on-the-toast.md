---
title: 'Story 3.26: [U2] Undo on the toast'
type: 'feature'
created: '2026-10-19'
baseline_revision: '5d2fbee83f166bf24cbe17278c9007d0c691f62e'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `lib/undo` (3.25) records receipts and `undo(ctx, token)` spends them, but nothing on the surface can call it: the toast shows a message and a close only, and no server action exposes `undo()`. Every undoable action of EXPERIENCE.md → Undo (save, move, lend, ...) needs the same Undo Link, "Undone" moment, "Couldn't undo." and client-side expiry (FR-15, UX-DR27, UX-DR52, AD-20).

**Approach:** Give the success toast an optional `undo: { token, seconds }`, carried through `flashToast()` and the store; the store hides the token when the seconds run out; the provider renders an Undo Link that calls one new `undoAction` and swaps the toast for "Undone" or an error toast.

## Boundaries & Constraints

**Always:**
- `ToastInput` success gains `undo?: { token: string; seconds: number }` in `store.ts`. `ToastState` gains `undoToken: string | null`: set on `show()` when the input is a success with `undo` and `seconds > 0`, else `null`. The store starts a second timer of `seconds * 1000` ms that sets `undoToken` to `null` and leaves the toast otherwise as it is; every `show()` and the toast's removal clear that timer. No other code decides expiry.
- `decodeFlash` carries a well-formed `undo` (string `token`, finite number `seconds`) through and drops a malformed one, as it drops a forged `hold`. `flashToast` is unchanged (it serialises the whole input).
- `src/app/(frontend)/actions/undo.ts` (`'use server'`) exports `undoAction(token: unknown): Promise<ActionResult<null>>`: `runAction` → `requireUserOrThrow()` → `VALIDATION` unless `token` is a string → `undo(ctx, token)` → `null`. It is the only caller of `undo()` (AD-20) and lives in `actions/` because the provider serves every page.
- `ToastView` takes `actions?: ReactNode`, rendered between the message and the Close (X) (DESIGN.md → Toast: "actions as Links"). The provider passes an `ActionLink` labelled `t('toast.undo')` only while `state.undoToken` is set; it is `disabled` while the action is pending (`useTransition`). A toast without a token renders no Link.
- On tap the provider calls `undoAction(state.undoToken)`; a rejected call counts as `{ ok: false, code: 'INTERNAL' }` (the `SignOutButton` pattern). `ok` → `show({ kind: 'success', message: t('toast.undone') })`, a timed success with no `hold` (EXPERIENCE.md → Feedback: "becomes 'Undone' for a moment"). `UNAUTHENTICATED` → `router.replace('/login?next=' + encodeURIComponent(pathname))`. Any other code → `show({ kind: 'error', code })` (`UNDO_FAILED` reads "Couldn't undo."). Nothing else changes on the screen.
- New message keys `toast.undo` ("Undo" / "Kumoa") and `toast.undone` ("Undone" / "Kumottu") in both catalogues; `tests/unit/messages.unit.spec.ts` checks them beside `toast.close`.
- The provider imports from `src/lib` only types (lint rule `clientLibImports`); `undo()` is reached through the action module alone. No `any`, no `console.*`.

**Never:**
- No undoable service, no save and no save toast (D4/D6/D18, 3.35–3.47): nothing in this story records a receipt in product code. No Edit Link (Epic 4). No change to `lib/undo`, `withTransaction` or `runAction`. No countdown shown to the user, no per-second re-render, no `localStorage` or cookie for the token beyond the existing flash cookie. No shared client action helper (A25, 3.44) and no change to `settings/report.ts`. No Playwright.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Undo succeeds | Success toast with `undo: { token, seconds: 1800 }`; tap Undo; `undoAction` answers `{ ok: true, data: null }` | `undoAction` called once with `token`; the toast is replaced by a success "Undone" with no `hold`, which leaves after the usual 8 s; no Undo Link on it | No error expected |
| Undo fails | As above; `undoAction` answers `{ ok: false, code: 'UNDO_FAILED' }` | Error toast "Couldn't undo." (`errors.UNDO_FAILED`), no timer; the Undo Link is gone with the replaced toast | Error shown as the toast |
| Call rejected | `undoAction` rejects (network) | Error toast `INTERNAL` | Mapped, not thrown |
| Signed out | `undoAction` answers `UNAUTHENTICATED` | `router.replace('/login?next=%2Fscan')` for pathname `/scan`; no toast | Redirect |
| No token | Success toast without `undo`, or an error toast | No Undo Link; the rest of the toast unchanged | No error expected |
| Seconds run out | Held success toast with `seconds: 5`; 5 s pass on fake timers | `undoToken` becomes `null`, the toast stays with its message and X, the Link is gone | No error expected |
| Zero seconds | `undo: { token, seconds: 0 }` | No Undo Link from the start | No error expected |
| Flash round trip | `flashToast({ kind: 'success', message, hold: true, undo: { token, seconds } })`; `takeFlash` on the wire value | The same input, `undo` included | No error expected |
| Forged undo | Cookie JSON with `undo: { token: 1 }` or `undo: 'x'` | Decodes to the success without `undo` | Dropped silently |
| Pending tap | Undo tapped; the action has not answered | The Link is `disabled`; a second tap does nothing | No error expected |
| Action: unknown token | `undoAction('never-issued')` with a signed-in user | `{ ok: false, code: 'UNDO_FAILED' }` | From `undo()` |
| Action: real receipt | `withUndo(ctx, fn)` records a receipt for a row of the user; `undoAction(token)` | `{ ok: true, data: null }` and the restore ran (the row is gone) | No error expected |
| Action: bad input | `undoAction(42)` | `{ ok: false, code: 'VALIDATION' }` | Before `undo()` |

</intent-contract>

## Code Map

- `src/app/(frontend)/components/toast/store.ts` -- `ToastInput`, `ToastState`, `createToastStore(leaveMs, successMs)`: one `timer` for leaving; add `undoTimer` and `undoToken` here. `show()` clears timers then sets state; `set(null)` after leaving is where the undo timer is also cleared.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- `'use client'`; owns the store, reads the flash cookie on pathname change, renders `ToastView` keyed per `state.id`. Add `useRouter`, `useTransition` and the Undo handler here; `usePathname()` is already in scope for the `next=` path.
- `src/app/(frontend)/components/toast/ToastView.tsx` -- presentational box: message `mr-auto`, then `CloseButton`. Insert the `actions` slot before the X.
- `src/app/(frontend)/components/toast/flashCookie.ts:66-90` -- `decodeFlash`: the success branch builds the object field by field (`hold` only when `true`); extend it for `undo`.
- `src/app/(frontend)/components/Link.tsx` -- `ActionLink` (a `<button type="button">` styled as a Link, `disabled` styles included): the Undo Link.
- `src/app/(frontend)/actions/account.ts` -- shape of a shared server action: `'use server'`, `runAction`, `requireUserOrThrow`, `DomainError('VALIDATION')` on bad client input.
- `src/app/(frontend)/components/SignOutButton.tsx` -- client pattern: `useTransition`, `.catch(() => ({ ok: false, code: 'INTERNAL' }))`, `UNAUTHENTICATED` handling.
- `src/app/(frontend)/(sections)/settings/report.ts` -- the `/login?next=` redirect for `UNAUTHENTICATED` (hard-coded to Settings there; the provider derives it from `usePathname()`). Leave it alone.
- `src/lib/undo/undo.ts` -- `undo(ctx, token)` throws `DomainError('UNDO_FAILED')`; `withUndo(ctx, fn)` for the integration test's receipt.
- `src/lib/errors.ts` -- `runAction`, `ActionResult`, `DomainError`.
- `src/i18n/next-intl.d.ts` -- message keys are typed from `en.json`: `t('toast.undo')` typechecks once the key exists.
- `messages/en.json:40-42`, `messages/fi.json:40-42` -- the `toast` block (`close` only today).
- `tests/unit/toastStore.unit.spec.ts` -- fake timers, `toMatchObject` on state; add the expiry cases here.
- `tests/unit/flashCookie.unit.spec.ts` -- `flash()` runs `flashToast` through `ResponseCookies`; `it.each` round-trip list and the "forged hold" case to extend.
- `tests/unit/signOutButton.unit.spec.ts` -- jsdom component test: `vi.mock` of `next-intl` (`t = key => key`), `next/navigation`, the action module; `fireEvent.click`, `waitFor`. Mock `usePathname` too for the provider.
- `tests/int/profileAction.int.spec.ts` -- action integration test: mocks `next/headers`, logs in with `payload.login` and passes the `payload-token` cookie header; `createUser()` from the harness.
- `tests/int/undo.int.spec.ts` -- `contextFor(user)` and the fake undoable function over a `locations` row, reusable for the "real receipt" row.
- `tests/unit/messages.unit.spec.ts:72-79` -- the `toast.close` check to extend.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:98` -- `3-26-u2-undo-on-the-toast: backlog` → `in-progress` at implementation, `done` at the end.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/components/toast/store.ts` -- `undo` on the success input, `undoToken` on the state, the expiry timer -- the client-side expiry in one place.
- `src/app/(frontend)/components/toast/flashCookie.ts` -- carry a well-formed `undo` through `decodeFlash` -- a save raised by `flashToast()` keeps its Undo.
- `src/app/(frontend)/actions/undo.ts` -- new `undoAction` -- the one entry point behind `undo()` (AD-20).
- `src/app/(frontend)/components/toast/ToastView.tsx` -- `actions` slot between message and X -- DESIGN.md Toast layout.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- Undo Link, pending state, result handling -- the behaviour of EXPERIENCE.md → Feedback (Undo done / failed / expired).
- `messages/en.json`, `messages/fi.json` -- `toast.undo`, `toast.undone` -- both languages.
- `tests/unit/toastStore.unit.spec.ts`, `tests/unit/flashCookie.unit.spec.ts`, `tests/unit/messages.unit.spec.ts` -- the matrix rows for expiry, zero seconds, round trip, forged `undo`, and the new keys -- pure functions, unit lane.
- `tests/unit/toastUndo.unit.spec.ts` -- new jsdom test of the provider: tap → `undoAction(token)` → "Undone"; failure → error toast; no token → no Link -- the one behaviour that can break.
- `tests/int/undoAction.int.spec.ts` -- new: unknown token, a real receipt undone, bad input, and `UNAUTHENTICATED` without a session -- the action's own contract.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-26-u2-undo-on-the-toast` status.

**Acceptance Criteria:**
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (lint: 0 errors in `src` and `tests`).
- Given a success toast shown with `undo`, when its seconds elapse on the client, then the Undo Link disappears while the toast and its X remain.
- Given the provider, when inspected, then `undo()` is reached only through `undoAction` and the provider imports nothing but types from `src/lib`.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 20 findings — high 0, medium 0, low 10, false 10, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: nothing refreshes server-rendered data after a successful undo (no `router.refresh()`). Verified: the provider only swaps the toast. No undoable action exists yet, so no screen can go stale today; the spine (Design Paradigm, shelf) gives the row reload to the client list component through `/data/shelf`, which `router.refresh()` would not drive. The screens that raise undoable toasts (3.47, Epics 5–7) decide their reload. Adding behaviour the intent does not name is more than a direct correction.
  - `[low]` `[reject]` blind: the `/login?next=` value drops the search string (`usePathname()` only), unlike `requireUser()`'s `PATH_HEADER`. Verified real. Reachable only when the session ends inside a toast's 30-minute window; the loss is a filter or `?book=`. The spec fixes `encodeURIComponent(pathname)`; the one client helper (A25, 3.44) owns this mapping. Residual risk below.
  - `[false]` `[reject]` blind: a backgrounded iOS PWA does not fire the 30-minute timer, so the user returns to a still-offered Undo. A suspended page's elapsed timers fire on resume, before a tap can land; a killed page loses the toast entirely. The overflow half of the finding is the edge row below.
  - `[low]` `[reject]` blind: focus falls to `body` when the Undo Link unmounts (expiry, "Undone", error). Verified real; keyboard-only use of a phone-first toast is rare and focus management is more than a direct correction.
  - `[low]` `[patch]` blind: the held "Saved · Undo" toast follows the user to `/login` after the `UNAUTHENTICATED` redirect, since the provider wraps `/login`. Verified real (`safeNextPath` maps a `next` of `/login` to `/`, so no loop, but the stale Link stays). Patched: `store.dismiss()` before `router.replace`; the provider test now asserts the Link is gone.
  - `[low]` `[patch]` blind: `decodeUndo`'s `Number.isFinite` guard is unreachable after `JSON.parse` and the test row "non-finite seconds" passes a string. Verified. The guard stays (the spec requires finite seconds and it costs nothing); patched the row's label and value to `['seconds as a string', { token: 'tok', seconds: '5' }]`.
  - `[false]` `[reject]` blind: spec bookkeeping (`deferred: []`, `in-review` vs sprint `done`, no oversized note; `INTERNAL` instead of "No connection."). The fix edits this build's spec. `NO_CONNECTION` is not an `ErrorCode` until A25 (3.44), which also sweeps the three `.catch(() => INTERNAL)` copies; the sprint status is set early by the implementer as in 3.25 and the spec reaches `done` in the closing commit.
  - `[false]` `[reject]` blind: the integration test skips the session-to-context binding (no cross-user case through the action). The "real receipt" case passes only because the cookie's session resolves to the receipt's owner (`undo()` rejects any other `ctx.user.id`), and `tests/int/undo.int.spec.ts` pins the cross-user refusal. A test-only ask without a new failure mode.
  - `[low]` `[reject]` edge: a toast shown while `undoAction` is in flight is replaced by the late "Undone" or error, losing its Undo Link. Verified real. The window is one round trip; the guard (capture `state.id`, compare on settle) adds a branch for a case the scan loop reaches only by saving the next book within that window. Residual risk below.
  - `[low]` `[patch]` edge: the toast with its Undo Link survives the `/login` redirect. Same root cause as the blind row; patched with it.
  - `[low]` `[reject]` edge: `next=` loses the query string. Same root cause as the blind row; same disposition.
  - `[low]` `[reject]` edge: `seconds * 1000` above 2^31−1 overflows `setTimeout` and the Link vanishes at once. Verified real; only a forged cookie or a future caller's mistake produces 24.8 days of seconds, and the outcome is a hidden Link, which is the safe side. A clamp guards a state no caller produces.
  - `[low]` `[reject]` edge: an empty-string token passes `decodeUndo`, so a forged cookie renders a Link whose tap yields "Couldn't undo.". Verified; the server never issues `''`, and the outcome is the correct error toast for an unusable token.
  - `[low]` `[patch]` edge: Undo stays tappable during the 200 ms fade after X or the timer (the box is mounted with `opacity-0`). Verified real. Patched: `startLeaving` clears the undo timer and sets `undoToken: null` with `leaving: true`; new store test pins it.
  - `[low]` `[patch]` verification-gap: expiry is verified only at the store; a provider that derives the Link from `input.undo` passes every provider test (demonstrated by mutation). Patched: provider-level case on fake timers, Link gone at 5 s while the message and X remain.
  - `[false]` `[reject]` intent: the tests sit below the toast surface and no real producer of a token exists. By the build order the first undoable action is 3.37/3.47; the spine's Tests convention keeps Playwright to scan-to-save and shop check. Each AC clause has a failing test at the store, codec, provider or action.
  - `[low]` `[reject]` intent: the toast input is `undo: { token, seconds }` rather than the result's `undoToken`/`undoSeconds`, so each future action maps two fields. A naming choice with no bad outcome; the input is the toast's own shape, not an `ActionResult`.
  - `[false]` `[reject]` intent: the `UNAUTHENTICATED` redirect and the `INTERNAL` mapping go beyond the AC. Both follow the spine's Errors convention and the existing `SignOutButton` and `report.ts` pattern.
  - `[false]` `[reject]` intent: "Undone" is a timed success on Scan where other toasts hold. The AC says "for a moment"; the hold exists for Edit and Undo, which "Undone" offers neither of (Design Notes).
  - `[false]` `[reject]` intent: sprint status `done` while the spec says `in-review`. Same disposition as the blind bookkeeping row.

## Design Notes

The expiry lives in the store, not in a component effect, so it is tested with fake timers like the leave timer and survives a re-render. The token on the state is a copy of the input's: the input stays what the caller passed, and `undoToken: null` is the single signal the provider reads.

"Undone" is a timed success even on Scan: the hold exists so Edit and Undo can wait for the next book, and "Undone" offers neither.

```ts
// store.ts, inside show()
clearTimer(); clearUndoTimer()
const undo = input.kind === 'success' && input.undo && input.undo.seconds > 0 ? input.undo : null
set({ input, id: nextId++, leaving: false, undoToken: undo?.token ?? null })
if (undo) undoTimer = setTimeout(() => { undoTimer = undefined; if (state) set({ ...state, undoToken: null }) }, undo.seconds * 1000)
```

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean (message keys typed from `en.json`).
- `npm run test:unit` -- expected: all pass, `toastStore`, `flashCookie`, `messages`, `toastUndo` included.
- `npm run test:int` -- expected: all pass, `undoAction` included (Postgres on `DATABASE_URL`).

## Auto Run Result

**Summary.** The toast can carry an Undo. `ToastInput` success takes `undo: { token, seconds }`, carried through `flashToast()` and validated by `decodeFlash` (a forged `undo` is dropped). The store keeps `undoToken` on its state while the seconds last and nulls it on expiry and the moment a toast starts to leave; every `show()` resets the timer. `ToastView` has an `actions` slot between the message and the X; the provider renders an Undo `ActionLink` there while a token is live, disabled while the action is pending. A tap calls the new `undoAction(token)` (`src/app/(frontend)/actions/undo.ts`, the only caller of `undo()`): `ok` → a timed "Undone" success; `UNAUTHENTICATED` → the toast is dismissed and the user goes to `/login?next=<pathname>`; any other code → an error toast ("Couldn't undo." for `UNDO_FAILED`); a rejected call counts as `INTERNAL`. Messages `toast.undo` and `toast.undone` in both languages.

**Files changed.**
- `src/app/(frontend)/components/toast/store.ts` -- `undo` on the success input, `undoToken` on the state, the expiry timer, token cleared on leaving.
- `src/app/(frontend)/components/toast/flashCookie.ts` -- `decodeUndo`; `decodeFlash` carries a well-formed `undo`.
- `src/app/(frontend)/actions/undo.ts` -- new `undoAction`.
- `src/app/(frontend)/components/toast/ToastView.tsx` -- `actions` slot.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- Undo Link, pending state, result handling, dismiss before the sign-in redirect.
- `messages/en.json`, `messages/fi.json` -- `toast.undo`, `toast.undone`.
- `tests/unit/toastStore.unit.spec.ts`, `tests/unit/flashCookie.unit.spec.ts`, `tests/unit/messages.unit.spec.ts` -- expiry, zero seconds, replacement, leaving; round trip and forged `undo`; the three `toast.*` keys.
- `tests/unit/toastUndo.unit.spec.ts` -- new: provider on jsdom, 8 cases (tap → "Undone", failure and rejection → error toast, signed out → redirect with the Link gone, pending tap, expiry on fake timers, no Link without a token).
- `tests/int/undoAction.int.spec.ts` -- new: a real receipt undone, unknown token, non-string token, no session.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.26 done.

**Review.** 20 findings (low 10, false 10). Patched 4, all low: the toast dismissed before the `UNAUTHENTICATED` redirect (two rows, one root cause); Undo no longer tappable during the leave fade; the mislabelled forged-`undo` test row; a provider-level expiry test. Deferred 0. Rejected:
- No `router.refresh()` after an undo: no undoable action exists yet; the screens that raise undoable toasts own their reload (spine: the list reloads through `/data/shelf`).
- `next=` drops the query string: rare (session gone inside a toast's window), fixed by the one client helper in 3.44.
- iOS background timers: elapsed timers fire on resume, before a tap.
- Focus lost when the Link unmounts: rare on a phone-first toast; focus management is more than a direct correction.
- Spec bookkeeping and the `INTERNAL` vs "No connection." mapping: edits this build's spec; `NO_CONNECTION` arrives with A25.
- Cross-user case through the action: the real-receipt test already proves the session binds to the context; `undo.int.spec.ts` pins the cross-user refusal.
- Late undo result replacing a newer toast: one-round-trip window; a guard for it adds a branch. Residual risk.
- `setTimeout` overflow and an empty-string token: forged cookie only, both land on the safe side (hidden Link, "Couldn't undo.").
- Intent audit rows (tests below the toast surface, input naming, redirect and `INTERNAL` mapping, timed "Undone" on Scan, sprint status): no bad outcome; each follows the build order, the Errors convention or the AC's "for a moment".

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 4.

**Verification** (main checkout, Postgres on `DATABASE_URL`, after the patches).
- `npx eslint src tests`: 0 errors (36 pre-existing warnings in generated migrations).
- `npm run typecheck`: clean.
- `npm run test:unit`: 30 files, 520 passed.
- `npm run test:int`: 29 files passed, 1 skipped (`migrationSchema`, push on); `undoAction` 4/4.
- Matrix audit: every row has a passing test (`toastUndo`, `toastStore`, `flashCookie`, `undoAction`).
- Playwright not run (no scan-to-save change).

**Residual risks.** A toast raised while an undo is in flight is replaced by that undo's result. The `/login?next=` path from the provider carries the pathname only, until 3.44's client helper takes over the mapping. No product code raises a toast with `undo` yet; the first is the save toast (3.47), which must pass `{ token: result.undoToken, seconds: result.undoSeconds }`.
