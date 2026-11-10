# Sprint Change Proposal: bold Metro

Date: 2026-11-10 · Owner: Mika · Mode: batch · Status: approved by Mika, 2026-11-10 (decisions 1–7 as proposed)

## 1. Issue summary

Mika wants the interface "more bold with the Metro style". Two outside redesign sketches (one from Gemini, one from GPT) were compared. On 2026-11-10 Mika picked the result from rendered options on a Design canvas (https://claude.ai/artifact/W62ePXuepskzXzJ17HhsCE, three review rounds). The canvas has five phone screens (Collection covers light, Collection rows dark, Book detail, Stats, Add book) and an "Open choices" board with the picks marked. Its `.dc.html` sources are copied into the repo as the record (decision 7).

The type of change is a new requirement from the owner. It changes the look and the placement of actions. It does not change what the app stores or computes. It deliberately breaks three rules in DESIGN.md: "No fills", "One accent, as lines" and "Every corner is square".

What was picked:

- **Section headings** are 56px / 300 and lowercase. There is no small app title above them.
- **Coral fill.** Selected states and the Stats tiles are filled with a deeper coral, `#D1432F`, which gives white text 4.6:1. Lines keep the coral `#F0604F` (`#FF8E7F` in dark).
- **Phone app bar.** A slate bar along the bottom with round 44px icon buttons and lowercase labels replaces the pinned Add book button. Primary buttons have a coral ring, destructive ones a red ring. A ⋯ menu appears only where there is something to put in it.
  - Collection: add book, filter, select.
  - Book detail: edit, lend, move, remove, plus a ⋯ menu with Look it up again or Re-fetch.
  - Loans, wishlists, stats and settings: add book.
  - Add book: torch, add without ISBN, find by title / author.
- **Buttons** have a 17px label and are 54px tall. Their stroke is 2px, held in one token, so 3px is a one-line change.
- **Collection tools.** The count is on the left, then the s / m / l switch, then a rows / covers icon pair. The chosen icon is coral-filled.
- **Book detail.**
  - Header: cover 120 × 180; title, author, then "pages · language" and the series; the rating under them. Publisher and year move into Description & details.
  - Reading status is a three-part control with a 2px stroke and the chosen part filled in coral.
  - Folding sections: Your copies (its summary is the location), Description & details, Genres, themes & tags, Lent before, On wishlists.
  - Lend, Move and Remove leave the copy lines for the app bar, which opens a copy picker when several copies qualify.
  - Add to wishlist becomes a full-width button.
- **Stats.**
  - Four equal square coral tiles: the number on top, the label below, each on one line, with one number size shared across all four and set by the longest value.
  - By month as stacked squares.
  - Nerdy stats as rows of a coral line icon, a label, a title and a meta line.
- **Add book.** A corner-bracket target over the camera, with the torch in the app bar where the camera supports one.

Answered in this run:

- Wide screens get no app bar. Add book stays top right and Filter / Select stay in the tools row. The detail panel's foot carries the copy actions as buttons. Tokens, headings, tiles, the reading control and the folding sections apply at every width.
- The ⋯ menu appears only where it has items. Back to top becomes a "top" bar button.
- The torch is hidden when the camera does not support it.

## 2. Impact analysis

- **Epics.** Epics 1–10 are unaffected and stay as they are. Epic 9 and Epic 10 are both still `in-progress` in sprint-status; that is a bookkeeping matter outside this change. A new Epic 11 has nine stories.
- **PRD.**
  - FR-57: by month is a chart of markers, and the month line text leaves the screen.
  - FR-10: gains the torch.
  - Build Order: a new "Phase 1 addition: bold Metro" block.
  - Nothing else changes, and no FR is added or dropped. The torch is a small extension of FR-10, not a new feature area.
- **Spine.**
  - The UI primitives convention gains the Base UI Accordion and Toggle Group wrappers. Neither is an overlay, so the one-level rule does not apply to them.
  - The Styling convention keeps "no inline style objects": the shared tile number size is a step class, not a style.
  - No AD changes, and no shared shape changes except one pure helper per story where logic lives: copy-action eligibility and the tile number step.
- **UX.** This is the bulk of the change.
  - DESIGN.md:
    - Brand & Style: the three rules are rewritten.
    - Colors: `accent-fill`, `bar`, `bar-ink`, `bar-danger`.
    - Typography: the section heading size.
    - Layout & Spacing: `stroke-button` and the button height.
    - Components: Button, App bar, Segmented control, Icon switch, Folding section, Detail header, Stats tiles, Stats by month, Stats facts, Camera frame.
    - Shapes: round icon buttons in the app bar are the one exception.
    - Do's and Don'ts.
  - EXPERIENCE.md:
    - Information Architecture: Add book's place.
    - Component Patterns: Text switch uses, Button primary, a new App bar, Segmented control, Folding section, Copy picker; Action bar; Camera frame.
    - Collection controls: Layout, Filter, Select, Scrolling.
    - Book detail: every group and the foot.
    - Scan: the bar, the torch, the two Links.
    - Stats: big numbers, by month, nerdy stats.
    - Accessibility Floor: white on `accent-fill`.
    - Responsive & Platform.
  - The key mock-ups stay as the record of structure. Where they differ on look, the canvas copy wins.
- **Technical.**
  - No schema change and no migration.
  - Front end only:
    - `styles.css` tokens.
    - `components/Button.tsx`.
    - `components/ui` gains `Accordion` and `ToggleGroup` wrappers.
    - A new `AppBar` in the section shell, replacing the pinned Add book and `BackToTop`.
    - Book detail's groups and actions.
    - Stats' page.
    - Scan's bar and the torch through `@zxing/browser`'s scanner controls (`switchTorch`, present only when the track supports it).
  - Playwright's scan-to-save and shop-check flows reach Find by title / author and Add without ISBN through the bar on the phone; their selectors are kept working in Story 11.9.
  - Nothing changes in infrastructure or deployment.

## 3. Recommended approach

The approach is a direct adjustment: add Epic 11 to the plan. No rollback is needed and the scope is not reduced.

- **Effort:** nine compact stories. The largest are 11.2 (app bar) and 11.6 (detail actions).
- **Risk:** low.
  - The visible risk is Book detail. Moving the copy actions off the copy lines changes how a lent or ordered copy is handled, and the focus targets that existing stories set on a copy's line now sit inside a folding section.
  - The second risk is the bar's height on small phones: the toast, the sheet's half-open height and the safe area all sit above it.
  - Both are covered by walks named in the stories.
- **Timeline:** independent of open work. There are no data changes, so stories can merge in any order their dependencies allow.

Alternatives considered: restyle only, keeping the pinned button and the Links. Rejected, because the app bar and moving the actions off the copy lines are what Mika asked for. Phone-only: rejected in this run in favour of shared tokens at every width.

## 4. Detailed change proposals

### 4.1 Epics: new Epic 11 (appended to `epics.md`)

## Epic 11: Bold Metro

A bolder Metro look: 56px headings, a coral fill for selected states and the Stats tiles, heavier buttons, a phone app bar in place of the pinned Add book, and a quieter Book detail with folding sections and the copy actions in the bar (PRD FR-10, FR-57, Build Order; spine UI primitives and Styling conventions; DESIGN.md and EXPERIENCE.md as amended by `sprint-change-proposal-2026-11-10.md`). The look is the canvas copied to `ux-designs/ux-bookeh-2026-10-03/mockups/bold-metro/`; the spines win on conflict.

**Order.** 11.1 first. Then 11.2, 11.4 and 11.8 in any order. 11.3 and 11.9 need 11.2. 11.5 needs 11.4. 11.6 needs 11.2 and 11.5. 11.7 needs 11.6. Book detail stories (11.4 → 11.7) touch the same files and run one at a time.

### Story 11.1: Bold tokens, headings and buttons

As Mika,
I want the bolder headings, buttons and the coral fill across the app,
So that every screen picks up the new look before its layout changes.

**Acceptance Criteria:**

**Given** DESIGN.md as amended
**When** `styles.css` is updated
**Then** it declares `accent-fill` (`#D1432F` in both themes), `bar` (`#1F2933` light, `#262E37` dark), `bar-ink` (`#FFFFFF` / `#E3E8EE`), `bar-danger` (`#E0566F` both), `stroke-button` (2px) and `button-height` (54px), and `heading-section` and `heading-section-phone` become 56px / 300 / -0.02em
**And** `buttonClass()` draws every button with a `stroke-button` outline, the `button` type (now 17px) and `button-height` tall, primary in `accent`, secondary in `text`, destructive in `danger`; changing `stroke-button` to 3px changes every button outline and nothing else
**And** the compact button (Find beside the ISBN field) keeps its smaller padding with the new stroke; the Back to top square is untouched here (it goes in 11.2)
**And** on wide screens the headings row and Add book are re-measured at 56px in both languages; the measured widths in EXPERIENCE.md → Moving between sections are updated, and the clipping rule still keeps Add book whole, checked in a browser at 900, 1100 and 1400px
**And** no tests; an uncommitted phone and desktop walk in both themes covers a section, Book detail, an Answer and Edit book

### Story 11.2: Phone app bar

As Mika,
I want a bar at the bottom of the phone with Add book and the section's own actions,
So that the main actions sit under my thumb, as on a Windows Phone.

**Acceptance Criteria:**

**Given** the phone layout (under 900px) of any section
**When** it shows
**Then** an `AppBar` pinned to the bottom (`bar` ground, `bar-ink` labels, safe area respected) replaces the pinned Add book button: round 44px buttons with a 2px ring and an inline SVG icon over a lowercase `label`-size label, centred; Add book's ring is `accent` (the layer's primary)
**And** the collection's bar holds add book, filter and select, and the tools row loses its Filter and Select Links on the phone; loans, wishlists, stats and settings hold add book; no bar shows a ⋯ when it has nothing behind it
**And** once a section is scrolled past two screens a "top" button joins the bar and returns to the top (instantly under reduced motion), hiding within one screen of the top; `BackToTop` and its square are removed
**And** select mode's action bar takes the app bar's place as it took the pinned button's; toasts sit above the bar; the bottom sheet's half-open height still shows the header, reading group and the first copy above the bar
**And** wide screens are unchanged: no bar, Add book top right, Filter and Select in the tools row
**And** strings in both languages; buttons have their visible label as their name; no tests; an uncommitted phone walk covers every section, scrolling to and from top, select mode, a toast, the sheet half open, both themes and an installed PWA's safe area

### Story 11.3: Rows and covers as icon buttons

As Mika,
I want the layout switch as two icon buttons beside the size switch,
So that rows and covers are one obvious tap.

**Acceptance Criteria:**

**Given** the collection's tools row
**When** it shows
**Then** it reads, left to right: the count line, the s / m / l Text switch, and a rows / covers pair of 40px square icon buttons with a 2px `text` outline, the chosen one filled `accent-fill` with a white icon (DESIGN.md → Icon switch), at every width
**And** the pair is a Toggle Group (one wrapper in `components/ui`, from Base UI): exactly one is pressed, arrow keys move between them, each has an accessible name ("Rows", "Covers"); the layout is still remembered per device and known at first paint
**And** no tests; an uncommitted phone and desktop walk covers switching, reload and both themes

### Story 11.4: Book detail header and reading control

As Mika,
I want a calmer Book detail header and a bolder reading switch,
So that what the book is and where I am with it read at a glance.

**Acceptance Criteria:**

**Given** Book detail (sheet and panel)
**When** the header shows
**Then** the cover is 120 × 180, beside the title in {typography.heading-detail}, the author, a muted "{pages} pages · {language}" line and the series line; publisher and year are no longer in the header (they move in 11.5); the Rating sits under these lines once the Book is read (decision 2), and saves as now
**And** the unread / reading / read Text switch becomes the Segmented control: three equal parts in a 2px `text` outline with 2px dividers, the chosen part filled `accent-fill` with white text; one Toggle Group wrapper from 11.3 (built here if 11.3 has not merged); transitions, toasts and the dates line under it are unchanged (FR-53, FR-54)
**And** the header text column ends near the cover's foot for a three-line title at phone width (checked with "Täällä Pohjantähden alla 1")
**And** no tests; an uncommitted phone and desktop walk covers the three transitions, a Book with no pages or language, a long title and both themes

### Story 11.5: Folding sections on Book detail

As Mika,
I want Book detail's groups folded until I open them,
So that the screen shows the book, not every list at once.

**Acceptance Criteria:**

**Given** Book detail (sheet and panel)
**When** it opens
**Then** below the reading group sit folding sections, each a full-width row with a {typography.heading-group} title, a muted summary at the right and a chevron, divided by `border` hairlines (DESIGN.md → Folding section), in this order: Your copies; Description & details; Genres, themes & tags; Lent before; On wishlists; all start closed and are not remembered (decision 5)
**And** the summaries are: Your copies — the one copy's location, "Ordered", or "Lent · {person}", or "{n} copies"; Description & details — none; Genres, themes & tags — the count; Lent before and On wishlists — the count; a section with nothing in it is absent, as its group is now
**And** Description & details holds the description (when there is one) and value rows for Publisher, Published, ISBN, Pages and Language
**And** Your copies keeps each copy's location chip, status, acquired line with its Links, and note; Lend, Move, Remove, Returned and Received stay on the lines until 11.6 moves them
**And** the sections are one Accordion wrapper in `components/ui` from Base UI; each row is a button with `aria-expanded`; focus targets that existing actions set on a copy's line or the wishlists group move to that section's row, which opens if a target inside it is needed
**And** Add to wishlist becomes a full-width secondary button at the foot; Edit stays beside it until 11.6
**And** no tests; an uncommitted phone and desktop walk covers every section open and closed, a Book with two copies, a Book only on a wishlist, and Remove of the last copy (focus lands on a section row)

### Story 11.6: Copy actions in the bar

As Mika,
I want Edit, Lend, Move and Remove in Book detail's bar,
So that I act on the book without hunting for Links on its copy lines.

**Acceptance Criteria:**

**Given** Book detail on the phone
**When** it shows
**Then** an `AppBar` (from 11.2) is pinned to the foot of the sheet with edit (primary ring) and the copy actions any copy allows, by the copy states of EXPERIENCE.md → Book detail: Lend, Move and Remove for an owned copy not lent, Returned for a lent copy, Received for an ordered copy; Remove has a `bar-danger` ring; the bar shows edit and at most three copy actions in the order Returned, Received, Lend, Move, Remove, and the rest go behind ⋯ (decision 3)
**And** ⋯ also holds Look it up again (creator's private Book with an ISBN) or Re-fetch (admin, shared Book), as a Menu from `components/ui`; ⋯ is absent when it would be empty
**And** these actions leave the copy lines in Your copies; with one eligible copy an action goes straight to its Picker or dialog as today (Lend, Move, Remove's confirm, Returned, Received)
**And** on wide screens the panel's foot shows the same actions as secondary buttons (Remove destructive), then Add to wishlist; Look it up again and Re-fetch stay as Links above the foot
**And** which actions show is one pure function of the copy lines, `copyActions(lines)`, with one unit test covering owned, lent, ordered, mixed and none (the rule can break silently)
**And** strings in both languages; an uncommitted phone and desktop walk covers an owned, a lent, an ordered and a wishlist-only Book, Remove with its confirm, and Undo on the Move and Lend toasts

### Story 11.7: Copy picker

As Mika,
I want to choose which copy an action is for when I own several,
So that Lend, Move and Remove still work on a Book I have twice.

**Acceptance Criteria:**

**Given** a Book with two or more copies eligible for an action from 11.6
**When** I tap that action
**Then** a Picker opens titled with the action and the Book's title, listing the eligible copies (location or "Ordered", status, acquired line), and a tap on one continues in the same sheet or dialog to that action's step: Lend's person and date, Move's locations, Returned and Received at once, Remove's confirm dialog naming the copy's location; overlays stay one level deep (EXPERIENCE.md → Copy picker)
**And** Back from the action's step returns to the copy list; Cancel or X closes it all; with one eligible copy the list is skipped
**And** the Picker wrapper gains the two-step mode once, reused by every action
**And** no tests beyond 11.6's; an uncommitted phone and desktop walk covers each action on a Book with an owned, a lent and an ordered copy

### Story 11.8: Stats tiles, chart and nerdy rows

As Mika,
I want Stats as bold coral tiles, a month chart and readable nerdy stats,
So that my reading year looks like something I want to open.

**Acceptance Criteria:**

**Given** Stats for any year
**When** it shows
**Then** the four big numbers are equal square tiles filled `accent-fill` with white text, 8px apart, two by two on the phone and four in a row on wide screens: the number on the first line and its label on the second, neither wrapping
**And** all four numbers share one size, the largest step of `tile-number-xl` 64px, `-l` 54px, `-m` 44px, `-s` 36px at which the longest formatted value fits the tile, chosen on the server by a pure `tileNumberStep(values)` with one unit test (spine Styling: no inline style)
**And** By month is a 12-column chart: one 16px `accent` square per finished Book stacked upward, a 2px `border` dash for a month with none, months after today in the current year dimmed, and single-letter month labels; each column's accessible name says "{month}: {n} books, {pages} pages" (FR-57 as amended)
**And** Nerdy stats shows Pages a day and Days a book as two medium numbers, then one row per remaining stat: a 26px `accent` line icon, the label in {typography.meta} muted, the title in {typography.title}, and the value line in {typography.meta} muted; a stat with no candidate is absent, as now
**And** By year, the year switch and Currently reading are unchanged
**And** strings in both languages; an uncommitted phone and desktop walk covers this year, a past year, an empty year, a long pages figure (6 digits) and both themes

### Story 11.9: Add book target and bar

As Mika,
I want a clear target over the camera and the other ways in at my thumb,
So that scanning in a dark shop and adding a book without a barcode are both one tap.

**Acceptance Criteria:**

**Given** Add book (`/scan`)
**When** the camera runs
**Then** the Camera frame is four 40px white corner brackets (4px) over the camera view with the `accent` guide line across, and a muted hint "Hold the barcode inside the corners" at its foot (DESIGN.md → Camera frame)
**And** on the phone an `AppBar` holds torch, add without ISBN and find by title / author; Find by title or author and Add without ISBN leave the screen as Links on the phone and stay as Links on wide screens; the ISBN field and Find are unchanged
**And** torch shows only when the scanner's controls offer `switchTorch` (the camera reports torch support); it toggles the light, is pressed while on, and the light goes off when the task closes; with no camera, or no torch, it is absent
**And** Playwright's scan-to-save and shop-check flows still pass, reaching Find by title / author and Add without ISBN through the bar on the phone viewport
**And** strings in both languages; an uncommitted walk on an iPhone and an Android phone covers the torch (or its absence), both Links and a desktop with no camera

### 4.2 PRD

- **FR-10.** Add at the end: "Where the camera supports it, a torch can be switched on while scanning."
- **FR-57.**
  - OLD: "by month, one 8px marker per finished Book and "{n} books · {pages} p""
  - NEW: "by month, a chart with one marker per finished Book for each month, its books and pages given to assistive technology"
- **Build Order.** Add after "Phase 1 addition: reading and stats":
  - **Phase 1 addition: bold Metro (Mika, 2026-11-10).** A bolder Metro look and a phone app bar (Epic 11). Committed like Phase 1, built after it. No requirement changes beyond FR-10's torch and FR-57's chart.

### 4.3 Architecture spine

- **UI primitives convention.**
  - OLD: "Dialog, sheet, combobox, menu and the other overlays come from Base UI, each wrapped once in `src/app/(frontend)/components/ui`."
  - NEW: "Dialog, sheet, combobox, menu and the other overlays, and the accordion and toggle group, come from Base UI, each wrapped once in `src/app/(frontend)/components/ui`. The accordion and toggle group are not overlays."
  - The rest is unchanged. Updated by Story 11.3 or 11.5, whichever merges first, in its own commit (CLAUDE.md rule).
- **Styling convention.** No text change. Story 11.8's step classes satisfy it.

### 4.4 UX

**DESIGN.md**

- **Brand & Style.** The three rules become:
  - **Fills, sparingly.** Areas are filled in three places only: the chosen option of a Segmented control or Icon switch, the Stats tiles (all `accent-fill`), and the phone App bar (`bar`). Covers, the scrim and the icon stay as they are. Rows, chips, buttons and stars are never filled.
  - **One accent.** `accent` is a line, a marker, a ring or an underline. `accent-fill` is its filled form, only in the places above, always under white text.
  - **One raised thing** is unchanged.
- **Colors.** New rows:
  - `accent-fill` `#D1432F` / `#D1432F`: the fills above (white on it is 4.6:1).
  - `bar` `#1F2933` / `#262E37`: the App bar's ground.
  - `bar-ink` `#FFFFFF` / `#E3E8EE`: its labels and rings.
  - `bar-danger` `#E0566F` / `#E0566F`: a destructive ring on the bar.
  - Avoid: "tinted backgrounds" stays; "fills beyond the three places" is added.
- **Typography.** The section heading is 56px / 300 / -0.02em at every width; the phone token equals it.
- **Layout & Spacing.**
  - New: `stroke-button` (2px; "set to 3px for heavier buttons"), `button-height` (54px).
  - The stroke list now names `stroke-button` for button outlines and the Segmented control.
- **Shapes.** One exception: the App bar's round 44px buttons.
- **Components.**
  - **Button:** `stroke-button` outline, `control` size, `button-height` tall.
  - **App bar** (new): slate ground, round rings, labels; ⋯ at its top right when it has items; the phone only.
  - **Segmented control** (new): 2px outline and dividers, the chosen part `accent-fill`.
  - **Icon switch** (new): 40px squares, chosen `accent-fill`.
  - **Folding section** (new): hairline rows, title, summary, chevron.
  - **Detail panel:** cover 120 × 180 and the header lines.
  - **Stats numbers** become **Stats tiles**.
  - **Stats by month:** the column chart.
  - **Stats facts:** two medium numbers, then icon rows.
  - **Camera frame:** corner brackets.
  - **Back to top:** removed.
  - **Action bar:** replaces the App bar.
- **Do's and Don'ts.** "Fill a button, chip, row or segment" becomes "Fill anything outside the three places". "Round anything" gains "except the App bar's buttons".
- **Reference mock-ups.** Add the canvas copy, noting that it wins over the key mock-ups on look.

**EXPERIENCE.md**

- **Information Architecture.**
  - Add book is in the App bar on the phone, top right on wide screens.
  - Add book's row lists the bar.
  - The measured header widths are as re-measured by 11.1.
- **Component Patterns.**
  - **Text switch:** drops rows / covers and unread / reading / read.
  - **Button, primary:** Add book is the App bar's primary on the phone.
  - **App bar:** new row with the per-surface contents above.
  - **Segmented control:** new row, for reading status.
  - **Icon switch:** new row, for layout.
  - **Folding section:** new row, starts closed, not remembered.
  - **Copy picker:** new row; two steps, one overlay.
  - **Action bar:** takes the App bar's place.
  - **Camera frame:** corners and the guide line.
  - **Link:** Lend, Move and Returned leave its list on the phone.
- **Collection controls.**
  - Layout: the Icon switch, right of Size.
  - Filter and Select: in the App bar on the phone.
  - Scrolling: "top" in the bar.
- **Book detail.** The groups table as Stories 11.4–11.7 define it. The foot is Add to wishlist on the phone, and the copy actions plus Add to wishlist on wide screens. The half-open sheet rule names the bar.
- **Scan.** The bar's three buttons, the torch rule, and the two Links on wide screens only.
- **Stats.** Big numbers as tiles, By month as the chart, Nerdy stats as icon rows.
- **Accessibility Floor.** White on `accent-fill` is 4.6:1. A pressed Segmented or Icon switch part is exposed as pressed, not by colour alone.
- **Responsive & Platform.** Phone: the App bar is pinned to the bottom. Wide: no App bar.

## 5. Decisions for review

1. **Headings at every width.** 56px / 300 on wide screens too, with the header widths re-measured (11.1). Alternative: keep 44px on wide.
2. **Rating stays "once read".** The canvas drew stars on a Book being read. Today's rule shows the Rating only once the Book is read. I kept the rule; the stars sit in the header when they show.
3. **Crowded detail bar.** With mixed copies there can be up to five copy actions. The bar keeps edit plus three, in the order Returned, Received, Lend, Move, Remove, and the rest go behind ⋯.
4. **By month loses its visible text.** "{n} books · {pages} p" per month moves to each column's accessible name only. Alternative: keep a muted total under the chart.
5. **Folding sections start closed** every time, and are not remembered per device.
6. **Wide panel foot.** Copy actions as secondary buttons, then Add to wishlist. Look it up again and Re-fetch stay as Links, since wide screens have no ⋯.
7. **Canvas in the repo.** Copy the six `.dc.html` sources to `ux-designs/ux-bookeh-2026-10-03/mockups/bold-metro/` with a README holding the canvas link. They need the canvas runtime to render, so the README says so.

## 6. Implementation handoff

- **Scope:** moderate. This is a new epic and a set of spine document edits, with no replan.
- **On approval, in this run:**
  - Apply §4.2–4.4 to the PRD, DESIGN.md and EXPERIENCE.md. The spine's UI primitives line waits for its story.
  - Append Epic 11 to `epics.md`.
  - Copy the canvas sources (decision 7).
  - Add `epic-11` and its nine stories to `sprint-status.yaml` as `backlog`.
- **Then:** Developer agent, story by story through `bmad-build`, in the order above. 11.2 and 11.6 are `followup_review_recommended` candidates, because they change where actions live.
- **Success:** every phone screen on the canvas is reproduced in the app in both themes; wide screens keep their layout with the new tokens; Playwright's two flows pass; changing `stroke-button` to 3px changes every button outline in one line.
