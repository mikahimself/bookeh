# Deferred Work

Open entries only. `deferred-triage-2026-10-30.md` is the ledger for every other deferral: those went into Stories 7.16 to 7.26 or are closed, moot or accepted there.

- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-a3-postgres-with-finnish-icu-collation.md`
  summary: Run CI's Postgres from `docker-compose.yml` (a Compose-based job) instead of a hand-mirrored service container, so `POSTGRES_INITDB_ARGS` and the init script are exercised automatically; take it with Story 2.2's production Compose.
  evidence: Verification-gap reviewer: delete `POSTGRES_INITDB_ARGS` from `docker-compose.yml` or break `create-test-db.sql` and CI stays green, because CI never reads either file; only the comment in `ci.yml` keeps the two aligned.
  decided: Accepted earlier (triage, 2026-10-30): a deploy and CI artifact under the tests-at-a-minimum convention; `ci.yml` mirrors compose by hand.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-3-a3-postgres-with-finnish-icu-collation.md`
  summary: In Story 5.3 (text search), add an assertion on the ICU default that `'Ä' ilike 'ä'` is true and `'a' ilike 'ä'` is false, pinning the search half of NFR-7 against the image.
  evidence: Verified on the recreated dev database (2026-10-08): `select 'Ä' ilike 'ä', 'a' ilike 'ä', lower('ÄÖÅ')` gives `t|f|äöå`; no test records it yet.
  decided: Accepted earlier (triage, 2026-10-30): a test-only gap that no story criterion names.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-8-a8-users-collection.md`
  summary: In Story 1.10, close the `/admin/create-first-user` and `POST /api/users/first-register` path, or make the first user admin, so the first account cannot come out as a `user` locked out of `/admin` and no tailnet client can claim an empty instance.
  evidence: `@payloadcms/next/dist/views/CreateFirstUser/index.js:48-52` renders every field with `roles` pre-filled `['user']`; `registerFirstUser` creates with `overrideAccess: true`; the dev `bookeh` database has 0 users since 2026-10-09.
  decided: Accepted earlier (triage, 2026-10-30): Story 1.10 leaves first-register open by design; the env seed covers the first user.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-11-a10-request-context-and-gateway-in-lib-payload.md`
  summary: In Story 1.16, add an e2e test that a signed-out visit to a page calling `requireUser()` lands on `/login?next=<encoded path and search>`.
  evidence: The hand-off from `src/proxy.ts` (`x-bookeh-path`) to `requireUser()` is unit- and int-tested separately; it was checked by hand under `next dev` in 1.11, but nothing committed keeps Next picking up the proxy and forwarding the header.
  decided: Accepted earlier (triage, 2026-10-30): outside Playwright's scope (Epic 1 retrospective, decision 4).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-21-k1-installable-pwa.md`
  summary: Pad the fixed elements (toast region, full-screen task) for `safe-area-inset-left` and `safe-area-inset-right`, so they clear the notch in landscape. ProgressLine (`fixed inset-x-0 top-0`) is fixed too, but it is a thin full-bleed line and is likely fine left edge to edge.
  evidence: Story 1.21 sets `viewport-fit=cover` and pads `body` inline with the side insets, but `position: fixed` elements are placed against the viewport, not the body, so in landscape on a notched iPhone they can still run under the notch.
  decided: Story 7.27 (on-device check, triage 2026-10-30).
- source_spec: `_bmad-output/implementation-artifacts/spec-1-21-k1-installable-pwa.md`
  summary: Known consequence of DESIGN.md option T1, not a defect to fix unprompted: with a dark device theme the installed app launches with a white splash screen and title bar, until the page's `theme-color` takes over.
  evidence: The manifest's `theme_color` and `background_color` are fixed at `#FFFFFF` (T1); a manifest is one per app and its request carries no device preferences, so it cannot follow the `bookeh_prefs` theme.
  decided: Accepted earlier (triage, 2026-10-30): a known consequence of DESIGN.md option T1.
- source_spec: `_bmad-output/implementation-artifacts/spec-1-16-a16-sign-in-and-sign-out.md`
  summary: Make sign-in take the same time whether or not the account exists or is locked.
  evidence: Payload skips password hashing for unknown and locked accounts, so response time reveals which emails have accounts.
  decided: Accepted for Phase 1 in the Epic 1 retrospective (Mika, 2026-10-10): v1 is tailnet only with one user. Revisit with NFR-5 if Phase 2 opens bookeh to others.
- source_spec: `_bmad-output/implementation-artifacts/spec-2-3-k4-nightly-backups.md`
  summary: backup.sh's failure branches (empty-DB refusal, pg_restore self-verification, .failed rename, prune-only-after-success) have no repeatable verification.
  evidence: Verification-gap reviewer — only a one-time local rehearsal plus `sh -n` cover them; CI never touches deploy/, so dropping the `pg_restore --list` line or breaking the trap ships green. Deferred per the deploy-artifact pattern (story 2.2) and tests-at-a-functional-minimum; cheap partial close is committing the rehearsal as a rerunnable script under deploy/, worth revisiting when story 5.37 consumes last-backup.json.
  decided: Accepted earlier (triage, 2026-10-30): a deploy artifact under the tests-at-a-minimum convention.
- source_spec: `_bmad-output/implementation-artifacts/spec-cover-treatment.md`
  summary: Check paint cost of cloth placeholders on a large shelf on the phone.
  evidence: Unverified (would be medium): each coverless tile is an isolated stacking context with a soft-light pseudo-element over an SVG `feTurbulence` background, rasterised per distinct tile width. Proven or cleared by scrolling a covers view with a few hundred coverless copies on the owner's iPhone.
  decided: Story 7.27 (on-device check, triage 2026-10-30).
- source_spec: none
  summary: Let a user mark a Book as "Currently reading" — a third reading state beside unread and read (UserBooks read flag, FR-29), with its shelf filter and marker.
  evidence: Split from the phone-polish sidequest (2026-10-27); it changes the data model, PRD FR-29 and the spine, so it is its own story after the polish story.
  decided: No story: a feature, not a defect. It changes the data model and FR-29, so it needs a PRD change first (triage, 2026-10-30).
- source_spec: `_bmad-output/implementation-artifacts/spec-7-16-k22-conventions-builds-read.md`
  summary: Say what `bmad-build-auto` does when the previous story carries `followup_review_recommended: true` (halt for the walkthrough, or go on and record it as owed), since the CLAUDE.md walkthrough rule needs a person on the real surface.
  evidence: Blind review of 7.16; neither `_bmad/custom/bmad-build-auto.toml` nor CLAUDE.md states the unattended behaviour, and the fix edits the auto rules, which is the owner's call.
  decided: No story: it edits the unattended build rules, which is the owner's call (Mika).
