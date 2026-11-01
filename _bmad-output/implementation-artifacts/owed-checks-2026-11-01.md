---
story: 7.27
date: 2026-11-01
verdict: all-passed
---

# Owed checks on the phone and the LXC (story 7.27)

Run by Mika on 2026-11-01 on the installed PWA on an iPhone against production with Stories 7.16 to 7.26 deployed, in a desktop browser, and on the LXC. Mika reported every check as passing; only the foreign-key migration was reported with output, below. No check failed, so no fix landed in this story.

| # | Check | Result |
| - | ----- | ------ |
| 1 | Story 7.18 `foreign_keys` migration on a restored copy of the latest production dump, before deploy | Pass. `restore-rehearsal.sh` with `BOOKEH_RESTORE_IMAGE` set to the new image: signed in, covers checked 19, time taken 38 s, `OK`. Dump `/mnt/nas/bookeh/backups/20261101-101410`. |
| 2 | Book detail's Edit offers the camera | Pass |
| 2 | A camera photo goes through the touch corner crop | Pass |
| 2 | A HEIC photo uploads as the cover (closes `spec-5-18`'s deferred check) | Pass |
| 2 | Covers column counts at 375 and 390px | Pass |
| 2 | A covers view of a few hundred coverless copies scrolls smoothly | Pass |
| 3 | iOS keyboard over New location in the Move sheet | Pass |
| 3 | Sheet restore after history Back from Scan (5.12) | Pass |
| 3 | Done's focus on entering select mode | Pass |
| 3 | Lend and Returned reachable in Book detail's half-open sheet (6.7) | Pass |
| 3 | Wishlists sheet and picker | Pass |
| 4 | Camera comes back after Scan was in the background for a minute | Pass |
| 4 | Toast and full-screen task clear the notch in landscape | Pass |
| 5 | Keep-my-place with more than one page after Back from Scan and Edit book (desktop) | Pass |
| 6 | `deploy/README.md` acceptance checklist on the LXC | Pass |

Housekeeping: `docker rm bookeh-postgres-last-backup` is Mika's; not confirmed in this record.
