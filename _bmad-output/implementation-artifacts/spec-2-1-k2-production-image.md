---
title: 'Story 2.1: [K2] Production image'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_revision: '8818ee53539db7dbff65bdd52c9df9893cd84f02'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred:
  - summary: >-
      The production image has no HEALTHCHECK or readiness signal; a container
      that starts but cannot reach Postgres sits "Up" indefinitely.
    evidence: |-
      Story 2.2's production compose (restart: unless-stopped) is the natural
      home for a readiness check — either a compose-level healthcheck or an
      image HEALTHCHECK using busybox wget. Decide there.
    location: >-
      Dockerfile (runner stage)
    severity: low
---

<intent-contract>

## Intent

**Problem:** There is no production image: `output: 'standalone'` is not set, the Dockerfile is the stock multi-package-manager Next.js example, and CI never builds or publishes anything, so Story 2.2 (the LXC pulls, never builds) has nothing to pull.

**Approach:** Enable standalone output, rewrite the Dockerfile for this repo (npm, `node:22.23.3-alpine`, standalone runner), and add a CI job that, on every push to `main` after the existing checks pass, builds the image and pushes it to GHCR (`ghcr.io/mikahimself/bookeh`) tagged with the commit SHA and `latest`.

## Boundaries & Constraints

**Always:**
- Image base `node:22.23.3-alpine` in every stage; CI `setup-node` already mirrors 22.23.3 — keep them in lock-step.
- Publish only from pushes to `main`, and only after the existing `check` job succeeds.
- Tags: the full commit SHA and `latest`, both on `ghcr.io/mikahimself/bookeh`.
- Authenticate to GHCR with the workflow's own `GITHUB_TOKEN` (`permissions: packages: write`); no PAT.
- Runtime configuration comes only from environment variables named in `.env.example` (`DATABASE_URL`, `PAYLOAD_SECRET`, optional `DATABASE_PUSH`, `SEED_EMAIL`, `SEED_PASSWORD`).
- The build may use the network (Open Sans downloads via `next/font/google` at build); the running container must make no outbound font request — `next/font` self-hosts, so do not add runtime font fetching.
- Run the app as a non-root user in the final stage.

**Never:**
- No real secrets baked into the image or workflow; a build-time `PAYLOAD_SECRET`, if `next build` requires one, is a throwaway dummy value.
- No deploy artifacts of later stories: no `deploy/compose.prod.yml`, no systemd units, no backup script (Stories 2.2/2.3).
- No multi-arch build matrix, registry caching infrastructure, or release versioning scheme — SHA + `latest` on amd64 is the whole requirement (the LXC is amd64).
- Do not weaken or reorder the existing `check` job.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Push to `main`, checks pass | CI run on `main` | Image pushed to GHCR as `<sha>` and `latest` | No error expected |
| Push to `main`, checks fail | Lint/type/test failure | Publish job does not run; nothing pushed | Workflow red |
| Push to a branch / PR | Non-`main` ref | `check` runs; publish job skipped | No error expected |
| Local `docker run` against Compose Postgres | Env vars from `.env.example` names only, on the `bookeh_default` network | App serves the sign-in page on :3000 | Startup errors visible in container logs |

</intent-contract>

## Code Map

- `next.config.ts` -- add `output: 'standalone'` to `nextConfig`; current config has `images.localPatterns`, webpack extensionAlias, turbopack root; wrapped in `withPayload(withNextIntl(...))`. Confirmed current API in `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md`.
- `Dockerfile` -- stock Vercel example: multi-lockfile branching (repo is npm-only, `package-lock.json`), base `node:22.23.3-alpine` (already correct), legacy `ENV K V` syntax, copies `/app/public` (exists now — `public/icons/` PWA icons from story 1.21, so the "missing public/" failure from the epic file is gone; keep the copy). Rewrite npm-only with the standalone copy pattern (`.next/standalone` → `.`, `.next/static` → `.next/static`, `public` → `public`).
- `.github/workflows/ci.yml` -- single `check` job, `on: [push, pull_request]`, concurrency per ref. Add a `publish` job: `needs: check`, `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`, `permissions: { contents: read, packages: write }`, login via `docker/login-action` with `GITHUB_TOKEN`, build+push via `docker/build-push-action` tagging `ghcr.io/mikahimself/bookeh:${{ github.sha }}` and `:latest`.
- `docker-compose.yml` -- dev `payload` service runs unpinned `node:22-alpine`; pin to `node:22.23.3-alpine` (Epic 1 retro action item 13, explicitly folded into this story).
- `package.json` -- `build` script: `cross-env NODE_OPTIONS="--no-deprecation --max-old-space-size=8000" next build`; `cross-env` is a devDependency, so the builder stage must `npm ci` with dev deps (default). `sharp` is a runtime dependency imported by `src/payload.config.ts`; standalone tracing picks it up from the alpine (musl) builder install.
- `messages/en.json`, `messages/fi.json` -- statically imported by `src/i18n/request.ts`, so they are bundled; no `outputFileTracingIncludes` needed.
- `.env.example` -- canonical env variable list; do not add variables.

## Tasks & Acceptance

**Execution:**
- `next.config.ts` -- add `output: 'standalone'` -- required for the standalone server the Dockerfile runs.
- `Dockerfile` -- rewrite npm-only on `node:22.23.3-alpine`: deps stage (`npm ci`), build stage (`npm run build`; pass dummy build-time env only if the build demands it), runner stage (non-root user, copy `public`, `.next/standalone`, `.next/static`, `EXPOSE 3000`, `ENV PORT=3000 HOSTNAME=0.0.0.0`, `CMD ["node", "server.js"]`) -- the production image Story 2.2 pulls.
- `.github/workflows/ci.yml` -- add the `publish` job gated on `check` and `main` pushes, pushing `ghcr.io/mikahimself/bookeh` tagged `${{ github.sha }}` and `latest` -- the LXC never builds.
- `docker-compose.yml` -- pin `payload` service image to `node:22.23.3-alpine` -- retro item 13, keeps dev and image Node identical.

**Acceptance Criteria:**
- Given the rewritten Dockerfile, when `docker build` runs locally, then it succeeds, every stage is based on `node:22.23.3-alpine`, the final stage runs as a non-root user, and no real secret is baked in.
- Given the running container (happy-path row of the matrix), when its logs are inspected, then there is no outbound font request — Open Sans was downloaded at build and is served from the image.
- Given `Dockerfile` and `docker-compose.yml` after the change, when both are read, then both pin `node:22.23.3-alpine` (retro item 13).

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 15 findings — high 0, medium 7, low 6, false 2, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent-alignment) Dockerfile keeps the `public/` copy the story AC says to remove — the AC predates story 1.21; `public/icons/` exists and must ship (manifest references it); the purposive reading is documented in Design Notes, and the literal one would produce a worse image. No bad outcome.
  - `[medium]` `[patch]` (intent-alignment) "every push to `main` produces an image" is undercut by workflow-level `cancel-in-progress: true` — grouped with the blind-hunter/edge-case cancellation findings; fix applied: `cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`, so `main` runs queue.
  - `[medium]` `[patch]` (intent-alignment) the runtime clauses (starts against Compose Postgres, no font request) are asserted, never exercised by any automated path — grouped with the verification-gap finding; fix applied: smoke-run step in `publish` before any push.
  - `[medium]` `[patch]` (blind-hunter) `cancel-in-progress` can silently drop a `main` commit's SHA tag from GHCR while Story 2.2 pins full SHAs — verified at ci.yml:5-10; same root cause as above; fix applied: conditional cancellation.
  - `[low]` `[reject]` (blind-hunter) nothing builds the Docker image on PRs, so a broken Dockerfile merges green — real but rare (Dockerfile changes are infrequent, this repo pushes mostly straight to `main`), failure on `main` is loud and non-destructive (previous images remain pullable, smoke-run stops a broken image shipping), and the fix adds a PR-wide docker-build job — complexity beyond a direct correction for a defect everyday use won't meet.
  - `[low]` `[patch]` (blind-hunter) `.dockerignore` misses gitignored artifacts (`/media` dev uploads, `/coverage`, `/blob-report`, `playwright/.cache`, `.DS_Store`, `*.pem`) that `COPY . .` sweeps into the builder — verified against .gitignore; fix applied: entries added.
  - `[medium]` `[patch]` (blind-hunter) runner stage leaves `/app` root-owned with no writable `media/` while `src/collections/Media.ts` (`upload: true`, registered) writes there — verified; an upload in an unmounted container fails EACCES; fix applied: `RUN mkdir media && chown nextjs:nodejs media`, writability verified in the rebuilt image.
  - `[low]` `[patch]` (blind-hunter) deps-stage comment claims dev deps are needed for `cross-env`, but `cross-env` is in `dependencies` — verified in package.json; fix applied: comment now cites typescript/Tailwind toolchain.
  - `[low]` `[patch]` (blind-hunter) `epic-2-context.md` ships the stale claim "stop copying the non-existent `public/` directory" that this diff contradicts — fix applied: bullet corrected to state `public/` exists since story 1.21 and ships in the image.
  - `[low]` `[defer]` (blind-hunter) no `HEALTHCHECK` or readiness signal in the image — runtime/compose readiness belongs to Story 2.2's production compose; recorded in frontmatter `deferred`.
  - `[medium]` `[patch]` (verification-gap, pre-verified) the published image is never started, so the builds-but-cannot-serve class (dropped `HOSTNAME`, broken static copy, bad `.dockerignore` entry) ships green to `:<sha>` and `:latest` — fix applied: `publish` now builds with `push: false, load: true`, migrates a service Postgres, smoke-runs the image (`/login` + one `/_next/static/` asset), and only then logs in and pushes.
  - `[medium]` `[patch]` (edge-case-hunter) second push to `main` cancels an in-flight publish — same root cause as the cancellation group; fix applied (conditional `cancel-in-progress`; the suggested job-level concurrency would not survive workflow-level cancellation).
  - `[low]` `[reject]` (edge-case-hunter) Docker build breaks on a PR branch and is discovered post-merge — same root cause as the blind-hunter PR-build finding; rejected for the same reason.
  - `[false]` `[reject]` (edge-case-hunter) `next build` initialises Payload with `PAYLOAD_SECRET`/`DATABASE_URL` unset and fails only in the post-merge publish job — refuted: the local `docker build` ran with no env and succeeded (every Payload route builds as dynamic, config secrets are not evaluated at build), and the publish job runs the identical build; the smoke-run now also exercises it pre-push.
  - `[medium]` `[patch]` (edge-case-hunter) media upload EACCES in a container without a bind mount — same root cause as the blind-hunter media-dir finding; fix applied (`mkdir media && chown`).

## Design Notes

- The epic file's "no longer copies a missing `public/` directory" AC predates story 1.21, which created `public/icons/`; the directory now exists and must ship in the image (PWA icons, `src/app/manifest.ts` references them). The AC is satisfied because nothing missing is copied.
- If `next build` inside Docker fails on missing env (Payload config is evaluated at build), supply dummy values via `ARG`/`ENV` in the build stage (e.g. `PAYLOAD_SECRET=build-dummy`, a syntactically valid `DATABASE_URL`); the build must not need a reachable database. Document any such dummy inline in the Dockerfile.
- Full SHA vs short: use `${{ github.sha }}` (full) — the AC says "commit SHA"; the epic context says images are tagged with the commit SHA, and the full form is what `docker compose pull` on the LXC will reference.

## Verification

**Commands:**
- `npm run lint && npm run typecheck` -- expected: clean.
- `docker build -t bookeh:local .` -- expected: build succeeds end-to-end (needs network for npm and Open Sans).
- `docker run --rm --network bookeh_default -p 3001:3000 -e DATABASE_URL=postgres://bookeh:bookeh@postgres:5432/bookeh -e PAYLOAD_SECRET=$(openssl rand -hex 32) bookeh:local` then `curl -fsS http://localhost:3001/login | grep -qi bookeh` -- expected: container starts, sign-in page served; container logs show no font fetch.
- `grep -c "node:22.23.3-alpine" Dockerfile docker-compose.yml` -- expected: pinned tag present in both.

**Manual checks (if no CLI):**
- Read the rendered workflow: publish job has `needs: check`, the `main`-push guard, `packages: write`, and both tags on `ghcr.io/mikahimself/bookeh`. The actual GHCR push is only observable after merge to `main`; confirm the local build and the job wiring instead.

## Auto Run Result

Status: done

**Summary.** Production image per story 2.1: `output: 'standalone'` in `next.config.ts`; the Dockerfile rewritten npm-only on `node:22.23.3-alpine` (three stages, non-root `nextjs` runner, standalone copy pattern, writable `media/`); a new `.dockerignore` keeping `.env*`, dev uploads and host artifacts out of the image; a CI `publish` job that, after `check` passes on a `main` push, builds the image, smoke-runs it against a migrated service Postgres, and pushes `ghcr.io/mikahimself/bookeh:<full sha>` + `:latest` with the workflow's own token; the dev compose `node` image pinned (retro item 13).

**Files changed.**
- [next.config.ts](../../next.config.ts) — `output: 'standalone'`.
- [Dockerfile](../../Dockerfile) — npm-only multi-stage rewrite; non-root runner; `media/` created and chowned; corrected dev-deps comment.
- [.dockerignore](../../.dockerignore) — new; excludes `.env*` (keeps `.env.example`), `media`, test/build artifacts, VCS and planning dirs.
- [.github/workflows/ci.yml](../../.github/workflows/ci.yml) — conditional `cancel-in-progress` (main runs queue); `publish` job: build → migrate → smoke-run → login → push.
- [docker-compose.yml](../../docker-compose.yml) — dev `payload` service pinned to `node:22.23.3-alpine`.
- [epic-2-context.md](epic-2-context.md) — stale `public/` bullet corrected.

**Review findings breakdown.** 15 findings from 4 layers: 6 patch entries applied (3 medium: publish cancellation / no smoke before push / unwritable `media`; 3 low: `.dockerignore` gaps, wrong dev-deps comment, stale context bullet), 1 deferred (image/compose healthcheck → Story 2.2), rejected: PR-time docker build (low — rare defect, loud non-destructive failure on `main`, fix adds a PR-wide build job), Dockerfile-keeps-`public/` (false — directory exists since story 1.21, departure documented), build-needs-dummy-env (false — build demonstrably succeeds without env; all routes dynamic).

**Follow-up review recommendation: true** (first pass patched 3 medium entries). Named unverified risk: the `publish` job's smoke-run sequence (service Postgres + `npm run payload -- migrate` + `docker run --network host` + retry-curl) has never executed on a real GitHub runner; its first `main` run is the verification. If it misbehaves, the failure mode is a red `publish` with nothing pushed — never a broken image shipping.

**Verification performed.** `npm run lint` and `npm run typecheck` clean (pre-existing warnings only); `docker build` succeeds; image inspected (`user=nextjs`, exec-form CMD, no baked secrets, no `.env` in filesystem); container run on `bookeh_default` against the Compose Postgres with only `.env.example`-named variables serves `/login` (grep matches), `media/` writable by `nextjs`; no `fonts.googleapis.com`/`gstatic` references in served HTML and the image-hosted woff2 returns 200; `node:22.23.3-alpine` pinned in Dockerfile and docker-compose.yml; workflow YAML parses with the intended step order.

**Residual risks.** First real GHCR push and smoke-run observable only on the next `main` push (red-job failure mode, nothing ships). GHCR may create the package private on first push — one-time visibility check in the GitHub UI. With queued (non-cancelling) `main` runs, a rapid burst of pushes can still skip an intermediate commit's pending run under GitHub's one-pending-per-group rule — the newest commit always publishes.
