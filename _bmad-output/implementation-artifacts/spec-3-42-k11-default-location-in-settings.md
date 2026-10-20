---
title: 'Story 3.42: [K11] Default location in Settings'
type: 'feature'
created: '2026-10-20'
baseline_revision: '42dcf3a40d5564793f6f8f102446067ae303ad27'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** New owned copies land at `users.defaultLocation` (3.21, 3.34), but nothing in the product sets it. Settings has no Default location row, so every saved book has no location unless the admin sets one in the back office (FR-4, UX-DR50).

**Approach:** Add a Default location group to `/settings` with the 3.41 `Combobox` over the user's locations. Choosing a location, creating one by name, or clearing the field saves at once. A new server action resolves the `Ref` through `lib/copies` and writes the id through `lib/account`.

## Boundaries & Constraints

**Always:**
- **`lib/copies/locations.ts`** gains `listLocations(ctx): Promise<LocationOption[]>`, where `LocationOption = { id: number; name: string }`.
  - It returns the context user's own locations, sorted by `name` (database collation, Finnish ICU).
  - It reads through the gateway with `pagination: false`, `depth: 0` and `select: { name: true }`.
- **`lib/account/profile.ts`:**
  - `Profile` gains `defaultLocation: number | null`, always an id, never a populated row.
  - `ProfileChanges` gains `defaultLocation?: number | null`, passed to the write as given. `users.defaultLocation`'s `ownedRelation` rejects a foreign or missing id with a `ValidationError` on `defaultLocation`.
  - `getProfile` and `updateProfile` read and write with `depth: 0`.
  - `parseProfileChanges` stays as it is. `updateProfileAction` never accepts `defaultLocation`.
- **`setDefaultLocationAction(value: unknown)`** in `actions/account.ts`:
  - It runs inside `runAction()` and starts with `requireUserOrThrow()`.
  - It accepts `null` or a `Ref` checked by `parseRef`. Anything else is `VALIDATION` with no read or write.
  - For a `Ref`, it calls `resolveLocation(ctx, ref)` first, then `updateProfile(ctx, { defaultLocation })`.
  - It returns `{ defaultLocation: number | null; locations: LocationOption[] }`: the stored value and the fresh `listLocations`.
- **`parseRef(value: unknown): Ref | undefined`** in a new `src/app/(frontend)/ref.ts`:
  - It accepts a positive safe integer.
  - It also accepts a plain object whose only key is `create`, holding a string.
  - It does not trim and does not check for blanks. `resolveLocation` does both and fails with `VALIDATION` on `location`.
- **`DefaultLocationField`** (`settings/DefaultLocationField.tsx`, `'use client'`):
  - Props are `{ initial: number | null; locations: readonly LocationOption[] }`. It renders the `Combobox` with options `{ id, label: name }`.
  - It sets the value optimistically: a `{ create }` shows its name at once.
  - On success, it replaces both the options and the value with the action's answer, so a created location becomes a marked option.
  - On failure, it restores the previous value and calls `report(code)`.
  - Only the latest call's answer is applied. An earlier call that settles late changes nothing.
  - No `router.refresh()`.
- **Settings page:**
  - A `Group` headed `settings.defaultLocation` goes after Visibility and before Sign out. Its field label is `settings.defaultLocationLabel`, following the mock-up's "New copies go to".
  - `listLocations` joins the page's `Promise.all`.
- **Strings**, in both catalogues:
  - `settings.defaultLocation`: `Default location` / `Oletussijainti`.
  - `settings.defaultLocationLabel`: `New copies go to` / `Uudet kappaleet menevät`.

**Never:**
- No managed Locations list: no rename, merge, delete or "Add location". Those are the second column of a later story.
- No change to `Combobox`, `createCopy`, `resolveLocation` or the `Users` collection. No schema change and no migration.
- No transaction opened in the frontend: the lint rule allows only `requireUser*` from `lib/payload`. No new import between `lib/account` and `lib/copies`: the spine and ESLint forbid it.
- No toast on success, and no Undo.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Pick existing | Own locations Koti (1), Mökki (2); action `2` | Stored default is 2; answer `{ defaultLocation: 2, locations: [Koti, Mökki] }` | No error expected |
| Create new | Same; action `{ create: ' Työ ' }` | Location "Työ" created; stored default is its id; it appears in `locations` in name order | No error expected |
| Create existing name | `{ create: 'koti' }` | No new row; stored default is 1 | No error expected |
| No locations yet | No locations; `{ create: 'Koti' }` | Location created and stored as the default | No error expected |
| Clear | Default 1; action `null` | Stored default is `null` | No error expected |
| Foreign id | Another user's location id | `{ ok: false, code: 'VALIDATION', fields: { defaultLocation: 'VALIDATION' } }`; stored default unchanged | Field shows the previous value; error toast |
| Malformed | `'2'`, `{ create: 1 }`, `{ create: 'A', id: 1 }`, `0`, `1.5` | `{ ok: false, code: 'VALIDATION' }`; nothing written | Same |

</intent-contract>

## Code Map

- `src/lib/copies/locations.ts`: `resolveLocation(ctx, ref)`.
  - An id is returned unchecked.
  - A name is normalised, matched by `nameKey` or created, and blank fails `VALIDATION` on `location`.
  - Add `listLocations` and `LocationOption` here. `lib/copies` owns locations (spine, AD-18).
- `src/collections/Locations.ts`: `defaultSort: 'name'`, `ownerAccess`, and the generated interface `UserLocation`.
- `src/collections/Users.ts:48`: the `defaultLocation` field has self-only field access and the `ownedRelation` validator. This is the guard against a foreign id.
- `src/lib/account/profile.ts`: `Profile`, `ProfileChanges`, `toProfile`, `getProfile` and `updateProfile`. `toProfile` must map `defaultLocation` to `number | null`. Payload types it as `number | UserLocation | null | undefined`.
- `src/app/(frontend)/actions/account.ts`: `updateProfileAction`, the pattern for the new action.
- `src/app/(frontend)/profileChanges.ts`: the `isPlainObject` client-input pattern. `parseRef` follows it in its own file, because a `'use server'` file exports only async functions.
- `src/app/(frontend)/(sections)/settings/page.tsx`: `Group`, the `Promise.all` reads and the column layout.
- `settings/VisibilitySwitch.tsx`: the optimistic save, revert and `report` pattern, through `settleAction` and `useReportFailure` from `components/request.ts`.
- `src/app/(frontend)/components/ui/Combobox.tsx`: props `{ label, options: { id, label }[], value: Ref | null, onValueChange, error?, disabled? }`.
  - It re-syncs its text to `value` while closed. A `{ create }` value shows its name.
  - Clear, or emptying the text, emits `null`.
- `src/lib/payload/ref.ts`: `type Ref`. The frontend may import only types from `lib/payload` (`eslint.config.mjs:309`).
- `messages/en.json:14` and `fi.json`: the `settings` block. `tests/unit/messages.unit.spec.ts` checks key parity.
- Tests:
  - `tests/int/profileAction.int.spec.ts`: signs in through `payload.login` and mocks `next/headers`. Its `toEqual` profile shapes gain `defaultLocation: null`.
  - `tests/int/profile.int.spec.ts`: may compare whole profiles too.
  - `tests/unit/account.unit.spec.ts`: the `it.each` rejection pattern for client input.
- Worktree: Postgres on `localhost:5433` (container `bookeh-postgres-default-location`).

## Tasks & Acceptance

**Execution:**
- `src/lib/copies/locations.ts`: add `LocationOption` and `listLocations`.
- `src/lib/account/profile.ts`: add `defaultLocation` to `Profile`, `ProfileChanges`, `toProfile` and `updateProfile`, and read and write with `depth: 0`.
- `src/app/(frontend)/ref.ts`: new, `parseRef`.
- `src/app/(frontend)/actions/account.ts`: add `setDefaultLocationAction`.
- `src/app/(frontend)/(sections)/settings/DefaultLocationField.tsx`: new.
- `src/app/(frontend)/(sections)/settings/page.tsx`: add the group and the `listLocations` read, and update the JSDoc.
- `messages/en.json`, `messages/fi.json`: add the two keys.
- `tests/int/profileAction.int.spec.ts`:
  - Add a `setDefaultLocationAction` block covering every matrix row: Pick existing, Create new, Create existing name, No locations yet, Clear, Foreign id and the Malformed values. Rows may share a test where one sequence shows both.
  - Fix the existing profile shapes.
- `tests/unit/account.unit.spec.ts`: add `parseRef` accept and reject cases from the Malformed row.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: set `3-42-k11-default-location-in-settings` to its final status.

**Acceptance Criteria:**
- Given `/settings` for a signed-in user with locations Koti and Mökki, when the page loads, then a Default location group sits after Visibility. Its combobox shows the stored default's name, or is empty without one.
- Given that page, when the user types "mö" and chooses Mökki, then the field shows Mökki, a reload still shows Mökki, and the next scan save lands at Mökki.
- Given that page, when the user types "Työ" and chooses "New: Työ", then a reload shows Työ as the default, and Työ is listed with the marker in the popup.
- Given a default, when the user taps Clear, then a reload shows the field empty.
- Given a user with no locations, when the field is opened, then the popup offers no options, and typing a name offers only "New: {name}". Choosing it saves.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 15 findings — high 0, medium 0, low 10, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` (blind) Every failure reports through the toast, so `VALIDATION` reads "Check the marked fields." while nothing is marked. — Reached only by a crafted foreign id, a location deleted from another tab or the back office (Phase 1 has no delete in the product), or a name over 200 characters. Marking the field needs new state, a message and a `fields` branch. This is the same pattern as `VisibilitySwitch`.
  - `[low]` `[reject]` (blind) After a failure the options go back to the old stored list, and new props are ignored, so a location deleted elsewhere stays offered until a reload. — Nothing in the product deletes a location before the managed Locations list. The fix adds a re-fetch or a props re-sync for a back-office-only state.
  - `[low]` `[patch]` (blind) The Finnish label "Uudet kappaleet menevät" is an unfinished sentence. — Changed to "Uusien kappaleiden sijainti".
  - `[low]` `[reject]` (blind) `isPlainObject` now has three copies (`prefs.ts`, `profileChanges.ts`, `ref.ts`). — A four-line guard that is identical in all three files, so there is no divergence to name. Extracting it touches two files outside this story.
  - `[low]` `[patch]` (blind) The action's answer shape is written out in the action and again as `Stored` in the field. — One exported `DefaultLocationAnswer` type, used by both.
  - `[low]` `[patch]` (blind) The page keeps the one-call-at-a-time gateway rule only through a nested tuple inside `Promise.all` and a comment. — `Promise.all` holds only the reads that do not go through the gateway; `getProfile` and `listLocations` are awaited one after the other.
  - `[low]` `[reject]` (blind) No test covers a deleted location id. — It takes the same `ownedRelation` count-is-zero path as the foreign-id test, so the existing test already proves the `VALIDATION` answer. A test-only finding needs a reason (Tests convention).
  - `[low]` `[reject]` (edge-case) An id above the int4 maximum answers `INTERNAL`, not `VALIDATION`. — Only a crafted call reaches it, and it still writes nothing. The guard would add a magic bound that no other id input in the codebase carries.
  - `[low]` `[reject]` (edge-case) If `listLocations` throws after the profile write commits, the client reverts and shows an error. — This needs an infrastructure failure between two reads of one request. Handling it adds a branch, and the next page load shows the stored value.
  - `[false]` `[reject]` (edge-case) An older success that resolves after a newer one leaves `stored` stale. — Next dispatches server actions from the client one at a time (`node_modules/next/dist/docs/01-app/01-getting-started/07-mutating-data.md:207`), so answers arrive in call order.
  - `[low]` `[reject]` (verification-gap) No test runs `DefaultLocationField`'s replace, revert and latest-call logic. — The sibling `VisibilitySwitch` and `DisplayNameField` use the same pattern and have no test (Tests convention: functional minimum). The browser run checked that a created location becomes a marked option, which is the path that matters. Revert-on-failure needs a failure that no in-product path produces.
  - `[false]` `[reject]` (intent) The UI acceptance criteria have no automated test, and the diff shows no evidence of the manual check. — The implementation pass ran a scratchpad Playwright check of every acceptance criterion at 390×844 and 1280×800 (recorded below). The spine's Tests convention limits Playwright to scan-to-save and the shop check.
  - `[low]` `[reject]` (intent) The `Ref` is not resolved inside one transaction with the profile write, against spine line 252. — Lint allows neither a transaction in the frontend nor an import between `lib/account` and `lib/copies`, so one transaction would need a new layering decision. The only partial outcome is an own location that stays after an infrastructure failure. This is recorded as a residual risk.
  - `[false]` `[reject]` (intent) `Profile` changes shape for `updateProfileAction`'s callers. — The callers read named fields only. An extra `defaultLocation` key changes nothing a user sees, and the tests that compare whole shapes were updated.
  - `[false]` `[reject]` (intent) The mock-up places Default location after Theme. — The mock-up has no visibility group. EXPERIENCE.md, which wins over mock-ups, orders the groups as profile, language, theme, visibility, default location, and the diff follows it.

## Design Notes

**Two calls, no shared transaction.** The spine wants a `Ref` resolved "inside the action's transaction". In this codebase, though, only services open transactions. The frontend may not import `withTransaction`, and `lib/account` may not import `lib/copies`, or the other way round. So the action calls the two owners in sequence.

The only partial outcome is a location created by name, followed by a failed profile write. That location then stays, which the spine already accepts for inline-created rows ("Undo leaves a row created this way"). A `{ create }` resolves to the user's own row, so the second write fails only on an infrastructure error.

**Why the action returns the list.** A created location has no id on the client. Returning `locations` lets the field mark the new option in one state update, with no `router.refresh()` and no blank label between the save and a refresh.

## Verification

**Commands:**
- `npm run lint`: expected 0 errors.
- `npx tsc --noEmit`: expected clean.
- `npm run test:unit`: expected all pass.
- `npm run test:int`: expected all pass, against `localhost:5433`.
- `npm run build`: expected success. First delete any `dev` (batch -1) row from `payload_migrations`.

**Manual checks:**
- A scratchpad Playwright script against `npm run dev` checks the acceptance criteria at 390×844 and 1280×800, as a seeded signed-in user. Afterwards, delete the seeded user and its locations.

## Auto Run Result

**Summary.** `/settings` has a Default location group after Visibility. It holds the 3.41 `Combobox` over the user's locations, labelled "New copies go to".
- Choosing a location, creating one by name ("New: {name}"), or clearing the field saves at once through `setDefaultLocationAction`.
- The action resolves the `Ref` with `resolveLocation` (`lib/copies`) and writes the id with `updateProfile` (`lib/account`).
- It answers the stored value and the fresh list, so a created location becomes a marked option without a refresh.

**Files changed.**
- `src/lib/copies/locations.ts`: `LocationOption` and `listLocations()`, the user's own locations by name.
- `src/lib/account/profile.ts`:
  - `Profile.defaultLocation` is always an id or `null`.
  - `ProfileChanges.defaultLocation` is new.
  - Reads and writes use `depth: 0`.
- `src/app/(frontend)/ref.ts`: new. `parseRef`, which validates a `Ref` from the client.
- `src/app/(frontend)/actions/account.ts`: `setDefaultLocationAction` and the `DefaultLocationAnswer` type.
- `src/app/(frontend)/(sections)/settings/DefaultLocationField.tsx`: new. The change shows at once, only the latest answer is applied, and a failure reverts and reports.
- `src/app/(frontend)/(sections)/settings/page.tsx`: the group. `getProfile` and `listLocations` are awaited one after the other.
- `messages/en.json`, `fi.json`:
  - `settings.defaultLocation`: "Default location" / "Oletussijainti".
  - `settings.defaultLocationLabel`: "New copies go to" / "Uusien kappaleiden sijainti".
- `tests/int/profileAction.int.spec.ts`: a `setDefaultLocationAction` block covering every matrix row, plus a blank name and a signed-out call. Profile shapes gain `defaultLocation: null`.
- `tests/int/profile.int.spec.ts`: profile shapes gain `defaultLocation: null`.
- `tests/unit/account.unit.spec.ts`: `parseRef` cases.
- `sprint-status.yaml`: 3.42 is done.

**Review.** 15 findings: low 10, false 5. Three low entries were patched, nothing was deferred, and twelve were rejected.
- **Patched:**
  - the Finnish label;
  - one shared answer type;
  - sequential gateway reads on the page.
- **Rejected,** each with its reason in the Review Triage Log:
  - the toast's "Check the marked fields." with no mark;
  - stale options after a failure;
  - the `isPlainObject` copies;
  - no test for a deleted id;
  - the int4 overflow;
  - `listLocations` failing after the commit;
  - out-of-order answers (false: Next dispatches actions one at a time);
  - no `DefaultLocationField` test;
  - the four intent-audit divergences (no UI automation, no shared transaction, the `Profile` shape, the mock-up order).

**Spec deviation.** The intent contract gives the Finnish label as "Uudet kappaleet menevät". The review replaced it with "Uusien kappaleiden sijainti", because the contract's string is an incomplete sentence above a field.

**Follow-up review recommended: false.** This was the first pass, and only low entries were patched (3 low, 0 medium, 0 high).

**Verification.** Run in worktree `story-3-42-default-location`, Postgres on `localhost:5433`, after the patches:
- `npm run lint`: 0 errors (36 pre-existing warnings in migrations).
- `npx tsc --noEmit`: clean.
- Prettier: clean.
- `npm run test:unit`: 579 passed.
- `npm run test:int`: 366 passed, 1 skipped.
- `npm run build`: success. The worktree's `bookeh` database had been dev-pushed with no migration rows, so it was reset first.
- **Browser check** (implementation pass, before the review patches): a scratchpad Playwright script ran against `next dev` at 390×844 and 1280×800 with a seeded user, since removed.
  - The group sits after Visibility and is empty without a default.
  - "mö" → Mökki survives a reload.
  - "New: Työ" creates Työ, marked at once and after a reload.
  - Clear survives a reload.
  - A user with no locations gets only "New: Koti", and saving it works.
  - The patches (label, type, read order) were checked only by the commands above.

**Residual risks.**
- The `Ref` resolve and the profile write are two calls, not one transaction. The spine (line 252) asks for the action's transaction, but lint forbids it at both layers. If the profile write fails after a create, the new location stays.
- "The next scan save lands at Mökki" was not checked end to end. It rests on `createCopy` reading `users.defaultLocation`, which 3.34 covers.
- A location deleted in the back office stays offered until a reload, and choosing it reports "Check the marked fields." with nothing marked.
- `DefaultLocationField`'s revert path has no automated test.
