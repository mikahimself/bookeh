# Epic 10 Context: Track what I read and see my stats

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Extend the completed private catalogue with reading state and dates per Book, acquisition dates and prices per copy, a view of current reading, and yearly reading and spending statistics. Keep these changes within the existing self-hosted app and its private multi-user model. Rename the scan entry point to Add book because it supports several ways to add a Book.

## Stories

- Story 10.1: Reading state on `user-books`
- Story 10.2: Reading switch and dates on Book detail
- Story 10.3: Acquired date and price on copies
- Story 10.4: Currently reading in the collection
- Story 10.5: Stats service
- Story 10.6: Stats section and the Add book rename

## Requirements & Constraints

Reading belongs to a user and Book, never a physical copy. Several Books can be in reading at once; re-reads are not tracked. Derive the state from `read` and optional `readingSince`: read when the flag is true, reading when false with a start date, unread otherwise. `finishedAt` is optional and allowed only when read. Start must not follow finish, and neither date may be after today in Europe/Helsinki. Read Books may have only one date or neither date. A missing user-Book row is unread without dates.

Starting an unread Book sets today; finishing a Book being read keeps its start and sets today's finish. Marking an unread Book read sets no dates. Returning a read Book to reading keeps its start or uses today and clears the finish. Unread clears both dates. Apply transitions only to Books whose state changes. Bulk Read follows the same rules per distinct Book; toggle resolves to unread only when every target is read. Its Undo restores all three values. Day counts are calendar differences with a minimum of one day. Editing Finished on a Book being read marks it read; clearing its Started date is refused. Ratings remain available once read.

Each copy has a required acquisition date and optional integer price in euro cents, from zero to 9,999,999. Save defaults to today; Received resets the date and its Undo restores it. Existing copies take the Europe/Helsinki date of their creation timestamp. Spending includes owned and ordered copies. Reading dates, ratings, acquisition dates and prices are private to their owner, including against admins.

Current reading and book statistics include only Books held through a visible copy or open wishlist entry. Reading is allowed on wishlist-only Books. Finished Books count once in the year and month of their finish; missing effective page counts add no pages. Undated read Books are counted separately. Spending uses acquisition year. Years include finished Books, priced copies and the current year, newest first. Averages use elapsed months or days for the current year and the whole past year. Duration stats need both dates; quickest and slowest ties go to earlier finish. Best month ties use pages then earlier month. Every effective author counts; the most-read needs at least two Books and ties by name. Dust considers only unread, non-reading Books and their earliest owned copy, resolving acquisition-date ties by earlier copy creation. Statistics without a candidate are absent; nothing is stored as a cached champion.

## Technical Decisions

Keep private data access scoped through the request context and existing ownership gates. `upsertUserBook()` remains the sole user-Book writer; `setRead()` owns reading transitions and `setReadingDates()` owns date edits; `lib/copies` stays the only `copies` writer, with `setCopyPurchase()` beside move, receive and the rest. Book-target mutations use `requireOwnBook()`; selections validate every copy before writing and run atomically. Book-detail reading changes and date edits have no Undo; only select mode's copy-ids path is undoable.

Reading state is derived from `read` and `readingSince`, never stored as its own field; reading data never goes on copies and purchase data never on `user-books`. The date invariant lives in `UserBooks.beforeValidate` (field validation is skipped under an admin condition) and validates partial updates against the current row, so back-office writes are covered. Reading calendar primitives live in `src/fields/readingDates.ts`, shared by the collection and the books services without cross-service imports. `setRead()` returns `{ state, count, finishedDays }`; `finishedDays` is set only when exactly one changed Book went reading → read. Until 10.2 the existing Read actions translate booleans to read/unread and return `{ read, count }` with the select-mode restore intact; 10.2 moves them to the three-state shape. `UserBookState` carries `state`, `readingSince`, `finishedAt`; `CopyLine` gains `acquiredAt` and `price` (cents); shelf gains `ReadingBook` and `FilterValues.read` as counted `ReadState` values; `lib/stats` exposes `Stats` / `YearStats` exactly as the spine declares.

Calendar dates travel as strict, real `YYYY-MM-DD` dates, store at 12:00 UTC, and read back by UTC date. Today and displayed dates use Europe/Helsinki. Format dates, numbers and EUR through next-intl. Use regenerated Payload types and committed migrations together; never migrate the dev database. Schema stories merge serially and regenerate their own migration after rebasing. Integration and browser checks use `bookeh_test` with push disabled.

`readingNow()` and read-only reading, spending and dust readers live in `lib/shelf`, on its visibility fragments. `lib/stats` imports only shelf and books and hydrates through effective Books, so overrides affect pages and authors. Calculate statistics in the pure `computeStats()`; nothing is stored or cached. `/stats` takes `?year=`, a missing or unknown year meaning the current one; its Currently reading links to `/?book=`. Shared contracts changed by a story must be reconciled with the architecture spine in the same commit. Tests stay limited to named acceptance behavior and spine invariants; no network calls. Changes to types consumed by shared fixtures require the full unit suite before commit.

## UX & Interaction Patterns

The Picked section of `mockups/reading-options.html` is authoritative. Book detail replaces its two-way read switch with unread / reading / read; changes save immediately. Only finishing from reading shows the finish-days toast, with no Undo; select mode keeps its existing Undo toast. Muted linked dates open one reading-dates Picker. Acquisition date and price share another Picker on each copy line, without toast or Undo. Price input accepts comma or decimal point and whole euros.

Current reading sits above the collection count, ignores search and filters, disappears in select mode and scrolls horizontally. It follows shelf reloads. Read filters OR unread, reading and read values with copy counts. Lent and Ordered row endings take priority over Reading. Stats is the fifth section between wishlists and settings; phone content is one column and wide-screen month and fact groups sit side by side. All strings are English and Finnish, styles use existing tokens, and overlays remain one level deep. Screen changes require an uncommitted acceptance walk against the fixture e2e server, recorded in the story result.

## Cross-Story Dependencies

Story 10.1 is built; 10.2 and 10.4 build on it in either order. Story 10.3 has no functional dependency, but its schema migration merges separately after 10.1. Story 10.5 needs 10.1 and 10.3; 10.6 needs 10.5. Existing save, Received, Undo, shelf refresh, wishlist holdings and ownership services remain the integration points. The Add book rename changes interface strings while retaining `/scan` routes and code names.
