---
title: '7.24 [K30] Shared frontend code'
type: 'refactor'
created: '2026-10-31'
status: 'done'
baseline_revision: 'cbb9745814040023331e849bb31501feed94eca6'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred:
  - summary: >-
      Look it up again, which Book detail mounts, still reaches scan/answer.ts through actions/catalogue.ts for answerEditions and editionLines.
    evidence: |-
      Pre-existing import. The story's criterion is scoped to Add to wishlist, and the action is shared by Book detail and the In library Answer. An Epic 8 change to editionLines would still reach Look it up again. No later story takes it yet.
    location: >-
      src/app/(frontend)/actions/catalogue.ts:11
    severity: low
---

<intent-contract>

## Intent

**Problem:** Book detail imports from `scan/`, so reworking the Answer in Epic 8 would pull Book detail along. `LendPicker` re-implements `ui/Picker`, the lent condition is copied across rows, tiles, Book detail and the Answer, and `ManagedList` hard-codes the name limit.

**Approach:** Move the Add to wishlist code and `saveEntryAction` to shared homes, split `ui/Picker` into a frame Lend can compose, write `isLent()` once, and use `limits.name`. Behaviour stays as it is.

## Boundaries & Constraints

**Always:** EXPERIENCE.md's Lend row and `LendPicker`'s doc comment hold on both forms: rows mark and never lend, nothing resets but at an open, the picker stays open during a lend and on a field error it can show, and a close during a running lend still delivers the result. `saveEntryAction` keeps its input checks, error mapping, logging and doc comment. `AddToWishlist` keeps its props and press semantics. `Picker`'s existing props and behaviour do not change. An ordered copy is never lent.

**Never:** No `'use server'` file gains a sync export. No client component imports a value from `src/lib` outside the allowlist, and `eslint.config.mjs` does not change. No i18n key, wording or layout change. `Picker` gains no Lend-specific prop. No move of `answerEditions` or `editionLines`: `actions/catalogue.ts` is the action for Look it up again, used by Book detail and the Answer, and is outside this story. No change to `NameField` or `typed` homes. No new test file, except what a move requires.

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/actions.ts` -- `:183-227` `saveEntryAction`, `parseEntryInput`, `parseEntryTarget`. It shares `isIsbnInput`, `isbnTarget`, `IsbnInput`, `isManualFields`, `ManualInput`, `manualFields` with `saveCopyAction` and `saveManualAction`. Those are sync, so they cannot be exported from a `'use server'` file.
- `src/app/(frontend)/ref.ts` -- `parseRef`, the model for a plain client-input helper beside the actions.
- `src/app/(frontend)/actions/wishlists.ts` -- destination; header comment `:17` names what it holds.
- `src/app/(frontend)/scan/{AddToWishlist.tsx,entryTarget.ts,viewerWishlists.ts}` -- move. Importers: `(sections)/BookDetail.tsx:16-17`, `scan/page.tsx:17`, `scan/NotFoundForm.tsx:14,16`, `scan/NotInLibraryAnswer.tsx:6`.
- `src/app/(frontend)/scan/useAddToLibrary.ts:14-90` -- `useSavePress`, `SaveFailure`, `OnRefused`, `PressCall` move; `SaveCall` and `useAddToLibrary` stay and import them. `NotFoundForm.tsx:17` takes `OnRefused` from there.
- `src/app/(frontend)/components/useSavedSwitch.ts` -- precedent: a hook directly in `components/`.
- `src/app/(frontend)/(sections)/LookUpAgain.tsx:16` -- also mounted by Book detail and imports `EditionLabel` from `scan/EditionPicker`. `actions/catalogue.ts:12` takes the `EditionRow` type from the same file.
- `src/app/(frontend)/components/ui/Picker.tsx` -- `:64-82` held form and swipe, `:84` close, `:113` row class, `:157-192` Dialog or Sheet.
- `src/app/(frontend)/components/ui/classes.ts` -- `markerSlotClass`; the row class joins it.
- `src/app/(frontend)/components/ui/Dialog.tsx:18-23` -- `confirm` sits outside `children`, so a submitting confirm needs `form=`.
- `src/app/(frontend)/(sections)/LendPicker.tsx` -- `:75-76,90` held form, `:129` `onClosed`, `:181` row class, `:270-306` overlays. All state, `finish`, `lend` and field logic stay.
- Lent sites: `(sections)/BookRow.tsx:66`, `(sections)/CoverTile.tsx:51`, `(sections)/CollectionList.tsx:88`, `(sections)/BookDetail.tsx:89,141,142,166`, `scan/answer.ts:179`; `(sections)/Selection.tsx:28` comment.
- `src/lib/books/holdings.ts:18` -- `CopyLine['loan']`.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx:18,158` -- `ManagedItem` and `maxLength={200}`. `MovePicker` no longer hard-codes it. Story 7.23 left `ManagedItem` to this story.
- Tests that follow the moves: `tests/unit/{addToWishlist,notFoundForm,notInLibraryAnswer,viewerWishlists,unavailableActions,scanActions,addToLibrary,editionPicker,lookUpAgain}.unit.spec.ts`, `tests/int/saveCopyAction.int.spec.ts`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/saveInput.ts` -- new, no directive, the six shared input helpers and types moved from `scan/actions.ts`, exported.
- `src/app/(frontend)/scan/actions.ts` -- drop `saveEntryAction` and its parsers; import the helpers.
- `src/app/(frontend)/actions/wishlists.ts` -- add `saveEntryAction` and its parsers, doc comment kept; extend the header comment.
- `src/app/(frontend)/components/{AddToWishlist.tsx,entryTarget.ts,viewerWishlists.ts,useSavePress.ts}` -- moved as they are, with the imports they need. `useAddToLibrary.ts` imports from `useSavePress.ts`.
- `src/app/(frontend)/components/EditionLabel.tsx` -- new, `EditionRow` and `EditionLabel` from `scan/EditionPicker.tsx`; repoint `EditionPicker`, `LookUpAgain` and `actions/catalogue.ts`.
- `src/app/(frontend)/components/ui/classes.ts` -- add `pickerRowClass`.
- `src/app/(frontend)/components/ui/Picker.tsx` -- export `PickerFrame`; `Picker` renders through it. See Design Notes.
- `src/app/(frontend)/(sections)/LendPicker.tsx` -- compose `PickerFrame`, use `pickerRowClass`, drop `useWide`, `Dialog`, `Sheet`, `heldWide`.
- `src/app/(frontend)/isLent.ts` -- new, pure, a type guard. See Design Notes.
- Lent sites in the Code Map -- use `isLent()`; `Selection.tsx:28` names it.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx` -- `maxLength={limits.name}`; `ManagedItem = Named & { count: number }`.
- Listed tests -- repoint paths and mocks only; no assertion changes.

**Acceptance Criteria:**
- Given Add to wishlist in Book detail, when `src/app/(frontend)/(sections)` is searched for `scan/`, then no import matches, `saveEntryAction` lives in `actions/wishlists.ts`, and `AddToWishlist`, `viewerWishlists` and `useSavePress` live in `components/`.
- Given the Lend picker, when the story is done, then `LendPicker` imports neither `Dialog`, `Sheet` nor `useWide`, it gets the held form, the Dialog or Sheet and the `onClosed` wait from `PickerFrame` and the row class from `classes.ts`, and the existing `lendPicker` and `picker` specs pass without assertion changes.
- Given a Lend on a phone-width and a wide viewport, when a row is tapped, a date left and Lend pressed, and when a name is typed and Enter pressed, then the picker stays open until the lend ends, closes, and the toast "Lent to {person}" shows with Undo.
- Given the lent check, when `src/app/(frontend)` is searched, then `loan !== null` and `loan === null` appear only in `isLent.ts`, and rows, tiles, Book detail and the Answer call `isLent()`.
- Given `ManagedList`, when the story is done, then its name field uses `limits.name` and `maxLength={200}` is gone from `src`.
- Given Add to wishlist from Book detail and from the Answer, when a list is chosen, then the entry saves with the toast "Added to {list}" and Undo, Book detail staying open and the Answer going back to Scan.

## Spec Change Log

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 20 findings — high 0, medium 1, low 14, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` Verification: wide Lend through `PickerFrame`'s Dialog `confirm` had no committed test — Criterion 3 names the wide viewport. `describe('on a wide screen')` added to the Lend suite in `collectionPage.unit.spec.ts`; it fails with `confirm={confirm}` removed.
  - `[low]` `[patch]` Blind: `MovePicker.tsx:88` still hard-codes 200 — Confirmed, the Code Map and the JSX-only grep were wrong. Uses `limits.name`.
  - `[low]` `[patch]` Blind: `limits.name` governs location names without saying so — Comment extended; `Locations.ts` uses `limits.name`, value still 200, no schema change. `Genres.ts` untouched.
  - `[low]` `[defer]` Blind: Book detail still reaches `scan/answer` through `actions/catalogue.ts` — Pre-existing; the story's criterion is scoped to Add to wishlist and the action serves both surfaces. Recorded in `deferred`.
  - `[low]` `[reject]` Blind: no ESLint zone keeps `(sections)` off `scan/` — Nobody has re-added such an import, and a new zone is more than a direct correction.
  - `[low]` `[patch]` Blind: `EntryTarget` restates `IsbnInput` and `ManualInput` — Now built from them.
  - `[low]` `[reject]` Blind: the failure type is written three times and `SaveFailure` is exported unused — Moved as it was; no caller diverges, and a shared type widens `lib/errors` for no met defect.
  - `[low]` `[reject]` Blind: the save failure mapping spans two files — Pre-existing copies now apart; the helper adds surface, and the three tails differ in what passes through.
  - `[low]` `[patch]` Blind: moved doc comments name things outside the file — `PickerFrame`'s false "closes on its choice" sentence deleted. `saveEntryAction`'s comment stays: its `as in` references are true, and the contract keeps it.
  - `[low]` `[reject]` Blind: `copy.status === 'owned' && !isLent(copy)` appears twice — Two sites in one file; the story asked for one `isLent`, and a second predicate adds surface.
  - `[low]` `[patch]` Blind: test and helper placement after the moves — `scanActions.unit.spec.ts` renamed `saveEntryAction.unit.spec.ts`, the unused mock dropped. `viewerWishlists` stays in `components/`, the criterion's folder; the spine's tree line is illustrative, so it stays.
  - `[low]` `[defer]` Intent: Book detail reaches `scan/` only lexically free — The same root cause as the Blind row; same `deferred` item.
  - `[low]` `[reject]` Intent: the wait for close stays in `LendPicker`, not Picker — The frame owns the overlay's `onClosed`; `closedWhileRunning` must stay with Lend, since a generic choice ref cannot deliver a result when the close came first. A hook for one caller adds complexity with no behaviour gain.
  - `[false]` `[reject]` Intent: Lend renders `PickerFrame`, not `Picker` — `PickerFrame` is in `ui/Picker`, and the copied overlay code is gone. `Picker` closes on a choice, which Lend's row must not.
  - `[low]` `[reject]` Intent: row markup and open tracking remain in two layers — The row class is what the criterion names; each layer's `wasOpen` resets its own state.
  - `[low]` `[reject]` Intent: a close during a running lend was not walked — `running`, `closedWhileRunning` and `finish` are unchanged and `onClosed` is forwarded as is; field errors are covered by the Lend suite. A test here guards code this story did not change.
  - `[false]` `[reject]` Intent: `isLent` has no test — The ordered-with-loan case is pinned at `answer.unit.spec.ts:196-222` and `collectionPage.unit.spec.ts:330,358-368`.
  - `[false]` `[reject]` Intent: `CollectionList`'s toggle changed meaning — It differs only for an ordered copy with a loan, and an ordered copy is never lent.
  - `[false]` `[reject]` Intent: `saveInput.ts`, `EditionLabel.tsx` and `entryTarget` are beyond the criteria — Each is required by a move: a `'use server'` file exports only async functions, and the others sit in the import chain.
  - `[false]` `[reject]` Intent: `epic-7-context.md` is rewritten — Step 1 requires the recompile because the spine was newer.

## Design Notes

`PickerFrame` is what Lend needs and no more:

```ts
export function PickerFrame({ open, onOpenChange, title, description, onClosed, initialFocus, confirm, children }) {
  // heldWide (taken at each open), useSuspendSwipe, useId for the heading
  // wide:  <Dialog confirm={confirm} ...>{description first, then children}</Dialog>
  // phone: <Sheet labelledBy ...>heading + description, children, confirm</Sheet>, gap-4
}
```

`Picker` keeps `pending`, `name` and `field`, and passes its own `onClosed`. The wait for the close is the frame's `onClosed`: each caller keeps what it waits with, because Lend must also deliver a result when the close came first (`closedWhileRunning`), which a generic choice ref cannot express.

Lend's confirm moves out of the form on the phone, so both forms use one `<Button type="submit" form={formId}>`. A button tied by `form=` is still the form's default button, so Enter submits and a disabled one blocks it, as now. The phone's Lend stays last and full width in the `flex-col`. The sheet's accessible name now comes from `labelledBy`, the divergence the Epic 6 retro named; the name itself is the same.

`isLent` takes the owned check too, so callers keep their meaning and the guard narrows `loan`:

```ts
export const isLent = <C extends Pick<CopyLine, 'status' | 'loan'>>(
  copy: C,
): copy is C & { loan: NonNullable<CopyLine['loan']> } =>
  copy.status === 'owned' && copy.loan !== null
```

`lendable` and the Lend Link read `status === 'owned' && !isLent(copy)`. It lives in `src/app/(frontend)` because client components may not import it from `src/lib`.

`components/` is the shared folder: flat, as it already is. `EditionLabel` moves too because `LookUpAgain` is part of Book detail and the criterion's point is the import chain. `actions/catalogue.ts` still reads `scan/answer.ts`; see the contract.

No spine change: the action follows the existing rule, and nothing here is a shared contract. No new test: the criteria keep behaviour, the existing specs and the walk guard it.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors.
- `npm run typecheck` -- expected: pass.
- `npm run test:unit` -- expected: pass.
- `npm run test:int -- tests/int/saveCopyAction.int.spec.ts` -- expected: pass.
- `npx playwright test --config=playwright.config.ts tests/e2e/scanToSave.spec.ts` -- expected: pass.
- `grep -rn "scan/" "src/app/(frontend)/(sections)" | grep import` -- expected: nothing.
- `grep -rnE "loan (!|=)== null" "src/app/(frontend)"` -- expected: `isLent.ts` only.

**Manual checks (if no CLI):**
- Uncommitted walk `tests/e2e/lendAndWish.walk.spec.ts` on phone and wide viewports covers the Lend and Add to wishlist criteria; record what it saw under `## Auto Run Result`.

## Auto Run Result

Uncommitted walk `tests/e2e/lendAndWish.walk.spec.ts`, run at 390x844 and 1280x800, both passed, then deleted. The server action was delayed 800 ms to see the open state.
- Add to wishlist from the Answer: a list row chosen, back to Scan, toast "Added to Walk A" with Undo.
- Add to wishlist from Book detail: a list row chosen, the address unchanged and Book detail open, toast "Added to Walk B" with Undo.
- Lend with a typed name and Enter, on both forms: the picker still open 300 ms into the lend with no toast, then closed, toast "Lent to {person}" with Undo.
- Lend with a row: the tap marks it (`aria-pressed`) and leaves the picker open, the date left, Lend pressed: open during the lend, then closed, the same toast with Undo.

Seen on the phone: while Book detail's sheet is open, the toast's Undo is outside the accessibility tree (the sheet is modal), so the walk found it by text. Not touched by this story.

Walk correction: the walk ran before the review patches. Those changed no screen behaviour except `MovePicker`'s and `Locations`' constant, whose value is the same.

Summary: Book detail's Add to wishlist no longer imports from `scan/`: `saveEntryAction` is in `actions/wishlists.ts`, and `AddToWishlist`, `viewerWishlists`, `entryTarget` and `useSavePress` are in `components/`. `LendPicker` composes the new `PickerFrame` from `ui/Picker`, one `isLent()` replaces the conditions, and name fields use `limits.name`.

Files: new `saveInput.ts`, `isLent.ts`, `components/useSavePress.ts`, `components/EditionLabel.tsx`; moved `AddToWishlist.tsx`, `entryTarget.ts`, `viewerWishlists.ts`; `ui/Picker.tsx`, `ui/classes.ts`, `LendPicker.tsx`, `BookDetail.tsx`, `BookRow.tsx`, `CoverTile.tsx`, `CollectionList.tsx`, `Selection.tsx`, `LookUpAgain.tsx`, `ManagedList.tsx`, `MovePicker.tsx`, `actions/wishlists.ts`, `actions/catalogue.ts`, `scan/actions.ts`, `scan/answer.ts`, `scan/page.tsx`, `scan/EditionPicker.tsx`, `scan/NotFoundForm.tsx`, `scan/NotInLibraryAnswer.tsx`, `scan/useAddToLibrary.ts`; `fields/limits.ts`, `collections/Locations.ts`; test paths and mocks; one wide Lend case; `scanActions.unit.spec.ts` renamed `saveEntryAction.unit.spec.ts`.

Review: 6 entries patched (1 medium, 5 low); 1 issue deferred (2 rows); 7 low and 5 false rows rejected, reasons in the Triage Log. The Code Map's `MovePicker` line and `scanActions` test name are stale; the Triage Log records both.

Follow-up review: not recommended (`false`): no high and one medium patched.

Verification, after the patches: lint 0 errors (60 warnings), typecheck clean, unit 1089 passed, integration 688 passed, `scanToSave` e2e passed. The three greps give the expected lines. Removing `confirm={confirm}` made the new wide case fail, then it was restored.

Residual risks: `actions/catalogue.ts` still imports `scan/answer`, deferred with no story yet. A close during a running lend was neither walked nor newly tested; that code is unchanged. On the phone the toast's Undo sits outside the accessibility tree while Book detail's modal sheet is open, not checked against the old code, and worth a look in Story 7.27. The walk left lists and People for the e2e user in `bookeh_test`.
