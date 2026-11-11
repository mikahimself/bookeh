# Epic 11 Context: Bold Metro

<!-- Generated from planning artifacts. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Give bookeh the bolder Metro look selected on 2026-11-10: larger section headings, heavier outlines, selective coral fills, a phone App bar, calmer Book detail and more visual Stats. Preserve the existing catalogue, reading and copy behaviour. This is a frontend change without schema changes or migrations; camera torch support is the only small new capability.

## Stories

- Story 11.1: Bold tokens, headings and buttons
- Story 11.2: Phone app bar
- Story 11.3: Rows and covers as icon buttons
- Story 11.4: Book detail header and reading control
- Story 11.5: Folding sections on book detail
- Story 11.6: Copy actions in the bar
- Story 11.7: Copy picker
- Story 11.8: Stats tiles, chart and nerdy rows
- Story 11.9: Add book target and bar
- Story 11.10: Book detail sheet opens at once

## Requirements & Constraints

- Apply tokens, switches, folding sections and Stats visuals at every width. Below 900px, use the phone App bar; from 900px, preserve the wide layout, header Add book and tools-row Links.
- Layout, size, theme and loans order remain device preferences in one cookie, read by the server so first paint is correct. Language belongs to the profile. Supply interface strings in English and Finnish.
- Expose chosen switch buttons as pressed, independently of colour. Each icon-only button has an accessible name; App bar buttons use their visible labels. Preserve keyboard operation, reduced motion and safe areas.
- Preserve Stats definitions and reading/copy action semantics. The monthly chart supplies month, books and pages through each column’s accessible name.
- Keep automated tests minimal: only the named pure-helper behaviour tests for copy-action eligibility and tile-number sizing are new. Maintain scan-to-save and shop-check coverage. Visual changes are checked by uncommitted phone and desktop walks in both themes, against the fixture e2e server and test database.
- Success means reproducing the selected phone screens in both themes while keeping wide layout intact. One button-stroke token controls all button outlines.

## Technical Decisions

- The PRD governs scope, the architecture spine implementation, and DESIGN.md/EXPERIENCE.md appearance and behaviour. Their rules win over the Bold Metro canvas, which wins over older mock-ups on appearance.
- Declare design tokens only as Tailwind theme variables in frontend `styles.css`. No colour or size literals in components, inline style objects, CSS Modules or `dark:` utilities. Use semantic theme tokens and the shared spacing scale; declare named variables for sizes outside that scale.
- `accent-fill` is the deeper coral fill, and `on-fill` is white in both themes. Use this pair for selected switches and Stats tiles. `accent` remains a line, ring or marker. The phone bar uses `bar`, `bar-ink` and destructive `bar-danger`.
- Button outlines, Segmented controls and Icon switches use `stroke-button`; field underlines and App bar rings use `stroke-control`. Hairlines separate folding sections. All corners remain square except App bar circles. Add no shadows or raised surfaces.
- Base UI primitives are wrapped once under frontend `components/ui`; screens import wrappers only. Toggle groups and accordions are not overlays. Copy picking and action steps stay one overlay deep. Update the spine in the same commit when a story changes its primitive contract.
- Keep present data ownership, access, transactions and Undo guarantees. This visual refresh adds no stored fields or cached statistics.

## UX & Interaction Patterns

- Section headings are lowercase 56px light-weight text. Buttons have heavier outlines and the shared button height and type.
- The phone App bar is a slate band above the safe area, with centred 44px outlined circles, inline line icons and small lowercase labels. At most four actions appear, with overflow only when it has items. Toasts sit above it; select mode replaces it with the Action bar. A top action appears after two screens of scrolling and hides within one.
- Collection display controls follow the count line: s/m/l Text switch, then rows/covers Icon switch. The latter has two 40px squares separated by a small gap, text-colour outlines and line icons. The chosen square uses `accent-fill` for fill and outline, with an `on-fill` icon. Exactly one stays chosen; changes act immediately and arrow keys move between options.
- Reading uses a three-part Segmented control. Book detail has a larger cover and quieter metadata, with Rating shown for read Books. Its content folds into independently opening sections; empty sections disappear and open state is not remembered. Existing action focus targets must remain reachable when sections are folded.
- Book detail’s phone bar holds Edit plus eligible copy actions, with excess actions and secondary utilities in overflow. Wide screens use the panel foot. Multiple eligible copies first open a Copy picker, then the action step in the same overlay; one eligible copy skips that list.
- Stats uses equal coral tiles with one shared number-size step chosen on the server. Monthly columns contain one marker per finished Book, past empty months show a dash and future months stay empty. Nerdy stats gains line icons; existing year selection and Currently reading remain.
- Scan gains corner brackets, a guide line and hint. Phone alternate entry actions move into its bar. Torch is available only when the camera supports it and turns off when the task closes; wide alternate-entry Links remain.

## Cross-Story Dependencies

- 11.1 precedes the rest. Then 11.2, 11.4 and 11.8 can proceed independently. 11.3 and 11.9 need 11.2; 11.5 needs 11.4; 11.6 needs 11.2 and 11.5; 11.7 needs 11.6.
- Book detail stories 11.4 through 11.7 run sequentially because they share the same surface. The Toggle Group wrapper is shared by reading and collection layout; whichever story supplies it first is reused by the other. The accordion contract belongs to 11.5.
- Between folding-section and action-bar changes, copy actions remain on their existing lines. The later action-bar change relocates them and supplies multiple-copy selection afterward.
