---
title: '11.8 Stats tiles, chart and nerdy rows'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: 'd4cb5dd32815c3219ad40b0d4e799c7381b8c003'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Stats shows the four big numbers as bare text, By month as one text row per month, and Nerdy stats as two-column label/value lines. The Bold Metro canvas (`mockups/bold-metro/Stats.dc.html`, DESIGN.md → Stats tiles, Stats by month, Stats facts) replaces them with coral tiles, a 12-column marker chart and icon rows.

**Approach:** Restyle `stats/page.tsx` only. Tile number size comes from a pure `tileNumberStep(values)` chosen on the server; the chart and the icon rows are server-rendered markup on new tokens. No change to `getStats`, `computeStats` or any Stats definition.

## Boundaries & Constraints

**Always:**
- Tiles (DESIGN.md → Stats tiles): four equal squares (`aspect-square`), `accent-fill` under `on-fill`, `spacing-2` apart, `spacing-4` inside; two by two below 900px (`wide`), four in a row from it. Number on the first line, label (`title` type) on the second, `whitespace-nowrap`, `overflow-hidden`; number at the top, label at the bottom (the canvas's "split"). Number weight 300, `line-height` 1, letter-spacing -0.02em.
- `tileNumberStep(values: string[]): 'xl' | 'l' | 'm' | 's'` is pure: the largest step of 64 / 54 / 44 / 36px at which the widest value's estimated width fits the tile's inner width, else `s`. Estimate per the canvas: space and no-break space 0.26em, `.` and `,` 0.27em, everything else 0.57em (Open Sans 300). Inner width 139px (a 390px phone: 171px tile minus 2 × 16px); the wide tiles are wider, so the phone binds. The page maps the step to a class `text-tile-number-{step}`; the four sizes are `--text-tile-number-xl|l|m|s` in `styles.css` with weight 300, line-height 1, letter-spacing -0.02em. No inline style.
- By month (DESIGN.md → Stats by month): 12 columns on one shared baseline; each finished Book a 16px `accent` square, 3px apart, stacked upward; a past month with none shows a 16px wide `stroke-control` `border` dash; months after today in the current year (`shown.months` stops at the current month) show nothing and their label is `text-dim`. Single-letter labels (`month: 'narrow'`) in `label` type `text-muted` under the columns. The squares are `aria-hidden`; each column has `role="img"` and the accessible name `stats.monthLabel` "{month}: {n} books, {pages} pages" (long month name, `number()` for pages); future months are `aria-hidden`. Sizes outside the scale (16px marker, 3px gap, 52px minimum column height) are named variables in `styles.css`.
- Nerdy stats: Pages a day and Days a book as two 38px (`--text-stat-number`, 300) numbers with a `meta` muted label, side by side, each present only when not null. Then one row per remaining stat, `spacing-4` apart: a 26px `accent` inline line icon (`viewBox 0 0 24 24`, 2px stroke, `currentColor`, `aria-hidden`), then three lines: label (`meta`, muted), title (`title`), value (`meta`, muted). Icon paths are the canvas's (Quickest bolt, Slowest hourglass, Thickest layers, Dust book, Most expensive coin, Best month calendar, Top author person). A stat with no candidate is absent. The row's title is the Book title, the month name or the author name; the value is "{n} days", "{pages} pages", the euro price, "unread for …", "{n} books" as before.
- By year, the year switch, Currently reading, the empty state and the undated line are unchanged. Page is one column on the phone, By month and Nerdy stats side by side from `wide`, as now.
- Strings in `messages/en.json` and `fi.json`, same keys in both. Remove the strings nothing reads any more (`monthLine`, `monthNone`). Titles leave `bookDays`, `bookPages`, `bookPrice`, `bookUnread`, `monthBooks`, `authorBooks`, which become value-only.
- Tokens only in `styles.css`; no `dark:`, no inline style, no colour or size literal in components.

**Never:**
- No change to `src/lib/stats`, to any Stats definition, to `YearSwitch`, or to By year and Currently reading. No chart library, no icon library. No new test beyond `tileNumberStep`'s.
- Do not commit the walk.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Short values | `['14','4 210','€186','1.3']` | one size, `xl` | — |
| Long pages | `['14','123 456','€1 234','1.3']` | one smaller step for all four (`m` or `s`); no wrapping | — |
| Nothing fits | a value wider than even 36px allows | `s` | — |
| Current year | July | Jan to Jul columns; Aug to Dec empty, labels `text-dim`, `aria-hidden` | — |
| Past year, empty month | 0 books in March | dash, name "March: 0 books, 0 pages" | — |
| Empty year | nothing finished | tiles show 0 and 0; no By month; Nerdy absent unless a fact exists | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/stats/page.tsx` -- server component; `big` (`:144`) feeds the tiles, `shown.months` and `monthGrid` (`:19`, `:217-235`) the month rows, `facts` + `Fact` (`:28`, `:89-142`, `:238-249`) the nerdy rows. `groupHeading`, `monthName`, `number`, `euros` helpers stay.
- New `stats/tileNumberStep.ts` -- the pure helper; new `stats/NerdyIcon.tsx` -- one server component, a `Record<kind, path>`; the canvas paths are in `mockups/bold-metro/Stats.dc.html:104-110`.
- `src/app/(frontend)/styles.css` -- add `--text-tile-number-*`, `--text-stat-number`, `--spacing-chart-marker` (16px), `--spacing-chart-gap` (3px), `--spacing-chart-column` (52px), `--spacing-fact-icon` (26px) near `--spacing-fold-row` (`:142`). The `accent-fill` comment (`:44-48`) already names the tiles.
- `src/app/(frontend)/components/ui/classes.ts` -- `markerSlotClass` is the picker's 8px slot, not reused.
- `messages/en.json:515-545`, `fi.json:515-545` -- `stats` strings.
- `tests/unit/` -- precedent for pure-helper specs (`computeStats.unit.spec.ts`). `tests/int/stats.int.spec.ts` only reads `getStats`.
- `tests/e2e/foldingSections.walk.spec.ts` (git-ignored) -- precedent for the walk (sign-in, rows inserted with `pg`).
- Docs already describe the target: DESIGN.md (Stats tiles, by month, facts), EXPERIENCE.md → Stats. The spine needs no change (no contract moves).

## Tasks & Acceptance

**Execution:**
- [ ] `styles.css` -- the tokens above, with a comment.
- [ ] `stats/tileNumberStep.ts` + `tests/unit/tileNumberStep.unit.spec.ts` -- the helper and one focused spec (short values `xl`, long values smaller and same for all, nothing fits `s`).
- [ ] `stats/NerdyIcon.tsx` -- the seven line icons.
- [ ] `stats/page.tsx` -- tiles, chart, Nerdy numbers and icon rows; doc comment updated.
- [ ] `messages/en.json`, `messages/fi.json` -- `monthLabel`; value-only strings; remove `monthLine`, `monthNone`.
- [ ] `tests/e2e/statsTiles.walk.spec.ts` (git-ignored) -- the walk below.

**Acceptance Criteria:**
- Given Stats for any year, when it shows, then four equal square `accent-fill` tiles with white text sit 8px apart, two by two at 390px and four in a row at 1300px, the number on the first line and the label on the second, neither wrapping, all four numbers at one size.
- Given a 6-digit pages figure, when it shows, then all four numbers use a smaller step and nothing is clipped at 390px.
- Given a year with books, when By month shows, then 12 columns hold one 16px `accent` square per finished Book stacked upward from a common baseline, a dash for each past empty month, nothing and dim labels after today in the current year, single-letter labels, and each column's accessible name reads "{month}: {n} books, {pages} pages".
- Given Nerdy stats, when it shows, then Pages a day and Days a book are two medium numbers, followed by one icon row per remaining stat with label, title and value lines; a stat with no candidate is absent.
- Given By year, the year switch and Currently reading, when Stats shows, then they are unchanged.
- Given Finnish, when Stats shows, then every new string is Finnish and no key is missing.

## Spec Change Log

- 2026-11-11 (build, not a loopback): the I/O matrix's "Short values" example `['14','4 210','€186','1.3']` gives `l`, not `xl`, under the Boundaries rule (largest step whose widest value fits 139px: "4 210" is 2.54em, 162px at 64px). The rule governs, as the canvas computes it; the unit test pins `xl` with shorter values and `l`, `m`, `s` with exact cases.

## Review Triage Log

### 2026-11-11 — Review pass
- verdicts: 41 findings — high 0, medium 0, low 3 (patched 2), false 3, rest rejected as outside this story or test-only
- findings:
  - `[low]` `[patch]` Verification gap / Blind Hunter / Edge Case Hunter: the "long value" unit case accepted `m` or `s` — fixed: exact `l`, `m`, `s` cases.
  - `[low]` `[patch]` Blind Hunter: "1 pages" — `bookPages` and `monthLabel` had no plural — fixed in both languages (the raw number goes in, `#` formats it).
  - `[low]` `[patch]` Edge Case Hunter: a future month holding a finished Book was `aria-hidden` — fixed: `future` only when the month has no books.
  - `[false]` `[reject]` Blind Hunter: the space test in `widthEm` compares one character twice — the second literal is U+00A0 (checked byte by byte).
  - `[false]` `[reject]` Edge Case Hunter: matrix example gives `xl` — true, a spec error, logged in the Spec Change Log; the rule governs.
  - `[low]` `[reject]` Phone narrower than 390px clips tile numbers and the long Finnish label — the spec fixes 139px from the canvas; the tile clips rather than wraps; recorded under Residual risks.
  - `[low]` `[reject]` Chart height with 20+ Books in a month, long unbroken titles, chart accessibility as 12 images (the spec names `role="img"` per column), `dl` semantics, `hasFacts` repetition, token comments — unlikely in everyday use and the fix adds guards or structure.
  - `[false]` `[reject]` Verification Gap, page, chart and Nerdy gate untested, and a stale `stats.walk.spec.ts`: each asks for a committed test; the spec's Never allows only `tileNumberStep`'s (CLAUDE.md, Tests). The walk covered them; the old walk is git-ignored.
  - `[false]` `[reject]` Blind Hunter, Edge Case Hunter, Verification Gap, Intent Alignment: about 20 findings on `Menu`, `AppBar`, `Sheet`, `BookDetailPanel`, `LookUpAgain`, `Refetch` and the footer — those are another session's uncommitted story 11.6 changes, which were in the working tree and so in the diff; not part of this story and not committed with it.
  - Intent Alignment: descriptive only; no findings.

## Verification

**Commands:**
- `npm run lint` -- expected: no errors in committed files.
- `npm run typecheck` -- expected: no errors.
- `npm run test:unit` -- expected: all pass.

**Manual checks:**
- Uncommitted walk `tests/e2e/statsTiles.walk.spec.ts` against the e2e server at 390 and 1300px, light and dark, covering this year, a past year, an empty year and a 6-digit pages figure; screenshots to `test-results/stats-tiles-walk/`; record what it saw under `## Auto Run Result`.
- `scanToSave` and `shopCheck` still pass (`--workers=1`).

## Auto Run Result

**Summary.** Stats shows four equal `accent-fill` tiles (one number size chosen on the server by `tileNumberStep`), a 12-column marker chart with per-column accessible names, and Nerdy stats as two medium numbers plus icon rows. By year, the year switch and Currently reading are unchanged.

**Files changed.**
- `stats/page.tsx`: tiles, chart, Nerdy numbers and icon rows. `stats/tileNumberStep.ts` (new): the pure helper. `stats/NerdyIcon.tsx` (new): seven line icons.
- `styles.css`: tile number steps, `stat-number`, chart and icon sizes. `messages/en.json`, `fi.json`: `monthLabel`, value-only and plural strings, two keys removed.
- `tests/unit/tileNumberStep.unit.spec.ts` (new): `xl`, `l`, `m`, `s` and nothing-fits.

**Review.** 41 findings: patched 3 (low), deferred 0, rejected the rest with reasons above. Follow-up review: `false`.

**Verification.** `npm run typecheck` clean; ESLint clean on the touched files; the new unit spec and all other specs not touching Book detail pass. Four `bookDetail*` unit tests fail in the shared working tree because story 11.6 (another session) is editing Book detail; they passed at 1404/1404 before that work reached those files. Walk `tests/e2e/statsTiles.walk.spec.ts` (uncommitted) passed at 390 and 1300px, light and dark, this year, 2025, an empty year, a 123,456-page figure and Finnish: four equal squares, one number size, no clipping, 8px gaps, 2×2 and 1×4, 12 columns with December empty and its label shown, seven icon rows. Screenshots in `test-results/stats-tiles-walk/`. `scanToSave` and `shopCheck` pass (`--workers=1`).

**Residual risks.**
- The step is chosen for a 390px phone; at 360px a 44px number such as "€47.90" can clip (tiles are `overflow-hidden`, nowrap).
- Built beside story 11.6, which shares `messages/*.json` and the working tree; only this story's hunks were committed.
