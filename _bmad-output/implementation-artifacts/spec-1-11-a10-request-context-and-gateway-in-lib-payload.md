---
title: 'Story 1.11 [A10] Request context and gateway in lib/payload'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '6f1fe95785217e22181f5b87532f26001ac605fc'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Nothing keeps the new gateway lint bans firing: the src/lib import ban and the .payload member ban are checked only by scratch probes, and npm run lint is green whether or not they work.
    evidence: |-
      tests/ has no RuleTester or ESLint run. A typo in a gatewayExempt glob, a regex slip, a severity change to warn, or a later src/lib block that sets no-restricted-syntax (which replaces these selectors) leaves lint and every test green. Same class as the 1.6 RuleTester entry in deferred-work.md, now extended to name these blocks.
    location: >-
      eslint.config.mjs (gatewayExempt blocks)
    severity: low
  - summary: >-
      Add an e2e test that a signed-out visit to a page calling requireUser() lands on /login?next=<encoded path and search>, with the first protected page and /login in Story 1.16.
    evidence: |-
      Unit and int tests cover proxy() and requireUser() separately (next/headers mocked). The hand-off depends on Next picking up src/proxy.ts and forwarding x-middleware-request-* headers. Verified by hand in 1.11 under next dev with a throwaway page (307 to /login?next=%2Fzz-probe%3Fa%3D1%26b%3Dx%2By; a client-sent header was overwritten), but no committed test keeps it working.
    location: >-
      src/proxy.ts, src/lib/payload/context.ts
    severity: low
  - summary: >-
      A src/lib service that takes a Payload instance as a parameter (type import allowed) calls the Local API with overrideAccess true and passes lint, as seedFirstUser does legitimately.
    evidence: |-
      The src/lib ban covers value imports and .payload member access, not calls on a Payload-typed parameter. src/lib/account/seedFirstUser.ts is the AD-3 seed and allowed; a later account function modelled on it would bypass the gateway. Belongs with the deferred overrideAccess: true ban (1.7 entry in deferred-work.md), at the first allowlisted module.
    location: >-
      eslint.config.mjs, src/lib/account/seedFirstUser.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Nothing yet carries the signed-in user from a request into Payload. Any frontend path or service would have to call the Local API itself, which defaults to `overrideAccess: true` and so bypasses collection access (AD-2). Later stories (1.16 sign-in, 1.22 profile, every service) need one way in.

**Approach:** `src/lib/payload/context.ts` defines `Context` (`{ req, user }`), `requireUser()` (pages: redirect to `/login?next=<path>` without a session) and `requireUserOrThrow()` (actions and route handlers: `DomainError('UNAUTHENTICATED')`). `src/lib/payload/gateway.ts` wraps the Local API in functions that take a context and always pass its `req`, its `user` and `overrideAccess: false`. `src/proxy.ts` gives pages their path through a request header so `requireUser()` needs no argument. Lint stops `src/lib` services from reaching Payload around the gateway.

## Boundaries & Constraints

**Always:** Gateway scope is spread last, so a caller can never override `req`, `user` or `overrideAccess`, and the option types exclude those keys. `user` and `req.user` in a context are the same signed-in user. The redirect target is `/login?next=` plus the URL-encoded pathname and search of the page; `_rsc` is never part of it. With no path header, the target is `/login`. Session lookup goes through `payload.auth({ headers })` (Payload's own strategies and server-side sessions). No caching of the user beyond the call. No `console.*`. Tests never truncate.

**Never:** No `withTransaction` or Drizzle helper (Story 3.10 / A11), no `Ref` type, no `/login` page or sign-in action (1.16), no change to `src/app/(frontend)/page.tsx` or any page (the template home stays public until 1.16/1.19), no `lib/account` profile functions (1.22). No bulk (`where`-based) update or delete in the gateway. No context builder exported from `src/lib` (a builder with an arbitrary user would be an impersonation backdoor); tests build contexts in `tests/helpers/harness.ts`. No `overrideAccess: true` syntax ban and no frontend import ban in this story (see Design Notes).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Page, signed in | valid `payload-token` cookie | `requireUser()` returns `{ req, user }`; `req.user.id === user.id` | N/A |
| Page, signed out | no/expired/garbage cookie; header `x-bookeh-path: /settings?a=1` | redirect to `/login?next=%2Fsettings%3Fa%3D1` | Next.js redirect error (not caught) |
| Page, signed out, no header | no cookie, no `x-bookeh-path` | redirect to `/login` | as above |
| Action/route, signed in | valid cookie | `requireUserOrThrow()` returns the context | N/A |
| Action/route, signed out | no cookie | throws `DomainError` with code `UNAUTHENTICATED` (→ 401 via `runRoute`) | caller's `runAction`/`runRoute` maps it |
| Gateway read across users | ctx of A; `findByID` of B's `users` id | rejects (`NotFound`, which `runAction` maps to `NOT_FOUND`) | propagates |
| Gateway list across users | ctx of A; `find` users with `where id = B` | `docs: []`; unfiltered `find` returns only A | N/A |
| Caller tries to escalate | ctx of A; options cast to include `overrideAccess: true` and `user: B` | ignored: same result as without them | N/A |
| Proxy | `GET /settings?a=1&_rsc=x` | request header `x-bookeh-path: /settings?a=1` forwarded upstream; client-sent value overwritten | N/A |

</intent-contract>

## Code Map

- `src/lib/payload/context.ts` -- new. `Context = { req: PayloadRequest; user: TypedUser }`. Builds with `getPayload({ config })` from `@/payload.config`, `headers()` from `next/headers` (async in Next 16), `payload.auth({ headers })` (returns `{ user: TypedUser | null }`), then `createLocalReq({ user }, payload)` (exported from `payload`; sets `req.user`). `redirect()` from `next/navigation`. `DomainError` from `@/lib/errors`.
- `src/lib/payload/gateway.ts` -- new; a typed prototype already exists in the tree (find/findByID/updateByID) and typechecks. Pattern: generic `<S extends CollectionSlug, Sel extends TypedCollectionSelect[S]>` (Payload does not export `SelectFromCollectionSlug` or most `*Options` types; `TypedCollectionSelect` and `CollectionSlug` are exported), options typed `Scoped<Parameters<typeof ctx.req.payload.find<S, Sel>>[0]>` where `Scoped` is a distributive `Omit` of `req | user | overrideAccess`. Proven: slug narrowing works (`docs[0].displayName: string`), `overrideAccess` in options is a type error. `update`/`delete` are overloaded; `Parameters` takes the last overload (by-ID in `node_modules/payload/dist/index.d.ts:452-465`) and `& { id: number }` pins it.
- `src/proxy.ts` -- new. Next 16 renamed `middleware` to `proxy` (`node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`): export `proxy(request: NextRequest)` and `config.matcher`. Forward headers with `NextResponse.next({ request: { headers } })` (not `{ headers }`, which leaks to the client).
- `src/lib/errors.ts` -- read-only. `DomainError('UNAUTHENTICATED')`; `runRoute` answers 401 for it.
- `src/access/asRequestUser.ts` -- read-only; same `{ req, user, overrideAccess: false }` shape for hooks. Not reused by the gateway (the gateway passes the context user, not `req.user`; they are equal by construction).
- `src/collections/Users.ts` -- read-only. `read`/`update`: admin or self (`where id = user.id`); `create`/`delete`: admin only. Enough to prove scoping with two `user`-role users.
- `eslint.config.mjs` -- the `serviceImports` zones, the roles `no-restricted-syntax` block (`files: ['src/**']`, a later block setting the same rule replaces its selectors), the `lib/metadata` `no-restricted-imports` block, and the frontend `lib/payload` import block (already allows `requireUser`, `requireUserOrThrow` and types; regex `/lib/payload(/|$)` matches `@/lib/payload/context`).
- `tests/helpers/harness.ts` -- `createUser()`, `as(user)`; add `contextFor(user)`.
- `vitest.config.mts` -- unit lane has no DB; int lane runs `vitest.setup.ts` (rewrites to `bookeh_test`), `fileParallelism: false`.
- `tests/int/asRequestUser.int.spec.ts` -- int style reference.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the 1.6 entry "In Story 1.11 (gateway), ban direct Payload access outside `lib/payload`" (partly done here) and the 1.7 entry on an `overrideAccess: true` ban.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/payload/context.ts` -- `Context`, `requireUser()`, `requireUserOrThrow()` per the I/O Matrix, reading the path header named by `PATH_HEADER`. Doc comments cite AD-2 and AD-16.
- [x] `src/lib/payload/pathHeader.ts` -- `export const PATH_HEADER = 'x-bookeh-path'`, nothing else, so the proxy can import it without pulling in the Payload config.
- [x] `src/lib/payload/gateway.ts` -- `find`, `findByID`, `count`, `create`, `updateByID`, `deleteByID`, each `(ctx, options)` spreading options first and the scope last. One doc comment: the only Payload entry for frontend-reachable code (AD-2); services use it as `import * as gateway from '@/lib/payload/gateway'`.
- [x] `src/proxy.ts` -- set `x-bookeh-path` to `pathname + search` with `_rsc` removed, overwriting any client value; matcher excludes `api`, `admin`, `_next/static`, `_next/image` and paths with a file extension. Header name from `@/lib/payload/pathHeader`.
- [x] `eslint.config.mjs` -- for `src/lib/**` except `lib/payload`, `lib/catalogue`, `lib/shelf` (AD-3/AD-7 allowlist) and `lib/metadata` (has its own stricter block): `@typescript-eslint/no-restricted-imports` of `@/payload.config`, `@payload-config`, `drizzle-orm`, `@payloadcms/db-postgres`, `@/collections/*`, and `getPayload`/`createLocalReq` from `payload` (type imports allowed). For the same files plus `src/app/(frontend)/**`: `no-restricted-syntax` adding `MemberExpression[property.name='payload'][computed=false]` (no `ctx.req.payload.*` around the gateway), keeping the roles selectors (extract them to a constant).
- [x] `tests/helpers/harness.ts` -- `contextFor(user): Promise<Context>` via `createLocalReq`.
- [x] `tests/int/gateway.int.spec.ts` -- two `user`-role users A and B; with A's context: `findByID` B rejects; `find` with `where id = B` is empty and unfiltered `find` returns only A; `count` is 1; `updateByID` B rejects and B is unchanged; `create` a user rejects (`Forbidden`); `deleteByID` A rejects; with options cast to carry `overrideAccess: true` and `user: B`, `find` still returns only A.
- [x] `tests/int/context.int.spec.ts` -- `vi.mock('next/headers')` to return a chosen `Headers`; a real session from `payload.login` as the `payload-token` cookie. Cover every context row of the I/O Matrix; assert the redirect through the error's `digest` URL.
- [x] `tests/unit/proxy.unit.spec.ts` -- the Proxy row: forwarded header value (via `x-middleware-request-x-bookeh-path` on the response), `_rsc` dropped, client value overwritten.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- mark the `src/lib` half of the 1.6 entry done; re-target its frontend half to 1.16.

**Acceptance Criteria:**
- Given `src/lib/payload`, when the story is done, then `requireUser()` returns a context with the request and user or redirects to `/login?next=<path>`, and `requireUserOrThrow()` throws `UNAUTHENTICATED` instead of redirecting.
- Given any gateway function, when it is called with a context, then the Local API receives that context's `req`, its `user` and `overrideAccess: false`, whatever the options contain.
- Given a service file under `src/lib/account` that imports `getPayload` or `@/payload.config`, or calls `ctx.req.payload.find`, when lint runs, then it fails; the same code under `src/lib/payload` passes.
- Given the repository, when lint, typecheck, unit and int run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 31 findings — high 0, medium 2, low 23, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` Gateway scope blocks only `req`/`user`/`overrideAccess`; `showHiddenFields: true` returns hidden auth fields (blind) — `Scope` now pins `showHiddenFields: false`; the escalation table asserts no `hash`/`salt`. `overrideLock`, `context` and `disableTransaction` are not access controls and stay open (Local API defaults `overrideLock` to true for good reason).
  - `[low]` `[patch]` `.payload` ban misses `const { payload } = ctx.req` and `ctx.req['payload']` (blind) — added the destructuring and computed selectors, mirroring the roles ones.
  - `[low]` `[reject]` Import ban misses dynamic `import()`, the `collections` regex over-matches a future `lib/x/collections.ts`, code outside `src/lib`/frontend is uncovered (blind) — deliberate evasion is not the threat model for a one-developer codebase; no such file exists; spine has no other server-code location.
  - `[low]` `[reject]` `payload.auth()` computes permissions that are thrown away; no per-request dedupe (blind) — today's access functions are in-memory, so the cost is negligible; memoising is an optimisation to add with the first page that calls `requireUser()` twice.
  - `[low]` `[reject]` Context `req` built from `{ user }` alone, without request headers (blind) — nothing reads `req.headers` or `req.locale` (i18n is next-intl); add headers with the first consumer.
  - `[medium]` `[patch]` Runtime escalation test covers only `find` (blind) — `it.each` over all six functions with `overrideAccess: true`, `user: b`, `showHiddenFields: true`; mutation of `updateByID`'s spread order now fails its row.
  - `[low]` `[patch]` `does not update another user` asserts a bare `toThrow()` (blind) — now asserts `Forbidden`, which is what Payload throws there.
  - `[false]` `[reject]` Nothing hands `next` validation to a later story (blind) — Story 1.16's own AC (epics, Epic 1 context "Sign-in returns to `next` only for a same-origin path") and spine AD-2 already require it.
  - `[low]` `[reject]` Matcher skips paths with a dot, where a client-sent header reaches `requireUser()` (blind) — no page route in the spine's route table has a dot in a segment, and 1.16 validates `next` as same-origin.
  - `[false]` `[reject]` `searchParams.delete('_rsc')` re-serialises the query (blind) — the change is `%20`→`+`, which URLSearchParams and Next decode to the same value (seen under `next dev`: `b=x%20y` → `b%3Dx%2By`).
  - `[low]` `[defer]` No committed test proves the new lint rules fire (blind) — same class as the 1.6 RuleTester deferral; that entry now names these blocks.
  - `[low]` `[reject]` No test for a revoked session or deleted user (blind) — session validity is Payload's JWT strategy, passed through unchanged; garbage and expired tokens already prove the context takes Payload's verdict.
  - `[low]` `[reject]` Proxy matcher dot paths let a spoofed header through (edge) — same as the blind row above.
  - `[low]` `[patch]` `.payload` destructuring/computed bypass (edge) — same patch as the blind row.
  - `[low]` `[reject]` Dynamic `import('payload')` bypass (edge) — same as the blind row above.
  - `[low]` `[patch]` `BasePayload`, `createPayloadRequest`, `reload` importable from `payload` (edge) — added to `importNames`.
  - `[low]` `[patch]` `@payloadcms/drizzle` and `pg` importable (edge) — package regex extended.
  - `[low]` `[patch]` Concurrent gateway calls on one context share `req.transactionID`; one commit or rollback ends the other's (edge) — confirmed in `initTransaction`/`commitTransaction`/`killTransaction`; the gateway doc now says calls on one context run one at a time (AD-16). `withTransaction` (3.10) owns the rest.
  - `[low]` `[reject]` `context`/`depth` options merge into the shared `ctx.req` and leak into later calls (edge) — confirmed in `createLocalReq.js:86,102-104`, but sharing one req is what AD-16 mandates (same as `req` passed through hooks); no caller passes either; a fresh req per call would break transactions.
  - `[low]` `[patch]` `showHiddenFields` passes through (edge) — same patch as the blind row.
  - `[medium]` `[patch]` Spread-last guarantee runtime-tested only for `find` (verification-gap) — same patch as the blind row.
  - `[low]` `[defer]` Gateway lint bans only checked by scratch probe (verification-gap) — deferred with the blind row.
  - `[low]` `[defer]` Proxy → `requireUser()` hand-off never exercised end to end (verification-gap) — verified by hand under `next dev` (throwaway page: 307 to `/login?next=%2Fzz-probe%3Fa%3D1%26b%3Dx%2By`, spoofed header overwritten, `/` still 200); the committed e2e needs the first protected page, deferred to 1.16.
  - `[low]` `[defer]` A service taking a `Payload`-typed parameter bypasses the gateway unnoticed (verification-gap, other) — folded into the 1.7 `overrideAccess: true` lint deferral.
  - `[false]` `[reject]` "User B's document" is tested on `users` only (intent-alignment a) — `users` is the only per-user collection that exists; not a defect.
  - `[low]` `[patch]` Context and gateway never tested together (intent-alignment b) — new int test: real session cookie → `requireUserOrThrow()` → `gateway.find` returns only that user.
  - `[low]` `[reject]` Frontend import ban not done (intent-alignment c) — template `page.tsx` imports `getPayload` until 1.16 replaces it; the ban there would fail lint now; re-targeted to 1.16 in deferred-work.
  - `[low]` `[defer]` `src/lib` ban gaps and untested lint rules (intent-alignment d) — same as the two lint deferrals above.
  - `[false]` `[reject]` Diff reaches beyond `src/lib/payload` with `src/proxy.ts` (intent-alignment e) — descriptive; the AC's argument-free `requireUser()` with `next=<path>` needs the URL from outside the page.
  - `[false]` `[reject]` AD-16 transaction duty absent (intent-alignment f) — STORY-SLICING puts it in A11 (Story 3.10).
  - `[false]` `[reject]` `/login`, `next` validation, page adoption, `overrideAccess` syntax ban absent (intent-alignment g) — all assigned to later stories by the slicing.

## Design Notes

- **Path through a header:** server components cannot read their own URL in Next 16. Passing it into `requireUser(path)` on every page invites copy-paste mistakes and loses search params. The proxy is the one place that knows the URL; it overwrites any client-sent value, and 1.16 still validates `next` as a same-origin path.
- **Context builder lives in the harness:** AD-16 says the seed and tests build contexts with an explicit user. The seed does not need one yet, and an exported builder in `src/lib` would let any service act as any user.
- **Lint scope:** the 1.6 deferral asked 1.11 to stop direct Payload access. `src/lib` is enforced here. The frontend import half waits for 1.16, which replaces the template `page.tsx` that imports `getPayload` today; the `.payload` member ban covers the bypass the context itself opens (`ctx.req.payload`). The `overrideAccess: true` syntax ban (1.7 deferral) stays deferred to the first allowlisted module (`lib/catalogue`), where its exceptions start.

## Verification

**Commands:**
- `npm run lint && npm run typecheck && npm run test:unit && npm run test:int` -- expected: green, the three new specs included.
- Lint probe (scratch, not committed): a file in `src/lib/account/` importing `getPayload` and one calling `ctx.req.payload.find` -- expected: `npm run lint` reports both; removed afterwards.

## Auto Run Result

Status: done

**Summary:** `src/lib/payload` now has the request context and the gateway. `requireUser()` returns `{ req, user }` for a signed-in request, or redirects to `/login?next=<encoded path and search>`. It gets the path from the `x-bookeh-path` header that the new `src/proxy.ts` sets, and redirects to `/login` without one. `requireUserOrThrow()` throws `DomainError('UNAUTHENTICATED')` instead. The gateway's `find`, `findByID`, `count`, `create`, `updateByID` and `deleteByID` each take a context and spread `req`, `user`, `overrideAccess: false` and `showHiddenFields: false` after the caller's options. ESLint stops `src/lib` services, other than the gateway, `catalogue`, `shelf` and `metadata`, from importing Payload, the config, collections or Drizzle, and bans `.payload` access in `src/lib` and `src/app/(frontend)`.

**Files changed:**
- `src/lib/payload/context.ts` -- new; `Context`, `requireUser()`, `requireUserOrThrow()`.
- `src/lib/payload/gateway.ts` -- new; six scoped Local API wrappers.
- `src/lib/payload/pathHeader.ts` -- new; `PATH_HEADER`, so the proxy does not load the Payload config.
- `src/proxy.ts` -- new; forwards the page path and search minus `_rsc`, overwriting any client value.
- `eslint.config.mjs` -- the `src/lib` gateway import ban and the `.payload` member ban; the roles selectors moved into a shared constant.
- `tests/helpers/harness.ts` -- `contextFor(user)`.
- `tests/int/gateway.int.spec.ts`, `tests/int/context.int.spec.ts`, `tests/unit/proxy.unit.spec.ts` -- new.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the 1.6 import-ban entry re-targeted to 1.16 for the frontend half; the RuleTester and `overrideAccess` entries extended; a new 1.16 e2e entry.

**Review findings (31):** 12 rows patched, as 7 fixes (2 medium rows forming one entry, the rest low):
- `showHiddenFields` is pinned.
- The `.payload` destructuring and computed-access selectors are added.
- More `payload` import names, `@payloadcms/drizzle` and `pg` are banned.
- The escalation test runs over all six functions.
- The cross-user update test asserts `Forbidden`.
- A one-at-a-time note covers the shared transaction.
- A test runs `requireUserOrThrow()` and the gateway together.

5 rows deferred, as 3 frontmatter items: lint-rule tests, the 1.16 e2e for the proxy hand-off, and the `Payload`-parameter bypass. 14 rejected, each with its reason in the triage log: dynamic imports and regex reach, auth cost, req headers, the `next` validation already owned by 1.16, dot paths (twice), query re-encoding, revoked sessions, `context`/`depth` leaking on a shared req, the users-only target, the frontend import ban, the proxy's reach, transactions, and later-story items.

**Follow-up review recommended:** false. One patched entry was `medium` (the escalation test coverage, now in place and checked by mutation), and none was `high`. Patched: high 0, medium 1 entry (2 rows), low 6 entries.

**Verification:**
- `npm run lint`: 0 errors (the 7 warnings were already there).
- `npm run typecheck`: clean, after clearing a stale `.next/dev` type entry left by the manual check.
- unit: 106 passed.
- int: 45 passed, 1 skipped (`migrationSchema.int.spec.ts`, which runs only in CI).
- Mutation checks by the implementer: swapping the spread order in `find`, then in `updateByID`, made the matching test fail.
- Lint probes (deleted): reported under `src/lib/account` and for `.payload` in `src/app/(frontend)`, silent under `src/lib/payload`.
- Manual run under `next dev` on port 3011 against `bookeh_test`, with a throwaway page calling `requireUser()`:
  - signed out: 307 to `/login?next=%2Fzz-probe%3Fa%3D1%26b%3Dx%2By`;
  - a client-sent `x-bookeh-path: //evil.example` was replaced by the real path;
  - `/` still answered 200.

**Residual risks:**
- No page calls `requireUser()` yet; 1.16 adds the first one, and the e2e that keeps the proxy hand-off working.
- Calls on one context must not run concurrently until `withTransaction` (3.10) settles transaction handling.
- `next` is not validated here; 1.16's sign-in must accept only a single-slash same-origin path.
