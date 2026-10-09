---
title: 'Story 1.15 [A19] Open Sans'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '529af26178acb8a4f472f7a8c8a9dbd993b36d0d'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The frontend renders in the browser's fallback sans-serif: `styles.css` clears every Tailwind font variable (`--*: initial`), so preflight's `html` font-family falls through to the system stack. DESIGN.md sets one typeface, Open Sans 300/400, self-hosted, with no bold (UX-DR3, spine Font convention).

**Approach:** Load Open Sans once in the frontend root layout through `next/font/google`, weights `300` and `400`, subset `latin` (carries å, ä, ö). Expose it as the CSS variable `--font-open-sans` on `<html>`. `styles.css` points preflight at it through the theme variable `--default-font-family`. The base layer turns off weight synthesis, so no bold is ever drawn, even for `<b>`, `<strong>` or `<th>`.

## Boundaries & Constraints

**Always:**
- The font is called once, at module scope in `src/app/(frontend)/layout.tsx`.
- `next/font` downloads the files at build or dev compile time and serves them from `/_next/static/media`. The browser never contacts `fonts.googleapis.com` or `fonts.gstatic.com`.
- The family reaches elements only through `styles.css`, which stays the single home of styling tokens.
- No `font-*` utility (`font-sans`, `font-bold`, `font-light`) produces CSS.

**Never:**
- No `next/font/local` with font files committed to the repo. The spine picks `next/font/google`.
- No bold or extra weights, no italic, no `wdth` axis.
- No `className` font on `<body>` or `<main>`.
- No change to the Payload admin (`app/(payload)`), the template `page.tsx`, the layout metadata, or the e2e tests. The spine limits Playwright to scan-to-save and shop check.
- No new type roles or sizes.

</intent-contract>

## Code Map

- `src/app/(frontend)/layout.tsx` -- async root layout: `<html lang={await getLocale()}>`, imports `./styles.css`, `NextIntlClientProvider` around `<main>`. Add the `Open_Sans` call here and put its `.variable` class on `<html>`.
- `node_modules/next/dist/compiled/@next/font/dist/google/index.d.ts:12988` -- `Open_Sans` options: `weight` accepts `Array<'300'|…>`; `subsets` includes `latin`; `variable` returns `NextFontWithVariable`. Validation (`validate-google-font-function-call.js:40-60`) accepts a weight array on this variable family; a range string like `'300 400'` is rejected.
- `node_modules/next/dist/compiled/@next/font/dist/google/loader.js:102` -- every file in Google's CSS is downloaded and self-hosted; `subsets` controls only which are preloaded. `display` defaults to `swap`, `adjustFontFallback` to `true` (metric-matched `'Open Sans Fallback'`). Keep both defaults.
- `src/app/(frontend)/styles.css` -- `@theme static { --*: initial; … }` holds every token; `@layer base` sets `html` colours and `body` `text-body`. Prototype finding (Tailwind 4.3.3): adding `--default-font-family: var(--font-open-sans)` to the `@theme static` block makes preflight emit `html, :host { font-family: var(--default-font-family, <system stack>) }` and is emitted in `:root, :host`. `font-sans`, `font-bold` and `font-light` still produce no CSS. Preflight keeps `b, strong { font-weight: bolder }`.
- `tests/unit/styles.unit.spec.ts` -- compiles `styles.css` with `@tailwindcss/node`. Test 1 (`declares every DESIGN.md token … and nothing else`) needs the new variable in its expected map. Test 4 checks the last `@layer base` `html` block's declarations exactly. The "produces no CSS" table already lists `font-bold` and `font-sans`.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md:263,279` -- one typeface, 300 and 400, no bold; å, ä and ö must render in both weights.
- `.github/workflows/*.yml` -- CI runs `npm run test:e2e` with Playwright's `webServer: npm run dev`, which now fetches Open Sans from Google at compile time. GitHub runners have network access. Spine line 539: the image build downloads the font, the running app does not.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/layout.tsx` -- add `const openSans = Open_Sans({ subsets: ['latin'], weight: ['300', '400'], variable: '--font-open-sans' })` at module scope and `className={openSans.variable}` on `<html>`. This is the single load, and the only source of the family variable.
- `src/app/(frontend)/styles.css` -- add `--default-font-family: var(--font-open-sans);` to `@theme static`, with a short comment that `layout.tsx` defines the variable. Add `font-synthesis-weight: none;` to the base `html` rule. Update the header comment: the font family comes from the layout's `next/font`. Preflight then applies the family, and the browser never synthesises bold.
- `tests/unit/styles.unit.spec.ts` -- add `'--default-font-family': 'var(--font-open-sans)'` to the theme expectation (outside `lower()`). Add `'font-synthesis-weight': 'none'` to the `html` base expectation. Add an assertion that preflight's `html, :host` font-family starts with `var(--default-font-family`. Add `font-light`, `font-normal` and `font-semibold` to the "produces no CSS" table. Together these pin the wiring and the no-bold rule.

**Acceptance Criteria:**
- Given `next dev`, when `/` is requested, then:
  - the HTML has `<html class="…">` carrying the `next/font` variable class;
  - a `<link rel="preload" as="font">` points to a `/_next/static/media/*.woff2`;
  - neither the HTML nor its stylesheets reference `fonts.googleapis.com` or `fonts.gstatic.com`.
- Given the page's compiled CSS, when inspected, then the `@font-face` rules for `'Open Sans'` cover weights 300 and 400 only, and `html` computes `font-family` to Open Sans followed by its fallback.
- Given `src/app/(frontend)/styles.css` compiled by Tailwind, when any `font-*` weight or family utility is requested, then it produces no CSS, and the root carries `font-synthesis-weight: none`.
- Given `/admin`, when requested, then it still returns 200 and loads no Open Sans.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 17 findings — high 0, medium 3, low 12, false 2, maybe-false 0
- findings:
  - `[medium]` `[patch]` (verification-gap) nothing checks the `layout.tsx` half of the `--font-open-sans` contract. Dropping the `<html>` class, renaming `variable`, or moving the class to `<body>` passes every test, and the page silently uses the system font. Fixed: new unit test `tests/unit/layout.unit.spec.ts` mocks `next/font/google` and `next-intl/server`. It asserts the `Open_Sans` arguments, the class on the returned `html` element, and that the variable name matches the one `styles.css` reads.
  - `[medium]` `[patch]` (intent) the `layout.tsx` half is untested; the two files share only a string. Same root cause and fix as the row above.
  - `[low]` `[reject]` (intent) "no request to a font host" has no automated evidence. `next/font/google` self-hosts by construction. The manual `next dev` check found 0 `fonts.g` references in the HTML and CSS. Automating it needs a running server, and the spine limits Playwright to two flows.
  - `[false]` `[reject]` (intent) the served `@font-face` might declare a weight range, letting 700 vary for real. The dev check showed 20 `@font-face` rules, 10 at single weight 300 and 10 at 400. A face's descriptor clamps its variation, so with synthesis off a 700 request draws at 400.
  - `[low]` `[reject]` (intent) "no bold" is pinned as declarations, not as rendering. Proving the rendering needs a browser, which the spine's Playwright rule excludes here. The mechanism, 300/400 faces plus `font-synthesis-weight: none`, is what the unit test pins.
  - `[low]` `[reject]` (intent) å, ä and ö rendering is not checked. The `latin` subset's unicode-range covers U+0000–00FF, which includes å, ä and ö. A visual check needs a browser.
  - `[medium]` `[patch]` (blind) layout and CSS can drift on the variable name. Same root cause and fix as the first row.
  - `[low]` `[patch]` (blind) the font stack has no generic family. `next/font` sets `"Open Sans", "Open Sans Fallback"` only (`postcss-next-font.js:111-115`), and a valid `--default-font-family` bypasses preflight's system stack. Without a local Arial, the swap period or a failed woff2 falls to the UA default face. Fixed: `--default-font-family: var(--font-open-sans), sans-serif;`, and the theme expectation was updated.
  - `[low]` `[reject]` (blind) only weight synthesis is off, so `<em>`/`<i>` get a faux oblique. DESIGN.md has no italic rule (emphasis comes from lines, weight and ink, DESIGN.md:216), and the frontend has no italic markup. Turning off style synthesis would remove the only visible cue `<em>` has.
  - `[low]` `[patch]` (blind) the preflight test's name claims more than it checks. Fixed: renamed to say it points preflight's root font-family at `--default-font-family`.
  - `[low]` `[reject]` (blind) in dev and CI, a font download failure is only logged. This is `next/font` behaviour. The image build fails loudly (spine line 539), and no CI test depends on the face.
  - `[low]` `[patch]` (edge) the theme variable has no generic or emoji family. Same root cause and fix as the generic-family row. Emoji fall back per glyph to system fonts either way.
  - `[low]` `[patch]` (edge) no Arial on Android or Linux during the swap. Same root cause and fix as the generic-family row.
  - `[low]` `[reject]` (edge) italic synthesis is not disabled. Same reasons as the blind italic row.
  - `[low]` `[reject]` (edge) Safari before 16.4 lacks the `font-synthesis-weight` longhand. iOS 16.4 shipped in March 2023, the frontend has no `b`, `strong` or `th`, and the worst case is faux bold on an outdated device.
  - `[false]` `[reject]` (edge) `next build` fails offline. This is the spine's decision (line 539: the image build downloads Open Sans and needs network, the running app does not). It is the designed failure mode, not a defect.
  - `[low]` `[reject]` (edge) arbitrary `font-[700]` / `font-(family-name:…)` still emit CSS. The `styles.css` header documents arbitrary values as a kept exception. With only 300/400 faces and synthesis off, `font-[700]` still draws at 400.

## Design Notes

The family is applied through `styles.css`, not with `openSans.className` on `<html>`. This keeps `styles.css` the only file that styles elements (spine, Styling), and the unit test can pin it. The layout only loads the face and publishes `--font-open-sans`. The trade-off is a string contract between two files; the manual check catches a mismatch, because the page falls back to the system stack.

Only 300 and 400 are requested, so no bold face is served. `font-synthesis-weight: none` stops the browser from faking one when `bolder` (preflight's `b, strong`) or the UA `th` style asks for 700. Such text renders at 400. That is DESIGN.md's rule: hierarchy comes from size and the light weight.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including the updated `styles.unit.spec.ts`.
- `npm run lint` and `npm run typecheck` -- expected: 0 errors.

**Manual checks (if no CLI):**
- `next dev -p <free port>`, then `curl /`:
  - `<html` has a class.
  - There is a `rel="preload"` `.woff2` under `/_next/static/media/`.
  - `grep -c 'fonts.g'` is 0 across the HTML and the linked CSS.
  - The CSS has `@font-face` with `font-family: 'Open Sans'` at `font-weight: 300` and `400` only, plus `--font-open-sans`.
- `/admin` returns 200, and its HTML has no `__variable` font class from the frontend.

## Auto Run Result

**Summary:** Open Sans now loads once, in the frontend root layout, through `next/font/google`:
- Weights `300` and `400` only, subset `latin` (which covers å, ä and ö).
- Self-hosted from `/_next/static/media`, with no request to a font host at runtime.
- The font publishes the CSS variable `--font-open-sans` on `<html>`.

`styles.css` routes Tailwind preflight's root font-family through `--default-font-family: var(--font-open-sans), sans-serif`. It also turns off weight synthesis on `html`, so no bold is ever drawn. That covers `b`, `strong` and `th` too.

**Files changed:**
- `src/app/(frontend)/layout.tsx`: the `Open_Sans` call at module scope, and its variable class on `<html>`.
- `src/app/(frontend)/styles.css`:
  - `--default-font-family` in `@theme static`, with a generic `sans-serif` after the next/font stack;
  - `font-synthesis-weight: none` on the base `html` rule;
  - header comment.
- `tests/unit/styles.unit.spec.ts`:
  - the theme expectation now includes the font variable;
  - preflight is checked to read `--default-font-family`;
  - the `html` base rule is checked for `font-synthesis-weight: none`;
  - `font-semibold`, `font-normal` and `font-light` are checked to produce no CSS.
- `tests/unit/layout.unit.spec.ts` (new): with `next/font/google` and `next-intl/server` mocked, it checks the exact `Open_Sans` options and that the class lands on the returned `html` element. It also checks that the variable name matches the one `styles.css` reads.

**Review findings (one pass, 17 findings: 0 high, 3 medium, 12 low, 2 false):**
- **Patched:**
  - The layout half of the font-variable contract was untested (medium; three layers reported it). It now has a new unit test.
  - The font stack had no generic family (low; three rows). `sans-serif` is appended.
  - The preflight test's name overclaimed (low). It is renamed.
- **Deferred:** none.
- **Rejected,** with reasons in the Review Triage Log:
  - no automated check for a font-host request (`next/font` self-hosts; the manual check found 0);
  - "no bold" and å/ä/ö pinned as configuration, not rendering (needs a browser, and the spine limits Playwright);
  - italic synthesis (DESIGN.md has no italic rule);
  - Safari before 16.4;
  - a dev font-download failure only logs;
  - arbitrary `font-[700]` utilities (still drawn at 400).
- **False:**
  - the served faces carrying a weight range (they are single 300 and 400 faces);
  - an offline `next build` failing (the spine's decision, line 539).

**Follow-up review:** not recommended (`false`). This pass patched 0 high entries, 1 medium and 2 low.

**Verification:**
- `npm run test:unit`: 136 passed (9 files).
- `npm run lint`: 0 errors. The 7 warnings were there before.
- `npm run typecheck`: clean.
- Manual check, `next dev -p 3915`, after the patches:
  - `/` gives `<html lang="en" class="open_sans_…__variable">`.
  - The font preload arrives as an HTTP `Link: </_next/static/media/…woff2>; rel=preload; as="font"` header. Next 16 dev sends it this way instead of an HTML `<link>` tag; it works the same in the browser.
  - 0 `fonts.g` references in the HTML and the linked CSS.
  - The CSS `font-weight` values are only 300 and 400.
  - `--font-open-sans: "Open Sans", "Open Sans Fallback"`, `--default-font-family: var(--font-open-sans), sans-serif` and `font-synthesis-weight: none` are all present.
  - `/admin` returns 200.

**Residual risks:**
- `next dev`, CI e2e and the image build now download Open Sans from Google at compile time. Dev only logs a failure and falls back; `next build` fails. That is as the spine intends.
- A production build has not been checked. The preload-header form was seen only in dev.
- Faux bold is still possible on iOS before 16.4, which lacks `font-synthesis-weight`.
