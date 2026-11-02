---
title: '8.9 [I7] Add by hand from Lookup'
type: 'feature'
created: '2026-11-02'
baseline_revision: '9d9cb334eef1acc81242f1bab1a1cefaf769ff3d'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Lookup's empty state (Story 8.8) is a dead end: "Nothing found" and nothing else, so a book no source and no shelf knows cannot be entered from the screen the user is already on. EXPERIENCE.md's Lookup row asks for an "Add by hand" Link there, and Story 8.8 deliberately left it out as this story's work.

**Approach:** Add one "Add by hand" `TextLink` to the empty state, addressing `/scan?title=<the searched text>`. Everything it opens exists: `scanParams()` reads `?title=` (even empty) and `/scan` renders the Not found Answer with the text in its Title field, whose Add to library and Add to wishlist already save a private Book with no ISBN (Story 3.49, `NotFoundForm`). This story is the entry point and the test that it carries the text, nothing more.

## Boundaries & Constraints

**Always:**

- The Link shows only in the empty state — a search that ran and both halves answered empty. Not with a group on screen, not with no `q`, not with a blank `q`, and not when `searchBooks()` was refused (`limited`): the source half never answered, so "nothing found" is not yet true.
- Its text is the existing `answer.addByHand` key ("Add by hand" / "Lisää käsin"), already in both catalogues and already this Link's wording on Couldn't look it up. No new message key.
- The href carries the **trimmed** text the page searched, URL-encoded: `/scan?title=${encodeURIComponent(query)}`, the same `query` the two searches were given, so the Title field shows what was searched rather than what sat untrimmed in the field.
- It is a `TextLink` (`src/app/(frontend)/components/Link.tsx`), rendered under the "Nothing found" line, so a push leaves the results below in history and Back on the Answer returns to them, exactly as a result row does.
- `tests/unit/lookupPage.unit.spec.ts` grows the empty-state cases: the Link with its href, and its absence in each state that is not the empty state.

**Never:**

- No change to `scanParams`, `/scan/page.tsx`, `NotFoundAnswer`, `NotFoundForm`, `saveManualAction` or any service: the Answer this Link opens and both its saves are built and tested; re-testing them here would restate Story 3.49.
- No new message key, no re-wording of `lookup.nothing`, no new namespace.
- No "Add by hand" anywhere else: not on a group-bearing result page, not on the rate-limited state, not on Scan (which has its own "Add without ISBN" Link to the same address with no text).
- No change to `lookupRows.ts`, `LookupRow.tsx` or `LookupField.tsx`: the empty state lives in `page.tsx`.
- No spine change: the `/scan/find` and `/scan` Routes rows already state these addresses and their params, and no AD moves.
- No prefill of the Author field, and no guess at splitting the typed text into a title and an author — the text goes to the Title field whole (EXPERIENCE.md: "the typed text in the title field").

## I/O & Edge-Case Matrix

| Scenario          | Input / State                                    | Expected Output / Behavior                                                       | Error Handling |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- | -------------- |
| Nothing found     | `?q=ei+mitään`, both searches `[]`               | "Nothing found" and an "Add by hand" Link to `/scan?title=ei%20mit%C3%A4%C3%A4n` | —              |
| Untrimmed q       | `?q=%20%20linna%20%20`, both `[]`                | the href carries `linna`, trimmed                                                | —              |
| Own group present | an own match                                     | no "Add by hand" Link                                                            | —              |
| Elsewhere present | a source hit, nothing own                        | no "Add by hand" Link                                                            | —              |
| No `q`            | `/scan/find`                                     | the field alone: no "Nothing found", no Link                                     | —              |
| Blank `q`         | `/scan/find?q=%20`                               | the field alone: no "Nothing found", no Link                                     | —              |
| Rate-limited      | `searchBooks` throws `RATE_LIMITED`, nothing own | the toast, no "Nothing found", no Link                                           | caught (8.8)   |
| Link followed     | the Link tapped                                  | `/scan?title=<text>`: the Not found Answer with the text in Title                | —              |
| Saved from there  | Add to library, or Add to wishlist with a list   | a private Book with no ISBN (existing behaviour, 3.49)                           | —              |

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/find/page.tsx:44` -- `query` is the trimmed text, the href's value; `:48-60` the search block that sets `groups` and `limited`; `:79-82` the "Nothing found" paragraph, guarded by `groups !== null && !limited && mine.length + elsewhere.length === 0` -- the Link goes inside that same guard, under the paragraph. The only file to change.
- `src/app/(frontend)/components/Link.tsx` -- `TextLink`, the Link component both Scan Links use.
- `src/app/(frontend)/scan/ScanScreen.tsx:187` -- `<TextLink href="/scan?title=">{t('scan.addWithoutIsbn')}</TextLink>`: the precedent for addressing `?title=`, with no text. Read-only.
- `src/app/(frontend)/scan/answer.ts:320-337` -- `scanParams()`: `title` is read when the key is present, even empty, after `isbn` and `book`; nothing else is needed for `?title=<text>` to reach the Answer. Read-only.
- `src/app/(frontend)/scan/page.tsx:63-65` -- `title !== undefined` yields `{ kind: 'notFound', isbn13: null, title }`, and `:67` gives that outcome the viewer's wishlists; `:105` renders `NotFoundAnswer isbn13={null} title={outcome.title}`. Read-only: this is the whole of what the Link opens.
- `src/app/(frontend)/scan/NotFoundAnswer.tsx:28` -- `NotFoundForm isbn13={null} title=...`; `NotFoundForm.tsx:52` keeps the prefilled title as `typedTitle`, and its Add to library / Add to wishlist save the typed text with no ISBN. Read-only.
- `src/app/(frontend)/scan/UnavailableActions.tsx:49` -- `t('answer.addByHand')`, the existing key and the same wording for the same action. `messages/en.json:142`, `messages/fi.json:142` hold it: "Add by hand" / "Lisää käsin". No catalogue change.
- `tests/unit/lookupPage.unit.spec.ts:94-230` -- the page spec: `renderPage({ q })` with `searchMine`/`searchBooks` mocked, `showToast` captured, the English translator. `:194` the "Nothing found" case to extend, `:165-183` the one-group cases, `:113-131` the no-`q` and blank-`q` cases, `:201-219` the rate-limited cases -- the states the Link must stay out of.
- `tests/unit/answer.unit.spec.ts:450-471` -- `scanParams`' `title` cases, and `tests/unit/notFoundForm.unit.spec.ts` the form's two saves: the Answer side of this Link is already guarded, so this story adds no test there.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md:227` -- the Lookup "Nothing found" row: "Nothing found" and a Link, "Add by hand", which opens the Not found Answer with the typed text in the title field.

## Tasks & Acceptance

**Execution:**

- `src/app/(frontend)/scan/find/page.tsx` -- inside the existing empty-state guard, render the "Add by hand" `TextLink` to `/scan?title=${encodeURIComponent(query)}` under the "Nothing found" line, and say in the page doc comment that the empty state is a way in, not a dead end -- the one behaviour this story adds.
- `tests/unit/lookupPage.unit.spec.ts` -- extend the empty-state case with the Link and its href (including the untrimmed-`q` row), and assert its absence with a group on screen, with no `q`, with a blank `q`, and under `RATE_LIMITED` -- the matrix's conditions are the behaviour that can break silently.

**Acceptance Criteria:**

- Given a signed-in viewer on `/scan/find?q=<text>` that neither their own holdings nor any source matched, when the page renders, then it shows "Nothing found" and an "Add by hand" Link whose address is `/scan?title=<text>`, with the text trimmed and URL-encoded.
- Given that Link, when it is followed, then the Not found Answer opens with the searched text in its Title field, and Add to library and Add to wishlist each save a private Book with no ISBN.
- Given any state that is not the empty state -- a group on screen, no `q`, a blank `q`, or a refused source search -- when the page renders, then there is no "Add by hand" Link.
- Given `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run test:int`, when they run, then all pass, with every existing spec green without edits.
- Given the walk (`tests/e2e/*.walk.spec.ts`, uncommitted), when it searches `/scan/find` for a text nothing matches and follows "Add by hand", then the Not found Answer opens with that text in Title, Add to library saves it and the book is found by that title afterwards; what it saw is recorded under `## Auto Run Result`.

## Spec Change Log

## Review Triage Log

## Design Notes

**Why the trimmed text, not the field's.** `LookupField` already pushes the trimmed text, so the two normally agree; they differ only for a hand-typed or restored address (`?q=%20%20linna%20%20`). The Title field should show what was actually searched, and the service trims a title anyway, so taking `query` keeps the Answer honest with one fewer variable.

**Why the Link stays out of the rate-limited state.** "Nothing found" is suppressed there for the reason the Link must be too: the source half never ran, so the book may well be known. Offering to type it by hand would invite a duplicate private Book for an ISBN Finna holds. Both guards are the same expression, which is why the Link lives inside it.

## Verification

**Commands:**

- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors (pre-existing migration-argument warnings remain).
- `npm run test:unit` -- expected: all pass, `lookupPage.unit.spec.ts` included.
- `npm run test:int` -- expected: all pass, unchanged.
- `npx prettier --check` on every changed file -- expected: clean.
- `npx playwright test tests/e2e/addByHand.walk.spec.ts` -- expected: 1 passed; uncommitted, and what it saw goes under `## Auto Run Result`.

## Auto Run Result

Status: done

**Implemented.** Lookup's empty state is no longer a dead end. Inside the existing guard (`groups !== null && !limited && mine.length + elsewhere.length === 0`) the "Nothing found" paragraph and an "Add by hand" `TextLink` now sit in one left-aligned column, the Link addressing `/scan?title=${encodeURIComponent(query)}` -- `query` being the trimmed text the two searches were given, so a hand-typed `?q=%20%20linna%20%20` carries `linna`. The existing `answer.addByHand` key supplies the wording in both catalogues; nothing else changed: no new message key, no service, no `scanParams`, no Answer code.

**Files changed**

- `src/app/(frontend)/scan/find/page.tsx` -- the `TextLink` inside the empty-state guard, and a doc-comment paragraph saying the empty state is a way in.
- `tests/unit/lookupPage.unit.spec.ts` -- the Link and its encoded href on the empty-state case, a new trimmed-`q` case, and its absence with each group alone, with no `q`, with a blank `q`, and under `RATE_LIMITED`.
- `tests/e2e/addByHand.walk.spec.ts` (uncommitted walk) -- the whole path on the real surface.

**Verification**

- `npm run typecheck` -- clean.
- `npm run lint` -- 0 errors, 60 pre-existing warnings (migration arguments).
- `npm run test:unit` -- 90 files, 1264 tests passed (`lookupPage.unit.spec.ts`: 12).
- `npm run test:int` -- 81 files, 709 tests passed, unchanged.
- `npx prettier --check` on every changed file -- clean.
- `npx playwright test tests/e2e/addByHand.walk.spec.ts` -- 1 passed.

**What the walk saw.** Signed in, went to `/scan/find?q=Käsin lisätty <run>`: "Nothing found" with an "Add by hand" Link whose href was `/scan?title=K%C3%A4sin%20lis%C3%A4tty%20<run>`. Following it opened the Not found Answer (heading "Not found") with that exact text already in the Title field. The form asks for an author, so the walk filled one; Add to library then saved and raised "Saved to E2E shelf". Repeating the same search afterwards showed the book under "In your library", with no "Nothing found" line and no "Add by hand" Link.

**Residual risks.** Only `src/app/(frontend)/scan/find/page.tsx` changed, the same file Story 8.8 last touched -- nothing is shared with a parallel story. The Answer this Link opens requires an author before Add to library succeeds, which the walk had to fill; that is Story 3.49's existing form behaviour, not something this story changed, but it means "the typed text alone" is not quite enough to save from the empty state.
