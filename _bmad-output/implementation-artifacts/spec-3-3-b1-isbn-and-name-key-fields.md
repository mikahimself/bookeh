---
title: 'Story 3.3: [B1] ISBN and name-key fields'
type: 'feature'
created: '2026-10-11'
status: 'done'
baseline_revision: '5cc2c98854a9d4d71ea1465a001a8d3b98b8e6ef'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Lookup, save, the collections and the fixture script each need to compare ISBNs and names, and only the capture script has an ISBN normaliser today (`scripts/capture-fixtures.ts:78`, local). The spine puts one `normaliseIsbn` and one `nameKeyField()` in `src/fields`; neither exists.

**Approach:** Add `src/fields/isbn.ts` (`toIsbn13`, `normaliseIsbn`, `isbnField()`) and `src/fields/nameKey.ts` (`toNameKey`, `nameKeyField()`). Add `INVALID_ISBN` to `ErrorCode` with its messages, and make the capture script use the shared converter.

## Boundaries & Constraints

**Always:** ISBN input may be ISBN-10 or ISBN-13 with hyphens and spaces; the check digit is verified; ISBN-10 `X` is accepted in either case; output is 13 digits starting 978/979. `normaliseIsbn` throws `DomainError('INVALID_ISBN')`. The name key is NFC, trimmed, inner whitespace runs collapsed to one space, lower-cased, with no accent folding. `nameKeyField()` recomputes `nameKey` from the sibling `name` on every create and update, ignoring any `nameKey` in the input. A name that is empty after trimming fails as a Payload `ValidationError` on path `name`, which `runAction` maps to `VALIDATION`.

**Never:** No collection, migration or `payload-types.ts` change: the name-keyed collections (3.15–3.17, 3.21 …) and `books` (3.18) wire these fields in their own stories. No normalising in the browser (`src/app/(frontend)/scan/barcode.ts` stays as it is). No unique indexes here; the partial unique constraints belong to the collection stories. No locale-specific lower-casing.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| ISBN-13 plain | `9789515782755` | `9789515782755` | — |
| ISBN-13 hyphens/spaces | `978-951-578 275-5` | `9789515782755` | — |
| ISBN-10 → 13 | `951-578-275-9` | `9789515782755` | — |
| ISBN-10 X, either case | `0-8044-2957-X`, `080442957x` | `9780804429573` | — |
| Bad check digit | `9789515782754`, `9515782758` | — | `DomainError` `INVALID_ISBN` |
| Not an ISBN | `''`, `abc`, `12345`, 13 digits starting 977 | — | `INVALID_ISBN` |
| isbnField on save | `isbn13: '951-578-275-9'` | stored `9789515782755` | invalid text → field validation error on `isbn13` |
| Name key, Finnish | `'  Väinö   Linna '` | `väinö linna` | — |
| No accent folding | `Äiti` vs `aiti` | `äiti` ≠ `aiti` | — |
| NFC | `'Äiti'` (decomposed) | equals key of `'Äiti'` | — |
| Empty name | `name: '   '` on create | not saved | `ValidationError` path `name` → `VALIDATION`, `fields: { name: 'VALIDATION' }` |
| Partial update | update without `name` | `nameKey` recomputed from the stored `name` | — |

</intent-contract>

## Code Map

- `src/lib/errors.ts:6` -- `ErrorCode` union; add `'INVALID_ISBN'`. `DomainError` is thrown by `normaliseIsbn`. `mapError` already turns a Payload `ValidationError` into `VALIDATION` with `fields[path]`. Importing it from `src/fields` is allowed (only `src/collections` is limited to access/fields, `eslint.config.mjs:57`), and it loads under plain Node/tsx.
- `src/fields/` -- does not exist yet. Spine line 555 lists `isbnField`, `nameKeyField` among its files; spine Consistency table lines 292–293 define both rules.
- `scripts/capture-fixtures.ts:71-93` -- local `isbn13CheckDigit` + exported `toIsbn13(text): string | null`; used at lines 101, 286, 306 (the last two match record identifiers that may be junk, so they need the null-returning form). Replace with an import of `toIsbn13` from `@/fields/isbn` (tsx resolves the tsconfig `@/*` path) and delete the local copy.
- `tests/unit/captureFixtures.unit.spec.ts:13,33` -- imports `toIsbn13` from the script and has one conversion row; drop both (the fields test owns conversion).
- Payload hook semantics (read in `node_modules/payload/dist/collections/operations/utilities/update.js:108`): on update, field `beforeValidate` hooks get `siblingData` = the incoming partial data and `siblingDoc` = the stored doc, so the name is `siblingData.name ?? siblingDoc?.name`. Field hooks run before field `validate`.
- `payload/shared` exports the stock `text` validator (`node_modules/payload/dist/fields/validations.d.ts:5`); a custom `validate` replaces it, so call it after the ISBN check to keep `required` working when a collection sets it.
- `messages/en.json:63`, `messages/fi.json:63` -- `errors` block; add `INVALID_ISBN`. Wording from EXPERIENCE.md line 322: en "Not an ISBN. Thirteen digits, or ten."; fi "Ei ISBN-tunnus. Kolmetoista numeroa tai kymmenen." `tests/unit/messages.unit.spec.ts` enforces parity.
- `tests/unit/errors.unit.spec.ts` -- existing pattern for asserting `runAction` failures.

## Tasks & Acceptance

**Execution:**
- `src/fields/isbn.ts` -- new: `toIsbn13(text): string | null` (pure, the Matrix rules), `normaliseIsbn(text): string` (throws `new DomainError('INVALID_ISBN')` when `toIsbn13` is null), `isbnField(): TextField` named `isbn13`: a `beforeValidate` hook that maps blank to `null` and a convertible string to its 13-digit form (leaving other text as it is), and a `validate` that rejects any string where `toIsbn13(value) !== value`, then defers to `text`. -- one ISBN rule for services, admin and scripts.
- `src/fields/nameKey.ts` -- new: `toNameKey(name): string` (`normalize('NFC')`, trim, `/\s+/g` → `' '`, `toLowerCase()`), `nameKeyField(): TextField` named `nameKey`, `required: true`, `admin: { hidden: true }`, whose `beforeValidate` hook takes the name from `siblingData.name ?? siblingDoc?.name`, throws `new ValidationError({ collection: collection?.slug, errors: [{ path: 'name', message }] })` when the key is empty or the name is not a string, and otherwise returns the key. -- one name key for every name-keyed collection.
- `src/lib/errors.ts` -- add `'INVALID_ISBN'` to `ErrorCode`.
- `messages/en.json`, `messages/fi.json` -- `errors.INVALID_ISBN` as in the Code Map.
- `scripts/capture-fixtures.ts`, `tests/unit/captureFixtures.unit.spec.ts` -- use the shared `toIsbn13`; remove the local one and its test row.
- `tests/unit/fields.unit.spec.ts` -- new: every Matrix row. Field rows call the field's hook and `validate` directly with minimal args, and the empty-name row checks that `runAction(() => hook(...))` resolves to `{ ok: false, code: 'VALIDATION', fields: { name: 'VALIDATION' } }`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-3-b1-isbn-and-name-key-fields` → `done` at finalisation.

**Acceptance Criteria:**
- Given any service calls `normaliseIsbn` on text that is not a valid ISBN-10/13, when wrapped in `runAction`, then the result is `{ ok: false, code: 'INVALID_ISBN' }`, and `errors.INVALID_ISBN` exists in both message files.
- Given a collection that includes `isbnField()`, when a document is saved with an ISBN-10 or hyphenated ISBN-13, then `isbn13` holds only the 13-digit form; invalid text is a field validation error on `isbn13`.
- Given a collection that includes `nameKeyField()` beside its `name`, when a document is created or updated, then `nameKey` equals `toNameKey(name)` whatever `nameKey` the input carried, and a name that is blank after trimming is rejected with `VALIDATION` on `name`.
- Given the change, when `npm run lint` and `npm run typecheck` run, then both pass; no migration or generated type changes appear.

## Spec Change Log

## Review Triage Log

### 2026-10-11 — Review pass
- verdicts: 15 findings — high 0, medium 2, low 10, false 3, maybe-false 0 (verification-gap reported none)
- findings:
  - `[low]` `[patch]` (blind 1) An update with an explicit `name: null` keyed the stored name through `??` and did not throw — Fix applied: the stored name is used only when `siblingData.name === undefined`; a null-on-update row expects `VALIDATION` on `name`.
  - `[low]` `[patch]` (blind 2) A non-string `isbn13` (JSON number) passed the hook and skipped the ISBN check, so `text()` stored it — verified: Payload coerces text only for `id` (`payload/dist/fields/hooks/beforeValidate/promise.js:33`). Fix applied: `validate` rejects any value that is neither null nor a string.
  - `[low]` `[reject]` (blind 3) Unicode dashes and an `ISBN:` prefix are rejected — the Matrix rule is hyphens and spaces; scanning is the primary path and typed or Finna-shown ISBNs use ASCII hyphens, and prefix stripping adds parsing for an unseen input.
  - `[false]` `[reject]` (blind 4) `normaliseIsbn` and `isbnField` report a bad ISBN with different codes, so an edit screen cannot mark the field — `DomainError` already takes `fields`, so the Epic 4 caller that owns a field (`editBook()`) can mark it; the admin path is the stock Payload field error by design.
  - `[false]` `[reject]` (blind 5) Sprint status `done` while the spec is `in-review` — the review's interim state; finalisation writes `done` to both.
  - `[low]` `[reject]` (blind 6) A blank name aborts in `beforeValidate`, hiding other field errors in the same save — the name-keyed forms in the product edit one name at a time; collecting errors would move the check into `validate` on a hidden field and lose the `name` path (Design Notes).
  - `[low]` `[reject]` (blind 7) The fixture script now loads Payload, Next and pino through `@/fields/isbn` — it loads under tsx and its unit test passes; splitting a dependency-free module guards a hypothetical future side-effecting import.
  - `[medium]` `[patch]` (edge-case 1) The admin form-state build calls `validate` on the raw input without the hook (`@payloadcms/ui/dist/forms/fieldSchemasToFormState/addFieldStatePromise.js:119`, `Form/index.js:283` blocks submit), so ISBN-10, hyphenated ISBN-13 and a cleared field blocked the admin save — Fix applied: `validate` accepts blank and any convertible string, rejecting only text `toIsbn13` cannot convert; test rows for raw ISBN-10, hyphenated and `''`.
  - `[low]` `[patch]` (edge-case 2) Same defect as blind 2 — Fix applied with it.
  - `[low]` `[reject]` (edge-case 3) Same as blind 3.
  - `[low]` `[patch]` (edge-case 4) Same defect as blind 1 — Fix applied with it.
  - `[low]` `[reject]` (edge-case 5) A numeric `name` is rejected with the "required" message — the rejection is right (names are strings); only the wording is off, the admin always sends strings, and the fix adds a coercion branch.
  - `[medium]` `[patch]` (edge-case 6, claim) Same defect as edge-case 1 — Fix applied with it.
  - `[low]` `[reject]` (intent-alignment a) "Stores only the 13-digit form" and "every name-keyed collection" are tested at the hook surface, not through a collection save — no such collection exists in this lane story; each collection story's access test sees both through the Local API (Design Notes), and a test-only collection adds config machinery.
  - `[false]` `[reject]` (intent-alignment b) The field and service surfaces report a bad ISBN with different codes — same refutation as blind 4.

## Design Notes

**Why the empty-name rejection lives in the hook and lands on `name`.** Payload's stock `required` passes `'   '`, and the collection stories should not each re-implement the check. The `nameKey` hook is the one place that sees every name-keyed save, and throwing a `ValidationError` on path `name` puts the error where Settings and Edit screens show it (`fields.name`), not on a hidden `nameKey`.

**Wiring handed onward.** Each name-keyed collection story spreads `nameKeyField()` after its own `name` field and adds its partial unique index on `nameKey`; its two-user access test is where the rejection is seen through the Local API. `genres` keys on its English `name`.

## Verification

**Commands:**
- `npm run test:unit` -- expected: all pass, including `fields.unit.spec.ts`, `messages.unit.spec.ts`, `captureFixtures.unit.spec.ts`
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors
- `git status --short src/migrations src/payload-types.ts` -- expected: empty

## Auto Run Result

Status: done

**Summary.** `src/fields/isbn.ts` holds the one ISBN rule: `toIsbn13` (ISBN-10/13, hyphens and spaces, check digit, `X` in either case, null when invalid), `normaliseIsbn` (throws `DomainError('INVALID_ISBN')`) and `isbnField()` (`isbn13`, converted to 13 digits by a `beforeValidate` hook; `validate` accepts blank and convertible text because the admin validates raw input, and rejects non-strings and unconvertible text). `src/fields/nameKey.ts` holds `toNameKey` (NFC, trim, collapse, lower-case, no accent folding) and `nameKeyField()` (hidden, required `nameKey`, recomputed from `name` on every save, the stored name used only when `name` is absent; a blank or non-string name throws `ValidationError` on `name` → `VALIDATION`). `INVALID_ISBN` joins `ErrorCode` with the EXPERIENCE.md copy. The capture script now uses the shared `toIsbn13`. No collection, migration or generated-type change.

**Files changed.**
- `src/fields/isbn.ts` — new: `toIsbn13`, `normaliseIsbn`, `isbnField()`.
- `src/fields/nameKey.ts` — new: `toNameKey`, `nameKeyField()`.
- `src/lib/errors.ts` — `INVALID_ISBN` in `ErrorCode`.
- `messages/en.json`, `messages/fi.json` — `errors.INVALID_ISBN`.
- `src/app/(frontend)/components/toast/flashCookie.ts`, `tests/unit/messages.unit.spec.ts` — `INVALID_ISBN` in their exhaustive code lists (typecheck requires it).
- `scripts/capture-fixtures.ts`, `tests/unit/captureFixtures.unit.spec.ts` — local converter and its test row removed; imports `@/fields/isbn`.
- `tests/unit/fields.unit.spec.ts` — new: every Matrix row plus the review rows (admin raw input, non-string ISBN, explicit null name).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 3.3 `done`.

**Deviation from the Code Map.** Field hooks receive the stored sibling as `previousSiblingDoc`, not `siblingDoc` (`payload/dist/fields/hooks/beforeValidate/promise.js:193-212`); same behaviour as intended.

**Review findings.** 15 rows: 3 entries patched (medium 1: admin form-state validation blocked ISBN-10, hyphenated and cleared values; low 2: non-string `isbn13` stored unchecked, explicit `name: null` keyed the stale name), 0 deferred, rejected: Unicode dashes / `ISBN:` prefix (Matrix rule is hyphens and spaces, unseen input), blank name hiding other field errors (one-name forms; would lose the `name` path), fixture script loading the server stack (works; hypothetical breakage), numeric name's "required" wording (rejection is right, admin sends strings), hook-surface tests instead of a collection save (no collection exists in this lane; collection stories exercise it), and three false: two ISBN failure codes (`DomainError` takes `fields`; the Epic 4 caller marks its field), sprint status interim state.

**Follow-up review recommendation:** false. Patched by entry verdict: high 0, medium 1, low 2.

**Verification.** `npm run test:unit` 23 files / 336 tests pass; `npm run lint` 0 errors (8 pre-existing warnings in old migrations); `npm run typecheck` clean; `git status --short src/migrations src/payload-types.ts` empty; Prettier clean on touched files.

**Residual risks.** The fields have run only through their hook and `validate` functions with hand-built args, never through a real collection save; the first Local API proof is the first schema story that spreads them (3.15 `authors`, 3.18 `books`). An invalid ISBN in the admin shows Payload's generic "invalid input" text, not the "Not an ISBN" copy.
