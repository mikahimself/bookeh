---
title: '5.24 [E12] Copy notes and removing a copy'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: 'f6ee5c1f98223a715f9c523c5d55a811ba2d1cd3'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Book detail's Your copies lines are read-only. Mika cannot note something on a copy or remove one there (FR-26, AD-18). `setNote` and `removeCopies` already exist in `lib/copies`, and both are tested.

**Approach:** Each copy line gets a note field under it that saves on blur. An owned line also gets a destructive Remove Link with the one-copy dialog. Both go through new or existing actions in `(sections)/actions.ts` and report through `useAfterAction()`. Removing the last copy closes Book detail through a close hook that both frames provide. The wide panel's `Esc` leaves a dialog's `Esc` alone.

## Boundaries & Constraints

**Always:**
- Line layout: the line (location chip · status), then the owned line's Remove Link on the same line. Under it is a `TextAreaField` labelled "Note" (`rows={2}`, `maxLength={2000}`), seeded from `CopyLine.note ?? ''`. Every copy line has the note, ordered ones included. Only owned lines have Remove (EXPERIENCE.md: ordered → Received, 5.25).
- Note: on blur, it is skipped when `value.trim().normalize('NFC')` equals the last saved text. Otherwise it calls `setNoteAction({ copyId, note })`. On `ok` the saved text becomes the normalised value and the field shows it. The result always goes to `afterAction` (search covers notes, so rows reload). On failure the typed text stays and the next blur retries. `Esc` in the field blurs it, which saves.
- Remove: `ActionLink destructive` with `collection.remove`. It opens `Dialog` titled `collection.removeTitle` with `n: 1` and a destructive Remove as confirm. The removal starts in the Dialog's `onClosed` (after its history entry is gone), only when confirmed. It calls `removeCopiesAction([copyId])` with no toast and no Undo, then `afterAction(result)`. Then: `ok` and the last copy line → `useCloseDetail()()`; `ok` otherwise, or `NOT_FOUND` → `router.refresh()`. The Link is disabled while its removal is in flight.
- "Last" is `copies.length === 1` in the server render, passed in as a prop.
- `useCloseDetail()` comes from a small context. The sheet provides its animated close (as X does, landing on `shelfHref(query)`). The panel provides `setLeaving(true)`.
- Panel `Esc`: also ignored when the target is inside `[role="dialog"]` or `[role="alertdialog"]`, so `Esc` in a dialog closes only the dialog (one overlay at a time, topmost first).
- `setNoteAction(input: unknown)`: `requireUserOrThrow()` inside `runAction()`. Input must be an object with an `isId` `copyId` and a string `note`; anything else is `VALIDATION` before the service runs. It calls `setNote` and returns `null`. No Undo (AD-20).
- Strings in English and Finnish; tokens only; 44px taps on the phone (existing components).

**Never:**
- No new service code: `setNote` and `removeCopies` stay as they are. No Remove on ordered lines, no Move, Lend or Received (5.30, Epic 6, 5.25).
- No action int test for `setNoteAction` (the services carry the tests). No markup or CSS tests. No spine change: no contract moves.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Note saved | type "signed", blur | `setNoteAction({ copyId: 21, note: 'signed' })`, `afterAction(ok)` | — |
| Unchanged | focus, blur with no change | no call | — |
| Note fails | action answers `INTERNAL` | text stays; `afterAction` reports | next blur retries |
| Remove one of two | confirm on copy 21 of [21, 22] | `removeCopiesAction([21])`, `afterAction`, `router.refresh()`; detail stays | `NOT_FOUND`: toast via `afterAction`, refresh |
| Remove last | confirm on the only copy | detail closes, `afterAction` reloads rows | — |
| Cancel | Cancel or `Esc` in the dialog | nothing removed; on wide the panel stays open | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx:104-119` -- the Your copies `li`s. Each gets the line `p` (chip, status, Remove), then the note. `copies` comes from `getHoldings` (`CopyLine.note` is already read, `holdings.ts:87`).
- `src/app/(frontend)/(sections)/actions.ts` -- `removeCopiesAction` exists. Add `setNoteAction` beside it, reusing `isId` and the `bookInput` style (a `copyId` twin).
- `src/lib/copies/updateCopy.ts:37` -- `setNote(ctx, copyId, note)`: trims, NFC, empty → `null`, `NOT_FOUND`, the collection's 2000 limit is `VALIDATION`.
- `src/app/(frontend)/(sections)/SelectBar.tsx:107-128` -- the Dialog confirm pattern (`confirmed` ref, `onClosed`, title kept while closing) to mirror.
- `src/app/(frontend)/(sections)/ReadAndRating.tsx` -- the client-group pattern inside Book detail (`useAfterAction`, `settleAction`).
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx` -- `leave` and `landing` and `setOpen(false)`. The close hook = `setOpen(false)` with `landing` undefined.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx:62-73` -- the document `Esc` listener and `inField`. Add the dialog-ancestor check. `setLeaving(true)` is the panel's close.
- `src/app/(frontend)/components/TextField.tsx:74` -- `TextAreaField`. `components/Link.tsx:24` -- `ActionLink` (`destructive`). `components/ui/Dialog.tsx` -- `Dialog` (`onClosed`).
- `src/app/(frontend)/components/request.ts:17` -- `settleAction`.
- `tests/unit/collectionPage.unit.spec.ts` -- the page harness. It mocks `(sections)/actions` (add `setNoteAction`), uses `holds()`, `copy()`, `detail()`, the `router` mock, and a wide `describe` with `panel()`. The case at `:617` asserts `listitem` textContent `['Tampere · Owned', 'Ordered']`; it must read the line `p` instead.
- `messages/en.json`, `messages/fi.json` -- `detail` namespace; `collection.remove`/`removeTitle` exist in both.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/detailClose.ts` -- new: `DetailCloseContext` (`(() => void) | null`) and `useCloseDetail()`, which throws outside a frame.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx` -- provide the close (`landing.current = undefined; setOpen(false)`).
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx` -- provide `() => setLeaving(true)`. Add the dialog-ancestor skip to `Esc`, and update the doc comment.
- `src/app/(frontend)/(sections)/actions.ts` -- `setNoteAction` per Always.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- new client file. `CopyNote` (`copyId`, `note`) and `RemoveCopy` (`copyId`, `last`), per Always.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- render the line `p`, with `RemoveCopy` when owned and `CopyNote` under it. Update the doc comment.
- `messages/en.json`, `messages/fi.json` -- `detail.note` "Note" / "Muistiinpano".
- `tests/unit/collectionPage.unit.spec.ts` -- mock `setNoteAction`. Fix the `:617` line assertion. New cases in Book detail:
  - (a) Note saved, and Unchanged makes no call.
  - (b) Remove one of two: dialog title "Remove 1 book from library?", `removeCopiesAction([21])`, `router.refresh()`, sheet still open.
  - (c) Remove last: the sheet closes and `afterAction`'s reload runs (`fetch` to `/data/shelf`).
  - (d) Wide: `Esc` in the open dialog closes it, the panel stays, and nothing is removed.
  - (e) Note fails: `INTERNAL` → the typed text stays, `afterAction` reports it (`reportFailure` toast), and the next blur calls again.

**Acceptance Criteria:**
- Given a copy's line in Book detail, when I edit the note under it and leave the field, then it saves through `setNote`, and leaving it unchanged sends nothing.
- Given an owned copy's line, when I tap Remove, then a dialog asks "Remove 1 book from library?", and confirming removes the copy through `removeCopies` with no toast and no Undo.
- Given the Book's last copy, when I remove it, then Book detail closes and the row leaves the list. Given another copy remains, the detail stays open without the removed line.
- Given the wide panel with the remove dialog open, when I press `Esc`, then only the dialog closes.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 32 findings — high 0, medium 3, low 22, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: `NOT_FOUND` on Remove can toast "Not in library" twice (afterAction, then `NotInLibrary` after the refresh). It needs the copy gone elsewhere, and the toast is one at a time, so the second replaces an identical first. Splitting the paths adds a branch.
  - `[low]` `[reject]` Blind: confirming a second copy's Remove before the first refresh lands takes the refresh path, and `NotInLibrary` closes with its toast. It needs two dialogs confirmed inside one round trip, and the detail still closes. A fix needs shared pending state across lines.
  - `[medium]` `[patch]` Blind: after removing one of several copies, focus falls to `<body>` (outside the modal sheet), because the refresh unmounts the Remove link the Dialog returned focus to. Fixed: before the refresh, focus moves to the Your copies section (`tabIndex={-1}`).
  - `[low]` `[patch]` Blind: with several copies, each "Remove" and "Note" has no copy context for screen readers. Fixed: each line's content is a `role="group"` labelled by its line `p`.
  - `[low]` `[reject]` Blind: the dialog body does not name the copy, and "Remove 1 book" is said to be wrong when other copies remain. The AC fixes the title verbatim, one book is one copy as in select mode's dialog, and the dialog opens from the line just tapped.
  - `[low]` `[reject]` Blind: on the phone, `Esc` in the note closes the whole sheet. The blur runs first, so the save has started. `Esc` closing the topmost overlay is the sheet's existing rule; only the non-modal panel exempts fields.
  - `[low]` `[reject]` Blind: `maxLength={2000}` repeats `Copies.ts:55`. A shared constant would mean a client import from `src/collections`, which the import rules don't allow (client imports from `src/lib` are pure modules only). If the limit drifts, it still fails as `VALIDATION`.
  - `[low]` `[reject]` Blind: no in-flight guard, so a second blur during a slow save repeats the same write. It needs a refocus and blur inside one round trip, and the write is idempotent.
  - `[low]` `[reject]` Blind: `CopyNote` ignores later `note` prop changes. A stale value needs the same copy's note changed in another tab or the admin while the detail is open.
  - `[false]` `[reject]` Blind: built despite `oversized`. Mika dismissed that trigger for epic-sliced stories (Epic 4 retro, P4), as in 5.10–5.23.
  - `[low]` `[patch]` Blind: the `BookDetail` doc comment is unevenly wrapped. Reflowed.
  - `[low]` `[reject]` Edge: phone `Esc` in the note closes the sheet. Same as the Blind phone-`Esc` row.
  - `[medium]` `[patch]` Edge: a note typed then left by browser Back or a `?book=` swap unmounts with no blur, so the text is lost. Fixed: on unmount, a changed note is saved and its result goes to `afterAction`.
  - `[low]` `[reject]` Edge: duplicate in-flight saves. Same as the Blind in-flight row.
  - `[low]` `[reject]` Edge: `NOT_FOUND` double toast. Same as the Blind `NOT_FOUND` row.
  - `[low]` `[reject]` Edge: when the panel closes after the last copy, focus can fall to `<body>`, because the reload removed the `aria-current` row it would move to. The panel has closed and the list is intact; a fallback target adds a branch to shared panel code.
  - `[low]` `[reject]` Edge: stale `note` prop after a refresh. Same as the Blind stale-prop row.
  - `[low]` `[patch]` Edge: `saved` was seeded with the raw stored note, so an admin-entered note with outer whitespace saves on an unchanged blur. Fixed: `saved` is seeded with the normalised note.
  - `[low]` `[reject]` Verification gap: the panel's `inDialog` skip cannot be observed, because Base UI's popup stops the `Esc` before it reaches `document`. Test (d) pins AC 4's outcome. The guard is the spec's (Always) defence if Base UI changes, and removing it would edit the spec.
  - `[low]` `[patch]` Verification gap: a detail Remove answering `NOT_FOUND` was not shown to refresh (matrix error column). New unit case.
  - `[medium]` `[patch]` Verification gap: the last-copy close was tested only in the phone sheet; the panel's `useCloseDetail` wiring was unpinned. New 1300px case.
  - `[low]` `[reject]` Verification gap: `Esc`-blurs-the-note is untested. No AC or spine rule names it, so CLAUDE.md's test rule rejects a test-only finding.
  - `[low]` `[reject]` Verification gap (other): `inDialog` is redundant in practice. Same as the `inDialog` row.
  - `[low]` `[reject]` Verification gap (other): phone `Esc` in the note closes the sheet. Same as the Blind phone-`Esc` row.
  - `[false]` `[reject]` Intent: Remove should be on every line, ordered included. EXPERIENCE.md (Your copies) gives ordered lines Received, not Remove; the epic context agrees.
  - `[false]` `[reject]` Intent: "the row leaves the list" is shown only as a reload request. The reload and the rows it renders are 5.28's `ShelfActionsProvider`, tested there.
  - `[low]` `[reject]` Intent: the `setNoteAction`→`setNote` link is untested. The spec's Never excludes an action test, `setNote` is tested in `copyWrites.int.spec.ts`, and the check is two lines.
  - `[low]` `[patch]` Intent: "no toast" was asserted only for the one-of-two case. The last-copy case now asserts it too.
  - `[false]` `[reject]` Intent: destructive styling is not tested. CLAUDE.md rules out markup and class tests.
  - `[false]` `[reject]` Intent: the Esc, one-of-two and retry surfaces go beyond the epic. They come from EXPERIENCE.md and the spine (topmost-first `Esc`, `afterAction`), which bind the story.
  - `[false]` `[reject]` Intent: `Esc` in the remove dialog inside the phone sheet is untested. Base UI nests a Dialog inside a Drawer (`useDialogRoot` nested counts), and the popup stops the event, the same mechanism test (d) shows.
  - `[false]` `[reject]` Intent: built whole despite `oversized`. Same as the Blind `oversized` row.

## Design Notes

The removal starts in `onClosed`, not in the confirm click. That way the dialog's history entry is popped before the last-copy close runs its own back, so the two history moves never overlap.

`router.refresh()` after a non-last removal re-renders `BookDetail` without the line. After the last copy it would render `NotInLibrary`, whose "Not in library" toast is wrong for a removal you meant, so the frame's close is used instead. A `NOT_FOUND` refreshes on purpose: if the Book is gone, `NotInLibrary` closes the detail with the right message.

## Verification

**Commands:**
- `npm run test:unit` -- expected: passes (messages parity included)
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

**Manual checks (if no CLI):**
- `next dev`: open a Book with two copies, write a note, tab away, and reload to see it kept. Remove one copy and the line goes. Remove the other and the detail closes and the row leaves. At 1300px, `Esc` in the dialog leaves the panel open.

## Auto Run Result

**Summary:** Book detail's Your copies lines now take a note and an owned copy can be removed there (FR-26, AD-18).
- Every copy line has a "Note" field under it. It saves through `setNote` on blur (`Esc` blurs), or as the field unmounts, and only when the normalised text changed.
- An owned line has a destructive Remove Link. It asks "Remove 1 book from library?" and removes through `removeCopies`, with no toast and no Undo.
- Removing the last copy closes Book detail, in the sheet or the panel, through the new `useCloseDetail()`, and the rows reload.
- Removing one of several copies refreshes the detail and moves focus to Your copies.
- The wide panel's `Esc` skips events inside a dialog.

**Files changed:**
- `src/app/(frontend)/(sections)/CopyLine.tsx` (new): `CopyNote` and `RemoveCopy`.
- `src/app/(frontend)/(sections)/detailClose.ts` (new): `DetailCloseContext` and `useCloseDetail()`.
- `src/app/(frontend)/(sections)/BookDetail.tsx`: each copy line is a named group with Remove and the note; the section takes focus.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx`, `BookDetailPanel.tsx`: provide the close; the panel's `Esc` skips dialogs.
- `src/app/(frontend)/(sections)/actions.ts`: `setNoteAction` with a `copyInput` check.
- `messages/en.json`, `messages/fi.json`: `detail.note`.
- `tests/unit/collectionPage.unit.spec.ts`: the line assertion now reads the line `p`, plus seven new cases (note save, failure and retry, remove one of two, `NOT_FOUND`, last copy in the sheet and in the panel, `Esc` in the dialog).
- `sprint-status.yaml`: 5.24 done.

**Review findings:** one pass, 32 rows in the Review Triage Log.
- **Patched:**
  - medium 3: focus after a non-last removal, save on unmount, the panel's last-copy case;
  - low 5: per-copy groups, the doc comment reflow, `saved` seeded normalised, the `NOT_FOUND` case, no toast asserted on the last copy.
- **Deferred:** none.
- **Rejected (low):**
  - `NOT_FOUND` double toast;
  - two quick removals;
  - the dialog body and title;
  - phone `Esc` in the note closing the sheet;
  - the duplicated 2000 limit;
  - in-flight duplicate saves;
  - the stale `note` prop;
  - focus after the panel closes;
  - the unobservable `inDialog` guard;
  - an untested `Esc`-blur;
  - the untested action-to-service link.
- **Rejected (false):** `oversized` (twice), Remove on ordered lines, row-leaves-list evidence, destructive-style tests, the surfaces beyond the epic, phone nested-dialog `Esc`.

**Follow-up review recommendation:** true, because three medium entries were patched on a first pass. The unverified risk is the save on unmount. It sends a server action and calls `afterAction` from a `useEffect` cleanup after the field is gone, and that is shown only in jsdom. A blur save still in flight at unmount sends the same note twice.

**Verification:**
- `npm run test:unit`: 61 files, 878 passed.
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors in this repo's files (40 existing warnings). The 22 errors it reports come from another session's worktree under `.claude/worktrees/story-5-30-move-copies` (its `.next/types`), not from this change. `eslint --ignore-pattern '.claude/**' .` gives 0 errors.
- Matrix audit, all ran and passed:
  - Note saved, Unchanged and Note fails: cases (a) and (e);
  - Remove one of two, with its `NOT_FOUND` column: (b) and the new `NOT_FOUND` case;
  - Remove last: (c) and the 1300px case;
  - Cancel: (d).
- Not done: the manual `next dev` check in a browser.

**Residual risks:**
- On the phone, `Esc` in a note saves it and closes the sheet. On wide, it only leaves the field.
- The panel's `inDialog` skip is redundant while Base UI stops `Esc` at the popup.
- After the panel closes on a last-copy removal, focus can fall to `<body>`.
