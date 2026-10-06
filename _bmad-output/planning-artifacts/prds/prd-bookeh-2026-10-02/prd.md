---
title: Bookie PRD
status: final
created: 2026-10-02
updated: 2026-10-06
---

# Bookie — Product Requirements Document

## Vision

Bookie is a self-hosted catalogue of physical books. It is built first for one collector of mostly Finnish books spread across several homes. From the phone, it answers three questions in seconds: *do I already have this?*, *where is it?* and *who has it?* That stops duplicate purchases and lost loans.

In the interface the product is called **bookeh**. How each screen looks and behaves is specified in the UX documents ([EXPERIENCE.md](../../ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md), [DESIGN.md](../../ux-designs/ux-bookeh-2026-10-03/DESIGN.md)); this document says what the product does.

It is built for one user but designed to grow. Later, friends and family can get their own accounts by invitation. Each user has a private collection, which they can open to friends. Facts about books (editions, authors, series, genres) are shared between accounts, so a book is catalogued once. Everything personal stays with each user: copies, edits, tags, locations, loans and wishlists.

If it works, Bookie spreads from one collector to family and friends, and possibly beyond. It is not expected to reach hundreds of users, but it must not fall apart if it does. It becomes where those users decide what to read, buy or give next, with AI recommendations built on each user's own catalogue and ratings.

### Key decisions and their cost

- **The multi-user data model is in v1, not a later addition.** The alternatives were a single-user v1 with a schema that allows more users later, or sharing within one household only. Multi-user was chosen so the data model doesn't need rebuilding later. It costs:
  - a rework of the collections already committed
  - real account security once the app is on the public internet (Phase 2)
  - a longer road to the second user

  Phasing (see Build Order) keeps the first useful shop check early.
- **Private first, public kept open.** v1 is Phase 1: a fully working collection for Mika alone, on the tailnet. Only Phase 1 is committed. Going public, so relatives can use the app and open shared wishlist links, stays possible (Phases 2–3). No v1 decision may rule it out.
- **Tokens before email.** Invites and password resets use single-use links the admin hands over by hand. Email delivery can come later without changing the account model.
- **Shared facts, private everything else.** One record per edition avoids duplicate data. Nothing in the shared layer may reveal what a particular user owns, wants or wrote (see Visibility).

## Glossary

- **Book.** One edition, identified by ISBN-13 when it has one. The paperback and hardcover of the same work are different Books. A Book holds the shared metadata and the raw source response.
- **Shared catalogue.** All shared Books. A Book becomes shared when it is created from an external source, or when the admin approves it (FR-46). Users never browse the shared catalogue as a whole (FR-20).
- **Private Book.** A Book created by manual entry with no external source match. It is visible only to its creator, and to the creator's friends when it appears in an open collection (FR-12).
- **Copy.** One physical book owned by one user. A copy has a status (**ordered** or **owned**), an optional location, loans and notes.
- **Wishlist entry.** A Book on one of a user's named wishlists, optionally *for* a Person. It is not a copy.
- **Override.** A user's own edit to a Book field. It is visible only to that user.
- **Location.** A user's private place name (Helsinki, Cottage, …). The **default location** is the profile setting that new owned copies get.
- **Person.** An entry in a user's private People list (a borrower or gift recipient). A Person is not a user account.
- **Friend.** Another user, with mutual consent.
- **Open or closed collection.** Whether friends can see the user's owned copies.
- **Public or hidden profile.** Whether other users can find the user by name.
- **Genre.** A shared, curated classification.
- **Personal tag.** A user's private label.

## User Journeys

### UJ-1: Shop check — "Do I already have this?"

Mika is in a bookshop holding a Finnish novel, and isn't sure whether it's already on a shelf in Tampere.

1. He opens Bookie from his phone's home screen (installed PWA). It opens in his collection, so he can also browse when a friend asks "do you have…?". A **Scan book** button is always within thumb reach.
2. He taps **Scan book** and points the camera at the barcode. If there's no barcode, he searches by title or author.
3. The answer screen shows the book's basic details (cover, title, author, edition) and every fact that applies. The first one is the heading and the rest are listed under the book:
   - **In library · Tampere**
   - **In Partner's library**, for friends with an open collection
   - **Ordered**
   - **Wishlist**
4. If none apply, he sees the fetched details and three actions: **Add to wishlist**, **Add to library** or **Back**. Add to library adds an owned copy at his default location, so there's no rescan at home. (Ordered is for online purchases; they are marked Received when they arrive.)
5. If no source has the book, he types the title and author and adds it to a wishlist or to the library. He can fill in the other details later.
6. He puts the phone away. From tapping Scan to seeing the answer takes a few seconds.

### UJ-2: Cataloguing — "Getting the collection in"

Mika is working through a stack of books at home. His default location is Tampere.

1. He taps **Scan book** and scans the first barcode.
2. The answer screen shows the fetched book. It names the source the data came from (Finna, Google Books or another source) and says whether an author or series will be created.
3. He taps **Add to library**. The copy is saved as fetched at his default location, a toast confirms it with **Edit** and **Undo**, and the scanner is ready for the next book. A failure also shows as a toast.
4. He mostly trusts the fetched data. When something is missing, such as a series index or a personal tag, he taps **Edit** on the toast and adds it on the edit screen. The same screen is where he would change the location or mark the copy as ordered.
5. If he already owns a copy of this edition, the answer says **In library** and lists his copies, and he can still add another copy.
6. Later, when he takes a box of books to the cottage, he selects those copies and changes their location in one go. The same selection can be tagged, marked read or removed.

### UJ-3: Partner joins

1. Mika creates an invite link and sends it to his partner in a chat message.
2. She opens the invite link, sets a password and fills in her profile: display name, language, optional default location, whether her profile is public or hidden, and whether her collection is open or closed.
3. She starts her collection by picking books from Mika's open collection and scanning the rest.
4. She sends Mika a friend request using his email address, and he accepts. Each can now browse the other's open collection, and Mika's shop checks show "In Partner's library".
5. Before Christmas, Mika shares his "Christmas" wishlist with relatives as a link. His other lists stay private.

## Features and Functional Requirements

### F1 — Accounts and access

- **FR-1** Users sign in with email and password. Every page requires a signed-in user, except shared wishlist links (FR-41).
- **FR-2** The admin creates an invite as a single-use link that expires after 7 days [ASSUMPTION], and hands it over by hand (message, chat). The invitee sets their email, password and profile. No email is sent.
- **FR-3** There is no self-registration in v1. The account model must allow adding an external sign-in provider (OAuth) and open registration later without migrating existing users.
- **FR-4** The profile holds display name, email, interface language (FR-51), optional default location (F5), profile visibility and collection visibility (F8).
- **FR-5** A user who forgets their password gets a reset link from the admin. The link is single-use, expiring and rate-limited. Self-service reset by email comes with email delivery (FR-52).
- **FR-6** Users can change their email address. Verifying the new address by email comes with email delivery (FR-52).
- **FR-7** Users can see their active sessions and sign out of any of them, or all of them at once.
- **FR-8** Users can export all their own data (copies, overrides, tags, People, loans, wishlists, ratings) in a portable format.
- **FR-9** Users can delete their account, and the admin can deactivate or delete any account. See [Account lifecycle](#account-lifecycle).

### F2 — Adding a book

- **FR-10** Users scan an ISBN barcode with the phone camera inside the installed app, including on iOS Safari. They can type an ISBN instead. ISBN-10, ISBN-13, hyphens and spaces are accepted and normalised to ISBN-13.
- **FR-11** Lookup reuses an existing shared Book for the ISBN if there is one. Otherwise it tries the metadata sources in configured order: Finna, then Google Books, then any others. Adding a source requires no change to the add-book flow.
  - Lookup is read-only: a Book is created only when a copy or wishlist entry is saved.
  - Lookup requires sign-in and is rate-limited per user.
  - Any debug lookup endpoint is admin-only.
- **FR-12** If no source finds the book, the user enters it by hand before saving, with title and author as the only required fields. The result is a **private Book**. It becomes shared only through admin approval (FR-46), or automatically when a later external lookup matches its ISBN [ASSUMPTION]. Books without an ISBN are never merged automatically; only the admin merges them (FR-46).
- **FR-13** A book is saved as fetched and edited afterwards; there is no review step before the save.
  - The answer shown after a scan or lookup has a cover preview, names the original source (Finna, Google Books, …), never another user, and says whether each author and series is new or already exists.
  - The edit screen pre-fills every field and lets the user edit all of them, along with the user's personal tags. It is reached from the save toast and from the book's detail.
  - Opened from the save toast, the edit screen also shows the new copy's status (owned or ordered) and its location, set to the default location.
- **FR-14** Who gets the edits:
  - A shared Book keeps the source's values, and a user's edits are stored as their overrides [ASSUMPTION].
  - On a private Book, the creator's values are the Book's values.
- **FR-15** Saving shows a toast with **Edit** and **Undo** and returns to the scanner. Undo removes the copy or wishlist entry, plus any Book, author or series that nothing else references. Undo is also offered after a move, a tag change, marking read, lending, Returned, Received, and marking a wishlist entry bought or ordered. Removals are confirmed first and have no Undo. A failed save shows an error toast and leaves the screen as it was.
- **FR-16** If the user already owns a copy of the same edition, the answer says so and lists the copies, but still allows adding another copy.
- **FR-17** Authors and series are matched to existing shared records by name, ignoring case, and created if missing. Those created from a private Book stay private along with it. Genres come from source subjects and are matched to the curated genre list. Personal tags are matched within the user's own tags, and the user can rename, merge and delete them.
- **FR-18** The raw source response is stored with the Book, so the parser can be improved and re-run later. It is never shown to other users.
- **FR-19** Only the admin can re-fetch metadata for a shared Book. A re-fetch fills empty fields only and never overwrites existing values.

### F3 — Shop check

- **FR-20** Users scan a barcode or search by title, author or ISBN. Search covers the user's own collection, friends' open collections and the external sources, but never the rest of the shared catalogue. The result shows the book's basic details and every fact that applies, the first as its heading:
  - **In library · <location>** (the location only if the user tracks one)
  - **In <friend>'s library**, for friends whose collection is open and who own a copy
  - **Ordered**, for the user's own ordered copy
  - **Wishlist**, when the Book is on any of the user's wishlists
- **FR-21** For a book the user doesn't own, the result offers **Add to wishlist** (pick a list) and **Add to library** (owned copy at the default location), with no rescan. The same two actions serve shop checks and cataloguing.
- **FR-22** If no source finds the ISBN, the user enters title and author and can still add the book to a wishlist or to the library (FR-12).

### F4 — My collection

- **FR-23** The app opens in the user's collection; there is no separate home screen. A **Scan book** button is within reach on every section.
- **FR-24** Users search their collection by title, author, series or ISBN, or by free text across those fields and notes.
- **FR-25** Users filter and sort their collection by any metadata field. Filters combine with AND. Fields include:
  - author, series, genre and personal tag
  - publisher, year, language and page count (as a range)
  - status, location, read and rating

  Filters and sorting use the user's overrides where they exist. On an opened Book, its author, series, genres, tags and location are shortcuts that add that value to the active filters.
- **FR-26** Book detail shows the user's copies, wishlist entries, loans, read flag, rating, notes and personal tags. Read, rating, notes and tags are changed in place; the Book's own fields are changed on the edit screen (FR-13).
- **FR-27** Overrides are visible only to the user who made them, everywhere the Book appears for that user. To change a shared value, the user suggests a fix (FR-45).
- **FR-28** Status on a copy is **ordered** or **owned**.
  - Users set **Ordered** on the edit screen right after adding a book, or from a wishlist entry, for example after buying online.
  - **Received** turns an ordered copy into an owned one, defaulting to the default location.
  - Marking a wishlist entry bought or ordered closes the entry. If the entry is for the user, it creates a copy. If it's for another Person, it closes the entry without creating a copy [ASSUMPTION].
- **FR-29** Each user can mark a Book as read and give it an optional 1–5 rating. Read and rating belong to the user and the Book, not to a copy.
- **FR-30** A user can own several copies of the same edition. Users can add a Book they see in a friend's open collection to their own collection or wishlist without scanning.

### F5 — Locations

- **FR-31** Each user keeps a private list of locations and can add new ones inline. Locations can be renamed, merged and deleted.
- **FR-32** Locations are optional. A user with no locations sees no location fields.
- **FR-33** Users can select several copies and, in one action, change their location, add or remove a tag, mark them read or unread, or remove them. Removing asks for confirmation.

### F6 — People and loans

- **FR-34** Each user keeps a private People list (borrowers, gift recipients). People are not user accounts. People can be renamed and merged; a Person with loans or wishlist entries cannot be deleted.
- **FR-35** Users lend an owned copy to a Person, with a lending date. A copy has at most one open loan, and it keeps its location while lent out.
- **FR-36** **Returned** closes the loan. Loan history is kept.
- **FR-37** A loans view lists what is out, with whom, and since when, ordered by person or by date, with returned loans below. Search results and Book detail show who has a lent copy.

### F7 — Wishlists

- **FR-38** Users can have several named wishlists (e.g. "Me", "Christmas"). An entry can be marked as *for* a Person; empty means it's for the user. The recipient is set on the entry, at any time after it is added.
- **FR-39** The wishlist page shows all of the user's lists with a count each; opening a list shows its entries, with each entry's recipient.
- **FR-40** Every wishlist is private by default. Users can share a single list with chosen friends in the app, or by link (FR-41). The user decides what each list contains; the app does not hide entries from viewers.
- **FR-41** A share link:
  - is read-only and needs no sign-in
  - shows each entry's title, author and cover, using shared or approved data only, plus the owner's display name
  - hides recipients unless the owner turns them on for that list
  - can be one of several links per list, each revocable on its own and optionally given an expiry date
  - stops working when it is revoked, when its list is deleted, or when the owner is deactivated or deleted

### F8 — Friends and visibility

- **FR-42** Friend requests:
  - A user sends a request by entering another user's exact email address. The response is the same whether or not an account exists, and the recipient sees the request in the app only if one does.
  - Users with a **public** profile can also be found by name. **Hidden** profiles can't be found that way.
  - The recipient accepts or declines. Either side can remove the friendship, or block the other user.
  - Requests are rate-limited. After a decline, the same pair has to wait before another request [ASSUMPTION: 30 days].
  - Email addresses are never shown to users who aren't friends.
- **FR-43** Each user sets their collection to **open** or **closed**. Friends see an open collection's **owned** copies only. Ordered copies, wishlists, locations, loans, notes, overrides and personal tags are never part of it.
- **FR-44** Every revocation takes effect on the next request. Re-establishing a relationship does not restore earlier shares. Revocations are:
  - unfriend or block
  - closing a collection
  - hiding a profile
  - revoking a link or in-app share
  - deactivating an account

### F9 — Curation

- **FR-45** Users can suggest a fix to a shared Book, author, series or genre: a corrected field, a merge of duplicates, or a cover. Suggestions are rate-limited per user and visible only to the suggester and the admin.
- **FR-46** The admin reviews suggestions in a queue and approves or rejects each one. The admin can also promote a private Book to shared, and merge Books, authors or series directly.
  - An approved fix updates the shared record. Overrides that equal the new value are dropped; other overrides are kept.
  - A merge moves every copy, wishlist entry, override, cover and loan to the surviving record. If a user rated both records, their most recent rating wins [ASSUMPTION].
- **FR-47** A user can upload a cover for a Book. Uploads must be images within a size limit, and location and other image metadata are stripped. The uploaded cover is visible only to the uploader until the admin approves it. After approval it is an alternative cover anyone can pick, and it never replaces another user's choice.

### F10 — Administration

- **FR-48** The admin role covers accounts, invites, the suggestion queue and shared records. It does not include reading users' private data: copies, People, loans, wishlists, overrides and personal tags. Roles must allow a moderator role later with a subset of these rights.
- **FR-49** The back office is reachable only over the tailnet, not from the public internet [ASSUMPTION]. Admin actions are logged.

### F11 — Platform

- **FR-50** The app installs as a PWA on iOS and Android and also works in desktop browsers.
- **FR-51** The interface is in English and Finnish, and each user picks their language. All interface text is localisable from the start, so more languages can be added without changing feature code.
- **FR-52** Email delivery is not part of v1. Invites and resets work through links (FR-2, FR-5) and notifications appear in the app. The account model must allow adding email later for invites, resets, verification and notifications.

## Visibility

Who can see what. Every read and write is authorised per object on the server, including uploaded files and search, filter and count results. These rules become acceptance tests.

| Object | Owner | Friend (open collection) | Friend (closed) | Other user | Share-link viewer | Admin |
|---|---|---|---|---|---|---|
| Shared Book, author, series, genre | yes | yes | yes | only when they meet it through lookup or a friend | entry fields only (FR-41) | yes, can edit |
| Private Book | yes | when it is an owned copy in the collection | no | no | entry fields only | yes, to approve or merge |
| Owned copy (exists) | yes | yes | no | no | no | no |
| Ordered copy | yes | no | no | no | no | no |
| Location, notes, loans, People | yes | no | no | no | no | no |
| Override, personal tag | yes | no | no | no | no | no |
| Wishlist and entries | yes | if the list is shared with them | if the list is shared with them | no | if the link is valid | no |
| Read flag, rating | yes | no [ASSUMPTION] | no | no | no | no |
| Unapproved uploaded cover | yes | no | no | no | no | yes, to review |
| Pending suggestion | own | no | no | no | no | yes |
| Profile (display name) | yes | yes | yes | public profiles only | owner's name only | yes |
| Email address | yes | yes | yes | no | no | yes |

## Account lifecycle

| | Deactivate (admin, reversible) | Delete (user or admin, permanent) |
|---|---|---|
| Sign-in and sessions | blocked; sessions ended | removed |
| Share links and in-app shares | stop working | removed |
| Friendships and friend chips | hidden from everyone | removed |
| Private data (copies, People, loans, wishlists, overrides, tags, ratings, private Books, unapproved covers, pending suggestions) | kept | deleted |
| Shared Books, authors, series, approved covers | unchanged | kept, with no link to the user |

## Build Order

This replaces the M1–M5 milestones in CLAUDE.md. **Only Phase 1 is committed.** Phases 2 and 3 are possible next steps, kept open but not planned. The multi-user data model (Glossary) is built in Phase 1, so later phases, if they happen, add features without migrating data.

**Phase 1 (v1): Mika's catalogue, on the tailnet only**
- The data model, and sign-in for a single seeded user (FR-1, FR-4)
- Adding books (F2)
- Shop check against his own collection and the external sources (F3)
- His collection (F4, except the friend part of FR-30)
- Locations and loans (F5, F6)
- Private wishlists (FR-38, FR-39)
- PWA, localisation and backups (FR-50, FR-51, NFR-6)

Search is on the phone in this phase, because checks in webshops depend on it. Done when the Phase 1 success metrics are met.

**Phase 2 (possible): Public internet, Partner joins**
- Public ingress with the security NFRs, and the back office kept on the tailnet (FR-49, NFR-5)
- Account lifecycle with token invites and resets (FR-2, FR-5 to FR-9)
- Admin role scope (FR-48)
- Friends and open collections, including friend chips and the friend part of FR-30 (F8)
- Visibility enforced and tested (Visibility table)

Done when Partner is using the app (Phase 2 metric).

**Phase 3 (possible): Sharing and curation**
- Sharing wishlists, in the app and by link (FR-40, FR-41)
- Curation: suggestions, merges, promotion and covers (F9)

**Later:** AI recommendations, email delivery, a moderator role, OAuth or open registration.

## Non-Functional Requirements

- **NFR-1 Shop-check speed.** From scan to result on 4G: 2 s or less when the Book is already known to the user (own collection or a friend's), and 5 s or less when it comes from an external source.
- **NFR-2 Entry speed.** Scan to save takes under 20 s per book when the fetched data needs no edits.
- **NFR-3 Search speed.** Search and filter results appear in under 1 s for a collection of 10,000 copies.
- **NFR-4 Scale.** Supports hundreds of users and about 100,000 Books without redesign.
- **NFR-5 Security.** All of the following must hold before the app is exposed to the public internet (Phase 2):
  - HTTPS only
  - rate limiting on sign-in, password reset, invites, friend requests, suggestions, metadata lookup and share-link access
  - sign-in, reset and invite responses that don't reveal whether an account exists
  - share-link tokens of at least 128 random bits
  - share-link pages served with no referrer and marked not to be indexed
  - private views not cached by the browser or service worker beyond the session
  - text and images from other users treated as untrusted when displayed
- **NFR-6 Backups.** The database and uploads are backed up nightly, and a restore has been tested at least once. Backups contain users' private data, so only the operator can access them.
- **NFR-7 Finnish text.** Sorting uses Finnish collation. Search ignores case but treats å, ä and ö as letters of their own, not accented a and o, so "a" never matches "ä".
- **NFR-8 Personal data.** Users' personal data, including data about People (who are third parties), can be exported and erased on request (FR-8, FR-9). This keeps the instance in line with basic GDPR requirements.

## Success Metrics

**Phase 1**
- **Collection in:** all ~200 of Mika's books catalogued, with locations set.
- **No duplicate purchases:** none after cataloguing.
- **"Where is it?":** answered in under 10 s from the phone.
- **Shop check:** answered within NFR-1.
- **Adding a book:** under 20 s per book.

**Phase 2 (if it happens)**
- **Partner is in:** Partner catalogues her collection within a month of being invited, picking at least half of the overlap from Mika's collection rather than scanning it.
- **The household check works:** shop checks show friend chips, and no duplicate is bought across the household.

**Counter-metric:** if more than one book in ten needs a manual correction or a suggestion after saving, the shared data is costing more than it saves.

## Scope

**Out of v1:**
- AI recommendations (Later, see Vision and Build Order)
- bulk ISBN import (dropped: about 200 books scan in an hour)
- offline use
- order details such as shop and due date (the status is enough)
- view tracking (cataloguing and editing would distort it; ratings are the signal)
- selling or valuing books
- email delivery (FR-52 keeps the door open)
- open self-registration and OAuth (FR-3 keeps the door open)
- committing to Phases 2 and 3 (see Build Order)
- moderator role (FR-48 keeps the door open)
- per-copy or per-friend visibility within an open collection

## Assumptions Index

Drafter decisions Mika accepted without changes. They stay tagged so downstream readers know they weren't his own specifications.

| Ref | Assumption |
|---|---|
| FR-2 | Invite links expire after 7 days. |
| FR-12 | A private Book becomes shared on its own when a later external lookup matches its ISBN. |
| FR-14 | A user's edits on a shared Book become their overrides, not shared values. |
| FR-28 | Buying a wishlist entry meant for another Person closes the entry without creating a copy. |
| FR-42 | 30-day wait after a declined friend request. |
| FR-46 | In a merge, the user's most recent rating wins. |
| FR-49 | The back office is tailnet-only rather than public with MFA. |
| Visibility | Friends don't see each other's read flags and ratings. |

Also accepted without changes earlier: FR-9 (admin deactivation), FR-32, FR-33, FR-42 (mutual friendship), FR-43, and the NFR-1, NFR-3 and NFR-4 targets.

## Open Questions

1. **Moderator role.** Not in v1. When does it become worth adding, and which admin rights does it get? Owner: Mika, when users grow.
2. **Public ingress.** Tailscale Funnel, Cloudflare Tunnel or a reverse proxy? Owner: architecture, only if Phase 2 goes ahead.
3. **Combining sources.** Does lookup stop at the first source that finds the book, or merge several results to fill gaps? How are sources registered? Owner: architecture.
4. **Override mechanism.** An override layer on top of the shared record, or copy-on-write? Owner: architecture.
5. **Undoing merges.** Should an approved merge be reversible? Owner: Mika, before Phase 3.
6. **Change password.** Not in Phase 1; the admin resets passwords by token link (FR-5). Decided by Mika on 2026-10-06. Comes with the account lifecycle in Phase 2.
