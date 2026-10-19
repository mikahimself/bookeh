---
title: 'Story 3.27: [C5] Name matching for authors and series'
type: 'feature'
created: '2026-10-19'
baseline_revision: '5d2fbee83f166bf24cbe17278c9007d0c691f62e'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Lookup (3.28, 3.29), the shared-Book save (3.31) and the manual private Book (3.38) all need to turn an author or series name into a row without creating duplicates, and the spine allows exactly one matcher (AD-5, AD-18). No `lib/catalogue` code exists yet.

**Approach:** Add `findOrCreateByName()` in `src/lib/catalogue/findOrCreateByName.ts`: match by `equals` on `nameKey` in the requested scope with system privileges, create the missing row in that scope, pass the source's `sortName` for authors and refresh a still-derived stored `sortName`. Return the row's id and whether it was created. Integration tests cover case differences, a private match and two users' private authors with the same name.

## Boundaries & Constraints

**Always:**
- Signature: `findOrCreateByName(ctx, collection, scope, input)` with `collection: 'authors' | 'series'`, `scope: 'shared' | 'private'`, `input: { name: string; sortName?: string }` (`sortName` accepted only for `'authors'` in the type), returning `Promise<{ id: number; created: boolean }>`. One name per call; callers loop.
- The name is normalised like `sortName.ts`'s `normaliseName` (NFC, trimmed, whitespace runs collapsed, case kept) before matching and storing; the match key is `toNameKey(name)` from `src/fields/nameKey.ts`. A name that is blank after trimming fails with `DomainError('VALIDATION', { fields: { name: 'VALIDATION' } })` before any read or write.
- `scope: 'shared'`: match `visibility = 'shared'` only; create `visibility: 'shared'`. `scope: 'private'`: match shared first, then `visibility = 'private' AND createdBy = ctx.user.id`; create `visibility: 'private'` (the collection hook sets `createdBy` from `req.user`). The admin gets the same rule: only their own private rows.
- Runs inside `withTransaction(ctx, ...)`, joining the caller's transaction (AD-16). Every Local API call passes `req: tx.req`, `overrideAccess: true`, `depth: 0` (AD-3: `lib/catalogue` is the allowlisted place) and calls `assertLive(tx)` first, as `transaction.ts` requires for calls outside the gateway.
- `sortName`: a blank or missing input `sortName` counts as none. On create, pass the input `sortName` through (the field hook derives one when it is empty). On a match of an author, when the input has a `sortName` and the stored `sortName` equals `deriveSortName(stored.name)` (or is empty) and differs from the input, update the row's `sortName`; otherwise the row is untouched. Series never carry `sortName`.
- A lost race between two concurrent creates of one name surfaces as the unique index's `ValidationError`, unchanged: no savepoints, no retry (same stance as `upsertUserBook`).

**Never:**
- No read-only match export, no batch form, no `matches` shape (3.29), no `isUnreferenced()`, no `ensureSharedBook` (3.31), no rename, merge or delete, no `NAME_TAKEN`.
- No shared `system` gateway module: the privileged calls stay in this file. A later catalogue story extracts one if a second file needs it.
- No accent folding, no locale casing, no fuzzy matching; `nameKey` equality only.
- No gateway reads for the match: the gateway runs with the viewer's access, which for the admin spans every user's private rows, so the match scopes by `createdBy` itself with system privileges (AD-3).
- No schema change, no migration, no change to `src/fields` or `src/collections`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| New shared author | `('authors', 'shared', { name: 'Tove Jansson', sortName: 'Jansson, Tove' })`, no row | Row created shared, `sortName` 'Jansson, Tove'; `{ id, created: true }` | No error expected |
| Case / whitespace match | shared 'Tove Jansson' exists; input `' tove  JANSSON '` | Same id, `created: false`, stored name unchanged | No error expected |
| Derived sortName refreshed | shared author created without `sortName` (stored 'Jansson, Tove' derived); input `sortName: 'Jansson, Tove Marika'` | Row's `sortName` becomes 'Jansson, Tove Marika'; `created: false` | No error expected |
| Hand-set sortName kept | stored `sortName` 'Custom, Name' (≠ derived); input `sortName: 'Jansson, Tove'` | `sortName` stays 'Custom, Name' | No error expected |
| Private scope, shared exists | shared 'X' exists; user A, `scope: 'private'`, 'x' | Returns the shared id, `created: false` | No error expected |
| Private scope, nothing | user A, `scope: 'private'`, 'Y' | Private row, `createdBy` A, `created: true` | No error expected |
| Two users, same private name | A's private 'Y' exists; user B, `scope: 'private'`, 'Y' | New private row for B (different id, `createdBy` B); a second call by A returns A's row | No error expected |
| Shared scope ignores private | A's private 'Z' exists; `scope: 'shared'`, 'Z' | New shared row, `created: true` | No error expected |
| Series match | shared series 'Muumit' exists; `('series', 'shared', { name: 'MUUMIT' })` | Same id, `created: false` | No error expected |
| Blank name | `{ name: '   ' }` | Nothing read or written | `DomainError('VALIDATION', { fields: { name: 'VALIDATION' } })` |

</intent-contract>

## Code Map

- `src/lib/catalogue/` -- new directory; `eslint.config.mjs:22` already lists its allowed imports (`payload`, `books`, `metadata`, `undo`, `copies`, `wishlists`), and `eslint.config.mjs:156-161` (`gatewayExempt`) lets it call `ctx.req.payload.*` and import from `payload`.
- `src/lib/payload/transaction.ts:18-25,35-64` -- `assertLive(ctx)` and `withTransaction(ctx, fn)`; `fn` gets `tx` whose `req` carries the transaction. Pass `req: tx.req` so the Local API joins it.
- `src/lib/payload/context.ts:17` -- `Context = { req, user: TypedUser, transactionID? }`; `ctx.user.id` is the private scope's `createdBy`.
- `src/fields/nameKey.ts:7-9` -- `toNameKey(name)`: the key to match on. `:19-35` -- the hook recomputes `nameKey` on write and throws `ValidationError` on `name` for a blank name; any `nameKey` in the input is ignored (`nameKey: ''` satisfies the create type, as `tests/int/authors.int.spec.ts:45` does).
- `src/fields/sortName.ts:4,14-20,31-40` -- `normaliseName` (not exported; copy the one-liner or export it), `deriveSortName(name)`, and the hook that keeps a non-blank input `sortName` and derives otherwise. "Still derived" = `stored.sortName === deriveSortName(stored.name)`.
- `src/fields/visibility.ts:13-24` -- `createdBy` comes from `req.user` on a private create; shared rows get `null`. Any `createdBy` in the input is ignored.
- `src/access/catalogue.ts:9-13` -- the user read access; the pattern `{ createdBy: { equals: user.id } }` is the private-scope `where`.
- `src/collections/Authors.ts`, `src/collections/Series.ts` -- field sets; `catalogueIndexes.ts:36-38` -- `nameKey` unique among shared rows and per creator among private rows.
- `src/payload-types.ts` -- `Author` (`sortName?: string | null`, `createdBy?: number | null | User`), `Series`. With `depth: 0`, `createdBy` is the id.
- `src/lib/books/upsertUserBook.ts:80-93,116` -- the writer pattern to mirror: early `DomainError('VALIDATION', { fields })`, then `withTransaction`. `src/lib/errors.ts` -- `DomainError`.
- `tests/int/authors.int.spec.ts:26,36-59,165-188` -- `unique()` suffix for shared names (the shared index is global, rows are never cleaned up), `systemCreate` / `systemUpdate` for seeding rows as `lib/catalogue` would, the constraint test. `tests/int/upsertUserBook.int.spec.ts:1-60` -- service test style (`contextFor`, `getPayload({ config })` reads with `overrideAccess: true`).
- `tests/helpers/harness.ts` -- `createUser()`, `contextFor(user)`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:99` -- `3-27-c5-name-matching-for-authors-and-series: backlog` → `in-progress` at implementation, `done` at the end.

## Tasks & Acceptance

**Execution:**
- `src/fields/sortName.ts` -- export `normaliseName` -- one home for the name normalisation the matcher reuses (AD-18).
- `src/lib/catalogue/findOrCreateByName.ts` -- new: types, blank check, `withTransaction` body with the scoped match, the create, the author `sortName` refresh, per Always -- AD-5's one matcher.
- `tests/int/findOrCreateByName.int.spec.ts` -- new: the matrix rows with users A and B, shared names suffixed per run -- the AC's integration tests.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-27-c5-name-matching-for-authors-and-series` status.

**Acceptance Criteria:**
- Given `npm run lint`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass (lint: 0 errors in `src` and `tests`).
- Given `src/lib/catalogue/findOrCreateByName.ts`, when inspected, then every Local API call passes `overrideAccess: true` and `req: tx.req`, is preceded by `assertLive(tx)`, the private-scope match filters on `createdBy = ctx.user.id`, and no `where`-based update or delete exists.
- Given the integration test, when it runs the private rows, then it proves through a system read that user B's call never returns user A's private row and that each private row's `createdBy` is its caller.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 18 findings — high 0, medium 3, low 12, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` (blind-hunter) `sortName` on a private-scope call can rewrite a matched shared author's `sortName`, and nothing says the value must be the source's — real: the function cannot tell a source from a caller; patched by stating on the docblock and `NameInput.sortName` that it is the source's inverted form only, never client text.
  - `[low]` `[reject]` (blind-hunter) a name over 200 characters fails inside `payload.create` with Payload's `ValidationError` instead of an early `DomainError` — real but the collection's `maxLength` is that rule's one home (AD-18) and a failed save rolling back whole is the intended outcome; a pre-check would duplicate the rule for a case no source has produced in the fixtures.
  - `[low]` `[reject]` (blind-hunter) the spec's Never line ("no change to `src/fields`") contradicts its Execution task to export `normaliseName` — real wording slip; the fix is an edit to this build's spec, which triage never routes; the Execution task and the diff are the intended reading.
  - `[false]` `[reject]` (blind-hunter) sprint status left at `in-progress` — by design: the Code Map says `in-progress` at implementation and `done` at the end; finalize flips it before the commit.
  - `[low]` `[patch]` (blind-hunter) each `find({ limit: 1 })` also runs a `totalDocs` count query — confirmed in `@payloadcms/drizzle/dist/find/findMany.js:125`; patched with `pagination: false` on the match.
  - `[low]` `[patch]` (blind-hunter) the exported `normaliseName` line exceeds Prettier's `printWidth: 100` — confirmed by `prettier --check`; patched by wrapping the arrow body.
  - `[low]` `[patch]` (blind-hunter) the docblock omits the private-scope race where a shared row lands between the shared match and the private create, leaving a shadowed private duplicate — real (different partial indexes); patched with one docblock sentence.
  - `[low]` `[reject]` (edge-case-hunter) name over 200 characters — same root cause as the blind-hunter row above; rejected for the same reason.
  - `[low]` `[reject]` (edge-case-hunter) no retry after a lost create race; the error names the index column rather than `name` — the spec and spine fix this stance (no savepoints, unchanged `ValidationError`, as `upsertUserBook`); two users creating one new author in the same instant is rare and a retry needs savepoints the spine forbids.
  - `[low]` `[reject]` (edge-case-hunter) an author renamed in admin keeps a `sortName` derived from the old name, which the refresh then treats as hand-set — real, but "still derived" is defined by the spine as the value the hook would derive from the stored name; tracking derivation needs a schema flag, and the admin who renames fixes sort names in the back office (AD-4).
  - `[medium]` `[patch]` (verification-gap) shared-before-private precedence in the private scope is unasserted with both rows present; inverting the match order keeps the suite green — pre-verified; patched with one assertion after the shared create in the per-creator test.
  - `[medium]` `[patch]` (verification-gap) the admin's private-scope match is never exercised, so viewer-access scoping could replace the explicit `createdBy` filter unnoticed — pre-verified; patched with an admin user and an assertion that the admin's call creates its own private row.
  - `[false]` `[reject]` (intent-alignment, a) the scope is a caller-chosen argument rather than derived from a Book — STORY-SLICING lists C5 as a Service slice consumed by C6 and D1, and the spine's AD-5 wording describes the rule, not a Book parameter; the explicit scope is the one reading consistent with that.
  - `[low]` `[patch]` (intent-alignment, b) `sortName` accepted from any caller — same root cause as the first blind-hunter row; patched with it.
  - `[low]` `[reject]` (intent-alignment, c) the `stored === ''` branch is unreachable for rows the hook wrote — harmless defensive branch for legacy or null values; removing it buys nothing.
  - `[medium]` `[patch]` (intent-alignment, d) no admin test — same root cause as the verification-gap admin row; patched with it.
  - `[false]` `[reject]` (intent-alignment, e) no read-only matching surface — the intent (Story 3.27's AC) does not ask for one; Story 3.29 owns it.
  - `[low]` `[reject]` (intent-alignment, f) spec Never/Execution tension on `src/fields` — same root cause as the blind-hunter spec row; rejected for the same reason.

## Design Notes

Match and create are two steps inside one `withTransaction` so a caller's save sees its own earlier creates (a source listing the same author twice gets one row). The `where` for the private scope, with `depth: 0` so `createdBy` compares as an id:

```ts
const key = toNameKey(name)
const shared = { and: [{ visibility: { equals: 'shared' } }, { nameKey: { equals: key } }] }
const own = { and: [{ visibility: { equals: 'private' } }, { createdBy: { equals: tx.user.id } }, { nameKey: { equals: key } }] }
```

`sortName` refresh, authors only:

```ts
const given = input.sortName?.trim()
const stored = row.sortName ?? ''
if (given && given !== stored && (stored === '' || stored === deriveSortName(row.name))) {
  await payload.update({ collection: 'authors', id: row.id, data: { sortName: given }, ... })
}
```

The field hook normalises the new value, so the stored result may differ in whitespace from `given`; the test compares against the normalised form.

## Verification

**Commands:**
- `npx eslint src tests` -- expected: 0 errors.
- `npm run typecheck` -- expected: clean.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, `findOrCreateByName` included (needs the Postgres on `DATABASE_URL`).

## Auto Run Result

**Summary:** `findOrCreateByName(ctx, collection, scope, input)` in the new `src/lib/catalogue/` is the one matcher of `authors` and `series`: it normalises the name, matches by `nameKey` in the requested scope with system privileges inside the caller's transaction (shared only, or shared first then the caller's own private rows), creates the missing row in that scope, stores the source's `sortName` on create and refreshes a still-derived one on a match, and returns `{ id, created }`.

**Files changed:**
- `src/lib/catalogue/findOrCreateByName.ts` -- new: the matcher, its types, the scoped `where`s, the create and the `sortName` refresh.
- `src/fields/sortName.ts` -- `normaliseName` exported (wrapped for Prettier).
- `tests/int/findOrCreateByName.int.spec.ts` -- new: six integration tests over the matrix, users A, B and an admin.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `3-27-c5-name-matching-for-authors-and-series: done`.

**Review findings:** 18 findings from four layers. Patched 6 entries (medium 2: shared-before-private precedence assertion, admin private-scope assertion; low 4: `sortName` provenance documented, `pagination: false` on the match, second race documented, Prettier wrap). Deferred 0. Rejected 10: name over 200 characters (twice: the collection's `maxLength` is the rule's home), spec Never/Execution wording (twice: a spec edit is never routed), sprint status (by design, flipped at finalize), no retry after a lost race (spec and spine stance), stale derived `sortName` after an admin rename (spine definition of "derived"), scope as an argument (the service reading is the only one consistent with STORY-SLICING), unreachable empty-`sortName` branch (harmless), no read-only matcher (Story 3.29). See the Review Triage Log.

**Follow-up review recommended:** true. Two medium entries were patched on the first pass. Unverified risk: both patched tests were accepted on their passing alone; nobody inverted the match order or swapped the explicit `createdBy` filter for viewer access to see the new assertions fail.

**Verification:** `npx prettier --check` on the three source files clean; `npx eslint src tests` 0 errors (36 pre-existing warnings in `src/migrations`); `npm run typecheck` clean; `npm run test:unit` 29 files, 501 passed; `npm run test:int` against the worktree's Postgres (port 5436) 29 files passed, 226 tests passed, 1 pre-existing skip, `findOrCreateByName` 6 tests included.

**Residual risks:** a lost race between two concurrent creates of one new name fails the second save with the unique index's `ValidationError` (no retry, per spine). The spec's Never line "no change to `src/fields`" contradicts its own Execution task; the export is intended. Built in the worktree `.claude/worktrees/story-3-27-name-matching` beside Story 3.26 on main: the sprint-status line will conflict on merge (keep both `done`).
