---
title: 'Story 1.17 [A17] Toasts'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: 'fe6dc3b9c205006c58f91a1e7aaab4afb7361ac4'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Add a browser test of the toast provider glue: a flash cookie present at
      load or set before a navigation produces a visible toast once and the
      cookie is cleared, dismiss fades and unmounts the box, a toast survives
      a client navigation, and success/error toasts are announced.
    evidence: |-
      No test executes ToastProvider: the layout test only walks element
      types, and the store, codec and view are each tested in isolation.
      Deleting `if (input) store.show(input)` in the flash effect, or the
      `pathname` dependency, fails nothing. The unit lane is node-only (no
      jsdom) by design; the Playwright setup on bookeh_test arrives with
      Story 3.52, the same deferral as 1.16's sign-in form.
    location: >-
      src/app/(frontend)/components/toast/ToastProvider.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Nothing can show the result of an action without occupying the screen: there is no toast provider, so every later story (saves, loans, undo, "bookeh was updated") has nowhere to report success or failure (UX-DR27). The spine also requires `flashToast()` for toasts raised by server code, and a Close (X) component does not exist yet.

**Approach:** One client `ToastProvider` in the frontend root layout, above `{children}` so its state survives client navigation. It owns a pure toast store (one toast at a time, 8 s success timer, hold mode, no timer on errors, 200 ms leave phase) and renders the DESIGN.md Toast box above the bottom edge. `flashToast()` sets a short-lived non-HttpOnly cookie from server code; the provider reads, clears and shows it on mount and on every path change. The story builds the shared Close (X) component and declares the app's transition defaults (first motion story).

## Boundaries & Constraints

**Always:**
- **One provider**, in `src/app/(frontend)/layout.tsx`, inside `NextIntlClientProvider` (it translates `errors.<CODE>` and the close label). One toast at a time; a new one replaces the current at once.
- **Success:** visible about 8 s, then leaves. With `hold: true` (the Scan save toast, Story 3.46) there is no timer: it stays until replaced or dismissed.
- **Error:** input is the `ErrorCode`; the provider renders `errors.<CODE>` from the catalogue, led by the 8px `danger` square. No timer: stays until dismissed or replaced.
- **Look** (DESIGN.md, Toast): outlined box, `stroke-control` (2px) `text` border on `background`, `meta` typography, message left, Close (X) right. No shadow, no fill, square corners.
- **Placement:** fixed above the bottom edge, page margins at the sides (20px, `wide:` 28px), above anything later pinned there.
- **Announced:** success content in `role="status"`, error in `role="alert"`; remounted (keyed) on every show so a repeated message is re-announced.
- **Motion** (EXPERIENCE.md): slides up on enter, fades out on leave, ~200 ms, never blocks input, immediate under reduce motion. CSS only — this story sets `--default-transition-duration: 200ms` and `--default-transition-timing-function: ease-out` in `styles.css` (its header reserves this for the first motion story).
- **`flashToast`** (spine, Toasts): server-side, sets cookie `bookeh_flash` (JSON, URL-encoded, `path=/`, `maxAge` 60, `sameSite: lax`, **not** HttpOnly — the client must read and clear it). Decode validates shape and the error code against the `ErrorCode` union; anything malformed is cleared and ignored.
- **Strings:** every visible string from `messages/en.json` + `messages/fi.json` (new key `toast.close`). Tokens only, no colour or size literals in components; 44px tap height for the X on the phone; lowercase via `ui-case` where DESIGN.md says so (the X has no text).
- Timer logic lives in a pure store module so the node-only unit lane can test it with fake timers.

**Never:**
- No toast actions / Links (Undo, Edit — U2/D17), no `undoToken` seconds, no queueing or stacking.
- No consumer wiring: sign-in and sign-out keep their inline `ErrorMessage`; nothing raises a toast in the product yet.
- No animation library, no `dark:` utilities, no inline styles, no Base UI.
- No jsdom/test dependencies; unit lane stays node.
- `flashToast` is not a server action (no `'use server'`); it is a helper for actions/route handlers. Server *components* cannot set cookies in Next — do not try to work around that here.
- No change to `ErrorCode` or the error catalogue.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Success toast | `show({ kind: 'success', message })` | visible; at 8 s enters `leaving`; gone 200 ms later | — |
| Held success | `show({ kind: 'success', message, hold: true })` | no timer; still visible after minutes | — |
| Error toast | `show({ kind: 'error', code: 'INTERNAL' })` | `errors.INTERNAL` text, danger square, no timer | unknown code can't occur (typed) |
| Replace | `show(B)` while A visible (or leaving) | B visible at once with a new key; A's timer cancelled | — |
| Dismiss | close X, or `dismiss()` | enters `leaving` at once, gone 200 ms later | `dismiss()` with nothing shown is a no-op |
| Flash round trip | `flashToast({ kind: 'success', message })` then a render | cookie set (name/attrs above); provider shows it once and clears the cookie | — |
| Malformed flash | cookie holds junk / wrong shape / unknown `code` | nothing shown, cookie cleared | never throws |
| No flash cookie | ordinary navigation | no toast | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/components/toast/store.ts` -- NEW, pure, no React. `createToastStore(leaveMs = 200, successMs = 8000)` → `{ show, dismiss, subscribe, getState }`. State: `null | { input: ToastInput; id: number; leaving: boolean }`; `id` increments per `show` (React remount key). `show` clears any pending timers; success without `hold` arms the 8 s timer → sets `leaving` → `leaveMs` later clears to `null`. Types: `ToastInput = { kind: 'success'; message: string; hold?: boolean } | { kind: 'error'; code: ErrorCode }` (`import type { ErrorCode } from '@/lib/errors'` — type-only, allowed everywhere).
- `src/app/(frontend)/components/toast/flashCookie.ts` -- NEW, pure, shared by server and client. `FLASH_COOKIE = 'bookeh_flash'`, `encodeFlash(input: ToastInput): string` (`encodeURIComponent(JSON.stringify(...))`), `decodeFlash(raw: string | undefined): ToastInput | null` validating kind/message/code; runtime code list via the `Object.keys({...} satisfies Record<ErrorCode, true>)` pattern from `tests/unit/messages.unit.spec.ts:55-61`.
- `src/app/(frontend)/components/toast/flash.ts` -- NEW. `flashToast(input: ToastInput)`: `(await cookies()).set(FLASH_COOKIE, encodeFlash(input), { path: '/', maxAge: 60, sameSite: 'lax', httpOnly: false })`. Mirrors `src/lib/payload/session.ts`'s cookie handling. No consumer yet.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- NEW `'use client'`. Context `{ show, dismiss }`, hook `useToast()` (throws outside the provider). `useState(() => createToastStore())`, `useSyncExternalStore(subscribe, getState, () => null)`. `useEffect` on `[usePathname()]`: parse `document.cookie` for `FLASH_COOKIE`, and when present clear it (`max-age=0; path=/`) and `show(decodeFlash(...))` if it decodes. Renders children, then the toast when state is non-null: fixed wrapper (`fixed inset-x-page-margin-phone bottom-4 z-10 wide:inset-x-page-margin`), inner box keyed by `id` with enter/leave classes (`transition motion-reduce:transition-none starting:translate-y-2 starting:opacity-0`, plus `opacity-0` while `leaving`). Error text via `useTranslations()` and `` t(`errors.${code}`) `` (pattern: `src/app/(frontend)/components/SignOutButton.tsx:43`); close label `t('toast.close')`.
- `src/app/(frontend)/components/toast/ToastView.tsx` -- NEW, presentational, plain props `{ kind, message, closeLabel, onClose }` so the unit lane can `renderToStaticMarkup` it without i18n. Box: `flex items-center gap-4 border-2 border-text bg-background px-3 py-2 text-meta text-text`; message span `mr-auto` (DESIGN.md Toast; mockup `key-scan-phone.html:87-88`); error square `size-2 shrink-0 bg-danger` with `aria-hidden` (pattern: `src/app/(frontend)/components/ErrorMessage.tsx:7`); `role="status"` / `role="alert"` per kind; `CloseButton` last.
- `src/app/(frontend)/components/CloseButton.tsx` -- NEW shared Close (X) (DESIGN.md Components): button with `aria-label` from a required `label` prop, inline SVG of two 2px `currentColor` strokes (viewBox geometry, no CSS size literals; drawn size `size-4`), `max-wide:min-h-tap`, flex-centred, transparent, `type="button"`. Reused later by Scan and overlays.
- `src/app/(frontend)/layout.tsx` -- wrap `<main>{children}</main>` with `ToastProvider` inside `NextIntlClientProvider` (provider state must sit above pages so a toast survives navigation — spine, Toasts).
- `src/app/(frontend)/styles.css` -- add to `@theme`: `--default-transition-duration: 200ms`, `--default-transition-timing-function: ease-out`; update the header note (the first motion story is this one). The leave delay in `store.ts` must equal this duration — note it at both sites.
- `messages/en.json`, `messages/fi.json` -- `toast.close`: "Close" / "Sulje".
- `tests/unit/styles.unit.spec.ts:120-127` -- the theme-equality test gains the two transition defaults (as a non-DESIGN entry like `font`, `tests/unit/styles.unit.spec.ts:112-116`); utility rows: `transition` reads the duration/easing vars, `starting:translate-y-2` emits `@starting-style`, `motion-reduce:transition-none` emits the media query, `inset-x-page-margin-phone` reads its token.
- `tests/unit/layout.unit.spec.ts` -- mocks at :7-12; add an assertion walking the returned element tree: `ToastProvider` sits inside `NextIntlClientProvider` and wraps `main`.
- `tests/unit/controls.unit.spec.ts` -- pattern for compiling every emitted class against `styles.css` (`:16-29`); do the same for `ToastView` and `CloseButton` in the new test file rather than editing this one.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/components/toast/store.ts` -- create the pure store -- testable timers, one toast at a time.
- `src/app/(frontend)/components/toast/flashCookie.ts` -- create codec -- validated server→client handoff.
- `src/app/(frontend)/components/toast/flash.ts` -- create `flashToast` -- spine, Toasts.
- `src/app/(frontend)/components/CloseButton.tsx` -- create the shared X -- DESIGN.md Close, first needed here.
- `src/app/(frontend)/components/toast/ToastView.tsx` -- create the box -- DESIGN.md Toast.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- create provider + `useToast` -- the story's surface.
- `src/app/(frontend)/layout.tsx` -- mount the provider -- survives navigation.
- `src/app/(frontend)/styles.css` -- transition defaults -- first motion story.
- `messages/en.json`, `messages/fi.json` -- `toast.close` -- both languages.
- `tests/unit/toastStore.unit.spec.ts` -- fake-timer coverage of every store row of the matrix.
- `tests/unit/flashCookie.unit.spec.ts` -- codec round trip + malformed rows; `flashToast` cookie attributes with `next/headers` mocked (pattern: `tests/int/session.int.spec.ts`, but no DB → unit lane).
- `tests/unit/toastView.unit.spec.ts` -- `renderToStaticMarkup` of `ToastView` (both kinds) and `CloseButton`: roles, danger square, `aria-label`, and every emitted class compiles to CSS.
- `tests/unit/styles.unit.spec.ts`, `tests/unit/layout.unit.spec.ts` -- update as in the Code Map.

**Acceptance Criteria:**
- Given the provider in the root layout, when a caller shows a success toast, then it is visible in an outlined 2px `text` box with `meta` text and a Close (X), is announced via a live region, and is gone about 8 s later — unless shown with `hold: true`, in which case it stays until replaced or dismissed.
- Given a visible toast of any kind, when another is shown, then the new one replaces it at once with a fresh live-region announcement; when its X is pressed, it leaves at once.
- Given `show({ kind: 'error', code })`, then the box starts with the 8px `danger` square and shows the `errors.<CODE>` catalogue message, and it never leaves on a timer.
- Given `flashToast()` ran in server code, when the next page renders on the client, then the toast shows once and the `bookeh_flash` cookie is gone; a malformed cookie shows nothing and is cleared.
- Given reduce motion, when a toast enters or leaves, then it appears and disappears without sliding or fading; otherwise it slides up ~8px on enter and fades out over ~200 ms.
- Given `npm run lint` and `npm run typecheck`, then both pass: no literals in JSX, no size/colour literals in class names, client code imports only types from `src/lib`.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 19 findings — high 0, medium 5, low 13, false 1, maybe-false 0
- findings:
  - `[medium]` `[patch]` Success toasts may never be announced: `role="status"` was inserted together with its content (keyed remount), and polite live regions widely ignore content present at insertion — patched: the fixed wrapper is now permanently mounted (SSR'd, empty with no toast) and carries `role="status"`; the success box has no role of its own; the error box keeps `role="alert"`, which announces on insertion.
  - `[low]` `[reject]` Flash cookie read only on `pathname` change misses query-only navigations and same-path actions — real but unreachable today (zero `flashToast` callers) and the fix (`useSearchParams` in the root layout needs a Suspense boundary) is more than a direct correction; the contract is now stated in `flash.ts`'s doc comment for future consumer stories.
  - `[low]` `[patch]` The 200 ms leave invariant lived in four places with no cross-check — patched: a store test now parses `--default-transition-duration` out of `styles.css` and asserts the default store leave ends exactly there.
  - `[medium]` `[defer]` ToastProvider has zero coverage including node-testable parts — grouped with the verification-gap finding below; the node-only lane cannot run the glue, deferred to the Story 3.52 browser test (frontmatter `deferred`).
  - `[low]` `[reject]` `flash.ts` is a server-only module beside client files with no `server-only` guard — a client import already fails loudly at build time, and the guard needs a new dependency; more than a direct correction.
  - `[low]` `[patch]` Doc comments misnamed the cookie as `flashToast` and read ambiguously — patched together with the overpromising "next client render" comment: all three files now name `bookeh_flash`, its setter, and the pathname-change contract.
  - `[low]` `[reject]` The exhaustive `ErrorCode` runtime list exists in `flashCookie.ts` and `messages.unit.spec.ts` — both copies are `satisfies Record<ErrorCode, true>`-exhaustive, so neither can drift silently, and a shared value export from `src/lib` would break the client types-only lint rule.
  - `[low]` `[reject]` No store teardown: a pending timer outlives an unmounted provider — the provider is mounted once for the app's lifetime, the fired timer notifies an empty listener set, and `destroy()` is new surface for a situation never reached.
  - `[low]` `[patch]` Two `it.each` rows named "transition reads its token" in `styles.unit.spec.ts` — patched: merged into one distinctly named test asserting both motion vars.
  - `[low]` `[reject]` Flash set by a server action without a pathname change stays hidden until a later navigation — duplicate of the pathname-change finding above; same reasons.
  - `[low]` `[reject]` A `bookeh_flash` cookie on a deeper path than `/` is never cleared and re-shows — only `flashToast` sets the cookie and it always sets `path=/`; a deeper-path copy needs the user's own forged cookie, and the blind double-clear write is a guess-based guard.
  - `[low]` `[reject]` An encoded flash over the ~4 KB cookie limit is silently dropped — flash messages are short catalogue strings, no caller exists, and a size guard adds a branch for a situation never demonstrated.
  - `[medium]` `[patch]` Success announcement claim (edge-case layer) — same root cause as the live-region finding above; same patch.
  - `[medium]` `[defer]` Verification gap: the ToastProvider glue (flash pickup on path change, context wiring, leave class, positioning classes) runs in no test; breaking `store.show(input)` in the effect fails nothing — real, pre-verified by the layer; deferred per the spec's own design note to the Story 3.52 Playwright setup; recorded in frontmatter `deferred`.
  - `[low]` `[patch]` `toast.close` is consumed dynamically and no test pins its existence — patched: `messages.unit.spec.ts` now asserts a non-empty `toast.close` in both catalogues.
  - `[low]` `[patch]` `flashToast`'s comment promised "the next client render" while the provider reads only on pathname change — grouped with the doc-comment patch above; the comment now states the redirect-flow contract.
  - `[false]` `[reject]` Intent reading B: the story's headline behaviour is not observable because no action is wired to a toast — refuted as a defect by the intent corpus: STORY-SLICING row A17 is "Toast provider in the root layout, rendering ActionResult; flashToast", and consumer wiring is placed in D17, U2 and 3.46; the spec's Never list states it.
  - `[low]` `[reject]` Intent reading C: the provider accepts `ToastInput`, not an `ActionResult` directly — the error arm consumes the `ActionResult`'s `ErrorCode` directly, a success result carries data rather than display text (spine: the result "carries the names its toast shows"), so a `showResult` helper would be unused surface until the first consumer story.
  - `[medium]` `[defer]` Intent alignment: the ACs live at the browser surface while the tests live at the store/markup surface — same root cause as the verification-gap entry; deferred with it.

## Design Notes

**Pure store, thin provider.** The unit lane is node-only (no jsdom, `vitest.config.mts:13-14`) and adding a DOM dependency is out of scope. So replacement, hold, timers and the leave phase live in `createToastStore()` (fake-timer tested), and the provider is glue: `useSyncExternalStore`, translation, the flash-cookie effect. The provider/effect glue itself is browser-tested only manually until the Playwright-on-`bookeh_test` setup (Story 3.52) — same deferral as 1.16's form.

**Enter animation via `@starting-style`.** `starting:translate-y-2 starting:opacity-0` + bare `transition` animates the mount without a two-phase render or effect orchestration; `motion-reduce:transition-none` makes it immediate. The leave is class-driven (`opacity-0`) with the store unmounting after `leaveMs` = the 200 ms CSS duration.

**Flash cookie is readable by the client on purpose.** The provider must read and clear it from `document.cookie`, so it is not HttpOnly. Its content renders as React text (escaped) and the error code is validated against the union, so a forged cookie can at worst pop a toast the user's own browser wrote.

**Wide-screen placement.** DESIGN.md specifies only the box and "above whatever is pinned to the bottom"; the only mockup is phone-width (full width minus 20px margins, 16px above the edge). The toast mirrors the page margins at every width; 1.19+ can refine once something is actually pinned.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including the three new files and the updated `styles`/`layout` specs.
- `npm run lint` && `npm run typecheck` -- expected: 0 errors.
- `npm run test:int` -- expected: unchanged, all pass (nothing in this story touches the DB).

**Manual checks (if no CLI):**
- `next dev`, signed in on `/`: nothing in the product raises a toast yet, so raise one from the browser console by setting `document.cookie='bookeh_flash='+encodeURIComponent(JSON.stringify({kind:'success',message:'Saved'}))+'; path=/'` and navigating client-side; the toast slides up, stays ~8 s, X dismisses it, and the cookie is cleared. Repeat with `{kind:'error',code:'INTERNAL'}` — danger square, no timer. Check at phone width (44px X) and with reduce motion.

## Auto Run Result

**Summary:** The toast mechanism of UX-DR27 is built: one `ToastProvider` in the frontend root layout, above the pages, so a toast survives client navigation.
- **Lifecycle:** one toast at a time, owned by a pure store. A success leaves after 8 s (or stays with `hold: true` for the Scan save toast, Story 3.46); an error has no timer; a new toast replaces the current one at once; the X dismisses immediately; leaving fades over the 200 ms transition default.
- **Look:** the DESIGN.md Toast box — 2px `text` outline on `background`, `meta` text, message left, Close (X) right, the 8px `danger` square leading an error, whose text is the `errors.<CODE>` catalogue line.
- **Announcements:** the positioning wrapper is a permanently mounted `role="status"` live region (success content announces as a change inside it); an error box carries `role="alert"`.
- **`flashToast()`** raises a toast from server actions and route handlers through the validated, non-HttpOnly `bookeh_flash` cookie; the provider takes it (reads, clears, decodes) on mount and on every pathname change.
- **Firsts:** the shared Close (X) component, and the app's transition defaults (`200ms` / `ease-out`) in `styles.css` — the reserved first-motion-story change.
- Nothing in the product raises a toast yet, by design: consumer wiring arrives with the stories that save, undo and look up (D17, U2, 3.46).

**Files changed:**
- `src/app/(frontend)/components/toast/store.ts`: the pure store (`createToastStore`, `toastMessage`), fake-timer-testable.
- `src/app/(frontend)/components/toast/flashCookie.ts`: `FLASH_COOKIE`, `encodeFlash`, `decodeFlash`, `takeFlash` — the validated codec and the read-and-clear used by the provider.
- `src/app/(frontend)/components/toast/flash.ts`: `flashToast()`, the server-side setter.
- `src/app/(frontend)/components/toast/ToastProvider.tsx`: context + `useToast()`, `useSyncExternalStore` over the store, the flash effect, the persistent live region and the enter/leave classes.
- `src/app/(frontend)/components/toast/ToastView.tsx`: the presentational box.
- `src/app/(frontend)/components/CloseButton.tsx`: the shared Close (X).
- `src/app/(frontend)/layout.tsx`: provider mounted inside `NextIntlClientProvider`.
- `src/app/(frontend)/styles.css`: `--default-transition-duration: 200ms`, `--default-transition-timing-function: ease-out`.
- `messages/en.json`, `messages/fi.json`: `toast.close`.
- Tests: `toastStore`, `flashCookie` and `toastView` unit specs are new; `styles`, `layout` and `messages` unit specs updated.

**Review findings (1 pass, 19 findings):**
- **5 entries patched:**
  - Medium: success toasts might never be announced — the live region is now permanently mounted; the keyed box inside it re-announces as a content change.
  - Low: a test now pins the store's leave timing to the `--default-transition-duration` token.
  - Low: the flash doc comments now name `bookeh_flash` and state the pathname-change contract (set a flash only in a flow that lands on a path, e.g. before a redirect).
  - Low: the duplicate "transition reads its token" test names are merged into one test.
  - Low: `messages.unit.spec.ts` now pins `toast.close` in both catalogues.
- **1 entry deferred** (frontmatter `deferred`): a browser test of the provider glue — flash pickup, navigation survival, dismiss transition, announcements — waiting on the Playwright-on-`bookeh_test` setup (Story 3.52), the same deferral as 1.16's form.
- **Rejected:** the pathname-only flash pickup (no caller exists; the `useSearchParams` fix forces a Suspense boundary in the root layout; contract now documented); the missing `server-only` guard on `flash.ts` (a client import already fails loudly at build); the duplicated `ErrorCode` runtime list (both copies are typecheck-exhaustive; a shared value export would break the client types-only rule); the missing store `destroy()` (provider lives for the app's lifetime); a deeper-path `bookeh_flash` cookie re-showing (needs the user's own forged cookie); an over-4KB flash being dropped (short catalogue strings, no caller); intent reading B — wiring actions to toasts (refuted by STORY-SLICING A17 and the spec's Never list: consumer wiring is D17/U2/3.46); intent reading C — an `ActionResult`-shaped API (the error arm consumes the result's `ErrorCode` directly; success text is per-caller by the spine's own convention). Reasons per finding are in the Review Triage Log.

**Follow-up review: not recommended (`false`).** First pass; patched entries by verdict: medium 1, low 4 — no high, and fewer than two medium.

**Verification:**
- `npm run test:unit`: 266 passed (after the review patches).
- `npm run lint`: 0 errors; the 5 warnings were all there before (migration file and an e2e spec).
- `npm run typecheck`: clean.
- `npm run test:int`: 75 passed, 1 skipped (`migrationSchema`, skipped locally as before).
- Matrix audit: every I/O row is covered by a unit test that ran and passed (store rows in `toastStore.unit.spec.ts`, the `errors.<CODE>` text by `toastMessage`, the flash rows by `flashToast`/`takeFlash`/`decodeFlash` tests, the look by `toastView.unit.spec.ts`).

**Residual risks:**
- The provider glue (flash pickup effect, navigation survival, real announcements, the visual enter/leave) is verified only by unit tests of its parts until the deferred browser test (Story 3.52); the spec's manual console-cookie check remains worth a pass on `next dev`.
- `bottom-4` and `z-10` will need revisiting when 1.19 pins Scan book to the bottom edge.
- The flash cookie surfaces only on a pathname change; the first consumer story that wants a same-path or query-only flash must extend the provider's trigger.
