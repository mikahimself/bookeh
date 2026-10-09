---
title: 'Story 1.16 [A16] Sign in and sign out'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '232d757f7654d5ee8fb55fe5479a2985541f013d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Add a browser test of the sign-in form and Sign out: sign in from /login?next=%2F%3Fa%3D1 back to /?a=1, a wrong password shows the alert and keeps the email, Sign out lands on /login and / redirects again, and the title is bookeh.
    evidence: |-
      LoginForm and SignOutButton are never rendered by a test: the int tests build FormData by hand and call the actions, and the e2e stops at the signed-out redirect. Renaming the hidden `next` input or dropping router.replace would fail nothing. The spine's Tests convention keeps Playwright to scan-to-save and shop check (1.14's bad_spec loop), and e2e still runs on the dev database; Story 3.52 (D15) builds the Playwright setup on bookeh_test, which is the natural home.
    location: >-
      tests/e2e/frontend.e2e.spec.ts
    severity: medium
  - summary: >-
      Lint-rule tests for the frontend Payload import ban and react/jsx-no-literals (lint sample sources as src/app/(frontend)/x.tsx and assert each banned value import and literal JSX string errors, and import type does not).
    evidence: |-
      npm run lint only shows the tree has no violations; a typo'd regex or a later block replacing the rule keeps CI green. Checked by hand with a scratch file in this story. Same gap as the existing 1.6 deferred item for the lib zones and gateway bans; one harness should cover all.
    location: >-
      eslint.config.mjs
    severity: low
  - summary: >-
      Before public exposure (Phase 2, NFR-5), make sign-in timing independent of whether the account exists or is locked.
    evidence: |-
      Payload's loginOperation throws AuthenticationError for an unknown email and LockedAuth for a locked one before any password hashing (node_modules/payload/dist/auth/operations/login.js:21-28); a wrong password on a real account runs pbkdf2 first. The code is WRONG_CREDENTIALS in every case, but response time differs. Phase 1 is tailnet only; NFR-5's sign-in rules gate Phase 2.
    location: >-
      src/lib/payload/session.ts
    severity: medium
  - summary: >-
      Set `auth.cookies.secure` on users in production (Story 2.2), so the 30-day payload-token is sent with Secure over tailscale serve HTTPS.
    evidence: |-
      src/collections/Users.ts sets no auth.cookies, so Payload's default `secure: false` applies to both the admin login and this story's cookie. Pre-existing config; dev runs on http://localhost, so it must be production-only.
    location: >-
      src/collections/Users.ts
    severity: medium
---

<intent-contract>

## Intent

**Problem:** There is no `/login`. A signed-out visit to a page that calls `requireUser()` redirects to a 404, there is no way to end a session, and `/` is still the Payload template, which reads the session with `getPayload` directly (FR-1, FR-52, UX-DR39, UX-DR55). The frontend has no Button, Text field or focus ring yet, and nothing stops `src/app/(frontend)` from importing Payload.

**Approach:**
- `/login` is a server page with a client form. Its server action signs in through a new `lib/account` service, which calls Payload's local strategy in `lib/payload` and sets Payload's own session cookie. The action returns `ActionResult<{ to }>`, where `to` is the validated same-origin `next`, and the form navigates there.
- Sign-out is a server action through the same service. It ends the Payload server session and deletes the cookie; the client then goes to `/login`.
- `/` becomes a minimal signed-in placeholder: the product name and Sign out. Stories 1.19 and 1.23 replace it.
- The story builds Button, Text field and the global focus ring per DESIGN.md, and closes the deferred lint ban on Payload imports from the frontend.

## Boundaries & Constraints

**Always:**
- **Layers** (spine, Design Paradigm):
  - Only `src/lib/payload` touches Payload.
  - `lib/account` holds the service and imports only `lib/payload` and `lib/errors`.
  - The frontend imports `lib/account`, plus `requireUser` / `requireUserOrThrow` from `lib/payload`.
- **Actions** run inside `runAction()` and never redirect (spine, Errors).
  - The sign-in action is the one action without `requireUserOrThrow()` (AD-2).
  - The sign-out action starts with it.
  - The email is trimmed and NFC-normalised at the action boundary. The password is passed as typed.
- **Failed sign-in:** every failure (unknown email, wrong password, blank field, Payload lockout) is the single code `WRONG_CREDENTIALS`, shown as `errors.WRONG_CREDENTIALS` under the form. The response never differs by whether the account exists (UX-DR39, NFR-5).
- **`next`** is honoured only as a same-origin path. Anything else, and `/login` itself, becomes `/`.
- **Session:** Payload's cookie name, attributes and 30-day expiry come from the `users` auth config. Sign-out removes the current session row (Payload `useSessions`, on by default), so the old token stops authenticating even if it were kept.
- **Strings:** every string lives in `messages/en.json` and `messages/fi.json`. Finnish is written natively, English is terse, and the product name is "bookeh".
- **Styling:** tokens only, no colour or size literals in components. Buttons and the heading are lowercase through `ui-case`.
- **Phone:** control tap areas are at least 44px high below 900px.

**Never:**
- No Payload REST or GraphQL from the browser.
- No `@payloadcms/next/auth` imports. Its `'use server'` `login`/`logout` take `config` and `collection` from the caller.
- No redirect inside an action.
- No toast (Story 1.17).
- No section shell, Settings page or language switch (1.19, 1.23).
- No password change, self-registration or email.
- No change to Payload admin.
- No new Playwright lane beyond replacing the template homepage test (spine, Tests).
- No `dark:` utilities, inline styles or Base UI.
- No change to the lockout settings (Payload defaults: 5 attempts, 10 min).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Right credentials | known email, case and spaces differing, right password, `next=/loans?x=1` | `{ ok: true, data: { to: '/loans?x=1' } }`; HttpOnly `payload-token` cookie set; that token authenticates | No error expected |
| Wrong password / unknown email | either | `{ ok: false, code: 'WRONG_CREDENTIALS' }`, no cookie | Same code for both |
| Blank email or blank / whitespace-only password | `''`, `'  '` | `WRONG_CREDENTIALS`, Payload not called | No `VALIDATION` leak |
| Locked account | 5 wrong passwords, then the right one | `WRONG_CREDENTIALS` | Lockout indistinguishable from a wrong password |
| Unsafe `next` | missing, non-string, `''`, `foo`, `//evil.example`, `/\evil.example`, `https://evil.example/`, `/x` followed by a tab or newline, `/login`, `/login?next=/x` | `to: '/'` | Never throws |
| Safe `next` | `/`, `/loans`, `/?q=a&b=1`, `/wishlists/3?entry=5#x` | returned unchanged (pathname + search + hash) | — |
| Sign out | signed in | `{ ok: true }`; cookie deleted; the old token no longer authenticates; client lands on `/login` | — |
| Sign out, no session | no or dead cookie | `{ ok: false, code: 'UNAUTHENTICATED' }`; client still goes to `/login` | Other codes show `errors.<CODE>` beside the button |
| Signed-out page visit | GET `/?a=1` without a cookie | 307 to `/login?next=%2F%3Fa%3D1` (existing `requireUser()` + proxy) | — |

</intent-contract>

## Code Map

- `src/lib/payload/context.ts` -- `currentUser()` (React-`cache`d `payload.auth`; the returned user carries `_sid` from the JWT strategy, `node_modules/payload/dist/auth/strategies/jwt.js:117`), `requireUser()`, `requireUserOrThrow()`, `Context`. Reuse; do not change.
- `src/lib/payload/session.ts` -- NEW. `startSession(email, password)`: `getPayload` → `payload.login({ collection: 'users', data })` → `generatePayloadCookie({ collectionAuthConfig: payload.collections.users.config.auth, cookiePrefix: payload.config.cookiePrefix, returnCookieAsObject: true, token })` from `payload/shared` → `(await cookies()).set(name, value, { httpOnly, path, sameSite (lowercased), secure, domain, expires })`. `endSession(ctx)`: `logoutOperation({ collection: ctx.req.payload.collections.users, req: ctx.req })` (removes the session whose id is `req.user._sid`, `node_modules/payload/dist/auth/operations/logout.js`), then `(await cookies()).delete(\`${cookiePrefix}-token\`)`. Payload errors propagate. `.payload` access is lint-exempt here (`gatewayExempt`).
- `src/lib/account/session.ts` -- NEW. `signIn(email, password)`: blank email or `password.trim() === ''` → `DomainError('WRONG_CREDENTIALS')`; else `startSession`, mapping `AuthenticationError` and `LockedAuth` (value imports from `payload`, allowed by the gateway lint list) to `DomainError('WRONG_CREDENTIALS')`; rethrow anything else. `signOut(ctx)` → `endSession(ctx)`. Payload throws `LockedAuth` only for existing accounts (`login.js:21-28`), hence the mapping.
- `src/lib/errors.ts` -- add `'WRONG_CREDENTIALS'` to `ErrorCode`. `tests/unit/messages.unit.spec.ts:55-60` is exhaustive over `ErrorCode` (typecheck fails until listed) and checks both catalogues.
- `messages/en.json`, `messages/fi.json` -- add `app.name` ("bookeh"), `signIn.{heading,email,password,submit}`, `signOut.submit`, `errors.WRONG_CREDENTIALS` ("Wrong email or password." / "Väärä sähköposti tai salasana.").
- `src/app/(frontend)/login/nextPath.ts` -- NEW pure `safeNextPath(value: unknown): string` per the matrix: string starting with exactly one `/`, no `\` and no control characters, resolved with `new URL(value, base)` to the same origin; returns `pathname + search + hash`; `/login` → `/`.
- `src/app/(frontend)/login/actions.ts` -- NEW `'use server'` `signInAction(formData): Promise<ActionResult<{ to: string }>>` in `runAction`.
- `src/app/(frontend)/login/page.tsx` -- NEW server page; `searchParams` is a Promise (Next 16, `node_modules/next/dist/docs/01-app/01-getting-started/03-layouts-and-pages.md:254`). Heading `signIn.heading`, renders `LoginForm` with `next` (first value if an array). Locale comes from `Accept-Language` via `src/i18n/request.ts` (no session).
- `src/app/(frontend)/login/LoginForm.tsx` -- NEW `'use client'`. `useActionState` over a wrapper that calls `signInAction` and on `ok` does `router.replace(data.to)`; `noValidate` form; email `type="email" autoComplete="username"`, password `autoComplete="current-password"`; hidden `next`; primary Button `signIn.submit`, disabled while pending; failure renders `ErrorMessage` with `errors.<code>` under the form.
- `src/app/(frontend)/actions/account.ts` -- NEW `'use server'` `signOutAction(): Promise<ActionResult<null>>` = `runAction(async () => { await signOut(await requireUserOrThrow()); return null })`. Shared folder: the button moves to Settings in 1.23.
- `src/app/(frontend)/components/Button.tsx` -- NEW. `variant: 'primary' | 'secondary' | 'destructive'` → `border-accent` / `border-text` / `border-danger`; transparent, `border-2`, `px-4 py-2`, `text-button`, `text-text`, `ui-case`, `max-wide:min-h-tap`; `disabled:` label and border `text-dim`; `type` defaults to `"button"`.
- `src/app/(frontend)/components/TextField.tsx` -- NEW. Label (`text-label text-text-muted`) above an input (`text-control`, transparent, `border-b-2 border-text`, `placeholder-shown:border-text-dim` with a `" "` placeholder when none is given, `max-wide:min-h-tap`); `error?: string` → `aria-invalid`, `border-danger`, `text-meta` message linked by `aria-describedby`; ids from `useId`.
- `src/app/(frontend)/components/ErrorMessage.tsx` -- NEW. `role="alert"`, an 8px `bg-danger` square (`size-2`) then the message in `text-meta`.
- `src/app/(frontend)/components/SignOutButton.tsx` -- NEW `'use client'`. Secondary Button `signOut.submit`; `useTransition`; `ok` or `UNAUTHENTICATED` → `router.replace('/login')`; other codes → `ErrorMessage`.
- `src/app/(frontend)/page.tsx` -- REPLACE template: `await requireUser()`, heading `app.name` (`ui-case`, section heading roles), `SignOutButton`. Drop `getPayload`, `next/image`, the `styles.css` import.
- `src/app/(frontend)/layout.tsx` -- replace the template `metadata` with `generateMetadata()` giving title `app.name` via `getTranslations`. Story 1.15 (Open Sans) is being built in parallel and also edits this file. Keep the edit minimal.
- `src/app/(frontend)/styles.css` -- in `@theme`: `--spacing-tap: 44px` (DESIGN.md Tap area) and `--breakpoint-wide: 900px` (EXPERIENCE.md, Wide). In `@layer base`: `:focus-visible` gets a 2px solid `text` outline offset 3px (`outline-2 outline-offset-3 outline-solid outline-text`; bare numbers are kept per the file header). Also edited by 1.15.
- `eslint.config.mjs:292-312` -- the frontend block replaces `@typescript-eslint/no-restricted-imports` wholesale (flat config), so merge into it: `payload` (all values), `@payload-config`, and patterns `payload.config`, `collections`, `^(drizzle-orm|pg)(/|$)`, `^@payloadcms/`, all with `allowTypeImports`, beside the existing `lib/payload` pattern. Add `'react/jsx-no-literals': ['error', { noStrings: true, ignoreProps: true }]` for `src/app/(frontend)/**` (1.14's deferred low item).
- `tests/e2e/frontend.e2e.spec.ts` -- the template homepage test breaks. Replace it with the signed-out redirect (`/?a=1` → URL `/login?next=%2F%3Fa%3D1`, heading visible; the deferred item from 1.11), and point the tokens test at `/login`.
- `tests/unit/styles.unit.spec.ts:100-114` -- expected theme gains the two new tokens. Add a check of the `:focus-visible` base rule and that `min-h-tap`, `max-wide:min-h-tap` and `outline-offset-3` produce CSS.
- `tests/int/context.int.spec.ts:14` -- pattern for mocking `next/headers` (`vi.mock`, `headers` returning a `Headers`) and for logging in to get a token. `tests/helpers/harness.ts` `createUser({ password })`.

## Tasks & Acceptance

**Execution:**
- `src/lib/errors.ts`, `messages/en.json`, `messages/fi.json`, `tests/unit/messages.unit.spec.ts` -- add `WRONG_CREDENTIALS` and the new keys -- one code for every failed sign-in.
- `src/lib/payload/session.ts` -- create `startSession` and `endSession` -- the only Payload-touching sign-in code.
- `src/lib/account/session.ts` -- create `signIn` and `signOut` with the error mapping -- the service the frontend calls.
- `src/app/(frontend)/login/nextPath.ts` -- create `safeNextPath` -- same-origin rule (AD-2).
- `src/app/(frontend)/styles.css` -- add the tap and breakpoint tokens and the focus ring -- shared by every control.
- `src/app/(frontend)/components/{Button,TextField,ErrorMessage,SignOutButton}.tsx` -- create -- reusable controls (UX-DR11, UX-DR14, UX-DR38).
- `src/app/(frontend)/login/{actions.ts,page.tsx,LoginForm.tsx}` and `src/app/(frontend)/actions/account.ts` -- create -- the sign-in screen and both actions.
- `src/app/(frontend)/page.tsx`, `src/app/(frontend)/layout.tsx` -- replace the template page and metadata.
- `eslint.config.mjs` -- frontend Payload ban and `jsx-no-literals`.
- `tests/unit/nextPath.unit.spec.ts` -- the `next` rows of the matrix.
- `tests/int/session.int.spec.ts` -- drive `signInAction` and `signOutAction` with `next/headers` mocked (`headers` and a `cookies` store spy). Cover every sign-in and sign-out matrix row, including the 5-attempt lockout and that the signed-out token no longer authenticates through `payload.auth`.
- `tests/unit/controls.unit.spec.ts` -- render Button (each variant, disabled) and TextField (empty, error) with `renderToStaticMarkup`. Assert the label `for`/`id`, `aria-invalid` and `aria-describedby` wiring. Compile every class they emit with `@tailwindcss/node` (as in `styles.unit.spec.ts`) and assert each produces CSS, so no cleared-scale utility slips in silently.
- `tests/unit/styles.unit.spec.ts`, `tests/e2e/frontend.e2e.spec.ts` -- update as in the Code Map.

**Acceptance Criteria:**
- Given I am signed out, when I open `/?a=1`, then I land on `/login?next=%2F%3Fa%3D1`; and after signing in with the right email and password I am on `/?a=1`, signed in.
- Given `/login?next=https://evil.example/`, when I sign in, then I land on `/`.
- Given a wrong email or a wrong password, when I submit, then "Wrong email or password." (Finnish: "Väärä sähköposti tai salasana.") appears under the form with the danger marker, announced as an alert, and no field is singled out.
- Given a browser sending `Accept-Language: fi-FI` and no session, when I open `/login`, then the page is in Finnish with `<html lang="fi">`.
- Given I am signed in on `/`, when I press Sign out, then I am on `/login`, the cookie is gone, and opening `/` again redirects to `/login?next=%2F`.
- Given `npm run lint`, when a file under `src/app/(frontend)` value-imports `payload`, `@payload-config`, `@/payload.config`, `@/collections/*`, `drizzle-orm` or `@payloadcms/*`, or has a literal JSX text string, then lint fails (type-only imports pass).
- Given a phone-width viewport (<900px), when I measure the Sign in button and the two fields, then each is at least 44px high; keyboard focus on any of them shows a 2px `text` outline 3px outside, never the accent.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 24 findings — high 1, medium 7, low 15, false 1, maybe-false 0
- findings:
  - `[medium]` `[defer]` Intent alignment: the story's ACs live at the browser surface; the tests exercise action results, a mocked cookie store, pure functions and CSS compilation; only the signed-out redirect is end to end — grouped with the browser-test gap below; deferred (spine Tests convention, Playwright setup on bookeh_test comes with Story 3.52).
  - `[medium]` `[defer]` Verification gap: LoginForm, the login page's `next`, SignOutButton and the title are never exercised in a browser — real (no test renders either component); deferred as above, recorded in frontmatter `deferred`.
  - `[low]` `[defer]` Verification gap: nothing tests that the frontend lint bans fire — real, checked by hand only; pre-existing gap shared with the 1.6 deferred lint-test item; recorded in `deferred`.
  - `[high]` `[patch]` `safeNextPath` open redirect through dot segments (`/..//evil.example` → `//evil.example`, which `router.replace` treats as external) — confirmed by the reviewer's run and the URL parser's dot-segment handling; patched: a resolved pathname starting with `//` returns `/`, three inputs added to the unit table.
  - `[low]` `[reject]` `endSession` deletes by hand-built name without domain/prefix handling — name matches `generatePayloadCookie` (`${cookiePrefix}-token`); the domain case needs `auth.cookies.domain`, which is unset; unreachable today.
  - `[low]` `[reject]` Sign-out on a dead session leaves the stale cookie — a dead token authenticates nobody, the next sign-in overwrites it and it expires on its own; deleting it would mean running cookie writes before `requireUserOrThrow()`.
  - `[medium]` `[patch]` LoginForm: a rejected `signInAction` call (network drop) throws into the transition and reaches the error boundary — patched: a rejected call becomes `{ ok: false, code: 'INTERNAL' }` (the NO_CONNECTION helper is Story A25).
  - `[medium]` `[patch]` SignOutButton: same unhandled rejection — same root cause and patch.
  - `[low]` `[patch]` A second identical failure is not re-announced (alert node stays mounted with the same text) — patched: no ErrorMessage while pending in LoginForm; `failed` reset when sign-out starts.
  - `[false]` `[reject]` Sign in button stays disabled when the target renders `/login` again — `safeNextPath` maps `/login` and `/login/` to `/`, and `/` with a fresh session renders the home page; only the encoded-path case below reaches it.
  - `[low]` `[reject]` `/%6Cogin` or `/login//` as `next` may land on the sign-in page again — crafted links only, no harm beyond a reload; fix would add decoding and normalisation.
  - `[low]` `[reject]` A signed-in visitor to `/login` sees the form and can add a session — not asked by the story; the fix needs a new `lib/account` export (new surface).
  - `[low]` `[reject]` Dynamic `import('payload')` passes the frontend lint ban — no one writes this in a page; the lib gateway ban has the same shape; fix adds a syntax rule.
  - `[medium]` `[defer]` Sign-in timing reveals whether an email exists (Payload skips hashing for unknown and locked accounts) — real; NFR-5 gates Phase 2 and v1 is tailnet only; recorded in `deferred`.
  - `[medium]` `[defer]` Session cookie never `Secure` — real in production behind tailscale serve; pre-existing `users` auth config shared with the admin login; recorded in `deferred` for Story 2.2.
  - `[low]` `[reject]` `endSession` delete differs from how `startSession` sets the cookie — duplicate of the edge-case finding above; same reason.
  - `[low]` `[reject]` Sign-out does not always clear the cookie — duplicate of the edge-case finding above; same reason.
  - `[low]` `[patch]` Repeated alert not announced (Blind) — same root cause as the edge-case finding; same patch.
  - `[low]` `[reject]` `/login` ignores a signed-in visitor (Blind) — duplicate; same reason.
  - `[low]` `[patch]` `lib/account/session.ts` value-imports `AuthenticationError`/`LockedAuth` from `payload`, against the spec's Always rule — patched: `startSession` returns `false` for those errors, `signIn` throws `WRONG_CREDENTIALS` on `false` and no longer imports `payload`.
  - `[low]` `[reject]` Tap area met by growing the drawn control on phones instead of invisible padding — DESIGN.md says "by padding"; padding inside an outlined button necessarily grows the outline, and the result was checked at 44px; changing to pseudo-element hit areas adds complexity for no user-visible gain.
  - `[low]` `[reject]` `jsx-no-literals` with `ignoreProps` lets attribute strings (`aria-label`, `placeholder`) through — real but partial-enforcement only; an allow-list config is more than a direct correction; review still catches them.
  - `[medium]` `[defer]` Client behaviour and several ACs untested in the browser (Blind) — same root cause as the verification-gap entry; deferred with it.
  - `[low]` `[reject]` `safeNextPath` accepts `/api`, `/admin`, `/_next` paths — same-origin, so no redirect off the site; real `next` values come from the proxy, which never emits them; crafted links only.

### 2026-10-09 — Review pass (follow-up, after rebasing onto main `232d757` with Story 1.15)
- Rebase: conflicts in `src/app/(frontend)/layout.tsx` (1.15's Open Sans loader kept next to this story's `generateMetadata`) and `tests/unit/styles.unit.spec.ts` (1.15's `font` tokens and preflight check kept, `breakpoints` added). `baseline_revision` moved to `232d757` so the reviewed diff is this story only.
- verdicts: 21 findings — high 0, medium 2, low 15, false 4, maybe-false 0
- findings:
  - `[medium]` `[defer]` Verification gap: LoginForm, SignOutButton, the login `next` wiring and the title are never run by a test — carried: same claim as the first pass, code unchanged; already in `deferred` (browser test with Story 3.52).
  - `[low]` `[defer]` Verification gap: the frontend lint bans and `jsx-no-literals` are checked only by "no violations today" — carried: already in `deferred`.
  - `[false]` `[reject]` NFC normalisation of the email is dead behaviour — not a defect: the spine's Text input convention asks for it at the action boundary, and it is a no-op on the ASCII emails Payload's validator allows.
  - `[low]` `[reject]` `endSession` deletes the cookie without the configured domain — carried: first-pass reject, `auth.cookies.domain` still unset.
  - `[false]` `[reject]` `ctx.user._sid` undefined makes sign-out a no-op while reporting ok — `useSessions` is on (Payload default) and every token `startSession` issues carries `sid`, which the JWT strategy copies to `user._sid` (`jwt.js:117`); no other auth strategy is configured.
  - `[low]` `[reject]` A dead cookie is not cleared on `UNAUTHENTICATED` sign-out — carried: first-pass reject.
  - `[low]` `[reject]` A signed-in user re-signing in on `/login` leaves the earlier session row valid — carried: same location and claim as the first pass's signed-in-visitor finding.
  - `[false]` `[reject]` A stored NFD email can never sign in — Payload's email validation (`node_modules/payload/dist/fields/validations.js:107`) admits ASCII addresses only, so no stored email differs under NFC.
  - `[low]` `[reject]` Encoded or doubled `/login` as `next` returns to the sign-in page — carried: first-pass reject.
  - `[low]` `[reject]` Sign-out ignores the cookie's domain and attributes (Blind) — carried, duplicate of the edge-case row above.
  - `[low]` `[reject]` A dead cookie is never cleared (Blind) — carried, duplicate.
  - `[low]` `[reject]` `/login` does not handle a signed-in visitor (Blind) — carried, duplicate.
  - `[low]` `[reject]` Disabling the focused button drops keyboard focus — browsers keep the sequential focus starting point, so Tab continues from the button, and the failure is announced by the alert; `aria-disabled` plus handler guards is more than a direct correction.
  - `[low]` `[reject]` SignOutButton re-enables while the navigation to `/login` runs — a second press only returns `UNAUTHENTICATED` and navigates to `/login` again; no visible harm.
  - `[low]` `[reject]` `jsx-no-literals` ignores attribute text — carried: first-pass reject.
  - `[low]` `[reject]` Failed sign-ins and lockouts are not logged — real, but a lockout is rare in single-user Phase 1 and the admin shows the lock; adding a logging branch is more than a direct correction.
  - `[low]` `[reject]` Int tests miss NFD input, the ended token in "keeps other sessions", and `secure`/`domain` pass-through — NFD is a no-op on valid emails (above); the ended token is asserted in the preceding sign-out test; `secure` and `domain` are unset in the config.
  - `[low]` `[reject]` Every page has the same `<title>` — cosmetic; a title template belongs with the section shell (1.19), which names the sections.
  - `[low]` `[patch]` The e2e redirect test passes for any page with a visible h1 — patched: it now asserts the "Sign in" heading and the Email field.
  - `[medium]` `[defer]` Intent alignment: the browser surface (form navigation, error placement, sign-out landing) has no test; only action results and the signed-out redirect are tested — carried, grouped with the deferred browser test.
  - `[false]` `[reject]` Intent alignment: safe `next` is returned URL-normalised rather than byte-for-byte — every matrix input comes back unchanged; a non-canonical path (`/a/../b`) comes back as the equivalent same-origin path, which the matrix does not exclude.

## Design Notes

**Why two session modules.** The frontend may import from `lib/payload` only `requireUser`, `requireUserOrThrow` and types (spine, Design Paradigm), and `lib/account` may not call `getPayload` (gateway lint). So the Payload calls sit in `lib/payload/session.ts`, and `lib/account` owns the domain rule: one answer for every failure. Sign-in has no context, so it cannot go through the gateway; it is the AD-2 sign-in exception.

**Lockout.** Payload locks an account for 10 minutes after 5 failed attempts and throws `LockedAuth` only for real accounts. Showing a distinct message would reveal which emails exist (NFR-5's sign-in rule), so it maps to `WRONG_CREDENTIALS`. Mika, locked out by typos, waits 10 minutes or unlocks in the admin.

**Sign-out race.** Deleting the cookie in the action makes Next re-render `/` in the same response, and that render may redirect to `/login?next=%2F`. The client's `router.replace('/login')` runs after, so the final address is `/login`. Accept a brief double navigation; do not add a redirect to the action.

**Field value size.** The value uses `text-control` (17px), not `body`. Inputs under 16px make iOS Safari zoom on focus, which breaks the phone PWA. DESIGN.md gives no value size for fields.

**Form error placement.** The message sits under the form, not under a field, so it singles out neither. The Text field's own error state (danger underline, message beneath) is built and unit-tested for later validation errors.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including `nextPath`, `controls`, `styles` and `messages`.
- `npm run test:int` -- expected: all pass, including `session.int.spec.ts` (needs local Postgres).
- `npm run lint` and `npm run typecheck` -- expected: 0 errors.
- `npx eslint` on a scratch file under `src/app/(frontend)` importing `getPayload` -- expected: error; deleted afterwards.

**Manual checks (if no CLI):**
- `next dev -p <free port>`, with a test user created in the dev DB and removed afterwards:
  - `curl -sI '/?a=1'` gives a 307 to `/login?next=%2F%3Fa%3D1`.
  - `curl -H 'Accept-Language: fi-FI' /login` shows `lang="fi"` and Finnish labels.
  - In a browser: sign in lands on `next`; a wrong password shows the message; Sign out lands on `/login`, and Back to `/` redirects again.

## Auto Run Result

**Summary:** Sign-in at `/login` and sign-out are built on Payload's local strategy and server sessions.
- **Sign-in:** the form posts to `signInAction`, which calls `signIn` in `lib/account`. That calls `startSession` in `lib/payload`, which runs `payload.login` and sets Payload's own `payload-token` cookie: HttpOnly, Lax, 30 days.
- **Failures:** every failed sign-in gives the one code `WRONG_CREDENTIALS`, shown as "Wrong email or password." under the form. This covers an unknown email, a wrong password, a blank field and a locked account.
- **Return address:** sign-in returns to `next` only when it is a same-origin path, and to `/` otherwise.
- **Sign-out:** `signOutAction` → `signOut` → `endSession` removes the current session row and deletes the cookie, and the client goes to `/login`.
- **Home page:** `/` is now a signed-in placeholder with the product name and Sign out; 1.19 and 1.23 replace it.
- **Controls:** the story builds Button (primary, secondary, destructive, disabled), Text field (label, underline, empty, error) and ErrorMessage, plus a global `:focus-visible` ring. Controls are at least 44px high below 900px.
- **Lint:** `src/app/(frontend)` may no longer value-import Payload, its config, its collections, drizzle/pg or `@payloadcms/*`. Literal JSX text is a lint error.

**Files changed:**
- `src/lib/payload/session.ts`: `startSession` returns `false` for wrong credentials or a locked account; `endSession` removes the session row and deletes the cookie.
- `src/lib/account/session.ts`: `signIn` and `signOut`; every failure becomes `WRONG_CREDENTIALS`.
- `src/lib/errors.ts`: the `WRONG_CREDENTIALS` code.
- `messages/en.json`, `messages/fi.json`: `app.name`, the `signIn.*` and `signOut.submit` keys, and `errors.WRONG_CREDENTIALS`.
- `src/app/(frontend)/login/`:
  - `page.tsx`, `LoginForm.tsx`: the sign-in screen. The form submits through `onSubmit` so a failure keeps the email.
  - `actions.ts`: `signInAction`.
  - `nextPath.ts`: `safeNextPath`.
- `src/app/(frontend)/actions/account.ts`: `signOutAction`.
- `src/app/(frontend)/components/`: `Button`, `TextField`, `ErrorMessage` and `SignOutButton`.
- `src/app/(frontend)/page.tsx`: the template replaced by the signed-in placeholder.
- `src/app/(frontend)/layout.tsx`: page title "bookeh" via `generateMetadata`.
- `src/app/(frontend)/styles.css`: `--spacing-tap`, `--breakpoint-wide` and the focus ring.
- `eslint.config.mjs`: the frontend Payload import ban and `react/jsx-no-literals`.
- Tests:
  - `tests/unit/nextPath.unit.spec.ts`, `tests/unit/controls.unit.spec.ts` and `tests/int/session.int.spec.ts` are new.
  - `tests/unit/styles.unit.spec.ts` and `tests/unit/messages.unit.spec.ts` are updated.
  - In `tests/e2e/frontend.e2e.spec.ts`, the template homepage test is replaced by the signed-out redirect test.

**Departures from the Code Map, kept deliberately:**
- The cookie expires at the token's own `exp`. Payload's cookie expiry is an hour off across a DST change, which the int test caught.
- `LoginForm` submits through `onSubmit` with `useActionState`, because a form `action` resets the fields.
- The frontend ban covers `payload/*` subpaths too.

**Review findings (1 pass, 24 findings):**
- **4 patched:**
  - High: an open redirect in `safeNextPath` through dot segments (`/..//evil.example`).
  - Medium: a rejected action call (network drop) reached the error boundary, in LoginForm and in SignOutButton.
  - Low: a repeated identical failure was not re-announced.
  - Low: `lib/account` imported Payload errors against the layer rule.
- **4 deferred** (frontmatter `deferred`):
  - A browser test of the sign-in form and Sign out, waiting on the Playwright setup on `bookeh_test` (Story 3.52).
  - Lint-rule tests.
  - Sign-in timing that reveals whether an account exists (NFR-5, Phase 2).
  - A `Secure` cookie in production (Story 2.2).
- **Rejected:** the `endSession` delete missing domain/prefix handling (unreachable with the current config); the stale cookie after a dead-session sign-out (harmless); the sign-in button staying disabled after a return to `/login` (false); encoded `/login` paths, `/api`/`/admin` as `next`, and dynamic `import('payload')` (crafted or unlikely); a signed-in visitor on `/login` (not in scope, needs new surface); the tap area made by growing the control (DESIGN.md says "by padding"); `jsx-no-literals` letting attribute strings through (partial, fix not trivial). Reasons for each are in the Review Triage Log.

**Follow-up review: recommended (`true`).** This pass patched 1 high, 1 medium and 2 low entries. The high was the `next` open redirect, fixed by checking the path again after the URL is resolved. A second pass should confirm that no other URL normalisation leaves a resolved path that `router.replace` treats as external, such as encoded slashes or other `new URL` edge cases.

**Verification:**
- `npm run lint`: 0 errors. The 5 warnings were all there before.
- `npm run typecheck`: clean.
- `npm run test:unit`: 197 passed.
- `npm run test:int`: 66 passed, 1 skipped. The skip is `migrationSchema`, already skipped locally.
- Playwright `tests/e2e/frontend.e2e.spec.ts`: 2 passed, run before the review patches; the patches don't touch what it covers.
- A scratch file under `src/app/(frontend)` got 6 lint errors, one for each banned import kind and one for literal JSX text.
- Manual browser and curl checks on `next dev`, done by the implementer:
  - the signed-out `/?a=1` redirect, and sign-in landing back on it;
  - `Accept-Language: fi-FI` gives Finnish and `lang="fi"`;
  - the wrong-credentials alert;
  - sign-out landing on `/login`;
  - 44px controls at phone width, and the focus ring;
  - `next=https://evil.example/` landing on `/`.

**Residual risks:**
- Story 1.15 (Open Sans), built in parallel, also edits `layout.tsx` and `styles.css` (and probably `styles.unit.spec.ts`), so expect a small merge conflict.
- Sign-out may double-navigate briefly through `/login?next=%2F`.
- The client side of the form is covered only by manual checks until the deferred browser test exists.
- `sprint-status.yaml` is left at `backlog` for 1.16, for the main checkout to close out, as with earlier stories.

### Follow-up review pass (2026-10-09, after Story 1.15 merged)

**Rebase.** The branch was rebased onto `main` `232d757` (Story 1.15, Open Sans), and `baseline_revision` moved there.
- `src/app/(frontend)/layout.tsx`: the conflict was resolved by keeping 1.15's `Open_Sans` loader and `className` together with this story's `generateMetadata`.
- `tests/unit/styles.unit.spec.ts`: the conflict was resolved by keeping 1.15's `font` tokens and preflight check and adding `breakpoints`.
- `styles.css` merged on its own: the `:focus-visible` rule sits next to 1.15's `font-synthesis-weight: none`.

**Findings (21):**
- **1 patched (low):** the e2e redirect test now asserts the "Sign in" heading and the Email field, not just any `h1`.
- **2 carried as deferred:** the browser test of the form and Sign out, and the lint-rule tests.
- **Rejected:** 14 low, 10 of them carried from the first pass on unchanged code; and 4 false (dead NFC normalisation, an undefined `_sid`, an NFD stored email, and `next` normalisation).

**Follow-up review: not recommended (`false`).** This was a follow-up pass and it patched no high entry: 0 high, 0 medium, 1 low.

**Verification on the rebased tree:**
- `npm run lint`: 0 errors. The 5 warnings were all there before.
- `npm run typecheck`: clean.
- `npm run test:unit`: 204 passed, including 1.15's `layout.unit.spec.ts`.
- `npm run test:int`: 66 passed, 1 skipped (`migrationSchema`, as before).
- Playwright `tests/e2e/frontend.e2e.spec.ts`: 2 passed.

The dev server logs a hydration mismatch on `data-theme` while the tokens test runs. That test sets `data-theme` itself after load, so this is expected and not a defect.
