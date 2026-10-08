---
title: 'Story 1.5 [A5] Remove the old collections and GraphQL'
type: 'chore'
created: '2026-10-08'
status: 'done'
route: 'dispatch'
review_loop_iteration: 0
context: []
baseline_commit: 'bd46654958f82092a883365ed137a9cfec2a666c'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The single-copy collections from `7d34440` (`books`, `authors`, `series`, `tags`, `loans`) are still registered, so every schema story would have to migrate away from a model the spine replaces (AD-13), and GraphQL is still served under `/api/graphql` although the frontend never uses it (AD-10).

**Approach:** Delete the five collection files and their registration, keep `users` and `media`, set `graphQL.disable: true` in the Payload config and delete the `graphql` and `graphql-playground` route folders so both paths fall to the REST catch-all and answer 404. Regenerate `payload-types.ts` and the import map. Commit no migration: dev push drops the old tables, and migration history starts with Story 1.8.

**Decisions (2026-10-08):** Lexical goes too: `editor` is optional in Payload 3, no `richText` field remains, and none is planned in the PRD, spine or epics; `@payloadcms/richtext-lexical` is removed from `package.json` (closes the Story 1.1 deferral). The `graphql` package stays: it is a peer dependency of `payload` and `@payloadcms/next`. `tests/int/api.int.spec.ts` (the template test Story 1.4 left for this story) is deleted; `harness.int.spec.ts` already covers a users query.

## Boundaries & Constraints

**Always:** `users` and `media` keep their current shape. The REST catch-all `api/[...slug]/route.ts`, the admin routes, `custom.scss` and `(payload)/layout.tsx` stay. Regenerated files (`src/payload-types.ts`, `importMap.js`) are committed with the change.

**Never:** No `src/migrations`. No new fields, access rules or lint rules (Stories 1.6 to 1.8). No reworked collections yet. No change to `tests/helpers/*`, the e2e admin test, Compose or CI beyond what the new test needs. Do not remove `@testing-library/react` or the `react()` Vitest plugin (separate deferral).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| GraphQL gone | `POST /api/graphql` with `{"query":"{ __typename }"}` | 404, JSON `message: Route not found "/api/graphql"` | N/A |
| Playground gone | `GET /api/graphql-playground` | 404 | N/A |
| REST intact | `GET /api/media` without a session | 200 (`media` has `read: () => true`; `users` keeps Payload's signed-in default) | N/A |
| Dev push | `bookeh` or `bookeh_test` still has the old tables (all empty, verified 2026-10-08) | Next `npm run dev` or `test:int` drops them with no prompt | Drizzle prompts only for tables with rows |

</frozen-after-approval>

## Code Map

- `src/payload.config.ts` -- imports and registers `Books, Authors, Series, Tags, Loans` and sets `editor: lexicalEditor()`. Keep `collections: [Media, Users]`, drop the `lexicalEditor` import and `editor`, add `graphQL: { disable: true }`.
- `src/collections/{Books,Authors,Series,Tags,Loans}.ts` -- delete. `Media.ts`, `Users.ts` untouched; nothing else imports the five.
- `src/app/(payload)/api/graphql/route.ts`, `src/app/(payload)/api/graphql-playground/route.ts` -- delete both folders. Afterwards both paths reach `api/[...slug]/route.ts` → `handleEndpoints`, whose `notFoundResponse` answers 404 (`payload/dist/utilities/handleEndpoints.js:8-17`). `createPayloadRequest.js:21` skips GraphQL detection when `graphQL.disable` is set.
- `src/payload-types.ts` -- generated; run `npm run generate:types` (needs `.env`). Old collection interfaces and `payload_locked_documents_rels` columns disappear.
- `src/app/(payload)/admin/importMap.js` -- run `npm run generate:importmap`; expected unchanged (only `CollectionCards`).
- `package.json`, `package-lock.json` -- `npm uninstall @payloadcms/richtext-lexical` (removes `lexical`/`@lexical/*`). Keep `graphql`. `@payloadcms/next`, `ui` and `db-postgres` list no lexical dependency.
- `tests/int/api.int.spec.ts` -- delete.
- `tests/e2e/frontend.e2e.spec.ts` -- the e2e pattern. New `tests/e2e/graphql.e2e.spec.ts` uses Playwright's `request` fixture against `http://localhost:3000` (no `baseURL` is set); CI runs `test:e2e` after `test:int`.

## Tasks & Acceptance

**Execution:**
- [x] `src/collections/Books.ts`, `Authors.ts`, `Series.ts`, `Tags.ts`, `Loans.ts` -- delete -- the single-copy model is replaced, not migrated.
- [x] `src/payload.config.ts` -- register only `Media` and `Users`; remove Lexical; `graphQL: { disable: true }` -- AD-10, AD-13.
- [x] `src/app/(payload)/api/graphql/`, `src/app/(payload)/api/graphql-playground/` -- delete -- the paths fall to the REST catch-all.
- [x] `package.json`, `package-lock.json` -- `npm uninstall @payloadcms/richtext-lexical` -- no editor, no rich text.
- [x] `src/payload-types.ts`, `src/app/(payload)/admin/importMap.js` -- regenerate and commit.
- [x] `tests/int/api.int.spec.ts` -- delete -- subsumed by `harness.int.spec.ts`.
- [x] `tests/e2e/graphql.e2e.spec.ts` -- `POST /api/graphql` and `GET /api/graphql-playground` both 404, `GET /api/media` 200 -- proves the AC and that REST survived.

**Acceptance Criteria:**
- Given the Payload config, when the app starts, then the admin lists only Users and Media, `payload-types.ts` has no `Book`, `Author`, `Series`, `Tag` or `Loan` interface, and `src/migrations` does not exist.
- Given the dev server, when `npm run test:e2e` runs, then the GraphQL spec passes and the existing admin and frontend specs still pass.
- Given a dev database with the old empty tables, when `npm run test:int` runs, then push drops them without prompting and the harness and collation specs pass.

## Implementation Notes

- `npm uninstall @payloadcms/richtext-lexical` removed 97 lockfile entries (Lexical and its mdast/micromark tree); no other version changed, and the common keys keep their order (verified against `HEAD`). The large text diff is the diff algorithm aligning unrelated entries around the 97 deletions, not a regeneration.
- Review follow-ups: the e2e spec covers GET and POST on both GraphQL paths (JSON 404 with `message` matching /not found/i) and probes REST with `GET /api/users/me` instead of `/api/media`; `tests/int/config.int.spec.ts` pins `payload.config.graphQL.disable === true` so the flag cannot be reverted unnoticed once the route folders are gone.
- `generate:importmap` reported no new imports; `importMap.js` is unchanged, as expected.
- Dev push against a `bookeh_test` that still had the old tables: drizzle-kit emits `DROP TABLE "books"` (which cascades the FK on `payload_locked_documents_rels`) before `ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_books_fk"`, so the first `getPayload()` fails with Postgres 42704 after the tables are already gone. The next `getPayload()` (same run or next run) sees a clean diff and passes. No prompt is shown. Upstream drizzle-kit ordering; the owner's `bookeh_test` has been pushed clean, and `bookeh` already had no old tables.

- Orchestrator verification (2026-10-08): re-ran `lint` (0 errors, 3 pre-existing e2e warnings), `typecheck`, `test:unit` (5), `test:int` (4) and `test:e2e` (7, own dev server) on the diff: all green. Lockfile package-set check: 97 removed, 0 added, 0 changed. Both `bookeh` and `bookeh_test` now hold only `media`, `users`, `users_sessions` and `payload_*`.
- Matrix audit: rows 1-3 are covered by `tests/e2e/graphql.e2e.spec.ts`, run and passed. Row 4 (dev push on old empty tables) has no automated test: seeding stale tables before the first `getPayload()` needs raw SQL outside the harness, which the boundaries forbid. It was reproduced by hand in a worktree: the tables are dropped with no prompt, but drizzle-kit orders `DROP TABLE` before dropping the dependent FK constraint, so the first push errors (42704) once and the next push is clean. AC 3 therefore holds from the second run. Only databases that still hold the old tables are affected, and both local ones have already been pushed clean; CI starts empty.

## Spec Change Log

## Review Triage Log

- 404 assertions pin Payload's exact error text and never check the body is JSON; a Next HTML 404 would pass the status checks without proving the REST catch-all answered (blind, edge-case x2) -- low, real: `handleEndpoints.js:8-17` is the only JSON 404 producer, and the wording is Payload-internal. Route: patch (assert JSON `content-type` and `message` matching `/not found/i` on both paths).
- `GET /api/graphql` and `POST /api/graphql-playground` untested; before the change they answered 405 from the half-exported route files, so the three cases prove the handlers are gone, not the folders (blind) -- low, real. Route: patch (two more cases).
- REST-intact probe `GET /api/media` relies on `Media.read: () => true`, which the spine lists as a scaffold gap to close; the test would then fail for the wrong reason (blind) -- low, real: `ARCHITECTURE-SPINE.md` scaffold-gaps line names it. `GET /api/users/me` answers 200 with `user: null` when signed out (`auth/endpoints/me.js:32-40`). Route: patch (switch the probe).
- `graphQL.disable` is pinned by no test; with the route folders gone, the flag only changes `createPayloadRequest.js:21`, so reverting it keeps every test green (blind, AC 1 part) -- low, real. Route: patch (one int assertion on `payload.config.graphQL.disable`).
- AC 1's "only Users and Media" has no test (blind) -- low, rejected: an exact collection list goes stale with Epic 3's first collection story and the regenerated types plus the admin e2e already show the removal.
- AC 3 and the Dev push matrix row claim a clean first push on a stale database, while the notes record one 42704 failure before the second clean push (verification-gap other, blind) -- medium, real, but the fix edits the frozen block: rejected here and surfaced to the human at the checkpoint, who alone can amend it.
- No README or commit-body line tells a developer with a stale `bookeh`/`bookeh_test` to run once more after 42704 (blind) -- low, rejected: both local databases are already pushed clean, CI starts empty, and the README's volume-recreation command covers any other old volume.
- Old tables with rows make push prompt and the non-TTY worker exit (edge-case) -- false for this repository: every old table held 0 rows in both databases (counted 2026-10-08), and the general data-loss prompt is already a Story 1.4 deferral.
- Implementation note says npm re-sorted the lockfile (blind) -- low, real: all common keys are in identical order. Corrected in the note.
- `sprint-status.yaml` says `in-progress` while the spec says `in-review` (blind) -- false: the sync step sets the sprint file at implement and close-out by design, and the two vocabularies are the workflow's.
- 1.4 close-out (`review` -> `done`) bundled into this story's tree (blind) -- low, real: earlier stories closed out in their own commit. Route: patch at commit time (separate `chore` commit first).
- Fourth copy of `http://localhost:3000`; enable `baseURL` instead (blind) -- low, rejected: the fix touches `playwright.config.ts` and the other specs, which the intent leaves alone; the new spec follows the existing pattern.
- `Media.admin.group: 'Catalogue'` is a group of one (blind) -- low, rejected: admin chrome, `media` keeps its shape by intent, and Epic 3's collections re-populate the group.
- Deleting `Books.ts` loses the documented Payload rule that field `validate` never runs when `admin.condition` is false, which the copies and entries of AD-6/AD-8 will meet again (blind) -- medium, real: the rule lives only in the deleted hook comment. Route: defer (agent-context file).
- "Their tests" in `STORY-SLICING.md` versus only the template test deleted (blind) -- low, rejected: no test ever imported the five collections; the spec's Intent names the one deletion.

## Verification

**Commands:**
- `npm run lint` and `npm run typecheck` -- expected: exit 0.
- `npm run test:unit && npm run test:int` -- expected: green; `bookeh_test` no longer has `books`, `authors`, `series`, `tags`, `loans` tables.
- `npm run test:e2e` -- expected: green, including the new GraphQL spec.
- `grep -rn "richtext-lexical\|lexical" package.json src` -- expected: no matches.
