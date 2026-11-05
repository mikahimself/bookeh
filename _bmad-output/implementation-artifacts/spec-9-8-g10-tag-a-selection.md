---
title: '9.8 G10 Tag a selection'
type: feature
created: '2026-11-05'
status: done
baseline_revision: 7889e8f669d6b3dcb7cab6217d6d8cdb801f360f
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

**Problem:** Select mode cannot classify several Books at once, although the existing private-label service supports copy selections.

**Approach:** Add Tag to the selection action bar and a kind-aware picker with separate add-to-all and remove-from-all parts. One choice applies an undoable delta to the distinct Books behind every ticked copy.

## Boundaries & Constraints

**Always:** Follow Story 9.8 in epics.md and EXPERIENCE.md select mode and picker rules. Offer Tag / Genre / Theme tabs, add using an owned label or inline creation, remove using owned existing labels only. A choice submits immediately; success closes the picker and toasts Tagged {n} with Undo, where n counts distinct targeted Books. Both copies of a Book share assignments even when only one was ticked; ordered copies participate. Authorize every copy before writes, all or none; labels remain private including for admins. Reuse changeTags, withUndo, PickerFrame, Combobox, TextSwitch, settleAction and selection refresh/Undo conventions. Name errors remain beneath the relevant field and leave the picker open. Success unticks sent copies, NOT_FOUND unticks stale sent copies; other errors preserve ticks. Preserve select mode, refresh rows/options after success/Undo and restore focus to Done after completion/close. Share pending state across action bar and picker; guard duplicate submissions and snapshot sent ids. Read relevant installed Next docs before code. Run ignored fixture Playwright walk on phone/wide against bookeh_test only. Commit with 9.8 in conventional message.

**Never:** Match names in screens, mutate system classification, expose foreign labels, skip ordered copies, introduce schema changes or Settings management, alter development data, commit the browser walk, push commits.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Add any kind | Ticked duplicate copies and another Book, existing or new private label | One atomic assignment per Book, distinct Book count, untouched other kinds, success toast and Undo restoring each prior set while retaining created label | No error |
| Remove any kind | Selection with mixed assignments | Remove selected existing label from every distinct Book, leave other labels, Undo restores different prior sets | No error |
| Hostile or stale target | Foreign/missing copy, foreign/wrong-kind label, malformed input | No partial assignments or created label; no receipt | Auth first; strict VALIDATION or service NOT_FOUND; preserve selection except stale NOT_FOUND |
| Rejected new name | System genre/theme collision | No writes; picker remains open with field message | SYSTEM_NAME/NAME_TAKEN or field validation surfaced beneath field |
| Selection controls | Empty selection, in-flight action, repeated choice | Empty disables Tag; pending disables concurrent actions/choices; one request for sent snapshot | Failed request preserves ticks and retry |

</intent-contract>

## Code Map

- `src/lib/tags/changeTags.ts` — already accepts `{copyIds}`, deduplicates through booksOfCopies, validates labels, writes sequentially in transaction and returns per-Book restore/count. Reuse unchanged unless a demonstrated bug requires correction.
- `src/lib/tags/tags.ts:tagUse` — sorted own labels including unused per kind. Load sequentially on a context; no matching in UI.
- `src/app/(frontend)/(sections)/actions.ts` — add auth-first strict selection tags boundary using ids/isRowId and parseRef, withUndo(changeTags); no new service needed.
- `src/app/(frontend)/(sections)/SelectBar.tsx` — existing shared pending, untickActed/settled and Done ref; Tag between Move/Read, open new selection picker, focus after picker closes. Ensure four actions fit phone bar.
- `src/app/(frontend)/(sections)/MovePicker.tsx`, `DetailTags.tsx` — refresh, receipt toast and error patterns. New `SelectionTagPicker.tsx` composes PickerFrame, kind switch and two combobox parts; addition allows create, removal create=false. Keep one overlay level and name errors local; use current selected ids, no current-filter limitation.
- `src/app/(frontend)/components/TagPicker.tsx`, `components/ui/Combobox.tsx` — reuse TagOptions/TAG_KINDS and wrapper APIs (resetKey, create=false); no changes to approved detail/Edit interaction.
- `src/app/(frontend)/(sections)/page.tsx` — provide own label options to SelectBar, sequential kind loads, preserve explicit read failure feedback rather than silently pretending options are empty. `tests/helpers/collectionPage.ts` supplies shared reader mocks.
- `messages/en.json`, `messages/fi.json` — Tag action and add/remove parts with kind-aware labels, reuse tagPicker.tagged/error translations.
- `tests/int/changeTags.int.spec.ts` — existing selection/rollback/privacy/Undo service tests; add actual selection action boundary/Undo coverage as needed. `tests/unit/collectionSelection.unit.spec.ts` and `tests/unit/selectionTagPicker.unit.spec.ts` — extend action/picker behavior, errors, empty/pending, unticking and refresh. Reuse the existing selection harness.
- `tests/e2e/*.walk.spec.ts`, `playwright.config.ts` — ignored acceptance walk using fixture server, isolated seed and cleanup; both widths, multi-Book/duplicate-copy action/Undo, kinds and rejected creation; record observations below.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — completion state.
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`, `use-server.md` — relevant installed guides.

## Tasks & Acceptance

**Execution:**
- [x] `src/app/(frontend)/(sections)/actions.ts` — strictly validate input and wrap existing service with Undo.
- [x] `SelectionTagPicker.tsx`, `SelectBar.tsx`, `page.tsx`, `messages/en.json`, `messages/fi.json` — expose both parts for all kinds with private options, errors, focus and pending conventions.
- [x] `tests/unit/collectionSelection.unit.spec.ts`, `tests/unit/selectionTagPicker.unit.spec.ts`, `tests/int/selectionTagsAction.int.spec.ts` — cover matrix and transaction/access/Undo rules without permanent browser tests.
- [x] `tests/e2e/selection-tags.walk.spec.ts`, story spec, `sprint-status.yaml` — ignored phone/wide walk, review, result and story-numbered commit.

**Acceptance Criteria:**
- Given ticked copies including two of one Book, when Tag is opened and an add/remove chosen for any kind, then both parts are present and every selected Book changes together, including its unticked copy.
- Given successful selection tagging, when the toast appears, then it says Tagged {n} with distinct Book count and Undo restores each Book's original assignments.
- Given selection mode at phone or wide width, when no copies are ticked or a mutation runs, then Tag and concurrent actions are disabled appropriately; success retains selection mode and clears acted ticks, failures follow existing selection conventions.
- Given a rejected name, when adding it, then the picker retains the entered field and shows its error without writes; retry succeeds.
- Given refreshed rows and Undo, when filters remove or restore a Book, then current shelf/options reflect the change while selection outlives query changes.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 13 observations — high 0, medium 0, low 5, false 8, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: same existing option cannot retry after failure — installed Base UI AriaCombobox.handleSelection always calls setSelectedValue, which always invokes onSelectedValueChange even for the same value; the local choose guard releases in finally. No suppression exists.
  - `[low]` `[patch]` Blind: corrected input retains obsolete field error — addition input now clears the prior error as text changes; focused regression verifies it.
  - `[false]` `[reject]` Blind: closing/reopening during request lets an old response change the new picker — closing is allowed, but SelectBar disables Tag while the enclosing transition is pending, so reopening before settlement is unreachable. Opening resets prior errors/addition.
  - `[low]` `[reject]` Blind: tagUse computes unnecessary usage counts — three additional aggregates exist, but no user-visible performance failure was demonstrated. Replacing the established reader with a new API adds complexity beyond a direct correction; no everyday defect established by measurement.
  - `[low]` `[patch]` Blind: options-null and retry lack coverage — configurable page reader mock and composed collection cases cover nonempty kinds, LoadFailed without mutation controls, refresh retry and recovered choices.
  - `[low]` `[patch]` Blind: no-receipt claim only checks label count — action integration now asserts unchanged receipts and assignments after malformed and mixed foreign-copy rejection.
  - `[false]` `[reject]` Blind: unchecked execution tasks and missing sprint update — review snapshot is deliberately intermediate. Completion marks tasks and sprint done after all review fixes; no premature completion claim.
  - `[low]` `[patch]` Verification gap: page-to-picker options and reader failure are unverified — same root cause and patch as Blind options-null finding; distinct per-kind choices and failed/recovered reads now exercise the real page boundary.
  - `[false]` `[reject]` Intent: workflow completion cannot be established from diff — execution history contains render, planning, mandatory implementation and review dispatches; finalization follows this review. Diff is not an execution log.
  - `[false]` `[reject]` Intent: product evidence spans unit and integration surfaces — descriptive confirmation without a defect; ignored browser walk additionally exercises the composed product.
  - `[false]` `[reject]` Intent: ignored browser walk absent from diff — explicit project convention requires that walk remain uncommitted; parent ran and inspected it twice, including typed-error retention and active-filter Undo.
  - `[false]` `[reject]` Intent: story-numbered commit not established by file diff — finalization will create the authorized conventional commit including 9.8 and verify its message; review is pre-commit.
  - `[false]` `[reject]` Intent: permissions override absent from diff — approved Git, browser and isolated integration escalations are recorded in execution history, not application files.

Edge-case reviewer returned no findings. Four review layers completed; platform has only three child slots, so intent review launched as the first slot freed before triage. No deferred items. Patches group into three low entries (input error, page options verification, receipt verification); follow-up recommendation false.

## Design Notes

The generic picker contract closes after one choice; the selection picker therefore submits a single add or remove delta, rather than a new multi-kind form. Separate combobox sections avoid inferring a shared selected set from Books with different assignments. Removal lists own labels, including unused labels; removing an absent assignment is harmless. Detail/Edit retain their existing shared selected-values picker.

## Verification

- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run typecheck` — pass.
- `npm run test:unit -- tests/unit/collectionSelection.unit.spec.ts tests/unit/selectionTagPicker.unit.spec.ts tests/unit/collectionPage.unit.spec.ts` — pass.
- `npm run test:int -- tests/int/changeTags.int.spec.ts tests/int/selectionTagsAction.int.spec.ts` — pass on migrated bookeh_test.
- Scoped ESLint for changed code and `git diff --check` — pass.
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run test:e2e -- tests/e2e/selection-tags.walk.spec.ts --reporter=line` — ignored fixture walk passes at phone/wide widths; inspect phone rendering.

## Auto Run Result

Status: done

Parent verification: typecheck passed; 27 focused unit tests and 13 integration tests passed; scoped ESLint and diff check passed. Matrix audit: any-kind additions/removals and different per-Book Undo covered by selection action integration; preservation, ownership/kind, collisions, rollback and admin access covered by changeTags integration; strict action auth/input cases passed; picker errors/pending/repeated request snapshots and selection untick/refresh cases passed.

Ignored fixture walk `tests/e2e/selection-tags.walk.spec.ts` passed at 1300px and 390px. Verified two parts/all kinds, create/existing add/removal, duplicate/ordered copies count as two Books, Undo restoring assignments and retaining created labels, rejected system genre retains typed name and ticks, Done focus, active tag filter removes rows on removal and restores them on Undo, no phone overflow. Parent inspected phone screenshot: four actions fit; toast stays above action bar. Isolated fixture data cleaned; development data unchanged. Browser walk remains ignored.

Implemented selection Tag between Move and Read with kind-aware add-to-all and remove-from-all choices. Existing labels are private; additions can create inline. Success applies one delta to distinct Books, clears acted ticks, refreshes shelf/options, returns focus to Done and offers Tagged {n} with Undo. Errors preserve selection and retain correctable names; loading failures offer retry. Ordered copies participate and duplicate copies count once.

Files changed:
- `SelectBar.tsx`, new `SelectionTagPicker.tsx`: action, shared pending/focus, two-part picker, error/retry handling and compact phone button row.
- Section `actions.ts`: authenticated strictly validated selection action around existing transactional changeTags/withUndo.
- Section `page.tsx`: sequential owned label loading with explicit failure state.
- `messages/en.json`, `messages/fi.json`: selection action and per-kind add/remove labels.
- `tests/helpers/collectionPage.ts`, selection/picker unit suites: configurable reader and composed selection, error, loading, pending and snapshot coverage.
- `tests/int/selectionTagsAction.int.spec.ts`: real action any-kind assignment/removal/Undo, hostile input/targets and no-receipt rollback assertions.
- Story spec and `sprint-status.yaml`: workflow result and completion.

Final parent verification after patches: typecheck passed; 28 focused unit tests passed; 13 integration tests passed against migrated bookeh_test; scoped ESLint and git diff --check passed. Ignored Playwright acceptance walk reran successfully at 1300px/390px (27.5s). All matrix rows have passing coverage as audited above, with added no-receipt assertions and loading-recovery coverage. Reviewed patched changes directly and rewrote review diff.

Review: three low patch groups applied (obsolete field error, composed label loading verification, rejected-action receipt verification); no deferrals. All eight rejected observations and the low performance suggestion have individual reasons in Review Triage Log. No medium/high patches, followup_review_recommended false.

Residual risks: Chromium fixture browser verification covers phone/desktop sizes, without physical-device or screen-reader measurement. Uses existing tagUse reader, including usage aggregation; no measured latency regression. No schema/service-contract changes, parallel worktrees or development-data changes. Approved overrides used for Git metadata and isolated database/browser checks. Browser walk remains ignored. No push.
