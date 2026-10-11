---
title: 'Story 2.3: [K4] Nightly backups'
type: 'feature'
created: '2026-10-11'
status: 'done'
route: 'dispatch'
baseline_commit: 'db0d83de552243dfa693d3935bec3caf73fa429d'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** Production (story 2.2) runs with no backups: a dead NAS volume, a bad migration or an accidental deletion takes the catalogue with it (NFR-6), and nothing records when a backup last succeeded.

**Approach:** Ship backup artifacts in `deploy/`: `backup.sh` (nightly `pg_dump` in custom format plus a copy of the media directory into a dated directory under the NAS backup path, self-verified with `pg_restore --list`, retention-pruned, refusing on an empty `users` table) driven by a systemd service + timer, writing `last-backup.json` to a status directory the app container mounts read-only. README gains the operator procedure; no app code changes.

## Boundaries & Constraints

**Always:**
- The script runs on the LXC as root, POSIX sh, `set -eu`, `umask 077`; it reaches Postgres only through `docker compose exec -T postgres` (local-socket trust in the container — no password handling, no client install on the LXC).
- Each run writes a fresh dated directory under `${BOOKEH_BACKUP_DIR}`; backup files and directories are operator-readable only (root + umask 077).
- Empty-database guard: when `select count(*) from users` is not a positive number, log an error and exit non-zero **before** dumping.
- Every run verifies its own dump with `pg_restore --list` before declaring success.
- Retention pruning runs only after a fully successful backup; a failing run never deletes anything.
- `last-backup.json` (`time` ISO-8601 UTC, `outcome` success|failure, `dumpSizeBytes`) is written atomically (tmp + `mv`) on success **and** failure, mode 644 in `${BOOKEH_STATUS_DIR}`, which the app container mounts read-only at `/app/backup-status` (consumed by story 5.37).
- Configuration via the deploy `.env` (systemd `EnvironmentFile=`), names prefixed `BOOKEH_`; the retention days are stated in `deploy/README.md`.
- Journal logging comes from systemd capturing stdout/stderr; the units carry `RequiresMountsFor=/mnt/nas/bookeh` and the timer sets `Persistent=true`.
- The script refuses when `${BOOKEH_BACKUP_DIR}` does not exist (it never creates the root — a missing NAS mount must fail, not back up to a local directory).
- **Decision (2026-10-11):** retention is **30 days** (`BOOKEH_BACKUP_RETENTION_DAYS` default 30, stated in README).
- **Decision (2026-10-11):** media is backed up as a **dated full copy per run**, inside the run's dated directory, pruned with it.

**Never:**
- No restore rehearsal (cataloguing gate, story 4.10) and no Settings UI for the status file (story 5.37).
- No app code, image or CI changes; no new dependencies on the LXC (no rsync, no cron).
- The status directory never lives inside `${BOOKEH_BACKUP_DIR}` (operator-only) or the media directory (served by Payload).
- No real secrets, hostnames or dates committed — templates and placeholders only.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nightly run | Timer fires, stack healthy, users > 0 | Dated dir with verified `bookeh.dump` + media copy; old runs pruned; success JSON | n/a |
| Empty database | `users` has 0 rows | No dump written; error in journal; failure JSON; exit non-zero | Old backups untouched |
| Stack down | `docker compose exec` fails | Failure JSON, non-zero exit, journal error | No pruning |
| NAS unmounted | `${BOOKEH_BACKUP_DIR}` missing | Script refuses before touching anything | `RequiresMountsFor` already blocks the systemd path |
| Corrupt dump | `pg_restore --list` fails | Run dir renamed `<ts>.failed`, failure JSON, non-zero exit | Failed dirs age out with retention |
| Manual run | Operator runs the script | Same behavior, output on the terminal | Same |

</frozen-after-approval>

## Code Map

- `deploy/backup.sh` -- new. Env (with defaults): `BOOKEH_BACKUP_DIR`, `BOOKEH_STATUS_DIR`, `BOOKEH_BACKUP_RETENTION_DAYS`, `BOOKEH_COMPOSE_FILE` (default `compose.prod.yml` relative to CWD — the unit sets `WorkingDirectory=/opt/bookeh`; override for the local rehearsal). Flow: guard dirs → users-count guard (`psql -tAc`) → `pg_dump -U bookeh -Fc bookeh > <ts>/bookeh.dump` → `pg_restore --list < dump > /dev/null` → `cp -a` media → prune `find "$BOOKEH_BACKUP_DIR" -mindepth 1 -maxdepth 1 -type d -name '20*' -mtime +N` → status JSON; a failure trap writes the failure JSON.
- `deploy/bookeh-backup.service` -- new oneshot: `EnvironmentFile=/opt/bookeh/.env`, `WorkingDirectory=/opt/bookeh`, `ExecStart=/opt/bookeh/backup.sh`, `RequiresMountsFor=/mnt/nas/bookeh`, `After=docker.service`.
- `deploy/bookeh-backup.timer` -- new: `OnCalendar=*-*-* 03:30`, `Persistent=true`, `WantedBy=timers.target`.
- `deploy/compose.prod.yml` -- app service gains `- ${BOOKEH_STATUS_DIR}:/app/backup-status:ro`; nothing else moves.
- `deploy/.env.example` -- add `BOOKEH_BACKUP_DIR=/mnt/nas/bookeh/backups`, `BOOKEH_STATUS_DIR=/mnt/nas/bookeh/backup-status`, `BOOKEH_BACKUP_RETENTION_DAYS` with one-line comments.
- `deploy/README.md` -- extend in its per-machine tag style: host-side dir creation mirroring step 3 (unprivileged uid shift: backups `chown 100000`, `chmod 700`; status dir 755 so its 644 file is readable by app uid 101001), the three new files added to the copy lists (steps 4–5, "Updating the deploy files"), timer install (`systemctl enable --now bookeh-backup.timer`), retention days, manual run + `journalctl -u bookeh-backup`, checklist additions (manual run verified, permissions, timer in `systemctl list-timers`; the empty-DB refusal is proven in the local rehearsal, not on production).
- `deploy/postgres-entrypoint.sh`, `deploy/bookeh.service` -- read-only; the marker/mount guards stay as they are.
- `docker-compose.yml` -- read-only; same service/user/db names (`postgres`/`bookeh`/`bookeh`) make it the local rehearsal target via `BOOKEH_COMPOSE_FILE`.

## Tasks & Acceptance

**Execution:**
- [x] `deploy/backup.sh` -- write the script per Code Map -- the story's core behavior, guards included.
- [x] `deploy/bookeh-backup.service` + `deploy/bookeh-backup.timer` -- create the units -- nightly firing, journal logging, missed-run catch-up.
- [x] `deploy/compose.prod.yml` -- add the status mount -- the app container can read `last-backup.json`.
- [x] `deploy/.env.example` -- add the three variables -- single env file keeps holding every path.
- [x] `deploy/README.md` -- operator procedure, retention days, checklist additions -- the LXC has no checkout; README is the deploy interface.

**Acceptance Criteria:**
- Given a running dev Postgres with the seeded user, when `backup.sh` runs locally with stub env (rehearsal), then a dated directory holds a custom-format dump that `pg_restore --list` reads cleanly plus a media copy, and `last-backup.json` reports success with the dump size.
- Given a database whose `users` table is empty, when the script runs, then it exits non-zero with a clear error, writes a failure JSON, and the backup directory's prior contents are unchanged.
- Given backup dirs older than the retention and one fresh success, when the script completes, then only the old dated directories are gone.
- Given a stub env, when `docker compose -f deploy/compose.prod.yml config` runs, then it resolves warning-free including the new status mount.
- Given `deploy/README.md`, when read, then it states the retention days, the timer install, the manual-run and journal commands, and the updated copy lists and acceptance checklist.

## Implementation Notes

- `backup.sh` guards, in order: backup dir exists (never created), status dir exists, media dir exists, retention is numeric, `users` count positive — all before any write. The EXIT trap handles every failure: computes the partial dump size, renames the run dir to `<ts>.failed` when it exists, writes the failure JSON (`|| true`, so a dead NAS can't mask the non-zero exit).
- Status JSON is a single line (`{"time":...,"outcome":...,"dumpSizeBytes":...}`), written 644 via tmp + `mv` in the status dir (same filesystem, atomic).
- Media dir comes from the existing `BOOKEH_MEDIA_DIR` (already in the deploy `.env`, loaded by `EnvironmentFile=`); defaults in the script match production paths so the unit works even with an older `.env`.
- README: backup/status dirs added to step 3 (host-side, `chown 100000`, 700/755); copy lists in steps 4–5 and "Updating the deploy files" extended; timer install folded into step 7 (now "systemd units") to avoid renumbering the step-8 cross-references; new "Backups — [lxc]" section carries retention, manual run, journal and status-file details; three checklist items added.
- Rehearsal performed against the dev stack (see Verification); the dev DB was left as found (temporary `rehearsal@example.invalid` user inserted and deleted, users count back to 0).

Verification run 2026-10-11:
- `sh -n deploy/backup.sh` clean (shellcheck not installed locally).
- Rehearsal, dev compose + scratch dirs: empty users table → refusal before dumping, failure JSON, exit 1, prior backup untouched; seeded user → dated dir with `pg_restore --list`-verified dump (36110 bytes) + media copy, success JSON 644 with size, backdated `20250901-033000` dir pruned; forced mid-run `cp` failure → run dir renamed `<ts>.failed`, failure JSON with partial dump size, earlier success untouched.
- `docker compose -f deploy/compose.prod.yml --env-file <stub> config -q` silent, exit 0.
- `npm run lint && npm run typecheck && npm test` clean (8 pre-existing lint warnings in migrations, 0 errors; 550 unit + 105 int + 53 e2e passed).

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass

- `[medium]` `[patch]` (edge-case-hunter + verification-gap, grouped) `compose.prod.yml` requires `BOOKEH_STATUS_DIR` with no interpolation default and README's update path never says to add the new variables — the already-deployed LXC's `.env` predates them, so re-copying the compose file and running `up -d` fails (`invalid spec: :/app/backup-status:ro`, reproduced by the reviewer) and the app cannot be updated or restarted. Fix: `${BOOKEH_STATUS_DIR:-/mnt/nas/bookeh/backup-status}` (mirrors the script default) + an "add the new variables to `.env`" line in the Updating section.
- `[medium]` `[patch]` (blind-hunter) `bookeh-backup.service` has only `After=docker.service` — nothing orders it after the compose stack, so a `Persistent=true` catch-up run at boot fires before the containers are up, `compose exec` fails, and the caught-up backup is lost until next night. Fix: `After=bookeh.service docker.service` + `Wants=docker.service`.
- `[medium]` `[patch]` (edge-case-hunter) POSIX sh does not run the EXIT trap when killed by an untrapped signal: `systemctl stop`/shutdown mid-run (SIGTERM) leaves a partial dump under a dated (restorable-looking) name and a stale success status. Fix: trap TERM/INT/HUP to exit through the handler.
- `[medium]` `[patch]` (blind-hunter) the one compose change (the ro status mount) is never verified on the LXC — the checklist checks the NAS-side file but not that the app container can read it. Fix: checklist item `docker compose exec app cat /app/backup-status/last-backup.json`.
- `[low]` `[patch]` (blind-hunter + edge-case-hunter, grouped) no concurrency guard and README offers a direct `./backup.sh` that can overlap a timer run (interleaved prune/status writes). Smallest fix: recommend only `systemctl start bookeh-backup.service`, which systemd serializes — drop the direct-run alternative.
- `[low]` `[patch]` (blind-hunter) README Backups section says the Collation and restore section is "above"; it is below. One-word fix.
- `[low]` `[patch]` (blind-hunter) retention comment says "older than this many days are pruned" while `-mtime +N` prunes once strictly older than N+1 days, keyed on directory mtime. Fix: state the actual rule in the `.env.example` comment.
- `[low]` `[patch]` (blind-hunter) `last-backup.json` lives on the NAS, so the failure it exists to report (NAS outage, unit blocked) leaves it stale at the previous success — the consumer must treat a stale `time` as failure, which only the epics file records. Fix: one README line handing that rule to story 5.37.
- `[low]` `[patch]` (blind-hunter, self-noticed scope: orchestrator's own edit) `sprint-status.yaml` `last_updated` lost its time component. Fixed directly by the orchestrator.
- `[low]` `[reject]` (blind-hunter) docker auto-creates `${BOOKEH_STATUS_DIR}` locally when the NAS is unmounted, "defeating" the script's status-dir guard — refuted in substance: the backup root is not a compose bind so the script's main guard stands, and the README's existing unclean-shutdown bullet already documents removing auto-created directories under `/mnt/nas/bookeh` and restarting; no net new harm beyond that documented scenario.
- `[low]` `[reject]` (blind-hunter) `BOOKEH_COMPOSE_FILE` / script `BOOKEH_MEDIA_DIR` default absent from `.env.example`, UTC-vs-local-time unstated — the compose-file knob is a rehearsal-only override that does not belong in the production template, `BOOKEH_MEDIA_DIR` is already in the file, and the timestamp nuance has no user-noticeable consequence.
- `[low]` `[reject]` (edge-case-hunter) a prune or status-write failure after a verified dump renames the valid run `.failed` — fails safe: nothing is deleted, the operator is alerted by the failure JSON and journal, the next night recovers; moving `ok=1` earlier would guard an undemonstrated state by weakening the failure report.
- `[low]` `[reject]` (edge-case-hunter) media file deleted/replaced between `cp -a` readdir and copy fails the run — single-user app idle at 03:30; one failed night self-heals; the retry guard adds complexity for an undemonstrated state.
- `[medium]` `[defer]` (verification-gap, pre-verified, reviewer's own disposition) the script's failure branches (empty-DB refusal, dump verification, `.failed` rename, prune-on-success-only) have no repeatable verification — a later edit that drops `pg_restore --list` or breaks the trap ships green. Matches the repo's deliberate deploy-artifact pattern (story 2.2 accepted the same way; tests-at-a-functional-minimum). Recorded in deferred-work with the reviewer's cheap partial close (commit the rehearsal as a rerunnable script; revisit when story 5.37 pins the status-file contract).

## Design Notes

- **Compose project resolution:** `-f compose.prod.yml` from `/opt/bookeh` resolves the same project (and `.env` interpolation) as the stack `bookeh.service` starts from the same directory; `-T` keeps stdin/stdout clean for `> dump` / `< dump` piping.
- **Failed runs stay visible:** `<ts>.failed` keeps evidence, is never mistaken for a restorable backup, and still matches the prune pattern so it ages out.

## Verification

**Commands:**
- `sh -n deploy/backup.sh` -- expected: parses clean (plus shellcheck if available).
- Local rehearsal against dev compose (`BOOKEH_COMPOSE_FILE=docker-compose.yml`, scratch backup/status dirs): users present -- verified dump + media copy + success JSON; empty-table variant -- refusal, failure JSON, non-zero exit; backdated dir (`touch -d`) -- pruned on next success.
- `docker compose -f deploy/compose.prod.yml --env-file <stub> config -q` -- expected: silent.
- `npm run lint && npm run typecheck && npm test` -- expected: clean (no app code touched; proves it).

**Manual checks (if no CLI):**
- On-LXC acceptance (timer firing, journal lines, NAS permissions) is the README checklist, performed by the operator as in story 2.2.
