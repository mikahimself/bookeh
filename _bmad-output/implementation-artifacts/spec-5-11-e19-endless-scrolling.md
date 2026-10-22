---
title: '5.11 [E19] Endless scrolling'
type: 'feature'
created: '2026-10-22'
baseline_revision: 'e606558d60b534bac6c7f3f79e77f1c22dca1925'
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

**Problem:** `/` shows only the first `SHELF_PAGE_SIZE` (50) rows, rendered on the server. Nothing loads the rest, and nothing refreshes the rows after a change: an Undo from the toast leaves rows and count stale (AD-7, UX-DR40).

**Approach:** Add `/data/shelf` (inside `runRoute`) answering `getShelfRows` for a validated range. Move the count line, the empty states and the rows into one client list (AD-7), seeded with the server's first page. The list loads the next range as the end nears. After a successful action or Undo it reloads rows 0..n, and on `NOT_FOUND` it shows "Not in library" and reloads.

## Boundaries & Constraints

**Always:**
- `/data/shelf?<shelf params>&offset=<n>&limit=<n>`:
  - reads the query with `parseShelfQuery` (`book` ignored) and answers `ActionResult<ShelfRows>`;
  - signed out gives 401 (`requireUserOrThrow` first);
  - `offset` must be a whole number ≥ 0 and `limit` a whole number from 1 to `SHELF_MAX_ROWS` (1000, in `query.ts`); otherwise, or when either is missing, it answers `VALIDATION` without a query.
- The client builds the request path with a `query.ts` serializer that shares `shelfHref`'s parameter writing. No second encoding of shelf params.
- Requests go through `fetchData`; failures go through `useReportFailure` (sign-in redirect, error toast).
- One `ShelfRowsProvider` per shelf query holds `{ rows, total, labels }`, seeded from the server's first page. The page keys it by `shelfHref(query)` (the query without `book`), so a new search, filter or sort starts over. It never patches rows locally: every change is a load.
- **Loading more:** when a sentinel after the last row comes within about one screen of view and `rows.length < total`, load `offset = rows.length`, `limit = SHELF_PAGE_SIZE`. Then:
  - append, skipping any copy id already held;
  - take `total` and `labels` from the answer;
  - the progress line runs meanwhile, the list stays usable, and only one load runs at a time;
  - a failed load is reported and tried again the next time the sentinel comes into view.
- **Reload:** load `offset 0` and `limit = min(max(rows.length, SHELF_PAGE_SIZE), SHELF_MAX_ROWS)`, then replace rows, total and labels. A reload makes any load in flight stale; a stale answer is dropped.
- **Triggers:**
  - `afterAction(result)` on the provider's context is what later stories' actions call. `ok` → reload. `NOT_FOUND` → a success-kind toast with `answer.notInLibrary` ("Not in library", as `NotHeld` does), then reload. Any other code → `reportFailure`.
  - Any successful Undo from the toast reloads. `ToastProvider` gains `onUndone(listener)`, which returns an unsubscribe function.
- Count line, First run, No match, and rows render from the provider's state with the same words and hrefs as in 5.10. After a reload, a total of 0 shows the matching empty state.

**Never:**
- No `sessionStorage`, restore or scroll keeping (5.12). No page number in the URL. No skeletons. No page buttons.
- No change to `lib/shelf` SQL, `getShelfRows`, `SearchField`'s own-replace logic or `BookRow`'s markup.
- No new action on `/` (Book detail, select mode and their actions are 5.18+).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Next range | 50 of 120 held, sentinel near view | `GET /data/shelf?…&offset=50&limit=50`, 100 rows held | — |
| All held | 120 of 120 | no request | — |
| Shifted page | answer repeats a held copy id | that row is not added twice | — |
| Load failed | `NO_CONNECTION` | error toast; rows kept; retried on the next approach | `reportFailure` |
| Undo | 100 held, toast Undo succeeds | `offset=0&limit=100`, rows and count replaced | — |
| Action gone | `afterAction({ ok: false, code: 'NOT_FOUND' })` | toast "Not in library", reload | — |
| Bad range | `limit=0`, `limit=1001`, `offset=-1`, `offset=x`, none | `{ ok: false, code: 'VALIDATION' }`, no `getShelfRows` call | — |
| Signed out | no session | 401 `UNAUTHENTICATED` | client → sign-in |

</intent-contract>

## Code Map

- `src/lib/shelf/query.ts` -- `shelfHref` builds a `URLSearchParams` inline (lines ~190–225). Extract that into a `shelfSearchParams(query, { book })`, have `shelfHref` use it, and add `SHELF_MAX_ROWS` and `shelfRowsPath(query, range)` → `` `/data/shelf?${…}&offset=…&limit=…` ``. `offset`/`limit` do not collide with shelf params; `parseShelfQuery` ignores unknown ones.
- `src/app/(frontend)/data/suggest/route.ts` -- the pattern for the new `data/shelf/route.ts`: `runRoute`, `requireUserOrThrow`, `DomainError('VALIDATION')`.
- `src/lib/shelf/getShelfRows.ts` -- `getShelfRows(ctx, query, range)`; no range validation of its own.
- `src/app/(frontend)/components/request.ts` -- `fetchData`, `useReportFailure`, `reportFailure`.
- `src/app/(frontend)/components/toast/ToastProvider.tsx:64` -- `runUndo`; on `result.ok`, call the `onUndone` listeners (a `Set` in provider state). Add `onUndone` to `ToastContextValue` and the memoised `value`.
- `src/app/(frontend)/books/[bookId]/edit/NotHeld.tsx` -- "Not in library" as a success-kind toast via `useTranslations('answer')`.
- `src/app/(frontend)/(sections)/page.tsx` -- today it renders the count line, the empty states and `<ul>` of `BookRow`. Keep parsing, the `getShelfRows` first page, `LoadFailed` and `CollectionTools`, and hand the rest to the client.
- `src/app/(frontend)/(sections)/countLine.ts` -- `activeValues`, `isNarrowed`, `clearHref`: pure, usable with the client `useTranslations('collection')`.
- `src/app/(frontend)/(sections)/BookRow.tsx` -- hook-free row, reused unchanged.
- `src/app/(frontend)/components/ProgressLine.tsx` -- `ProgressLine({ label })`, label `progress.loading`.
- `tests/unit/collectionPage.unit.spec.ts` -- renders the awaited page with `next-intl` on the English catalogue. Its cases must keep passing; the client list needs `ToastProvider` (or a `useToast` mock) and an `IntersectionObserver` stub in jsdom.
- `tests/unit/suggestRoute.unit.spec.ts` -- the route unit-test pattern.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:533` -- the routes table row for `/data/shelf` gets its contract.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/query.ts` -- add `SHELF_MAX_ROWS = 1000`, `shelfSearchParams`, and `shelfRowsPath`; `shelfHref` output unchanged -- one encoding for links and requests.
- `src/app/(frontend)/data/shelf/route.ts` -- new `GET`: validate `offset`/`limit` (whole digits only), parse the query, return `getShelfRows(ctx, query, range)` -- AD-7, AD-10.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- `onUndone(listener)`; listeners run after a successful Undo; update the "Nothing else on the screen changes" doc comment -- the list's Undo trigger.
- `src/app/(frontend)/(sections)/ShelfRows.tsx` -- new client `ShelfRowsProvider({ query, initial, children })` and `useShelfRows()` → `{ shelf, loading, loadMore, afterAction }`. It holds the state, makes the requests through `fetchData` and `shelfRowsPath`, de-duplicates and drops stale answers, subscribes to `onUndone`, and handles `afterAction` -- the AD-7 client list state, reachable from later siblings (Book detail, select bar).
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- new client: the count line (`aria-live`), First run / No match, the `<ul>` of `BookRow`, the sentinel (`IntersectionObserver`, `rootMargin` about one viewport), and `ProgressLine` while loading -- moved from `page.tsx`.
- `src/app/(frontend)/(sections)/page.tsx` -- render `<ShelfRowsProvider key={shelfHref(query)} query={query} initial={shelf}><CollectionList query={query} /></ShelfRowsProvider>` in place of the server-rendered count line and rows.
- `ARCHITECTURE-SPINE.md` routes table -- `/data/shelf?<shelf params>&offset=<n>&limit=<n>`: `ActionResult<ShelfRows>`; `limit` 1–1000 (`SHELF_MAX_ROWS`), `offset` ≥ 0, otherwise `VALIDATION`.
- `tests/unit/shelfRoute.unit.spec.ts` -- the Bad range rows: `VALIDATION` and no `getShelfRows` call; a good range passes the parsed query and range.
- `tests/unit/collectionList.unit.spec.ts` -- jsdom, stubbed `IntersectionObserver` and `fetch`. Cases:
  - next range appended, with the duplicate skipped;
  - no request when all are held;
  - Undo → reload `0..n` with the count updated;
  - `afterAction` `NOT_FOUND` → "Not in library" and a reload;
  - `afterAction` `ok` → a reload.
- `tests/unit/collectionPage.unit.spec.ts` -- keep the existing cases green: provider and stubs only, no assertion changes.

**Acceptance Criteria:**
- Given the collection with more copies than held, when the end of the list nears, then the next range loads from `/data/shelf` with the progress line, and the rows already shown stay usable.
- Given a successful Undo from the toast while `/` is open, when it completes, then the list reloads rows 0 to the number it held, and the rows and count show the new state.
- Given an action reported through `afterAction`, when it succeeds, then the list reloads rows 0..n; when it fails with `NOT_FOUND`, then "Not in library" shows and the same reload runs.
- Given a request to `/data/shelf` with a missing or out-of-bounds range, when it is answered, then the result is `VALIDATION` and no shelf query runs.
- Given the spine routes table, when this story lands, then the `/data/shelf` row states its parameters and limits.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 24 findings — high 0, medium 1, low 16, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: the count line's `aria-live` is re-inserted on every new query (the keyed provider remounts), so screen readers may not announce the new count — real (5.10 relied on an in-place update), but the fix means moving state out of the keyed subtree or resetting without a remount; recorded as a residual risk.
  - `[low]` `[reject]` Blind: a failed load more or reload gives an error toast, not EXPERIENCE.md's "Couldn't load. Try again." Link; a failed reload after Undo leaves stale rows with no retry — real, but needs `fetch` to fail on the tailnet between two requests, and the fix adds failure state, a retry and a branch; recorded as a residual risk for Mika (the spec chose the toast).
  - `[medium]` `[patch]` Blind: the spine's AD-7 does not record the provider, `afterAction`, `onUndone` or the reload cap, which 5.18 and 5.27 will call — confirmed: only the routes table and the `query.ts` line changed. Fix: the AD-7 client-list bullet now records all four.
  - `[low]` `[reject]` Blind: a reload holding over 1000 rows comes back at 1000 and the place is lost — the spec's documented cap; meeting it needs over 1000 rows scrolled, and chunked reloads add complexity. The cap is now in the spine.
  - `[low]` `[reject]` Blind: an append misses a copy when a copy before it was removed elsewhere (offset shift) — needs a change from another device during scrolling; this list's own changes reload; the fix adds a branch.
  - `[low]` `[reject]` Blind: a newer server `initial` under the same key is ignored (`router.refresh()`, re-tapping the section) — what the spec intends, so `?book=` keeps the rows; rows go stale only after a change elsewhere.
  - `[low]` `[reject]` Blind: `whole()` is duplicated in the route and `query.ts` — two four-line parsers; sharing one would add an export to `query.ts` for no named caller harm.
  - `[false]` `[reject]` Blind: built despite `oversized` — Mika dismissed the `oversized` trigger in Story 4.15 (Epic 4 retro, P4), as in 5.10.
  - `[false]` `[reject]` Blind: `afterAction` throws for siblings when the first read failed, and the query is passed twice — no sibling calls `useShelfRows` yet (5.18+ decide where they mount); the list's `query` and the provider's come from the same render, and the key (`shelfHref(query)`) is canonical, so they cannot differ.
  - `[low]` `[patch]` Blind: no test asserts the progress line during load more (AC1) — same as the Verification gap row. Fix: the append case asserts the progressbar and the held rows while the fetch is pending, and no progressbar after.
  - `[low]` `[reject]` Edge: rows skipped when total shrinks between page reads — same root as the Blind offset-shift row.
  - `[low]` `[reject]` Edge: a row `getShelfRows` drops (copy gone between its two reads) keeps `rows.length < total`, so each approach asks for the tail once more — a millisecond race; the extra request is a duplicate that `append` skips, and nothing loops.
  - `[low]` `[reject]` Edge: a `?book=` re-render whose `getShelfRows` throws swaps the list for Load failed — needs a database failure at that moment; Try again recovers.
  - `[low]` `[reject]` Edge: a reload over 1000 rows shrinks the list — same as the Blind cap row.
  - `[low]` `[patch]` Verification gap: `shelfRowsPath` is only exercised with the default query (guards AD-7's one writer of shelf params). Fix: a `shelfQuery.unit.spec.ts` case with a non-default query.
  - `[low]` `[patch]` Verification gap: the provider key is unverified (AD-7: keyed by the query without `book`). Fix: a page case re-rendered with a new `q` (new rows) and then with only `book` (rows kept).
  - `[low]` `[reject]` Verification gap: no test drops a stale load-more answer after a reload — test-only, names a spec rule, not an AC or spine rule (CLAUDE.md test convention).
  - `[low]` `[reject]` Verification gap: the reload's `SHELF_MAX_ROWS` cap is untested — test-only, names a spec rule, not an AC or spine rule.
  - `[low]` `[patch]` Verification gap: the progress line during load more is unasserted (AC1) — same fix as the Blind row.
  - `[false]` `[reject]` Intent: `afterAction` has no caller — the epic gives the collection's actions to 5.18–5.30; this story delivers the reload rule they use, with the toast Undo live now.
  - `[false]` `[reject]` Intent: every successful Undo reloads, not only one "that can change rows" — an extra reload of rows already shown changes nothing on screen.
  - `[false]` `[reject]` Intent: a same-key server render's rows are ignored (reading R4) — same as the Blind `initial` row; a return from another route remounts and gets a fresh first page.
  - `[false]` `[reject]` Intent: built despite `oversized` — same as the Blind row.
  - `[false]` `[reject]` Intent: "progress line" and "stays usable" asserted by no test — duplicate of the progress-line rows, patched there; counted false here as a duplicate claim.

## Design Notes

The state sits in a provider rather than inside the list, so later siblings on the page (Book detail in 5.18, the select bar in 5.27) can call `afterAction` without a second copy of the rows. Keying the provider by `shelfHref(query)` resets it on a new query, while a `?book=` change keeps the held rows.

A reload asks for at most `SHELF_MAX_ROWS` in one request. A list holding more than that (over 1000 rows scrolled) comes back shorter and keeps loading from there. 5.12 reuses the same cap.

```ts
shelfRowsPath({ q: 'linna', filters: {}, sort: 'title', dir: 'asc' }, { offset: 50, limit: 50 })
// → '/data/shelf?q=linna&sort=title&offset=50&limit=50'
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including the two new files

**Manual checks (if no CLI):**
- `npm run dev` with more than 50 copies: scrolling down loads the next 50 with the progress line; the count stays right after an Undo of a save.

## Auto Run Result

**Summary:** The collection now scrolls endlessly.
- **`/data/shelf`** (inside `runRoute`) answers `getShelfRows` for a range. It checks `offset` ≥ 0 and `limit` 1–1000 (`SHELF_MAX_ROWS`), and anything else is `VALIDATION`.
- **Rows on the client:** the count line, the empty states and the rows moved into the client list. Its rows live in `ShelfRowsProvider`, which the page keys by the query without `book` and seeds with the server's first page.
- **Loading more:** when a sentinel comes within a screen of view, the next 50 rows load with the progress line. Copies already held are skipped.
- **Reloads:** a successful Undo from the toast (new `ToastProvider.onUndone`) and `afterAction(ok)` reload rows 0..n, capped at 1000. `afterAction(NOT_FOUND)` shows "Not in library", then reloads. Any other code is reported. Stale answers are dropped.
- **Requests** are built by `shelfRowsPath`, which shares `shelfSearchParams` with `shelfHref`.

**Files changed:**
- `src/lib/shelf/query.ts`: `SHELF_MAX_ROWS`, `shelfSearchParams` (pulled out of `shelfHref`), `shelfRowsPath`.
- `src/app/(frontend)/data/shelf/route.ts`: new route handler with range validation.
- `src/app/(frontend)/(sections)/ShelfRows.tsx`: new provider and `useShelfRows()`, holding the rows and handling load more, reload and `afterAction`.
- `src/app/(frontend)/(sections)/CollectionList.tsx`: new client list (count line, states, rows, sentinel, progress line).
- `src/app/(frontend)/(sections)/page.tsx`: renders the keyed provider and the list.
- `src/app/(frontend)/components/toast/ToastProvider.tsx`: `onUndone(listener)`.
- `ARCHITECTURE-SPINE.md`: the AD-7 client-list bullet (provider, `afterAction`, `onUndone`, cap), the shelf-params bullet, the `/data/shelf` routes row and the source tree line.
- Tests: new `tests/unit/shelfRoute.unit.spec.ts` and `tests/unit/collectionList.unit.spec.ts`; a new case in `tests/unit/shelfQuery.unit.spec.ts`; `tests/unit/collectionPage.unit.spec.ts` has stubs and a key case.
- `sprint-status.yaml`: 5.11 `done`.

**Review findings:** 24 (medium 1, low 16, false 7).
- **Patched (4 entries):**
  - the AD-7 contracts in the spine (medium);
  - the progress line asserted during load more (low; Blind, Verification gap);
  - `shelfRowsPath` with a non-default query (low);
  - the provider key across a query change and a `book`-only change (low).
- **Deferred:** none.
- **Rejected (low):**
  - live-region re-insertion on a new query;
  - no inline Try again for a failed load more or reload;
  - the reload cap over 1000 rows (×2);
  - offset shift from changes on another device (×2);
  - a newer `initial` ignored under the same key;
  - the duplicated `whole()`;
  - a dropped-row tail request;
  - Load failed on a `?book=` re-render;
  - stale-answer and cap tests: test-only, naming no AC or spine rule.
- **Rejected (false):**
  - `oversized` (×2): dismissed in 4.15;
  - `afterAction` unreachable and the query passed twice;
  - `afterAction` with no caller: by the epic's split;
  - the reload on every Undo: harmless;
  - a same-key render (R4);
  - the duplicate progress-line claim.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 1, low 3.

**Verification:**
- Before the patches, I added two matrix tests, Load failed and Signed out, and stabilised the test router mock.
- `npm run typecheck`: passes.
- `eslint` on the touched files: clean.
- `prettier --check`: clean.
- `npm run test:unit`: 56 files, 795 tests pass.
- Every I/O matrix row is covered by a passing test.
- Not done: the manual browser check with more than 50 copies.

**Residual risks:**
- **Load failed:** EXPERIENCE.md's "Load failed | Any list" asks for "Couldn't load. Try again." with a retry Link. A failed load more or reload here gives an error toast instead. Load more retries only when the sentinel comes back into view, and a failed reload after Undo has no retry. Mika decides whether a load more counts as "a list" there.
- **Screen readers:** the count line's live region is re-inserted on each new query (the keyed remount), so the new count may not be announced.
- **Over 1000 rows:** a reload brings the list back to 1000 rows and the place is lost.
- **Changes on another device:** a copy removed elsewhere during scrolling can shift the offset and skip a row until the next reload.
- **Baseline:** `baseline_revision` moved from `af671eb` to `e606558`, because Mika's unrelated commit `e606558` (shelf SQL plan fix) landed on `main` mid-run.
