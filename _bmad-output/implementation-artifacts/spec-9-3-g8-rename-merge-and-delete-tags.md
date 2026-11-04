---
title: '9.3 G8 Rename, merge and delete tags'
type: feature
created: '2026-11-04'
status: done
baseline_revision: ce2356cec9538a6f7fa625da806ace7244af798d
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /Users/mika/development/bookeh/CLAUDE.md
  - /Users/mika/development/bookeh/_bmad-output/implementation-artifacts/epic-9-context.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Private labels can be assigned but cannot yet be renamed, merged or deleted through their owning service. Settings also needs copy usage counts for each kind.

**Approach:** Add renameTag, mergeTag, deleteTag and tagUse in lib/tags, sharing system-name validation with changeTags and reading copy counts through lib/shelf.

## Boundaries & Constraints

**Always:** Own labels only, admin included. Normalize NFC, whitespace and case without accent folding. Rename conflicts apply within owner and kind; case-only rename is allowed. Renames to system genre names in either language or system theme names on readable Books behind own copies fail with VALIDATION and field name SYSTEM_NAME. Preserve existing label reuse behavior in changeTags. Merge requires two different own labels of the same kind, moves every own user-books reference (including wishlist-only and currently unheld Books), deduplicates target assignments and deletes source atomically. Delete removes all own references before deleting the label. Preserve other assignments and all unrelated Book state. Use upsertUserBook as sole user-books writer; operations sharing a context execute sequentially and join the caller's transaction. Usage counts mean copies, not Books; include ordered copies, zero-use labels and privacy/readability rules from shelf.

**Never:** Add screens, actions, Undo, schema changes, new filters, system genre administration or concurrent-write locking infrastructure. Do not mutate development data.

</intent-contract>

## Code Map

- `src/lib/tags/changeTags.ts` — existing owner/kind resolution and lazy system-name checks; extract only the collision check for rename reuse, preserving lookup-before-check for existing names.
- `src/lib/tags/tags.ts` (new) — management service and TagUse type, analogous to `src/lib/people/people.ts` and `src/lib/copies/locations.ts`; validate own IDs via scoped gateway reads before any mutation.
- `src/lib/tags/systemName.ts` (new) — shared collision validator using toNameKey, genre English/Finnish names and shelf/systemThemes; accept field name so assignment errors stay on tags and rename errors use name.
- `src/fields/relation.ts` — capture omitted relation fields before Payload fills stored values; validate explicit submissions and preserve unchanged omitted references on updates (AD-17).
- `tests/int/fieldHelpers.int.spec.ts` — regression for omitted versus explicitly resubmitted unreadable Book relations.
- `src/lib/books/upsertUserBook.ts` — existing sparse tags assignment writer, preserves overrides/read/rating; call this for repointing each affected row.
- `src/lib/payload/ownedName.ts`, `ref.ts`, `transaction.ts` — normalisedName, isRowId, idOf and nesting transactions; generic owned-name resolver lacks kind and stays unchanged.
- `src/lib/shelf/tagValues.ts` (new) — grouped private-label counts from copies joined to readable Books, own user_books, user_books_rels at path tags and own tags filtered by kind. Reuse `visibleCopies` and `readableBy` from `visibleCopies.ts`; count distinct copies.id. Return Counted<Named>[] for service use and later filters.
- `src/lib/shelf/query.ts` — existing Counted type; do not extend FilterValues before filter stories.
- `src/collections/Tags.ts`, `UserBooks.ts` — existing owner-only access, unique owner/kind/nameKey and tags relationship; no schema changes.
- `tests/helpers/builders.ts` — freshUser, sharedBook, copyAs, failure and unique builders; use existing helpers.
- `tests/int/changeTags.int.spec.ts` — regression suite for shared collision-check extraction; existing system-name, normalization and privacy coverage.
- `tests/int/tagManagement.int.spec.ts` (new) — service-boundary integration coverage for management and usage.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story progress and done tracking.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/tags/systemName.ts`, `changeTags.ts` — share system-name validation while retaining existing assignment behavior.
- [x] `src/lib/tags/tags.ts` — implement transactional rename, merge, delete and all-label usage list per kind.
- [x] `src/lib/shelf/tagValues.ts` — expose viewer-scoped copy counts for private labels of one kind.
- [x] `tests/int/tagManagement.int.spec.ts` — exercise acceptance plus owner privacy and transaction rollback at the service boundary.
- [x] This spec and `sprint-status.yaml` — record verification and completion.

**Acceptance Criteria:**
- Given each label kind and another own label with a normalized matching name in the same kind, when rename runs, then it fails with NAME_TAKEN and that conflictId without changing either label; given only a match in another kind or owner, when renamed, then it succeeds. Given case-only or NFC/whitespace-equivalent spelling of its own key, when renamed, then its display name changes and its ID stays.
- Given a genre or theme label, when renamed onto a system genre's English or Finnish name or a theme on a readable Book behind an own copy, then it fails with VALIDATION and name SYSTEM_NAME. Given an unheld/foreign-only system theme or an accent-distinct name, when renamed, then it succeeds. Existing-label assignment remains usable after later system-name introduction.
- Given source and target own labels of each kind assigned to several Books, including both labels on one Book, wishlist-only and no-longer-held Books, when merged, then all source references become deduplicated target references and the source is deleted in one transaction, preserving other labels and read/rating/override state.
- Given an own label assigned to Books and an unused own label, when deleted, then all references to the deleted label are removed before deletion and unrelated labels and state remain; unused deletion succeeds too.
- Given foreign or missing/invalid IDs, when rename, merge or delete runs as user or admin, then it fails with NOT_FOUND before writes. Given self-merge or same-owner labels of different kinds, when merged, then it fails with VALIDATION and changes nothing. Given blank or overlong rename, when called, then name validation rejects without changes.
- Given enclosing transactions, when merge, delete or rename succeeds but the enclosing transaction subsequently throws, then labels, names and assignments all roll back.
- Given own labels across all kinds, duplicate copies of one Book, an ordered copy, wishlist-only assignments, an unused label and another user's labels/copies/state, when tagUse(ctx, kind) runs, then it returns only all own labels of that kind sorted by name with distinct visible/readable own copy counts (zero where none), for admin too. Given usage called inside a transaction after assignments change, when read, then it sees those uncommitted changes.

## Spec Change Log

## Review Triage Log

- Extended management coverage to admin success, foreign state preservation, own-private and now-unreadable Books, held unreadable theme collisions, wishlist-only usage and unassigned labels. Case-only rename after later system-name introduction retains the original key.
- Now-unreadable fixtures exposed an existing Payload mismatch: omitted relations are filled from stored values and then revalidated, contrary to the documented submitted-field rule. Shared relation helpers now track omission before fallback and preserve unchanged omitted targets while still rejecting explicit unreadable targets.

### 2026-11-04 — Review pass
- verdicts: 11 findings — high 0, medium 5, low 3, false 3, maybe-false 0
- findings:
  - `[medium]` `[patch]` Blind hunter: successful admin management lacks foreign-state coverage — extended every-kind merge/delete cases to both roles and compared another user's complete state on each affected Book before and after.
  - `[low]` `[reject]` Blind hunter: no injected failure midway through repointing — existing enclosing-transaction tests already demonstrate rollback of assignments and deleted source after all writes, through the same withTransaction boundary. An additional injected-failure harness duplicates that rule without identifying another transaction path; rejected under functional-minimum test convention.
  - `[medium]` `[patch]` Blind hunter: private and now-unreadable Books untested — added both to every-kind/role management fixtures. This exposed Payload revalidating omitted stored Book links; relation helpers now track omission before fallback and skip only unchanged omitted references. Explicitly submitted unreadable references still fail, proven in fieldHelpers.
  - `[medium]` `[patch]` Blind hunter: rename theme readability not verified — added a held Book made private by another creator: user rename succeeds, while admin with an own copy receives SYSTEM_NAME.
  - `[low]` `[patch]` Blind hunter: no genuinely unassigned or actual wishlist-only usage fixture — added both; all kinds and roles return zero copies for these labels.
  - `[low]` `[reject]` Blind hunter: no above-page-size fixture — all affected-row and label reads already explicitly use pagination:false; no truncation occurs. A bulk fixture solely defending this query option would restate configuration, prohibited by the repository test convention.
  - `[medium]` `[patch]` Verification-gap reviewer: delete does not assert preservation of unrelated state — successful deletion now verifies read, rating, ratedAt, title and overridden against each original row.
  - `[false]` `[reject]` Intent auditor: workflow-command reading differs from service changes — this invocation executes the rendered workflow; orchestration is not established by a source diff, and no workflow behavior is missing on that basis.
  - `[false]` `[reject]` Intent auditor: user-facing interpretation might require Settings controls — authoritative Story 9.3 explicitly names lib/tags services and integration tests; 9.9 supplies Settings. Reviewed changes and tests exercise the specified surface.
  - `[false]` `[reject]` Intent auditor: recorded state is in review rather than final completion — this was the required state while the reviewers ran; finalization follows review and updates it to done.
  - `[medium]` `[patch]` Parent: later system-name introduction blocks case-only rename — rename now checks system collisions only when the normalized key changes. A focused genre/theme regression passes after introducing matching system names.

## Verification

**Commands:**
- `npm run test:int -- tests/int/fieldHelpers.int.spec.ts tests/int/tagManagement.int.spec.ts tests/int/changeTags.int.spec.ts` — 31 relation, management and existing tagging tests pass on migrated bookeh_test (2026-11-04).
- `npm run typecheck` — TypeScript passes.
- Scoped `npx eslint` over changed TypeScript files — no errors.
- `git diff --check` — no whitespace errors.

**Result:** Completed the shared lazy collision validator, transactional own-label management and viewer-scoped copy usage counts. Verified rollback for all mutations and uncommitted count reads. No development data changed; no schema or UI changes. Concurrent-write locking remains outside this story as specified.


## Auto Run Result

Status: done

Implemented transactional rename, merge and delete for all three private-label kinds, plus copy usage counts including zero-use labels. Names remain owner/kind scoped, system-name conflicts return field validation, case-only renames remain usable, and references are deduplicated through upsertUserBook. Management includes wishlist-only, unheld, private and now-unreadable Books while preserving unrelated state and other users' rows.

Files changed:
- `src/lib/tags/tags.ts`: renameTag, mergeTag, deleteTag, tagUse and TagUse.
- `src/lib/tags/systemName.ts`, `changeTags.ts`: shared lazy collision checks with existing-label reuse preserved.
- `src/lib/shelf/tagValues.ts`: readable own-copy counts by private kind.
- `src/fields/relation.ts`: retain unchanged omitted references after Payload fills stored values; explicit submissions still validate.
- `tests/int/tagManagement.int.spec.ts`: service, privacy, count and rollback coverage.
- `tests/int/fieldHelpers.int.spec.ts`: omitted versus explicit unreadable relation regression.
- This spec and `sprint-status.yaml`: completed story and workflow evidence.

Review: four layers completed (the fourth launched when the platform's three-reviewer concurrency limit released a slot). Six patches applied: medium 5, low 1; zero deferrals. Five findings rejected individually above: two redundant/configuration-only test requests and three intent observations disproved by the authoritative service scope and workflow sequence. The edge-case hunter returned no findings.

Follow-up review recommendation: false. Multiple medium patches were applied, but focused regressions now cover each demonstrated defect and gap; no specific unverified risk remains from those patches.

Verification:
- Parent reran the focused integration command: 31 tests passed across 3 files (13 management, 8 changeTags, 10 field helpers), on bookeh_test.
- TypeScript initially caught the generic FieldHook's optional name; narrowed it before the final typecheck.
- Final typecheck and scoped ESLint passed; git diff --check passed.
- No screen changed, so no browser walk was required. No schema or development database changes.

Residual risks: existing unlocked read/replace assignment behavior can lose concurrent same-user edits, as already recorded in 9.2; racing name creation/rename can surface a uniqueness validation failure. No concurrent-write locking or retry contract is introduced. No parallel worktree files were involved.
