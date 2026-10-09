---
title: 'Story 1.10 [A9] First-user seed'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '5e67a23a9031d03ba390917ea8c2cf48bd7f8907'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      A failed first Payload init leaves the getPayload cache entry, so later inits skip onInit and the instance serves with 0 users and no seed until a restart.
    evidence: |-
      node_modules/payload/dist/index.js:560-565 sets disableOnInit when the cache entry exists; :632-635 clears only cached.promise on failure. Triggers: a bad SEED_* value (create throws) or the database being unreachable on the first request of an empty instance. A fix seeds outside onInit (e.g. an eager getPayload in instrumentation.ts), which needs an intent change; natural home is Story 2.2 (production start).
    location: >-
      src/payload.config.ts (onInit)
    severity: medium
  - summary: >-
      Check whether next build initialises Payload (and so runs the seed) against a reachable database.
    evidence: |-
      Unverified. Settle in Story 2.1 (K2): does any build-time page call getPayload, and does the build get a DATABASE_URL? If both, the seed could create the admin in whatever database the build reaches.
    location: >-
      src/lib/account/seedFirstUser.ts
    severity: medium (unverified)
  - summary: >-
      Close /admin/create-first-user and POST /api/users/first-register (carried from the 1.8 deferral that targeted 1.10).
    evidence: |-
      1.10 narrows the window but does not close it: with SEED_EMAIL and SEED_PASSWORD set, users is never empty after the first init, so the path is open only while the seed warns (a variable missing on an empty instance). Closing it needs a create guard on users that tells the seed from registerFirstUser; both run without req.user and with overrideAccess true.
    location: >-
      src/collections/Users.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** A fresh instance has no account, and the dev database `bookeh` has had 0 users since Story 1.8 truncated it. The only way in is Payload's `/admin/create-first-user`, which pre-fills `roles: ['user']` and so produces an account locked out of `/admin`. The owner needs an account created on first start, without touching the database.

**Approach:** Payload's `onInit` runs `seedFirstUser(payload)`. When `users` is empty and `SEED_EMAIL` and `SEED_PASSWORD` are both set, it creates one user with roles `admin` and `user`, `displayName` = the email's local part, and `language: 'en'`. Otherwise it creates nothing, and it warns through `payload.logger` when the table is empty but a variable is missing. Both variables go in `.env.example`.

## Boundaries & Constraints

**Always:** The seed is one of the three AD-3 system-privilege places. It uses the Local API with its default `overrideAccess` (there is no user yet) and no other privileged path. It logs only through `payload.logger`, never `console`, and never logs the password. It counts users before it reads the variables, so an instance that has users never warns. An empty-string variable counts as missing. Tests never delete or truncate rows.

**Never:** No change to `Users.ts` or the schema, and no migration. No closing of `/admin/create-first-user` or `POST /api/users/first-register` (see Design Notes). No `lib/payload` context or gateway (1.11), no `lib/account` profile functions (1.22), no invite flow (FR-2), no production `prodMigrations` (Epic 2). The seed does not update an existing user, and it does not re-seed when the seed account is later deleted while others remain.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First start | 0 users; `SEED_EMAIL=mika.laihanen@gmail.com`, `SEED_PASSWORD` set | one user: that email, `roles: ['admin','user']`, `displayName: 'mika.laihanen'`, `language: 'en'`; info log naming the email | N/A |
| Already seeded | ≥1 user; variables set or not | nothing created, nothing logged | N/A |
| Email missing | 0 users; `SEED_EMAIL` unset or `''` | nothing created; `payload.logger.warn` names the missing variable(s) | no throw |
| Password missing | 0 users; `SEED_PASSWORD` unset or `''` | as above | no throw |
| Invalid email | 0 users; `SEED_EMAIL=not-an-email` | Payload rejects the create | `ValidationError` propagates; Payload logs it and init fails |

</intent-contract>

## Code Map

- `src/payload.config.ts` -- `buildConfig({...})`; add `onInit: seedFirstUser`. Payload calls `config.onInit(payload)` once per instance at the end of `init` (`node_modules/payload/dist/index.js:447-458`), and logs and rethrows on error. `getPayload` skips it for an already-cached instance (`:560-565`).
- `src/lib/account/seedFirstUser.ts` -- new. `seedFirstUser(payload: Payload, env: NodeJS.ProcessEnv = process.env): Promise<void>`. It uses `payload.count`, `payload.create` and `payload.logger`. It type-imports `Payload` only. `lib/account` may import from `src/lib` only `payload` and `undo` (`eslint.config.mjs` `serviceImports`), and this file needs neither.
- `src/collections/Users.ts` -- read-only. `roles` (`hasMany` select `admin`/`user`, field access admin-only: the Local API's default `overrideAccess: true` bypasses it), `displayName` (required), `language` (`en`/`fi`).
- `eslint.config.mjs` -- read-only. `no-restricted-syntax` bans `.roles` member reads in `src/**`. A `roles: [...]` object-literal key is allowed.
- `.env.example` -- add `SEED_EMAIL=` and `SEED_PASSWORD=` with a comment.
- `vitest.setup.ts` -- loads `.env` via `dotenv/config` for the int lane. Delete `SEED_EMAIL`/`SEED_PASSWORD` there, so a freshly reset `bookeh_test` never gets the owner's real credentials from the owner's `.env`.
- `tests/unit/access.unit.spec.ts` -- style reference for unit specs (Vitest, `@/` imports, no DB).
- `tests/int/config.int.spec.ts`, `tests/helpers/harness.ts` -- int style. `getPayload({ config })` and `createUser()` guarantee that `bookeh_test` has users.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/account/seedFirstUser.ts` -- implement per the I/O Matrix. The local part is everything before the last `@`. A one-line doc comment cites AD-3.
- [x] `src/payload.config.ts` -- `onInit: seedFirstUser`.
- [x] `.env.example` -- the two variables, with a comment: used only when `users` is empty, and safe to leave set.
- [x] `vitest.setup.ts` -- `delete process.env.SEED_EMAIL` / `SEED_PASSWORD`, with a comment.
- [x] `tests/unit/seedFirstUser.unit.spec.ts` -- every I/O Matrix row (Invalid email: the fake `create` rejects with a `ValidationError` and `seedFirstUser` rejects with it), against a typed fake of `count`/`create`/`logger.warn`/`logger.info` (cast through `unknown`, no `any`). Assert the exact `create` arguments, that `overrideAccess: false` is not passed, and that the password never appears in a log call.
- [x] `tests/int/seedFirstUser.int.spec.ts` -- on `bookeh_test` (has users): with `vi.stubEnv` setting a fresh unique `SEED_EMAIL` and a password, `payload.config.onInit` is `seedFirstUser`, and calling it creates nothing (no user with that email).

**Acceptance Criteria:**
- Given an empty Postgres database with the schema pushed, `SEED_EMAIL`/`SEED_PASSWORD` set, when Payload initialises from `@/payload.config`, then `users` holds exactly one row with that email, both roles, the local part as display name, and `en`. When Payload initialises again, there is still one row.
- Given the same empty database with `SEED_PASSWORD` unset, when Payload initialises, then a warning is logged and `users` stays empty.
- Given the repository, when lint, typecheck, unit and int run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 17 findings — high 0, medium 3, low 13, false 0, maybe-false 1
- findings:
  - `[medium]` `[defer]` A failed first Payload init (seed throws, or DB unreachable on the first request) leaves the `getPayload` cache entry. Later calls run with `disableOnInit: true`, so the seed never runs and the instance serves with 0 users until a restart (edge-case) — confirmed at `node_modules/payload/dist/index.js:560-565` and `:632-635` (`cached.promise = null`, but the cache entry survives). This is inherent in the intent's `onInit` mechanism; a fix means seeding outside `onInit` (e.g. an eager init in `instrumentation.ts`), which the intent does not allow. Deferred.
  - `[maybe-false]` `[defer]` The seed may run during `next build` if a build-time page initialises Payload against a reachable database (edge-case) — the build has no DB today. Settled by Story 2.1 (K2): check whether `next build` calls `getPayload` and has a `DATABASE_URL`. If true, medium. Deferred.
  - `[low]` `[reject]` Whitespace-only or padded `SEED_*` values create a blank-password admin or fail on a padded email (edge-case) — needs a mis-typed `.env`; trimming a password changes its meaning, so the fix is not a direct correction.
  - `[medium]` `[defer]` The spec's "invalid email fails start" holds only for the first request; later requests succeed with 0 users (edge-case, claim) — same root cause as the first row, deferred with it; corrected in Auto Run Result.
  - `[low]` `[patch]` Nothing asserts that `vitest.setup.ts` removed `SEED_EMAIL`/`SEED_PASSWORD` in the int lane (verification-gap; filed `defer`) — the fix is one assertion; added `toBeUndefined()` checks before any `stubEnv`.
  - `[low]` `[reject]` The seed runs at the first `getPayload()` (first request), not at process boot (intent-alignment R2) — sign-in itself triggers init, so the account exists before the login is handled; only the log timing differs.
  - `[low]` `[reject]` The empty-table create path has no automated test against real Payload (intent-alignment) — same as the blind finding below; see there.
  - `[low]` `[reject]` Nothing logs in as the seeded user (intent-alignment R3) — `users.int.spec.ts` already proves that a Local API create with `['admin','user']` and no user enters `/admin`; the scratch-DB check confirmed the stored roles.
  - `[low]` `[reject]` The seed takes `Payload`, not an AD-16 context (intent-alignment R4) — `lib/payload` does not exist until 1.11, and the AD-16 sentence is about owned rows (no `owner`/`createdBy` as data); a `users` row has no owner.
  - `[medium]` `[patch]` `.env.example` calls the variables "safe to leave set". Left set, the seed recreates an admin on an emptied production database, which defeats the backup's no-users guard (blind) — patched: the comment now says to clear both once the first account exists, and why.
  - `[low]` `[patch]` Left set, the variables keep a valid admin password in the environment (blind) — same root cause and patch as above.
  - `[low]` `[reject]` No automated test runs the success path on real Payload; only the manual scratch-DB step does (blind) — the parts are covered: the unit spec pins the exact `create` arguments and no `overrideAccess`, and `users.int.spec.ts` creates admins the same way. A throwaway DB in the int lane is new infrastructure for a branch that runs once per instance.
  - `[low]` `[patch]` The int "creates nothing" test passes even without the `vitest.setup.ts` guard (blind) — same as the verification-gap row; same patch.
  - `[low]` `[defer]` `deferred-work.md` still targets 1.10 for closing `/admin/create-first-user` (blind) — recorded as a frontmatter `deferred` item with the narrowing (the window is open only while the seed warns).
  - `[low]` `[reject]` README does not explain the first-account setup (blind) — `.env.example` documents it, and the template README is already deferred for a full rewrite (1.3); a concurrent story is editing README.
  - `[low]` `[patch]` The unit fixture uses the owner's real Gmail address (blind) — replaced with `first.user@test.invalid`.
  - `[low]` `[patch]` The info log repeats the roles as a literal "(admin, user)" (blind) — the log is now built from the same roles value passed to `create`.

## Design Notes

- **Placement:** the spine puts F1 Accounts in `lib/account`, and AD-3 names "the first-user seed in `onInit`" as an allowlisted place. Keeping the function out of `payload.config.ts` makes it unit-testable and gives the future `overrideAccess` lint ban (deferred from 1.7) one file to allow.
- **`env` parameter:** it defaults to `process.env`, so Payload's `onInit(payload)` call works unchanged and unit tests pass plain objects.
- **No race guard:** one Node process owns the Payload instance in dev (`getPayload` caches it) and in production (one container). If two processes did both seed, the unique email makes the second `create` fail loudly, which is acceptable.
- **Invalid email fails start:** a misconfigured seed on an empty instance should be loud, not silently run unclaimed.
- **`create-first-user` stays open:** the 1.8 deferral asked 1.10 to close it "or make the first user admin". This story's AC does neither. With the variables set (dev from now on, and production per the spine's Deployment seed), `users` is never empty after start, so the window exists only when the seed warns. Closing it fully needs a create guard on `users` that tells the seed from `registerFirstUser` (both run without `req.user` and with `overrideAccess: true`). That is a separate decision, so it stays in deferred work with this narrowing recorded.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm run test:unit && npm run test:int` -- expected: green, both new specs included.
- Scratch DB (dropped afterwards): `createdb bookeh_seedcheck` on the Compose Postgres. Run a `tsx` script from the scratchpad that calls `getPayload({ config })` with `DATABASE_URL=…/bookeh_seedcheck`, `SEED_EMAIL=seed.check@test.invalid`, `SEED_PASSWORD=seed-check` (Payload requires at least 3 characters), then query `users` and `users_roles`. Run it twice. Expected: one row, `display_name = 'seed.check'`, `language = 'en'`, roles `admin` and `user`; the second run creates nothing. Recreate the database and run once without `SEED_PASSWORD`. Expected: the warning in the log, 0 rows.

## Auto Run Result

Status: done

**Summary:** Payload's `onInit` runs `seedFirstUser`. On an empty `users` table with `SEED_EMAIL` and `SEED_PASSWORD` set, it creates one user with roles `admin` and `user`, the email's local part as `displayName`, and `language: 'en'`. With users present it does nothing, silently. On an empty table with a variable missing or empty, it warns through `payload.logger` and creates nothing.

**Files changed:**
- `src/lib/account/seedFirstUser.ts` -- new; the seed (AD-3 system-privilege place).
- `src/payload.config.ts` -- `onInit: seedFirstUser`.
- `.env.example` -- `SEED_EMAIL` and `SEED_PASSWORD`, with advice to clear them once the first account exists.
- `vitest.setup.ts` -- removes both variables from the int lane so `bookeh_test` never gets the owner's credentials.
- `tests/unit/seedFirstUser.unit.spec.ts` -- new; 11 tests over every I/O Matrix row against a typed fake.
- `tests/int/seedFirstUser.int.spec.ts` -- new; `onInit` wiring, the lane has no `SEED_*`, and nothing is created when users exist.

**Review findings (17):** 6 patched (1 medium, 5 low, grouped into 4 fixes): the `.env.example` advice (also covers the plaintext-password finding); the int assertion that `SEED_*` are absent (blind and verification-gap); the fixture email changed to `@test.invalid`; the log built from the same roles value. 4 deferred (frontmatter `deferred`): the onInit-skipped-after-failed-init limitation (2 rows), the `next build` question (maybe-false), and the `create-first-user` closure re-targeted. 7 rejected, each with its reason in the triage log: whitespace values, lazy-init log timing, no real-Payload empty-table test (2 rows), no sign-in test, AD-16 context, README.

**Correction to Design Notes:** "Invalid email fails start" holds only for the first `getPayload()`. Payload keeps the failed cache entry and later inits skip `onInit`, so after one failed request the app serves with 0 users until a restart. Deferred (medium).

**Follow-up review recommended:** false. Patched: high 0, medium 1, low 5.

**Verification:**
- `npm run lint`: 0 errors (7 pre-existing warnings).
- `npm run typecheck`: clean.
- unit: 89 passed.
- int: 22 passed, plus 1 skipped. The skipped one is `migrationSchema.int.spec.ts`, from the concurrent Story 1.9 work, not this story.
- Scratch DB `bookeh_seedcheck`, run before and after the patches and dropped afterwards. The first start seeded one user (`seed.check`, `en`, `{admin,user}`) and logged it; the second start added nothing. A fresh DB without `SEED_PASSWORD` logged the warning and kept 0 rows.

**Residual risks:**
- The dev database `bookeh` has 0 users. The owner gets an account by setting `SEED_EMAIL` and `SEED_PASSWORD` in `.env` and restarting `next dev`. The seed runs on the first request that initialises Payload.
- `SEED_PASSWORD` needs at least 3 characters (Payload's minimum), or the first init fails as described above.
- The working tree also holds the uncommitted Story 1.9 work of a concurrent session. The changes to `.env.example` and `src/payload.config.ts` from 1.9 and 1.10 were split by hand, and only the 1.10 hunks are committed here.
