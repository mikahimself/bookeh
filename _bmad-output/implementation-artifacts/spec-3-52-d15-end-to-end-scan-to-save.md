---
title: 'Story 3.52: [D15] End-to-end: scan to save'
type: 'feature'
created: '2026-10-20'
baseline_revision: '486b3f6531add0ec8f38f8191c76ac889b4b5b3e'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The first self-fetch of the fixture cover route may hit a cold next dev compile longer than the 5 s cover timeout on a slow CI runner.
    evidence: |-
      Unverified. The server fetches /data/fixture-cover/<isbn> through fetchCover (timeoutMs 5000) on the Answer's preview and again on save; under next dev that route compiles on first request. Locally the whole spec runs in 13-17 s and passes. Settle it on the first CI run; if it flakes, point webServer.url at the cover route so it compiles before the spec starts.
    location: >-
      playwright.config.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** No browser test covers the primary flow, so the page wiring of `/scan`, the save toast and Undo can break silently (Tests convention). Playwright still starts `npm run dev` on port 3000 against the dev database, the app has no fixture source, and the cover allowlist rejects a local URL.

**Approach:**
- Add a `fixture` source that serves the Finna responses in `tests/fixtures/finna/`. It replaces the real sources when `BOOKEH_SOURCES=fixture`, and the app refuses that value under `NODE_ENV=production`.
- The fixture source's covers come from a local route. Only under that setting is the route on the cover allowlist.
- Playwright starts its own `next dev`: port 3100, `distDir` `.next-e2e`, database `bookeh_test`, migrations applied, push off. A seed script prepares one known user.
- One spec walks sign-in → Scan → typed ISBN → Answer → Add → Undo → save again.

## Boundaries & Constraints

**Always:**
- **Source selection.** Selection lives in `src/lib/metadata/sources/fixture.ts`, in `usesFixtureSources(env = process.env): boolean`:
  - unset or `''` → `false`;
  - `'fixture'` → `true`, but it throws under `NODE_ENV=production`;
  - any other value → throws.
  
  `sources/index.ts` exports `[fixture]` when that returns true, otherwise `[finna, google]`. So in fixture mode no real source is ever called.
- **Fixture source.** It has `id: 'fixture'` and keeps the `Source` contract (it never throws).
  - It reads `tests/fixtures/finna/<isbn13>.json`, resolved from `process.cwd()`.
  - A missing file returns `[]`. An unreadable or unusable body returns `undefined`.
  - Results come from Finna's own parsing, through a new export in `finna.ts` (`finnaResults(body, isbn13)`) that `finna.lookupByIsbn` uses too. Its sort and output stay byte-identical.
  - Each result is re-labelled `source: 'fixture'` and `raw: { fixture: body }`.
  - A result with a cover gets `coverUrl = ${fixtureOrigin()}/data/fixture-cover/<isbn13>`, where `fixtureOrigin(env)` is `http://localhost:${env.PORT ?? '3000'}`. A result without a cover keeps none.
- **Cover route.** `GET /data/fixture-cover/[isbn13]` returns a generated JPEG (sharp, 2:3, about 300×450) when fixture mode is on and that ISBN's fixture has a cover. In every other case it returns 404, including fixture mode off. It needs no sign-in, because the server fetches it.
- **Cover allowlist.** `covers.ts` gets a pure `allowsCoverUrl(url, env = process.env)`, and `coverPolicy.allows` uses it.
  - It keeps today's rule: `https:` plus `COVER_HOSTS`.
  - It adds `url.origin === fixtureOrigin(env)` only when `usesFixtureSources(env)`.
  - Redirect, size and type checks are unchanged.
- **Playwright web server.**
  - `next.config.ts` gets `distDir: process.env.NEXT_DIST_DIR || '.next'`.
  - The `webServer` command, in order: `payload migrate`, then `payload run tests/e2e/seed.ts`, then `npm run dev`. Pass `</dev/null` to the Payload steps, as CI does.
  - Its `env` sets:
    - `DATABASE_URL = testDatabaseUrl(process.env.DATABASE_URL)`
    - `DATABASE_PUSH=false`
    - `BOOKEH_SOURCES=fixture`
    - `PORT=3100`
    - `NEXT_DIST_DIR=.next-e2e`
    - `MEDIA_DIR=media-test`
    - empty `SEED_EMAIL` and `SEED_PASSWORD`
  - `reuseExistingServer: false`, `url` = `http://localhost:3100/login`, and `use.baseURL` = `http://localhost:3100`.
- **Seed** (`tests/e2e/seed.ts`). It refuses to run unless the path of `DATABASE_URL` is `/bookeh_test`. Then:
  - It upserts the user `E2E_EMAIL` with `E2E_PASSWORD`, roles `['user']` and language `'en'`; the password is reset each run.
  - It gives that user the default location `E2E_LOCATION` (`resolveLocation` + `updateProfile`).
  - It deletes the leftovers of `E2E_ISBN` from earlier runs: copies and user-books of that Book (any owner), then the Book itself. Use the Local API with system access.
  
  The constants live in `tests/e2e/account.ts`, which has no Payload import.
- **The spec** (`tests/e2e/scanToSave.spec.ts`):
  - Record every browser request whose origin is not `baseURL` (ignore `data:` and `blob:`) and expect none at the end.
  - Sign in at `/login`, then click "Scan book".
  - Type the ISBN hyphenated in "Or type an ISBN" and press Enter. Expect the heading "Not in library", the text "From fixture", and a cover `<img>` with `naturalWidth > 0`.
  - Add to library → expect the heading "Scan" with the toast "Saved to E2E shelf".
  - Undo → "Undone".
  - Enter the ISBN again → "Not in library" → Add to library → "Saved to E2E shelf".
  - Enter the ISBN once more → "In library", and the save toast is gone.
  - Back → Scan, then browser back → `/`.
- **Scripts and CI.**
  - `test:e2e` drops `--pass-with-no-tests` and `--import=tsx/esm`.
  - CI installs Chromium unconditionally (drop the `hashFiles` gate) and moves "Check push stayed off" after the e2e step.
  - `.gitignore`, the ESLint ignores and `tsconfig.json` `include` gain `.next-e2e`, mirroring `.next`.
  - `.env.example` documents `BOOKEH_SOURCES` and `NEXT_DIST_DIR` (commented; Playwright sets them).
  - README gets a short local e2e note.

**Never:**
- No `sources.fixture` message key: "From fixture" is the deliberate raw-id fallback (spec 3.45).
- No network from tests, no second Playwright spec, no camera emulation.
- No change to the save, lookup or Answer code, and none to `coverPolicy`'s production behaviour.
- No `NODE_ENV=production` server for e2e. The fixture source is refused there.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Real sources | `BOOKEH_SOURCES` unset | `sources` = `[finna, google]`; local cover URL rejected | — |
| Fixture mode | `BOOKEH_SOURCES=fixture`, dev | `sources` = `[fixture]`; `http://localhost:<PORT>` covers allowed | — |
| Production | `fixture` + `NODE_ENV=production` | refused | throws |
| Unknown value | `BOOKEH_SOURCES=foo` | refused | throws |
| No fixture file | ISBN not in `tests/fixtures/finna/` | `[]` → Answer "not found" | — |
| Cover route off | fixture mode off, or no cover in the fixture | 404 | — |
| Wrong database | seed with `DATABASE_URL` path other than `/bookeh_test` | nothing written | throws |

</intent-contract>

## Code Map

- `src/lib/metadata/sources/index.ts` -- `export const sources = [finna, google]` (line 6); the selection point.
- `src/lib/metadata/sources/finna.ts` -- `coverUrl()` 206, `toResult()` 220, `fetchBody()` 247, `finna.lookupByIsbn` 263-279 (scoring and sort). Extract the parse-and-sort into `finnaResults(body, isbn13)`. Also export a `finnaBody(body)` validity check (the status/records checks in `fetchBody`), or fold that check into `finnaResults`.
- `src/lib/metadata/source.ts:59` -- the `Source` contract: `undefined` means failure, `[]` means not found.
- `src/lib/catalogue/covers.ts:15-23` -- `COVER_HOSTS` and `coverPolicy`. `fetchCover` 133 (sharp type check: serve a real JPEG). `downloadCover` 168 and `storeCover` 209 use the default policy, and so does `src/lib/catalogue/coverPreview.ts` (`fetchCoverPreview`).
- `src/app/(frontend)/data/cover/[isbn13]/route.ts` -- pattern for the new route handler. If the layer lint forbids `(frontend)` importing `lib/metadata`, put a service in an allowed layer (for example `lib/catalogue`) and call that instead.
- `src/proxy.ts` -- no auth; new routes are public unless they call `requireUser`.
- `tests/fixtures/finna/9789524035699.json` -- Sapiens. Its one record has a cover. `tests/unit/finna.unit.spec.ts:63-93` lists its fields.
- `tests/helpers/testDatabase.ts` -- `testDatabaseUrl(url)` is pure and usable from `playwright.config.ts`.
- `tests/helpers/harness.ts` -- `contextFor(user)`, usable from the seed. `createUser` uses random emails, so don't use it for the fixed user.
- `src/lib/copies/locations.ts:20` `resolveLocation(ctx, { create })` and `src/lib/account/profile.ts:69` `updateProfile(ctx, { defaultLocation })`.
- `src/payload.config.ts:37-53` -- `push: DATABASE_PUSH !== 'false'`; `onInit` seeds from `SEED_*` and sweeps orphan media in `MEDIA_DIR`.
- `playwright.config.ts` -- today: `dotenv/config`, `webServer: npm run dev` on :3000 with `reuseExistingServer: true`. Playwright merges `webServer.env` over `process.env` (`webServerPlugin.js:88-91`) and starts web servers before `globalSetup`.
- `package.json` `test:e2e` and `.github/workflows/ci.yml` -- the Chromium install `if: hashFiles(...)`, the e2e step, and "Check push stayed off".
- `tsconfig.json:35-41` -- include `.next/types/**/*.ts` and `.next/dev/types/**/*.ts`. Next appends the same for any `distDir`, so pre-add the `.next-e2e` entries. Ignore files: `.gitignore` `/.next/`, `eslint.config.mjs:351` `.next/**`.
- Selectors (en): link "Scan book"; labels "Email", "Password" and "Or type an ISBN"; buttons "Sign in", "Add to library", "Undo" and "Back"; headings "Scan", "Not in library" and "In library"; texts "From fixture", "Saved to {location}" and "Undone". `ui-case` lowercases visually, so use accessible names and text, not `innerText`. The toast region is `[data-toast-region]`.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/sources/finna.ts` -- export `finnaResults` (and the body check); `finna` uses it.
- `src/lib/metadata/sources/fixture.ts` -- new: `usesFixtureSources`, `fixtureOrigin`, the `fixture` source, and `fixtureCover(isbn13)` (JPEG bytes or `undefined`).
- `src/lib/metadata/sources/index.ts` -- env-selected list.
- `src/lib/catalogue/covers.ts` -- `allowsCoverUrl`; `coverPolicy.allows` delegates to it.
- `src/app/(frontend)/data/fixture-cover/[isbn13]/route.ts` -- new: the local cover route.
- `next.config.ts` -- the `distDir` from env.
- `tsconfig.json`, `.gitignore`, `eslint.config.mjs` -- the `.next-e2e` entries.
- `tests/e2e/account.ts`, `tests/e2e/seed.ts`, `tests/e2e/scanToSave.spec.ts` -- new, as specified. Delete `tests/e2e/.gitkeep`.
- `playwright.config.ts`, `package.json`, `.github/workflows/ci.yml`, `.env.example`, `README.md` -- as specified.
- `tests/helpers/testDatabase.ts` -- add pure `assertTestDatabase(url)` (throws unless the path is `/bookeh_test`); the seed calls it before `getPayload`.
- `tests/unit/fixtureSource.unit.spec.ts` -- new, covering:
  - `usesFixtureSources` in all four cases;
  - the fixture source on Sapiens (source `fixture`, local `coverUrl`) and on an unknown ISBN (`[]`);
  - `fixtureCover` returning JPEG bytes in fixture mode and `undefined` with the mode off or no cover;
  - `allowsCoverUrl` accepting the local origin only in fixture mode, and Finna's https host in both;
  - `assertTestDatabase` passing `bookeh_test` and throwing on `bookeh`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.52 `done` when finished.

**Acceptance Criteria:**
- Given a migrated `bookeh_test` and `npm run test:e2e`, when the spec runs, then it signs in, opens Scan, enters the ISBN, sees "Not in library" with "From fixture", taps Add to library, sees "Saved to E2E shelf", taps Undo, sees "Undone", and saves again, with no browser request off the app's origin.
- Given a `next dev` on the dev database on :3000, when `npm run test:e2e` runs, then it starts its own server on :3100 with `.next-e2e`, writes only to `bookeh_test`, and leaves no `batch = -1` row in `payload_migrations`.
- Given a second run of `npm run test:e2e`, when it starts, then the seed has cleared the previous run's Book, so the Answer is again "Not in library" from the fixture source.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 28 findings — high 0, medium 3, low 20, false 4, maybe-false 1
- findings:
  - `[medium]` `[patch]` Blind: CI `retries: 2` cannot recover the stateful spec. The seed runs once per server, so a retry after a saved Book fails at "Not in library", and the trace records only that. Patched: `retries: 0` and `trace: 'retain-on-failure'`.
  - `[low]` `[reject]` Blind: the seed leaves authors and series from earlier runs, so "New author" differs between a fresh and a reused database. The spec asserts no "New …" note, and cleaning shared name rows adds deletes for no tested behaviour.
  - `[low]` `[patch]` Blind: the seed resets the password but not Payload's login lockout, so failed local sign-ins lock later runs. Patched: the seed unlocks the e2e user.
  - `[low]` `[reject]` Blind: the int and e2e lanes share `bookeh_test`, and a pushed database needs a manual reset. The AC fixes `bookeh_test`; README documents the migrate-first rule, and running both lanes at once is not a normal flow.
  - `[low]` `[patch]` Blind: "Check push stayed off" is skipped when e2e fails. Patched: `if: ${{ !cancelled() }}`.
  - `[low]` `[reject]` Blind: in fixture mode the allowlist admits the app's whole origin, not just `/data/fixture-cover/`. Fixture mode is dev-only, and the only cover URLs come from the fixture source itself. Narrowing it adds a guard against a case nobody meets.
  - `[low]` `[reject]` Blind: `finnaResults` logs fixture failures under Finna's label. The fixtures are committed and valid; a label parameter is extra surface for a case nobody meets.
  - `[low]` `[reject]` Blind: `fixtureOrigin` ignores `next dev -p` and an empty `PORT`, and an unknown `BOOKEH_SOURCES` makes the route answer 500, not 404. Playwright always sets `PORT`. An unknown value already stops the app when `sources/index` loads.
  - `[false]` `[reject]` Blind: the spec never checks Edit on the save toast. Edit arrives in Epic 4 (epic context, Toasts), so this story has no Edit.
  - `[false]` `[reject]` Blind: the cover route throws (500) in production. With `BOOKEH_SOURCES` unset, as in production, `usesFixtureSources` returns false and the route answers 404. It throws only for the refused `fixture` + production combination.
  - `[low]` `[reject]` Verification gap: the seed's cleanup branch never runs in CI (fresh database). Running e2e twice in CI doubles the lane's cost. A regression fails loudly on the next local run, and the branch was verified by two local runs.
  - `[medium]` `[patch]` Verification gap (other): retries cannot recover the spec. Same root as the first Blind row; same patch.
  - `[medium]` `[patch]` Edge: retries cannot recover the spec. Same root and patch as above.
  - `[maybe-false]` `[defer]` Edge: the first self-fetch of `/data/fixture-cover/` triggers a cold `next dev` compile, which could exceed the 5 s cover timeout on a slow CI runner. Locally the whole spec takes 13–17 s. To settle it, watch the first CI run's timing; a fix is to point `webServer.url` at the cover route so it compiles before the spec.
  - `[low]` `[reject]` Edge: `PORT` via `-p` or empty. Same root as the Blind `fixtureOrigin` row.
  - `[low]` `[reject]` Edge: fixture failures logged as Finna. Same as the Blind label row.
  - `[low]` `[reject]` Edge: `next dev` with `.next-e2e` rewrites the gitignored `next-env.d.ts` to point there. The file is generated and gitignored, and the next `next dev` or `next build` on `.next` rewrites it back. Typecheck passes either way, since both type dirs are included.
  - `[low]` `[reject]` Intent: the server side of "no network call" is not asserted, and `next/font/google` fetches during dev compilation. Fixture mode removes every real source, and covers come from the app. The font fetch is the compile step the spine already grants the build (spine :539), not the app's runtime.
  - `[low]` `[patch]` Intent: the e2e `next dev` sends Next telemetry, an outbound call during the run. Patched: `NEXT_TELEMETRY_DISABLED=1` in `webServer.env`.
  - `[low]` `[reject]` Intent: only the Finna fixtures are served, not the Google ones. The Google captures are by-id volumes, not search bodies (fixture README). One Finna-shaped source meets "serves the tests/fixtures responses" and needs no second parser path.
  - `[low]` `[reject]` Intent: the production refusal throws when the module loads, not at process start. `payload.config` → `covers.ts` → `lookup` → `sources/index` makes Payload's init fail on the first request, so the app does refuse. Refusing at start would need a new `instrumentation.ts`.
  - `[low]` `[reject]` Intent: the route's 404 is tested through `fixtureCover`, not the handler. The handler is a two-line mapping; functional minimum.
  - `[low]` `[reject]` Intent: server isolation is structural. `webServer.env` sets `DATABASE_URL`, the seed asserts `bookeh_test`, and CI checks push after e2e. Running beside a dev server was shown locally with :3000 in use.
  - `[low]` `[reject]` Intent: Desktop Chrome, not a phone emulation. The AC does not ask for touch, and the flow under test is the same markup.
  - `[low]` `[reject]` Intent: 3.45's deferrals (invalid ISBN, rate limit, progress line) and the full 3.51 walk are not covered. The story's AC defines the flow, and the spine limits Playwright to scan-to-save. The extra checks already added close 3.46, 3.47, 3.48 and part of 3.51.
  - `[low]` `[reject]` Intent: the seed deletes rows it did not create, against "never truncate". It deletes only the e2e ISBN's rows, and only on `bookeh_test` (asserted); without it the second run cannot answer from the source (Design Notes).
  - `[false]` `[reject]` Intent: the `finna.ts` refactor and the `coverPolicy` change contradict the spec's "Never" line. The spec's Always and Tasks ask for both. Finna's output is pinned by its 65 existing unit tests, which pass.
  - `[false]` `[reject]` Intent: sprint status is `done` while the spec is `in-review`. Finalization sets the spec to `done` and commits both together.

## Design Notes

**Why a dev server.** The AC refuses the fixture source under `NODE_ENV=production`, and both `next build` and `next start` run in production. So e2e runs `next dev`, which needs its own `distDir`: Next 16 locks `<distDir>/dev`. It also cannot apply `prodMigrations`, so the web server command runs `payload migrate` first; in CI that does nothing, because migrations are already applied.

**Locally.** The int lane pushes to `bookeh_test` by default. On a pushed database, `payload migrate` exits silently (dev row, no TTY) or fails with "already exists". README tells the reader to reset `bookeh_test`, then migrate, then run the int lane with `DATABASE_PUSH=false`, as the CI note already describes.

**Why seed deletes.** An ISBN with a shared Book answers as `existing` and never shows "From …". Tests never truncate, so the second run would fail. Deleting is safe only because the seed refuses any database except `bookeh_test`.

**Extra steps.** The In-library check and the Back walk close two earlier deferrals cheaply: 3.46 (the toast stays on Scan and is gone at the next Answer) and 3.51 (Back from Scan reaches the section).

**Network.** The browser check proves the browser side. On the server, fixture mode removes every real source, and covers come from the app itself. `next/font` fetches Open Sans while compiling (spine: the build needs network), not at runtime.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: 0 errors
- `npm run test:unit` -- expected: all pass (`scanScreen` flakes under parallel load; re-run it alone)
- `DATABASE_URL=postgres://bookeh:bookeh@localhost:5433/bookeh_test npm run payload -- migrate </dev/null`, then `DATABASE_PUSH=false npm run test:int` -- expected: all pass (Postgres on 5433)
- `npm run test:e2e` -- expected: 1 passed. Run it twice, the second time to prove re-runs.
- `psql` on 5433: `select count(*) from payload_migrations where batch = -1` in `bookeh_test` -- expected: 0

## Auto Run Result

**Summary:** Playwright now runs the primary flow in a browser:
- It signs in, opens Scan, types the ISBN and sees "Not in library" with "From fixture".
- It adds the book and sees "Saved to E2E shelf", taps Undo and sees "Undone", then saves again.
- It then checks the In-library Answer, that the save toast is gone at the next Answer, and that Back goes to Scan and then to `/`.
- No browser request leaves the app's origin.

The lane runs its own `next dev` on :3100 with build directory `.next-e2e`, on `bookeh_test`, with migrations applied and push off. `BOOKEH_SOURCES=fixture` replaces the real sources with a fixture source that serves the captured Finna responses; the app refuses that value under production. Covers come from a local route, which is on the cover allowlist only in fixture mode.

**Files changed:**
- `src/lib/metadata/sources/finna.ts`: the body checks plus parse-and-sort moved into the exported `finnaResults`; output unchanged.
- `src/lib/metadata/sources/fixture.ts` (new): `usesFixtureSources`, `fixtureOrigin`, the `fixture` source and `fixtureCover` (a generated JPEG).
- `src/lib/metadata/sources/index.ts`: picks the source list from `BOOKEH_SOURCES`.
- `src/lib/catalogue/covers.ts`: `allowsCoverUrl`, which admits the app's own origin only in fixture mode.
- `src/app/(frontend)/data/fixture-cover/[isbn13]/route.ts` (new): the local cover route; 404 when fixture mode is off.
- `next.config.ts`: `distDir` from `NEXT_DIST_DIR`.
- `tsconfig.json`, `.gitignore`, `eslint.config.mjs`: `.next-e2e` entries.
- `playwright.config.ts`: its own server, env, `baseURL`, no retries, trace kept on failure, telemetry off.
- `tests/e2e/account.ts`, `tests/e2e/seed.ts`, `tests/e2e/scanToSave.spec.ts` (new); `tests/e2e/.gitkeep` removed.
  - The seed refuses any database other than `bookeh_test`.
  - It upserts and unlocks the e2e user, sets the default location, and clears the previous run's Book.
- `tests/helpers/testDatabase.ts`: `assertTestDatabase`.
- `tests/unit/fixtureSource.unit.spec.ts` (new): source selection, the fixture source, the fixture cover, the allowlist and the database guard.
- `package.json`: `test:e2e` without `--pass-with-no-tests` and `tsx/esm`.
- `.github/workflows/ci.yml`: Chromium always installed; the push check runs after e2e, even when e2e fails.
- `.env.example`, `README.md`: `BOOKEH_SOURCES`, `NEXT_DIST_DIR`, and how to run e2e locally.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.52 `done`.

**Review findings:** 28 in total (medium 3, low 20, false 4, maybe-false 1).
- **Patched, 4 entries:**
  - CI retries could not recover the stateful spec (medium; Blind, Verification gap and Edge): `retries: 0`, `trace: 'retain-on-failure'`.
  - Login lockout survived the seed (low): the seed clears `loginAttempts` and `lockUntil`.
  - The push check was skipped after a failed e2e run (low): `if: ${{ !cancelled() }}`.
  - Next telemetry was sent from the e2e server (low): `NEXT_TELEMETRY_DISABLED=1`.
- **Deferred, 1:** the cold compile of the cover route might exceed the 5 s cover timeout on CI (medium, unverified).
- **Rejected:**
  - Leftover authors and series between runs: not asserted.
  - The shared `bookeh_test`: fixed by the AC, documented in README.
  - The allowlist admitting the whole origin in fixture mode: dev only, and only the fixture source makes cover URLs.
  - The Finna log label in fixture mode: committed fixtures are valid.
  - `PORT` from `-p` or empty, and 500 on an unknown `BOOKEH_SOURCES`: Playwright sets `PORT`, and an unknown value stops the app anyway.
  - Edit on the toast: arrives in Epic 4 (false).
  - A 500 from the route in production: unset means 404 (false).
  - The seed's cleanup not running in CI: doubling the lane's cost is not worth it; verified by two local runs.
  - `next-env.d.ts` rewritten: generated and gitignored.
  - The server-side font fetch: it happens at compile time, as the spine allows.
  - Finna fixtures only: the Google captures are by-id volumes.
  - The production refusal happening when the module loads: Payload init fails, so the app refuses.
  - The route's 404 tested through `fixtureCover`: functional minimum.
  - Server isolation being structural: env, seed guard and CI check cover it.
  - No phone emulation: not in the AC.
  - 3.45's deferrals: outside the story's AC and the spine's Playwright scope.
  - The seed deleting rows: only the e2e ISBN, only on `bookeh_test`.
  - The finna refactor against the spec's Never line: the spec asks for it (false).
  - Sprint status before review: aligned at commit (false).

**Follow-up review recommended:** false. Patched counts by verdict: high 0, medium 1, low 3.

**Verification** (Postgres on 5433):
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (36 warnings, all pre-existing in migrations).
- `npm run test:unit`: 635 passed. One run had a single failure under parallel load, the known `scanScreen` flake; it passed on re-run.
- `npm run test:int` on a migrated `bookeh_test` with `DATABASE_PUSH=false`: 373 passed, 1 failed.
  - The failure is `upsertUserBook` "leaves one row after two concurrent first writes": both writes succeed. It fails 3 of 3 runs alone.
  - This story changes nothing it uses, and the implementer reproduced it on baseline 486b3f6. So it is older than this story, not caused by it.
- `npm run test:e2e`: 1 passed in 13–17 s, four runs in total (two before the patches, two after). Later runs cleared the previous run's Book. Another node server was listening on :3000 throughout.
- `payload_migrations` rows with `batch = -1` in `bookeh_test`: 0.

**Residual risks:**
- **First CI run.** Nothing here has run in CI yet. Watch three things: the always-on Chromium install, `payload migrate` inside the web server command (a no-op there), and the cold compile of the cover route (deferred).
- **Locally.** The int lane must run with push off on a migration-built `bookeh_test` for e2e to work (README).
- **Older failure.** The `upsertUserBook` concurrent-write test fails on a freshly migrated `bookeh_test` here, independent of this story. If CI shows the same, the int step fails before e2e runs.
