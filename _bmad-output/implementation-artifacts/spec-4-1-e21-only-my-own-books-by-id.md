---
title: 'Story 4.1: [E21] Only my own Books by id'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: 'b42c2fc87019d1471630990c5befdd5fd5164ab6'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred:
  - summary: >-
      Payload REST still lets any signed-in user read shared Books by id or list them at /api/books.
    evidence: |-
      catalogueAccess.read (src/access/catalogue.ts) returns shared-or-own-private for every user, and src/proxy.ts leaves /api to Payload. AD-7 forbids app code from listing books; AD-10 keeps the frontend off /api. Whether the spine means /api to stay open to users on the tailnet is unverified. To settle it, decide whether non-admin REST/Local-HTTP access to books, authors and series should be closed (e.g. admin-only REST) and check that the admin UI does not depend on user access. Pre-existing, not caused by 4.1.
    location: >-
      src/access/catalogue.ts:9
    severity: medium (unverified)
---

<intent-contract>

## Intent

**Problem:** Nothing yet guards a Book reached by id, so the coming Edit book, Book detail and every client-sent `{ bookId }` would open any Book whose id is guessed, the shared catalogue included (AD-7). `saveCopy` also lacks the spine's `{ bookId }` target.

**Approach:** Add `requireOwnBook(ctx, bookId)` to `lib/books`. It passes only when the viewer has a copy of that Book and fails with `NOT_FOUND` otherwise. Teach `saveCopy` the `{ bookId }` target, guarded by it inside the save's transaction, saving one more owned copy at the default location.

## Boundaries & Constraints

**Always:** Read only through the gateway as the viewer. Its `copies` scope already limits rows to the viewer's own, the admin included (AD-6/AD-17, FR-48), so the check needs no `owner` condition and no system privileges. The `{ bookId }` save runs in `withUndo()` like the other targets: Undo deletes the new copy and never the Book. `oncePerRequest()` still wraps every target. Wishlist entries stay out (Epic 7, H14).

**Never:** No server action, Answer or UI change: nothing sends `{ bookId }` yet (Book detail and Edit book come later). No `lookupBook` `{ bookId }` target (I12). No read of `books` to check existence or visibility, because holding a copy is the whole rule. No spine edit: AD-7 and `SaveInput` already state this contract.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Viewer holds it | A has a copy of shared or private Book X; `requireOwnBook(asA, X)` | resolves | No error expected |
| Another user's Book | B has no copy of A's shared or private X; `requireOwnBook(asB, X)` | rejects | `DomainError('NOT_FOUND')` |
| Bad id | `bookId` not a positive safe integer (0, -1, 1.5, NaN) | rejects without a read | `DomainError('NOT_FOUND')` |
| Save by id | A holds X; `saveCopy(asA, { target: { bookId: X } })` | new owned copy of X at A's default location; `{ bookId: X, copyId, savedTo, undoToken, undoSeconds }` | No error expected |
| Save by id, not held | B; `{ bookId: X }` | nothing written | `NOT_FOUND` passes through |

</intent-contract>

## Code Map

- `src/lib/books/holdings.ts` -- sibling reader; same gateway-scoped `copies` access and doc style (AD-7/AD-17 notes). Do not change.
- `src/lib/payload/gateway.ts:53` -- `count(ctx, { collection, where })` is the read to use (`where: { book: { equals: bookId } }`, `totalDocs === 0` → `NOT_FOUND`).
- `src/lib/errors.ts` -- `DomainError('NOT_FOUND')`.
- `src/lib/catalogue/saveCopy.ts` -- `SaveInput.target` union (line ~23) gains `{ bookId: number }`. Branch in `save()` before the ISBN path: `withUndo(ctx, async (tx) => { await requireOwnBook(tx, target.bookId); return saveOwnedCopy(tx, target.bookId, undefined) })`. The header comment (lines ~19–21) says the target "arrives with `requireOwnBook()` (Story 4.1)" and must be updated. The big doc comment gains one short paragraph for the `{ bookId }` target, and the Undo paragraph already covers "a Book that existed before the save stays".
- `src/app/(frontend)/scan/actions.ts` -- narrows `target` to `isbn13`; it type-checks unchanged. Leave it.
- `tests/int/holdings.int.spec.ts` -- setup pattern to copy: `createUser`, `contextFor`, `systemBook(user, visibility)` via `payload.create(... overrideAccess: true, req)`, and `copyAs(user)` via `gateway.create`.
- `tests/int/saveCopy.int.spec.ts` -- existing saveCopy suite (mocks `@/lib/metadata/lookup`; `undo` imported). Add the `{ bookId }` case here.

## Tasks & Acceptance

**Execution:**
- `src/lib/books/requireOwnBook.ts` -- new: `export async function requireOwnBook(ctx: Context, bookId: number): Promise<void>`. It fails with `NOT_FOUND` when the id is not a positive safe integer, and otherwise when the gateway count of the viewer's copies of the Book is 0. A doc comment cites AD-7 and notes that entries join in Epic 7. -- the one gate for Books by id.
- `src/lib/catalogue/saveCopy.ts` -- add the `{ bookId }` target and branch as in the Code Map, and update the comments. -- the AC's `saveCopy` target.
- `tests/int/requireOwnBook.int.spec.ts` -- new two-user test: A holds copies of a shared and a private Book, and `requireOwnBook` passes for A on both. B fails with `NOT_FOUND` on both, and so does an id that is not a positive integer. -- AC two-user proof (access spine rule).
- `tests/int/saveCopy.int.spec.ts` -- one case: as A with `{ bookId }` of a Book A holds, a second owned copy lands at A's default location, and `undo()` deletes only it, so the Book and the first copy stay. As B with the same id the save throws `NOT_FOUND` and B has no copy of it. -- the AC's guarded target and the Undo spine rule.

**Acceptance Criteria:**
- Given `requireOwnBook(ctx, bookId)` in `lib/books`, when it runs, then it passes only when the viewer has a copy of that Book and otherwise fails with `NOT_FOUND`.
- Given a Book the viewer holds, when `saveCopy` gets `{ bookId }`, then it saves an owned copy at the default location in one transaction with Undo. For a Book the viewer does not hold it fails with `NOT_FOUND` and writes nothing.
- Given two users, when B calls `requireOwnBook` for A's shared or private Book, then it fails with `NOT_FOUND`.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 14, false 4, maybe-false 1
- findings:
  - `[low]` `[patch]` (blind) A held Book the user can no longer read makes the by-id save fail with `createCopy`'s `ValidationError`, which is undocumented. Admin-privatised shared Books are rare and the error is already in the errors paragraph. Patched the `{ bookId }` doc paragraph to name the case.
  - `[low]` `[reject]` (blind) `requireOwnBook` takes `number`, not `unknown`, so callers will parse ids differently. No caller sends ids yet, and input shape is validated at the action boundary by convention (`isSaveInput` in `scan/actions.ts`). Parsing here would add surface for later.
  - `[low]` `[reject]` (blind) The "before any read" test spies only `count`, and lacks a non-number id. The finding only asks for a test and names no AC or spine rule (CLAUDE.md triage rule).
  - `[false]` `[reject]` (blind) The admin case is untested against FR-48. `tests/int/copies.int.spec.ts:89` already pins that the admin cannot see another user's copies, and `gateway.count` applies the same `ownerAccess.read`.
  - `[false]` `[reject]` (blind) `lookupSources` not being called proves nothing. The assertion runs after the by-id save in the same test, so a source call from that path would fail it.
  - `[low]` `[reject]` (blind) One `it` covers four behaviours. Only diagnostics suffer and no named harm results; the restructure isn't worth it.
  - `[low]` `[reject]` (blind) Nothing checks the lookup budget or that a failed `requestId` is not remembered. The by-id path never reaches `limitLookups`, and `oncePerRequest` failure behaviour has its own tests. Test-only, with no AC named.
  - `[low]` `[patch]` (blind) `sprint-status.yaml` is not updated. Set `4-1-e21-only-my-own-books-by-id: done` in the story commit, as earlier stories did.
  - `[low]` `[patch]` (blind) The `requireOwnBook` doc sentence is garbled. Split it into short sentences: what passes, what fails before a read, why there is no owner condition.
  - `[low]` `[patch]` (blind) Ordered copies count as holding, undocumented. The gate doc now says "owned or ordered".
  - `[low]` `[patch]` (edge) Same root cause as the first blind finding (ValidationError for an admin-privatised held Book). Same doc patch.
  - `[false]` `[reject]` (edge) A `bookId: undefined` key beside `isbn13` would route a save wrongly. Unreachable: every `SaveInput` is built by typed code (`saveCopyAction`/`saveManualAction` construct `target` with explicit keys), and TS forbids the extra key.
  - `[low]` `[patch]` (edge, claim) A holder of an admin-privatised Book gets an undocumented ValidationError. Same group and same doc patch.
  - `[low]` `[patch]` (verification-gap, other) The by-id save skips AD-5 auto-share and merge. In practice the target serves Books without an ISBN (I12, `lookupBook({ bookId })` "for a hand-entered Book without an ISBN"), and Answers for ISBN Books send `{ isbn13 }`, so ISBN-keyed auto-share has nothing to act on. Patched the doc paragraph to say so; adding the held-Book path would be complexity for no caller.
  - `[maybe-false]` `[defer]` (intent) Payload REST `/api/books` still lets signed-in users read and list shared Books (`catalogueAccess.read`). This is pre-existing. Whether the spine means `/api` to be open to users is unverified, so it is deferred with medium (unverified) in frontmatter.
  - `[low]` `[reject]` (intent) B's failure on a private Book is shown only at the gate, not through `saveCopy`. AC 3 is about the gate and is tested there, and the `saveCopy` case proves the guard is wired.
  - `[low]` `[patch]` (intent) Visibility-changed held Book: duplicate of the first blind finding, same doc patch.
  - `[false]` `[reject]` (intent) The admin case is untested. Same refutation as the blind admin finding (`copies.int.spec.ts:89`).
  - `[low]` `[patch]` (intent) Ordered-only holder: duplicate of the blind ordered-copies finding, same doc patch.

## Design Notes

The check runs inside the save's transaction (`tx`), so the copy it found and the new copy are read and written together. A shared Book the admin made private after A saved it still passes, because a copy is the rule (as in `getHoldings`). `createCopy`'s `readableRelation` then refuses the new copy with its `ValidationError`, which passes through.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass, including `requireOwnBook.int.spec.ts` and the new `saveCopy` case

## Auto Run Result

Status: done

**Summary:** Added `requireOwnBook(ctx, bookId)` in `lib/books`. It passes only when the viewer has a copy of the Book, owned or ordered, and otherwise fails with `NOT_FOUND`, including for an id that is not a positive safe integer, which fails before any read. `saveCopy` accepts a `{ bookId }` target guarded by it inside the save's transaction. The target saves one more owned copy at the default location, with Undo deleting only that copy, and never asks the sources. The spine already stated this contract (AD-7, `SaveInput`), so it is unchanged.

**Files changed:**
- `src/lib/books/requireOwnBook.ts`: new gate for Books reached by id.
- `src/lib/catalogue/saveCopy.ts`: the `{ bookId }` target and its branch, plus doc updates.
- `tests/int/requireOwnBook.int.spec.ts`: two-user test (shared and private Books, bad ids before any read).
- `tests/int/saveCopy.int.spec.ts`: a by-id save at the default location, its Undo, and another user's `NOT_FOUND`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.1 is done.

**Review findings:** 19 in total.
- 9 patches, all `low` and all doc or status edits: the by-id doc now names the case of an unreadable held Book, records that the target never auto-shares (it is for ISBN-less Books, I12), and says ordered copies count; the gate doc is reworded; sprint-status is updated.
- 1 deferred: REST `/api/books` is readable by users, medium (unverified) and pre-existing.
- 5 rejected as `low`: callers parsing ids, two test-only asks, the test split, and B's private case not tested through `saveCopy`.
- 4 rejected as `false`: admin scoping already pinned by `copies.int.spec.ts:89` (raised twice), the `lookupSources` assertion, and the unreachable `bookId: undefined` key.

**Follow-up review recommended:** false. No `high` or `medium` entries were patched (patched by verdict: high 0, medium 0, low 9).

**Verification:** run against the worktree Postgres on 5452.
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. All 36 warnings are pre-existing and in untouched files.
- `npm run test:unit`: 671 passed.
- `npm run test:int`: 43 files, 418 tests passed.
- Every matrix row is covered by a test that ran: the three `requireOwnBook` cases and the `saveCopy` by-id case.

**Residual risks:**
- A held Book the admin made private fails a by-id save with `ValidationError`, not `NOT_FOUND`. The case is documented and untested.
- The by-id save skips auto-share by design. If a later caller sends `{ bookId }` for a private Book that has an ISBN, it stays private until an `{ isbn13 }` save.
