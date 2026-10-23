---
title: '5.34 [E13] Admin re-fetch'
type: 'feature'
created: '2026-10-23'
status: 'done'
baseline_revision: '37d9d2078a7e988b2688c8a17d2f720138cc367b'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** A shared Book saved while a source lacked data keeps its gaps; nothing asks the sources again (FR-19, FR-17a, AD-5).

**Approach:** Mika picked mock-up A + 1 (2026-10-23): a "Re-fetch" Link line above Book detail's foot, then a toast only. `lib/catalogue/refetchBook.ts` asks the sources fresh and fills empty shared fields.

## Boundaries & Constraints

**Always:**
- `refetchBook(ctx, bookId)` returns one of three outcomes:
  - `{ kind: 'filled'; fields; themes; source }`
  - `{ kind: 'nothing' }`
  - `{ kind: 'unavailable'; failed }`
- **Gate.** The checks follow `coverGate`: `requireOwnBook`, then a gateway read. The Book must be shared and the user must pass `canEditShared`. Anything else fails `NOT_FOUND`, before any source call.
- **Lookup.** `limitLookups(ctx)` runs first, then `lookupSources(isbn13, { fresh: true })`, which skips the cache read but still writes the cache.
  - `none` gives `nothing`.
  - Otherwise `chooseCandidate(outcome)` gives the default candidate.
- **Cover download.** When the cover is empty and the candidate has a cover URL, `storeCover` runs before the transaction.
- **Fill.** In `withTransaction`, re-read the row with `system(tx)` and fill only the fields still empty (`null`, `''` or `[]`) that the candidate has.
  - Fields, in this order: subtitle, authors, series, seriesIndex, publisher, year, pages, language, description, cover, themes.
  - Authors and series go through `findOrCreateByName(tx, …, 'shared', …)`.
  - The cover goes through `attachCover` and `onRollback(discardCover)`. Discard a downloaded cover that isn't used.
  - `rawMetadata` and `source` fill too when null, but are not listed in `fields`.
  - `themes` is the number of themes added.
  - Nothing to fill means `nothing` and no write.
- **Action.** `refetchBookAction` goes in `(sections)/actions.ts`, shaped like `setRatingAction`.
- **Line.** `Refetch.tsx` holds an `ActionLink` "Re-fetch", which reads "Re-fetching…" and is disabled while pending. Under it a muted hint: "Fills empty fields from the sources."
  - Toasts, all success kind, no Undo:
    - "Filled {fields} · from {source}". `{fields}` is a conjunction list of field labels, with themes as "{n} themes".
    - "Nothing to fill."
    - "{sources} didn't answer."
  - On `filled`, call `router.refresh()`. Every result goes to `afterAction`.
- **Where it shows.** `BookDetail` renders the line after Genres, only when `visibility === 'shared' && canEditShared(ctx.user)`.
- Strings in en and fi. Tokens only. 44px tap target.

**Never:**
- No Undo.
- Never overwrite a value. An uploaded cover is a value.
- No writes to `user-books`, copies or overrides.
- No genres.
- Don't touch `sharePrivateBook.ts` or 5.35.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected | Error |
|----------|--------------|----------|-------|
| Fill | no cover, pages or themes; Finna has them | those set, the rest kept; `fields` `['pages','cover','themes']`, `themes` 2 | — |
| Kept | uploaded cover, publisher set; source differs | both unchanged | — |
| Nothing | all set | `nothing`, no write | — |
| Down | sources fail | `unavailable` with `failed`, no write | — |
| Non-admin / private | user role, or admin's private Book | no source call, no write | `NOT_FOUND` |

</intent-contract>

## Code Map

- `lib/catalogue/setCover.ts:26` (`coverGate`); `saveCopy.ts:145-162` (lookup → choose → `storeCover` → tx order); `ensureSharedBook.ts:72-110` (candidate → Book mapping); `covers.ts:172,237`.
- `lib/metadata/lookup.ts:119` `lookupSources`, `cached()` L33.
- `lib/catalogue/pick.ts:32` `chooseCandidate`; `src/access/roles.ts:20` `canEditShared`; `EffectiveBook.visibility`.
- `(sections)/CopyLine.tsx` `ReceiveCopy`; `scan/UnavailableAnswer.tsx:20-34` (source labels, `format.list`).
- Tests: `setCover.int.spec.ts` (NOT_FOUND cases); `saveCopy.int.spec.ts:47,166-197` (`vi.mock('@/lib/metadata/lookup')`, cover fetch spy, media cleanup); `tests/helpers/harness.ts`; `tests/unit/lookup.unit.spec.ts`.

## Tasks & Acceptance

**Execution:**
- `EXPERIENCE.md` (ux-bookeh-2026-10-03) -- record the pick in the Re-fetch row; take the Re-fetch result out of the not-mocked list on L68.
- `src/lib/metadata/lookup.ts` -- `{ fresh }` option.
- `src/lib/catalogue/refetchBook.ts` -- new.
- `(sections)/actions.ts` -- `refetchBookAction`.
- `(sections)/Refetch.tsx` -- new; `(sections)/BookDetail.tsx` -- render it, doc comment.
- `messages/en.json`, `messages/fi.json` -- `detail` strings.
- `tests/int/refetchBook.int.spec.ts` -- the matrix rows; Fill also checks that a `user-books` row is unchanged.
- `tests/unit/lookup.unit.spec.ts` -- `fresh` asks the sources even with a cached `found`.
- `ARCHITECTURE-SPINE.md` -- AD-5 L122: fresh lookup, gate, outcomes. AD-3 L96: add re-fetch to the `canEditShared` places. AD-9 L170 and L177: re-fetch skips the cache read and shares the rate limit.
- `sprint-status.yaml` -- 5.34 `done`.

**Acceptance Criteria:**
- Given the story starts, when work begins, then EXPERIENCE.md records the A + 1 pick before the screen is built.
- Given an admin on a shared Book, when they tap Re-fetch, then:
  - the sources run and only empty shared fields fill, themes and cover included;
  - nothing is overwritten and `user-books` is untouched;
  - a toast names what was filled and from where;
  - the detail redraws.
- Given a non-admin or a private Book, when Book detail renders, then there is no Re-fetch line, and a direct call fails `NOT_FOUND`.

## Spec Change Log

## Review Triage Log

### 2026-10-23 — Review pass
- verdicts: 28 findings — high 0, medium 1, low 15, false 12, maybe-false 0
- findings:
  - `[medium]` `[patch]` Verification gap: no test that re-fetch counts against the lookup limit (spine AD-9). Added a `refetchBook.int` case with its own admin: it fills the window, then expects `RATE_LIMITED`, no `lookupSources` call and an unchanged Book.
  - `[low]` `[patch]` Verification gap: the authors/series fill branch is never run, so AD-4's shared-only rule is unguarded. Added an int case where an existing shared author is reused, a new author and the series are created shared, and `seriesIndex` fills with its series.
  - `[low]` `[reject]` Verification gap: the rollback and race paths that discard a cover are untested. These are the shared `onRollback`/`discardCover` helpers, already covered in `transaction.int` and `covers.int`; a test needs fault injection or a concurrent upload.
  - `[false]` `[reject]` Intent: tests stop at the service while the AC is stated at the UI. The project test policy keeps Playwright to two flows and forbids markup tests, and the service holds the AC's rules.
  - `[false]` `[reject]` Intent: the sources are mocked. That is the standard int seam (`saveCopy.int`, `lookupBook.int`); the real cache bypass is unit-tested.
  - `[false]` `[reject]` Intent: `requireOwnBook` narrows FR-19 to Books the admin holds. The story says "an opened shared Book … in Book detail", and Book detail opens only held Books (AD-7).
  - `[false]` `[reject]` Intent: genres are excluded. The spec says so deliberately (Design Notes), since `mapSubjectsToGenres` is a stub and the genre stories own it.
  - `[low]` `[reject]` Intent: `rawMetadata` is written only when null. Same root as the Blind raw row below; rejected there.
  - `[low]` `[patch]` Intent: a shared Book with no ISBN returns `nothing` untested. Same root as the Blind no-ISBN row; patched there.
  - `[false]` `[reject]` Intent: "not undoable" is added to AD-5 without the AC saying it. EXPERIENCE.md and the spine's AD-20 rule (Undo only where EXPERIENCE lists it) settle this.
  - `[low]` `[reject]` Intent: a partial `found` does not name the failed source. Same root as the Blind partial-outage row; rejected there.
  - `[false]` `[reject]` Intent: the spec status is `in-review` while sprint-status says `done`. Finalization sets both in one commit.
  - `[false]` `[reject]` Intent: the work is uncommitted. Finalization commits it.
  - `[false]` `[reject]` Intent: the mock-up page is not committed. The AC asks for the pick to be recorded in EXPERIENCE.md, and it is.
  - `[low]` `[reject]` Edge: a concurrent admin edit between the transaction read and the update could be overwritten. This needs the single admin to save Edit book within the same milliseconds as a re-fetch; row locking adds complexity.
  - `[low]` `[patch]` Edge: `seriesIndex` fills while the Book holds a different series. Now `seriesIndex` fills only when the series is filled in the same call, or when the candidate's series matches the Book's (`findByName`). Int case "leaves the index empty when the Book has another series".
  - `[low]` `[reject]` Edge: a fresh lookup replaces a cache entry another user's pending save relies on. This needs a re-fetch of the same ISBN while someone sits on its Answer and the source records changed; the save path is unchanged.
  - `[low]` `[reject]` Edge: a cover removed between the gate read and the transaction stays unfilled. The result stays correct (nothing is overwritten); the race needs a removal within one request.
  - `[low]` `[reject]` Edge: a blank author name fails `VALIDATION` and aborts the re-fetch. `ensureSharedBook` does the same on save; adapters do not emit blank names.
  - `[low]` `[reject]` Blind: a `found` outcome built during a Finna outage fills from Google with no warning. The same holds at save (AD-9's partial outcome). Naming failed sources needs a `SourcesOutcome` shape change, and the admin can still edit.
  - `[low]` `[reject]` Blind: the toast credits the first source for gap-filled values. `books.source` is by definition the first source that answered (AD-9), and the toast follows Look it up again's "· from {source}"; per-field provenance adds surface.
  - `[low]` `[reject]` Blind: fresh raw is dropped when the Book already has `rawMetadata`. Nothing reads stored subjects yet (`mapSubjectsToGenres` is a stub); the genre stories decide how stored subjects are refreshed.
  - `[low]` `[patch]` Blind: `seriesIndex` fills independently of `series`. Same root as the Edge row; patched there.
  - `[low]` `[patch]` Blind: a shared Book without an ISBN shows Re-fetch, and a tap says "Nothing to fill.". `BookDetail` now renders the line only when `book.isbn13` is set.
  - `[low]` `[patch]` Blind: the spine's AD-20 not-undoable list lacks `refetchBook`. Added.
  - `[low]` `[patch]` Blind: the authors/series fill branch has no test. Same root as the second verification-gap row; patched there.
  - `[low]` `[reject]` Blind: `Refetch.tsx` repeats the source-label lookup. A helper is an abstraction over four two-line copies (CLAUDE.md: no abstractions for later).
  - `[false]` `[reject]` Blind: the diff leaves out the spec, and the statuses differ. The spec goes to the edge-case layer only, by design; finalization aligns the statuses.

## Design Notes

The candidate is the default pick. `rawMetadata` keeps no record id, so the edition picked at save time can't be found again.

Genres are left to the genre stories, which re-run `mapSubjectsToGenres` over stored subjects. Filling an empty `rawMetadata` gives them those subjects.

A `found` outcome doesn't name failed sources.

## Verification

**Commands:**
- `npm run test:int -- tests/int/refetchBook.int.spec.ts` -- expected: passes
- `npm run test:unit -- tests/unit/lookup.unit.spec.ts tests/unit/messages.unit.spec.ts` -- expected: passes
- `npm run typecheck`, `npm run lint` -- expected: no errors

## Auto Run Result

**Summary:** Admin Re-fetch on a shared Book (FR-19, FR-17a, AD-5), built from Mika's mock-up pick A + 1, which is recorded in EXPERIENCE.md.
- **Book detail:** the admin sees a "Re-fetch" Link line above the foot, with the hint "Fills empty fields from the sources." It shows only on a shared Book that has an ISBN. While it runs it reads "Re-fetching…".
- **Result:** a toast without Undo. "Filled {fields} · from {source}", "Nothing to fill." or "{sources} didn't answer.". After a fill, Book detail redraws.
- **`refetchBook`** in `lib/catalogue`:
  - Uses the cover upload's gate; a non-admin or a private Book is `NOT_FOUND` before any source is asked.
  - Counts against the lookup limit, then asks the sources fresh with `lookupSources(…, { fresh: true })`.
  - Fills only the fields still empty, in one transaction. That includes authors and series (matched among shared records), cover and themes. The series index fills only with its own series.
  - Never writes `user-books`.

**Files changed:**
- `src/lib/catalogue/refetchBook.ts` (new): the service.
- `src/lib/metadata/lookup.ts`: the `{ fresh }` option.
- `src/app/(frontend)/(sections)/actions.ts`: `refetchBookAction`.
- `src/app/(frontend)/(sections)/Refetch.tsx` (new): the Link line and its toasts.
- `src/app/(frontend)/(sections)/BookDetail.tsx`: renders the line for an admin on a shared Book with an ISBN.
- `messages/en.json`, `messages/fi.json`: the `detail.refetch*` strings.
- `src/access/roles.ts`, `src/lib/catalogue/lookupLimit.ts`: doc comments now name re-fetch.
- `tests/int/refetchBook.int.spec.ts` (new): 8 cases.
- `tests/unit/lookup.unit.spec.ts`: the `fresh` case.
- `ARCHITECTURE-SPINE.md`:
  - AD-3: a fourth `canEditShared` place.
  - AD-4: re-fetch among the admin's in-app edits.
  - AD-5: the re-fetch rule.
  - AD-9: `fresh` and the shared rate limit.
  - AD-20: `refetchBook` is not undoable.
- `EXPERIENCE.md`: the Re-fetch row records the pick; the Re-fetch result leaves the not-mocked list.
- `sprint-status.yaml`: 5.34 done.

**Review findings:** one pass, 28 rows in the Review Triage Log.
- **Patched:** medium 1 (a rate-limit int test) and low 4 groups:
  - an int test for the authors/series fill;
  - `seriesIndex` fills only with its own series;
  - no line without an ISBN;
  - AD-20 entry.
- **Deferred:** none.
- **Rejected, all `low`:**
  - the cover-discard path tests
  - the write race
  - the cache entry replaced under a pending save
  - the cover-removal race
  - blank author names
  - partial-outage warning
  - per-field source credit
  - merging fresh raw
  - a source-label helper
- **Rejected as `false`:** the intent auditor's descriptive points and the status/commit timing.

**Follow-up review recommendation:** false. Patched: high 0, medium 1, low 4.

**Verification:**
- `npm run test:int -- tests/int/refetchBook.int.spec.ts`: 5 passed before the patches, 8 after. Ran on the worktree's Postgres, port 5475.
- `npm run test:unit`: 61 files, 880 passed. Includes `lookup` and `messages`.
- The implementer also ran the full int suite before the patches: 523 passed.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors. The 40 warnings are existing migration warnings.
- Matrix audit: Fill, Kept, Nothing, Down and Non-admin/private each map to a passing `refetchBook.int` case.
- Not done: no browser walk-through of the line.

**Residual risks:**
- The Finnish strings are the implementer's ("Hae uudelleen", "Täytetty {fields} · lähteestä {source}") and want a native read.
- Partial outcomes are filled without naming the failed source.
- Stored raw is not refreshed on a Book that already has some. The genre stories should revisit this.
- The spine and EXPERIENCE.md changed, so `epic-5-context.md` is stale until it is recompiled.
