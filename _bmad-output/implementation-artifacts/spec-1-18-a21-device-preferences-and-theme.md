---
title: 'Story 1.18 [A21] Device preferences and theme'
type: 'feature'
created: '2026-10-09'
status: 'done'
baseline_revision: '15b0d28243bef489b912d8a4300e6493601d849d'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-1-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Layout, size, theme and loans order have nowhere to live, so no screen can remember them per device, and the root element has no `data-theme`: the dark tokens apply only through the OS preference, and a chosen theme could not reach the first paint (spine, Device preferences; Styling).

**Approach:** One cookie, `bookeh_prefs`, holds the four preferences. `devicePrefs()` in `src/app/(frontend)/prefs.ts` reads it at render with a per-field fallback to the defaults. One server action, `setDevicePrefsAction`, validates a partial update, merges it over the current values and writes the cookie. The root layout renders `<html data-theme={theme}>` from it, so the server's HTML already has the right colours.

## Boundaries & Constraints

**Always:**
- **Values and defaults** (spine; EXPERIENCE.md Collection controls, Loans, Settings):
  - `layout`: `'rows' | 'covers'`, default `rows`
  - `size`: `'s' | 'm' | 'l'`, default `m`
  - `theme`: `'light' | 'dark' | 'system'`, default `system`
  - `loans`: `'person' | 'date'`, default `person`
- **Reading:** a missing, unreadable or unknown value falls back to the default **for that field only**; the other fields keep their stored values. Unknown extra keys are ignored. Reading never throws.
- **Cookie:** name `bookeh_prefs`; value `encodeURIComponent(JSON.stringify({ layout, size, theme, loans }))`, always all four fields; `path: '/'`, `maxAge` 400 days (the browser cap), `sameSite: 'lax'`, `httpOnly: true` (only the server reads it).
- **One writer:** `setDevicePrefsAction(patch)` in `src/app/(frontend)/actions/prefs.ts` is the only code that sets the cookie. It runs in `runAction()`, starts with `requireUserOrThrow()` (AD-2: only sign-in is exempt), and returns `ActionResult<DevicePrefs>` with the merged values. Server action input is untrusted: a patch that is not a plain object, has a key outside the four, or has a value outside its field's set fails with `VALIDATION` and writes nothing.
- **Theme on the root:** `src/app/(frontend)/layout.tsx` renders `data-theme` with the theme value as stored, including `system`. `styles.css` already applies dark under `[data-theme='dark']` and the OS preference under anything but `light`/`dark`, so it does not change.
- **Not on the profile:** nothing is read from or written to `users`; preferences survive sign-out because they belong to the device.

**Never:**
- No UI: no switches, no Settings page (1.23), no layout/size controls (E20), no loans switch (J5).
- No change to `styles.css`, the `users` collection, `lib/account` or the Payload admin.
- No client-side cookie reads or writes, no `localStorage`, no inline script for the theme.
- No interface language in this cookie (AD-15: it stays on the profile).
- No new Playwright lane: the existing tokens test is rewritten to drive the cookie.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| No cookie | — | `{ layout: 'rows', size: 'm', theme: 'system', loans: 'person' }` | — |
| Full valid cookie | `{ layout: 'covers', size: 'l', theme: 'dark', loans: 'date' }` | exactly those values | — |
| Partial cookie | only `{ theme: 'dark' }` | theme `dark`, other three defaults | — |
| One unknown value | `{ layout: 'covers', size: 'xl', theme: 'dark', loans: 'date' }` | size `m`; the other three kept | per-field fallback |
| Unreadable cookie | junk, bad percent-encoding, JSON scalar, `null`, array, wrong value types | all defaults | never throws |
| Write, signed in | current cookie `{ layout: 'covers', … }`, patch `{ theme: 'dark' }` | `{ ok: true, data }` with theme `dark` and the rest unchanged; cookie set with the attributes above | — |
| Write, empty patch | `{}` | `ok`, current values rewritten (expiry refreshed) | — |
| Write, bad patch | not an object, `{ font: 'x' }`, `{ theme: 'blue' }`, `{ theme: 1 }` | `{ ok: false, code: 'VALIDATION' }`, no cookie written | — |
| Write, signed out | no session | `{ ok: false, code: 'UNAUTHENTICATED' }`, no cookie written | — |
| Render | cookie theme `dark` / no cookie | `<html data-theme="dark">` / `<html data-theme="system">` in the server HTML | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/prefs.ts` -- NEW. Exports `DevicePrefs` type, `DEFAULT_PREFS`, `PREFS_COOKIE = 'bookeh_prefs'`, the cookie options, pure `parseDevicePrefs(raw: string | undefined): DevicePrefs` (per-field fallback), pure `parsePrefsPatch(value: unknown): Partial<DevicePrefs> | null` (null on any invalid shape, key or value), pure `serializeDevicePrefs(prefs): string`, and `devicePrefs(): Promise<DevicePrefs>` = `parseDevicePrefs((await cookies()).get(PREFS_COOKIE)?.value)`. Option sets as `as const` tuples with the union types derived from them. Pattern for decode-never-throws: `src/app/(frontend)/components/toast/flashCookie.ts` `decodeFlash`.
- `src/app/(frontend)/actions/prefs.ts` -- NEW `'use server'`. `setDevicePrefsAction(patch: unknown): Promise<ActionResult<DevicePrefs>>`: `runAction` → `await requireUserOrThrow()` → `parsePrefsPatch` (null → `throw new DomainError('VALIDATION')`) → `{ ...(await devicePrefs()), ...patch }` → `(await cookies()).set(PREFS_COOKIE, serializeDevicePrefs(next), cookieOptions)` → return `next`. Shape and imports as in `src/app/(frontend)/actions/account.ts`; the parameter is `unknown` because a server action's argument comes from the client.
- `src/app/(frontend)/layout.tsx:22-26` -- read `const { theme } = await devicePrefs()` and add `data-theme={theme}` to `<html>`. Calling `cookies()` makes the layout dynamic, which it already is through `getLocale()`.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md:74-87` -- read-only evidence: cookies can only be set in a server function or route handler, and a cookie set in a server action returns the re-rendered UI in the same round trip, so the new `data-theme` reaches the page without client code.
- `src/app/(frontend)/styles.css:95-123` -- read-only: the two dark blocks (`:root[data-theme='dark']` and the `prefers-color-scheme` block for `:root:not([data-theme='light'], [data-theme='dark'])`) already give `system` its meaning.
- `tests/unit/layout.unit.spec.ts:7-14` -- mocks `next/font/google` and `next-intl/server`; the layout now calls `cookies()`, so add `vi.mock('next/headers', …)` returning a store whose `get` reads a per-test cookie value.
- `tests/int/session.int.spec.ts:12-55` -- pattern for an action int test: `vi.mock('next/headers')`, a `cookieStore` spy, `createUser()` and logging in to get a session (`requireUserOrThrow` reads the `payload-token` from `headers()`; see `tests/int/context.int.spec.ts`).
- `tests/e2e/frontend.e2e.spec.ts:12-28` -- the tokens test sets `data-theme` by hand after load; rewrite it to set the `bookeh_prefs` cookie through `page.context().addCookies`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/prefs.ts` -- create types, defaults, codec, patch validation and `devicePrefs()` -- the single reader.
- `src/app/(frontend)/actions/prefs.ts` -- create `setDevicePrefsAction` -- the single writer.
- `src/app/(frontend)/layout.tsx` -- `data-theme` from `devicePrefs()` -- first paint in the right colours.
- `tests/unit/prefs.unit.spec.ts` -- every reading row of the matrix through `parseDevicePrefs`, the patch rows through `parsePrefsPatch`, a serialize/parse round trip, and `devicePrefs()` with `next/headers` mocked.
- `tests/int/devicePrefs.int.spec.ts` -- `setDevicePrefsAction`: signed-in merge over an existing cookie with the exact cookie name, value and options; empty patch; each bad patch gives `VALIDATION` with no `set` call; signed out gives `UNAUTHENTICATED` with no `set` call; the user document is unchanged afterwards (same `updatedAt`).
- `tests/unit/layout.unit.spec.ts` -- `<html>` gets `data-theme="dark"` from a cookie and `"system"` with none.
- `tests/e2e/frontend.e2e.spec.ts` -- rewrite the tokens test as below.

**Acceptance Criteria:**
- Given a browser with `bookeh_prefs` holding theme `dark` and an OS set to light, when it loads `/login`, then the HTML the server sends already has `<html … data-theme="dark">` and the computed `--color-background` is the dark value `#14181d`, with no script changing the attribute.
- Given no `bookeh_prefs` cookie and an OS set to dark, when it loads `/login`, then the root carries `data-theme="system"` and the dark values apply; with the OS set to light, the light values apply.
- Given `bookeh_prefs` holding theme `light` and an OS set to dark, when it loads `/login`, then the light values apply.
- Given a signed-in user, when `setDevicePrefsAction` stores a change, then the user's `users` document is unchanged (same `updatedAt`) and only the `bookeh_prefs` cookie was written.
- Given `npm run lint` and `npm run typecheck`, then both pass.

## Spec Change Log

## Review Triage Log

### 2026-10-09 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 13, false 3, maybe-false 0
- findings:
  - `[low]` `[reject]` The cookie value is URL-encoded twice: `serializeDevicePrefs` encodes and Next's serializer encodes again on `set` (`node_modules/next/dist/compiled/@edge-runtime/cookies/index.js:45`) — real but harmless: Next decodes once on read (`:60`) and `parseDevicePrefs` once more, and both the once- and twice-encoded forms parse because the JSON holds no `%`. The value passed to `set` is exactly what the intent contract's Cookie line prescribes, so dropping a layer means changing the contract; it costs a few bytes and readability in devtools.
  - `[low]` `[patch]` No test observes the real write → read path (the int store is a spy; the e2e seeds a once-encoded value the writer never produces) — patched: a unit test round-trips `serializeDevicePrefs` through Next's real `ResponseCookies` → `RequestCookies` into `parseDevicePrefs`; the e2e seeds the exact wire value the writer sends.
  - `[low]` `[reject]` The cookie expires after 400 days with nothing renewing it — any later change of any preference renews it, a lapse only returns that device to the defaults, and renewal on read needs a client round trip (server components cannot set cookies); more than a direct correction for a 13-month edge.
  - `[low]` `[reject]` `PREFS_COOKIE_OPTIONS` sets no `secure` — the value is four display choices, not a credential, and it is `httpOnly`/`lax`; a production-only `secure` adds an environment branch and belongs with Story 2.2's cookie hardening (deferred from 1.16 for the session cookie).
  - `[low]` `[reject]` `prefs.ts` holds both `next/headers` and the option lists a future client switch may want — no client component imports it today, and such an import fails loudly at build ("next/headers" in a client component), so it cannot slip through; the Settings story can split the pure part when it needs it (same reasoning as 1.17's `server-only` finding).
  - `[low]` `[reject]` The "applied without client code" re-render after the action is untested, and the old e2e runtime `data-theme` swap check is gone — no caller of the action exists yet, so the round trip has no surface; the Settings story (1.23) that adds the switch owns that check. The CSS selectors the old swap exercised are pinned by `tests/unit/styles.unit.spec.ts`, and the new e2e proves them through server-rendered attributes for all three values.
  - `[low]` `[reject]` The e2e grows from one tokens test to five, beyond the spine's "Playwright covers only scan-to-save and shop check" — the story's first-paint criterion lives at the browser, the spec's ACs name these three cases, they replace the existing tokens test in the same file, and they need no database.
  - `[low]` `[patch]` No int test writes over an unreadable cookie, the repair path — patched: a junk stored value plus `{ theme: 'dark' }` gives defaults with `dark` and one clean four-field write.
  - `[low]` `[reject]` Two writes in flight at once (two tabs) can lose one patch (last write wins) — one user, a race needing two preference changes within one round trip; the fix (client-side full state or a write queue) is new design, not a correction.
  - `[low]` `[reject]` Double encoding (verification-gap layer, other findings) — same finding as the first row; same reason.
  - `[low]` `[patch]` Intent alignment: the e2e cookie is injected by `addCookies`, not written by the action — grouped with the write → read patch above: the seeded value is now the writer's wire format.
  - `[low]` `[patch]` Intent alignment: the action is never driven through Next's real server-action path and `Set-Cookie` — grouped with the same patch: the `ResponseCookies` round trip covers the `Set-Cookie` serialization; the full server-action round trip has no caller until 1.23.
  - `[false]` `[reject]` Intent alignment reading R2: "remembered on each device" is not user-observable because no control exists — the story's ACs name no control, STORY-SLICING classes A21 as Setup ("the cookie, `devicePrefs()`, its action, and the theme attribute"), and the controls are E20, J5 and 1.23.
  - `[false]` `[reject]` Intent alignment reading R3(b): layout, size and loans are not used at render — the AC asks that `devicePrefs()` reads the cookie when a page renders, which the layout does on every frontend page; their consumers are later stories.
  - `[low]` `[reject]` Intent alignment: no test asserts the `users` schema has no preference fields — the diff adds none and does not touch `src/collections/Users.ts`; the int test shows the action leaves the user document unchanged. A schema-absence test guards nothing this change introduced.
  - `[false]` `[reject]` Intent alignment: the writer requires a signed-in user, which the intent does not state — not a defect: AD-2 requires `requireUserOrThrow()` in every server action except sign-in.

## Design Notes

**`data-theme="system"` is rendered, not omitted.** The CSS treats any value other than `light` and `dark` as "follow the OS", so the attribute can always carry the stored value. That keeps the server HTML a direct reading of the cookie, and a later Settings switch only ever swaps one attribute value.

**No flash, by construction.** The theme is decided on the server from the request's cookie, so the first byte of HTML has the attribute; no inline script, `localStorage` or hydration step touches it. After `setDevicePrefsAction`, Next re-renders the layout in the same response, so the change is applied without client code.

**Per-field fallback.** A cookie written by a later version (a new size, a renamed value) must not reset the other three preferences, so each field is validated on its own. Writing is stricter: the client is our own code, so a bad patch is a bug and fails loudly with `VALIDATION` instead of being repaired.

**`httpOnly`.** Only the server reads the cookie, and the only writer is the action. A client component that wants instant feedback can set `document.documentElement.dataset.theme` itself without reading the cookie.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including `prefs.unit.spec.ts` and the updated `layout.unit.spec.ts`.
- `npm run test:int` -- expected: all pass, including `devicePrefs.int.spec.ts` (needs local Postgres).
- `npm run lint` and `npm run typecheck` -- expected: 0 errors.
- `npx playwright test tests/e2e/frontend.e2e.spec.ts` -- expected: all pass, including the rewritten tokens test.

## Auto Run Result

**Summary:** Device preferences live in one cookie, `bookeh_prefs`, and the theme reaches the first paint.
- **Reader:** `devicePrefs()` in `src/app/(frontend)/prefs.ts` reads the cookie at render. Each of the four fields (layout, size, theme, loans order) falls back to its default on its own — rows, m, system, by person — so one unknown value never resets the others. Unreadable cookies give the defaults and never throw.
- **Writer:** `setDevicePrefsAction(patch)` in `src/app/(frontend)/actions/prefs.ts` is the only code that sets the cookie. It requires a signed-in user (AD-2), rejects any unknown key or value with `VALIDATION` before writing, merges the patch over the current values and writes all four (`path=/`, 400 days, `lax`, `httpOnly`).
- **Theme:** the root layout renders `<html data-theme>` with the stored value, `system` included, so the server's HTML already carries the right colours; `styles.css` did not change. Nothing touches the profile.
- No control calls the action yet: the theme switch is Settings (1.23), layout and size are E20, the loans order is J5.

**Files changed:**
- `src/app/(frontend)/prefs.ts`: types, option sets, defaults, cookie name and options, `parseDevicePrefs`, `parsePrefsPatch`, `serializeDevicePrefs`, `devicePrefs()`.
- `src/app/(frontend)/actions/prefs.ts`: `setDevicePrefsAction`.
- `src/app/(frontend)/layout.tsx`: `data-theme` from `devicePrefs()`.
- Tests: `tests/unit/prefs.unit.spec.ts` and `tests/int/devicePrefs.int.spec.ts` are new; `tests/unit/layout.unit.spec.ts` gains the `data-theme` checks; in `tests/e2e/frontend.e2e.spec.ts` the tokens test, which flipped `data-theme` by hand, is replaced by five tests that drive the cookie.

**Review findings (1 pass, 16 findings):**
- **2 entries patched (both low, test-only):**
  - The real write → read path is now observed: a unit test sends the value through Next's own `ResponseCookies` → `RequestCookies` into `parseDevicePrefs`, and the e2e seeds the exact wire value the writer sends. Three findings shared this root cause.
  - An int test covers a write over an unreadable cookie, which is how a corrupted cookie gets repaired.
- **Nothing deferred.**
- **Rejected:** the cookie being URL-encoded twice (ours plus Next's on `set` — harmless, both forms parse, and the value passed to `set` is what the intent contract prescribes); no renewal of the 400-day expiry (any later change renews it; renewal on read needs a client round trip); no `secure` flag (non-sensitive, `httpOnly`; production cookie hardening is Story 2.2); `prefs.ts` mixing `next/headers` with option lists (no client importer; a wrong import fails loudly at build); the untested re-render after the action (no caller until 1.23); five Playwright tests against the spine's Playwright scope (they replace the existing tokens test and the ACs live at the browser); a lost patch from two writes in flight (one user, needs new design); no schema-absence test for `users` (the diff adds no fields); and three intent readings refuted by the ACs, STORY-SLICING A21 and AD-2. Reasons per finding are in the Review Triage Log.

**Follow-up review: not recommended (`false`).** First pass; patched entries by verdict: high 0, medium 0, low 2.

**Verification (on the patched tree):**
- `npm run test:unit`: 303 passed.
- `npm run test:int`: 86 passed, 1 skipped (`migrationSchema`, skipped locally as before).
- `npx playwright test tests/e2e/frontend.e2e.spec.ts`: 6 passed — a dark cookie under a light OS (attribute in the server HTML, dark token, dark painted background), a light cookie under a dark OS, no cookie under a dark and a light OS, the accent token, and the existing signed-out redirect.
- `npm run lint`: 0 errors; the 5 warnings were there before. `npm run typecheck`: clean.
- Matrix audit: every row has a test that ran and passed (reading rows in `prefs.unit.spec.ts`, write rows in `devicePrefs.int.spec.ts`, render rows in `layout.unit.spec.ts` and the e2e).

**Residual risks:**
- The action has no caller, so the server-action round trip (cookie set, layout re-rendered with the new `data-theme`) is first exercised by Settings (1.23), which should test it.
- The e2e seeds the cookie's wire format by hand (`prefs.ts` cannot be imported under Playwright because of `next/headers`); a change to the cookie format must update that line too — the unit wire test would catch the source side.
- A device that changes no preference for 400 days returns to the defaults.
