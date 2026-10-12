---
title: 'Story 3.13: [B10] Author sort names'
type: 'feature'
created: '2026-10-12'
baseline_revision: 'fd821f00a93449fa7534efc121cfa65156b45bcf'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Renaming an author keeps a stale derived sortName (a typo fix "Tove Janson" to "Tove Jansson" keeps "Janson, Tove"), because the admin form sends the stored sortName back and a passed-in sortName is kept.
    evidence: |-
      src/fields/sortName.ts hook keeps any non-blank value; Payload passes the stored value when the field is omitted (beforeValidate/promise.js:182-211). The story AC keeps a passed-in sortName, so re-deriving here would break it. Re-deriving when the stored value equals deriveSortName(old name) (the spine's C5 test) belongs with D19 (Edit authors and series) or C5; until then the admin clears the field to re-derive.
    location: >-
      src/fields/sortName.ts:30-38
    severity: low
---

<intent-contract>

## Intent

**Problem:** Authors must sort by family name ("Kivi, Aleksis"), but no field computes a `sortName` when a source gives none or the admin leaves it empty. The spine names `sortNameField()` in `src/fields` for the `authors` collection (B3) to spread.

**Approach:** Add `src/fields/sortName.ts` with a pure `deriveSortName(name)` and a `sortNameField()` whose `beforeValidate` hook keeps a non-blank `sortName` and otherwise derives one from the sibling `name`, last word first. Unit tests cover the derivation and the hook.

## Boundaries & Constraints

**Always:**
- Derivation input is the name normalised like `toNameKey` but without lower-casing: NFC, trimmed, inner whitespace runs collapsed to one space.
- A name containing a comma is already inverted and becomes its own `sortName` unchanged (after that normalisation).
- Otherwise the last word goes first: `"<last>, <rest>"`. A single word is its own `sortName`.
- A non-blank string `sortName` in the input (or, on a partial update, the stored one) is kept, trimmed. Anything else (missing, `null`, blank, non-string) counts as empty and is derived.
- The name used on update is `siblingData.name` when present, else `previousSiblingDoc.name` (same rule as `nameKeyField`).
- The field is not `required` and has no `validate` of its own: the admin form validates before the hook runs, and an empty field must be allowed there.

**Never:**
- No particle or corporate-name rules: "Ludwig van Beethoven" gives "Beethoven, Ludwig van"; corporate names get whatever last-word-first gives, and the admin fixes them in the back office.
- No re-derivation of a stored `sortName` when `name` changes; only empty is derived (spine line 106).
- No collection, migration or `findOrCreateByName()` change; `authors` arrives in B3, matching in C5.
- No lower-casing, accent folding or locale casing of `sortName`; sorting relies on the `fi-FI` collation.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two-word name | `name: "Tove Jansson"`, no `sortName` | `"Jansson, Tove"` | No error expected |
| Finnish name | `name: "Aleksis Kivi"` | `"Kivi, Aleksis"` | No error expected |
| Particle name | `name: "Ludwig van Beethoven"` | `"Beethoven, Ludwig van"` | No error expected |
| Single name | `name: "Homeros"` | `"Homeros"` | No error expected |
| Already inverted | `name: "Jansson, Tove"` | `"Jansson, Tove"` | No error expected |
| Messy whitespace | `name: "  Väinö   Linna "` | `"Linna, Väinö"` | No error expected |
| Corporate name | `name: "Werner Söderström Osakeyhtiö"` | `"Osakeyhtiö, Werner Söderström"` (wrong, accepted) | No error expected |
| Passed in | `name: "Tove Jansson"`, `sortName: " Jansson, Tove "` | `"Jansson, Tove"` | No error expected |
| Blank passed in | `sortName: "   "` or `null`, `name: "Aleksis Kivi"` | `"Kivi, Aleksis"` | No error expected |
| Partial update, stored kept | update `{}`; stored `name: "Aleksis Kivi"`, `sortName: "Stenvall, Alexis"` (Payload passes the stored value as `value`) | `"Stenvall, Alexis"` | No error expected |
| Partial update, stored empty | update `{ name: "Aleksis Kivi" }`; stored `sortName: null` | `"Kivi, Aleksis"` | No error expected |
| Blank name | `name: "   "` or missing, no `sortName` | `null` | `nameKeyField` rejects the blank name; this field does not throw |

</intent-contract>

## Code Map

- `src/fields/nameKey.ts` -- the pattern to copy: an exported pure function plus a field factory whose `beforeValidate` hook reads `siblingData.name ?? previousSiblingDoc?.name`. Typed as `FieldHook<TypeWithID, unknown, NameSibling>`.
- `node_modules/payload/dist/fields/hooks/beforeValidate/promise.js:182-215` -- when the field is missing from the input, `value` is the stored value (`getFallbackValue` clones `siblingDoc[field.name]`); a returned `undefined` leaves `siblingData` as it is, so return `null` for "nothing derivable".
- `src/fields/isbn.ts:42-62` -- why the field must not be `required`: the admin form state validates raw input before the hook.
- `tests/unit/fields.unit.spec.ts:7-18` -- `req`, `hookOf()` and `callHook()` helpers to reuse for the hook tests; add the new `describe` blocks to this file.
- `src/lib/metadata/sources/finna.ts:115-119`, `src/lib/metadata/sources/google.ts:38-50` -- sources already emit inverted `sortName` when they have one; C5 passes it through. Read-only here.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:106,149,555` -- the rule this story implements and where the helper lives. C5 will need `deriveSortName` to tell "stored value is still the derived one", so export it.

## Tasks & Acceptance

**Execution:**
- `src/fields/sortName.ts` -- new. Export `deriveSortName(name: string): string | null` (null for a blank name) and `sortNameField(): TextField` (`name: 'sortName'`, `type: 'text'`, `hooks.beforeValidate: [sortFromName]`). Doc comments cite the spine rule and say corporate names are fixed by the admin. -- The helper B3 spreads into `authors`.
- `tests/unit/fields.unit.spec.ts` -- add `describe('deriveSortName')` with an `it.each` over the derivation rows of the matrix, and `describe('sortNameField')` covering passed-in, blank/null passed in, partial update keeping the stored value, partial update with a new name and empty stored value, and blank name. -- The unit tests the AC asks for.

**Acceptance Criteria:**
- Given `npm run test:unit`, when it runs, then the new `deriveSortName` and `sortNameField` tests pass and all other unit tests still pass.
- Given the changed files, when `npm run lint` and `npm run typecheck` run, then both are clean.
- Given the story, when it is done, then no file under `src/migrations/` or `src/payload-types.ts` changes, since no collection uses the field yet.

## Spec Change Log

## Review Triage Log

### 2026-10-12 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 11, false 5, maybe-false 0
- findings:
  - `[low]` `[patch]` blind: a kept `sortName` was only trimmed, so NFD accents or double spaces survived while derived values are normalised. Patched: a module-local `normaliseName()` now serves both paths; a unit case covers double space and decomposed accents.
  - `[low]` `[reject]` blind: the NFC/trim/collapse step is copied from `toNameKey` instead of shared. `nameKey` and `sortName` are never compared with each other, so drift harms no caller; sharing means a new export and a refactor of `nameKey.ts`.
  - `[low]` `[defer]` blind: renaming an author keeps a stale derived `sortName`, with no admin hint. Real, but the intent keeps a passed-in `sortName` and the admin form passes the stored one. Deferred to D19/C5, where the spine's "still the derived one" test fits.
  - `[low]` `[patch]` blind: the partial-update test ran the same branch as the passed-in test. Grouped with the verification-gap finding. Patched: it is now an update with a new `name` that must keep the stored `sortName`.
  - `[low]` `[reject]` blind: the comma rule treats "Martin Luther King, Jr." as inverted. The AC says any name containing a comma is taken as already inverted; the doc comment says so. The admin corrects such names, as with corporate ones.
  - `[low]` `[reject]` blind: a stray trailing comma ("Aleksis Kivi, ") is stored as "Aleksis Kivi,". Adapters emit cleaned names and the admin rarely types one; the fix is a new branch.
  - `[low]` `[patch]` edge: kept `sortName` not normalised. Same root cause as the first blind finding; patched with it.
  - `[low]` `[reject]` edge: suffix comma ("King, Jr."). Same as the blind comma finding; the AC's comma rule mandates it.
  - `[low]` `[reject]` edge: leading or trailing comma. Same as the blind stray-comma finding; rejected for the same reason.
  - `[low]` `[defer]` edge: stale derived `sortName` after a name change. Same as the blind rename finding; deferred with it.
  - `[low]` `[patch]` verification-gap: no test combined a non-blank `value` with a `name` whose derivation differs, so a hook that re-derives when `name` is present would pass. Patched: the passed-in test now uses "Stenvall, Alexis" for "Aleksis Kivi", and the update test sends a new `name` with the stored value.
  - `[false]` `[reject]` intent: the save surface is not exercised; the hook is called directly. The AC's Given is `sortNameField()` in `src/fields`; no collection exists until B3. The Payload behaviours relied on (stored value as `value` on partial update, `null` returned is written) were read at `beforeValidate/promise.js:182-215`.
  - `[false]` `[reject]` intent: the shelf order of authors is not shown. Shelf sort is E15; this story's AC stops at the field.
  - `[false]` `[reject]` intent: particles could mean "van Beethoven, Ludwig". The AC says last word first and names "Ludwig van Beethoven" as a test case.
  - `[false]` `[reject]` intent: the back-office correction path is not shown. The field is visible and not `required`, so the admin can set it; the hook keeps a passed-in value (tested).
  - `[low]` `[reject]` intent: the comma rule is broader than "already inverted". Same as the blind comma finding; the AC mandates it.

## Design Notes

The hook in outline:

```ts
const sortFromName: FieldHook<TypeWithID, unknown, NameSibling> = ({ value, siblingData, previousSiblingDoc }) => {
  if (typeof value === 'string' && value.trim() !== '') return value.trim()
  const name = siblingData.name === undefined ? previousSiblingDoc?.name : siblingData.name
  return typeof name === 'string' ? deriveSortName(name) : null
}
```

`deriveSortName` splits on the single spaces left by normalisation and moves the last word: `const words = n.split(' '); return words.length < 2 ? n : `${words.at(-1)}, ${words.slice(0, -1).join(' ')}``.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary.** `src/fields/sortName.ts` adds `deriveSortName(name)` and `sortNameField()`. An empty `sortName` is derived "Family, Given" from `name`, last word first; a name with a comma is its own sort name; a passed-in or stored `sortName` is kept, normalised (NFC, trimmed, whitespace collapsed). No collection uses it yet; `authors` (B3) spreads it.

**Files changed.**
- `src/fields/sortName.ts` -- new: the derivation, the field and its `beforeValidate` hook.
- `tests/unit/fields.unit.spec.ts` -- unit tests for every matrix row plus kept-value normalisation and keep-versus-re-derive on update.

**Review.** 16 findings (low 11, false 5). Patched 2 entries (both low): kept-value normalisation; keep tests that can tell keeping from re-deriving. Deferred 1 (low): stale derived `sortName` after a rename, for D19/C5. Rejected: shared normaliser (no caller harmed, new export), suffix-comma and stray-comma names (AC's comma rule; new branch for a rare input), and five intent-surface observations (AC's surface is the field; collection, shelf and admin belong to B3, E15 and the back office).

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 2.

**Verification.** `npm run test:unit`: 28 files, 491 tests passed. `npm run lint`: 0 errors (8 old warnings in `src/migrations/20261010_095151_visibility.ts`). `npm run typecheck`: clean. No change under `src/migrations/` or to `src/payload-types.ts`.

**Residual risks.** The hook's Payload assumptions (stored value as `value` on partial update) are verified by reading Payload's source, not by a save; B3's int tests will exercise them through the `authors` collection.
