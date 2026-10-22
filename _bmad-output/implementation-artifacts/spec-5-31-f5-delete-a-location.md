---
title: '5.31 [F5] Delete a location'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: '41ab1a3da30315231c8b3a31f678d7f1aad4600a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred:
  - summary: >-
      Undo of a move (or another copy-location restore) fails with UNDO_FAILED when a location it would restore has been deleted since.
    evidence: |-
      restoreLocations writes each copy's recorded previous location id back; copies.location's ownedRelation validator counts the target as the user, finds 0 for a deleted location and rejects the write, which ends the transaction. AD-20 skips gone rows, not gone targets. Pre-existing in the restore code; the first in-product delete path arrives with 5.33 (deleting via the back office already reaches it).
    location: >-
      src/lib/copies/moveCopies.ts:79
    severity: low
---

<intent-contract>

## Intent

**Problem:** Settings (5.33) will offer Delete on a location, and there is no service for it. AD-18 makes a delete that affects other rows one function in the owning service, in one transaction: deleting a location clears it from the user's copies and from their profile default.

**Approach:** Add `deleteLocation(ctx, id)` to `lib/copies/locations.ts`: check the location is the viewer's, then in one transaction set `location: null` on each of the viewer's copies there, clear the profile's `defaultLocation` through `lib/account` when it points there, and delete the location.

## Boundaries & Constraints

**Always:**
- Signature `deleteLocation(ctx: Context, id: number): Promise<void>`, exported from `src/lib/copies/locations.ts` beside `resolveLocation` and `listLocations`.
- An id that is not a positive safe integer, or a location that is not the viewer's (gone, or another user's, the admin included), fails with `NOT_FOUND` before any write. The lookup filters on `owner` explicitly as well as through `ownerAccess` (FR-48), as `moveCopies` does.
- Everything runs inside `withTransaction` (joins the caller's, AD-16): the ownership check, the copy writes, the profile write and the delete.
- Copies: find the viewer's copies with `location` equal to the id (owner filter explicit), and write `location: null` on each through `gateway.updateByID`, one after the other (AD-16).
- Profile: read the default with `getProfile(tx)` and, when it equals the id, write it with `updateProfile(tx, { defaultLocation: null })`. The profile is read and written only through `lib/account` (AD-18).
- Then `gateway.deleteByID` on the location.

**Never:**
- No Undo, no `Undone<T>` (AD-18/epic: location delete has no Undo). No server action, UI or strings (5.33). No rename or merge (5.32).
- No reliance on the `ON DELETE set null` foreign keys to do the clearing; the service clears explicitly.
- No direct `users` write through the gateway, no Drizzle, no `overrideAccess`.
- No touching other users' copies or profiles.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Both references | A: location L is A's default; copies c1, c2 at L, c3 at M | L gone; c1, c2 location null; c3 still at M; A's default null | — |
| Not the default | A's default is M; c1 at L | L gone; c1 null; default still M | — |
| Not mine | B's location id (as A, and as an admin), or a deleted id, or `0` | nothing written; B's location and copies unchanged | `NOT_FOUND` |
| Rollback | the delete runs inside a caller's transaction that then throws | L, its copies' locations and the default are all back | — |

</intent-contract>

## Code Map

- `src/lib/copies/locations.ts` -- home of the new function; `resolveLocation`/`listLocations` show the module's doc-comment style.
- `src/lib/copies/moveCopies.ts` -- the pattern: id guard before the transaction, owner-filtered `gateway.find` on `copies` with `depth: 0`, `pagination: false`, sequential `updateByID` writes.
- `src/lib/copies/removeCopies.ts` -- a no-Undo `withTransaction` service returning `void`.
- `src/lib/account/profile.ts` -- `getProfile(ctx)` (default as an id) and `updateProfile(ctx, { defaultLocation: null })`; both accept a transaction context.
- `src/lib/payload/transaction.ts` -- `withTransaction`.
- `src/collections/Locations.ts`, `src/collections/Users.ts` -- `ownerAccess` binds the admin too; `defaultLocation` is self-only field access.
- `src/migrations/20261018_164917_locations.ts:22-23` -- both foreign keys are `ON DELETE set null` (read-only; not to be relied on).
- `tests/int/moveCopies.int.spec.ts` -- seeding helpers (`locationFor`, `copyFor` via `payload.create` with the user's `req`), `failure()`; `tests/int/transaction.int.spec.ts` for an outer-transaction rollback shape.
- `tests/helpers/harness.ts` -- `createUser`, `contextFor`.
- Spine AD-18 already states the rule ("deleting a location clears it from copies and from the profile default"); the spine has no `lib/copies` shared shapes and the function adds no shared type, so the spine is unchanged.

## Tasks & Acceptance

**Execution:**
- `src/lib/copies/locations.ts` -- add `deleteLocation()` per Always, with a doc comment naming AD-18 and FR-31.
- `tests/int/deleteLocation.int.spec.ts` -- new; one case per matrix row: Both references (copies cleared, other copy untouched, default cleared, location gone); Not the default (default kept); Not mine (B's id as A and as an admin, a gone id: `NOT_FOUND`, B's rows unchanged); Rollback (run inside an outer `withTransaction` that throws after the delete; everything is back).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.31 to `done` when finished.

**Acceptance Criteria:**
- Given `deleteLocation(ctx, id)` in `lib/copies`, when it runs, then in one transaction it clears the location from my copies and from my default location, then deletes it, and an integration test covers both references.
- Given a location that is not mine, when `deleteLocation` runs, then it fails with `NOT_FOUND` and nothing is written.

## Spec Change Log

- 2026-10-22, implementation: the Code Map's "spine is unchanged" did not hold. The spine's Design Paradigm said `copies` imports no other service, and `eslint.config.mjs` enforced it, which blocks the `lib/account` calls that Always requires (AD-18). Resolved by allowing the one-way edge `copies → account` (`account` still imports no service, so there is no cycle) in `serviceImports` and in the spine's Design Paradigm bullet, in this commit.

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 14 findings — high 0, medium 0, low 8, false 6, maybe-false 0
- findings:
  - `[low]` `[defer]` Blind: Undo of a move fails once its previous location is deleted — real (`ownedRelation` rejects the deleted id, the restore fails `UNDO_FAILED`), but the defect is in `moveCopies`'s existing restore, not this diff; deferred to frontmatter.
  - `[low]` `[reject]` Blind: `ctx.user.defaultLocation` stays stale in the same request after the delete — no caller composes a default-location fallback after `deleteLocation`; Settings reads the profile from the database; moving `locationFor` onto `getProfile` changes a module outside the story.
  - `[low]` `[patch]` Blind: the doc comment claimed the FKs are never relied on, though a reference committed concurrently is still cleared only by them — reworded the comment to say the explicit clearing covers what was read and the FKs catch a concurrent reference.
  - `[false]` `[reject]` Blind: 5.31 marked `done` in sprint-status before the spec — finalization sets the spec `done` in the same commit.
  - `[low]` `[reject]` Blind: the copies `find` selects `location` though only `id` is read — harmless; dropping `select` would fetch every field, and `id` alone is not a typed select key.
  - `[low]` `[reject]` Blind: the `copies → account` edge is module-wide, wider than its stated reason — every edge in the list is module-wide and the bullet already names the reason; no caller is named that would diverge.
  - `[false]` `[reject]` Blind: the spec's Code Map says the spine is unchanged and no criterion names the spine update — the Spec Change Log records the change and the spine is updated in this commit; the fix would be a spec edit.
  - `[low]` `[reject]` Edge: a copy whose Book the viewer can no longer read fails the clear with a `ValidationError` (refilled `book` re-validated) — needs an admin to make a held Book unreadable, rare; `moveCopies` shares the behaviour; a guard adds a branch.
  - `[low]` `[reject]` Edge: a concurrent delete of the same location between the count and `deleteByID` surfaces a raw `NotFound` — one user racing themself across tabs; mapping it adds a catch for a case no one meets.
  - `[low]` `[reject]` Edge: thousands of copies at one location mean thousands of sequential updates in one transaction — location delete is rare and has no Undo; a bulk update needs new gateway surface; noted as a residual risk.
  - `[false]` `[reject]` Intent: no Settings UI or action reaches `deleteLocation` — epics assign the UI to 5.33 ("5.31–5.32 services precede the 5.33 Settings UI").
  - `[low]` `[reject]` Intent: deleting a location in the back office bypasses `deleteLocation` — the `ON DELETE set null` keys give the same end state there; the back office is accepted as is.
  - `[false]` `[reject]` Intent: spine rules conflict (gateway for referencing rows vs profile only through `lib/account`) — `updateProfile` writes through the gateway, so the diff satisfies both.
  - `[false]` `[reject]` Intent: sprint-status `done` while the spec is `in-review` — same as the Blind status row; both are `done` in the commit.
  - Verification gap: no findings.

## Verification

**Commands:**
- `npm run test:int -- tests/int/deleteLocation.int.spec.ts` -- expected: passes
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

## Auto Run Result

**Summary:** `deleteLocation(ctx, id)` in `lib/copies` deletes one of the viewer's locations (AD-18, FR-31). In one transaction it checks that the location is the viewer's, clears it from the viewer's copies there, clears the profile default through `lib/account` when it points there, then deletes the row. A location that is not the viewer's (the admin included) or a bad id fails `NOT_FOUND` before any write. No Undo.

**Files changed:**
- `src/lib/copies/locations.ts`: `deleteLocation()`.
- `tests/int/deleteLocation.int.spec.ts` (new): one case per matrix row (both references, default elsewhere, not mine, rollback).
- `eslint.config.mjs`: `copies` may import `account`.
- `ARCHITECTURE-SPINE.md`: Design Paradigm import bullet allows `copies → account` (profile default upkeep on location delete and merge, AD-18).
- `sprint-status.yaml`: 5.31 done.

**Review findings:** one pass, 14 rows in the Review Triage Log.
- **Patched:** low 1 (doc comment's FK wording).
- **Deferred:** low 1 (move Undo fails after its previous location is deleted; restore code in `moveCopies`).
- **Rejected:** stale `ctx.user` default in the same request, unused `location` select, module-wide import edge, unreadable-Book revalidation, self-race raw `NotFound`, per-copy updates on huge locations, back-office delete bypass (all `low`); early `done` status (twice), spec/spine wording, missing UI, spine rule conflict (`false`).

**Follow-up review recommendation:** false. Patched high 0, medium 0, low 1.

**Verification:**
- `npm run test:int -- tests/int/deleteLocation.int.spec.ts`: 4 passed, on the worktree's own Postgres (port 5433), before and after the patch.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors (40 existing warnings in migrations).
- Prettier check on the changed source and test: clean.
- Matrix audit: all four rows covered by passing cases.

**Residual risks:**
- No caller yet; the Settings action and dialog arrive with 5.33.
- The spine change (`copies → account`) was made during implementation, not planned; 5.32's merge needs the same edge.
- Deleting a location holding thousands of copies runs one update per copy in a single transaction.
- Undo of an earlier move to/from a deleted location fails (deferred).
