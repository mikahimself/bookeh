---
title: 'Story 1.2 [A2] GitHub repository and CI workflow'
type: 'chore'
created: '2026-10-07'
status: 'in-review'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: '282f91363b7375c31e701aa0678b4f63a0196b06'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The repository has no remote and nothing checks a push. Lint was silently broken on `HEAD` until Story 1.1 found it, and `playwright.config.ts` starts the server with `pnpm`, which neither this project nor CI has.

**Approach:** Push the repository to a private GitHub repository and add one GitHub Actions workflow that runs on every push and pull request: `npm ci`, lint, `typecheck` and the test suite (`test:int`, then `test:e2e` with Chromium) against a Postgres service container. Add the `typecheck` script and start Playwright's web server with `npm run dev`. Prove the gate bites with a deliberately failing test on a throwaway branch.

**Decision (2026-10-07):** Mika creates the empty private repository `github.com/mikahimself/bookeh` in the browser (no README). Claude adds the `origin` remote over SSH, pushes `main` and the failing-test branch, and Mika confirms in the Actions tab that `main` is green and the branch run is red, since no `gh` CLI or token is available here.

## Boundaries & Constraints

**Always:** Pin the runner's Node to `22.23.3`, the Dockerfile's version. Give the workflow the same `DATABASE_URL` shape as `.env.example` and a CI-only `PAYLOAD_SECRET`; never a real secret. Use the Compose Postgres image (`postgres:16-alpine`) and credentials so the workflow and Compose agree. Keep `npm` as the only package manager.

**Never:** No ICU Postgres (Story 1.3), no `bookeh_test` database or harness (1.4), no migration check (1.9), no image build or GHCR push (2.1). No `npm ls` gate: it already fails on pre-existing invalid peers. Do not change the tests themselves, lint rules or `tsconfig.json`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Green push | Push of `main` as it is after this story | Workflow runs lint, typecheck, `test:int`, `test:e2e`; all green | N/A |
| Failing test | Branch with a test that asserts `expect(1).toBe(2)` | Workflow run is red on the test step | Branch is deleted after the run; `main` untouched |
| Lint or type error | A push with an ESLint error or a `tsc` error | Workflow fails before the tests run | Steps run in order; a failing step stops the job |
| Local e2e | `npm run test:e2e` on the host with no dev server running | Playwright starts `npm run dev` itself; with one running, reuses it | N/A |

</frozen-after-approval>

## Code Map

- `package.json` -- scripts; add `"typecheck": "cross-env NODE_OPTIONS=--no-deprecation tsc --noEmit"` next to `lint`. `test` already chains `test:int` and `test:e2e`. `typescript` 5.7.3 is a devDependency; `tsc --noEmit` passes today.
- `playwright.config.ts:40` -- `webServer.command: 'pnpm dev'` → `'npm run dev'`. `reuseExistingServer: true` already covers host dev. Project uses `channel: 'chromium'`, so CI needs `npx playwright install --with-deps chromium`.
- `docker-compose.yml` -- source of truth for the Postgres image (`postgres:16-alpine`), user/password/db (`bookeh`/`bookeh`/`bookeh`) and the healthcheck `pg_isready -U bookeh -d bookeh`; mirror these in the service container. Do not edit.
- `.env.example` -- `DATABASE_URL=postgres://bookeh:bookeh@localhost:5432/bookeh`, `PAYLOAD_SECRET`; these two env vars are all the app and tests need.
- `tests/int/api.int.spec.ts` -- vitest, needs a reachable DB (`getPayload` with push on creates the schema). `tests/e2e/*.e2e.spec.ts` -- hit `http://localhost:3000`; the admin test seeds a user through `getPayload`, so the Playwright process needs the same env.
- `Dockerfile` -- `node:22.23.3-alpine`; the CI Node version follows it.
- `eslint.config.mjs` -- lint passes with 0 errors, 3 warnings; do not touch.
- `.github/workflows/` -- does not exist yet; the spine's source tree names this path.

## Tasks & Acceptance

**Execution:**
- [x] `package.json` -- add the `typecheck` script -- the AC and the spine's scaffold-gap list require it.
- [x] `playwright.config.ts` -- `webServer.command` becomes `npm run dev` -- CI has no `pnpm`.
- [x] `.github/workflows/ci.yml` -- new workflow `CI`: `on: [push, pull_request]`, `concurrency` per ref with cancel-in-progress, one `ubuntu-latest` job with a `postgres:16-alpine` service (Compose credentials, `pg_isready` health options, port 5432), `actions/checkout@v4`, `actions/setup-node@v4` with `node-version: 22.23.3` and `cache: npm`, then `npm ci`, `npm run lint`, `npm run typecheck`, `npm run test:int`, `npx playwright install --with-deps chromium`, `npm run test:e2e`. Job-level `env`: `DATABASE_URL`, `PAYLOAD_SECRET`, `CI: true` -- one gate for every push.
- [ ] Git -- add remote `origin` (`git@github.com:<owner>/bookeh.git`) and push `main` -- the repository moves to GitHub before the pipeline exists (spine).
- [ ] Git -- branch `ci-failing-test-check` with a failing assertion in `tests/int/api.int.spec.ts`, push, confirm the red run, delete the branch locally and on the remote -- proves the gate bites.

**Acceptance Criteria:**
- Given the repository pushed to the private GitHub repository, when `main` is pushed, then the `CI` workflow runs lint, `typecheck`, `test:int` and `test:e2e` against the Postgres service and is green.
- Given `package.json`, when `npm run typecheck` runs on the host, then `tsc --noEmit` exits 0.
- Given `playwright.config.ts`, when `npm run test:e2e` runs with no server up, then Playwright starts it with `npm run dev`.
- Given a branch with a deliberately failing test, when it is pushed, then its workflow run is red, and the branch is removed afterwards.

## Implementation Notes

- Package manager is npm, so the workflow uses `npm ci` and the Playwright web server `npm run dev`. CI Node is `22.23.3` to match the Dockerfile; host Node is 22.16.0 and every check still passes there.
- The Postgres service mirrors `docker-compose.yml` exactly (image, credentials, healthcheck), so Story 1.3 changes both in one place each.
- `PAYLOAD_SECRET` in the workflow is a literal CI-only string, not a repository secret: nothing in CI is sensitive, and a secret would be one more thing to set up by hand.
- The remote operations (add `origin`, push `main`, the `ci-failing-test-check` branch) run after the commit, since the implement step allows no remote ops; they are tracked by the two unchecked Git tasks.
- Verified on the host against the Compose Postgres: `typecheck` exit 0, lint 0 errors / 3 pre-existing warnings, `test:int` 1/1, `test:e2e` 4/4. The e2e run reused the already-running dev server on port 3000 (not killed), so the "Playwright starts the server itself" path is proven only by the first CI run, where no server pre-exists.
- Matrix audit: the four rows describe CI behaviour, so the covering "tests" are the GitHub runs themselves. Green `main` covers row 1 and row 4's CI half; the red throwaway branch covers row 2; row 3 follows from step order (lint and typecheck precede the tests). All three are confirmed from the Actions tab after the push.

## Spec Change Log

## Review Triage Log

- `typecheck` in CI skips Next's generated route types (`next-env.d.ts`, `.next/*/types` are gitignored) -- medium, real: Next 16 docs prescribe `next typegen && tsc --noEmit` for CI; without it route validation is silently skipped. Patch.
- No `timeout-minutes` on the job -- low, real: a hung dev server holds a runner for 6 h. Patch (one line).
- Playwright report and traces discarded on a red e2e step -- medium, real: `playwright-report/` and `test-results/` are never uploaded. Patch (`upload-artifact` on failure).
- `CI: true` redundant -- low, real: GitHub sets it. Patch (delete).
- `actions/checkout@v4`, `setup-node@v4` on the retiring Node 20 action runtime -- low, real: v7 of both (and of `upload-artifact`) is current on GitHub releases. Patch.
- Playwright `webServer` default 60 s timeout may be short for a cold compile of `/` on a runner -- medium, real risk, cheap guard. Patch (`timeout: 180_000`).
- README still says `pnpm install && pnpm dev` -- low, real, in intent ("npm as the only package manager"). Patch.
- First `/admin/login` request in `beforeAll` may exceed the 30 s test timeout on a cold Turbopack compile -- maybe-false: settled by the first CI run on `main`; if red on a timeout, raise `timeout` under `CI`. Deferred with that note.
- Node version pinned by hand in Dockerfile and `ci.yml`, `engines.node` still `>=20.9.0` -- low, real, pre-existing (already deferred from 1.1). Deferred.
- Every PR-branch push runs twice (push + pull_request) -- low, rejected: the AC asks for both triggers; the owner pushes `main` directly, so PRs are rare.
- `cancel-in-progress` on `main` drops the earlier commit's verdict -- low, rejected: for a solo developer the latest commit's verdict is the one that matters; the fix adds an expression for no everyday gain.
- e2e runs against cold `next dev`; nothing runs `next build` -- rejected as out of intent: the build and image belong to Story 2.1 (slice K2); `npm run dev` is the AC's server command.
- Browser download uncached -- low, rejected: optimisation adding a cache step; runs are few.
- AC 3 (Playwright spawns the server) not exercised locally -- rejected as a process note: the user's dev server on :3000 is not mine to kill; the first CI run has no pre-existing server and proves it.
- Spec status vs sprint-status drift; Git tasks unchecked -- false: both files are workflow-managed and synced at the end of the build; the Git tasks are scheduled after the commit by design.
- Verification-gap layer: no gaps found.

## Verification

**Commands:**
- `npm run typecheck` -- expected: exit 0.
- `npm run lint` -- expected: 0 errors.
- `npm run test:int` -- expected: 1/1 against the Compose Postgres.
- `npm run test:e2e` -- expected: 4/4, server started by Playwright if none runs.
- `git ls-remote origin main` -- expected: the pushed commit.

**Manual checks (if no CLI):**
- GitHub Actions tab: the `main` run is green; the `ci-failing-test-check` run is red on the `test:int` step.
