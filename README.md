# Payload Blank Template

This template comes configured with the bare minimum to get started on anything you need.

## Quick start

This template can be deployed directly from our Cloud hosting and it will setup MongoDB and cloud S3 object storage for media.

## Quick Start - local setup

To spin up this template locally, follow these steps:

### Clone

After you click the `Deploy` button above, you'll want to have standalone copy of this repo on your machine. If you've already cloned this repo, skip to [Development](#development).

### Development

1. First [clone the repo](#clone) if you have not done so already
2. `cd my-project && cp .env.example .env` to copy the example environment variables. You'll need to add the `MONGODB_URL` from your Cloud project to your `.env` if you want to use S3 storage and the MongoDB database that was created for you.

3. `npm install && npm run dev` to install dependencies and start the dev server
4. open `http://localhost:3000` to open the app in your browser

That's it! Changes made in `./src` will be reflected in your app. Follow the on-screen instructions to login and create your first admin user. Then check out [Production](#production) once you're ready to build and serve your app, and [Deployment](#deployment) when you're ready to go live.

#### Docker (Optional)

If you prefer to use Docker for local development instead of a local MongoDB instance, the provided docker-compose.yml file can be used.

To do so, follow these steps:

- Modify the `MONGODB_URL` in your `.env` file to `mongodb://127.0.0.1/<dbname>`
- Modify the `docker-compose.yml` file's `MONGODB_URL` to match the above `<dbname>`
- Run `docker-compose up` to start the database, optionally pass `-d` to run in the background.

### Database

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
`DATABASE_URL`, never the dev `bookeh` database. `npm run test:e2e` still uses
the dev server and its database until Story 3.52.

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

**Resetting the test database.** Tests never delete their rows, so a later
schema push that would lose data prompts and exits silently in a test worker.
Reset with `DROP DATABASE bookeh_test; CREATE DATABASE bookeh_test;` (inherits
`template1`'s locale).

**Migration check in CI.** CI fails when `payload migrate:create --skip-empty`
would write a file (a schema change without its migration), applies the
committed migrations to the empty `bookeh_test`, and runs the int tests with
`DATABASE_PUSH=false`, so they use the migration-built schema. To reproduce
locally: reset `bookeh_test`, then
`DATABASE_URL=postgres://bookeh:bookeh@localhost:5432/bookeh_test npm run payload -- migrate`
and `DATABASE_PUSH=false npm run test:int`. For a red drift check, run
`npm run payload -- migrate:create <name> --skip-empty` locally and commit the
generated `.ts`, `.json` and `index.ts` under a real migration name.

## How it works

The Payload config is tailored specifically to the needs of most websites. It is pre-configured in the following ways:

### Collections

See the [Collections](https://payloadcms.com/docs/configuration/collections) docs for details on how to extend this functionality.

- #### Users (Authentication)

  Users are auth-enabled collections that have access to the admin panel.

  For additional help, see the official [Auth Example](https://github.com/payloadcms/payload/tree/3.x/examples/auth) or the [Authentication](https://payloadcms.com/docs/authentication/overview#authentication-overview) docs.

- #### Media

  This is the uploads enabled collection. It features pre-configured sizes, focal point and manual resizing to help you manage your pictures.

### Docker

Alternatively, you can use [Docker](https://www.docker.com) to spin up this template locally. To do so, follow these steps:

1. Follow [steps 1 and 2 from above](#development), the docker-compose file will automatically use the `.env` file in your project root
1. Next run `docker-compose up`
1. Follow [steps 4 and 5 from above](#development) to login and create your first admin user

That's it! The Docker instance will help you get up and running quickly while also standardizing the development environment across your teams.

## Questions

If you have any issues or questions, reach out to us on [Discord](https://discord.com/invite/payload) or start a [GitHub discussion](https://github.com/payloadcms/payload/discussions).
