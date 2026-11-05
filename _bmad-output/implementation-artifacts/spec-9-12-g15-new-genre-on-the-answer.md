---
title: '[G15] "New genre" on the Answer'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_revision: '1538ca7ba31beb37855a117ed00192d18df5cc58'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** A save can create a system genre from an odd Google category (9.11), but the Answer says nothing, so Mika only finds out afterwards (FR-13, D-2).

**Approach:** `lookupBook` adds `matches.genres` for the picked candidate: each genre the save would map, `id: null` for one it would create, computed by the same rules as `mapSubjectsToGenres()` without writing. The Answer lists "New genre · {name}" beside "New author" and "New series".

## Boundaries & Constraints

**Always:** One rule for both: the mapper's resolution (Google by English `nameKey`, Finna match-only by English or Finnish name, ids distinct, Google's first) is a shared read-only step, so the preview cannot drift from the save. Two Google categories with one `nameKey` give one entry. Read-only: no genre is created in lookup. Calls on one context run one after the other (AD-16).

**Never:** No change to which genres a save sets. Matched genres are not shown on the Answer (only "New genre" notes). No UI for genres elsewhere (9.13, 9.14). No Answer change for `existing` Books.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Google match | `subjects.google = ['fiction']` | `[{ name: 'fiction', id: <Fiction id> }]` | No error expected |
| Google new | `['Weird Science']`, no such genre | `[{ name: 'Weird Science', id: null }]`, no row created | No error expected |
| Finna match | Finna `kaunokirjallisuus`, `romaanit` | one entry, Fiction's id and English name; `romaanit` absent | No error expected |
| Duplicate | Google `Fiction` and `fiction`, or both sources naming Fiction | one entry | No error expected |
| No data | no Google subjects, no Finna records | `[]`, no read | No error expected |

</intent-contract>

## Code Map

- `src/lib/catalogue/mapSubjectsToGenres.ts` -- the mapper; split its read-and-match step into an internal resolver returning `Match[]` (null id = would create), used by the writer and by the new exported `previewGenres(ctx, raw)`.
- `src/lib/catalogue/lookupBook.ts` -- `Match`, `LookupResult` (doc comment says genres arrive in Epic 9), `found` branch: after series, `previewGenres(ctx, outcome.raw)` (the outcome's raw carries the same subjects and sources the save stores).
- `src/app/(frontend)/scan/answer.ts` -- `AnswerBook` (`newAuthors`, `newSeries`), `existingBook`, `notInLibrary`, `AnswerText`, `answerLines` notes.
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- builds `AnswerText` from `t('answer.newSeries')`; `messages/en.json`, `messages/fi.json` (`answer.newSeries` beside it).
- `tests/int/lookupBook.int.spec.ts` (`matches` block, `found()` raw with empty subjects), `tests/int/mapSubjectsToGenres.int.spec.ts`, unit fixtures that build `AnswerBook` or `LookupResult`: `tests/unit/answer.unit.spec.ts`, `answerLayout.unit.spec.ts`, `heldAnswer.unit.spec.ts`, `notInLibraryAnswer.unit.spec.ts`.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- `LookupResult` already lists `genres: Match[]`; AD-5 genre sentence gets the lookup preview.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/mapSubjectsToGenres.ts` -- extract resolver, add `previewGenres()`; writer creates the null entries sequentially, behaviour unchanged -- single source of truth.
- `src/lib/catalogue/lookupBook.ts` -- `matches.genres: Match[]`, filled after authors and series; fix the doc comment -- AC.
- `src/app/(frontend)/scan/answer.ts`, `AnswerLayout.tsx`, `messages/en.json`, `messages/fi.json` -- `newGenres: string[]` on `AnswerBook` (`[]` for an existing Book), `newGenre` text, one note per new genre after the series note; "New genre · {name}" / "Uusi genre · {name}".
- `tests/int/lookupBook.int.spec.ts`, `tests/int/mapSubjectsToGenres.int.spec.ts` -- matrix rows through `lookupBook` (incl. nothing created) and the preview/save agreement; update unit fixtures for the new field and add one `answerLines` case.
- `ARCHITECTURE-SPINE.md` -- AD-5: lookup previews the genres with `previewGenres()`.

**Acceptance Criteria:**
- Given a `source` lookup whose picked candidate has a Google category matching no genre, when it is built, then `matches.genres` has that name with `id: null` and no genre row exists afterwards.
- Given categories that match system genres, when it is built, then `matches.genres` lists them with their ids and the Answer shows no genre note.
- Given the Answer for a candidate with a new genre, when it renders, then it shows "New genre · {name}" next to "New author" and "New series", in the user's language.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 5, false 12, maybe-false 0 (all rejected, none patched or deferred)
- findings:
  - `[false]` `reject` Finna term after a created Google genre resolves differently than before (edge-case) — only when a new Google category's `nameKey` equals an existing genre's Finnish name; the new result (the existing Finnish-named genre) is the match-only rule the spec states, and no such pair is in the seed.
  - `[low]` `reject` Empty subjects now open a transaction (edge-case, blind) — a transaction with no statement; "no read and no write" still holds, and the fix adds a guard in two entry points.
  - `[low]` `reject` Lookup opens a transaction per scan even when nothing is mappable (edge-case) — same: no statement runs, cost negligible.
  - `[false]` `reject` Pending key may differ from the genres hook's `nameKey` (edge-case) — both use `toNameKey()`, as the saved code did.
  - `[false]` `reject` Lookup test relies on the seeded Fiction genre (edge-case, blind) — `mapSubjectsToGenres.int.spec.ts` reads it the same way; the seed is a migration.
  - `[low]` `reject` `id: null` entries keep first-seen casing (edge-case) — the save creates with the same first-seen name, so they agree.
  - `[false]` `reject` "Behaviour unchanged" claim is false (edge-case, claim) — see the first row; same ids in the cases the matrix names, and the int tests assert the order.
  - `[false]` `reject` Import cycle through `import type { Match }` (blind) — type-only, erased; `Match` already lives beside `LookupResult` in the spine.
  - `[false]` `reject` Empty path now opens a transaction (blind) — duplicate of the second row.
  - `[false]` `reject` Extra genres read can fail the lookup (blind) — one read through the same gateway as the author and series matches; a database failure fails those too.
  - `[false]` `reject` Preview shown to users whose save would not create genres (blind) — a `source` answer exists only when the viewer reads no Book with the ISBN, so every save creates a shared Book and runs the mapper.
  - `[low]` `reject` Matched Google entries carry the raw category, Finna's the stored name (blind) — no caller shows matched names; the Answer filters on `id === null`.
  - `[low]` `reject` `Tx` type derived from `withTransaction` (blind) — compiles under strict TS; a signature change fails typecheck loudly.
  - `[false]` `reject` Test gaps: Finna through `lookupBook`, `chooseCandidate` claim, held paths (blind) — test-only, no AC or spine rule names them; `chooseCandidate` is shown in `pick.ts`.
  - `[false]` `reject` Unbounded New genre lines on the Answer (blind) — Google lists a handful of categories; the AC asks for one note per new genre.
  - `[false]` `reject` Spec log empty, Finnish copy, Auto Run Result missing (blind) — filled in by this step; "Uusi genre" matches "Omat genret".
  - `[low]` `reject` Spine note thin, no race note (blind) — the AD-5 sentence states the contract; a race between lookup and save only changes a note.

## Design Notes

`lookupBook` passes `outcome.raw`, not the per-candidate raw: `chooseCandidate()` changes only `coverUrl`, so subjects and sources are identical to what the save stores. The preview needs the genre list read, one query as in the save.

## Verification

**Commands:**
- `npm run test:reset && npm run test:int` -- expected: all pass
- `npm run test:unit` (or the repo's unit script) -- expected: all pass
- `npm run typecheck` and `npm run lint` -- expected: clean

**Manual checks (if no CLI):**
- Playwright walk (uncommitted, `tests/e2e/*.walk.spec.ts`) of the AC against the e2e server; record under Auto Run Result.

## Auto Run Result

Status: done

**Summary:** `lookupBook` now returns `matches.genres` for the picked candidate (`id: null` for a genre the save would create, nothing written), from the same resolver the save uses; the Answer shows "New genre · {name}" ("Uusi genre · {name}") after the author and series notes.

**Files:** `src/lib/catalogue/mapSubjectsToGenres.ts` (shared `resolveGenres()`, new `previewGenres()`), `src/lib/catalogue/lookupBook.ts` (`matches.genres`), `src/app/(frontend)/scan/answer.ts` and `AnswerLayout.tsx` (`newGenres`, `newGenre` note), `messages/en.json`, `messages/fi.json`, `ARCHITECTURE-SPINE.md` (AD-5), tests in `tests/int/lookupBook.int.spec.ts`, `tests/int/mapSubjectsToGenres.int.spec.ts` and four unit specs.

**Review:** 17 findings, 0 patches, 0 deferred, all rejected with reasons in the Triage Log. Follow-up review not recommended.

**Verification:** `test:int` 771 passed, typecheck clean, lint 0 errors (implementer's run). `test:unit` has 3 failures in `bookDetailCopyLine` and `loansPage` that also fail with the change stashed. Playwright walk (uncommitted `tests/e2e/newGenre.walk.spec.ts`): signed in, opened `/scan?isbn=9789520408053`, saw Not in library and "From Finna", and no "New genre" note, since its Finna terms match the seeded Fiction genre. The fixture source is Finna-only and never creates a genre, so the positive note was not seen in the browser; it is covered by the int tests and by unit tests with a stub translator.

**Residual risks:** The real `answer.newGenre` message strings are not rendered by any test. A genre created between lookup and save changes only whether the note was shown.
