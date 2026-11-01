---
title: '7.26 [K32] Spec reconciliation'
type: 'chore'
created: '2026-11-01'
status: 'done'
baseline_revision: '0b463b9306b0a55c3211f08409a54f500a98cba1'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
  - '{project-root}/_bmad-output/implementation-artifacts/deferred-triage-2026-10-30.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The spine, the PRD and the UX documents say things the code no longer does (AD-9's source contract, AD-17's signature, AD-18's merge writers, the one-way import table, FR-47's cover, two UX rows). `/loans` has no check that a toast Undo refreshes it, and `deferred-work.md` and two epic contexts still list closed work.

**Approach:** Edit each document to say what the code does, using the code as the authority. Add one `/loans` case modelled on `wishlistPage`'s. Reduce `deferred-work.md` to the open entries, each naming its story or its acceptance, and recompile the two epic contexts.

## Boundaries & Constraints

**Always:** The documents follow the code; where a statement is already true, leave it. Spine edits keep the surrounding style (one dense bullet per rule). The ledger for closed deferrals is `deferred-triage-2026-10-30.md`, so spec files are not touched. The new test is the only change under `src`-adjacent code.

**Never:** No change under `src`. No other new test. No edit to a spec file, to `epics.md`, or to `deferred-triage-2026-10-30.md`. No new spine rule beyond the criteria's list. Do not build Epic 8 or 9 work, and do not edit `compile-epic-context.md`.

</intent-contract>

## Code Map

- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- `:62` Between-services import line (add `catalogue` → `tags`); `:64` or `:66` where `loans/dates` is named (note its `i18n/locale` import, `dates.ts:1`); AD-9 `:172-173` (source returns records, or `undefined` on failure, `source.ts` doc comment; candidates from the first source with records); AD-16 `:242` (seed takes a bare `Payload`, `seedFirstUser(payload, env)`; a service's `owner` is overwritten by `ownerField()`'s hook; the failed-COMMIT note, triage C3); AD-17 `:246` (`ownedRelation(slug, { name, required?, hasMany? })`, `src/fields/relation.ts:6,66`); AD-18 `:254` (`mergePerson` moves `loans.person` and `wishlist-entries.forPerson`, `people.ts:129`; `setEntryRecipient` returns `number | null`, `entries.ts:229`); Shared shapes `:375-543` (add `ClosedEntry = { copyId: number | null; savedTo: LocationOption | null }`, `entries.ts:108`, and the return type of `setEntryRecipient`); Navigation and history row `:307` ("back, then replace" close and `useCloseDetail()(to)`, `detailClose.ts`); Tests row `:319` (`*.unit.spec.ts` holds component tests too).
- `_bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/prd.md:198` -- FR-47: a private Book's cover is shared in place on promote and merge (AD-5 `:121`).
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md` -- `:198` On wishlists row; `:277` Lend row. Code: `BookDetail.tsx:208-214` shows `{list} · for {person}` or `{list}`; `LendPicker.tsx:175,204` shows six rows, then "Find a person…" only when `people.length > ROWS`.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md:396` -- Cover tile row; `CoverTile.tsx:69-78` has the lent marker before the title and "Lent · {person}" after the authors.
- `tests/unit/loansPage.unit.spec.ts` -- `useToast` mock at `:98-103` has `onUndone: () => () => {}` and `router` at `:22`; `renderPage()` at `:143`. Add the `onUndone` spy as `wishlistPage.unit.spec.ts:31,105` does; model the case on its `:453-459`. `/loans/page.tsx:126` mounts `RefreshOnUndo`.
- `vitest.unit.setup.ts:2` -- comment names `collectionPage.unit.spec.ts`; the overlay tests now sit in `collectionSelection`, `collectionMove`, `bookDetail` and `bookDetailCopyLine`.
- `_bmad-output/implementation-artifacts/deferred-work.md` -- 32 entries; verdicts in `deferred-triage-2026-10-30.md`.
- `_bmad-output/implementation-artifacts/epic-6-context.md`, `epic-7-context.md` -- recompile; format in `_bmad/render/bmad-build-auto/bookeh-28dbec2c9391/db6dae48175904ce41aa/compile-epic-context.md`.

## Tasks & Acceptance

**Execution:**
- `ARCHITECTURE-SPINE.md` -- edit the rows and ADs listed in the Code Map. Check each statement against the file named there before writing it.
- `prd.md` -- FR-47 says a private Book's cover is shared in place on promote and merge.
- `EXPERIENCE.md`, `DESIGN.md` -- the two rows and the Cover tile row.
- `tests/unit/loansPage.unit.spec.ts` -- one case, 'refreshes after a toast Undo', beside the existing page cases.
- `vitest.unit.setup.ts` -- the comment names the specs that hold the overlay tests.
- `deferred-work.md` -- see Design Notes.
- `epic-6-context.md`, `epic-7-context.md` -- recompile as done epics: no story reads as remaining, Epic 7's foreign-key open item is gone, and the cross-story note about 7.24 to 7.27 reflects what is built.

**Acceptance Criteria:**
- Given the spine, when it is searched, then AD-9, AD-16, AD-17, AD-18, the import lines, Shared shapes, the Navigation and history row and the Tests row say what epics.md Story 7.26 lists, and each statement matches the code at the file named in the Code Map.
- Given `prd.md`, when FR-47 is read, then it says the cover of a private Book is shared in place on promote and merge.
- Given EXPERIENCE.md and DESIGN.md, when read, then On wishlists says "{list} · for {person}" or "{list}" alone for my own entries, Lend says "Find a person…" appears past six People, and the Cover tile row carries "Lent · {person}".
- Given `loansPage.unit.spec.ts`, when `RefreshOnUndo` is removed from `loans/page.tsx`, then the new case fails, and with it restored all unit tests pass (1089 cases, one more than 7.25's 1088).
- Given `deferred-work.md`, when read, then it holds only open entries, each with a `decided:` line naming its story or its acceptance, and no closed or moot entry.
- Given the two epic contexts, when read, then none says a story remains and none lists the foreign-key open item.

## Spec Change Log

## Review Triage Log

### 2026-11-01 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 11, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: the spec is committed `in-progress` with empty logs — Finalize sets `done` and fills the logs in the same commit.
  - `[false]` `[reject]` Blind: the new case may take a stale listener or leave `router.refresh` uncleared — `afterEach` runs `vi.clearAllMocks()` (`loansPage.unit.spec.ts:224`); the mutation was run and the case failed.
  - `[false]` `[reject]` Blind: the 1.16 sign-in entry has no `decided:` line — it has one (Epic 1 retrospective).
  - `[false]` `[reject]` Blind: a `decided:` line calls the `overrideAccess` lint-ban a test-only gap — no such entry is in the file; the line belongs to the ICU assertion entry.
  - `[low]` `[reject]` Blind: the 1.3 entry keeps "take it with Story 2.2" beside "Accepted earlier" — the summary is the original text, and `decided:` overrides it.
  - `[low]` `[reject]` Blind: deleting entries loses the Epic 1 retrospective decisions — the triage file is the ledger and the spec files stay as they are (criterion).
  - `[false]` `[reject]` Blind: epic-6-context's `returnedLoans(ctx, book?)` is not in the spine — the spine's `ReturnedLoan` entry already documents `returnedLoans(ctx, book?)`.
  - `[low]` `[patch]` Blind: DESIGN's Lent marker row contradicts the Cover tile row — Lent marker row reworded to say the tile's square sits before the title and the text after the authors.
  - `[low]` `[reject]` Blind: FR-47 says nothing of a merge into a shared Book with a cover, and cites an AD — the criterion's wording; AD-5 holds the detail, and the PRD cites ADs elsewhere.
  - `[low]` `[reject]` Blind: the `setEntryRecipient` return sits in a `//` comment — the criterion asks for the return type; the section already uses trailing comments for signatures.
  - `[low]` `[patch]` Blind: epic-7-context's "7.1–7.26 are built, the clean-up in order from 7.16" is garbled — reworded. The "my own entries" and hand-edited-header points are rejected: the criterion's wording, and the criterion asks for a recompile.
  - `[low]` `[reject]` Blind: AD-16 bundles the COMMIT limitation and the seed signature — the criteria place both in AD-16.
  - `[low]` `[reject]` Edge: `.at(-1)` picks the last `onUndone` listener — `/loans` has one subscriber, and the mutation fails the case.
  - `[false]` `[reject]` Edge: the mutation claim has no evidence in the diff — the implementer ran it and the case failed with `RefreshOnUndo` removed.
  - `[low]` `[reject]` Edge: some kept entries say only "accepted earlier" — each names the triage's acceptance reason, which is what the criterion asks.
  - `[low]` `[reject]` Edge: AD-16's `owner` overwrite does not state the update path — the criterion asks for the create-time overwrite only.
  - `[low]` `[reject]` Verification: `.at(-1)` assumes `RefreshOnUndo` is the last subscriber — same as the Edge row.

## Design Notes

`deferred-work.md` verdicts, by the triage: entries that went into Stories 7.16 to 7.22 (A1, A2, A3, A7, A9, A15, A16, A21, A22), the entry for this story (A18), and the closed or moot ones (A4, A5, A6, A11, A12, A13, A14, A17, A19, A24, A27, A30) are removed. Kept, each with `decided:`: A8, A10, A20, A23, A26, A28, A29 (accepted earlier, reason from the triage), A25 and A31 (Story 7.27), A32 (a feature, needs a PRD change), and the 7.16 follow-up entry (no story: the owner's call on the unattended rule). The file's opening line says the triage is the ledger for the rest.

## Verification

**Commands:**
- `npx vitest run --config ./vitest.config.mts --project unit` -- expected: all pass, 1089 cases.
- `npm run lint` and `npm run typecheck` -- expected: no errors.
- Mutation: delete `<RefreshOnUndo />` in `loans/page.tsx`, run `loansPage.unit.spec.ts` -- expected: the new case fails; restore it.
- `git diff --stat -- src` -- expected: nothing.

## Auto Run Result

Summary: the spine, PRD FR-47, EXPERIENCE.md and DESIGN.md now say what the code does; `/loans` has a test that a toast Undo refreshes it; `deferred-work.md` holds the 11 open entries, each with a `decided:` line; the Epic 6 and 7 contexts are recompiled.

Files: `ARCHITECTURE-SPINE.md` (AD-9, AD-16, AD-17, AD-18, import lines, Shared shapes, Navigation row, Tests row), `prd.md` (FR-47), `EXPERIENCE.md` (On wishlists, Lend), `DESIGN.md` (Cover tile, Lent marker), `tests/unit/loansPage.unit.spec.ts` (one case), `vitest.unit.setup.ts` (comment), `deferred-work.md`, `epic-6-context.md`, `epic-7-context.md`.

Review: 2 low patches, 0 deferred, 15 rejected with reasons in the Triage Log. Follow-up review: not recommended (`false`).

Verification: unit lane 83 files, 1089 tests passing (1088 plus the new case); typecheck clean; lint 0 errors (60 warnings); `git diff --stat -- src` empty; mutation (`RefreshOnUndo` removed) fails the new case. No walk: no screen changed.

Residual risks: the `catalogue` to `tags` edge is in the spine but not in the ESLint zones, which Story 9.2 adds with `editBook()`. Files shared with parallel stories: none.
