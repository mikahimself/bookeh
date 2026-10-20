---
title: 'Story 3.41: [A23] Base UI and the combobox, menu and picker wrappers'
type: 'feature'
created: '2026-10-20'
baseline_revision: '23a166bc49a306dd23b81f42b3c7f298ba0b709d'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Later screens pick and create locations, People, authors, series and tags (UX-DR15), and choose one option from a short list (UX-DR25: edition, Move, wishlist). The spine wants every such overlay to come from Base UI, wrapped once in `components/ui`. Story 3.40 shipped the dependency, the lint rule, `Dialog` and `Sheet`. The combobox, menu and picker are still missing, so these screens have nothing shared to build on.

**Approach:** Add three client wrappers in `src/app/(frontend)/components/ui`:
- `Combobox`, on Base UI Combobox. It picks a row or creates one by name, and its value is the spine's `Ref`.
- `Menu`, on Base UI Menu.
- `Picker`. It is the 3.40 `Sheet` under 900px and the 3.40 `Dialog` from 900px, and it closes after one choice.

All three take their look from the tokens. A new selection-bar utility draws the highlighted row; the 8px accent square marks the chosen row.

## Boundaries & Constraints

**Always:**
- Import Base UI only as `@base-ui/react/combobox` and `@base-ui/react/menu`, and only inside `components/ui`.
- Every wrapper is `'use client'`, a named export, and documented with a JSDoc line that cites the DESIGN.md row. Callers can't pass `className`.
- Every wrapper calls `useSuspendSwipe(open)` while its popup or overlay is open.
- **Combobox** (`ui/Combobox.tsx`), props `{ label: string; options: readonly { id: number; label: string }[]; value: Ref | null; onValueChange(value: Ref | null): void; error?: string; disabled?: boolean }`. `Ref` is a type-only import from `@/lib/payload/ref`.
  - **The field** is TextField's look: the label above, the value on an underline, and `error` handled as in TextField.
  - **The popup:**
    - Portalled, `side="bottom"`, `align="start"`, `sideOffset={0}`. Base UI's default collision handling stays.
    - `w-(--anchor-width)`, a 2px `text` outline, `bg-background`, no shadow. It scrolls within `--available-height`.
    - Option rows are in `text-control` and at least `min-h-tap` on the phone.
    - The highlighted row (`data-highlighted`) gets the `selection-bar` utility.
    - The chosen row shows the 8px accent marker (`size-2 bg-accent`) through `Combobox.ItemIndicator`. A row without the marker keeps an empty slot of the same width, so the labels line up.
  - **Filtering:** typing narrows the options with Base UI's collator "contains", in the next-intl locale.
  - **Creating:** while the trimmed query is non-empty and no option's label equals it under `Intl.Collator(locale, { sensitivity: 'accent' })`, a last row shows `combobox.create` with `{name}`. That comparison is case-insensitive and accent-sensitive, like `nameKey`.
  - **Choosing:**
    - An option emits its `id`.
    - The create row emits `{ create: trimmedQuery }`. The field then shows that name, and no option is marked.
    - A `{ create }` value shows its name.
  - **Clearing:** while a value is set, an `ActionLink` reading `combobox.clear` sits beside the field, rendered through `Combobox.Clear`, and emits `null`. With zero options the field still accepts a new name.
  - **Escape and history:** `Combobox.Empty` is always rendered, so Esc on an empty list does not bubble to a parent sheet. The popup is not an overlay: no `useOverlayLayer` and no history entry.
- **Menu** (`ui/Menu.tsx`), props `{ trigger: ReactElement; items: readonly { label: string; onSelect(): void }[] }`.
  - `Menu.Trigger render={trigger}`, so the caller passes a `Button` or an `ActionLink`.
  - The popup is the same outlined box as the combobox's, at `align="start"` and `sideOffset={0}`.
  - Items look like the combobox's options, with `selection-bar` on the highlighted item. Choosing an item runs `onSelect` and closes the menu.
  - Base UI's default `modal` stays.
- **Picker** (`ui/Picker.tsx`), generic over `V extends string | number`, props `{ open; onOpenChange(open: boolean): void; title: string; options: readonly { value: V; label: ReactNode }[]; value: V | null; onChoose(value: V): void }`.
  - **Phone:** a `Sheet` with `label={title}`. Its content starts with an `h2` holding `title` in `text-heading-group ui-case`.
  - **Wide:** a `Dialog` with `title={title}` and no `confirm`.
  - **The 900px switch:** `useWide()` in `ui/overlay.tsx` decides the form, through `useSyncExternalStore` on `matchMedia('(min-width: 900px)')`. Its server snapshot is `false`. The query sits in a named constant whose comment says it must equal `--breakpoint-wide`. The picker takes the value when it opens and keeps it until it closes, so a resize while open never swaps the overlay.
  - **Rows:**
    - A `<ul>` of full-width left-aligned `<button>`s, in `text-control`, at least `min-h-tap` on the phone.
    - Each button has `aria-pressed={chosen}`.
    - The chosen row carries the marker, and the others keep the empty slot.
  - **Choosing:**
    - Choosing a row calls `onOpenChange(false)`. `onChoose(value)` runs exactly once, after the picker's history entry is gone.
    - Choosing the chosen row closes the picker without calling `onChoose`.
  - **Back** closes the picker through the wrapper's existing `useCloseOnBack`, and `onChoose` is not called.
- **Supporting changes:**
  - `useCloseOnBack(open, close, onClosed?)` gains an optional `onClosed`. It runs once per close, after this overlay's entry is gone:
    - after the `popstate` that its own `history.back()` causes;
    - at once when no `back()` was needed (Back already left the entry, or the entry is no longer current).
  - `Sheet` and `Dialog` pass an optional `onClosed` prop through to it.
  - `Dialog`'s `confirm` becomes optional. Without it, the foot holds only Cancel.
- **Strings**, in both catalogues under `combobox`:
  - `create`: `New: {name}` / `Uusi: {name}`.
  - `clear`: `Clear` / `Tyhjennä`.

**Never:**
- No consumer screen, no committed preview route and no new Playwright spec. The Settings combobox is 3.42 and the edition picker is 3.53.
- No multi-select, no chips, and no async or `/data/suggest` loading. Those wait for their stories (5.9, 5.15, 9.7).
- No multi-step picker (Lend, tags, New list): those wait for their mock-up choices.
- No create dialog. Create is the inline row.
- No name matching beyond the display comparison above. The owning service resolves the `Ref`.
- No `Autocomplete`, no `unstable-use-media-query`, no `dark:` utilities, no inline style objects, and no colour or size literals in components.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick existing | Options Tampere (1), Turku (2); type "tu", choose Turku | `onValueChange(2)`; field shows Turku, marker on Turku next open | No error expected |
| Create new | Same options; type " Oulu " | Last row "New: Oulu"; choosing it emits `{ create: 'Oulu' }` | No error expected |
| Same name, other case | Type "tampere" | Tampere listed, no create row | No error expected |
| No options | `options` empty, type "Koti" | Only the create row; emits `{ create: 'Koti' }` | No error expected |
| Clear | `value` 1, Clear tapped | `onValueChange(null)`, Clear link gone | No error expected |
| Picker choose | Picker open, row B tapped | `onOpenChange(false)`, `history.back()` once, `onChoose('B')` only after the popstate | No error expected |
| Picker Back | Picker open, Back | Closes, `onChoose` never called | No error expected |
| Picker form | `matchMedia` wide at open, narrow while open | Dialog stays until closed; next open is the Sheet | No error expected |

</intent-contract>

## Code Map

- `src/app/(frontend)/components/ui/overlay.tsx`: `useOverlayLayer(kind)` and `useCloseOnBack(open, close)`.
  - The push/pop effect has no cleanup and checks a ref (StrictMode). The `popstate` listener effect removes itself when `open` turns false, before the pop's `popstate` lands.
  - So `onClosed` after an own `back()` needs its own `{ once: true }` listener, added where `back()` is called. Use `useEffectEvent` for `onClosed`, as for `close`.
  - Add `useWide()` here.
- `ui/Dialog.tsx`: `confirm: ReactNode` is required and Cancel is a `BaseDialog.Close`. Make `confirm` optional, add `onClosed?` and update the JSDoc.
- `ui/Sheet.tsx`: add `onClosed?`. The content goes in `Drawer.Content`, which already scrolls and pads.
- `components/TextField.tsx`: the field markup and underline classes. Extract the input class (for example `fieldClass(error: boolean)`) so the Combobox input matches without copying classes.
- `components/Link.tsx`: `ActionLink`, a Link-looking button. The "Clear" precedent is DESIGN.md's Rating row.
- `components/ErrorMessage.tsx`: the marker pattern `size-2 shrink-0` with `gap-2`. Use `bg-accent` for the chosen row.
- `components/swipe.ts:73`: `useSuspendSwipe(active)`. The portalled list is not a text field, so a touch on it would otherwise start a section swipe.
- `src/lib/payload/ref.ts`: `export type Ref = number | { create: string }`.
- `src/app/(frontend)/styles.css`: add `@utility selection-bar { box-shadow: inset var(--spacing-stroke-selection) 0 0 var(--color-accent); }` after `ui-case`. Theme shadows are cleared, so this is the only place it can live. `--breakpoint-wide: 900px` is at `:98`.
- `messages/en.json:63` and `fi.json`: the `overlay` block shows the shape. `tests/unit/messages.unit.spec.ts` checks key parity.
- Base UI 1.8.0 docs in `node_modules/@base-ui/react/docs/react/components/`:
  - `combobox.md`:
    - The creatable demo is at `:5516-5842`. Append a synthetic item and intercept it in `onValueChange`, but don't open a dialog.
    - Root props are at `:7198`. Positioner CSS vars are at `:7709`.
    - `Combobox.useFilter` is at `:8326`. `Empty` must stay mounted (`:8033`).
    - `itemToStringLabel` drives the input text.
  - `menu.md`: Item is at `:4558` and Root is at `:4159`.
- Nesting facts:
  - A press inside a portalled combobox or menu popup does not close an outer Drawer or Dialog.
  - Esc may reach both the combobox and the Drawer, because both listen on `document`. Verify this in the browser. If both close, guard in `Sheet`/`Dialog` `onOpenChange`: `reason === 'escape-key' && event.defaultPrevented` → `details.cancel()`.
- `tests/unit/overlay.unit.spec.ts`: the jsdom pattern for these components (next-intl mocked, `history.back` spied on, `popstate` dispatched by hand). Reuse it.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/styles.css`: add the `selection-bar` utility.
- `src/app/(frontend)/components/TextField.tsx`: export the shared input class.
- `src/app/(frontend)/components/ui/overlay.tsx`: add `onClosed` to `useCloseOnBack`, and add `useWide()`.
- `ui/Dialog.tsx` and `ui/Sheet.tsx`: make `confirm` optional and pass `onClosed` through.
- `ui/Combobox.tsx`, `ui/Menu.tsx` and `ui/Picker.tsx`: new. See Always.
- `messages/en.json` and `messages/fi.json`: add the `combobox` keys.
- `tests/unit/combobox.unit.spec.ts`: new, jsdom. Cover the matrix rows Pick existing, Create new, Same name other case, No options and Clear.
- `tests/unit/picker.unit.spec.ts`: new, jsdom. Cover Picker choose (no `onChoose` before the popstate, exactly once after it), Picker Back, and Picker form with a stubbed `matchMedia`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: set `3-41-a23-base-ui-and-the-combobox-menu-and-picker-wrappers` to its final status.

**Acceptance Criteria:**
- Given a temporary preview page (not committed) with a Combobox, a Menu and a Picker, plus a Combobox inside a Sheet, driven by a scratchpad Playwright script at 390×844 (touch) and at 1280×800, when the Combobox is focused and typed into, then:
  - **Combobox:**
    - The popup's left edge and width equal the field's, its top touches the field's bottom, and it has a 2px border.
    - The highlighted option's computed `box-shadow` is the 4px inset accent bar.
    - The chosen option shows the 8px marker.
    - Typing a new name shows "New: {name}".
- Given the same page, when the Picker opens:
  - At 390 it is the half-open sheet with the title heading.
  - At 1280 it is the centred dialog with only Cancel in its foot.
  - Choosing a row closes it, with the URL unchanged and the current entry the one from before it opened: `history.state` no longer holds the picker's token, and a further Back leaves the page.
  - Back closes it without a choice.
- Given the Combobox inside the open Sheet, when its popup is open and Esc is pressed, then only the popup closes. A second Esc closes the Sheet.
- Given the Menu, when the trigger is clicked and an item is chosen, then `onSelect` runs once and the menu closes with focus back on the trigger.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 29 findings — high 0, medium 3, low 19, false 6, maybe-false 1
- findings:
  - `[medium]` `[patch]` (blind) The Combobox text stops following `value` after mount. `inputValue` is controlled, so Base UI skips its label sync, and undo, refresh or reset leaves stale text. — While the popup is closed, `query` now re-syncs to the selected label through a `shownLabel` state adjusted during render.
  - `[low]` `[patch]` (blind) No `autoHighlight`: typing a new name and pressing Enter selects nothing, and blur drops the name. — `autoHighlight` set on the Root.
  - `[low]` `[reject]` (blind) A Picker open at hydration on a wide screen starts as the Sheet. — The Picker has no address, so nothing opens it at mount: 3.53 opens it from a tap, and `?pick` names the chosen candidate, not an open picker. The fix adds post-mount state.
  - `[false]` `[reject]` (blind) The Combobox has no `name` or hidden input for FormData. — 3.42 saves on choosing through an action call, not a form post. No named consumer serialises a `Ref` from FormData, and adding it would be new public surface for later.
  - `[low]` `[patch]` (blind) A wide Picker's rows sit inside `Dialog.Description`, so the whole list becomes the dialog's `aria-describedby`. — `Dialog` uses `Description` only when `confirm` is given, and a plain div otherwise.
  - `[low]` `[patch]` (blind) `disabled` has no look: DESIGN.md wants `text-dim`. — `fieldClass` gains `disabled:border-text-dim disabled:text-text-dim`.
  - `[low]` `[patch]` (blind) Clear is announced only as "Clear", ambiguous with several comboboxes, and is not in `meta` as in the Rating precedent. — Clear has `aria-describedby` pointing at the label. The size half is rejected: DESIGN.md sets `meta` for Rating only.
  - `[low]` `[reject]` (blind) The `else { closed() }` branch (entry no longer current) is untested. — No current or planned caller navigates while a Picker is open, and a review finding that only asks for a test needs a reason (Tests convention).
  - `[low]` `[patch]` (blind) The shared popup and marker classes live in `Combobox.tsx`, so Picker and Menu import the Combobox module and its Base UI import. — Moved to `ui/classes.ts`.
  - `[low]` `[patch]` (blind) Menu keys items by label, which collides on equal labels. — Keyed by index.
  - `[maybe-false]` `[reject]` (blind) The Menu has no Back handling, and Esc inside a Sheet was not checked for it. — Settling it needs a browser check of a Menu inside a Sheet. If true, the grade is only low: no screen uses the Menu, and Base UI Menu stops Esc the way the Combobox does, which passed that check.
  - `[medium]` `[patch]` (edge-case) A parent changing `value` after mount does not update the text. — Same root cause and patch as the first blind row.
  - `[low]` `[reject]` (edge-case) A numeric `value` with no matching option shows an empty field. — Services never hand the screen a dangling id. Handling it adds a branch for a state no caller produces.
  - `[low]` `[patch]` (edge-case) A row tapped during the exit animation sets `pending`, which a later Cancel or Back then delivers. — `choose` returns early while `open` is false. Resetting the ref during render, as suggested, fails `react-hooks/refs`.
  - `[low]` `[patch]` (edge-case) Menu keys collide on equal labels. — Same as the blind row; keyed by index.
  - `[low]` `[reject]` (edge-case) An empty `items` array opens an empty outlined box. — A caller error that no screen makes. Guarding it adds a branch.
  - `[low]` `[reject]` (edge-case) Hydration starts a picker that is open at mount in the wrong form. — Same refutation as the blind hydration row.
  - `[medium]` `[patch]` (edge-case) The claim "A `{ create }` value shows its name" fails after mount. — Same root cause and patch as the first blind row.
  - `[low]` `[patch]` (edge-case) The claim "`onChoose` runs exactly once" fails with a stale `pending`. — Same root cause and patch as the exit-animation row.
  - `[low]` `[patch]` (verification-gap) The wide (Dialog) form's `onClosed` passthrough is untested; dropping it passes every test. — "chooses only after its history entry is gone" now runs for both forms. The Dialog mutation fails it.
  - `[low]` `[patch]` (verification-gap) The accent sensitivity of the create row is untested; `'base'` passes every test. — Added a Café/Cafe case. Jyväskylä/Jyvaskyla does not separate `'base'` from `'accent'` under Finnish collation, because ä is its own letter there. The `'base'` mutation now fails.
  - `[low]` `[reject]` (verification-gap) No test checks `onClosed` when the entry is no longer current. — The layer filed it as defer. No caller reaches the path, and a test-only finding needs a reason.
  - `[low]` `[reject]` (verification-gap, other) Hydration form for a Picker open at mount. — Same as the blind hydration row.
  - `[false]` `[reject]` (intent) The visual criteria are verified only by an uncommitted Playwright script. — The spine's Tests convention: Playwright covers only scan-to-save and shop check. The browser run is recorded below.
  - `[false]` `[reject]` (intent) Back from a Picker nested in a Sheet is untested. — `useCloseOnBack` does not depend on the overlay kind. 3.40's "closes only the dialog on Back from a dialog inside a sheet" exercises the same token-stack path, and the Picker adds nothing to it.
  - `[false]` `[reject]` (intent) The Picker does not serve every UX-DR25 picker (Tag, Lend, New list). — The AC says "closes after one choice". The multi-step pickers wait for their mock-up choices (R-3 in the readiness proposal).
  - `[false]` `[reject]` (intent) The Picker uses `aria-pressed` buttons, not a radio group. — This is the TextSwitch precedent: Tab alone operates it and the state is announced. Nothing in the intent asks for a listbox.
  - `[low]` `[reject]` (intent) The Menu has no committed test. — Tests-only, with no consumer to break. The browser run checked `onSelect` once, the close and focus return.
  - `[false]` `[reject]` (intent) The diff changes shared 3.40 contracts beyond the AC surface. — These are deliberate and spec'd: optional `confirm`, `onClosed` for the close-then-navigate race 3.40 deferred, and the `fieldClass` reuse.

## Design Notes

**Why `onChoose` waits for the pop.** 3.53 replaces `?pick=n` when an edition is chosen, and 3.40 deferred the close-then-navigate race. If `onChoose` ran at once, `router.replace` would land on the picker's own same-URL entry. That drops its token: `navigation.ts` carries tokens only across a same-URL replace. Its `back()` would be skipped, which leaves a stray entry, and Back would no longer return to the camera. Running `onChoose` after the picker's entry has gone puts every consumer's navigation on the right entry. Fixing this in the wrapper fixes it once.

**Create row is display only.** The spine's rule "Screens never match names" keeps identity in the owning service. The collator comparison only hides a redundant row. If it ever disagrees with `nameKey`, `{ create }` still resolves to the existing row (`findOrCreateByName` and the services that own locations and People).

**Form held while open.** Swapping a Sheet for a Dialog mid-open would unmount one wrapper with its history entry still pushed (3.40 residual risk) and push another. Holding the form until close avoids this at no cost.

**Menu has no consumer yet.** The UX documents show row actions as visible Links. The wrapper is the minimum the spine lists, styled like the combobox popup, with no destructive or grouped items until a screen needs them.

## Verification

**Commands:**
- `npm run lint`: expected 0 errors.
- `npx tsc --noEmit`: expected clean.
- `npm run test:unit`: expected all pass, including the two new specs, `overlay.unit.spec.ts` and message parity.
- `npm run build`: expected success.

**Manual checks:**
- Run the Playwright script for the acceptance criteria above against `npm run dev`. The dev server uses the worktree `.env` with Postgres on `localhost:5433` and needs a signed-in user. Afterwards:
  - delete the preview page and the seeded user;
  - delete any `dev` (batch -1) row from `payload_migrations` before running `npm run build`.

## Auto Run Result

**Summary.** Three wrappers in `components/ui`:
- `Combobox` (Base UI Combobox): its value is a `Ref`.
  - It filters with a collator "contains" in the UI locale.
  - A last row, "New: {name}", appears while no option has the typed name. The check ignores case but not accents.
  - It has Clear, auto-highlight, and a label re-sync while closed.
- `Menu` (Base UI Menu).
- `Picker`: the `Sheet` under 900px and the `Dialog` from 900px.
  - The form is taken at each open and held until it closes.
  - One tap chooses and closes, and `onChoose` runs only after the picker's history entry has been popped. This settles the close-then-navigate race that 3.40 deferred, for every picker consumer (3.53 first).
- They share the outlined popup, the new `selection-bar` utility (an inset 4px accent bar) and the 8px accent marker.

**Files changed.**
- `src/app/(frontend)/components/ui/Combobox.tsx`, `Menu.tsx`, `Picker.tsx`: new.
- `ui/classes.ts`: new. It holds the popup, option and marker-slot classes the three share.
- `ui/overlay.tsx`:
  - `useCloseOnBack(open, close, onClosed?)`: `onClosed` runs once per close, after the entry is gone.
  - `useWide()`: `useSyncExternalStore` on `(min-width: 900px)`, with a server value of `false`.
- `ui/Dialog.tsx`:
  - `confirm` is optional; without it the foot holds only Cancel and the body is no `Description`.
  - `onClosed` added.
- `ui/Sheet.tsx`: `onClosed` added.
- `components/TextField.tsx`: exports `fieldClass(error)`, now with a disabled look.
- `styles.css`: `@utility selection-bar`.
- `messages/en.json`, `fi.json`: `combobox.create` ("New: {name}" / "Uusi: {name}") and `combobox.clear` ("Clear" / "Tyhjennä").
- `tests/unit/combobox.unit.spec.ts` (6 tests) and `tests/unit/picker.unit.spec.ts` (5 tests): new.
- `sprint-status.yaml`: 3.41 is done.

**Review.** 29 findings: medium 3, low 19, false 6, maybe-false 1. Grouped, that is one medium entry and nine low entries patched, nothing deferred, and the rest rejected.
- **Patched, medium:** the Combobox text re-syncs to `value`.
- **Patched, low:**
  - `autoHighlight`;
  - Clear described by the field label;
  - disabled look;
  - Picker rows are not the Dialog's description;
  - shared classes moved out of `Combobox.tsx`;
  - Menu keys by index;
  - no stale pending choice;
  - the Dialog-form choice test;
  - the accent-sensitivity test.
- **Rejected:** each with its reason in the Review Triage Log.
  - Picker hydration form (three findings);
  - FormData integration;
  - Clear size;
  - Menu Back and Esc;
  - a dangling numeric value;
  - empty Menu items;
  - two test-only gaps for the not-current-entry branch;
  - the intent auditor's six descriptive divergences: five false, and the Menu test is low.

**Follow-up review recommended: false.** This was the first pass. It patched one medium entry and no high.

**Verification.** Run in worktree `story-3-41-pickers`, Postgres on `localhost:5433`:
- `npm run lint`: 0 errors (36 pre-existing warnings).
- `npx tsc --noEmit`: clean.
- Prettier: clean.
- `npm run test:unit`: 34 files, 563 tests.
  - Mutation checks fail the new specs: dropping `onClosed` from the Dialog branch, and switching the collator to `'base'`. In the first pass, so did calling `onChoose` on the chosen row.
  - On one full run, `scanScreen.unit.spec.ts` failed, which is the flake 3.40 deferred. It then passed 3/3 alone and on a full rerun.
- `npm run build`: success. The worktree database was reset first; it had been dev-pushed and had no migration rows.
- **Browser check (implementation pass, before the review patches).** A scratchpad Playwright script ran against `next dev` with a temporary `/preview-pickers` page outside the signed-in layout, since removed. 62/62 checks passed at 390×844 (touch) and at 1280×800:
  - **Combobox:**
    - The popup's left edge and width equal the field's, its top touches the field's bottom, and its border is 2px.
    - The highlighted row's box-shadow is the 4px inset accent bar, and the chosen row has the 8px marker.
    - Typing a new name shows "New: Oulu".
  - **Picker:**
    - At 390 it is the half-open sheet with the heading; at 1280 it is the centred dialog with only Cancel.
    - Choosing closes it with the URL unchanged and no token left in `history.state`, and a further Back leaves the page.
    - Back closes it without a choice.
  - **Combobox in a Sheet:** the first Esc closes only the popup and the second closes the Sheet, so no Esc guard was needed.
  - **Menu:** `onSelect` runs once, the menu closes, and focus returns to the trigger.
  - The review patches (auto-highlight, the Dialog body, the re-sync) were checked only by the unit tests, lint, types and the build.

**Residual risks.**
- A Picker rendered already open during hydration on a wide screen starts as the Sheet. No caller does this.
- In single mode Base UI empties the value when the text is emptied, and puts the text back to the selection on blur. A typed name that is neither chosen nor highlighted is lost on blur. Auto-highlight makes Enter pick it.
- The Menu has no consumer, no Back handling and no committed test. Its Esc inside a Sheet is unverified.
- The 3.40 risks still apply. The `onClosed` path also runs at once when the entry is no longer current, and no test covers that branch.
