---
title: '4.18 [D36] Lookup limit on saves and cover previews'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
baseline_revision: '29a00589abd60fbf02e671cee6d6493c6b6d49a7'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Only `lookupBook` counts against the per-user lookup limit (Epic 3 retro R2). A save with no held outcome asks Finna and Google Books unchecked (`saveCopy.ts:110`). Every cover preview request fetches from the source again, also unchecked (`coverPreview.ts:72`). So a runaway client can hammer the sources through either path.

**Approach:** A save counts one lookup only when `heldOutcome()` misses and it calls `lookupSources()`. The cover preview keeps fetched bytes on the user's preview record, keyed by URL and bounded in total bytes. It counts one lookup only when it fetches an image it does not already hold. A refusal is `RATE_LIMITED`. The save action passes it through, so the scan screen shows its "Too many lookups" toast. The cover route answers 429.

## Boundaries & Constraints

**Always:** The same per-user limit applies (`limitLookups(ctx)`, 30 per 60 s). A refused call asks no source and writes nothing. A save that finds a held Book or a held outcome counts nothing, and neither does a repeated `requestId`. A cover served from held bytes counts nothing. A failed cover fetch counts and is not kept. Held bytes live and die with their preview record: a new lookup of the ISBN keeps the bytes for URLs still in its list and drops the rest. Total held bytes stay under one `PREVIEW_BYTES` cap. Past it, the bytes of the oldest records go first, and the records themselves stay. The route still sends `Cache-Control: private, no-store`. `lookupLimit.ts`'s comment lists every caller. The spine's AD-9 limit line names the save on a miss and the cover preview.

**Never:** Counting the lookup inside the save transaction (the count happens before `withUndo`, where the sources are asked). Changing the limit's numbers or window. Caching failures. New collections, fields or migrations. Changing `lookupBook`'s own counting.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save, outcome held | User at the limit; `heldOutcome(isbn)` is `found` | Saved; no count, no source call | — |
| Save, miss | User at the limit; nothing held for the ISBN | `saveCopy` throws `RATE_LIMITED` before any source call; action returns `RATE_LIMITED` | Toast "Too many lookups. Wait a moment." |
| Save, held Book | Shared or own private Book exists | Unchanged: no count | — |
| Preview, first fetch | Record exists, bytes not held | Fetched once and held; counts 1 | Fetch failure: 404, counted, not held |
| Preview, repeat | Same user, ISBN, same URL (any `pick` pointing at it) | 200 from held bytes; no source request, no count | — |
| Preview over limit | Bytes not held, user at the limit | 429, no source request | Held bytes still served 200 |
| Re-lookup | `lookupBook` again for the ISBN, same URLs | Held bytes kept for URLs still listed | — |

</intent-contract>

## Code Map

- `src/lib/catalogue/lookupLimit.ts:5-8,20-27` -- the module comment and the docblock list the callers. Rewrite both to list them all: `lookupBook`, `saveCopy` (only on a held-outcome miss), and `fetchCoverPreview` (only for an image not held). `searchBooks` and `lookupAgain` must also call it when they arrive.
- `src/lib/catalogue/saveCopy.ts:108-116` -- the not-held branch calls `lookupSources()` directly. Change it to `heldOutcome(isbn13)` first, and on a miss `limitLookups(ctx)` then `lookupSources()`. Import `heldOutcome` from `@/lib/metadata/lookup`. Update the docblock (`:31-79`) with one sentence on the limit and the error list (`RATE_LIMITED`).
- `src/app/(frontend)/scan/actions.ts:9-47` -- `saveCopyAction` returns `NOT_FOUND` as it is and folds everything else into `SAVE_FAILED`. Let `RATE_LIMITED` through as well and update the doc comment. `saveManualAction` is unchanged (it never asks the sources). `useAddToLibrary.ts:71` already reports any code with its toast (`messages/*.json` `RATE_LIMITED`).
- `src/lib/catalogue/coverPreview.ts` -- `PreviewEntry` gains the held covers, keyed by URL: `Map<string, { bytes, mimeType }>`. `recordCoverPreview` carries over the old entry's covers whose URL is still listed. `fetchCoverPreview` serves held bytes, otherwise calls `limitLookups(ctx)` then `fetchCover`, and holds a success. Add `PREVIEW_BYTES` (32 MiB) and the eviction (drop the oldest entries' held covers until the total fits). Rewrite the module comment and the "Nothing is cached" docblock.
- `src/app/(frontend)/data/cover/[isbn13]/route.ts:5-15,44-48` -- map `DomainError` `RATE_LIMITED` to status 429. Doc comment: 429, server-held bytes, no HTTP caching.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:176` -- AD-9: "`lookupBook`, `searchBooks`, `lookupAgain`, a save that asks the sources and a cover preview fetch share one per-user rate limit".
- Tests: `tests/int/saveCopy.int.spec.ts` mocks `heldOutcome` as `vi.fn()` (`:46`), so existing cases see a miss. `tests/int/coverPreview.int.spec.ts` counts source requests with `hits` / `totalHits()` (`:20-22`). It reuses `asA` across tests, and with the new counts that user can pass 30 in a run, so give limit-sensitive cases their own user. `tests/int/lookupBook.int.spec.ts:299-325` is the limit test pattern (fake `Date`, `LOOKUP_LIMIT` loop).

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/saveCopy.ts` -- held outcome first, count on a miss -- AC 1.
- `src/app/(frontend)/scan/actions.ts` -- pass `RATE_LIMITED` through -- the toast that names the cause.
- `src/lib/catalogue/coverPreview.ts`, `src/app/(frontend)/data/cover/[isbn13]/route.ts` -- held bytes, count on fetch, 429 -- AC 2, 3.
- `src/lib/catalogue/lookupLimit.ts`, `ARCHITECTURE-SPINE.md` -- callers listed -- AC 4.
- `tests/int/saveCopy.int.spec.ts` -- one case: a user brought to the limit with `limitLookups`. Saving a held-outcome ISBN succeeds with no source call. Saving another ISBN with nothing held fails `RATE_LIMITED`, writes nothing and calls no source.
- `tests/int/saveCopyAction.int.spec.ts` -- the action returns `RATE_LIMITED` for a user at the limit, not `SAVE_FAILED`.
- `tests/int/coverPreview.int.spec.ts` -- (a) two GETs of one cover, and a `pick` pointing at the same URL, make one source request. A re-lookup with the same URL keeps it held. (b) At the limit, a cover not held answers 429 with no request, and a held one still answers 200. Rename "checked and uncached" to match.

**Acceptance Criteria:**
- Given a user at the lookup limit, when they save an ISBN whose outcome is not held, then `saveCopy` refuses with `RATE_LIMITED` before any source is asked, nothing is written, and the scan screen shows "Too many lookups. Wait a moment."
- Given a user at the lookup limit, when the cover preview is asked for an image not fetched before, then it answers 429 without a source request; a held image still answers 200.
- Given one image previewed several times by one user for one ISBN within the record's lifetime, when the requests arrive, then the source is asked once.
- Given `lookupLimit.ts` and the spine's AD-9, when read, then they list every caller of the limit.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 19, false 2, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: concurrent requests for one un-held URL each count and fetch — only reachable when two images loading at once share a URL; the picker opens on demand, after the Answer's cover (same URL as its row) is already held. Fixing needs an in-flight promise map, a new guard for a rare extra count.
  - `[low]` `[reject]` Blind: a 429 preview shows the title placeholder with no cause and no retry — only past 30 lookups a minute; `Cover.tsx` already shows the placeholder for any failed image, and naming the cause needs new client behaviour.
  - `[low]` `[reject]` Blind: the spec's 15-books-a-minute estimate leaves out the edition picker — the AC itself counts every preview image not fetched before; the fix is editing this build's spec.
  - `[low]` `[reject]` Blind: the save downloads a cover the preview already holds, uncounted — one image per Book the save creates or shares, repeatable only by a save/Undo loop; reusing preview bytes in `storeCover` adds a new path. The comment now names this exception (see the patch row below).
  - `[low]` `[patch]` Blind: `PREVIEW_BYTES` is not a hard cap (the kept record is never trimmed) and reads do not refresh recency — docblock reworded: the total can pass the cap by the served record's own covers. The recency part is rejected: a record a user is paging through loses at most its bytes, and a re-fetch costs one count.
  - `[low]` `[patch]` Blind: spine AD-14 still says the preview handler "streams" the cover — reworded: fetched once and held per user for the record's lifetime within a total byte cap.
  - `[low]` `[reject]` Blind: no test of the byte eviction — a test-only finding; the tests rule needs it to name a criterion or spine rule from its list, and the cap is a memory bound, not one of them.
  - `[low]` `[reject]` Edge: concurrent GETs for one un-held URL each count — same as the first row.
  - `[low]` `[patch]` Edge: a re-lookup while a fetch runs drops the fetched bytes — `fetchCoverPreview` now holds them on the live record when it still lists the URL (`coverPreview.ts`), not only on the record it started with.
  - `[low]` `[patch]` Edge: the kept record's own covers can pass `PREVIEW_BYTES` — same root cause as the cap row; docblock reworded.
  - `[low]` `[reject]` Edge: an expired record's held bytes carry over on re-record — the bytes are for the same URL, so nothing wrong is served; adding the expiry guard buys only a re-fetch.
  - `[false]` `[reject]` Edge: held bytes are served under a different `policy` — the only production caller (the route) passes the default `coverPolicy`; a custom policy is a test seam.
  - `[low]` `[reject]` Edge: AC 3 holds only for sequential requests — same as the first row.
  - `[low]` `[reject]` Verification gap: `PREVIEW_BYTES` / `keepWithinBytes` untested (filed `defer`) — rejected under the tests rule (test-only, no criterion or listed spine rule named); a test needs over 32 MiB of fixture images.
  - `[low]` `[reject]` Verification gap (other): simultaneous requests count twice — same as the first row.
  - `[low]` `[patch]` Verification gap (other): `lookupLimit.ts` says "every path that asks a source" calls the limit, but `storeCover()` does not — comment narrowed to lookups and preview fetches, naming the save's uncounted cover download.
  - `[low]` `[patch]` Intent: the save's cover download is not counted although the story says "every path" — the AC limits counting to the save's source lookup; the comment now says so (same patch as the row above). Counting the download is rejected as in the fourth row.
  - `[false]` `[reject]` Intent: bytes keyed by URL, not by pick — the AC's aim, one fetch per image, holds and is tested across picks; keying by pick would fetch one image twice (Design Notes).
  - `[low]` `[reject]` Intent: an image counts again after TTL, eviction or a failed fetch — failures are deliberately not held (Boundaries), and the others are the bounds AD-12 requires.
  - `[low]` `[reject]` Intent: the cover refusal reaches the UI as a placeholder, not `RATE_LIMITED` — same as the second row; the route's status is the cover handler's only answer (spine, Errors).
  - `[low]` `[reject]` Intent: tests do not exercise eviction, the replaced-record branch or concurrency — test-only, same as the eviction row.

## Design Notes

Bytes are keyed by URL inside the per-user, per-ISBN record, not by `pick`. The Answer shows the picked edition at `?pick=n` and the picker shows each candidate at `?pick=i`, so one image has two addresses. Changing the pick re-runs `lookupBook`, which re-records. Keying by URL and carrying held bytes over keeps it to one source request per image.

With a scan costing one lookup plus one preview, the limit allows about 15 books a minute. That is well above the 20-seconds-per-book target.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass (worktree Postgres on port 5433)

## Auto Run Result

Status: done

**Summary.** Every path that asks a source in the user's name now counts against the per-user lookup limit. A save with no Book held reads `heldOutcome()` first. Only a miss counts a lookup (`limitLookups()`) and asks the sources, before the transaction opens. Past the limit the save is refused with `RATE_LIMITED`, which `saveCopyAction` passes through, so the scan screen shows "Too many lookups. Wait a moment." The cover preview holds fetched bytes on the user's per-ISBN record, keyed by URL. A re-lookup keeps the bytes for URLs still listed, and all held bytes share a 32 MiB cap. Only a fetch of an image not held counts. Past the limit the route answers 429. `lookupLimit.ts` and spine AD-9 and AD-14 list the callers and the held bytes.

**Files changed**
- `src/lib/catalogue/saveCopy.ts`: held outcome first; counts on a miss.
- `src/app/(frontend)/scan/actions.ts`: `RATE_LIMITED` passes through.
- `src/lib/catalogue/coverPreview.ts`: held bytes by URL, carry-over on re-lookup, `PREVIEW_BYTES` cap, count before a fetch.
- `src/app/(frontend)/data/cover/[isbn13]/route.ts`: `RATE_LIMITED` → 429.
- `src/lib/catalogue/lookupLimit.ts`: every caller listed, plus the save's uncounted cover download.
- `ARCHITECTURE-SPINE.md`: AD-9 limit line, AD-14 preview sentence.
- Tests:
  - `saveCopy.int`: at the limit, a held outcome and a held Book save without counting; a miss is `RATE_LIMITED` with no source call and no write.
  - `saveCopyAction.int`: `RATE_LIMITED` comes back, not `SAVE_FAILED`.
  - `coverPreview.int`: one fetch per image across picks and a re-lookup; 429 at the limit with held covers still served; a failed fetch counts and is not held.

**Review findings.** 21 findings: 19 low, 2 false.
- **Patched (low, 4 entries):**
  - the `lookupLimit.ts` comment's overclaim;
  - the `PREVIEW_BYTES` docblock;
  - the AD-14 spine sentence;
  - bytes now held on the live record when a re-lookup lands mid-fetch.
- **Deferred:** none.
- **Rejected:** reasons in the Review Triage Log.
  - concurrent fetches of one URL (rare, needs an in-flight map);
  - 429 shown as the placeholder;
  - the picker's cost against the limit (AC-mandated);
  - the save's uncounted cover download (needs a save/Undo loop);
  - recency on read;
  - expired-record carry-over;
  - byte-eviction and branch tests (tests rule);
  - policy mismatch (false);
  - URL key (false);
  - re-fetch after TTL, eviction or failure (by design).

**Follow-up review:** false. Patched this pass: high 0, medium 0, low 4.

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (36 existing warnings in `src/migrations`).
- `npm run test:unit`: 42 files, 671 passed.
- `npm run test:int`: 40 files passed, 1 skipped (`migrationSchema`), 406 tests passed, on the worktree Postgres (port 5433).
- Prettier: clean on changed files.
- Playwright was not run.

**Residual risks**
- Opening the edition picker counts one lookup per cover not yet held. A Finnish ISBN with many records can cost about 10 lookups, so scanning several such books within a minute can show placeholder covers until the window resets.
- Two simultaneous requests for one un-held URL both fetch and count.
- Not tried by hand in a browser.
