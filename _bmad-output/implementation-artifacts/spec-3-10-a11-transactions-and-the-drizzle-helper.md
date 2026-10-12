---
title: 'Story 3.10: [A11] Transactions and the Drizzle helper'
type: 'feature'
created: '2026-10-12'
baseline_revision: '8f7ddbd55af3017ff2d05df7b85e8c4b9e9b542e'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A COMMIT that fails (connection drop, serialization failure) is swallowed by Payload's Drizzle adapter, so `withTransaction` resolves as if committed.
    evidence: |-
      node_modules/@payloadcms/drizzle/dist/transactions/commitTransaction.js wraps `session.resolve()` in try/catch and calls `session.reject()`; beginTransaction.js attaches `.catch` to `done` that calls an already-settled `transactionFailed`. Pre-existing Payload behaviour; detecting it means replacing the adapter's session handling. Worth raising upstream or revisiting if a deferred constraint or serializable isolation is ever used.
    location: >-
      src/lib/payload/transaction.ts (commitTransaction call)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Nothing in `lib/payload` opens a transaction, so a save cannot be all or nothing (AD-16, AD-11), and there is no Drizzle helper for the read-only shelf queries (AD-7) that would see rows written earlier in the same transaction.

**Approach:** Add `withTransaction(ctx, fn)` in `src/lib/payload/transaction.ts`: it opens a transaction on a fresh request for the context's user, hands `fn` a context carrying it, commits on return and rolls back on throw; a context that already carries one joins it. Add `drizzleFor(ctx)` in `src/lib/payload/drizzle.ts`, returning the context's transaction or the adapter's Drizzle instance. The gateway already passes `ctx.req`, so its calls join through Payload's `req.transactionID`.

## Boundaries & Constraints

**Always:** `withTransaction` is the only place a transaction opens (AD-16). The opener alone commits or rolls back; a joined call just runs `fn(ctx)`. The transaction context has its own `req` (from `createLocalReq({ user: ctx.user }, payload)`), so the outer context neither joins by accident nor shares the dataloader cache of rolled-back reads. Payload rolls back a shared transaction and deletes `req.transactionID` when any Local API call inside it fails, even a `NotFound` read; from then on the gateway, `drizzleFor` and the commit refuse to run on that context (throw), so no later write auto-commits outside it. Strict TS, no `any`.

**Never:** No savepoints or nested independent transactions. No caller of `withTransaction` yet (`withUndo` is 3.25, `saveCopy` 3.35). No shelf query module (`lib/shelf` is Epic 4). No change to the gateway's option types or what it overrides. No `@payloadcms/drizzle` or `drizzle-orm` dependency: types come from `@payloadcms/db-postgres/drizzle/*`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Commit | `fn` writes two rows through the gateway and returns `v` | resolves `v`; both rows visible outside | No error expected |
| Rollback | `fn` writes two rows, then throws `e` | rejects with `e`; neither row exists | Rethrows `e` unchanged |
| Drizzle read inside | `fn` creates a row, then `drizzleFor(tx)` selects it | row found; `drizzleFor(outer)` meanwhile does not see it | No error expected |
| Join | `withTransaction(tx, g)` inside `fn` | `g` gets `tx` itself; its writes commit or roll back with the outer | Inner throw propagates; opener rolls back |
| Killed by Payload | inside `fn` a gateway read throws `NotFound`, `fn` catches it and writes again | the write throws; `withTransaction` rejects; nothing from `fn` persists | Error names the rolled-back transaction |
| No transaction support | adapter's `beginTransaction` yields none | `withTransaction` throws before `fn` runs | Error, not silent autocommit |

</intent-contract>

## Code Map

- `src/lib/payload/context.ts:15` -- `Context = { req; user }`; gains optional `transactionID` (the id `withTransaction` opened; join detection and the killed check read it). Doc comment updated.
- `src/lib/payload/gateway.ts:24-29` -- `scope(ctx)` is the single funnel for every gateway call: add the killed-transaction check there.
- `node_modules/payload/dist/utilities/{initTransaction,commitTransaction,killTransaction}.js` -- exported from `payload`; `initTransaction(req)` returns `true` only when it opened one; `killTransaction` is a no-op without a live id. Every collection operation calls `killTransaction(args.req)` in its catch (e.g. `collections/operations/findByID.js:249`).
- `node_modules/@payloadcms/drizzle/dist/utilities/getTransaction.js` -- reference for the helper: `adapter.sessions[await req.transactionID]?.db || adapter.drizzle`. Not imported (not a direct dependency).
- `node_modules/@payloadcms/db-postgres/dist/types.d.ts:84-100` -- module augmentation types `payload.db.drizzle` and `payload.db.sessions` (session `db` is `DrizzleTransaction`, a Postgres-or-SQLite union, so one commented cast to the Postgres type is needed).
- `eslint.config.mjs:156-161` -- `src/lib/payload/**` is exempt from the gateway and Drizzle import rules; nothing to change.
- `tests/helpers/harness.ts:39` -- `contextFor(user)` builds test contexts; `createUser({ roles: ['admin'] })` gives a context that may create users (`src/collections/Users.ts:30-37`).
- `tests/int/gateway.int.spec.ts` -- int test style to copy.

## Tasks & Acceptance

**Execution:**
- `src/lib/payload/context.ts` -- add `transactionID?: number | string` to `Context` with a doc line -- the context carries the transaction (AD-16).
- `src/lib/payload/transaction.ts` -- new. `withTransaction<T>(ctx, fn: (tx: Context) => Promise<T>): Promise<T>` and `assertLive(ctx)` (throws when `ctx.transactionID` is set and `ctx.req.transactionID !== ctx.transactionID`). Opener: fresh req, `initTransaction(req)` (false → throw), `tx = { req, user, transactionID: req.transactionID }`; `fn(tx)`; `assertLive(tx)` then `commitTransaction(req)`; on any throw `killTransaction(req)` and rethrow. Join: when `ctx.transactionID` is set, `assertLive(ctx)` and return `fn(ctx)`.
- `src/lib/payload/gateway.ts` -- `scope(ctx)` calls `assertLive(ctx)` first; header doc mentions the transaction context.
- `src/lib/payload/drizzle.ts` -- new. `export type Drizzle = PgDatabase<NodePgQueryResultHKT, Record<string, unknown>>` (type imports from `@payloadcms/db-postgres/drizzle/pg-core` and `/node-postgres`); `drizzleFor(ctx): Drizzle` -- with `ctx.transactionID`: `assertLive`, then the session's `db`; otherwise `payload.db.drizzle`. Doc: read-only use (AD-7), callers are `lib/shelf`.
- `tests/int/transaction.int.spec.ts` -- new. One test per matrix row ("No transaction support" via `vi.spyOn(payload.db, 'beginTransaction').mockResolvedValueOnce(null)`, asserting `fn` never ran); rows are users created through the gateway by an admin context with unique emails, checked afterwards with `payload.find` (`overrideAccess`) or `drizzleFor` + `sql` from `@payloadcms/db-postgres/drizzle`.

**Acceptance Criteria:**
- Given an admin context, when `withTransaction` runs an `fn` that creates two users and throws, then the call rejects with that error and neither user exists (`npm run test:int`).
- Given a transaction context, when a user is created through the gateway and then selected with `drizzleFor(tx)`, then the row is returned, while `drizzleFor` on the outer context returns nothing until the commit.
- Given the changed files, when lint and typecheck run, then both are clean.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 20 findings — high 0, medium 4, low 13, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: a failed `drizzleFor(tx)` statement caught by `fn` leaves Postgres in the aborted state, and the COMMIT silently rolls back — only a caught raw Drizzle read triggers it (every Payload op failure already kills and is guarded); `lib/shelf` queries do not catch, and detecting it needs a wrapped handle.
  - `[medium]` `[defer]` blind: Payload's Drizzle `commitTransaction` swallows a failing COMMIT, so `withTransaction` can resolve after nothing persisted — pre-existing in Payload (`commitTransaction.js` try/catch, `beginTransaction.js` `.catch` on `done`); detecting it means replacing Payload's session handling.
  - `[low]` `[patch]` blind: `assertLive` does not say who must call it, and future system-privilege functions in `lib/catalogue` reach `ctx.req.payload` directly — doc sentence added: every call on `ctx.req` outside the gateway and `drizzleFor` calls it first.
  - `[false]` `[reject]` blind: a context whose `req` already carries a Payload-opened transaction opens a second one — no code builds a `Context` from a Payload-held `req`: contexts come only from `requireUser`, `contextFor` and `withTransaction`; `seedFirstUser` builds none.
  - `[low]` `[reject]` blind: concurrent or un-awaited gateway calls inside `fn` can run after the transaction ended — the gateway documents one call at a time per context; an in-flight counter or type-aware `no-floating-promises` is new machinery for a convention no caller breaks yet.
  - `[low]` `[reject]` blind: the outer `req`'s dataloader keeps relationships populated before the save — only relationship population uses it, keys include `transactionID`, and a read-save-reread with depth in one request does not exist; a reset adds state.
  - `[low]` `[patch]` blind: a stored `drizzleFor` handle skips the liveness check and nothing types it read-only — doc sentence added: fetch it per query, never keep it across other calls; a narrowed type is left to `lib/shelf` (Epic 4).
  - `[medium]` `[defer]` edge: COMMIT failure swallowed by the adapter — same root as the blind commit finding.
  - `[low]` `[reject]` edge: an outer `fn` that catches a joined call's throw commits the inner partial writes — the spec's join rule (opener alone ends it, no savepoints); no caller catches and continues, and killing on inner throw adds a branch.
  - `[low]` `[reject]` edge: an un-awaited gateway call still running when `fn` resolves — same root as the blind concurrency finding.
  - `[low]` `[reject]` edge: concurrent calls where one failure kills the transaction mid-flight of another — same root as the blind concurrency finding.
  - `[low]` `[patch]` edge: a `drizzleFor` handle kept across a failing call — same root and fix as the blind handle finding.
  - `[medium]` `[patch]` edge: `fn` using the outer context for a write runs outside the transaction or hangs on a row lock the transaction holds (no lock timeout) — the outer context is now suspended while the opener's `fn` runs; gateway calls on it throw; `drizzleFor(outer)` reads still work; int test added.
  - `[low]` `[patch]` edge: a tx context used after commit throws "was rolled back" — message is now "Transaction <id> has ended"; tests updated.
  - `[medium]` `[patch]` verification-gap: the commit-time `assertLive(tx)` is never exercised alone, so removing it keeps every test green while a swallowed `NotFound` reports success — test added: `fn` catches the `NotFound` and returns; the call rejects and the row is not persisted.
  - `[false]` `[reject]` intent: no product caller uses `withTransaction` — the epic's AC for 3.10 sits at `lib/payload` and its integration tests; callers arrive in 3.25 and 3.35.
  - `[low]` `[reject]` intent: `find`, `count`, `updateByID`, `deleteByID` are not exercised on a tx context — all six functions share `scope(ctx)`, which passes the same `req`; one test per function restates the spread.
  - `[low]` `[reject]` intent: the `Drizzle` type is a full `PgDatabase`, so read-only rests on the doc — narrowing belongs with the shelf query shape (Epic 4); now an abstraction for an unseen caller.
  - `[low]` `[reject]` intent: an outer `fn` catching an inner joined throw is not tested — same root as the edge join finding.
  - `[false]` `[reject]` intent: sprint status and commit not done — finalisation of this run updates `sprint-status.yaml` and commits.

## Design Notes

**Why a fresh `req`.** Payload keeps the transaction on `req.transactionID` and caches reads in `req.payloadDataLoader`. Mutating the outer `ctx.req` would make every call on the outer context join silently and keep reads cached inside a rolled-back transaction. A request is cheap: `requireUser()` builds its own the same way.

**Why the killed check.** Payload operations call `killTransaction(req)` in their catch even when they only joined, and the Drizzle adapter's `commitTransaction` returns silently for an id it no longer has. Without the check, `fn` catching a `NotFound` would roll back its earlier writes, auto-commit its later ones, and `withTransaction` would report success.

```ts
const tx: Context = { req, user: ctx.user, transactionID: req.transactionID as number | string }
try {
  const result = await fn(tx)
  assertLive(tx)
  await commitTransaction(req)
  return result
} catch (err) {
  await killTransaction(req)
  throw err
}
```

## Verification

**Commands:**
- `npm run test:int` -- expected: all pass, including `transaction.int.spec.ts` and `gateway.int.spec.ts`
- `npm run test:unit` -- expected: all pass
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary.** Added `withTransaction(ctx, fn)` and `drizzleFor(ctx)` to `lib/payload` (AD-16). `withTransaction` builds a fresh request for the context's user and opens a transaction on it with Payload's `initTransaction`. It hands `fn` a context that carries the `transactionID`, commits when `fn` resolves, and rolls back and rethrows when it throws. A context that already carries a transaction joins it, and only the opener commits or rolls back.

`assertLive(ctx)` guards against Payload's habit of rolling back a shared transaction when any call inside it fails. The gateway funnel, `drizzleFor` and the commit all call it, so nothing auto-commits outside a dead transaction. While `fn` runs, the outer context is suspended, so a gateway call on it throws instead of writing outside the transaction or hanging on its locks. `drizzleFor` returns the transaction's Drizzle handle inside a transaction and the adapter's handle otherwise.

**Files changed.**
- `src/lib/payload/transaction.ts`: new. Contains `withTransaction`, `assertLive` and the suspended set for outer contexts.
- `src/lib/payload/drizzle.ts`: new. Contains `drizzleFor` and the `Drizzle` type, typed through `@payloadcms/db-postgres/drizzle/*`.
- `src/lib/payload/context.ts`: `Context` gains `transactionID?`.
- `src/lib/payload/gateway.ts`: `scope()` calls `assertLive`. The functions are now `async`, so a dead context rejects.
- `tests/int/transaction.int.spec.ts`: new, 8 tests covering every matrix row plus the commit-time check and the outer-context guard.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 3.10 set to `done`.

**Review findings.** 20 findings. Each has its own row in the Review Triage Log.
- **Patched (5):**
  - Medium: the outer context is suspended while `fn` runs.
  - Medium: a test now covers the commit-time liveness check on its own.
  - Low: the `assertLive` doc says who must call it.
  - Low: the `drizzleFor` doc says to fetch the handle per query.
  - Low: the error message is now "has ended" instead of "was rolled back".
- **Deferred (1):** Payload's adapter swallows a failing COMMIT. Two findings (blind and edge) share this root.
- **Rejected:**
  - Caught aborted Drizzle statement: unlikely, and the fix needs a wrapper.
  - A context built on a `req` that Payload already holds a transaction on: no such builder exists.
  - Concurrent or un-awaited calls inside `fn` (blind and two edge findings): the gateway documents one call at a time per context.
  - Stale outer dataloader: nothing reads, saves and re-reads with depth in one request.
  - A joined throw caught by the outer `fn` (edge and intent findings): this follows the spec's join rule.
  - No product caller: callers arrive in 3.25 and 3.35.
  - Other gateway functions not tested in a transaction: they share `scope`.
  - The `Drizzle` type is not narrowed to reads: that belongs to Epic 4's shelf queries.
  - Sprint status and commit: finalisation does both.

**Follow-up review recommendation:** true. Patched: high 0, medium 2, low 3. The named unverified risk is the suspended-outer-context guard. It was added during review and no reviewer has looked at it. The open question is whether any legitimate flow uses the outer context during `fn`; `withUndo` (3.25) is the first caller to check against it.

**Verification.**
- `npm run test:int`: 115 tests pass, 1 skipped as before. `transaction.int.spec.ts` has 8 tests.
- `npm run test:unit`: 471 tests pass.
- `npm run lint`: 0 errors. The 8 warnings are in old migrations.
- `npm run typecheck`: clean.
- Prettier: clean.
- Matrix audit: every row has a test that passes.

**Residual risks.**
- A failed COMMIT is swallowed by Payload (deferred).
- A copied context (`{ ...ctx }`) bypasses the suspended check.
- Concurrent gateway calls on one context are prevented by convention only.
