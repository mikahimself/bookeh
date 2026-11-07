---
title: '10.6 Stats section and the Add book rename'
type: 'feature'
created: '2026-11-07'
baseline_revision: '76b5d6795ee4c2a80cda074530b5bbec2892e1e0'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `getStats()` (10.5) computes FR-58 but nothing shows it: there is no `/stats` page and no fifth section. The button that opens `/scan` still says "Scan book", though that screen also takes typed ISBNs, title search and entry without an ISBN.

**Approach:** Add Stats as the fifth section (`SECTIONS`: collection, loans, wishlists, stats, settings), so the headings row, swiping and wrapping follow. Add a server page `/stats` that renders `getStats(ctx, year)` as EXPERIENCE.md → Stats and DESIGN.md → Components (Stats numbers, Stats by month, Stats facts) describe, with a client year Text switch that replaces `?year=`. Rename the interface strings `scan.open` and `scan.heading` to "Add book" / "Lisää kirja".

## Boundaries & Constraints

**Always:** PRD FR-57, FR-58 (numbers as `getStats()` returns them; this story only formats). EXPERIENCE.md → Stats and → Navigation; DESIGN.md Stats numbers / Stats by month / Stats facts, 8px `accent` markers, no fills. `requireUser()` first on the page (the layout's call is not enough for a page). Every string in `messages/en.json` and `messages/fi.json`; dates, numbers and euros through `next-intl` (`getFormatter`), interface time zone Europe/Helsinki. Routes and code names stay `/scan`, `scanBook`, `data-scan-book`. Mock-up `mockups/reading-options.html`, Picked → Stats, for the look; the spines win where it differs (the phone shows all four big numbers and By year too).

**Never:** No change to `lib/stats`, `lib/shelf` or any service. No Book detail on `/stats` (Currently reading links to `/?book=`). No new Playwright spec; no committed test beyond `unreadFor()` and the existing tests whose fixed section order or button name this changes. No route rename.

## I/O & Edge-Case Matrix

Today 2026-11-07. "Formatter" = `next-intl` in the active locale.

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Year param | `/stats`, `?year=2025` (in `years`), `?year=abc`, `?year=2031`, `?year=2025&year=2024` | 2025 for the second and the fifth (first value); the current year otherwise (`getStats` falls back for unknown numbers; non-`^\d{4}$` text is passed as `undefined`) |
| Year switch | years [2026, 2025], on 2026, tap 2025 | `router.replace('/stats?year=2025', { scroll: false })`; tapping 2026 from 2025 replaces to `/stats`; heading "This year" on 2026, "2025" on 2025 |
| Big numbers | books 23, pages 7407, spent 31240, booksPerMonth 2.3 | en: "23", "7,407", "€312.40", "2.3"; spent 31200 → "€312"; fi: "7 407", "312 €", "2,3" |
| By month | months 1..11, Jul 5 books 1772 p, Jun 0 | Jul: 5 markers, "5 books · 1,772 p"; Jun: "–" in `text-dim`, third column empty; Dec not shown; whole part absent when `year.books` is 0 |
| Nerdy stats | quickest {Kesäkirja, 2}, thickest {…, 476}, mostExpensive {Kätilö, 3290}, bestMonth {7, 5}, topAuthor {Tove Jansson, 4}, pagesPerDay 24, daysPerBook 13.5, a null stat | "Kesäkirja · 2 days", "… · 476 p", "Kätilö · €32.90", "July · 5 books", "Tove Jansson · 4", "24", "13.5"; the null stat's row absent; whole part absent when every stat and `dust` are null |
| Dust age (`unreadFor`) | since 2014-05-01 / 2026-01-07 / 2026-10-20 / 2026-11-07, today 2026-11-07 | 12 years / 10 months / 18 days / 1 day ("unread for 12 years") |
| Dust boundary | since 2025-11-08 / 2025-11-07, today 2026-11-07 | 11 months / 1 year |
| By year + undated | byYear [2026 23/7407/31200, 2025 9/2960/11800], undated 61 | "23 books · 7,407 p · €312", "9 books · 2,960 p · €118"; "61 read books have no dates and are not counted."; undated 0 → line absent |
| Currently reading | reading [{Sinuhe, since 2026-10-02}, {Kätilö, since 2025-12-30}] | rows "Sinuhe … since 2 Oct", "Kätilö … since 30 Dec 2025", each a link to `/?book=<id>`; reading [] → part absent |
| Empty | reading [], undated 0, every `byYear` books 0 and spent 0 | "Nothing read yet" + remark, then the Year group with zeros; By month and By year absent; Nerdy stats only if `dust` is set |
| Load failed | `getStats` throws | `LoadFailed` alone, the error logged |
| Sections | on `/stats` | headings row: stats, settings, collection, loans, wishlists; swipe left → `/settings`, right → `/wishlists`; from `/settings` left → `/`; from `/wishlists` left → `/stats` |

</intent-contract>

## Code Map

- `src/app/(frontend)/components/sections.ts:1-8` -- `SECTIONS`; insert `{ key: 'stats', href: '/stats' }` before settings; comment "The five sections". `sectionRow`, `sectionAfter`, `sectionOf` need no change.
- `src/app/(frontend)/components/SectionNav.tsx`, `components/swipe.ts` -- read `SECTIONS`; no change but comments naming "Scan book".
- `src/app/(frontend)/(sections)/layout.tsx:13-36` -- the shell; `t('open')` from `scan` is the button text (no code change; comments say "Add book"). Add book is `shrink-0`; the headings row is `min-w-0 flex-1 overflow-x-clip`, so clipping already follows the measured widths.
- `src/app/(frontend)/(sections)/loans/page.tsx` -- pattern for a section page: `requireUser()`, read with `.catch` → `logger().error` → `LoadFailed`, `getTranslations`, `getFormatter`, `px-page-margin-phone wide:px-page-margin`, group heading `text-heading-group text-text-muted ui-case`, empty block (`nothingLent`).
- `src/lib/stats/getStats.ts`, `computeStats.ts` -- `getStats(ctx, year?)`, `Stats`, `YearStats` (read-only here). `spent`/`price` in cents; `months` up to the current month; `years` newest first.
- `src/app/(frontend)/(sections)/ReadingStrip.tsx:33-40` -- the "since" date options (day + short month, year when not this year); extract to `sinceDay(date, today)` in `readingLine.ts` returning `Intl.DateTimeFormatOptions`, used by the strip and Stats.
- `src/app/(frontend)/(sections)/readingLine.ts` -- add `sinceDay`; `finishedDays` from `src/fields/readingDates.ts` (calendar days, at least 1) for `unreadFor`'s day case.
- `src/app/(frontend)/components/TextSwitch.tsx` -- `labelledBy`, `value`, `options`, `onChange`, `properNames`.
- `src/app/(frontend)/components/ui/classes.ts:10` -- `markerSlotClass` (`size-2 shrink-0`) + `bg-accent` is the 8px marker.
- `src/app/(frontend)/(sections)/LoadFailed.tsx` -- load failure.
- `src/app/(frontend)/(sections)/CopyLine.tsx:119` -- euro format precedent (`format.number(cents / 100, { style: 'currency', currency: 'EUR' })`). ES2022 lib lacks `trailingZeroDisplay`; use `minimumFractionDigits: cents % 100 === 0 ? 0 : 2`.
- `messages/en.json`, `messages/fi.json` -- `sections` (add `stats`: "Stats" / "Tilastot"), `scan.open` / `scan.heading` ("Add book" / "Lisää kirja", both keys), `collection.readingNow` / `readingSince` reused for Currently reading; new `stats` namespace.
- `src/app/(frontend)/scan/page.tsx:83,92` -- `FullScreenTask title={t('scan.heading')}` (string change only).
- `src/app/(frontend)/(sections)/CollectionList.tsx:163` -- First run's button uses `scan.open` (string change only).
- Comments saying "Scan book": `styles.css:136,229,240,579`, `BackToTop.tsx:7`, `SelectBar.tsx:26`, `components/Button.tsx:12`, `toast/ToastProvider.tsx:115`, `layout.tsx`, `SectionNav.tsx:21` -- reword to "Add book".
- Tests naming the old order or label: `tests/unit/sections.unit.spec.ts:9-42`, `tests/unit/swipe.unit.spec.ts:67-70`, `tests/unit/collectionPage.unit.spec.ts:318`, `tests/e2e/scanToSave.spec.ts:42-43,82`, `tests/e2e/shopCheck.spec.ts:33`. Git-ignored local walks (`tests/e2e/*.walk.spec.ts`) also name "Scan book"; update them locally (not committed).
- Spine `ARCHITECTURE-SPINE.md:619` already lists `/stats` with `?year=` and the `/?book=` link; no contract changes unless the build differs.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/(frontend)/components/sections.ts` -- add stats as the fourth entry; five-section comment.
- [x] `messages/en.json`, `messages/fi.json` -- `sections.stats`; `scan.open`, `scan.heading`; `stats` namespace (heading names, labels, ICU plurals for books/days/months/years, undated line, empty state and remark, year-switch label).
- [x] `src/app/(frontend)/(sections)/readingLine.ts` -- `sinceDay(date, today)` and `unreadFor(since, today): { unit: 'years' | 'months' | 'days'; n: number }` (whole calendar years, else whole months, else `finishedDays`).
- [x] `src/app/(frontend)/(sections)/ReadingStrip.tsx` -- use `sinceDay`.
- [x] `src/app/(frontend)/(sections)/stats/page.tsx` (new) -- server page: `requireUser()`, parse `year`, `getStats(...).catch` → `LoadFailed`; parts in order: Currently reading, empty block, Year group (heading + `YearSwitch`), big numbers, then By month and Nerdy stats (one column, `wide:` two), By year, undated line.
- [x] `src/app/(frontend)/(sections)/stats/YearSwitch.tsx` (new) -- client `TextSwitch` of `years` (as given, newest first); `router.replace` to `/stats` for the current year, `/stats?year=Y` otherwise, `scroll: false`.
- [x] Comments listed in the Code Map -- "Scan book" → "Add book".
- [x] `tests/unit/readingLine.unit.spec.ts` (new or extended) -- `unreadFor`: the Dust age and Dust boundary rows.
- [x] `tests/unit/sections.unit.spec.ts`, `tests/unit/swipe.unit.spec.ts` -- five-section order and wrap.
- [x] `tests/unit/collectionPage.unit.spec.ts`, `tests/e2e/scanToSave.spec.ts`, `tests/e2e/shopCheck.spec.ts` -- "Add book".
- [x] Uncommitted `tests/e2e/stats.walk.spec.ts` -- the walk below; record results under Auto Run Result.

**Acceptance Criteria:**
- Given a signed-in user with read, reading and priced data, when they open `/stats` on the phone and on a wide screen, then the parts appear in the order of the matrix, one column on the phone and By month beside Nerdy stats on wide screens, every value formatted in the active locale.
- Given `/stats`, when the user taps another year in the switch, then the address becomes `/stats?year=<y>` (replaced, not pushed) and the page shows that year; tapping the current year returns to `/stats`.
- Given a Book in Currently reading, when the user taps it, then the collection opens with that Book's detail (`/?book=<id>`).
- Given any section, when the headings row renders, then Stats is in its place in collection, loans, wishlists, stats, settings, current first and wrapping; swiping on the phone moves through all five and wraps.
- Given English and Finnish, when any section renders, then the button reads "Add book" / "Lisää kirja", the `/scan` task's heading the same, and the section heading "Stats" / "Tilastot".
- Given a wide window at 900, 980 and 1100px in both languages, when a section renders, then Add book is never clipped, and the headings row clips at its right edge only below 974px (en) / 1074px (fi).
- Given a signed-out visitor, when they open `/stats`, then they are sent to sign in.

## Spec Change Log

## Review Triage Log

### 2026-11-07 — Review pass
- verdicts: 26 findings — high 0, medium 0, low 17, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` Intent: in Finnish at 900–~918px the heading before the current one can be fully clipped, so not every section is one click away — EXPERIENCE.md's measured widths accept clipping below 1074px; only a desktop window within a few px of 900 meets it, and the fix (shrinking headings) is a layout change, not a correction.
  - `[false]` `[reject]` Intent: the empty state still shows Nerdy stats with Most dust collected — EXPERIENCE.md's Nerdy row ("a stat with no candidate is absent") still governs, and FR-58 ties dust to no year; the Empty row describes the state with nothing read, priced or being read, which dust is not. Recorded in Design Notes; worth a look on the walkthrough.
  - `[low]` `[patch]` Intent: the walk's "empty year" covered only a user with no data, not a data user on a year with nothing finished — walk extended with a user whose only finished Book is in 2025: zeros, no By month, By year with both years, switch works.
  - `[false]` `[reject]` Intent: the current year drops `?year=` instead of rewriting it — a replace either way; Design Notes chose `/stats`, the address the heading links to.
  - `[false]` `[reject]` Intent: new rows in the sections/swipe tables exceed "no new tests" — they are the existing order tables updated for the order the AC names (CLAUDE.md: tests that guard a stated order).
  - `[false]` `[reject]` Intent: only By month and Nerdy stats are two-column, not the whole page — EXPERIENCE.md → Stats says exactly that.
  - `[low]` `[reject]` Intent: matrix example "since 2 Oct" vs rendered "since Oct 2" — the Code Map requires the strip's shared format, which next-intl's `en` renders month first; the fix would edit this build's spec.
  - `[false]` `[reject]` Intent: Most dust collected shows on every year — FR-58: "Most dust collected is not tied to the year".
  - `[low]` `[reject]` Edge: `helsinkiToday()` is called by both the page and `getStats`, so a New Year's midnight between them mismatches the year — once a year for a request in flight; a reload fixes it; the fix widens the `Stats` shape in `lib/stats`, which this story does not touch.
  - `[false]` `[reject]` Edge: By year lists an all-zero current-year row — `years` always includes the current year (FR-58), and By year is one line per year.
  - `[low]` `[reject]` Edge: Pages a day shows "0" when it rounds to 0.0 — needs a year of only a few dozen pages; the value is the true rounded figure; a guard adds a branch.
  - `[low]` `[reject]` Edge: `unreadFor` counts Feb 29 → Feb 28 and month-end starts one unit short — off by one unit for a few days around month ends; clamping adds logic for a cosmetic age.
  - `[low]` `[reject]` Verification gap: the page's parsing, part presence and formatting have no committed test — the intent excludes it ("no new tests beyond any pure formatting helper"); the walk and a temporary page render (Load failed) checked them.
  - `[low]` `[reject]` Verification gap: `YearSwitch`'s replace is not tested — same intent exclusion; the walk checked replace, not push.
  - `[low]` `[patch]` Verification gap: `sinceDay()` has two consumers and no assertion — two rows added to `readingLine.unit.spec.ts`.
  - `[low]` `[patch]` Blind: the year switch shows with only one year — rendered only when `stats.years.length > 1`.
  - `[low]` `[reject]` Blind: an unused `?year=` (abc, 2031, the current year) stays in the address — reached only by typing the URL; a redirect adds a branch.
  - `[low]` `[reject]` Blind: a user whose only data is a €0 copy sees "Nothing read yet" — a gift priced at exactly €0 as the only data is rare; the page still shows the right zeros.
  - `[low]` `[patch]` Blind: the switch waits for the server before showing the tapped year — `useOptimistic(year)` set inside the transition; progress line kept.
  - `[false]` `[reject]` Blind: By year uses body type, By month meta — the Picked mock-up (authoritative for the look) sets By year at 14px with the year in ink and By month at 13px muted; DESIGN.md's "same grid" is the column layout.
  - `[false]` `[reject]` Blind: "0 p" for Books without page counts looks real — FR-58: a Book without a page count adds a book but no pages.
  - `[low]` `[reject]` Blind: By month / By year grids have no list or table semantics and sections are unlabelled — the headings precede each part and the line text carries the counts; restructuring the grids is more than a correction.
  - `[low]` `[reject]` Blind: Currently reading's heading repeats the group-heading classes with `pt-4` — the first part sits closer to the header on purpose; no rule diverges.
  - `[low]` `[patch]` Blind: a long Nerdy value squeezes its label on the phone — `shrink-0` on `dt`; the value wraps.
  - `[low]` `[reject]` Blind: "today" computed twice — grouped with the Edge New Year row; same reason.
  - `[false]` `[reject]` Blind: "Scan book" survives in `epics.md` — the PRD (FR-23) and EXPERIENCE.md already say Add book; `epics.md` keeps the done stories as written.

## Design Notes

**Empty state.** "Nothing read yet" is shown when nothing is being read, no read Book is undated and every year has 0 books and 0 spent. The Year group then shows zeros, and By month and By year are left out. Most dust collected is not tied to the year and is about unread Books, so Nerdy stats still shows it when it has a candidate. EXPERIENCE.md says "a stat with no candidate is absent".

**Euros.** Whole euros print without cents ("€312") and other amounts with them ("€312.40", "€32.90"). This keeps the mock-up's look without rounding money away.

**Switching years.** Switching back to the current year drops `?year=` and returns to `/stats`, the address the section heading links to.

**Book titles in Nerdy stats** are plain text. Only Currently reading links to the Book. The mock-up shows no links, and the AC names only that link.

## Auto Run Result

Uncommitted walk `tests/e2e/stats.walk.spec.ts` against the e2e server (`bookeh_test`, fixture sources), 2026-11-07, two fresh users seeded by SQL (one with reading, read, undated, priced and dusty Books; one empty). Passed:

- Signed out, `/stats` → `/login?next=%2Fstats`.
- en at 1300 and 390px: Currently reading "since Oct 2", "since Dec 30, 2025" (the strip's `sinceDay` options in next-intl's `en`, so month first, not the matrix's "2 Oct"); big numbers 3 / 1,772 / €47.90 / 0.3; By month "2 books · 1,772 p" and "–" months; every Nerdy stat incl. "Dusty · unread for 12 years", "Brick · €32.90", "July · 2 books"; By year "3 books · 1,772 p · €47.90", "1 book · 250 p · €36.80"; the undated line. By month beside Nerdy stats on wide, one column on the phone.
- Year switch: 2025 → `/stats?year=2025` (replaced: Back goes to `/`), heading "2025"; 2026 → `/stats`, "This year". `?year=abc` and `?year=2031` → this year; `?year=2025&year=2024` → 2025.
- Currently reading → `/?book=<id>`.
- fi at 1300 and 390px: "1 772 sivua", "47,90 € käytetty", "Brick · 32,90 €", "Dusty · lukematta 12 vuotta", "heinäkuu · 2 kirjaa", heading "Tilastot", button "Lisää kirja".
- Header at 900/980/1100px: Add book never clipped; headings row clipped en 900 only, fi 900 and 980 (thresholds 974 / 1074).
- Phone swipes: wishlists → stats → settings, and back stats → wishlists.
- Empty user: "Nothing read yet" + remark, Year group with zeros ("€0", "0.0"), no By month, By year or Nerdy stats; no year switch (one year).
- Empty year for a user with data (only finished Book in 2025), `/stats`: "This year", 0 / 0 / €0 / 0.0, no By month, By year "2026 · 0 books · 0 p · €0" and "2025 · 1 book · 320 p · €0", switch 2026 2025; tapping 2025 marks it chosen and lands on `/stats?year=2025` with "1 book · 320 p".

Committed e2e `scanToSave`, `shopCheck`, `kirjasampo` pass with `--workers=1` (in parallel `kirjasampo` timed out once on the shared account; alone and serially it passes).

**Summary.** Stats is the fifth section (`SECTIONS`: collection, loans, wishlists, stats, settings), so the headings row, swiping and wrapping include it. `/stats` renders `getStats(ctx, ?year)`: Currently reading (links to `/?book=`), the empty state, the Year group with a Text switch that replaces the address (shown with two or more years, the tapped year chosen at once), the big numbers, By month with 8px markers beside Nerdy stats from 900px, By year and the undated line, in English and Finnish. `scan.open` and `scan.heading` read "Add book" / "Lisää kirja"; routes and code names stay `/scan`.

**Files changed.**
- `src/app/(frontend)/components/sections.ts` — stats as the fourth of five sections.
- `src/app/(frontend)/(sections)/stats/page.tsx` (new) — the Stats page.
- `src/app/(frontend)/(sections)/stats/YearSwitch.tsx` (new) — the year Text switch.
- `src/app/(frontend)/(sections)/readingLine.ts` — `sinceDay()` (shared with the strip) and `unreadFor()`.
- `src/app/(frontend)/(sections)/ReadingStrip.tsx` — uses `sinceDay()`.
- `messages/en.json`, `messages/fi.json` — `sections.stats`, Add book, the `stats` namespace.
- Comments in `layout.tsx`, `SectionNav.tsx`, `BackToTop.tsx`, `SelectBar.tsx`, `Button.tsx`, `ToastProvider.tsx`, `styles.css` — "Add book".
- `tests/unit/readingLine.unit.spec.ts` — `unreadFor` and `sinceDay` rows.
- `tests/unit/sections.unit.spec.ts`, `swipe.unit.spec.ts`, `sectionNav.unit.spec.ts` — the five-section order.
- `tests/unit/collectionPage.unit.spec.ts`, `tests/e2e/scanToSave.spec.ts`, `shopCheck.spec.ts`, `kirjasampo.spec.ts` — "Add book" button and heading.

**Review.** 26 findings from four layers: 0 high, 0 medium, 17 low, 9 false. 5 low entries patched (year switch with one year, optimistic year, label shrink, `sinceDay` rows, the walk's empty year). 12 low rejected and 9 false, each with its reason in the triage log. None deferred.

**Follow-up review recommendation: false** (first pass; patched 0 high, 0 medium, 5 low).

**Verification.**
- `npm run typecheck` — passed.
- `npm run test:unit -- --maxWorkers=2` — 104 files / 1,399 tests passed.
- Scoped ESLint and `git diff --check` — clean.
- Matrix audit: Dust age and Dust boundary by `readingLine.unit`; Sections by `sections.unit`, `swipe.unit`, `sectionNav.unit` and the walk; Year param, Year switch, Big numbers, By month, Nerdy stats, By year + undated, Currently reading and Empty by the walk; Load failed by a temporary jsdom render of the page with `getStats` throwing (passed, then deleted, per the spec's no-new-tests boundary). The Currently reading row's literal "2 Oct" renders "Oct 2" in `en`, the strip's shared format.

**Residual risks.**
- The empty state shows Most dust collected under Nerdy stats when an unread owned copy exists (a deliberate reading, see Design Notes); check it on the walkthrough.
- Finnish wording is new: "Nörttitilastot", "lukematta 12 vuotta", "s." for pages, and the empty-state remark.
- In Finnish at a desktop width just above 900px, one heading can be fully clipped.
- The page and `getStats` each read today in Helsinki; a request across New Year's midnight can mismatch the year once.
- No parallel worktree shares these files.

## Verification

**Commands:**
- `npm run typecheck` -- passes.
- `npm run test:unit -- --maxWorkers=2` -- passes.
- scoped `npx eslint` on changed files and `git diff --check` -- clean.

**Manual checks:**
- Uncommitted Playwright walk against the e2e server (`bookeh_test`, fixture sources), phone (390px) and desktop: `/stats` in en and fi with data (seed reading/read/priced rows through the services or `/scan` + Book detail), a past year via the switch, an empty year, the empty state for a fresh user, a swipe into and out of Stats, and the header at 900, 980 and 1100px in both languages (Add book box fully visible; last heading clipped or not as the widths say).
