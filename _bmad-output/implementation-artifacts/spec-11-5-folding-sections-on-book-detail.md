---
title: '11.5 Folding sections on Book detail'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: '5122b9dea850ac3994017e0773282dbc212237c1'
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

**Problem:** Book detail stacks every group (copies, classification groups, description, lent before, wishlists) open under the header, and the reading dates line sits under the reading control. DESIGN.md (Folding section) and EXPERIENCE.md (amended 2026-11-10) fold them into five rows that start closed.

**Approach:** Wrap Base UI's Accordion once in `components/ui` and build Book detail's sections on it, in the order Your copies, Description & details, Genres themes & tags, Lent before, On wishlists. Description & details takes the description, value rows and the reading dates line, which leaves the reading group through a context from `ReadAndRating`. Add to wishlist becomes the foot's wide secondary button. Name the accordion in the spine's UI primitives line.

## Boundaries & Constraints

**Always:**
- Folding section (DESIGN.md → Folding section): a full-width row at least 58px tall; the title in `heading-group`, lowercase; at the right a `meta` `text-muted` summary, then a chevron (2px strokes, inline SVG, `currentColor`) that turns over when open. Rows are divided by `stroke-hairline` `border` lines, one above the first. Open content sits `spacing-4` under its row. Square corners, no fill.
- The row is a button with `aria-expanded` (Base UI `Accordion.Trigger`). Several sections can be open at once. All start closed on every open of Book detail and nothing is remembered (decision 5). A section with nothing in it is absent.
- The wrapper `components/ui/Accordion.tsx` is the only importer of `@base-ui/react/accordion`, `'use client'`, with a DESIGN.md doc comment like `ui/Menu.tsx`. It is not an overlay. Values come from tokens in `styles.css` (the 58px row height is a new token); no `dark:`, no inline style, no literals in components.
- Summaries: Your copies — the one copy's location name, "Ordered", or "Lent · {person}" (`detail.lentMarker` exists), else "{n} copies"; Genres, themes & tags, Lent before and On wishlists — the count; Description & details — none. All new strings in `messages/en.json` and `fi.json`.
- Description & details holds, in order: the description (when nonblank, same plain text with preserved line breaks as now), then value rows, label left and value right in `text-muted`: Reading, Publisher, Published (the year), ISBN, Pages, Language. A row whose value is empty is omitted; the Reading row is present only while the reading line is not `none`. The section is absent when none of these exist. A Book with only "Add dates" (read, no dates) has the section.
- The Reading row is the dates line moved out of the reading group: the same text and Links, opening the reading-dates Picker as now (FR-54). The reading group keeps the Segmented control, the `Picker`, the toasts and `useSavedSwitch` unchanged. After the Picker settles, focus goes to the Description & details row (the Link that opened it can be gone).
- Genres, themes & tags holds the five classification groups as now (genres, my genres, themes, my themes, my tags), each keeping its small heading and Filter chips, present only when it has chips. `DetailTags` ("Add tags" and its picker) stays outside the accordion, after it, at a fixed tree position, so the open picker survives the refresh that follows each tag change.
- Your copies keeps each copy's line, its location chip, status, the acquired line with its Links, the lent line and the note; Lend, Move, Remove, Returned and Received stay on the lines (11.6 moves them).
- Focus targets move to the section's row: every `closest('section')?.focus()` in `CopyLine.tsx` (after Move, Lend, Return, Receive, a purchase change, Remove) focuses the Your copies row; Remove of the only copy with entries remaining focuses the On wishlists row (the `focusAfter` id is that row's id), which stays closed. Provide one helper in the wrapper for "the row of the section this element is in".
- The accordion's open state survives a toast Undo's remount of `ReadAndRating`'s group: the Accordion root sits above that group, the items inside it.
- Add to wishlist is a secondary button taking the foot row's remaining width; Edit stays beside it, secondary (11.6 moves it). Re-fetch, Look it up again and its hint stay above the foot as they are.
- The spine's UI primitives line (`ARCHITECTURE-SPINE.md:317`) names the accordion beside the toggle group, as a Base UI wrapper in `components/ui` and not an overlay, in this story's commit.
- Same content at every width.

**Never:**
- No change to the copy lines' actions, the foot's Edit, the App bar or the bar (11.6, 11.7). No schema change, no action change, no shared-shape change.
- No `keepMounted`, no stored open state, no URL state. No height animation beyond the chevron's turn (none under reduced motion).
- No new committed test case. Existing unit specs that read Book detail's tree are adapted to the closed sections only as far as they must.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Opens | any held Book | rows only, all closed, `aria-expanded="false"`; hairline above the first | — |
| One owned copy | location "Kirjahylly" | summary "Kirjahylly"; opened, the line with Lend, Move, Remove | — |
| Ordered, lent, two copies | ordered copy / lent copy / two | "Ordered" / "Lent · {person}" / "2 copies" | — |
| Both open | copies and description | both open at once | — |
| Bare Book, unread | no description, no publisher, year, ISBN, pages, language | no Description & details row | — |
| Read, no dates | state read, no dates, bare Book | Description & details present with only the Reading row "Add dates" | — |
| Dates Picker saved | in the open Reading row | row text updates; focus on the Description & details row | a failed save keeps the Picker's error as now |
| Remove last copy, entries remain | one copy, one wishlist entry | Book detail stays; focus on the On wishlists row, closed | — |
| Remove last copy, no entries | one copy only | "Not in library" as now | — |
| Move / Lend / Return in an open Your copies | any | the section stays open; focus on its row | — |
| Toast Undo | any Undo | open sections stay open | — |
| Only on a wishlist | no copies, one entry | rows On wishlists only (plus any details) | — |
| Tag add | picker open, first tag added | Genres row appears; the picker stays open | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx` (async server component, 344 lines). The groups it renders today:
  - `:132-143`, `ReadAndRating` with the `header` prop.
  - `:145-199`, Your copies `<section tabIndex={-1}>`, `:145` comment names the focus users.
  - `:200-216`, Lent before; `:217-234`, On wishlists (`id={onWishlistsId}`, `tabIndex={-1}`).
  - `:235-282`, the five classification groups.
  - `:283-289`, `DetailTags`; `:290-300`, description; `:301-312`, Refetch / Look it up again; `:313-327`, the foot.
  - Becomes: `<Accordion multiple className="flex flex-col gap-6">` around everything; `ReadAndRating` receives the sections as `children`; `DetailTags`, Refetch / Look it up again and the foot follow it as siblings.
  - The doc comment is rewritten (it still describes open groups and focus on On wishlists).
- `src/app/(frontend)/(sections)/ReadAndRating.tsx`.
  - `Group` renders a fragment: the context provider around `{header}`, then the reading `div`.
  - Add a `children` prop: the sections rendered after the reading control, inside the provider.
  - The context (`HeaderRatingContext`, `:41`) gains the dates line content. Export a client `ReadingRow` that renders it as a value row and nothing outside a provider or with `line.kind === 'none'`.
  - Remove the dates line from the reading `div` (`:155-169`); the `group` ref and `tabIndex` go; `onDatesSaved` focuses the Description & details row (by an exported `detailsRowId(bookId)` shared with `BookDetail`).
  - `ReadAndRating` (`:49-68`) remounts `Group` by `generation` after an Undo; the Accordion root is above it, so open state survives.
- New `src/app/(frontend)/components/ui/Accordion.tsx`: `Accordion` (Base UI Root, `multiple`), `AccordionItem` (`value`, `title`, `summary`, optional `rowId`, children), and `focusSectionRow(element)`: finds the nearest ancestor item and focuses its trigger. Docs: `node_modules/@base-ui/react/docs/react/components/accordion.md` (`Item`, `Header`, `Trigger`, `Panel`; the panel's `data-panel-open` on the trigger turns the chevron).
- `src/app/(frontend)/(sections)/CopyLine.tsx`: `:134,177,224,289,335,366` the `closest('section')` focus calls and `:224` the `focusAfter` id lookup; doc comments at `:84,146,191-193,304,345`.
- `src/app/(frontend)/(sections)/readingLine.ts` (pure): `readingLine(dates, today)`; the server uses it to decide whether Description & details has a Reading row, with `helsinkiToday` from `@/fields/readingDates`.
- `src/lib/books/effectiveBook.ts:20-33`: `isbn13`, `publisher`, `year`, `language`, `pages` on the effective book. `languageName(language, locale)` from `@/lib/books/languageName`. Existing labels to reuse where they fit: `edit.*` (`messages/en.json:203-208`), `answer.pages` (`:152`); the new rows' labels go under `detail`.
- `src/app/(frontend)/styles.css`: add a fold row height token near `--spacing-segmented-height` (`:140`); `--spacing-stroke-hairline` (`:120`) and `--color-border` exist.
- `src/app/(frontend)/components/AddToWishlist.tsx:50`: check how the button takes a class; it must fill the row beside Edit.
- `tests/helpers/serverTree.ts` and `tests/unit/bookDetail.unit.spec.ts`, `bookDetailCopyLine`, `genresGroup`, `locationsGroup`, `detailTags`, `lendPicker` etc.: render the tree, so closed sections hide their content. Adapt them with a test helper, not a production prop.
- `tests/e2e/reading.walk.spec.ts`, `bookHeader.walk.spec.ts` (git-ignored): precedent for the walk (sign-in, books inserted with `pg`).
- Docs: `ARCHITECTURE-SPINE.md:317`; DESIGN.md (Folding section) and EXPERIENCE.md already describe it.

## Tasks & Acceptance

**Execution:**
- [x] `styles.css`: a fold row height token (58px) with a comment.
- [x] `components/ui/Accordion.tsx`: the wrapper, the item row, the chevron and `focusSectionRow`.
- [x] `ReadAndRating.tsx`: `children` slot, the dates line in the context, `ReadingRow`, `detailsRowId`, focus after the Picker; doc comment.
- [x] `BookDetail.tsx`: the five sections, the root, the summaries, Description & details, the foot; doc comment.
- [x] `CopyLine.tsx`: focus calls use `focusSectionRow`; `focusAfter` targets the On wishlists row id; doc comments.
- [x] `messages/en.json`, `messages/fi.json`: the section titles ("Genres, themes & tags", "Description & details"), summaries ("{n} copies"), detail row labels.
- [x] `ARCHITECTURE-SPINE.md:317`: name the accordion.
- [x] Unit specs and `serverTree.ts`: adapted to closed sections and the `children` slot.
- [x] `tests/e2e/foldingSections.walk.spec.ts` (git-ignored, not committed): the walk under Verification.

**Acceptance Criteria:**
- Given Book detail in the sheet (390px) and the panel (1300px), when it opens, then below the reading control sit rows in the order Your copies, Description & details, Genres themes & tags, Lent before, On wishlists (absent ones left out), each at least 58px tall, divided by hairlines with one above the first, all `aria-expanded="false"`, and no section content in view.
- Given the rows, when several are opened, then they stay open together; the chevron turns over; reopening Book detail finds them closed.
- Given one copy, an ordered copy, a lent copy and two copies, when the Book opens, then Your copies' summary is the location, "Ordered", "Lent · {person}" and "2 copies"; the other counted sections show their counts.
- Given Description & details open, when it shows, then the description is first, then rows for Reading (only while not unread), Publisher, Published, ISBN, Pages, Language with the label left and the value right in muted type, empty ones omitted, and the header and the reading control show no dates line.
- Given a read Book with no dates and nothing else, when it opens, then Description & details is present with "Add dates" only, opening the Picker; after saving, the row shows the dates and focus is on the section's row.
- Given Your copies open, when Move, Lend, Returned, Received, a price or date change, or Remove settles, then focus lands on the Your copies row; given the only copy removed with a wishlist entry remaining, then Book detail stays open and focus is on the closed On wishlists row; given a Book with no entries, then it closes as "Not in library".
- Given sections open and a toast Undo, when the route refreshes, then they stay open.
- Given a Book with no tags, when the first tag is added in the open picker, then the picker stays open and Genres themes & tags appears.
- Given a Book only on a wishlist, when it opens, then only On wishlists (and any details) show.
- Given the foot, when it shows, then Add to wishlist takes the remaining width beside Edit, both secondary.
- Given `ARCHITECTURE-SPINE.md`, when committed, then UI primitives names the accordion with the toggle group as Base UI wrappers in `components/ui`, not overlays.

## Spec Change Log

## Review Triage Log

### 2026-11-11 — Review pass
- verdicts: 36 findings — high 0, medium 2, low 3, false 4, maybe-false 0 (27 rejected as test-only, out of scope or not worth a structural change; counted below)
- findings:
  - `[medium]` `[patch]` Edge Case Hunter / Blind Hunter: the Accordion root is unkeyed, so the wide panel's in-place swap to another Book keeps the previous Book's open sections — fixed: `key={bookId}` on `Accordion`.
  - `[low]` `[patch]` Blind Hunter / Edge Case Hunter: `ReadingRow` put spans inside the `dl` — fixed: `dt` / `dd`.
  - `[low]` `[patch]` Edge Case Hunter: an empty `dl` under a description-only section — fixed: the `dl` renders only with a Reading row or value rows.
  - `[low]` `[patch]` Blind Hunter: the `ReadAndRating` doc comment wrapped mid-sentence — reflowed.
  - `[medium]` `[patch]` Edge Case Hunter: the walk found Book detail crashing on `detailsRowId` exported from a client module (found before review) — fixed by moving it to `readingLine.ts`.
  - `[false]` `[reject]` Verification Gap, four rows (summaries, details rows, focus targets, Undo keeps open): each asks for a committed test; the intent's Never forbids new committed test cases and the criteria are covered by the walk (CLAUDE.md, Tests).
  - `[false]` `[reject]` Blind Hunter / Verification Gap: `detail()` opens every section and nothing asserts all-closed — same reason; the walk asserts `aria-expanded="false"`.
  - `[false]` `[reject]` Blind Hunter: the spec bookkeeping and walk not shown — the walk ran and is recorded below.
  - `[false]` `[reject]` Edge Case Hunter: focus after Picker or `focusSectionRow` lands on the body — the Description & details row is present whenever the Picker opens; the walk saw focus on it.
  - `[low]` `[reject]` Edge Case Hunter: Reading row appears or vanishes only after the refresh — Design Notes accept this; `afterAction` refreshes.
  - `[low]` `[reject]` pages 0, unknown language code, summary precedence, long summaries, digit-only summary names, the id helpers' module, import order, the fragile row regex, the foot's child selector, panel unmount dropping a note draft (CopyNote saves on blur), arrow keys in inputs (walk typed in the tag combobox), ProgressLine height — each unlikely in everyday use and the fix adds guards or structure.
  - Intent Alignment: descriptive only; no findings.

## Design Notes

The Accordion root must sit above `ReadAndRating`'s remounting group, and the Reading row must read the group's live state, so the sections are passed to `ReadAndRating` as `children` and rendered inside its context:

```tsx
<Accordion multiple className="flex flex-col gap-6">
  <ReadAndRating key={bookId} … header={<BookHeader …><HeaderRating /></BookHeader>}>
    <div className="border-t …">{/* AccordionItem × 5, Reading row inside Description & details */}</div>
  </ReadAndRating>
  <DetailTags … />
  {/* Refetch / Look it up again, foot */}
</Accordion>
```

Presence of Description & details is decided on the server from the Book's fields, the description and `readingLine(state, today).kind`; `afterAction` refreshes the route after each state change, so it follows the switch.

## Verification

**Commands:**
- `npm run lint` -- expected: no errors in committed files.
- `npm run typecheck` -- expected: no errors.
- `npm run test:unit` -- expected: all pass (no new tests).

**Manual checks:**
- Uncommitted walk `tests/e2e/foldingSections.walk.spec.ts` against the e2e server at 390 and 1300px, light and dark, en and fi for titles:
  - every section closed and open, several open at once, the chevron, hairlines, row height;
  - summaries for one, ordered, lent and two copies;
  - Description & details contents and the Reading row, "Add dates" and the Picker with focus after;
  - a Book with two copies; a Book only on a wishlist; Remove of the last copy with and without entries (focus on a row);
  - Undo keeps sections open; first tag keeps the picker open;
  - the foot.
- Screenshots to `test-results/folding-sections-walk/`; record what it saw under `## Auto Run Result`.
- `scanToSave` and `shopCheck` still pass (`--workers=1`).

## Auto Run Result

**Summary.** Book detail's groups fold into Folding sections (Your copies, Description & details, Genres themes & tags, Lent before, On wishlists), all closed on open. Description & details holds the description, the value rows and the Reading dates row, moved out of the reading group. Add to wishlist fills the foot beside Edit. The spine names the accordion.

**Files changed.**
- `components/ui/Accordion.tsx` (new): the Base UI wrapper, the row and `focusSectionRow`.
- `BookDetail.tsx`: the sections, summaries and foot. `ReadAndRating.tsx`: `children` slot, `ReadingRow`, focus after the Picker. `readingLine.ts`: `detailsRowId`. `CopyLine.tsx`: focus goes to the section row.
- `styles.css`: `fold-row`. `messages/en.json`, `fi.json`: new strings. `ARCHITECTURE-SPINE.md`: UI primitives.
- `tests/helpers/openSections.ts`, `collectionPage.ts` and four unit specs: adapted to closed sections.

**Review.** 36 findings: patched 5 (medium 2, low 3), deferred 0, rejected the rest, each with its reason above. Follow-up review: `false`.

**Verification.** `npm run typecheck` clean; ESLint no errors in `src`; `npm run test:unit` 104 files, 1400 tests pass; walk `tests/e2e/foldingSections.walk.spec.ts` (uncommitted) passed at 390 and 1300px, light and dark, en and fi, before and after the patches (rows 58px with hairlines, summaries, Reading row and Picker with focus on the row, Remove of the last copy with and without entries, Undo keeps sections open, first tag keeps the picker open, the foot). Screenshots in `test-results/folding-sections-walk/`. `scanToSave` and `shopCheck` passed with `--workers=1` before the review patches; the patches touch only `BookDetail.tsx` and `ReadAndRating.tsx` markup.

**Residual risks.**
- The Reading row follows the switch live, but Description & details' presence follows the server, so it catches up after the refresh.
- A toast Undo remounts the open sections' contents (their open state survives).
- Built beside the story-11-3 worktree, which shares `tests/e2e` port 3100 and `bookeh_test`.
