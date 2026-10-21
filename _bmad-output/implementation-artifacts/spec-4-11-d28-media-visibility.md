---
title: 'Story 4.11: [D28] Media visibility'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: 'd3abc955381ef1336d82d4bc0f9c4ee9ac00cc28'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Promoting a private Book keeps its cover row, so once Story 4.12 allows private uploads a promoted Book would point at a private cover other users cannot read.
    evidence: |-
      promote() in sharePrivateBook.ts attaches a downloaded cover only when own.cover is null and otherwise keeps own.cover unchanged. After 4.11, media read is shared OR createdBy = me, so a private row on a shared Book returns 403 on its file and coverUrl null for everyone but the creator and the admin. No private media writer exists before Story 4.12, so the case cannot happen yet. Story 4.12's acceptance criteria in epics.md do not mention promotion. 4.12 must either flip the row to shared on promote or replace and delete it per AD-5.
    location: >-
      src/lib/catalogue/sharePrivateBook.ts:282
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Any signed-in user reads every `media` row and its file (`Media.ts` `read: signedIn`), so a private Book's cover, once uploads arrive in Story 4.12, would be visible to everyone (D-4, AD-4, AD-14).

**Approach:** Give `media` the AD-4 pair through `visibilityFields()` and the AD-4 access through `catalogueAccess`, so users read `shared OR createdBy = me` and the admin reads all, files included. Downloaded covers are created `shared`, and a migration adds the columns, marking existing rows `shared`.

## Boundaries & Constraints

**Always:** Reuse `visibilityFields()` and `catalogueAccess` unchanged; they already name `media`. Keep the `beforeOperation` hooks and `upload` config. The migration is generated with `npx payload migrate:create media_visibility` against `bookeh_test`, then hand-edited only so existing rows become `shared`. `payload-types.ts` is regenerated and committed. Both callers of `attachCover()` create shared Books, so it always writes `visibility: 'shared'`.

**Never:** No upload, `setCover()` or private media writer (Story 4.12). No change to `coverUrl()`, `Cover`, `isUnreferenced()` or the media sweep. No spine edit: AD-14 already states this contract. No default on `visibility` in the config, so no caller gets a shared row by leaving it out.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Private file, creator | A's private media row; `GET /api/media/file/<name>` with A's token | 200, image | No error expected |
| Private file, other user | same file with B's token | 403, no image | Payload `Forbidden` |
| Private file, admin | same file with admin's token | 200, image | No error expected |
| Private row by id, other user | `gateway.findByID(asB, media, id)` | rejects | Payload `NotFound` |
| Downloaded cover | a save that downloads a source cover | media row `visibility: 'shared'`, no `createdBy` | No error expected |
| Existing rows | rows present before the migration | `visibility = 'shared'`, `created_by` null | No error expected |

</intent-contract>

## Code Map

- `src/collections/Media.ts` -- `access` → `catalogueAccess` (drop local `signedIn`/`adminOnly`); `fields` gains `...visibilityFields()` after `alt`; the AD-14 doc comment drops "Per-Book visibility on media arrives with D28" and states the read rule.
- `src/access/catalogue.ts`, `src/fields/visibility.ts` -- reuse unchanged; `createdBy` comes from `req.user` on a private row, null on shared.
- `src/lib/catalogue/covers.ts:225` -- `attachCover()` data gains `visibility: 'shared'`; its doc says why (callers: `ensureSharedBook.ts:85`, `sharePrivateBook.ts:282`, both shared Books).
- `node_modules/payload/dist/uploads/checkFileAccess.js` -- the file route ANDs an object `access.read` result with `filename equals`, so the `where` rule protects files with no extra code (Payload 3.90.2).
- `src/migrations/20261010_095151_visibility.ts` -- precedent for `ADD COLUMN ... DEFAULT ... NOT NULL`.
- `tests/int/media.int.spec.ts` -- `getFile()` (REST_GET on `/api/media/file/<name>`) and `payload.login` token pattern to reuse; `systemCreate` and admin creates need `visibility`.
- `tests/int/effectiveBook.int.spec.ts:136`, `tests/int/sharePrivateBook.int.spec.ts:467` -- system media creates that need `visibility: 'shared'` (typecheck will name any others).
- `tests/int/saveCopy.int.spec.ts:250` -- reads the downloaded cover's media row; add the `shared` assertion here.

## Tasks & Acceptance

**Execution:**
- `src/collections/Media.ts`, `src/lib/catalogue/covers.ts` -- as in the Code Map -- the AC's fields, read rule and shared downloads.
- `src/migrations/<ts>_media_visibility.{ts,json}`, `src/migrations/index.ts` -- generated; in `up`, add `visibility` as `DEFAULT 'shared' NOT NULL` then `ALTER ... DROP DEFAULT`, so existing rows are shared and the schema still matches the config (`migrationSchema.int.spec.ts`). `down` is the generated one.
- `src/payload-types.ts` -- regenerated with `npm run generate:types`.
- `tests/int/media.int.spec.ts` -- update the header comment and creates; add one two-user test: A's private row (system create with A's `req`) is served to A and the admin, refused to B with 403 and no image, and `gateway.findByID` as B rejects -- the AC's access test (access spine rule).
- `tests/int/saveCopy.int.spec.ts` -- assert `media.visibility === 'shared'` on the downloaded cover -- the AC's downloaded-covers rule.
- other `tests/int/*` media creates -- add `visibility: 'shared'` where typecheck requires it.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `4-11-d28-media-visibility: done`.

**Acceptance Criteria:**
- Given the `media` collection, when the story is done, then it has `visibility` (`shared` | `private`) and `createdBy`, and read is `shared OR createdBy = me` for users and all rows for the admin.
- Given a save that downloads a source cover, when it commits, then the media row is `shared`; given rows that existed before the migration, when it runs, then they are `shared`.
- Given A's private cover, when B requests its file or row, then B is refused, while A and the admin load the file.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 19 findings — high 0, medium 6, low 8, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind) The private-Book merge test in `sharePrivateBook.int.spec.ts` creates its cover as `shared`, but AD-14 makes a private Book's cover private. Fixed: the fixture is now `visibility: 'private'` and is created with the user's `req`.
  - `[low]` `[patch]` (blind) The migration comment claims every pre-D28 row is a downloaded cover of a shared Book, but the admin could also have uploaded one in the back office. Fixed: the comment now says those rows were readable by every user, so marking them shared changes nobody's access. Not fixed: a per-Book backfill to `private`. No real data exists before the cataloguing gate, so the extra SQL would guard rows nobody has shown to exist.
  - `[medium]` `[patch]` (blind) The backfill criterion is not tested; grouped with the verification-gap and intent rows below. Fixed: a new int test runs `down`, inserts a row, runs `up`, asserts `shared` with no creator, and rolls back.
  - `[low]` `[reject]` (blind) `books.cover` does not check that the media row's visibility matches the Book's, so the admin can pair them wrongly in the back office. Only a back-office slip by the admin can cause it, and the fix is a new validator.
  - `[medium]` `[defer]` (blind) The promotion gap is written down only in Design Notes. Grouped with edge and intent rows; added to frontmatter `deferred` for Story 4.12.
  - `[false]` `[reject]` (blind) sprint-status says done before review. Finalize commits the yaml with the spec at `done` in the same commit, so the committed state is consistent.
  - `[low]` `[reject]` (blind) The file route sends no `Cache-Control: private`. There is no service worker and the app is tailnet-only. Another user never receives the random filename, because the row is unreadable to them. Adding the header would add a response hook.
  - `[false]` `[reject]` (blind) Admin read conflicts with PRD FR-47/FR-48. FR-48's private data list is copies, People, loans, wishlists, overrides and tags, not catalogue records. AD-4/AD-14 and the story's AC give the admin read of private catalogue rows, as for books, authors and series.
  - `[low]` `[reject]` (blind) Deleting a user leaves their private media with `createdBy` null. `books`, `authors` and `series` use the same `ON DELETE set null` pattern, and account deletion is Phase 2 (FR-6 to FR-9).
  - `[low]` `[reject]` (blind) The back-office upload form needs a visibility choice with no description. It is cosmetic, and the fix would add a per-collection override to the shared `visibilityFields()`.
  - `[low]` `[reject]` (blind) The private-file test checks four behaviours in one `it`. Only diagnostics suffer, and Story 4.1 rejected the same split.
  - `[medium]` `[defer]` (edge) Promoting a Book with a private cover leaves the shared Book with a private cover. Today no private media can exist, because no writer for it lands before 4.12. Same group as the blind promotion row.
  - `[low]` `[reject]` (edge) A pre-migration cover of a private Book becomes shared. Same root as the blind backfill-comment row: the comment is corrected and the SQL is not added. These rows were readable by everyone before, so no user's access changes.
  - `[medium]` `[patch]` (verification-gap) The backfill is never run against a populated table, and CI migrates an empty one. Because 4.5 runs in parallel, a migration regenerated after rebasing could drop the hand edit unnoticed. Same group and fix as the blind backfill-test row.
  - `[false]` `[reject]` (intent) AC3's test uses a bare private media row, not a cover attached to a private Book. File and row access depend only on the media row (`checkFileAccess` ANDs `access.read` with the filename), and no private-cover writer exists before 4.12.
  - `[medium]` `[patch]` (intent) The migration backfill has no automated check. Same group and fix as the blind backfill-test row.
  - `[medium]` `[defer]` (intent) The promotion gap has no owner outside the spec prose. Same group as the blind promotion row, now in `deferred`.
  - `[false]` `[reject]` (intent) Admin read of all media versus FR-48. Same refutation as the blind FR-48 row.
  - `[false]` `[reject]` (intent) Sprint-status says done while the spec says in-review. Same refutation as the blind sprint-status row.

## Design Notes

Promotion (`sharePrivateBook`) keeps the Book's existing cover. Today no private media row can exist, so nothing breaks; once Story 4.12 lets a creator upload a private cover, a promoted Book would point at a cover other users cannot read. Story 4.12 must decide that case (flip the row to shared, or replace it per AD-5's "its cover ... deleted when nothing references them").

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:reset && npm run test:int` -- expected: all pass, including `migrationSchema.int.spec.ts` and the new media test
- `npm run test:unit` -- expected: all pass

**Manual checks:**
- Migrate a scratch database to the previous migration, insert a media row, run the new migration: the row reads `visibility = 'shared'`, `created_by` null.

## Auto Run Result

Status: done

**Summary:** `media` now has the AD-4 `visibility` and `createdBy` fields and uses `catalogueAccess`. A user reads shared rows and the private rows they created, and the admin reads every row. Payload's file route ANDs `access.read` with the filename, so the same rule covers the files. `attachCover()` always writes downloaded covers as `shared`. A generated migration adds the columns. It is hand-edited only so that existing rows become `shared` with no creator, and the default is then dropped. The spine already stated this contract (AD-14), so it is unchanged.

**Files changed:**
- `src/collections/Media.ts`: `catalogueAccess` and `visibilityFields()`, with the doc comment updated.
- `src/lib/catalogue/covers.ts`: `attachCover()` writes `visibility: 'shared'`.
- `src/migrations/20261021_121736_media_visibility.{ts,json}`, `src/migrations/index.ts`: the generated migration, with the shared backfill added.
- `src/payload-types.ts`: regenerated.
- `tests/int/media.int.spec.ts`: a two-user test for private files and rows. Creates now carry `visibility`.
- `tests/int/mediaVisibilityMigration.int.spec.ts`: replays `down`, a row, then `up` in a rolled-back transaction and asserts the row is `shared` with no creator.
- `tests/int/saveCopy.int.spec.ts`: asserts the downloaded cover is `shared` with no creator.
- `tests/int/sharePrivateBook.int.spec.ts`: the private-Book merge cover is created private.
- `tests/int/effectiveBook.int.spec.ts`: its media create carries `visibility`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.11 is done.

**Review findings:** 19 in total.
- 3 patch entries:
  - The backfill test (medium). It covers the blind, verification-gap and intent rows on this.
  - The private merge fixture (low).
  - The migration comment (low).
- 1 deferred entry (medium): the promotion gap, owned by Story 4.12. It covers the blind, edge and intent rows on this.
- 6 rejected as `low`:
  - No per-Book backfill to `private`: no real data exists before the gate.
  - No cover/visibility validator: the mismatch needs an admin back-office slip.
  - No `Cache-Control` on the file route: there is no service worker and nobody else gets the random name.
  - User deletion leaves private media: same pattern as books, authors and series, and deletion is Phase 2.
  - No admin description on `visibility`: cosmetic.
  - The four-check `it`: same rejection as Story 4.1.
- 5 rejected as `false`:
  - Admin read against FR-48, raised twice: catalogue records are not in FR-48's private data list.
  - sprint-status set early, raised twice: it is committed with the spec at done.
  - A bare private row in AC3's test: access depends only on the media row.

**Follow-up review recommended:** false. One `medium` entry was patched (patched by verdict: high 0, medium 1, low 2).

**Verification:** run against the worktree Postgres on 5434.
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. Of the 40 warnings, 36 were there before and 4 are the new generated migration's unused arguments.
- `npm run test:unit`: 690 passed.
- `npm run test:reset && npm run test:int`: 44 files, 426 tests passed.
- Mutation checks:
  - Dropping `DEFAULT 'shared'` from the migration fails `mediaVisibilityMigration.int.spec.ts`.
  - Reverting media read to "any signed-in user" fails only the new private-file test.
- Every matrix row is covered by a test that ran.

**Residual risks:**
- Story 4.5 runs in a parallel worktree. Whichever schema story merges second must regenerate its migration (AD-13). If that is this one, the `DEFAULT 'shared'` / `DROP DEFAULT` hand edit must be put back. The migration test now fails if it is lost.
- A promoted private Book keeps a private cover. This is deferred to Story 4.12 and cannot happen before it.
