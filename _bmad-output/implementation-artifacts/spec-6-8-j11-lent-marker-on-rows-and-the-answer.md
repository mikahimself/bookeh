---
title: '6.8 [J11] Lent marker on rows and the Answer'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_revision: '68644fb0ff42ef494a3f364618ea5e3192841802'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Holdings carry each copy's open loan (6.6) and Book detail shows it (6.7), but collection rows, cover tiles and the In library Answer look the same for a lent copy as for one on the shelf. "Who has it?" still needs a tap into Book detail (FR-37, UX-DR21).

**Approach:** Read `CopyLine.loan`, which `ShelfRow.copy` and the lookup's `mine.copies` already carry, and render the lent marker: an 8px accent square before "Lent · {person}" in `text-text`. A row ends with it in place of the location. A tile has the marker before its title and a "Lent · {person}" line. The Answer's copy line shows the same after the location.

## Boundaries & Constraints

**Always:**
- The marker is `<span aria-hidden="true" className={`${markerSlotClass} bg-accent`} />`, the same as Book detail's lent line (an 8px square, never a dot). It never appears without the text "Lent · {person}" in `text-text`, never muted. Screen readers get the text, not the square.
- A copy counts as lent only when `status === 'owned' && loan !== null`, the same rule as Book detail (6.7). An ordered copy with an open loan keeps "Ordered" on its row, the airmail band on its tile and its ordered line on the Answer, with no marker (deferred from 6.6, unchanged).
- **Row** (`BookRow`, every size and select mode): a lent copy's ending is the marker then "Lent · {person}" in `text-meta text-text`, replacing the location name. The ending keeps its `max-w-1/3 shrink-0`. The text truncates and the marker never shrinks. Other endings are unchanged ("Ordered", the location, or nothing).
- **Tile** (`CoverTile`, every size and select mode): a lent copy has the marker before the title, on the title's line, and the title still truncates. A line "Lent · {person}" in `text-label text-text`, truncated, follows the authors line. The marker sits only before the title, not on that line too.
- **Answer** (In library): a lent copy's line is "{location} · " then the marker then "Lent · {person}", or the marker and "Lent · {person}" alone when the copy has no location. Other lines are unchanged ("Tampere · owned", "Owned", "Ordered"). The order is still Holdings order.
- One string, `loans.lentMarker`: en "Lent · {person}", fi "Lainassa · {person}". The name goes after the separator, where Finnish needs no inflection, and is never lowercased. `BookRow` and `CoverTile` stay hook-free: the caller (`CollectionList`) passes `lent: (person: string) => string`, as it passes `ordered`.
- `AnswerCopy` gains `lentTo: string | null`, the borrower's name. `inLibrary()` fills it from `loan.person.name` only for a lent owned copy. `copyLines()` returns `{ text: string; lent: string | null }[]`. For a lent copy `text` is the location name, or `''` when there is none, and `lent` is the marker's words. Otherwise `text` is the line as today and `lent` is `null`. `AnswerLayout`'s `lines` prop takes that shape: it renders `text`, then ` · ` when both are present, then the marker and `lent`.
- Tokens only. No new colour, size or class tokens.

**Never:**
- No change to `lib/books/holdings`, `lib/shelf`, `lib/catalogue`, `lib/loans`, the collections or migrations. No new reads: the loan is already in the data.
- No date on rows, tiles or the Answer: "since {date}" belongs to Book detail and `/loans`.
- No change to Book detail, the Loans section (6.9+), Lent before (6.12) or select mode's Remove dialog.
- No loan filter or sort on the shelf.
- Cover cloth colours never mark loan state.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lent row | Owned at Tampere, loan to Antti | Row ends "■ Lent · Antti"; no "Tampere" | — |
| Lent, no location | Owned, no location, loan to Antti | Row ends "■ Lent · Antti" | — |
| Shelved row | Owned at Tampere, no loan | Row ends "Tampere" (unchanged) | — |
| Ordered with a loan | Ordered, loan open | Row ends "Ordered"; tile has the band; no marker | — |
| Lent tile | Covers layout, lent to Antti | Marker before the title; "Lent · Antti" under the authors | — |
| Lent in select mode | Select mode on, row or tile lent | Same marker and text beside the checkbox | — |
| Answer lent | Copies: Tampere owned, Mökki lent to Antti | Lines "Tampere · owned", "Mökki · ■ Lent · Antti" | — |
| Answer lent, no location | One copy, no location, lent to Leena | Line "■ Lent · Leena" | — |
| Finnish | `fi` locale, lent to Antti | "Lainassa · Antti" | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookRow.tsx` -- hook-free row. `ending` at `:61` is `copy.status === 'ordered' ? ordered : copy.location?.name`, rendered at `:78-80` as a muted `span`. Add a `lent` prop and the lent ending. Update the header comment (`:24-37`) to name the lent ending.
- `src/app/(frontend)/(sections)/CoverTile.tsx` -- hook-free tile. `lines` at `:62-67` holds the title `p` and the authors `p`. Put the marker before the title and add the lent line after the authors. Add a `lent` prop and update the header comment.
- `src/app/(frontend)/(sections)/CollectionList.tsx:122-138` -- renders `CoverTile` and `BookRow`, passing `ordered={t('ordered')}` (namespace `collection`). Pass `lent={(person) => root('loans.lentMarker', { person })}`. `root` is the un-namespaced translator already in the file (used for `scan.open`). Check its name there.
- `src/app/(frontend)/components/ui/classes.ts` -- `markerSlotClass`. `BookDetail.tsx:170-179` is the lent line to match (`aria-hidden` span, `bg-accent`, `text-text`).
- `src/app/(frontend)/scan/answer.ts:52-53` -- `AnswerCopy`. `:153-167` -- `inLibrary()` maps `mine.copies` (each a `CopyLine` with `loan`). `:236-247` -- `CopyText` and `copyLines()`. Extend `CopyText` with `lent: (person: string) => string`.
- `src/app/(frontend)/scan/InLibraryAnswer.tsx:19-22` -- builds `copyLines` text from `answer.copy` and `answer.copyAt`. Add `lent: (person) => t('loans.lentMarker', { person })`. Update the header comment's line examples.
- `src/app/(frontend)/scan/AnswerLayout.tsx:14,20,55-63` -- `lines?: string[]` rendered as `li.text-body.text-text`. Change it to the `{ text, lent }` shape. Only `InLibraryAnswer` passes `lines`, so nothing else changes.
- `messages/en.json`, `messages/fi.json` -- the `loans` namespace (built in 6.7). Add `lentMarker`. `tests/unit/messages.unit.spec.ts` checks that the en and fi keys match.
- `tests/unit/answer.unit.spec.ts:58-65` (`copy()` helper), `:183-212` (`inLibrary` order test), `:244-259` (`copyLines`) -- extend these with a lent copy, an ordered copy with a loan and a lent copy with no location.
- `tests/unit/collectionPage.unit.spec.ts:212-220` -- `row()` helper (with `loan: null`). `:270-295` is the rows test pattern (`getShelfRows.mockResolvedValue`, `renderPage`, `within(items[i])`). `:323-` shows how covers layout is set (`devicePrefs.mockResolvedValue({ ...DEFAULT_PREFS, layout: 'covers' })`).

## Tasks & Acceptance

**Execution:**
- `messages/en.json`, `messages/fi.json` -- add `loans.lentMarker`: "Lent · {person}" and "Lainassa · {person}".
- `src/app/(frontend)/(sections)/BookRow.tsx` -- add `lent: (person: string) => string`. A lent copy ends with `<span className="flex max-w-1/3 shrink-0 items-center gap-2 text-meta text-text">` holding the marker and a truncating text span. Update the comment.
- `src/app/(frontend)/(sections)/CoverTile.tsx` -- add `lent`. A lent copy has the marker before the title (title `p` as a flex row with the marker `shrink-0` and the title text truncating) and a `p.truncate.text-label.text-text` line "Lent · {person}" after the authors. Update the comment.
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- pass `lent` to both.
- `src/app/(frontend)/scan/answer.ts` -- `AnswerCopy.lentTo`, `inLibrary()` fills it, `CopyText.lent`, and `copyLines()` returns `AnswerLine = { text: string; lent: string | null }` (exported).
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- `lines?: AnswerLine[]`, rendered with the marker as described in Always.
- `src/app/(frontend)/scan/InLibraryAnswer.tsx` -- pass `lent` and update the comment.
- `tests/unit/answer.unit.spec.ts` -- `inLibrary` fills `lentTo` for a lent owned copy and not for an ordered copy with a loan. `copyLines` gives `{ text: 'Mökki', lent: 'Lent · Antti' }` and `{ text: '', lent: … }` for one with no location, and leaves `lent: null` otherwise.
- `tests/unit/collectionPage.unit.spec.ts` -- one test for the rows layout: a lent row ends with "Lent · Antti" and not its location, a shelved row still ends with its location, and an ordered row with a loan ends "Ordered". One test for the covers layout: a lent tile shows "Lent · Antti".
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `6-8-j11-lent-marker-on-rows-and-the-answer: done` when the story is done.

**Acceptance Criteria:**
- Given a copy with an open loan in the collection's rows layout, when it renders, then the row ends with the 8px accent marker and "Lent · {person}" in the normal text colour, in place of the location.
- Given the covers layout, when a lent copy's tile renders, then the marker is before its title and "Lent · {person}" is under it.
- Given an In library Answer for a Book with a lent copy, when it renders, then that copy's line shows the location, then the marker and "Lent · {person}".
- Given any of these surfaces, when the marker shows, then its text shows with it, and a screen reader reads "Lent · {person}".
- Given an ordered copy with an open loan, when a row, tile or Answer renders it, then it shows as ordered, with no lent marker.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 21 findings — high 0, medium 0, low 9, false 12, maybe-false 0 (edge-case layer: none)
- findings:
  - `[low]` `[patch]` Verification gap: the Answer's lent line (AC3) is never rendered, only `copyLines`' data — added a render test of `AnswerLayout` with a lent line with and without a location.
  - `[low]` `[patch]` Verification gap: AC5 (ordered copy with a loan shows no marker) is untested on a tile — added an ordered row with a loan to the covers test, asserting no "Lent".
  - `[low]` `[patch]` Verification gap (other): the separator `' ·'` makes the line's text "Mökki ·Lent · Antti" for screen readers — the location and " · " are now one text run before the marker.
  - `[low]` `[patch]` Blind: in the Answer's `flex-wrap` line the marker and its words are separate items, so the square can wrap away from "Lent · Antti" — the marker and words now sit in one `inline-flex` span.
  - `[low]` `[reject]` Blind: the lent rule (`owned && loan !== null`) is repeated in four places — a shared helper belongs in `lib/books/holdings`, which this story may not touch; the copies sit beside each other and the named trigger (a `setStatus` fix) would remove the ordered-with-loan state everywhere at once.
  - `[false]` `[reject]` Blind: the marker markup is hand-copied five times — no caller diverges; each copy is a one-line `aria-hidden` span with the same class, and no breakage is named.
  - `[low]` `[reject]` Blind: DESIGN.md does not describe the tile's "Lent · {person}" line — the tile placement is a veto point for Mika (Design Notes); the documents follow his call, raised in the run summary.
  - `[false]` `[reject]` Blind: EXPERIENCE.md says "any copy with an open loan", contradicting the ordered exclusion — an ordered copy with a loan is the 6.6 deferred `setStatus` bug, not a state the UX describes; the code matches 6.7's Book detail.
  - `[false]` `[reject]` Blind: lent tiles make the covers grid uneven — grid rows already vary (a placeholder cover has no authors line); covers stay top-aligned at one size, so the row grid is unchanged.
  - `[low]` `[reject]` Blind: a lent tile's title is in a `span`, so `getByText(title, { selector: 'p' })` would miss it — test-only; no existing test renders a lent tile through that helper.
  - `[low]` `[patch]` Blind: AC5 untested on a tile — same root cause as the verification-gap tile row; patched there.
  - `[low]` `[patch]` Blind: AC3's separator never rendered — same root cause as the verification-gap Answer row; patched there.
  - `[false]` `[reject]` Blind: spec and sprint status disagree — finalization sets the spec `done` and commits both together.
  - `[false]` `[reject]` Blind: the epic-6 context rewrite drops facts later stories need — it is this run's recompiled cache (DESIGN.md and the spine changed), sized to its 800–1500-token target; the dropped details live in the spine and the 6.5/6.7 specs, and the compiler regenerates it.
  - `[false]` `[reject]` Blind: `lent` means a formatter in `CopyText` and a string in `AnswerLine` — `copy`/`copyAt` already follow the same formatter-in, string-out pattern; no caller is confused.
  - `[false]` `[reject]` Blind: Finnish "Lainassa · {person}" vs "Lainassa: {person} · {date} alkaen" — mirrors English ("Lent · {person}" vs "Lent to {person} since {date}"); each places the name where it needs no inflection.
  - `[false]` `[reject]` Intent: the tile test does not check the marker sits before the title — the marker is `aria-hidden` markup; CLAUDE.md bars tests that restate markup or class names, and the marker renders only inside the lent branch.
  - `[false]` `[reject]` Intent: the Answer is tested only at the data level — superseded by the patched `AnswerLayout` render test.
  - `[false]` `[reject]` Intent: Finnish is never rendered in a test — a string value; CLAUDE.md bars tests that restate config; key parity is checked by `messages.unit.spec.ts`.
  - `[false]` `[reject]` Intent: `epic-6-context.md` is changed outside the story — this run's recompiled epic context, committed with the story as in 6.6 and 6.7.
  - `[false]` `[reject]` Intent: sprint status says done while the spec is in review — same as the Blind status row.

## Design Notes

**Tile placement is a veto point.** DESIGN.md puts the marker before a tile's title. EXPERIENCE.md and UX-DR21 want the borrower's name wherever the marker is. The tile does both: the marker on the title's line, and a "Lent · {person}" line under the authors. If Mika wants the name in place of the authors, that is a one-line change in `CoverTile.tsx`.

**Answer wording.** The scan mock-up reads "Mökki · lent to Antti", while the story's AC says the Answer "shows the same" as a row. The line uses the row's words, "Lent · {person}", after the location and the marker, so one string serves every surface.

```tsx
// AnswerLayout, one line
<li className="flex flex-wrap items-center gap-x-2 text-body text-text">
  {line.text}{line.text && line.lent && ' ·'}
  {line.lent && <><span aria-hidden="true" className={`${markerSlotClass} bg-accent`} />{line.lent}</>}
</li>
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass.

**Manual checks (if no CLI):**
- Run the dev server and lend a copy. Check the row at sizes s, m and l, the covers layout, select mode, phone width and wide, dark theme, and scan that book's ISBN to see the Answer.

## Auto Run Result

**Summary.** Lent copies now show who has them without opening Book detail. A lent owned copy's row ends with the 8px accent marker and "Lent · {person}" in place of its location. Its tile has the marker before the title and a "Lent · {person}" line under the authors. On the In library Answer its line reads "{location} · ■ Lent · {person}", or the marker and "Lent · {person}" alone with no location. An ordered copy with an open loan still shows as ordered everywhere, as Book detail does. No new reads: the loan already came with holdings.

**Files changed.**
- `src/app/(frontend)/(sections)/BookRow.tsx` -- the lent ending (`lent` prop).
- `src/app/(frontend)/(sections)/CoverTile.tsx` -- the marker before the title and the lent line (`lent` prop).
- `src/app/(frontend)/(sections)/CollectionList.tsx` -- passes `lent` to rows and tiles.
- `src/app/(frontend)/scan/answer.ts` -- `AnswerCopy.lentTo`, `CopyText.lent`, `AnswerLine`; `copyLines()` returns `AnswerLine[]`.
- `src/app/(frontend)/scan/AnswerLayout.tsx` -- renders a lent line with the marker, kept with its words.
- `src/app/(frontend)/scan/InLibraryAnswer.tsx` -- passes `lent`.
- `messages/en.json`, `messages/fi.json` -- `loans.lentMarker`.
- `tests/unit/answer.unit.spec.ts` -- `lentTo` and lent `copyLines`.
- `tests/unit/answerLayout.unit.spec.ts` -- new: the Answer's lent line as read.
- `tests/unit/collectionPage.unit.spec.ts` -- lent rows (with and without a location, select mode), ordered with a loan, lent and ordered tiles.
- `_bmad-output/implementation-artifacts/epic-6-context.md` -- recompiled (DESIGN.md and the spine had changed).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 6.8 done.

**Review.** One pass found 21 findings: 9 low, 12 false. The edge-case layer reported none.
- Patched (low, four entries): the Answer's marker kept with its words; the separator reads "Mökki · Lent · Antti"; an `AnswerLayout` render test (AC3); an ordered tile with a loan shows no marker (AC5).
- Deferred: none.
- Rejected, with reasons in the triage log: a shared lent-rule helper (would touch `lib/books/holdings`); a `LentMarker` component; DESIGN.md not yet describing the tile line (waits on Mika's veto); EXPERIENCE.md's "any copy" wording; uneven tile heights; the `selector: 'p'` test trap; the status mismatch; the trimmed epic context; `lent` naming; Finnish separators; markup and Finnish string tests (CLAUDE.md, Tests).

**Follow-up review:** not recommended (`false`). Patched this pass: high 0, medium 0, low 4.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (48 existing warnings in migrations).
- `npm run test:unit`: 938 passed in 64 files.
- Prettier: the changed files are clean.
- Matrix audit: lent row, lent with no location, shelved, ordered with a loan, lent tile and select mode are covered by `collectionPage.unit.spec.ts`. The Answer rows are covered by `answer.unit.spec.ts` and `answerLayout.unit.spec.ts`. The Finnish row is a string value, so it is covered only by en/fi key parity (CLAUDE.md bars tests that restate config). All ran and passed.
- No schema change. Integration tests not run: no `lib` or server code changed.
- Not run in a browser.

**Residual risks.**
- **Not checked in a browser:** sizes s, m and l, covers, select mode, phone and wide, dark theme, and the Answer after scanning a lent book.
- **Tile placement is a veto point for Mika.** The name sits on its own line under the authors. Putting it in place of the authors is a one-line change in `CoverTile.tsx`, and DESIGN.md's Cover tile row should then record whichever he picks.
- **Answer wording** follows the row ("Lent · Antti") rather than the scan mock-up ("lent to Antti").
