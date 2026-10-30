---
title: '7.19 [K25] Own email and password closed over REST'
type: 'bugfix'
created: '2026-10-30'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** `users` update access is `adminOrSelf` and nothing guards `email` or `password`, so a signed-in non-admin can change their own email or password with `PATCH /api/users/<own id>` or a bulk `PATCH /api/users`, with no current password. A stolen session can take over the account (Epic 1 retrospective item 16, decision 2; triage A21, B17).

**Approach:** Override Payload's auth `email` field in `Users.ts` with field-level `update` access for the admin only, and add a `beforeOperation` hook on `update` that drops `password` from the data unless the request is the admin's or runs with `overrideAccess` (`password` is not a Payload field, so field access can't reach it). Both drop silently, as `roles` does today; other fields follow their current rules. `updateProfile()`, the first-user seed and `resetPassword` (which writes through the adapter, not the update operation) are unchanged. A two-user REST test in `users.int.spec.ts` proves it, and the spine's Accounts row says so in the same commit.

</frozen-after-approval>

## Implementation Notes

- `src/collections/Users.ts`: an `email` field (`type: 'email'`, `access.update: adminOnlyField`) that Payload's `mergeBaseFields` deep-merges into its auth `email` (validation, `unique`, lower-casing kept); `passwordForAdminOnly`, a `beforeOperation` hook that removes `password` from `args.data` on `update` unless `overrideAccess` or the admin. Payload maps both `update` (bulk) and `updateByID` to the hook's `update`.
- Checked in Payload 3.90.2: `resetPassword` hashes and calls `payload.db.updateOne` directly, so the hook never sees it; `hash` and `salt` are base auth fields with `update: () => false`; collections have no `PUT` endpoint. No migration: the drift check matches the newest snapshot, and `payload-types.ts` is unchanged.
- `tests/int/users.int.spec.ts`: two cases through `REST_PATCH` with a JWT from `payload.login`: a user's own PATCH by id and in bulk keeps email and password (old password signs in, the new one fails; `displayName` still changes), and the admin changes another user's email and password. Each half of the fix was removed in turn and the first case failed both times.
- Spine: the Accounts row states the rule.
- Lanes: lint, typecheck and unit pass. Int: 673 of 675; the two failures are this container's, not the change: `collation.int.spec.ts` (the local cluster's `template1` is not ICU fi-FI; CI creates it so) and `shelfTiming.int.spec.ts` text search (2.8 s against a 1 s budget on this machine).

## Review Triage Log

Review ran inline in this session (no subagent reviewers were launched).

- `false` — PUT `/api/users/<id>` bypasses the hook: Payload 3.90.2 collection endpoints have no `put` method (`collections/endpoints/index.js`).
- `false` — `resetPassword` is blocked for a non-admin: it never runs the update operation, it writes through `payload.db.updateOne` (`auth/operations/resetPassword.js`).
- `false` — the email override drops Payload's email validation or uniqueness: `mergeBaseFields` deep-merges the base field into ours; the existing create and duplicate-email cases still pass and the schema snapshot is unchanged.
- `false` — a user can set `hash` or `salt` directly: both base auth fields have `update: () => false`.

