# Epic 11 Context: Bold Metro

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give bookeh the bolder Metro look Mika picked on 2026-11-10: 56px lowercase section headings, a deeper coral fill for selected states and the Stats tiles, heavier 2px-outlined buttons, a slate phone App bar in place of the pinned Add book button, and a quieter Book detail where groups fold away and the copy actions move off the copy lines into the bar. Only the look and where actions sit change. Nothing the app stores or computes changes: no schema change, no migration, no new feature area. The torch while scanning is the one small behaviour addition.

## Stories

- Story 11.1: Bold tokens, headings and buttons
- Story 11.2: Phone app bar
- Story 11.3: Rows and covers as icon buttons
- Story 11.4: Book detail header and reading control
- Story 11.5: Folding sections on Book detail
- Story 11.6: Copy actions in the bar
- Story 11.7: Copy picker
- Story 11.8: Stats tiles, chart and nerdy rows
- Story 11.9: Add book target and bar

## Requirements & Constraints

- The change is front end only. Wide screens (900px and up) get no App bar: Add book stays top right, Filter and Select stay as Links in the tools row, and the detail panel's foot carries the copy actions as buttons. Tokens, headings, tiles, the reading control and the folding sections apply at every width.
- Scanning: where the camera reports torch support, a torch can be switched on while scanning. It is hidden when there is no support or no camera, and the light goes off when the task closes.
- Stats by month is a chart with one marker per finished Book. Each month's books and pages go to assistive technology only (the column's accessible name); the visible "{n} books · {pages} p" text goes away.
- Accessibility: white on `accent-fill` is 4.6:1. A chosen Segmented or Icon switch part is exposed as pressed, never by its fill alone. App bar buttons are named by their visible labels. Reduced motion makes scroll-to-top instant.
- Strings in both languages (English and Finnish) for everything new.
- Tests stay minimal. Only two unit tests are named: `copyActions(lines)` (11.6) and `tileNumberStep(values)` (11.8). Playwright's scan-to-save and shop-check flows must keep passing, reaching Find by title / author and Add without ISBN through the bar on the phone viewport (11.9). Everything else is checked by an uncommitted phone and desktop walk in both themes.
- Success: every phone screen on the canvas is reproduced in both themes, wide screens keep their layout with the new tokens, and changing `stroke-button` to 3px changes every button outline in one line.

## Technical Decisions

- **Tokens** go only in `src/app/(frontend)/styles.css`, as Tailwind theme variables under DESIGN.md's names:
  - `accent-fill` `#D1432F` (both themes)
  - `bar` `#1F2933` / `#262E37`
  - `bar-ink` `#FFFFFF` / `#E3E8EE`
  - `bar-danger` `#E0566F` (both)
  - `stroke-button` 2px and `button-height` 54px
  - `heading-section` and `heading-section-phone` at 56px / 300 / -0.02em
  - the `button` type at 17px
  - the tile number steps `tile-number-xl` 64, `-l` 54, `-m` 44 and `-s` 36px
- **Styling rules:** no `dark:` utilities, no inline style objects, and no colour or size literals in components. The shared tile number size is a step class chosen on the server, not a style.
- **Buttons:** `buttonClass()` in `components/Button.tsx` is the single place buttons are drawn: a `stroke-button` outline, primary in `accent`, secondary in `text`, destructive in `danger`. The compact button (Find beside the ISBN field) keeps its smaller padding.
- **Base UI primitives** are each wrapped once in `src/app/(frontend)/components/ui`. Screens never import `@base-ui/react`, and ESLint enforces this.
  - The epic adds an **Accordion** wrapper and a **Toggle Group** wrapper. Neither is an overlay, so the one-level overlay rule does not apply to them.
  - The ⋯ menu uses the existing Menu wrapper. The Copy picker extends the existing Picker wrapper with a two-step mode, built once.
  - The spine's UI primitives line must be amended to name the accordion and toggle group, in the same commit as whichever of 11.3 or 11.5 merges first.
- **AppBar** is a new shared component in the section shell. It replaces the pinned Add book button and `BackToTop`, which is removed. Book detail's sheet (11.6) and Scan (11.9) reuse it.
- **Pure helpers** where logic lives:
  - `copyActions(lines)` decides which copy actions show.
  - `tileNumberStep(values)` picks the largest step at which the longest formatted value fits.
- **Torch** uses `@zxing/browser`'s scanner controls: `switchTorch` is present only when the track supports it.
- No AD changes and no shared-shape changes.
- **Sources of the look:** the canvas sources in `ux-designs/ux-bookeh-2026-10-03/mockups/bold-metro/` (`.dc.html`) give exact values, but they need the canvas runtime to render. DESIGN.md and EXPERIENCE.md win over the canvas, and the canvas wins over the older key mock-ups on look.

## UX & Interaction Patterns

- **Fills, sparingly.** Areas are filled in three places only:
  - the chosen part of a Segmented control or Icon switch, in `accent-fill` under white text;
  - the Stats tiles, also `accent-fill` under white text;
  - the phone App bar, in `bar`.

  Buttons, rows, chips and stars are never filled. `accent` stays a line, ring or marker, and `accent-fill` is never a line. Every corner is square except the App bar's 44px circles.
- **App bar** (phone, under 900px):
  - Shape: a `bar` band pinned to the bottom above the safe area, with no shadow. Centred 44px circles, each with a 2px `bar-ink` ring, a 20–22px inline SVG line icon and a lowercase `label`-size label under it.
  - Rings: the layer's primary has an `accent` ring, a destructive button a `bar-danger` ring.
  - Capacity: at most four buttons, plus a ⋯ at the top right only when the menu has items.
  - Contents per surface:
    - Collection: add book, filter, select.
    - Loans, wishlists, stats and settings: add book.
    - Book detail: edit plus up to three copy actions.
    - Scan: torch, add without ISBN, find by title / author.
  - "top" button: joins the bar once the page is scrolled past two screens, and hides again within one screen of the top.
  - Stacking: toasts sit above the bar. Select mode's Action bar takes the bar's place.
- **Segmented control** (reading status) and **Icon switch** (rows / covers, 40px squares): a 2px `text` outline, the chosen part filled. Exactly one is chosen, it switches at once with no confirm, and arrow keys move between parts.
- **Collection tools row**, left to right: the count, the s / m / l Text switch, then the rows / covers Icon switch. The layout is remembered per device and known at first paint.
- **Book detail header:**
  - The cover is 120 × 180, beside the `heading-detail` title, the author, a muted "{pages} pages · {language}" line and the series.
  - The Rating shows only once the Book is read. Publisher and year move into Description & details.
- **Folding sections** in Book detail:
  - Order: Your copies, Description & details, Genres themes & tags, Lent before, On wishlists.
  - Each row is at least 58px tall: the title, a muted summary on the right and a chevron, with `border` hairlines between rows.
  - All start closed and nothing is remembered. A section with nothing in it is absent.
  - When an action sends focus into a closed section, that section's row takes focus.
- **Book detail actions:**
  - Phone: the App bar holds edit (primary), then the copy actions any copy allows, in the order Returned, Received, Lend, Move, Remove, at most three. The rest go behind ⋯, with Look it up again or Re-fetch.
  - Above the bar, Add to wishlist is a full-width secondary button. The half-open sheet still shows the header and the reading control above the bar.
  - Wide panel foot: Edit, the copy actions as secondary buttons (Remove destructive), then Add to wishlist. Look it up again and Re-fetch stay as Links.
- **Copy picker:** used when two or more copies qualify for an action.
  - Its title is the action plus the Book's title. It lists the eligible copies (location or "Ordered", status, acquired line).
  - A tap continues in the same overlay to the action's step. Returned and Received act at once.
  - Back returns to the list, and Cancel or X closes everything. It stays one overlay deep and is skipped when only one copy qualifies.
- **Stats:**
  - Tiles: four equal square tiles 8px apart, two by two on the phone and four in a row on wide screens. Each shows the number over its label, neither wrapping, with one shared number size.
  - By month: 12 columns of 16px `accent` squares, 3px apart, stacked upward. An empty month shows a `border` dash, future months are dimmed, and the labels are single letters.
  - Nerdy stats: two 38px medium numbers, then rows of a 26px `accent` line icon with label, title and meta lines. By year, the year switch and Currently reading are unchanged.
- **Camera frame:** four 40px white corner brackets (4px line), an `accent` guide line across the middle, and a muted hint "Hold the barcode inside the corners" at the foot. On wide screens, Find by title or author and Add without ISBN stay as Links.

## Cross-Story Dependencies

- 11.1 comes first, because every later story builds on its tokens and buttons.
- After 11.1, the stories open up as follows:
  - 11.2, 11.4 and 11.8 can run in any order.
  - 11.3 and 11.9 need 11.2 (the AppBar).
  - 11.5 needs 11.4.
  - 11.6 needs 11.2 and 11.5.
  - 11.7 needs 11.6.
- The Book detail stories (11.4 → 11.5 → 11.6 → 11.7) touch the same files and run one at a time.
- The Toggle Group wrapper is built by whichever of 11.3 or 11.4 comes first and reused by the other.
- Between 11.5 and 11.6, Lend, Move, Remove, Returned and Received stay on the copy lines, and Edit stays beside Add to wishlist.
- 11.2 and 11.6 are candidates for `followup_review_recommended`, because they change where actions live.
