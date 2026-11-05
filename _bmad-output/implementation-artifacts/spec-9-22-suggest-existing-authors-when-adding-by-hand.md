---
title: 'Suggest existing authors when adding by hand'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_revision: '1538ca7ba31beb37855a117ed00192d18df5cc58'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Not found Answer's Author is a plain text field, making near duplicates easy to enter instead of reusing existing names.

**Approach:** Use the same name Combobox and `/data/suggest` as Edit book's authors, retaining free text and the manual form's keyboard and validation behavior. Check and correct Edit book's matching behavior too.

## Boundaries & Constraints

**Always:** Suggestions contain the typed text. Choosing one fills its name. Free text still saves through the existing case-insensitive author resolver. Enter submits unless a suggestion is highlighted, in which case it selects first. Keep Title autofocus, Title Enter focusing Author, required-title and required-author messages, error focus, enterKeyHint, wishlist/manual save behavior. Suggestion failures are silent and leave text entry usable. Check Edit book author rows for this behavior. Record any other by-hand author field in Residual risks. Run an uncommitted fixture-backed browser walk.

**Never:** Change the data model, `/data/suggest`, author matching rules, or commit the browser walk.

</intent-contract>

## Code Map

- `src/app/(frontend)/scan/NotFoundForm.tsx` — Author TextField at line 129; author input ref reads text for both save paths and focuses validation errors. Title Enter handler focuses this ref. Preserve pending/wishing guards.
- `src/app/(frontend)/books/[bookId]/edit/NameCombobox.tsx` — controlled name over the shared Combobox, suggestions via useSuggestions, autoHighlight false, free-text value represented as `{create: value}`. Move to components if needed for shared ownership; update existing imports.
- `src/app/(frontend)/books/[bookId]/edit/MoreDetails.tsx` — existing author rows and series reuse NameCombobox; inspect for keyboard behavior.
- `src/app/(frontend)/components/ui/Combobox.tsx` — Base UI wrapper with Input, label/error wiring, controlled query and open state. Add only the input plumbing needed by name fields (input ref, name, enterKeyHint). Verify Base UI actual Enter handling before changing it.
- `src/app/(frontend)/components/suggest.ts` — existing debounced contains suggestions; failed result yields empty list, no toast. Reuse unchanged unless a demonstrated bug requires correction.
- `tests/unit/notFoundForm.unit.spec.ts` — manual/wishlist saves, validation focus and Title Enter regressions already covered. Must use real name Combobox and update locale mocks as needed.
- `tests/unit/editBookScreen.unit.spec.ts` — existing suggestion-choice and free-text cases around lines 390–441; retain and extend only for named behavior gaps.
- `playwright.config.ts` — fixture-backed bookeh_test server on 3100; uncommitted walk must use this config. Reuse existing seed and login patterns.
- `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` — read before implementation; this change is inside existing client boundaries.

## Tasks & Acceptance

**Execution:**
- `components/NameCombobox.tsx`, Edit book imports, `components/ui/Combobox.tsx` — share name entry with the minimal input plumbing and correct Enter precedence.
- `scan/NotFoundForm.tsx` — replace Author TextField with shared name field; preserve ref-based focus and use controlled name for both targets if needed.
- `tests/unit/notFoundForm.unit.spec.ts`, `tests/unit/editBookScreen.unit.spec.ts` — focused checks for choosing a suggestion and submitting free text; include highlighted Enter precedence and silent failed suggestions where not already covered.
- `tests/e2e/authorSuggestions.walk.spec.ts` — ignored walk covering the manual entry routes, keyboard flow, suggestions, free text, errors/failure, and Edit book parity; record results in Auto Run Result.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — mark only 9.22 done after verification.

**Acceptance Criteria:**
- Given Not found Answer via Add by hand, Add without ISBN or Nothing found, when Author is typed, then existing author names containing the text appear through the same suggest path and name Combobox as Edit book, and choosing one fills that name.
- Given an unmatched author name, when submitted, then its text is saved as before with existing case-insensitive matching and create-if-missing behavior unchanged.
- Given Author with no highlighted suggestion, when Enter is pressed, then the manual form submits; given a highlighted suggestion, when Enter is pressed, then it chooses that suggestion first without submitting. Given Title, when Enter is pressed, then Author receives focus. Autofocus, input hints, required messages and validation focus remain intact.
- Given a failed suggest request, when typing and saving, then the text remains usable and no suggestion-failure toast appears.
- Given Edit book author rows, when selecting and typing free text, then the same behavior holds; other by-hand author fields discovered are listed in Residual risks.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 11 findings/observations — high 0, medium 0, low 3, false 8, maybe-false 0. Edge-case reviewer returned no findings. Platform capacity required launching the intent auditor after the first reviewer finished; all four layers completed before triage.
- findings:
  - `[false]` `reject` Blind: restore detailed crop contract in epic context — context compilation explicitly excludes story-level details; authoritative 9.21 spec and UX documents remain unchanged, and the concise crop summary retains the epic-level constraints.
  - `[false]` `reject` Blind: sprint status absent — review occurs before finalization; 9.22 is now marked done as planned, without changing other stories.
  - `[false]` `reject` Blind: Clear could leave a stale author for wishlist save — shared NameCombobox explicitly calls onChange('') on both null selection and emptied input, so typedAuthor clears. No demonstrated stale state; no extra test without a named criterion or spine rule.
  - `[low]` `patch` Blind: successful visible suggestions lack an unhighlighted Enter assertion — added the assertion that Enter remains uncancelled before navigating to a highlighted option.
  - `[low]` `patch` Blind: silent-failure assertion races request handling — request rejection now settles inside act before retained-text and no-toast assertions.
  - `[low]` `patch` Verification gap: highlighted Enter assertion cannot detect implicit browser submission in jsdom — test now checks the key event is cancelled, in addition to selection and absence of a save call.
  - `[false]` `reject` Intent: diff alone cannot establish workflow/Git compliance — read-only Git checks establish the separate story worktree; metadata writes used require_escalated, and finalization creates the requested numbered commit. This is an evidence boundary, not a defect.
  - `[false]` `reject` Intent: component tests exercise mocked saves and suggestions — expected component-test boundary; actual endpoint and browser flow were also walked against fixtures.
  - `[false]` `reject` Intent: browser/persistence evidence absent from committed diff — project convention explicitly requires an ignored walk and recorded observations; completed successfully, while the existing case-insensitive resolver is unchanged.
  - `[false]` `reject` Intent: context restates broader scope — workflow required refreshing stale epic context; compiler followed concise epic-level scope, without changing authoritative crop requirements.
  - `[false]` `reject` Intent: completion status absent in review diff — finalization owns this update; 9.22 is now done in sprint status.

## Verification

**Commands:**
- `npm run lint` — no errors.
- `npx tsc --noEmit` — no errors.
- `npx vitest run --project unit tests/unit/notFoundForm.unit.spec.ts tests/unit/editBookScreen.unit.spec.ts` — all pass.
- `npx playwright test tests/e2e/authorSuggestions.walk.spec.ts --project chromium` — uncommitted fixture browser walk passes; observations recorded.

## Auto Run Result

- Implemented the shared name Combobox in Not found and Edit book. Kept `/data/suggest`, the debounced hook, author resolver, and Base UI Enter handling unchanged; inspected installed Base UI 1.8.0 input handling and verified both Enter paths.
- Focused unit suite: 52 tests passed. `npx tsc --noEmit`, focused ESLint, and `git diff --check` passed.
- Uncommitted, ignored `tests/e2e/authorSuggestions.walk.spec.ts`: Chromium passed (15.0s) using `playwright.config.ts`, fixture source, seed user, and bookeh_test on port 3100. Walk verified Add without ISBN, unavailable lookup → Add by hand, Nothing found → Add by hand; title autofocus and Enter focus, input hints, required messages/error focus, actual contains suggestions, mouse choice and highlighted Enter without submission, unhighlighted Enter free-text saves, failed suggestion request with usable text and no error toast, and Edit book suggestion/free-text parity.
- Worktree browser setup needed a temporary Turbopack root widened to the repository ancestor because `node_modules` is symlinked; restored config afterward. A temporary malformed fixture exercised unavailable lookup and was removed afterward. The first complete walk attempt referenced an author removed by existing unused-record cleanup after editing; corrected the walk to use the saved author and reran successfully. No product changes were needed for these setup/walk issues.

- Final verification after review assertions: `npm run lint` passed (0 errors, 60 existing migration warnings), `npx tsc --noEmit` passed, both focused unit files passed (52 tests), and `git diff --check` passed. The browser walk passed on the identical product implementation; subsequent edits only strengthen unit assertions and record status/results.
- Files changed: shared `components/NameCombobox.tsx` moved from Edit book with input plumbing; `MoreDetails.tsx` imports it; `ui/Combobox.tsx` forwards input ref/name/hint; `NotFoundForm.tsx` uses controlled name entry; the two unit suites verify selection and free text; refreshed epic context, this spec and sprint status record completion.
- Review result: three low test-verification patches, no deferred items, eight rejected observations with reasons above. Follow-up review recommended: false (patched entries: high 0, medium 0, low 3). No product code defects found by review.
- Status: done. Commit requested with story number 9.22; no push or merge.

## Residual risks

Other by-hand author surfaces: no additional frontend author-entry fields found beyond Not found and Edit book. Payload admin retains its existing Books/UserBooks author relationship fields and Authors name editor; these back-office fields are outside this feature.

Parallel worktree shared files: `sprint-status.yaml`, `epic-9-context.md`, shared Combobox and Edit book imports may also be touched by other stories. Do not merge or push automatically.

### 2026-11-05 — CI failure follow-up

User supplied four unit failures from CI. Fixed test setup without product changes: set getUserBookState defaults in beforeEach rather than afterEach so the first Book detail case has state; mock tagUse in LoansPage so its fake context never reaches the real gateway; wait for asynchronous Done focus after the Read transition. The full suite additionally found UnavailableActions lacking the useLocale mock required by the new shared combobox; added it.

Verification: all 99 unit files and 1341 tests pass; TypeScript, ESLint on all four changed test/helper files, and git diff --check pass. These fixes are included by amending the 9.22 commit at the user's request. The provided failures were unit failures, so no browser walk rerun was necessary for these test-only changes.
