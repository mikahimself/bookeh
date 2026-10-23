---
title: 'Story 5.30: [F4] Move, one copy or a selection'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '523c8594eb140f98ee6a5894a1c1271e0b016108'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      On iOS Safari the phone keyboard may cover the Move picker's "New location" field and its button at the bottom of the half-height Bottom sheet.
    evidence: |-
      Sheet.tsx has no visualViewport or scroll-into-view handling, and the field comes after every location row. Settled by focusing the field in the Move sheet on a real iPhone.
    location: >-
      src/app/(frontend)/components/ui/Picker.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Copies move only one at a time on Edit book (FR-33, UX-DR25). `moveCopies` is built and tested, but the collection never calls it.

**Approach:** A `moveCopiesAction` wraps `moveCopies` in `withUndo`. Move in the action bar and on an owned line in Book detail opens a location Picker with a "New location" field; the toast reads "{n} moved to {location} · Undo".

## Boundaries & Constraints

**Always:**
- `Picker` gets an optional `create: { label, submit, onCreate(name) }`. It renders a form under the rows: a `TextField` and a secondary Button. A value that is blank after trimming does nothing. Any other value closes the Picker, and `onCreate` runs after the close, as `onChoose` does.
- The Move picker: title `collection.moveTitle`, a row per location; `value` is the copy's location in Book detail, `null` in the bar.
- `moveCopiesAction({ copyIds, location })`: `ids()` and `parseRef()` (no `null`), else `VALIDATION` with no write; `requireUserOrThrow()` in `runAction()`; one `withUndo` whose callback calls `moveCopies` and reads the target's name in the same transaction. Returns `Undoable<{ location: LocationOption; count }>` (`count`: distinct ids).
- On `ok`: the success toast `toast.moved` with Undo, then `router.refresh()`, then `afterAction(result)`. Rows that no longer match leave on the reload. The toast's Undo reloads the rows through `onUndone`, and Book detail refreshes through `ReadAndRating`'s existing `onUndone`.
- The bar: Move is a secondary Button first in the actions row (count, Move, Read, Remove, Done), sharing `pending` and Read's untick and focus rules. Book detail: an owned line ends with a Move `ActionLink`, disabled while its move runs.
- With no locations (FR-32), Move is absent from the bar and from Book detail. `page.tsx` passes `listLocations(ctx)` to `SelectBar`; if that read fails, it logs and passes `[]`.
- `Esc` inside a dialog closes only the dialog. The document `Esc` listeners of the wide panel and of select mode ignore any target inside `[role="dialog"]` or `[role="alertdialog"]`. This is the same check 5.24 adds to the panel.
- Strings in English and Finnish; design tokens only; 44px tap areas.

**Never:** changes to `moveCopies` or `lib/shelf`; a "no location" choice; Lend, Remove or notes on lines; patching rows; Undo after a location is deleted (known gap).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bar move | 2 ticked (1 out of view), pick "Mökki" | both ids sent; "2 moved to Mökki" with Undo; rows reload; 0 selected; still selecting | — |
| Create inline | type " Kellari ", submit | `{ create: ' Kellari ' }` sent; the toast names "Kellari" | — |
| One copy | Move on a Book detail line | `[copyId]` sent; "1 moved to …"; the line shows the new location | — |
| Ordered ticked | an ordered copy is ticked | nothing moves; error toast; ticks kept | `VALIDATION` |
| Gone meanwhile | a ticked copy was deleted elsewhere | "Not in library" and a reload; ticks cleared | `NOT_FOUND` |

</intent-contract>

## Code Map

- `src/lib/copies/moveCopies.ts` -- read-only; all or none; Undo tested in `tests/int/moveCopies.int.spec.ts`.
- `src/lib/copies/locations.ts:67-84` -- `LocationOption` and `listLocations(ctx)`, which also works with `tx`. `src/app/(frontend)/ref.ts` -- `parseRef()`.
- `(sections)/actions.ts` `toggleCopiesReadAction` and `SelectBar.tsx` `markRead()` -- the patterns to follow.
- `(sections)/BookDetail.tsx` (5.24) -- each copy line is a `role="group"` labelled by its `p`, with `RemoveCopy` in the row. `CopyLine.tsx` `RemoveCopy` -- the line-action pattern: `ok` or `NOT_FOUND` → `router.refresh()`, focus to the copies `section`.
- `Picker.tsx` -- `pending` and `onClosed` defer a choice until the close.
- `BookDetailPanel.tsx` (local `inDialog`, from 5.24), `Selection.tsx` -- the `Esc` listeners. Base UI's popup already stops `Esc` propagating; the check is a safety net.
- `tests/unit/collectionPage.unit.spec.ts` (actions mock, `matchMedia` stub, select-mode harness, "beside the list at 1300px"); `tests/int/toggleCopiesReadAction.int.spec.ts` (action int test).

## Tasks & Acceptance

**Execution:** (code paths under `src/app/(frontend)/`; EXPERIENCE.md under `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/`)
- `components/ui/Picker.tsx` -- add `create`; its Button is disabled while the trimmed field is empty.
- `(sections)/actions.ts` -- add `moveCopiesAction`.
- `(sections)/MovePicker.tsx` -- new: the Picker, call, toast and `afterAction`, used by the bar and by `MoveCopy`.
- `(sections)/CopyLine.tsx` -- `MoveCopy` beside `RemoveCopy`, in the line's group (Move before Remove): after `ok` or `NOT_FOUND` it refreshes, and focus goes to the copies `section` once the move settles.
- `(sections)/SelectBar.tsx`, `page.tsx` -- pass the `locations` prop; add Move.
- `(sections)/BookDetail.tsx` -- take the page's `locations` as a prop (no read of its own); `MoveCopy` on owned lines.
- `components/ui/overlay.tsx`, `BookDetailPanel.tsx`, `Selection.tsx` -- move 5.24's `inDialog` into `overlay.tsx` and use it in both listeners; comments call it a safety net.
- `messages/en.json`, `fi.json` -- `collection.move` "Move" / "Siirrä", `collection.moveTitle` "Move to" / "Siirrä paikkaan", `collection.newLocation` "New location" / "Uusi paikka", `toast.moved` "{n} moved to {location}" / "{n} siirretty · {location}".
- `EXPERIENCE.md`, `DESIGN.md` -- Picker rows: Location ends with a "New location" Text field and a secondary Button under the rows.
- `tests/unit/collectionPage.unit.spec.ts` -- one case for Bar move, Create inline, Ordered ticked and Gone meanwhile; one for `Esc` in the picker, in select mode and from the panel at 1300px; one for One copy through the line's Move; assert no Move in an existing select-mode case without locations.
- `tests/int/moveCopiesAction.int.spec.ts` -- new. The real action moves two copies and returns `count: 2` and the name, and `undo()` with its token puts both back (AD-20). `location: null` is `VALIDATION`, and nothing is written.

**Acceptance Criteria:**
- Given ticked copies or an owned line, when I Move to a location, existing or created inline, then all move or none do, with "{n} moved to {location} · Undo".
- Given a filter that the moved copies no longer match, when the move succeeds, then their rows leave the list.
- Given that toast, when I tap Undo, then each copy is back where it was and back in the list.
- Given a user with no locations, when the bar or Book detail shows, then there is no Move.
- Given the Move picker open from the wide panel or the bar, when I press `Esc`, then only the picker closes.

## Spec Change Log

### 2026-10-23 — loop 1
- Trigger: story 5.24 landed on `main` (`523c859`) during the run. It moved copy lines into a `role="group"` row with `RemoveCopy`, and gave the panel its own `inDialog`. The first diff rewrote the old markup and declared a second `inDialog`. Grouped with: line Move lost focus to `body`, left a stale line on `NOT_FOUND`, gave every Move the same name, and failed Book detail on a locations read error.
- Amended: Code Map (5.24's line group, `RemoveCopy` pattern, one shared `inDialog`); Tasks (`MoveCopy` in `CopyLine.tsx`, refresh on `NOT_FOUND`, focus to `section`, `locations` passed from the page, disabled empty submit, DESIGN.md row, panel `Esc` test, bar no-Move assertion). The branch is rebased onto `523c859`.
- Avoided: a merge with a duplicate `inDialog`, a conflicting copy line, and unlabelled Move links.
- KEEP: the first attempt's `Picker` `create` (pending `Choice`, field reset on open), `moveCopiesAction` (input checks, `listLocations(tx)` name read in `withUndo`, distinct `count`), `MovePicker`'s call/toast/`onSettled`/`afterAction` order, `SelectBar`'s shared `settled` helper and Move-first button, `page.tsx`'s caught `listLocations`, the messages, and both test files' cases. Reference: `/private/tmp/claude-501/-Users-mika-development-bookeh/43563086-4a53-4fe6-b357-62697d7c06e6/scratchpad/attempt-1-5-30.patch`.

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 25 findings — high 0, medium 4, low 16, false 3, maybe-false 2
- findings:
  - `[low]` `[reject]` Edge: `count` is the distinct ids sent, so copies already at the target still count, and a zero-move toast offers a no-op Undo. The copies are all at the location the toast names, and the fix needs `moveCopies` to report a moved count, which the spec rules out.
  - `[low]` `[bad_spec]` Edge: the line Move refreshes only on `ok`, so a `NOT_FOUND` leaves a stale line. Amended: `MoveCopy` refreshes on `ok` or `NOT_FOUND`, like `RemoveCopy`.
  - `[low]` `[reject]` Edge: a location deleted in another tab stays in the pickers until a refresh. It needs Settings open elsewhere, and choosing it gives an error toast and no write.
  - `[low]` `[reject]` Edge: the create field has no `maxLength` 200. A 200-character location name is not met in use, and the server answers `VALIDATION`.
  - `[low]` `[reject]` Verification: no test reaches `inDialog`, because Base UI's popup stops `Esc` before the document listeners. AC 5's behaviour is tested and passes; the check is a safety net (comments amended to say so).
  - `[low]` `[bad_spec]` Verification: no test shows the bar has no Move without locations (AC 4). Amended: an assertion in an existing select-mode case.
  - `[low]` `[reject]` Verification: the Picker `create` rules (blank, reset on open) are unpinned. No AC or spine rule names them (CLAUDE.md, Tests).
  - `[low]` `[bad_spec]` Verification: the comments claim `inDialog` is what keeps `Esc` inside the dialog. Amended: they call it a safety net.
  - `[medium]` `[bad_spec]` Blind: the stale baseline collides with 5.24 on `main` (a duplicate `inDialog`, rewritten copy lines). Amended the Code Map and Tasks; rebased onto `523c859`.
  - `[low]` `[bad_spec]` Blind: a stale line after a non-`ok` line Move. Same root as the Edge row.
  - `[low]` `[reject]` Blind: the toast counts ids sent, not ids moved. Same as the Edge row.
  - `[low]` `[reject]` Blind: an ordered copy ticked shows the generic `VALIDATION` text. The matrix asks for an error toast; a dedicated message adds an error mapping, left for Mika (residual risk).
  - `[medium]` `[bad_spec]` Blind: the line's Move link is disabled while pending, so focus falls to `body`, outside the phone sheet. Amended: focus goes to the copies `section`, as with `RemoveCopy`.
  - `[medium]` `[bad_spec]` Blind: `BookDetail` reads `listLocations` with no catch, repeating the page's read. Amended: it takes the page's caught `locations`.
  - `[low]` `[bad_spec]` Blind: every Move has the same accessible name. Amended: `MoveCopy` sits in 5.24's labelled line group.
  - `[low]` `[bad_spec]` Blind: the panel half of AC 5 has no test. Amended: the `Esc` case also runs from the panel at 1300px.
  - `[low]` `[reject]` Blind: one test walks four matrix rows. That mirrors the accepted 5.29 shape, and splitting it repeats the setup.
  - `[false]` `[reject]` Blind: the Finnish toast reads "2 siirretty · Mökki · Kumoa". Toast actions are separate Links, not joined by a dot, and "Tallennettu · {location}" is the house pattern.
  - `[low]` `[bad_spec]` Blind: the create Button stays enabled with a blank field and gives no feedback. Amended: it is disabled while the trimmed field is empty.
  - `[low]` `[bad_spec]` Blind: DESIGN.md's Picker row says nothing of the field. Amended: the DESIGN.md row is added to the tasks.
  - `[false]` `[reject]` Blind: `listLocations(tx)` reads every location to name one. A user's locations are a short, indexed list, and the `throw` cannot happen inside the move's own transaction.
  - `[maybe-false]` `[reject]` Intent: Undo is never tapped in the UI. `collectionList.unit.spec.ts` runs a toast Undo and the reload through `onUndone` (5.29 triage); the restore is the int test's. If true, low.
  - `[maybe-false]` `[reject]` Intent: the "rows leave" step filters by search, not location. The reload re-runs the server query whatever the filter, so the filter kind does not matter. If true, low.
  - `[false]` `[reject]` Intent: an inline-created location outlives Undo. The epic context says "Undo leaves a row created this way", and `moveCopies` documents it.
  - `[medium]` `[bad_spec]` Intent: `BookDetail`'s uncaught locations read. Same root and amendment as the Blind row.

### 2026-10-23 — Review pass (loop 1)
- verdicts: 25 findings — high 0, medium 0, low 19, false 3, maybe-false 3
- findings:
  - `[low]` `[reject]` Verification: the line Move's `NOT_FOUND` refresh has no test. It is a test-only finding that names no AC or spine rule (CLAUDE.md, Tests).
  - `[low]` `[reject]` Verification: the page's caught `listLocations` failure has no test. Same reason.
  - `[low]` `[reject]` Edge: carried. `count` counts copies already at the target.
  - `[low]` `[reject]` Edge: typing the line's current location name into "New location" toasts "1 moved" with a no-op Undo. A rare path, and the fix adds a normalised-name compare in `Picker`.
  - `[false]` `[reject]` Edge: Book detail's line stays stale after a line move's Undo. `ReadAndRating` is always mounted in `BookDetail`, and its `onUndone` calls `router.refresh()`. The comment is now added (patch row below).
  - `[low]` `[reject]` Edge: carried. A location deleted elsewhere stays in the pickers.
  - `[low]` `[reject]` Edge: carried. No `maxLength` 200 on the create field.
  - `[low]` `[reject]` Edge: `NOT_FOUND` on a Book's only copy renders "Not in library", and focus on the unmounted `section` drops. `RemoveCopy` on main does the same for `NOT_FOUND`; the case needs a copy deleted in another tab.
  - `[low]` `[reject]` Edge: a line's Move and Remove use separate transitions and can overlap. Remove needs a dialog confirmation, a move takes well under a second, and the overlap only gives a "Not in library" toast.
  - `[false]` `[reject]` Edge: a bar move's `NOT_FOUND` leaves an open Book detail stale. Entering select mode closes Book detail, and a tap ticks instead of opening, so no Book detail is open beside the bar.
  - `[low]` `[patch]` Blind: the Finnish strings say "paikka" where the app says "sijainti". Fixed: "Siirrä sijaintiin", "Uusi sijainti".
  - `[low]` `[reject]` Blind: same as the Edge row on typing the current name.
  - `[low]` `[patch]` Blind: EXPERIENCE.md and the Picker JSDoc say the field always creates a location. Fixed: both say a matching name is reused.
  - `[low]` `[reject]` Blind: a failed locations read hides Move silently. The spec rule logs and passes `[]`; a toast for a failed side read adds a branch for a database fault that breaks the rows too.
  - `[low]` `[patch]` Blind: Book detail's refresh after Undo depends on `ReadAndRating` without saying so. Fixed: the `MoveCopy` comment names it. Stale Filter panel counts after Undo belong to the deferred 5.28 item.
  - `[maybe-false]` `[defer]` Blind: on iOS Safari the phone keyboard may cover the "New location" field at the bottom of the half-height sheet. Settled by a check on a real iPhone; medium if true (unverified).
  - `[low]` `[reject]` Blind: same as the Edge row on Move and Remove overlapping.
  - `[low]` `[reject]` Blind: every collection render reads the locations. A small indexed query per user; reading it only in some states adds branches.
  - `[low]` `[reject]` Blind: carried. The generic `VALIDATION` text for an ordered copy ticked (residual risk).
  - `[false]` `[reject]` Blind: carried. `listLocations(tx)` reads every location to name one.
  - `[maybe-false]` `[reject]` Intent: carried. The "rows leave" step uses a search, not a location filter.
  - `[maybe-false]` `[reject]` Intent: carried. Undo is never tapped from the move toast in a test.
  - `[low]` `[reject]` Intent: no test shows the Book detail line back at its old location after Undo. Test-only; that path is `ReadAndRating`'s existing refresh.
  - `[low]` `[reject]` Intent: no test runs all-or-none through the new action. Test-only; `moveCopies.int.spec.ts` covers it at the service, and the action adds only input checks.
  - `[low]` `[reject]` Intent: carried. `{n}` counts copies sent.

## Design Notes

Inline create is a field under the rows, not a Combobox: the Picker is one tap per choice, and the field is one more. Rows are not filtered (a short list). A different layout would change only `Picker`.

## Verification

**Commands:**
- `npm run typecheck`, `npx eslint` on the changed files, and `npm run test:unit` -- all clean
- `npm run test:int` on `moveCopiesAction` and `moveCopies` -- pass (worktree Postgres, port 5433)

**Manual checks:**
- `next dev` at 390px and 1280px: bar and line moves, Undo, `Esc` in the panel's picker; Move, Read, Remove on one phone row.

## Auto Run Result

**Summary:** Move in the select-mode action bar (first, before Read and Remove) and on an owned copy's line in Book detail (before Remove, inside 5.24's labelled line group) opens a location Picker. The Picker lists the user's locations and ends with a "New location" field. A choice sends the copy ids and a `Ref` to the new `moveCopiesAction`. That action checks the input, wraps the existing `moveCopies` in `withUndo`, and reads the target's name in the same transaction. On `ok` the toast reads "{n} moved to {location}" with Undo, Book detail refreshes, and `afterAction` reloads the rows, so rows that no longer match leave the list. The toast's Undo reloads the rows through `onUndone`, and Book detail refreshes through `ReadAndRating`. Move is absent without locations (FR-32). `Esc` in the picker closes only the picker.

**Files changed:**
- `src/app/(frontend)/components/ui/Picker.tsx` -- optional `create` field and secondary Button under the rows. The Button is disabled while the field is blank, and the choice runs after the close.
- `src/app/(frontend)/components/ui/overlay.tsx` -- the one shared `inDialog`, moved from 5.24's panel, documented as a safety net.
- `src/app/(frontend)/(sections)/actions.ts` -- `moveCopiesAction`.
- `src/app/(frontend)/(sections)/MovePicker.tsx` -- new: the shared Picker, the call, the toast, the refresh, `onSettled` and `afterAction`.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- `MoveCopy`: refreshes on `NOT_FOUND`, and focus goes to the copies section.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- takes the page's `locations`; Move on owned lines.
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- `locations` prop, Move first, and the `settled` helper shared with Read.
- `src/app/(frontend)/(sections)/page.tsx` -- one caught `listLocations` read for the bar and Book detail.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx`, `Selection.tsx` -- `Esc` listeners use `inDialog`.
- `messages/en.json`, `messages/fi.json` -- `collection.move`, `moveTitle`, `newLocation`, `toast.moved`.
- `EXPERIENCE.md`, `DESIGN.md` -- Picker rows describe the "New location" field.
- `tests/unit/collectionPage.unit.spec.ts` -- the bar case (Bar move, Create inline, Ordered ticked, Gone meanwhile), `Esc` in select mode and from the 1300px panel, One copy from a line, and no Move without locations.
- `tests/int/moveCopiesAction.int.spec.ts` -- new: the real action's `count`, name and Undo receipt, and `VALIDATION` for a `null` location.
- `sprint-status.yaml` -- 5.30 done.

**Review findings:**
- **Pass 1** (25 findings): routed to `bad_spec`. Story 5.24 landed on `main` mid-run, so the first diff collided with its copy lines and its `inDialog`. The code was reverted, the branch rebased onto `523c859`, and the spec amended to cover the line group, `RemoveCopy`'s refresh and focus pattern, the page's `locations`, the blank-submit Button, DESIGN.md, the panel `Esc` test and the bar no-Move assertion. Everything was then implemented again. Every rejected row and its reason is in the pass-1 triage log.
- **Pass 2** (25 findings, none high or medium):
  - Patched (low): the Finnish wording ("sijainti", not "paikka"); the docs now say a typed name reuses a matching location; the `MoveCopy` comment names the `ReadAndRating` Undo refresh.
  - Deferred (maybe-false): the phone keyboard may cover the field in the half-height sheet on iOS (medium, unverified).
  - Rejected: 16 `low` (test-only gaps with no AC; the no-op move when the current name is typed; the Move/Remove overlap on one line; the silent locations-read failure; locations read on every render; carried rows: the `count` semantics, a stale deleted location, `maxLength`, the generic ordered-copy message, the "rows leave" and Undo test surfaces), 3 `false` (a stale line after Undo: `ReadAndRating` refreshes it; the bar `NOT_FOUND` with Book detail open: select mode closes it; the cost of `listLocations(tx)`) and 2 `maybe-false` (carried).

**Follow-up review:** not recommended (`false`). Patched counts: high 0, medium 0, low 3.

**Verification:** `npm run typecheck` -- exit 0. `npx eslint` on `src/app/(frontend)` and the two test files -- clean. Prettier -- clean on the changed code, messages and tests. `npm run test:unit` -- 61 files, 882 tests passed. `npm run test:int` on `moveCopiesAction` and `moveCopies` -- 6 passed against the worktree's Postgres on port 5433.

**Residual risks:**
- The manual `next dev` checks at 390px and 1280px were not run: whether Move, Read and Remove fit on one phone row, and the iOS keyboard over the "New location" field (deferred).
- An ordered copy among the ticked ones gets the generic "Check the marked fields." error toast. A dedicated message is Mika's call.
- `{n}` counts the copies sent, including any already at the target.
- `main` has moved on since the rebase (`feat(scan): numeric keyboard…`). That commit touches the scan screen, not these files, so the merge should be clean.
- The worktree's Postgres container `bookeh-postgres-5-30` (port 5433) can go once this is merged.
