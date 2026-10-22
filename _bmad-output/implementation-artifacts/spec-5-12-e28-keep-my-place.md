---
title: '5.12 [E28] Keep my place'
type: 'feature'
created: '2026-10-22'
baseline_revision: '83baffac82810b5d148c635e3c65db4bc7c039e2'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Restore after a history Back (X on Scan or Edit book) is unverified in a real browser against the browser's own 'auto' scroll restoration and Next's scroll handling.
    evidence: |-
      Per the HTML spec, a same-document traversal restores scroll once, before popstate, and Next renders the page afterwards in a transition, so the passive-effect scrollTo should land last. Only jsdom tests ran. To settle: with more than 50 copies, scroll past row 100, open Scan, close with X, and check the rows and the position; repeat from Edit book.
    location: >-
      src/app/(frontend)/(sections)/ShelfRows.tsx
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Leaving `/` for Scan or Edit book and coming back remounts the page with the server's first 50 rows at the top. The rows loaded beyond those 50 and the scroll position are lost, so cataloguing and browsing fight each other (AD-7).

**Approach:** Per shelf query, the client list keeps `{ rows, scrollY }` in `sessionStorage`. When `/` mounts again after another route, it loads that many rows in one `/data/shelf` request (at most `SHELF_MAX_ROWS`) and scrolls back. A search, filter or sort change while on `/` still starts at the top.

## Boundaries & Constraints

**Always:**
- Entry key: `bookeh:shelf-place:${shelfHref(query)}` (the query without `book`). Value: JSON `{ rows, scrollY }`, whole numbers ≥ 0. Never row data, ids, titles or labels.
- Reads and writes are wrapped in try/catch, as `edit/draft.ts` does. With storage blocked, or an entry that is malformed or out of range, nothing is restored and the list works as in 5.11.
- **Saving:** while the provider is mounted, the entry tracks `rows = rows held` and `scrollY = window.scrollY`. It is written when rows change and on window `scroll`, at most once per animation frame. The scroll listener is removed in a layout-effect cleanup, so the scroll when you leave (clamped, or Next's scroll to top) is never recorded. Nothing is saved while a restore is pending.
- **Restore** happens only for the first provider mounted since the page mounted, and only if an entry exists for its key. A remount after a search, filter or sort change while on `/` never restores. (Next's layout router keeps page state across search-param changes, and remounts the page after another route.)
  - If `entry.rows > initial.rows.length` and `initial.rows.length < initial.total`: one reload request, `offset 0`, `limit = min(entry.rows, SHELF_MAX_ROWS)`, which replaces the rows, total and labels. After the new rows commit, `window.scrollTo(0, entry.scrollY)`.
  - Otherwise: no request. `window.scrollTo(0, entry.scrollY)` runs in a passive effect after mount, so it runs after Next's own scroll handling.
  - A failed restore request goes to `reportFailure`. The initial rows stay, the page does not scroll, and saving resumes.
  - Like any reload, the restore request is made stale by a later reload (Undo, `afterAction`).
- `ShelfRowsProvider` keeps its public props `{ query, initial, children }` and `useShelfRows()` its shape. The key by `shelfHref(query)` moves from `page.tsx` into the provider: an unkeyed outer component renders the keyed state component.

**Never:**
- No row data, labels or totals in storage, and no `localStorage`.
- No change to `/data/shelf`, `lib/shelf`, `BookRow`, `SearchField` or `CollectionList`'s markup.
- No restore after an in-place query change. No page number or offset in the URL.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Return, more held | entry `{ rows: 120, scrollY: 4000 }`, initial 50 of 300 | `GET /data/shelf?offset=0&limit=120`, 120 rows, then `scrollTo(0, 4000)` | — |
| Return, within first page | entry `{ rows: 30, scrollY: 900 }`, initial 50 of 300 | no request; `scrollTo(0, 900)` | — |
| Over the cap | entry `{ rows: 1500, … }` | `limit=1000` | — |
| No entry | first visit to this query | no request, no scroll | — |
| Bad entry | `"x"`, `{ rows: -1 }`, blocked storage | as no entry | try/catch |
| In-place change | provider remounts for a new `q` while an entry exists for it | no restore | — |
| Restore failed | `NO_CONNECTION` | error toast; initial rows; no scroll | `reportFailure` |
| Saving | 100 rows held, scrolled to 2500 | entry for the key is `{"rows":100,"scrollY":2500}` | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/ShelfRows.tsx` -- `ShelfRowsProvider` today holds the state; `run(range, replace)` (~line 95) does requests, staleness (`requests.current`) and `held`; `reload` (~line 124) is the limit pattern. Rename the stateful body to an internal `ShelfRowsState` with a `restore: boolean` prop. The new exported `ShelfRowsProvider` is unkeyed and renders `<ShelfRowsState key={shelfHref(query)} restore={…}>`. `restore` is true only while the key equals the first key it rendered with and no other key has rendered: derived state via `useState`, no ref mutation during render. Have `run` resolve to whether its answer was applied, so the restore can scroll only on success.
- `src/app/(frontend)/(sections)/shelfPlace.ts` -- new pure module: `readPlace(key)` and `writePlace(key, place)`, following `books/[bookId]/edit/draft.ts` (try/catch, a `bookeh:` key prefix, malformed entries ignored).
- `src/app/(frontend)/(sections)/page.tsx:41` -- drop `key={shelfHref(query)}` and the `shelfHref` import; the provider keys itself.
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- read-only; the sentinel's `loadMore` keeps working after a restore (rows held ≥ entry rows).
- `src/app/(frontend)/(sections)/layout.tsx` -- the document scrolls (no inner scroll container), so `window.scrollY` / `window.scrollTo`.
- `node_modules/next/dist/client/components/layout-router.js:~555` -- evidence: `activeStateKey = createRouterCacheKey(segment, true)` leaves out search params, so page client state survives `?q=` changes. `cacheComponents` is off in `next.config.ts`, so `/` remounts after another route.
- `tests/unit/collectionList.unit.spec.ts` -- the harness (stubbed `fetch`, `IntersectionObserver`, `ToastProvider`, `mount(initial)`, `answerWith`) to extend. jsdom has `sessionStorage`; stub `window.scrollTo` with `vi.fn`, and set `window.scrollY` with `Object.defineProperty`.
- `tests/unit/collectionPage.unit.spec.ts:126` -- the key case (new `q` resets, `book` only keeps). It must stay green with the key moved into the provider.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:147` -- the AD-7 client-list bullet already states the rule. Add the cap (`SHELF_MAX_ROWS`) and that a query change on `/` does not restore.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/shelfPlace.ts` -- `Place = { rows: number; scrollY: number }`, `readPlace`, `writePlace`, entry key from `shelfHref(query)` -- the only storage touchpoint, never row data.
- `src/app/(frontend)/(sections)/ShelfRows.tsx` -- outer unkeyed `ShelfRowsProvider`, inner keyed `ShelfRowsState` with saving (rAF-throttled scroll listener in `useLayoutEffect`, plus writes on rows change) and the mount restore described above. Update the doc comment -- AD-7 "keep my place".
- `src/app/(frontend)/(sections)/page.tsx` -- remove the key and the unused import.
- `ARCHITECTURE-SPINE.md` AD-7 client-list bullet -- name the cap and the no-restore-on-query-change rule.
- `tests/unit/collectionList.unit.spec.ts` -- one case per I/O matrix row (rows may share a case where natural, e.g. No entry and Bad entry): return with more held (one request with `limit` = entry rows, then `scrollTo`); return within the first page (no request, `scrollTo`); over the cap (`limit=1000`); no entry / bad entry (no request, no scroll); in-place change (no restore for a provider remounted with a new query); restore failed (error toast, initial rows, no scroll); saving (the entry holds rows held and `scrollY`, nothing but those two keys).

**Acceptance Criteria:**
- Given a shelf query whose list held 120 rows scrolled to 4000px, when I go to Scan or Edit book and come back to `/` with the same query, then the list asks `/data/shelf` once for rows 0–119 and restores the scroll position.
- Given a held count over 1000, when I return, then the one request asks for 1000 rows.
- Given the collection open, when I scroll or more rows load, then `sessionStorage` holds, under the query's key without `book`, only the row count and the scroll position.
- Given a place stored for a query, when I reach that query by changing search, filter or sort on `/`, then the list starts at the top with the first page.
- Given the spine's AD-7, when this story lands, then the client-list bullet names the cap and the query-change rule.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 23 findings — high 0, medium 0, low 13, false 8, maybe-false 2
- findings:
  - `[false]` `[reject]` Blind: built despite `oversized` — Mika dismissed the `oversized` trigger in Story 4.15 (Epic 4 retro, P4), as in 5.10 and 5.11.
  - `[maybe-false]` `[defer]` Blind: the main way back is history traversal (`useCloseTask` / `router.back()`), and the browser's `'auto'` scroll restore may compete with the restore's `scrollTo` — per the HTML spec, a same-document traversal restores scroll once, before `popstate`, and Next renders the page afterwards in a transition, so the passive-effect `scrollTo` should land last. This has not been run in a browser. To settle it: scroll past row 100, open Scan, close with X, and check the position. Deferred as medium (unverified).
  - `[low]` `[reject]` Blind: the "starts at the top" AC is not literally met, because an in-place query change keeps the window's (clamped) offset. `SearchField` and Clear use `scroll: false` by the epic's settled convention ("Overlay and search navigation use `scroll: false`"). The search field sits in the tools row at the top, and the `/` shortcut focuses it into view, so everyday searches start near the top. Forcing `scrollTo(0, 0)` would override that convention. No restore happens, which the AC was written to guard.
  - `[low]` `[reject]` Blind: one `sessionStorage` entry per query reached, never pruned — about 40 bytes each, so quota needs tens of thousands of queries in one tab; the fix adds a branch or a pruning pass.
  - `[false]` `[reject]` Blind: a reload or same-tab direct entry restores too — no bad outcome: the browser itself restores scroll on reload, and the AC's "leave the collection and return" covers it.
  - `[low]` `[reject]` Blind: a pixel `scrollY` drifts after a reflow (rotation, text size, the wide panel) — the AC asks for the scroll position; row anchoring is a redesign; rows at one size have fixed heights.
  - `[low]` `[reject]` Blind: a slow restore jumps the page after the user starts scrolling — the request for at most 1000 rows over the tailnet is short; cancelling on user input adds listeners and branches.
  - `[false]` `[reject]` Blind: `key === first` in `restore={!moved && key === first}` is redundant — it changes no committed result and harms nothing; it states the rule at the call site.
  - `[false]` `[reject]` Blind: the `shelfPlace.ts` header cites a spine rule the spine does not state — AD-7 states the rule (per shelf query, only the row count and scroll position in `sessionStorage`); the key string is an implementation detail.
  - `[low]` `[reject]` Blind: `vi.restoreAllMocks()` in the shared teardown would undo a future module-level spy — there is no such spy today; this is speculative harm.
  - `[low]` `[reject]` Edge: an Undo or `afterAction` reload during the restore makes the restore stale, so the place is lost — this needs an Undo tapped in the few hundred ms after returning; the fix adds a branch to `reload`.
  - `[low]` `[reject]` Edge: the scroll-only branch clamps when the document is shorter than `scrollY`, and the mount save stores the clamped value — the first page's rows have fixed heights, so this happens only when copies were removed elsewhere, and then the clamped value is the true place.
  - `[low]` `[reject]` Edge: an rAF frame pending at unmount drops the last ≤16 ms of scroll — negligible.
  - `[low]` `[reject]` Edge: a query change made while scrolled keeps the old offset (no `scrollTo(0, 0)`) — same root as the Blind "starts at the top" row.
  - `[low]` `[patch]` Verification gap: the `moved` latch is unverified; A→B→A on `/` would restore with `restore={key === first}` and every test would still pass (guards AC 4). Fix: the in-place case goes kivi → linna → kivi with a place stored for kivi, and expects no fetch and no scroll.
  - `[low]` `[reject]` Verification gap: "saving resumes" after a restore (success and failure) is untested — test-only, and it names a spec Always rule, not an AC or spine rule (CLAUDE.md test convention, as in 5.11).
  - `[low]` `[reject]` Verification gap: "nothing saved while a restore is pending" is untested — same convention; the guard is in place.
  - `[false]` `[reject]` Intent: the restore runs on any return (heading tap, swipe, reload), not only from Scan or Edit book — that is the AC's "leave the collection and return" reading, which the diff implements.
  - `[low]` `[reject]` Intent: a pixel position, not row anchoring, so a book saved on Scan that sorts above the viewport shifts the view by a row — the AC asks for the scroll position; anchoring is a redesign.
  - `[maybe-false]` `[defer]` Intent: the routing-surface behaviour (remount after another route, page kept across search params, effect order against Next's scroll) is tested only in jsdom — same root as the Blind history-traversal row; settled by the same manual check (Playwright is reserved for scan-to-save and shop check).
  - `[false]` `[reject]` Intent: "only the first query the page mounts with restores" goes beyond the AC — it comes from the spine's "on return from another route" and 5.11's "a new search starts over".
  - `[low]` `[reject]` Intent: a return costs the RSC first page plus one `/data/shelf` call, with a brief top-of-list frame before the jump — inherent to `sessionStorage`, which the server cannot read; the AC's "one request" is the client request.
  - `[false]` `[reject]` Intent: built despite `oversized` — duplicate of the Blind row.

## Design Notes

The restore rule lives in an unkeyed outer provider because only it outlives a query change: the keyed inner state remounts for each query, and the whole page remounts after another route. Derived state rather than a "claimed" ref keeps the rule correct under StrictMode's double effects.

```tsx
export function ShelfRowsProvider({ query, initial, children }: Props) {
  const key = shelfHref(query)
  const [first] = useState(key)
  const [moved, setMoved] = useState(false)
  if (key !== first && !moved) setMoved(true)
  return <ShelfRowsState key={key} query={query} initial={initial} restore={!moved && key === first}>{children}</ShelfRowsState>
}
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including the new cases

**Manual checks (if no CLI):**
- `npm run dev` with more than 50 copies: scroll past row 100, open Scan, go back. The rows come back and the position holds. Typing a search afterwards starts at the top.

## Auto Run Result

**Summary:** The collection keeps its place across a trip to Scan or Edit book.
- **Storage:** per shelf query, `sessionStorage` keeps `{ rows, scrollY }` under `bookeh:shelf-place:${shelfHref(query)}` and nothing else. It is written when the rows change and on scroll, at most once per frame, and never while a restore is pending.
- **Restore:** the first query the page mounts with restores. If it held more than the first page, it makes one `/data/shelf` request for `min(rows, SHELF_MAX_ROWS)` rows, then scrolls back. Otherwise it only scrolls. A failed restore is reported and the first page stays.
- **Query changes on `/`** (search, filter, sort) never restore. The provider now keys itself: an unkeyed outer `ShelfRowsProvider` renders the keyed `ShelfRowsState`.

**Files changed:**
- `src/app/(frontend)/(sections)/shelfPlace.ts`: new, `readPlace` / `writePlace` with try/catch and entry validation.
- `src/app/(frontend)/(sections)/ShelfRows.tsx`: the outer provider with the restore rule; saving and restore in `ShelfRowsState`; `run` resolves to whether its answer was applied.
- `src/app/(frontend)/(sections)/page.tsx`: the key moved into the provider.
- `ARCHITECTURE-SPINE.md`: the AD-7 client-list bullet names `SHELF_MAX_ROWS` and the rule that only the first query restores.
- `tests/unit/collectionList.unit.spec.ts`: a `keep my place` block, one case per I/O matrix row.
- `tests/unit/collectionPage.unit.spec.ts`: clears `sessionStorage` between cases.
- `sprint-status.yaml`: 5.12 `done`.

**Review findings:** 23 (low 13, false 8, maybe-false 2).
- **Patched (1 entry, low):** the in-place-change test now goes kivi → linna → kivi, so it guards the `moved` latch. It fails without the latch.
- **Deferred (1 entry, medium, unverified):** the restore on a history Back, against the browser's scroll restoration. This needs a browser check (the Blind and Intent rows).
- **Rejected (low):**
  - "starts at the top" is not literal after an in-place change (×2), because of the settled `scroll: false` convention;
  - entries are not pruned;
  - a pixel position drifts after a reflow, or after a book is added above the viewport (×2);
  - a slow restore jumps the page after the user scrolls;
  - an Undo during the restore loses the place;
  - the clamp in the scroll-only branch;
  - the last frame before leaving is not saved;
  - `restoreAllMocks` in the teardown;
  - two test-only gaps that name spec rules, not ACs (saving resumes, nothing saved while pending);
  - a brief top-of-list frame before the jump.
- **Rejected (false):**
  - `oversized` (×2), dismissed in 4.15;
  - a reload restores;
  - `key === first` is redundant;
  - the `shelfPlace` header's spine reference;
  - the restore runs on any return, which is the AC's reading;
  - the first-query rule comes from the spine and 5.11.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 0, low 1.

**Verification:**
- `npm run typecheck`: passes.
- `eslint` on the touched files: clean.
- `prettier --check`: clean.
- `npm run test:unit`: 56 files, 805 tests pass.
- Every I/O matrix row is covered by a passing test.
- The full `npm run lint` reports 22 errors, all in `.claude/worktrees/story-5-37-last-backup/.next/types/validator.ts`, build output in a leftover worktree that this story does not touch.
- Not done: the manual browser check.

**Residual risks:**
- **History Back:** the restore after closing Scan or Edit book with X is unverified in a browser (deferred).
- **Pixel position:** a book saved on Scan that sorts above the viewport shifts the view by about one row, and a reflow (rotation, text size) moves it too.
- **Brief jump:** a return that needs the restore request first shows the top of the list, then jumps.
- **In-place query change:** keeps the window's offset (the `scroll: false` convention), clamped to the shorter list.

