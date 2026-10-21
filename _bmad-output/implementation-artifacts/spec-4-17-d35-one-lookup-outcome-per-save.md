---
title: '4.17 [D35] One lookup outcome per save'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
baseline_revision: '0aa89e2ceb32fa94c249cb5f0200186dbc51a5a0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Add to library can save an edition other than the one the Answer showed (Epic 3 retro R1, S2, S4). `pick` is a bare index into whatever `lookupSources()` returns at save time. `downloadCover()` and `ensureSharedBook()` each ask again, the second inside the open save transaction. A `found` merged while a source failed is never cached, so the save re-asks and can get a different list. `prepareShare()` always takes `candidates[0]`.

**Approach:** Every candidate carries its source's record id. The Answer sends `{ source, recordId }` with `pick`. `save()` resolves the outcome once, before `withUndo`, chooses the candidate by identity, and passes `{ candidate, raw }` to the cover store and to `ensureSharedBook()`, which no longer imports `lookupSources`. A candidate that has gone is `NOT_FOUND`, which Story 4.16 already turns into a refresh of the Answer. A partial `found` is cached for 5 minutes.

## Boundaries & Constraints

**Always:** No source call inside a transaction. `lookupSources()` runs at most once per save, before `withUndo()`, and only for an ISBN with no held Book. A held Book's save still never asks the sources (`heldOutcome()` only). With a candidate identity, the save uses the candidate with that `source` and `recordId` or fails with `NOT_FOUND`. It never falls back to another one. Without an identity, `pickIndex()` applies as now (out of range or none is the best). The Book keeps the ISBN asked for. Spine and `epic-3-context.md` updated in this commit.

**Never:** Changing the lookup limit or the cover preview route (Story 4.18). Splitting `covers.ts` along its seams (retro A11), apart from deleting `downloadCover`. New Payload fields or migrations: `recordId` is not stored on Books. Re-asking the sources after a candidate miss.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Picked edition saved | Two Finna records held; Answer `?pick=1` sends `pick: 1, candidate: { source: 'finna', recordId: <id of 1> }` | Shared Book and cover from that record | — |
| Candidate gone | Held outcome lacks the sent `recordId` (cache replaced after a restart) | `NOT_FOUND`, nothing written, no cover file left; client refreshes (4.16) and the new Answer renders | No toast |
| Partial found | Finna answers, Google fails; Answer, then save within 5 min | Save uses the held outcome: Finna is asked once in total, Google not again | — |
| Partial expired | Same, after 5 min | The next lookup asks every source again | — |
| Cache miss, one candidate | No identity sent (old client) or identity matches | Sources asked once, before the transaction; Book saved | `none` → `NOT_FOUND`; `unavailable` → plain `Error` (`SAVE_FAILED`) |
| Held private Book, pick | Private Book held; `heldOutcome` found with two candidates; save with `pick: 1` | Shared in place with candidate 1's values (D-7) | Identity sent and gone → `NOT_FOUND` |
| Held shared Book | Shared Book exists | `pick` and identity ignored, as now | — |

</intent-contract>

## Code Map

- `src/lib/metadata/source.ts:5-23` -- `SourceResult`. Add `recordId: string` (the source's own id for the record).
- `src/lib/metadata/merge.ts:3,59` -- `MergedField` excludes `source`/`raw`. Also exclude `recordId`, so the merged candidate keeps the first source's id and never gap-fills it.
- `src/lib/metadata/sources/finna.ts:217-241` -- `toResult()`: `recordId` from `record.id` (`FINNA_FIELDS` already asks for `id`). A record without a string id is skipped, like one without a title. `fixture.ts:66` spreads Finna's results and inherits it.
- `src/lib/metadata/sources/google.ts:121-140` -- `toResult(volume)`: `recordId` from `volume.id`, same skip rule.
- `src/lib/metadata/lookup.ts:16-18,106-145` -- add `PARTIAL_TTL_MS = 5 * 60 * 1000`; `:143` remembers a partial `found` with it. Update the doc comments at `:39-48` and `:106-112`.
- `src/lib/catalogue/pick.ts` -- next to `pickIndex`: `type CandidateId = { source: SourceId; recordId: string }` and `chooseCandidate(outcome: found, pick?, id?)` → `Chosen = { candidate, raw }`. It clips with `clipCandidate()` and throws `NOT_FOUND` for a missing id. One rule for `saveCopy` and `prepareShare`.
- `src/lib/catalogue/saveCopy.ts:19-23,94-117` -- `target` gains `candidate?: CandidateId`. Not-held branch: `lookupSources()` (`none` → `NOT_FOUND`, `unavailable` → plain `Error`, as `ensureSharedBook.ts:78-81` does now), `chooseCandidate()`, `storeCover(ctx, isbn13, coverUrl)` when the candidate has one, then `withUndo(ensureSharedBook(tx, isbn13, chosen, cover))`. `:120` passes `pick`/`candidate` to `prepareShare`. Rewrite the docblock lines about `pick` and the sources (`:32-51`, `:68-72`).
- `src/lib/catalogue/ensureSharedBook.ts:50-83` -- new signature `(ctx, isbn13, chosen: Chosen, cover?)`; drop `lookupSources`, `pickIndex`, `clipCandidate` (the caller clips) and the `NOT_FOUND`/`unavailable` branches; `outcome.raw` → `chosen.raw`. Docblock `:15-38`.
- `src/lib/catalogue/covers.ts:166-215` -- delete `downloadCover()`; `storeCover()` (`:217`) is the save's cover step. Remove imports it alone used.
- `src/lib/catalogue/sharePrivateBook.ts:24-65` -- `PendingShare = Chosen & { cover? }`; `prepareShare(ctx, isbn13, held, pick?, id?)` uses `chooseCandidate()` on the held `found` outcome.
- `src/lib/catalogue/lookupBook.ts:22` -- `Draft` keeps `recordId` (it is `Omit<SourceResult, 'raw' | 'coverUrl'>`). No logic change.
- `src/app/(frontend)/scan/answer.ts:22-43,53-66,79-104` -- `AnswerBook.candidate: CandidateId | undefined`, set from the shown draft for every `source` answer (one candidate included), `undefined` for an existing Book.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx:40`, `AddToLibrary.tsx:28-52` -- pass `candidate` and send it with `pick`. `InLibraryAnswer`'s Add another copy sends none.
- `src/app/(frontend)/scan/actions.ts:8-49` -- `isSaveInput` accepts an optional `candidate` of two non-empty strings and passes it on. Doc comment.
- Docs: `ARCHITECTURE-SPINE.md` AD-5 `:115` ("re-fetched on a miss"), AD-9 `:169` (caching rule), AD-11 `:193` (sends `{ isbn13, pick?, candidate? }`, plus the one rule), shapes `:374-392` (`recordId`) and `:465` (`SaveInput`). `epic-3-context.md:79,81,84`: one rule, a save uses the held outcome and asks the sources only on a miss, before the transaction opens.
- Tests that build `SourceResult` (need `recordId`): `tests/unit/{lookup,metadata,finna,google,answer}.unit.spec.ts`, `tests/int/{ensureSharedBook,covers,coverPreview,lookupBook,saveCopy,sharePrivateBook,effectiveBook}.int.spec.ts`. `lookup.unit.spec.ts:168-200` breaker cases serve A with records and rely on repeat lookups not hitting the cache. Keep them asking (A answers `[]`, or clear the cache) rather than weakening them. `covers.int.spec.ts:85,225-248,283,307`: the `downloadCover` cases move to `storeCover` (policy) or go (lookup-dependent ones are now `saveCopy`'s).

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/source.ts`, `merge.ts`, `sources/finna.ts`, `sources/google.ts` -- `recordId` on every candidate, never gap-filled.
- `src/lib/metadata/lookup.ts` -- `PARTIAL_TTL_MS` cache for a partial `found`.
- `src/lib/catalogue/pick.ts` -- `CandidateId`, `Chosen`, `chooseCandidate()`.
- `src/lib/catalogue/saveCopy.ts`, `ensureSharedBook.ts`, `covers.ts`, `sharePrivateBook.ts` -- one outcome resolved before `withUndo`; `downloadCover` deleted; `prepareShare` takes the pick.
- `src/app/(frontend)/scan/answer.ts`, `NotInLibraryAnswer.tsx`, `AddToLibrary.tsx`, `actions.ts` -- send and validate the identity.
- Spine and `epic-3-context.md` -- the rule and shapes above.
- Tests: `saveCopy.int` -- (a) a partial found (Finna fixture, Google `fetch` rejects) looked up then saved asks Finna once in total, and the cover and Book come from the picked record; (b) a save with an unknown `recordId` fails `NOT_FOUND` with no rows and no cover file. `saveCopyAction.int` -- a malformed `candidate` is `VALIDATION`→`SAVE_FAILED`. `sharePrivateBook.int` -- `prepareShare` with `pick: 1` promotes with candidate 1's title. `lookup.unit` -- a partial `found` is held until `PARTIAL_TTL_MS` and then asked again. `finna.unit`/`google.unit` -- expectations gain `recordId`. `answer.unit` -- `candidate` set for one and several candidates. Adapt `ensureSharedBook.int` to pass `Chosen` and drop its `NOT_FOUND`/`unavailable` cases, which are now `saveCopy`'s.

**Acceptance Criteria:**
- Given a save of `{ isbn13, pick, candidate }` with no Book held, when `saveCopy` runs, then `lookupSources` is called at most once, before the transaction opens, and the cover and `ensureSharedBook()` both use that outcome's candidate.
- Given the Answer showed a candidate, when Add to library is pressed, then the action receives that candidate's `source` and `recordId`. If the save's outcome lacks it, the result is `NOT_FOUND`, nothing is saved, and the Answer is rendered again.
- Given a `found` outcome merged while a source failed, when the save runs within 5 minutes, then it uses that outcome without asking any source.
- Given a held private Book and a held `found` outcome with several candidates, when it is saved with a `pick`, then the auto-share takes that candidate's values (D-7).
- Given the spine's AD-11 and `epic-3-context.md`, when read, then both state one rule: a save uses the held outcome and asks the sources only on a miss, before the transaction opens.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 25 findings — high 0, medium 0, low 11, false 14, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: spec flagged `oversized` but not split, and `epic-4-context.md`'s rewrite drops "split before building" plus unrelated test conventions — the rewrite is the workflow-required recompile after b38db51 changed the spine Tests row; the dropped sentence is the one Mika dismissed (`spec-4-15…md:124`, "the `oversized` warning is not acted on").
  - `[low]` `[reject]` Blind: a partial `found` can now auto-share a private Book without the failed source's gap-fill — real, but the result has the same quality as a new shared Book saved during the same outage, which the system already accepts; admin re-fetch fills empty fields. Guarding needs a partial flag in the cache and a branch in `heldOutcome`.
  - `[low]` `[reject]` Blind: when Finna fails, a Google-first outcome is held 5 min and saved — this is AC 3's intent (the save stores what the Answer showed, and the Answer names its source). Before, a save during the same outage stored it too.
  - `[low]` `[reject]` Blind: a candidate miss on the held-private path fails the whole copy save — reachable only if a private Book with the ISBN is created between a Not in library Answer and its save; the refresh then shows In library, whose Add another copy sends no identity. Changing it contradicts the matrix row "Identity sent and gone → `NOT_FOUND`".
  - `[false]` `[reject]` Blind: AC 4 tests a path no client reaches — the In library Answer has no picker, so "the candidate the Answer picked" is the best one, which is what the default gives; the service now honours a pick whenever one is sent, as AC 4 asks.
  - `[false]` `[reject]` Blind: `isCandidateId` is an unsound guard and `recordId` is uncapped — `SourceId` is `string` (`source.ts:3`), so no unsound narrowing; `recordId` is only compared, never stored, and the server-action body limit bounds it.
  - `[false]` `[reject]` Blind: the cover preview picks by index, so it can show another record's cover — the preview serves the URL list `lookupBook` recorded for the Answer it belongs to (`recordCoverPreview`), so it matches the Answer shown; the save's cover comes from the identity's record.
  - `[false]` `[reject]` Blind: a gone candidate gives no feedback — the intent says "fails with `NOT_FOUND` (shown as in Story 4.16)", and 4.16 decided that the re-rendered Answer is the message, with no toast.
  - `[false]` `[reject]` Blind: `ensureSharedBook()` does not check that `chosen` belongs to its ISBN — its only caller builds `chosen` from `lookupSources(isbn13)` for the same normalised ISBN, and the source contract fixes each result's `isbn13` to the ISBN asked.
  - `[low]` `[patch]` Blind: `epics.md:155` and `:1052` still say a partial merge is never cached — both lines updated to the 5-minute rule.
  - `[false]` `[reject]` Blind: `CandidateId` lives in `lib/catalogue/pick.ts` rather than `lib/metadata` — the frontend already imports types from `lib/catalogue`, and a type-only import adds nothing to the client bundle; no caller is harmed.
  - `[low]` `[patch]` Blind: stale comments: `chooseCandidate()`'s in-range comment above a reachable throw, spine AD-5 dropping "with several candidates", and the `actions.ts` "would fail the same way" clause — all three reworded.
  - `[low]` `[patch]` Verification gap: the `candidate` hand-off (Answer → `AddToLibrary` → `saveCopyAction` → `saveCopy`) is unverified (AC 2) — `saveCopyAction.int` case with an unknown `recordId` on a fresh ISBN expects `NOT_FOUND` with nothing written; `addToLibrary.unit` sends `candidate` and expects it in the call.
  - `[low]` `[reject]` Verification gap (other): a partial `found` can auto-share a private Book — same as row 2.
  - `[false]` `[reject]` Edge: `saveCopy` inside a caller's transaction asks the sources before `withUndo` refuses — no caller does this (`saveCopy` is reached only from the server actions with a fresh context), and the call still fails loudly.
  - `[low]` `[reject]` Edge: a partial `found` can auto-share a private Book — same as row 2.
  - `[low]` `[reject]` Edge: an Answer re-rendered near `PARTIAL_TTL_MS`, saved after expiry, re-asks and may store more gap-filled values — the identity still pins the same record, so the result is the shown edition with more fields; rare, and fixing it means anchoring TTLs to reads.
  - `[false]` `[reject]` Edge: a `coverUrl` of `''` triggers a useless fetch — adapters never emit `''` (`clean()` gives `undefined`, `compact()` drops it; source contract "never sent as a placeholder such as ''").
  - `[low]` `[reject]` Intent: the held-private auto-share takes a pick no UI sends — same as row 5; rated low by the auditor's reading C, rejected with that row's evidence.
  - `[low]` `[patch]` Intent: the `NotInLibraryAnswer`/`AddToLibrary` hand-off is not exercised by a test — same as row 13.
  - `[false]` `[reject]` Intent: "a few minutes" became a fixed 5 minutes — descriptive; 5 minutes satisfies the criterion.
  - `[false]` `[reject]` Intent: no test directly asserts that no source is called inside the transaction — no such call path exists: `ensureSharedBook` and `sharePrivateBook` import no source function (only `heldOutcome`, the cache), and the partial-found test asserts one ask per source in total.
  - `[false]` `[reject]` Intent: `covers.ts` was not split along its seams (retro A11) — the story's acceptance criteria do not ask for it, and no harm is named; `downloadCover`, the A6 duplicate, is gone.
  - `[false]` `[reject]` Intent: the `epic-4-context.md` conventions rewrite is out of scope — same as row 1.
  - `[false]` `[reject]` Intent: `isCandidateId` narrows any string to `SourceId` — same as row 6.

## Design Notes

Identity decides, `pick` only addresses: with `candidate` sent, `chooseCandidate` finds it anywhere in the list, so a re-ordered list still saves the shown record. `pick` alone keeps today's fallback, for callers that send no identity. A merged candidate's `source` and `recordId` are the first answering source's, so the pair is unique within one outcome.

`downloadCover`'s own shared-Book find duplicated `ensureSharedBook`'s (retro A6). `save()` reaches that branch only after `findBookByIsbn` found nothing, and a Book created in between is still caught by `ensureSharedBook`, which discards the cover. So `storeCover` is enough.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass (worktree Postgres on port 5434)

## Auto Run Result

Status: done

**Summary.** Add to library now saves the edition the Answer showed. Every source candidate carries its source's own `recordId`, and the Answer sends `{ source, recordId }` with `pick`. When no Book is held, `saveCopy` resolves the sources' outcome once, before the transaction opens, and `chooseCandidate()` takes the candidate by identity, or fails with `NOT_FOUND` when it has gone (4.16 then re-renders the Answer). The chosen candidate and its raw metadata go to `storeCover()` and `ensureSharedBook()`, which no longer asks the sources; `downloadCover()` is deleted. A `found` merged while a source failed is cached for 5 minutes, so the save sees what the Answer saw. A held private Book's auto-share uses `chooseCandidate()` too, so a sent `pick` is honoured (D-7). The spine (AD-5, AD-9, AD-11, `SourceResult`, `SaveInput`), `epic-3-context.md` and `epics.md` state one rule: a save uses the held outcome and asks the sources only on a miss, before the transaction opens.

**Files changed**
- `src/lib/metadata/source.ts`, `merge.ts`, `sources/finna.ts`, `sources/google.ts`: `recordId` on every candidate (a record without one is skipped), never gap-filled.
- `src/lib/metadata/lookup.ts`: `PARTIAL_TTL_MS` (5 min) for a partial `found`.
- `src/lib/catalogue/pick.ts`: `CandidateId`, `Chosen`, `chooseCandidate()`.
- `src/lib/catalogue/saveCopy.ts`: one outcome per save, before `withUndo`; identity threaded to the share.
- `src/lib/catalogue/ensureSharedBook.ts`: takes `Chosen`; no source call.
- `src/lib/catalogue/covers.ts`: `downloadCover()` removed; `storeCover()` is the save's cover step.
- `src/lib/catalogue/sharePrivateBook.ts`: `prepareShare()` takes `pick` and identity.
- `src/app/(frontend)/scan/answer.ts`, `NotInLibraryAnswer.tsx`, `AddToLibrary.tsx`, `actions.ts`: the Answer sends the identity; the action validates it.
- `ARCHITECTURE-SPINE.md`, `epic-3-context.md`, `epics.md`: the one rule, the caching rule and the shapes. `epic-4-context.md`: recompiled after b38db51.
- Tests: `saveCopy.int` (partial found asks each source once and saves the picked record; gone candidate writes nothing), `saveCopyAction.int` (identity reaches the save; malformed identity; sources unavailable; identity ignored on a shared Book), `sharePrivateBook.int` (pick and gone identity on promote), `lookup.unit` (partial TTL), `addToLibrary.unit` (sends `candidate`), adapters, `answer.unit`, `ensureSharedBook.int` and `covers.int` adapted.

**Review findings.** 25 findings: 11 low, 14 false.
- **Patched (low, 3 entries):** the `candidate` hand-off tests; three stale comments and doc lines; `epics.md`'s old caching rule.
- **Deferred:** none.
- **Rejected (with reasons in the Review Triage Log):**
  - partial `found` auto-sharing a private Book (same quality as a new Book saved in that outage)
  - a Google-first outcome held when Finna fails (AC 3's intent)
  - a gone identity on the held-private path failing the copy save
  - the In library Answer's missing picker (false)
  - the `isCandidateId` guard (false)
  - the cover preview by index (false)
  - no toast on a gone candidate (4.16's decision)
  - the `ensureSharedBook` ISBN check (false)
  - `CandidateId`'s module (false)
  - `saveCopy` inside a transaction (false)
  - the TTL anchor
  - empty `coverUrl` (false)
  - the fixed 5 minutes (false)
  - no direct no-source-in-transaction test (false)
  - the `covers.ts` split (false)
  - the `epic-4-context.md` rewrite (false: the owner dismissed acting on `oversized`)

**Follow-up review:** false. Patched this pass: high 0, medium 0, low 3.

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (36 existing warnings in `src/migrations`).
- `npm run test:unit`: 42 files, 671 passed.
- `npm run test:int`: 40 files passed, 1 skipped (`migrationSchema`, already skipped), 401 tests passed, on the worktree's Postgres (port 5434).
- Prettier is clean on every changed file except `tests/int/lookupBook.int.spec.ts`, which was already unformatted at baseline.
- Playwright was not run.

**Residual risks**
- For 5 minutes after a source fails, its gap-fill is missing from Answers and saves for that ISBN, auto-shares included; an admin re-fetch fills the empty fields.
- Not tried by hand in a browser.
