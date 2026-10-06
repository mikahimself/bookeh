# Verification review, update of 2026-10-05 — ARCHITECTURE-SPINE.md

Reviewed: 2026-10-05. Scope: what is new or changed since the version verified on 2026-10-03 (`review-verification.md`), plus older claims the update leans on. The spine was not modified. Nothing was installed or upgraded in the project.

## Verdict

The update's choices hold up (Base UI 1.8.0, Open Sans through `next/font/google`, Book detail on a search param, the prefs cookie, `/data/` route handlers), but one assumption underneath them is wrong as written: **module-level in-process state is not shared between route handlers and pages or server actions** in a Next 16.3 build, and the update moved more reads into route handlers. That needs one sentence in AD-12. The Book detail design is sound but only under four builder rules the spine does not state.

## How this was checked

- npm registry (`npm view`), 2026-10-05.
- Bundled Next docs, `node_modules/next/dist/docs/` (Next 16.3.3 installed), and Next and Payload source in `node_modules`.
- The `@base-ui/react@1.8.0` tarball, unpacked in the scratchpad (not installed). It ships its own docs under `docs/react/`. Cross-checked against base-ui.com.
- A throwaway Next app in the scratchpad, built and run with the project's installed Next 16.3.3 through a temporary `node_modules` symlink (removed afterwards), driven with curl and headless Chromium. Results are marked **Ran it**. Source: `<scratchpad>/singleton-test/` (`pw.mjs`, `pw2.mjs`, `pw3.mjs`).

Legend: **Confirmed** / **Wrong** / **Could not confirm**. Paths starting `next/`, `payload/`, `@payloadcms/` are under `node_modules/`; `base-ui/` is the unpacked tarball.

## Problems, ranked

| # | Severity | Where | Problem | Smallest correction |
| --- | --- | --- | --- | --- |
| P1 | High | AD-12, and through it AD-9 (lookup cache, rate limit), AD-14 (recorded cover URL), AD-11 (`requestId`), AD-20 (receipts) | **Wrong as assumed.** A module-level `Map` exists twice in one Node process. Ran it on 16.3.3, `output: 'standalone'`: with Turbopack (the default for `next build`), all pages and server actions share one instance of a module and all route handlers share another. With `--webpack` the split is different: pages and route handlers share one, server actions imported from client components get another. `globalThis` is shared in both. With the update's layout this breaks real paths: `/data/lookup` (route handler) fills the lookup cache that `saveCopy` (action) reads; `/scan/find` and `/scan?isbn=` (pages) record the cover URL that `/data/cover/[isbn13]` (route handler) reads, so previews of search hits would 404; the "one shared rate limit" becomes two. Undo and `requestId` happen to work under Turbopack (action to action) but the receipt store has the same exposure the moment a route handler touches it. Dev HMR also resets module state. Payload itself keeps its instance on `global._payload` for this reason (`payload/dist/index.js:533-535`). | AD-12 rule, add: "In-process state is created through one helper, `processState(key, init)` in `lib/payload`, which keeps it on `globalThis`. No service holds state in a module-level variable; the bundler gives pages, actions and route handlers separate copies of a module." Add an integration or Playwright assertion that a lookup through `/data/lookup` is a cache hit for the following save. |
| P2 | Medium | Routes: Book detail on `?book=` | Sound (see claim 4), but it only behaves as `EXPERIENCE.md` requires under rules the spine leaves to each story. Ran it: a default `<Link>` to `?book=` from a scrolled list **scrolls to the top**; `history.pushState` changes the URL **without** re-rendering the server component; each default `<Link>` in the viewport fires a prefetch request; nothing visible happens between tap and server response, even with a `loading.tsx`. | Routes table or AD-7, add: "Book detail opens and closes by router navigation (`Link` or `router.push/replace`) with `scroll: false` and `prefetch={false}`, never `history.pushState`. The client list is keyed on the shelf query without `book`. `cacheComponents` stays off." |
| P3 | Medium | Routes and AD-7: list state across routes | Without `cacheComponents`, Next keeps one route's client state (`next/dist/client/components/bfcache-state-manager.js`: `MAX_BF_CACHE_ENTRIES = process.env.__NEXT_CACHE_COMPONENTS ? 3 : 1`). Going from the collection to `/scan` or `/books/[bookId]/edit` and back remounts the list: pages loaded by scrolling are gone and scroll restoration can only reach the first page. The sheet case is fine; this is the "X returns to the section underneath" case. Also, rows held on the client beyond page 1 are not refreshed by a server re-render after a mutation (a Lend from the sheet on a row in page 3). | Decide and say so in AD-7: either accept the reset, or the list component persists its loaded page count per shelf query (history state or `sessionStorage`) and refetches. For mutations: actions return the changed `ShelfRow`s, or the list refetches the pages it holds. |
| P4 | Low | AD-7: `CASE WHEN field = ANY(overridden)` | Not literal SQL under Payload's Postgres schema, and the new author sort leans on it. Payload never creates a Postgres array column: a hasMany `select` becomes its own table, hasMany `text` goes to `<table>_texts`, `json` is `jsonb` (`@payloadcms/drizzle/dist/schema/traverseFields.js:534-541, 591, 771-779`). | AD-6: name the field type of `overridden` (hasMany `select` over the `bookFields` names is the natural one). AD-7: "…`CASE WHEN field is in overridden` (an `EXISTS` on the `overridden` table)…". |
| P5 | Low | Stack: "Open Sans via `next/font/google` … bundled with Next.js" | The font files are not bundled; only the metadata is. They are downloaded from `fonts.googleapis.com` / `fonts.gstatic.com` at build. Ran it: with the network blocked, `next build` fails with "Failed to fetch Open Sans from Google Fonts". CI on GitHub Actions has network, so this works; a build behind a firewall or on a plane does not. In `next dev` a failed fetch falls back to a system font with a warning. | Stack row version column: "variable font, downloaded at build (the build needs network access to Google Fonts)". If hermetic builds matter, commit the two variable `woff2` files and use `next/font/local`; nothing else in the spine changes. |
| P6 | Low | UI primitives convention | Three Base UI facts a wrapper story would otherwise rediscover: (a) popups render through a portal that mounts after hydration, so on a hard load of `?book=12` the sheet's content is not in the server HTML; (b) the server cannot know phone from wide, so "sheet on the phone, panel on wide" is decided on the client; the wide panel is in-flow ("the list narrows") and needs no Drawer at all; (c) setup the docs require: `isolation: isolate` on an app root wrapper, and on iOS 26 Safari `body { position: relative }` with an absolutely positioned backdrop. Also: `Combobox` does not accept free text ("use Autocomplete instead"); new author or series names need its "Creatable" pattern or `Autocomplete`. | UI primitives row, add: "Wrappers are client components. The Base UI root-layout setup (isolated root, iOS 26 backdrop rule) lives in the frontend root layout and `styles.css`." |
| P7 | Low | AD-2 with AD-10 (`/data/*`) | "Every … route handler starts with `requireUser()`, which redirects to sign-in." A redirect answers a `fetch` with the login page's HTML and status 200. | AD-2: "In a route handler `requireUser()` answers 401; the client treats 401 as signed out." |
| P8 | Low | Styling convention (theme) | Tailwind 4's `dark:` variant follows `prefers-color-scheme` only, so a `dark:` utility would ignore `data-theme`. The spine's token approach does not need the variant. | Styling row, add "no `dark:` utilities" (or define `@custom-variant dark` once). Set `color-scheme` alongside so native controls and scrollbars follow. |

## Claim-by-claim results

### 1. Stack versions

| Claim | Result | Evidence |
| --- | --- | --- |
| Next.js 16.3.8 | Confirmed | `npm view next dist-tags`: `latest` 16.3.8. Installed is still 16.3.3. |
| Payload 3.90.2 (four packages) | Confirmed | `latest` 3.90.2 for `payload`, `@payloadcms/next`, `@payloadcms/db-postgres`. |
| next-intl 4.14.9 | Confirmed | `latest` 4.14.9. |
| Tailwind CSS 4.3.3 | Confirmed | `latest` 4.3.3. |
| `@base-ui/react` 1.8.0 | Confirmed | `latest` 1.8.0, published 2026-09-04; no later release (base-ui.com/react/overview/releases). The name is right: the package was renamed from `@base-ui-components/react`, which stopped at `1.0.0-rc.0` (`base-ui/docs/react/overview/quick-start.md:9`). Stable 1.x since 2025-12-11. Peers `react` and `react-dom` `^17 \|\| ^18 \|\| ^19`; `date-fns` and `@date-fns/tz` are optional peers and not needed. |
| React 19.2.6 | Confirmed | npm `latest` is 19.3.0; no action needed. |

### 2. Base UI covers the overlays

| Claim | Result | Evidence |
| --- | --- | --- |
| Dialog, Menu, Combobox, sheet "and the other overlays" | Confirmed | Package exports `./dialog`, `./alert-dialog`, `./menu`, `./combobox`, `./autocomplete`, `./drawer`, `./popover`, `./toast`, `./select`, `./tooltip` (`base-ui/package.json`). Combobox has async search, multiple with chips, and a creatable example (`base-ui/docs/react/components/combobox.md:3374, 4384, 5516`). |
| Drawer is stable | Confirmed | Added in v1.2.0 as a preview, stable from v1.3.0 (2026-03-12): "`Drawer` is no longer marked as preview … import as `{ Drawer } from '@base-ui/react/drawer'`" (`base-ui/CHANGELOG.md:888-891`). Still receiving fixes in 1.8.0 (snap-point and swipe fixes, `CHANGELOG.md:62-66`). |
| Draggable bottom sheet, half open then fully open | Confirmed | `snapPoints` on `Drawer.Root`: numbers 0-1 are viewport-height fractions, above 1 pixels, strings `px`/`rem`; `snapPoint` + `onSnapPointChange` control it, which covers "tapping the handle opens it fully"; `snapToSequentialPoints` stops a fast swipe from skipping the half stop (`drawer.md:1292-1311, 1695, 5145-5155`). The position is applied by the app's CSS: `transform: translateY(calc(var(--drawer-snap-point-offset) + var(--drawer-swipe-movement-y)))`. |
| Swipe to dismiss | Confirmed | `swipeDirection` (default `'down'`); `data-swiping`, `--drawer-swipe-progress` for the scrim (`drawer.md:5131-5160`). |
| Modal sheet with the list visible and dimmed, tap outside closes | Confirmed | Default `modal={true}`: focus trapped, page scroll locked, outside pointer disabled; `Drawer.Backdrop` is the scrim; outside press dismisses unless `disablePointerDismissal`. This is what `EXPERIENCE.md` asks of the sheet ("Modal: focus is held inside"). |
| Non-modal use | Confirmed | `modal={false}` ("user interaction with the rest of the document is allowed") with `disablePointerDismissal`; `'trap-focus'` is the middle setting (`drawer.md:2677-2679, 5153`). Not needed for the phone sheet; see P6 for the wide panel. |
| SSR and App Router | Confirmed with caveats (P6) | Every part file starts with `'use client'` (`base-ui/drawer/root/DrawerRoot.mjs:1` and siblings), so parts can be imported anywhere, but wrappers hold state and are client components. Portals mount after hydration (`base-ui/floating-ui-react/components/FloatingPortal.mjs:35-80`). Server components pass through as `children`. |
| "No animation library" | Confirmed | Base UI animates with CSS: `data-starting-style` / `data-ending-style` and the swipe variables (`drawer.md:5032-5040`; `docs/react/handbook/animation.md`). |

Keyboard on the sheet: `Drawer.VirtualKeyboardProvider` exists for sheets that contain inputs (`drawer.md:1697`). Relevant to pickers with a combobox on the phone.

### 3. Font

| Claim | Result | Evidence |
| --- | --- | --- |
| `next/font/google` self-hosts; the browser makes no request to a font host | Confirmed | "CSS and font files are downloaded at build time and self-hosted with the rest of your static assets. No requests are sent to Google by the browser." (`next/dist/docs/01-app/03-api-reference/02-components/font.md:13`; `01-getting-started/13-fonts.md:100`). **Ran it:** the build emitted `woff2` files under `.next/static/media` and the CSS contains no `fonts.g*` URL. |
| Open Sans has weight 300 and is variable | Confirmed | `next/dist/compiled/@next/font/dist/google/font-data.json`: weights 300-800 plus `variable`, axes `wght` 300-800 and `wdth` 75-100. Export is `Open_Sans` (`index.d.ts:12988`). **Ran it:** generated `@font-face` has `font-weight: 300 800`. One file per subset serves both 300 and 400; no `weight` option needed. |
| Finnish letters | Confirmed | å, ä, ö are in `latin`. š and ž are in `latin-ext`; `subsets` only chooses what is preloaded, the other subsets are still emitted and load on demand from the app. |
| Build without network | Fails (P5) | **Ran it** with the proxy pointed at a dead port: "next/font: error: Failed to fetch Open Sans from Google Fonts. If you are offline or behind a proxy, self-host the font with next/font/local…". Production host never builds, so only CI and local builds are affected. |
| With Tailwind 4 | Confirmed | `variable: '--font-open-sans'` on the font, then `@theme inline { --font-sans: var(--font-open-sans); }` (`font.md:733-838`). The token for the family therefore has to be declared in the `inline` theme block. |

### 4. Book detail on a search param

| Claim | Result | Evidence |
| --- | --- | --- |
| Pages receive `searchParams` as a Promise | Confirmed | `next/dist/docs/01-app/03-api-reference/03-file-conventions/page.md:14, 117-121`. It is a plain object, not `URLSearchParams`; repeated keys arrive as `string[]`. `parseShelfQuery()` has to accept this shape and the route handler's `URLSearchParams`. |
| Layouts do not receive them | Confirmed | `layout.md:154, 180`: "Layouts do not rerender on navigation, so they cannot access search params". So the detail cannot live in the shared layout; each of the three section pages renders it, as the spine says. |
| A search-param-only navigation re-renders the page on the server | Confirmed, **ran it** | One RSC request per navigation; the page re-rendered, the layout did not. |
| Client state in the list survives it | Confirmed, **ran it** | The page segment's React key excludes search params: `createRouterCacheKey(activeSegment, true) // no search params` (`next/dist/client/components/layout-router.js:549`). A client list with extra rows in state kept its mount, its rows and (with `scroll={false}`) its scroll position across open, switch book, Back, Back. |
| No intercepting or parallel routes needed | Confirmed | Nothing in the above depends on them. |
| Caching | Confirmed | Dynamic pages are not kept in the client cache (`staleTimes.dynamic` default 0, `03-api-reference/05-config/01-next-config-js/staleTimes.md:24-27`), so opening a book always asks the server. Back and Forward reuse the earlier payload without a request (`04-glossary.md:47`; ran it), so after a mutation the action must call `refresh()` or `revalidatePath()` (`01-getting-started/07-mutating-data.md:381-421`), which clears that cache. |
| `cacheComponents` | Not enabled, keep it off | `preserving-ui-state.md` describes `<Activity>` state preservation only "with Cache Components enabled". Enabling it changes the whole rendering model (every `cookies()` read outside `<Suspense>` blocks prerendering, `cookies.md:70`) and Payload's compatibility with it was not checked. See P3 for what staying off costs. |

What a builder must know (P2), each observed in the test app:

1. `scroll={false}` on the link and `{ scroll: false }` on `router.push/replace`. The default scrolled a list at 3000px back to 0 (`link.md:230-236, 847-853`).
2. `prefetch={false}` on row links. Default links in the viewport each issued a prefetch request, and re-issued them after a cookie write.
3. Router navigation only. `window.history.pushState('?book=99')` updated the URL and `useSearchParams` but sent no request; the server-rendered detail stayed on the previous book (`04-linking-and-navigating.md:343-347`). The same goes for URL-state libraries in shallow mode.
4. Key the client list on the shelf query without `book`, so filters reset it and opening a book does not. The first-page props arrive again on every open; the list must tolerate that.
5. No feedback until the server answers. With a 700ms page and a `loading.tsx`, the fallback did not show and the URL did not change until the response arrived. Use `useLinkStatus` (`04-linking-and-navigating.md:233-261`) or open the sheet optimistically, and wrap the detail in `<Suspense key={bookId}>` so the sheet can open before its data.
6. Back closes the sheet if opening was a push. X should go back when the sheet was opened in-app and `router.replace` to the section when the page was loaded with `?book=` already set.

### 5. Route handlers under `src/app/(frontend)/data/`

| Claim | Result | Evidence |
| --- | --- | --- |
| A folder named `data` inside a route group | Confirmed | Route groups do not affect the URL; the only rule is that two groups must not resolve to the same path (`route-groups.md:31`) and that `route.ts` and `page.tsx` cannot share a segment (`01-getting-started/15-route-handlers.md:39, 155-161`). `data` is not reserved. **Ran it** with `/data` and `/data2`. |
| No conflict with Payload | Confirmed | `(payload)` owns `/admin/[[...segments]]` and `/api/[...slug]` (plus the GraphQL folders to be deleted). Nothing there matches `/data/*`. |
| Dynamic, uncached | Confirmed | "Route Handlers are not cached by default" (`15-route-handlers.md:51`). `params` is a Promise; `RouteContext<'/data/cover/[isbn13]'>` types it (`route.md:82-121`). |
| Layout does not apply | Note | Route handlers "do not participate in layouts" (`15-route-handlers.md:154`): each authenticates itself (P7) and none sees the root layout's providers. |

### 6. Device preferences cookie and theme

| Claim | Result | Evidence |
| --- | --- | --- |
| `cookies()` is async; read in server components, written in server actions or route handlers | Confirmed | `next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:6, 67, 74, 81`. `(await cookies()).get(...)` / `.set(...)`. |
| A server action that writes the cookie updates the page | Confirmed, **ran it** | The action's response re-rendered the root layout: `data-theme` changed on `<html>` with no reload, and client state and scroll were kept. Docs: `cookies.md:87`; `cookies.set` also invalidates the client cache (`04-glossary.md:49`). |
| Side effect of reading it in the root layout | Confirmed, harmless here | It opts every route under the layout into dynamic rendering (`cookies.md:69`). Every frontend route already is, through the session and the next-intl locale. It would matter only if `cacheComponents` were turned on. |
| `data-theme` plus `prefers-color-scheme` for "system", no flash | Confirmed | The bundled guide's inline script exists to keep pages static ("reading it in the root layout opts the entire app out of static prerendering", `02-guides/preventing-flash-before-hydration.md`, "Storing the theme in a cookie"). This app reads the cookie on the server, so the first HTML already carries the attribute; "system" is a media query and needs no script. No hydration mismatch arises. See P8 for Tailwind's `dark:`. |
| Cookie attributes | Note | Set it from the server action (an HTTP `Set-Cookie`), not `document.cookie`: Safari caps script-written cookies at 7 days. Give it `path: '/'` and a `maxAge` (browsers cap at about 400 days, so it is refreshed on write). The installed PWA on iOS has its own cookie jar, separate from Safari: "per device" is per installed context. |

### 7. "First effective author" is well defined

Confirmed. A hasMany relationship is stored in `<table>_rels` with an integer `order` column, written as `i + 1` in array order and read back `ORDER BY order` (`@payloadcms/drizzle/dist/schema/build.js:457-494`; `transform/write/relationships.js:11-13`; `find/buildFindManyArgs.js:74-81`). The same code is in 3.90.x (the adapter still pins `drizzle-orm 0.45.2`).

So in Drizzle the first shared author is the `books_rels` row with `path = 'authors'` and the lowest `order`; the first override author is the same on `user_books_rels`. `path` is the field's dotted path, so it stays `'authors'` only if the override field is top-level on `user-books`. The sort is a correlated subquery joined to `authors.sort_name`; no index serves it, which is fine at 10,000 copies and worth one measurement in the shelf story. See P4 for the `ANY(overridden)` wording.

### 8. In-process store shared between actions and route handlers

**Wrong as assumed; a `globalThis` singleton is required (P1).** Ran it on Next 16.3.3, production build, `node .next/standalone/…/server.js`, one module exporting a module-level object and a `globalThis` object:

| Reader | Turbopack build (default) | `--webpack` build |
| --- | --- | --- |
| Page `/`, page `/other` | instance A | instance A |
| Server action in `actions.ts` (called from a client component), inline action | instance A | **instance B** |
| Route handlers `/data`, `/data2` | **instance B** | instance A |
| `globalThis` object | one, everywhere | one, everywhere |

A counter bumped by the action stayed 0 in the route handlers (Turbopack) or in the pages (webpack). Next's bundler layers explain it (`next/dist/lib/constants.js:331-372`: `rsc`, `action-browser`, …). The bundled docs give no guarantee either way. The pre-update spine had the same exposure in principle; it mattered less when lookup was a server action.

### 9. Motion without a library

Confirmed, available. `import { ViewTransition } from 'react'` "works in the App Router with no configuration" (`next/dist/docs/01-app/02-guides/view-transitions.md:50-58`); `Link` and `router.push/replace` take `transitionTypes` for directional slides (`:226-239`); the guide's reduced-motion block is at `:379`. Animations are driven by transitions, so they do not block input; unsupported browsers simply do not animate. Types come from `@types/react/canary`. Safari "may behave differently", so the section slide stays the optional enhancement the spine already says it is.

## Not checked

- Payload 3.90 with `cacheComponents`. Not needed while it stays off.
- The drawer's drag feel and scroll lock in an installed iOS PWA. Needs a device; do it in the sheet wrapper story before other screens depend on it.
- Whether Base UI's modal scroll lock disturbs the list's scroll position on iOS Safari when the sheet opens. Same story.
- Dev-mode (`next dev`) module identity. HMR resets module state regardless; the `globalThis` helper covers it.
