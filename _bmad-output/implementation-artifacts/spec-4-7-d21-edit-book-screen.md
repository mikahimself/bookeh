---
title: 'Story 4.7: [D21] Edit book screen'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: '8d634ac658328d402b9f9d424ac2a289f6ba849d'
review_loop_iteration: 0
followup_review_recommended: true
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `editBook()` exists (4.2, 4.4), but no screen reaches it. `/books/[bookId]/edit` is missing, so the save toast's Edit (4.9), More details (4.8) and the cover controls (4.14) have nothing to sit in.

**Approach:** Add the Edit book page as a full-screen task. It shows the cover, title, author line and source line, with Save pinned at the bottom. It also holds the machinery the fields will plug into: a sparse draft of `BookEdits` kept in `sessionStorage` per Book, Save through a new `editBookAction`, the "Discard changes?" guard on X and Back, and field marks from a `VALIDATION`. Mika chose this scope on 2026-10-21: 4.7 ships no editable field, and 4.8 adds the fields that write into the draft and show their own messages.

## Boundaries & Constraints

**Always:** The page does `requireUser()`, then `requireOwnBook()` and `getEffectiveBooks()`. A `NOT_FOUND`, or a Book missing from the effective read, means "not held". The action is `runAction()` + `requireUserOrThrow()`. It checks the client input: `bookId` a positive safe integer, `edits` a plain object whose values have the `BookEdits` types (text `string | null`, `title`/`isbn13` `string`, numbers integer or `null`, `authors` `string[]`, `genres` `number[]`). Anything else is `VALIDATION`, with `fields` naming each wrongly typed key. Then it calls `editBook()` unchanged. The draft holds only changed keys: `set(key, value)` drops a key whose value equals the effective one. Interface text in English and Finnish, tokens only, overlays only from `components/ui`. Every `sessionStorage` access sits in try/catch. A blocked or malformed entry means no draft, and a malformed entry is removed.

**Never:** No editable field, More details, copy status or location (4.8, 4.9), no cover controls (4.14). No change to `editBook`, `requireOwnBook` or the spine: the route, `editBook` and AD-7 are already stated. No Undo. No new `ErrorCode`. No Playwright test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save | stored draft `{ year: 2015 }` for Book 7 | `editBookAction({ bookId: 7, edits: { year: 2015 } })`, the toast "Saved", the task closes (history back, `/` fallback), and the draft is gone | No error expected |
| Signed out on Save | action answers `UNAUTHENTICATED` | `reportFailure`: off to `/login?next=/books/7/edit`. The draft stays, so reopening restores it | No error expected |
| Rejected field | `VALIDATION` with `fields: { title: 'VALIDATION' }` | the marks are held per key for the fields (4.8) and the task stays open | the `VALIDATION` error toast too (in 4.7 no field is drawn) |
| Leave with changes | draft not empty; X, or browser/system Back | the "Discard changes?" dialog. Cancel stays, and Back is guarded again. Discard clears the draft and closes the task | No error expected |
| Leave clean | empty draft; X or Back | closes at once, no dialog | No error expected |
| Not held | another user's Book, a missing id or `abc` | the toast "Not in library", then `router.replace('/')` | No error expected |

</intent-contract>

## Code Map

- `src/lib/catalogue/editBook.ts:20,35` -- `BookEdits`, `EditBookInput`, `editBook()`. Read-only. It already rejects unknown keys, a blank title, a bad ISBN and refused keys.
- `src/lib/books/requireOwnBook.ts`, `src/lib/books/effectiveBook.ts:118` -- the gate and `getEffectiveBooks(ctx, [id])`. `EffectiveBook` gives `title`, `authors[].name`, `source`, `coverUrl`.
- `src/app/(frontend)/scan/page.tsx` -- page pattern: `requireUser`, `<ViewTransition enter="task-enter" exit="task-exit">` around `FullScreenTask`.
- `src/app/(frontend)/scan/layout.tsx` -- `<TaskBase />` in a layout. Edit book needs one, because the guard entry raises `depth`, and without `taskBase` `useCloseTask` would only step back onto the task.
- `src/app/(frontend)/components/FullScreenTask.tsx` -- the X calls `useCloseTask()(frame)`. It gains an optional `foot` (sticky bottom, safe-area padding like `(sections)/layout.tsx`'s `data-pinned-bottom`) and an optional `onClose(close)` that intercepts the X.
- `src/app/(frontend)/components/navigation.ts:225` -- `useCloseTask`: `go(-steps)` from `taskBase`, which covers a guard entry still on top.
- `src/app/(frontend)/components/ui/overlay.tsx:85` -- `useCloseOnBack(open, close, onClosed)`. It is reused as the Back guard: `open` = draft not empty and not answering a Back. `onClosed` is where to navigate after a dialog.
- `src/app/(frontend)/components/ui/Dialog.tsx` -- `confirm` = a destructive Button. Navigate in `onClosed`, after the dialog's entry has gone.
- `src/app/(frontend)/components/request.ts` -- `settleAction`, `useReportFailure`.
- `src/app/(frontend)/scan/useAddToLibrary.ts`, `scan/actions.ts` -- action and press patterns: `useTransition`, one press in flight, input guards on `unknown`.
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- the cover-beside-title block to mirror, using the client `Cover`. Authors are joined ", ". The source line is `answer.from` + `sources.<id>`, left out when there is no source or it is unknown.
- `src/app/(frontend)/components/toast/RaiseToast.tsx` -- the show-on-mount pattern for the not-held toast.
- `messages/en.json`, `messages/fi.json` -- `toast.saved` and `answer.notInLibrary` exist. New keys: `editBook.heading` "Edit book" / "Muokkaa kirjaa", `editBook.save` "Save" / "Tallenna", `editBook.discardTitle` "Discard changes?" / "Hylätäänkö muutokset?", `editBook.discard` "Discard" / "Hylkää".
- `tests/unit/notFoundForm.unit.spec.ts`, `tests/unit/overlay.unit.spec.ts` -- jsdom patterns: mocked `next-intl` and toast, and real `history` with `popstate`.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/books/[bookId]/edit/actions.ts` -- `editBookAction(input: unknown): Promise<ActionResult<null>>` with the input guard above, then `editBook()`. -- the AC's Save target.
- `src/app/(frontend)/books/[bookId]/edit/draft.ts` -- the per-Book `sessionStorage` key `bookeh:edit-book:<id>`, `readDraft`/`writeDraft`/`clearDraft`, and the pure `setEdit(draft, key, value, effective)` (equal values compare by JSON). -- keeps the draft only-changed and survives sign-in.
- `src/app/(frontend)/components/FullScreenTask.tsx` -- add the `foot` and `onClose` props. The column fills the height so the foot sits at the bottom. -- Save is pinned, and the X can be guarded.
- `src/app/(frontend)/books/[bookId]/edit/layout.tsx` -- `<TaskBase />`. -- Save and Discard leave the whole task.
- `src/app/(frontend)/books/[bookId]/edit/page.tsx` -- parse `bookId`, gate, read. A held Book → `EditBookScreen` with `{ bookId, title, authors, source line, cover }`. Otherwise `NotHeld`. -- the route.
- `src/app/(frontend)/books/[bookId]/edit/NotHeld.tsx` -- client: on mount, show the success-kind toast `answer.notInLibrary`, then `router.replace('/')`. -- the not-held AC.
- `src/app/(frontend)/books/[bookId]/edit/EditBookScreen.tsx` -- client: restore the draft after mount, hold it with `marks`, Save with the matrix outcomes (set a leaving flag before closing so the guard's `popstate` is ignored), the Back guard and the Discard dialog for X and Back. Doc comment: 4.8's fields call `setEdit` and read `marks`. -- the screen.
- `messages/en.json`, `messages/fi.json` -- the four keys. -- English and Finnish.
- `tests/unit/editBookScreen.unit.spec.ts` -- jsdom, real `history`, with the action, toast and router mocked. Cases: (1) stored draft → Save sends it, toasts "Saved", closes, clears storage; (2) `UNAUTHENTICATED` keeps storage; (3) X with a draft → dialog → Discard clears and closes, and X without a draft closes at once; (4) Back with a draft → dialog → Cancel stays, and a second Back asks again; (5) `VALIDATION` with `fields` → the `VALIDATION` toast, the task stays and storage is kept; (6) `NotHeld` shows the "Not in library" toast and replaces with `/`. -- guards the ACs the story names; one case per matrix row.

**Acceptance Criteria:**
- Given `/books/[bookId]/edit` for a held Book, when it opens, then it is a full-screen task (a centred column on wide screens) with the cover, title, author line and source line, and Save pinned at the bottom.
- Given any width, when the content is shorter or longer than the screen, then Save stays at the bottom edge and does not cover the content.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 32 findings — high 0, medium 4, low 22, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` (intent) "Only changed fields" and "kept in sessionStorage" have no path a user can reach. Disproof: Mika chose this scope on 2026-10-21 (machinery only, the fields come in 4.8), so the intent as resolved excludes fields.
  - `[false]` `[reject]` (intent) No message renders under a field; a toast shows instead. Disproof: the same scope decision; no field exists until 4.8.
  - `[low]` `[reject]` (intent) "The section" is always `/`, not the section the user came from. Only reached by typing the address: the toast's Edit always targets a held Book, and `/` is the fallback there. Leaving through history would add a branch.
  - `[false]` `[reject]` (intent) The story was built despite the `oversized` warning. Disproof: Mika dismissed acting on `oversized` (4.15 owner follow-up, 2026-10-21).
  - `[low]` `[reject]` (intent) `editBookAction`'s input validation is untested. It only asks for a test and names no acceptance criterion or spine rule (CLAUDE.md tests rule).
  - `[low]` `[reject]` (verification) No test runs `editBookAction`'s guard. Same reason as above; `editBook()` behind it is covered by `editBook.int.spec.ts`.
  - `[low]` `[patch]` (verification) Back then Discard is not exercised. Fix: a new case, Back with a draft, then Discard, lands on `/` with storage cleared.
  - `[low]` `[patch]` (verification) Back with an empty draft is not exercised. Fix: the clean X case now asserts that no guard entry was pushed.
  - `[low]` `[reject]` (verification) Malformed stored drafts are untested. Only corrupted storage reaches this, and the finding only asks for a test, naming no acceptance criterion.
  - `[medium]` `[patch]` (blind) After a reload, or after `UNAUTHENTICATED` replaces the entry with `/login` and sign-in returns, the guard entry becomes the task base, so Save and Discard land on the old Edit book entry. Fix: `TaskBase` subtracts the current entry's overlay tokens; on `UNAUTHENTICATED` the guard is popped first and sign-in is reported from its `onClosed`.
  - `[low]` `[patch]` (blind) `draft` is a `useMemo` with no setter, so the doc's "store with `writeDraft`" would never update `dirty`. Fix: the doc comment now says 4.8 turns the restored draft into state.
  - `[low]` `[reject]` (blind) Marks are write-only, and a later failure other than `VALIDATION` clears them. No field reads marks until 4.8 (the owner's scope), so nothing is visible.
  - `[medium]` `[patch]` (blind) On wide screens an error toast covers the pinned Save. Fix: the foot carries `data-pinned-wide`, and the toast region rises above it on wide screens too.
  - `[low]` `[reject]` (blind) Save closes with no slide-away. Cosmetic, and matching it needs a new `FullScreenTask` API.
  - `[low]` `[reject]` (blind) Save with no changes still makes a round trip and shows "Saved". Harmless and true: `editBook()` writes nothing for an empty edit.
  - `[low]` `[reject]` (blind) `NOT_FOUND` on Save leaves a draft that can never be saved. It needs the copy removed, or the Book made private, while the screen is open. Discard clears it, and a fix adds a branch.
  - `[low]` `[reject]` (blind) A restored draft is not compared with the Book's current values. It needs another edit to the same Book during a sign-in round trip; the last save winning is acceptable.
  - `[low]` `[reject]` (blind) The page's not-held mapping is untested. `requireOwnBook` has integration tests, and a page test is more than a direct correction.
  - `[low]` `[reject]` (blind) The two `isPlainObject` helpers disagree on null prototypes. `JSON.parse` never yields a null-prototype object, so the difference never shows.
  - `[low]` `[reject]` (blind) The unit tests rely on a 50 ms settle and on module state. Each close test waits for its traversal, and the settle only covers `traverseBack`'s single frame.
  - `[false]` `[reject]` (blind) The story was built despite `oversized`. Disproof: duplicate of the intent row; the owner dismissed it.
  - `[low]` `[patch]` (edge) If Discard is chosen before the Save request returns, the late success navigates back from the section. Fix: `closeTask` runs only while mounted.
  - `[medium]` `[patch]` (edge) A reload on the guard entry makes it the task base. Grouped with the reload and sign-in entry above.
  - `[medium]` `[patch]` (edge) The `UNAUTHENTICATED` replace lands on the guard entry. Grouped with the reload and sign-in entry above.
  - `[low]` `[reject]` (edge) Opened directly (base 0) with a draft, `replace('/')` replaces only the guard entry. Back from `/` then shows a clean Edit book; a fix changes the shared `useCloseTask`.
  - `[low]` `[patch]` (edge) `isbn13: null` is marked `VALIDATION` instead of `INVALID_ISBN`. Fix: the action no longer type-checks `isbn13`, and `editBook()` maps it.
  - `[low]` `[reject]` (edge) A wrongly typed key hides the other rejections until the next Save. Rare, and merging both checks adds complexity.
  - `[low]` `[patch]` (edge) An all-digit id above the int4 maximum gives an error page. Fix: the page also bounds the id to 2147483647.
  - `[low]` `[patch]` (edge) `setEdit` with `undefined` keeps the key, holding `undefined`. Fix: `undefined` now drops the key.
  - `[low]` `[reject]` (edge) A stored draft with wrongly typed values makes every Save fail. Only corrupted storage reaches this, and Discard clears it.
  - `[false]` `[reject]` (edge) The sticky foot hides content. Disproof: the foot is in flow (sticky, not fixed), so the end of the content always scrolls clear of it; overlap mid-scroll is what "pinned" means.
  - `[false]` `[reject]` (edge) `TaskBase` does not make Save and Discard leave the whole task. Disproof: the reload and sign-in cases are the medium entry above (patched); the direct-open case is the rejected base-0 row.

## Design Notes

**Back guard.** While the draft is not empty, `useCloseOnBack` keeps one same-URL entry above the task's own. Back pops it and opens the dialog; that pause disarms the guard. Cancel re-arms it in the dialog's `onClosed`, never earlier: pushing before the dialog's own pop lands would make that pop take the guard entry. When Discard comes from the X, the guard entry is still there, and `useCloseTask` steps over it from `taskBase`.

**"Not in library"** is a notice, not a failure, so it uses the toast's `success` kind with a message. There is no `ErrorCode` for it, and adding one would change the spine's list.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including `editBookScreen.unit.spec.ts`
- `npm run test:int` -- expected: all pass (unchanged)

**Manual checks (if no CLI):**
- In dev, open `/books/<held id>/edit` on the phone and on wide widths: the layout and pinned Save. Open `/books/999999/edit`: the toast "Not in library" over Collection.

## Auto Run Result

Status: done

**Summary:** Edit book now has its page at `/books/[bookId]/edit`, a full-screen task showing the cover, title, author line and source line, with Save pinned at the bottom. Scope is machinery only (Mika, 2026-10-21): no field is editable yet. 4.8 adds the fields, which turn the restored draft into state with `setEdit` and `writeDraft` and show their marks.
- **Save:** it sends the per-Book `sessionStorage` draft through the new `editBookAction` (input type guard, then `editBook()` unchanged), shows "Saved" and leaves the task.
- **Sign-in:** `UNAUTHENTICATED` keeps the draft. The Back guard's entry is popped before going to sign in, so the return lands on the task's own entry.
- **Leaving with changes:** X and Back ask "Discard changes?". Back is guarded by one same-URL entry (`useCloseOnBack`); Cancel re-arms it, and Discard clears the draft and leaves.
- **Not held:** a Book the user doesn't hold (or a bad or out-of-range id) shows the toast "Not in library" and replaces the address with `/`.

**Files changed:**
- `src/app/(frontend)/books/[bookId]/edit/page.tsx`: the route: gate, effective read, not-held branch.
- `src/app/(frontend)/books/[bookId]/edit/layout.tsx`: `TaskBase` for the task.
- `src/app/(frontend)/books/[bookId]/edit/EditBookScreen.tsx`: the screen, Save, the Back guard and the Discard dialog.
- `src/app/(frontend)/books/[bookId]/edit/NotHeld.tsx`: the "Not in library" toast and the replace to `/`.
- `src/app/(frontend)/books/[bookId]/edit/actions.ts`: `editBookAction` with the input type guard.
- `src/app/(frontend)/books/[bookId]/edit/draft.ts`: the draft store and `setEdit`.
- `src/app/(frontend)/components/FullScreenTask.tsx`: the optional `foot` (pinned on every width) and the `onClose` interception.
- `src/app/(frontend)/components/navigation.ts`: `TaskBase` leaves out overlay entries on the entry it records (a reload on a guard).
- `src/app/(frontend)/components/toast/ToastProvider.tsx`: on wide screens the toast rises above a `data-pinned-wide` foot.
- `messages/en.json`, `messages/fi.json`: four `editBook.*` keys.
- `tests/unit/editBookScreen.unit.spec.ts`: 8 cases, at least one per matrix row.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.7 is done.
- `_bmad-output/implementation-artifacts/epic-4-context.md`: rebuilt from the current planning docs.

**Review findings:** 32 in total (4 medium, 22 low, 6 false).
- 9 patch entries, holding 11 findings:
  - medium: the guard entry left behind by a reload or the sign-in round trip (3 findings); a wide-screen toast over Save.
  - low: the misleading doc comment on the draft; a late Save success navigating back from the section; `isbn13` checked in the action; the id bounded to int4; `setEdit` with `undefined`; tests for Back then Discard and for a clean Back.
- 0 deferred.
- 21 rejected; the reason for each is in the Review Triage Log:
  - 6 false: the scope decision (twice); `oversized`, dismissed by the owner (twice); the sticky foot; the `TaskBase` claim.
  - 15 low: test-only findings that name no criterion; the no-op Save; `NOT_FOUND` on Save; restored drafts not compared with the Book; marks being write-only; no slide-away on Save; the base-0 replace; the not-held target; and others.

**Follow-up review recommended:** true. Two medium entries were patched (patched by verdict: high 0, medium 2, low 7). The unverified risk is the history handling, which no real browser has checked:
- a reload on the guard entry, and the sign-in round trip (`TaskBase` arithmetic, the guard popped before `/login`);
- the wide-screen toast offset.

The unit tests use jsdom history only.

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. All 40 warnings are pre-existing, in `src/migrations`.
- `npm run test:unit`: 714 passed.
- `npm run test:int`: 449 passed.
- Not checked in a browser: the dev server on :3000 was a standalone build from another worktree.

**Residual risks:**
- The layout and the pinned Save at phone and wide widths, and `/books/<id>/edit` for a held and an unheld Book, still need a look in dev.
- Opened directly (no in-app history) with a draft, Save replaces only the guard entry with `/`, so Back from `/` shows a clean Edit book again.
