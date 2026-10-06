---
title: Bookie — brief addendum
status: draft
created: 2026-10-02
updated: 2026-10-02
---

# Addendum: carry-forward for PRD and architecture

## Deviations from CLAUDE.md agreed during the brief

CLAUDE.md is the original source. These changes override it and must reach the PRD, the architecture and CLAUDE.md itself.

| Area | CLAUDE.md today | Agreed in brief |
|---|---|---|
| `books.status` | `owned \| wishlist` | `wishlist \| ordered \| owned`. "Received" applies to ordered or wishlisted books. |
| `books.location` | enum `tampere \| helsinki \| loaned` | Relation to a user-extensible **Locations** collection (Helsinki, Tampere, Cottage, …). New values can be created inline. |
| Loaned | A location value | A separate state: an open `loans` record. The book keeps its home location while loaned. |
| Loan borrower | free text | Relation to a **People** collection. |
| `books.wishlistFor` | free text ("me" or a name) | Relation to **People** (empty = me). |
| Reading data | none | `read` (boolean) and `rating` (1–5, optional). |
| Shop check | duplicate warning on save only (story 11) | First-class flow: scan → owned / ordered / wishlisted / not owned → one-tap wishlist. |
| Catalogue search | `/shelf` in M4 | Search by title or ISBN is needed early, because webshop checks depend on it. Milestone sequencing is for the PRD to decide. |
| Bulk ISBN import (story 23) | M5 | Dropped. |
| LLM recommendations (story 22) | M5, whole-catalogue summary | Post-v1, per-book "recommend based on this" (author, title, genre, rating), excluding owned, ordered and wishlisted books. |

## Rejected alternatives

- **View tracking as a recommendation signal.** Rejected because cataloguing and editing open every book, so view counts reflect maintenance rather than taste. Ratings replace it.
- **Order details (shop, due date).** Rejected because the status alone covers the duplicate-purchase case.

## Unchanged and not reopened

Stack, deployment, metadata source order, the unified lookup shape, the one-document-per-physical-copy rule and the UI split between the custom frontend and Payload admin all stand as written in CLAUDE.md.
