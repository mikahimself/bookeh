---
title: '5.36 [K6] Back office tidy-up'
type: 'chore'
created: '2026-10-22'
status: 'done'
baseline_revision: '7e70314e3e1e8391ff3b4a259e45c8e1c6f1588b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The back office still reads as stock Payload: collections sit under "Catalogue" and "Library" with Users ungrouped, every page title ends "- Payload", the login and nav show Payload's logo, and nothing of bookeh's look applies.

**Approach:** Collection config regroups the nav into Catalogue, My data and System (list columns already match the story); root `admin` config sets the bookeh title suffix, favicon and a Logo/Icon graphic built from the existing app icon; the admin stylesheet maps a few DESIGN.md tokens onto Payload's CSS variables in light and dark.

## Boundaries & Constraints

**Always:**
- Groups, in nav order: **Catalogue** — Authors, Books, Genres, Media, Series; **My data** — Copies, Locations, User Books; **System** — Users. Order follows the first collection of each group in `payload.config.ts`'s `collections` array (Authors, Copies, Users), so the array keeps its order.
- List columns: Books `['title', 'isbn13', 'visibility', 'createdBy']`; Authors and Series `name` first; Genres `['name', 'nameFi']` — all already in place, unchanged.
- `admin.meta`: `titleSuffix: '- bookeh'`, `icons: [{ rel: 'icon', type: 'image/svg+xml', url: '/icons/icon.svg' }]`.
- `admin.components.graphics`: `Logo` = the app icon (`/icons/icon.svg`) beside the word "bookeh"; `Icon` = the app icon alone. Both in one small server component file with no imports beyond React types; regenerate `importMap.js` with `npm run generate:importmap`.
- Stylesheet: Payload 3 loads the admin stylesheet from `src/app/(payload)/custom.scss` (imported by the generated `layout.tsx`); that file is the "`admin.css`" of the AC and CLAUDE.md. Rules go in `@layer payload` so they win over `payload-default` by layer, not specificity. Set: `--style-radius-s/m/l: 0px` (DESIGN.md: every corner square); light `--theme-bg: #ffffff`, `--theme-text: #1f2933`; under `html[data-theme='dark']` `--theme-bg: #14181d`, `--theme-text: #e3e8ee` (DESIGN.md background/text tokens). A short header comment names the spine's "Theme only" rule and DESIGN.md as the source of the values.
- Payload's light/dark switch keeps working; both themes are styled.

**Never:**
- No other admin component overrides (views, nav, fields, cells), no restructuring of the admin, no changes to generated `layout.tsx` or `page.tsx`.
- No `admin.theme` lock: "light theme" means light-touch theming (CLAUDE.md "Theme it lightly"), not forcing light mode.
- No access, hook, field or schema change; no migration; no `payload-types.ts` change.
- No tests (config and CSS only; the Tests convention forbids restating config or CSS).
- No Open Sans in the admin (it is loaded only by the frontend layout's `next/font`).

</intent-contract>

## Code Map

- `src/collections/{Authors,Books,Genres,Media,Series}.ts` -- `admin.group: 'Catalogue'` already; columns already as above. Read-only.
- `src/collections/{Copies,Locations,UserBooks}.ts` -- `admin.group: 'Library'` → `'My data'`. All use `ownerAccess`, so the admin sees only their own rows there (FR-48), which the name states.
- `src/collections/Users.ts:57` -- `admin` has no `group`; add `'System'`.
- `src/payload.config.ts:25` -- root `admin`: add `meta` and `components.graphics` beside `user` and `importMap` (`baseDir` is `src`, so component paths read `/app/(payload)/graphics#Logo`).
- `src/app/(payload)/admin/importMap.js` -- generated; today maps only `CollectionCards`.
- `src/app/(payload)/custom.scss` -- empty, already imported by `layout.tsx`.
- `public/icons/icon.svg` -- the bookeh app icon (DESIGN.md, App Icon), served at `/icons/icon.svg`.
- `node_modules/@payloadcms/ui/dist/scss/app.scss` -- declares `@layer payload-default, payload;` and the variables overridden here.
- Docs read (Payload 3.90.2): Customizing CSS, Admin overview, Metadata, Collection admin options, Root components (graphics).

## Tasks & Acceptance

**Execution:**
- `src/collections/Copies.ts`, `Locations.ts`, `UserBooks.ts` -- group `'My data'`.
- `src/collections/Users.ts` -- group `'System'`.
- `src/app/(payload)/graphics.tsx` -- new: `Logo` and `Icon` per Always.
- `src/payload.config.ts` -- `admin.meta` and `admin.components.graphics`.
- `src/app/(payload)/admin/importMap.js` -- regenerate.
- `src/app/(payload)/custom.scss` -- the token overrides per Always.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.36 to `done` when finished.

**Acceptance Criteria:**
- Given Payload admin, when I open it, then the nav shows Catalogue (Authors, Books, Genres, Media, Series), My data (Copies, Locations, User Books) and System (Users), in that order.
- Given the Books, Authors, Series and Genres list views, when I open them, then Books shows title, ISBN and visibility, and the others show name first.
- Given any admin page, when it renders, then its title ends "- bookeh", the favicon and nav icon are the bookeh app icon, the login page shows the bookeh logo, corners are square, and background and text use the DESIGN.md colours in both light and dark.
- Given the diff, when reviewed, then only collection `admin` config, root `admin` config, `graphics.tsx`, the regenerated import map and `custom.scss` changed; no admin view, nav or field component is overridden.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 13, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: background and text change only at the root; Payload's surfaces and most text use `--theme-elevation-*` directly, so dark cards/nav stay `rgb(20,20,20)` against a `#14181d` page — `custom.scss` now sets dark `--theme-elevation-0` and both themes' `--theme-elevation-800` (Payload's text step) to the DESIGN.md values; light ground is already white.
  - `[low]` `[reject]` Blind: Payload hard-codes some radii (pills, buttons, toasts) that the radius variables don't reach — cosmetic; the only full fix is a universal radius reset in `@layer payload`, which would also square radio buttons and status dots; the header comment now says hard-coded radii stay.
  - `[low]` `[patch]` Blind: the Logo wordmark is `fontWeight: 600`; DESIGN.md has no bold — set to 300.
  - `[low]` `[patch]` Blind: `og:site_name`/description still say "Payload App" — `meta.openGraph` sets `siteName: 'bookeh'` and a description.
  - `[low]` `[patch]` Blind: `/api/og` renders the custom Icon through satori, which cannot load the relative `/icons/icon.svg`, so the OG image route the meta tags point at fails — `meta.defaultOGImageType: 'off'` (tailnet back office, never shared); dev check shows no `og:image` tag.
  - `[low]` `[patch]` Blind: Icon's `alt="bookeh"` names StepNav's dashboard home link "bookeh" — `alt=""`, as Logo's image has.
  - `[low]` `[patch]` Blind: Copies and User Books list `owner`, which under `ownerAccess` is always the viewer — removed from both `defaultColumns`.
  - `[false]` `[reject]` Blind: sprint-status `done` before review, spec untracked, diff-scope AC omits sprint-status — finalization commits the spec with status `done` in the same commit; the AC wording fix would edit this build's spec.
  - `[low]` `[reject]` Edge: hard-coded radii stay rounded — same root cause and reason as the Blind radius row.
  - `[low]` `[patch]` Edge: dark surfaces use `--theme-elevation-0`, not `--theme-bg` — fixed with the Blind elevation row.
  - `[low]` `[patch]` Edge: `admin.meta` lacks `openGraph` — fixed with the Blind OG row.
  - `[low]` `[patch]` Edge: most text uses `--theme-elevation-800/400`, so "text uses the DESIGN.md colour" held only for body text — `--theme-elevation-800` now carries the text token; the 400 (muted) step keeps Payload's grey.
  - `[low]` `[reject]` Edge: "corners are square" overclaimed — same root cause and reason as the Blind radius row.
  - `[false]` `[reject]` Intent: the name arrives through config and a graphic, not the stylesheet — CLAUDE.md names a logo among the light theming, and the AC bans only restructuring; graphics replace a slot, nothing is restructured.
  - `[false]` `[reject]` Intent: "light theme" read as light-touch, not light mode — CLAUDE.md "Theme it lightly"; no bad outcome, both modes styled.
  - `[false]` `[reject]` Intent: Title-case group labels vs the AC's lowercase prose — the AC prose lowercases names in running text ("catalogue" also names the existing "Catalogue" group); nothing is wrong on screen.
  - `[low]` `[patch]` Intent: "useful columns" on the other collections — the one useless column (`owner` under My data) is removed with the Blind columns row; others already lead with a meaningful field.
  - `[false]` `[reject]` Intent: no record that the manual check ran — it ran twice on `next dev` (titles, favicon, logo, nav groups in order; after patches, OG tags).
  - `[false]` `[reject]` Intent: story marked `done` while uncommitted — finalization commits; worktree condition met.
  - Verification gap: no findings.

## Design Notes

The name "`admin.css`" predates Payload 3; its stylesheet is `custom.scss` beside the generated layout, so the theme lives there rather than in a second file imported from it.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors.
- `npm run lint` -- expected: no errors.
- `npm run test:unit` -- expected: pass (nothing here should change it).
- `git diff src/app/(payload)/admin/importMap.js` after `npm run generate:importmap` -- expected: only the two graphics entries added.

**Manual checks:**
- `next dev` on a free port against the worktree DB; `/admin/login` has a `<title>` ending "- bookeh", the `/icons/icon.svg` favicon link and the logo; signed in, the nav shows the three groups in order.

## Auto Run Result

Status: done

**Summary.** The back office nav is grouped Catalogue / My data / System; page titles end "- bookeh"; favicon, nav icon and login logo are the bookeh app icon; Open Graph names bookeh and its image route is off; `custom.scss` maps DESIGN.md's square corners and background/text tokens onto Payload's radius and elevation variables in light and dark.

**Files changed**
- `src/collections/Copies.ts`, `Locations.ts`, `UserBooks.ts` -- group `My data`; `owner` column dropped from Copies and User Books.
- `src/collections/Users.ts` -- group `System`.
- `src/payload.config.ts` -- `admin.meta` (title suffix, SVG favicon, OG off, OG site name) and `admin.components.graphics`.
- `src/app/(payload)/graphics.tsx` -- new `Logo` and `Icon`.
- `src/app/(payload)/admin/importMap.js` -- regenerated (two graphics entries).
- `src/app/(payload)/custom.scss` -- theme tokens in `@layer payload`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.36 `done`.

**Review.** 19 findings: 9 low patched (5 entries: elevation tokens, wordmark weight, OG meta and route, icon alt, owner column), 4 low rejected (hard-coded radii; a universal reset would square radios), 6 false. Nothing deferred. Follow-up review: not recommended (patched: high 0, medium 0, low 5 entries).

**Verification.** `npm run typecheck` clean; `npm run lint` 0 errors (40 old warnings, changed paths clean); `npm run test:unit` 764/764. `next dev` on :3036 against the worktree DB: `/admin/login` title "Login - bookeh", `/icons/icon.svg` favicon, logo rendered, `og:site_name` bookeh and no `og:image`; signed in (temporary seeded admin, deleted after), nav groups Catalogue, My data, System in order with the bookeh nav icon.

**Residual risks.** Dark mode and corners not checked by eye in a browser; some Payload elements keep hard-coded rounded corners; list columns not seen rendered (worktree DB has no books). The worktree DB carries a `dev` migration row from `next dev`.
