---
title: Spine review — reconciliation against inputs
type: review
reviews: ../ARCHITECTURE-SPINE.md
inputs:
  - ../../../prds/prd-bookeh-2026-10-02/prd.md
  - ../../../prds/prd-bookeh-2026-10-02/addendum.md
  - ../../../../../CLAUDE.md
created: '2026-10-03'
---

# Spine review: reconciliation against inputs

## Verdict

The spine carries the PRD's data model, phasing and stack faithfully, and it answers Open Questions 3 and 4. It has no contradiction that blocks Phase 1. It does have two holes that would produce wrong data or a Phase 2 rewrite (R1, R2), one unstated access rule for two collections (R3), and a set of quiet constraints that are listed under "Binds" or "Deferred" without any rule text behind them (R4 to R8). Everything else is small.

Every fix below is a sentence or a table row. None needs a new layer or collection.

## How this was checked

Every FR (1 to 52), NFR (1 to 8), the Visibility table, Account lifecycle, Build Order, Open Questions, Scope, the addendum and each CLAUDE.md section were read against the spine's ADs, conventions, seed, capability map and Deferred list. `STORY-SLICING.md` and the current `src/collections` were used only to confirm whether an omission is picked up elsewhere. Payload 3.88 facts quoted here were checked in `node_modules/payload` (`auth.useSessions` exists and defaults to true; `/first-register` exists).

Severity: **High** means wrong data or a privacy leak that is expensive to undo. **Medium** means stories can diverge or a stated input rule has no home. **Low** means a wording or bookkeeping fix.

## Findings

### R1 (High) — ISBN auto-share is undefined and collides with AD-5 and AD-9

- **Input requires.** FR-12: a private Book becomes shared automatically when a later external lookup matches its ISBN. FR-11: lookup is read-only. FR-14 and Key decisions: shared values are the source's values, and nothing in the shared layer may reveal what a user wrote. F2 is Phase 1 in full, so this path is reachable by Mika alone: enter a book by hand with its ISBN, then scan it again once Finna has it.
- **Spine says.** AD-4: "Promotion and ISBN auto-share change `visibility` and clear `createdBy`; they never copy rows." AD-9: lookup writes nothing. AD-5: shared values never come from the client, and a private Book's values are the user's submitted values.
- **Problem.** Taken together these put user-typed values into the shared layer under a `source` that never supplied them. That is correct for admin promotion (the admin approved the values) and wrong for auto-share. The spine also does not say when auto-share happens (it cannot be in lookup), whether AD-5's find-or-create "Book by ISBN-13" sees private Books, what happens to the private authors and series attached to the Book, or what happens when the saving user has a private Book and a shared Book for that ISBN already exists. `STORY-SLICING.md` has no slice for it; D5 covers creation only.
- **Smallest fix.** Add to AD-4, after the promotion sentence: "ISBN auto-share happens only inside the save transaction in `src/lib/catalogue`. If no shared Book exists for the ISBN and the saving user has a private one, that row is promoted: the merged source values are written to it, the creator's former values that differ become their `user-books` overrides, `source` and `rawMetadata` are set, authors and series are re-matched to shared records. If a shared Book already exists, the user's copies, entries and `user-books` row move to it and the private Book is deleted. Other users' private Books are never touched; that is an admin merge (FR-46)." If that is too much to decide now, put the first sentence and "a promoted Book carries source values; the creator's values become overrides" in the AD and the rest in Deferred. Add a slice next to D5.

### R2 (High) — Effective values belong to the viewer, and the shelf module is a second visibility implementation

- **Input requires.** FR-27: overrides are visible only to the user who made them, everywhere the Book appears for that user. FR-43 and the Visibility table: a friend sees that an owned copy exists, never its location, notes, loans, overrides or tags. FR-41: share links show shared or approved data only. Visibility preamble: every read is authorised per object "including search, filter and count results". Build Order Phase 2: "Visibility enforced and tested".
- **Spine says.** AD-6: "Effective value is override if set, otherwise shared." AD-7: `COALESCE(override, shared)`, "scopes by the passed user". Capability map, F8: "Enters through access helpers."
- **Problem.** Neither AD says whose override. In Phase 1 owner and viewer are the same person, so the obvious join (`user_books.owner = copies.owner`) passes every test. In Phase 2 that join shows the friend's overrides to the viewer, which the Visibility table forbids, and fixing it means touching every shelf query. Separately, AD-7 bypasses access functions by design, so the F8 claim is only half true: friend visibility will have to be written twice, once in `src/access` and once in shelf SQL, and nothing in the spine tells the builder that.
- **Smallest fix.** AD-6, add: "The override row is always the viewer's: `user-books` is joined on the requesting user, never on the owner of the copy or entry. A viewer with no row, or no user, gets shared values." AD-7, add: "Every shelf query is built on one `visibleCopies(viewer)` fragment. It is the only place in the module that decides which copies, and which copy columns, a viewer may see. Today it is `owner = viewer`." Capability map F8: "Enters through access helpers and `visibleCopies`." Tests convention: the two-user access test also runs against the shelf module.

### R3 (Medium to High) — `users` and `media` have no access rule, and the account-model clauses are dropped

- **Input requires.** FR-3: the account model must allow OAuth and open registration later without migrating existing users. FR-52: it must allow email later for invites, resets, verification and notifications. FR-6: email can change. FR-7: users see and end their sessions. FR-44: deactivation takes effect on the next request. FR-42 and the Visibility table: email is never shown to users who are not friends; profiles are visible to other users only when public. Visibility preamble: uploaded files are authorised per object. Addendum, Auth: "Keep the account model compatible with adding an OAuth provider, self-registration and email delivery later."
- **Spine says.** `users` appears in the Roles convention and as the target of `ownerField()`. `media` appears in AD-14. Neither is in the AD-1 or AD-4 list. OAuth and email appear only in the last Deferred line as "out of v1". FR-6 and FR-7 are not mentioned anywhere.
- **Problem.** A Payload collection with no explicit access functions is readable by any signed-in user. For `users` that exposes every email and profile through the gateway and through REST the day a second account exists. The current `src/collections/Media.ts` has `read: () => true`. Slices A4 and B4 must ship an access test, and the ADs they cite (AD-2, AD-14) give them no rule to test. The door-open clauses cost nothing today, but only if nobody keys data on email, adds a second user collection, or turns off sessions, and the spine does not say so.
- **Smallest fix.** Two convention rows.
  - **Access defaults:** "Every collection declares create, read, update and delete explicitly; Payload defaults are never relied on. `users`: read and update self, admin all; create and delete admin only. `media`: read for any signed-in user while every cover comes from a source; create only through `src/lib/catalogue`; files are served only through Payload's access-checked route, never as static files."
  - **Accounts:** "`users` is the only auth collection. It uses Payload's local strategy with server-side sessions left on (`useSessions`). Users are referenced by id only; email is a mutable attribute. A later OAuth strategy, email adapter, verification or open registration is added to this collection."
  - Add FR-6 and FR-7 to the Deferred line that already lists FR-8, FR-9 and FR-49.

### R4 (Medium) — Nothing stops a service from searching the shared catalogue

- **Input requires.** Glossary: "Users never browse the shared catalogue as a whole." FR-20: search covers the user's collection, friends' open collections and the external sources, "but never the rest of the shared catalogue". Visibility table, shared Book for another user: "only when they meet it through lookup or a friend".
- **Spine says.** AD-4: read access for users is `visibility = shared OR createdBy = current user`, which is every shared Book. AD-7 routes queries over "a user's copies" through shelf, and says nothing about queries that are not rooted in copies. AD-7, AD-9 and AD-10 list FR-20 under Binds, but none states this rule.
- **Problem.** The access rule is wider than the Visibility table, which is workable only if no code path lists `books`. The obvious optimisation for title search in shop check is to query `books` before calling Finna, and nothing in the spine says not to.
- **Smallest fix.** AD-7, add: "No service lists or searches `books`, `authors` or `series` on their own. They are reached only through a copy or wishlist entry the viewer can see, or by exact ISBN-13 in lookup." Note in AD-4 that the read rule is deliberately wider than the Visibility table and that this sentence is what closes the gap.

### R5 (Medium) — Author and series matching can attach a private record to a shared Book

- **Input requires.** FR-17: authors and series are matched "to existing shared records" by name; those created from a private Book stay private with it.
- **Spine says.** AD-5: find-or-create "author and series by case-insensitive name among records the user can read". That set includes the user's own private authors and series.
- **Problem.** A shared Book created from Finna can end up pointing at the saving user's private author. Other users then cannot read the Book's author, and the private record is exposed by reference. The spine also does not say what visibility an author gets when it exists only because of an override (the user changed the author on the review screen of a shared Book). By AD-5's own principle it must be private.
- **Smallest fix.** Replace the clause in AD-5 with: "For a shared Book, authors and series are matched among shared records only and created shared. For a private Book or an override, they are matched among shared records, then the user's own private ones, and created private. A shared Book never references a private record."

### R6 (Medium) — Four F2 constraints are bound but have no rule text

All are Phase 1.

| Input | Spine | Smallest fix |
| --- | --- | --- |
| CLAUDE.md: "Finna before Google, never the reverse." FR-11 and the addendum repeat the order. | AD-9 says "an ordered array" and never names the order. Only the diagram label mentions the two sources. | AD-9: "The array order is Finna, then Google Books." |
| FR-19 and CLAUDE.md: only the admin re-fetches a shared Book; a re-fetch fills empty fields and never overwrites. | AD-5 lists FR-19 under Binds. The rule has no re-fetch clause, and no slice covers it. | AD-5: "Re-fetch is an admin-only function in `src/lib/catalogue`. It fills empty shared fields only and never touches `user-books`." |
| FR-18: the raw response is never shown to other users. | AD-9 stores `rawMetadata`; nothing restricts reading it. A `books` read through the gateway returns it. | AD-9: "`rawMetadata` has admin-only field read access and is not part of `EffectiveBook`." |
| FR-11: any debug lookup endpoint is admin-only. | Not mentioned. AD-10 covers the frontend only. | Convention row or AD-10 clause: "No custom Payload endpoints. If a debug endpoint is added it is admin-only." |

### R7 (Low to Medium) — The Deferred claim about export and deletion is inaccurate

- **Input requires.** Account lifecycle: deletion removes copies, People, loans, wishlists, overrides, tags, ratings, **private Books, unapproved covers and pending suggestions**; shared Books stay "with no link to the user". NFR-8 extends this to export.
- **Spine says.** Deferred: "AD-1 makes them a walk over `owner`."
- **Problem.** Private Books, authors and series carry `createdBy` (AD-4), not `owner`, and `media` carries neither. A builder who trusts the sentence leaves private Books behind. The "no link to the user" half is satisfied, because AD-4 clears `createdBy` on promotion.
- **Smallest fix.** Reword: "a walk over `owner` on the AD-1 collections and `createdBy` on the AD-4 collections". When uploads arrive (FR-47), `media` gets the AD-4 fields.

### R8 (Low to Medium) — NFR-6's access clause is missing from the deployment seed

- **Input requires.** NFR-6: backups contain private data, "so only the operator can access them". NFR-8: data is erased on request.
- **Spine says.** Nightly `pg_dump` and a media copy to the NAS, one rehearsed restore. No word on who can read the NAS share or how long dumps are kept.
- **Smallest fix.** Extend the backup bullet: "Dump and media backup paths are readable by the operator account only. Dumps are kept N days", so that erased data ages out.

### R9 (Low to Medium) — Unauthenticated pages have no locale and no place in AD-2

- **Input requires.** FR-51: the interface is in English and Finnish. FR-1: every page requires sign-in "except shared wishlist links".
- **Spine says.** AD-15: "The locale is the signed-in user's profile language." AD-2: "Pages and server actions start with `requireUser()`." Deferred: share links "follow AD-1, AD-2 and AD-4".
- **Problem.** The sign-in page (slice A10, Phase 1) has no signed-in user, so its locale is undefined. Later, invite, reset and share-link pages have the same problem, and share-link pages cannot follow AD-2 as written because they have no user to pass to the gateway.
- **Smallest fix.** AD-15: "Pages without a signed-in user use `Accept-Language`, falling back to `en`." AD-2: "except the sign-in page". Deferred, share links: "the only unauthenticated data route; it gets its own entry in the AD-3 allowlist".

### R10 (Low) — The moderator door is open in the data, not in the code

- **Input requires.** FR-48: "Roles must allow a moderator role later with a subset of these rights." Open Question 1.
- **Spine says.** `users.roles` holds `admin` and/or `user`. A third value fits. Nothing says how access functions test roles.
- **Smallest fix.** Roles row, add: "Access functions test roles only through named helpers in `src/access` (for example `canEditShared`, `canManageAccounts`), never `roles.includes('admin')` inline." A moderator then changes helpers, not collections.

### R11 (Low) — NFR-7 is applied to shelf search only

- **Input requires.** NFR-7: case is ignored; å, ä and ö are letters of their own. FR-17: name matching ignores case.
- **Spine says.** AD-7 covers shelf search and sort. AD-5's "case-insensitive name" matching and personal-tag matching have no comparison rule.
- **Problem.** A matcher written in JavaScript with a base-sensitivity compare, or with `unaccent`, merges "Åke" into "Ake". Source text that arrives in decomposed Unicode would also fail to match precomposed input in both search and find-or-create. The second point is not verified against Finna output; it is cheap insurance.
- **Smallest fix.** Convention row, **Text comparison:** "Names are compared in the database with `lower()` equality under the default collation. No accent folding anywhere. Text from sources and from input is trimmed and normalised to NFC at the adapter or action boundary."

### R12 (Low) — Editing a private Book after creation is unspecified

- **Input requires.** FR-14: for a private Book, the creator's values are the Book's values. FR-26: inline editing on the detail page.
- **Spine says.** AD-4 gives a read rule for private records and no update or delete rule. AD-6 says edits are overrides. Slice E9 is "inline editing of Book fields as overrides".
- **Problem.** For a private Book one story could write the Book and another an override.
- **Smallest fix.** AD-4: "The creator may update and delete their own private records. Editing a private Book writes the Book; overrides apply to shared Books only." Or the reverse, as long as it is stated.

### R13 (Low) — Bookkeeping

- **Genres.** The PRD defines Genre as "a shared, curated classification", and slice B3 makes it admin-managed. AD-4 gives `genres` a private variant that nothing creates. Either drop `genres` from the private half of AD-4 or say when a private genre exists.
- **Deferred list.** Add Open Question 5 (undoing merges, owner Mika, before Phase 3) and in-app notifications (FR-52). Both are absent.
- **Merge and ratings.** FR-46 assumes the most recent rating wins in a merge. `user-books` has no rating timestamp, and `updatedAt` moves on any override or tag edit. Either note in Deferred that `updatedAt` is the accepted approximation, or add `ratedAt` in slice B5.
- **Entity seed.** The diagram omits `users.defaultLocation` (FR-4, addendum "Home location"). Slice F1 has it. Add `USERS }o--o| LOCATIONS : "default"`.
- **FR-4 visibility fields.** Profile visibility and collection visibility are in FR-4, which is Phase 1, but slices A4 and K5 leave them out. This is consistent with CLAUDE.md ("no abstractions for later") and with adding a defaulted column later. Say so in Deferred, so it reads as a decision.
- **Design intent.** CLAUDE.md: "calm, bookish, dense enough for a large collection." The spine defers visual design to UX documents that do not exist yet. Quote the phrase in that Deferred line. The density half has one architectural consequence: add "shelf queries are always paginated" to AD-7, or list screens will diverge on paging at 10,000 copies.

## Checked and consistent

- **Stack and deployment.** Payload 3.88 on Next.js 16, Postgres 16, `@zxing/browser`, one LXC, Docker Compose, `tailscale serve`, NAS bind mounts, nightly `pg_dump`, no Kubernetes: all match CLAUDE.md. GitHub Actions, GHCR, next-intl, Vitest and Playwright are additions, not conflicts.
- **Open Questions 2, 3, 4.** Deferred, decided in AD-9 (merge, code array), decided in AD-6 (override layer).
- **AD-10 against CLAUDE.md.** CLAUDE.md allows a client REST call for scanner lookup; the spine uses a server action instead. Stricter and compatible, and it serves FR-49.
- **FR-48.** AD-1 denies the admin role on every private collection the PRD lists, plus `locations`. AD-3 keeps system privileges to three places.
- **FR-28, FR-29, FR-35, addendum "Loaned".** AD-8 matches.
- **FR-11 read-only lookup, per-user rate limit, pluggable sources.** AD-9 matches.
- **FR-14, FR-15.** AD-5 and AD-11 match, including Undo removing unreferenced Books, authors and series.
- **FR-44.** The Caching convention (no cross-request caching of user-derived data) and Payload sessions make "next request" revocation achievable.
- **FR-50 with "No service worker".** A manifest alone is enough to install on iOS and on current Chrome for Android. Verify on a device in slice K1.
- **NFR-1 to NFR-4, NFR-7 for shelf.** AD-7, AD-9, AD-12 and the ICU `fi-FI` database locale cover them; tuning and indexing are properly deferred.
- **NFR-5.** Phase 2 only; deferred with the right trigger ("before public exposure").
- **Build Order.** The capability map and `STORY-SLICING.md` cover every Phase 1 line. Phases 2 and 3 are not built. The two Phase 1 items with no slice are FR-12 auto-share (R1) and FR-19 re-fetch (R6).
- **CLAUDE.md conventions.** Strict TS, one file per collection, `src/lib/metadata` layout, one styling approach, conventional commits per story, read the Next.js and Payload docs first: all present.

## Coverage ledger

| Item | Phase | Result |
| --- | --- | --- |
| FR-1 | 1 | Landed; share-link exception R9 |
| FR-2, FR-5 | 2 | Deferred, fine |
| FR-3, FR-52 | door-open | R3 |
| FR-4 | 1 | Landed in slices; R13 |
| FR-6, FR-7 | 2 | Not mentioned; R3 |
| FR-8, FR-9, Account lifecycle | 2 | Deferred; R7 |
| FR-10 | 1 | Landed |
| FR-11 | 1 | Landed; order and debug endpoint R6 |
| FR-12 | 1 | R1 |
| FR-13 to FR-16 | 1 | Landed |
| FR-17 | 1 | R5; genres R13 |
| FR-18, FR-19 | 1 | R6 |
| FR-20 | 1 | R4; friend part R2 |
| FR-21 to FR-26 | 1 | Landed |
| FR-27 | 1 | R2, R12 |
| FR-28 to FR-39 | 1 | Landed |
| FR-40, FR-41 | 3 | Deferred; R2, R9 |
| FR-42 to FR-44 | 2 | Deferred; R2, R3 |
| FR-45 to FR-47 | 3 | Deferred; R13 (ratings) |
| FR-48 | door-open | Landed; moderator R10 |
| FR-49 | 2 | Deferred, fine |
| FR-50 | 1 | Landed |
| FR-51 | 1 | Landed; R9 |
| Visibility table | 1 to 3 | R2, R3, R4 |
| NFR-1 to NFR-5 | — | Landed or properly deferred |
| NFR-6 | 1 | R8 |
| NFR-7 | 1 | Landed for shelf; R11 |
| NFR-8 | 2 | R7, R8 |
| Open Questions 1 to 5 | — | 2, 3, 4 handled; 1 in R10; 5 in R13 |
| Addendum | — | Landed; R3 (Auth), R13 (default location) |
| CLAUDE.md | — | Landed; R6 (source order), R13 (design intent) |
