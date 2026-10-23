---
title: '5.17 [E33] Sort'
type: 'feature'
created: '2026-10-23'
baseline_revision: '741eec6057802b89e716f067e87cf31bf5f1ce2e'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred:
  - summary: >-
      A quick double tap on an option that returns to the starting address resets the panel's pending taps at once, briefly showing the first replace's state.
    evidence: |-
      OptionLists clears `pending` when `address === last`; a tap pair that ends on the address it started from (sort reversed twice, an option on then off) matches immediately, so the intermediate replace lands after the reset. The end state is correct.
    location: >-
      src/app/(frontend)/(sections)/FilterPanel.tsx OptionLists pending-tap tracking
    severity: low
---

<intent-contract>

## Intent

**Problem:** The collection can only be read in the default author order. `lib/shelf` and `query.ts` already sort by `author | title | year | added` in either `dir`, but nothing in the interface sets them (FR-25, EXPERIENCE.md Filter panel "Sort by").

**Approach:** Add a "Sort by" group as the Filter panel's last field: Author, Title, Year, Added as option lines, the chosen one on. Tapping another sort switches to it, ascending; tapping the chosen one reverses `dir`. Writes go through the panel's `go`.

## Boundaries & Constraints

**Always:**
- Last in the panel, after Pages, inside the same `values.status` gate. The heading and lines are built like the option lists (`Field` markup, `OptionLine`), with no counts. This matches the wide mock-up's "Sort by" group.
- The chosen sort (`query.sort`, default author) is on, with the 8px marker. In the muted trailing slot after its label, the chosen line shows `↑` for asc or `↓` for desc (`aria-hidden`). Its accessible name is "{label}, ascending" or "{label}, descending". The other lines show nothing there, and their name is the label.
- A tap on another sort sets `sort` to it with `dir: 'asc'`. A tap on the chosen sort flips `dir`. Search, filters and `book` stay. The write is `router.replace` through `go` (pending taps, `scroll: false`), never a push.

**Never:**
- No change to `lib/shelf`, `query.ts` or the count line (the sort is not an active filter, and Clear keeps it).
- No per-sort default direction. No sort control outside the Filter panel.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Default | `/` | Author on, `↑`, named "Author, ascending" | — |
| Switch | `/?q=linna&book=7`, tap Title | replace `/?q=linna&sort=title&book=7` | — |
| Reverse default | `/`, tap Author | replace `/?dir=desc` | — |
| Reverse back | `?sort=year&dir=desc`, tap Year | replace `/?sort=year` | — |
| Switch from desc | `?sort=year&dir=desc`, tap Added | replace `/?sort=added` (asc) | — |

</intent-contract>

## Code Map

- `(sections)/FilterPanel.tsx`: `OptionLists` has `go(update)` (it skips no-op replaces) and renders `RatingField` and `RangeField` last inside the `values.status.length > 0` gate. Add `SortField` after them. `Field` (heading `h3`, `role="group"`) and `OptionLine` are the markup. `OptionLine`'s muted trailing slot is `count?: number`; widen it so it can carry the arrow (e.g. `count?: number | string`, or a separate `after` prop), keeping option-list output unchanged.
- `(sections)/filterToggle.ts`: add `sortBy(query, sort)`. The same sort flips `dir`; another sort sets it with `'asc'`. Filters and `q` stay.
- `lib/shelf/query.ts`: `ShelfQuery['sort']` (`'author' | 'title' | 'year' | 'added'`) and `dir`. `shelfHref` leaves out the default `author`/`asc`. Read only.
- `tests/unit/filterPanel.unit.spec.ts`: the harness with a spied `router.replace`, `search`, `values` with a status, and the `open(address)` helper in the rating/ranges block.

`(sections)/` is under `src/app/(frontend)/`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/filterToggle.ts`: `sortBy`.
- `src/app/(frontend)/(sections)/FilterPanel.tsx`: `SortField`, and `OptionLine`'s trailing slot widened.
- `messages/en.json`, `messages/fi.json`, under `collection`:
  - `filterFields.sort`: "Sort by"/"Järjestys".
  - `sorts.author`/`title`/`year`/`added`: "Author"/"Tekijä", "Title"/"Nimi", "Year"/"Vuosi", "Added"/"Lisätty".
  - `sortDir.asc`/`desc`: "{label}, ascending"/"{label}, nousevasti", "{label}, descending"/"{label}, laskevasti".
- `tests/unit/filterPanel.unit.spec.ts`: one test per matrix row.

**Acceptance Criteria:**
- Given "Sort by" in the Filter panel, when Mika chooses a sort, then the list re-sorts and the address carries the sort; with none chosen, Author is on.
- Given the chosen sort, when Mika taps it again, then the order reverses and its arrow flips.
- Given any sort change, then the history entry is replaced, not pushed, so Back leaves the collection as before.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 14, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` Verification gap: the `↓` arrow is never asserted, so AC2 "its arrow flips" is unchecked (a hard-coded `↑` passes every test) — the desc test now asserts the chosen line reads `sorts.year↓`.
  - `[low]` `[defer]` Edge: a quick double tap on the chosen sort writes the starting address again, so `pending` resets at once and the first replace briefly shows the reversed order before the second lands — pre-existing in `OptionLists`' pending-tap tracking (tapping any option on and off quickly does the same); the end state is right.
  - `[low]` `[patch]` Blind: Finnish `sorts.title` "Nimi" differs from "Nimeke" used for a book's title elsewhere — changed to "Nimeke".
  - `[low]` `[reject]` Blind: `aria-pressed` on the chosen sort reads as a toggle that never un-presses — the same semantics as every option line (and the Rating, 5.16); "Author, ascending, pressed" names the choice and its direction; a radiogroup needs roving focus and arrow keys.
  - `[low]` `[reject]` Blind: `SORTS` in `FilterPanel.tsx` duplicates `query.ts`'s private list — exporting it changes `query.ts`, which this story leaves alone; adding a sort is a spec change that would touch the panel anyway.
  - `[low]` `[patch]` Blind: no test checks the `↓` glyph — same root cause and fix as the verification-gap row.
  - `[low]` `[reject]` Blind: `Option` allows `count` and `mark` together, or `mark` without `name` — no caller does; a discriminated type adds machinery for one caller.
  - `[false]` `[reject]` Blind: the diff adds `mark`/`name` instead of widening `count` as the spec says — the Code Map offers "a separate `after` prop" as an option, and `name` carries the accessible name the Always rules require.
  - `[low]` `[patch]` Blind: "nousevasti"/"laskevasti" read awkwardly in Finnish — now "{label}, nouseva järjestys" / "{label}, laskeva järjestys".
  - `[low]` `[reject]` Blind: `sortBy` lives in `filterToggle.ts`, named for filters — the file already holds the panel's other query transform (`setFilter`); moving or renaming it is churn with no caller harmed.
  - `[false]` `[reject]` Intent: no test shows the list re-sorting — this diff changes only the address; row order per sort is tested in `tests/int/shelfIds.int.spec.ts` from 5.2 and 5.6.
  - `[low]` `[patch]` Intent: the `↓` glyph is asserted only through the accessible name — same root cause and fix as the verification-gap row.
  - `[low]` `[reject]` Intent: AC3 ("Back leaves the collection as before") is checked only as `router.replace` rather than push — that is the unit surface for history; a browser-history test is Playwright, which covers only scan-to-save and shop check.
  - `[low]` `[reject]` Intent: the phone sheet and ≥1200px layouts are not exercised — test-only; the same `OptionLists` renders in both, and they are manual checks.
  - `[low]` `[reject]` Intent: the "has copies" gate is not in the story — it matches every field after Language (5.15, 5.16); with no copies there is nothing to sort.
  - `[false]` `[reject]` Intent: overrides, Finnish collation and "any field" (FR-25) are untouched — the story names four sorts; effective values and `fi-FI` collation are in `lib/shelf` from 5.2 and 5.6.
  - `[low]` `[reject]` Intent: the arrow is beyond the story and mock-up — the Design Notes record it as a veto point for Mika; listed under residual risks.

## Design Notes

The mock-up has no direction cue. Without one, "tap again to reverse" cannot be seen, so the chosen line carries a muted arrow in the slot where option lists show counts. Mika can veto this in review; dropping the arrow is a one-line change. A new sort starts ascending because `asc` is the address default, so switching never writes `dir`.

## Verification

**Commands:**
- `npm run typecheck`: clean.
- `npx eslint . --ignore-pattern '.claude/**'`: no new warnings.
- `npm run test:unit`: pass.

**Manual checks (if no CLI):**
- `next dev` at 1300px and 390px: tap Title and the list re-sorts; tap again and it reverses with the arrow flipped; Back leaves `/`.

## Auto Run Result

Status: done

**Summary:** The Filter panel now ends with a "Sort by" group: Author, Title, Year and Added as option lines, shown when the viewer has copies.
- The chosen sort (Author by default) is on and has a muted `↑`/`↓` after it. Its accessible name is "{label}, ascending/descending".
- Tapping another sort switches to it, ascending. Tapping the chosen sort reverses it.
- Writes go through `go`, so the history entry is replaced and search, filters and `book` stay.

**Files changed:**
- `src/app/(frontend)/(sections)/filterToggle.ts`: `sortBy`.
- `src/app/(frontend)/(sections)/FilterPanel.tsx`: `SortField`. `Option` and `OptionLine` gain `mark` (the arrow, in the count's place) and `name` (accessible name); `count` is optional.
- `messages/en.json`, `messages/fi.json`: `filterFields.sort`, `sorts.*`, `sortDir.*`.
- `tests/unit/filterPanel.unit.spec.ts`: one test per matrix row (5).

**Review findings:** 17 findings (low 14, false 3).
- **Patched (5 rows, 3 root causes, all low):** the `↓` arrow assertion for AC2, "Nimeke" for title in Finnish, and "nouseva/laskeva järjestys".
- **Deferred (1, low):** a quick double tap that returns to the starting address resets the pending taps early. This was already true of `OptionLists` before this story.
- **Rejected (11), each with its reason in the triage log:**
  - `aria-pressed` against a radiogroup.
  - The `SORTS` duplication with `query.ts`.
  - Loose `Option` typing.
  - The spec-versus-diff prop shape (false).
  - `sortBy`'s file.
  - List-order and history tests (one false).
  - Layouts not exercised.
  - The has-copies gate.
  - FR-25's wider reading (false).
  - The arrow being beyond the mock-up.

**Follow-up review:** not recommended (`false`). Only low entries were patched: 3 entries.

**Verification:**
- `npm run typecheck`: clean.
- `npx eslint . --ignore-pattern '.claude/**'`: 0 errors, 40 warnings, all pre-existing.
- `npm run test:unit`: 59 files, 849 tests passed.
- `prettier --check`: clean.
- Every matrix row has a passing `filterPanel` test.

**Residual risks:**
- Not checked in a real browser: a sort tap re-sorting the list at 1300px and in the 390px sheet, and Back leaving `/` after sort changes.
- The direction arrow is not in the mock-up. It is a veto point for Mika, and removing it is one line in `SortField`.
- A new sort always starts ascending, so Added shows oldest first until it is tapped again.
