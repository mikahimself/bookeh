# Sprint Change Proposal: reading and stats

Date: 2026-11-06 · Owner: Mika · Mode: incremental · Status: approved by Mika, 2026-11-06

## 1. Issue summary

Phase 1 is done (Story 9.15, Epic 9 retrospective). Mika approved new scope: reading state with dates per Book, an acquired date and price per copy, Currently reading in the collection, a Stats section, and renaming "Scan book" to "Add book". The UX was picked from rendered options on 2026-11-06 (`ux-designs/ux-bookeh-2026-10-03/mockups/reading-options.html`, Picked section authoritative). The behaviour brief was settled before this run; this proposal records the conflicts and gaps resolved on top of it.

## 2. Impact analysis

- **Epics.** Epics 1–9 are unaffected and done. A new Epic 10 has six stories.
- **PRD.**
  - New: F12 with FR-53 to FR-58.
  - Amended: Glossary (Copy, Reading state), FR-8, FR-15, FR-23, FR-25, FR-26, FR-29, FR-33, FR-43, the Visibility table, Build Order and Scope.
  - UJ-1 and UJ-2 now say Add book.
- **Spine.**
  - Rules: AD-6 (what `user-books` holds), AD-7 (`readingNow` and the stats readers), AD-8 (reading state, its invariant, and copy acquisition) and AD-18 (`setRead` states, `setReadingDates`, `setCopyPurchase`).
  - Import rules: `lib/stats` may import `shelf` and `books`.
  - Elsewhere: the Dates convention, the shared shapes (`ReadState`, `UserBookState`, `CopyLine`, `ReadTarget`, `ShelfQuery.read`, `FilterValues.read`, `ReadingBook`, the stats types), Routes, Source tree and the Capability map.
- **UX.**
  - EXPERIENCE.md: five sections and the measured header widths; Add book; Book detail's reading group, copy line and Pickers; Collection controls (strip, row ending); the Filter panel; select-mode Read; the Undo table; a new Stats section.
  - DESIGN.md: section names; the accent's uses; components for the reading marker, the dates line, the strip and the Stats parts.
  - Six key mock-ups: Scan book → Add book, and the scan heading.
- **Technical.**
  - Two schema migrations (10.1 `user-books`, 10.3 `copies` with a back-fill from `createdAt`), merged one at a time (AD-13).
  - A new `lib/stats` service and a fifth section in `SECTIONS`.
  - Nothing changes in infrastructure or deployment.

## 3. Recommended approach

Direct adjustment: add Epic 10 to the existing plan. No rollback is needed and the MVP is not reduced. The effort is six compact stories, the largest being 10.1 and 10.5. Risk is low to moderate. The main points to watch are the `copies` back-fill on production data, which is verified against a restored dump per the epics' "In every story" rule, and the shelf `read` filter changing from a boolean to a list of states.

## 4. Decisions (approved)

1. **Scope.** A "Phase 1 addition: reading and stats" block goes into Build Order. The Scope line now reads "valuing books (a copy records what was paid for it, FR-55, for the spending stats; nothing estimates what a book is worth)". Reading dates, acquired dates and prices are private: they are added to the Visibility table, to FR-43 and to FR-8's export list.
2. **FR-15 and the transitions.**

   | From → to | read | readingSince | finishedAt | Toast |
   |---|---|---|---|---|
   | Unread → Reading | false | today | null | none |
   | Reading → Read | true | kept | today | "Finished {title} · {n} days", no Undo |
   | Unread → Read | true | null | null | none |
   | Read → Reading | false | kept, or today if none | null | none |
   | any → Unread | false | null | null | none |

   A mis-tap on Read is undone by tapping Reading. `{n}` is the calendar days from start to finish or to today, at least 1.
3. **Bulk Read and Unread.** These apply the same transition per Book, without the finish toast: a ticked Book being read gets today as its finish date, and Unread clears both dates. `toggle` treats a Book being read as not read. Undo restores all three fields.
4. **Partial dates and the invariant.**
   - Filling Finished on a Book being read marks it read and toasts.
   - A read Book may have one date only ("Started {date}" or "Finished {date}"). A finish date alone counts in books, pages and the months, but not in the stats that need day counts.
   - Clearing Started on a Book being read is rejected.
   - The AD-8 invariant: `finishedAt` only when `read`; start ≤ finish; neither date after today. It is enforced in a `beforeValidate` hook.
5. **Held Books only (AD-7).**
   - The strip, the Stats list and the book stats count only Books with a copy or an open wishlist entry. Reading is allowed on a wishlist-only Book.
   - Spending counts the viewer's copies.
   - `readingNow()` lives in `lib/shelf`, and `getStats()` in a new `lib/stats` that imports `shelf` and `books`.
6. **Ordered copies and price.**
   - An ordered copy reads "Ordered {date}". Received sets `acquiredAt` to that day, and its Undo restores the date.
   - Spending counts by `acquiredAt`, whether the copy is ordered or owned. Most dust collected looks at owned copies only.
   - Price input accepts "24,90", "24.90" and "24". It is stored as cents, from 0 to €99 999.99, and shown as EUR by next-intl.
   - Edit book does not get the fields, so AD-11 is unchanged. There is no Undo and no toast.
7. **Stat definitions.**
   - Years: those with a finished Book or a priced copy, plus the current one, newest first.
   - Books a month and Pages a day divide by the months or days elapsed.
   - Days a book is the mean over Books with both dates.
   - Ties: Quickest and Slowest go to the earlier finish. Best month goes to more pages, then the earlier month. Most-read author needs at least 2 Books, every author on a Book counts, and ties go by name.
   - Most expensive is year-bound; Most dust collected is not.
   - A stat with no candidate is left out.
   - By month runs up to the current month and shows "–" for a month with none.
   - The phone shows everything in one column.
8. **Header fit.**

   | | Five headings + Add book | Four headings + button (today) |
   |---|---|---|
   | English | 974px | 855px |
   | Finnish | 1074px | 918px |

   Measured with Open Sans 300 at 44px, the real gaps and padding, and the font loaded. The existing clip rule stays and Add book never clips. The clipped heading is always the one before the current section, so every section stays one click away.
9. **Rename.**
   - `scan.open` and `scan.heading` become "Add book" / "Lisää kirja". Routes and code names stay.
   - The PRD, EXPERIENCE.md, DESIGN.md and the key mock-ups are updated now.
   - Finished stories, retros, earlier proposals and `.working/` are history and stay as they are.
10. **Stories.** Six stories, listed in section 5.

## 5. Detailed change proposals

Every change below has already been applied. Read them in the diff of this commit.

| Artifact | Change |
|---|---|
| `prds/prd-bookeh-2026-10-02/prd.md` | Everything in section 2. F12 holds the full transition table and the stat definitions. |
| `architecture/.../ARCHITECTURE-SPINE.md` | Everything in section 2. |
| `ux-designs/.../EXPERIENCE.md` | Everything in section 2. |
| `ux-designs/.../DESIGN.md` | Everything in section 2. |
| `ux-designs/.../mockups/key-*.html` | Add book on the button; Add book as the scan heading. |
| `epics.md` | FR-53 to FR-58 in the inventory and coverage map; Epic 10 in the list; Stories 10.1 to 10.6 with acceptance criteria. |
| `implementation-artifacts/sprint-status.yaml` | `epic-10` and its six stories as backlog; retrospective optional. |

Epic 10 stories:

| # | Story | Needs |
|---|---|---|
| 10.1 | Reading state on `user-books` | — |
| 10.2 | Reading switch and dates on Book detail | 10.1 |
| 10.3 | Acquired date and price on copies | — (schema merges after 10.1) |
| 10.4 | Currently reading in the collection | 10.1 |
| 10.5 | Stats service | 10.1, 10.3 |
| 10.6 | Stats section and the Add book rename | 10.5 |

## 6. Implementation handoff

- **Scope: moderate.** The backlog gains a new epic; no replan is needed.
- **Handoff.** The Developer agent builds Stories 10.1 to 10.6 in order through `bmad-build`. Each story verifies its migration on a restored production dump before merging. 10.1, 10.3 and 10.5 check the spine against what they built and correct it in the same commit.
- **Success criteria.**
  - The switch and Picker behave as in FR-53 and FR-54.
  - Copies carry their acquired date and price.
  - The strip, the filter and the row ending show the Books being read.
  - `/stats` shows FR-57's content with FR-58's numbers, in both languages.
  - The header clips as measured, and Add book reads the same everywhere.
