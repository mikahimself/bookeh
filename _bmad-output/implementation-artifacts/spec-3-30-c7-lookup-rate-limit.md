---
title: 'Story 3.30: [C7] Lookup rate limit'
type: 'feature'
created: '2026-10-19'
baseline_revision: 'f0a69b3e50d55c221408beaa463887e78146f513'
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

**Problem:** `lookupBook` has no limit, so a runaway client (a scanner stuck in a loop, a script with a session cookie) can make Finna and Google Books requests in the user's name as fast as it can (FR-11, NFR-5's Phase 1 item). The spine wants one per-user limit, in process, that `lookupBook`, `searchBooks` (I10) and `lookupAgain` share (AD-9, AD-12).

**Approach:** Add a per-user fixed-window counter in `src/lib/catalogue/lookupLimit.ts`, held through `processState`, whose `limitLookups(ctx)` throws `DomainError('RATE_LIMITED')` once the user is over the limit. `lookupBook` calls it right after normalising the ISBN. Add `RATE_LIMITED` to `ErrorCode` with the UX copy in both catalogues.

## Boundaries & Constraints

**Always:**
- `src/lib/catalogue/lookupLimit.ts` exports `LOOKUP_LIMIT = 30`, `LOOKUP_WINDOW_MS = 60_000` and `limitLookups(ctx: Context): void`. Doc comments cite AD-9, AD-12 and FR-11, and say `searchBooks` and `lookupAgain` call it too.
- State is one `Map<number, { count: number; resetAt: number }>` keyed by `ctx.user.id`, from `processState('catalogue.lookupLimit', ...)`. Time is `Date.now()`.
- A call starts a new window (`count: 1`, `resetAt: now + LOOKUP_WINDOW_MS`) when the user has no entry or the entry's `resetAt <= now`. Otherwise it increments `count` and throws when `count > LOOKUP_LIMIT`. A refused call does not move `resetAt`.
- Bounded (AD-12): each call first deletes every entry whose `resetAt <= now`, so the map holds only users active within the last window.
- Every role is limited, the admin included.
- In `lookupBook`: `normaliseIsbn` stays first (an invalid ISBN fails `INVALID_ISBN` and is not counted), then `limitLookups(ctx)`, then everything else unchanged. A refused call reads nothing and calls no source.
- `RATE_LIMITED` is added to `ErrorCode` in `src/lib/errors.ts`; `messages/en.json` `errors.RATE_LIMITED` = "Too many lookups. Wait a moment." (EXPERIENCE.md, Too many lookups), `messages/fi.json` `errors.RATE_LIMITED` = "Liikaa hakuja. Odota hetki."

**Never:**
- No `searchBooks`, `lookupAgain`, toast or surface code (D16+, I10). No persistence or table, no Redis (AD-12). No per-source or global limit; no change to `lookupSources`, its cache or breaker. No sliding window or token bucket. No env var for the numbers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Within the limit | User C makes 30 lookups of a valid unknown ISBN within a minute, `lookupSources` faked `none` | Each returns `{ kind: 'none' }` | No error expected |
| Over the limit | C's 31st lookup in the same window | Rejects; `lookupSources` not called for it | `DomainError('RATE_LIMITED')` |
| Per user | User D looks up while C is limited | D's answer as normal | No error expected |
| Reset | `Date.now()` moves past C's `resetAt` | C's next lookup answers normally | No error expected |
| Invalid ISBN | C, limited or not, sends `'12345'` | Not counted | `DomainError('INVALID_ISBN')` |

</intent-contract>

## Code Map

- `src/lib/catalogue/lookupBook.ts:58-60` -- `lookupBook`: `normaliseIsbn` is the first line; insert `limitLookups(ctx)` right after it. 3.29 is changing this file in parallel (adds `matches`); keep the edit to one import and one line so the rebase stays trivial.
- `src/lib/processState.ts:22` -- `processState(key, init)`: the only home for in-process state; the caller bounds it.
- `src/lib/undo/undo.ts:24-40` and `src/lib/metadata/lookup.ts:10-45` -- house style for in-process stores: exported tuning constants, a `const store = () => processState('<area>.<name>', () => new Map())` accessor, pruning on write.
- `src/lib/errors.ts:6-13` -- `ErrorCode` union; `DomainError(code)`. `runAction`/`runRoute` already map a `DomainError` to `{ ok: false, code }`, so nothing else changes there.
- `messages/en.json:65-73`, `messages/fi.json:65-73` -- `errors` catalogues; `tests/unit/messages.unit.spec.ts` requires both to carry the same keys.
- `src/lib/payload/context.ts:18` -- `Context = { req; user: TypedUser; transactionID? }`; `ctx.user.id` is the key.
- `eslint.config.mjs:20-22` -- `lib/catalogue` may import `errors`, `processState`, `payload` (for the `Context` type): no lint change.
- `tests/int/lookupBook.int.spec.ts:24,48-104` -- the existing suite: `vi.mock('@/lib/metadata/lookup')`, `createUser`, `contextFor`, `randomIsbn`. Its users A, B and admin make about ten lookups each, well under 30; the new test uses its own users so the shared in-process counter cannot couple tests.

## Tasks & Acceptance

**Execution:**
- `src/lib/errors.ts` -- add `'RATE_LIMITED'` to `ErrorCode`.
- `messages/en.json`, `messages/fi.json` -- add `errors.RATE_LIMITED` with the copy above.
- `src/lib/catalogue/lookupLimit.ts` -- new: constants and `limitLookups(ctx)` per Always.
- `src/lib/catalogue/lookupBook.ts` -- call `limitLookups(ctx)` after `normaliseIsbn`; one doc-comment line naming the limit (AD-9).
- `tests/int/lookupBook.int.spec.ts` -- one new `it` for the matrix: fresh users C and D, `lookupSources` faked `none`, 30 calls pass, the 31st rejects `RATE_LIMITED` with no extra source call, D still answers, an invalid ISBN rejects `INVALID_ISBN` while C is limited, then `vi.setSystemTime` past the window (fake `Date` only: `vi.useFakeTimers({ toFake: ['Date'] })`, restored with `vi.useRealTimers()` in `finally`) and C answers again.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-30-c7-lookup-rate-limit` status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (0 lint errors).
- Given `lookupBook` and a user over `LOOKUP_LIMIT` lookups in `LOOKUP_WINDOW_MS`, when they look up again, then it fails with `RATE_LIMITED` and a server action wrapping it in `runAction` would return `{ ok: false, code: 'RATE_LIMITED' }`.
- Given `src/lib/catalogue/lookupLimit.ts`, when inspected, then its only state comes from `processState` and expired entries are deleted on every call.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 8, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: a refused lookup logs nothing, so a runaway client is invisible server-side. True; on the tailnet with one user a looping client shows itself at once on the Scan screen, and a once-per-window log needs a new branch and the logger in the limiter.
  - `[low]` `[patch]` blind: no test proves a refused call leaves `resetAt` alone; every call ran at one frozen instant. Same root cause as the verification-gap row. Patched: the refused call runs at `t0 + LOOKUP_WINDOW_MS - 1` and the reset is checked at `t0 + LOOKUP_WINDOW_MS`.
  - `[false]` `[reject]` blind: `RATE_LIMITED` goes out as HTTP 200 with no `Retry-After`. The spine's Errors convention fixes `runRoute` at 200 with the code in the `ActionResult` body (401 only for `UNAUTHENTICATED`), and `lookupBook` has no route: AD-10 renders the Answer in the `/scan` server component. The client helper reads the code, not the status.
  - `[low]` `[reject]` blind: the in-process counter is shared across the test file; more tests for users A/B could hit 30. A makes about ten lookups; 20 more would be needed, and the failure would name `RATE_LIMITED`, so its cause is plain. A reset hook guards a state not demonstrated.
  - `[low]` `[patch]` blind: doc comments say in the present tense that `searchBooks` and `lookupAgain` call `limitLookups()`; neither exists. Patched: both comments now say `lookupBook` calls it and `searchBooks` (I10) and `lookupAgain` must when they arrive.
  - `[low]` `[reject]` blind: every Answer render (In-library, `?pick=`, refresh, prefetch) costs a lookup. True and chosen in Design Notes (the limit is on the service; `lib/metadata` must not know the user); 30 a minute leaves room for picks and refreshes, and Next prefetches only the loading boundary of a dynamic page by default.
  - `[false]` `[reject]` blind: a future `{ bookId }` target (I12) could skip the limit. No such branch exists in this diff; the bad outcome needs code not yet written, which I12's own review owns.
  - `[low]` `[reject]` edge: a backward wall-clock jump leaves `resetAt` far ahead and refuses the user past one window. Real only after a large backward jump (NTP corrects by slewing); the guard adds a branch, and `lib/metadata`'s cache and breaker share the same `Date.now()` assumption.
  - `[false]` `[reject]` edge: `runRoute` maps `RATE_LIMITED` to 200, not 429. Same refutation as the blind row: spine-fixed status contract, no route reaches `lookupBook`.
  - `[low]` `[patch]` verification-gap: refused-call-moves-`resetAt` regression undetected (pre-verified). Same root cause and patch as the blind test row.
  - `[false]` `[reject]` intent (R2): the purpose names Finna and Google, the diff limits at the service entry. The AC is "Given `lookupBook`" and the spine puts one limit on `lookupBook`, `searchBooks` and `lookupAgain`; counting only source calls would need `lib/metadata` to know the user.
  - `[false]` `[reject]` intent (R3): no toast reaches the Scan screen. The story's AC ends at `RATE_LIMITED`; the toast belongs to the Answer surface stories (D16+), and the copy is in both catalogues for them.
  - `[false]` `[reject]` intent: the AC's `runAction` mapping is not tested here. `runAction` maps any `DomainError` to its code generically, already covered by the errors tests; nothing new to verify.
  - `[low]` `[patch]` intent: "shared with search" exists only as a callable function, with present-tense comments. Same root cause and patch as the blind doc-comment row.
  - `[false]` `[reject]` intent: pruning of expired windows is not checked. The final reset assertion depends on the pruning loop: there is no other `resetAt` check, so removing it fails the test.
  - `[false]` `[reject]` intent: the spec file is not in the reviewed patch. By design: the spec is the claims file, kept out of the diff the layers read.

## Design Notes

**Numbers.** 30 per user per minute. A person scanning in a shop or at a shelf manages one book every few seconds, and an edition pick (`?pick=`) re-renders the Answer, which is another `lookupBook`; 30 leaves room for both. A client in a loop is stopped within its first second, and at worst sends Finna and Google one request each every two seconds. On the tailnet there is one user; the numbers are constants, retuned in code (spine Deferred: rate-limit numbers are set in this story).

**Fixed window.** The AC asks for "the limit and its reset"; a window with `resetAt` is that, in a few lines. It lets a client through 60 calls across a window edge, which is fine for this purpose.

**Every lookup counts**, including an In-library answer that asks no source: the spine puts the limit on the service, and a limit only on source calls would need `lookupSources` to know the user, which the `lib/metadata` layer must not (no database, no user). An invalid ISBN is not counted, so 3.28's "normalise first" holds unchanged.

```ts
export function limitLookups(ctx: Context): void {
  const now = Date.now()
  const store = windows()
  for (const [userId, { resetAt }] of store) if (resetAt <= now) store.delete(userId)
  const current = store.get(ctx.user.id)
  if (!current) return void store.set(ctx.user.id, { count: 1, resetAt: now + LOOKUP_WINDOW_MS })
  if (++current.count > LOOKUP_LIMIT) throw new DomainError('RATE_LIMITED')
}
```

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass (`messages` checks the new key in both catalogues).
- `npm run test:int` -- expected: all pass, the new `lookupBook` test included (Postgres on `DATABASE_URL`, here `localhost:5439`).

## Auto Run Result

**Summary.** Lookups are limited per user. `src/lib/catalogue/lookupLimit.ts` holds one fixed window per user (`LOOKUP_LIMIT = 30` per `LOOKUP_WINDOW_MS = 60_000`) in `processState('catalogue.lookupLimit')`. `limitLookups(ctx)` deletes expired windows on every call (AD-12 bound), counts the call, and throws `DomainError('RATE_LIMITED')` once the user is over the limit, without moving the window's reset. Every role is limited. `lookupBook` calls it right after `normaliseIsbn`, so an invalid ISBN is not counted and a refused call reads nothing and asks no source. `RATE_LIMITED` is a new `ErrorCode` with "Too many lookups. Wait a moment." / "Liikaa hakuja. Odota hetki.". `searchBooks` (I10) and `lookupAgain` must call the same function when they arrive.

**Files changed.**
- `src/lib/catalogue/lookupLimit.ts` -- new: constants and `limitLookups(ctx)`.
- `src/lib/catalogue/lookupBook.ts` -- one import, one call after `normaliseIsbn`, one doc-comment line.
- `src/lib/errors.ts` -- `RATE_LIMITED` in `ErrorCode`.
- `messages/en.json`, `messages/fi.json` -- `errors.RATE_LIMITED`.
- `src/app/(frontend)/components/toast/flashCookie.ts`, `tests/unit/messages.unit.spec.ts` -- `RATE_LIMITED: true` in the exhaustive `Record<ErrorCode, true>` lists (forced by the type; outside the Code Map).
- `tests/int/lookupBook.int.spec.ts` -- one test over the matrix: limit, refusal without a source call, per user, invalid ISBN while limited, refusal at the window's last instant leaving the reset in place, reset.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.30 done.

**Review.** 16 findings (low 8, false 8). Patched 2 entries (low 2): the rate-limit test now makes the refused call at `t0 + LOOKUP_WINDOW_MS - 1` and checks the reset at `t0 + LOOKUP_WINDOW_MS`, so a refusal that moved `resetAt` would fail it; the doc comments no longer claim `searchBooks` and `lookupAgain` already call the limiter. Deferred 0. Rejected:
- No log line on refusal: one tailnet user sees a loop at once; a per-window log adds a branch and the logger.
- HTTP 200 instead of 429 (two rows): the spine fixes `runRoute`'s statuses, and no route reaches `lookupBook` (AD-10).
- Shared counter across the test file: about 20 more lookups as one user would be needed, and the failure names its cause.
- Every Answer render counts: chosen in Design Notes; 30 a minute leaves room.
- `{ bookId }` bypass and backward clock jump: the first needs code not yet written; the second a large backward jump, with a branch to guard it, and the metadata cache shares the assumption.
- Intent audit rows: the AC names `lookupBook`; the toast belongs to D16+; `runAction`'s generic mapping is already tested; the reset assertion depends on the pruning; the spec is the claims file by design.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 2.

**Verification** (worktree `story-3-30-lookup-rate-limit`, Postgres on `localhost:5439`, after the patches).
- `npx eslint src tests`: 0 errors (36 pre-existing warnings).
- `npm run typecheck`: clean.
- `npm run test:unit`: 30 files, 521 passed. One run failed in the untouched `tests/unit/scanScreen.unit.spec.ts` (zxing "Couldn't create canvas"); it passed alone three times and in the next full run, so it is a pre-existing flake under parallel load.
- `npm run test:int`: 31 files passed, 1 skipped (`migrationSchema`), 242 tests; the rate-limit test included.
- Matrix audit: every row is asserted in the one rate-limit test, which ran and passed.
- Playwright not run (service story, no UI).

**Residual risks.** The counter is per process and lost on restart (AD-12). Every `lookupBook` call counts, including In-library answers and `?pick=` re-renders, so the Answer surface stories should not prefetch Answer URLs. Built in a worktree beside 3.29, which also edits `lookupBook.ts` (adds `matches`) and the adjacent `sprint-status.yaml` line; whichever merges second rebases (keep both as `done`). No schema change, so no migration or type regeneration after the rebase.
