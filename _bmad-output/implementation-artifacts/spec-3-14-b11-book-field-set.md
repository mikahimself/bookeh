---
title: 'Story 3.14: [B11] Book field set'
type: 'feature'
created: '2026-10-12'
baseline_revision: 'c41de3077b1d714caf6a44845fe3527788d160c9'
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

**Problem:** `books` (B2) and the override layer on `user-books` (B6) must carry the same Book fields, and AD-6 says the overridable set is declared once in `src/fields/bookFields.ts`. Nothing declares it yet, so the two collections would each write their own and drift.

**Approach:** Add `src/fields/bookFields.ts`. It exports the overridable name list, `bookFields()` (every Book field for `books`: the overridable ones plus `cover`, `genres`, `themes`) and `overrideFields()` (the overridable ones for `user-books`). Both come from one private definition, so a field and its limits are written once. A unit test pins the list; an int test saves through throwaway collections to prove the limits fail with `VALIDATION`.

## Boundaries & Constraints

**Always:**
- Overridable, in this order: `title`, `subtitle`, `authors`, `series`, `seriesIndex`, `publisher`, `year`, `language`, `pages`, `description`. Not overridable: `cover` (D-4, only `setCover()`), `genres` (D-6), `themes` (D-3). ISBN-13 is not in the set; `isbnField()` stays separate and B2 adds it.
- Types: `title`, `subtitle`, `publisher`, `language` text; `description` textarea; `seriesIndex`, `year`, `pages` number; `authors` hasMany relationship to `authors`; `series` relationship to `series`; `cover` upload to `media`; `genres` hasMany relationship to `genres`; `themes` text `hasMany`.
- `maxLength`: `title` and `subtitle` 500, `description` 10,000, in both variants. No other limits here (name-keyed names and copy notes get theirs in their own stories).
- `bookFields()`: `title` is `required`; relations are plain Payload relationship fields (`books` is not a private collection, so AD-17 does not apply; `lib/catalogue` writes it).
- `overrideFields()`: nothing is `required` (an overridden field may be stored empty, meaning cleared, AD-6); `authors` and `series` are built with `readableRelation` (AD-17, B6 AC).

**Never:**
- No collection, migration or `payload-types.ts` change; no change to `payload.config.ts`. B2 and B6 spread these fields.
- No `visibility`, `createdBy`, `source`, `rawMetadata`, `isbn13`, `overridden` or tag fields here; they belong to B2 / B6.
- No limits on `publisher` or `language`, no integer or range rules on numbers: the AC sets none.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| At the limits | `title` and `subtitle` 500 chars, `description` 10,000, through a collection built from either variant | Saved | No error expected |
| Over the limits | 501 / 501 / 10,001 chars | Not saved | `runAction` gives `{ ok: false, code: 'VALIDATION', fields: { title, subtitle, description: 'VALIDATION' } }` |
| Cleared override | Empty row in a collection built from `overrideFields()` | Saved | No error expected |
| Book without title | Row in a collection built from `bookFields()` with no `title` | Not saved | `VALIDATION` on `title` |

</intent-contract>

## Code Map

- `src/fields/sortName.ts`, `src/fields/nameKey.ts` -- style to match: small factories returning Payload field objects, doc comments citing the spine rule.
- `src/fields/relation.ts:79-99` -- `readableRelation(slug, { name, hasMany })`; typed `SingleRelationshipField` even for hasMany (existing quirk, leave it).
- `src/payload-types.ts:69-76` -- generated `CollectionSlug` knows only `media` and `users`; `authors`, `series`, `genres` arrive in B3–B5 (3.15–3.17), all before B2 uses the set. Their slugs need one cast each in `bookFields.ts` until then, as `tests/int/fieldHelpers.int.spec.ts:25-27` does for throwaway slugs.
- `tests/int/fieldHelpers.int.spec.ts:28-120` -- the throwaway-collection pattern to copy: second `buildConfig` with its own `schemaName`, `push: true`, `DROP SCHEMA` via the app instance first, `getPayload({ config, key })`, a minimal auth `users`.
- `src/lib/errors.ts:55-61` -- `runAction` maps `ValidationError` to `VALIDATION` with `fields[path]`.
- `tests/unit/fields.unit.spec.ts` -- add the unit `describe` here.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:123-135,236-240,405-424` -- AD-6, AD-17, `EffectiveBook` (the field list and types this mirrors).

## Tasks & Acceptance

**Execution:**
- `src/fields/bookFields.ts` -- new. Export `OVERRIDABLE_BOOK_FIELDS` (readonly tuple) and `type OverridableBookField`, `bookFields(): Field[]`, `overrideFields(): Field[]`. One private builder takes the variant and returns the ten overridable fields; `bookFields()` appends `cover`, `genres`, `themes`. Slug casts for `authors`, `series`, `genres` with a one-line comment that B3–B5 generate them. -- The single declaration AD-6 asks for.
- `tests/unit/fields.unit.spec.ts` -- `describe('bookFields')`: the overridable list equals the ten names in order; `overrideFields()` names equal that list; `bookFields()` names equal the list plus `cover`, `genres`, `themes`. -- The AC's unit test, plus the drift check between the two variants.
- `tests/int/bookFields.int.spec.ts` -- new. Throwaway config in schema `book_fields_test` with minimal `users` (auth), `media` (upload), `authors`, `series`, `genres` (a `name` text each), a books-like collection from `bookFields()` and an overrides-like one from `overrideFields()`. Cover the matrix rows through `runAction` around `payload.create` (as a user, for the `readableRelation` path). -- Proves the set builds into real collections and the limits fail with `VALIDATION`.

**Acceptance Criteria:**
- Given `npm run test:unit` and `npm run test:int`, when they run, then the new tests pass and all others still pass.
- Given the changed files, when `npm run lint` and `npm run typecheck` run, then both are clean.
- Given the story, when it is done, then nothing under `src/migrations/`, `src/collections/`, `src/payload.config.ts` or `src/payload-types.ts` changes.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 18 findings — high 0, medium 4, low 7, false 7, maybe-false 0
- findings:
  - `[medium]` `[patch]` blind: swapping the `override ?` branch in `relation()` passes every test: Book cases save as a user, and the throwaway `authors`/`series` are readable to all. Grouped with the edge, verification-gap and intent rows on the same gap. Patched: throwaway `authors` hides `Hidden` from users; an override pointing at it fails with `VALIDATION` on `authors`, and a system write of a Book pointing at it succeeds. The implementer confirmed both new cases fail with the branch swapped.
  - `[false]` `[reject]` blind: the overridable set is declared twice (tuple + builder). The unit test `builds the override fields from exactly that set` fails on any mismatch, so the two cannot drift unnoticed; field definitions exist once.
  - `[low]` `[reject]` blind: `cover` has no field access enforcing "only through `setCover()`". Only the admin writes `books` outside `lib/catalogue` (users have no write access, B2), the comment explains why it is not overridable, and field access is B2's collection concern; the fix adds access rules.
  - `[low]` `[patch]` blind: the `relation()` comment said `books` is written only by `lib/catalogue`, but the admin also writes it in the back office, and AD-5's shared-only targets are not checked by the field. Patched the comment: AD-17 binds private collections; which targets a Book may take is enforced by `lib/catalogue`. A validate rule is rejected as a new branch for an admin-only path.
  - `[false]` `[reject]` blind: the empty-row test does not test clearing with explicit `null`/`[]`. `readableTargets` returns true for no ids (`src/fields/relation.ts:31-32`) and no override field is `required`, so explicit empties pass the same validators; storing them is `upsertUserBook()`'s (B6).
  - `[false]` `[reject]` blind: the first unit test only restates the constant. The story AC requires "a unit test asserts the overridable list" (epics.md:1123).
  - `[low]` `[reject]` blind: `RelationOptions` duplicates the private type in `relation.ts`. The narrower local type stays structurally compatible, so no caller breaks; sharing it needs a new export.
  - `[low]` `[reject]` edge: `pages`, `year`, `seriesIndex` accept negative, fractional or huge numbers. Values come from sources or the later Edit form; the AC sets no rules, and the fix adds validation.
  - `[low]` `[reject]` edge: `publisher` and `language` have no `maxLength`. The AC names the limited fields; picking a limit for these is a new decision for a rare input.
  - `[low]` `[reject]` edge: `themes` has no row or length limit. Themes are system data written only from source responses; new rules for an unlikely input.
  - `[low]` `[reject]` edge: `seriesIndex` without `series`. Display concern for later stories; a cross-field validate is a new branch.
  - `[medium]` `[patch]` edge: the `readableRelation` rejection branch is not exercised on the override variant. Same root cause as the first blind row; patched with it.
  - `[medium]` `[patch]` verification-gap: AD-17 wiring of `overrideFields()` is not pinned. Same root cause; patched with it.
  - `[false]` `[reject]` intent: the purpose lives at the real `books`/`user-books`, the tests use throwaway collections. Neither collection exists until B2/B6; the spec forbids collection changes and the AC's surface is `src/fields/bookFields.ts`.
  - `[false]` `[reject]` intent: "marks which are overridable" could mean a per-field flag. The exported list marks them and the AC's unit test asserts that list; the builder is checked against it.
  - `[false]` `[reject]` intent: `VALIDATION` is checked at Payload field validation, not `lib/catalogue`/`editBook()`. Those services do not exist; Payload field validation runs on every write path, including `overrideAccess` writes (the new system-write case runs it).
  - `[false]` `[reject]` intent: `genres` might belong to B2. The B11 AC lists genres among the declared fields; B2 is "built from `bookFields`".
  - `[medium]` `[patch]` intent: `readableRelation` covered only trivially. Same root cause as the first blind row; patched with it.

## Design Notes

One builder keeps the variants from drifting:

```ts
const overridable = (override: boolean): Field[] => [
  { name: 'title', type: 'text', required: !override, maxLength: 500 },
  { name: 'subtitle', type: 'text', maxLength: 500 },
  relation(override, AUTHORS, { name: 'authors', hasMany: true }),
  relation(override, SERIES, { name: 'series' }),
  // seriesIndex, publisher, year, language, pages, description (textarea, 10_000)
]
```

where `relation` returns `readableRelation(...)` for overrides and a plain `{ type: 'relationship', relationTo, hasMany }` for books.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors
- `git status --porcelain src/migrations src/collections src/payload.config.ts src/payload-types.ts` -- expected: empty

## Auto Run Result

**Summary.** `src/fields/bookFields.ts` declares the Book field set once. `OVERRIDABLE_BOOK_FIELDS` lists the ten overridable fields; one private builder produces `bookFields()` (those ten, title required, plain relations, plus `cover`, `genres`, `themes`) for `books` (B2) and `overrideFields()` (the ten, nothing required, `authors`/`series` via `readableRelation`) for `user-books` (B6). Title and subtitle are capped at 500 characters, description at 10,000, in both. No collection uses it yet; the `authors`, `series` and `genres` slugs are cast until B3–B5 generate them.

**Files changed.**
- `src/fields/bookFields.ts` -- new: the field set, the overridable list and the two variants.
- `tests/unit/fields.unit.spec.ts` -- unit tests: the overridable list, and both variants built from exactly that list.
- `tests/int/bookFields.int.spec.ts` -- new: throwaway collections built from both variants; limits fail with `VALIDATION`, title required on Books only, empty override row saves, an override cannot reference an author the user cannot read while a system Book write can.

**Review.** 18 findings (medium 4, low 7, false 7). Patched 2 entries: medium (one root cause from four layers) -- the tests could not tell the relation variants apart, now pinned both ways; low -- the `relation()` comment now states what the field does and does not enforce. Deferred: none. Rejected: number range rules, `publisher`/`language`/`themes` limits and `seriesIndex` without series (AC sets none, new rules for rare input); field access on `cover` and shared-only targets on `books` (admin-only path, B2/`lib/catalogue` concerns); shared `RelationOptions` (no caller harmed, new export); and seven false findings (drift is caught by the unit test, the AC requires the list test, explicit empties pass the same validators, and the intent-surface observations are forced by B2/B6 not existing yet).

**Follow-up review:** not recommended. Patched entries: high 0, medium 1, low 1.

**Verification.** `npm run test:unit`: 28 files, 494 tests passed. `npm run test:int`: 17 files passed, 1 skipped; 141 tests passed, 1 skipped (one earlier run failed in `fieldHelpers` and `asRequestUser` while the implementer's test run overlapped on `bookeh_test`; the rerun alone is green). `npm run lint`: 0 errors (8 old warnings in migrations). `tsc --noEmit`: clean. No change under `src/migrations/`, `src/collections/`, `src/payload.config.ts` or `src/payload-types.ts`.

**Residual risks.** The slug casts stay valid but redundant once B3–B5 generate the slugs; nothing forces their removal. B2 and B6 must actually spread `bookFields()` and `overrideFields()`; only their own stories prove that.
