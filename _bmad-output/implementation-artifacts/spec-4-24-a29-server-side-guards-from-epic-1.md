---
title: '4.24 [A29] Server-side guards from Epic 1'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
baseline_revision: 'b42c2fc87019d1471630990c5befdd5fd5164ab6'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Three Epic 1 retro guards are missing. `gateway.updateByID`/`deleteByID` refuse `where` only in their types (R10). `updateProfile()` stores a display name of any length, with control characters (R11). Two processes booting on an empty database both pass `seedFirstUser`'s count, and the loser's duplicate-email error aborts its boot (R4).

**Approach:** The gateway writes throw at runtime on a `where` key. `updateProfile()` rejects an over-long or control-character name like a blank one. `seedFirstUser` catches a `ValidationError` on `email`, counts again, and returns as already seeded when a user now exists.

## Boundaries & Constraints

**Always:** The `where` check is `'where' in options`, before any Payload call. Display-name checks run after trim and NFC: more than 100 code points, or any `\p{Cc}` (tab and newline included), fails with the blank name's `DomainError('VALIDATION', { fields: { displayName: 'VALIDATION' } })`. The limit is one exported constant in `lib/account/profile.ts`. The seed swallows the error only when the re-count finds a user; otherwise it rethrows, so an invalid `SEED_EMAIL` still aborts boot.

**Never:** No `users` collection or schema change, no migration, no new interface text, no seed retry loop, no `overrideAccess` in the seed. No spine edit: the spine states no by-ID write rule; the gateway doc comment does.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Gateway write with `where` | smuggled `where` on `updateByID`/`deleteByID` | nothing written | rejects with a plain `Error` |
| Name at the limit | 100 code points after trim (100 × `ä`) | stored | — |
| Name over the limit / control char | 101 code points; `'Mi\tka'`, `'Mi\nka'`, `'Mi\u0000ka'` | row unchanged | `VALIDATION` on `displayName` |
| Seed loses the race | count 0, create throws email `ValidationError`, re-count ≥ 1 | resolves, info log "already seeded" | swallowed |
| Seed, invalid email or other error | re-count 0, or not an email `ValidationError` | — | original error rethrown |

</intent-contract>

## Code Map

- `src/lib/payload/gateway.ts:67-84` -- `updateByID`, `deleteByID`; doc comment :11 "Writes are by ID only".
- `src/lib/account/profile.ts:69-77` -- `updateProfile`'s trim/NFC/blank check; doc comment :61-68.
- `src/lib/account/seedFirstUser.ts` -- count-then-create from `payload.config.ts:51-54` `onInit`, bare `payload`, no transaction.
- A duplicate email arrives as `payload`'s `ValidationError` with `data.errors[].path === 'email'`, either from `payload/dist/auth/strategies/local/register.js` (its own find) or from `@payloadcms/drizzle/dist/upsertRow/handleUpsertError.js` (23505). An invalid email has the same shape, so the re-count is what tells them apart.
- `src/app/(frontend)/(sections)/settings/DisplayNameField.tsx` -- shows `displayNameRequired` for any `displayName` VALIDATION. `maxLength` on the input keeps typing from reaching the length rejection.
- `src/app/(frontend)/(sections)/settings/page.tsx:4,44` -- already imports `@/lib/account/profile` and renders `DisplayNameField`.
- `tests/int/gateway.int.spec.ts:41-90` -- existing write cases, `contextFor(a)`.
- `tests/int/profile.int.spec.ts:46-54` -- blank-name `it.each` with row-unchanged checks.
- `tests/unit/seedFirstUser.unit.spec.ts` -- `fakePayload(userCount)` has a fixed count. The invalid-email case at :92-103 must keep passing.

## Tasks & Acceptance

**Execution:**
- `src/lib/payload/gateway.ts` -- guard both writes and update the doc comment.
- `src/lib/account/profile.ts` -- export `DISPLAY_NAME_MAX_LENGTH = 100`, add both checks, update the doc comment.
- `settings/page.tsx`, `DisplayNameField.tsx` -- pass `maxLength={DISPLAY_NAME_MAX_LENGTH}` to the input.
- `src/lib/account/seedFirstUser.ts` -- catch, re-count, then log at info and return, or rethrow.
- `tests/int/gateway.int.spec.ts` -- one case: both writes with a smuggled `where` reject, and the user's row is still there, unchanged.
- `tests/int/profile.int.spec.ts` -- add 101 code points, tab, newline and NUL to the rejected cases, plus one 100-code-point name that is stored.
- `tests/unit/seedFirstUser.unit.spec.ts` -- one race case: count 0 then 1, and `create` rejects with an email `ValidationError`. The seed resolves and logs at info.

**Acceptance Criteria:**
- Given `updateByID` or `deleteByID`, when called with a `where` option, then it throws at runtime and Payload is never called.
- Given `updateProfile()`, when the display name is over 100 characters or contains a control character, then it fails with `VALIDATION` on `displayName` and the stored profile is unchanged.
- Given an empty, migrated database, when two processes boot Payload with the same `SEED_EMAIL` at once, then both finish `onInit`, and exactly one user exists.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 20, false 2, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: the `where` guard misses the real threat. Payload dispatches on `options.id`, so `where` widens a write only with a falsy id (`0`, `NaN`). — `refuseWhere` refuses any `where` key whatever the id, so the falsy-id-plus-`where` case throws too. A falsy id without `where` reaches Payload's bulk path, which throws "Missing 'where'" and writes nothing.
  - `[low]` `[reject]` Blind: R11 runs only in `updateProfile()`. A user can `PATCH /api/users/<own id>` (`update: adminOrSelf`, REST route present), and the admin can edit in the back office. — Confirmed. In Phase 1 this needs a hand-crafted request against one's own row, on the tailnet. The fix would add a field `validate`/`maxLength` to `users`, which is more than a direct correction, and the AC names `updateProfile()`.
  - `[low]` `[reject]` Blind: the input's `maxLength` counts UTF-16 units before trim/NFC, the service counts code points after them. — The input is stricter, never looser, except for NFC-expanding composition exclusions such as U+0958, which are vanishingly rare in a display name. The doc comment's claim holds. Matching the counts would need client code.
  - `[low]` `[reject]` Blind: a name rejected for a pasted tab or for length shows "Enter a name.". — Real but only reachable by pasting a tab or bypassing `maxLength`. A distinct message is new interface text in two languages for a rare case.
  - `[low]` `[reject]` Blind: `\p{Cc}` misses U+2028/2029, bidi overrides, zero-width characters and lone surrogates. — The AC says "control characters", which is `Cc`. The others need a deliberate policy (ZWJ is needed in emoji) and would not come from a normal paste.
  - `[low]` `[reject]` Blind: if the re-count in the seed's catch throws, the create's error is lost. — Only when the database fails between two calls during the first boot, and then the count error is the informative one. Wrapping it adds a branch.
  - `[low]` `[reject]` Blind: the "not an email `ValidationError`, re-count ≥ 1" half of a matrix row has no test. — A test-only finding that names no AC or spine rule (CLAUDE.md triage rule). The invalid-email rethrow is tested.
  - `[low]` `[reject]` Blind: AC 3's manual check has no recorded result. — Its fix is an edit to this spec. The result (6 rounds) is recorded under Auto Run Result.
  - `[low]` `[reject]` Edge: misleading "Enter a name." after a length or control-character rejection. — Same as the fourth Blind row.
  - `[low]` `[reject]` Edge: U+2028/2029 and `Cf` are stored. — Same as the fifth Blind row.
  - `[low]` `[reject]` Edge: `maxLength` measure differs, and U+0958 passes the input but is rejected. — Same as the third Blind row.
  - `[low]` `[reject]` Edge: a `SEED_EMAIL` local part over 100 code points seeds an over-long display name that Settings cannot then save. — The owner sets `SEED_EMAIL` to a real address (local parts are capped at 64 by RFC 5321), so this never happens. Clipping would add logic to the seed.
  - `[low]` `[reject]` Edge: REST PATCH bypasses the cap. — Same as the second Blind row.
  - `[low]` `[reject]` Edge (claim): readers may assume the cap is a stored invariant. — Same root as the second Blind row. The doc comment places the rule in `updateProfile()` only.
  - `[low]` `[patch]` Verification gap: the length tests use `ä`, so a code-unit count would pass them. — The stored case in `tests/int/profile.int.spec.ts` now uses `'😀'.repeat(100)` (200 UTF-16 units). `'ä'.repeat(101)` stays among the rejections.
  - `[low]` `[reject]` Verification gap: the seed race unit test uses a hand-built `ValidationError`, so a Payload bump that changes the duplicate error's shape would go unnoticed. — Both current producers (`register.js`, `handleUpsertError`) were read and give `path: 'email'`. The real two-process race passed 6/6. An int test with a wrapped real Payload is more than a direct correction, for a rare first-boot race.
  - `[low]` `[reject]` Verification gap (other): misleading message. — Same as the fourth Blind row.
  - `[low]` `[reject]` Verification gap (other): `maxLength` measure mismatch. — Same as the third Blind row.
  - `[false]` `[reject]` Intent: the gateway throws a plain `Error`, not a `DomainError`. — The AC names no error type. A smuggled `where` is a programming error, and `runAction()` reports it as an internal failure, which is right.
  - `[low]` `[reject]` Intent: the change also reaches the settings UI, with a different length measure and the old message. — Same as the third and fourth Blind rows. `maxLength` keeps typing from reaching the new rejection.
  - `[low]` `[reject]` Intent: AC 3 is a multi-process outcome, but the automated evidence is a mocked unit test. — Same as the second verification-gap row. The manual two-process check ran (Auto Run Result).
  - `[low]` `[reject]` Intent: catching any `email` `ValidationError` (not only the unique violation) swallows an invalid `SEED_EMAIL` when another process has seeded meanwhile. — The instance is seeded either way, so boot continuing is correct. Only differing `SEED_*` between the two processes could reach it.

## Verification

**Commands:**
- `npm run typecheck`, `npm run lint` -- clean
- `npm run test:unit`, `npm run test:int` -- pass (worktree Postgres, port 5441)

**Manual checks:**
- Seed race, on the worktree container only: create the database `bookeh_seedrace` and migrate it with push off. Then start two scratch `tsx` processes at once, each calling `getPayload({ config })` with the same `SEED_*`. Expected: both exit 0, one logs "Seeded", the other "already seeded", and `users` holds 1 row. Repeat a few times, then drop the database.

## Auto Run Result

Status: done

**Summary:** `gateway.updateByID`/`deleteByID` refuse a `where` key at runtime, before Payload is called (R10). `updateProfile()` rejects a display name over 100 code points or containing a `\p{Cc}` character with the blank name's `VALIDATION` on `displayName`, and Settings caps the input with the same constant (R11). `seedFirstUser` treats an `email` `ValidationError` as already seeded when a re-count finds a user, and otherwise rethrows (R4).

**Files changed:**
- `src/lib/payload/gateway.ts` -- `refuseWhere()` in both writes; doc comment.
- `src/lib/account/profile.ts` -- `DISPLAY_NAME_MAX_LENGTH`, `invalidDisplayName()`; doc comment.
- `src/app/(frontend)/(sections)/settings/page.tsx`, `DisplayNameField.tsx` -- `maxLength` prop to the input.
- `src/lib/account/seedFirstUser.ts` -- catch, re-count, log or rethrow.
- `tests/int/gateway.int.spec.ts` -- smuggled `where` rejected on both writes, row unchanged.
- `tests/int/profile.int.spec.ts` -- over-long, tab, newline and NUL rejected; 100 astral code points stored.
- `tests/unit/seedFirstUser.unit.spec.ts` -- the lost race resolves as already seeded.

**Review:** 22 findings (low 20, false 2). One patch was applied: the stored-length case uses `'😀'.repeat(100)`, so a code-unit count would fail it. Nothing was deferred. The other 21 were rejected; each reason is in the triage log. The main ones: REST/admin writes to `displayName` skip the cap (AC scopes it to `updateProfile()`); a pasted tab shows "Enter a name."; `Cf`/`Zl`/`Zp` are not refused (the AC says control characters).

**Follow-up review recommended:** false (patched: high 0, medium 0, low 1).

**Verification:** `npm run typecheck` is clean. `npm run lint` has 0 errors; its 36 warnings were already in `src/migrations`. `npm run test:unit` passes 672 and `npm run test:int` 420, both before and after the patch, on the worktree Postgres (port 5441). Manual seed race: on the empty database `bookeh_seedrace`, migrated with push off, two `getPayload()` boots started at once with the same `SEED_*` in 6 rounds (`users` emptied between rounds). In every round both exited 0, one logged "Seeded the first user…" and the other "First user already seeded by another process.", and `users` held 1 row. The database was dropped afterwards.

**Residual risks:** the seed's race handling depends on Payload reporting a duplicate email as a `ValidationError` on `email`. That is true for 3.90.2 (both `register.js` and drizzle's `handleUpsertError`), but no automated test exercises real Payload. The display-name cap is not a stored invariant: REST self-updates and admin edits skip it.
