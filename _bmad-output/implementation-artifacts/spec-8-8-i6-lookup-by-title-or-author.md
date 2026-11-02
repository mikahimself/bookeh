---
title: '8.8 [I6] Lookup by title or author'
type: 'feature'
created: '2026-11-02'
baseline_revision: 'fb3a450415b5cd1ed97abc2f981cb48860a3f2ae'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      An own Book that matches but falls outside `searchMine`'s 20-row cap is
      listed under "Elsewhere" alone, with no "In your library" row and no sign
      that the own group was truncated.
    evidence: |-
      `searchMine` applies `MINE_SEARCH_LIMIT = 20` in SQL with no "more
      results" signal (`src/lib/shelf/searchMine.ts:18`), and the overlap drop
      keys only on the own Books it returned, so a broad query (an author with
      many editions) can show a held Book as an outside result. The epic's
      "nothing the user already holds stays hidden" is what this cuts against.
      Not caused by this story: without the overlap drop the same query shows
      the same truncated own group plus the same Elsewhere row, so the drop
      changes nothing here -- the cap is Story 8.6's design. Tapping the row
      still reaches the correct In library Answer, so the Answer never lies;
      only the grouping does. What would settle it: the owner's call on whether
      the own group carries a "more matches" marker, a raised cap, or a wider
      ISBN read for the dedupe -- a product decision above a story's level.
    location: >-
      src/app/(frontend)/scan/find/lookupRows.ts:53
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Both halves of search are built and nothing calls them: `searchMine()` (8.6) and `searchBooks()` (8.5) have no surface, and the spine's `/scan/find` Routes row is declared and unimplemented. A shop check on a book with no readable barcode, or in a web shop on the desktop, has no way in.

**Approach:** Add the Lookup screen at `/scan/find`, a full-screen task inside the existing `/scan` segment so the camera session, `TaskBase` and Back all keep working. One field for title or author submits `?q=` on Go; the page reads `?q=` on the server, calls `searchMine()` then `searchBooks()`, and renders two groups -- "In your library" then "Elsewhere" -- one row each with cover, title, author and the edition line. An own row links to `/scan?book=<bookId>` (8.7's free, source-free Answer); an Elsewhere row to `/scan?isbn=<isbn13>`. Scan gets the "Find by title or author" Link that opens it.

## Boundaries & Constraints

**Always:**

- `/scan/find` is a `page.tsx` under `src/app/(frontend)/scan/find/`, so `ScanLayout` wraps it: one `CameraSession`, one `TaskBase`, one `ReleaseHeldToast` for the whole task. It does `requireUser()` as `/scan`'s page does.
- The search runs on the server from `?q=`, never on the client: the page calls `searchMine(ctx, q)` and `searchBooks(ctx, q)`, one after the other (AD-16: calls on one context never run concurrently). `searchMine` first, so the viewer's own holdings are read even when the source search refuses.
- A blank or missing `?q=` renders the field alone: no group, no "Nothing found", and neither search is called (both already answer `[]` for blank text, but the page must not reach the "Nothing found" state before a search has run).
- `searchBooks()` throws `DomainError('RATE_LIMITED')`. The page catches that one code, keeps the own group it already read, shows no Elsewhere group and raises the `RATE_LIMITED` error toast -- exactly as `/scan` does for a refused lookup (`page.tsx`'s `RaiseToast` with a fresh `key`), so the message is the catalogue's "Too many lookups. Wait a moment." Any other error propagates to Next's error handling.
- An Elsewhere hit whose `isbn13` equals the effective `isbn13` of a Book already in the own group is dropped from Elsewhere: one book is one row, and the own group is the answer for it.
- An own row's href is `/scan?book=<bookId>`, whether or not the Book has an ISBN: that Answer asks no source and counts no lookup (8.7, AD-9), and carries the Book's own ISBN so it behaves exactly as the `?isbn=` Answer would. An Elsewhere row's href is `/scan?isbn=<isbn13>`.
- Rows are pushed, not replaced, so Back from the Answer returns to the results (`useTaskBack('/scan')` goes history-back while the task has an entry below).
- A row shows the `Cover` component: an own row's `book.coverUrl`, an Elsewhere row's `coverUrl({ isbn13 })` when `hasCover` is true and `null` otherwise, so the cover placeholder stands in where nothing can be served (AD-14). The browser never gets a source URL: `searchBooks()` has already recorded each hit's URL as that user's cover preview.
- The edition line is the parts that exist joined `" · "`: for an Elsewhere row `binding · year · publisher`, for an own row `year · publisher` (`EffectiveBook` stores no binding -- binding is display-only, never stored). Authors are their names joined `", "`.
- An own row whose Book has a lent copy ends with the lent marker and `loans.lentMarker` for that copy's borrower (FR-37), the first lent copy in `Holdings` order, drawn with `markerSlotClass` as `BookRow` draws it.
- With a `?q=` that both searches answered empty, the page shows "Nothing found" and nothing else.
- The progress line runs while the search is in flight: the field navigates in a `useTransition`, with `ProgressLine` while pending, as `ScanScreen` and `SearchField` do.
- `ScanScreen` gains a "Find by title or author" `TextLink` to `/scan/find`, beside the existing "Add without ISBN" Link.
- New catalogue keys go in both `messages/en.json` and `messages/fi.json` under one `lookup` namespace; no existing key changes.

**Never:**

- No "Add by hand" Link on the empty state: that is Story 8.9, which hangs off this story's empty state.
- No change to `searchMine`, `searchBooks`, `searchSources`, `recordCoverPreview`, `lookupBook`, `answer.ts`, the cover route, any collection or any migration. This story is a surface over contracts that are already built.
- No spine change: the `/scan/find` Routes row already states this address and its `?q=`, and nothing here alters an AD.
- No `search()` added to the fixture source, so the e2e lane's Elsewhere group is empty; Story 8.10 owns the end-to-end shop check.
- No search as the user types, no debounce, no client-side fetch, no `useSearchParams`-driven refetch: Go submits, the server renders.
- No reuse of `BookRow`: it is one row per _copy_ with a shelf's size prefs and select mode, and bending it to a Book-level row with two different endings would serve neither.
- No second group ordering, no sort control, no paging: `searchMine`'s author-ascending cap and `searchSources`' source order are the orders.
- No `?q=` on `/scan` itself, and no change to what a barcode read submits.

## I/O & Edge-Case Matrix

| Scenario                  | Input / State                                            | Expected Output / Behavior                                                              | Error Handling         |
| ------------------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ---------------------- |
| No `q`                    | `/scan/find`                                             | the field alone; neither search called                                                  | —                      |
| Blank `q`                 | `/scan/find?q=%20%20`                                    | the field alone, the text in it; neither search called                                  | —                      |
| Both groups               | `q` matches an own Book and two source hits              | "In your library" with the own row, then "Elsewhere" with both hits                     | —                      |
| Own group only            | `q` matches an own Book, no source hit                   | the own group alone; no "Elsewhere" heading, no "Nothing found"                         | —                      |
| Elsewhere only            | no own match, two source hits                            | the Elsewhere group alone                                                               | —                      |
| Nothing found             | both searches answer `[]`                                | "Nothing found", no group heading                                                       | —                      |
| Overlap dropped           | an own Book with ISBN X, and a source hit for X          | one row, in the own group                                                               | —                      |
| Own Book, no ISBN         | the own match has `isbn13: null`                         | its row links `/scan?book=<bookId>`; no overlap check can drop it                       | —                      |
| Own row href              | an own match with an ISBN                                | still `/scan?book=<bookId>`, not `?isbn=`                                               | —                      |
| Elsewhere row href        | a hit for ISBN X                                         | `/scan?isbn=X`                                                                          | —                      |
| Lent own copy             | the own Book's copy is out on loan to Hilla              | its row ends with the marker and "Lent · Hilla"                                         | —                      |
| Own row meta              | own Book, 1954, WSOY, two authors                        | "Väinö Linna, Toinen · 1954 · WSOY" shape: authors line, then `year · publisher`        | —                      |
| Elsewhere row meta        | a hit with binding, year, publisher                      | `binding · year · publisher`                                                            | —                      |
| Partial meta              | a hit with a year and no binding or publisher            | the year alone, no stray separator                                                      | —                      |
| Cover servable            | a hit with `hasCover: true`                              | the row's cover `src` is `/data/cover/<isbn13>`                                         | —                      |
| Cover not servable        | a hit with `hasCover: false`                             | the cloth placeholder, the hit's title in it                                            | —                      |
| Rate-limited              | `searchBooks` throws `RATE_LIMITED`, own group non-empty | the own group renders, no Elsewhere group, the "Too many lookups. Wait a moment." toast | caught, not propagated |
| Rate-limited, nothing own | the same with no own match                               | the toast, and no "Nothing found" (the source half never answered)                      | caught                 |
| Other lookup error        | `searchBooks` throws `INTERNAL`                          | propagates to Next's error handling                                                     | rethrown               |
| Submit                    | text typed, Go pressed                                   | pushes `/scan/find?q=<text>` in a transition, with the progress line                    | —                      |
| Blank submit              | the field is empty, Go pressed                           | no navigation                                                                           | —                      |
| Scan Link                 | `/scan` renders                                          | a "Find by title or author" Link to `/scan/find`                                        | —                      |
| Back from a row           | a row tapped, then Back on the Answer                    | returns to `/scan/find?q=<text>` with the results                                       | —                      |

</intent-contract>

## Code Map

- `src/lib/catalogue/searchBooks.ts:44` -- `searchBooks(ctx, text)`: blank text answers `[]` with nothing counted, otherwise `limitLookups()` (throws `RATE_LIMITED` before any source) then `searchSources()`, recording each hit's cover URL as a preview. `:16` `SearchDraft` = `SearchHit` without `coverUrl`, plus `hasCover` -- the row's shape. Read-only here.
- `src/lib/shelf/searchMine.ts:42` -- `searchMine(ctx, text)` -> `MyBook[]`: author-ascending, one row per Book, capped at `MINE_SEARCH_LIMIT` (`:18`), blank text answers `[]`. Read-only.
- `src/lib/shelf/query.ts:76` -- `MyBook = { book: EffectiveBook; mine: Holdings }`.
- `src/lib/books/effectiveBook.ts:18-37` -- `EffectiveBook`: `bookId`, `isbn13` (nullable), `title`, `authors: Named[]`, `publisher`, `year`, `language`, `coverUrl`. No `binding` -- hence the own row's shorter edition line.
- `src/lib/metadata/source.ts:31-34` -- `SearchHit`: `isbn13`, `title`, `authors`, `publisher`, `year`, `binding`, `source`, optional `coverUrl`. `authors` is `{ name: string; sortName?: string }[]`, so it joins on `.name` exactly as `EffectiveBook.authors` does -- one join serves both groups.
- `src/lib/books/holdings.ts:13-28` -- `CopyLine` (with `loan: { person: Named; … } | null`) and `Holdings`, for the lent marker.
- `src/app/(frontend)/isLent.ts:7` -- `isLent(copy)`, the narrowing a client component may import (not from `src/lib`).
- `src/lib/books/coverUrl.ts:13` -- `coverUrl({ isbn13 })` -> `/data/cover/<isbn13>`, the only producer of a cover URL. A search records one URL per hit, so the preview route's `pick` resolves to index 0 (`src/lib/catalogue/coverPreview.ts:56-62`).
- `src/app/(frontend)/scan/layout.tsx` -- `ScanLayout`: `CameraSession`, `TaskBase`, `ReleaseHeldToast`. It already wraps any nested segment, so `scan/find/page.tsx` inherits the task; `CameraSession.tsx:35` states nothing touches the camera until `start()`, which only `ScanScreen` calls, so Lookup does not turn it on.
- `src/app/(frontend)/scan/page.tsx:70-95` -- the model for this page: `ViewTransition enter="task-enter" exit="task-exit"`, `FullScreenTask`, and `:81-85` the `RaiseToast` with `key={crypto.randomUUID()}` and `{ kind: 'error', code: 'RATE_LIMITED' }` that the rate-limit branch copies.
- `src/app/(frontend)/scan/ScanScreen.tsx:56-64` -- `go()`: the `useTransition` + `router.push` the Lookup field mirrors; `:200-205` the `ProgressLine` while pending; `:243-247` the `TextLink` block where the new "Find by title or author" Link goes; `:225-241` the `TextField` with its `action` submit button.
- `src/app/(frontend)/components/Cover.tsx:76` -- `Cover({ src, title, language })`: the cloth placeholder when `src` is `null` or fails. A client component.
- `src/app/(frontend)/(sections)/BookRow.tsx:95-104` -- the lent-marker ending to copy: `markerSlotClass` plus the truncated borrower; `:19` the `joined()` helper shape for the meta line.
- `src/app/(frontend)/components/ui/classes.ts` -- `markerSlotClass`.
- `src/app/(frontend)/components/Link.tsx` -- `TextLink`, for the Scan Link.
- `src/app/(frontend)/components/FullScreenTask.tsx:26` -- `FullScreenTask({ title, children })`, with the X and the centred phone-width column on wide screens.
- `src/app/(frontend)/components/navigation.ts:280` -- `useTaskBack(fallback)`: history-back while `depth > taskBase`, so a pushed row makes Back on the Answer land on the results. Nothing to change.
- `src/app/(frontend)/components/toast/RaiseToast.tsx` and `store.ts:3-13` -- `ToastInput`; `{ kind: 'error', code: 'RATE_LIMITED' }` is what the branch raises.
- `src/app/(frontend)/scan/answer.ts:286-301` -- `scanParams()`: `?book=` is read as a row id, ranked after `?isbn=`. Read-only; it shows why an own row's `?book=` href is enough.
- `src/lib/errors.ts` -- `DomainError` and its `code`, for the `RATE_LIMITED` catch.
- `messages/en.json`, `messages/fi.json` -- `errors.RATE_LIMITED` is already "Too many lookups. Wait a moment." / "Liikaa hakuja. Odota hetki."; `loans.lentMarker` is "Lent · {person}" / "Lainassa · {person}"; `scan` holds `addWithoutIsbn` and `find`. The new `lookup` namespace goes beside them in both files.
- `tests/unit/wishlistPage.unit.spec.ts:1-70` -- the page-level spec pattern this story follows: `serverTree()`, the `next-intl` English translator, the `next/navigation` and `next/link` mocks.
- `tests/helpers/serverTree.ts:8` -- `serverTree(node)`, which awaits async server components.
- `tests/unit/collectionPage.unit.spec.ts:29-57` -- how a row's cover, title, meta and ending are asserted through `getAllByRole('listitem')` and `within`.
- `src/lib/metadata/sources/fixture.ts` -- no `search`, so the e2e lane has no Elsewhere group. Read-only.
- `tests/e2e/account.ts` -- `E2E_EMAIL`, `E2E_PASSWORD`, `E2E_LOCATION` for the walk; `tests/e2e/heldAnswers.walk.spec.ts` and `bookWithoutIsbn.walk.spec.ts` are the sign-in and toast-locator precedents (both git-ignored).
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:561` -- the `/scan/find` Routes row, already correct: this story implements it and changes nothing.

## Tasks & Acceptance

**Execution:**

- `src/app/(frontend)/scan/find/lookupRows.ts` -- a pure, hook-free builder: own `MyBook[]` + `SearchDraft[]` -> the two groups' rows (href, cover src, title, language, authors line, edition line, lent borrower), with the overlap drop -- the grouping, the hrefs, the meta joins and the dedupe are the behaviour that can break silently, and a pure function is what a unit test can pin.
- `src/app/(frontend)/scan/find/LookupRow.tsx` -- one row: `Cover`, title, authors line, edition line, and the lent ending -- the row is shared by both groups and must read the same in each.
- `src/app/(frontend)/scan/find/LookupField.tsx` -- the client field: one `TextField` for title or author, Go pushes `/scan/find?q=`, `ProgressLine` while pending, blank submits nothing -- the search runs on Go, not as the user types.
- `src/app/(frontend)/scan/find/page.tsx` -- `requireUser()`, `?q=`, `searchMine()` then `searchBooks()` with the `RATE_LIMITED` catch, the `FullScreenTask` with both groups, the empty state and the toast -- the story's surface.
- `src/app/(frontend)/scan/ScanScreen.tsx` -- the "Find by title or author" Link to `/scan/find` -- without it the screen has no entry point.
- `messages/en.json`, `messages/fi.json` -- the `lookup` namespace: `open`, `heading`, `field`, `submit`, `mine`, `elsewhere`, `nothing` -- both catalogues carry every string the screen shows.
- `tests/unit/lookupRows.unit.spec.ts` -- the matrix's grouping, href, meta, overlap and lent rows over the pure builder -- one focused test per behaviour that can break.
- `tests/unit/lookupPage.unit.spec.ts` -- the page, in the `wishlistPage` pattern: the field alone with no `q`, both groups in order with their headings, "Nothing found", the rate-limit branch (own group kept, no Elsewhere, the toast raised), and the Scan Link -- the page wiring is the surface the criteria observe, and the story leaves it guarded rather than repeating 8.7's deferral.

**Acceptance Criteria:**

- Given a signed-in viewer on `/scan/find?q=<text>` whose text matches one of their own Books and two source hits, when the page renders, then it is a full-screen task with "In your library" above "Elsewhere", the own row first, and each row showing a cover or its placeholder, the title, the authors and the edition line.
- Given that rendered own row, when it is followed, then the address is `/scan?book=<bookId>`, and following an Elsewhere row gives `/scan?isbn=<isbn13>`.
- Given `/scan`, when it renders, then a "Find by title or author" Link opens `/scan/find`, and the Lookup field submits the typed text to `/scan/find?q=<text>` on Go while an empty field submits nothing.
- Given `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run test:int`, when they run, then all pass, with every existing spec green without edits.
- Given the walk (`tests/e2e/*.walk.spec.ts`, uncommitted), when it searches `/scan/find` for a seeded own Book's title, then the own group renders with that row, tapping it opens its Answer and Back returns to the results; a text nothing matches shows "Nothing found"; what it saw is recorded under `## Auto Run Result`.

## Spec Change Log

## Review Triage Log

### 2026-11-02 — Review pass

- verdicts: 25 findings — high 0, medium 1, low 8, false 13, maybe-false 0, plus 3 descriptive-only readings
- findings:
  - `[false]` `[reject]` Client push (`%20`) and the no-JS GET fallback (`+`) spell the same query differently — the stated harm does not occur: a query string's `+` decodes to a space under `URLSearchParams`, which is how Next parses `searchParams`, so both spellings reach `searchMine`/`searchBooks` as the same text; only the address's spelling differs.
  - `[low]` `[patch]` The typed text is pushed untrimmed, so the field shows `"  linna  "` while the trimmed text is searched — patched: `submit` now pushes `text.trim()`.
  - `[low]` `[patch]` `prefetch={false}` is load-bearing and unexplained (prefetching an Elsewhere row would run `limitLookups()` and the sources) — patched: the reason is now a comment on the prop.
  - `[low]` `[reject]` A refused source search leaves no persistent line or Try again once the toast expires — the intent settles this explicitly ("raises the `RATE_LIMITED` error toast, as `/scan` does for a refused lookup"); a persistent line with its own retry action is new surface the intent did not ask for, and the epic's partial line is a lookup's, not a search's.
  - `[medium]` `[defer]` A capped own group is presented as the whole answer — real but not caused by this story; recorded in `deferred` with what would settle it.
  - `[low]` `[reject]` Elsewhere rows pass `language: null`, so a foreign-language hit's cover placeholder hyphenates as Finnish — the fix is a new field on `SearchHit`, which the intent's Never list excludes ("no change to `searchSources`"); the placeholder is `aria-hidden` decoration beside the real title. Noted as a residual risk instead.
  - `[false]` `[reject]` `!limited` is redundant on the Elsewhere guard — it is the spec rule ("shows no Elsewhere group") written where the rule lives; `hits` being `[]` under `limited` is an implementation detail the guard deliberately does not lean on, so removing it would make the rule implicit rather than wrong.
  - `[low]` `[patch]` `book()`, `copy()`, `mine()` and `hit()` are duplicated verbatim across the two new specs — patched: moved to one mock-free helper imported by both.
  - `[false]` `[reject]` No test guards `requireUser()` on the page — the rule it names (FR-48, own-holdings-only) is enforced and tested where it is enforced, in the access layer (`tests/int/searchMine.int.spec.ts`'s two-user leak case); a unit test with `requireUser` mocked would assert the mock, not the rule.
  - `[false]` `[reject]` `?book=` is interpolated raw while `?isbn=` is encoded — `bookId` is a `number` from the database, so there is nothing to escape and no bad outcome; the asymmetry implies no trust distinction that exists.
  - `[low]` `[reject]` `lookup.heading` and `lookup.submit` are both "Find", and `epic-8-context.md` reads "a stated error code" — the heading/button fix edits this build's spec string table, and the context file is generated; neither is a defect in the code under review.
  - `[medium]` `[defer]` (edge-case layer) An own match beyond the cap is missing from the `held` set — same root cause as the capped-own-group finding above; shares its route.
  - `[false]` `[reject]` Elsewhere is uncapped and buries the own group — the own group renders first in the page's JSX, above Elsewhere, so a long Elsewhere list cannot push it out of the way.
  - `[false]` `[reject]` Re-submitting the same text may not re-render, so the rate-limit toast is not re-raised — refuted by Next's default client cache: page segments are not reused on a `Link`/`useRouter` navigation (`node_modules/next/dist/docs/01-app/02-guides/upgrading/version-15.md:525`) and this project sets no `staleTimes`, so the push re-renders the page and `RaiseToast`'s fresh `key` raises the toast again.
  - `[low]` `[reject]` The field always pushes, unlike `ScanScreen`'s replace-on-refine, so searches stack history entries — the intent specifies push for _rows_ and leaves the field open; walking back through earlier queries is as defensible as skipping them, the X still leaves the whole task via `taskBase`, and changing it would trade one reasonable Back semantics for another.
  - `[low]` `[reject]` A blank submit gives no feedback — `ScanScreen`'s field does exactly the same ("Go on an empty field is no submission"); matching the established precedent beats adding a focus nudge on one screen.
  - `[false]` `[reject]` A throwing `searchMine` loses the source results too — that is the specified behaviour: the intent catches `RATE_LIMITED` alone and propagates everything else to Next's error handling.
  - `[low]` `[reject]` No length bound on `q` before it reaches SQL and the source requests — the collection's own `?q=` is unbounded the same way, so this is a pre-existing app-wide pattern, not this story's; an over-long source request fails, is logged and contributes nothing, and the fix adds a guard for a case nobody meets in everyday use.
  - `[low]` `[patch]` The page doc comment says the search runs "with the text as typed" while the code passes the trimmed text — patched: the comment now says trimmed.
  - `[false]` `[reject]` The spec says `lookupPage.unit.spec.ts` covers "the Scan Link" but that assertion lives in `scanScreen.unit.spec.ts` — the behaviour is covered; the only fix would edit this build's spec, which triage rejects.
  - `[false]` `[reject]` (verification-gap layer, Other findings) The overlap drop keys only on the own Books `searchMine` returned — the same root cause as the deferred cap entry; filed there rather than twice.
  - `[false]` `[reject]` (intent-alignment) `RATE_LIMITED` suppressing "Nothing found" is an unstated choice — the spec's I/O matrix states it outright ("no 'Nothing found'"), so it is settled, not inferred.
  - `[false]` `[reject]` (intent-alignment) A whitespace-only `q` kept verbatim in the field is unstated — the matrix row states it ("the field alone, the text in it").
  - `[false]` `[reject]` (intent-alignment) The no-JS GET fallback was added beyond the intent — `ScanScreen`'s field already degrades to a GET form, so this follows the precedent and adds no behaviour the intent forbids.
  - `[low]` `[reject]` (intent-alignment) Route-surface clauses (layout composition, Back, the progress line) are verified at the component surface or not at all — CLAUDE.md limits Playwright to scan-to-save and the shop check (Story 8.10's), and rejects a finding that only asks for a test unless it names the criterion or spine rule the test would guard; layout and Back were walked on the real surface and recorded under Auto Run Result.

## Design Notes

**Why an own row links to `?book=`, not `?isbn=`.** 8.7 made the two addresses equivalent for a Book with an ISBN -- `answerForBook` carries the Book's own ISBN, so Look it up again and the AD-5 auto-share still work. They differ in cost: the `?isbn=` path calls `limitLookups()` and, on a private Book, asks the sources to warm the cache, while `?book=` asks nothing and counts nothing. In a shop, tapping a row for a book you already own should never be the thing that exhausts the rate limit. So every own row uses `?book=`, with no special case for a missing ISBN.

**Why the overlap is dropped from Elsewhere.** The groups answer different questions -- "you have this" and "this exists" -- but the point of putting the own group first is that nothing the viewer holds stays hidden. A book listed twice, once with a location and once without, reads as two books. EXPERIENCE.md does not rule either way; dropping the duplicate is the reading that serves the shop check, and both rows would have led to the same held Answer anyway. The drop keys on the own Book's effective `isbn13`, so a Book with none can never be dropped.

**Why the rate limit keeps the own group.** `searchMine()` counts nothing and has already resolved when `searchBooks()` refuses. Throwing the own results away to show an error would hide exactly the facts FR-20 exists to surface. The toast says the source half did not run; the own half is still the truth.

**The `lookup` namespace**, terse as DESIGN.md's voice asks, and `submit` reusing nothing so the field's button reads as its own:

| key         | en                      | fi                        |
| ----------- | ----------------------- | ------------------------- |
| `open`      | Find by title or author | Hae nimellä tai tekijällä |
| `heading`   | Find                    | Hae                       |
| `field`     | Title or author         | Nimi tai tekijä           |
| `submit`    | Find                    | Hae                       |
| `mine`      | In your library         | Omassa kirjastossa        |
| `elsewhere` | Elsewhere               | Muualla                   |
| `nothing`   | Nothing found           | Ei löytynyt mitään        |

**Row shape** (the builder's output, so the row component stays dumb):

```ts
type LookupRowData = {
  href: string
  cover: string | null
  title: string
  language: string | null
  authors: string
  edition: string
  lentTo: string | null
}
```

## Verification

**Commands:**

- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors (pre-existing migration-argument warnings remain).
- `npm run test:unit` -- expected: all pass, including the two new specs.
- `npm run test:int` -- expected: all pass, unchanged.
- `npx prettier --check` on every changed file -- expected: clean.
- `npx playwright test tests/e2e/lookup.walk.spec.ts` -- expected: 1 passed; uncommitted, and what it saw goes under `## Auto Run Result`.

## Auto Run Result

Status: done

**Implemented.** `/scan/find` is the Lookup screen: a `page.tsx` under the `/scan` segment, so `ScanLayout`'s `CameraSession`, `TaskBase` and `ReleaseHeldToast` wrap it and the camera stays off. `?q=` is read on the server and run through `searchMine()` then `searchBooks()`, one after the other; `lookupRows()` turns the two answers into the two groups' rows, dropping an Elsewhere hit whose ISBN a Book in the own group already has. An own row addresses `/scan?book=<bookId>`, an Elsewhere row `/scan?isbn=<isbn13>`, both pushed. A `RATE_LIMITED` refusal from the source half keeps the own group, drops the Elsewhere group and raises the error toast; nothing else is caught. Scan gained the "Find by title or author" Link.

**Files changed**

- `src/app/(frontend)/scan/find/lookupRows.ts` -- the pure builder: grouping, hrefs, cover source, meta joins, the overlap drop and the lent borrower.
- `src/app/(frontend)/scan/find/LookupRow.tsx` -- one row, shared by both groups.
- `src/app/(frontend)/scan/find/LookupField.tsx` -- the client field; Go pushes `?q=` in a transition with the progress line, blank submits nothing.
- `src/app/(frontend)/scan/find/page.tsx` -- `requireUser()`, the two searches, the groups, the empty state and the toast.
- `src/app/(frontend)/scan/ScanScreen.tsx` -- the Lookup Link beside Add without ISBN.
- `messages/en.json`, `messages/fi.json` -- the `lookup` namespace (`open`, `heading`, `field`, `submit`, `mine`, `elsewhere`, `nothing`).
- `tests/helpers/lookupFixtures.ts` -- the `book()`, `copy()`, `mine()` and `hit()` builders both new specs share (mock-free, nothing from `collectionPage.ts`).
- `tests/unit/lookupRows.unit.spec.ts`, `tests/unit/lookupPage.unit.spec.ts`, `tests/unit/scanScreen.unit.spec.ts` -- the builder's behaviour, the page wiring, and Scan's two Links.

**Review findings**

Four layers ran (blind hunter, edge cases, verification gaps, intent alignment) and reported 25 findings between them; the verification-gap layer found no gaps.

Patched (4, all `low`): the field pushed the typed text untrimmed, so the address and the field disagreed with the search; `prefetch={false}` on a row was load-bearing and unexplained (a prefetched Elsewhere row would run `limitLookups()` and ask the sources); the page's doc comment said "as typed" where the code trims; and the `EffectiveBook`/`SearchDraft` fixtures were duplicated verbatim across the two new specs, now one shared helper.

Deferred (1, `medium`): an own Book beyond `searchMine`'s 20-row cap is listed under Elsewhere alone, with no sign the own group was truncated. Not caused by this story -- the cap is Story 8.6's and the overlap drop changes nothing about that case -- and the row still opens the correct In library Answer, so only the grouping misleads. Recorded in `deferred` with what would settle it.

Rejected (20), with reasons: the `%20`-versus-`+` address spelling (a query string's `+` decodes to a space, so both reach the searches as the same text); a persistent "didn't answer" line with its own Try again (the intent specifies the toast, as `/scan` does); `language: null` on Elsewhere covers (the fix adds a field to `SearchHit`, which the intent's Never list excludes); `!limited` on the Elsewhere guard (it is where the spec rule lives); no test around `requireUser()` (the rule it names is enforced and tested in the access layer); the raw `?book=` interpolation (a `number` needs no escaping); the heading/button both reading "Find" and the generated context file's wording (the fix edits this build's spec); Elsewhere burying the own group (the own group renders above it); a same-text re-submit not re-rendering (Next does not reuse page segments on a push, and this project sets no `staleTimes`); the field pushing rather than replacing on a refined search, and a blank submit giving no feedback (both match `ScanScreen`'s precedent); a throwing `searchMine` losing the source results (the specified behaviour); no length bound on `q` (the collection's `?q=` is unbounded the same way); the spec naming the wrong file for the Scan-Link assertion; and the three intent-alignment divergences plus its surface-mismatch note (each settled by the spec's own matrix, by `ScanScreen`'s precedent, or by CLAUDE.md's Playwright and test-only-finding conventions).

**Follow-up review recommended: false.** Patched entries by verdict: high 0, medium 0, low 4 -- no patched entry was `high` and fewer than two were `medium`.

**Verification**

- `npm run typecheck` -- clean.
- `npm run lint` -- 0 errors, 60 pre-existing warnings (unused migration arguments).
- `npm run test:unit` -- 90 files, 1263 tests, all passed (re-run after the review fixes).
- `npm run test:int` -- 81 files, 709 tests, all passed on re-run. On the implementation agent's first run `tests/int/covers.int.spec.ts` failed because the local `media-test` directory held orphan files from earlier runs, so the sweep counted 2 rather than 1. With the directory emptied (its contents parked at `/tmp/media-test-backup-8-8`) the file passes 18/18. Not caused by this story: it touches no media.
- `npx prettier --check` on every changed file -- clean.
- `npx playwright test tests/e2e/lookup.walk.spec.ts` -- 1 passed, re-run after the review fixes.

**Walk (uncommitted, `tests/e2e/lookup.walk.spec.ts`)** -- what it saw: signed in as the e2e user, added a Book by hand with a run-unique title and author, then took Scan's **Find by title or author** Link to `/scan/find`, which rendered the **Find** task with the field alone -- no group, no "Nothing found", no rows. Typing the title and pressing **Find** pushed `/scan/find?q=<title>` and rendered **In your library** alone (the fixture source has no `search()`, so Elsewhere is empty here), one row with the title, the author and `href="/scan?book=<bookId>"`. Following the row opened its **In library** Answer, and browser Back returned to the results with the group still there. Searching the author found the same row. A text nothing matches showed **Nothing found** with no group heading and no rows.

**Residual risks**

- The walk needs a run-unique title: the e2e database keeps what earlier runs saved, so a fixed title makes "the first row" ambiguous once the walk has run twice.
- Elsewhere is untested end to end by design (no `search()` on the fixture source); Story 8.10 owns that.
- A foreign-language Elsewhere hit's cover placeholder hyphenates as Finnish: `SearchHit` carries no language, and adding one would change a contract this story may not touch.
- The implementation agent emptied the local `media-test/` directory (contents parked at `/tmp/media-test-backup-8-8`) to get `tests/int/covers.int.spec.ts` green. That is a local-state change outside this story's scope, flagged for the owner rather than relied on; the story touches no media.
- Built alone, no files shared with a parallel worktree.
