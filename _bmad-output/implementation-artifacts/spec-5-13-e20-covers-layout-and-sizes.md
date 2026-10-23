---
title: '5.13 [E20] Covers layout and sizes'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: 'a7c269486ac86ca46b4427a8780d526e8ed1dc62'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      On common phone widths the covers sizes collapse: at 375px l is one column (2 x 160 + 24 > 335), at 390px m and l both give two columns of about 166-170px, so the size switch shows no difference between them.
    evidence: |-
      The build follows DESIGN.md's density table (columns at least 160 / 116 / 76px, auto-fill), which says the table wins over the mock-ups. The phone mock-up (key-collection-phone.html) shows three columns at m, and the UX adversarial review asked for an OWNER DECISION on phone column counts that was never recorded. Settle by picking phone column counts (or new minimums) in DESIGN.md and checking 320, 375 and 390px.
    location: >-
      src/app/(frontend)/(sections)/CollectionList.tsx (GRID) and DESIGN.md Collection density
    severity: medium
  - summary: >-
      In the covers layout an ordered copy looks like an owned one: tiles show title and author only, while rows end with "Ordered".
    evidence: |-
      DESIGN.md's Cover tile names title and author beneath the cover plus the lent marker, selection bar and checkbox states; it says nothing about ordered copies, and EXPERIENCE.md's Row ending applies to rows. Needs a design decision (for example "Ordered" as the tile's author line or a marker) before building.
    location: >-
      src/app/(frontend)/(sections)/CoverTile.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** The collection always shows rows at size m. The rows / covers and s / m / l switches in the tools row are rendered disabled, so Mika cannot browse by cover or fit more titles on screen (UX-DR17, UX-DR18).

**Approach:** The page reads layout and size from `devicePrefs()` (the `bookeh_prefs` cookie) and seeds a small client display provider shared by the tools row and the list. The switches change the display at once and save it with `setDevicePrefsAction`. The list renders `BookRow` or a new `CoverTile` at the chosen size, following DESIGN.md's density table.

## Boundaries & Constraints

**Always:**
- Density, from DESIGN.md (Collection density) and UX-DR17 / UX-DR18:
  - Rows l: 44 × 66 cover; title / authors / year · publisher on three lines; 10px above and below.
  - Rows m: as today. 32 × 48 cover; title, then authors · year · publisher; 8px.
  - Rows s: 16 × 24 cover; title, then authors · year · publisher in muted meta, on one truncated line; 3px. The tap-area exception applies.
  - Covers: columns at least 160 / 116 / 76px wide (l / m / s) with gaps 24 / 18 / 10px. Cover at 2:3 (the existing `Cover`). Beneath it, the title in `meta` and the authors in `label`, `text-muted`, each on one truncated line; at s both lines are `label`.
  - Between the cover, the text and the ending: `spacing-4`. No dividers. On rows, the "Ordered" ending is kept at every size.
- Sizes that DESIGN.md gives off its scale become named variables in `styles.css` (spine, Styling): `cover-row-s` 16px, `cover-row-l` 44px (`cover-row` stays the m value, used by `EditionPicker`), `row-pad-s` 3px, `row-pad-l` 10px, `tile-s` / `tile-m` / `tile-l` 76 / 116 / 160px, `tile-gap-s` 10px, `tile-gap-m` 18px. m padding is `spacing-2`, the l gap is `spacing-6`. Class strings are static (a lookup per size), so Tailwind sees them.
- First paint: the server page passes `{ layout, size }` from `devicePrefs()` to the provider, so the server-rendered HTML already shows the right switches and list.
- Switching uses `useSavedSwitch` per field, moved from `settings/` to `components/useSavedSwitch.ts` (the three settings switches import it from there). The tapped value shows at once in both the tools row and the list. A failed save reports through `reportFailure` and the value returns, as on Settings.
- Size and layout never change what `ShelfRowsProvider` fetches: no prop or key depends on them, and the page size stays `SHELF_PAGE_SIZE`.
- A placeholder cover at rows s gets no text (the row passes an empty `title` to `Cover`): an outlined box only.

**Never:**
- No change to `prefs.ts`, `actions/prefs.ts`, `lib/shelf`, `/data/shelf`, `ShelfRows.tsx` or `shelfPlace.ts`.
- No row ending, lent marker, selection bar or checkbox on tiles here (lent: Epic 6; open tile: 5.18; select: 5.27). DESIGN.md's Cover tile shows title and author only.
- Filter and Select stay disabled. No new message strings (the switch labels exist).
- No `localStorage`, no profile field.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| First paint | cookie `{ layout: 'covers', size: 's' }` | server render: Covers and S pressed; tiles show title and authors, no year · publisher line | — |
| No cookie | no `bookeh_prefs` | Rows and M pressed; rows at m (as today) | `parseDevicePrefs` defaults |
| Switch | tap Covers, then L | tiles at once; `setDevicePrefsAction({ layout: 'covers' })`, then `({ size: 'l' })`; no `/data/shelf` request | — |
| Save fails | action answers `NO_CONNECTION` | error toast; the switch and the list return to the stored value | `reportFailure` via `useSavedSwitch` |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/page.tsx` -- reads `requireUser()` and the first shelf page. Add `devicePrefs()` from `../prefs`. Wrap `CollectionTools` and the list / `LoadFailed` in the provider, so the switches work even when the list failed.
- `src/app/(frontend)/(sections)/CollectionTools.tsx` -- the two `TextSwitch`es are hard-wired to `rows` / `m`, `disabled`, with `onChange={ignore}`. Wire them to the provider and drop `ignore`. Keep the options inline: client code cannot import `prefs.ts`, which reads `next/headers`. Use `import type { DevicePrefs }` only, as `ThemeSwitch` does. Update the doc comment.
- `src/app/(frontend)/(sections)/CollectionDisplay.tsx` -- new client module. `CollectionDisplayProvider({ initial: Pick<DevicePrefs, 'layout' | 'size'>, children })` holds one `useSavedSwitch` per field, saving through `setDevicePrefsAction({ layout })` / `({ size })`. `useCollectionDisplay()` returns `{ layout, size, setLayout, setSize }` and throws outside the provider, like `useShelfRows`.
- `src/app/(frontend)/(sections)/settings/useSavedSwitch.ts` → `src/app/(frontend)/components/useSavedSwitch.ts` -- `git mv`. Fix the relative imports (`./request`, `./toast/ToastProvider`) and add Layout and Size to the doc comment's list. Update the imports in `ThemeSwitch.tsx`, `LanguageSwitch.tsx` and `VisibilitySwitch.tsx`.
- `src/app/(frontend)/(sections)/CollectionList.tsx:105-109` -- the `<ul>` of `BookRow`s. Read `layout` and `size` from `useCollectionDisplay()`. Rows: `<ul>` of `BookRow size={size}`. Covers: a grid `<ul>` of `CoverTile size={size}`. The sentinel and the count line are unchanged.
- `src/app/(frontend)/(sections)/BookRow.tsx` -- hook-free, m only today. Add `size: DevicePrefs['size']`, with cover width, padding and text lines per size from a static lookup. Keep the title as the row's first `<p>`: `collectionPage.unit.spec.ts:118` reads it.
- `src/app/(frontend)/(sections)/CoverTile.tsx` -- new hook-free `<li>`: `Cover` at full column width, then the title and authors (`spacing-1` below the cover).
- `src/app/(frontend)/components/Cover.tsx` -- read only. It fills its parent's width at `aspect-2/3`; the placeholder is `p-2` with the title inside, which cannot fit 16px.
- `src/app/(frontend)/styles.css:91-94` -- the cover tokens. Add the new variables beside `cover-row`, each with a DESIGN.md comment.
- `src/app/(frontend)/(sections)/settings/ThemeSwitch.tsx` -- the reference pattern for a saved device preference.
- `node_modules/next/dist/docs/01-app/04-glossary.md:49` -- evidence: `cookies.set` in a server action clears the client router cache, so returning to `/` later renders with the new cookie. The action's response also re-renders the page. The provider's `useState` ignores the new `initial`, and `ShelfRowsState` has no effect on `initial`.
- `tests/unit/collectionPage.unit.spec.ts` -- the page harness. Add mocks for `@/app/(frontend)/prefs` (`devicePrefs` as a `vi.fn`, the rest from `importOriginal`) and `@/app/(frontend)/actions/prefs` (`setDevicePrefsAction`), plus `withdraw` on the `ToastProvider` mock. `useReportFailure` needs `show`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/styles.css` -- add the named density variables -- spine Styling rule for off-scale sizes.
- `src/app/(frontend)/components/useSavedSwitch.ts` (moved) and the three settings switches -- shared by Settings and the collection.
- `src/app/(frontend)/(sections)/CollectionDisplay.tsx` -- provider and hook.
- `src/app/(frontend)/(sections)/page.tsx` -- `devicePrefs()` and the provider around tools and list.
- `src/app/(frontend)/(sections)/CollectionTools.tsx` -- enable and wire both switches.
- `src/app/(frontend)/(sections)/BookRow.tsx` -- the three row sizes.
- `src/app/(frontend)/(sections)/CoverTile.tsx` -- the tile.
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- rows or tiles.
- `tests/unit/collectionPage.unit.spec.ts` -- two cases. (1) First paint: `devicePrefs` gives covers / s; Covers and S are `aria-pressed`, and a tile holds title and author without "· 1954 · WSOY". (2) Switch: from the defaults, tap Covers, then L; `setDevicePrefsAction` is called with `{ layout: 'covers' }`, then `{ size: 'l' }`; the list shows tiles at once; a stubbed `fetch` is never called. The failure path is already covered by `settingsSwitch.unit.spec.ts` for `useSavedSwitch`.

**Acceptance Criteria:**
- Given the collection, when I tap Covers or Rows and s, m or l, then the list changes at once to that layout and size, per DESIGN.md's density table, with covers at 2:3.
- Given a layout and size chosen on this device, when I open `/` later (reload or a new visit), then the server's first render already shows that layout and size.
- Given any layout and size, when the list loads more, then it asks for `SHELF_PAGE_SIZE` rows as before, and switching asks for nothing.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 24 findings — high 0, medium 1, low 15, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` Edge: a layout/size save sets the cookie, Next re-renders the page, and a `getShelfRows` failure on that re-render swaps the list for Load failed — needs a transient DB failure during the one re-render; Try again recovers; avoiding it means a non-action cookie writer, which goes against the spine's "one server action writes it".
  - `[low]` `[reject]` Edge: every tap re-runs a 50-row shelf read on the server that the client discards — no perceivable cost (indexed, under 1 s at 10,000 copies, the switch shows at once); Settings' Theme already works the same way; the fix needs a second cookie writer.
  - `[low]` `[reject]` Edge (claim): "switching asks for nothing" hides the server re-render — the AC means client requests, which is what the epic's "not how many rows are fetched" guards; the fix would be a spec edit.
  - `[false]` `[reject]` Edge (claim): a third page test goes past the spec's two — the matrix row "Save fails" includes the list returning, which no other test covers; added at the matrix test audit.
  - `[low]` `[patch]` Verification gap: row sizes l and s are untested; dropping the l branch passed every test — the switch case now taps L on rows and checks "Väinö Linna" and "1954 · WSOY" as separate lines (fails without the branch).
  - `[low]` `[reject]` Verification gap: `fetchStub` cannot see a keyed remount of `ShelfRowsProvider` — the assertion still guards a switch that triggers a reload; no code path ties the display to the shelf; a stronger case needs held-rows harness work for a regression nothing invites.
  - `[low]` `[reject]` Verification gap (other): `router.refresh` not asserted — nothing calls it; speculative.
  - `[false]` `[reject]` Blind: built despite `oversized` — Mika dismissed the trigger in 4.15, as in 5.10–5.12.
  - `[low]` `[reject]` Blind: `Cover.tsx` changed though the Code Map says read only, unrecorded — the change (no padding without a title) fixes the 18px placeholder in a 16px column; every other caller passes a non-empty title; recorded in Auto Run Result; the asked fix is a spec edit.
  - `[low]` `[reject]` Blind: server re-render per tap and the Load failed swap — same as the two Edge rows.
  - `[false]` `[reject]` Blind: "fetches nothing" contradicts a sentinel that comes into view at covers s and loads the next page — that load is endless scrolling filling the screen, the same page size, which is what the epic AC protects.
  - `[medium]` `[defer]` Blind: phone column math — l is one column at 375px, m and l both two at 390px; the mock-up shows three at m — the build follows DESIGN.md's table; the conflict and the open owner decision predate this story; deferred.
  - `[low]` `[reject]` Blind: at s a long title hides the meta, and the 8px gap overflows the text column — title first is the sensible priority where DESIGN.md names none; the overflow is empty space inside the 16px gap; noted as a residual risk.
  - `[low]` `[defer]` Blind: an ordered copy cannot be told apart in covers — DESIGN.md's Cover tile is silent; needs a design decision; deferred.
  - `[false]` `[reject]` Blind: the third test goes past the spec and does not check the toast — it covers the matrix row's list outcome; the error toast comes from `useSavedSwitch`, tested in `settingsSwitch.unit.spec.ts`.
  - `[low]` `[patch]` Blind: the epic context still says the switches are disabled and that `BookRow` takes only a `ShelfRow` — updated the line in `epic-5-context.md` and moved Done/Next to 5.13/5.14.
  - `[low]` `[reject]` Blind: `CollectionTools` keeps its own option lists, which can drift from `LAYOUTS`/`SIZES` — adding a size means a DESIGN.md change and editing this file anyway; `TextSwitch` already types the values against `DevicePrefs`.
  - `[false]` `[reject]` Intent: no pixel-level test of the density table — the CLAUDE.md test convention rules out class and CSS tests; left to the manual check.
  - `[false]` `[reject]` Intent: the cookie round trip is never exercised end to end — `prefs.unit.spec.ts` covers parse/serialise and `devicePrefs()`, `devicePrefs.int.spec.ts` covers the action's cookie write; this story changes neither.
  - `[low]` `[reject]` Intent: load-more at `SHELF_PAGE_SIZE` under any size has no test — guaranteed by structure (no prop or key on `ShelfRowsProvider`, `ShelfRows.tsx` unchanged) and covered at m by the 5.11 tests.
  - `[false]` `[reject]` Intent: the third test goes past the spec — same as the Edge claim row.
  - `[false]` `[reject]` Intent: rows at s, spec and DESIGN.md wording differ — both mean everything on one line; the diff matches DESIGN.md.
  - `[false]` `[reject]` Intent: built despite `oversized` — same as the Blind row.
  - `[low]` `[patch]` Intent: `sprint-status.yaml` still says `backlog` — set 5.13 to `done` at finalisation.

## Design Notes

The provider wraps both the tools row and the list because they are siblings on the server page. Lifting state into a client wrapper would pull the server-rendered `LoadFailed` branch into it. Each field gets its own `useSavedSwitch`, so a failed size save never resets the layout. Next runs server actions one at a time, and the action merges its patch over the request's cookie, so two quick taps do not overwrite each other (the same as Settings' Theme).

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npx eslint 'src/app/(frontend)' tests/unit/collectionPage.unit.spec.ts` -- expected: clean
- `npm run test:unit` -- expected: all pass, including the two new cases

**Manual checks (if no CLI):**
- `npm run dev`: switch through all six combinations on a phone width and a wide width. Covers keep 2:3 and columns are at least the minimum width. Reload: the choice holds with no flash.

## Auto Run Result

**Summary:** The collection's rows / covers and s / m / l switches work. They change the list at once, save to this device's `bookeh_prefs` cookie through `setDevicePrefsAction`, and the server's first render already shows the saved choice. Rows and cover tiles follow DESIGN.md's density table, with covers at 2:3. Nothing about what is fetched depends on layout or size.

**Files changed:**
- `src/app/(frontend)/(sections)/CollectionDisplay.tsx`: new provider and hook, one `useSavedSwitch` per field.
- `src/app/(frontend)/(sections)/page.tsx`: reads `devicePrefs()`; the provider wraps the tools row and the list or Load failed.
- `src/app/(frontend)/(sections)/CollectionTools.tsx`: switches enabled and wired.
- `src/app/(frontend)/(sections)/BookRow.tsx`: sizes s, m and l (one line, two lines, three lines); "Ordered" kept at every size.
- `src/app/(frontend)/(sections)/CoverTile.tsx`: new tile, cover then title and authors.
- `src/app/(frontend)/(sections)/CollectionList.tsx`: rows or an auto-fill grid per size.
- `src/app/(frontend)/components/useSavedSwitch.ts`: moved from `settings/`; the three settings switches import it from there.
- `src/app/(frontend)/components/Cover.tsx`: a placeholder with no title has no padding, so it fits the 16px cover at rows s. Outside the Code Map's "read only"; every other caller passes a title.
- `src/app/(frontend)/styles.css`: named density variables (`cover-row-s`/`-l`, `row-pad-s`/`-l`, `tile-s`/`-m`/`-l`, `tile-gap-s`/`-m`).
- `tests/unit/collectionPage.unit.spec.ts`: first paint from the cookie; switching (rows at l, then covers) saves each change and fetches nothing; a failed save returns the switch and the list.
- `tests/unit/collectionList.unit.spec.ts`: the harness wraps the list in the provider.
- `_bmad-output/implementation-artifacts/epic-5-context.md`: the switches line and Done/Next updated.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 5.13 `done`.

**Review findings:** 24 (medium 1, low 15, false 8).
- **Patched (3 entries, low):**
  - the switch test now checks rows at l;
  - the epic context line about the switches is updated;
  - sprint status is set to `done`.
- **Deferred:**
  - phone column counts in covers, medium: DESIGN.md's table against the phone mock-up, an open owner decision;
  - ordered copies are not marked on tiles, low.
- **Rejected (low):**
  - the server re-render after a save (×3), with its discarded shelf read and a Load failed swap if that read fails: the spine allows one action as the cookie writer, and Settings works the same;
  - the "switching asks for nothing" wording;
  - the test cannot see a keyed remount;
  - `router.refresh` is not asserted;
  - `Cover.tsx` touched (recorded above);
  - at s, a long title hides the meta;
  - inline switch options;
  - load-more at any size is guaranteed by structure.
- **Rejected (false):**
  - `oversized` (×2), dismissed in 4.15;
  - the third test (×3), which covers the matrix row;
  - the sentinel load at covers s is endless scrolling;
  - no pixel tests, by the test convention;
  - the cookie round trip is covered by the existing prefs tests;
  - the rows-at-s wording.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 0, low 3.

**Verification:**
- `npm run typecheck`: passes.
- `eslint` on `src/app/(frontend)` and the two test files: clean.
- `prettier --check`: clean.
- `npm run test:unit`: 57 files, 814 tests pass.
- I/O matrix: every row is covered by a passing test. First paint, Switch and Save fails are in `collectionPage.unit.spec.ts`. For No cookie, the defaults render in the first page case, and `prefs.unit.spec.ts` covers the cookie parse.
- Not done: the manual browser check of all six combinations at phone and wide widths, and the reload-with-no-flash check.

**Residual risks:**
- **Phone columns:** at 375px covers at l is one column, and at 390px m and l look the same (deferred).
- **Server re-render:** each switch tap re-renders the page on the server and runs one discarded first-page shelf read. If that read fails, the list is replaced by Load failed until Try again.
- **Rows at s:** a long title truncates first, so the author and year are often hidden on a phone.
- **Tiles:** an ordered copy is not marked in covers (deferred).
- **Browser check still open:** the 5.12 history-Back restore check is still open, and keep my place stores a pixel offset, so a size change elsewhere moves the restored position.

