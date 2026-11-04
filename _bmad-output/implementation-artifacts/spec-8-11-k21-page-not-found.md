---
title: '8.11 [K21] Page not found'
type: 'feature'
created: '2026-11-03'
baseline_revision: '29a561e8f3086fa32b527acd666277d0ec3bff3f'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: []
deferred:
  - summary: >-
      Nothing committed asserts that an unmatched address still answers 404
      with bookeh's page, so dropping `experimental.globalNotFound` would
      silently restore Next's default 404 with every committed check green.
    evidence: |-
      The page is reached by Next's file convention only while the flag is
      set, so the flag plus the filename are the whole contract and no
      committed file references either. Demonstrated: with the flag removed,
      typecheck, lint, unit, int and build all still pass, and neither
      `scanToSave.spec.ts` nor `shopCheck.spec.ts` requests an unmatched
      address; only the gitignored walk catches it. Not fixed here because
      the Tests convention caps Playwright at scan-to-save and the shop
      check, and the one cheap committed alternative — asserting the flag in
      `next.config.ts` from a unit test — is the config-restating test the
      same convention rejects. What would settle it: the owner's call on
      whether a third committed Playwright spec is warranted for the 404.
    location: >-
      next.config.ts:51-53
    severity: low
---

<intent-contract>

## Intent

**Problem:** An address no route answers lands on Next's unstyled default 404 — wrong font, wrong colours, English only, no way back into bookeh.

**Approach:** bookeh's own not-found page: heading "Not found" and one Link to Collection (`/`), in the frontend's layout shell with the design tokens, Open Sans and the theme cookie, served with HTTP 404 for any unmatched address, signed in or not.

## Boundaries & Constraints

**Always:**

- Any unmatched frontend address answers 404 with this page (`/nothing-here`, `/wishlists/1/extra`).
- The page reads no user data and calls no service: the theme cookie and the `Accept-Language` header are its only inputs, so it renders the same signed out.
- Both languages come from `messages/*.json`; the page resolves its locale itself with `resolveLocale(undefined, acceptLanguage)`.
- Accessibility floor: exactly one `h1`, the Link reachable by keyboard with a visible focus ring (the shared `TextLink`).
- The spine's Routes table gains a row for the page in the same commit.

**Never:**

- No `notFound()` call sites, no change to the screens that already handle a missing or foreign id (a foreign wishlist still redirects to `/wishlists`; Edit book still shows Not held), and no change to the Payload admin's own not-found under `/admin`.
- No `getTranslations`/`getLocale` on this page: `src/i18n/request.ts` calls `currentUser()`, which is the service call this page must not make.
- No `src/app/(frontend)/not-found.tsx` and no `src/app/not-found.tsx` (see Design Notes — measured, neither gives the layout shell).
- No committed Playwright spec (Tests convention keeps it to scan-to-save and the shop check) and no unit test restating markup.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unmatched address, signed in | `GET /nothing-here` with session and `bookeh_prefs` theme `dark` | 404, bookeh page, `data-theme="dark"`, heading and Collection Link | No error expected |
| Unmatched address, signed out | same without session | the identical page and status; the Link leads to `/`, which sends on to sign-in | No error expected |
| Finnish browser | `Accept-Language: fi` | the Finnish strings | No error expected |
| Unknown language | `Accept-Language: de`, or header missing | English (`defaultLocale`) | No error expected |
| Deeper unmatched path | `GET /wishlists/1/extra` | 404 and the same page | No error expected |
| Admin address | `GET /admin/garbage` | Payload's own admin not-found, unchanged | No error expected |

</intent-contract>

## Code Map

- `src/app/global-not-found.tsx` -- **new**, the page. Next's only hook for unmatched addresses in an app with two root layouts (`(frontend)` and `(payload)`); it bypasses every layout, so it renders the whole document itself. Needs `experimental.globalNotFound`.
- `next.config.ts:15-18` -- the `experimental` block (`serverActions`); gains `globalNotFound: true` beside it.
- `src/app/(frontend)/layout.tsx:14-20,38-52` -- the shell to mirror: the `Open_Sans` call (weights 300/400/600, `variable: '--font-open-sans'`), `import './styles.css'`, `<html lang data-theme>` from `devicePrefs()`. No `ToastProvider`, no `NavigationTracker`, no `NextIntlClientProvider` on the not-found page — nothing on it needs them.
- `src/app/(frontend)/error.tsx:30-42` -- the sibling failure screen, and the markup pattern to follow: `max-w-panel-width`, `p-page-margin-phone wide:p-page-margin`, `h1` in `text-heading-section-phone ui-case wide:text-heading-section`, then `TextLink href="/"`.
- `src/app/(frontend)/components/Link.tsx:13-16` -- `TextLink`: the keyboard-reachable, focus-visible Link. Read-only.
- `src/app/(frontend)/prefs.ts:103-105` -- `devicePrefs()`, cookie only, no service. Read-only.
- `src/i18n/locale.ts:35-41` -- `resolveLocale(language, acceptLanguage)`; pass `undefined` for the language so no user is read. Read-only.
- `src/i18n/request.ts:17-24` -- why `getTranslations` is out: it calls `currentUser()`. Read-only.
- `messages/en.json:205-209`, `messages/fi.json:205-209` -- `errorPage`, the neighbour group; `notFoundPage` goes beside it in both files, same order.
- `tests/unit/messages.unit.spec.ts` -- already fails on a key present in one catalogue only, so it guards "both languages have them". No new test.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:555-567` -- the Routes table; the new row goes after `/data/suggest`.

## Tasks & Acceptance

**Execution:**

- `next.config.ts` -- add `experimental.globalNotFound: true` with a one-line comment naming the two root layouts as the reason -- the file convention is off by default.
- `messages/en.json`, `messages/fi.json` -- add `notFoundPage` with `heading` and `collection` -- en `"Not found"` / `"Collection"`, fi `"Sivua ei löydy."` / `"Kokoelma"`.
- `src/app/global-not-found.tsx` -- the page: locale from `Accept-Language`, strings read straight from the imported catalogues, theme from `devicePrefs()`, Open Sans and `styles.css`, the `error.tsx` markup with one `h1` and one `TextLink href="/"`; `generateMetadata` titling it from `app.name` -- no layout wraps it, so it supplies the document.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- a Routes row: the not-found page, when it applies (any address no route answers, 404, `/admin` excluded) and that it is `global-not-found.tsx` because of the two root layouts -- spine contract change in the same commit.

**Acceptance Criteria:**

- Given the e2e server, when `/nothing-here` is requested, then the status is 404 and the body is bookeh's page: the heading, the Collection Link, `styles.css` loaded and `data-theme` set from the cookie.
- Given no session, when the same address is requested, then the status, heading and Link are identical, and the page's only inputs are `cookies()` and `headers()` — no import of a service, `lib/payload`, `getTranslations` or `getLocale`.
- Given `Accept-Language: fi`, when the page renders, then the heading is the Finnish string; given `de` or no header, then the English one.
- Given `/wishlists/1/extra`, when it is requested, then 404 and the same page; given `/admin/garbage`, then Payload's own admin not-found; given `/`, `/login`, `/scan`, `/wishlists`, then their own screens, unchanged.
- Given the page in the browser, when Tab is pressed, then the Link takes focus with a visible ring, and the document has exactly one `h1`.
- Given `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:int` and `npm run build`, then all pass (the build proves the experimental flag survives `output: 'standalone'`).
- Given the walk rule, when the page is added, then one uncommitted `tests/e2e/*.walk.spec.ts` walks these criteria against the e2e server and its findings are recorded under `## Auto Run Result`.

`tests/e2e/notFoundPage.walk.spec.ts` (uncommitted), 3 tests, all passing against the e2e server on :3100:

- **404 signed out** — `GET /nothing-here` answers 404 with bookeh's page: one `h1` "Not found", a `TextLink` to `/` that takes focus on `focus()` with a non-zero outline, `html[data-theme]` set, and the heading computed in Open Sans (so `styles.css` and the font are in). Clicking the Link lands on `/login`.
- **404 signed in, dark cookie** — with a session and `bookeh_prefs` theme `dark`, `GET /nothing-here` is 404 with `data-theme="dark"`; `/wishlists/1/extra` is the same page and status; `/`, `/scan`, `/wishlists` still answer 200 with their own screens; `/admin/garbage` does not show bookeh's heading (Payload's own not-found).
- **Language from `Accept-Language` only** — `fi` renders "Sivua ei löydy.", `de` renders "Not found".

One finding, in the walk itself, not the page: Playwright's `extraHTTPHeaders: { 'Accept-Language': 'fi' }` did not reach the server (Chromium's context locale wins), which first read as the page ignoring the header. Verified by hand against a dev server — `curl -H 'Accept-Language: fi' .../nothing-here` returns the Finnish heading and status 404 — and the walk now uses `browser.newContext({ locale })`.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass

- verdicts: 15 findings — high 0, medium 2, low 10, false 3, maybe-false 0; routed: patch 7 rows (4 entries), defer 1, reject 7
- findings:
  - `[low]` `[patch]` (edge-case) No `generateViewport`, so `themeColor` is absent on this one screen — real: the file exports none and bypasses the layout that does (`(frontend)/layout.tsx:34-36`). Grouped with the next two as one partial-shell copy; fixed by mirroring the layout's viewport.
  - `[medium]` `[patch]` (edge-case) `viewportFit: 'cover'` missing, so WebKit reports `env(safe-area-inset-*)` as 0 — real, and this is a phone-first PWA: the 404 would be the only screen whose text can sit under the notch. Fixed in the same `generateViewport`.
  - `[low]` `[patch]` (edge-case) `generateMetadata` drops the layout's `icons`/`appleWebApp` — real; a 404 as the entry document in the installed app lost the icon and the opaque status bar. Both added from `(frontend)/pwa.ts`.
  - `[false]` `[reject]` (edge-case) `data-theme="system"` may be unthemed, since `system` is the default — refuted by `(frontend)/styles.css:190-191`: the dark block matches `:root:not([data-theme='light'], [data-theme='dark'])` under `prefers-color-scheme: dark`, so `system` is themed by design.
  - `[low]` `[reject]` (edge-case) The spec's Code Map lists the omitted providers but not the omitted viewport/icons — the only fix edits this build's spec; the code defect behind it is patched above.
  - `[low]` `[defer]` (verification-gap) No committed assertion that an unmatched address answers 404 with this page — real and pre-verified by that layer; recorded as the `deferred` entry with its demonstration.
  - `[low]` `[patch]` (verification-gap, Other findings) Same viewport/icons omission as above — grouped with it.
  - `[medium]` `[patch]` (blind hunter) No ESLint rule reaches the file: every frontend guardrail is globbed to `src/app/(frontend)/**`, yet this file imports frontend code — real and developer-facing: a later edit could import `lib/payload` or `@payload-config` unchecked. Fixed by naming the file in the `boundaries` target, the AD-2 syntax block and the frontend `no-restricted-imports`/`jsx-no-literals` block; the implementer probed that the rules bite (5 errors on a throwaway bad import and a bare JSX string).
  - `[low]` `[patch]` (blind hunter) The docblock cites "EXPERIENCE.md, States", which has no row for an address no route answers — real: the nearest row is "Unexpected failure | Any page that throws". Fixed by citing the spine's Routes row instead.
  - `[low]` `[patch]` (blind hunter) The spine row overstates what the page shares — real: it said "the frontend shell" while the page has no providers. Reworded to name the tokens/font/theme, the absent providers and the `Accept-Language`-only locale.
  - `[false]` `[reject]` (blind hunter) EXPERIENCE.md should gain a state row — the intent put this contract in the spine's Routes table and that row landed; the citation was the actual defect and is patched. The UX document describes screens the user navigates to, not a 404.
  - `[low]` `[reject]` (blind hunter) English heading is a fragment while Finnish is a sentence — the epic names the heading "Not found" verbatim (epics.md, story 8.11); changing it would deviate from the intent, not meet it.
  - `[low]` `[reject]` (blind hunter) A signed-in user's profile language is ignored — the intent forbids the service call that would read it, and the trade is now stated in the spine row. Persisting the locale in the prefs cookie is new state nobody asked for.
  - `[low]` `[reject]` (blind hunter) Both whole catalogues are imported for two strings — server-side only, inside a page that renders a heading and a link; the `Record<Locale, typeof en>` parity guard is worth more than the bundle bytes.
  - `[false]` `[reject]` (intent alignment) The page's bare `<main>` lacks the layout's `peer` hook and stacking context — nothing on the page pins to the bottom, so no toast or bar stacks against it; the auditor says as much itself.

## Design Notes

Measured on the e2e-style dev server before planning, with throwaway probes (all reverted; tree clean):

- `src/app/(frontend)/not-found.tsx` -- **not used** for an unmatched address. The response was Next's builtin 404 (`pagePath: __next_builtin__not-found.js`); a group-level `not-found` only answers `notFound()` inside that segment.
- `src/app/not-found.tsx` -- used, status 404, but wrapped in Next's builtin layout: bare `<html>`, no `lang`, no `data-theme`, no stylesheet. It cannot carry the shell, and a real `src/app/layout.tsx` would nest inside the two existing root layouts' own `<html>`.
- `src/app/global-not-found.tsx` with `experimental.globalNotFound: true` -- 404 on `/nothing-here` and `/wishlists/1/extra`, full document under our control (`<html lang data-theme>`, `styles.css` linked), `/admin/garbage` still Payload's own, `/login` and `/` untouched. This is the route the Next 16.3.8 docs name for an app with multiple root layouts (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/not-found.md`).

Next injects `<meta name="robots" content="noindex">` for a 404 itself; do not add one.

## Verification

**Commands:**

- `npm run build` -- expected: succeeds; `globalNotFound` is experimental, so this is the gate that it works with `output: 'standalone'`.
- `npm run typecheck`, `npm run lint` -- expected: clean (note `jsx-no-literals` does not cover `src/app/global-not-found.tsx`; the strings still come from the catalogues).
- `npm run test:unit`, `npm run test:int` -- expected: pass; `messages.unit.spec.ts` covers the key parity.
- `curl -s -o /dev/null -w '%{http_code}' http://localhost:3100/nothing-here` against the e2e server -- expected: `404`; with `-H 'Accept-Language: fi'` the body carries the Finnish heading.
- One uncommitted `tests/e2e/notFoundPage.walk.spec.ts` -- expected: the criteria above observed on the real surface; recorded, not committed.

## Auto Run Result

Status: done

**Implemented.** Any address no route answers now lands on bookeh's own 404: one `h1` ("Not found" / "Sivua ei löydy.") and one `TextLink` to Collection, with the design tokens, Open Sans, the theme cookie, the PWA icons and `viewportFit: 'cover'`. It is `src/app/global-not-found.tsx` behind `experimental.globalNotFound`, because the app's two root layouts leave no single layout a 404 could compose from; the file supplies the document, its metadata and its viewport itself. It reads no user data and calls no service — the theme cookie and `Accept-Language` are its only inputs — so the strings come straight from the catalogues rather than through `getTranslations`, whose request config calls `currentUser()`.

**Files changed** (one commit, `f76d358`)

- `src/app/global-not-found.tsx` -- the page, its metadata and its viewport (new).
- `next.config.ts` -- `experimental.globalNotFound: true`, with the two root layouts named as the reason.
- `messages/en.json`, `messages/fi.json` -- `notFoundPage.heading` and `.collection`.
- `eslint.config.mjs` -- the frontend globs and the `boundaries` target name the file, since Next's convention forces it outside `(frontend)`.
- `ARCHITECTURE-SPINE.md` -- the Routes row: 404, no providers, `Accept-Language`-only locale, `/admin` excluded.

**Review findings.** Four layers ran. 15 findings. Patched (4 entries, one grouping three reports): the missing `generateViewport`/PWA metadata (medium), the ESLint globs that did not reach the file (medium), the docblock's dead EXPERIENCE.md citation (low), the spine row's overstated "frontend shell" (low). Deferred (1, low): nothing committed asserts the 404, so dropping the experimental flag would go unnoticed. Rejected (10): three refuted by the code (the `system` theme branch, the `peer` hook, the EXPERIENCE.md row), the rest on intent or convention (the epic's own heading wording, the profile language the intent excludes, the catalogue import, and two findings whose only fix edits this build's spec).

**Follow-up review recommended: false.** Patched entries by verdict: high 0, medium 2, low 2. Two medium patches would normally ask for another pass, but both are mirrors of code that already exists and is covered: the viewport/metadata block is copied from `(frontend)/layout.tsx:21-36` and was re-walked after the patch, and the ESLint change was proved to bite by a throwaway probe (5 expected errors) with lint still green. No unverified risk can be named, so it is `false`.

**Verification**

- `npm run typecheck` -- clean. `npm run lint` -- 0 errors, 60 pre-existing warnings in `src/migrations/*`. `npx prettier --check` on the five changed files -- clean.
- `npm run test:unit` -- 1264 passed. `npm run test:int` -- 709 passed.
- `npm run build` against the migrated `bookeh_test` -- succeeds under `output: 'standalone'`, `/_not-found` listed dynamic (ƒ), so `Accept-Language` is honoured in production too.
- Uncommitted `tests/e2e/notFoundPage.walk.spec.ts` (gitignored), 3/3 passing after the patches: 404 signed out with the heading, the `/` Link, a focus ring and Open Sans on the `h1`; 404 signed in with `bookeh_prefs` dark giving `data-theme="dark"`; `/wishlists/1/extra` the same page; `/`, `/scan`, `/wishlists` still 200; `/admin/garbage` not bookeh's page; `fi` -> Finnish, `de` -> English. Walk-level gotcha recorded: Playwright's `extraHTTPHeaders` for `Accept-Language` never reaches the server (the context locale wins), so the walk uses `browser.newContext({ locale })`; confirmed by hand with `curl -H 'Accept-Language: fi'`.

**Walk findings.** `tests/e2e/notFoundPage.walk.spec.ts` (uncommitted), 3 tests, all passing against the e2e server on :3100:

- **404 signed out** — `GET /nothing-here` answers 404 with bookeh's page: one `h1` "Not found", a `TextLink` to `/` that takes focus on `focus()` with a non-zero outline, `html[data-theme]` set, and the heading computed in Open Sans (so `styles.css` and the font are in). Clicking the Link lands on `/login`.
- **404 signed in, dark cookie** — with a session and `bookeh_prefs` theme `dark`, `GET /nothing-here` is 404 with `data-theme="dark"`; `/wishlists/1/extra` is the same page and status; `/`, `/scan`, `/wishlists` still answer 200 with their own screens; `/admin/garbage` does not show bookeh's heading (Payload's own not-found).
- **Language from `Accept-Language` only** — `fi` renders "Sivua ei löydy.", `de` renders "Not found".

The one walk-level finding, in the walk and not the page: Playwright's `extraHTTPHeaders: { 'Accept-Language': 'fi' }` did not reach the server (Chromium's context locale wins), which first read as the page ignoring the header. Verified by hand against a dev server — `curl -H 'Accept-Language: fi' .../nothing-here` returns the Finnish heading and status 404 — and the walk now uses `browser.newContext({ locale })`.

**Residual risks.** The 404 depends on an experimental Next flag with no committed guard (the deferral above). `npm run build` against the **dev** database fails at static generation — Payload's interactive migration prompt, then page timeouts — reproduced at the baseline with this story's changes stashed, so it is dev-database drift, not this story; building against the migrated test database is green.
