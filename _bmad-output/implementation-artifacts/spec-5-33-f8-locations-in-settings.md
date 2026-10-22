---
title: '5.33 [F8] Locations in Settings'
type: 'feature'
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

**Problem:** The rename, merge and delete services (5.31–5.32) have no caller, and locations can only be created inline. FR-31, UX-DR50: Settings lists, adds, renames, merges and deletes them.

**Approach:** A Locations group in Settings' second column: one List row per location (name, copy count, Rename / Merge / Delete Links), "Add location", "No locations". Four server actions over `lib/copies`, plus a new `createLocation` that rejects a used name. Builds the reusable `ListRow`.

## Boundaries & Constraints

**Always:**
- `createLocation(ctx, name): Promise<number>` in `lib/copies/locations.ts`: `normaliseName`; blank → `VALIDATION` `fields: { name }`; another own location with that `nameKey` → `NAME_TAKEN` + `conflictId`; else create. In `withTransaction`.
- Counts are the location's copies from `filterValues(ctx, profile.language).location` (spine AD-18: "from the shelf values"); a location absent there shows 0. Rows in `listLocations` order. Meta "{n} books" (ICU plural, en/fi).
- Actions in `settings/actions.ts` (single-page convention), each `runAction` + `requireUserOrThrow`; non-string name or non-id input → `VALIDATION`, no write. On success the client calls `router.refresh()`; failures go through `useReportFailure` except the in-field cases below.
- Add / Rename: an inline Text field (label "Name"), Enter or blur saves; an empty or unchanged field is dropped with no call. `VALIDATION` on `name` or `NAME_TAKEN` keeps the field open with a message under it. Rename's `NAME_TAKEN` message carries a "Merge" Link that opens the merge dialog onto `conflictId`.
- Merge: a `Picker` of the other locations ("Merge {name} into"), then a Dialog "Merge {source} into {target}?" with body "{n} books move to {target}." and a primary "Merge". Absent when the user has one location.
- Delete: Dialog "Delete {name}?" with body "{n} books lose their location." (0 → "No books lose their location.") and a destructive "Delete".
- `ListRow` in `components/ListRow.tsx`: `title` in `text-title`, `meta` right in `text-meta text-text-muted`, actions as children; on the phone the actions wrap to a second line. Not tappable itself.
- `DefaultLocationField` gets a `key` from the default and the location ids/names, so a refresh after a rename, merge or delete remounts it with fresh values.
- All strings en + fi; tokens only; 44px taps on the phone; Links are `ActionLink` (Delete destructive).

**Never:** No Undo, no success toast. No Drizzle or gateway in the surface. No changes to rename/merge/delete services. No People, tags or genres groups.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Add | "  Mökki " | row "Mökki · 0 books" | — |
| Add taken | "mökki" with "Mökki" | field stays, "That name is already in use." | `NAME_TAKEN` (no merge link) |
| Rename taken | Tampere → "mökki" | field stays, message + Merge Link → dialog "Merge Tampere into Mökki?" | `NAME_TAKEN` |
| Delete default | default Tampere, 31 copies | dialog says 31; after: row gone, default field empty | — |
| Merge | Helsinki (4) into Tampere (31) | Tampere 35 books, Helsinki gone | — |
| Gone | another tab deleted it | error toast, list refreshed | `NOT_FOUND` |
| None | no locations | "No locations" + "Add location" | — |

</intent-contract>

## Code Map

- `src/lib/copies/locations.ts` -- `resolveLocation` (normalise/create shape), `renameLocation` (taken check to mirror), `listLocations`, `deleteLocation`, `mergeLocation`.
- `src/lib/shelf/filterValues.ts` -- `.location: { id, name, count }[]`, copies only, used values only.
- `src/app/(frontend)/(sections)/settings/page.tsx` -- `Group`; second column is the empty comment slot; `getProfile` gives `language`, `defaultLocation`.
- `settings/DefaultLocationField.tsx`, `DisplayNameField.tsx` -- `settleAction` / `useReportFailure` / blur-save patterns.
- `src/app/(frontend)/actions/account.ts` -- action shape; `parseRef` in `../ref.ts` shows client-input checks.
- `components/Link.tsx` (`ActionLink`), `Button.tsx`, `TextField.tsx`, `ui/Dialog.tsx` (`confirm` slot), `ui/Picker.tsx` (`onChoose` after close: open the dialog there, one overlay deep).
- `messages/{en,fi}.json` `settings` block; `errors.NAME_TAKEN` exists.
- Mock-up `ux-designs/ux-bookeh-2026-10-03/mockups/key-settings.html` (`.mrow`, `.ops`).

## Tasks & Acceptance

**Execution:**
- `src/lib/copies/locations.ts` -- add `createLocation` per Always.
- `tests/int/createLocation.int.spec.ts` -- creates normalised; taken `nameKey` fails `NAME_TAKEN` with `conflictId` (spine AD-18).
- `src/app/(frontend)/components/ListRow.tsx` -- new.
- `src/app/(frontend)/(sections)/settings/actions.ts` -- `createLocationAction`, `renameLocationAction`, `mergeLocationAction`, `deleteLocationAction`.
- `src/app/(frontend)/(sections)/settings/LocationsGroup.tsx` -- client component: rows, inline field, Picker, Dialogs.
- `settings/page.tsx` -- read counts, render the group in column two, key `DefaultLocationField`.
- `messages/en.json`, `messages/fi.json` -- `settings` strings.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.33 `done` when finished.

**Acceptance Criteria:**
- Given `/settings` with locations, when it renders, then each is a List row with its count and Rename, Merge, Delete Links (second line on the phone), and "Add location" adds one; with none, "No locations" shows.
- Given Rename onto a name in use, when saved, then it is rejected under the field and offers Merge into that location.
- Given Merge or Delete, when chosen, then a dialog confirms (Delete states how many books lose their location) and, after it, the list and the default location reflect the change with no Undo.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 31 findings — high 0, medium 1, low 15, false 15, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: a name over 200 characters fails `VALIDATION` on `name` and shows "Enter a name." — `maxLength={200}` on the NameField input (matches `Locations.name`).
  - `[low]` `[patch]` Blind: a location created from the default-location Combobox never appears in the Locations group — `DefaultLocationField` calls `router.refresh()` after a successful `{ create }`; the key remounts it with fresh values.
  - `[low]` `[patch]` Blind: Merge/Delete show no pending state and a reopened dialog can send the call twice (spurious `NOT_FOUND` toast) — row Links disabled while the group's transition is pending.
  - `[low]` `[reject]` Blind: when `conflictId` is not in the list, `error.sent` blocks resending, so the Merge Link never appears — only a location created in another tab since load reaches it (the Combobox case is patched above); changing the text resends; a fix adds a branch.
  - `[low]` `[reject]` Blind: a field showing an error closes only by clearing it, no Esc on the phone — clearing and leaving drops it (EXPERIENCE: an empty field is dropped); closing on a repeated blur would unmount the Merge Link before its click lands; a Cancel Link adds UI the UX does not have.
  - `[low]` `[patch]` Blind: spine AD-18 states `NAME_TAKEN` only for renames; `createLocation` adds a create-time rule "Add person" will need — AD-18 line now also covers adding by name from a Settings list.
  - `[low]` `[reject]` Blind: the `nameKey` lookup is written three times in `locations.ts` — no caller diverges today; a shared helper is an abstraction for three short queries that already differ on purpose (`resolveLocation` relies on owner access).
  - `[low]` `[reject]` Blind: Settings runs all four `filterValues` queries for location counts — spine AD-18 names the shelf values as the count's source; the extra grouped queries are a fraction of the 1 s shelf budget at 10,000 copies; a location-only export adds public surface.
  - `[false]` `[reject]` Blind: action `id()` repeats the service check with `VALIDATION` instead of `NOT_FOUND` — client-input checks answer `VALIDATION` at the action, as `parseRef` does for `setDefaultLocationAction`; no client sends such ids; the spec sets this.
  - `[low]` `[reject]` Blind: Delete's dialog does not say the default location will be cleared — the cleared default shows on the same page at once; the UX asks the dialog for the books that lose their location; a fix adds a prop and branch.
  - `[false]` `[reject]` Blind: sprint-status `done` while the spec is `in-review` — finalization sets the spec `done` in the same commit.
  - `[low]` `[patch]` Edge: too-long name shows "Enter a name." — same as the first Blind row; fixed by `maxLength`.
  - `[low]` `[reject]` Edge: stale-list `NAME_TAKEN` keeps `error.sent` and blocks the Merge Link — same as the Blind row above; rejected for the same reason.
  - `[low]` `[reject]` Edge: rename A in flight, then Rename on B unmounts A's field, so A's `NAME_TAKEN` is lost silently — needs a taken name plus an immediate switch to another row; the row keeps its old name in view; a fix adds a branch.
  - `[low]` `[patch]` Edge: a confirm button clicked twice during the dialog's exit sends the merge/delete twice — confirms return unless their dialog is open, as `Picker.choose()` does.
  - `[low]` `[reject]` Edge: a Picker target gone after a refresh while the picker closes drops the choice silently — needs another tab's delete in the picker's exit window; nothing is written.
  - `[low]` `[reject]` Edge: a refresh during an in-flight default-location save remounts the field and drops its optimistic value — needs two controls used within one request's time; the stored value shows after the remount.
  - `[false]` `[reject]` Edge (claim): "Rename's NAME_TAKEN message carries a Merge Link" fails for a location outside the list — the list now refreshes after every create on the page; only another tab's create remains, covered by the rejected row above.
  - `[medium]` `[patch]` Verification gap: no test of the rename-taken → Merge path or the Delete count (AC names both); a swapped source/target would ship — `tests/unit/locationsGroup.unit.spec.ts`: merge called with (renamed, conflicting) ids; Delete body built from the row count.
  - `[low]` `[reject]` Verification gap: the page's `DefaultLocationField` key and the id-keyed counts are untested — a server-component page has no harness here and Playwright is limited to two flows (spine, Tests); service halves are pinned; checked in the browser during the build.
  - `[low]` `[reject]` Verification gap: action input checks and `UNAUTHENTICATED` are untested — test-only ask naming no criterion or spine rule (CLAUDE.md triage rule); `runAction`/`requireUserOrThrow` are covered elsewhere.
  - `[low]` `[patch]` Verification gap (other): a Combobox create does not refresh the Locations group — same as the second Blind row; patched there.
  - `[false]` `[reject]` Intent: acceptance lives at the screen while tests stop at the service — the screen's AC-named behaviours now have the jsdom test above; the rest follows the project's test policy.
  - `[false]` `[reject]` Intent: Merge hidden with one location although the AC lists it on each row — there is nothing to merge into; the spec settles it.
  - `[false]` `[reject]` Intent: the merge offer can be missing for a location outside the list — covered by the rejected stale-list row.
  - `[false]` `[reject]` Intent: the rename field replaces the whole row — EXPERIENCE: "Edits the name in place"; the field opens where the row was.
  - `[false]` `[reject]` Intent: `ListRow` is not tappable, so wishlists cannot reuse it as is — the wishlist story adds what it needs; no abstraction for later (CLAUDE.md).
  - `[false]` `[reject]` Intent: additions beyond the AC (merge body, Esc, blank message, remount key) — each follows EXPERIENCE or the spec; no harm named.
  - `[false]` `[reject]` Intent: wide layout differs from the mock-up's three columns — EXPERIENCE: "the managed lists in the second" of two columns.
  - `[false]` `[reject]` Intent: spine not updated for create-time `NAME_TAKEN` — same root cause as the Blind spine row; patched there.
  - `[false]` `[reject]` Intent: sprint-status `done` vs spec `in-review` — finalization sets both in one commit.

## Design Notes

Rename's "offers to merge instead" is a Link in the field's message, not an automatic dialog: the user may simply have mistyped. The dialog it opens is the normal merge confirmation, so the rule "Merge confirmed by a dialog" holds on both paths.

## Verification

**Commands:**
- `npm run test:int -- tests/int/createLocation.int.spec.ts tests/int/renameMergeLocation.int.spec.ts tests/int/deleteLocation.int.spec.ts` -- expected: passes
- `npm run test:unit -- tests/unit/messages.unit.spec.ts` -- expected: passes
- `npm run typecheck` and `npm run lint` -- expected: no errors

## Auto Run Result

**Summary:** Settings → Locations (FR-31, UX-DR50). The second column of `/settings` lists the user's locations as List rows with their copy count from the shelf values and Rename, Merge (with at least two locations) and Delete Links, on a second line on the phone. "Add location" opens a name field at the top; "No locations" when there are none. Add and Rename save on Enter or blur; a blank or used name stays in the field with its message, and a rename onto a used name offers a Merge Link into that location. Merge picks the target in a Picker and is confirmed by a Dialog; Delete's Dialog says how many books lose their location. No Undo, no success toast; every success refreshes the page, and the default-location field remounts with fresh values. New `createLocation` service (rejects a used name with `NAME_TAKEN`), four server actions and the reusable `ListRow`.

**Files changed:**
- `src/lib/copies/locations.ts`: `createLocation`.
- `src/app/(frontend)/(sections)/settings/actions.ts` (new): create, rename, merge and delete actions.
- `src/app/(frontend)/(sections)/settings/LocationsGroup.tsx` (new): rows, inline name field, Picker and Dialogs.
- `src/app/(frontend)/(sections)/settings/page.tsx`: counts from `filterValues`, the group in column two, keyed `DefaultLocationField`.
- `src/app/(frontend)/(sections)/settings/DefaultLocationField.tsx`: refreshes after a create by name.
- `src/app/(frontend)/components/ListRow.tsx` (new): the List row.
- `src/app/(frontend)/components/TextField.tsx`: `error` takes React content (the Merge Link).
- `messages/en.json`, `messages/fi.json`: Settings strings with ICU plurals.
- `tests/int/createLocation.int.spec.ts`, `tests/unit/locationsGroup.unit.spec.ts` (new).
- `ARCHITECTURE-SPINE.md`: AD-18 — adding by name from a Settings list fails `NAME_TAKEN` like a rename.
- `sprint-status.yaml`: 5.33 done.

**Review findings:** one pass, 31 rows in the Review Triage Log.
- **Patched:** medium 1 (unit test of rename-taken → merge direction and Delete count); low 4 groups (name `maxLength`; Combobox create refreshes the group; confirmed Merge/Delete guarded against a second send; AD-18 line).
- **Deferred:** none.
- **Rejected:** stale-list Merge Link, error field closing, duplicated `nameKey` lookup, four-query counts, Delete dialog default note, lost error on a switched rename, picker target gone, remount during a default save, page/action test asks (all `low`); action id error code, status mismatch, and the intent auditor's descriptive divergences (`false`).

**Follow-up review recommendation:** false. Patched high 0, medium 1, low 4.

**Verification:**
- `npm run test:int -- tests/int/createLocation.int.spec.ts tests/int/renameMergeLocation.int.spec.ts tests/int/deleteLocation.int.spec.ts`: 12 passed (worktree Postgres on port 5433), before and after the patches.
- `npm run test:unit`: 51 files, 766 passed (incl. messages and the new `locationsGroup` test).
- `npm run typecheck`: exit 0. `npm run lint`: 0 errors (40 existing migration warnings). Prettier clean on changed files.
- Browser walk-through by the implementer (throwaway Playwright against the e2e server, wide and 390px): add, add taken, empty add, rename taken → Merge dialog, rename, merge via Picker, delete with zero count, another tab's delete, phone layout. Before the patches.
- Matrix audit: Add, Add taken → `createLocation.int`; Rename taken → `renameMergeLocation.int` + `locationsGroup.unit`; Delete default, Merge, Gone → `deleteLocation.int`, `renameMergeLocation.int`; None → UI only, browser walk-through (project test policy: no markup tests).

**Residual risks:**
- Finnish strings are the implementer's; the merge strings ("sijaintiin {target}") want a native read.
- Dialog titles follow the heading style's case rule, so names show lowercased in titles.
- A merge or delete over thousands of copies runs one update per copy in one transaction (from 5.31–5.32).
- The spine changed, so `epic-5-context.md` is stale until recompiled.
