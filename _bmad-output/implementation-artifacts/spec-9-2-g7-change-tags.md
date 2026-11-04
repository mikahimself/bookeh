---
title: '9.2 G7 Change tags'
type: feature
created: '2026-11-04'
status: done
baseline_revision: 3a3653daaefaf95eb8b4f0e02a005d82d53b536b
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

**Problem:** The private label model exists, but callers have no shared service for adding and removing labels on Books, including selections and wishlist-only Books.

**Approach:** Implement `changeTags(ctx, target, { add: Ref[], remove: number[], kind })` in `lib/tags`, resolving names within the viewer's kind, validating system-name collisions on new labels, writing distinct Books through `upsertUserBook` in one transaction and returning an Undo restore.

## Boundaries & Constraints

**Always:** Preserve owner privacy including admin, AD-16 sequential context operations, AD-18 sole writer and AD-20 restores. Gate all copy IDs before any write; gate Book targets with `requireOwnBook`. Tag assignments belong to the user and Book, not a copy. Normalize whitespace, NFC and case with existing helpers, without accent folding. Reuse an existing private label even if a system genre introduced later now matches. Only new genre/theme names receive system-name checks. Read system themes through `lib/shelf` from visible held copies, without browsing unrelated Books. Restore only changed Books, skip gone state rows and omit deleted label IDs, leaving inline-created labels in place. Preserve other user Book state and assignments of other kinds.

**Never:** Build pickers, actions, filters, Settings, tag rename/merge/delete or genre mapping. Do not modify schema or development database. Do not record Undo tokens inside the mutation; callers choose `withUndo` or compose a transaction for Edit book.

</intent-contract>

## Code Map

- `src/lib/books/setRead.ts` — same target union, distinct-copy-to-Book authorization and state restore pattern; private booksOfCopies can be extracted into a books helper for reuse if useful.
- `src/lib/books/requireOwnBook.ts` — Book ID ownership gate accepts copies or open wishlist entries, including ordered copies.
- `src/lib/books/upsertUserBook.ts` — extend UserBookChanges and RowData with tags and state detection; deduplicate IDs and preserve sparse writes. It remains the only user-books writer.
- `src/lib/payload/ref.ts` — Ref, idOf and isRowId.
- `src/lib/payload/ownedName.ts` — normalisedName provides blank/length errors; existing generic resolver does not support kind and must not be used unchanged for tags.
- `src/fields/nameKey.ts`, `src/fields/sortName.ts` — authoritative name normalization.
- `src/collections/Tags.ts`, `src/collections/UserBooks.ts` — owner-only model, three kinds, unique owner/kind/nameKey, has-many owned relation.
- `src/lib/shelf/visibleCopies.ts`, `src/lib/shelf/filterValues.ts` — Drizzle visibility/readability helpers and viewer-scoped read pattern for new system-theme reader. Use actual schema representation of Book themes.
- `src/lib/undo/undo.ts` — Undone, withUndo and undo; restore runs in its own authenticated transaction.
- `src/lib/errors.ts`, `messages/en.json`, `messages/fi.json` — add SYSTEM_NAME field code and localized genre/theme messages for future caller rendering, without building a surface.
- `tests/int/setRead.int.spec.ts`, `tests/int/tags.int.spec.ts`, `tests/helpers/harness.ts` — model fixtures, failure checks and authenticated integration patterns.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — progress and completion tracking.

## Tasks & Acceptance

**Execution:**
- [x] `src/lib/books/upsertUserBook.ts` — support sparse tags assignment writes without changing read/rating/overrides.
- [x] `src/lib/shelf/systemThemes.ts` — expose viewer-scoped system theme names from readable Books behind their copies.
- [x] `src/lib/tags/changeTags.ts` and focused helper files if needed — implement targets, kind-scoped resolution, system collision checks, atomic assignment changes and restore.
- [x] `src/lib/errors.ts`, `messages/en.json`, `messages/fi.json` — support SYSTEM_NAME validation with localized genre/theme wording.
- [x] `tests/int/changeTags.int.spec.ts` — cover acceptance and privacy/transaction/Undo rules at the service boundary.
- [x] `sprint-status.yaml` and this spec — track status and verification evidence.

**Acceptance Criteria:**
- Given multiple own copies including duplicate IDs and two copies of one Book, when tags change, then each distinct Book receives the deduplicated additions and removals once, preserving other kinds and unrelated state. Removing then adding the same label leaves it assigned. Unchanged Books are excluded from restore.
- Given a Book held only through an open wishlist entry, when a Book-target change runs, then it succeeds; given unheld Books or a selection with any foreign, missing or invalid copy, when it runs, then it fails before writes, for admin too.
- Given add names of any kind, when normalized names match existing own labels of that kind, then IDs are reused; otherwise labels are created. Given blank/overlong names, invalid kinds or IDs belonging to another owner or kind in add/remove, when called, then field validation rejects the operation without partial labels or assignments.
- Given a new genre name matching either language of any system genre or a new theme matching a system theme on a readable Book behind the viewer's own copies, when called, then it fails with VALIDATION and field code SYSTEM_NAME. Given an existing private label that later collides or a theme only present on another user's Book, when added, then it succeeds. Accent distinctions remain meaningful.
- Given an undoable change, when `undo` runs through its token, then each changed Book's previous assignments return, new inline labels remain and unrelated state remains. Given previous labels or state rows deleted since, when undone, then removed label IDs are omitted and gone rows are skipped.
- Given a mixed operation that creates a label then encounters a validation failure, when it rejects, then all creations and assignments roll back; given an enclosing transaction, when it fails after a successful changeTags call, then the tagging writes roll back too.

## Spec Change Log

## Review Triage Log

### 2026-11-04 — Review pass
- verdicts: 13 findings — high 0, medium 4, low 4, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind hunter: Undo must preserve later assignments of other kinds — AD-20 expressly restores recorded previous values whatever the row holds now; 9.2 requires restoring each Book's previous tags, not an inverse operation. The snapshot restore follows that contract.
  - `[medium]` `[patch]` Blind hunter: private-Book merge loses source tags when both state rows exist — confirmed mergeUserBook deleted the source without copying tags. It now unions both rows' assignments before deleting the source; a focused merge regression passes.
  - `[low]` `[reject]` Blind hunter: simultaneous changes to one existing state row can lose earlier additions — the read/replace is unlocked, as is the existing override writer. Overlapping same-user requests are unlikely in everyday single-user Phase 1 use; locking/retry infrastructure is more than a direct correction. Retained explicitly as a residual limitation.
  - `[false]` `[reject]` Blind hunter: racing creates must retry instead of failing uniqueness — the owner/kind/nameKey constraint rejects one whole transaction, with no partial assignment. Existing private name resolvers deliberately surface lost races as validation errors; neither 9.2 nor the spine promises successful concurrent name creation or retry.
  - `[medium]` `[patch]` Blind hunter: theme tests do not exercise readableBy — AD-4/AD-7 privacy merits the requested coverage. Added held-then-private Book cases proving unreadable themes do not block a user and readable private themes do block an admin with their own copy.
  - `[medium]` `[patch]` Blind hunter: existing theme collision reuse lacks coverage — added creation before a system theme appears, then normalized reuse on another held Book. Existing private theme ID is reused without creating another label.
  - `[low]` `[reject]` Edge hunter: overlapping assignment reads can discard additions — same rare simultaneous-user condition as blind hunter; row locking adds complexity beyond a direct correction and is not required for ordinary sequential calls. The limitation is recorded, not claimed to be fixed.
  - `[low]` `[reject]` Edge hunter: deletion between restore count and upsert can recreate a state row — a concurrent back-office deletion in this narrow window is unlikely in everyday Phase 1 use. Synchronizing deletion and restore requires locking beyond a direct correction; sequential gone-row handling is tested and passes. Residual race recorded.
  - `[medium]` `[patch]` Verification-gap reviewer: kind-scoped name resolution is not verified — same normalized name now resolves into three distinct tag/genre/theme IDs, with persisted kinds and assignments asserted. The regression passes.
  - `[false]` `[reject]` Intent auditor: workflow completion cannot be established from the review diff alone — workflow orchestration happens outside the source diff; rendered steps, implementation dispatch, parent verification and all four review layers ran. Terminal status and commit follow this triage.
  - `[false]` `[reject]` Intent auditor: service boundary may not match authoritative 9.2 scope — epics.md Story 9.2 explicitly names changeTags, transaction, name checks and restore at the service surface. The integration tests exercise that surface directly.
  - `[false]` `[reject]` Intent auditor: product operation could require a caller or picker — authoritative stories 9.6–9.9 separately supply detail, picker, selection and Settings surfaces. No browser surface is promised by 9.2.
  - `[low]` `[patch]` Parent: specialized messages omit the name in the accepted wording — genre/theme keys now interpolate {name} in English and Finnish; generic SYSTEM_NAME remains argument-free for generic error consumers.

## Verification

**Commands:**
- `npm run test:int -- tests/int/changeTags.int.spec.ts tests/int/setRead.int.spec.ts tests/int/upsertUserBook.int.spec.ts tests/int/tags.int.spec.ts` — new behavior and existing related contracts pass on migrated bookeh_test.
- `npm run typecheck` — TypeScript passes.
- Scoped `npx eslint` over changed TypeScript files — no errors.

**Results (2026-11-04):** Initial verification: all 25 integration tests passed across the four scoped files, including six new service-boundary tests. `npm run typecheck` passed; scoped ESLint passed; message catalogue unit suite passed (32 tests). Checks ran with sandbox escalation for local IPC, test database and SWC native cache access. No schema or development database changes.


## Auto Run Result

Status: done

Implemented `changeTags` for own copy selections and held Book IDs, with owner/kind name resolution, system-name field validation, atomic writes through upsertUserBook and server-held Undo composition. Inline-created labels survive Undo, deleted previous labels are omitted, and gone state rows are skipped. Private-Book merges retain the union of source and target tags.

Files changed:
- `src/lib/tags/changeTags.ts`: mutation, name resolution, validation and restore.
- `src/lib/shelf/systemThemes.ts`: viewer-scoped readable system-theme query.
- `src/lib/books/booksOfCopies.ts`, `setRead.ts`: shared selection authorization with unchanged read behavior.
- `src/lib/books/upsertUserBook.ts`: sparse tags state and merge preservation.
- `src/lib/errors.ts`, `messages/en.json`, `messages/fi.json`: SYSTEM_NAME and localized generic/specialized wording.
- `tests/int/changeTags.int.spec.ts`, `tests/int/upsertUserBook.int.spec.ts`: service, privacy, rollback, restore and merge coverage.
- `tests/unit/messages.unit.spec.ts`: exhaustive error-code catalogue coverage.
- This spec and `sprint-status.yaml`: workflow evidence and completed status.

Review: all four layers completed. Five patch entries applied (high 0, medium 4, low 1), zero deferrals. Eight entries rejected: five false findings disproved by authoritative scope/Undo/uniqueness contracts, and three rare concurrency cases whose locking fixes exceed a direct correction. Every finding and individual reason is recorded in Review Triage Log above.

Follow-up review recommendation: false. Four medium patch entries were resolved through a direct merge correction and focused acceptance regressions; no specific unverified risk remains in those patches. Existing concurrency limitations below are independent of those patches.

Final verification (parent rerun after review):
- Required focused integration command: 4 files, 28 tests passed (8 changeTags, 5 setRead, 10 upsertUserBook, 5 tags).
- `npm run typecheck`: passed, including Next route generation.
- Scoped ESLint on all changed TypeScript files: passed.
- `npm run test:unit -- tests/unit/messages.unit.spec.ts`: 32 passed.
- `git diff --check`: passed.
- No screen changed; no browser walk required. No migration or development database changes.

Residual risks: assignment changes use unlocked read/replace, so simultaneous requests by one user can overwrite earlier additions. A deletion racing between restore existence check and upsert can recreate that state row. Concurrent inline name creation can reject one request at the unique constraint; that request rolls back. Ordinary sequential behavior and specified privacy/transaction/Undo contracts pass. No shared parallel worktree files were involved.
