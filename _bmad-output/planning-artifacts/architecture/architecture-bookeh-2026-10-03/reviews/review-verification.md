# Verification review — ARCHITECTURE-SPINE.md

Reviewed: 2026-10-03. Scope: every technical claim in the spine checked against `node_modules`, project files, the npm registry, official docs, and (for Postgres) a live container. The spine was not modified.

## Verdict

The spine's technical claims hold: all but one checked out against installed code or official docs, and the Finnish collation claim was confirmed by running it. The problems are of a different kind: the Stack table pins versions that are accurate but already carry published security advisories, and three decisions (migrations at start, ICU on a floating image tag, server actions for reads) leave out a mechanism or caveat that a story would otherwise have to rediscover.

Legend: **Confirmed** / **Wrong** / **Could not confirm**. Paths are relative to the repo root unless they start with `node_modules/`.

## Problems, ranked

| # | Severity | Where | Problem | Smallest correction |
| --- | --- | --- | --- | --- |
| P1 | High | Stack: Next.js 16.3.3, Payload 3.88.0 | Both match what is installed, and both have security fixes published since. Next: critical RCE in `next/og` fixed in 16.3.6 (GHSA-vcvr-r3jv-pc5j), high SSRF in Image Optimization fixed in 16.3.8 (GHSA-cjq9-62q9-8jv4; the project configures `images.localPatterns`). Payload 3.90.0 is a "critical security fixes" release: auth token field handling (GHSA-66wr-7vmr-p5jq, critical), weak PBKDF2 iterations (GHSA-q6mq-ch85-c8mm), upload validation and lockout issues. 3.90 also adds columns (`resetPasswordRequestedAt`, `_objectKey`) and so needs a migration. Tailnet-only and one user lower the exposure, which is why this is not rated critical. | Stack table: Next.js `16.3.8`, Payload packages `3.90.2`. Do the bump before the first committed migration (AD-13), so the baseline already contains the new columns. Compatibility checked: `@payloadcms/next@3.90.2` peers `next >=16.3.3 <17`; `@payloadcms/db-postgres@3.90.2` still ships `drizzle-orm 0.45.2`. |
| P2 | Medium | Stack: `node:22.17.0-alpine` | 22.17.0 was released 2025-06-24. Five 22.x security releases have followed (22.17.1, 22.22.0, 22.22.2, 22.23.0, 22.23.2); current is 22.23.3 (2026-09-23). Node 22 is in maintenance LTS, so staying on 22 is fine; the patch pin is the issue. | Stack table and `Dockerfile:4`: `node:22.23.3-alpine` (tag exists on Docker Hub). |
| P3 | Medium | AD-13, Deployment seed ("runs migrations at start") | The mechanism is not named, and the obvious one does not work: the standalone image contains no `payload` CLI. The supported way is `prodMigrations` on `postgresAdapter`, which runs when the adapter connects with `NODE_ENV=production`. Also, nothing in the spine exercises the committed migrations: integration tests run under push (push is active whenever `NODE_ENV !== 'production'`), so "a story that works only under push" is not actually prevented. Payload docs warn against mixing push and `payload migrate` on one database; `migrate` on a pushed database stops at an interactive prompt. | AD-13 rule, add: "Production applies them through `prodMigrations` (imported from `src/migrations`). `payload migrate` is never run against a dev database. CI applies the committed migrations to an empty database." |
| P4 | Medium | Stack: `postgres:16-alpine` with ICU as the database default | The claim is correct (see C-PG below), but the tag floats across Alpine releases: Docker Hub shows `16-alpine` moving through alpine3.20, 3.21, 3.22, 3.23 and 3.24 between May 2025 and September 2026. Each Alpine bump can change the ICU version. With ICU as the default collation, every text index depends on it; after a bump Postgres reports a collation version mismatch and indexes need `REINDEX` plus `ALTER DATABASE … REFRESH COLLATION VERSION`. | Stack table: pin `postgres:16-alpine3.24`. Deployment seed, add one line: "Changing the Postgres image base means reindex and refresh collation version." |
| P5 | Low | AD-10 ("client-initiated reads (scanner lookup) are server actions") | Works, but the bundled Next.js docs say Server Functions are "designed for server-side mutations", are dispatched one at a time per client, and recommend a Route Handler for non-mutation requests. A slow lookup therefore blocks the next action (a save, or the next scan) from the same client. | AD-10, add: "Server actions run one at a time per client, so lookup is bounded by the AD-9 timeouts. If lookups must overlap, use a route handler under `(frontend)` outside `/api`." |
| P6 | Low | AD-2 ("return `where` constraints, not booleans, wherever the answer depends on the row") | Only `read`, `update` and `delete` accept a `where`. `create` (also `admin`, `unlock`, `readVersions`) is boolean-only, and a `where` returned from `create` is silently treated as "allow": `executeAccess` only tests truthiness and the create operation discards the result. | AD-2: "…return `where` constraints for read, update and delete. Create access returns a boolean." |
| P7 | Low | AD-7 with AD-11 | `payload.db.drizzle` is the pool-level handle. It does not take part in a Payload transaction; the transaction's handle is `payload.db.sessions[transactionID].db`. A shelf query issued inside the save transaction would not see that transaction's rows. | AD-7, add: "Shelf queries run outside transactions." |
| P8 | Low | AD-15 ("locale is the signed-in user's profile language") | The login page has no signed-in user, so the rule gives no locale there. | AD-15, add: "Before sign-in the locale comes from `Accept-Language`, falling back to `en`." |
| P9 | Low | AD-10 ("GraphQL is disabled") | `graphQL: { disable: true }` is real and makes the handler return 404, but the generated route files stay, and the playground condition still renders it in dev. `graphql` remains a required peer dependency of `payload` and `@payloadcms/next`, so it cannot be removed from `package.json`. | AD-10: "GraphQL is disabled (`graphQL.disable`) and the `api/graphql` and `api/graphql-playground` route folders are deleted." |
| P10 | Low | Stack: `@zxing/browser 0.2.1` | Has a peer dependency on `@zxing/library ^0.23.0`, which is not listed. | Stack row: "@zxing/browser 0.2.1 with @zxing/library 0.23.0". |
| P11 | Low | Deployment seed (phone testing through `tailscale serve`, GHCR token, LXC) | Three omitted prerequisites: `next dev` blocks requests from a non-localhost origin unless `allowedDevOrigins` lists the ts.net hostname; GHCR accepts only a classic personal access token (`read:packages`), not a fine-grained one, and that token can read every package the account can; Tailscale in an unprivileged LXC needs `/dev/net/tun` passed through, and Serve needs HTTPS certificates enabled for the tailnet. | Add to the Deployment bullets: "`allowedDevOrigins` for the dev ts.net host; GHCR pull uses a classic PAT with `read:packages`; the LXC passes through `/dev/net/tun`." |
| P12 | Low | Deployment seed ("image build needs `output: 'standalone'`") | Correct, and incomplete: `Dockerfile:52` copies `/app/public`, which does not exist in the repo, so the build fails there too. | Same bullet: "…and a `public/` directory (needed for PWA icons anyway)." |

## Claim-by-claim results

### Stack table

| Claim | Result | Evidence |
| --- | --- | --- |
| TypeScript 5.7.3 | Confirmed | `package.json:47`; `node_modules/typescript/package.json`. npm `latest` is 7.0.2; staying on 5.7.3 is a choice, not an error (Next minimum is 5.1). |
| Node 22, image `node:22.17.0-alpine` | Confirmed, out of date (P2) | `Dockerfile:4`. `docker-compose.yml:3` uses `node:22-alpine` for dev; host Node is 22.16.0. Release data: nodejs.org/dist/index.json. |
| Next.js 16.3.3 | Confirmed, out of date (P1) | `package.json:29`. npm `latest` 16.3.8. Advisories: github.com/vercel/next.js/security/advisories; `npm audit` reports `next` critical for 16.2.0–16.3.5. |
| React 19.2.6 | Confirmed | `package.json:31`. npm `latest` 19.3.0; no action needed. |
| Payload 3.88.0 (four packages) | Confirmed, out of date (P1) | `package.json:22-30`. npm `latest` 3.90.2. Release notes: github.com/payloadcms/payload/releases/tag/v3.90.0. |
| Drizzle ORM 0.45.2 via `@payloadcms/db-postgres/drizzle` | Confirmed | `node_modules/drizzle-orm/package.json`; `@payloadcms/db-postgres` depends on exactly `0.45.2`; the `./drizzle` export is `export * from 'drizzle-orm'` (`node_modules/@payloadcms/db-postgres/dist/drizzle-proxy/index.js`). Sub-exports `./drizzle/pg-core`, `./drizzle/node-postgres`, `./drizzle/relations` exist too. |
| PostgreSQL 16, `postgres:16-alpine`, ICU `fi-FI` | Confirmed (P4 for the tag) | `docker-compose.yml:22`. Live test below. `POSTGRES_INITDB_ARGS` is not set yet in the compose file, which the spine already treats as work to do. |
| Tailwind CSS 4.3.3 (to add) | Confirmed | npm `latest` 4.3.3, published 2026-09-25; `@tailwindcss/postcss` 4.3.3. No Next or React peer constraint. |
| next-intl 4.14.9 (to add) | Confirmed | npm `latest` 4.14.9, published 2026-10-02 (one day old). Peers: `next ^16.0.0`, `react ^19.0.0`. |
| @zxing/browser 0.2.1 (to add) | Confirmed (P10) | npm `latest` 0.2.1, published 2026-07-06. Peer `@zxing/library ^0.23.0`. No React or Next coupling; browser-only, so it belongs in a client component. |
| Vitest 4.0.18 | Confirmed | `package.json:49`. npm `latest` 5.0.3. |
| Playwright 1.58.2 | Confirmed | `package.json:36`. npm `latest` 1.63.0. |
| Docker Compose v2 | Confirmed | Local `docker compose version` reports v2.32.4. |
| GitHub Actions and GHCR | Confirmed | See Deployment below. No `.github/` directory exists yet. |

Compatibility of the "to add" set with Next 16.3.3 / React 19.2.6: confirmed by peer ranges above; the same ranges cover 16.3.8.

### Payload facts the ADs rely on

| Claim | AD | Result | Evidence |
| --- | --- | --- | --- |
| Local API defaults to `overrideAccess: true` | AD-2 | Confirmed | `node_modules/payload/dist/collections/operations/local/find.js:5` (`overrideAccess = true`), same in `create.js:7`; `find.d.ts:54-58` (`@default true`). Docs: payloadcms.com/docs/local-api/access-control. |
| `user` is honoured with `overrideAccess: false` | AD-2 | Confirmed | `find.d.ts:146-148`. Docs example passes both. |
| Collection access can return a `where` | AD-1, AD-2, AD-4 | Confirmed for read, update, delete (P6 for create) | `node_modules/payload/dist/config/types.d.ts:231` (`AccessResult = boolean \| Where`); `auth/executeAccess.js`; `collections/operations/create.js:71-74`. Docs: payloadcms.com/docs/access-control/collections. |
| `access.admin` on the auth collection gates the admin panel | Roles convention, F10 | Confirmed | `node_modules/payload/dist/collections/config/types.d.ts:455-458`: boolean only, receives `req`. It gates the panel only; REST under `/api` stays reachable to any signed-in user and is governed by collection access, which is consistent with AD-2. |
| `payload.db.drizzle` exists with the Postgres adapter | AD-7 | Confirmed (P7) | `node_modules/@payloadcms/db-postgres/dist/types.d.ts:79` and the `declare module 'payload'` augmentation at `:84-89`, so it is typed. Tables are on `payload.db.tables`; `payload generate:db-schema` exists (`node_modules/payload/dist/bin/index.js:14`) if typed tables are wanted, which would add one more generated file to the Story size convention. |
| One transaction across several Local API calls | AD-5, AD-11 | Confirmed | `const id = await payload.db.beginTransaction()`, pass `req: { transactionID: id }` to each call, then `payload.db.commitTransaction(id)` or `rollbackTransaction(id)`. Docs: payloadcms.com/docs/database/transactions. Helpers `initTransaction`, `commitTransaction`, `killTransaction` are exported (`node_modules/payload/dist/index.d.ts:631,654,659`). `req.transactionID` type: `types/index.d.ts:63`. |
| Uploads inside the save transaction roll back cleanly | AD-11, AD-14 | Could not confirm | The database row rolls back. Whether the file already written to the media directory is removed on rollback was not established; `deleteAssociatedFiles` runs on document delete, and no rollback cleanup was found. Worth one assertion in the save story's integration test. |
| GraphQL can be disabled in config | AD-10 | Confirmed (P9) | `node_modules/payload/dist/config/types.d.ts:1024-1025`; `node_modules/@payloadcms/next/dist/routes/graphql/handler.js:88-92` returns 404. Route files present: `src/app/(payload)/api/graphql/route.ts`, `api/graphql-playground/route.ts`. |
| Push in dev, migrations in production | AD-13 | Confirmed (P3) | `node_modules/@payloadcms/db-postgres/dist/connect.js:110` (push only when `NODE_ENV !== 'production'`), `:116-119` (`prodMigrations` run when `NODE_ENV === 'production'`). Interactive prompt on a pushed database: `node_modules/@payloadcms/drizzle/dist/migrate.js:30-31`. Docs: payloadcms.com/docs/database/migrations ("do not mix 'push' and migrations with your local development database"; `prodMigrations` "should only be used for long-running servers / containers", which matches AD-12). |
| Unique compound index on (owner, book) | AD-6 | Confirmed | `indexes: [{ unique: true, fields: ['owner', 'book'] }]`: `node_modules/payload/dist/collections/config/types.d.ts:565-573, 731-734`; built in `node_modules/@payloadcms/drizzle/dist/schema/build.js:191-220`. Works for single, non-polymorphic relationship fields, which both are. |
| Partial unique index for shared ISBN (Deferred) | Deferred | Confirmed with a caveat | `indexes` cannot express a `WHERE` clause. It has to be added through `afterSchemaInit` (`node_modules/@payloadcms/db-postgres/dist/types.d.ts:15`), otherwise push and `migrate:create` do not know about it. |
| Upload file URLs are under `/api/<slug>/file/` | AD-10, AD-14 | Confirmed | `node_modules/payload/dist/uploads/generateFilePathOrURL.js:21`; endpoint `uploads/endpoints/index.js:13`. `next.config.ts:13` already allows `/api/media/file/**`. Default storage directory is the slug (`collections/config/sanitize.js:209`), so `/app/media` in the container is what the NAS mount targets. |
| Sign-in without REST | AD-2, AD-10 | Confirmed | `@payloadcms/next/auth` exports `login`, `logout`, `refresh` server functions (`node_modules/@payloadcms/next/dist/auth/`); `payload.auth({ headers })` exists (`node_modules/payload/dist/index.d.ts:248`). |

### next-intl without locale routes

Confirmed. The docs have a dedicated setup "without i18n routing": `src/i18n/request.ts` exports `getRequestConfig`, which returns `{ locale, messages }`; the locale may come from "user preferences or other application logic", and the configuration page lists "fetch a user setting, read from `cookies()`, `headers()`". It runs once per request through React `cache`. Sources: next-intl.dev/docs/getting-started/app-router/without-i18n-routing, next-intl.dev/docs/usage/configuration. No `[locale]` segment and no proxy file are needed. Two consequences: reading the user makes every frontend route dynamic (already true, since they need the session), and `next.config.ts` has to compose `createNextIntlPlugin` with `withPayload`. See P8 for the login page.

### Tailwind CSS 4 beside the Payload admin

Confirmed. The bundled Next docs give the v4 setup (`tailwindcss` + `@tailwindcss/postcss`, `@import 'tailwindcss'`): `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md:22-60`. Isolation holds because `(frontend)` and `(payload)` have separate root layouts (`src/app/(frontend)/layout.tsx`, `src/app/(payload)/layout.tsx`) and navigation between root layouts is a full page load (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route-groups.md:30`), so a stylesheet imported only by the frontend layout never reaches `/admin`. Payload's own styles sit in `@layer payload-default` (`node_modules/@payloadcms/next/dist/prod/styles.css`). Payload's website template at v3.88.0 uses exactly this combination (Tailwind ^4.1.18 imported from `(frontend)/globals.css`).

Conditions that make it true: Tailwind is imported only from the frontend layout, never from `(payload)/custom.scss`. Two notes, neither a problem: Tailwind 4 needs Safari 16.4 or later, so the phone needs iOS 16.4+ (tailwindcss.com/docs/compatibility); automatic source detection scans the whole repo, including `_bmad/` and `(payload)`, which can be narrowed with `source()` (tailwindcss.com/docs/detecting-classes-in-source-files).

### Postgres ICU `fi-FI` (C-PG)

Confirmed by running it. A throwaway `postgres:16-alpine` container (PostgreSQL 16.15) started with `POSTGRES_INITDB_ARGS="--locale-provider=icu --icu-locale=fi-FI"`:

- `pg_database`: `datlocprovider = i`, `daticulocale = fi-FI`, encoding UTF8. initdb logged `Using language tag "fi-FI"`.
- `ORDER BY` on text gave: `aamu oja saari šakki vesi wau üle yö zeta Zorro åker äiti Äänekoski öljy Örn`. å, ä, ö sort after z, in that order; ü sorts with y, as Finnish expects.
- `'a' ILIKE 'ä'` is false; `'ä' ILIKE 'Ä'` is true; `'Äiti ja isä' ILIKE '%äiti%'` is true; `'saari' ILIKE '%šaari%'` is false.

So AD-7's "sort relies on the database's ICU collation; `ILIKE` with no accent folding" is accurate. The initdb arguments only apply when the cluster is created, so "existing dev volumes are recreated once" is also right, and the CI Postgres service needs the same arguments. See P4 for the floating tag.

### Next.js 16 (bundled docs)

| Claim | Result | Evidence |
| --- | --- | --- |
| Server actions for mutations | Confirmed | `node_modules/next/dist/docs/01-app/02-guides/server-actions.md`; `01-getting-started/07-mutating-data.md`. Each action is a public POST endpoint and must authenticate itself (`server-actions.md:78, 89`), which is what `requireUser()` in AD-2 does. |
| Server actions for client-initiated reads | Confirmed with a caveat (P5) | `server-actions.md:26-30`; `07-mutating-data.md:207`. |
| `output: 'standalone'` | Confirmed | `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/output.md:24-48`. Not set yet in `next.config.ts`; `Dockerfile:60` depends on it. See P12. |
| `app/manifest.ts` | Confirmed | `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md:20-47`. It goes at the root of `src/app`, outside both route groups. |
| PWA installable without a service worker | Confirmed | `node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md:592-597`: a valid manifest and HTTPS are the two requirements; line 93: install prompts work "without needing offline support". MDN agrees: service workers are "not a requirement for a PWA to be installable"; Chromium needs `name` or `short_name`, 192px and 512px icons, `start_url`, `display` (developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable). On iOS installation is always manual, through the Share menu. |
| Single instance, no shared encryption key needed | Confirmed | `node_modules/next/dist/docs/01-app/02-guides/self-hosting.md:191-197`: a stable `NEXT_SERVER_ACTIONS_ENCRYPTION_KEY` is only needed across multiple instances. Consistent with AD-12. |

Not relied on by the spine, worth knowing: in Next 16 the `middleware` file convention is deprecated and renamed `proxy` (`03-file-conventions/proxy.md:11`).

### Deployment

| Claim | Result | Evidence |
| --- | --- | --- |
| GitHub Actions builds and pushes to GHCR | Confirmed | docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images: `docker/login-action` with `ghcr.io`, `github.actor`, `secrets.GITHUB_TOKEN`; `permissions: packages: write`. |
| Private image pulled on the LXC with a read-only token | Confirmed (P11) | docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry: "GitHub Packages only supports authentication using a personal access token (classic)"; `read:packages` to pull. |
| `tailscale serve` gives HTTPS to a local port | Confirmed (P11) | tailscale.com/kb/1312/serve: `tailscale serve 3000` proxies to `127.0.0.1:3000` at `https://<machine>.<tailnet>.ts.net`, tailnet only; requires HTTPS certificates enabled. LXC requirement: tailscale.com/kb/1130/lxc-unprivileged. |
| Camera needs HTTPS; `localhost` also works | Confirmed | Secure-context rule; MDN page above lists `localhost` as exempt. Phone testing against dev needs `allowedDevOrigins` (`node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/allowedDevOrigins.md`). |

## Not checked

- Finna and Google Books endpoints (AD-9). They are in CLAUDE.md, not asserted as verified in the spine, and the lookup story is told to inspect raw output first.
- Camera permission behaviour of `@zxing/browser` inside an installed iOS home-screen app. Needs a device.
- Whether `tailscale serve` forwards `Host` so that the server-action origin check passes. Expected to work; confirm on first deploy.
