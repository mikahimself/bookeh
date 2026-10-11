---
title: 'Story 3.54: [K15] Epic 1 test and toast clean-up'
type: 'chore'
created: '2026-10-11'
status: 'done'
baseline_revision: 'e577e67a11f2c7fc5306df49aca1ba3d0a04ebba'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: [multiple-goals, oversized]
deferred: []
---

<intent-contract>

## Intent

**Problem:** Epic 1 left 45 Playwright tests outside the spine's scope (Playwright covers only scan-to-save and shop check) and unit suites that restate markup, class names and CSS; `flashToast()` double-encodes on the wire so every server-raised toast is dropped before Epic 3's save flow adopts it; a failed sign-out shows an inline message while every other failed action toasts.

**Approach:** Remove the seven Epic 1 e2e specs and their helpers, move the one behaviour worth keeping (GraphQL answers a 404) into the integration lane, trim the unit suites to the functional minimum, make the flash cookie symmetric with Next's own percent-encoding and pin it through Next's serialiser, and route a failed sign-out to the error toast.

## Boundaries & Constraints

**Always:** `tests/e2e/` ends empty; `playwright.config.ts`, the `test:e2e` script and CI's e2e step stay and pass with no specs. Keep every test that guards behaviour that can break in a way that matters (access and gateway scope, sessions and the `next` check, error mapping, preference and profile parsing, toast store, seed, collation, migrations, the two-user tests, en/fi catalogue parity, an off-token utility emitting no CSS). The flash round-trip test goes through `ResponseCookies` from `next/dist/server/web/spec-extension/cookies` (the class behind `cookies().set`), never a hand-encoded value. Sign-out keeps the UNAUTHENTICATED → `/login` redirect. Strict TS, no `any`.

**Never:** Add a browser test. Move or refactor `settings/report.ts` (the shared action-failure helper is retro action item 4, not this story). Touch the prefs cookie codec. Change the toast store, `ToastProvider` or `ToastView` behaviour. Remove `ErrorMessage` (LoginForm uses it). Change `vitest.config.mts` projects or the int lane's database setup.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Flash round trip | `flashToast({kind:'success', message:'Saved to Tampere; "ä" 100%'})` with `cookies()` backed by a real `ResponseCookies` | The `set-cookie` header's `bookeh_flash=<value>` pair, handed verbatim to `takeFlash()` as the browser would via `document.cookie`, decodes to the same input; `Path=/`, `Max-Age=60`, `SameSite=lax`, not HttpOnly, not Secure outside production | No error expected |
| Flash round trip, error and held success | `{kind:'error', code:'INTERNAL'}`, `{kind:'success', message:'Saved', hold:true}` | Same equality through the serialiser | No error expected |
| Tampered flash | `document.cookie` holds `bookeh_flash=not%20json` or a wrong shape | `takeFlash()` clears the cookie and returns `null` | Never throws |
| GraphQL removed | `REST_POST(config)` for `/api/graphql` (slug `['graphql']`), `REST_GET(config)` for `/api/graphql-playground` | 404, `content-type` `application/json`, body message matching /not found/i (verified: `{"message":"Route not found \"/api/graphql\""}`) | No error expected |
| Sign-out fails | `signOutAction()` resolves `{ok:false, code:'INTERNAL'}` or rejects (network) | `useToast().show({kind:'error', code})`; no inline message; button re-enabled | No error expected |
| Sign-out with no session | `signOutAction()` answers UNAUTHENTICATED | `router.replace('/login')`, no toast | No error expected |
| Empty e2e run | `npm run test:e2e` with no spec files | Exit 0 ("No tests found" is not a failure) | `--pass-with-no-tests` |

</intent-contract>

## Code Map

- `tests/e2e/{admin,frontend,graphql,pwa,sections,settings,swipe}.e2e.spec.ts` -- the seven specs to delete (45 tests).
- `tests/helpers/login.ts`, `tests/helpers/seedUser.ts`, `tests/helpers/viewTransitions.ts` -- used only by the e2e specs (grep confirmed); delete. `tests/helpers/harness.ts` and `testDatabase.ts` stay (int lane, `vitest.setup.ts`).
- `tests/int/config.int.spec.ts` -- already asserts `graphQL.disable`; add the two REST 404 cases here. `REST_GET`/`REST_POST` come from `@payloadcms/next/routes` and take `(request, { params: Promise.resolve({ slug: string[] }) })`; they run inside the int lane (probed 2026-10-11).
- `package.json:20` -- `test:e2e` script; append `--pass-with-no-tests` (supported by Playwright 1.58.2).
- `playwright.config.ts:30-36` -- `launchOptions` existed only for the swipe tests; drop the block. Everything else stays.
- `.github/workflows/ci.yml:99-100` -- e2e step stays unchanged.
- `src/app/(frontend)/components/toast/flash.ts` -- `flashToast()` sets `encodeFlash(input)` (already percent-encoded); Next's `MutableRequestCookies` serialises through `ResponseCookies.set`, which percent-encodes again (`node_modules/next/dist/compiled/@edge-runtime/cookies/index.js:45`). Fix: set `JSON.stringify(input)` and let Next encode once.
- `src/app/(frontend)/components/toast/flashCookie.ts` -- `encodeFlash` (delete), `takeFlash` (reads raw `document.cookie`, unchanged), `decodeFlash` (one `decodeURIComponent` + `JSON.parse`, unchanged). Update the doc comments to state the contract: server sets plain JSON, Next percent-encodes on the wire, the browser hands it back verbatim, the client decodes once.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- `useToast()` gives `show`; reads the flash on mount and pathname change. Unchanged.
- `tests/unit/flashCookie.unit.spec.ts` -- rewrite: drop the `encodeFlash` codec tests and the mock-call `flashToast` test; add the serialiser round trip (mock `next/headers` `cookies` to resolve `new ResponseCookies(headers)`, take the `set-cookie` header's first `name=value` pair). Keep the `decodeFlash` malformed cases and the `takeFlash` tests, building raw values with `encodeURIComponent(JSON.stringify(...))` where one is needed. Pattern: `tests/unit/prefs.unit.spec.ts:79-92`.
- `src/app/(frontend)/components/SignOutButton.tsx` -- replace `failed` state + `ErrorMessage` with `useToast().show({ kind: 'error', code })`; drop the wrapper div. Reference presentation: `src/app/(frontend)/(sections)/settings/report.ts` (do not import it).
- `tests/unit/` trims (keep → delete):
  - delete whole files: `controls`, `layout`, `settings`, `shell`, `toastView` (all markup/class/CSS restating).
  - `styles.unit.spec.ts` -- keep only the `'%s produces no CSS'` off-token cases with `build`/`empty`; delete token tables, `block`/`declarations` helpers and the rest.
  - `pwa.unit.spec.ts` -- keep `themeColorFor` fixed-theme and system-pair tests; delete `manifest`, the styles.css token coupling and the `app icon` test (and the `sharp` import).
  - `sections.unit.spec.ts` -- keep `sectionOf` and `sectionAfter`; delete `sectionRow`.
  - `swipe.unit.spec.ts` -- delete only `'names the thresholds'`.
  - untouched: `access`, `account`, `errors`, `locale`, `messages`, `nextPath`, `prefs`, `proxy`, `seedFirstUser`, `testDatabase`, `toastStore`.
- `tests/int/*` -- all stay.
- `_bmad-output/implementation-artifacts/deferred-work.md:18-20` -- the admin e2e `beforeAll` timeout entry: add `decided:` closed by this story (spec removed).
- `_bmad-output/implementation-artifacts/sprint-status.yaml:71-72` -- `epic-3` → `in-progress`, `3-54-...` → `done` at the end.

## Tasks & Acceptance

**Execution:**
- `tests/e2e/*.e2e.spec.ts`, `tests/helpers/{login,seedUser,viewTransitions}.ts` -- delete -- outside the spine's Playwright scope.
- `tests/int/config.int.spec.ts` -- add POST `/api/graphql` and GET `/api/graphql-playground` 404 JSON cases through the REST handlers -- the only e2e-proven behaviour that matters and tests here.
- `package.json`, `playwright.config.ts` -- add `--pass-with-no-tests`; drop the swipe-only `launchOptions` -- empty suite passes locally and in CI.
- `src/app/(frontend)/components/toast/flash.ts`, `flashCookie.ts` -- set plain JSON, remove `encodeFlash`, document the one-encode contract -- symmetric wire format.
- `tests/unit/flashCookie.unit.spec.ts` -- serialiser round trip for three inputs plus cookie attributes; keep malformed/takeFlash cases -- pins the contract.
- `src/app/(frontend)/components/SignOutButton.tsx` -- error toast instead of inline message -- EXPERIENCE.md action-failure rule.
- `tests/unit/{controls,layout,settings,shell,toastView}.unit.spec.ts` -- delete; `styles`, `pwa`, `sections`, `swipe` -- trim as in the Code Map -- functional minimum.
- `deferred-work.md`, `sprint-status.yaml` -- record the closure and status.

**Acceptance Criteria:**
- Given the repository after the story, when `ls tests/e2e` runs, then it is empty, and `npm run test:e2e` exits 0.
- Given `npm run test:unit` and `npm run test:int`, when they run, then all pass, `config.int` proves the GraphQL 404s, and the only test touching `flashToast` goes through `ResponseCookies`.
- Given a real `ResponseCookies`, when `flashToast(input)` is called and the resulting `bookeh_flash` pair is given to `takeFlash()`, then the decoded value equals `input` for a success, a held success and an error.
- Given Settings with a failing `signOutAction`, when Sign out is pressed, then an error toast shows and no `ErrorMessage` renders; with UNAUTHENTICATED the user lands on `/login`.
- Given `npm run lint` and `npm run typecheck`, when they run, then both pass (no unused imports or helpers remain).

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 16 findings — high 0, medium 2, low 9, false 4, maybe-false 0 (intent-alignment layer: descriptive, no routed findings; its three observations fold into rows 1, 10 and the GraphQL note below)
- findings:
  - `[low]` `[patch]` (blind 1) Empty e2e run still boots the dev server and CI installs Chromium for nothing — the webServer half is refuted: a timed `npm run test:e2e` with no specs exits 0 in 4 s and nothing listens on :3000 afterwards, so Playwright never started `npm run dev`; the Chromium install on every push is real. Fix applied: `if: hashFiles('tests/e2e/**/*.spec.ts') != ''` on the install step only; the e2e step stays unconditional.
  - `[low]` `[patch]` (blind 2) `SWIPE_EDGE_PX` / `SWIPE_MIN_PX` dead exports — grep confirmed no importer after the threshold test went. Fix applied: `export` dropped.
  - `[low]` `[patch]` (blind 3) `sectionRow` rotation lost its only behaviour test while `sectionAfter` kept one — pure logic consumed by `SectionNav`; the Code Map's "delete sectionRow" was too broad. Fix applied: the "leads with %s and wraps round" cases restored; the href-pairing test stays deleted.
  - `[medium]` `[patch]` (blind 4, grouped with verification-gap 1) Settings failure routing (`useReportFailure`: UNAUTHENTICATED → `/login?next=%2Fsettings`, else toast) had no test once `settings.e2e` went; swapping the branches kept every suite green. Fix applied: `tests/unit/report.unit.spec.ts` (jsdom `renderHook`, two cases). The per-control optimistic reverts asked for in blind 4 are browser-glue the Epic 1 retrospective decided not to test; not patched.
  - `[low]` `[reject]` (blind 5) `sprint-status.yaml` says `done` in the implementation commit before review — the commit is unpushed and amended at finalisation with the final state; nobody meets the interim value.
  - `[false]` `[reject]` (blind 6) Retro action item 7 orphaned and item 4 half-decided — the retrospective already records that items 7 and 9 close when 3.54 removes the specs (retro line 131) and that the shared-helper refactor stays in item 4 (decision 1); nothing is orphaned.
  - `[low]` `[patch]` (blind 7) `jsdom` and `@testing-library/dom` added with `^` next to exactly pinned test deps — Fix applied: pinned `29.1.1` and `10.4.2`, lockfile re-synced. The request to mention jsdom in the spec is a spec edit (rejected by rule); recorded under Auto Run Result instead.
  - `[low]` `[patch]` (blind 8) `vi.clearAllMocks()` keeps implementations in Vitest 4, so a future case inherits the previous result — Fix applied: `vi.resetAllMocks()`.
  - `[low]` `[patch]` (blind 9) Flash contract comment omits that `cookies().get()` decodes once too — Fix applied: one sentence on `FLASH_COOKIE` forbidding server-side reads; prefs noted as different on purpose.
  - `[low]` `[patch]` (blind 10) `config.int.spec.ts` built `Request` objects at collection time; a POST body is consumed once — Fix applied: per-row factories.
  - `[low]` `[reject]` (blind 11) "45 Playwright tests" should be 53 — correct (the retro's own 52/53 agrees), but the fix edits this build's spec; the right count is in Auto Run Result.
  - `[false]` `[reject]` (blind 12) `package-lock.json` missing from the reviewed diff — excluded from the diff file on purpose for size; the lockfile is in commit 3c83a2e and the verification-gap layer confirmed `npm ci` is in sync.
  - `[false]` `[reject]` (edge-case 1) Make `webServer` conditional because the empty run boots it — refuted as in blind 1: no server starts with zero specs.
  - `[low]` `[reject]` (edge-case 2) `--pass-with-no-tests` left in place after 3.52 adds specs would turn a misnamed spec into a green run — real but not met until 3.52, and the proposed shell conditional adds complexity; noted as a residual for Story 3.52 to drop the flag.
  - `[low]` `[patch]` (edge-case 3) same as blind 2 — Fix applied with it.
  - `[medium]` `[patch]` (verification-gap 1) same root cause as blind 4; arrived pre-verified with disposition patch — Fix applied as above.

GraphQL note (intent-alignment): coverage narrowed from four method/path cases plus a REST control to two cases through the handlers; judged sufficient, since both go through the same catch-all and `config.int` already pins `graphQL.disable`.

## Auto Run Result

Status: done

**Summary.** The seven Epic 1 Playwright specs (53 tests) and their three helpers are gone; `tests/e2e/` is empty (a `.gitkeep` keeps the folder) and `npm run test:e2e` exits 0 with `--pass-with-no-tests`. The GraphQL 404 moved into `tests/int/config.int.spec.ts` through Payload's REST handlers. Unit suites trimmed: `controls`, `layout`, `settings`, `shell`, `toastView` deleted; `styles` keeps the off-token "produces no CSS" cases; `pwa` keeps `themeColorFor`; `sections` keeps `sectionOf`, `sectionRow` wrap and `sectionAfter`; `swipe` loses only the constants test. `flashToast()` now sets plain JSON so Next percent-encodes once and the client decodes once, pinned by a round trip through `ResponseCookies` into `takeFlash()`. A failed sign-out shows an error toast. Two jsdom unit specs (`signOutButton`, `report`) cover the client failure routing; `jsdom` 29.1.1 and `@testing-library/dom` 10.4.2 are new pinned dev dependencies, used through a per-file `// @vitest-environment jsdom` docblock (no `vitest.config.mts` change).

**Files changed.**
- `tests/e2e/*.e2e.spec.ts`, `tests/helpers/{login,seedUser,viewTransitions}.ts` — deleted; `tests/e2e/.gitkeep` added.
- `tests/unit/{controls,layout,settings,shell,toastView}.unit.spec.ts` — deleted; `styles`, `pwa`, `sections`, `swipe` — trimmed.
- `tests/unit/flashCookie.unit.spec.ts` — rewritten around the serialiser round trip.
- `tests/unit/signOutButton.unit.spec.ts`, `tests/unit/report.unit.spec.ts` — new jsdom behaviour tests.
- `tests/int/config.int.spec.ts` — GraphQL 404 cases through `REST_POST` / `REST_GET`.
- `src/app/(frontend)/components/toast/flash.ts`, `flashCookie.ts` — one-encode contract; `encodeFlash` removed.
- `src/app/(frontend)/components/SignOutButton.tsx` — error toast instead of inline message.
- `src/app/(frontend)/components/swipe.ts` — thresholds no longer exported.
- `package.json`, `package-lock.json` — `--pass-with-no-tests`; `jsdom`, `@testing-library/dom`.
- `playwright.config.ts` — swipe-only `launchOptions` dropped. `.github/workflows/ci.yml` — browser install gated on specs existing.
- `deferred-work.md` (admin e2e timeout entry closed), `sprint-status.yaml` (epic 3 in progress, 3.54 done), `epic-3-context.md` (new).

**Review findings.** 16 findings: 9 patched (1 medium entry — `useReportFailure` coverage — and 8 low), 7 rejected: blind 5 (interim sprint status, harmless), blind 6 (retro items already recorded), blind 11 (test count, spec edit), blind 12 (lockfile excluded from diff on purpose), edge-case 1 (webServer claim refuted by timing), edge-case 2 (flag after 3.52, deferred as a residual), and the spec-mention half of blind 7. Nothing deferred to the frontmatter list.

**Follow-up review recommendation:** false. Patched by verdict: high 0, medium 1, low 8. No unverified risk remains that a second pass would settle.

**Verification.** `npm run test:unit` 18 files / 281 tests pass; `npm run test:int` 13 files / 107 pass, 1 pre-existing skip; `npm run test:e2e` exit 0 in 4 s with no specs and no dev server started; `npm run lint` 0 errors (8 pre-existing warnings in `src/migrations`); `npm run typecheck` clean; prettier clean on touched files.

**Residual risks.** Story 3.52 should remove `--pass-with-no-tests` when it adds the scan-to-save spec, or a misplaced spec passes CI green. The flash round trip is proven at the serialiser boundary, not in a browser; the provider's `document.cookie` read is unchanged code. CI's `hashFiles` gate on the Chromium install is not exercised locally.

## Design Notes

Flash wire contract after the fix: `flashToast` → `cookies().set(FLASH_COOKIE, JSON.stringify(input))` → Next writes `bookeh_flash=%7B%22kind%22...` → browser stores and returns that string verbatim in `document.cookie` → `takeFlash` → `decodeFlash` = `JSON.parse(decodeURIComponent(raw))`. One encode, one decode. The prefs cookie differs because the server reads it back through `cookies().get`, which already decodes once; leave it alone.

Round-trip test sketch (unit lane, no DOM):
```ts
const headers = new Headers()
vi.mocked(cookies).mockResolvedValue(new ResponseCookies(headers) as never)
await flashToast(input)
const pair = headers.get('set-cookie')!.split(';')[0]
expect(takeFlash({ read: () => pair, write: () => {} })).toEqual(input)
```

## Verification

**Commands:**
- `npm run test:unit` -- expected: pass; `flashCookie`, `styles`, `pwa`, `sections`, `swipe` trimmed as listed.
- `npm run test:int` -- expected: pass (Compose Postgres is up; `bookeh_test` exists).
- `npm run test:e2e` -- expected: exit 0 with "No tests found".
- `npm run lint && npm run typecheck` -- expected: clean.
- `git status --porcelain` after commit -- expected: clean; `epic-3-context.md` committed with the story.
