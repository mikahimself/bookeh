---
title: '10.3 Acquired date and price on copies'
type: 'feature'
created: '2026-11-06'
status: 'done'
baseline_revision: '74afec02343db410d9c0f7b4708c1f16cc4a2d5e'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-10-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A copy records nothing about when it was got or what it cost, so Stats (10.5) cannot count spending or find the Book that has waited longest, and Book detail cannot show or fix either (FR-55).

**Approach:** Add `acquiredAt` (required calendar date) and `price` (optional euro cents) to `copies` with a back-filling migration; set the date in `createCopy()` and `receiveCopy()` (its restore puts the old date back); add `setCopyPurchase()` in `lib/copies`; carry both on `CopyLine`; show the muted "Acquired {date} · €{price}" line under each copy in Book detail with a Picker that edits both.

## Boundaries & Constraints

**Always:** PRD FR-55, FR-26, FR-48; EXPERIENCE.md → Book detail (Your copies) and the Picked section of `mockups/reading-options.html`; DESIGN.md "Reading dates line" (meta, `text-muted`, Links in `text`). AD-8 (purchase data on `copies` only), AD-13 (committed migration + regenerated types, never migrate the dev database, push off on `bookeh_test`), AD-18 (`lib/copies` the only `copies` writer), AD-20 (Received's restore). Calendar dates: strict `YYYY-MM-DD` in, 12:00 UTC stored, read back by UTC date, today = `helsinkiToday()`. Dates and EUR formatted by next-intl. The collection's `beforeValidate` enforces the date rule (back office included); `price` is a whole number 0–9 999 999. Every new string in `en.json` and `fi.json`. The spine is reconciled in the same commit.

**Never:** Change Edit book, the save flow's screens, Answer facts, select mode or the shelf rows' look. No toast and no Undo on a purchase edit. No stats readers (10.5). No price on `user-books`. No committed Playwright spec.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Migration | copies created `2026-03-01T22:30Z` and `2026-03-02T09:00Z` | both `acquiredAt` `2026-03-02T12:00Z` (Helsinki day); `price` null | — |
| Save | Add to library / any `createCopy()` | `acquiredAt` = Helsinki today, `price` null | — |
| Received | ordered copy acquired 2026-01-10, received today | owned, `acquiredAt` today | Undo → ordered, no location, 2026-01-10 |
| Line, priced owned | owned, 2026-10-12, 2490 | "Acquired 12 Oct 2026 · €24.90" (fi "Hankittu 12.10.2026 · 24,90 €"); date and price are Links | — |
| Line, ordered, unpriced | ordered, 2026-10-12, null | "Ordered 12 Oct 2026 · Add price" | — |
| Picker save | date 2026-09-01, price "24,90" / "24.90" / "24" / "" | stored 2026-09-01 and 2490 / 2490 / 2400 / null; Picker closes; line follows; no toast | Failure: `afterAction` |
| Picker rejections | date empty or after today; price "abc", "-1", "1,234", "100000" | message under that field; Picker stays open; nothing sent | Server field error under its field (`errors.VALIDATION`) |
| Service | `setCopyPurchase` on another user's / gone copy; date `2026-02-30` or future; price 1.5, -1, 10 000 000 | `NOT_FOUND`; `VALIDATION` on `acquiredAt` / `price`; nothing written | — |

</intent-contract>

## Code Map

- `src/collections/Copies.ts` -- add `acquiredAt` (`date`, `required`, `defaultValue` `noonUtc(helsinkiToday())` so back-office and test-fixture inserts still work, `admin.date.pickerAppearance: 'dayOnly'`) and `price` (`number`, `min: 0`, `max: 9_999_999`, whole-number validate). Extend its `beforeValidate` with the date rule: normalise to `noonUtc(readingDate(value))`, reject a non-date or a day after today with a `ValidationError` on `acquiredAt` — same shape as `validateReadingDates` in `UserBooks.ts:16`.
- `src/collections/UserBooks.ts:50` -- `wholeNumber` validator; move it to `src/fields/wholeNumber.ts` and import it in both collections.
- `src/fields/readingDates.ts` -- `helsinkiToday`, `isCalendarDate`, `readingDate`, `noonUtc`; reused as is by copies.
- `src/lib/copies/createCopy.ts:34` -- add `acquiredAt: noonUtc(helsinkiToday())` to the insert data.
- `src/lib/copies/receiveCopy.ts` -- find selects `acquiredAt` too; update writes today; `restoreOrdered(rtx, copyId, previous)` writes `status: 'ordered', location: null, acquiredAt: previous`. Doc comment updated.
- `src/lib/copies/updateCopy.ts` -- add `setCopyPurchase(ctx, copyId, { acquiredAt?, price? })` beside `setNote`, via `requireOwnCopy`; `acquiredAt` must be `isCalendarDate` and ≤ today, `price` `null` or an integer 0–9 999 999, else `DomainError('VALIDATION', { fields: { <field>: 'VALIDATION' } })` before any write; only given keys are written. No Undo.
- `src/lib/books/holdings.ts:13,80` -- `CopyLine` gains `acquiredAt: string` (`readingDate(copy.acquiredAt)`, UTC day) and `price: number | null`; doc comment.
- `src/app/(frontend)/(sections)/actions.ts` -- `setCopyPurchaseAction({ copyId, acquiredAt, price })` → `ActionResult<null>` over `copyInput`; types checked (string; number or null), never repaired.
- `src/app/(frontend)/(sections)/price.ts` (new) -- pure `parsePrice(text): number | null | 'invalid' | 'tooLarge'`: trim, drop spaces/NBSP and a leading or trailing `€`; empty → `null`; `^\d+([.,]\d{1,2})?$` → cents; > 9 999 999 → `'tooLarge'`; otherwise `'invalid'`.
- `src/app/(frontend)/(sections)/PurchasePicker.tsx` (new) -- copy of `ReadingDatesPicker.tsx`'s structure: `PickerFrame` titled with the Book's title, a Date field (label "Acquired", or "Ordered" on an ordered copy; `max` today) and a Price field (`inputMode="decimal"`, seeded with the stored price as `format.number(cents / 100, { minimumFractionDigits: 2, useGrouping: false })`, empty when none); client rejections under fields; server field errors under `acquiredAt` / `price`; reset at each open; result to `onSettled` after the close.
- `src/app/(frontend)/(sections)/CopyLine.tsx` -- new `CopyPurchase({ copyId, status, acquiredAt, price, title })`: the muted line with `ActionLink`s for the date and the price / "Add price", both opening `PurchasePicker`; `onSettled` → `afterAction(result)` (refresh re-renders the line) and focus to the copies' section, as `MoveCopy`.
- `src/app/(frontend)/(sections)/BookDetail.tsx:155` -- mount `<CopyPurchase …>` directly under the copy's first line (before the lent line); doc comment names it.
- `src/app/(frontend)/components/useFormatter` idiom -- client dates `format.dateTime(new Date(\`${d}T12:00:00Z\`), { dateStyle: 'medium' })` as `ReadAndRating.tsx`; EUR `format.number(cents / 100, { style: 'currency', currency: 'EUR' })`.
- `src/migrations/` -- `DATABASE_PUSH=false npm run payload -- migrate:create copy_purchase --skip-empty`; hand-edit `up`: add `acquired_at` nullable, `UPDATE copies SET acquired_at = ((created_at AT TIME ZONE 'Europe/Helsinki')::date + time '12:00') AT TIME ZONE 'UTC'`, then `SET NOT NULL`; `price` nullable `numeric`. `down` drops both. Regenerate `src/payload-types.ts`.
- `tests/int/tagsMigration.int.spec.ts` -- pattern for a migration test: `down`/`up` inside a rolled-back `payload.db.drizzle.transaction`.
- `tests/int/receiveCopy.int.spec.ts` -- existing Received cases; add the Undo-date case here.
- Unit fixtures building `CopyLine` (`answerFacts`, `heldAnswer`, `answer`, `loansPage` unit specs, `tests/helpers/collectionPage.ts` if it builds one) -- add the two fields; `loansPage.unit.spec.ts:82` mocks the actions module (add the new action).
- `ARCHITECTURE-SPINE.md:308` (Dates row: primitives "shared by the collection and books services") and `:466` -- name copies as a user of the primitives; add the `setCopyPurchaseAction` contract line.

## Tasks & Acceptance

**Execution:**
- [x] `src/fields/wholeNumber.ts`, `src/collections/UserBooks.ts` -- move `wholeNumber` out; no behaviour change.
- [x] `src/collections/Copies.ts` -- the two fields and the date rule in `beforeValidate`.
- [x] `src/migrations/*`, `src/migrations/index.ts`, `src/payload-types.ts` -- generate, hand-edit the back-fill, regenerate types; migrate `bookeh_test` only.
- [x] `src/lib/copies/createCopy.ts`, `receiveCopy.ts`, `updateCopy.ts` -- today on insert and Received, the restore's previous date, `setCopyPurchase()`.
- [x] `src/lib/books/holdings.ts` -- the two `CopyLine` fields.
- [x] `src/app/(frontend)/(sections)/actions.ts` -- `setCopyPurchaseAction`.
- [x] `src/app/(frontend)/(sections)/price.ts`, `PurchasePicker.tsx`, `CopyLine.tsx`, `BookDetail.tsx` -- parser, Picker, line, mount.
- [x] `messages/en.json`, `messages/fi.json` -- strings per Design Notes.
- [x] `tests/int/copyPurchaseMigration.int.spec.ts` (new) -- one case: rows inserted after `down` with `created_at` on both sides of a Helsinki midnight get their Helsinki day at 12:00 UTC after `up`, rolled back.
- [x] `tests/int/receiveCopy.int.spec.ts` -- one case: Received sets today; Undo restores ordered and the previous `acquiredAt`.
- [x] `tests/int/copyWrites.int.spec.ts` -- one case for `setCopyPurchase()`: stores date and price and a cleared price; another user's copy and the admin get `NOT_FOUND`; `2026-02-30`, a future day, 1.5, -1 and 10 000 000 are `VALIDATION` on their field with the row unchanged (guards FR-48 and AD-18).
- [x] `tests/unit/price.unit.spec.ts` (new) -- one table test of `parsePrice` (the matrix's accepted and rejected inputs).
- [x] Unit fixtures and action mocks -- add the fields / action so the full unit suite passes.
- [x] `ARCHITECTURE-SPINE.md` -- Dates row and action contract line.
- [x] Uncommitted `tests/e2e/purchase.walk.spec.ts` -- phone (390px) walk: the line on a fresh owned copy reads "Acquired {today} · Add price" and an ordered copy's "Ordered {date} · Add price"; Picker opens titled with the Book; price "24,90" saves and the line shows "€24.90", then "24.90", "24" and "" store 2490, 2400 and none; an empty and a future date and "abc", "-1", "100000" are rejected under their fields with nothing stored; Esc cancels; result under `## Auto Run Result`.

**Acceptance Criteria:**
- Given an existing database, when the migration runs, then every copy has `acquiredAt` = its `createdAt`'s `Europe/Helsinki` day at 12:00 UTC and no price, and the migration and regenerated types are committed.
- Given a save (`createCopy()`), when the copy is created, then `acquiredAt` is Helsinki today; given Received, then it is that day, and its Undo restores ordered and the previous date.
- Given `setCopyPurchase()`, when called on a copy that is not the viewer's (the admin included), then `NOT_FOUND`; when the date is not a real day or is after today, or the price is not a whole number in 0–9 999 999, then `VALIDATION` on that field and nothing is written.
- Given Book detail with copies, when it renders, then each copy shows the muted line per the matrix, its date and price (or "Add price") as Links opening one Picker; Save stores both with no toast or Undo and the line follows.
- Given Edit book and the save flow, when used, then they behave as before (AD-11).
- Given the UI in Finnish, then every new string is translated and the price reads as Finnish EUR.
- Given the spine, when the story is committed, then its Dates row and purchase contract match the code.

## Spec Change Log

## Review Triage Log

### 2026-11-06 — Review pass
- verdicts: 24 findings — high 0, medium 2, low 16, false 6, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: Edit book's ordered→owned (`setStatus`) keeps the order date while Received sets today — real divergence, but the intent says "Edit book and the save flow are unchanged" (AD-11); the date is editable from the copy line.
  - `[low]` `[patch]` Blind: `detail.priceTooLarge` hard-codes the amount — now an ICU currency argument fed `maxPrice / 100`.
  - `[low]` `[patch]` Blind: English `enterPrice` example uses the Finnish decimal — English now says "24.90".
  - `[low]` `[patch]` Blind: `parsePrice` doc says thousands separators are invalid while spaces anywhere are dropped (as the spec asks) — doc comment corrected.
  - `[low]` `[patch]` Blind: a lone "€" parses to `null` and clears a stored price — now `'invalid'`; row added to the unit table.
  - `[low]` `[reject]` Blind: "Add price" does not focus the Price field — needs a parameter through `PickerFrame`; not worth it under the low rule (10.2 rejected the same for reading dates).
  - `[low]` `[reject]` Blind: Picker shares the Book title with the sheet; date Link name is a bare date — the title is EXPERIENCE.md's ("titled with the Book's title"); the line around the Link names it; noted for the walkthrough.
  - `[false]` `[reject]` Blind: `acquiredDate` re-checks the stored date on every update and can fail unrelated writes — every stored value passed the same check when written and dates only fall further into the past; the re-written value is identical. No failing write exists.
  - `[low]` `[reject]` Blind: server field errors show `errors.VALIDATION`, not "Can't be in the future." — only with a device clock a day off; mapping adds branches; 10.2 does the same.
  - `[low]` `[patch]` Blind: dead fallback in `holdings.ts` — now `copy.acquiredAt.slice(0, 10)`, the loan idiom beside it.
  - `[low]` `[patch]` Blind: `readingDates.ts` header names only reading — comment names copies too.
  - `[low]` `[reject]` Blind: Save reuses `detail.saveDates` — both read "Save"; no generic key exists, and a reword would show at once in both Pickers.
  - `[low]` `[patch]` Blind: back office edits raw cents with a bare "Euro cents." hint — description now "Euro cents: 2490 is €24.90."
  - `[low]` `[reject]` Edge: Received's Undo overwrites a date edited after Received — needs Received, a Picker save and Undo within the toast's seconds; a guard adds a read and a branch.
  - `[low]` `[reject]` Edge: Edit book ordered→owned keeps the order date — same as the first Blind row; intent keeps Edit book unchanged.
  - `[low]` `[reject]` Edge: `setCopyPurchase` with neither key runs an empty update — no caller sends neither (the action requires both); guard for an unreachable case.
  - `[low]` `[reject]` Edge: Picker open across Helsinki midnight keeps the old today — the deliberate LendPicker rule (Epic 6 retro decision 4), as 10.2.
  - `[medium]` `[patch]` Verification: `createCopy()` storing Helsinki today has no assertion (AC 2) — pre-verified; `expectCopy` in `createCopy.int.spec.ts` now asserts it.
  - `[medium]` `[patch]` Verification: the collection's date hook and price validators are never reached with bad values — pre-verified; guards the spine's "back office included" rule; one `rejectedPaths` case added to `copies.int.spec.ts`.
  - `[false]` `[reject]` Verification (other): UI only exercised by the uncommitted walk — the spine's Tests row and CLAUDE.md put it there; a known state, not a defect.
  - `[false]` `[reject]` Intent: UI surface covered only by the walk — descriptive; the intent itself assigns it to an uncommitted phone walk.
  - `[false]` `[reject]` Intent: collection hook, schema default and lenient parser go beyond the intent — the spine's Dates row requires the collection check; the default is the Design Notes' choice; the parser accepts the three named forms.
  - `[false]` `[reject]` Intent: regenerated types and snapshot not in the reviewed diff — excluded from the review diff as generated; both are in the change set and committed.
  - `[false]` `[reject]` Intent: the "So that" (Stats) is not built — stories 10.5/10.6; the ACs ask only for the data.

## Design Notes

The collection `defaultValue` for `acquiredAt` exists so back-office creates and the 30-odd direct test inserts stay valid; `createCopy()` still sets the date itself, as the spine says. The migration cannot use the generated `ADD COLUMN … NOT NULL` on a non-empty table, hence the three-statement back-fill; the snapshot JSON stays as generated.

Received's restore puts back the date read before the update; it closes over that string only.

Messages, en / fi:
- line: "Acquired {date}" / "Hankittu {date}"; "Ordered {date}" / "Tilattu {date}"; "Add price" / "Lisää hinta"; the price is the formatted EUR amount, joined by " · ".
- Picker: title = Book's title; "Acquired" / "Hankittu" (or "Ordered" / "Tilattu"); "Price (€)" / "Hinta (€)"; "Save" / "Tallenna" (reuse `detail.saveDates` wording or a new key).
- errors: "Enter a date." / "Anna päivämäärä."; reuse `detail.dateInFuture`; "Enter euros, like 24.90." / "Anna hinta euroina, esim. 24,90."; "At most €99,999.99." / "Enintään 99 999,99 €."

## Verification

**Commands:**
- `npm run typecheck` -- passes.
- `npm run test:unit -- --maxWorkers=2` -- full suite passes (`CopyLine` fixtures changed).
- `npm run test:int -- copyPurchaseMigration receiveCopy createCopy copies copyWrites setCopyPurchase` -- passes on `bookeh_test`, push disabled.
- CI-style drift check (`migrate:create ci_drift_check --force-accept-warning`, compare snapshot ignoring `id`/`prevId`, remove the temp files) -- no drift.
- scoped `npx eslint` on changed files, `git diff --check` -- clean.
- `npx playwright test tests/e2e/purchase.walk.spec.ts` -- walk passes; not committed.

## Auto Run Result

`npx playwright test tests/e2e/purchase.walk.spec.ts` (uncommitted, fixture e2e server on `bookeh_test`, 390px): passed. A fresh owned copy reads "Acquired {today} · Add price" and an ordered one "Ordered Oct 12, 2026 · Add price"; the Picker opens with the Book's title, Acquired = today and an empty Price; "24,90" saves 2490 with the line "€24.90" and no toast; "24.90", "24" and "" store 2490, 2400 and null; an empty and a future date and "abc", "-1", "100000" show "Enter a date.", "Can't be in the future.", "Enter euros, like 24.90." and "At most €99,999.99." under their field with nothing stored; Esc cancels with nothing stored; a date edit to 2026-09-01 stores and shows it. The Picker shares its accessible name with Book detail's sheet (both the Book's title), so the walk tells them apart by the Price field.

Re-run after the review patches: passed (13.6 s), with the English hint now "Enter euros, like 24.90.".

Status: done

**Summary.** Copies carry `acquiredAt` (required calendar date, 12:00 UTC) and `price` (optional whole euro cents, 0–9 999 999). The migration back-fills each existing copy with its `created_at`'s Europe/Helsinki day. `createCopy()` stamps Helsinki today; `receiveCopy()` stamps the day of Received and its Undo restores ordered and the previous date. `setCopyPurchase()` in `lib/copies` edits both, gated to the viewer's copy (admin included), no Undo. `CopyLine` carries both through `getHoldings()`. Book detail shows the muted "Acquired {date} · €{price}" / "Ordered {date}" / "Add price" line under each copy, whose Links open one Picker (Book's title; Acquired date; Price accepting "24,90", "24.90", "24", empty = none). The collection's `beforeValidate` enforces the date rule for back-office writes too.

**Files changed.**
- `src/collections/Copies.ts` — `acquiredAt`, `price`, `acquiredDate` hook.
- `src/fields/wholeNumber.ts` (moved from `UserBooks.ts`), `src/fields/limits.ts` (`maxPrice`), `src/fields/readingDates.ts` (header comment).
- `src/migrations/20261106_180131_copy_purchase.{ts,json}`, `index.ts`, `src/payload-types.ts` — hand-edited back-fill migration, snapshot, types.
- `src/lib/copies/createCopy.ts`, `receiveCopy.ts`, `updateCopy.ts` (`setCopyPurchase`); `src/lib/books/holdings.ts` (`CopyLine`).
- `src/app/(frontend)/(sections)/actions.ts` (`setCopyPurchaseAction`), `price.ts` (`parsePrice`), `PurchasePicker.tsx`, `CopyLine.tsx` (`CopyPurchase`), `BookDetail.tsx`.
- `messages/en.json`, `messages/fi.json` — line, Picker and error strings.
- `ARCHITECTURE-SPINE.md` — Dates row names copies; `setCopyPurchaseAction` contract.
- Tests: new `copyPurchaseMigration.int`, `price.unit`; cases in `receiveCopy.int`, `copyWrites.int`, `copies.int`, `createCopy.int`; `acquiredAt` added to ~30 direct test inserts and `CopyLine` fixtures (the generated `Copy` type requires it).
- `epic-10-context.md` — recompiled after 10.2's spine changes.

**Review.** 24 findings from four layers (log above): 9 patched (2 medium: `createCopy` date assertion, collection-rule test; 7 low: formatted max price, English hint, lone "€", parser comment, holdings fallback, `readingDates` comment, admin cents hint), 15 rejected with reasons in each row, none deferred.

**Follow-up review recommendation: true** (first pass, 2 medium entries patched). Unverified risk on the real surface: the Picker's accessible name is the Book's title, the same as Book detail's sheet beneath it, so a screen reader announces two identically named dialogs; and, as in 10.2, the phone sheet closes by Back/Esc/scrim rather than a Cancel button. A walkthrough should settle both before 10.5/10.6 build on the copy line.

**Verification (parent, after patches).**
- `npm run typecheck` — passed.
- `npm run test:unit -- --maxWorkers=2` — 103 files / 1,368 tests passed.
- `npm run test:int` (full, before patches) — 91 files / 786 tests passed; after patches `npm run test:int -- copyPurchaseMigration receiveCopy createCopy copies copyWrites holdings` — 10 files / 74 tests passed, `bookeh_test`, push off.
- CI-style drift check — no drift against `20261106_180131_copy_purchase.json`; temporary files removed, registry restored.
- Scoped ESLint — 0 errors (4 unused-argument warnings in the migration, as in the generated ones); `git diff --check` clean.
- Uncommitted phone walk — passed before and after the patches.
- Matrix audit — Migration: `copyPurchaseMigration.int`; Save: `createCopy.int` and the walk; Received: `receiveCopy.int`; Line rows, Picker save and rejections: the walk (Finnish formatting is next-intl's, not asserted); Service: `copyWrites.int`.

**Residual risks.** Production-dump restore rehearsal not run (no dump or LXC access here); AD-13 still wants it before deploy. The uncommitted walk specs from earlier stories insert copies without `acquired_at` and now hit NOT NULL. Edit book's ordered→owned keeps the order date (rejected: intent keeps Edit book unchanged) — Stats' dust may read an order date for such a copy. Schema stories merge serially; no parallel worktree shares these files.

**Walkthrough (2026-11-07).** Mika checked the follow-up points above on mobile and found them fine. The phone sheet closing without a Cancel button is accepted.
