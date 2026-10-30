# Bookie — personal book catalogue

App for cataloguing physical books (mostly Finnish-language), fetching metadata by ISBN, tracking where each copy is, and keeping wishlists. Built for one user first on a multi-user data model. Web and phone via one PWA. Self-hosted on a Proxmox LXC.

## Requirements: the PRD is the source of truth

**[_bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/prd.md](_bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/prd.md)** (with `addendum.md` next to it) defines scope, the data model (Glossary), visibility rules, FRs/NFRs and the build order. **Where this file and the PRD disagree, the PRD wins.** Phase 1 (private use, tailnet only) is the committed v1; Phases 2–3 are possible, not planned. Do not build them unprompted, but do not rule them out either.

Two documents sit under the PRD and bind every story:

- **Architecture: [ARCHITECTURE-SPINE.md](_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md)** — the rules stories must share (AD-1 to AD-20, conventions, shared types, routes). [STORY-SLICING.md](_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/STORY-SLICING.md) next to it shows how Phase 1 splits into stories.
- **UX: [EXPERIENCE.md](_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md)** (behaviour) and **[DESIGN.md](_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md)** (look). The interface calls the product **bookeh**.

The PRD decides what is built, the spine how, the UX documents how it looks and behaves. This file yields to all of them.

## Owner context

- Senior TypeScript developer. Prefer idiomatic TS, no hand-holding, no over-explaining.
- Push back on bad ideas. Do not add abstractions "for later".
- Books are never sold. Duplicates are real: a shared **Book** is one edition, and each physical item is a per-user **copy** (see PRD Glossary).

## Stack (decided — do not relitigate)

- **Payload CMS 3.x** on Next.js, TypeScript, `@payloadcms/db-postgres`.
- Postgres 16. Local dev via Docker Compose.
- PWA, not React Native. Barcode scanning with `@zxing/browser` (native `BarcodeDetector` is missing on iOS Safari).
- Deploy: one LXC, Docker Compose (app + Postgres), Tailscale for access and `tailscale serve` for HTTPS. **No Kubernetes.**
- Postgres data + media uploads bind-mounted to NAS storage. Nightly `pg_dump`.

## UI strategy

Two surfaces, with a clear split:

- **Custom frontend (`app/(frontend)`) is the product.** All day-to-day use happens here: scanning, saving, editing fetched metadata, browsing the shelf, loans, wishlists. Plain Next.js pages and server actions calling Payload's **Local API** (typed, no REST round-trip). Styled to the owner's taste; this is where the app "feels his own".
- **Payload admin (`app/(payload)`) is the back office.** Used for bulk edits, fixing data, managing authors/series/tags, and anything the frontend doesn't cover yet. Theme it lightly (logo, CSS variables via `admin.css`) but don't invest in restructuring it — effort goes into the frontend instead.

**Primary data-entry flow** (design everything around this):
scan barcode → lookup → answer screen (what the book is, whether it is already in the library) → **Add to library** saves it as fetched at the default location → back to scanner, with **Edit** and **Undo** on the toast. There is no review step before the save; fetched fields are edited afterwards on the edit screen. Target < 20 s per book. Manual ISBN entry is the fallback on the same screen. EXPERIENCE.md has the full flow.

Admin is an acceptable temporary way to enter books only until the scan-and-save flow exists.

## Metadata sources

Order: **existing shared Book first, then pluggable sources: Finna, then Google Books, then others.** Finna before Google, never the reverse. Lookup is read-only; a Book is created on save (PRD FR-11).

- Finna: `https://api.finna.fi/api/v1/search?lookfor=isbn:"<isbn13>"&type=AllFields&limit=100` plus one `field[]` per entry in `FINNA_FIELDS` (`src/lib/metadata/sources/finna.ts`, the authority). `tests/fixtures/REPORT.md` records what each fixture returned; it is generated, so re-run `npm run fixtures` after changing `FINNA_FIELDS`. Read both before changing the adapter. `isbn:` matches the whole work, so Finna also returns other editions: keep only the records whose own `isbns` normalise to the ISBN asked for (binding text after a space ignored), then pick the best (prefer ones with cover + subjects). Records are MARC-flavoured; inspect raw output before changing the parser.
- Google Books: `https://www.googleapis.com/books/v1/volumes?q=isbn:<isbn13>`.
- Normalise all input ISBNs to ISBN-13 (accept ISBN-10, hyphens, spaces).
- Lookup returns one unified shape, `SourceResult`, defined in the spine (Structural Seed → Shared shapes).
- Fetched fields are always editable after the save. Re-fetch on an existing book fills **empty** fields only; never overwrites user edits.
- Store `raw` on the book so the parser can be improved and re-run later.
- Authors/series/tags from lookup are matched to existing records by name (case-insensitive) and created if missing; the answer screen shows which ones are new.

## Data model

Defined in the PRD (Glossary, Visibility, FR-10 to FR-47) and settled in the spine: entities and shared types in its Structural Seed, the Book / copy / override shape in AD-4, AD-6 and AD-8. The collections committed in `7d34440` follow the old single-copy model and are replaced, not migrated (AD-13).

## Build order

Follow the PRD's **Build Order** (replaces the old M1–M5). Each story should be a small, mergeable change. Ask before starting a story if the scope is unclear; otherwise just do it. AI recommendations and anything beyond Phase 1: do not start unprompted.

## Conventions

- Strict TS, no `any` outside `rawMetadata`.
- Payload config split: one file per collection under `src/collections/`.
- Metadata logic in `src/lib/metadata/`: one adapter per source, shared normaliser.
- Frontend data access through Payload Local API in server components / server actions. No client-side REST calls except where a client component genuinely needs them (scanner → lookup).
- Frontend styling: Tailwind CSS 4 with the tokens from DESIGN.md; overlays from Base UI wrappers (spine, Consistency Conventions).
- Tests at a functional minimum. Add a test only when the story's acceptance criteria name the behaviour or the test guards a spine rule (access, transactions, Undo, migrations, a stated order such as Finna before Google). One focused test per behaviour that can break; no tests that restate markup, class names, CSS, config or a mocked call sequence. Playwright covers only scan-to-save and shop check (spine, Tests convention). In review triage, a finding that only asks for a test is rejected unless it names the criterion or the spine rule the test would guard.
- Stories stay compact in the diff, not the spec. The spec is as rich as the story needs: Code Map, decisions and acceptance criteria may push it past the `oversized` warning (2500 tokens of plan-time spec, set in `_bmad/custom/bmad-build.toml` and `bmad-build-auto.toml`), and that warning alone is never a reason to split or to halt. At the token gate, keep the full spec. Split a story only when the hand-written diff would not scan in one review, roughly more than 500 changed lines excluding generated files such as migration snapshots. In review triage, a finding that only says the story was built despite `oversized` is rejected.
- A story that changes a spine contract updates ARCHITECTURE-SPINE.md in the same commit. The update is one of the story's acceptance criteria, never a deferral.
- A deferred item handed to a later story is one of that story's acceptance criteria; otherwise it stays with the story that deferred it.
- A deferral that touches a rule the spine states (an AD) is fixed in the story or written into the next story's acceptance criteria at plan time, never left in an epic context's open items.
- A story with `followup_review_recommended: true` gets a walkthrough on the real surface before the next story mounts it.
- Payload skips a field's `validate` when its `admin.condition` is false, so clearing a field that depends on another field (a copy's location when it is ordered, say) belongs in a `beforeValidate` hook (verified by storing bad values in `7d34440`; `Copies.ts` and `Loans.ts` follow it).
- A story built beside others (parallel worktrees) names the files it shares with them in its Residual risks.
- Commit after each story. Conventional commit messages.
- v1 runs on the tailnet only. Frontend users sign in (PRD F1); the admin role does not read users' private data (PRD FR-48). Token links instead of email for invites and resets (PRD FR-2, FR-5, FR-52).
- When touching Payload admin component overrides, read the current Payload docs first — the API differs across 3.x versions.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
