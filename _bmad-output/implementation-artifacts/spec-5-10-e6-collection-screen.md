---
title: '5.10 [E6] Collection screen'
type: 'feature'
created: '2026-10-22'
baseline_revision: '7e70314e3e1e8391ff3b4a259e45c8e1c6f1588b'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** `/` renders nothing (`(sections)/page.tsx` returns `null`), so the app opens on an empty section, and "have I got it?" can't be answered (FR-23, FR-24). The shelf query, hydrated rows and labels exist (5.1–5.9) but nothing shows them.

**Approach:** The collection page parses its address with `parseShelfQuery`, renders the first page from `getShelfRows(ctx, query, { offset: 0, limit: SHELF_PAGE_SIZE })` as rows at size m, under a tools row and a count line. A client search field writes `q` to the URL after a short pause. The empty, no-match and load-failure states follow EXPERIENCE.md.

## Boundaries & Constraints

**Always:**
- The page reads the address only through `parseShelfQuery`; every href it builds (search, Clear) comes from `shelfHref` (AD-7).
- One row per copy, in `getShelfRows` order. Rows at size m (DESIGN.md density table):
  - the cover is 32 × 48px (`Cover`, 2:3);
  - the title in `title` sits on one line, truncated;
  - a `meta` second line in `text-muted` reads author names joined by ", ", then year, then publisher, joined by " · ". Missing parts are left out;
  - 8px above and below, `spacing.4` between the cover, the text and the ending, no dividers.
- Row ending: "Ordered" in `meta` for an ordered copy. Owned copies end blank, since locations on rows arrive in 5.26 and lent markers in Epic 6.
- Tools row, after the mock-ups:
  - the search field (underline, no label, placeholder "Search your books", accessible name the same), then Filter and Select as Links;
  - then the rows / covers and s / m / l Text switches, showing rows and m. On the phone they sit on a second line.
  - Filter, Select and both switches are rendered **disabled** until 5.14, 5.27 and 5.13 wire them.
- Count line (`meta`, `text-muted`, directly under the tools):
  - with no search and no filter: "{n} books" (ICU plural);
  - otherwise the active values, then the count, then the Clear Link, joined by " · ". Clear goes to `shelfHref` of the query with `q` and every filter removed; sort and dir are kept, and `book` is dropped.
- Active values are joined by ", " in `ShelfQuery` order: the search text in quotes, then each filter value. Id values take their name from `labels[\`${field}:${id}\`]`, and an id without a label is left out. Status and read show as lowercase words. Ranges show as `{from}–{to}`, with an empty end left blank.
- Search applies 300ms after the last keystroke:
  - the URL is replaced (not pushed) with `scroll: false`, keeping every other parameter, `book` included;
  - text that is blank after trimming removes `q`;
  - a progress line runs while the new page renders;
  - when `q` changes from outside the field (Clear, Back), the field shows the new value.
- `/` focuses the search on wide screens (≥ 900px) when focus is not in an editable field; it never types the `/`.
- All strings are new `collection.*` keys in both `messages/en.json` and `messages/fi.json`. The dry remark is a placeholder for Mika to approve (EXPERIENCE.md, Open items).

**Never:**
- No `/data/shelf`, no loading more, no `sessionStorage` (5.11, 5.12). No covers layout or size switching (5.13), Filter panel (5.14–5.17), Book detail or `?book=` handling (5.18), row links, or select mode (5.27).
- No shelf SQL or effective-value logic outside `lib/shelf` / `lib/books`; no client-side fetch of rows.
- No change to `lib/shelf` or the spine.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Rows | 3 copies, `/` | Tools row, "3 books", three rows at m | — |
| Ordered | an ordered copy | its row ends "Ordered" | — |
| First run | no copies, `/` | "No books yet", the dry remark, Scan book (wide only), "0 books" | — |
| No match | `/?q=zzz` with copies | `“zzz” · 0 books · Clear`, then "No books match" with Clear | — |
| Filter labels | `/?location=3&read=false` | `Tampere, unread · 14 books · Clear` | an unlabelled id is left out |
| Load failed | `getShelfRows` throws | Tools row, then "Couldn't load." with the "Try again" Link | the error is logged; Try again calls `router.refresh()` with the progress line |
| Search typed | "linna" on `/?location=3&book=7` | after 300ms `replace('/?q=linna&location=3&book=7', { scroll: false })` | — |
| Search blanked | "  " | `q` removed | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/page.tsx` -- the stub to replace. `requireUser()` returns the `Context`. Next 16 `searchParams` is a Promise; read `node_modules/next/dist/docs/01-app/` before writing (CLAUDE.md).
- `src/app/(frontend)/(sections)/layout.tsx` -- section shell; the `scanBook` Link pattern (`buttonClass('primary')`, `transitionTypes={['task-open']}`), page margins `px-page-margin-phone wide:px-page-margin`. `loading.tsx` shows the progress line on first render.
- `src/lib/shelf/query.ts` -- `parseShelfQuery`, `shelfHref`, `SHELF_PAGE_SIZE`, `ShelfQuery`, `ShelfRows`, `ShelfRow`, `ShelfParams` (client-importable).
- `src/lib/shelf/getShelfRows.ts` -- `getShelfRows(ctx, query, range)` → `{ rows, total, labels }`; `labels` holds only labelled location, genre, author and series ids.
- `src/lib/books/effectiveBook.ts:20` -- `EffectiveBook` (`title`, `authors: Named[]`, `year`, `publisher`, `coverUrl`); `src/lib/books/holdings.ts:12` -- `CopyLine` (`copyId`, `status`).
- `src/app/(frontend)/components/Cover.tsx` -- `Cover({ src, title })`, fills its parent's width at 2:3.
- `src/app/(frontend)/components/TextSwitch.tsx` -- needs a `disabled` prop (buttons disabled; the chosen option keeps `text-text`).
- `src/app/(frontend)/components/Link.tsx` -- `TextLink` (Clear), `ActionLink` (Try again, disabled Filter / Select), `linkClass`.
- `src/app/(frontend)/components/TextField.tsx` -- `fieldClass(false)` for the search input's underline.
- `src/app/(frontend)/components/ProgressLine.tsx`; `scan/UnavailableActions.tsx:30` -- the `useTransition` + `router.refresh()` retry pattern.
- `messages/en.json`, `messages/fi.json` -- no `collection` namespace yet; `progress.loading` exists.
- `tests/unit/editBookScreen.unit.spec.ts:1-25` -- jsdom test pattern: `next-intl` mocked to keys, `next/navigation` `useRouter` mocked.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/components/TextSwitch.tsx` -- add `disabled?: boolean` -- the interim tools-row switches.
- `src/app/(frontend)/(sections)/countLine.ts` -- add the pure `activeValues(query, labels, t)`, which returns the display strings in `ShelfQuery` order (rules in Always) -- testable without rendering.
- `src/app/(frontend)/(sections)/BookRow.tsx` -- add the hook-free size-m row (cover, two lines, ending) -- 5.11's client list can reuse it.
- `src/app/(frontend)/(sections)/SearchField.tsx` -- add the client search: debounce, `replace` via `useSearchParams` + `parseShelfQuery` + `shelfHref`, transition progress line, sync from the URL, and the `/` shortcut.
- `src/app/(frontend)/(sections)/CollectionTools.tsx` -- add the client tools row: `SearchField`, the disabled Filter / Select Links and the disabled switches.
- `src/app/(frontend)/(sections)/LoadFailed.tsx` -- add the client "Couldn't load." with the Try again Link (`router.refresh()` in a transition).
- `src/app/(frontend)/(sections)/page.tsx` -- parse, fetch in `try` / `catch` (`payload.logger.error` or `console.error`, matching nearby code), then render the tools, the count line and the list or state.
- `messages/en.json`, `messages/fi.json` -- add the `collection` namespace: search, filter, select, layout and size option labels, count, clear, quoted search, status and read words, rating, ranges, ordered, empty and no-match headings, dry remark, loadFailed, tryAgain.
- `tests/unit/collectionCountLine.unit.spec.ts` -- `activeValues`: order and labels, an unlabelled id left out, `read=false` → "unread", open-ended ranges.
- `tests/unit/collectionSearch.unit.spec.ts` -- jsdom, fake timers: nothing before 300ms, then one `replace` keeping other params and `book`; blank text drops `q`.
- `tests/unit/collectionPage.unit.spec.ts` -- jsdom; await the page with `requireUser`, `getShelfRows` and `next-intl/server` mocked, then render. One case per state in the I/O Matrix: rows with "{n} books", the "Ordered" ending, first run, no match with Clear's href, load failed with Try again → `router.refresh()`. Assert on text and hrefs, not classes.

**Acceptance Criteria:**
- Given `/` with copies, when it renders, then the tools row, "{n} books" and the first `SHELF_PAGE_SIZE` rows at m show, one per copy, in `getShelfRows` order.
- Given an ordered copy, when its row renders, then it ends "Ordered".
- Given no copies, when `/` renders, then "No books yet", the dry remark and, on wide screens only, Scan book show.
- Given a search or filter matching nothing, when `/` renders, then "No books match" and Clear show, and Clear returns to `/` with sort kept.
- Given `getShelfRows` fails, when `/` renders, then "Couldn't load." and a Try again Link show, and the Link re-renders the page.
- Given a wide screen with focus outside a field, when I press `/`, then the search is focused and no `/` is typed.
- Given both message files, when the keys are compared, then every `collection.*` key exists in both.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 33 findings — high 0, medium 6, low 17, false 6, maybe-false 4
- findings:
  - `[medium]` `[patch]` Blind: a pending search timer can undo Clear or Back; `apply` closes over the keystroke render's `params`, so `/?location=3` + "lin" + Clear within 300ms replaces to `/?q=lin&location=3` — confirmed by reading `SearchField.tsx` (the sync block only fires on a `q` change, and the timer is never cancelled). Fix: `apply` reads the current params from a ref; the field's own replace is told apart from other navigation, and other navigation cancels the timer and resyncs `q`.
  - `[low]` `[reject]` Blind: tag filters (and future user genre tags) never appear in the count line because `shelfLabels` has no `tag` labels — tags and user genres arrive in Epic 9 and no UI sets `tag` before then; the spec leaves unlabelled ids out on purpose.
  - `[low]` `[reject]` Blind: language filter values show as raw codes ("fi") — reachable only from a hand-typed URL until the Filter panel (5.14), which must name languages; the count line should use the same naming then (recorded under residual risks).
  - `[low]` `[reject]` Blind: First run shows a second primary Scan book on wide screens — the story AC and EXPERIENCE.md State Patterns both say "on wide screens, Scan book" in the empty state.
  - `[maybe-false]` `[reject]` Blind: the page's `catch` swallows Next control-flow errors — `requireUser()` (cookies) runs before the `try`, and `getShelfRows` only queries the database; settling it would need a Next signal thrown from inside `getShelfRows`, and even then the effect is low.
  - `[medium]` `[patch]` Blind: the `/` shortcut AC has no test — confirmed: no test dispatches a key. Fix: a case in `collectionSearch.unit.spec.ts`.
  - `[low]` `[reject]` Blind: the sync-from-URL Always rule has no test — a test-only finding that names neither an AC nor a spine rule (CLAUDE.md test convention).
  - `[low]` `[patch]` Blind: the matrix "Filter labels" row is not tested at page level — the spec task asks for one page case per matrix state. Fix: a page case.
  - `[low]` `[reject]` Blind: an only-unlabelled filter gives "0 books · Clear" with no leading value — this is the spec's rule for unlabelled ids, and it is not reachable from the UI before Epic 9.
  - `[low]` `[patch]` Blind: Enter waits for the pause and leaves the phone keyboard up; there is no search landmark. Fix: `<form role="search">` whose submit applies at once and blurs.
  - `[low]` `[reject]` Blind: the `/` shortcut ignores open modals — no modal opens on `/` yet; Book detail (5.18) is the first and can add the guard.
  - `[false]` `[reject]` Blind: `/` ignores `altKey` and `isComposing` — during IME composition the target is an input, which the editable guard already skips; Alt does not produce `/` on the layouts in use.
  - `[low]` `[patch]` Blind: a new count after a search is not announced — Fix: `aria-live="polite"` on the count line.
  - `[low]` `[patch]` Blind: up to 50 full-size covers load eagerly — Fix: `loading="lazy"` in `Cover`.
  - `[low]` `[patch]` Blind: `?rating=5` reads "5+ stars" — Fix: an ICU select in both message files.
  - `[low]` `[reject]` Blind: a whitespace-only `q` in a hand-typed URL counts as a search — the field always writes trimmed text; unlikely in use.
  - `[medium]` `[patch]` Edge: the pending timer re-applies typed text after Clear or Back — same root as the first Blind row; same fix.
  - `[medium]` `[patch]` Edge: `apply` uses stale params, so filters cleared meanwhile come back — same root; same fix.
  - `[low]` `[patch]` Edge: a superseded own replace leaves stale text, and retyping the same text never applies (`q === written`) — same root; the resync on other navigation resets `written`.
  - `[low]` `[reject]` Edge: total > 0 with every row dropped between `shelfIds` and hydration shows "N books" over an empty list — needs a copy deleted in the milliseconds between two reads; the fix adds a branch.
  - `[medium]` `[patch]` Verification gap: the `/` shortcut AC is untested — same as the Blind row; same test.
  - `[low]` `[reject]` Verification gap: following `q` changes made elsewhere is untested — test-only; it names a spec Always rule, not an AC or spine rule (its own disposition was defer).
  - `[low]` `[patch]` Verification gap: the count line's labels and ", " join are tested only in the helper — same as the Blind matrix row; same page case.
  - `[medium]` `[patch]` Verification gap (other): a pending search can undo Clear — same root as the first Blind row.
  - `[low]` `[reject]` Intent: Filter, Select and the switches are disabled — the AC asks that the tools row "shows" them; their behaviour is Stories 5.13, 5.14 and 5.27.
  - `[false]` `[reject]` Intent: no test connects typing to fewer rows — the filtering is 5.3's SQL, covered by `tests/int/shelfSearch.int.spec.ts`; this story's part is the URL write, which is tested.
  - `[maybe-false]` `[reject]` Intent: the wide-only Scan book is unverified in jsdom — CSS breakpoints are outside the test convention (no tests of class names or CSS); a manual check settles it.
  - `[false]` `[reject]` Intent: owned rows end blank instead of location or lent marker — the epic gives locations on rows to 5.26 and lent markers to Epic 6.
  - `[false]` `[reject]` Intent: built though the spec warns `oversized` — Mika dismissed the `oversized` trigger in Story 4.15 (Epic 4 retro, P4).
  - `[maybe-false]` `[reject]` Intent: no test shows the server render recovering after Try again — `router.refresh()` re-runs the page, as the scan retry does; only an end-to-end run would settle it, and the effect is low.
  - `[false]` `[reject]` Intent: the range sent to `getShelfRows` is not asserted — asserting it restates a mocked call (test convention); the page passes the `SHELF_PAGE_SIZE` constant directly.
  - `[maybe-false]` `[reject]` Intent: message parity has no new test — `tests/unit/messages.unit.spec.ts` already compares the en and fi keys and ran green.
  - `[false]` `[reject]` Intent: the tools order (search, Filter, Select, switches) differs from the AC's list — the AC lists the controls, it does not set their order; the order follows the mock-ups, as the spec says.

## Design Notes

Rendering the disabled controls now meets the AC ("shows the tools row…"), and their stories enable them in place, so 5.10 adds no control without a story. Rows are server-rendered in this story; 5.11 moves them into the AD-7 client list, which is why `BookRow` takes `ShelfRow` and uses no hooks.

```ts
// countLine.ts: the shape, not the code
activeValues({ q: 'linna', filters: { location: [3, 9], read: false }, sort: 'author', dir: 'asc' },
  { 'location:3': 'Tampere' }, t)
// → ['“linna”', 'Tampere', 'unread']   (location 9 has no label and is left out)
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including the two new files

**Manual checks (if no CLI):**
- `npm run dev` and open `/` signed in: rows at m, "{n} books", typing in search updates `?q=` after the pause, `/` focuses search at ≥ 900px.

## Auto Run Result

**Summary:** `/` is now the collection. The page parses its address with `parseShelfQuery` and renders the first `SHELF_PAGE_SIZE` rows from `getShelfRows` at size m (cover, title, "authors · year · publisher", "Ordered" ending). Above them are the tools row and the count line ("{n} books", or the active values · count · Clear). It also shows First run, No match and Load failed (with a Try again that refreshes). Search writes `q` to the URL 300ms after typing stops, or at once on Enter. It keeps the other parameters, cancels on outside navigation (Clear, Back), and `/` focuses it on wide screens. Filter, Select and the layout and size switches are rendered disabled until 5.14, 5.27 and 5.13.

**Files changed:**
- `src/app/(frontend)/(sections)/page.tsx`: the collection page (parse, fetch in try/catch, count line with `aria-live`, rows or state).
- `src/app/(frontend)/(sections)/BookRow.tsx`: hook-free size-m row, for 5.11's client list to reuse.
- `src/app/(frontend)/(sections)/SearchField.tsx`: debounced and Enter search in a `role="search"` form, own-replace vs outside-navigation sync, the `/` shortcut.
- `src/app/(frontend)/(sections)/CollectionTools.tsx`: the tools row, with disabled Filter, Select and switches.
- `src/app/(frontend)/(sections)/LoadFailed.tsx`: "Couldn't load." with Try again.
- `src/app/(frontend)/(sections)/countLine.ts`: `activeValues`, `isNarrowed`, `clearHref`.
- `src/app/(frontend)/components/TextSwitch.tsx`: `disabled` prop.
- `src/app/(frontend)/components/Cover.tsx`: `loading="lazy"`; the pre-hydration failure check skips lazy images not yet requested.
- `src/app/(frontend)/components/ui/overlay.tsx`: `WIDE_QUERY` exported.
- `messages/en.json`, `messages/fi.json`: `collection` namespace.
- `tests/unit/collectionCountLine.unit.spec.ts`, `collectionSearch.unit.spec.ts`, `collectionPage.unit.spec.ts`: new. `tests/unit/cover.unit.spec.ts`: mocks `currentSrc`.
- `sprint-status.yaml`: 5.10 `done`.

**Review findings:** 33 (medium 6, low 17, false 6, maybe-false 4).
- **Patched (7 entries):**
  - pending search undoing Clear or Back, with stale params and stale text (medium; Blind, Edge ×3, Verification gap);
  - the `/` shortcut test (medium);
  - a page test for the Filter labels row (low);
  - Enter applies at once in a search form (low);
  - `aria-live` on the count line (low);
  - lazy covers (low);
  - "5 stars" at the top rating (low).
- **Deferred:** none.
- **Rejected (16 rows):**
  - tag and user-genre labels: Epic 9;
  - language codes shown raw: reachable only from a hand-typed URL before 5.14;
  - the second Scan book on First run: the AC asks for it;
  - Next signals swallowed by the catch: none can be thrown inside `getShelfRows`;
  - sync-from-URL test (2 rows): test-only, names neither an AC nor a spine rule;
  - unlabelled-only filter text: the spec's rule, and unreachable before Epic 9;
  - `/` with modals open: no modal on `/` yet;
  - Alt and IME on `/`: already guarded;
  - whitespace-only `q`: the field always trims;
  - rows dropped between the two reads: needs a copy deleted in that gap;
  - Intent rows: controls disabled by the epic's split, search SQL tested in 5.3, CSS not testable by convention, row ending in 5.26 and Epic 6, `oversized` dismissed in 4.15, refresh recovery, a mocked range assertion, message parity already tested, tools order following the mock-ups.

**Follow-up review recommendation:** true. Patched entries by verdict: high 0, medium 2, low 5. Unverified risk: `SearchField` now tells its own replace from other navigation by comparing canonical hrefs. That logic was rewritten during patching, and no test covers it (a test-only finding was rejected under the test convention). A rewrite of this size deserves a fresh look. Also untested: an older own replace landing after a newer one.

**Verification:**
- `npm run typecheck`: passes.
- `eslint` (excluding `.claude/**` worktrees): 0 errors. The 40 older warnings are none in touched files.
- `prettier --check` on touched directories: clean.
- `npm run test:unit`: 53 files, 775 tests pass.
- Not done: the manual browser check. The local dev database has no user, so `/` redirects to sign-in.

**Residual risks:**
- When 5.14 adds the language filter it must name languages for display (`Intl.DisplayNames` or similar). The count line shows raw codes until then.
- Placeholder strings for Mika to approve: the dry remark "The shelves are patient." / "Hyllyt odottavat kärsivällisesti.", "Ei osumia", "Lataus ei onnistunut.".
- Not yet seen on a phone: the wide-only Scan book on First run, and lazy covers.
