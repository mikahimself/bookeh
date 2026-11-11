# Epic 11 Context: Bold Metro

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Make bookeh bolder in the Metro style Mika picked on 2026-11-10. The epic brings 56px lowercase section headings, a deeper coral fill for chosen states and the Stats tiles, and heavier 2px-outlined buttons. On the phone, a slate App bar replaces the pinned Add book button. Book detail gets quieter: its groups fold away and the copy actions move off the copy lines into the bar. Stats gets tiles, a month chart and icon rows. Add book gets a corner target and a torch. Only the look and the place of actions change. Nothing the app stores or computes changes: there is no schema change, no migration and no new feature area. The torch is the one small behaviour addition.

## Stories

- Story 11.1: Bold tokens, headings and buttons (done)
- Story 11.2: Phone app bar
- Story 11.3: Rows and covers as icon buttons
- Story 11.4: Book detail header and reading control
- Story 11.5: Folding sections on Book detail
- Story 11.6: Copy actions in the bar
- Story 11.7: Copy picker
- Story 11.8: Stats tiles, chart and nerdy rows
- Story 11.9: Add book target and bar

## Requirements & Constraints

- **Front end only.** Wide screens (900px and up) get no App bar:
  - Add book stays at the top right.
  - Filter and Select stay as Links in the tools row.
  - The detail panel's foot carries the copy actions as buttons.
  - Tokens, headings, tiles, the reading control and the folding sections apply at every width.
- **Torch.** While scanning, the torch can be switched on where the camera reports torch support. It is absent when there is no support or no camera. The light goes off when the task closes.
- **By month** is a chart with one marker per finished Book. Each month's books and pages go to assistive technology only, as the column's accessible name "{month}: {n} books, {pages} pages". The visible per-month text goes away.
- **Accessibility.**
  - White on `accent-fill` is 4.6:1.
  - A chosen Segmented or Icon switch part is exposed as pressed, never by its fill alone.
  - App bar buttons are named by their visible labels.
  - Under reduced motion, "top" scrolls instantly.
- **Strings.** Everything new comes in English and Finnish.
- **Tests stay minimal.**
  - Two unit tests are named: `copyActions(lines)` (11.6) and `tileNumberStep(values)` (11.8).
  - Playwright's scan-to-save and shop-check flows must keep passing. On the phone viewport they reach Find by title / author and Add without ISBN through the bar (11.9).
  - Everything else is checked by an uncommitted walk on the phone and desktop, in both themes.
- **Success.**
  - Every phone screen on the canvas is reproduced in both themes.
  - Wide screens keep their layout with the new tokens.
  - Changing `stroke-button` to 3px changes every button outline in one line.

## Technical Decisions

- **Tokens** live only in `src/app/(frontend)/styles.css`, under DESIGN.md's names.
  - 11.1 declared `accent-fill`, `bar`, `bar-ink`, `bar-danger`, `stroke-button` (2px), `button-height` (54px), the 56px headings and the 17px `button` type.
  - 11.8 adds the tile number steps `tile-number-xl` 64px, `-l` 54px, `-m` 44px and `-s` 36px.
- **Styling rules.**
  - No `dark:` utilities, no inline style objects, and no colour or size literals in components.
  - The shared tile number size is a step class chosen on the server.
  - Draw the outlines of the Segmented control and the Icon switch from `stroke-button`, as buttons do (`border-(length:--spacing-stroke-button)`), not with a bare `border-2`.
  - App bar rings and field underlines stay on `stroke-control`.
- **Buttons.** `buttonClass()` in `components/Button.tsx` is the one place buttons are drawn.
  - Primary is outlined in `accent`, secondary in `text`, destructive in `danger`.
  - Compact (Find beside the ISBN field) is the exception to `button-height`.
- **Base UI.** Each primitive is wrapped once in `src/app/(frontend)/components/ui`. Screens never import `@base-ui/react`, and ESLint enforces this.
  - The epic adds an **Accordion** wrapper and a **Toggle Group** wrapper. Neither is an overlay, so the one-level overlay rule does not apply to them.
  - ⋯ uses the existing Menu wrapper.
  - The Copy picker extends the existing Picker wrapper with a two-step mode, built once.
  - The spine's UI primitives line names the toggle group since 11.4, which built the wrapper (11.3 reuses it). 11.5 adds the accordion to that line in its own commit, as one of its acceptance criteria.
- **AppBar** is a new shared component in the section shell.
  - It replaces the pinned Add book button and `BackToTop`, which is removed.
  - Book detail's sheet (11.6) and Scan (11.9) reuse it.
- **Pure helpers.**
  - `copyActions(lines)` decides which copy actions show.
  - `tileNumberStep(values)` picks the largest step at which the longest formatted value fits.
- **Torch** uses `@zxing/browser`'s scanner controls. `switchTorch` is present only when the track supports it.
- **No change** to any AD or shared shape.
- **Sources of the look.** The canvas sources are in `ux-designs/ux-bookeh-2026-10-03/mockups/bold-metro/*.dc.html`. They need the canvas runtime to render. DESIGN.md and EXPERIENCE.md win over the canvas, and the canvas wins over the older key mock-ups on look.

## UX & Interaction Patterns

- **Fills, sparingly.** Areas are filled in three places only:
  - the chosen part of a Segmented control or Icon switch, in `accent-fill` under white text;
  - the Stats tiles, in `accent-fill` under white text;
  - the phone App bar, in `bar`.

  Buttons, rows, chips and stars are never filled. `accent` is a line, ring or marker; `accent-fill` is never a line. Every corner is square except the App bar's 44px circles.
- **App bar** (phone only, under 900px).
  - **Shape.** A `bar` band pinned to the bottom above the safe area, about 84px tall, with no shadow.
  - **Buttons.** Centred, `spacing-5`–`spacing-7` apart. Each is a 44px circle with a `stroke-control` `bar-ink` ring and a 20–22px inline SVG line icon, over a lowercase `label`-size label that may wrap to two lines.
  - **Rings.** The layer's primary has an `accent` ring; a destructive button has a `bar-danger` ring.
  - **Capacity.** At most four buttons. A ⋯ sits at the top right only when the menu has items.
  - **Contents.**
    - Collection: add book, filter, select.
    - Loans, wishlists, stats, settings: add book.
    - Book detail: edit, then up to three copy actions.
    - Scan: torch, add without ISBN, find by title / author.
  - **"top" button.** It joins the bar once a section is scrolled past two screens and hides again within one screen of the top.
  - **Stacking.** Toasts sit above the bar. Select mode's Action bar takes the bar's place, and no "top" shows then.
- **Segmented control** (reading status, 48px tall, three equal parts) and **Icon switch** (rows / covers, two 40px squares 4–6px apart).
  - Each has a 2px `text` outline, with the chosen part filled.
  - Exactly one part is chosen, and it switches at once with no confirm.
  - Arrow keys move between parts.
- **Collection tools row**, left to right: the count, the s / m / l Text switch, then the rows / covers Icon switch. The layout is remembered per device and known at first paint.
- **Book detail header.**
  - The cover is 120 × 180, beside the `heading-detail` title, the author, a muted "{pages} pages · {language}" line and the series.
  - The Rating shows only once the Book is read.
  - Publisher and year move into Description & details.
- **Folding sections**, in this order: Your copies, Description & details, Genres themes & tags, Lent before, On wishlists.
  - Each row is at least 58px tall: the title, a muted summary on the right and a chevron, with `border` hairlines between rows.
  - Several can be open at once. All start closed, and nothing is remembered.
  - A section with nothing in it is absent.
  - When an action sends focus into a closed section, that section's row takes focus.
- **Book detail actions.**
  - **Phone.** The App bar holds edit (primary), then the copy actions any copy allows, in the order Returned, Received, Lend, Move, Remove, at most three. The rest go behind ⋯, with Look it up again or Re-fetch.
  - Above the bar, Add to wishlist is a full-width secondary button.
  - The half-open sheet shows the header and the reading control above the bar.
  - **Wide panel foot.** Edit, the copy actions as secondary buttons (Remove destructive), then Add to wishlist. There is no primary. Look it up again and Re-fetch stay as Links above the foot.
- **Copy picker**, when two or more copies qualify for an action.
  - The title is the action plus the Book's title. The list shows the eligible copies: location or "Ordered", status, and the acquired line.
  - A tap continues in the same overlay to the action's step. Returned and Received act at once.
  - Back returns to the list; Cancel or X closes everything.
  - It stays one overlay deep and is skipped when only one copy qualifies.
- **Stats.**
  - **Tiles.** Four equal square tiles 8px apart: two by two on the phone, four in a row on wide screens. Each shows the number over its `title`-type label, white, neither wrapping, with one shared number size.
  - **By month.** 12 columns of 16px `accent` squares, 3px apart, stacked upward. A past month with none shows a `border` dash. Future months are left empty, with dimmed labels. Labels are single letters.
  - **Nerdy stats.** Two 38px numbers (Pages a day, Days a book), then rows of a 26px `accent` line icon with label, title and meta lines.
  - By year, the year switch and Currently reading are unchanged.
- **Camera frame.**
  - Four 40px white corner brackets drawn in a 4px line, with an `accent` guide line across the middle.
  - The hint "Hold the barcode inside the corners" sits at the foot.
  - On wide screens, Find by title or author and Add without ISBN stay as Links.

## Cross-Story Dependencies

- **Order.** 11.1 is done.
  - 11.2, 11.4 and 11.8 can run in any order.
  - 11.3 and 11.9 need 11.2 (the AppBar).
  - 11.5 needs 11.4. 11.6 needs 11.2 and 11.5. 11.7 needs 11.6.
- **Book detail stories.** 11.4 → 11.5 → 11.6 → 11.7 touch the same files and run one at a time.
- **Toggle Group wrapper.** Built by 11.4 (`components/ui/ToggleGroup.tsx`); 11.3 reuses it.
- **Between 11.5 and 11.6:**
  - Lend, Move, Remove, Returned and Received stay on the copy lines.
  - Edit stays beside Add to wishlist.
- **Left from 11.1, until their stories land:**
  - Stats' big numbers render at 56px until 11.8.
  - `BackToTop` keeps a bare `border-2` until 11.2 removes it.
  - 11.1's deferred item stays with 11.1 and is not an acceptance criterion of any later story. The toast lift over select mode's Action bar ignores the bar's 2px top border, so the toast sits 14px above the bar instead of 16px. 11.2 reworks this toast and bar arithmetic.
- **Follow-up reviews.** 11.2 and 11.6 are candidates for `followup_review_recommended`, because they change where actions live.
