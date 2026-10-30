---
title: '7.20 [K26] Scan and collection leftovers'
type: 'bugfix'
created: '2026-10-30'
status: 'done'
baseline_revision: '4d2ace8a81b71ea1c44c70b8191ff370480b56c6'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: ['multiple-goals', 'oversized']
deferred:
  - summary: >-
      A private Book can still become a permanent shared Book from a partial outcome with no warning, through Add another copy's auto-share or Look it up again.
    evidence: |-
      saveCopy passes heldOutcome to prepareShare, and lookupAgain takes a found outcome; both ignore failed. Pre-existing; the story's criterion scopes the line to the Not in library Answer.
    location: >-
      src/lib/catalogue/saveCopy.ts:264, src/lib/catalogue/lookupAgain.ts:81
    severity: medium
---

<intent-contract>

## Intent

**Problem:** Five everyday defects from the triage (B31, C21, C32, D14, D15): a partial lookup can become a permanent shared Book with no warning, a thrown page shows Next's default error page, a toast Undo leaves the Filter panel's counts stale, an ordered cover tile says nothing to a screen reader, and `publisher`, `language` and the number fields have no limits.

**Approach:** `found` carries `failed`; the Not in library Answer shows Mika's mock-up C line (EXPERIENCE.md, `4d2ace8`) with a Try {sources} again Link whose retry skips the held outcome. Add `(frontend)/error.tsx`, one refresh after toast Undo, a hidden Ordered word on the tile, and the limits.

## Boundaries & Constraints

**Always:** the held partial outcome keeps `failed`, so a save uses what the Answer showed (AD-11). Try again goes through `limitLookups`. English and Finnish strings, design tokens only. Spine AD-7 and the shared shapes change in the same commit.

**Never:** no migration; no line on an Answer for an existing Book; no error detail on the screen; the airmail band stays decorative; Add to library stays the one primary and is not blocked.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Partial | Finna fails, Google finds | Line "Finna didn't answer. Saving now uses Google Books alone. Try Finna again" | none |
| Retry heals | Finna answers on retry | The Answer re-renders from the fresh outcome, no line | none |
| Retry fails again | Finna still fails, or every source fails | The held outcome stays; the same Answer | `unavailable` is never cached, so the held partial remains |
| Rate limit | Over the lookup limit on retry | Answer unchanged | `RATE_LIMITED` toast |
| Negative source value | A source gives `year: -5` | Left out of the candidate; the save succeeds | none |

</intent-contract>

## Code Map

- `src/lib/metadata/source.ts`, `lookup.ts:149` -- `found` gains `failed: SourceId[]`; `remember` already holds the whole outcome.
- `src/lib/catalogue/lookupBook.ts` -- `source` kind gains `failed`; new `retryLookup(ctx, isbn)`: normalise, `limitLookups`, `lookupSources(isbn13, { fresh: true })`. A plain `router.refresh()` would read the same held outcome for `PARTIAL_TTL_MS`, so Try again must use `fresh`.
- `src/app/(frontend)/scan/answer.ts:notInLibrary`, `NotInLibraryAnswer.tsx`, `AnswerLayout.tsx` -- `failed` on `AnswerBook` (`[]` for an existing Book); the line as the last of the notes, through a new `sourceNote` slot.
- `src/app/(frontend)/scan/actions.ts` -- `retryLookupAction`, as `saveCopyAction`'s shape.
- `src/app/(frontend)/scan/UnavailableActions.tsx` -- the transition and progress-line pattern to follow.
- `src/app/(frontend)/(sections)/ShelfRows.tsx:96,267`, `ReadAndRating.tsx:39` -- the refresh; `ReadAndRating` must stay the refresher when mounted because its remount shares that transition. `RefreshOnUndo` covers `/loans` and wishlists, where no `ShelfRowsState` mounts.
- `src/app/(frontend)/(sections)/CoverTile.tsx`, `CollectionList.tsx:125` -- the `ordered` prop, as `BookRow`.
- `src/fields/limits.ts`, `bookFields.ts:53`, `src/lib/catalogue/editBook.ts:91`, `clipCandidate.ts` -- the limits. Fixtures reach 32 characters of publisher and 3 of language. `pick.ts`, `lookupBook`, `lookupAgain` already clip every candidate.
- `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md` -- this Next's boundary prop is `retry`, not `reset`.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/source.ts`, `src/lib/metadata/lookup.ts` -- add and fill `failed` -- C21.
- `src/lib/catalogue/lookupBook.ts`, `src/app/(frontend)/scan/actions.ts` -- `failed` on `source`, `retryLookup`, `retryLookupAction` -- the retry must skip the held outcome.
- `src/app/(frontend)/scan/answer.ts`, `NotInLibraryAnswer.tsx`, `AnswerLayout.tsx`, new `PartialLookupLine.tsx` -- the line -- mock-up C.
- `messages/en.json`, `messages/fi.json` -- `answer.partial`, `answer.tryPartial`, `sourcesPartitive` (Finnish objects decline), `errorPage` -- both languages.
- `src/app/(frontend)/error.tsx` -- heading, Try again, Link to Collection; `console.error` in an effect -- C32.
- `src/app/(frontend)/(sections)/ShelfRows.tsx`, `ReadAndRating.tsx` -- `ShelfRowsState` refreshes after its Undo reload unless a `ReadAndRating` has claimed it -- D15.
- `src/app/(frontend)/(sections)/CoverTile.tsx`, `CollectionList.tsx` -- `sr-only` Ordered -- D14.
- `src/fields/limits.ts` (`publisher: 200`, `language: 50`), `src/fields/bookFields.ts` (`maxLength`, `min: 0`), `src/lib/catalogue/editBook.ts` (`TOO_LONG`; a negative number is `VALIDATION`), `src/lib/catalogue/clipCandidate.ts` (clip; drop negatives) -- B31.
- `ARCHITECTURE-SPINE.md` -- AD-7 Undo sentence; `found` and `source` shapes. `EXPERIENCE.md` -- unexpected failure row.
- Tests: one integration case, partial `failed` through a real held outcome to `lookupBook`; a case that `retryLookup` replaces it; one unit case for the Undo refresh; `editBook` and `clipCandidate` cases.

**Acceptance Criteria:**
- Given a lookup where one source failed and another found the Book, when the Not in library Answer shows, then the line names the failed source and the source used, with Try {sources} again.
- Given the line, when Try again runs and the source now answers, then the Answer shows the fresh outcome without the line.
- Given a held partial outcome, when the lookup runs again within its TTL, then `failed` is still there and a save uses what the Answer showed.
- Given a page that throws, when it renders, then the frontend's error page shows a heading, Try again and a Link to Collection in the tokens, both themes and both languages, shows no error detail, and logs the error.
- Given a toast Undo with Book detail closed, when the rows reload, then `router.refresh()` runs once after them; with `ReadAndRating` mounted it still runs once.
- Given an ordered copy in covers, when a screen reader reads the tile, then it says Ordered in both languages and the band stays decorative.
- Given Edit book, when `publisher` or `language` is over its limit, then the field shows `TOO_LONG`; when `year`, `pages` or `seriesIndex` is negative, then the save is refused; source values are clipped and negatives dropped; `migrate:create` has nothing to add.

## Spec Change Log

## Review Triage Log

### 2026-10-30 — Review pass
- verdicts: 35 findings — high 0, medium 7, low 25, false 3, maybe-false 0
- findings:
  - `[medium]` `[defer]` Blind: Add another copy on a private Book auto-shares from a held partial outcome with no line — Real and pre-existing: `saveCopy` passes `heldOutcome` to `prepareShare`. The AC scopes the line to Not in library. See `deferred`.
  - `[low]` `[reject]` Blind: Add to library stays enabled during a retry and can fail NOT_FOUND — Real but brief: `saveCopyAction` returns NOT_FOUND and the client refreshes to the fresh Answer. Locking needs shared state across components.
  - `[low]` `[reject]` Blind: retry keeps a stale `&pick=` — Real with several editions on a healed retry; the new edition is shown and `candidate` saves what is shown. Rare, and a fix needs identity mapping.
  - `[medium]` `[patch]` Blind: a retry that changes nothing gives no feedback — `retryLookup` returns the failed ids and the line raises `toast.noAnswer`, as Look it up again does.
  - `[low]` `[reject]` Blind: no global-error for a throw in the root layout — Real gap, but the AC is a page render and the layout only reads cookies and locale; a second boundary is new surface.
  - `[low]` `[patch]` Blind: a client throw never reaches the log the EXPERIENCE row claims — EXPERIENCE row now says server log for server errors, browser console for client ones.
  - `[low]` `[patch]` Blind: the error page announces nothing — `role="alert"` around the heading.
  - `[low]` `[reject]` Blind: error page Try again has no pending state — Cosmetic; `retry()` re-renders the boundary and repeat taps are harmless.
  - `[low]` `[patch]` Blind: spine claims one refresh, but /loans with Book detail refreshes twice — The double refresh is pre-existing and harmless; AD-7 and the docblocks now scope the claim to `/`.
  - `[medium]` `[patch]` Blind: `retryLookup` absent from the spine, AD-9 prose and the limit docblock — Added to AD-9, the rate-limit list, the module tree and `lookupLimit.ts`.
  - `[false]` `[reject]` Blind: "a save uses what the Answer showed" has no test — `saveCopy.int.spec.ts:390` already saves from a partial held outcome; the new case proves `failed` stays on it.
  - `[low]` `[patch]` Blind: the first AC's line has no automated check — `tests/unit/notInLibraryAnswer.unit.spec.ts`.
  - `[low]` `[reject]` Blind: "{found} alone" fails with a third source — Only two sources exist; the wording is the recorded pick and a third source is hypothetical.
  - `[low]` `[reject]` Blind: stored rows may exceed the new constraints — Not checked against production. An over-limit row would show a field error on the next admin save, fixable there; publisher width is 200 against a fixture maximum of 32.
  - `[low]` `[reject]` Edge: a retry on the last lookup slot loses the Answer — Real: retry and refresh each count. Needs 29 lookups used in the window; a fix needs an uncounted path.
  - `[medium]` `[patch]` Edge: retry gives no feedback during a breaker cooldown — Same fix as the no-feedback finding; docblock states the breaker.
  - `[low]` `[reject]` Edge: stale `&pick=` after a retry — As the Blind row.
  - `[low]` `[reject]` Edge: Undo in the LoadFailed branch has no listener — Pre-existing; the AC is about rows reloading and here there are none.
  - `[low]` `[reject]` Edge: no global-error — As the Blind row.
  - `[medium]` `[defer]` Edge: Look it up again and the save auto-share ignore `failed` — As the Blind row. See `deferred`.
  - `[low]` `[patch]` Edge: `retryLookup` docblock overclaims past PARTIAL_TTL_MS — Docblock corrected.
  - `[low]` `[patch]` Edge: the one-refresh claim fails on /loans — As the Blind row.
  - `[medium]` `[patch]` Verification: the real `ReadAndRating` claim is unverified — The case now mounts the real component; removing the hook was tried and the case fails.
  - `[low]` `[patch]` Verification: the partial line has no executed test — As the Blind row.
  - `[low]` `[patch]` Verification: refused retry unverified above `retryLookup` — Case added for RATE_LIMITED: failure reported, no refresh.
  - `[low]` `[patch]` Verification: hidden Ordered word asserted nowhere — `within(ordered).getByText('Ordered')` added.
  - `[low]` `[reject]` Verification: error page verified only by a walk — The layer filed it as defer; a static boundary, and such a test would restate markup (CLAUDE.md, Tests).
  - `[low]` `[reject]` Verification: a retry on the last slot loses the Answer — As the Edge row.
  - `[false]` `[reject]` Intent: "Try Finna again" re-asks every source — EXPERIENCE.md, recorded with the pick: the Link "runs the lookup once more". No other mechanism exists.
  - `[medium]` `[defer]` Intent: the wait-before-permanent goal stops at the Answer — As the Blind row. See `deferred`.
  - `[false]` `[reject]` Intent: the save test stops at `lookupBook` — As the Blind row.
  - `[low]` `[patch]` Intent: the dictated sentence has no committed test — As the Blind row.
  - `[low]` `[reject]` Intent: retry and `&pick=` — As the Blind row.
  - `[low]` `[patch]` Intent: `ReadAndRating` is stubbed — As the Verification row.
  - `[low]` `[reject]` Intent: error logging and page rest on a walk on the dev server — Production scrubbing is Next's; the screen shows no `error` field at all, so nothing can leak.

## Design Notes

"{found}" is the picked candidate's source label. `failed` is required rather than optional, so every `found` says it; it is `[]` when complete. Finnish object position needs the partitive ("Yritä Finnaa uudelleen", "käyttää vain Google Booksia"), hence `sourcesPartitive`, falling back to the raw id as `sources` does.

## Verification

**Commands:**
- `npm run lint`, `npm run typecheck`, `npm run test:unit` -- expected: pass.
- `npm run test:int` -- expected: pass, apart from this machine's known `collation` and `shelfTiming` failures.

**Manual checks (if no CLI):**
- One uncommitted Playwright walk (`tests/e2e/*.walk.spec.ts`) of the Answer line, error page and ordered tile, recorded under `## Auto Run Result`.

## Auto Run Result

Walk: one uncommitted Playwright walk on `bookeh_test` (dev server, Chromium), passed. Sources faked for the walk only, with a throwing route, both removed afterwards. Checked: the line in English and Finnish with Add to library enabled; Try Finna again while Finna still fails keeps the Answer; once Finna answers the Answer shows From Finna with no line; an ordered tile's link is named with Ordered / Tilattu with the band present; the error page in English light and Finnish dark, no error detail, the error logged in the browser console, Try again re-renders, the Collection Link goes to `/`. The `RATE_LIMITED` toast on Try again was not walked.

Summary: `found` and the `source` kind carry `failed`; the Not in library Answer shows mock-up C with a Try {sources} again Link whose `retryLookup` skips the held outcome and toasts when sources still fail; `(frontend)/error.tsx`; one refresh after a toast Undo on `/`; a hidden Ordered word on the tile; limits on `publisher` (200) and `language` (50), and no negatives on `year`, `pages`, `seriesIndex`.

Files: `lib/metadata` (`failed`), `lib/catalogue` (`retryLookup`, `editBook`, `clipCandidate`, `lookupLimit` docs), `scan/` (the line, its action, the Answer), `(frontend)/error.tsx`, `ShelfRows.tsx`, `ReadAndRating.tsx`, `CoverTile.tsx`, `CollectionList.tsx`, `fields/`, messages, the spine, EXPERIENCE.md, tests.

Review: patched 15 rows: 3 medium entries (retry feedback, the spine, the `ReadAndRating` case), 0 high, the rest low. Deferred 1 entry (3 rows), in `deferred`. Rejected 17, each with its reason in the Review Triage Log.

Follow-up review: recommended (`true`), 3 medium entries patched. The unverified risk: the toasts on Try {sources} again, `noAnswer` after a failed retry and `RATE_LIMITED`, were added or left after the walk and have not run on the real surface, and whether `noAnswer` survives the refresh was only read from `DismissToast`.

Verification: lint 0 errors, typecheck clean, unit 1055 passed, integration 80 files passed, `migrate:create` found no schema change. Removing `useClaimUndoRefresh()` failed the refresh case.

Residual risks: the deferred share path; a last-slot retry drops to Scan; the error page wording ("Couldn't show this page.") was chosen in the build and recorded in EXPERIENCE.md; the `noAnswer` toast after a failed retry and the RATE_LIMITED toast were not walked; `/loans` with Book detail still refreshes twice after Undo, as before.
