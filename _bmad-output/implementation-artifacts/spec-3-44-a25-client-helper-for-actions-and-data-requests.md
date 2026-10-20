---
title: 'Story 3.44: [A25] Client helper for actions and data requests'
type: 'feature'
created: '2026-10-20'
baseline_revision: '17d2e0c2f0caeb89905804355782fb0118fc3919'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      An error toast from a failed Settings change stays up after a successful retry.
    evidence: |-
      Error toasts stay until dismissed or replaced. The Settings switches and DisplayNameField never dismiss on success. This predates 3.44: INTERNAL toasts behaved the same way.
    location: >-
      src/app/(frontend)/(sections)/settings/VisibilitySwitch.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** Every client caller of a server action repeats its own `.catch(() => INTERNAL)` and its own `UNAUTHENTICATED` → `/login` redirect (Settings `report.ts`, `SignOutButton`, `ToastProvider` undo, `LoginForm`). A dropped connection reads as "Didn't work. Try again.", the sign-in return address loses the query (`/scan?isbn=…`), and an action from a tab older than the running deploy fails with a generic error. There is no helper for `/data` JSON requests. The spine (Errors convention) and UX-DR51 call for one client helper.

**Approach:** One client module, `components/request.ts`, that turns an action call or a `/data` fetch into an `ActionResult`: a network failure becomes `NO_CONNECTION`, a stale action becomes `APP_UPDATED`. One shared report function sends `UNAUTHENTICATED` to `/login?next=<current address>` and shows every other failure as an error toast. The toast shows a Reload Link for `APP_UPDATED`. Every existing caller moves onto the helper. The image build gets a per-build `NEXT_DEPLOYMENT_ID`.

## Boundaries & Constraints

**Always:**
- `ErrorCode` gains `NO_CONNECTION` and `APP_UPDATED`. Both are client-only codes (no server code returns them), and the union's comment says so. `messages/en.json`: `errors.NO_CONNECTION` "No connection.", `errors.APP_UPDATED` "bookeh was updated.", `toast.reload` "Reload". `fi.json`: "Ei yhteyttä.", "bookeh päivittyi.", "Lataa uudelleen".
- `settleAction(call: Promise<ActionResult<T>>)`: resolves to the call's result. On rejection it first runs `unstable_rethrow(err)` (Next control flow passes through), then maps `unstable_isUnrecognizedActionError(err)` to `APP_UPDATED`, a `TypeError` (what `fetch` rejects with when the network fails) to `NO_CONNECTION`, and anything else to `INTERNAL`. It never retries and never queues.
- `fetchData<T>(path: \`/data/${string}\`, init?: RequestInit)`: a `fetch` rejection gives `NO_CONNECTION`. A JSON body is returned as the `ActionResult` (`runRoute` always answers JSON). A body that does not parse gives `UNAUTHENTICATED` on status 401 and `INTERNAL` otherwise. Not used by any screen yet: E19 is its first caller.
- `reportFailure(code, { show, dismiss, replace })` is a pure function. `UNAUTHENTICATED`: `dismiss()`, then `replace('/login?next=' + encodeURIComponent(location.pathname + location.search))`, with the address read at failure time. Any other code: `show({ kind: 'error', code })`. `useReportFailure()` binds it to `useToast()` and `useRouter()`. `ToastProvider` calls `reportFailure` with its own store, because it sits outside its own context.
- `ToastProvider`: an error toast with code `APP_UPDATED` carries an `ActionLink` labelled `toast.reload` that calls `window.location.reload()`. It is an error toast, so it stays until dismissed: the action did not happen.
- Callers: the Settings switches and `DisplayNameField` import `settleAction` and `useReportFailure` from the helper, and `settings/report.ts` is deleted. `ToastProvider` undo uses `settleAction` + `reportFailure` and keeps "Undone" on success. `SignOutButton` uses `settleAction` and keeps its rule: ok or `UNAUTHENTICATED` → `/login`, anything else is a toast. `LoginForm` uses `settleAction`. `NO_CONNECTION` and `APP_UPDATED` there are a toast, and every other code stays inline under the form.
- Deployment id: `Dockerfile` builder stage takes `ARG DEPLOYMENT_ID` and runs the build with `NEXT_DEPLOYMENT_ID` set to it, or to a build timestamp when the arg is empty, so every image build has its own id. Both `docker/build-push-action` steps in `ci.yml` pass `build-args: DEPLOYMENT_ID=${{ github.sha }}`; the same args keep the push build a cache hit. `next.config.ts` stays as it is: Next reads `NEXT_DEPLOYMENT_ID` itself (bundled docs, `deploymentId.md`).

**Never:**
- No offline queue, no retry, no service worker, no `experimental.useOffline` (it replays actions after reconnect).
- No client-side REST to Payload. No new `/data` route handler in this story.
- No change to `runAction` / `runRoute` or to server actions.
- No `navigator.onLine` check: it reports a reachable LAN even when the tailnet host is gone.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Action ok | call resolves `{ ok: true }` | same result | — |
| Action domain failure | resolves `{ ok: false, code: 'VALIDATION', fields }` | same result, fields kept | caller decides |
| Network down | call rejects `TypeError('Failed to fetch')` | `{ ok: false, code: 'NO_CONNECTION' }`; reported → toast "No connection." | nothing queued |
| Stale action | rejects `UnrecognizedActionError` | `APP_UPDATED`; toast "bookeh was updated." + Reload | Reload reloads the page |
| Other rejection | rejects `Error('An unexpected response…')` | `INTERNAL` | toast |
| Data 401 JSON | `{ ok:false, code:'UNAUTHENTICATED' }`, 401 | that result | reported → `/login?next=%2Fscan%3Fisbn%3D978…` from `/scan?isbn=978…` |
| Data non-JSON | 502 text/html | `INTERNAL` | toast |
| Data fetch rejects | network down | `NO_CONNECTION` | toast |

</intent-contract>

## Code Map

- `src/lib/errors.ts:6-14` -- `ErrorCode` union; add the two client-only codes.
- `src/app/(frontend)/(sections)/settings/report.ts` -- current `settled` + `useReportFailure` (Settings-only, `next=%2Fsettings` hard-coded); replaced by the helper, then deleted.
- `src/app/(frontend)/(sections)/settings/{VisibilitySwitch,LanguageSwitch,ThemeSwitch,DisplayNameField}.tsx` -- callers of `settled`/`report`; only their import path changes.
- `src/app/(frontend)/components/SignOutButton.tsx:24-35` -- inline `.catch`; `UNAUTHENTICATED` → `/login` stays.
- `src/app/(frontend)/components/toast/ToastProvider.tsx:57-77` -- undo: inline `.catch` and its own `UNAUTHENTICATED` redirect built from `usePathname()` (drops the query); `actions` slot at ~118 is where the Reload Link goes.
- `src/app/(frontend)/components/Link.tsx:23` -- `ActionLink`, for Reload.
- `src/app/(frontend)/login/LoginForm.tsx:17-26` -- `.catch` → INTERNAL shown inline.
- `src/app/(frontend)/login/nextPath.ts` -- `safeNextPath` already keeps pathname+search on the way back; nothing to change.
- `node_modules/next/dist/client/components/router-reducer/reducers/server-action-reducer.js:73-109` -- the action fetch rethrows network rejections as is, and throws `UnrecognizedActionError` on the `x-nextjs-action-not-found` header (404). `unstable_isUnrecognizedActionError` and `unstable_rethrow` come from `next/navigation` (client build).
- `messages/en.json`, `messages/fi.json` -- `errors`, `toast` groups; `tests/unit/messages.unit.spec.ts` checks parity and that every `ErrorCode` has a message.
- `Dockerfile:22-25` builder stage; `.github/workflows/ci.yml:153,200` the two build steps.
- Tests to update: `tests/unit/report.unit.spec.ts` (moves to `request.unit.spec.ts`), `tests/unit/signOutButton.unit.spec.ts` (rejected-call case), `tests/unit/toastUndo.unit.spec.ts` (mocks `usePathname`; the redirect now reads `window.location`).

## Tasks & Acceptance

**Execution:**
- `src/lib/errors.ts` -- add `NO_CONNECTION`, `APP_UPDATED` with a comment that they are client-only.
- `messages/en.json`, `messages/fi.json` -- the three strings above.
- `src/app/(frontend)/components/request.ts` -- new `'use client'` module: `settleAction`, `fetchData`, `reportFailure`, `useReportFailure`, each with a short doc comment citing spine Errors / UX-DR51.
- `src/app/(frontend)/(sections)/settings/*.tsx` -- switch imports to `../../components/request`; delete `settings/report.ts`.
- `src/app/(frontend)/components/SignOutButton.tsx` -- `settleAction` in place of the inline catch.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- undo through `settleAction` + `reportFailure(code, { show: store.show, dismiss: store.dismiss, replace: router.replace })`; drop `usePathname` if nothing else needs it (the flash effect does: keep it there). Render the Reload `ActionLink` for an `APP_UPDATED` error toast.
- `src/app/(frontend)/login/LoginForm.tsx` -- `settleAction`; toast `NO_CONNECTION`/`APP_UPDATED` via `useToast().show` and return `null` state for them, so nothing inline.
- `Dockerfile`, `.github/workflows/ci.yml` -- per-build deployment id as above, with a comment pointing at the bundled `deploymentId.md`.
- `tests/unit/request.unit.spec.ts` -- the I/O matrix: `settleAction` mappings (build the stale error with `new UnrecognizedActionError()` from `next/dist/client/components/unrecognized-action-error`), `fetchData` with a stubbed `fetch`, `reportFailure` with `history.replaceState` to `/scan?isbn=9789510000000` for the `next` address. Delete `tests/unit/report.unit.spec.ts`.
- `tests/unit/signOutButton.unit.spec.ts`, `tests/unit/toastUndo.unit.spec.ts` -- adjust to the new mapping. Add one provider case: an `APP_UPDATED` error toast shows Reload, which calls `location.reload`.

**Acceptance Criteria:**
- Given any client caller of a server action, when the network fails, then the caller receives `NO_CONNECTION`, the error toast reads "No connection.", and no request is retried or queued.
- Given a signed-out session on `/scan?isbn=…`, when Undo on the toast fails `UNAUTHENTICATED`, then the toast is dismissed and the app moves to `/login?next=` that address.
- Given a tab built before the running deploy, when it calls a server action, then the error toast reads "bookeh was updated." with a Reload Link that reloads the page.
- Given an image built with `DEPLOYMENT_ID` set, or a build with no id passed, when a page is served, then its `<html>` carries `data-dpl-id` with that id (the build timestamp when none was passed). Checked once locally: `NEXT_DEPLOYMENT_ID=check npm run build`, `node .next/standalone/server.js` (what the image runs; `next start` ignores standalone output), and `curl -s localhost:3000/login | grep 'data-dpl-id="check"'`.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 16 findings — high 0, medium 1, low 13, false 2, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: a container restart behind `tailscale serve` (502/503) reads as INTERNAL, not NO_CONNECTION — real, but only during a deploy restart on one LXC; the user still gets an error toast ("Didn't work. Try again."), so nothing fails silently. Telling it apart for actions means parsing Next's generic E394 message: an added branch for a rare case.
  - `[low]` `[reject]` Blind: `fetchData` maps a connection lost mid-body (TypeError from `response.json()`) to INTERNAL — rare (the bodies are small JSON), still an error toast; extra branch in a function with no caller yet. Revisit with E19.
  - `[low]` `[reject]` Blind: "client-only" codes are only a comment; `DomainError('APP_UPDATED')` compiles and the flash cookie accepts both — no named caller diverges; the flash cookie is server-set and a forged one only toasts its own user. Splitting the union adds types for no demonstrated harm.
  - `[medium]` `[patch]` Blind: an error toast from a failed sign-in stays up after a successful retry and follows the user into the app (LoginForm moved these from inline to toast) — patched: LoginForm dismisses the toast on an ok result before navigating.
  - `[low]` `[defer]` Blind: the same lingering error toast after a successful retry in the Settings switches and DisplayNameField — pre-existing (they toasted INTERNAL the same way before this story); deferred.
  - `[low]` `[reject]` Blind: LoginForm's toast/inline split is untested — the branch is one condition on top of the tested `settleAction` mapping; a jsdom LoginForm harness would restate it (CLAUDE.md, tests at a functional minimum).
  - `[low]` `[patch]` Blind: the deployment id is checked only once, by hand — patched with one grep for `data-dpl-id="${{ github.sha }}"` in the existing CI smoke step, which already fetches the page; it catches a `next.config.ts` override or a misplaced ARG.
  - `[low]` `[reject]` Blind: every TypeError reads as "No connection.", hiding client bugs — fetch reports a network failure only as a TypeError, with a different message per browser; the actions here are thin Flight calls with no client-side logic that could throw one. A known approximation.
  - `[low]` `[reject]` Blind: `reportFailure` reads the global `location`, so it is not strictly pure — reading the address at failure time is the intended behaviour; developer-only, and the fix adds a parameter to every call site.
  - `[low]` `[reject]` Edge: an aborted `fetchData` (AbortError) would toast "No connection." — no caller passes a signal; `fetchData` has no caller yet. Revisit with E19 if it adds cancellation.
  - `[low]` `[reject]` Edge: connection lost mid-body in `fetchData` → INTERNAL — the same as the second Blind row.
  - `[false]` `[reject]` Edge: a JSON body that is not an `ActionResult` (null, or a proxy's JSON error) crashes the caller — every `/data` handler answers through `runRoute`, which always serialises an `ActionResult`; `tailscale serve` answers errors as text, which already maps to INTERNAL.
  - `[low]` `[reject]` Edge: a TypeError after the server ran the action reports NO_CONNECTION and invites a retry — the same as the Blind TypeError row; the save path dedupes retries by `requestId` (3.36).
  - `[low]` `[reject]` Verification gap: LoginForm split untested — the same as the Blind row (functional minimum).
  - `[low]` `[patch]` Verification gap: Reload never asserted absent on other error toasts — patched: the existing no-Undo `it.each` also asserts no `toast.reload` button. The reason for the test: a wider guard would offer a state-discarding reload on every error.
  - `[false]` `[reject]` Intent alignment: the triggering conditions are simulated at unit level, and the story was uncommitted at review time — Next's reducer path was read in planning (it rethrows fetch rejections, and throws `UnrecognizedActionError` on the not-found header); the commit happens at finalisation.

## Design Notes

`APP_UPDATED` is an `ErrorCode`, not a new toast kind. That way every caller handles every transport outcome the same way: `if (!result.ok) { restore state; report(result.code) }`. Settings switches revert their optimistic value for it as for any failure. The Reload Link is the provider's one special case.

Next.js 16.3.8 action IDs change on every build, so any action call from an old tab after a deploy gets the 404 `x-nextjs-action-not-found`. The deployment id does not detect that; it makes navigations from an old tab hard-reload and busts asset caches. It is configured because the AC asks for it and costs one env var.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass (against the worktree Postgres on 5435)
- `NEXT_DEPLOYMENT_ID=check npm run build`, then `node .next/standalone/server.js` (copy `.next/static` in first, load `.env`) and `curl -s localhost:3000/login | grep -o 'data-dpl-id="check"'` -- expected: one match

## Auto Run Result

**Summary:** One client helper, `components/request.ts`. `settleAction` maps a rejected action call to `APP_UPDATED` (stale action after a deploy), `NO_CONNECTION` (network `TypeError`) or `INTERNAL`, and lets Next.js control flow through. `fetchData` does the same for `/data` JSON requests. `reportFailure` / `useReportFailure` send `UNAUTHENTICATED` to `/login?next=<current pathname+search>` and show everything else as an error toast. The toast offers Reload on `APP_UPDATED`. Every existing caller now uses the helper. Each image build gets its own `NEXT_DEPLOYMENT_ID`: the commit SHA in CI, a timestamp otherwise.

**Files changed:**
- `src/app/(frontend)/components/request.ts`: new client helper.
- `src/lib/errors.ts`: client-only `NO_CONNECTION`, `APP_UPDATED`.
- `messages/en.json`, `messages/fi.json`: the two error lines and `toast.reload`.
- `src/app/(frontend)/components/toast/ToastProvider.tsx`: undo goes through the helper; Reload Link on `APP_UPDATED`.
- `src/app/(frontend)/components/toast/flashCookie.ts`: exhaustive code list extended.
- `src/app/(frontend)/components/SignOutButton.tsx`, `login/LoginForm.tsx`, `(sections)/settings/{Visibility,Language,Theme}Switch.tsx`, `DisplayNameField.tsx`: on the helper. LoginForm toasts transport failures and dismisses the toast on success.
- `src/app/(frontend)/(sections)/settings/report.ts`: deleted (moved into the helper).
- `Dockerfile`, `.github/workflows/ci.yml`: per-build deployment id; the smoke run checks `data-dpl-id`.
- `tests/unit/request.unit.spec.ts` (new; replaces `report.unit.spec.ts`), `toastUndo.unit.spec.ts`, `signOutButton.unit.spec.ts`, `messages.unit.spec.ts`.

**Review findings:**
- 16 findings in total.
- 3 patched:
  - LoginForm's lingering toast (medium).
  - CI deployment-id check (low).
  - Reload absent on other toasts (low).
- 1 deferred: Settings' lingering error toast after a successful retry. Pre-existing, low.
- 12 rejected, each with its reason in the triage log:
  - proxy 502 read as INTERNAL;
  - connection lost mid-body (twice);
  - client-only codes not compiler-enforced;
  - LoginForm test (twice; functional minimum);
  - TypeError approximation (twice);
  - `reportFailure` reads `location`;
  - AbortError;
  - JSON that is not an ActionResult (false);
  - intent audit (false).

**Follow-up review recommended:** false. Patched counts by verdict: high 0, medium 1, low 2.

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (36 warnings, all in migrations, pre-existing).
- `npm run test:unit`: 535 passed.
- `npm run test:int`: 288 passed, 1 skipped (Postgres on 5435).
- `NEXT_DEPLOYMENT_ID=check npm run build` and `node .next/standalone/server.js`: `/login` serves `data-dpl-id="check"`.

**Residual risks:**
- The CI smoke grep has not run in CI yet.
- No real browser run of the offline or stale-action paths. The mapping rests on reading Next 16.3.8's `server-action-reducer.js`.
- `tests/unit/scanScreen.unit.spec.ts` was flaky under heavy machine load during implementation. It is unrelated, and it passed in the final runs.
