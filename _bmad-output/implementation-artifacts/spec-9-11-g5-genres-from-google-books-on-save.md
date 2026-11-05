---
title: '[G5] Genres from Google Books on save'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_revision: '819366767b0fa75030d96f06ae33d8619a7ff4eb'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      `remapGenres()` has no caller: the admin trigger needs a screen.
    evidence: |-
      Story 9.11 builds the service only; the Settings Genres group is Story 9.14. Handed to 9.14 as an acceptance criterion in epics.md (CLAUDE.md, Conventions).
    location: >-
      src/lib/catalogue/remapGenres.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** `mapSubjectsToGenres()` is a stub, so every saved shared Book has no system genres and nobody can filter or browse by them (FR-17, D-2).

**Approach:** Implement the stub where AD-5 puts it. Google's categories match system genres by `nameKey` on the English name and create missing ones; Finna's genre terms also map, match-only (Mika, 2026-11-05), because Google covers 5 of 30 fixture books. An admin-only `remapGenres()` fills `books.genres` on shared Books saved before.

## Boundaries & Constraints

**Always:** Matching is `toNameKey()` equality, no accent folding. A created genre has the category as its English name and no Finnish name. Finna terms match a genre's English or Finnish name. Result ids are distinct, Google's first, then Finna's. Runs in the caller's transaction, one call after the other (AD-16). `remapGenres()` writes only where `books.genres` is empty and only on shared Books.

**Never:** Finna terms never create a genre. Enrichment (Kirjasampo) and Open Library/Hardcover subjects are not read (spine, AD-9). No change to `lookupBook` (9.12), no genre admin UI (9.13, 9.14), no schema change.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Google match | `subjects.google = ['fiction']` | Id of seeded Fiction | No error expected |
| Google new | `['Weird Science']`, no such genre | Genre created (English only), its id returned | No error expected |
| Finna match | Finna `genres` has `kaunokirjallisuus`, `romaanit` | Id of Fiction (Finnish name); `romaanit` ignored | No error expected |
| Both | Google `Fiction` and Finna `kaunokirjallisuus` | Fiction once | No error expected |
| No data | no `subjects.google`, no Finna records | `[]`, no write | No error expected |
| Re-run | Shared Books: one empty, one with genres | Empty one filled when mappable; the other untouched | Non-admin: `NOT_FOUND` before any read |

</intent-contract>

## Code Map

- `src/lib/catalogue/mapSubjectsToGenres.ts` -- the stub; callers `ensureSharedBook.ts` and `sharePrivateBook.ts` (`promote`) pass the `RawMetadata` they save, so the signature stays `(ctx, raw)`.
- `src/lib/metadata/source.ts` -- `RawMetadata`: `subjects.google` is a string list; Finna's cut response is `sources.finna` (`{ records: [{ genres?: string[] }] }`, `genres` is in `FINNA_FIELDS`).
- `src/lib/catalogue/refetchBook.ts` -- pattern for the admin gate (`canEditShared`, `NOT_FOUND`) and `withTransaction` plus `system(tx)`.
- `src/lib/catalogue/system.ts`, `src/fields/nameKey.ts` (`toNameKey`), `src/collections/Genres.ts` (`name`, `nameFi`, unique hook-made `nameKey`).
- `tests/fixtures/finna/*.json`, `tests/fixtures/google/*.json` -- stored raw data for the tests; `tests/helpers/harness.ts` (`createUser`, `contextFor`).

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/mapSubjectsToGenres.ts` -- implement per Always/Never -- one read of all genres, matches in memory, creates sequentially.
- `src/lib/catalogue/remapGenres.ts` -- `remapGenres(ctx): Promise<{ scanned: number; updated: number }>`: gate, then in one transaction page through shared Books, map `rawMetadata`, update empty ones with a non-empty result -- the AC's admin-only re-run.
- `tests/int/mapSubjectsToGenres.int.spec.ts` -- cases from the matrix on raw built from a Google and a Finna fixture; re-run fills only empty and rejects a non-admin.
- `ARCHITECTURE-SPINE.md` -- AD-5's genre sentence: drop "until the genre stories land it returns none", add the Finna match-only rule and `remapGenres()`.

**Acceptance Criteria:**
- Given a shared Book is saved with Google categories, when `ensureSharedBook()` runs, then `books.genres` holds the matched or created genres.
- Given Google found nothing but Finna records carry genre terms naming a system genre, when the Book is saved, then that genre is set and unmatched Finna terms create nothing.
- Given an admin runs `remapGenres()`, when shared Books saved earlier have no genres, then they get them from stored raw data and Books that already have genres are unchanged; a non-admin gets `NOT_FOUND`.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 5, false 6, maybe-false 0 (13 rejected below, 1 deferred)
- findings:
  - `[low]` `reject` Malformed or old `rawMetadata` aborts the whole re-run (edge-case, blind) — `rawMetadata` is written only by this app as `v: 1` with `subjects` and `sources`; no stored shape lacks them, and the guard would add branches for a state not shown reachable.
  - `[low]` `reject` Non-string `subjects.google` entry throws (edge-case) — the Google adapter emits strings only.
  - `[low]` `reject` Hierarchical or verbatim Google category creates a new genre (edge-case, blind) — the AC says match by `nameKey` and create missing; Story 9.12 shows "New genre" so odd categories are noticed.
  - `[low]` `reject` Concurrent creates of one new category fail one save (edge-case, blind) — AD-19 lets a lost race surface as the unique index's `ValidationError`; one user.
  - `[low]` `reject` Finnish name equal to another genre's English name overwrites in `byAny` (edge-case, blind) — no such pair in the seed and the admin UI (9.14) would have to create it.
  - `[low]` `reject` Category longer than 200 characters fails the save (edge-case) — Google categories are short; unlikely.
  - `[false]` `reject` Remap re-adds genres an admin cleared (edge-case) — the AC says fill where empty, nothing marks a clear.
  - `[false]` `reject` One long transaction over the catalogue (edge-case, blind, verification-gap) — a few hundred Books; all-or-nothing is the spec's choice.
  - `[false]` `reject` Finna terms come from other editions (blind) — stored Finna raw is cut to the records matching the Book's ISBN (adapter, `leanFinnaRaw`).
  - `[false]` `reject` Mapper reads all genres once per Book in a re-run (verification-gap) — about 50 rows each; not a defect.
  - `[false]` `reject` Save wiring not shown in the diff (blind, intent-alignment) — `ensureSharedBook` and `sharePrivateBook` already call the mapper; the changed `ensureSharedBook` test asserts it.
  - `[false]` `reject` Signature takes `raw`, not `book` (intent-alignment) — callers have the raw before the Book exists; the stub's signature stays.
  - `[low]` `defer` `remapGenres` has no caller or trigger (blind, intent-alignment) — handed to Story 9.14 as an acceptance criterion.
  - `[low]` `reject` No promote-path (`lookupAgain`) genre assertion (verification-gap) — test-only; the call is the one the save path tests, and no AC or spine rule names the promote site.
  - `[low]` `reject` `ensureSharedBook` assertion weakened to length 1; `updated >= 1` loose; no test for Book without raw or private Book left alone; fixture-coupled tests (blind, verification-gap, intent-alignment) — test-only findings with no AC or spine rule named.
  - `[false]` `reject` Finna fallback not conditional on 9.16 (intent-alignment) — the checkpoint is recorded: Google covers 5 of 30, so the fallback is always on.
  - `[false]` `reject` Finna match semantics left open by the intent (intent-alignment) — decided with Mika, 2026-11-05, match-only.

## Design Notes

A genre created on save is vocabulary, not Book data: it survives Undo of that save, like a seeded one, and the admin deletes it in genre management (9.13). Finna match-only was decided with Mika because the seed is Google's vocabulary and most Finna terms (`romaanit`, `käännökset`) are form or language terms.

## Verification

**Commands:**
- `npm run test:reset && npm run test:int` -- expected: all pass
- `npm run typecheck` and `npm run lint` -- expected: clean

**Manual checks (if no CLI):**
- No screen changes, so no Playwright walk.

## Auto Run Result

Status: done

**Summary:** `mapSubjectsToGenres()` now maps Google categories (match by `nameKey`, create missing with an English name) and Finna genre terms (match English or Finnish name, never create) to system genres on save; `remapGenres()` is the admin-only re-run that fills empty `books.genres` on shared Books.

**Files:** `src/lib/catalogue/mapSubjectsToGenres.ts` (mapper), `src/lib/catalogue/remapGenres.ts` (admin re-run), `tests/int/mapSubjectsToGenres.int.spec.ts` (6 tests on fixture raw data), `tests/int/ensureSharedBook.int.spec.ts` (genres assertion), `ARCHITECTURE-SPINE.md` (AD-5), `epics.md` (new Story 9.14 criterion).

**Review:** 0 patches, 1 deferred (re-run trigger, handed to Story 9.14), the rest rejected with reasons in the Triage Log. Follow-up review not recommended.

**Verification:** `npm run test:reset && npm run test:int` 769 passed; typecheck clean; lint 0 errors. No screen changed, so no Playwright walk.

**Residual risks:** A genre created on save survives Undo of that save. Finna terms are match-only, so most Finna terms (`romaanit`, `käännökset`) add nothing; Google covers 5 of 30 fixture books, so most Books get few genres until admin edits. The re-run runs in one transaction over every shared Book.
