---
title: '11.7 Copy picker'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: '9d84992987980d14d716edcc93e75a9a6d77548a'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** With two or more eligible copies, 11.6 closes a one-choice Picker before the action's own overlay opens, so Back is impossible and the handoff flickers. Opening a Book from a row or tile also gives no sign of life until the sheet or panel arrives.

**Approach:** The Picker wrapper gains a two-step mode once: a copy list shown first inside the step's own sheet or dialog, then the action's step with a Back control. Rows and tiles show the existing Progress line while their Link is pending.

## Boundaries & Constraints

**Always:**
- The list is titled with the action ("Lend", "Move", "Remove", "Returned", "Received") and the Book's title muted under it; rows give ordinal, location or "Ordered", status or lent marker, and acquired date (the 11.6 label).
- Lend, Move and Remove continue in the same sheet (phone) or dialog (wide): Lend's person and date, Move's locations, Remove's confirm naming the copy's location (and Book title) and keeping the title "Remove 1 book from library?". Back returns to the list; Cancel, X, Esc and browser Back close it all. One overlay, one history entry.
- Returned and Received with several eligible copies use the plain Picker list and act at once on the tap.
- With one eligible copy the list is skipped, exactly as in 11.6: Lend and Move Pickers, Remove's centred confirm Dialog (now also naming the location), Returned and Received immediate.
- The two-step mode is one wrapper feature reused by Lend, Move and Remove: the frame (`PickerFrame`) reads an optional lead from context and shows it until a copy is chosen. `MovePicker` and `LendPicker` gain no props of their own.
- Focus moves into the new step on choose and Back. Mutations, toasts, Undo, field errors, `afterAction` refresh and last-copy handling stay as in 11.6.
- Rows and tiles that open a Book show `ProgressLine` (label `progress.loading`) while their `<Link>` is pending, through a small client component inside the Link using `useLinkStatus()`. `BookRow` and `CoverTile` stay hook-free; select-mode rows untouched; no new tokens, no layout change.
- Strings in English and Finnish. A change to the Picker wrapper contract updates ARCHITECTURE-SPINE.md (UI primitives row) in this commit.

**Never:** No new overlay level. No schema, service or action changes. No per-action duplicate of the two-step logic. No committed tests beyond adapting 11.6's existing assertions to the new list title; no Playwright spec committed. Nothing for 11.10 (sheet at once).

</intent-contract>

## Code Map

- `src/app/(frontend)/components/ui/Picker.tsx`: `PickerFrame` (sheet on phone, Dialog on wide, form held per open) and `Picker` (rows + create). Add `PickerLeadContext`/`PickerLead` `{ title, description?, content, chosen, onBack }`; `PickerFrame` shows the lead's title/description/content and no `confirm` while `!chosen`, and a Back control first in the body once chosen. Extract the row list as exported `PickerRows` so the lead and `Picker` share it. Focus the first control of the new pane on a stage change (not on first mount).
- `src/app/(frontend)/(sections)/BookDetailActions.tsx`: today's `choosing`/`Picker` close-then-open handoff (lines ~246–262) and `step` state. Replace for lend/move/remove with `step { name, copy: CopyLine | null, copies }`, provide the lead context around MovePicker/LendPicker/the Remove step when `copies.length > 1`; keep the plain `Picker` for Returned/Received. Multi-copy Remove renders in `PickerFrame` (`confirm` destructive Button, `onClosed={remove}`); single-copy Remove keeps the Dialog. Both name the copy's location.
- `src/app/(frontend)/(sections)/MovePicker.tsx`, `LendPicker.tsx`: unchanged in props; they render `Picker`/`PickerFrame`, which pick up the lead from context. `copyIds`/`copyId`/`context`/`value` come from the chosen copy (before a choice, empty/null; the main pane is not shown).
- `src/app/(frontend)/(sections)/BookRow.tsx`, `CoverTile.tsx`: `<Link>` children; add the pending-line component after `content`/`cover`+`lines`.
- New `src/app/(frontend)/components/LinkProgress.tsx`: `'use client'`, `useLinkStatus()` → `ProgressLine` (`components/ProgressLine.tsx`, fixed top, reduce-motion safe). `SearchField.tsx` shows the `progress.loading` label usage.
- `messages/en.json`, `messages/fi.json`: `overlay.back` (Back / Takaisin), `detail.removeCopyOf` (naming line) as needed; `detail.chooseCopy` is dropped if unused.
- `tests/unit/bookDetailCopyLine.unit.spec.ts` (`confirmRemove`, line ~50): the chooser dialog is now named "Remove"; adapt only that.
- `ARCHITECTURE-SPINE.md` line ~317 (UI primitives): replace the "11.7 replaces this intermediate handoff" sentence with the shipped behaviour.
- Next docs: `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md` (hook only inside a descendant of `Link`; works best with `prefetch={false}`, as both already set).
- `tests/e2e/foldingSections.walk.spec.ts`, `copyActions.walk.spec.ts` (ignored): precedent for the required uncommitted walk; `playwright.config.ts` fixes port 3100, `bookeh_test`, fixture sources.

## Tasks & Acceptance

**Execution:**
- `Picker.tsx` -- add lead context, `PickerRows`, Back control, focus handoff -- the two-step mode once
- `BookDetailActions.tsx` -- one frame for list → step for lend/move/remove; plain list for returned/received; location-naming Remove -- reuse via context
- `LinkProgress.tsx`, `BookRow.tsx`, `CoverTile.tsx` -- Progress line while the Link is pending
- `messages/*.json`, `ARCHITECTURE-SPINE.md`, `bookDetailCopyLine.unit.spec.ts` -- strings, contract, adapted assertion
- `tests/e2e/copyPicker.walk.spec.ts` (git-ignored) -- walk the criteria below; record what was seen under `## Auto Run Result`

**Acceptance Criteria:**
- Given a Book with two eligible copies, when I tap Lend, Move or Remove, then one sheet (phone) or dialog (wide) opens titled with the action and the Book's title, listing both copies; a tap continues in the same overlay to Lend's person and date, Move's locations or Remove's confirm naming the location; Back returns to the list; Cancel/X closes all.
- Given two eligible copies, when I tap Returned or Received, then the list opens and a tap acts at once with its toast and Undo; only that copy changes.
- Given one eligible copy, when I tap any action, then no list shows and behaviour is as in 11.6.
- Given a row or tile in a list, when I tap it to open a Book, then the Progress line shows at the top edge until the sheet or panel shows; select-mode rows do not show it.
- Given English and Finnish, light and dark, phone and wide, then labels, focus after choose and Back, and Escape work with no second overlay open.

## Spec Change Log

## Review Triage Log

### 2026-11-11 — Review pass
- verdicts: 27 findings — high 0, medium 2, low 14, false 11, maybe-false 0
- findings (reviewer report order; no patch, defer or spec change):
  - Blind Hunter
    - `[false]` `[reject]` Back after Remove leaves a stale `confirmed.current` — it is set only in the confirm click and cleared by `remove()` on the close.
    - `[low]` `[reject]` `copyId ?? 0` sentinel — the form is not rendered until a copy is chosen; a guard adds a prop to `LendPicker` for no reachable case.
    - `[low]` `[reject]` Accessible name changes from action to confirm title — accepted; each pane is titled for its step.
    - `[low]` `[reject]` Focus selector is arbitrary — first control of the new pane; Back remains the fallback; no harm shown.
    - `[low]` `[reject]` Parallel `choosing` and `step` state — intended: Returned and Received act at once and need no step.
    - `[low]` `[reject]` `aria-pressed` on list rows — inherited from `Picker`; behaviour unchanged.
    - `[low]` `[reject]` No `LinkProgress` test or a11y check — the story names none; `ProgressLine` is fixed-positioned with a progressbar role.
    - `[false]` `[reject]` `detail.chooseCopy` may still be referenced — grep finds no other use.
    - `[low]` `[reject]` `lead` rebuilt each render — negligible.
    - `[low]` `[reject]` `useLinkStatus` mock repeated in five specs — test-only duplication; refactor not worth it.
  - Edge Case Hunter
    - `[false]` `[reject]` `choose` with zero copies — `copyActions` never yields an action without copies.
    - `[false]` `[reject]` Focus effect on reopen — `stage` follows `listed` whether or not the pane is mounted; the default open focus applies.
    - `[low]` `[reject]` No control in the chosen stage — focus falls back to Back.
    - `[low]` `[reject]` Stale `step.copies` after a refresh — same as 11.6's rejected snapshot finding; the services recheck eligibility.
    - `[false]` `[reject]` Leftover `confirmed.current` — see first row.
    - `[low]` `[reject]` Lend form values kept across Back — decided in Design Notes.
    - `[false]` `[reject]` Several pending links stack lines — `useLinkStatus` reports only the last pressed link.
    - `[false]` `[reject]` Pending never settles — Next clears it on error or abort.
    - `[false]` `[reject]` Title blank while Returned/Received closes — `choosing` is not cleared on close.
    - `[false]` `[reject]` `detail.removeCopyOf` missing — the spec said "as needed"; the line is built in code.
    - `[false]` `[reject]` Ordered one-copy Remove names title only — an ordered copy has no location to name.
  - Verification Gap
    - `[medium]` `[reject]` No test for multi-copy Lend/Move — only asks for a test; the story says no tests beyond 11.6's and the uncommitted walk exercised both.
    - `[medium]` `[reject]` Back not tested for Remove — same; the existing two-copy test pins the chosen copy id (`[22]`).
    - `[low]` `[reject]` Focus handoff untested — walk observed it.
    - `[low]` `[reject]` `LinkProgress` pending path untested — walk observed the line.
    - `[false]` `[reject]` `chooseCopy` references — see above.
  - Intent Alignment auditor: descriptive, no findings.

## Design Notes

Remove is the one step that differs by width: with one copy it stays the centred Dialog it was; with several it lives in the shared frame (a sheet on the phone) so the whole flow is one overlay. Lend's form keeps its typed values across Back; Move's and Remove's have none to keep.

## Verification

**Commands:**
- `npm run test:unit` -- all pass
- `npm run typecheck` -- no errors
- `npm run lint` -- no new errors in committed files
- `npm run test:e2e -- tests/e2e/copyPicker.walk.spec.ts --workers=1` -- walk passes on the fixture server
- `npm run test:e2e -- tests/e2e/scanToSave.spec.ts tests/e2e/shopCheck.spec.ts --workers=1` -- both pass

**Walk:** owned, lent and ordered copies of one Book at 390 and 1300px: each action with two copies (list, step, Back, close), one-copy skip, row and tile Progress line, Finnish, both themes.

## Auto Run Result

**Summary:** the Picker wrapper gained the two-step mode once (`PickerLeadContext` read by `PickerFrame`): Lend, Move and multi-copy Remove show the copy list, then their own step with Back, in one sheet or dialog. Returned and Received with several copies use the plain Picker. Rows and tiles show the Progress line while their Link is pending.

**Files:** `components/ui/Picker.tsx` (lead context, `PickerRows`, Back, focus), `(sections)/BookDetailActions.tsx` (one flow for list and step), `components/LinkProgress.tsx` (new), `BookRow.tsx` and `CoverTile.tsx` (line inside the Link), `messages/*.json` (`overlay.back`, `detail.chooseCopy` dropped), ARCHITECTURE-SPINE.md (UI primitives), `bookDetailCopyLine.unit.spec.ts` and five `next/link` test mocks (`useLinkStatus` stub).

**Review:** 27 findings; 0 patched, 0 deferred, all rejected with reasons in the Review Triage Log. Follow-up review recommended: false (no patches).

**Verification:** `npm run test:unit` 106 files, 1,404 tests passed; `npm run typecheck` passed; focused lint and prettier clean on changed files; walk and the scan-to-save and shop-check specs passed (below).

**Residual risks:** the walk did not submit a Lend through the multi-copy path, and Finnish was seen on Move only.

Walk `tests/e2e/copyPicker.walk.spec.ts` (git-ignored) passed on the fixture server. Seen at 390 and 1300px, light and dark: Book with two owned copies, Move/Lend/Remove each open one overlay titled with the action over the Book's title, list two copies, a tap continues in the same overlay (Move's locations, Lend's form with its typed person kept across Back, Remove's confirm "Title · Cabin" under "Remove 1 book from library?"), Back returns to the list with focus on the first row, Escape closes everything. One eligible copy: no list (Remove dialog names the location, no Back; Move Picker direct). Two lent copies: Returned lists and acts on the tap; two ordered copies: Received likewise. Finnish: Siirrä list, then "Siirrä sijaintiin" with Takaisin. Progress line shown on a pending row Link. No page errors. scanToSave and shopCheck pass.
