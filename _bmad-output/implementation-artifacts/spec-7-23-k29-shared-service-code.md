---
title: '7.23 [K29] Shared service code'
type: 'refactor'
created: '2026-10-31'
status: 'done'
baseline_revision: '5d3287c6de0440941feac5bac51d2018c69379c1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred:
  - summary: >-
      createLocation and renameLocation still carry inline nameKey lookups that match ownedRowKeyed.
    evidence: |-
      Pre-existing copies, outside the story's three named items and barred by its contract. No later story takes them yet, and no harm follows for Epics 8 and 9, which do not touch them.
    location: >-
      src/lib/copies/locations.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epics 6 and 7 copied service code: three `Ref` resolvers, the open-entry and open-loan conditions (7 and 5 sites), and `Named` (five declarations). Epics 8 and 9 would build on the copies.

**Approach:** Fold all of it into `lib/payload`, which every service that needs it may already import and which imports no service: `resolveOwnedName()` in a new `ownedName.ts`, `openEntry` and `openLoan` in a new `openRows.ts`, `Named` in `ref.ts` beside `Ref`. No new import edge. Behaviour stays as it is.

## Boundaries & Constraints

**Always:** Each resolver keeps its exported name, signature, doc comment and error field. AD-18's owners stay: `resolveLocation` in `lib/copies`, `resolvePerson` in `lib/people`, `resolveWishlist` in `lib/wishlists`; callers keep calling those. `Ref` resolution keeps opening no transaction and running on the caller's context. `resolveLocation` keeps its looser rules exactly: an id comes back unchecked (`ownedRelation` rejects it at the write), and a name over `limits.name` passes to the write and fails there, not up front. Blank fails with `VALIDATION` on `location` before any read. `resolvePerson` and `resolveWishlist` keep their up-front checks: id shape and ownership fail with `VALIDATION` on the field; over-long fails `TOO_LONG` on the field. The spine's Shared shapes and source tree change in the same commit (a story that changes a spine contract updates it; here also a done-criterion).

**Never:** No re-export of `Named` from `effectiveBook.ts`. No change to any error code, query result or transaction boundary. No new test files, ESLint zone or `serviceImports` change. No change to `returnedOn: { exists: true }` (returned, not open), or to the `closedAt`/`returnedOn` writes. No change to `createLocation` or location rename, nor to `src/app/(frontend)/(sections)/settings/ManagedList.tsx`'s `ManagedItem` (Story 7.24's ground). No `planning-artifacts` edit other than the spine.

</intent-contract>

## Code Map

- `src/lib/payload/ref.ts` -- pure, no imports, used by client components through `lib/shelf/query.ts`. `Ref` at `:4`; `Named` goes beside it.
- `src/lib/copies/locations.ts:22-45` -- `resolveLocation`; find relies on `ownerAccess`, no explicit `owner` filter. Adding the filter is the same result: `own` scopes the admin too. `:66` `LocationOption`, structurally `Named`.
- `src/lib/people/people.ts` -- `:11` `Named` and its comment; `:25` `normalisedName`, `:35` `takenBy`, `:58` `ownsPeople`, `:83` `resolvePerson`. Create and rename at `:115-149` use `normalisedName`/`takenBy`; `assertOwnPeople` at `:67`, called with `[id]` and with two ids at `:202`. `:313` `lendingPeople`.
- `src/lib/wishlists/wishlists.ts` -- `:16`, `:26`, `:49` the same three helpers, word for word except collection and field; `:74` `resolveWishlist`; `:96` `WishlistLine` (spine says `Named & { count }`); `:131` `Named`; `:118`, `:169` open-entry.
- `src/lib/wishlists/entries.ts:13` -- `Named`; `:83`, `:149`, `:217` open-entry.
- `src/lib/books/holdings.ts:97` open-entry (bare key in `where`), `:156` open-loan (bare key); `src/lib/books/requireOwnBook.ts:28` open-entry (bare key).
- `src/lib/loans/loans.ts:12` `Named`; `:82`, `:223` open-loan. `src/lib/copies/updateCopy.ts:30`, `src/lib/copies/receiveCopy.ts:89` open-loan.
- `src/lib/books/effectiveBook.ts:13` -- the exported `Named`. Importers to repoint: 14 files, found with `grep -rlE "import.*\bNamed\b" src tests` (frontend files, `lib/books/holdings.ts`, `lib/shelf/query.ts`, `lib/catalogue/{listGenres,saveCopy}.ts`, three `tests/int` files). Frontend type imports from `lib/payload` are allowed. Some are inline `type Named` beside other names; split those.
- `eslint.config.mjs:22-36` -- `serviceImports`: every service that needs the new modules already lists `payload`; `src/lib/payload` may import `@/fields/*` and `@/lib/errors`.
- `src/lib/payload/gateway.ts` -- `find`, `count`, `create` are generic on `AppSlug`.
- Spine (`_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md`): `:255-258` AD-18 name-keyed bullets; `:412-416` Shared shapes (`Ref` under `// src/lib/payload`, `Named` under `// src/lib/books`); `:599` `payload/` line of the source tree.

## Tasks & Acceptance

**Execution:**
- `src/lib/payload/ref.ts` -- add `export type Named = { id: number; name: string }` with a spine doc comment.
- `src/lib/payload/ownedName.ts` -- new. Exports: `normalisedName(name, field, maxLength = limits.name)`, the people/wishlists helper; `ownedRowKeyed(ctx, collection, key, exceptId?)`, ex-`takenBy`; `ownsRows(ctx, collection, ids)`, ex-`ownsPeople` with an explicit `owner` filter and its `count`-not-`findByID` comment; `resolveOwnedName(ctx, ref, { collection, field, checks })`. `collection` is `'locations' | 'people' | 'wishlists'`; Epic 9 widens it with tags. `checks` is `'upfront'` (default) or `'atWrite'`, the location rule. See Design Notes.
- `src/lib/payload/openRows.ts` -- new, no value imports. `openEntry` and `openLoan`, each a `Where`, with a one-line comment. Bare-key sites spread it (`...openEntry`), `and` arrays list it.
- `src/lib/copies/locations.ts` -- `resolveLocation` a one-call body with `checks: 'atWrite'`; `LocationOption = Named`.
- `src/lib/people/people.ts` -- `resolvePerson` a one-call body; drop `Named`, `normalisedName`, `takenBy`, `ownsPeople` for the shared ones.
- `src/lib/wishlists/wishlists.ts` -- the same with `ownsWishlist`; `WishlistLine = Named & { count: number }`.
- `src/lib/wishlists/entries.ts`, `src/lib/loans/loans.ts` -- drop the local `Named`; use the conditions.
- `src/lib/books/holdings.ts`, `src/lib/books/requireOwnBook.ts`, `src/lib/copies/updateCopy.ts`, `src/lib/copies/receiveCopy.ts` -- use the conditions.
- `src/lib/books/effectiveBook.ts` -- drop the declaration, import the type from `ref.ts`.
- Every other importer of `Named` -- repoint to `@/lib/payload/ref`.
- `src/app/(frontend)/ref.ts:9` -- comment still reads true; leave it.
- `ARCHITECTURE-SPINE.md` -- Shared shapes: `Named` under `// src/lib/payload`, gone from `// src/lib/books`. AD-18: one sentence after the `Ref` bullet's first sentence, that the owner resolves it through `resolveOwnedName()` in `lib/payload` and that this makes `lib/payload` no owner. Source tree `payload/` line: add `resolveOwnedName`, `openEntry`, `openLoan`, `Named`.

**Acceptance Criteria:**
- Given `resolveLocation`, `resolvePerson` and `resolveWishlist`, when the story is done, then each body is one call to `resolveOwnedName()` in `lib/payload/ownedName.ts`, the service-specific behaviour in Boundaries holds, and the existing integration specs for all three pass unedited except for type imports.
- Given the open-entry and open-loan conditions, when `src/lib` is searched, then `closedAt: { exists: false }` and `returnedOn: { exists: false }` each appear once, in `lib/payload/openRows.ts`, and every one of the 7 and 5 sites uses it.
- Given `Named`, when `src` and `tests` are searched, then it is declared once, in `lib/payload/ref.ts`, and the spine's Shared shapes name it there in the same commit.
- Given the import rules, when lint runs, then there is no new violation and `eslint.config.mjs` is unchanged.

## Spec Change Log

## Review Triage Log

### 2026-10-31 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 16, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` Edge: `ownedName.ts` is a new `lib/payload` to `src/fields` edge, against "No new import edge" — The spine's table allows `src/lib` to import `src/fields`; no zone or table row changes.
  - `[low]` `[patch]` Verification: over-long location name has no test — Case added to `createCopy.int.spec.ts`, guarding criterion 1; it fails with the `Infinity` removed.
  - `[low]` `[patch]` Blind: `assertOwnLocations` is a private copy of `ownsRows` — Now calls `ownsRows`.
  - `[low]` `[defer]` Blind: location key lookups keep inline copies — Pre-existing, barred by the contract; recorded in `deferred`.
  - `[low]` `[patch]` Blind: nothing keeps shared helpers with their owners — The AD-18 sentence says a service calls it only for its own collection.
  - `[low]` `[reject]` Blind: `checks: 'atWrite'` is allowed for any collection — One caller passes it; a discriminated type adds complexity for a mistake nobody has made.
  - `[low]` `[patch]` Blind: `atWrite` length rule has no guard — As the Verification row.
  - `[low]` `[patch]` Blind: AD-18 overcommits for tags — The sentence names locations, People and wishlists.
  - `[low]` `[patch]` Blind: AD-18 partly updated — Near-duplicate sentence merged; `Binds:` lists `lib/payload/ownedName.ts`.
  - `[low]` `[patch]` Blind: source tree omits helpers — The line says `ownedName (resolveOwnedName and its helpers)`. The diagram's label is a summary and stays.
  - `[false]` `[reject]` Blind: shared `Where` constants can leak a mutation — Payload's `sanitizeWhereQuery` mutates only on virtual fields; `closedAt` and `returnedOn` are not, so no leak occurs.
  - `[low]` `[reject]` Blind: `ownsRows` preconditions on empty, duplicate and out-of-range ids — No caller passes them: ids are checked by `isRowId` first and the two-id merge refuses equal ids; guards would cover states not shown reachable.
  - `[low]` `[reject]` Blind: `field: string` and the name `normalisedName` — The three callers pass literals and the name is the existing one; a rename adds churn for no met defect.
  - `[false]` `[reject]` Intent: explicit `owner` filter on the location path — `ownerAccess` already scopes the read for every role, so results are identical.
  - `[false]` `[reject]` Intent: `ownsWishlist` `equals` became `in` — Same result for one id, pinned by `wishlistsService.int.spec.ts`.
  - `[low]` `[patch]` Intent: AD-18 "stay as they are" met only by a carve-out beside older text — As the Blind AD-18 rows.
  - `[low]` `[defer]` Intent: location lookups not folded — As the Blind row.
  - `[low]` `[reject]` Intent: `lib/tags` needs a union edit and may need `kind` — The story asks for an importable resolver, and Epic 9 owns the widening; the spine no longer claims tags.
  - `[false]` `[reject]` Intent: in-memory `returnedOn` checks are not folded — The criterion counts `where` conditions, 7 and 5 sites, all folded.
  - `[false]` `[reject]` Intent: unstated `Where` mutation assumption — As the Blind row.
  - `[low]` `[patch]` Intent: thin coverage of the location path — As the Verification row.
  - `[low]` `[reject]` Intent: spec counts three `tests/int` importers, two exist — Stale count only; the fix would edit this build's spec.

## Design Notes

The resolver, in outline:

```ts
export async function resolveOwnedName(ctx, ref, { collection, field, checks = 'upfront' }) {
  const upfront = checks === 'upfront'
  if (typeof ref === 'number') {
    if (upfront && !(isRowId(ref) && (await ownsRows(ctx, collection, [ref])))) {
      throw new DomainError('VALIDATION', { fields: { [field]: 'VALIDATION' } })
    }
    return ref
  }
  const name = normalisedName(ref.create, field, upfront ? limits.name : Infinity)
  const found = await ownedRowKeyed(ctx, collection, toNameKey(name))
  if (found !== undefined) return found
  // `owner` and `nameKey` are what Payload's create type requires; the hooks set both.
  const created = await gateway.create(ctx, { collection, data: { owner: ctx.user.id, name, nameKey: '' }, depth: 0 })
  return created.id
}
```

`takenBy` and the rest move with it because leaving them would add a further copy, not fold one. Locations' `createLocation` and rename also read by key, but sit outside this story's three named items and carry no length rule, so they stay.

The `Where` constants spread into a bare-key `where`, so those queries keep their exact shape.

No test is added: the existing `resolve*` integration cases and `editBook.int.spec.ts` guard the behaviour, and the criteria name no new one. No screen changes, so no walk.

If TypeScript rejects `gateway.create` or `find` on the union `collection`, narrow by a typed overload or a `switch` on `collection`. No `any` and no cast through `unknown`.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors.
- `npm run typecheck` -- expected: pass.
- `npm run test:unit` -- expected: pass.
- `npm run test:int -- tests/int/peopleService.int.spec.ts tests/int/wishlistsService.int.spec.ts tests/int/editBook.int.spec.ts tests/int/holdings.int.spec.ts` -- expected: pass. Use the repo's integration script; check `package.json` for its name.
- `grep -rnE "closedAt: \{ exists: false|returnedOn: \{ exists: false" src/lib` -- expected: one line each, in `openRows.ts`.
- `grep -rn "type Named =" src tests` -- expected: one line, in `src/lib/payload/ref.ts`.

## Auto Run Result

Summary: `resolveLocation`, `resolvePerson` and `resolveWishlist` are one call each to `resolveOwnedName()`, with `checks: 'atWrite'` keeping the location rule. `openEntry` and `openLoan` are written once and used at all 7 and 5 sites. `Named` has one home beside `Ref`, and the spine says so.

Files: `src/lib/payload/ownedName.ts` and `openRows.ts` new; `ref.ts` gains `Named`; `locations.ts`, `people.ts`, `wishlists.ts`, `entries.ts`, `loans.ts`, `holdings.ts`, `requireOwnBook.ts`, `updateCopy.ts`, `receiveCopy.ts` fold onto them; `effectiveBook.ts` and the other `Named` importers repointed; `createCopy.int.spec.ts` gains one case; `ARCHITECTURE-SPINE.md`; `sprint-status.yaml`.

Review: 9 low rows patched, in 5 fixes (0 high, 0 medium); 2 low rows deferred, one issue; 5 low and 6 false rows rejected, reasons in the Triage Log. The first implementer pass's spec said no test was needed; review added one case for criterion 1.

Follow-up review: not recommended (`false`): no high or medium was patched.

Verification: lint 0 errors (60 warnings), typecheck clean, unit 1088 passed, integration 688 passed in 80 files, both greps give the expected single lines. Removing the `Infinity` made the new case fail, then it was restored. No screen changed, so no walk.

Residual risks: `tests/int/lookupBook.int.spec.ts` already failed `prettier --check` at the baseline and still does. `resolveOwnedName` will need more than a union edit for tags, whose rows carry a `kind`; Epic 9 settles that.
