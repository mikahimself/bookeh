---
title: 'Story 5.29: [E27] Mark a selection read'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: 'a2bac31164cfe0264fd17e0f793dc44acfc9460c'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The select-mode action bar has only Remove, so catching up the reading log means opening Books one by one (FR-33).

**Approach:** Read in the action bar sends every ticked copy id to a new `toggleCopiesReadAction`, which wraps the existing `setRead(tx, { copyIds }, 'toggle')` in `withUndo`. The success toast "Marked {n} read · Undo" (or "unread") carries the receipt; the result goes through `afterAction`.

## Boundaries & Constraints

**Always:**
- Read: secondary Button before Remove in the actions row (bar order count, Read, Remove, Done), disabled with nothing ticked or while any bar action is in flight. No dialog.
- Every ticked id, in view or not, in one call; `setRead` toggles the distinct Books: read, or unread if all are already read.
- Server action: `ids()` input check (`VALIDATION`, no write), `requireUserOrThrow()` inside `runAction()`, `withUndo(ctx, (tx) => setRead(tx, { copyIds }, 'toggle'))`.
- `ok`: success toast `toast.markedRead` or `toast.markedUnread` by the returned `read`, `n` = returned `count` (distinct Books), with `undo: { token, seconds }`; then `afterAction(result)` reloads the rows.
- `ok` and `NOT_FOUND` untick the sent ids, keep select mode and move focus to Done (Read is disabled by then); other failures keep the ticks. Same as Remove.
- Undo is the toast's: `undoAction` restores each Book's previous flag and `onUndone` reloads the rows. The ticks stay as they are.
- en and fi strings; tokens only.

**Never:** changes to `setRead`, `lib/shelf`, `ToastProvider` or the toast store; Move or Tag (5.30, 9.8); Book detail's read switch (5.23); row patching; refreshing Filter panel counts (deferred in 5.28).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nothing ticked | Select mode, 0 ticked | Read disabled | — |
| Mark read | 2 ticked of different Books, one out of view, not all read | Called with both ids; toast "Marked 2 read" with Undo; rows reload; "0 selected", still selecting | — |
| All read | ticked Books all read | toast "Marked {n} unread" with Undo | — |
| Two copies, one Book | 2 ticked copies of the same Book | toast "Marked 1 read" | — |
| Gone meanwhile | a ticked copy deleted elsewhere | nothing written; "Not in library" + reload; ticks cleared | `NOT_FOUND` |
| Failure | network drops | nothing written; error toast; ticks kept | `NO_CONNECTION` etc. |

</intent-contract>

## Code Map

- `src/lib/books/setRead.ts` -- read-only. `ReadTarget` `{ copyIds }`, `'toggle'`; returns `Undone<{ read, count }>`; empty or foreign ids → `NOT_FOUND`. Undo and toggle already tested in `tests/int/setRead.int.spec.ts`.
- `src/app/(frontend)/(sections)/actions.ts` -- `ids()` and `removeCopiesAction`, the pattern to follow.
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- the bar: `useTransition` `pending`, `remove()` (`settleAction` → untick → `afterAction`), the actions row `div`, `doneButton` ref.
- `src/app/(frontend)/(sections)/ShelfRows.tsx:74-101` -- `afterAction`: `ok` only reloads, so the action shows its own success toast.
- `src/app/(frontend)/scan/useAddToLibrary.ts:77-84` -- a success toast with `undo: { token, seconds }` (`ToastInput`, `useToast().show`).
- `tests/unit/collectionPage.unit.spec.ts:68,390-462` -- actions module mock, `showToast` mock, the "Remove in select mode" harness (`tap`, `selected`, `reloadsWith`).
- `tests/int/removeCopiesAction.int.spec.ts` -- the action int test shape (mocked `next/headers`, login cookie).

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/actions.ts` -- add `toggleCopiesReadAction(copyIds: unknown): Promise<ActionResult<Undoable<{ read: boolean; count: number }>>>`; widen the header comment to say select-mode actions may carry Undo.
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- Read button and its handler beside Remove, sharing `pending`; focus to Done after `ok`/`NOT_FOUND`; update the doc comment.
- `messages/en.json`, `messages/fi.json` -- `toast.markedRead` "Marked {n} read" / "{n} merkitty luetuksi", `toast.markedUnread` "Marked {n} unread" / "{n} merkitty lukemattomaksi" (after `reload`); `collection.markRead` "Read" / "Luettu" (before `remove`).
- `tests/unit/collectionPage.unit.spec.ts` -- mock `toggleCopiesReadAction`; one case through Nothing ticked, Mark read (toast input with message and `undo`, ids, untick, reload) and All read; one through Gone meanwhile and Failure.
- `tests/int/toggleCopiesReadAction.int.spec.ts` -- new: through the real action, marking two copies' Book read returns a token, and `undo()` with it restores unread (AD-20 at the action); `VALIDATION` for a non-array, nothing written.

**Acceptance Criteria:**
- Given ticked copies, when I tap Read, then every ticked Book is marked read, or unread if all are already read, and the toast reads "Marked {n} read · Undo" ("unread" when that is what was set).
- Given that toast, when I tap Undo, then each Book's previous read flag is back and the rows reload.
- Given select mode on the phone at 390px, when the bar shows, then Read and Remove share the actions row without wrapping.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 10, false 6, maybe-false 1
- findings:
  - `[low]` `[patch]` Edge: focus drops to `<body>` when Read fails — pending disables the focused Read and only `ok`/`NOT_FOUND` moved focus. `doneButton.current?.focus()` now runs after every settle.
  - `[low]` `[reject]` Edge: unbounded id array — one user on the tailnet, ticks made by hand with no select all; a cap adds a guard for a case nobody meets (same call as 5.28).
  - `[low]` `[patch]` Edge: focus on failure differs from Remove, which the spec calls the same — same root and fix as the first row.
  - `[low]` `[patch]` Blind: focus lost when Read fails — same root and fix as the first row.
  - `[low]` `[patch]` Blind: the SelectBar doc comment says focus goes to Done "as both are disabled by then", false for Remove (dialog close) and for Read after a failure — comment reworded.
  - `[false]` `[reject]` Blind: Finnish toast lacks a noun and plural — mirrors EXPERIENCE.md's noun-less English copy and the house pattern `collection.selected` "{n} valittu"; the text matches 5.23's keys.
  - `[maybe-false]` `[reject]` Blind: "Read"/"Luettu" names a state, not an action; same accessible name as Filter panel controls; `markRead` names a toggle — EXPERIENCE.md names the action-bar button "Read"; the Filter panel's are a heading and a checkbox, other roles. Whether "Luettu" reads as a command is Mika's call; "Merkitse luetuksi" would risk the four-button row at 390px. If true, low.
  - `[low]` `[reject]` Blind: unbounded id array — same as the Edge row.
  - `[false]` `[reject]` Blind: the Undo half of AC 2 (rows reload) has no coverage — `tests/unit/collectionList.unit.spec.ts:217-230` shows an undo toast, runs Undo and asserts the rows reload through `onUndone`; the restore is the new int test's.
  - `[low]` `[reject]` Blind: the `NOT_FOUND` unit path does not assert focus or the absence of a "Marked" toast — a test-only finding that names no AC or spine rule (CLAUDE.md, Tests).
  - `[low]` `[patch]` Blind: the reviewed diff leaves out the spec and the rewritten `epic-5-context.md` — the spec is the claims file by design; the context recompile is committed on its own as `docs: recompile epic 5 context`, as earlier recompiles were.
  - `[low]` `[patch]` Intent: "Marked {n} unread" is not in EXPERIENCE.md's toast table — the Read row now names the unread variant.
  - `[false]` `[reject]` Intent: `{n}` counts distinct Books while the bar counts copies — the AC says "every ticked Book" and read belongs to the Book (AD-18); intended, see Design Notes.
  - `[false]` `[reject]` Intent: Undo verified at the service, not from the toast — same refutation as the Blind Undo row.
  - `[false]` `[reject]` Intent: the toggle rule is tested only indirectly — `tests/int/setRead.int.spec.ts:95-120` covers "unread when every target Book is read" by copies; `setRead` is unchanged.
  - `[false]` `[reject]` Intent: the 390px one-row criterion is unverified — two buttons ("Read", "Remove", `px-4`, `gap-2`) take about 190px of the ~358px row, and nothing else is in it until 5.30.
  - `[low]` `[patch]` Intent: the epic context rewrite would ride in the story commit — same root and fix as the Blind diff-scope row.

## Design Notes

"Marked {n} unread" is not in EXPERIENCE.md's toast table. The AC says Read can mark unread, and a toast saying "read" after marking unread would be false, so the outcome picks the word. Sibling 5.23 (in its own worktree) uses the same keys and text, so the merge is trivial.

`n` is the number of distinct Books (`setRead`'s `count`), not copies: read belongs to the Book (AD-18), so two copies of one Book are "Marked 1 read".

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npx eslint` on the changed files -- clean
- `npm run test:unit` -- all pass
- `npx vitest run --project int tests/int/toggleCopiesReadAction.int.spec.ts tests/int/setRead.int.spec.ts` -- pass (worktree Postgres on 5472)

**Manual checks:**
- `next dev` on the worktree's Postgres (5472), 390px and 1280px: tick two, Read; toast "Marked 2 read · Undo"; Undo restores; the phone actions row holds Read and Remove on one line.

## Auto Run Result

**Summary:** Read in the select-mode action bar (before Remove) sends every ticked copy id, in view or not, to the new `toggleCopiesReadAction`. That action checks the ids and wraps the existing `setRead(tx, { copyIds }, 'toggle')` in `withUndo`, so the distinct Books are marked read, or unread if all are already read. On `ok` the toast reads "Marked {n} read" or "Marked {n} unread" ({n} = distinct Books) with the receipt's Undo, and `afterAction` reloads the rows. The toast's Undo restores each flag and reloads through the existing `onUndone`. `ok` and `NOT_FOUND` untick the sent ids and keep select mode; other failures keep the ticks. Focus goes to Done after every result.

**Files changed:**
- `src/app/(frontend)/(sections)/actions.ts` -- new `toggleCopiesReadAction`: `ids()` check, `requireUserOrThrow()` in `runAction()`, `withUndo` around `setRead`.
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- Read button sharing `pending` with Remove; success toast with Undo; untick, focus to Done, `afterAction`.
- `messages/en.json`, `messages/fi.json` -- `toast.markedRead`, `toast.markedUnread` (same text as 5.23), `collection.markRead`.
- `EXPERIENCE.md` -- the Undo table's Read row names the "unread" variant.
- `tests/unit/collectionPage.unit.spec.ts` -- two cases covering every matrix row in the UI.
- `tests/int/toggleCopiesReadAction.int.spec.ts` -- new: the real action marks two copies' Book read once (`count: 1`), its token undoes it; `VALIDATION` for a non-array, nothing written.
- `sprint-status.yaml` -- 5.29 done.

**Review findings:** 17 findings, none high or medium. 4 patch entries (7 rows, all low): focus to Done after every Read result (3 rows), the doc comment on focus, the EXPERIENCE.md Read row, and committing the epic-context recompile separately (2 rows). Nothing deferred. 10 rejected: 3 `low` (unbounded id array ×2 — one hand-ticking user, no select all; the `NOT_FOUND` unit assertions — test-only, no AC or spine rule), 1 `maybe-false` ("Luettu" as a button label — Mika's call; "Merkitse luetuksi" would crowd the 390px row), 6 `false` (Finnish toast noun, Undo reload coverage ×2 — covered by `collectionList.unit.spec.ts:217-230`, `{n}` as Books, the toggle rule — covered by `setRead.int.spec.ts`, the 390px row width).

**Follow-up review:** not recommended (`false`). Patched counts: high 0, medium 0, low 4.

**Verification:** `npm run typecheck` -- exit 0. `npx eslint` on the changed code and tests -- clean. Prettier clean on the changed code and messages (EXPERIENCE.md was already unformatted at baseline). `npm run test:unit` -- 59 files, 860 tests passed. `vitest --project int` on `toggleCopiesReadAction.int.spec.ts` and `setRead.int.spec.ts` -- 7 passed against the worktree's Postgres (5472). The implementer checked the focus assertion by removing the `focus()` call and seeing the test fail.

**Residual risks:**
- The manual `next dev` check at 390px and 1280px was not run; the one-row claim rests on the two buttons' width.
- Sibling worktree 5.23 adds the same `toast.markedRead`/`markedUnread` strings and edits `actions.ts` (`setReadAction`, `setRatingAction`, a shared `isId`); whichever merges second resolves a small conflict in `actions.ts`.
- "Luettu" as the Finnish button label is open for Mika.
- The worktree's Postgres container `bookeh-postgres-mark-selection-read` (port 5472) goes when the worktree is merged.
- Filter panel counts stay stale after Read until a navigation (deferred in 5.28).
