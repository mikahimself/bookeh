---
title: '8.2 [I2] In library, Ordered and On wishlist Answers'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_revision: 'a21f5b55d9a6343ceca16987bff11044afc772c3'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      NFR-1's own measurement -- scan to Answer on Mika's phone over 4G against the deployed app -- is
      unrun for a Book the viewer holds; only the source-side figure is handed to a later story.
    evidence: |-
      The figures recorded under `## Auto Run Result` (234 ms from a source, 163 ms held) come from desktop
      Chromium against the e2e `next dev` server on localhost with the fixture source, so they exercise no
      mobile CPU, no 4G latency, no production build and no real source. Story 8.15's acceptance criteria
      carry the source-side re-measure ("NFR-1 is measured again as Story 8.2 measured it ... within 5 s
      from a source"), but nothing later carries the 2 s held-Book case, so it belongs with the owner's
      next device pass, as Story 7.27's owed checks were run.
    location: >-
      _bmad-output/implementation-artifacts/spec-8-2-i2-in-library-ordered-and-on-wishlist-answers.md:180
    severity: low
---

<intent-contract>

## Intent

**Problem:** The Answer still derives its heading in `scan/answer.ts`: `inLibrary()` claims any Book with a copy, so an ordered-only holding reads "In library", and a Book held only through open wishlist entries reads "Not in library" (Story 7.17's stopgap). Story 8.1 put the rule in `answerFacts(holdings)` and nothing imports it. The Ordered and On wishlist Answers, each ordered copy's Received Link and the "a scan never resets silently" rule are all unbuilt (FR-16, FR-20, NFR-1, UX-DR46).

**Approach:** Mount `answerFacts` in `answerFor()`: one held Answer for every `existing` result whose holdings are not empty, carrying its heading, and one Answer component that renders the facts as lines and the buttons that heading calls for. An ordered copy's line carries a Received Link that calls the existing `receiveCopyAction`. The lookup's `isbn13` comes from the ISBN asked for, which removes the last path that returned to Scan with no error.

## Boundaries & Constraints

**Always:**

- The heading is `answerFacts(mine).heading`, and nothing else derives it. `inLibrary`, `ordered` and `onWishlist` render the held Answer; `notInLibrary` keeps the existing Not in library Answer (the Book, Add to wishlist, Add to library, Back), unchanged.
- Lines, in `Holdings` order, every copy then every entry: an owned copy its location and status ("Tampere · owned", "Owned" with none); a lent copy its location and the lent marker with the borrower; an ordered copy "Ordered" **and its own Received Link**; an open entry "On {list}", and the recipient too when it has one.
- Buttons by heading (EXPERIENCE.md, Answer screens): **In library** — Open book, Add another copy, Back (primary); **Ordered** — Back (primary) alone; **On wishlist** — Add to library (primary), Back.
- Received makes that copy owned at the default location through `receiveCopyAction` (`lib/copies/receiveCopy`, FR-28, AD-18, AD-20), toasts "Saved to {location} · Undo" (or "Saved" with no location, as Book detail does) and re-renders the Answer, so the heading becomes In library. A failure is reported as elsewhere outside the collection (`useReportFailure`).
- Add to library on the On wishlist Answer sends `{ isbn13 }` and so closes the viewer's own open entries for the Book in the save's transaction (`closeEntriesForBook()` in `saveCopy`, already built and tested by Story 7.7); entries for a Person stay open.
- A finished lookup always ends on an Answer, or on Scan with `INVALID_ISBN` or `RATE_LIMITED`: `answerFor()` returns no bare `{ kind: 'scan' }` for any `LookupResult`. The Answer's `isbn13` is the normalised ISBN asked for, not `book.isbn13`, so no `existing` result can fall through; a `source` result whose picked candidate has gone falls to the Not found Answer with that ISBN.
- The In library heading stays bare: FR-20's "In library · {location}" is satisfied by the copy lines, which name every location. EXPERIENCE.md's Answer table shows the bare heading and binds how it looks (CLAUDE.md, Requirements), and with copies at several locations no single location could stand there. This closes Story 8.1's deferral for the Answer; Story 8.8 owns Lookup's rows.
- English and Finnish both gain every new string. The Answer's heading is the full-screen task's title, so `answer.ordered` and `answer.onWishlist` are added beside `answer.inLibrary`.
- Scan to Answer is measured and the figures written under `## Auto Run Result`: for a Book the viewer holds and for one that comes from a source (NFR-1: 2 s and 5 s on the phone over 4G).

**Never:**

- No change to `answerFacts()` itself, to `getHoldings()`, to `lookupBook()`, to `receiveCopy()`, to `saveCopy()` or to any collection; no migration. The Answer is a reader (AD-9) and mounts services that exist.
- No new entry-closing code: the save already does it. No test that restates it.
- Look it up again stays on the In library Answer only (EXPERIENCE.md's table), not on Ordered or On wishlist.
- No Ordered **button** on any Answer (EXPERIENCE.md, Rejected — scanning; FR-28 is reached through Edit, and here through Received on a copy that is already ordered).
- No Open book on the Ordered or On wishlist Answer, no Add to wishlist on a held Answer, and no change to the Not found or Couldn't look it up Answers.
- No `?book=` lookup target: a Book without an ISBN is Story 8.7.
- No `AnswerCopy` / `copyLines()` left behind once the lines come from `AnswerFactLine`; no second projection of a copy.
- No spine edit: the spine states `AnswerHeading`, `AnswerFacts` and `getHoldings()` as the one reader (all unchanged), and binds Received to no surface. `ScanOutcome` is not a spine shape.

## I/O & Edge-Case Matrix

| Scenario                      | Input / State                               | Expected Output / Behavior                                                                | Error Handling                                      |
| ----------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Owned copy                    | `existing`, one owned copy at Tampere       | heading `inLibrary`; line "Tampere · owned"; Open book, Add another copy, Back (primary)  | —                                                   |
| Owned and ordered             | one owned, one ordered copy                 | `inLibrary`; both lines, the ordered one with a Received Link                             | —                                                   |
| Lent copy                     | one owned copy at Mökki, open loan to Antti | `inLibrary`; line "Mökki" with the lent marker and "Lent · Antti"                         | —                                                   |
| Ordered only                  | two ordered copies, no entries              | `ordered`; two "Ordered" lines, each with its own Received Link; Back alone               | —                                                   |
| Ordered and wished            | one ordered copy, one open entry            | `ordered`; copy line then "On {list}"                                                     | —                                                   |
| Own wish only                 | no copies, one own entry on "Toiveet"       | `onWishlist`; line "On Toiveet"; Add to library (primary), Back                           | —                                                   |
| Wish for a Person             | no copies, one entry for Antti              | `onWishlist`; the line names the list and Antti                                           | —                                                   |
| Held, nothing of it           | `existing`, no copies and no entries        | the Not in library Answer, as today                                                       | —                                                   |
| Received pressed              | ordered copy, a default location            | copy owned there, toast "Saved to {location}" with Undo, Answer re-rendered as In library | `NOT_FOUND`/`VALIDATION` reported, Answer unchanged |
| Received, no default location | ordered copy, no locations                  | copy owned with no location, toast "Saved" with Undo                                      | as above                                            |
| Add to library on On wishlist | open own entry, press                       | owned copy saved, own entries closed, held save toast, back to Scan                       | failure as `AddToLibrary` has it today              |
| Any lookup outcome            | each `LookupResult` kind                    | an Answer, or Scan with `INVALID_ISBN` / `RATE_LIMITED`                                   | never a bare `{ kind: 'scan' }`                     |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/answer.ts:56-75` -- `AnswerCopy` and `InLibrary`, `:155-180` `inLibrary()`, `:110-120` `notInLibrary()`'s doc (the two stopgaps this story retires), `:244-262` `CopyText`, `AnswerLine`, `copyLines()`, `:290-346` `ScanOutcome` and `answerFor()`. `existingBook(book, isbn13)` at `:95` already takes the ISBN as a parameter — pass the asked-for one.
- `src/lib/catalogue/answerFacts.ts` -- `answerFacts()`, `AnswerHeading`, `AnswerFactLine` (the whole `CopyLine` / `EntryLine` travels with each line). Read-only; its doc comment names the two call sites retired here.
- `src/lib/books/holdings.ts:14-28` -- `CopyLine` (`copyId`, `status`, `location`, `note`, `loan`), `EntryLine` (`entryId`, `wishlist: Named`, `forPerson: Named | null`). The lines need `copyId` for Received.
- `src/app/(frontend)/isLent.ts` -- `isLent(copy)`, the one lent rule; use it when formatting a copy line.
- `src/app/(frontend)/scan/InLibraryAnswer.tsx` -- the server component to generalise: `AnswerLayout` + `copyLines` + Look it up again + Open book / Add another copy / Back.
- `src/app/(frontend)/scan/AnswerLayout.tsx:30-85` -- takes `lines?: AnswerLine[]` and renders the lent marker; the Received Link hangs off the same `<li>`.
- `src/app/(frontend)/scan/page.tsx:50-92` -- builds the outcome, titles the task `t('answer.${outcome.kind}')` and picks the component; `lists` is read only for the Answers with Add to wishlist.
- `src/app/(frontend)/scan/AnswerLookUpAgain.tsx` -- the pattern for reusing a `(sections)` client component on this surface: thin wrapper, `useReportFailure()`, `router.refresh()`.
- `src/app/(frontend)/(sections)/CopyLine.tsx:188-235` -- `ReceiveCopy`: the toast (`toast.savedTo` / `toast.saved` with `undo`), `settleAction`, `ActionLink`, `t('detail.received')`. It depends on `useAfterAction()` (`ShelfActionsProvider`), which the scan surface does not mount, so the Answer needs its own small client component — not a move of this one.
- `src/app/(frontend)/(sections)/actions.ts:72-85` -- `receiveCopyAction({ copyId })`: `ActionResult<Undoable<{ savedTo: Named | null }>>`. Importable from `scan/` as `(sections)/LookUpAgain` already is.
- `src/lib/copies/receiveCopy.ts` -- the service: `NOT_FOUND` for a foreign or gone copy, `VALIDATION` on a copy that is not ordered, restore orders it again. Read-only.
- `src/app/(frontend)/scan/AddToLibrary.tsx`, `useAddToLibrary.ts` -- Add to library / Add another copy as they are; the On wishlist Answer reuses `<AddToLibrary isbn13 />` with the primary variant.
- `src/lib/catalogue/saveCopy.ts:160-175` + `saveOwnedCopy()` -- `closeEntriesForBook()` in the save's transaction; `tests/int/saveClosesEntries.int.spec.ts` already guards it.
- `messages/en.json`, `messages/fi.json` -- `answer.*` (`inLibrary`, `notInLibrary`, `copy`, `copyAt`, `back`, …), `loans.lentMarker`, `detail.received`, `toast.savedTo` / `toast.saved`.
- `tests/unit/answer.unit.spec.ts:191-257` -- the `inLibrary` describe to replace (its `copy()`, `loan`, `entry`, `book` helpers stay), `:410-475` the `answerFor` describe.
- `tests/e2e/scanToSave.spec.ts:72,85` -- asserts the "In library" heading after a save; must still pass.
- `playwright.config.ts` -- the e2e `webServer` (`bookeh_test`, `BOOKEH_SOURCES=fixture`) the uncommitted walk runs against.
- `_bmad-output/planning-artifacts/epics.md:3473-3492` -- Story 8.2's acceptance criteria; `ux-designs/.../EXPERIENCE.md:231-242` -- the heading table and the per-heading buttons.

## Tasks & Acceptance

**Execution:**

- `src/app/(frontend)/scan/answer.ts` -- replace `AnswerCopy`, `InLibrary`, `inLibrary()` and `copyLines()` with `HeldAnswer` (`AnswerBook & { bookId; heading; lookAgain; facts: AnswerFactLine[] }`), `held(result, isbn13)` built on `answerFacts`, and `factLines(facts, text)` returning `{ text; lent; receive }`; `notInLibrary(result, isbn13)` and `answerFor()` take the asked-for ISBN and return `{ kind: 'held' }` or a stated Answer in every path -- one place states the heading (FR-20, AD-9) and no silent reset.
- `src/app/(frontend)/scan/HeldAnswer.tsx` -- new, replacing `InLibraryAnswer.tsx`: the fact lines and the buttons for the three held headings; Look it up again on `inLibrary` with a private Book only.
- `src/app/(frontend)/scan/AnswerReceive.tsx` -- new client component: the Received Link on an ordered line, `receiveCopyAction`, the "Saved to {location} · Undo" toast, `router.refresh()`, `useReportFailure()` -- FR-28 on the Ordered Answer.
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- render a line's Received Link beside its text -- the Link belongs to the copy's own line.
- `src/app/(frontend)/scan/page.tsx` -- title the task from the held Answer's heading and render `HeldAnswer` -- the heading is the Answer.
- `messages/en.json`, `messages/fi.json` -- add `answer.ordered`, `answer.onWishlist`, `answer.onList` and `answer.onListFor` -- both languages, every string (A15).
- `tests/unit/answer.unit.spec.ts` -- replace the `inLibrary` and `copyLines` describes with `held` and `factLines` over the matrix, and extend `answerFor` with the no-silent-reset criterion -- the story's criteria name the behaviour.
- `tests/e2e/*.walk.spec.ts` -- uncommitted walk of the three held Answers and Received against the e2e server, with the scan-to-Answer timings -- the story adds screens (persistent fact) and NFR-1 asks for figures.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `8-2-i2-...: done` when the story is done.

**Acceptance Criteria:**

- Given a `LookupResult` of every kind, when `answerFor()` runs, then it returns an Answer outcome or `{ kind: 'scan', error }` with `INVALID_ISBN` or `RATE_LIMITED`, and never `{ kind: 'scan' }` with no error.
- Given an `existing` result, when the Answer renders, then its heading is exactly `answerFacts(mine).heading`, and `inLibrary`, `ordered` and `onWishlist` each show the buttons EXPERIENCE.md's table gives that heading, the one primary.
- Given the Ordered Answer, when a copy's Received is pressed, then that copy is owned at the default location, the toast says where it landed with Undo, and the re-rendered Answer reads In library with the copy's new line; the Undo orders it again.
- Given the On wishlist Answer for a Book with an open own entry, when Add to library is pressed, then an owned copy is saved, the viewer's own open entries for that Book are closed, and the held save toast and return to Scan are unchanged.
- Given a Book the viewer holds only through an entry for a Person, when it is scanned, then the Answer reads On wishlist (Epic 7 retrospective decision 2), replacing Story 7.17's Not in library stopgap.
- Given both message catalogues, when the new keys are read, then English and Finnish both have `answer.ordered`, `answer.onWishlist` and the entry-line strings, and no key is left unused.
- Given `npm run test:unit`, `npm run typecheck`, `npm run lint` and `npm run test:e2e`, when they run, then all pass, `scanToSave.spec.ts` included.
- Given the walk, when the three held Answers are opened on the e2e server, then the measured scan-to-Answer figures for a held Book and for a source Answer are written under `## Auto Run Result`, with the phone-over-4G measurement (NFR-1) recorded as an owed check if it cannot be run here.

## Spec Change Log

## Review Triage Log

### 2026-11-01 — Review pass
- verdicts: 30 findings — high 0, medium 9, low 17, false 4, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind: a toast Undo re-orders the copy while the Answer keeps reading In library — real: `useToast` exposes `onUndone` and `RefreshOnUndo` exists, but the scan surface mounted neither (only `/loans` and one wishlist do). Fixed, though not on the Link as the finding proposed: `HeldAnswer` mounts `RefreshOnUndo`, because a successful press refreshes the Answer and unmounts the Link with any listener on it before the Undo lands; the walk caught that first shape failing.
  - `[low]` `[patch]` Blind: `NOT_FOUND` was reported but not re-rendered, leaving a dead Received Link — real and inconsistent with `ShelfRows.tsx:112`, where `afterAction` refreshes on `ok` or `NOT_FOUND`. `AnswerReceive` now refreshes on `NOT_FOUND` too.
  - `[low]` `[patch]` Blind: focus fell to `<body>` when the refresh unmounted the focused Link — real; `ReceiveCopy` moves focus deliberately. A ref now moves focus to the lines `<ul>` (`tabIndex={-1}`, the pattern Book detail, Loans and the wishlist page already use) before the refresh.
  - `[low]` `[reject]` Blind: two ordered copies give two "Received" links with identical accessible names — real but rare (two ordered copies of one edition at once), and Book detail's own copy lines name them the same way; an `aria-label` here alone would diverge from that surface, so a change belongs uniformly or not at all.
  - `[low]` `[reject]` Blind: `AnswerLayout` imports `AnswerReceive`, so every Answer's layout pulls in the `(sections)` actions module — real, and the cost is a client chunk on Answers that never render the Link. The proposed fix puts a `ReactNode` in `AnswerLine`, a data type the unit tests compare with `toEqual`; that trade is worse than the chunk.
  - `[medium]` `[patch]` Blind: no committed test covers the per-heading button sets, which the story's criteria name — confirmed by `grep`: nothing imported `HeldAnswer`. New `tests/unit/heldAnswer.unit.spec.ts` asserts the exact button list per heading and the entry-line text against the real `en.json`.
  - `[false]` `[reject]` Blind: the ordered-and-lent fixture was dropped from the tests — the state is unreachable: `src/lib/loans/loans.ts:69` refuses a lend on any copy whose status is not `owned`, so no ordered copy can carry an open loan. `factLines`' comment states the invariant; a test of an impossible combination guards nothing.
  - `[low]` `[patch]` Blind: both lent fixtures named Antti, so nothing showed each line taking its own copy's borrower — the second lent copy now carries Leena, as the retired test did.
  - `[low]` `[patch]` Blind: the no-silent-reset loop reported only `'scan' !== 'scan'` without naming the failing shape — now an `it.each` over the nine named `LookupResult` shapes, with the Not-found fall-through split out.
  - `[low]` `[reject]` Blind: `deferred: []`, `followup_review_recommended: false` and the missing `sprint-status.yaml` line contradict the result — a finding whose fix edits this build's spec is rejected by rule, and all three are this step's own finalization: `deferred` now carries the owed measurement, `followup_review_recommended` is `true`, and the sprint line flips in the commit. Story 8.15's criteria already carry the source-side re-measure.
  - `[low]` `[reject]` Blind: the Ordered Answer repeats itself — "Ordered" line under an "Ordered" heading, thrice with two such copies. The reading is right, but that is EXPERIENCE.md's own table (the heading plus every other fact as its own line); changing the wording is a UX decision with a same-commit document change, not a defect this story introduced. Raised with the owner instead.
  - `[medium]` `[patch]` Edge: no `onUndone` listener on the scan surface — same defect as the first Blind row; fixed with it.
  - `[low]` `[patch]` Edge: a stale `copyId` (`NOT_FOUND` or `VALIDATION`) leaves a dead Link — patched for `NOT_FOUND`. `VALIDATION` (a copy received elsewhere since) is reported without a refresh, which is what `afterAction` does for every other code; the error toast is the feedback. Recorded as a residual risk rather than diverging from that rule.
  - `[low]` `[patch]` Edge: no focus target after the refresh — same defect as the third Blind row; fixed with it.
  - `[false]` `[reject]` Edge: Add to library on an On wishlist Answer held only by an entry for a Person leaves that entry open — by design, not a defect: `saveCopy` closes the viewer's *own* open entries only (FR-28, AD-18, and `tests/int/saveClosesEntries.int.spec.ts:129` pins it), and the Answer that follows reads In library plus the gift line, which is what FR-20 asks for. The proposed guard would hide Add to library, contradicting EXPERIENCE.md's table.
  - `[low]` `[reject]` Edge: `lookAgain` narrowed to `inLibrary` leaves an ordered-only private Book with no Answer-side Look it up again — EXPERIENCE.md's table attaches that Link to the In library row alone, and the spine (`:126`) names Book detail as its other surface, which an ordered copy's Book reaches through the collection. No path is lost.
  - `[medium]` `[patch]` Edge: the Undo is not followed on the Answer — same defect as the first Blind row; fixed with it.
  - `[medium]` `[patch]` Verification gap: nothing committed renders `HeldAnswer`, so the per-heading button sets regress green (demonstrated by flipping the heading conditions) — grouped with the Blind row; `tests/unit/heldAnswer.unit.spec.ts` closes it.
  - `[medium]` `[patch]` Verification gap: `AnswerLayout`'s new `receive` branch is never entered by its own test, both lines being `receive: null` — `answerLayout.unit.spec.ts` now renders a line with `receive: 3` (mocking `./AnswerReceive`) and asserts the Link on that `<li>` alone.
  - `[medium]` `[patch]` Verification gap: `AnswerReceive` holds the whole Received flow with no test, unlike Book detail's `ReceiveCopy` — new `tests/unit/answerReceive.unit.spec.ts` covers the action's argument, both toast shapes with the receipt, the refresh, the `NOT_FOUND` refresh without a toast, and a reported failure without one.
  - `[low]` `[reject]` Verification gap (other): give the walk its own seed data so it can be committed beside `scanToSave.spec.ts` — out of scope by the project's own rule: Playwright covers scan-to-save and the shop check only, and the shop check is Story 8.10's end-to-end test.
  - `[false]` `[reject]` Verification gap (other): `normaliseIsbn` now runs outside the `try` that converts `INVALID_ISBN` — the bad outcome does not occur: the only production caller is `lookupBook`, which normalises the same text first (`lookupBook.ts:148`) and throws inside the `try`. Only a test stub can reach it, which is why the spec's fixture ISBN was corrected.
  - `[low]` `[reject]` Verification gap (other): no test proves a new catalogue key is used — the layer itself judged it not worth a test, and the parity test covers both catalogues.
  - `[medium]` `[patch]` Intent: the button-set criterion is phrased at the rendered Answer while the committed tests sit at `answer.ts`'s pure functions — grouped with the verification-gap rows and closed by the same new tests.
  - `[medium]` `[patch]` Intent: the Received Link's effect (toast, Undo, re-render) was exercised only in the uncommitted walk — closed by `answerReceive.unit.spec.ts`; the Undo's own path stays walk-proven, which is why a follow-up review is recommended.
  - `[low]` `[defer]` Intent: NFR-1's expectation lives at the phone-over-4G surface while the figures come from localhost — true, and stated in the spec rather than hidden. Story 8.15 carries the source-side re-measure; the held-Book case is now in `deferred` for the owner's next device pass.
  - `[low]` `[reject]` Intent: nothing committed proves the On wishlist button reaches the save that closes entries — the save's behaviour is pinned by `tests/int/saveClosesEntries.int.spec.ts` and the wiring is a one-line `isbn13` pass the walk exercises; a test restating a mocked call sequence is what the project's test rule rejects.
  - `[low]` `[reject]` Intent: the Received Link reaches further than EXPERIENCE.md's table, appearing on an In library Answer's ordered line — deliberate and spec-stated: the same table says every other fact that applies is listed as its own line, and FR-28 is the same action on the same fact. Nothing is lost by it.
  - `[false]` `[reject]` Intent: two incidental changes (the corrected fixture ISBN, the `answerFacts` doc comment) sit outside the intent's text — neither changes behaviour, both are declared in the result, and the ISBN correction is forced by `answerFor` now normalising on every path.
  - `[low]` `[reject]` Intent: the layout coupling and the walk's parallel-run collision — duplicates of the Blind layout row and of the spec's own Residual risks; no new claim to settle.

## Design Notes

**One held Answer, not three.** `inLibrary`, `ordered` and `onWishlist` all show the same Book, the same lines and differ only in their buttons, so `answerFor()` returns one `{ kind: 'held'; answer }` carrying the heading, and `page.tsx` titles the task from `answer.heading`. Three near-identical components would duplicate the layout.

**Lines are formatted on the server.** `HeldAnswer` is a server component, so `factLines()` takes the `AnswerFactLine[]` and the catalogue strings and returns the text; only `copyId` reaches the client, in the Received Link. This keeps `AnswerFactLine`'s whole-row pass-through (a copy's `note`, an entry's ids) off the wire, as `AnswerCopy` did, and keeps `isLent()` the one lent rule.

```ts
export type AnswerLine = { text: string; lent: string | null; receive: number | null }
export type HeldAnswer = AnswerBook & {
  bookId: number
  heading: Exclude<AnswerHeading, 'notInLibrary'>
  lookAgain: boolean
  facts: AnswerFactLine[]
}
```

**The ISBN asked for.** `answerFor()` has the typed text and normalises it already for the Not found and unavailable outcomes; passing it to `held()` and `notInLibrary()` removes their `book.isbn13 === null` guards, which were the only way an `existing` result could end on a bare Scan outcome. `isbn13` is not an overridable field, so the Book found by that ISBN carries it.

**Received, not a move of `ReceiveCopy`.** Book detail's `ReceiveCopy` reports through `useAfterAction()`, which only `ShelfActionsProvider` supplies; the Answer refreshes itself instead, as `AnswerLookUpAgain` does for Look it up again. Both call the same action and raise the same toast.

## Verification

**Commands:**

- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, `answer.unit.spec.ts` included.
- `npm run test:int` -- expected: all pass (no service changed; guards the save's entry-closing).
- `npm run test:e2e` -- expected: `scanToSave.spec.ts` passes with the In library heading unchanged.

**Manual checks (if no CLI):**

- One uncommitted Playwright walk against the e2e server: the three held Answers with their buttons, Received on an ordered copy (toast, Undo, heading becomes In library), Add to library from On wishlist closing the entry, and the scan-to-Answer timings for a held Book and a source Answer.

## Auto Run Result

**Summary.** `answerFacts()` is now mounted: `answerFor()` returns one `{ kind: 'held'; answer }` outcome for every `existing` result the viewer holds anything of, carrying the heading that function states (`inLibrary`, `ordered`, `onWishlist`) and every remaining fact as an `AnswerFactLine`. One server component, `HeldAnswer`, renders the lines and the buttons EXPERIENCE.md's table gives each heading; an ordered copy's line carries its own Received Link (`AnswerReceive`, the existing `receiveCopyAction`), which toasts "Saved to {location} · Undo" and refreshes the Answer, so the heading becomes In library. Both Answers now take the normalised ISBN asked for rather than the found Book's, which removed the last path that returned a bare `{ kind: 'scan' }`: every finished lookup ends on an Answer, or on Scan with `INVALID_ISBN` or `RATE_LIMITED` (NFR-1). Story 7.17's Not in library stopgap for a Book held only through open entries is gone. No service, collection or migration changed.

**Files changed.**

- `src/app/(frontend)/scan/answer.ts` -- `AnswerCopy`, `InLibrary`, `inLibrary()`, `CopyText` and `copyLines()` replaced by `HeldAnswer`, `held(result, isbn13)` (built on `answerFacts`, `lookAgain` only on `inLibrary` with a private Book), `FactText` and `factLines(facts, text)` (`AnswerLine` gains `receive`, an ordered copy's id); `notInLibrary(result, isbn13)` now yields to `answerFacts()`'s precedence and takes the asked-for ISBN; `ScanOutcome`'s `inLibrary` variant became `held`, and `answerFor()` falls to the Not found Answer rather than a bare Scan outcome when a `source` result's picked candidate has gone.
- `src/app/(frontend)/scan/HeldAnswer.tsx` -- new, replacing `InLibraryAnswer.tsx` (deleted): the fact lines and, by heading, Open book + Add another copy + Back (primary) / Back alone / Add to library (primary) + Back, with Look it up again on `inLibrary` and a private Book only.
- `src/app/(frontend)/scan/AnswerReceive.tsx` -- new client component: `receiveCopyAction`, the `toast.savedTo` / `toast.saved` toast with the receipt's Undo, `router.refresh()`, `useReportFailure()`. It refreshes itself rather than using `useAfterAction()`, which the scan surface does not mount. `NOT_FOUND` refreshes too, as the collection's `afterAction` does, so no dead Link is left on a copy that has gone; any other failure is reported and leaves the Answer alone. A ref on the Link moves focus to the lines container before the refresh unmounts it, as `ReceiveCopy` does on Book detail.
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- a line's Received Link renders beside its text in the same `<li>`; the list is `tabIndex={-1}`, focusable in code alone, so that Link can move focus there.
- `src/app/(frontend)/(sections)/RefreshOnUndo.tsx` -- doc comment only: it now names the held Answer among the surfaces it serves, and Received among the undone actions. `HeldAnswer` mounts it, so an undone Received puts the Ordered heading back. It cannot live on `AnswerReceive`: a successful press refreshes the Answer into In library, which unmounts the Link and any listener on it before the Undo lands (seen failing in the walk).
- `src/app/(frontend)/scan/page.tsx` -- the full-screen task's title comes from the held Answer's own heading; `HeldAnswer` replaces `InLibraryAnswer`.
- `messages/en.json`, `messages/fi.json` -- `answer.ordered`, `answer.onWishlist`, `answer.onList`, `answer.onListFor`, all four used.
- `src/lib/catalogue/answerFacts.ts` -- doc comment only: the retired call sites it named no longer exist, so it now names `held()` and `factLines()`.
- `tests/unit/answer.unit.spec.ts` -- the `inLibrary` and `copyLines` describes replaced by `held` and `factLines` over the matrix (heading per holding, the `lookAgain` rule, the ISBN asked for, each ordered copy's own `receive`, an entry for a Person); `notInLibrary` call sites take the ISBN; `answerFor` gains the no-silent-reset criterion over all nine `LookupResult` shapes. The file's fixture ISBN was `9789510396358`, whose check digit is wrong, and `answerFor` now normalises the asked-for text on every path, so it is `9789510396353`.
- `tests/unit/answerLayout.unit.spec.ts` -- the two lent lines carry `receive: null`, and a second case puts a `receive` id on one line of two and asserts the Link renders on that `<li>` alone.
- `tests/unit/heldAnswer.unit.spec.ts` -- new: the buttons present and absent per heading (In library: Open book, Add another copy, Back primary; Ordered: a Received Link per ordered copy then Back alone; On wishlist: Add to library then Back), Look it up again only when the Answer says so, and an entry line's text with and without a recipient, over `messages/en.json`. 5 tests.
- `tests/unit/answerReceive.unit.spec.ts` -- new: the action's argument, the success toast with and without a location including the receipt's token and seconds, the refresh, the `NOT_FOUND` refresh with no toast, and a reported failure that does not refresh. 4 tests.
- `tests/e2e/heldAnswers.walk.spec.ts` -- the walk, uncommitted (gitignored).

**Verification.**

- `npm run typecheck` -- clean.
- `npm run lint` -- 0 errors (60 pre-existing warnings, all in migration files).
- `npm run test:unit` -- 84 files, 1121 tests before the review fixes; **86 files, 1140 tests after them**, all passed.
- `npm run test:int` -- 80 files, 688 tests passed.
- `npm run test:e2e` -- `scanToSave.spec.ts` passed, the In library heading after the save unchanged. Run twice over: once with the walk present, where the two collide on the shared seed, and once with it moved aside (the committed state), which is green. Both states were checked rather than assumed.
- Walk (`npx playwright test heldAnswers`) -- passed: Not in library from the fixture source; Add to wishlist with no list yet; the On wishlist Answer with the line "On Toiveet", Add to library and Back, and no Open book / Add another copy / Add to wishlist / Look it up again; Add to library closing the entry, so the next Answer is In library with "E2E shelf · owned" and no wish line; Open book; the copy marked ordered on the edit screen; the Ordered Answer with Back alone and the line "Ordered" + Received; Received toasting "Saved to E2E shelf" and the Answer re-reading In library; Undo ordering it again, the Answer following that Undo back to Ordered with no reload of its own.

**Review.** One pass, four layers, 30 findings (high 0, medium 9, low 17, false 4). Three patch entries, 8 fixes:

- *The Received Link did not mirror Book detail's post-action handling* (medium): an undone Received left the Answer reading In library -- now `HeldAnswer` mounts `RefreshOnUndo`, since the Link that raised the toast is unmounted by its own refresh before the Undo lands; `NOT_FOUND` refreshes as `afterAction` does, so no dead Link survives; and focus moves to the lines list instead of falling to `<body>`.
- *The screen-surface criteria were unguarded* (medium): nothing committed rendered `HeldAnswer`, `AnswerLayout`'s `receive` branch was never entered by its own test, and `AnswerReceive` held the whole flow untested -- two new spec files and one extended case close all three.
- *Two test weaknesses* (low): both lent fixtures named one borrower, and the no-silent-reset loop named no failing shape.

Deferred 1 (low): NFR-1's phone-over-4G measurement for a held Book, Story 8.15 carrying the source-side re-measure. Rejected 14, each with its refutation in the triage log; the four `false` ones were an unreachable ordered-and-lent state (`loans.ts:69` refuses it), a gift entry left open by design (FR-28, AD-18), `normaliseIsbn` outside the `try` (the only production caller normalises first), and two declared incidental changes. One rejected finding is worth the owner's eye rather than a fix: on the Ordered Answer a locationless copy's line repeats the heading word ("Ordered" under "Ordered"), which is EXPERIENCE.md's own table and so a UX decision, not a defect.

**Follow-up review:** recommended. Patched entries this pass: high 0, medium 2, low 1. The named unverified risk is the Undo path: `RefreshOnUndo` on the held Answer, and the focus move to the lines list, are proven only by the uncommitted walk -- no committed test mounts them, because the listener's whole point is surviving the unmount that a mocked test would not reproduce. Walk the Ordered Answer on the real surface (Received, then Undo, with the keyboard) before the next story mounts it.

**Scan to Answer (NFR-1).** Measured in the walk, from the ISBN submit to the heading on screen, against the e2e `next dev` server on localhost (desktop Chromium, fixture source): **234 ms from a source**, **163 ms for a Book the viewer holds**. Both are far inside the 5 s and 2 s targets, but neither is the measurement NFR-1 asks for: **owed check -- scan to Answer on Mika's phone over 4G, against the deployed app, for a held Book (2 s) and for a Book from the sources (5 s).** Story 8.15 re-measures it once the slowest source is in.

**Residual risks.**

- The walk shares the seeded account and Book with `scanToSave.spec.ts`, so the two collide when Playwright runs them in parallel. Run the walk alone (`npx playwright test heldAnswers`); `npm run test:e2e` is green with the walk absent, which is the committed state.
- `AnswerLayout` now imports `AnswerReceive`, so every Answer's layout pulls in the `(sections)` server actions module. It renders nothing unless a line has a `receive`, and the existing layout and Not in library component tests pass unmocked.
- The In library heading stays bare; FR-20's "In library · {location}" is carried by the copy lines, which name every location. Story 8.8 owns the same choice for Lookup's rows.
- A copy received elsewhere since the Answer rendered fails with `VALIDATION`, which is reported without a refresh, so that line keeps its Received Link until the next render. This matches `afterAction`, which refreshes on `ok` and `NOT_FOUND` alone; the error toast is the feedback. Diverging here for one surface was judged worse than the stale Link.
- The Undo refresh and the focus move have no committed test (see the follow-up recommendation); the walk is their only evidence.

## Owner verification — 2026-11-04

Mika confirms the deployed app met the scan-to-Answer targets on mobile over **4G**. Held Book: **1.2 s** (target ≤2 s); source result: **3.2 s** (target ≤5 s). This closes the phone/4G timing check recorded as owed above. Exact device/browser, deployed revision, ISBNs and cache state were not supplied. Source: Mika’s retrospective reply on 2026-11-04. Historical verification notes are retained.
