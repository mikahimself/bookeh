---
title: '5.18 [E8] Book detail'
type: 'feature'
created: '2026-10-23'
baseline_revision: 'a7c269486ac86ca46b4427a8780d526e8ed1dc62'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The phone check from Book detail's Edit (image/* picker offers the camera, an iPhone camera photo goes through the touch corner crop, a HEIC photo uploads as the cover) is not done.
    evidence: |-
      Story 5.18's last acceptance criterion (Epic 4 retrospective, decision 5) needs a real iPhone, which an unattended run has no access to. Book detail's Edit link now reaches Edit book's cover field, so the check can be run.
    location: >-
      src/app/(frontend)/(sections)/BookDetail.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Tapping a row on `/` does nothing. There is no way to see what a Book is and which copies of it I hold (FR-26, UX-DR43, UX-DR20).

**Approach:** `?book=<bookId>` on `/` renders Book detail: one server component (`BookDetail`) with the header, Your copies and a foot with Edit, inside a bottom sheet. Rows become links that set `book`. Closing is history back. A Book I don't hold toasts "Not in library" and drops `book`.

## Boundaries & Constraints

**Always:**
- `BookDetail` starts with `requireOwnBook` (through the shared `heldBook()`), then reads only `getEffectiveBooks` and `getHoldings`. Later groups (read and rating, notes, filter chips, lends, tags) are added to this component only.
- Header: cover (`w-cover-detail`), title (`text-heading-detail`), authors joined ", ", series and number (`{series} {index}`, the name alone without a number; no line without a series), edition line `publisher · year · {n} pages · language`, parts that exist only. Language shows the stored code until 5.14 names languages.
- Your copies: heading, then one line per copy in `getHoldings` order: location name (none when `null`) and the status ("Owned" / "Ordered").
- Foot: Edit, a secondary button-styled `Link` to `/books/{bookId}/edit` with `transitionTypes={['task-open']}`.
- Opening: the row is a `next/link` to `shelfHref(query, { book })`, `scroll={false}`, `prefetch={false}`; it pushes, and replaces when a Book is already open. Rows of the open Book carry `selection-bar`.
- The sheet's Back is the address's: `Sheet` gets an `addressed` mode that does not push its own history entry; `onClosed` then runs after the close animation. X, Esc, the scrim and dragging down close the sheet, then `useTaskBack(shelfHref(query))` goes back (or replaces with the query when there is no in-app entry). The browser's Back removes `book`, so the page renders without the detail.
- The detail does not depend on the rows: a row that stops matching leaves the list while the detail stays.
- `SearchField`'s `/` shortcut does nothing while a `[role="dialog"]` is open (the modal guard).
- Strings in `en.json` and `fi.json`.

**Never:**
- No read/rating, notes, Move/Remove/Received, filter chips, Add to wishlist, wide side panel (5.19) or language names (5.14).
- No change to `lib/shelf`, `lib/books`, `/data/shelf` or `ShelfRows.tsx`.
- No row data patched; the detail never reads the client rows.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open | `/?book=5`, two copies held (Tampere owned, ordered with no location) | sheet: header, two copy lines "Tampere · Owned" and "Ordered", Edit → `/books/5/edit` | — |
| Row tap | no Book open; another Book open | link `/?book=5` pushes; replaces | — |
| Not held | `/?q=linna&book=99`, no copy of 99 | list shown, toast "Not in library", `router.replace('/?q=linna', { scroll: false })` | `NOT_FOUND` caught |
| Row gone | `/?q=kivi&book=5`, Book 5 does not match `kivi` | list without the row, detail still open | — |
| Close | X with an in-app entry below; loaded directly | `router.back()`; `router.replace('/?…')` without `book` | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/page.tsx` -- reads `{ query, book }` from `parseShelfQuery`; passes `book` to `CollectionList` and renders `<BookDetail ctx bookId={book} query={query} />` when set, independent of the shelf read.
- `src/app/(frontend)/(sections)/BookRow.tsx` -- hook-free; gains `href`, `replace`, `open`. The `li` holds a full-row `Link`; `open` adds `selection-bar`.
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- takes `book: number | null`; builds each row's `href` with `shelfHref(query, { book: row.book.bookId })`, `replace={book !== null}`, `open={row.book.bookId === book}`.
- `src/app/(frontend)/books/[bookId]/edit/page.tsx:18` -- `heldBook()` moves to `src/app/(frontend)/heldBook.ts` and both pages import it.
- `src/app/(frontend)/books/[bookId]/edit/NotHeld.tsx` -- the toast-and-replace pattern the new `NotInLibrary` follows (replace target `shelfHref(query)`, `scroll: false`).
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- the header markup to mirror (cover beside title, author and edition lines).
- `src/app/(frontend)/components/ui/Sheet.tsx` -- `useCloseOnBack(open, …)` pushes a same-URL entry; in `addressed` mode pass `false` instead and call `onClosed` from Drawer's `onOpenChangeComplete(false)`.
- `src/app/(frontend)/components/navigation.ts:212` -- `useTaskBack(fallback)`: history back while `depth > 0` outside a task, else `router.replace(fallback)`; reuse it for the close.
- `src/app/(frontend)/(sections)/SearchField.tsx:69` -- the `/` handler that gets the guard.
- `src/lib/books/holdings.ts` (`CopyLine`), `src/lib/books/effectiveBook.ts` (`EffectiveBook`) -- read-only shapes.
- `messages/en.json`, `messages/fi.json` -- reuse `answer.copy` for status, `answer.pages`, `answer.notInLibrary`, `overlay.*`; add a `detail` namespace (`yourCopies`, `series`, `edit`).
- `tests/unit/collectionPage.unit.spec.ts` -- harness to extend: mock `@/app/(frontend)/heldBook` and `@/lib/books/holdings`; `router` gains `back`/`push`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/heldBook.ts` -- `heldBook(ctx, bookId)` moved from the Edit book page.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- async server component: `heldBook` → `NotInLibrary`, else `getHoldings` and `<BookDetailSheet label={title} query>` around the header, Your copies and foot.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx` -- client: `Sheet addressed`, local `open` state, `onClosed` → `useTaskBack(shelfHref(query))`.
- `src/app/(frontend)/(sections)/NotInLibrary.tsx` -- client: toast, then replace with `shelfHref(query)`.
- `src/app/(frontend)/components/ui/Sheet.tsx` -- `addressed?: boolean` as above; doc comment says why.
- `page.tsx`, `CollectionList.tsx`, `BookRow.tsx`, `SearchField.tsx`, Edit book `page.tsx`, messages -- as in the Code Map.
- `tests/unit/collectionPage.unit.spec.ts` -- one case per matrix row.

**Acceptance Criteria:**
- Given the collection, when I tap a row, then Book detail opens as a bottom sheet over the dimmed list with header, Your copies and Edit, and the row has the selection bar.
- Given Book detail open, when I press Back, tap X or tap the dimmed list, then it closes and the list keeps its rows and scroll position.
- Given a Book I don't hold in `?book=`, when `/` renders, then the list shows without the detail and the toast "Not in library" appears.
- Given Book detail open and the row no longer matching, when the list reloads, then the row is gone and the detail stays until closed.
- Given the phone and Book detail's Edit, when I change the cover, then the `image/*` picker offers the camera, an iPhone camera photo goes through the corner crop by touch, and a HEIC photo uploads as the cover (manual check by Mika; Epic 4 retrospective, decision 5).

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 28 findings — high 0, medium 2, low 15, false 10, maybe-false 1
- findings:
  - `[low]` `[reject]` Verification gap: the `/` shortcut's modal guard has no test — test-only, and neither an AC nor a spine rule names the guard (CLAUDE.md triage rule for test-only findings).
  - `[low]` `[reject]` Verification gap: Book detail beside Load failed has no test — test-only, no AC or spine rule names it.
  - `[low]` `[reject]` Blind: a non-`NOT_FOUND` failure in the detail's reads reaches the route error boundary and takes the list with it — needs a database failure on the detail's reads while the shelf read succeeded; Edit book has the same pattern, and a failure state inside the sheet is UX the docs do not define.
  - `[low]` `[reject]` Blind: every open and close re-runs the page's shelf read, which the client then ignores — inherent to `?book=` being rendered by the section page (spine, routes); the first page is under 1 s at 10,000 copies (5.7), and avoiding it needs a restructure.
  - `[low]` `[reject]` Blind: the detail's three reads are serial with no Suspense — three indexed reads by id; streaming the sheet is a restructure for no measured cost.
  - `[medium]` `[patch]` Blind: after saving on Edit book from Book detail, history back reuses the page from before the save (Next reuses page payloads on back/forward), so the detail shows old values — confirmed in a browser (title stayed "Sapiens"). Fixed: `editBookAction` calls `revalidatePath('/', 'layout')` after a successful save; the browser check now shows "Sapiens edited" in the sheet and the row; `tests/int/editBookAction.int.spec.ts` mocks `next/cache`.
  - `[low]` `[patch]` Blind: the open row's selection bar is visual only, and focus may drop to `<body>` on close — `aria-current` added to the row's `Link`; the focus part is unproven (Base UI returns focus to the element focused before opening, the tapped row link).
  - `[false]` `[reject]` Blind: the `/` guard matches non-modal `role="dialog"` elements — none exist: toasts are the app's own `role="alert"`/`status` (ToastView.tsx), combobox popups are listboxes, and the 5.19 panel is plain layout (epic context); the exit-animation window is a few hundred ms.
  - `[low]` `[reject]` Blind: swapping the Book with the sheet mounted keeps its open state, snap point and scroll — unreachable in 5.18: the modal scrim blocks rows, and a close goes back, so no history entry with `book=5` sits next to one with `book=6`; 5.19 owns the swap.
  - `[false]` `[reject]` Blind: the row-swap test restates a mocked call sequence — it asserts the href and push-versus-replace, which is the AC's "pushes / replaces"; the `next/link` mock only maps Link's documented `replace` prop.
  - `[low]` `[reject]` Blind: `serverTree` detects async components by `constructor.name` — the project targets ES2022 (tsconfig.json:33), which keeps native async functions; a shared util is an abstraction for later.
  - `[false]` `[reject]` Blind: the series number is not localised and could render `1.5` — `seriesIndex` is an integer field (`edit/actions.ts` validates `integer`), so no decimal separator arises.
  - `[low]` `[reject]` Blind: `useTaskBack(fallback, true)` is a boolean trap — cosmetic; one call site.
  - `[low]` `[reject]` Blind: Your copies can render empty when the last copy is removed between `requireOwnBook` and `getHoldings` — a race inside one render; the fix adds a branch.
  - `[low]` `[reject]` Edge: detail read failure reaches the error boundary — same root as the Blind row above.
  - `[maybe-false]` `[reject]` Edge: browser Back during the close animation could run `onClosed` and go back a second time — needs Back within the ~300 ms animation after X; whether Base UI fires `onOpenChangeComplete` after the page unmounts the sheet is unchecked. Settle by pressing Back during the close animation in a browser. If true it is low.
  - `[false]` `[reject]` Edge: `leave()` returns early while `closing` is set, leaving `?book=` open — `closing` is set only by a task's back in flight and clears on `popstate` or after 1 s; no task is mounted on `/`, and `onClosed` runs once per close.
  - `[false]` `[reject]` Edge: an empty title leaves the dialog without a name — `title` is required on books (`src/fields/bookFields.ts:49`).
  - `[low]` `[reject]` Edge: empty Your copies after a race — same root as the Blind row above.
  - `[low]` `[reject]` Edge: StrictMode runs `NotInLibrary`'s effect twice in dev (two toasts) — development only, the same as Edit book's `NotHeld`; a ref guard adds state for no production effect.
  - `[false]` `[reject]` Edge: the `/` guard is too broad — same refutation as the Blind row above.
  - `[low]` `[reject]` Intent: a `?book=` not held stays in the address for one render before the replace — the same pattern as Edit book's `NotHeld`; the user sees the list and the toast either way.
  - `[medium]` `[defer]` Intent: the phone check (camera picker, touch crop, HEIC cover) has no evidence — it needs a real iPhone; deferred to Mika, and sprint status stays `review` until it is done.
  - `[false]` `[reject]` Intent: built despite `oversized` — Mika dismissed the `oversized` trigger in Story 4.15 (Epic 4 retro, P4), as in 5.10–5.12.
  - `[false]` `[reject]` Intent: nothing is committed — the commit happens at finalize.
  - `[low]` `[reject]` Intent: the row-leaves test is a static render, not a change while open — nothing in 5.18's detail changes a Book; the test proves the detail does not depend on the rows, which is the rule.
  - `[false]` `[reject]` Intent: open and close are only exercised on jsdom stubs — the implementer drove X, browser Back, Esc, the scrim, a direct load, Edit and back, and `?book=999999` in a real browser (throwaway Playwright at phone width).
  - `[false]` `[reject]` Intent: closing falls back to `/` with the search kept, not bare `/` — the shelf query lives in `/`'s params (AD-7, URL is the state), so `shelfHref(query)` is `/`.

## Design Notes

The URL is the open state, so the sheet must not push its own same-URL entry: Back would then pop that entry first and leave `?book=` in place. `addressed` keeps `useCloseOnBack` out and turns the close into "animate out, then leave the address". The browser's Back changes the address first and the page drops the detail, with no exit animation; that is accepted.

All rows of the open Book get the selection bar: the address names a Book, not a copy.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npx eslint 'src/app/(frontend)' tests/unit` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including the new cases

**Manual checks (if no CLI):**
- `npm run dev`: tap a row, the sheet opens half; Back, X, scrim and Esc close it; list position holds; `/?book=999999` toasts "Not in library".
- Phone (Mika): the Epic 4 camera, touch crop and HEIC checks from Book detail's Edit.

## Auto Run Result

**Summary:** Tapping a row on `/` opens Book detail: `?book=<bookId>` renders the `BookDetail` server component in a bottom sheet over the dimmed list.
- **Content:** header (cover, title, authors, series and number, edition line with the language code until 5.14), Your copies (location · status per copy), and Edit.
- **History:** a row pushes `?book=`, or replaces while a Book is open, and the open Book's rows get the selection bar and `aria-current`. The sheet is `addressed`: it pushes no history entry of its own. X, Esc, the scrim or a drag down animate it out, then go back, or replace with the query when there is no in-app entry. The browser's Back removes `book` itself.
- **Not held:** a Book not held toasts "Not in library" and drops `book`. The detail does not depend on the rows, so a row that stops matching leaves and the detail stays.
- **`/` shortcut:** does nothing while a dialog is open.
- **Edit book:** a save now purges the client cache, so going back shows the saved values.

**Files changed:**
- `src/app/(frontend)/(sections)/BookDetail.tsx`: new, the server component.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx`: new, client wrapper around `Sheet addressed`. It opens one frame after mount so the sheet slides up, and closes through `useTaskBack`.
- `src/app/(frontend)/(sections)/NotInLibrary.tsx`: new, toast and replace.
- `src/app/(frontend)/heldBook.ts`: new, moved from Edit book's page.
- `src/app/(frontend)/components/ui/Sheet.tsx`: `addressed` mode.
- `src/app/(frontend)/components/navigation.ts`: `useTaskBack(fallback, keepScroll)`.
- `src/app/(frontend)/(sections)/page.tsx`, `CollectionList.tsx`, `BookRow.tsx`: `book` read, row links, selection bar.
- `src/app/(frontend)/(sections)/SearchField.tsx`: the modal guard.
- `src/app/(frontend)/books/[bookId]/edit/page.tsx`: imports `heldBook`.
- `src/app/(frontend)/books/[bookId]/edit/actions.ts`: `revalidatePath('/', 'layout')` after a successful save.
- `messages/en.json`, `messages/fi.json`: `detail` namespace.
- `tests/unit/collectionPage.unit.spec.ts`: one case per matrix row, plus a `serverTree` helper for async server components.
- `tests/unit/collectionList.unit.spec.ts`: `book: null` added.
- `tests/int/editBookAction.int.spec.ts`: mocks `next/cache`.
- `sprint-status.yaml`: 5.18 set to `review`, pending the phone check.

**Review findings:** 28 (medium 2, low 15, false 10, maybe-false 1).
- **Patched:**
  - Stale detail after Edit book (medium), confirmed and re-checked in a browser.
  - `aria-current` on the open row (low).
- **Deferred:** the phone check (medium), which needs Mika's iPhone.
- **Rejected (low):**
  - two test-only gaps (the `/` guard, the detail beside Load failed);
  - a detail read failure reaches the error boundary (×2);
  - the shelf re-read on open and close;
  - serial reads without Suspense;
  - a swap keeps sheet state (unreachable in 5.18);
  - `serverTree`'s async detection;
  - the boolean parameter;
  - empty Your copies after a race (×2);
  - StrictMode's double toast in dev;
  - one render with `book` before the Not in library replace;
  - the static row-leaves test.
- **Rejected (maybe-false):** Back pressed during the close animation could go back twice. If true it is low.
- **Rejected (false):**
  - the `/` guard is too broad (×2);
  - the row-swap test restates mocks;
  - the series number is not localised;
  - the `closing` early return;
  - an empty title;
  - `oversized`;
  - not committed;
  - tests only on jsdom;
  - the close fallback keeps the query.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 1, low 1.

**Verification:**
- `npm run typecheck`: passes.
- `npx eslint 'src/app/(frontend)' tests`: clean.
- `npm run test:unit`: 57 files, 816 tests pass.
- `npm run test:int`: 59 files, 503 tests pass, on the worktree's own Postgres on port 5434.
- Every I/O matrix row is covered by a passing test.
- The implementer ran a throwaway Playwright check at phone width, then deleted it. It covered:
  - open, with the half sheet, the dimmed list and the selection bar;
  - X, Back, Esc and the scrim closing the sheet;
  - a direct load closed with X;
  - Edit and back;
  - `?book=999999`;
  - an Edit save showing fresh values.

**Residual risks:**
- **Phone check:** not done (deferred to Mika).
- **Close animation:** the browser's Back drops the sheet without its exit animation, which the spec accepts.
- **Edit book saves:** each one now purges the whole client cache, so the next back/forward navigations refetch.
- **Rebased onto 5.13:** `CoverTile` got the same link, `replace`, `aria-current` and an open marker: the selection bar along the bottom edge of the cover (DESIGN.md, Cover tile). After the rebase: typecheck and eslint clean, `npm run test:unit` 819 pass.
