---
title: '10.5 Stats service'
type: 'feature'
created: '2026-11-07'
baseline_revision: 'd7f9f08ccfa885b3b87f3457bbe4f7d96a29d1e2'
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

**Problem:** Stats (FR-57) needs every number of FR-58 computed from stored rows, and nothing computes them: no reader returns the viewer's read Books with dates, priced copies or the dust candidate, and no service turns them into `Stats`.

**Approach:** Three read-only readers beside `readingNow()` in `lib/shelf` (`readingLog`, `spending`, `dustCandidates`) return ids, dates and prices on the AD-7 fragments. A new `lib/stats` has the pure `computeStats()` (every FR-58 definition, tie rule and null) and `getStats(ctx, year?)`, which runs the readers, hydrates the Books it needs through one `getEffectiveBooks()` and calls `computeStats()`. No page (10.6).

## Boundaries & Constraints

**Always:** PRD FR-58; spine AD-7 (readers on `visibleCopies`/`visibleEntries`, AD-4 `readableBy` on `books`, held = visible copy, owned or ordered, or visible open entry), AD-8 (reading state derived by `readStateOf`), Dates convention (calendar dates read back as their UTC `YYYY-MM-DD`; today is `helsinkiToday()`), shared shapes `Stats`/`YearStats`/`BookDays` as the spine declares. `lib/stats` imports from `src/lib` only `shelf`, `books` (and `payload` for `Context`, `errors`, `processState` as every service), enforced in `eslint.config.mjs`. Pages and authors from the effective Book. Spine updated in the same commit wherever the code differs from it.

**Never:** No table, column, cache or stored champion (AD-12 not used). No `/stats` page, section, strings or rename (10.6). No change to `readingNow()`'s output or order. No Book hydrated that no stat shows (dust: only the winner).

## I/O & Edge-Case Matrix

Today 2026-11-07 unless stated. "Log" = the viewer's held read Books.

| Scenario | Input / State | Expected Output |
|----------|--------------|-----------------|
| Finished in year | log: X finished 2026-03-02, Y finished 2025-12-31, Z read with no `finishedAt` | year 2026: books 1; 2025 in `years`/`byYear` with 1; `undated` 1 |
| Missing pages | finished in 2026: X 300 p, Y no pages | books 2, pages 300; Y never Thickest |
| Spending year | copies acquired 2026-01-05 €12,90 ordered, 2026-06-01 €20 owned, 2025-12-31 €5; one unpriced | 2026 `spent` 3290; 2025 `spent` 500; unpriced not counted, adds no year |
| Elapsed, current year | 2026: 22 books, 3 300 pages, today 2026-11-07 | `booksPerMonth` 2.0 (22/11); `pagesPerDay` 10.6 (3300/311); `months` 1..11 |
| Elapsed, past year | 2025 (365 days): 24 books, 7 300 pages | `booksPerMonth` 2.0, `pagesPerDay` 20.0, `months` 1..12 |
| Days a book | finished in year: A 2026-01-01→01-11 (10 d), B 01-01→01-21 (20 d), C finish only | `daysPerBook` 15.0; C not a Quickest/Slowest candidate |
| Quickest/Slowest ties | P 5 d finished 03-10, Q 5 d finished 02-01; R 30 d finished 05-01, S 30 d finished 04-01 | quickest Q, slowest S (earlier finish; then lower Book id) |
| Thickest / Most expensive ties | two Books of 500 p; two copies of €30 | the earlier finish; the earlier `acquiredAt`, then lower copy id |
| Best month | Mar 2 books 400 p, May 2 books 600 p, Jan 1 book | May; with equal pages, Mar |
| Most-read author | Kivi on 2 Books (one co-authored with Waltari), Waltari 2, Linna 1 | Kivi and Waltari tie at 2 → by name (fi collation): Kivi; one Book each → null |
| Dust | unread owned copies: X acquired 2019-05-01, Y 2019-05-01 created earlier; Z ordered 2010; W being read 2015; V read 2012 | Y, `since` 2019-05-01 (ordered, reading and read never count) |
| Year argument | `year` missing, 2031, or 2019 with nothing in it | the current Helsinki year (2026); an existing year is used as given |
| Years | finished in 2024 and 2026, priced copy in 2022 | `years` [2026, 2024, 2022], `byYear` same order, the current year present even when empty |
| Nothing at all | no rows | books/pages/spent 0, `booksPerMonth` 0, every other stat null, `months` 1..11 all zero, `byYear` [current], `undated` 0, `dust` null, `reading` [] |
| Not held / other user | A's read Book whose copies were removed; B's reading, read and priced rows, B's copy of A's Book | none counted for A |

</intent-contract>

## Code Map

- `src/lib/shelf/readingNow.ts:28-37` -- the held-Book `exists` pair and the `readableBy` join; extract the pair to `heldBook(viewer)` in `visibleCopies.ts` (on alias `b`, documented as AD-7's holding rule) and use it here and in `readingLog`. Output unchanged.
- `src/lib/shelf/visibleCopies.ts` -- `visibleCopies`, `visibleEntries`, `readableBy`; add `heldBook(viewer): SQL`.
- `src/lib/shelf/effective.ts` -- `readStateOf` (on alias `ub`, missing row → unread).
- `src/lib/shelf/stats.ts` (new) -- the three readers, each one `drizzleFor(ctx).execute(sql\`...\`)` as `readingNow`, dates as `to_char(col at time zone 'UTC', 'YYYY-MM-DD')`:
  - `readingLog(ctx): Promise<LoggedRead[]>` -- `{ bookId, readingSince: string | null, finishedAt: string | null }`, the viewer's `user_books ub` with `${readStateOf} = 'read'`, joined to readable `books b`, held. Order by Book id.
  - `spending(ctx): Promise<PricedCopy[]>` -- `{ copyId, bookId, acquiredAt, price }`, visible copies (owned or ordered) with `price is not null`. Order by copy id.
  - `dustCandidates(ctx): Promise<DustCopy[]>` -- `{ copyId, bookId, acquiredAt, createdAt }` (`createdAt` ISO), visible copies with `status = 'owned'`, readable Book, `left join user_books ub on ub.book_id = copies.book_id and ub.owner_id = viewer`, `${readStateOf} = 'unread'`.
  - Types exported from this file. Columns: `copies.acquired_at`, `copies.price`, `copies.status`, `copies.created_at`; `user_books.reading_since`, `finished_at`.
- `src/lib/stats/computeStats.ts` (new) -- types `BookDays`, `YearStats`, `Stats` (spine Structural Seed, `src/lib/stats`), `StatsInput = { today; year?; reading: ReadingBook[]; log: LoggedRead[]; priced: PricedCopy[]; dust: DustCopy[] }`, `computeStats(input, books: Map<number, EffectiveBook>): Stats` and `pickDust(dust): DustCopy | null` (min by `acquiredAt`, `createdAt`, `copyId`). Rows whose Book is not in `books` are skipped everywhere except `spent` (a sum of prices). Rounding: `booksPerMonth`, `pagesPerDay`, `daysPerBook` to one decimal (`Math.round(x * 10) / 10`). Day counts with `finishedDays()` from `src/fields/readingDates.ts`. Author ties with `Intl.Collator('fi')`, then id.
- `src/lib/stats/getStats.ts` (new) -- `getStats(ctx, year?: number): Promise<Stats>`: `Promise.all` of `readingNow`, `readingLog`, `spending`, `dustCandidates`; ids = log ∪ priced ∪ `pickDust(dust)?.bookId`; one `getEffectiveBooks()`; `computeStats({ today: helsinkiToday(), year, ... }, books)`. Doc comment cites FR-58 and "nothing is stored".
- `src/fields/readingDates.ts` -- `helsinkiToday()`, `finishedDays()` (reuse; `src/fields` is importable from `src/lib`).
- `src/lib/books/effectiveBook.ts:120` -- `getEffectiveBooks(ctx, ids)` returns a `Map`; `EffectiveBook.pages`, `.authors: Named[]`.
- `eslint.config.mjs:22-36` -- add `stats: ['shelf', 'books', 'payload']`.
- `tests/unit/spineLint.unit.spec.ts:39-53` -- the `layer zones` table lists one refused edge per service; add `['stats', COPIES]` (guards the spine import rule).
- `ARCHITECTURE-SPINE.md:158` (stats readers: names, shapes, `dustCandidates` returns owned copies of unread held Books and `lib/stats` picks), `:557-577` (one-decimal `pagesPerDay`/`daysPerBook`; tie rules of Thickest and Most expensive), `:669` (`stats.ts` under shelf).
- Test builders: `copyAs(user, { book, status, acquiredAt, price })`, `sharedBook({ by })`, `createUser`, `contextFor`, `upsertUserBook(ctx, bookId, { read, readingSince, finishedAt })` (noon-UTC ISO strings, as `readingNow.int.spec.ts`), `removeCopies`.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/shelf/visibleCopies.ts`, `readingNow.ts` -- `heldBook()` extracted and used.
- [x] `src/lib/shelf/stats.ts` -- `readingLog`, `spending`, `dustCandidates` and their row types.
- [x] `src/lib/stats/computeStats.ts` -- types, `pickDust`, `computeStats`.
- [x] `src/lib/stats/getStats.ts` -- the service.
- [x] `eslint.config.mjs`, `tests/unit/spineLint.unit.spec.ts` -- `stats` import zone and its refused-edge row.
- [x] `tests/unit/computeStats.unit.spec.ts` (new) -- one case per matrix row from "Finished in year" to "Nothing at all", `today` fixed, Books built inline as `EffectiveBook` literals.
- [x] `tests/int/stats.int.spec.ts` (new) -- one case, matrix row "Not held / other user", with A also holding one finished Book, one priced copy and one dust copy dated in the current year so the zeros are not vacuous: A's `getStats` counts exactly A's own.
- [x] `ARCHITECTURE-SPINE.md` -- the lines in the Code Map.

**Acceptance Criteria:**
- Given the viewer's rows, when `getStats(ctx, year?)` runs, then it returns `Stats` as the spine declares, read through the `lib/shelf` readers and one `getEffectiveBooks()`, so overrides apply to pages and authors.
- Given the matrix, when `computeStats()` runs, then each row's output holds; a stat with no candidate is null.
- Given another user's reading, read and priced rows, when the viewer's stats are computed, then none of them count (FR-48, AD-7).
- Given `lib/stats`, when ESLint runs, then an import from any `src/lib` service other than `shelf`, `books` and `payload` fails.
- Given the story is committed, then nothing is stored and the spine's stats readers, `Stats` comments and source tree match the code.

## Spec Change Log

## Review Triage Log

### 2026-11-07 — Review pass
- verdicts: 27 findings — high 0, medium 1, low 16, false 10, maybe-false 0
- findings:
  - `[medium]` `[patch]` Verification gap: no test covers `dustCandidates`' AD-4 `readableBy` join; without it an unreadable older copy wins `pickDust`, hydration drops it and Most dust collected is null — `stats.int` gains an owned, unread Book made private by its creator with an older copy; checked by removing the join (test fails), then restored.
  - `[low]` `[patch]` Verification gap (other): the new SQL `heldBook(viewer)` shares its name with `heldBook(ctx, bookId)` in `src/app/(frontend)/heldBook.ts` — renamed `holds(viewer, alias)`.
  - `[low]` `[patch]` Verification gap (other): the fragment hard-codes the `books` alias `b`, unlike `readableBy` — now takes `alias`; grouped with the Blind row below.
  - `[low]` `[patch]` Intent: "overrides apply to pages and authors" (epic AC) is not exercised at `getStats` — `stats.int` overrides the finished Book's pages to 150 and asserts `byYear` counts 150.
  - `[false]` `[reject]` Intent: Helsinki year only by construction — `getStats` passes `helsinkiToday()`, the shared primitive the other reading stories already rely on; `computeStats` takes `today` by design.
  - `[false]` `[reject]` Intent: malformed `?year=` not handled — `getStats` takes `number | undefined`; parsing the query belongs to the page (10.6), and an unknown number falls back as the AC says.
  - `[false]` `[reject]` Intent: lint allows `payload` while the spine says `shelf` and `books` — every service zone allows `payload` as infrastructure (e.g. `books: ['payload', 'undo']` where the spine says books imports no other service).
  - `[false]` `[reject]` Intent: hold/removal/dust rules live in SQL beyond the unit tests — covered at the database surface by `stats.int` and `readingNow.int`; the auditor notes it is consistent with the AC.
  - `[false]` `[reject]` Intent: tie rules beyond FR-58 — written into the spine in the same commit, as CLAUDE.md requires; not a defect.
  - `[false]` `[reject]` Intent: spending scope — the auditor finds it matches FR-58.
  - `[low]` `[patch]` Edge: a Book with effective pages 0 counted as paged (`pagesPerDay` 0, a 0-page Thickest) — `paged` now needs `pages` truthy; spine comment says 0 counts as none.
  - `[low]` `[reject]` Edge: `spending()` has no `readableBy`, so a priced copy of an unreadable Book adds to `spent` but never wins Most expensive — FR-58 counts the user's copies; an unreadable Book under a user's copy needs another user to make a shared Book private, which Phase 1 never does; the spec chose this.
  - `[false]` `[reject]` Edge: hydration can drop the `pickDust` winner while others qualify — `dustCandidates` applies the same AD-4 rule (`readableBy`) as the gateway read in `getEffectiveBooks()`, so the winner is always readable.
  - `[low]` `[reject]` Edge: four readers outside one transaction — single-user app, a concurrent write mid-render only skews one load; a read transaction adds plumbing for no seen problem.
  - `[low]` `[reject]` Edge: `readingNow()` hydrates on its own, so `getStats` makes two hydrations — `readingNow` is the spine's one reader of Books being read; one extra small query.
  - `[low]` `[patch]` Edge: docstring and spine say "only the Books a stat shows" are hydrated, while every logged and priced Book is — both reworded to what the code does.
  - `[low]` `[patch]` Blind: same as the Edge hydration-wording row — grouped, reworded.
  - `[low]` `[reject]` Blind: Most-read author ties on display `name`, not `sortName` — FR-58 says "ties by name"; `Named` carries no sort name and an exact tie at the top is rare; carrying `sortName` adds a field to a shared shape.
  - `[low]` `[patch]` Blind: spine `YearStats` has no tie rules for `bestMonth` and `topAuthor` — comments added in the spine and `computeStats.ts`.
  - `[low]` `[reject]` Blind: a €0 copy counts as priced and can be Most expensive alone — the spec's Design Notes chose it (FR-58's "priced copy"); rare.
  - `[false]` `[reject]` Blind: one timed Book is both Quickest and Slowest — FR-58 defines both and the same Book is the candidate for each; whether to show both is the page's call (10.6).
  - `[low]` `[patch]` Blind: `heldBook` hard-codes alias `b` — grouped with the verification-gap row; takes `alias` now.
  - `[low]` `[reject]` Blind: module-local `day()` builds SQL with `sql.raw` — not exported, constant column names only; inline `to_char` in four places reads worse.
  - `[false]` `[reject]` Blind: the open/closed-entry branch of the extracted holding rule is untested — `readingNow.int` covers both through the same fragment (`wished`, `closed`).
  - `[low]` `[reject]` Blind: `readingLog`/`spending` asymmetry on `readableBy` — same as the Edge spending row.
  - `[false]` `[reject]` Blind: spec and epic context missing from the diff — excluded from the review diff on purpose; committed with the story.
  - `[low]` `[reject]` Blind: int test can flake across Helsinki midnight on 31 December — needs the run to straddle New Year's midnight; a `today` parameter on `getStats` would widen the service for a test.

## Design Notes

**Why `dustCandidates` returns copies, not one Book.** The tie rule has to be a pure, unit-tested definition, so SQL only narrows to owned copies of unread held Books and `pickDust()` takes the minimum by (`acquiredAt`, `createdAt`, `copyId`). The minimum copy's Book is the winner, and its `acquiredAt` is that Book's earliest owned copy, so no per-Book grouping is needed. Only the winner is hydrated. The spine's `dustCandidate` is renamed to say this.

**Choices FR-58 leaves open, written into the spine:** Thickest ties go to the earlier finish, then Book id; Most expensive ties to the earlier `acquiredAt`, then copy id (a €0 copy is priced and can win only alone); `pagesPerDay` is null when the year's finished Books have no pages, `daysPerBook` when none has both dates; Quickest and Slowest fall back to Book id after the finish date. A read Book counts in `years` only by its `finishedAt`.

## Verification

**Commands:**
- `npm run typecheck` -- passes.
- `npm run test:unit -- --maxWorkers=2` -- full suite passes.
- `npm run test:int -- stats readingNow shelfIds` -- passes on `bookeh_test`.
- scoped `npx eslint` on changed files and `git diff --check` -- clean.

## Auto Run Result

Status: done

**Summary.** `getStats(ctx, year?)` in a new `lib/stats` computes FR-58 on every call from three read-only readers in `lib/shelf/stats.ts` (`readingLog`, `spending`, `dustCandidates`) plus `readingNow()`. It hydrates the logged and priced Books and the dust winner through one `getEffectiveBooks()` and hands them to the pure `computeStats()`. That function holds every definition, tie rule, the elapsed months and days, one-decimal rounding and the nulls. The holding rule shared with `readingNow()` is now the `holds(viewer, alias)` fragment. The ESLint zone limits `lib/stats` to `shelf`, `books` and `payload`. Nothing is stored.

**Files changed.**
- `src/lib/shelf/visibleCopies.ts` — `holds(viewer, alias)`, AD-7's holding rule.
- `src/lib/shelf/readingNow.ts` — uses `holds()`; output unchanged.
- `src/lib/shelf/stats.ts` (new) — the three stats readers and their row types.
- `src/lib/stats/computeStats.ts` (new) — `Stats` types, `pickDust`, `computeStats`.
- `src/lib/stats/getStats.ts` (new) — the service.
- `eslint.config.mjs`, `tests/unit/spineLint.unit.spec.ts` — `stats` import zone and its refused edge.
- `tests/unit/computeStats.unit.spec.ts` (new) — 14 cases, one per matrix row.
- `tests/int/stats.int.spec.ts` (new) — two users; held, removed, ordered, reading, read and made-private Books; an override on pages.
- `ARCHITECTURE-SPINE.md` — AD-7 readers, `holds`, `pickDust`, hydration; `YearStats` tie and null rules; source tree.
- `epic-10-context.md` — recompiled (the spine was newer), `dustCandidates`.

**Review.** 27 findings from four layers. 7 rows were patched in 5 entries: 1 medium (dust AD-4 test) and 4 low (`holds` rename and alias, 0-page Books, hydration wording, missing tie comments, override case). 20 were rejected with reasons (10 false, 10 low). None was deferred. The parent applied the patches directly.

**Follow-up review recommendation: false** (first pass, 1 medium and no high patched).

**Verification.**
- `npm run typecheck` — passed.
- `npm run test:unit -- --maxWorkers=2` — 104 files / 1,385 tests passed.
- `npm run test:int -- stats readingNow shelfIds` — 3 files / 6 tests passed. The made-private dust case fails when `readableBy` is removed from `dustCandidates`.
- Scoped ESLint and `git diff --check` — clean.
- Matrix audit: rows Finished in year to Nothing at all are covered by `computeStats.unit`. The Dust exclusions, the unpriced copy adding no year, and Not held / other user are covered by `stats.int`.
- No screen changed, so no Playwright walk.

**Residual risks.**
- A priced copy of a Book the viewer can no longer read counts in `spent` and `years` but not in Most expensive.
- On a large price history, every priced Book is hydrated on each Stats load.
- Most-read author ties use the display name.
- No parallel worktree shares these files.
