---
title: '11.6 Copy actions in the bar'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: 'd4cb5dd32815c3219ad40b0d4e799c7381b8c003'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Book detail hides Lend, Move, Remove, Returned and Received inside folded copy lines. Story 11.6 moves these and Edit into the phone sheet's App bar and the wide panel's foot.

**Approach:** Derive eligible actions with one pure `copyActions(lines)` helper, reuse existing mutation, confirmation, toast and Undo semantics, and render responsive triggers. Secondary utilities move into the phone overflow and remain Links on wide screens. Reading dates share the existing Picker and live reading state.

## Boundaries & Constraints

**Always:**
- Phone: an AppBar pinned to the sheet's foot, visible while its content scrolls and while half-open, with Edit as the primary ring. Edit plus at most three copy actions in this priority: Returned, Received, Lend, Move, Remove. Additional actions go into the shared `components/ui/Menu` overflow; Remove has `bar-danger` ring and destructive treatment in overflow. Overflow also contains eligible Look it up again / Re-fetch and Add reading dates. Omit empty overflow. The sheet's bar does not acquire Collection's slot or window-scroll Top action.
- Eligibility is a pure function of copy lines: an owned, unlent copy permits Lend, Move, Remove; an owned lent copy permits Returned only; an ordered copy permits Received (even if malformed legacy data has a loan). No copies permits no copy actions. Return ordered, deduplicated action names or action records with eligible copies in priority order. Move follows the existing available-locations guard in rendering, not in the pure copy-state rule.
- Copy lines retain location/status, acquired date and price Links, loan text and notes; remove the five action triggers from those lines.
- One eligible copy goes straight to its existing action: Lend and Move Picker, Remove confirm, Returned and Received immediate. Preserve exact action arguments, field errors, afterAction refresh, Remove's no-Undo, Move/Lend/Returned/Received Undo toasts, and last-copy close versus wishlist-only continuation. Focus must stay in Book detail after a bar action disappears or is disabled; use the stable closed Your copies row or On wishlists after the last copy goes with entries remaining.
- Several eligible copies must never silently select one or act on all. Story 11.7 owns the two-step Copy picker wrapper and Back interaction; for this intermediate story, reuse the existing one-choice Picker to explicitly choose a copy, closing it before opening the existing action step. Label targets by location/status and acquired date so duplicates can be identified. Record that intermediate behavior for 11.7 continuity. Keep overlays one action step deep.
- Wide: Edit and all eligible copy actions as secondary buttons, Remove destructive, followed by Add to wishlist. Phone: Add to wishlist remains full-width above the pinned bar. Existing wide Re-fetch and hint or Look it up again stay above the foot. Only the creator's private Book with ISBN offers Look it up again; shared Book Re-fetch remains admin-only with its existing ISBN guard. Preserve the no-ISBN hint on wide screens.
- Add reading dates is offered when live reading state is read and both dates absent. Phone overflow item and wide Link open the same ReadingDatesPicker used by ReadingRow. It disappears when no longer applicable; saves and focus behavior remain as in 11.5.
- English and Finnish strings, semantic tokens, inline line icons with accessible visible names, safe areas, keyboard access and reduced motion. Reuse AppBar and UI wrappers; add only small optional APIs needed by the bar. If a wrapper contract changes, update the architecture spine's matching description in this commit.
- Keep `ReturnLoan` usable from Loans; keep Book detail Undo refresh and folding section open state working. Key book-specific controller state by book id.

**Never:** No schema/service/action contract changes. No multi-step Picker wrapper or Back-to-copy-list flow (11.7). No duplicated mutation implementations per phone/wide surface. No new committed UI tests; add only the one pure-helper test named by the story, and adapt existing assertions affected by relocated triggers.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Owned | one owned, no loan | Lend, Move, Remove | Existing action handling |
| Lent | one owned with loan | Returned | Existing action handling |
| Ordered | ordered, with or without loan | Received | Existing action handling |
| Mixed | lent, ordered, owned, repeated owned | Returned, Received, Lend, Move, Remove once each, eligible targets preserved | Existing action handling |
| None | empty copy list | no copy actions | No mutation |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx`: server reads held book, holdings, state, locations and people; five AccordionItems inside ReadAndRating; currently renders copy actions at lines 270–311, utilities and Edit/AddToWishlist after ReadAndRating. Your copies needs a stable row id for action-controller focus. Accordion root already keyed by bookId.
- `src/app/(frontend)/(sections)/CopyLine.tsx`: CopyNote, CopyPurchase must stay. Existing MoveCopy, LendCopy, RemoveCopy, ReceiveCopy, ReturnLoan contain reusable action semantics; ReturnLoan is also used outside detail. Adapt triggers/control ownership as needed without duplicating behavior. Remove waits for Dialog.onClosed before mutation, then closes detail if last with no entries, otherwise focuses On wishlists or copies row.
- New `src/app/(frontend)/(sections)/copyActions.ts`: pure frontend helper using `CopyLine` type from `src/lib/books/holdings.ts`; `isLent.ts` provides the loan predicate. New `tests/unit/copyActions.unit.spec.ts`: one test covers all five matrix scenarios, including deduplication, priority and ordered-with-loan.
- New `src/app/(frontend)/(sections)/BookDetailActions.tsx` (or a similarly scoped controller): responsive copy/utility triggers and explicit target choice, composed inside ReadAndRating's context so dates use live state.
- `src/app/(frontend)/components/AppBar.tsx`: circle primitives, SVG paths, AppBarProvider slot, window scroll Top. Add optional standalone/detail mode and destructive/icon support as necessary; preserve section defaults. No Base UI direct screen imports.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx`, `BookDetailSheet.tsx`, `components/ui/Sheet.tsx`: panel and phone frame. Sheet currently has a single scrolling Drawer.Content, so add an optional pinned footer slot forwarded only for detail as needed. Do not pin inside scrolling contents; Picker sheets retain defaults. Consider existing ToastHost collision detection via data-pinned-bottom.
- `src/app/(frontend)/components/ui/Menu.tsx`: items currently label/onSelect; optional disabled/destructive and close-safe dispatch may be needed when opening another overlay. Consult installed Base UI docs for current API.
- `src/app/(frontend)/(sections)/ReadAndRating.tsx`: HeaderRatingContext holds live line/openDates; expose minimal hook or render component for utilities, keeping Picker mounted under its context. `readingLine.ts` exports detailsRowId.
- `src/app/(frontend)/(sections)/Refetch.tsx`, `LookUpAgain.tsx`: existing pending, messages, edition choice and promote-navigation handling. Allow shared handlers to be invoked via Menu without hidden-button clicks or reproducing service behavior.
- `messages/en.json`, `messages/fi.json`: existing action names reused; add overflow and Add reading dates text if absent.
- `tests/helpers/collectionPage.ts`, `tests/unit/bookDetail*.unit.spec.ts`, `locationsGroup`, `refetchBook`, `lookUpAgain`: existing test harness mocks media queries and renders server trees. Adapt only where bar/foot placement or multi-copy target choice requires it.
- `tests/e2e/foldingSections.walk.spec.ts`: ignored precedent with pg test database fixtures, isolated walker credentials, light/dark and 390/1300px. `playwright.config.ts` mandates fixture sources, bookeh_test and port 3100.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` for serializable boundaries and relevant installed Base UI docs before changing wrappers. Avoid client-exported function calls from server components (11.5 found this failure).

## Tasks & Acceptance

**Execution:**
- [x] `copyActions.ts`, `tests/unit/copyActions.unit.spec.ts`: implement and test every matrix row in one unit test.
- [x] `CopyLine.tsx`, `BookDetailActions.tsx`: share existing action semantics and responsive triggers, explicit multi-target choice, stable focus.
- [x] `AppBar.tsx`, `ui/Menu.tsx`, sheet/frame files: minimal wrapper support for pinned standalone detail actions and overflow handoff.
- [x] `ReadAndRating.tsx`, `Refetch.tsx`, `LookUpAgain.tsx`: expose existing utilities for bar use and live Add reading dates.
- [x] `BookDetail.tsx`: remove copy-line actions, wire actions and responsive foot/utilities, preserve content and focus targets.
- [x] `messages/en.json`, `messages/fi.json`, architecture spine if required: strings and changed wrapper contracts.
- [x] Existing unit specs: adapt moved controls without new UI test cases.
- [x] `tests/e2e/copyActions.walk.spec.ts` (ignored): exercise acceptance on fixture e2e server and record observed results.

**Acceptance Criteria:**
- Given owned, lent, ordered and wishlist-only Books on phone, when detail opens half or fully, then the pinned bar shows Edit and precisely the permitted copy actions, in priority order, with excess in a nonempty overflow, and copy lines contain none of those triggers.
- Given a mixed Book on phone, when overflow opens, then omitted actions follow priority, Remove is destructive, and eligible utilities are present; selecting an action targets an explicitly chosen copy and closes the menu before its action overlay opens.
- Given one eligible copy, when Lend/Move/Remove/Returned/Received is selected, then its existing action executes directly with its existing confirmation, field errors and refresh; Remove waits for confirm, Move and Lend toasts Undo successfully.
- Given multiple eligible copies, when acting, then the user explicitly chooses the target and only that target changes, with no simultaneous action overlays; the two-step Back flow is reserved for 11.7.
- Given a read Book with no dates, when Add reading dates is chosen from phone overflow or the wide Link, then the existing dates Picker opens, saves, and the utility disappears when dates exist or the state changes away from read.
- Given admin/shared and creator/private ISBN Books, when detail is viewed on phone or wide, then Re-fetch/Look it up again appears in overflow or as a Link respectively, and retains existing behavior and role guards.
- Given the wide panel, when detail opens, then the foot shows Edit, eligible copy action buttons (Remove destructive), and Add to wishlist; the phone has full-width Add to wishlist above its bar.
- Given last-copy removal with or without entries, when confirmed, then detail focuses On wishlists and stays open or closes as before; other actions leave focus on a stable detail control and Undo preserves open sections.
- Given English/Finnish, light/dark, phone/wide, when actions are inspected and keyboard-operated, then labels, tokens, safe-area placement, focus, Escape and overlay handoff work without affecting section bars or Loans Returned.

## Spec Change Log

## Review Triage Log

### 2026-11-11 — Review pass
- verdicts: 17 findings — high 0, medium 8, low 9, false 0, maybe-false 0
- findings (in reviewer report order):
  - `[medium]` `[patch]` Blind Hunter — Tag Undo remounts persistent Picker children: the generation-keyed Group now owns DetailTags and action children, and overlay unmount leaves its history token. Preserve child identity while reseeding reading state on Undo.
  - `[medium]` `[patch]` Blind Hunter — Slow lookup can open editions over an action Picker: copy actions omit lookup.pending from busy. Disable competing copy actions during lookup.
  - `[low]` `[reject]` Blind Hunter — Copy chooser/action retains copy snapshots across an external refresh: reopening an action replaces the snapshot, mutations use the explicit immutable copy id, and services revalidate eligibility. The remaining stale description during a concurrent change is unlikely in normal use; adding target reconciliation is disproportionate here.
  - `[low]` `[patch]` Blind Hunter — Returned target choices omit borrower: use the existing localized lent marker in the target label to distinguish lent copies.
  - `[low]` `[reject]` Blind Hunter — Remove confirmation does not describe the selected copy: the separate story 11.7 explicitly owns the confirmation naming the selected location; 11.6 retains today's confirmation and explicit chooser.
  - `[medium]` `[patch]` Blind Hunter — Browser Back bypasses overflow: Menu has no overlay history token. Use the established close-on-Back hook and dispatch after both history removal and menu exit.
  - `[low]` `[reject]` Blind Hunter — Creator count failure aborts detail: the query participates in the same request's database reads, all of which can reject. No isolated failure was demonstrated; adding a special fallback for this read alone adds a guard without a normal-use failure case.
  - `[low]` `[reject]` Blind Hunter — Creator count also runs for ordinary private-book readers: the indexed id query is negligible beside existing detail reads, and using one ownership rule avoids a role-dependent shortcut. No observed latency regression.
  - `[medium]` `[patch]` Blind Hunter — Non-admin Re-fetch assertion checks old button role: adapt the existing assertion to the new overflow surface so an unauthorized menu item fails it.
  - `[low]` `[reject]` Blind Hunter — Verification section lists fallback spec names: a finding whose sole fix edits this build's specification is rejected by workflow; actual executed names and outcomes are recorded under Auto Run Result.
  - `[medium]` `[patch]` Verification Gap — Re-fetch authorization assertion misses menu items: same broken retained assertion as Blind Hunter; update it to check the responsive overflow surface.
  - `[medium]` `[patch]` Verification Gap — Only first-copy selection is exercised: adapt the existing two-copy Remove test to select the second and assert its id, without adding a new UI test case.
  - `[low]` `[reject]` Verification Gap — New Add reading dates consumer has no committed UI case: story 11.6 deliberately names the pure eligibility test and an uncommitted browser walk. Its observed consumer behavior is verified in that walk; broader persistent UI coverage conflicts with the selected test scope.
  - `[low]` `[reject]` Verification Gap — Footer pinning has only ignored browser coverage: the story deliberately requires an uncommitted phone/desktop walk. Geometry and scroll behavior passed that walk; adding committed browser coverage conflicts with the project test convention.
  - `[medium]` `[patch]` Edge Case Hunter — Lookup editions can overlap an action Picker: same demonstrated pending-state omission; include lookup.pending in busy.
  - `[medium]` `[patch]` Edge Case Hunter — Moving DetailTags under keyed Group breaks Undo lifetime: same demonstrated remount/history issue; reseed reading state without remounting children.
  - `[low]` `[reject]` Edge Case Hunter — Copy handoff overlaps outgoing transition visually: the previous Picker is already controlled closed and its history token removed before onChoose; the incoming action is the only active step. A brief outgoing animation is existing wrapper behavior and the shared same-overlay transition belongs to 11.7; extra animation synchronization here is not warranted.
- Intent Alignment auditor: descriptive only, no additional findings. Browser evidence is intentionally uncommitted, and the in-review snapshot's status is completed during finalization.

## Design Notes

Review diff excludes the concurrent 11.8 commit `12e8959c098297807c55d4942e4fd3c673430e58`; original baseline is preserved above. Only 11.6 uncommitted paths are reviewed and committed.

Story 11.7 will replace the intermediate close-then-open target Picker with the shared two-step Picker and Back flow. Eligibility and target lists introduced here remain its inputs. Do not choose a first copy silently.

## Verification

**Commands:**
- `npm run test:unit` — all pass, including the five matrix rows in the single pure-helper test.
- `npm run typecheck` — no errors.
- `npm run lint` — no errors in committed files; existing warnings recorded.
- `npm run test:e2e -- tests/e2e/copyActions.walk.spec.ts --workers=1` — walk passes on fixture server; screenshots in test-results, uncommitted.
- `npm run test:e2e -- tests/e2e/scanToSave.e2e.spec.ts tests/e2e/shopCheck.e2e.spec.ts --workers=1` — use actual existing spec names if different; both regression flows pass.

**Walk:** Owned, lent, ordered, mixed, wishlist-only, last-copy removal with/without entries; Remove cancel/confirm, Move and Lend Undo; overflow action selection, Add reading dates live visibility, role-guarded utilities; phone half/full sheet pinning and scroll, desktop foot; light/dark at 390/1300px, Finnish labels, keyboard/Escape/focus. No committed walk or screenshots.


## Auto Run Result

**Observed — 2026-11-11:**
- `npm run test:unit`: 106 files, 1,404 tests passed, including the single copy-action matrix test. Existing detail assertions now activate relocated controls and explicitly choose a copy when required.
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc-11-6 npm run typecheck`: passed. The temporary cache avoids the sandbox-denied default SWC cache; no project configuration change.
- `npm run lint`: existing ignored walk scripts report 7 errors and 73 warnings; focused ESLint across all 11.6 source/test files passes.
- `npm run test:e2e -- tests/e2e/copyActions.walk.spec.ts --workers=1`: passed in 52.5s against the final source on the fixture server at 3100 and `bookeh_test`. Screenshots and observed JSON are uncommitted under `test-results/copy-actions-walk`; browser page errors were empty.
- The walk checked owned/lent/ordered/wishlist-only eligibility, mixed priority and destructive overflow, half/full sheet pinning and scrolling, wide controls, explicit multi-copy Move/Lend/Remove selection, only-target mutation, Move/Lend/Returned/Received Undo, Remove cancel/confirm and both last-copy outcomes, dates save/disappearance/focus, admin/shared and creator/private utilities (including another creator's private Book), Finnish labels, light/dark at 390/1300px, Escape/focus, toast clearance, and Loans Returned/Undo.
- `npm run test:e2e -- tests/e2e/scanToSave.spec.ts tests/e2e/shopCheck.spec.ts --workers=1`: both regression flows passed (run alongside the initial walk attempt; later attempts corrected only walk fixture/selectors).
- The creator guard uses a small `isPrivateBookCreator` read helper, keeping the gateway behind the service boundary and all existing schemas, service signatures and action contracts unchanged.
- 11.7 continuity: copy choices show ordinal, location/status and acquired date. The existing one-choice Picker closes before the chosen action opens; Back-to-copy-list remains for 11.7.
