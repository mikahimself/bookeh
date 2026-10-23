---
title: '5.26 [F3] Locations on rows, lines and filters'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '37d9d2078a7e988b2688c8a17d2f720138cc367b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** A collection row ends with "Ordered" for an ordered copy and with nothing for an owned one, so "where is it?" is not answered on the row (FR-32, UX-DR17, EXPERIENCE.md Row ending). Edit book shows the copy's Location combobox even when the user has no locations, while EXPERIENCE.md, State Patterns → No locations, says location fields are absent.

**Approach:** `BookRow` ends an owned copy's row with its location's name. `CopyFields` renders the Location combobox only when the user has at least one location. The other surfaces the story names already behave as specified (see Design Notes) and stay unchanged.

## Boundaries & Constraints

**Always:**
- Row ending in `BookRow`, at every size, in the existing ending `<span>` (`shrink-0 text-meta text-text-muted`): "Ordered" for an ordered copy; otherwise `copy.location.name` when the copy has one; otherwise nothing (no empty span).
- `CopyFields` shows the Location combobox only while `status === 'owned'` and `locations.length > 0`. The status switch and its draft behaviour are unchanged. With no locations, choosing owned again still sends `{ status: 'owned', location: null }` as now.
- Tokens only; no new strings.

**Never:**
- No `hasLocations` helper, no layout-level provider, no new reads: an owned copy with no location already renders no ending, and the filter's option list already hides an empty field.
- No change to Settings (the Default location field stays, since Settings is where locations are added), the Answer, Book detail, `lib/shelf`, `lib/copies` or the schema. No spine edit (no contract changes).
- No lent marker (Epic 6) and no Move (5.30, which hides its own Move without locations).
- No ending on cover tiles.
- No markup or CSS tests beyond one case per acceptance criterion.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owned at a location | row: owned, location Tampere | the row ends with "Tampere" | No error expected |
| Owned, no location | row: owned, `location: null` | no ending | No error expected |
| Ordered | row: ordered | the row ends with "Ordered" | No error expected |
| Edit book, no locations | owned copy, `locations: []` | Status switch shown, no Location field | No error expected |
| Edit book, with locations | owned copy, locations Mökki, Tampere | Location field as now | No error expected |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookRow.tsx:75-77` -- the ending slot; today only `copy.status === 'ordered' && <span>{ordered}</span>`. Doc comment at `:24-35` says "Ordered" ends the row.
- `src/app/(frontend)/books/[bookId]/edit/CopyFields.tsx:77-87` -- `status === 'owned' && <Combobox …/>`; doc comment at `:28-35`.
- `src/app/(frontend)/books/[bookId]/edit/page.tsx:73` -- `locations` comes from `listLocations(ctx)` when a copy is shown, so `[]` means the user has none.
- `src/app/(frontend)/(sections)/FilterPanel.tsx:523-525` -- `Field` returns `null` for no options; `values.location` comes from `filterValues` (locations in use on the viewer's copies). Read-only evidence: the location filter is already absent.
- `src/app/(frontend)/(sections)/BookDetail.tsx:102-118` -- copy lines with the location `FilterChip` (built in 5.21). Read-only.
- `src/app/(frontend)/scan/answer.ts:226-230` -- the Answer's copy lines, "Tampere · owned" or the status alone. Read-only.
- `tests/unit/collectionPage.unit.spec.ts:191-198` -- `row(copyId, book, status)` builds `location: null`; the first case (`:241`) asserts row text and the "Ordered" ending.
- `tests/unit/editBookScreen.unit.spec.ts:439-465` -- `describe('EditBookScreen, the copy')`, the `owned` details, `status()` and `location()` helpers, `open(undefined, details)`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/BookRow.tsx` -- the ending per Always; update the doc comment to name the location ending.
- `src/app/(frontend)/books/[bookId]/edit/CopyFields.tsx` -- hide the combobox with no locations; one doc comment sentence citing FR-32.
- `tests/unit/collectionPage.unit.spec.ts` -- let `row()` take a location; in the first case give row 11 Tampere and assert its ending, and assert row 12 (owned, no location) has no ending.
- `tests/unit/editBookScreen.unit.spec.ts` -- one case in `the copy`: owned copy with `locations: []` shows the Status switch and no Location field.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.26 to done in the finalising commit.

**Acceptance Criteria:**
- Given I have locations, when the collection renders in rows, then an owned copy's row ends with its location, and Book detail's copy lines and the Answer still show each copy's location.
- Given I have no locations at all, when the collection, its Filter panel and Edit book render, then there is no row ending, no location filter and no Location field.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 15 findings — high 0, medium 1, low 6, false 8, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: the ending `<span>` is `shrink-0` with no cap. Before, it only held "Ordered". A location name can be up to 200 characters (`Locations.name`), so a long one squeezes the title to nothing and pushes the row past the phone's width. Fixed: the ending is `max-w-1/3 … truncate`.
  - `[low]` `[patch]` Blind: the new row assertions use `a > span`. The absence check would still pass if the ending moved out of a direct `<span>` child. Fixed: presence is `getByText('Tampere')`, and absence checks that row 12's text ends with its meta line.
  - `[low]` `[reject]` Blind: no test shows "Ordered" winning over a location. An ordered copy carries no location (`setStatus`, `receiveCopy`); only a hand edit in the back office could make one. The finding asks only for a test and names no acceptance criterion (CLAUDE.md test rule).
  - `[false]` `[reject]` Blind: Settings' Default location field breaks "absent everywhere". The UX keeps it on purpose. EXPERIENCE.md, Settings, says "may be empty", and the done Story 3.x AC (epics.md:1539) says that "with no locations yet, the combobox is empty and still accepts a new name".
  - `[low]` `[patch]` Blind: `CopyFields`' doc comment does not say where the first location comes from once inline add is hidden. Fixed: the comment names Settings.
  - `[low]` `[patch]` Blind: `BookRow`'s doc comment ties FR-32 to a copy with no location rather than a user with none. Fixed: reworded.
  - `[low]` `[reject]` Edge: a sessionStorage draft that carries a location, restored after every location was deleted, would save a hidden change or show a mark with no field. This needs a draft to outlive deleting all locations in Settings. The save then fails validation and reports. Guarding it adds a branch.
  - `[false]` `[reject]` Edge: a lent copy's row would show its location instead of "Lent · {person}". `loan` is always `null` until Epic 6's loans reader (`lib/books/holdings.ts:9-10`, `:88`). The lent ending is Epic 6's.
  - `[false]` `[reject]` Intent: Settings' Default location under the reading "every location field". Same evidence as the Blind Settings row.
  - `[false]` `[reject]` Intent: "Ordered" should vanish for a user with no locations. "Ordered" is not about locations, the user story asks only for "nothing about locations", and Story 5.10's AC (epics.md:2239) keeps "Ordered" as a row ending.
  - `[false]` `[reject]` Intent: the Answer shows the location at the start of a copy line, not the end. The AC's "row ends with" is about collection rows. The Answer's copy lines show each copy's location, as EXPERIENCE.md's Answer section asks ("each copy with its location").
  - `[false]` `[reject]` Intent: Move's absence is not built here. Move does not exist on this baseline. Story 5.30 builds it and hides it without locations.
  - `[false]` `[reject]` Intent: the row checks the copy's location while Edit book checks the user's list. AD-18 clears a deleted location from every copy, so a user with no locations has no copy with one, and the two always agree.
  - `[low]` `[reject]` Intent: this story adds no checks for Book detail's chip, the Answer's location or the empty location filter. Those surfaces are unchanged and keep the tests from their own stories (5.21, Epic 3, 5.14). The finding asks only for tests.
  - `[false]` `[reject]` Intent: `sprint-status.yaml` is missing from the diff. The spec moves it to done in the finalising commit.

## Design Notes

Already in place, so not rebuilt here: the location `FilterChip` on Book detail's copy lines (5.21), each copy's location on the In library Answer (Epic 3), and the Filter panel's location list, which lists only locations in use and so disappears with none (5.14). With no locations no copy can have one (deleting a location clears it from copies, AD-18), so the row ending is blank without any extra read. Move's absence belongs to 5.30.

## Verification

**Commands:**
- `npm run test:unit` -- expected: passes
- `npm run typecheck` -- expected: no errors
- `npx eslint --ignore-pattern '.claude/**' .` -- expected: 0 errors

**Manual checks (if no CLI):**
- `next dev` on this worktree's Postgres (port 5434): an owned copy at a location shows the location at the row's end in s, m and l. As a user with no locations, Edit book from the save toast shows Status only.

## Auto Run Result

**Summary:** An owned copy's collection row now ends with its location (FR-32, UX-DR17). A user with no locations no longer sees the Location field on Edit book. Everything else the story names was already in place and stays unchanged:
- the location chip on Book detail's copy lines (5.21);
- the location on the Answer's copy lines (Epic 3);
- the location filter, which lists only locations in use and so disappears with none (5.14);
- hiding Move with no locations, which 5.30 does.

**Files changed:**
- `src/app/(frontend)/(sections)/BookRow.tsx`: the ending is "Ordered" for an ordered copy and the location's name for an owned one. An owned copy with no location has no ending. The ending is capped at a third of the row and truncated.
- `src/app/(frontend)/books/[bookId]/edit/CopyFields.tsx`: the Location combobox shows only when the user has a location.
- `tests/unit/collectionPage.unit.spec.ts`: `row()` takes a location; the first case checks the location ending and the bare owned row.
- `tests/unit/editBookScreen.unit.spec.ts`: a case with no locations shows Status and no Location field.
- `sprint-status.yaml`: 5.26 done.

**Review findings:** one pass, 15 rows in the Review Triage Log.
- **Patched:**
  - medium 1: a long location name overflowing the row;
  - low 3: markup-bound test assertions, the `BookRow` FR-32 wording, and the `CopyFields` pointer to Settings.
- **Deferred:** none.
- **Rejected (low):**
  - "Ordered" beating a location is untested (test only, no criterion named);
  - a stale draft location after every location is deleted (unlikely, and the fix adds a branch);
  - unchanged surfaces get no new tests (test only).
- **Rejected (false):**
  - Settings' Default location field, raised twice; the UX and the AC at epics.md:1539 keep it;
  - the lent ending (`loan` stays `null` until Epic 6);
  - "Ordered" vanishing with no locations;
  - the Answer's location placement;
  - Move;
  - row and Edit book detection agreeing (AD-18);
  - sprint status missing from the diff.

**Follow-up review recommendation:** false. Patched: high 0, medium 1, low 3.

**Verification:**
- `npm run test:unit`: 61 files, 880 passed.
- `npm run typecheck`: clean.
- `npx eslint --ignore-pattern '.claude/**' .`: 0 errors (40 existing warnings).
- Prettier check on the four changed files: clean.
- `max-w-1/3` checked against `styles.css` with `@tailwindcss/node`: it emits `max-width: calc(1 / 3 * 100%)`.
- Matrix audit:
  - owned at a location, owned with no location, and ordered: the first `CollectionPage` case;
  - Edit book with no locations: the new `EditBookScreen` case;
  - Edit book with locations: the existing `the copy` cases.
- Not done: the manual `next dev` check.

**Residual risks:**
- At size s, the ending's one-third cap still leaves little room for the title on a 390px phone when the location name is long. Look at it on a phone.
