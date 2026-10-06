---
title: Rubric review — Bookie architecture spine
reviewed: ../ARCHITECTURE-SPINE.md
against: ../../../prds/prd-bookeh-2026-10-02/prd.md (Phase 1), addendum.md, CLAUDE.md, code at 7d34440
created: 2026-10-03
---

# Rubric review — ARCHITECTURE-SPINE.md

## Verdict

A strong spine with the right paradigm and the two PRD open questions (override mechanism, source combining) answered. It is not ready to slice into stories yet: no critical findings, but five high ones, four of them in the Book / override / shared-record core that most Phase 1 stories touch, and one in the test harness that every story ships against.

Counts: 0 critical, 5 high, 8 medium, 11 low.

## What was checked, and how

- Spine, PRD, addendum, CLAUDE.md, the architecture `.memlog.md`, and every file under `src/`, `tests/` and the repo root config.
- Installed versions read from `node_modules`: next 16.3.3, react 19.2.6, payload and `@payloadcms/db-postgres` 3.88.0, drizzle-orm 0.45.2, vitest 4.0.18, `@playwright/test` 1.58.2, typescript 5.7.3. All match the Stack table.
- npm registry: `next-intl@4.14.9` (peer `next ^16` ok), `tailwindcss@4.3.3`, `@zxing/browser@0.2.1` exist and are the current `latest`.
- Payload 3.88 features the spine relies on, confirmed in `node_modules`: `./drizzle` export of `@payloadcms/db-postgres`, `prodMigrations`, `afterSchemaInit`, compound `indexes` on collections, `generate:db-schema`, `login`/`logout` in `@payloadcms/next/auth`, push only when `NODE_ENV !== 'production'` (`db-postgres/dist/connect.js:110`).
- Running dev Postgres (`postgres:16-alpine`), read-only queries: ICU collations are present (`fi-x-icu` sorts `a,v,w,z,å,ä,ö`), `'ä' ILIKE 'a'` is false, the current database is libc `en_US.utf8` (sorts `ä` before `å`), and hasMany relationships live in `books_rels`.
- Not done: the Mermaid diagrams were checked by reading, not rendered (no Mermaid CLI installed).

## Findings

### High

**H1. AD-6 / AD-7 — relation-valued overrides are undecided, and `COALESCE` cannot express them** (checklist 1, 2, 9)

- FR-13 makes every review-screen field editable and FR-14 turns edits on a shared Book into overrides. Authors, series and genres are relationships. AD-6 says only "nullable override fields" declared in `bookFields.ts`; it never says whether relationships are in the overridable set.
- If they are: hasMany relationships are stored in `<collection>_rels` rows (confirmed: `books_rels`), so AD-7's `COALESCE(override, shared)` does not apply, and "no rows" cannot distinguish "not overridden" from "overridden to none". The ERD shows no `USER_BOOKS`–`AUTHORS`/`SERIES`/`GENRES` relation.
- If the user types an author that matches no shared record, AD-5 forbids creating a shared one from client input, and nothing says a private author is created instead.
- Four stories diverge on this: `user-books` collection, save, `EffectiveBook`, shelf.
- Smallest fix: add to AD-6 one of
  - (a) "Overridable set: the scalar fields plus `authors` and `series`. `user-books.overridden` lists the overridden field names; a relation override is in effect only when its name is listed. An override that names an author or series no readable record matches creates a private one (AD-4). Shelf uses `CASE WHEN` on `overridden` for relation fields and `COALESCE` for scalars." and add the relations to the ERD; or
  - (b) "Relationships are not overridable in Phase 1; review-screen changes to authors, series and genres on a shared Book are dropped with a notice." This narrows FR-13/FR-14 and needs Mika's agreement.

**H2. AD-5 — find-or-create scope lets a shared Book point at a private author or series** (checklist 2, 9)

- Rule text: "author and series by case-insensitive name among records the user can read". Records the user can read include their own private authors (AD-4). A source-found Book would then be created shared and linked to a private, client-typed author. That is exactly the planted data AD-5 says it prevents, and it contradicts FR-17 ("matched to existing shared records").
- Second gap in the same rule: FR-13 needs the review screen to show "new or already exists" before save, so the match runs twice (preview and save). Nothing forces both to use one matcher. Payload's `equals` is case-sensitive on Postgres, so each story would pick its own way to compare.
- Smallest fix: replace the parenthesis with "(Book by ISBN-13; for a shared Book, author and series among shared records only; for a private Book, shared first, then the user's own private, otherwise created private)" and add "Matching is `matchByName()` in `src/lib/catalogue`, comparing a stored lower-cased `nameKey`; the review preview and the save both call it."

**H3. AD-4 / AD-5 — private Book writes and ISBN auto-share contradict "shared values never come from the client"** (checklist 2, 6, 9)

- AD-4: auto-share "change[s] `visibility` and clear[s] `createdBy`; never cop[ies] rows". A private Book's values are the creator's typed values (AD-5, last sentence). Flipping the flag publishes them unchanged. FR-12 auto-share is in F2, so it is Phase 1.
- Not stated: who triggers auto-share (lookup is read-only under AD-9, so it has to be a save), and what save does when the scanned ISBN matches the user's own private Book (reuse and flip, or create a second shared Book beside it).
- Not stated: who writes a private Book. AD-5 denies users write access to *shared* records only. AD-11 puts creation in `catalogue`. A detail-page story (FR-26 inline editing) cannot tell whether editing one's own private Book updates the Book through the gateway, goes through `catalogue`, or writes overrides. If users get create/update access, `visibility` and `createdBy` need field-level protection that no AD mentions.
- Smallest fix: add to AD-5: "Users have no create, update or delete access on `books`, `authors`, `series`, `genres`, shared or private; every user-initiated write goes through `src/lib/catalogue`. Editing one's own private Book updates the Book; `user-books` overrides exist only for shared Books. On auto-share (a save whose ISBN matches the saver's private Book and a source), `catalogue` overwrites the Book with the merged source values and moves the creator's differing values to their overrides in the same transaction. Other users' private Books with that ISBN are left for an admin merge."

**H4. AD-1 / AD-7 — nothing constrains what a private row may point at** (checklist 1, 2)

- AD-1 scopes read, update and delete of a row by its `owner`, but says nothing about its relationships: `copies.location`, `loans.copy`, `loans.person`, `wishlist-entries.wishlist`, `wishlist-entries.forPerson`, `user-books.tags`, `users.defaultLocation`, and `copies.book` / `wishlist-entries.book` / `user-books.book`.
- Payload validates only that the id is well-formed unless the field has `filterOptions` (`payload/dist/fields/validations.js`, `validateFilterOptions`). A user can therefore save a copy that points at another user's location, or at another user's private Book.
- The second case is a real leak path: `src/lib/shelf` joins `books` with system privileges and scopes only by the copy's owner (AD-7), so the foreign private Book comes back as an `EffectiveBook`.
- No exploit with one seeded user, but each collection story ships an access test and each would decide this differently.
- Smallest fix: add to AD-1: "A relationship from a private collection to another private collection uses `ownedRelationship()` from `src/fields`, whose `filterOptions` is `owner = current user`. A relationship to `books` uses `bookRelationship()`, whose `filterOptions` is the AD-4 read constraint. Each collection's access test covers a foreign id."

**H5. Tests convention — no shared harness, no test database, no rule for faking sources** (checklist 1, 7)

- "Against real Postgres" does not say which database. `vitest.setup.ts` loads `.env`, so today's tests run against the dev database that holds the catalogue being built. `test.env` holds only `NODE_OPTIONS`.
- Every collection story writes an access test and needs the same things: a way to create two users, a way to call as a user, cleanup. Without a named helper each story invents one; Vitest runs files in parallel, so truncating tests and unique-ISBN tests will interfere.
- Adapters, merge, lookup, save and both Playwright flows depend on Finna and Google. Nothing says how they are faked. Headless Chromium has no camera, so "scan-to-save" has to go through manual ISBN entry; that is not stated either.
- `vitest.config.mts` includes only `tests/int/**/*.int.spec.ts`, so pure-function tests (`normaliseIsbn`, merge, the Finna parser) have no home.
- Smallest fix: extend the Tests row: "Tests run against database `bookeh_test` (`DATABASE_URL` in `test.env`), never the dev database. `tests/helpers/harness.ts` provides `createUser()` and `as(user)`; tests create their own rows and never truncate. No test reaches the network: adapters are tested against recorded responses in `tests/fixtures/<source>/`, and Playwright runs with the source list replaced by a fixture source and enters ISBNs by hand. Pure functions get `*.unit.spec.ts` beside the int tests."

### Medium

**M1. AD-13 — the rule does not prevent what it says it prevents, and the mechanism is unnamed** (checklist 2, 7)

- Tests run with `NODE_ENV=test`, so Payload pushes the schema (`connect.js:110`). A story with a missing or stale migration passes CI; "a story that works only under push" is not caught until production start.
- The standalone image has no Payload CLI and no TypeScript sources, so "applies migrations at container start" can only mean `prodMigrations` in `postgresAdapter` (present in 3.88, runs when `NODE_ENV === 'production'`). The same limit applies to `src/scripts/seed`: it cannot run in the production image, so how the seeded user reaches production is undecided.
- Smallest fix: add to AD-13: "Production uses `prodMigrations`. CI builds its database with `payload migrate` and runs the integration tests with `push: false`. When two stories both add a migration, the later one regenerates its migration after rebasing." Add to the deployment list: "The first user is created by `onInit` from `SEED_EMAIL` / `SEED_PASSWORD` when `users` is empty" (or name the admin first-user screen).

**M2. Design Paradigm diagram — missing edges for imports the ADs require** (checklist 8, 9)

"Arrows are the only allowed import directions", but:

- AD-3 lets `lib/catalogue` and `src/scripts` call Payload with system privileges. The only path to the Local API in the diagram is through the gateway, which "always passes … `overrideAccess: false`" (AD-2). There is no edge for the privileged path.
- AD-2 makes pages and server actions import `requireUser()` from `lib/payload`. The diagram has `FE --> SVC` only.
- AD-9 has lookup (in `lib/metadata`, per the source tree) return an existing shared Book. `META` has an edge only to `EXT`.
- The ISBN convention puts `normaliseIsbn` in `src/lib/metadata`, while "`src/collections` imports only from `src/access` and `src/fields`". An ISBN typed in the back office then cannot be normalised by the collection.
- Nothing is said about services importing each other (`wishlists` → `catalogue` for mark bought, `shelf` → `books` for the type), so cycles are unconstrained.
- The label `"lib/<domain> services"` contains a raw `<domain>`; Mermaid renders labels as HTML and is likely to drop it. Use `lib/{domain}`.
- Smallest fix: add edges `FE --> GW`, `META --> GW`, `SVC -. "catalogue, scripts: system privileges (AD-3)" .-> PL`; move `normaliseIsbn` to `src/fields`; add "Services may import `lib/books`, `lib/payload` and `lib/metadata`; `lib/catalogue` is imported only by server actions and `lib/wishlists`."

**M3. AD-11 — the receipt is client-held input to a system-privileged delete, and covers only creations** (checklist 2, 9)

- The receipt "list[s] the ids it created" and comes back from the browser. Undo runs in `catalogue` with system privileges and deletes shared Books and authors, which have no owner to scope by, so AD-3's "scopes by [the acting user] explicitly" cannot be met. A forged receipt deletes any unreferenced shared record.
- A save can also change things it did not create: closing a wishlist entry on mark bought (FR-28) and the auto-share flip (H3). The receipt cannot undo those, and the spine does not say Undo is not offered there.
- AD-11 lists the cover among documents created "in one Payload transaction". The download in AD-14 is network and file I/O; held inside the transaction it keeps a connection open for the length of a remote fetch, and a rollback leaves the file.
- Smallest fix: "The receipt is an opaque id. Its contents (created ids, closed entry ids) stay server-side in process, keyed by user, with a short lifetime (AD-12). The cover is downloaded before the transaction opens; a rolled-back save deletes the file."

**M4. AD-4 and Deferred "Genre curation" — the genre contract is open across four Phase 1 stories** (checklist 3, 9)

- AD-4 gives `genres` a `visibility` split. The PRD defines a genre as "a shared, curated classification"; only authors and series can be private (FR-17). AD-5 and AD-11 create Books, authors and series, never genres.
- Deferred sends "how source subjects map to it" to "the genre story". Until then the save story, the review screen (FR-13 "whether each … genre is new or already exists"), the shelf genre filter (FR-25) and `bookFields` each have to guess whether save attaches genres and where the mapping lives.
- Smallest fix: remove `genres` from AD-4's Binds and state in AD-5: "Genres are always shared and created only by the admin or seed. Save attaches the genres returned by `matchGenres(subjects)` in `src/lib/catalogue` and never creates one; it returns none until the genre story fills it in." Keep only the seeding and mapping table under Deferred.

**M5. AD-10 / AD-14 — `media` has no access rule, and authenticated covers break `next/image`** (checklist 1, 2, 7)

- `media` is in neither the private list (AD-1) nor the shared-or-private list (AD-4). The existing collection is `read: () => true`. The Visibility preamble requires per-object authorisation "including uploaded files", and a private Book's cover is private.
- The bundled Next docs state the image optimiser "will not forward headers when fetching the `src` image" (`node_modules/next/dist/docs/01-app/03-api-reference/02-components/image.md:87`). Once `media` read needs a session, `<Image src="/api/media/file/…">` fails. `next.config.ts` already allows that path for `next/image`, so a screen story will reach for it.
- `coverUrl()` fixes the URL but not the element, so screens can still differ.
- Smallest fix: add to AD-14: "`media` read requires a signed-in user; create and delete only through `src/lib/catalogue` or by the admin. Covers render only through `<Cover>` in `(frontend)/components`, a plain `<img>` (no `next/image` optimiser). The download URL is always taken from the server-held source response, never from the client."

**M6. Frontend conventions — no route seed, no list contract, tokens owned by documents that do not exist** (checklist 1, 3, 7)

- Screen stories link to each other, but only `/login`, `/scan` and `/check` appear (in the capability map). The book detail route is the one every list links to, and it is unspecified whether it is keyed by Book id or copy id (FR-26 implies Book).
- Home, collection and search all page through `lib/shelf` at up to 10,000 copies. Page size, offset or cursor, the return shape, and whether filters live in the URL are not fixed.
- Deferred: "Visual design and tokens. Owned by the UX documents". There are none under `_bmad-output/planning-artifacts`. "Design tokens in one CSS file" names no file and no owning story; shared components (toast, chip, cover, field) have no owner either.
- Frontmatter lists `STORY-SLICING.md` as a companion; the file does not exist.
- Smallest fix: add a route list to the Structural Seed (`/`, `/login`, `/scan`, `/check`, `/books`, `/books/[bookId]`, `/loans`, `/wishlists`, `/settings`); add to AD-7 "returns `{ items, total }` by `page` and a fixed page size; filters, sort and page are URL search params"; name the token file (`src/app/(frontend)/styles.css`, which exists) and a foundation story that owns tokens and shared components; move UX tokens to an Open Questions section until the UX documents exist; write or drop the companion.

**M7. Authorisation of `users` is silent** (checklist 7)

- AD-2 binds "all collections", but the only statement about `users` is the Roles row. Missing: who reads a user document (self and admin), who updates it, and that `roles` is writable only by an admin. Without the last one a user can make themselves admin through the profile update.
- FR-4's default location is a relationship from `users` to `locations`; it appears in no AD and not in the ERD.
- Smallest fix: extend the Roles row: "A user reads and updates only their own document; admin reads all. `roles` is writable only by admin. `users.defaultLocation` is an `ownedRelationship()` to `locations`."

**M8. Deferred "Database-level uniqueness for shared ISBN" — a race exists with one user** (checklist 3)

- The reason given is "when a second user makes concurrent saves possible". A double-tap on Save, or a retry after a slow response, is two concurrent saves from one user; the scan loop is built for speed. Find-or-create inside two transactions creates two shared Books for one ISBN, and the duplicate can only be repaired by the Phase 3 merge.
- Smallest fix: add the partial unique index now through `afterSchemaInit` (available in 3.88): unique on `isbn13` where `visibility = 'shared'`. One line in AD-4, and the Deferred item goes away.

### Low

**L1. FR-19 is not mapped.** Admin re-fetch that fills empty fields only is part of F2 (Phase 1). The layer table says the back office is "generated. Theme only", so no place exists for the action. Fix: map it to a function in `src/lib/catalogue` run from `src/scripts`, or list it under Deferred with a reason.

**L2. AD-2 and AD-3 wording.** AD-2: "No page, action or service filters by user id as its means of authorisation"; AD-3 requires exactly that in `catalogue` and `shelf`. Add "except the modules in AD-3".

**L3. AD-1 and AD-4 on `createdBy`.** AD-1 lists `createdBy` as naming drift; AD-4 introduces `createdBy` on purpose. Say in AD-4 that it is a different field (provenance of a private catalogue record, cleared on promotion). The Deferred line "AD-1 makes them a walk over `owner`" should add "and `createdBy`", since the Account lifecycle table deletes private Books too.

**L4. AD-6 null semantics.** "Nullable override fields … override if set" means a user cannot override a value to empty (remove a wrong subtitle). State that this is accepted, or use the `overridden` list from H1(a) for scalars as well.

**L5. AD-7 scope.** The rule covers queries on "a user's copies". The loans view (FR-37) and the wishlist page (FR-39) list rows that show Book fields and are not copies. Add: "`lib/books` exposes `effectiveBooks(ids)` for lists of loans and wishlist entries; those lists do not sort or filter on Book fields." Also say whether shelf rows are `EffectiveBook` or a narrower type declared in `lib/books`.

**L6. AD-8 omits the wishlist entry's state.** FR-28 "closes" an entry; the memlog records a `closed` field; the spine does not. Add "a closed entry keeps its row with `closedAt`" so the wishlist story and the mark-bought service agree.

**L7. AD-9 details.** (a) Lookup returns "an existing shared Book" but not the user's own private Book with that ISBN, and not the user's effective values for a Book they already hold; the review screen needs both for FR-16. (b) `source` for a manually entered Book is not named (`manual`).

**L8. AD-15 has no fallback locale.** `/login` has no signed-in user. Add "before sign-in the locale comes from `Accept-Language`, defaulting to `fi`".

**L9. ERD omissions against the ADs.** Owner edges are drawn only for `COPIES` and `USER_BOOKS`; AD-1 gives six more collections an owner. `createdBy` (AD-4) and `USERS`–`LOCATIONS` (default location) are missing. Either draw them or add a note that owner and `createdBy` edges are omitted.

**L10. Finnish collation depends on every database being initialised alike.** The dev database today is libc `en_US.utf8` and sorts `ä` before `å`. The spine covers dev ("recreated once") and production, but not the CI service container or the test database, and nothing fails if one is wrong. Fix: add `POSTGRES_INITDB_ARGS` to CI in the deployment list, and one integration test in `lib/shelf` asserting `a < z < å < ä < ö`. (`COLLATE "fi-x-icu"` is available in the image as a fallback.)

**L11. Scaffold items the spine relies on but does not ratify or flag** (checklist 5)

- `playwright.config.ts` starts the server with `pnpm dev`; the repo uses npm (`package-lock.json`) and the spine says `npm run dev`.
- CI runs "typecheck"; `package.json` has no such script.
- The `Dockerfile` copies `/app/public`; there is no `public/` directory, so the image build fails even with `output: 'standalone'` added.
- AD-10 disables GraphQL; `src/app/(payload)/api/graphql/route.ts` and `graphql-playground/route.ts` must be deleted along with setting `graphQL.disable`.
- `eslint.config.mjs` has `no-explicit-any` as `warn`; the Types convention needs `error` (with an override for `rawMetadata`). The import rules of AD-2, AD-3 and the paradigm section are enforceable with `no-restricted-imports`; naming that in the spine would make them checked instead of reviewed.
- The deployment diagram assumes GitHub; the repo has no remote and no `.github/`. The memlog notes it, the spine does not.
- Stack table: `@zxing/browser@0.2.1` has peer `@zxing/library ^0.23.0`, and Tailwind 4 on Next needs `@tailwindcss/postcss`; neither is listed.
- `tailscale serve` in front of server actions: Next compares `Origin` with the forwarded host; note `serverActions.allowedOrigins` as the setting to use if the check fails.

## Checklist summary

| # | Criterion | Result |
| --- | --- | --- |
| 1 | Fixes the real divergence points | Misses: relation overrides (H1), cross-owner references (H4), test harness (H5), media element and access (M5), routes and list contract (M6) |
| 2 | Rules enforceable and matching Prevents | Fail on AD-5 (H2, H3), AD-13 (M1), AD-11 (M3); AD-2/AD-3 enforceable only by review until lint rules are named (L11) |
| 3 | Deferred cannot cause Phase 1 divergence | Three can: genre curation (M4), shared-ISBN uniqueness (M8), visual tokens (M6) |
| 4 | Technology plausible and current | Pass. All versions verified installed or on npm; Payload and Postgres features confirmed. Two peer packages unlisted (L11) |
| 5 | Ratifies the staying codebase | Mostly. Stack, tree, test folders and Dockerfile base match. Gaps in L11 |
| 6 | Covers Phase 1 capabilities | Mostly. FR-19 unmapped (L1); FR-12 auto-share under-specified (H3); FR-13 relation edits (H1) |
| 7 | Every dimension decided, deferred or open | Data, state mutation, integration, deployment, infrastructure, operations: decided. Gaps: authorisation of `users` and `media` (M7, M5), testing harness (H5), frontend routes (M6). No Open Questions section exists; UX tokens belong there |
| 8 | Diagrams valid and consistent | Syntax valid by reading (not rendered). Dependency diagram misses four required edges (M2); ERD omissions (L9, H1) |
| 9 | Internal consistency | Contradictions: AD-5 vs its own Prevents (H2), AD-4 auto-share vs AD-5 (H3), AD-4 genres vs AD-5/AD-11 (M4), AD-2 vs AD-3 wording (L2), AD-1 vs AD-4 on `createdBy` (L3) |

## Suggested order of fixes

1. H1, H2, H3 together: they are one paragraph each in AD-4, AD-5 and AD-6 and settle the Book / override / shared-record model.
2. H4 and M7: two field factories in `src/fields` and one line on `users`.
3. H5 and M1: the Tests row and AD-13.
4. M2 to M6, M8: diagram edges, receipt, genres, media, routes, index.
5. Low items as wording passes.
