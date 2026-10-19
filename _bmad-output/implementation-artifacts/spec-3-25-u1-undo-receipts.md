---
title: 'Story 3.25: [U1] Undo receipts'
type: 'feature'
created: '2026-10-19'
baseline_revision: '898053707ae1e6a57e785d9e2a89f4055ef61edd'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
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
