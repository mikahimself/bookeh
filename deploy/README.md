# Deploying bookeh on the LXC

This runbook takes a fresh Proxmox LXC to a running bookeh instance, and
covers updates, restores and troubleshooting afterwards.

## How the deployment works

- **CI builds, the LXC pulls.** Every push to `main` builds the production
  image, smoke-tests it and pushes it to `ghcr.io/mikahimself/bookeh`
  (Story 2.1). The LXC runs `docker compose pull` — it never builds and has
  no checkout of this repository.
- **Data lives on the NAS.** Postgres data and media uploads are
  bind-mounted from `/mnt/nas/bookeh` inside the LXC. A marker file guards
  every Postgres start so a missing mount can never initdb a fresh cluster
  onto an empty local directory.
- **Tailscale is the only way in.** The app port binds to `127.0.0.1`;
  `tailscale serve` provides tailnet-only HTTPS. Never `tailscale funnel`.
- **One app container, always** (AD-12). Payload's `onInit` seed and
  in-process assumptions are not safe to scale out. Do not add replicas.

Four machines appear below. Every command is tagged with where it runs:

| Tag | Machine |
|---|---|
| **[dev]** | Your development machine, with this repository checked out |
| **[NAS]** | The Synology, configured through DSM in a browser |
| **[host]** | The Proxmox host, as root |
| **[lxc]** | Inside the bookeh LXC, as root |

## Prerequisites

- **[lxc]** Docker with the compose plugin; Tailscale up and logged in.
- **[NAS]** A shared folder for Proxmox data (examples below use a share
  named `proxmox` with a `bookeh` folder inside it).
- A GitHub account that can read the `bookeh` package on GHCR.

## First-time setup

### 1. Export the NAS folder over NFS — [NAS]

In DSM:

1. Control Panel → File Services → NFS → enable NFS.
2. Control Panel → Shared Folder → the share → Edit → **NFS Permissions**
   → Create a rule for the Proxmox host's IP:
   - Privilege: **Read/Write**
   - Squash: **No mapping** — the Postgres image chowns its data directory
     as root on first start; with root squash that chown fails and Postgres
     never initialises. "No mapping" on a rule limited to the one host is
     the clean fix. (Alternative: keep squash on and pre-own the directory,
     step 3.)
   - Check **Allow users to access mounted subfolders** — without it,
     mounting the `bookeh` *subfolder* (rather than the share root) is
     denied even though the rule is otherwise correct.

### 2. Mount the NAS into the LXC — [host]

Mount the export on the Proxmox host, then bind it into the container
(an LXC does not see host mounts by itself).

Add to `/etc/fstab` (one line; replace the placeholders):

```
<nas-ip>:/volume1/<share>/bookeh  /mnt/nas/bookeh  nfs  nofail,x-systemd.automount,_netdev,timeo=14,retrans=2  0  0
```

Activate and verify:

```sh
systemctl daemon-reload
mount -a
findmnt /mnt/nas/bookeh    # must show the NFS source, not a local directory
```

Bind it into the container and restart it:

```sh
pct set <vmid> -mp0 /mnt/nas/bookeh,mp=/mnt/nas/bookeh
pct reboot <vmid>
```

Inside the container, `findmnt /mnt/nas/bookeh` **[lxc]** must now show the
NFS mount. The path matters: the systemd unit's `RequiresMountsFor` and the
compose file both expect `/mnt/nas/bookeh`.

### 3. Create the data directories and the marker file — [lxc]

```sh
mkdir -p /mnt/nas/bookeh/postgres/data /mnt/nas/bookeh/media
touch /mnt/nas/bookeh/postgres/.bookeh-nas-mounted
chown 1001 /mnt/nas/bookeh/media
```

- **The marker file** exists only on the real NAS. The Postgres container
  checks it on **every** start (entrypoint wrapper) and exits with an error
  instead of initdb-ing a fresh cluster when the mount is missing.
- **`media` must be owned by uid 1001** — the image's `nextjs` user — or
  uploads fail with EACCES.
- **If the NFS rule squashes root** (step 1 alternative): pre-own the data
  directory yourself with `chown 70 /mnt/nas/bookeh/postgres/data` (uid 70
  is the image's `postgres` user).

### 4. Copy the deploy files to the LXC — [dev]

The LXC has no checkout; the four files in `deploy/` travel by hand, now
and after every change to them (see "Updating the deploy files"):

```sh
cd <repo>/deploy
scp compose.prod.yml postgres-entrypoint.sh .env.example bookeh.service \
  root@<lxc>:/root/
```

(`<lxc>` is the container's Tailscale name or LAN IP. If the container has
no SSH yet, `pct push <vmid> <file> /root/<file>` from the Proxmox host
does the same.)

### 5. Install the deploy files — [lxc]

```sh
mkdir -p /opt/bookeh
cd /root
cp compose.prod.yml postgres-entrypoint.sh /opt/bookeh/
cp .env.example /opt/bookeh/.env
```

Fill in **every** variable in `/opt/bookeh/.env` (each is documented in the
file), then lock it down:

```sh
chmod 600 /opt/bookeh/.env
```

`bookeh.service` is installed in step 7, not under `/opt/bookeh`.

### 6. Log in to GHCR — [lxc]

Use a **read-only** token (classic PAT, scope `read:packages` only). Put it
in `.env` as `GHCR_TOKEN`/`GHCR_USER`, then log in reading the values out of
the file — extracting them rather than sourcing `.env`, so a secret
containing spaces, `$`, `#` or quotes never breaks or executes in the
shell, and the token never lands in shell history:

```sh
cd /opt/bookeh
sed -n 's/^GHCR_TOKEN=//p' .env | docker login ghcr.io \
  -u "$(sed -n 's/^GHCR_USER=//p' .env)" --password-stdin
```

**GHCR token expiry:** `__________` *(fill in when minting the token; mint
a new one before this date).*

### 7. Install and start the systemd unit — [lxc]

```sh
cp /root/bookeh.service /etc/systemd/system/bookeh.service
systemctl daemon-reload
systemctl enable --now bookeh
```

First start on an empty database: the app applies the migrations
(`prodMigrations`; schema push is disabled in production) and seeds the
first admin user from `SEED_EMAIL`/`SEED_PASSWORD`. **Clear both seed
variables from `.env` once that account exists.**

### 8. Expose over the tailnet — [lxc]

```sh
tailscale serve --bg http://127.0.0.1:3000
tailscale serve status
```

This gives tailnet-only HTTPS on the machine's tailnet name. All cookies
are `Secure` in production, so plain-HTTP access (other than via localhost)
will not hold a session — serve is the supported path.

Finish with the [acceptance checklist](#acceptance-checklist-run-on-the-lxc).

## Updating

### The app — [lxc]

```sh
cd /opt/bookeh
docker compose -f compose.prod.yml pull
docker compose -f compose.prod.yml up -d
```

(Or bump `BOOKEH_IMAGE_TAG` in `.env` to pin a specific CI commit-SHA tag
first; the default is `latest`.)

### The deploy files — [dev] then [lxc]

The files in `/opt/bookeh` are copies. After changing `compose.prod.yml` or
`postgres-entrypoint.sh` in the repo: copy them over again (step 4) and

```sh
cd /opt/bookeh && docker compose -f compose.prod.yml up -d
```

A change to `bookeh.service` also needs a re-copy to
`/etc/systemd/system/bookeh.service` followed by `systemctl daemon-reload`.

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

## Troubleshooting — [lxc]

- **Stack state:** `systemctl status bookeh` /
  `docker compose -f compose.prod.yml ps`; app logs with
  `docker compose -f compose.prod.yml logs app`.
- **Postgres exits immediately with a "NAS marker ... missing" log line:**
  the NAS is not mounted. Mount it and `systemctl restart bookeh`. The
  `restart: unless-stopped` policy retries harmlessly in the meantime — the
  wrapper refuses on every attempt and never initdbs a local directory.
- **App shows `unhealthy` in `ps` but keeps running:** the healthcheck only
  observes — `restart: unless-stopped` never restarts an
  unhealthy-but-running container. Restart it by hand:
  `docker compose -f compose.prod.yml restart app`.
- **After an unclean host shutdown**, dockerd's own restart policy can bring
  the containers up before the NAS mounts (`RequiresMountsFor` guards only
  the systemd start path). Symptom: the app is up but erroring with no
  database, Postgres is in the wrapper's refusal loop. Docker will also have
  auto-created local, root-owned directories under `/mnt/nas/bookeh` as bind
  sources — stop the stack, remove those leftover directories from the bare
  mountpoint, mount the NAS, then `systemctl restart bookeh`.
- **`mount.nfs: access denied by server`** (on the Proxmox host): the NFS
  permission rule on the Synology is missing, doesn't cover the host's IP,
  or lacks "Allow users to access mounted subfolders" (step 1).
  `showmount -e <nas-ip>` lists the exports and who may mount them.

## Acceptance checklist (run on the LXC)

- [ ] `systemctl enable --now bookeh` brings up both containers;
      `docker compose -f compose.prod.yml ps` shows app healthy and
      Postgres healthy.
- [ ] Marker test: stop the stack, unmount the NAS
      (`systemctl stop bookeh`, then `umount /mnt/nas/bookeh` — if the host
      fstab uses `x-systemd.automount`, also stop the automount unit on the
      **[host]**, e.g. `systemctl stop mnt-nas-bookeh.automount`, or it
      remounts on first access), then start Postgres directly with
      `docker compose -f compose.prod.yml up postgres` — **not** via
      `systemctl start bookeh`, whose `RequiresMountsFor` would remount the
      NAS first and the refusal would never fire → it logs the refusal and
      exits non-zero, and no `PG_VERSION` appears in the local mountpoint;
      remount, start again → Postgres is healthy on the NAS data.
- [ ] First start on an empty database: app logs show both migrations
      applied and the seed user created.
- [ ] `tailscale serve status` shows the proxy to `127.0.0.1:3000`.
- [ ] Phone on the tailnet reaches the sign-in page over HTTPS at the
      machine's tailnet name, and signing in works (the `payload-token`
      cookie is `Secure`).
- [ ] `curl http://<lxc-lan-ip>:3000` from another machine fails — the port
      is loopback-only.
