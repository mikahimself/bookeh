---
title: Bookie PRD — addendum
status: superseded in part by the PRD and the architecture spine
created: 2026-10-03
updated: 2026-10-06
---

# Addendum: technical direction for architecture

Technical direction agreed while writing the PRD, carried forward for architecture. Terms follow the PRD Glossary.

## Metadata source plug-in interface

Mika wants metadata sources that can be added at will behind a common interface, not a fixed Finna → Google chain.

- Each source is an adapter that takes an ISBN-13 and returns the unified lookup shape, or nothing.
- Lookup reuses an existing shared Book first (PRD FR-11). Otherwise sources are tried in configured order: Finna first and Google Books second by default (CLAUDE.md, not reopened).
- If no source returns a result, the Answer offers manual entry (PRD FR-12); fields are edited after the save.
- Decided in the spine: results are merged field by field in source order (AD-9), and sources are registered in `sources/index.ts`.

## Data model direction (supersedes CLAUDE.md "one document = one physical copy")

Agreed during the PRD. The committed collections (`7d34440`) need rework.

- **Book**: one shared record per edition (ISBN level). The paperback and hardcover of *Hitchhiker's Guide* are separate Books. Holds the fetched metadata and `rawMetadata`. A manually entered Book with no source match stays private until approved (PRD FR-12).
- **Overrides**: a user's edits to a Book apply only to that user. Decided: a sparse override layer on `user-books` (spine AD-6).
- **Copy** (per user): status (ordered or owned), optional location, loans, notes. Read flag and rating belong to the user and the Book, not to a copy (PRD FR-29).
- **Wishlist entries**: separate from copies (PRD FR-28).
- **Locations**: private to each user, optional.
- **People**: private per user, not linked to accounts.
- **Authors, series, genres and tags**: authors, series and genres are shared, except those created from a private Book (PRD FR-17). System genres come from Google Books categories, created on save and managed by the admin (PRD FR-17); themes come from Finna (PRD FR-17a). Personal tags are private per user.
- **Payload admin**: tailnet-only (PRD FR-49). Collection access control must keep users' private collections out of the admin role (PRD FR-48).
- **Auth**: v1 has a single seeded user (Phase 1). Invites and password resets, when they come, are single-use token links the admin hands over by hand; v1 sends no email (PRD FR-2, FR-5, FR-52). Keep the account model compatible with adding an OAuth provider, self-registration and email delivery later.

## Further CLAUDE.md deviations agreed in the PRD

| Area | CLAUDE.md / brief | Agreed in PRD |
|---|---|---|
| Milestones | M1–M5 | Replaced by the PRD Build Order. Only Phase 1 (v1) is committed; Phases 2–3 are possible later. |
| Access | Tailscale only, no auth beyond Payload admin | v1 stays on the tailnet, with frontend sign-in (PRD FR-1). Public internet is possible later (Phase 2), not committed. If it happens, `tailscale serve` no longer covers ingress, and architecture picks public HTTPS ingress (e.g. Tailscale Funnel, Cloudflare Tunnel, reverse proxy; PRD Open Question 2). |
| Users | Single user | Multi-user data model from v1, with one seeded user. Invites, friends and open/closed collections are possible later (Phase 2). Frontend users are distinct from admin capability. |
| Copy model | One document = one physical copy, holding all metadata | Shared Book (edition) + per-user copies + per-user overrides + alternative covers. |
| Lookup | Finna → Google | Shared catalogue → pluggable sources (Finna → Google → …). |
| Home location | None | Per-user default location on the profile. |
| Loaned | `loaned` as a `books.location` value | Not a location. An open loan on a copy; the copy keeps its location (PRD FR-35). |
