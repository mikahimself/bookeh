# Epic 1 Context: Sign in to bookeh, in my language and theme

<!-- Compiled from planning artifacts. Edit freely. Regenerate with compile-epic-context if planning docs change. -->

## Goal

Mika opens bookeh, installed as a PWA, signs in and moves between the four sections (collection, loans, wishlists, settings), with Scan book always within reach. Settings holds display name, language, theme, profile and collection visibility, and sign out. It also lays the foundation those screens need (CI, ICU Postgres, test harness, layering lint, access helpers, `users`, context and gateway, errors, tokens, i18n, toasts), which every later epic builds on without rework.

## Stories

- Story 1.1: Bump Next.js, Payload and Node
- Story 1.2: GitHub repository and CI workflow
- Story 1.3: Postgres with Finnish ICU collation
- Story 1.4: Test harness
- Story 1.5: Remove the old collections and GraphQL
- Story 1.6: Layer import rules and strict `any`
- Story 1.7: Role helpers and `asRequestUser`
- Story 1.8: `users` collection
- Story 1.9: CI migration check
- Story 1.10: First-user seed
- Story 1.11: Request context and gateway in `lib/payload`
- Story 1.12: Errors and action results
- Story 1.13: Tailwind 4 and the design tokens
- Story 1.14: Interface text in English and Finnish
- Story 1.15: Open Sans
- Story 1.16: Sign in and sign out
- Story 1.17: Toasts
- Story 1.18: Device preferences and theme
- Story 1.19: Section shell
- Story 1.20: Swiping between sections
- Story 1.21: Installable PWA
- Story 1.22: Profile service
- Story 1.23: Settings
- Story 1.24: Profile and collection visibility

## Requirements & Constraints

- Every page needs a signed-in user (email and password). No self-registration, no email delivery, no password change in Phase 1. The account model must allow OAuth, open registration and email to be added later without migrating users.
- The profile holds display name, email (shown, not editable), interface language (`en` | `fi`), profile visibility (`public` | `hidden`, default hidden) and collection visibility (`open` | `closed`, default closed). The visibility settings change nothing else in Phase 1. Default location comes in Epic 3.
- The admin role does not read users' private data. Only `admin` may enter `/admin`.
- The app opens in the collection, with no home screen. It installs as a PWA on iOS and Android, opens standalone, has no service worker, and also works in desktop browsers.
- All interface text in English and Finnish. Each user picks their language.
- Finnish collation: å, ä, ö sort after z, in that order. Search will treat them as letters of their own, with no accent folding anywhere.
- Every story: both languages for every string, tokens only (no literals), the accessibility floor, and a component built by the first story that needs it and reused after. One concern per story, about 300 hand-written lines, one conventional commit.

## Technical Decisions

- **Versions:** Next.js 16.3.8, Payload packages 3.90.2, `node:22.23.3-alpine`, `postgres:16-alpine3.24`, Tailwind 4.3.3 with `@tailwindcss/postcss`, next-intl 4.14.9, Vitest 4.0.18, Playwright 1.58.2.
- **Layers and imports (ESLint-enforced):** `src/lib` never imports `src/app`. `src/collections` imports only `src/access` and `src/fields`. `lib/metadata` has no DB access. Client components import from `src/lib` only types and `lib/shelf/query.ts`. `app/(frontend)` uses `lib/payload` only for `requireUser`, `requireUserOrThrow` and types. `no-explicit-any` is an error (except `rawMetadata`), and `console.*` is banned: log through `payload.logger`.
- **Authorisation:** it lives only in collection access functions, and every collection declares all four operations explicitly. Roles are read only through helpers in `src/access` (`isAdmin`, `canEditShared`). Hooks query only through `asRequestUser(req)` (`req`, `req.user`, `overrideAccess: false`). For `users`: own doc read/update, admin reads all, create and delete admin-only, `roles` admin-writable. Session `tokenExpiration` is 30 days.
- **Context and gateway:** `requireUser()` returns a context holding the request and user, or redirects to `/login?next=<path>`. Actions and route handlers use `requireUserOrThrow()` (throws `UNAUTHENTICATED`). Gateway functions take a context and always pass its user and `overrideAccess: false`. The first-user seed in `onInit` is one of only three places allowed system privileges. The frontend never calls Payload REST or GraphQL, and GraphQL is disabled.
- **Migrations:** dev uses push. A schema story commits its migration under `src/migrations` and the regenerated `payload-types.ts`. Never run `payload migrate` on dev. Schema stories merge one at a time and regenerate their migration after a rebase. CI applies all migrations to an empty DB, tests with push off, and fails if a new migration would be generated. Migration history starts with the reworked model, and the old collections are deleted, not migrated.
- **Errors:** `src/lib/errors.ts` (imports nothing from the project) holds `DomainError`, the `ErrorCode` union (SCREAMING_SNAKE), `ActionResult<T>`, `runAction()` and `runRoute()`. Payload `Forbidden`/`NotFound` map to `NOT_FOUND`, `ValidationError` maps to `VALIDATION` with field errors, and anything else becomes `INTERNAL` with a log line. Actions return `ActionResult` and never redirect. Routes answer JSON with `no-store`, and 401 for `UNAUTHENTICATED`. The message key is `errors.<CODE>`.
- **i18n:** locale comes from the profile language, otherwise `Accept-Language`, falling back to `en`. No locale route segment. Dates and numbers go through next-intl with `Europe/Helsinki`. `<html lang>` follows the locale.
- **Styling:** DESIGN.md tokens live under their own names in `src/app/(frontend)/styles.css` only. Tailwind's default colour, radius, shadow and font scales are cleared. Dark values apply under `data-theme="dark"`, and under `prefers-color-scheme` when the theme is `system`. Don't use `dark:` utilities, CSS Modules, inline styles or literals.
- **Device preferences:** the `bookeh_prefs` cookie holds layout, size, theme and loans order (defaults: rows, m, system, by person). `devicePrefs()` lives in `src/app/(frontend)/prefs.ts`, and one server action writes the cookie. Preferences are never stored on the profile. Language is not a device preference.
- **Profile writes:** only through `lib/account` (`getProfile`, `updateProfile`). Display name is trimmed, NFC-normalised and required.
- **Tests:** run against `bookeh_test` only, using `createUser()` and `as(user)` from `tests/helpers/harness.ts`. Tests never truncate. Use `*.unit.spec.ts` (no DB) and `*.int.spec.ts`. Collection stories ship a two-user access test, and services ship integration tests. Tests never reach the network.
- **Config:** environment variables only, each listed in `.env.example` (for example `SEED_EMAIL`, `SEED_PASSWORD`).

## UX & Interaction Patterns

- **Look:** Metro-like. Nothing is filled, the coral accent appears only as lines, every corner is square (radius 0), and there are no shadows except on the detail panel. One typeface, Open Sans 300/400, self-hosted, with no bold. Headings, buttons and switches are lowercase through one CSS utility. Source strings stay in sentence case, and user-typed text is never lowercased.
- **Section shell:** the four headings sit side by side in `heading-section`. The current one is in `text` and leads the row; the others follow in fixed order, wrapping round, in `text-dim`. Under 900px the row runs off the right edge, sideways swipe changes section with wrap-round (ignored within 24px of an edge, suspended while an overlay or task is open), and Scan book is pinned full width at the bottom within safe areas. At 900px and up, Scan book sits at the top right. A section shows its heading at once and the progress line runs while it loads, with no skeletons.
- **Sign-in:** a wrong email or password both show "Wrong email or password." without saying which. Sign-in returns to `next` only for a same-origin path.
- **Components built in this epic:** Button (primary has the accent outline, secondary the text outline, destructive the danger outline, disabled is `text-dim`; one primary per layer), Text field (label above, underline, `danger` underline plus message on error), focus ring (2px `text` outline 3px outside, never the accent), Link (accent underline offset 3px, destructive variant, Back link), Close (X), Text switch (chosen in `text`, others in `text-dim`, switches at once with no confirm), and Toast (outlined box above anything pinned to the bottom, about 8 s on success, no timer on error, which starts with an 8px `danger` square, one at a time, X always present, announced via a live region).
- **Settings:** two columns on wide screens. The first holds profile, language (English / Suomi), theme (light / dark / system), the Profile and Collection switches, and Sign out as a secondary button. The second holds the managed lists that later epics add. One column on the phone. Display name saves on blur, and language and theme apply at once. Follow `mockups/key-settings.html` except that its third column is superseded.
- **Voice:** terse fragments, no pleasantries, no exclamation marks. Finnish is written natively.
- **Accessibility:** 4.5:1 contrast for text, 44px minimum tap height on the phone, full keyboard operation on wide screens, section name announced on change, nothing conveyed by colour alone.
- **Motion:** full-screen tasks, section changes and toasts slide in about 200–300 ms, never block input, and become immediate under reduce motion. No animation library.
- **Pending design choice:** the PWA icon and theme colour are not designed yet. Mika picks them from rendered options, and the choice is recorded in DESIGN.md.

## Cross-Story Dependencies

- Order within the epic: 1.1 → 1.2 → 1.9. 1.3 → 1.4 → 1.8. 1.5 → 1.6 and 1.7 → 1.8 → 1.10, 1.11, 1.14 and 1.9. 1.11 → 1.22 → 1.23 → 1.24. 1.13 → 1.15, 1.17, 1.18 and 1.21. 1.16 (needs 1.11, 1.13, 1.14) → 1.19 (needs 1.15) → 1.20 and 1.23. 1.12 → 1.17.
- 1.8 and 1.24 change schema: they merge one at a time with committed migrations.
- Later epics plug into this epic's pieces. `/scan` content arrives in Epic 3. The Scan task and the overlay wrappers register through `useSuspendSwipe()`. The Scan save toast needs a "hold until replaced" mode in the toast provider. Default location (Epic 3) and the managed lists (Epics 3, 5, 6 and 9) are added to Settings later.
- Epic 2 (production deploy) depends on CI and the pinned images from this epic.
