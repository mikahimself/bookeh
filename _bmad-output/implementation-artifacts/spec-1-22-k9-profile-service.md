---
title: 'Story 1.22 [K9] Profile service'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '529af26178acb8a4f472f7a8c8a9dbd993b36d0d'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Close or explicitly accept the REST path that lets a signed-in user change their own email or password with no current-password check; name a story for it.
    evidence: |-
      Pre-existing since Story 1.8 (`adminOrSelf` update on `users`). `lib/account` now changes display name and language only, but `PATCH /api/users/<own id>` still writes `email` and `password`, which contradicts "email shown, not editable; no password change in Phase 1". Recorded in deferred-work.md on the 1.8 entry as `open:` with no owner.
    location: >-
      src/collections/Users.ts
    severity: low
  - summary: >-
      In Story 1.23, check that a language change in Settings re-renders in the new language in the same request; if not, refresh the cached session user after `updateProfile()`.
    evidence: |-
      `updateProfile()` leaves `ctx.user` unchanged, and `currentUser()` (React `cache`) returns that same object to `src/i18n/request.ts`. Whether the cache spans a server action and its re-render is unverified; the first Settings action settles it by a manual check.
    location: >-
      src/lib/payload/context.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Settings (1.23) and the visibility switches (1.24) need to read and change the signed-in user's profile, and AD-18 says the profile is read and updated only through `lib/account`. Nothing there does it yet, so the first screen would write `users` through the gateway itself.

**Approach:** Add `getProfile(ctx)` and `updateProfile(ctx, changes)` to `src/lib/account`, both through the gateway and always on the context user's own document. `updateProfile` takes display name and language only, copies those two keys into the write and nothing else, and trims and NFC-normalises the display name, rejecting it when empty.

## Boundaries & Constraints

**Always:** Every read and write goes through `@/lib/payload/gateway` with the caller's context; the target id is always `ctx.user.id` and never comes from the arguments. The write's `data` is built from the known keys (`displayName`, `language`) only, never by spreading `changes`. A key that is absent or `undefined` is left unchanged. A display name that is empty after trimming fails with `DomainError('VALIDATION', { fields: { displayName: 'VALIDATION' } })` before any write. An unknown language is left to Payload's select validation (one rule, one error, AD-18), which `runAction()` maps to the same `VALIDATION` shape.

**Never:** No `id`, `email`, `password` or `roles` parameter (email shown, not editable; no password change in Phase 1). No server action, page or message strings (1.23). No visibility fields (1.24). No change to `src/collections/Users.ts`, the gateway or the harness. No hook on `users` that duplicates the normalisation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Read | A's context | `{ email, displayName, language }` of A, no other keys | No error expected |
| Name normalised | `{ displayName: '  Mäki ' }` | stored and returned `'Mäki'` (U+00E4) | No error expected |
| Name blank | `{ displayName: '   ' }` or `''` | row unchanged | `DomainError` VALIDATION, field `displayName` |
| Language | `{ language: 'fi' }` | language `fi`, display name unchanged | No error expected |
| Language unknown | `{ language: 'sv' }` via cast, inside `runAction` | row unchanged | `{ ok: false, code: 'VALIDATION', fields: { language: 'VALIDATION' } }` |
| Nothing to change | `{}` | current profile returned, no write | No error expected |
| Smuggled keys, user | A's context, `{ displayName: 'A2', id: B.id, roles: ['admin'], email: 'x@test.invalid' }` via cast | A's name is `A2`; A's roles and email and all of B unchanged | No error expected |
| Smuggled keys, admin | admin's context, `{ displayName: 'Ad2', id: B.id, roles: ['user'] }` via cast | admin's name is `Ad2`, admin keeps `['admin','user']`, B unchanged | No error expected |

</intent-contract>

## Code Map

- `src/lib/account/seedFirstUser.ts` -- existing file in the folder; style reference (spine doc comment, named export). Not touched.
- `src/lib/payload/gateway.ts` -- `findByID(ctx, { collection: 'users', id })` and `updateByID(ctx, { collection: 'users', id, data })`; import as `import * as gateway from '@/lib/payload/gateway'`. Read-only.
- `src/lib/payload/context.ts` -- `type Context = { req; user: TypedUser }`; `ctx.user.id` is the target. Read-only.
- `src/lib/errors.ts` -- `DomainError(code, { fields })`, `runAction()`; `ValidationError` maps to `VALIDATION` with `fields[path]`. Read-only.
- `src/payload-types.ts:147` -- `User['language']` is `'en' | 'fi'`; use `User` types for `Profile`, not `src/i18n` (keeps `lib` free of app-side modules).
- `src/collections/Users.ts` -- `displayName` text required (Payload's required check accepts `'   '`, hence the service check), `language` select `en`/`fi`, `roles` field update admin-only (so the admin row in the matrix is guarded only by the service). Read-only.
- `eslint.config.mjs` -- `src/lib/account` is under the gateway import ban and the `.payload` member ban; type imports from `payload` are allowed.
- `tests/helpers/harness.ts` -- `createUser(data)`, `contextFor(user)`. `tests/int/gateway.int.spec.ts` -- int test style; verify unchanged rows with `getPayload({ config }).findByID`.
- `_bmad-output/implementation-artifacts/deferred-work.md:63-65` -- the 1.8 entry "Decide which fields a user may change on their own `users` document … with … Story 1.22".

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/account/profile.ts` -- new. `export type Profile = Pick<User, 'email' | 'displayName' | 'language'>`, `export type ProfileChanges = Partial<Pick<User, 'displayName' | 'language'>>`, `getProfile(ctx): Promise<Profile>`, `updateProfile(ctx, changes): Promise<Profile>`. Doc comments cite AD-18 and the Text input convention. Return exactly the three keys.
- [x] `tests/int/profile.int.spec.ts` -- new. One test per I/O Matrix row; the unknown-language row runs inside `runAction`; unchanged rows are re-read with an unscoped `payload.findByID`.
- [x] `_bmad-output/implementation-artifacts/deferred-work.md` -- on the 1.8 entry, record the profile-service half as decided (lib/account changes display name and language only; email and password are not editable in Phase 1) and leave the REST self-update of email/password open.

**Acceptance Criteria:**
- Given `src/lib/account`, when the story is done, then it exports `getProfile(ctx)` and `updateProfile(ctx, changes)` for display name and language, each calling only the gateway.
- Given the repository, when `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run test:int` run, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 9, false 7, maybe-false 1
- findings:
  - `[false]` `[reject]` NFC test input is already precomposed, so it checks trimming only (blind) — the source bytes are `4d 61 cc 88 6b 69` (U+0061 U+0308) for the input and `4d c3 a4 6b 69` (U+00E4) for the expectation; dropping `.normalize('NFC')` fails the test.
  - `[false]` `[reject]` A non-string `displayName` makes `.trim()` throw, reported as `INTERNAL` (blind) — `ProfileChanges` types it as `string`; no caller exists, and a cast past the types failing loudly is correct behaviour. The 1.23 action parses its form input.
  - `[low]` `[reject]` `password` is never smuggled in the tests (blind) — `data` is built from two named keys, and spreading `changes` already fails three tests (implementer's mutation check); another key adds no coverage.
  - `[low]` `[reject]` No test for a blank name with a valid language (blind) — the check throws before any write today; a hypothetical reorder is not a defect met in use.
  - `[low]` `[reject]` No upper bound on display name length (blind) — neither the story nor the PRD sets one; one tailnet user; adding a limit is a new rule, not a correction.
  - `[false]` `[reject]` Normalisation sits in the service, not the action boundary (blind) — AC2 puts it in `lib/account`; NFC and trim are idempotent, so a 1.23 action repeating it changes nothing.
  - `[maybe-false]` `[defer]` `ctx.user` is stale after an update; a same-request re-render could use the old language (blind) — depends on whether React `cache` in `currentUser()` spans a server action and its re-render; settled by 1.23's first Settings action. Deferred as medium (unverified).
  - `[low]` `[reject]` `Profile` doc comment claims more than the type holds (blind) — it holds what Settings shows today; 1.24 and Epic 3 add their fields to the same type.
  - `[low]` `[defer]` REST self-update of email/password left open with no owner (blind) — pre-existing since 1.8, not caused here; deferred with a request to name its story.
  - `[false]` `[reject]` Non-string or null `displayName` throws TypeError → `INTERNAL` (edge) — same as the blind row above.
  - `[low]` `[reject]` A display name of only zero-width characters passes the blank check (edge) — not met in everyday use; stripping format characters is a new rule with its own edge cases.
  - `[low]` `[reject]` No length bound (edge) — same as the blind row above.
  - `[low]` `[defer]` AC3 proven at the service, not on REST or the back office (intent-alignment) — AC3 says "through it", the service; the REST part is the same pre-existing gap as the blind row, deferred with it.
  - `[false]` `[reject]` Display name not normalised on admin or REST writes (intent-alignment) — AC2 binds the service; the spine keeps normalisation at the boundary, and the back office is out of scope.
  - `[false]` `[reject]` `getProfile` also returns email (intent-alignment) — FR-4 puts email on the profile and Settings shows it; only the update is limited to two fields.
  - `[false]` `[reject]` Exported from `@/lib/account/profile`, not a barrel (intent-alignment) — `src/lib` has no barrels; services import by file, as with `@/lib/payload/gateway`.
  - `[low]` `[reject]` Nothing stops other `src/lib` services writing `users` through the gateway (intent-alignment) — the AC asks for the single entry point, not a lint ban; no other service writes `users`, and the seed is an AD-3 system-privilege exception.

## Design Notes

- **No target id:** a profile is always the caller's own, so there is nothing to pass. That, not access control alone, is what stops cross-user and `roles` writes: an admin's context may write any user's `roles`, so only building `data` from the two known keys keeps them out.
- **Errors:** the blank-name check throws a `DomainError` with the same field shape `runAction()` gives Payload's `ValidationError`, so Settings reads one shape for either field.

## Verification

**Commands:**
- `npm run test:int` -- expected: all pass, including `profile.int.spec.ts`.
- `npm run test:unit` -- expected: all pass.
- `npm run lint` and `npm run typecheck` -- expected: 0 errors.

## Auto Run Result

Status: done

**Summary:** `src/lib/account/profile.ts` holds the profile service:
- `getProfile(ctx)` returns `{ email, displayName, language }` for the context user, read through `gateway.findByID`.
- `updateProfile(ctx, changes)` writes the context user's own row through `gateway.updateByID`. Its `data` holds only `displayName` and `language`, so an id, `roles`, `email` or `password` never reaches the write, even for an admin. The display name is trimmed and NFC-normalised; a blank one throws `DomainError('VALIDATION', { fields: { displayName: 'VALIDATION' } })` before any write. An unknown language is left to Payload's select validation, which `runAction()` maps to the same shape. With nothing to change, it returns the profile without writing.

**Files changed:**
- `src/lib/account/profile.ts` -- new; `Profile`, `ProfileChanges`, `getProfile`, `updateProfile`.
- `tests/int/profile.int.spec.ts` -- new; 9 tests, one per I/O Matrix row (the blank row twice).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the 1.8 entry gets `decided:` (service changes name and language only) and `open:` (REST self-update of email/password); a new 1.23 entry on a possibly stale locale after a language change.

**Review findings (17):** 0 patched. 3 rows deferred as 2 frontmatter items: the REST email/password path (pre-existing, low) and the same-request locale after a language change (medium, unverified, for 1.23). 14 rejected, each with its reason in the triage log: the NFC test (it does use the decomposed form), non-string input past the types (twice), smuggling `password`, a mixed blank-and-language test, length limits (twice), zero-width names, where normalisation lives (twice), the `Profile` comment, email in `getProfile`, the barrel path, and a lint ban on other `users` writers.

**Follow-up review recommended:** false. Nothing was patched (high 0, medium 0, low 0).

**Verification:**
- `npm run lint`: 0 errors. The 7 warnings were all there before.
- `npm run typecheck`: clean.
- `npm run test:unit`: 129 passed.
- `npm run test:int`: 59 passed, 1 skipped (`migrationSchema`, CI only), including all 9 in `profile.int.spec.ts`.
- Matrix audit: every I/O Matrix row has a test that ran and passed.
- Mutation check by the implementer: spreading `changes` into `data` failed 3 tests.

**Residual risks:**
- `PATCH /api/users/<own id>` still changes a user's own email or password without the current password (since 1.8; deferred).
- Whether a language change shows at once in the same request depends on React `cache` behaviour, unverified until 1.23's action exists (deferred).
