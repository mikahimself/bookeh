---
title: 'Story 1.4 [A4] Test harness'
type: 'chore'
created: '2026-10-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 1
context: []
baseline_commit: '615651456e82932478cead28309d7f117e991643'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Integration tests run against `DATABASE_URL`, the dev database `bookeh`, and there is no way to create users or act as one, so no collection or service story can ship the two-user test the spine requires. There is also no `*.unit.spec.ts` lane for pure functions.

**Approach:** Split Vitest into `unit` (no database) and `int` projects. The `int` project rewrites `DATABASE_URL` to the `bookeh_test` database on the same server before Payload loads, and refuses to run otherwise. `tests/helpers/harness.ts` exports `createUser()` (unique email, never cleaned up) and `as(user)`, which returns `{ req, user, overrideAccess: false }` with a Payload request carrying that user, so spreading it into a Local API call enforces access. A sample int test creates two users and asserts distinct ids and that it runs on `bookeh_test`.

**Decision (2026-10-08):** Playwright e2e is out of scope. It keeps running against the dev server and the dev database until Story 3.52 (D15) builds the Playwright setup with the fixture source; logged in `deferred-work.md`. The spec stays whole (one goal).

**Decision (2026-10-08, review loop 1):** `as(user)` returns `overrideAccess: false` as well. Payload's Local API bypasses access by default even with a `req` carrying a user, so a two-user test that spreads `as(a)` must enforce access without remembering the flag. No negative test is possible until Story 1.8 adds access rules to `users`; that story's access test proves it.

## Boundaries & Constraints

**Always:** Tests create their own rows with unique values and never truncate or delete other rows. The test URL is derived from `DATABASE_URL` (same host and credentials, database `bookeh_test`); no new environment variable. `unit` specs import nothing that opens a database.

**Never:** No `Context` type, `requireUser` or gateway in `src/lib/payload` (Story 1.11 owns them; it retypes `as()` to its `Context`). No `users` field changes (Story 1.8). No migrations or push-off CI run (Story 1.9). No `pg` or `drizzle-orm` dependency.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Dev URL | `postgres://bookeh:bookeh@localhost:5432/bookeh` | `postgres://bookeh:bookeh@localhost:5432/bookeh_test` | N/A |
| Query string kept | `…/bookeh?sslmode=disable` | `…/bookeh_test?sslmode=disable` | N/A |
| Missing URL | `DATABASE_URL` unset or empty | int run does not start | Throws naming `DATABASE_URL` |
| Two users | `createUser()` twice | Two users, distinct ids and emails | N/A |
| Re-run | Users from earlier runs exist | New unique emails; no unique-violation | N/A |

</frozen-after-approval>

## Code Map

- `/private/tmp/claude-501/-Users-mika-development-bookeh/19484998-363a-460b-8c81-bbc509c891d3/scratchpad/impl-1-4-loop0.patch` -- the reviewed first implementation (`git apply`). Start from it and apply the four changes marked **loop 1** below.
- `vitest.config.mts` -- single project, `jsdom`, include `tests/int/**/*.int.spec.ts`, `fileParallelism: false` (each file's `getPayload()` pushes the schema; parallel pushes race on enum creation, reproduced in 1.3). Becomes two inline `projects` with `extends: true` (keeps `tsconfigPaths`, `react`). `int`: environment `node`, setup files, `fileParallelism: false` kept (comment updated: harness does not change the push race). `unit`: environment `node`, no setup file, **loop 1:** `env: { DATABASE_URL: 'postgres://unit-tests-have-no-database.invalid/none' }`, so a unit spec that loads Payload fails loudly instead of inheriting CI's job-wide `bookeh` URL.
- `vitest.setup.ts` -- only `import 'dotenv/config'`. Becomes the `int` setup: load dotenv, then set `process.env.DATABASE_URL` via `testDatabaseUrl()`. Runs before test files import `@/payload.config`, which reads `DATABASE_URL` at module load (`src/payload.config.ts`).
- `tests/helpers/testDatabase.ts` -- new, pure: `testDatabaseUrl(url: string | undefined): string` per the matrix. Unit-tested; this is the first `*.unit.spec.ts`.
- `tests/helpers/harness.ts` -- new. `createUser(data?)`: `payload.create({ collection: 'users', data: { email: \`user-${randomUUID()}@test.invalid\`, password, ...data } })` (Local API default access is fine for fixtures). `as(user)`: `createLocalReq({ user: { ...user, collection: 'users' } }, payload)` from `payload`; **loop 1:** returns `{ req, user, overrideAccess: false as const }`. Payload from `getPayload({ config })` (cached per process). `as` is a legal identifier in TS/JS.
- `src/collections/Users.ts` -- `auth: true`, no fields; `User` type in `src/payload-types.ts`. Do not change.
- `tests/int/collation.int.spec.ts` -- queries `datname in (current_database(), 'bookeh_test')` and expects 2 rows; under the harness both are `bookeh_test`, so it returns 1. **loop 1:** change to `where datname in ('bookeh', 'bookeh_test', 'template1')`, expect 3 rows, each `i`/`fi-FI` (a developer's scratch libc database must not fail it).
- `tests/int/api.int.spec.ts` -- template test; leave it (Story 1.5 decides on old tests).
- `package.json` -- `test:int` runs `vitest run --project int`; add `test:unit` (`--project unit`); `test` runs unit, int, e2e. **loop 1:** remove `jsdom` from devDependencies (both projects run in `node`; `npm install` to update the lockfile).
- `.github/workflows/ci.yml` -- `bookeh_test` already created; add `npm run test:unit` before `test:int`.
- `README.md` -- database section (from 1.3) says tests still use `bookeh`; correct it.

## Tasks & Acceptance

**Execution:**
- [x] `tests/helpers/testDatabase.ts` + `tests/unit/testDatabase.unit.spec.ts` -- pure URL rewrite and its matrix cases -- the guard that keeps tests off the dev DB.
- [x] `vitest.setup.ts`, `vitest.config.mts` -- `unit`/`int` projects; int setup rewrites `DATABASE_URL`; unit gets the unreachable URL -- int runs on `bookeh_test`, unit without a DB.
- [x] `tests/helpers/harness.ts` -- `createUser()`, `as(user)` with `overrideAccess: false` -- the two-user building blocks.
- [x] `tests/int/harness.int.spec.ts` -- `current_database()` is `bookeh_test`; two users, distinct ids; `as(user).req.user.id` equals the user's id and `overrideAccess` is `false`.
- [x] `tests/int/collation.int.spec.ts` -- the three named databases as above.
- [x] `package.json` (+ lockfile), `.github/workflows/ci.yml`, `README.md` -- scripts, drop `jsdom`, CI step, one corrected README sentence.

**Acceptance Criteria:**
- Given the dev database `bookeh`, when `npm run test:int` runs, then no row is written to `bookeh` and every int file connects to `bookeh_test`.
- Given `npm run test:unit` with Postgres stopped, when it runs, then it passes.
- Given the harness, when a test calls `createUser()` twice and `as()` on each, then it gets two users with distinct ids and requests carrying each user, with `overrideAccess: false`.
- Given a unit spec that loads `@/payload.config` and calls `getPayload()`, when `npm run test:unit` runs with Postgres up, then it fails (unreachable host), never touching `bookeh`.

## Implementation Notes

- Loop 1 (2026-10-08): applied `impl-1-4-loop0.patch` and the four loop-1 changes (`as()` returns `overrideAccess: false as const`; unit project `env.DATABASE_URL` set to the `.invalid` host; collation test names `bookeh`, `bookeh_test`, `template1` and expects 3 rows; `jsdom` removed via `npm uninstall`, lockfile updated). `harness.int.spec.ts` also asserts `overrideAccess` is `false`.
- Verified: `npm run typecheck` and `npm run lint` exit 0 (3 pre-existing warnings in e2e specs). `test:unit` 4 passed; `test:int` 5 passed in 3 files on `bookeh_test` (`bookeh.users` count 0 before and after; `bookeh_test.users` 6 -> 8). A throwaway `tests/unit/*.unit.spec.ts` calling `getPayload()` with CI-like `PAYLOAD_SECRET` and `DATABASE_URL=.../bookeh` in the shell failed with `getaddrinfo ENOTFOUND unit-tests-have-no-database.invalid` and wrote nothing to `bookeh`; without `PAYLOAD_SECRET` it fails earlier on the missing secret. `test:unit` with Postgres stopped was not run (the dev Postgres was left up); the lane imports only the pure helper.
- Review fixes (2026-10-08): unit spec pins the unit project's `.invalid` `DATABASE_URL` host; `as()` builds one `collection`-tagged actor (`TypedUser`), passes it to `createLocalReq` and returns it as `user`, so the spread's `user` option and `req.user` agree; `harness.int.spec.ts` spreads `as(a)` into `payload.findByID` and asserts `req.user.collection`; collation test asserts the exact `datname` list; README gains a Tests paragraph (unit/int/e2e lanes) and a `bookeh_test` reset note beside the reindex block. Re-ran `tsc --noEmit`, eslint and prettier on the touched files, `test:unit` (5 passed) and the harness + collation int specs (4 passed).

## Spec Change Log

- Loop 1 (2026-10-08). Trigger: `as(user)` spread into Local API calls bypasses access (intent gap, answered A); unit lane inherits CI's `bookeh` URL; collation test over every database; unused `jsdom`. Amended: Intent decision, Code Map **loop 1** marks, tasks, ACs. Known-bad state avoided: an access test that passes whatever the rules say; a unit spec writing to `bookeh` in CI. KEEP: the `testDatabaseUrl` guard and its unit matrix, the two-project `extends: true` config, `fileParallelism: false` on int, `createLocalReq` for `as()`, unique `@test.invalid` emails, the saved loop-0 patch as the starting point.

## Review Triage Log

- `as(user)` spreads into Local API calls with `overrideAccess` defaulting to `true` (blind) -- medium, real: `payload/dist/collections/operations/local/find.js:5` defaults `overrideAccess = true` even with `req`/`user`; Story 1.8's two-user access test (before the 1.11 gateway) would pass whatever the access rules say. Fix changes the frozen return shape `{ req, user }`. Route: intent_gap.
- Unit lane inherits CI's `DATABASE_URL` naming `bookeh` (verification-gap, blind) -- medium, real: `ci.yml` sets it job-wide and the `unit` project has no rewrite, so a unit spec that loads `@/payload.config` would push and write to `bookeh` in CI and pass. Route: patch (unit project `env.DATABASE_URL` set to an unreachable `.invalid` URL; empty would make `pg` fall back to localhost defaults).
- Collation test asserts every `pg_database` row (blind, edge-case) -- low, real: a developer's scratch libc database fails an unrelated test, and `bookeh` is no longer named. Route: patch (`where datname in ('bookeh', 'bookeh_test', 'template1')`, expect 3 rows).
- `jsdom` unused after both projects moved to `node` (blind) -- low, real, caused here. Route: patch (remove from devDependencies).
- `@testing-library/react` unused (blind) -- low, real, pre-existing (no spec ever imported it). Route: defer.
- Accumulated `bookeh_test` rows make a later data-loss schema push prompt and `process.exit(0)` in the non-TTY worker (edge-case) -- medium, real: `@payloadcms/drizzle/dist/utilities/pushDevSchema.js:39-58`; pre-existing on the dev database, which int tests pushed to before this change; Story 1.8's new `users` columns meet it first. Route: defer.
- `socket:` URL keeps `?db=bookeh` after the rewrite (blind, edge-case) -- low, real but unlikely: `pg-connection-string` reads the database from `db` only for `socket:`; for `postgres://` it reads the path after query params (`index.js:40-67`), so `?database=` cannot bypass the rewrite. Nobody here uses the socket form; the fix is a new guard. Rejected.
- Non-WHATWG `pg` URL forms throw a bare `Invalid URL` (edge-case) -- low: fails loudly before any connection. Rejected.
- No run-wide `bookeh_test` precondition; only `harness.int.spec.ts` asserts it, and it runs last (blind, edge-case, claim) -- low: for every `postgres://` URL the rewrite fixes the database by construction (see the socket row), unset/empty throws, invalid throws; the only escape is the rejected socket form. Rejected.
- No idempotence test for re-running the setup on a `bookeh_test` URL (blind) -- false: `testDatabaseUrl` sets the path unconditionally, so a second run yields the same URL.
- `createUser` accepts `hash`, `salt` etc.; `email: undefined` overrides the generated email (blind, edge-case) -- low: the bad call fails loudly in validation, and no caller passes those fields. Rejected.
- `{ ...user, collection: 'users' }` redundant in `as()` (blind) -- false, with a corrected reason (loop 1): the generated `User` does declare `collection: 'users'` (`src/payload-types.ts:286`), but the runtime doc from `payload.create` lacks it (only `login` adds it), so the spread patches a type that lies.
- Harness does not export its Payload getter, so int files repeat `getPayload({ config })` (blind) -- low, rejected: two-line Payload idiom; exporting adds surface with no named harm.

Loop 1:
- Unit lane's `.invalid` URL guard pinned by no test (verification-gap, blind) -- medium, real: dropping the `env` line keeps both lanes green; reviewer confirmed project `test.env` reaches `process.env` in the worker. Route: patch (one assertion in the unit spec).
- `as()` spread into a Local API call passes the `collection`-less runtime `user`, which wins over `req.user` in `createLocalReq.js:91`, so Payload back-fills `collection` from `admin.user` (`:94-98`, slated to throw in 4.0); and no test spreads `as()` into a call at all (blind, edge-case) -- medium, real. Route: patch (return the `collection`-carrying user; spread `as(a)` into `findByID` in the harness test).
- README's test sentence covers `test:int` only; `npm test` still writes to `bookeh` via e2e, and the unit lane and its convention are documented nowhere (blind) -- low, real, direct correction. Route: patch (one short Tests paragraph).
- No README breadcrumb for the `bookeh_test` reset before a data-loss push (blind) -- low, real: the silent `process.exit(0)` is already deferred, the reset line is a direct addition. Route: patch (one line next to the REINDEX block; the mechanism stays deferred).
- `toHaveLength(3)` hides which database is missing (blind) -- low, real, direct correction. Route: patch (`toEqual` on the names).
- `false as const` redundant under the annotated return type (blind) -- low, cosmetic. Route: patch (folded into the harness change).
- Non-URL `DATABASE_URL` throws a bare `Invalid URL` (edge-case) -- carried: low, fails loudly before any connection. Rejected.
- Refuse non-local hostnames (edge-case) -- low, rejected: `DATABASE_URL` names the dev server by Compose and CI; a hostname allowlist is a new guard for a situation never shown reachable.
- Dev database not named `bookeh` fails the collation test (edge-case) -- low, rejected: the name is fixed by Compose and CI (`POSTGRES_DB: bookeh`), and the matrix names it.
- Misnamed spec under `tests/unit` or `tests/int` never runs (edge-case) -- low, pre-existing (the int glob was already suffix-bound), rejected.
- `createUser({ email: undefined })` overrides the default (edge-case) -- carried: low, rejected.

## Verification

**Commands:**
- `npm run test:unit` -- expected: green with Postgres up or stopped (the lane has no reachable database either way).
- `npm run test:int` -- expected: harness, collation and API tests green.
- `docker compose exec postgres psql -U bookeh -d bookeh -Atc "select count(*) from users"` before and after `test:int` -- expected: unchanged.
- `npm run lint` and `npm run typecheck` -- expected: exit 0.
