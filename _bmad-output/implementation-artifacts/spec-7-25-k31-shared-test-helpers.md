---
title: '7.25 [K31] Shared test helpers'
type: 'refactor'
created: '2026-10-31'
status: 'done'
baseline_revision: 'b0d008bc672e7b311921a4980755eae520c0f033'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred:
  - summary: >-
      No test checks that a toast Undo on /loans refreshes the page, since the removed loansPage case was the only one.
    evidence: |-
      Deleting RefreshOnUndo from loans/page.tsx leaves all 1088 unit tests passing. The epic names the case for removal and sets the count at N-1, so it could not be kept here. The rule is in AD-7, so it is written into Story 7.26's acceptance criteria in epics.md.
    location: >-
      tests/unit/loansPage.unit.spec.ts
    severity: medium
  - summary: >-
      The comment in vitest.unit.setup.ts still names collectionPage.unit.spec.ts for the overlay tests.
    evidence: |-
      The overlay tests moved in this story, and the contract forbids touching setup files. Written into Story 7.26's acceptance criteria in epics.md.
    location: >-
      vitest.unit.setup.ts:2
    severity: low
---

<intent-contract>

## Intent

**Problem:** The integration specs each carry their own `freshUser`, `sharedBook`, `unique`, `ownerId`, `copyAs`, `personAs`, `loanAs` and `failure`, three unit specs copy `serverTree`, and `collectionPage.unit.spec.ts` is 1647 lines across four surfaces. A new test starts by copying, and a change to one surface touches a file about all of them.

**Approach:** One `tests/helpers/builders.ts` and one `tests/helpers/serverTree.ts` replace the copies. `collectionPage.unit.spec.ts` splits by surface over a shared mock harness in `tests/helpers/`. The one case that restates a mocked call sequence goes. Every other test keeps its name and its assertions.

## Boundaries & Constraints

**Always:** The set of test full names before and after differs by exactly the removed case, compared from vitest's JSON output, not only by count. Split specs keep the outer `describe('CollectionPage')` and their nested describes, so full names stay identical. A builder keeps what each copy did: gateway writes for `copyAs`, `personAs` and `loanAs`, so access rules and hooks run; `overrideAccess` for `sharedBook`, with `req` when a caller passes `by`. Where a spec depends on a value (admin roles, a source, a title, a duplicate name), it passes that value.

**Never:** No file under `src` changes. No assertion is loosened or rewritten; a call site changes only to reach the builder. No builder for things outside the criterion (`wishlistAs`, `privateBook`, `reqFor` beyond the shelf specs that lose their last use of it). No new test. No change to `vitest.config.mts`, its lanes or setup files. The unit-spec `const failure = {...}` values and `createCopy.int.spec.ts`'s `new Error` are not copies of `failure` and stay.

</intent-contract>

## Code Map

- `tests/helpers/harness.ts` -- `createUser`, `contextFor`, `as`; builders build on these and it keeps them.
- `tests/helpers/isbn.ts` -- `randomIsbn`.
- `unique` copies, 19 specs -- `grep -rn "const unique = " tests/int`. `editBook` has it inside a describe.
- `ownerId` -- `wishlistEntries`, `people`, `locations`, `loans`, `wishlists`, `copies`, `fieldHelpers:71` (its `Row` owner is `number | { id: number }`, so the shared parameter takes that wider type).
- `freshUser` -- `sharePrivateBook:136` (`admin` boolean, roles `['admin']`), `lookupAgain:66` (`admin` boolean, roles `['admin','user']`), `createPrivateBook:107`, `saveCopy:163` (`Partial<User>`), `saveClosesEntries:45`, `saveEntry:77`. No spec asserts the display names.
- `sharedBook` -- shelf family `shelfIds:29`, `shelfValues:31`, `shelfSearch:30`, `getShelfRows:30`, `shelfFilters:33` (`(by, data)`, 68 sites); `closeEntry:54`, `saveClosesEntries:50`, `entryRecipient:31`, `foreignKeys:29` (no args, no spec asserts the title); `saveEntry:117` (`(isbn13)`); `lookupAgain:84` (`(isbn13)`, title `T2`, source `google`); `sharePrivateBook:155` (`(isbn13, title, author)`, creates a shared author, source `finna`).
- `copyAs` -- `locations:39`, `loans:29`, `copies:44`, `holdings:62` (closure over `shared`/`x`), `loansService:33` (positional `status`, `location`).
- `personAs` -- `wishlistEntries:48`, `loans:37`, `people:27` (data), `peopleService:34`, `loansService:44` (positional name). `people.int.spec.ts:83-85` needs its explicit duplicate names and passes them.
- `loanAs` -- `loans:45` (`data`); `peopleService:42` also makes the copy, positional `returnedOn`, `lentOn`, about 15 sites.
- `failure` -- `setRating`, `wishlistsService`, `deleteLocation`, `moveCopies`, `peopleService`, `receiveCopy`, `setRead`, `renameMergeLocation`, `loansService`.
- `serverTree` -- `collectionPage.unit.spec.ts:171`, `loansPage.unit.spec.ts:154`, `wishlistPage.unit.spec.ts:120`, all the same body.
- `tests/unit/loansPage.unit.spec.ts:553` -- 'Returned closes the loan with an Undo toast and refreshes; a toast Undo refreshes again', the epic's `:548` at the time of the Epic 6 retro (A-section line 68, confirmed at `8b11101`). Its `undoneListeners` and any mock left unused go with it.
- `tests/unit/collectionPage.unit.spec.ts` -- `:22-270` mocks, fixtures, render helpers; `:273-296` shared `beforeEach`/`afterEach`; `:298-508` list; `:509-700` Read and Remove; `:701-~846` Move; `:848-908` list cases; `:910-1173` Book detail; `:1175-1509` a copy line, with Lend; `:1511-1645` beside the list at 1300px. `searchParams` and `matchesScreen` are `let`s reassigned by cases. `both`, `selected`, `tap`, `reloadsWith` repeat per describe and move as they are.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:319` -- Tests row names `harness.ts`.

## Tasks & Acceptance

**Execution:**
- `tests/helpers/builders.ts` -- new. See Design Notes.
- `tests/helpers/serverTree.ts` -- new, the function and its doc comment.
- `tests/helpers/collectionPage.ts` -- new, the mocks, globals, fixtures and render helpers from `collectionPage.unit.spec.ts:22-270`, plus `setSearchParams`, `setScreen` and `resetCollectionPage()`. See Design Notes.
- `tests/unit/collectionPage.unit.spec.ts` -- keep the list cases.
- `tests/unit/collectionSelection.unit.spec.ts` -- new, 'Read and Remove in select mode'.
- `tests/unit/collectionMove.unit.spec.ts` -- new, 'Move'.
- `tests/unit/bookDetail.unit.spec.ts` -- new, 'Book detail' with 'beside the list at 1300px'.
- `tests/unit/bookDetailCopyLine.unit.spec.ts` -- new, 'Book detail' › 'a copy line', with Lend.
- `tests/unit/{loansPage,wishlistPage}.unit.spec.ts` -- import `serverTree`; `loansPage` loses the named case.
- Integration specs in the Code Map -- import the builders, drop the local copies and imports they leave unused, adapt call sites.
- `ARCHITECTURE-SPINE.md` Tests row -- name `builders.ts` beside `harness.ts`.

**Acceptance Criteria:**
- Given `tests/int`, when the eight names are searched as declarations (`const (freshUser|sharedBook|unique|ownerId|copyAs|personAs|loanAs) =`, and `const failure = (promise`), then none matches outside `tests/helpers/builders.ts`, and the integration specs import them from there.
- Given `tests/unit`, when `function serverTree` is searched, then it matches nowhere, and `tests/helpers/serverTree.ts` is imported by `loansPage`, `wishlistPage` and the collection harness used by the split specs.
- Given the split, when `wc -l` runs on `tests/unit`, then no spec of `collectionPage`'s surfaces passes about 600 lines, each surface has its own spec, and the case at `loansPage.unit.spec.ts:553` is gone.
- Given vitest's JSON reporter run on both lanes before and after, when the sorted full names are diffed, then the only difference is the one removed case, the counts are recorded in the Auto Run Result, and all tests pass.
- Given `git diff --stat -- src`, when the story is done, then it is empty.
- Given the spine's Tests row, when the story is done, then it names `tests/helpers/builders.ts`.

## Spec Change Log

## Review Triage Log

### 2026-11-01 — Review pass
- verdicts: 32 findings — high 0, medium 6, low 23, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: `userWith` and `user` are `freshUser` under other names — Confirmed, same body. Deleted; sites call `freshUser()`.
  - `[low]` `[reject]` Blind: `copyOf` survives in five shelf specs — Real, but the epic names the eight helpers, and it returns an id and takes `notes`. A wrapper would stay a local copy.
  - `[low]` `[reject]` Blind: 22 inline shared Book creates — Not the named local functions; each sits in setup with its own fields.
  - `[low]` `[reject]` Blind: `suffix` duplicates `unique` — Not named by the epic, and its sites build strings `unique` does not fit one for one.
  - `[medium]` `[defer]` Blind: removing the Loans case leaves Returned on `/loans` untested — Confirmed. Same entry as the Verification row.
  - `[false]` `[reject]` Blind: `wishlistPage` keeps the pattern the Loans removal objected to — The Epic 6 retro objected to the action, toast and refresh sequence; `wishlistPage`'s case only guards the Undo refresh.
  - `[low]` `[patch]` Blind: `loansPage` header still claims Returned with Undo — Reworded.
  - `[low]` `[patch]` Blind: `lendNewCopy`'s doc comment is stale — Reworded.
  - `[low]` `[defer]` Blind: `vitest.unit.setup.ts` comment names the old spec — Contract forbids setup-file changes; now a Story 7.26 criterion.
  - `[low]` `[patch]` Blind: spine Tests row omits helpers — Added `unique()`, `ownerId()`, `failure()` and `serverTree.ts`.
  - `[low]` `[patch]` Blind: harness import not first in every split spec — Moved first in three specs.
  - `[low]` `[patch]` Blind: `resetCollectionPage()` does not reset the screen — Added; the two local `afterEach` blocks deleted.
  - `[low]` `[reject]` Blind: `both`, `selected`, `tap`, `reloadsWith` repeat across split specs — Moved as they were: they already repeated per describe, and a change to them touches one surface.
  - `[low]` `[patch]` Blind: `sharedBookBy` clashes with `by` — Renamed `sharedBookWithAuthor`; `t2Book` stays, local to one spec.
  - `[low]` `[patch]` Blind: `sharedBook` can create a private Book — Doc comment says `data` may override `visibility`.
  - `[low]` `[patch]` Blind: `loanAs` hides its date — Doc comment names the `lentOn` default.
  - `[false]` `[reject]` Blind: `deploy/README.md` has a stray character — Not in this diff; changed outside this story.
  - `[medium]` `[patch]` Edge: copy-line spec lost `installNavigationTracking()` — Same entry as the Verification row.
  - `[medium]` `[defer]` Edge: `/loans` `RefreshOnUndo` lost its guard — Same entry as the Blind row.
  - `[low]` `[patch]` Edge: `loansPage:17` header — Same fix as the Blind row.
  - `[low]` `[reject]` Edge: the spec calls the removed case only a mock restatement — The fix edits this build's spec; the Auto Run Result records the loss.
  - `[medium]` `[defer]` Verification: `/loans` Undo refresh unverified — Pre-verified by mutation. A new case breaks the epic's N-1 count, and a changed case breaks the contract, so 7.26 takes it, as CLAUDE.md requires for a spine rule.
  - `[medium]` `[patch]` Verification: `bookDetailCopyLine` lost tracking and cannot tell back from replace — Module-level `installNavigationTracking()` added; the name diff could not see this.
  - `[low]` `[defer]` Verification, other: `vitest.unit.setup.ts` comment — Same entry as the Blind row.
  - `[low]` `[reject]` Intent: near-copies under other names remain — Same reasoning as the `copyOf` row; the literal reading is the epic's.
  - `[low]` `[reject]` Intent: builders are per entity, not composing — Retro wording is loose; a composing builder adds surface no case needs.
  - `[low]` `[reject]` Intent: a fixture change touches a harness all five specs read — Inherent in sharing the mocks; a case still changes in one spec.
  - `[medium]` `[defer]` Intent: FR-36's page click-through has no unit test — Same entry as the Blind row. The action stays covered in `loansService.int`.
  - `[low]` `[reject]` Intent: name parity does not prove assertion identity — True, and the line-by-line comparison plus the tracking fix cover it; no further check is warranted.
  - `[false]` `[reject]` Intent: the review diff omits the four split specs — True of the first diff only. It was regenerated and the other three layers reviewed the full one.
  - `[low]` `[reject]` Intent: line numbers drift (`:553` should be `:548`, 1608 vs 1647) — The fix edits this spec; the right case was removed, by name.
  - `[low]` `[patch]` Intent: spine row omits exports — Same fix as the Blind row.

## Design Notes

```ts
// tests/helpers/builders.ts
export const unique = (name: string) => `${name} ${randomUUID().slice(0, 8)}`
export const ownerId = (doc: { owner: number | { id: number } }): number => …
export const failure = (promise: Promise<unknown>) => promise.catch((e: unknown) => e)
export const freshUser = async (data: Partial<User> = {}) => ({ user, ctx })
export const sharedBook = async ({ by, ...data }: Partial<Book> & { by?: User } = {}) => …
export const copyAs = async (user: User, data: Pick<Copy, 'book'> & Partial<Copy>) => …
export const personAs = async (user: User, data: Partial<Person> = {}) => …
export const loanAs = async (user: User, data: Pick<Loan, 'copy' | 'person'> & Partial<Loan>) => …
```

`sharedBook` takes one options object so the no-argument specs and the shelf family meet: `sharedBook(a, { title })` becomes `sharedBook({ by: a, title })`. Default title `Kirja`, `isbn13: randomIsbn()`. `copyAs` drops the closure, so `book` is explicit at each site: a closure over `shared` is why the copies existed. Default status `owned`. `personAs` defaults to `Liisa ${randomUUID()}`, `nameKey: ''`; the hook overwrites it. `loanAs` defaults `lentOn: '2026-10-20'`.

Local wrappers stay only where a spec's meaning needs more than the builder: `sharePrivateBook`'s author-creating helper is renamed `sharedBookBy` and calls `sharedBook`; `lookupAgain`'s becomes `t2Book(isbn13)`; `peopleService`'s becomes `lendNewCopy(user, person, returnedOn?, lentOn?)` over `copyAs` and `loanAs`, positional arguments kept so its sites keep their shape.

Harness: `vi.mock` in `tests/helpers/collectionPage.ts`, loaded by each split spec before the page. Vitest hoists it there as in a spec; the page is loaded with the same top-level `await import` after. Each spec keeps its `// @vitest-environment jsdom` line. An exported `let` can't be assigned from outside, so `searchParams = new URLSearchParams(x)` becomes `setSearchParams(x)` and `matchesScreen = f` becomes `setScreen(f)`. `resetCollectionPage()` holds the shared `beforeEach`/`afterEach`, called inside each `describe('CollectionPage')`.

The `moved lines` rule: the epic excludes moved lines from the size guide. The hand-written part is the three helpers and call-site edits.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors.
- `npm run typecheck` -- expected: pass.
- `npx vitest run --config ./vitest.config.mts --project unit --reporter=json --outputFile=...` -- before and after; expected: sorted full names differ by the one case.
- The same with `--project int` after `npm run test:int`'s `tsx scripts/test-db.ts` -- expected: names identical.
- `git diff --stat -- src` -- expected: nothing.

## Auto Run Result

Summary: the eight integration helpers live in `tests/helpers/builders.ts`, `serverTree` in `tests/helpers/serverTree.ts`, and `collectionPage.unit.spec.ts` (1647 lines) is five specs by surface over `tests/helpers/collectionPage.ts`. The named Loans case is gone.

Files: new `builders.ts`, `serverTree.ts`, `collectionPage.ts` in `tests/helpers`; new `collectionSelection`, `collectionMove`, `bookDetail`, `bookDetailCopyLine` unit specs; `collectionPage`, `loansPage`, `wishlistPage` unit specs; 39 integration specs; the spine's Tests row; Story 7.26's criteria in `epics.md`; sprint status.

Counts, from vitest's JSON before and after, on the final tree:
- Unit: 1089 before, 1088 after, all passing. The sorted full names differ only by `LoansPage returned Returned closes the loan with an Undo toast and refreshes; a toast Undo refreshes again`.
- Integration: 688 before, 688 after, all passing, names identical.

Spec sizes: `collectionPage` 305, `collectionSelection` 217, `collectionMove` 172, `bookDetail` 427, `bookDetailCopyLine` 371 lines.

Decision: `linna` moved into the harness, because `bookDetail` and `bookDetailCopyLine` both need it. The final names are `sharedBookWithAuthor` and `lendNewCopy`; the Design Notes' `sharedBookBy` is stale.

Review: 8 entries patched (1 medium, 7 low); 2 issues deferred to Story 7.26's criteria (1 medium, 1 low); the rejected rows and their reasons are in the Triage Log.

Follow-up review: not recommended (`false`): no high and one medium patched.

Verification, after the patches: lint 0 errors (60 warnings), typecheck clean, `git diff --stat -- src` and the vitest config and setup files empty, the helper declaration greps match nothing outside `tests/helpers`. The first review diff left out the four split specs; it was regenerated, and Blind, Edge and Verification reviewed the full diff after a usage-limit stop. The Intent audit saw the first diff and read the specs on disk. No walk: no screen changed.

Residual risks: until 7.26, nothing guards `RefreshOnUndo` on `/loans`. Removing the case cost that coverage, shown by mutation. `deploy/README.md` was changed outside this story during the run (table reformatting and a stray `«` at line 21), is not in this commit, and leaves the tree dirty. Files shared with parallel stories: none.
