---
title: 'Story 5.28: [E25] Remove a selection'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: 'df2f75f763a417a0c22f675f4a3cabcc52f280d6'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: []
deferred:
  - summary: >-
      Filter panel counts and value lists go stale after an action that changes rows (Remove now; Move, Received, Read later).
    evidence: |-
      `filterValues()` runs only in the server render of page.tsx and reaches FilterPanel as props; `afterAction` and toast Undo reload only the client rows through /data/shelf. Removing every copy at a location still offers that location with its old count until a navigation. The spine's `afterAction` contract (ARCHITECTURE-SPINE.md:147) does not cover filter values, so the fix (refresh values after a row-changing action) belongs to that contract, not one action.
    location: >-
      src/app/(frontend)/(sections)/ShelfRows.tsx (ShelfActionsProvider)
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The select-mode action bar (5.27) holds only the count and Done, so removing a box of books means removing copies one by one.

**Approach:** Remove in the action bar opens "Remove {n} books from library?"; confirming calls a new `removeCopiesAction` (wraps the all-or-none `removeCopies`) and reports through `afterAction`. `afterAction` moves out of the query-keyed rows state into an unkeyed provider above the bar.

## Boundaries & Constraints

**Always:**
- Remove: destructive Button, disabled with nothing ticked or while in flight. Dialog (`components/ui`): ICU-plural title ("Remove 1 book from library?"), Cancel and destructive Remove, no body, no Undo.
- The action gets every ticked id, in view or not, in one `removeCopies` call.
- After `ok` the selection clears and select mode stays ("0 selected"). Only Done leaves.
- Phone (< 900px): two rows, count and Done above, actions (Remove) below. Wide: one row, count left, Remove then Done on the right. DOM order = wide order.
- Below 900px the toast lift clears the two-row bar.
- Server action: an array of positive safe integers, else `VALIDATION`, no write; `requireUserOrThrow()` in `runAction()`.
- en and fi strings; tokens only.

**Never:** Loans note in the dialog (Epic 6); Read, Move, Tag (5.29, 5.30, 9.8); Remove in Book detail (5.24); row patching; changes to `removeCopies` or `lib/shelf`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Nothing ticked | Select mode, 0 ticked | Remove disabled | — |
| Cancel | 2 ticked, Remove, Cancel | No call; still "2 selected" | — |
| Confirm | 2 ticked (one out of view), Remove, Remove | Called with both ids; rows reload without them; "0 selected", still selecting | — |
| Gone meanwhile | A ticked copy deleted elsewhere | Nothing removed; "Not in library" + reload; selection clears | `NOT_FOUND` |
| Failure | Network drops | Nothing removed; error toast; ticks kept | `NO_CONNECTION` etc. |

</intent-contract>

## Code Map

- `src/lib/copies/removeCopies.ts` -- read-only; all-or-none already tested in `tests/int/copyWrites.int.spec.ts:105-120`.
- `(sections)/settings/actions.ts` -- validated action pattern; `components/request.ts` -- `settleAction()`.
- `src/app/(frontend)/(sections)/ShelfRows.tsx:75-84,195-222` -- `ShelfRowsProvider` keys `ShelfRowsState` by query (children remount per query); `afterAction`, `reload` live there; only a test probe uses `afterAction`.
- `src/app/(frontend)/(sections)/page.tsx` -- `SelectBar` is a sibling of the columns, outside `ShelfRowsProvider`; `LoadFailed` mounts none.
- `src/app/(frontend)/(sections)/SelectBar.tsx`, `Selection.tsx` -- the bar; `useSelection()`.
- `src/app/(frontend)/(sections)/settings/LocationsGroup.tsx:296-316` -- destructive confirm `Dialog`: close, then run.
- `src/app/(frontend)/styles.css:120,446-453`, `components/toast/ToastProvider.tsx:124` -- toast lift reads `--spacing-pinned-bar` (`tap + 2 × spacing-4`), used nowhere else.
- `tests/unit/collectionPage.unit.spec.ts:335-386` -- select-mode harness; `fetchStub` answers the reload.
- `tests/unit/collectionList.unit.spec.ts:103-130` -- `Probe` reads `afterAction`.

## Tasks & Acceptance

**Execution:**
- `ShelfRows.tsx` -- add unkeyed `ShelfActionsProvider` + `useAfterAction()` holding the unchanged `afterAction` logic; the mounted `ShelfRowsState` registers its `reload` with it (none mounted: toast part only). Drop `afterAction` from `useShelfRows()`.
- `page.tsx` -- `ShelfActionsProvider` inside `SelectionProvider`, around tools, columns and `SelectBar`.
- `(sections)/actions.ts` -- new: `removeCopiesAction(copyIds: unknown): Promise<ActionResult<null>>`.
- `Selection.tsx` -- `clear()`: empties `ticked`, keeps `selecting`.
- `SelectBar.tsx` -- actions row with Remove and its Dialog, the two layouts, the in-flight guard.
- `styles.css` -- below `--breakpoint-wide`, while `[data-action-bar]` exists, `--spacing-pinned-bar: 2 × tap + 3 × spacing-4`; update the comment.
- `messages/en.json`, `fi.json` → `collection` -- `remove` ("Remove"/"Poista"); `removeTitle` (en `{n, plural, one {Remove # book from library?} other {Remove # books from library?}}`, fi `{n, plural, one {Poistetaanko # kirja kirjastosta?} other {Poistetaanko # kirjaa kirjastosta?}}`).
- `collectionPage.unit.spec.ts` -- mock the actions module; one case through Nothing ticked, Cancel, Confirm; one through Gone meanwhile and Failure.
- `collectionList.unit.spec.ts` -- `Probe` uses `useAfterAction()`; tree wraps `ShelfActionsProvider`.
- `ARCHITECTURE-SPINE.md:147` -- `afterAction` comes from `useAfterAction()`, provided above the list so the action bar and Book detail reach it.

**Acceptance Criteria:**
- Given ticked copies, when I tap Remove, then a dialog asks "Remove {n} books from library?" with Remove and Cancel.
- Given the dialog, when I confirm, then all ticked copies are removed or none, with no Undo; the rows leave the list and the selection clears.
- Given select mode on the phone, when the bar shows, then it has two rows and a toast rises above both.
- Given the moved `afterAction`, then the spine says so in the same commit.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 19 findings — high 0, medium 3, low 6, false 10, maybe-false 0
- findings:
  - `[medium]` `[defer]` Blind: Filter panel counts go stale after Remove — `filterValues` comes from the server render and `afterAction` reloads rows only; true of every row-changing action and toast Undo under the spine's `afterAction` contract, so it is a contract gap for Epic 5's actions, not this story's code. Deferred.
  - `[low]` `[patch]` Blind: `clear()` also drops ticks made while the removal is in flight — Done and the rows stay live while pending. Replaced with `untick(sent ids)`.
  - `[low]` `[reject]` Blind: `NOT_FOUND` throws away a selection never acted on — rare (a copy deleted elsewhere mid-selection); unticking only the missing ids needs them from the service, which the spec keeps unchanged.
  - `[low]` `[reject]` Blind: Done or `Esc` during the request drops the ticks a failure would keep — the user chose to leave; guarding Done and `Esc` while pending adds branches for a sub-second window.
  - `[medium]` `[patch]` Blind: focus falls to `<body>` after confirming — the Dialog returns focus to Remove, which is disabled (pending, then 0 ticked). Focus now moves to Done when the confirm dialog closes.
  - `[low]` `[reject]` Blind: the dialog does not say some ticked copies are out of view — EXPERIENCE.md fixes the dialog as the count question with Remove and Cancel; the count already includes them. A UX change, not a defect.
  - `[low]` `[reject]` Blind: `removeCopiesAction` accepts an array of any length — one user on the tailnet, ticks made by hand with no select all; only a signed-in user can send it, against their own copies.
  - `[false]` `[reject]` Blind: the phone override assumes one actions row that cannot wrap — this story has one action, which fits; 5.29, 5.30 and 9.8 add the others and own that row's layout.
  - `[low]` `[patch]` Blind: the no-reload case is documented only in code, not in the changed spine sentence — added "with no rows mounted it only toasts" to ARCHITECTURE-SPINE.md. (A key change's unmount window is moot: the new rows mount from a fresh server render.)
  - `[low]` `[patch]` Edge: ticks toggled while the removal is in flight are wiped on settle — same root as the Blind `clear()` row; same fix.
  - `[low]` `[reject]` Edge: unbounded id array — same as the Blind array-length row.
  - `[medium]` `[patch]` Verification gap: the real action's `VALIDATION` and `UNAUTHENTICATED` answers have no test (the page test mocks the module) — guards the spine's access rule at the action boundary. Added `tests/int/removeCopiesAction.int.spec.ts`.
  - `[low]` `[reject]` Verification gap: Remove disabled while in flight is untested — test-only finding naming no AC or spine rule (CLAUDE.md, Tests).
  - `[false]` `[reject]` Intent: "the selection clears" could mean select mode ends — EXPERIENCE.md's Done row names leaving and clearing separately, and the AC names only clearing.
  - `[false]` `[reject]` Intent: clearing on `NOT_FOUND` goes beyond the AC — the spec's matrix decides it (a gone copy cannot be unticked from the list); see the Blind `NOT_FOUND` row.
  - `[false]` `[reject]` Intent: no loans sentence or loan removal — loans do not exist until Epic 6; `removeCopies` notes Epic 6 deletes them there.
  - `[false]` `[reject]` Intent: E25's service is not built here — `removeCopies` exists (4.5) with its all-or-none int test; the epic context says 5.28 wires it.
  - `[false]` `[reject]` Intent: work is uncommitted, spine "same commit" unconfirmed — finalize commits code, spine and spec together.
  - `[false]` `[reject]` Intent: spine says Book detail reaches `afterAction` though no Book detail code uses it — it describes where the provider sits; `BookDetail` renders inside `ShelfActionsProvider`.

## Design Notes

Not lifting `ShelfRowsProvider`: its key would remount the Filter panel and Book detail on every filter tap. Registration keeps the key in place: `useEffect(() => register(reload), [register, reload])`, returning the unregister.

`NOT_FOUND` clears too: a ticked copy that no longer exists cannot be unticked from the list, so Remove would fail until Done.

## Verification

**Commands:**
- `npm run typecheck` -- no errors
- `npx eslint 'src/app/(frontend)' tests/unit/collectionPage.unit.spec.ts tests/unit/collectionList.unit.spec.ts` -- clean
- `npm run test:unit` -- all pass

**Manual checks:**
- `next dev` on the worktree's Postgres (5433), 390px and 1280px: tick two, Remove, confirm; rows leave, "0 selected". Phone bar has two rows; a toast sits above it.

## Auto Run Result

**Summary:** Remove in the select-mode action bar opens "Remove {n} books from library?" (ICU plural, en and fi) with Cancel and a destructive Remove. Confirming sends every ticked id, in view or not, to the new `removeCopiesAction`, which validates the ids and calls the existing all-or-none `removeCopies`; there is no Undo. On `ok` or `NOT_FOUND` the sent ids are unticked and select mode stays; other failures keep the ticks. The result goes through `afterAction`, which now lives in an unkeyed `ShelfActionsProvider` above the list (the keyed rows register their reload with it), so the bar reaches it without remounting the Filter panel or Book detail per query. The phone bar is two rows (count and Done, then Remove) and the toast lift follows it. Focus moves to Done after a confirm.

**Files changed:**
- `src/app/(frontend)/(sections)/actions.ts` -- new: `removeCopiesAction`, input check, `requireUserOrThrow()` in `runAction()`.
- `src/app/(frontend)/(sections)/ShelfRows.tsx` -- `ShelfActionsProvider` and `useAfterAction()`; rows register `reload`; `afterAction` leaves `useShelfRows()`.
- `src/app/(frontend)/(sections)/page.tsx` -- `ShelfActionsProvider` around tools, columns and `SelectBar`.
- `src/app/(frontend)/(sections)/Selection.tsx` -- `untick(copyIds)`.
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- Remove, its Dialog, the two layouts, the in-flight guard, focus to Done.
- `src/app/(frontend)/styles.css` -- phone `--spacing-pinned-bar` override while the action bar shows.
- `messages/en.json`, `messages/fi.json` -- `collection.remove`, `collection.removeTitle`.
- `ARCHITECTURE-SPINE.md` -- `afterAction` comes from `useAfterAction()`; with no rows mounted it only toasts.
- `tests/unit/collectionPage.unit.spec.ts` -- two cases covering every matrix row. `tests/unit/collectionList.unit.spec.ts` -- probe and tree use the new provider. `tests/int/removeCopiesAction.int.spec.ts` -- new: `VALIDATION` (five inputs) and `UNAUTHENTICATED`, nothing removed.
- `sprint-status.yaml` -- 5.28 done.

**Review findings:** 19 findings. 4 patch entries (5 rows): untick only the sent ids (low, 2 rows), focus to Done after a confirm (medium), the spine's no-rows clause (low), the action's int test (medium). 1 deferred: stale Filter panel counts after row-changing actions (medium). 13 rejected, each with its reason in the triage log: 6 `low` (NOT_FOUND unticking all, Done/Esc while pending, out-of-view note in the dialog, unbounded array ×2, the untested pending guard) and 7 `false` (one-row actions layout, select-mode-ends reading, NOT_FOUND beyond the AC, loans, the service already built, uncommitted work, spine mentioning Book detail).

**Follow-up review:** recommended (`true`). Two medium entries were patched (focus to Done, the int test). The focus fix relies on the Dialog's `onClosed` running after Base UI's own focus return; it was checked in Chromium via Playwright only, not on iOS Safari. Patched counts: high 0, medium 2, low 2.

**Verification:** `npm run typecheck` -- no errors. `npx eslint` on the spec's paths plus the new int spec -- clean. Prettier clean on all code (the spine was already unformatted at baseline). `npm run test:unit` -- 59 files, 856 tests passed. `vitest --project int` on `removeCopiesAction.int.spec.ts` and `copyWrites.int.spec.ts` -- 11 passed. The implementer ran `next dev` against the worktree's Postgres (5433) and drove it with Playwright at 390px and 1280px: removals went through, phone bar two rows (138px) with an error toast above it, wide bar one row; focus ends on Done after a confirm.

**Residual risks:**
- The worktree's dev database (5433) holds a seeded user `manual@bookeh.test` with one copy left, from the browser checks; the container `bookeh-postgres-5-28` goes when the worktree is merged.
- When 5.29, 5.30 and 9.8 add Read, Move and Tag, the phone actions row needs to fit four buttons at 390px; the toast override assumes one row of actions.
- Filter panel counts stay stale after a removal until a navigation (deferred).

