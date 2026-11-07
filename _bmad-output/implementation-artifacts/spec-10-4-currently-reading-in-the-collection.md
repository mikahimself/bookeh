---
title: '10.4 Currently reading in the collection'
type: 'feature'
created: '2026-11-07'
status: 'done'
baseline_revision: '4521492ce7393130eb2b9c89a94f59af56bf1c99'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The collection cannot show or find the Books being read: the Read filter is a single read/unread boolean, nothing lists Books in reading, and a row of a Book being read looks like any other (FR-56).

**Approach:** Add `readingNow(ctx)` to `lib/shelf`. Make the Read filter a `ReadState[]` list (unread, reading, read) in `ShelfQuery`, the URL, `filterValues()`, the Filter panel and the count line. On `/`, mount a "Currently reading" strip of cover tiles above the count line. Rows of a Book being read end with the 8px marker and "Reading". Both come from one `readingNow()` read on the page, so both follow `afterAction`'s `router.refresh()`.

## Boundaries & Constraints

**Always:** PRD FR-56, FR-48. Spine AD-7 (one shelf module, `visibleCopies`/`visibleEntries`, AD-4 read rule on `books`, filter values never narrowed by the query), AD-8 (state derived: read when `read`; reading when not read and `readingSince` set; otherwise unread, a missing row unread). Shared shapes `ShelfQuery.filters.read: ReadState[]`, `FilterValues.read: Counted<{ value: ReadState }>[]` in the order unread, reading, read, and `ReadingBook = { book: EffectiveBook; since: string }` (`since` `YYYY-MM-DD`). URL `read=unread|reading|read`, repeatable, deduplicated; values OR within the field, AND with other fields. EXPERIENCE.md → Collection controls (Currently reading, Row ending); DESIGN.md → Currently reading strip, Reading marker. Dates formatted by next-intl as `ReadAndRating` does (`dateStyle: 'medium'`). Every new string in `en.json` and `fi.json`. The spine is checked against the built code and corrected in the same commit.

**Never:** No change to `ShelfRow`, `getShelfRows()` or `shelfIds()`'s return shape. No reading marker on cover tiles (DESIGN.md's Cover tile names none). No Stats readers or `/stats` (10.5, 10.6). No divider or box around the strip (DESIGN.md wins over the mock-up's border). No local patching of rows. No committed Playwright spec.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Strip order | A reads X since 2026-10-21, Y since 2026-11-03, Z since 2026-10-21 (Z id > X id) | `readingNow` → X, Z, Y; strip tiles in that order, each "since {date}" | — |
| Held only | reading rows on: a Book with an owned copy; one with only an ordered copy; one with only an open wishlist entry; one whose copies were all removed; one whose only entry is closed | the first three listed, the last two not | — |
| Other user | B reads a Book A also owns; B reads B's own Book | neither in A's `readingNow`; A's `read=reading` lists no copy of them | — |
| Nothing read / select mode | `readingNow` empty, or select mode on | no strip, no heading | — |
| Search or filter on | `q=x&read=read` with Books being read | strip unchanged; count line lists the filters as now | — |
| Read filter | `read=reading&read=unread` | copies of Books reading or unread (no row = unread); count line names "reading, unread" (values in URL order) | — |
| Bad URL values | `read=true`, `read=foo`, `read=read&read=read` | first two dropped (no filter); duplicate kept once | — |
| Filter values | A: X read (2 copies), Y reading (1), W unread with row (1), V no row (1) | `read: [{unread,2},{reading,1},{read,2}]`; a state with no copies left out | — |
| Row ending | Book being read: owned with location; lent; ordered | marker + "Reading"; "Lent · {person}"; "Ordered" | — |
| After an action | Book detail switch Unread → Reading, bulk Read on a selection, or Undo | after `afterAction`'s refresh, strip and row endings show the new state | — |
| Read fails | `readingNow` throws on the page | logged; no strip, no Reading endings; list renders | — |

</intent-contract>

## Code Map

- `src/lib/shelf/query.ts:23-73` -- `ShelfQuery.filters.read: boolean` → `ReadState[]`; `FilterValues.read` → `Counted<{ value: ReadState }>[]`; add `export type ReadingBook = { book: EffectiveBook; since: string }` beside `MyBook` (import `ReadState` from `@/lib/books/effectiveBook`). Parser `:167` becomes `set('read', list(all('read'), oneOf(READ_STATES)))` with `READ_STATES = ['unread','reading','read']`; writer `:212` `add('read', f.read)`. Drop the then-unused `bool`. Update the header comment if it mentions read.
- `src/lib/shelf/effective.ts` -- add `export const readStateOf: SQL` = `(case when ub.read is true then 'read' when ub.reading_since is not null then 'reading' else 'unread' end)`, documented as AD-8's derivation on the `ub` alias (missing row → unread), the SQL twin of `readState()` in `src/lib/books/userBookState.ts:8`.
- `src/lib/shelf/filters.ts:37` -- `if (read?.length) conditions.push(sql\`${readStateOf} in ${read}\`)`; doc comment says read is a state list.
- `src/lib/shelf/filterValues.ts:14,50,76` -- `READ = ['unread','reading','read'] as const`; group by `${readStateOf} as value`; map in that order; doc comment.
- `src/lib/shelf/readingNow.ts` (new) -- `readingNow(ctx): Promise<ReadingBook[]>`. One Drizzle query from `user_books ub join books b on b.id = ub.book_id and ${readableBy(viewer,'b')}` where `ub.owner_id = viewer`, `ub.read is not true and ub.reading_since is not null`, and (`exists` a `copies` row of `b` under `visibleCopies(viewer)` or `exists` a `wishlist_entries` row of `b` under `visibleEntries(viewer)` and `closed_at is null`); select `ub.book_id` and `to_char(ub.reading_since at time zone 'UTC', 'YYYY-MM-DD') as since`; `order by ub.reading_since asc, ub.book_id asc`. Hydrate with `getEffectiveBooks()`; a Book missing from it drops. Pattern: `searchMine.ts` (subqueries on the unaliased tables, `drizzleFor(ctx)`). Doc comment quotes AD-7's rule in its own words.
- `src/app/(frontend)/(sections)/page.tsx:59` -- add `readingNow(ctx).catch(...)` to the `Promise.all` (log `'The books being read failed to load'`, fall back to `[]`); pass `reading` to `CollectionList`. Doc comment names the strip.
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- new prop `reading: ReadingBook[]`. Before the count line (after `ProgressLine`), render `<ReadingStrip>` when `!selecting && reading.length > 0`. Build `const readingIds = new Set(reading.map((r) => r.book.bookId))` and pass `reading={readingIds.has(row.book.bookId) ? t('readingMarker') : undefined}` to `BookRow` only. Doc comment.
- `src/app/(frontend)/(sections)/ReadingStrip.tsx` (new, client) -- `<section aria-labelledby>` with `<h2 className="text-heading-group text-text-muted ui-case">` "Currently reading" (the Filter panel's heading class), then `<ul>` `flex gap-3 overflow-x-auto` with one `<li className="w-tile-s shrink-0">` per Book. Each is a `next/link` to `shelfHref(query, { book })` with `replace={open !== null}`, `scroll={false}` and `prefetch={false}`, as `CollectionList`'s `opens`. Inside: `<Cover src title language>` (2:3 with the frame, from `../components/Cover`), title `truncate pt-1 text-label text-text`, then "since {date}" `truncate text-label text-text-muted`. Date via `useFormatter().dateTime(new Date(\`${since}T12:00:00Z\`), { dateStyle: 'medium' })` (`ReadAndRating.tsx:134`). Space below before the count line: `pb-2` or `mb-2`.
- `src/app/(frontend)/(sections)/BookRow.tsx:42-94` -- new optional prop `reading?: string`. Ending precedence: lent (as now), else `ordered` for an ordered copy, else when `reading` is given the marker span + `reading` in `text-text` (the lent markup at `:86-89`), else the location. Doc comment adds the Reading ending and its precedence.
- `src/app/(frontend)/(sections)/filterToggle.ts:21-47` -- `read` becomes an ordinary list field: drop the `F extends 'read'` branch of `ListedValue` and the `field === 'read'` special case; update both doc comments.
- `src/app/(frontend)/(sections)/FilterPanel.tsx:222-230` -- Read options `key: value`, `label: t(\`filterValues.${value}\`)`, `on: f.read?.includes(value) ?? false`.
- `src/app/(frontend)/(sections)/countLine.ts:9,55` -- add `'reading'` to `CountLineKey`; `...(f.read ?? []).map((state) => t(state))`.
- `messages/en.json`, `messages/fi.json` (`collection`) -- `filterValues.reading`, `readingNow`, `readingSince`, `readingMarker` (Design Notes). `collection.reading` already exists for the count line.
- `ARCHITECTURE-SPINE.md:158` -- AD-7's `readingNow` line: it also feeds the collection rows' Reading ending, read once on `/`. `:154`, `:529`, `:548` and `:553` already state the shapes: verify against the code.
- Tests to update (shape change): `tests/unit/shelfQuery.unit.spec.ts:35,81`, `tests/unit/filterToggle.unit.spec.ts:16-29`, `tests/unit/collectionCountLine.unit.spec.ts:26-56`, `tests/unit/collectionList.unit.spec.ts:155` (pass `reading: []`), `tests/int/shelfFilters.int.spec.ts:210` (read test), `tests/int/shelfValues.int.spec.ts:225` (read counts). Two-user access test: `tests/int/shelfIds.int.spec.ts:67`. Reading rows can be written with `upsertUserBook(ctx, bookId, { readingSince: '2026-10-21T12:00:00.000Z' })` (`src/lib/books/upsertUserBook.ts:43`). Builders: `sharedBook`, `copyAs`, `createUser`, `contextFor` (`tests/helpers`). Wishlist entries: see an existing int spec that creates `wishlist-entries` (e.g. `searchMine.int.spec.ts`).

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/shelf/query.ts` -- `ReadState[]` filter, `FilterValues.read`, `ReadingBook`, parser and writer.
- [x] `src/lib/shelf/effective.ts`, `filters.ts`, `filterValues.ts` -- `readStateOf` and its two uses.
- [x] `src/lib/shelf/readingNow.ts` -- the reader.
- [x] `src/app/(frontend)/(sections)/page.tsx`, `CollectionList.tsx`, `ReadingStrip.tsx`, `BookRow.tsx` -- strip and row ending.
- [x] `src/app/(frontend)/(sections)/filterToggle.ts`, `FilterPanel.tsx`, `countLine.ts` -- three-valued Read filter.
- [x] `messages/en.json`, `messages/fi.json` -- strings.
- [x] `tests/int/readingNow.int.spec.ts` (new) -- one case: the Strip order and Held only rows of the matrix (same-day tie by Book id; copy removed and closed entry not listed).
- [x] `tests/int/shelfIds.int.spec.ts` -- the access test gains B reading a Book A also owns and B's own Book: `readingNow(asA)` returns neither and `shelfIds(asA, { read: ['reading'] })` lists none (spine Tests row: shelf access).
- [x] `tests/int/shelfFilters.int.spec.ts` -- the read test covers reading and OR within the field (`['reading','unread']`).
- [x] `tests/int/shelfValues.int.spec.ts` -- read counts in the three states.
- [x] `tests/unit/shelfQuery.unit.spec.ts`, `filterToggle.unit.spec.ts`, `collectionCountLine.unit.spec.ts`, `collectionList.unit.spec.ts` -- follow the new shape (repeatable `read`, `read=true` dropped); no new test files.
- [x] `ARCHITECTURE-SPINE.md` -- AD-7 `readingNow` line; shapes verified.
- [x] Uncommitted `tests/e2e/reading.walk.spec.ts` -- phone (390px) and desktop (1280px) walk on the fixture server: with two Books started on different days, the strip shows both oldest first with "since {date}" and hides in select mode; tapping a tile opens Book detail; Read filter Reading lists only their copies and the count line names it; a row of one ends "Reading", and a lent or ordered copy of a Book being read does not; marking one Read on Book detail drops it from the strip and its row ending after the refresh; result under `## Auto Run Result`.

**Acceptance Criteria:**
- Given held Books being read, when `/` renders, then the "Currently reading" strip sits above the count line with one cover tile per Book (title, "since {date}"), oldest start first, scrolling sideways when it overflows; a tile opens Book detail; it is absent when nothing is being read and in select mode, and ignores search and filters.
- Given `readingNow(ctx)`, when called, then it returns only the viewer's Books in reading that have a visible copy or open entry, in `readingSince` then Book id order, and never another user's (AD-7, FR-48).
- Given the Read filter, when values are chosen, then it offers unread, reading and read with copy counts, the URL carries repeatable `read=` values ORed within the field, and the count line names the active values.
- Given a row of a Book being read, when it renders, then it ends with the 8px marker and "Reading" unless the copy is lent or ordered.
- Given an action that changes reading state, when `afterAction` (or a toast Undo) refreshes, then the strip and row endings show the new state.
- Given the UI in Finnish, then every new string is translated.
- Given the spine, when the story is committed, then its `readingNow`, `ShelfQuery.filters.read` and `FilterValues.read` statements match the code.

## Spec Change Log

## Review Triage Log

### 2026-11-07 — Review pass
- verdicts: 21 findings — high 0, medium 4, low 11, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: "since {date}" with `dateStyle: 'medium'` truncates on the 70px tile ("since Oct …"), hiding the tile's one extra fact — now day + short month, the year only when not this Helsinki year; walk re-run reads "since Oct 28".
  - `[low]` `[patch]` Blind: `readingNow` restated AD-8 in SQL beside `readStateOf` — now `${readStateOf} = 'reading'`.
  - `[medium]` `[patch]` Blind: row-ending precedence, strip in select mode and a failed `readingNow` have no committed test (ACs name them) — grouped with the two verification-gap rows; `readingNow` mock now settable in `tests/helpers/collectionPage.ts`; lent-row case extended, two cases added in `collectionPage.unit.spec.ts`.
  - `[low]` `[reject]` Blind: strip tiles never carry the selection bar for the open Book — DESIGN.md's strip names no selection state; adds a branch for a cosmetic cue.
  - `[low]` `[reject]` Blind: `readingNow` re-runs on every server render of `/` — one indexed query per render beside `filterValues()` and the others already there; not worth a cache.
  - `[low]` `[reject]` Blind: old `read=true`/`read=false` URLs drop to no filter — the spec's stated choice (Design Notes); single user, no stored shelf URLs beyond history; aliases add parser branches.
  - `[low]` `[reject]` Blind: a failed shelf read also hides the strip (it mounts inside the list) — needs the shelf read to fail while `readingNow` succeeds; Load failed is already the screen's state; moving the mount adds layout work.
  - `[low]` `[patch]` Blind: unrelated `theme` `sql.join` reformat in `filters.ts` and two overlong rewritten doc comments — reformat reverted, comments rewrapped.
  - `[low]` `[patch]` Blind: AD-4 read rule on `books` in `readingNow` has no case — row added to `readingNow.int.spec.ts` (a held, read-in-progress Book made private by its creator is not listed). It cannot fail on the join alone: `getEffectiveBooks()` drops the Book too.
  - `[low]` `[reject]` Edge: Keep-my-place restore lands a strip-height off when the strip appears or vanishes between visits — needs a reading change between leaving and returning; compensation adds state to `shelfPlace`.
  - `[low]` `[reject]` Edge: rows jump up when select mode removes the strip — the absence in select mode is EXPERIENCE.md's rule; reserving the height defeats it.
  - `[low]` `[reject]` Edge: old `read=` URLs lose their filter — same as the Blind row above.
  - `[medium]` `[patch]` Verification gap: row ending precedence untested (AC 4) — pre-verified; grouped with the Blind test row, fixed there.
  - `[medium]` `[patch]` Verification gap: strip appearance, select mode and failed read untested (AC 1, matrix "Read fails") — pre-verified; grouped with the Blind test row, fixed there.
  - `[low]` `[patch]` Verification gap (other): `theme` reformat in `filters.ts` — grouped with the Blind churn row, reverted.
  - `[low]` `[reject]` Verification gap (other): old `read=` URLs — same as the Blind row.
  - `[false]` `[reject]` Intent: the strip/row surface rests only on the uncommitted walk — no longer true after the patch: `collectionPage.unit.spec.ts` now renders both; the walk remains as the spec asks.
  - `[false]` `[reject]` Intent: the epic says the count line names "the active value", the diff names all — with a repeatable filter every active value is "the active value" of its field, as status and location already do.
  - `[false]` `[reject]` Intent: a wishlist-only Book shows in the strip — the spine's AD-7 and the epic say "visible copy or open entry"; FR-56's "held" includes entries.
  - `[low]` `[patch]` Intent: unrelated `theme` reformat — grouped with the Blind churn row, reverted.
  - `[false]` `[reject]` Intent: old URLs drop silently with no PRD basis — a consequence of the spine's `read=unread|reading|read` URL values; the parser's drop rule is the spine's.

## Design Notes

**Why rows read `readingNow()` and not `ShelfRow`.** The set of Books being read is small and complete for the viewer (the strip ignores filters), and a row is always a held Book. So one read on the page feeds the strip and every row, including rows loaded later through `/data/shelf`. `ShelfRow`, `shelfIds()` and their tests stay as they are. After any reading change, `afterAction` reloads rows and then calls `router.refresh()`, which re-runs the page's `readingNow()`. Strip and endings change together.

**Old URLs.** `read=true`/`read=false` from before this story no longer parse and drop to no filter, as any bad value does (`parseShelfQuery`'s rule).

Messages, en / fi (`collection`):
- `readingNow`: "Currently reading" / "Luettavana"
- `readingSince`: "since {date}" / "{date} alkaen"
- `readingMarker`: "Reading" / "Kesken" (as the switch's "kesken")
- `filterValues.reading`: "Reading" / "Kesken"

## Verification

**Commands:**
- `npm run typecheck` -- passes.
- `npm run test:unit -- --maxWorkers=2` -- full suite passes.
- `npm run test:int -- readingNow shelfIds shelfFilters shelfValues getShelfRows` -- passes on `bookeh_test`, push off.
- scoped `npx eslint` on changed files and `git diff --check` -- clean.
- `npx playwright test tests/e2e/reading.walk.spec.ts` -- walk passes; not committed.

## Auto Run Result

`npx playwright test tests/e2e/reading.walk.spec.ts -g 10.4` (uncommitted, appended beside 10.2's walk): passed at 1280px and 390px. Strip above the count line with both Books oldest first and "since {date}", unaffected by the search; hidden in select mode and back on Done. Row endings: "Reading" with the marker in place of the location; the lent copy ends "Lent · {person}", the ordered one "Ordered", an unread Book its location. `read=reading` lists the four copies of the two Books and the count line reads "“…”, reading · 4 books · Clear"; on desktop the Filter panel's Reading option sets the same URL. A tile opens Book detail (`?book=`); Read on the switch drops the Book from the strip and its row ends with the location after the refresh. Screenshots in `/private/tmp/bookeh-reading-{strip,filter,after}-{1280,390}.png`. Seen: at 70px the "since {date}" line truncates ("since Oct …"), as `truncate` on the covers-s width does.

Re-run after the review patches: `npx playwright test tests/e2e/reading.walk.spec.ts -g 10.4` passed (13.2 s) with the strip reading "since Oct 28" (no year in the current year), untruncated at 1280px and 390px.

Status: done

**Summary.** The collection shows what is being read. `readingNow(ctx)` in `lib/shelf` lists the viewer's Books in reading that are still held (visible copy, owned or ordered, or open wishlist entry), oldest start first then Book id, under the AD-4 read rule. On `/` the page reads it once: the "Currently reading" strip of covers-s tiles ("since {date}") sits above the count line, scrolls sideways, opens Book detail, and is gone in select mode, when empty or when the read fails; the same list marks rows of those Books with the 8px marker and "Reading", which lent and ordered endings beat. The Read filter is now `ReadState[]` (`read=unread|reading|read`, repeatable, ORed) in the parser, `readStateOf` SQL, `filterValues()`, the Filter panel and the count line. `afterAction`'s refresh re-reads `readingNow()`, so strip and endings follow any reading change.

**Files changed.**
- `src/lib/shelf/query.ts` — `ReadState[]` filter, `FilterValues.read`, `ReadingBook`, parser and writer.
- `src/lib/shelf/effective.ts` (`readStateOf`), `filters.ts`, `filterValues.ts` — three-state derivation in SQL.
- `src/lib/shelf/readingNow.ts` (new) — the reader.
- `src/app/(frontend)/(sections)/page.tsx`, `CollectionList.tsx`, `ReadingStrip.tsx` (new), `BookRow.tsx` — strip and row ending.
- `src/app/(frontend)/(sections)/filterToggle.ts`, `FilterPanel.tsx`, `countLine.ts` — three-valued Read filter.
- `messages/en.json`, `messages/fi.json` — strip, marker and filter strings.
- `ARCHITECTURE-SPINE.md` — AD-7's `readingNow` line (strip, row endings, one read on `/`, `readStateOf`).
- Tests: new `readingNow.int`; cases in `shelfIds.int` (two-user), `shelfFilters.int`, `shelfValues.int`, `collectionPage.unit` (row endings, strip, failed read); shape updates in `shelfQuery`, `filterToggle`, `collectionCountLine`, `collectionList` unit specs; `tests/helpers/collectionPage.ts` settable `readingNow` mock.
- `epic-10-context.md` — recompiled (the spine was newer).

**Review.** 21 findings from four layers (log above): 7 rows patched in 5 entries (2 medium: strip date truncation, untested AC behaviours; 3 low: `readStateOf` reuse, AD-4 case, churn), 14 rejected with reasons, none deferred.

**Follow-up review recommendation: true** (first pass, 2 medium entries patched). Unverified on the real surface: the strip's look at phone width in Finnish ("28. lokak. alkaen" on 70px) and with long titles, and the scroll shift when select mode removes the strip — a walkthrough should settle both before 10.6 builds Stats' Currently reading on `readingNow()`.

**Verification (parent, after patches).**
- `npm run typecheck` — passed.
- `npm run test:unit -- --maxWorkers=2` — 103 files / 1,370 tests passed.
- `npm run test:int -- readingNow shelfIds shelfFilters shelfValues getShelfRows` — 5 files / 26 tests passed on `bookeh_test`, push off.
- Scoped ESLint — clean; `git diff --check` clean.
- Uncommitted walk — passed before and after the patches (date expectation updated to the new format).
- Matrix audit — Strip order, Held only: `readingNow.int`; Other user: `shelfIds.int`; Nothing read / select mode, Read fails, Row ending: `collectionPage.unit` and the walk; Search or filter on, After an action: the walk; Read filter, Bad URL values: `shelfFilters.int`, `shelfQuery.unit`, `collectionCountLine.unit`; Filter values: `shelfValues.int`.

**Residual risks.** The AD-4 case in `readingNow.int` passes even without the SQL `readableBy` join, since `getEffectiveBooks()` also drops an unreadable Book. Old `read=true`/`read=false` addresses now show the whole collection. `filters.ts` still fails `prettier --check` as it did at the baseline. No parallel worktree shares these files.
