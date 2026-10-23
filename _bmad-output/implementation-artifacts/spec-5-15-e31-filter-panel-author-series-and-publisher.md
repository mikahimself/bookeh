---
title: '5.15 [E31] Filter panel: author, series and publisher'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '18e8277345585005bfeaed046d07d5a62bd3d68e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Filter panel cannot filter by author, series or publisher, which have too many values to list (FR-25, EXPERIENCE.md Filter panel).

**Approach:** After Language, add three comboboxes (Author, Series, Publisher) fed by `/data/suggest` through the existing `useSuggestions`. Choosing a suggestion adds it to the field's filter at once, through the panel's existing tap path. The values that are on show as a short list under the field, and tapping one removes it.

## Boundaries & Constraints

**Always:**
- Order after Language: Author, Series, Publisher. Each is the `Combobox` wrapper labelled with the field name. It is rendered only when the viewer has copies (`values.status` is not empty).
- Options are the suggestions for the typed text, minus values already on: author/series by id, publisher by name. So choosing always adds. No "New: {name}" row: the wrapper gets an opt-out prop (create stays the default for its other callers).
- Choosing goes through the same `tap` as the option lists (pending-tap tracking, `router.replace(shelfHref(next, { book }), { scroll: false })`). It keeps search, sort, direction, the other fields and `book`. Values within a field are OR; removing the last one drops the field. The combobox text is empty again after a choice.
- The short list under each combobox holds the field's values that are on, in address order. Each is one line, built like an option list's "on" value (`text`, 8px accent marker, 44px tap). It is a `button` whose accessible name is "Remove {name}", and a tap removes that value. A shared `OptionLine` serves both the option lists and the short lists.
- Names: publishers are their own text. Author/series ids take their name from the page's `ShelfRows.labels` (`author:id`, `series:id`, passed to `FilterPanel` as a prop), and before that from the name of the suggestion chosen in this panel, held locally until the server render brings the label. An id with no name anywhere is not listed, the same as on the count line.

**Never:**
- No change to `lib/shelf`, `/data/suggest`, `useSuggestions`, `query.ts` or the count line: all of them already handle `author`, `series` and `publisher`.
- No theme combobox (Epic 9), no rating/ranges (5.16), no sort (5.17).
- No Base UI `multiple` mode or chips: the short list sits outside the combobox.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add author | no author filter, type "lin", choose Väinö Linna (id 4) | `author=4`, "Väinö Linna" in Author's short list, field text empty | — |
| Add second | author [4], choose id 9 | author [4, 9] (OR) | — |
| Already on | author [4], suggestions contain 4 and 9 | only 9 offered | — |
| Publisher | choose "WSOY" | `publisher=WSOY`, listed as "WSOY" | — |
| Remove last | publisher [WSOY], tap "WSOY" | `publisher` gone from the address | — |

</intent-contract>

## Code Map

- `(sections)/FilterPanel.tsx` -- `OptionLists` (pending taps, `tap(field, value)`) and `Field` (option buttons). Add the comboboxes and short lists here and pull the button into `OptionLine`. `FilterPanel` takes `values`; add `labels`.
- `(sections)/filterToggle.ts` -- `ListedField` / `toggleFilter`. Extend the field union to `author | series | publisher`; the list branch already works for them.
- `(sections)/page.tsx` -- renders `<FilterPanel values={values} />`; pass `labels={shelf?.labels ?? {}}`.
- `components/suggest.ts` -- `useSuggestions(field, text)`, reuse as is. `books/[bookId]/edit/NameCombobox.tsx` -- pattern for suggestions as `ComboboxOption[]`. Publishers have `id: null`: use positional ids, map back on choose.
- `components/ui/Combobox.tsx` -- `offersCreate` builds the create row. Add the opt-out prop here. With `value={null}` kept, Base UI empties the input when the popup unmounts (`AriaCombobox.mjs` `handleUnmount`); confirm before adding a reset.
- `tests/unit/filterPanel.unit.spec.ts` -- already mocks `next/navigation` and `next-intl`; mock `components/suggest` too.

Paths starting `(sections)/`, `components/`, `books/` are under `src/app/(frontend)/`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/components/ui/Combobox.tsx` -- add an opt-out of the create row (default unchanged) -- filter values must exist.
- `src/app/(frontend)/(sections)/filterToggle.ts` -- extend the field union with author, series and publisher -- one tap path for choose and remove.
- `src/app/(frontend)/(sections)/FilterPanel.tsx` -- `OptionLine`; an `AddedValues` part per field (combobox + short list, local chosen names); `labels` prop -- the feature.
- `src/app/(frontend)/(sections)/page.tsx` -- pass `labels`.
- `messages/en.json`, `messages/fi.json` -- `filterFields.author/series/publisher` ("Author"/"Kirjailija", "Series"/"Sarja", "Publisher"/"Kustantaja") and `filterRemove` ("Remove {name}"/"Poista {name}").
- `tests/unit/filterPanel.unit.spec.ts` -- choosing a suggestion replaces with the value added (keeping `q` and `book`), shows it in the short list, and offers neither an active value nor a "New:" row; tapping a short-list line removes it.

**Acceptance Criteria:**
- Given the Filter panel, when Mika types in the Author, Series or Publisher combobox, then suggestions from `/data/suggest` appear, and choosing one adds it to the short list under the field and filters the list at once.
- Given values in a short list, when Mika taps one, then it leaves the list and its filter is removed.
- Given a chosen author, when the list renders, then the count line names it (existing `activeValues`) and Clear removes it.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 16, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: `AddedValues` keeps the old typed text after Clear, Esc or blur, so reopening the empty field lists stale suggestions — the `Combobox` wrapper now also forwards `''` to `onInputValueChange` when the text is emptied (Clear, Base UI's reset on close). Its only other caller, `NameCombobox`, already treats `''` as none.
  - `[low]` `[reject]` Blind: values already on use up `SUGGEST_LIMIT` (10), so fewer new names show — it needs several matching values on at once; more typing narrows the list; a fix changes `/data/suggest`.
  - `[low]` `[reject]` Blind: "already on" compares ids while suggest and labels group by `name_key`, so a same-named private id in the address could be offered again — ids reach the address only from this panel's suggestions (shared id first) or hand-edited URLs today; excluding by name adds a branch. Revisit with 5.21's filter chips.
  - `[low]` `[reject]` Blind: with `create={false}` an empty popup shows nothing — a "no matches" text would also flash during the 250 ms debounce, when `useSuggestions` is empty by design; no popup reads as no suggestions.
  - `[low]` `[patch]` Blind: Finnish `filterFields.author` "Kirjailija" differs from "Tekijä" used for the author field everywhere else — changed to "Tekijä".
  - `[low]` `[reject]` Blind: `AddedValue = number | string` widens the field/value link at `tap(field, value)` — `suggest()` always returns numeric ids for author and series; a generic `AddedValues<F>` adds type machinery for no caller that diverges.
  - `[false]` `[reject]` Blind: positional option ids can map a choice to the wrong suggestion after a late update — Base UI hands back the item from the committed render, and the wrapper and `AddedValues` read `offered` from that same render (stable callbacks), so index and list agree.
  - `[low]` `[reject]` Blind: author and series values vanish from the panel when the shelf read fails (`labels` falls back to `{}`) — the list then shows Load failed anyway; a separate labels read adds a query for a rare failure.
  - `[low]` `[reject]` Blind: EXPERIENCE.md's general Combobox row says a missing value can be created, but the filter comboboxes cannot — the Filter panel row says they add values to a short list of existing ones; FR-31/FR-34 cover locations and tags. No later story is named that would misread it.
  - `[low]` `[patch]` Blind: the `FilterPanel` docstring said `labels` name only author and series ids — it now says they are `ShelfRows.labels` and the panel reads only `author:` and `series:`.
  - `[low]` `[patch]` Edge: stale `text` after an `inputClear` reset — same root cause as the Blind stale-text row; fixed by the same wrapper change.
  - `[low]` `[reject]` Edge: an id on in the address with no name has no short-list line, so it can be removed only by Clear — needs a failed shelf read or an unreadable id; showing raw ids contradicts the spec's "not listed, as on the count line".
  - `[low]` `[reject]` Edge: labels fall back to `{}` on a failed shelf read — as the Blind shelf-failure row.
  - `[low]` `[reject]` Edge: client-side exclusion eats into the suggest limit — as the Blind limit row.
  - `[low]` `[reject]` Edge: same `name_key`, different id offered again — as the Blind `name_key` row.
  - `[low]` `[reject]` Verification gap: the "viewer has copies" gate is not pinned by a test — a test-only finding that names no acceptance criterion or spine rule (CLAUDE.md tests convention).
  - `[low]` `[reject]` Verification gap: hiding an unnamed id is untested — test-only, as above.
  - `[low]` `[reject]` Verification gap: the page-to-panel `labels` wiring is untested — test-only, as above; a one-line prop.
  - `[false]` `[reject]` Intent: tests stop at the jsdom client surface (mocked suggest, spied `router.replace`) — the server side (`lib/shelf` filters, `/data/suggest`, `activeValues`) is unchanged and tested in its own stories; Playwright is only for scan-to-save and shop check.
  - `[false]` `[reject]` Intent: AC3 (count line names a chosen author, Clear removes it) has no code change or test — `activeValues` and `clearHref` already name `author` ids from `labels` and are covered by `collectionCountLine`; this story adds no new path there.
  - `[false]` `[reject]` Intent: not committed and sprint status still `backlog` — finalization commits both in this run.
  - `[false]` `[reject]` Intent: theme is not built and the create rule departs from EXPERIENCE.md — story 5.15 names author, series and publisher only; theme is Epic 9. The create rule is the Blind EXPERIENCE.md row.

## Design Notes

DESIGN.md has no short-list component, so the short list reuses the option list's "on" line: a value that is on looks the same in both kinds of field.

## Verification

**Commands:**
- `npm run typecheck && npm run lint` -- expected: clean (no new warnings).
- `npm run test:unit` -- expected: pass.

**Manual checks (if no CLI):**
- `next dev` at 1300px and 390px: type in Author, choose one, list narrows, name under field, field empties; choose a second; tap a name to remove; Back on the phone sheet keeps the filters.

## Auto Run Result

Status: done

**Summary:** The Filter panel now has Author, Series and Publisher comboboxes after Language, shown when the viewer has copies. Typing asks `/data/suggest` (through `useSuggestions`); choosing a suggestion adds it to the field at once through the panel's existing tap path, so pending taps, `scroll: false`, search, sort, the other fields and `book` all carry over. Values already on are not offered, and there is no "New:" row. The values that are on sit in a short list under each field as option lines with the accent marker; tapping one ("Remove {name}") removes it. Author and series names come from the page's `ShelfRows.labels`, or from the chosen suggestion until the server render brings the label.

**Files changed:**
- `src/app/(frontend)/(sections)/FilterPanel.tsx` — `AddedValues` (combobox plus short list), shared `OptionLine`, `labels` prop, parsed query memoised on the address.
- `src/app/(frontend)/(sections)/filterToggle.ts` — `ListedField` gains author, series, publisher.
- `src/app/(frontend)/(sections)/page.tsx` — passes `labels={shelf?.labels ?? {}}`.
- `src/app/(frontend)/components/ui/Combobox.tsx` — `create?: boolean` (default `true`); `onInputValueChange` also gets `''` when the text is emptied.
- `messages/en.json`, `messages/fi.json` — field names and `filterRemove`.
- `tests/unit/filterPanel.unit.spec.ts` — choosing an author (offers only values not on, no "New:" row, both names listed, field empties), choosing a publisher, removing the last value.

**Review findings:** 22 findings (low 16, false 6). 4 rows patched, 3 root causes, all low: the stale suggestion text after Clear/Esc/blur, the Finnish "Tekijä" label, and the `labels` docstring. Nothing deferred. 18 rejected, each with its reason in the triage log: the suggest limit used up by values on, `name_key` versus id exclusion, no empty-state text (it would flash during the debounce), the `number | string` value type, positional ids (false), the failed shelf read hiding names, the EXPERIENCE.md create rule, unnamed ids, three test-only gaps, and four intent rows (false).

**Follow-up review:** not recommended (`false`). Only low entries were patched: 3 entries, 4 rows.

**Verification:**
- `npm run typecheck`: clean.
- `eslint . --ignore-pattern '.claude/**'`: 0 errors, 40 warnings, all pre-existing. Plain `npm run lint` also scans the leftover 5.18 worktree under `.claude/worktrees/` and reports its errors.
- `npm run test:unit`: 59 files, 835 tests passed.
- `prettier --check` on the patched files: clean.
- Every row of the edge-case matrix is covered by a passing `filterPanel` case.

**Residual risks:**
- Not checked in a real browser. That covers the 1300px panel, the 390px sheet with the combobox popup inside it, Back on the sheet keeping the filters, and the input emptying after a choice. Base UI resets the input on popup unmount, which is seen only in jsdom.
- An author or series id the viewer cannot name (failed shelf read, hand-edited URL) is on but not listed; only Clear removes it.
- When 5.21 adds filter chips from Book detail, check that a chip's author id and the suggestion's shared id for the same `name_key` don't list the name twice.
