---
title: 'Story 5.35: [D33] Look up a hand-entered Book again'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '89d2a79ce5d544b67b22989a39ed71496d0bfe65'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A Book Mika typed in by hand stays private with his values even after Finna or Google Books learns its ISBN; today it is shared only on his next save of it (3.39), so he has no way to ask again from the Book itself (FR-12, D-8).

**Approach:** A new `lookupAgain()` in `lib/catalogue` asks the sources fresh and then runs 3.39's auto-share (`prepareShare` + `settleHeldBook`) in one transaction without creating a copy. A "Look it up again" Link calls it from Book detail and from the In library Answer, with the edition picker when several candidates come back.

## Boundaries & Constraints

**Always:**
- Gate: `requireOwnBook()`, then a gateway read of the Book. Anything other than the viewer's own private Book with an `isbn13` is `NOT_FOUND`, before any source is asked. Then `limitLookups()` (`RATE_LIMITED`).
- If a shared Book with the ISBN exists (`findBookByIsbn`), the merge runs without asking the sources (as `lookupBook`: a shared Book never calls them).
- Otherwise call `lookupSources(isbn13, { fresh: true })`. The second call, after an edition is picked, uses `heldOutcome(isbn13)` and falls back to a fresh lookup only when that misses. `unavailable` is never cached (`lookupSources` already guarantees this).
- Overrides, re-matching, cover rules and orphan clean-up are exactly `settleHeldBook()`'s (AD-5, D-8). The admin's differing values are dropped; another user's become overrides when they differ beyond case, whitespace and punctuation.
- The run uses `withTransaction`, not `withUndo`. No copy is created, and the toast has no Undo.
- Strings ship in en and fi. The picker opens one overlay deep over the Book detail sheet or panel, or over the Answer.

**Never:** No change to `saveCopy`'s behaviour. No wishlist entries (Epic 7, 7.7). No Undo. Never read or change another user's private Book, row or copy. No new cover-preview or edition-line logic: reuse the existing ones.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Promote | own private Book, sources `found`, one candidate | Same id becomes shared with the candidate's values; differing typed values become overrides (none for the admin); copy count unchanged; `{ kind: 'shared', bookId, source }`; toast "Shared · from Finna" | — |
| Merge | a shared Book with the ISBN exists | Copies and `user-books` row move to it, the private Book is deleted; `bookId` = the shared id; sources not asked | Still referenced → plain `Error`, rollback (existing) |
| Several | `found`, ≥2 candidates, no `candidate` | `{ kind: 'editions', candidates, pick: 0 }`, cover previews recorded, nothing written; the client opens the Picker | — |
| Picked | `candidate` = `{ source, recordId }` | Promotes with that candidate | Candidate gone → `NOT_FOUND` |
| None | sources `none` | `{ kind: 'none' }`, nothing changes; toast "Still not found." | — |
| Unavailable | a source failed, none had it | `{ kind: 'unavailable', failed }`, nothing changes; toast "{sources} didn't answer." | — |
| Not eligible | shared Book, no ISBN, or not held | — | `NOT_FOUND` before any source call |

</intent-contract>

## Code Map

- `src/lib/catalogue/sharePrivateBook.ts` -- `prepareShare` :50 reads `heldOutcome()` itself; `settleHeldBook` :112 is the promote/merge transaction body; the pure D-8 compare at :135-217 (`looseKey`, `fromBook`, `fromCandidate`, `differing`) is the split seam named in the epic context and epic-4 retro A5.
- `src/lib/catalogue/saveCopy.ts:677` -- the only `prepareShare` caller.
- `src/lib/catalogue/refetchBook.ts` -- template (5.34): gate shape, `limitLookups` then `lookupSources(isbn13, { fresh: true })`, result union with `unavailable.failed`.
- `src/lib/catalogue/lookupBook.ts` -- `toDraft` :432 (private, to export), `Draft`; `recordCoverPreview(ctx, isbn13, coverUrls)` :492 makes `coverUrl({ isbn13, pick })` serve each candidate's preview.
- `src/lib/catalogue/findBookByIsbn.ts`, `pick.ts` (`CandidateId`, `chooseCandidate`), `lookupLimit.ts` (header comment still says `lookupAgain` "must call it when it arrives").
- `src/app/(frontend)/(sections)/Refetch.tsx` -- client template: pending label, `settleAction`, success toast, source labels via `useTranslations('sources')`, `format.list` for failed sources.
- `src/app/(frontend)/(sections)/BookDetail.tsx:164` -- 5.34's Re-fetch line above the foot; `book.visibility`/`book.isbn13` come from `EffectiveBook`.
- `src/app/(frontend)/(sections)/ShelfRows.tsx:64` -- `useAfterAction()` throws outside `ShelfActionsProvider`, so `/scan` cannot use it; `components/request.ts:75` `useReportFailure` works there.
- `src/app/(frontend)/(sections)/FilterChip.tsx:31` -- `parseShelfQuery(useSearchParams())` + `shelfHref(query, { book })` to re-address Book detail.
- `src/app/(frontend)/scan/EditionPicker.tsx` -- Picker row markup (Cover at `w-cover-row` + line); `answer.ts` `notInLibrary` :112-122 builds `AnswerEdition[]`, `editionLines()` :213; `inLibrary()` :138; `InLibraryAnswer.tsx`; `AnswerLayout` `editions` slot (the line under the Book).
- `src/app/(frontend)/scan/actions.ts:66` -- `isCandidateId` input check.
- `tests/int/sharePrivateBook.int.spec.ts` -- harness: `vi.mock('@/lib/metadata/lookup')`, `found()` builder, manual save makes the private Book.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/handEnteredValues.ts` -- move the D-8 compare (`looseKey`, `Comparable`, `fromBook`, `fromCandidate`, `differing`, `BookValues`, scalar list) out of `sharePrivateBook.ts` unchanged -- epic-context split at the seam; pure move.
- `src/lib/catalogue/sharePrivateBook.ts` -- import from it; `prepareShare` takes the `found` outcome as a parameter instead of reading `heldOutcome()` -- lookupAgain must not depend on a cache entry surviving.
- `src/lib/catalogue/saveCopy.ts` -- pass `heldOutcome(isbn13)`; behaviour unchanged.
- `src/lib/catalogue/lookupBook.ts` -- export `toDraft`.
- `src/lib/catalogue/lookupAgain.ts` -- new `lookupAgain(ctx, { bookId, candidate? })` returning `LookupAgainResult` (`shared` with `bookId` and `source: string | null` (the candidate's, or the shared Book's on a merge), `editions` with `Draft[]` and `pick`, `none`, `unavailable`) per the matrix.
- `src/lib/catalogue/lookupLimit.ts` -- comments name `lookupAgain` as a caller.
- `src/app/(frontend)/scan/answer.ts` -- extract `answerEditions(isbn13, drafts)` from `notInLibrary` (reused); `InLibrary` gains `lookAgain: boolean` (Book is private).
- `src/app/(frontend)/actions/catalogue.ts` -- new `lookUpAgainAction({ bookId, candidate? })`: `runAction` + `requireUserOrThrow`, input checked (`VALIDATION`); maps `editions` to `{ pick, rows: EditionRow[], ids: CandidateId[] }` with `editionLines()` server-side.
- `src/app/(frontend)/scan/EditionPicker.tsx` -- export the row label as `EditionLabel` and use it.
- `src/app/(frontend)/(sections)/LookUpAgain.tsx` -- client `LookUpAgainLink({ bookId, onSettled })`: Link ("Looking it up…" and disabled while pending), toasts, Picker for `editions` whose choice calls the action again with that id; plus `DetailLookUpAgain`: `afterAction(result)`, then on `shared` `router.replace(shelfHref(query, { book }), { scroll: false })` when the id changed, else `router.refresh()`.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- on a private Book, `DetailLookUpAgain` with an ISBN, else the muted line "Add the ISBN on Edit book to look it up.", in the Re-fetch slot.
- `src/app/(frontend)/scan/AnswerLookUpAgain.tsx` + `InLibraryAnswer.tsx` -- wrapper: `router.refresh()` on `shared`, `useReportFailure` on failure; rendered in the `editions` slot when `lookAgain`.
- `messages/en.json`, `messages/fi.json` -- `detail.lookUpAgain`, `detail.lookingUp`, `detail.lookUpNeedsIsbn`, `toast.sharedFrom` "Shared · from {source}", `toast.shared` "Shared" (merge into a Book with no source), `toast.stillNotFound`, `toast.noAnswer`.
- `tests/int/lookupAgain.int.spec.ts` -- one case per matrix row; each `found`/merge case also asserts that another user's private Book with the same ISBN, its row and its copy are unchanged, and that the viewer's copy count did not change; promote as the admin keeps no overrides.
- `ARCHITECTURE-SPINE.md` AD-5 -- one line beside 5.34's re-fetch line: `lookupAgain(ctx, { bookId, candidate? })`, its gate, result kinds, and the edition round trip.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 5.35 `done` when finished.

**Acceptance Criteria:**
- Given my private Book with an ISBN open in Book detail or on its In library Answer, when I tap "Look it up again" and a source has one candidate, then the Book shows the source's values as shared, the toast reads "Shared · from {source}" with no Undo, and on the Answer the Link is gone.
- Given several candidates, when I tap the Link, then the edition Picker opens over Book detail; picking one shares the Book with that edition, and closing the Picker changes nothing.
- Given my private Book merges into an existing shared Book from Book detail, when it finishes, then Book detail shows the shared Book (address replaced) and the collection rows reload.
- Given a private Book without an ISBN, when Book detail renders, then "Add the ISBN on Edit book to look it up." shows instead of the Link; a shared Book shows neither.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 28 findings — high 0, medium 2, low 21, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: a `NOT_FOUND` from Look it up again goes to `afterAction`, which toasts "Not in library" though the viewer still holds the Book. This happens with a stale candidate, a Book already shared from another tab, or another user's private Book. — Each trigger needs another tab or an admin back-office flip; the candidate case needs a partial `found` (5 min TTL) that expired between the two taps. A fix adds a branch and its own error handling. The "double reload" claim is false: `afterAction` reloads the rows, `router.refresh()` re-renders Book detail.
  - `[low]` `[reject]` Blind: the In library Answer does not refresh after a failure, so a Book shared elsewhere keeps its Link. — It needs a share from another tab while the Answer is open. The next tap reports the failure. A fix adds a branch.
  - `[low]` `[reject]` Blind: Book detail shows the Link (or the ISBN hint) on any private Book, while the service also requires `createdBy` to be the viewer. — Only an admin's back-office flip of a shared Book to private creates a holder who is not the creator. `EffectiveBook` has no `createdBy`, so the fix adds public surface.
  - `[low]` `[patch]` Blind: the second call uses a held `none` (`heldOutcome` caches `none`), so a pick can answer "Still not found." — It is unlikely, because only a fresh lookup overwrites the cached `found`, but the fix is a direct correction. The held outcome is now used only when it is `found`; otherwise the sources are asked fresh. A new int case covers it.
  - `[low]` `[reject]` Blind: `editions.pick` is always 0 and the client never reads it. — The spec matrix and the spine line set `pick: 0`, so removing it means editing the spec. It carries no wrong data.
  - `[low]` `[reject]` Blind: the merge path and the picked-candidate call count against the lookup limit without asking a source. — The spec's Always list orders `limitLookups()` straight after the gate. The cost is one extra count of 30 per edition round trip, and moving it means editing the spec.
  - `[low]` `[reject]` Blind: `toast.noAnswer` repeats `detail.refetchNoAnswer`, and the label/`format.list` code repeats `Refetch.tsx`. — The spec's task list names `toast.noAnswer`. Two short copies with no caller that diverges; a shared helper is an abstraction for two sites (CLAUDE.md).
  - `[low]` `[reject]` Blind: no test reaches the gate's `createdBy` filter (a holder of another user's private Book). — If the filter were removed, `findBookByIsbn()` would still answer `NOT_FOUND` for another user's private row, so no spine rule rests on this test alone. A test-only ask (CLAUDE.md triage rule).
  - `[low]` `[reject]` Blind: the merge test does not check the moved `user-books` row or D-8 overrides on the shared Book. — The merge is `settleHeldBook()`, unchanged and pinned by the merge cases in `sharePrivateBook.int.spec.ts`. A test-only ask.
  - `[false]` `[reject]` Blind: process skipped (`oversized` not split; spec and context not in the diff; sprint-status `done` while the spec is `in-review`). — Mika dismissed the `oversized` trigger in 4.15 (epic-4 retro P4), and every earlier Epic 5 spec with the warning was built whole. The spec is kept out of the diff on purpose (it is the claims file). Finalization sets the spec to `done` in the same commit.
  - `[low]` `[patch]` Blind: `AnswerLayout`'s `editions` slot now also holds Look it up again, so its doc no longer describes it. — The doc now reads "the line under the Book: the edition picker's Link, or Look it up again".
  - `[low]` `[patch]` Edge: a cached `none` wins over the pick. — Same as the Blind row above, patched there.
  - `[low]` `[reject]` Edge: a stale-candidate `NOT_FOUND` toasts "Not in library". — Same as the first Blind row, rejected for the same reason.
  - `[low]` `[reject]` Edge: the shared Book seen by the first read is gone when `settleHeldBook()` reads again, so the result says `shared` with nothing shared. — It needs the admin to delete a shared Book in the milliseconds between two reads. A fix adds a branch.
  - `[low]` `[reject]` Edge: the Answer's `router.refresh()` re-runs `lookupBook`, which counts one more lookup, so at the limit the share succeeds and the Answer turns into Scan with `RATE_LIMITED`. — It needs the 30th lookup in the window. The share has already happened and Scan explains the limit. A fix changes how the Answer is addressed.
  - `[false]` `[reject]` Edge (claim): a non-admin with differing typed values keeps seeing them after the share. — That is D-8 as the epic AC requires ("as another user, those that differ … become my overrides"). The Book is shared, and the source's values fill everything the user did not type.
  - `[medium]` `[patch]` Verification gap: no `RATE_LIMITED` case for `lookupAgain` (spine AD-9; every sibling caller has one). — Added an int case: the limit is used up, then `RATE_LIMITED` with no source call.
  - `[low]` `[patch]` Verification gap: no case for a picked candidate with nothing held (spec Always: fresh fallback). — Added an int case over `heldOutcome` returning `undefined` and `none`.
  - `[low]` `[reject]` Verification gap: "cover previews recorded" on `editions` is untested (filed as defer). — It affects only how the Picker covers look. The call is the same `recordCoverPreview()` that `coverPreview.int.spec.ts` pins. A test needs fetch faking for a cosmetic path (CLAUDE.md test minimum).
  - `[low]` `[patch]` Verification gap: `inLibrary()` never asserts `lookAgain: true` (AC: the Link on the In library Answer). — Added a unit case with a private Book.
  - `[low]` `[patch]` Verification gap (other): the `coverPreview.ts` docs say "called by `lookupBook` alone". — They now name `lookupAgain` too.
  - `[low]` `[reject]` Intent: the AC lives at the UI (Link, toast, Picker, address), while the tests stop at the service. — Consistent with the tests convention: Playwright covers only scan-to-save and the shop check, and there is no server-component harness. The manual browser check is recorded as a residual risk.
  - `[false]` `[reject]` Intent: "through `lookupBook`" is implemented as `limitLookups` + `lookupSources`. — The same rate limit and the same uncached `unavailable`. The Design Notes explain why calling `lookupBook` would lose the `failed` list. No bad outcome.
  - `[medium]` `[patch]` Intent: `RATE_LIMITED` is untested. — Same as the Verification gap row, patched there.
  - `[low]` `[reject]` Intent: `createdBy` clearing, re-matching, orphan clean-up and the still-referenced rollback are not asserted on this path. — They are `settleHeldBook()`'s, unchanged and pinned by `sharePrivateBook.int.spec.ts`. A test-only ask.
  - `[false]` `[reject]` Intent: `isCandidateId` moved to `pick.ts`, and the action lives in `actions/catalogue.ts`, not `(sections)/actions.ts`. — A `'use server'` file cannot export a sync helper that two actions share. The spec puts the action where both surfaces reach it. No harm named.
  - `[false]` `[reject]` Intent: uncommitted, sprint-status ahead of the spec, `oversized` not split. — Same as the Blind process row.
  - `[low]` `[reject]` Intent: the spec's manual browser checks were not run. — Not a code defect. Recorded under Residual risks in the Auto Run Result.

## Design Notes

"Through `lookupBook`" (AC) is read as "through the lookup path `lookupBook` uses": `limitLookups` then `lookupSources`. Calling `lookupBook` itself would return `existing` for the private Book and throw away the outcome, including the `failed` list the `unavailable` toast needs. 5.34 set the same precedent. The first call is fresh because the cache can hold a 10-minute `none` from the scan that led here, and "again" means asking the sources.

The edition round trip mirrors the Answer's D-7 rule: the first call writes nothing and returns the candidates; the second sends the picked `{ source, recordId }` and reuses the held outcome, so the Book takes exactly the edition shown.

## Verification

**Commands:**
- `npm run test:int -- tests/int/lookupAgain.int.spec.ts tests/int/sharePrivateBook.int.spec.ts tests/int/refetchBook.int.spec.ts` -- expected: passes
- `npm run test:unit -- tests/unit/messages.unit.spec.ts` -- expected: passes
- `npm run typecheck` and `npm run lint` -- expected: no errors

**Manual checks:**
- In the browser at 390px and wide: tap the Link on a hand-entered Book with a fixture ISBN; check the toast, the refreshed detail, and the Picker one overlay deep (Esc closes only the Picker).

## Auto Run Result

**Summary:** Look it up again (FR-12, D-8, AD-5). The new `lookupAgain(ctx, { bookId, candidate? })` in `lib/catalogue`:
- **Gate:** the viewer's own private Book with an ISBN; anything else is `NOT_FOUND` before any source is asked. Then the lookup limit.
- **Merge:** when a shared Book with the ISBN exists, it merges into it without asking the sources.
- **Otherwise:** it asks the sources fresh and runs 3.39's `prepareShare` + `settleHeldBook` in one transaction. No copy is created and there is no Undo.
- **Several candidates:** two or more come back as `editions`, writing nothing. The second call sends the picked `{ source, recordId }` and uses the held outcome when it is `found`.

A "Look it up again" Link appears in Book detail on a private Book, in 5.34's Re-fetch slot; a private Book without an ISBN shows "Add the ISBN on Edit book to look it up." instead. The same Link appears on the In library Answer for the viewer's private Book.
- **Toasts:** "Shared · from {source}", "Still not found." or "{sources} didn't answer.".
- **Edition Picker:** opens one overlay deep.
- **After a share:** a merge from Book detail re-addresses it to the shared Book; a promote refreshes it in place. The Answer refreshes after a share.

The D-8 compare moved out of `sharePrivateBook.ts` into `handEnteredValues.ts` unchanged (the epic context's split seam). `prepareShare` now takes the outcome as a parameter.

**Files changed:**
- `src/lib/catalogue/lookupAgain.ts` (new): the service.
- `src/lib/catalogue/handEnteredValues.ts` (new): the D-8 compare, moved unchanged.
- `src/lib/catalogue/sharePrivateBook.ts`: imports the compare; `prepareShare(ctx, isbn13, held, outcome, pick?, id?)`.
- `src/lib/catalogue/saveCopy.ts`: passes `heldOutcome(isbn13)`; behaviour unchanged.
- `src/lib/catalogue/lookupBook.ts`: exports `toDraft`.
- `src/lib/catalogue/pick.ts`: `isCandidateId` moved here from `scan/actions.ts`, shared by two server actions.
- `src/lib/catalogue/lookupLimit.ts`, `coverPreview.ts`: comments name `lookupAgain`.
- `src/app/(frontend)/actions/catalogue.ts` (new): `lookUpAgainAction`, with edition rows built on the server.
- `src/app/(frontend)/(sections)/LookUpAgain.tsx` (new): `LookUpAgainLink` and `DetailLookUpAgain`.
- `src/app/(frontend)/(sections)/BookDetail.tsx`: the Link or the ISBN hint on a private Book.
- `src/app/(frontend)/scan/AnswerLookUpAgain.tsx` (new), `InLibraryAnswer.tsx`, `answer.ts` (`answerEditions`, `InLibrary.lookAgain`), `EditionPicker.tsx` (`EditionLabel`), `AnswerLayout.tsx` (doc), `actions.ts` (imports `isCandidateId`).
- `messages/en.json`, `messages/fi.json`: the new detail and toast strings.
- `tests/int/lookupAgain.int.spec.ts` (new), `tests/unit/answer.unit.spec.ts`.
- `ARCHITECTURE-SPINE.md` AD-5: the `lookupAgain` line.
- `sprint-status.yaml`: 5.35 `done`.

**Review findings:** 28 in total.
- **Patches:** 7 rows, 5 entries.
  - The held outcome is used only when it is `found` (low; Blind and Edge rows).
  - A `RATE_LIMITED` int case (medium; Verification gap and Intent rows).
  - A pick-with-nothing-held int case (low).
  - An `inLibrary` `lookAgain: true` unit case (low).
  - Doc fixes in `coverPreview.ts` and `AnswerLayout.tsx` (low).
- **Deferred:** none.
- **Rejected:** 21 rows, each with its reason in the Review Triage Log. Mainly:
  - rare multi-tab or admin-flip cases whose fix adds branches;
  - spec-set choices (`pick: 0`, when the limit counts, string keys);
  - test-only asks on behaviour pinned by `sharePrivateBook.int.spec.ts`;
  - UI-surface tests outside the tests convention;
  - process items already settled (the `oversized` trigger dismissed in 4.15; spec and sprint-status set to done in one commit).

**Follow-up review recommendation:** `false`. Patched entries by verdict: high 0, medium 1, low 4.

**Verification:**
- `npm run test:int -- tests/int/lookupAgain.int.spec.ts tests/int/sharePrivateBook.int.spec.ts tests/int/refetchBook.int.spec.ts`: 45 passed.
- `npm run test:unit -- tests/unit/messages.unit.spec.ts tests/unit/answer.unit.spec.ts`: 61 passed.
- `npm run typecheck`: clean. `npm run lint`: 0 errors (40 warnings, all in old migrations).
- The implementer also ran the full int (66 files) and unit (885 tests) suites before the patches, all passing.

**Residual risks:**
- **Not checked in a browser:** the spec's manual check at 390px and wide (the toast, the refreshed Book detail, the Picker one overlay deep with Esc closing only it).
- **Finnish strings need Mika's read:** "Etsi uudelleen", "Etsitään…", "Lisää ISBN kohdassa Muokkaa kirjaa, niin kirjaa voi etsiä.", "Jaettu · lähteestä {source}", "Ei vieläkään löytynyt.".
- **Picker marker:** the Picker opens with no row marked (`value={null}`), because the shared Picker treats a tap on the marked row as "close without a choice".
- **Misleading toast:** a stale-candidate or already-shared `NOT_FOUND` toasts "Not in library" (rejected as rare).
