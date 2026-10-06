---
title: Adversarial review — Architecture Spine, Bookie
reviewed: ../ARCHITECTURE-SPINE.md (status draft, 2026-10-03)
against: ../../../prds/prd-bookeh-2026-10-02/prd.md, addendum.md, CLAUDE.md, code at 7d34440
created: 2026-10-03
---

# Adversarial review: can two compliant stories still diverge?

## Verdict

Not yet safe to slice. The spine fixes where things live and who may bypass access, but it leaves the primary flow's shared shapes and write ownership open: lookup result, save input, override storage for relationship fields, the save transaction across the gateway, and who creates copies and `user-books` rows. Three findings are critical (two compliant stories cannot both be merged without one being rewritten), nine are high, the rest medium or low.

Counts: 3 critical, 9 high, 8 medium, 2 low.

## How to read the findings

Each finding names two Phase 1 stories, shows that each obeys the spine as written, shows the incompatibility, and proposes the smallest rule that closes it. "Story" means one collection, one service or one screen, as the spine's Story size row defines it.

Payload behaviour cited below was checked in `node_modules` at 3.88.0, not assumed:

| Fact | Where |
| --- | --- |
| Relationship validation checks only that the id has a valid type. It does not check that the target exists for, or is readable by, the user. | `payload/dist/fields/validations.js`, `relationship` |
| Population under `overrideAccess: false` returns the bare id for an unreadable target ("ids are visible regardless of access controls"). | `payload/dist/fields/hooks/afterRead/relationshipPopulationPromise.js` |
| `like` and `contains` both map to `ILIKE`; `equals` is case-sensitive. There is no case-insensitive exact match in a Payload `where`. | `@payloadcms/drizzle/dist/queries/operatorMap.js` |
| Single relationships become a foreign key with `ON DELETE SET NULL`, plus `NOT NULL` when required. `hasMany` relationships live in a `<table>_rels` table. `select` fields become Postgres enums. | `@payloadcms/drizzle/dist/schema/traverseFields.js` |
| `migrate:create` diffs the current schema against the newest `*.json` snapshot in the migrations folder, picked by filename sort. | `@payloadcms/drizzle/dist/utilities/buildCreateMigration.js` |
| Inside a transaction the adapter uses `sessions[req.transactionID].db`; `payload.db.drizzle` is the pool, outside it. | `@payloadcms/drizzle/dist/utilities/getTransaction.js` |

One housekeeping point that affects every story agent: the front matter lists `STORY-SLICING.md` as a companion, and it does not exist in the folder.

---

## Critical

### C1 — Overrides for relationship fields and cleared values have no defined shape

- **Stories:** (A) collection story `UserBooks`; (B) service story `saveCopy` in `lib/catalogue`; (C) service story `lib/shelf`; (D) service story `EffectiveBook` in `lib/books`.
- **Each complies:** AD-6 says "nullable override fields", "declared once in `bookFields.ts`", "override if set, otherwise shared". AD-7 says `COALESCE(override, shared)`. Nothing says what "set" means for `authors` (hasMany), `series` (single relation), `genres` (hasMany) or `cover`.
  - A reuses `bookFields` verbatim, so `user-books.authors` is a hasMany relationship stored in `user_books_rels`. An empty array and "not overridden" are the same thing there.
  - B must store "the user typed *Mika Waltari* where Finna said *Waltari, Mika*". AD-5 forbids writing that to a shared author. FR-17 says private authors come only from private Books. B has no legal target, so it picks one: a private author row, a `text[]` override, or dropping the edit.
  - C writes `COALESCE` per column. There is no column for a hasMany field, so C invents "use override rels if any exist".
  - D uses `??` in TypeScript. For a cleared subtitle A stores `''` or `null` depending on the form; `??` keeps `''`, a screen using `||` falls back to the shared value, and SQL `COALESCE('', shared)` returns `''`.
- **Incompatibility:** A user who removes a wrong author, clears a subtitle or removes the series sees the edit on the detail page and not in the list, or the reverse. Filter by author (FR-25, "use the user's overrides") disagrees with the detail page. B's choice for typed author names decides whether A's schema is usable at all.
- **Also:** the spine has two effective-value implementations by design (`??` in `lib/books`, `COALESCE` in `lib/shelf`) while AD-7 claims to prevent exactly that, and AD-6 says the surface receives only `EffectiveBook` while AD-7 says shelf returns "ids and effective fields". List screens will render shelf rows; detail screens will render `EffectiveBook`; the two types drift.
- **Closing rule (tighten AD-6 and AD-7):**
  1. `user-books` carries `overridden: string[]`, the list of overridden field names. A field is overridden if and only if its name is in that list; the stored value may then be null or empty, which means "cleared". Effective value is `overridden.includes(f) ? userBook[f] : book[f]`, and in SQL `CASE WHEN f = ANY(overridden)`.
  2. Relationship overrides are relationship fields to the same collections. A name the user typed that matches no readable record becomes a private author or series (`visibility: private`, `createdBy` the user), referenced only from that user's override, never from a shared Book.
  3. The spine prints the `EffectiveBook` type: `bookId, isbn13, visibility, source, title, subtitle, authors: {id, name}[], series: {id, name} | null, seriesIndex, genres: {id, name}[], publisher, year, language, pages, description, coverUrl, overridden`. Read flag, rating and tags are a separate `UserBookState`.
  4. `lib/shelf` returns an ordered page of copy ids, Book ids and a total, nothing to render. Screens hydrate through `getEffectiveBooks(user, bookIds)` in `lib/books`. SQL effective logic is then used only for filter and sort.

### C2 — The lookup result has no contract and no legal home for its database half

- **Stories:** (A) service story "lookup" in `lib/metadata`; (B) screen story "review screen"; (C) service story `saveCopy`; (D) screen story "shop check".
- **Each complies:** AD-9 says lookup "returns an existing shared Book for the ISBN if there is one" and otherwise "the unified shape". The source tree puts `lookup` in `lib/metadata`. The diagram gives `lib/metadata` one outgoing arrow, to the external sources, and "arrows are the only allowed import directions". So the module that must return an existing Book may not read the database.
  - A either breaks the diagram, or returns only source results and leaves "existing Book first" to someone else.
  - B needs, per FR-13 and FR-16: source chip, new-or-existing flag per author, series and genre, the user's existing copies, and a cover preview. None is in "the unified shape", which the spine never prints (it exists only in CLAUDE.md, with `source: 'finna' | 'google'` and a single `raw`, both contradicted by AD-9's merge).
  - For an existing Book, A returns a `books` document (author ids, media id), an `EffectiveBook`, or the unified shape rebuilt from it (author names, `coverUrl`). AD-6 forbids handing a `books` document to the surface.
  - The new-or-existing flags need a case-insensitive exact name match. Payload `where` cannot express it, and Drizzle is allowed only in `lib/catalogue` and `lib/shelf`. A computes the flags with `like` (substring), C creates by exact match: the screen says "exists", the save creates a duplicate.
- **Second gap, private Books:** AD-9 names only shared Books. A user who entered an old book by hand (no source match, has an ISBN) and scans a second copy gets no hit, the manual form again, and a second private Book for the same edition, which AD-4 explicitly allows. FR-16's "you already own this" warning never fires. This will happen in Phase 1 with older Finnish books.
- **Incompatibility:** B and D are built against a shape A did not produce; C re-derives matches that disagree with what B showed.
- **Closing rule (new AD, replaces the first two sentences of AD-9):** Lookup has two layers.
  - `lookupSources(isbn13)` in `lib/metadata`: no database access, cacheable, returns `SourceResult | null`. The spine prints `SourceResult`: `isbn13, title, subtitle?, authors: string[], publisher?, year?: number, language?, pages?: number, coverUrl?, subjects: string[], series?, seriesIndex?: number, description?, source: SourceId, raw: Record<SourceId, unknown>`.
  - `lookupBook(user, isbn13)` in `lib/catalogue`: returns `{ kind: 'existing', book: EffectiveBook, mine: { copyIds, entryIds } } | { kind: 'source', lookupToken, draft: SourceResult minus raw, matches: { authors: { name, id | null }[], series: { name, id | null } | null } } | { kind: 'none' }`. Order: a Book the user can read with that ISBN (shared first, else the user's own private Book), then sources.
  - Name matching is one function (see H7) used by both lookup and save.

### C3 — A save cannot be one transaction, user-scoped, and obey the gateway rule

- **Stories:** (A) service story "gateway and `requireUser`" in `lib/payload`; (B) service story `saveCopy` in `lib/catalogue`; (C) collection story `Copies` with `ownerField()`.
- **Each complies:**
  - A builds what AD-2 describes: calls that "always pass the signed-in user and `overrideAccess: false`". Nothing asks for a transaction parameter, so the gateway creates its own request per call.
  - B must create Book, authors, series, cover, `user-books` and copy "in one Payload transaction" (AD-11). AD-3 lets `lib/catalogue` use system privileges for "writing shared records" only. Copy and `user-books` are private.
  - C's hook sets `owner` "from the session", "never accepted from input" (AD-1).
- **Incompatibility:** B has three options and each breaks something. Through A's gateway, the private writes run outside the transaction, so a failed copy leaves a committed Book (AD-11 broken). With `overrideAccess: true` and its own `req`, B exceeds AD-3's stated purpose, and C's hook finds no session user unless B happens to pass `user`. With `owner` passed as data, C's hook rejects or ignores it. The same hole hits `src/scripts` seed: system privileges, no session, so no owned row (default wishlist, locations) can be seeded at all. `createdBy` on private Books has the same question and no rule: AD-4 says a private record "has `createdBy`" without saying who sets it.
- **Also:** any Drizzle call inside the save (the case-insensitive author match) run on `payload.db.drizzle` reads outside the transaction and will not see authors created earlier in the same save.
- **Closing rule (tighten AD-2, AD-3, AD-11):**
  1. `lib/payload` exports `withTransaction(user, fn)`, the only place a transaction is opened. It hands `fn` a context carrying `req` with `user` and `transactionID`.
  2. Every gateway function and every allowlisted system-privilege function takes that context. Private collections are always written through the gateway, also from `lib/catalogue`. System privileges are used for shared records only.
  3. `ownerField()` and `createdBy` are set by hook from `req.user` and throw when it is absent. Scripts build a `req` with an explicit user; they never pass `owner` as data.
  4. Drizzle access goes through one helper in `lib/payload` that returns the transaction's session when the context has one.

---

## High

### H1 — Deciding what is an override by diffing against a re-fetched response

- **Stories:** (A) service story "lookup cache" in `lib/metadata`; (B) service story `saveCopy`; (C) screen story "review screen".
- **Each complies:** AD-5: values written to the shared Book are "the merged source response held server-side (lookup cache, re-fetched on a miss)", and "every value submitted by the client that differs from it is stored as that user's override". AD-12: the cache "must be safe to lose on restart". C posts the whole form.
- **Incompatibility:** After a restart, an eviction or a slow Finna on the second call, the re-fetched merge differs from what the user reviewed (for example Google only). Every Finna value the user left untouched now "differs" and is stored as an override, and the shared Book gets the poorer record. No story is wrong. The diff also depends on form normalisation (`"1954"` against `1954`, trailing spaces, author order), which B and C each define on their own.
- **Closing rule (tighten AD-5):** The client submits a sparse `edits` object containing only fields the user changed, computed against the draft it was given. The server never diffs. The save input is `{ target: { bookId } | { lookupToken } | { manual: draft }, edits, copy | entry }`. A `lookupToken` miss triggers the re-fetch; `edits` still apply as overrides only.

### H2 — Undo trusts a client-held receipt and has no rule for `user-books` or for updates

- **Stories:** (A) service story `saveCopy` and `undoSave`; (B) screen story "review screen" with the Undo toast; (C) service story "second copy" or shop-check "Mark bought", which also calls save.
- **Each complies:** AD-11: save "returns a receipt listing the ids it created"; Undo "takes the receipt and deletes exactly those documents that nothing else references". `lib/catalogue` runs with system privileges (AD-3). B keeps the receipt in the toast and posts it back, which is the obvious reading of "takes the receipt".
- **Incompatibility:**
  1. Forged receipt. `undoSaveAction(receipt)` deletes, with system privileges, any listed id that nothing references: an unreferenced shared author, a media row, another user's empty wishlist, location, Person or tag. AD-3's "scopes by the acting user" has no meaning for a shared record, which has no `createdBy`.
  2. `user-books`. Nothing references a `user-books` row, so "nothing else references" is always true. Save 1 creates the Book and the row; the user scans a second copy before the toast expires; save 2 reuses the row and adds tags. Undo 1 keeps the Book (copy 2 references it) and deletes the row, with the overrides and tags copy 2 depends on.
  3. Updates. A save that reuses an existing `user-books` row changes overrides; a save from a wishlist entry closes the entry (FR-28). A receipt of created ids cannot revert either.
- **Closing rule (tighten AD-11):** The receipt stays on the server, in process, bounded, keyed by an opaque `undoToken` and the user (AD-12 allows this; after a restart Undo is unavailable). The client holds only the token. The receipt is `{ created: { collection, id }[], closedEntryIds: id[] }`. Undo deletes the copy or entry, reopens `closedEntryIds`, deletes a created Book, author, series or media row only when no row of any user references it, and deletes a created `user-books` row only when that user has no other copy or entry for the Book. Undo never reverts updates to documents that existed before the save.

### H3 — Nobody owns the `user-books` row

- **Stories:** (A) service story `saveCopy`; (B) screen story "book detail: read flag, rating, tags" (FR-26, FR-29); (C) service story `lib/shelf`; (D) service story "wishlists: mark bought".
- **Each complies:** AD-6 says "one row per (owner, Book), unique". AD-11 lists `user-books` among the documents a save creates when "needed". The source tree has no module for it; `lib/books` holds `EffectiveBook`, `lib/catalogue` holds save.
  - A creates the row only when there are overrides or tags.
  - B reads AD-6 as "the row exists" and calls update, or writes its own upsert in `lib/books` or `lib/copies`.
  - C reads AD-6 the same way and uses an inner join.
  - D creates a copy through the gateway and never thinks about the row.
- **Incompatibility:** Copies saved without edits vanish from C's lists. B's update fails for Books saved by A without edits, or B and A both insert and hit the unique index. The row's fate when the last copy is deleted is undefined: delete it and the rating of a book given away is lost; keep it and nothing says shelf must ignore it.
- **Closing rule (tighten AD-6):** The row is lazy. `upsertUserBook(ctx, bookId, patch)` in `lib/books` is the only writer and every other module calls it. Every reader treats a missing row as "no overrides, unread, unrated, no tags"; `lib/shelf` uses a left join. The row is never deleted when copies or entries are removed; only Undo (H2) and account deletion remove it. Uniqueness is a compound unique index on `(owner, book)`.

### H4 — Relationship ids are not authorised, and shelf joins around the Book access rule

- **Stories:** (A) screen story "shop check: Mark bought", action takes `bookId`; (B) collection story `Copies`; (C) service story `lib/shelf`. The same pattern exists for `copies.location`, `loans.copy`, `loans.person`, `wishlist-entries.wishlist`, `wishlist-entries.forPerson` and `user-books.tags`.
- **Each complies:** A starts with `requireUser()` and calls a service; it does not "filter by user id as its means of authorisation" (AD-2). B gives `copies` owner-only access (AD-1). Payload does not check that a relationship target is readable (see the facts table), so creating a copy that points at any Book id succeeds. C "scopes by the passed user" (AD-7) on `copies.owner` and joins `books`.
- **Incompatibility:** A copy owned by user 1 can reference user 2's private Book, by guessing an integer id (Ids convention). A gateway read of that Book is denied, but C runs under system privileges and returns the private Book's title, authors and ISBN in user 1's list. Likewise a loan can point at another user's copy or Person, and a copy at another user's location; the population returns only the id, but the foreign row is now pinned by a `NOT NULL` foreign key the owner cannot see or clear. Not exploitable with one user. In Phase 2 it is a privacy bug that "Visibility enforced and tested" would only find after the data is already cross-linked.
- **Closing rule (new sentence in AD-1 and in AD-7):** Every relationship field on a private collection is built with `ownedRelation(slug)` or `readableRelation(slug)` from `src/fields`, whose validation re-reads the target as `req.user` with `overrideAccess: false` and rejects on a miss. A system-privilege function resolves every client-supplied id through the gateway before using it. `lib/shelf` applies the `books`, `authors` and `series` read constraint in its joins, from one SQL predicate exported beside the access helper.

### H5 — AD-5's match scope plants private authors in shared Books, and auto-share has no owner

- **Stories:** (A) service story `saveCopy`, shared path; (B) service story `saveCopy`, manual-entry path (or the same story later); (C) collection story `Books` access.
- **Each complies:** AD-5: find-or-create "author and series by case-insensitive name among records the user can read". The user can read their own private authors (AD-4). So A, creating a shared Book from Finna, matches the user's private author "Mika Waltari" (created earlier with a manual private Book) and links the shared Book to it.
- **Incompatibility:** The shared Book now references a private author. For any other user the author populates as a bare id; admin promotion and merge logic must special-case it. This is Phase 1 data that Phase 2 has to repair, against the PRD's "later phases add features without migrating data".
- **Auto-share (FR-12, AD-4):** "ISBN auto-share change `visibility` and clear `createdBy`" has no owner and no trigger. Lookup is read-only (AD-9), so it cannot happen there. If A does not do it, a rescan that Finna now answers creates a shared Book beside the private one: two Books for one edition, one user. If A does it, three things are undefined: which private Book flips when several share the ISBN ("private Books may repeat an ISBN" against "at most one shared Book per ISBN"); what happens to the creator's typed values, which AD-5 forbids as shared values; and what happens to its private authors.
- **Closing rule (tighten AD-4 and AD-5):**
  1. A shared Book references only shared authors and series: for a shared Book, find-or-create matches among shared records only; for a private Book, among shared records plus the creator's private ones.
  2. At most one private Book per `(createdBy, isbn13)`; C2's lookup order guarantees it.
  3. Auto-share is done by `lib/catalogue` in the save transaction, for the acting user's own private Book only: the row is kept, `visibility` flips, `createdBy` clears, fields are replaced by the source values, the creator's previous values that differ become their overrides, and private authors and series are re-pointed to shared find-or-create results. Other users' private Books with that ISBN are left for the Phase 3 merge.

### H6 — Three modules can create a copy, each with its own rules

- **Stories:** (A) service story `saveCopy` in `lib/catalogue` (AD-11: "saving a copy"); (B) service story "wishlists: mark bought or ordered" in `lib/wishlists` (FR-28); (C) collection story `Copies` or service story `lib/copies` "Received" (FR-28) and default location (Glossary: "new owned copies get" it).
- **Each complies:** The Capability map puts copies under `lib/copies` for F5, save under `lib/catalogue` for F2, entries under `lib/wishlists` for F7. The source tree lists `copies/ loans/ wishlists/` with no responsibilities. AD-8 says a single-collection invariant goes in that collection's hooks, and "an owned copy without a location gets the default location" reads as one.
- **Incompatibility:**
  - Default location has three owners: the review screen pre-selects it, `saveCopy` fills it when absent, and a `Copies` hook fills it when null. With the hook, a user who picks "no location" gets the default anyway, and the hook must read `users`, which is cross-collection.
  - Shop check "Mark bought" on a Book that shows the Wishlist chip goes through A and leaves the entry open; the wishlist page goes through B and closes it. The same Book ends up owned and wished, or not, depending on the screen.
  - B creates its copy through the gateway directly, with no receipt and no default location.
  - Whether `lib/wishlists` may import `lib/catalogue` or `lib/copies` is not stated; the diagram treats all services as one node.
- **Closing rule (new AD):** `createCopy(ctx, { bookId, status, location?: id | null })` in `lib/copies` is the only function that inserts into `copies`. `location: undefined` on an owned copy means the profile's default location; `null` means none; no hook sets a default. Creating a copy closes the user's open entries for that Book that have no recipient, in the same transaction, and reports them for the receipt. `saveCopy` is "ensure the Book, then `createCopy`"; `closeEntry` in `lib/wishlists` calls `createCopy` unless the entry is for a Person. Service imports are one-way: `catalogue → copies, wishlists, books, metadata`; `wishlists → copies`; `loans → copies`; `books` and `shelf` import no other service.

### H7 — Name matching has several owners, and adapters emit different name forms

- **Stories:** (A) service story "Finna adapter"; (B) service story "Google Books adapter"; (C) `saveCopy` author and series find-or-create; (D) screen or service story "personal tags" (FR-17) and "locations inline add" (FR-31).
- **Each complies:** A and B each "return the unified shape" (AD-9). Finna gives MARC-style "Waltari, Mika"; Google gives "Mika Waltari". The Language codes row tells adapters to convert languages; nothing says the same for names. C matches "by case-insensitive name" (AD-5). D matches tags "within the user's own tags" with whatever comparison it writes.
- **Incompatibility:** The same author is created twice in the shared layer, depending on which source answered first for which book. Field-by-field merge takes Finna's authors and Google's for the next book. Cleaning that up is the Phase 3 merge tool applied to Phase 1 data. Case-insensitive exact match cannot be written as a Payload `where`, so C uses Drizzle, D uses `like` (substring: "Sci" matches "Sci-fi"), and lookup's new-or-existing flags (C2) use a third variant. Trimming and inner whitespace are undefined everywhere.
- **Closing rule (two convention rows):**
  - *Names:* Adapters emit person names as "Given Family". `authors`, `series`, `genres`, `tags`, `locations` and `people` include `nameKeyField()` from `src/fields`: a hook-maintained `nameKey` (trimmed, inner whitespace collapsed, lower-cased). Matching anywhere is `equals` on `nameKey` through the gateway. Uniqueness is `(nameKey)` among shared rows and `(owner or createdBy, nameKey)` among private rows.
  - *Matching:* `findOrCreateByName` lives in `lib/catalogue` for shared-or-private collections and in the owning service for private ones; screens never match names.

### H8 — Covers: two downloaders, a preview the spine forbids, and no access rule for `media`

- **Stories:** (A) collection story `Books`; (B) service story `saveCopy`; (C) screen story "review screen" (FR-13: "a cover preview") and "shop check" (FR-20: result shows the cover); (D) collection story `Media`.
- **Each complies:**
  - AD-14: "When a Book is created, the server downloads the source cover". AD-8 sends single-collection behaviour to hooks, so A adds an `afterChange` hook. AD-11 lists "cover" among what the save creates, so B downloads too. Result: two media rows, or a network call inside the database transaction.
  - AD-14: "The browser never loads a cover from a metadata source". AD-9: lookup writes nothing. AD-10: media URLs come only from `coverUrl()`. C therefore has no permitted way to show a preview of a Book that is not saved yet. One agent hotlinks, one inlines a data URI in the lookup result, one adds a proxy route.
  - `media` is in neither the AD-1 list nor the AD-4 list. D keeps the committed `read: () => true`.
- **Incompatibility:** Duplicate or missing covers depending on merge order; a failed download either fails the whole save (NFR-2, FR-15) or does not, per story; files written to the NAS are not rolled back with the transaction. With `read: () => true` and filenames derived from the source (often the ISBN), anyone who can reach `/api/media/file/<isbn>.jpg` can test whether a Book is in the catalogue, against FR-20. Phase 3's "unapproved uploaded cover: uploader and admin only" then needs an ownership column on rows that have none.
- **Closing rule (tighten AD-14, add `media` to AD-4):**
  1. Only `lib/catalogue` downloads covers, never a hook. Bytes are fetched before the transaction opens; the media row is created inside it; a failed download saves the Book without a cover and logs.
  2. Unsaved covers are shown through one authenticated route under `(frontend)` that streams the image for a `lookupToken` from the lookup cache. `coverUrl()` produces that URL too.
  3. `media` carries `visibility` and `createdBy` like the AD-4 collections; read access requires a signed-in user; stored filenames are random.

### H9 — Parallel schema stories produce migrations that do not compose

- **Stories:** any two collection stories built from the same base, for example `Locations` and `People`.
- **Each complies:** AD-13: each "commits the generated migration under `src/migrations`" with regenerated types. Each migration is correct against its own branch.
- **Incompatibility:** `migrate:create` diffs against the newest snapshot by filename. After both merge, the newest snapshot (say `People`'s) does not contain `locations`. The next schema story's migration re-creates `locations`, and the production container fails at start on `CREATE TABLE`. Dev never notices, because dev pushes. This is the cost of "small stories built independently" combined with snapshot migrations.
- **Closing rule (extend AD-13):** Schema-changing stories merge one at a time. Before merge the story rebases, deletes its own migration and snapshot, and regenerates. CI applies all migrations to an empty database and then runs `payload migrate:create --skip-empty`, failing if it produces a file.

---

## Medium

### M1 — `books.source` as an enum contradicts "one adapter file and one array entry"

- **Stories:** (A) collection story `Books`; (B) a later source-adapter story.
- **Each complies:** A models `source` as a `select`, as the committed `metadataSource` does. B follows AD-9: one file, one array entry.
- **Incompatibility:** A `select` is a Postgres enum. B's first save fails validation until a schema change and migration are added, which AD-9 says are not needed. Collections may not import the registry from `lib/metadata` (import rule), so the option list cannot be shared.
- **Closing rule (AD-9):** `books.source` is a `text` field holding a source id, null for a manual Book. The `SourceId` type and the id list live in `src/fields`, and the registry imports them.

### M2 — Hooks cannot use the gateway, and `req.payload` defaults to system privileges

- **Stories:** (A) collection story `Loans` with a "one open loan per copy" hook; (B) collection story `Tags` with a "unique name per owner" hook.
- **Each complies:** "`src/collections` imports only from `src/access` and `src/fields`", so a hook cannot import the gateway. It calls `req.payload.find`, which defaults to `overrideAccess: true`. AD-3's allowlist names modules, not hooks, and AD-2 speaks of "frontend-reachable code", which a hook is.
- **Incompatibility:** A passes `user` and `overrideAccess: false`; B does not. B's uniqueness check then sees every user's tags: in Phase 2 a user cannot create "fantasy" because someone else has it, and the error reveals that. A hook that omits `req` also reads outside the transaction.
- **Closing rule (AD-3):** Hooks and access functions query only through `asRequestUser(req)` from `src/access`, which fixes `req`, `user: req.user` and `overrideAccess: false`. Hooks never write to another collection.

### M3 — The back office writes around every service-enforced rule

- **Stories:** (A) service story `saveCopy` (enforces one shared Book per ISBN "in the service", per Deferred); (B) the back-office use the memlog keeps on purpose (the admin, who is also the only user, bulk-edits his own rows and creates or edits shared Books).
- **Each complies:** The diagram sends the back office straight to the Local API. AD-8 puts cross-collection invariants in services. Access functions cannot tell the back office from the gateway.
- **Incompatibility:** A shared Book created or re-ISBNed in the back office duplicates an ISBN; lookup then returns whichever row comes first. A loan created there skips "owned copies only"; a wishlist entry closed there creates no copy. The Deferred partial unique index "when a second user" arrives will fail to build on duplicated data, which is a Phase 2 data fix.
- **Closing rule (AD-5 and Deferred):** The partial unique index on `books(isbn13) WHERE visibility = 'shared'` ships in the first migration, hand-added. `loans`, `wishlist-entries` and `user-books` are hidden in the back office; `copies` is editable there for `location`, `status` and `notes` only.

### M4 — `ActionResult`, `DomainError` and error codes have a name but no shape or home

- **Stories:** any two screen stories built in parallel, for example "login" and "scan".
- **Each complies:** The Errors row names the types. The source tree has no file for them. Each story defines `ActionResult` beside its page: `{ ok, data }` against `{ status, error }`; codes as `ISBN_INVALID` against `invalid-isbn`; message keys as `errors.ISBN_INVALID` against `scan.errors.invalidIsbn`.
- **Incompatibility:** The shared toast component cannot render both. Payload's own errors are unmapped: a gateway `Forbidden` or `NotFound`, a hook's `ValidationError`, a foreign-key failure. FR-15 needs field errors returned without losing edits, and nothing carries them. `requireUser()` inside an action redirects in one story and returns an error in another.
- **Closing rule (replace the Errors row):** `src/lib/errors.ts` defines `DomainError(code, fields?)` and `type ActionResult<T> = { ok: true; data: T } | { ok: false; code: ErrorCode; fields?: Record<string, ErrorCode> }`. Codes are `SCREAMING_SNAKE`, listed in one union in that file; the message key is `errors.<code>`. Every action body runs inside `runAction()` from the same file, which maps `Forbidden` and `NotFound` to `NOT_FOUND`, `ValidationError` to `VALIDATION` with `fields`, and anything else to `INTERNAL` with a log line. `requireUser()` redirects to sign-in from pages and actions alike.

### M5 — Genres between the save story and the deferred genre story

- **Stories:** (A) service story `saveCopy`; (B) the deferred "genre curation" story; (C) screen story "review screen" (FR-13 shows whether each genre "is new or already exists").
- **Each complies:** AD-4 gives `genres` a `visibility`, implying users can cause private ones. AD-5's find-or-create names only authors and series. Deferred leaves seeding and subject mapping to B.
- **Incompatibility:** A, built first, either creates a shared genre per Finna subject (hundreds of uncurated rows that B must then merge) or writes none (C's flag has nothing to show). A user's genre edit has the C1 problem with no private-genre rule.
- **Closing rule (AD-5):** Saves never create genres. `books.genres` is written only by `mapSubjectsToGenres()` in `lib/catalogue`, which returns nothing until the genre story lands and is re-run over stored subjects afterwards. `genres` leaves the AD-4 list and is shared only; a user's genre change is an override that picks from existing genres.

### M6 — Edits to a private Book: the Book or an override?

- **Stories:** (A) collection story `Books` access; (B) screen story "book detail: inline edit" (FR-26).
- **Each complies:** AD-5: for a private Book "the submitted values are the Book's values", so A grants update where `createdBy` is the user. AD-6: effective value is override or shared, so B writes every edit through the override path, uniformly.
- **Incompatibility:** Both work for one user. In Phase 2 a friend sees the private Book's own values (Visibility table), not the creator's overrides, so edits made through B are invisible to friends; on promotion the stale values become the shared record.
- **Closing rule (AD-6):** While a Book is private, its creator's edits update the Book through `lib/catalogue`, and that user's override fields for it stay empty. Overrides exist only on shared Books.

### M7 — `rawMetadata` shape and who may read it

- **Stories:** (A) service story "lookup merge"; (B) service story `saveCopy`; (C) the genre story and the admin re-fetch story (FR-19), which read it back.
- **Each complies:** AD-9: "every response keyed by source id, plus the raw subjects"; AD-14: the cover's source URL "stays in `rawMetadata` only". That allows `{ finna, google, subjects }` (where `subjects` collides with a possible source id) or `{ sources, subjects }`; subjects merged or per source; the cover URL as a top-level key or buried in a response (Finna's is a relative path the adapter completes, so the raw response does not contain the usable URL).
- **Incompatibility:** C parses a shape B did not write. FR-18 says raw data is never shown to other users, but a gateway read of a shared Book returns the field to every user who can read the Book.
- **Closing rule (AD-9):** `rawMetadata` is `{ v: 1, fetchedAt, sources: Record<SourceId, unknown>, subjects: Record<SourceId, string[]>, coverUrl: string | null }`. The field has admin-only read access, and `EffectiveBook` never includes it.

### M8 — Rule placement for loans and deletes is ambiguous under AD-8

- **Stories:** (A) collection story `Loans`; (B) service story `lendCopy`; (C) collection story `Copies` (delete access for the owner).
- **Each complies:** "At most one open loan per copy" involves one collection, so AD-8 sends it to A's hook. "Lend an *owned* copy" spans two, so it goes to B. Both implement the open-loan check; A throws a Payload `ValidationError`, B a `DomainError`. C allows delete to the owner.
- **Incompatibility:** The same violation surfaces with two error codes. `loans.copy` is required, so its foreign key is `SET NULL` on a `NOT NULL` column: deleting a copy with loan history, or a Person with loans, fails with a raw database error. The same applies to deleting a location in use, or one set as the default location, and a wishlist with entries. No story owns these.
- **Closing rule (AD-8 plus a convention row):** An invariant a database constraint can express is a constraint (partial unique index on `loans(copy)` where the loan is open); the service check exists only to raise the `DomainError`. *Deletes:* a copy deletes its loans; a Person with loans or entries cannot be deleted (`PERSON_IN_USE`); deleting a location clears it from copies and from the profile default; deleting a wishlist deletes its entries. Each is one function in the owning service, and the collection's own delete access is denied for those four.

---

## Low

### L1 — Admin re-fetch (FR-19) has no permitted call path

FR-19 is part of F2, so Phase 1. It needs `lib/metadata` and `lib/catalogue`, and it is triggered from the back office. The diagram gives `app/(payload)` one arrow, to the Local API, and "theme only". A story must either break the import rule or put an admin screen in `(frontend)`. **Closing rule:** add the arrow `app/(payload) → lib/catalogue` for admin-only actions, or state that re-fetch is a script under `src/scripts` in Phase 1.

### L2 — Double submit of a save

Duplicates are legitimate, so nothing dedupes two identical saves from a double tap, and two concurrent saves of a new ISBN can each create the shared Book (the service check is not atomic; see M3 for the index). **Closing rule:** the save input carries a client-generated `requestId`; `lib/catalogue` remembers recent ids per user in process (AD-12) and returns the first result for a repeat.

---

## Checked and not reported

These looked like candidates and are legitimately one story's decision, or are covered above: shelf pagination and filter parameter shape (one owner, `lib/shelf`); the "open loan" representation (one owner, `Loans`); how the wishlist entry records closure (one owner, `WishlistEntries`); login cookie handling (one owner, `lib/payload`); Phase 2 friend-visibility joins (no Phase 1 data depends on them once H4 and H5 are closed).

## Proposed order of fixes

1. C3, then C2 and H1 together: they define the contexts and types every other service signature uses.
2. C1 and H3: they fix the `user-books` schema before its collection story.
3. H4, H5, H7, H8, M3: they decide columns (`nameKey`, `media.visibility`, the partial index) that are cheap in the first migration and a data fix later.
4. H2, H6, H9, then the mediums.
