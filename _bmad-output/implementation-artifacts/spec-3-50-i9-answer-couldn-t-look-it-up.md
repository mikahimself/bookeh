---
title: "Story 3.50: [I9] Answer: couldn't look it up"
type: 'feature'
created: '2026-10-20'
baseline_revision: 'e776dca05d4155fedb4e910fe5c57f77e0ce1a39'
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

**Problem:** When a source fails or times out and nothing in the library has the ISBN, `lookupBook` returns `{ kind: 'unavailable', failed }`, but `answerFor` turns it into Scan with no word. The person cannot tell an outage from a mistyped scan, and cannot retry or add the book (AD-9: an outage is never reported as "no such book").

**Approach:** Add a **Couldn't look it up** Answer (mockup U2 in `mockups/examples-unavailable.html` and `key-scan-phone.html`). It names the sources that did not answer and the ISBN, offers **Try again** (primary) and **Back**, and an **Add by hand** Link. Try again re-renders the same address on the server, so the lookup runs once more. Add by hand unfolds the Not found form (`NotFoundForm`) in place.

## Boundaries & Constraints

**Always:**
- **Outcome.** `ScanOutcome` gains `{ kind: 'unavailable'; isbn13: string; failed: SourceId[] }`. `answerFor` maps an `unavailable` lookup to it, with `isbn13: normaliseIsbn(isbn)` as for `notFound`, and `failed` in the order the lookup gave. Update `answerFor`'s doc comment and the page's (no "until Story 3.50", no "couldn't look it up" among the Answers still to come).
- **Page.** The existing Answer branch takes the heading from `answer.${outcome.kind}` and keeps `DismissToast`. Add the `unavailable` arm rendering `<UnavailableAnswer isbn13 failed />`.
- **Answer body** (`UnavailableAnswer`, server component, no `AnswerLayout`): a muted `text-meta text-text-muted` line `answer.noAnswer`, with `sources` = the failed ids' labels from the `sources` catalogue (the id itself when it has no label, as in `AnswerLayout`), joined by `getFormatter().list(…, { type: 'conjunction' })` ("Finna and Google Books", "Finna ja Google Books"), `count` = the number of failed sources, and `isbn` = the 13 digits as stored. Then the client `UnavailableActions({ isbn13 })`. Layout `flex flex-col gap-6`, as `NotFoundAnswer`.
- **Actions** (`UnavailableActions`, client): folded, an `ActionLink` "Add by hand" (`answer.addByHand`), then the foot (`flex flex-col gap-2`): **Try again** (`answer.tryAgain`, `variant="primary"`) above `AnswerBack`. Try again calls `router.refresh()` inside `startTransition`; while pending, the `ProgressLine` (`progress.loading`) shows and Try again is disabled. Unfolded (after Add by hand), the Link and the foot are replaced by `<NotFoundForm isbn13={isbn13} title="" />`: Title (focused), Author, Add to library (primary) and Back. It does not fold back.
- **Strings** in `messages/en.json` and `fi.json`:
  - `answer.unavailable`: "Couldn't look it up" / "Haku ei onnistunut"
  - `answer.noAnswer`: "{sources} didn't answer. {isbn} may still be known." / "{count, plural, one {{sources} ei vastannut.} other {{sources} eivät vastanneet.}} {isbn} voi silti löytyä."
  - `answer.tryAgain`: "Try again" / "Yritä uudelleen"
  - `answer.addByHand`: "Add by hand" / "Lisää käsin"

**Never:**
- No change to `lookupBook`, `lookupSources`, the cache, the breaker, `saveCopy`, `saveManualAction` or `NotFoundForm`'s behaviour.
- No client-side lookup request or new route: Try again re-renders the server page (the browser makes no lookup request).
- No Try again on the unfolded form (one primary per layer; the form brings its own Back). No Add to wishlist (Epic 7). No Playwright spec (3.52).
- `pick` is ignored for this Answer (there are no candidates).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Both silent | `/scan?isbn=951-0-12345-X`, lookup `unavailable` `['finna','google']` | heading "Couldn't look it up"; "Finna and Google Books didn't answer. 978… may still be known."; Add by hand; Try again (primary), Back | — |
| One silent | `failed: ['finna']` | "Finna didn't answer. …" (fi: "Finna ei vastannut. …") | — |
| Try again, recovered | sources answer on the retry | the same address now renders Not in library / Not found; no new history entry | — |
| Try again, still down | sources still fail | the same Answer again; progress line while it runs | — |
| Try again, rate-limited | lookup refused `RATE_LIMITED` | Scan with the ISBN in the field and the rate-limit toast (existing behaviour) | — |
| Add by hand | tap the Link | Title (focused) and Author, Add to library, Back; Try again gone | — |
| Save by hand | both fields typed | a private Book with the ISBN and an owned copy, held save toast with Undo, back on Scan — as Not found | as Not found |
| In library | the viewer holds the Book, sources down | In library (lookup returns `existing` before asking sources) | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/answer.ts:244-281` -- `ScanOutcome` and `answerFor`; `unavailable` currently falls to `notInLibrary` → null → `{ kind: 'scan' }`. Add the arm next to the `none` one. `SourceId` is `string`, from `@/lib/metadata/source`.
- `src/lib/catalogue/lookupBook.ts:46` -- `{ kind: 'unavailable'; failed: SourceId[] }`; only reached when no Book with the ISBN is readable. Read-only.
- `src/lib/metadata/lookup.ts:113-130` -- `unavailable` only when no source had records and at least one failed (so `failed` is never empty); never cached, so a refresh asks again. Read-only.
- `src/app/(frontend)/scan/page.tsx` -- Answer branch picks the component by `outcome.kind`; add the arm; doc comment mentions couldn't look it up as still to come.
- `src/app/(frontend)/scan/NotFoundAnswer.tsx` -- the shape to mirror (server component, muted line, then the client part).
- `src/app/(frontend)/scan/NotFoundForm.tsx` -- reused as is for the unfolded state; it brings `useAddToLibrary`, the field errors, Add to library and `AnswerBack`.
- `src/app/(frontend)/scan/AnswerLayout.tsx:29-33` -- the source label lookup (`sources.has(key) ? sources(key) : undefined`, falling back to the id).
- `src/app/(frontend)/scan/EditionPicker.tsx` -- the `useRouter` + `useTransition` + `ProgressLine` pattern for a server re-render from a client control.
- `src/app/(frontend)/components/Link.tsx` -- `ActionLink` ("A Link that acts in place").
- `src/app/(frontend)/scan/AnswerBack.tsx`, `components/Button.tsx` -- foot buttons.
- `tests/unit/answer.unit.spec.ts:397-401` -- "keeps Scan when a source could not answer"; becomes the `unavailable` outcome case.
- `tests/unit/notFoundForm.unit.spec.ts:1-30`, `tests/unit/editionPicker.unit.spec.ts:1-20` -- mock templates (`next-intl`, `next/navigation`, `navigation`, `actions`, `ToastProvider`) for an `UnavailableActions` test.
- `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-router.md:46` -- `router.refresh()` re-renders server components for the current route and keeps client state.

## Tasks & Acceptance

**Execution:**
- `messages/en.json`, `messages/fi.json` -- the four strings above.
- `src/app/(frontend)/scan/answer.ts` -- the `unavailable` outcome and its `answerFor` arm; doc comment.
- `src/app/(frontend)/scan/UnavailableAnswer.tsx` -- new server component: the line and `UnavailableActions`.
- `src/app/(frontend)/scan/UnavailableActions.tsx` -- new client component: Add by hand, Try again, Back; the unfolded `NotFoundForm`.
- `src/app/(frontend)/scan/page.tsx` -- the `unavailable` arm and doc comment.
- `tests/unit/answer.unit.spec.ts` -- `answerFor` gives `{ kind: 'unavailable', isbn13, failed }` from an ISBN-10 input (proves normalisation), `failed` in order.
- `tests/unit/messages.unit.spec.ts` -- `answer.noAnswer` through `createTranslator` with `sources` joined by `Intl.ListFormat` for the locale: en and fi with one and two sources ("Finna didn't answer.", "Finna ja Google Books eivät vastanneet.", "Finna ei vastannut.").
- `tests/unit/unavailableActions.unit.spec.ts` -- Try again calls `refresh`; Add by hand shows Title and Author and Add to library, removes Try again, and focuses Title.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set 3.50 to `done` when finished.

**Acceptance Criteria:**
- Given an `unavailable` lookup and nothing in my library, when the Answer renders, then the heading is "Couldn't look it up" and the line names the silent sources and the ISBN.
- Given that Answer, when I tap Try again, then the lookup runs once more on the server for the same address, and Back returns to Scan.
- Given that Answer, when I tap Add by hand, then the Not found fields and buttons unfold in place, and a save behaves exactly as on Not found.
- Given the other Answers (In library, Not in library, Not found), when they render, then they look and behave as before.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 12, false 10, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: while a source's breaker is open (60 s after 3 failures), Try again returns at once and the line says it "didn't answer" though it was not asked. Real, but rare, and "didn't answer" is still true for the person. Telling the two apart needs a new outcome from `lookupSources`, which the spec keeps unchanged.
  - `[low]` `[reject]` Blind: disabling the focused Try again during the refresh drops focus, and a still-failing retry looks the same. Same as `AddToLibrary` and `NotFoundForm`, which also disable while pending. A fix needs focus restore and a live region; this is a touch-first phone screen.
  - `[low]` `[reject]` Blind: the source-label lookup and its cast are copied from `AnswerLayout`. Three lines, and both read the same catalogue. A shared helper changes `AnswerText.source`'s `undefined` contract and `answerLines`'s fallback, which is more than a direct fix.
  - `[false]` `[reject]` Blind: `failed: SourceId[]` allows `[]`, which would render an empty line. `lookupSources` returns `unavailable` only when `failed.length > 0` (`lookup.ts:129`), so the empty line cannot happen.
  - `[false]` `[reject]` Blind: sprint status says `done` while the spec is in review. Finalization sets the spec to `done` and commits both together.
  - `[low]` `[reject]` Blind: Try again's pending state (progress line, disabled button) is untested. Same root as the second verification-gap row. Seeing a pending transition needs a `refresh` that suspends, which the jsdom router mock does not give. `EditionPicker` has the same untested pattern.
  - `[low]` `[patch]` Blind: the two-source `noAnswer` cases use `toContain` on the first sentence, so a broken `other` branch that drops the rest would pass. Patched: all four rows assert the full string with `toBe`.
  - `[false]` `[reject]` Blind: Add by hand gives no hint that the sources' record is skipped. The line already says the ISBN "may still be known". The private Book is auto-shared with the source values on the next save once a source knows it (Story 3.39). EXPERIENCE.md asks for the Not found form as is.
  - `[low]` `[patch]` Edge: Add by hand stays enabled during a pending Try again. Unfolding mid-refresh hides the progress line, and a found result then swaps the Answer and discards typed text. Patched: `disabled={pending}` on the ActionLink.
  - `[low]` `[reject]` Edge: Try again past `LOOKUP_LIMIT` (30 per window) drops to Scan with the rate-limit toast and loses Add by hand. Nobody taps Try again 30 times in a window. Keeping the Answer needs a new branch in `answerFor`. The matrix records the existing behaviour.
  - `[low]` `[reject]` Edge (claim): at the rate limit, Try again runs no lookup. Same root as the previous row. The matrix lists "Try again, rate-limited" as Scan with the toast.
  - `[low]` `[reject]` Verification gap: no test renders `UnavailableAnswer`'s arguments to `noAnswer` (`count`, labels, list join). The repo has no render harness for async server components (none for `NotFoundAnswer` or `AnswerLayout` either). Pulling the argument building into a helper only for a test is more structure than this story needs. The message itself is tested in both locales.
  - `[low]` `[reject]` Verification gap: Try again's pending state is untested. Same root and reason as the Blind pending-state row.
  - `[false]` `[reject]` Intent: in library over an outage is not shown at this surface. `lookupBook` answers `existing` before asking the sources, and a shared Book never calls them (`lookupBook.int.spec.ts:122`). This diff does not touch that.
  - `[low]` `[reject]` Intent: the messages test builds its own `Intl.ListFormat`, and the heading is never rendered. Same root and reason as the first verification-gap row. The heading key is type-checked against `Messages`.
  - `[low]` `[reject]` Intent: Try again proves the refresh, not that the sources are asked again. `unavailable` is never cached (`lookup.unit.spec.ts:110-116`). The breaker part is the same root as the Blind breaker row.
  - `[false]` `[reject]` Intent: saving through the unfolded form is not exercised here. The unfolded state is `NotFoundForm` unchanged, which the test asserts renders. Its save is covered by `notFoundForm.unit.spec.ts` and `saveCopyAction.int.spec.ts`.
  - `[false]` `[reject]` Intent: Back is not tested in this diff. `AnswerBack` is reused unchanged.
  - `[low]` `[reject]` Intent: the page arm and `UnavailableAnswer` are not exercised. Same root and reason as the first verification-gap row (3.49 reached the same decision).
  - `[false]` `[reject]` Intent: the "{isbn} may still be known." clause goes beyond the AC. It is mockup U2's line, and the auditor found no conflict.
  - `[false]` `[reject]` Intent: the ISBN is shown unhyphenated, unlike the mockup. Not found (3.49) shows the stored 13 digits too. Hyphenation needs ISBN range data no story has.
  - `[false]` `[reject]` Intent: sprint status and spec status are out of sync. Same as the Blind row; finalization syncs them.

## Design Notes

**Try again is `router.refresh()`.** The Answer's address already is the lookup (`/scan?isbn=`), and `lookupSources` never caches `unavailable`, so re-rendering the route is "the lookup once more" with no new action, route or history entry. A recovered source simply renders a different Answer at the same address.

**Unfolding replaces the foot.** "Unfolds the Not found fields and buttons in place": the Not found buttons are Add to library (primary) and Back. Keeping Try again would put two primaries (or a demoted one) and two Backs on one layer, so the Link and foot give way to `NotFoundForm` whole.

**Finnish plural.** English "didn't answer" is the same for one or two sources; Finnish is not ("ei vastannut" / "eivät vastanneet"), so `count` is passed to both catalogues and only `fi` uses it.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npx eslint src tests` -- expected: 0 errors
- `npm run test:unit` -- expected: all pass (`scanScreen` first-barcode test is a known flake under load; re-run it alone)
- `npm run test:int` -- expected: all pass (Postgres on 5434)

**Manual checks:**
- `npm run dev` with the network off (or a source pointed at an unreachable host): scan or type an ISBN not in the library; "Couldn't look it up" names the sources; Try again re-runs; Add by hand shows the form and saves.

## Auto Run Result

**Summary:**
- When a source fails or times out and nothing in the library has the ISBN, Scan now opens the **Couldn't look it up** Answer instead of silently staying on Scan (AD-9).
- The Answer has a line naming the silent sources in the locale's list form, plus the ISBN: "Finna and Google Books didn't answer. 978… may still be known." In Finnish, the verb agrees with the number of sources.
- **Try again** (primary) re-renders the same address with `router.refresh()`, so the lookup runs once more on the server, with the progress line showing and no new history entry. **Back** returns to Scan.
- **Add by hand** puts the Not found form (Title, Author, Add to library, Back) in place of the Link and the foot. The save, toast and Undo work exactly as on Not found.

**Files changed:**
- `src/app/(frontend)/scan/answer.ts`: the `unavailable` outcome (ISBN-13 and the failed sources in order) and its `answerFor` arm.
- `src/app/(frontend)/scan/page.tsx`: the `unavailable` arm and the doc comment.
- `src/app/(frontend)/scan/UnavailableAnswer.tsx` (new): the server component that builds the line from the source labels, `getFormatter().list` and `count`.
- `src/app/(frontend)/scan/UnavailableActions.tsx` (new): the client component with Add by hand, Try again and Back, and the unfolded `NotFoundForm`. Add by hand is disabled while a retry is pending.
- `messages/en.json`, `messages/fi.json`: `answer.unavailable`, `noAnswer`, `tryAgain`, `addByHand`.
- Tests:
  - `tests/unit/answer.unit.spec.ts`: the `unavailable` outcome from an ISBN-10, with the order kept.
  - `tests/unit/messages.unit.spec.ts`: the full `noAnswer` line in en and fi, for one and two sources.
  - `tests/unit/unavailableActions.unit.spec.ts` (new): Try again refreshes; Add by hand unfolds the form, focuses Title and removes Try again.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.50 set to `done`.

**Review findings:** 22 in total (low 12, false 10).
- **Patched (2):**
  - Add by hand is disabled during a pending Try again.
  - The `noAnswer` tests assert full strings.
- **Deferred:** none.
- **Rejected, with reasons in the triage log:**
  - the breaker-open retry wording (rare; needs a new outcome from `lookupSources`);
  - focus and feedback after a disabled retry (same as the other pending buttons);
  - the duplicated source-label lookup (three lines; a shared helper changes `AnswerText`'s contract);
  - Try again past the rate limit drops to Scan (30 taps per window; existing behaviour, in the matrix);
  - server-component and pending-state tests (no render harness for async server components, no suspending router mock);
  - the unhyphenated ISBN (matches Not found; would need range data);
  - ten false findings (an empty `failed` list is unreachable, status sync happens at finalization, the descriptive intent notes).

**Follow-up review recommended:** false. Patched entries by verdict: high 0, medium 0, low 2.

**Verification:**
- `npm run typecheck`: clean.
- `npx eslint src tests`: 0 errors (36 old warnings).
- `npm run test:unit`: 41 files, 657 tests pass.
- `npm run test:int`: 40 files pass, 1 skipped (389 tests). They ran on the Postgres from `.env` (5432); 5434 was not listening.
- The manual dev-server check was not run.

**Residual risks:**
- Not seen in a browser: the screen's look, Try again's progress line, and the unfold followed by a save.
- While a source's breaker is open (60 s after three failures), Try again comes back at once with the same Answer.
- The Finnish strings ("Haku ei onnistunut", "… ei vastannut / eivät vastanneet. … voi silti löytyä.", "Yritä uudelleen", "Lisää käsin") are the owner's call.
