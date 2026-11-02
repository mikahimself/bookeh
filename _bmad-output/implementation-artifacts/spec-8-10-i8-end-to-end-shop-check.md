---
title: '8.10 [I8] End-to-end: shop check'
type: 'chore'
created: '2026-11-02'
baseline_revision: 'edd3a72f80ccd6997073c25a198f35315ad2a43e'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: []
deferred:
  - summary: >-
      The shop check depends on the e2e user having no wishlist when it runs,
      and the seed resets that only once per server, so an uncommitted walk
      that creates a list (heldAnswers) run in the same invocation can leave
      one list behind and make the picker skip itself.
    evidence: |-
      `AddToWishlist` saves straight to the only list when the user has
      exactly one (`src/app/(frontend)/components/AddToWishlist.tsx:114-124`).
      The implementing run saw the full `npx playwright test` fail with the
      walk specs present; the two committed specs pass together, twice in a
      row. Walks are local and uncommitted and are run one at a time, so CI
      never meets it. What would settle it: whether walks should clean up
      their own lists, or the spec should pick an existing list when one
      shows.
    location: >-
      tests/e2e/shopCheck.spec.ts:49
    severity: low
  - summary: >-
      The spec creates its list through the picker's "New list" field, so the
      criterion's "picks a list" (choosing an existing one) is realised as
      creating one.
    evidence: |-
      The seed leaves the user with no list, which is the only state in which
      the picker shows just the field (`heldAnswers.walk.spec.ts` does the
      same). Choosing a row would need a seeded second list so the picker
      opens instead of saving directly. What would settle it: the owner's
      call on whether the epic's wording means picking a row.
    location: >-
      tests/e2e/shopCheck.spec.ts:50
    severity: low
---

<intent-contract>

## Intent

**Problem:** The shop check ("do I already have this?") is the app's second guarded flow, but only scan-to-save has a Playwright test; In library and On wishlist Answers (8.2) and the wishlist save could break silently.

**Approach:** One committed Playwright spec, `tests/e2e/shopCheck.spec.ts`, on the fixture source with hand-typed ISBNs: add book A, scan it again (In library with its location); wish for book B through a new list, scan it again (On wishlist). The seed resets what the spec leaves behind so every run starts clean.

## Boundaries & Constraints

**Always:**

- Fixture source only (`BOOKEH_SOURCES=fixture`), ISBNs typed into the Scan field; the spec records every request and asserts none leaves the app's origin (as `scanToSave.spec.ts` does).
- Two fixture ISBNs other than Sapiens (`E2E_ISBN`), so this spec and `scanToSave.spec.ts` can run in parallel on the one user without sharing a Book.
- The seed removes earlier runs' Books of both ISBNs (copies, entries, user-books, cover media) and the user's wishlists and entries, so the picker starts with no list and "New list" is the field to use.

**Never:**

- No further Playwright spec, no change to app code, no spine change: Tests convention keeps Playwright to scan-to-save and the shop check.
- No assertion on timings, markup or class names; only headings, lines and toasts a user reads.

</intent-contract>

## Code Map

- `tests/e2e/scanToSave.spec.ts` -- the pattern: sign-in, header "Scan book", typed ISBN, toast region `[data-toast-region]`, off-origin request guard. Read-only.
- `tests/e2e/heldAnswers.walk.spec.ts:26-67` -- Story 8.2's walk: the same wishlist steps (New list field, "Add", `Added to {list}`), In library line `{location} · owned`, On wishlist line `On {list}`. Read-only.
- `tests/e2e/account.ts` -- fixed user and Sapiens; gains the two shop-check ISBNs.
- `tests/e2e/seed.ts:57-90` -- removes earlier runs' Books of `E2E_ISBN` in FK order; becomes a loop over the ISBNs and also clears the user's wishlists (`wishlist-entries` then `wishlists`, `owner` = the user).
- `src/app/(frontend)/components/AddToWishlist.tsx:114-124` -- with no list the picker shows only the focused "New list" field; with exactly one list a press saves to it. Hence the seed reset. Read-only.
- `tests/fixtures/REPORT.md` -- 9789523520660 (Lihan loppu) and 9789520408053 (Ei enää Eddy) each have one matching Finna record.

## Tasks & Acceptance

**Execution:**

- `tests/e2e/account.ts` -- add `E2E_SHOP_OWNED` (9789523520660) and `E2E_SHOP_WISHED` (9789520408053) -- shared by seed and spec.
- `tests/e2e/seed.ts` -- remove earlier Books of all three ISBNs, and the user's wishlist entries and wishlists -- a clean start for the picker and Answers.
- `tests/e2e/shopCheck.spec.ts` -- the spec described in Approach, with the off-origin guard.

**Acceptance Criteria:**

- Given the fixture source and hand-entered ISBNs, when the spec runs, then it adds book A and scanning A again shows "In library" with a line naming the copy's location.
- Given book B, when Add to wishlist is pressed and a new list named, then the toast reads "Added to {list}", and scanning B again shows "On wishlist" with a line naming the list.
- Given the whole run, when requests are recorded, then none goes to another origin.
- Given the spec run twice in a row on one server database, when the seed has run, then both pass (the seed leaves no Book, entry or list from the earlier run).
- Given `npm run typecheck`, `npm run lint`, `npm run test:unit` and `npm run test:int`, then all pass.
- Given a clean tree otherwise, the walk rule of this project does not apply: no screen is added or changed.

## Spec Change Log

## Review Triage Log

### 2026-11-02 — Review pass

- verdicts: 16 findings — high 0, medium 0, low 3, false 9, maybe-false 0, plus 4 rejected on convention or scope
- findings:
  - `[false]` `[reject]` (blind hunter) Seed order: the Books go before the wishlist cleanup, so a leftover entry blocks the Book delete — the existing loop already deletes `wishlist-entries` of those Books before the Book (`tests/e2e/seed.ts:76`), and the spec ran twice in a row on one database.
  - `[false]` `[reject]` (blind hunter) `owner` on wishlist entries unconfirmed — `WishlistEntries` has `ownerField()` (`src/collections/WishlistEntries.ts:31`), `Wishlists` the same; the seed ran without error.
  - `[low]` `[reject]` (blind hunter) Criteria and Verification disagree, "run twice" has no step — the only fix edits this build's spec; the double run was in fact performed (see Auto Run Result).
  - `[false]` `[reject]` (blind hunter) Sprint status out of step — in-flight state; finalization sets it with the commit.
  - `[low]` `[reject]` (blind hunter) No negative assertions after the second scans — the heading is the Answer's first applicable fact, so "In library"/"On wishlist" already excludes the other headings; adding absence checks restates markup.
  - `[low]` `[reject]` (blind hunter) Copied login and request guard, one long test — a shared helper is an abstraction for later (CLAUDE.md); one test is the shop check's single story.
  - `[false]` `[reject]` (edge-case) Retry without re-seed — `playwright.config.ts:22` sets `retries: 0` for exactly this reason.
  - `[false]` `[reject]` (edge-case) "Back" may not be a button — the spec passed; Back is a button on the In library Answer (`heldAnswers` asserts it).
  - `[false]` `[reject]` (edge-case) Toast timing/covering — the spec passed repeatedly; the held toast is gone at the next Answer (3.46).
  - `[false]` `[reject]` (edge-case) `On Kauppalista` may match twice — passed under strict mode.
  - `[false]` `[reject]` (edge-case) Entry `owner` field — same as the blind hunter's, refuted by `WishlistEntries.ts:31`.
  - `[low]` `[defer]` (edge-case) Parallel/other walk specs on the same user lose or add lists — real for a local invocation that includes uncommitted walks; recorded as the first `deferred` entry.
  - `[false]` `[reject]` (edge-case) FK order for entries of other ISBNs — entries are deleted per Book in the loop before the Book.
  - `[low]` `[reject]` (edge-case) Non-http protocols in the off-origin guard — identical to the guard in `scanToSave.spec.ts`; the app uses none, and a spurious hit would fail loudly rather than pass silently.
  - `[low]` `[defer]` (intent alignment) "picks a list" realised as creating one — the seed makes the field the only path; recorded as the second `deferred` entry.
  - `[false]` `[reject]` (intent alignment) The guard sees browser traffic only — server-side calls are kept local by the fixture source, which the e2e `webServer` sets and production refuses; the criterion's "no network call outside the app" is met at that surface.

## Verification

**Commands:**

- `npx playwright test tests/e2e/shopCheck.spec.ts` -- expected: 1 passed.
- `npx playwright test` -- expected: all committed specs pass together (parallel).
- `npm run typecheck`, `npm run lint`, `npx prettier --check` on changed files -- expected: clean.

## Auto Run Result

Status: done

**Implemented.** The shop check now has a committed Playwright spec. On the fixture source with typed ISBNs it adds Lihan loppu and scans it again ("In library", line `E2E shelf · owned`), then wishes for Ei enää Eddy through a new list (toast `Added to Kauppalista`) and scans it again ("On wishlist", line `On Kauppalista`). It records every browser request and asserts none leaves the app's origin. No app code and no spine contract changed.

**Files changed**

- `tests/e2e/shopCheck.spec.ts` -- the spec (new, committed).
- `tests/e2e/account.ts` -- `E2E_SHOP_OWNED` and `E2E_SHOP_WISHED`.
- `tests/e2e/seed.ts` -- removes earlier runs' Books of all three ISBNs, and the user's wishlist entries and wishlists, so the picker offers only its "New list" field.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 8-10 done.

**Review findings.** Four layers ran; verification-gap found no gaps. 16 findings. Patched: none. Deferred (2, both low): other walk specs on the same user can leave a list behind and make the picker skip itself; "picks a list" is realised as creating a list. Rejected (14): nine refuted by the code or by the passing runs (seed FK order, the `owner` field, retries, locators, toast timing, strict-mode matches, server-side traffic), the rest on convention (spec-only fixes, absence assertions, a shared helper "for later", the protocol filter identical to `scanToSave`).

**Follow-up review recommended: false.** Patched entries: high 0, medium 0, low 0.

**Verification**

- `npx playwright test tests/e2e/shopCheck.spec.ts tests/e2e/scanToSave.spec.ts` -- 2 passed (re-run by the parent); the implementing run also passed both twice back to back on one database.
- `npm run typecheck` -- clean. `npm run lint` -- 0 errors (implementing run). `npm run test:unit` -- 1264 passed. `npm run test:int` -- 709 passed (implementing run; no app code changed since).
- `npx prettier --check` on the three e2e files -- clean.
- No walk: no screen was added or changed.

**Residual risks.** A full `npx playwright test` with the uncommitted walk specs present fails intermittently, because they share the one user (deferred above). Committed specs are unaffected.
