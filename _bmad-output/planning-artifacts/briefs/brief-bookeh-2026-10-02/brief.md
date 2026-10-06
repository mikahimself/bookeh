---
title: Bookie — product brief
status: draft
created: 2026-10-02
updated: 2026-10-02
---

# Bookie — product brief

## Executive Summary

Bookie is a private catalogue of my roughly 200 physical books, which are mostly Finnish and kept in several places. Today I track none of them. I buy books I already own, I lose track of which city a book is in, and I forget who borrowed what.

Bookie fixes this with a phone-first app built around the barcode. Scan to add a book, using Finnish library metadata first. Scan in a shop to see straight away whether I already own the book, have it on order or have it on my wishlist. Search to find where any book is, or who has it. Each book goes from wishlist to ordered to owned, and loans and wishlist entries link to a single list of people.

I'm building it rather than using an existing app because Finnish books are poorly covered elsewhere, I want the data on my own server, and I want to add AI features on my own terms. The first planned one is a "recommend based on this" button that uses my ratings. The first version succeeds when the whole collection is catalogued, I stop buying duplicates and I never have to wonder where a book is.

## The Problem

I own about 200 physical books, mostly in Finnish, spread across several places (Helsinki, Tampere, the cottage). I have no record of them. The result:

- **I buy books I already own.** In a bookshop or on a webshop there's no way to check, so duplicates happen.
- **I don't know where a book is.** Whether a book is in Helsinki, Tampere or somewhere else lives only in my memory.
- **Loans disappear.** Once a book is lent out, I lose track of who has it.
- **Orders are invisible.** A book I've paid for that hasn't arrived yet is exactly the one I'm likely to buy again.
- **My buy-list has no home.** Books I want, for me or as gifts, are scattered or forgotten.

Existing catalogue apps (Libib, BookBuddy, LibraryThing) don't solve this well for me. Finnish titles are poorly covered by their metadata sources, the data lives on someone else's server, and they leave no room to build my own AI features on top.

## The Solution

Bookie is a private, self-hosted catalogue of my physical books. It runs on my phone as an installable web app, and on desktop. One record = one physical copy.

It is built around four moments:

- **Adding a book.** Scan the barcode. Bookie fetches the metadata, trying Finnish library data (Finna) first. I check and correct it, pick a location and save. Back to the scanner in under 20 seconds.
- **Standing in a shop.** Scan a barcode and see straight away whether I own the book (and where), have it on order or have it on my wishlist. If it's none of these, add it to the wishlist with one tap. On a webshop, I search my catalogue by title or ISBN.
- **Wondering where a book is.** Search and see its location. Locations are my own list (Helsinki, Tampere, Cottage, …) and grow as I add new ones. If the book is lent out, I see who has it and since when.
- **Lending and buying.** Lend a book to someone from my people list. It keeps its home location and goes back there when returned. A wishlisted book moves to ordered when I buy it, and to owned with a location when it arrives.

Each book has a status: **wishlist → ordered → owned**. A loan is a separate state that only an owned book can have.

## Who This Serves

Me, and only me. I'm a collector of mostly Finnish books with one collection split across several places. The wishlist is a private memory aid, including books meant as gifts. The people it names never see it. There's no sharing and no other users. Access is limited to my Tailscale network.

## Success Criteria

- **The collection is in.** All ~200 books are catalogued with a correct location.
- **No more duplicate purchases.** Once the collection is in, I never again buy a book I already own or have on order.
- **"Where is it?" takes seconds.** I can find any book's location, or who has borrowed it, from my phone in under 10 seconds.
- **The shop check is instant.** Scanning a barcode in a shop tells me within a few seconds whether I own the book, have it on order or have it on the wishlist.
- **Adding a book is fast.** Scan to save takes under 20 seconds per book, so new purchases get added straight away.

## Scope

**In the first version:**

- Scan or type an ISBN → fetch metadata (Finna, then Google Books) → review and edit every field → save. Duplicate copies get a warning but are allowed.
- Shop check: scan to see whether I own the book (and where), have it on order or have it on my wishlist. Add it to the wishlist with one tap.
- Search and browse my own catalogue by title, author, ISBN, series, tag, location and status.
- Status: wishlist → ordered → owned. "Received" moves a book to owned and asks for a location.
- Locations are my own list and grow as I add new ones.
- A people list, shared by loans (who has the book) and wishlist entries (who it's for).
- Loans: lend to a person and mark returned. The book keeps its home location throughout.
- A "read" flag and an optional 1–5 rating on books.
- Installable on my phone. Self-hosted, reachable only over Tailscale, backed up nightly.

**Explicitly out:**

- AI recommendations. They come next (see Vision), but the read and rating data starts building up now.
- Bulk ISBN import. About 200 books scan in roughly an hour, so it isn't needed.
- Sharing, other users, a public wishlist.
- Offline use.
- Order details (shop, due date). The status alone is enough.
- Tracking which books I view.
- Selling or valuing books. Books are never sold.

## Vision

Once the collection is in and kept current, Bookie becomes the place I go when deciding what to read or buy next. Every book page gets a **"recommend based on this"** button. It bases its suggestions on the book's author, title, genre and my rating of it, and checks them against everything I already own, have on order or have wishlisted, so it never suggests what I already have. Each suggestion can go to my wishlist in one tap. Because the catalogue is mine, I can shape these AI features however I like, rather than accepting whatever a third-party app decides to offer.

