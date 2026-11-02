---
title: '8.6 [I11] Search my copies and wishes'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_revision: '1dfdac0928c7c59b05b43b43cd45a886422046e4'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Shelf text search does not fold accents, so an ASCII query for a Finnish
      title with ä or ö finds nothing.
    evidence: |-
      AD-7 states "Text search is `ILIKE` with no accent folding", and the shelf
      has behaved this way since Epic 5, so this is pre-existing, not caused by
      Story 8.6; `tests/int/searchMine.int.spec.ts` asserts the current rule
      (`veljesta` finds nothing for "Seitsemän veljestä"). What would settle it:
      the owner's call on whether a shop check should match ASCII typing, which
      would mean an `unaccent`-based pattern (and an index to keep it fast) plus
      an AD-7 amendment — a decision above a story's level.
    location: >-
      src/lib/shelf/search.ts:12
    severity: low
---

<intent-contract>

## Intent

**Problem:** `searchBooks` (Story 8.5) answers from the outside sources only, so Lookup (Story 8.8) has no way to put "In your library" above "Elsewhere" — the whole point of a shop check. The spine already names the fragment this needs (`visibleEntries(viewer)`, AD-7), and nothing implements it.

**Approach:** Add `searchMine(ctx, text)` to `src/lib/shelf`: one Drizzle query over the viewer's visible copies and their open wishlist entries, matched on effective title, author and series with the shelf's existing `textSearch`, one row per Book in the shelf's author/title order, then hydrated through `getEffectiveBooks()` and `getHoldings()` into the same `{ book, mine }` pair `LookupResult`'s `existing` already uses. `textSearch` gains an optional per-copy-notes clause so the entries branch, which has no notes column, can share it.

## Boundaries & Constraints

**Always:**
- `visibleEntries(viewer)` lands in `src/lib/shelf/visibleCopies.ts` beside `visibleCopies`, mirroring it exactly: `wishlist_entries.owner_id = viewer.id` and nothing else. Openness (`closed_at is null`) is a separate condition the caller adds, as `openEntry` is for the gateway reads — visibility and openness are different rules.
- `textSearch(viewer, q, { notes })` takes the copy-notes column as an optional `SQL`; `shelfIds` passes the `copies.notes` column as that SQL, so the shelf's search is byte-for-byte what it is today, and the entries branch passes nothing. Every other clause (effective title, readable effective author, readable series, `b.isbn13`) is shared, `ILIKE` with `escape '\\'`, no accent folding.
- `searchMine(ctx, text)` in `src/lib/shelf/searchMine.ts` returns `MyBook[]` (`{ book: EffectiveBook; mine: Holdings }`), read-only, with system privileges through `drizzleFor(ctx)`, exactly as `shelfIds` runs.
- The ids come from one `union` of two selects — copies, then open entries — each joining `books b` under `readableBy(viewer, 'b')` and `left join user_books ub` on the viewer, so effective values apply in both. `union` (not `union all`) collapses a Book held both ways, so one Book is one row.
- Order is the shelf's `author` ascending: `firstAuthorSortName(viewer)` nulls last, then `effective('title')`, then the Book id, so the result is deterministic.
- At most `MINE_SEARCH_LIMIT` (20) Books, the same per-source hit cap the adapters ask for, applied in SQL.
- Blank or whitespace-only `text` returns `[]` with no query run.
- Hydration mirrors `getShelfRows`: the SQL order is kept, one `getEffectiveBooks()` and one `getHoldings()` over the distinct Book ids, and a Book that no longer hydrates (made private between the reads) drops its row.
- The spine gets `MyBook` and `MINE_SEARCH_LIMIT` under its `src/lib/shelf` shared shapes and AD-7's Lookup line states that `searchMine` is the reader, in the same commit.

**Never:**
- No screen, route, server action or message-catalogue entry: `/scan/find` and the two result groups are Story 8.8. Nothing renders a `MyBook` in this story.
- No source call, no rate limit, no cover record: `searchMine` reads the viewer's own rows only, so it costs no lookup. It never touches `searchBooks`, `searchSources` or `lookupBook`.
- No search of the shared catalogue: `books`, `authors` and `series` are reached only through a visible copy or a visible open entry, never listed on their own (AD-7).
- No filters, sort parameter, paging or `ShelfQuery` change — Lookup has one text field, not the collection's address.
- No change to `visibleCopies`, `effective`, `firstAuthorSortName`, `shelfIds`' own behaviour, `getShelfRows`, `getHoldings`, `getEffectiveBooks` or any migration.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Copy by title | A owns a copy of "Seitsemän veljestä" | one `MyBook` for that Book, `mine.copies` the copy line | — |
| Open entry only | A has an open entry on a Book, no copy | one `MyBook`, `mine.copies` empty, `mine.entries` the entry | — |
| Held both ways | A owns a copy and has an open entry on the same Book | exactly one `MyBook`, carrying both lines | — |
| Closed entry | A's only entry on a Book is closed (`closedAt` set) | that Book is absent | — |
| Author match | the query matches a readable effective author's name | the Book is found | — |
| Series match | the query matches the effective series' name | the Book is found | — |
| Override wins | A's `user-books` row overrides the title; the query matches the row's title, not the Book's | found by the viewer's value; the Book's own title does not match for A | — |
| Case and substring | query "veljes", title "Seitsemän veljestä" | found, case-insensitive, no accent folding | — |
| Another user's copy | B owns a matching copy, A searches | absent for A; B's own search finds it | — |
| Another user's entry | B has a matching open entry, A searches | absent for A | — |
| Private Book of B's | B's private Book matches, A has nothing of it | absent for A: no path reaches it | — |
| Blank text | `searchMine(ctx, '   ')` | `[]`, no query run | — |
| Nothing matches | query matches none of A's holdings | `[]` | — |
| Order | several matches with different first-author sort names | author sort name ascending, nulls last, then effective title, then Book id | — |
| Cap | more than 20 Books match | the first 20 in that order | — |

</intent-contract>

## Code Map

- `src/lib/shelf/visibleCopies.ts:13` -- `visibleCopies(viewer)` on the unaliased `copies` table, and `:21` `readableBy(viewer, alias)` (AD-4 read rule, `true` for the admin). `visibleEntries` joins them here; keep the same JSDoc voice and the `Viewer = Context['user']` alias.
- `src/lib/shelf/search.ts:22-37` -- `textSearch(viewer, q)`: the trimmed-`q` guard, `containsPattern` (escapes `\ % _`), the `like()` helper, the uncorrelated `array(...)` author clause (its comment explains why it is not `in (select …)`), the readable-series `exists`, `b.isbn13` and `copies.notes`. Only the last clause becomes the optional `notes` parameter; nothing else moves.
- `src/lib/shelf/shelfIds.ts:28-60` -- the shape to copy: the `drizzleFor(ctx).execute(sql`…`)` call, the `from` with `join books b on … and readableBy(viewer,'b')` and `left join user_books ub on ub.book_id = b.id and ub.owner_id = viewer.id`, the `order by` built from `firstAuthorSortName`/`effective('title')` with `sql.raw` for the direction, and `Number(row.…)` on the result. `:32` is the `textSearch` call site that gains the `notes` argument.
- `src/lib/shelf/effective.ts:31-34,55-62` -- `effective('title')` and `firstAuthorSortName(viewer)`; both read the aliases `b` and `ub`, so both branches of the union must provide them. `:44-52` `effectiveAuthorRows`/`effectiveAuthorIds`, used inside `textSearch` already. Read-only.
- `src/lib/shelf/getShelfRows.ts:16-40` -- the hydration to mirror: `getEffectiveBooks` and `getHoldings` in one `Promise.all` over the distinct Book ids, then `flatMap` in SQL order dropping a row whose Book is missing. `searchMine` keeps Books (not copies), so its drop test is the Book alone.
- `src/lib/books/holdings.ts:30` -- `Holdings = { copies: CopyLine[]; entries: EntryLine[] }`, `:65` `getHoldings(ctx, bookIds)`, already the one reader of copies, open loans and open entries; it gives the lent marker Story 8.8 needs. Read-only.
- `src/lib/books/effectiveBook.ts:18-36` -- `EffectiveBook`; `getEffectiveBooks(ctx, bookIds)` is its map reader. Read-only. `binding` is not stored (`src/lib/metadata/source.ts:19`), so an own row has none — Story 8.8's concern, not this one.
- `src/lib/catalogue/searchBooks.ts` -- Story 8.5's sibling: `SearchDraft[]` from the sources. `searchMine` is the other half; it must not import it.
- `src/lib/payload/openRows.ts:4` -- `openEntry` (`closedAt: { exists: false }`), the gateway form of the openness rule the SQL branch expresses as `closed_at is null`.
- `src/collections/WishlistEntries.ts:14-41` -- columns behind `wishlist_entries`: `owner_id`, `wishlist_id`, `book_id`, `for_person_id`, `closed_at`; confirmed in `src/migrations/20261030_122655_foreign_keys.ts:31-54`. There is no notes column, which is why `textSearch` needs the parameter.
- `tests/int/shelfSearch.int.spec.ts:1-55` -- the harness to copy: `contextFor`/`createUser`, `sharedRecord` for shared authors and series with a per-run name suffix (the `nameKey` index is global), `sharedBook`, `copyOf` through the gateway, and the per-test fresh users that keep owners apart.
- `tests/int/holdings.int.spec.ts:189-208` -- `wishlistOfA`/`entryOfA`: creating a wishlist and an open or closed entry through the gateway. The entry half of the new test uses this.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:156` -- AD-7's Lookup own-library line (already names `visibleEntries`): add that `searchMine(ctx, text)` is that reader and what it returns. `:511-513` the `src/lib/shelf` shared shapes, where `MyBook` goes after `ShelfRows`.
- `_bmad-output/planning-artifacts/epics.md:3534-3546` -- Story 8.6's acceptance criteria, the source of the rules above.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/visibleCopies.ts` -- add `visibleEntries(viewer)` on the unaliased `wishlist_entries` table, owner only -- the spine names this fragment as the entries' counterpart to `visibleCopies`.
- `src/lib/shelf/search.ts` -- make the copy-notes clause an optional `notes` SQL parameter -- the entries branch has no notes column and must otherwise duplicate the title/author/series clauses.
- `src/lib/shelf/shelfIds.ts` -- pass the `copies.notes` column to `textSearch` as `notes` -- the shelf's search behaviour must not change.
- `src/lib/shelf/searchMine.ts` -- new: `MyBook`, `MINE_SEARCH_LIMIT` and `searchMine(ctx, text)` (blank guard, the two-branch `union` under `visibleCopies` / `visibleEntries` + `closed_at is null`, author-then-title order, the cap, then `getEffectiveBooks` + `getHoldings` hydration in SQL order) -- the own half of Lookup, which Story 8.8 renders first.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- name `searchMine` in AD-7's Lookup line and add `MyBook` to the `src/lib/shelf` shapes -- a story that changes a spine contract updates the spine in the same commit.
- `tests/int/searchMine.int.spec.ts` -- new: the I/O matrix rows over fresh users, including the two-user isolation rows, the held-both-ways row, the closed entry, the override row and the order -- the story's criteria name the matching, the one-row-per-Book rule and the isolation.

**Acceptance Criteria:**
- Given user A with a matching copy and a separate Book held only through an open entry, when `searchMine(asA, q)` runs, then it resolves one `MyBook` per Book, each carrying the viewer's `EffectiveBook` and the `Holdings` `getHoldings` reports, and the shared catalogue is never listed on its own.
- Given user B owning a matching copy and holding a matching open entry, when A searches the same text, then neither appears for A, and B's own search finds both.
- Given `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run test:int`, when they run, then all pass, with `shelfIds`' text-search behaviour unchanged (`tests/int/shelfSearch.int.spec.ts` green without edits).
- Given the spine, when the commit lands, then AD-7's Lookup line names `searchMine` and the `src/lib/shelf` shapes carry `MyBook`.

## Spec Change Log

## Review Triage Log

### 2026-11-02 — Review pass
- verdicts: 14 findings — high 0, medium 0, low 11, false 2, maybe-false 1
- findings:
  - `[false]` `[reject]` Blind: `searchMine` has no caller, so the spine presents a reader nothing uses — staged on purpose: Story 8.8 mounts it, the spec says nothing renders a `MyBook` until then, and the spine line names the reader because the contract exists now. Dead-code harm does not occur.
  - `[low]` `[reject]` Blind: `epic-8-context.md` was not updated for this story — that file is generated from the planning artifacts (this run recompiled it because the spine was newer), and its "Own-library search is a shelf query" bullet already states the rule; a story does not hand-edit it.
  - `[low]` `[patch]` Blind: `MyBook` is declared in `searchMine.ts` while every other `src/lib/shelf` shared shape lives in `query.ts` under the `Spine, Shared shapes` comment — verified (`query.ts:20-61` holds `ShelfQuery` … `Suggestion` and already imports `EffectiveBook`/`CopyLine` as types). Moved to `query.ts` after `ShelfRows`, matching the spine's placement.
  - `[false]` `[reject]` Blind: `MINE_SEARCH_LIMIT` duplicates Finna's `SEARCH_LIMIT` and its comment asserts a coupling nothing enforces — the comment states a fact ("the same per-source hit cap the adapters ask for"), not an invariant, and `lib/shelf` importing `lib/metadata` would cross a layer the spine lint guards. No bad outcome at the cited line.
  - `[low]` `[reject]` Blind: truncation is silent — no `total` or `truncated` flag, unlike `ShelfRows` — the fix adds public surface for a consumer that does not exist yet; Story 8.8 decides what its own group shows when the cap bites.
  - `[low]` `[reject]` Blind: `textSearch`'s `options: { notes?: SQL }` is wider than the one legal column, a `boolean` or table discriminator would be narrower — a signature change for a helper with two literal call sites; the SQL parameter is what keeps the helper table-agnostic, which is why the entries branch can share it at all.
  - `[low]` `[patch]` Blind: `textSearch`'s doc first line still says the condition sits on the aliases `copies`, `b`, `ub` — verified at `search.ts:10-12`; only the middle of the comment was updated. First sentence corrected for the optional-`notes` signature.
  - `[low]` `[reject]` Blind: `branch(table: SQL, …)` builds `from ${table}` and `${table}.book_id` from a raw fragment, so an aliased or schema-qualified argument would produce wrong SQL — internal helper, two literal arguments in the same function, no caller can reach it; `sql.identifier` plumbing for both positions is more than a direct correction.
  - `[low]` `[patch]` Blind: the comment blames a dropped row on a Book "made private between the reads", but `readableBy(viewer, 'b')` excludes an unreadable Book in the SQL, and this join also differs from `getHoldings`' documented policy that current readability plays no part — behaviour is right (it is the shelf's rule, as `shelfIds` applies it); the explanation was wrong and is corrected, naming the difference.
  - `[low]` `[defer]` Blind: no accent folding means `veljesta` does not find *Seitsemän veljestä*, a real shop-typing gap — pre-existing: AD-7 states "Text search is `ILIKE` with no accent folding" and the shelf has behaved this way since Epic 5, so it is not caused by this story. Deferred with what would settle it.
  - `[maybe-false]` `[patch]` Edge: two effective authors sharing the lowest `order` could make `firstAuthorSortName` differ per union branch, so `union` would not collapse the Book — `effectiveAuthorRows` is a `union all` of two mutually exclusive branches and Payload assigns `order` sequentially per parent and path, so no tie was shown reachable; settled instead by the dedup patch below, which removes the dependency rather than relying on the premise.
  - `[low]` `[patch]` Edge: `bookIds` is taken straight from the rows with no de-duplication, so a duplicate `book_id` surviving the union would hydrate and return one Book twice and shorten the cap — grouped with the row above (shared root: distinctness rests on the sort keys alone). `[...new Set(...)]` applied, which is what the spec's "distinct Book ids" states.
  - `[low]` `[reject]` Edge: `text` has no length bound, so a pathological query runs an unbounded `ILIKE` over authors and series — the fix adds a constant and a guard for a caller that does not exist yet; the per-user rate limit and the 20-row cap are where Lookup's cost is governed, and Story 8.8 passes a search box's input.
  - `[low]` `[patch]` Edge: the spec says hydration runs "over the distinct Book ids" while the code assumes `union` alone makes them distinct — same group and same fix as the dedup row above.
  - Verification gap layer: `No verification gaps found.` — it traced `textSearch`'s only two callers and named the assertion that would fail for each new behaviour. Intent alignment layer: descriptive, no findings; it reports the diff implements the "shelf module reader" reading, which is the one the acceptance criterion names ("Given the shelf module"), with Story 8.8 mounting it.

## Design Notes

**Why a `union` of two selects and not a left join.** A Book can be held as a copy, as an open entry, or both; one row per Book is the criterion. `union` over `(book_id, sort_key, title)` — identical per Book, since both branches read the same `b`/`ub` — dedups in the database, with the order and the cap applied once outside:

```sql
select m.book_id from (
  select b.id as book_id, <sortName> as sort_name, <title> as title
    from copies join books b on … left join user_books ub on …
   where <visibleCopies> and <textSearch>
  union
  select b.id, <sortName>, <title>
    from wishlist_entries join books b on … left join user_books ub on …
   where <visibleEntries> and wishlist_entries.closed_at is null and <textSearch>
) m order by m.sort_name asc nulls last, m.title asc, m.book_id asc limit 20
```

**Why the cap is 20 and lives here.** Both adapters ask their source for 20 records, so 20 own Books keeps the two Lookup groups comparable, and an uncapped own branch would hydrate a whole 10 000-copy library for a query like "a". Story 8.5 refused to invent a page size for the outside group because its per-source requests already bound it; the own branch has no such bound, so it states its own.

**Why openness is not folded into `visibleEntries`.** The spine asks for a fragment that mirrors `visibleCopies`, and that fragment answers one question: whose row is it. A closed entry is still the viewer's; it is simply not a holding. Keeping them separate leaves the fragment usable by a later query that wants closed entries too.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int` -- expected: all pass, including the new `searchMine` spec and the untouched `shelfSearch`, `shelfIds` and `getShelfRows` specs.

**Manual checks (if no CLI):**
- No screen change, so no Playwright walk: nothing renders a `MyBook` until Story 8.8.

## Auto Run Result

Status: done

**Implemented.** `searchMine(ctx, text)` in `lib/shelf` reads Lookup's own-library half: one `union` over the viewer's visible copies and their visible *open* wishlist entries, matched with the shelf's own `textSearch` on effective title, author, series and ISBN-13, one row per Book in the shelf's `author` ascending order, capped at `MINE_SEARCH_LIMIT` (20), then hydrated through `getEffectiveBooks()` and `getHoldings()` into `MyBook[]`. Blank text asks nothing. Nothing calls it yet — Story 8.8 mounts it, which is why no screen, route, action or message-catalogue entry was touched.

**Files changed**
- `src/lib/shelf/searchMine.ts` (new) -- the reader: blank guard, the two-branch union, author/title order, the cap, and the hydration with ids made distinct in code.
- `src/lib/shelf/visibleCopies.ts` -- `visibleEntries(viewer)`, owner only; openness stays a caller's condition.
- `src/lib/shelf/search.ts` -- `textSearch` takes the copy-notes column as an optional `notes` SQL, so both branches share every other clause.
- `src/lib/shelf/shelfIds.ts` -- passes `copies.notes`, keeping the shelf's search unchanged.
- `src/lib/shelf/query.ts` -- `MyBook` with the other shared shapes.
- `ARCHITECTURE-SPINE.md` -- AD-7's Lookup line names the reader; `MyBook` joins the `src/lib/shelf` shapes.
- `tests/int/searchMine.int.spec.ts` (new) -- six tests covering all fifteen I/O matrix rows, the two-user isolation criterion among them.

**Review findings**

Patches applied (4 findings in 3 entries, all at verdict `low`, one grouped with a `maybe-false`):
- `MyBook` moved from `searchMine.ts` to `query.ts`, where every other shelf shared shape is declared.
- `textSearch`'s doc first sentence corrected: it claimed a `copies` alias the entries branch does not have.
- `searchMine`'s doc corrected: the AD-4 read rule in the join drops an unreadable Book (unlike `getHoldings`, where current readability plays no part); the hydration drop is for a Book deleted between the reads.
- Hydrated Book ids made distinct in code (`[...new Set(...)]`), so one-row-per-Book no longer rests on both union branches producing identical sort keys.

Deferred (1): the shelf's lack of accent folding — pre-existing, AD-7 states the rule; recorded in frontmatter `deferred` with what would settle it.

Rejected (9), with reasons:
- no caller for `searchMine` -- staged on purpose; Story 8.8 mounts it (`false`).
- `epic-8-context.md` not updated for this story -- generated file; its own-library bullet already states the rule.
- `MINE_SEARCH_LIMIT` duplicates Finna's `SEARCH_LIMIT` -- the comment states a fact, not an invariant, and `lib/shelf` importing `lib/metadata` crosses a guarded layer (`false`).
- silent truncation with no `total`/`truncated` -- adds public surface for a consumer that does not exist; Story 8.8 decides its own group's display.
- `notes?: SQL` wider than a boolean or table discriminator -- the SQL parameter is what keeps the helper table-agnostic.
- `branch()` interpolates the table as a raw fragment -- internal, two literal arguments, unreachable by a caller.
- unbounded query length -- the rate limit and the 20-row cap govern Lookup's cost; a guard for a caller that does not exist.
- the two union/dedup edge rows were grouped into the patch above rather than rejected.

**Follow-up review recommended: false.** Patched entries by verdict: low 3 (one carrying a `maybe-false` member), medium 0, high 0. Nothing renders a `MyBook` until Story 8.8, so there is also no surface to walk.

**Verification**
- `npx prettier --check src/lib/shelf/*.ts tests/int/searchMine.int.spec.ts` -- all matched files clean (two files needed formatting mid-run and were fixed before the story commit).
- `npm run typecheck` -- clean.
- `npm run lint` -- 0 errors, 60 pre-existing warnings.
- `npm run test:int` -- 81 files, 694 tests, all passed, `searchMine.int.spec.ts` among them.
- `npm run test:unit` -- 88 files, 1227 tests, all passed. Two earlier runs reported timeout failures in unrelated React component specs (13 files, then 6, different sets each time, each `Test timed out in 5000ms`); re-running those six files alone passed 135/135 in 7.9 s, and the full lane then passed clean — load starvation, not a regression.
- No Playwright walk: no screen changed.

**Residual risks**
- The cover-preview store's shared per-user-and-ISBN record, carried over from Story 8.5's Residual risks, is untouched here: `searchMine` records no previews at all, so it cannot evict. It remains Story 8.8's concern when both halves feed one results screen.
- `MINE_SEARCH_LIMIT` is this story's own decision, not something the intent asked for: Story 8.8 may want a different own-group size, and changing it is a one-constant change with the spine line beside it.
- Built alone, not beside another worktree; no shared files with a parallel story.
