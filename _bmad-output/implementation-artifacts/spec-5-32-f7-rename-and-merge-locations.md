---
title: '5.32 [F7] Rename and merge locations'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: '2427c95c6860d699426e9c1f92a5f34977218b7e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Settings (5.33) will offer Rename and Merge on a location, and no service exists. AD-18: a rename onto an existing `nameKey` fails `NAME_TAKEN` with that row's id as `conflictId`; a merge repoints every reference and deletes the source, in one transaction.

**Approach:** Add `renameLocation(ctx, id, name)` and `mergeLocation(ctx, sourceId, targetId)` to `lib/copies/locations.ts` beside 5.31's `deleteLocation`, sharing its ownership check and repointing via private helpers. Add the `NAME_TAKEN` error code.

## Boundaries & Constraints

**Always:**
- Signatures `renameLocation(ctx: Context, id: number, name: string): Promise<void>` and `mergeLocation(ctx: Context, sourceId: number, targetId: number): Promise<void>`, exported from `src/lib/copies/locations.ts`.
- Each runs inside `withTransaction` (AD-16). Any id that is not a positive safe integer or not the viewer's location (admin included) fails `NOT_FOUND` before any write, checked by `count` with an explicit `owner` filter, as `deleteLocation` does.
- Rename: `normaliseName` the name; blank fails `VALIDATION` with `fields: { name: 'VALIDATION' }`. Another of the viewer's locations with the same `toNameKey(name)` fails `NAME_TAKEN` with its id as `conflictId`, nothing written; the location's own key (case-only change) is no conflict. Then `updateByID` with `{ name }`; the hook recomputes `nameKey`.
- Merge: `sourceId === targetId` fails `VALIDATION` before any write. The viewer's copies at the source and the profile default (through `lib/account`) move to the target, then the source is deleted.
- `deleteLocation` keeps its behaviour; it and `mergeLocation` share one helper repointing the viewer's copies and default to a location or `null` (sequential `updateByID`).
- `NAME_TAKEN` messages: en "That name is already in use.", fi "Nimi on jo käytössä."

**Never:**
- No Undo, no `Undone<T>`. No server action, UI or other strings (5.33).
- No Drizzle, no `overrideAccess`, no direct `users` write, no touching other users' rows.
- No reliance on `ON DELETE set null` for the merge's repointing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rename | A's "Olohuone" → "  Työ   huone " | name "Työ huone", nameKey "työ huone" | — |
| Case only | "mokki" → "Mokki" | renamed | — |
| Name taken | A has "Mökki" (id M); rename L → "MÖKKI" | L unchanged | `NAME_TAKEN`, `conflictId` M |
| Merge | default S; c1, c2 at S; c3 at T; c4 at U | c1, c2 at T; c3 T; c4 U; default T; S gone | — |
| Merge rollback | merge inside a caller's transaction that then throws | copies, default and S all back | — |
| Not mine | B's id (as A and as admin), a gone id, `0`, as either merge id or the rename id | nothing written | `NOT_FOUND` |
| Into itself | `mergeLocation(ctx, S, S)` | S and its copies unchanged | `VALIDATION` |

</intent-contract>

## Code Map

- `src/lib/copies/locations.ts` -- `deleteLocation` holds the check and clearing to factor out; `resolveLocation` shows `normaliseName`/`toNameKey` and the `VALIDATION` shape.
- `src/lib/errors.ts` -- `ErrorCode`, `DomainError(code, { conflictId })`; `mapError` already passes `conflictId` on.
- `src/app/(frontend)/components/toast/flashCookie.ts:16`, `tests/unit/messages.unit.spec.ts` -- exhaustive code lists; `messages/{en,fi}.json` `errors` block.
- `src/collections/Locations.ts` -- unique `(owner, nameKey)` index; a lost rename race surfaces as its `ValidationError`, unchanged.
- Only `copies.location` and `users.defaultLocation` reference a location.
- `tests/int/deleteLocation.int.spec.ts` -- seeding helpers and rollback case to mirror.
- Spine AD-18 states both rules and `ActionResult` has `conflictId`; spine unchanged.

## Tasks & Acceptance

**Execution:**
- `src/lib/errors.ts`, `flashCookie.ts`, `messages.unit.spec.ts`, `messages/{en,fi}.json` -- add `NAME_TAKEN`.
- `src/lib/copies/locations.ts` -- helpers, `renameLocation`, `mergeLocation` per Always; doc comments name AD-18, FR-31.
- `tests/int/renameMergeLocation.int.spec.ts` -- new; one case per matrix row (rename and case-only may share one case).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.32 to `done` when finished.

**Acceptance Criteria:**
- Given `renameLocation` in `lib/copies`, when a rename hits another of my locations' `nameKey`, then it fails with `NAME_TAKEN` and that location's id as `conflictId`, and a case-only rename of itself succeeds.
- Given `mergeLocation` in `lib/copies`, when it runs, then in one transaction my copies and my default location move to the target and the source is deleted.
- Given the 5.31 suite, when it runs after the refactor, then it still passes.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 14 findings — high 0, medium 0, low 8, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: a lost rename race surfaces the unique index's `ValidationError` with path `owner_id, name_key`, which no form can place — one user racing themself across tabs; mapping it adds a catch branch, and the spec keeps it unchanged as `resolveLocation` does.
  - `[false]` `[reject]` Blind: `NAME_TAKEN` carries no `fields` entry, so 5.33 cannot show it under the field — a taken rename offers a merge (EXPERIENCE.md, Settings → Rename), which needs the code and `conflictId`, both present; no caller is left without what it needs.
  - `[low]` `[reject]` Blind: a name over 200 characters fails `VALIDATION` from `maxLength` inside `updateByID`, not `TOO_LONG` up front — it still fails on `name` with nothing written; a 200-character location name is not met in use; an extra guard adds a branch, and `resolveLocation` behaves the same.
  - `[low]` `[reject]` Blind: `ctx.user.defaultLocation` is stale in the same request after a merge — no caller composes a default-location fallback after `mergeLocation`; same finding rejected in 5.31.
  - `[low]` `[reject]` Blind: `mergeLocation(ctx, X, X)` with a foreign X fails `VALIDATION`, not `NOT_FOUND` — reveals nothing about X and needs a crafted call; reordering also needs the helper to dedupe ids.
  - `[false]` `[reject]` Blind: `assertOwnLocations` gives a false `NOT_FOUND` on repeated ids — its doc comment states the distinct-ids precondition and both callers meet it (merge rejects equal ids first).
  - `[low]` `[patch]` Blind: `repointLocation`'s doc comment read as pointing copies at `from` — reworded to "Moves … at `from` … to `to`".
  - `[false]` `[reject]` Blind: 5.32 is `done` in sprint-status before the spec, and the spec is not in the diff — finalization sets the spec `done` in the same commit; the spec goes to the edge-case layer as the claims file by design.
  - `[low]` `[reject]` Edge: a copy moved to the source or a default set to it after the merge's read is set null by the FK, not moved — the same user racing themself; a fix needs row locks the gateway does not offer.
  - `[low]` `[reject]` Edge: a target deleted concurrently after the ownership check fails `VALIDATION` on `location`, not `NOT_FOUND` — same self-race; nothing is written either way.
  - `[false]` `[reject]` Intent: no server action or screen lets a user rename or merge — epics assign the UI and action to 5.33 ("5.31–5.32 services precede the 5.33 Settings UI").
  - `[low]` `[reject]` Intent: "every reference" read literally — only the viewer's rows move; a reference written around `ownedRelation` (back office) would be set null by the FK — the back office is accepted as is (as in 5.31), and `ownedRelation` keeps other users' rows off the viewer's location.
  - `[false]` `[reject]` Intent: no test fails the merge part-way — a test-only ask naming no criterion; the rollback case and `transaction.int.spec.ts` cover the one-transaction rule.
  - `[false]` `[reject]` Intent: the tests never show "Mökki" and "mokki" becoming one — test-only ask; the merge case is that mechanism with other names.
  - Verification gap: no findings.

## Verification

**Commands:**
- `npm run test:int -- tests/int/renameMergeLocation.int.spec.ts tests/int/deleteLocation.int.spec.ts` -- expected: passes
- `npm run test:unit -- tests/unit/messages.unit.spec.ts` -- expected: passes
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

## Auto Run Result

**Summary:** `renameLocation(ctx, id, name)` and `mergeLocation(ctx, sourceId, targetId)` in `lib/copies` (AD-18, FR-31). Rename normalises the name and fails `NAME_TAKEN` with the other location's id as `conflictId` when another of the viewer's locations has the same `nameKey`; a case-only rename of itself succeeds. Merge moves the viewer's copies and profile default from the source to the target, then deletes the source, in one transaction; merging into itself fails `VALIDATION`. Ids that are not the viewer's (the admin included) fail `NOT_FOUND` before any write. `deleteLocation` now shares the ownership check and repointing helpers. New error code `NAME_TAKEN`. No Undo.

**Files changed:**
- `src/lib/copies/locations.ts`: helpers `isId`, `assertOwnLocations`, `repointLocation`; `deleteLocation` on them; `renameLocation`, `mergeLocation`.
- `src/lib/errors.ts`, `src/app/(frontend)/components/toast/flashCookie.ts`, `tests/unit/messages.unit.spec.ts`: `NAME_TAKEN` code.
- `messages/en.json`, `messages/fi.json`: `errors.NAME_TAKEN`.
- `tests/int/renameMergeLocation.int.spec.ts` (new): one case per matrix row (rename and case-only share one).
- `sprint-status.yaml`: 5.32 done.

**Review findings:** one pass, 14 rows in the Review Triage Log.
- **Patched:** low 1 (`repointLocation` doc comment wording).
- **Deferred:** none.
- **Rejected:** rename race field path, over-long name maps to `VALIDATION`, stale `ctx.user` default, foreign self-merge code, two concurrent self-races in merge, back-office references set null (all `low`); `NAME_TAKEN` without `fields`, non-distinct ids in the helper, early `done` status, missing UI, two test-only asks (`false`).

**Follow-up review recommendation:** false. Patched high 0, medium 0, low 1.

**Verification:**
- `npm run test:int -- tests/int/renameMergeLocation.int.spec.ts tests/int/deleteLocation.int.spec.ts`: 10 passed, on the worktree's own Postgres (port 5433), before and after the patch.
- `npm run test:unit -- tests/unit/messages.unit.spec.ts`: 30 passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors (40 existing warnings in migrations).
- Prettier check on changed source, test and messages: clean.
- Matrix audit: all seven rows covered by passing cases.

**Residual risks:**
- No caller yet; the Settings action and UI arrive with 5.33.
- A merge or delete over a location with thousands of copies runs one update per copy in one transaction.
- Concurrent writes by the same user during a merge can leave a copy with no location (FK `set null`) instead of the target.
