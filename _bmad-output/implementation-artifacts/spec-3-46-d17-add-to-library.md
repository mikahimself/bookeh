---
title: 'Story 3.46: [D17] Add to library'
type: 'feature'
created: '2026-10-20'
baseline_revision: '9a57a7fe3beb99f5406ecd93cc0608918bbea42c'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      No test renders the /scan page wiring: AddToLibrary on the Answer and DismissToast only in the Answer branch.
    evidence: |-
      Moving DismissToast into the Scan branch would make "Saved to …" flash and vanish, and dropping AddToLibrary would pass every test, because only the components are unit-tested. Story 3.52's Playwright scan-to-save is the surface for this. It should also assert that the toast is still on Scan after the save and is gone when the next Answer opens.
    location: >-
      src/app/(frontend)/scan/page.tsx
    severity: low
---

<intent-contract>

## Intent

**Problem:** The Not in library Answer (3.45) only offers Back. Nothing on the frontend calls `saveCopy`, so a scanned book cannot be added to the library.

**Approach:** Give the Answer a primary **Add to library** button. It calls a new `saveCopyAction` with a client-generated `requestId` and the Answer's ISBN. On success it raises a held "Saved to {location}" / "Saved" toast and returns to Scan. On failure it raises an error toast and the Answer stays. The next Answer to open dismisses the held toast.

## Boundaries & Constraints

**Always:**
- **Action.** `saveCopyAction(input: unknown)` lives in `src/app/(frontend)/scan/actions.ts`, because only one page uses it (spine, Service naming). It runs inside `runAction()` and starts with `requireUserOrThrow()`. `input` must be `{ requestId: string; isbn13: string }`; any other shape is `DomainError('VALIDATION')`. It calls `saveCopy(ctx, { requestId, target: { isbn13 }, save: { kind: 'copy' } })` and returns its result unchanged (`Undoable<SaveResult>`: `savedTo`, `undoToken`, `undoSeconds`). Every failure except `UNAUTHENTICATED` is returned as `{ ok: false, code: 'SAVE_FAILED' }`; the `runAction()` log line for `INTERNAL` still happens.
- **New error code.** `SAVE_FAILED` joins `ErrorCode` in `src/lib/errors.ts` as a server code (it sits with `UNDO_FAILED`, not in the client-only group). Strings: `errors.SAVE_FAILED` "Couldn't save. Try again." / "Tallennus ei onnistunut. Yritä uudelleen."
- **The ISBN.** `NotInLibrary` gains `isbn13: string`. For `source` it is the picked draft's `isbn13`. For `existing` it is `book.isbn13`, and `notInLibrary` returns `null` when that is `null`: the lookup found the Book by that ISBN, so this cannot happen.
- **Client.** `AddToLibrary` (client, `src/app/(frontend)/scan/AddToLibrary.tsx`) is a `primary` Button labelled `answer.addToLibrary` ("Add to library" / "Lisää kirjastoon"). It is disabled while its transition is pending. A ref guard drops a tap while a save is in flight, so a double tap makes one call. The `requestId` is a ref, created with `crypto.randomUUID()` on the first tap and reused on every retry after a failure. A response lost to `NO_CONNECTION` after the server saved therefore returns the first result. The ref is cleared after a success, so a revived instance does not reuse it.
- **On success.** `show({ kind: 'success', message, hold: true })`. The message is `toast.savedTo` "Saved to {location}" / "Tallennettu · {location}" with `savedTo.name`, or `toast.saved` "Saved" / "Tallennettu" when `savedTo` is `null`. Then return to Scan with `useTaskBack('/scan')`, but only while the Answer is still mounted. If the user already left with Back or X, the toast shows and nothing navigates.
- **On failure.** `useReportFailure()`: `UNAUTHENTICATED` goes to sign in, and every other code is an error toast with its own message. So `SAVE_FAILED` shows "Couldn't save. Try again.", `NO_CONNECTION` "No connection." (EXPERIENCE.md, Action with no connection), and `APP_UPDATED` the Reload toast. The Answer stays exactly as it was, and the button is enabled again.
- **Toast lifetime.** A new `DismissToast` client component in `components/toast/` renders `null` and calls `dismiss()` on mount. The `/scan` page renders it inside the Answer branch, so the next Answer to open removes the held save toast. A Scan render (invalid ISBN, rate limit, kinds with no Answer yet) leaves the toast.
- **Layout.** At the Answer's foot, a `flex flex-col gap-2` group holds Add to library above Back. Both are full width, as in the key-scan-phone mockup; Add to library is the one primary.
- Strings go in both `messages/en.json` and `messages/fi.json`.

**Never:**
- No Undo or Edit Link on the toast (3.47 and Epic 4). The action still returns the token, and the client ignores it.
- No Add to wishlist (7.14), no `pick` (3.53), no Add another copy (3.48), no manual target (3.49).
- No change to `saveCopy` or any other `lib` service, to the scan-loop reading rules (3.51), or to the lookup.
- No Playwright spec (3.52). No `router.refresh()` or `revalidatePath`, since a re-render of `/scan?isbn=` would spend a lookup.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Save with default location | default location "Tampere" | one owned copy; toast "Saved to Tampere" (held); back on Scan | — |
| Save without default | no default location | toast "Saved"; back on Scan | — |
| Double tap | two clicks before the first call settles | one `saveCopyAction` call | ref guard |
| Server failure | `saveCopy` throws (sources unavailable, DB error, `NOT_FOUND`) | error toast "Couldn't save. Try again."; Answer unchanged; button enabled | action returns `SAVE_FAILED` |
| Retry after failure | tap again | same `requestId` sent again | — |
| No connection | action call rejects with `TypeError` | toast "No connection."; Answer unchanged | `settleAction` |
| Signed out | action returns `UNAUTHENTICATED` | to `/login?next=/scan?isbn=…` | `reportFailure` |
| Bad input | `saveCopyAction({ isbn13: 5 })` | `{ ok: false, code: 'SAVE_FAILED' }`; nothing written | `VALIDATION` mapped |
| Left during save | Back tapped while the save runs | toast shows; no second navigation | mounted ref |
| Next Answer | held save toast, then another ISBN gives an Answer | toast dismissed when the Answer mounts | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/page.tsx` -- server page. Its Answer branch renders `FullScreenTask` + `NotInLibraryAnswer`; add `<DismissToast />` there. The Scan branch is unchanged.
- `src/app/(frontend)/scan/answer.ts` -- `NotInLibrary` and `notInLibrary()`; add `isbn13`. `Draft.isbn13` exists (used for `coverUrl`). `EffectiveBook.isbn13` is `string | null` (`src/lib/books/effectiveBook.ts:22`).
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx` -- server component. It ends with `<AnswerBack label=…/>` in a `gap-6` column. Replace that with the foot group: `<AddToLibrary isbn13=… />` then `<AnswerBack/>`.
- `src/app/(frontend)/scan/AnswerBack.tsx` -- `useTaskBack('/scan')` from `components/navigation.ts:206`. It shares the module's `closing` guard with `useCloseTask`, and it is also what returns to Scan after a save.
- `src/app/(frontend)/components/SignOutButton.tsx` -- the pattern to follow: `useTransition` + `settleAction(action())` + toast. Use `useReportFailure()` from `components/request.ts` instead of a bare `show`.
- `src/app/(frontend)/components/request.ts` -- `settleAction`, `useReportFailure`. Read-only.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- `useToast()` gives `{ show, dismiss }`. `store.ts`: `hold: true` means no timer. Read-only.
- `src/app/(frontend)/components/toast/RaiseToast.tsx` -- sibling pattern for `DismissToast`.
- `src/app/(frontend)/actions/undo.ts`, `actions/account.ts` -- action shape: `'use server'`, `runAction`, `requireUserOrThrow`, validate `unknown` input.
- `src/lib/catalogue/saveCopy.ts` -- `saveCopy(ctx, SaveInput): Promise<Undoable<SaveResult>>`, `SaveResult = { bookId; copyId; savedTo: Named | null }`. It normalises `target.isbn13` itself and dedupes `requestId` per user (`saveRequests.ts`; 1–64 chars, else `VALIDATION`). Read-only.
- `src/lib/errors.ts:6-19` -- the `ErrorCode` union; `runAction` maps thrown errors to failures.
- `messages/en.json`, `messages/fi.json` -- the `errors`, `toast` and `answer` groups. `tests/unit/messages.unit.spec.ts` checks parity.
- `tests/int/undoAction.int.spec.ts` -- harness for an action int test: mock `next/headers`, log in, set the `payload-token` cookie header.
- `tests/unit/signOutButton.unit.spec.ts` -- jsdom pattern: mock `next-intl`, `next/navigation`, the action module and `useToast`.
- `tests/unit/answer.unit.spec.ts` -- the existing `notInLibrary` cases; extend them for `isbn13`.

## Tasks & Acceptance

**Execution:**
- `src/lib/errors.ts` -- add `'SAVE_FAILED'` beside `'UNDO_FAILED'` -- the save's one failure message.
- `messages/en.json`, `messages/fi.json` -- add `errors.SAVE_FAILED`, `toast.savedTo`, `toast.saved` and `answer.addToLibrary` with the strings above.
- `src/app/(frontend)/scan/actions.ts` -- new `saveCopyAction` as specified.
- `src/app/(frontend)/scan/answer.ts` -- add `isbn13` to `NotInLibrary`; return `null` for an `existing` Book without one.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- new client button as specified (guard, `requestId` ref, mounted ref, toast, back).
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx` -- the foot group with AddToLibrary and Back.
- `src/app/(frontend)/components/toast/DismissToast.tsx` -- new; `dismiss()` on mount, renders `null`.
- `src/app/(frontend)/scan/page.tsx` -- render `<DismissToast />` in the Answer branch.
- `tests/int/saveCopyAction.int.spec.ts` -- signed in with a shared Book already holding the ISBN (no sources needed): the action returns `ok` with `savedTo` and one copy exists. A repeated `requestId` leaves one copy. Malformed input gives `SAVE_FAILED` with nothing written. No session gives `UNAUTHENTICATED`.
- `tests/unit/addToLibrary.unit.spec.ts` -- (jsdom) success shows the held "Saved to …" or "Saved" toast and goes back. A double click calls the action once. `SAVE_FAILED` shows the error toast, does not navigate and re-enables the button. A retry sends the same `requestId`. A rejection gives `NO_CONNECTION`. After an unmount mid-save there is no navigation.
- `tests/unit/raiseToast.unit.spec.ts` -- add: `DismissToast` calls `dismiss()` once on mount.
- `tests/unit/answer.unit.spec.ts` -- `isbn13` for `source` and `existing`; `null` for an `existing` Book without an ISBN.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 3.46 `done` when finished.

**Acceptance Criteria:**
- Given the Not in library Answer, when the user taps Add to library, then one owned copy is saved at the default location, Scan shows with an empty field, and the toast reads "Saved to {location}" (or "Saved").
- Given the save toast on Scan, when no Answer opens, then the toast stays with no timer. When the next Answer opens, the toast goes.
- Given a save that fails on the server, when the user taps Add to library, then the toast reads "Couldn't save. Try again." and the Answer is still on screen and can be tapped again.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 24 findings — high 0, medium 1, low 15, false 8, maybe-false 0
- findings:
  - `[false]` `[reject]` Intent: return to Scan waits for the server round trip instead of happening "at once". The AC requires a failed save to leave the Answer as it was, so the client has to wait for the result before it leaves. "At once" in the walkthrough means no review step.
  - `[low]` `[reject]` Intent: the 20 s phone NFR is not exercised. It is a manual check left to the owner on the phone. No code here bears on it beyond one tap.
  - `[false]` `[reject]` Intent: a double tap across a remount gets a new id. A remount between two taps of one double tap cannot happen; the in-instance guard plus server `requestId` dedupe cover the AC.
  - `[false]` `[reject]` Intent: literal "any failed save shows Couldn't save". EXPERIENCE.md gives "No connection." and the Reload toast their own rows. `SAVE_FAILED` covers every server-side failure (Design Notes).
  - `[low]` `[reject]` Intent: the int test never hits a real source or database failure. Folding is code-agnostic: `INVALID_ISBN` thrown inside `saveCopy` already proves a non-`VALIDATION` failure is folded. Simulating a source outage adds a mock layer for no new path.
  - `[low]` `[patch]` Intent: `DismissToast` removes any toast, not only the save toast. The behaviour is acceptable (one toast at a time; the next Answer replaces it). The comment overstated it. Patched: the `page.tsx` comment now says the next Answer removes the toast on screen.
  - `[false]` `[reject]` Intent: no Edit or Undo on the toast. Excluded by the epics split: Undo is 3.47, Edit is Epic 4.
  - `[false]` `[reject]` Intent: `notInLibrary` returns `null` for an `existing` Book without an ISBN. Unreachable: `lookupBook` finds that Book by its ISBN.
  - `[low]` `[reject]` Intent: uncommitted; sprint `done` while the spec says `in-review`. Finalization sets the spec to `done` and commits both together.
  - `[low]` `[defer]` Verification gap: no test renders the `/scan` page wiring (AddToLibrary on the Answer, DismissToast only in the Answer branch). Playwright scan-to-save is 3.52's. Deferred there, with the toast-survives-and-goes check named.
  - `[low]` `[patch]` Verification gap: the signed-out path is not tested at AddToLibrary. Patched: a unit case with `UNAUTHENTICATED` asserts `replace('/login?next=…')`, and no `back` or `show`.
  - `[low]` `[patch]` Blind: no progress line while a save is in flight (EXPERIENCE.md, Progress line: "lookup, save or next page"). Patched: AddToLibrary renders `ProgressLine` while pending, as ScanScreen does.
  - `[medium]` `[patch]` Blind: after a success the button is live again before `back()` has left the Answer. A `router.replace('/scan')` is a server round trip, and a tap in that gap saves a second copy. Patched: `inFlight` stays latched after a success and is released in the mount effect's cleanup (unmount or Activity hide). The retry test now checks that a press after a success makes no call and that a revived instance saves with a new id.
  - `[low]` `[reject]` Blind: browser Forward restores the stale Answer, and its button saves another copy. It needs a Forward traversal, which the installed PWA on the phone has no control for. The second copy takes a deliberate press, and the fix (replacing history or refreshing the entry) touches 3.45's history model.
  - `[low]` `[patch]` Blind (same root as the Intent `DismissToast` row): `DismissToast` clears every toast, not only the held save toast. Patched by the same comment correction.
  - `[low]` `[patch]` Blind: folding into `SAVE_FAILED` drops non-`INTERNAL` codes without a log line. Patched: the action logs `logger().warn({ code })` before folding any code but `INTERNAL`.
  - `[low]` `[patch]` Blind: the double-tap test never reached the ref guard, because `disabled` blocked the second click. Patched: both clicks fire inside one `act()`. The implementer confirmed the test fails without the guard.
  - `[low]` `[reject]` Blind: the sprint says `done` while the spec says `in-review`. Same as the Intent process row; finalization aligns them in one commit.
  - `[false]` `[reject]` Blind: `useEffect(() => dismiss())` would make `dismiss`'s return value the cleanup. `dismiss` is typed `() => void` and returns `undefined`, and `RaiseToast` uses the same form.
  - `[medium]` `[patch]` Edge (same root as the Blind latch row): a second tap during navigation after a success saves a duplicate. Patched by the same latch.
  - `[low]` `[reject]` Edge: a missing `crypto.randomUUID` (non-secure origin) leaves `inFlight` stuck. The app runs only over HTTPS (`tailscale serve`) or on localhost, both secure contexts. The camera needs a secure context too, so a non-secure origin is unsupported.
  - `[low]` `[reject]` Edge: a save that resolves after the user left (X to a section, or another Answer already open) raises a held toast there. It needs the save to outlast a Back or X plus another navigation, a sub-second window. The suggested `hold: mounted` would also un-hold the toast on Scan after Back, which the spec wants held.
  - `[low]` `[defer]` Edge: after X closes the scan task, the held save toast stays with no timer on the section. This matches EXPERIENCE.md read literally ("stays until the next Answer opens"), and the toast has a close. Whether leaving the task re-times it is the owner's UX call and needs a store API. Deferred.
  - `[low]` `[reject]` Edge: a lost-answer retry after the server's 10-minute `requestId` window saves again. It needs a dropped response followed by more than ten minutes on the same Answer before a retry. Then a second copy is visible and the user can undo it.

## Design Notes

**Why `SAVE_FAILED`.** EXPERIENCE.md names "Couldn't save. Try again." as the failed-save wording and says failure messages come from `errors.<CODE>`. `INTERNAL` reads "Didn't work. Try again.", so the save needs its own code, as Undo has `UNDO_FAILED`. The action folds every server-side failure into it: to the person scanning, a missing source answer, a stale Book or a bad request all mean "try again". The client-only codes keep their own wording, because EXPERIENCE.md gives "No connection." and the Reload toast their own rows.

**requestId per press series.** If the id were generated on mount, a revived instance would reuse it. The router can keep a page segment under Activity, and an id that is still remembered would make a second save of the same ISBN return the first, possibly undone, result. A lazily created id, cleared after a success, covers both double taps and retries without depending on remount behaviour.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: 0 errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass (Postgres on 5434)

**Manual checks:**
- `npm run dev` against the 5434 database, signed in, with a default location set. On `/scan?isbn=978-951-0-39707-7`, tap Add to library: Scan shows "Saved to …". Submit another fixture ISBN: the toast goes when its Answer opens. Under 20 s per book on the phone is checked by the owner (NFR-2).

## Auto Run Result

**Summary:** The Not in library Answer now has a primary **Add to library** button above Back. It calls the new `saveCopyAction` with the Answer's ISBN and a client `requestId`. That id is made on the first tap, reused on retries after a failure, and dropped after a success.
- **On success:** the button raises a held toast, "Saved to {location}" or "Saved", and returns to Scan with `useTaskBack('/scan')`. It stays latched until the Answer is gone, so a tap during the navigation cannot save a second copy.
- **On failure:** the action folds every server failure except `UNAUTHENTICATED` into the new `SAVE_FAILED` ("Couldn't save. Try again."), logging the original code. "No connection.", the Reload toast and the sign-in redirect keep their own handling. The Answer stays as it was.
- **While saving:** the progress line runs.
- **Toast lifetime:** the next Answer to open dismisses the toast through `DismissToast`.

**Files changed:**
- `src/lib/errors.ts`: the `SAVE_FAILED` code.
- `src/app/(frontend)/components/toast/flashCookie.ts`: `SAVE_FAILED` in the exhaustive code list.
- `messages/en.json`, `messages/fi.json`: `errors.SAVE_FAILED`, `toast.savedTo`, `toast.saved`, `answer.addToLibrary`.
- `src/app/(frontend)/scan/actions.ts` (new): `saveCopyAction`.
- `src/app/(frontend)/scan/AddToLibrary.tsx` (new): the button, with its guard and latch, the `requestId` ref, the toast, the return to Scan and the progress line.
- `src/app/(frontend)/scan/answer.ts`: `isbn13` on `NotInLibrary`.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx`: the foot group, Add to library above Back.
- `src/app/(frontend)/components/toast/DismissToast.tsx` (new), mounted in the Answer branch of `src/app/(frontend)/scan/page.tsx`.
- Tests:
  - `tests/int/saveCopyAction.int.spec.ts` and `tests/unit/addToLibrary.unit.spec.ts` are new.
  - `answer.unit.spec.ts`, `raiseToast.unit.spec.ts` and `messages.unit.spec.ts` are extended.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.46 done.

**Review findings:** 24 in total (medium 1, low 15, false 8).
- **Patched, 6 entries:**
  - the latch after a success (medium; Blind and Edge);
  - the progress line during a save;
  - logging the folded code;
  - the `DismissToast` comment (Intent and Blind);
  - a double-tap test that reaches the ref guard;
  - a signed-out test at the button.
- **Deferred, 2:**
  - page-wiring coverage, to 3.52's Playwright;
  - the held toast after X closes the task, a UX call for the owner. Mika decided it on 2026-10-20: leaving Scan gives it the usual 8 s. Done in a follow-up commit: `release()` on the toast store, `ReleaseHeldToast` in the scan layout, and EXPERIENCE.md's Toast row amended.
- **Rejected, with reasons in the triage log:**
  - waiting for the save before leaving (the AC requires it on failure);
  - the 20 s NFR (manual);
  - a double tap across a remount;
  - the literal "any failure" reading;
  - an int test of a source outage;
  - Edit and Undo (3.47, Epic 4);
  - the null-ISBN branch (unreachable);
  - sprint status vs. spec status (aligned at commit; two rows);
  - Forward restoring a stale Answer;
  - `useEffect` returning `dismiss()`;
  - a missing `randomUUID` on a non-secure origin;
  - a toast after leaving mid-save;
  - a retry after the 10-minute window.

**Follow-up review recommended:** false. Patched counts by verdict: high 0, medium 1, low 5.

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (36 warnings, all in migrations, pre-existing).
- `npm run test:unit`: 592 passed. `scanScreen`'s first barcode test timed out in two full runs and passed on re-run and in isolation; this is the known flake under parallel worktrees.
- `npm run test:int`: 358 passed, 1 skipped (Postgres on 5434).
- The manual dev-server check was not run.

**Residual risks:**
- Not run in a browser:
  - the real return to Scan, through `history.back` or `replace`;
  - the toast surviving it and going when the next Answer opens;
  - the progress line;
  - the 20 s phone flow.
- After a save, browser Forward can restore the stale Answer (rejected as rare).
