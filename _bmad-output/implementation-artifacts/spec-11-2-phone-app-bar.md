---
title: '11.2 Phone app bar'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: '126dc930ea1a35dd4f6f4f3feaee9acc3f7be8a7'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** On the phone every section pins a full-width Add book button (with a back-to-top square beside it). Bold Metro replaces it with a slate App bar of round icon buttons, so the section's own actions (Filter, Select) sit under the thumb too.

**Approach:** One shared `AppBar` in the section shell: Add book as its primary, a portal slot for a section's own buttons (the collection's Filter and Select), and a "top" button after two screens of scrolling. `BackToTop` and its square go. Wide screens are unchanged.

## Boundaries & Constraints

**Always:**
- Phone only (under 900px): `wide:hidden`. Wide keeps Add book top right and Filter and Select Links in the tools row. Each is drawn once per width, the other copy `hidden`, so DOM and focus order match what is drawn (as Add book is today).
- `bar` ground, `bar-ink` labels and rings, `stroke-control` ring, 44px circles (the one rounded shape), 20–22px inline SVG icon over a lowercase `label`-size label that may wrap to two lines. Add book's ring is `accent`. About 84px tall before the safe area; bottom padding adds `env(safe-area-inset-bottom)`. No shadow. Buttons centred, `spacing-5` apart.
- Buttons are named by their visible label. Strings in English and Finnish. Tokens only in `styles.css`; no colour or size literals in components, no `dark:`.
- "top" joins once the window is scrolled past two screens and hides within one (the thresholds `BackToTop` has); smooth scroll, instant under reduced motion.
- Select mode's Action bar takes the App bar's place (the existing `:root:has([data-action-bar])` rule hides it). Toasts sit above the bar. The `--spacing-pinned-bar` toast lift is the App bar's height while it shows, and includes the Action bar's 2px top edge (11.1's deferred toast arithmetic).
- `AppBar` is reusable: 11.3, 11.6 and 11.9 mount it elsewhere, so it takes its primary as children and extra buttons through the slot.

**Never:** a ⋯ menu (nothing is behind it in this story), loans/wishlists/stats/settings buttons beyond Add book, Book detail's or Scan's bar (11.6, 11.9), a test (CLAUDE.md Conventions, the story says none), changes to wide layout.

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/layout.tsx` -- the shell; renders Add book twice (header `wide:`, pinned bar phone) and `BackToTop`. The pinned div becomes `<AppBar>`; wrap the shell in `AppBarProvider`.
- `src/app/(frontend)/(sections)/BackToTop.tsx` -- delete; its scroll thresholds move into the bar's "top" button.
- `src/app/(frontend)/components/AppBar.tsx` -- new client file: `AppBarProvider` (holds the slot element in state), `AppBar` (`data-pinned-bottom data-app-bar`, children, slot `div`, top button), `AppBarLink` and `AppBarButton` (circle + icon + label, `primary` ring), `AppBarItems` (portals children into the slot; renders nothing until the slot exists).
- `src/app/(frontend)/(sections)/CollectionTools.tsx` -- Filter and Select `ActionLink`s get a `max-wide:hidden` wrapper; mounts `<AppBarItems>` with filter (`aria-expanded={filter.open}`, `filter.toggle`) and select (`start`, absent while `selecting`).
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- doc comment only (the pinned Add book it hides is now the App bar).
- `src/app/(frontend)/styles.css` -- `--spacing-app-bar: 84px`; `:root:has([data-app-bar])` sets `--spacing-pinned-bar` to it; the select-mode rule (later in the file) keeps winning and gains `+ var(--spacing-stroke-control)`; comments at lines ~164 and ~272 and the `[data-pinned-bottom]` view-transition rule keep working because the bar keeps `data-pinned-bottom`.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- lift reads `--spacing-pinned-bar`; only its comment ("a bar pinned to the bottom (Add book)") changes.
- `messages/en.json`, `messages/fi.json` -- `sections.backToTop` becomes the lowercase label "top" / "ylös"; add `sections.appBarFilter`-style keys only if the existing `collection.filter` / `collection.select` do not fit (they do: "Filter"/"Select", lowercased by `ui-case`). The icon buttons reuse `scan.open`, `collection.filter`, `collection.select`.
- `tests/unit/collectionPage.unit.spec.ts` -- clicks the tools row's Select button; it stays in the DOM (hidden by CSS only on the phone), so it must keep passing. `tests/e2e/scanToSave.spec.ts`, `shopCheck.spec.ts` use the header's Add book link (desktop project); unchanged.
- `tests/e2e/boldTokens.walk.spec.ts` -- 11.1's uncommitted walk asserts the pinned bar at 86px and `Back to top`; it is stale after this story (git-ignored, not edited).
- `_bmad-output/.../ux-designs/.../EXPERIENCE.md`, `DESIGN.md` -- already describe the App bar; update the measured heights only if the build differs. The spine's Shell line mentions the pinned button if any (`grep -n "Back to top\|pinned" ARCHITECTURE-SPINE.md` found none).

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/components/AppBar.tsx` -- create the shared bar, button, slot and "top" -- one place the App bar is drawn
- `src/app/(frontend)/(sections)/layout.tsx` -- mount `AppBarProvider` and `AppBar` with Add book as primary; remove `BackToTop` -- replaces the pinned button
- `src/app/(frontend)/(sections)/BackToTop.tsx` -- delete -- its square is removed
- `src/app/(frontend)/(sections)/CollectionTools.tsx` -- phone Filter and Select in the bar, Links stay on wide -- the collection's actions
- `src/app/(frontend)/styles.css` -- `--spacing-app-bar`, toast-lift arithmetic -- toasts above the bar
- `messages/en.json`, `messages/fi.json` -- the "top" label -- both languages
- `src/app/(frontend)/(sections)/SelectBar.tsx`, `ToastProvider.tsx` -- comments follow the code
- `tests/e2e/appBar.walk.spec.ts` (uncommitted, git-ignored) -- phone walk against the e2e server: every section, scroll to and from top, select mode, a toast, the sheet half open, light and dark; record under `## Auto Run Result`

**Acceptance Criteria:**
- Given any section under 900px, when it shows, then a `bar`-ground App bar is pinned to the bottom above the safe area with round 44px buttons, `bar-ink` rings and lowercase labels, Add book first with an `accent` ring, and no pinned Add book button.
- Given the collection on the phone, when it shows, then the bar holds add book, filter and select, and the tools row shows neither Link; loans, wishlists, stats and settings hold add book only; no bar has a ⋯.
- Given a section scrolled past two screens, when the bar shows, then "top" joins it and returns to the top (instantly under reduced motion), and it hides within one screen of the top; `BackToTop` no longer exists.
- Given select mode on the phone, when it is on, then the Action bar takes the bar's place and a toast sits 16px above it; given a toast otherwise, it sits above the App bar.
- Given the sheet half open, when it shows, then the header, reading group and first copy are visible above the bar's place.
- Given 900px and wider, when any section shows, then there is no bar, Add book is top right and Filter and Select are Links in the tools row.
- Given either language, then labels are Finnish/English and each button's accessible name is its visible label.

## Spec Change Log

## Review Triage Log

### 2026-11-11 — Review pass
- verdicts: 18 findings — high 0, medium 0, low 11, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Edge 1 / Blind 1: bar taller than 84px when a label wraps to two lines — DESIGN.md allows the wrap; the toast then sits 0–16px above the bar, never behind it; the fix (ResizeObserver or fixed one-line labels) adds machinery for a case not met with "add book / filter / select" or the Finnish labels.
  - `[low]` `[reject]` Edge 2 / Blind 3: buttons shift sideways when "top" joins — the bar is centred by DESIGN.md and EXPERIENCE.md; a reserved slot would break the centring.
  - `[low]` `[reject]` Edge 3: focus lost when "top" or Select unmounts — Select's press hands focus to the Action bar's Done (autoFocus); "top" unmounts only after scrolling to the top; fix adds focus plumbing for a negligible case.
  - `[false]` `[reject]` Edge 4: duplicate AppBarItems during a section transition — `CollectionTools` mounts only on the collection page, so only one instance exists; its portal content unmounts with it.
  - `[low]` `[reject]` Edge 5 / Blind 6: Filter and Select appear one render after hydration — stated in Design Notes; the buttons are interactive only after hydration anyway.
  - `[false]` `[reject]` Edge 6 / Blind 4: "top" is a bare accessible name — the AC and DESIGN.md say buttons are named by their visible label; the key name is internal.
  - `[low]` `[reject]` Edge 7 / Blind 9: the Action bar rule adds 2px on wide too — intended (11.1's deferred toast arithmetic); the walk measured 16px above the Action bar.
  - `[low]` `[reject]` Edge 8 / Blind 8 (stale walk part): `boldTokens.walk.spec.ts` is stale — git-ignored, uncommitted, never run in CI.
  - `[false]` `[reject]` Edge 9: the 84px claim is unmeasured — the walk measured 84px with one-line labels, and the toast gap at 16px.
  - `[low]` `[reject]` Edge 10: Tailwind scale values (`size-5`, `pt-3`) in the component — they are the token scale; no hex or px literals.
  - `[false]` `[reject]` Edge 11 / Blind 2: safe area outside the toast lift — `ToastProvider` adds `env(safe-area-inset-bottom)` itself (its bottom formula).
  - `[false]` `[reject]` Blind 5: Filter opens a panel off screen — on the phone Filter is a bottom Sheet; the walk saw the dialog open from mid-list.
  - `[low]` `[patch]` Blind 7: `primary` on `AppBarButton` unused — removed (the link keeps it); 11.6's destructive ring can add what it needs.
  - `[low]` `[reject]` Blind 8 (rest): spec hedges message keys and lacks an Auto Run Result — a fix edits this build's spec; the Auto Run Result is written below.
  - `[low]` `[patch]` Blind 10: CollectionTools doc comment on one long line — re-wrapped.
  - `[false]` `[reject]` Blind 10: ToastProvider comment says "peer main" — the region does follow the layout's peer `<main>`; the comment is accurate.
  - `[low]` `[reject]` Blind 10: followup_review_recommended false — the rule counts patched high/medium entries, and none was.
  - `[low]` `[reject]` Intent alignment: the sheet-half-open criterion has no diff change — verified by the walk (`sheet-half.png`); the sheet portals above the bar and needed no change.

## Design Notes

The slot is a portal because Filter and Select need the collection's providers (`FilterPanelProvider`, `SelectionProvider`), which live in `page.tsx`, below the layout that owns the bar. A server layout cannot reach them; the provider-held element is the least machinery that lets a section add buttons to a bar it does not render. The first client render has no slot, so the buttons appear one render after hydration.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npx vitest run tests/unit` -- expected: passes (or the project's unit command from package.json)
- `npx playwright test tests/e2e/scanToSave.spec.ts tests/e2e/shopCheck.spec.ts --workers=1` -- expected: passes

**Manual checks:**
- The walk's screenshots at 390px (both themes) and 1300px.

## Auto Run Result

Walk `tests/e2e/appBar.walk.spec.ts` (uncommitted, git-ignored), 390px in light and dark and 1300px, passed. Screenshots and `result.json` are in `test-results/app-bar-walk/`.

- Bar: `bar` ground (rgb(31, 41, 51) light, rgb(38, 46, 55) dark), 84px tall, flush to the bottom; buttons are 44 × 44 circles with 2px rings and lowercase 12px labels; Add book's ring is `accent` (rgb(240, 96, 79)), the others `bar-ink`.
- Sections: collection holds add book, filter, select; loans, wishlists, stats and settings hold add book only; no ⋯.
- Tools row: no Filter or Select Link on the phone; the bar's Filter opens the Filter sheet.
- "top": absent at the top; shown after scrolling past two screens (last in the bar); still shown at 1.5 screens; gone at 0.5; the tap returns to 0, and instantly under reduced motion.
- Select mode: the Action bar replaces the App bar; Done brings it back. A toast sits 16px above the Action bar and 16px above the App bar.
- Sheet half open: header, reading group and the first copy (Owned, Lend, Remove) are visible.
- 1300px: no bar, Add book in the header, Filter and Select as tools-row buttons.

**Summary.** A shared `AppBar` replaces the phone's pinned Add book button and `BackToTop`; the collection adds Filter and Select to it through a portal slot.

**Files.**
- `src/app/(frontend)/components/AppBar.tsx` — provider, bar, link and button circles, slot, "top"
- `src/app/(frontend)/(sections)/layout.tsx` — mounts the bar with Add book as primary
- `src/app/(frontend)/(sections)/BackToTop.tsx` — deleted
- `src/app/(frontend)/(sections)/CollectionTools.tsx` — Links wide, bar buttons on the phone
- `src/app/(frontend)/styles.css` — `--spacing-app-bar`, toast-lift arithmetic
- `messages/en.json`, `messages/fi.json` — "top" / "ylös"
- `SelectBar.tsx`, `ToastProvider.tsx` — comments

**Review.** Patches applied: 2 (low): unused `primary` on `AppBarButton`, a long doc comment. Deferred: none. All other findings rejected, with reasons in the triage log.

**Follow-up review recommended:** false. No high or medium finding was patched.

**Verification.** `tsc --noEmit` clean; lint 0 errors; 1400 unit tests pass; `scanToSave` and `shopCheck` pass; the walk passes.

**Residual risks.**
- A label that wraps to two lines makes the bar taller than 84px, so a toast sits closer than 16px.
- The installed PWA's safe area was not walked on a device.
- EXPERIENCE.md and DESIGN.md already say "about 84px"; unchanged.
- Files shared with parallel stories: `styles.css` (11.8's tile tokens) and the section `layout.tsx`.
