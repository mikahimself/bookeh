---
title: 'Phone polish: clear X, back to top, find button, read switch without Undo'
type: 'feature'
created: '2026-10-27'
status: 'done'
baseline_commit: '195659fb604b86102c088e9f5299a57933e8657d'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On the phone, text fields have no quick way to empty them. Long lists have no way back to the top. The ISBN field's number pad has no Return key, so a typed ISBN can't be submitted. And the read switch on Book detail shows an Undo toast for something one tap puts back.

**Approach:** Four frontend fixes, chosen 2026-10-27 from rendered options (all option A, `phone-polish-options.html`):
1. A clear X at the right end of single-line text fields, shown whenever the field has text, drawn slightly smaller than the Close X.
2. A back-to-top square in the phone's pinned bar, beside Scan book.
3. A "find" submit button beside the ISBN field, drawn slightly smaller than a standard Button.
4. The read switch saves with no toast at all.

Currently reading is a separate later story (deferred-work.md).

## Boundaries & Constraints

**Always:**
- Use DESIGN.md's look: square, outlined, lowercase, 2px strokes, the X with no circle.
- Every control keeps a tap area at least 44px high on the phone (DESIGN.md, Tap area), whatever its drawn size.
- Bulk mark read/unread in the SelectBar keeps its Undo toast (PRD FR-15).
- Update PRD FR-15, EXPERIENCE.md and DESIGN.md in the same commit.

**Never:**
- No clear X on textareas, password fields or the Filter panel's numeric year inputs.
- The Combobox keeps its existing "Clear" Link and gets no X.
- No back-to-top on wide screens (there is no pinned bar there), and none while the SelectBar replaces the Scan book bar.
- No auto-lookup on the 13th digit.
- No data-model change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Clear a filled field | Title field "Muumipappa ja meri", tap X | Field empty, focus stays in it, the X disappears, the component's onChange sees "" | N/A |
| Empty field | Field empty | No X drawn | N/A |
| Clear search | Search "jansson", tap X | Field empty; the list returns to unfiltered after the usual pause; iOS's native search clear is not drawn | N/A |
| Scroll a long list | Phone, scrolled past about 2 viewport heights | Square ↑ appears right of Scan book; tapping it scrolls to top (smoothly, or instantly under reduced motion) and it hides near the top | N/A |
| Typed ISBN | "9789513119554", tap "find" | Same as the Go key today: navigates to `/scan?isbn=…` | Invalid ISBN shows the existing field error |
| Read switch | Book detail, tap read | Saved, switch shows read, no toast, the shelf reloads through `afterAction` | Failure goes through `afterAction`'s error toast as today |

</frozen-after-approval>

## Code Map

Paths are under `src/app/(frontend)/` unless they say otherwise.

- `components/TextField.tsx`
  - `fieldClass` and `Field` are shared by `TextField`, `TextAreaField` and the Combobox.
  - The placeholder `" "` already lets CSS see emptiness (`placeholder-shown`), so the X's visibility can be pure CSS: `peer` plus `peer-placeholder-shown:hidden` and `peer-disabled:hidden`.
- `components/CloseButton.tsx` — the X stroke to copy. Drawn at `size-4`; the clear X is `size-3`.
- `(sections)/SearchField.tsx:103`
  - A raw `type="search"` input using `fieldClass`. Controlled (`text`), with debounced `apply`.
  - Has no visible label; the aria-label is `collection.search`.
- `components/ui/Combobox.tsx:134` — the existing `BaseCombobox.Clear` Link. Leave it alone.
- Other `TextField` users get the X for free (LendPicker, DisplayNameField, ManagedList, MoreDetails, NotFoundForm, Picker "New location", ScanScreen). `login/LoginForm.tsx` has a password field, which stays without one.
- `styles.css` — add the rule hiding `::-webkit-search-cancel-button`. Pinned-bar tokens are at :139 and :584-591.
- `(sections)/layout.tsx:47-52`
  - The phone's pinned bar: `data-pinned-bottom`, `wide:hidden`, `sticky bottom-0`.
  - It currently holds only `scanBook('flex w-full')`. It is a server component.
  - The window is the scroll container (`ShelfRows.tsx:215/233` use `window.scrollY`).
- `scan/ScanScreen.tsx:158-174` — `<form onSubmit={submit}>` around the ISBN `TextField`, which has `inputMode="numeric"` and `enterKeyHint="go"`. It has no button.
- `components/Button.tsx` — `buttonClass('secondary')` is `px-4 py-2 … max-wide:min-h-tap`.
- `(sections)/ReadAndRating.tsx:59-70` — the `setRead` success handler calls `show({... undo})`. The `onUndone` listener at :39-48 stays, because bulk Undo can still change the flag while detail is open (spine line 148).
- `(sections)/actions.ts:87` — `setReadAction` wraps the write in `withUndo`. `withTransaction` lives at `src/lib/payload/transaction.ts:45`.
- `src/lib/books/setRead.ts` — no change. Its `Undone` shape stays for the bulk path.
- `messages/en.json`, `messages/fi.json` — `combobox.clear` already exists. New keys are needed for the find button and the back-to-top label.
- `tests/unit/readAndRating.unit.spec.ts` — its first test asserts the Undo toast and must now assert no toast.
- `tests/int/setRead.int.spec.ts` — guards `setRead` under `withUndo`. It stays as is, because the bulk path still uses it.

## Tasks & Acceptance

**Execution:**
- [x] `components/TextField.tsx` -- Add an exported `ClearButton`:
  - It is a `size-3` X in a 44px-high tap box, with `tabIndex={-1}` and an aria-label for "Clear {label}".
  - On tap, it sets the value through the native `HTMLInputElement` value setter, dispatches a bubbling `input` event (so a controlled or uncontrolled caller's onChange fires) and refocuses the input.
  - In `TextField`, wrap the input as `relative` with the input as `peer` and right padding for the X. Render it unless `type === 'password'`.
  -- Covers every TextField at once.
- [x] `(sections)/SearchField.tsx` -- Use the same wrapper and `ClearButton`. -- Search is the most-cleared field.
- [x] `styles.css` -- Hide the native search cancel button. -- One X, not two.
- [x] `(sections)/BackToTop.tsx` (new, client) -- A square outlined button (`border-2 border-text`, tap-sized, ↑ arrow in a 2px stroke):
  - It is hidden until `scrollY > 2 × innerHeight` and hides again below `1 × innerHeight`, using a passive scroll listener.
  - It calls `window.scrollTo({ top: 0, behavior })`, with `behavior` set to `'auto'` under `prefers-reduced-motion`.
  - Its aria-label comes from i18n.
  -- Return from deep in a long list.
- [x] `(sections)/layout.tsx` -- Make the pinned bar `flex gap-3`, with Scan book `flex-1` and `<BackToTop />` after it. -- Option A placement.
- [x] `scan/ScanScreen.tsx` -- Put the field and a `type="submit"` "find" button in a `flex items-end gap-2` row. Keep `enterKeyHint`. The button reuses `buttonClass('secondary')` with smaller padding (`px-3 py-1`) and a drawn height under 44px. A pseudo-element brings its tap area back to 44px. -- The number pad has no Return.
- [x] `(sections)/actions.ts` -- `setReadAction` returns `{ read, count }` through `withTransaction` with no receipt. Update its doc comment. -- No Undo for the single switch.
- [x] `(sections)/ReadAndRating.tsx` -- On success, call only `afterAction`. Drop the toast and the now-unused `show`. -- Option 4A.
- [x] `messages/en.json`, `messages/fi.json` -- Add the find label (en "find", fi "hae"), the back-to-top label (en "Back to top", fi "Takaisin ylös") and the clear aria-label with a `{label}` placeholder.
- [x] `tests/unit/readAndRating.unit.spec.ts` -- Change the first test to: saves, shows no toast, reports through `afterAction`, and a toast Undo still refreshes.
- [x] `_bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/prd.md` -- In FR-15, change "marking read" to "marking a selection read". Add that Book detail's read switch saves in place without Undo.
- [x] `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md` -- Update four rows:
  - Text field row (:105): add the clear X.
  - Read toast row (:136): make it a selection only.
  - Scrolling (:158): add back-to-top on the phone.
  - ISBN field (:213): submitted with "find" or the Go key.
- [x] `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md` -- Text field row (:392): add the clear X. Add rows for the back-to-top square and the compact "find" button. Note the decision date and source.

**Acceptance Criteria:**
- Given any single-line TextField or the search field with text, when the user taps the X, then the field is empty and focused and its component state is "".
- Given the phone collection, loans or a wishlist scrolled past two screens, when the user taps ↑, then the page is at the top and the ↑ is gone.
- Given the scan screen on iOS with the number pad, when the user types an ISBN and taps "find", then the lookup runs exactly as with Go.
- Given Book detail, when the user flips read, then no toast appears and no Undo receipt is recorded. Bulk mark read in the SelectBar still shows "Marked {n} read · Undo".
- Given this story's commit, then FR-15, EXPERIENCE.md and DESIGN.md describe the new behaviour.

## Implementation Notes

- The clear X renders on an allowlist of input types (text, search, email, tel, url, or none given), not just "unless password": a `date` input (LendPicker) has no `:placeholder-shown`, so the X would always show and could blank the Lend date. DESIGN.md treats the Date field as its own component.
- `setReadAction` calls `setRead(ctx, …)` directly and returns its `data`: `setRead` already opens its own transaction through `withTransaction` (AD-16), so wrapping it again would only nest a join.
- The find label is written "Find" / "Hae" in the messages; `ui-case` lowercases it on screen (DESIGN.md, Do's and Don'ts: no lowercase strings in source).
- The find button goes in a new `action` slot on `TextField`, laid out beside the input inside the field, so it stays level with the underline while an error message shows beneath.
- `setRead.ts` doc comment updated (only callers in select mode wrap it in `withUndo()` now); no code change there.
- One focused unit test, `tests/unit/textField.unit.spec.ts`, guards the clear X on a controlled field (native setter → onChange "", focus kept). Matrix rows for the empty-field X, back-to-top and find are CSS or a mocked call sequence and are left to the manual checks (CLAUDE.md, Tests).

## Spec Change Log

## Review Triage Log

| # | Layer | Finding | Verdict | Evidence | Route |
|---|-------|---------|---------|----------|-------|
| 1 | verification-gap | No int test that `setReadAction` records no receipt | low | Real gap, but a reintroduced receipt is invisible to the user (the client never shows it); the fix is a new int test file, more than a direct correction | rejected |
| 2 | verification-gap | SearchField's X not tested end to end | low | The shared mechanism is covered by `textField.unit.spec.ts`; breaking the sibling contract in SearchField is unlikely in everyday edits | rejected |
| 3 | blind, edge, verification-gap | `findClass` string-replaces `buttonClass` substrings; silent no-op on change | medium | `.replace` returns the input unchanged on a miss; the 44px tap area would vanish with no error | patch |
| 4 | blind | find's 44px pseudo-element spills below the row into the error message | low | Centred 44px on a ~28px button aligned to the underline reaches ~8px below; the error can hold a Link | patch |
| 5 | blind | `action` slot has one caller; Picker builds the same row by hand | low | Duplication only, no user harm; refactoring Picker is outside the story | rejected |
| 6 | blind | Clear X is ~28px wide, not a 44px tap area | low | `px-2` + `size-3`; only the height is 44px; direct class change | patch |
| 7 | blind, edge | `onPointerDown` preventDefault does not stop blur; blur-saving fields save the old value first | medium | Chromium/WebKit move focus on `mousedown`; `DisplayNameField:62`, `ManagedList:166`, `CopyLine:69` save on blur | patch |
| 8 | blind | aria-label "Clear {label}" reads "Clear Or type an ISBN" | low | `scan.isbn` is "Or type an ISBN"; message change only | patch |
| 9 | blind | Focus falls to body after back-to-top unmounts | low | Phone-only control used by touch; fix needs a focus target and more code | rejected |
| 10 | blind | Back-to-top shows in every section, docs say Collection only | low | Mounted in `(sections)/layout.tsx`; EXPERIENCE row sits under Collection | patch |
| 11 | blind | EXPERIENCE.md :195 and :427 still imply read Undo | low | Trace line reads "Undo also after move, tag, read, …" | patch |
| 12 | blind | `setRead` still builds an unused restore; spine silent | low | Restore discarded in `setReadAction`; a spine note stops `withUndo` being re-added | patch |
| 13 | blind | ReadAndRating test name claims a toast | low | The name says "a toast Undo" though the component no longer toasts | patch |
| 14 | edge | BackToTop ignores resize/rotation | low | Threshold uses `innerHeight`, re-evaluated only on scroll; one more listener | patch |
| 15 | edge | X excluded from date/number fields, against the "unless password" spec wording | false | Deliberate and logged in Implementation Notes: a date input has no `:placeholder-shown`, so the X would always show; the AC says single-line text fields | rejected |
| 16 | verification-gap | find button path untested | low | Spec assigns it to manual checks; it is a plain submit button | rejected |

## Design Notes

React ignores a plain `input.value = ''` for controlled inputs. Clearing has to go through the prototype setter so `onChange` fires:

```ts
const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
set.call(input, '')
input.dispatchEvent(new Event('input', { bubbles: true }))
input.focus()
```

This keeps the X ignorant of whether its field is controlled.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean
- `npm run lint` -- expected: clean
- `npm run test:unit` and `npm run test:int` -- expected: pass

**Manual checks:**
- On a phone-width viewport:
  - The X appears and clears in Search, Edit book and the ISBN field.
  - ↑ appears after two screens on the collection and sits beside Scan book.
  - "find" submits the ISBN.
  - The read switch shows no toast.
