---
title: Sprint Change Proposal — readiness fixes before Epic 3
status: approved, applied 2026-10-06
created: 2026-10-06
project: bookeh
trigger: bmad-sprint-planning readiness gate, 2026-10-06 (verdict CONCERNS) — implementation-readiness.md
mode: decisions first, then batch per document
---

# Sprint Change Proposal — readiness fixes, 2026-10-06

## 1. Issue summary

**Problem.** The readiness gate run at sprint planning found that Epics 1–2 can be built as written, but Epics 3–9 contain story-order errors, forward dependencies, one story contradicting FR-12 and D-8, a broken import rule, shared-shape gaps and UX gaps. A developer would hit each of them and have to invent a decision.

**Discovery.** Three cross-checks (PRD ↔ stories, spine and slicing ↔ stories, UX ↔ stories) during `bmad-sprint-planning`. The verified items are listed in `implementation-readiness.md`. No code exists beyond the scaffold. `sprint-status.yaml` was generated with all stories in backlog.

**Category.** Misunderstanding and drift between documents found during planning. This is not a technical limitation or a pivot.

**Decisions taken by Mika on 2026-10-06 for this proposal:**

| # | Decision |
|---|---|
| R-1 | Tags of every kind move to a new service, **`lib/tags`**, which may import `books` and `shelf`. |
| R-2 | **Shop check order is kept.** Epic 3's scan Answer is the early shop check. Title Lookup and the Ordered / On wishlist Answers stay in Epic 8. This is recorded in the PRD Build Order. |
| R-3 | The tag picker (9.7), the admin Re-fetch result (5.34), New list from the wishlist picker (7.14) and the Lend picker's confirm (6.7) each **start with a rendered mock-up choice**, as the genre admin and corner crop already do. |
| R-4 | Edits are reviewed as one batch per document. |

## 2. Impact analysis

- **Epics.** No epic is added, removed or re-scoped. Two moves inside the plan:
  - The schema stories in Epic 3 are reordered: authors, series and genres come before books.
  - The dialog and sheet wrappers (A20) move from Epic 4 into Epic 3, before the picker that uses them.
  - As a result, Epic 3 grows to 53 stories and Epic 4 shrinks to 14. Story numbers from 3.15 onward in Epic 3, and all of Epic 4, shift (section 4.1). The total stays at 184.
- **Stories.** About 30 stories change acceptance criteria. Cross-references are renumbered.
- **Documents.** `epics.md`, ARCHITECTURE-SPINE.md, STORY-SLICING.md, EXPERIENCE.md, the PRD and the PRD addendum.
- **Tracking.** `sprint-status.yaml` is regenerated after the edits. Every story is still in backlog, so renamed keys are simply replaced.
- **Technical.** One new service folder (`src/lib/tags`). One shared-shape field (`failed` on `unavailable`). One recorded rule for undoing a save after a loan. A fixture-source switch for the end-to-end tests. Phase 1 scope and the success metrics do not change.

## 3. Recommended approach

**Direct Adjustment.** These are document edits only. Effort is about half a day. The risk is low: everything sits after Epics 1–2, so story 1.1 can start in parallel.

## 4. Detailed change proposals

### 4.1 `epics.md` — order and numbering

1. **Schema order in Epic 3.**
   - New order: 3.15 [B3] `authors`, 3.16 [B4] `series`, 3.17 [B5] `genres`, 3.18 [B2] `books`.
   - Story 3.15 (authors): "with the same read and write rules as `books`" → "users read `visibility = shared OR createdBy = me`, admin reads all, users never write (AD-4, AD-5)".
2. **A20 moves into Epic 3.**
   - "Story 4.1 [A20] Dialog and sheet wrappers" becomes Story 3.40.
   - It now also carries the `@base-ui/react` dependency and its import lint rule, as STORY-SLICING already says.
   - It gains the AC "the list under a sheet keeps its scroll position".
   - The old 3.40–3.52 become 3.41–3.53, and 4.2–4.15 become 4.1–4.14.
   - Story 3.41 [A23]: "Given `@base-ui/react` 1.8.0" → "Given the wrappers from Story 3.40". The ESLint AC moves to 3.40.
   - The Epic 3 Base UI note: "Story 3.40 adds the `@base-ui/react` dependency … Story 4.1 adds the dialog and sheet wrappers (slices A23 and A20 re-split, since the combobox is needed first)" → "Story 3.40 adds the `@base-ui/react` dependency, its import lint rule and the dialog and sheet wrappers; Story 3.41 adds combobox, menu and picker on top of them."
3. **Cross-references renumbered:**
   - Story 4.11 → 4.10 at `:825`, `:878`, `:1668` and `:3183`.
   - "Stories 4.1–4.10" → "4.1–4.9" and "(4.12–4.15)" → "(4.11–4.14)" at `:1668`.
   - 4.2 → 4.1 at `:1409`, and 4.14 → 4.13 at `:1863`.
   - 3.44 → 3.45 at `:903`, 3.48 → 3.49 at `:2952`, and 3.45 → 3.46 at `:3183`.
   - In 9.10, "`genreName()` (Story 3.19)" → "(Story 3.17)".
4. **Epic 3 lanes** (`:411` and `:884`):
   - Lookup lane: B1, C1, C2, C10, C3, A24, C4 (3.3–3.9).
   - Schema lane: A11, A12, A18, B10, B11, B3, B4, B5, B2, B6, B7, F1, B8, B9, E26, U1, U2 (3.10–3.26). It starts once 3.3 [B1] and 3.8 [A24] have merged, because both lanes use `isbnField`, `nameKeyField` and `processState`.
   - "A24" is removed from the schema-lane list at `:411`.
5. **Epic summary slice lists** are regenerated from the story headings:
   - Epic 3 gains A20, B11 and C9–C12, plus the D25–D32 slices it already holds.
   - Epic 4 loses A20.
   - Epic 6 becomes J1–J13 and Epic 7 becomes H1–H3 and H5–H17.
6. **Stale housekeeping.**
   - `:91`: "which still say otherwise until they are updated; these decisions win" → "carried into those documents on 2026-10-06 (`b387e8a`)".
   - `:205`, the precondition: append "Met on 2026-10-06 (`b387e8a`); readiness fixes applied by sprint-change-proposal-2026-10-06-readiness."
   - `:151`, the AD-5 summary: rewrite to the current rule. Admin edits are shared (D-8). Saves create genres (D-2). Auto-share runs in the save and in Look it up again.

### 4.2 `epics.md` — story fixes (numbers after renumbering)

| Story | Change |
|---|---|
| 1.7 [A7] | Drop `canManageAccounts(user)`. Nothing in Phase 1 uses it (CLAUDE.md: no abstractions for later). |
| 1.17 [A17] | "success shows a toast for about 8 s" → "success shows a toast for about 8 s, unless the caller holds it until replaced (the save toast on Scan, Story 3.46)". |
| 1.19 [A22] | Add AC: "at 900px and up, where the window is too narrow for all four headings, the row clips at the right edge as on the phone". |
| 1.20 [A26] | "swiping does nothing while a sheet, picker or full-screen task is open" → "swiping is suspended while anything registered through `useSuspendSwipe()` is open; the Scan task (3.1) and the overlay wrappers (3.40, 3.41) register through it". |
| 1.21 [K1] | Add AC: "the icon and the theme colour are picked by Mika from rendered options and recorded in DESIGN.md". |
| 1.23 [K5] | "laid out as in `mockups/key-settings.html`: on wide screens two columns" → "on wide screens two columns (ruling 2026-10-06; the mock-up's third column is superseded)". |
| 1.24 [K10] | "Settings shows a switch public / hidden and a switch open / closed" → "Settings shows, in the first column after Theme, a Profile switch public / hidden and a Collection switch open / closed". |
| 3.14 [B11] | The field list gains `genres`. "all except ISBN-13, genres (D-6) and themes (D-3)" → "all except ISBN-13, cover (D-4: covers change only through `setCover`), genres (D-6) and themes (D-3)". |
| 3.18 [B2] | Add AC: "`genres` is a has-many relation to `genres`, written only by `mapSubjectsToGenres()` and admin edits". |
| 3.35 [D4] | Add AC: "an `{ isbn13 }` target resolves to the shared Book with that ISBN, else my own private Book with it (Story 3.38), else ensures a shared Book from the held outcome". |
| 3.37 [D6] | Add: "the loan case is tested in Story 6.5, once loans exist". |
| 3.39 [D8] | Rewrite the Then clause to say three things. The Book takes the values of the candidate the Answer picked (D-7). As admin, my differing hand-entered values are dropped; as another user, they become my overrides (FR-12, D-8). Add: "entries move with it from Epic 7 (Story 7.7)". |
| 3.45 [D16] | "When the result is `source`" → "When the result is `source`, or `existing` where I hold no copy and no entry (the Book stays shared; no source line or new-record notes)". |
| 3.48 [D25] | "where I own at least one copy" → "where I hold at least one copy". Add: "Add another copy sends `{ isbn13 }` (Story 3.35)". |
| 3.52 [D15] | Add AC: "the fixture source is enabled by `BOOKEH_SOURCES=fixture`, which the app refuses when `NODE_ENV=production`; it serves `tests/fixtures/` responses and its covers from a local test route allowlisted only under that setting". |
| 3.53 [C12] | "a picker listing each candidate" → "'{n} editions found' is a Link opening a picker listing each candidate". |
| 4.5 [D24] | No change. |
| 4.8 [D27] | "authors and series are comboboxes over my readable names, with new names allowed" → "authors and series are text fields matched on Save through `findOrCreateByName()`; suggestions arrive with Story 5.9". |
| 4.9 [D22] | Add AC: "from here, a copy set to ordered shows on the In library Answer as a line 'Ordered' (the Ordered heading arrives in Story 8.2)". |
| 4.14 [D31] | "a destructive 'Remove cover'" → add "with no dialog: it takes effect on Save, which 'Discard changes?' can still cancel". |
| 5.9 [E18] | Add AC: "Edit book's author and series fields become comboboxes over these suggestions, new names allowed". |
| 5.10 [E6] | "it shows 'No books yet', one dry remark and Scan book" → "… and, on wide screens only, Scan book (on the phone the pinned button is the one primary)". |
| 5.21 [E22] | Add AC: "a chip in Book detail opened from `/loans` or a wishlist entry opens the collection with only that filter". |
| 5.23 [E11] | Add AC: "rating writes through `setRating(ctx, bookId, rating | null)` in `lib/books`, via `upsertUserBook`, with an integration test". |
| 5.34 [E13] | First AC: "Starts with a rendered mock-up choice for where Re-fetch sits and what it shows when it fills fields or finds nothing". |
| 5.35 [D33] | "my copies, entries and `user-books` row move" → "my copies and `user-books` row move (entries from Epic 7, Story 7.7)". Add: "the edition picker opens over the Book detail sheet (one overlay deep)". |
| 6.5 [J3] | Add AC: "undoing a save (Story 3.37) once its copy has a loan fails with `UNDO_FAILED` and changes nothing; integration test". |
| 6.7 [J4] | First AC: "Starts with a rendered mock-up choice for the Lend picker: Person, date and confirm in one overlay". |
| 6.9 [J5] / 7.10 [H5] / 7.11 [H11] | Add: "on a load failure, 'Couldn't load. Try again.' with a retry Link". |
| 7.7 [H7] | Add AC: "when the save or Look it up again merges my private Book into an existing shared Book (Stories 3.39, 5.35), my entries for it move to the shared Book first". |
| 7.14 [H10] | First AC: "Starts with a rendered mock-up choice for creating a list when the picker has none, within one overlay". |
| 8.8 [I6] | Add AC: "a lent copy in 'In your library' shows the lent marker with the borrower (FR-37)". |
| 9.2 [G7] | `lib/books` → `lib/tags`. Add: "it reads system theme names through `lib/shelf`". |
| 9.3 [G8] | "Given `lib/books`" → "Given `lib/tags`". |
| 9.7 [G2] | First AC: "Starts with a rendered mock-up choice: how kind is chosen and how values are added and removed, in Book detail and on Edit book". |
| UX-DR27 | Matches the toast rule in 4.4 (Scan exception kept, the 8 s exception stated). |
| UX-DR46 | Ordered: "(Received · **Back**)" → "(**Back**; Received on each ordered copy's line)". |
| UX-DR47 | "genres, description, all editable" → "description; ISBN and system genres editable only on a private Book or by the admin, themes never". |
| UX-DR52 | Bought / Ordered → "Saved to {location} · Undo (Bought, for me) / Ordered · Undo / Bought · Undo (for a Person)". |

No change, with reasons:
- The location filter has three stories, but they are layers: the query (5.4), the panel (5.14) and absence without locations (5.26).
- 7.7 (a save closes my own wishes) is intended and gets PRD backing in 4.5.
- 3.49's "Add without ISBN" was ruled on 2026-10-06.

### 4.3 ARCHITECTURE-SPINE.md

1. **Import rules (`:60`).** Add "`tags` may import `books` and `shelf`". The `books` clause keeps "imports no other service".
2. **`:249` and `:251`.** "`setRead()` and `changeTags()` in `lib/books`" → "`setRead()` and `setRating()` in `lib/books` and `changeTags()` in `lib/tags`". "tags of every kind in `lib/books`" → "tags of every kind in `lib/tags`, which reads system genre and theme names (through `lib/shelf`) for `SYSTEM_NAME`".
3. **Source tree (`:563`).**
   - `books/`: "setRead, changeTags and tags of every kind, coverUrl" → "setRead, setRating, coverUrl".
   - New line: `tags/  # changeTags, rename, merge, delete and tagUse for tags of every kind; SYSTEM_NAME checks`.
4. **AD-6 (`:129`).** "ISBN-13 is identity, and genres and themes are system data; none of the three is overridable" → "ISBN-13 is identity, the cover changes only through `setCover()` (AD-14), and genres and themes are system data; none of the four is overridable".
5. **Shared shapes (`:393`, `:447`).** `{ kind: 'unavailable' }` → `{ kind: 'unavailable'; failed: SourceId[] }` in both `SourcesOutcome` and `LookupResult`. The Answer names those sources.
6. **AD-11 (`:195`).** Append: "If the copy has gained a loan since the save, the restore fails with `UNDO_FAILED` and changes nothing."
7. **Tests convention (`:311`).** Append: "The fixture source joins `sources/index.ts` only when `BOOKEH_SOURCES=fixture`, which the app refuses under `NODE_ENV=production`. Its covers come from a local test route that is allowlisted only under that setting."
8. **`:80`.** In "(for example `canEditShared`, `canManageAccounts`)", drop `canManageAccounts`.

### 4.4 STORY-SLICING.md

1. **B2:** depends on "A12, B1, B3, B4, B5, B11". Drop "first migration".
   - **B3:** "B1, B10". **B4:** "B1". **B6:** add B2.
2. **I9:** depends on "D26, C4" (was I7, C4).
3. **G7 and G8:** `lib/books` → `lib/tags`.
4. **D27:** note "suggestions from E18". **E18:** add "and the Edit book comboboxes".
5. **J3:** add "the save-undo loan rule (AD-11)". **H7:** add "moves entries on auto-share merge". **D33:** drop entries.
6. If an order section lists Epic 3/4 placement, it gains A20 before A23 in Epic 3. The A20/A23 rows already have the right split and dependency, so they need no change.

### 4.5 EXPERIENCE.md (and one DESIGN.md hook)

1. **Toast (`:118`).** "About 8 seconds, then gone; … A toast raised on Scan goes the moment the next Answer opens." → "About 8 seconds, then gone; one at a time, a new one replacing the old. A toast raised on Scan has no timer: it stays until the next Answer opens, so Edit and Undo wait while the next book is lined up."
2. **Undo table (`:139`).** Bought, Ordered → three rows:
   - Bought, for me: "Saved to {location} · Undo"
   - Ordered: "Ordered · Undo"
   - Bought, for a Person: "Bought · Undo", and no copy is made
3. **Answer address (`:47`).** Add `/scan?title=` (Add without ISBN, and Lookup's Add by hand) and `/scan?book={bookId}` (a Book without an ISBN, and Lookup's own-library results).
4. **Destructive rule (`:100` and `:102`).** Add the exception: "Remove cover on Edit book: takes effect on Save, so 'Discard changes?' is its confirmation."
5. **Not mocked (`:68`).** Append: "The tag picker, the Lend picker, New list from the wishlist picker, the admin Re-fetch result, the edition picker, and the app icon and theme colour are not designed yet; each story starts with a rendered mock-up choice."
6. **Settings.** "Add location" and "Add person" open an empty name field in place at the top of their group. Leaving the field or pressing Enter saves it, an empty field is dropped, and a name in use is rejected under the field. Rename confirms the same way.
7. **States table.** Add two rows:
   - App updated: toast "bookeh was updated." with a Reload Link.
   - Entry gone: an opened `?entry=` that is closed or removed opens the list with the toast "Not on this list".
8. **First run (`:315`).** "and Scan book" → "and, on wide screens, Scan book (on the phone the pinned Scan book is the one primary)".
9. **Answer.** Add: "When several editions share the ISBN, '{n} editions found' under the Book is a Link opening a picker of the candidates (binding, year, publisher, pages, cover)."
10. **DESIGN.md.** No edit now. The icon and theme colour are recorded by Story 1.21 after the pick.

### 4.6 PRD and addendum

1. **FR-15.** "Saving shows a toast with **Edit** and **Undo**" → "Saving to the library shows a toast with **Edit** and **Undo**; saving to a wishlist shows **Undo**".
2. **FR-17.** "A user genre or theme may not take a system genre's or theme's name." → "A user genre may not take a system genre's name, nor a user theme the name of a system theme on a Book the user holds."
3. **FR-28.** Append: "Adding a Book to the library closes the user's own open wishlist entries for it; entries for a Person stay open."
4. **Build Order, Phase 1.** After the bullet list, add: "Within Phase 1, the first shop check is the scan Answer of F2 (In library / Not in library). Title search across the sources and the Ordered and On wishlist Answers follow wishlists (Mika, 2026-10-06)."
5. **addendum.md.**
   - Status → `superseded in part by the PRD and the spine`, updated 2026-10-06.
   - `:18` "the review screen opens for manual entry" → "the Answer offers manual entry (FR-12); fields are edited after the save".
   - `:19` and `:26` → "Decided in the spine: merge field by field in source order (AD-9), sources registered in `sources/index.ts`" / "Decided: a sparse override layer on `user-books` (AD-6)".
   - `:31` "Genres are curated from source subjects" → "System genres come from Google Books categories, created on save and managed by the admin (FR-17); themes come from Finna (FR-17a)".

## 5. Implementation handoff

- **Scope: Moderate.** The edits include a backlog reorganisation (reorder and renumber) but no replan.
- **Executor:** this session applies 4.1–4.6, then reruns `bmad-sprint-planning` to regenerate `sprint-status.yaml`. All stories are in backlog, so renamed keys are replaced and nothing is lost.
- **Success criteria:**
  - Every finding in `implementation-readiness.md` is either fixed or listed under "No change".
  - Slice ids still match STORY-SLICING one to one, 184 each.
  - The sprint-status regeneration reports no warnings beyond the two known non-epic headings.
  - The readiness verdict on a re-run is PASS.
