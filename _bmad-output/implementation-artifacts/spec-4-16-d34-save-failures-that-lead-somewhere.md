---
title: '4.16 [D34] Save failures that lead somewhere'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
baseline_revision: 'f1db913ae06f6d7fe5d2e1a84cdf3783673becbe'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Two save failures are dead ends (Epic 3 retro R5, R6, A13). When the lookup cache misses at save time and every source now answers `none`, `ensureSharedBook` throws `NOT_FOUND`, which `saveCopyAction` folds into `SAVE_FAILED`. "Couldn't save. Try again." then repeats for the ten minutes `none` stays cached. Source values longer than a field's `maxLength` fail Payload validation, so that ISBN can never be saved. On Not found, a typed title over 500 characters shows "Enter the title." under a filled field, and an author over 200 characters shows "Couldn't save".

**Approach:** `saveCopyAction` passes `NOT_FOUND` through, and Add to library answers it by refreshing the route, so the same `?isbn=` re-renders as the Not found Answer. Source values are clipped to the field limits before a shared Book is written. `normaliseManual()` reports an over-long title or author as a new field code, `TOO_LONG`, which the Not found form shows under that field.

## Boundaries & Constraints

**Always:** One source of truth for the limits (title 500, subtitle 500, description 10 000, author and series name 200), read by both the Payload fields and the clipping code. Lengths are JavaScript `.length` (UTF-16 units, as Payload's `maxLength` counts them), measured after `normaliseName()` for manual text. A clip never leaves a lone high surrogate at the end. Strings exist in `messages/en.json` and `messages/fi.json`. Every failure other than those named here still ends as `SAVE_FAILED` ("Couldn't save. Try again.").

**Never:** Clipping a user's typed text. That is marked, never cut. Changing the lookup cache, TTLs or the held-outcome rule (that is 4.17). New Payload fields or migrations. Limits on fields that have none today (publisher, themes, sortName). A toast on the `NOT_FOUND` refresh: the new Answer is the message.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Sources stopped knowing the ISBN | Add to library on Not in library; no Book holds the ISBN; cache miss; every source answers no records | `saveCopyAction` → `{ ok: false, code: 'NOT_FOUND' }`, nothing written; client calls `router.refresh()`; page re-renders the Not found Answer with the title and author fields | No error toast |
| Over-long source values | Picked candidate with a 600-character title and subtitle, a 12 000-character description, a 250-character author and series | Shared Book saved, with title and subtitle at 500, description at 10 000, author and series names at 200 | No error expected |
| Manual title too long | Not found; title is 501 characters after normalising; author is fine | `VALIDATION` with `fields: { title: 'TOO_LONG' }`; under Title: `errors.TOO_LONG`, text kept, Title focused | No toast |
| Manual author too long | Author is 201 characters | `fields: { authors: 'TOO_LONG' }`; under Author: `errors.TOO_LONG` | No toast |
| Any other failure | e.g. `INVALID_ISBN`, `INTERNAL`, a malformed input | `SAVE_FAILED`, as now | "Couldn't save. Try again." toast |

</intent-contract>

## Code Map

- `src/fields/bookFields.ts:48-57` -- `overridable()` declares title/subtitle 500 and description 10_000 as literals. Switch them to the shared limits.
- `src/collections/Authors.ts:23`, `src/collections/Series.ts:22` -- `name` maxLength 200. Switch it to the shared limit.
- `src/lib/catalogue/ensureSharedBook.ts:80` -- `picked = outcome.candidates[pickIndex(...)]`. Clip it here, before authors/series are matched (`findOrCreateByName` keys on the name) and before `payload.create` (:101).
- `src/lib/catalogue/sharePrivateBook.ts:44` -- `prepareShare()` takes `outcome.candidates[0]` into `PendingShare.candidate`. Clip it there, so the share write (:225-262) and the override comparison (`fromCandidate`, :146) both see the stored values.
- `src/lib/catalogue/createPrivateBook.ts:27-46` -- `normaliseManual()` builds `fields` (`title`, `authors`: `'VALIDATION'`). Add the `TOO_LONG` checks in the same pass. A title that is blank or too long is one code, never both.
- `src/lib/errors.ts:6-19` -- the `ErrorCode` union. Add `'TOO_LONG'`. `tests/unit/messages.unit.spec.ts:55-68` lists every code exhaustively, so add it there too.
- `src/app/(frontend)/scan/actions.ts:30-32` -- the fold in `saveCopyAction`. Let `NOT_FOUND` through. Rewrite the doc comment (:8-18). `saveManualAction` (:70-80) already passes the `title`/`authors` field codes through unchanged.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- pass an `onRefused` to `add()` that handles `NOT_FOUND` with `router.refresh()` in a transition and returns `true`. Reference: `UnavailableActions.tsx:30-34`'s retry.
- `src/app/(frontend)/scan/NotFoundForm.tsx:27-53,73,82` -- `missing` holds booleans. Hold each field's code instead: `VALIDATION` → `answer.titleRequired`/`authorRequired`, `TOO_LONG` → `errors.TOO_LONG`.
- `src/app/(frontend)/scan/page.tsx:46-51` -- read only. A refresh re-runs `lookupBook`, which hits the `none` that the save just cached (`src/lib/metadata/lookup.ts:113-115`, `NONE_TTL_MS`).
- `messages/en.json:110-122`, `messages/fi.json` -- `errors.TOO_LONG`.
- Tests to touch: `tests/int/saveCopyAction.int.spec.ts` (stub `fetch` as the picked-edition case at :147-180 does: Finna with no records, Google `{ totalItems: 0 }`), `tests/int/ensureSharedBook.int.spec.ts` (fakes `lookupSources`, with `candidate()`/`found()` helpers), `tests/int/createPrivateBook.int.spec.ts` (`normaliseManual` cases), `tests/unit/addToLibrary.unit.spec.ts` (its `next/navigation` mock gives `useRouter: () => ({ replace })`; add `refresh`), `tests/unit/notFoundForm.unit.spec.ts`.

## Tasks & Acceptance

**Execution:**
- `src/fields/limits.ts` (new) -- export the limits (`title`, `subtitle`, `description`, `name`) and `clip(value, max)`, which drops a trailing lone high surrogate -- one source for the schema and the clipping.
- `src/fields/bookFields.ts`, `src/collections/Authors.ts`, `src/collections/Series.ts` -- use the limits. The values do not change, so no migration.
- `src/lib/catalogue/clipCandidate.ts` (new) -- `clipCandidate(c: SourceResult): SourceResult`: clips `title`, `subtitle`, `description`, each author `name` and `series` -- the shared step for both shared-Book writes.
- `src/lib/catalogue/ensureSharedBook.ts`, `src/lib/catalogue/sharePrivateBook.ts` -- apply `clipCandidate` to the candidate used. Note it in the doc comments -- R6.
- `src/lib/errors.ts`, `messages/en.json` ("Too long."), `messages/fi.json` ("Liian pitkä."), `tests/unit/messages.unit.spec.ts` -- add `TOO_LONG`.
- `src/lib/catalogue/createPrivateBook.ts` -- in `normaliseManual()`, a title over `limits.title` gives `fields.title = 'TOO_LONG'`, and any author over `limits.name` gives `fields.authors = 'TOO_LONG'`. Update the doc comment.
- `src/app/(frontend)/scan/actions.ts` -- `saveCopyAction` returns `NOT_FOUND` as it is. Everything else folds as before.
- `src/app/(frontend)/scan/AddToLibrary.tsx` -- `NOT_FOUND` → `router.refresh()`, no toast. Update the doc comment.
- `src/app/(frontend)/scan/NotFoundForm.tsx` -- a message per field code. Update the doc comment.
- Tests: one int case for `saveCopyAction` `NOT_FOUND` with nothing written; one `ensureSharedBook` int case that saves over-long values and checks the stored lengths; `normaliseManual` rows for a too-long title and a too-long author; one AddToLibrary unit case (`NOT_FOUND` → `refresh`, no toast, no `back`); one NotFoundForm unit case (`TOO_LONG` on title shows "Too long." under Title).

**Acceptance Criteria:**
- Given Add to library on a Not in library Answer, when the save finds that no source knows the ISBN any more, then `saveCopyAction` returns `NOT_FOUND`, nothing is written, and the scan screen shows the Not found Answer with the manual fields for that ISBN.
- Given a source record whose title, subtitle, description, author or series name is longer than its field allows, when it is saved as a new shared Book or shares a held private Book, then the save succeeds with each value clipped to its limit.
- Given the Not found Answer, when the title is over 500 or an author over 200 characters, then that field shows "Too long." / "Liian pitkä." (not the required message and not a toast), and the text stays.
- Given any other save failure, when it happens, then the toast still says "Couldn't save. Try again."

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 21, false 1, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: `NOT_FOUND` passthrough also covers a vanished held Book and mapped Payload `NotFound`/`Forbidden`, which refresh with no toast — the story names `NOT_FOUND` as the code to return; these causes are races or bugs, the refresh then shows the true state, and telling them apart needs a new signal (complexity) for a rare case. The log line restored below keeps a trace.
  - `[low]` `[patch]` Blind: a passed-through `NOT_FOUND` is no longer logged — warning restored for every non-INTERNAL, non-UNAUTHENTICATED failure.
  - `[low]` `[patch]` Blind: the Answer matches and shows unclipped source values while the save stores clipped ones (new-author mark can disagree, longer title shown) — `clipCandidate()` applied once in `lookupBook`'s `found` branch.
  - `[low]` `[patch]` Blind: clip runs before normalising; a cut at whitespace leaves a trailing space — names clipped after `normaliseName()`, `clip()` trims the end. Grapheme-boundary cutting (Intl.Segmenter) rejected: cosmetic at the 200th/500th character.
  - `[low]` `[reject]` Blind: source `sortName` not clipped with the name — `sortName` has no maxLength so nothing fails; only an over-200 author's sort key differs, cosmetic and rare.
  - `[low]` `[patch]` Blind: share-in-place clipping untested — the AC names that path; one int case added to `sharePrivateBook.int.spec.ts`.
  - `[low]` `[reject]` Blind: "Too long." does not state the limit — a typed title over 500 characters is unlikely; interpolating limits is UX scope the story did not ask for.
  - `[false]` `[reject]` Blind: `NotFoundForm`'s `message()` shows the required text for any non-`TOO_LONG` code — the only codes that reach `title`/`authors` are `normaliseManual`'s `VALIDATION` (blank) and `TOO_LONG`; Payload's title maxLength can no longer fire after `normaliseManual`, and an author's Payload error has path `name`, which `saveManualAction` drops.
  - `[low]` `[reject]` Blind: pure `normaliseManual` cases live in the int spec; "never clipped" in a test title — harmless placement, the throw shows the text is not saved clipped.
  - `[low]` `[reject]` Blind: two over-long names with the same first 200 characters collapse to one record — vanishingly rare; guarding needs extra branches.
  - `[low]` `[patch]` Edge: NFC after a raw clip can lengthen a name past 200; whitespace runs over-clip — same root as row 4; fixed there.
  - `[low]` `[patch]` Edge: Answer vs save match on clipped/unclipped name — same root as row 3; fixed there.
  - `[low]` `[reject]` Edge: `NOT_FOUND` arriving after the Answer was left refreshes the current route — a refresh re-renders whatever route is showing, client state kept; harmless.
  - `[low]` `[reject]` Edge: the refresh counts against `limitLookups` — only matters at 30 lookups/60 s; the lookup limit on saves is Story 4.18's.
  - `[low]` `[reject]` Edge (claim): non-source `NOT_FOUND` refreshes silently — same as row 1.
  - `[low]` `[patch]` Edge (claim): NFC lengthening makes some names still fail maxLength — same root as row 4; fixed there.
  - `[low]` `[patch]` Verification gap: `prepareShare` clipping untested — same as row 6; test added.
  - `[low]` `[patch]` Verification gap (other): Answer and save disagree on new author/series — same as row 3.
  - `[low]` `[reject]` Intent: `NOT_FOUND` handled for every cause and for Add another copy too — same as row 1.
  - `[low]` `[reject]` Intent: the rendered link (save caches `none` → refresh → Not found Answer) is not tested end to end — each half is tested (action returns `NOT_FOUND`; client refreshes); the cache rule is existing, tested lookup behaviour; Playwright stays scan-to-save only.
  - `[low]` `[patch]` Intent: Answer screen shows unclipped values; promote clip untested — same as rows 3 and 6.
  - `[low]` `[reject]` Intent: a too-long author is not tested at form level — same code path as the tested title.

## Design Notes

`TOO_LONG` is a new `ErrorCode` rather than a message key, because field errors are typed `Record<string, ErrorCode>` and the message key for a code is `errors.<CODE>` (spine, Errors convention). Edit book (4.7) can reuse it for its own length errors. The Errors convention row does not enumerate codes, so the spine does not change.

The refresh hits the `none` that the failed save cached. If that entry has gone, a fresh lookup still answers truthfully. The Not found Answer ignores `pick`.

## Verification

**Commands:**
- `npm run typecheck` -- expected: no errors
- `npm run lint` -- expected: no errors
- `npm run test:unit` -- expected: all pass
- `npm run test:int` -- expected: all pass (on the worktree's own Postgres, port 5433)

## Auto Run Result

Status: done

**Summary.** A save that cannot succeed now leads somewhere. `saveCopyAction` returns `NOT_FOUND` instead of folding it into `SAVE_FAILED`. Add to library answers it by refreshing the address, which re-renders as the Not found Answer from the `none` the save just cached. Source values are clipped to the field limits (title and subtitle 500, description 10 000, author and series names 200) before a shared Book is created or a private Book is shared, and the Answer shows and matches the same clipped values. On Not found, a typed title over 500 or an author over 200 characters is marked `TOO_LONG` under its own field ("Too long." / "Liian pitkä."). Every other failure still shows "Couldn't save. Try again."

**Files changed**
- `src/fields/limits.ts` (new): the length limits and `clip()`, which never leaves a lone high surrogate and trims the end of a cut value.
- `src/fields/bookFields.ts`, `src/collections/Authors.ts`, `src/collections/Series.ts`: `maxLength` read from `limits`, values unchanged, no migration.
- `src/lib/catalogue/clipCandidate.ts` (new): clips a source candidate's text; names are normalised first.
- `src/lib/catalogue/ensureSharedBook.ts`, `sharePrivateBook.ts`, `lookupBook.ts`: apply `clipCandidate()`.
- `src/lib/catalogue/createPrivateBook.ts`: `normaliseManual()` marks `TOO_LONG`; `saveCopy.ts` doc updated.
- `src/lib/errors.ts`, `messages/en.json`, `messages/fi.json`, `src/app/(frontend)/components/toast/flashCookie.ts`: new `TOO_LONG` code.
- `src/app/(frontend)/scan/actions.ts`: `NOT_FOUND` passes through and is still logged as a warning.
- `src/app/(frontend)/scan/AddToLibrary.tsx`: `NOT_FOUND` → `router.refresh()`, no toast.
- `src/app/(frontend)/scan/NotFoundForm.tsx`: a message per field code.
- Tests: `saveCopyAction` (`NOT_FOUND`, nothing written), `ensureSharedBook` (clipping, surrogate edge), `sharePrivateBook` (clipping on promote), `createPrivateBook` (`normaliseManual` `TOO_LONG` rows), `lookupBook` (expectation now the normalised name), `addToLibrary` and `notFoundForm` unit cases, `messages` code list.

**Review findings.** 22 findings: 21 low, 1 false.
- **Patched (low, 4 entries):** the warning log for `NOT_FOUND`; the Answer clipped like the save; names normalised before clipping, with trailing whitespace trimmed; a test for the promote path.
- **Deferred:** none.
- **Rejected (with reasons in the Review Triage Log):**
  - the `NOT_FOUND` passthrough covering rare non-source causes
  - `sortName` not clipped
  - "Too long." not naming the limit
  - `message()`'s fallback (false: unreachable)
  - pure tests placed in the int spec
  - two long names collapsing into one record
  - a refresh after leaving the Answer
  - the refresh counting against the lookup limit (Story 4.18)
  - no end-to-end test of the refresh-to-Not-found link
  - no form-level test for a too-long author

**Follow-up review:** false. Only low entries were patched (high 0, medium 0, low 4).

**Verification:** `npm run typecheck` clean; `npm run lint` 0 errors (36 existing warnings in `src/migrations`); `npm run test:unit` 42 files, 670 passed; `npm run test:int` 40 files passed, 1 skipped (`migrationSchema`, already skipped), 396 tests passed, on the worktree's Postgres (port 5433). Playwright was not run.

**Residual risks**
- A `NOT_FOUND` from a cause other than the sources also refreshes silently. The refreshed Answer shows the true state, and the warning log keeps a trace.
- Not tried by hand in a browser.
