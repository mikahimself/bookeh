---
title: 'Story 1.23 [K5] Settings'
type: 'feature'
created: '2026-10-10'
baseline_revision: '32692db433f453147e1ee646726f503be9d1d3d9'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `/settings` holds only Sign out. Display name, language and theme have a service (1.22) and a cookie (1.18) but no screen, so the interface language and theme cannot be chosen from the app at all (FR-4, FR-51, UX-DR50).

**Approach:** Build the Settings section: a Profile group (display name saved on blur, email shown), a Language switch and a Theme switch, then Sign out, laid out as the first of two columns on wide screens and one column on the phone. Add `updateProfileAction` beside `signOutAction`, and the shared Text switch component. Language and theme switch optimistically: language writes the profile and refreshes the route; theme sets `data-theme` at once and writes the device cookie.

## Boundaries & Constraints

**Always:**
- The page reads the profile through `getProfile(ctx)` and the theme through `devicePrefs()`. Writes go only through `updateProfileAction` (→ `updateProfile`) and the existing `setDevicePrefsAction`. Frontend never touches `users` or `lib/payload` beyond `requireUser`/`requireUserOrThrow`.
- `updateProfileAction(changes: unknown)`: `runAction` → `requireUserOrThrow()` → strict parse (plain object; only `displayName` as string and/or `language` in `['en','fi']`; anything else, including extra keys, is `DomainError('VALIDATION')` with no write) → `updateProfile(ctx, parsed)` → returns `ActionResult<Profile>`. No redirect. Trim/NFC stays in the service.
- Display name: a `TextField` prefilled with the profile value, saved when the field loses focus and the normalised value differs from the last saved one; Enter blurs the field. A `VALIDATION` answer with `fields.displayName` shows `settings.displayNameRequired` under the field (danger underline, `aria-invalid`), and the typed text stays. Success shows the stored (normalised) value, no toast.
- Language switch: options English / Suomi (proper names, not lowercased). Tapping the other option marks it chosen at once, calls `updateProfileAction({ language })`, and on success calls `router.refresh()` from `next/navigation`, so the whole interface, `<html lang>` included, re-renders in the new language. On failure the previous option is restored.
- Theme switch: options light / dark / system (lowercased). Tapping sets `document.documentElement.dataset.theme` to the value and marks it chosen before calling `setDevicePrefsAction({ theme })`. On failure both revert. Nothing about theme is written to the profile.
- Every failure other than the display-name `VALIDATION`: `UNAUTHENTICATED` → `router.replace('/login?next=%2Fsettings')`; any other code → `useToast().show({ kind: 'error', code })`. A rejected promise (network) counts as `INTERNAL`, as in `SignOutButton`.
- Text switch (`components/TextSwitch.tsx`): `role="group"` with `aria-label`; one `<button type="button">` per option with `aria-pressed`; `text-control`; chosen `text-text`, others `text-text-dim`; no outline, underline or fill; `ui-case` unless `properNames`; `max-wide:min-h-tap`. Switches at once, no confirm.
- Layout: content under the shell's header, `px-page-margin-phone wide:px-page-margin`; on wide a two-column grid (`wide:grid wide:grid-cols-2`) whose first column holds Profile, Language, Theme and Sign out in that order; the second column is left to the managed lists of later stories (a comment, no placeholder markup). Group headings are `h2` in `text-heading-group text-text-muted ui-case`. Field width capped with `max-w-panel-width` as on `/login`.
- Email: label in `text-label text-text-muted`, value as text in `text-control`; never an input. No password field anywhere.
- All strings in `messages/en.json` and `messages/fi.json` under `settings`; `jsx-no-literals` holds.

**Never:** No change to `lib/account`, `lib/payload`, `Users.ts`, `prefs.ts`, `styles.css` or the toast store. No visibility switches (1.24), no default location, no managed lists. No `useOptimistic`, no form `action` prop (a form action resets the field), no `revalidatePath`/`refresh()` from `next/cache` in the actions (the client refreshes). No client-side cookie access. No success toast.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Name saved on blur | field `'  Mäki '` (decomposed ä), blur | action `{ displayName }` → `{ ok: true, data }`; field shows `'Mäki'` (NFC); row updated | — |
| Name unchanged | blur with the saved value (or only surrounding spaces) | no action call | — |
| Name blank | field `'   '`, blur | `{ ok: false, code: 'VALIDATION', fields: { displayName: 'VALIDATION' } }`; "Enter a name." under the field; row unchanged | message under field, no toast |
| Language | tap Suomi | option chosen at once; action `{ language: 'fi' }` ok; `router.refresh()`; h1 reads "Asetukset", `<html lang="fi">`; reload stays Finnish | — |
| Language fails | action answers `INTERNAL` | English chosen again; error toast | toast |
| Theme | tap dark | `data-theme="dark"` on `<html>` before the action answers; cookie written; reload serves `data-theme="dark"`; profile row unchanged | — |
| Theme fails | action answers `INTERNAL` | `data-theme` and the chosen option revert; error toast | toast |
| Bad action input | `'x'`, `null`, `{ id: 1 }`, `{ language: 'sv' }`, `{ displayName: 1 }`, `{ displayName: 'A', roles: ['admin'] }` | `{ ok: false, code: 'VALIDATION' }` (no `fields`), row unchanged | — |
| Empty changes | `{}` | `{ ok: true, data: <current profile> }`, no write | — |
| Signed out | no session, any input | `{ ok: false, code: 'UNAUTHENTICATED' }`, no write; client goes to `/login?next=%2Fsettings` | redirect |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/settings/page.tsx` -- REPLACE the Sign-out-only page. `const ctx = await requireUser()`, `getProfile(ctx)` from `@/lib/account/profile`, `devicePrefs()` from `../../prefs`, `getTranslations('settings')`. Keep `SignOutButton` last in the first column.
- `src/app/(frontend)/actions/account.ts` -- ADD `updateProfileAction(changes: unknown): Promise<ActionResult<Profile>>` beside `signOutAction`. Parse pattern: `parsePrefsPatch` in `src/app/(frontend)/prefs.ts:81-91` (plain-object check, unknown key → null) and `setDevicePrefsAction` in `actions/prefs.ts:20-31` (null → `DomainError('VALIDATION')`). Locale list: `locales` from `@/i18n/locale`.
- `src/lib/account/profile.ts` -- read-only. `Profile`, `ProfileChanges`, `getProfile(ctx)`, `updateProfile(ctx, changes)`; blank name throws `VALIDATION` with `fields.displayName`.
- `src/app/(frontend)/components/TextField.tsx` -- read-only. Takes `value`, `onChange`, `onBlur`, `onKeyDown`, `error`; draws the message under the field.
- `src/app/(frontend)/components/Button.tsx`, `SignOutButton.tsx` -- read-only. `SignOutButton` shows the action-call pattern: `useTransition`, `.catch(() => ({ ok: false, code: 'INTERNAL' }))`, `UNAUTHENTICATED` → `router.replace`.
- `src/app/(frontend)/components/toast/ToastProvider.tsx:26-30` -- `useToast().show({ kind: 'error', code })`.
- `src/app/(frontend)/components/SectionNav.tsx` -- read-only; shows the chosen/dim class pair (`text-text` / `text-text-dim`) and `ui-case`.
- `src/app/(frontend)/styles.css` -- read-only. Tokens in use: `text-heading-group`, `text-control`, `text-label`, `max-w-panel-width`, `gap-7`, `wide:` breakpoint, `ui-case`, `max-wide:min-h-tap`. Any value other than `light`/`dark` on `data-theme` means "follow the OS".
- `src/app/(frontend)/layout.tsx:44-47` -- read-only. `<html lang={await getLocale()} data-theme={theme}>`: a `router.refresh()` re-renders both.
- `src/lib/payload/context.ts:22-26` -- read-only. `currentUser` is React `cache`; `router.refresh()` is a new request (`node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:46`), so the cached user never spans a language change. Closes the 1.22 deferral.
- `node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:510-512` -- read-only evidence: a cookie set in a server action re-renders the page and layouts in the same round trip, client state preserved. Theme needs no refresh.
- `messages/en.json`, `messages/fi.json` -- ADD `settings` namespace; `tests/unit/messages.unit.spec.ts` enforces key parity.
- `tests/unit/controls.unit.spec.ts` -- extend with `TextSwitch` (renderToStaticMarkup + Tailwind `build` check pattern).
- `tests/unit/shell.unit.spec.ts:13-35` -- mocking pattern for a page render: `next/navigation`, `next-intl` translator over `en.json`, `next-intl/server`, `@/lib/payload/context`.
- `tests/int/devicePrefs.int.spec.ts` -- pattern for an action int test: `vi.mock('next/headers')`, login token in a `cookie` header, `createUser()`, unscoped `payload.findByID` for unchanged rows.
- `tests/e2e/sections.e2e.spec.ts:46-56,290-298` -- `signIn(page)` helper and the existing Settings Sign out test; own `TestUser` per spec via `seedTestUser`/`cleanupTestUser` (`displayName: 'E2E Admin'`, `language: 'en'`).
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the 1.22 entry ("check that changing the language … re-renders") gets a `decided:` line.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/mockups/key-settings.html` -- look reference: group heading, label/value, switch row, Sign out; third column superseded.

## Tasks & Acceptance

**Execution:**
- `messages/en.json`, `messages/fi.json` -- add `settings`: `profile` (Profile / Profiili), `displayName` (Display name / Näyttönimi), `displayNameRequired` (Enter a name. / Anna nimi.), `email` (Email / Sähköposti), `language` (Language / Kieli), `languages.en` (English / English), `languages.fi` (Suomi / Suomi), `theme` (Theme / Teema), `themes.light` (Light / Vaalea), `themes.dark` (Dark / Tumma), `themes.system` (System / Järjestelmä).
- `src/app/(frontend)/actions/account.ts` -- add `parseProfileChanges(value: unknown): ProfileChanges | null` (exported for tests) and `updateProfileAction`.
- `src/app/(frontend)/components/TextSwitch.tsx` -- new, `'use client'` (it takes `onChange`). Props: `label`, `value`, `options: readonly { value; label }[]`, `onChange`, `properNames?`.
- `src/app/(frontend)/(sections)/settings/report.ts` -- new `'use client'` hook `useReportFailure(): (code: ErrorCode) => void` (toast, or `/login?next=%2Fsettings` for `UNAUTHENTICATED`); shared by the three controls.
- `src/app/(frontend)/(sections)/settings/DisplayNameField.tsx` -- new `'use client'`; `{ initial: string }`; blur-save rules from the contract.
- `src/app/(frontend)/(sections)/settings/LanguageSwitch.tsx` -- new `'use client'`; `{ initial: Profile['language'] }`; `TextSwitch` with `properNames`; refresh on success.
- `src/app/(frontend)/(sections)/settings/ThemeSwitch.tsx` -- new `'use client'`; `{ initial: DevicePrefs['theme'] }`; options from `THEMES`.
- `src/app/(frontend)/(sections)/settings/page.tsx` -- compose the groups and the grid.
- `tests/unit/controls.unit.spec.ts` -- `TextSwitch`: a labelled group of `type="button"` options with `aria-pressed`, chosen `text-text`, others `text-text-dim`, `text-control`, `max-wide:min-h-tap`, `ui-case` present unless `properNames`; its classes produce CSS.
- `tests/unit/settings.unit.spec.ts` -- new; render `await SettingsPage()` with `requireUser`, `getProfile`, `next/headers`, `next-intl`, `next/navigation` and `useToast` mocked. Assert: `h2`s Profile, Language, Theme in order; display name input prefilled; the email as text and in no `<input>`; no `type="password"`; the two switches with the stored option pressed; Sign out as the secondary button after the switches; grid classes `wide:grid`, `wide:grid-cols-2`; all classes produce CSS.
- `tests/unit/account.unit.spec.ts` -- new; `parseProfileChanges` rows of the matrix (bad input → `null`, valid → exact object, `{}` → `{}`).
- `tests/int/profileAction.int.spec.ts` -- new; `updateProfileAction`: name saved and NFC-normalised, blank → `VALIDATION` with `fields.displayName`, language `fi` persisted, each bad input → `VALIDATION` with the row unchanged (same `updatedAt`), `{}` → current profile, signed out → `UNAUTHENTICATED`.
- `tests/e2e/settings.e2e.spec.ts` -- new, own user `settings-e2e@bookeh.test`: (1) the page shows name, email as text, both switches, Sign out, and no password field; (2) clearing the name and blurring shows "Enter a name." under the field and `aria-invalid`; typing a name and blurring, then reloading, shows it; (3) Suomi: h1 "Asetukset" and `html[lang="fi"]` without a reload, and still after one; (4) dark: `html[data-theme="dark"]` at once, and in the server HTML after a reload; (5) an unchanged name (spaces around it included) makes no POST on blur; (6) an aborted language POST restores English and shows the error toast; (7) an aborted theme POST reverts `data-theme` and the option and shows the error toast; (8) with the session cookies cleared, a change lands on `/login?next=%2Fsettings`.
- `src/app/(frontend)/components/swipe.ts` -- (review patch) a touch that starts inside `input, textarea, [contenteditable]` is no gesture; `tests/e2e/swipe.e2e.spec.ts` gets a drag on the Display name field that stays on `/settings`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- on the 1.22 entry add `decided:` (the client calls `router.refresh()` after a language change, a new request, so the cached user never spans it; proven by the Settings e2e).

**Acceptance Criteria:**
- Given a signed-in user on `/settings` at 1280px, when the page renders, then Profile, Language, Theme and Sign out sit in the first of two grid columns; at 390px they stack in one column and the section row and pinned Scan book from the shell are unchanged.
- Given the repository, when `npm run lint`, `npm run typecheck`, `npm run test:unit`, `npm run test:int` and `npm run test:e2e -- tests/e2e/settings.e2e.spec.ts tests/e2e/sections.e2e.spec.ts` run, then all pass.
- Given `src/collections/Users.ts`, `src/lib/account/profile.ts` and `src/app/(frontend)/prefs.ts`, when the story is done, then `git diff` shows them unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-10 — Review pass
- verdicts: 32 findings — high 0, medium 1, low 24, false 7, maybe-false 0
- findings:
  - `[low]` `[patch]` Text typed during an in-flight blur-save is overwritten by the answer (blind) — `setValue(result.data.displayName)` ran unconditionally; patched: the field is replaced only while it still holds the exact string that was sent, `saved` is always set.
  - `[low]` `[reject]` No in-flight guard on the three controls; a second tap before the answer can land out of order (blind) — needs two taps inside one round trip and a reordering on top; a `pending` guard in three components is more than a direct correction for a case not met in everyday use.
  - `[false]` `[reject]` The NFC matrix row is not exercised, every `Mäki` is precomposed (blind) — `tests/int/profileAction.int.spec.ts:41` sends `'  Ma\u0308ki '` (bytes `61 cc 88`) and expects the precomposed `'Mäki'` (`c3 a4`); the unit parser test passes the string through by design.
  - `[low]` `[patch]` The settings e2e is order-dependent and leaks the renamed, Finnish user into later tests on a failure (blind) — patched: `seedTestUser` runs in `beforeEach`, the Suomi test no longer switches back, the no-call test fills the seeded name.
  - `[low]` `[patch]` The `decided:` line claims "without a reload" but the Suomi test would pass with a full reload (blind) — patched: a `window` marker set before the click is asserted after the Finnish heading appears.
  - `[low]` `[patch]` AC 1 (two columns at 1280px, one at 390px) is asserted only as class names (blind) — patched: an e2e measures the first column against the viewport at both widths and checks the pinned Scan book at 390px.
  - `[low]` `[reject]` `isPlainObject`, `isLocale` and `settled` are third copies (blind) — cosmetic; `prefs.ts` is off limits by spec, both `isLocale`s derive from the one `locales` tuple so they cannot diverge, and moving `settled` serves no caller yet.
  - `[low]` `[patch]` `enterKeyHint` missing although Enter saves (blind) — patched: `enterKeyHint="done"` on the field.
  - `[low]` `[patch]` `theme-color` after a theme change is unverified (blind) — verified by a throwaway Playwright run: after the action the head holds one meta, no media, `#14181D`; patched: that assertion is now in the dark e2e, closing 1.21's note to 1.23.
  - `[low]` `[reject]` The group label is announced twice, `h2` then `aria-label` (blind) — a redundancy, not a wrong announcement; `aria-labelledby` needs id plumbing through `Group`.
  - `[low]` `[patch]` `saved` starts unnormalised while the comparison normalises, so an untrimmed or NFD row posts on every blur (blind) — patched: `useState(() => normalise(initial))`.
  - `[low]` `[patch]` Stale response overwrites newer typed text (edge) — same root cause as the first blind row; patched with it.
  - `[low]` `[patch]` Stored name untrimmed or NFD makes every blur save (edge) — same root cause as the `saved` row; patched with it.
  - `[low]` `[reject]` Enter during an IME composition blurs mid-composition (edge) — English and Finnish names use no IME; not met in everyday use, and the guard is a new branch.
  - `[low]` `[reject]` Second language tap before the first answers reorders writes (edge) — same as the in-flight row; rejected with it.
  - `[low]` `[reject]` Second theme tap before the first answers reverts to a stale `previous` (edge) — same as the in-flight row; rejected with it.
  - `[low]` `[patch]` No `router.refresh()` after a theme change, so `theme-color` may lag (edge) — the harm does not occur: the action's cookie re-render updates `generateViewport` (probe showed `[[null, "#14181D"]]`); grouped with the `theme-color` assertion patch.
  - `[low]` `[reject]` No upper bound on display name length (edge) — the same ruling as 1.22: neither story nor PRD sets one; a limit is a new rule, not a correction.
  - `[low]` `[reject]` A switch action answering `VALIDATION` or `NOT_FOUND` toasts a field message with nothing marked (edge) — reachable only when the user's own row disappears mid-session (parse rejects bad input first, and a valid locale passes the select); the toast still reports a failure.
  - `[low]` `[patch]` The settings e2e needs a per-test reset (edge) — same root cause as the order-dependence row; patched with it.
  - `[false]` `[reject]` Spec claim: the parser was to live in `actions/account.ts` (edge) — a `'use server'` module may export only async functions; `account.ts:9` imports `parseProfileChanges` by name, so a reader is pointed at the file.
  - `[false]` `[reject]` Spec claim: `ThemeSwitch` was to read `THEMES` itself (edge) — `prefs.ts` imports `next/headers`, which a client component cannot; `options` is a required prop, so TypeScript stops a caller from omitting it.
  - `[low]` `[patch]` The display-name field's non-blank failure path (toast / sign-in) has no test (verification-gap) — patched: an aborted name-save POST now asserts the error toast, the kept text and no `aria-invalid`.
  - `[low]` `[patch]` Nothing clicks an already-pressed option, so the `if (!chosen)` guard is unproven (verification-gap) — patched: the no-call e2e clicks the pressed English and System options and asserts no POST.
  - `[false]` `[reject]` "Switches at once" vs. option-then-refresh (intent, a) — the user-visible surface changes without a reload, as the Suomi e2e proves; the pressed option is part of the instant switch and the extra round trip is the deliberate 1.22 resolution.
  - `[false]` `[reject]` Theme change never re-reads the `users` row (intent, b) — `ThemeSwitch` calls only `setDevicePrefsAction`, whose int test "leaves the user document untouched" (`tests/int/devicePrefs.int.spec.ts`) asserts exactly that.
  - `[low]` `[patch]` Two viewports untested (intent, c) — same root cause as the AC 1 row; patched with it.
  - `[low]` `[patch]` `theme-color` after a theme change not exercised (intent, d) — grouped with the `theme-color` assertion patch.
  - `[medium]` `[patch]` A sideways drag starting inside the Display name field changes section on the phone (intent, e) — real: `swipe.ts` listens on `document` with no target check, and 1.20's spec left the exclusion to 1.23; patched: `onStart` ignores a touch that starts inside `input, textarea, [contenteditable]`, with an e2e drag on the field that stays on `/settings`.
  - `[false]` `[reject]` The 1.22 cache question is settled by argument plus e2e (intent, f) — descriptive, no defect: the refresh is a new request by the Next docs and the e2e shows the new language renders.
  - `[low]` `[reject]` `sprint-status.yaml` still says `backlog` (intent, g) — the close-out is a separate chore commit by this repository's convention (`32692db`, `6b73522`); not part of the diff.
  - `[false]` `[reject]` Small spec-literal deltas: parser file, `options` prop, `'   '` instead of clearing (intent, h) — the first two are the edge claims above; `'   '` reaches the same blank branch in the service as an empty string.

## Design Notes

- **Why the client refreshes after a language change.** The 1.22 deferral asked whether React `cache` in `currentUser()` spans a server action and the re-render Next does in the same response. `router.refresh()` is a separate request by the docs, so the question does not arise, and the one extra round trip only happens on a language change.
- **Why the theme is set on the root first.** The cookie is `httpOnly`, so the client cannot read it, but it owns the attribute: setting `dataset.theme` is the "applies at once" rule, and the action's cookie makes the server's next layout render agree (1.18 design notes).
- **Why `aria-pressed` buttons, not radios.** A radio group expects arrow-key movement and one tab stop; three plain buttons in a labelled group are fully keyboard operable with Tab alone and announce their state, which also means the chosen option is not conveyed by colour alone.
- **One message for the one rejection.** The service rejects only a blank name, so the field shows a specific line rather than the generic `errors.VALIDATION`; other failures are not about the field and go to the toast.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors (the 7 pre-existing warnings may remain).
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass, including `controls`, `settings`, `account`, `messages`.
- `npm run test:int` -- expected: all pass, including `profileAction.int.spec.ts`.
- `npm run test:e2e -- tests/e2e/settings.e2e.spec.ts tests/e2e/sections.e2e.spec.ts` -- expected: all pass against the running dev server (`reuseExistingServer`).

**Manual checks (if no CLI):**
- On a phone-width window, tap Suomi: the headings row reads "asetukset kokoelma lainat toivelistat" with no reload flash of the old language; tap dark: colours change before the network answers.

## Auto Run Result

Status: done

**Summary:** `/settings` is the Settings section. The page reads the profile through `getProfile(ctx)` and the theme through `devicePrefs()`, and lays out Profile (display name saved on blur, email as text), Language, Theme and Sign out as the first of two grid columns on wide screens, one column on the phone. `updateProfileAction` validates its input strictly and writes through `updateProfile`. The language switch is optimistic and calls `router.refresh()` on success, so the whole interface re-renders in the new language in a fresh request; the theme switch sets `data-theme` on `<html>` before the cookie action answers. The shared Text switch is built. A sideways drag that starts in a text field no longer changes section.

**Files changed:**
- `src/app/(frontend)/(sections)/settings/page.tsx` -- the composed page and grid.
- `src/app/(frontend)/(sections)/settings/DisplayNameField.tsx` -- blur-save, Enter blurs (`enterKeyHint="done"`), blank message under the field, stale-answer guard.
- `src/app/(frontend)/(sections)/settings/LanguageSwitch.tsx` -- optimistic option, `updateProfileAction`, `router.refresh()`, revert on failure.
- `src/app/(frontend)/(sections)/settings/ThemeSwitch.tsx` -- `dataset.theme` first, `setDevicePrefsAction`, revert on failure; takes `options` from the page because `prefs.ts` imports `next/headers`.
- `src/app/(frontend)/(sections)/settings/report.ts` -- `settled()` and `useReportFailure()` (toast, or `/login?next=%2Fsettings`).
- `src/app/(frontend)/components/TextSwitch.tsx` -- the Text switch: labelled group of `aria-pressed` buttons.
- `src/app/(frontend)/actions/account.ts` -- `updateProfileAction`.
- `src/app/(frontend)/profileChanges.ts` -- `parseProfileChanges` (a `'use server'` file may export only async functions, so it lives beside `prefs.ts`).
- `src/app/(frontend)/components/swipe.ts` -- touches starting on a text field are no gesture (review patch).
- `messages/en.json`, `messages/fi.json` -- the `settings` namespace.
- `tests/unit/controls.unit.spec.ts`, `tests/unit/settings.unit.spec.ts`, `tests/unit/account.unit.spec.ts` -- Text switch, page markup, parser.
- `tests/int/profileAction.int.spec.ts` -- the action against Postgres, every matrix row.
- `tests/e2e/settings.e2e.spec.ts` -- 10 cases: page contents, two widths, no-call on unchanged name and pressed option, blank and saved name, failed name save, dark (attribute, `theme-color` meta, served HTML), Suomi without reload (window marker) and after one, failed language, failed theme, cleared session.
- `tests/e2e/swipe.e2e.spec.ts` -- a drag starting on the Display name field changes nothing.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- the 1.22 locale question closed with `decided:`.

**Review findings (32):** 17 rows patched as 10 entries, 0 deferred, 15 rejected.
- Patched (verdicts: 1 medium, 9 low): stale save answer overwriting typed text; `saved` initialised unnormalised; `enterKeyHint`; swipe starting in a text field (medium); e2e order dependence; "without a reload" proof; two-width layout e2e; `theme-color` assertion; failed name-save e2e; pressed-option no-call e2e.
- Rejected, each with its reason in the triage log: in-flight guards on the three controls (three rows: two taps in one round trip, guards in three components); the NFC test (false: the input bytes are decomposed); duplicated predicates (cosmetic, `prefs.ts` off limits); double group label (redundancy, needs id plumbing); IME Enter (no IME for en/fi); length bound (new rule, as in 1.22); switch `VALIDATION`/`NOT_FOUND` toast wording (reachable only when the user's own row disappears); two spec-claim rows (false: the import and the required prop point the reader); "at once" reading (false: proven without reload); profile row after a theme change (false: covered by `devicePrefs.int.spec.ts`); the cache question (descriptive); sprint status (separate chore by convention); spec-literal deltas (false).

**Follow-up review recommended:** false. First pass; one `medium` entry patched (the swipe exclusion, covered by an e2e) and no `high`.

**Verification:**
- `npm run lint`: 0 errors, 5 pre-existing warnings.
- `npm run typecheck`: clean.
- `npm run test:unit`: 21 files, 541 tests passed.
- `npm run test:int`: 13 files passed, 1 skipped (`migrationSchema`, CI only), 97 tests.
- `npm run test:e2e -- settings sections swipe`: 28 passed before the three restored cases; `settings.e2e.spec.ts` alone afterwards: 10 passed.
- Prettier check on every changed source, test and message file: clean.
- Matrix audit: every I/O Matrix row has a test that ran and passed (int for the action rows; e2e for the browser rows, failures through aborted POSTs; the no-call row and the cleared-session row by e2e).
- Hand probe (throwaway Playwright run, not committed as such): after the theme action the head holds one `theme-color` meta, `#14181D`; now asserted in the dark e2e.

**Residual risks:**
- Two taps on a switch inside one round trip can land out of order; the last tap wins in the normal case and no guard was added (rejected as low).
- A display name has no length bound (same ruling as 1.22).
- `sprint-status.yaml` still lists the story as `backlog`; closing it out is the separate chore commit this repository uses.
