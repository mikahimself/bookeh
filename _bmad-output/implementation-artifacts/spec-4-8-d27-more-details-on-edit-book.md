---
title: 'Story 4.8: [D27] More details on Edit book'
type: 'feature'
created: '2026-10-21'
status: 'done'
baseline_revision: 'bfc40c4a68048a5838d328066f63f4eff6d919b0'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Edit book (4.7) has Save, the per-Book draft and field marks, but no field. Series numbers, years, descriptions and every other fetched value still cannot be fixed (FR-13).

**Approach:** A "More details" Link on Edit book unfolds the fields in place, pre-filled with the viewer's effective values: title, subtitle, authors, series, number in series, publisher, year, language, pages and description. On the viewer's own private Book, ISBN and system genres are editable as well. On a shared Book, system genres are editable for the admin and read-only for everyone else. Themes are shown and never edited. Each field writes into the 4.7 draft through `setEdit` and shows the mark a rejected Save left on it. The page supplies the effective values, the editability flags and, when genres are editable, the system genre list from a new reader `listGenres(ctx)`.

## Boundaries & Constraints

**Always:** The draft becomes state, restored from `sessionStorage` once mounted as in 4.7. Every change goes `setEdit(draft, key, value, effective)` → state → `writeDraft`, so the draft holds only keys that differ from the effective value. A key that returns to its effective value leaves the draft. Value mapping: a text field's `''` is `null` (title stays `''`, so a blank title meets `editBook()`'s `VALIDATION`). ISBN `''` is `undefined` (dropped), because ISBN is never removed. Number fields (number in series, year, pages) keep digits only: `''` is `null`, otherwise an integer. Authors are one text field per author plus an "Add author" Link; the draft value is the non-blank trimmed names in order, `[]` when none. Genres are an option list of the system genres; the draft value is the chosen ids sorted ascending, compared with the effective ids sorted the same way. The page decides editability: ISBN when `visibility === 'private'`; genres when private or `canEditShared(ctx.user)`. Read-only genres and themes are lines joined ", ", absent when empty. Editing a field clears its mark. A mark's message is `errors.<CODE>` for `INVALID_ISBN` and `TOO_LONG`, and `editBook.checkField` for `VALIDATION`. "More details" starts unfolded when the restored draft is not empty. `listGenres(ctx)` reads `genres` through the gateway with the viewer's access (no system privileges) and returns `Named[]` with `genreName()` in the viewer's language, sorted with `Intl.Collator(language)`. Interface text in English and Finnish, tokens only.

**Never:** No change to `editBook`, `editBookAction`, `requireOwnBook` or the spine. No author or series suggestions (Story 5.9, AD-7). No copy status or location (4.9), no cover controls (4.14), no tags, user genres or themes editing (Epic 9). No client-side validation beyond the digit filter. No Playwright test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unfold | tap "More details" on a shared Book (non-admin) with year 2014 | the fields show the effective values; no ISBN field; genres read-only; themes shown | No error expected |
| Edit a number | year 2014 → "2016", Save | `editBookAction({ bookId, edits: { year: 2016 } })` | No error expected |
| Edit back | year 2014 → 2016 → 2014 | draft is empty, no "Discard changes?" on X | No error expected |
| Authors | ["A"] → change to "B", add "C", Save | `edits: { authors: ['B', 'C'] }` | No error expected |
| Rejected field | Save answers `VALIDATION` with `fields: { title: 'VALIDATION' }` | "Check this field." under Title, the fields unfolded; typing in Title removes it | the `VALIDATION` toast too (4.7) |
| Private Book | own private Book, genres [] and options [Fiction(3), History(5)] | ISBN field; tap Fiction, Save → `edits: { genres: [3] }` | `INVALID_ISBN` shows under ISBN |

</intent-contract>

## Code Map

- `src/app/(frontend)/books/[bookId]/edit/EditBookScreen.tsx` -- 4.7 screen. `draft` is a read-only `useMemo` over `readDraft`; `setMarks` exists, the marks are unread. Here `draft` becomes `edits ?? restored` state and the marks are read; the Save, guard and Discard logic stays unchanged.
- `src/app/(frontend)/books/[bookId]/edit/draft.ts` -- `setEdit`, `writeDraft`, `isEmpty`. Reuse as is.
- `src/app/(frontend)/books/[bookId]/edit/page.tsx` -- has `book: EffectiveBook` and `ctx`. It adds the effective values, the flags and the genre options to the props.
- `src/lib/books/effectiveBook.ts:20` -- `EffectiveBook` (`authors: Named[]`, `series: Named | null`, `genres: Named[]`, `themes: string[]`, `visibility`, `isbn13`). `Named` is exported here. `genreName()` is in `src/lib/books/genreName.ts`.
- `src/lib/catalogue/editBook.ts:21` -- `BookEdits`; read-only. It already validates and normalises; refused keys are marked `VALIDATION`.
- `src/access/roles.ts` -- `canEditShared`; importable from frontend server code.
- `src/lib/payload/gateway.ts:41` -- `gateway.find(ctx, { collection: 'genres', pagination: false, depth: 0 })`; `genreAccess.read` is `signedIn`.
- `src/app/(frontend)/components/TextField.tsx` -- `TextField` (label, `error`) and `fieldClass`. Description needs a multi-line variant.
- `src/app/(frontend)/components/Link.tsx` -- `ActionLink` for "More details" and "Add author".
- `src/app/(frontend)/scan/NotFoundForm.tsx:61` -- a mark-to-message pattern.
- DESIGN.md Option list -- a chosen value is `text` with the 8px `accent` marker before it; the others are `text-muted`. No fill.
- `tests/unit/editBookScreen.unit.spec.ts` -- jsdom harness with the action, toast and router mocked; `open()` renders the screen with props.
- `messages/en.json`, `messages/fi.json` -- `editBook.*` namespace.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/listGenres.ts` -- `listGenres(ctx): Promise<Named[]>` as in Always. -- options for the genre picker.
- `src/app/(frontend)/components/TextField.tsx` -- add `TextAreaField` with the same label, underline and error markup. -- description.
- `src/app/(frontend)/books/[bookId]/edit/MoreDetails.tsx` -- client: the Link and the unfolded fields, from props `effective`, `draft`, `marks`, `isbnEditable`, `genreOptions: Named[] | null` (null = read-only), `genres: Named[]`, `themes`, and `onEdit(key, value)`. Author rows are local state seeded from the draft or the effective names. -- the fields.
- `src/app/(frontend)/books/[bookId]/edit/EditBookScreen.tsx` -- the draft as state; `edit(key, value)` = `setEdit` + `writeDraft` + clear that key's mark; renders `MoreDetails` under the header. Update the doc comment. -- wiring.
- `src/app/(frontend)/books/[bookId]/edit/page.tsx` -- pass `effective` (the `BookEdits` keys: author names, series name, genre ids sorted, `isbn13`), `genres`, `themes`, `isbnEditable` and `genreOptions` (`listGenres` only when genres are editable). -- the role rules.
- `messages/en.json`, `messages/fi.json` -- `editBook.moreDetails` "More details" / "Lisätiedot", `editBook.addAuthor` "Add author" / "Lisää tekijä", `editBook.checkField` "Check this field." / "Tarkista tämä kenttä.", and `editBook.field.*` for title, subtitle, author, series, seriesIndex, publisher, year, language, pages, description, isbn, genres and themes (fi: Nimeke, Alaotsikko, Tekijä, Sarja, Numero sarjassa, Kustantaja, Vuosi, Kieli, Sivuja, Kuvaus, ISBN, Lajityypit, Teemat). -- English and Finnish.
- `tests/unit/editBookScreen.unit.spec.ts` -- one case per matrix row: Unfold, Edit a number, Edit back, Authors, Rejected field, Private Book. -- guards the story's ACs.

**Acceptance Criteria:**
- Given Edit book, when I tap "More details", then title, subtitle, authors, series, number in series, publisher, year, language, pages and description unfold in place, pre-filled with my effective values.
- Given I edited fields and Save succeeds, when `editBook()` runs, then authors and series are matched through `findOrCreateByName()` (unchanged), and only the changed keys were sent.
- Given my private Book, then ISBN and system genres are editable; given a shared Book, then system genres are editable for the admin and read-only for others, and no ISBN field shows; themes are always shown read-only when present.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 26 findings — high 0, medium 3, low 19, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` (verification) No case returns a two-genre set to its effective order, so dropping `.sort(ascending)` would go unnoticed (Always rule, "only the changed keys"). Fix: a case with effective genres [3, 5] toggles Fiction off and on and finds no stored draft.
  - `[low]` `[reject]` (verification) No test runs the page's editability flags or `effectiveEdits`. Covering it needs a page-render harness, more than a direct correction; `editBook.int.spec.ts` enforces the same role rules on the server, so a wrong flag cannot write bad data.
  - `[medium]` `[patch]` (verification) Emptying the ISBN of a private Book that has one snaps the stored ISBN back, because the dropped key falls back to `effective.isbn13`. Fix: the ISBN input keeps its own text in local state; the draft still drops `''`.
  - `[medium]` `[patch]` (blind) ISBN snaps back when cleared. Grouped with the ISBN entry above.
  - `[low]` `[patch]` (blind) `inputMode="numeric"` on ISBN hides `X` (ISBN-10 check digit) on phone keypads. Fix: removed.
  - `[low]` `[reject]` (blind) The digit filter mangles a fractional series number (Finna stores `2,5` as 2.5). Only when editing inside such a value, and the result shows on screen; allowing decimals means changing `editBookAction`'s integer rule (4.7), more than a direct correction.
  - `[low]` `[patch]` (blind) Number fields have no length cap; long digit strings lose precision or render as `1e+21`. Fix: `maxLength={9}` on the number fields.
  - `[low]` `[reject]` (blind) Whitespace-only changes make the draft dirty. Trimming on input would block typing spaces between words; comparing normalised values adds a branch to `setEdit`, and a leftover trailing space is rare.
  - `[false]` `[reject]` (blind) An over-long field fails with no mark. Disproof: `runAction` maps a Payload `ValidationError` to `fields` by path (`src/lib/errors.ts:72`), so the field shows "Check this field."; the unused `TOO_LONG` branch is harmless.
  - `[low]` `[patch]` (blind) Tapping "More details" unmounts the focused Link, so focus falls to `<body>`. Fix: a click-unfold focuses Title.
  - `[low]` `[reject]` (blind) The genre group's message has no `aria-describedby` and no danger styling. A genre mark needs a refused genre edit, which the UI never offers (read-only for non-admins on shared Books).
  - `[low]` `[reject]` (blind) The page's role rules are untested. Same as the second verification row.
  - `[false]` `[reject]` (blind) The story was built despite `oversized`. Disproof: Mika dismissed acting on `oversized` (4.15 owner follow-up, 2026-10-21; 4.7 triage log).
  - `[low]` `[reject]` (blind) The authors mark sits under row 0, and blank rows cannot be removed. Blank rows are dropped from the draft; an authors mark needs a blank name, which the client already filters.
  - `[low]` `[patch]` (blind) `open()` in the test spreads `shared` twice. Fix: the first spread removed.
  - `[low]` `[reject]` (edge) A restored draft with non-array `authors` or `genres` crashes the fields. Only corrupted storage reaches it; 4.7 rejected the same class, and Discard clears it.
  - `[low]` `[reject]` (edge) A mark on a key with no visible field gives no hint. The draft gets `isbn13` or `genres` only from fields the page offered, so this needs corrupted storage or a visibility change mid-draft; the `VALIDATION` toast still shows.
  - `[medium]` `[patch]` (edge) ISBN snaps back when cleared. Grouped with the ISBN entry above.
  - `[low]` `[reject]` (edge) A stored decimal number turns into another number on a keystroke. Same as the fractional series number row.
  - `[low]` `[patch]` (edge) Digit strings beyond the safe integer range. Grouped with the length cap above.
  - `[low]` `[reject]` (edge) Whitespace-only edits make the draft dirty. Same as the blind row.
  - `[low]` `[reject]` (edge) ISBN and genres are editable on any private Book, not only the viewer's own; an admin holding another user's private Book would see them and get `NOT_FOUND` on Save. It needs a copy of someone else's private Book, which saves don't create (lookup matches only the viewer's own private Books); the fix needs `createdBy` on the page, more than a direct correction.
  - `[low]` `[reject]` (intent) The ACs' effective values and role rules are tested only through hand-built props. Same as the second verification row.
  - `[false]` `[reject]` (intent) "Themes are always shown" could mean rendered when empty. Disproof: the AC contrasts shown with editable, and EXPERIENCE.md drops empty classification kinds ("empty kinds are absent").
  - `[false]` `[reject]` (intent) A shared Book could show its ISBN read-only. Disproof: the AC's field list has no ISBN, and only adds it as editable on a private Book; nothing asks for a read-only ISBN.
  - `[low]` `[reject]` (intent) The ISBN flag uses visibility, not the creator. Same as the last edge row.

## Design Notes

Authors are rows rather than one comma-separated field, because names can hold commas ("Smith, Jr.") and `BookEdits.authors` is already a list. Clearing a row removes that author. The rows stay local state, so a blank row being typed into does not drop out of the screen; only the derived names go into the draft.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including the new `editBookScreen` cases
- `npm run test:int` -- expected: all pass (unchanged)

**Manual checks (if no CLI):**
- In dev, `/books/<held id>/edit`: "More details" unfolds the fields, a changed year saves and shows on reopen.

## Auto Run Result

Status: done

**Summary:** Edit book now has "More details". The Link unfolds title, subtitle, authors (one row each, plus "Add author"), series, number in series, publisher, year, language, pages and description, pre-filled with the viewer's effective values. On the viewer's own private Book, ISBN and system genres are editable; on a shared Book, genres are editable for the admin and read-only for others, with no ISBN field. Themes are a read-only line. Each change goes through `setEdit` into the 4.7 draft, so only changed keys are saved, and editing a field clears the mark a rejected Save left on it. The genre options come from a new reader, `listGenres(ctx)`.

**Files changed:**
- `src/lib/catalogue/listGenres.ts`: the system genres in the viewer's language and order, read with the viewer's access.
- `src/app/(frontend)/components/TextField.tsx`: a shared `Field` wrapper and the new `TextAreaField`.
- `src/app/(frontend)/books/[bookId]/edit/MoreDetails.tsx`: the Link and the fields.
- `src/app/(frontend)/books/[bookId]/edit/EditBookScreen.tsx`: the draft as state, `edit()`, marks read.
- `src/app/(frontend)/books/[bookId]/edit/page.tsx`: effective values, ISBN and genre editability, genre options.
- `messages/en.json`, `messages/fi.json`: `editBook.moreDetails`, `addAuthor`, `checkField`, `field.*`.
- `tests/unit/editBookScreen.unit.spec.ts`: 8 new cases (one per matrix row, plus the cleared ISBN and genres toggled back).
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: 4.8 is done.

**Review findings:** 26 in total (3 medium, 19 low, 4 false).
- 6 patch entries: the ISBN snapping back when cleared (medium, 3 findings); no numeric keypad on ISBN; a 9-digit cap on number fields (2 findings); focus to Title on unfold; a genre toggle-back test; the doubled spread in the test helper.
- 0 deferred.
- 17 rejected, each with its reason in the Review Triage Log:
  - 4 false: the over-long field's missing mark; `oversized`; themes rendered when empty; a read-only ISBN on shared Books.
  - 13 low: fractional series numbers (2 findings); whitespace-only edits (2); the page's role rules tested only through props (3); another user's private Book (2); corrupted stored drafts; marks on fields that aren't shown; the genre group's message wiring; the authors mark under row 0 and blank rows.

**Follow-up review recommended:** false. One medium entry was patched (patched by verdict: high 0, medium 1, low 5).

**Verification:**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. The warnings are pre-existing ones in `src/migrations`, plus the same ones again from a parallel worktree, `.claude/worktrees/story-4-13-four-corner-crop`.
- `npm run test:unit`: 722 passed.
- `npm run test:int`: 449 passed.
- Not checked in a browser.

**Residual risks:**
- The fields, the option list and the focus on unfold still need a look in dev at phone and wide widths.
- A fractional series number (Finna's `2,5`) turns into another number if edited inside the field; `editBookAction` only accepts integers.
- Until the seeded genres arrive (Story 9.10), the genre option list is likely empty.
