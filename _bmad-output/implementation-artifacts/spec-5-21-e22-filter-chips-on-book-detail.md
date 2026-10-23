---
title: '5.21 [E22] Filter chips on Book detail'
type: 'feature'
created: '2026-10-23'
baseline_revision: '533de90b11786c03c47dd59fb0ab5507d7d12a46'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Book detail shows author, series and each copy's location as plain text and doesn't show genres at all. "What else do I have by her?" therefore means opening Filter and finding the name (FR-25, UX-DR34).

**Approach:** Make each author, the series, each system genre and each copy's location a Filter chip: a Link that adds its value to the current filters. In the wide panel the chip replaces the address and keeps the open Book. In the phone sheet it closes the sheet the way X does (history back), then replaces the address with the filtered collection.

## Boundaries & Constraints

**Always:**
- Chips add and never toggle. The new query is the current address's query (`useSearchParams()` → `parseShelfQuery`) with the value appended to its field. A second value in the same field widens that field. Search, sort, direction and the other fields stay. A value that is already on leaves the query unchanged.
- Fields and values: `author` (`Named.id`), `series` (`series.id`), `genre` (system genre `Named.id` from `EffectiveBook.genres`), `location` (`CopyLine.location.id`). An ordered copy has no location, so it has no chip.
- The href comes from `shelfHref()` (spine AD-7). Panel: `shelfHref(next, { book })`, `replace`, `scroll={false}`, `prefetch={false}`. Sheet: the href is `shelfHref(next)` without `book`, and the click closes the sheet and then lands there.
- Phone history (spine, Navigation and history: closing is history back, a filter change replaces): with an in-app entry below Book detail, go back once, then once the traversal settles `router.replace(href, { scroll: false })`. Opened directly, replace to the href. Either way, Back afterwards does not reopen the Book or the unfiltered list.
- Styling: the existing `TextLink` (`linkClass`). No outline, no fill, square, tap height from `linkClass`.
- Genres: a group after Your copies with the heading "Genres" / "Lajityypit" (`text-heading-group`). Its chips are separated by " · ". The group is absent when the Book has no system genres. Authors are separated by ", ". On the series line the name is the chip and the number follows as plain text.
- Strings live in `messages/en.json` and `messages/fi.json`.

**Never:**
- No change to `lib/shelf`, `lib/books` or the server reads. Book detail already has everything it needs.
- No toggle-off, no counts, and no chips for publisher, language, year or tags (Epic 9 owns tags and themes; 9.6 extends the Genres group).
- No `/loans` or wishlist-entry behaviour. Neither surface renders Book detail yet. The AC clause "opens the collection with only that filter" from there is recorded for Story 6.9 and the entry-sheet story (Epic 7) in `deferred-work.md`.
- No hand-made history entries and no push for a chip.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Wide, add | `/?genre=2&book=5`, tap author 7 | replace `/?genre=2&author=7&book=5`, panel stays | — |
| Wide, widen | `/?author=3&book=5`, tap author 7 | replace `/?author=3&author=7&book=5` | — |
| Already on | `/?author=7&book=5`, tap author 7 | same address; nothing changes | — |
| Phone, from list | `/` → push `/?book=5`, tap location 4 | sheet slides away, `back()`, after settle `replace('/?location=4', { scroll: false })` | double tap: one back, one replace |
| Phone, direct | `/?book=5` is the first entry | sheet closes, `replace('/?location=4', { scroll: false })` | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx` -- server component. Header: authors joined with ", " (line 39), series via `detail.series` (line 46), copy lines `location?.name · status` (line 75). Chips go here, and the Genres group goes after Your copies.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx` -- `Sheet addressed` with `onClosed={leave}`, where `leave = useTaskBack(shelfHref(query), true)`. Owns `open`. This is where the chip's close-to-address hooks in.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx` -- the wide frame. No change: a chip there is a plain replace.
- `src/app/(frontend)/components/navigation.ts:280-297` -- `useTaskBack(fallback, keepScroll)`. Back branch: `traverseBack(() => router.back(), () => undefined)`. Else: replace to `fallback`. Mirror 5.20's `useCloseTask(task, to)`.
- `src/app/(frontend)/(sections)/filterToggle.ts` -- `toggleFilter`, `setFilter` and `sortBy`, the pure query updates. `addFilter` belongs beside them.
- `src/app/(frontend)/components/Link.tsx` -- `TextLink` (NextLink + `linkClass`). Next's Link skips navigation when `onClick` calls `preventDefault()`.
- `src/app/(frontend)/scan/AnswerBack.tsx:17` -- `onClick={back}`. It must become `() => back()` once `useTaskBack` takes an argument.
- `src/lib/books/effectiveBook.ts:30` -- `genres: Named[]` (system genres, already named in the user's language).
- `tests/unit/navigation.unit.spec.ts:184-205` -- `useTaskBack` cases with the base harness (`go` spy, fake rAF, router mock: add `replace` assertions).
- `tests/unit/filterToggle.unit.spec.ts` -- pure query-update cases. `tests/unit/filterPanel.unit.spec.ts` -- harness for a client component under a mocked `next/navigation` (`useSearchParams`, `useRouter`).

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/filterToggle.ts` -- add `ChipField = 'author' | 'series' | 'genre' | 'location'` and `addFilter(query, field, id)`: append when absent, otherwise return `query`.
- `src/app/(frontend)/components/navigation.ts` -- the function `useTaskBack` returns takes an optional `to`. The back branch replaces to `to` once settled (with `scroll: false` when `keepScroll`), and the other branch replaces to `to ?? fallback`. Update the doc comment.
- `src/app/(frontend)/scan/AnswerBack.tsx` -- `onClick={() => back()}`.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx` -- provide a context `(href: string) => void` that stores the href and closes the sheet. `onClosed` calls `leave(stored)`. Export the hook that reads it (`null` outside the sheet).
- `src/app/(frontend)/(sections)/FilterChip.tsx` -- new client component taking `field`, `id` and `children`. It builds the query as in Boundaries and renders `TextLink`. Inside the sheet the click calls `preventDefault` and the context; otherwise it is a replace that keeps `book`.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- chips for authors, series name, copy locations, and the Genres group. Update the doc comment.
- `messages/en.json`, `messages/fi.json` -- `detail.genres`. Drop `detail.series` if it is unused.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- add an entry: chips in Book detail on `/loans` (6.9) and in an opened wishlist entry (Epic 7 entry sheet) open the collection with only that filter (UX-DR34). Today `FilterChip` builds on the current address's query.
- `tests/unit/filterToggle.unit.spec.ts` -- `addFilter`: adds while keeping `q`/sort/other fields, widens, and leaves an already-on value unchanged.
- `tests/unit/navigation.unit.spec.ts` -- `useTaskBack(fallback, true)` with `to`: Phone, from list (two taps: one back, then exactly one replace with `scroll: false` after the settle) and Phone, direct.
- `tests/unit/filterChip.unit.spec.ts` -- in the panel, the chip's href keeps `book` and widens. Inside the sheet's context, a click calls it with the href without `book` and does not navigate.

**Acceptance Criteria:**
- Given an opened Book on `/` at ≥900px, when I tap its author, series, a genre or a copy's location, then the list shows the filtered collection with the earlier filters kept, the count line shows the new value, and Book detail stays open.
- Given the phone sheet, when I tap a chip, then the sheet slides closed and the collection shows the filtered list. System Back then leaves the collection and does not reopen the sheet.
- Given an opened Book, when Book detail renders, then every chip looks like a Link: underlined, with no outline or fill.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 27 findings — high 0, medium 5, low 18, false 4, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: a phone chip replaces whatever entry sits below Book detail, so after Open book from `/loans` or Settings that entry becomes the filtered list. It needs Scan from a non-collection section, then Open book, then a chip. The fix is a pathname branch that pushes. Residual risk.
  - `[low]` `[reject]` Blind: modifier and middle clicks on a sheet chip are swallowed. The sheet exists only under 900px (phone), where these clicks don't occur, and the fix is a guard.
  - `[low]` `[reject]` Blind: on the phone the old list shows for a round trip before the replace. The list below was already under the sheet, and the same old-list-until-new holds for every filter tap. Accepted in 5.20 for the same back-then-navigate pattern.
  - `[low]` `[reject]` Blind: a chip whose value is already on does a same-URL replace with no marker. Harmless, and nothing in UX-DR34 marks active chips, so a marker would be new behaviour.
  - `[low]` `[reject]` Blind: screen readers hear only the value, not "filter by". The accessibility floor (tap size, keyboard) is met, and a description adds strings and surface no AC asks for.
  - `[low]` `[reject]` Blind: a "Genres" heading where EXPERIENCE.md says Classification. "Classification" is the table's group name; the mock-up's heading is "Genres and tags". Story 9.6 changes one string when tags arrive.
  - `[false]` `[reject]` Blind: the series number lost locale formatting by leaving `detail.series`. intl-messageformat prints a plain `{index}` argument with `String(value)`, unformatted, and both catalogues had the same order "{name} {index}", so the output is identical.
  - `[medium]` `[patch]` Blind: no test covers AC2's wiring (`onClosed` passing `landing.current`); reverting to `onClosed={leave}` would stay green. Same root as Verification gap 1. Fixed there.
  - `[low]` `[reject]` Blind: `landing` is never cleared and is lost when another close holds `closing`. The sheet unmounts after its one close, and a second traversal in flight while the sheet is open isn't reachable in everyday use.
  - `[false]` `[reject]` Blind: the spine lacks this navigation pattern. A chip on the phone is the spine's two existing rules in sequence (closing is history back, a filter change replaces). `useTaskBack` is not a spine contract.
  - `[low]` `[reject]` Blind: a chip tapped during the wide panel's shrink loses its filter. It needs a tap inside a ~200ms close animation, and the fix makes chips inert while leaving.
  - `[low]` `[reject]` Edge: quick chip taps before `useSearchParams` catches up drop the earlier value. Chips are single taps on separate lines, not an option list. The fix is FilterPanel's pending-address machinery.
  - `[low]` `[reject]` Edge: modifier clicks in the sheet. Same as the Blind row.
  - `[low]` `[reject]` Edge: the entry below (`/loans`) is overwritten after Open book. Same as the first Blind row.
  - `[low]` `[reject]` Edge: a `popstate` later than the 1s timeout makes the replace hit `?book=`. This is the timeout path rejected in 5.20; browsers deliver `go`/`back` traversals.
  - `[low]` `[reject]` Edge: a chip during another in-flight traversal loses its href. Same as the Blind `landing` row.
  - `[low]` `[reject]` Edge: a second chip during the slide-out wins over the first. It needs two taps inside the close animation; the fix is a guard.
  - `[medium]` `[patch]` Edge: in the wide panel, a chip's replace keeps `book`. X then goes history back to the entry from before the chip, so the filter the list showed is lost. This is everyday ("what else by her?", then close). The Filter panel beside an open Book had the same pre-existing gap. Fixed: `useTaskBack`'s back branch, once settled, replaces an entry on `fallback`'s pathname with other params by `fallback` (the list as shown). Guarded by a navigation case and by the collection page's close case.
  - `[low]` `[reject]` Edge: a chip during the panel's leave. Same as the Blind shrink row.
  - `[false]` `[reject]` Edge: an empty author or location name renders an empty link. `name` is `required` on `authors` (`Authors.ts:24`) and `locations` (`Locations.ts:28`).
  - `[medium]` `[patch]` Verification gap: the sheet's chip wiring (`BookDetailSheet` context, `onClosed` → `leave(landing.current)`) runs only against mocks (AC2). Fixed: the collection page's `next/link` mock now runs the caller's `onClick`. A new case taps the location chip in the real sheet and expects one back, no replace before the traversal, then exactly one `replace('/?q=linna&location=3', { scroll: false })` and no push.
  - `[medium]` `[patch]` Verification gap: BookDetail's field and id per chip and the Genres group are never checked (AC1). Fixed: the header case gives the Book a genre and asserts the hrefs of the author, series, location and genre chips, plus the Genres heading.
  - `[low]` `[patch]` Verification gap (other): the collection page's `next/link` mock dropped a caller's `onClick`. Same root as Verification gap 1, fixed by the same change.
  - `[low]` `[reject]` Intent: AC clause 3 (`/loans`, wishlist entries) is not built. Neither surface renders Book detail yet (6.9, Epic 7 entry sheet), so nothing is reachable. It is recorded in `deferred-work.md` for those stories.
  - `[low]` `[reject]` Intent: 5.21 settles the heading and placement of the group 9.6 owns. Same as the Blind heading row: placement follows EXPERIENCE.md's order, and 9.6 extends the group.
  - `[medium]` `[patch]` Intent: the ACs live in the browser, while the tests stop at mocked units. Same root as Verification gap 1, fixed there (the real sheet, provider and `onClosed`).
  - `[false]` `[reject]` Intent: unsplit `oversized` and no commit. Mika dismissed `oversized` for epic-sliced stories (Epic 4 retro, P4), and the commit is this step's finalize.

## Design Notes

Why the phone goes back before it replaces: the sheet's `?book=` entry was pushed over the list. Replacing that entry with the filtered address would leave the unfiltered list one Back below. A filter change replaces everywhere else (Filter panel), so Back must not walk through filter states. Going back first and then replacing leaves one entry, the filtered list. This is the same pattern as 5.20's `useCloseTask(task, to)`, which uses a push there because opening Book detail pushes.

The chip reads `useSearchParams()` rather than the `query` prop that the server render passed to Book detail. A Filter panel tap in the wide layout can have moved the address before the server re-renders Book detail.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npx eslint 'src/app/(frontend)' tests/unit` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including the new cases

**Manual checks (if no CLI):**
- `npm run dev`, wide: open a Book with a genre and a located copy, tap each chip kind, and check that the filters accumulate and the panel stays. Phone viewport: tap a chip; the sheet closes onto the filtered list, and Back does not reopen it.

## Auto Run Result

**Summary:** Book detail's author(s), series name, each system genre (a new Genres group after Your copies) and each copy's location are Filter chips: Links that add their value to the current filters, so a second value in a field widens it.
- **Wide panel:** a chip replaces the address and keeps the Book open.
- **Phone sheet:** a chip closes the sheet the way X does (history back), then replaces the reached entry with the filtered list, so Back reopens neither the Book nor the unfiltered list.
- **Closing Book detail** after filters changed under it (a chip, or the Filter panel) now keeps the list as shown, instead of going back to the filters it was opened with.

**Files changed:**
- `src/app/(frontend)/(sections)/FilterChip.tsx`: new. Builds on `useSearchParams()` → `addFilter` → `shelfHref`. Inside the sheet it hands the href to the sheet; elsewhere it replaces and keeps `book`.
- `src/app/(frontend)/(sections)/BookDetail.tsx`: chips in the header and copy lines, and the Genres group.
- `src/app/(frontend)/(sections)/BookDetailSheet.tsx`: the chip context. A chip stores its href and closes; `onClosed` leaves to it.
- `src/app/(frontend)/(sections)/filterToggle.ts`: `ChipField`, `addFilter` (append, never toggle).
- `src/app/(frontend)/components/navigation.ts`: `useTaskBack(...)(to?)` replaces to `to` after the back. Without `to`, an entry reached on the same pathname with other params is replaced by `fallback` (`staleBelow`).
- `src/app/(frontend)/scan/AnswerBack.tsx`: `onClick={() => back()}` for the new signature.
- `messages/en.json`, `messages/fi.json`: `detail.genres`; the unused `detail.series` is gone.
- `_bmad-output/implementation-artifacts/deferred-work.md`: AC clause 3 (chips from `/loans` and wishlist entries) for 6.9 and Epic 7.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 5.21 set to `done`.
- Tests:
  - `tests/unit/filterToggle.unit.spec.ts`: `addFilter`.
  - `tests/unit/navigation.unit.spec.ts`: the chip's back-then-replace, the direct open, and the close over a stale list.
  - `tests/unit/filterChip.unit.spec.ts`: new. The panel and sheet branches.
  - `tests/unit/collectionPage.unit.spec.ts`: the chip hrefs and Genres in Book detail, a chip in the real sheet, and a link mock that runs `onClick`.

**Review findings:** 27 (medium 5, low 18, false 4).
- **Patched** (3 entries, all medium):
  - The wide panel's close lost a chip's filter.
  - The sheet chip wiring had no test (AC2; 4 rows).
  - The chip field and id mapping and Genres had no test (AC1).
- **Deferred:** none.
- **Rejected (low):**
  - a phone chip overwriting a non-collection entry after Open book (×2);
  - modifier clicks (×2);
  - the old list before the replace;
  - no marker on an already-on chip;
  - no screen-reader description;
  - the Genres heading (×2);
  - `landing` and an in-flight traversal (×2);
  - taps during the close animations (×3);
  - quick successive taps;
  - the 1s timeout path;
  - AC clause 3 surfaces missing.
- **Rejected (false):**
  - series number formatting;
  - the spine;
  - empty names;
  - `oversized` and the commit.

**Follow-up review recommendation:** true. The patched counts by verdict are high 0, medium 3, low 0. The specific unverified risk is the new `staleBelow` rule in `useTaskBack`. It runs for every Book detail close: panel X/Esc, sheet, Filter opening at 900–1199px, and entering select mode. It was checked only in jsdom.

**Verification:**
- `npm run typecheck`: passes.
- `npx eslint 'src/app/(frontend)' tests/unit`: clean, and prettier is clean.
- `npm run test:unit`: 60 files, 865 tests pass.
- Every I/O matrix row has a passing test:
  - **Wide, add / Wide, widen:** `filterChip` panel case and `addFilter`.
  - **Already on:** `addFilter` identity.
  - **Phone, from list:** navigation chip case (double tap) and the collection page sheet case.
  - **Phone, direct:** navigation direct case.
- The manual browser check (`npm run dev`, wide and phone viewport) was not run.

**Residual risks:**
- **Open book from another section** (`/loans`, Settings), then a chip in the sheet: that section's entry is replaced by the filtered list.
- **Open book from a filtered list:** closing Book detail with X now lands on the unfiltered list it showed (the `staleBelow` rule), not on the filtered list below. Before, it landed on the filtered list.
- **System Back** after a chip in the wide panel still goes to the list as it was before the chip. Only the in-app close keeps the filtered list.
- **Tap height:** phone chips are 44px tall, so lines of several authors or genres are tall. Check this in a browser.
