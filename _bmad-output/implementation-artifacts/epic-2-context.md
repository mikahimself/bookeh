# Epic 2 Context: My catalogue runs in production and is backed up

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Get bookeh running in production on the Proxmox LXC behind `tailscale serve`, reachable from the phone over HTTPS on the tailnet, with Postgres data and media on NAS storage and nightly backups to the NAS. This epic exists so that real cataloguing of the ~200 books goes straight into the production database (the cataloguing gate requires it to be deployed) and so a dead disk never takes the catalogue with it. The restore rehearsal itself is deferred to the cataloguing gate, once real data exists.

## Stories

- Story 2.1: [K2] Production image
- Story 2.2: [K3] Production on the LXC
- Story 2.3: [K4] Nightly backups

## Requirements & Constraints

- Scale constraint: the deployment must support the committed single-user v1 while not ruling out hundreds of users and ~100,000 books later; exactly one app instance runs, because in-process state (rate limiter, Undo receipts, request-id memory) assumes it.
- Backups: database and uploads backed up nightly; backup files and paths readable by the operator account only; dumps older than a fixed retention are deleted so erased data ages out (retention in days is chosen in the backup story and written in `deploy/README.md`). One restore must be rehearsed and written down before Phase 1 is done — but at the cataloguing gate, not in this epic.
- Camera access requires HTTPS, so the phone reaches the app only through `tailscale serve`. v1 is tailnet-only; no public ingress, no monitoring stack, no service worker.
- Production Postgres, like every other environment, is initialised with `--locale-provider=icu --icu-locale=fi-FI` (Finnish collation) on the pinned `postgres:16-alpine3.24` image; changing the image tag later means a reindex and a collation-version refresh.
- Secrets hygiene: the env file holding the seed password and registry token is readable by the operator account only; the registry token is read-only and its expiry date is documented.
- In production all cookies (session, device preferences, flash) are `Secure`; dev on `http://localhost` keeps them non-Secure.

## Technical Decisions

- **Two environments, no staging**: local dev on the host against the Compose Postgres, and production on the LXC.
- **The LXC never builds.** CI (GitHub Actions) builds the image on every push to `main` after lint, typecheck and tests pass, and pushes it to GHCR tagged with the commit SHA and `latest`. The LXC runs `docker compose pull && docker compose up -d` with a read-only GHCR token.
- **Image**: `output: 'standalone'` in `next.config.ts`; Dockerfile copies `public/`, which exists since story 1.21 (PWA icons) and ships in the image; runs on `node:22.23.3-alpine`. The build downloads Open Sans, so it needs network; the running container makes no font or other outbound requests. The image must start locally against the Compose Postgres configured only by the variables in `.env.example`.
- **Production compose** (`deploy/compose.prod.yml`): app + Postgres with restart policy `unless-stopped`, Docker logs, exactly one app container. Migrations apply at start through `prodMigrations`; schema push is off. The first user is seeded by `onInit` from `SEED_EMAIL` / `SEED_PASSWORD` when `users` is empty.
- **NAS mounts are guarded**: Postgres data and the media directory bind-mount to NAS storage; the systemd unit uses `RequiresMountsFor`, and a marker-file check in the Postgres container's entrypoint (running on every start, including policy restarts) refuses to start on an empty local directory, so Postgres never initialises a fresh database because a mount was missing.
- **Backups** (`deploy/backup.sh` + systemd timer): nightly `pg_dump` in custom format plus a copy of the media directory to the NAS backup path, logging success or failure to the journal. The script refuses to dump, and logs an error, when the database has no users rows, so an empty database never overwrites good backups. A manual run must produce a dump `pg_restore --list` reads without error. Each run writes `last-backup.json` (time, outcome, dump size) to a path the app container can read — a later Settings story shows it to the admin and flags a backup older than 48 hours.
- **Operational docs** live in `deploy/README.md`: deploy steps, token expiry, retention days.
- Configuration via environment variables listed in `.env.example`; logging through the app's logger, no `console.*`.

## Cross-Story Dependencies

- Story 2.1 (image in GHCR) must land before Story 2.2 (the LXC only pulls, never builds).
- Story 2.3's `last-backup.json` is consumed by a later Settings story in Epic 5 (last backup shown to the admin); this story only has to write it somewhere the app container can read.
- The restore rehearsal belongs to the cataloguing gate (Story 4.10), once the first real books and covers exist — explicitly out of scope for Story 2.3.
- The cataloguing gate requires Epic 2 deployed before real data entry begins; until then, phone testing runs against dev via `tailscale serve` to the dev machine, so Epic 3 does not wait on this epic.
- The Secure-cookie behaviour in Story 2.2 implements an Epic 1 retrospective decision against the auth, preferences and flash cookies built in Epic 1.
