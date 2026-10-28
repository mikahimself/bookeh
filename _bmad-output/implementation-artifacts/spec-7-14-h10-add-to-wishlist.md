---
title: '7.14 [H10] Add to wishlist'
type: 'feature'
created: '2026-10-28'
baseline_revision: '05c75987a327498015f975c95011be72b824e0a9'
status: 'in-progress'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `saveEntry()` (7.6) exists, but nothing on screen calls it. Mika can't keep a Book he doesn't own on a wishlist from the Answer or from Book detail without going to the back office (FR-21, FR-22, UX-DR46).

**Approach:** Add a secondary **Add to wishlist** button to three places: the Not in library Answer, the Not found form (which Couldn't look it up's Add by hand also uses), and Book detail's foot. The button opens the wishlist Picker, which has a row per list and a "New list" field with Add under the rows (mock-up A, recorded in EXPERIENCE.md in `05c7598`). A new `saveEntryAction` runs the save through `saveEntry`. The toast reads "Added to {list} · Undo". From the Answer the save returns to Scan; in Book detail, Book detail stays open.

## Boundaries & Constraints

**Always:**
- **Picker behaviour (EXPERIENCE.md, Answer → Add to wishlist):**
  - The picker opens on every press.
  - With exactly one list it is skipped, and the press saves straight to that list's id.
  - With no lists, only the "New list" field shows, focused on open.
  - The Picker is titled `wishlists.addToWishlist`, with the Book's title in `text-meta text-text-muted` under it.
  - Each row is the list's name with its open count in muted meta at the row's end.
  - A row saves to `id`. Add saves to `{ create: name }`, as typed. The server matches the name to an existing list or creates one (`resolveWishlist`). The client never matches names.
  - The field's `maxLength` is `limits.name` (`@/fields/limits`).
- **`saveEntryAction(input: unknown): Promise<ActionResult<Undoable<EntrySaveResult>>>`** in `scan/actions.ts`, next to `saveCopyAction`, with a doc comment in the same style.
  - Input is `{ requestId: string, wishlist, target }`.
    - `wishlist` must pass `parseRef()` (`../ref`).
    - `target` is one of `{ isbn13: string, pick?, candidate? }` (checked as `isSaveInput` does), `{ manual: { title: string, author: string, isbn13?: string } }` or `{ bookId }` (`isRowId`).
    - Anything else is `VALIDATION` before `saveEntry` runs.
  - It calls `saveEntry(ctx, { requestId, target, save: { kind: 'entry', wishlist } })`. A manual target becomes `{ manual: { isbn, title, authors: [author] } }`, as in `saveManualAction`.
  - Results:
    - Success and `UNAUTHENTICATED` pass through unchanged.
    - `NOT_FOUND` and `RATE_LIMITED` pass through unchanged.
    - A `VALIDATION` whose fields name `title` or `authors` comes back with only those fields.
    - Everything else becomes `SAVE_FAILED`, and anything other than `INTERNAL` is logged as a warning, as the two existing actions do.
  - Shared checks may be factored out of the existing two actions. Their behaviour stays as it is.
- **Press semantics** are the ones `useAddToLibrary()` already has: one `requestId` per series of presses, kept for every retry after a failure and dropped after a success; one call per double tap; `pending` drives the ProgressLine.
  - Factor its core into a generic `useSavePress<T>()` in the same file. `useAddToLibrary()` keeps its signature and behaviour, and its suite passes unchanged.
  - **Answer:** the toast is `{ kind: 'success', message: t('toast.addedTo', { list: savedTo.name }), hold: true, undo }`, with no `edit`. Then `back()` to Scan, latched until unmount as Add to library is.
  - **Book detail:** the same toast without `hold`. No navigation. The latch is released after a success, so a second Add to wishlist saves again with a new `requestId`.
  - `NOT_FOUND` runs `router.refresh()`, with no toast.
  - Any other failure goes to `onRefused` first, then `useReportFailure()`.
- **`scan/AddToWishlist.tsx`**, a client component.
  - Props:
    - `lists: readonly WishlistLine[]`
    - `title: string` (the picker's muted line)
    - `target: EntryTarget | (() => EntryTarget | null)`. The function form is the Not found form's: it returns `null` when nothing should be saved.
    - `stay?: boolean` (Book detail)
    - `onRefused?: OnRefused`
    - `disabled?: boolean`
  - It renders Button `secondary` `wishlists.addToWishlist` and the Picker.
  - `EntryTarget` is exported from `scan/actions.ts`'s types, or a sibling non-`'use server'` module, since a `'use server'` file exports only async functions.
- **Not in library Answer:** the foot is Add to wishlist, then Add to library (the one primary), then Back. The target is `{ isbn13, pick, candidate }` for the candidate shown.
- **Not found form:** Add to wishlist sits above Add to library.
  - Its target reads the typed title and author, plus the ISBN when there is one.
  - A title or author that is blank after trimming marks that field with the required message and focuses it, as a failed save does, and the picker does not open.
  - The server's `title` / `authors` refusal marks fields as it does for Add to library. Both buttons share the marks.
  - The picker's muted line is the typed title.
- **Lists source:**
  - `scan/page.tsx` reads `listWishlists(ctx)` only for the `notInLibrary`, `notFound` and `unavailable` outcomes. `UnavailableAnswer` passes the lists to `UnavailableActions`, and that passes them to `NotFoundForm`.
  - `BookDetail` reads them itself.
  - A failed read is logged (`logger().error`) and treated as `[]`. The picker then offers the field alone, and a typed name still lands on an existing list.
- **Book detail foot:** Edit and Add to wishlist, both secondary, in one `flex gap-2` row with no primary. The target is `{ bookId }`. The picker's muted line is the Book's title.
- **Picker wrapper changes:**
  - `Picker` gains `description?: ReactNode`. It renders under the heading in the sheet, and as the first part of the body in the dialog.
  - With `create` and no options, the field gets initial focus. `Sheet` and `Dialog` gain `initialFocus?: RefObject<HTMLElement | null>`, forwarded to Base UI's `Drawer.Popup` / `Dialog.Popup` `initialFocus`.
  - Every existing caller is unchanged.
- **i18n** in `messages/en.json` and `fi.json`:
  - `wishlists.addToWishlist`: "Add to wishlist" / "Lisää toivelistalle"
  - `wishlists.add`: "Add" / "Lisää"
  - `toast.addedTo`: "Added to {list}" / "Lisätty · {list}"
  - Reuse `wishlists.newList` for the field label.
- Design tokens only. Overlays stay one deep: the Book detail sheet opens the picker, and nothing goes on top of it.

**Never:**
- No change in `lib/`: `saveEntry`, `listWishlists` and `resolveWishlist` already exist. No migration, collection or spine change.
- No recipient choice at save time, since the recipient is set later on the entry. Add to wishlist goes nowhere else: not on the In library Answer (Epic 8) and not on Lookup results.
- No "On wishlists" group or refresh of Book detail after the save. 7.15 owns that group.
- No client-side REST and no Playwright test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No lists, Answer | `lists: []`, type "Joululahjat", Add | Picker has only the field, focused; `saveEntryAction({ requestId, target: { isbn13 }, wishlist: { create: 'Joululahjat' } })`; held toast "Added to Joululahjat" with Undo; `back()` | — |
| One list | `lists: [{ id: 4, … }]` | no picker; saves with `wishlist: 4` at once | — |
| Several lists | two rows with counts | a row tap saves with its id | — |
| Typed name of an existing list | "joululahjat" with list 4 named "Joululahjat" | sent as `{ create }`; the server saves to list 4; toast names it as stored | — |
| Book detail | `{ bookId: 9 }`, `stay` | toast without `hold`; no `back()`; a second press sends a new `requestId` | — |
| Not found, filled | title "Sinuhe", author "Waltari" | target `{ manual: { title, author, isbn13? } }` | `title`/`authors` refusal marks fields |
| Not found, blank title | title "  " | Title marked required and focused; picker stays shut; nothing sent | — |
| Gone meanwhile | action answers `NOT_FOUND` | `router.refresh()`, no toast, no return | — |
| Other failure | `SAVE_FAILED` / rejected call | reported; stays; retry reuses the `requestId` | `useReportFailure` |
| Bad input | missing `requestId`, `wishlist` `{ create: 1 }`, `target` `{ bookId: 0 }` or `{}` | `VALIDATION`; `saveEntry` not called | — |
| List read fails | `listWishlists` throws | logged; picker shows the field alone | — |
| Undo | toast Undo | the entry goes on the save's rule; a list made by `{ create }` stays | `saveEntry.int.spec.ts` (7.6) |

</intent-contract>

## Code Map

- `src/lib/catalogue/saveCopy.ts:31-45,139-166` -- read-only:
  - `SaveTarget` and `EntrySaveInput`.
  - `saveEntry(ctx, input): Promise<Undoable<EntrySaveResult>>` already wraps `withUndo` and remembers `requestId` per kind.
  - `EntrySaveResult` is `{ bookId, entryId, savedTo: Named }`.
- `src/lib/wishlists/wishlists.ts:74-93,95-110` -- read-only:
  - `resolveWishlist` matches `{ create }` by `nameKey`, else creates. A bad id, a blank name or a long name is `VALIDATION` on `wishlist`.
  - `listWishlists(ctx): Promise<WishlistLine[]>` gives `{ id, name, count }` by name.
- `src/app/(frontend)/scan/actions.ts` -- `saveCopyAction` / `saveManualAction`: input guards (`isSaveInput`, `isManualInput`), error mapping and warning log to mirror. Add `saveEntryAction` here.
- `src/app/(frontend)/ref.ts` -- `parseRef()` for `wishlist`.
- `src/app/(frontend)/scan/useAddToLibrary.ts` -- latch, `requestId`, `mounted`, `useTaskBack('/scan')`, the toast. Factor out `useSavePress<T>`.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- `NOT_FOUND` → `router.refresh()` in a transition. Pattern for `AddToWishlist`.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx` -- server component. Add the lists prop and the button before `AddToLibrary`.
- `src/app/(frontend)/scan/NotFoundAnswer.tsx`, `NotFoundForm.tsx` -- client form with `marks`, `titleField` and `authorField` refs, and the `onRefused` field marking. Add the lists prop and the button.
- `src/app/(frontend)/scan/UnavailableAnswer.tsx`, `UnavailableActions.tsx` -- Add by hand renders `NotFoundForm`. Thread `lists` through.
- `src/app/(frontend)/scan/page.tsx` -- `requireUser()` ctx. Read the lists for the three outcomes.
- `src/app/(frontend)/(sections)/BookDetail.tsx:59-75,196-206` -- has `ctx`. The foot `div.flex.gap-2` holds the Edit `Link`. Add `AddToWishlist` (`stay`, `{ bookId }`, `title={book.title}`).
- `src/app/(frontend)/components/ui/Picker.tsx` -- `create` field (`TextField`, secondary submit), `onChoose` / `onCreate` run after the close. Add `description` and initial focus.
- `src/app/(frontend)/components/ui/Sheet.tsx:90`, `Dialog.tsx:48` -- the `Popup` elements that get `initialFocus`.
- `src/app/(frontend)/(sections)/MovePicker.tsx` -- golden example of a `Picker` with `create` and `Ref`.
- `src/app/(frontend)/components/TextField.tsx` -- forwards `ref`, as `NotFoundForm` uses it.
- `messages/en.json`, `messages/fi.json` -- the `wishlists` namespace (`newList` exists) and the `toast` namespace (`savedTo` style: fi "Tallennettu · {location}").
- `tests/unit/addToLibrary.unit.spec.ts` -- mocks to copy (`next-intl`, `next/navigation`, `navigation.useTaskBack`, `scan/actions`, `ToastProvider`). Must pass unchanged.
- `tests/unit/notFoundForm.unit.spec.ts`, `unavailableActions.unit.spec.ts`, `picker.unit.spec.ts` -- existing suites that must keep passing. Their mocks of `scan/actions` need `saveEntryAction`.
- `tests/int/saveEntry.int.spec.ts` -- read-only: 7.6 covers the transaction, the `{ create }` list and the Undo rule.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/scan/actions.ts` -- `saveEntryAction`, with a non-`'use server'` `EntryTarget` type next to it if needed.
- `src/app/(frontend)/scan/useAddToLibrary.ts` -- `useSavePress<T>` core. `useAddToLibrary` stays on top of it.
- `src/app/(frontend)/scan/AddToWishlist.tsx` -- new.
- `src/app/(frontend)/components/ui/Picker.tsx`, `Sheet.tsx`, `Dialog.tsx` -- `description` and `initialFocus`.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx`, `NotFoundAnswer.tsx`, `NotFoundForm.tsx`, `UnavailableAnswer.tsx`, `UnavailableActions.tsx`, `page.tsx` -- `lists` and the button. Update the doc comments: the foot now holds Add to wishlist.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- read the lists; the foot. Doc comment.
- `messages/en.json`, `messages/fi.json` -- new keys.
- `tests/unit/addToWishlist.unit.spec.ts` -- new, one case per matrix row on the client:
  - no lists: only the field, focused, then `{ create }`, the held toast and `back()`;
  - one list: no picker;
  - several: a row saves with its id;
  - `stay`: no `hold`, no `back()`, and a new `requestId` on the second press;
  - `NOT_FOUND`: refresh, no toast;
  - other failure: reported, and the retry reuses the `requestId`.
- `tests/unit/notFoundForm.unit.spec.ts` -- the filled form sends the manual target. A blank title marks Title and opens no picker.
- `tests/unit/scanActions.unit.spec.ts` (new, or extend an existing actions suite if one covers `scan/actions`) -- `saveEntryAction`:
  - `VALIDATION` for each bad input row, with `saveEntry` not called;
  - each target kind reaches `saveEntry` in the right shape;
  - `NOT_FOUND` passes, the `title` field passes, `INTERNAL` → `SAVE_FAILED`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-14-h10-add-to-wishlist: done` when done.

**Acceptance Criteria:**
- Given the story starts, when work begins, then Mika's pick of mock-up A is recorded in EXPERIENCE.md (Answer → Add to wishlist, `05c7598`) before the screen is built.
- Given the Not in library or Not found Answer (also reached through Couldn't look it up → Add by hand), or Book detail's foot, when it renders, then Add to wishlist is a secondary button. On the Answer it sits above Add to library, and in Book detail beside Edit with no primary.
- Given I tap Add to wishlist, when I have several lists, then the picker opens with a row per list and the "New list" field. With exactly one list it is skipped. With none, it offers only "New list", focused.
- Given I choose a list or add a new one, when the save succeeds, then it went through `saveEntry` (the Not found Answer with the typed title and author) and the toast reads "Added to {list} · Undo". From the Answer it returns to Scan, and Book detail stays open.
- Given that toast, when I tap Undo, then the entry is removed on the save's rule, and a list made on the way stays.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why a function target for Not found.** The Answer and Book detail know their target when they render. The Not found form knows it only at press time. `target: EntryTarget | (() => EntryTarget | null)` keeps one component, and the form's blank check stays where its marks live.

**No field errors in the picker.** The picker closes on the choice, before the save, as Move's does. A blank name never reaches the server, because Add is disabled. A long name is held back by `maxLength`. A name taken by an existing list is not an error: it saves to that list. So nothing is left to show under the field. A list deleted in another tab yields `VALIDATION` → `SAVE_FAILED`, reported, and the next render drops it.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including the new and existing Answer, picker and form suites.
- `npm run test:reset && npm run test:int` -- expected: all pass.

**Manual checks:**
- With no lists, scan a Book not in the library and tap Add to wishlist. The field is focused, and Add returns to Scan with "Added to {list}". With one list, nothing opens. Then from Book detail, the toast shows and Book detail stays open.
