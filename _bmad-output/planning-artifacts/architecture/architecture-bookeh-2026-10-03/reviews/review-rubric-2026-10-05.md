---
title: Rubric review — Bookie architecture spine, after the UX update
reviewed: ../ARCHITECTURE-SPINE.md (as of 2026-10-05 17:02)
against: SPINE-before.md (pre-update), ../.memlog.md, prd.md and addendum.md, EXPERIENCE.md, DESIGN.md, CLAUDE.md, SPEC.md, STORY-SLICING.md, code at 7d34440
created: 2026-10-05
---

# Rubric review — ARCHITECTURE-SPINE.md (update of 2026-10-05)

## Verdict

The update absorbed the UX run cleanly: no leftover of the old model, AD ids stable, cross-references resolve, and the PRD, CLAUDE.md and STORY-SLICING.md now agree with it. It is not ready to go back to `final`. There are no critical findings, but two high ones sit in the new territory (how Undo receipts compose when writers call each other; what the client-held list does after a mutation), and eleven medium ones, most of them seams the UX opened that the spine names but does not close (route handlers, addresses, inline creation).

Counts: 0 critical, 2 high, 11 medium, 15 low.

## What was checked, and how

- Read in full: the spine, the before-file, the memlog, the PRD and addendum, EXPERIENCE.md, DESIGN.md, SPEC.md, STORY-SLICING.md, CLAUDE.md, every file under `src/` and the root config files.
- The PRD, CLAUDE.md and STORY-SLICING.md were rewritten while this review ran (17:05 to 17:07). Findings were re-checked against the new versions. SPEC.md was not updated (L14).
- Leftover search in the spine for `undoSave`, review screen, home screen, `/books/new`, `/books`, `ShelfPage`, page in the URL: none found, except the deliberate "There is no home screen."
- AD ids against the before-file: AD-1 to AD-19 keep their numbers. AD-11 is retitled, its Undo part moved to the new AD-20.
- npm registry today: `@base-ui/react` 1.8.0, `next-intl` 4.14.9, `tailwindcss` 4.3.3, `payload` 3.90.2 and `next` 16.3.8 are each the current `latest`.
- `node_modules`: Payload's dependency checker lists `@payloadcms/richtext-lexical` (L9); the Drizzle adapter stores a `select` with `hasMany` in a child table, not an array column (L10); the bundled Next guide names `serverActions.allowedOrigins` for proxies (L11).
- Not checked: the Base UI Drawer API (the memlog's claim of swipe, snap points and non-modal is taken as given), module-instance behaviour in Next 16 (M7), and the Mermaid diagrams were read, not rendered.

## Checklist

| # | Item | Result | Findings |
| --- | --- | --- | --- |
| 1 | Fixes the real divergence points for stories | Partial | H1, H2, M1, M2, M3, M4, M5, M9, L5, L7 |
| 2 | Every Rule is enforceable and prevents its divergence | Partial | H1, M6, M7, M8, M10, M11, L3, L10 |
| 3 | Nothing under Deferred lets stories diverge | Partial | L8, L13 |
| 4 | Named tech is verified-current | Pass, with flags | M7, L9, L10, L11 |
| 5 | Ratifies the existing code | Pass | L9 |
| 6 | Covers the spec's capabilities | Pass | L14 |
| 7 | Every dimension decided, deferred or open | Partial | M9, M10, L13 |
| 8 | Internally consistent after the update | Partial | M3, M8, M11, L1, L2, L4, L12 |
| 9 | Terse; seed minimal; AD ids stable | Pass | L15 |

What holds up and needs no change: AD-4 `sortName` (source form, derivation, sort-only), the save-first split between AD-5, AD-11 and `editBook`, the `requireOwnBook` gate that keeps `?book=` from browsing the shared catalogue, the three lookup outcomes, the service import rules including the new `lib/people` and `lib/undo`, the Base UI and device-preference conventions, and the capability map's routes.

## Findings

### High

**H1. AD-20 — the rule says one receipt per action, but not how nested writers avoid recording** (items 1, 2)

- Location: AD-20 bullets 3 and 4; AD-16; AD-18; shapes `Restore` and `Undoable`.
- Problem: AD-20 states the outcome ("a function called by another service returns its restore data to the caller and records nothing") and leaves three things open.
  - How a function knows which case it is in. Several writers are both. The move and status writers in `lib/copies` are called by the Move action, which has Undo, and by `editBook`, which has none. `createCopy` is called by `saveCopy` and `closeEntry`. `closeEntry` is called by an action.
  - The shape of "restore data". `Undoable<T>` covers only the outer result.
  - What `withTransaction` does when the context already carries a transaction. "Records after its transaction commits" depends on it: a nested writer that opens its own would record early or run outside the caller's transaction.
- Eight slices each build a "service with Undo" on their own (D6, E24, F6, G7, H3, H6, H13, J3), and D22 calls two of them from `editBook`.
- Amendment, replacing AD-20 bullet 3 and adding one sentence to AD-16:
  - "Writers never record. An undoable writer returns `Undone<T> = { data: T; restore: Restore }`; a writer that calls another folds the inner `restore` into its own."
  - "`withUndo(ctx, fn)` in `lib/undo` is the only caller of the receipt store. It runs `fn` inside `withTransaction`, records the returned `restore` after the commit, and returns `Undoable<T>`. The function behind each action in the Undo table is a `withUndo` wrapper around its writer. `editBook` and removals call writers directly and drop the `restore`."
  - AD-16: "`withTransaction` on a context that already carries a transaction runs `fn` in that transaction."
  - Add `Undone<T>` to the `lib/undo` shapes.

**H2. AD-7 and AD-10 — nothing says what the list does after a mutation** (item 1)

- Location: AD-7 bullets 4 and 5; AD-10; Errors convention. EXPERIENCE.md: Select mode ("rows that no longer match the active filters leave the list"), Undo ("puts all twelve back in Tampere and in the list"), "Book has left the list", "the list keeps its scroll position".
- Problem: page one is rendered by the server, later pages live in client state, and paging is by offset.
  - A server re-render replaces page one only. Rows from later pages stay stale.
  - After rows leave (a move under a filter, a removal), every later offset shifts and the next fetch skips rows. "The client drops rows whose copy id it already holds" covers only the opposite case.
  - Each action slice on the collection decides alone how to reconcile: E11, E12, E24, E25, F4, G7, J4, H13, U2, D21.
  - Related: whether an action may `redirect()`. If it does, its `ActionResult` and `undoToken` never reach the toast.
- Amendment:
  - AD-7: "The collection list is one client component, keyed by `shelfHref(query)`, and the only holder of loaded rows. `getShelfRows` and `/data/shelf` take `offset` and `count` in place of `page`. After any action or Undo that returns `ok`, the list re-requests rows `0` to the number it holds in one call and replaces them; scroll position and the open Book stay. Actions return no rows."
  - AD-10: "An action returns its `ActionResult` and never redirects, sign-in and sign-out excepted; the client navigates. The toast provider lives in the frontend root layout."

### Medium

**M1. Route handlers have no contract** (item 1)

- Location: AD-2 bullet 4; AD-10; Errors convention; Routes (`/data/*`).
- Problem: `runAction()` and `ActionResult` exist for actions only. The four handlers have no envelope, error mapping or status rule, yet the interface needs coded failures from them ("Too many lookups", "Couldn't load. Try again."). `requireUser()` "redirects to sign-in", which on a `fetch` or an `img` request yields the sign-in page's HTML. No cache header is fixed, though NFR-5 forbids caching private views. Four slices write one each (C8, E18, E19, D10).
- Amendment, in the Errors convention: "`runRoute()` in `lib/errors.ts` wraps every handler under `data/`. The body is `ActionResult<T>` as JSON with the same mapping as `runAction()`, sent with `Cache-Control: no-store`. In a handler a missing session is a 401 with `UNAUTHENTICATED`, not a redirect; the client goes to sign-in. The cover handler returns bytes or 404."

**M2. The Answer has two possible render paths** (item 1)

- Location: Routes (`/scan` "with `?isbn=` … the Answer", and `/data/lookup`); AD-10 ("scanner lookup" as a client-initiated read).
- Problem: the seed offers both a server render at `/scan?isbn=` and a client fetch of `/data/lookup`, and does not say which one draws the Answer. D9, D16, I2, I7 and I9 each have to choose, and a reload of `/scan?isbn=` behaves differently under each choice (a second lookup and rate-limit hit, or not).
- Amendment, one of:
  - (a) "The Answer is a server render of `/scan?isbn=` or `/scan?book=`. The scanner navigates with `replace`; the camera lives in the `/scan` layout so it stays on." Then drop `/data/lookup` from Routes and "scanner lookup" from AD-10.
  - (b) "The Answer is drawn by the client from `/data/lookup`. On a full load of `/scan?isbn=` the page renders Scan and the client makes the same request; the page never calls `lookupBook`."

**M3. Inline creation: names or ids** (items 1, 8)

- Location: AD-18 bullet 4 ("screens never match names"); shapes (`EditBookInput.tags: string[]` is names, `copy.location` and `SaveInput.save.wishlist` are ids); EXPERIENCE.md Combobox ("a value that does not exist can be created from the same field").
- Problem: tags travel as names and are matched in the service. Locations and wishlists travel as ids, so a new one must already exist when the action runs. People are not stated. The choice also decides what Undo covers and whether a cancelled picker leaves a row behind. Slices F2, G2, J4, H10 and H12 each meet it.
- Amendment, in AD-18: "An action input that names a location, Person or tag is `Ref = number | { create: string }`. The owning service resolves it inside the action's transaction. Undo leaves a row created this way." Change `EditBookInput.tags` to `Ref[]` and `copy.location` to `Ref | null`.

**M4. Wishlist entries have no named writer** (item 1)

- Location: AD-11 bullet 1 ("or the entry (AD-18)"); AD-18; EXPERIENCE.md Book detail foot ("Add to wishlist") and Wishlists ("Remove").
- Problem: AD-18 names the one inserter for copies and for `user-books`, none for `wishlist-entries`, so AD-11's pointer lands on nothing. Add to wishlist exists on the Answer and in Book detail; only the slicing (H10) says both use `saveEntry`. Whether Remove deletes the row or closes it is unstated, and AD-8 (closed rows are kept), `requireOwnBook` and the Person delete rule all depend on it.
- Amendment, in AD-18: "`addEntry()` in `lib/wishlists` is the only function that inserts into `wishlist-entries`. `saveEntry` calls it, and every Add to wishlist in the interface calls `saveEntry`. Removing an entry deletes the row. Entries are closed only by `closeEntry()` and by `createCopy()`."

**M5. Four addresses the interface needs are not fixed** (item 1)

- Location: Routes; AD-7 bullet 6. EXPERIENCE.md open item 5 hands these to the architecture.
- Problems and amendments:
  - `book` on `/` sits beside the shelf params that only `parseShelfQuery()` and `shelfHref()` may touch. Opening a row, a Filter chip (which closes the sheet on the phone) and "Open book" from an Answer each compose both. Amend AD-7: "`book` is part of the same contract: `parseShelfQuery()` returns `{ query, book }` and `shelfHref(query, book?)` writes both. `/loans` and `/wishlists/[listId]` read `book` with the same parser."
  - The opened wishlist entry is keyed by entry (its For field, Bought, Ordered, Remove), and one Book can be on a list more than once (`mine.entryIds` is a list; no constraint forbids it). `?book=` cannot name the entry. Add `?entry=<entryId>` on `/wishlists/[listId]`, or state that Book detail there lists each of the list's entries for the Book with its own controls. State likewise that `?book=` marks every row of that Book with the selection bar.
  - "Add by hand" from Lookup opens the Not found Answer with no ISBN and no Book. Add `/scan?title=<text>` to the row.
  - EXPERIENCE.md assumes Edit book "opens in the detail panel's place" on wide screens. A page at `/books/[bookId]/edit` cannot do that without the section beside it, and intercepting routes were rejected. Either decline the assumption in the Routes row ("a full-screen task at every width") or address it as `?book=<id>&edit=1` on the section. State how Save returns "to where the user came from" (history back, or a `from` param).

**M6. A partial source result is cached and becomes the shared Book** (item 2)

- Location: AD-9 bullet 2.
- Problem: when Finna times out and Google Books answers, the outcome is `found` and is cached. With save-first there is no review step, so Add to library creates the shared Book from Google's values with `source: 'google'`. Re-fetch fills empty fields only and cannot put Finna's values in later. The Prevents line covers an outage cached as `none`, not this.
- Amendment: "A result merged while a source ahead of the answering one failed or timed out is cached only for the `none` lifetime, and `RawMetadata` gains `missing: SourceId[]`." Whether a save on such a result should be allowed, or should re-fetch a Book with `missing` sources later, is Mika's call; record it as a question if not decided now.

**M7. In-process stores assume one module instance — unverified** (items 2, 4)

- Location: AD-12; AD-20 bullet 1; AD-9 (cache, rate limit); AD-14 (recorded cover URL); AD-11 (`requestId` memory).
- Problem: five stores are written in one kind of entry point and read in another (lookup cache: handler or page, then an action; cover URL: page, then the cover handler; receipts: any action, then `undoAction`). Next may bundle route handlers, pages and actions into separate module graphs, and dev reloads modules; Payload keeps its own instance on `global` for that reason. If the assumption fails, Undo tokens and preview covers go missing now and then and the rate limit counts per bundle. Not verified here against Next 16.
- Amendment, in AD-12: "Every in-process store is created through one helper, `processStore(name, { max })` in `src/lib/store.ts`, which holds it on `globalThis` and enforces the bound." Add to the Tests row: "U1 reads a receipt from a different route than the one that wrote it."

**M8. `LookupResult` hands the remote cover URL to the surface** (items 2, 8)

- Location: shapes, `LookupResult` → `draft: Omit<SourceResult, 'raw'>`; AD-14 bullet 2.
- Problem: `draft` still carries the source's `coverUrl`, so an Answer story can render it and the browser loads a cover from the source, which AD-14 forbids. `SearchHit` already avoids this with `hasCover`.
- Amendment: `draft: Omit<SourceResult, 'raw' | 'coverUrl'> & { hasCover: boolean }`.

**M9. Dates: storage is fixed, calendar dates and display are not** (items 1, 7)

- Location: Dates convention; AD-15.
- Problem: a lending date is a calendar date from a field that "defaults to today". Stored as an instant, 00:30 on the 6th in Helsinki is the 5th in UTC. No display time zone or formatter is fixed, and next-intl renders different days on server and client without one. J3, J4, J5 and J9 each format dates.
- Amendment, in the Dates row: "Loan dates are calendar dates: sent as `YYYY-MM-DD`, stored at 12:00 UTC, read back by their UTC date. Every date and number shown is formatted by next-intl, with `timeZone: 'Europe/Helsinki'` set once in its request config."

**M10. The Styling and UI primitives rules have no enforcement** (items 2, 7)

- Location: Styling and UI primitives conventions.
- Problem: Tailwind 4 ships a default palette, radius, shadow and font scale, so `bg-red-500` or `rounded-lg` compile in any of some thirty screen stories. "No size literals" also cannot be met as written: DESIGN.md gives pixel sizes that are not tokens (covers at 44 × 66 and 72 × 108, the 8px marker, 22px stars, the density table).
- Amendment: "`styles.css` clears Tailwind's default colour, radius, shadow and font namespaces, so only DESIGN.md tokens resolve. A pixel size that DESIGN.md gives outside its scale is declared there as a named theme variable. ESLint `no-restricted-imports` forbids `@base-ui/react` outside `components/ui`."

**M11. AD-3 does not allow the cross-user read that the save's Undo needs** (item 8, carried over)

- Location: AD-3 bullets 1 and 2; AD-11 bullet 3.
- Problem: the restore deletes a created Book, author, series or media row "only when no row of any user references it". That is a read across users' copies, entries and `user-books`. The allowlist gives `lib/catalogue` system privileges "for writes to `books`, `authors`, `series` and `media` only", scoped "by its user explicitly". Relying on a foreign-key failure does not work for authors and series, whose join rows cascade.
- Amendment, in AD-3 bullet 1: "…and, in `lib/catalogue` only, a reference count across all users for a Book, author, series or media row, returning a number and no row data."

### Low

**L1. Cross-reference nits** (item 8)

- The diagram has no `UNDO --> ERR` arrow, but the bullet lets `lib/undo` import `lib/errors`. Services also need role helpers from `src/access` for the admin-only re-fetch, and no arrow allows it. Add both arrows.
- AD-5 bullet 4: "lookup and save both call it" should add `editBook`.
- AD-4 Binds lacks FR-25 and NFR-7 for `sortName`. Capability map: F5, F6 and F7 lack `/settings`, `/loans`, `/wishlists`; F3 lacks AD-14; F5 lacks AD-19 and AD-20.
- `undoAction`, the preferences action and sign-out belong to no page, and the Service naming row puts actions "beside the page". Name `src/app/(frontend)/actions.ts`.

**L2. AD-5 — where auto-share learns that a source now answers** (item 8)

- `lookupBook` returns the user's private Book before any source is called, so only the save can find out. Add to AD-5 bullet 5: "A save whose target is the user's own private Book with an ISBN calls `lookupSources` before the transaction opens."

**L3. AD-11 — a sentence was lost in the split** (item 2)

- The before-file said Undo "never reverts changes to documents that existed before the save". AD-20 now says a restore "puts back the recorded previous values", which can be read as un-sharing an auto-shared Book. Add to AD-11 bullet 3: "It does not revert an auto-share (AD-5)."

**L4. Shapes — two save functions and a discriminator** (item 8)

- `saveCopy` and `saveEntry` exist beside `SaveInput.save.kind`. Keep one: either `save(input)`, or two functions and no `kind`. `SaveResult` restates `Undoable`; write it as `Undoable<{ bookId: number; copyId?: number; entryId?: number }>`.

**L5. AD-18 — read and tag are keyed by Book in Book detail** (item 1)

- "The single-row action calls the same function with one id" fails for read and tag on a Book the user holds only on a wishlist: there is no copy id. Amend bullet 7: "Tag and read are Book-keyed functions in `lib/books`; the selection functions resolve copy ids to distinct Books and call them." The Undo table lists only "Tag (many)"; say the single tag change records a receipt too, or exclude it.

**L6. `requireOwnBook` — open or closed entries; orphan private Books** (item 1)

- AD-7 bullet 9 says "a copy or wishlist entry". Lookup's own results say "open". Use "open wishlist entry" in both.
- Removing the last copy or entry of the user's own private Book leaves a Book nothing can reach. State in AD-18 that it stays (re-found by ISBN) or that `lib/catalogue` deletes it.

**L7. Reads the seed implies but does not name** (item 1)

- Lookup's own-library search over copies and entries has no function name or return shape (`ShelfRow` needs a `copyId`). `searchBooks` has no return shape and no failure outcome, and its fan-out sits in `lib/catalogue` while the timeout and never-throw rules are stated only for `lookupSources`. The store that records cover URLs and the function the cover handler calls are unnamed. The Answer and Book detail both need "my copies, loans and entries for this Book" and each would write its own reader.
- Amendment: name `searchSources(text)` in `lib/metadata` (same rules as `lookupSources`, records cover URLs), `searchOwn(ctx, text): EffectiveBook[]` in `lib/shelf`, and one `getHoldings(ctx, bookId)`.

**L8. The `unavailable` outcome has no behaviour** (item 3)

- Location: AD-9; Deferred. Slice I9 exists, but nothing says whether the user may add by hand when the sources did not answer. That creates a private Book with an ISBN that auto-shares later. Add it under Deferred as a question for Mika. The codes a handler needs for rate limiting and for a source failure at save time are also unnamed; list them in the Errors row with `NAME_TAKEN` and `UNDO_FAILED`.

**L9. Stack — `@payloadcms/richtext-lexical` is missing from the Payload row** (items 4, 5)

- It is installed at 3.88.0 and wired in `payload.config.ts`. Payload checks that all its packages share one version. Add it to the row, or say it is removed with the old collections.

**L10. AD-7's SQL and the Drizzle schema — unverified** (items 2, 4)

- `CASE WHEN field = ANY(overridden)` assumes an array column. Payload stores a `select` with `hasMany` in a child table. State the intent ("when the field's name is in `overridden`") or fix the column type (a `json` field).
- The Drizzle helper needs table definitions. Say whether it uses the adapter's runtime tables or a committed `src/payload-generated-schema.ts`; if the file, add it to AD-13's commit list and to the generated files in the Story size row.

**L11. Server actions behind `tailscale serve` — unverified, carried over** (item 4)

- Next compares `Origin` with the forwarded host. The 2026-10-03 review raised `serverActions.allowedOrigins`; the Deployment seed still does not mention it. Add one bullet, or have K3 assert an action works through the proxy.

**L12. Caching convention against receipts** (item 8)

- "No shared or cross-request caching of anything derived from user data" reads as forbidding the receipt store and the `requestId` memory, which hold a user's previous values across requests. Add: "Undo receipts and `requestId` memory are per-user state under AD-12, not caches."

**L13. Deferred and operations gaps** (items 3, 7)

- "Section slide and list sweep … left out otherwise" lets each screen story decide. Give it one owner: "built once in the section shell, or not at all."
- The cover download runs in the save path and its timeout is not in "Lookup tuning".
- Silent: which image tag the LXC pulls and how a bad release is rolled back once its migration has run; the attributes of `bookeh_prefs` (lifetime, `SameSite`, not `HttpOnly` only if the client reads it).

**L14. UX lines the spine overrides without saying so; SPEC.md is stale** (item 6)

- EXPERIENCE.md says the Answer names any "author, series or genre that this save would create". AD-5 creates no genres and `LookupResult.matches` has none. Admin re-fetch (FR-19) has no control in the UX's Book detail. Note both where the spine decides them, so the screen stories do not follow the UX text.
- SPEC.md still has CAP-6 Review, a home screen in CAP-10 and "AD-1 to AD-19", and calls itself the canonical contract. It was not part of this update. Update it or mark it superseded before stories are written from it.

**L15. Terseness** (item 9)

- The spine grew from 507 to 573 lines, about right for what it took in. AD-7 now carries three concerns in ten bullets (the query, URL and paging, the no-browsing gate); the gate could become its own AD without renumbering.
- "Known scaffold gaps the first stories close" repeats slices A1 to A6 and K2 and can go. The Stack table's bump notes belong to slice A1.
