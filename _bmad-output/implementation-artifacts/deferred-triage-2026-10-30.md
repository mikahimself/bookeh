# Deferred items triage, 2026-10-30

Every deferred item in the repository, checked against the code at `e027d6e` before the clean-up ahead of Epic 8. Stories 7.16 to 7.27 are built from it; Story 7.26 closes `deferred-work.md` from it. The spec files stay as they are, as history, so this file is the ledger.

**Scope:** the 116 entries in spec frontmatter and the 32 in `deferred-work.md`, 148 in all. Action items in `sprint-status.yaml` are not listed here; the stories cite them.

**Method:** four read-only passes over the code, one verdict per entry. Everything taken into a story or accepted here was re-checked at the source, except B1's failed-init path, which was read only as far as the `onInit` guard. Entries marked closed, moot or already accepted rest on the passes' citations and were not all re-checked.

**Result:** 41 go into a story, 8 need a real device, 15 are accepted here, 2 already have an owner, 18 were accepted earlier, 63 are closed or moot, and 1 is a feature rather than a defect.

## Into a clean-up story (41)

Still true today, and worth fixing before Epic 8.

| Goes to | Entry | From | What | Evidence |
|---|---|---|---|---|
| 7.16 | A15 | 1.5 | Record in the Payload skill reference (or the spine's conventions) that Payload skips field-level `validate` for any... | The rule is recorded nowhere in `CLAUDE.md` or the spine |
| 7.16 | C15 | 3.2 | CLAUDE.md's Finna line still gives `https://api.finna.fi/v1/search?lookfor=isbn:"<isbn13>"&type=AllFields` with no fi... | `CLAUDE.md:46` is still the bare Finna URL |
| 7.16 | D22 | 5.39 | The spine's Story size row says about 300 hand-written lines; CLAUDE.md says about 500. | Spine line 313 and `epics.md:188` say 300; `CLAUDE.md` says 500 (re-checked) |
| 7.17 | D25 | 6.6 | Holdings can now return an ordered copy with an open loan, which Book detail's copy-line rules do not cover. | `setStatus` refusal |
| 7.17 | D26 | 6.7 | The Lend picker's default date and max are fixed at server render, so a Book detail left open past Helsinki midnight... | Lend picker date |
| 7.17 | D29 | 7.3 | A scanned ISBN whose Book the viewer holds only through open wishlist entries shows no Answer; the scan screen resets... | Entry-only scan; Story 8.2 replaces the stopgap |
| 7.18 | C12 | 3.18 | Deleting a user leaves their private Books orphaned (createdBy set null). | `created_by_id` cascades |
| 7.18 | C13 | 3.19 | user_books.owner_id and book_id are NOT NULL with ON DELETE set null foreign keys. | `user_books` keys |
| 7.18 | C16 | 3.20 | The copies foreign keys owner_id and book_id are ON DELETE set null on NOT NULL columns, so deleting a user or a Book... | `copies` keys |
| 7.18 | C18 | 3.21 | locations.owner_id is NOT NULL with an ON DELETE set null foreign key, so deleting a user who has locations fails wit... | `locations.owner_id` |
| 7.18 | C7 | 3.15 | Deleting a shared author silently removes it from every Book once B2 adds books.authors. | Confirmed: rels keys cascade. A `RESTRICT` there depends on trigger order during a user delete, so a hook does it |
| 7.18 | D23 | 6.1 | Deleting a user who owns People fails, because people.owner_id is NOT NULL with an ON DELETE SET NULL foreign key. | `people.owner_id` |
| 7.18 | D24 | 6.4 | Deleting a copy that has loans in Payload admin fails on the loans.copy_id foreign key with a raw database error. | `loans.copy_id` |
| 7.18 | D27 | 7.1 | Deleting a user who owns a wishlist fails, because wishlists.owner_id is NOT NULL with an ON DELETE SET NULL foreign... | `wishlists.owner_id` |
| 7.18 | D28 | 7.2 | wishlist-entries foreign keys are generated ON DELETE set null, with wishlist_id, book_id and owner_id NOT NULL, so a... | `wishlist_entries` keys |
| 7.18 | D31 | 7.4 | A wishlist entry for a Person committed concurrently with that Person's delete or merge silently becomes the owner's... | Story 7.4's race |
| 7.19 | A21 | 1.8 | Decide which fields a user may change on their own `users` document (email, password) and whether the current passwor... | `Users.ts:74` still `update: adminOrSelf`, nothing guards `email` or `password` |
| 7.19 | B17 | 1.22 | Close or explicitly accept the REST path that lets a signed-in user change their own email or password with no curren... | Same gap as A21 |
| 7.20 | B31 | 4.2 | Book `publisher` and `language` have no maxLength, and `year`, `pages` and `seriesIndex` have no min or integer rule,... | `bookFields.ts:53-57`: no limit on `publisher` or `language`, no minimum on the numbers (re-checked) |
| 7.20 | C21 | 3.31 | A `found` outcome merged while a source failed can become a permanent shared Book built from the other source's value... | Confirmed: `found` carries no `failed`, and a partial outcome is saved as a permanent shared Book |
| 7.20 | C32 | 3.45 | There is no error boundary, so an unexpected lookup failure shows Next's default error page. | Confirmed: no `error.tsx` anywhere in `src/app` |
| 7.20 | D14 | 5.38 | An ordered copy in the covers layout is marked only by the decorative airmail band, so a screen reader hears nothing... | `CoverTile.tsx:51` is a class only, so a screen reader can't tell an ordered tile |
| 7.20 | D15 | 5.38 | A toast Undo with Book detail closed reloads the rows but does not refresh the server render, so the Filter panel's c... | Confirmed: `onUndone` only reloads (`ShelfRows.tsx:267`), so counts go stale with Book detail closed |
| 7.21 | A16 | 1.6 | Add a repeatable lint-rule test: a `RuleTester` unit spec for `bookeh/client-lib-imports` (no fixtures on disk needed... | Only the two custom rules have a spec |
| 7.21 | B12 | 1.16 | Lint-rule tests for the frontend Payload import ban and react/jsx-no-literals (lint sample sources as src/app/(fronte... | Frontend import ban and `jsx-no-literals` have no test |
| 7.21 | B19 | 1.9 | Check src/migrations/index.ts against the migration files on disk once prodMigrations is wired (Epic 2). | Nothing compares `src/migrations/index.ts` with the files on disk (re-checked) |
| 7.21 | B28 | 4.19 | A merge that deletes a cover's media row and then rolls back is not tested to keep the cover file. | No test that a rolled-back merge keeps the old cover file |
| 7.21 | B4 | 1.11 | Nothing keeps the new gateway lint bans firing: the src/lib import ban and the .payload member ban are checked only b... | Gateway and `.payload` bans have no test |
| 7.21 | C23 | 3.37 | The save restore's "already gone" branches (copy or Book deleted before the Undo) have no test. | AD-20 says a restore skips rows that are gone; no test for the save path |
| 7.22 | A1 | 1.1 | Encode the patched Node version for host development (a `.nvmrc`/`.node-version` with 22.23.3 and a tighter `engines.... | No `.nvmrc`; `engines.node` still `>=20.9.0` (`package.json:68`) |
| 7.22 | A2 | 1.1 | Pin the Compose `payload` service image (`node:22-alpine`, floating) to `node:22.23.3-alpine` and use `npm ci` instea... | Image pinned; the command is still `npm install` (`docker-compose.yml:12`) |
| 7.22 | A22 | 1.8 | Guard dev data against schema pushes from a running `next dev`: a README warning or a pre-change step for schema stor... | The README has no warning; loss is dev data only |
| 7.22 | A3 | 1.1 | Stop `.npmrc` `legacy-peer-deps=true` from hiding peer mismatches between the exact-pinned `@payloadcms/*` packages (... | `.npmrc` still `legacy-peer-deps=true` |
| 7.22 | A7 | 1.2 | Single source for the Node version (`.nvmrc` with 22.23.3, `node-version-file` in setup-node, `engines.node` raised)... | Same fix as A1 |
| 7.22 | A9 | 1.3 | Rewrite `README.md` for bookeh; it is still the Payload template (MongoDB, Deploy button, cloud hosting) and now cont... | `README.md:1-35` is still Payload's blank template |
| 7.22 | B21 | 4.10 | deploy/README.md has no step-by-step production restore (recover .env secrets, empty data/, pg_restore through compos... | `deploy/README.md:363-384` lists traps but no restore sequence |
| 7.22 | C4 | 3.12 | next.config.ts still allows /api/media/file/** for next/image, whose optimiser fetches without credentials and now ge... | `next.config.ts` still allows `/api/media/file/**`; `Cover.tsx` uses a plain `img` |
| 7.22 | D21 | 5.39 | The uncalled flash-toast chain (flash.ts, flashCookie.ts, the ToastProvider effect, about 250 lines with tests) stays... | Confirmed: `flashToast()` has no caller; about 250 lines remain with its spec |
| 7.26 | A18 | 1.6 | Resolve the spine's own conflict with its one-way table before Story 9.2: AD-5 has `editBook()` in `lib/catalogue` wr... | Spine line 60 has no `catalogue` to `tags` edge, while AD-5 has `editBook()` writing tags |
| 7.26 | C46 | 3.9 | The spine (AD-9) and epic-3-context still describe the source contract as "a list, empty for none" and candidates fro... | Spine lines 171-172 still say "first source that answered" and "empty for none" |
| 7.26 | D20 | 5.39 | PRD FR-47 still says a private Book's cover is visible only to its creator, while AD-5 now shares it in place on prom... | `prd.md:198` FR-47 contradicts Epic 4 retro decision 1 and AD-5 |

## Needs a real device (8)

Only a phone, a browser or the LXC can settle these, so they go to Story 7.27.

| Goes to | Entry | From | What | Evidence |
|---|---|---|---|---|
| 7.27 | A25 | 1.21 | Pad the fixed elements (toast region, full-screen task) for `safe-area-inset-left` and `safe-area-inset-right`, so th... | Fixed elements ignore the side insets (`ToastProvider.tsx:124`, `FullScreenTask`); the manifest doesn't lock orientation |
| 7.27 | A31 | cover-treatment | Check paint cost of cloth placeholders on a large shelf on the phone. | Needs a covers view of a few hundred coverless copies on the iPhone |
| 7.27 | A35 | 2.2 | On-LXC acceptance (systemd unit with NAS mounts, tailscale serve, phone reaching sign-in over tailnet HTTPS, env-file... | Checklist at `deploy/README.md:494`, not recorded as run |
| 7.27 | C2 | 3.1 | After the camera lands in `off` inside one task (a track `ended`, which iOS may raise when the installed app is backg... | `CameraSession.tsx:64-85` is one-shot; whether iOS ends the track needs a device |
| 7.27 | D12 | 5.30 | On iOS Safari the phone keyboard may cover the Move picker's "New location" field and its button at the bottom of the... | iOS keyboard over New location |
| 7.27 | D19 | 5.39 | The stale bookeh-postgres-last-backup container still exists; Epic 5 item 59 stays open. | Container still present, Exited (re-checked) |
| 7.27 | D3 | 5.12 | Restore after a history Back (X on Scan or Edit book) is unverified in a real browser against the browser's own 'auto... | Still checked only in jsdom (`ShelfRows.tsx:207-235`) |
| 7.27 | D9 | 5.18 | The phone check from Book detail's Edit (image/* picker offers the camera, an iPhone camera photo goes through the to... | HEIC, camera offer, crop drag |

## Accepted here (15)

Still true, and not worth fixing now. Each has its reason, for a veto.

| Entry | From | What | Evidence |
|---|---|---|---|
| B1 | 1.10 | A failed first Payload init leaves the getPayload cache entry, so later inits skip onInit and the instance serves wit... | Needs a bad seed value on an empty instance, and a restart cures it |
| B3 | 1.10 | Close /admin/create-first-user and POST /api/users/first-register (carried from the 1.8 deferral that targeted 1.10). | Production always seeds, so `users` is never empty; goes with the NFR-5 pass if Phase 2 opens |
| B32 | 4.21 | A Local API call that leaves out overrideAccess gets system privileges by Payload's default, and no lint rule sees it... | The tree is clean and the allowed modules are few; a call-analysis lint rule isn't worth it for one user |
| C3 | 3.10 | A COMMIT that fails (connection drop, serialization failure) is swallowed by Payload's Drizzle adapter, so `withTrans... | Confirmed: `done`'s `.catch` swallows a failed COMMIT. Only a connection lost at that instant triggers it (read committed, no deferrable constraints), and detecting it means bypassing the adapter |
| C6 | 3.13 | Renaming an author keeps a stale derived sortName (a typo fix "Tove Janson" to "Tove Jansson" keeps "Janson, Tove"),... | Rare, admin-only, and clearing the field re-derives it |
| C8 | 3.15 | No automated check runs down() migrations; Payload's generator drops the table before the rels constraint it cascaded... | CI never runs `migrate:down`; recovery is the rehearsed dump restore (NFR-6), not `down()` |
| C9 | 3.16 | No automated check runs down() migrations; the series down() order is verified only by hand. | As C8 |
| C10 | 3.17 | No automated check runs down() migrations. | As C8 |
| C11 | 3.18 | No automated check runs down() migrations. | As C8 |
| C19 | 3.21 | The hand-reordered migration down() is verified only by the manual scratch check; nothing in CI runs migrate:down. | As C8 |
| C20 | 3.25 | A failed COMMIT is swallowed by the Payload Drizzle adapter, so withTransaction() resolves and withUndo() records a r... | Same as C3 |
| C39 | 3.53 | The page's &pick= parsing through lookupBook to the rendered Answer, and the editions Link's render condition in NotI... | The pieces are tested; a two-record e2e fixture isn't worth it under the tests-at-a-minimum convention. Closes the reopened half of item 28 |
| C41 | 3.6 | mergeResults fills series and seriesIndex one field at a time, so Finna's series name without a number can be paired... | Latent: Google emits no series. Pair the fields when a second series source arrives |
| D8 | 5.17 | A quick double tap on an option that returns to the starting address resets the panel's pending taps at once, briefly... | A flicker on a rare double tap; the end state is right |
| D16 | 5.39 | Dropping or replacing a non-admin's authors/series override leaves the private author or series it created unreferenced. | Unreferenced private rows are invisible, get reused by `nameKey`, and go with the user delete once 7.18 lands |

## A feature, not a defect (1)

Left out of the clean-up. It needs a PRD change first.

| Entry | From | What | Evidence |
|---|---|---|---|
| A32 | none | Let a user mark a Book as "Currently reading" — a third reading state beside unread and read (UserBooks read flag, FR... | A new feature, not a defect: it changes the data model and FR-29 |

## Already owned by a later story (2)



| Goes to | Entry | From | What | Evidence |
|---|---|---|---|---|
| 9.16 | C43 | 3.7 | The Google adapter is tested on by-id volumes wrapped in a search body, not on recorded isbn: search answers. | Google adapter tests move to recorded `isbn:` answers |
| 9.4 | D2 | 5.1 | ShelfQuery genre values mix system genre ids and user genre tag ids from separate id sequences. | Story 9.4 owns the genre value encoding |

## Accepted earlier (18)

A retrospective or a convention already settled these.

| Entry | From | What | Evidence |
|---|---|---|---|
| A8 | 1.3 | Run CI's Postgres from `docker-compose.yml` (a Compose-based job) instead of a hand-mirrored service container, so `P... | Deploy and CI artifact under the tests-at-a-minimum convention; `ci.yml:21` mirrors compose by hand |
| A10 | 1.3 | In Story 5.3 (text search), add an assertion on the ICU default that `'Ä' ilike 'ä'` is true and `'a' ilike 'ä'` is f... | Test-only gap; no story criterion names it |
| A20 | 1.8 | In Story 1.10, close the `/admin/create-first-user` and `POST /api/users/first-register` path, or make the first user... | `spec-1-10:47,118` leaves first-register open by design; the env seed covers the first user |
| A23 | 1.11 | In Story 1.16, add an e2e test that a signed-out visit to a page calling `requireUser()` lands on `/login?next=<encod... | Outside Playwright's scope (Epic 1 retro decision 4) |
| A26 | 1.21 | Known consequence of DESIGN.md option T1, not a defect to fix unprompted: with a dark device theme the installed app... | Known consequence of DESIGN.md option T1 |
| A28 | 1.16 | Make sign-in take the same time whether or not the account exists or is locked. | Epic 1 retro decision 2; revisit with NFR-5 |
| A29 | 2.3 | backup.sh's failure branches (empty-DB refusal, pg_restore self-verification, .failed rename, prune-only-after-succes... | Deploy artifact under the tests-at-a-minimum convention |
| A34 | 2.2 | The deploy artifacts (compose.prod.yml resolution, the marker-check wrapper) have no repeatable verification after th... | Deploy artifact under the tests-at-a-minimum convention |
| B5 | 1.11 | Add an e2e test that a signed-out visit to a page calling requireUser() lands on /login?next=<encoded path and search... | Outside Playwright's scope (`deferred-work.md:40`) |
| B11 | 1.16 | Add a browser test of the sign-in form and Sign out: sign in from /login?next=%2F%3Fa%3D1 back to /?a=1, a wrong pass... | Outside Playwright's scope |
| B13 | 1.16 | Before public exposure (Phase 2, NFR-5), make sign-in timing independent of whether the account exists or is locked. | `deferred-work.md:93`; revisit with NFR-5 |
| B15 | 1.17 | Add a browser test of the toast provider glue: a flash cookie present at load or set before a navigation produces a v... | Outside Playwright's scope |
| B20 | 4.1 | Payload REST still lets any signed-in user read shared Books by id or list them at /api/books. | Epic 4 retro S11 and decision 4 |
| B29 | 4.19 | A committed merge leaves the deleted cover's file on disk until the next start. | `spec-4-12:99`; the `deleteMediaRow` contract |
| B35 | 4.4 | A private Book given the ISBN of an existing shared Book stays a separate private Book, and a scan of that ISBN answe... | `spec-4-4:13,82`; `lookupBook.ts:77-79` documents shared wins |
| C22 | 3.33 | The Payload admin's create form for `copies` is a second insert path that bypasses `createCopy()`. | Spine line 31: the back office triggers no service behaviour |
| D17 | 5.39 | The override drop is pinned only for title; the authors (ordered ids) and series (id) branches of sameAsShared are un... | 5.39 asked for one case, which exists |
| D18 | 5.39 | No above-int4 case for removeCopies or requireOwnCopy (setNote, setStatus), which gained an isRowId check in this story. | 5.39 asked for the `requireOwnBook` case, which exists |

## Closed or moot (63)

Landed, or the premise is gone.

| Entry | From | What | Evidence |
|---|---|---|---|
| A4 | 1.1 | Decide whether to keep `lexicalEditor()` and `@payloadcms/richtext-lexical` (no collection has a `richText` field); c... | No `lexical` or `richtext-lexical` in `payload.config.ts` or `package.json` |
| A5 | 1.1 | Account in Story 1.8 (`users` collection and its first migration) for Payload 3.90's new auth column `resetPasswordRe... | `reset_password_requested_at` is in the users migration; the rate-limit note was not checked |
| A6 | 1.2 | If the first CI runs show the admin e2e `beforeAll` timing out on the cold Turbopack compile of `/admin`, raise Playw... | The admin e2e spec was removed in 3.54 |
| A11 | 1.3 | In Stories 2.2 and 2.3, state in `deploy/README.md` that the production cluster needs the same `POSTGRES_INITDB_ARGS`... | `deploy/README.md:363-382` |
| A12 | 1.4 | Move Playwright e2e off the dev database (own server on `bookeh_test`, no `seedUser.ts` writes to `bookeh`). | `README.md:63`: e2e runs on its own `next dev` against `bookeh_test` |
| A13 | 1.4 | Remove `@testing-library/react` (and the `react()` Vitest plugin) unless a component-test lane is planned. | `@testing-library/react` is in use by the unit specs (Epic 3 retro A14) |
| A14 | 1.4 | Decide how `bookeh_test` survives data-loss schema changes: a documented reset (`DROP DATABASE bookeh_test; CREATE DA... | `scripts/test-db.ts`, `npm run test:reset` |
| A17 | 1.6 | In Story 1.16 (sign-in, replaces the template `page.tsx` that imports `getPayload`), ban direct Payload access from `... | `eslint.config.mjs:428-455` bans Payload, its config, collections and Drizzle in the frontend (re-checked; the pass left this unverified) |
| A19 | 1.7 | Lint-ban `overrideAccess: true` (and unscoped Local API calls) outside the AD-3 allowlist (`src/lib/catalogue`, `src/... | `bookeh/system-privileges` (`eslint.config.mjs:197-225`) |
| A24 | 1.22 | In Story 1.23, check that changing the language in Settings re-renders in the new language in the same request, and i... | `LanguageSwitch` calls `router.refresh()` |
| A27 | 1.16 | Set the session cookie (`auth.cookies.secure` on `users`), `bookeh_prefs` and `bookeh_flash` to `Secure` in production. | `Users.ts` cookies, `prefs.ts:45`, CI smoke asserts `Secure` |
| A30 | 5.21 | Filter chips in Book detail on `/loans` (Story 6.9) and in an opened wishlist entry (Epic 7's entry sheet) open the c... | `FilterChip.tsx:15-60`; built by 6.9 and 7.12 |
| A33 | 2.1 | The production image has no HEALTHCHECK or readiness signal; a container that starts but cannot reach Postgres sits "... | `deploy/compose.prod.yml:37-45` |
| B2 | 1.10 | Check whether next build initialises Payload (and so runs the seed) against a reachable database. | `Dockerfile:29` builds with no `DATABASE_URL`; `spec-2-1:107` |
| B6 | 1.11 | A src/lib service that takes a Payload instance as a parameter (type import allowed) calls the Local API with overrid... | `bookeh/system-privileges`, with a `RuleTester` case |
| B7 | 1.12 | runAction/runRoute map Payload errors by instanceof, proven only against hand-built error instances. | Real Payload errors through `runAction` in `profile.int.spec.ts:99-104` |
| B8 | 1.13 | Locally, playwright reuses whatever server holds port 3000, so e2e in a worktree can test another checkout. | `playwright.config.ts:50`: `reuseExistingServer: false`, port 3100 |
| B9 | 1.14 | Once Story 1.11 lands, move the session read in src/i18n/request.ts behind a lib/payload function, and include src/i1... | `src/i18n/request.ts` uses `currentUser()` |
| B10 | 1.14 | Add a lint guard against hard-coded interface strings in src/app/(frontend)/** (e.g. react/jsx-no-literals), excludin... | `react/jsx-no-literals` errors in `src/app/(frontend)/**` |
| B14 | 1.16 | Set `auth.cookies.secure` on users in production (Story 2.2), so the 30-day payload-token is sent with Secure over ta... | `Users.ts:64-68`; CI smoke asserts `Secure` |
| B16 | 1.21 | No test shows that the theme-color meta follows a theme change made in Settings without a reload. | `spec-1-23:115,123` |
| B18 | 1.22 | In Story 1.23, check that a language change in Settings re-renders in the new language in the same request; if not, r... | `LanguageSwitch.tsx:25` refreshes, so the cached user never spans the change |
| B22 | 4.11 | Promoting a private Book keeps its cover row, so once Story 4.12 allows private uploads a promoted Book would point a... | `sharePrivateBook.ts:209-215`, with int cases |
| B23 | 4.12 | Promoting a private Book keeps its cover row, so a private cover uploaded through setCover would stay private on the... | As B22 |
| B24 | 4.12 | Review (edge, intent) confirmed the promotion gap above; it is now an acceptance criterion of Story 4.14 in epics.md. | As B22 |
| B25 | 4.15 | The new tests and story-size bullets in CLAUDE.md are not reconciled with the spine's Tests and Story size rows, and... | Spine Tests row matches `CLAUDE.md` |
| B26 | 4.15 | The compact-stories bullet keys on the `oversized` warning, which measures spec length rather than diff size, fired o... | `CLAUDE.md` compact-stories bullet; 2500 tokens in `_bmad/custom` |
| B27 | 4.15 | The memory note tests-functional-minimum.md still says test-only review findings are "rejected or deferred"; the new... | `tests-functional-minimum` memory carries the 4.15 rule |
| B30 | 4.2 | AD-5 says a shared Book's `books.genres` is written only by `mapSubjectsToGenres()`, while the same bullet lets the a... | Spine line 120 |
| B33 | 4.21 | No automated check that bookeh/system-privileges still fires; CI lint passes over a clean tree whether the rule works... | `clientLibImports.unit.spec.ts:72-95` |
| B34 | 4.25 | bookeh/system-privileges, the import zones and the gateway lint blocks still have no RuleTester or ESLint-API check. | System-privileges half landed; the zones half is B4 |
| C1 | 3.1 | Story AC 7, the owner's acceptance on the iPhone (installed PWA over HTTPS: camera starts, a barcode navigates to the... | Epic 3 retro S6: scanned on the installed PWA on 2026-10-21 |
| C5 | 3.12 | The int lane and the dev database share the ./media directory, so AD-14's planned onInit orphan sweep run on bookeh_t... | `Media.ts:61` reads `MEDIA_DIR`; `media-test` in the lanes |
| C14 | 3.19 | npm run lint reports errors from .next build output inside .claude/worktrees. | `eslint.config.mjs:481` |
| C17 | 3.20 | tests/unit/scanScreen.unit.spec.ts ("pushes the Answer address on an ISBN barcode, once, and ignores other codes") fa... | Story 4.22, `scan/zxing.ts` lazy loader |
| C24 | 3.40 | A handler that closes an overlay and then navigates may race the wrapper's asynchronous history.back() against the na... | `overlay.tsx:93-106`: `onClosed` runs on the overlay's own back |
| C25 | 3.40 | tests/unit/scanScreen.unit.spec.ts fails about one run in ten with a jsdom canvas error from @zxing/browser. | Story 4.22 |
| C26 | 3.43 | The preview URL /data/cover/<isbn13> and its record do not tell editions apart, so picking another edition can leave... | `coverUrl.ts` adds `?pick=<n>`; `coverPreview.ts` holds one per candidate |
| C27 | 3.43 | The Cover placeholder (p-2 padding, 12px title) does not fit the row covers of 16 × 24, 32 × 48 and 44 × 66 px in DES... | `Cover.tsx:70-71`: the cloth cover replaced this placeholder |
| C28 | 3.44 | An error toast from a failed Settings change stays up after a successful retry. | `useSavedSwitch.ts:44-49`, story 4.23 |
| C29 | 3.45 | Back from an Answer re-reads the barcode still in view and pushes the same Answer again. | `readGate.ts`, `ScanScreen.tsx:98-104` |
| C30 | 3.45 | On a Scan with an isbn in the address (invalid ISBN, rate limit, or a kind with no Answer yet) camera reads stay igno... | `ScanScreen.tsx:54-60` |
| C31 | 3.45 | Lookup kinds with no Answer yet (none, unavailable, existing with holdings) show a silent Scan with the text in the f... | `scan/page.tsx:73-86`; the entry-only gap is story 7.17 |
| C33 | 3.45 | The spine's Toasts convention still says a server render raises a toast only through flashToast(), which cannot work... | Spine Toasts row no longer names `flashToast()` |
| C34 | 3.46 | No test renders the /scan page wiring: AddToLibrary on the Answer and DismissToast only in the Answer branch. | `scanToSave.spec.ts:70-73` |
| C35 | 3.47 | Returning to Scan can re-read the book just saved, and its Answer then dismisses the save toast with its Undo. | As C29 |
| C36 | 3.51 | No test walks the history rule end to end: Scan, Answer A, Back, Answer B, Back, then Back from Scan lands on the sec... | `scanToSave.spec.ts:75-79` |
| C37 | 3.52 | The first self-fetch of the fixture cover route may hit a cold next dev compile longer than the 5 s cover timeout on... | `scanToSave.spec.ts:28-36`; CI green since 7.11 |
| C38 | 3.53 | A save with no cached outcome asks the sources twice, once in downloadCover() and once in ensureSharedBook(), so the... | `saveCopy.ts:105-121`, story 4.17 |
| C40 | 3.6 | Series data on a lower-ranked Finna record of the same edition is lost, because ranking ignores series and merge read... | `lookup.ts:128-129`, story 3.53 |
| C42 | 3.7 | Google's spurious 200 with totalItems 0 during an outage is taken as "none", so a lookup can say "no such book" while... | `lookup.ts:16-18,114-116` |
| C44 | 3.9 | `found.raw` is the best candidate's RawMetadata, so a save of `pick > 0` that stores it unchanged keeps candidate 0's... | `pick.ts:55` |
| C45 | 3.9 | A `found` merged while a source failed is not cached (AC), so a save re-runs the lookup; if the failed source answers... | `pick.ts:41-55`, `saveCopy.int.spec.ts:446` |
| D1 | 5.1 | No serializer for /data/shelf requests; a later story may build shelf params a second time. | `shelfRowsPath()`, `query.ts:221` |
| D4 | 5.13 | On common phone widths the covers sizes collapse: at 375px l is one column (2 x 160 + 24 > 335), at 390px m and l bot... | DESIGN.md:352-356, `styles.css:125-127` |
| D5 | 5.13 | In the covers layout an ordered copy looks like an owned one: tiles show title and author only, while rows end with "... | `CoverTile.tsx:51` |
| D6 | 5.14 | At the rebase onto main, wire the 900–1199px exclusion to 5.18's Book detail instead of the bare `?book=` placeholder. | `FilterPanel.tsx:72-96` |
| D7 | 5.14 | Check whether main's BookDetailSheet (5.18) uses useCloseOnBack while `?book=` changes under it, now that same-pathna... | `useCloseOnBack` no longer exists |
| D10 | 5.27 | The history-back branch of start() (Book detail open with in-app history) is never exercised by a test. | `Selection.tsx:65-70` |
| D11 | 5.28 | Filter panel counts and value lists go stale after an action that changes rows (Remove now; Move, Received, Read later). | `ShelfRows.tsx:96-100`, AD-7 |
| D13 | 5.31 | Undo of a move (or another copy-location restore) fails with UNDO_FAILED when a location it would restore has been de... | `moveCopies.ts:79-108`, `moveCopies.int.spec.ts:120` |
| D30 | 7.3 | Removing the last copy closes Book detail even when open entries still hold the Book. | `BookDetail.tsx:157-160`, `collectionPage.unit.spec.ts:1418` |
| D32 | 7.6 | A private Book held only by a wishlist entry blocks the private-Book merge, so a later isbn13 save of that ISBN fails. | `sharePrivateBook.ts:270`, `sharePrivateBook.int.spec.ts:509` |
