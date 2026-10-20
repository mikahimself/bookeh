---
title: 'Story 3.48: [D25] Answer: in library'
type: 'feature'
created: '2026-10-20'
baseline_revision: '01efa9337f248e34c3fa82eac584d5715b91d2a8'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A scan of an ISBN whose Book the user already holds a copy of has no Answer. `notInLibrary()` returns `null`, so `/scan?isbn=` falls back to Scan. The user cannot see that they own the book or where it is, and cannot add a second copy (FR-16, FR-20, FR-30).

**Approach:** Add an **In library** Answer for an `existing` lookup result with at least one copy. Its heading is "In library". Under the Book, each copy is a line with its location ("Tampere · owned", as in the key-scan-phone mockup and the EXPERIENCE.md journey). At the foot are **Add another copy** (secondary) and **Back** (primary). Add another copy reuses `AddToLibrary` and `saveCopyAction` unchanged, so it gets the same toast and return to Scan. It also gets 3.47's Undo, because 3.47 changes only `AddToLibrary`'s success branch.

## Boundaries & Constraints

**Always:**
- **Data.** In `answer.ts`, rename the type `NotInLibrary` to `AnswerBook` (same fields, same `notInLibrary()` behaviour) and share the `existing` mapping between the two Answers. Add `AnswerCopy = { location: string | null; status: 'owned' | 'ordered' }`, `InLibrary = AnswerBook & { copies: AnswerCopy[] }`, and `inLibrary(result): InLibrary | null`. `inLibrary` is non-null only for `kind: 'existing'` with `book.isbn13 !== null` and `mine.copies.length > 0`. Its copies come from `mine.copies` in Holdings order (oldest first): `location` is the location's `name`, and `status` is copied as is.
- **Outcome.** `ScanOutcome` becomes `{ kind: 'inLibrary'; answer: InLibrary } | { kind: 'notInLibrary'; answer: AnswerBook } | { kind: 'scan'; error? }`. `answerFor` tries `inLibrary`, then `notInLibrary`, then falls back to Scan. A held Book with entries but no copies still gives Scan (On wishlist is Epic 7/8).
- **Strings** (both `messages/en.json` and `fi.json`, `answer` group):
  - `inLibrary`: "In library" / "Kirjastossa"
  - `addAnotherCopy`: "Add another copy" / "Lisää toinen kappale"
  - `copy`: "{status, select, ordered {Ordered} other {Owned}}" / "{status, select, ordered {Tilattu} other {Oma}}"
  - `copyAt`: "{location} · {status, select, ordered {ordered} other {owned}}" / "{location} · {status, select, ordered {tilattu} other {oma}}"
- **Copy line.** `copyAt` when the copy has a location, `copy` when it has none. One `<p className="text-body text-text">` per copy, directly under the Book block and before any notes.
- **Shared layout.** Move the body of `NotInLibraryAnswer` (cover, title, author and edition lines, notes, foot group) into a server component `AnswerLayout({ book, lines, children })`. `lines` are the copy lines, and `children` is the foot group (`flex flex-col gap-2`). `NotInLibraryAnswer` renders the same markup as before through it.
- **Buttons.** `AddToLibrary` gets an optional `another?: boolean` (default `false`). When true, the label is `answer.addAnotherCopy` and the variant is `secondary`. Otherwise everything is exactly as now: the save, latch, `requestId`, toast and back. `AnswerBack` gets an optional `variant` (default `'secondary'`). The In library foot is Add another copy above Back (`variant="primary"`), matching the mockup order with Open book left out.
- **Page.** The `inLibrary` branch is `FullScreenTask title={t('answer.inLibrary')}` with `<InLibraryAnswer>` and `<DismissToast />`, like the Not in library branch. Update the page doc comment: In library is no longer an Answer still to come.

**Never:**
- No Open book (Epic 5), no Look it up again (5.35), no Ordered heading (8.2), no lent marker (Epic 6), no "On {list}" lines (Epic 7).
- No change to `saveCopyAction`, `saveCopy`, the toast store or provider, `lib/books`, or the lookup. No new action.
- No Undo wiring here. It is 3.47's, in `AddToLibrary`'s success `show()`; this story must not touch that call.
- No Playwright spec (3.52).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| One copy at Tampere | `existing`, copies `[{ location: Tampere, status: owned }]` | heading "In library"; line "Tampere · owned"; Add another copy, Back (primary) | — |
| Two copies, one without location | copies at Tampere, and none | lines "Tampere · owned", "Owned", oldest first | — |
| Ordered copy (set in admin) | copy `status: ordered`, no location | line "Ordered" | — |
| Add another copy | tap | `saveCopyAction({ requestId, isbn13 })`; a second owned copy at the default location; held "Saved to …" toast; back on Scan | as Add to library (`SAVE_FAILED`, "No connection.", sign in) |
| Held Book, no copies, entries only | `mine.copies: []`, `entries: [1]` | Scan (no Answer yet) | — |
| No copies, no entries | — | Not in library, as before | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/answer.ts` -- `NotInLibrary`, `notInLibrary()` (its `existing` case returns `null` when `mine.copies` or `mine.entries` is non-empty), `answerLines()`, `ScanOutcome`, `answerFor()`. Every change to the data and the outcome lands here.
- `src/lib/catalogue/lookupBook.ts:42` -- `LookupResult`; `existing` carries `mine: Holdings`. Read-only.
- `src/lib/books/holdings.ts` -- `CopyLine = { copyId; status: 'owned' | 'ordered'; location: Named | null; note; loan }`, oldest copy first. Read-only.
- `src/app/(frontend)/scan/page.tsx` -- branches on `outcome.kind === 'answer'`; becomes three branches. `DismissToast` sits in each Answer branch.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx` -- the markup to move into `AnswerLayout.tsx`. Its `answerLines` call (sources, `from`, `pages`, `newAuthor`, `newSeries`) moves with it.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- client save button. Change only the props, the label and the variant. **3.47 is editing the success `show()` and the doc comment in parallel**, so keep the diff away from those lines, apart from one added doc sentence at the end of the comment.
- `src/app/(frontend)/scan/AnswerBack.tsx` -- add `variant`. `ButtonVariant` is exported from `components/Button.tsx`.
- `src/app/(frontend)/scan/actions.ts` -- `saveCopyAction`. Its doc says "Add to library on the Not in library Answer"; extend that wording to Add another copy. No code change.
- `src/lib/catalogue/saveCopy.ts:104-134` -- a Book the user already holds goes to `createCopy(... status: 'owned')` again, so a second copy needs no service change. Read-only.
- `tests/unit/answer.unit.spec.ts` -- the `notInLibrary`, `answerLines` and `answerFor` cases, and the fixtures for `existing` results. Rename the type; add the `inLibrary` cases.
- `tests/unit/addToLibrary.unit.spec.ts` -- renders `AddToLibrary` with `{ isbn13 }`, so existing cases keep working with the optional prop.
- `tests/int/saveCopyAction.int.spec.ts` -- harness: mocked `next/headers`, login cookie, a shared Book on the ISBN, and a `copies()` helper.
- `tests/unit/messages.unit.spec.ts` -- en/fi parity, which is automatic.

## Tasks & Acceptance

**Execution:**
- `messages/en.json`, `messages/fi.json` -- the four `answer` strings above.
- `src/app/(frontend)/scan/answer.ts` -- `AnswerBook` rename, the shared existing-Book mapping, `AnswerCopy`, `InLibrary`, `inLibrary()`, the new `ScanOutcome`, and `answerFor` precedence.
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- new server component as specified.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx` -- render through `AnswerLayout` with the existing foot.
- `src/app/(frontend)/scan/InLibraryAnswer.tsx` -- new server component: `AnswerLayout` with the copy lines, then `<AddToLibrary isbn13 another />` and `<AnswerBack variant="primary" />`.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- `another` prop.
- `src/app/(frontend)/scan/AnswerBack.tsx` -- `variant` prop.
- `src/app/(frontend)/scan/page.tsx` -- the `inLibrary` and `notInLibrary` branches, and the doc comment.
- `src/app/(frontend)/scan/actions.ts` -- doc wording only.
- `tests/unit/answer.unit.spec.ts` -- `inLibrary`: copy lines with and without a location, an ordered copy, Holdings order kept; `null` for no copies, entries only, a null ISBN, and the other kinds. `answerFor` gives `inLibrary` for a held copy, `notInLibrary` as before, and Scan for entries only.
- `tests/int/saveCopyAction.int.spec.ts` -- new case: the user already holds a copy of the Book, and `saveCopyAction` with a new `requestId` returns `ok`, leaving two owned copies.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set 3.48 to `done` when finished.

**Acceptance Criteria:**
- Given a scan of an ISBN whose Book I hold a copy of, when the Answer renders, then the heading is "In library", each copy is a line with its location, Add another copy and Back are shown with Back as the primary, and there is no Open book.
- Given the In library Answer, when I tap Add another copy, then a second owned copy is saved at the default location, Scan shows the held "Saved to {location}" (or "Saved") toast, and the next Answer dismisses it, exactly as with Add to library.
- Given the Not in library Answer, when it renders, then it looks and behaves exactly as before.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 14 findings — high 0, medium 0, low 8, false 6, maybe-false 0
- findings:
  - `[low]` `[patch]` Verification gap: the copy-line choice (`copy` vs `copyAt` on `location === null`) sat inline in `InLibraryAnswer`, so an inverted branch ("null · owned") would pass every test. Patched: a pure `copyLines()` in `answer.ts`, called by `InLibraryAnswer`, with a unit case for a copy with a location, one without and an ordered one.
  - `[false]` `[reject]` Intent: an ordered-only holding heads "In library", where EXPERIENCE.md would say "Ordered". The epic AC says "hold at least one copy". Story 4.9's AC says an ordered copy "shows on the In library Answer as a line 'Ordered' (the Ordered heading arrives in Story 8.2)". So this interim is the intended one.
  - `[false]` `[reject]` Intent: Undo is not wired, but the story is set `done`. The AC asks for "the same toast and Undo as Add to library". Add another copy is the same `AddToLibrary` component, so it gets 3.47's Undo the moment that story's single `show()` change lands. Today Add to library has no Undo either, so the two match.
  - `[false]` `[reject]` Intent: "Tampere · owned" adds a status word beyond "with its location". The key-scan-phone mockup and the EXPERIENCE.md journey both write the line this way (Design Notes).
  - `[false]` `[reject]` Intent: not committed, and sprint status `done` while the spec is `in-review`. Finalization sets the spec to `done` and commits both together.
  - `[low]` `[reject]` Intent: no test renders `InLibraryAnswer`, `AnswerLayout` or the page branch. The choice logic now sits in `copyLines` and `answerFor`, and both are unit-tested. What is left is markup: the heading, button order and variants. Rendering async server components under jsdom would add a harness for that alone. The page wiring is Playwright's (3.52), as 3.46 deferred.
  - `[low]` `[patch]` Blind: the Finnish "Lisää toinen kappale" reads "add a second copy" when two copies are already held. Patched to "Lisää uusi kappale". The "oma" status word is left for the owner, under EXPERIENCE Open item 2 (Finnish wording).
  - `[low]` `[patch]` Blind (same root as the Intent ordered row): the doc comment does not record the ordered-only interim. Patched: `inLibrary`'s comment names Story 8.2 and 4.9.
  - `[low]` `[patch]` Blind (same root as the verification-gap row): the copy-line text was built outside `answer.ts`. Patched by `copyLines()`.
  - `[low]` `[patch]` Blind: `page.tsx` repeats the Answer branch, so every later Answer would copy it again and could forget `DismissToast`. Patched: one Answer branch, with the heading from `answer.${outcome.kind}` and `DismissToast` rendered once.
  - `[false]` `[reject]` Blind: which Answer wins is decided in two places. `notInLibrary` and `inLibrary` are each correct on their own: one requires no copies, the other at least one. So call order cannot make them disagree. Epic 8's `answerFacts` replaces both.
  - `[low]` `[patch]` Blind: the new messages test asserts exact catalogue text, which only restates config (functional-minimum rule). Patched: for each locale it checks that `copyAt` includes the location and that `copy` gives distinct, non-empty text for owned and ordered.
  - `[low]` `[patch]` Blind: the `AnswerBook` doc comment named only Add to library. Patched to name Add another copy too.
  - `[low]` `[patch]` Blind: the copy lines were bare `<p>`s, so a screen reader cannot count the copies (EXPERIENCE Duplicate state). Patched: `<ul>`/`<li>` with the same classes.

## Design Notes

**Why `another` on `AddToLibrary` rather than a second component.** EXPERIENCE.md gives Add to library and Add another copy one behaviour: a save as fetched, the save toast with Undo, and the return to Scan. One component keeps that true by construction. It also lets 3.47's Undo, which changes only `AddToLibrary`'s success `show()`, reach both buttons with no follow-up, whichever story merges first.

**Why "· owned".** The AC says "a line with its location". The key-scan-phone mockup and the EXPERIENCE.md journey both write the line as "Tampere · owned". Keeping the status gives a copy with no location a line of its own ("Owned"). It also already covers 4.9's "a copy set to ordered shows … as a line 'Ordered'".

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: 0 errors
- `npm run test:unit` -- expected: all pass (`scanScreen` first-barcode test is a known flake under load; re-run it alone)
- `npm run test:int` -- expected: all pass (Postgres on 5434)

**Manual checks:**
- `npm run dev` against 5434, signed in: save a fixture ISBN with Add to library, then submit it again. The Answer is "In library" with "{default} · owned". Add another copy returns to Scan with the toast, and a third submit lists two lines.

## Auto Run Result

**Summary:**
- A scan of an ISBN whose Book the user holds a copy of now opens the **In library** Answer.
- Under the Book there is one line per copy, oldest first: "Tampere · owned", "Owned" with no location, or "Ordered".
- At the foot, **Add another copy** (secondary) sits above **Back** (primary). Open book is absent.
- Add another copy is `AddToLibrary` with `another`: the same `saveCopyAction`, held toast, latch and return to Scan. It picks up 3.47's Undo through that one component.
- The Answer body moved into a shared `AnswerLayout`. Not in library renders the same as before.
- `page.tsx` has a single Answer branch, with the heading from the outcome kind and `DismissToast` rendered once.

**Files changed:**
- `src/app/(frontend)/scan/answer.ts`: `AnswerBook` (renamed from `NotInLibrary`), `AnswerCopy`, `InLibrary`, `inLibrary()`, `copyLines()`, the three-kind `ScanOutcome`, and `answerFor` trying In library first.
- `src/app/(frontend)/scan/AnswerLayout.tsx` (new): the shared Answer body, with copy lines as a list.
- `src/app/(frontend)/scan/InLibraryAnswer.tsx` (new): the In library Answer.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx`: now renders through `AnswerLayout`.
- `src/app/(frontend)/scan/AddToLibrary.tsx`: the `another` prop (label and variant only).
- `src/app/(frontend)/scan/AnswerBack.tsx`: the `variant` prop.
- `src/app/(frontend)/scan/page.tsx`: one branch for both Answers.
- `src/app/(frontend)/scan/actions.ts`: doc comment only.
- `messages/en.json`, `messages/fi.json`: `answer.inLibrary`, `addAnotherCopy`, `copy`, `copyAt`.
- Tests:
  - `tests/unit/answer.unit.spec.ts`: `inLibrary`, `copyLines` and `answerFor` cases.
  - `tests/unit/messages.unit.spec.ts`: the copy-line ICU strings format, per locale.
  - `tests/int/saveCopyAction.int.spec.ts`: a second save leaves two owned copies.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.48 set to `done`.

**Review findings:** 14 in total (low 8, false 6).
- **Patched, 6 entries:**
  - `copyLines()` with a unit case (verification gap and Blind);
  - the Finnish "Lisää uusi kappale";
  - the single Answer branch in `page.tsx`;
  - doc comments, including the ordered-only interim (Blind and Intent);
  - copy lines as `<ul>`/`<li>`;
  - the messages test no longer restates strings.
- **Deferred:** none.
- **Rejected, with reasons in the triage log:**
  - the ordered-only heading (4.9's AC sanctions the interim);
  - Undo not wired (parity with Add to library by construction; 3.47);
  - the "· owned" status word (mockup and journey);
  - the commit and status alignment (done at finalization);
  - no server-component render test (markup; 3.52's Playwright);
  - answer precedence decided "in two places" (the predicates are complementary).

**Follow-up review recommended:** false. Patched counts by verdict: high 0, medium 0, low 6.

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (36 warnings, all pre-existing in migrations).
- `npm run test:unit`: 37 files pass. One run failed one test (the known `scanScreen` flake under parallel worktrees). Two further full runs and the post-patch run all passed.
- `npm run test:int`: 39 files pass, 1 skipped (Postgres on 5434).
- The manual dev-server walkthrough was not run.

**Residual risks:**
- Not seen in a browser: the In library screen, the button order and look, and Add another copy returning to Scan with the toast.
- Undo on both buttons depends on 3.47. Whichever of 3.47 and 3.48 merges second resolves a small conflict in `AddToLibrary.tsx`: 3.47 changes the success `show()` and the doc comment, and 3.48 changes the signature and the `<Button>` lines.
- The Finnish status word "oma" is the owner's call.

