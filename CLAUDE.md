# Bookie — personal book catalogue

Single-user app for cataloguing a large physical book collection (mostly Finnish-language), fetching metadata by ISBN, tracking where each book is, and keeping wishlists. Web + phone via one PWA. Self-hosted on a Proxmox LXC.

## Owner context

- Senior TypeScript developer. Prefer idiomatic TS, no hand-holding, no over-explaining.
- Push back on bad ideas. Do not add abstractions "for later".
- Books are never sold. Duplicates are real: **one document = one physical copy**, not one "work".

## Stack (decided — do not relitigate)

- **Payload CMS 3.x** on Next.js, TypeScript, `@payloadcms/db-postgres`.
- Postgres 16. Local dev via Docker Compose.
- PWA, not React Native. Barcode scanning with `@zxing/browser` (native `BarcodeDetector` is missing on iOS Safari).
- Deploy: one LXC, Docker Compose (app + Postgres), Tailscale for access and `tailscale serve` for HTTPS. **No Kubernetes.**
- Postgres data + media uploads bind-mounted to NAS storage. Nightly `pg_dump`.

## UI strategy

Two surfaces, with a clear split:

- **Custom frontend (`app/(frontend)`) is the product.** All day-to-day use happens here: scanning, reviewing/editing fetched metadata, saving, browsing the shelf, loans, wishlists. Plain Next.js pages and server actions calling Payload's **Local API** (typed, no REST round-trip). Styled to the owner's taste; this is where the app "feels his own".
- **Payload admin (`app/(payload)`) is the back office.** Used for bulk edits, fixing data, managing authors/series/tags, and anything the frontend doesn't cover yet. Theme it lightly (logo, CSS variables via `admin.css`) but don't invest in restructuring it — effort goes into the frontend instead.

**Primary data-entry flow** (design everything around this):
scan barcode → lookup → review screen pre-filled with fetched data, every field editable, location/status pickers → save → back to scanner. Target < 20 s per book. Manual ISBN entry is the fallback on the same screen.

Admin is an acceptable temporary way to enter books during M1 only.

## Metadata sources

Order: **Finna first, Google Books fallback.** Never the reverse.

- Finna: `https://api.finna.fi/v1/search?lookfor=isbn:"<isbn13>"&type=AllFields` — verify against api.finna.fi/swagger before implementing. Pick the best record (prefer ones with cover + subjects). Records are MARC-flavoured; inspect raw output before designing the parser.
- Google Books: `https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn13>`.
- Normalise all input ISBNs to ISBN-13 (accept ISBN-10, hyphens, spaces).
- Lookup returns one unified shape: `{ isbn13, title, subtitle?, authors[], publisher?, year?, language?, pages?, coverUrl?, subjects[], series?, seriesIndex?, description?, source: 'finna'|'google', raw }`.
- Fetched fields are always editable before save. Re-fetch on an existing book fills **empty** fields only; never overwrites user edits.
- Store `raw` on the book so the parser can be improved and re-run later.
- Authors/series/tags from lookup are matched to existing records by name (case-insensitive) and created if missing; the review screen shows which ones are new.

## Data model

- `books`: title, subtitle, isbn13, authors (rel, many), series (rel), seriesIndex, publisher, year, language, pages, cover (upload), description, notes, tags (rel, many), **status** `owned | wishlist`, **location** `tampere | helsinki | loaned` (owned only), **wishlistFor** text (wishlist only; "me" or a person's name), metadataSource, rawMetadata (json).
- `authors`: name, sortName, notes.
- `series`: name, notes.
- `tags`: name, **kind** `genre | theme | other`. One collection, not one per category.
- `loans`: book (rel), borrower, dateOut, dateReturned. Setting location to `loaned` creates/opens a loan.
- `media`: covers.

## Milestones and user stories

Work in order. Each story should be a small, mergeable change. Ask before starting a story if the scope is unclear; otherwise just do it.

### M1 — Data model and admin baseline
1. Run locally with Docker Compose (Payload + Postgres), log in to admin.
2. Collections above, with relationships and validation. Generate types.
3. Admin list views filterable by author, series, tag, location, status.
4. Light admin theme: logo, colours, font.

### M2 — ISBN lookup
5. ISBN normalisation util with tests.
6. Metadata adapters (`finna`, `google`) + normaliser, unit-tested against saved fixture responses.
7. `lookup(isbn)` server function used by the frontend; also exposed as `GET /api/lookup/:isbn` for debugging.

### M3 — Scan-and-review entry (the core product)
8. `/scan`: camera → barcode → lookup; manual ISBN input on the same screen.
9. Review screen: all fields pre-filled and editable, authors/series/tags shown with new-vs-existing indicators, cover preview, location + status pickers.
10. Save via server action (Local API); returns to scanner with a "saved" toast and undo.
11. Duplicate warning if the ISBN already exists (allow saving anyway — duplicates are real).
12. PWA manifest + service worker (installable; offline not required).

### M3.5 — First deploy
13. Dockerfile + Compose for prod; env via `.env`.
14. Media and DB volumes on NAS mount.
15. Backup script (`pg_dump` nightly).
16. Tailscale serve for HTTPS (camera API requires it).

### M4 — Browse, loans, wishlists (frontend)
17. `/shelf`: browse and search books; filters by author, series, tag, location, status.
18. Book detail page with inline edit.
19. Loans: setting location = loaned records borrower + date; `/loans` shows what's out; "returned" action.
20. Wishlist: status toggle on review screen; wishlist hides location, shows `wishlistFor`; `/wishlist` page grouped by recipient.
21. "Received" action: wishlist → owned, prompts for location.

### M5 — Later (do not start unprompted)
22. LLM recommendations from a compact catalogue summary; results addable to wishlist.
23. Bulk ISBN import.

## Conventions

- Strict TS, no `any` outside `rawMetadata`.
- Payload config split: one file per collection under `src/collections/`.
- Metadata logic in `src/lib/metadata/`: one adapter per source, shared normaliser.
- Frontend data access through Payload Local API in server components / server actions. No client-side REST calls except where a client component genuinely needs them (scanner → lookup).
- Frontend styling: pick one approach at the start (Tailwind or CSS modules) and stick to it. Design intent: calm, bookish, dense enough for a large collection.
- Commit after each story. Conventional commit messages.
- No auth beyond Payload's built-in admin user. Access control is Tailscale. Frontend routes assume a logged-in Payload session; redirect to admin login otherwise.
- When touching Payload admin component overrides, read the current Payload docs first — the API differs across 3.x versions.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
