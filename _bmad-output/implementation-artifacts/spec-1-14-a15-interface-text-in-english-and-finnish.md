---
title: 'Story 1.14 [A15] Interface text in English and Finnish'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '6f1fe95785217e22181f5b87532f26001ac605fc'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Once Story 1.11 lands, move the session read in src/i18n/request.ts behind a lib/payload function, and include src/i18n in 1.11's ban on direct Payload access.
    evidence: |-
      request.ts calls getPayload and payload.auth directly (spine line 82: frontend-reachable code reaches Payload only through lib/payload), so a page that also authenticates does it twice per request. deferred-work.md's 1.11 lint-ban entry lists only src/lib/** and src/app/(frontend)/**, so src/i18n would stay outside it. Placed here because requireUser redirects and 1.11 was being built in parallel.
    location: >-
      src/i18n/request.ts
    severity: medium
  - summary: >-
      Add a lint guard against hard-coded interface strings in src/app/(frontend)/** (e.g. react/jsx-no-literals), excluding the template page.tsx until 1.16/1.19 replace it.
    evidence: |-
      AD-15 lists hard-coded strings under what it prevents, but only review enforces it. The ESLint config already enforces other spine rules. The template page.tsx still has literal English text, so the gap predates this story.
    location: >-
      eslint.config.mjs
    severity: low
---

<intent-contract>

## Intent

**Problem:** The frontend has no message catalogue and no locale: `<html lang="en">` is hard-coded and nothing can format a date or number in the user's language. Every later story needs `next-intl` set up before it adds its first string (FR-51, AD-15, UX-DR53).

**Approach:** Add `next-intl` 4.14.9 without i18n routing. `messages/en.json` and `messages/fi.json` hold the catalogues (first content: the `errors.<CODE>` keys from `src/lib/errors.ts`). `src/i18n/request.ts` picks the locale from the signed-in user's `language`, otherwise the best `Accept-Language` match, otherwise `en`, and sets time zone `Europe/Helsinki`. The frontend root layout sets `<html lang>` from the locale and wraps the page in `NextIntlClientProvider`. A unit test fails when the catalogues' key sets differ.

## Boundaries & Constraints

**Always:** Locales are exactly `en` and `fi`, default `en`. No route has a locale segment and there is no locale middleware or cookie (language lives on the profile, AD-15). Time zone `Europe/Helsinki` is set once, in the request config. Message keys are typed from `messages/en.json` through next-intl's `AppConfig`. Exact-pinned `next-intl` `4.14.9`. Finnish strings written natively; English terse, no exclamation marks (UX-DR53).

**Never:** No `[locale]` segment, `next-intl/middleware`, `createNavigation` or locale cookie. No language switch or profile write (Story 1.23). No new `src/lib/payload` module: Story 1.11 owns that directory and is being built in parallel. No changes to the template `page.tsx` or its e2e test (1.16/1.19 replace it), to Payload admin, or to `ErrorCode`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Signed in, `fi` | user `language: 'fi'`, `Accept-Language: en-US` | locale `fi` | No error expected |
| Signed in, `en` | user `language: 'en'`, `Accept-Language: fi-FI` | locale `en` | No error expected |
| Anonymous, Finnish browser | no session, `fi-FI,fi;q=0.9,en;q=0.8` | `fi` | No error expected |
| Anonymous, q order | `en;q=0.5, fi;q=0.8` | `fi` | No error expected |
| Anonymous, region and case | `FI-fi` | `fi` | No error expected |
| Anonymous, unsupported | `de-DE, sv;q=0.9` | `en` | Fallback |
| Anonymous, excluded | `fi;q=0, de` | `en` | `q=0` means not acceptable |
| Anonymous, missing or junk | no header, empty, `;;,q=x` | `en` | Malformed entries ignored, never throws |
| Invalid session cookie | garbage `payload-token` | treated as anonymous | No throw |

</intent-contract>

## Code Map

- `package.json`, `package-lock.json` -- `next-intl` `4.14.9` already installed `--save-exact` during planning (dependency, not dev).
- `next.config.ts` -- `withPayload(nextConfig, …)` export at the bottom; wrap with `createNextIntlPlugin()` from `next-intl/plugin`. The plugin finds `./src/i18n/request.ts` by default (`node_modules/next-intl/dist/esm/development/plugin/getNextConfig.js:56`) and aliases `next-intl/config` to it for webpack and Turbopack.
- `src/app/(frontend)/layout.tsx` -- `<html lang="en">`, sync metadata, imports `./styles.css`. Make it async: `getLocale()` from `next-intl/server` for `lang`, `NextIntlClientProvider` (from `next-intl`) around `<main>`. In v4 the server provider inherits locale, messages, time zone and formats itself (`dist/esm/development/react-server/NextIntlClientProviderServer.js`), so pass no props.
- `src/app/(frontend)/page.tsx` -- template placeholder; leave untouched.
- `src/lib/errors.ts:6` -- `ErrorCode = 'UNAUTHENTICATED' | 'NOT_FOUND' | 'VALIDATION' | 'INTERNAL'`; message key `errors.<CODE>`.
- `src/collections/Users.ts` -- `language` select `en` | `fi`, required, default `en`; `payload-types.ts:147` `language: 'en' | 'fi'`.
- `src/payload.config.ts` -- default cookie prefix, so the session cookie is `payload-token`.
- `getRequestConfig` is an identity wrapper (`dist/esm/development/server/react-server/getRequestConfig.js`), so the default export of `request.ts` is callable from a test.
- `tests/helpers/harness.ts` -- `createUser({ language })` for int tests; password is `test-password`. Int lane (`vitest.config.mts`) runs against `bookeh_test` via `vitest.setup.ts`; unit lane has no DB.
- `tests/e2e/frontend.e2e.spec.ts` -- template-title and token tests; leave unchanged (spine, Tests: Playwright covers only scan-to-save and shop check). `tests/e2e/admin.e2e.spec.ts` renders `/admin` through the wrapped Next config.
- `node_modules/payload/dist/auth/strategies/jwt.js:139-151` -- an invalid or expired JWT returns `{ user: null }`; `payload.auth` throws only for strategy or access failures.
- `eslint.config.mjs` -- zones cover `src/lib`, `src/collections`, `src/app/(frontend)`; `src/i18n` is unrestricted, so the session read there passes lint.

## Tasks & Acceptance

**Execution:**
- `messages/en.json`, `messages/fi.json` -- `{ "errors": { "UNAUTHENTICATED", "NOT_FOUND", "VALIDATION", "INTERNAL" } }` in both languages, terse: UNAUTHENTICATED "Sign in to continue." / "Kirjaudu ensin sisään.", NOT_FOUND "Not found." / "Ei löytynyt.", VALIDATION "Check the marked fields." / "Tarkista merkityt kentät.", INTERNAL "Didn't work. Try again." / "Ei onnistunut. Yritä uudelleen." -- catalogues with the first real keys.
- `src/i18n/locale.ts` -- export `locales = ['en', 'fi'] as const`, `Locale`, `defaultLocale`, `timeZone = 'Europe/Helsinki'`, and pure `resolveLocale(language, acceptLanguage)` parsing q-values per RFC 9110 (primary subtag match, case-insensitive, stable on equal q, `q=0` excluded, malformed entries skipped) -- testable without Next or a DB.
- `src/i18n/request.ts` -- `getRequestConfig`: read `headers()`, `getPayload` (a failure there throws: broken config is loud), then `payload.auth({ headers })` for the session user; Payload itself returns no user for a missing or invalid token. Only if `payload.auth` throws, log through `payload.logger.error({ err }, …)` and treat the request as anonymous. `resolveLocale(user?.language, accept-language)`, return `{ locale, timeZone, messages }` with messages from a static `{ en, fi }` map -- the single place next-intl is configured.
- `src/i18n/next-intl.d.ts` -- augment `next-intl`'s `AppConfig` with `Locale` and `Messages: typeof en` -- typed keys.
- `next.config.ts` -- compose `createNextIntlPlugin()` with `withPayload`.
- `src/app/(frontend)/layout.tsx` -- `lang={await getLocale()}`, wrap in `NextIntlClientProvider`.
- `tests/unit/locale.unit.spec.ts` -- every Accept-Language row of the I/O matrix plus user-language precedence.
- `tests/unit/messages.unit.spec.ts` -- a key-diff helper over nested catalogues, proven on a synthetic pair that it reports a key missing on either side; then `en` vs `fi` has no difference; every `ErrorCode` (exhaustive `satisfies Record<ErrorCode, …>` list) has an `errors.<CODE>` string in both -- the AC's proof.
- `tests/int/i18nRequest.int.spec.ts` -- with `next/headers` mocked: a `fi` user's real `payload-token` plus `Accept-Language: en` yields `fi` and the Finnish messages; an `en` user with `fi-FI` yields `en` and the English messages; an invalid token yields the Accept-Language match; `payload.auth` made to reject once (spy on the Payload instance) yields the Accept-Language match and one `payload.logger.error` call; `timeZone` is `Europe/Helsinki`; next-intl's `createFormatter` with the returned config formats `2026-10-09T21:30:00Z` as 10 October (Helsinki date), and `1234.5` as `1 234,5` (with NBSP) in `fi`.
- No Playwright test: the spine's Tests convention limits Playwright to scan-to-save and shop check. `tests/e2e/frontend.e2e.spec.ts` stays unchanged; the rendered `<html lang>` is checked by the manual check under Verification.

**Acceptance Criteria:**
- Given `next dev`, when `/` is requested with `Accept-Language: fi-FI` and no session, then the HTML root is `<html lang="fi">`; with `de-DE`, `<html lang="en">`; the URL carries no locale segment and `/admin` still renders.
- Given a signed-in user whose `language` is `fi`, when a page renders with an English `Accept-Language`, then the locale is `fi`.
- Given the request config, when a date or number is formatted through next-intl, then it uses `Europe/Helsinki` and the locale's conventions.
- Given `messages/en.json` and `messages/fi.json`, when a key exists in one and not the other, then `npm run test:unit` fails naming the key.

## Spec Change Log

### 2026-10-09 — Loop 1 (bad_spec)
- **Trigger:** review found two Playwright `lang` tests added to `tests/e2e/frontend.e2e.spec.ts` because the spec's Tasks asked for them. The spine's Tests convention says "Playwright covers only scan-to-save and shop check", and the spine binds every story.
- **Amended:**
  - The e2e task is replaced by "no Playwright test". The rendered `lang` stays proven by the manual curl check.
  - Folded in this pass's patch-level fixes:
    - `request.ts` lets a `getPayload` failure throw. It catches only a `payload.auth` throw, and logs it through `payload.logger.error`.
    - The int test covers that path with a rejected `payload.auth` and asserts the English messages for the `en` user.
    - Finnish UNAUTHENTICATED is now "Kirjaudu ensin sisään.". The other strings are pinned.
- **Known-bad state avoided:**
  - Out-of-convention e2e tests running in CI.
  - A bare `catch {}` that hid database or config failures with no log, which no test reached: an invalid token never throws, because Payload returns `user: null`.
- **KEEP:** everything else from attempt 1, saved at `/private/tmp/claude-501/-Users-mika-development-bookeh/184fb128-6684-4579-9f51-6cfe7b9fee4b/scratchpad/story-1-14-attempt-1.patch`. Apply that patch, then make only the amendments above. All of it passed unit, int, lint and typecheck, and the manual curl check:
  - `src/i18n/locale.ts`: the parser and its regexes.
  - `src/i18n/next-intl.d.ts`.
  - The `next.config.ts` composition `withPayload(createNextIntlPlugin()(nextConfig), …)`.
  - The layout with `lang={await getLocale()}` and a prop-less `NextIntlClientProvider`.
  - `tests/unit/locale.unit.spec.ts` and `tests/unit/messages.unit.spec.ts`: `keyDiff` and the exhaustive `ErrorCode` list.
  - In the int test: mock `next-intl/server`'s `getRequestConfig` as identity, because outside the `react-server` condition it resolves to throwing stubs.

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 30 findings — high 0, medium 6, low 17, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind) `sessionLanguage`'s bare catch hides DB/config failures with no log and no test reaches it — folded into the loop-1 amendment: only a `payload.auth` throw is caught, logged via `payload.logger.error`, and tested with a rejected spy.
  - `[medium]` `[defer]` (blind) double authentication per request; promised deferred item not recorded; `src/i18n` outside 1.11's planned lint ban — recorded in frontmatter `deferred`.
  - `[low]` `[reject]` (blind) layout `metadata` still says "Payload Blank Template" — template placeholder that 1.16/1.19 replace; localising it means `generateMetadata`, new keys and changing the template e2e test.
  - `[low]` `[bad_spec]` (blind) new Playwright tests break the spine's Tests convention (Playwright only for scan-to-save and shop check) — spec amended to add no e2e test; loop 1.
  - `[low]` `[reject]` (blind) `context.close()` not in `try/finally` — the test is removed by loop 1; a leak would last only until worker teardown anyway.
  - `[false]` `[reject]` (blind) hard-coded `http://localhost:3000` — the file's existing convention; `playwright.config.ts` sets no `baseURL`.
  - `[false]` `[reject]` (blind) "`/admin` still renders" has no automated check — `tests/e2e/admin.e2e.spec.ts` renders `/admin` through the same wrapped config, and it passed.
  - `[low]` `[reject]` (blind) catalogue test does not compare ICU placeholders — no message has arguments yet; comparison needs an ICU parser.
  - `[low]` `[reject]` (blind) only `errors.*` checked for empty strings — `errors` is the only namespace.
  - `[low]` `[reject]` (blind) whole catalogue sent to the client — four strings; next-intl v4 default; worth revisiting when the catalogue grows.
  - `[false]` `[reject]` (blind) signed-in users never get the browser language — the AC puts the profile language first; that is the intended behaviour.
  - `[low]` `[patch]` (blind) Finnish UNAUTHENTICATED reads word for word — folded into loop 1: "Kirjaudu ensin sisään.".
  - `[low]` `[reject]` (blind) `en;q=0, de` resolving to `en` is untested — the AC prescribes the `en` fallback, which RFC 9110 permits.
  - `[low]` `[reject]` (edge) explicit `getTranslations({ locale })` override ignored — no caller passes one, and language comes only from the profile; honouring it adds a branch.
  - `[medium]` `[patch]` (edge) catch hides infrastructure failures — same root cause as the first row; folded into loop 1.
  - `[false]` `[reject]` (edge) stale `<html lang>` after soft navigation — nothing in this diff changes the session or language; 1.16 and 1.23 own those flows.
  - `[low]` `[reject]` (edge) `de, en;q=0` or `*, en;q=0` still returns `en` — the AC's fallback; no real browser sends this.
  - `[low]` `[reject]` (edge) a `null` or number leaf in a catalogue throws or is skipped in `keys()` — a `null` fails the test loudly; the catalogues are string JSON.
  - `[low]` `[reject]` (edge) e2e context leak — same as the blind `context.close` row.
  - `[medium]` `[patch]` (verification-gap) the garbage-token test never reaches the catch, because Payload returns `user: null` — folded into loop 1: a rejected-`auth` test is added, and the invalid-token test is described as Payload's own handling.
  - `[medium]` `[patch]` (verification-gap) catch swallows errors without logging — same root cause as the first row; folded into loop 1.
  - `[low]` `[patch]` (verification-gap) `en` → `messages.en` mapping never asserted — folded into loop 1: the `en` user test asserts the English messages.
  - `[low]` `[reject]` (intent) signed-in render not exercised at page level — the int test covers the user branch with real auth; the anonymous render covers the plugin alias and layout; sign-in e2e belongs to 1.16.
  - `[low]` `[reject]` (intent) runtime formatter inheritance of the time zone untested — next-intl library behaviour; no date is rendered yet.
  - `[low]` `[reject]` (intent) template `page.tsx` shows English under `lang="fi"` — the same template-placeholder reason as the metadata row.
  - `[false]` `[reject]` (intent) admin root `lang` does not follow the locale — admin is the back office with Payload's own i18n; AD-15 binds the frontend.
  - `[false]` `[reject]` (intent) "no locale segment" only lightly tested — the tree has no middleware or `[locale]` segment, and nothing could add one.
  - `[false]` `[reject]` (intent) an empty-object leaf on one side goes unreported — no string is lost, so there is nothing to translate.
  - `[low]` `[reject]` (intent) `fi-FI, fi;q=0` resolves `fi` — a self-contradicting header that no browser sends.
  - `[medium]` `[defer]` (intent) `request.ts` reaches Payload outside `lib/payload` — same root cause as the deferred double-auth row.

### 2026-10-09 — Review pass (loop 1)
- verdicts: 20 findings — high 0, medium 1, low 15, false 4, maybe-false 0
- findings:
  - `[low]` `[reject]` (verification-gap) rendered `<html lang>` has no automated check, only the manual curl — the spine limits Playwright to scan-to-save and shop check, and a vitest render of the layout would mock `getLocale`, the very thing under test. The first real page (1.16/1.19) should assert `lang` in whatever render test it brings; noted under residual risks.
  - `[low]` `[reject]` (intent) render path (plugin alias → `getLocale()` in layout) untested — carried: signed-in render not exercised at page level; int test covers the user branch with real auth, anonymous render the alias.
  - `[low]` `[reject]` (intent) formatter inheritance of the time zone untested — carried: next-intl library behaviour; no date rendered yet.
  - `[false]` `[reject]` (intent) admin root `lang` — carried: admin is the back office with Payload's own i18n; AD-15 binds the frontend.
  - `[false]` `[reject]` (intent) no locale segment asserted by no test — carried: nothing in the tree could add one.
  - `[low]` `[reject]` (intent) template page and metadata stay English under `lang="fi"` — carried: template placeholder replaced by 1.16/1.19.
  - `[false]` `[reject]` (intent) `keys()` sees only string leaves; typecheck catches only missing `fi` keys — carried: no string is lost; `keyDiff` reports both directions.
  - `[medium]` `[defer]` (intent) `request.ts` reaches Payload outside `lib/payload` — carried: already in frontmatter `deferred`.
  - `[low]` `[reject]` (edge) explicit `getTranslations({ locale })` override ignored — carried: no caller passes one.
  - `[low]` `[reject]` (edge) `getPayload` outside the `try`, so a DB outage 500s every frontend page — deliberate in loop 1: every page needs the database (sign-in, `requireUser`), so a loud failure hides nothing a fallback would save.
  - `[low]` `[reject]` (edge) `fi-FI;q=0.5, fi;q=0` resolves `fi` — carried: self-contradicting header no browser sends.
  - `[low]` `[reject]` (edge) empty strings outside `errors.*` pass — carried: `errors` is the only namespace.
  - `[low]` `[patch]` (blind) locale list duplicated in `Users.ts` and `locale.ts` with no check — unit test asserts the `language` options equal `locales` and the default equals `defaultLocale`.
  - `[low]` `[patch]` (blind) `'1 234,5'` relies on an invisible U+00A0 — written as `'1 234,5'`.
  - `[low]` `[patch]` (blind) `10.10.2026` cannot tell day from month — date changed to `2026-10-04T21:30:00Z` → `5.10.2026`.
  - `[low]` `[reject]` (blind) test password copied from the harness — a changed harness password fails with a login error that points at it; exporting adds helper surface.
  - `[low]` `[defer]` (blind) no lint guard (e.g. `react/jsx-no-literals` on `src/app/(frontend)/**`) enforces AD-15's ban on hard-coded strings — pre-existing gap (the template page already has literals); recorded in frontmatter `deferred`.
  - `[false]` `[reject]` (blind) `NextIntlClientProvider` wraps only `<main>` — the provider is already the only child of `<body>`; later siblings of `<main>` go inside it.
  - `[low]` `[patch]` (blind) `sessionLanguage` returns `string` rather than `Locale` — same root cause as the duplicated locale list; covered by the same unit test.
  - `[low]` `[reject]` (blind) no note on which check (typecheck vs `keyDiff`) guards which direction — `keyDiff` names missing keys on both sides; comment-only.

## Design Notes

The session is read with `payload.auth({ headers })` inside `src/i18n/request.ts` because the sign-in page has no user and `requireUser()` (Story 1.11, in progress in parallel) redirects. Once 1.11 lands, this read should move behind a `lib/payload` function so a request authenticates once and frontend-reachable code reaches Payload only through `lib/payload`. Recorded in the frontmatter `deferred` list.

The Accept-Language parser is hand-written (~20 lines) rather than importing `negotiator` or `@formatjs/intl-localematcher`: both are only transitive dependencies of next-intl, and with two locales a primary-subtag match is all that is needed.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including `locale` and `messages` specs.
- `npm run test:int` -- expected: all pass, including `i18nRequest.int.spec.ts` (needs local Postgres).
- `npm run lint` and `npm run typecheck` -- expected: 0 errors.

**Manual checks (if no CLI):**
- `next dev -p <free port>`; `curl -H 'Accept-Language: fi-FI' /` shows `<html lang="fi"`, `de-DE` shows `lang="en"`; `/admin` returns 200.

## Auto Run Result

**Summary:** `next-intl` 4.14.9 is set up without i18n routing. `messages/en.json` and `messages/fi.json` hold the first keys, `errors.<CODE>` for every `ErrorCode`. `src/i18n/request.ts` sets the locale and the `Europe/Helsinki` time zone:
- The signed-in user's `language` comes first, read with `payload.auth`.
- Otherwise the best `Accept-Language` match: q-weighted, primary subtag.
- Otherwise `en`.

The frontend root layout sets `<html lang>` from the locale and wraps its content in `NextIntlClientProvider`. Message keys are typed from `en.json`. A unit test fails, naming the key, when the catalogues' key sets differ.

**Files changed:**
- `package.json`, `package-lock.json`: `next-intl` pinned to `4.14.9`.
- `next.config.ts`: `withPayload(createNextIntlPlugin()(nextConfig), …)`.
- `messages/en.json`, `messages/fi.json`: the four `errors.<CODE>` strings.
- `src/i18n/locale.ts`: `locales`, `defaultLocale`, `timeZone`, and the pure `resolveLocale` with its RFC 9110 Accept-Language parser.
- `src/i18n/request.ts`: the next-intl request config. It reads the session; a failure in `payload.auth` is logged and treated as anonymous.
- `src/i18n/next-intl.d.ts`: `AppConfig` augmentation (`Locale`, `Messages`).
- `src/app/(frontend)/layout.tsx`: `lang={await getLocale()}` and `NextIntlClientProvider`.
- Tests:
  - `tests/unit/locale.unit.spec.ts`: Accept-Language matrix, user precedence, and the locale list matching `Users.language`.
  - `tests/unit/messages.unit.spec.ts`: `keyDiff` proven on a synthetic pair, en/fi parity, and every `ErrorCode` present.
  - `tests/int/i18nRequest.int.spec.ts`: real login tokens, an invalid token, a rejected `auth` that is logged, the Helsinki time zone, and fi date/number formatting.

**Review findings:**
- **Pass 1 (30 findings).** One bad_spec loop:
  - The spec's Playwright tests broke the spine's Tests convention, so the spec was amended and the code re-derived.
  - Folded into the loop: a bare `catch` that hid failures (now catches only `auth`, logs, and is tested), an `en` messages assertion, and more natural Finnish for UNAUTHENTICATED.
  - 2 deferred, merged into one item: moving the session read behind `lib/payload` after 1.11.
- **Pass 2 (20 findings).** 3 low patches: the locale list checked against `Users`, a visible ` `, and a date whose day and month differ. 1 low deferred: a lint guard against hard-coded JSX strings.
- **Rejected,** with reasons in the Review Triage Log. Chiefly:
  - the template page and metadata stay English (placeholders replaced by 1.16/1.19);
  - edge-case Accept-Language headers no browser sends;
  - an explicit locale override nobody passes;
  - ICU placeholder parity (no message has arguments yet);
  - the admin root `lang` (back office);
  - a DB outage failing loudly (every page needs the DB);
  - no automated `<html lang>` render check (the spine bars Playwright here).

**Follow-up review:** not recommended (`false`). The final pass patched 0 high and 0 medium entries (3 low).

**Verification:**
- `npm run test:unit`: 112 passed.
- `npm run test:int`: 27 passed, 1 skipped. The skip is `migrationSchema`, already skipped locally.
- `npm run lint`: 0 errors. The 7 warnings were all there before.
- `npm run typecheck`: clean.
- Manual check, `next dev -p 3914`:
  - `Accept-Language: fi-FI` gives `<html lang="fi">`.
  - `de-DE` gives `lang="en"`.
  - `en;q=0.5, fi;q=0.8` gives `lang="fi"`.
  - `/admin` returns 200.

**Residual risks:**
- Nothing automated checks the rendered `<html lang>`. The first real page (1.16/1.19) should assert it in whatever render test it brings.
- `src/i18n/request.ts` reaches Payload directly, so a page that also authenticates reads the session twice. This is deferred to after Story 1.11; add `src/i18n` to 1.11's direct-Payload lint ban.
- The template `page.tsx` and layout metadata show English under `lang="fi"` until replaced.
