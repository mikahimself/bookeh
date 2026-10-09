---
title: 'Story 1.19 [A22] Section shell'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '72639f203034aa968bac630655fc110436ea1e11'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A signed-in user lands on a placeholder at `/` with no way to reach loans, wishlists or settings, and nowhere to start a scan. `/loans`, `/wishlists`, `/settings` and `/scan` do not exist, and the Link, the progress line and the full-screen task frame that later screens need have not been built (FR-23, UX-DR6, UX-DR7, UX-DR10, UX-DR12, UX-DR30, UX-DR31, UX-DR54).

**Approach:** A route group `(sections)` with one shared layout gives `/`, `/loans`, `/wishlists` and `/settings` the headings row and Scan book. A client `SectionNav` reads the pathname, puts the current section first and announces it. A `loading.tsx` in the group shows the new Progress line while a section streams. `/scan` is a full-screen task outside the group, with a heading and the Close (X), and it slides in through React's `<ViewTransition>`. X slides it away through a view transition it starts itself. The Link components are built here and reused later.

## Boundaries & Constraints

**Always:**
- **Sections, in fixed order:** collection `/`, loans `/loans`, wishlists `/wishlists`, settings `/settings`. A pathname belongs to the section whose path is equal to it or is followed in it by `/` (`/wishlists/3` → wishlists). Anything else falls back to collection.
- **Headings row:** sections are `text-heading-section-phone`, and `text-heading-section` at `wide:`, all through `ui-case`. The current one is an `<h1>` in `text-text` and leads the row. The other three follow it in fixed order, wrapping round (loans → wishlists, settings, collection). They are Next `<Link>`s in `text-text-dim` inside one `<nav>` with an accessible name. Gap `gap-6`, `wide:gap-7`. The row never wraps: it clips at the right edge (`overflow-hidden`, items `shrink-0`), on every width, with no horizontal page scroll.
- **Announcement:** a visually hidden `aria-live="polite"` element in `SectionNav` holds the current section's name. It is in the server HTML, so the first load announces nothing. A client section change replaces its text, and that is announced.
- **Scan book:** a Next `<Link href="/scan">` drawn as the primary button: the same classes as `Button` variant `primary`, through a shared `buttonClass()`, so no styles are duplicated. Under 900px it sits in a bar `sticky bottom-0` at the end of a full-height column, full width. The bar carries `data-pinned-bottom`, uses the page-margin-phone sides and `spacing-4` above, and `spacing-4` plus `env(safe-area-inset-bottom)` below, on `bg-background`. At `wide:` it sits at the top right of the header row, beside the nav. It is rendered twice, once per width, and the copy for the other width is `hidden`, so the accessibility tree has one.
- **Toast above the pinned bar:** under 900px, when the page contains `[data-pinned-bottom]`, the toast region is raised by the bar's height plus the safe area. `<main>` in the root layout gets `peer`, and the region gets a `max-wide:peer-has-[[data-pinned-bottom]]:` bottom offset. The bar height is the token `--spacing-pinned-bar` in `styles.css` (tap height plus `spacing-4` above and below).
- **Auth:** the group layout and each section page call `requireUser()`. It is cached per render, so a signed-out request redirects before anything streams.
- **Section pages:** collection, loans and wishlists render nothing below the row. Settings renders the existing `SignOutButton`, which moves off `/` to its spec home (EXPERIENCE.md, Settings) so that sign-out (1.16) does not regress. 1.23 owns the rest of Settings.
- **Progress line:** `ProgressLine` is a `stroke-control`-high `accent` bar moving across the top edge of the screen (`fixed`, top, full width, `role="progressbar"` with a translated label). Under `motion-reduce` it is a static full-width line. It is rendered by `(sections)/loading.tsx`. The motion is a `--animate-progress` keyframe token in `styles.css`.
- **Full-screen task frame (`FullScreenTask`):** `fixed inset-0` on `bg-background`, scrolling within itself. On wide screens the content is a centred column no wider than the new `--spacing-task-width` (430px, a large phone, per EXPERIENCE.md Responsive). It has a header with the `<h1>` title on the left and the existing `CloseButton` at the top right. The X closes: with a previous in-app entry it calls `router.back()`, otherwise `router.replace('/')` (spine, Navigation and history). "In-app entry" means the tab has pushed an entry since it loaded: `history.length` has grown past the value `NavigationTracker` (mounted once in the root layout) recorded at load. A replace does not count.
- **Task motion, entering:** `/scan/page.tsx` wraps the task in `<ViewTransition enter="task-enter" exit="task-exit" default="none">`. The Scan book Link carries `transitionTypes={['task-open']}`. The CSS lives in `styles.css`. `task-enter` slides the new snapshot in from the right over `--default-transition-duration` and `--default-transition-timing-function`. The `root` snapshots do not animate and blend `normal`. While `task-open` is active, the new `root` is hidden, so the section stays visible under the task as it slides in. `::view-transition` has `pointer-events: none`, so input is never blocked.
- **Task motion, leaving (decided by Mika 2026-10-09):** React renders a history traversal (popstate) synchronously, with no view transition, so the exit is made by hand for X.
  - **X going back:** X marks the task element `data-task-closing` (CSS: `view-transition-name: task-closing`). It starts `document.startViewTransition()`, whose update calls `router.back()` and resolves on the next animation frame after `popstate`, with a 1 s safety timeout. `::view-transition-old(task-closing)` slides out to the right over the same tokens, and the new root (the section) shows beneath it at once.
  - **X replacing to `/`:** a normal transition, so React's own `exit="task-exit"` plays the same slide.
  - **Without `document.startViewTransition`, or under `prefers-reduced-motion: reduce`:** X closes at once with no transition.
  - **Browser or system Back:** an immediate change, accepted as is.
  - **Reduce motion:** every view-transition animation is `none`.
- **Links (`components/Link.tsx`):** `TextLink` (Next `<Link>`) and `ActionLink` (`<button type="button">`) share `linkClass(destructive?)`. Both draw `text-text`, a `decoration-2` underline offset 3px, in `decoration-accent`, or `decoration-danger` when destructive, and keep `max-wide:min-h-tap` with inline-flex centring. `BackLink` is a `TextLink` in `text-meta`, labelled by its caller with the section it returns to.
- **Strings:** every new string goes in `messages/en.json` and `messages/fi.json` in sentence case: section names, the nav label, Scan book, the Scan heading, the task close label and the progress label.
- Tokens only. No inline styles, no `dark:` and no colour or size literals in components. Values a utility cannot name go in `styles.css`.

**Never:**
- No swiping and no `useSuspendSwipe()` (1.20). No PWA manifest or `viewport-fit` (1.21). No Settings content beyond the moved Sign out (1.23).
- No Scan content: no camera, no ISBN field, no lookup (Epic 3).
- No section-to-section slide and no list sweep (1.20 / enhancements).
- No animation library, no Base UI, no client-side REST.
- No return parameter in any address.
- No interception of browser Back (no Navigation API `navigate` handler): Back changes the screen at once.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Section of path | `/`, `/loans`, `/wishlists`, `/wishlists/3`, `/settings` | collection, loans, wishlists, wishlists, settings | — |
| Unknown path | `/loansx`, `/scan`, `''` | collection | fallback |
| Row order | current loans | loans, wishlists, settings, collection | — |
| Row order | current settings | settings, collection, loans, wishlists | — |
| Signed out | GET `/wishlists` | 307 to `/login?next=%2Fwishlists` | — |
| Close with history | opened `/scan` from `/loans` in-app | X → back to `/loans` | — |
| Close without history | `/scan` loaded directly | X → `/` (replace) | — |
| Close after sign-in redirect | signed out, `/scan` → `/login?next=%2Fscan` → sign in (replace to `/scan`) | X → `/` (replace), not out of the app | — |
| X going back, motion on | opened from `/loans` | one view transition whose `::view-transition-old(task-closing)` runs for 200 ms; then `/loans` | — |
| X, reduce motion | opened from `/loans`, reduced motion | `/loans` with no running view-transition animation longer than 0 ms | — |
| Browser Back | opened from `/loans`, `goBack()` | `/loans` at once | accepted: no slide |

</intent-contract>

## Code Map

- `src/app/(frontend)/page.tsx` -- DELETE. The placeholder with the `bookeh` h1 and `SignOutButton`. It is replaced by `(sections)/page.tsx`.
- `src/app/(frontend)/layout.tsx:29-37` -- root layout. Add `<NavigationTracker />` inside the providers and `className="peer"` on `<main>`. Keep `data-theme` from 1.18.
- `src/app/(frontend)/components/Button.tsx:3-20` -- the `outlines` map and the class string. Extract `export function buttonClass(variant)` and use it in `Button`. The Scan link uses it too.
- `src/app/(frontend)/components/CloseButton.tsx` -- existing X (1.17), reused as is in `FullScreenTask`.
- `src/app/(frontend)/components/SignOutButton.tsx` -- existing. It moves into `(sections)/settings/page.tsx`.
- `src/app/(frontend)/components/toast/ToastProvider.tsx:61-64` -- the region is `fixed … bottom-4`. Add the `max-wide:peer-has-[[data-pinned-bottom]]:bottom-[calc(...)]` offset using `--spacing-pinned-bar`, `--spacing-4` and `env(safe-area-inset-bottom)`.
- `src/app/(frontend)/styles.css:19-99` -- `@theme static`, which starts from `--*: initial`. Add `--spacing-pinned-bar`, `--spacing-task-width`, and `--animate-progress` with its `@keyframes` (Tailwind 4: keyframes inside `@theme`). After the `@layer base` block, add the view-transition rules: `::view-transition`, `root`, `.task-enter` / `.task-exit`, `:active-view-transition-type(task-open)` and the reduced-motion block. Durations come from the existing motion tokens.
- `src/lib/payload/context.ts:23-56` -- `requireUser()` (redirects with `next`) and `currentUser` (`cache`d per render). Read-only.
- `node_modules/next/dist/docs/01-app/02-guides/view-transitions.md:220-390` -- `<ViewTransition>` with `enter`, `exit` and `default`, put in the page and not the layout; `Link transitionTypes`; `pointer-events: none`; and the reduced-motion recipe. Read-only.
- `node_modules/next/dist/client/components/app-router.js:281-300` and `node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:23777` (`shouldAttemptEagerTransition`), `:18161` (`isViewTransitionEligible`) -- Next dispatches popstate inside `startTransition`, but React flushes a popstate transition synchronously, and a synchronous commit never starts a view transition. So `exit="task-exit"` plays only on a push or replace that leaves the task. X going back needs the hand-started transition; browser Back stays immediate. Read-only evidence.
- `src/app/(frontend)/components/navigation.ts` (from the re-applied attempt) -- `NavigationTracker` records `history.length` at load; `useCloseTask()` returns the back-or-replace close. The hand-started exit wraps its back branch.
- `src/app/(frontend)/components/FullScreenTask.tsx` (from the re-applied attempt) -- the frame and the X. It needs a ref or a marker on the outer `fixed inset-0` element, so X can set `data-task-closing` before the transition starts.
- `node_modules/@types/react/canary.d.ts` -- the `ViewTransition` types. The project does not reference them yet. Add `src/react-canary.d.ts` with `/// <reference types="react/canary" />`. Under Next, `react` resolves to its vendored canary, which exports `ViewTransition`. The installed `react@19.2.6` used by Vitest does not, so `ViewTransition` appears only in `scan/page.tsx`, which unit tests do not render.
- `tests/unit/controls.unit.spec.ts:1-30` and `tests/unit/toastView.unit.spec.ts:1-35` -- pattern for component unit tests: `renderToStaticMarkup(createElement(...))`, `classes()`, and "every class produces CSS" through `@tailwindcss/node` `compile`.
- `tests/unit/styles.unit.spec.ts` -- pins the tokens and compiled CSS. Extend it for the new tokens and view-transition rules.
- `tests/unit/messages.unit.spec.ts` -- already enforces equal key sets in en and fi.
- `tests/helpers/seedUser.ts` -- `seedTestUser()` and `cleanupTestUser()` with a fixed user. Give both an optional user parameter, so the new e2e uses its own email and does not race `admin.e2e`.
- `tests/e2e/frontend.e2e.spec.ts:4-10` -- the signed-out redirect test, which still has to pass.
- `src/app/(frontend)/login/LoginForm.tsx` -- the frontend sign-in that the e2e drives (Email, Password, Sign in).

## Tasks & Acceptance

**Execution:**
- `src/react-canary.d.ts` -- reference `react/canary` types -- `ViewTransition` typechecks.
- `src/app/(frontend)/styles.css` -- the tokens, the keyframes and the view-transition rules above -- one home for motion and sizes.
- `src/app/(frontend)/components/Button.tsx` -- `buttonClass()` -- shared by the Scan link.
- `src/app/(frontend)/components/Link.tsx` -- NEW `linkClass`, `TextLink`, `ActionLink`, `BackLink` -- DESIGN.md Link, Link destructive, Back link.
- `src/app/(frontend)/components/ProgressLine.tsx` -- NEW server-safe component taking `label` -- DESIGN.md Progress line.
- `src/app/(frontend)/components/sections.ts` -- NEW pure `SECTIONS` (key and href), `sectionOf(pathname)` and `sectionRow(current)` -- the matrix's first four rows.
- `src/app/(frontend)/components/SectionNav.tsx` -- NEW `'use client'`: `usePathname` → `sectionOf` → row, h1 plus links, the live region.
- `src/app/(frontend)/components/navigation.ts` -- NEW `'use client'`: `NavigationTracker` (records `history.length` at load) and `useCloseTask()`. `useCloseTask()` replaces to `/` with no pushed entry. With one, it goes back: inside a hand-started view transition with the task marked `data-task-closing`, or directly when `document.startViewTransition` is missing or reduced motion is set.
- `src/app/(frontend)/components/FullScreenTask.tsx` -- NEW `'use client'`: the frame, the title and the X calling `useCloseTask()` with the frame element.
- `src/app/(frontend)/styles.css` (motion part) -- `[data-task-closing] { view-transition-name: task-closing }` and `::view-transition-old(task-closing)` sliding out with the `task-slide` keyframes, reversed, over the motion tokens. Covered by the existing reduced-motion block. Correct the comments that claim X or Back plays `task-exit`.
- `src/app/(frontend)/(sections)/layout.tsx` -- NEW: `requireUser()`, a full-height column, a header (`SectionNav` plus the wide Scan link), `{children}`, and the phone Scan bar.
- `src/app/(frontend)/(sections)/loading.tsx` -- NEW: `ProgressLine`.
- `src/app/(frontend)/(sections)/page.tsx`, `loans/page.tsx`, `wishlists/page.tsx` -- NEW: `await requireUser()`, render `null`.
- `src/app/(frontend)/(sections)/settings/page.tsx` -- NEW: `requireUser()`, `SignOutButton` in the page margin.
- `src/app/(frontend)/scan/page.tsx` -- NEW: `requireUser()`, the `ViewTransition`-wrapped `FullScreenTask` titled from `scan.heading`, no content.
- `src/app/(frontend)/page.tsx` -- DELETE.
- `src/app/(frontend)/layout.tsx` -- `NavigationTracker`, `peer` on `<main>`.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- the pinned-bar offset.
- `messages/en.json`, `messages/fi.json` -- `sections.{label,collection,loans,wishlists,settings}`, `scan.{open,heading}`, `task.close`, `progress.loading`.
- `tests/unit/sections.unit.spec.ts` -- NEW: the matrix rows for `sectionOf` and `sectionRow`.
- `tests/unit/shell.unit.spec.ts` -- NEW: render `SectionNav` (mock `next/navigation` `usePathname` and next-intl `useTranslations`) for loans and collection: the h1 text and order, three links with hrefs and `text-text-dim`, the nav label, and the live region with `aria-live="polite"` holding the name. Render `TextLink`, `ActionLink` (plain and destructive) and `BackLink`: underline classes, `decoration-danger` and `text-meta`. Render `ProgressLine`: `role="progressbar"`, `bg-accent` and `motion-reduce:` classes. Render `FullScreenTask` (with `useRouter` mocked): the h1 and the X with its label. Every emitted class produces CSS.
- `tests/unit/styles.unit.spec.ts` -- the compiled CSS contains `--spacing-pinned-bar`, `--spacing-task-width`, `@keyframes progress`, `::view-transition-new(.task-enter)`, `::view-transition-old(.task-exit)` and a `prefers-reduced-motion` block setting view-transition animations to none.
- `tests/helpers/seedUser.ts` -- optional user parameter.
- `tests/e2e/sections.e2e.spec.ts` -- NEW: the acceptance criteria below, with its own seeded user signed in through `/login`.

**Acceptance Criteria:**
- Given a signed-in user at a 390px-wide viewport on `/loans`, when the page loads, then the nav shows "loans" first as the h1, followed by links for wishlists, settings and collection. The row's right edge is clipped, with no horizontal page scroll (`scrollWidth === clientWidth`). "Scan book" is a single visible link spanning the width between the phone page margins, its bottom edge 16px (`spacing-4`) above the viewport's bottom edge (the test browser has no safe area).
- Given the same user at 1280px, when `/` loads, then all four headings are visible in one row and "Scan book" sits at the top right, with its top above the nav's bottom edge and its right edge within the page margin.
- Given `/`, when the user clicks the "wishlists" heading, then the URL is `/wishlists`, the h1 reads "Wishlists" (CSS lowercase), and the live region text is "Wishlists".
- Given `/loans`, when the user clicks "Scan book", then the URL is `/scan`, the h1 "Scan" and a "Close" button show, and a view transition was started with the type `task-open`. When the user clicks Close, a view transition runs a 200 ms animation on `::view-transition-old(task-closing)`, and the URL is `/loans` again with the "Loans" h1. When the user opens Scan again and uses browser Back, the URL is `/loans` (no slide is asserted). When the user then goes to `/scan` directly and clicks Close, the URL is `/`.
- Given reduced motion emulated, when Scan opens and then Close is clicked, then neither step leaves a running `::view-transition` animation longer than 0 ms, and Close still lands on `/loans`.
- Given a signed-in user on `/settings`, then the "Sign out" button is present and signs out to `/login`.
- Given `npm run lint`, `npm run typecheck` and `npm run build`, then all pass.

## Spec Change Log

### 2026-10-09 — Exit motion re-decided (intent gap resolved by Mika)
- **Trigger:** review row `[high]` `[intent_gap]`: the exit slide never ran on X or browser Back. React renders popstate transitions synchronously, so `<ViewTransition exit>` cannot fire for a history traversal.
- **Decision (Mika):** X slides away by hand (option a). Browser and system Back change the screen at once.
- **Amended:**
  - Intent contract: "Task motion" is split into entering and leaving; the X "in-app entry" now means a pushed entry (`history.length`); one new Never; four new matrix rows.
  - Code Map: the popstate evidence is corrected.
  - Tasks: `navigation.ts`, `FullScreenTask.tsx`, and the motion part of `styles.css`.
  - The Scan and reduce-motion ACs.
  - Design Notes.
- **Known-bad state avoided:** a spec whose exit animation cannot run, and a pathname-based X fallback that leaves the app after the sign-in redirect.
- **KEEP:** everything in the re-applied attempt patch, including the five review patches already in it (the `history.length` X fallback, `mix-blend-mode: normal`, the disabled `ActionLink` look, the redirect and sign-in-then-Close e2e cases, and the `ToastProvider` and `loading.tsx` unit tests). It all passed verification. Only the exit mechanics change.

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 23 findings — high 1, medium 4, low 12, false 6, maybe-false 0
- outcome: an intent gap ends the pass. The `patch` rows below were applied by the implementation subagent and verified by their own tests. They were then reverted with all other code, per the intent-gap branch, and were kept in a saved patch, `spec-1-19-a22-section-shell.attempt.patch`. After Mika's decision the patch was re-applied unchanged and the file removed (see Spec Change Log).
- findings:
  - `[medium]` `[patch]` (blind) `NavigationTracker` sets `navigated` on any pathname change, including replace. Example: signed-out `/scan` goes to `/login?next=%2Fscan`, `LoginForm.tsx:26` calls `router.replace('/scan')`, and X then calls `router.back()` with no in-app entry behind, leaving the app. Confirmed in `LoginForm.tsx`. Patched: the tab's `history.length` is recorded when the tracker mounts, and X goes back only when the current length is greater.
  - `[medium]` `[patch]` (blind) The `root` snapshots keep the browser's `mix-blend-mode: plus-lighter` while both images exist. On X or Back (no `task-open` type) the two opaque roots add up, and the section washes out for the 200 ms slide. Patched: `mix-blend-mode: normal` beside `animation: none`, with the styles test updated.
  - `[low]` `[reject]` (blind) Only the Scan book link carries `task-open`, so Forward or a future `router.push('/scan')` slides the task over a blank page. Neither path is used today. A root rule cannot key off another group's class, so the fix is a design change for Epic 3's "back to scanner", not a direct correction.
  - `[low]` `[reject]` (blind) `/scan` has no `loading.tsx`, so tapping Scan book gives no progress line while it renders. On the tailnet the render is one auth plus an empty task. A loading boundary there turns the task's arrival into a Suspense reveal, which interacts with the `task-open` navigation type. That is more than a direct correction; it belongs with Epic 3, when Scan has content to wait for.
  - `[low]` `[reject]` (blind) Every route has the title "bookeh", so Next's route announcer is silent. The spec's own live region covers the required announcement (a section change, Accessibility Floor). Per-page titles are a feature, not a correction.
  - `[low]` `[reject]` (blind) Clipped heading links can take focus where it cannot be seen. Keyboard use is a wide-screen requirement, and at 900px and up all four headings fit in the tested layout. Scrolling the row to a focused link adds behaviour, and `overflow-hidden` was dropped because it cut off the focus ring.
  - `[low]` `[reject]` (blind) The e2e seeds an admin, so a plain `user` is never exercised. `requireUser()` checks no role, so nothing in this diff could pass for admins and fail for users. Adding a roles parameter guards against a regression nobody has shown.
  - `[low]` `[patch]` (blind) Missing tests: Back from `/scan`, the `task-exit` animation, the per-page guards for `/loans`, `/settings` and `/scan`, and `useCloseTask`. Grouped with the signed-out `/scan` row below. Patched in the saved patch: the e2e drives X and browser Back back to the section, signed-out redirects for four paths, and the sign-in-then-Close case. The exit-animation part became the intent-gap row below.
  - `[low]` `[patch]` (blind) `ActionLink` has no disabled look, although DESIGN.md Disabled applies to every control. Patched: `disabled:text-text-dim disabled:decoration-text-dim` in `linkClass`, asserted in the shell unit test.
  - `[medium]` `[patch]` (edge) The replace navigation sets `navigated`, so X leaves the app. Same root cause as the first row; same patch.
  - `[low]` `[reject]` (edge) A double tap on X before popstate commits calls `router.back()` twice. Not reproduced: `history.back()` on a cached route commits within milliseconds. The fix adds a guard for a state nobody demonstrated.
  - `[false]` `[reject]` (edge) Text scaling makes Scan book taller than 44px, so the toast overlaps it. All type tokens are px, so the text-size settings that apply to web content do not grow them, and page zoom scales the `calc` by the same factor. The button is max(44px, 39.5px) at any setting.
  - `[low]` `[patch]` (verification-gap) The toast region's raise class is tested only as a literal in styles.unit, never read from `ToastProvider`. Patched: the shell unit test renders `ToastProvider` and asserts the class on `role="status"`.
  - `[high]` `[intent_gap]` (verification-gap) Nothing tests the task's exit slide on X or Back. Adding the test showed the exit slide never runs. A probe of `startViewTransition` in Chromium recorded a transition when Scan opened, and none for X or for `page.goBack()`. The cause: React flushes a transition started inside a `popstate` event synchronously (`shouldAttemptEagerTransition()` in `node_modules/next/dist/compiled/react-dom/cjs/react-dom-client.development.js:23777`), and synchronous lanes do not qualify for a view transition (`isViewTransitionEligible = (lanes & 335544064) === lanes`, `:18161`). Both X (`router.back()`) and browser Back go through popstate. So the AC clause "slide … away on X or Back" is unmet, and the intent contract's Task motion rule (`exit="task-exit"` playing on X and Back) cannot be met as written. Choosing a replacement changes what the user sees on Back, so it is the user's decision. Attempted change saved, code reverted.
  - `[low]` `[patch]` (verification-gap) Signed-out access to `/scan` is not tested, and its page guard is the only one it has. Grouped with the missing-tests row; same patch.
  - `[low]` `[patch]` (verification-gap) Nothing renders `(sections)/loading.tsx`. Patched: the shell unit test renders it and matches the labelled progressbar.
  - `[medium]` `[patch]` (verification-gap, other) `useCloseTask` treats a replace navigation as in-app history. Same root cause as the first row; same patch.
  - `[false]` `[reject]` (intent) Settings shows Sign out rather than "nothing else". The clause covers sections without content. Sign out is 1.16 content whose spec home is Settings, and removing it would leave no way to sign out.
  - `[false]` `[reject]` (intent) A directly opened `/scan` closes to collection rather than "the section". With no section behind the task, the spine (Navigation and history) prescribes the fallback to `/`, which is collection.
  - `[false]` `[reject]` (intent) The current heading is not tappable. Tapping it would go where the user already is; the three others go to their sections, which is what the AC observes.
  - `[false]` `[reject]` (intent) Phone headings use `heading-section-phone`. DESIGN.md defines that role as the phone size of `heading-section`, and the existing pages use the same pair.
  - `[false]` `[reject]` (intent) The Close (X) is reused rather than built. It exists from 1.17 as DESIGN.md's Close, and the spine's rule is to build a component once and reuse it. This story places it top right in the task.
  - `[low]` `[reject]` (intent) Device-level surfaces are checked only as markup or CSS: the safe area, the spoken announcement, a real slow load, and clipping on narrow wide windows. The Back-driven exit is patched under the missing-tests row. The safe area cannot be observed before `viewport-fit` (1.21). The others need a device or assistive technology that the suite does not have.

### 2026-10-09 — Review pass (after the exit-motion decision)
- verdicts: 30 findings — high 0, medium 0, low 27, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) `history.length` misjudges in-app history after a reload on `/scan`, at the 50-entry cap, or after a bfcache return. X then lands on `/` (a section, the spine's fallback) instead of the section behind. Marking pushed entries in `history.state` or `sessionStorage` is a redesign, not a direct correction, and the cases are rare: a reload mid-task, a tab with 50 entries.
  - `[low]` `[patch]` (blind) Heading links are 41.8px high on the phone, below DESIGN.md's 44px tap area. Patched: `max-wide:min-h-tap` on the shared heading class, asserted in the shell unit test.
  - `[low]` `[reject]` (blind) Two quick taps on X can run `router.back()` twice. The window is from the click to popstate plus one frame (tens of ms), and during the slide `::view-transition` passes taps to the section. A guard for an undemonstrated double activation is not a direct correction.
  - `[low]` `[reject]` (blind) A cold first Scan book tap can lose `task-open` (the route commits twice while the task chunk loads), so the task slides over a blank page. Seen only on the dev server, never in `next start` runs. A fix independent of the type (preload, or a root marker) changes the design. Recorded under residual risks for Epic 3.
  - `[low]` `[patch]` (blind) No test checks the slide when X replaces to `/`. Grouped with the verification-gap row; same patch.
  - `[low]` `[patch]` (blind) `useCloseTask` has no tests for the missing-`startViewTransition` branch, the null task, the 1 s timeout or the `finally`. The missing-API branch is grouped with the verification-gap row and patched. The other three are defensive paths that no supported flow reaches; rejected, as testing them needs a router and DOM harness the unit lane lacks.
  - `[low]` `[patch]` (blind) The disabled assertion on `TextLink` cannot hold: `:disabled` never matches `<a>`. Patched: the row is dropped from the test, and `ActionLink` keeps the check.
  - `[low]` `[reject]` (blind) Only the bottom safe area is handled (no top, left or right insets). Every inset is 0 until `viewport-fit=cover` (1.21, a Never here), so nothing differs now. Story 1.21 must add the top inset (headers, X, progress line) and the landscape side insets when it sets `viewport-fit`. Recorded under residual risks.
  - `[low]` `[reject]` (blind) Focus falls to `<body>` when the task opens and closes. The Accessibility Floor's focus-return rule names the modal sheet, pickers and dialogs, not full-screen tasks, and Epic 3's Scan gives its ISBN field focus itself. Focus management is added behaviour, not a correction.
  - `[low]` `[reject]` (blind) Any `data-pinned-bottom` raises toasts by the Scan bar's fixed height. Only one pinned bar exists, so nothing overlaps today. The select-mode action bar story owns sizing its own offset.
  - `[low]` `[reject]` (edge) X activated twice before popstate. Same as the double-tap row; same reason.
  - `[false]` `[reject]` (edge) Taps during the 200 ms closing slide reach the section beneath. This is the intended behaviour: EXPERIENCE.md Motion says movements never block input, and the spec sets `::view-transition { pointer-events: none }` for it.
  - `[low]` `[reject]` (edge) The `history.length` cap, or a reload with forward entries, makes X replace to `/`. Same as the first row; same reason.
  - `[low]` `[reject]` (edge) If the traversal suspends or takes more than 1 s, the new snapshot still holds the task. Back goes to the section the user just came from, which the router cache holds, so the restore commits at once. Waiting on a commit signal is a redesign for a case not observed.
  - `[low]` `[reject]` (edge) Cold first tap loses `task-open`. Same as the cold-tap row; same reason.
  - `[low]` `[reject]` (edge) The e2e warms the chunk instead of testing the cold tap. A cold-tap assertion would pin a known dev-only race the spec does not fix. Recorded under residual risks.
  - `[low]` `[patch]` (edge) `TextLink` and `BackLink` disabled classes can never apply. Grouped with the `TextLink` assertion row; same patch. The classes on anchors stay inert.
  - `[low]` `[patch]` (verification-gap) The X's replace-to-`/` slide (`exit="task-exit"`) is never observed. Patched: the direct-load e2e waits for a 200 ms `::view-transition-old(` animation other than `task-closing`.
  - `[low]` `[patch]` (verification-gap) The X with no `startViewTransition` is never exercised. Patched: an e2e deletes the API, opens Scan from `/loans`, closes, and expects `/loans`.
  - `[low]` `[reject]` (verification-gap, other) The `history.length` cap and the bfcache return. Same as the first row; same reason.
  - `[low]` `[reject]` (intent) Motion assertions are at the View Transition API record level, in Chromium at 1280px: no direction, no section-beneath check, no phone width, no Safari. The replace branch is patched under the verification-gap row. Pixel-level and Safari motion need tooling the suite lacks.
  - `[low]` `[reject]` (intent) Spoken announcement is unverified, and arrival from `/scan` is silent. The live region's text change is what the browser exposes. Returning from a task is not a section change.
  - `[low]` `[reject]` (intent) The safe area is observable only after 1.21. Same as the safe-area row.
  - `[low]` `[patch]` (intent) Clipping at a narrow wide window is untested. Patched: a 900px e2e checks one-row headings, Scan book at the top right, and no page scroll.
  - `[low]` `[reject]` (intent) The progress line is never seen during a real load: the empty sections resolve at once. The component and its `loading.tsx` wiring are unit-tested, and Epic 5 sections will have real loads.
  - `[low]` `[reject]` (intent) Lowercase is checked only through the `ui-case` class, whose CSS `styles.unit` pins.
  - `[false]` `[reject]` (intent) Links are unused, and Close is reused rather than built. Carried from the first pass: built once for later stories, and Close exists from 1.17.
  - `[false]` `[reject]` (intent) Settings keeps Sign out. Carried from the first pass.
  - `[low]` `[reject]` (intent) The X fallback depends on capped `history.length`. Same as the first row.
  - `[low]` `[reject]` (intent) Taps are exercised as mouse clicks. Next `<Link>` handles both the same way; touch emulation adds nothing this story changes.

## Design Notes

**Why the current heading is an `h1` and not a link.** You are already in the current section, so tapping it has nothing to do. As an `h1` it gives each section page its heading, which screen readers and tests can find.

**Why `ViewTransition` and not a CSS animation on mount.** A mount animation cannot play on the way out: the route unmounts at once. React's `<ViewTransition>` snapshots both states, so the task slides in on a push. A transition type is needed only on the way in, to keep the section's old snapshot visible under the task.

**Why X starts its own transition.** React flushes a popstate transition synchronously, and sync commits never start a view transition, so `router.back()` alone cannot animate. A plain CSS slide before `back()` would uncover a blank page, since the section is not mounted under `/scan`. So X names the task (`data-task-closing`) and calls `document.startViewTransition(() => back and wait for popstate plus a frame)`. The old snapshot slides off while the new root, the section, is already underneath. Browser Back is left immediate by decision. The entering rules:

```css
::view-transition-old(root), ::view-transition-new(root) { animation: none; }
:root:active-view-transition-type(task-open)::view-transition-new(root) { visibility: hidden; }
::view-transition-new(.task-enter) { animation: task-slide var(--default-transition-duration) var(--default-transition-timing-function) both; }
::view-transition-old(.task-exit) { animation: task-slide var(--default-transition-duration) var(--default-transition-timing-function) both reverse; }
@keyframes task-slide { from { translate: 100% 0; } }
```

A browser without view transitions or transition types just swaps the pages, which is the documented fallback.

**The progress line loops** while a section loads. This is the one movement EXPERIENCE.md asks for during a wait, not decoration. Under reduce motion it is still.

**Rendering Scan book twice** with `hidden` per width keeps tab order and DOM order natural for both layouts. One element moved by CSS `order` would put focus order out of step with the visual order on one of them.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including the new `sections`, `shell` and `styles` cases.
- `npm run test:int` -- expected: all pass (no change expected; it guards the moved files).
- `npm run lint` and `npm run typecheck` -- expected: 0 errors.
- `npm run build` -- expected: success. This proves the view-transition CSS survives Tailwind and Lightning CSS, and that `ViewTransition` resolves.
- `npx playwright test tests/e2e/sections.e2e.spec.ts tests/e2e/frontend.e2e.spec.ts` -- expected: all pass against this worktree's own dev server. Confirm port 3000 is not served by another checkout first.

## Auto Run Result

Status: done

**Summary:** the section shell.
- **Sections:** `/`, `/loans`, `/wishlists` and `/settings` share one `(sections)` layout. The current section is the `h1` and leads a clipped headings row, and the others follow in fixed order, wrapping round. A section change is announced through a polite live region.
- **Scan book:** pinned full width at the bottom under 900px, with safe-area padding, and at the top right from 900px. It opens `/scan`, a full-screen task with a heading and the Close (X).
- **Motion:**
  - The task slides in over the section through React's `<ViewTransition>` and the `task-open` type.
  - X slides it away through a view transition it starts itself around `router.back()`, or through React's `task-exit` when it replaces to `/`.
  - Browser Back changes the screen at once (Mika's decision after the first run blocked).
  - Reduce motion makes every change immediate.
- **Loading:** sections show the progress line while they load.
- **Components:** the Link family is built (`TextLink`, `ActionLink` with a destructive variant, `BackLink`). The 1.17 Close is reused. Sign out moved to `/settings`.

**Files changed:**
- `src/app/(frontend)/(sections)/layout.tsx`: shell layout (auth, headings row, Scan book at both widths).
- `src/app/(frontend)/(sections)/loading.tsx`: the progress line while a section streams.
- `src/app/(frontend)/(sections)/{page,loans/page,wishlists/page}.tsx`: empty sections.
- `src/app/(frontend)/(sections)/settings/page.tsx`: Sign out.
- `src/app/(frontend)/scan/page.tsx`: the Scan task wrapped in `ViewTransition`.
- `src/app/(frontend)/page.tsx`: deleted (the placeholder).
- `src/app/(frontend)/components/sections.ts`: section list, `sectionOf`, `sectionRow`.
- `src/app/(frontend)/components/SectionNav.tsx`: headings row and live region.
- `src/app/(frontend)/components/navigation.ts`: `NavigationTracker` and `useCloseTask` (back or replace, with the hand-started exit).
- `src/app/(frontend)/components/FullScreenTask.tsx`: task frame, title, X.
- `src/app/(frontend)/components/Link.tsx`: `linkClass`, `TextLink`, `ActionLink`, `BackLink`.
- `src/app/(frontend)/components/ProgressLine.tsx`: the progress line.
- `src/app/(frontend)/components/Button.tsx`: `buttonClass()` extracted.
- `src/app/(frontend)/components/toast/ToastProvider.tsx`: toasts sit above the pinned bar on the phone.
- `src/app/(frontend)/layout.tsx`: `NavigationTracker`; `peer` on `<main>`.
- `src/app/(frontend)/styles.css`: pinned-bar and task-width tokens, progress keyframes, view-transition rules.
- `src/react-canary.d.ts`: `ViewTransition` types.
- `messages/en.json`, `messages/fi.json`: section, Scan, task and progress strings.
- Tests: `tests/unit/sections.unit.spec.ts` and `tests/unit/shell.unit.spec.ts` are new; `tests/unit/styles.unit.spec.ts` and `tests/unit/layout.unit.spec.ts` are extended; `tests/e2e/sections.e2e.spec.ts` is new; `tests/helpers/seedUser.ts` takes an optional user.

**Review findings:**
- **Pass 1 (23 findings).** This pass blocked on an intent gap: the exit slide could not run on popstate. Mika chose to slide away on X and leave Back immediate, and the spec was amended (Spec Change Log).
  - **Patched (applied and kept):**
    - X fallback through `history.length`, so the sign-in redirect no longer leaves the app (medium).
    - `mix-blend-mode: normal` on the root snapshots (medium).
    - Disabled look for `ActionLink`.
    - Redirect tests for `/loans`, `/settings` and `/scan`, and the sign-in-then-Close case.
    - Unit tests for the toast offset and `loading.tsx`.
  - **Rejected:** typed entry only through Scan book; no `/scan` loading boundary; per-page titles; focus on clipped links; admin-seeded e2e user; double-tap X; text scaling (false); five intent readings (false).
- **Pass 2 (30 findings).**
  - **Patched (all low):**
    - 44px tap height on the heading links.
    - E2E for the replace-to-`/` exit slide.
    - E2E for X without `startViewTransition`.
    - E2E at 900px.
    - Dropped an assertion that cannot hold (`TextLink` `:disabled`).
  - **Rejected:**
    - `history.length` edge cases (reload, 50-entry cap, bfcache): X lands on `/`, which is the fallback.
    - Double-tap X.
    - Cold first tap losing `task-open`.
    - Top and side safe areas (no effect before 1.21).
    - Focus management for tasks.
    - Generic pinned marker.
    - A slow traversal past 1 s.
    - Untestable perceptual surfaces.
    - Taps passing through during the slide (false, by design).
  - Reasons per finding are in the Review Triage Log.
- **Deferred:** none.

**Follow-up review: not recommended (`false`).** The final pass patched high 0, medium 0, low 5.

**Verification (final tree):**
- `npm run test:unit`: 419 passed.
- `npm run test:int`: 86 passed, 1 skipped.
- `npm run lint`: 0 errors; the 5 warnings are in untouched files.
- `npm run typecheck`: clean. `npm run build`: clean.
- `npx playwright test` (all specs, this worktree's dev server, port 3000 free): 27 passed.
- Matrix audit: every row has a test that ran and passed. Path and row rows in `sections.unit`; signed-out, close and motion rows in `sections.e2e`.

**Residual risks:**
- **Cold first tap.** On the dev server, the first Scan book tap on a fresh document can lose `task-open` while the task chunk loads, so the task slides over a blank page. This was not seen in `next start`, and the e2e warms the chunk. Revisit when Epic 3 makes Scan heavier.
- **Motion verified only in Chromium.** View-transition types need Safari 18+ and Chromium 125+; elsewhere the pages just swap.
- **Safe areas.** Only the bottom inset is handled, and it is 0 until 1.21 sets `viewport-fit=cover`. 1.21 must add the top inset (section header, task X, progress line) and the landscape side insets.
- **X fallback.** It relies on `history.length`. After a reload on `/scan` or in a 50-entry tab, X goes to `/` rather than back.
- **Finnish strings** (Kokoelma, Lainat, Toivelistat, Asetukset, Osiot, Skannaa kirja, Skannaa, Ladataan) are worth a read by Mika.
