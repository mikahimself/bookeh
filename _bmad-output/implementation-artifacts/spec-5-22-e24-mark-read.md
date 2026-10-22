---
title: '5.22 [E24] Mark read'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: 'cb11637b73bd9befd9c4b5906f115314efb651e2'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Book detail (5.23) and select mode (5.29) both mark Books read or unread, and there is no service for it yet. Read belongs to the user and the Book, not a copy (AD-18), so a selection of copies must act on its distinct Books, and the change must be undoable (AD-20).

**Approach:** Add `setRead(ctx, target, value | 'toggle')` to `lib/books`, an undoable service function (`Undone<T>`) that resolves the target to distinct Book ids, resolves `toggle`, writes through `upsertUserBook()` in one transaction and returns a restore of each changed Book's previous flag.

## Boundaries & Constraints

**Always:**
- `target` is `{ copyIds: readonly number[] }` or `{ bookId: number }`; `value` is `boolean | 'toggle'`.
- Copy ids: duplicates count once. An empty list, an id that is not a positive safe integer, or a copy that is not the viewer's (gone, or another user's, the admin included) fails with `NOT_FOUND` before any write. The find filters on `owner` explicitly, as `moveCopies` does. The Books are the distinct `book` ids of those copies.
- Book id: `requireOwnBook(ctx, bookId)` first (AD-7), so a Book the viewer holds no copy of fails with `NOT_FOUND` before any write.
- Current flags come from the viewer's `user-books` rows for those Books; a missing row is unread.
- `toggle` resolves to `false` when every target Book is read, otherwise `true`.
- Each Book whose flag differs from the resolved value is written with `upsertUserBook(tx, bookId, { read })`, one after the other, inside `withTransaction` (joins the caller's, AD-16). A Book already at the value is not written and not in the restore.
- Result: `Undone<{ read: boolean; count: number }>`, where `read` is the resolved value and `count` the number of distinct target Books (written or not), for the toast "Marked {n} read".
- The restore closes over Book ids and previous flags only. For each, it counts the viewer's `user-books` row first and skips the Book when the row is gone (a failed call would end the transaction), else writes the previous flag through `upsertUserBook`.

**Never:**
- No server action, no UI, no strings (5.23, 5.29). No `setRating`.
- No direct `user-books` writes outside `upsertUserBook` (AD-18). No receipt recording inside `setRead` (callers use `withUndo`).
- No wishlist-entry target handling: `requireOwnBook` gains open entries in Epic 7.
- Undo does not delete a `user-books` row the action created; a row with `read: false` reads the same as none.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Mixed toggle | A: copies c1, c2 of Book x (no row), c3 of Book y (read) | `{copyIds:[c1,c2,c3]}`, `toggle` → x read, y untouched; `{ read: true, count: 2 }` | — |
| Undo | after Mixed toggle | x unread, y still read | — |
| All read | x and y read; `{bookId: x}` and copies of both | `toggle` → unread | — |
| Not mine | B's copy id, or a Book A holds no copy of | nothing written | `NOT_FOUND` |
| Row gone | after setRead, A's row on x deleted, then Undo | Undo succeeds, x skipped | — |

</intent-contract>

## Code Map

- `src/lib/books/upsertUserBook.ts:79` -- the only `user-books` writer; a state-only `{ read }` write creates the row lazily and leaves overrides alone.
- `src/lib/books/requireOwnBook.ts` -- the Book-id gate.
- `src/lib/copies/moveCopies.ts` -- the pattern to follow: id validation, owner-filtered `gateway.find` on `copies`, `withTransaction` returning `{ data, restore }`, sequential writes, count-before-write restore.
- `src/lib/undo/undo.ts` -- `Undone<T>`, `Restore`, `withUndo`, `undo`.
- `src/lib/payload/gateway.ts` -- `find`/`count`; `user-books` access scopes reads to the viewer (AD-6).
- `tests/int/moveCopies.int.spec.ts` -- seeding (`createUser`, `contextFor` from `tests/helpers/harness`, `randomIsbn`), the `withUndo` + `undo` test shape, the `failure()` helper.
- Spine `ARCHITECTURE-SPINE.md` → Structural Seed `// src/lib/books` (line ~409) for the shared shape; AD-18 already states the rule.

## Tasks & Acceptance

**Execution:**
- `src/lib/books/setRead.ts` -- export `ReadTarget` and `setRead()` per Always, with a doc comment in the style of `moveCopies`.
- `tests/int/setRead.int.spec.ts` -- one case per matrix row group: Mixed toggle with Undo (through `withUndo`/`undo`); All read via both target kinds; Not mine (B's copy id and an unheld Book id, nothing written); Row gone (Undo resolves).
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- under Shared shapes `// src/lib/books`, add `type ReadTarget = { copyIds: number[] } | { bookId: number } // setRead(ctx, target, value | 'toggle'): Undone<{ read; count }>`.

**Acceptance Criteria:**
- Given copy ids or a Book id, when `setRead` runs, then it applies to the distinct Books through `upsertUserBook` in one transaction.
- Given `toggle`, when every target Book is read, then it resolves to unread, otherwise to read.
- Given a `setRead` wrapped in `withUndo`, when Undo runs, then each changed Book's previous read flag is back, and an integration test shows it.
- Given this story's commit, when the spine is read, then its `lib/books` shared shapes list `ReadTarget` and the `setRead` signature.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 21 findings — high 0, medium 2, low 12, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: the Undo test cannot catch a restore that touches the unchanged Book `y` (AD-20: never touch a row the action did not change) — `y` stays read either way. Fix: the test sets `y` unread after the action and asserts Undo leaves it unread.
  - `[low]` `[patch]` Blind: the spine's `ReadTarget` says `copyIds: number[]`, the code `readonly number[]` — fixed the spine line to `readonly number[]`, as `moveCopies` takes.
  - `[low]` `[reject]` Blind: copy-id validation runs after `withTransaction` opens, unlike `moveCopies` — callers run it inside `withUndo`, which has already opened the transaction, so moving the check changes nothing; it still fails before any write.
  - `[false]` `[reject]` Blind: a wishlist-only Book id fails silently against AD-18 — no `wishlist-entries` collection exists yet, so no such Book can exist; AD-7 already puts entries in `requireOwnBook`, which says they join in Epic 7, and `setRead` goes through it.
  - `[low]` `[reject]` Blind: each row is read twice forward and three times on Undo — a selection is ticked by hand (no select all), so tens of queries at most; batching adds a second read path beside `upsertUserBook`, the single writer.
  - `[low]` `[reject]` Blind: when every Book already has the explicit value, Undo is offered for nothing — `toggle` always changes something, and Book detail's switch sends the opposite of the shown state; an empty Undo is harmless, and a "written" count adds public surface.
  - `[low]` `[reject]` Blind: another local `idOf` — the module's existing idiom (`holdings.ts`, `effectiveBook.ts`); a shared helper means touching six files outside the story.
  - `[low]` `[reject]` Blind: "the caller's transaction or one of its own" vs AD-20's "opens no transaction" — the same wording as `moveCopies`; `withTransaction` joins the `withUndo` transaction, so no second one opens in use.
  - `[false]` `[reject]` Edge: `idOf(null)` crash when an admin deletes a Book — `copies.book_id` is `NOT NULL` (`20261018_162301_copies.ts:9`), so the FK's `set null` makes the delete fail; a copy never has a null `book`.
  - `[low]` `[reject]` Edge: a held Book made private and unreadable, with no row, gives a raw `ValidationError` on the lazy create — `upsertUserBook`'s documented behaviour; it takes an admin visibility change on a Book a user holds, which is rare, and a guard adds a Book read to every call.
  - `[false]` `[reject]` Edge: Undo overwrites a newer flag — AD-20: a restore writes the previous values "whatever they hold now".
  - `[low]` `[reject]` Edge: after `mergeUserBook` re-points the row before Undo, the restore skips it — the row left its Book, which AD-20 treats as gone; this takes an auto-share merge within the 30-minute receipt window.
  - `[low]` `[reject]` Edge: a huge `copyIds` list could exceed the Postgres parameter limit — select mode has no select all (EXPERIENCE), so a hand-ticked list stays far below 65,535.
  - `[medium]` `[patch]` Verification gap: Undo of a mark-unread (previous `true`) never runs, so a restore that always writes `false` or deletes the row passes (AC 3). Fix: a new case marks a read Book unread by Book id, undoes it, and asserts read again with the row kept.
  - `[low]` `[patch]` Verification gap (other): spine/code `readonly` mismatch — same root as the Blind spine row; same fix.
  - `[medium]` `[patch]` Intent: Undo of a `{ bookId }` target and of a toggle to unread is not exercised — same root as the verification-gap row; covered by the new case.
  - `[low]` `[reject]` Intent: no test forces a failure partway through the writes, so "one transaction" is shown only by reading the code — the writes all run on one `withTransaction` context, whose rollback is tested in its own spec; fault injection mid-loop goes past the functional-minimum convention.
  - `[false]` `[reject]` Intent: a Book id for a wishlist-only Book gets `NOT_FOUND` — same as the Blind wishlist row; no entries exist before Epic 7.
  - `[false]` `[reject]` Intent: Undo leaves behind a row the action created — the action changed that row's flag, and the restore writes the previous flag; `read: false` reads the same as no row (spec Never).
  - `[false]` `[reject]` Intent: the spine/code `readonly` mismatch — duplicate of the Blind spine row, handled there.
  - `[false]` `[reject]` Intent: admin own-copies-only and a malformed id are untested — the owner filter is tested with another user's copy; the id guard is a one-line copy of `moveCopies`'s, tested there.

## Design Notes

Restore per Book, so a gone row is skipped without ending the transaction:

```ts
const { totalDocs } = await gateway.count(rtx, { collection: 'user-books', where: { book: { equals: bookId } } })
if (totalDocs > 0) await upsertUserBook(rtx, bookId, { read: previous })
```

## Verification

**Commands:**
- `npm run test:int -- tests/int/setRead.int.spec.ts` -- expected: passes
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

## Auto Run Result

**Summary:** `setRead(ctx, target, value | 'toggle')` in `lib/books` marks the distinct Books of a copy selection, or one Book, read or unread for the viewer (AD-18).
- Copy ids are checked as `moveCopies` checks them (owner filter, `NOT_FOUND` before any write); a Book id passes `requireOwnBook()`.
- `toggle` resolves to unread only when every target Book is read.
- Only Books whose flag differs are written, through `upsertUserBook`, in one transaction.
- It returns `Undone<{ read; count }>` (`count` = distinct target Books). The restore writes each changed Book's previous flag back and skips a Book whose row is gone.

**Files changed:**
- `src/lib/books/setRead.ts` (new): `ReadTarget` and `setRead()`.
- `tests/int/setRead.int.spec.ts` (new): mixed toggle with Undo (an unchanged Book is left alone), Undo of a mark-unread, toggle to unread by both target kinds, `NOT_FOUND` refusals, Undo with the row gone.
- `ARCHITECTURE-SPINE.md`: `ReadTarget` and the `setRead` signature under the `lib/books` shared shapes.
- `sprint-status.yaml`: 5.22 done.

**Review findings:** one pass, 21 rows in the Review Triage Log.
- **Patched:** medium 1 (Undo of a mark-unread untested; new case), low 2 (Undo test now shows an unchanged Book stays out of the restore; spine `readonly`).
- **Deferred:** none.
- **Rejected:** validation placement inside the transaction, repeated row reads, an Undo offered when nothing changed, another local `idOf`, inherited transaction wording, a private unreadable Book's raw `ValidationError`, a merge between action and Undo, huge selections, a mid-loop failure test (all `low`); the null-`book` crash (`book_id` is `NOT NULL`), Undo overwriting newer flags (AD-20), the wishlist-only Book (no entries before Epic 7), the row left after Undo, and untested admin/malformed-id paths (`false`).

**Follow-up review recommendation:** false. First pass patched high 0, medium 1, low 2; the medium was a missing test, now present and passing.

**Verification:**
- `npm run test:int -- tests/int/setRead.int.spec.ts`: 5 passed, on the worktree's own Postgres (port 5462).
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors (40 existing warnings in migrations).
- Prettier check on the two new files: clean.
- Matrix audit: Mixed toggle and Undo (case 1), All read (case 3), Not mine (case 4), Row gone (case 5) all ran and passed.

**Residual risks:**
- No caller yet: the action and toast arrive with 5.23 and 5.29.
- Undo does not delete a `user-books` row the action created; it stays with `read: false`.
- The cached `epic-5-context.md` predates the 5.3/5.9 spine edits (shelf rules only); it was reused, not recompiled, to avoid a conflict with the parallel 5.4 worktree.
