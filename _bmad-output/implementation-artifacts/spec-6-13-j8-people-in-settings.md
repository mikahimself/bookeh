---
title: '6.13 [J8] People in Settings'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_revision: 'c209ad4346946d0bfd6c63d6911886142a7d60a0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The People service (6.3) can add, rename, merge and delete People and count their loans, but nothing calls it: People only appear by being typed into the lend picker, so "Antti" and "antti k" stay two People forever (FR-34, UX-DR50).

**Approach:** A People group in Settings' second column, after Locations, that behaves like the Locations group (5.33): one List row per Person with "{n} loans" and Rename / Merge / Delete Links, "Add person", and "No people". The Locations group's client logic becomes one shared managed-list component that both groups use; four People server actions call `lib/people`. Delete of a Person with loans opens a dialog that says they can't be deleted and offers Merge.

## Boundaries & Constraints

**Always:**
- Reads: `personUse(ctx)` in `settings/page.tsx`, after the existing reads (gateway calls on one context run one after the other). Rows in `personUse` order (by name, Finnish collation); the count is `loans`.
- Actions `createPersonAction`, `renamePersonAction`, `mergePersonAction`, `deletePersonAction` in `settings/actions.ts`, the same shape as the location actions: `runAction` + `requireUserOrThrow`, a non-string name or non-row-id input fails `VALIDATION` with no write, normalising and ownership are the service's. They call `createPerson`, `renamePerson`, `mergePerson`, `deletePerson` and return `null`.
- One shared client component (`settings/ManagedList.tsx`) holds what is now `LocationsGroup`'s logic: the inline `NameField`, rows, the merge `Picker`, the merge and delete `Dialog`s, `run`, `offerMerge`. `LocationsGroup` and the new `PeopleGroup` are thin client wrappers that pass their items, actions and translated strings. Locations behave exactly as before.
- People strings: group heading "People", meta "{n} loans" (ICU plural, `=0` included: "0 loans"), "Add person", "No people", picker "Merge {name} into", merge dialog "Merge {source} into {target}?" with "{n} loans move to {target}.", delete dialog "Delete {name}?" with destructive "Delete" and no body. English and Finnish; in Finnish a typed name sits where it needs no inflection (after a noun such as "henkilöön", or after a separator).
- Delete of a Person whose `loans > 0` opens a dialog titled "Can't delete {name}" whose body says they have {n} loans so they can't be deleted. With another Person in the list it adds "Merge them into another person instead." and its confirm is a primary "Merge" that, after the dialog has closed (`onClosed`), opens the merge Picker for that Person; with no other Person it has only Cancel. No delete call is made from it.
- A confirmed delete that fails `PERSON_IN_USE` (a loan made elsewhere since the list was read) shows the error toast through `useReportFailure` and refreshes the list; so does `NOT_FOUND`, as for locations.
- The name field's label and blank-name message become generic keys (`settings.name`, `settings.nameRequired`) shared by both groups; `settings.locationName` and `settings.locationNameRequired` go.
- Tokens only, 44px taps on the phone, `ActionLink` for Links (Delete destructive), no Undo, no success toast; every success `router.refresh()`.

**Never:**
- No change to `lib/people`, the `people` or `loans` collections, migrations or `payload-types.ts`.
- No wishlist counts ("1 wish") or wishlist rules: Epic 7.
- No Tags, My genres or My themes groups.
- No spine change: no contract changes (the actions are single-page, `personUse` and the errors exist).
- No per-row "in use" lookup on the server beyond `personUse`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| List | Antti (2 loans), Leena (0) | rows "Antti · 2 loans", "Leena · 0 loans", each with Rename, Merge, Delete | — |
| Add | "Add person", "  Liisa  K " | row "Liisa K · 0 loans" | — |
| Add taken | "antti" with Antti | field stays, "That name is already in use." (no Merge Link) | `NAME_TAKEN` |
| Add blank | field left empty | field dropped, no call | — |
| Rename case-only | Antti → "ANTTI" | row "ANTTI" | — |
| Rename taken | "antti k" → "antti" | field stays, message + Merge Link → dialog "Merge antti k into Antti?", "1 loan moves to Antti." → merged | `NAME_TAKEN` |
| Merge | Merge on "antti k" (1) → picker → Antti (2) → confirm | one row "Antti · 3 loans" | — |
| Delete unused | Leena (0) → Delete → confirm | row gone | — |
| Delete with loans | Antti (2) → Delete | dialog "Can't delete Antti", says 2 loans, Merge → picker of the others → merge dialog | no delete call |
| Delete with loans, alone | only Antti (2) → Delete | dialog says can't be deleted, Cancel only | — |
| Stale delete | Leena shown with 0, lent since → confirm Delete | error toast "This person has loans, so they can't be deleted.", list refreshed | `PERSON_IN_USE` |
| Gone | deleted in another tab | error toast, list refreshed | `NOT_FOUND` |
| None | no People | "No people" + "Add person" | — |
| One Person | only Leena | no Merge Link on the row | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/settings/LocationsGroup.tsx` -- all 319 lines are the template. `NameField` (lines 25–143: blur/Enter save, Esc drop, `fieldFailure` maps `VALIDATION` on `name` → `settings.locationNameRequired` and `NAME_TAKEN` → `errors.NAME_TAKEN` + optional Merge `ActionLink`), `LocationsGroup` (145–319: `run` refreshes on ok or `NOT_FOUND`; `offerMerge` refreshes when `conflictId` is not in the list; Merge Link only when `length > 1`; each Dialog keeps its last content while it closes). Its strings: `noLocations`, `addLocation`, `locationCount`, `mergeInto`, `mergeTitle`, `mergeBody`, `deleteTitle`, `deleteBody`; `rename`, `merge`, `delete` are shared. Move the logic to `ManagedList.tsx` (`git mv`, so the history follows), leave `LocationsGroup.tsx` as the wrapper; `CountedLocation` stays exported from `LocationsGroup.tsx`.
- `src/app/(frontend)/(sections)/settings/actions.ts` -- location actions and the `name()` / `id()` input checks to reuse for People.
- `src/app/(frontend)/(sections)/settings/page.tsx:47-84,113-117` -- reads (`getProfile`, `listLocations`, `filterValues`) and the second column; the doc comment (lines 36–46) and the column comment ("People and tags arrive with later stories") need People added. The `Group` helper renders the heading.
- `src/lib/people/people.ts` -- `createPerson(ctx, name): Promise<number>` (`VALIDATION` on `name` incl. `TOO_LONG`, `NAME_TAKEN` + `conflictId`), `renamePerson(ctx, id, name)` (`NOT_FOUND`, same name errors), `mergePerson(ctx, source, target)` (`NOT_FOUND`, self → `VALIDATION`), `deletePerson(ctx, id)` (`NOT_FOUND`, `PERSON_IN_USE`), `personUse(ctx): PersonUse[]` (`{ id, name, loans }`). Read-only; all tested in `tests/int/peopleService.int.spec.ts`.
- `src/app/(frontend)/components/ui/Dialog.tsx` -- `confirm` slot; without it only Cancel; `onClosed` runs after the dialog's history entry is gone. `src/app/(frontend)/(sections)/SelectBar.tsx:164-185` -- the `onClosed` + ref pattern for acting after a close (use it to open the Picker from the in-use dialog: nothing opens on top of a dialog).
- `src/app/(frontend)/components/ui/Picker.tsx` -- `onChoose` runs after its close, so opening the merge Dialog there is one overlay deep.
- `src/app/(frontend)/components/ListRow.tsx`, `Link.tsx` (`ActionLink`), `Button.tsx`, `TextField.tsx`, `request.ts` (`settleAction`, `useReportFailure`) -- reused as is.
- `messages/en.json`, `messages/fi.json` -- `settings` block (location strings at the keys above); `errors.PERSON_IN_USE` and `errors.NAME_TAKEN` exist. `tests/unit/messages.unit.spec.ts` checks en/fi key parity.
- `tests/unit/locationsGroup.unit.spec.ts` -- mocks `next-intl` with a key echo (`key {values}`), `next/navigation`, the settings actions module and the toast; finds the field by label `settings.locationName` (becomes `settings.name`). It must keep passing: it guards the Locations behaviour through the refactor.
- Mock-up `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/mockups/key-settings.html` -- People below Locations in the second column, "2 loans", "1 loan".

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx` -- new (via `git mv` of `LocationsGroup.tsx`): the generic managed list. Props: the items (`{ id, name, count }`), the four actions, the translated strings the wrapper builds (empty, add, count, merge-into, merge title/body, delete title/body), and an optional "in use" rule: a predicate plus the in-use dialog's title/body/merge-offer strings. `run` also refreshes on `PERSON_IN_USE`. `NameField` uses `settings.name` / `settings.nameRequired`. Doc comments cover both groups (FR-31, FR-34, UX-DR50).
- `src/app/(frontend)/(sections)/settings/LocationsGroup.tsx` -- thin client wrapper: `useTranslations('settings')`, the location actions, the location strings; exports `CountedLocation` and `LocationsGroup` with the same props as today.
- `src/app/(frontend)/(sections)/settings/PeopleGroup.tsx` -- new thin client wrapper: People actions and strings; in use is `count > 0`. Exports `PeopleGroup({ people: readonly PersonUse-like[] })` mapping `loans` to the count.
- `src/app/(frontend)/(sections)/settings/actions.ts` -- the four People actions; the header comment names FR-34 too.
- `src/app/(frontend)/(sections)/settings/page.tsx` -- `const people = await personUse(ctx)`; a `Group` "People" with `PeopleGroup` after Locations; doc and column comments updated.
- `messages/en.json`, `messages/fi.json` -- rename `locationName` → `name`, `locationNameRequired` → `nameRequired`; add `people`, `noPeople`, `addPerson`, `personCount`, `personMergeInto`, `personMergeTitle`, `personMergeBody`, `personInUseTitle`, `personInUseBody`, `personInUseMerge` (en e.g. "{count, plural, one {They have # loan, so they can't be deleted.} other {They have # loans, so they can't be deleted.}}"; fi e.g. "Hänellä on # laina/lainaa, joten häntä ei voi poistaa.", "Yhdistä hänet toiseen henkilöön.", "Yhdistä {name} henkilöön", "Yhdistetäänkö {source} henkilöön {target}?", "Ei voi poistaa: {name}"). `deleteTitle` is shared.
- `tests/unit/locationsGroup.unit.spec.ts` -- field label `settings.name`; nothing else changes.
- `tests/unit/peopleGroup.unit.spec.ts` -- new, same mocks as the Locations test: Delete on a Person with loans opens the in-use dialog naming the count, its Merge opens the picker, choosing the other Person and confirming calls `mergePersonAction(source, target)`, and `deletePersonAction` is never called (the acceptance criterion's "can't be deleted and offers Merge").
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `6-13-j8-people-in-settings: done` when the story is done.

**Acceptance Criteria:**
- Given `/settings` with People, when the People group renders, then each Person is a List row with "{n} loans" and Rename, Merge, Delete Links (Merge only with another Person, the Links on a second line on the phone), and "Add person" adds one; with none, "No people" shows.
- Given Rename onto a name in use, when saved, then it is rejected under the field with a Merge Link into that Person, and Merge (from the Link or the row) is confirmed by a dialog before anything moves.
- Given a Person with loans, when Delete is chosen, then a dialog says they can't be deleted and offers Merge; nothing is deleted.
- Given the Locations group after the refactor, when used, then it behaves as before (its unit test passes unchanged except for the field label key).

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 24 findings — high 0, medium 1, low 12, false 11, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: typed names in Dialog and Picker titles are lowercased by `ui-case` ("Can't delete Antti", "Merge Antti into Leena?"), against DESIGN.md → Lowercase and the epic's Names rule — names now sit in a `<typed>` tag rendered as a `normal-case` span through `t.rich`; Dialog and Picker `title` widened to `ReactNode`, the phone Picker names its Sheet by `aria-labelledby` (Sheet gains an optional `labelledBy`). Fixes the Locations titles too.
  - `[low]` `[patch]` Blind: the recompiled `epic-6-context.md` conflicts with main, which committed its own rewrite with 6.6 (f2368f1), and is stale against it — restored to the baseline; main's version wins on rebase.
  - `[low]` `[patch]` Blind: the same rewrite drops guidance open stories need — same root cause as the row above; restored with it.
  - `[low]` `[patch]` Blind: `TOO_LONG` on `name` shows "Enter a name." (reachable only when NFC lengthens a 200-unit input) — `NameField` maps `TOO_LONG` to `errors.TOO_LONG` first.
  - `[low]` `[reject]` Blind: `ManagedList`'s `STALE` names `PERSON_IN_USE`, a People code, in the generic list — no caller diverges (Locations never receives it); moving it into `InUseRule` adds a parameter.
  - `[low]` `[reject]` Blind: a Person shown with loans whose loans were removed elsewhere can't be deleted until the page is re-read — needs a copy removed in another tab while Settings is open; leaving and returning re-reads the page, and a refresh per dialog opening adds a server render each time.
  - `[low]` `[patch]` Blind: `personInUseBody` "They have 2 loans" reads as loans still out, though returned ones count — reworded to "open or returned" in en and fi.
  - `[false]` `[reject]` Blind: Finnish merge title (illative "henkilöön") and body (allative "henkilölle") use different cases — merging into a Person is illative and loans moving to a Person are allative; both are the correct Finnish construction.
  - `[false]` `[reject]` Blind: the in-use body joins two translated sentences with a space — both languages render two complete sentences; there are no third-party translators to lose control.
  - `[low]` `[reject]` Blind: `peopleGroup.unit.spec.ts` goes past the functional minimum — the extra cases were added for the workflow's matrix test audit; each guards a matrix row of the shared list (empty state, Merge only with another Person, blank drop, taken name, stale refresh).
  - `[low]` `[reject]` Blind: two open name fields (one per group) share the accessible name "Name" — needs a field stuck on an error in one group while adding in the other; a per-group label adds a parameter.
  - `[low]` `[reject]` Edge: `TOO_LONG` shows the blank-name message — same group as the Blind row; patched there.
  - `[low]` `[reject]` Edge: stale in-use count with no way out — same group as the Blind row; rejected there.
  - `[low]` `[reject]` Verification gap: no test checks the People actions' argument order (merge direction) — asks only for a test; the action is a one-line pass-through that reads correctly, the location actions share the shape untested, and CLAUDE.md keeps tests to the functional minimum.
  - `[low]` `[patch]` Verification gap: the in-use test would pass if the Picker opened on top of the dialog — the test now asserts the in-use dialog is gone once the Picker is found.
  - `[false]` `[reject]` Intent: rename-onto-taken for People has no People test — the path is the shared `ManagedList` code, guarded by the Locations test; the service rule is in `peopleService.int.spec.ts`.
  - `[false]` `[reject]` Intent: the server wiring (actions, page read) is untested — same as the verification-gap row; typecheck binds the action signatures and the services are tested.
  - `[false]` `[reject]` Intent: the rendered en/fi copy is untested — CLAUDE.md: no tests restating strings; `messages.unit.spec.ts` keeps the catalogues in parity.
  - `[false]` `[reject]` Intent: the phone second line and 44px taps are not exercised — `ListRow` is unchanged from 5.33, which provides both.
  - `[false]` `[reject]` Intent: People's delete dialog has no body, against "says what will lose its location or tag" — that clause names locations and tags; nothing loses anything when an unused Person goes.
  - `[false]` `[reject]` Intent: "2 loans" could mean loans currently out — spine AD-18: a Person's count comes from `personUse()`, which counts open and returned loans.
  - `[false]` `[reject]` Intent: the wishlist half of FR-34 and "1 wish" are missing — Epic 7 work by the epic's own plan.
  - `[low]` `[patch]` Intent: the epic-context rewrite goes beyond 6.13 — same group as the Blind context rows; restored.
  - `[false]` `[reject]` Intent: the Locations refactor is guarded only by two Locations cases — the People tests run the same `ManagedList` paths (add field, empty state, Merge only with another item, stale refresh).

## Design Notes

**Why one shared component.** Locations and People need the same field, rows, picker and dialogs; the only differences are strings, actions and the in-use delete. Two copies of ~250 lines would drift. The shared component is for the two groups built now, not for Tags later, though Tags would fit it.

**In-use delete without a server call.** `personUse` already gives the count, so the dialog is decided on the client; the service's `PERSON_IN_USE` stays the guarantee for a stale list. The in-use dialog opens the Picker only after it has closed, as `SelectBar` does after its confirm:

```tsx
onClosed={() => {
  if (!mergeAfterClose.current) return
  mergeAfterClose.current = false
  openPicker(blocked)
}}
```

**"No people".** UX-DR50 names "No locations" only; the People group follows the Locations pattern (epic context), so an empty group says "No people" ("Ei henkilöitä") above "Add person".

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including `locationsGroup.unit.spec.ts`, `peopleGroup.unit.spec.ts`, `messages.unit.spec.ts`.
- `npm run test:reset && npm run test:int` -- expected: all pass (the worktree's `.env` points at its own Postgres on port 5433).

## Auto Run Result

**Summary.** Settings has a People group after Locations. Each Person is a List row with "{n} loans" (open and returned, from `personUse`) and Rename, Merge (only with another Person) and Delete; "Add person" opens a name field at the top; "No people" when there are none. Rename onto a name in use offers Merge under the field; Merge picks the target and a dialog confirms. Delete of a Person with loans opens "Can't delete {name}", which says why and, with another Person, offers Merge (the Picker opens after the dialog closes); no delete call. A stale list (`PERSON_IN_USE`, `NOT_FOUND`) shows the error toast and refreshes. The Locations group's logic moved into a shared `ManagedList`; `LocationsGroup` and `PeopleGroup` are thin wrappers. Typed names in dialog and picker titles now keep their case, for locations too.

**Files changed.**
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx` -- new (from `LocationsGroup.tsx`): the shared managed list, the in-use rule, `TOO_LONG` message, `typed` span.
- `src/app/(frontend)/(sections)/settings/LocationsGroup.tsx` -- thin wrapper, same props.
- `src/app/(frontend)/(sections)/settings/PeopleGroup.tsx` -- new wrapper; in use when loans > 0.
- `src/app/(frontend)/(sections)/settings/actions.ts` -- `createPersonAction`, `renamePersonAction`, `mergePersonAction`, `deletePersonAction`.
- `src/app/(frontend)/(sections)/settings/page.tsx` -- reads `personUse`, renders the People group.
- `src/app/(frontend)/components/ui/Dialog.tsx`, `Picker.tsx`, `Sheet.tsx` -- `title` is a `ReactNode`; the phone Picker's Sheet is named by its heading (`labelledBy`).
- `messages/en.json`, `messages/fi.json` -- People strings; `name`/`nameRequired` replace the location-only keys; names in titles wrapped in `<typed>`.
- `tests/unit/peopleGroup.unit.spec.ts` -- new: in-use delete offers Merge, alone gets Cancel only, rows/empty/Merge-only-with-others, blank and taken add, delete refresh on ok/`PERSON_IN_USE`/`NOT_FOUND`.
- `tests/unit/locationsGroup.unit.spec.ts` -- field label key and `t.rich` in the mock.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 6.13 done.

**Review.** One pass, 24 findings: medium 1, low 12, false 11. Patched: the lowercased typed names (medium), the epic-context restore, `TOO_LONG`, the in-use wording, the dialog-closed assertion (low). Deferred: none. Rejected with reasons in the triage log: `PERSON_IN_USE` in the generic list, the stale in-use count, extra tests, shared "Name" label, untested action argument order, and the false rows (Finnish cases, glued sentences, test-only asks, delete body, count meaning, wishlists, refactor coverage).

**Follow-up review:** not recommended. Patched entries: high 0, medium 1, low 4.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (48 warnings, all in generated migrations).
- `npm run test:unit`: 938 passed (64 files). A first full run had two `collectionPage.unit.spec.ts` timeouts under load; the file passed alone and in the final full run.
- `npm run test:reset && npm run test:int`: 590 passed (70 files), on the worktree's Postgres (port 5433).
- Matrix audit: service rows by `peopleService.int.spec.ts`, rename-taken through the shared list by `locationsGroup.unit.spec.ts`, UI rows by `peopleGroup.unit.spec.ts`.
- No schema change; not opened in a browser.

**Residual risks.**
- Built in a worktree beside 6.6 (since merged to main as f2368f1). Shared files: `_bmad-output/implementation-artifacts/sprint-status.yaml` (adjacent story lines) and `epic-6-context.md` (restored to baseline here; take main's on rebase).
- `Dialog`, `Picker` and `Sheet` prop changes touch every overlay caller; typecheck and the full unit suite pass.
- A Person whose loans were removed elsewhere stays "in use" until Settings is re-read.
