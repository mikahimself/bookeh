---
title: 'Story 4.10: [K12] Rehearsed restore at the cataloguing gate'
type: 'chore'
created: '2026-10-21'
status: 'done'
baseline_revision: '8f42998bcf6d8ecc0937e5c6410f6d255f3eb180'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/deploy/README.md'
warnings: []
deferred:
  - summary: >-
      deploy/README.md has no step-by-step production restore (recover .env secrets, empty data/, pg_restore through compose, copy media back with uid 1001 ownership); "Collation and restore" lists only the traps.
    evidence: |-
      Blind reviewer on story 4.10. The rehearsal proves the backup files are usable in a scratch stack; a real recovery onto the NAS still relies on prose from Story 2.3. The backup holds neither PAYLOAD_SECRET nor POSTGRES_PASSWORD, and nothing says where the operator keeps them.
    location: >-
      deploy/README.md, Collation and restore
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Backups (Story 2.3) are only checked with `pg_restore --list`. Nobody has proven that a dump and media copy bring the catalogue back (NFR-6), and a restore into a database without ICU silently keeps libc sorting.

**Approach:** Add `deploy/restore-rehearsal.sh`, run by the operator on the LXC. It restores the latest backup into a throwaway ICU `fi-FI` Postgres and scratch media directory, starts the production app image on them, checks collation, counts against production, sign-in and every cover, prints the time taken and cleans up. The README gets the procedure and a record for the operator's production run.

## Boundaries & Constraints

**Always:** POSIX `sh` in `backup.sh` style (`set -eu`, `umask 077`, root on the LXC). Production is reached only through `docker compose -f "$BOOKEH_COMPOSE_FILE" exec -T postgres psql`, and the tools are `docker`, `curl` and coreutils only. Read-only towards the production database, the media, the backup directory and `last-backup.json`. Scratch Postgres data goes on `--tmpfs` and the media copy in a `mktemp -d` directory (mode 700). An EXIT trap, with signals routed through `exit`, always removes the scratch containers, the network and the directory. The app listens only on `127.0.0.1:${BOOKEH_RESTORE_PORT:-3001}`. Credentials are read with echo off and reach `curl` on stdin, never through argv or the environment. Every failed check exits non-zero and names the check.

**Never:** running the production rehearsal or changing production (the operator does that and fills in the README record); app code, migrations or CI; a `--keep` mode or any option the checks don't need.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Happy path | Fresh backup, production idle | `icu`/`fi-FI`, counts match, sign-in gives a token, every cover returns 200; prints `OK` and the elapsed time | exit 0 |
| Explicit backup | `$1` = dated backup dir | That dir is used | No `bookeh.dump` or `media/` → exit 1 |
| No backup | Root missing or only `*.failed` | Refuses before creating anything | exit 1 |
| Production moved on | Row written after the dump | Names the differing tables, says to take a fresh backup | exit 1 |
| Wrong credentials / missing cover / no covers | — | `sign-in failed` / names the filename / `no covers to check` | exit 1 |
| Interrupted | Ctrl-C mid-run | Scratch removed | exit 130 |

</intent-contract>

## Code Map

- `deploy/backup.sh` -- the style to copy: env defaults, `compose()`, traps, guards first. Dated dirs `YYYYMMDD-HHMMSS` (failures `<ts>.failed`) hold `bookeh.dump` (`-Fc`) and `media/` (`cp -a`, owner uid 1001).
- `deploy/compose.prod.yml` -- `app`: env `DATABASE_URL`, `PAYLOAD_SECRET`, media at `/app/media`, health GET `/login`. `postgres:16-alpine3.24` with ICU init args, DB/user `bookeh`.
- `deploy/README.md` -- "Collation and restore" (l. 359); `scp` list in step 4 (l. 205) and `install` in step 5; the Updating note about reinstalling `backup.sh`; the acceptance checklist.
- `src/payload.config.ts` -- start-up migrations, seed and `sweepOrphanMedia` are no-ops or touch only the scratch copy.
- `src/collections/Media.ts` + `src/access/catalogue.ts` -- the admin reads every file at `/api/media/file/<filename>`. Login is `POST /api/users/login` → `{ token }`, sent back as `Authorization: JWT <token>`.
- Count `users`, `books`, `authors`, `series`, `media`, `copies`, `user_books`, `locations`. Covers: `books.cover_id` → `media.filename`.

## Tasks & Acceptance

**Execution:**
- `deploy/restore-rehearsal.sh` -- new, mode 755. Env: `BOOKEH_BACKUP_DIR`, `BOOKEH_COMPOSE_FILE`, `BOOKEH_RESTORE_PORT`, `BOOKEH_RESTORE_IMAGE` (default: the image ID of the running `app` container). Flow: pick the backup and run the guards → network and scratch Postgres (random password, wait for `pg_isready -h localhost`) → `pg_restore --exit-on-error` from stdin → collation check → copy media → app on loopback (wait for `/login`) → compare counts → sign-in prompt → GET every cover → elapsed time and `OK`.
- `deploy/README.md` -- add a "Restore rehearsal — [lxc]" section after "Collation and restore". It says when to run (at the cataloguing gate and after changes to backups or Postgres), the steps (a fresh `systemctl start bookeh-backup.service`, no cataloguing meanwhile, run the script) and what each check proves. It ends with a record table: date, backup, counts, covers checked, time taken, and confirmation that production held no test books, authors, series or covers before cataloguing. Also add the script to step 4, step 5 and Updating, add a checklist item, and fix "the seven files".

**Acceptance Criteria:**
- Given a running stack with users, books, copies and covers and a fresh `backup.sh` backup, when `restore-rehearsal.sh` runs, then it restores into an ICU `fi-FI` scratch database, starts the app image on it, and reports matching counts, a working sign-in and every cover loading. It prints the time taken, exits 0, and leaves no scratch container, network or directory behind.
- Given the README, when the operator follows "Restore rehearsal", then the steps install and run the script and record the date, counts, covers and time taken in `deploy/README.md`.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 34 findings — high 1, medium 7, low 21, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` (intent-alignment) The production rehearsal itself has not happened; the record row is empty — the intent assigns the run to "the operator" (story When clause); the agent cannot and must not run on production. Residual: NFR-6 is met only once Mika runs it and fills the record.
  - `[false]` `[reject]` (intent-alignment) No production disaster-recovery procedure; README steps are for a scratch restore — the story's And asks for the steps of this restore (into scratch), which are written; the real-recovery gap is logged separately (blind-hunter row, deferred).
  - `[low]` `[reject]` (intent-alignment) Counts compared with live production, not "at dump time" — the procedure (fresh backup, no cataloguing) makes them equal and any write fails loudly; capturing counts in backup.sh adds scope to a second script.
  - `[false]` `[reject]` (intent-alignment) Sign-in checked through REST, not the frontend — the frontend signs in through `payload.login` (`src/lib/payload/session.ts`), the same operation and password hashes the REST login uses.
  - `[false]` `[reject]` (intent-alignment) Covers checked through the file route, not as rendered — `coverUrl()` (`src/lib/books/coverUrl.ts:14`) renders covers from the same `/api/media/file/<filename>` route.
  - `[low]` `[patch]` (intent-alignment) Gate precondition "no test data" is only a record column — README now gives the query and the recreate action.
  - `[medium]` `[patch]` (verification-gap) Collation check only reads the scratch cluster's own initdb locale but README claims it proves the dump is locale-independent — wording narrowed to what it proves.
  - `[medium]` `[patch]` (verification-gap) Counts wording "every catalogue table" while genres and the relation tables are not counted — five tables added, wording fixed.
  - `[low]` `[patch]` (verification-gap) README says production's `.env` is never read; compose reads it for interpolation — reworded.
  - `[high]` `[patch]` (blind-hunter) README rehearsal step 1 "install as in steps 4 and 5" leads through `cp .env.example /opt/bookeh/.env`, wiping production secrets — exact scp/install commands given; Updating paragraph spelled out.
  - `[medium]` `[patch]` (blind-hunter) Counts miss genres/_rels/_texts/users_roles — grouped with the verification-gap counts row.
  - `[medium]` `[patch]` (blind-hunter) Collation check proves only the script's own setup — grouped with the verification-gap collation row.
  - `[low]` `[reject]` (blind-hunter) Counts against live production need a freeze; backup.sh could record counts — same as the intent-alignment dump-time row.
  - `[low]` `[patch]` (blind-hunter) Counts run after the app starts — moved before the app start (a reorder).
  - `[low]` `[patch]` (blind-hunter) Anonymous mktemp dir with all media unrecognisable after SIGKILL — named `bookeh-restore.XXXXXX`, checklist checks for leftovers.
  - `[low]` `[reject]` (blind-hunter) HTTP 200 does not prove a cover file is intact — `cp -a` copies whole files; a size comparison adds logic for an unlikely case.
  - `[low]` `[patch]` (blind-hunter) "Time taken" on tmpfs understates a real restore — README calls it a lower bound.
  - `[medium]` `[defer]` (blind-hunter) No documented step-by-step production restore (secrets, empty data/, pg_restore via compose, media back with uid 1001) — gap since Story 2.3's "Collation and restore", not caused by this story.
  - `[low]` `[patch]` (blind-hunter) Record says "commit it" in an [lxc] section; the LXC has no checkout — README says fill in on the dev machine. Image columns not added (low, not needed by the AC).
  - `[low]` `[patch]` (blind-hunter) No instructions for the "no test data" column — grouped with the intent-alignment gate row.
  - `[low]` `[patch]` (blind-hunter) `read -r` without `IFS=` strips whitespace; control chars make invalid JSON; Payload's error not shown — `IFS=` added; control-char escaping and error printing rejected (unlikely, adds branches).
  - `[low]` `[patch]` (edge-case) TABLES misses relation tables — grouped with the counts rows.
  - `[low]` `[reject]` (edge-case) Non-admin sign-in reports private covers as missing — README says to sign in as the admin; the failure is loud; a role guard adds a branch.
  - `[low]` `[patch]` (edge-case) `read` trims IFS whitespace — grouped with the blind-hunter sign-in row.
  - `[low]` `[reject]` (edge-case) Tab/control characters in the password break the JSON — unlikely; escaping all < 0x20 adds branches.
  - `[low]` `[patch]` (edge-case) Ctrl-C between `stty -echo` and `echo_off=1` leaves echo off — order swapped.
  - `[low]` `[patch]` (edge-case) `<ts>.failed/` with trailing slash slips past the refusal — one trailing slash stripped.
  - `[low]` `[reject]` (edge-case) Latest dir may be a backup still in progress — the procedure waits for the manual backup's OK and the timer runs at 03:30; a completion marker changes backup.sh.
  - `[false]` `[reject]` (edge-case) A coverless catalogue fails the rehearsal — intended: the story's Given is production with covers and its Then is "covers load"; the matrix specifies `no covers to check` as a failure.
  - `[false]` `[reject]` (edge-case) Filenames with spaces/% need URL encoding — every media file is named `<uuid>.<ext>` (`Media.ts` randomFilename, `covers.ts:217-221`).
  - `[medium]` `[patch]` (edge-case) Collation check cannot detect a locale-dependent dump — grouped with the collation rows.
  - `[low]` `[reject]` (edge-case) An app container that exits at once still waits 180 s — slow but correct failure; a running-state probe adds logic.
  - `[medium]` `[patch]` (edge-case, claim) README collation row overclaims — grouped with the collation rows; wording narrowed.
  - `[low]` `[patch]` (edge-case, claim) Script header counts claim overstates — grouped with the counts rows; wording fixed.

## Design Notes

Counts only mean something if nothing was written after the dump, so the procedure starts with a manual backup and a difference fails. The admin can fetch every cover, which proves the media copy is complete. `PAYLOAD_SECRET` is random per run, since Payload hashes passwords with a per-user salt, so production's `.env` is never read.

## Verification

**Commands:**
- `sh -n deploy/restore-rehearsal.sh` -- expected: no syntax errors

**Manual checks (if no CLI):**
- Local rehearsal: build the image from HEAD and run `deploy/compose.prod.yml` on scratch `BOOKEH_*` paths with a seeded admin. Add a book with a cover and a copy through REST, run `backup.sh`, then `restore-rehearsal.sh`, and expect exit 0 with nothing left in `docker ps -a`, `docker network ls` or the temp dir. Write a row after the dump and expect exit 1 naming the table; a wrong password gives `sign-in failed`.

## Auto Run Result

**Summary.** The story's code side is done: `deploy/restore-rehearsal.sh` restores a `backup.sh` run into a throwaway ICU `fi-FI` Postgres (on tmpfs) and a named scratch media directory, then starts production's app image on loopback. It checks the target collation, row counts for 13 tables against production (before the app starts), admin sign-in and every book cover. It prints the time taken and `OK`, and always cleans up. `deploy/README.md` has the "Restore rehearsal" procedure, what each check proves, the no-test-data query for the gate, and an empty record. **The production run itself is the operator's (story When clause) and has not happened.** NFR-6 is met only once Mika runs it on the LXC and fills in the record row. sprint-status therefore says `review`, not `done`; flip it to `done` with the record commit.

**Files changed**
- `deploy/restore-rehearsal.sh` -- new operator script (POSIX sh, mode 755).
- `deploy/README.md` -- Restore rehearsal section and record, the script in install steps 4/5, Updating, and the acceptance checklist.
- `_bmad-output/implementation-artifacts/epic-4-context.md` -- recompiled because the spine had changed since it was written.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 4.10 → `review`.

**Review findings.** 34 findings: high 1, medium 7, low 21, false 5.
- **Patched (12 entries):** the README install step that led through `cp .env.example` over production's `.env` (high); the counts table list and its wording (medium); the collation claim narrowed to what it proves (medium); the `.env` wording; counts moved before the app start; the named mktemp dir plus a leftover check; time taken called a lower bound; the record filled in on the dev machine; the no-test-data query; `IFS= read`; echo flag order; the trailing slash on `.failed/`.
- **Deferred (1):** no step-by-step production restore in the README (a gap since Story 2.3).
- **Rejected:**
  - The production run not done: the intent gives it to the operator.
  - Counts not taken "at dump time": the procedure makes them equal and any difference fails the run.
  - REST sign-in and the file route: `payload.login` and `coverUrl()` use the same paths.
  - Cover integrity by size, the non-admin guard, control characters in the password, an in-progress backup, an exited-app fast fail: all low and unlikely, and each needs added logic.
  - Coverless catalogue failing: intended by the matrix.
  - URL-encoding: filenames are `<uuid>.<ext>`.

**Follow-up review recommended: true** (patched: 1 high, 2 medium). The unverified risk is that the patched script (13 tables, counts moved before the app start, named scratch dir, `IFS=` read) passed only `sh -n`/`dash -n` and a 13-table count query against `bookeh_test`. It has not had an end-to-end local rehearsal since the patches. The high patch is README-only.

**Verification.**
- Before review: `sh -n` and `dash -n` passed. A full local rehearsal ran on a production-style stack built from HEAD (`compose.prod.yml`, seeded admin, a book, copy and cover via REST, `backup.sh`), driven by `expect`:
  - Happy path: exit 0 under both bash and dash.
  - Wrong password: `sign-in failed`, exit 1.
  - Production moved on: names `books (backup 1, production 2)`, exit 1.
  - Missing cover file: names the file, exit 1.
  - Guards: every guard row, exit 1.
  - Ctrl-C: exit 130.
  - No leftovers in `docker ps -a`, `docker network ls` or the temp dir.
- The `no covers to check` row was verified by reading the code only. Matrix rows are covered by these recorded local runs, the repo's pattern for deploy artifacts (Story 2.3); there are no automated tests for `deploy/`, by convention.
- After the patches: `sh -n` passed, and no `bookeh-restore*` containers or directories remain.

**Residual risks.**
- The production run is pending.
- The rehearsal time is a lower bound (tmpfs, local `/tmp`).
- The collation check confirms the target's initdb locale, not the data's sort order.
