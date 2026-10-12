---
title: 'Story 3.17: [B5] `genres` collection'
type: 'feature'
created: '2026-10-12'
baseline_revision: '288417dfcb4c801fc4eac863a5ce48f0a288f9de'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      No automated check runs down() migrations.
    evidence: |-
      CI applies migrations up only; nothing runs migrate:down. The genres down() was reordered by hand (generator drops the table CASCADE before the rels constraint) and checked manually on a scratch database. Same gap as deferred in spec-3-15; a CI migrate:down then migrate step would close it for every migration.
    location: >-
      .github/workflows/ci.yml
    severity: low
---

<intent-contract>

## Intent

**Problem:** `books.genres` (B2), the seed (G4), `mapSubjectsToGenres()` (G5) and genre admin (G11) need a `genres` collection of shared system genres with an English and an optional Finnish name. None exists; `bookFields.ts` still casts the `genres` slug, and nothing turns a genre into the name a user should see.

**Approach:** Add `genres` with `name`, `nameFi` and a `nameKey` on `name` that is unique as a plain database constraint (genres are shared only, D-2/AD-4). Users read, only the admin writes. Add `genreName(genre, locale)` as the one display helper. Commit the migration and regenerated types; an int test covers access and the constraint.

## Boundaries & Constraints

**Always:**
- Fields in this order: `name` (text, required, `maxLength: 200`, English), `nameFi` (text, optional, `maxLength: 200`), `{ ...nameKeyField(), unique: true }`. No `visibility`, no `createdBy`.
- Access: read — any signed-in user (admin included); signed-out `false`. Create, update, delete — admin only (`isAdmin`). `lib/catalogue` writes later with `overrideAccess`. Lives in `src/access/catalogue.ts` beside `catalogueAccess`, as `genreAccess`.
- Admin: `group: 'Catalogue'`, `useAsTitle: 'name'`, `defaultColumns: ['name', 'nameFi']`.
- `genreName(genre: Pick<Genre, 'name' | 'nameFi'>, locale: Locale): string` in `src/lib/books/genreName.ts`: `nameFi` when `locale === 'fi'` and `nameFi` is non-blank after trimming, else `name`. Pure, no imports from `src/lib`.
- Tests use names with a per-run random suffix: the index is global and test rows are never cleaned up.

**Never:**
- No seed rows (G4), no `mapSubjectsToGenres` or genre admin service (G5, G11), no Settings screen (G12), no `books` collection (B2).
- No uniqueness on `nameFi`, no `afterSchemaInit` hook for genres (a plain unique index suffices; `nameKeyIndexes` is for visibility-scoped tables).
- No UI showing genres in this story: none exists yet; later display code calls `genreName`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| User reads | Signed-in user finds / findByIDs a genre | Returned | No error expected |
| Signed out | `user: null`, `overrideAccess: false` find | Nothing read | `Forbidden` |
| User writes | User creates, updates or deletes a genre through the gateway | Nothing written; row unchanged | `Forbidden` |
| Admin writes | Admin creates, renames (incl. `nameFi`), deletes through the gateway | Written | No error expected |
| Duplicate | "Science Fiction X", then " science  fiction x " | Second not saved | Unique violation surfaces as Payload `ValidationError` |
| Name too long | 201-char `name` (admin, through `runAction`) | Not saved | `{ ok: false, code: 'VALIDATION', fields: { name: 'VALIDATION' } }` |
| Finnish name | `genreName({ name: 'History', nameFi: 'Historia' }, 'fi')` | `'Historia'` | — |
| No Finnish name | `nameFi` `null`, `''` or `'  '` with `'fi'`; any `nameFi` with `'en'` | `name` | — |

</intent-contract>

## Code Map

- `src/collections/Authors.ts` -- collection shape to mirror (access import, doc comment citing the spine, `admin`, `nameKeyField()` after `name`).
- `src/access/catalogue.ts` -- `catalogueAccess` and its `adminOnly`; add `genreAccess` here (read `Boolean(user)`, as `Media.ts`' `signedIn`).
- `src/fields/nameKey.ts` -- `nameKeyField()` returns a `TextField`; spreading `unique: true` makes Payload emit a unique `genres_name_key_idx`.
- `src/payload.config.ts:21` -- add `Genres` to `collections` (keep alphabetical: Authors, Genres, Media, Users). `afterSchemaInit` unchanged.
- `src/fields/bookFields.ts:5-7,77` -- drop the `GENRES` cast; keep `SERIES`, comment now names B4 (story 3.16) only.
- `tests/int/bookFields.int.spec.ts:21-27` -- drop the `genres` cast (`const genres = 'genres'`), comment names only `series` as not in the app.
- `src/i18n/locale.ts:3` -- `Locale` type (`'en' | 'fi'`).
- `eslint.config.mjs:21-32` -- `lib/books` may import from `src/lib` only `payload`, `undo`, `errors`, `processState`; `@/i18n` and `@/payload-types` are outside `src/lib` and allowed. `catalogue`, `shelf`, `tags` and the app may import `lib/books`.
- `tests/int/authors.int.spec.ts` -- test pattern to copy: `contextFor`, gateway calls, `rejects.toThrow(Forbidden)`, signed-out read via `createLocalReq({}, payload)` + `user: null`, `runAction` for `VALIDATION`, `unique()` suffix.
- `src/migrations/20261012_173948_authors.ts` -- previous migration; Payload's generator drops the table CASCADE before the `payload_locked_documents_rels` constraint, so `down()` needed hand reordering there (3.15 review). Expect the same for genres.
- `tests/unit/locale.unit.spec.ts` -- unit test style for a pure helper.

## Tasks & Acceptance

**Execution:**
- `src/access/catalogue.ts` -- add `genreAccess` per Always. -- catalogue access in one home.
- `src/collections/Genres.ts` -- new collection per Always.
- `src/payload.config.ts` -- register `Genres`.
- `src/payload-types.ts` -- `npm run generate:types`.
- `src/migrations/*` -- `npx payload migrate:create genres`; commit `.ts`, `.json`, regenerated `index.ts`. Confirm the SQL has `CREATE UNIQUE INDEX "genres_name_key_idx"`; reorder `down()` so it drops the rels constraint, index and column before the table if the generator orders it otherwise.
- `src/fields/bookFields.ts`, `tests/int/bookFields.int.spec.ts` -- remove the `genres` casts.
- `src/lib/books/genreName.ts` -- new, per Always.
- `tests/unit/genreName.unit.spec.ts` -- new: the two `genreName` matrix rows.
- `tests/int/genres.int.spec.ts` -- new: the access, duplicate and length matrix rows.

**Acceptance Criteria:**
- Given `npm run test:unit`, `npm run test:int`, `npm run lint`, `npm run typecheck`, when they run, then all pass (lint: 0 errors).
- Given a scratch database built only by `payload migrate`, when `migrate:create check --skip-empty` runs, then no migration is written; and `migrate:down` then `migrate` on it succeed.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 18 findings — high 0, medium 3, low 10, false 5, maybe-false 0
- findings:
  - `[medium]` `[defer]` blind: the genres migration snapshot lacks 3.16's `series`; merged as is, the next `migrate:create` re-emits series DDL. Real for the merged tree; built in parallel by arrangement, and the epic rule (regenerate after rebase) is the fix at merge time. Deferred.
  - `[low]` `[defer]` blind: `bookFields.ts`, `payload.config.ts`, `migrations/index.ts`, `bookFields.int.spec.ts` conflict with 3.16 and the `SERIES` comment goes stale. Same root as the row above (parallel build); resolved at merge. Deferred with it.
  - `[low]` `[reject]` blind: no indexed way to match a genre by its Finnish name for `SYSTEM_NAME`, and `nameFi` is not unique. `SYSTEM_NAME` is G7/`lib/tags` work; that story can add a key if it needs one (no abstraction for later). Duplicate Finnish names are admin data, fixed by the admin's Merge (G11); the AC sets no such constraint.
  - `[low]` `[patch]` blind: `genreName` checks the trimmed `nameFi` but returns it untrimmed. Patched: returns the trimmed value; unit case for `' Historia '` added.
  - `[low]` `[reject]` blind: a duplicate name is reported on the hidden `nameKey` path. Real (`handleUpsertError` uses the constraint column), but the admin back office is the only path until G11, whose service matches by `nameKey` first (AD-19), and it still fails loudly; the fix wires adapter internals. Same verdict as 3.15.
  - `[low]` `[reject]` blind: `signedIn` is defined in both `access/catalogue.ts` and `Media.ts`. A one-line predicate; `adminOnly` was already duplicated the same way; consolidating touches `Media.ts` for no named harm.
  - `[low]` `[patch]` blind: `nameFi` shows as "Name Fi" in the admin. Patched: `label: 'Finnish name'`.
  - `[low]` `[patch]` blind: the admin list sorts by creation date. Patched: collection `defaultSort: 'name'`.
  - `[false]` `[reject]` blind: the `genres` alias in `bookFields.int.spec.ts` is pointless and the stand-in may be swapped for the real `Genres`. The spec's header comment states the collections are throwaway stand-ins on a second instance, and `authors` uses the identical alias pattern; no caller diverges.
  - `[low]` `[reject]` edge: duplicate error on the hidden `nameKey` path. Same evidence as the blind row.
  - `[low]` `[patch]` edge: padded `nameFi` displayed untrimmed. Same root as the blind row; patched with it.
  - `[medium]` `[defer]` edge: genres snapshot lacks series once 3.16 lands. Same root as the first blind row; deferred with it.
  - `[low]` `[defer]` verification-gap: no automated check runs `down()`. Pre-existing CI gap (also deferred in 3.15); this story's down() was checked by hand (up, down, up on a scratch database). Deferred.
  - `[false]` `[reject]` intent: admin display does not go through `genreName`. The admin has no i18n config and is English; `genreName(genre, 'en')` is `name`, which is what `useAsTitle` shows.
  - `[false]` `[reject]` intent: the uniqueness test cannot tell a DB constraint from an app check. There is no app-level check; the `ValidationError` comes from the 23505 in `handleUpsertError`, and CI runs the int lane on the migration-built schema.
  - `[false]` `[reject]` intent: admin UI and REST writes are covered only by construction. They run the same collection `access` functions the gateway test exercises; no other write path exists.
  - `[false]` `[reject]` intent: "created on save" is exercised only by a test-local system write. `lib/catalogue` does not exist yet (G5); the `overrideAccess` write the test makes is the path it will use.
  - `[medium]` `[defer]` intent: lane sequencing; built on 3.15, not 3.16. Same root as the first blind row; deferred with it.

## Design Notes

A plain unique index, not the partial pair authors use: genres have no `visibility`, so "unique among shared rows" is just "unique" (AD-19). `genreName` lives in `lib/books` because `EffectiveBook.genres` (B8) and every caller that shows a genre (shelf filter values, tags' `SYSTEM_NAME`, catalogue genre admin, the app) may import it there.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass, including `genreName`.
- `npm run test:int` -- expected: all pass, including `genres`, `bookFields`.
- Scratch check on port 5433: create DB `bookeh_migcheck`; `DATABASE_URL=…:5433/bookeh_migcheck npx payload migrate`; `npx payload migrate:create check --skip-empty` -- expected: no file written; `migrate:down` then `migrate` -- expected: both succeed; drop the DB.

## Auto Run Result

**Summary.** `genres` exists with `name` (English, required, max 200), `nameFi` (optional, max 200, admin label "Finnish name") and a `nameKey` on `name` that is plainly unique (`genres_name_key_idx`): genres are shared only, so there is no visibility and no `createdBy`. `genreAccess` lets any signed-in user read and only the admin create, update or delete; signed out reads nothing. The admin list sorts by name. `genreName(genre, locale)` in `lib/books` gives the trimmed Finnish name in Finnish when it is not blank, else the English name. No screen shows genres yet; later display code calls it.

**Files changed.**
- `src/collections/Genres.ts` -- new collection.
- `src/access/catalogue.ts` -- `genreAccess`.
- `src/payload.config.ts` -- registers `Genres`.
- `src/migrations/20261013_122124_genres.{ts,json}`, `src/migrations/index.ts` -- the migration; down() reordered so it runs. Regenerated on top of 3.16's series migration when rebased onto main.
- `src/payload-types.ts` -- regenerated.
- `src/fields/bookFields.ts`, `tests/int/bookFields.int.spec.ts` -- `genres` slug casts dropped.
- `src/lib/books/genreName.ts` -- new display helper.
- `tests/unit/genreName.unit.spec.ts` -- new: Finnish name, trimming, fallbacks.
- `tests/int/genres.int.spec.ts` -- new: 6 tests for read, signed-out read, refused user writes, admin writes, the unique `nameKey` and the 200-character limit.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.17 done.

**Review.** 18 findings (medium 3, low 10, false 5). Patched 3 entries, all low: `genreName` returns the trimmed Finnish name, the `nameFi` admin label, and `defaultSort: 'name'`. Deferred 2: the migration snapshot and shared files must be regenerated/rebased when merged with 3.16 (built in parallel without `series`), and no CI step runs `down()` migrations. Rejected: a Finnish-name key and `nameFi` uniqueness (G7/G11 decide; no abstraction for later), the duplicate error reported on the hidden `nameKey` path (admin-only until G11's service matches first; same as 3.15), the duplicated `signedIn` predicate (no named harm), and five false findings (the bookFields stand-in alias; admin display is English so `genreName` gives `name`; the uniqueness error is the database's; admin/REST share the same access; `lib/catalogue` will use the tested `overrideAccess` path).

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 3.

**Verification.** `npm run lint`: 0 errors (16 warnings, unused args in generated migrations). `tsc --noEmit` (typecheck): clean. `npm run test:unit`: 29 files, 500 passed. `npm run test:int`: 19 files passed, 1 skipped; 157 passed, 1 skipped (`genres` 6, `bookFields` 8). Scratch database `bookeh_migcheck` on port 5433 built by `payload migrate`: `migrate:create check --skip-empty` wrote nothing; `migrate:down` (all four migrations) then `migrate` succeeded; `genres_name_key_idx` is UNIQUE; database dropped. After the patches `migrate:create check --skip-empty` still wrote nothing. Playwright not run (collection story, no UI).

**Residual risks.** The merge with 3.16: the genres migration's `.json` snapshot has no `series`, so whichever story merges second must delete and regenerate its migration, `index.ts` entry and `payload-types.ts` after rebasing, and resolve `bookFields.ts` / `bookFields.int.spec.ts` (drop the `SERIES` cast and its comment).
