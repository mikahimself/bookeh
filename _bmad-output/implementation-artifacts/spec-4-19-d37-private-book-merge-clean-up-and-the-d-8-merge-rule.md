---
title: '4.19 [D37] Private-Book merge clean-up and the D-8 merge rule'
type: 'bugfix'
created: '2026-10-21'
baseline_revision: '0aa89e2ceb32fa94c249cb5f0200186dbc51a5a0'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      A merge that deletes a cover's media row and then rolls back is not tested to keep the cover file.
    evidence: |-
      deleteMediaRow() relies on payload.db.deleteMany leaving the file; switching it to payload.delete would unlink the file outside the transaction and no test would notice. The same gap exists on ensureSharedBook()'s restore.
    location: >-
      src/lib/catalogue/covers.ts deleteMediaRow
    severity: low
  - summary: >-
      A committed merge leaves the deleted cover's file on disk until the next start.
    evidence: |-
      sweepOrphanMedia() runs only from onInit, and there is no after-commit hook. Private covers exist only once Story 4.12 lands, so an after-commit unlink fits there.
    location: >-
      src/lib/catalogue/sharePrivateBook.ts removeOrphans
    severity: low
---

<intent-contract>

## Intent

**Problem:** When a save shares a private Book (promote) or merges it into the shared Book with its ISBN, the private authors, series and cover it used stay behind as orphans, and the merge deletes the private Book without checking whether anything still points at it, so Postgres would silently null that reference (Epic 3 retro R3). D-8 also keeps a typed value as an override when it differs from the source only by case, whitespace or punctuation, so "aleksis kivi." hides the source's "Aleksis Kivi" (R4).

**Approach:** The merge checks `isUnreferenced()` on the private Book after moving its copies and row, and throws if anything still references it, which rolls the save back. After a promote or merge, the private authors and series and the cover the private Book used are deleted when `isUnreferenced()`. D-8 compares a non-admin's values with the target on a loose key (case, whitespace and punctuation removed). The D-8 wording in epics.md (3.39, 5.35) and spine AD-5 follows.

## Boundaries & Constraints

**Always:** Every write stays in the save's transaction, so a failed check or delete rolls back everything, the downloaded cover file included. Only `visibility: 'private'` authors and series are deletion candidates, never shared ones. A cover is deleted only as its `media` row (`payload.db.deleteMany`, the file left to `sweepOrphanMedia()`), the same way `ensureSharedBook()`'s restore does it. Numbers (`seriesIndex`, `year`, `pages`) still compare exactly. The loose key keeps accents (ä ≠ a), like the Names convention. An admin's differing values are still all dropped.

**Never:** Changing `isUnreferenced()`, `mergeUserBook()`, `moveCopies()` or the Undo of a save (a share or merge is still not undone). Picking a candidate other than `candidates[0]` (that is Story 4.17). Touching another user's rows. A migration or schema change. Editing the PRD.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Merge, Book still referenced | User A's private Book X and a shared Book with its ISBN; another row (e.g. user B's copy) points at X | `saveCopy` rejects; X, A's copy and row on X unchanged; no new copy | Plain `Error` → `SAVE_FAILED` in the action |
| Promote leaves a private author | Private author "aleksis kivi K" only on X; source author "Aleksis Kivi K" | X shared with the shared author; the private author row is gone; no `authors` override | No error expected |
| Merge leaves author and cover | X has a private author and a `media` cover; shared Book's author has the same loose key | Copies and row move; X, its private author and its `media` row are deleted | No error expected |
| Still-used private author | X's private author also differs beyond the loose key, so it becomes the `authors` override | Author kept (the override references it) | No error expected |
| Loose D-8 | Non-admin; typed title "the  hobbit." vs source "The Hobbit", author "Aleksis Kivi." vs "Aleksis Kivi" | No override for title or authors; the source values show | No error expected |
| Real difference | Typed "T1" vs source "T2", or "Valtari" vs "Waltari" | Override kept, as before | No error expected |

</intent-contract>

## Code Map

- `src/lib/catalogue/sharePrivateBook.ts:138-183` -- `fromBook`/`fromCandidate`/`differing()`: the D-8 comparison. Text scalars compare by `!==`, authors and series by `toNameKey()`. Switch text scalars, author names and the series name to the loose key.
- `sharePrivateBook.ts:186-209` -- `readBook()` populates `authors`/`series` with `name` only. Add `visibility` so the clean-up can tell private rows.
- `sharePrivateBook.ts:231-282` -- `promote()`. After `upsertUserBook()` (overrides may still reference private authors), delete the orphans of `own`.
- `sharePrivateBook.ts:285-291` -- `merge()`. After `mergeUserBook()`, check `isUnreferenced(tx, 'books', ownId)` before `deleteRow`; afterwards delete the orphans.
- `sharePrivateBook.ts:84-91` -- `settleHeldBook()` doc: the D-8 paragraph says "exact equality"; rewrite it to the loose key and add the check and clean-up.
- `src/lib/catalogue/isUnreferenced.ts` -- read only. It counts every top-level relationship/upload field, so `user-books` override relations and `copies.book` are covered.
- `src/lib/catalogue/ensureSharedBook.ts:129-145,152-170` -- the restore's media delete (`payload.db.deleteMany`) and `deleteRow()` (books/authors/series). Move the media delete into a helper both callers use.
- `src/lib/catalogue/covers.ts:276-297` -- `attachCover`/`discardCover`; home for the media-row delete helper.
- `src/fields/nameKey.ts` -- `toNameKey()` (NFC, trim, collapse whitespace, lower-case). The loose key builds on the same idea; do not change `toNameKey` (it keys `nameKey` columns).
- `src/lib/catalogue/saveCopy.ts:42-51` -- doc paragraph on shares and merges; mention the clean-up and the loose compare.
- `_bmad-output/planning-artifacts/epics.md` -- Story 3.39 (≈:1490) and Story 5.35 ACs: "my differing hand-entered values are dropped; as another user, they become my overrides".
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:118` -- AD-5 auto-share bullet: "the creator's former values that differ become their overrides … the private Book is deleted".
- `tests/int/sharePrivateBook.int.spec.ts` -- `promoteSetup()` (:192), `privateBook()`, `sharedBook()`, `rowsOf()`, `trackCover()`. Its private author `aleksis kivi ${key}` differs from the source's only by case, so it is the promote orphan.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/covers.ts` -- add `deleteMediaRow(tx, id)`: deletes the `media` row with `payload.db.deleteMany`, leaving the file to `sweepOrphanMedia()`. `ensureSharedBook.ts`'s restore uses it.
- `src/lib/catalogue/sharePrivateBook.ts` -- (a) `looseKey(text)`: NFC, lower-case, every `\p{P}` and whitespace character removed; used for text scalars, author names (ordered) and the series name in `differing()`. (b) `merge()` throws a plain `Error` when `isUnreferenced(tx, 'books', ownId)` is false after the move. (c) `removeOrphans(tx, own)` after `promote()` and `merge()`: each private author and series `own` used, and `own.cover`, deleted when `isUnreferenced()`. Update the doc comments.
- `src/lib/catalogue/saveCopy.ts` -- doc comment: "differing" → beyond case, whitespace and punctuation; orphans removed.
- `ARCHITECTURE-SPINE.md` AD-5 bullet, `epics.md` Stories 3.39 and 5.35 -- the wording "differs beyond case, whitespace and punctuation"; AD-5 also says the merge deletes the private Book only when nothing else references it and removes the private authors, series and cover left unreferenced.
- `tests/int/sharePrivateBook.int.spec.ts` -- one case each: merge refused when another row references the private Book (rolled back, nothing moved); promote deletes the case-only private author; merge deletes the private author and the cover row; loose D-8 (title and author differing only by case, whitespace, punctuation → no row overrides).

**Acceptance Criteria:**
- Given a save that merges my private Book into the shared Book with its ISBN, when any other row still references the private Book after my copies and row moved, then the save fails and nothing it wrote remains.
- Given a promote or a merge, when it completes, then the private authors and series and the cover my private Book used are gone if nothing references them, and kept if something does (e.g. my override).
- Given I am not the admin, when my typed value differs from the source only by case, whitespace or punctuation, then no override is written and the source value shows; a value that differs beyond that still becomes my override.
- Given the planning docs, when read, then Stories 3.39 and 5.35 and spine AD-5 say "differs beyond case, whitespace and punctuation".

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 23 findings — high 0, medium 0, low 15, false 8, maybe-false 0
- findings:
  - `[low]` `[patch]` Verification gap: the series branch of `removeOrphans()` and the series loose compare never run (no private Book in the tests has a series) — one promote case added with a private series of the same loose key: the series row is gone, no `user-books` row.
  - `[low]` `[patch]` Verification gap: nothing checks that shared authors and series are never deleted — the same case gives the private Book a shared author that only it references, with a different `nameKey` but the same loose key as the candidate's, and asserts that it survives.
  - `[low]` `[defer]` Verification gap: a rolled-back merge after `deleteMediaRow()` is not tested to keep the cover file — the helper's file-after-rollback property was already untested on `ensureSharedBook()`'s restore; one helper test fits a cover story (4.12).
  - `[false]` `[reject]` Edge: a merge deletes the private cover when the shared Book has none — AC2 asks for exactly this deletion; moving a user's private cover onto a shared Book would publish another user's upload (Phase 3).
  - `[low]` `[reject]` Edge: another transaction can add a reference between `isUnreferenced()` and the delete — it needs the same user's concurrent saves to match the same private author mid-merge; the same window already exists in `ensureSharedBook()`'s restore, and locking adds complexity.
  - `[low]` `[patch]` Edge: `looseKey()` keeps soft hyphens, zero-width spaces and similar characters — the class is now `[\p{P}\p{Cf}\p{Sk}\s]`.
  - `[low]` `[patch]` Blind: epics 3.39 and 5.35 still say the private Book "is deleted" unconditionally — both now say "only when nothing else references it", with the clean-up, pointing at AD-5.
  - `[low]` `[patch]` Blind: the narrowed D-8 rule conflicts with PRD FR-12 and nothing records why — AD-5 now says it refines FR-12 (Epic 3 retrospective R4); the PRD stays untouched.
  - `[false]` `[reject]` Blind: the loose compare lets an all-caps or MARC-punctuated source beat tidy typing — the story's own goal is "the source's spelling wins over a typing difference" (AC3).
  - `[low]` `[patch]` Blind: `looseKey()` misses `\p{Cf}` and `\p{Sk}` — same root as the edge finding above; fixed there.
  - `[low]` `[patch]` Blind: the spine's "After either, …" can be read as after the failed save — reworded to "After a promote or a successful merge".
  - `[false]` `[reject]` Blind: the cover branch runs uselessly after a promote — it costs one count query on `books.cover`, and the promoted Book still references the cover, so the "when nothing references them" statement holds; one clean-up for both paths is simpler.
  - `[false]` `[reject]` Blind: a merge deletes the user's own cover when the shared Book has none — same as the edge finding; intended by AC2.
  - `[low]` `[defer]` Blind: a merged cover's file stays on disk until the next start (`sweepOrphanMedia()` runs only `onInit`) — the semantics of `deleteMediaRow()` predate this story, and private covers exist only from Story 4.12; an after-commit unlink belongs there.
  - `[low]` `[reject]` Blind: a "still referenced" failure shows "try again" and the log does not name the reference — no app path can reach it today (private Books are readable only by their creator); better diagnostics need a new return shape from `isUnreferenced()`.
  - `[low]` `[patch]` Blind: `deleteRow` lives in `ensureSharedBook.ts`, and `CatalogueCollection`'s doc says "a restore may delete" — the doc now also names the share clean-up; moving `deleteRow` is rejected as churn (createPrivateBook already imports it from there).
  - `[false]` `[reject]` Blind: the spec is oversized and untracked — Mika dismissed the `oversized` warning (Story 4.15 follow-up, deferred item 2), and the spec is committed with the story.
  - `[low]` `[patch]` Blind: tests leave matrix parts unchecked (series, merge-side loose compare) — the series part is covered by the new case; the merge-side loose compare is already exercised by the merge clean-up test, where the private author is deleted only because "X." and "X" give no `authors` override.
  - `[low]` `[reject]` Intent: the refusal is tested at service level, not via `saveCopyAction`'s `SAVE_FAILED` — the action's fold of every other failure into `SAVE_FAILED` is existing behaviour, tested in Story 4.16.
  - `[low]` `[patch]` Intent: series, shared-row exclusion and cover after a promote are untested — same root as the first two verification-gap rows; the cover after a promote cannot be orphaned.
  - `[false]` `[reject]` Intent: "the source value shows" is checked by storage only — with no override, `getEffectiveBooks()` shows the Book's value; that is existing, tested behaviour.
  - `[low]` `[patch]` Intent: in 3.39 and 5.35 the qualifier sits on the admin clause, which reads as if an admin's case-only differences were kept — both now read "as admin, my differing hand-entered values are dropped; as another user, those that differ beyond case, whitespace and punctuation become my overrides".
  - `[false]` `[reject]` Intent: the Epic 5 overview (epics.md:241) and PRD keep the old wording — :241 says "as in AD-5", which now carries the rule; the PRD is covered by the AD-5 note above.

## Design Notes

Loose key, not `toNameKey`: `nameKey` is a unique column and must keep punctuation ("A.B." and "AB" can be two authors), but D-8 only asks whether a typed value is worth keeping over the source's.

```ts
const looseKey = (text: string) => text.normalize('NFC').toLowerCase().replace(/[\p{P}\s]/gu, '')
```

The reference check sits after `moveCopies()` and `mergeUserBook()`, because before them the user's own copies and row legitimately point at the private Book. Today nothing else can (private Books are readable only by their creator), so the check is a guard against a silent `ON DELETE SET NULL`, not a user-facing case; a plain `Error` is enough.

PRD FR-12 still says "values that differ from the source's"; the story refines it in the epics and the spine only, and does not edit the PRD.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass (on the worktree's own Postgres, port 5435)

## Auto Run Result

Status: done

**Summary.** A save that shares or merges a hand-entered Book now leaves nothing behind. A merge checks `isUnreferenced()` on the private Book after its copies and row move, and throws when anything else still points at it, so the save rolls back instead of Postgres nulling that reference. After a promote or a merge, the private authors and series the Book used, and its cover's `media` row, are deleted when nothing references them; shared rows are never deleted, and a private author an override still uses stays. Under D-8 a non-admin's typed value that differs from the target only by case, whitespace or punctuation (`looseKey()`: NFC, lower-case, `\p{P}`, `\p{Cf}`, `\p{Sk}` and whitespace removed, accents kept) becomes no override, so the source value shows. Numbers still compare exactly; an admin's differing values are still all dropped.

**Files changed**
- `src/lib/catalogue/sharePrivateBook.ts`: `looseKey()` in the D-8 compare, the merge's reference check, `removeOrphans()` after promote and merge, `readBook()` reads author and series `visibility`.
- `src/lib/catalogue/covers.ts`: new `deleteMediaRow()` (row only, file left to `sweepOrphanMedia()`).
- `src/lib/catalogue/ensureSharedBook.ts`: its restore uses `deleteMediaRow()`.
- `src/lib/catalogue/saveCopy.ts`, `src/lib/catalogue/isUnreferenced.ts`: doc comments.
- `ARCHITECTURE-SPINE.md` AD-5: "differ beyond case, whitespace and punctuation (refines FR-12)", the reference check and the clean-up.
- `epics.md` Stories 3.39 and 5.35: the same D-8 wording, and the conditional delete with clean-up.
- `tests/int/sharePrivateBook.int.spec.ts`: five new cases (refused merge rolls back; promote deletes a case-only private author; promote deletes a private series and keeps a shared author; merge deletes the private author and cover row; loose D-8 writes no override) and one assertion (an override keeps its private author).

**Review findings.** 23 findings: 15 low, 8 false.
- **Patched (low, 7 entries):** a test for the series branch and the shared-row guard; `\p{Cf}`/`\p{Sk}` in `looseKey()`; epics 3.39/5.35 wording (qualifier on the non-admin clause, conditional delete); AD-5 notes that it refines FR-12 and reads "after a promote or a successful merge"; `CatalogueCollection` doc.
- **Deferred (2):** a rolled-back merge is not tested to keep the cover file; a committed merge's cover file stays until the next start. Both belong with Story 4.12.
- **Rejected:** the cover deleted on merge (intended by AC2); the race between check and delete (same window as the existing restore, needs locking); an all-caps source beating tidy typing (the story's goal); the cover branch after a promote (one count query); the "try again" message for an unreachable refusal; moving `deleteRow`; the oversized spec (dismissed by Mika in 4.15); action-level and display-level tests (existing tested behaviour); the Epic 5 overview (defers to AD-5).

**Follow-up review:** false. Only low entries were patched (high 0, medium 0, low 7).

**Verification:** `npm run typecheck` clean; `npm run lint` 0 errors (36 existing warnings in `src/migrations`); `npm run test:unit` 42 files, 670 passed; `npm run test:int` 40 files passed, 1 skipped (`migrationSchema`), 401 tests passed, on the worktree's Postgres (port 5435). Playwright was not run.

**Residual risks**
- The merge refusal cannot be reached through the app today; its test writes the referencing copy straight to the database.
- Removing all whitespace and punctuation treats "Anna-Liisa" and "Anna Liisa", or "TheHobbit" and "The Hobbit", as the same value; that is the rule as written.
- Story 4.17 changes `prepareShare()` in the same file; whichever merges second resolves the conflict.
- Not tried by hand in a browser.
