---
title: '[G12] Genres in Settings, admin only'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_revision: '885e37ac4eb7b80ea843bf0bbf814eacbb2cf7ed'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /Users/mika/development/bookeh/CLAUDE.md
  - /Users/mika/development/bookeh/_bmad-output/implementation-artifacts/epic-9-context.md
  - /Users/mika/development/bookeh/_bmad-output/implementation-artifacts/spec-9-9-g9-tags-my-genres-and-my-themes-in-settings.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The admin can manage system genres only through services (9.13) and `remapGenres` (9.11); Settings has no Genres group.

**Approach:** An admin-only Genres group in Settings' second column, laid out as mock-up option A (`mockups/genres-settings-options.html`, picked by Mika 2026-11-05): ordinary List rows, an Edit that opens English and Finnish fields in place, Add genre, Merge and Delete dialogs, and a Re-map genres button. Extend `ManagedList` rather than fork it.

## Boundaries & Constraints

**Always:** Follow Story 9.14 in epics.md and EXPERIENCE.md Settings → Genres. Row: name in the viewer's language (Finnish name when the UI is Finnish and set), "No Finnish name" mark where `nameFi` is empty, "N books", then Edit, Merge, Delete. Edit opens English and Suomi fields under the row with Save and Cancel; Save sends only what changed (`renameGenre`, `setGenreNameFi`), a name in use shows "already in use" under that field, other failures use `report`. Add genre uses the existing name field (English only; Finnish via Edit). Merge (Picker, then dialog) and Delete are confirmed by dialogs saying how many Books are affected; no Undo, no toast. Actions authenticate first, validate ids with `isRowId`, then call the 9.13 service. The group renders only when `canEditShared(ctx.user)`; read with `genreUse(ctx)` after the other reads on the one context. Re-map genres calls `remapGenres(ctx)` and reports "{n} Books updated" in a success toast, no Undo; it is disabled while running. All strings in English and Finnish. Read the relevant installed Next docs before code.

**Never:** Change `lib/catalogue` services or the schema, add Undo, show the group or run an action for a non-admin, render private tags, genres or themes in it, commit the browser walk.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Non-admin | Any user without `canEditShared` | No Genres group, no `genreUse` read | Actions answer `NOT_FOUND` |
| Missing Finnish | Genre with empty `nameFi` | "No Finnish name" mark on its row | - |
| Edit | Changed English and/or Finnish | Only changed names saved, list refreshed | `NAME_TAKEN` message under the field; `NOT_FOUND` refreshes |
| Add | New English name | Row appears, mark shown | `NAME_TAKEN`/blank shown under the field |
| Merge / Delete | Genre with N Books | Dialog states N Books; success refreshes | `NOT_FOUND` refreshes, others reported |
| Re-map | Admin presses it | Toast "{n} Books updated" (0 allowed) | Failure reported |
| Hostile input | Non-id, non-string name | `VALIDATION`, no write | - |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/settings/ManagedList.tsx` -- add optional `editor` ({ label, render(item, done) }) replacing the single-field Rename, and optional `ManagedItem.note` shown with the count in the row's `meta` (the mark).
- `src/app/(frontend)/(sections)/settings/GenresGroup.tsx` (new) -- wraps `ManagedList` with genre actions/strings; holds a `GenreEditor` (two `TextField`s, Save/Cancel) and the Re-map button.
- `src/app/(frontend)/(sections)/settings/actions.ts` -- `addGenreAction`, `renameGenreAction`, `setGenreNameFiAction`, `mergeGenreAction`, `deleteGenreAction`, `remapGenresAction` beside the tag ones (`requireUserOrThrow`, `name`/`id` guards); remap returns `{ updated }`.
- `src/app/(frontend)/(sections)/settings/page.tsx` -- admin-only read `genreUse(ctx)`, items named via `genreName(row, profile.language)`, `note` when `nameFi` empty, group after My themes and before Backup; update the doc comment.
- `src/lib/catalogue/genres.ts`, `remapGenres.ts` -- read-only (9.13, 9.11); `src/lib/books/genreName.ts` -- reuse; `src/access/roles.ts` `canEditShared`.
- `messages/en.json`, `messages/fi.json` -- `settings` keys: heading, empty, add, edit, English/Suomi labels, Save/Cancel, mark, merge/delete strings, re-map button and toast.
- `tests/unit/genresGroup.unit.spec.ts` -- pattern: `tests/unit/tagsGroup.unit.spec.ts`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 9-14 to done.

## Tasks & Acceptance

**Execution:**
- `ManagedList.tsx` -- `editor` and `note` hooks -- one shared list, no fork
- `actions.ts` -- six genre actions -- auth-first, strict boundary
- `GenresGroup.tsx`, `page.tsx` -- the group, admin-only -- UX-DR50
- `messages/en.json`, `messages/fi.json` -- strings
- `tests/unit/genresGroup.unit.spec.ts` -- one focused test: the mark appears only where `note` is set, Edit sends only the changed name, delete dialog states the Book count
- `tests/int/` -- one test only if an action carries logic beyond the guards (the services are covered by 9.13)
- Ignored walk `tests/e2e/settings-genres.walk.spec.ts` on the e2e server at 1300px and 390px as admin and as a non-admin: group present/absent, mark, Edit, Add, Merge and Delete dialogs, Re-map toast; record what it saw under `## Auto Run Result`
- Spec and `sprint-status.yaml` -- record result

**Acceptance Criteria:**
- Given an admin opens `/settings`, then a Genres group lists every system genre in their language with its Book count and "No Finnish name" where `nameFi` is empty; given a non-admin, then the group is absent.
- Given Edit on a genre, when English and/or Finnish names change and are saved, then only those names are written and the list refreshes; a name in use is refused under its field.
- Given Add genre, Merge or Delete, then Add opens a name field, and Merge and Delete are confirmed by dialogs stating the Books affected, with no Undo.
- Given "Re-map genres", when pressed, then `remapGenres(ctx)` runs and a toast reports how many Books it updated, with no Undo.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 33 findings — high 0, medium 0, low 22, false 11, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind hunter: `genreEmpty` string missing — `settings.genreEmpty` exists since 9.9 (`messages/en.json:71`); `locationCount`, `deleteTitle`, `nameRequired` likewise exist.
  - `[low]` `[patch]` Blind hunter, edge-case hunter (two rows), intent auditor: Edit saves English then Finnish, and a failure on the second leaves the first written with a stale list and editor — patched: `GenreEditor` refreshes the list after any earlier success or `NOT_FOUND`.
  - `[false]` `[reject]` Blind hunter: Finnish validation keyed `name`, not `nameFi` — `normalisedName(nameFi, 'nameFi')` keys the error `nameFi` (`lib/payload/ownedName.ts:25-27`).
  - `[low]` `[reject]` Blind hunter, edge-case hunter: Edit drops the merge offer on a taken name — the story asks for Edit with in-place fields and says nothing of a merge offer; the fix adds surface.
  - `[low]` `[reject]` Blind hunter: Re-map has no confirmation dialog — the criterion asks for a report of how many Books were updated, with no Undo; it fills only empty genres and never overwrites.
  - `[low]` `[reject]` Blind hunter: test is thin and over-bundled — CLAUDE.md asks for one focused test per behaviour the criteria name; rows below ask for more tests with no named criterion.
  - `[low]` `[reject]` Blind hunter: `normalise` copied a third time — a two-line helper in a client file; sharing it would add a cross-layer export for no defect.
  - `[low]` `[patch]` Blind hunter: `genreName` import out of alphabetical order in `page.tsx` — reordered.
  - `[low]` `[patch]` Blind hunter: `actions.ts` header comment far over the usual width — rewrapped.
  - `[false]` `[reject]` Blind hunter: `nameEnglish` is "English" in the Finnish file — intended, the label names the language the field holds.
  - `[low]` `[reject]` Blind hunter: no hint that a blank Finnish value clears the name — not in the spec or the mock-up; a hint adds copy no one asked for.
  - `[low]` `[carried]` `[patch]` Edge-case hunter: partial write leaves `genre.nameEn` stale — same root cause as the patched row above.
  - `[false]` `[reject]` Edge-case hunter: Finnish field shows "Enter a name." — the service clears on blank, so the only `nameFi` validation failure is `TOO_LONG`; `nameRequired` cannot reach it.
  - `[false]` `[reject]` Edge-case hunter: only whitespace edited closes silently — an unchanged name needs no write; `done()` with no call matches `NameField`.
  - `[false]` `[reject]` Edge-case hunter: English blanked is unmapped — a blank English name makes `renameGenre` fail `VALIDATION` on `name`, which `failure()` maps to `nameRequired`.
  - `[low]` `[reject]` Edge-case hunter: neither `editor` nor `rename` given shows a dead Rename — no caller does this; a guard adds a branch for an internal misuse.
  - `[low]` `[reject]` Edge-case hunter: Merge or Delete on a row whose editor is open — Save would answer `NOT_FOUND`, which the editor handles by refreshing; needs an unusual sequence.
  - `[low]` `[reject]` Edge-case hunter: Re-map by a demoted admin leaves a stale group — `NOT_FOUND` is reported; demotion mid-session is outside Phase 1's one admin.
  - `[low]` `[carried]` `[patch]` Edge-case hunter: another failure code after the first call wrote — same root cause as the patched row above.
  - `[low]` `[reject]` Edge-case hunter: `genreUse` rejects for an admin demoted between reads — same demotion race; the gate and the read use one `ctx.user`.
  - `[false]` `[reject]` Edge-case hunter: duplicate `edit`/`save`/`cancel` JSON keys — a scan of the `settings` block in both files finds no duplicate key.
  - `[low]` `[reject]` Edge-case hunter: Merge/Delete dialogs reuse tag wording — the wording is generic ("Merge X into Y?", "N books move"); Finnish review is a recorded residual risk.
  - `[low]` `[reject]` Edge-case hunter: dialogs show the Finnish label to an admin in Finnish — the criterion says the list is in the user's language.
  - `[false]` `[reject]` Edge-case hunter: `genreUse` count may differ from the merge/delete set — both count Books with `genres equals id` under `system()`, shared and private alike.
  - `[low]` `[reject]` Edge-case hunter: no test for the name-in-use path or refresh — the epics criteria do not name it; the walk saw the message.
  - `[low]` `[reject]` Verification-gap reviewer: page admin gate untested — the criterion is covered by the walk as admin and non-admin; page rendering is not a unit-test target under the Tests convention.
  - `[low]` `[reject]` Verification-gap reviewer: editor failure paths and Re-map untested — no epics criterion names them; the walk covered the in-use message and the toast.
  - `[low]` `[reject]` Verification-gap reviewer: type no longer requires `editor` or `rename` — same as the dead-Rename row above.
  - `[false]` `[reject]` Verification-gap reviewer: regression coverage of the `ManagedList` refactor — it found no gap; the location, People and tag group tests pass.
  - `[false]` `[reject]` Verification-gap reviewer: possible duplicate keys in `en.json`/`fi.json` — scanned, none.
  - `[low]` `[reject]` Intent auditor: the test exercises the component, not the page — same as the page-gate row.
  - `[low]` `[carried]` `[patch]` Intent auditor: two sequential calls can leave the first written — same root cause as the patched row above.
  - `[false]` `[reject]` Intent auditor: `genreEmpty` and `locationCount` might be missing — both exist.

## Verification

**Commands:**
- `npm run typecheck` -- passes
- `npm run test:unit -- tests/unit/genresGroup.unit.spec.ts tests/unit/tagsGroup.unit.spec.ts tests/unit/peopleGroup.unit.spec.ts tests/unit/messages.unit.spec.ts` -- passes
- Scoped `npx eslint` on changed files and `git diff --check` -- clean

**Manual checks:**
- Ignored Playwright walk as above against `bookeh_test`; screenshots of phone and wide inspected.

## Auto Run Result

Status: done

Admin-only Genres group in Settings (after My themes, before Backup): `ManagedList` is now generic with an optional `editor` (replaces the single-field Rename; `actions.rename` optional) and `ManagedItem.note` (mark in the row meta). New `GenresGroup.tsx` (GenreEditor with English/Suomi fields, Re-map button), six actions in `settings/actions.ts`, `genreUse(ctx)` read only when `canEditShared`, en/fi strings, one unit test.

Verification: typecheck passed; unit tests (genresGroup, tagsGroup, peopleGroup, messages) 42 passed; ESLint and `git diff --check` clean. Ignored walk `tests/e2e/settings-genres.walk.spec.ts` passed at 1300px and 390px on bookeh_test: group absent as non-admin, present as admin; mark and "1 book"; Edit saves only the Finnish name; English onto a name in use shows "already in use" under the field; Add; Merge dialog "1 book moves to"; Delete dialog "No books lose it."; Re-map toast with no Undo. The phone screenshot was too tall (seeded genres) to inspect visually.

Residual risks: Finnish wording unreviewed; Merge/Delete reuse the tag merge strings. Walk uncommitted and ignored; it temporarily grants the e2e user admin and restores roles.

Review: four layers, 33 findings; one low patch group (a partial Edit save now refreshes the list), two cosmetic patches (import order, comment width); no deferrals; the rest rejected with reasons in the triage log. Follow-up review recommended: false (patched: low 4, medium 0, high 0). Verification after patches: typecheck passed, 44 unit tests passed (genresGroup, tagsGroup, peopleGroup, locationsGroup, messages), Prettier, ESLint and `git diff --check` clean.
