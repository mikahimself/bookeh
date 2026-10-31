---
title: '7.22 [K28] Repo tidy'
type: 'chore'
created: '2026-10-31'
status: 'done'
baseline_revision: '2c05a415fcb422bd2580bb4d120ca69c7952b978'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred:
  - summary: >-
      package-lock.json root engines.node still says >=20.9.0 while package.json says >=22.23.3 <23.
    evidence: |-
      npm ci does not reject it, and the spec allowed the edit only if it did. The next npm install rewrites the line.
    location: >-
      package-lock.json:53
    severity: low
  - summary: >-
      Nothing checks that the Dockerfile and compose node tags equal .nvmrc.
    evidence: |-
      Tags cannot read .nvmrc and engines only warns. Same drift risk as before this story; no criterion asks for a check.
    location: >-
      Dockerfile:8
    severity: low
---

<intent-contract>

## Intent

**Problem:** The Node pin rests on comments, the compose service can rewrite the lockfile, `legacy-peer-deps` can hide a Payload version mismatch, the README is Payload's blank template, production has no step-by-step restore, and dead code remains (triage A1, A2, A3, A7, A9, A22, B21, C4, D21).

**Approach:** `.nvmrc` becomes the single Node source. Compose runs `npm ci`. `legacy-peer-deps` stays, because `npm ci` fails without it (measured 2026-10-31: `Missing:` lockfile entries), so a CI step fails on mismatched Payload versions. Rewrite the README top, add a restore section to `deploy/README.md`, delete the flash chain and `images.localPatterns`.

## Boundaries & Constraints

**Always:** the README keeps its Database section's content (tests, collation, migration check). The restore follows what `backup.sh` writes and `restore-rehearsal.sh` proves: a plain `pg_restore -d bookeh --exit-on-error` into a fresh ICU cluster. Every restore command carries its machine tag; ownership is set from **[host]**, because the LXC's root cannot chown over NFS.

**Never:** no change to `package-lock.json`, the toast store, `RaiseToast`, `Cover` or `Dockerfile` behaviour; no new unit test for the Payload check; no running of a restore; no `planning-artifacts` edits (Story 7.26 reconciles the old `flashToast()` wording).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Versions agree | All `payload`, `@payloadcms/*` lock entries at 3.90.2 | Check exits 0 | none |
| Mismatch | One entry differs | Check exits 1 and names versions and packages | CI step fails |

</intent-contract>

## Code Map

- `.github/workflows/ci.yml:45-55` -- `setup-node` with `node-version: 22.23.3` and a comment; `npm ci` at `:55`.
- `package.json:67` -- `engines.node` is `>=20.9.0`.
- `Dockerfile:5-6`, `docker-compose.yml:2-4` -- lock-step comments; the image tags cannot read `.nvmrc`, so they stay and the comments name it. `docker-compose.yml:12` -- `npm install`.
- `.npmrc` -- `legacy-peer-deps=true`, kept.
- `package-lock.json` -- `packages` keys ending `node_modules/payload` or `node_modules/@payloadcms/*`; all seven are 3.90.2 today.
- `README.md:1-35` template, `:37` on Database (keep), `How it works` to the end template. `.env.example` documents the dev variables.
- `deploy/README.md:361` points at "Collation and restore"; `:363-383` the traps; `:148-170` host-side chown (uid 100070/101001 unprivileged, 70/1001 privileged); `:228-236` `/opt/bookeh/.env`, chmod 600. `.env` is not in the backup or the repo.
- `deploy/compose.prod.yml` -- `postgres` initdb on empty `data/`, marker file in the parent, so emptying `data/` keeps the marker. `deploy/bookeh.service` -- stack start and stop. `bookeh-backup.timer` -- nightly at 03:30. The app applies migrations at start, so it comes up after the restore.
- `deploy/restore-rehearsal.sh:197` -- proven `pg_restore` form; `:238-241` media copy and owner.
- `src/app/(frontend)/components/toast/{flash.ts,flashCookie.ts}`, `tests/unit/flashCookie.unit.spec.ts` -- delete. `ToastProvider.tsx:19,38-40,102-110` -- import, doc comment, effect; `usePathname`/`useEffect` leave if unused. `RaiseToast.tsx:8` comment mentions the flash cookie.
- `next.config.ts:19-25` -- `images` block.

## Tasks & Acceptance

**Execution:**
- `.nvmrc` -- new, `22.23.3`.
- `package.json` -- `engines.node` `>=22.23.3 <23`.
- `package-lock.json` -- only its root `engines` entry, if `npm ci` rejects otherwise; nothing else.
- `.github/workflows/ci.yml` -- `node-version-file: .nvmrc`; a `node scripts/check-payload-versions.mjs` step before `npm ci`.
- `scripts/check-payload-versions.mjs` -- new; reads the lockfile, fails on more than one version.
- `docker-compose.yml`, `Dockerfile` -- `npm ci` in compose; comments say the tags follow `.nvmrc`.
- `README.md` -- rewrite the template parts for bookeh: what it is, stack, setup (`.env`, `docker compose up -d postgres`, `npm ci`, `npm run dev`), Database kept, a dev-data warning, a pointer to `deploy/README.md`.
- `deploy/README.md` -- new `## Restore production — ...` section after "Collation and restore"; the `:361` pointer names it.
- `flash.ts`, `flashCookie.ts`, `tests/unit/flashCookie.unit.spec.ts` -- delete.
- `ToastProvider.tsx`, `RaiseToast.tsx` -- remove the read and stale wording.
- `next.config.ts` -- drop `images`.

**Acceptance Criteria:**
- Given the Node version, when the story is done, then `.nvmrc` names 22.23.3, `engines.node` follows it and CI reads `node-version-file`.
- Given compose, when the `payload` service starts, then it runs `npm ci`.
- Given `npm ci` fails without `legacy-peer-deps`, when the story is done, then `.npmrc` stays and CI fails on a mismatched `@payloadcms/*` version.
- Given the README, when read, then it describes bookeh with no blank-template text, and warns that a running `next dev` can push a schema change and that accepting its data-loss prompt truncates dev tables.
- Given `deploy/README.md`, when a restore is needed, then it gives in order: where the `.env` secrets live, emptying `data/`, `pg_restore` through compose, and the media copy with uid 1001 ownership.
- Given the dead code, when the story is done, then `flashToast()`, `flash.ts`, `flashCookie.ts`, their unit spec, `ToastProvider`'s `bookeh_flash` read and `images.localPatterns` are gone.

## Spec Change Log

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 28 findings — high 0, medium 4, low 18, false 6, maybe-false 0
- findings:
  - `[low]` `[defer]` Blind: lockfile root `engines` stale — The contract bars other lockfile edits; recorded in `deferred`.
  - `[low]` `[defer]` Blind: image tags not enforced against `.nvmrc` — Pre-existing risk; recorded in `deferred`.
  - `[medium]` `[patch]` Blind: restore deletes before proving the backup — `pg_restore --list` added before the stop; `test` guards the delete.
  - `[medium]` `[patch]` Blind: pasted `<run>` still runs the delete — `RUN` variable and an `&&` chain.
  - `[low]` `[patch]` Blind: no fallback for replaced data — Optional fresh backup added before starting.
  - `[low]` `[patch]` Blind: step 1 leaves a running backup — `bookeh-backup.service` stopped too.
  - `[low]` `[patch]` Blind: assumes the LXC survived — Rebuilt LXC or NAS paragraph added.
  - `[low]` `[patch]` Blind: image and dump direction — Paragraph says to set `BOOKEH_IMAGE_TAG`.
  - `[low]` `[patch]` Blind: stale pointer in `backup.sh` — Now names Restore production.
  - `[low]` `[patch]` Blind: seed instruction drops clearing — README says to clear them.
  - `[low]` `[patch]` Blind: compose service undocumented, `npm ci` cost — One README sentence.
  - `[medium]` `[patch]` Edge: corrupt dump found after delete — As the Blind row.
  - `[medium]` `[patch]` Edge: partial `pg_restore` — Step 4 says stop and return to step 3.
  - `[low]` `[patch]` Edge: running backup — As the Blind row.
  - `[low]` `[defer]` Edge: image tags drift — As the Blind row.
  - `[low]` `[defer]` Edge: lockfile engines — As the Blind row.
  - `[false]` `[reject]` Edge: media copied before `pg_restore` — The criterion lists contents, and both finish before the app starts.
  - `[low]` `[defer]` Verification: image tags drift — As the Blind row; filed `defer`.
  - `[low]` `[defer]` Verification: lockfile engines — As the Blind row.
  - `[low]` `[defer]` Intent: Node pin rests on comments for image tags — As the Blind row.
  - `[low]` `[defer]` Intent: lockfile engines — As the Blind row.
  - `[false]` `[reject]` Intent: `engines` is a range — "Follows" allows it; `.nvmrc` is the exact pin.
  - `[false]` `[reject]` Intent: Payload check reads the lockfile only — `npm ci` installs that lockfile; failure path was run on a scratch copy.
  - `[low]` `[reject]` Intent: the mount stays writable in the container — The criterion's risk is the install step, which `npm ci` closes; `npm ci` in the container was not run.
  - `[false]` `[reject]` Intent: README not exercised — Commands and warning match `package.json`, `.env.example` and the 1.8 finding; a claim of no run is not a defect.
  - `[low]` `[reject]` Intent: `.env` location unnamed — The repo records none; inventing one would be false. Owner fact, reported to Mika.
  - `[false]` `[reject]` Intent: 101001 versus 1001 — Follows the existing uid mapping.
  - `[false]` `[reject]` Intent: restore not run — The contract forbids it; a real run belongs on the LXC.

## Design Notes

Restore order: stop `bookeh` and the backup timer **[lxc]**; recover `.env` to `/opt/bookeh/.env`, chmod 600, from the operator's own safekeeping, since no backup holds it (a new `POSTGRES_PASSWORD` works on the empty cluster; a new `PAYLOAD_SECRET` only signs everyone out); empty `data/` and `media/` with the marker kept, and copy media and chown **[host]**; `docker compose -f compose.prod.yml up -d --wait postgres`, then `exec -T postgres pg_restore -U bookeh -d bookeh --exit-on-error < bookeh.dump` **[lxc]**; verify the collation query; start `bookeh` and the timer, sign in. The operator's secret store is not recorded anywhere in the repo, so the section says so plainly rather than naming one.

No screen behaviour changes: the deleted effect never had a cookie to read, so no walk.

## Verification

**Commands:**
- `npm run lint`, `npm run typecheck`, `npm run test:unit` -- expected: pass.
- `DATABASE_URL=postgres://bookeh:bookeh@localhost:5432/bookeh_test npm run build` -- expected: pass. Against the schema-pushed dev database the prerender stops at Payload's push prompt and times out.
- `node scripts/check-payload-versions.mjs` -- expected: exit 0; exit 1 on an edited scratch copy of the lockfile.
- `npm ci --dry-run` in a scratch copy with `.npmrc` -- expected: pass.
- `grep -rn "flashToast\|bookeh_flash\|flashCookie" src tests` -- expected: empty.

## Auto Run Result

Summary: `.nvmrc` is the Node source for CI and `engines`; compose runs `npm ci`; `legacy-peer-deps` stays because `npm ci` fails without it, and CI checks one Payload version in the lockfile; README rewritten; production restore written; flash chain and `images` removed.

Files: `.nvmrc`, `package.json`, `.github/workflows/ci.yml`, `scripts/check-payload-versions.mjs`, `docker-compose.yml`, `Dockerfile`, `README.md`, `deploy/README.md`, `deploy/backup.sh`, `next.config.ts`, `ToastProvider.tsx`, `RaiseToast.tsx`; `flash.ts`, `flashCookie.ts`, `flashCookie.unit.spec.ts` deleted; `epic-7-context.md` refreshed; `sprint-status.yaml`.

Review: patched 4 medium rows (2 entries by root cause: unverified backup before delete, partial restore) and 8 low; deferred 2 low issues; rejected 7 rows, reasons in the Triage Log. The patches were applied by the orchestrator, not the implementer.

Follow-up review: recommended (`true`). Named risk: the restore section has never been run, and its patched guards protect a destructive path. Story 7.27's LXC session is the place.

Verification: lint 0 errors (60 warnings), typecheck clean, unit 1088 passed, `check-payload-versions` exit 0 and exit 1 on an edited copy, `npm ci --dry-run` passed, grep empty, build passed on `bookeh_test`. The build fails on the dev database, also on the baseline: the prerender stops at Payload's push prompt. Integration lane not run, no screen changed, so no walk.

Residual risks: `.env` has no recorded safekeeping place; restore commands and `npm ci` in the container were not run; the local Node 22.16.0 is below `engines`.
