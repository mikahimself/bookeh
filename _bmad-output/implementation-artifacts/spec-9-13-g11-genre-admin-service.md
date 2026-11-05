---
title: '[G11] Genre admin service'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_revision: '526e166'
review_loop_iteration: 0
followup_review_recommended: false
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The shared genre list can only be fixed in the back office; Settings (9.14) needs a service to rename, translate, add, merge and delete system genres and to count their Books.

**Approach:** `src/lib/catalogue/genres.ts`: `addGenre`, `renameGenre`, `setGenreNameFi`, `mergeGenre`, `deleteGenre`, `genreUse`, all gated by `canEditShared` (`NOT_FOUND` otherwise), written with `system()` privileges inside `withTransaction`.

## Boundaries & Constraints

**Always:** Merge and delete update every Book (shared or private, both are catalogue records) before deleting the genre, in one transaction. A name may not equal another genre's English or Finnish name (`NAME_TAKEN` + `conflictId`; own case-only rename allowed). No `user-books`, copy or tag is read or written (D-6).

**Never:** UI, Undo, schema change, Re-map action wiring (9.14).

</intent-contract>

## Code Map

- `src/lib/catalogue/genres.ts` -- the service; shape follows `lib/people/people.ts`, writes like `remapGenres.ts`.
- `tests/int/genreAdmin.int.spec.ts` -- non-admin gate, name conflicts, merge (dedupe, order, private Book), delete, rollback, counts.

## Tasks & Acceptance

- [x] `src/lib/catalogue/genres.ts` -- implement the six functions.
- [x] `tests/int/genreAdmin.int.spec.ts` -- cover the acceptance criteria.

**Acceptance Criteria:**
- Given an admin, when they rename, set the Finnish name, add, merge or delete a genre, then it succeeds; merge moves every `books.genres` reference to the target (once) and deletes the source in one transaction; delete removes the genre from Books first.
- Given a non-admin, when any call runs, then it fails with `NOT_FOUND`.
- Given `genreUse(ctx)`, then each genre has its Book count, zero included.

## Spec Change Log

## Review Triage Log

No separate review pass was run in this session (user-driven run, no reviewer subagents launched).

## Verification

- `npm run test:int -- tests/int/genreAdmin.int.spec.ts tests/int/mapSubjectsToGenres.int.spec.ts` -- 13 pass (2026-11-05).
- `npm run typecheck`, scoped `eslint`, `git diff --check` -- clean.

## Auto Run Result

Status: done. No screen changed, so no browser walk. Counts include private Books, since they hold system genres too; `genreUse` is admin-only like the rest. Merge does not copy the source's Finnish name to the target.
