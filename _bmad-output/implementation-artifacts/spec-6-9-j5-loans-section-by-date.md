---
title: '6.9 [J5] Loans section by date'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_revision: 'cf3b5592301e1fdebb6ac5ff3cfc8adecff82305'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `/loans` renders nothing. Mika can lend and return from Book detail (6.7) and see the marker on rows (6.8), but cannot see everything that is out in one place, longest first, to know which loans to chase (FR-37, UX-DR48).

**Approach:** A new read in `lib/loans`, `openLoans(ctx)`, gives the viewer's open loans oldest first with copy, Book id, borrower and date. The `/loans` page hydrates the Books through `getEffectiveBooks()` and renders one list of loan rows (cover, title, authors, "{person} · since {date}"), the "Nothing lent" state and Load failed. `?book=` on `/loans` opens the same Book detail, which now closes back to the section it was opened from. A Filter chip in Book detail off `/` opens the collection with only that filter (the 5.21 clause).

## Boundaries & Constraints

**Always:**
- `openLoans(ctx): Promise<OpenLoan[]>` in `src/lib/loans/loans.ts`, `OpenLoan = { loanId: number; copyId: number; bookId: number; person: Named; since: string }`. Open = `returnedOn` unset. Order: `lentOn` ascending, then loan id ascending (longest out first, AD-7 style tie-break). `since` is `lentOn.slice(0, 10)`. Reads go through the gateway and filter `owner` explicitly as well as through `ownerAccess` (FR-48), as `lendCopy` does: the admin sees only their own loans. Three reads at `depth: 0`: the loans, their copies (`select: { book: true }`), their People (`select: { name: true }`). Imports only what `lib/loans` already may (spine: `copies`, `people`, payload helpers); never `lib/books`.
- The page (`(sections)/loans/page.tsx`) hydrates Books with `getEffectiveBooks(ctx, distinct bookIds)` and never sorts or filters on Book fields; a loan whose Book the viewer can no longer read is left out. Rows keep `openLoans()` order. One row per loan (one per copy: two lent copies of a Book are two rows).
- Either read failing (`openLoans` or `getEffectiveBooks`) logs and shows the existing `LoadFailed` ("Couldn't load." + Try again, which refreshes). A failed `listLocations()` leaves Book detail without Move, as on `/`.
- Row (`LoanRow`, hook-free, server-rendered): the cover at the row's m size (`w-cover-row`, `py-2`), the title (`text-title`, truncated), the authors joined by ", " (`text-meta text-text-muted`, left out when none), then `loans.since` "{person} · since {date}" (`text-meta text-text-muted`). The date is `format.dateTime(new Date(`${since}T12:00:00Z`), { dateStyle: 'medium' })`, as Book detail does. The whole row is a `Link` to `/loans?book=<bookId>` with `scroll={false}`, `prefetch={false}`, replacing while a Book is open, and the open Book's rows carry `selection-bar` and `aria-current="true"` (the panel's close returns focus there), as `BookRow` does.
- Nothing lent: `loans.nothingLent` "Nothing lent" in `text-heading-group` and `loans.nothingLentRemark` "Either everyone returns things or nobody asks." in `text-body text-text-muted`, the same block as the collection's empty state, without Scan book.
- `?book=<id>` on `/loans` (read with `parseShelfQuery(params).book`) renders `BookDetail` beside the list from 900px and as the sheet on the phone, in the same `wide:flex` row layout as `/`. The page wraps its content in `ShelfActionsProvider` so Book detail's actions report through `afterAction` (with no rows mounted it refreshes the server render, so the list follows a Returned or a Lend).
- `BookDetail`, `BookDetailFrame`, `BookDetailPanel`, `BookDetailSheet` and `NotInLibrary` take `back: string`, the section's address without `book`, in place of `query: ShelfQuery`; they use it where they used `shelfHref(query)`. `/` passes `shelfHref(query)`; `/loans` passes `/loans`. Behaviour on `/` is unchanged.
- `FilterChip`: on `/` unchanged. Off `/` (`usePathname() !== '/'`) it starts from the empty shelf query (`parseShelfQuery(new URLSearchParams()).query`) and goes to the collection with only that filter and without the Book, pushing at both widths so Back returns to `/loans`: in the wide panel a Link to `shelfHref(next)`; in the phone sheet it hands `shelfHref(next)` to `useSheetChip()`, and `useTaskBack` pushes a landing on another pathname than its fallback's instead of replacing (Mika, 2026-10-26).
- Strings in `messages/en.json` and `messages/fi.json`, namespace `loans`: `since` en "{person} · since {date}", fi "{person} · {date} alkaen"; `nothingLent` en "Nothing lent", fi "Ei mitään lainassa"; `nothingLentRemark` en "Either everyone returns things or nobody asks.", fi "Joko kaikki palauttavat tavaransa tai kukaan ei kysy.". The name is never lowercased and stands where Finnish needs no inflection.
- Spine: `ARCHITECTURE-SPINE.md` Shared shapes `// src/lib/loans` names `OpenLoan` and `openLoans(ctx)`, and the source tree's `loans/` comment adds `openLoans`.
- Tokens only; 44px tap height on the phone comes from the row's cover height (as `BookRow` at m).

**Never:**
- No by person switch, `loansOrder` preference or groups (6.10); no returned group or Returned Link on rows (6.11); no Lent before (6.12).
- No schema change, migration, new collection field or index.
- No change to `getHoldings`, `getShelfRows`, `BookRow`, `CoverTile` or the lent marker.
- No paging: the open loans are read whole.
- No client fetch: the list is server-rendered and refreshed by `router.refresh()`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| By date order | Loans lent 2 Jul (Leena), 12 Sep (Antti, two copies, ids 4 then 5) | Rows: Puhdistus "Leena · since Jul 2, 2026", then loan 4, then loan 5 | — |
| Returned excluded | One open loan, one returned | Only the open loan's row | — |
| Another user's loans | Admin and user both lend | Each sees only their own rows | — |
| Nothing lent | No open loans | "Nothing lent" and the remark; no list | — |
| Read fails | `openLoans` or `getEffectiveBooks` throws | "Couldn't load." with Try again; logged | Try again refreshes |
| Unreadable Book | A lent copy's Book no longer readable | That row is left out | — |
| Open a row | Tap row of Book 7 | Push `/loans?book=7`; Book detail opens; row has the selection bar | — |
| Close detail | X on Book detail opened from `/loans` | Back to `/loans` (history back, or replace to `/loans`) | — |
| Book not held | `/loans?book=99` | Toast "Not in library", replace to `/loans` | — |
| Chip from loans, wide | `/loans?book=7`, tap author 3 | Push `/?author=3` (no Book); Back returns to `/loans?book=7` | — |
| Chip from loans, phone | Same, in the sheet | Sheet closes onto `/loans`, then pushes `/?author=3`; Back returns to `/loans` | — |
| Finnish | `fi`, lent to Antti | "Antti · {date} alkaen" | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/loans/page.tsx` -- placeholder (`requireUser`, `return null`). Replace with the Loans section.
- `src/app/(frontend)/(sections)/page.tsx` -- the collection page: the pattern to follow (container `flex flex-1 flex-col px-page-margin-phone wide:px-page-margin`, row `wide:flex wide:flex-1 wide:gap-6`, list `min-w-0 flex-1`, `listLocations(ctx).catch(→ [])`, `logger().error`, `<BookDetail ctx bookId query locations />` at `:91`). Pass `back={shelfHref(query)}` instead of `query`.
- `src/app/(frontend)/(sections)/BookDetail.tsx:58-69,93` -- props `query: ShelfQuery`, used only for `<NotInLibrary query>` and `<BookDetailFrame query>`. Rename to `back: string`; update the header comment (opened on `/` or `/loans`).
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx:15-35,55` -- `FrameProps.query`, `useTaskBack(shelfHref(query), true)` in the panel. `BookDetailSheet.tsx:33-43` -- same in the sheet. Switch both to `back`.
- `src/app/(frontend)/(sections)/NotInLibrary.tsx` -- `{ query }` → `{ back }`; replaces to it.
- `src/app/(frontend)/(sections)/FilterChip.tsx` -- builds from `parseShelfQuery(useSearchParams())`; add the off-`/` branch with `usePathname` from `next/navigation`. Update its comment.
- `src/app/(frontend)/(sections)/BookRow.tsx` -- reference only: `ROW.m`, cover/title classes, `Link` props, `selection-bar`/`aria-current`. Do not change.
- `src/app/(frontend)/(sections)/LoadFailed.tsx` -- reuse as is.
- `src/app/(frontend)/(sections)/ShelfRows.tsx:81-104` -- `ShelfActionsProvider`; works without `ShelfRowsProvider` (reload is null → refresh only).
- `src/lib/loans/loans.ts` -- add `OpenLoan` and `openLoans`. Follow the file's doc-comment style; `Named` is declared locally at `:12`. `idOf` from `@/lib/payload/ref`.
- `src/lib/books/holdings.ts:102-130` (`openLoansOf`) -- the read pattern to mirror (loans → people by distinct ids, `lentOn.slice(0, 10)`).
- `src/lib/books/effectiveBook.ts:123` -- `getEffectiveBooks(ctx, ids): Map<number, EffectiveBook>`; unreadable ids are absent.
- `src/lib/shelf/query.ts:139,212` -- `parseShelfQuery`, `shelfHref`.
- `messages/en.json`, `messages/fi.json` -- `loans` namespace (has `lentTo`, `lentMarker`, `returned`). `tests/unit/messages.unit.spec.ts` checks key parity.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:516-517` (`// src/lib/loans` shapes) and `:596` (source tree `loans/` comment).
- `tests/int/loansService.int.spec.ts` -- `copyAs`, `personAs`, `contextFor`, `createUser` helpers; add the `openLoans` cases here.
- `tests/unit/collectionPage.unit.spec.ts:1-140` -- mock setup to copy for a new `tests/unit/loansPage.unit.spec.ts` (next-intl English translators, `next/navigation`, `next/link`, `requireUser`, `logger`, `ToastProvider`, `listLocations`, `lendingPeople`, actions, `heldBook`, `getHoldings`, `getUserBookState`). `:1013-1094` show the Book detail open/close/Not in library patterns.
- `tests/unit/filterChip.unit.spec.ts` -- mocks `next/navigation` (`useSearchParams` only); add `usePathname` to the mock and an off-`/` case.

## Tasks & Acceptance

**Execution:**
- `src/lib/loans/loans.ts` -- add `OpenLoan` and `openLoans(ctx)` as in Always, with a doc comment (spine AD-7, FR-37, FR-48).
- `src/app/(frontend)/(sections)/BookDetail.tsx`, `BookDetailPanel.tsx`, `BookDetailSheet.tsx`, `NotInLibrary.tsx`, `page.tsx` -- `query` → `back: string` as in Always.
- `src/app/(frontend)/(sections)/FilterChip.tsx` -- the off-`/` branch.
- `src/app/(frontend)/(sections)/loans/LoanRow.tsx` -- new hook-free row: props `{ book: EffectiveBook; line: string; href: string; replace: boolean; open: boolean }`.
- `src/app/(frontend)/(sections)/loans/page.tsx` -- the Loans section: `requireUser`, `parseShelfQuery(await searchParams).book`, reads in `Promise.all` (loan rows with `.catch → null` + log, locations with `.catch → []` + log), `ShelfActionsProvider`, the list / Nothing lent / `LoadFailed`, and `BookDetail` with `back="/loans"`. Header comment naming EXPERIENCE.md Loans and States.
- `messages/en.json`, `messages/fi.json` -- the three `loans` strings.
- `ARCHITECTURE-SPINE.md` -- the `lib/loans` shapes and source-tree comment.
- `tests/int/loansService.int.spec.ts` -- `openLoans` returns only the viewer's open loans, longest out first (ties by id), with copy, Book, borrower and `since`; another user's (the admin's) loans and returned loans are absent.
- `tests/unit/loansPage.unit.spec.ts` -- new: rows in `openLoans` order with title, authors and "{person} · since {date}", each linking to `/loans?book=`; Nothing lent; Load failed when `openLoans` rejects; `?book=` renders Book detail and its X closes to `/loans`.
- `tests/unit/filterChip.unit.spec.ts` -- off `/` with `/loans?book=5` and a chip for author 7: the link is `/?author=7&book=5`, pushed; in the sheet the close gets `/?author=7`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `6-9-j5-loans-section-by-date: done` when done.

**Acceptance Criteria:**
- Given open loans, when `/loans` opens, then they are one list, longest out first, each row showing the cover, title, authors and "{person} · since {date}".
- Given a row, when it is tapped, then Book detail opens at `?book=` on `/loans`, and closing it returns to `/loans`.
- Given no open loans, when `/loans` opens, then it shows "Nothing lent" and "Either everyone returns things or nobody asks.".
- Given the loans read fails, when `/loans` opens, then it shows "Couldn't load." with a Try again Link that renders the address again.
- Given Book detail opened from `/loans`, when a Filter chip is tapped, then the collection opens with only that filter.
- Given another user's loans, when I open `/loans`, then they never appear, the admin included.
- Given this story, when it is committed, then ARCHITECTURE-SPINE.md names `OpenLoan` and `openLoans`.

## Spec Change Log

### 2026-10-26 — intent gap answered by Mika
- **Trigger:** review pass 1's medium finding. The wide chip pushed `/?author=…&book=…`, so closing the panel went back to `/loans?book=…`.
- **Amended** (with Mika's answer, in the intent contract):
  - The off-`/` chip drops the Book at both widths.
  - Back returns to Loans at both widths, through `useTaskBack` pushing a landing on another pathname.
  - The two chip matrix rows and the Design Note changed to match.
- **Avoids:** the panel reopening the Book in Loans, and the phone chip dropping Loans from history.
- **KEEP:** everything else from the reviewed attempt (`openLoans`, `LoanRow`, the page, the `back` prop, strings, spine). Also the review's two test fixes: the tie-break case moves the lower id's `lentOn`, and `filterChip` resets `search`.

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 21 findings — high 0, medium 2, low 8, false 11, maybe-false 0
- findings:
  - `[medium]` `[intent_gap]` Blind: after the wide chip on `/loans` pushes `/?author=3&book=7`, closing Book detail goes history-back to `/loans?book=7` with the Book still open — confirmed in `useTaskBack` (`navigation.ts`): `depth > taskBase` traverses back, and `staleBelow('/?author=3')` compares pathnames (`/loans` ≠ `/`), so nothing corrects it. The root cause is the intent contract's "keeping the open Book" with a push. Two readings fix it differently (drop `book` on the off-`/` wide chip, or keep the Book and stop the close crossing a section), so this is a question for Mika. The attempt is saved in `spec-6-9-attempt.patch` and on branch `wip/6-9-loans-by-date`.
  - `[medium]` `[intent_gap]` Edge: the same defect (wide chip push, then X lands on `/loans?book=5`) — same root cause and route as the row above.
  - `[low]` `[reject]` Blind: the phone sheet's chip from `/loans` replaces the `/loans` entry, so Back from the filtered collection skips Loans — real; this is the existing sheet landing ("Back afterwards reopens neither the Book nor the unfiltered list"). Fixing it needs a new branch in the sheet's leave, and it only bites on Back after a chip. Revisit with the wide-chip answer.
  - `[false]` `[reject]` Blind: `FilterChip` checks `usePathname()` while the frame takes `back` — the off-`/` rule is the same for every non-collection section (wishlists included): start from the empty query and go to `/`. No section is misread.
  - `[low]` `[reject]` Blind: two lent copies of one Book both carry `aria-current`, so focus returns to the first — `BookRow` on `/` marks every copy of the open Book the same way; focus lands on a row of the right Book.
  - `[low]` `[reject]` Blind: two copies lent to one person on one day give identical rows, and `copyId` goes unused — the rows match the AC (cover, title, author, "{person} · since {date}"); `copyId` is part of the contract's `OpenLoan` shape.
  - `[false]` `[reject]` Blind: three text lines instead of the m row's two — the AC asks for the author as well; a taller row still meets the 44px tap height.
  - `[low]` `[reject]` Blind: after Returned in the wide panel the row leaves, so the panel's close finds no `aria-current` row and focus drops to the body — rare (Returned from rows comes in 6.11), and the fix adds a fallback branch to the panel.
  - `[low]` `[reject]` Blind: one log message covers both reads — the logged `err` carries the stack, which names the read; splitting the catch adds a branch.
  - `[false]` `[reject]` Blind: `openLoans` and `getEffectiveBooks` are chained needlessly — the Books read needs the loans' Book ids.
  - `[low]` `[reject]` Blind: `filterChip.unit.spec.ts` does not reset `search` in `afterEach` — every test sets `search` before it renders; moot under the intent-gap revert.
  - `[false]` `[reject]` Blind: `sprint-status.yaml` says done while the spec says in-review — finalization sets both; under this halt, sprint status is reverted with the code.
  - `[low]` `[reject]` Verification gap: the same-day tie-break by id is not observable, since insertion order equals id order — real; it is moot under the intent-gap revert, and the re-derived change should lend the lower id on another day and move its `lentOn` after.
  - `[low]` `[reject]` Verification gap: a failing `getEffectiveBooks` is never shown to give Load failed — test-only; one `.catch` covers both reads by construction, and the AC names the loans read (CLAUDE.md, Tests).
  - `[false]` `[reject]` Intent: the retry is a button where the epic says a Link — `LoadFailed`'s Try again is the project's `ActionLink`, a Link in the design system rendered as a button.
  - `[false]` `[reject]` Intent: order and owner isolation are proven only at the service — that is where they are decided; the page keeps the order it is given.
  - `[false]` `[reject]` Intent: the wide surface is not exercised on `/loans` — test-surface description; the frame takes `back` the same way at both widths.
  - `[false]` `[reject]` Intent: close is tested only for the opened-directly case — `useTaskBack`'s back branch is unchanged and covered by the collection's close test.
  - `[false]` `[reject]` Intent: the phone chip is tested through a mocked sheet — the sheet's landing is covered by the collection page's chip test.
  - `[false]` `[reject]` Intent: no test shows the list following Lend or Returned — not an AC; it rests on `afterAction`'s refresh, which is unchanged.
  - `[false]` `[reject]` Intent: Finnish, the Books-read failure and unreadable-Book cases are only mock-tested, and "author" is singular — strings are covered by key parity (CLAUDE.md, Tests), and joining every author is the defensible reading.

## Design Notes

**Why a `back` prop, not a pathname check.** Book detail is one server component rendered by two pages (spine, Routes). The page knows its own address without `book`; passing it keeps the frame free of section knowledge and leaves `/` byte-for-byte the same.

**The chip from loans closes the Book.** Mika's call after review (2026-10-26): at both widths it goes to the collection with only that filter, no Book, and Back returns to Loans. Keeping the Book open made the panel's close go history-back into `/loans?book=`.

**An ordered copy with an open loan** (the 6.6 `setStatus` leftover) is still an open loan, so it is listed. The row shows no status.

```tsx
// LoanRow content (m size, as BookRow)
<Link href={href} replace={replace} scroll={false} prefetch={false}
  aria-current={open ? 'true' : undefined} className="flex items-center gap-4 py-2">
  <div className="w-cover-row shrink-0"><Cover src={book.coverUrl} title={book.title} language={book.language} /></div>
  <div className="flex min-w-0 flex-1 flex-col">{title}{authors}{line}</div>
</Link>
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int -- tests/int/loansService.int.spec.ts` -- expected: all pass (needs the test Postgres).

**Manual checks (if no CLI):**
- Lend two copies on different dates, open `/loans` on phone and wide, light and dark: order, row text, open/close Book detail, a chip, Returned from Book detail removes the row.

## Auto Run Result

Status: done (first run halted on an intent gap; resumed with Mika's answer)

**Summary.** `/loans` lists the open loans, longest out first. Each row has the cover, the title, the authors and "{person} · since {date}". A row opens Book detail at `/loans?book=`, and closing it returns to `/loans`. With no open loans the page shows "Nothing lent" and the remark. If either read fails, it shows Load failed with Try again. A Filter chip in Book detail on `/loans` opens the collection with only that filter and no Book, at both widths, and Back returns to Loans.

**Files changed.**
- `src/lib/loans/loans.ts`: `OpenLoan`, `openLoans()`.
- `src/app/(frontend)/(sections)/loans/page.tsx`: the Loans section.
- `src/app/(frontend)/(sections)/loans/LoanRow.tsx`: new loan row.
- `BookDetail.tsx`, `BookDetailPanel.tsx`, `BookDetailSheet.tsx`, `NotInLibrary.tsx`, `(sections)/page.tsx`: `back` replaces `query`.
- `FilterChip.tsx`: off `/`, an empty query and no Book, pushing.
- `components/navigation.ts`: `useTaskBack` pushes a `to` on another pathname.
- `messages/en.json`, `messages/fi.json`: `loans.since`, `nothingLent`, `nothingLentRemark`.
- `ARCHITECTURE-SPINE.md`: `OpenLoan` / `openLoans`.
- Tests:
  - `tests/int/loansService.int.spec.ts`: order, the tie-break with a moved `lentOn`, returned loans left out, owner only.
  - New `tests/unit/loansPage.unit.spec.ts`: rows, an unreadable Book, Nothing lent, Load failed, Book detail open and close, Not in library.
  - `tests/unit/filterChip.unit.spec.ts`: the off-`/` case, and `search` reset.
  - `tests/unit/navigation.unit.spec.ts`: the chip from `/loans`, back then push, and opened directly.
  - `tests/unit/collectionPage.unit.spec.ts`: `usePathname` in the navigation mock.
- `sprint-status.yaml`: 6.9 done.

**Review.** One pass found 21 findings: 2 medium, 8 low and 11 false.
- **Intent gap (medium, two layers, one root cause):** the wide chip's close went back into `/loans?book=`. Mika answered: close the Book, and Back returns to Loans at both widths. Built as amended.
- **Patched with the resume** (both low, first rejected as moot):
  - The tie-break test now moves the lower id's `lentOn`.
  - `filterChip` resets `search`.
- **The phone chip dropping Loans from history (low):** fixed by Mika's "back returns to loans" answer.
- **Rejected, with reasons in the triage log:**
  - The pathname check in the chip.
  - Two `aria-current` rows for two copies.
  - Identical rows for two copies.
  - The three-line row.
  - Focus after Returned.
  - One log message for both reads.
  - Chained reads.
  - The status mismatch.
  - The Books-read failure test.
  - The intent layer's test-surface notes.
- **Deferred:** none.

**Follow-up review:** not recommended (`false`). No high was patched, and the resume's navigation change is covered by its own `useTaskBack` tests. Patched by verdict: 0 high, 0 medium, 2 low, plus the amended chip behaviour.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (48 existing migration warnings).
- `npm run test:unit`: 947 passed in 65 files.
- `npm run test:int -- tests/int/loansService.int.spec.ts`: 14 passed.
- No schema change.
- Not run in a browser.

**Residual risks.**
- **Not checked in a browser:** phone and wide, light and dark, a chip from Loans and Back.
- **Wide Back lands on `/loans?book=`:** Back after a wide chip returns to Loans with the Book still open in the panel, because the panel is a plain Link and does not close first. The phone sheet closes first, so Back lands on `/loans` itself.
- **Phone, opened directly:** with `/loans?book=` opened directly on the phone, the chip pushes from that entry, so Back reopens the Book on Loans.
