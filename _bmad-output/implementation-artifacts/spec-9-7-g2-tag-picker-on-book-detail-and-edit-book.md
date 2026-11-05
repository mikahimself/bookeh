---
title: '9.7 G2 Tag picker on Book detail and Edit book'
type: feature
created: '2026-11-05'
status: done
baseline_revision: f0e27f60f657d8c46abed0d15e2fd846c83d780f
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

**Problem:** The viewer can see private classification but cannot add or remove it in Book detail or Edit book.

**Approach:** Build approved option A: a shared picker with Tag / Genre / Theme tabs, a find-or-create combobox and selected values with × removal. Detail saves immediately with Tagged 1 · Undo; Edit book stages full sets per changed kind until Save, with no Undo.

## Boundaries & Constraints

**Always:** Record Mika's option A in EXPERIENCE.md before implementation (approved 2026-11-05). Private labels supplement system classification and remain owner-scoped including for admins. Assignments belong to the viewer's Book, across copies. Services resolve names and enforce SYSTEM_NAME/NAME_TAKEN; show field messages beneath the combobox, including errors returned by Edit Save. Reuse PickerFrame and Combobox: phone sheet/wide dialog, one overlay level. Use existing request, error, refresh, toast and Undo patterns. Edit book's optional tags contract is already in the spine: Partial<Record<TagKind, Ref[]>>, full set per supplied kind; omitted kinds remain unchanged and [] clears. Save all Book/copy/classification changes sequentially in its existing transaction; no Undo receipt. Dirty tracking, storage, discard and signed-out return retain staged classification. No database/schema changes. Run one ignored fixture Playwright acceptance walk.

**Never:** Change shared genres/themes through the private picker, expose foreign labels, match/create names in screens, add selection tagging/Settings, write permanent browser tests or modify development data.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|---|---|---|---|
| Detail addition/removal | Owned existing ID or inline name, any kind | Persist assignment immediately; retain picker; refresh detail; Tagged 1 · Undo restores prior assignments, retains created label | Field error on failed name, no optimistic persisted state |
| Edit staging | Add/remove in picker | Summary and draft change; database unchanged until Save | Dirty/discard/sign-in behavior preserved |
| Edit Save | Full desired sets for supplied kinds | Replace supplied kinds only atomically with Book/copy changes; no Undo | Wrong-kind/foreign ID rejected; name failure rolls back all changes and appears under relevant field |
| System collision | New genre equal to system English/Finnish name or theme matching held system theme | No assignment/new label | SYSTEM_NAME beneath field |

</intent-contract>

## Code Map

- `src/lib/books/effectiveBook.ts` — TagKind and UserBookState.tags types.
- `src/lib/books/userBookState.ts` — owned assigned labels, safe defaults and admin privacy; use unchanged.
- `src/lib/tags/tags.ts:tagUse` — list own labels per kind, including unused; call sequentially. `src/lib/tags/changeTags.ts` — validates kind/ownership, matches names, creates, changes Book state, returns restore. Reuse for detail withUndo and Edit Save without restore.
- `src/lib/undo/undo.ts:withUndo` — post-commit receipt pattern; detail only.
- `src/app/(frontend)/(sections)/actions.ts`, `ShelfRows.tsx:useAfterAction`, `ReadAndRating.tsx` — existing auth-first server action, refresh and Undo refresh patterns. Add detail tagging action with strict parseRef boundary; return updated assigned values for repeated mutations while picker stays open.
- `src/app/(frontend)/ref.ts:parseRef`, `plainObject.ts` — strict Ref and object validation.
- `src/app/(frontend)/components/ui/Picker.tsx:PickerFrame`, `Combobox.tsx`, `TextSwitch.tsx` — compose shared `components/TagPicker.tsx`; selected rows accessible removal buttons. Reset query per successful addition/kind; don't remount inside Base UI selection callbacks before close completes.
- `src/app/(frontend)/(sections)/BookDetail.tsx` — already reads state; place Add tag after classification, visible even when empty. Load own options sequentially and mount client detail wrapper.
- `src/lib/catalogue/editBook.ts:EditBookInput/editBook` — implement existing spine tags contract; use changeTags with desired refs and remove current IDs per kind inside transaction. Catch domain field failures and identify `tags.<kind>` for Save UI. Keep supplied kinds validated and omitted kinds unchanged.
- `src/app/(frontend)/books/[bookId]/edit/actions.ts` — auth-first, validate optional tags object known kinds/Ref arrays, forward separately from BookEdits. Preserve cover-after-edit contract.
- `src/app/(frontend)/books/[bookId]/edit/page.tsx` — load assigned state/options sequentially.
- `src/app/(frontend)/books/[bookId]/edit/draft.ts`, `EditBookScreen.tsx` — optional tags in Draft, sparse changed kinds, summary/opener on first screen, staged create names visible; separate tags from bookEdits and send on Save. Map Save name errors beneath matching picker field, retaining draft.
- `messages/en.json`, `messages/fi.json` — kind prompts, summary/opener/removal/empty labels and Tagged count toast; reuse existing translated domain errors.
- `tests/int/editBook.int.spec.ts`, `editBookAction.int.spec.ts`, `changeTags.int.spec.ts` — extend only for new Save transaction semantics/hostile inputs and detail action Undo; existing service cases cover matching/privacy.
- `tests/unit/editBookScreen.unit.spec.ts`, new focused picker/detail-control tests, `tests/helpers/collectionPage.ts` — guard staging, save payload, errors, kind selection and fresh assigned state; update shared reader mocks/default props.
- `tests/e2e/*.walk.spec.ts`, `playwright.config.ts` — ignored fixture walk against bookeh_test at wide/phone widths.
- Installed Next docs `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` and `use-server.md` — read before implementation.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md`, `.working/tag-picker-9-7.html` — recorded option A and rendered prototype. Spine already has tags input; update only if actual shared contract changes.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status.

## Tasks & Acceptance

**Execution:**
- [x] EXPERIENCE.md and epic-9-context.md — record approved choice and regenerate stale context.
- [x] Shared picker and detail action/control — add/remove any kind immediately with inline name errors, refresh and Undo.
- [x] editBook, edit action, page, draft and screen — atomic full-set Save, first-screen summary and staged shared picker.
- [x] Translations and focused unit/integration cases — cover acceptance and transaction/access rules.
- [x] Ignored browser walk, story/spec/sprint result — verify both widths, review, commit with 9.7 in conventional message.

**Acceptance Criteria:**
- Given rendered options A/B, when Mika chooses A, then EXPERIENCE.md records that choice before implementation.
- Given Book detail or Edit book's first screen, when opening its picker, then Tag/Genre/Theme tabs select a kind, a combobox offers own values or inline creation, and selected values have named × removal.
- Given Book detail mutations for any kind, when an add/remove succeeds, then it saves at once for all copies of that Book, shows Tagged 1 · Undo and Undo restores assignments while retaining inline-created labels.
- Given Edit book classification changes, when using picker and closing it, then summary/draft reflect changes and database stays unchanged until Save; Save commits changed kinds with scalar/copy changes and no Undo.
- Given an omitted kind or empty supplied set, when saving, then omitted assignments remain and supplied empty kind clears.
- Given invalid/foreign/wrong-kind refs or a rejected name, when saving Book/copy/classification changes, then all changes roll back, the draft remains and name errors including SYSTEM_NAME/NAME_TAKEN appear beneath the correct field.
- Given a phone or wide viewport, when opening/using/closing the picker and performing Undo or Edit Save, then focus/history overlays and refreshed classification work on the actual fixture application.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 21 observations — high 0, medium 2, low 10, false 8, maybe-false 1
- findings:
  - `[medium]` `[patch]` Edge: malformed restored tag sets crash hydration — reproduced from stored null/non-array/null refs; restore now validates each known kind through parseRef and drops malformed tag data while retaining other edits. Six regression inputs pass.
  - `[low]` `[patch]` Blind: exact staged create refs repeat — Edit now ignores an identical staged ref and tests two consecutive additions; normalization/name matching remains solely in the service.
  - `[low]` `[patch]` Blind: summary omits kinds — summary now prefixes each nonempty kind with its translated name, as approved option A; real-picker unit case asserts distinct kind labels.
  - `[low]` `[patch]` Blind: long unbroken names push removal away — name column now shrinks and wraps, removal stays in a nonshrinking container. Parent corrected an unsupported ActionLink className caught by typecheck.
  - `[false]` `[reject]` Blind: an earlier refresh can overwrite a later user mutation — picker disables all mutation controls for the enclosing async transition, and inFlight also excludes duplicate requests; its refresh is scheduled within that transition. No reachable overlapping user mutation was demonstrated; returned assignments and the real repeated-mutation integration case remain correct.
  - `[medium]` `[patch]` Blind: malformed stored classification crashes screen — same root cause as Edge; strict restore and malformed-data regressions fix it.
  - `[false]` `[reject]` Blind: more combobox selection testing required — existing combobox suite exercises keyboard selection; the shared picker case verifies existing-ID choice/reset, new screen case performs consecutive creation and original-ID restoration, and fixture browser walk exercises the async detail path. No specified behavior remains without verification.
  - `[low]` `[patch]` Blind: rollback test omits created-label absence — test now names the attempted row and verifies it does not exist after the later SYSTEM_NAME failure.
  - `[low]` `[patch]` Blind: staged screen draft lifecycle only uses preloaded data — real picker now removes the last label, retains another kind, restores the original ID and clears dirty/storage; existing discard and signed-out cases now carry staged tags.
  - `[maybe-false]` `[reject]` Blind: portal remount may suppress/repeat assistive announcements — comment now accurately describes region remounts while the one store persists. Existing toasts announce before opening a modal, subsequent insertions use the live region, and browser verifies actionable focus/Undo. A screen-reader-specific repeated/suppressed announcement was not established; its if-true impact is low and no additional announcement state is warranted. Physical screen-reader behavior remains unmeasured.
  - `[low]` `[patch]` Verification gap: successful Edit action forwarding lacks stored-state assertion — added real editBookAction success with created theme and getUserBookState assertion.
  - `[low]` `[patch]` Verification gap: Edit removal lacks exercised draft assertion — same real-picker case as Blind lifecycle finding now verifies empty-set draft and preservation of the other kind before Save.
  - `[false]` `[reject]` Intent: workflow/override/commit evidence outside diff — render command and authorized Git/test escalations are in execution history. Review state is deliberately intermediate; finalization writes done and commits with 9.7.
  - `[false]` `[reject]` Intent: mocked component contracts alone do not show composed experience — parent inspected and reran ignored fixture browser walk, which verifies actual overlays, Save, database staging, refresh and Undo at 1300px/390px; mocks are complemented by that check.
  - `[false]` `[reject]` Intent: persistence evidence is at integration surface — descriptive confirmation, not a defect; direct services and real actions cover replacement/omission, rollback, access, inputs and Undo.
  - `[false]` `[reject]` Intent: browser evidence is omitted from tracked diff — required repository convention explicitly keeps this walk ignored. Parent read its source and reran it successfully; observations are recorded below.
  - `[low]` `[patch]` Intent: prototype summary identifies kinds while implementation did not — same root cause as Blind summary finding; translated kind prefixes now match option A.
  - `[false]` `[reject]` Intent: original prompt does not independently define story/A — original epics.md Story 9.7 supplies acceptance, existing EXPERIENCE.md requires the choice, and user explicitly selected the rendered A. Meaning is established by existing project context and conversation, not invented by the new spec.
  - `[false]` `[reject]` Intent: story/design/workflow readings differ — all three are compatible and implemented together: original 9.7 behavior, user-selected A, required verification/review/commit; there is no unresolved competing intent.
  - `[low]` `[patch]` Parent: overlay toast offset uses an inline literal style — replaced with Tailwind class using the existing spacing token and sheet runtime offset, satisfying Styling convention.
  - `[low]` `[patch]` Parent: shared modal toast placement needs its contract recorded — Toasts convention now states that the single region follows the active modal and returns on close.

No deferred findings. Duplicate findings retain separate rows; patches share their root-cause fix. Grouped patched entries: medium 1 (malformed stored tags), low 8 (exact duplicates, summary, wrapping, rollback assertion, draft lifecycle, action forwarding, styling, toast convention). Follow-up recommendation is false: no high patches and one medium group, with focused regression and browser verification complete.

## Design Notes

User explicitly chose A after reviewing the concrete options; the initial block is resolved. Existing story-owned working artifacts are carried forward, not unrelated dirty work. Use full-set Edit tags as already specified in the spine. Detail uses deltas through existing changeTags to avoid stale replacement; Edit uses its form's deliberate desired sets. No new schema or service for name matching.

## Verification

- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run typecheck` — passes.
- Focused Vitest unit suites for picker, detail and Edit book — pass.
- Focused integration suites for Edit Save/action and tagging/Undo — pass against migrated bookeh_test.
- Scoped ESLint and `git diff --check` — pass.
- Ignored fixture Playwright walk — pass at wide/phone widths; record observations and no development-data changes.


### Implementation handoff (2026-11-05)

115 focused unit tests and 40 focused integration tests pass. Typecheck, scoped ESLint and diff check pass. Ignored fixture walk at 1300px and 390px passes, including Undo within the modal and Escape returning to detail. No development data changed. The walk revealed shared modal-toast placement and Escape handling issues; ToastHost/ToastProvider, Dialog/Sheet and the wide detail handler now preserve reachable Undo and keep Escape scoped to the active modal. Parent review and commit remain; status stays in-progress.

## Auto Run Result

Status: done

Implemented approved option A on Book detail and Edit book. Tag/Genre/Theme selection uses the shared PickerFrame/Combobox wrappers, owned options and named removal controls. Detail changes save immediately, return fresh assignments and toast Tagged 1 with Undo. Edit keeps sparse full-set changes in its session draft and saves them atomically with Book/copy edits, without an Undo receipt. Rejected names reopen the relevant picker kind and show the translated field error.

Files changed:
- `components/TagPicker.tsx`, section `DetailTags.tsx`, `BookDetail.tsx`, section actions: shared picker, owned option loading, immediate mutations/Undo and refresh.
- `lib/catalogue/editBook.ts`, Edit action/page/draft/screen: existing spine full-set contract, validation, sequential transactional Save and first-screen staged summary.
- `components/ui/Combobox.tsx`: optional query reset after successful selection without remounting the Base UI root.
- `ToastHost.tsx`, `ToastProvider.tsx`, Dialog/Sheet, overlay helper and BookDetailPanel: one accessible modal toast, sheet-aware position, Escape closes only the top modal.
- English/Finnish messages: kind labels, find/create, removal, summary opener and Tagged toast.
- ESLint service allowlist: catalogue-to-tags dependency already required by spine.
- Focused unit/integration tests and shared collection mock: new picker/draft/action/transaction behaviors and shared overlay regression coverage.
- UX, architecture spine and epic context: chosen A and shared modal-toast convention; prototype retained in `.working/tag-picker-9-7.html`.
- Spec, initial result and sprint status: review/verification/completion.

Parent verification after review patches (2026-11-05):
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run typecheck`: passed after correcting the link wrapper typing.
- Focused unit suites: picker, detail tags, Edit screen, Book detail, combobox, toastUndo, overlay and collection page — 118 tests passed. Picker/Edit suites rerun after the type correction.
- `npm run test:int -- tests/int/editBook.int.spec.ts tests/int/editBookAction.int.spec.ts tests/int/changeTags.int.spec.ts`: 41 tests passed on migrated bookeh_test.
- Scoped ESLint for all changed TypeScript/ESLint config and `git diff --check`: passed.
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run test:e2e -- tests/e2e/tag-picker.walk.spec.ts --reporter=line`: passed at 1300px and 390px after review patches. Walk stays ignored and cleans its fixture data. It verified inline add/query reset, reachable Undo inside the open modal, restored assignments, Escape preserving underlying detail, staged theme creation absent from database before Save, and refreshed classification after Save. Development toolbar hidden only to avoid obscuring phone Edit. Screenshots in `/private/tmp/bookeh-tag-picker-1300.png` and `/private/tmp/bookeh-tag-picker-390.png`; parent inspected phone output.

Matrix audit: detail add/remove and label-retaining Undo covered by real detail action integration and changeTags suites; Edit staging covered by real-picker screen test and ignored database-observing browser walk; Edit replacement/omission/foreign/wrong-kind rollback covered by editBook/action suites; system genre/theme collisions covered by changeTags integration, with Save field errors asserted on Edit screen. All covering suites ran and passed.

All four review layers completed (three concurrent slots, fourth launched as a slot freed). Every observation is individually triaged above. No deferred findings; followup_review_recommended false.

Residual risks: browser coverage is fixture Chromium at phone/desktop widths, without physical-device or screen-reader testing. Shared modal infrastructure files are named above because the acceptance walk exposed their integration issues. No schema changes, development-data changes or parallel worktrees. Authorized overrides were used for Git metadata, isolated database and browser/server checks. No push.
