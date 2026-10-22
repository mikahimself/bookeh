---
title: '5.37 [K14] Last backup in Settings'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: '7e70314e3e1e8391ff3b4a259e45c8e1c6f1588b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The nightly backup (2.3) records its outcome in `last-backup.json`, but nothing in the product shows it, so a backup that keeps failing goes unnoticed (NFR-6).

**Approach:** A small server-only reader next to the Settings page turns the file into a `LastBackup` (or `null` for a non-admin), and Settings renders one admin-only "Last backup" group from it in the second column, marked `danger` with "Backup is overdue." when the backup is overdue.

## Boundaries & Constraints

**Always:**
- Reader in `src/app/(frontend)/(sections)/settings/lastBackup.ts`: `readLastBackup(user: RoleHolder, file = BACKUP_STATUS_FILE, now = new Date()): Promise<LastBackup | null>`, with `BACKUP_STATUS_FILE = '/app/backup-status/last-backup.json'` (the read-only mount in `deploy/compose.prod.yml`). Type: `LastBackup = { kind: 'success' | 'failure'; time: Date; overdue: boolean } | { kind: 'missing'; overdue: true }`.
- A non-admin (`isAdmin` from `@/access/roles`, AD-2) gets `null` and the file is never read.
- Any read error (missing, unreadable), invalid JSON, a `time` that does not parse as a date, or an `outcome` other than `success`/`failure` gives `missing`. `failure` is always overdue. `success` is overdue when `now - time` is more than 48 hours (exactly 48 h is not).
- Settings page: when the result is not `null`, a `Group` headed "Backup" in the second column holds the line. The date is `format.dateTime(time, { dateStyle: 'medium', timeStyle: 'short' })` from next-intl's `getFormatter()` (locale from the profile, `Europe/Helsinki` from the request config).
  - success: "Last backup: {date}"; failure: "Last backup failed: {date}"; missing: "Last backup: none found".
  - When `overdue`, the line and a second line "Backup is overdue." are `text-danger`; otherwise the line is `text-text`.
- Messages in `settings` (en/fi): `backup` "Backup"/"Varmuuskopio"; `lastBackup` "Last backup: {date}"/"Viimeisin varmuuskopio: {date}"; `lastBackupFailed` "Last backup failed: {date}"/"Viimeisin varmuuskopiointi epäonnistui: {date}"; `lastBackupNone` "Last backup: none found"/"Viimeisin varmuuskopio: ei löytynyt"; `backupOverdue` "Backup is overdue."/"Varmuuskopio on myöhässä.".

**Never:**
- No change to `deploy/` (script, compose, README), no env var for the path, no new `src/lib` module, no Payload access, no client component.
- Do not read the file for non-admins. Do not throw from the reader.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh | admin; `{"time":"<now−2h>","outcome":"success","dumpSizeBytes":1}` | `success`, not overdue | — |
| Stale | admin; success, `time` = now − 48 h − 1 min | `success`, overdue | — |
| Failed | admin; `outcome` `failure`, `time` now − 1 h | `failure`, overdue | — |
| Missing | admin; file path does not exist | `missing` | read error swallowed |
| Malformed | admin; `not json`, or `time` `"yesterday"` | `missing` | parse error swallowed |
| Non-admin | user with roles `['user']`; any file | `null` | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/settings/page.tsx` -- `Group` helper; second column is the comment placeholder at the end; `requireUser()` gives `ctx.user`. 5.33 (parallel worktree) also fills that column: whichever merges second keeps both groups.
- `src/access/roles.ts` -- `isAdmin`, `RoleHolder`; lint requires role checks through these helpers.
- `deploy/backup.sh` `write_status` -- file shape `{"time":"YYYY-MM-DDTHH:MM:SSZ","outcome":"success"|"failure","dumpSizeBytes":n}`, written atomically.
- `src/i18n/request.ts`, `src/i18n/locale.ts` -- `timeZone = 'Europe/Helsinki'`; `src/app/(frontend)/scan/UnavailableAnswer.tsx` shows `getFormatter()` use.
- `src/app/(frontend)/styles.css` -- `--color-danger` token (`text-danger`).
- `messages/en.json`, `messages/fi.json` -- `settings` block; `tests/unit/messages.unit.spec.ts` checks en/fi key parity.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/settings/lastBackup.ts` -- new reader per Always; doc comment names NFR-6 and story 2.3.
- `src/app/(frontend)/(sections)/settings/page.tsx` -- call `readLastBackup(ctx.user)`; render the Backup group in the second column; update the page doc comment.
- `messages/en.json`, `messages/fi.json` -- the five `settings` keys.
- `tests/unit/lastBackup.unit.spec.ts` -- new; one case per matrix row, files written to a temp dir, `now` passed in.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.37 to `done` when finished.

**Acceptance Criteria:**
- Given an admin and a `last-backup.json` reporting success within 48 h, when they open `/settings`, then a line reads "Last backup: {date}" with the date in their language and Helsinki time, not in danger.
- Given an admin and a file older than 48 h, reporting failure, or missing, when they open `/settings`, then the line is in `danger` followed by "Backup is overdue.".
- Given a non-admin, when they open `/settings`, then there is no Backup group.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 15 findings — high 0, medium 0, low 9, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Edge: a `time` in the future is never overdue — `backup.sh` and the app share the LXC's kernel clock, so only a hand-edited file gets there; the fix adds a guard branch.
  - `[low]` `[reject]` Blind: a future-dated `time` is never overdue — same as the edge finding; same reason.
  - `[low]` `[reject]` Blind: read errors other than ENOENT are swallowed without a log — `write_status` sets 644 explicitly and the red "none found" line already sends the operator to `cat` the file (README checklist); logging adds a branch.
  - `[low]` `[patch]` Blind: the second-column comment in `page.tsx` no longer describes what follows it — reworded to name Backup, with the managed lists joining it later.
  - `[low]` `[patch]` Blind: EXPERIENCE.md defines only "Last backup: {date}" while the page has three wordings — the Last backup row now lists all three.
  - `[low]` `[patch]` Blind: no case pins exactly 48 h as not overdue (`>=` would pass) — the AC names "older than 48 hours"; added an `ago(48 * HOUR)` → not overdue assertion to the stale case.
  - `[false]` `[reject]` Blind: sprint-status says `done` while the spec says `in-review` — finalization sets the spec `done` in the same commit; the spec is the edge-case layer's claims file by design.
  - `[false]` `[reject]` Blind: Finnish "Viimeisin varmuuskopio: ei löytynyt" reads as a fragment — it mirrors the English label-colon-value pattern of the other two lines, and the string is fixed by the spec's intent contract.
  - `[low]` `[reject]` Verification gap: no test renders the page, so a swapped message key or inverted overdue line would pass — the repo has no server-page render tests and Playwright is limited to scan-to-save and shop check; the reader carries the logic and the gate, and moving the key choice into a helper only to test it adds surface.
  - `[low]` `[patch]` Verification gap: the exact 48 h boundary is untested — same as the blind finding; same patch.
  - `[low]` `[patch]` Intent: the diff renders two wordings the AC does not name — the AC's single template cannot carry a missing file (no date) or tell a failed run's time from a backup; grouped with the EXPERIENCE.md finding, whose patch records the wordings.
  - `[false]` `[reject]` Intent: overdue is not computed from the last *successful* backup after a failure — the file holds only the latest run, and the AC's "or reports a failure" makes every failure overdue, which the reader does.
  - `[false]` `[reject]` Intent: the date uses Helsinki, not a per-user time zone — the spine's Dates convention sets `Europe/Helsinki` once for every date shown; no per-user zone exists.
  - `[false]` `[reject]` Intent: tests exercise the reader, not the page surface — same as the verification-gap finding, which is rejected; the non-admin AC is covered through the reader by the spec's design.
  - `[false]` `[reject]` Intent: the work is uncommitted and statuses disagree — finalization commits and sets the spec `done`.

## Design Notes

The file holds only the latest run, so a failed run has no "last successful" date to show. Showing its time as "Last backup failed: {date}" says what is known; "none found" covers a missing or unreadable file (dev, NAS not mounted). The reader lives with the page because only Settings uses it and it touches no Payload data; the admin gate sits inside it so the unit test covers the AC's non-admin case without rendering the page.

## Verification

**Commands:**
- `npm run test:unit -- tests/unit/lastBackup.unit.spec.ts tests/unit/messages.unit.spec.ts` -- expected: passes
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

## Auto Run Result

**Summary:** Settings shows admins the outcome of the nightly backup (NFR-6). `readLastBackup(user, file?, now?)` next to the page reads `/app/backup-status/last-backup.json` (the read-only mount from 2.3) and returns `null` for a non-admin without reading the file. A missing, unreadable or malformed file is `missing`. A failure is always overdue, a success once it is more than 48 h old. The page's second column gets an admin-only Backup group: "Last backup: {date}", "Last backup failed: {date}" or "Last backup: none found". When overdue, it is in `danger` with "Backup is overdue.". The date is formatted by next-intl in the profile language and Helsinki time.

**Files changed:**
- `src/app/(frontend)/(sections)/settings/lastBackup.ts` (new): `BACKUP_STATUS_FILE`, `LastBackup`, `readLastBackup`.
- `src/app/(frontend)/(sections)/settings/page.tsx`: the reader and formatter in the page's `Promise.all`, the Backup group in the second column, doc comment and column comment.
- `messages/en.json`, `messages/fi.json`: five `settings` keys.
- `tests/unit/lastBackup.unit.spec.ts` (new): one case per matrix row, plus the exact 48 h boundary.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md`: the Last backup row lists the three wordings.
- `sprint-status.yaml`: 5.37 done.

**Review findings:** one pass, 15 rows in the Review Triage Log.
- **Patched:** 3 entries, all low: the column comment, EXPERIENCE.md wordings, the 48 h boundary assertion.
- **Deferred:** none.
- **Rejected:**
  - low: future-dated `time` (two rows), unlogged read errors, no page render test.
  - false: early `done` in sprint-status, the Finnish "none found" wording, last-success age after a failure, per-user time zone, reader-only test surface, uncommitted state.

**Follow-up review recommendation:** false. Patched high 0, medium 0, low 3.

**Verification:**
- `npm run test:unit -- tests/unit/lastBackup.unit.spec.ts tests/unit/messages.unit.spec.ts`: 36 passed, before and after the patches.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors (40 existing warnings in migrations).
- Prettier check on the changed source, test and message files: clean.
- Matrix audit: all six rows are covered by passing cases.
- Not rendered in a browser; the default path is checked against `deploy/compose.prod.yml` by inspection only.

**Residual risks:**
- 5.33 (parallel worktree) also fills the Settings second column. Whichever merges second keeps both groups.
- EXPERIENCE.md changed, so `epic-5-context.md` is older than the planning artifacts. The next epic-5 story run recompiles it.
- Nothing renders the page in a test. A wrong message key or an inverted overdue line would only show on screen.
