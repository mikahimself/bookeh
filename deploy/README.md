# Deploying bookeh on the LXC

The LXC never builds anything. CI builds the image and pushes it to
`ghcr.io/mikahimself/bookeh` (Story 2.1); the LXC pulls it and runs it next
to Postgres with Docker Compose. Postgres data and media uploads live on the
NAS. Access is tailnet-only HTTPS via `tailscale serve` — never
`tailscale funnel`, and the app port is bound to `127.0.0.1` so serve is the
sole way in.

One app container, always (AD-12): Payload's `onInit` seed and in-process
assumptions are not safe to scale out. Do not add replicas.

## First-time setup

Prerequisites on the LXC: Docker with the compose plugin, Tailscale up, and
the NAS mounted at `/mnt/nas/bookeh` (fstab or a systemd mount unit — the
service refuses to start without it via `RequiresMountsFor`).

1. **NAS directories and the marker file.** On the mounted NAS:

   ```sh
   mkdir -p /mnt/nas/bookeh/postgres/data /mnt/nas/bookeh/media
   touch /mnt/nas/bookeh/postgres/.bookeh-nas-mounted
   chown 1001 /mnt/nas/bookeh/media
   ```

   - The marker file exists only on the real NAS. The Postgres container
     checks it on **every** start (entrypoint wrapper) and exits with an
     error instead of initdb-ing a fresh cluster onto an empty local
     directory when the mount is missing.
   - `media` must be owned by **uid 1001** — the image's `nextjs` user —
     or uploads fail with EACCES.
   - The Postgres entrypoint chowns `data/` to **uid 70** (the image's
     `postgres` user) as root before initdb. On NFS with `root_squash` or a
     fixed-uid CIFS mount that chown fails: export the share without
     `root_squash`, or pre-own the directory yourself
     (`chown 70 /mnt/nas/bookeh/postgres/data`).

2. **Install the deploy files** to `/opt/bookeh`:

   ```sh
   mkdir -p /opt/bookeh
   cp compose.prod.yml postgres-entrypoint.sh /opt/bookeh/
   cp .env.example /opt/bookeh/.env
   ```

   Fill in `/opt/bookeh/.env` (every variable), then lock it down:

   ```sh
   chmod 600 /opt/bookeh/.env
   ```

3. **Log in to GHCR** with a **read-only** token (classic PAT, scope
   `read:packages` only), reading it from the env file so it never lands in
   shell history:

   Extract only the two values rather than sourcing `.env` — a secret
   containing spaces, `$`, `#` or quotes would break or execute in the shell:

   ```sh
   cd /opt/bookeh
   sed -n 's/^GHCR_TOKEN=//p' .env | docker login ghcr.io \
     -u "$(sed -n 's/^GHCR_USER=//p' .env)" --password-stdin
   ```

   **GHCR token expiry:** `__________` *(fill in when minting the token;
   mint a new one before this date).*

4. **Install and start the systemd unit:**

   ```sh
   cp bookeh.service /etc/systemd/system/bookeh.service
   systemctl daemon-reload
   systemctl enable --now bookeh
   ```

   First start on an empty database: the app applies the migrations
   (`prodMigrations`; push is disabled in production) and seeds the first
   admin user from `SEED_EMAIL`/`SEED_PASSWORD`. Clear both seed variables
   from `.env` once that account exists.

5. **Expose over the tailnet:**

   ```sh
   tailscale serve --bg http://127.0.0.1:3000
   tailscale serve status
   ```

   This gives tailnet-only HTTPS on the machine's tailnet name. All cookies
   are `Secure` in production, so plain-HTTP access (other than via
   localhost) will not hold a session — serve is the supported path.

## Updating

```sh
cd /opt/bookeh
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d
```

(Or bump `BOOKEH_IMAGE_TAG` in `.env` to pin a specific CI sha tag first.)

### Updating the deploy files

The files in `/opt/bookeh` are copies: after changing `compose.prod.yml` or
`postgres-entrypoint.sh` in the repo, re-copy them to `/opt/bookeh` and
`docker compose -f compose.prod.yml up -d`. A change to `bookeh.service`
also needs a re-copy to `/etc/systemd/system/bookeh.service` followed by
`systemctl daemon-reload`.

## Collation and restore (read before any restore)

The production cluster must be initialised with the same
`POSTGRES_INITDB_ARGS: --locale-provider=icu --icu-locale=fi-FI` as dev
(NFR-7, AD-7). initdb args apply **only to an empty data directory** — they
do nothing to an existing cluster.

A restore is the trap: `pg_dump` output carries the database's locale
settings only when restored with `-C` (create the database from the dump).
Restoring into a database that was created **without** the ICU args silently
keeps libc collation, and Finnish sorting is wrong with no error anywhere.
When rebuilding from a dump: start from an empty `data/` directory so initdb
runs with the ICU args, or create the target database with the dump's `-C`
output — never into a pre-created plain database.

Also: the `postgres:16-alpine3.24` tag pins the ICU library. Moving to a new
tag may ship a new ICU, which requires `REINDEX` and
`ALTER DATABASE ... REFRESH COLLATION VERSION` on every database.

Note: `docker/postgres/initdb/` from the repo is **not** mounted here on
purpose — `bookeh_test` is a dev/CI artifact.

## Troubleshooting

- `systemctl status bookeh` / `docker compose -f compose.prod.yml ps` for
  stack state; `docker compose -f compose.prod.yml logs app` for the app.
- Postgres exits immediately with a "NAS marker ... missing" log line: the
  NAS is not mounted. Mount it and `systemctl restart bookeh`. The
  `restart: unless-stopped` policy retries harmlessly in the meantime —
  the wrapper refuses on every attempt and never initdbs a local directory.
- App shows **unhealthy** in `ps` but keeps running: the healthcheck only
  observes — `restart: unless-stopped` never restarts an unhealthy-but-
  running container. Restart it by hand:
  `docker compose -f compose.prod.yml restart app`.
- After an **unclean host shutdown**, dockerd's own restart policy can bring
  the containers up before the NAS mounts (`RequiresMountsFor` guards only
  the systemd start path). Symptom: the app is up but erroring with no
  database, Postgres is in the wrapper's refusal loop. Docker will also have
  auto-created local, root-owned directories under `/mnt/nas/bookeh` as bind
  sources — stop the stack, remove those leftover directories from the bare
  mountpoint, mount the NAS, then `systemctl restart bookeh`.

## Acceptance checklist (run on the LXC)

- [ ] `systemctl enable --now bookeh` brings up both containers;
      `docker compose -f compose.prod.yml ps` shows app healthy and
      Postgres healthy.
- [ ] Marker test: `umount /mnt/nas/bookeh` (stack stopped), then start
      Postgres directly with `docker compose -f compose.prod.yml up postgres`
      — **not** via `systemctl start bookeh`, whose `RequiresMountsFor`
      would remount the NAS first and the refusal would never fire → it logs
      the refusal and exits non-zero, and no `PG_VERSION` appears in the
      local mountpoint; remount, start again → Postgres is healthy on the
      NAS data.
- [ ] First start on an empty database: app logs show both migrations
      applied and the seed user created.
- [ ] `tailscale serve status` shows the proxy to `127.0.0.1:3000`.
- [ ] Phone on the tailnet reaches the sign-in page over HTTPS at the
      machine's tailnet name, and signing in works (the `payload-token`
      cookie is `Secure`).
- [ ] `curl http://<lxc-lan-ip>:3000` from another machine fails — the port
      is loopback-only.
