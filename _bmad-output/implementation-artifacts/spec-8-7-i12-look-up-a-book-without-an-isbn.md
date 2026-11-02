---
title: '8.7 [I12] Look up a Book without an ISBN'
type: 'feature'
created: '2026-11-02'
baseline_revision: '9de5b3dff47ff6b96523c5caf232e80c3885dda9'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      The `/scan?book=` page wiring has no committed test: dropping `book` from
      the param chain would break the story's second acceptance criterion with
      every committed test still green.
    evidence: |-
      `answerForBook`, `scanParams` and `held` are unit-tested, but nothing
      imports `scan/page.tsx`; the criterion is walked by
      `tests/e2e/bookWithoutIsbn.walk.spec.ts`, which `.gitignore:19` excludes.
      Pre-existing, not caused by this story: `?isbn=`, `?title=`,
      `RATE_LIMITED` and `unavailable` are equally unguarded at that surface,
      and CLAUDE.md limits Playwright to scan-to-save and the shop check. What
      would settle it: the owner's call on a page-level spec pattern for
      `/scan` (as `collectionPage.unit.spec.ts` does for the sections), which
      is a convention decision above a story's level.
    location: >-
      src/app/(frontend)/scan/page.tsx:57
    severity: low
---

<intent-contract>

## Intent

**Problem:** `lookupBook` answers by ISBN only, so a hand-entered Book without one has no Answer: the spine's `{ bookId }` target (AD-9, AD-11) and the `/scan?book=<bookId>` address (Routes) are declared and unimplemented. Story 8.8's Lookup results open an Answer per row, and a row for an own Book with no ISBN has nowhere to go.

**Approach:** Give `lookupBook` a `{ bookId }` branch — `requireOwnBook()`, then the same `getEffectiveBooks()` + `getHoldings()` read the ISBN path already does for `existing`, with no source call and no lookup counted — and let `/scan?book=` render that Answer through the held Answer already built in Story 8.2. The Answer's save target becomes `{ isbn13 }` or `{ bookId }` (`saveCopy` already takes both), so Add another copy and Add to library work for a Book with no ISBN.

## Boundaries & Constraints

**Always:**
- `LookupTarget` becomes `{ isbn: string; pick?: number } | { bookId: number }`, exactly as the spine declares it. The `{ bookId }` branch calls `requireOwnBook(ctx, bookId)` first (`NOT_FOUND` for a foreign, unheld or non-row id), then returns `{ kind: 'existing', book, mine }` from `getEffectiveBooks()` and `getHoldings()`, one after the other as the ISBN path does.
- A `{ bookId }` lookup asks no source and counts no lookup: `limitLookups()` stays on the ISBN path alone, the rule `lookupAgain` already follows for the paths that ask nothing. AD-9's shared-rate-limit line states this in the same commit.
- `scanParams()` reads `?book=` as a row id when it is digits, ranked after `?isbn=` and before `?title=`: an address with both answers the ISBN. A value that is not digits, or not a row id, is ignored, so the page falls through to the next param.
- `/scan?book=` renders the held Answer — In library, Ordered or On wishlist — with the facts, buttons and task title Story 8.2 gave it, read through `held()`.
- A `?book=` the viewer does not hold ends on Scan with the "Not in library" notice (`answer.notInLibrary`, a success toast), mirroring the section's `NotInLibrary` for the same address, so NFR-1's "a scan never resets silently" holds. The same for a `NOT_FOUND` from the lookup and for an `existing` result the viewer holds nothing of (a holding lost between the two reads).
- `AnswerBook.isbn13` becomes `string | null`, since a held Answer can be a Book with no ISBN. `notInLibrary()` keeps returning an answer that has one, typed as `SourceAnswer = AnswerBook & { isbn13: string }`, which `NotInLibraryAnswer` takes: the edition picker, the preview cover and its Add to library are unchanged.
- `held()` takes `string | null` and sets `lookAgain` only for the viewer's own private Book **with an ISBN**: `lookupAgain()` is `NOT_FOUND` without one, and Book detail already shows the `detail.lookUpNeedsIsbn` line instead of the Link for that Book.
- Add to library / Add another copy send a target, not a bare ISBN: `AddToLibrary` takes `target: CopyTarget` (`IsbnInput | { bookId: number }`), `saveCopyAction` takes `{ requestId, target }` and checks it with the one parser `saveEntryAction` uses, so a client-sent `bookId` is a row id or `VALIDATION`. `HeldAnswer` sends `{ bookId }` when the Book has no ISBN and `{ isbn13 }` when it has one.
- The target parser lives once: the kinds-by-one-key check now in `parseEntryTarget` moves to `saveInput.ts` and both actions call it — the copy saves for `isbn13` and `bookId`, the entry save for those and `manual`.
- Both message catalogues already carry every string this story shows; no new key.

**Never:**
- No Lookup screen, no `/scan/find`, no result rows, no link to `?book=` from anywhere: Story 8.8 builds the screen that uses this address.
- No source call, no cache read, no cover download and no write on the `{ bookId }` path: lookup writes nothing (AD-9) and this path reads the viewer's own rows only.
- No new Answer kind, heading, layout or button: the held Answer is Story 8.2's, unchanged. No "Add by hand" (8.9) and no not-found page (8.11).
- No change to `requireOwnBook`, `getHoldings`, `getEffectiveBooks`, `answerFacts`, `saveCopy`, `saveEntry`, `lookupAgain`, `retryLookup`, any collection or any migration.
- No `?book=` on the `/scan` scanner loop: a barcode read still submits `?isbn=`.
- No widening of `requireOwnBook` to a Book the viewer can merely read: holding is the whole rule (AD-7).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Own Book, owned copy | A holds an owned copy of Book X (no ISBN) | `existing` with A's `EffectiveBook` and `Holdings`; no source asked | — |
| Own Book, open entry only | A has an open entry on X | `existing`, `mine.entries` the entry | — |
| Ordered copy | A's only copy of X is ordered | `existing`; the Answer heading is Ordered | — |
| Another user's Book | B holds X, A does not | `NOT_FOUND`, nothing read beyond the gate | `DomainError('NOT_FOUND')` |
| Admin, not holding | the admin holds nothing of X | `NOT_FOUND`: the admin's read access is no holding | `DomainError('NOT_FOUND')` |
| Closed entry only | A's only entry on X is closed | `NOT_FOUND` | `DomainError('NOT_FOUND')` |
| Not a row id | `{ bookId: 0 }` or a negative id | `NOT_FOUND` before any read | `DomainError('NOT_FOUND')` |
| No lookup counted | A is at the lookup limit, holds X | `existing` still answers | — |
| `?book=` rendered | `/scan?book=<X>`, A holds an owned copy | the In library Answer: cover, facts, Open book, Add another copy, Back | — |
| `?book=` not held | `/scan?book=<B's book>` | Scan, with the "Not in library" toast | — |
| `?book=` junk | `/scan?book=abc` | Scan, no toast (the param is ignored) | — |
| Both params | `/scan?isbn=978…&book=7` | the ISBN's Answer | — |
| Add another copy, no ISBN | the In library Answer for X | the save sends `{ bookId: X }`, one more owned copy at the default location | the action's existing failures |
| Add to library, no ISBN | the On wishlist Answer for X | the save sends `{ bookId: X }`; A's own open entries for X close | the action's existing failures |
| Look it up again | A's own private Book with no ISBN, In library | no Look it up again Link | — |
| Bad target from client | `saveCopyAction({ requestId, target: { bookId: 'x' } })` | `VALIDATION`, nothing saved | `VALIDATION` |

</intent-contract>

## Code Map

- `src/lib/catalogue/lookupBook.ts:26` -- `LookupTarget`, whose comment says the `{ bookId }` target arrives with I12; `:88-104` `lookupBook`'s ISBN path, including the `limitLookups(ctx)` call to keep on that path and the `getEffectiveBooks` + `getHoldings` pair (with its "both present" comment) the new branch reuses. The `existing` kind of `LookupResult` (`:48`) is unchanged.
- `src/lib/books/requireOwnBook.ts:20` -- the gate: `isRowId()`, then a `copies` count, then an open-entry count; `NOT_FOUND` otherwise. Read-only; `src/app/(frontend)/heldBook.ts:12` shows the same gate wrapped for Book detail.
- `src/app/(frontend)/scan/answer.ts:39-54` -- `AnswerBook` (whose `isbn13` becomes `string | null`); `:66-71` `HeldAnswer`; `:85-104` `existingBook()`, which takes the ISBN to show; `:112` `notInLibrary()` (its return narrows to `SourceAnswer`); `:159-176` `held()` and its `lookAgain` line; `:286-301` `scanParams()`, which gains `book`; `:312-318` `ScanOutcome`, which gains `notHeld`; `:334-358` `answerFor()`, the shape the new `answerForBook()` mirrors (its `DomainError` catch, its "every finished lookup ends on an Answer" rule).
- `src/app/(frontend)/scan/page.tsx:51-62` -- the param-to-outcome chain the `?book=` branch joins, and `:64-67` the `lists` read (`notHeld` needs none); `:70-95` the render, where `notHeld` renders `ScanScreen` plus a `RaiseToast`, as `RATE_LIMITED` already does at `:81-85`.
- `src/app/(frontend)/(sections)/NotInLibrary.tsx:16-27` -- the precedent for an unheld `?book=`: the `answer.notInLibrary` success toast, then the address without the param. `/scan`'s equivalent address is Scan itself.
- `src/app/(frontend)/components/toast/store.ts:3-13` -- `ToastInput`: `{ kind: 'success', message }` is what the notice needs.
- `src/app/(frontend)/scan/HeldAnswer.tsx:48-56` -- the `lookAgain` slot and the two `AddToLibrary` call sites to re-target.
- `src/app/(frontend)/scan/AddToLibrary.tsx:33-60` -- the props to replace with one `target`, and the `saveCopyAction` call built from them.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx:55,68,84,89` -- the four places that need a `string` ISBN, hence `SourceAnswer`.
- `src/app/(frontend)/scan/actions.ts:39-50` -- `saveCopyAction` and `:73-76` `isSaveInput`, replaced by the shared target parser.
- `src/app/(frontend)/actions/wishlists.ts:182-195` -- `parseEntryTarget`: the kinds-by-one-key body that moves into `saveInput.ts`, with `isRowId` and `isManualFields` already beside it.
- `src/app/(frontend)/saveInput.ts:9-31` -- `IsbnInput`, `isIsbnInput()`, `isbnTarget()`; where `CopyTarget` and the shared parser go. Not a `'use server'` file, so it may export types.
- `src/lib/catalogue/saveCopy.ts:23-28` -- `SaveTarget`; `:87-96` the `{ bookId }` branch's documented behaviour (one more owned copy, `requireOwnBook()` in the transaction, no source, no share or merge, "for Books without an ISBN (I12)"). Read-only: it is already built.
- `src/lib/catalogue/lookupAgain.ts:31-40,70-77` -- why `lookAgain` needs an ISBN: the gate is `NOT_FOUND` without one. `src/app/(frontend)/(sections)/BookDetail.tsx:237-244` -- the muted `detail.lookUpNeedsIsbn` line Book detail shows instead.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:176` -- AD-9's `lookupBook` line, which already states the `requireOwnBook()` rule; `:185` the shared-rate-limit line to amend; `:198` AD-11's `{ bookId }` target line; `:464` `LookupTarget`; `:560` the `/scan` Routes row, which already names `?book=`.
- `tests/int/lookupBook.int.spec.ts:1-60` -- the harness: `vi.mock('@/lib/metadata/lookup')`, `contextFor`/`createUser`, `asA`/`asB`/`asAdmin`, the `candidate()` builder and `randomIsbn`. `tests/int/holdings.int.spec.ts:189-208` -- `wishlistOfA`/`entryOfA` for the entry rows.
- `tests/unit/answer.unit.spec.ts:215-318` -- the `held` and `scanParams` blocks to extend; `tests/unit/heldAnswer.unit.spec.ts` -- the rendered held Answer, where the no-ISBN target is asserted.
- `tests/e2e/heldAnswers.walk.spec.ts` -- Story 8.2's uncommitted walk: the sign-in, `E2E_*` constants from `tests/e2e/account.ts` and the toast locator this story's walk copies.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/lookupBook.ts` -- make `LookupTarget` the spine's union and add the `{ bookId }` branch (gate, then the two reads, no source, no `limitLookups`) -- the story's first criterion.
- `src/app/(frontend)/saveInput.ts` -- add `CopyTarget` and the shared one-key target parser -- both save actions must check a client `bookId` the same way, in one place.
- `src/app/(frontend)/actions/wishlists.ts` -- call the shared parser from `saveEntryAction` -- the body moved out of it.
- `src/app/(frontend)/scan/actions.ts` -- `saveCopyAction` takes `{ requestId, target }` and checks it with the shared parser -- Add to library must be able to save a Book with no ISBN.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- one `target` prop in place of `isbn13`/`pick`/`candidate` -- the button serves both targets.
- `src/app/(frontend)/scan/answer.ts` -- nullable `AnswerBook.isbn13`, `SourceAnswer`, `held()`'s signature and ISBN-gated `lookAgain`, `scanParams().book`, the `notHeld` outcome and `answerForBook()` -- the Answer must describe a Book with no ISBN.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx` -- take `SourceAnswer` -- it needs the ISBN as a string.
- `src/app/(frontend)/scan/HeldAnswer.tsx` -- send the target the Book calls for -- the no-ISBN Answer's buttons must work.
- `src/app/(frontend)/scan/page.tsx` -- the `?book=` branch and the `notHeld` render -- `/scan?book=<bookId>` is the story's second criterion.
- `ARCHITECTURE-SPINE.md` -- AD-9's shared-rate-limit line states that a `{ bookId }` lookup counts nothing, since it asks no source -- a story that changes a spine contract updates the spine in the same commit.
- `tests/int/lookupBook.int.spec.ts` -- the `{ bookId }` rows of the matrix: own copy, open entry only, another user's Book, the admin holding nothing, a closed entry, a non-row id, and no lookup counted at the limit -- the criterion names the gate and that no source is called.
- `tests/unit/answer.unit.spec.ts` -- `answerForBook()`'s three outcomes, `scanParams()`'s `book` ranking and junk handling, and `held()` with a null ISBN (no `lookAgain`) -- the matrix rows for the address and the Answer.
- `tests/unit/heldAnswer.unit.spec.ts` -- the no-ISBN held Answer sends `{ bookId }` and offers no Look it up again -- the save target is the behaviour that breaks silently.

**Acceptance Criteria:**
- Given a Book the viewer holds and the sources faked, when `lookupBook(ctx, { bookId })` runs, then it resolves `existing` with that viewer's `EffectiveBook` and `Holdings`, `lookupSources` is never called, and nothing is written.
- Given `/scan?book=<bookId>` for a Book with no ISBN that the viewer owns a copy of, when the page renders, then it is the In library Answer with the copy's line, Open book, Add another copy and Back, and no Look it up again.
- Given that Answer's Add another copy, when it is pressed, then the save targets the Book by id and a second owned copy exists at the default location.
- Given `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run test:int`, when they run, then all pass, with the existing scan, answer and save specs green without edits beyond the ones this story names.
- Given the spine, when the commit lands, then AD-9's rate-limit line states that a `{ bookId }` lookup counts no lookup.
- Given the walk (`tests/e2e/*.walk.spec.ts`, uncommitted), when it adds a book by hand with no ISBN and opens `/scan?book=` for it, then the Answer is as above and Add another copy saves; what it saw is recorded under `## Auto Run Result

Status: done

**Implemented.** `lookupBook(ctx, { bookId })` is the spine's second lookup target: `requireOwnBook()` gates it, then the two reads the ISBN path already makes (`getEffectiveBooks()`, `getHoldings()`) answer `existing`. It asks no source and counts no lookup, so a viewer at the limit still gets an Answer. `/scan?book=<bookId>` renders that held Answer -- In library, Ordered or On wishlist -- and because a hand-entered Book has no ISBN to address, the Answer's saves now carry a target (`{ isbn13 }` or `{ bookId }`) through the one parser the entry save already used. Nothing links to the address yet; Story 8.8 builds the screen that does.

**Files changed**
- `src/lib/catalogue/lookupBook.ts` -- `LookupTarget` is the spine's union; `ownBook()` gates and reads, with `limitLookups()` left on the ISBN path.
- `src/app/(frontend)/saveInput.ts` -- `CopyTarget` and the shared `parseTarget(target, allowed)`, moved out of the wishlist action.
- `src/app/(frontend)/actions/wishlists.ts` -- `saveEntryAction` calls the shared parser.
- `src/app/(frontend)/scan/actions.ts` -- `saveCopyAction` takes `{ requestId, target }`, checked by that parser.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- one `target` prop in place of `isbn13`/`pick`/`candidate`.
- `src/app/(frontend)/scan/answer.ts` -- nullable `AnswerBook.isbn13`, `SourceAnswer`, `held()`'s signature and ISBN-gated `lookAgain`, `scanParams().book` (a row id), the `notHeld` outcome and `answerForBook()`.
- `src/app/(frontend)/scan/HeldAnswer.tsx`, `NotInLibraryAnswer.tsx` -- the target each Answer sends, and `SourceAnswer` where an ISBN is required.
- `src/app/(frontend)/scan/page.tsx` -- the `?book=` branch and the `notHeld` render.
- `ARCHITECTURE-SPINE.md` -- AD-9's shared-rate-limit line states that a call asking no source counts nothing.
- `tests/int/lookupBook.int.spec.ts`, `tests/int/saveCopyAction.int.spec.ts`, `tests/unit/answer.unit.spec.ts`, `tests/unit/heldAnswer.unit.spec.ts`, `tests/unit/addToLibrary.unit.spec.ts`, `tests/unit/notInLibraryAnswer.unit.spec.ts` -- the matrix rows and the re-targeted save assertions.

**Review findings**

Patched (4 entries; 5 findings, two sharing one root cause): the `held(result, null)` degradation, at `medium` -- an own Book with an ISBN opened by `?book=` lost Look it up again and skipped the AD-5 auto-share on save, now fixed by carrying the Book's own ISBN; `scanParams` accepting a digit string that is not a row id, so `?book=0&title=x` no longer swallows the title; `answerForBook`'s redundant `bookId` parameter, dropped; and a test row for the `{ manual }` target the copy save refuses.

Deferred (1): the `?book=` page wiring has no committed guard, since the walk is git-ignored by design.

Rejected (6), with reasons: the unheld `?book=` staying in the address (not an everyday address, and the precedent cited is the notice, not the replace); `parseTarget`'s runtime-only narrowing (no bad outcome; generics add surface); `ownBook`'s mixed `!`-and-throw (the asymmetry mirrors what each read guarantees); `?book=abc` versus `?book=999999` differing (after the row-id patch that split is the honest one); the prettier reflow in `lookupBook.int.spec.ts` (unformatted at HEAD, and the gate requires it formatted); the stale spec frontmatter (finalization writes it, and the fix would edit this build's spec).

**Follow-up review recommended: false.** Patched entries by verdict: medium 1, low 3, high 0 -- one medium is below the two-medium threshold, and nothing patched was `high`.

**Verification**
- `npm run typecheck` -- clean.
- `npm run lint` -- 0 errors, 60 pre-existing warnings (unused migration arguments).
- `npm run test:unit` -- 88 files, 1243 tests, all passed.
- `npm run test:int` -- 81 files, 709 tests, all passed.
- `npx prettier --check` on every changed file -- clean.
- `npx playwright test tests/e2e/bookWithoutIsbn.walk.spec.ts` -- 1 passed, re-run after the patches.
- Every I/O matrix row is covered by a test that ran; the On wishlist + no-ISBN row was the one gap and I added its assertion to `tests/unit/heldAnswer.unit.spec.ts` during verification.

**Walk (uncommitted, `tests/e2e/bookWithoutIsbn.walk.spec.ts`)** -- what it saw: signed in as the e2e user, took Scan's **Add without ISBN** Link to `?title=`, typed a title and author and pressed **Add to library**; the save landed with the held "Saved to E2E shelf" toast, whose Edit href gives the Book id. `/scan?book=<bookId>` then rendered the **In library** Answer: the Book's title as the heading, one fact line "E2E shelf · owned", and **Open book**, **Add another copy**, **Back** -- with no **Look it up again**, the Book having no ISBN. **Add another copy** saved and returned to Scan with the toast, and `/scan?book=` then showed two owned lines. `/scan?book=999999` landed on Scan with the "Not in library" toast, and `/scan?book=abc` on Scan with no toast.

**Residual risks**
- The matrix's "Bad target from client" row reads `VALIDATION`; the action surfaces it as `SAVE_FAILED`, which is `saveCopyAction`'s pre-existing contract for malformed input ("to the person scanning they all mean try again"). The row's substance -- refused before the save, nothing written -- holds, and the tests assert the surfaced code.
- `tests/int/lookupBook.int.spec.ts` was unformatted at HEAD, so this commit carries prettier reflow of lines the story did not touch.
- `saveCopyAction`'s input shape changed; `AddToLibrary` and its specs are the only callers in the repo.
- A Book opened by `?book=` that has an ISBN now behaves exactly like the same Book opened by `?isbn=`. Story 8.8 chooses which address its own-library rows use; nothing links to `?book=` yet.
- Built alone, not beside another worktree. A parallel `bmad-build-auto` dispatch for Story 8.8 halted on this story's dirty tree and left `bmad-build-auto-result-8-8-i6-lookup-by-title-or-author.md` untracked; it is not part of this commit.
