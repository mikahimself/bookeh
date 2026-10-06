---
stepsCompleted: [step-01-validate-prerequisites, step-02-design-epics, step-03-create-stories, step-04-final-validation]
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/prd.md
  - _bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/STORY-SLICING.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md
  - _bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md
  - _bmad-output/specs/spec-bookeh/SPEC.md
---

# bookeh - Epic Breakdown

## Overview

This document provides the complete epic and story breakdown for bookeh (Bookie in the planning documents), decomposing the requirements from the PRD, UX Design and Architecture requirements into implementable stories.

**Scope.** Only Phase 1 (v1: one seeded user, tailnet only) is committed and gets epics. Every PRD requirement is listed below with its phase so nothing is lost; Phase 2 and Phase 3 items are traceability only and must not be built. Where documents disagree, the PRD decides what is built, the architecture spine how, and the UX documents how it looks and behaves.

## Requirements Inventory

### Functional Requirements

Phase tags follow the PRD Build Order. **P1** = Phase 1 (committed), **P2** / **P3** = possible later phases (not built), **P1-constraint** = not a feature in v1, but v1 must not rule it out.

**F1 — Accounts and access**

- FR-1 [P1]: Users sign in with email and password. Every page requires a signed-in user, except shared wishlist links (FR-41).
- FR-2 [P2]: The admin creates an invite as a single-use link that expires after 7 days and hands it over by hand. The invitee sets email, password and profile. No email is sent.
- FR-3 [P1-constraint]: No self-registration in v1. The account model must allow adding an OAuth provider and open registration later without migrating existing users.
- FR-4 [P1]: The profile holds display name, email (read-only in Phase 1), interface language, optional default location, profile visibility (public | hidden, default hidden) and collection visibility (open | closed, default closed). All six are built in v1 (decision D-1); the two visibility settings have no effect until friends exist.
- FR-5 [P2]: A user who forgets their password gets a single-use, expiring, rate-limited reset link from the admin.
- FR-6 [P2]: Users can change their email address. In Phase 1 the email is shown and cannot be changed.
- FR-7 [P2]: Users can see their active sessions and sign out of any or all of them.
- FR-8 [P2]: Users can export all their own data in a portable format.
- FR-9 [P2]: Users can delete their account; the admin can deactivate or delete any account (Account lifecycle table).

**F2 — Adding a book**

- FR-10 [P1]: Scan an ISBN barcode with the phone camera inside the installed app, including iOS Safari, or type it. ISBN-10, ISBN-13, hyphens and spaces are accepted and normalised to ISBN-13.
- FR-11 [P1]: Lookup reuses an existing shared Book for the ISBN, otherwise tries metadata sources in configured order (Finna, Google Books, others). Adding a source needs no change to the add-book flow. Lookup is read-only (a Book is created only on save), requires sign-in, is rate-limited per user; any debug lookup endpoint is admin-only.
- FR-12 [P1]: If no source finds the book, the user enters it by hand with title and author as the only required fields; the result is a private Book. It becomes shared through admin approval or automatically when a later external lookup matches its ISBN. Books without an ISBN are never merged automatically.
- FR-13 [P1]: A book is saved as fetched and edited afterwards; no review step. The Answer has a cover preview, names the original source (never another user), and says whether each author and series is new or existing. The edit screen pre-fills and allows editing every field plus personal tags; it is reached from the save toast and from Book detail. From the save toast it also shows the new copy's status and location.
- FR-14 [P1]: On a shared Book, a user's edits are stored as their overrides and the Book keeps the source's values; **an admin's edits change the shared Book itself** (decision D-8). On a private Book, the creator's values are the Book's values.
- FR-15 [P1]: Saving shows a toast with Edit and Undo and returns to the scanner. Undo removes the copy or entry plus any Book, author or series nothing else references. Undo is also offered after move, tag change, mark read, lend, Returned, Received, and bought/ordered on a wishlist entry. Removals are confirmed and have no Undo. A failed save shows an error toast and leaves the screen as it was.
- FR-16 [P1]: If the user already owns a copy of the edition, the Answer says so and lists the copies, but still allows adding another.
- FR-17 [P1]: Authors and series are matched to existing shared records by name, ignoring case, and created if missing; those created from a private Book stay private. Genres come from Google Books categories: matched by name to a seeded genre list with English and Finnish names, and created on save when missing. The admin adds Finnish names, adds genres, and merges or deletes duplicates (decision D-2). These **system genres** are shared and not overridable; each user can add their own **user genres** to a Book alongside them (D-6). Personal tags, user genres and user themes are matched within the user's own and can be renamed, merged and deleted.
- FR-17a [P1, new]: A shared Book stores Finna's subject terms as **themes**, a field separate from genres. Themes are shown on Book detail as Filter chips and are a collection filter. Finna's themes are source data only, not overridable; each user can add their own **user themes** to a Book alongside them (decisions D-3, D-6).
- FR-18 [P1]: The raw source response is stored with the Book for re-parsing, and never shown to other users.
- FR-19 [P1]: Only the admin can re-fetch metadata for a shared Book. Re-fetch fills empty fields only.

**F3 — Shop check**

- FR-20 [P1]: Scan a barcode or search by title, author or ISBN. Search covers the user's collection, friends' open collections (P2) and external sources, never the rest of the shared catalogue. The result shows the Book's basic details and every applicable fact, the first as heading: In library · location; In friend's library (P2); Ordered; Wishlist.
- FR-21 [P1]: For a Book the user doesn't own, the result offers Add to wishlist (pick a list) and Add to library (owned copy at the default location), with no rescan.
- FR-22 [P1]: If no source finds the ISBN, the user enters title and author and can still add to a wishlist or the library.

**F4 — My collection**

- FR-23 [P1]: The app opens in the user's collection; there is no home screen. Scan book is within reach on every section.
- FR-24 [P1]: Search the collection by title, author, series or ISBN, or by free text across those fields and notes.
- FR-25 [P1]: Filter and sort the collection by any metadata field: author, series, genre, theme (FR-17a), personal tag, publisher, year, language, page range, status, location, read, rating. Filters combine with AND. Filters and sort use the user's overrides. On an opened Book, author, series, genres, tags and location are shortcuts that add a filter.
- FR-26 [P1]: Book detail shows the user's copies, wishlist entries, loans, read flag, rating, notes and personal tags. Read, rating, notes and tags change in place; Book fields change on the edit screen.
- FR-27 [P1]: Overrides are visible only to the user who made them, everywhere the Book appears for that user. Changing a shared value is a suggestion (FR-45, P3).
- FR-28 [P1]: Copy status is ordered or owned. Ordered is set on the edit screen right after adding, or from a wishlist entry. Received turns ordered into owned at the default location. Marking a wishlist entry bought or ordered closes it and creates a copy if the entry is for the user; for another Person it closes without a copy.
- FR-29 [P1]: Each user can mark a Book read and give an optional 1–5 rating; both belong to the user and the Book, not a copy.
- FR-30 [P1, partial]: A user can own several copies of the same edition. Adding a Book from a friend's open collection without scanning is P2.

**F5 — Locations**

- FR-31 [P1]: Each user keeps a private list of locations, adds new ones inline, and can rename, merge and delete them.
- FR-32 [P1]: Locations are optional; a user with no locations sees no location fields.
- FR-33 [P1]: Select several copies and in one action change location, add or remove a tag, mark read or unread, or remove them (removal confirmed).

**F6 — People and loans**

- FR-34 [P1]: Each user keeps a private People list. People can be renamed and merged; a Person with loans or wishlist entries cannot be deleted.
- FR-35 [P1]: Lend an owned copy to a Person with a lending date. A copy has at most one open loan and keeps its location while lent.
- FR-36 [P1]: Returned closes the loan; loan history is kept.
- FR-37 [P1]: A loans view lists what is out, with whom and since when, by person or by date, with returned loans below. Search results and Book detail show who has a lent copy.

**F7 — Wishlists**

- FR-38 [P1]: Several named wishlists. An entry can be marked for a Person (empty means for the user); the recipient can be set any time after adding.
- FR-39 [P1]: The wishlist page shows all lists with a count each; opening a list shows its entries with recipients.
- FR-40 [P3]: Wishlists are private by default; a list can be shared with chosen friends in the app or by link.
- FR-41 [P3]: Share links: read-only, no sign-in, entry title/author/cover from shared or approved data plus owner's display name, recipients hidden unless enabled, several revocable links per list with optional expiry, stop working on revoke, list deletion or owner deactivation/deletion.

**F8 — Friends and visibility**

- FR-42 [P2]: Friend requests by exact email (same response whether or not an account exists), by name for public profiles; accept, decline, unfriend, block; rate-limited with a 30-day wait after decline; emails never shown to non-friends.
- FR-43 [P2]: Collections are open or closed; friends see an open collection's owned copies only, never ordered copies, wishlists, locations, loans, notes, overrides or tags.
- FR-44 [P2]: Every revocation takes effect on the next request and re-establishing does not restore earlier shares.

**F9 — Curation**

- FR-45 [P3]: Users suggest fixes to shared Books, authors, series or genres (field, merge, cover); rate-limited, visible to suggester and admin only.
- FR-46 [P3]: Admin reviews suggestions, approves or rejects; can promote a private Book and merge Books, authors or series. Approved fixes drop equal overrides; merges move everything to the survivor.
- FR-47 [P3; upload and crop pulled into P1 by D-4]: Users upload a cover (size-limited image, metadata stripped), visible only to them until approved; then an alternative cover anyone can pick. Phase 1 builds upload with a 2:3 crop for the admin (sets a shared Book's cover) and for a private Book's creator (sets that Book's cover); non-admin uploads on shared Books, approval and alternative covers stay P3.

**F10 — Administration**

- FR-48 [P2, partly enforced in P1]: The admin role covers accounts, invites, the suggestion queue and shared records, not users' private data. Roles must allow a moderator role later. (AD-1 already denies admin access to private collections in Phase 1.)
- FR-49 [P2]: The back office is reachable only over the tailnet; admin actions are logged. (Phase 1 is tailnet-only anyway.)

**F11 — Platform**

- FR-50 [P1]: The app installs as a PWA on iOS and Android and works in desktop browsers.
- FR-51 [P1]: Interface in English and Finnish, chosen per user; all interface text is localisable from the start.
- FR-52 [P1-constraint]: No email delivery in v1. Invites and resets work through links and notifications appear in the app. The account model must allow adding email later.

**Visibility table and Account lifecycle (PRD)**: Phase 1 enforces the owner and admin columns (private data readable and writable only by its owner; admin excluded; private Books, authors and series readable only by creator and admin). Friend, other-user and share-link columns and the account lifecycle are Phase 2–3.

### NonFunctional Requirements

- NFR-1 [P1] Shop-check speed: scan to result on 4G in ≤ 2 s when the Book is known to the user, ≤ 5 s from an external source.
- NFR-2 [P1] Entry speed: scan to save under 20 s per book when the fetched data needs no edits.
- NFR-3 [P1] Search speed: search and filter results in under 1 s for a collection of 10,000 copies.
- NFR-4 [P1-constraint] Scale: supports hundreds of users and about 100,000 Books without redesign.
- NFR-5 [P2] Security before public exposure: HTTPS only; rate limiting on sign-in, reset, invites, friend requests, suggestions, lookup and share links; account-existence not revealed; share tokens ≥ 128 random bits; share pages no-referrer and noindex; private views not cached beyond the session; other users' text and images treated as untrusted. (Phase 1 builds the lookup rate limit and HTTPS via `tailscale serve`.)
- NFR-6 [P1] Backups: database and uploads backed up nightly, restore tested at least once, backups accessible to the operator only.
- NFR-7 [P1] Finnish text: Finnish collation for sorting; case-insensitive search that treats å, ä, ö as letters of their own ("a" never matches "ä").
- NFR-8 [P2] Personal data: users' data, including about People, can be exported and erased on request. (Phase 1 keeps it possible: every private row has an `owner`, every private catalogue row a `createdBy`.)

**Phase 1 success metrics (Done criteria):** all ~200 books catalogued with locations; no duplicate purchases after cataloguing; "where is it?" under 10 s from the phone; shop check within NFR-1; adding a book under 20 s. Counter-metric: more than one book in ten needing a manual correction after saving means the shared data costs more than it saves.

### Additional Requirements

From the architecture spine (AD-1 to AD-20, conventions, stack, deployment) and STORY-SLICING. These bind every story.

**Starting point (no starter template).** The project is brownfield on its own scaffold: Payload 3.88 + Next.js 16.3.3 + Postgres 16 on Docker Compose (`f8f104e`), with old single-copy collections (`7d34440`) that are replaced, not migrated. The first stories:

- Bump Next.js to 16.3.8, Payload to 3.90.2, the Node image to `node:22.23.3-alpine` (security fixes; before the first migration).
- Push the repo to GitHub; CI workflow with lint, typecheck, migrations on an empty database, integration tests against a Postgres service, image build; add a `typecheck` script; fix `pnpm` in the Playwright config.
- Remove the old collections and their tests; disable GraphQL and delete its routes.
- Close the known scaffold gaps: `output: 'standalone'` missing; Dockerfile copies a non-existent `public/`; `no-explicit-any` is only a warning; `Media` has `read: () => true`.

**Layering and lint**

- Layered modular monolith: surface (`app/(frontend)`) → services (`src/lib/*`) → data and authorisation (`collections`, `access`, `fields`) → Postgres. Import directions are enforced by ESLint `no-restricted-imports`, including the one-way rules between services and "client components import only types and `lib/shelf/query.ts`".
- `no-explicit-any` is an error; `any` only for `rawMetadata`.
- Screens import Base UI only through wrappers in `components/ui`; ESLint enforces it.

**Data and authorisation**

- AD-1: every private collection (`copies`, `user-books`, `locations`, `people`, `tags`, `loans`, `wishlists`, `wishlist-entries`) uses `ownerField()`, set from `req.user`, never from input; read/update/delete is `owner = current user` for every role, admin included.
- AD-2: authorisation only in collection access functions, explicit for all four operations, roles tested through named helpers in `src/access`; the frontend calls Payload only through the gateway with `overrideAccess: false`; every page starts with `requireUser()` (redirect to `/login?next=`, same-origin only), every action and route handler with `requireUserOrThrow()` inside `runAction()` / `runRoute()`.
- AD-3: system privileges only in `lib/catalogue` (writes to books/authors/series/media, `isUnreferenced()`), `lib/shelf` (read-only Drizzle) and the first-user seed. Hooks and access functions query only through `asRequestUser(req)`; hooks never write to another collection.
- AD-4: `books`, `authors`, `series` carry `visibility: shared | private` with `createdBy` on private; users read `shared OR createdBy = me`; at most one shared Book per ISBN-13 and one private per creator and ISBN-13; shared Books reference only shared authors/series; `authors.sortName` ("Family, Given") from source or derived; promotion flips the same row.
- AD-5: users have no write access on catalogue collections; every user-initiated catalogue write goes through `lib/catalogue`; shared values come only from the server-held source response; edits only through `editBook()` with sparse `BookEdits`, where an admin's edits change the shared Book (D-8); `findOrCreateByName()` is the only author/series matcher; ISBN auto-share of the user's own private Book happens inside the save transaction or in Look it up again (D-8); saves create missing system genres (D-2), and `mapSubjectsToGenres()` and the admin's edits are the only writers of shared `books.genres`; a shared Book's ISBN never changes.
- AD-6: overrides are a sparse layer on `user-books` (one row per owner and Book, `overridden` field-name array, read, rating with `ratedAt`, tags); overridable field set declared once in `src/fields/bookFields.ts` (genres leave it, D-6); lazy row written only by `upsertUserBook()`; surface code sees only `EffectiveBook` and `UserBookState`.
- AD-7: one shelf query module (`src/lib/shelf`, Drizzle, read-only) for list, filter, sort, search, built on `visibleCopies(viewer)`; effective values in SQL; AND across fields, OR within; offset paging with one page size, sorts end on copy id; `getShelfRows()` is the one hydrated read; one client list component that reloads rows 0..n after any change and keeps only row count and scroll position in `sessionStorage`; `parseShelfQuery()` / `shelfHref()` are the only readers/writers of the URL params; no code lists or searches books/authors/series on their own; `requireOwnBook()` guards every Book id from the client; `visibleEntries(viewer)` for Lookup's own-library results.
- AD-8: `copies.status` is `ordered | owned` only, an ordered copy has no location; wishlist entries are their own rows, closed with `closedAt`, addressed by entry id; loans are rows pointing at copy and Person; read, rating and tags on `user-books`, notes on `copies`.
- AD-9: lookup writes nothing; `lookupSources()` calls all sources in parallel with timeouts and merges field by field in array order (Finna, then Google Books); three outcomes (result, `none`, `unavailable`); `unavailable` and partially-failed results never cached; source contract `id`, `lookupByIsbn`, optional `search`, never throws; adapters emit "Given Family" with `sortName`, convert language codes; `lookupBook()` order: readable Book with that ISBN (shared, then own private), then sources; `getHoldings()` is the one reader of a viewer's copies and open entries of a Book; `searchBooks()` is the only caller of `search()`; `rawMetadata` admin-only; one shared per-user rate limit for lookup and search, in process.
- AD-10: the frontend never uses Payload REST or GraphQL; reads in server components through services (the Answer is rendered by `/scan` from its search params); mutations are server actions in `runAction()`; client-initiated reads are route handlers under `app/(frontend)/data/` in `runRoute()`; media URLs only from `coverUrl()` rendered only by the `Cover` component (plain `img`).
- AD-11: a save is one transaction from `SaveInput` (ensure Book, close matching entries, create copy or entry); a saved copy is owned at the default location; client `requestId` makes repeats return the first result; the restore deletes created catalogue rows only when `isUnreferenced()`.
- AD-12: exactly one app instance; in-process state only through `processState(key, init)`, bounded and safe to lose.
- AD-13: schema changes ship as committed migrations with regenerated `payload-types.ts`; schema stories merge one at a time and regenerate after rebase; CI applies migrations to an empty DB and fails on a missing migration; production uses `prodMigrations` and never pushes.
- AD-14: covers stored locally in `media`, downloaded only by `lib/catalogue` before the transaction; the browser never loads a source cover; unsaved covers stream through one authenticated route handler by ISBN-13 from the server-recorded URL; `media` read requires sign-in, create/delete by `lib/catalogue` or admin, random filenames.
- AD-15: every interface string from `messages/en.json` and `messages/fi.json` through `next-intl`; locale from the profile, `Accept-Language` when signed out, fallback `en`; no locale segment in routes; a story that adds a string adds both languages.
- AD-16: one context carries user and transaction; `withTransaction(ctx, fn)` is the only place a transaction opens and joins an existing one.
- AD-17: every relationship on a private collection, and `users.defaultLocation`, uses `ownedRelation()` / `readableRelation()`, validated through `asRequestUser(req)`; each access test covers a foreign id.
- AD-18: one writer per kind of row (`lib/copies` for copies and locations, `lib/wishlists`, `lib/people`, `lib/books` for user-books and tags, `lib/loans`, `lib/account` for the profile, `lib/catalogue` for catalogue rows); `Ref` inputs (id or name to create) resolved by the owning service; rename onto an existing `nameKey` fails `NAME_TAKEN` with `conflictId`; merges and cross-row deletes are one function in one transaction; every selection action takes a list of copy ids, all or none.
- AD-19: database unique constraints from the first migration: shared `books(isbn13)`, private `books(createdBy, isbn13)`, `user-books(owner, book)`, open `loans(copy)`, `nameKey` per scope.
- AD-20: Undo is server-held receipts in `lib/undo` (bounded, in process, keyed by opaque `undoToken` and user); undoable services return `Undone<T>`; `withUndo()` is the only recorder; `undo()` behind one `undoAction` runs the restore in one transaction; undoable actions are exactly those in EXPERIENCE.md → Undo; removals, deletes, merges and `editBook` are not undoable.

**Conventions**

- Slugs plural kebab-case, one PascalCase file per collection, camelCase fields; services one folder per domain, verb-first named exports; server actions end in `Action`.
- Payload integer ids; users referenced by id only.
- `users` is the only auth collection (local strategy, server-side sessions); `roles` holds `admin` and/or `user`; only `admin` enters the back office; first user seeded in `onInit` from `SEED_EMAIL` / `SEED_PASSWORD` with both roles when `users` is empty.
- ISBN: `normaliseIsbn` in `src/fields`; normalised by the first service that receives it; browser never normalises; `INVALID_ISBN` on failure.
- Names: `nameKeyField()` on authors, series, genres, tags, locations, people, wishlists (trimmed, whitespace collapsed, lower-cased, no accent folding).
- Text from sources and users trimmed and NFC-normalised at the boundary. Language codes ISO 639-1, else 639-2.
- Dates ISO 8601 UTC; loan dates are calendar dates stored at 12:00 UTC; formatting via `next-intl` with time zone `Europe/Helsinki`.
- Errors: `DomainError`, `ActionResult`, `ErrorCode` (`SCREAMING_SNAKE`), `runAction()`, `runRoute()` in `src/lib/errors.ts`; message key `errors.<CODE>`; Payload errors mapped to `NOT_FOUND`, `VALIDATION`, `INTERNAL`; route handlers answer JSON with `Cache-Control: no-store` and 401 for `UNAUTHENTICATED`; one client helper turns network failure into `NO_CONNECTION` and `UNAUTHENTICATED` into a move to sign-in.
- Toasts: one provider in the frontend root layout (survives navigation), rendering `ActionResult`; server renders raise toasts only through `flashToast()` cookie.
- Navigation and history: opening Book detail, an entry or a full-screen task pushes; swapping the open Book, changing search/filters/sort and one Answer following another replace; closing is history back with fallback `/`; overlays without an address handle Back in their `components/ui` wrapper; overlay links use router navigation with `scroll: false`, no prefetch; `cacheComponents` off.
- Device preferences (layout, size, theme, loans order) in one cookie `bookeh_prefs`, read by `devicePrefs()` at render, written by one server action; never on the profile.
- Styling: Tailwind CSS 4; DESIGN.md tokens declared once in `src/app/(frontend)/styles.css`; Tailwind default colour, radius, shadow and font scales cleared; dark under `data-theme="dark"` and under `prefers-color-scheme` when theme is `system`; no `dark:` utilities, CSS Modules, inline styles or colour/size literals.
- UI primitives: Base UI wrapped once in `components/ui` (dialog, sheet, combobox, menu, picker); side panel is plain layout; no other component or animation library.
- Font: Open Sans via `next/font`, once in the frontend root layout; no runtime font host requests.
- Product name in the interface is "bookeh" (message catalogue and manifest).
- Logging via `payload.logger`, no `console.*`. Configuration via environment variables listed in `.env.example`.
- Caching: no shared or cross-request caching of user-derived data; no service worker.
- Framework APIs: read `node_modules/next/dist/docs` before using a Next.js API and current Payload docs before admin overrides.
- Story size: one concern (one collection, one service or one screen), about 300 hand-written changed lines, generated files excluded; every story leaves `main` deployable; setup is its own story; services land before the screens that use them; screens start read-only; a service offering Undo ships its restore and a test that undoes it.
- Tests: database `bookeh_test`; `tests/helpers/harness.ts` with `createUser()` and `as(user)`; tests create their own rows and never truncate; each collection story ships a two-user access test; each service story ships integration tests; pure functions get `*.unit.spec.ts`; no network in tests (recorded fixtures under `tests/fixtures/<source>/`); Playwright covers only scan-to-save and shop check, with a fixture source and hand-entered ISBNs.
- Commits: one conventional commit per story.

**Stack (pinned)**: TypeScript 5.7.3; Node 22 (`node:22.23.3-alpine`); Next.js 16.3.8; React 19.2.6; Payload 3.90.2; Drizzle 0.45.2 via `@payloadcms/db-postgres`; Postgres 16 `postgres:16-alpine3.24` with ICU `fi-FI`; Tailwind 4.3.3; `@base-ui/react` 1.8.0; next-intl 4.14.9; `@zxing/browser` 0.2.1 with `@zxing/library` ^0.23.0; Vitest 4.0.18; Playwright 1.58.2.

**Shared shapes and routes** are fixed by the spine's Structural Seed (`SourceResult`, `SourcesOutcome`, `SearchHit`, `RawMetadata`, `Ref`, `EffectiveBook`, `UserBookState`, `CopyLine`, `EntryLine`, `Holdings`, `Match`, `LookupResult`, `LookupTarget`, `BookEdits`, `SaveInput`, `SaveResult`, `EditBookInput`, `ShelfQuery`, `ShelfRange`, `ShelfRow`, `ShelfRows`, `Restore`, `Undone`, `Undoable`, `ActionResult`). Routes: `/`, `?book=` on `/` and `/loans`, `/login`, `/scan` (`?isbn=`, `?book=`, `?title=`), `/scan/find?q=`, `/books/[bookId]/edit` (`?copy=`), `/loans`, `/wishlists`, `/wishlists/[listId]` (`?entry=`), `/settings`, `/data/shelf`, `/data/suggest`, `/data/cover/[isbn13]`.

**Infrastructure and deployment**

- Every Postgres (dev, test, CI, prod) initialised with `--locale-provider=icu --icu-locale=fi-FI`, pinned image tag; existing dev volumes recreated once; a test proves å, ä, ö sort after z.
- Production image: `output: 'standalone'`, Dockerfile fixes, built in CI and pushed to GHCR; the LXC never builds and pulls with a read-only token.
- Production compose on the LXC: app + Postgres, `prodMigrations` at start, bind mounts for Postgres data and media to NAS storage, `tailscale serve` for HTTPS, container restart policy, Docker logs; no monitoring stack.
- Nightly `pg_dump` and media copy to the NAS by a timer on the LXC; backup paths operator-only; dumps kept a fixed number of days; one restore rehearsed and written down before Phase 1 is done.
- Camera needs HTTPS: `tailscale serve` in production, `localhost` or `tailscale serve` to the dev machine for phone testing.
- K2–K4 (image, prod compose, backups) should finish before real cataloguing so the 200 books go into the production database.

**Planning decisions taken while writing the epics (Mika, 2026-10-06).** They change the spine, EXPERIENCE.md and SPEC.md, and were carried into those documents on 2026-10-06 (`b387e8a`); these decisions win.

- **D-1 Profile and collection visibility in v1** (FR-4). `users.profileVisibility: public | hidden` (default `hidden`) and `users.collectionVisibility: open | closed` (default `closed`), written through `lib/account`, shown as Text switches in Settings. They have no effect with one user; F8 gives them meaning later. Replaces the spine's Deferred entry "Profile visibility and collection visibility".
- **D-2 Genres come from Google Books categories, and saves create them** (FR-17; replaces spine Deferred "Genre curation", the open SPEC question, and AD-5's "saves never create genres").
  - **Seed.** The genre list is seeded in a migration from Google Books' top-level category vocabulary (Fiction, Biography & Autobiography, History, …), each with an English and a Finnish name.
  - **Create on save.** Saving a shared Book matches its Google categories to genres by `nameKey` on the English name and creates any that are missing, with no Finnish name. The categories are read from the per-source `RawMetadata.subjects.google`, not from the merged `SourceResult.subjects` (where Finna wins the field-by-field merge). `mapSubjectsToGenres()` in `lib/catalogue` is the only matcher and creator, and can be re-run over stored subjects. Genres stay shared-only; users still have no write access on `genres`, and `lib/catalogue` joins the AD-3 allowlist for writing them. A private Book's system genres are its creator's picks from the existing list. There is no genre override on a shared Book any more (D-6).
  - **Answer.** The Answer marks a genre the save would create as "New genre", as it does authors and series (`LookupResult.matches` gains `genres: Match[]`).
  - **Names.** `genres` holds `name` (English, from Google or typed) and an optional `nameFi`. The interface shows the user's language and falls back to the English name when `nameFi` is empty.
  - **Management, admin-only, in the frontend.** Settings has a Genres group that only admins see: each genre with its Book count and a "No Finnish name" mark when `nameFi` is empty; edit the English and Finnish names in place; Add genre; Merge into another genre; Delete. All through `lib/catalogue`, guarded by an admin role helper (`canEditShared`). Merge moves every `books.genres` reference to the survivor in one transaction, then deletes the source; Delete removes the genre from Books. Both are confirmed by a dialog and have no Undo. Because users no longer override system genres (D-6), a merge or delete touches only shared rows, never another user's data. This screen is not in EXPERIENCE.md; its story starts with a rendered mock-up choice.
  - Known risk: Google Books often has no categories for Finnish titles, so many Books will have no genre. The fixture capture story in Epic 3 measures it on ~30 real books; under half covered, `mapSubjectsToGenres()` also maps Finna's genre terms, read from the stored raw Finna response, without changing the source contract.
- **D-4 Cover upload with crop** (FR-47, partly pulled into Phase 1; replaces the spine's Deferred note that `media` gains `visibility` and `createdBy` "when user uploads arrive").
  - **Where.** On Edit book: "Add cover" when the Book has none, "Replace cover" when it has one (from a source or uploaded), and "Remove cover", which falls back to the placeholder. The Book's cover changes when Edit book is saved, with no Undo, like the rest of Edit book. On the phone the file input offers the camera, so a photo of the book works.
  - **Who.** The admin's upload sets a **shared** Book's cover for everyone, as an admin edit of a shared record (AD-5). A user's upload on **their own private Book** sets that Book's cover. Other users cannot upload to a shared Book in Phase 1; the control is absent. That case stays FR-47's Phase 3 flow (private until approved, alternative covers).
  - **Straighten and crop with four corners.** A hand-built component: four handles start at a 2:3 rectangle in the middle of the photo, and the user drags each onto a corner of the cover (pointer events; on wide screens the focused handle moves with the arrow keys). A hint above reads "Shoot it straight on". One interaction fixes angle, skew and crop; no rotate or keystone sliders, no editing beyond that. No crop library is added. The browser decodes the photo with its orientation applied (`createImageBitmap` with `imageOrientation: 'from-image'`, which also decodes HEIC on Safari), shrinks it to about 2000 px on the long side and re-encodes it as JPEG; it sends that image and the four corner points (in its pixels) in a server action. `lib/catalogue` validates type and size, then uses sharp (already installed) to read raw pixels, warp the quadrilateral into a 2:3 rectangle with Heckbert's closed-form square-to-quad projective mapping and bilinear sampling (hand-written, no general solver), strip all metadata including location, resize to a fixed maximum and re-encode. It creates the `media` row with a random filename (AD-14) and sets `books.cover`.
  - **Media.** `media` gains `visibility: shared | private` and `createdBy`. A cover of a private Book is private and readable only by its creator and the admin; read access follows AD-4. Source-downloaded covers are shared.
  - **Re-fetch.** An uploaded cover is an existing value, so admin re-fetch never replaces it (FR-19). The replaced media row is deleted when `isUnreferenced()`.
  - **Not in Phase 1:** per-user cover overrides, the approval queue, picking among alternative covers.
- **D-5 Edit book before the collection.** Epic order puts Edit book (with the save toast's Edit link and the new copy's status) directly after scan-and-save. The default location and the move service come early too (Epics 3 and 4), so Edit book shows the copy's location from the start and real cataloguing never produces books without a location.
- **D-3 Themes from Finna** (FR-17a). A new shared Book field `themes`: a list of Finna subject terms as given (no translation, trimmed and NFC). Written from the server-held source response on save and filled by admin re-fetch when empty; not in the overridable field set (AD-6), not in `BookEdits`. `EffectiveBook` gains `themes: string[]`. `ShelfQuery.filters` gains `theme: string[]` (a value matches by exact text, case-insensitive, no accent folding); theme values in use and suggestions come from the shelf module like publisher. The Finna adapter separates subjects into themes; whether Finna's own form/genre terms are useful is checked against recorded responses in the adapter story. These are the **system themes**; users add their own themes alongside them (D-6).
- **D-6 System and user genres and themes** (Mika, party review 2026-10-06).
  - **System** genres and themes are shared: system genres from the seed, saves and admin edits (D-2); system themes from Finna (D-3). Users cannot change them on a shared Book; the admin can, on Edit book (D-8). `genres` leaves the overridable field set (AD-6 change); `BookEdits.genres` applies to private Books and to the admin's edits of shared Books.
  - **User** genres and themes are private and work like personal tags: the `tags` collection gains `kind: tag | genre | theme`, with `nameKey` unique per owner and kind. One writer (`changeTags()` and the tag services in `lib/tags`), one picker, one Settings pattern. A user adds them to a Book on Book detail, on Edit book and on a selection, with Undo, exactly like tags.
  - **Display and filter.** Book detail shows system genres, the user's genres, system themes, the user's themes and tags as Filter chips. The Filter panel's Genre field lists system genres in use and the user's own genres; the Theme field covers system and user themes; the Tag field covers tags. Each value stays distinct.
  - **Settings.** Tags, My genres and My themes are three List-row groups, each with Rename, Merge and Delete, like locations.
  - **No user names that clash with system ones.** Creating or renaming a user genre whose `nameKey` matches a system genre (English or Finnish name) fails with a field error (`SYSTEM_NAME`, "{name} is a system genre."). The same holds for a user theme matching a system theme on any Book the user holds, read through the shelf module's theme values. A system genre created later with the same name as an existing user genre leaves the user genre in place; that case is accepted.
- **Agreed in the party review (Mika, 2026-10-06).**
  - The visibility switches (D-1) stay in Settings.
  - Genre management and the admin's cover upload write shared records from the app rather than the back office. The doc sync records this in the spine as a deliberate exception to "admin edits shared records in the back office".
  - The genre admin screen and the corner-crop screen are not built before Mika picks from rendered mock-ups; this is an acceptance criterion of their first story.
  - Epic 3 runs straight through: no stop after fixture capture, and it stays one epic.
- **D-7 Picking an edition** (Mika, story review 2026-10-06; changes the AD-9 source contract and `LookupResult`).
  - When an ISBN lookup finds several candidate records (for example Finna's paperback and hardcover records listing the same ISBN, or several printings), the Answer says "{n} editions found", preselects the best and lets Mika pick. A source's `lookupByIsbn` returns its matching records best first; `lookupSources` builds one candidate per record of the first source that answered, each gap-filled field by field from the other sources. Candidates are held server-side with the outcome; the Answer selects one with `?pick=<n>` and the save sends only that index, never values (AD-5). The Book always keeps the ISBN that was looked up. Once a shared Book exists for the ISBN, it is the answer and there is nothing to pick.
  - `SourceResult` and `SearchHit` gain an optional `binding` (for example "paperback", "hardcover"), parsed where a source states it. It is shown in the picker and in Lookup's title-search rows only; it is not stored on the Book.
  - Title search (Lookup) already lists one row per ISBN; each row shows binding, year and publisher so editions can be told apart.
- **D-8 Admin edits are shared; hand-entered Books can be looked up again** (Mika, story review 2026-10-06; changes FR-14's assumption, AD-5 and AD-6).
  - **Admin edits.** When an admin saves Edit book on a shared Book, `editBook()` writes the shared Book itself through `lib/catalogue` with system privileges, guarded by `canEditShared`: scalar fields, authors and series (matched and created among shared records only) and system genres. It clears that admin's own override of an edited field, if any. Themes stay source data. Other users keep getting overrides (FR-14). Cover uploads already follow this rule (D-4).
  - **Look it up again.** The creator of a private Book with an ISBN can run "Look it up again" from Book detail or the In library Answer. It calls the sources (rate-limited like any lookup). On `found` (with the edition picker when there are several candidates, D-7), the auto-share transaction of AD-5 runs without creating a copy: source values replace the Book's, its authors and series are re-matched to shared records, and it becomes shared, or the user's holdings move to an existing shared Book. For the admin, the hand-entered values that differ are dropped (later fixes on Edit book go to the shared record); for other users they become overrides as in AD-5. `none` toasts "Still not found."; `unavailable` names the sources that didn't answer. A private Book without an ISBN shows "Add the ISBN on Edit book to look it up." It is not undoable.

**Decisions left to specific stories** (spine Deferred): the seeded genre vocabulary and its Finnish names (G4); lookup cache size and lifetime, per-source timeout, rate-limit numbers, dump retention (their stories, against NFR-1 and NFR-6); Undo receipt store size (U1; the lifetime is 30 minutes); search indexing only if `ILIKE` misses NFR-3 at 10,000 copies; section slide and list sweep built only where they don't block input.

**Not to build in Phase 1**: public ingress, friends, invites, resets, change password, email change, sessions list, export, deletion/deactivation, admin action log, share links, suggestions, merges of Books, promotion, non-admin cover uploads on shared Books, cover approval and alternative covers, rate limiting beyond lookup, service worker, offline use, email, OAuth, AI recommendations, Edit book inside the wide-screen detail panel.

### UX Design Requirements

From DESIGN.md (look) and EXPERIENCE.md (behaviour). Mock-ups under `ux-designs/ux-bookeh-2026-10-03/mockups/` are references; the two spines win on conflict. `[A]` marks an item EXPERIENCE.md or DESIGN.md tags as `[ASSUMPTION]`; it stands as written until a story touches it.

**Foundation: tokens, type, theme**

- UX-DR1: Declare the DESIGN.md tokens in `styles.css` as Tailwind theme variables: colours `background`, `text`, `text-muted`, `text-dim`, `border`, `accent`, `scrim`, `danger`, `shadow`, each with light and dark values; typography roles `heading-section` (44/300), `heading-section-phone` (38/300), `heading-detail` (26/300), `heading-group` (20/300), `title` (17/400), `control` (17/400), `button` (15/400), `body` (14/400), `meta` (13/400), `label` (12/400); spacing 1–7 (4–28px), `page-margin` 28px, `page-margin-phone` 20px, strokes 1/2/4px, `panel-width` 360px; radius 0 only. Clear Tailwind's default colour, radius, shadow and font scales.
- UX-DR2: Theme switch light / dark / system: `data-theme` on the root element from the device-preference cookie, dark values under `data-theme="dark"` and under `prefers-color-scheme: dark` when `system`; correct on first paint.
- UX-DR3: Open Sans, weights 300 and 400 only, no bold anywhere; book titles use the same face; å, ä, ö render at every size.
- UX-DR4: Lowercase rendering via one CSS token/utility for section, screen and group headings, buttons and text switches (except proper-name options such as languages); strings stored in sentence case; user-typed text and book data never lowercased; assistive technology reads the stored string.
- UX-DR5: Visual rules: no filled areas (only lines, the 8px marker, covers and the scrim); accent only as lines (never text in light mode); danger only for errors and destructive actions; one shadow, on the wide-screen detail panel only; square corners everywhere; separation by whitespace and headings, no row dividers.

**Shell and navigation**

- UX-DR6: Section shell: four section headings (collection, loans, wishlists, settings) side by side in `heading-section`; the current one in full ink leads the row, the others follow in fixed order wrapping round in `text-dim`. Phone: the row runs off the right edge; tap a heading or swipe sideways to change section, wrapping from last to first; swipes starting within 24px of a screen edge are ignored; swiping does nothing while a sheet, picker or full-screen task is open. Wide: headings are clicked and the row clips when too narrow. The section name is announced on change.
- UX-DR7: Scan book on every section: primary button pinned full-width to the bottom on the phone (respecting safe areas), top right on wide screens.
- UX-DR8: History: system Back closes the topmost thing (picker, then sheet or panel, then full-screen task); Back on an Answer returns to Scan, on Scan to the section; each new Answer replaces the previous in history; a reload keeps the open Book, filters and sort.
- UX-DR9: Interaction primitives: phone — tap, sideways swipe for sections, drag the sheet, no long-press, no swipe on rows, no pull-to-refresh. Wide — `Tab` in reading order, `Enter` opens the focused row, `Esc` closes topmost (dialog, then panel, then select mode), `/` focuses search [A]. One overlay deep: a sheet or panel opens at most one picker or dialog (combobox popups don't count). Banned: hover-only controls, a confirmation dialog for anything that has Undo, auto-playing or looping movement.
- UX-DR10: Responsive breakpoints: phone under 900px [A] (headings swipe, sheets, Scan pinned bottom, 20px margin); wide 900px and up (all headings fit, detail panel right, filter panel left, Scan top right, 28px margin); wide but under 1200px [A] has room for one side panel (opening Filter closes Book detail and vice versa); full-screen tasks (Scan, Lookup, Answer, Edit book) are a centred column no wider than a phone screen on wide screens. Installed PWA runs standalone with safe areas respected.

**Components** (one Base UI wrapper or plain component each; visual spec in DESIGN.md → Components, behaviour in EXPERIENCE.md → Component Patterns)

- UX-DR11: Buttons — primary (2px accent outline), secondary (2px text outline), destructive (2px danger outline); transparent, square, lowercase, `button` type, padding 8/16px, 8px between buttons, full width when pinned at the bottom of a phone screen; at most one primary per layer (section, sheet/panel, full-screen task, action bar, dialog); destructive always confirmed by a dialog, no Undo; disabled shows label and outline in `text-dim` [A].
- UX-DR12: Links — text with a 2px accent underline offset 3px; destructive link with a danger underline (always confirmed, no Undo); Back link in `meta` above a screen heading naming where it returns.
- UX-DR13: Text switch — options side by side in `control`, chosen in `text`, others in `text-dim`, no outline/underline/fill; exactly one chosen; switches at once without confirm.
- UX-DR14: Text field — `label` in `text-muted` above the value; 2px `text` underline, `text-dim` when empty, `danger` with a `meta` message beneath when invalid; no box; search field without label, filtering after a short pause.
- UX-DR15: Combobox (location, Person, tags, author, series) — a Text field with an outlined popup directly under it, as wide as the field; highlighted option has the selection bar, chosen option the 8px marker [A]; type to narrow; a value that does not exist can be created from the same field (`Ref` with `create`).
- UX-DR16: Date field — the platform's date control inside a Text field; defaults to today.
- UX-DR17: Book row in three sizes — l: 44×66 cover, title / author / year · publisher on three lines, 10px vertical padding; m: 32×48, title then author · year · publisher, 8px; s: 16×24, all on one line, 3px (tap-area exception). Row ending: the copy's location; or the lent marker and "Lent · {person}"; or "Ordered"; blank when the user has no locations. No dividers, 16px between cover, text and ending.
- UX-DR18: Cover tile in three sizes — columns at least 160 / 116 / 76px wide, gaps 24 / 18 / 10px; cover 2:3, square corners; title and author beneath (`label` size at s); lent copy has the 8px marker before its title; open tile has the selection bar along the bottom edge of its cover; in select mode the checkbox sits before the title [A].
- UX-DR19: Cover placeholder — an outlined rectangle in `text-dim` with the title inside in `text-muted` [A]; used wherever a cover would show.
- UX-DR20: Selection bar — 4px accent bar on the left edge of the open row (bottom edge of an open tile's cover); row not tinted; moves when another Book opens and goes when detail closes.
- UX-DR21: Lent marker — 8px accent square followed by "Lent · {person}" in `text`; always with the borrower's name; on rows, tiles, Book detail and the Answer.
- UX-DR22: Rating — five 22px star outlines, rated stroked in `text`, the rest in `text-dim`, never filled; tap a star to set the rating, tap another star to change it; a "Clear" Link beside the stars, shown only while a rating is set, clears it; tapping the current star does nothing; saved at once (Mika, 2026-10-06; replaces EXPERIENCE.md's tap-again-to-clear in the doc sync).
- UX-DR23: Detail panel (wide) — 360px on the plain ground, 1px `border` left edge and `-10px 0 24px -14px` shadow; slides out from the right while the list narrows beside it; clicking another row swaps its content without closing; not modal (list usable, focus not trapped); X and `Esc` close it; 72×108 cover beside a `heading-detail` title; groups in `heading-group` muted; values label-left / value-right.
- UX-DR24: Bottom sheet (phone: Book detail, wishlist entry, Filter panel [A], pickers) — full width, 2px `text` top edge, short handle line at top centre, scrim over the dimmed list; opens to a little over half the screen; drag up or tap the handle to open fully; tap the dimmed list, drag down, X or Back to close; list keeps its scroll position; modal with focus held inside and returned to the opener.
- UX-DR25: Picker (Move location, Tag, Lend Person and date, Add to wishlist) — bottom sheet on the phone, dialog on wide screens; one choice, then it closes.
- UX-DR26: Dialog (confirmations of removals and merges, "Discard changes?", New list) — outlined 2px `text` box, centred, at most 400px, scrim behind; title in `heading-group`; buttons right-aligned at the foot with the confirming button on the right [A]; `Esc` and tapping outside cancel; modal focus handling.
- UX-DR27: Toast — outlined 2px `text` box above whatever is pinned to the bottom; message left in `meta`, actions as Links right, and a close (X) on every toast (Mika, 2026-10-06); Undo hidden once its receipt has expired (30 minutes); about 8 s, one at a time, a new one replacing the old; a toast raised on Scan has no timer and goes when the next Answer opens; an error toast starts with an 8px danger square, has no timer and stays until dismissed or replaced; "Undone" for a moment after a successful Undo, "Couldn't undo." on failure; announced to screen readers.
- UX-DR28: Action bar (select mode) — full width on the bottom edge, 2px `text` top edge; count left, Move, Tag, Read, Remove (destructive) and Done (primary); on the phone it replaces the pinned Scan book button and is two rows (count and Done above, the four actions below) [A]; on wide screens Scan book stays in the header; actions other than Done are disabled while nothing is ticked.
- UX-DR29: Checkbox — 20px square, 2px `text` outline, checked shows a drawn tick in `text`, not filled [A]; appears on every row or tile in select mode.
- UX-DR30: Progress line — 2px accent line moving across the top edge while a lookup, save or next page is in flight [A]; nothing else blocks the screen; no skeletons [A].
- UX-DR31: Close (X) — two 2px `text` strokes, top right, no circle or box; on Scan, Lookup, Answer, Edit book, the sheet and the panel; closes the whole task or overlay in one tap.
- UX-DR32: Camera frame — 2px `text` rectangle around the camera view with a horizontal accent guide line.
- UX-DR33: Option list (filter values) — one value per line in `body`; switched-on values in `text` with the 8px accent marker before them, others in `text-muted`.
- UX-DR34: Filter chip (author, series, genre, theme, personal tag, location) — styled as a Link, no outline or fill [A]; tapping adds that value to the collection filters (existing filters stay; a second value in the same field widens it); closes the sheet on the phone; from loans or a wishlist it goes to the collection with that one filter.
- UX-DR35: List row (list of wishlists, managed lists in settings) — name in `title`, count right in `meta` `text-muted`; tappable in wishlists, not in settings (its Links act).
- UX-DR36: Count line — `meta` in `text-muted` under the search: "{n} books" with nothing active; with search or filter: active values, count and a "Clear" Link, e.g. "Tampere, unread · 14 books · Clear".
- UX-DR37: Empty state — a line in `heading-group`, an optional line in `body` `text-muted`, then one action as a Link or the primary button.
- UX-DR38: Focus and tap area — keyboard focus is a 2px `text` outline 3px outside the control, never the accent [A]; every phone control has a tap area at least 44px high by padding (rows at size s excepted).

**Screens**

- UX-DR39: Sign in (`/login`) — email and password; "Wrong email or password." without saying which; returns to `next` (same-origin path) after sign-in; uses `Accept-Language` for its language. Not mocked.
- UX-DR40: Collection (`/`) — the first screen; tools row (Search, Filter, rows/covers, s/m/l, Select) with 24px between controls; search covers own copies only (title, author, series, ISBN, notes); layout and size remembered per device and right on first paint; size changes what fits, not how much is fetched; endless scrolling with the progress line while loading more and the list usable; keeps row count and scroll position across routes; one row per copy, counts labelled "books".
- UX-DR41: Filter panel — left of the list on wide screens (separated by space), bottom sheet on the phone [A]; filters apply as changed, no Apply button [A]. Fields: location, status, read, genre (system genres in the user's language plus the user's own genres, D-6), personal tag, language as option lists of values in use; author, series, publisher and theme (system and user themes, D-3, D-6; too many values to list) as comboboxes adding values to a short list; rating as the Rating component meaning "at least"; year and pages as from/to with either end empty; Sort by author (default), title, year, date added, tapping the chosen sort again reverses it [A]. AND across fields, OR within [A]; overrides used; Finnish sort.
- UX-DR42: Select mode — entering closes Book detail and shows checkboxes; only ticked rows are selected and the selection survives search, filter and scroll; the count includes rows out of view; no select-all [A]. Move: location picker, rows that no longer match leave the list. Tag: picker with add-to-all and remove-from-all; both copies of a Book change together. Read: marks every ticked Book read, or unread if all are read. Remove: dialog "Remove {n} books from library?" with Remove and Cancel, mentioning loans that go too if any are lent. All or none [A]. Done leaves and clears.
- UX-DR43: Book detail (`?book=` on `/` and `/loans`; panel on wide, sheet on phone; same content) — changes save at once, no Save button. Header: cover, title, author, series and number, edition line (publisher · year · pages · language); author and series are Filter chips. Read/unread Text switch and Rating. Your copies: one line per copy with location (Filter chip) and status; Links by state: owned — Lend, Move, Remove; lent — lent marker with "Lent to {person} since {date}" and Returned; ordered — "Ordered" and Received; the copy's note under its line, edited in place. Lent before: closed loans newest first "{person} · {from} to {to}", absent when none. On wishlists: "{list} · for {person}", absent when none. System genres (in the user's language), the user's genres, system themes, the user's themes and personal tags as Filter chips, with "Add tag" opening the picker for tags, genres and themes; empty kinds are absent (D-2, D-3, D-6). Foot: Edit and Add to wishlist, no primary. The half-open sheet shows header, read and rating and the first copies.
- UX-DR44: Scan (`/scan`, full screen) — camera starts on open and stays on across Scan, Answer and back until the task is closed; only EAN-13 starting 978/979 counts; reading pauses during a lookup and while an Answer shows; after an Answer closes the same ISBN is ignored until it leaves view; a read barcode goes straight to the Answer; ISBN field accepts ISBN-10/13 with hyphens or spaces, submitted with Go; "Find by title or author" Link; no camera or permission denied: "No camera. Type the ISBN." replaces the frame and the field takes focus (normal on desktop); "Not an ISBN. Thirteen digits, or ten." under the field in danger; "Too many lookups. Wait a moment." toast; Scan stays visible with the progress line while looking up.
- UX-DR45: Lookup (`/scan/find`) — one field for title or author, search on Go; results in two groups, "In your library" (matching copies and open wishlist entries) then "Elsewhere" (outside sources); rows show cover, title, author, year, publisher; covers only where servable, else the placeholder; tapping a result opens its Answer and Back returns to the results; "Nothing found" with an "Add by hand" Link opening the Not found Answer with the typed text in the title field.
- UX-DR46: Answer screens — the heading is the answer, first that applies: In library (Open book · Add another copy · **Back**); Ordered (**Back**; Received on each ordered copy's line) [A]; On wishlist (**Add to library** · Back) [A]; Not in library (Add to wishlist · **Add to library** · Back); Not found (title and author fields, both required, then Add to wishlist · **Add to library** · Back); Couldn't look it up (**Try again** · Back, "Add by hand" Link that unfolds the Not found fields and buttons in place, naming which sources didn't answer, e.g. "Finna and Google Books didn't answer."). Every other applicable fact is a line under the Book: each copy with its location, "Ordered", "On {list}". Under the Book: "From {source}" and "New author" / "New series" / "New genre" for records the save would create (D-2). X leaves scanning altogether. Add to library / Add another copy save at once and return to Scan with "Saved to {location} · Edit · Undo" ("Saved" with no default location). Add to wishlist opens the wishlist picker every time, skipped with exactly one list [A], offering only "New list" with none. Open book leaves scanning and opens Book detail in the collection. Back saves nothing.
- UX-DR47: Edit book (`/books/{bookId}/edit`, full screen on every width, centred column on wide) — first screen: cover, title, author, source, personal tags, and when opened from a save toast that copy's status (owned/ordered) and location with their saved values; Save pinned at the bottom; "More details" Link unfolds title, subtitle, authors, series, number in series, publisher, year, language, pages, description; ISBN and system genres editable only on a private Book or by the admin, themes never; Save returns to where the user came from with the toast "Saved" (no Undo); overrides are not explained; X or Back with changes asks "Discard changes?" [A].
- UX-DR47a: Cover upload and crop on Edit book (D-4) — on the first screen beside the cover: Links "Add cover" / "Replace cover" and a destructive "Remove cover"; absent for users who may not change that Book's cover. Choosing a file (camera offered on the phone) opens a full-screen straighten-and-crop step: the photo with four corner handles joined by a 2px `text` outline, the area outside dimmed by the scrim, and the hint "Shoot it straight on"; drag each handle onto a corner of the cover; on wide screens Tab moves between handles and the arrow keys move the focused one; Use (primary) and Cancel. The straightened 2:3 preview replaces the cover on Edit book until Save. Rejected file: the code's message under the cover ("Not an image." / "Image too large."). Not mocked; its story starts with a rendered mock-up choice.
- UX-DR48: Loans (`/loans`) — Text switch by person / by date, remembered per device; by person: borrower name as group heading as typed, rows with the copy and "Since {date}"; by date: one list longest out first, rows "{person} · since {date}"; Returned Link on a row closes the loan today and moves it to the returned group; returned group below the open loans in both orders, rows "{person} · {from} to {to}" newest first; tapping a row opens Book detail; "Nothing lent" with one dry remark when empty, returned loans still shown.
- UX-DR49: Wishlists (`/wishlists`, `/wishlists/{listId}`, `?entry=`) — list of lists as List rows with name and count; "New list" dialog asks for a name, a name in use is rejected under the field; "No wishlists" and "New list" when empty (also in the picker). One wishlist: Back link, heading is the list name as typed, Links Rename and Delete (destructive; removes the list and its entries) [A]; entry rows show cover, title, author and "For {person}" at the end; "Nothing on this list." when empty. Entry opened at `?entry=`: sheet or panel with the Book's header, "On {list}", and a "For" combobox of People settable, changeable or clearable at any time; Bought (primary), Ordered, Remove (destructive); closed or removed entries leave the list.
- UX-DR50: Settings (`/settings`) — Profile: display name Text field saved on leaving it, email shown read-only, no password change. Language: Text switch English / Suomi, takes effect at once, stored on the profile. Theme: light / dark / system, per device. Profile visibility: Text switch public / hidden; collection visibility: Text switch open / closed; both on the profile, default hidden and closed, and with no effect until friends exist (D-1). Default location: combobox of the user's locations, may be empty. Locations, People, Tags, My genres, My themes (D-6): one List row each with its use count ("31 books", "2 loans"), Links Rename, Merge, Delete (on a second line on the phone); "Add location" and "Add person". Rename edits in place and offers a merge when the name exists. Merge picks another item of the same kind, confirmed by a dialog. Delete is confirmed by a dialog saying what loses its location or tag; a Person with loans (open or returned) or wishlist entries cannot be deleted, and the dialog says so and offers Merge. "No locations" and "Add location" when there are none. Genres (admin only, D-2): one List row per genre in the user's language with its Book count and a "No Finnish name" mark where missing; English and Finnish names edited in place; "Add genre"; Merge and Delete confirmed by a dialog, no Undo; not mocked yet. Sign out is a secondary button at the end of the first column.

**States, copy, motion, accessibility**

- UX-DR51: State patterns — first load: section heading at once, progress line until content, no skeletons [A]; first run: "No books yet", one dry remark, Scan book, nothing about locations; no matches: "No books match" and "Clear"; load failed: "Couldn't load. Try again." with a retry Link; Book no longer there (`?book=` the user holds nothing of): the section opens without detail and toasts "Not in library"; Book has left the list: the row goes, the detail stays open until closed; signed out: sign in, then back to the wanted address; action with no connection: "No connection." error toast, nothing queued; save failed: error toast with the code's message, screen and input unchanged; field rejected: the code's message under the field; no locations: location fields, location filter, Move and row ending absent everywhere.
- UX-DR52: Undo toast wording per action — Add to library / Add another copy: "Saved to {location} · Edit · Undo"; Add to wishlist: "Added to {list} · Undo"; Move: "{n} moved to {location} · Undo"; Tag: "Tagged {n} · Undo"; Read: "Marked {n} read · Undo"; Lend: "Lent to {person} · Undo"; Returned: "Returned · Undo"; Bought for me: "Saved to {location} · Undo"; Ordered: "Ordered · Undo"; Bought for a Person: "Bought · Undo"; Received: "Saved to {location} · Undo"; Edit book Save: "Saved", no Undo; Remove, Delete, Merge: no toast Undo, confirmed by a dialog first.
- UX-DR53: Voice and tone — terse fragments, no pleasantries, exclamation marks or "successfully"; empty states may carry one dry remark, nothing else may; failure messages from `errors.<CODE>`; Finnish written natively, not word for word; a message containing a user-typed name puts it where it needs no inflection, e.g. "Tallennettu · Tampere" [A]; strings stored in sentence case.
- UX-DR54: Motion — section change: headings row and content slide sideways together in the direction of travel; section opening: heading settles, then list items sweep in from the right (both enhancements, built only where they don't block input); sheet slides up while the list dims; panel slides out from the right while the list narrows; full-screen tasks slide in over the section and away on Back or X; toast slides up and fades out; about 200–300 ms [A], never blocking input; with reduce motion every slide and sweep is an immediate change. CSS transitions or view transitions only.
- UX-DR55: Accessibility floor [A] — body text, labels and values 4.5:1 in both modes, meaningful lines 3:1 (accepted exception: inactive section headings and switch options at about 3.2:1); every control keyboard-operable on wide screens with the focus outline; sheet, pickers and dialogs modal with focus in, held and returned; detail panel not modal; toasts announced; section name announced on change; nothing depends on colour alone (lent marker has text, errors have messages, destructive controls name their action); page `lang` follows the interface language.
- UX-DR56: PWA presentation — manifest and icons named bookeh, standalone display, pinned buttons respect device safe areas; the camera is used only inside the Scan task.

### FR Coverage Map

Phase 1 only. Phase 2–3 FRs (FR-2, FR-5 to FR-9, FR-40 to FR-46, FR-48, FR-49, and the P3 rest of FR-47) are not mapped and must not be built. Slice numbers refer to STORY-SLICING.md.

| FR | Epic(s) | What |
|---|---|---|
| FR-1 | E1 | Sign-in, every page requires a user |
| FR-3 | E1 | Account model kept open for OAuth and registration (constraint) |
| FR-4 | E1, E3 | Profile: name, language, visibility (E1); default location (E3) |
| FR-10 | E3 | Scan and ISBN entry, normalisation |
| FR-11 | E3 | Lookup: existing Book, then Finna, then Google; read-only; rate-limited |
| FR-12 | E3 | Manual entry, private Book, ISBN auto-share |
| FR-13 | E3, E4, E9 | Answer with source and new author or series notes (E3); Edit book (E4); "New genre" note (E9) |
| FR-14 | E4 | Overrides on shared Books, direct edits on private Books |
| FR-15 | E3–E7, E9 | Save toast with Undo (E3); Edit link (E4); Undo per action in each owning epic |
| FR-16 | E3 | In library Answer with Add another copy |
| FR-17 | E3, E9 | Author and series matching (E3); system genres from Google, user genres and personal tags (E9) |
| FR-17a | E3, E9 | System themes stored (E3); shown and filtered, plus user themes (E9) |
| FR-18 | E3 | Raw source response stored, admin-only |
| FR-19 | E5 | Admin re-fetch, fill-empty |
| FR-20 | E3, E8 | Basic Answer (E3); full heading precedence, fact lines, Lookup by title or author (E8) |
| FR-21 | E3, E7, E8 | Add to library (E3); Add to wishlist (E7); full Answer (E8) |
| FR-22 | E3, E7 | Not found with Add to library (E3); with Add to wishlist (E7) |
| FR-23 | E1, E5 | Section shell and Scan book (E1); app opens in the collection (E5) |
| FR-24 | E5 | Collection search |
| FR-25 | E5, E9 | Filters and sort including location (E5); genre, tag, theme (E9) |
| FR-26 | E5–E7, E9 | Book detail (E5); each later epic adds its group |
| FR-27 | E4, E5 | Overrides shown everywhere for their owner |
| FR-28 | E4, E5, E7 | Set ordered on Edit book (E4); Received (E5); Bought and Ordered on entries (E7) |
| FR-29 | E5 | Read flag and rating |
| FR-30 | E3 | Several copies of one edition (friend part is P2) |
| FR-31 | E3, E5 | Inline add with the default location (E3); list, rename, merge, delete (E5) |
| FR-32 | E5 | No locations, no location fields |
| FR-33 | E4, E5, E9 | Move service (E4); bulk read, remove and Move on a selection (E5); tag (E9) |
| FR-34 | E6 | People list |
| FR-35 | E6 | Lend |
| FR-36 | E6 | Returned and loan history |
| FR-37 | E6 | Loans view, lent markers |
| FR-38 | E7 | Named wishlists, entry recipients |
| FR-39 | E7 | List of lists with counts, one list's entries |
| FR-47 (part, D-4) | E4 | Cover upload with four-corner straighten and 2:3 crop, for admin and private Book creator |
| FR-50 | E1 | PWA install |
| FR-51 | E1 (and every story) | English and Finnish |
| FR-52 | E1 | No email; account model open for it (constraint) |

| NFR | Epic(s) |
|---|---|
| NFR-1 | E3 (external lookup), E8 (known Book) |
| NFR-2 | E3 |
| NFR-3 | E5 |
| NFR-4 | E2 (one instance), all |
| NFR-6 | E2 (setup), cataloguing gate (rehearsed restore) |
| NFR-7 | E1 (ICU database), E5 (sort and search) |
| NFR-5, NFR-8 | Phase 2; kept possible by AD-1, AD-4 |

## Epic List

Nine epics, in build order. Each needs only the epics before it. Later epics add their own lines to screens built earlier (Book detail, the Answer, Settings) as small stories in the epic that owns the data. The order puts what the Phase 1 success metrics measure (have it, where is it, who has it, shop check) before tags, genres and themes, which no metric depends on.

**Story ids.** Every story title carries its slice id from STORY-SLICING.md, for example "Story 3.5 [C2] Finna adapter: core fields", so the slice dependency columns stay usable. Slices new in this document (fixture capture, default location in Settings, cover upload, genre creation and admin, themes) take the next free number in their track and are added to STORY-SLICING.md in the doc sync below.

**Foundation when first needed.** Foundation slices live in the first epic that uses them, not all in Epic 1.

**In every story.** Interface text in English and Finnish (AD-15) in the voice of UX-DR53; the accessibility floor of UX-DR55; tokens only, no literals (Styling convention); a component is built by the first story that needs it and reused after. After the cataloguing gate, a story that changes schema is verified before merge by applying its migration to a restored copy of the latest production dump. The list sweep on section open (UX-DR54) is an enhancement and is not a story; it is built only if it never blocks input.

**Precondition for sprint planning.** The PRD, the architecture spine with STORY-SLICING.md, EXPERIENCE.md and SPEC.md are updated for decisions D-1 to D-8, the smaller rulings and the new slice numbers before sprint planning, so no story is built to a superseded rule. Met on 2026-10-06 (`b387e8a`); the readiness fixes are in `sprint-change-proposal-2026-10-06-readiness.md`.

**Cataloguing gate.** Until the gate, phone testing runs against dev (`tailscale serve` to the dev machine), never production. Real cataloguing of the ~200 books starts once Epics 1–3 are done, Edit book with the copy's status and location from Epic 4 (D21, D22) has landed, Epic 2 is deployed, and the default location is set. Cover upload is not part of the gate; covers can be added to catalogued books afterwards. From then on every book goes into the production database at a location and can be edited right away; earlier saves are test data. The gate closes with **one rehearsed restore** of the production backup holding the first real books and covers, written down (NFR-6).

### Epic 1: Sign in to bookeh, in my language and theme
Mika opens bookeh, installed as a PWA, signs in, and moves between the four sections with Scan book always within reach. Settings holds display name, language, theme, profile and collection visibility, and sign out. Includes the foundation these need: version bumps, CI, ICU Postgres, test harness, lint rules, old collections removed, access helpers, `users` and the seed, `requireUser`, errors, tokens, i18n, toasts, font, device preferences.
**Slices:** A1–A10, K7, A13–A17, A19, A21, A22, A26, K1, K9, K5 (without default location), K10 (D-1).
**FRs covered:** FR-1, FR-3, FR-4 (part), FR-23 (shell), FR-50, FR-51, FR-52.
**NFRs covered:** NFR-7 (ICU database).

### Epic 2: My catalogue runs in production and is backed up
bookeh runs on the LXC behind `tailscale serve`, reachable from the phone, with data on the NAS and nightly backups to it. The restore is rehearsed at the cataloguing gate, once real data exists.
**Slices:** K2, K3, K4 (backup script and timer; the rehearsal moves to the gate).
**NFRs covered:** NFR-4, NFR-6 (setup).

### Epic 3: Scan a book and add it to my library
Scan or type an ISBN, see what the book is ("From Finna", new author or series), and add it to the library in one tap at the default location ("Saved to Tampere") with Undo. The default location is set in Settings, adding a location inline. An owned edition answers "In library" with Add another copy. An unknown ISBN is entered by hand as a private Book, shared automatically once a source knows it. "Couldn't look it up" offers Try again.
**Starts with:**
1. **The scan screen (D9)**, accepted only in the installed PWA on Mika's iPhone over HTTPS (production, or `tailscale serve` to the dev machine, so Epic 3 never waits for Epic 2), with the camera-permission behaviour in standalone mode written down.
2. **Real-book fixture capture**, before the adapters: raw Finna and Google Books responses for about 30 books from Mika's shelf (Finnish fiction, non-fiction, translations, old editions, at least one Google doesn't know) are recorded under `tests/fixtures/` and become the adapters' fixtures. The story also records the **genre coverage checkpoint**: what share has Google Books categories, and what Finna's own genre terms look like. Under half covered by Google, Epic 9 also maps Finna genre terms onto the genre list (D-2). The checkpoint informs Epic 9 only; it never changes the source contract or the adapters.

**Two lanes.** After those two stories, Epic 3 runs as two lanes that join at C5, C6 and D1:
- *Lookup lane* (no database access): B1, C1, C2, C10, C3, A24, C4.
- *Schema lane* (schema stories merge one at a time, AD-13): A11, A12, A18, B10, B11, B3, B4, B5, B2, B6, B7, F1, B8, B9, E26, U1, U2. It starts once B1 and A24 have merged, since both lanes use `isbnField`, `nameKeyField` and `processState`.

A slip in the schema lane does not stall the adapters.

**Slices:** D9, C9 (fixture capture), A11, A12, A18, A20, A23, A24, A25, B1–B11, U1, U2, C1–C7, C10, C11, D1–D4, D6–D8, D10, D15–D18, D23, D25, D26, D32, E26, F1, F2, I9, K11 (default location in Settings), and the edition picker (C12, D-7).
**Must hold:** the stored `RawMetadata` keeps each source's complete raw response and Google's categories per source (`subjects.google`) from the first save, so Epic 9 can derive genres, and Finna genre terms if the checkpoint calls for them, for Books saved before it; the Finna adapter keeps themes.
**FRs covered:** FR-4 (default location), FR-10, FR-11, FR-12, FR-13 (Answer, without the genre note), FR-15 (save), FR-16, FR-17 (authors, series), FR-17a (stored), FR-18, FR-20 (basic), FR-21 (Add to library), FR-22 (library), FR-30, FR-31 (inline add).
**NFRs covered:** NFR-1 (external lookup), NFR-2.

### Epic 4: Fix fetched data and add covers
Edit book from the save toast or by address: the first screen, More details, Save, and "Discard changes?". As admin, Mika's edits to a shared Book change it for everyone (D-8); other users' edits are their overrides; edits to his private Book change it. Edit on the toast also shows the new copy's status and location, so it can be set to ordered or moved. The admin, or a private Book's creator, adds, replaces or removes a cover, straightened and cropped to 2:3 by dragging four corners.
**Slices:** E21, D5, D19, D20, D24, F6, D21, D27, D22, K12, then the new cover slices last (media visibility, upload service with sharp and the perspective warp, four-corner crop component, cover on Edit book). The cataloguing gate needs D21 and D22, not the covers.
**FRs covered:** FR-13 (Edit book), FR-14, FR-15 (Edit link), FR-27, FR-28 (set ordered), FR-47 (part, D-4).

### Epic 5: Browse, organise and move my collection
The collection at `/`: rows or covers in three sizes, endless scrolling, search, Filter panel and sort (location included), Book detail (sheet or side panel) with Filter chips, read and rating, copy notes and removal, Received on an ordered copy, location on rows, copy lines and the Answer, select mode with bulk read, move and remove, the locations list in Settings with add, rename, merge and delete, no location fields for a user without locations, Open book on the Answer, admin re-fetch, and the 10,000-copy timing test.
**Slices:** E1–E4, E6–E8, E11–E20, E22–E28, F3, F4, F5, F7, F8, H13, K6, D33 (look it up again, D-8), K14 (last backup in Settings), and new slices for the wide side panel, Open book and the Filter panel parts.
**Order notes:**
- **E14 (timing at 10,000 copies) runs right after the query slices** E1–E4 and E15, before any collection screen, so any indexing lands before screens depend on the query's shape.
- **E8 is split:** E8 is Book detail's content component rendered in the phone sheet; a follow-up slice renders the same component in the wide side panel. Every group later epics add to Book detail depends only on the content component.
**FRs covered:** FR-19, FR-23, FR-24, FR-25 (incl. location), FR-26, FR-27, FR-28 (Received), FR-29, FR-31 (manage), FR-32, FR-33 (read, move, remove).
**NFRs covered:** NFR-3, NFR-7 (sort and search).

### Epic 6: Lend books and see who has them
People, Lend and Returned with Undo, the Loans section by person or by date with returned loans below, lent markers on rows, Lent before in Book detail, People managed in Settings.
**Slices:** J1–J13.
**FRs covered:** FR-26 (loans), FR-34, FR-35, FR-36, FR-37.

### Epic 7: Keep wishlists
Named lists with counts, Add to wishlist from the Answer and Book detail with Undo, the entry sheet with For, Bought / Ordered / Remove, rename and delete lists, and a save closing matching open entries.
**Slices:** H1–H3, H5–H17.
**FRs covered:** FR-21 (Add to wishlist), FR-22 (wishlist), FR-26 (entries), FR-28 (bought, ordered), FR-38, FR-39.

### Epic 8: Shop check — "do I already have this?"
The full Answer: In library, Ordered, On wishlist or Not in library as the heading, every other fact as a line; Lookup by title or author with "In your library" and "Elsewhere"; lookup of a Book without an ISBN; the shop-check end-to-end test.
**Slices:** I1, I2, I4–I8, I10–I12.
**FRs covered:** FR-20, FR-21, FR-22 (complete).
**NFRs covered:** NFR-1.

### Epic 9: Tag, genre and theme my books
Personal tags, user genres and user themes (one `tags` collection with a kind, D-6) on Book detail, Edit book and a selection, with Undo, filters, and rename, merge, delete in Settings. System genres seeded and created on save from Google Books categories (and Finna genre terms if the Epic 3 checkpoint decided so), re-run over Books saved earlier, shown in the user's language, and managed by the admin in Settings (Finnish names, add, merge, delete, touching shared rows only), with "New genre" on the Answer. Finna system themes as chips and a filter.
**Slices:** G1–G10 (G6, the genre override on Edit book, is retired by D-6), and new slices for tag kinds, genre creation on save, genre admin and themes.
**FRs covered:** FR-13 (genre note on the Answer), FR-17 (system and user genres, tags), FR-17a (system and user themes), FR-25 (genre, tag, theme), FR-33 (tag, genre, theme on a selection).

## Epic 1: Sign in to bookeh, in my language and theme

Mika opens bookeh, installed as a PWA, signs in, and moves between the four sections with Scan book always within reach. Settings holds display name, language, theme, profile and collection visibility, and sign out. The epic lays only the foundation these need.

### Story 1.1: [A1] Bump Next.js, Payload and Node

As the developer,
I want the framework versions the spine pins,
So that the first migration and every later story build on patched versions.

**Acceptance Criteria:**

**Given** the scaffold at Next.js 16.3.3, Payload 3.88.0 and Node 22.17.0
**When** the story is done
**Then** `package.json` pins Next.js 16.3.8 and `payload`, `@payloadcms/next`, `@payloadcms/db-postgres`, `@payloadcms/ui` at 3.90.2, and the Dockerfile uses `node:22.23.3-alpine`
**And** `pnpm dev` starts, the admin at `/admin` loads, and lint and the existing tests pass
**And** the lockfile and the Payload import map are regenerated in the same commit
**And** before bumping, the `next` peer range of Payload 3.90.2 is checked; if 16.3.8 is outside it, the highest Next.js version both support is pinned instead and the reason is written in the commit message

### Story 1.2: [A2] GitHub repository and CI workflow

As the developer,
I want every push checked by CI,
So that `main` stays deployable after every story.

**Acceptance Criteria:**

**Given** the local repository with no remote
**When** it is pushed to a private GitHub repository
**Then** a GitHub Actions workflow on every push and pull request runs lint, `typecheck` and the test suite against a Postgres service container
**And** `package.json` has a `typecheck` script (`tsc --noEmit`) that passes
**And** `playwright.config.ts` starts the server with the project's package manager, not a hard-coded `pnpm` that CI lacks
**And** a deliberately failing test makes the workflow fail

### Story 1.3: [A3] Postgres with Finnish ICU collation

As Mika,
I want titles and names sorted the Finnish way,
So that å, ä and ö sort after z and never next to a and o (NFR-7).

**Acceptance Criteria:**

**Given** Docker Compose and CI
**When** Postgres starts
**Then** it runs the pinned image `postgres:16-alpine3.24`, initialised with `--locale-provider=icu --icu-locale=fi-FI`, in Compose, CI and the `bookeh_test` database
**And** a test proves that `ORDER BY` on text returns `z` before `å`, `å` before `ä`, `ä` before `ö`
**And** the README notes that existing dev volumes must be recreated once, and that changing the image tag means a reindex and `ALTER DATABASE … REFRESH COLLATION VERSION`

### Story 1.4: [A4] Test harness

As the developer,
I want a test harness with users and a request context,
So that every collection and service story can ship a two-user test.

**Acceptance Criteria:**

**Given** the `bookeh_test` database
**When** tests run
**Then** they never touch the dev database, and `tests/helpers/harness.ts` exports `createUser()` and `as(user)` that build an authenticated context
**And** tests create their own rows and never truncate tables
**And** `*.unit.spec.ts` files run without a database and `*.int.spec.ts` files run against `bookeh_test`
**And** a sample test creates two users and asserts each has a distinct id

### Story 1.5: [A5] Remove the old collections and GraphQL

As the developer,
I want the single-copy collections and GraphQL gone,
So that the reworked model starts clean (AD-10, AD-13).

**Acceptance Criteria:**

**Given** the collections committed in `7d34440` (books, authors, series, tags, loans)
**When** the story is done
**Then** those collection files, their tests and their registration in `payload.config.ts` are removed; `users` and `media` stay
**And** GraphQL is disabled in the Payload config and its route folders under `app/(payload)` are deleted
**And** a request to `/api/graphql` returns 404
**And** no migration is committed for the removal; migration history starts with the reworked model

### Story 1.6: [A6] Layer import rules and strict `any`

As the developer,
I want ESLint to enforce the spine's import directions,
So that layering cannot erode story by story.

**Acceptance Criteria:**

**Given** the ESLint config
**When** lint runs
**Then** `no-restricted-imports` rejects: `src/lib` importing from `src/app`; `src/collections` importing anything but `src/access` and `src/fields`; `lib/metadata` importing `lib/payload`; client components importing from `src/lib` except types and `lib/shelf/query.ts`; `app/(frontend)` importing `lib/payload` beyond `requireUser`, `requireUserOrThrow` and types; and the one-way rules between services
**And** `@typescript-eslint/no-explicit-any` is an error, with an override only for `rawMetadata`
**And** `console.*` is a lint error
**And** a fixture file breaking each rule fails lint, then is removed

### Story 1.7: [A7] Role helpers and `asRequestUser`

As the developer,
I want named role helpers and one way for hooks to query as the requesting user,
So that access never reads `roles` inline and never bypasses access silently (AD-2, AD-3).

**Acceptance Criteria:**

**Given** `src/access`
**When** the story is done
**Then** it exports `isAdmin(user)`, `canEditShared(user)` and `asRequestUser(req)`, which returns Local API options with `req`, `user: req.user` and `overrideAccess: false`
**And** unit tests cover each helper for no user, a `user`, and an `admin`
**And** no file outside `src/access` reads `user.roles`

### Story 1.8: [A8] `users` collection

As Mika,
I want an account with a display name and language,
So that bookeh knows who I am and speaks my language.

**Acceptance Criteria:**

**Given** the `users` auth collection with local strategy and server-side sessions
**When** the story is done
**Then** it has `roles` (`admin` and/or `user`), `displayName` and `language` (`en` | `fi`), and declares create, read, update and delete access explicitly
**And** a user reads and updates only their own document, admin reads all, create and delete are admin only, and `roles` is writable only by admin
**And** only `admin` may enter `/admin`
**And** `auth.tokenExpiration` is 30 days, so the installed app doesn't ask to sign in every few hours
**And** a two-user access test proves user A cannot read or update user B, and cannot set their own `roles`
**And** the migration and regenerated `payload-types.ts` are committed

### Story 1.9: [K7] CI migration check

As the developer,
I want CI to prove migrations build the schema,
So that production never drifts from dev (AD-13).

**Acceptance Criteria:**

**Given** the CI workflow
**When** it runs
**Then** it applies all migrations to an empty database and runs the integration tests against it with push off
**And** it fails if generating a migration would produce changes

### Story 1.10: [A9] First-user seed

As Mika,
I want my account created on first start,
So that I can sign in without touching the database.

**Acceptance Criteria:**

**Given** an empty `users` table and `SEED_EMAIL` and `SEED_PASSWORD` set
**When** the app starts
**Then** `onInit` creates one user with both roles, display name from the email's local part and language `en`
**And** with any user present, it creates nothing
**And** with either variable missing on an empty table, it logs a warning through `payload.logger` and creates nothing
**And** both variables are listed in `.env.example`

### Story 1.11: [A10] Request context and gateway in `lib/payload`

As the developer,
I want every frontend path to carry the signed-in user into Payload with access on,
So that authorisation lives only in collection access (AD-2, AD-16).

**Acceptance Criteria:**

**Given** `src/lib/payload`
**When** the story is done
**Then** `requireUser()` returns a context with the request and user, or redirects to `/login?next=<path>`; `requireUserOrThrow()` throws `UNAUTHENTICATED` instead of redirecting
**And** the gateway's functions take a context and always pass its user and `overrideAccess: false`
**And** integration tests prove a gateway read as user A cannot return user B's document, and that `requireUserOrThrow()` without a session throws `UNAUTHENTICATED`

### Story 1.12: [A13] Errors and action results

As the developer,
I want one error model for actions and route handlers,
So that every failure reaches the user as a known message (Errors convention).

**Acceptance Criteria:**

**Given** `src/lib/errors.ts`
**When** the story is done
**Then** it exports `DomainError`, the `ErrorCode` union, `ActionResult<T>`, `runAction()` and `runRoute()`, and imports nothing from the project
**And** both wrappers map Payload `Forbidden` and `NotFound` to `NOT_FOUND`, `ValidationError` to `VALIDATION` with field errors, `DomainError` to its code, and anything else to `INTERNAL` with a log line
**And** `runRoute()` answers JSON with `Cache-Control: no-store`, and status 401 for `UNAUTHENTICATED`
**And** unit tests cover each mapping

### Story 1.13: [A14] Tailwind 4 and the design tokens

As Mika,
I want the interface drawn only from the bookeh tokens,
So that it looks the same everywhere, light and dark (UX-DR1, UX-DR2, UX-DR5).

**Acceptance Criteria:**

**Given** `src/app/(frontend)/styles.css`
**When** the story is done
**Then** Tailwind CSS 4.3.3 with `@tailwindcss/postcss` is set up, and its default colour, radius, shadow and font scales are cleared
**And** every DESIGN.md token (colours, typography roles, spacing 1–7, page margins, strokes, panel width, radius 0) is declared there under its DESIGN.md name, with dark values under `data-theme="dark"` and under `prefers-color-scheme: dark` when the theme is `system`
**And** a single lowercase utility exists for headings, buttons and switches (UX-DR4)
**And** a utility outside the token set (for example `bg-blue-500` or `rounded-lg`) produces no CSS

### Story 1.14: [A15] Interface text in English and Finnish

As Mika,
I want the interface in my language,
So that bookeh reads naturally in Finnish or English (FR-51, AD-15, UX-DR53).

**Acceptance Criteria:**

**Given** `next-intl` 4.14.9 with `messages/en.json` and `messages/fi.json`
**When** a page renders
**Then** the locale is the signed-in user's `language`, otherwise the best match from `Accept-Language`, falling back to `en`, and no route has a locale segment
**And** dates and numbers format through `next-intl` with time zone `Europe/Helsinki`
**And** the root element's `lang` follows the locale
**And** a unit test fails when a key exists in one catalogue and not the other

### Story 1.15: [A19] Open Sans

As Mika,
I want the bookeh typeface,
So that headings and text look as designed, including å, ä and ö (UX-DR3).

**Acceptance Criteria:**

**Given** the frontend root layout
**When** a page renders
**Then** Open Sans loads once through `next/font` in weights 300 and 400, self-hosted, with no request to a font host at runtime
**And** no bold weight is used in the interface

### Story 1.16: [A16] Sign in and sign out

As Mika,
I want to sign in with my email and password,
So that only I can open my catalogue (FR-1, FR-52, UX-DR55).

**Acceptance Criteria:**

**Given** I am signed out
**When** I open any frontend address
**Then** I land on `/login?next=<that address>`
**And** signing in with the right email and password takes me to `next` when it is a same-origin path, otherwise to `/`
**And** a wrong email or a wrong password both show "Wrong email or password." under the form, without saying which (UX-DR39)
**And** the sign-in page uses `Accept-Language` for its language
**And** sign-out ends the server session and returns me to `/login`
**And** every string exists in English and Finnish
**And** this story builds the Button (primary, secondary, destructive, disabled), the Text field (label, underline, empty, error message) and the focus ring per DESIGN.md, with tap areas at least 44px high on the phone (UX-DR11, UX-DR14, UX-DR38)

### Story 1.17: [A17] Toasts

As Mika,
I want results and errors shown as toasts,
So that I see what happened without leaving the screen (UX-DR27).

**Acceptance Criteria:**

**Given** one toast provider in the frontend root layout
**When** an action returns an `ActionResult`
**Then** success shows a toast for about 8 s, unless the caller holds it until it is replaced (the save toast on Scan, Story 3.46), and an error shows an error toast with the 8px danger square and the `errors.<CODE>` message, with no timer, until dismissed or replaced
**And** a new toast replaces the current one, and a toast survives client navigation
**And** every toast has a close (X) that dismisses it at once
**And** a server render raises a toast only through `flashToast()`, a short-lived cookie the provider reads and clears
**And** toasts are announced to screen readers through a live region
**And** the toast is an outlined box per DESIGN.md, above anything pinned to the bottom
**And** it slides up and fades out; with reduce motion set, it appears and goes without movement (UX-DR54)

### Story 1.18: [A21] Device preferences and theme

As Mika,
I want layout, size, theme and loans order remembered on each device,
So that each device opens the way I left it, right on the first paint.

**Acceptance Criteria:**

**Given** the `bookeh_prefs` cookie
**When** a page renders
**Then** `devicePrefs()` in `src/app/(frontend)/prefs.ts` reads it, falling back to defaults (rows, m, system, by person) for a missing or unknown value
**And** one server action writes it
**And** the root element carries `data-theme` from the theme preference, so the first paint has the right colours with no flash
**And** nothing of it is stored on the profile

### Story 1.19: [A22] Section shell

As Mika,
I want the four sections as headings with Scan book always at hand,
So that I can move around bookeh and start a scan from anywhere (FR-23, UX-DR6, UX-DR7, UX-DR10).

**Acceptance Criteria:**

**Given** I am signed in
**When** I open `/`, `/loans`, `/wishlists` or `/settings`
**Then** the four section headings (collection, loans, wishlists, settings) sit side by side in `heading-section`, lowercase; the current one in `text` leads the row and the others follow in fixed order, wrapping round, in `text-dim`
**And** tapping or clicking a heading goes to that section, and the section name is announced
**And** on screens under 900px the row runs off the right edge and Scan book is a primary button pinned full width to the bottom, respecting safe areas; at 900px and up Scan book sits at the top right, and where the window is too narrow for all four headings the row clips at the right edge as on the phone
**And** Scan book opens `/scan`, a full-screen task with an X that returns to the section; its content arrives in Epic 3
**And** sections without content show their heading and nothing else, and the progress line runs while a section loads (UX-DR30)
**And** this story builds the Link (accent underline, destructive variant, Back link) and the Close (X) per DESIGN.md (UX-DR12, UX-DR31)
**And** full-screen tasks slide in over the section and away on X or Back in about 200–300 ms; with reduce motion set, the change is immediate (UX-DR54)

### Story 1.20: [A26] Swiping between sections

As Mika,
I want to swipe sideways between sections on the phone,
So that moving around takes one thumb (UX-DR6, UX-DR54).

**Acceptance Criteria:**

**Given** a section on a screen under 900px
**When** I swipe left or right
**Then** the next or previous section opens, wrapping from the last to the first
**And** a swipe that starts within 24px of a screen edge is ignored
**And** swiping is suspended while anything registered through `useSuspendSwipe()` is open; the Scan task (Story 3.1) and the overlay wrappers (Stories 3.40, 3.41) register through it
**And** where it doesn't block input, the headings row and content slide in the direction of travel in about 200–300 ms; with reduce motion set, the change is immediate

### Story 1.21: [K1] Installable PWA

As Mika,
I want to install bookeh on my phone's home screen,
So that it opens like an app (FR-50, UX-DR56).

**Acceptance Criteria:**

**Given** `app/manifest.ts`
**When** I add bookeh to the home screen on iOS or Android
**Then** it is named "bookeh", has its icons, and opens standalone in the collection with no browser bars
**And** there is no service worker
**And** a desktop browser opens the same app
**And** the icon and the theme colour are picked by Mika from rendered options and recorded in DESIGN.md

### Story 1.22: [K9] Profile service

As the developer,
I want one place that reads and updates the profile,
So that Settings and later stories never write `users` directly (AD-18).

**Acceptance Criteria:**

**Given** `src/lib/account`
**When** the story is done
**Then** it exports `getProfile(ctx)` and `updateProfile(ctx, changes)` for display name and language, through the gateway
**And** a display name is trimmed, NFC-normalised and required
**And** integration tests prove a user cannot update another user's profile and cannot change `roles` through it

### Story 1.23: [K5] Settings

As Mika,
I want to set my name, language and theme and sign out,
So that bookeh is mine on every device (FR-4, UX-DR50).

**Acceptance Criteria:**

**Given** `/settings`
**When** I open it
**Then** I see my display name as a text field saved when I leave it, my email shown and not editable, a language switch English / Suomi, a theme switch light / dark / system, and Sign out as a secondary button
**And** changing the language switches the whole interface at once and is stored on the profile
**And** changing the theme applies at once and is stored per device, not on the profile
**And** a rejected display name shows its message under the field
**And** there is no password change
**And** Settings is laid out as in `mockups/key-settings.html`, except that wide screens have two columns (ruling 2026-10-06; the mock-up's third column is superseded): the profile, language, theme and Sign out in the first and the managed lists (added by later stories) in the second; one column on the phone
**And** this story builds the Text switch: chosen option in `text`, others in `text-dim`, switching at once with no confirm; lowercase except proper-name options such as the languages (UX-DR13)

### Story 1.24: [K10] Profile and collection visibility

As Mika,
I want my profile and collection visibility on my profile already,
So that friends can be added later without reworking accounts (FR-4, D-1).

**Acceptance Criteria:**

**Given** the `users` collection
**When** the story is done
**Then** it has `profileVisibility` (`public` | `hidden`, default `hidden`) and `collectionVisibility` (`open` | `closed`, default `closed`), written only through `lib/account`, with a committed migration
**And** Settings shows, in the first column after Theme, a Profile switch public / hidden and a Collection switch open / closed that save at once
**And** neither setting changes anything else in Phase 1

## Epic 2: My catalogue runs in production and is backed up

bookeh runs on the LXC behind `tailscale serve`, reachable from the phone, with data on the NAS and nightly backups to it. The restore is rehearsed at the cataloguing gate, once real data exists (Story 4.10).

### Story 2.1: [K2] Production image

As the developer,
I want every push to `main` to produce a runnable image,
So that the LXC never builds anything.

**Acceptance Criteria:**

**Given** `next.config.ts` and the Dockerfile
**When** the story is done
**Then** `output: 'standalone'` is set, the Dockerfile no longer copies a missing `public/` directory, and the image runs on `node:22.23.3-alpine`
**And** the CI workflow builds the image on every push to `main` after lint, typecheck and tests pass, and pushes it to GHCR tagged with the commit SHA and `latest`
**And** the image starts locally against the Compose Postgres with only environment variables from `.env.example`
**And** the build downloads Open Sans; the running container makes no font request

### Story 2.2: [K3] Production on the LXC

As Mika,
I want bookeh running on my LXC and reachable from my phone,
So that I can use it anywhere on my tailnet, with the camera working over HTTPS (NFR-4).

**Acceptance Criteria:**

**Given** `deploy/compose.prod.yml` and a deploy note in `deploy/README.md`
**When** the operator runs `docker compose pull && docker compose up -d` on the LXC
**Then** the app and `postgres:16-alpine3.24` (ICU `fi-FI`) start with restart policy `unless-stopped`; the image is pulled from GHCR with a read-only token; nothing is built on the LXC
**And** Postgres data and the media directory are bind-mounted to NAS storage
**And** the stack refuses to start unless the NAS paths are mounted: the systemd unit uses `RequiresMountsFor`, and a start check requires a marker file in the data directory, so Postgres never starts on an empty local directory
**And** the marker-file check runs in the Postgres container's entrypoint on every start, including restarts by Docker's restart policy
**And** the env file holding `SEED_PASSWORD` and the GHCR token is readable by the operator account only, and the token's expiry date is written in `deploy/README.md`
**And** migrations apply at start through `prodMigrations`; push is off
**And** `tailscale serve` exposes the app over HTTPS on the tailnet only, and the phone reaches the sign-in page there
**And** the seed variables create the first user on the empty production database
**And** exactly one app container runs (AD-12)

### Story 2.3: [K4] Nightly backups

As Mika,
I want the database and covers backed up every night,
So that a dead disk doesn't take my catalogue with it (NFR-6).

**Acceptance Criteria:**

**Given** `deploy/backup.sh` and a systemd timer on the LXC
**When** the timer fires nightly
**Then** it writes a `pg_dump` (custom format) and a copy of the media directory to the NAS backup path, and logs success or failure to the journal
**And** backup files and directories are readable by the operator account only
**And** dumps older than the retention set in this story are deleted, so erased data ages out; the number of days is written in `deploy/README.md`
**And** a manual run produces a dump that `pg_restore --list` reads without error
**And** the script refuses to dump, and logs an error, when the database has no `users` rows, so an empty database never overwrites good backups
**And** each run writes `last-backup.json` (time, outcome, dump size) to a path the app container can read
**And** the restore rehearsal itself is not part of this story; it happens at the cataloguing gate (Story 4.10)

## Epic 3: Scan a book and add it to my library

Scan or type an ISBN, see what the book is, and add it to the library in one tap at the default location, with Undo. An owned edition answers "In library" with Add another copy. An unknown ISBN is entered by hand as a private Book, shared automatically once a source knows it. "Couldn't look it up" offers Try again.

**Order.** Stories 3.1–3.2 open the epic. Then two lanes run side by side: the **lookup lane** (3.3–3.9, no database access) and the **schema lane** (3.10–3.26, schema stories merged one at a time with their migration, AD-13). The schema lane starts once 3.3 and 3.8 have merged, since both lanes use `isbnField`, `nameKeyField` and `processState`. The lanes join from 3.27. Within each lane, stories depend only on earlier stories.

**Base UI.** Story 3.40 adds the `@base-ui/react` dependency, its import lint rule and the dialog and sheet wrappers; Story 3.41 adds the combobox, menu and picker wrappers on top of them (slices A20 and A23).

### Story 3.1: [D9] Scan screen

As Mika,
I want to point my phone at a barcode or type an ISBN,
So that looking up a book starts in a second (FR-10, UX-DR44, UX-DR32).

**Acceptance Criteria:**

**Given** `/scan` in the installed PWA
**When** it opens
**Then** the camera starts with `@zxing/browser` inside the camera frame (2px `text` rectangle, accent guide line), and stays on until the task is closed with X
**And** only EAN-13 barcodes starting 978 or 979 are read; anything else is ignored
**And** a read barcode navigates to `/scan?isbn=<digits>` with no confirm tap
**And** the ISBN field submits with the keyboard's Go key to `/scan?isbn=<text as typed>`; the browser does not normalise
**And** with no camera or denied permission, the frame is replaced by "No camera. Type the ISBN." and the field takes focus (normal on desktop)
**And** until the Answer exists (Story 3.45), `/scan?isbn=` shows the submitted text under the field
**And** acceptance is on Mika's iPhone, in the installed PWA, over HTTPS (production or `tailscale serve` to the dev machine); the camera-permission behaviour in standalone mode is written in the story's notes

### Story 3.2: [C9] Real-book fixture capture

As the developer,
I want raw Finna and Google Books responses for real books from Mika's shelf,
So that the adapters are built against reality and the genre question is answered with data.

**Acceptance Criteria:**

**Given** a list of about 30 ISBNs from Mika's shelf (Finnish fiction, non-fiction, translations, old editions, at least one Google doesn't know)
**When** `scripts/capture-fixtures.ts` runs once against the live APIs
**Then** each response is stored as `tests/fixtures/finna/<isbn13>.json` and `tests/fixtures/google/<isbn13>.json`, including empty results
**And** the Finna query is verified against api.finna.fi/swagger and the fields requested are listed in the script
**And** `tests/fixtures/REPORT.md` records: found by Finna, by Google, by neither; covers per source; how many Google results have `categories`; sample Finna subjects (themes) and Finna genre terms
**And** the report states the genre coverage checkpoint result (D-2): whether Google categories cover at least half; if not, Epic 9 also maps Finna genre terms
**And** no test calls the network; the script is not part of the test suite

### Story 3.3: [B1] ISBN and name-key fields

As the developer,
I want one ISBN normaliser and one name key,
So that every service compares ISBNs and names the same way.

**Acceptance Criteria:**

**Given** `src/fields`
**When** the story is done
**Then** `normaliseIsbn(text)` accepts ISBN-10 and ISBN-13 with hyphens and spaces, validates the check digit, and returns 13 digits or fails with `INVALID_ISBN`
**And** `isbnField()` stores only the 13-digit form
**And** `nameKeyField()` maintains `nameKey` by hook: trimmed, inner whitespace collapsed, lower-cased, NFC, with no accent folding ("Äiti" and "aiti" differ)
**And** unit tests cover ISBN-10 to ISBN-13 conversion, hyphens, spaces, a bad check digit, and the name key on Finnish names
**And** ISBN-10 check digit `X` is accepted in either case
**And** a name that is empty after trimming is rejected with `VALIDATION` by every name-keyed collection

### Story 3.4: [C1] Source contract and merge

As the developer,
I want one shape every metadata source returns and one merge,
So that adding a source is one file and one array entry (AD-9).

**Acceptance Criteria:**

**Given** `src/lib/metadata`
**When** the story is done
**Then** it declares `SourceId`, `SourceResult` (authors with optional `sortName`, themes, per-source subjects), `SourcesOutcome`, `SearchHit`, `RawMetadata` and a `Source` interface with `id`, `lookupByIsbn(isbn13)` and optional `search(query)`
**And** `lookupByIsbn` returns the source's matching records best first (an empty list for none), and `SourceResult` and `SearchHit` carry an optional display-only `binding` (D-7)
**And** `mergeResults()` takes results in source order and takes each field from the first non-empty value
**And** `RawMetadata` keeps each source's complete raw response and its subjects per source (`subjects.<sourceId>`)
**And** unit tests with fake sources cover field-by-field merging, an empty first source, and raw data kept per source
**And** `lib/metadata` has no database access

### Story 3.5: [C2] Finna adapter: core fields

As Mika,
I want Finnish library data first,
So that my mostly Finnish books are recognised correctly (FR-11).

**Acceptance Criteria:**

**Given** the recorded Finna fixtures
**When** `finna.lookupByIsbn(isbn13)` runs against them
**Then** it returns title, subtitle, authors as "Given Family", publisher, year, language (ISO 639-1 where one exists), pages, description and cover URL, or nothing for an empty result
**And** with several records for one ISBN it returns all of them, best first (prefers one with a cover and subjects), each with its binding where the record states it for that ISBN (D-7)
**And** a result's `isbn13` is always the ISBN asked for, never another ISBN listed in the record
**And** text is trimmed and NFC-normalised
**And** it never throws; a failed or malformed response is logged and returns nothing
**And** tests run only against `tests/fixtures/finna/`

### Story 3.6: [C10] Finna adapter: series, themes and author sort names

As Mika,
I want series, numbers and themes from Finna,
So that series books and their topics come in without typing (FR-17a, D-3).

**Acceptance Criteria:**

**Given** the recorded Finna fixtures
**When** the adapter parses a record
**Then** it returns series and series index where the record has them, subject terms as themes, and each author's inverted form as `sortName` ("Family, Given")
**And** Finna's own genre terms stay in the raw response untouched
**And** fixtures with and without series, themes and inverted names are covered by tests

### Story 3.7: [C3] Google Books adapter

As Mika,
I want Google Books as the second source,
So that books Finna doesn't know still come in (FR-11).

**Acceptance Criteria:**

**Given** the recorded Google Books fixtures
**When** `google.lookupByIsbn(isbn13)` runs against them
**Then** it returns the same `SourceResult` fields it can fill, with `categories` kept as this source's subjects
**And** a volume counts only if its `industryIdentifiers` contain the ISBN asked for (as ISBN-13 or its ISBN-10); otherwise the result is nothing
**And** cover links are rewritten to `https` and ask for the largest image size Google offers
**And** an optional `GOOGLE_BOOKS_API_KEY` (listed in `.env.example`) is sent when set; a `429` or `403` is a failure (so the outcome can be `unavailable`), never "none"
**And** language codes are converted and authors emitted as "Given Family"
**And** it never throws, and tests run only against `tests/fixtures/google/`
**And** `sources/index.ts` lists Finna first, then Google Books

### Story 3.8: [A24] In-process state helper

As the developer,
I want one safe home for in-process state,
So that caches and limits are shared between pages, actions and route handlers (AD-12).

**Acceptance Criteria:**

**Given** `src/lib/processState.ts`
**When** `processState(key, init)` is called twice with the same key
**Then** both calls return the same object, kept on `globalThis`
**And** the module imports nothing from the project
**And** a unit test covers first call, repeat call and a second key

### Story 3.9: [C4] Lookup across sources

As Mika,
I want every source asked at once with a time limit,
So that a slow source never makes me wait and an outage is never taken as "no such book" (AD-9, NFR-1).

**Acceptance Criteria:**

**Given** `lookupSources(isbn13)` in `lib/metadata`
**When** it runs
**Then** it calls every source in parallel, each under a timeout set in this story, and merges in array order: one candidate per record of the first source that answered, each gap-filled from the other sources' best record (D-7)
**And** it returns `found` with the candidates (best first) and `RawMetadata`, `none` when every source answered with nothing, or `unavailable` when there is no result and a source failed or timed out
**And** `found` and `none` are cached in process by ISBN-13 with a bounded size; `unavailable`, and a result merged while a source failed, are never cached
**And** a circuit breaker per source, held in `processState`, skips a source for a cooldown after several timeouts or failures in a row; a skipped source counts as failed (so `none` is never cached), and it is tried again after the cooldown; the default is 3 timeouts or failures in a row and a 60 s cooldown, which the story may tune against the fixtures
**And** tests with fake sources cover all three outcomes, a timeout, and the cache rules

### Story 3.10: [A11] Transactions and the Drizzle helper

As the developer,
I want one way to open a transaction,
So that a save is all or nothing (AD-16).

**Acceptance Criteria:**

**Given** `lib/payload`
**When** `withTransaction(ctx, fn)` runs
**Then** it opens a transaction and hands `fn` a context carrying it; called with a context that already has one, it joins it
**And** gateway functions and the Drizzle helper use the context's transaction when present
**And** integration tests prove a throw inside `fn` rolls back every write, and a Drizzle read inside the transaction sees rows written earlier in it

### Story 3.11: [A12] Owner and relation fields

As the developer,
I want shared field helpers for ownership and relations,
So that private rows always have an owner and never point at someone else's rows (AD-1, AD-17).

**Acceptance Criteria:**

**Given** `src/fields`
**When** the story is done
**Then** `ownerField()` is a required relation to `users`, set by hook from `req.user` on create, never accepted from input, never changed, and throws when there is no `req.user`
**And** `ownedRelation(slug)` and `readableRelation(slug)` re-read the target through `asRequestUser(req)` and reject a target the user cannot read
**And** a throwaway test collection proves: owner set from the request, owner in input ignored, a foreign id rejected

### Story 3.12: [A18] Media

As the developer,
I want covers stored privately and safely,
So that only signed-in users can load them and filenames reveal nothing (AD-14).

**Acceptance Criteria:**

**Given** the `media` collection
**When** the story is done
**Then** read requires a signed-in user, create and delete are allowed only with system privileges from `lib/catalogue` or to the admin, and stored filenames are random
**And** an access test proves a signed-out request for a media file is refused and a user cannot create a media row through the gateway
**And** the migration is committed

### Story 3.13: [B10] Author sort names

As Mika,
I want authors sorted by family name,
So that Finnish and particle names sort where I expect.

**Acceptance Criteria:**

**Given** `sortNameField()` in `src/fields`
**When** a record is saved with an empty `sortName`
**Then** the hook derives "Family, Given" from `name`, last word first
**And** a `sortName` passed in is kept
**And** a name containing a comma ("Jansson, Tove") is taken as already inverted and becomes its own `sortName`
**And** corporate names get a derived `sortName` that may be wrong; the admin corrects it in the back office
**And** unit tests cover single names, Finnish names, and particle names such as "Tove Jansson", "Aleksis Kivi" and "Ludwig van Beethoven"

### Story 3.14: [B11] Book field set

As the developer,
I want the Book's fields declared once,
So that `books` and overrides in `user-books` cannot drift apart (AD-6).

**Acceptance Criteria:**

**Given** `src/fields/bookFields.ts`
**When** the story is done
**Then** it declares the Book fields (title, subtitle, authors, series, series index, publisher, year, language, pages, description, cover, genres, themes) and marks which are overridable: all except ISBN-13, cover (D-4: covers change only through `setCover`), genres (D-6) and themes (D-3)
**And** a unit test asserts the overridable list
**And** text fields carry maximum lengths: title and subtitle 500, description 10,000; names in every name-keyed collection 200 and copy notes 2,000 are set in their own stories; longer input fails with `VALIDATION`

### Story 3.15: [B3] `authors` collection

As the developer,
I want authors shared or private with a sort name,
So that names match across Books and private names never leak (AD-4, AD-19).

**Acceptance Criteria:**

**Given** the `authors` collection
**When** the story is done
**Then** it has `name`, `nameKey`, `sortName`, `visibility` and `createdBy`; users read `visibility = shared OR createdBy = me`, admin reads all, and users never write (AD-4, AD-5)
**And** `nameKey` is unique among shared authors and per `createdBy` among private ones, as database constraints
**And** an access test covers another user's private author and a user write attempt

### Story 3.16: [B4] `series` collection

As the developer,
I want series with the same rules as authors,
So that series match by name and private ones stay private.

**Acceptance Criteria:**

**Given** the `series` collection
**When** the story is done
**Then** it has `name`, `nameKey`, `visibility` and `createdBy`, with the rules and constraints of `authors` and no `sortName`
**And** an access test covers another user's private series and a user write attempt

### Story 3.17: [B5] `genres` collection

As the developer,
I want shared system genres with English and Finnish names,
So that genres can be seeded, created on save and translated later (D-2).

**Acceptance Criteria:**

**Given** the `genres` collection
**When** the story is done
**Then** it has `name` (English), optional `nameFi` and `nameKey` on `name`, unique as a database constraint
**And** genres are shared only; users read them and cannot write them; admin can
**And** `genreName(genre, locale)` returns `nameFi` in Finnish when present, else `name`; every place that shows a genre uses it
**And** an access test covers a user write attempt

### Story 3.18: [B2] `books` collection

As the developer,
I want the shared and private Book in one collection,
So that copies and entries always point at one kind of record (AD-4, AD-5, AD-19).

**Acceptance Criteria:**

**Given** the `books` collection built from `bookFields`
**When** the story is done
**Then** it has `isbn13`, `visibility` (`shared` | `private`), `createdBy` (set by hook from `req.user` for private, empty for shared), `source`, admin-only `rawMetadata`, and `genres`, a has-many relation to `genres` written only by `mapSubjectsToGenres()` and admin edits
**And** users have no create, update or delete access; users read `visibility = shared OR createdBy = me`; admin reads all
**And** unique constraints exist from the first migration: `isbn13` among shared Books, `(createdBy, isbn13)` among private Books
**And** after applying all migrations to an empty database, both partial constraints exist, and generating a migration afterwards produces no changes
**And** an access test proves a user cannot read another user's private Book or any `rawMetadata`, and cannot write a Book
**And** the migration is committed

### Story 3.19: [B6] `user-books` collection

As the developer,
I want each user's overrides, read flag and rating on one row per Book,
So that a user's edits never change shared data (AD-6, AD-8).

**Acceptance Criteria:**

**Given** the `user-books` collection with `ownerField()`
**When** the story is done
**Then** it has a `book` relation, the overridable fields from `bookFields` (relations built with `readableRelation`), `overridden` (JSON array of field names), `read`, `rating` (1–5 or empty) and `ratedAt`
**And** `(owner, book)` is unique as a database constraint
**And** read, update and delete are `owner = current user` for every role, admin included
**And** an access test proves user B and the admin cannot read user A's row, and a row cannot point at another user's private Book

### Story 3.20: [B7] `copies` collection

As the developer,
I want copies owned per user,
So that each physical book is a private row (AD-1, AD-8).

**Acceptance Criteria:**

**Given** the `copies` collection with `ownerField()`
**When** the story is done
**Then** it has `book` (readable relation), `status` (`ordered` | `owned`) and `notes`
**And** read, update and delete are `owner = current user` for every role, admin included
**And** an access test with a foreign id proves a copy cannot point at another user's private Book, and user B and the admin cannot read user A's copy

### Story 3.21: [F1] Locations and the default location

As Mika,
I want my own list of places,
So that each copy can say where it is (FR-31, FR-32).

**Acceptance Criteria:**

**Given** the `locations` collection with `ownerField()` and `nameKeyField()`
**When** the story is done
**Then** `copies.location` and `users.defaultLocation` are `ownedRelation('locations')`
**And** `nameKey` is unique per owner as a database constraint
**And** a copy hook rejects a location on an ordered copy
**And** an access test with a foreign id proves a copy or a default location cannot point at another user's location

### Story 3.22: [B8] Effective Book

As the developer,
I want one reader that applies the viewer's overrides,
So that every screen shows a Book the same way (AD-6, AD-10, FR-27).

**Acceptance Criteria:**

**Given** `lib/books`
**When** `getEffectiveBooks(ctx, bookIds)` runs
**Then** it returns `EffectiveBook` per id with the viewer's overrides applied (an overridden field with an empty value is cleared), and `themes`
**And** a missing `user-books` row means no overrides
**And** `coverUrl()` produces the only media URLs the frontend uses
**And** integration tests cover no row, an override, a cleared field, and two users seeing their own overrides on one Book

### Story 3.23: [B9] `upsertUserBook`

As the developer,
I want one writer of `user-books`,
So that overrides, read flags and ratings are written one way (AD-6, AD-18).

**Acceptance Criteria:**

**Given** `upsertUserBook(ctx, bookId, changes)` in `lib/books`
**When** it runs
**Then** it creates the row on first write and updates it after, inside the context's transaction
**And** it keeps `overridden` in step with the override fields it writes
**And** integration tests cover create, update, and a concurrent second create hitting the unique constraint

### Story 3.24: [E26] Holdings

As the developer,
I want one reader of what a user holds of a Book,
So that the Answer, Book detail and rows agree (AD-9).

**Acceptance Criteria:**

**Given** `getHoldings(ctx, bookIds)` in `lib/books`
**When** it runs
**Then** it returns `Holdings` per Book with each of the viewer's copies as a `CopyLine` (status, location, note; loan empty until Epic 6) and open entries empty until Epic 7
**And** a two-user test proves another user's copies never appear

### Story 3.25: [U1] Undo receipts

As the developer,
I want one Undo mechanism,
So that every undoable action works the same way (AD-20).

**Acceptance Criteria:**

**Given** `lib/undo`
**When** `withUndo(ctx, fn)` runs an undoable service function
**Then** it opens the transaction, runs `fn`, records the returned restore after commit in a bounded `processState` store keyed by an opaque `undoToken` and the user, and returns the result with the token
**And** `undo(ctx, token)` uses the token once and runs the restore in one transaction; any failure restores nothing and returns `UNDO_FAILED`
**And** a token from another user, a used token, an expired token, or a token after restart returns `UNDO_FAILED`
**And** receipts live 30 minutes, and the result carries the seconds remaining on the token (not an absolute time, so clock skew between phone and server doesn't matter); the store size is set in this story
**And** tests cover each case with a fake undoable function

### Story 3.26: [U2] Undo on the toast

As Mika,
I want an Undo link on the toast,
So that I can take back an action in one tap (FR-15, UX-DR27, UX-DR52).

**Acceptance Criteria:**

**Given** a toast for a result carrying an `undoToken`
**When** I tap Undo
**Then** `undoAction` runs and the toast becomes "Undone" for a moment, or "Couldn't undo." on failure
**And** a toast without a token shows no Undo, and a toast hides its Undo once the token's seconds remaining have run out on the client (a save toast left on Scan)

### Story 3.27: [C5] Name matching for authors and series

As Mika,
I want authors and series matched to existing ones by name,
So that one author never appears twice (FR-17, AD-5).

**Acceptance Criteria:**

**Given** `findOrCreateByName()` in `lib/catalogue`
**When** it runs for a shared Book
**Then** it matches shared records by `nameKey` and creates shared ones that are missing, passing the source's `sortName` for authors
**And** for a private Book it matches shared records first, then the user's private ones, and creates private records
**And** an existing author keeps its `sortName` unless a source passes one and the stored value is still derived
**And** integration tests cover case differences, a private match, and two users' private authors with the same name

### Story 3.28: [C6] Look up a Book by ISBN

As Mika,
I want lookup to find my own Book first, then the sources,
So that known books answer fast and nothing is saved by looking (FR-11, AD-9).

**Acceptance Criteria:**

**Given** `lookupBook(ctx, { isbn })` in `lib/catalogue`
**When** it runs with the ISBN as entered
**Then** it normalises it (failing with `INVALID_ISBN`), returns `existing` for a shared Book with that ISBN or the user's own private one, with `mine` from `getHoldings`, and otherwise maps `lookupSources` to `source`, `none` or `unavailable`
**And** when the answer is the user's own private Book it also runs `lookupSources`, so a later save can share it
**And** it writes nothing to the database
**And** integration tests cover each kind and prove another user's private Book is never returned

### Story 3.29: [C11] New authors and series on the lookup result

As Mika,
I want to see which author or series a save would create,
So that I notice a misspelt name before it lands (FR-13).

**Acceptance Criteria:**

**Given** a `source` lookup result
**When** it is built
**Then** `matches` lists each author and the series with the existing record's id, or `null` when the save would create it, using the same matching as `findOrCreateByName()` without writing
**And** tests cover an existing author, a new author and a new series

### Story 3.30: [C7] Lookup rate limit

As Mika,
I want lookups limited per user,
So that a runaway client can't hammer Finna and Google in my name (FR-11).

**Acceptance Criteria:**

**Given** `lookupBook`
**When** a user exceeds the per-user limit set in this story
**Then** it fails with `RATE_LIMITED`, and the limit is held in process and shared with search later
**And** a test covers the limit and its reset

### Story 3.31: [D1] Ensure a shared Book

As the developer,
I want a shared Book created from the server-held source result,
So that shared values never come from the client (AD-5, FR-18).

**Acceptance Criteria:**

**Given** an ISBN-13 with a `found` source outcome held server-side
**When** `ensureSharedBook(ctx, isbn13)` runs inside a transaction
**Then** it returns the existing shared Book or creates one with the merged values, `source`, `themes`, `rawMetadata`, and authors and series through `findOrCreateByName()`
**And** on a cache miss it re-runs `lookupSources`; it never takes Book values from the client
**And** it calls `mapSubjectsToGenres()`, which returns no genres until Epic 9
**And** integration tests cover create, reuse, and two concurrent creates for one ISBN

### Story 3.32: [D2] Cover download

As Mika,
I want the cover saved with the Book,
So that covers load fast and never come from the sources in my browser (AD-14).

**Acceptance Criteria:**

**Given** a new shared Book whose source result has a cover URL
**When** it is saved
**Then** `lib/catalogue` downloads the bytes before the transaction opens and creates the `media` row inside it
**And** a failed download saves the Book without a cover and logs
**And** covers are fetched only over `https` from an allowlist of source image hosts (Finna's image service, Google's image hosts), with a size limit and a timeout
**And** files are written under a temporary name and renamed into place only when complete; a failed write (for example a full disk) leaves no file behind
**And** at app start, `onInit` deletes files in the media directory that have no `media` row and are older than an hour, and logs the count
**And** a rolled-back save deletes the file it wrote
**And** tests use a local fixture server, not the network

### Story 3.33: [D3] Create a copy

As the developer,
I want one function that creates copies,
So that every path creates them the same way (AD-18).

**Acceptance Criteria:**

**Given** `createCopy(ctx, input)` in `lib/copies`
**When** it runs
**Then** it creates an owned or ordered copy for the context's user through the gateway, inside the context's transaction
**And** it is the only insert into `copies` in the codebase
**And** integration tests cover owned, ordered, and a foreign Book id rejected

### Story 3.34: [F2] Default location on new copies

As Mika,
I want new copies to land at my default location,
So that I never type "Tampere" two hundred times (FR-4, FR-31).

**Acceptance Criteria:**

**Given** `createCopy`
**When** an owned copy is created with `location` undefined
**Then** it gets the profile's default location; `null` means none; an ordered copy has no location
**And** `lib/copies` resolves a location `Ref` (an id, or a name to create) by `nameKey`, creating the location inline when missing
**And** integration tests cover the default, none, an inline-created location, and a name differing only in case matching the existing one

### Story 3.35: [D4] Save a copy

As Mika,
I want Add to library to save everything in one go,
So that a book is either saved completely or not at all (FR-21, AD-11).

**Acceptance Criteria:**

**Given** `saveCopy(ctx, SaveInput)` in `lib/catalogue`
**When** it runs with an `{ isbn13 }` target and `save: { kind: 'copy' }`
**Then** in one transaction it ensures the Book (cover downloaded first) and creates an owned copy at the default location, returning `SaveResult` with the location
**And** an `{ isbn13 }` target resolves to the shared Book with that ISBN, else my own private Book with it (Story 3.38), else a shared Book ensured from the held outcome
**And** the `{ bookId }` target is not accepted yet; it arrives with `requireOwnBook()` (Story 4.1)
**And** a failure leaves no Book, copy, author, series or media row behind

### Story 3.36: [D32] A repeated save returns the first result

As Mika,
I want a double tap or a retried request to save once,
So that I never get two copies by accident (AD-11).

**Acceptance Criteria:**

**Given** `SaveInput.requestId`, generated by the client per press
**When** the same user repeats a recent `requestId`
**Then** the save returns the first result and writes nothing
**And** concurrent repeats of one `requestId` save once
**And** the same `requestId` from another user is unrelated
**And** the memory of recent ids is bounded `processState` and safe to lose on restart; its size and window are set in this story

### Story 3.37: [D6] Undo a save

As Mika,
I want Undo after Add to library,
So that a wrong scan costs one tap (FR-15, AD-11).

**Acceptance Criteria:**

**Given** `saveCopy` returning `Undone<SaveResult>`
**When** its restore runs
**Then** it deletes the copy, and deletes a Book, author, series or media row the save created only when `isUnreferenced()` finds no reference from any row of any user
**And** it deletes a `user-books` row the save created only when the user has no other copy of the Book
**And** if the copy has gained a loan since the save, the restore fails with `UNDO_FAILED` and changes nothing ("Couldn't undo."); this case is tested in Story 6.5, once loans exist
**And** an integration test saves, undoes, and proves the database is as before; a second test proves a Book another user also holds survives the undo

### Story 3.38: [D7] Private Book from manual entry

As Mika,
I want to add a book no source knows by typing title and author,
So that every book I own can be catalogued (FR-12, FR-22).

**Acceptance Criteria:**

**Given** `SaveInput` with `{ manual: { isbn?, title, authors } }`
**When** `saveCopy` runs
**Then** it creates a private Book with `createdBy` set, private authors where no shared or own private one matches, and the copy
**And** title and at least one author are required, trimmed and NFC-normalised
**And** scanning the same ISBN again returns this Book, not a duplicate
**And** integration tests prove another user cannot see the private Book or its private author

### Story 3.39: [D8] Share my private Book when a source knows it

As Mika,
I want a hand-entered book to become a normal shared Book once a source finds its ISBN,
So that my manual entries don't stay second-class (FR-12, AD-5).

**Acceptance Criteria:**

**Given** my private Book with an ISBN, and a `found` source outcome held server-side for it
**When** I save another copy of it
**Then** inside the save transaction the row keeps its id, takes the values of the candidate the Answer picked (D-7), its authors and series are re-matched to shared records, `visibility` becomes shared and `createdBy` clears
**And** as admin, my differing hand-entered values are dropped; as another user, they become my overrides (FR-12, D-8)
**And** if a shared Book with that ISBN already exists, my copies and `user-books` row move to it and my private Book is deleted (my wishlist entries move too from Epic 7, Story 7.7)
**And** the save never calls the sources itself, and other users' private Books are never touched
**And** undoing the save removes the copy and leaves the Book shared

### Story 3.40: [A20] Dialog and sheet wrappers

As the developer,
I want the dialog and bottom sheet wrapped once,
So that confirmations and sheets behave the same everywhere (UX-DR24, UX-DR26, UX-DR9).

**Acceptance Criteria:**

**Given** `@base-ui/react` 1.8.0 and `components/ui`
**When** the story is done
**Then** ESLint rejects importing `@base-ui/react` outside `components/ui`
**And** the dialog is centred, at most 400px, outlined, over the scrim, with buttons right-aligned and the confirming one on the right; `Esc` and tapping outside cancel
**And** the bottom sheet is full width with a 2px top edge, a handle, the scrim above; it opens a little over half the screen, drags up to full and down to close, and closes on tapping the dimmed area, X or Back
**And** both are modal: focus moves in, is held, and returns to the opener on close
**And** nothing opens on top of a picker or dialog opened from a sheet (one overlay deep)
**And** the list under a sheet keeps its scroll position
**And** the sheet slides up while the list dims; with reduce motion set, it appears at once (UX-DR54)

### Story 3.41: [A23] Base UI and the combobox, menu and picker wrappers

As the developer,
I want the overlay primitives wrapped once,
So that every screen uses the same accessible combobox, menu and picker (UX-DR15, UX-DR25).

**Acceptance Criteria:**

**Given** the Base UI dependency and the dialog and sheet wrappers (Story 3.40)
**When** the story is done
**Then** `components/ui` has combobox, menu and picker wrappers styled from the tokens: the combobox popup is an outlined box under the field with the selection bar on the highlighted option and the marker on the chosen one, and offers to create a value that doesn't exist
**And** the picker is the bottom sheet under 900px and the dialog at 900px and up, and closes after one choice
**And** Back closes an open picker inside its wrapper

### Story 3.42: [K11] Default location in Settings

As Mika,
I want to set my default location in Settings, adding it if it's new,
So that every book I add lands there (FR-4, UX-DR50).

**Acceptance Criteria:**

**Given** `/settings`
**When** I type in the Default location combobox
**Then** it offers my locations and lets me create a new one from the same field; choosing saves at once through `lib/copies` (resolving the `Ref`) and `lib/account`
**And** the field can be cleared, leaving no default
**And** with no locations yet, the combobox is empty and still accepts a new name

### Story 3.43: [D10] Cover component and cover preview

As Mika,
I want covers shown everywhere, including before I save,
So that I recognise the book at a glance (FR-13, AD-14, UX-DR19).

**Acceptance Criteria:**

**Given** the `Cover` component and `/data/cover/[isbn13]`
**When** a cover is rendered
**Then** `Cover` is a plain `img` from `coverUrl()`, 2:3, square corners, with the placeholder (outlined `text-dim` rectangle with the title in `text-muted`) when there is none
**And** the route handler requires a signed-in user and streams the cover for an ISBN-13 from the source URL recorded server-side during a lookup; it never takes a URL from the client and returns 404 when none is recorded
**And** it fetches only through the same host allowlist, size limit and timeout as the cover download

### Story 3.44: [A25] Client helper for actions and data requests

As Mika,
I want lost connections and expired sessions handled the same way everywhere,
So that an action never fails silently (UX-DR51).

**Acceptance Criteria:**

**Given** the client helper wrapping server actions and `/data` fetches
**When** the network fails
**Then** it returns `NO_CONNECTION`, which shows the error toast "No connection." and queues nothing
**And** an `UNAUTHENTICATED` result moves to `/login?next=<current address>`
**And** a call to a server action that no longer exists after a deploy shows "bookeh was updated." with a Reload Link; each image build sets its own deployment id, configured after checking the bundled Next.js docs

### Story 3.45: [D16] Answer: not in library

As Mika,
I want to see what the scanned book is,
So that I can decide whether to add it (FR-13, FR-20, UX-DR46).

**Acceptance Criteria:**

**Given** `/scan?isbn=<text>` rendered on the server from `lookupBook`
**When** the result is `source`, or `existing` where I hold no copy and no entry (then without the source line and new-record notes)
**Then** the full-screen Answer shows the heading "not in library", the cover preview, title, author, edition line, "From Finna" (or the first source that answered), and "New author" / "New series" for records the save would create
**And** it never names another user
**And** an invalid ISBN keeps Scan open with "Not an ISBN. Thirteen digits, or ten." under the field in danger
**And** a `RATE_LIMITED` lookup keeps Scan open with the toast "Too many lookups. Wait a moment."
**And** the progress line runs on Scan while the lookup is in flight
**And** Back returns to Scan with nothing saved; X leaves scanning; each Answer replaces the previous one in history
**And** on wide screens the Answer is a centred column no wider than a phone

### Story 3.46: [D17] Add to library

As Mika,
I want one tap to add the book and get back to scanning,
So that cataloguing a stack takes seconds per book (FR-21, FR-15, NFR-2).

**Acceptance Criteria:**

**Given** the Not in library Answer
**When** I tap Add to library (the primary button)
**Then** the save action runs `saveCopy` with a client-generated `requestId`, returns to Scan, and shows "Saved to {location}", or "Saved" with no default location
**And** a double tap saves once
**And** a failed save shows the error toast "Couldn't save. Try again." and leaves the Answer as it was
**And** the save toast stays until the next Answer opens
**And** scan to save takes under 20 s on the phone when no edits are needed

### Story 3.47: [D18] Undo on the save toast

As Mika,
I want Undo on "Saved to Tampere",
So that a wrong book disappears with one tap (FR-15).

**Acceptance Criteria:**

**Given** the save toast after Add to library
**When** I tap Undo
**Then** the save is undone through `withUndo` and `undoAction`, and the toast becomes "Undone"
**And** Undo is unavailable after an app restart

### Story 3.48: [D25] Answer: in library

As Mika,
I want a scan of a book I own to say so, with where it is,
So that I don't buy or add it twice by mistake (FR-16, FR-20, FR-30).

**Acceptance Criteria:**

**Given** an `existing` lookup result where I hold at least one copy
**When** the Answer renders
**Then** the heading is "in library", and each copy is a line with its location
**And** Add another copy sends `{ isbn13 }` (Story 3.35) and saves another owned copy at the default location with the same toast and Undo as Add to library, and Back is primary
**And** Open book arrives in Epic 5; until then it is absent

### Story 3.49: [D26] Answer: not found, entered by hand

As Mika,
I want to type title and author when no source knows the book,
So that I can still add it (FR-12, FR-22).

**Acceptance Criteria:**

**Given** a `none` lookup result
**When** the Answer renders
**Then** the heading is "not found", with title and author fields, both required, then Add to library (primary) and Back
**And** Add to library saves a private Book with the typed ISBN through the manual save path, with the save toast and Undo
**And** a missing field shows its message under the field
**And** Add to wishlist arrives in Epic 7
**And** Scan has an "Add without ISBN" Link that opens `/scan?title=` (optionally with text): the same Answer with an empty title field and no ISBN, saving a private Book without an ISBN, so books with no barcode can be catalogued from the start

### Story 3.50: [I9] Answer: couldn't look it up

As Mika,
I want to know when the sources didn't answer,
So that an outage is never mistaken for "no such book" (AD-9).

**Acceptance Criteria:**

**Given** an `unavailable` lookup result and nothing in my library
**When** the Answer renders
**Then** the heading is "couldn't look it up" and it names which sources didn't answer ("Finna and Google Books didn't answer.")
**And** Try again (primary) runs the lookup once more and Back returns to Scan
**And** "Add by hand" unfolds the Not found fields and buttons in place

### Story 3.51: [D23] Scan loop rules

As Mika,
I want the scanner to behave in a stack of forty books,
So that it never rescans the book I just handled (UX-DR44, UX-DR8).

**Acceptance Criteria:**

**Given** Scan with the camera on
**When** a lookup is running or an Answer is showing
**Then** reading pauses
**And** after an Answer closes, the ISBN just handled is ignored until it has left the camera's view
**And** each Answer replaces the previous one in history, so Back from Scan returns to the section

### Story 3.52: [D15] End-to-end: scan to save

As the developer,
I want a Playwright test of the main flow,
So that cataloguing can't silently break (Tests convention).

**Acceptance Criteria:**

**Given** a fixture metadata source and an ISBN entered by hand
**When** the Playwright test runs
**Then** it signs in, opens Scan, enters the ISBN, sees "not in library" with "From" the fixture source, taps Add to library, sees "Saved to {location}", taps Undo, sees "Undone", and saves again
**And** it makes no network call outside the app
**And** the fixture source is enabled by `BOOKEH_SOURCES=fixture`, which the app refuses under `NODE_ENV=production`; it serves the `tests/fixtures/` responses, and its covers come from a local test route allowlisted only under that setting

### Story 3.53: [C12] Pick the edition

As Mika,
I want to choose between editions when a lookup finds more than one,
So that my Book gets the paperback's or the hardcover's details, whichever I hold (D-7).

**Acceptance Criteria:**

**Given** a `source` lookup result with more than one candidate
**When** the Answer renders
**Then** under the Book it says "{n} editions found" as a Link, with the best candidate preselected; the Link opens a picker listing each candidate's binding, year, publisher, pages and cover
**And** picking one re-renders the Answer with `?pick=<n>` (replacing the history entry), including its cover preview and new-record notes
**And** Add to library (and Add to wishlist, once Epic 7 adds it) sends `{ isbn13, pick }`; the server takes the values from its held candidates, re-running the lookup on a cache miss, and the Book keeps the scanned ISBN
**And** a `pick` out of range falls back to the best candidate
**And** with one candidate, or an existing shared Book, nothing about editions is shown
**And** tests cover two Finna records for one ISBN from the fixtures

## Epic 4: Fix fetched data and add covers

Edit book from the save toast or by address: the first screen, More details, Save. As admin, Mika's edits to a shared Book change it for everyone (D-8); other users' edits are their overrides; edits to his private Book change it. Edit on the toast also shows the new copy's status and location. The admin, or a private Book's creator, adds, replaces or removes a cover, straightened and cropped to 2:3 by dragging four corners.

**Cataloguing gate.** Stories 4.1–4.9 plus Epics 1–3 open the gate; Story 4.10 rehearses the restore once real books are in. The cover stories (4.11–4.14) may land after real cataloguing has started.

### Story 4.1: [E21] Only my own Books by id

As Mika,
I want a Book reachable by id only when I hold it,
So that guessing an id never opens the shared catalogue (AD-7).

**Acceptance Criteria:**

**Given** `requireOwnBook(ctx, bookId)` in `lib/books`
**When** it runs
**Then** it passes only when the viewer has a copy of that Book (open wishlist entries are added in Epic 7), and otherwise fails with `NOT_FOUND`
**And** `saveCopy` now accepts a `{ bookId }` target guarded by it
**And** a two-user test proves user B cannot pass it for user A's Book, shared or private

### Story 4.2: [D5] Edit a shared Book

As Mika,
I want my fixes to a fetched Book to stick, for everyone when I fix them as admin,
So that wrong source data is corrected once (FR-14, AD-5, AD-6, D-8).

**Acceptance Criteria:**

**Given** `editBook(ctx, EditBookInput)` in `lib/catalogue` and a shared Book I hold
**When** I submit sparse `BookEdits` with scalar fields (title, subtitle, series index, publisher, year, language, pages, description)
**Then** as admin, each submitted field is written to the shared Book itself through `lib/catalogue` with system privileges (guarded by `canEditShared`), including a cleared field, and my own override of that field, if any, is cleared; system genres may be submitted too
**And** as a non-admin user, each submitted field becomes my override through `upsertUserBook`, including a cleared field; the shared Book does not change, and genres are rejected (D-6)
**And** unsubmitted fields are untouched; the server never diffs; themes are rejected for everyone
**And** a two-user test proves an admin's edit is seen by another user, and a user's edit is not
**And** `editBook` is not undoable

### Story 4.3: [D19] Edit authors and series

As Mika,
I want to fix an author or series name,
So that a misspelt or missing author doesn't stay wrong in my view (FR-13, FR-14).

**Acceptance Criteria:**

**Given** `editBook` with `authors` (names) or `series` (a name or null)
**When** it runs on a shared Book
**Then** as admin, names are matched and created among shared records only, and the shared Book's authors and series are updated (D-8)
**And** as a non-admin user, each name is matched with `findOrCreateByName()` (shared first, then my private ones), a name matching nothing becomes my private record, and the result is stored as my relationship override
**And** integration tests prove another user sees the admin's change, and sees neither a user's override nor their new private author

### Story 4.4: [D20] Edit my private Book

As Mika,
I want my edits to a hand-entered Book to change the Book itself,
So that my own entries are simply correct (FR-14, AD-5).

**Acceptance Criteria:**

**Given** `editBook` on my own private Book
**When** it runs
**Then** the edits update the Book itself, not an override
**And** an ISBN can be added; it is normalised, and a clash with my other private Book fails with a field error
**And** system genres can be picked from the existing list (D-6)
**And** editing another user's private Book fails with `NOT_FOUND`

### Story 4.5: [D24] Copy status, note and removal

As the developer,
I want the remaining copy writes in `lib/copies`,
So that status, notes and removal follow one rule set (AD-8, AD-18).

**Acceptance Criteria:**

**Given** `lib/copies`
**When** `setStatus`, `setNote` and `removeCopies` run
**Then** setting ordered clears the location; setting owned uses the default location unless one is given
**And** a note is trimmed and NFC-normalised and may be empty
**And** `removeCopies` takes a list of copy ids and removes all or none in one transaction (loans are removed with them from Epic 6)
**And** integration tests cover each, and a foreign copy id fails with `NOT_FOUND`

### Story 4.6: [F6] Move copies

As Mika,
I want to move copies to another location with Undo,
So that a box going to the cottage is one action (FR-33, AD-18, AD-20).

**Acceptance Criteria:**

**Given** `moveCopies(ctx, copyIds, location: Ref | null)` in `lib/copies`
**When** it runs
**Then** every listed copy moves in one transaction, all or none; an ordered copy in the list fails the whole move with a field error
**And** it returns a restore that puts each copy back where it was
**And** an integration test moves two copies, undoes, and finds both at their old locations; an inline-created location stays after Undo

### Story 4.7: [D21] Edit book screen

As Mika,
I want an edit screen for a Book,
So that I can fix what the source got wrong (FR-13, UX-DR47).

**Acceptance Criteria:**

**Given** `/books/[bookId]/edit` for a Book that passes `requireOwnBook`
**When** it opens
**Then** it is full screen (a centred column on wide screens) with the cover, title, author and source, and Save pinned at the bottom
**And** Save sends only changed fields to `editBook`, returns to where I came from (history back, `/` as fallback) and shows "Saved" with no Undo
**And** X or Back with unsaved changes asks "Discard changes?" in a dialog
**And** unsaved changes are kept in `sessionStorage` per Book, so a Save that ends at sign-in (`UNAUTHENTICATED`) finds them restored when Edit book reopens; they are cleared on Save or Discard
**And** a rejected field shows its message under the field
**And** a Book I don't hold shows the section without it and the toast "Not in library"

### Story 4.8: [D27] More details on Edit book

As Mika,
I want every field editable,
So that series numbers, years and descriptions can be fixed too (FR-13).

**Acceptance Criteria:**

**Given** Edit book
**When** I tap "More details"
**Then** title, subtitle, authors, series, number in series, publisher, year, language, pages and description unfold in place, pre-filled with my effective values
**And** authors and series are text fields, matched on Save through `findOrCreateByName()`; suggestions arrive with Story 5.9 (AD-7 forbids listing authors or series directly)
**And** on my private Book, ISBN and system genres are editable too; on a shared Book, system genres are editable for the admin (D-8) and shown read-only to others; themes are always shown, not editable

### Story 4.9: [D22] Edit from the save toast

As Mika,
I want Edit on the save toast to show the new copy too,
So that I can mark it ordered or put it elsewhere right after adding (FR-13, FR-28).

**Acceptance Criteria:**

**Given** the save toast "Saved to {location} · Edit · Undo"
**When** I tap Edit
**Then** Edit book opens at `/books/{bookId}/edit?copy={copyId}` with that copy's status (owned / ordered switch) and location (combobox with inline add) on the first screen, showing their saved values
**And** Save writes the Book edits, status and location in one transaction through `editBook`, `setStatus` and `moveCopies`
**And** choosing ordered hides the location and clears it on Save
**And** Save returns to Scan with the toast "Saved"
**And** from here, a copy set to ordered shows on the In library Answer as a line "Ordered" (the Ordered heading arrives in Story 8.2)

### Story 4.10: [K12] Rehearsed restore at the cataloguing gate

As Mika,
I want proof that the backup brings my catalogue back,
So that I can trust it before two hundred books are in (NFR-6).

**Acceptance Criteria:**

**Given** production holding the first real books and covers, and a nightly backup from Story 2.3
**And** before real cataloguing began, it was confirmed that production held no books, authors, series or covers; any found were removed by recreating the production database
**When** the operator restores the latest dump and media copy into a scratch Postgres (ICU `fi-FI`) and a scratch media directory, and starts the app image against them
**Then** sign-in works, the collection count matches production at the dump time, and covers load
**And** the steps and the time taken are written in `deploy/README.md`

### Story 4.11: [D28] Media visibility

As the developer,
I want media rows to carry visibility,
So that a private Book's cover is visible only to its creator (D-4, AD-4).

**Acceptance Criteria:**

**Given** the `media` collection
**When** the story is done
**Then** it has `visibility` (`shared` | `private`) and `createdBy`, and read is `shared OR createdBy = me` for users, all for admin
**And** source-downloaded covers are shared; the migration marks existing rows shared
**And** an access test proves user B cannot load user A's private cover file

### Story 4.12: [D29] Cover upload service

As Mika,
I want my photo of a cover turned into a straight 2:3 cover,
So that books without a cover, or with a wrong one, look right (FR-47 part, D-4).

**Acceptance Criteria:**

**Given** `setCover(ctx, bookId, file, corners)` in `lib/catalogue`
**When** the admin calls it for a shared Book, or the creator for their private Book
**Then** it accepts only JPEG, PNG or WebP images up to about 5 MB (`NOT_AN_IMAGE`, `IMAGE_TOO_LARGE` otherwise), downsizes anything over about 2000 px on the long side as a guard, warps the four-corner quadrilateral into a 2:3 rectangle with Heckbert's closed-form square-to-quad projective mapping and bilinear sampling on sharp's raw pixels (no general linear solver), strips all metadata, resizes to a fixed maximum and re-encodes
**And** it creates the `media` row (shared for a shared Book, private for a private one) with a random filename and sets the Book's cover; the replaced media row is deleted when `isUnreferenced()`
**And** `removeCover` clears the cover the same way
**And** any other user, or a non-admin on a shared Book, fails with `NOT_FOUND`
**And** unit tests check the warp maps the four corners to the rectangle's corners, and that EXIF and GPS data are gone from the output
**And** the server also applies any EXIF orientation still present before the warp, as a guard; the browser has normally applied it already (Story 4.13)
**And** the output is written under a temporary name and renamed into place only when complete; a failed write leaves nothing behind and fails with `COVER_FAILED` ("Couldn't save cover.")
**And** corners that cross, fold in on themselves or put three points in a line fail with `INVALID_CORNERS`
**And** admin re-fetch never replaces an uploaded cover
**And** the file reaches the server in a server action as form data; `serverActions.bodySizeLimit` in `next.config.ts` is raised to about 5 MB (the default is 1 MB), after checking the bundled Next.js docs

### Story 4.13: [D30] Four-corner crop

As Mika,
I want to drag four corners onto the cover in my photo,
So that angle, skew and crop are fixed in one step (D-4, UX-DR47a).

**Acceptance Criteria:**

**Given** the story starts with rendered mock-up options of the crop step, and Mika has picked one
**When** a photo is chosen
**Then** a full-screen step shows it with four handles joined by a 2px outline starting as a 2:3 rectangle, the outside dimmed, and the hint "Shoot it straight on"
**And** each handle drags with touch or mouse; on wide screens Tab moves between handles and the arrow keys move the focused one
**And** Use (primary) returns the four corner points in image pixels; Cancel returns nothing
**And** the chosen file is decoded in the browser with `createImageBitmap(file, { imageOrientation: 'from-image' })`, shrunk to about 2000 px on the long side and re-encoded as JPEG; the step shows that image, and the corner points are in its pixels
**And** a file the browser can't decode shows "Not an image." and the step doesn't open
**And** Use is disabled while the four corners form an invalid shape (crossed, folded or three in a line)
**And** no crop library is added

### Story 4.14: [D31] Cover on Edit book

As Mika,
I want to add, replace or remove a cover on Edit book,
So that covers are fixed where the other fields are (D-4, UX-DR47a).

**Acceptance Criteria:**

**Given** Edit book for a Book whose cover I may change (admin on a shared Book; creator on a private Book)
**When** the first screen renders
**Then** beside the cover are "Add cover" (no cover) or "Replace cover", and a destructive "Remove cover" with no dialog, since it takes effect on Save and "Discard changes?" can still cancel it; for anyone else they are absent
**And** choosing a file (the camera is offered on the phone) opens the four-corner crop; Use shows the straightened preview in place of the cover until Save
**And** the file input accepts any image (`image/*`); HEIC from an iPhone is decoded and re-encoded by the browser in the crop step, so only the shrunk JPEG is uploaded
**And** Save uploads through `setCover` in the same save; Remove cover takes effect on Save; neither has Undo
**And** a rejected file shows "Not an image." or "Image too large." under the cover

## Epic 5: Browse, organise and move my collection

The collection at `/`: rows or covers in three sizes, endless scrolling, search, Filter panel and sort, Book detail with Filter chips, read and rating, copy notes and removal, Received, locations on rows and as a filter, select mode with bulk read, move and remove, locations managed in Settings, Open book on the Answer, admin re-fetch, and the 10,000-copy timing test right after the query.

### Story 5.1: [E16] Shelf query parameters

As the developer,
I want one pure module that reads and writes the collection's URL,
So that search, filters, sort and the open Book are addressed the same way everywhere (AD-7).

**Acceptance Criteria:**

**Given** `lib/shelf/query.ts`
**When** the story is done
**Then** it exports `ShelfQuery`, `parseShelfQuery(searchParams)` and `shelfHref(query, { book })`, with no imports beyond types
**And** unknown or malformed parameters fall back to defaults (sort by author, ascending); no page number is in the URL
**And** unit tests round-trip every filter field, several values per field, `q`, sort, direction and `book`

### Story 5.2: [E1] Shelf query: my copies, sorted

As Mika,
I want my copies listed in Finnish order,
So that the collection reads the way I expect (FR-23, NFR-7, AD-7).

**Acceptance Criteria:**

**Given** `lib/shelf` built with Drizzle through the helper, read-only
**When** it orders copy ids
**Then** every query starts from `visibleCopies(viewer)` (today `owner = viewer`) and applies the AD-4 read rule in its joins
**And** it sorts by effective title, year or date added, using the `fi-FI` collation, every sort ending on copy id, with offset and limit at one fixed page size
**And** effective values test whether the field is in `overridden`
**And** a sort on year puts Books with no year last in both directions
**And** a two-user test proves user B's copies never appear, and a sort test puts "Örkki" after "Zorro"

### Story 5.3: [E2] Shelf query: text search

As Mika,
I want to search my collection by title, author, series, ISBN and notes,
So that I can find a book in a couple of seconds (FR-24, NFR-7).

**Acceptance Criteria:**

**Given** a `q` in the shelf query
**When** it runs
**Then** it matches effective title, author names, series name, ISBN-13 and copy notes with case-insensitive `ILIKE` and no accent folding
**And** "a" never matches "ä", and "kivi" matches "Aleksis Kivi"
**And** `%`, `_` and `\` typed in the search are escaped and match literally
**And** my overrides are what is searched

### Story 5.4: [E3] Shelf query: scalar filters

As Mika,
I want to filter by publisher, year, language, pages, status, location, read and rating,
So that I can narrow the collection down (FR-25).

**Acceptance Criteria:**

**Given** `ShelfQuery.filters`
**When** they apply
**Then** fields combine with AND and several values within a field with OR; year and pages take ranges with either end open; rating means "at least"
**And** location filters by copy location, status by copy status, read and rating by my `user-books` row (a missing row means unread, unrated)
**And** an active year or pages range excludes Books with no value in that field
**And** effective values (my overrides) are used
**And** integration tests cover each field, AND across fields and OR within one

### Story 5.5: [E4] Shelf query: author, series and genre filters

As Mika,
I want to filter by author, series and genre,
So that I can see everything by one writer or in one series (FR-25, AD-6).

**Acceptance Criteria:**

**Given** author, series or genre ids in the filters
**When** they apply
**Then** an author or series value matches every readable record with that record's `nameKey`, against my effective authors and series
**And** a genre value matches the Book's system genres
**And** integration tests cover an override changing which author a copy matches, and a private and shared author with the same name matching together

### Story 5.6: [E15] Author sort

As Mika,
I want the collection sorted by author's family name,
So that Kivi sits under K, not A (AD-4, AD-7).

**Acceptance Criteria:**

**Given** sort `author`
**When** the shelf query orders
**Then** it uses the `sortName` of the Book's first effective author with the `fi-FI` collation, then title, then copy id
**And** a Book with no author sorts last

### Story 5.7: [E14] Shelf timing at 10,000 copies

As Mika,
I want search and filters to answer in under a second for a big collection,
So that bookeh stays fast as it grows (NFR-3).

**Acceptance Criteria:**

**Given** a test that seeds 10,000 copies across varied Books, authors and overrides in `bookeh_test`
**When** it times the first page for no filter, a text search, three combined filters, and author sort
**Then** each answers in under 1 s on the CI runner
**And** if any misses, this story adds `pg_trgm` GIN indexes on the stored columns the search reads (`books.title`, `authors.name`, `series.name`, the override columns of `user-books`, `copies.notes`), combined with OR in the query, never an index on computed effective values; the search keeps plain `ILIKE` semantics; all before any collection screen is built

### Story 5.8: [E17] Hydrated shelf rows

As the developer,
I want one read that turns ordered ids into rows,
So that the first page and every later page come from the same code (AD-7).

**Acceptance Criteria:**

**Given** `getShelfRows(ctx, query, range)`
**When** it runs
**Then** it takes the ordered ids from the shelf query and hydrates them through `getEffectiveBooks` and `getHoldings` into `ShelfRows`: rows, total, and display names for the filter values in the query
**And** an integration test checks the same query returns the same order through both a first-page and an offset range

### Story 5.9: [E18] Filter values and suggestions

As Mika,
I want filters to offer only values I actually use, with counts,
So that I never pick a filter that shows nothing (FR-25, AD-7).

**Acceptance Criteria:**

**Given** the shelf module
**When** values are requested
**Then** it returns locations, genres, languages and statuses in use on my copies, each with its copy count
**And** `/data/suggest` (inside `runRoute`) returns author, series and publisher suggestions for typed text, distinct on `nameKey` and preferring the shared record's id
**And** Edit book's author and series fields (Story 4.8) become comboboxes over these suggestions, new names allowed
**And** a two-user test proves another user's values never appear

### Story 5.10: [E6] Collection screen

As Mika,
I want bookeh to open on my collection with search,
So that "where is it?" takes seconds (FR-23, FR-24, UX-DR40, UX-DR9, UX-DR36, UX-DR37).

**Acceptance Criteria:**

**Given** `/`
**When** it renders
**Then** it shows the tools row (search, Filter, rows / covers, s / m / l, Select), the count line ("{n} books", or the active values, count and "Clear"), and the first page of rows from `getShelfRows`, one row per copy, at size m
**And** search filters as I type after a short pause and lives in the URL; `/` focuses the search on wide screens
**And** with no copies it shows "No books yet", one dry remark and, on wide screens only, Scan book (on the phone the pinned Scan book is the one primary); with no matches, "No books match" and Clear; on a load failure, "Couldn't load. Try again." with a retry Link
**And** a row ending shows "Ordered" for an ordered copy

### Story 5.11: [E19] Endless scrolling

As Mika,
I want the list to keep loading as I scroll,
So that there are no pages to click (UX-DR40, AD-7).

**Acceptance Criteria:**

**Given** the collection list component
**When** I near the end
**Then** the next range loads from `/data/shelf` (inside `runRoute`) with the progress line, and the list stays usable
**And** after any successful action or Undo that can change rows, the list reloads rows 0 to the number it holds; rows are never patched locally
**And** an action that fails with `NOT_FOUND` (for example on a copy removed in another tab) shows "Not in library" and triggers the same reload

### Story 5.12: [E28] Keep my place

As Mika,
I want to come back from Scan or Edit book to where I was in the list,
So that cataloguing and browsing don't fight each other (AD-7).

**Acceptance Criteria:**

**Given** a shelf query
**When** I leave the collection and return
**Then** the list loads as many rows as it held, up to a fixed cap, in one request and restores the scroll position
**And** only the row count and scroll position are kept in `sessionStorage`, keyed by the query without `book`, never row data

### Story 5.13: [E20] Covers layout and sizes

As Mika,
I want rows or covers in three sizes,
So that I can scan a shelf visually or see many titles at once (UX-DR17, UX-DR18).

**Acceptance Criteria:**

**Given** the rows / covers and s / m / l switches
**When** I switch
**Then** rows and cover tiles follow DESIGN.md's density table (cover sizes, lines, spacing, column widths, gaps), covers at 2:3
**And** the choice is remembered per device and right on the first paint
**And** size changes what fits on screen, not how many rows are fetched

### Story 5.14: [E7] Filter panel: value lists

As Mika,
I want a Filter panel with the values I use,
So that I can combine filters by tapping (FR-25, UX-DR41, UX-DR33).

**Acceptance Criteria:**

**Given** Filter in the tools row
**When** I open it
**Then** it opens left of the list on wide screens (separated by space) and as a bottom sheet on the phone
**And** location, status, read, genre (in my language) and language are option lists of values in use with counts; tapping switches a value on or off, shown with the marker, and applies at once with no Apply button
**And** values in one field combine with OR, fields with AND; the count line lists the active values with Clear
**And** between 900 and 1200px, opening Filter closes Book detail and the other way round

### Story 5.15: [E31] Filter panel: author, series and publisher

As Mika,
I want to filter by author, series or publisher by typing,
So that long lists don't get in the way (FR-25).

**Acceptance Criteria:**

**Given** the Filter panel
**When** I type in the author, series or publisher combobox
**Then** suggestions come from `/data/suggest`; choosing adds the value to a short list under the field, and the filter applies at once
**And** removing a value from the list removes the filter

### Story 5.16: [E32] Filter panel: year, pages and rating

As Mika,
I want ranges and a minimum rating,
So that I can find the short ones or the good ones (FR-25).

**Acceptance Criteria:**

**Given** the Filter panel
**When** I set year or pages from and to, or tap a rating
**Then** either end of a range may be empty, and the rating filter means "at least", changed by tapping another star and removed with the Rating's "Clear" Link
**And** an invalid range (from greater than to) shows its message under the field and does not apply

### Story 5.17: [E33] Sort

As Mika,
I want to sort by author, title, year or date added,
So that I can browse the way I think about the shelf (FR-25).

**Acceptance Criteria:**

**Given** "Sort by" in the Filter panel
**When** I choose a sort
**Then** the list re-sorts and the choice lives in the URL; author is the default
**And** tapping the chosen sort again reverses it
**And** changing search, filters or sort replaces the history entry rather than pushing one

### Story 5.18: [E8] Book detail

As Mika,
I want to open a Book and see everything I hold of it,
So that a tap answers "what is this and where are my copies?" (FR-26, UX-DR43, UX-DR20).

**Acceptance Criteria:**

**Given** `?book=<bookId>` on `/`
**When** I tap a row
**Then** Book detail opens as a bottom sheet (a little over half the screen, list dimmed above) and the row gets the selection bar
**And** its content is one server component: header (cover, title, author, series and number, edition line), your copies (one line per copy with location and status), and a foot with Edit; later epics add their groups to this component only
**And** opening pushes a history entry; Back, X or tapping the dimmed list closes it; swapping to another Book replaces the entry
**And** a `?book=` for a Book I don't hold opens the section without it and the toast "Not in library"
**And** if a change makes the open row stop matching the filters, the row goes and the detail stays open until closed

### Story 5.19: [E29] Book detail beside the list on wide screens

As Mika,
I want Book detail as a side panel at my desk,
So that I can click through books while the list stays put (UX-DR23).

**Acceptance Criteria:**

**Given** a screen 900px or wider
**When** I open a Book
**Then** the same content renders in a 360px panel on the right with the hairline border and the one shadow, the list narrowing beside it, without a scrim and without trapping focus
**And** clicking another row swaps the content without closing; X and `Esc` close it
**And** `Enter` on a focused row opens it
**And** the panel slides out from the right while the list narrows in step; with reduce motion set, the change is immediate (UX-DR54)

### Story 5.20: [E30] Open book from the Answer

As Mika,
I want "Open book" on an In library Answer,
So that I can go from a scan straight to the book's detail (UX-DR46).

**Acceptance Criteria:**

**Given** the In library Answer
**When** I tap Open book
**Then** scanning closes and the collection opens with `?book=<bookId>`

### Story 5.21: [E22] Filter chips on Book detail

As Mika,
I want to tap an author, series or location on an opened Book to filter by it,
So that "what else do I have by her?" is one tap (FR-25, UX-DR34).

**Acceptance Criteria:**

**Given** an opened Book
**When** I tap its author, series, genre or a copy's location
**Then** that value is added to the current filters with `shelfHref` (a second value in the same field widens it), and on the phone the sheet closes
**And** chips are styled as Links, with no outline or fill
**And** a chip in Book detail opened from `/loans`, or in an opened wishlist entry, opens the collection with only that filter

### Story 5.22: [E24] Mark read

As the developer,
I want one function that marks Books read or unread,
So that Book detail and select mode share it, with Undo (AD-18, AD-20).

**Acceptance Criteria:**

**Given** `setRead(ctx, target, value | 'toggle')` in `lib/books`, where the target is copy ids or a Book id
**When** it runs
**Then** it applies to the distinct Books, through `upsertUserBook`, in one transaction
**And** `toggle` resolves to unread when every Book is read, otherwise read
**And** it returns a restore that puts back each Book's previous read flag; an integration test undoes it

### Story 5.23: [E11] Read and rating in Book detail

As Mika,
I want to mark a Book read and rate it right where I see it,
So that I keep track of what I've read and liked (FR-29, UX-DR22).

**Acceptance Criteria:**

**Given** an opened Book
**When** I use the read / unread switch
**Then** it saves at once through `setRead` with the toast "Marked 1 read · Undo"
**And** the five-star Rating sets a rating with a tap and changes it when I tap another star; a "Clear" Link beside the stars, shown only while a rating is set, clears it; tapping the current star does nothing; each change saves at once with `ratedAt`, without Undo (UX-DR22)
**And** read and rating belong to me and the Book, not to a copy
**And** the rating writes through `setRating(ctx, bookId, rating | null)` in `lib/books`, via `upsertUserBook`, with an integration test

### Story 5.24: [E12] Copy notes and removing a copy

As Mika,
I want to note something on a copy, or remove a copy,
So that my records match my shelf (FR-26, AD-18).

**Acceptance Criteria:**

**Given** a copy's line in Book detail
**When** I edit the note under it
**Then** it saves when I leave the field
**And** Remove (a destructive Link) asks "Remove 1 book from library?" and removes the copy through `removeCopies` with no Undo
**And** after removing the last copy, the detail closes and the row leaves the list

### Story 5.25: [H13] Received

As Mika,
I want to mark an ordered copy received,
So that it becomes a copy on my shelf at my default location (FR-28).

**Acceptance Criteria:**

**Given** an ordered copy's line in Book detail ("Ordered" and Received)
**When** I tap Received
**Then** the copy becomes owned at my default location through `lib/copies`, with the toast "Saved to {location} · Undo"
**And** Undo sets it back to ordered with no location; an integration test undoes it

### Story 5.26: [F3] Locations on rows, lines and filters

As Mika,
I want to see where each copy is, and nothing about locations if I don't use them,
So that "where is it?" is answered on the row itself (FR-32, UX-DR17).

**Acceptance Criteria:**

**Given** I have locations
**When** the collection, Book detail and the Answer render
**Then** an owned copy's row ends with its location; each copy line in Book detail shows its location as a Filter chip
**And** with no locations at all, location fields, the location filter, the row ending and Move are absent everywhere

### Story 5.27: [E23] Select mode

As Mika,
I want to tick several copies,
So that I can act on them together (FR-33, UX-DR42, UX-DR28, UX-DR29).

**Acceptance Criteria:**

**Given** Select in the tools row
**When** I enter select mode
**Then** Book detail closes, checkboxes appear on every row or tile, and tapping ticks instead of opening
**And** the action bar replaces Scan book on the phone (two rows: the count and Done above, the actions below) and sits at the bottom on wide screens with Scan book in the header; in this story it holds the count and Done, and Remove, Read, Move and Tag are added by the stories that wire them (5.28–5.30, 9.8), each disabled while nothing is ticked
**And** the selection survives search, filtering and scrolling, and the count includes ticked rows out of view; there is no select all
**And** Done or `Esc` leaves and clears the selection

### Story 5.28: [E25] Remove a selection

As Mika,
I want to remove several copies at once,
So that clearing out a box is one action (FR-33).

**Acceptance Criteria:**

**Given** ticked copies
**When** I tap Remove
**Then** a dialog asks "Remove {n} books from library?" with Remove and Cancel; Remove removes them all or none, with no Undo
**And** the rows leave the list and the selection clears

### Story 5.29: [E27] Mark a selection read

As Mika,
I want to mark several books read at once,
So that catching up on my reading log is quick (FR-33).

**Acceptance Criteria:**

**Given** ticked copies
**When** I tap Read
**Then** every ticked Book is marked read, or unread if all are already read, with the toast "Marked {n} read · Undo"
**And** Undo restores each Book's previous flag

### Story 5.30: [F4] Move, one copy or a selection

As Mika,
I want to move copies with a location picker,
So that the box going to the cottage is one action (FR-33, UX-DR25).

**Acceptance Criteria:**

**Given** Move on an owned copy's line in Book detail, or Move in the action bar
**When** I pick a location, or create one inline
**Then** `moveCopies` moves them all or none with the toast "{n} moved to {location} · Undo"
**And** rows that no longer match the filters leave the list
**And** Undo puts each copy back and returns them to the list

### Story 5.31: [F5] Delete a location

As the developer,
I want deleting a location to clean up after itself,
So that no copy or profile points at a deleted place (AD-18).

**Acceptance Criteria:**

**Given** `deleteLocation(ctx, id)` in `lib/copies`
**When** it runs
**Then** in one transaction it clears the location from my copies and from my default location, then deletes it
**And** an integration test covers both references

### Story 5.32: [F7] Rename and merge locations

As the developer,
I want rename and merge for locations,
So that "Mökki" and "mokki" can become one (AD-18).

**Acceptance Criteria:**

**Given** `renameLocation` and `mergeLocation` in `lib/copies`
**When** a rename hits an existing `nameKey`
**Then** it fails with `NAME_TAKEN` and the existing row's id as `conflictId`
**And** a merge moves every copy and the default location to the target, then deletes the source, in one transaction
**And** a rename whose `nameKey` equals the location's own (a change of case only) is allowed
**And** integration tests cover both

### Story 5.33: [F8] Locations in Settings

As Mika,
I want to manage my locations in Settings,
So that the list stays tidy (FR-31, UX-DR50).

**Acceptance Criteria:**

**Given** `/settings`
**When** I open the Locations group
**Then** each location is a List row with its copy count ("31 books") and Links Rename, Merge, Delete (on a second line on the phone); "Add location" adds one; "No locations" shows when there are none
**And** Rename edits in place and, on a name in use, offers to merge instead
**And** Merge picks another location and is confirmed by a dialog; Delete is confirmed by a dialog saying how many books lose their location; neither has Undo
**And** this story builds the List row (name in `title`, count right in `meta`, `text-muted`), reused by People, tags and wishlists (UX-DR35)

### Story 5.34: [E13] Admin re-fetch

As Mika, as admin,
I want to re-fetch a shared Book's metadata,
So that empty fields fill in when a source improves (FR-19, AD-5).

**Acceptance Criteria:**

**Given** the story starts
**When** work begins
**Then** Mika picks where Re-fetch sits in Book detail and what it shows when it fills fields or finds nothing to fill from rendered mock-up options, and the pick is recorded in EXPERIENCE.md before the screen is built

**Given** an opened shared Book and the admin role
**When** I tap Re-fetch in Book detail
**Then** `lib/catalogue` runs the sources and fills only empty shared fields (including themes and the cover), never overwriting a value and never touching any `user-books` row
**And** the action is absent for non-admins and fails with `NOT_FOUND` if called by one

### Story 5.35: [D33] Look up a hand-entered Book again

As Mika,
I want to look up a book I typed in by hand again,
So that once Finna or Google knows it, it gets their details and becomes a normal shared Book (FR-12, D-8).

**Acceptance Criteria:**

**Given** my own private Book with an ISBN
**When** I tap "Look it up again" in Book detail, or on its In library Answer
**Then** the sources are called through `lookupBook` (rate-limited, never cached as `unavailable`)
**And** on `found`, with the edition picker when there are several candidates (opened over the Book detail sheet, one overlay deep), the AD-5 auto-share runs in one transaction without creating a copy: source values replace the Book's, authors and series are re-matched to shared records, `visibility` becomes shared and `createdBy` clears, or my copies and `user-books` row move to an existing shared Book and the private one is deleted (entries move too from Epic 7, Story 7.7); the toast reads "Shared · from {source}"
**And** as admin, my differing hand-entered values are dropped; as another user, they become my overrides
**And** on `none` the toast reads "Still not found."; on `unavailable` it names the sources that didn't answer; nothing changes
**And** a private Book without an ISBN shows "Add the ISBN on Edit book to look it up." instead of the link
**And** the action is not undoable; integration tests cover each outcome and prove other users' private Books are untouched

### Story 5.36: [K6] Back office tidy-up

As Mika, as admin,
I want the back office readable,
So that fixing data there isn't a chore (UI strategy).

**Acceptance Criteria:**

**Given** Payload admin
**When** I open it
**Then** collections are grouped (catalogue, my data, system), list views show useful columns (title, ISBN, visibility for Books; name for authors, series, genres), and a light theme with the bookeh name applies through `admin.css`
**And** the current Payload admin docs were read first; no admin components are restructured


### Story 5.37: [K14] Last backup in Settings

As Mika, as admin,
I want to see when the last backup ran,
So that a silently failing backup doesn't go unnoticed for weeks (NFR-6).

**Acceptance Criteria:**

**Given** `last-backup.json` written by the backup script (Story 2.3)
**When** an admin opens `/settings`
**Then** a line reads "Last backup: {date}", in the user's time zone format
**And** it is marked in `danger` with "Backup is overdue." when the last successful backup is older than 48 hours, or the file is missing or reports a failure
**And** the line is absent for non-admins

## Epic 6: Lend books and see who has them

People, Lend and Returned with Undo, the Loans section by person or by date with returned loans below, lent markers on rows, Lent before in Book detail, and People managed in Settings.

### Story 6.1: [J1] `people` collection

As the developer,
I want a private People list,
So that borrowers and gift recipients are mine alone (FR-34, AD-1).

**Acceptance Criteria:**

**Given** the `people` collection with `ownerField()` and `nameKeyField()`
**When** the story is done
**Then** it has `name`, with `nameKey` unique per owner as a database constraint
**And** read, update and delete are `owner = current user` for every role, admin included
**And** an access test proves user B and the admin cannot read user A's People

### Story 6.2: [J2] `loans` collection

As the developer,
I want loans as their own rows,
So that a copy keeps its location while lent and history is kept (FR-35, FR-36, AD-8).

**Acceptance Criteria:**

**Given** the `loans` collection with `ownerField()`
**When** the story is done
**Then** it has `copy` and `person` as `ownedRelation`s, `lentOn` (calendar date stored at 12:00 UTC) and `returnedOn` (empty while open)
**And** at most one open loan per copy is a database constraint
**And** an access test with foreign ids proves a loan cannot point at another user's copy or Person

### Story 6.3: [J7] People service

As the developer,
I want one owner of People rules,
So that matching, renaming, merging and deleting People behave the same everywhere (FR-34, AD-18).

**Acceptance Criteria:**

**Given** `lib/people`
**When** a Person `Ref` is resolved
**Then** an id is checked, and a name matches by `nameKey` or creates the Person
**And** rename onto an existing name fails with `NAME_TAKEN` and `conflictId`; merge moves every loan to the target and deletes the source in one transaction
**And** a rename that only changes case is allowed
**And** deleting a Person with any loan, open or returned, fails with `PERSON_IN_USE` (wishlist entries are added to this rule in Epic 7)
**And** `personUse(ctx)` returns each Person's count of loans
**And** integration tests cover each rule

### Story 6.4: [J6] Removing a copy removes its loans

As Mika,
I want a removed copy to take its loans with it,
So that nothing dangles after I give a book away (AD-18).

**Acceptance Criteria:**

**Given** `removeCopies`
**When** it removes copies that have loans
**Then** their loans, open and returned, are deleted in the same transaction
**And** the removal dialog (one copy or a selection) adds that their loans go too when any of them is lent
**And** an integration test covers a lent copy

### Story 6.5: [J3] Lend and return

As the developer,
I want lend and return services with Undo,
So that every screen lends and returns the same way (FR-35, FR-36, AD-20).

**Acceptance Criteria:**

**Given** `lendCopy(ctx, copyId, person: Ref, lentOn)` and `returnLoan(ctx, loanId, returnedOn?)` in `lib/loans`
**When** they run
**Then** lending works only on an owned copy without an open loan, otherwise fails with a field error; the copy keeps its location
**And** the default lending and return date is today in `Europe/Helsinki`; a lending date in the future, or a return date before the lending date, fails with a field error
**And** returning sets `returnedOn` (today by default) and keeps the row as history
**And** lend's restore deletes the loan; return's restore reopens it; integration tests undo both
**And** undoing a save (Story 3.37) once its copy has a loan fails with `UNDO_FAILED` and changes nothing; an integration test covers it (AD-11)
**And** an inline-created Person stays after Undo

### Story 6.6: [J10] Loans in holdings

As the developer,
I want copy lines to carry their open loan,
So that rows, Book detail and the Answer all know who has a book (FR-37).

**Acceptance Criteria:**

**Given** `getHoldings`
**When** a copy has an open loan
**Then** its `CopyLine.loan` holds the loan id, the Person and the date since
**And** a two-user test proves another user's loans never appear

### Story 6.7: [J4] Lend and Returned in Book detail

As Mika,
I want to lend a book from its detail and mark it returned,
So that Antti at the door takes ten seconds (FR-35, FR-36, UX-DR43, UX-DR16).

**Acceptance Criteria:**

**Given** the story starts
**When** work begins
**Then** Mika picks the Lend picker: Person, date and the confirm in one overlay from rendered mock-up options, and the pick is recorded in EXPERIENCE.md before the screen is built

**Given** an owned copy's line in Book detail
**When** I tap Lend
**Then** a picker asks for the Person (combobox, existing or new) and the date (today by default); confirming lends with the toast "Lent to {person} · Undo"
**And** a lent copy's line shows the lent marker with "Lent to {person} since {date}" and Returned, which returns it with "Returned · Undo"
**And** Lend and Returned are reachable in the half-open sheet

### Story 6.8: [J11] Lent marker on rows and the Answer

As Mika,
I want to see at a glance which books are out and with whom,
So that "who has it?" needs no extra tap (FR-37, UX-DR21).

**Acceptance Criteria:**

**Given** a copy with an open loan
**When** the collection or an Answer renders
**Then** a row ends with the 8px accent marker and "Lent · {person}", a tile has the marker before its title, and the Answer's copy line shows the same
**And** the marker always has its text

### Story 6.9: [J5] Loans section by date

As Mika,
I want to see what's out, longest first,
So that I know which loans to chase (FR-37, UX-DR48).

**Acceptance Criteria:**

**Given** `/loans`
**When** it opens
**Then** open loans are one list, longest out first; each row shows the copy (cover, title, author) and "{person} · since {date}"
**And** tapping a row opens Book detail at `?book=` on `/loans`
**And** with nothing lent it shows "Nothing lent" and one dry remark
**And** on a load failure it shows "Couldn't load. Try again." with a retry Link

### Story 6.10: [J12] Loans by person

As Mika,
I want loans grouped by borrower,
So that I can see everything Antti has (FR-37).

**Acceptance Criteria:**

**Given** the by person / by date switch on `/loans`
**When** I choose by person
**Then** each borrower's name, as typed, heads a group with rows showing the copy and "Since {date}"
**And** the choice is remembered per device and right on the first paint

### Story 6.11: [J13] Returned loans

As Mika,
I want returned loans below the open ones and a Returned link on each row,
So that history is there and a return is one tap (FR-36, FR-37).

**Acceptance Criteria:**

**Given** `/loans` in either order
**When** it renders
**Then** returned loans form a group below the open ones, newest first, each "{person} · {from} to {to}"
**And** Returned on an open row closes the loan today with "Returned · Undo", and the row moves to the returned group
**And** returned loans still show when nothing is lent

### Story 6.12: [J9] Lent before

As Mika,
I want past loans on a Book's detail,
So that I remember who has read my copy (FR-36).

**Acceptance Criteria:**

**Given** an opened Book with returned loans
**When** Book detail renders
**Then** a "Lent before" group lists them newest first, "{person} · {from} to {to}"
**And** the group is absent when there are none

### Story 6.13: [J8] People in Settings

As Mika,
I want to manage my People list,
So that "Antti" and "antti k" can become one (FR-34, UX-DR50).

**Acceptance Criteria:**

**Given** `/settings`
**When** I open the People group
**Then** each Person is a List row with their use ("2 loans") and Links Rename, Merge, Delete; "Add person" adds one
**And** Rename offers a merge on a name in use; Merge is confirmed by a dialog
**And** Delete of a Person with loans says they can't be deleted and offers Merge

## Epic 7: Keep wishlists

Named lists with counts, Add to wishlist from the Answer and Book detail with Undo, the entry sheet with For, Bought / Ordered / Remove, rename and delete lists, and a save closing matching open entries.

### Story 7.1: [H1] `wishlists` collection

As the developer,
I want private named wishlists,
So that each list is mine alone (FR-38, AD-1).

**Acceptance Criteria:**

**Given** the `wishlists` collection with `ownerField()` and `nameKeyField()`
**When** the story is done
**Then** it has `name`, with `nameKey` unique per owner as a database constraint
**And** read, update and delete are `owner = current user` for every role, admin included
**And** an access test proves user B and the admin cannot read user A's lists

### Story 7.2: [H2] `wishlist-entries` collection

As the developer,
I want entries as their own rows,
So that a wished-for Book is never confused with a copy (FR-38, AD-8).

**Acceptance Criteria:**

**Given** the `wishlist-entries` collection with `ownerField()`
**When** the story is done
**Then** it has `wishlist` and `forPerson` (optional) as `ownedRelation`s, `book` as a `readableRelation`, and `closedAt` (empty while open)
**And** an access test with foreign ids proves an entry cannot point at another user's list, Person or private Book

### Story 7.3: [H14] Entries in holdings and Book access

As the developer,
I want open entries to count as holding a Book,
So that a wished-for Book can be opened and its entries listed (AD-7, AD-9).

**Acceptance Criteria:**

**Given** `getHoldings` and `requireOwnBook`
**When** the viewer has an open entry for a Book
**Then** `Holdings.entries` lists each open entry as an `EntryLine` (entry id, list, recipient)
**And** `requireOwnBook` passes for a Book held only through an open entry; closed entries don't count
**And** a two-user test proves another user's entries never appear

### Story 7.4: [H15] People with wishlist entries can't be deleted

As the developer,
I want the Person delete rule to include entries,
So that no entry ever points at a deleted Person (FR-34, AD-18).

**Acceptance Criteria:**

**Given** `lib/people`
**When** a Person is the recipient of any entry, open or closed
**Then** deleting them fails with `PERSON_IN_USE`, merging moves the entries too, and their use count includes entries ("2 loans, 1 wish")
**And** integration tests cover delete, merge and the count

### Story 7.5: [H9] Wishlist service: create, rename, delete

As the developer,
I want one owner of wishlist rules,
So that lists are created, renamed and deleted the same way everywhere (AD-18).

**Acceptance Criteria:**

**Given** `lib/wishlists`
**When** a wishlist `Ref` is resolved
**Then** an id is checked and a name matches by `nameKey` or creates the list
**And** rename onto an existing name fails with `NAME_TAKEN` and `conflictId`
**And** deleting a list deletes its entries, open and closed, in one transaction
**And** a rename that only changes case is allowed
**And** integration tests cover each

### Story 7.6: [H3] Save to a wishlist

As Mika,
I want to put a book on a wishlist in one tap,
So that a shop or review find is kept for later (FR-21, AD-11).

**Acceptance Criteria:**

**Given** `saveEntry` in `lib/catalogue` with `save: { kind: 'entry', wishlist: Ref }`
**When** it runs for an `{ isbn13 }`, `{ bookId }` or `{ manual }` target
**Then** in one transaction it ensures the Book as `saveCopy` does and creates an open entry with no recipient, returning the list as `savedTo`
**And** `requestId` repeats return the first result
**And** its restore deletes the entry and, on the same rule as a copy save, any Book, author, series or media row nothing else references; an integration test undoes it

### Story 7.7: [H7] A save closes matching wishes

As Mika,
I want adding a book to my library to tick it off my own wishlist,
So that I don't keep wishing for a book I have (FR-28, AD-18).

**Acceptance Criteria:**

**Given** `closeEntriesForBook` in `lib/wishlists`
**When** `saveCopy` runs for a Book
**Then** before creating the copy, in the same transaction, it closes my open entries for that Book that have no recipient
**And** entries for a Person stay open
**And** the save's restore also reopens the entries it closed; an integration test undoes it
**And** when a save (Story 3.39) or Look it up again (Story 5.35) merges my private Book into an existing shared Book, my entries for it move to the shared Book first; integration tests cover both paths

### Story 7.8: [H6] Bought and ordered

As the developer,
I want closing an entry to create the right copy,
So that buying a gift never adds it to my own shelf (FR-28, AD-18).

**Acceptance Criteria:**

**Given** `closeEntry(ctx, entryId, 'bought' | 'ordered')` in `lib/wishlists`
**When** it runs
**Then** it sets `closedAt`; for an entry with no recipient it creates an owned copy at the default location (bought) or an ordered copy (ordered) through `createCopy`; for an entry for a Person it creates no copy
**And** its restore deletes the created copy and reopens the entry; integration tests undo both cases

### Story 7.9: [H16] Entry recipient and removal

As the developer,
I want to set or clear who an entry is for, and remove an entry,
So that the entry sheet has services to call (FR-38).

**Acceptance Criteria:**

**Given** `setEntryRecipient(ctx, entryId, person: Ref | null)` and `removeEntry(ctx, entryId)` in `lib/wishlists`
**When** they run
**Then** the recipient is set, changed or cleared at any time; an inline-created Person is resolved through `lib/people`
**And** remove deletes the row, with no Undo
**And** integration tests cover both and a foreign entry id

### Story 7.10: [H5] Wishlists section

As Mika,
I want all my wishlists in one place with their counts,
So that I can see what I'm collecting for (FR-39, UX-DR49).

**Acceptance Criteria:**

**Given** `/wishlists`
**When** it opens
**Then** each list is a List row with its name and open-entry count; tapping opens it
**And** "New list" opens a dialog asking for a name; a name in use is rejected under the field
**And** with no lists it shows "No wishlists" and "New list"
**And** on a load failure it shows "Couldn't load. Try again." with a retry Link

### Story 7.11: [H11] One wishlist

As Mika,
I want to open a list and see its entries and who they're for,
So that in a shop I know what to buy for whom (FR-38, FR-39, UX-DR49).

**Acceptance Criteria:**

**Given** `/wishlists/[listId]`
**When** it opens
**Then** a Back link returns to the wishlists, the heading is the list's name as typed, and Links Rename and Delete (destructive) sit under it
**And** each open entry is a row with cover, title, author and "For {person}" at the end; closed entries are not listed
**And** Rename edits the name in place; Delete is confirmed by a dialog saying its entries go too
**And** an empty list shows "Nothing on this list."
**And** on a load failure it shows "Couldn't load. Try again." with a retry Link

### Story 7.12: [H12] Opened entry

As Mika,
I want to open an entry and set who it's for,
So that I can turn a wish into a gift idea (FR-38, UX-DR49).

**Acceptance Criteria:**

**Given** `?entry=<entryId>` on its wishlist
**When** I tap an entry
**Then** it opens as a bottom sheet on the phone and a side panel on wide screens, with the Book's header, "On {list}" and a "For" combobox of People that can be set, changed or cleared at any time, saving at once
**And** the entry is addressed by its own id, so the same Book twice on a list opens the right one
**And** an entry that isn't mine, or is closed, opens the list without it and the toast "Not on this list"

### Story 7.13: [H8] Bought, Ordered and Remove

As Mika,
I want to mark a wish bought or ordered, or remove it,
So that the list reflects what's done (FR-28, UX-DR49).

**Acceptance Criteria:**

**Given** an opened entry
**When** I tap Bought (primary) or Ordered
**Then** the entry closes and leaves the list; for me, the toast reads "Saved to {location} · Undo" (bought) or "Ordered · Undo"; for a Person, "Bought · Undo" or "Ordered · Undo" and no copy is made
**And** Undo reopens the entry and removes any copy it made
**And** Remove (destructive) asks for confirmation and deletes the entry, with no Undo

### Story 7.14: [H10] Add to wishlist

As Mika,
I want Add to wishlist on the Answer and in Book detail,
So that a book I don't own yet is kept for later without rescanning (FR-21, FR-22, UX-DR46).

**Acceptance Criteria:**

**Given** the story starts
**When** work begins
**Then** Mika picks how a list is created when the picker has none, within one overlay from rendered mock-up options, and the pick is recorded in EXPERIENCE.md before the screen is built

**Given** the Not in library or Not found Answer, or Book detail's foot
**When** I tap Add to wishlist
**Then** the wishlist picker opens; with exactly one list it is skipped; with none it offers only "New list"
**And** choosing saves through `saveEntry` (the Not found Answer with the typed title and author) and shows "Added to {list} · Undo"; from the Answer it returns to Scan
**And** Undo removes the entry on the save's rule

### Story 7.15: [H17] On wishlists in Book detail

As Mika,
I want Book detail to show which lists a Book is on,
So that I see my wishes next to my copies (FR-26, UX-DR43).

**Acceptance Criteria:**

**Given** an opened Book with open entries
**When** Book detail renders
**Then** an "On wishlists" group lists each entry as "{list} · for {person}" ("{list}" alone when it's for me)
**And** the group is absent when there are none
**And** a Book held only through entries opens in Book detail too, with no copies group

## Epic 8: Shop check — "do I already have this?"

The full Answer: In library, Ordered, On wishlist or Not in library as the heading, every other fact as a line; Lookup by title or author with "In your library" and "Elsewhere"; lookup of a Book without an ISBN; and the shop-check end-to-end test.

### Story 8.1: [I1] Answer heading and fact lines

As the developer,
I want one function that turns holdings into the Answer's heading and lines,
So that every Answer states the facts in the same order (FR-20, AD-9).

**Acceptance Criteria:**

**Given** `answerFacts(holdings)` in `lib/catalogue`
**When** it runs
**Then** the heading is the first that applies: In library (at least one owned copy), Ordered (only ordered copies), On wishlist (only open entries), Not in library
**And** every other fact is a line: each copy with its location and lent marker, "Ordered" for an ordered copy, "On {list}" for each open entry
**And** unit tests cover every combination of owned, ordered, lent and wished

### Story 8.2: [I2] In library, Ordered and On wishlist Answers

As Mika,
I want a scan in a shop to tell me everything I have of a book,
So that I never buy a duplicate (FR-16, FR-20, NFR-1, UX-DR46).

**Acceptance Criteria:**

**Given** an `existing` lookup result
**When** the Answer renders
**Then** it uses `answerFacts`: In library offers Open book, Add another copy and Back (primary); Ordered offers Back (primary); On wishlist offers Add to library (primary) and Back
**And** each ordered copy's line on the Answer carries its own Received Link, which makes that copy owned at the default location with "Saved to {location} · Undo"
**And** Add to library from On wishlist closes my own open entries for the Book (Story 7.7)
**And** on Mika's phone over 4G, scan to Answer takes 2 s or less for a Book I hold and 5 s or less from a source; the measurements are written in the story's notes

### Story 8.3: [I4] Finna search

As Mika,
I want to find a book in Finna by title or author,
So that a shop check works without a barcode (FR-20, AD-9).

**Acceptance Criteria:**

**Given** the Finna adapter
**When** `search(query)` runs against recorded fixtures
**Then** it returns `SearchHit`s (ISBN-13, title, authors, publisher, year, binding where stated, whether a cover exists), one per ISBN, dropping records without an ISBN
**And** it never throws, and tests run only against fixtures recorded for a few title and author queries

### Story 8.4: [I5] Google Books search

As Mika,
I want Google Books searched too,
So that books Finna doesn't list are still found (FR-20).

**Acceptance Criteria:**

**Given** the Google Books adapter
**When** `search(query)` runs against recorded fixtures
**Then** it returns `SearchHit`s like Finna's, dropping volumes without an ISBN-13 or ISBN-10
**And** it never throws, and tests run only against fixtures

### Story 8.5: [I10] Search across sources

As the developer,
I want one search over all sources,
So that results are merged, unique and rate-limited (AD-9).

**Acceptance Criteria:**

**Given** `searchBooks(ctx, text)` in `lib/catalogue`
**When** it runs
**Then** it calls each source's `search` in parallel under the lookup timeout, merges hits in source order, keeps one hit per ISBN-13, and writes nothing
**And** it records each hit's cover URL server-side so `/data/cover/[isbn13]` can preview it
**And** it shares the per-user rate limit with `lookupBook`
**And** tests use fake sources

### Story 8.6: [I11] Search my copies and wishes

As Mika,
I want a title search to show what I already have first,
So that "do I have this?" is answered before the outside sources (FR-20, AD-7).

**Acceptance Criteria:**

**Given** the shelf module
**When** a text search runs for Lookup
**Then** it searches my copies and my open entries (through `visibleEntries(viewer)`, mirroring `visibleCopies`) by effective title, author and series, one result per Book
**And** a two-user test proves another user's copies and entries never appear, and the shared catalogue is never searched

### Story 8.7: [I12] Look up a Book without an ISBN

As Mika,
I want a hand-entered Book without an ISBN to open its Answer,
So that Lookup results for it work like any other (AD-9).

**Acceptance Criteria:**

**Given** `lookupBook(ctx, { bookId })`
**When** it runs
**Then** it answers only for a Book that passes `requireOwnBook`, returning `existing` with my holdings, and never calls the sources
**And** `/scan?book=<bookId>` renders that Answer

### Story 8.8: [I6] Lookup by title or author

As Mika,
I want to search by title or author from Scan,
So that I can check a web shop or a book without a barcode (FR-20, UX-DR45).

**Acceptance Criteria:**

**Given** "Find by title or author" on Scan, opening `/scan/find`
**When** I type and press Go
**Then** results render server-side from `?q=` in two groups: "In your library" (Story 8.6) then "Elsewhere" (Story 8.5), each row with cover, title, author, and binding · year · publisher so editions of one title can be told apart (D-7); covers only where servable, else the placeholder
**And** the progress line runs while searching
**And** tapping a result opens its Answer (`?isbn=` or `?book=`), and Back from the Answer returns to the results
**And** "Too many lookups. Wait a moment." shows when rate-limited
**And** a lent copy in "In your library" shows the lent marker with the borrower (FR-37)

### Story 8.9: [I7] Add by hand from Lookup

As Mika,
I want "Add by hand" when Lookup finds nothing,
So that a book nobody knows still gets in with what I typed (FR-12, FR-22).

**Acceptance Criteria:**

**Given** Lookup with no results
**When** it shows "Nothing found" and I tap "Add by hand"
**Then** `/scan?title=<text>` (built in Story 3.49) opens the Not found Answer with the typed text in the title field
**And** Add to library and Add to wishlist save a private Book without an ISBN

### Story 8.10: [I8] End-to-end: shop check

As the developer,
I want a Playwright test of the shop check,
So that "do I already have this?" can't silently break (Tests convention).

**Acceptance Criteria:**

**Given** a fixture source and ISBNs entered by hand
**When** the test runs
**Then** it adds one book to the library, scans it again and sees "in library" with the copy's location; scans another, taps Add to wishlist, picks a list and sees "Added to {list}"; scans that one again and sees "on wishlist"
**And** it makes no network call outside the app

## Epic 9: Tag, genre and theme my books

Personal tags, user genres and user themes (one `tags` collection with a kind, D-6) on Book detail, Edit book and a selection, with Undo, filters, and management in Settings. System genres seeded and created on save from Google Books categories, re-run over Books saved earlier, shown in the user's language and managed by the admin in Settings, with "New genre" on the Answer. Finna system themes as chips and a filter. Slice G6 (genre override on Edit book) is retired by D-6.

### Story 9.1: [G1] `tags` collection with kinds

As the developer,
I want personal tags, user genres and user themes in one private collection,
So that they share one writer, one picker and one Settings pattern (D-6, AD-8).

**Acceptance Criteria:**

**Given** the `tags` collection with `ownerField()` and `nameKeyField()`
**When** the story is done
**Then** it has `name` and `kind` (`tag` | `genre` | `theme`), with `(owner, kind, nameKey)` unique as a database constraint
**And** `user-books.tags` is a has-many `ownedRelation('tags')`
**And** read, update and delete are `owner = current user` for every role, admin included
**And** an access test with a foreign id proves a `user-books` row cannot point at another user's tag

### Story 9.2: [G7] Change tags

As the developer,
I want one function that adds and removes tags of any kind,
So that Book detail, Edit book and select mode tag the same way (AD-18, AD-20).

**Acceptance Criteria:**

**Given** `changeTags(ctx, target, { add: Ref[], remove: number[], kind })` in `lib/tags`, where the target is copy ids or a Book id
**When** it runs
**Then** it applies to the distinct Books through `upsertUserBook` in one transaction; names resolve by `nameKey` within my tags of that kind, created when missing
**And** a new user genre whose name matches a system genre (English or Finnish name), or a new user theme matching a system theme on a Book I hold (read through `lib/shelf`), fails with the field error `SYSTEM_NAME` ("{name} is a system genre." / "… system theme.")
**And** it returns a restore that puts back each Book's previous tags; an integration test undoes it; inline-created tags stay after Undo

### Story 9.3: [G8] Rename, merge and delete tags

As the developer,
I want rename, merge and delete for each kind,
So that "scifi" and "sci-fi" can become one (FR-17, AD-18).

**Acceptance Criteria:**

**Given** `lib/tags`
**When** a tag is renamed onto an existing `nameKey` of the same kind
**Then** it fails with `NAME_TAKEN` and `conflictId`; renaming a user genre or theme onto a system name fails with `SYSTEM_NAME`
**And** a rename that only changes case is allowed
**And** merge moves every `user-books` reference to the target of the same kind and deletes the source in one transaction
**And** delete removes the tag from my Books, then deletes it
**And** `tagUse(ctx, kind)` returns each tag's copy count from the shelf values
**And** integration tests cover each

### Story 9.4: [G3] Tag and user-genre filters

As Mika,
I want to filter by my tags and my own genres,
So that my own labels work like any other filter (FR-25, D-6).

**Acceptance Criteria:**

**Given** the shelf query and the Filter panel
**When** I filter by a tag or a user genre
**Then** the shelf query matches through my `user-books.tags`; tags appear as their own option list, and my genres join the Genre option list after the system genres, each value distinct
**And** values in use come with copy counts
**And** a two-user test proves another user's tags never appear

### Story 9.5: [G13] Theme filter

As Mika,
I want to filter by theme, Finna's and mine,
So that "everything about war" is one filter (FR-17a, FR-25, D-3).

**Acceptance Criteria:**

**Given** `ShelfQuery.filters.theme`
**When** it applies
**Then** a system theme value matches Books whose `themes` contain it exactly, case-insensitive and with no accent folding; a user theme matches through my tags
**And** the Filter panel's Theme combobox suggests themes in use on my copies (system and mine) through `/data/suggest`, adding values to a short list
**And** the count line shows active themes

### Story 9.6: [G14] Genres, themes and tags on Book detail

As Mika,
I want a Book's genres, themes and my tags shown on its detail,
So that I see how it's classified and can filter from there (FR-26, UX-DR43).

**Acceptance Criteria:**

**Given** an opened Book
**When** Book detail renders
**Then** a group shows system genres (in my language, English when no Finnish name), my genres, system themes, my themes and my tags as Filter chips; empty kinds are absent
**And** tapping a chip adds that value to the collection's filters

### Story 9.7: [G2] Tag picker on Book detail and Edit book

As Mika,
I want to add and remove my tags, genres and themes where I see the Book,
So that classifying a book is a tap or two (FR-13, FR-26, UX-DR47).

**Acceptance Criteria:**

**Given** the story starts
**When** work begins
**Then** Mika picks how a kind is chosen and how values are added and removed, in Book detail and on Edit book from rendered mock-up options, and the pick is recorded in EXPERIENCE.md before the screen is built

**Given** "Add tag" in Book detail, or the tags field on Edit book's first screen
**When** I open the picker
**Then** it offers tag, genre and theme as kinds, with a combobox of my values of that kind that creates new ones; adding or removing saves at once in Book detail with "Tagged 1 · Undo"
**And** on Edit book the tags field is part of the form and saves with Save (no Undo)
**And** a rejected name (`SYSTEM_NAME`, `NAME_TAKEN`) shows its message under the field

### Story 9.8: [G10] Tag a selection

As Mika,
I want to tag several books at once,
So that tagging a whole shelf is one action (FR-33, UX-DR42).

**Acceptance Criteria:**

**Given** ticked copies in select mode
**When** I tap Tag
**Then** the picker has two parts, add to all and remove from all, for any kind; both copies of one Book change together
**And** the result toasts "Tagged {n} · Undo", and Undo restores each Book's tags
**And** Tag now appears in the action bar

### Story 9.9: [G9] Tags, my genres and my themes in Settings

As Mika,
I want to manage my labels,
So that they stay tidy (FR-17, UX-DR50).

**Acceptance Criteria:**

**Given** `/settings`
**When** I open the Tags, My genres or My themes group
**Then** each value is a List row with its copy count and Links Rename, Merge, Delete
**And** Rename edits in place, offers a merge on a name in use and rejects a system name; Merge and Delete are confirmed by dialogs saying how many books are affected; none has Undo

### Story 9.10: [G4] Seeded system genres

As Mika,
I want a starting list of genres with Finnish names,
So that books get sensible genres from day one (FR-17, D-2).

**Acceptance Criteria:**

**Given** a migration
**When** it runs
**Then** it seeds Google Books' top-level category vocabulary as system genres, each with `name` and `nameFi`; the list and its Finnish names are written in the story and reviewed by Mika
**And** the seeded genres show in Finnish through `genreName()` (Story 3.17)
**And** the migration is idempotent against genres already present

### Story 9.11: [G5] Genres from Google Books on save

As Mika,
I want saved books to get genres from Google's categories,
So that I don't classify two hundred books by hand (FR-17, D-2).

**Acceptance Criteria:**

**Given** `mapSubjectsToGenres(ctx, book)` in `lib/catalogue`
**When** a shared Book is saved
**Then** it reads Google's categories from `RawMetadata.subjects.google`, matches them by `nameKey` to system genres, creates missing ones (English name only) and sets `books.genres`
**And** if the fixture checkpoint (Story 3.2) found Google covering under half, it also maps Finna's genre terms from the stored raw Finna response
**And** an admin-only re-run applies it to every shared Book saved before, filling `books.genres` only where it is empty
**And** integration tests use stored fixture raw data

### Story 9.12: [G15] "New genre" on the Answer

As Mika,
I want the Answer to say when a save would create a genre,
So that I notice odd categories before they land (FR-13, D-2).

**Acceptance Criteria:**

**Given** a `source` lookup result
**When** it is built
**Then** `matches.genres` lists each genre the save would map, with `null` for one it would create, without writing
**And** the Answer shows "New genre" for those, next to "New author" and "New series"

### Story 9.13: [G11] Genre admin service

As Mika, as admin,
I want to fix genre names and duplicates,
So that the shared genre list stays clean (FR-17, D-2).

**Acceptance Criteria:**

**Given** `lib/catalogue` and `canEditShared`
**When** the admin renames, sets the Finnish name, adds, merges or deletes a system genre
**Then** merge moves every `books.genres` reference to the target and deletes the source in one transaction; delete removes the genre from Books first
**And** no private row of any user is read or written (D-6)
**And** each call by a non-admin fails with `NOT_FOUND`
**And** `genreUse(ctx)` returns each genre's Book count

### Story 9.14: [G12] Genres in Settings, admin only

As Mika, as admin,
I want to manage genres where I manage my other lists,
So that adding a Finnish name is quick (D-2, UX-DR50).

**Acceptance Criteria:**

**Given** the story starts with rendered mock-up options of the Genres group, and Mika has picked one
**When** an admin opens `/settings`
**Then** a Genres group lists every system genre in my language with its Book count and a "No Finnish name" mark where `nameFi` is empty
**And** the English and Finnish names edit in place; "Add genre" adds one; Merge and Delete are confirmed by a dialog, with no Undo
**And** the group is absent for non-admins

### Story 9.15: [K13] Phase 1 acceptance

As Mika,
I want the Phase 1 success metrics checked and written down,
So that "done" is a measurement, not a feeling (PRD Success Metrics).

**Acceptance Criteria:**

**Given** production with the catalogue in
**When** the acceptance is run
**Then** "where is it?" is timed on the phone for five books, from opening bookeh to seeing the location, each under 10 s
**And** a SQL query counts Books with any override or edit after saving against all Books held, and the ratio is recorded; above 1 in 10, the counter-metric is flagged for a decision
**And** the count of catalogued books with a location, the NFR-1 and NFR-2 measurements from Stories 3.46 and 8.2, and the restore rehearsal from Story 4.10 are listed
**And** the results are written in `docs/phase-1-acceptance.md`
