---
title: Implementation readiness — bookeh Phase 1
date: 2026-10-06
verdict: CONCERNS
scope: epics.md (9 epics, 184 stories) against PRD, ARCHITECTURE-SPINE.md, STORY-SLICING.md, EXPERIENCE.md, DESIGN.md
decision: generate sprint tracking now; fix the items below with bmad-correct-course before Epic 3 starts
resolution: all items fixed or ruled no-change by sprint-change-proposal-2026-10-06-readiness.md (approved and applied 2026-10-06)
---

# Implementation readiness — 2026-10-06

**Verdict: CONCERNS.** Epics 1 and 2 (27 stories) are implementable as written. Every item below sits in Epics 3–9 and is a story-level or spine-level edit; no epic is re-scoped. Slice ids in `epics.md` and `STORY-SLICING.md` match one to one (184 each). Every Phase 1 FR and NFR is implemented by at least one story; no Phase 2–3 behaviour leaks in.

Fix route: one `bmad-correct-course` pass before Epic 3, plus a short UX decision round (rendered options) for the items marked **[decide]**.

## Must fix before the affected story

1. **Schema order (3.15 [B2] before 3.16–3.18).** `books` has relations to `authors`, `series` and `genres`, which are built after it; Payload rejects a `relationTo` to a collection that does not exist. No story adds `books.genres`, and B11's field list (3.14, `epics.md:1103`) omits genres. → Move B3–B5 before B2 (and in STORY-SLICING), add `genres` to B11 as non-overridable.
2. **Import rules vs Epic 9 [decide].** Spine (`ARCHITECTURE-SPINE.md:60`): `books` imports no other service; `shelf` imports `books`. But 9.2 [G7] `changeTags` checks `SYSTEM_NAME` against the shelf's theme values, and 9.3 [G8] `tagUse` in `lib/books` reads "from the shelf values" (`epics.md:2998`, `:3015`). The A6 lint rule (1.6) rejects both. → Architecture call, e.g. `tagUse` and the system-theme lookup live in `lib/shelf`, and `changeTags` receives the system names from its caller.
3. **Forward dependencies.**
   - 4.9 [D27] author/series comboboxes "over my readable names" need suggestions, but AD-7 forbids listing authors/series directly and `/data/suggest` arrives in 5.9 [E18].
   - 3.40 [A23] picker is a sheet under 900 px and a dialog above; the sheet/dialog wrappers come in 4.1 [A20]. STORY-SLICING:76,79 still has the old A23 → A20 dependency.
   - 1.20 [A26] refers to sheets and pickers that do not exist until 3.40 / 4.1.
   - STORY-SLICING:258: I9 depends on I7 (stale; it builds on D26, 3.48).
4. **3.39 [D8] auto-share on save contradicts FR-12 and D-8** (`epics.md:1467`). It makes all differing values overrides; for the admin they must be dropped (as 5.35 [D33] says). It also does not say which candidate is used when several editions match (D-7), and no Epic 7 story extends it to move open wishlist entries when the private Book merges into an existing shared Book (5.35 does move entries).
5. **No Answer for an existing Book I hold no copy of** until 8.2 [I2]. 3.44 [D16] renders only source results; 3.47 [D25] needs an owned copy. Reachable from the cataloguing gate: an ordered-only copy (4.6/4.10) or a Book whose last copy was removed (5.24).
6. **Shared-shape gaps.**
   - `unavailable` in `SourcesOutcome` / `LookupResult` carries no source names (spine:393, 447), but 3.49 [I9] and 5.35 [D33] name the sources that didn't answer.
   - B11 makes `cover` overridable; D-4 says no per-user cover overrides and `BookEdits` has no cover. AD-6 (spine:129) has the same gap.
   - 3.47 [D25] "Add another copy" on a private Book: what it sends is undefined; a `{ bookId }` target only exists from 4.2.
   - The e2e fixture source for 3.51 [D15] and 8.10 [I8]: nothing records how sources are swapped in the running app (env-gated list?) or how the cover host allowlist treats it.
7. **D6 loan rule homeless.** 3.37 [D6] "undo fails if the copy gained a loan" (`epics.md:1439`) is untestable until 6.2; no Epic 6 story picks it up and AD-11/AD-20 don't record it.
8. **Epic 3 lanes not independent.** Schema-lane B2, B5, B11 need B1 (3.3); U1 needs A24 (3.8). `epics.md:411` puts A24 in the schema lane, `:884` in the lookup lane.

## UX decisions and EXPERIENCE.md sync

- **[decide] Tag picker (9.7 [G2]).** How the user picks kind (tag / genre / theme) and removes values; chips on Book detail filter on tap, so removal must happen in the picker, which conflicts with "one choice, then it closes" (EXPERIENCE.md:116). The tags field on Edit book is equally undefined.
- **[decide] Admin Re-fetch result (5.34 [E13]).** Placement, Link vs button, success toast, "nothing to fill" wording.
- **[decide] "New list" from a picker (7.14 [H10]).** A dialog over a picker breaks the one-overlay rule (EXPERIENCE.md:348); either name inline in the picker or another flow.
- **[decide] Lend picker (6.7 [J4])** needs Person, date and a confirm; the picker pattern closes after one choice.
- **Toast lifetime.** EXPERIENCE.md:118 "about 8 seconds"; 3.26, 3.45 and UX-DR27 keep the save toast until the next Answer. Add the exception to EXPERIENCE, or 1.17 builds a hard 8 s timer.
- **Bought / Ordered toast wording.** EXPERIENCE.md:139 and UX-DR52 say "Saved to {location} · Undo"; 7.13 uses "Ordered · Undo" / "Bought · Undo" (story is right).
- **Stale UX-DRs in epics.md.** UX-DR46 (Received as an Answer button; 8.2 and EXPERIENCE put it on the copy line), UX-DR47 ("all editable"; 4.9 keeps three exceptions).
- **1.23 [K5]** cites `mockups/key-settings.html` for two columns; the mock-up's wide layout has three.
- **Filter chips from Loans or a wishlist** (EXPERIENCE.md:104) are built by no story.
- Smaller: "Remove cover" called destructive but unconfirmed (4.15); Add location / Add person / in-place Rename interaction undefined (5.33, 6.13); story-only copy and routes not in EXPERIENCE ("bookeh was updated.", "Not on this list", INVALID_CORNERS / COVER_FAILED, `/scan?title=`, `/scan?book=`); what opens the edition picker from "{n} editions found" (3.52) and from Book detail (5.35); PWA icon and theme colour (1.21); visibility switch labels (1.24); "Load failed" for Loans and Wishlists; sheet keeps list scroll (4.1); wide header clipping (1.19); first-run empty state adds a second primary Scan book on the phone (5.10).

## Product question

- **[decide] Shop check order.** The PRD ranks shop check third and wants an early first shop check (`prd.md:27`, `:247`, `:255`); the epics put title Lookup and the Ordered / On wishlist headings in Epic 8, after loans and wishlists. Record as a decision or move 8.3–8.8 forward.

## Minor

- Epic summary slice lists stale: Epic 3 omits B11, C9–C11; Epic 6 "J1–J9" omits J10–J13; Epic 7 omits H14–H17.
- `epics.md:205` and `:388` still say the spine "still says otherwise"; the AD-5 summary at `:151` predates the sync.
- 9.10 cites 3.19 for `genreName()`; it is 3.18. STORY-SLICING:96 calls B2 "first migration"; A8 (1.8) commits the first.
- Location filter owned by three stories (5.4 [E3], 5.14 [E7], 5.26 [F3]); pick one.
- Rating has no service story (5.23 is a screen; a `setRating` in `lib/books` is implied).
- 1.7 [A7] adds `canManageAccounts`, used by nothing in Phase 1 — an abstraction for later; drop it.
- FR-37: Lookup's "In your library" rows (8.8) have no lent marker.
- FR-15: the wishlist save toast (7.14) has no Edit.
- FR-17 forbids any system theme name for a user theme; D-6 / 9.2 narrow it to themes on Books the user holds. Deliberate; align the PRD wording.
- 7.7 [H7] "a save closes matching wishes" comes from AD-11, not the PRD; 3.48 "Add without ISBN" on Scan duplicates 8.9's "Add by hand". Confirm both are intended.
- PRD `addendum.md` not synced (review screen at :18, open questions at :19/:26 since decided, "curated" genres at :31).
