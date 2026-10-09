---
title: 'Story 1.7 [A7] Role helpers and `asRequestUser`'
type: 'chore'
created: '2026-10-09'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** AD-2 says access functions test roles only through named helpers in `src/access`, and AD-3 says hooks and access functions query only through `asRequestUser(req)`. Neither exists, so Story 1.8 (`users`) and every collection after it would read `roles` inline or call the Local API with its default `overrideAccess: true`.

**Approach:** Add `isAdmin(user)` and `canEditShared(user)` (both true only for a user whose `roles` includes `admin`; Phase 1 has no moderator, FR-48) and `asRequestUser(req)`, which returns `{ req, user: req.user, overrideAccess: false }` to spread into a Local API call. Unit tests cover each helper for no user, a `user` and an `admin`. A lint rule bans reading `roles` off an object outside `src/access`, so the AC "no file outside `src/access` reads `user.roles`" stays true after this story.

</frozen-after-approval>

## Implementation Notes

- `users.roles` arrives in Story 1.8, so the generated `User` has no `roles` yet. The helpers take a structural `RoleHolder = { roles?: readonly Role[] | null } | null | undefined` with `Role = 'admin' | 'user'` (spine, Roles convention). Today's `TypedUser` and the 1.8 `User` both fit without a change here.
- Files: `src/access/roles.ts` (`Role`, `isAdmin`, `canEditShared`), `src/access/asRequestUser.ts`. No barrel: the spine names no index, and the 1.6 fixtures imported `@/access/<name>`.
- `asRequestUser` does not throw on a missing user: `user: null` with `overrideAccess: false` lets the access functions deny. The return type is pinned to Payload's `PayloadRequest` and `PayloadRequest['user']`.
- Lint: `no-restricted-syntax` for `src/**` and `tests/**`, ignoring `src/access/**`, on member reads of `roles` (`x.roles`, `x?.roles`, `x['roles']`) and on destructuring `{ roles }`. Object literals that write `roles` (the 1.10 seed) are not member reads and pass.
- Tests: `tests/unit/access.unit.spec.ts` runs `isAdmin` and `canEditShared` for no user (`null`, `undefined`), no roles (`{}`, `roles: null`, `roles: []`), a `user` and an `admin`, and `asRequestUser` for no user, a `user` and an `admin`. `tests/int/asRequestUser.int.spec.ts` proves the spread switches access on: a request without a user is `Forbidden` on `users` (Payload's default access), the same request without the helper reads every user, and a signed-in request reads its own document.
- Lint fixture run (deleted afterwards): `u.roles`, `u?.roles`, `u['roles']`, `({ roles }) =>` and `const { roles: r } = u` each reported in `src/lib/fx/x.ts` and in `tests/unit/fx.ts`; `{ roles: [...] }` as a literal and a parameter named `roles` passed; `src/access` clean.
- Verified: `npm run lint` 0 errors, the 3 pre-existing warnings; `npm run typecheck` clean; `test:unit` 22 passed; `test:int` 7 passed.
- Review fixes: the `roles` ban now covers `src/**` only and exempts `src/access/roles.ts` alone, so other `src/access` modules (where-returning access) cannot read `roles` inline either. Tests may assert on `roles`. The block's comment says a later `no-restricted-syntax` block for these files must include its selectors. Re-checked with fixtures: `src/access/fx.ts` reported, `tests/unit/fx.ts` and `roles.ts` clean. The int test pins the bypassed read to the created user's id. The harness `as()` now returns `asRequestUser(req)`. Re-verified: lint 0 errors, typecheck clean, unit 22, int 7.

## Review Triage Log

- Lint exemption covers all of `src/access`, so where-returning access functions there could read `roles` inline -- low, real (AD-2 says "through named helpers", the spine puts other access code in `src/access`). Patched: ignore narrowed to `src/access/roles.ts`.
- Including `tests/**` collides with Story 1.8's access test asserting on `updated.roles`; the message says "read" but the selectors also catch writes -- low, real. Patched: tests dropped from the ban; message reworded to "test roles".
- A later `no-restricted-syntax` block for overlapping files would replace these selectors silently (flat config replaces rule options) -- low, real but not reachable today (no other block sets the rule). Patched with a comment on the block; no shared constant until a second user of the rule exists.
- Nothing bans `overrideAccess: true` or an unscoped Local API call outside the AD-3 allowlist -- medium, real but outside this story's AC, and the allowlist's exceptions (catalogue, shelf, seed) land in later stories. Deferred.
- The ban misses ``u[`roles`]``, `{ 'roles': r }`, `'roles' in u` and a `where: { roles: … }` query -- low, real: rare forms, and a `where` selector cannot tell a role test from other queries. Rejected; review covers it.
- The int test's bypass assertion (`totalDocs: expect.any(Number)`) passes with zero docs -- low, real; also `bookeh_test` is never truncated, so a plain `find` page need not hold the new user. Patched: `where` on the created id, assert `[u.id]`.
- "reads as the request user" passes even with the helper broken -- low, real but covered: the no-user test fails if `overrideAccess` is dropped, and the unit test pins the exact shape including `req` identity. Rejected.
- Harness `as()` duplicates `asRequestUser` -- low, real: two definitions of "query as this user". Patched: `as()` returns `asRequestUser(req)`; `createLocalReq` sets `req.user` to the tagged actor, so the shape is unchanged.
- Spec and sprint status say `in-progress` after verification -- false: the workflow moves both at finalize, after review.
- Unit test casts a role-only object into `PayloadRequest` -- low, cosmetic: the cast is the point of a no-DB unit test, and the int test uses real requests. Rejected.
