# PRD Quality Review — Bookie PRD (prd-bookeh-2026-10-02)

## Overall verdict
The single-user core holds up well. The Vision's three questions ("do I already have this?, where is it? and who has it?"), the shop-check and cataloguing journeys, F2/F3/F6 and NFR-1/2/3/5/6 are specific, testable and clearly the owner's. The risk is that v1 has quietly turned into a multi-user social catalogue: shared Books, per-user overrides, friends, visibility, a curation queue, i18n and public-internet exposure. The PRD doesn't sequence that scope, doesn't measure it, and doesn't state the trade-off. Its privacy semantics contain at least one contradiction (FR-42 vs FR-38), and its core entities (Book / copy / edition) are defined only in the addendum. Architecture and story creation can start from the single-user flows. On the multi-user half they would have to guess.

## Decision-readiness — thin

Decisions that are recorded get stated plainly, and the addendum's deviation table ("Further CLAUDE.md deviations agreed in the PRD") is the best decision record in the package. It names what changed, what it replaced, and what architecture now owes (public HTTPS ingress). The PRD itself is different. It presents the biggest decision of the run, putting all multi-user features in v1 (memlog: "All multi-user/snowball features are in v1 scope"), as settled background in § Vision ("It is built for one user but designed to grow") and never says what it costs. Nowhere does it acknowledge that this reverses the committed data model (`7d34440`, mentioned only in the addendum), replaces Tailscale-only access with an internet-facing auth surface, adds email delivery as a dependency, and pushes the shop-check MVP behind F1/F8/F10. Someone pushing back with "this is a 2-person household with ~200 books" would find no answer in the document.

§ Open Questions has one entry (moderator role), and it is the least consequential open item. The real open decisions sit elsewhere or nowhere: People (the addendum says "People: open, see the PRD's open questions", but the PRD has no such question), first-hit vs merge across sources, override layer vs copy-on-write, public ingress choice, the email provider, and the "third fallback source TBD" recorded in the memlog. There are no `[NOTE FOR PM]` callouts at all.

### Findings
- **high** Multi-user-in-v1 trade-off not argued (§ Vision, § Scope) — The PRD records the outcome but not what was given up: Tailscale-only security posture, the committed schema, the time to first useful shop check, and CLAUDE.md's "no abstractions for later" (FR-3 and FR-5 are explicitly design-for-later). *Fix:* Add a short "Key decisions" block, or a `[NOTE FOR PM]` under § Vision, naming the choice, the alternatives (single-user v1 with a schema that allows tenants later; or household-only sharing with no friends graph), and what it costs.
- **high** Open Questions under-populated (§ Open Questions) — There is 1 listed against at least 6 real ones, and the addendum points at a People question that doesn't exist. *Fix:* Move the People, source-merge, override-strategy, ingress, email-delivery and third-source items into § Open Questions, marking which belong to architecture and which to the PM.
- **medium** Unresolved "first creator's edits" rule (FR-9, FR-23, FR-15) — When a user creates a new Book from Finna and edits fields on the review screen, it is undefined whether those edits become the shared values or a private override. FR-15's "never overwrites edits" doesn't say whose edits, or who may trigger a re-fetch of a shared record. This rule decides catalogue quality and is a product call, not an architecture detail. *Fix:* State it explicitly in F2.

## Substance over theater — adequate

There's very little furniture. There are no personas, no innovation section, and the Vision is not swappable: it names the user, the language, the multi-home problem and the three questions. NFR-5 avoids boilerplate by listing concrete controls (rate limiting on sign-in, invites and lookup; "privacy rules … enforced on the server, not only in the interface"). NFR-1/2/3 have numbers.

The theater is mild and sits at the edges. NFR-4 ("Supports hundreds of users and about 100,000 Books without redesign") can't be verified as written and echoes the Vision's "must not fall apart if it does". It reads as reassurance, not a requirement. The Vision's last sentence ("the place those users go to decide what to read, buy or give next, with AI recommendations") describes something § Scope puts out of v1, so the Vision partly describes a different product from the one being specified.

### Findings
- **medium** NFR-4 is aspirational, not testable (§ NFR-4) — "without redesign" can't be checked. *Fix:* Either turn it into a load bound (for example, "shared catalogue queries stay within NFR-3 at 100k Books / 300 users with seeded data") or drop it and let NFR-3 carry performance.
- **low** Vision tail describes out-of-scope product (§ Vision, final sentence) — The AI recommendations sentence sets an expectation v1 won't meet. *Fix:* Mark it explicitly as "later" in the Vision, or move it to § Scope.

## Strategic coherence — thin

The thesis is clear and good: stop duplicate purchases and lost loans by answering three questions from the phone in seconds. UJ-1, UJ-2, F2, F3, F6, NFR-1/2 and the success metrics all serve it.

Most of the FR surface serves a second, unstated thesis instead: Bookie spreads to family and friends. That covers F1, F8, F10, FR-23, FR-24, FR-28, NFR-4 and much of NFR-5. Nothing measures that thesis. Every success metric is single-user ("all ~200 of Mika's books catalogued", "under 10 s from the phone"). The only multi-user signal is "owned by Partner" inside the no-duplicates metric. The counter-metric ("time spent correcting data") is the right instinct, but "often" has no threshold.

There is no MVP kind and no ordering inside v1. CLAUDE.md's M1–M5 milestones are now obsolete because the data model and access model changed, and the PRD doesn't replace them. Read for build order, the PRD is a backlog with section headings.

### Findings
- **critical** v1 is unsequenced and the milestone plan is stale (§ Features, § Scope; CLAUDE.md § Milestones) — 46 FRs ship as one undifferentiated v1, and the only build order on record (CLAUDE.md M1–M5) assumes the superseded single-user, one-document-per-copy model. Story creation has nothing to prioritise against, and the core shop check could easily land after friends and curation. *Fix:* Add a phasing section. For example: v1a = single user on the new Book/copy model (F2–F6, F9) and the shop check working end to end; v1b = invites + partner + visibility (F1, F7 sharing, F8); v1c = curation and alternative covers (F10, FR-24). Each phase gets its own exit metric.
- **high** Success metrics don't test the multi-user scope (§ Success Metrics) — Most of the v1 FRs exist for sharing, but no metric would tell you sharing earned its cost. *Fix:* Add one or two, for example "Partner catalogues her books, mostly via shared-catalogue picks (FR-28), within X weeks" and "at least N shop checks show a friend chip". Give the counter-metric a threshold (for example "> 1 correction per 10 books added").
- **medium** "~200 books" conflicts with sizing elsewhere (§ Success Metrics vs NFR-3, CLAUDE.md "large physical book collection") — NFR-3 sizes search for 10,000 copies, and CLAUDE.md calls the collection large. If 200 is right, much of the duplicate-purchase risk the thesis rests on is smaller than framed. If it's wrong, the metric is wrong. *Fix:* Confirm the figure with the owner and use one number throughout.

## Done-ness clarity — thin

The core flow is well specified. FR-6 (iOS Safari named), FR-7, FR-10 ("Title and author are the only required fields"), FR-11, FR-12, FR-27, FR-33 ("at most one open loan") and FR-34 each have a checkable consequence, and NFR-1/2/3/6 have bounds.

The multi-user and browse FRs are where an engineer would stall, and they are the harder half of the build:

- FR-19 "a snapshot of the user's collection": snapshot of what? Recent additions, counts, random covers?
- FR-20 "free text": over which fields (notes? description? per-user overrides?)
- FR-21 "by any metadata field, combining filters freely": the list is open-ended ("Fields include"), and AND/OR semantics are unstated.
- FR-22 "supports inline editing": which fields? Shared-metadata overrides, copy fields, or both?
- FR-3 / FR-5 "must allow adding … later": these are architecture constraints with no observable acceptance.
- FR-43 "installs as a PWA": no criteria (manifest, standalone display, icon).
- NFR-7 "kept intact … in search, sorting and filters": doesn't say Finnish collation (å/ä/ö after z) or whether search folds diacritics ("a" matching "ä").

### Findings
- **high** FR-42 contradicts FR-38 on wishlist privacy (§ F8 FR-42, § F7 FR-38) — FR-42 lets friends see an open collection's "books and statuses". Statuses include wishlist and ordered (FR-25), so friends would see wishlisted and ordered books even when no wishlist is shared with them. For a gift ordered for the partner, that spoils the gift, which is the exact case UJ-3 sets up. *Fix:* State that open collections expose owned copies only (or a defined subset of statuses), and add a visibility matrix (self / friend / share-link viewer / other users / admin × copies, statuses, locations, loans, notes, wishlists, overrides, uploaded covers).
- **high** Wishlist-for-others vs status model is undefined (FR-25, FR-37) — Wishlist entries can be "for" a person, but status runs wishlist → ordered → owned on what appears to be the user's own copy. Received would put a gift for Partner into Mika's owned collection at his home location. *Fix:* Define what Received does for an entry whose recipient isn't the user (close the entry without creating a copy, or prompt).
- **medium** Books without ISBN have no identity rule (FR-10, FR-18; addendum § Data model "one shared record per edition (ISBN-level)") — Manual and title-search entries create shared Books with no dedupe key. Pre-ISBN Finnish books are likely common in a large collection. FR-12's duplicate warning and FR-8's catalogue-first lookup don't cover them. *Fix:* Say whether ISBN-less Books are shared or private, and how duplicates are detected (title + author match prompt, or left to FR-44 merges).
- **medium** Merge semantics unspecified (FR-44, FR-45) — "a merge of duplicates" is approved by the admin, but the PRD doesn't say what happens to users' copies, overrides, alternative covers and loans pointing at the losing record. *Fix:* Add one consequence: all references move to the surviving record and per-user overrides are kept.
- **medium** Vague browse/search FRs (FR-19, FR-20, FR-21, FR-22) — See the list above. *Fix:* For each, name the fields or content, and say that filters combine with AND.
- **medium** NFR-7 lacks a collation rule (§ NFR-7) — "intact" isn't a sort order. *Fix:* "Sorting uses Finnish collation (fi); search is case-insensitive and does / does not fold diacritics."
- **low** Unbounded terms (FR-2 "expires", NFR-1 "mobile connection") — *Fix:* Give an invite TTL, and define the reference connection (for example, 4G with no Wi-Fi).

## Scope honesty — thin

§ Scope has a real "Out of v1" list that does work (offline use, order details, selling/valuing, open self-registration, with a pointer to FR-3). That's the right shape.

Assumption tagging is absent. The memlog records several assumptions that were accepted without being challenged: "FR-5 admin deactivation, FR-30 no location UI if unused, FR-31 multi-select move, FR-40 mutual friendship, FR-42 friend visibility, NFR-1/3/4 targets", plus "Read flag and rating are per user". None carries an `[ASSUMPTION]` tag in the PRD and there is no Assumptions Index. FR-42 is one of the unchallenged assumptions, and it is where the wishlist contradiction above sits.

Open-items density: 1 OQ + 0 `[ASSUMPTION]` + 0 `[NOTE FOR PM]` = 1. For a PRD that reverses the data model and access model, that count is suspiciously low. It reflects tagging that wasn't done, not certainty.

Several omissions are left for the reader to infer:
- Email delivery (FR-2 invites) is a new infrastructure dependency mentioned nowhere.
- Uploaded alternative covers (FR-24) become visible to every user with no moderation. FR-44 routes default-cover changes through review, but alternatives skip it.
- Account deletion and data export are absent. FR-5 only deactivates, and the app now holds other people's emails on the public internet.
- User search by exact email (FR-40) confirms whether an account exists, and NFR-5's rate limiting doesn't list it.
- "view tracking" in § Scope is undefined.

### Findings
- **high** No assumption tagging or index despite recorded unchallenged assumptions (whole PRD; memlog) — Downstream readers can't tell what the owner confirmed from what the drafter inferred. *Fix:* Tag FR-5, FR-26 (per-user read/rating), FR-30, FR-31, FR-40, FR-42 and NFR-1/3/4 inline, and add an Assumptions Index.
- **medium** Infrastructure and safety omissions in an internet-facing multi-user app (FR-2, FR-24, FR-40, NFR-5) — These are email sending, cover upload moderation, rate limiting on user lookup, and account deletion. *Fix:* Add them to NFR-5, or mark each `[NON-GOAL for v1]` explicitly.
- **low** "view tracking" and "bulk ISBN import (dropped)" unexplained (§ Scope) — CLAUDE.md still lists bulk import as M5. *Fix:* One clause each, and update or flag the CLAUDE.md milestone list.

## Downstream usability — thin

This is a chain-top PRD. The addendum is titled "carry-forward for architecture", so this dimension matters. FR IDs are unique, and FR-1 through FR-46 are all present. Internal cross-references (FR-1→FR-38, FR-18→FR-10, FR-21→FR-23, FR-45→FR-23, NFR-7→FR-46) resolve.

The PRD has no glossary, though, and its central nouns aren't defined in it:
- "Book" (capitalised as a term from FR-8 on) appears throughout.
- "edition" (FR-12) and "copy" (FR-12, FR-27, FR-31, FR-33) are used as terms.
- The Book = edition / per-user copy split is defined only in the addendum ("Ownership or copy").

Pulled out alone, F2–F4 are ambiguous about whether a status, location or edit attaches to the shared record or the user's copy.

"Home location" is overloaded. FR-4 and FR-17 use it for the profile default, while FR-33 ("it keeps its home location while lent out") means the copy's current location. "In library", "collection" and "owned" are used as synonyms. "The admin" (FR-2, FR-5, FR-45) doesn't say whether that's a frontend user with an admin role or a Payload admin back-office user, a distinction the addendum flags ("Frontend users are distinct from admin capability") and architecture must resolve.

### Findings
- **high** Core entity model absent from the PRD (FR-8 onward; addendum § Data model) — Every downstream workflow needs Book / copy / edition / override / location / Person definitions, and they live only in a supplementary file. *Fix:* Add a Glossary to the PRD defining Book (edition, shared, ISBN-keyed), Copy (per-user, holds status, location, read, rating, notes), Override, Location, Person, Friend, Open/closed collection, Shared catalogue.
- **medium** "home location" means two things (FR-4, FR-17, FR-25 vs FR-33) — *Fix:* Use "default location" for the profile setting and "location" for the copy.
- **medium** "admin" identity ambiguous (FR-2, FR-5, FR-45) — *Fix:* State whether admin actions (invites, deactivation, suggestion queue) live in the custom frontend or the Payload back office.
- **low** Broken cross-reference (addendum § Data model, "People: open, see the PRD's open questions") — *Fix:* Add the question, or remove the pointer.

## Shape fit — adequate

The shape is roughly right. Three UJs with a named protagonist fit a phone-first product where shop-check UX is the point. The FR list is a capability spec, which fits a solo builder, and the PRD avoids persona and SM ceremony. The memlog's "target ~2-page PRD" was abandoned when scope grew ("Raises PRD rigor above hobby-level 2 pages"), but the document's form didn't grow with its content.

What a multi-user, public-internet scope actually needs is a visibility/permission matrix and a data-model glossary. Neither is present, while UJs keep the same weight as before. UJ-3 is the weakest journey. Its protagonist is unnamed ("his partner", "She"), and step 5 switches to Mika sharing a Christmas list, which is unrelated to the partner joining. The Vision's third question, "who has it?", has no journey (loans appear only as FRs). That's acceptable for a capability spec but worth noting, since it's a headline promise.

### Findings
- **medium** Missing the one artefact the new scope needs (§ F7, F8) — Privacy rules are spread across FR-23, FR-38, FR-41, FR-42 and NFR-5, and they already contradict each other once. *Fix:* Add a compact visibility matrix (see the Done-ness finding). It does more work here than another UJ would.
- **low** UJ-3 protagonist unnamed and step 5 off-topic (§ UJ-3) — *Fix:* Name her and carry her context inline. Move the Christmas-list sharing to its own short UJ or into F7.

## Mechanical notes
- **ID order:** FR-46 sits between FR-43 and FR-44 (F9 before F10). The IDs are unique with no gaps, but the order is non-sequential. Renumber or reorder.
- **SM IDs:** Success Metrics are unnumbered. Add SM-1… so stories and tests can trace to them. "Adding a book: under 20 s" duplicates NFR-2, and "Shop check" just restates NFR-1.
- **Assumptions Index:** absent; see Scope honesty.
- **Glossary drift:** "home location" (two meanings), "In library" / "collection" / "owned", and "Partner" capitalised as a proper noun in UJ-1 and the Success Metrics while FR-16 uses "<friend>".
- **Cross-ref:** addendum → "PRD's open questions" for People is unresolved. FR-5 says "see F10" for moderator rights, but F10 never mentions moderators; only Open Question 1 does.
- **Frontmatter:** `updated: 2026-10-02`, but the memlog and addendum show edits on 2026-10-03.
- **Upstream drift:** CLAUDE.md still describes the superseded model, access and milestones. The addendum records the deviations, but CLAUDE.md itself should be updated (or flagged) before story work, or agents will build to the old spec.
