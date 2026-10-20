---
title: 'Story 3.49: [D26] Answer: not found, entered by hand'
type: 'feature'
created: '2026-10-20'
baseline_revision: '486b3f6531add0ec8f38f8191c76ac889b4b5b3e'
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

**Problem:** When no source knows a scanned ISBN, `answerFor` returns `{ kind: 'none' }` → Scan, so the book cannot be added. A book with no barcode cannot be added at all. The manual save path (`saveCopy` with a `{ manual }` target, Story 3.38) exists, but nothing on screen reaches it (FR-12, FR-22).

**Approach:** Add a **Not found** Answer. A `none` lookup on `/scan?isbn=` opens it with the ISBN; `/scan?title=<text>` opens it with no ISBN and `<text>` in the title field. It has Title and Author fields, then **Add to library** (primary) and **Back**. The save goes through a new `saveManualAction` that calls `saveCopy` with `{ manual }`. It gets the same held toast with Undo and the same return to Scan as Add to library, through press logic shared with `AddToLibrary`. A missing field shows its message under the field. Scan gets an **Add without ISBN** Link to `/scan?title=`.

## Boundaries & Constraints

**Always:**
- **Outcome.** `ScanOutcome` gains `{ kind: 'notFound'; isbn13: string | null; title: string }`. `answerFor(isbn, lookup)` takes the ISBN text as its first argument. A `none` result gives `{ kind: 'notFound', isbn13: normaliseIsbn(isbn), title: '' }`. The lookup has already accepted the text, so it normalises. `unavailable` still gives Scan (Story 3.50).
- **Page.** A non-blank `isbn` param goes through `answerFor` as now. Otherwise, a `title` param that is present, even empty, gives `{ kind: 'notFound', isbn13: null, title }` with the raw first value. Neither gives Scan. With a non-blank `isbn`, `title` is ignored. The heading comes from the existing `answer.${outcome.kind}` branch, with `DismissToast` as in the other Answers. Update the page doc comment.
- **Answer body** (`NotFoundAnswer`, server component, no `AnswerLayout`, because there is no Book to show): with an ISBN, a muted line `answer.noSource` ("No source has {isbn}.", the 13 digits as stored). Then the client `NotFoundForm({ isbn13, title })`.
- **Form.** A `<form>` with two `TextField`s: Title (`answer.title`, `defaultValue={title}`, `autoFocus`, `enterKeyHint="next"`; Enter moves focus to Author and does not submit) and Author (`answer.author`, `enterKeyHint="go"`; Enter submits). The foot (`flex flex-col gap-2`) has Add to library (primary, `type="submit"`) above `AnswerBack` (secondary). Submit sends `saveManualAction({ requestId, isbn13?, title, author })` with the raw text, and `isbn13` is left out when null. The frontend does no validation of its own.
- **Field errors.** A `VALIDATION` result with `fields.title` shows `answer.titleRequired` under Title. A result with `fields.authors` shows `answer.authorRequired` under Author. Both can show at once. A press clears the errors. The typed text stays. Any other failure goes to `reportFailure`, as in Add to library.
- **Shared press logic.** Move `AddToLibrary`'s latch, `requestId`, mounted ref, success toast (`hold: true`, Undo) and `back()` into `useAddToLibrary()` in `scan/useAddToLibrary.ts`. It returns `{ pending, add(call, onRefused?) }`. `call(requestId)` performs the action. `onRefused(failure)` returns `true` when it handled the failure itself, and otherwise `reportFailure(code)` runs. `AddToLibrary` keeps its props, markup and behaviour, and renders through the hook. Its existing unit tests pass unchanged.
- **Action.** `saveManualAction(input: unknown)` in `scan/actions.ts` accepts `{ requestId: string; title: string; author: string; isbn13?: string }` and treats anything else as `VALIDATION`. It calls `saveCopy(ctx, { requestId, target: { manual: { isbn: isbn13, title, authors: [author] } }, save: { kind: 'copy' } })`. Folding: `ok` and `UNAUTHENTICATED` pass through. So does `VALIDATION` whose `fields` has `title` or `authors`, returned as `{ ok: false, code: 'VALIDATION', fields }` with only those two keys. Everything else is logged as in `saveCopyAction` and becomes `SAVE_FAILED`.
- **Scan Link.** Under the ISBN form in `ScanScreen`, add `<TextLink href="/scan?title=">` with `scan.addWithoutIsbn`. This is a push, like a read.
- **Strings** in `messages/en.json` and `fi.json`:
  - `answer.notFound`: "Not found" / "Ei löytynyt"
  - `answer.noSource`: "No source has {isbn}." / "Mikään lähde ei tunne ISBN:ää {isbn}."
  - `answer.title`: "Title" / "Nimeke"
  - `answer.author`: "Author" / "Tekijä"
  - `answer.titleRequired`: "Enter the title." / "Kirjoita nimeke."
  - `answer.authorRequired`: "Enter the author." / "Kirjoita tekijä."
  - `scan.addWithoutIsbn`: "Add without ISBN" / "Lisää ilman ISBN:ää"

**Never:**
- No Add to wishlist (Epic 7). No Find by title or author Link (Epic 8). No `?book=` route (Epic 8). No "Add by hand" or Try again (3.50).
- No change to `saveCopy`, `normaliseManual`, `createPrivateBook`, `lookupBook`, the toast store or provider, or `saveCopyAction`'s behaviour.
- No HTML `required` attribute (it would trigger native bubbles), and no client-side required check.
- No multiple-author entry. One Author field, sent as one name. More authors are added on Edit book (Epic 4).
- No Playwright spec (3.52).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Scanned, no source | `/scan?isbn=951-0-12345-X`, lookup `none` | heading "Not found"; "No source has 978…"; empty Title (focused), Author; Add to library, Back | — |
| Save with ISBN | title "Kotiseutu", author "A. Kirjoittaja" | a private Book with the ISBN and an owned copy at the default location; held "Saved to Tampere" toast with Undo; back on Scan | as Add to library (`SAVE_FAILED`, "No connection.", sign in) |
| Add without ISBN | Scan Link → `/scan?title=` | "Not found", no ISBN line, empty Title | — |
| Title prefilled | `/scan?title=Kotiseutu` | Title field holds "Kotiseutu" | — |
| Save without ISBN | typed both | a private Book with no `isbn13`, an owned copy, toast, Scan | — |
| Missing fields | both blank, or whitespace only | "Enter the title." and "Enter the author." under the fields; nothing saved; text kept | no toast |
| One missing | author blank | only "Enter the author." | — |
| Both params | `?isbn=<valid>&title=x` | the ISBN lookup; `title` ignored | — |
| Undo | Undo on the toast | the copy and the private Book (and any author it created) are deleted | `UNDO_FAILED` as elsewhere |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/answer.ts` -- `ScanOutcome`, `answerFor(lookup)` (the `none` case currently falls to `{ kind: 'scan' }` via `notInLibrary` → null). Add `notFound` and the `isbn` argument. `normaliseIsbn` comes from `@/fields/isbn` (pure, also used by `saveCopy`).
- `src/app/(frontend)/scan/page.tsx` -- reads only `isbn`. Add `title`, and pass `text` to `answerFor`. Its single Answer branch picks the component by `outcome.kind`. Add the `notFound` arm.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- the press logic to extract. Its doc comment explains the latch, `requestId` and unmount semantics, and should move to the hook.
- `src/app/(frontend)/scan/AnswerBack.tsx` -- reuse as is.
- `src/app/(frontend)/scan/actions.ts` -- `saveCopyAction` and `isSaveInput`. Add `saveManualAction` next to them, mirroring their folding and logging.
- `src/app/(frontend)/scan/ScanScreen.tsx` -- add the Link after `<form>`. `TextLink` is from `../components/Link`.
- `src/app/(frontend)/components/TextField.tsx` -- `error` prop draws the message under the field. Forward a `ref` for the Author focus. React 19 passes `ref` as a prop, as `ScanScreen` already does.
- `src/app/(frontend)/(sections)/settings/DisplayNameField.tsx:40` -- the existing `VALIDATION` + `fields` → field message pattern.
- `src/lib/catalogue/saveCopy.ts:75-84` -- the `{ manual }` branch: `normaliseManual` throws `VALIDATION` with `fields.title` / `fields.authors` before any read. With an ISBN, a Book the user already holds gets the copy. Otherwise `createPrivateBook`. Read-only.
- `src/lib/catalogue/createPrivateBook.ts:13` -- `ManualEntry = { isbn?: string; title: string; authors: string[] }`. Read-only.
- `src/lib/errors.ts:21` -- `ActionResult` failure carries `fields?: Record<string, ErrorCode>`.
- `tests/unit/answer.unit.spec.ts:283` -- `answerFor` cases with the old signature. Update the call sites, and turn the `none` case into `notFound`.
- `tests/unit/addToLibrary.unit.spec.ts` -- its mocks (`next-intl`, `navigation`, `./actions`, `ToastProvider`) are the template for a `NotFoundForm` test.
- `tests/int/saveCopyAction.int.spec.ts` -- harness with mocked `next/headers`, a login cookie, a Tampere default location, and a `copies()` helper. Add the `saveManualAction` cases here.

## Tasks & Acceptance

**Execution:**
- `messages/en.json`, `messages/fi.json` -- the seven strings above.
- `src/app/(frontend)/scan/answer.ts` -- the `notFound` outcome, the `answerFor(isbn, lookup)` signature, and `none` → `notFound`.
- `src/app/(frontend)/scan/page.tsx` -- the `title` param, the `notFound` arm rendering `<NotFoundAnswer>`, and the doc comment.
- `src/app/(frontend)/scan/useAddToLibrary.ts` -- new hook holding the press logic, as specified.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- render through the hook; behaviour unchanged.
- `src/app/(frontend)/scan/actions.ts` -- `saveManualAction` with input check and folding.
- `src/app/(frontend)/scan/NotFoundAnswer.tsx` -- new server component: the ISBN line and `NotFoundForm`.
- `src/app/(frontend)/scan/NotFoundForm.tsx` -- new client component: the fields, the Enter handling, field errors and the foot.
- `src/app/(frontend)/scan/ScanScreen.tsx` -- the Add without ISBN Link, and a doc sentence.
- `tests/unit/answer.unit.spec.ts` -- `answerFor` gives `notFound` with the normalised ISBN for `none` (an ISBN-10 input proves the normalisation), and still gives Scan for `unavailable`.
- `tests/unit/notFoundForm.unit.spec.ts` -- the submit sends `{ requestId, isbn13, title, author }` (no `isbn13` key when null). A `VALIDATION` result with both fields shows both messages and no toast. A success shows the held toast and calls back.
- `tests/int/saveCopyAction.int.spec.ts` -- `saveManualAction`: with an ISBN, `ok` with `savedTo` Tampere and a private Book holding the ISBN and title; without an ISBN, a Book with `isbn13` null; blank title and author give `{ ok: false, code: 'VALIDATION', fields: { title, authors } }` and no copy.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set 3.49 to `done` when finished.

**Acceptance Criteria:**
- Given an ISBN no source knows, when I scan or type it, then the Answer's heading is "Not found", with the ISBN named, Title and Author fields, Add to library as the primary, and Back.
- Given the Not found Answer with both fields typed, when I tap Add to library, then a private Book is saved with the typed ISBN (or none) and an owned copy at the default location, Scan shows the held save toast with Undo, and the next Answer dismisses it, exactly as with Add to library.
- Given Scan, when I tap Add without ISBN, then the Not found Answer opens with an empty, focused Title and no ISBN line. Back returns to Scan.
- Given the Not in library and In library Answers, when they render, then they look and behave exactly as before.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 17, false 7, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: a barcode read can overtake the Add without ISBN Link while its RSC fetch runs, since the Link does not set `paused`. Real, but only when a new barcode comes into view in that window; the book just read is held by the gate. The fix adds a click handler and its own pause/release state.
  - `[low]` `[patch]` Blind: after a refused save, focus stays on the button, so on the phone the keyboard is gone and a screen reader hears nothing. Patched: `onRefused` focuses Title when it is marked, else Author.
  - `[low]` `[reject]` Blind: "Enter the title." stays under a filled field until the next press. This is the spec's "a press clears the errors", as in `DisplayNameField`. Clearing on change means per-field `onChange` branches, for a cosmetic gain.
  - `[low]` `[reject]` Blind: a submit before hydration does a native GET that drops the ISBN. Nothing is saved, and the screen re-renders Not found. This needs a direct load of a Not found address and a tap before hydration. Answers are normally reached by client navigation from Scan.
  - `[low]` `[patch]` Blind: `answerFor` received the ISBN text twice (the argument and the lookup closure), so the two could drift. Patched: `lookup` takes the ISBN, and the page passes `(isbn) => lookupBook(ctx, { isbn })`.
  - `[low]` `[patch]` Blind: no `NotFoundForm` case covers a failure that is not a field `VALIDATION`. Same root as the second verification-gap row. Patched: a field refusal, then `SAVE_FAILED`, which raises the error toast, does not go back and clears the marks.
  - `[low]` `[patch]` Blind: the action's own fold of a non-field refusal is untested. Patched: `isbn13: 'abc'` gives `SAVE_FAILED` and no copy. The overlapping no-ISBN and undo cases stay: they cover matrix rows through the action.
  - `[low]` `[patch]` Blind: `add`'s parameter types were spelled out twice in `useAddToLibrary`. Patched: named once and reused.
  - `[false]` `[reject]` Blind: sprint status says `done` while in review. Finalization sets the spec to `done` and commits both together.
  - `[false]` `[reject]` Blind: Add to wishlist on Not found should be recorded as deferred. The story's own AC says "Add to wishlist arrives in Epic 7", so the intent excludes it. The single-submit note is speculation about Epic 7's design.
  - `[low]` `[reject]` Edge: a title over 500 characters fails `books.title` `maxLength` and shows "Enter the title.". Real, but no one types a 500-character title. A distinct message needs a new code and string.
  - `[low]` `[reject]` Edge: an author over 200 characters fails `authors.name` `maxLength` (path `name`) and shows the `SAVE_FAILED` toast. Same reasoning as the title row: unlikely, and the fix adds mapping or a duplicated limit.
  - `[low]` `[patch]` Edge: Enter that confirms an IME composition in Title moves focus to Author. Patched: return early on `nativeEvent.isComposing`.
  - `[low]` `[reject]` Edge: a committed save whose answer was lost, retried after editing the fields, returns the first result. This is the documented `requestId` semantics. Dropping the id on edit would risk a second Book for one press, which is worse.
  - `[low]` `[patch]` Verification gap: `saveManualAction`'s `UNAUTHENTICATED` pass-through is untested. Patched: a signed-out case, mirroring `saveCopyAction`'s.
  - `[low]` `[patch]` Verification gap: `NotFoundForm` never sees a non-field failure, so an `onRefused` that swallowed everything would pass. Same root as the Blind row. Patched by the same case.
  - `[low]` `[reject]` Verification gap: the page wiring (the `title` arm and the `isbn13` prop to `NotFoundAnswer`) is never rendered. The decision logic sits in the unit-tested `scanParams` and `answerFor`. What is left is a ternary and a prop. A page render harness for async server components does not exist; route-level checks are Playwright's (3.52), as in 3.48.
  - `[false]` `[reject]` Intent: "both required" is enforced only on the server. The messages show under the fields as the AC asks; the spec chose this on purpose (no native bubbles, no frontend rules).
  - `[low]` `[reject]` Intent: Answer-level expectations (the heading, the ISBN line, the toast dismissal) are tested below the page. Same root and reason as the page-wiring row.
  - `[low]` `[reject]` Intent: no single run links scan → not found → save. Same root as the page-wiring row (3.52).
  - `[false]` `[reject]` Intent: the Undo case does not check authors the save created. The action passes the receipt unchanged. Author cleanup is `createPrivateBook`'s restore, covered in `createPrivateBook.int.spec.ts`.
  - `[false]` `[reject]` Intent: no evidence that `addToLibrary.unit.spec.ts` still passes. It ran unchanged in the full unit run (631 pass).
  - `[false]` `[reject]` Intent: content beyond the story (the ISBN line, the Enter behaviour). Taken from the key-scan-phone mockup; the auditor found no conflict.
  - `[false]` `[reject]` Intent: the `?title=` prefill reading. Prefill and an empty Link both satisfy the AC, as the auditor notes.

## Design Notes

**Why a hook, not a `manual` prop on `AddToLibrary`.** The Not found save needs the form's values at press time and its own handling of refused fields. A hook keeps one implementation of the press semantics (the latch, `requestId` reuse on retry, the held toast with Undo, back) for every Add to library button. It does this without making `AddToLibrary` know about forms.

**Why fold `VALIDATION` selectively.** Only `title`/`authors` have a place on screen. Any other `VALIDATION` (a malformed input, or `createCopy`'s or the unique index's `ValidationError`) would show the "Check the marked fields." toast with nothing marked. To the person scanning, those mean "try again", so they become `SAVE_FAILED`.

**`?title=` presence, not value.** `/scan?title=` with an empty value is the Add without ISBN address (spine, Routes). Only the key's presence opens the Answer.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: 0 errors
- `npm run test:unit` -- expected: all pass (`scanScreen` first-barcode test is a known flake under load; re-run it alone)
- `npm run test:int` -- expected: all pass (Postgres on 5434)

**Manual checks:**
- `npm run dev`: type an ISBN no fixture or source knows. "Not found" appears; submitting blank shows both messages; typing both saves and returns to Scan with the toast. Add without ISBN on Scan opens the empty form.

## Auto Run Result

**Summary:**
- When no source knows a scanned or typed ISBN, Scan now opens the **Not found** Answer. It shows "No source has {isbn}.", Title (focused) and Author fields, **Add to library** (primary) and **Back**.
- `/scan?title=<text>` opens the same Answer with no ISBN and the text in Title. Scan has an **Add without ISBN** Link to `/scan?title=`.
- Add to library calls the new `saveManualAction` → `saveCopy({ manual })`. It saves a private Book (with the ISBN or without one) and an owned copy at the default location. Then the held "Saved to …" toast with Undo appears and the app returns to Scan, exactly as with Add to library.
- A missing title or author shows its message under the field, and focus goes back to that field. Other failures are reported as in Add to library.
- The press logic (latch, `requestId`, toast, back) moved from `AddToLibrary` into `useAddToLibrary()`, which both buttons now use. `AddToLibrary`'s behaviour and tests are unchanged.

**Files changed:**
- `src/app/(frontend)/scan/answer.ts`:
  - the `notFound` outcome;
  - `answerFor(isbn, lookup(isbn))`, which turns a `none` lookup into Not found with the ISBN-13;
  - `scanParams()`, which resolves `isbn`/`title` (`title` counts when the key is present; a non-blank `isbn` wins).
- `src/app/(frontend)/scan/page.tsx`: uses `scanParams`, renders `NotFoundAnswer`, doc comment updated.
- `src/app/(frontend)/scan/NotFoundAnswer.tsx` (new): the ISBN line and the form.
- `src/app/(frontend)/scan/NotFoundForm.tsx` (new): the fields, Enter in Title moves to Author (IME-safe), field errors with focus, the foot.
- `src/app/(frontend)/scan/useAddToLibrary.ts` (new): the shared press hook, with `SaveCall`/`OnRefused` types.
- `src/app/(frontend)/scan/AddToLibrary.tsx`: renders through the hook.
- `src/app/(frontend)/scan/actions.ts`: `saveManualAction` with an input check. `VALIDATION` for `title`/`authors` passes through with only those fields; any other failure becomes `SAVE_FAILED`.
- `src/app/(frontend)/scan/ScanScreen.tsx`: the Add without ISBN Link.
- `messages/en.json`, `messages/fi.json`: seven strings.
- Tests:
  - `tests/unit/answer.unit.spec.ts`: `scanParams`, Not found from an ISBN-10, `unavailable` → Scan, new signature.
  - `tests/unit/notFoundForm.unit.spec.ts` (new): the payload with and without an ISBN; toast and back; both or one field marked; a non-field failure reported and the marks cleared; Title focused; Enter moves to Author.
  - `tests/int/saveCopyAction.int.spec.ts`: `saveManualAction` with an ISBN, without one, undo, blank fields, a malformed input, a bad `isbn13`, signed out.
- `_bmad-output/implementation-artifacts/epic-3-context.md`: recompiled (EXPERIENCE.md was newer).
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.49 set to `done`.

**Review findings:** 24 in total (low 17, false 7).
- **Patched, 6 entries (8 rows):**
  - focus on the first marked field;
  - IME guard on Enter;
  - `answerFor`'s lookup takes the ISBN;
  - named hook types;
  - a `NotFoundForm` non-field-failure test (Blind and verification gap);
  - action int tests for signed out and a bad `isbn13` (verification gap and Blind).
- **Deferred:** none.
- **Rejected, with reasons in the triage log:**
  - a barcode read racing the Link (rare; needs its own pause state);
  - stale field marks until the next press (spec behaviour, cosmetic);
  - a pre-hydration native GET (nothing saved; rare);
  - title over 500 or author over 200 characters (unlikely; needs a new code);
  - a lost answer followed by an edited retry (documented `requestId` semantics; the alternative risks a second Book);
  - page-level render and end-to-end flow untested (logic in tested pure functions; Playwright is 3.52);
  - sprint status flip (done at finalization);
  - Add to wishlist deferral (the AC puts it in Epic 7);
  - five descriptive intent notes (no divergence).

**Follow-up review recommended:** false. Patched entries by verdict: high 0, medium 0, low 6.

**Verification:**
- `npm run typecheck`: clean.
- `npx eslint src tests`: 0 errors (36 old warnings in migrations).
  - The full `npm run lint` also picks up 44 errors from other sessions' build output in `.claude/worktrees/*/.next`. They are not from this change.
- `npm run test:unit`: 39 files, 642 tests pass.
- `npm run test:int`: 39 files pass, 1 skipped (380 tests).
- The manual dev-server walkthrough was not run.

**Residual risks:**
- Not seen in a browser: the Not found screen, its look, the Link's placement under the ISBN field, and the round trip from a save back to Scan with the toast.
- After a refused save, the focus moves inside the save's transition. That can happen before the field message renders, so a screen reader may not read the message on focus.
- The Finnish strings ("Ei löytynyt", "Mikään lähde ei tunne ISBN:ää {isbn}.", "Nimeke", "Tekijä") are the owner's call.
