---
title: 'Story 3.53: [C12] Pick the edition'
type: 'feature'
created: '2026-10-20'
status: 'done'
baseline_revision: '486b3f6531add0ec8f38f8191c76ac889b4b5b3e'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      A save with no cached outcome asks the sources twice, once in downloadCover() and once in
      ensureSharedBook(), so the cover and the Book values can come from two different candidate lists.
    evidence: |-
      lookupSources caches only when no source failed (lookup.ts remember guard). saveCopy calls
      downloadCover (its own lookupSources) before the transaction and ensureSharedBook (another
      lookupSources) inside it. This predates 3.53 for candidate 0; the pick index makes a mismatch
      pick a different edition. Fix: resolve the outcome once in save() and pass the candidate to both.
    location: >-
      src/lib/catalogue/saveCopy.ts:110-114
    severity: low
  - summary: >-
      The page's &pick= parsing through lookupBook to the rendered Answer, and the editions Link's
      render condition in NotInLibraryAnswer, have no end-to-end test.
    evidence: |-
      Unit tests cover notInLibrary's editions/pick and EditionPicker's replace URL; no test renders
      scan/page.tsx or NotInLibraryAnswer. Server-component wiring belongs to the scan-to-save
      Playwright flow (story 3.52, Tests convention): add a two-edition pick step there.
    location: >-
      src/app/(frontend)/scan/page.tsx, src/app/(frontend)/scan/NotInLibraryAnswer.tsx
    severity: medium
---

<intent-contract>

## Intent

**Problem:** When Finna holds several records for one ISBN (a paperback and a hardcover, several printings), the Answer silently shows the best one and a save always stores `candidates[0]`, so the Book can get the wrong edition's details (D-7, PRD FR-11 bullet on several records).

**Approach:** The Not in library Answer for a `source` result with more than one candidate shows "{n} editions found" as a Link under the Book. It opens a Picker of the candidates, and picking one replaces the address with `&pick=<n>`. The Answer and Add to library then use that candidate: the save sends `{ isbn13, pick }` and the server takes the values from its held candidates.

## Boundaries & Constraints

**Always:**
- The client sends only the index. Book values, cover URL and `rawMetadata` come from `lookupSources()` on the server (cache, or the sources again on a miss), as in AD-5/AD-9.
- One rule for the index everywhere (lookup, cover download, Book creation, preview): an integer in range picks that candidate. Anything else, or no `pick` at all, picks the best (index 0).
- The Book keeps the scanned ISBN: `isbn13` is the normalised ISBN asked for, never one from a candidate's record.
- Nothing about editions shows with one candidate, or for an `existing` result (shared Book, or the viewer's private Book).
- Picking replaces the history entry, so Back from the Answer still returns to Scan.
- Strings go in `messages/en.json` and `fi.json`. Overlays go through the `components/ui/Picker` wrapper. Read the bundled Next.js docs (`node_modules/next/dist/docs/`) before using router or search-param APIs.

**Never:**
- No `pick` on a held-Book save (auto-share in `prepareShare`/`settleHeldBook`, or the merge) and none on a manual save. Those keep the best candidate.
- No browser lookup request and no client-side source call. The picker's data comes from the server-rendered Answer.
- No change to `SourcesOutcome`, `mergeResults`, the adapters or the candidate order.
- No wishlist button. Epic 7 adds Add to wishlist with the same `{ isbn13, pick }`.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Two editions | `/scan?isbn=X`, Finna has 2 matching records | Answer shows candidate 0, "2 editions found" Link under the source/new-record notes | — |
| Pick | Picker row 1 tapped | `router.replace('/scan?isbn=<isbn13>&pick=1')`; the Answer shows candidate 1's title/edition line, its preview cover (`/data/cover/X?pick=1`) and its New author/series notes; candidate 1's row carries the marker | — |
| Save picked | Add to library on `?pick=1` | `saveCopyAction({ requestId, isbn13, pick: 1 })` → shared Book with candidate 1's values, candidate 1's cover (or none), `isbn13` = X | — |
| Out of range | `?pick=7`, `?pick=-1`, `?pick=abc`, `?pick=1.5` | Answer and save use candidate 0 | No error |
| Cache miss before save | Lookup cache expired | `lookupSources` asks again; the pick indexes the fresh candidates; out of range → best | — |
| Shared Book appears before save | Another save created the shared Book | Copy goes to that Book; `pick` ignored | — |
| One candidate / existing Book | — | No Link, no picker; the save sends no `pick` | — |
| Bad input | `pick` not a non-negative integer (string, -1, 1.5) | `saveCopyAction` → `VALIDATION`, surfaced as `SAVE_FAILED` like other bad input | Logged warning, as today |

</intent-contract>

## Code Map

- `src/lib/catalogue/lookupBook.ts` -- already takes `pick` and returns `candidates` plus the clamped `pick`, with matches for the picked one (tested in `tests/int/lookupBook.int.spec.ts:166-202, 286`). Private `pickIndex` (58-60) is the one index rule: move it into a new `src/lib/catalogue/pick.ts` and import it from there. `covers.ts` must not import `lookupBook.ts`, because `lookupBook` → `coverPreview` → `covers` would be a cycle. Line 115 records only the picked cover: change it to record every candidate's `coverUrl`.
- `src/lib/catalogue/coverPreview.ts` -- `recordCoverPreview(ctx, isbn13, url)` and `fetchCoverPreview(ctx, isbn13, policy)`. The entry becomes `{ urls: (string | undefined)[]; expiresAt }`. `recordCoverPreview` takes the list and forgets the entry when no URL is defined. `fetchCoverPreview` takes a `pick` (index, default 0), and with no URL at that index it returns `undefined` without a request.
- `src/app/(frontend)/data/cover/[isbn13]/route.ts` -- read `?pick` from `request.url`. Missing → 0. A value that is not a non-negative integer → 404.
- `src/lib/books/coverUrl.ts` -- `coverUrl({ isbn13, pick? })` appends `?pick=<n>` when `pick` is given. `tests/int/effectiveBook.int.spec.ts:220` pins the no-pick string, so keep it unchanged.
- `src/lib/catalogue/covers.ts` -- `downloadCover(ctx, isbn13, policy = coverPolicy, pick?: number)` at 168-198. Line 195 uses `candidates[0]`: use `candidates[pickIndex(pick, length)]`. Tests pass `policy` third (`tests/int/covers.int.spec.ts`), so `pick` goes last.
- `src/lib/catalogue/ensureSharedBook.ts` -- `ensureSharedBook(ctx, isbn13, cover?, pick?)`. Line 75 `best = candidates[0]` becomes the picked candidate. `rawMetadata` (114) becomes `{ ...outcome.raw, coverUrl: picked.coverUrl ?? null }` (see Design Notes). `mapSubjectsToGenres(tx, outcome.raw)` is unchanged. Update the doc comment ("the best candidate is always used").
- `src/lib/catalogue/saveCopy.ts` -- `SaveInput.target` becomes `{ isbn13: string; pick?: number } | { manual }`. Pass `pick` to `downloadCover` (106) and `ensureSharedBook` (110) only. The held-Book branch (115-121) ignores it. Drop "`pick` with 3.53" from the header comment (17) and document `pick` in the doc comment.
- `src/app/(frontend)/scan/actions.ts` -- `saveCopyAction` and `isSaveInput`: accept an optional `pick` that is a non-negative integer number (`Number.isInteger(pick) && pick >= 0`) and pass it in the target.
- `src/app/(frontend)/scan/answer.ts` -- `AnswerBook` gains `pick: number | undefined` (the candidate a save sends; `undefined` for an existing Book) and `editions: AnswerEdition[]`. `AnswerEdition = { binding, year, publisher, pages, cover }`, each `null` when missing, in candidate order. It is `[]` unless the `source` result has 2+ candidates. `notInLibrary`'s source branch sets the cover to `coverUrl({ isbn13, pick })` for the shown candidate, and to `coverUrl({ isbn13, pick: i })` for edition `i` when `hasCover`. `existingBook` sets `pick: undefined, editions: []`. Add a pure `editionLine(edition, text)`: the parts that exist (binding, year, publisher, pages text) joined " · ", or `text.unnamed(index + 1)` when none exist.
- `src/app/(frontend)/scan/page.tsx` -- read `pick` from `searchParams` (first value if repeated). `/^\d+$/` → `Number`, else `undefined`. Pass it to `lookupBook(ctx, { isbn: text, pick })`. `lookupBook` does the clamping.
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- add an optional `editions?: ReactNode` slot, rendered right after the notes block and before the buttons. "Under the Book" is the order used in EXPERIENCE.md, Answer.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx` -- when `answer.editions.length > 1`, pass an `<EditionPicker>` in the slot. Pass `pick={answer.pick}` to `AddToLibrary`.
- `src/app/(frontend)/scan/EditionPicker.tsx` (new, client) -- `ActionLink` "{n} editions found" plus `Picker<number>`. Options are `{ value: i, label }`, where the label is a 32px-wide `Cover` (DESIGN.md Rows m, 32 × 48) beside the `editionLine` text. The server computes the line strings and passes them as props. `value` = the current pick. `onChoose(i)` → `router.replace(\`/scan?isbn=${encodeURIComponent(isbn13)}&pick=${i}\`)` inside `startTransition`. Picker title: `answer.editions`.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- optional `pick?: number` prop. The input is `{ requestId, isbn13, ...(pick !== undefined && { pick }) }`. The uncommitted Story 3.49 on main moves this body into `useAddToLibrary.ts`. Keep this change to the prop and the input line so the merge stays small.
- `messages/en.json`, `messages/fi.json` -- `answer.editionsFound` ("{n} editions found" / "{n} painosta löytyi"), `answer.editions` ("Editions" / "Painokset"), `answer.unnamedEdition` ("Edition {n}" / "Painos {n}").
- `src/app/(frontend)/components/ui/Picker.tsx`, `components/Link.tsx` (`ActionLink`), `components/Cover.tsx` -- read-only reuse. Picker has no caller yet, so this story is its first.
- `tests/fixtures/finna/9780007466061.json` -- two matching records. Record 0: `isbns` "9780007466061 nidottu", cover `/Cover/Show?...kirkes.399381`, "690 sivua : karttoja". Record 1: "978-0-00-746606-1", no image, "690 sivua : kuvitettu, karttoja". The adapter sorts covered records first, so candidate 0 has the cover and the binding "nidottu", and candidate 1 has neither. `tests/unit/finna.unit.spec.ts:9-40` shows the fixture loading and the `fetch` stub.
- `tests/int/coverPreview.int.spec.ts`, `tests/int/saveCopy.int.spec.ts`, `tests/int/saveCopyAction.int.spec.ts`, `tests/unit/answer.unit.spec.ts` -- existing suites to extend. They fake `lookupSources` with `vi.mock('@/lib/metadata/lookup')`.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/pick.ts` -- new: `pickIndex(pick, length)` moved from `lookupBook.ts` -- one rule for every caller.
- `src/lib/catalogue/lookupBook.ts`, `coverPreview.ts`, `src/lib/books/coverUrl.ts`, `src/app/(frontend)/data/cover/[isbn13]/route.ts` -- previews per candidate, as in the Code Map -- the picker shows every candidate's cover.
- `src/lib/catalogue/covers.ts`, `ensureSharedBook.ts`, `saveCopy.ts`, `src/app/(frontend)/scan/actions.ts` -- `pick` through the save path, as in the Code Map -- the server builds the picked candidate.
- `src/app/(frontend)/scan/answer.ts`, `page.tsx`, `AnswerLayout.tsx`, `NotInLibraryAnswer.tsx`, `EditionPicker.tsx`, `AddToLibrary.tsx`, `messages/*.json` -- the Answer, the Link and the Picker, as in the Code Map.
- `tests/int/pickEdition.int.spec.ts` -- new, real Finna adapter and `lookupSources`, no `vi.mock` of lookup. Stub `fetch` so Finna URLs return `9780007466061.json` with both ISBN spellings (`9780007466061`, `978-0-00-746606-1`) rewritten to a `randomIsbn()`. Google returns `{ "totalItems": 0 }`. Covers 404, so no host is reached. Cases: `lookupBook` gives 2 candidates, best with `binding: 'nidottu'` and a cover. `saveCopy` with `pick: 1` creates a shared Book with the random ISBN, `pages: 690`, no cover, and `rawMetadata.coverUrl === null`. `pick: 5` saves candidate 0's values.
- `tests/int/coverPreview.int.spec.ts` -- adapt to the list record. Add: `?pick=1` serves candidate 1's cover, and an index with no cover is `undefined` with no request.
- `tests/int/saveCopyAction.int.spec.ts` -- a non-integer or negative `pick` reads `SAVE_FAILED` and writes nothing.
- `tests/unit/answer.unit.spec.ts` -- `notInLibrary` gives `editions` for 2+ candidates (each one's parts and pick-indexed cover, `null` without `hasCover`), `[]` for one candidate and for `existing`, and `pick` = the result's pick. `editionLine` joins the parts that exist and uses the unnamed text when none do.
- `tests/unit/editionPicker.unit.spec.ts` -- new: tapping row 1 in the open picker calls `router.replace` with `/scan?isbn=<isbn13>&pick=1`. Tapping the chosen row does not navigate. Mock `next/navigation` as `addToLibrary.unit.spec.ts` does.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.53 `done` when finished.

**Acceptance Criteria:**
- Given a `source` result with more than one candidate, when the Answer renders, then "{n} editions found" shows under the Book as a Link with the best candidate preselected, and the Link opens a picker listing each candidate's binding, year, publisher, pages and cover.
- Given the picker, when a candidate is picked, then the Answer re-renders at `?pick=<n>` in place of the current history entry, with that candidate's details, cover preview and new-record notes, and Back still returns to Scan.
- Given an Answer at `?pick=<n>`, when Add to library is tapped, then the shared Book is created from the server's held candidate `n` (re-fetched on a cache miss), with its cover, and keeps the scanned ISBN.
- Given one candidate, or an existing shared or private Book, when the Answer renders, then nothing about editions is shown.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 30 findings — high 0, medium 5, low 19, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: `rawMetadata` does not record which candidate was picked, so a parser re-run rebuilds candidate 0. No re-parse exists yet, and re-fetch only fills empty fields. Recording the pick means adding a field to the spine's `RawMetadata`, which is more than a direct correction for a case nobody meets today.
  - `[low]` `[reject]` Blind: the pick is an index across separate `lookupSources()` calls with no identity check. A different list needs an uncached outcome (a source failed at lookup) and then a changed answer at save. The intent says "re-running the lookup on a cache miss" by index. A stable key would add public surface for a rare case.
  - `[low]` `[patch]` Blind: picking gives no pending feedback, and the old Answer stays live during `router.replace`. Patched: `EditionPicker` shows the progress line while its transition is pending (EXPERIENCE.md: the progress line runs during lookup).
  - `[low]` `[reject]` Blind: each pick re-render counts against `LOOKUP_LIMIT`. That is 30 per minute per user, which picking editions by hand does not reach in everyday use. Exempting picks would add a branch to the limiter.
  - `[low]` `[patch]` Blind: two candidates with identical parts get identical picker rows. Patched: a line repeated across rows gets its edition number appended.
  - `[low]` `[reject]` Blind: binding is shown as Finna gives it ("nidottu"). The adapter's existing output, which is display only. The catalogue is mostly Finnish books for a Finnish reader, and a translation table would be new surface.
  - `[low]` `[patch]` Blind: every row's cover placeholder shows the shown candidate's title. Patched: `AnswerEdition` carries each candidate's own title, used for its row's `Cover`.
  - `[low]` `[reject]` Blind: callers pass a positional `undefined` to skip `policy`. Developer-only. The options-object refactor touches every test call site for a misordering nobody has hit.
  - `[low]` `[reject]` Blind (with Intent A): pick text is parsed in three places with three outcomes (fallback, 404, VALIDATION). Each matches its matrix row. The Answer falls back. The cover route and the action only see hand-crafted values, because the server renders every URL and the client sends the clamped pick.
  - `[low]` `[reject]` Blind: `AnswerBook` allows `pick: 0` with `editions: []`. A discriminated union adds type complexity to remove one harmless guard. The `answerLines` fixture state is never rendered.
  - `[low]` `[patch]` Blind: edited doc comments not reflowed (`answer.ts`, `actions.ts`, `covers.ts`). Patched: reflowed.
  - `[false]` `[reject]` Blind: sprint status `done` while the spec is `in-review`. Finalization sets the spec to `done` and commits both together.
  - `[low]` `[reject]` Edge (same root as the index row): a re-fetched list in another order or length at save. Same evidence and route.
  - `[low]` `[defer]` Edge: `downloadCover()` and `ensureSharedBook()` each call `lookupSources()`, so without a cached outcome the cover and the values can come from two lists. The double lookup predates this story (candidate 0 had the same gap). Deferred.
  - `[false]` `[reject]` Edge: an uncached outcome makes each pick overwrite the preview record, so row covers could belong to other candidates. The rows and the record come from the same `lookupBook` call that renders the new Answer, so they always agree.
  - `[false]` `[reject]` Edge: after a lost save answer, a new pick reuses the `requestId` and returns the old edition. If that save succeeded, a shared Book now exists, so the re-rendered Answer is In library (a different `AddToLibrary` instance) and `pick` is ignored. If it failed, `oncePerRequest` remembers nothing and the retry runs with the new pick.
  - `[low]` `[patch]` Edge (same root as the pending row): Add tapped while the pick's re-render is pending saves the previous pick. Patched by the same progress line. The tap saves the edition still on screen.
  - `[low]` `[reject]` Edge: a pick chosen while a save is in flight. Rare, and guarding it needs state shared between `AddToLibrary` and `EditionPicker`.
  - `[low]` `[patch]` Edge (same root as the identical-rows row): identical lines. Patched by the same numbering.
  - `[low]` `[reject]` Edge claim (same root as the index row): "held candidate n" is matched by position only. The intent specifies re-running the lookup and indexing on a miss.
  - `[medium]` `[patch]` Verification gap: neither `AddToLibrary` nor `saveCopyAction` is tested to forward `pick`. Patched: an `AddToLibrary` unit case with `pick: 1`, and an action-level case on a fresh ISBN answered from the Finna fixture that creates the Book from candidate 1.
  - `[medium]` `[patch]` Verification gap: `downloadCover` with `pick` is untested (pickEdition's 404 covers hide it). Patched: a `covers.int.spec.ts` case storing candidate 1's image.
  - `[medium]` `[defer]` Verification gap: the page's `&pick=` parsing to the rendered Answer, and the picker Link's condition, are not exercised end to end. Server-component wiring belongs to the scan-to-save Playwright story 3.52 (Tests convention). Deferred there.
  - `[low]` `[reject]` Verification gap, other: stored `rawMetadata` keeps the best record's subjects, and the comment says only the cover differs. For Finna-first outcomes that holds: Finna emits no subjects, and the other sources contribute their best record for every candidate. Only a Google-first outcome with several Google records differs, and `mapSubjectsToGenres` is a stub until Epic 9.
  - `[false]` `[reject]` Intent A: out-of-range semantics split by surface. Every user-reachable surface falls back as the matrix says. The 404 and `VALIDATION` rows cover crafted input only (see the parsing row).
  - `[medium]` `[defer]` Intent (same root as the page-level gap): the page → Answer → Link path is not tested. Deferred to 3.52 with the page-level gap.
  - `[medium]` `[patch]` Intent (same root as the forwarding gap): the client sending `pick` is untested. Patched by the same tests.
  - `[low]` `[reject]` Intent: the fixture's two records differ only in cover and binding, so the save tests separate picks only through `rawMetadata.coverUrl`. The AC names the fixtures, and that difference still separates `pick: 1` from the fallback. A scalar-following test would restate the same index lookup.
  - `[false]` `[reject]` Intent C: `rawMetadata` follows the best candidate except `coverUrl`. Recorded deliberately in Design Notes. Every Book value follows the pick, as the intent asks.
  - `[false]` `[reject]` Intent D: the Link sits after the notes, not directly under the title. EXPERIENCE.md lists "From {source}", the new-record notes, then "{n} editions found" under the Book, so this matches.

## Design Notes

**`rawMetadata` for a pick.** `SourcesOutcome.raw` is built from the best candidate: complete source responses, each source's best-record subjects, and the merged cover URL. The complete responses already contain every record. Finna emits no `subjects`, so the only part that differs per Finna pick is the cover URL. The Book stores `{ ...outcome.raw, coverUrl: picked.coverUrl ?? null }`, so the record names the cover that was saved. Exact per-candidate raw would change the spine's `SourcesOutcome`, which this story does not do.

**Previews per candidate, not per pick.** `lookupBook` records every candidate's URL at once, so the picker can show all the covers without another lookup, and switching picks needs no new record. The route still takes nothing but an ISBN and an index, and the URL never comes from the client (AD-10, AD-14).

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass. `scanScreen.unit.spec.ts` can time out under load; re-run it alone before treating it as a failure.
- `npm run test:int` -- expected: all pass (worktree database on port 5434)

## Auto Run Result

**Summary.** When Finna holds several records for an ISBN, the Not in library Answer shows "{n} editions found" under the Book, with the best one preselected. The link opens the Picker (bottom sheet on the phone, dialog on wide screens). Each row is the candidate's cover beside "binding · year · publisher · pages". Picking replaces the address with `&pick=<n>`, and the progress line runs until the new Answer renders. Add to library sends `{ isbn13, pick }`. The server builds the shared Book, its cover and `rawMetadata.coverUrl` from its own held candidate `pick` (re-fetched on a cache miss), and the Book keeps the scanned ISBN. Out of range or no `pick` means the best candidate. With one candidate, or for an existing Book, nothing about editions shows and no `pick` is sent.

**Files changed**
- `src/lib/catalogue/pick.ts` -- new: `pickIndex`, the one index rule (moved from `lookupBook.ts`).
- `src/lib/catalogue/lookupBook.ts` -- records every candidate's cover URL for the preview.
- `src/lib/catalogue/coverPreview.ts` -- preview entry holds one URL per candidate; `fetchCoverPreview` takes `pick`.
- `src/app/(frontend)/data/cover/[isbn13]/route.ts` -- reads `?pick` (missing: 0; non-digits: 404).
- `src/lib/books/coverUrl.ts` -- `coverUrl({ isbn13, pick? })` appends `?pick=`.
- `src/lib/catalogue/covers.ts` -- `downloadCover(…, pick?)` downloads the picked candidate's cover.
- `src/lib/catalogue/ensureSharedBook.ts` -- builds the Book from the picked candidate; `rawMetadata.coverUrl` follows it.
- `src/lib/catalogue/saveCopy.ts` -- `target: { isbn13; pick? }`, passed only to Book creation.
- `src/app/(frontend)/scan/actions.ts` -- `saveCopyAction` accepts an optional non-negative integer `pick`.
- `src/app/(frontend)/scan/answer.ts` -- `AnswerBook.pick`/`editions`, `AnswerEdition`, `editionLine`, `editionLines` (numbers duplicate rows).
- `src/app/(frontend)/scan/page.tsx` -- reads `&pick=` and passes it to `lookupBook`.
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- `editions` slot after the notes.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx` -- renders `EditionPicker` for 2+ candidates; passes `pick` to Add to library.
- `src/app/(frontend)/scan/EditionPicker.tsx` -- new client component: Link, Picker, `router.replace`, progress line.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- optional `pick` prop in the action input.
- `src/app/(frontend)/styles.css` -- `--spacing-cover-row: 32px` (DESIGN.md Rows m).
- `messages/en.json`, `messages/fi.json` -- `answer.editionsFound`, `answer.editions`, `answer.unnamedEdition`.
- Tests:
  - new: `tests/int/pickEdition.int.spec.ts` (the real Finna adapter on fixture `9780007466061`) and `tests/unit/editionPicker.unit.spec.ts`
  - extended: `coverPreview.int`, `covers.int`, `saveCopyAction.int`, `ensureSharedBook.int`, `answer.unit` and `addToLibrary.unit`
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.53 `done`.

**Review findings.** 30 findings: 0 high, 5 medium, 19 low, 6 false.
- **Patched (6 entries):**
  - progress line while a pick re-renders (low)
  - numbered duplicate picker rows (low)
  - each row's own title on its cover placeholder (low)
  - comment reflow (low)
  - tests that `AddToLibrary` and `saveCopyAction` forward `pick` (medium)
  - test that `downloadCover` stores the picked candidate's cover (medium)
- **Deferred (2):**
  - The save asks the sources twice when nothing is cached. This predates the story. (low)
  - The page → Answer → Link wiring needs an end-to-end check. It belongs to the 3.52 Playwright scan-to-save run. (medium)
- **Rejected** (reasons in the triage log):
  - Lows:
    - `rawMetadata` does not record the pick (a spine field for a re-parse that doesn't exist yet)
    - the pick is matched by index, not by stable key (the intent asks to re-run the lookup by index)
    - picks count toward `LOOKUP_LIMIT` (30 per minute)
    - Finnish binding text is shown untranslated
    - positional `undefined` arguments
    - `pick` is parsed in three places
    - no discriminated union for `AnswerBook`
    - a pick chosen while a save is in flight
    - `rawMetadata` subjects for Google-first outcomes
    - the fixture's records differ only in cover and binding
  - Falses:
    - sprint status vs spec status
    - preview records overwritten
    - `requestId` reuse after a lost answer
    - out-of-range semantics
    - `rawMetadata` follows the best (by design)
    - Link placement

**Follow-up review recommendation:** `false`. Two medium entries were patched, but both added tests, which now pass. No unverified risk is left that another review pass would address.

**Verification.**
- `npm run typecheck`: passes.
- `npm run lint`: 0 errors. The 36 warnings were already there before this story.
- `npm run test:unit`: 631 passed.
- `npm run test:int`: 382 passed, 1 skipped.
- Earlier in the run, `upsertUserBook`'s concurrency case failed once under load from a parallel worktree. It passed 3 of 3 when run alone and in the final full run.

**Residual risks.**
- Not run in a browser. The picker's sheet and dialog, the replace navigation and Back to Scan are unit-tested only, until 3.52's Playwright run.
- Google gap-fills empty fields on every candidate, so a Finna record without a cover can show and save Google's cover. This is existing merge behaviour.
- Story 3.49 (uncommitted on main) rewrites `AddToLibrary.tsx` into `useAddToLibrary.ts` and touches `actions.ts`, `answer.ts` and `page.tsx`. Whichever merges second must carry `pick` into the new hook's input and keep both `ScanOutcome` changes.
