---
title: 'Story 3.45: [D16] Answer: not in library'
type: 'feature'
created: '2026-10-20'
baseline_revision: '23a166bc49a306dd23b81f42b3c7f298ba0b709d'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Back from an Answer re-reads the barcode still in view and pushes the same Answer again.
    evidence: |-
      After Back the address has no isbn, so ScanScreen's read guard resets and the decode loop reads the book still in front of the camera. That spends another rate-limited lookup and makes Back look like it did nothing. Epic 3 gives "the handled ISBN is ignored until it leaves view" to Story 3.51 (Scan loop rules), and this story's spec leaves the reading rules to it.
    location: >-
      src/app/(frontend)/scan/ScanScreen.tsx
    severity: medium
  - summary: >-
      On a Scan with an isbn in the address (invalid ISBN, rate limit, or a kind with no Answer yet) camera reads stay ignored.
    evidence: |-
      This rule predates 3.45 (Story 3.1: reads are ignored while an isbn is in the address). The user can retype, or use Back or X, but cannot scan to recover. Story 3.51 owns the scan-loop reading rules.
    location: >-
      src/app/(frontend)/scan/ScanScreen.tsx
    severity: low
  - summary: >-
      Lookup kinds with no Answer yet (none, unavailable, existing with holdings) show a silent Scan with the text in the field.
    evidence: |-
      This is the interim until Stories 3.48 (in library), 3.49 (not found) and 3.50 (couldn't look it up) add their Answers. Scanning a book already owned looks like nothing happened until then.
    location: >-
      src/app/(frontend)/scan/page.tsx
    severity: low
  - summary: >-
      There is no error boundary, so an unexpected lookup failure shows Next's default error page.
    evidence: |-
      This predates 3.45: there is no error.tsx anywhere under src/app. answerFor rethrows everything except INVALID_ISBN and RATE_LIMITED, as the spec requires.
    location: >-
      src/app/(frontend)/scan/answer.ts
    severity: low
  - summary: >-
      The spine's Toasts convention still says a server render raises a toast only through flashToast(), which cannot work for a query-only navigation.
    evidence: |-
      RaiseToast is the mechanism 3.45 used, recorded only in this spec's Design Notes. Stories 3.48–3.50 render on the same /scan?isbn= address and may reach for flashToast() again. Amending ARCHITECTURE-SPINE.md (Consistency Conventions, Toasts) is a planning-document change, left to the owner.
    location: >-
      _bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md
    severity: low
---

<intent-contract>

## Intent

**Problem:** `/scan?isbn=<text>` only echoes the submitted text under the field: nothing calls `lookupBook`, so a scan never says what the book is. Invalid ISBNs and the lookup rate limit have no surface, and the lookup gives no sign that it is in flight.

**Approach:** The `/scan` page calls `lookupBook` on the server and, for a `source` result or an `existing` one the viewer holds nothing of, renders the full-screen **Not in library** Answer: cover preview, title, author, edition line, source line and new-record notes, with a Back button. `INVALID_ISBN` and `RATE_LIMITED` keep Scan open (field error, toast). Scan runs its navigations in a transition and shows the progress line while one is pending. X on an Answer leaves the whole scan task.

## Boundaries & Constraints

**Always:**
- Display only. The page reads through `lookupBook(ctx, { isbn: text })`, with the text exactly as in the address (`INVALID_ISBN` comes from the service, never a client check). No `pick` (3.53).
- Not in library applies to `kind: 'source'` and to `kind: 'existing'` with `mine.copies` and `mine.entries` both empty. For `existing` there is no source line and there are no notes; the cover is `book.coverUrl`.
- For `source`, the Answer shows `candidates[pick]`. Cover: `coverUrl({ isbn13 })` when `hasCover`, otherwise the `Cover` placeholder (`src: null`). Source line: "From {source}", where `{source}` is `sources.<id>` from the catalogue ("Finna", "Google Books"), or the raw id when the catalogue has no label for it. Notes: one line per `matches.authors` entry with `id: null` ("New author · {name}") and one for `matches.series` with `id: null` ("New series · {name}").
- Author line: the author names joined ", ". Edition line: the parts publisher, year and "{n} pages" (ICU plural) that exist, joined " · ". Omit a line that would be empty. Nothing names another user: no field from any user record is rendered.
- Layout (DESIGN.md, Detail panel composition): the task heading is "Not in library" (`FullScreenTask` title). Below it, the cover sits in a 72px-wide box (2:3, so 108px tall) beside the title in `heading-detail`. Under the title: the author in `body`, the edition line in `meta` `text-muted`. Then the source line and the note lines in `meta` `text-muted`. Then **Back** as a full-width `secondary` Button. Declare the 72px width as `--spacing-cover-detail` in `styles.css`, with a comment citing DESIGN.md's Detail panel. Wide screens: `FullScreenTask` already centres a `task-width` column.
- `INVALID_ISBN`: the page renders Scan, keeping the text in the field, with `errors.INVALID_ISBN` as the `TextField` error. `RATE_LIMITED`: the page renders Scan, keeping the text in the field, plus a client component that shows the `{ kind: 'error', code: 'RATE_LIMITED' }` toast on mount. That component is keyed by a value that is fresh on every server render (`crypto.randomUUID()`), so a repeated submit raises it again. Any other thrown error propagates.
- The remaining kinds (`none`, `unavailable`, `existing` with holdings) render Scan with the text kept in the field and no error, until 3.48–3.50 add their Answers. The old "submitted text under the field" line goes.
- Scan navigates in `useTransition`. A barcode read and a field submit both go to `/scan?isbn=${encodeURIComponent(text)}`. They replace when the address already carries `isbn`; otherwise they push. While the transition is pending, `<ProgressLine label={t('progress.loading')}>` renders. The field becomes a plain `<form action="/scan">` whose `onSubmit` prevents the default and navigates in the transition. Without JS it still submits as GET. A submit sets the read guard (`handled`) like a read does.
- History: Back on the Answer goes history back when the task has an entry below the current one; otherwise it replaces to `/scan`. X closes the task: it goes back to the entry below the task's first entry, or replaces to `/` when the task was the first entry in this tab. The scan layout records the task's first-entry depth on mount. Without a recorded task base, `useCloseTask` behaves exactly as now.
- Strings in `en.json` and `fi.json`, under the `answer` and `sources` groups: `answer.notInLibrary` "Not in library" / "Ei kirjastossa"; `answer.from` "From {source}" / "Lähde: {source}"; `answer.newAuthor` "New author · {name}" / "Uusi kirjailija · {name}"; `answer.newSeries` "New series · {name}" / "Uusi sarja · {name}"; `answer.pages` "{pages, plural, one {# page} other {# pages}}" / "{pages, plural, one {# sivu} other {# sivua}}"; `answer.back` "Back" / "Takaisin"; `sources.finna` "Finna"; `sources.google` "Google Books" (the same in both languages).

**Never:**
- No Add to library, Add another copy, Add to wishlist or Open book button (3.46, 3.48, 7.14, Epic 5). No "{n} editions found" or `?pick` (3.53). No "New genre" (Epic 9).
- No change to scan-loop reading rules beyond the submit guard (3.51). No Playwright spec (3.52).
- No browser lookup request, no `/data` route, no prefetch of an Answer URL (each render counts against the rate limit). No `loading.tsx` under `/scan`: Scan stays visible while the lookup runs.
- No change to `lookupBook` or any `lib` service.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Source answer | `source`, picked candidate has cover, a new author, an existing series | "Not in library", `/data/cover/<isbn13>` cover, title, author, edition, "From Finna", "New author · Name" | — |
| Shared Book, nothing held | `existing`, `mine` empty | Answer with the Book's cover or placeholder; no source line, no notes | — |
| Book held | `existing`, one copy | Scan with the text in the field (3.48 replaces this) | — |
| Partial edition | publisher missing, year 2014, pages 1 | "2014 · 1 page" | — |
| Unknown source id | `source: 'fixture'` | "From fixture" | no throw |
| Invalid text | `?isbn=978-951-0-4123` | Scan, field keeps the text, danger message "Not an ISBN. Thirteen digits, or ten." | caught `INVALID_ISBN` |
| Over the limit | `lookupBook` throws `RATE_LIMITED` | Scan, toast "Too many lookups. Wait a moment." | caught; a resubmit toasts again |
| Unexpected | `lookupBook` throws anything else | propagates to Next's error handling | not caught |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/page.tsx` -- server page. Today it only reads `isbn` and renders `ScanScreen submitted`. It becomes: `requireUser()` → ctx, then `answerFor(() => lookupBook(ctx, { isbn: text }))`, then either the Answer inside `FullScreenTask title={t('answer.notInLibrary')}` or `ScanScreen` under the `scan.heading` title. Keep the `ViewTransition` wrapper.
- `src/app/(frontend)/scan/ScanScreen.tsx` -- client. The `submitted` prop drives `handled` and `Form replace`. Replace `next/form` with a plain form plus a transition. Props become `{ isbn?: string; error?: string }`: `isbn` sets the field's `defaultValue` (key the input by it), the replace rule and the guard.
- `src/app/(frontend)/scan/layout.tsx` -- server layout holding `CameraSession`. Add the task-base recorder here, because it persists across search-param changes.
- `src/app/(frontend)/components/navigation.ts` -- module `depth` and `useCloseTask`, which today does one `router.back()` or `replace('/')`. Add module `taskBase: number | null`, set and cleared by a `TaskBase` client component (renders `null`; on mount `taskBase = depth`, on unmount `null`). `useCloseTask`: `base = taskBase ?? depth`. If `base === 0`, `replace('/')`. Otherwise go back `depth - base + 1` steps: `router.back()` for 1, `window.history.go(-n)` for more. Keep the closing guard and the view-transition branch. Add `useTaskBack(fallback)`: `depth > (taskBase ?? 0)` ? `router.back()` : `router.replace(fallback)`.
- `src/app/(frontend)/components/FullScreenTask.tsx` -- renders the title and the X via `useCloseTask`; unchanged.
- `src/app/(frontend)/components/Cover.tsx` -- `Cover({ src, title })` fills its parent's width at 2:3; use it inside the 72px box.
- `src/app/(frontend)/components/ProgressLine.tsx`, `Button.tsx` (`variant="secondary"`), `TextField.tsx` (`error` prop) -- reuse as they are.
- `src/app/(frontend)/components/toast/ToastProvider.tsx` -- `useToast()` gives `show`; the new raise-on-mount component lives next to it in `components/toast/`.
- `src/lib/catalogue/lookupBook.ts:42-51` -- `LookupResult`, `Draft` (`hasCover`, `source`, `publisher?`, `year?`, `pages?`), `Match`. Read-only.
- `src/lib/books/effectiveBook.ts:20-39`, `holdings.ts:27` -- `EffectiveBook` (`coverUrl`, `publisher|year|pages: … | null`), `Holdings`. Read-only.
- `src/lib/books/coverUrl.ts` -- `coverUrl({ isbn13 })` gives `/data/cover/<isbn13>`. A server module may import it.
- `src/lib/metadata/sources/index.ts` -- ids `finna`, `google`.
- `src/app/(frontend)/styles.css:84-98` -- named spacing variables; add `--spacing-cover-detail: 72px` there.
- `messages/en.json`, `messages/fi.json` -- add the `answer` and `sources` groups. `tests/unit/messages.unit.spec.ts` checks parity.
- `tests/unit/scanScreen.unit.spec.ts` -- mocks `next/form` and uses `submitted`. Adapt it to the plain form and the new props.
- `tests/unit/navigation.unit.spec.ts:54-111` -- `useCloseTask` tests use `traverseTo(stampPush({}, n))` and the mocked `back`/`replace`; extend them for the task base.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/scan/answer.ts` -- new server-side module. `type NotInLibrary = { title; authors: string[]; publisher: string | null; year: number | null; pages: number | null; cover: string | null; source: string | null; newAuthors: string[]; newSeries: string | null }`. `notInLibrary(result: LookupResult): NotInLibrary | null`, per the rules above. `answerFor(lookup: () => Promise<LookupResult>)` resolves to `{ kind: 'answer'; answer: NotInLibrary } | { kind: 'scan'; error?: 'INVALID_ISBN' | 'RATE_LIMITED' }` and rethrows other errors. Rationale: it keeps the page thin and the decisions testable.
- `src/app/(frontend)/scan/Answer.tsx` -- new server component that renders a `NotInLibrary` (layout, strings and edition join as above) and a client `AnswerBack` button, defined inline or as a small file, using `useTaskBack('/scan')`.
- `src/app/(frontend)/components/toast/RaiseToast.tsx` -- new client component: `show(input)` once on mount.
- `src/app/(frontend)/scan/page.tsx`, `ScanScreen.tsx`, `layout.tsx` -- as in the Code Map.
- `src/app/(frontend)/components/navigation.ts` -- `TaskBase`, task-aware `useCloseTask`, `useTaskBack`.
- `src/app/(frontend)/styles.css` -- `--spacing-cover-detail`.
- `messages/en.json`, `messages/fi.json` -- the strings.
- `tests/unit/answer.unit.spec.ts` -- the I/O matrix rows for `notInLibrary` and `answerFor`: source with notes, existing empty, existing held, partial edition fields, `INVALID_ISBN`, `RATE_LIMITED`, other errors rethrown.
- `tests/unit/navigation.unit.spec.ts` -- with a task base 1 below the current entry, close goes back 2 (`history.go(-2)`). With a base of 0, it replaces `/`. `useTaskBack` goes back above the base and replaces at the base.
- `tests/unit/scanScreen.unit.spec.ts` -- adapt to the new props. A read and a submit push (or replace with `isbn`) the encoded raw text. The `error` shows under the field.

**Acceptance Criteria:**
- Given a signed-in user on Scan, when they submit an ISBN that Finna knows and nobody has saved, then the progress line runs until the Answer replaces Scan. The Answer shows "not in library", the cover preview, title, author, edition line, "From Finna", and a note per author or series the save would create.
- Given that Answer, when they tap Back, then Scan shows with an empty field, nothing is saved, and Back from Scan returns to the section. When they tap X instead, the scan task closes to the section in one tap.
- Given a wide screen, when the Answer shows, then it is a centred column no wider than `task-width`.

## Spec Change Log

## Review Triage Log

### 2026-10-20 — Review pass
- verdicts: 28 findings — high 0, medium 3, low 20, false 4, maybe-false 1
- findings:
  - `[low]` `[reject]` Verification gap: `scan/page.tsx` wiring is untested (the error string for `INVALID_ISBN`, `RaiseToast` on `RATE_LIMITED`, raw text to `lookupBook`). The decisions live in `answerFor`, which is tested. What is left is thin glue in an async server component. Testing it needs `requireUser` and `lookupBook` mocked and a page-render harness the repo does not have. Functional minimum; Playwright 3.52 covers the route.
  - `[low]` `[reject]` Verification gap: the progress line is never observed pending. Observing `isPending` needs a suspending router, and a jsdom test would only restate markup. Scan-to-save Playwright (3.52) is the right surface.
  - `[low]` `[patch]` Verification gap: `TaskBase`'s timing is assumed but not tested. Verified: Next 16.3.8 `HistoryUpdater` pushes in `useInsertionEffect` (`app-router.js:39`), which runs before passive effects, so the code is correct today. Patched with a comment on `TaskBase` that names the dependency (grouped with the Blind row below).
  - `[low]` `[reject]` Edge: when a task is entered mid-stack (reload on an Answer), the base is recorded at the Answer. This is the residual the Design Notes accept. Rare, and the fix (stamping a task-start marker in history) adds state.
  - `[medium]` `[patch]` Edge: two fast taps on Back call `router.back()` twice and leave the task. Real: `useTaskBack` had no in-flight guard. Patched: Back goes through `useCloseTask`'s `closing` guard and popstate/timeout settle, with a two-taps test.
  - `[low]` `[defer]` Edge: on a Scan with an isbn in the address, camera reads stay ignored. The rule predates 3.45 (Story 3.1), and Story 3.51 owns the reading rules. Deferred.
  - `[low]` `[defer]` Edge: `none`, `unavailable` and held `existing` give a silent Scan. This is the interim the intent gives to 3.48–3.50. Deferred.
  - `[low]` `[defer]` Edge: with no `error.tsx`, an unexpected lookup error shows Next's default error page. This predates 3.45: no error boundary exists anywhere. Deferred.
  - `[low]` `[reject]` Edge: `router.refresh()` or a revalidating action on `/scan?isbn=` re-runs the lookup and toasts again. No caller refreshes this route today. 3.46's save returns to Scan rather than revalidating the Answer.
  - `[low]` `[reject]` Edge: `canGoBackInApp` is now called only by tests. It is a harmless exported reader that the depth-tracking tests use to observe state, and no caller diverges on it.
  - `[low]` `[reject]` Edge: after a reload on an Answer, X stops at Scan. Same root as the mid-stack row above; an accepted residual in Design Notes.
  - `[maybe-false]` `[reject]` Blind: Scan → Answer remounts the page and plays the task's exit and enter slide. The page's cache key does include search params (`createRouterCacheKey`), and layout-router keeps each `stateKey` under Activity, so this is plausible. Settling it needs a browser. If true it is cosmetic (low). The structure is unchanged from Story 3.1's `/scan` → `/scan?isbn=`.
  - `[medium]` `[patch]` Blind: after Go on an invalid ISBN the field is a new element, so focus drops and the phone keyboard closes. Patched: the field gets `autoFocus` when `error` is set.
  - `[low]` `[reject]` Blind: the Answer neither takes focus nor announces itself. The single owner uses it on a phone by sight. Focus management on `FullScreenTask` adds code for no user met today.
  - `[low]` `[reject]` Blind: Back on the Answer does not slide away. Browser Back already swaps at once (page.tsx comment). A slide would need the task element handed into `AnswerBack`: plumbing for a cosmetic gain.
  - `[medium]` `[defer]` Blind: Back re-reads the barcode still in view and pushes the same Answer again. Real. The rule that fixes it ("the handled ISBN is ignored until it leaves view") is Story 3.51's AC in the epic. Deferred to 3.51.
  - `[low]` `[defer]` Blind: three outcomes leave Scan silent and the camera stopped. Same roots as the two deferred Edge rows above (3.48–3.50 and 3.51).
  - `[low]` `[patch]` Blind: there is no guard against a second Go while a lookup runs. Patched: `submit` returns early while `pending`.
  - `[low]` `[reject]` Blind: `RaiseToast` re-fires when back/forward restores a rate-limited entry. Rare (a forward traversal onto a refused lookup). Tying the toast to one submit needs a submit id through the address.
  - `[low]` `[reject]` Blind: X from a task that was the tab's first entry leaves Scan below `/`. Only a direct `/scan` load reaches this (the PWA starts at `/`). The fix (traverse to the base, then replace) adds a branch.
  - `[low]` `[patch]` Blind: `TaskBase` depends on an unstated ordering inside Next. Patched with the comment from the Verification-gap row above (same root cause).
  - `[low]` `[defer]` Blind: the toast deviation is recorded only in this spec, not in the spine. The fix is a planning-document change that the owner decides. Deferred.
  - `[low]` `[reject]` Blind: the `sources.<id>` cast has no tie to the source registry, so a new adapter would show its raw id. The raw-id fallback is deliberate (the 3.52 fixture source), and adding an adapter is rare and visible on the first scan.
  - `[low]` `[reject]` Intent: tests sit below the route surface. Same as the first two Verification-gap rows: functional minimum, with Playwright (3.52) as the route-level guard.
  - `[false]` `[reject]` Intent: the heading is stored "Not in library" while the AC writes "not in library". EXPERIENCE.md stores strings in sentence case and lowercases headings in CSS (`ui-case` on the `FullScreenTask` h1).
  - `[false]` `[reject]` Intent: "each Answer replaces the previous one" is met by Back-then-push, not an explicit replace. No Answer is reached from an Answer (no reader there), and Back pops before the next push, so history never holds two Answers.
  - `[false]` `[reject]` Intent: the X-after-reload exception is unstated in the AC. Already logged above as an accepted residual; not a new defect.
  - `[false]` `[reject]` Intent: under reading R2 (every kind gets an Answer), the diff diverges. The epic assigns those kinds to 3.48–3.50; the silent interim is deferred above.

## Design Notes

**Toast from a page render.** The spine says a server render raises a toast only through `flashToast()`. That cannot work here: a server component cannot set cookies, and the provider re-reads the flash cookie only on a pathname change, while `/scan` → `/scan?isbn=` changes only the query. The page therefore renders `RaiseToast`, the client equivalent, keyed per render. This is recorded as a deviation from the letter of the Toasts convention. It keeps its intent: the toast comes from the server's outcome, and the provider's one store shows it.

**History.** Scan → Answer pushes. Back on the Answer pops back to Scan, so the next read pushes over the popped entry. That alone keeps one Answer entry at a time. The task-base depth is what lets X leave from two entries deep. A reload on an Answer records the base at the Answer, so X then stops at Scan. This residual is accepted.

**"Not in library" in the frontend.** Which result counts as Not in library is decided in `scan/answer.ts` for now. Epic 8's `answerFacts` takes over heading precedence when the other headings arrive.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: 0 errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass (Postgres on 5434)

**Manual checks:**
- `npm run dev` against the 5434 database, signed in. `/scan?isbn=9789510396358` (or any Finnish ISBN from `tests/fixtures/finna/`) shows the Answer. `/scan?isbn=123` shows the field error. On the scan screen, Back and X behave as the AC says.

## Auto Run Result

**Summary:** `/scan?isbn=` now looks the text up on the server with `lookupBook`. For a source candidate, or for a Book the viewer can read and holds nothing of, it renders the full-screen **Not in library** Answer: cover preview (or placeholder) beside the title, author, edition line (publisher · year · pages), "From {source}", one "New author · …" / "New series · …" line per record a save would create, and Back. `INVALID_ISBN` keeps Scan, with the text and the danger message in the field and the field focused. `RATE_LIMITED` keeps Scan and raises the toast through `RaiseToast`, keyed per render. Scan navigates in a transition, with the progress line while the lookup is pending, and ignores a second Go meanwhile. The scan layout records where the task starts in history. X therefore leaves the whole task from an Answer, and Back returns to Scan; both are guarded against a double tap.

**Files changed:**
- `src/app/(frontend)/scan/answer.ts` (new): `notInLibrary`, `answerLines`, `answerFor`, the pure decisions.
- `src/app/(frontend)/scan/NotInLibraryAnswer.tsx` (new): the Answer. It is named so because `Answer.tsx` collides with `answer.ts` on case-insensitive macOS.
- `src/app/(frontend)/scan/AnswerBack.tsx` (new): Back via `useTaskBack('/scan')`.
- `src/app/(frontend)/components/toast/RaiseToast.tsx` (new): a toast decided by a server render.
- `src/app/(frontend)/scan/page.tsx`: the lookup and the choice between Answer and Scan.
- `src/app/(frontend)/scan/ScanScreen.tsx`: `{ isbn, error }` props, a plain form, transition navigation, the progress line, the submit guard and autofocus on error.
- `src/app/(frontend)/scan/layout.tsx`: mounts `TaskBase`.
- `src/app/(frontend)/components/navigation.ts`: `TaskBase`, task-aware `useCloseTask`, `useTaskBack`, and a shared `traverseBack` guard.
- `src/app/(frontend)/styles.css`: `--spacing-cover-detail` (72px).
- `messages/en.json`, `messages/fi.json`: the `answer` and `sources` groups.
- Tests: `tests/unit/answer.unit.spec.ts` and `tests/unit/raiseToast.unit.spec.ts` are new; `navigation.unit.spec.ts` and `scanScreen.unit.spec.ts` are adapted and extended.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 3.45 done.

**Review findings:** 28 in total (medium 3, low 20, false 4, maybe-false 1).
- **Patched, 4 entries covering 5 findings:**
  - double tap on Back (medium);
  - field focus after an invalid ISBN (medium);
  - second Go while a lookup runs (low);
  - a comment naming `TaskBase`'s dependency on Next's insertion-effect history push (low; two findings).
- **Deferred, 5:**
  - Back re-reads the barcode still in view (medium; to 3.51);
  - camera reads ignored on an error Scan (low; 3.51);
  - silent Scan for kinds with no Answer yet (low; 3.48–3.50);
  - no error boundary (low; pre-existing);
  - the spine's Toasts row still names only `flashToast()` (low; planning document).
- **Rejected, with reasons in the triage log:**
  - page-level and progress-line test gaps (functional minimum; Playwright in 3.52);
  - mid-stack task base after a reload (an accepted residual; logged twice);
  - re-lookup on refresh (no caller);
  - `canGoBackInApp` used only by tests;
  - Scan → Answer remount animation (maybe-false; needs a browser; cosmetic);
  - no focus on the Answer heading;
  - Back without a slide;
  - `RaiseToast` on a forward traversal;
  - X from a task that was the tab's first entry;
  - the `sources` key cast;
  - intent-alignment notes (tests below the route surface; heading casing via CSS; replace via Back-then-push; the reading in which every kind gets an Answer).

**Follow-up review recommended:** true. Patched counts by verdict: high 0, medium 2, low 2. The unverified risk is Back and X traversal against the real Next router in a browser. Specifically:
- the `traverseBack` guard on Back;
- `history.go(-2)` from an Answer;
- the remount and `autoFocus` after an invalid ISBN on the phone.

All of these are checked only in jsdom with a mocked router.

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (36 warnings, all in migrations, pre-existing).
- `npm run test:unit`: 570 passed. `scanScreen`'s first barcode test timed out in one full run at load average 12, then passed on re-run and in three isolated runs (the known flake under parallel worktrees).
- `npm run test:int`: 337 passed, 1 skipped (Postgres on 5434).
- Dev server, by the implementation agent:
  - `/scan?isbn=978-951-0-39707-7` rendered the Answer: "Hytti nro 6", Rosa Liksom, "WSOY · 2012 · 200 pages", "From Finna", the new author and new series notes, and Back.
  - `/scan?isbn=123` showed the field error.
  - Past 30 lookups, Scan rendered with `RaiseToast`.
  - The spec's example ISBN `9789510396358` is invalid; use a fixture ISBN instead.

**Residual risks:**
- Not run in a browser:
  - the progress line timing;
  - the toast appearing;
  - Back and X history;
  - the camera staying on across Answer;
  - the wide-screen column;
  - whether Scan → Answer replays the task slide (the page segment is keyed by search params).
- After a reload on an Answer, X stops at Scan (accepted).
- Until 3.51, Back from an Answer re-reads a barcode still in view.
