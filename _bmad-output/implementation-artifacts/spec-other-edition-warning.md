---
title: 'Another edition on the Answer'
type: 'feature'
created: '2026-11-06'
status: 'done'
followup_review_recommended: true
baseline_revision: 'fef0dcf1d126ce26fc9f78baaff3c05910413151'
route: 'dispatch'
review_loop_iteration: 0
context:
  - '{project-root}/_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/mockups/other-edition-options.html'
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Answer's duplicate check is per Book, and a Book is one edition (PRD Glossary), so scanning the paperback of a book whose hardcover the viewer owns reads "Not in library". Mika nearly wishlisted the paperback of Elolliset while owning the hardcover; in a shop that is a duplicate purchase.

**Approach:** When the Answer's heading is Not in library, On wishlist or Ordered, the Answer also says that the viewer holds another edition: a different Book with the same title (exact after normalisation) and at least one shared author, of which the viewer has a copy: owned, lent or ordered. A wishlist entry for another edition does not count. The heading is unchanged: it is true. The notice is on screen before Add to library or Add to wishlist is tapped (marking a copy ordered goes through Add to library, then Edit) and links to the other Book's Answer.

## Boundaries & Constraints

**Always:**
- Title match is exact after normalisation: case-folded, the subtitle after the first `:` dropped, trailing ` /`, punctuation and whitespace trimmed, both sides normalised the same way. Never fuzzy.
- Author match is by name, case-insensitive, against the other Book's effective authors (override-aware). A Book with no authors on either side never matches.
- The Book the Answer is for is never its own other edition (excluded by id when it exists).
- Only the viewer's own copies count (owned, lent or ordered), under the AD-4 read rule, as `searchMine` reads them. Wishlist entries never count.
- `answerFacts()` and the Answer's heading precedence stay as they are.
- PRD FR-20, EXPERIENCE.md Answer screens and the spine's Shared shapes are updated in this commit.

**Never:**
- No notice on In library, Not found, or Couldn't look it up.
- No change to lookup, save, or any write path; the read adds no source call and counts no lookup.
- No edition/work entity, no Finna sibling-ISBN matching.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Paperback of owned hardcover | Scan ISBN B (source result, title "Elolliset", author X); viewer owns Book A "Elolliset", author X | Not in library, plus the notice naming A with "location · owned" and a link to `/scan?book=A` | N/A |
| Same title, other author | Viewer owns "Runot" by Y; scan "Runot" by X | No notice | N/A |
| Subtitle differs | Scanned "Elolliset : romaani"; owned "Elolliset" | Notice | N/A |
| Other edition only wished | Viewer has an open entry for A, nothing else | No notice | N/A |
| Other edition ordered | Viewer has an ordered copy of A | Notice with A's "Ordered" line | N/A |
| On wishlist / Ordered for B, owns A | Held Answer for B with heading On wishlist or Ordered | Heading unchanged, notice shown | N/A |
| In library for B, also owns A | Held Answer heading In library | No notice | N/A |
| Several other editions | Viewer holds A1 and A2 | One row per Book | N/A |
| Read fails | Database error in the other-edition read | The Answer renders without the notice | Logged, like `viewerWishlists` |

**Decision (Mika, 2026-11-06):** On Not in library the notice is option B of `mockups/other-edition-options.html`: a boxed notice (2px ink border, no fill) with the other edition's cover, "publisher · year", its holding line and an Open link. Its heading reads "You already own another edition" ("You already own other editions" for two or more). The same box and wording appear on the On wishlist and Ordered Answers. An ordered copy counts as owned for this notice (already paid for); a wishlist entry does not. Each row's holding line lists only that Book's copies.

</frozen-after-approval>

## Code Map

- `src/lib/shelf/searchMine.ts` -- the pattern to copy (its copies branch only; no wishlist-entry branch here): `readableBy`/`visibleCopies`/`visibleEntries`, then `getEffectiveBooks` + `getHoldings` sequentially (AD-16), returns `MyBook[]`.
- `src/lib/shelf/effective.ts` -- `effective('title')`, `effectiveAuthorRows`/`effectiveAuthorIds` for override-aware authors.
- `src/lib/shelf/search.ts` -- `textSearch`; note its uncorrelated `array(...)` for author matching (planner reason, keep the same shape).
- `src/lib/catalogue/lookupBook.ts` -- `LookupResult`; `source` gives `candidates[pick]` with author names, `existing` gives `book` (EffectiveBook) and `mine`.
- `src/app/(frontend)/scan/answer.ts` -- `notInLibrary()`, `held()`, `factLines()` (reuse it for each other edition's holding lines), `ScanOutcome`. Keep these pure.
- `src/app/(frontend)/scan/page.tsx` -- server page; after `outcome`, run the new read for `notInLibrary` and for `held` with heading `ordered`/`onWishlist`, sequentially after `viewerWishlists` (one context, AD-16), and pass the result down.
- `src/app/(frontend)/scan/AnswerLayout.tsx`, `NotInLibraryAnswer.tsx`, `HeldAnswer.tsx` -- render the notice per the chosen option.
- `src/app/(frontend)/components/Cover.tsx` -- the row's cover, with the placeholder.
- `messages/en.json`, `messages/fi.json` -- `answer.*` strings.
- `tests/int/searchMine.int.spec.ts` -- fixture style for the integration test.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/shelf/otherEditions.ts` -- `otherEditions(ctx, { bookId: number | null, title, authors: string[] }): Promise<MyBook[]>`, plus exported `editionTitle()` normaliser; SQL narrows by the viewer's copies and author name, title compared in code; returns `[]` without a query when `authors` or the normalised title is empty -- own-library read beside `searchMine` (AD-7).
- [x] `src/app/(frontend)/scan/answer.ts` -- `OtherEdition` row shape (bookId, cover, title, language, "publisher · year", holding lines from `factLines` over that Book's copies only) and a pure builder from `MyBook[]`.
- [x] `src/app/(frontend)/scan/page.tsx` -- call the read for the three headings, catch and log failure to `[]`, pass rows to the two Answers.
- [x] `src/app/(frontend)/scan/OtherEditions.tsx` (new) + `AnswerLayout.tsx` + `NotInLibraryAnswer.tsx` + `HeldAnswer.tsx` -- the option-B box, placed after the notes and before the edition Link, each row linking to `/scan?book=<id>`.
- [x] `messages/en.json`, `messages/fi.json` -- "You already own another edition" / "You already own other editions", Finnish equivalents ("Sinulla on jo eri painos" / "Sinulla on jo muita painoksia"; "toinen painos" would read as "second edition", and the house term is "painos", as in `editionsFound`).
- [x] `tests/int/otherEditions.int.spec.ts` -- paperback-of-owned-hardcover matches (with a subtitle difference); same title, different author does not; an entry-only other edition does not.
- [x] PRD FR-20, EXPERIENCE.md Answer screens, ARCHITECTURE-SPINE.md Shared shapes and `catalogue`/`shelf` listing -- describe the notice and `otherEditions`.

**Acceptance Criteria:**
- Given the viewer owns Book A and scans the ISBN of Book B with the same normalised title and a shared author, when the Answer opens, then the heading is Not in library and the notice names A with its holding lines and a link to A's Answer, on screen with the buttons.
- Given the same with B on a wishlist or ordered, when B's Answer opens, then its heading is unchanged and the notice is shown.
- Given the viewer holds B itself (In library), when B's Answer opens, then no notice.
- Given the other-edition read throws, when the Answer opens, then it renders as today without the notice.

## Implementation Notes

## Spec Change Log

## Review Triage Log

### 2026-11-06 — Review pass
- verdicts: 19 findings — high 0, medium 5, low 10, false 4, maybe-false 0
- findings:
  - `medium` `patch` Author match used `lower(a.name)`, missing NFD or double-space names and searching authors outside AD-7's nameKey rule (blind) — now `a.name_key in (…)` over `toNameKey()` keys, deduped; spine text updated.
  - `low` `patch` `editionTitle()` skipped NFC and used locale casing (blind) — now `.normalize('NFC')` first and `.toLowerCase()`.
  - `false` `reject` Notice rows show no title, so subtitle-only works ("Teokset : 1"/": 2") are indistinguishable (blind) — Mika's option B decision omits the title (cover and "publisher · year" tell editions apart) and the intent drops the subtitle by rule; changing either is the intent's call, not a defect here.
  - `low` `reject` Identical "Open" link names for screen readers (blind) — single-user app, the owner doesn't use a screen reader; a per-row accessible name adds strings and props for a case not met in everyday use.
  - `low` `reject` Fact-line rendering duplicated from AnswerLayout, `onList` callbacks dead (blind) — five lines; extracting a shared renderer is more than a direct correction and no drift has happened.
  - `medium` `patch` Read-throws and In library no-notice criteria unguarded (blind; same root as the verification-gap gating row) — gating and fallback moved to `scan/otherEditionsFor.ts`, three cases in `tests/unit/otherEditionsFor.unit.spec.ts`.
  - `low` `reject` Open then Back returns to Scan, not to B's Answer (blind) — the intent prescribes a link to the other Book's Answer; Back behaviour is unchanged screen-wide.
  - `low` `patch` Cited mock-up untracked (blind) — committed with this story.
  - `false` `reject` Spine says lists "do not sort or filter on Book fields" while otherEditions filters on title (blind) — that sentence covers lists that are not copies (loans, wishlists); otherEditions reads copies.
  - `low` `patch` `heading !== 'inLibrary'` gate would silently include a future heading (blind) — now gates on `ordered`/`onWishlist` explicitly.
  - `medium` `patch` Author match vs nameKey (edge case) — same root as the first row; patched there.
  - `low` `patch` NFD title vs NFC stored (edge case) — same root as the `editionTitle()` row; patched there.
  - `low` `patch` A copy removed between the SQL read and `getHoldings()` yields an empty row (edge case) — Books kept only when `mine.copies.length > 0`.
  - `false` `reject` AD-7 broken by an authors search outside nameKey (edge case, claim) — after the patch the author match is an exact `name_key` match, which AD-7 allows.
  - `false` `reject` Leading punctuation stripped while the spine says trailing (edge case, claim) — both sides go through the same `editionTitle()`, so stripping leading punctuation cannot make two different titles unequal; the spine comment says "punctuation and whitespace trimmed" without restricting to the end.
  - `medium` `patch` Answer-level gating and failure fallback verified only by the gitignored walk (verification gap) — grouped with the blind-hunter criteria row; patched there.
  - `medium` `patch` Case folding and a trailing ` /` without a subtitle never decide a result (verification gap) — the int test now asserts `${title.toUpperCase()} /` finds both Books.
  - `low` `reject` Open link href not asserted in a committed test (verification gap, filed defer) — a test would restate markup (CLAUDE.md Tests convention); the walk confirmed Open lands on that Book's Answer.
  - `low` `reject` Intent alignment: the new tests reached only the reader surface (descriptive) — the page-level surface is now covered by `otherEditionsFor.unit.spec.ts`; the rendered box stays walk-checked per CLAUDE.md.

## Design Notes

Author matching by name rather than Author id: a source result's authors are matched among shared rows only (`sharedMatch`), while a hand-entered hardcover links private Author rows, and overrides replace authors per user. Case-insensitive name equality on effective authors covers all three; for shared rows it equals the id match.

Narrow in SQL by author (small set: the viewer's holdings by one author), compare titles in code with `editionTitle()`, so SQL and TS never disagree on the normalisation and no `LIMIT` can drop a match.

## Verification

**Commands:**
- `npx tsc --noEmit` -- expected: no errors
- `npm run test:unit` -- expected: green (shared Answer fixtures may need the new prop)
- `npx vitest run --config ./vitest.config.mts --project int tests/int/otherEditions.int.spec.ts` -- expected: green
- `npx eslint src/lib/shelf src/app/(frontend)/scan` -- expected: clean

**Manual checks:**
- Uncommitted `tests/e2e/otherEdition.walk.spec.ts` against the fixture server: Not in library with the notice, On wishlist with the notice, In library without it; record under `## Auto Run Result`.

## Auto Run Result

- `tests/e2e/otherEdition.walk.spec.ts` (uncommitted, gitignored) on the fixture server: passed (10.2 s). A hand-entered "Sapiens : kovakantinen" by Yuval Noah Harari (owned, E2E shelf) stands in for the hardcover; scanning 978-952-403-569-9 then shows Not in library with the boxed notice "You already own another edition", "E2E shelf · owned" and Open (`/scan?book=<id>`), which opens that Book's In library Answer without a notice; after Add to wishlist the On wishlist Answer shows the notice; after Add to library the In library Answer has none. Before the hand entry the Not in library Answer had no notice. The walk's hand-entered Book was deleted from bookeh_test afterwards so other e2e specs do not see it.

### Run summary

The Answer now warns when the viewer already holds another edition: on Not in library, On wishlist and Ordered, an option-B box (2px ink border) lists each other Book with the same `editionTitle()` and a shared author (`nameKey`) of which the viewer has a copy (owned, lent or ordered), with cover, "publisher · year", its copy lines and Open to `/scan?book=<id>`. Headings, lookup and saves are unchanged.

Files:
- `src/lib/shelf/otherEditions.ts` (new) -- `otherEditions()` read and `editionTitle()` normaliser.
- `src/app/(frontend)/scan/otherEditionsFor.ts` (new) -- which Answers get the read, failure logged to `[]`.
- `src/app/(frontend)/scan/OtherEditions.tsx` (new) -- the notice box.
- `src/app/(frontend)/scan/answer.ts` -- `OtherEdition` shape and `otherEditionRows()`.
- `src/app/(frontend)/scan/page.tsx`, `AnswerLayout.tsx`, `NotInLibraryAnswer.tsx`, `HeldAnswer.tsx` -- wire the rows into the two Answers.
- `messages/en.json`, `messages/fi.json` -- heading (plural) and Open.
- `tests/int/otherEditions.int.spec.ts` (new), `tests/unit/otherEditionsFor.unit.spec.ts` (new); `heldAnswer`/`notInLibraryAnswer` unit specs gain `others: []`.
- PRD FR-20, EXPERIENCE.md Answer screens, ARCHITECTURE-SPINE.md (AD-7, Shared shapes, `shelf/` tree); `mockups/other-edition-options.html` committed as the decision record.

Review: 19 findings; 7 entries patched (medium 3: nameKey author match, page gating and fallback tests, case/` /` title test; low 4: NFC title, explicit heading gate, vanished-copy row, mock-up committed); nothing deferred; 9 rejected (5 low, 4 false) with reasons in the triage log.

Verification: `tsc --noEmit` clean; eslint clean on `src/lib/shelf`, `src/app/(frontend)/scan` and the new unit spec; `npm run test:unit` 1345 passed; `otherEditions` + `searchMine` int specs 9 passed; prettier clean on touched files. The walk above ran before the review patches and was not re-run.

Matrix audit: rows 1–5 and 8 by `otherEditions.int.spec.ts`; rows 6, 7 and 9 by `otherEditionsFor.unit.spec.ts` (gating and the read-fails fallback) and the walk.

Follow-up review recommended: true (three medium patches). Unverified risk: the walk ran before the author match moved to `nameKey` and the gate moved to `otherEditionsFor`; re-check on the real surface that a Finna-fetched author on a Not in library Answer still finds a hand-entered (private-author) edition, and that On wishlist and Ordered still show the box.

Residual risks: `bookeh_test` was reset during the walk (`npm run test:reset`), so earlier-run data is gone; a lent copy reads "Lent · person" as on the held Answer, not the mock-up's "lent to Antti"; `src/lib/shelf/filters.ts` already failed prettier before this story.
