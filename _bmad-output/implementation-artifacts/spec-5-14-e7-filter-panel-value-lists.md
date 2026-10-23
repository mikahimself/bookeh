---
title: '5.14 [E7] Filter panel: value lists'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: 'a7c269486ac86ca46b4427a8780d526e8ed1dc62'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      At the rebase onto main, wire the 900–1199px exclusion to 5.18's Book detail instead of the bare `?book=` placeholder.
    evidence: |-
      Book detail (8999444) and covers layout (d2ed787) landed on main after this worktree's baseline a7c2694. Opening Filter currently replaces the address without `book`; 5.18 may have its own close (history back), which would avoid two adjacent entries with one address.
    location: >-
      src/app/(frontend)/(sections)/FilterPanel.tsx
    severity: medium
  - summary: >-
      Check whether main's BookDetailSheet (5.18) uses useCloseOnBack while `?book=` changes under it, now that same-pathname replaces keep overlay tokens and a close replaces to the latest address.
    evidence: |-
      At the baseline every overlay is modal and navigates only in onClosed, so no same-pathname replace happens under an open overlay except the Filter sheet. 5.18's sheet is not in this tree. Settle by reading BookDetailSheet after the rebase and closing it after a Book swap.
    location: >-
      src/app/(frontend)/components/navigation.ts
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Filter in the collection's tools row is disabled, so Mika can only narrow the list by typing a search or editing the URL (FR-25, UX-DR41, UX-DR33).

**Approach:** Enable Filter as a toggle for a Filter panel: an aside left of the list from 900px, the `Sheet` wrapper below. It shows location, status, read, genre and language as option lists of the values in use (`filterValues()`, extended with read counts) and writes each tap to the address with `shelfHref`, replacing. Languages get display names, in the panel and on the count line.

## Boundaries & Constraints

**Always:**
- Fields in order: Location, Status, Read, Genre, Language. A field with no values in use is not rendered (a user with no locations sees no Location field). Each value: one line in `body`, a 44px tap target, its copy count after the name in `text-muted`. An active value is `text` with the 8px accent marker (`markerSlotClass` in `components/ui/classes.ts`); others `text-muted`. A `button` with `aria-pressed`.
- A tap applies at once: `router.replace(shelfHref(next, { book }), { scroll: false })`, keeping search, sort, direction, the other fields and `book`. Values in a field are OR (tap adds or removes the id/value; removing the last one drops the field), fields are AND (already done by `lib/shelf`). `read` is single-valued in `ShelfQuery`: tapping Read or Unread sets it, tapping the active one clears it, tapping the other switches.
- `filterValues()` gains `read: Counted<{ value: boolean }>[]`: copies of read Books (`ub.read is true`) then unread (`ub.read is not true`, a missing row counts unread), only values in use, never narrowed by the query. The spine's `FilterValues` type and the `filterValues()` bullet change in the same commit.
- The page reads `filterValues(ctx, await getLocale())`, so genres are in the interface language; a failed read leaves the panel without lists rather than failing the page.
- Language names: a pure `languageName(code, locale)` via `Intl.DisplayNames` (`type: 'language'`), the raw value when it cannot be named or throws. Used by the panel and by `activeValues` on the count line.
- Wide panel: plain layout, no shadow, no border, separated from the list by space; width a named variable in `styles.css` (`filter-width` 220px, from the mock-up). Filter has `aria-expanded`; tapping it again closes. Phone: `Sheet` with a heading, its own Back/X/scrim handling.
- 900–1199px: opening Filter while `?book=` is set replaces the address without `book`; `book` appearing (or changing) while Filter is open closes Filter. From 1200px both may be open; under 900px Filter is a modal sheet anyway.
- Overlay history (spine, Navigation and history): a replace that keeps the pathname keeps the open overlays' tokens (`keepOverlayTokens`), and an overlay whose address changed while open lands on its latest address when it closes (X, scrim or Back), so Back on the Filter sheet closes it and keeps the filters. Done inside `navigation.ts` / `useCloseOnBack`, not in the panel.

**Never:**
- No Apply button, no sort, author/series/publisher, theme, tag, rating or range controls (5.15–5.17, Epic 9).
- No change to `lib/shelf` filtering, `query.ts`'s param format, `/data/shelf` or `ShelfRowsProvider`.
- No new client fetch: values come from the server render and refresh with it.
- Filter's open state is not in the URL and not a device preference.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add OR value | location [3], tap location 5 | location [3, 5], list and count line update | — |
| Remove last | status [owned], tap owned | `status` gone from the address | — |
| Read switch | read true, tap Unread | read false | — |
| Clear read | read false, tap Unread | `read` gone | — |
| Unknown language | value `Finnish` (hand-typed) | shown as `Finnish` | `Intl` error caught |
| Phone Back | sheet open, two taps made | sheet closes, both filters stay, one Back more leaves the filtered list as before opening | — |

</intent-contract>

## Code Map

- `(sections)/CollectionTools.tsx` -- Filter `ActionLink` is `disabled`. `(sections)/page.tsx` -- server page, add the read and the split (`wide:flex`, list `min-w-0 flex-1`).
- `(sections)/countLine.ts` -- `activeValues` lists `f.language` raw; `CollectionList.tsx` calls it (`useLocale()`).
- `src/lib/shelf/filterValues.ts` -- `grouped()` already left-joins `user_books ub`. `query.ts:62` -- `FilterValues`.
- `src/lib/books/genreName.ts` -- pattern for `languageName.ts`. `lib/metadata/sources/shared.ts:34` -- stored languages are ISO 639-1 where one exists; overrides may be free text.
- `components/ui/Sheet.tsx`; `components/ui/overlay.tsx:85` `useCloseOnBack`, `:135` `useWide()`; `components/navigation.ts:57` `keepOverlayTokens` drops tokens on any URL change today.
- `books/[bookId]/edit/MoreDetails.tsx:238` -- marker usage to copy.
- `(sections)/SearchField.tsx` -- treats a filter replace as outside navigation (puts `q` back); leave it.
- `tests/int/shelfValues.int.spec.ts:107` -- `toEqual` on the whole `FilterValues`.
- Spine `ARCHITECTURE-SPINE.md:149,301,501` -- `filterValues` bullet, Navigation and history row, `FilterValues` type.

Paths starting `(sections)/`, `components/`, `books/` are under `src/app/(frontend)/`.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/query.ts`, `src/lib/shelf/filterValues.ts` -- add `read` to `FilterValues` and its grouped query -- read counts for the panel.
- `src/lib/books/languageName.ts` -- `languageName(code, locale)` -- one naming for panel and count line.
- `src/app/(frontend)/(sections)/filterToggle.ts` -- pure `toggleFilter(query, field, value)` for the five fields per the matrix -- testable tap logic.
- `src/app/(frontend)/(sections)/FilterPanel.tsx` -- client: `FilterPanelProvider` (open state, the 900–1199px exclusion against `book` from `useSearchParams`), `useFilterPanel()`, and `FilterPanel` (aside on wide, `Sheet` on phone, option lists) -- the panel.
- `src/app/(frontend)/(sections)/CollectionTools.tsx`, `page.tsx` -- wire Filter and the layout -- entry point.
- `src/app/(frontend)/(sections)/countLine.ts`, `CollectionList.tsx` -- language names on the count line.
- `src/app/(frontend)/components/navigation.ts`, `components/ui/overlay.tsx` -- same-pathname replace keeps tokens; closing returns to the overlay's latest address -- Back on the phone sheet keeps filters.
- `src/app/(frontend)/styles.css` -- `--spacing-filter-width: 220px`.
- `messages/en.json`, `messages/fi.json` -- strings.
- `tests/int/shelfValues.int.spec.ts` -- read counts (a read Book, an unread one, a copy with no `user-books` row).
- `tests/unit/filterToggle.unit.spec.ts` -- the matrix's OR/remove/read rows, and `languageName` naming `fi` and passing `Finnish` through.
- `tests/unit/overlay.unit.spec.ts` -- sheet open, a same-path replace, then Back: sheet closed, address is the replaced one.
- `tests/unit/filterPanel.unit.spec.ts` -- at 1000px, opening Filter with `?book=` replaces without `book`; `book` appearing closes Filter (`matchMedia` stubbed).
- `ARCHITECTURE-SPINE.md` -- `FilterValues.read`, the `filterValues()` bullet, the Navigation and history row.

**Acceptance Criteria:**
- Given the collection on a wide screen, when Mika taps Filter, then the panel opens left of the list separated by space, with option lists of values in use and counts, and Filter again closes it.
- Given a phone, when Mika taps Filter, then the panel opens as a bottom sheet and taps update the list behind it at once.
- Given active values, when the list renders, then the count line lists them (languages by name) with the count and Clear, and Clear switches every marker off.
- Given 900–1199px with Book detail open (`?book=`), when Mika opens Filter, then Book detail closes; and the other way round.
- Given the spine, when the story is committed, then `FilterValues`, the `filterValues()` bullet and the Navigation and history row match the code.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 36 findings — high 3, medium 4, low 26, false 2, maybe-false 1
- findings:
  - `[high]` `[patch]` Blind: Clear (or Back) to the address a tap was made on re-reads the stale tap, so markers stay on after Clear — `OptionLists` now keeps the addresses of pending taps and drops them once the address reaches the last tap or goes elsewhere; new `filterPanel` case "switches the marker off after Clear".
  - `[low]` `[patch]` Blind: languages listed in code order, not by shown name; `fi`/`fin` could repeat — the panel now sorts languages by `languageName` with `Intl.Collator(locale)`. Duplicates: sources store ISO 639-1 (`isoLanguage`), so only hand overrides could split a name.
  - `[low]` `[reject]` Blind: rotating across 900px with the sheet open orphans its entry and Back then drops filters — rare (tablet rotation mid-filter); a fix needs unmount-time history handling, more than a direct correction.
  - `[low]` `[reject]` Blind: closing the phone sheet after taps briefly renders the pre-filter list (pop, then replace) — real and seen in the implementer's browser run; final state is right, and avoiding it needs a different history design. Listed under residual risks for Mika.
  - `[low]` `[reject]` Blind: `filterValues()` runs on every collection render, panel closed or not — runs in parallel with the shelf read (`Promise.all`), so no added latency a user meets; lazy loading would add a route.
  - `[low]` `[reject]` Blind: an active value no longer in use has no line, so it can't be switched off in the panel — needs a deleted location id or hand-made URL; Clear on the count line still removes it; merging values adds branches.
  - `[low]` `[reject]` Blind: no empty or error state in the panel — only on a failed read (logged) or with no copies at all; adds UI the spec did not ask for.
  - `[low]` `[reject]` Blind: resizing into 900–1199px with both panels open keeps both — the criterion is about opening; window resizing across 1200px with both open is unlikely, and picking which closes adds a branch.
  - `[low]` `[reject]` Blind: `filterValues.*` strings duplicate `statuses.*`/`read`/`unread` in another case — sharing them needs case handling in CSS for the count line; small translation upkeep.
  - `[low]` `[reject]` Blind: spec marked `oversized` but not split — fix is to edit/split this build's spec; recent epic-5 specs (5.10–5.12) carried the same warning.
  - `[medium]` `[patch]` Blind: the X/scrim close path that lands on the latest address has no test (spine Navigation and history row) — added overlay case "lands on the address a same-path replace moved it to when the X closes it".
  - `[low]` `[reject]` Blind: `languageName` builds an `Intl.DisplayNames` per call — a handful of calls per render; negligible.
  - `[low]` `[reject]` Blind: `ONE_PANEL_QUERY` hard-codes 900px apart from `WIDE_QUERY` — both sit next to each other in code with the same value; no divergence today.
  - `[low]` `[reject]` Blind: Filter lacks `aria-controls` / `aria-haspopup` — `aria-expanded` plus the Sheet's own dialog role cover it; extra ARIA not required by the accessibility floor.
  - `[low]` `[patch]` Blind: unwrapped JSDoc line in `installNavigationTracking` — rewrapped.
  - `[high]` `[patch]` Edge: Clear back to `written.on` shows cleared values on (same root cause as the Blind Clear finding) — fixed by the pending-taps change.
  - `[medium]` `[patch]` Edge: tap 1 committing while tap 2 is pending made tap 3 build on the intermediate address (same root cause: `written` state) — pending taps now stay the base until the address reaches the last one.
  - `[low]` `[reject]` Edge: resize into 900–1199px with both open — as the Blind resize row.
  - `[low]` `[reject]` Edge: opening Filter at 900–1199px replaces Book detail's pushed entry, leaving two entries with one address — one extra Back with no change; the spec chose a replace because Book detail was not built at the baseline. Revisit at the rebase onto 5.18 (see deferred).
  - `[low]` `[reject]` Edge: closing the sheet while a tap's replace is still pending loses that tap — needs a close within the render of a tap; the lost value is visible and re-tappable; a fix needs the panel to feed the wrapper.
  - `[low]` `[reject]` Edge: phone-to-wide resize with the sheet open orphans the entry — as the Blind rotation row.
  - `[low]` `[reject]` Edge: an active value not in use can't be untoggled — as the Blind row.
  - `[maybe-false]` `[defer]` Edge: a same-pathname replace under some other open overlay (Book swap, Scan answer) now carries tokens and the close replaces to it — at the baseline every such overlay is modal and navigates only in `onClosed`, after its entry is gone; main's 5.18 `BookDetailSheet` is not in this tree. Settle at the rebase by checking whether it uses `useCloseOnBack` while `?book=` swaps.
  - `[false]` `[reject]` Edge: `leftAddress()` stale when an overlay registers its `popstate` listener before the tracker — the tracker's listener is added once at install in the root layout; an overlay adds its listener when it opens, later, so the tracker runs first. No overlay here is open on first mount.
  - `[low]` `[patch]` Edge: languages ordered by code — as the Blind language row.
  - `[high]` `[patch]` Edge (claim): "Clear switches every marker off" broken — as the Blind Clear row.
  - `[low]` `[reject]` Edge (claim): exclusion not run on resize — as the Blind resize row.
  - `[medium]` `[patch]` Verification gap: the X/scrim close after a same-path replace is not tested (a mutation went unnoticed) — the new overlay X case covers it (same as the Blind test row).
  - `[low]` `[patch]` Verification gap: the count line naming languages (criterion) is untested — `language: ['fi']` → `Finnish` added to the first `activeValues` case.
  - `[low]` `[patch]` Verification gap: the option tap's write path (keeps `q` and `book`, `scroll: false`) is tested only at `toggleFilter` — added `filterPanel` case "replaces the address at once, keeping search and the open Book".
  - `[low]` `[reject]` Verification gap: a failed `filterValues()` read is untested — test-only finding naming no criterion or spine rule (CLAUDE.md tests convention).
  - `[low]` `[reject]` Verification gap (other): flash of the unfiltered list on close — as the Blind flash row.
  - `[medium]` `[defer]` Intent: the 900–1199px exclusion was built against `?book=` because Book detail was missing at the baseline; main now has 5.18 (`8999444`) — handled at the rebase.
  - `[low]` `[reject]` Intent: nine files also changed on main (5.13, 5.18) — merge conflicts to resolve at rebase, not a defect in this diff.
  - `[low]` `[reject]` Intent: tests exercise helpers, the DB query and history mechanics rather than the UI flow — matches the project's functional-minimum test rule; Playwright is only for scan-to-save and shop check.
  - `[false]` `[reject]` Intent: the story is not committed and sprint-status not updated — finalisation commits both in this run.

## Design Notes

Closing Book detail from Filter is a replace without `book`, not history back: Book detail is not built yet (5.18/5.19), and a replace cannot leave the collection. 5.19 may swap in its own close.

Phone history, wanted shape: `[list A] → open sheet [A][A+token] → tap [A][B+token] → Back [B]`. Today the tap's replace drops the token and Back lands on A, undoing the filters.

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean.
- `npm run test:unit` -- expected: pass.
- `npm run test:int` -- expected: pass (`shelfValues` with read counts).

**Manual checks (if no CLI):**
- `next dev`: wide (1300px) panel left, list narrows; 1000px Filter closes `?book=`; phone width sheet opens half, taps update list, Back closes and keeps filters.

## Auto Run Result

Status: done

**Summary:** Filter in the collection's tools row now opens the Filter panel: a 220px aside left of the list from 900px, the bottom sheet below. Location, status, read, genre and language are option lists of the values in use with counts. A tap applies at once by replacing the address, OR within a field and AND across fields. Languages carry display names in the panel and on the count line. At 900–1199px, Filter and `?book=` exclude each other. On the phone, a same-pathname replace now keeps the overlay's history token, and closing the sheet lands on the latest address, so Back keeps the filters.

**Files changed:**
- `src/lib/shelf/filterValues.ts`, `src/lib/shelf/query.ts` — `FilterValues.read` counts (a missing `user-books` row counts as unread).
- `src/lib/books/languageName.ts` — `Intl.DisplayNames` naming, raw value as fallback.
- `src/app/(frontend)/(sections)/FilterPanel.tsx` — provider (open state, 900–1199px exclusion), wide aside / phone sheet, option lists, pending-tap tracking.
- `src/app/(frontend)/(sections)/filterToggle.ts` — pure tap logic.
- `src/app/(frontend)/(sections)/CollectionTools.tsx`, `page.tsx`, `CollectionList.tsx`, `countLine.ts` — wiring, `filterValues` read, language names on the count line.
- `src/app/(frontend)/components/navigation.ts`, `components/ui/overlay.tsx` — same-pathname token carry-over; a close lands on the latest address.
- `src/app/(frontend)/styles.css` — `--spacing-filter-width`.
- `messages/en.json`, `messages/fi.json` — field headings and values.
- `eslint.config.mjs` and the spine's Design Paradigm bullet — `lib/books/languageName` allowed in client components (not in the spec; needed by its design).
- `ARCHITECTURE-SPINE.md` — `FilterValues`, the `filterValues()` bullet, the Navigation and history row.
- Tests: `filterToggle`, `filterPanel` (new); `overlay`, `collectionCountLine`, `shelfValues` (int) extended; mock-only updates in `picker`, `cornerCrop`, `collectionList`, `collectionPage`.

**Review findings:** 36 findings. 8 rows patched, 4 of them root causes:
- Clear/stale pending taps (high).
- X-close test gap (medium).
- Language order (low).
- JSDoc wrap (low).
- Plus two test additions named by criteria (low).

2 were deferred (both for the rebase onto 5.18). 26 were rejected, each with its reason in the triage log.

**Follow-up review:** recommended (`true`). A high entry was patched. The pending-tap logic in `OptionLists` is verified only in jsdom, and how it behaves under Next's real superseded replaces is unverified.

**Verification:**
- `npm run typecheck` clean.
- `npm run lint` 0 errors (40 warnings, all pre-existing).
- `npm run test:unit` 821 passed.
- `npm run test:int` 503 passed.
- The implementer ran a throwaway Playwright check at 1300, 1000 and 390px before review; it was not repeated after the patches.

**Residual risks:**
- Closing the phone sheet after taps briefly shows the unfiltered list.
- The count line sits in the list column, beside the panel, not above it as in the mock-up.
- Main moved to 8999444 (5.13, 5.18), so this branch needs a rebase. Expect conflicts in `page.tsx`, `CollectionTools.tsx`, `CollectionList.tsx`, `navigation.ts`, `styles.css`, messages and two unit specs.
- The exclusion should be re-pointed at Book detail (see deferred).

**Rebase onto 8999444 (5.13, 5.18):**
- Conflicts in `sprint-status.yaml`, `CollectionTools.tsx` and `page.tsx`. Both stories' changes were kept: the Filter panel sits inside 5.13's `CollectionDisplayProvider`, and 5.18's `BookDetail` follows the list.
- Both deferred items are settled:
  - Opening Filter at 900–1199px now closes Book detail with 5.18's own close, `useTaskBack(shelfHref(query), true)`. That is history back to the list entry, or a replace without `book` when there is none.
  - 5.18's `BookDetailSheet` is `addressed` and does not use `useCloseOnBack`, so carrying tokens across a same-pathname replace does not touch it.
- Until 5.19, Book detail is a modal sheet at every width, so in practice only "a Book opening closes Filter" can happen.
