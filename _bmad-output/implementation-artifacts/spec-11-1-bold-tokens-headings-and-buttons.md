---
title: '11.1 Bold tokens, headings and buttons'
type: 'feature'
created: '2026-11-10'
baseline_revision: '6f80083984cdc0dd3e12d95137efab90df1d3346'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The toast lift over select mode's action bar leaves out the bar's 2px top border, so the toast sits 14px rather than 16px above it.
    evidence: |-
      Measured by the 11.1 walk: action bar 158px against `--spacing-pinned-bar` 156px on the phone (88 against 86 wide). Before this story it was 138 against 136, so the gap predates it. The wide value is shared with FullScreenTask's foot, which has no border, so one term in the base token would mislift that foot.
    location: >-
      src/app/(frontend)/styles.css (select-mode `--spacing-pinned-bar` override)
    severity: low
---

<intent-contract>

## Intent

**Problem:** DESIGN.md (amended 2026-11-10, bold Metro) sets 56px section headings, 17px button type, 54px-tall buttons with a `stroke-button` outline, and four new colours (`accent-fill`, `bar`, `bar-ink`, `bar-danger`). `styles.css` still has 44/38px headings, 15px buttons drawn `py-2` with a bare `border-2`, and none of the new tokens, so the later Epic 11 stories have nothing to build on.

**Approach:** Declare the new tokens and retune the heading and button type in `styles.css`. Make `buttonClass()` draw every button from `stroke-button` and `button-height`. Keep the pinned-bar arithmetic in step with the taller button. Re-measure the wide headings row at 56px in both languages and write the new widths into EXPERIENCE.md.

## Boundaries & Constraints

**Always:**
- Values come from DESIGN.md as amended, under its token names: colours `--color-*`, `--spacing-stroke-button` and `--spacing-button-height` beside the other stroke and spacing tokens, type as `--text-*`.
- Light values, then both dark blocks, kept equal (the `data-theme='dark'` block and the OS-preference block).
- Button outlines read the token (`border-(length:--spacing-stroke-button)`), so changing `stroke-button` to 3px changes every button outline, the compact one included, in one line.
- Non-compact buttons are `button-height` tall at every width: a minimum height, so a wrapped label still fits.
- Primary `accent`, secondary `text`, destructive `danger`, as now.
- Links drawn as buttons (Add book, the First run button, BookDetail's secondary link) follow through `buttonClass()`.

**Never:**
- No App bar, Back to top, Segmented control, Icon switch, Stats tiles or `tile-number-*` tokens. Those are 11.2, 11.3, 11.4 and 11.8; the colour tokens are declared now, and nothing uses them yet.
- No change to the Back to top square itself.
- No `dark:` utilities, no inline style, no literals in components.
- No committed tests.
- No spine change: no contract or shared shape changes.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior |
|----------|--------------|---------------------------|
| Button, any variant | `<Button variant="secondary">` at 390 and 1300px | 54px tall (border-box), 2px `text` outline, 17px lowercase label, 16px side padding |
| Compact | Find beside the ISBN field (`/scan`, `/scan/find`) | `px-3 py-1`, 2px outline from the token, 17px label, drawn under 54px; phone tap area still 44px from its bottom edge |
| Stroke change | `:root { --spacing-stroke-button: 3px }` injected | every button's border widths are 3px; non-compact buttons stay 54px tall; nothing else changes width or position (the compact one grows 2px, being content-high) |
| Pinned Add book (phone) | any section at 390px | full-width 54px Add book; the toast lift (`--spacing-pinned-bar`) = 54 + 2 × 16; the Back to top square, when shown, is centred beside it |
| Select mode (phone) | collection in select mode at 390px | two-row action bar; the toast lift = 2 × 54 + 3 × 16 |
| Headings | any section, phone and wide | 56px / 300 / line-height 1.08 / -0.02em, lowercase |
| Long task title | `/scan` answer "Ei kirjastossa" / "Toivelistalla" at 375px, fi | the h1 wraps inside its column, never pushing the X off screen or scrolling the page sideways |
| Wide headings row | 900, 1100, 1400px, en and fi | Add book whole and right-aligned; the row clips below its measured width and not above it |

</intent-contract>

## Code Map

- `src/app/(frontend)/styles.css`. The only home of the tokens (spine, Styling).
  - `:24-35`: light colours. Add `accent-fill`, `bar`, `bar-ink` and `bar-danger` with a comment naming DESIGN.md's three fill places and the App bar.
  - `:56-63`: `heading-section` and `-phone`, now 44/38px at 1.1 / -0.015em.
  - `:76-78`: `text-button`, now 15px.
  - `:106-108`: the stroke tokens. Add `--spacing-stroke-button: 2px` and `--spacing-button-height: 54px` (DESIGN.md, Spacing).
  - `:144-148`: `--spacing-pinned-bar` = `tap + 2 × spacing-4`; change it to `button-height`.
  - `:186-204`: the two dark blocks. Add the dark values to both.
  - `:578-591`: select mode's phone `--spacing-pinned-bar` (`2 × tap + 3 × spacing-4`); change it to `button-height`.
  - `:1-17`: the header comment says border widths use bare numbers. Note the button outline's token exception.
- `src/app/(frontend)/components/Button.tsx:17-22`. `buttonClass()`.
  - Non-compact: `px-4 py-2 max-wide:min-h-tap`; becomes `min-h-button-height px-4`.
  - Both variants: `border-2` becomes the token border.
  - Compact keeps `px-3 py-1` and its `before:h-tap` tap area. The doc comment changes with it.
- `src/app/(frontend)/(sections)/layout.tsx:49-57`. The phone's pinned bar (`flex gap-3`): Add book (now 54px) beside `BackToTop` (`size-tap`, 44px, untouched).
  - Add `items-center` so the square sits centred, not top-aligned.
  - The header (`:44`) is `flex items-center gap-6`, with `SectionNav` (`min-w-0 flex-1 overflow-x-clip`) and Add book `shrink-0`. The clipping already follows the content, so there is no code change there.
- `src/app/(frontend)/components/SectionNav.tsx:10`. Headings use `text-heading-section-phone` and `wide:text-heading-section`; they pick up 56px with no change.
- `src/app/(frontend)/components/FullScreenTask.tsx:46`. The task `h1`, in `flex items-start justify-between gap-4` beside `CloseButton`. Add `min-w-0 break-words` (as `wishlists/[listId]/ListHeading.tsx:53` does), so a 56px Finnish word wraps instead of overflowing.
- Other users of the heading tokens pick the size up with no change:
  - `login/page.tsx:16`, `error.tsx:33` and `global-not-found.tsx:62`: short words.
  - `stats/page.tsx:204`: the big numbers grow to 56px until 11.8 replaces them.
- Button users (46 sites) need no change: `SelectBar.tsx:133-170` (the phone's `[&>button]:px-2 flex-1` overrides keep working), `ScanScreen.tsx:179` and `scan/find/LookupField.tsx:51` (compact), `CollectionList.tsx:161`, `BookDetail.tsx:325`, Dialog, Picker.
- `components/toast/ToastProvider.tsx:126` reads `--spacing-pinned-bar` (read-only).
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md`. Replace both with the measured 56px widths:
  - `:52` (Moving between sections): "Measured with Open Sans 300 at 44px … (2026-11-06) … 974px … 1074px … four Finnish headings already need 918px … Story 11.1 re-measures …".
  - `:427` (Responsive, Wide): "from 974px in English and 1074px in Finnish".
- `tests/e2e/stats.walk.spec.ts:176-199` (git-ignored). The precedent for measuring the header: `header [data-scan-book]` fits, and `header h1`'s parent is clipped. Needed width = `innerWidth + row.scrollWidth − row.clientWidth` while clipped. Sign-in and user creation are at `:15-30` and `:84-91`; the language is set with `update users set language`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/(frontend)/styles.css`
  - Colours `accent-fill` #D1432F / #D1432F, `bar` #1F2933 / #262E37, `bar-ink` #FFFFFF / #E3E8EE and `bar-danger` #E0566F / #E0566F, in light and both dark blocks.
  - `stroke-button` 2px and `button-height` 54px.
  - Both heading tokens at 56px, line-height 1.08, weight 300, -0.02em; `text-button` 17px.
  - `--spacing-pinned-bar` and the select-mode override from `button-height`.
  - The header comment notes the token-read button outline.
- [ ] `src/app/(frontend)/components/Button.tsx`: `buttonClass()` as in the Code Map; doc comment updated (DESIGN.md Button: `stroke-button` outline, `button-height` tall; compact under it).
- [ ] `src/app/(frontend)/(sections)/layout.tsx`: `items-center` on the pinned bar.
- [ ] `src/app/(frontend)/components/FullScreenTask.tsx`: `min-w-0 break-words` on the `h1`.
- [ ] `EXPERIENCE.md` (`:52`, `:427`): the widths measured in the walk (five headings + Add book, en and fi; the four-Finnish-headings figure), dated 2026-11-10 at 56px. Drop the "Story 11.1 re-measures" sentence.
- [ ] `tests/e2e/boldTokens.walk.spec.ts` (git-ignored, not committed): the walk under Verification.

**Acceptance Criteria:**
- Given the updated `styles.css`, when the app's CSS is built, then `--color-accent-fill`, `--color-bar`, `--color-bar-ink`, `--color-bar-danger`, `--spacing-stroke-button` and `--spacing-button-height` resolve to DESIGN.md's values in light and dark (OS preference and `data-theme='dark'`), and `h1` section headings compute to 56px / 300 / -0.02em on the phone and wide.
- Given any primary, secondary or destructive button, when it renders at 390 and 1300px, then it is 54px tall with a 2px `accent` / `text` / `danger` outline and a 17px label.
- Given `--spacing-stroke-button: 3px` injected at runtime, when the page re-lays out, then every button outline is 3px and every non-compact button is still 54px tall.
- Given the compact Find button, when it renders, then it is shorter than 54px, padded `px-3 py-1`, and outlined from the token.
- Given a wide screen at 900, 1100 and 1400px in English and Finnish, when a section shows, then Add book is whole at the top right, and the headings row clips exactly when the viewport is under the width EXPERIENCE.md now states.
- Given a 375px phone in Finnish, when an answer titled "Ei kirjastossa" shows, then no element scrolls the page sideways and the X stays on screen.

## Spec Change Log

## Review Triage Log

### 2026-11-10 — Review pass
- verdicts: 20 findings — high 0, medium 1, low 7, false 12, maybe-false 0
- findings:
  - `[medium]` `[patch]` Edge Case Hunter: the phone select bar's "Tunniste" overflows its outline at 17px in Finnish — at 375px it fits (probe: no overflow), but at 360px `scrollWidth > clientWidth` (74px buttons, 54px content); fixed: SelectBar phone override `px-2` → `px-1`, walk re-checks fi at 360px.
  - `[false]` `[reject]` Edge Case Hunter: `break-words` on the task h1 splits a Finnish word mid-letter — task titles are interface strings only; the walk shows "Ei kirjastossa" wrapping between words and "Toivelistalla" fitting one line at 375px, so no word is split.
  - `[low]` `[reject]` Edge Case Hunter: Back to top keeps a bare `border-2`, so at 3px it differs from Add book — the intent keeps the square untouched here, and 11.2's criteria already remove `BackToTop` and its square.
  - `[low]` `[reject]` Intent Alignment: under the 3px injection the compact Find grows 2px and the ISBN field narrows 2px — inherent to a content-sized button and only seen when the token is changed; compensating would add padding arithmetic for a hypothetical setting.
  - `[false]` `[reject]` Intent Alignment: `items-center` on the pinned bar changes where Back to top sits — the square's own code is untouched as the intent asks; centring keeps it beside the now 54px Add book instead of top-aligned.
  - `[false]` `[reject]` Intent Alignment: the compact Find's rendered size changes — the intent asks only that it keep its smaller padding with the new stroke; the 17px type applies to every button.
  - `[false]` `[reject]` Intent Alignment: `min-h-button-height` is a floor, not exactly 54px — single-line buttons measure exactly 54px in the walk; the floor only lets a wrapped label fit.
  - `[false]` `[reject]` Intent Alignment: pinned-bar arithmetic, task-title wrap and 54px phone buttons go beyond the criteria — each follows directly from the sizes the intent sets; without them the toast would overlap the bar and titles would overflow.
  - `[false]` `[reject]` Intent Alignment: the evidence (walk) is not in the diff — the intent asks for an uncommitted walk; it was re-run in this session and passed.
  - `[false]` `[reject]` Intent Alignment: other button-like controls (CloseButton, picker rows) do not read the token — they are not outlined buttons (CloseButton has no border), and Back to top is excluded by the intent.
  - `[low]` `[patch]` Blind Hunter: DESIGN.md's Typography table still says `button` 15px — line 372 confirmed stale against the front matter and the token; fixed to 17px / 400.
  - `[medium]` `[patch]` Blind Hunter: the phone select bar overflows in Finnish — same root cause as the first row; same fix.
  - `[low]` `[defer]` Blind Hunter: the toast lift leaves out the action bar's 2px top border — real (158 against 156) but predates this story (138 against 136); deferred in frontmatter.
  - `[low]` `[patch]` Blind Hunter: the Close X no longer lines up with the 56px heading — probe measured the X's centre 8px above the first line's middle on the phone and 22px on wide; fixed: the X sits in a one-heading-line (`h-[1lh]`) wrapper, walk now checks 0px offset at 375 and 1300px.
  - `[false]` `[reject]` Blind Hunter: `break-words` without `hyphens-auto` splits Finnish compounds — no interface task title is split (see the second row); `ListHeading`'s `break-words` on user names predates this story.
  - `[false]` `[reject]` Blind Hunter: wishlist, Stats, login and error pages were not walked at 56px — probe: Stats at 375px fi has no sideways scroll; login and error titles are short words; the wishlist heading already wraps with `break-words`.
  - `[low]` `[patch]` Blind Hunter: the `stroke-button` comments name only button outlines — DESIGN.md also draws the Segmented control and Icon switch in it, so 11.3/11.4 could reach for `border-2`; both comments now name all three.
  - `[false]` `[reject]` Blind Hunter: the Back to top deferral is not recorded — 11.2's criteria in epics.md already say "`BackToTop` and its square are removed".
  - `[low]` `[patch]` Blind Hunter: `accent-fill` and `bar-danger` are redeclared in both dark blocks although the same in both themes — against the file's once-only precedent (crop, airmail, cloth); removed from the dark blocks and marked "the same in both themes".
  - `[low]` `[patch]` Blind Hunter: the Fills comment says "three places" over four tokens and omits "never a line" — split into a fill comment (`accent-fill`, `bar`) and an App bar ink comment (`bar-ink`, `bar-danger`).

## Design Notes

`border-(length:--spacing-stroke-button)` is Tailwind 4's typed custom-property form. It emits `border-width: var(--spacing-stroke-button)`, so the token stays the one place to change. Bare `border-2` elsewhere (fields, sheet edge, App bar rings later) stays tied to `stroke-control`, which DESIGN.md keeps separate.

The non-compact button drops vertical padding and takes `min-h-button-height`. `<button>` centres its content natively, and the links drawn as buttons already carry `items-center justify-center`. Under border-box, a 3px outline leaves the 54px height unchanged.

## Verification

**Commands:**
- `npm run lint`: expected: no errors.
- `npm run typecheck`: expected: no errors.
- `npm run test:unit`: expected: all pass (no new tests).

**Manual checks:**
- The uncommitted walk `tests/e2e/boldTokens.walk.spec.ts` against the e2e server. Phone (390, plus 375 for the long title) and desktop (1300), light and dark (`emulateMedia`). It covers:
  - the collection section;
  - Book detail, created by scanning the E2E ISBN (sheet and panel);
  - an Answer (`/scan` typed ISBN);
  - Edit book;
  - computed sizes and colours per the ACs;
  - the 3px injection;
  - the header measurement in en and fi at 900, 1100 and 1400px, and the widths needed for no clipping.

  Screenshots go to `test-results/bold-tokens-walk/`. What it saw is recorded under `## Auto Run Result`.

## Auto Run Result

Walk `tests/e2e/boldTokens.walk.spec.ts` passed (2026-11-10; screenshots and `result.json` in `test-results/bold-tokens-walk/`):

- Tokens: `accent-fill` rgb(209,67,47) in light, OS dark and `data-theme='dark'`; `bar` #1F2933 / #262E37, `bar-ink` #FFF / #E3E8EE, `bar-danger` #E0566F; `stroke-button` 2px, `button-height` 54px.
- Headings: 56px / 300 / 60.48px / -1.12px, lowercase, on the phone and wide (sections and Edit book).
- Buttons on collection, First run, Scan, Find, Answer, Book detail (sheet and panel), Edit book and Select mode, light and dark, 390 and 1300px: every non-compact one 54px, 2px outline in `accent` / `text` (`text-dim` when disabled), 17px label, 16px sides (Select bar's phone buttons 4px, its `px-1` override, so "Tunniste" fits at 360px in Finnish). Compact Find: 34.09px tall, 12/4px padding.
- 3px injection: every button 3px, non-compact still 54px, no other heading, field, row or label moves on the collection. On `/scan` the compact Find grows 2px each way and the ISBN field beside it narrows 2px (283 → 281px), as a content-sized button must.
- Pinned bar at 390: Add book 350 × 54, bar 86px = `--spacing-pinned-bar`; Back to top (44px) centred beside it. Select mode: `--spacing-pinned-bar` 156px on the phone, 86px wide; the action bar itself is 158px (its 2px top border, outside the arithmetic before this story too).
- Long titles at 375px, fi: "Ei kirjastossa" wraps to two lines, "Toivelistalla" fits one; no sideways scroll, X on screen and centred on the heading's first line (375 and 1300px).
- Header: needed 1157px (en) and 1284px (fi), four Finnish headings 1095px; at 900 / 1100 / 1400 and at need − 1 / need, Add book whole and 28px from the right, the row clipped exactly below the need.
- `scanToSave`, `shopCheck` and `kirjasampo` specs pass. Lint (committed files), typecheck and unit tests clean.

### Finalize

**Summary.** Bold Metro's tokens are in `styles.css`: `accent-fill`, `bar`, `bar-ink`, `bar-danger`, `stroke-button` 2px, `button-height` 54px, 56px / 300 / -0.02em section headings and the 17px button type. `buttonClass()` draws every button from `stroke-button` and at least `button-height` tall; the compact Find keeps `px-3 py-1`. The pinned bar and the select-mode toast lift are counted from `button-height`. Task titles wrap and the X sits on their first line. EXPERIENCE.md has the 56px widths (1157px en, 1284px fi); DESIGN.md's type table says 17px.

**Files changed.**
- `src/app/(frontend)/styles.css` -- the new tokens, headings, button type, pinned-bar arithmetic, comments.
- `src/app/(frontend)/components/Button.tsx` -- token outline, `min-h-button-height px-4`.
- `src/app/(frontend)/(sections)/layout.tsx` -- `items-center` on the phone's pinned bar.
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- phone action buttons `px-1`, so Finnish labels fit at 360px.
- `src/app/(frontend)/components/FullScreenTask.tsx` -- title wraps (`min-w-0 break-words`); the X in a one-line (`h-[1lh]`) wrapper.
- `EXPERIENCE.md` -- measured widths at 56px. `DESIGN.md` -- Typography row 17px.
- `epic-11-context.md` (new) -- the compiled Epic 11 context.

**Review.** 20 findings. Patched 7 rows (6 fixes): medium 1 (select bar overflow, two rows), low 5. Deferred 1 (low): the toast lift ignores the action bar's 2px border, which predates this story. Rejected 12, each with its reason in the Review Triage Log: 10 false, 2 low, which are Back to top (out of scope by the intent) and the compact button growing under the 3px injection.

**Follow-up review:** `false`. One medium and five low patches: the bar is a high, or two or more medium.

**Verification.** `npm run typecheck` is clean. `npm run test:unit` gives 1400 passed. `npm run lint` has 0 errors in committed files; its only errors are `no-console` in git-ignored walks. Both walks pass: `boldTokens.walk.spec.ts`, and the triage probe `triage111.walk.spec.ts` (Finnish select bar at 375 and 360px, the X offset, Stats at 375px). `scanToSave`, `shopCheck` and `kirjasampo` pass with `--workers=1`. Run in parallel with the walks they collide on the shared seeded e2e user, and kirjasampo and the walk timed out.

**Residual risks.**
- Stats big numbers render at 56px until 11.8 replaces them with tiles.
- Back to top keeps a 2px `border-2` under a 3px `stroke-button` until 11.2 removes it.
- On phones narrower than 360px (320px), the Finnish select bar may still overflow.
- The wide headings row now clips below 1157px (en) and 1284px (fi), so a 1100px laptop always clips one heading. This is the documented clipping rule, not a defect.
