---
title: '5.9 [E18] Filter values and suggestions'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: '72bac2fcbe62a1b58b6e7445f71487e8f95dd25c'
review_loop_iteration: 2
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: ['multiple-goals', 'oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Filters must offer only values in use on my copies, with counts, and the author, series and publisher filters need typed suggestions (AD-7). Edit book's author and series fields (Story 4.8) are plain text fields, so a known name has to be retyped exactly.

**Approach:** Add two read-only shelf queries on `visibleCopies`: `filterValues(ctx, locale)` and `suggest(ctx, field, text)`. Serve `suggest` from `GET /data/suggest` inside `runRoute()`, and turn Edit book's author rows and series field into the existing `Combobox`, fed by that route, with new names still allowed.

## Boundaries & Constraints

**Always:**
- Read-only SQL through `drizzleFor(ctx)`, built on `visibleCopies(viewer)` and joined like `shelfIds`: readable `books b`, the viewer's `user_books ub`. `readableBy(viewer, alias)` applies to every `authors` and `series` join (AD-4).
- Effective values follow AD-6:
  - language and publisher read `ub` only when the field is listed in `ub.overridden`;
  - series is `ub.series_id`/`b.series_id`, chosen the same way;
  - authors come from `user_books_rels` (path `authors`, parent `ub.id`) when `authors` is overridden, else from `books_rels` (parent `b.id`).
- Genres are system data, from `books_rels` path `genres`. They are never overridden.
- `filterValues` returns only values in use, each counted in copies. A copy counts once under each of its Book's genres. Copies with no location or no language add no value. Order:
  - locations and genres by name;
  - languages by value;
  - statuses `owned`, then `ordered`.
- `suggest`:
  - matches `text` (trimmed) as a case-insensitive `ILIKE` contains, with `%`, `_` and `\` escaped;
  - blank text returns `[]`;
  - returns at most `SUGGEST_LIMIT = 10`, ordered by name (database collation).
- Author and series suggestions are distinct on `name_key`. Within a `name_key`, the shared record's id wins; otherwise the lowest id. Publisher suggestions are distinct effective values, with `id: null`.
- `/data/suggest?field=author|series|publisher&q=…` checks `requireUserOrThrow()` first. A missing or unknown `field`, or a `q` longer than 200 characters, throws `DomainError('VALIDATION')`.
- On Edit book:
  - each author row and the series field is a `Combobox` whose options are the suggestions for its current text;
  - choosing a suggestion sets its name, and choosing "New: {name}" sets the typed name;
  - Clear empties the field;
  - `BookEdits` still carries names (`authors: string[]`, `series: string | null`), and the server action is unchanged.
- The suggestion request goes out after a short pause in typing (~250 ms), through `fetchData`. A late response for older text is dropped. A failed request leaves the list empty, with no toast.

**Never:**
- No `q`, filters or counts narrowed by the current `ShelfQuery` (5.3–5.5); values count over all my copies. No `read` or `rating` values (they are fixed choices). No tags or themes (Epic 9).
- No Filter panel UI (5.14–5.16), no publisher combobox on Edit book, no `getShelfRows`/labels (5.8).
- No query that lists `authors`, `series` or `books` on their own: every value is reached from `copies`.
- No new strings unless a field needs one; `combobox.create` and `combobox.clear` exist.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Counts | A: 2 copies of Book x (genre g, `fi`, at Hylly), 1 ordered copy of Book y (`en`) | location Hylly 2; genre g 2; language en 1, fi 2; status owned 2, ordered 1 | — |
| Override | A overrides x's language to `sv` | `sv` 2 replaces `fi` | — |
| Other user | B owns copies with other locations, genres, languages, authors | none of B's values or counts appear for A | — |
| Same name | A's Books carry shared "Aleksis Kivi" and A's private "aleksis kivi" | one `author` suggestion for "kivi", the shared id | — |
| Effective author | A overrides x's authors to "Väinö Linna" | "linna" suggests him; x's shared author no longer comes from x | — |
| Literal wildcard | publisher "100% Kustannus", `q: "%"` | only that publisher | — |
| Bad request | `field=title` or no `field` | `{ ok: false, code: 'VALIDATION' }` | runRoute maps it |

</intent-contract>

## Code Map

- `src/lib/shelf/shelfIds.ts` -- the join and `effective()` pattern to copy; tables `copies`, `books b`, `user_books ub`.
- `src/lib/shelf/visibleCopies.ts` -- `visibleCopies`, `readableBy(viewer, alias)` (any alias string).
- `src/lib/shelf/query.ts` -- import-free, client-importable; the `Suggestion` and `SuggestField` types go here so client files can `import type` them.
- `src/lib/books/effectiveBook.ts:12` -- `Named = { id; name }`; `src/lib/books/genreName.ts` -- `genreName({ name, nameFi }, locale)`. `lib/shelf` may import `lib/books` and `lib/payload` (eslint `serviceImports`).
- Tables:
  - `books_rels(parent_id, path, authors_id, genres_id)`;
  - `user_books_rels(parent_id, path, authors_id)`;
  - `authors`/`series(id, name, name_key, visibility, created_by_id)`;
  - `locations(id, owner_id, name)`; `copies(location_id, status)`;
  - `genres(id, name, name_fi)`;
  - `books`/`user_books(language, publisher, series_id)`.
- `src/lib/shelf/effective.ts` (Story 5.3) -- `effective(field)` for `title`, `year`, `series` on aliases `b`/`ub`; `search.ts` (5.3) -- `textSearch` with an inline LIKE escape and its own effective-author SQL (`authorIn`).
- Story 5.8 is being built in this same working tree. Leave its files alone: `shelfIds.ts`, `getShelfRows.ts`, `labels.ts`, `tests/int/getShelfRows.int.spec.ts`, and the spine's `ShelfRows` line.
- `src/lib/errors.ts:100` -- `runRoute(fn)`; no route uses it yet. `DomainError(code)`.
- `src/app/(frontend)/data/cover/[isbn13]/route.ts` -- pattern for a `data/` route (`requireUserOrThrow` from `@/lib/payload/context`).
- `src/app/(frontend)/components/request.ts:32` -- `fetchData<T>(path)` returns `ActionResult<T>`; it has no callers yet.
- `src/app/(frontend)/components/ui/Combobox.tsx` -- id-based (`options: {id,label}[]`, `value: Ref | null`), with the "New: {name}" row. Its `query` is internal.
- `src/app/(frontend)/books/[bookId]/edit/MoreDetails.tsx:101-192` -- author rows (`rows` state, `setRow` → `onEdit('authors', names)`) and `text('series')`. These become comboboxes.
- `tests/unit/editBookScreen.unit.spec.ts:214-278` -- the More details tests type into the author `TextField`s; they mock `next-intl` (keys as text) and `editBookAction`.
- `tests/int/shelfIds.int.spec.ts`, `tests/int/holdings.int.spec.ts:39-64` -- seeding (books via `payload.create` with `overrideAccess`, copies via `gateway.create`, overrides via `upsertUserBook`), with fresh users per test.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/query.ts` -- add `SUGGEST_FIELDS = ['author', 'series', 'publisher'] as const`, `SuggestField = (typeof SUGGEST_FIELDS)[number]` (one source for the type and the route's check) and `Suggestion = { id: number | null; name: string }` (`null` for publisher), plus `Counted<T>` and `FilterValues` (type-only import of `Named`). All four client-visible shapes live here.
- `src/lib/shelf/like.ts` -- `containsPattern(text)`: escapes `\`, `%`, `_` and wraps the text in `%…%`, for `ILIKE … escape '\'`.
- `src/lib/shelf/effective.ts` -- `effective()` also takes `language` and `publisher`; add `effectiveAuthorIds` (the SQL in Design Notes). `src/lib/shelf/search.ts` uses `containsPattern` and `effectiveAuthorIds` in place of its own copies, so the AD-6 author rule lives once.
- `src/lib/shelf/filterValues.ts` -- `filterValues(ctx, locale): Promise<FilterValues>` (types from `query.ts`), where `FilterValues = { location: Counted<Named>[]; status: Counted<{ value: 'owned' | 'ordered' }>[]; genre: Counted<Named>[]; language: Counted<{ value: string }>[] }` and `Counted<T> = T & { count: number }`. Genre names come from `genreName`. One grouped query per field; every count is `count(distinct copies.id)`, so a copy counts once per value.
- `src/lib/shelf/suggest.ts` -- `suggest(ctx, field, text): Promise<Suggestion[]>` and `SUGGEST_LIMIT`.
- `src/app/(frontend)/data/suggest/route.ts` -- `GET` inside `runRoute`, which validates `field`/`q` and calls `suggest`.
- `src/app/(frontend)/components/ui/Combobox.tsx` -- add two optional props. `onInputValueChange?: (text: string) => void` is called only when the user types (Base UI's change reason `input-change`). It is never called for Base UI's own input resets, such as close, Escape, a choice, Clear or a value sync. `autoHighlight?: boolean` defaults to `true`, as today. Nothing else changes.
- `src/app/(frontend)/components/suggest.ts` -- `useSuggestions(field, text): Suggestion[]`: a debounced `fetchData('/data/suggest?…')` that drops stale answers and returns `[]` on failure. It returns an answer only for the current trimmed text, never the previous text's list during the pause.
- `src/app/(frontend)/books/[bookId]/edit/NameCombobox.tsx` -- a name-valued wrapper: `{ label, field: Exclude<SuggestField, 'publisher'>, value: string, onChange(name), error?, autoFocus? }`. It maps suggestions to options, shows `value` as `{ create: value }`, and maps a chosen id back to its name. Every typed change calls `onChange(text)` at once, as the 4.8 text field did, so the draft, the Back guard and the saved draft always hold the typed name. Base UI's reset on close then shows that same name, and no blur or close handling is needed. A chosen suggestion overwrites the name, and Clear gives `''`. It passes `autoHighlight={false}`, so Enter keeps the typed name and the arrow keys reach suggestions.
- `src/app/(frontend)/books/[bookId]/edit/MoreDetails.tsx` -- the author rows and the series field use `NameCombobox`. The row state, "Add author" and the error on row 0 stay as they are.
- `tests/int/shelfValues.int.spec.ts` -- covers the matrix rows Counts, Override, Other user (both functions), Same name, Effective author and Literal wildcard. A's copies use two locations and two genres, so name order shows. A publisher and a series override replace the Book's value in `suggest`.
- `src/app/(frontend)/data/suggest/route.ts` check -- `tests/unit/suggestRoute.unit.spec.ts`: an unknown field, a missing field and a 201-character `q` answer `VALIDATION` without calling `suggest` (mock reset per test). No test of the valid call sequence.
- `tests/unit/suggest.unit.spec.ts` (jsdom) -- `useSuggestions` against a stubbed `fetch`: the request carries `field` and `q` as the route reads them; an older text's late answer does not replace the current one; `{ ok: false }` gives `[]`.
- `tests/unit/editBookScreen.unit.spec.ts` -- adapt the author tests to the combobox (`useSuggestions` mocked). Check that choosing a suggestion saves its name and "New: {name}" saves the typed name (authors); that a chosen series suggestion is saved as `series`; that a name typed while a suggestion is listed, then Enter, then leaving the field the way a mouse does (`pointerDown`/`mouseDown` on Save before its click) saves the typed name; and that Clear on a set series saves `series: null`.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- under Shared shapes `// src/lib/shelf`, add `FilterValues`, `Counted`, `SuggestField` and `Suggestion`, and update AD-7's filter-values rule to list locations, statuses, genres and languages, with tags arriving in Epic 9, and give `/data/suggest` its own routes row: `field`/`q`; a missing or unknown `field` or a `q` over 200 characters is `VALIDATION`; blank `q` answers `[]`; at most 10.

**Acceptance Criteria:**
- Given my copies, when `filterValues` runs, then it returns the locations, genres, languages and statuses in use on them, each with its copy count, and nothing else.
- Given typed text, when the client calls `/data/suggest`, then the answer is an `ActionResult<Suggestion[]>` with `Cache-Control: no-store`; signed out, it is 401.
- Given Edit book, when I type in an author row or the series field, then suggestions from my collection appear, picking one or "New: {name}" fills the field, and Save sends the names.
- Given a second user with their own copies, when I request values or suggestions, then none of their values appear.
- Given this story's commit, when the spine is read, then its Shared shapes list `FilterValues`, `Counted`, `SuggestField` and `Suggestion`.

## Spec Change Log

### 2026-10-22 — loop 1
- **Trigger:** review finding (high). On Edit book, a name typed into an author row or the series field and then left without choosing a row was dropped. Base UI resets the input to the selected label on close, so Save sent the old name, a regression from the 4.8 text field. The spec named only choosing, never leaving the field.
- **Amended:** the `NameCombobox` task now commits typed, unchosen text when focus leaves the field, and the Edit book test checks it. The same pass also folded in these review patches:
  - one `SUGGEST_FIELDS` source;
  - `NameCombobox.field` excludes `publisher`;
  - `effectiveAuthorIds` and `containsPattern` are reused by `search.ts`;
  - the spine route row is complete;
  - the route test checks only validation;
  - a `useSuggestions` hook test;
  - a series save test;
  - publisher and series override checks;
  - order made visible in the values test.
- **Known-bad state avoided:** a combobox name field that silently discards typed text unless a row is picked.
- **KEEP:** pass 1's diff is saved at `/private/tmp/claude-501/-Users-mika-development-bookeh/86c1a06a-3e9f-4f3f-8254-6524910fd8d4/scratchpad/keep-5-9-pass1.patch`. Reuse it as the base: `filterValues.ts`, `suggest.ts`, `like.ts`, the route, `useSuggestions`, the `Combobox` `onInputValueChange` prop, the `MoreDetails` wiring and `shelfValues.int.spec.ts` were correct and passed. Do not apply its spine hunk as is: it also carries Story 5.8's `ShelfRows` line, which is already in the working tree.

### 2026-10-22 — loop 2
- **Trigger:** review findings (high) on the loop-1 fix. Committing typed text on blur fails in four cases:
  - **Mouse:** pressing on Save or another field closes the popup on `pointerdown`. Base UI's reset (`handleUnmount`) then goes through `onInputValueChange`, which overwrote the typed text before blur read it. Reproduced in jsdom.
  - **Escape:** the same reset discards the text.
  - **Device Back:** with no blur, the typed text never reaches the draft or the Back guard.
  - **Enter:** with `autoHighlight`, Enter picks the first suggestion or "New:" depending on network timing.
- **Amended:**
  - `Combobox` forwards typing only, and takes an `autoHighlight` prop.
  - `NameCombobox` commits on every typed change, with no blur handler and `autoHighlight={false}`.
  - `useSuggestions` answers only for the current text.
  - Genre counts use `count(distinct copies.id)`.
  - `FilterValues` and `Counted` move to `query.ts`.
  - The AD-7 filter-values rule in the spine is updated.
  - The Edit book tests cover the mouse path, Enter and Clear.
- **Known-bad state avoided:** a commit-on-blur name field that loses typed text whenever Base UI resets the input before blur, and Enter results that depend on response timing.
- **KEEP:** pass 2's diff is at `/private/tmp/claude-501/-Users-mika-development-bookeh/86c1a06a-3e9f-4f3f-8254-6524910fd8d4/scratchpad/keep-5-9-pass2.patch`; reuse it as the base. Keep these as they are:
  - `like.ts`, `effective.ts`, `search.ts` (shared `effectiveAuthorIds` and `containsPattern`), `suggest.ts` and the route with `SUGGEST_FIELDS` in `query.ts`;
  - the `MoreDetails` wiring;
  - `suggestRoute.unit.spec.ts`, `suggest.unit.spec.ts` and `shelfValues.int.spec.ts`;
  - the series test and the author pick/"New" test in `editBookScreen.unit.spec.ts`.

  Its spine hunk again carries Story 5.8's `ShelfRows` line, which is already in the tree: add only 5.9's lines.

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 30 findings — high 3, medium 3, low 14, false 10, maybe-false 0
- findings:
  - `[high]` `[bad_spec]` Blind: a name typed into an author or series field is lost on blur — confirmed at `AriaCombobox.mjs:736-740`: closing with no choice resets the input to the selected label, so Save sends the old name. Amendment: `NameCombobox` commits typed, unchosen text on leaving the field, and a test covers it (Spec Change Log, loop 1).
  - `[low]` `[reject]` Blind: suggestion text starts as `''`, so opening a filled field offers "New: {its own name}" — choosing it sets the same name, so no data changes; seeding the text would fetch for every row on mount.
  - `[low]` `[reject]` Blind: the chosen 8px marker never shows, because the value is always `{ create }` — cosmetic; matching the value to an option by collator adds logic for a mark on a name field.
  - `[low]` `[patch]` Blind: `search.ts` keeps its own copy of the effective-author rule beside `effectiveAuthorIds` — a later change to the AD-6 author rule would have to be made twice. Folded into the amended spec: `search.ts` uses `effectiveAuthorIds`.
  - `[false]` `[reject]` Blind: genres are sorted by `Intl.Collator(locale)` but locations by the database collation — in `fi` both are Finnish; in `en` genre names are the English system names, so the two orders do not differ in use.
  - `[low]` `[reject]` Blind: publisher suggestions are not deduplicated by case or whitespace — suggestions are exact values because the publisher filter (5.4) matches exact values; merging spellings here would offer a value that misses copies. Case-insensitive publisher matching is 5.4's decision.
  - `[low]` `[patch]` Blind: `SUGGEST_FIELDS` can drift from `SuggestField` — folded into the amended spec: the type is derived from the `as const` list in `query.ts`.
  - `[low]` `[reject]` Blind: superseded suggestion requests are not aborted — answers are dropped already; each is one indexed query with limit 10, and aborting adds signal plumbing.
  - `[medium]` `[patch]` Blind: the spine hunk carries Story 5.8's `ShelfRows` line — the commit would put 5.8's contract in 5.9's commit. Fix: the 5.9 commit stages only 5.9's spine lines (Finalize).
  - `[low]` `[patch]` Blind: the spine's `/data/suggest` row omits missing `field`, blank `q` → `[]` and the limit — folded into the amended spec's spine task.
  - `[low]` `[patch]` Blind: the route test's valid case only restates a mocked call sequence (CLAUDE.md test convention) — folded: route test checks validation only.
  - `[low]` `[patch]` Blind: the `suggest` mock is never reset, so the not-called assertions depend on test order — folded: mock reset per test.
  - `[false]` `[reject]` Blind: 401 and `no-store` on the route are untested — the route returns `runRoute()`, whose 401 and `no-store` are tested in `tests/unit/errors.unit.spec.ts`.
  - `[high]` `[bad_spec]` Edge: typed author or series text dropped on close without choosing — same root as the first row; same amendment.
  - `[low]` `[patch]` Edge: `NameCombobox` with `field='publisher'` drops every suggestion (id `null`) — no caller passes it, but the type allows it; folded: `field` excludes `publisher`.
  - `[low]` `[reject]` Edge: publisher variants by case or whitespace repeat in suggestions — same reason as the Blind publisher row.
  - `[low]` `[reject]` Edge: language values differing by case or whitespace split counts — the language filter (5.4) matches exact values, so merged counts would not match it; languages come from source codes or Edit book, and stray variants are rare.
  - `[medium]` `[patch]` Verification gap: `useSuggestions` is mocked everywhere; its URL, stale-answer drop and failure → `[]` are unchecked (AC3, spec Always) — folded: `tests/unit/suggest.unit.spec.ts`.
  - `[medium]` `[patch]` Verification gap: the series combobox wiring on Edit book is untested (AC3 names the series field) — folded: the Edit book test saves a chosen series.
  - `[low]` `[patch]` Verification gap: effective series and publisher in `suggest` are untested (AD-6) — folded: overrides added to the int test.
  - `[low]` `[patch]` Verification gap: location and genre order is not visible with one of each — folded: two locations and two genres in the values test.
  - `[high]` `[bad_spec]` Verification gap (other): typing and saving without choosing leaves the draft unchanged — same root as the first row; same amendment.
  - `[false]` `[reject]` Intent: `filterValues` has no consumer — the story's AC places it in the shelf module; the Filter panel is Story 5.14.
  - `[false]` `[reject]` Intent: counts are not narrowed by active filters — the AC asks for values "in use on my copies, each with its copy count"; no shelf filters exist before 5.4–5.5.
  - `[false]` `[reject]` Intent: `read` has no counted values for 5.14 — 5.9's AC lists locations, genres, languages and statuses; `read` is a fixed two-way choice 5.14 can count itself.
  - `[false]` `[reject]` Intent: shared-id preference is not visible on Edit book, and series de-duplication is untested — Edit book is name-based by design (AD-5); the ids serve 5.15; series uses the same distinct-on query as authors, which is tested.
  - `[false]` `[reject]` Intent: the two-user test runs at function level, not through the route — AC4 asks for a two-user test; the route adds only input checks around `suggest`.
  - `[false]` `[reject]` Intent: Edit book is tested with the hook mocked — this is a description of a test layer; the hook gap is the verification-gap row above.
  - `[false]` `[reject]` Intent: the spine edit carries 5.8's line — duplicate of the Blind spine row, handled there.
  - `[false]` `[reject]` Intent: the spec warns `oversized` but was built as one story — Mika dismissed the `oversized` trigger in Story 4.15 (Epic 4 retro, P4).

### 2026-10-22 — Review pass (loop 1 result)
- verdicts: 26 findings — high 6, medium 5, low 6, false 9, maybe-false 0
- findings:
  - `[high]` `[bad_spec]` Edge: a typed name is lost when Edit book closes or goes Back while the field has focus — no blur, so the draft never got it. Amendment: commit on every typed change (Spec Change Log, loop 2).
  - `[medium]` `[bad_spec]` Edge: with `autoHighlight`, Enter picks the first suggestion instead of the typed name — confirmed: suggestions come before the create row. Amendment: name fields pass `autoHighlight={false}`.
  - `[false]` `[reject]` Edge: locations sort by an `en_US` database collation — carried from pass 1's sort-order row; the databases use the `fi-FI` ICU collation (`tests/int/collation.int.spec.ts`), and genre names in `en` are English.
  - `[high]` `[bad_spec]` Edge: Escape discards typed text — confirmed: the close reset calls `onInputValueChange(oldLabel)` before blur. Same root as the first row; same amendment.
  - `[high]` `[bad_spec]` Verification gap: leaving a name field with the mouse loses the typed name; the test used `.focus()`, which skips the `pointerdown` close — reproduced by the layer in jsdom. Same root; amendment adds the mouse-path test.
  - `[low]` `[patch]` Verification gap: Clear on a name field is untested (spec Always: "Clear empties the field") — folded into the amended Edit book test (Clear on a set series saves `null`).
  - `[high]` `[bad_spec]` Verification gap (other): on desktop, typed unchosen text is lost whenever the field is left by a click — same root as the mouse row.
  - `[medium]` `[patch]` Blind: the spine hunk still includes Story 5.8's `ShelfRows` line — carried: the 5.9 commit stages only 5.9's spine lines.
  - `[high]` `[bad_spec]` Blind: typed text reaches the draft only on blur, so the Back guard and the saved draft miss it — same root as the first row.
  - `[medium]` `[bad_spec]` Blind: `onInputValueChange` forwards every Base UI input change (choice, Clear, reset, sync), not only typing — an extra request after each choice, and a trimmed stored name can become a spurious override. Amendment: forward the `input-change` reason only.
  - `[high]` `[bad_spec]` Blind: Escape drops typed text, against `NameCombobox`'s own doc — same root as the Edge Escape row.
  - `[medium]` `[bad_spec]` Blind: what Enter picks depends on network timing — same root as the Edge Enter row.
  - `[low]` `[patch]` Blind: genre counts use `count(*)` over a rels join, so a doubled genre relation counts a copy twice — folded: `count(distinct copies.id)`.
  - `[low]` `[patch]` Blind: AD-7's rule text lists "locations, genres, tags, languages", not the new shape — folded into the amended spine task.
  - `[low]` `[patch]` Blind: client-facing shelf types live in two modules, `FilterValues` in a Drizzle file — folded: all four move to `query.ts`.
  - `[low]` `[patch]` Blind: `useSuggestions` returns the previous text's list during the pause — folded: answers only for the current text.
  - `[false]` `[reject]` Intent: `filterValues` has no consumer — carried from pass 1.
  - `[false]` `[reject]` Intent: counts are global, not faceted — carried from pass 1.
  - `[false]` `[reject]` Intent: no `read` or tag values for 5.14 — carried from pass 1.
  - `[false]` `[reject]` Intent: the route's success path is untested — it is `return suggest(ctx, field, q)` inside `runRoute`; a test of it restates a mocked call (pass 1 route-test row), and `suggest` is tested against the database.
  - `[false]` `[reject]` Intent: the two-user proof runs at function level — carried from pass 1.
  - `[false]` `[reject]` Intent: layers are tested with the next one mocked — carried from pass 1.
  - `[false]` `[reject]` Intent: shared-id preference has no effect on Edit book — carried from pass 1.
  - `[false]` `[reject]` Intent: publisher suggestions have no UI here — the story names author and series for Edit book; publisher serves 5.15.
  - `[low]` `[patch]` Intent: the hook may briefly show the previous answer — same root as the Blind `useSuggestions` row; same fold.
  - `[medium]` `[patch]` Intent: the patch carries 5.8's spine line — carried; same as the Blind spine row.

### 2026-10-22 — Review pass (loop 2 result)
- verdicts: 19 findings — high 0, medium 2, low 9, false 8, maybe-false 0
- findings:
  - `[low]` `[reject]` Edge: Escape on a name field with its popup closed clears the name — confirmed at `ComboboxInput.mjs:311-319`: Base UI's default, allowed by the WAI-ARIA combobox pattern, and already true of the location field (Story 3.41). The field visibly empties and the Back guard still asks. Escape in a closed name field is rare, the phone has no Escape key, and keeping the value needs the change reason plumbed through `Combobox`.
  - `[low]` `[patch]` Edge: a trailing space in the typed text ("kivi ") hides a suggestion the server matched on the trimmed text — the create row still shows. Fix: `Combobox`'s client filter trims the text.
  - `[low]` `[reject]` Edge: before an answer arrives, an existing name is offered as "New: {name}" — carried from pass 1 (choosing it sets the same name; seeding would fetch on mount).
  - `[low]` `[patch]` Verification gap: the same-name author test creates the shared record first, so "shared wins" and "lowest id wins" give the same answer (AD-7) — fix: the private record is created first.
  - `[low]` `[reject]` Verification gap: `SUGGEST_LIMIT` is unchecked — a constant on the outer query; seeding 11 names for it goes past the functional-minimum test convention, and the layer itself marked it `defer`.
  - `[medium]` `[patch]` Blind: the spine hunk includes Story 5.8's `ShelfRows` line — carried: the 5.9 commit stages only 5.9's spine lines.
  - `[low]` `[reject]` Blind: `useSuggestions` empties the list during each pause, so the popup shrinks to the create row — cosmetic; loop 2 chose answers only for the current text, and the list refills within ~250 ms.
  - `[low]` `[reject]` Blind: the `owned`/`ordered` set is written out three times — AD-8 fixes `copies.status` as exactly these two.
  - `[false]` `[reject]` Blind: SQL tail strings in `grouped()`/`from()` could get a missing `and` — no caller does; every query runs in `shelfValues.int.spec.ts`, so a malformed tail fails there.
  - `[low]` `[reject]` Blind: `NameCombobox` autofocuses through a wrapper div and `querySelector` — it works and is tested; an `autoFocus` prop on `Combobox` would widen the shared wrapper for one caller.
  - `[false]` `[reject]` Blind: the failed-request hook test cannot catch the behaviour it names — it fails if a failure stored `result.data` (`undefined`) instead of `[]`, which would crash `NameCombobox`'s `flatMap`.
  - `[low]` `[reject]` Blind: a name already in another author row is suggested again, and a duplicate is dropped on save — the user chose the same author twice; `editBook` keeps one, which is the intended result, and excluding names needs a new input.
  - `[false]` `[reject]` Blind: Books held only on a wishlist get no suggestions from entries — wishlist entries arrive in Epic 7; no `wishlist-entries` collection or `visibleEntries` exists yet.
  - `[false]` `[reject]` Intent: `filterValues` has no consumer yet — carried from pass 1.
  - `[false]` `[reject]` Intent: the suggestion chain is tested in mocked pieces — carried from pass 1.
  - `[false]` `[reject]` Intent: Edit book saves names, not suggestion ids — carried from pass 1 (AD-5).
  - `[false]` `[reject]` Intent: user genre tags are not in the genre values — they are tags, Epic 9; the epic context records that the genre encoding is settled before then.
  - `[medium]` `[patch]` Intent: the spine hunk carries 5.8's line — carried; same as the Blind spine row.
  - `[false]` `[reject]` Intent: work beyond the four ACs and `oversized` not split — carried from pass 1 (spec tasks; Mika dismissed `oversized` in 4.15).

## Design Notes

Effective authors of `b` for the viewer, as rows to join `authors a` on (the field name is a constant):

```sql
select r.authors_id from books_rels r
  where r.parent_id = b.id and r.path = 'authors' and not coalesce(ub.overridden ? 'authors', false)
union all
select r.authors_id from user_books_rels r
  where r.parent_id = ub.id and r.path = 'authors' and ub.overridden ? 'authors'
```

Distinct on `name_key` with the shared record first: `select distinct on (a.name_key) a.id, a.name … order by a.name_key, (a.visibility = 'shared') desc, a.id`, wrapped in an outer `order by name limit 10`.

`NameCombobox` keeps `Combobox` id-based. The ids of suggestions are used only to find the chosen name, so `BookEdits` stays name-based, and `findOrCreateByName` still resolves on save (AD-5).

## Verification

**Commands:**
- `npm run test:int -- tests/int/shelfValues.int.spec.ts` -- expected: passes
- `npm run test:unit -- tests/unit/editBookScreen.unit.spec.ts tests/unit/combobox.unit.spec.ts tests/unit/suggest.unit.spec.ts tests/unit/suggestRoute.unit.spec.ts` -- expected: passes
- `npm run test:int -- tests/int/shelfSearch.int.spec.ts` -- expected: passes (5.3's search still holds after the shared helpers)
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors

## Auto Run Result

**Summary:** Filter values and suggestions are in the shelf module (AD-7).
- `filterValues(ctx, locale)` returns the locations, statuses, genres and languages in use on the viewer's copies, each with its copy count (`count(distinct copies.id)`), with effective values (AD-6).
- `suggest(ctx, field, text)` returns up to 10 author, series or publisher names from the viewer's copies:
  - a contains match with `%`, `_` and `\` taken literally;
  - authors and series are distinct on `name_key`, with the shared record's id first.
- `GET /data/suggest` serves it inside `runRoute`.
- On Edit book, the author rows and the series field are comboboxes over these suggestions, through `useSuggestions` and `NameCombobox`.
  - New names are allowed.
  - Typed text is the name at once, as in the 4.8 text field, so leaving by mouse, Escape-closing the list, Back and the saved draft all keep it.
  - Enter keeps the typed name; the arrow keys reach suggestions.

**Files changed:**
- `src/lib/shelf/query.ts`: `SUGGEST_FIELDS`, `SuggestField`, `Suggestion`, `Counted`, `FilterValues`.
- `src/lib/shelf/like.ts`: `containsPattern()` for literal `ILIKE` contains.
- `src/lib/shelf/effective.ts`: `effective()` gains `language` and `publisher`; new `effectiveAuthorIds`.
- `src/lib/shelf/search.ts` (5.3): uses the shared `effectiveAuthorIds` and `containsPattern`.
- `src/lib/shelf/filterValues.ts`: the values with counts.
- `src/lib/shelf/suggest.ts`: the suggestions.
- `src/app/(frontend)/data/suggest/route.ts`: the route, validating `field` and `q`.
- `src/app/(frontend)/components/suggest.ts`: `useSuggestions`, debounced and answering only for the current text.
- `src/app/(frontend)/components/ui/Combobox.tsx`: `onInputValueChange` (typing only) and `autoHighlight` props; the client filter trims the text.
- `src/app/(frontend)/books/[bookId]/edit/NameCombobox.tsx`: the name-valued combobox.
- `src/app/(frontend)/books/[bookId]/edit/MoreDetails.tsx`: author rows and series use it.
- Tests:
  - `tests/int/shelfValues.int.spec.ts` (new);
  - `tests/unit/suggest.unit.spec.ts` (new);
  - `tests/unit/suggestRoute.unit.spec.ts` (new);
  - `tests/unit/editBookScreen.unit.spec.ts`: author pick and "New", series pick, typed name kept through Enter and a mouse press on Save, Clear on series.
- `ARCHITECTURE-SPINE.md`: the AD-7 filter-values rule, the new shared shapes and a `/data/suggest` routes row.

**Review findings:** three passes, 75 rows in the Review Triage Log.
- **Pass 1:** 1 high root cause routed `bad_spec`: typed names dropped on close. Loop 1 committed typed text on blur and folded in 13 patch rows (tests, shared helpers, spine row).
- **Pass 2:** the blur fix failed for a mouse press, Escape and Back (high, `bad_spec`). Loop 2 commits on every typed change, forwards typing only, and turns off auto-highlight on name fields. It also folded in 6 patch rows.
- **Pass 3:** 2 low patches applied: the client filter trims the text, and the shared-id test now creates the private record first. The carried spine-staging row was honoured at commit. Nothing was deferred.
- **Rejected,** with reasons in the log:
  - Escape on a closed field clears the name (Base UI and WAI-ARIA default, already true of the location field);
  - publisher and language variants by case (5.4 matches exact values);
  - "New: {name}" for an existing name before the answer arrives;
  - no chosen marker on name fields;
  - no abort of superseded requests;
  - the list empties during the pause;
  - duplicate author across rows;
  - no `SUGGEST_LIMIT` test;
  - the autofocus wrapper;
  - the status set written three times (AD-8);
  - the faceted-count, no-consumer, `read`/tags, route-level-test and `oversized` readings (`false`).

**Follow-up review recommendation:** false. This pass patched high 0, medium 0, low 2; the carried medium spine row was a staging step, not a code patch. Both high root causes were closed by spec loops, and each has a test that fails when it is reverted.

**Verification:**
- `npm run test:int -- tests/int/shelfValues.int.spec.ts tests/int/shelfSearch.int.spec.ts`: 7 passed.
- `npm run test:unit`: 763 passed in 50 files.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors (40 existing warnings in migrations).
- Matrix audit: every row is covered by a test that ran. The Bad request row is covered by `suggestRoute.unit.spec.ts`.

**Residual risks:**
- The name comboboxes were exercised in jsdom only, not in a real browser or on a phone. The commit-on-type, mouse-press and Enter paths are tested, but not on a device.
- Escape on a closed author or series field clears it (Base UI default).
- `filterValues` and publisher suggestions have no caller until the Filter panel (5.14, 5.15).
- Story 5.8 was built in the same working tree at the same time. This commit stages only 5.9's files and spine lines; 5.8's files, its spine `ShelfRows` line and its `shelfIds.ts` change stay uncommitted for that session.
- The run's baseline is `72bac2f`, but Story 5.3 (`fa3724a`) landed during the run, so the reviewed diff was scoped to 5.9's files against `HEAD`.

