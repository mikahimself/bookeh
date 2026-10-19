---
title: 'Story 3.25: [U1] Undo receipts'
type: 'feature'
created: '2026-10-19'
baseline_revision: '898053707ae1e6a57e785d9e2a89f4055ef61edd'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A failed COMMIT is swallowed by the Payload Drizzle adapter, so withTransaction()
      resolves and withUndo() records a receipt for a change that never persisted.
    evidence: |-
      node_modules/@payloadcms/drizzle/dist/transactions/commitTransaction.js awaits
      session.resolve(), which returns the drizzle transaction promise `done`; `done`
      carries a .catch() that calls transactionFailed(), the already-settled "ready"
      rejecter, so a COMMIT error resolves `done` and commitTransaction returns normally.
      Pre-existing in src/lib/payload/transaction.ts (story 3.10) for every write in the
      app, not caused by this story. Surfacing it means checking the session's outcome
      after commitTransaction(req), or an upstream Payload fix.
    location: >-
      src/lib/payload/transaction.ts:60
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Every undoable action (save, move, read, lend, ...) needs the same receipt-and-restore mechanism, and nothing in `src/lib` provides it. Without one home, each service would record receipts its own way, or the browser would hold previous values (AD-20).

**Approach:** Add `lib/undo`: a bounded in-process receipt store on `processState`, `withUndo(ctx, fn)` as the only recorder, and `undo(ctx, token)` as the only entry point, with `UNDO_FAILED` as a new `ErrorCode`. Integration tests prove each case with a fake undoable function that writes a real row.

## Boundaries & Constraints

**Always:**
- One module `src/lib/undo/undo.ts` (no barrel), exporting the spine's shapes verbatim (`// src/lib/undo`): `Restore = (ctx: Context) => Promise<void>`, `Undone<T> = { data: T; restore: Restore }`, `Undoable<T> = T & { undoToken: string; undoSeconds: number }`; plus `withUndo`, `undo`, `RECEIPT_TTL_MS = 30 * 60_000` and `RECEIPT_STORE_SIZE = 500`. Doc comments cite AD-12, AD-16 and AD-20.
- The store is `processState('undo.receipts', () => new Map<string, Receipt>())` where `Receipt = { userId: number; restore: Restore; expiresAt: number }`, keyed by the token: `randomUUID()` from `node:crypto`. Recording first deletes expired receipts, then evicts the oldest (Map insertion order) until at most `RECEIPT_STORE_SIZE` remain, then inserts. Nothing else bounds or sweeps it.
- `withUndo<T extends object>(ctx, fn: (tx: Context) => Promise<Undone<T>>): Promise<Undoable<T>>` throws a plain `Error` if `ctx.transactionID !== undefined` (a recorder inside a transaction would record before the commit; a service folds another's restore into its own instead). Otherwise it runs `withTransaction(ctx, fn)`, records the receipt only after that resolves (the commit), and returns `{ ...data, undoToken, undoSeconds }`. `undoSeconds` is whole seconds remaining, rounded down: 1800 at recording. When `fn` throws, nothing is recorded and the error is rethrown unchanged.
- `undo(ctx, token): Promise<void>` fails with `DomainError('UNDO_FAILED')` when the token is unknown (never issued, evicted, or issued before a restart), expired (`expiresAt <= Date.now()`: the receipt is deleted), or belongs to another user (`receipt.userId !== ctx.user.id`: the receipt is left in place, so a guess never spends the owner's Undo). Otherwise it deletes the receipt first (used once, whatever the outcome) and runs `withTransaction(ctx, (tx) => receipt.restore(tx))`; if the restore throws, the transaction has rolled back, the cause is logged once with `logger().warn({ err }, ...)` from `@/lib/errors` (never the token), and `DomainError('UNDO_FAILED')` is thrown.
- `UNDO_FAILED` joins `ErrorCode` in `src/lib/errors.ts`, with `errors.UNDO_FAILED` in both message files (en "Couldn't undo.", EXPERIENCE.md → Undo failed; fi "Kumoaminen ei onnistunut.") and in the two exhaustive `satisfies Record<ErrorCode, true>` lists.
- Imports from `src/lib` only `payload` (`Context`, `withTransaction`), `errors` and `processState` (lint zone `lib/undo`). No `any`, no `console.*`, no `req.payload`.

**Never:**
- No `undoAction`, toast or client code (U2, 3.26); no real undoable service (D6, E24, F6, ...); no change to `withTransaction`, `processState` or the gateway; no table, cookie or Redis for receipts (AD-12); no second recorder or entry point; no clock or store injection for tests (tests fake `Date`); no `src/app` change beyond the `flashCookie.ts` code list.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Record and undo | A's `withUndo` with a fake fn that creates a location of A's in `tx` and returns `{ data: { id }, restore }` | Result is `{ id, undoToken, undoSeconds: 1800 }`; the location exists after `withUndo`; `undo(ctxA, token)` runs `restore` with a context whose `transactionID` is set and whose `user.id` is A's; the restore's effect (the row deleted) is persisted | No error expected |
| fn throws | Fake fn creates the row then throws `e` | `withUndo` rejects with `e` itself; the row does not exist; `undo` of no token possible | Error rethrown unchanged |
| Used token | `undo` twice with the same token | First resolves; second fails; `restore` ran once | `DomainError('UNDO_FAILED')` |
| Another user | B calls `undo` with A's token | Fails, `restore` not called; A's `undo` with the same token then succeeds | `UNDO_FAILED` for B |
| Expired | `Date` advanced to exactly 30 minutes after recording | Fails, `restore` not called; the receipt is gone | `UNDO_FAILED` |
| Unknown / after restart | A fresh `randomUUID()` never issued (the store is lost on restart, so an old token is one of these) | Fails, no restore | `UNDO_FAILED` |
| Restore fails | `restore` renames A's location through the gateway in `tx`, then throws | Fails; the rename is not persisted; the cause is logged; a second `undo` with the token also fails (used) | `UNDO_FAILED` |
| Bounded store | `RECEIPT_STORE_SIZE + 1` receipts recorded with a fake fn that writes nothing | The first token fails, the second still undoes | `UNDO_FAILED` for the evicted one |
| Recorder inside a transaction | `withTransaction(ctxA, (tx) => withUndo(tx, fn))` | Rejects before `fn` runs | Plain `Error` (programming mistake), not `UNDO_FAILED` |

</intent-contract>

## Code Map

- `src/lib/payload/transaction.ts` -- `withTransaction(ctx, fn)`: opens on a fresh req, commits when `fn` resolves, kills and rethrows on throw, joins when `ctx.transactionID` is set. `withUndo` wraps it; `undo` runs the restore through it.
- `src/lib/payload/context.ts` -- `Context = { req, user: TypedUser, transactionID? }`; `user.id` is the receipt's user.
- `src/lib/processState.ts` -- `processState(key, init)`: the store's only home; the registry never evicts, so `undo.ts` bounds its Map itself. Pattern: `src/lib/metadata/lookup.ts:24-46` (`processState('metadata.cache', ...)`, `expiresAt` with `Date.now()`, eviction loop down to `CACHE_SIZE`).
- `src/lib/errors.ts:6-7` -- the `ErrorCode` union; `DomainError`; `logger()` (pino, same as Payload's) for the restore-failure warning, as `lookup.ts:3,64` uses it.
- `src/app/(frontend)/components/toast/flashCookie.ts:17-24` and `tests/unit/messages.unit.spec.ts:54-61` -- the two `satisfies Record<ErrorCode, true>` lists; typecheck fails until `UNDO_FAILED` is added to both.
- `messages/en.json:63-70`, `messages/fi.json:63-70` -- the `errors` blocks; the messages test requires both languages.
- `eslint.config.mjs:20-33` -- `undo: ['payload']`: the lint zone for `src/lib/undo`.
- `tests/int/transaction.int.spec.ts` -- style for a `lib/payload` service test: `contextFor(await createUser(...))`, `rejects.toBe(e)`, reads past access with `getPayload({ config })` + `overrideAccess: true`.
- `tests/int/locations.int.spec.ts:32-38` -- `locationAs(user, data)`: a `locations` row through `gateway.create` as the user (`owner` and `nameKey` only satisfy the create type). The fake undoable function creates and its restore deletes or renames such a row through `gateway` with the `tx` it is handed; `gateway.deleteByID` / `updateByID` exist (`src/lib/payload/gateway.ts:68,77`).
- `tests/unit/lookup.unit.spec.ts:57-58` -- `vi.useFakeTimers()` + `vi.setSystemTime(NOW)`. In the int test fake only `Date` (`vi.useFakeTimers({ toFake: ['Date'] })`) so pg timers keep running; `vi.useRealTimers()` in `afterEach`.
- `tests/helpers/harness.ts` -- `createUser()`, `contextFor()`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:97` -- `3-25-u1-undo-receipts: backlog` → `in-progress` at implementation, `done` at the end.

## Tasks & Acceptance

**Execution:**
- `src/lib/errors.ts` -- add `'UNDO_FAILED'` to `ErrorCode` -- the code AD-20 names.
- `messages/en.json`, `messages/fi.json` -- add `errors.UNDO_FAILED` -- the Errors convention: `errors.<CODE>` in both languages.
- `src/app/(frontend)/components/toast/flashCookie.ts`, `tests/unit/messages.unit.spec.ts` -- add `UNDO_FAILED: true` to the exhaustive lists -- typecheck requires it.
- `src/lib/undo/undo.ts` -- new: shapes, constants, store, `withUndo`, `undo` per Always -- AD-20's one mechanism.
- `tests/int/undo.int.spec.ts` -- new: the matrix rows with users A and B, a fake undoable function over A's `locations` rows, `Date` faked for the expiry row -- the spine's "an undoable service tests its undo", here for the mechanism itself.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-25-u1-undo-receipts` status.

**Acceptance Criteria:**
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (lint: 0 errors in `src` and `tests`).
- Given `src/lib/undo/undo.ts`, when inspected, then the only store is one `processState` call, the receipt is recorded after `withTransaction` resolves, the restore runs only inside `withTransaction`, and every failure of `undo` surfaces as `DomainError('UNDO_FAILED')`.
- Given the integration test, when the restore throws after a gateway write, then the written change is absent from the database afterwards.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 21 findings — high 0, medium 1, low 11, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: `undo()` has no guard against a context that already carries a transaction; `withTransaction` would join and a throwing restore could leave the opener's transaction half-written while the receipt is spent. Verified: real, but reachable only by a programming mistake; AD-20 fixes the single caller as `undoAction` with the request's context, and no service calls `undo()`. Adding a guard for a situation no caller reaches is more than a direct correction. Recorded under residual risks.
  - `[low]` `[reject]` blind: the catch in `undo()` maps programming errors from `withTransaction` (`assertLive`, adapter without a transaction) to `UNDO_FAILED` at `warn`, not `INTERNAL` at `error`; `userId` missing from the log. Verified: real; the cause and stack are logged either way and "Couldn't undo." is the right toast in both cases. Separating error kinds adds branches; one user in Phase 1.
  - `[false]` `[reject]` blind: the spine's Deferred line "Undo store size. Set in the `lib/undo` story" is stale. The line is a pointer to where the decision lives and remains true: `RECEIPT_STORE_SIZE = 500` in `undo.ts` and this spec; editing a planning artifact would also invalidate the cached epic contexts. The cross-user eviction consequence it raises is recorded under residual risks.
  - `[low]` `[patch]` blind: the eviction test's `{ timeout: 120_000 }` is two orders of magnitude over its sub-second run, so a hung transaction stalls the suite two minutes. Patched: `20_000`.
  - `[low]` `[patch]` blind: `undoSeconds` asserted twice (computed in `toEqual`, then literal `1800`). Patched: the literal `1800` inside `toEqual`, the second line deleted.
  - `[low]` `[reject]` blind: `sprint-status.yaml` says `done` while the committed spec says `in-progress`/`in-review`. The implementer set and committed `done` early; finalization writes `done` to the spec in the closing commit, and nothing reads the pair in between.
  - `[low]` `[reject]` blind: `{ ...data, undoToken, undoSeconds }` would overwrite a `data` key of the same name, and `T extends object` admits arrays. Verified at the type level; no service's data carries those keys and the spine fixes `Undoable<T>`'s shape. A tighter bound is a guard for a case no caller produces.
  - `[low]` `[reject]` edge: `withUndo` called with the outer context while that context's `withTransaction` fn is running opens an independent transaction (`withTransaction` checks `suspended` only for a context carrying a transaction). Verified; pre-existing shape of `withTransaction` (3.10) and a programming mistake the gateway already refuses for writes. More guards than a correction.
  - `[low]` `[reject]` edge: `undo()` inside a transaction. Same root cause as the first blind row; same disposition.
  - `[medium]` `[defer]` edge: a failed COMMIT is swallowed by the Drizzle adapter, so `withTransaction` resolves and `withUndo` records a receipt for a change that never persisted. Verified in `@payloadcms/drizzle/dist/transactions/commitTransaction.js`: `session.resolve()` returns the transaction promise whose `.catch` calls the already-settled ready-rejecter, so a COMMIT error resolves. Pre-existing in `src/lib/payload/transaction.ts` for every write in the app, not caused by this story. Deferred in frontmatter.
  - `[low]` `[reject]` edge: `data` with `undoToken`/`undoSeconds` keys overwritten. Same root cause as the blind type-level row; same disposition.
  - `[low]` `[reject]` verification-gap (observation, filed as no gap): `JSON.stringify(warn.mock.calls)` cannot see a token inside an `Error` message. The assertion covers the shape the spec forbids (`{ err, token }`); a token in the restore's own error text is the restore author's, not the logger's.
  - `[false]` `[reject]` intent (a): "returns `UNDO_FAILED`" is met at the exception surface, not an `ActionResult`. The Errors convention makes `DomainError(code)` the service form of a code and `runAction()` the result form; `undoAction` is U2 (3.26).
  - `[false]` `[reject]` intent (b): keyed by token with the user checked on use, not a composite key. Observably identical for every AC case; the AC names no key shape, and the user check leaves the owner's receipt intact.
  - `[false]` `[reject]` intent (c): "after restart" covered by the never-issued token. The store lives in the process (AD-12); after a restart every old token is an unknown one, the same code path.
  - `[false]` `[reject]` intent (d): record-after-commit ordering not asserted directly. `withTransaction` resolves only after `commitTransaction`; the fn-throws test pins that a rollback leaves no receipt.
  - `[false]` `[reject]` intent (e): `undoSeconds` is always 1800 at this surface. The AC asks for a relative value on the result so clock skew does not matter; the spine's toast counts it down client-side.
  - `[false]` `[reject]` intent (f): `withUndo<T extends object>` adds a constraint the spine's alias lacks. `T & { undoToken; undoSeconds }` is only meaningful for an object `T`; every spine result shape is one.
  - `[false]` `[reject]` intent (g): the in-transaction guard, the warn log, leaving another user's receipt and spend-before-restore are beyond the five ACs. Each traces to AD-20's Prevents list or EXPERIENCE.md → Undo failed, which the story cites; none contradicts an AC.
  - `[false]` `[reject]` intent (h): integration tests only, no unit test with a faked transaction. The spine's Tests convention requires integration tests for a service story; the fake undoable function writes real rows.
  - `[low]` `[reject]` intent (i): spec and sprint statuses disagree mid-review. Same root cause as the blind bookkeeping row; same disposition.

## Design Notes

The token is the Map key and the user is checked on use, not part of the key: a token is a 122-bit random UUID, so the user check guards against a leaked or replayed token, not against collisions. Receipts of another user are not spent by a wrong user's attempt.

The receipt is deleted before the restore runs, so a second tap during the restore fails fast and a failed restore cannot be retried. EXPERIENCE.md offers no retry: "Couldn't undo." ends the toast.

```ts
export async function undo(ctx: Context, token: string): Promise<void> {
  const receipt = receipts().get(token)
  if (!receipt || receipt.expiresAt <= Date.now()) { receipts().delete(token); throw new DomainError('UNDO_FAILED') }
  if (receipt.userId !== ctx.user.id) throw new DomainError('UNDO_FAILED')
  receipts().delete(token)
  try { await withTransaction(ctx, (tx) => receipt.restore(tx)) }
  catch (err) { logger().warn({ err }, 'Undo restore failed'); throw new DomainError('UNDO_FAILED') }
}
```

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass (`messages` now lists `UNDO_FAILED`).
- `npm run test:int` -- expected: all pass, `undo` included (needs the Postgres on `DATABASE_URL`; the bounded-store row opens 501 transactions and may take a few seconds).

## Auto Run Result

**Summary.** `lib/undo` exists: `src/lib/undo/undo.ts` holds the spine's `Restore`, `Undone<T>` and `Undoable<T>` shapes, `RECEIPT_TTL_MS` (30 minutes) and `RECEIPT_STORE_SIZE` (500, set here), one `processState('undo.receipts')` Map keyed by a `randomUUID()` token with the user id on the receipt, `withUndo(ctx, fn)` as the only recorder (opens the transaction through `withTransaction`, records after it resolves, returns `{ ...data, undoToken, undoSeconds: 1800 }`, refuses a context that already carries a transaction, rethrows `fn`'s error unchanged with nothing recorded) and `undo(ctx, token)` as the only entry point (unknown, expired, another user's: `DomainError('UNDO_FAILED')`, the owner's receipt untouched by a wrong user; otherwise the receipt is spent first and the restore runs inside `withTransaction`; a throwing restore rolls back, logs `warn({ err })` once and fails with `UNDO_FAILED`). Recording sweeps expired receipts and evicts the oldest so the store holds at most 500. `UNDO_FAILED` joins `ErrorCode` with messages in both languages.

**Files changed.**
- `src/lib/undo/undo.ts` -- new: shapes, constants, store, `withUndo`, `undo`.
- `src/lib/errors.ts` -- `UNDO_FAILED` in `ErrorCode`.
- `messages/en.json`, `messages/fi.json` -- `errors.UNDO_FAILED` ("Couldn't undo." / "Kumoaminen ei onnistunut.").
- `src/app/(frontend)/components/toast/flashCookie.ts`, `tests/unit/messages.unit.spec.ts` -- the exhaustive code lists.
- `tests/int/undo.int.spec.ts` -- new: 8 tests covering the 9 matrix rows (the first test covers "Record and undo" and "Used token").
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.25 done.

**Review.** 21 findings (medium 1, low 11, false 9). Patched 2 entries, both low: the eviction test's timeout override lowered from 120 s to 20 s; the duplicated `undoSeconds` assertion reduced to the literal `1800` inside `toEqual`. Deferred 1 (medium, pre-existing): the Drizzle adapter swallows a failed COMMIT, so `withTransaction` resolves and a receipt is recorded for a change that never persisted; belongs to `src/lib/payload/transaction.ts`, not this story. Rejected:
- `undo()` without a guard against a context carrying a transaction (two rows): reachable only by a programming mistake; AD-20 fixes the one caller as `undoAction` with the request context. Residual risk below.
- Programming errors inside `undo()` mapped to `UNDO_FAILED` at `warn`: the cause is logged either way and the toast text is right in both cases; separating error kinds adds branches.
- The spine's Deferred line on the store size: a pointer to this story, still true; editing planning artifacts would invalidate the cached epic contexts.
- Spec and sprint statuses disagreeing mid-review (two rows): the implementer committed `done` early; finalization sets the spec to `done` in the closing commit.
- Spread overwriting `undoToken`/`undoSeconds` keys in `data`, `T extends object` admitting arrays (two rows): no caller produces such data; the spine fixes the shape.
- `withUndo` with a suspended outer context: pre-existing shape of `withTransaction`; the gateway refuses writes on that context.
- The log assertion not seeing a token inside an `Error` message: the assertion covers the forbidden `{ err, token }` shape.
- Intent audit rows (exception vs result surface, key shape, restart by unknown token, ordering by consequence, constant 1800, the `T extends object` bound, spine-grounded additions, integration tests only): no bad outcome; each follows the Errors and Tests conventions, AD-12 or AD-20.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 2.

**Verification** (main checkout, Postgres on `DATABASE_URL`, after the patches).
- `npx eslint src tests`: 0 errors (36 pre-existing warnings in generated migrations).
- `npm run typecheck`: clean.
- `npm run test:unit`: 29 files, 501 passed.
- `npm run test:int`: 28 files passed, 1 skipped (`migrationSchema`, push on); `undo` 8/8 in under a second, the 501-transaction eviction row included.
- Matrix audit: every row has a passing test in `tests/int/undo.int.spec.ts`.
- Playwright not run (service story, no UI).

**Residual risks.** `undo()` called with a context that already carries a transaction joins it and does not roll back on its own; only `undoAction` (U2) may call it, with the request's context. The store bound is shared by all users: one user's burst of 500 actions evicts another user's live receipts (one user in Phase 1). A swallowed COMMIT failure (deferred, pre-existing) would leave a receipt for a change that never persisted. The implementer committed before review and amended the commit with the patches; the spec is committed separately at finalization.
