---
title: '5.20 [E30] Open book from the Answer'
type: 'feature'
created: '2026-10-23'
baseline_revision: 'df2f75f763a417a0c22f675f4a3cabcc52f280d6'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The In library Answer offers only Add another copy and Back, so after scanning a book I own I can't get to its detail without leaving scanning and finding the row by hand (UX-DR46, EXPERIENCE.md Answer: "Open book leaves scanning and shows that Book's detail in the collection").

**Approach:** Add Open book above Add another copy. It leaves the scan task exactly as the X does (history back past all of the task's entries, or a replace when the task was opened directly), then opens the collection at `/?book=<bookId>`, so Book detail's close and system Back land below the task, never on the Answer.

## Boundaries & Constraints

**Always:**
- Order at the Answer's foot: Open book (secondary), Add another copy, Back (the one primary), per UX-DR46.
- The destination is `shelfHref(parseShelfQuery({}).query, { book: bookId })`, i.e. `/?book=<bookId>`, with no other shelf params.
- History (spine, Navigation and history): after Open book, the task's entries are gone. With an in-app entry below the task, it goes back to it in one traversal (`useCloseTask`'s back branch) and, once that settles, pushes the address with `scroll: false` (opening Book detail pushes). With the task as the first entry, it replaces to the address. A second tap while leaving does nothing, as on the X.
- `bookId` is the `EffectiveBook.bookId` the lookup already returned; no extra read.
- Strings in `messages/en.json` and `messages/fi.json` ("Open book" / "Avaa kirja").

**Never:**
- No change to Book detail, the collection page, `lib/shelf` or `lib/catalogue`.
- No `?return=` or other return parameter; no push of `/?book=` on top of the scan entries.
- No hand-started slide for this exit (pass `null` as the task, as Edit book's Save does).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| From a section | `/` (depth 1) → `/scan` → Answer, task base 1, at depth 2 | `history.go(-2)`; after the `popstate` and a frame, `router.push('/?book=5', { scroll: false })` | — |
| Opened directly | Answer is the first entry (base 0) | `router.replace('/?book=5')`, no traversal | — |
| Double tap | tapped twice while leaving | one traversal, one push | — |
| Book gone meanwhile | copy removed elsewhere before the tap | collection toasts "Not in library" (5.18) | `NOT_FOUND` as built |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/InLibraryAnswer.tsx` -- server component; the foot is `AddToLibrary another` then `AnswerBack variant="primary"`. Put Open book first.
- `src/app/(frontend)/scan/AnswerBack.tsx` -- the client button pattern to mirror (`Button`, a navigation hook, label passed in from the server).
- `src/app/(frontend)/scan/answer.ts:56-58,125-147` -- `InLibrary` type and `inLibrary()`, which spreads `existingBook()` and has `book.bookId` in scope. Add `bookId: number` to `InLibrary` only (not `AnswerBook`).
- `src/app/(frontend)/components/navigation.ts:240-297` -- `useCloseTask()`: `base === 0` replaces to `/`; otherwise `traverseBack(..., settled)` where `settled` runs after the `popstate` + frame (or the 1 s timeout). The view-transition branch passes `resolve` as `settled`. Extend the returned function with an optional address `to`: replace to `to ?? '/'`, and after settling push `to` with `{ scroll: false }`. Update its doc comment. Callers: `FullScreenTask.tsx:38`, `EditBookScreen.tsx:113,205,247` (all call it with one argument; unchanged).
- `src/lib/shelf/query.ts:141,218` -- `parseShelfQuery`, `shelfHref`; client-importable.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx` / `BookDetailPanel.tsx` -- their close is `useTaskBack(shelfHref(query), true)`: history back when an in-app entry is below, else replace. Read-only; this is why the task's entries must be gone first.
- `tests/unit/navigation.unit.spec.ts:121-178` -- "a task with a recorded base" harness (`openTask`, `traverseTo`, `go` spy, fake rAF). The router mock (line 9) has `back` and `replace`; add `push`.
- `tests/unit/answer.unit.spec.ts:179-206` -- the `inLibrary` `toEqual` expectation; it needs `bookId`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/components/navigation.ts` -- `useCloseTask` returns `(task, to?: string)`; leaves the task, then goes to `to` as in Boundaries.
- `src/app/(frontend)/scan/answer.ts` -- `InLibrary` carries `bookId`; `inLibrary()` sets it; doc comment says what it is for.
- `src/app/(frontend)/scan/OpenBook.tsx` -- new client component: a secondary `Button` labelled from its prop that calls `closeTask(null, shelfHref(parseShelfQuery({}).query, { book: bookId }))`.
- `src/app/(frontend)/scan/InLibraryAnswer.tsx` -- render `OpenBook` first; update the doc comment.
- `messages/en.json`, `messages/fi.json` -- `answer.openBook`.
- `tests/unit/navigation.unit.spec.ts` -- in "a task with a recorded base", one case for From a section, tapped twice (one go(-2), no push before the traversal, exactly one push with `scroll: false` after it; covers Double tap), and one for Opened directly. Book gone meanwhile is covered by 5.18's Not in library case in `tests/unit/collectionPage.unit.spec.ts`.
- `tests/unit/answer.unit.spec.ts` -- add `bookId` to the `inLibrary` expectation.

**Acceptance Criteria:**
- Given the In library Answer, when I tap Open book, then scanning closes and the collection opens with `?book=<bookId>`, showing that Book's detail.
- Given I arrived through Open book, when I close Book detail or press system Back, then I land on the screen I opened Scan from, not on the Answer.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 20 findings — high 0, medium 2, low 14, false 4, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: the spine is not updated. Open book follows the Navigation and history row as written: opening Book detail pushes, closing is history back, no return parameter. `useCloseTask` is not named in the spine, so no spine contract changes.
  - `[low]` `[reject]` Blind: when no `popstate` comes within the 1 s safety timeout, `settled` still pushes `to` on top of the scan entries. Real, but only when the browser drops a `go(-n)`, which the timeout exists for and nobody meets in everyday use. The fix threads a traversed flag through `traverseBack` (residual risk).
  - `[low]` `[reject]` Blind: `scroll: false` keeps the old scroll offset when the section below had another query or was `/loans`. A filter change on `/` does the same (spine: search navigation uses `scroll: false`), and from the default collection keeping the offset is right. The fix adds a branch.
  - `[low]` `[reject]` Blind: `closeTask(element, to)` type-checks and would push inside the view transition's update. No caller does this. The only `to` caller passes `null`, as the doc comment says.
  - `[low]` `[reject]` Blind: Open book is a `<button>`, not a link with an `href`. UX-DR46 lists it among the Answer's buttons, next to Back. A link is a restructure for long-press and new-tab use, which the PWA doesn't need.
  - `[low]` `[reject]` Blind: an ordered-only holding shows In library, so it now gets Open book, while UX-DR46's Ordered Answer offers only Back. `inLibrary()` already documents that the Ordered heading arrives with Story 8.2. That story owns the Ordered Answer's buttons (residual risk).
  - `[false]` `[reject]` Blind: Open book during an in-flight Add another copy breaks the save's return to Scan. `useAddToLibrary.ts:85` runs `back()` only `if (mounted.current)`, so a save that finishes after the Answer unmounts does not navigate.
  - `[false]` `[reject]` Blind: `oversized` unresolved. Mika dismissed the trigger for epic-sliced stories (Epic 4 retro, P4), as in 5.10–5.19.
  - `[false]` `[reject]` Blind: `shelfHref(parseShelfQuery({}).query, …)` is roundabout and pulls `lib/shelf` into the client. `lib/shelf/query.ts` is one of the named client-importable modules and already ships with the collection. No harm is named.
  - `[low]` `[reject]` Edge: the timeout path pushes above the Answer. Same root and reason as the Blind timeout row.
  - `[low]` `[reject]` Edge: the destination ignores the landed entry's search, filters and sort. The intent's AC asks for `?book=<bookId>`, the Design Notes record the choice, and the section below is one Back away, unchanged.
  - `[low]` `[reject]` Edge: when the entry below the task already is `to` (Scan opened over that Book's panel on wide), the push duplicates it and closing detail shows the same Book once more. Rare, and the fix is a guard.
  - `[low]` `[reject]` Edge: a non-null task with `to` collides the slide with the push. Same as the Blind row: no caller does this.
  - `[low]` `[reject]` Edge (claim): the timeout path breaks "never on the Answer". Same root and reason as the Blind timeout row.
  - `[medium]` `[patch]` Verification gap: nothing taps Open book on a rendered Answer, so a wrong id, a missing `to` or a dropped button would stay green (AC1). Fixed: `tests/e2e/scanToSave.spec.ts` gets an Open book leg on the In library Answer it already reaches, checking the URL `/?book=<id>`, Book detail, and that closing it lands on `/` with Scan gone (AC1, AC2).
  - `[low]` `[reject]` Verification gap (other): the timeout path. Same root and reason as the Blind timeout row.
  - `[low]` `[reject]` Verification gap (other): with `/scan` as the tab's first entry (a direct load or reload of `/scan`) and the Answer pushed above it, the base-0 branch replaces only the Answer. `/scan` stays below, so Book detail's close reopens Scan. This is real, but it needs Scan to be loaded directly (the PWA starts at `/`), and the fix adds a traversal branch to the replace path (residual risk).
  - `[medium]` `[patch]` Intent: AC1 and AC2 live in the browser, while the tests stop at the hook's router calls, and the manual check was not run. Same root and fix as the Verification gap row: the e2e leg exercises both ACs in Chromium.
  - `[low]` `[reject]` Intent: the timeout path diverges from the spec's Never list. Same root and reason as the Blind timeout row.
  - `[low]` `[reject]` Intent: the view-transition branch with a `to` has no caller and no test. Same as the Blind row on `closeTask(element, to)`.

## Design Notes

Pushing `/?book=` on top of the scan entries would close scanning on screen but leave the Answer one Back below Book detail: its close (`useTaskBack`) goes history back while an in-app entry is below, so it would reopen the Answer. Leaving the task first and then pushing gives the stack `section → /?book=` that UX-DR8 expects.

The address drops whatever search or filters the section below had; that section stays one Back below, unchanged.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npx eslint 'src/app/(frontend)' tests/unit` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including the new navigation cases

**Manual checks (if no CLI):**
- `npm run dev`: from `/`, Scan, enter an owned ISBN, tap Open book: the sheet (phone) or panel (≥900px) shows that Book; X or Back returns to `/`, and Back once more does not reopen Scan.

## Auto Run Result

**Summary:** The In library Answer now has Open book, above Add another copy, with Back still the primary. It leaves the scan task the way the X does, then opens `/?book=<bookId>`:
- **With a section below the task:** one traversal past every task entry, then a push with `scroll: false`.
- **When the task is the first entry:** a replace.

So Book detail's close and system Back land on the section Scan was opened from, never on the Answer.

**Files changed:**
- `src/app/(frontend)/components/navigation.ts`: `useCloseTask` takes an optional `to`. It replaces to it at base 0, or pushes it once the traversal settles.
- `src/app/(frontend)/scan/answer.ts`: `InLibrary` carries `bookId`, taken from the lookup's `EffectiveBook`.
- `src/app/(frontend)/scan/OpenBook.tsx`: new. The secondary button that calls `closeTask(null, /?book=<id>)`.
- `src/app/(frontend)/scan/InLibraryAnswer.tsx`: Open book comes first.
- `messages/en.json`, `messages/fi.json`: `answer.openBook` ("Open book" / "Avaa kirja").
- `tests/unit/navigation.unit.spec.ts`: the From a section case (tapped twice) and the Opened directly case.
- `tests/unit/answer.unit.spec.ts`: `bookId` in the `inLibrary` expectation.
- `tests/e2e/scanToSave.spec.ts`: an Open book leg on the In library Answer.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 5.20 set to `done`.

**Review findings:** 20 (medium 2, low 14, false 4).
- **Patched:** the Open book wiring and AC2 had no browser evidence (medium, found by two layers). The e2e leg now taps Open book, checks the URL `/?book=<id>` and the panel named by the title, closes it, and lands on `/` with Scan gone.
- **Deferred:** none.
- **Rejected (low):**
  - the 1 s timeout path pushing over the scan entries (×5);
  - `scroll: false` over a different list;
  - a non-null task combined with `to` (×3);
  - button rather than link;
  - Open book on an ordered-only holding (Story 8.2 owns that);
  - the landed entry's query is not kept;
  - a duplicate entry when the Book's panel is below the task;
  - `/scan` as the tab's first entry staying below the Book.
- **Rejected (false):**
  - the spine not updated (no contract changed);
  - a save in flight (guarded by `mounted`);
  - `oversized`;
  - the href expression.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 1, low 0.

**Verification:**
- `npm run typecheck`: passes.
- `npx eslint 'src/app/(frontend)' tests/unit tests/e2e`: clean, and prettier is clean.
- `npm run test:unit`: 59 files, 856 tests pass.
- `npm run test:e2e`: 1 passed (Chromium, Desktop viewport). This covers the manual check's history path at wide width.
- Every I/O matrix row has a passing test. Book gone meanwhile is covered by the 5.18 "Not in library" cases.

**Residual risks:**
- **Timeout path:** if the browser never delivers the `popstate` for `go(-n)`, the push lands above the Answer after 1 s.
- **Direct load of `/scan`:** after a reload or a direct load of `/scan` followed by an ISBN, Open book replaces only the Answer. Book detail's close then reopens Scan.
- **Ordered-only holdings:** they show Open book until Story 8.2 splits out the Ordered Answer.
- **Phone width:** the phone sheet path is not run in a browser. It is the same `useTaskBack` close as on wide.
