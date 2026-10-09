---
title: 'Story 1.13 [A14] Tailwind 4 and the design tokens'
type: 'chore'
created: '2026-10-09'
status: 'done'
baseline_revision: '4c39d877250bf9ddbeff7b50dbc4ffcc681e33a4'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Locally, playwright reuses whatever server holds port 3000, so e2e in a worktree can test another checkout.
    evidence: |-
      playwright.config.ts sets reuseExistingServer: true; during review port 3000 was held by another node process. Pre-existing; CI starts its own server.
    location: >-
      playwright.config.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** The frontend still runs on the Payload blank template's hand-written CSS (black ground, `system-ui`, literal sizes). No story can build a bookeh component until Tailwind 4 is set up with only the DESIGN.md tokens, light and dark (UX-DR1, UX-DR2, UX-DR5).

**Approach:** Add Tailwind CSS 4.3.3 through `@tailwindcss/postcss`, replace `src/app/(frontend)/styles.css` with a Tailwind entry whose `@theme` first resets the whole default theme and then declares every DESIGN.md token under its DESIGN.md name, with dark colour values under `data-theme="dark"` and under `prefers-color-scheme: dark` when the theme is `system`. Add one `ui-case` utility for lowercase headings, buttons and switches (UX-DR4). A unit test compiles `styles.css` with Tailwind's compiler and proves which utilities produce CSS.

## Boundaries & Constraints

**Always:** Tokens live in `src/app/(frontend)/styles.css` and nowhere else (spine, Styling). Token names are DESIGN.md's: colours `background`, `text`, `text-muted`, `text-dim`, `border`, `accent`, `scrim`, `danger`, `shadow`; type roles `heading-section`, `heading-section-phone`, `heading-detail`, `heading-group`, `title`, `control`, `button`, `body`, `meta`, `label` (size, line height, weight, and letter spacing where DESIGN.md gives one); spacing `1`–`7`, `page-margin`, `page-margin-phone`, `stroke-hairline`, `stroke-control`, `stroke-selection`, `panel-width`; radius `0px`. Values exactly as in DESIGN.md's frontmatter. Exact-pinned versions (`4.3.3`).

**Never:** No `dark:` variant, CSS Modules, inline styles or `tailwind.config.*` (v4 is CSS-first). No Open Sans or any `--font-*` family (Story 1.15), no `data-theme` writing or theme switch (Story 1.18), no breakpoint, motion or panel-shadow tokens (the first story that needs each declares it). No changes to Payload admin styling. Do not restyle or replace the template `page.tsx`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Token utility | `bg-accent`, `text-text-muted`, `text-heading-section`, `p-7`, `px-page-margin`, `w-panel-width`, `w-stroke-selection`, `rounded`, `p-0` | CSS that reads the matching token variable | No error expected |
| Default-scale utility | `bg-blue-500`, `rounded-lg`, `shadow-md`, `font-bold`, `font-sans`, `text-xl`, `leading-tight`, `tracking-wide`, `p-8`, `max-w-md`, `md:p-1` | No CSS | Silently dropped by Tailwind |
| Lowercase | `ui-case` | `text-transform: lowercase` | No error expected |
| Theme `dark` | `<html data-theme="dark">` | All nine colour tokens take their dark values | No error expected |
| Theme `system` or no attribute, OS dark | `<html data-theme="system">` or no `data-theme`, `prefers-color-scheme: dark` | All nine colour tokens take their dark values | No error expected |
| Theme `light`, OS dark | `<html data-theme="light">` | Light values | No error expected |

</intent-contract>

## Code Map

- `package.json` -- add `tailwindcss` and `@tailwindcss/postcss` at exact `4.3.3` (already installed in the worktree by planning), plus `@tailwindcss/node` `4.3.3` for the test's compiler (today only a transitive dependency).
- `postcss.config.mjs` (new, root) -- `{ plugins: { '@tailwindcss/postcss': {} } }`, per `node_modules/next/dist/docs/01-app/01-getting-started/11-css.md` § Tailwind CSS.
- `src/app/(frontend)/styles.css` -- today the blank-template CSS (`.home`, `.links`, `h1` sizes). Replace wholly. Imported by `layout.tsx:2` and `page.tsx:9`; the admin route group has its own layout and never loads it.
- `src/app/(frontend)/layout.tsx` -- `<html lang="en">` with no `data-theme`; leave as is (1.18 adds the attribute), so the no-attribute case must behave as `system`.
- `tests/e2e/frontend.e2e.spec.ts` -- asserts only the template title and `h1` text; unaffected.
- `vitest.config.mts` -- unit project picks up `tests/unit/**/*.unit.spec.ts`, no DB.
- Prototype findings (Tailwind 4.3.3, `@tailwindcss/node` `compile(css, { base, onDependency })` then `build(candidates)`): `--*: initial` inside `@theme` drops every default namespace incl. `--spacing`, `--font-weight-*`, `--breakpoint-*`, `--container-*`, `--ease-*`; `--font-*: initial` alone does **not** clear `--font-weight-*`. With `--spacing` cleared, `p-0`/`inset-0` vanish unless `--spacing-0: 0px` is declared. Static and bare-number utilities (`w-full`, `border-2`, `outline-offset-3`, `p-px`) and arbitrary values (`m-[13px]`) always produce CSS. Plain `@theme` emits only variables a utility uses; `@theme static` emits all.

## Tasks & Acceptance

**Execution:**
- `package.json`, `package-lock.json` -- pin `tailwindcss`, `@tailwindcss/postcss`, `@tailwindcss/node` to `4.3.3` in devDependencies -- reproducible build; the test imports `@tailwindcss/node` directly.
- `postcss.config.mjs` -- create with the Tailwind PostCSS plugin -- Next picks it up for all CSS.
- `src/app/(frontend)/styles.css` -- `@import 'tailwindcss';`; `@theme static { --*: initial; … }` declaring every token (colour light values, `--text-<role>` with `--line-height`/`--font-weight`/`--letter-spacing` sub-properties, `--spacing-0` plus the DESIGN.md spacing names, `--radius: 0px`); dark colour overrides plus `color-scheme: dark` for `:root[data-theme='dark']` and, inside `@media (prefers-color-scheme: dark)`, for `system` or no attribute; base layer giving the root `background`/`text` colours and the body the `body` role; `@utility ui-case` -- the single source of tokens.
- `tests/unit/styles.unit.spec.ts` -- compile `styles.css` with `@tailwindcss/node` and cover every I/O row: token utilities emit CSS, default-scale utilities emit none, `ui-case` lowercases, every DESIGN.md token is declared with its value, and both dark blocks set all nine colours to their dark values -- the AC's proof.

**Acceptance Criteria:**
- Given `src/app/(frontend)/styles.css`, when compiled, then Tailwind 4.3.3 via `@tailwindcss/postcss` is set up and no default colour, radius, shadow, font, or other default scale variable is emitted.
- Given the compiled CSS, when the theme layer is read, then every DESIGN.md token is declared under its DESIGN.md name with its DESIGN.md value, light in the theme layer and dark under both dark selectors.
- Given `npm run dev`, when `/` is fetched, then the served CSS contains the token variables and `/admin` still renders with its own styling.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 24 findings — high 0, medium 6, low 13, false 5, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) PostCSS pipeline Next serves is untested; deleting `postcss.config.mjs` leaves every test green — e2e now asserts `--color-accent` on `/` is `#f0604f`.
  - `[medium]` `[patch]` (verification-gap) `@layer base` html/body rules untested — unit test added for the compiled base rules.
  - `[false]` `[reject]` (verification-gap, other) reviewer's own dev-server runs as a side effect — informational, no defect; tree restored.
  - `[low]` `[defer]` (verification-gap, other) `playwright.config.ts` `reuseExistingServer: true` tests whatever already holds port 3000 locally — pre-existing; CI unaffected.
  - `[low]` `[patch]` (edge-case) OS-dark selector leaves an unexpected `data-theme` value ('' or typo) light — selector now `:root:not([data-theme='light'], [data-theme='dark'])`.
  - `[low]` `[reject]` (edge-case) Tailwind's `dark:` variant still follows the OS, not `data-theme` — the spine bans `dark:`; disabling it needs a custom variant, and nobody meets it without breaking that rule.
  - `[low]` `[reject]` (edge-case) breakpoints cleared, so `md:` emits nothing — intended (only tokens resolve); Story 1.19 declares the 900px breakpoint when the shell needs it.
  - `[low]` `[reject]` (edge-case) `border-stroke-control` emits no CSS — strokes stay under spacing as in DESIGN.md; borders use the matching bare numbers (`border-2`), now stated in the styles.css header. A `--border-width-*` set would duplicate the tokens.
  - `[low]` `[reject]` (edge-case) motion defaults cleared, so bare `transition` has 0s duration — no consumer yet; the first motion story (1.17 toasts) declares them; noted in the header comment.
  - `[low]` `[reject]` (edge-case) opacity-modified colours fall back to the light hex without `color-mix` — only in browsers older than the PWA's targets.
  - `[low]` `[reject]` (edge-case) template `page.tsx` now renders unstyled — placeholder page that 1.16/1.19 replace; e2e checks only title and `h1`.
  - `[false]` `[reject]` (edge-case) no Open Sans / `--font-*` token — Story 1.15 owns the typeface; 1.13's AC lists no font family.
  - `[low]` `[reject]` (blind) `dark:` variant ignores `data-theme` — same as the edge-case row above.
  - `[medium]` `[patch]` (blind) Tailwind scans the whole repo, incl. `_bmad-output` mockups and untracked `.claude/worktrees` copies — `@import 'tailwindcss' source('../..')` limits it to `src/`.
  - `[low]` `[patch]` (blind) header comment overclaims "produces no CSS" — reworded to name bare-number, static and arbitrary utilities and the cleared motion defaults.
  - `[medium]` `[patch]` (blind) base layer untested; `body` copies the role variables by hand — grouped with the base-layer test; `body` now uses `@apply text-body`.
  - `[low]` `[reject]` (blind) expected values are a hand-typed copy of DESIGN.md — parsing a planning document from a test adds a YAML dependency and couples CI to `_bmad-output`.
  - `[medium]` `[patch]` (blind) no automated check that the dev server serves the tokens — grouped with the e2e `--color-accent` assertion.
  - `[low]` `[reject]` (blind) block lookup depends on Tailwind's exact print format — Tailwind is pinned exactly and a change fails loudly with "No block".
  - `[false]` `[reject]` (intent) clearing every namespace is wider than the AC's four named scales — AC 4 ("a utility outside the token set produces no CSS") and the spine ("only these tokens resolve") require it.
  - `[false]` `[reject]` (intent) font family, off-scale sizes and breakpoints undeclared — the epic gives the typeface to 1.15, and the spine declares each off-scale size with the story that needs it.
  - `[medium]` `[patch]` (intent) setup surface (PostCSS, Next pipeline) not exercised by tests — grouped with the e2e `--color-accent` assertion.
  - `[low]` `[patch]` (intent) theme behaviour checked only as selector strings — e2e sets `data-theme="dark"` and asserts `--color-background` is `#14181d`.
  - `[false]` `[reject]` (intent) review diff leaves out `package-lock.json` — lockfile churn is mechanical, from the three pinned installs.

## Design Notes

Dark values are written twice (attribute selector and media query); CSS cannot share one block between them, and the unit test keeps the two equal. `light-dark()` would avoid that but hides the AC's selectors and depends on Lightning CSS transpilation.

Strokes stay under spacing as DESIGN.md has them, so `w-stroke-selection` (selection bar) and `h-stroke-control` (progress line) work. Border and outline widths use Tailwind's bare numbers (`border-2`, `outline-2`), which no theme can remove; that and arbitrary values are a review matter, not this story's.

Shape of a role:

```css
--text-heading-section: 44px;
--text-heading-section--line-height: 1.1;
--text-heading-section--font-weight: 300;
--text-heading-section--letter-spacing: -0.015em;
```

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including `styles.unit.spec.ts`.
- `npm run lint` and `npm run typecheck` -- expected: 0 errors.

**Manual checks (if no CLI):**
- Run `next dev` on a free port; fetch `/` and its CSS chunk: contains `--color-accent:#f0604f`-style declarations and no `--color-blue-500`; `/admin` returns 200.

## Auto Run Result

**Summary:** Tailwind CSS 4.3.3 is set up through `@tailwindcss/postcss`. `src/app/(frontend)/styles.css` resets the whole default theme (`@theme static { --*: initial }`) and declares every DESIGN.md token under its DESIGN.md name. Dark colours apply under `data-theme="dark"` and, on an OS dark preference, for any other theme value except `light`. One `ui-case` utility does the lowercase. A unit spec compiles the stylesheet and checks it, and an e2e test checks the CSS the dev server serves.

**Files changed:**
- `package.json`, `package-lock.json`: `tailwindcss`, `@tailwindcss/postcss` and `@tailwindcss/node` pinned to `4.3.3`.
- `postcss.config.mjs`: new; the Tailwind PostCSS plugin.
- `src/app/(frontend)/styles.css`: replaces the template CSS with the tokens, the dark blocks, the base layer, `ui-case` and a scan source limited to `src/`.
- `tests/unit/styles.unit.spec.ts`: new, 26 tests: the exact token set and values, both dark blocks, the base layer, utilities that read tokens, and default-scale utilities that emit nothing.
- `tests/e2e/frontend.e2e.spec.ts`: checks that `/` serves `--color-accent` and that `data-theme="dark"` switches `--color-background`.

**Review findings:** 24 in total. Patches applied for 5 groups (3 medium, 2 low; 9 finding rows): the e2e token/theme check, the base-layer unit test with `@apply text-body`, the OS-dark selector, the scan source, and the header comment. 1 deferred: Playwright `reuseExistingServer` locally. 13 rejected; the reasons are in the Review Triage Log above, chiefly:
- the `dark:` variant: banned by the spine
- breakpoints, motion and the typeface: they belong to later stories (1.19, 1.17, 1.15)
- border-width namespace: bare numbers match the strokes
- `color-mix` fallback: only affects browsers outside the targets
- template page unstyled: it is a placeholder
- DESIGN.md parsing in the test: would couple CI to a planning document
- print-format brittleness: Tailwind is exact-pinned
- intent readings: settled by AC 4 and the spine

**Follow-up review:** recommended (`true`), because 3 medium entries were patched. Specific unverified risk: the new e2e test (`serves the design tokens and switches them with data-theme`) has not run. Port 3000 was held by another checkout's server, which Playwright would have reused. Its first run will be in CI.

**Verification:**
- `npm run test:unit`: 48 passed.
- `npm run lint`: 0 errors, 3 pre-existing warnings.
- `tsc --noEmit`: clean.
- Manual: `next dev -p 3913` against the throwaway database `bookeh_story_1_13` (dropped afterwards).
  - `/` is 200. Its CSS chunk holds `--color-accent: #f0604f`, the dark `#ff8e7f` twice and `:root:not([data-theme="light"], [data-theme="dark"])`. It has no `--color-blue` and no raw `@theme`.
  - `/admin` is 200.

**Residual risks:**
- The template `page.tsx` renders unstyled until 1.16/1.19 replace it.
- `md:`, `transition` and the like produce nothing until a story declares the tokens they need.
- `sprint-status.yaml` is not updated on this branch: the main checkout has uncommitted edits to it, and an edit here would conflict on merge.
