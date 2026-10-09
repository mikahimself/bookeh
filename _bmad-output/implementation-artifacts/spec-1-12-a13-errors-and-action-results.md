---
title: 'Story 1.12 [A13] Errors and action results'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '4c39d877250bf9ddbeff7b50dbc4ffcc681e33a4'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      runAction/runRoute map Payload errors by instanceof, proven only against hand-built error instances.
    evidence: |-
      tests/unit/errors.unit.spec.ts constructs Forbidden, NotFound and ValidationError directly. Whether errors thrown by real Local API calls inside the Next server bundle pass the instanceof checks is unproven. Settle with the first integration test that drives a real action through runAction() (Story 1.16 or 1.22).
    location: >-
      src/lib/errors.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** The spine's Errors convention has no code yet: server actions and `/data` route handlers (Stories 1.16, 1.17, 1.22 and on) have no shared way to turn a thrown error into a known `errors.<CODE>` result, so each would invent its own mapping and leak Payload errors to the user.

**Approach:** Add `src/lib/errors.ts` exporting `ErrorCode`, `DomainError`, `ActionResult<T>`, `runAction()` and `runRoute()`. Both wrappers share one mapping from a thrown value to a failed `ActionResult`; `runRoute()` wraps that result in a JSON `Response`. Unit tests cover every mapping.

## Boundaries & Constraints

**Always:**
- `errors.ts` imports nothing from the project (no `@/`, no relative import). Package imports (`payload`, `next/navigation`, `pino`) are allowed. The existing `import/no-restricted-paths` zone enforces this.
- `ErrorCode` holds only the codes this story produces: `'UNAUTHENTICATED' | 'NOT_FOUND' | 'VALIDATION' | 'INTERNAL'`. Later stories add theirs (`INVALID_ISBN`, `UNDO_FAILED`, `NAME_TAKEN`, …) to the union.
- `ActionResult<T>` is the spine shape verbatim: `{ ok: true; data: T } | { ok: false; code: ErrorCode; fields?: Record<string, ErrorCode>; conflictId?: number }`.
- Next.js control-flow errors (`redirect()`, `notFound()`, dynamic-usage bailouts) pass through both wrappers untouched: call `unstable_rethrow(err)` from `next/navigation` first in the catch.
- `INTERNAL` writes exactly one error log line with the original error (`{ err }`); no other mapping logs.
- `runRoute()` always sets `Cache-Control: no-store`.

**Never:**
- No `console.*`. No client-side fetch helper, no `NO_CONNECTION`, no message strings or i18n (Stories 1.14, 1.17 and the Scan stories own those).
- No HTTP status other than 401 and 200 from `runRoute()`: the spine names only 401; the code lives in the body.
- No leaking of error messages or stacks into the result.

## I/O & Edge-Case Matrix

| Scenario | Thrown / returned by `fn` | `runAction()` result | `runRoute()` response |
|----------|---------------------------|----------------------|-----------------------|
| Success | returns `v` | `{ ok: true, data: v }` | 200, body `{ ok: true, data: v }` |
| Domain error | `new DomainError('UNAUTHENTICATED')` | `{ ok: false, code: 'UNAUTHENTICATED' }` | 401, same body |
| Domain error with extras | `new DomainError('VALIDATION', { fields: { name: 'VALIDATION' }, conflictId: 7 })` | failure carrying `fields` and `conflictId` | 200, same body |
| Payload `Forbidden` | `new Forbidden()` | `{ ok: false, code: 'NOT_FOUND' }` | 200 |
| Payload `NotFound` | `new NotFound()` | `{ ok: false, code: 'NOT_FOUND' }` | 200 |
| Payload `ValidationError` | errors on paths `email`, `displayName` | `{ ok: false, code: 'VALIDATION', fields: { email: 'VALIDATION', displayName: 'VALIDATION' } }` | 200 |
| Other `APIError` / `Error` / non-Error | `new APIError('x', 400)`, `new Error('boom')`, `'str'` | `{ ok: false, code: 'INTERNAL' }`, one log line | 200, one log line |
| Next control flow | `redirect('/x')` | rethrown, no log | rethrown, no log |

</intent-contract>

## Code Map

- `src/lib/errors.ts` -- new. First file under `src/lib`. Already targeted by the "imports nothing from the project" zone in `eslint.config.mjs` (`importZones`, target `src/lib/errors.ts`).
- `node_modules/payload/dist/errors/*.d.ts` -- `Forbidden`, `NotFound`, `ValidationError`, `APIError` are exported from `payload`. `ValidationError.data.errors` is `{ path: string; message: string; … }[]`.
- `node_modules/payload/dist/utilities/logger.js` -- with no `logger` in config, Payload builds `payload.logger` as `pino(defaultLoggerOptions)`. `defaultLoggerOptions` is exported from `payload`; `src/payload.config.ts` sets no `logger`.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/unstable_rethrow.md` -- rethrow at the top of the catch.
- `package.json` -- `pino` is only a transitive dependency (9.14.0 via payload); add it as a direct dependency at the same exact version.
- `tests/unit/access.unit.spec.ts` -- style reference for unit specs (`describe.each`, `@/` imports).

## Tasks & Acceptance

**Execution:**
- `package.json`, `package-lock.json` -- add `"pino": "9.14.0"` to `dependencies` via `npm install pino@9.14.0 --save-exact` -- `errors.ts` imports it directly; must dedupe with Payload's copy.
- `src/lib/errors.ts` -- create with `ErrorCode`, `DomainError` (`code`, optional `fields`, `conflictId`; `name = 'DomainError'`), `ActionResult<T>`, a private `toFailure(err, where)` mapping, a lazily built logger `pino(defaultLoggerOptions)`, `runAction<T>(fn: () => Promise<T>): Promise<ActionResult<T>>` and `runRoute<T>(fn: () => Promise<T>): Promise<Response>` -- the spine's Errors convention.
- `tests/unit/errors.unit.spec.ts` -- create. Run every matrix row through both wrappers (`describe.each`). Mock `pino` with `vi.mock` so the logger's `error` is a spy: once per `INTERNAL`, never otherwise. Assert `runRoute()` status, `Cache-Control: no-store`, `content-type` JSON and body. Assert `redirect()` from `next/navigation` is rethrown by both.

**Acceptance Criteria:**
- Given `src/lib/errors.ts`, when `npm run lint` runs, then it passes, and the file's only imports are `payload`, `next/navigation` and `pino`.
- Given the unit lane, when `npm run test:unit` runs, then every matrix row passes for both wrappers.
- Given the whole project, when `npm run typecheck` runs, then it is clean.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 29 findings — high 0, medium 0, low 17, false 11, maybe-false 1
- findings:
  - `[low]` `[patch]` `DomainError('INTERNAL')` returns INTERNAL without a log line, against the spec's "exactly one log line" — patched: log whenever the resulting code is `INTERNAL`; test row added. `cause` on `DomainError` rejected: new public surface with no caller yet.
  - `[false]` `[reject]` Payload `UnauthorizedError`/`AuthenticationError` fall through to INTERNAL — the epic AC says "anything else to INTERNAL"; the expired-session path is `requireUserOrThrow()`'s `DomainError('UNAUTHENTICATED')` (Story 1.11), and sign-in (1.16) maps a wrong password in its own code.
  - `[low]` `[reject]` `runRoute()` loses `T`; `void`/`Date`/`Map`/`bigint` data does not round-trip and `Response.json` throws outside `settle()` — no handler exists; Payload rows are JSON-safe; fixing means type constraints or another guarded branch for a case not seen in use.
  - `[false]` `[reject]` Client code can value-import `errors.ts` and pull Payload/pino into the bundle — the `bookeh/client-lib-imports` ESLint rule already rejects any non-type import from `src/lib` in a `'use client'` file.
  - `[low]` `[reject]` INTERNAL log line does not name the failing action/route — the logged `err` carries the stack; a label parameter adds public surface.
  - `[low]` `[patch]` Empty `ValidationError` branch untested (blind) — patched with a row asserting no `fields` key. Nested/duplicate paths and `DomainError` with `fields: {}` rejected: keys pass through unchanged, and an empty `fields` on a hand-built `DomainError` is a caller choice.
  - `[low]` `[patch]` Logger construction unverified (blind) — patched: tests assert `pino` is not built before the first INTERNAL and is built once with `defaultLoggerOptions`. The "options" wording sits in the spec; rejected.
  - `[low]` `[patch]` Only `redirect()` tested as control flow — patched: `notFound()` rethrow test through both wrappers.
  - `[false]` `[reject]` Payload `UnauthorizedError`/`AuthenticationError`/`LockedAuth`/`UnverifiedEmail` become INTERNAL (edge) — same refutation as the blind row: the AC maps anything else to INTERNAL.
  - `[low]` `[reject]` Unserialisable data (`bigint`, circular) makes `Response.json` throw outside `settle()` (edge) — same as the blind `runRoute()` row: no handler, JSON-safe Payload data, fix adds a guarded branch.
  - `[low]` `[reject]` `runRoute<T>` claims `T` while `Date`/`Map` arrive as strings/`{}` (edge) — the return type is `Response`, not `T`; the client helper (A25) owns the parsed type.
  - `[low]` `[reject]` ValidationError entry with an empty path yields a `''` key (edge) — Payload sets a field path on field errors; a guard for an unshown state.
  - `[low]` `[reject]` `DomainError` with `fields: {}` passes an empty object while an empty ValidationError omits `fields` (edge) — rare, caller-made; fix adds a guard.
  - `[low]` `[reject]` Logger construction throwing inside the catch makes `runAction` reject (edge) — pino with a stream does not throw on build; a try/catch around logging hides real faults.
  - `[low]` `[patch]` Empty ValidationError branch untested (edge) — same patch as above.
  - `[low]` `[reject]` `DomainError` with only `fields` or only `conflictId` untested (edge) — two independent `if` assignments; no coupling to catch.
  - `[low]` `[patch]` Empty ValidationError branch untested (verification-gap) — same patch as above.
  - `[low]` `[patch]` Logger fully mocked, construction unverified (verification-gap) — same patch as above.
  - `[false]` `[reject]` Intent 3a: no user-facing message, client helper or toast — the epic's ACs define a library; messages (1.14), toasts (1.17) and the client helper (A25) are other stories.
  - `[low]` `[reject]` Intent 3b: logs through a pino built like Payload's, not `payload.logger` itself — identical output while `payload.config.ts` sets no `logger`; recorded in Design Notes; the spine's import rule leaves no direct path to `payload.logger`.
  - `[false]` `[reject]` Intent 3c: rethrowing Next control flow contradicts "actions never redirect" — that rule binds action authors; swallowing `redirect()`/dynamic bailouts would break Next itself.
  - `[maybe-false]` `[defer]` Intent 3d: tests use hand-built Payload errors, so `instanceof` against errors from real Local API calls inside the Next bundle is unproven — settle with the first integration test that drives a real action through `runAction()` (Story 1.16 or 1.22). Medium if true.
  - `[false]` `[reject]` Intent 3e: no route handler exercises `runRoute()` — none is in scope; the first `/data` handlers come in Epic 5.
  - `[false]` `[reject]` Intent 3f: 200 for non-401 failures is stricter than the text — the spine names only 401 and puts the code in the body; consistent with server actions.
  - `[false]` `[reject]` Intent 3g: sprint status not advanced, nothing committed — finalize commits; sprint status lives on `main`, where 1.8 is in flight, and is updated at merge.
  - `[false]` `[reject]` Intent 3h: scope additions (leak test, `pino` dependency, four-code union) — not defects.
  - `[false]` `[reject]` Intent R4: "1.12" could mean slice A12 — epics.md maps Story 1.12 to A13.
  - `[false]` `[reject]` Blind: `void` body serialises without a `data` key — `data: undefined` and a missing key read the same in JS; covered by the `runRoute` row above otherwise.
  - `[low]` `[reject]` Blind: nested `ValidationError` paths (`authors.0.name`) untested — passed through as keys unchanged; forms match on the same path.

## Design Notes

**Logger.** The spine says log through `payload.logger`, but `errors.ts` may import nothing from the project, so it cannot reach `@payload-config` or `getPayload()`. Payload's own logger is `pino(defaultLoggerOptions)` when the config sets none, so `errors.ts` builds the same thing from Payload's exported options. Built lazily on first `INTERNAL`, so importing the module has no side effect. If `payload.config.ts` ever sets `logger`, revisit this.

**Status codes.** `runRoute()` mirrors server actions: transport succeeds, the body carries the code. Only `UNAUTHENTICATED` gets its own status (401), so the future client helper can send the user to sign-in.

```ts
export async function runRoute<T>(fn: () => Promise<T>): Promise<Response> {
  const result = await settle(fn, 'route')
  const status = !result.ok && result.code === 'UNAUTHENTICATED' ? 401 : 200
  return Response.json(result, { status, headers: { 'Cache-Control': 'no-store' } })
}
```

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors (the 3 pre-existing warnings may remain)
- `npm run typecheck` -- expected: clean
- `npm run test:unit` -- expected: all pass, including `errors.unit.spec.ts`

## Auto Run Result

Status: done

**Summary.** `src/lib/errors.ts` implements the spine's Errors convention: `ErrorCode` (`UNAUTHENTICATED`, `NOT_FOUND`, `VALIDATION`, `INTERNAL`), `DomainError` (code, optional `fields` and `conflictId`), `ActionResult<T>` as in the spine, and `runAction()` / `runRoute()` over one shared mapping. Next.js control flow is rethrown through `unstable_rethrow`. Every `INTERNAL` result writes one log line through a lazily built `pino(defaultLoggerOptions)`, the same logger Payload builds when the config sets none. `runRoute()` answers JSON with `Cache-Control: no-store`: 401 for `UNAUTHENTICATED`, otherwise 200.

**Files changed**
- `src/lib/errors.ts` — new; the error model and both wrappers.
- `tests/unit/errors.unit.spec.ts` — new; every matrix row through both wrappers, plus the logger's construction, a check that no message leaks, and the `redirect()`/`notFound()` rethrow.
- `package.json`, `package-lock.json` — `pino` 9.14.0 as a direct dependency (deduped with Payload's copy).

**Review findings.** 29 findings: 5 patched, 1 deferred, 23 rejected; see Review Triage Log for each reason.
- Patched (all low): `DomainError('INTERNAL')` now logs; tests added for the empty `ValidationError`, the logger's construction (not at import, once, with `defaultLoggerOptions`) and the `notFound()` rethrow. Three reviewers found the same empty-`ValidationError` gap and two the same logger gap, so the log has duplicate rows for both.
- Deferred: `instanceof` against errors thrown by real Payload calls in the Next bundle is unproven (medium, unverified).
- Rejected: see the triage log for each.

**Follow-up review recommended:** false. Patched entries this pass: high 0, medium 0, low 5.

**Verification.** `npm run lint`: 0 errors (the 3 old e2e warnings remain). `npm run typecheck`: clean. `npm run test:unit`: 52 passed, 30 of them in `errors.unit.spec.ts`.

**Residual risks**
- If `payload.config.ts` ever sets a `logger`, `errors.ts` logs elsewhere than `payload.logger`.
- Payload auth errors (`AuthenticationError` and similar) map to `INTERNAL` as the AC says. Sign-in (1.16) must map a wrong password itself.
- `sprint-status.yaml` is not touched on this branch (1.8 changes it on `main`); set 1.12 to done when merging.
