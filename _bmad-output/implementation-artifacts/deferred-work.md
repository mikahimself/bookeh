# Deferred Work

- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Encode the patched Node version for host development (a `.nvmrc`/`.node-version` with 22.23.3 and a tighter `engines.node` than `>=20.9.0`).
  evidence: Host dev runs `npm run dev` on the host, whose Node is v22.16.0, older than both the old and new Dockerfile pins; nothing outside the Dockerfile states the minimum.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Pin the Compose `payload` service image (`node:22-alpine`, floating) to `node:22.23.3-alpine` and use `npm ci` instead of `npm install`, or remove the service if host dev is the only dev mode.
  evidence: `docker-compose.yml` names a second, drifting Node version, and `npm install` against the bind-mounted lockfile can rewrite `package-lock.json` from inside the container.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Stop `.npmrc` `legacy-peer-deps=true` from hiding peer mismatches between the exact-pinned `@payloadcms/*` packages (drop it, or have CI from Story 1.2 fail on `npm ls --all`).
  evidence: `@payloadcms/*` 3.90.2 peer on `payload: "3.90.2"` exactly; with the flag, a partial bump of one package installs silently.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Decide whether to keep `lexicalEditor()` and `@payloadcms/richtext-lexical` (no collection has a `richText` field); candidate for Story 1.5's clean-up.
  evidence: The 3.90.2 bump pulls `lexical`/`@lexical/*` from 0.41.0 to 0.50.0, a breaking 0.x jump carried for a dependency nothing uses.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-1-a1-bump-next-js-payload-and-node.md`
  summary: Account in Story 1.8 (`users` collection and its first migration) for Payload 3.90's new auth column `resetPasswordRequestedAt`, and note that its forgot-password rate limit applies only when email is enabled, so token-link resets (FR-5) get none from it.
  evidence: Regenerated `src/payload-types.ts` adds the field; Payload's `forgotPassword` only checks the interval when `!disableEmail && minRequestInterval > 0` (maybe-false for FR-5 until Story 1.8 checks how resets are issued).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-a2-github-repository-and-ci-workflow.md`
  summary: If the first CI runs show the admin e2e `beforeAll` timing out on the cold Turbopack compile of `/admin`, raise Playwright's test `timeout` under `CI` (or warm the route) instead of relying on `retries: 2`.
  evidence: Unverified (maybe-false, medium if true): the first `page.goto('/admin/login')` compiles the whole Payload admin inside the default 30 s test timeout on a shared runner; the first green or red run on `main` settles it.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-2-a2-github-repository-and-ci-workflow.md`
  summary: Single source for the Node version (`.nvmrc` with 22.23.3, `node-version-file` in setup-node, `engines.node` raised) instead of the hand-synced Dockerfile and `ci.yml` pins.
  evidence: Reviewer re-raised the 1.1 deferral: three places now name a Node floor (Dockerfile 22.23.3, ci.yml 22.23.3, `engines.node` >=20.9.0) and only a comment keeps them aligned.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-a3-postgres-with-finnish-icu-collation.md`
  summary: Run CI's Postgres from `docker-compose.yml` (a Compose-based job) instead of a hand-mirrored service container, so `POSTGRES_INITDB_ARGS` and the init script are exercised automatically; take it with Story 2.2's production Compose.
  evidence: Verification-gap reviewer: delete `POSTGRES_INITDB_ARGS` from `docker-compose.yml` or break `create-test-db.sql` and CI stays green, because CI never reads either file; only the comment in `ci.yml` keeps the two aligned.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-a3-postgres-with-finnish-icu-collation.md`
  summary: Rewrite `README.md` for bookeh; it is still the Payload template (MongoDB, Deploy button, cloud hosting) and now contradicts the new Database section directly above it.
  evidence: Pre-existing; `README.md` lines 26-35 tell the reader to set `MONGODB_URL` and the next heading describes Postgres with ICU.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-a3-postgres-with-finnish-icu-collation.md`
  summary: In Story 5.3 (text search), add an assertion on the ICU default that `'Ä' ilike 'ä'` is true and `'a' ilike 'ä'` is false, pinning the search half of NFR-7 against the image.
  evidence: Verified on the recreated dev database (2026-10-08): `select 'Ä' ilike 'ä', 'a' ilike 'ä', lower('ÄÖÅ')` gives `t|f|äöå`; no test records it yet.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-a3-postgres-with-finnish-icu-collation.md`
  summary: In Stories 2.2 and 2.3, state in `deploy/README.md` that the production cluster needs the same `POSTGRES_INITDB_ARGS` on its empty NAS data directory, and that a restore into a database created without them keeps the libc collation (`pg_dump` carries the locale only with `-C`).
  evidence: Blind reviewer; the init args apply only to an empty data directory, and the restore rehearsal (Story 4.10) would reintroduce the libc sort order silently.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-a4-test-harness.md`
  summary: Move Playwright e2e off the dev database (own server on `bookeh_test`, no `seedUser.ts` writes to `bookeh`).
  evidence: Story 1.4 covers Vitest only; Next 16 locks the dev build directory so a second `next dev` cannot run beside the dev server. Mika chose to defer to Story 3.52 (D15), which builds the Playwright setup with the fixture source.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-a4-test-harness.md`
  summary: Remove `@testing-library/react` (and the `react()` Vitest plugin) unless a component-test lane is planned.
  evidence: Blind reviewer; no spec has ever imported it (pre-existing from the Payload template), both Vitest projects run in `node`.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-4-a4-test-harness.md`
  summary: Decide how `bookeh_test` survives data-loss schema changes: a documented reset (`DROP DATABASE bookeh_test; CREATE DATABASE bookeh_test;`), `PAYLOAD_FORCE_DRIZZLE_PUSH=true` on the int run, or migrations instead of push (Story 1.9 territory).
  evidence: Edge-case reviewer; `@payloadcms/drizzle/dist/utilities/pushDevSchema.js:39-58` prompts on `hasDataLoss` and `process.exit(0)` without a TTY. Tests never delete rows, so the first column-dropping change (Story 1.8 reworks `users`) meets it. Pre-existing on the dev database too.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-5-a5-remove-the-old-collections-and-graphql.md`
  summary: Record in the Payload skill reference (or the spine's conventions) that Payload skips field-level `validate` for any field whose `admin.condition` is false, so status-dependent clearing belongs in a `beforeValidate` hook; the copies and wishlist entries of AD-6/AD-8 have such fields.
  evidence: Blind reviewer; the rule was documented only in the deleted `src/collections/Books.ts` hook comment (commit `7d34440` verified it by storing bad values), and nothing else in the repository states it.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-a6-layer-import-rules-and-strict-any.md`
  summary: Add a repeatable lint-rule test: a `RuleTester` unit spec for `bookeh/client-lib-imports` (no fixtures on disk needed) and, if wanted, an `ESLint` run over a `tests/fixtures/lint/` tree for the zones, which needs the zones parameterised by base path.
  evidence: Verification-gap reviewer: on the current tree `npm run lint` is green for a working and a dead config alike (a typo'd `serviceImports` key, a resolver change, a parser that stops exposing `directive`, or severities back to `warn`); the frozen intent chose one-off fixtures, so the proof lives only in the spec's notes.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-a6-layer-import-rules-and-strict-any.md`
  summary: In Story 1.11 (gateway), ban direct Payload access outside `lib/payload`: value imports from `payload`, `@payload-config`, `@/payload.config`, `@/collections/*` and `drizzle-orm` in `src/lib/**` and `src/app/(frontend)/**`, with the exceptions AD-3 (`catalogue`) and AD-7 (`shelf`) need, and the frontend importing `lib/metadata` directly.
  evidence: Blind and edge-case reviewers: the spine's diagram allows SVC → GW → PL and FE → SVC only, but Story 1.6's zones police `src/lib` ↔ `src/lib` and `src/app`; the epics AC enumerates lines 58-64 only, and the exception set depends on how the gateway grants system privileges.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-6-a6-layer-import-rules-and-strict-any.md`
  summary: Resolve the spine's own conflict with its one-way table before Story 9.2: AD-5 has `editBook()` in `lib/catalogue` writing personal tags through `changeTags()` in `lib/tags`, which `catalogue` may not import; check too whether AD-18's default-location resolution in `lib/copies` needs `lib/account` or only the context user.
  evidence: Blind reviewer, verified in ARCHITECTURE-SPINE.md lines 60, 116, 247-251; the zones now enforce the table at `error`, so the first story implementing either path hits a lint wall.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-7-a7-role-helpers-and-asrequestuser.md`
  summary: Lint-ban `overrideAccess: true` (and unscoped Local API calls) outside the AD-3 allowlist (`src/lib/catalogue`, `src/lib/shelf`, the `onInit` seed).
  evidence: AD-3 says hooks and access functions query only through `asRequestUser(req)` and system privileges are an allowlist, but only review enforces it; Story 1.7's AC covers the helper, not the ban. Natural home is the gateway story (1.11) or the first allowlisted module.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-a8-users-collection.md`
  summary: In Story 1.10, close the `/admin/create-first-user` and `POST /api/users/first-register` path, or make the first user admin, so the first account cannot come out as a `user` locked out of `/admin` and no tailnet client can claim an empty instance.
  evidence: `@payloadcms/next/dist/views/CreateFirstUser/index.js:48-52` renders every field with `roles` pre-filled `['user']`; `registerFirstUser` creates with `overrideAccess: true`; the dev `bookeh` database has 0 users since 2026-10-09.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-a8-users-collection.md`
  summary: Decide which fields a user may change on their own `users` document (email, password) and whether the current password is required, with FR-6 and the profile service (Story 1.22).
  evidence: `adminOrSelf` update lets a signed-in user change their own `email` and `password` over REST with no current-password check; before 1.8 any user could change any user.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-a8-users-collection.md`
  summary: Guard dev data against schema pushes from a running `next dev`: a README warning or a pre-change step for schema stories, or `push: false` with migrations on dev.
  evidence: In Story 1.8 the pre-existing port-3000 `next dev` hot-reloaded `Users.ts`, its data-loss prompt was accepted, and `bookeh.users` was truncated, losing the owner's dev account.
