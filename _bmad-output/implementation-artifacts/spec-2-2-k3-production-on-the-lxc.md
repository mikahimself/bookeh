---
title: 'Story 2.2: [K3] Production on the LXC'
type: 'feature'
created: '2026-10-10'
status: 'done'
baseline_revision: '92a74baa05631aa0a8565f764b9cc065663bfebd'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: [oversized]
deferred:
  - summary: >-
      The deploy artifacts (compose.prod.yml resolution, the marker-check
      wrapper) have no repeatable verification after this story's one-time
      rehearsals.
    evidence: |-
      Verification-gap reviewer: no harness touches deploy/; a later edit that
      inverts the marker test or renames a compose variable fails nothing.
      Cheapest future pin is a CI step running
      `docker compose -f deploy/compose.prod.yml --env-file <stub> config -q`,
      not a container test (tests-at-a-functional-minimum convention).
    location: >-
      deploy/
    severity: low
  - summary: >-
      On-LXC acceptance (systemd unit with NAS mounts, tailscale serve, phone
      reaching sign-in over tailnet HTTPS, env-file permissions) has not been
      performed; the operator checklist in deploy/README.md is the record.
    evidence: |-
      Intent-alignment auditor: the live-machine half of the story's ACs only
      has truth values on the LXC, which this unattended run cannot reach.
      Running the deploy/README.md acceptance checklist on the LXC settles it.
    location: >-
      deploy/README.md (acceptance checklist)
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The image from Story 2.1 sits in GHCR with nowhere to run: there is no `deploy/` directory, no production compose, no NAS-mount guard, `prodMigrations` is not wired (production would rely on push, which the adapter disables when `NODE_ENV=production` — so no schema at all), and no cookie the app sets is `Secure`.

**Approach:** Ship the production deployment as repo artifacts — `deploy/compose.prod.yml` (app from GHCR + Postgres, bind-mounted to NAS paths, marker-file entrypoint guard, healthcheck), a systemd unit with `RequiresMountsFor`, an env template, and `deploy/README.md` with the operator procedure including `tailscale serve` — plus three code changes: `prodMigrations` in the adapter, and production-only `Secure` on the session, `bookeh_prefs` and `bookeh_flash` cookies.

## Boundaries & Constraints

**Always:**
- The LXC never builds: the app service pulls `ghcr.io/mikahimself/bookeh:${BOOKEH_IMAGE_TAG:-latest}`; the operator flow is `docker compose pull && docker compose up -d` (wrapped by the systemd unit at boot).
- Postgres is `postgres:16-alpine3.24` with `POSTGRES_INITDB_ARGS: --locale-provider=icu --icu-locale=fi-FI`, same as dev; both services `restart: unless-stopped`; exactly one app container (AD-12 — note it in the compose file).
- Postgres data and the media directory bind-mount to NAS paths taken from the env file (`${BOOKEH_PG_DIR}`, `${BOOKEH_MEDIA_DIR}`); canonical example paths under `/mnt/nas/bookeh/` used consistently in the unit, env template and README.
- The marker-file check lives in an entrypoint wrapper script for the Postgres container, so it runs on **every** start, including restart-policy restarts: missing marker → log one clear error and exit non-zero before the stock entrypoint can initdb.
- Secrets discipline: the production env file is `chmod 600`, operator-owned; the GHCR token is read-only (`read:packages`) and README carries a line for its expiry date that the operator fills when minting it.
- Secure split is `process.env.NODE_ENV === 'production'`: the image runs with `NODE_ENV=production` (set in the Dockerfile), dev on `http://localhost` stays non-Secure.
- App container port binds to `127.0.0.1` only; `tailscale serve` is the sole way in (tailnet-only HTTPS; never `tailscale funnel`).
- README states the collation constraint: the production cluster needs the same `POSTGRES_INITDB_ARGS` on an empty data directory, and a restore into a database created without them silently keeps libc collation (`pg_dump` carries the locale only with `-C`) — deferred item from Story 1.3.
- Runtime app configuration stays within the variable names of the root `.env.example`; deploy-side variables (paths, Postgres password, GHCR token, image tag) exist only in the deploy env file.

**Never:**
- No backup script, timer, or `last-backup.json` (Story 2.3).
- No monitoring stack, no public ingress, no service worker, no Kubernetes.
- Do not refactor CI's Postgres to run from `docker-compose.yml` (deferred-work item from Story 1.3) — it stays deferred; this story's ACs are deploy-side and CI is untouched.
- Do not mount `docker/postgres/initdb/` in production (`bookeh_test` is a dev/CI artifact).
- No real secrets, hostnames, or tokens committed — templates and placeholders only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Normal start on LXC | NAS mounted, marker present, env file in place | Postgres starts on NAS data, app applies `prodMigrations`, serves on 127.0.0.1:3000 | No error expected |
| NAS mount missing | Marker file absent (bind sources are empty auto-created dirs) | Postgres container exits non-zero with a clear message; app never gets a healthy dependency | Error logged by wrapper; `restart: unless-stopped` retries harmlessly |
| Empty production database | First start, `users` empty, seed vars set | Migrations create schema, `onInit` seeds the first user | Seed warning logged if vars missing (existing behaviour) |
| Production cookies | Sign-in / prefs write / flash toast over HTTPS | `Set-Cookie` carries `Secure` on payload-token, `bookeh_prefs`, `bookeh_flash` | n/a |
| Dev cookies | `next dev` on `http://localhost` | No `Secure` attribute; sign-in keeps working | n/a |
| Restart-policy restart | Docker restarts Postgres after a crash while NAS is unmounted | Wrapper runs again and refuses; no initdb on a local dir | Same wrapper error path |

</intent-contract>

## Code Map

- `src/payload.config.ts` -- add `prodMigrations: migrations` (import `{ migrations }` from `./migrations`) to `postgresAdapter`. Evidence: adapter runs them only when `NODE_ENV === 'production'` and push only when `NODE_ENV !== 'production'` (`node_modules/@payloadcms/db-postgres/dist/connect.js:110-118`), so unconditional wiring is correct and push is off in production by the adapter itself; keep the existing `DATABASE_PUSH` line for CI.
- `src/migrations/index.ts` -- exports `migrations` array (two migrations); read-only.
- `src/collections/Users.ts` -- `auth` currently only `tokenExpiration`; add `cookies: { secure: process.env.NODE_ENV === 'production' }`. `startSession` (`src/lib/payload/session.ts:30-45`) already copies `cookie.secure` from this auth config via `generatePayloadCookie` — no change there.
- `src/app/(frontend)/prefs.ts` -- `PREFS_COOKIE_OPTIONS` (`as const`, ~line 38): add `secure: process.env.NODE_ENV === 'production'`.
- `src/app/(frontend)/components/toast/flash.ts` -- `flashToast` cookie options (line 16-21): add the same `secure` flag; stays `httpOnly: false` (client reads it).
- `deploy/compose.prod.yml` -- new. App service: GHCR image, `restart: unless-stopped`, `ports: ['127.0.0.1:3000:3000']`, `${BOOKEH_MEDIA_DIR}:/app/media`, env via compose `environment:` interpolated from the deploy `.env` (`DATABASE_URL: postgres://bookeh:${POSTGRES_PASSWORD}@postgres:5432/bookeh`, `PAYLOAD_SECRET`, `SEED_EMAIL`, `SEED_PASSWORD`), `depends_on: postgres: condition: service_healthy`, compose-level healthcheck (busybox `wget -q -O /dev/null http://127.0.0.1:3000/login` — resolves Story 2.1's deferred readiness finding at the compose level; the image is untouched). Postgres service: pinned image, ICU initdb args, `POSTGRES_USER/DB: bookeh`, password from env, binds `${BOOKEH_PG_DIR}/data:/var/lib/postgresql/data` + `${BOOKEH_PG_DIR}:/bookeh-nas:ro` + the wrapper script `ro`, `entrypoint` overridden to the wrapper, `command: ['postgres']`, same `pg_isready` healthcheck as dev.
- `deploy/postgres-entrypoint.sh` -- new wrapper: `[ -f /bookeh-nas/.bookeh-nas-mounted ] || { echo ... >&2; exit 1; }` then `exec docker-entrypoint.sh "$@"`. POSIX sh.
- `deploy/bookeh.service` -- new systemd unit: `RequiresMountsFor=/mnt/nas/bookeh`, `After=docker.service network-online.target`, `Requires=docker.service`, oneshot + `RemainAfterExit`, `WorkingDirectory=/opt/bookeh`, `ExecStart=/usr/bin/docker compose -f compose.prod.yml up -d`, matching `ExecStop ... down`.
- `deploy/.env.example` -- new template: `POSTGRES_PASSWORD`, `PAYLOAD_SECRET`, `SEED_EMAIL`, `SEED_PASSWORD`, `GHCR_USER`, `GHCR_TOKEN`, `BOOKEH_PG_DIR`, `BOOKEH_MEDIA_DIR`, `BOOKEH_IMAGE_TAG` (default latest), each with a one-line comment; placeholder values only.
- `deploy/README.md` -- new: first-time setup (NAS dirs + `touch .bookeh-nas-mounted` marker, `chmod 600 .env`, `docker login ghcr.io` reading `GHCR_TOKEN` via `--password-stdin`, unit install path `/opt/bookeh`, `systemctl enable --now bookeh`), update procedure (`docker compose pull && docker compose up -d`), `tailscale serve --bg http://127.0.0.1:3000` + `tailscale serve status`, GHCR token expiry line to fill, collation/restore note, uid-1001 ownership note for the media dir, AD-12 one-container note, on-LXC acceptance checklist (phone reaches sign-in over HTTPS, marker test).
- `.dockerignore` -- add `deploy` (builder-stage `COPY . .` would sweep it into the image otherwise).
- `Dockerfile` -- read-only; runner already sets `NODE_ENV=production`, `media/` exists writable by uid 1001.
- `docker-compose.yml` -- read-only reference for service shapes (healthcheck, initdb args); dev behaviour must not change.
- `src/lib/account/seedFirstUser.ts` -- read-only; seed already handles the empty-database path via `onInit`.

## Tasks & Acceptance

**Execution:**
- `src/payload.config.ts` -- wire `prodMigrations: migrations` -- production applies migrations at start, never pushes (AD-13).
- `src/collections/Users.ts` -- `auth.cookies.secure` production-only -- session cookie `Secure` over `tailscale serve` HTTPS.
- `src/app/(frontend)/prefs.ts` + `src/app/(frontend)/components/toast/flash.ts` -- add the production-only `secure` flag -- Epic 1 retrospective decision lands where HTTPS arrives.
- `deploy/postgres-entrypoint.sh` -- create the marker-check wrapper -- Postgres never initdbs a local dir when the NAS mount is missing.
- `deploy/compose.prod.yml` -- create the production stack -- the LXC pulls and runs; nothing builds.
- `deploy/bookeh.service` -- create the unit with `RequiresMountsFor` -- boot-time start refuses without NAS mounts.
- `deploy/.env.example` -- create the deploy env template -- single `chmod 600` file holds every secret and path.
- `deploy/README.md` -- write the operator procedure -- deploy steps, token expiry, collation note, acceptance checklist.
- `.dockerignore` -- exclude `deploy` -- deploy artifacts stay out of the image.

**Acceptance Criteria:**
- Given a stub env file with every variable set, when `docker compose -f deploy/compose.prod.yml config` runs, then it resolves without warnings: GHCR image reference, both NAS binds, `unless-stopped` on both services, ICU initdb args, one app service, port bound to 127.0.0.1.
- Given a local directory **without** the marker file, when the Postgres service (or an equivalent `docker run` with the wrapper) starts, then the container logs the refusal and exits non-zero with no `PG_VERSION` created; given the marker, it starts and `pg_isready` succeeds.
- Given the production image running against an **empty** Postgres (local rehearsal of the LXC first start), when it boots with only deploy-env variables, then logs show `prodMigrations` applying both migrations, the seed user is created, and `/login` serves.
- Given that running container, when `POST /api/users/login` with the seed credentials is inspected, then `Set-Cookie: payload-token` carries `Secure`; and given `next dev` on localhost, sign-in, prefs and flash cookies carry no `Secure`.
- Given `deploy/README.md`, when read, then it contains the `tailscale serve` command, the GHCR token expiry line, the collation/restore note, and the operator acceptance checklist (phone reaches the sign-in page over tailnet HTTPS).

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass

- verdicts: 24 findings — high 0, medium 9, low 11, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` (blind-hunter) Postgres data-dir ownership on NAS undocumented — the alpine entrypoint chowns `data/` to uid 70 as root before initdb, which fails under NFS `root_squash`/fixed-uid CIFS, the exact first-start path the story exists for; fix applied: README NAS-step bullet (export without root_squash or `chown 70`).
  - `[low]` `[patch]` (blind-hunter) clearing `SEED_EMAIL`/`SEED_PASSWORD` later makes every compose invocation warn — verified: no `:-` defaults while README says to clear them; fix applied: `${SEED_EMAIL:-}`/`${SEED_PASSWORD:-}`, confirmed warning-free with the lines absent.
  - `[medium]` `[patch]` (blind-hunter) postgres healthcheck gives ~50 s before unhealthy while first initdb onto NAS can exceed it, failing the app's `service_healthy` dependency on first deploy; fix applied: `start_period: 120s`.
  - `[low]` `[patch]` (blind-hunter) app healthcheck is observe-only (`unless-stopped` never restarts an unhealthy-running container) and nothing said so; fix applied: README troubleshooting line (manual `restart app`).
  - `[low]` `[patch]` (blind-hunter) after an unclean shutdown dockerd restarts containers before NAS mounts (`RequiresMountsFor` guards only the systemd path): app up with no DB, auto-created root-owned dirs under the mountpoint — the data guard itself holds (wrapper refuses); fix applied: README troubleshooting note naming symptom and cleanup.
  - `[low]` `[patch]` (blind-hunter) no procedure for updating the deploy files themselves (LXC has no checkout; Story 2.3 will change them); fix applied: README "Updating the deploy files" subsection incl. `daemon-reload`.
  - `[low]` `[patch]` (blind-hunter) unbounded json-file logs on a long-running LXC — certain to accrete; fix applied: `logging` caps (10m × 3) on both services.
  - `[medium]` `[patch]` (blind-hunter) `. ./.env` executes the env file in the operator's shell; a password with spaces/`$`/quotes breaks the login step or runs fragments; fix applied: README extracts the two values via `sed` piped to `--password-stdin`; `.env.example` header states plain `KEY=value`, no quoting/expansion. (Same root cause as the edge-case-hunter sourcing finding — grouped.)
  - `[low]` `[patch]` (edge-case-hunter) acceptance-checklist marker test via systemctl would remount the NAS first (`RequiresMountsFor`) and the refusal never fires; fix applied: checklist item reworded to `docker compose -f compose.prod.yml up postgres`, explicitly not via systemctl.
  - `[medium]` `[patch]` (edge-case-hunter) `. ./.env` sourcing fragility — grouped with the blind-hunter row above; same fix.
  - `[medium]` `[patch]` (edge-case-hunter) root_squash/uid-70 initdb failure — grouped with the blind-hunter ownership row; same fix.
  - `[medium]` `[patch]` (edge-case-hunter) missing postgres `start_period` — grouped with the blind-hunter healthcheck row; same fix.
  - `[low]` `[patch]` (edge-case-hunter) seed-variable unset warnings — grouped with the blind-hunter seed-defaults row; same fix.
  - `[low]` `[reject]` (edge-case-hunter) no `stop_grace_period` on postgres: default 10 s grace can SIGKILL a slow NAS flush — consequence is WAL recovery on next start (self-healing, no data loss), unlikely with a tiny single-user database, and the fix adds a guard for a state never demonstrated.
  - `[low]` `[patch]` (edge-case-hunter) unhealthy-app-stays-down operator assumption — grouped with the blind-hunter observe-only row; same fix.
  - `[medium]` `[patch]` (verification-gap, pre-verified) CI's publish smoke pre-applied migrations host-side, so the container's own `prodMigrations` path — the one behavior this story's config change exists to produce — was never exercised; deleting the line stayed green; fix applied: "Apply migrations" (and the now-unused setup-node/`npm ci`) removed from the publish job; the smoke container must now build the schema itself on the empty service Postgres.
  - `[medium]` `[patch]` (verification-gap, pre-verified) no automated check observes the production `Secure` branch (existing assertions pin only `secure: false` under test; session cookie's flag unasserted anywhere); fix applied: smoke step seeds via CI-only `SEED_EMAIL`/`SEED_PASSWORD`, POSTs `/api/users/login` and fails unless `set-cookie: payload-token` carries `Secure` — also proving seed-on-empty-database through the container's migration path.
  - `[low]` `[defer]` (verification-gap) deploy artifacts have no repeatable verification after the one-time rehearsals — real but the reviewer's own disposition is defer under the tests-at-a-functional-minimum convention; recorded in frontmatter `deferred` with the cheapest future pin (`compose config -q` in CI).
  - `[low]` `[patch]` (verification-gap, other) ci.yml concurrency comment claimed "Story 2.2's compose pins full SHAs" while the shipped compose defaults to `latest`; fix applied: comment now says the LXC's compose can pin a full SHA via `BOOKEH_IMAGE_TAG`.
  - `[false]` `[reject]` (intent-alignment) marker file is not literally "in the data directory" — the literal reading is unworkable (initdb demands an empty directory, so first init would be impossible); the functional reading (marker in the NAS postgres directory, `data/`'s parent) guards exactly the condition the AC names and is documented in Design Notes. No bad outcome.
  - `[false]` `[reject]` (intent-alignment) README carries an expiry slot, not a date — a committed repo cannot hold the expiry of a token that does not exist yet; the slot plus the fill-when-minting instruction is the only faithful reading.
  - `[medium]` `[defer]` (intent-alignment) the live-LXC half of the ACs (systemd + NAS mounts, tailscale serve, phone over HTTPS, env-file mode) is observable only on the LXC, which this unattended run cannot reach — recorded in frontmatter `deferred` as unverified; the README acceptance checklist settles it. The automated-coverage half of this finding is resolved by the two verification-gap patches above.
  - `[false]` `[reject]` (intent-alignment) "push is off" rests on a mechanism outside the diff — verified real and sufficient: the adapter pushes only when `NODE_ENV !== 'production'` and runs `prodMigrations` only in production (`node_modules/@payloadcms/db-postgres/dist/connect.js:110-118`), and the Dockerfile pins `NODE_ENV=production`; the AC's outcome holds in production.
  - `[false]` `[reject]` (intent-alignment) extras beyond the story's letter (app healthcheck, collation note, `.dockerignore` entry) — all trace to recorded project decisions (Story 2.1 deferral, Story 1.3 deferred README note); no divergence from intent.

## Design Notes

- **Marker placement:** the marker cannot live inside `PGDATA` itself — initdb requires an empty directory, so the first init would be impossible. It sits in the NAS Postgres directory (`${BOOKEH_PG_DIR}/.bookeh-nas-mounted`), the parent of `data/`, mounted read-only at `/bookeh-nas`; it exists only when the NAS is mounted, which is exactly the condition the AC guards. Bind the `data/` subdirectory to `/var/lib/postgresql/data` exactly — binding the parent instead would let the image's `VOLUME /var/lib/postgresql/data` shadow it with an anonymous local volume and the cluster would silently not be on the NAS.
- **Healthcheck decision (Story 2.1 deferral):** compose-level, not image `HEALTHCHECK` — the policy belongs next to the restart policy, dev and CI images stay untouched, and busybox `wget` exists in the alpine runner. `/login` is SSR but cheap at healthcheck cadence. Record the deferral as resolved.
- **Secure on localhost production builds:** a local `docker run` of the image sets `Secure` cookies over plain http; Chrome treats `localhost` as trustworthy so local smoke tests still work — do not add a second env knob for this.
- **`tailscale serve` origin note:** serve proxies with the tailnet hostname preserved, so Next's server-action origin check holds; if a mismatch ever appears on the LXC, the fix is `serverActions.allowedOrigins`, not disabling the check — mention in README's troubleshooting line only if observed, do not pre-add config.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm test` -- expected: clean (no behaviour change for dev; cookie flags are additive).
- `docker compose -f deploy/compose.prod.yml --env-file <stub> config` -- expected: valid, every `${...}` resolved.
- Marker rehearsal: `docker run --rm -v <tmp-no-marker>:/bookeh-nas:ro -v <tmp-no-marker>/data:/var/lib/postgresql/data -v $PWD/deploy/postgres-entrypoint.sh:/bookeh-entrypoint.sh:ro --entrypoint sh postgres:16-alpine3.24 /bookeh-entrypoint.sh postgres` -- expected: refusal message, non-zero exit; re-run after `touch <tmp>/.bookeh-nas-mounted` -- expected: Postgres initialises and listens.
- Empty-database rehearsal: fresh local Postgres (ICU args, throwaway volume), `docker run` the 2.1 image with deploy-shaped env -- expected: migration log lines, seeded user, `curl -fsS http://localhost:<port>/login` serves, `curl -i -X POST .../api/users/login` → `Set-Cookie: payload-token=...; Secure`.
- `grep -n "Secure\|secure" src/collections/Users.ts "src/app/(frontend)/prefs.ts" "src/app/(frontend)/components/toast/flash.ts"` -- expected: the three production-gated flags.

**Manual checks (if no CLI):**
- On-LXC acceptance (NAS mounts, systemd unit, `tailscale serve`, phone reaching sign-in over HTTPS) cannot run from this machine; it is written as the checklist in `deploy/README.md` and performed by the operator.

## Auto Run Result

Status: done

**Summary.** Production deployment for story 2.2 as repo artifacts plus three code changes: `deploy/compose.prod.yml` (app pulled from GHCR, loopback-only port, NAS bind mounts, compose-level app healthcheck, log caps, ICU Postgres with a marker-guard entrypoint wrapper and `start_period`), `deploy/postgres-entrypoint.sh` (refuses every start without the NAS marker), `deploy/bookeh.service` (`RequiresMountsFor=/mnt/nas/bookeh`), `deploy/.env.example`, and `deploy/README.md` (operator procedure, GHCR token expiry slot, collation/restore note, troubleshooting, acceptance checklist). Code: `prodMigrations` wired into the adapter (production migrates at start, push off by the adapter's own gate), and the session, `bookeh_prefs` and `bookeh_flash` cookies `Secure` in production only. CI's publish smoke now boots the image against an empty database (exercising `prodMigrations` + seed) and requires `Secure` on the login cookie.

**Files changed.**
- [../../src/payload.config.ts](../../src/payload.config.ts) — `prodMigrations: migrations`.
- [../../src/collections/Users.ts](../../src/collections/Users.ts) — `auth.cookies.secure` production-gated.
- [../../src/app/(frontend)/prefs.ts](../../src/app/(frontend)/prefs.ts), [../../src/app/(frontend)/components/toast/flash.ts](../../src/app/(frontend)/components/toast/flash.ts) — same production-gated `secure` flag.
- [../../deploy/compose.prod.yml](../../deploy/compose.prod.yml) — production stack (new).
- [../../deploy/postgres-entrypoint.sh](../../deploy/postgres-entrypoint.sh) — NAS marker guard (new).
- [../../deploy/bookeh.service](../../deploy/bookeh.service) — systemd unit (new).
- [../../deploy/.env.example](../../deploy/.env.example) — deploy env template (new).
- [../../deploy/README.md](../../deploy/README.md) — operator procedure and acceptance checklist (new).
- [../../.dockerignore](../../.dockerignore) — `deploy` excluded from the image.
- [../../.github/workflows/ci.yml](../../.github/workflows/ci.yml) — publish smoke reworked (empty-DB migration path, Secure-cookie login check, comment fixes).
- [../../tests/unit/flashCookie.unit.spec.ts](../../tests/unit/flashCookie.unit.spec.ts), [../../tests/int/devicePrefs.int.spec.ts](../../tests/int/devicePrefs.int.spec.ts) — cookie-option assertions extended with the dev-side `secure: false`.
- [spec-2-1-k2-production-image.md](spec-2-1-k2-production-image.md) — 2.1's deferred healthcheck finding marked resolved here.

**Review findings breakdown.** 24 findings from 4 layers, grouped to 15 entries: 12 patched (5 medium: NAS data-dir ownership note, postgres `start_period`, env-file sourcing replaced with sed extraction, CI smoke exercising `prodMigrations`, CI smoke asserting the Secure cookie; 7 low: seed-variable compose defaults, observe-only healthcheck note, unclean-shutdown note, deploy-file update procedure, log caps, marker-test checklist wording, CI comment drift), 2 deferred (no repeatable deploy-artifact verification — low; on-LXC acceptance unperformed — medium unverified), 1 rejected low (`stop_grace_period` — self-healing WAL recovery, undemonstrated state, guard-adding fix), 4 rejected false (marker-in-data-directory literal reading unworkable and documented; expiry slot is the only faithful repo-side reading; "push is off" verified at the adapter gate; extras trace to recorded decisions).

**Follow-up review recommendation: true** (first pass patched 5 medium entries). Named unverified risk: the reworked publish smoke — empty service database, container-side `prodMigrations`, seed, `Secure` login grep — has never executed on a real GitHub runner; its failure mode is a red `publish` with nothing pushed, never a broken image shipping.

**Verification performed.** Lint and typecheck clean (9 pre-existing warnings, untouched files); unit 550/550, int 105/105 passing. `docker compose config` resolves warning-free with a full stub env and with the seed lines absent. Marker rehearsal: without the marker the wrapper logs the refusal and exits 1 with no `PG_VERSION`; with it, initdb runs and `pg_isready` answers. Empty-database rehearsal: the image built from this tree applied both migrations via `prodMigrations` on first request, seeded the first user, served `/login`, and `POST /api/users/login` returned `Set-Cookie: payload-token=…; Secure=true` (RFC 6265 parsers treat the attribute as set regardless of value); dev counterpart confirmed non-Secure. ci.yml and compose re-parsed as valid YAML. One pre-existing e2e failure (`admin.e2e.spec.ts` list-view URL, state-dependent on the shared dev database) reproduced on the clean baseline, is untouched by this diff, and is already covered by the Story 3.52/3.54 deferral.

**Residual risks.** The reworked publish smoke runs first on the next `main` push (red-job failure mode only). On-LXC acceptance — NAS mounts and ownership, systemd unit, `tailscale serve`, phone sign-in over tailnet HTTPS, env-file permissions — awaits the operator checklist in `deploy/README.md` (recorded in frontmatter `deferred`). `tailscale serve`'s preserved Host means Next's server-action origin check should hold; if a mismatch appears on the LXC, `serverActions.allowedOrigins` is the fix (Design Notes).
