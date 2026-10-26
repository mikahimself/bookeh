---
title: '5.39 [K20] Epic 4 leftovers'
type: 'chore'
created: '2026-10-24'
status: 'done'
baseline_revision: '9b023d8c72c4e725e3eb182f442290e8675dd6f4'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md'
  - '{project-root}/CLAUDE.md'
warnings: ['oversized']
deferred:
  - summary: >-
      Dropping or replacing a non-admin's authors/series override leaves the private author or series it created unreferenced.
    evidence: |-
      upsertUserBook stores null for a dropped key and nothing deletes the private names the old override used; replacing an override behaved the same before this story.
    location: >-
      src/lib/books/upsertUserBook.ts
    severity: low
  - summary: >-
      The override drop is pinned only for title; the authors (ordered ids) and series (id) branches of sameAsShared are untested.
    evidence: |-
      tests/int/editBook.int.spec.ts has one retype case (title), which is what the AC asks for.
    location: >-
      src/lib/catalogue/editBook.ts (sameAsShared)
    severity: low
  - summary: >-
      No above-int4 case for removeCopies or requireOwnCopy (setNote, setStatus), which gained an isRowId check in this story.
    evidence: |-
      grep 2147483648 tests finds only requireOwnBook and editBookAction; the actions already gate those ids with isRowId.
    location: >-
      src/lib/copies/removeCopies.ts, src/lib/copies/updateCopy.ts
    severity: low
  - summary: >-
      The stale bookeh-postgres-last-backup container still exists; Epic 5 item 59 stays open.
    evidence: |-
      docker rm -f was refused by the session's permission check, so the removal is left to Mika.
    severity: medium
  - summary: >-
      PRD FR-47 still says a private Book's cover is visible only to its creator, while AD-5 now shares it in place on promote and merge.
    evidence: |-
      prd.md:198 is unchanged. Epic 4 Decision 1 ("one rule for everyone") and the 5.39 AC drive the new rule. A merge can also put a user's photo on a shared Book the admin left without a cover. This settles when Mika amends FR-47 or narrows the merge rule to the admin (retro R2's wording).
    location: >-
      _bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/prd.md:198
    severity: medium (unverified)
  - summary: >-
      The uncalled flash-toast chain (flash.ts, flashCookie.ts, the ToastProvider effect, about 250 lines with tests) stays after the spine dropped flashToast().
    evidence: |-
      flashToast's only caller is tests/unit/flashCookie.unit.spec.ts; this story took the AC's smaller branch.
    location: >-
      src/app/(frontend)/components/toast/
    severity: low
  - summary: >-
      The spine's Story size row says about 300 hand-written lines; CLAUDE.md says about 500.
    evidence: |-
      ARCHITECTURE-SPINE.md:313 predates b131c37, which set 500 in CLAUDE.md.
    location: >-
      _bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:313
    severity: low
---

<intent-contract>

## Intent

**Problem:** Epic 4's retrospective action items (38–42, 44–46, 51–52) and Epic 5's spec and housekeeping items (58, 59, 64) are still open. A non-admin's own cover is deleted by a promote the source cannot fill, and a merge deletes a cover the shared Book lacks. A non-admin cannot drop an override. One scan's previews cost several lookups. Row ids above int4 reach Postgres and come back `INTERNAL`. Edit book's over-long text never says "Too long.", and Edit book and manual entry normalise text differently. The spine, the epics, the design and context documents and CLAUDE.md have stale lines. CI never builds the image on a branch.

**Approach:** Small service fixes in `lib/catalogue`, `lib/books`, `lib/copies` and `lib/payload`, each with the one test its rule needs. One shared `isRowId()`, `idOf()` and `isPlainObject()`. Text edits to the planning documents, plus one CI step, one lint ignore and a `bmad-build`/`bmad-build-auto` customization that raises the `oversized` threshold.

## Boundaries & Constraints

**Always:**
- Every changed spine contract (AD-5 cover and genres rules, AD-9 preview counting, AD-14 media and preview lines, the Design Paradigm import line, the Text input, Toasts and Tests rows, Search indexing) is updated in this commit.
- The id bound is `1 ≤ id ≤ 2147483647`, integer. Bad ids keep each caller's current result code: `VALIDATION` at action boundaries, `NOT_FOUND` in services, `undefined`/`null` in parsers. Services reject a bad id with no read.
- Single-line text a user types (title, subtitle, author and series names, publisher, language) is NFC-normalised and trimmed, and whitespace runs collapse to one space (`normaliseName`). The description is NFC-normalised and trimmed only, so it keeps its line breaks. `''` is stored as `null`, as today.
- Length checks use `src/fields/limits.ts` on the normalised value, with the same rule as `normaliseManual()`.

**Never:**
- No screen, message-catalogue or schema change. No migration.
- Do not touch the shelf/suggest `q` normalisation, `parseShelfQuery`'s `tag`/`theme`, `lookupAgain`'s rate-limit counting or `moveCopies`' return value. Those belong to Story 5.38.
- Do not delete the flash-toast code. The Toasts row drops the `flashToast()` sentence instead (the smaller choice the AC allows).
- Do not edit `.claude/skills/*` or `_bmad/render/*`. Updates overwrite them.
- Do not drop `spec-5-18`'s deferred phone check. Its HEIC and camera halves are not recorded anywhere.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Promote, source has no cover | non-admin's private Book with an uploaded cover; candidate without `coverUrl` | Book promoted; the same media row is now `visibility: shared`, `createdBy: null`; `books.cover` points at it | none |
| Promote, download fails | same, candidate `coverUrl` returns HTTP 500 | same as above | download warning logged, as today |
| Promote, source cover fetched | non-admin, source cover downloads | source cover attached; user's upload deleted when unreferenced (unchanged) | none |
| Merge, shared Book has no cover | private Book with a cover meets a shared Book without one | copies and `user-books` move; the private cover row is shared in place and becomes the shared Book's cover | none |
| Merge, shared Book has a cover | as above, shared Book already has a cover | shared cover kept; private cover deleted when unreferenced (unchanged) | none |
| Retype shared value | non-admin B with title override "X" on shared "Kalevala"; edits title `' Kalevala '` | override dropped; effective `overridden` no longer has `title` | none |
| Preview counting | lookup records 2 un-held cover URLs for user+ISBN | first fetch counts 1 lookup; second URL's fetch counts 0 | a failed fetch re-arms counting, so the next fetch of that record counts again |
| Id above int4 | `requireOwnBook(ctx, 2147483648)`; `editBookAction({ bookId: 2147483648 })` | `NOT_FOUND` with no read; `VALIDATION` | none |
| Too long on Edit book | title 501 chars, an author 201 chars, series 201 chars | `VALIDATION` with `fields.title / authors / series = 'TOO_LONG'`, no write | screen shows "Too long." (already wired in `MoreDetails.tsx:121`) |
| Whitespace runs | Edit book title `'  Seitsemän   veljestä '` | stored `'Seitsemän veljestä'` | none |

</intent-contract>

## Code Map

Covers on promote and merge (item 38):
- `src/lib/catalogue/sharePrivateBook.ts` -- `prepareShare()` 58–84 (no cover when `coverUrl` is missing or `storeCover()` fails). `promote()` cover branch 211–218: `admin && own.cover != null` → `shareCoverRow()`, else `coverId = cover ? attachCover(...) : null`. `shareCoverRow` 251–259 is one system `payload.update({ visibility: 'shared' })`; the `createdByFromRequest` hook (`src/fields/visibility.ts:13–24`) clears `createdBy`. `merge()` 265–276 has no cover rule. `removeOrphans()` 284–302 deletes only unreferenced rows, so it needs no change. Fix the docs at 102–105 and 280, and the `shareCoverRow` doc ("The admin's").
- `tests/int/sharePrivateBook.int.spec.ts` -- helpers `freshUser` 133, `privateBook` 142, `sharedBook` 152, `promoteSetup` 201, `upload` 259, `trackCover` 124, `exists` 119, `fetchSpy` 178. The admin share-in-place case 271–288 is the assertion model. The case at 290–312 (non-admin, no source cover → upload deleted) flips. The case at 518–553 (merge deletes the cover) needs a shared Book with a cover to stay valid.

Override drop (item 51):
- `src/lib/catalogue/editBook.ts` -- `writeBook` 194–269. It selects `{ visibility, createdBy }` at 202–207 and resolves names in `'private'` scope (`findByName` matches shared rows first, so a retyped shared author resolves to the shared id) at 218–234. Admin: `dropOverrides: overridable` 263. Non-admin: everything goes into `overrides` 264–267. Fix the docs at 102–104 ("nothing is compared with stored values") and 136–138.
- `src/fields/bookFields.ts:7–18` -- overridable keys.
- `src/lib/books/upsertUserBook.ts:82–161` -- `dropOverrides` stores `null` and removes the key from `overridden`. A drop-only write with no row creates nothing (141).
- `tests/int/editBook.int.spec.ts` -- `sharedX()` 79, `seen()` 89, `asB`. The model case is at 134.

Preview counting (item 52):
- `src/lib/catalogue/coverPreview.ts` -- `PreviewEntry` 30–34 (`urls`, `expiresAt`, `covers: Map<url, HeldCover>`). `keyOf` 40 is `${userId}:${isbn13}`. `recordCoverPreview()` 49–69 replaces the entry on each lookup. `limitLookups(ctx)` at 104 runs for every un-held URL. Header comment 12–14, doc 75–77.
- `src/lib/catalogue/lookupLimit.ts` -- caller comment 5–13, doc 26–36.
- `tests/int/coverPreview.int.spec.ts` -- cases 207–222 (second un-held pick → 429) and 224–236 ("counts a failed fetch") encode the old rule. 189 stays.

Ids and helpers (item 39):
- `src/lib/payload/ref.ts` -- holds only `type Ref`. The new home of `isRowId()` and `idOf()`.
- Id checks to replace: `src/lib/books/requireOwnBook.ts:19`; `src/lib/copies/updateCopy.ts:52–58` (`requireOwnCopy`, no check today); `src/lib/copies/moveCopies.ts:41`; `src/lib/copies/removeCopies.ts:15–23` (no check); `src/lib/copies/receiveCopy.ts:31`; `src/lib/books/setRead.ts:78`; `src/lib/copies/locations.ts:122` (`isId`); `src/lib/shelf/query.ts:96–100` (own `MAX_ID`); `src/app/(frontend)/books/[bookId]/edit/actions.ts:41–42` (`id()`), `:12–13` and `:22–23` (genre ids via `Number.isInteger`); `edit/savedCopy.ts:11,23` (`MAX_ID`) and `edit/page.tsx:59`; `src/app/(frontend)/(sections)/actions.ts:24–25`; `(sections)/settings/actions.ts:22–27`; `src/app/(frontend)/actions/catalogue.ts:22–23`; `src/app/(frontend)/ref.ts:18` (`parseRef`).
- `src/app/(frontend)/scan/actions.ts:53–64` -- `isSaveInput` has no row id. `pick` is a candidate index ≥ 0 and `candidate` is `{ source, recordId }` strings. It stays as is (deviation from the AC, recorded in Design Notes).
- `idOf` copies: `src/lib/books/effectiveBook.ts:63`, `src/lib/books/holdings.ts:29`, `src/lib/books/setRead.ts:104`, `src/lib/catalogue/handEnteredValues.ts:43` (exported, imported by `sharePrivateBook.ts:26`), `src/lib/copies/moveCopies.ts:94–95`, `src/lib/catalogue/setCover.ts:17–18`. Inline: `copies/locations.ts:63`, `books/upsertUserBook.ts:191`, `catalogue/editBook.ts:210`.
- `isPlainObject` copies, all in `src/app/(frontend)`: `ref.ts:3–7`, `profileChanges.ts:8–12`, `prefs.ts:49–53`, `books/[bookId]/edit/actions.ts:35–39`, `edit/draft.ts:15–19` (client-imported; stricter prototype test).
- `eslint.config.mjs:439–443` -- the frontend's `lib/payload` `allowImportNames`. Spine line 63 states the same rule.
- `tests/int/requireOwnBook.int.spec.ts:63–73` -- bad ids `[0, -1, 1.5, NaN]` at 66.

Limits and normalisation (item 40):
- `src/lib/catalogue/editBook.ts` -- `normalise` 80–85 (trim, NFC, `''`→null). The pure pass is 151–184. Authors at 168–173 are only blank-checked. Errors are thrown as `DomainError('VALIDATION', { fields })` at 183.
- `src/lib/catalogue/createPrivateBook.ts:31–52` -- `normaliseManual()`, the TOO_LONG pattern to copy.
- `src/fields/sortName.ts:4–5` -- `normaliseName` (NFC, trim, `/\s+/g`→' ').
- `src/fields/limits.ts:6–12` -- `title 500`, `subtitle 500`, `description 10_000`, `name 200`.
- `src/lib/books/upsertUserBook.ts:48–53` -- the same trim+NFC `normalise`.
- `tests/int/editBook.int.spec.ts:223–238` -- `rejectsNaming(call, keys, code)`, whose code union needs `'TOO_LONG'`.

Lint (items 41, 42):
- `eslint.config.mjs` -- `const systemPrivileges` 201 (not exported; `clientLibImports` is exported at 93). It reports `restricted` for a non-`false` `overrideAccess` property and `importOutside` for a value import of `src/lib/catalogue/system` from outside `src/lib/catalogue/`. `globalIgnores([` is at 480–489.
- `tests/unit/clientLibImports.unit.spec.ts` -- the `RuleTester` harness (typescript-eslint parser, absolute filenames via `path.resolve(import.meta.dirname, '../../src/...')`).

Documents, CI, process (items 44–46, 58, 59, 64):
- Spine `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md`:
  - :63 frontend imports
  - :119 AD-5 cover
  - :120 AD-5 genres ("written only by `mapSubjectsToGenres()`")
  - :178 AD-9 limit
  - :223 AD-14 preview "fetched once and held per user"
  - :226 AD-14 media "a private Book's cover is private"
  - :297 Text input
  - :301 Toasts (`flashToast()`)
  - :314 Tests ("never truncate")
  - :630 Search indexing
- `_bmad-output/implementation-artifacts/epic-3-context.md:84` (D-8 wording; copy from spine :119 "the creator's former values that differ beyond case, whitespace and punctuation become their overrides (an admin's are dropped)") and `:85` (`flashToast()`).
- `_bmad-output/implementation-artifacts/epic-4-context.md:44` ("about 5 MB").
- `_bmad-output/planning-artifacts/epics.md`:
  - :1898 and :1899 (4.2, "including a cleared field")
  - :1771 (4.18, "per user, ISBN and pick")
  - :2047 and :2056 (4.12, "about 5 MB")
  - :2089 (4.14, "Save uploads through `setCover` in the same save")
  - 6.9 at :2810 and 7.12 at :3040 (no chip clause; 5.21's clause is at :2393)
- Code facts behind the size wording: `covers.ts:32` (`5 * 1024 * 1024`), `next.config.ts:17` (`'6mb'`).
- `_bmad-output/implementation-artifacts/spec-5-7-e14-shelf-timing-at-10-000-copies.md:21,34,36,63,159`. Commit `e606558` rewrote the author search arm (`src/lib/shelf/search.ts`) and the sort-key lookup (`effective.ts`) and added `analyze` after the seed in `tests/int/shelfTiming.int.spec.ts`. That took text search from 3–5 s to ~130 ms and author sort from 0.8–1.5 s to ~80 ms. No index.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md:84–98` spacing tokens (`panel-width: 360px`, no filter width). Code: `src/app/(frontend)/styles.css:93` `--spacing-filter-width: 220px`.
- `CLAUDE.md:70` compact-stories line, `:71` spine-update rule.
- `.github/workflows/ci.yml` -- `check` job (`timeout-minutes: 20` at :17, runs on every push and PR). The publish job's smoke build uses `context: .` and `build-args: DEPLOYMENT_ID=${{ github.sha }}`.
- `_bmad/custom/` -- holds only `config.toml`. The customization layer (`_bmad/scripts/render_skill.py`, `config_utils.py:110`) merges `_bmad/custom/<skill>.toml` over `customize.toml`, and lists append. `persistent_facts` exists for both `bmad-build` and `bmad-build-auto`. The 1600 is literal text in `.claude/skills/bmad-build-auto/step-02-plan.md:15`, `spec-template.md:13` and `.claude/skills/bmad-build/{step-02-plan.md:26,42, spec-template.md:11, workflow.md:23,28}`.
- Epic 5 plan-time spec sizes (Spec Change Log, Review Triage Log and Auto Run Result excluded): median ~1300 tokens, p75 ~1810, max ~2630. 14 of 37 specs warned.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/sharePrivateBook.ts` -- Promote: share `own.cover` in place when `own.cover != null && (admin || !cover)`, and discard a downloaded `cover` only in the admin case. Merge: keep the `readBook(tx, sharedId)` result. When it has no cover and `own.cover != null`, call `shareCoverRow()` and system-update the shared Book's `cover` to that id, before `removeOrphans`. Update the three doc comments. -- R1, R2, one rule for everyone (Epic 4 Decision 1).
- `tests/int/sharePrivateBook.int.spec.ts` -- Flip the 290–312 case to share-in-place for a non-admin with no source cover. Add a failed-download variant (`fetchSpy` → `new Response(null, { status: 500 })`). Give the 518–553 merge case a covered shared Book. Add one merge case where the shared Book has no cover: same media id, `visibility: shared`, `createdBy` null, shared Book's `cover` equals it.
- `src/lib/catalogue/editBook.ts` -- Non-admin shared path: also select the overridable fields at depth 0. After name resolution, split keys into `overrides` (differing) and `dropOverrides` (equal: scalars `===` with null/undefined as null, authors as ordered id arrays, series by id). Make one `upsertUserBook` call. Replace `normalise` with the single-line/description rule (below). Check title, subtitle, description, each normalised author and the series against `limits`, with `TOO_LONG` on `title`, `subtitle`, `description`, `authors`, `series`. Drop the "Field limits stay with the collections" line and fix the docs. -- items 40, 51.
- `src/fields/sortName.ts` -- Export `normaliseText(value, { multiline })` (or an equivalent single helper beside `normaliseName`): single-line → `normaliseName`, multiline → trim+NFC. Used by `editBook` and `upsertUserBook`. `normaliseManual` keeps `normaliseName`.
- `src/lib/books/upsertUserBook.ts` -- Use the shared helper for text overrides (description multiline). Use `idOf` from `lib/payload/ref` at 191.
- `tests/int/editBook.int.spec.ts` -- Widen `rejectsNaming` to `'TOO_LONG'`. Add one `it.each` over title 501, an author 201 and series 201 → `TOO_LONG` on that key with no write. Add one case: title with whitespace runs is stored collapsed. Add one case: B overrides the title, then edits it back to `' Kalevala '` → `overridden` lacks `title`.
- `src/lib/catalogue/coverPreview.ts` -- Add `counted: boolean` to `PreviewEntry` (false on record). In `fetchCoverPreview`, call `limitLookups` only while `!entry.counted`, and set it true after `limitLookups` passes, before the fetch. On a failed fetch, set it back to false. Update the header and doc comments.
- `src/lib/catalogue/lookupLimit.ts` -- Caller comment and doc: a cover preview counts once per record (user + ISBN), and again after a failed fetch.
- `tests/int/coverPreview.int.spec.ts` -- Rework 207–222: a second un-held URL of the same record is served without counting (exhaust the limit to one remaining, then fetch two picks → both 200). Rework 224–236: a failed fetch re-arms counting.
- `src/lib/payload/ref.ts` -- Add `MAX_ROW_ID = 2147483647`, `isRowId(value: unknown): value is number` (integer, 1..MAX) and an overloaded `idOf` (number | `{ id }` → number; null/undefined pass through). Keep it pure, with no imports.
- The id callers in the Code Map -- Use `isRowId` (drop the local `MAX_ID`s, `isId`s and `id()` bodies, keeping each caller's result code). Add the check to `requireOwnCopy` and `removeCopies` (`NOT_FOUND`, no read). Genre ids in `edit/actions.ts` use it too.
- The `idOf` copies in the Code Map -- Import from `@/lib/payload/ref`. Delete the local copies, including the `handEnteredValues.ts` export, and re-point `sharePrivateBook.ts`. Lib inline copies use it where they are a plain `idOf`.
- `src/app/(frontend)/plainObject.ts` -- New: `isPlainObject` (the null-prototype-allowing variant). Replace the five copies.
- `eslint.config.mjs` -- Add `'isRowId'` to the frontend `lib/payload` `allowImportNames` and its message. Export `systemPrivileges`. Add `'.claude/**'` to `globalIgnores`.
- `tests/unit/clientLibImports.unit.spec.ts` -- Second `ruleTester.run('bookeh/system-privileges', ...)`. Filename `src/lib/copies/x.ts`: `overrideAccess: true`, `'overrideAccess': true`, shorthand `{ overrideAccess }` and `overrideAccess: flag` are invalid (`restricted`); `overrideAccess: false` is valid. `import { system } from '@/lib/catalogue/system'` is invalid in `src/fields/x.ts` (`importOutside`) and valid in `src/lib/catalogue/x.ts`.
- `tests/int/requireOwnBook.int.spec.ts` -- Add `2147483648` to the bad-id list.
- `ARCHITECTURE-SPINE.md`:
  - :63 adds `isRowId`.
  - :119 states the new cover rule: the user's cover is shared in place when they are the admin or the source cover is missing or fails; otherwise it is replaced by the source's. On a merge into a shared Book without a cover, the user's cover is shared in place and becomes its cover.
  - :120 says shared genres are written by `mapSubjectsToGenres()` and by the admin's `editBook()`.
  - :178 adds that a cover preview counts once per record, and again after a failed fetch.
  - :223 is consistent with :178.
  - :226 adds that a private cover becomes shared when a promote or merge shares it in place (AD-5).
  - :297 states the normalisation rule (single-line collapse, description keeps line breaks; `editBook`, `upsertUserBook`, `normaliseManual`) and the `TOO_LONG` on-field rule.
  - :301 drops the `flashToast()` sentence.
  - :314 drops "never truncate" and names `npm run test:reset`.
  - :630 records that the timing test failed in CI and `e606558`'s plan rewrite plus `analyze` fixed it; the test stays the gate for indexes.
- `epic-3-context.md:84–85` -- Use the D-8 wording and drop the `flashToast()` claim. `epic-4-context.md:44` -- "5 MiB file, 6 MB body".
- `epics.md`:
  - 4.2 (:1898, :1899): "including a cleared field, except title".
  - 4.12 (:2047, :2056): "5 MiB file, 6 MB body".
  - 4.14 (:2089): "after the edits commit, in its own transaction".
  - 4.18 (:1771): "per user and ISBN, bytes per cover URL".
  - 6.9 and 7.12: each adds "**And** a chip in Book detail opened from here opens the collection with only that filter (5.21)".
- `spec-5-7-e14-shelf-timing-at-10-000-copies.md` -- Add a dated post-merge note recording the CI failure and the `e606558` fix (plan rewrite in `search.ts`/`effective.ts`, `analyze` in the test, no index). Mark lines 34/36 as superseded by it.
- `DESIGN.md` -- Add `filter-width: 220px` to the spacing tokens and name it in the filter panel description.
- `CLAUDE.md` -- Conventions:
  - A deferred item handed to a later story is one of its acceptance criteria, or it stays with the story that deferred it.
  - A story built beside others names the files it shares in Residual risks.
  - The compact-stories line names the new 2500-token `oversized` bound.
- `_bmad/custom/bmad-build-auto.toml`, `_bmad/custom/bmad-build.toml` -- New. Each adds `persistent_facts`: the `oversized` threshold is 2500 tokens of plan-time spec (replacing every 1600 in the skill's steps and template), and the warning is never a reason to split or halt (CLAUDE.md).
- `.github/workflows/ci.yml` -- In `check`, after `npm run typecheck`, add `docker build --build-arg DEPLOYMENT_ID=${{ github.sha }} .` (no push). Raise `timeout-minutes` to 30.
- Housekeeping -- `docker rm -f bookeh-postgres-last-backup`. Keep `epic-5-context.md` (recompiled this run) in the commit. Set `5-39-k20-epic-4-leftovers` in `sprint-status.yaml`, plus the Epic 4 items 38–42, 44–46, 51–52 and Epic 5 items 58, 59, 64 it closes, to `done`.

**Acceptance Criteria:**
- Given a non-admin promote whose source has no cover or whose download fails, when it runs, then the user's own media row is shared in place (same id, `shared`, `createdBy` null) and is the Book's cover; integration cases for both.
- Given a merge into a shared Book with no cover, when it runs, then the private cover is shared in place and becomes the shared Book's cover; one integration case; AD-5 updated.
- Given a non-admin retypes the shared value of an overridden field, when Edit book saves, then the override is dropped; one integration case.
- Given one Answer with several un-held covers, when the picker fetches them, then the user+ISBN record costs one lookup; AD-9 and `lookupLimit.ts` updated.
- Given any row id above 2147483647, when it reaches the six named callers (and the other id checks), then it is rejected by the same `isRowId()` with each caller's code and no read; `requireOwnBook`'s bad-id case includes `2147483648`; one `idOf` and one `isPlainObject` remain.
- Given an over-long title, subtitle, description, author or series on Edit book, when Save runs, then `VALIDATION` names that key `TOO_LONG` and nothing is written; whitespace runs collapse the same way in `editBook`, `upsertUserBook` and `normaliseManual`; the spine's Text input row names the rule.
- Given `npm test`'s unit lane, when it runs, then `bookeh/system-privileges` `RuleTester` cases pass beside `client-lib-imports`.
- Given the documents, when the story is done, then every line listed under Execution for the spine, context files, `epics.md`, `spec-5-7`, DESIGN.md and CLAUDE.md reads as specified, and `spec-5-18` keeps its deferred phone check.
- Given a re-render of `bmad-build-auto` and `bmad-build`, when `render_skill.py` runs, then the rendered `workflow.md` lists the 2500-token `oversized` fact.
- Given any branch push, when CI runs `check`, then `docker build` runs in it; `npm run lint` ignores `.claude/**`; `bookeh-postgres-last-backup` no longer exists.

## Spec Change Log

## Review Triage Log

### 2026-10-25 — Review pass
- verdicts: 34 findings — high 0, medium 4, low 21, false 7, maybe-false 2
- findings:
  - `medium` `patch` (edge-case) Concurrent requests for one un-held preview URL each fetch while one lookup is counted — real: `counted` is set before the await, so parallel requests skip `limitLookups` and all call `fetchCover`; fixed with a per-URL in-flight promise on the record.
  - `low` `patch` (edge-case) `keepWithinBytes` clears a record's covers while `counted` stays true, so evicted covers re-fetch uncounted — real; fixed by resetting `counted` where the covers are cleared.
  - `low` `patch` (edge-case) `sameAsShared` compares the normalised edit with the raw stored string — real for source text with whitespace runs; fixed by normalising the stored string before comparing.
  - `low` `defer` (edge-case) Dropping an override leaves the private author/series it created unreferenced — real but pre-existing: replacing an override never cleaned its private names either.
  - `low` `reject` (edge-case) Two users merging into one cover-less shared Book at once orphan a shared media row — needs two concurrent users on the same ISBN (v1 has one); the fix adds row locking.
  - `false` `reject` (edge-case) `epics.md` 4.14's cover clause contradicts the new rule — Story ACs record what each story built (4.14 built that rule); the current rule lives in AD-5 and `epic-4-context.md`, both updated. Item 44 asked only for 4.14's "after the edits commit" wording.
  - `low` `reject` (edge-case) An inline id-or-object expression remains in `savedCopy.ts` — it is not a helper copy and is not in this spec's `idOf` list; folding it means widening the frontend's `lib/payload` allowlist and the spine for one expression.
  - `medium` `patch` (verification-gap) "Covers loading at once count once" is pinned only for sequential fetches — the case now requests both picks with `Promise.all`.
  - `medium` `patch` (verification-gap) The description's line-break exemption is untested — the whitespace case now edits a two-paragraph description.
  - `low` `patch` (verification-gap) `TOO_LONG` for subtitle and description is untested though the AC names them — rows added to the `it.each`.
  - `low` `defer` (verification-gap, filed defer) The override drop is pinned only for `title`; the authors/series id branches are unguarded — the AC asks for one integration case, and it exists.
  - `low` `defer` (verification-gap, filed defer) No above-int4 case for `removeCopies` / `requireOwnCopy` — the actions gate those ids with `isRowId`, and the helper's bound is pinned by `requireOwnBook` and `editBookAction`.
  - `false` `reject` (intent-alignment) The merge shares a non-admin's cover, wider than retro R2's admin-only wording — the 5.39 AC says "the user's own cover is shared in place, as the admin's is" for both promote and merge, and Epic 4 Decision 1 is "one rule for everyone". Flagged for Mika in Auto Run Result.
  - `low` `patch` (intent-alignment) After a failed fetch the whole record counts again, against the AC's "further covers of the same Answer do not" — re-arming is now per failed URL.
  - `false` `reject` (intent-alignment) Tooling changes are not shown to have run — lint, typecheck, both test lanes, a local `docker build` and the skill re-render all ran in step 3 (Auto Run Result).
  - `medium` `defer` (intent-alignment) `bookeh-postgres-last-backup` still exists and Epic 5 item 59 stays open — `docker rm -f` was refused by this session's permission check, so the removal is left to Mika.
  - `false` `reject` (intent-alignment) `isSaveInput` does not use `isRowId` — it carries no row id (Design Notes).
  - `low` `reject` (intent-alignment) Promote and merge cover rules are not exercised through `lookupAgain()` — the same `promote()`/`merge()` run on both paths, and the test asks for no criterion or spine rule beyond the `saveCopy` cases.
  - `maybe-false` `reject` (intent-alignment) Whitespace collapse is not exercised through `upsertUserBook` and `normaliseManual` on their own — the `editBook` case runs as a non-admin through `upsertUserBook`, and `normaliseManual`'s collapse has its own tests in `createPrivateBook.int.spec.ts`. A separate `upsertUserBook` test would only settle a `low`.
  - `maybe-false` `defer` (blind) The PRD's FR-47 ("a private Book's creator sets that Book's cover, visible only to them") is not amended for sharing in place on promote/merge, and a merge can put a user's photo on a shared Book the admin left without a cover — medium if it stands (unverified). It settles when Mika amends FR-47 to Epic 4 Decision 1 or narrows the merge rule.
  - `low` `reject` (blind) `epics.md` 4.14 still has the old cover clause — same as the edge-case row: history, not current rule.
  - `low` `patch` (blind) `epics.md:178` and `flashCookie.ts`'s header still claim the dropped `flashToast()` spine rule — clause removed and comment reworded. Story 1.17's ACs (710, 904) stay as history.
  - `low` `defer` (blind) The uncalled flash-toast chain (`flash.ts`, `flashCookie.ts`, the provider effect, about 250 lines) stays — this spec chose the smaller AC branch, so deleting it is recorded for a later tidy-up.
  - `low` `defer` (blind) The spine's Story size row says about 300 lines; CLAUDE.md says about 500 — pre-existing since `b131c37`, not caused here.
  - `low` `patch` (blind) The recompiled `epic-5-context.md` misstates the Text input rule and the id check — both bullets updated.
  - `false` `reject` (blind) `publisher` and `language` have no length limit — none exists in `src/fields/limits.ts` or the collections, so no "over its limit" promise is broken; this is pre-existing and outside item 40's five fields.
  - `low` `patch` (blind) One failed cover re-arms counting for the whole record — same root as the intent-alignment row; per-URL re-arm.
  - `low` `reject` (blind) The CI `docker build` has no layer cache — CI time only; adding buildx with a GHA cache is more than a direct correction.
  - `false` `reject` (blind) Item 58 is `done` with `spec-5-18`'s phone check pending — that AC part is conditional on the phone session, which Epic 5 item 57 (still open) and `spec-5-18`'s deferred entry carry.
  - `low` `patch` (blind) The 'failed' download case never asserts a fetch happened — `expect(fetchSpy).toHaveBeenCalled()` added.
  - `low` `reject` (blind) `normaliseText()` lives in `sortName.ts` — the spine names the file. Moving it is churn with no named harm.
  - `low` `patch` (blind) Rewritten doc comments are not reflowed — reflowed.
  - `false` `reject` (blind) The 2500-token fact may not reach the skills' check — `persistent_facts` is the customization layer the skills offer; the rendered `workflow.md` lists it under Persistent Facts (verified by re-render). The skill files themselves are overwritten on update.
  - `low` `reject` (blind) The fact's text is duplicated in two toml files — each skill reads only its own customization, so the copies cannot be shared; drift between them is negligible.

## Design Notes

- **`isSaveInput` deviation:** the AC lists it among the `isRowId` callers, but it carries no row id (`pick` is an index, `candidate` a pair of strings), so it is left as is. Every other id check in `src` uses the helper, which goes beyond the six named callers, per the retro's "name the other callers of the same rule".
- **`isRowId` in `lib/payload/ref.ts`:** this is the retro's home for it. Frontend actions need it, so the Design Paradigm import line gains one name. `ref.ts` stays import-free, because `lib/shelf/query.ts` (client-importable) uses it.
- **Preview counting on failure:** counting only once per record would let a failing URL be retried without limit, and each retry is an outbound request. Re-arming counting after a failure keeps outbound traffic under the rate limit. The normal case, several covers loading at once, still costs one lookup, because the flag is set before the first fetch starts.
- **Override comparison is exact** on the normalised, resolved value, not D-8's loose key. The AC says "compares each normalised edit with the stored shared value".
- **Flash toast:** the spine drops the claim. The uncalled `flashToast()` chain (`flash.ts`, `flashCookie.ts`, the provider effect, about 250 lines with tests) stays; deleting it would roughly double this story's diff.
- **2500 tokens** is below the max plan-time Epic 5 spec (~2630) and well above p75 (~1810), so typical stories pass and outliers still warn.

## Verification

**Commands:**
- `npm run lint` -- expected: 0 errors
- `npm run typecheck` -- expected: no errors
- `npm run test:unit` -- expected: all pass, including the new `system-privileges` cases
- `npm run test:int` -- expected: all pass, including the sharePrivateBook, editBook, coverPreview and requireOwnBook cases
- `docker build --build-arg DEPLOYMENT_ID=local .` -- expected: image builds
- `uv run --no-cache _bmad/scripts/render_skill.py --project-root "$PWD" --skill "$PWD/.claude/skills/bmad-build-auto"`, then read the printed workflow.md -- expected: Persistent Facts lists the 2500-token `oversized` fact (same for `bmad-build`)
- `docker ps -a --filter name=bookeh-postgres-last-backup -q` -- expected: empty

## Residual risks

- Story 5.38 shares `src/app/(frontend)/(sections)/actions.ts`, `src/lib/shelf/query.ts`, `src/lib/copies/moveCopies.ts`, `src/lib/catalogue/lookupLimit.ts` (caller comment), AD-9 and the spine's Text input row. Whichever merges second resolves those conflicts.

## Auto Run Result

Status: done

**Summary:** Story 5.39 lands Epic 4 retro items 38–42, 44–46 and 51–52 and Epic 5 items 58 and 64. Item 59 is done except the container removal (see Residual risks).
- **Covers:** a promote shares the user's own cover in place when the source cover is missing or fails. A merge into a cover-less shared Book shares the private cover in place.
- **Overrides:** a non-admin who retypes the shared value drops their override.
- **Preview lookups:** a cover preview counts once per record, again only for a cover whose fetch failed. Concurrent fetches of one URL share one request.
- **Ids and helpers:** one `isRowId()` (int4 bound) and one `idOf()` in `lib/payload/ref.ts`, and one `isPlainObject()` in `(frontend)/plainObject.ts`.
- **Edit book text:** `TOO_LONG` for title, subtitle, description, authors and series. One normalisation rule (`normaliseText()`).
- **Lint:** `RuleTester` cases for `bookeh/system-privileges`, and `.claude/**` ignored.
- **CI:** `docker build` in CI's `check` job.
- **Threshold:** a 2500-token `oversized` threshold through `_bmad/custom/*.toml`.
- **Documents:** spine, epics, context files, `spec-5-7`, DESIGN.md and CLAUDE.md reconciled.

**Files changed:**
- `src/lib/payload/ref.ts`: `isRowId`, `MAX_ROW_ID` and `idOf`.
- About 20 callers: their id checks use `isRowId`, and their `idOf` and `isPlainObject` copies are removed.
- `src/app/(frontend)/plainObject.ts` (new): the shared `isPlainObject`.
- `src/lib/catalogue/sharePrivateBook.ts`: the promote and merge cover rules.
- `src/lib/catalogue/editBook.ts`: limits, normalisation and the override drop (`sameAsShared`).
- `src/fields/sortName.ts`: `normaliseText()`.
- `src/lib/books/upsertUserBook.ts`: uses the shared normalisation.
- `src/lib/catalogue/coverPreview.ts` and `lookupLimit.ts`: per-record counting, per-URL re-arm, the in-flight map and the eviction reset.
- `eslint.config.mjs`: `systemPrivileges` exported, `isRowId` allowed for the frontend, `.claude/**` ignored.
- `.github/workflows/ci.yml`: `docker build` in `check`, timeout 30 minutes.
- `_bmad/custom/bmad-build.toml` and `bmad-build-auto.toml`: the 2500-token fact.
- Tests: `sharePrivateBook`, `editBook`, `editBookAction`, `coverPreview`, `requireOwnBook` and `clientLibImports`.
- Docs:
  - ARCHITECTURE-SPINE.md: AD-5, AD-9, AD-14, the import line, and the Text input, Toasts and Tests rows, plus Search indexing.
  - `epics.md`: 4.2, 4.12, 4.14, 4.18, 6.9, 7.12 and the requirements list.
  - `epic-3/4/5-context.md`, `spec-5-7`, DESIGN.md, CLAUDE.md and `sprint-status.yaml`.

**Review:** 34 findings — high 0, medium 4, low 21, false 7, maybe-false 2.
- **Patches applied (12, with 3 at medium):**
  - in-flight fetch sharing (medium)
  - concurrent-picks test (medium)
  - description line-break test (medium)
  - eviction counting reset
  - stored-value normalisation in the override compare
  - per-URL re-arm (two findings)
  - subtitle and description `TOO_LONG` rows
  - the failed-download fetch assertion
  - the `flashToast` lines in `epics.md:178` and `flashCookie.ts`
  - the `epic-5-context.md` bullets
  - comment reflow
- **Deferred (7, see frontmatter):**
  - orphaned private names
  - the authors/series drop branches
  - above-int4 service cases
  - the stale container
  - PRD FR-47 against share-in-place
  - the dead flash chain
  - the spine's Story size row
- **Rejected:** every reason is in the Review Triage Log. In short:
  - concurrent merges need two users;
  - 4.14's AC is history;
  - the `savedCopy` inline expression is not a helper copy;
  - the merge rule for everyone follows the AC and Decision 1;
  - the tooling did run;
  - `isSaveInput` has no row id;
  - `lookupAgain` shares `promote` and `merge`;
  - the whitespace paths are covered;
  - `publisher` and `language` have no limit;
  - a CI cache is not worth the complexity;
  - item 58's phone check is carried by item 57;
  - `normaliseText`'s home is fine;
  - the customization layer is the right mechanism, so the duplicated fact is acceptable.

**Follow-up review recommended: true.** Three medium entries were patched. The specific unverified risk is the cover-preview rewrite from the patch pass: the in-flight map, the per-URL `failed` set and the eviction reset in `coverPreview.ts`. It is covered by the two reworked int cases, but no review layer has read it.

**Verification:**
- `npm run lint`: 0 errors (40 warnings, all in migrations).
- `npm run typecheck`: clean.
- `npm run test:unit`: 893 passed.
- `npm run test:int`: 549 passed.
- `docker build --pull=false --build-arg DEPLOYMENT_ID=local .`: built. Without `--pull=false`, BuildKit hangs resolving the base image digest on this machine.
- Re-rendering `bmad-build-auto` and `bmad-build`: each `workflow.md` carries the 2500-token fact.
- `docker ps -a --filter name=bookeh-postgres-last-backup -q`: still returns `3df82574f838`, not removed.

**Residual risks:**
- **Stale container:** `bookeh-postgres-last-backup` must be removed by Mika (`docker rm -f bookeh-postgres-last-backup`). The session's permission check refused it. Item 59 stays `open` until then.
- **Merge cover rule:** the merge now publishes a non-admin's private cover when the shared Book has none. This follows the 5.39 AC and Epic 4 Decision 1, but retro R2 named only the admin, and PRD FR-47 is not amended. Mika should confirm or narrow it (deferred item).
- **Shared files with 5.38:** `(sections)/actions.ts`, `lib/shelf/query.ts`, `lib/copies/moveCopies.ts`, `lookupLimit.ts`, AD-9 and the spine's Text input row. Whichever story merges second resolves the conflicts.
- **Wider normalisation:** `upsertUserBook` now collapses whitespace runs in every single-line override, including values a promote or merge carries over.
