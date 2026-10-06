---
title: Bookie PRD — adversarial privacy and sharing review
reviewed: prd.md (draft, 2026-10-02), addendum.md (2026-10-03)
date: 2026-10-03
lens: hostile reviewer, multi-user privacy, sharing model, public-internet abuse
---

# Adversarial review: privacy and sharing model

## Verdict

Not safe to hand to architecture as written. Several shared entities (Book, Author, Series, Tag, alternative covers) leak what other users own, wishlist or type, by design. Friend visibility contradicts wishlist privacy. The PRD also never says what the admin, who is also a family member using the app, can see of other users' private data. There is no visibility matrix, so "privacy enforced on the server" (NFR-5) cannot be tested. Most findings can be fixed in the PRD with an explicit visibility matrix, a "when is a shared record created and what does it reveal" rule, and a lifecycle section.

| Severity | Count |
|---|---|
| Critical | 5 |
| High | 11 |
| Medium | 10 |
| Low | 4 |

Threat model used: the attacker is (a) another invited user, including a curious partner or relative looking for gift spoilers, (b) an ex-friend after unfriending, (c) an anonymous internet visitor holding or guessing a share link, (d) a compromised or malicious invited account, (e) the admin acting as an ordinary family member.

---

## Critical

### C1. Shared catalogue existence reveals other users' holdings and wishlists

- **Severity:** Critical
- **Location:** FR-8, FR-9 (source chip), FR-16 (search by title/author/ISBN), FR-18, FR-28; UJ-2 step 2 ("the shared catalogue (another user added this edition)"); UJ-3 step 3; addendum "Book: one shared record per edition".
- **Issue:** A Book exists in the shared catalogue only because some user saved it, as owned, ordered or wishlisted. With a handful of users this is an ownership oracle. Any user can:
  - scan or type an ISBN and see the "shared catalogue" source chip instead of "Finna". UJ-2 even spells out that this means another user added it.
  - browse the whole catalogue (FR-28) and diff it against the Books they can see through friends' open collections. Whatever is left belongs to closed collections or wishlists.
  - search the catalogue by title or author (FR-16) for sensitive subjects.

  Concrete spoiler: Mika wishlists a niche book on his "Partner's birthday" list. That creates a shared Book. Partner scans it in a shop, sees "shared catalogue", and knows Mika added it. Closed collections (FR-41) and private wishlists (FR-38) are defeated without any server-side bug. The vision's "possibly beyond" and later open registration (FR-3) widen the audience but don't fix this: rare Finnish editions stay at one owner.
- **Suggested fix:** Add a requirement that the existence and provenance of a shared Book are not user-observable:
  - The source chip shows the original external source (Finna, Google), never "shared catalogue / another user". Show "Manual" for user-entered records.
  - Catalogue browse (FR-28) and search return a Book only if (a) it has external-source provenance and the viewer could have fetched it from that source anyway, or (b) it is visible through the viewer's own copies or friends' open collections. Otherwise, run the lookup as if the Book did not exist and reuse the record silently on save.
  - Never expose owner counts, creator, created-at or "popular" signals.
  - State the rule as testable: "Two users with no friendship see identical lookup and catalogue results for any ISBN, whether or not the other user has it."

### C2. Shared Author, Series and Tag namespace exposes user-typed text and acts as an oracle

- **Severity:** Critical
- **Location:** FR-9 ("whether each author, series and tag is new or already exists"), FR-13; memlog decision "Authors, series and tags are shared across all users"; FR-21 (tag filters), FR-44.
- **Issue:** Tags are free text in one global namespace. Users will create personal tags: "gift for Anna", "lend to Pekka", "therapy", "ex's books", "to hide". Every other user then sees them in autocomplete, filter lists and the admin, and the "already exists" indicator confirms any guessed string: type "Anna's present" and the indicator answers. Authors and series from manual entry (FR-10) leak in the same way, and so do typos and junk. Only the admin can correct shared records (FR-44/45), and FR-23 per-user edits cover Book metadata only, so a user cannot even fix a typo'd author locally. A malicious account can also fill the namespace with offensive names that show up for everyone.
- **Suggested fix:** Split taxonomy by trust:
  - Tags are per-user (private) by default. Optionally keep a curated shared genre list maintained by the admin.
  - Authors and series created from an external source are shared. Ones created by manual entry stay private to the creator until approved through FR-44.
  - The new-vs-existing indicator only considers records the viewer can already see.
  - Say explicitly whether per-user overrides extend to author, series and tag assignments on a Book. FR-23 implies yes, but FR-13 implies the assignment is shared.

### C3. Alternative covers are unmoderated cross-user uploads

- **Severity:** Critical
- **Location:** FR-24, FR-44 ("a new cover as the default"), NFR-5 (no upload controls listed).
- **Issue:** A user's uploaded image instantly becomes "an optional alternative for everyone else", with no review. On the public internet this allows:
  - offensive or illegal images shown to every user who opens the cover picker
  - privacy leaks through phone photos of a book on the uploader's shelf, which can contain EXIF GPS (home address), faces, other book spines and room interiors
  - an ownership leak: an alternative cover on a Book shows that someone physically has it (see C1), and more so if the uploader is attributed
  - storage abuse with large or numerous files on NAS-backed storage
  - malicious files (SVG with script, polyglots) served from the app origin

  The PRD also doesn't say what happens to an alternative when its uploader deletes it, is deactivated or leaves, while other users have picked it as their cover.
- **Suggested fix:** An uploaded cover is visible only to its uploader until the admin approves it as a public alternative, through the same queue as FR-44. Strip metadata and re-encode on upload. Use a raster-only allowlist with size, dimension and per-user quota limits. Never attribute the uploader. Define what happens on delete or deactivation: approved alternatives become shared assets, and unapproved ones are deleted with the account.

### C4. "Friends see books and statuses" contradicts wishlist privacy and spoils gifts

- **Severity:** Critical
- **Location:** FR-42 vs FR-38; FR-25 (status wishlist → ordered → owned); FR-16 friend chip; UJ-3 step 5.
- **Issue:** FR-42 lets friends browse an open collection's "books and statuses". Statuses include **wishlist** and **ordered** (FR-25). So:
  - wishlisted items show up to every friend, which contradicts FR-38 ("every wishlist is private by default").
  - a gift Mika has **ordered** for Partner shows up in his open collection to Partner. That's the exact UJ-3 relationship.

  FR-42 also doesn't list which fields friends see: read flag, rating, per-user edited metadata, user's chosen cover, number of copies, date added? "In <friend>'s library" (FR-16) says "owns", but it's unclear whether a friend's ordered or wishlisted copy produces a chip.
- **Suggested fix:** Define friend visibility as owned copies only. Wishlist and ordered entries are never visible through an open collection, only through an explicit wishlist share (FR-38). List the exact fields a friend sees (proposed: shared Book metadata, owned flag, copy count, optionally read/rating behind a separate toggle) and the fields they never see (location, loans, notes, People, per-user edits, ordered, wishlist, uploaded-but-unapproved covers).

### C5. Admin access to other users' private data is undefined, and the admin is a participant

- **Severity:** Critical
- **Location:** FR-5, FR-45, NFR-5 ("enforced on the server"), CLAUDE.md "Payload admin is the back office" (raw data browser); addendum "Frontend users are distinct from admin capability".
- **Issue:** Mika is both the admin and an ordinary user, and friend and partner of the other users. A back office that lists collections exposes every user's closed collection, People, loans, notes and wishlists. That includes Partner's "Mika's birthday" list. NFR-5 privacy rules say nothing about the admin. Neither do FR-44/45: a suggestion carries the suggester's identity and the copy that prompted it. Any moderator role added later (FR-5, Open Question 1) inherits the same problem.
- **Suggested fix:** Add an explicit requirement for admin scope. The admin can manage accounts, invites and shared records (Book, Author, Series, Tag, approved covers, suggestions). The admin cannot read other users' copies, People, Locations, loans, notes, wishlists or per-user edits through any interface. Any break-glass access must be logged. Say it also applies to the back-office tooling, not only the frontend. Make it testable: "Admin account cannot list Partner's People via any UI or API."

---

## High

### H1. No visibility and access matrix, so NFR-5 can't be implemented or tested

- **Severity:** High
- **Location:** NFR-5 last bullet; FR-23, FR-38, FR-41, FR-42; F5, F6.
- **Issue:** Privacy rules are scattered across prose with words like "private", "open" and "public". There is no table of entity × viewer (self, friend with open collection, friend with closed collection, non-friend user, anonymous link holder, admin). Not covered:
  - object-level authorisation for ID-addressed resources (copies, loans, wishlists, People, media). Sequential IDs invite IDOR.
  - whether uploaded media URLs are fetchable without sign-in
  - search and filter endpoints returning other users' data through joins, such as counts and facets
- **Suggested fix:** Add a visibility matrix as an FR or appendix. Each cell should be allow, deny or a listed field subset. Add: "every read and write is authorised per object on the server, and media for private objects is not served without authorisation." Turn the matrix into acceptance tests.

### H2. Wishlist is modelled two incompatible ways

- **Severity:** High
- **Location:** FR-25 (wishlist as a copy status), FR-37 (named lists with entries and a "for" person), FR-16 ("Wishlist" chip), FR-17, addendum "Ownership or copy (per user): status (wishlist → ordered → owned)".
- **Issue:** Is a wishlist entry a copy with status=wishlist, or an entry in a named list? Both readings are in the PRD:
  - If it's a copy status, it can't be on two lists, and "Received" (FR-25) means moving a copy out of a shared list.
  - If it's a list entry, then what are "ordered" and "Received" transitions on an entry? What does the shop-check "Wishlist" chip show when the item is on "Christmas" but not "Me"?
  - Does Received remove the entry from a list that's been shared by link, and what do link viewers see?

  The privacy consequences differ: C4 status leak, H3 link contents.
- **Suggested fix:** Pick one model. Recommended: wishlist entries live in named lists and are not copies. "Ordered" is a separate per-user state, and Received creates an owned copy and closes the entry. Define what each chip and each shared view shows for each state.

### H3. Shared wishlist link: contents, leakage channels and revocation are unspecified

- **Severity:** High
- **Location:** FR-38, FR-37 ("for a person from the People list"), FR-39, FR-1, NFR-5 ("unguessable share links").
- **Issue:** This is the only unauthenticated surface, and nothing says what it renders.
  - **Data the link could leak:** each entry's recipient, which is a People name (People are private, FR-32), the owner's display name or email, per-user edited titles and private covers, entry status (ordered, received), links into authenticated Book pages, and internal IDs.
  - **Channels:** the token in the URL leaks through the Referer header to external cover hosts (Google Books image URLs) and through analytics and server logs. It also leaks through link-preview bots and search indexing.
  - **Revocation:** does revoke invalidate only that token, or can the list be re-shared with a new one? Can a list have several links (one for each relative), and can they be revoked one at a time? Do links expire? What happens to the link when the list is renamed, emptied, deleted or the owner is deactivated?
  - **Abuse:** there is no rate limit on link access, which allows enumeration, and NFR-5 gives no token entropy.
  - **In-app sharing with friends:** what happens on unfriend (see H8)?
- **Suggested fix:** Specify the link view's exact fields. Default to title, author, cover from the shared or approved source only, and an optional owner display name. Recipient is hidden unless the owner turns it on for that list. Requirements: no outbound Referer (`no-referrer`), `noindex`, ≥128-bit random token, rate limiting, and a revoke-and-regenerate action. Links die when the list is deleted or the owner is deactivated. Add an optional expiry date.

### H4. Manual-entry and ISBN-less Books in the shared catalogue

- **Severity:** High
- **Location:** FR-10, FR-17/18 (Mark bought with title + author only), UJ-1 step 5, addendum "one shared record per edition (ISBN-level)".
- **Issue:** Manual entries create shared Books from free text: personal titles, typos, junk, offensive strings, private documents ("Grandma's recipes", a self-published memoir). They inherit every C1 leak, and worse, because nobody outside the instance could have fetched them. Edition identity is defined as ISBN-level, but books with no ISBN (common for older Finnish books) have no dedupe key. So the PRD doesn't say whether two users' manual "Seitsemän veljestä" entries merge, which would link their copies, or stay apart, which leaves duplicates for FR-44 merges.
- **Suggested fix:** A manually entered Book stays private to its creator: it is a shared-schema record visible only to the creator and to friends viewing their open collection. It becomes shared only through an approved suggestion or a later external-source match on ISBN. Define edition identity for records without an ISBN as never auto-merged, with admin merges only.

### H5. Account enumeration and friend-request abuse through exact-email search

- **Severity:** High
- **Location:** FR-40, FR-4 (hidden profile), FR-1 sign-in, FR-2 invite acceptance, NFR-5.
- **Issue:**
  - Exact email search tells any signed-in user whether an address has an account, and shows the display name. That defeats the purpose of "hidden" and lets a compromised account test address lists.
  - Sign-in errors, the (unspecified) password reset and invite acceptance ("already registered") are further enumeration oracles.
  - Friend requests have no rate limit, no block, no rule on re-sending after a rejection or removal, and no say on what the recipient sees (the requester's email?). That allows harassment, for example by an ex-partner.
- **Suggested fix:** Make "send friend request to email" a blind action: the same response whether or not the account exists, and the recipient is notified only if it does. Show a search result only for public profiles found by name. Add block, a cooldown after rejection, and per-user request rate limits. Never show emails to non-friends. Sign-in, reset and invite responses must not differ by account existence.

### H6. Account lifecycle basics are missing: reset, email change, sessions, self-deletion, GDPR

- **Severity:** High
- **Location:** F1 (FR-1 to FR-5); Scope.
- **Issue:** On the public internet with third-party users, all of these are absent:
  - password reset
  - email change and its verification
  - session lifetime and "sign out everywhere" (the PWA stays signed in on phones that get lost)
  - password policy and breached-password checks
  - account deletion by the user
  - data export

  Mika becomes a data controller for his relatives' personal data under GDPR (Finland/EU). That includes People records naming third parties, loan histories and wishlists. The right to erasure and access must be possible. Leaving the instance (FR-40 only covers removing a friend) is undefined.
- **Suggested fix:** Add FRs for reset (token single-use, expiring, rate-limited, non-enumerating), email change with re-verification, session list and revoke, self-service account deletion with a defined cascade (see H7), and export of the user's own data (copies, People, loans, wishlists, edits) in a portable format.

### H7. Deactivating or deleting a user leaves their shared artefacts and shares undefined

- **Severity:** High
- **Location:** FR-5 (deactivate only), FR-24, FR-38, FR-40/41, FR-44, FR-13.
- **Issue:** Nothing says what happens to a deactivated or departed user's:
  - shared wishlist links (must stop working)
  - in-app wishlist shares
  - friendships and "In <name>'s library" chips (must vanish)
  - pending suggestions
  - uploaded covers that others have picked
  - Books, authors, series and tags they created, which leak their former holdings indefinitely (C1, C2)
  - per-user edits and ratings (needed later as input for the AI recommendations in the Vision?)
  - sessions
  - invite tokens they hold

  It also doesn't say whether deactivation can be reversed, or whether it differs from deletion.
- **Suggested fix:** Add a lifecycle table: deactivate (reversible, hidden from everyone, links and sessions dead, data retained) vs delete (irreversible). Delete removes all private data. Shared Books and approved covers stay without attribution. Private manual records, unapproved uploads, private tags and pending suggestions are deleted.

### H8. Visibility transitions are unspecified: unfriend, open→closed, public→hidden, revoke

- **Severity:** High
- **Location:** FR-38, FR-40, FR-41, FR-42, FR-16, FR-43 (PWA/service worker).
- **Issue:** For each transition the PRD should say whether access ends immediately and completely:
  - unfriend: in-app wishlist shares with that friend, chips in both directions, cached friend collection pages
  - open → closed
  - public → hidden: is the user still listed in others' recent searches or friend suggestions?
  - link revoke

  A service worker or HTTP cache on the ex-friend's phone may keep serving their old view, and "offline not required" doesn't mean nothing gets cached. Re-friending: do earlier wishlist shares come back on their own? Do outstanding friend requests survive a block?
- **Suggested fix:** One requirement: "Every revocation (unfriend, close collection, hide profile, revoke link or share, deactivate) takes effect on the next request; nothing private is cached client-side beyond the session; re-establishing a relationship does not restore previous shares." Add cache-control rules for private views as an NFR.

### H9. Lookup: when a shared Book is created, open-proxy risk, and the debug endpoint

- **Severity:** High
- **Location:** FR-8, FR-16/18 (shop check of a book not owned), FR-14, NFR-5 (lookup rate limiting), CLAUDE.md M2 story 7 (`GET /api/lookup/:isbn` for debugging).
- **Issue:**
  - The PRD doesn't say whether lookup creates a shared Book or only save does. If lookup does, every shop check of an unowned book writes to the catalogue: an "X scanned this" leak (C1), plus catalogue pollution.
  - The lookup endpoint can be used to proxy and burn quota against Finna and Google (and future sources with API keys), and to probe catalogue existence.
  - The debug endpoint from CLAUDE.md is not mentioned as authenticated.
  - Rate limits have no numbers and no per-user or per-IP scope.
- **Suggested fix:** State that lookup is read-only. A Book is created only when a copy or wishlist entry is saved. Lookup is available only to signed-in users, rate-limited per user, with results cached server-side. Any debug endpoint requires admin, or is disabled in production. Lookup responses must follow the C1 provenance rule.

### H10. Suggestion queue and merge semantics are undefined

- **Severity:** High
- **Location:** FR-44, FR-45, FR-23, FR-27, FR-26.
- **Issue:**
  - Merging two Books where users hold copies, per-user overrides, ratings and read flags on both: which override wins, and do two ratings become one?
  - What if the merge gives a user "two copies" they didn't have, or links a manual private Book (H4) to a public one?
  - A merge of authors or tags across users' private tags (C2)?
  - "Without overwriting users' own edits" (FR-45): if a user's override equals the old shared value, does it stay as an override forever, so it hides the fix?
  - Can approved merges be undone?
  - Can the suggester see other users' pending suggestions?
  - Are suggester identities kept on the record?
  - No spam limits.
  - The FR-44 cover suggestion interacts with C3.
- **Suggested fix:** Define the merge outcome per per-user artefact. Overrides that equal the pre-fix shared value are dropped on approval. Merges are reversible within N days. Suggestions are visible only to the suggester and the admin. Add per-user suggestion rate limits.

### H11. The back office is reachable from the public internet

- **Severity:** High
- **Location:** addendum Access row (public ingress replaces Tailscale), FR-5, NFR-5.
- **Issue:** The PRD moves the app to public ingress but keeps a full-power back office for curation (FR-45). Compromising the single admin password exposes every user's data (C5) and the ability to mint invites. The PRD puts no extra protection on the admin surface: no MFA, no network restriction, no audit log.
- **Suggested fix:** Require the admin surface to be reachable only over the tailnet, or protected by MFA. Log admin actions. Admin sessions are short-lived. Keep the public ingress scoped to the frontend and share-link routes.

---

## Medium

### M1. FR-15 re-fetch writes to shared records outside the curation queue

- **Severity:** Medium
- **Location:** FR-15 vs FR-23, FR-44, FR-45.
- **Issue:** "Re-fetching metadata for an existing Book fills empty fields": who can trigger it, and does it write to the shared Book or to the user's override layer? If any user can fill shared fields directly, that sidesteps FR-44/45. It also replaces FR-14 `rawMetadata` for everyone, possibly with a different source's record.
- **Suggested fix:** Re-fetch on a shared Book is an admin action, or an automatic server job. A user-triggered re-fetch fills only the user's own empty override fields. Keep raw responses by source and timestamp instead of overwriting them.

### M2. The reach of per-user edits across views is unspecified

- **Severity:** Medium
- **Location:** FR-21, FR-23, FR-24, FR-42, FR-16.
- **Issue:** When Partner browses Mika's open collection or sees a shop-check chip, does she see shared values or Mika's edits and chosen cover? Showing his edits leaks his notes and rewording, which may be personal. FR-21 filters use the user's own edits, but filtering a friend's collection is unspecified. Shared-link views (H3) have the same question.
- **Suggested fix:** State that every non-owner view (friend, link, admin) renders shared values and approved covers only. Per-user edits never leave the owner's own views.

### M3. Undo after a save that created shared records

- **Severity:** Medium
- **Location:** FR-11, FR-13, FR-24.
- **Issue:** A save can create a Book, authors, series, tags and a cover upload. Does Undo remove all of them, and what if another user attached to the new Book in the meantime? An Undo that leaves the shared records in place leaves permanent traces of a mistaken scan (C1).
- **Suggested fix:** Undo removes the copy and any shared records created by that save that nobody else references yet. Set a time limit on Undo.

### M4. Deleting a copy, and orphaned Books

- **Severity:** Medium
- **Location:** FR-27, FR-34 (loan history kept), C1.
- **Issue:** The PRD doesn't specify copy deletion. Is loan history kept or cascaded when a copy is deleted? When the last copy or wishlist entry goes, does the Book stay in the catalogue forever as a record of former holdings?
- **Suggested fix:** Specify copy deletion, including whether loan history is kept (it's private, so it's fine either way, but decide). Books with no references and no external provenance get garbage-collected. Externally sourced orphan Books may stay, since C1 neutralises them.

### M5. Open collections have no per-copy or per-friend granularity

- **Severity:** Medium
- **Location:** FR-41, FR-42.
- **Issue:** It's all or nothing: a user can't hide one sensitive book or share only with Partner and not a distant relative. Expect users to close their collection completely, which kills the "In Partner's library" value behind the duplicate-purchase metric.
- **Suggested fix:** Add a per-copy "private" flag, which stays hidden even in an open collection. Optionally add per-friend collection visibility. If you defer this, write it down as an explicit v1 decision.

### M6. "Public profile" is ambiguous

- **Severity:** Medium
- **Location:** FR-4, FR-40, FR-1, UJ-3 step 2.
- **Issue:** FR-1 makes every page sign-in only, so "public" must mean findable by name among signed-in users. The PRD doesn't say what a non-friend sees on a profile: display name, avatar, friend list, collection size, open/closed state.
- **Suggested fix:** Rename the setting to "discoverable". Define the non-friend profile card as display name only. Never show friend lists to anyone.

### M7. Security parameters are not quantified

- **Severity:** Medium
- **Location:** NFR-5, FR-2.
- **Issue:** "Rate limiting", "expires", "unguessable" have no numbers or scope. The listed rate limits also leave out friend search and requests, share-link access, uploads, suggestions and password reset.
- **Suggested fix:** Give minimum values (for example: invite expiry 7 days, reset expiry 1 h, tokens ≥128 bits, sign-in lockout or backoff after N failures per account and per IP). List every rate-limited action with a per-user or per-IP scope.

### M8. Cross-user content must be treated as untrusted (stored XSS)

- **Severity:** Medium
- **Location:** FR-10, FR-13, FR-24, FR-44/45, FR-37 (list names in shared links).
- **Issue:** Before this PRD, all content was the owner's. Now user-authored strings reach other users and the admin: titles, author and tag names, suggestion text, list names, display names. So do uploaded files. Stored XSS in the curation queue would give an attacker admin access.
- **Suggested fix:** Add an NFR: all user-authored text and uploads are untrusted wherever another user or the admin sees them. Length limits and character validation apply to names. The admin queue gets the same treatment.

### M9. The invite model is underspecified and conflicts with the vision

- **Severity:** Medium
- **Location:** FR-2, FR-3, Vision ("spreads from one collector to family and friends"), UJ-3 step 1.
- **Issue:** Only the admin invites, so the "spreads" story can't happen without Mika acting on each request. Unspecified:
  - whether the invite is bound to the invited email or the invitee can sign up with another
  - expiry
  - whether a pending invite can be revoked
  - what happens when an invite goes to an existing account's email
  - whether the invite email carries user text (spam relay)
- **Suggested fix:** Decide whether users can invite (with a quota), or say admin-only clearly in the vision. Bind the invite to an email, make pending invites revocable, use a fixed email template, and keep responses non-enumerating (H5).

### M10. Backups contain other users' private data

- **Severity:** Medium
- **Location:** NFR-6, H6.
- **Issue:** Nightly dumps on the NAS hold every user's People, loans and wishlists. The PRD doesn't say who can read the NAS share, whether backups are encrypted or how long they're kept. Erasure requests can't reach old dumps.
- **Suggested fix:** Specify encrypted backups, a retention window and restricted NAS access. Document that erasure reaches backups when they expire.

---

## Low

### L1. `rawMetadata` exposure

- **Severity:** Low
- **Location:** FR-14.
- **Issue:** Raw responses are server-side data. They might include request URLs or API keys from future sources. The PRD doesn't say whether clients or other users can read them.
- **Suggested fix:** `rawMetadata` is admin and server only. Strip credentials before storing.

### L2. Display-name impersonation

- **Severity:** Low
- **Location:** FR-4, FR-40.
- **Issue:** Two accounts can both be "Mika". Name search and friend requests then let one pass as the other.
- **Suggested fix:** Show a disambiguator in friend requests and search results (for example, a partly masked email or the date joined).

### L3. The addendum points to an open question that doesn't exist

- **Severity:** Low
- **Location:** addendum "People: open, see the PRD's open questions"; PRD Open Questions has only the moderator question.
- **Issue:** The addendum says the People question is open, but the PRD settles it (FR-32: separate, private, unlinked).
- **Suggested fix:** Update the addendum.

### L4. "Home location" means two things

- **Severity:** Low
- **Location:** FR-33 ("keeps its home location while lent out") vs FR-4/F5 (profile home location).
- **Issue:** The same term names the copy's location and the profile default. That's ambiguous for implementation and tests.
- **Suggested fix:** Call the first one "the copy's location".
