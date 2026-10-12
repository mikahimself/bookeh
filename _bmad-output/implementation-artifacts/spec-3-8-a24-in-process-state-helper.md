---
title: 'Story 3.8: [A24] In-process state helper'
type: 'feature'
created: '2026-10-12'
status: 'done'
baseline_revision: 'f353c86491530d614d15b29357f9d9d9ddf31c46'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** AD-12 allows in-process state (lookup cache, circuit breaker, rate limit, `requestId` memory, Undo receipts) only through `processState(key, init)`, and the module does not exist yet. A module-level variable is not shared between pages, server actions and route handlers in the built Next.js app, so story 3.9 and the schema lane have nowhere safe to keep state.

**Approach:** Add `src/lib/processState.ts` exporting `processState<T>(key, init)`: it looks the key up in one registry kept on `globalThis`, calls `init()` only the first time, and returns the same object on every later call with that key, even from a fresh copy of the module.

## Boundaries & Constraints

**Always:** The module imports nothing from the project (already lint-enforced by the zone in `eslint.config.mjs:62-67`). The registry lives on `globalThis` under a `Symbol.for(...)` key so a second module instance (separate bundle, HMR, `vi.resetModules`) finds the same registry. Strict TS, no `any`.

**Never:** No bounding, eviction, TTL or reset/clear API in the helper — bounding is each caller's job (AD-12 binds the state, not the registry), and a reset hook would be an abstraction "for later". No Redis, no table, no persistence. No callers in this story (3.9 is the first).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First call | `processState('k', init)`, key unseen | calls `init` once, returns its value | No error expected |
| Repeat call | same key again, any `init` | returns the identical object; `init` not called | No error expected |
| Second key | `processState('k2', init2)` | own value from `init2`, independent of `'k'` | No error expected |
| Fresh module instance | `vi.resetModules()`, re-import, same key | identical object to the first instance's | No error expected |

</intent-contract>

## Code Map

- `src/lib/processState.ts` -- new; the only creator of in-process state (spine AD-12, file tree line 559)
- `eslint.config.mjs:20-67` -- already lists `processState` as importable from every `src/lib` service and forbids it importing from `src`; no change needed
- `src/lib/errors.ts` -- sibling zero-dependency module; match its doc-comment style (`/** Spine, AD-12. ... */`)
- `tests/unit/*.unit.spec.ts` -- unit lane (no database), `@/lib/...` imports via tsconfig paths; see `tests/unit/errors.unit.spec.ts` for style
- `vitest.config.mts` -- unit project includes `tests/unit/**/*.unit.spec.ts`

## Tasks & Acceptance

**Execution:**
- `src/lib/processState.ts` -- add `export function processState<T>(key: string, init: () => T): T` backed by a `Map<string, unknown>` stored on `globalThis` under `Symbol.for('bookeh.processState')`; doc comment cites AD-12 and says callers must bound their state -- one shared home for in-process state
- `tests/unit/processState.unit.spec.ts` -- cover first call, repeat call (same object, `init` not re-run), a second key, and a re-imported module after `vi.resetModules()` returning the same object; use keys unique to the spec -- the AC's three cases plus the one behaviour that distinguishes `globalThis` from a module variable

**Acceptance Criteria:**
- Given `src/lib/processState.ts`, when ESLint runs, then the existing zone reports no import from the project
- Given the unit lane, when `npm run test:unit` runs, then the new spec passes alongside the existing ones

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 13 findings — high 0, medium 0, low 8, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` blind: unconstrained `T` lets a caller store a primitive that can never change, since there is no setter — constrained to `T extends object`; the doc comment says the value is a mutable container changed in place.
  - `[low]` `[reject]` blind: an async `init` whose promise rejects is cached until restart — every caller planned by the spine (cache, breaker, rate limit, `requestId` memory, receipts) is a synchronous container; a type that excludes `PromiseLike` adds a conditional type for a case nobody writes.
  - `[low]` `[patch]` blind: the comment does not exclude `src/proxy.ts`, which the bundled Next docs (proxy.md:19) say must not rely on shared globals — added a clause saying Proxy must not use the helper.
  - `[false]` `[reject]` blind: callers have no way to reset state in tests — a test gets the caller's own container through `processState(key, ...)` and clears it (`.clear()` on a Map); no private detail or reset API is needed.
  - `[low]` `[patch]` blind: in `next dev` a changed `init` is not re-run because HMR keeps the old object — the comment now says a changed `init` takes effect only after a restart.
  - `[low]` `[reject]` blind: two callers choosing the same key get each other's object — the comment already asks callers to namespace keys (`'metadata.cache'`); a typed key registry is ruled out by the spec until callers exist.
  - `[low]` `[reject]` blind: `init` calling `processState` for its own key runs `init` twice — nobody writes that; documenting or guarding it adds text or code for an unreachable case.
  - `[low]` `[reject]` edge: async `init` rejection cached forever — same root as the blind finding above, same reason.
  - `[low]` `[reject]` edge: re-entrant `init` recursion — same root as the blind re-entry finding; a pending-set guard is machinery for an unwritten case.
  - `[low]` `[reject]` edge: same key, different `T`, unchecked cast — same root as the blind key-collision finding, same reason.
  - `[false]` `[reject]` intent: sharing across Next bundles is tested only through `vi.resetModules()`, not a built app — `next start` and the standalone server run every bundle in one Node process with one `globalThis`; the `Symbol.for` registry is the mechanism that holds there, and the AC asks for a unit test.
  - `[false]` `[reject]` intent: `src/lib/errors.ts:35` keeps a logger singleton in a module variable — pre-existing, and a duplicated pino instance shares no state, so AD-12's sharing problem does not arise.
  - `[false]` `[reject]` intent: typing collision noted descriptively — not a separate defect; covered by the key-collision rows above.

## Design Notes

The cast at the single `Map.get` is the only unchecked point: a key is one caller's, so the type it was created with is the type it is read with. Keys are plain strings namespaced by the caller (e.g. `'metadata.cache'`), not a typed registry — no shared key list until there are callers.

```ts
const registry = ((globalThis as Record<symbol, unknown>)[KEY] ??= new Map()) as Map<string, unknown>
```

## Verification

**Commands:**
- `npm run test:unit -- tests/unit/processState.unit.spec.ts` -- expected: all cases pass
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary.** Added `processState<T extends object>(key, init)` in `src/lib/processState.ts`: one `Map` kept on `globalThis` under `Symbol.for('bookeh.processState')`, `init` run only the first time a key is seen. No imports, no eviction or reset, no callers yet (3.9 is the first). The doc comment cites AD-12, says callers bound their own state, that a changed `init` needs a restart in `next dev`, and that `src/proxy.ts` must not use it.

**Files changed.**
- `src/lib/processState.ts`: new. The in-process state helper.
- `tests/unit/processState.unit.spec.ts`: new, 3 tests. First and repeat call, a second key, and the same object from a re-imported module after `vi.resetModules()` (fails if the registry were a module variable).
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 3.8 `done`.

**Review findings.** 13 findings, each with its own row in the Review Triage Log.
- **Patched (all low, 3):** `T extends object`; HMR clause; Proxy exclusion.
- **Deferred:** none.
- **Rejected, low:** async `init` rejection cached (blind and edge); key collision across callers (blind and edge); re-entrant `init` (blind and edge). Each is unreachable for the planned callers and the fix adds types or guards.
- **Rejected, false:** no reset for tests (callers clear their own container); built-app sharing untested (one Node process, one `globalThis`); `errors.ts` logger singleton (pre-existing, shares no state); typing collision (duplicate of the rejected rows).

**Follow-up review recommendation:** false. Patched high 0, medium 0, low 3.

**Verification.**
- `npm run test:unit -- tests/unit/processState.unit.spec.ts`: 3 pass. Full unit lane before the patches: 27 files, 453 tests pass.
- `npm run lint`: 0 errors; the 8 warnings are in old migrations.
- `npm run typecheck`: clean.
- Prettier clean on both files.
- Matrix audit: every row has a passing test.

**Residual risks.** None known. Callers that do not bound their state leak memory in the process, by design (AD-12 puts bounding on the caller).
