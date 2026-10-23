---
title: '5.25 [H13] Received'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: 'e78e05b2410b487b79b696dfafc144c02ea58990'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** An ordered copy's line in Book detail says "Ordered" and nothing more, so Mika cannot mark it arrived (FR-28). The spine names "receive" as a `lib/copies` function, and it does not exist yet. `setStatus` has no Undo, and EXPERIENCE.md gives Received one: "Saved to {location} · Undo", which sets the copy back to ordered.

**Approach:** A new undoable `receiveCopy` in `lib/copies` turns one of the viewer's ordered copies into an owned copy at the default location. `receiveCopyAction` wraps it in `withUndo`. Each ordered line in Book detail gets a Received Link that calls the action, shows the toast with Undo, reports through `afterAction` and refreshes the detail.

## Boundaries & Constraints

**Always:**
- `receiveCopy(ctx, copyId): Promise<Undone<{ savedTo: Named | null }>>` in `src/lib/copies/receiveCopy.ts`, inside `withTransaction` (joins the caller's).
  - The find filters on `owner` explicitly as well as through access (FR-48). A copy that is gone or not the viewer's (the admin included) fails with `NOT_FOUND` before any write. A copy that is not `ordered` fails with `VALIDATION` on `status`, with no write.
  - Write `{ status: 'owned', location }`, where `location = await locationFor(tx, { status: 'owned' })` is the default or `null`.
  - `savedTo` is the landed location's `{ id, name }` (read back as `saveOwnedCopy` does), or `null`.
  - The restore checks with `count` first and skips a gone copy. Otherwise it writes `{ status: 'ordered', location: null }` through the gateway as the restoring user.
- `receiveCopyAction(input: unknown)` in `(sections)/actions.ts`: `copyInput(input)` (`VALIDATION` otherwise), `requireUserOrThrow()` inside `runAction()`, then `withUndo(ctx, (tx) => receiveCopy(tx, copyId))`.
- `ReceiveCopy({ copyId })` in `CopyLine.tsx`: an `ActionLink` labelled `detail.received`, disabled while in flight, on the ordered line in the slot owned lines use for Remove.
  - On `ok` it shows `{ kind: 'success', message, undo: { token, seconds } }`. The message is `toast.savedTo` with `savedTo.name`, or `toast.saved` when `savedTo` is `null`.
  - Every result goes to `afterAction`.
  - On `ok` or `NOT_FOUND`, focus moves to the Your copies section and then `router.refresh()` runs (the Link unmounts with the refresh).
- Strings in English and Finnish: `detail.received` "Received" / "Saapunut". Tokens only; 44px taps (existing `ActionLink`).

**Never:**
- No change to `setStatus`, `createCopy`, `editBook` or the collection schema. No Received on the Answer (8.2) and no bulk Received in select mode.
- No new `onUndone` listener: `ReadAndRating` (mounted in the same `BookDetail`) already refreshes the route after any toast Undo, and `ShelfRows` reloads the rows.
- No spine edit: receive is already listed under `lib/copies` (AD-18), and no contract changes.
- No markup or CSS tests. No action int test (`removeCopiesAction` has one, but the service test covers Undo here).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Received, default set | ordered copy 31, default "Olohuone" | owned at Olohuone, `savedTo` names it; Book detail toasts "Saved to Olohuone · Undo" and refreshes | No error expected |
| Received, no default | ordered copy, no `defaultLocation` | owned, `location: null`, `savedTo: null` (the toast says "Saved") | No error expected |
| Undo | the token from a Received | copy back to `ordered`, `location: null` | No error expected |
| Not the viewer's | another user's copy id | `NOT_FOUND` | nothing written; the copy stays ordered |
| Already owned | an owned copy id | `VALIDATION` | nothing written; the copy stays where it is |

</intent-contract>

## Code Map

- `src/lib/copies/moveCopies.ts` -- the undoable `lib/copies` pattern: the explicit `owner` filter, `NOT_FOUND`, and a restore that does `count` before `updateByID`.
- `src/lib/copies/locations.ts:57` -- `locationFor(ctx, { status: 'owned' })` → the default location id or `null`.
- `src/lib/catalogue/saveCopy.ts:186-198` -- reads the landed location's name back (`findByID`, `depth: 1`, `select: { location: true }`, `populate: { locations: { name: true } }`).
- `src/lib/books/effectiveBook.ts:12` -- `Named`.
- `src/app/(frontend)/(sections)/actions.ts` -- `copyInput`, and `setReadAction` as the `withUndo` action pattern.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- `RemoveCopy`: the in-flight `useTransition`, `settleAction`, `afterAction`, focus on `closest('section')`, then `router.refresh()`.
- `src/app/(frontend)/(sections)/ReadAndRating.tsx:62-69` -- `show({ kind: 'success', message, undo })`.
- `src/app/(frontend)/scan/useAddToLibrary.ts:77-80` -- the `savedTo` → `toast.savedTo` / `toast.saved` choice.
- `src/app/(frontend)/(sections)/BookDetail.tsx:121-123` -- the line's right slot (`status === 'owned' && <RemoveCopy …/>`).
- `tests/int/moveCopies.int.spec.ts`, `tests/int/createCopy.int.spec.ts:66` -- int setup: `createUser`, `contextFor`, a location, `defaultLocation` set through `payload.update`, a copy created as the user.
- `tests/unit/collectionPage.unit.spec.ts:198` -- `copy(id, { status: 'ordered' })`, `holds`, `detail`, `showToast`, `router`, `reloads()` in `describe('a copy line')` (~`:760`); the `(sections)/actions` mock at `:70`.

## Tasks & Acceptance

**Execution:**
- `src/lib/copies/receiveCopy.ts` -- new: `receiveCopy` per Always, with a doc comment in the `moveCopies` style.
- `src/app/(frontend)/(sections)/actions.ts` -- `receiveCopyAction` per Always.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- `ReceiveCopy` per Always.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- render `<ReceiveCopy copyId={copyId} />` when `status === 'ordered'`, and mention it in the doc comment.
- `messages/en.json`, `messages/fi.json` -- `detail.received`.
- `tests/int/receiveCopy.int.spec.ts` -- new, one case per service row of the matrix: (a) default set, then `undo()` (the Undo row); (b) no default; (c) another user's copy; (d) an owned copy.
- `tests/unit/collectionPage.unit.spec.ts` -- mock `receiveCopyAction`. One case: an ordered line's Received calls `receiveCopyAction({ copyId: 21 })`, toasts "Saved to Olohuone" with the Undo token, and refreshes the route.

**Acceptance Criteria:**
- Given an ordered copy's line in Book detail ("Ordered" and Received), when I tap Received, then the copy becomes owned at my default location through `lib/copies`, with the toast "Saved to {location} · Undo".
- Given that toast, when I tap Undo, then the copy is ordered again with no location, and an integration test undoes it.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 14, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: a copy received elsewhere while Book detail is open answers `VALIDATION`. Only `ok` and `NOT_FOUND` refresh, so the stale Received stays and fails again. This needs a second device, or another tab, acting on the same copy while the detail is open. The fix adds a branch to the refresh rule the spec fixes.
  - `[low]` `[patch]` Blind: the restore ignores loans. No loans collection exists yet (Epic 6), but Epic 6's Lend would let Undo order a lent copy. Fixed: the doc comment says Epic 6 fails the restore with `UNDO_FAILED` once the copy has a loan, as the save's restore does (AD-11), in `removeCopies`' style.
  - `[low]` `[reject]` Blind: the `savedTo` read-back repeats `saveOwnedCopy` and also runs when there is no location. That costs one extra indexed read per tap and does no harm. Sharing a helper means refactoring `lib/catalogue` outside this story, and skipping the read adds a branch.
  - `[low]` `[patch]` Blind: the local `SavedTo` type repeats `LocationOption`, which `lib/copies/locations.ts` exports. Fixed: `savedTo` is now `LocationOption | null`.
  - `[low]` `[patch]` Blind: `sprint-status.yaml` still says backlog. Fixed: 5.25 is set to done in the finalising commit, as 5.24 was.
  - `[false]` `[reject]` Blind: built despite `oversized`. Mika dismissed that trigger for epic-sliced stories (Epic 4 retro, P4), as in 5.10–5.24. The fix would edit this spec.
  - `[low]` `[patch]` Blind: Received's Undo refresh depends on `ReadAndRating`'s `onUndone` listener, and only `CopyLine` said so. Fixed: `ReadAndRating`'s doc comment now names the dependency.
  - `[low]` `[reject]` Blind: Finnish "Saapunut" reads like a status. It mirrors the English label "Received" that EXPERIENCE.md fixes, and it renders as an `ActionLink`, so it is styled as something to tap.
  - `[low]` `[patch]` Blind: the `BookDetail` doc comment line was not rewrapped. Reflowed.
  - `[false]` `[reject]` Blind: the admin case is untested, so dropping the explicit `owner` filter would leave the tests green. The admin still could not reach the copy: `ownerAccess` binds the admin too (`tests/int/copies.int.spec.ts:89`). This is also a test-only finding with no named criterion.
  - `[low]` `[reject]` Edge: stale Received after `VALIDATION`. Same as the Blind `VALIDATION` row.
  - `[false]` `[reject]` Edge: Undo after a later move discards the move. That needs the Received toast's Undo after the move, but the toast is one at a time (`toast/store.ts:45`) and the Move toast replaces it.
  - `[low]` `[reject]` Edge: two concurrent Receives both pass the ordered check. Both write the same owned state, and either Undo orders the copy again. It needs two devices tapping within one round trip, and a conditional update adds a branch.
  - `[low]` `[patch]` Verification gap: the restore's skip of a gone copy (AD-20) had no test. Fixed: a new int case receives, deletes the copy, and Undo resolves.
  - `[low]` `[reject]` Verification gap: the "Saved" toast for no default location has no UI test. No AC names it (the ACs name "Saved to {location}"), and the branch copies `useAddToLibrary`'s. CLAUDE.md's test rule rejects it.
  - `[false]` `[reject]` Intent: Undo is tested at the service, not through the action. The AC asks for "an integration test [that] undoes it", which the int case does through `withUndo` and `undo()`, and the action's wiring is type-checked.
  - `[low]` `[reject]` Intent: no test shows the line changing after the refresh, or back to Ordered after Undo. This is test-only and needs a server re-render that the unit harness mocks. The listener dependency is documented (the `ReadAndRating` row).
  - `[false]` `[reject]` Intent: the "Saved" fallback goes beyond the UX. UX-DR46 uses "Saved" for a save with no default location. Received says "Saved to {location}" whenever there is a location, so nothing conflicts.
  - `[low]` `[reject]` Intent: `VALIDATION` does not refresh. Same as the Blind `VALIDATION` row.
  - `[false]` `[reject]` Intent: Received is missing on the Answer and in select mode. The Answer's Received is Story 8.2, and the select bar has no Received (EXPERIENCE.md).
  - `[false]` `[reject]` Intent: built despite `oversized`. Same as the Blind `oversized` row.

## Design Notes

Book detail picks up the change through `router.refresh()`, as Remove does: the line becomes "{location} · Owned" with Remove. On Undo, `ReadAndRating`'s `onUndone` listener refreshes the same route and `ShelfRows` reloads the rows. Received therefore needs no listener of its own.

## Verification

**Commands:**
- `npm run test:int -- tests/int/receiveCopy.int.spec.ts` -- expected: passes (needs this worktree's Postgres on 5434)
- `npm run test:unit` -- expected: passes (messages parity included)
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors in this repo's files

**Manual checks (if no CLI):**
- `next dev`: set a Book's copy to Ordered on Edit book, open Book detail, tap Received, see the toast and the line change to owned. Tap Undo and see "Ordered" come back.

## Auto Run Result

**Summary:** An ordered copy's line in Book detail now has Received (FR-28).
- Received makes the copy owned at the default location through the new `receiveCopy` in `lib/copies`. The toast says "Saved to {location}" (or "Saved" with no default location) and has Undo, which orders the copy again with no location.
- Book detail refreshes and focus moves to Your copies. The rows reload through `afterAction`.

**Files changed:**
- `src/lib/copies/receiveCopy.ts` (new): `receiveCopy`, undoable, with the explicit `owner` filter, `NOT_FOUND` / `VALIDATION`, and a restore that skips a gone copy.
- `src/app/(frontend)/(sections)/actions.ts`: `receiveCopyAction` (`copyInput`, `withUndo`).
- `src/app/(frontend)/(sections)/CopyLine.tsx`: `ReceiveCopy`, the Link with the toast, `afterAction` and the refresh.
- `src/app/(frontend)/(sections)/BookDetail.tsx`: Received on ordered lines; the doc comment is reflowed.
- `src/app/(frontend)/(sections)/ReadAndRating.tsx`: the doc comment names Received's reliance on its `onUndone` refresh.
- `messages/en.json`, `messages/fi.json`: `detail.received` "Received" / "Saapunut".
- `tests/int/receiveCopy.int.spec.ts` (new): five cases. With a default plus Undo, no default, another user's copy, an owned copy, and Undo after the copy is gone.
- `tests/unit/collectionPage.unit.spec.ts`: one case for Received's action call, its toast with Undo, and the refresh.
- `sprint-status.yaml`: 5.25 done.

**Deviation from the spec:** `receiveCopy` types `savedTo` as `LocationOption` (`lib/copies/locations.ts`) instead of `Named`, because `lib/copies` may not import `lib/books` (`import/no-restricted-paths`). The shape is the same, and the action still declares `Named`.

**Review findings:** one pass, 21 rows in the Review Triage Log.
- **Patched (low 6):**
  - `LocationOption` instead of the local type;
  - the Epic 6 loan note on the restore;
  - the `ReadAndRating` dependency note;
  - the doc comment reflow;
  - the gone-copy Undo int case;
  - the sprint status.
- **Deferred:** none.
- **Rejected (low):**
  - a stale Received after `VALIDATION`, found twice more (three rows);
  - the duplicated read-back;
  - "Saapunut" reads as a status;
  - concurrent Receives;
  - an untested "Saved" toast;
  - an untested refresh round trip.
- **Rejected (false):** `oversized` (twice), the untested admin case, Undo after a later move, Undo tested only at the service, the "Saved" fallback, Received missing on the Answer and in select mode.

**Follow-up review recommendation:** false. Only low entries were patched (low 6, medium 0, high 0).

**Verification:**
- `npm run test:int -- tests/int/receiveCopy.int.spec.ts`: 5 passed, on this worktree's Postgres (port 5434).
- `npm run test:unit`: 61 files, 879 passed (messages parity included).
- `npm run typecheck`: clean.
- `npx eslint --ignore-pattern '.claude/**' .`: 0 errors (40 existing warnings).
- Matrix audit, all ran and passed:
  - default set: int case 1 and the unit case;
  - no default: int case 2;
  - Undo: int case 1;
  - not the viewer's: int case 3;
  - already owned: int case 4.
- Not done: the manual `next dev` check.

**Residual risks:**
- A copy received elsewhere while Book detail is open keeps a stale Received until the next refresh, and tapping it shows an error toast.
- Undo refreshing Book detail depends on `ReadAndRating`'s `onUndone` listener.
