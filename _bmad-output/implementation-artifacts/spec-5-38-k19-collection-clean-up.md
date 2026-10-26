---
title: '5.38 [K19] Collection clean-up'
type: 'chore'
created: '2026-10-24'
status: 'done'
baseline_revision: '9b023d8c72c4e725e3eb182f442290e8675dd6f4'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: [multiple-goals, oversized]
deferred:
  - summary: >-
      An ordered copy in the covers layout is marked only by the decorative airmail band, so a screen reader hears nothing that tells it from an owned one.
    evidence: |-
      CoverTile's lines hold title and author only; the band is a ::before pseudo-element. Before this story the tile carried no ordered marker of any kind, so the gap is pre-existing; the row layout's "Ordered" ending is unaffected. In select mode a screen-reader user cannot tell which ticked tiles Move or Remove will skip.
    location: >-
      src/app/(frontend)/(sections)/CoverTile.tsx
    severity: low
  - summary: >-
      A toast Undo with Book detail closed reloads the rows but does not refresh the server render, so the Filter panel's counts stay stale until the next navigation.
    evidence: |-
      afterAction refreshes after every action; Undo goes through ToastProvider's onUndone, which ShelfRowsState answers with a rows reload only, and only ReadAndRating (mounted with Book detail) refreshes for it. The intent names afterAction's actions, not Undo, and the spec's Never list kept Undo out; the staleness predates this story.
    location: >-
      src/app/(frontend)/(sections)/ShelfRows.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** The Epic 5 retrospective (2026-10-23, items 1–4 and 11) left the collection with loose ends: the Filter panel's values and the cached first page go stale after every row-changing action; the action bar's Move fails the whole selection when an ordered copy is ticked and Remove deletes ordered copies silently; a Move Undo fails once the previous location was deleted; the move toast counts copies that did not move; `lookupAgain` counts a lookup even when it merges without asking a source; `tag`/`theme` parse but never apply; Book detail shows a raw language code; the backup status read sits in `src/app` with a hard-coded path; the shelf and suggest `q` are not NFC-normalised; four acceptance criteria have no test; and the covers layout does not follow retro decision 3.

**Approach:** One pass over the collection: `afterAction` refreshes the server render after the rows reload (AD-7 updated); the copy services skip ordered copies and report them, restores tolerate a gone location (AD-20 updated), the toast counts what moved; the small reconciliations and the four tests land as named; DESIGN.md's density table takes 150 / 96 / 70px column minimums with the typeset paperback placeholder and the airmail band on an ordered tile, and `styles.css`, `Cover.tsx` and `CoverTile.tsx` follow.

## Boundaries & Constraints

**Always:**
- **Refresh (item 1, R1/R2).** `ShelfActionsProvider` owns a `useRouter()` and a `useTransition()`. `register` takes a reload that returns a `Promise<void>`; `afterAction` keeps its signature and return value. On `ok` or `NOT_FOUND`, it awaits the mounted reload (or nothing, when none is mounted), then calls `router.refresh()` inside `startTransition`. Components that only refreshed to keep the server render current drop their own `router.refresh()`: `MovePicker` (on `ok`), `MoveCopy` (on `NOT_FOUND`), `RemoveCopy` (on `ok` or `NOT_FOUND`), `ReceiveCopy` (on `ok` or `NOT_FOUND`), `Refetch` (on `filled`), `DetailLookUpAgain` (on a same-id `shared` and on `NOT_FOUND`); their focus moves and `closeDetail()` stay. `ReadAndRating`'s `onUndone` refresh stays (Undo does not go through `afterAction`). `ShelfRowsState.reload` returns the `run` promise. AD-7's `afterAction` paragraph in ARCHITECTURE-SPINE.md says the refresh follows the reload, in the same commit.
- **Ordered copies in bulk actions (item 2, decision 1).** `moveCopies(ctx, copyIds, location)` no longer fails on an ordered copy: it moves the owned copies and resolves to `{ location, moved: number, skipped: number[] }`, where `moved` counts copies actually written (a copy already at the target is neither moved nor skipped) and `skipped` holds the ordered copies' ids. A list with no owned copy moves nothing, creates no location, and still succeeds with `moved: 0`. `removeCopies` likewise deletes owned copies only and resolves to `{ removed: number; skipped: number[] }`. `NOT_FOUND` for an id not the viewer's stays, before any write, as do the empty-list and bad-id rules. `editBook`'s `writeCopy` keeps its contract by failing with `VALIDATION` on `location` when `moveCopies` skipped its one copy.
- **Actions and toasts.** `moveCopiesAction` answers `{ location, count: moved, skipped: number[] }`; `removeCopiesAction` answers `{ removed: number; skipped: number[] }`. The bar unticks the sent ids minus `skipped` on `ok` (all sent on `NOT_FOUND`, as now). Move toast: with no skips as today; with skips `toast.movedSkipped` "{n, plural, =0 {Nothing moved} other {# moved to {location}}} · {skipped} ordered skipped", Undo only when `count > 0`. Remove toast only with skips: `toast.removedSkipped` "{n, plural, =0 {Nothing removed} other {# removed}} · {skipped} ordered skipped", no Undo. Finnish strings ship beside them. Book detail's single-copy Move and Remove (owned lines only) are unchanged in behaviour.
- **Undo of a move (R4).** `restoreLocations` checks each recorded `previous` location id with `gateway.count` on `locations` and writes `null` when it no longer exists; a gone copy is still skipped. `receiveCopy`'s doc comment states the same rule for its restore (it writes `status: 'ordered', location: null`, no target, so no code change). AD-20's restore sentence extends to targets: a recorded relation target that no longer exists is restored as none.
- **Picker (R6).** `Picker`'s `create` takes `maxLength?: number`, passed to its `TextField`; `MovePicker` passes `200` (the `locations.name` limit, as `LocationsGroup` does).
- **Lookup counting (R7).** `lookupAgain` calls `limitLookups(ctx)` only immediately before `lookupSources(isbn13, { fresh: true })`; the merge path and the held-candidate path count nothing. `lookupLimit.ts`'s comments and the spine's Look it up again rule (AD-5 bullet, "then `limitLookups()`") say so.
- **Small reconciliations (item 3).** `ShelfQuery.filters` loses `tag` and `theme`; `parseShelfQuery` and `shelfSearchParams` ignore them; `countLine.ts` drops their entries; `shelfIds.ts`'s doc comment says tag and theme filters arrive with Epic 9. Book detail's edition line renders `languageName(book.language, await getLocale())`. The backup reader moves to `src/lib/backup/lastBackup.ts` with the same exports; `BACKUP_STATUS_FILE` becomes `process.env.BACKUP_STATUS_FILE?.trim() || '/app/backup-status/last-backup.json'`, listed in `.env.example`; the spine's source tree gains `backup/`. `parseShelfQuery` normalises `q` to NFC (then the existing non-empty check); the suggest route normalises `q` to NFC before the length check.
- **Tests (item 4).** Rating: `readAndRating.unit.spec.ts` gets a case that rates with a star and clears, asserting `setRatingAction`'s payloads (`{ bookId, rating: n }`, then `{ bookId, rating: null }`), that `show` is never called and `afterAction` gets each result. Look it up again: new `tests/unit/lookUpAgain.unit.spec.ts` renders `LookUpAgainLink` with `lookUpAgainAction` mocked: an `editions` answer opens the Picker, choosing the second row calls again with `{ bookId, candidate: ids[1] }`; `shared` (with and without a source), `none` and `unavailable` each show their toast text from `en.json`; `onSettled` gets every result. Re-fetch: `collectionPage.unit.spec.ts` opens a shared Book with an `isbn13` for a viewer with roles `['admin', 'user']` and finds the "Re-fetch" link, then for roles `['user']` and finds none (`requireUser` mock made configurable). Suggest: `suggestRoute.unit.spec.ts` gets the 401 `UNAUTHENTICATED` case as `shelfRoute.unit.spec.ts` has it.
- **Covers (item 11, decision 3).** DESIGN.md's density table: covers columns at least 150 / 96 / 70px (l / m / s), gaps unchanged; the Cover placeholder row replaces its assumption with the typeset paperback: outline kept, title bottom-left in {typography.label}, wrapped and clamped to four lines, author under it in {typography.label} {colors.text-muted}; at s and in rows the title only (an s row keeps its empty box). The Cover tile row adds: an ordered copy's tile carries a red-white-blue airmail band across the top-left corner of its cover, no word; the row ending still reads "Ordered". `styles.css`: `--spacing-tile-l/m/s` become 150 / 96 / 70px; new `--color-airmail-red` and `--color-airmail-blue` tokens (same in both palettes) and an `@utility airmail-band` that draws the band with a `::before` pseudo-element (`repeating-linear-gradient` of red, white, blue, white stripes, rotated −45°, 10px thick, clipped by `overflow: hidden`). `Cover` takes `author?: string | null` and renders the placeholder as a column justified to the end with the clamped title and, when given, the truncated author. `CoverTile` passes the authors line at m and l only and wraps the cover in `airmail-band` when `copy.status === 'ordered'`. `BookRow` is unchanged.
- The unit case for item 1 lives in `collectionList.unit.spec.ts`: after `afterAction({ ok: true, data: null })` answered by `/data/shelf` with fewer rows, the list shows exactly the reloaded rows and `router.refresh` was called once, after the reload answered (not before).
- An integration case in `moveCopies.int.spec.ts` deletes the previous location with `deleteLocation()` before `undo()`, which resolves and leaves the copy with no location; another covers a selection with an ordered copy (owned moved, `skipped` names the ordered id, `moved` counts the written ones). `lookupAgain.int.spec.ts`'s merge case first spends the user's `LOOKUP_LIMIT` and still merges.
- `sprint-status.yaml`: `5-38-k19-collection-clean-up` to `in-progress` at the start, `done` at the end.

**Never:**
- No change to `/data/shelf`'s `limit`/`offset` rules, `SHELF_PAGE_SIZE`, the keep-my-place store, or the Undo store. No refresh after a toast Undo from the provider (the AC names `afterAction`; `ReadAndRating` keeps its own).
- No Undo for Remove. No change to the dialog title's count (it names the ticked copies). No disabling of Move or Remove while an ordered copy is ticked.
- No Epic 9 work: `tag` and `theme` are removed, not applied. No band on rows. No new type sizes outside the scale: the placeholder uses `text-label`.
- No admin, Payload or migration change. No change to `deploy/`.
- Do not refresh from components whose refresh `afterAction` now covers (listed under Always); do not leave both.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Bar Remove, then Back | rows 1..2 held; `afterAction({ ok: true })`; `/data/shelf` answers row 2 | list shows row 2 only; `router.refresh()` once, after the reload resolved | — |
| Move with an ordered copy ticked | ids [owned A at L1, ordered B]; target L2 | A at L2, B untouched; `{ moved: 1, skipped: [B] }`; toast "1 moved to L2 · 1 ordered skipped" with Undo; B stays ticked | — |
| Move, nothing owned | ids [ordered B]; target `{ create: 'X' }` | no write, no location created; `{ moved: 0, skipped: [B] }`; toast "Nothing moved · 1 ordered skipped", no Undo | — |
| Move, copy already there | ids [A at L2, C at L1]; target L2 | C written; `moved: 1`, `skipped: []`; toast "1 moved to L2" | — |
| Remove with an ordered copy ticked | ids [owned A, ordered B] | A deleted; `{ removed: 1, skipped: [B] }`; toast "1 removed · 1 ordered skipped", no Undo; B stays ticked | — |
| Undo a move after its previous location is gone | A moved L1→L2; `deleteLocation(L1)`; `undo(token)` | resolves; A's location `null` | no `UNDO_FAILED` |
| Undo a move, copy gone | as the existing case | gone copy skipped, the rest restored | — |
| `editBook` moves an ordered copy | `copy: { id: B, location: L1 }` | `VALIDATION` on `location`, nothing written | field error |
| Look it up again, shared Book exists | user at `LOOKUP_LIMIT`; shared Book with the ISBN | merges; `lookupSources` not called; no `RATE_LIMITED` | — |
| Look it up again, sources asked | user at `LOOKUP_LIMIT`; no shared Book | `RATE_LIMITED` before `lookupSources` | as today |
| `?tag=1&theme=Sota` | address with both | parsed query has no such filters; count line not narrowed; `shelfHref` writes neither | — |
| `q` with combining characters | `q=ä` on `/`, `/data/shelf` or `/data/suggest` | `q` is `'ä'` (NFC) where the query or `suggest()` receives it | — |
| `/data/suggest` signed out | `requireUserOrThrow` rejects `UNAUTHENTICATED` | status 401, `{ ok: false, code: 'UNAUTHENTICATED' }`, `suggest` not called | — |
| Edition line | `language: 'fin'`, locale `en` | "… · Finnish"; an unknown code shows as stored | — |
| Backup file path | `BACKUP_STATUS_FILE=/tmp/x.json` | the reader reads that path; unset → `/app/backup-status/last-backup.json` | as today |
| Placeholder cover | `src: null`, `title`, `author: 'Katja Kettu'` | outlined box, title and author text present; without `author` the title alone | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/ShelfRows.tsx` -- `ShelfActionsProvider` (l.75–100): `register`, `afterAction` (`reload.current?.()` at l.92); `ShelfRowsState.reload` (l.253–256, `void run(...)` → return it); `register(reload)` effect l.258. Add `useRouter` from `next/navigation`, `useTransition`.
- `src/app/(frontend)/(sections)/MovePicker.tsx` -- `router.refresh()` l.65 goes; toast at l.60–64 branches on `skipped.length`; `onSettled(result, sent)` stays (the bar computes the untick set from `result.data.skipped`).
- `src/app/(frontend)/(sections)/SelectBar.tsx` -- `remove` (l.56–62): untick `copyIds` minus `data.skipped` on `ok`, toast when skipped; `settled` (l.64–67) same rule for Move; `doneButton` focus unchanged.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- `MoveCopy.onSettled` NOT_FOUND refresh l.113; `RemoveCopy.remove` refresh l.148; `ReceiveCopy` refresh (after l.200, read the rest of the file); each keeps its focus move and `closeDetail()`.
- `src/app/(frontend)/(sections)/Refetch.tsx` l.57 and `LookUpAgain.tsx` l.127, l.129–131 -- refreshes to drop; the `router.replace` to the merged Book stays.
- `src/app/(frontend)/(sections)/actions.ts` -- `removeCopiesAction` (l.49–55) returns the service's result; `moveCopiesAction` (l.143–160) returns `{ location: target, count: data.moved, skipped: data.skipped }`; the `listLocations` lookup of the target stays.
- `src/lib/copies/moveCopies.ts` -- ordered check l.54–57 becomes a partition; loop l.62–72 over owned docs; `restoreLocations` l.78–92 adds the `locations` count. Doc comment l.12–34 rewritten. `Moved` type stays.
- `src/lib/copies/removeCopies.ts` -- read docs with `select: { status: true }` instead of `count`, delete owned, return counts. Doc comment l.6–14.
- `src/lib/copies/receiveCopy.ts` -- doc comment l.22–23 names the restore-target rule.
- `src/lib/catalogue/editBook.ts` -- `writeCopy` l.276: check `skipped.length` after `moveCopies`; doc comment l.143–146.
- `src/lib/catalogue/lookupAgain.ts` -- `limitLookups(ctx)` l.75 moves into the `lookupSources` branch at l.81; doc comment l.34–35.
- `src/lib/catalogue/lookupLimit.ts` -- comments l.5–13 and l.26–35 ("by `lookupAgain` on every call once its gate passes").
- `src/lib/shelf/query.ts` -- `ShelfQuery.filters.tag/theme` l.26–27, `set('tag'…)`/`set('theme'…)` l.157–158, `add('tag'…)`/`add('theme'…)` l.202–203; `q` l.167 (`text(one('q'))` → NFC first). Header comment l.8–9 mentions themes.
- `src/app/(frontend)/(sections)/countLine.ts` -- `IdField` l.17 drops `'tag'`; l.57–58 go.
- `src/lib/shelf/shelfIds.ts` -- doc comment "tag and theme are not applied yet (Epic 9)".
- `src/app/(frontend)/data/suggest/route.ts` -- `q` l.22 → `.normalize('NFC')`.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- edition l.65–73 (`book.language` → `languageName(book.language, locale)`, `getLocale` from `next-intl/server`); `languageName` at `src/lib/books/languageName.ts`; `canEditShared` gate l.167.
- `src/app/(frontend)/(sections)/settings/lastBackup.ts` -- moves to `src/lib/backup/lastBackup.ts`; `settings/page.tsx` import l.19. `.env.example` gets a commented `BACKUP_STATUS_FILE` entry. `tests/unit/lastBackup.unit.spec.ts` import path.
- `src/app/(frontend)/components/ui/Picker.tsx` -- `create` type l.29; `TextField` l.122–127 gets `maxLength={create.maxLength}`. `MovePicker.tsx` `create` l.80–84.
- `src/app/(frontend)/components/Cover.tsx` -- placeholder l.35–43; `title ? ' p-2' : ''` rule stays for the s row's empty box.
- `src/app/(frontend)/(sections)/CoverTile.tsx` -- `cover` l.43–53 (wrap with `airmail-band` when ordered; `row.copy` is not destructured yet); `lines` l.54–59; author only at m/l.
- `src/app/(frontend)/styles.css` -- tile tokens l.106–109; colour tokens in the `:root` block and the dark blocks (same values); `@utility` block near `selection-bar` l.339.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md` -- density table l.312–314; Cover tile l.354; Cover placeholder l.355.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md` -- Undo row Move l.134 (restore to no location when the previous one is gone); Select mode rows Move l.181 and Remove l.184 (ordered copies skipped, stay ticked, toast says how many).
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- AD-7 `afterAction` paragraph l.148; AD-5 Look it up again bullet l.123; AD-20 restore sentence l.283; source tree l.577–590 (`backup/`).
- `messages/en.json`, `messages/fi.json` -- `toast.movedSkipped`, `toast.removedSkipped`; `tests/unit/messages.unit.spec.ts` checks parity.
- Tests to extend: `tests/unit/collectionList.unit.spec.ts` (router mock l.20, `reloads after an action succeeds` l.241); `tests/unit/collectionPage.unit.spec.ts` (`requireUser` mock l.63; Move cases l.590–660 assert `router.refresh` counts and a `VALIDATION` for an ordered tick l.642–650, now a skip; copy-line cases l.1012–1077 and l.1187–1205 assert refresh counts; edition line l.768; `removeCopiesAction` mocks return `data: null`); `tests/unit/readAndRating.unit.spec.ts`; `tests/unit/suggestRoute.unit.spec.ts` (pattern: `shelfRoute.unit.spec.ts` l.50–58); `tests/unit/shelfQuery.unit.spec.ts` l.37–38, l.69; `tests/unit/cover.unit.spec.ts`; `tests/int/moveCopies.int.spec.ts` (`locationFor`, `copyFor` helpers; ordered case l.110–127 rewritten); `tests/int/lookupAgain.int.spec.ts` merge case l.144–157; `tests/int/removeCopiesAction.int.spec.ts` and `tests/int/moveCopiesAction.int.spec.ts` (result shapes); `tests/int/editBook.int.spec.ts` (ordered-copy move, if asserted).
- `src/lib/copies/locations.ts` -- `deleteLocation(ctx, id)` l.175 for the Undo case; `resolveLocation` l.22.
- `src/app/(frontend)/scan/EditionPicker.tsx` `EditionLabel` and `next-intl`'s `createFormatter` for the Look it up again unit test (`useFormatter` must be mocked like `useTranslations`).

## Tasks & Acceptance

**Execution:**
- `src/lib/copies/moveCopies.ts`, `src/lib/copies/removeCopies.ts`, `src/lib/copies/receiveCopy.ts`, `src/lib/catalogue/editBook.ts` -- skip ordered copies, report `moved`/`removed` and `skipped`, restore a gone location as `null`; editBook keeps its `VALIDATION` -- items 2 and R4/R5.
- `src/app/(frontend)/(sections)/actions.ts`, `SelectBar.tsx`, `MovePicker.tsx`, `components/ui/Picker.tsx`, `messages/en.json`, `messages/fi.json` -- result shapes, untick rule, skip toasts, `maxLength` -- items 2 and R6.
- `src/app/(frontend)/(sections)/ShelfRows.tsx`, `CopyLine.tsx`, `Refetch.tsx`, `LookUpAgain.tsx` -- the refresh in `afterAction`, duplicates removed -- item 1.
- `src/lib/catalogue/lookupAgain.ts`, `src/lib/catalogue/lookupLimit.ts` -- count only before `lookupSources` -- R7.
- `src/lib/shelf/query.ts`, `src/lib/shelf/shelfIds.ts`, `src/app/(frontend)/(sections)/countLine.ts`, `src/app/(frontend)/data/suggest/route.ts` -- drop `tag`/`theme`, NFC `q` -- item 3.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- `languageName` on the edition line -- S6.
- `src/lib/backup/lastBackup.ts` (moved from `settings/lastBackup.ts`), `src/app/(frontend)/(sections)/settings/page.tsx`, `.env.example` -- the reader under `src/lib`, path from `BACKUP_STATUS_FILE` -- A4a.
- `src/app/(frontend)/styles.css`, `components/Cover.tsx`, `(sections)/CoverTile.tsx` -- tile minimums, placeholder, airmail band -- item 11.
- `DESIGN.md`, `EXPERIENCE.md`, `ARCHITECTURE-SPINE.md` -- the rows and rules named in the Code Map, same commit.
- `tests/unit/collectionList.unit.spec.ts`, `collectionPage.unit.spec.ts`, `readAndRating.unit.spec.ts`, `lookUpAgain.unit.spec.ts` (new), `suggestRoute.unit.spec.ts`, `shelfQuery.unit.spec.ts`, `cover.unit.spec.ts`, `lastBackup.unit.spec.ts`; `tests/int/moveCopies.int.spec.ts`, `lookupAgain.int.spec.ts`, `moveCopiesAction.int.spec.ts`, `removeCopiesAction.int.spec.ts` -- the matrix rows and item 4's four cases; existing assertions follow the new shapes.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `in-progress`, then `done`.

**Acceptance Criteria:**
- Given a Remove, Read, Move, Received or rating on the collection, when `afterAction` reports `ok` or `NOT_FOUND`, then the rows reload and the server render is refreshed in a transition afterwards, so the Filter panel's values and the cached first page follow; AD-7 says so.
- Given a selection with an ordered copy, when I tap Move or Remove in the action bar, then the owned copies are acted on, the ordered ones stay ticked, and the toast says how many were skipped; the move toast shows the number actually moved.
- Given a moved copy whose previous location has since been deleted, when I tap Undo, then the copy returns to no location and the toast reads "Undone".
- Given the creator's private Book with an ISBN that a shared Book already carries, when Look it up again runs with the user at the lookup limit, then it merges without `RATE_LIMITED`.
- Given `?tag=` or `?theme=` in the address, when the collection renders, then neither narrows the count line nor survives in links.
- Given a Book with language `fin`, when Book detail opens in English, then the edition line ends with "Finnish".
- Given `BACKUP_STATUS_FILE` set, when an admin opens Settings, then the Backup line reads that file.
- Given a Book with no cover, when it is shown as a tile at m or l, then the placeholder shows its title and author; at s and in rows the title only; an ordered copy's tile carries the airmail band.
- Given the four retro test gaps, when the unit lanes run, then each named behaviour has a passing case.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 28 findings — high 0, medium 2, low 19, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: AD-18 still says every selection action is all or none, and EXPERIENCE.md's Select mode Failure row too — real: the spine contract changed without its AD-18 line (CLAUDE.md makes the spine update part of the story). Patched: AD-18 now says move and remove skip ordered copies and report `skipped`, the not-the-viewer's refusal stays all or none; the Failure row says a skip is not a failure.
  - `[low]` `[patch]` Blind: moving copies that are all at the target already shows "0 moved to {location}" with an Undo that does nothing — real (`count` is now `moved`). Patched: `toast.moved` has a `=0` form ("Nothing moved"/"Ei siirretty mitään") and `MovePicker` offers Undo only when `count > 0`, in both branches.
  - `[low]` `[patch]` Blind: a numeric location with only ordered copies ticked is never checked; a stale id ends in a plain `Error`, so `INTERNAL` — real: `resolveLocation` returns a number unchecked and no write runs `ownedRelation`. Patched: `moveCopies` resolves no target when nothing is owned (`location: null`, the "Nothing moved" toast).
  - `[low]` `[defer]` Blind: the covers tile marks an ordered copy only visually; screen readers get nothing — real, but pre-existing (the tile had no ordered marker before); deferred.
  - `[low]` `[reject]` Blind: the Move restore runs one `count` on `locations` per moved copy — real but negligible for a bulk move of tens of copies inside one Undo; batching adds code for no user-visible gain.
  - `[low]` `[reject]` Blind: nothing in the frontend removes an ordered copy any more, and the Remove dialog counts ordered copies it will skip — skipping ordered copies is retro decision 1, which the intent cites; the dialog cannot count statuses of ticked copies outside the held rows without a new read, more than a direct correction for a case the toast already explains.
  - `[low]` `[defer]` Blind: the new AD-7 text implies the Filter panel follows a toast Undo, which with Book detail closed it does not — the AD-7 text says only that `ReadAndRating` refreshes for an Undo; the staleness itself is real, pre-existing and outside the intent (afterAction's actions); deferred.
  - `[low]` `[patch]` Blind: the airmail band uses a `#ffffff` literal and repeats its two tokens in both dark blocks; its geometry is fixed per size — the fixed 10px strip is what DESIGN.md specifies (not a defect); the literal and repeats are real. Patched: new `airmail-white` token in styles.css and DESIGN.md's colour table, the band's colours declared once in `@theme` like `crop-dim`.
  - `[low]` `[reject]` Blind: the 200-character location limit is repeated in `MovePicker`, `LocationsGroup` and `Locations.ts` — real duplication but pre-existing (`LocationsGroup` already copied it); one shared constant touches the collection, more than a direct correction.
  - `[low]` `[patch]` Blind: no test pins that `lookupAgain`'s held-candidate path counts no lookup — guards the AD-5/AD-9 rule this story wrote. Patched: the edition round-trip case spends the rest of the limit before the pick and still promotes.
  - `[false]` `[reject]` Blind: a rejected reload stops the refresh and leaves an unhandled rejection — `run` never rejects: `fetchData` turns network failures into `NO_CONNECTION` and `run` reports and returns `false`; no reachable path was shown.
  - `[false]` `[reject]` Blind: doing nothing is reported as a success toast, with a reload and refresh — the "Nothing moved/removed · {m} ordered skipped" toast is what decision 1 and the spec ask for; the reload is harmless.
  - `[low]` `[patch]` Edge: all-ordered selection with a stale numeric location throws a plain `Error` — same root cause and patch as the Blind finding above.
  - `[low]` `[patch]` Edge: no skip and every owned copy already at the target gives "0 moved to X" with a no-op Undo — same root cause and patch as the Blind finding above.
  - `[low]` `[patch]` Edge: Book detail's Remove on the last copy closes the panel when the copy turned ordered elsewhere and nothing was removed — real (`removeCopies` answers `ok` with `removed: 0`). Patched: `RemoveCopy` closes only when `result.data.removed > 0`; otherwise `afterAction`'s refresh shows the line.
  - `[low]` `[reject]` Edge: a location deleted between the restore's `count` and its `updateByID` fails the Undo — needs a concurrent delete inside one Undo's transaction window; the failure is loud (`UNDO_FAILED`) and the fix adds row locking.
  - `[low]` `[reject]` Verification gap: `DetailLookUpAgain`'s replace to the merged Book has no test — real gap, but the behaviour is 5.35's and no criterion of this story or spine rule names it (CLAUDE.md: a test-only finding is rejected unless it names one).
  - `[low]` `[patch]` Verification gap: `afterAction` with no rows mounted (Load failed) is never shown to refresh — the AD-7 text this story wrote names it. Patched: a `collectionList` case with `ShelfActionsProvider` and no rows expects one `router.refresh` and no fetch.
  - `[low]` `[patch]` Verification gap: `moveCopiesAction`'s new `count` and `location: null` mapping are untested at the action — the AC names "the number actually moved, which the toast shows". Patched: an int case with an owned copy, one at the target already and an ordered one (`count: 1`, `skipped: [ordered]`), then an ordered-only move (`location: null`, `count: 0`).
  - `[low]` `[patch]` Verification gap: held-candidate path not pinned to count nothing — same as the Blind finding above; same patch (the test first overspent the limit by the call before it, fixed to spend the remainder).
  - `[low]` `[patch]` Verification gap (other): all-at-target move toasts "0 moved" — same as the Blind finding above; same patch.
  - `[low]` `[patch]` Intent: the AC's "bar Remove followed by Back" case is shown through a probe's `afterAction`, not the bar — the ordering is guarded, but nothing tied the bar's Remove to the refresh. Patched: the `collectionPage` bar Remove case now waits for exactly one `router.refresh` after the reload. Back itself is Next's router cache, which no unit test can run.
  - `[medium]` `[patch]` Intent: the skip lives in the services, so AD-18 and EXPERIENCE.md's Failure row now contradict the code — same root cause and patch as the first Blind finding.
  - `[false]` `[reject]` Intent: "mirrored in `receiveCopy`" got a comment, not code — `receiveCopy`'s restore writes `status: 'ordered', location: null` and names no relation target, so the rule has nothing to change there.
  - `[false]` `[reject]` Intent: only deletion is exercised, not merge — `mergeLocation` deletes the source row, so the restore takes the same `stillThere()` path; the AC names a delete case only.
  - `[false]` `[reject]` Intent: the shelf `q` is NFC-normalised in `parseShelfQuery`, not in the route — `/data/shelf` and the page both parse through it, so the route receives the normalised `q`; the boundary is the same.
  - `[false]` `[reject]` Intent: the named 5.35/5.34 tests run at the client surface, not the server — the retro's V2/V3 gaps were exactly the missing client-surface tests; the server round trip is already in `lookupAgain.int.spec.ts`.
  - `[false]` `[reject]` Intent: "product type" read as the `label` role, and 4/3/2 columns only asserted in docs — the phone mock-up the decision came from sets the title in the product's type at label size; the column counts follow arithmetically from 350 and 335px of tile width (s 4, m 3, l 2 at both).

## Design Notes

Skipping lives in the services rather than the bar because the ticked set survives query changes: a ticked copy may not be among the held rows, so only the server knows its status. Returning `skipped` ids (not just a count) lets the bar untick exactly the acted copies. `removeCopies` reading `status` replaces its `count`; the owned-only rule is the EXPERIENCE.md "Your copies" rule (an ordered line has only Received), so no screen loses a path. `editBook` is the one caller that wants the old refusal, and checks the result instead.

The refresh follows the reload, not the action, so Next's router cache is replaced with a render that already reflects the write and the list never shows a page older than the rows. Components that refreshed only to re-render Book detail drop theirs because `afterAction` runs in every one of them; a double refresh would also break the page tests' counts.

Expected diff is near the compact-stories bound; the retro bundled these on purpose (decision 5). A reviewer finding that only says so is rejected per CLAUDE.md.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: passes (styles, messages, collection, cover, routes, shelfQuery, readAndRating, lookUpAgain, lastBackup)
- `npm run test:int -- tests/int/moveCopies.int.spec.ts tests/int/moveCopiesAction.int.spec.ts tests/int/removeCopiesAction.int.spec.ts tests/int/lookupAgain.int.spec.ts tests/int/editBook.int.spec.ts tests/int/undoAction.int.spec.ts` -- expected: passes
- `npx prettier --check` on the changed source, test, css and message files -- expected: clean

## Auto Run Result

**Summary:** The Epic 5 retrospective's collection loose ends (items 1–4 and 11) are closed in one pass.
- **Refresh:** `afterAction` now refreshes the server render in a transition once the rows have reloaded, or at once with no rows mounted. The Filter panel's values, Book detail and the cached first page follow every Remove, Read, Move, Received and rating. The six components that refreshed on their own no longer do.
- **Ordered copies:** `moveCopies` and `removeCopies` act on owned copies only and report `skipped`. The action bar leaves skipped copies ticked and the toast says how many were skipped. The move toast counts the copies actually written, and Undo is offered only when something moved. `editBook` still refuses a location on an ordered copy.
- **Move Undo:** a Move Undo whose previous location is gone restores the copy to no location. `lookupAgain` counts a lookup only when it asks the sources. The picker's "New location" field takes at most 200 characters.
- **Reconciliations:** `tag` and `theme` are gone from the shelf query until Epic 9. Book detail's edition line names the language. The backup reader lives in `src/lib/backup` and reads its path from `BACKUP_STATUS_FILE`. The shelf and suggest `q` are NFC-normalised.
- **Covers:** columns are at least 150 / 96 / 70px. A Book with no cover shows the typeset paperback placeholder, and an ordered copy's tile carries the airmail band.
- **Tests:** the four retro test gaps have tests.
- **Documents:** AD-5, AD-7, AD-18, AD-20 and the source tree in the spine, DESIGN.md's density table, colours and cover rows, and EXPERIENCE.md's Undo and Select mode rows are updated in the same commit.

**Files changed:**
- `src/lib/copies/moveCopies.ts`, `removeCopies.ts`: skip ordered copies, report `moved`/`removed` and `skipped`; a restore puts a gone previous location back as none.
- `src/lib/copies/receiveCopy.ts`: doc comment on the restore-target rule.
- `src/lib/catalogue/editBook.ts`: a skipped copy is `VALIDATION` on `location`.
- `src/lib/catalogue/lookupAgain.ts`, `lookupLimit.ts`: count only before `lookupSources`.
- `src/lib/shelf/query.ts`, `shelfIds.ts`, `src/app/(frontend)/(sections)/countLine.ts`: drop `tag`/`theme`; NFC `q`.
- `src/app/(frontend)/data/suggest/route.ts`: NFC `q`.
- `src/lib/backup/lastBackup.ts` (moved from `settings/lastBackup.ts`), `settings/page.tsx`, `.env.example`: path from `BACKUP_STATUS_FILE`.
- `src/app/(frontend)/(sections)/ShelfRows.tsx`: the refresh after the reload.
- `MovePicker.tsx`, `SelectBar.tsx`, `CopyLine.tsx`, `Refetch.tsx`, `LookUpAgain.tsx`, `actions.ts`, `components/ui/Picker.tsx`: result shapes, skip toasts, untick rule, `maxLength`, duplicate refreshes removed.
- `BookDetail.tsx`: `languageName` on the edition line.
- `components/Cover.tsx`, `CoverTile.tsx`, `styles.css`: placeholder, airmail band, tile minimums, `airmail-*` tokens.
- `messages/en.json`, `messages/fi.json`: `movedSkipped`, `removedSkipped`, and a zero form for `moved`.
- `ARCHITECTURE-SPINE.md`, `DESIGN.md`, `EXPERIENCE.md`: the rows above.
- Tests:
  - unit: `collectionList`, `collectionPage`, `readAndRating`, `lookUpAgain` (new), `suggestRoute`, `shelfQuery`, `cover`, `lastBackup`;
  - int: `moveCopies`, `moveCopiesAction`, `removeCopiesAction`, `copyWrites`, `editBook`, `lookupAgain`.
- `epic-5-context.md`: recompiled at the start of this run, since `epics.md` was newer.
- `sprint-status.yaml`: 5.38 done.

**Review findings:** one pass, 28 rows in the Review Triage Log. The verdicts were medium 2, low 19 and false 7. Two implementation agents were cut off before this pass (a lost connection, then exhausted usage credits). The step-3 agent could not be re-engaged, so the patches were applied in the main session.
- **Patched (9 entries):**
  - medium: AD-18 and EXPERIENCE.md's Failure row now describe the ordered-copy skip.
  - low: "Nothing moved" for an all-at-target move, and no no-op Undo.
  - low: no target resolved when nothing is owned, which fixes the stale-id `INTERNAL`.
  - low: Book detail's last-copy Remove closes only when something was removed.
  - low: `airmail-white` token, and the band's colours declared once.
  - low: the held-candidate lookup-limit test.
  - low: the no-rows refresh test.
  - low: the `moveCopiesAction` count and skipped test.
  - low: the bar Remove's refresh assertion.
- **Deferred (2):**
  - The covers tile has no screen-reader text for an ordered copy. This predates the story.
  - With Book detail closed, a toast Undo does not refresh the Filter panel. This predates the story and is outside the intent.
- **Rejected:**
  - low: one `count` per restored copy (negligible).
  - low: ordered copies cannot be bulk-removed and the dialog counts them (decision 1; would need a new read).
  - low: the 200-character limit is repeated (pre-existing; fixing it touches the collection).
  - low: a location deleted between the restore's `count` and its write (needs a concurrent delete; fails loudly).
  - low: `DetailLookUpAgain`'s replace is untested (5.35 behaviour; CLAUDE.md rejects test-only findings that name no criterion).
  - false: a rejected reload (unreachable).
  - false: the "Nothing moved" success toast (as specified).
  - false: `receiveCopy` needs no code.
  - false: the merge path shares the delete path.
  - false: NFC in the parser is at the route.
  - false: the client-surface tests are what the retro asked for.
  - false: the product type and the column arithmetic.

**Follow-up review recommendation:** false. The patched entries were high 0, medium 1 and low 8.

**Verification:**

| Check | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run test:unit` | 62 files, 903 tests passed |
| `npm run test:int` on moveCopies, moveCopiesAction, removeCopiesAction, lookupAgain, editBook, undoAction, copyWrites, receiveCopy | 8 files, 54 tests passed |
| Prettier on every changed source, test, CSS and message file | clean |
| ESLint | 0 errors outside `.claude/` |

- The run went green before the review and again after the patches.
- The 22 ESLint errors that remain are generated files in the parallel 5.39 worktree under `.claude/worktrees`. Story 5.39's item 42 makes ESLint ignore that path.
- Matrix audit: every row is covered by a passing case. The `BACKUP_STATUS_FILE` row got its test during the audit, and the unknown-language fallback is covered by the existing `languageName` test.
- Not checked in a browser or on a phone. Nothing has been seen rendered: the airmail band, the placeholder, and the 4 / 3 / 2 columns at 375 and 390px are checked by arithmetic and DOM tests only.

**Residual risks:**
- Story 5.39 is being built beside this one, in `.claude/worktrees/story-5-39-epic-4-leftovers` on its own Postgres at port 5433. Files both stories touch:
  - `ARCHITECTURE-SPINE.md` (AD-5, AD-9, Tests and Text input rows)
  - `DESIGN.md` (220px filter width)
  - `src/lib/catalogue/lookupLimit.ts` (5.39 item 52)
  - `epic-5-context.md` (5.39 item 59 recompiles it)
  - `sprint-status.yaml`
  
  Whichever merges second keeps both sets of edits.
- The hand-written diff is about 520 changed lines in `src`, messages and `.env.example`, near the compact-stories bound. Tests add about 550 more. The retro bundled these items on purpose (decision 5).
- The refresh is now the only thing that re-renders Book detail after Move, Remove, Received, Re-fetch and Look it up again. Next's router cache honouring `router.refresh()` on a later Back is covered by no automated test (Playwright covers only scan-to-save and shop check).
