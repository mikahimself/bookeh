# Epic 10 Context: Track what I read and see my stats

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Let each user track a Book as unread, being read or read, with editable start and finish dates, and record when each copy was acquired and what it cost. The collection shows what is being read, and a fifth section, Stats, counts books, pages and money per year plus a set of "nerdy" stats. The epic also renames "Scan book" to "Add book", because that screen does more than scan. It all stays inside the private, multi-user, self-hosted app: reading and purchase data belong to their owner, and the admin cannot read them either.

## Stories

- Story 10.1: Reading state on `user-books`
- Story 10.2: Reading switch and dates on Book detail
- Story 10.3: Acquired date and price on copies
- Story 10.4: Currently reading in the collection
- Story 10.5: Stats service
- Story 10.6: Stats section and the Add book rename

## Requirements & Constraints

- **Reading state** belongs to a user and a Book, never to a copy. Several Books can be in reading at once, and re-reads are not tracked. The state is derived from the stored fields and never stored on its own: **read** when `read` is set, **reading** when `read` is not set and `readingSince` is, **unread** otherwise. A missing `user-books` row means unread with no dates. A read Book can have both dates, one date or none.
- **Transitions:**
  - Unread → Reading sets today as the start.
  - Reading → Read keeps the start and sets today as the finish.
  - Unread → Read sets no dates.
  - Read → Reading keeps the start (today if there is none) and clears the finish.
  - → Unread clears both dates.
  - A day count is the calendar days from start to finish (or to today), at least 1.
- **Copies:** `acquiredAt` is a required calendar date and `price` is optional, in whole euro cents from 0 to 9 999 999. A copy gets today as `acquiredAt` when it is saved, and Received sets it to that day. Existing copies took the day they were created.
- **Held Books only.** Currently reading, the Stats list and the book stats count only Books with a visible copy (owned or ordered) or an open wishlist entry. Reading is allowed on a Book the user only has on a wishlist. A `user-books` row whose Book is no longer held is not listed.
- **Stats definitions:**
  - Finished Books count in the year and month of `finishedAt`. Read Books without `finishedAt` count only in the "undated" line.
  - Pages come from the effective Book (overrides applied). A Book without a page count adds a book but no pages.
  - Spending is the sum of prices of copies acquired in the year, ordered or owned, read or not.
  - The years listed are those with a finished Book or a priced copy, plus the current year, newest first.
  - Books a month and Pages a day divide by the months or days elapsed: all of a past year, or up to today in the current year.
  - Days a book, Quickest and Slowest need both dates. Quickest and Slowest ties go to the earlier finish.
  - Thickest brick has the most pages. Most expensive is the priced copy acquired in the year with the highest price.
  - Best month: most finished Books, then most pages, then the earlier month.
  - Most-read author: every effective author of a Book counts. It needs at least 2 Books, and ties go by name.
  - Most dust collected is not tied to the year. It is the unread Book (not being read) whose earliest **owned** copy has the oldest `acquiredAt`. Ties go to the copy created first.
  - A stat with no candidate is null and not shown. Nothing is stored or cached.

## Technical Decisions

- **Writers (already built):**
  - `upsertUserBook()` is the only writer of `user-books`.
  - `setRead()` owns the reading transitions. It takes copy ids or a Book id, plus a `ReadState` or `toggle`.
  - `setReadingDates()` owns the date edits.
  - `lib/copies` is the only writer of `copies`, including `setCopyPurchase()`.
  - The date invariant lives in each collection's `beforeValidate` hook.
- **Calendar dates:** sent as strict `YYYY-MM-DD`, stored at 12:00 UTC and read back by their UTC date. Today is computed in `Europe/Helsinki`. The primitives `helsinkiToday()` and `finishedDays()` are in `src/fields/readingDates.ts`. Dates, numbers and EUR amounts are formatted by `next-intl`.
- **`readingNow(ctx)`** in `lib/shelf` is the one reader of Books being read, used by the collection strip, the collection rows' Reading ending and Stats.
  - It reads the viewer's rows in reading, on the shelf's visible-copy and visible-entry fragments.
  - Order: `readingSince` ascending, then Book id.
  - It hydrates through `getEffectiveBooks()` and returns `ReadingBook[]` (`{ book, since }`, `since` as `YYYY-MM-DD`).
  - On `/` the page reads it once and feeds both the strip and the row endings, so the post-action `router.refresh()` updates them together. `ShelfRow` carries no reading state.
  - The Read filter matches the same derivation in SQL (`readStateOf` in `lib/shelf/effective.ts`).
- **Shelf filter:** gains `ShelfQuery.filters.read: ReadState[]` and `FilterValues.read` (counted values for unread, reading and read). In the URL it is `read=unread|reading|read`, repeatable, with values ORed within the field.
- **Stats readers:** `readingLog`, `spending` and `dustCandidates` sit beside `readingNow` in `lib/shelf`. They are read-only, use the same fragments, and return only ids, dates and prices.
- **`lib/stats`:**
  - It imports only `shelf` and `books`.
  - `getStats(ctx, year?)` hydrates Books through `getEffectiveBooks()` and calls the pure `computeStats()`.
  - It returns `Stats` / `YearStats` exactly as the spine's shared shapes declare. `spent` and `price` are in cents, and `booksPerMonth` has one decimal.
  - A missing or unknown year means the current year in Helsinki. `years` and `byYear` are newest first.
- **Shell and routes:**
  - `/stats` takes `?year=` and calls `requireUser()` first.
  - Stats' Currently reading links to `/?book=<id>`.
  - Stats joins `SECTIONS` as the fifth section: collection, loans, wishlists, stats, settings.
  - The rename touches only the interface strings `scan.open` and `scan.heading`. Routes and code names stay `/scan`.
- **Refresh:** shelf screens follow the shelf reload after any action that changes reading state (AD-7).
- **Conventions:**
  - A story that changes a shared contract updates ARCHITECTURE-SPINE.md in the same commit.
  - Tests cover only named behaviours and spine rules. Examples: the shelf access test gains a second user's Book being read, and `computeStats()` gets one unit test per definition that can break. No Playwright for this epic.
  - Every string is in English and Finnish.
  - Screen stories record an uncommitted phone and desktop walk.

## UX & Interaction Patterns

- **Source of truth for the look:** the Picked section of `mockups/reading-options.html`. Overlays stay one level deep and use the existing tokens.
- **Currently reading strip:**
  - It sits above the count line with a heading-group heading.
  - Each Book is a covers-s cover tile (at least 70px) with its title and a muted "since {date}".
  - Oldest start first, in one row that scrolls sideways.
  - Tapping a tile opens Book detail.
  - It ignores search and filters, and it is absent in select mode and when nothing is being read.
- **Row ending:** a row of a Book being read ends with the 8px accent marker and "Reading" instead of the location. Lent and Ordered endings win over it. The count line names the active Read filter value.
- **Stats layout:** one column on the phone. On wide screens, By month and Nerdy stats sit side by side.
- **Stats parts, in order:**
  1. Currently reading: title with "since {date}" at the right.
  2. Year group: "This year" or "{year}", with a Text switch that replaces `?year=`.
  3. Big numbers: books, pages, € spent and books a month, in heading-section type with muted labels, in one row that wraps.
  4. By month: a three-column grid up to the current month, with one 8px accent square per finished Book, "{n} books · {pages} p", and "–" for a month with none. It is absent when nothing was finished that year.
  5. Nerdy stats: label left, muted value right. Formats include "{title} · {n} days", "{title} · {pages} p", "{title} · €{price}", "{month} · {n} books", "{name} · {n}", and "unread for {n} years" (months under a year, days under a month).
  6. By year: the same grid as By month without markers, "{n} books · {pages} p · €{spent}".
  7. The muted undated line "{n} read books have no dates and are not counted."
- **Stats empty state:** "Nothing read yet" with one dry remark, then the Year group with zeros.
- **Header:**
  - "Stats" / "Tilastot" is a section heading.
  - The button on every section reads "Add book" / "Lisää kirja".
  - On wide screens Add book never clips. The headings row clips at its right edge below 974px in English and 1074px in Finnish.
  - Swiping wraps through all five sections.

## Cross-Story Dependencies

- **Done:** 10.1, 10.2, 10.3 and 10.4.
- **10.5** needs 10.1 and 10.3 (both done), and **10.6** needs 10.5.
- **Walkthroughs:** the follow-ups of 10.2, 10.3 and 10.4 (Picker focus and no-Cancel sheet, duplicate dialog names, the strip in Finnish at phone width and the select-mode shift) were checked on mobile on 2026-11-07 and found fine.
- **Rename and clipping:** 10.6's header clipping depends on the rename and the fifth heading together. Check it in a browser at 900, 980 and 1100px in both languages.
