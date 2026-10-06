---
title: 'Story 1.1 [A1] Bump Next.js, Payload and Node'
type: 'chore'
created: '2026-10-06'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The scaffold runs Next.js 16.3.3, Payload 3.88.0 and Node 22.17.0. The spine pins Next.js 16.3.8, Payload 3.90.2 and `node:22.23.3-alpine` for their security fixes, and the bump must land before the first migration.

**Approach:** Pin Next.js 16.3.8 and `payload`, `@payloadcms/next`, `@payloadcms/db-postgres`, `@payloadcms/ui` at 3.90.2 in `package.json`, and switch the Dockerfile base to `node:22.23.3-alpine`. Regenerate the lockfile and the Payload import map in the same commit. Then confirm that the dev server starts, `/admin` loads, and lint and the existing tests pass. The peer check is done: Payload 3.90.2's `next` range is `>=16.3.3 <17.0.0`, so 16.3.8 is in range.

</frozen-after-approval>

## Implementation Notes

- Package manager is npm (`package-lock.json`, spine: "`npm run dev` on the host"). The AC's `pnpm dev` means the dev server; verify with `npm run dev`. Fixing `pnpm` in `playwright.config.ts` belongs to Story 1.2 (A2); for e2e here, start `npm run dev` first so `reuseExistingServer` picks it up.
- Also bump `@payloadcms/richtext-lexical` to 3.90.2 (its peers require `payload`/`@payloadcms/next` 3.90.2 exactly) and `eslint-config-next` to 16.3.8 to match `next`. Neither is in the AC list; both are required for a consistent tree.
- Leave `engines.node`, `@types/node` and everything else unchanged. No `output: 'standalone'` and no `public/` fix (Story 2.1).
- Integration tests need the Compose Postgres (`docker compose up -d`).

**Done (2026-10-06):**
- `package.json`, `package-lock.json` -- bumped as above; `npm ls` shows single copies of `next@16.3.8` and all `@payloadcms/*@3.90.2`.
- `Dockerfile` -- base `node:22.23.3-alpine` (tag verified on Docker Hub).
- `src/app/(payload)/admin/importMap.js` -- `generate:importmap` found no new imports; file unchanged.
- `src/payload-types.ts` -- regenerated; Payload 3.90 adds the auth field `resetPasswordRequestedAt` to `users`. No migrations exist yet, so dev push mode adds the column; nothing to migrate.
- Surprise: `npm run lint` was already broken on `HEAD` (verified in a clean worktree): `eslint-config-next` 16 ships flat configs, and wrapping them in `FlatCompat` crashes with "Converting circular structure to JSON". `eslint.config.mjs` now spreads `eslint-config-next/core-web-vitals` and `/typescript` directly (as the Next 16.3.8 ESLint docs show), with the same rule overrides and ignores. Rule strictness is unchanged (Story 1.6 owns that).
- Verified: lint 0 errors / 3 existing warnings; `tsc --noEmit` clean; `npm run dev` ready on Next 16.3.8, `/admin` 200; `test:int` 1/1; Playwright e2e 4/4 (run against the running dev server; Chromium had to be installed locally first).
- Review patches: `eslint` range raised to `^9.22.0` (`eslint/config`'s `defineConfig`/`globalIgnores` need 9.22); `eslint.config.mjs` ignores `media/`, `test-results/`, `playwright-report/`, `blob-report/` (git-ignored output the old, crashing config never reached). Re-verified on `node:22.23.3-alpine` in a container: `npm ci`, lint 0 errors, `tsc --noEmit` clean.

## Review Triage Log

- `eslint` `^9.16.0` too loose for `eslint/config` -- medium, real (APIs added in 9.22.0; works only via lockfile 9.39.5). Patched.
- Host Node 22.16.0, no version file -- low, real, pre-existing. Deferred (grouped with `engines.node`).
- Node bump never run -- low, real verification gap. Closed: lint + `tsc` run on `node:22.23.3-alpine`; full image build is Story 2.1.
- Compose `payload` uses floating `node:22-alpine` + `npm install` -- low, real, pre-existing; AC names only the Dockerfile. Deferred.
- `engines.node` `>=20.9.0` -- low, real, pre-existing. Deferred with the host-Node entry.
- `.npmrc` `legacy-peer-deps` hides peer conflicts -- medium, real, pre-existing. Deferred (Story 1.2 CI).
- ESLint doesn't honour `.gitignore` -- low, real: default `html` reporter writes `playwright-report/` that lint would scan. Patched with explicit globs (no new `@eslint/compat` dependency).
- Redundant `.next/**`, `importMap.js` not ignored -- low, rejected: harmless duplicate; lint reports nothing in `importMap.js`.
- Nothing stops lint breaking again -- false for this story: Story 1.2 puts lint and typecheck in CI.
- Lexical 0.41 → 0.50 via `richtext-lexical` -- low, real; admin loads and tests pass, no `richText` fields. Deferred (Story 1.5 candidate).
- `resetPasswordRequestedAt` unrecorded beyond spec -- maybe-false re FR-5 rate limit. Deferred to Story 1.8.
