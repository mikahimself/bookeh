---
title: 'Story 3.36: [D32] A repeated save returns the first result'
type: 'feature'
created: '2026-10-20'
baseline_revision: 'fae613247471716e78424a26678b5acad9dd0850'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `saveCopy` (3.35) accepts `SaveInput.requestId` but ignores it, so a double tap or a retried request saves two copies. AD-11 requires that a repeat of a recent `requestId` by the same user returns the first result, and AD-12 requires that the memory behind it is bounded `processState` and safe to lose.

**Approach:** Add a small per-user memory of recent save requests in `lib/catalogue`. It keeps the first call's promise under the key (user id, `requestId`) for a fixed window. A repeat, including a concurrent one, awaits that same promise and writes nothing. `saveCopy` runs its whole body through it.

## Boundaries & Constraints

**Always:**
- New `src/lib/catalogue/saveRequests.ts`:
  - It exports `REQUEST_WINDOW_MS = 10 * 60_000` and `REQUEST_MEMORY_SIZE = 500`.
  - It exports `oncePerRequest<T>(ctx: Context, requestId: string, run: () => Promise<T>): Promise<T>`.
  - The memory is `processState('catalogue.saveRequests', () => new Map<string, Entry>())`, keyed by `` `${ctx.user.id}:${requestId}` ``. An entry is `{ result: Promise<unknown>; expiresAt }` and insertion order is age, as in `lib/undo/undo.ts`.
- `oncePerRequest` behaviour:
  - A live entry for the key returns its stored promise, and `run` is not called.
  - Otherwise it first drops expired entries, then the oldest entries until there is room. Then it stores `run()`'s promise *synchronously* (before any `await`), so concurrent repeats find it.
  - When that promise rejects, its entry is deleted, but only if the entry is still that same one. A retry of a failed save runs again. Callers that were already awaiting get the same rejection.
- `requestId` must be a string of 1–64 characters. Anything else throws `DomainError('VALIDATION')` before any read or write. This bounds the memory's keys; a UUID is 36.
- `saveCopy(ctx, input)` returns `oncePerRequest(ctx, input.requestId, () => …)` around its existing body. ISBN normalisation runs inside, so a repeat of an invalid request fails again in the same way. A repeat with a different `target` under the same id returns the first result, because the id identifies the press.
- Update the `saveCopy.ts` comments: drop "`requestId` handling with 3.36" from the narrowing note. The doc comment now says that a repeat of a recent `requestId` by the same user returns the first result and writes nothing (AD-11, AD-12).

**Never:**
- No table, no cache library, no module-level `Map`. The state lives only in `processState`.
- No change to `SaveInput`/`SaveResult`, `createCopy`, `ensureSharedBook`, `downloadCover`, any collection, or any migration.
- No Undo (3.37), no server action or UI (3.46), no `saveEntry` (Epic 7).
- No test-only parameter on `oncePerRequest` or `saveCopy`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sequential repeat | A saves ISBN X with id R, then calls again with R | The second call returns a result equal to the first; A has one copy; `lookupSources` and `fetch` were not called again | No error expected |
| Concurrent repeat | Two `saveCopy` calls by A with R, started together, for a new ISBN | Both resolve to the same result; one Book and one copy exist | No error expected |
| Other user | A saves with R; B saves the same ISBN with R | B gets their own copy (a different `copyId`); A has one copy | No error expected |
| Failed first call | A's call with R fails (`none` → `NOT_FOUND`); the outcome becomes `found`; A retries with R | The retry saves one copy | The first call throws `NOT_FOUND` |
| Window passed | A saved with R; the time is now `REQUEST_WINDOW_MS` later | A call with R runs again (a new copy) | No error expected |
| Memory full | `REQUEST_MEMORY_SIZE` live ids for A, then one more | The oldest id is forgotten (a repeat of it runs again); the newest repeats still return their first result | No error expected |
| Bad id | `requestId: ''` or 65 characters | Nothing read or written | `DomainError` `VALIDATION` |

</intent-contract>

## Code Map

- `src/lib/catalogue/saveCopy.ts:43`: `saveCopy`. Its whole body (normalise, `findBookByIsbn`, `downloadCover`, `withTransaction`) becomes the `run` callback. The comment at lines 12-15 names 3.36.
- `src/lib/processState.ts`: `processState(key, init)`; the caller bounds its own state.
- `src/lib/undo/undo.ts:28-44`: the precedent to copy for a bounded `Map` with insertion-order age (drop expired, then oldest, then set) and exported size/TTL constants.
- `src/lib/catalogue/lookupLimit.ts`: the same pattern keyed by user, with a doc comment that cites AD-12.
- `src/lib/errors.ts:6`: `ErrorCode` includes `'VALIDATION'`; `DomainError(code)`.
- `src/lib/payload/context.ts`: `Context`, with `ctx.user.id`.
- `eslint.config.mjs:22`: `catalogue` may import `payload`, and `processState` is in `lib/`; check the rules if lint objects.
- `tests/int/saveCopy.int.spec.ts`: the fixtures to reuse are `found()`, `inputFor()` (a fresh `randomUUID()` per call), `freshUser()`, `copiesOf()`, `booksWithIsbn()`, and the `mediaIds`/`filenames` cleanup for created covers. `lookupSources` is `vi.mock`ed; `fetch` is spied.
- `tests/int/lookupBook.int.spec.ts:303-320`: `vi.useFakeTimers({ toFake: ['Date'] })` with `vi.setSystemTime` inside an integration test, the precedent for the window row.
- `tests/int/undo.int.spec.ts`: how `RECEIPT_STORE_SIZE` eviction is tested, the precedent for the memory-full row.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/saveRequests.ts` -- new: constants and `oncePerRequest` as in Always -- AD-11, AD-12.
- `src/lib/catalogue/saveCopy.ts` -- wrap the body in `oncePerRequest`; update the comments -- AD-11.
- `tests/int/saveCopy.int.spec.ts` -- add a `describe('repeated requestId')` with one test per matrix row. Use a shared or private Book where a new Book adds nothing (other user, window, memory full, bad id), and clean up any created cover. For memory full, call `oncePerRequest` directly with a cheap `run`, not `saveCopy`, to keep the test fast -- the epic AC asks for these behaviours at the service.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `3-36-d32-a-repeated-save-returns-the-first-result` to its final status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npx tsc --noEmit`, `npm run test:unit` and `npm run test:int`, when they run, then all pass with 0 lint errors, and the existing 3.35 `saveCopy` tests pass unchanged.
- Given `grep -rn "new Map" src/lib/catalogue/saveRequests.ts`, when it runs, then the only match is inside the `processState` init.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 23 findings — high 0, medium 0, low 11, false 12, maybe-false 0
- findings:
  - `[false]` `[reject]` blind: a repeat would return a stale `undoSeconds`, and `withUndo` placement is unstated. There is no `withUndo` or `undoSeconds` in `saveCopy` yet (3.37). Recorded as a residual risk for 3.37.
  - `[false]` `[reject]` blind: Undo does not clear the remembered save, so a late retry returns a deleted `copyId`. Undo of a save does not exist yet (3.37). Recorded as a residual risk for 3.37.
  - `[low]` `[reject]` blind: a different `target` under the same id silently returns the first result. Specified behaviour; it is reachable only through a client bug (an id per mount, not per press), which 3.46 owns. The fix adds a stored-ISBN check and a branch.
  - `[low]` `[reject]` blind: the memory is one global 500-entry map while the spec says "per-user". Keys are per user; one user evicting another needs 500 saves within 10 minutes on a single-user tailnet. The fix is a spec wording edit or a per-user bound.
  - `[low]` `[reject]` blind: `oncePerRequest<T>` casts, so a future `saveEntry` sharing the store could mistype a result. No second caller exists; ids are per press, so a copy save and an entry save never share one. The fix adds a key parameter.
  - `[false]` `[reject]` blind: spec `in-review` vs sprint `done`. Finalize sets the spec to `done` and commits both together.
  - `[low]` `[patch]` blind: a redundant `vi.restoreAllMocks()` mid-test in the bad-id test. Deleted the line; the suite's `afterEach` restores.
  - `[low]` `[reject]` blind: no doc note that the memory relies on `run` settling. `run` always settles today (cover 5 s abort, source 4 s budget); a hung save would pin retries only to that save, for one user.
  - `[low]` `[reject]` edge: evicting a still-pending oldest entry lets a repeat run again. Needs 500 newer saves, or a save still in flight after 10 minutes. The fix adds a settled flag and an eviction guard.
  - `[false]` `[reject]` edge: an undone copy's repeat returns a stale `copyId`. Same as the blind row; there is no Undo of a save yet.
  - `[low]` `[reject]` edge: the global bound contradicts "per-user memory". Same root as the blind row; rejected for the same reason.
  - `[false]` `[reject]` edge: the async wrapper returns a new promise, not the stored one. Nothing compares promise identity; the awaited value is the same, and the concurrent test proves one save.
  - `[false]` `[reject]` intent: the intent's surface is the double tap at the button. Epic 3.36's ACs are on `SaveInput` and the service (slice D32: "Service"); the button's "a double tap saves once" is 3.46's AC.
  - `[low]` `[reject]` intent: a module-level `Map` would pass every test. True, but the spec's grep AC enforces `processState`, and `processState.unit.spec.ts` tests sharing across module copies. A coverage-only ask.
  - `[false]` `[reject]` intent: "generated by the client per press" is unverified. There is no client in this story; 3.46 generates the id.
  - `[low]` `[reject]` intent: the bound is global, not per user. Same root as the blind row.
  - `[low]` `[reject]` intent: "writes nothing" is checked through copies, `lookupSources` and `fetch`, not through author, series or media rows. `run` is not called on a repeat, as the unchanged call counts show, so no row can be written. A coverage-only ask.
  - `[low]` `[reject]` intent: a different `target` under the same id is untested. A coverage-only ask; the behaviour falls out of the key, which holds no target.
  - `[false]` `[reject]` intent: Undo staleness. Same as the blind row; that is 3.37.
  - `[false]` `[reject]` intent: the window is counted from the first call's start. As specified; a save settles in seconds, against a 10-minute window.
  - `[false]` `[reject]` intent: "safe to lose on restart" is untested. That follows from `processState`; there is nothing persisted to test.
  - `[false]` `[reject]` intent: status bookkeeping. Same as the blind row.
  - `[false]` `[reject]` intent: the `VALIDATION` rule tightens the contract. Specified in Always to bound the memory's keys; `saveCopy` has no caller yet.

## Design Notes

**Why a promise, not a result.** Storing the in-flight promise at once makes concurrent repeats share one save without a lock: JavaScript runs `oncePerRequest` up to `store.set` with no `await`, so a second call made on the same tick already finds the entry. The single app instance (AD-12) makes this sufficient.

**Why forget failures.** A request is retried exactly when something went wrong. If a failure were remembered, a retry after a source outage or a lost connection would replay the error for ten minutes. A successful first save is remembered, so a retry after a response lost in transit returns it instead of saving twice.

**Why 10 minutes and 500.** A double tap repeats within a second, and a phone retry after a dropped tailnet connection within a minute or two. Ten minutes covers both with a wide margin, yet stays shorter than the 30-minute Undo receipt (3.37 returns the token with the result). 500 matches the other in-process stores and is far beyond one user's saves in ten minutes.

```ts
const entry = { result: run(), expiresAt: now + REQUEST_WINDOW_MS }
store.set(key, entry)
entry.result.catch(() => { if (store.get(key) === entry) store.delete(key) })
return entry.result as Promise<T>
```

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npx tsc --noEmit` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, the `saveCopy` suite included. Needs the worktree's Postgres on `localhost:5436` through `.env`.

## Auto Run Result

**Summary.** `saveCopy` now honours `SaveInput.requestId` (AD-11, AD-12). A repeat of a recent id by the same user returns the first result and writes nothing. Concurrent repeats share one save, and another user's same id is unrelated. The memory is `processState('catalogue.saveRequests')`: 10-minute window, 500 entries, oldest first, lost on restart. A failed save is forgotten, so a retry runs again. An id that is not 1–64 characters fails with `VALIDATION` before any read.

**Files changed.**
- `src/lib/catalogue/saveRequests.ts`: new. `REQUEST_WINDOW_MS`, `REQUEST_MEMORY_SIZE`, `oncePerRequest()`.
- `src/lib/catalogue/saveCopy.ts`: the body moves into a private `save()`, run through `oncePerRequest`; the comments are updated.
- `tests/int/saveCopy.int.spec.ts`: `describe('repeated requestId')`, 8 tests, one per matrix row (bad id twice).
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.36 is done.

**Review.** 23 findings: low 11, false 12. The verification-gap layer found none.

Patched: 1 low (deleted a redundant `vi.restoreAllMocks()` in the bad-id test). Deferred: none.

Rejected:
- Low (10):
  - A different `target` under the same id returns the first result. As specified; only a client bug reaches it.
  - The bound is global, not per user (3 rows). The keys are per user, and eviction across users needs 500 saves in 10 minutes.
  - A future `saveEntry` could share the store with a cast type. There is no second caller.
  - No doc note that `run` must settle. Today's timeouts guarantee it.
  - A pending entry could be evicted. Needs 500 newer saves, or a save still running after 10 minutes.
  - A module-level `Map` would pass the tests. The grep AC and the `processState` unit tests cover that.
  - Coverage-only asks: other rows for "writes nothing", and the different-target case.
- False (12):
  - Undo staleness (`undoSeconds`, an undone copy) (4 rows). There is no save Undo yet; it moves to residual risks.
  - Status bookkeeping (2 rows).
  - Promise identity.
  - The UI surface (3.46).
  - The client id per press (3.46).
  - The window is counted from the start.
  - Restart is untested.
  - The `VALIDATION` contract.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 1.

**Verification.** Run in worktree `story-3-36-repeated-save`, Postgres on `localhost:5436`:
- `npx eslint src tests`: 0 errors (36 warnings, already present).
- `npx tsc --noEmit`: clean.
- `npm run test:unit`: 521 passed. `scanScreen.unit.spec.ts` "pushes the Answer address…" timed out once under parallel load from other worktrees; it passed on its own 3/3 and in a full re-run.
- `npm run test:int`: 305 passed, 1 skipped; `saveCopy` 17/17.
- Matrix audit: every row has a passing test.

**Residual risks.**
- 3.37 must put `withUndo` inside the `run` callback. Wrapping it around `saveCopy` instead would record a second receipt on every repeat. On a repeat it must also return seconds recomputed from the receipt's expiry, not the stored `undoSeconds`.
- After a save is undone, a late retry with the same id within 10 minutes returns the undone `copyId` and saves nothing. 3.37 should forget the id in the restore, or accept this.
- 3.46 must create one `requestId` per press of Add to library, not per mount of the screen.
