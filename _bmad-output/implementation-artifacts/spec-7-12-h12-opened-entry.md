---
title: '7.12 [H12] Opened entry'
type: 'feature'
created: '2026-10-28'
baseline_revision: '6892af2d53961f8dbe16ce7f4ebb6ba3de5902d0'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** On `/wishlists/[listId]` the entry rows are not tappable, and nothing handles `?entry=`. The user cannot open an entry or set who it is for, so a wish can't become a gift idea (FR-38, UX-DR49).

**Approach:** Rows become links to `?entry=<entryId>` on their own list. The page resolves the id against the list's open entries (`getWishlist`, already read) and renders the entry in Book detail's frame: the bottom sheet on the phone, the panel beside the list from 900px. The frame holds the Book's header, extracted from `BookDetail` and shared with it, then "On {list}", then a "For" combobox of the viewer's People. The combobox saves at once through a new `setEntryRecipientAction` over the existing `setEntryRecipient()`. An unknown, closed or foreign id toasts "Not on this list" and replaces to the list.

## Boundaries & Constraints

**Always:**
- **Header extraction.** New async server component `src/app/(frontend)/(sections)/BookHeader.tsx`, `BookHeader({ book: EffectiveBook, children?: ReactNode })`. It holds what `BookDetail.tsx` renders today in its header `div`: cover `w-cover-detail`, `h2` title, author Filter chips joined by ", ", the series chip with its number, and the muted edition line (publisher · year · pages · language). `children` are rendered after the edition line, inside the text column. Move `joined()` and the edition logic with it. `BookDetail` renders `<BookHeader book={book} />` in its place. Book detail's output is unchanged; the genres group keeps using `joined`, so export it from `BookHeader.tsx`.
- **Frame key.** `BookDetailFrame`'s `bookId` prop becomes `openId` ("the open Book's or entry's id: a new one swaps the content in place and scrolls it to the top"). The panel uses it as it used `bookId`. `BookDetail` passes `openId={bookId}`. No other frame change.
- **Server action** `setEntryRecipientAction(entry: unknown, person: unknown): Promise<ActionResult<number | null>>` in `src/app/(frontend)/actions/wishlists.ts`. `entry` must pass `isRowId`. `person` must be `null` or a `Ref` that passes `parseRef` (`../ref`). Anything else fails with `VALIDATION` and nothing is written. It returns `setEntryRecipient(ctx, entry, person)`: the recipient's Person id, or `null`. No Undo, no toast. Update the file's header comment.
- **Page** `wishlists/[listId]/page.tsx` gains `searchParams: Promise<Record<string, string | string[] | undefined>>`:
  - `entry` is the raw param. With no `entry`, the page renders as today, plus the row links.
  - The open entry is the row in the loaded rows (open, viewer's, Book readable) whose `entryId` equals `Number(entry)`, but only when `entry` is a string of digits. The match is by entry id, never by Book.
  - `entry` present but matching no row (not digits, closed, removed, on another list, another user's, Book unreadable): render the list without a detail and mount `NotOnList` with `back = /wishlists/{id}`.
  - Load failed: render as today; `entry` is ignored.
  - With an open entry, read the People with `personUse(ctx)` (`lib/people`, sorted by name), mapped to `Named`. A failed read is logged and gives `[]`.
  - Layout as Loans: the existing content goes in `<section tabIndex={-1} className="min-w-0 flex-1">`, inside `wide:flex wide:flex-1 wide:gap-6`, and the detail follows the section.
- **Row link.** `EntryRow` gains `href`, `replace` and `open`, like `LoanRow`. The `li` gets `selection-bar` when open. A `next/link` `Link` wraps the cover, the text and the For line, with `replace` (true while an entry is open), `scroll={false}`, `prefetch={false}` and `aria-current="true"` when open. The page passes `href = /wishlists/{id}?entry={entryId}`. Update its doc comment ("Not a link yet" goes).
- **Entry layer** `wishlists/[listId]/EntryDetail.tsx`, a server component with props `listId`, `listName`, `entry: ListEntry`, `book: EffectiveBook` and `people: Named[]`. It renders `BookDetailFrame` (label = book title, back = `/wishlists/{listId}`, openId = entryId) around a `flex flex-col gap-6`. Inside: `BookHeader` whose child is the muted `meta` line `wishlists.onList` ("On {list}", the name as typed, no `ui-case`), then `EntryFor`. Not Book detail: no read switch, copies, genres or foot.
- **`wishlists/[listId]/EntryFor.tsx`**, a client component with props `entryId`, `people: Named[]` and `initial: number | null`. It is the `Combobox` (`components/ui/Combobox`, `create` on) labelled `wishlists.for`, with `options` = the People and `value` = local state starting at `initial`.
  - A change sets the value at once and calls `settleAction(setEntryRecipientAction(entryId, next))` in a transition. The combobox is `disabled` while it runs.
  - `ok`: set the value to the returned id (a created Person now has one), then `router.refresh()` so the row's "For" line and the options follow.
  - Failure: restore the previous value.
    - `fields.person`: an error under the field (`errors.TOO_LONG` for `TOO_LONG`, else `errors.VALIDATION`).
    - `NOT_FOUND`: `router.refresh()`. The page then finds no entry and `NotOnList` toasts and replaces.
    - Anything else: `useReportFailure()`.
  - A later change clears the field error.
- **`wishlists/[listId]/NotOnList.tsx`**, a client component modelled on `NotInLibrary`. It shows the success-kind toast `wishlists.notOnList`, does `router.replace(back, { scroll: false })` and renders nothing.
- **Filter chips.** The header's chips are the existing `FilterChip`. Off `/`, it already opens the collection with only that filter. In the phone sheet, `useSheetChip` closes the sheet and pushes `/`. Nothing in `FilterChip` changes.
- **i18n**, under `wishlists` in `messages/en.json` and `fi.json`:
  - `onList`: "On {list}" / "Listalla {list}"
  - `for`: "For" / "Kenelle"
  - `notOnList`: "Not on this list" / "Ei tällä listalla"
- Design tokens only. The accessibility floor: the sheet is modal and holds focus; the panel is not modal; the combobox has its label; the row link is a real link with `aria-current`.

**Never:**
- No Bought, Ordered or Remove buttons (7.13).
- No new service, reader or writer in `lib/`. No migration and no collection change. No spine change: the spine already has `?entry=` and `setEntryRecipient`.
- No Undo or toast on a recipient change.
- No client-side REST.
- No change to `FilterChip`, `BookDetailSheet`, `Sheet` or `useTaskBack`.
- No Playwright test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open entry | `/wishlists/7?entry=12`, 12 open on list 7 | detail: Book header, "On Christmas list", For = its recipient or empty; row 12 `aria-current` | — |
| Same Book twice | entries 12 (for Äiti) and 13 (none), one Book | `?entry=13` shows For empty; `?entry=12` shows Äiti | — |
| Not on this list | `?entry=99` (closed, removed, another list's, another user's) or `?entry=abc` | list without detail; toast "Not on this list"; replace to `/wishlists/7` | — |
| Set / change | choose Leena, or type a new name and choose "New: …" | action `(12, id)` or `(12, { create })`; value becomes the id; refresh | field error on `fields.person`; other codes reported |
| Clear | Clear | action `(12, null)`; refresh; row loses "For" | — |
| Entry gone meanwhile | action answers `NOT_FOUND` | value restored; refresh → "Not on this list" | — |
| Bad input | `entry` 0 / 1.5 / "x"; `person` `{ create: 1 }`, `{ id: 1 }` | `VALIDATION`, no write | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx` -- the page from 7.11: `load()` already gives `rows` (open, viewer's, Book readable). Add `searchParams`, the entry match, the Loans-style wide layout and `EntryDetail`/`NotOnList`.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryRow.tsx` -- becomes a link; copy `loans/LoanRow.tsx` (Link props, `selection-bar`, `aria-current`).
- `src/app/(frontend)/(sections)/loans/page.tsx:84-90,113-178` -- golden pattern: `searchParams`, `wide:flex` with a `section` and the detail beside it, `replace={book !== null}`.
- `src/app/(frontend)/(sections)/BookDetail.tsx:97-133,240-247` -- header block and `joined()` to extract. The edition is built at 87-95.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx` -- `FrameProps.bookId` → `openId`, used for `shown` and the scroll reset. Its leave focuses `a[aria-current="true"]`, which the row link provides.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx` -- read-only: `addressed` sheet, closes by history back to `back`; `useSheetChip` for chips.
- `src/app/(frontend)/(sections)/FilterChip.tsx` -- read-only: off `/` it starts from the empty query (5.21), which covers the chip AC.
- `src/app/(frontend)/(sections)/NotInLibrary.tsx` -- model for `NotOnList`.
- `src/app/(frontend)/components/ui/Combobox.tsx` -- `value: Ref | null`, `onValueChange`, `error`, `disabled`, `create`.
- `src/app/(frontend)/(sections)/LendPicker.tsx:128-140` -- `fields.person` → message mapping to mirror.
- `src/app/(frontend)/components/request.ts` -- `settleAction`, `useReportFailure`.
- `src/app/(frontend)/ref.ts` -- `parseRef`.
- `src/app/(frontend)/actions/wishlists.ts`, `actions/loans.ts` -- action pattern (`runAction`, `requireUserOrThrow`, `isRowId`).
- `src/lib/wishlists/entries.ts:220-256` -- `setEntryRecipient(ctx, entryId, Ref | null): Promise<number | null>`. `NOT_FOUND` for a closed or foreign entry; `VALIDATION` with `fields.person` from `resolvePerson`.
- `src/lib/people/people.ts:265` -- `personUse(ctx)`: every Person of the viewer by name.
- `tests/unit/wishlistPage.unit.spec.ts` -- extend: mock `@/lib/people/people` (`personUse`), `setEntryRecipientAction`, `usePathname`/`useSearchParams` for `FilterChip`, and `useWide` if needed (see `loansPage.unit.spec.ts:47-120` for Book detail mocks). Call the page with `searchParams`.
- `messages/en.json:331-339`, `messages/fi.json` -- `wishlists` namespace.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/BookHeader.tsx` -- new: `BookHeader`, `joined`, with a doc comment (EXPERIENCE.md Book detail header; shared with the opened entry).
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- use `BookHeader` and the imported `joined`; pass `openId`; trim its doc comment where the header moved.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx` -- rename `bookId` to `openId` and update the doc comments.
- `src/app/(frontend)/actions/wishlists.ts` -- `setEntryRecipientAction`.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryRow.tsx` -- the row as a link.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryDetail.tsx` -- new.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryFor.tsx` -- new.
- `src/app/(frontend)/(sections)/wishlists/[listId]/NotOnList.tsx` -- new.
- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx` -- `?entry=`, layout, People read; doc comment names EXPERIENCE.md Wishlists → Entry opened and States → Entry gone.
- `messages/en.json`, `messages/fi.json` -- new keys.
- `tests/unit/wishlistPage.unit.spec.ts` -- new cases: (a) `?entry=` of the second of two entries of one Book opens that entry: dialog or panel named by the title, "On Christmas list", For empty, and its row `aria-current`; (b) a closed or foreign id and `?entry=abc` render no detail, toast "Not on this list" and replace to `/wishlists/7`; (c) choosing a Person in For calls `setEntryRecipientAction(entryId, personId)` and refreshes, and Clear sends `null`; (d) the author chip in the opened entry links to the collection with only that author filter.
- `tests/unit/wishlistActions.unit.spec.ts` -- new (or the existing actions spec if one covers `actions/wishlists.ts`): `setEntryRecipientAction` answers `VALIDATION` and never calls `setEntryRecipient` for `entry` 0, 1.5 or "x" and for `person` `{ create: 1 }` or `{ id: 1 }`; a valid call passes `(ctx, entry, person)` through (matrix row Bad input).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-12-h12-opened-entry: done` when done.

**Acceptance Criteria:**
- Given a wishlist with open entries, when I tap an entry, then the address gets `?entry=<entryId>` (pushed), and the entry opens as a bottom sheet on the phone or a panel beside the list from 900px. It shows the Book's header (cover, title, authors, series, edition), "On {list}" and a "For" combobox showing its recipient or empty.
- Given an opened entry, when I choose a Person, create one by typing a new name, or Clear, then the recipient is saved at once through `setEntryRecipient()`, and the row's "For {person}" follows after the refresh.
- Given one Book twice on a list, when I open either entry, then the opened layer and its For value are that entry's.
- Given `?entry=` naming an entry that is closed, removed, on another list or not mine, when the list opens, then it shows the list without an opened entry and the toast "Not on this list", and the address is the list's.
- Given an opened entry, when I tap an author or series chip, then the collection opens with only that filter.
- Given the opened entry, when I close it (X, Esc on wide, scrim or drag on the phone, Back), then I am on the list, and on wide screens focus returns to the entry's row.
- Given Book detail on `/` or `/loans`, when it opens, then it looks and behaves as before (the header extraction and `openId` rename change nothing), and the existing suites pass.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 14, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: after "New: {name}" the For field goes blank until the refresh lands (a numeric value not yet in `people` has no label) — `EntryFor` no longer swaps in the returned id; it keeps the chosen value and adopts the refreshed `initial`.
  - `[low]` `[patch]` Blind: a failed `personUse()` makes an entry with a recipient show For empty — the `.catch` now falls back to the opened entry's own recipient.
  - `[low]` `[patch]` Blind: `disabled={pending}` blurs the focused combobox input after every choice, so keyboard users lose their place — `disabled` removed (Next runs server actions one at a time).
  - `[low]` `[reject]` Blind: on `NOT_FOUND` the panel unmounts without its leave path, so focus falls to the body — needs the entry removed from another tab while it is open; the fix adds focus handling to `NotOnList` for a rare path.
  - `[low]` `[reject]` Blind: `NotOnList` can toast twice under StrictMode — dev-only double effect, the same as `NotInLibrary`'s; a once-guard adds state for no production case.
  - `[false]` `[reject]` Blind: `EntryDetail` rebuilds the list address, two sources for the close target — both are `/wishlists/${id}` from the same `id`, so they cannot diverge.
  - `[low]` `[reject]` Blind: the test helper `serverTree` detects server components by `AsyncFunction` — Vitest's transform keeps native async functions; switching to thenable detection is a rewrite for a hypothetical toolchain change.
  - `[low]` `[reject]` Blind: no tests for the create path end to end, the NOT_FOUND re-render, or the wide panel — the create path is covered piecewise (`combobox.unit.spec.ts` sends `{ create }`, the action test passes it through, `entryRecipient.int.spec.ts` creates the Person); the NOT_FOUND branch's refresh is tested and the re-render is the tested `?entry=99` path; the panel is the shared frame tested in `collectionPage.unit.spec.ts` (CLAUDE.md, Tests).
  - `[low]` `[patch]` Edge: For shows blank after a created Person until the refresh — duplicate of the first Blind row.
  - `[low]` `[patch]` Edge: a failed People read hides the current recipient — duplicate of the second Blind row.
  - `[low]` `[patch]` Edge: For keeps a stale value when the refresh brings a recipient changed elsewhere — fixed by adopting a new `initial` (same patch as the first row).
  - `[low]` `[reject]` Edge: `?entry=013` opens entry 13 at a non-canonical address — nobody types leading zeros, and opening the entry is the right outcome.
  - `[low]` `[reject]` Verification gap: no test for an unexpected failure code on For (restore and report) — the filed disposition is defer, but the behaviour is this story's; no acceptance criterion or spine rule names it, so CLAUDE.md's Tests rule rejects a test-only finding.
  - `[false]` `[reject]` Intent: AC4 could mean opening full Book detail from the entry — Story 5.21 ("or in an opened wishlist entry") and EXPERIENCE.md ("It is the entry, not Book detail") settle it on the entry's own header chips, which the diff implements.
  - `[low]` `[reject]` Intent: the wide panel is never rendered by the new tests — the panel is `BookDetailFrame`, unchanged apart from the prop rename and tested at width in `collectionPage.unit.spec.ts`; test-only finding.
  - `[false]` `[reject]` Intent: the owner-scoped write is not exercised — `setEntryRecipient` is unchanged and `tests/int/entryRecipient.int.spec.ts` (7.9) covers closed, foreign and bad ids.
  - `[low]` `[reject]` Intent: closed and foreign entry ids are covered only by equivalence with `?entry=99` — the page has one rule (no matching open row); a second fixture restates the same branch.
  - `[false]` `[reject]` Intent: the chip test checks the href only, not the tap — the tap and sheet landing are `FilterChip`/`useSheetChip` behaviour, unchanged and covered by `filterChip.unit.spec.ts` (5.21).
  - `[false]` `[reject]` Intent: the `BookHeader` extraction changes Book detail with no test in this diff — `collectionPage.unit.spec.ts` asserts the header's title, series chip and edition line at both widths and passes.

## Design Notes

**Resolve against the loaded rows.** `getWishlist` already returns the viewer's open entries of this list. Matching `?entry=` against them covers closed, removed, foreign and other-list ids in one rule, with no extra read. An entry whose Book is unreadable has no row, so it is "Not on this list" as well.

**The entry is not Book detail** (EXPERIENCE.md, Wishlists → Entry opened). It reuses the frame (sheet/panel, close, chip landing) and the header, but none of Book detail's groups. 7.13 adds its buttons under For.

**NOT_FOUND goes through the page.** Refreshing lets the page's one "Not on this list" path toast and leave, so the toast never shows twice.

**People by name.** For picks from all People, so `personUse()` (by name) suits better than `lendingPeople()` (by last loan), and the Combobox narrows as the user types.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including the new wishlist page cases.
- `npm run test:reset && npm run test:int` -- expected: all pass.

**Manual checks:**
- On a list, open an entry on the phone width (sheet) and wide (panel); set, change and clear For; open `?entry=<closed id>`; tap the author chip.

## Auto Run Result

**Summary.** On `/wishlists/[listId]`, each entry row now opens the entry at `?entry=<entryId>` (FR-38, UX-DR49).
- **Layer.** The opened entry uses Book detail's frame: a bottom sheet on the phone, a panel beside the list from 900px, closing back to the list. It shows:
  - the Book's header, shared with Book detail;
  - "On {list}", with the name as typed;
  - a "For" combobox of the viewer's People, by name.
- **For.** Choosing, typing a new name or Clear saves at once through the new `setEntryRecipientAction` over `setEntryRecipient()`. The page then refreshes, so the row's "For" line follows. A failure restores the old value:
  - a bad name shows its message under the field;
  - an entry gone meanwhile refreshes into "Not on this list";
  - anything else is reported.
- **Addressing.** The entry is matched by its own id against the list's open rows, so one Book twice opens each entry as itself. Any `entry` that matches no open row shows the list alone, the toast "Not on this list", and replaces the address with the list's. That covers ids that are not digits, closed, removed, on another list or another user's.
- **Chips.** The header's author and series chips are the existing `FilterChip`. Away from `/`, they open the collection with only that filter (5.21).

**Files changed.**
- `src/app/(frontend)/(sections)/BookHeader.tsx` -- new: Book detail's header and `joined`, shared with the opened entry.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- uses `BookHeader`; passes `openId`.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx` -- frame prop `bookId` renamed to `openId`.
- `src/app/(frontend)/actions/wishlists.ts` -- `setEntryRecipientAction`.
- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx` -- `?entry=` handling, Loans-style wide layout, People read.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryRow.tsx` -- the row is a link with `aria-current` and the selection bar.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryDetail.tsx`, `EntryFor.tsx`, `NotOnList.tsx` -- new: the entry layer, the For combobox, the "Not on this list" notice.
- `messages/en.json`, `messages/fi.json` -- `wishlists.onList`, `for`, `notOnList`.
- `tests/unit/wishlistPage.unit.spec.ts` -- the row links, opening the right entry of one Book twice, Not on this list, For save and Clear, For failures, and the author chip.
- `tests/unit/wishlistActions.unit.spec.ts` -- new: the action's input checks.
- `sprint-status.yaml` -- 7.12 done. `epic-7-context.md` -- regenerated after the 7.11 spine change.

**Review.** One pass, 19 findings (low 14, false 5).
- **Patched (3 low entries):**
  - For keeps the chosen value after a save and adopts the refreshed `initial`. A new Person no longer blanks the field, and a recipient changed elsewhere shows up.
  - `disabled` was removed from the combobox, so a choice no longer blurs the field.
  - A failed People read falls back to the entry's own recipient.
- **Rejected, with reasons in the triage log:**
  - Focus on the NOT_FOUND unmount.
  - The StrictMode double toast.
  - The duplicated address.
  - The `serverTree` detection.
  - The test-only gaps: create end to end, the wide panel, failure codes, closed or foreign ids, the chip tap.
  - `?entry=013`.
  - The AC4 alternative reading.
  - The owner-scoped write.
  - The `BookHeader` coverage.
- Nothing deferred.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 3.

**Verification.** After the patches:
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (56 existing warnings).
- `npm run test:unit`: 996 passed (71 files).
- `npm run test:reset && npm run test:int`: 663 passed (78 files).
- **Matrix audit:**
  - Open entry, Same Book twice, Not on this list (`99`, `abc`), Set/change (choose), Clear and Entry gone meanwhile: the `wishlistPage` cases.
  - The `{ create }` path and Bad input: `wishlistActions.unit.spec.ts`, plus the existing combobox and `entryRecipient` int tests.
- The manual browser checks were not done.

**Residual risks.**
- The wide panel with an entry open, including focus back on the row at close, is covered only through the shared frame's existing tests.
- An entry removed elsewhere while it is open unmounts the layer without its animated close, so focus falls to the page.
- The implementation subagent again committed early (`f6ef59b`), before review. The review patches and the finished spec land in a follow-up commit.
- Built in a cloud session against a local Postgres 16 cluster (ICU fi-FI), not the Docker Compose database. Not built beside other stories, so no shared files.
