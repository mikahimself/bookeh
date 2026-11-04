# bookeh

A personal catalogue for physical books, mostly Finnish-language. Scan a
barcode, fetch the metadata by ISBN, track where each copy is, keep wishlists.
One PWA for web and phone, self-hosted and reachable over a tailnet.

## Stack

- Payload CMS 3 on Next.js, in TypeScript, with Postgres 16
- A custom frontend in `src/app/(frontend)`; Payload admin at `/admin` as the back office
- Tailwind CSS 4 and Base UI; `@zxing/browser` for scanning
- Metadata from Finna, Google Books, Open Library and Hardcover, with Finnish fiction themes from Kirjasampo
- Docker Compose on one Proxmox LXC, with Tailscale for access

Requirements, architecture and UX live under `_bmad-output/planning-artifacts/`;
`CLAUDE.md` links them.

Kirjasampo work metadata is provided by the Finnish Public Libraries and SeCo under
[CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Its public dataset
omits copyrighted back-cover synopses.

## Setup

The Node version is in `.nvmrc`.

```sh
cp .env.example .env            # set PAYLOAD_SECRET: openssl rand -hex 32
docker compose up -d postgres
npm ci
npm run dev
```

The app is at <http://localhost:3000>. Create the first user at `/admin`, or
set `SEED_EMAIL` and `SEED_PASSWORD` in `.env` before the first start and
clear them once the account exists: left set, they recreate an admin on any
emptied database. `docker-compose.yml`'s `payload` service is the alternative to
the host; it reinstalls `node_modules` with `npm ci` on every start.

**Dev data is not safe across schema changes.** A running `next dev` pushes
schema changes to the dev `bookeh` database. When a change would lose data,
it prompts, and accepting that prompt truncates dev tables. Decline it unless
the data can go.

## Deployment

Production setup, updates, backups and restore: [deploy/README.md](deploy/README.md).

## Database

Postgres runs from `docker-compose.yml` as `postgres:16-alpine3.24`, initialised with
`--locale-provider=icu --icu-locale=fi-FI`. Finnish ICU collation is the cluster
default so that `ORDER BY` on text sorts a, o, z, å, ä, ö without `COLLATE` on
every query (NFR-7, AD-7). The libc `C`/`en_US.utf8` locale would put ä between
a and å. Every database created in the cluster inherits the locale from
`template1`, including `bookeh_test`, which `docker/postgres/initdb/create-test-db.sql`
creates on first start. CI mirrors this with the same image and init args and a
`createdb bookeh_test` step.

**Tests.** `npm run test:unit` runs `tests/unit/**/*.unit.spec.ts` with no
database (a unit spec must import nothing that opens one). `npm run test:int`
runs `tests/int/**/*.int.spec.ts` on `bookeh_test` on the server named by
`DATABASE_URL`, never the dev `bookeh` database. `npm test` runs all three
lanes.

The int and e2e lanes run on a migration-built `bookeh_test` with push off.
Each starts with `scripts/test-db.ts`, which applies the committed migrations
to `bookeh_test`. If `bookeh_test` has been schema-pushed (its
`payload_migrations` has a `batch = -1` row), the script refuses at once and
names `npm run test:reset`, which drops and recreates its schema `public` and
empties `media-test`.
`DATABASE_PUSH=true npm run test:int` pushes instead (skipping the migrate),
and the next default run is refused until the reset.

**End-to-end.** `npm run test:e2e` starts its own `next dev` on :3100 (build
directory `.next-e2e`, so a dev server on :3000 can keep running) against
`bookeh_test` with push off and `BOOKEH_SOURCES=fixture`: lookups answer from
`tests/fixtures/finna/`, no network. Before the server starts it runs
`scripts/test-db.ts` (above) and `tests/e2e/seed.ts`, which signs up the e2e
user and removes the previous run's Book. Once per machine:
`npx playwright install chromium`.

**Existing dev volume.** Init args only apply to an empty data directory. A
`bookeh_pgdata` volume created before this change keeps its libc locale, and
`tests/int/collation.int.spec.ts` fails against it. Recreate the volume once
(everything in it is lost; recreate the admin user at `/admin`):

```sh
docker compose rm -sf postgres && docker volume rm bookeh_pgdata && docker compose up -d postgres
```

Check with:

```sh
docker compose exec postgres psql -U bookeh -d bookeh -Atc \
  "select datname, datlocprovider, daticulocale from pg_database"
```

`bookeh`, `bookeh_test` and `template1` should show `i` and `fi-FI`.

**Changing the image tag.** This applies to tag changes within Postgres 16; a
major upgrade is a `pg_upgrade` or dump-and-restore job first. A new image may
carry a new ICU version, which can change sort order and silently corrupt text
indexes. After moving to a new tag (in `docker-compose.yml` and
`.github/workflows/ci.yml` together), check whether the recorded and actual
collation versions differ:

```sql
select datname, datcollversion, pg_database_collation_actual_version(oid) from pg_database;
```

If they do, reindex and refresh. New databases copy `template1`'s version, so
refresh it and `postgres` too:

```sql
REINDEX DATABASE bookeh;
ALTER DATABASE bookeh REFRESH COLLATION VERSION;
REINDEX DATABASE bookeh_test;
ALTER DATABASE bookeh_test REFRESH COLLATION VERSION;
ALTER DATABASE template1 REFRESH COLLATION VERSION;
ALTER DATABASE postgres REFRESH COLLATION VERSION;
```

**Resetting the test database.** Tests never delete their rows, and the lanes
refuse a schema-pushed `bookeh_test`. `npm run test:reset` drops and recreates
its schema `public` and empties `media-test`, the lanes' media directory; the
next lane migrates it again.

**Migration check in CI.** CI runs
`payload migrate:create ci_drift_check --force-accept-warning` with stdin
closed and fails when the snapshot it writes differs from the newest committed
one, apart from `id` and `prevId` (a schema change without its migration, or a
new snapshot format). It fails too when no snapshot was written: the command
stopped at a prompt. CI also runs the int and e2e lanes as they run locally:
migrations applied to the empty `bookeh_test`, push off. Its "Check push stayed
off" step then fails on a `batch = -1` row. To reproduce locally:
`npm run test:reset && npm test`. For a red drift check, run
`npm run payload -- migrate:create <name> --skip-empty` locally and commit the
generated `.ts`, `.json` and `index.ts` under a real migration name. If CI
says `migrate:create wrote no migration` (a rename prompt), or the diff shows
only a new snapshot format (`--skip-empty` then writes nothing), run
`npm run payload -- migrate:create <name>` interactively, without
`--skip-empty` and with stdin open, answer the prompt (for a format-only
change, yes to the blank migration), then commit the generated `.ts`, `.json`
and `index.ts`.
