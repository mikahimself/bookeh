---
title: 'Story 1.21 [K1] Installable PWA'
type: 'feature'
created: '2026-10-09'
baseline_revision: 'a3a3d59ecd3ca12a1be59ae8b77b015de8a23b5b'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      No test shows that the theme-color meta follows a theme change made in Settings without a reload.
    evidence: |-
      The e2e only sets the bookeh_prefs cookie before page.goto. It is assumed, not shown, that the setDevicePrefsAction cookie write re-renders the route's viewport metadata. No theme control exists until Story 1.23. To settle it, in 1.23 change the theme through the Settings switch and assert the meta[name="theme-color"] content updates without a reload.
    location: >-
      src/app/(frontend)/layout.tsx generateViewport
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** bookeh cannot be added to a phone's home screen as an app. There is no web manifest, no app icon, no `theme-color`, and the viewport does not opt into safe areas, so the pinned Scan bar's `env(safe-area-inset-bottom)` from 1.19 is 0 on iOS (FR-50, UX-DR56).

**Approach:** `src/app/manifest.ts` describes the app. The icon from DESIGN.md (option A3) is committed as a path-only SVG in `public/icons/`, with PNGs exported from it by a small `sharp` script. The frontend root layout links the icons, marks the app as web-app capable, sets `viewport-fit=cover`, and emits `theme-color` for the device's saved theme (option T1) through `generateViewport`.

## Boundaries & Constraints

**Always:**
- **Manifest:** `name` and `short_name` "bookeh", `id`, `start_url` and `scope` `/`, `display` `standalone`, `theme_color` and `background_color` `#FFFFFF`. Icons: the 192 and the 512 PNG, each listed twice, once with `purpose: 'any'` and once with `purpose: 'maskable'` (Chrome warns on the combined `"any maskable"`).
- **Icon geometry is DESIGN.md → App Icon & Theme Colour:** 192-unit viewBox, a full-bleed `#F0604F` rect, square corners and no transparency. The b is Open Sans 300, white `#FFFFFF`, font size 124, centred on x = 96 the way `text-anchor="middle"` centres it (by advance width), with its baseline at y = 128. It is a `<path>`, never `<text>`. A `#1F2933` bar runs x 66–126, y 142–148. Exports: `icon-192.png`, `icon-512.png`, and `apple-touch-icon.png` at 180, all opaque.
- **Theme colour follows the device theme** from `devicePrefs()`: `light` → `#FFFFFF`, `dark` → `#14181D`, `system` → a light and a dark pair with `media` `(prefers-color-scheme: light|dark)`. These two values are the `--color-background` tokens. A unit test pins them to `styles.css`, which is the one sanctioned exception to "tokens only" (meta tags and the manifest cannot read CSS variables).
- The icon and manifest URLs are reachable without signing in. `proxy.ts` already skips any path with an extension, so nothing changes there.

**Never:**
- No service worker, no `next-pwa` or similar, no offline cache, no install prompt UI.
- No changes to `Dockerfile` (Story 2.1 owns it). Creating `public/` incidentally satisfies its existing `COPY /app/public`.
- No locale-specific manifest. The manifest request carries no user, and "bookeh" is the same in both languages.
- No new dependency. `sharp` is already a dependency, and fontTools is used one-off through `uv run --with`, not added to the project.
- No hand-tuning of the b's outline. It is the font's glyph, only scaled and placed.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No prefs cookie | first visit | two `theme-color` metas: `media="(prefers-color-scheme: light)"` `#FFFFFF`, `media="(prefers-color-scheme: dark)"` `#14181D` | none |
| Theme dark | `bookeh_prefs` `{theme:'dark'}` | one `theme-color` meta `#14181D`, no `media` | none |
| Theme light | `{theme:'light'}` | one meta `#FFFFFF`, no `media` | none |
| Garbage cookie | `bookeh_prefs=%%%` | same as no cookie (`parseDevicePrefs` falls back to `system`) | never throws |
| Signed out | `GET /manifest.webmanifest`, `/icons/*.png` | 200, served without a redirect to `/login` | none |

</intent-contract>

## Code Map

- `src/app/(frontend)/layout.tsx:20-23` -- `generateMetadata` (title from `app.name`). Extend it with `icons` and `appleWebApp`. Add `generateViewport` next to it. It already calls `devicePrefs()` for `data-theme`, and both are request-scoped. `cacheComponents` is off in `next.config.ts`, so reading cookies in `generateViewport` needs no Suspense.
- `src/app/(frontend)/prefs.ts` -- `devicePrefs()`, `DevicePrefs['theme']`, and `THEMES`. Read-only.
- `src/app/(frontend)/actions/prefs.ts` -- `setDevicePrefsAction` sets the cookie in a server action, so Next re-renders the route and the viewport meta follows a theme change with no extra code. Read-only.
- `src/app/(frontend)/styles.css:27,122,136` -- `--color-background` `#ffffff`, and dark `#14181d` under both `[data-theme='dark']` and the `prefers-color-scheme` block. This is the source the unit test pins `THEME_COLORS` to.
- `src/app/(frontend)/(sections)/layout.tsx:39` and `components/toast/ToastProvider.tsx:68` -- already use `env(safe-area-inset-bottom)`, which only has a value once `viewport-fit=cover` is set.
- `src/proxy.ts:21` -- the matcher excludes `.*\.[^/]*$`, so `/manifest.webmanifest` and `/icons/*.png` bypass it. Auth lives in `requireUser()` in pages only.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/01-metadata/manifest.md` -- `app/manifest.ts` at the app root, a default export returning `MetadataRoute.Manifest`, served at `/manifest.webmanifest`. Root static metadata applies to every root layout, so Payload admin pages get the `<link rel="manifest">` too, which is harmless.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/generate-viewport.md` -- `themeColor` takes a string or `{ media, color }[]`; `viewportFit` is typed in `lib/metadata/types/extra-types.d.ts:52`. You cannot export both `viewport` and `generateViewport` from one segment.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/.working/icon-and-theme-colour.html:138` -- the rendered reference, option A3: `<text x="96" y="128" text-anchor="middle" font-weight="300" font-size="124">b</text>`. Read-only.
- `tests/unit/layout.unit.spec.ts:12-25` -- already mocks `next/headers` cookies with a `prefsCookie` variable; extend it for `generateViewport`.
- `tests/unit/styles.unit.spec.ts:7-35` -- pattern for reading `styles.css` and `block()`/`declarations()` helpers to reuse the idea, not import.
- `tests/e2e/sections.e2e.spec.ts:1-10` and `tests/helpers/seedUser.ts:4,15,38` -- e2e pattern with its own seeded `TestUser` and `BASE = 'http://localhost:3000'`; sign in through `/login` like `sections.e2e`.

## Tasks & Acceptance

**Execution:**
- `public/icons/icon.svg` -- NEW. The source icon per the geometry above. For the b, take Open Sans Light (the static `OpenSans-Light.ttf` from github.com/googlefonts/opensans, or the variable font instanced at wght 300) and extract glyph `b` with `uv run --with fonttools` (`SVGPathPen`). Place it with `transform="translate(96 − advance·s/2, 128) scale(s, −s)"` where `s = 124 / unitsPerEm`. Add a one-line comment naming the font and the OFL licence. -- the font-independent source DESIGN.md asks for.
- `scripts/export-icons.mjs` -- NEW. About 15 lines: `sharp` renders `public/icons/icon.svg` with `density` scaled to each size, then `.flatten()` and `.png()`, writing `icon-192.png`, `icon-512.png` and `apple-touch-icon.png` (180). `package.json` -- add `"icons": "node scripts/export-icons.mjs"`. Run it and commit the three PNGs. -- reproducible exports from one source.
- `src/app/(frontend)/pwa.ts` -- NEW. `THEME_COLORS = { light: '#FFFFFF', dark: '#14181D' } as const`, `themeColorFor(theme: DevicePrefs['theme']): Viewport['themeColor']`, and `ICONS` (the three public paths). -- one home for the values the manifest and the layout share.
- `src/app/manifest.ts` -- NEW. The manifest above, using `THEME_COLORS.light` and `ICONS`.
- `src/app/(frontend)/layout.tsx` -- `generateViewport()` returns `{ viewportFit: 'cover', themeColor: themeColorFor((await devicePrefs()).theme) }`. `generateMetadata` adds `icons: { icon: [{ url: ICONS.icon192, sizes: '192x192', type: 'image/png' }], apple: [{ url: ICONS.apple, sizes: '180x180' }] }` and `appleWebApp: { capable: true, title: t('name'), statusBarStyle: 'default' }`.
- `src/app/(frontend)/styles.css` -- in the base layer, `body { padding-inline: env(safe-area-inset-left) env(safe-area-inset-right); }`. With `viewport-fit=cover`, landscape content would otherwise run under the notch. It is 0 everywhere else.
- `tests/unit/pwa.unit.spec.ts` -- NEW. `manifest()` deep-equals the expected object. `themeColorFor` covers the three themes. `THEME_COLORS` equals `styles.css`'s light and dark `--color-background`, case-insensitively. `icon.svg` has `viewBox="0 0 192 192"`, no `<text`, the three colours, and the bar rect. Each PNG, read through `sharp`, has the right width and height, format `png`, no alpha, and pixel (0,0) `#F0604F`. In `icon-512.png`, every pixel outside the central circle of radius 0.4 × 512 is `#F0604F` (within ±2 per channel), which proves the maskable safe zone.
- `tests/unit/layout.unit.spec.ts` -- `generateViewport` across the I/O matrix's cookie rows, plus `viewportFit: 'cover'`.
- `tests/e2e/pwa.e2e.spec.ts` -- NEW. The acceptance criteria below, with its own seeded user.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- add: fixed elements (toast region, full-screen task) do not yet pad for `safe-area-inset-left/right` in landscape.

**Acceptance Criteria:**
- Given a signed-out browser, when it fetches `/manifest.webmanifest`, then it gets 200 with a `application/manifest+json` content type and the manifest above. Every icon `src` in it, and `/icons/apple-touch-icon.png`, answers 200 `image/png` with no redirect.
- Given a signed-out browser on `/login`, then the head has `<link rel="manifest" href="/manifest.webmanifest">`, an `apple-touch-icon` link to `/icons/apple-touch-icon.png`, an `icon` link to `/icons/icon-192.png`, `mobile-web-app-capable` content `yes`, and a viewport meta containing `viewport-fit=cover`.
- Given a `bookeh_prefs` cookie with theme `dark`, `light`, or no cookie, when `/login` loads, then the `theme-color` metas are exactly as in the I/O matrix.
- Given a signed-in user, when `/` (the manifest's `start_url`) loads, then the collection heading shows, and `navigator.serviceWorker.getRegistrations()` resolves to an empty list.
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run build`, then all pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 15 findings — high 0, medium 2, low 9, false 3, maybe-false 1
- findings:
  - `[medium]` `[patch]` (verification-gap) The icon PNG tests pass on a blank coral square, and nothing ties the PNGs to `icon.svg`. — Pre-verified by the layer. Fix: a test re-renders `icon.svg` through the export pipeline and compares the pixels with each committed PNG; the safe-zone circle must contain white and slate pixels.
  - `[low]` `[reject]` (edge-case) The root manifest is linked on Payload `/admin` too, so installing from admin installs bookeh. — Real: Next links a root manifest on every root layout. But `start_url` is `/`, so the installed app opens the frontend whichever page it was installed from. The admin is admin-only, and the spec accepts the link. Moving the manifest under `(frontend)` would need manual `metadata.manifest` wiring for a case nobody meets in practice.
  - `[low]` `[patch]` (edge-case) Under a dark theme, the installed app launches with a white splash and title bar. — Real: the manifest is static and DESIGN.md (T1) fixes it at `#FFFFFF`. The design decision stands. Fix: recorded in `deferred-work.md` as a known consequence. Grouped with the blind-hunter "dark launch" row.
  - `[medium]` `[patch]` (blind) Nothing checks that the PNGs match `icon.svg`, and byte-identical output depends on the machine. — Same root cause as the verification-gap row. Fix: the same pixel-tolerance re-render test.
  - `[maybe-false]` `[defer]` (blind) Nothing tests that `theme-color` follows a theme change without a reload. — To settle it: in Story 1.23 (Settings), change the theme through `setDevicePrefsAction` and assert the meta updates without a reload. No theme control exists yet. Would be medium if true.
  - `[low]` `[patch]` (blind) The safe-zone test covers only `icon-512.png`, but the 192 is also listed as maskable. — Fix: run the check over both maskable sizes.
  - `[low]` `[reject]` (blind) The tab favicon is the 192 PNG scaled down, and `/favicon.ico` returns 404. — Browsers that find `<link rel="icon">` don't request `/favicon.ico`. An SVG favicon would render the same thin b at 16 px, so there is no demonstrated improvement. Cosmetic.
  - `[low]` `[reject]` (blind) The side safe-area padding adds to the page margin in landscape instead of taking the larger of the two. — Real, but cosmetic: about 16 px of extra inset, only in landscape on a notched phone. A `max()` fix would touch every margin utility.
  - `[false]` `[reject]` (blind) `padding-inline` maps physical insets to logical sides, which would swap under RTL. — The app has no RTL locale (`en`, `fi` only), and `dir` is never set, so the swap cannot happen.
  - `[low]` `[reject]` (blind) The app name has three unlinked sources (the manifest literal and `app.name` in each locale). — "bookeh" is the brand name and the same in both message files, so the sources are unlikely to diverge. Not worth a new cross-check test.
  - `[low]` `[patch]` (blind) Dark-theme launch is neither addressed nor deferred. — Grouped with the edge-case dark splash row. Fix: the `deferred-work.md` entry.
  - `[low]` `[patch]` (blind) The landscape deferral leaves out `ProgressLine` (`fixed inset-x-0 top-0`). — Fix: added to the entry as a thin full-bleed line, likely fine edge to edge.
  - `[false]` `[reject]` (intent) On iOS, the first home-screen launch shows `/login`, not the collection. — Sign-in is required on every page (PRD F1). `requireUser()` redirects to `/login?next=/`, sign-in returns to the collection, and the 30-day session then persists in the standalone app's store.
  - `[low]` `[reject]` (intent) Device behaviour (standalone launch, real safe-area insets) is checked only as declarations in desktop Chromium. — No automated surface reaches an installed iOS or Android app. Recorded as a residual risk for a manual on-device check.
  - `[false]` `[reject]` (intent) Not committed, and sprint status not updated. — Finalize commits the change. The repository closes stories out in sprint status in a separate `chore:` commit on main (`a3a3d59`, `72639f2`).

## Design Notes

**The epic's last criterion is already met.** Mika picked the icon and theme colour from rendered options, and they were recorded in DESIGN.md in `a86dc7f` (options A3 and T1). This story implements that record.

**Static files in `public/` rather than the `icon.png`/`apple-icon.png` file convention.** The manifest needs stable, known URLs for two sizes in two purposes. The file convention appends hashes and gives one URL per file name, so the manifest would have to guess them. Explicit `metadata.icons` in the frontend layout also keeps the Payload admin's own icons untouched.

**Why `viewport-fit=cover`.** Without it, WebKit reports every `safe-area-inset-*` as 0, so 1.19's pinned Scan bar would sit under the iPhone home indicator in standalone mode. The status bar stays `default` (opaque), so nothing moves under it at the top.

**Why one theme-colour meta when the theme is fixed.** A `media` pair would follow the OS, not the user's choice. The layout already knows the saved theme on the server, the same way it sets `data-theme`.

**Placing the glyph.** In the reference, `text-anchor="middle"` centres the advance box, not the ink, so the outline translates by half the advance:

```svg
<path transform="translate(TX 128) scale(S -S)" d="…glyph b in font units…" fill="#FFFFFF"/>
<!-- S = 124 / unitsPerEm; TX = 96 − advanceWidth·S/2 -->
```

## Verification

**Commands:**
- `npm run icons && git status --short public/icons` -- expected: the PNGs regenerate without a diff after they are committed (sharp output is deterministic for the same input).
- `npm run lint && npm run typecheck && npm run test:unit` -- expected: all pass.
- `npm run build` -- expected: succeeds, and `/manifest.webmanifest` is listed as a route.
- `npx playwright test tests/e2e/pwa.e2e.spec.ts tests/e2e/sections.e2e.spec.ts tests/e2e/frontend.e2e.spec.ts` -- expected: all pass. Needs Postgres up via `docker compose`.

**Manual checks:**
- Open `public/icons/icon-512.png` beside a screenshot of option A3 in `.working/icon-and-theme-colour.html`. The b's position, weight and size match.

## Auto Run Result

Status: done

**Summary:** bookeh can now be installed. `src/app/manifest.ts` serves a standalone manifest named "bookeh", starting at `/`. The DESIGN.md A3 icon is a path-only SVG, and three PNGs are exported from it with sharp. The frontend layout links the icons, marks the app as web-app capable, sets `viewport-fit=cover` so the safe-area insets take effect, and emits `theme-color` for the device's saved theme (T1).

**Files changed:**
- `public/icons/icon.svg`: the source icon. The b is the Open Sans Light glyph as a path, placed by advance width.
- `public/icons/icon-192.png`, `icon-512.png`, `apple-touch-icon.png`: opaque exports from the SVG.
- `scripts/export-icons.mjs`, `package.json`: `npm run icons` regenerates the PNGs.
- `src/app/(frontend)/pwa.ts`: `THEME_COLORS`, `ICONS`, `themeColorFor()`.
- `src/app/manifest.ts`: the web manifest. Each icon is listed once as `any` and once as `maskable`.
- `src/app/(frontend)/layout.tsx`: icons and `appleWebApp` metadata, and a `generateViewport` with `viewportFit` and `themeColor`.
- `src/app/(frontend)/styles.css`: side safe-area padding on `body`.
- `tests/unit/pwa.unit.spec.ts`: the manifest, the theme colours pinned to the tokens, the SVG structure, PNGs re-rendered from the SVG and compared, and the maskable safe zone with the mark present.
- `tests/unit/layout.unit.spec.ts`: `generateViewport` across the cookie cases.
- `tests/unit/styles.unit.spec.ts`: the body declarations now include the padding.
- `tests/e2e/pwa.e2e.spec.ts`: the manifest and icons served signed out, the head links and metas, the theme colours per cookie, the start URL, and no service worker.
- `_bmad-output/implementation-artifacts/deferred-work.md`: landscape side insets for fixed elements, and the white launch screen under a dark theme as a known T1 consequence.
- `_bmad-output/implementation-artifacts/epic-1-context.md`: recompiled after the icon and theme-colour change to DESIGN.md (`a86dc7f`).

**Review findings:** 15 findings: medium 2, low 9, false 3, maybe-false 1.
- **Patched (4 entries):**
  - medium: icon PNGs not tied to the SVG, and the tests passed on a blank icon (verification-gap and blind rows).
  - low: the safe zone was checked on 512 only.
  - low: the dark-theme launch splash was not recorded (edge-case and blind rows).
  - low: the landscape deferral left out ProgressLine.
- **Deferred (1):** `theme-color` following a theme change without a reload is unverified until Story 1.23 (medium, unverified).
- **Rejected:**
  - Admin pages link the manifest: harmless, because `start_url` is `/`.
  - Favicon at 16 px: an SVG would show the same thin b.
  - Landscape padding adds to the page margin: cosmetic, landscape only.
  - Logical vs physical padding properties: false, there is no RTL locale.
  - The app name has three sources: it is the brand name, so divergence is unlikely.
  - iOS first launch shows `/login`: false, sign-in is required and it returns to the collection.
  - No device-level tests: there is no automated surface for an installed app; this is left as a residual risk.
  - Not committed: false, finalize commits.

**Follow-up review recommended:** false. Patched counts by entry verdict: high 0, medium 1, low 3.

**Verification:**
- `npm run icons` regenerates byte-identical PNGs.
- `npm run lint`: 0 errors (the 5 warnings were already there).
- `npm run typecheck`: passes.
- `npm run test:unit`: 437 passed.
- `npm run build`: succeeds, and `○ /manifest.webmanifest` is listed.
- Playwright `pwa`, `sections` and `frontend` e2e: 25 passed, before the test-only patches. The patches changed no source.
- The 512 icon was inspected visually against DESIGN.md A3.

**Residual risks:**
- Nothing was tested on a real device. Worth checking by hand:
  - iOS standalone launch
  - home-indicator clearance of the pinned Scan bar
  - the Android maskable crop
  - whether the dark-theme launch flash is acceptable
- `theme-color` following a theme change is unverified until Settings exists (deferred).
