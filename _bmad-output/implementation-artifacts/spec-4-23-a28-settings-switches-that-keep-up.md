---
title: '4.23 [A28] Settings switches that keep up'
type: 'bugfix'
created: '2026-10-21'
status: 'done'
baseline_revision: 'b42c2fc87019d1471630990c5befdd5fd5164ab6'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-4-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Theme, Language and both Visibility switches revert to a `previous` captured at tap time. A late failure of the first of two quick taps leaves the switch showing an unstored value (retro R3). The profile visibility group's `aria-label` "Profile" collides with the "Profile" heading, and no visible label is tied to its group (R15). An error toast stays up after a retry succeeds (3.44 deferred).

**Approach:** A client hook, `useSavedSwitch`, keeps per control a call sequence, an in-flight count and the stored value: the newest success, or `initial`. While calls are in flight, the switch shows the last tap. When the last call settles, it shows the stored value. Only the latest call's failure toasts. A success newer than the call that raised this control's toast withdraws that toast, by id. The toast store's `show` returns its id, and `withdraw(id)` dismisses only while that toast is still shown. Visibility groups use `aria-labelledby`: own visible label + Visibility heading.

## Boundaries & Constraints

**Always:** The tapped option shows at once, and Theme's `data-theme` follows the shown value. UNAUTHENTICATED still goes through `reportFailure` to sign in. Language still refreshes the route on success.

**Never:** No change to DisplayNameField or DefaultLocationField. No retry or queue, no new strings, no spine change, still one toast at a time.

## I/O & Edge-Case Matrix

| Taps / settles | Shown | Toast |
|----------------|-------|-------|
| A, B; B ok, then A fails | B | none |
| A, B; B fails, then A ok | B until A settles, then A | B's error stays |
| A ok; B fails | A | error |
| B fails; B again ok | B | B's error withdrawn |
| Theme fails, Language fails, Theme retry ok | Theme's retry | Language's error stays |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/settings/{Theme,Language,Visibility}Switch.tsx` -- the `change` functions with the `previous` race.
- `settings/DefaultLocationField.tsx:44-55` -- the `latest` + `stored` ref pattern to follow.
- `settings/page.tsx:16-23,57-70` -- `Group` renders the `<h2>`, and Visibility holds both switches.
- `components/TextSwitch.tsx:29` -- `role="group" aria-label={label}`. Only the three switches use it.
- `components/request.ts:49-79` -- `reportFailure` / `useReportFailure` return void today.
- `components/toast/store.ts:87-109` -- `show` (increments `id`), `dismiss` → `startLeaving`.
- `components/toast/ToastProvider.tsx:23-27,50-53,132` -- the context value. `onClose={store.dismiss}` passes an event, so `dismiss` takes no id.
- `components/toast/RaiseToast.tsx:17` -- `useEffect(() => show(input))`. It breaks typing once `show` returns a number.
- `tests/unit/signOutButton.unit.spec.ts` -- the jsdom mock pattern (next-intl, next/navigation, action, useToast).

## Tasks & Acceptance

**Execution:**
- `toast/store.ts`, `ToastProvider.tsx` -- `show` returns the id. Add and expose `withdraw(id)`.
- `toast/RaiseToast.tsx` -- a block-bodied effect.
- `components/request.ts` -- `reportFailure` / `useReportFailure` return the toast id, or `null` for UNAUTHENTICATED.
- `settings/useSavedSwitch.ts` (new) -- `useSavedSwitch(initial, save, onSaved?)` returns `[value, change]`, as in the Approach.
- The three switches -- use the hook. Theme syncs `data-theme` from the shown value. Language's `onSaved` is `router.refresh`.
- `TextSwitch.tsx` -- `label` (aria-label) or `labelledBy` (aria-labelledby).
- `page.tsx`, `VisibilitySwitch.tsx` -- the Visibility `<h2>` gets an id. The label `<p>` gets `useId()`, and the group is labelled by both.
- `tests/unit/settingsSwitch.unit.spec.ts` (new) -- through VisibilitySwitch with deferred promises: matrix rows 1–4, and row 5's withdraw by the failure's own id.
- `tests/unit/toastStore.unit.spec.ts` -- `withdraw` dismisses its own toast and leaves a newer one (row 5).

**Acceptance Criteria:**
- Given any of the four switches, when I tap two options and the first settles after the second, then the switch shows my last tap (and `data-theme`), ends on the stored value, and a stale failure does not toast.
- Given the Visibility group, when a screen reader names the switch groups, then they are "Profile Visibility" / "Collection Visibility" ("Profiili Näkyvyys" / "Kokoelma Näkyvyys"), from the visible labels, distinct from the "Profile" heading.
- Given a switch's error toast, when a retry on that switch succeeds, then the toast is dismissed, but a toast raised since by something else stays.

## Spec Change Log

## Review Triage Log

### 2026-10-21 — Review pass
- verdicts: 22 findings — high 0, medium 0, low 14, false 8, maybe-false 0
- findings:
  - `[low]` `[patch]` Verification: Theme's `data-theme` sync, named in AC1, has no test. Added a ThemeSwitch case: the attribute changes on the tap and returns after a failed settle.
  - `[low]` `[reject]` Verification: Language's `router.refresh` via `onSaved` is untested. It is a boundary, not an AC, and the tests convention admits a test only for an AC or a spine rule.
  - `[low]` `[patch]` Verification: AC2's group name is never asserted, and `headingId` points at nothing. Added one accessible-name assertion with the heading rendered.
  - `[low]` `[patch]` Verification: the out-of-order double success (the `call > stored.call` guard) is untested. It is AC1's plain "first settles after the second" case with both ok, so a case was added.
  - `[low]` `[reject]` Verification (other): `onSaved` also runs on stale successes. This is the same root as Blind's Language refresh row, rejected there.
  - `[false]` `[reject]` Edge: Theme's revert writes a stale `initial` into `data-theme`. The revert follows the shown option, so switch and colours agree. The real defect at this spot is the one in Blind's first row, patched there.
  - `[false]` `[reject]` Edge: a control-flow error rethrown by `settleAction` skips `inFlight--`. `unstable_rethrow` only rethrows Next navigation (redirect, notFound), which leaves the page and unmounts the switch; `runAction` turns every domain failure into an `ActionResult`.
  - `[low]` `[patch]` Blind: the Theme effect's "not on mount" value comparison skips a write when the theme returns to a stale `initial`. Replaced with a first-run-only skip (mounted ref).
  - `[false]` `[reject]` Blind: colours change a frame late because of `useEffect`. React flushes the passive effects of a discrete (click) update synchronously before paint. Only the revert, inside a transition, can lag, and it has no paired switch frame to disagree with.
  - `[low]` `[reject]` Blind: Language refreshes on every success, stale ones included (fi→en→fi flicker). The old code did the same. It needs two quick language taps, and the fix adds a refreshed-call guard.
  - `[false]` `[reject]` Blind: the hook ignores the server's answer. The three fields are enums that the server stores as sent or refuses with a failure, so `next` is the stored value.
  - `[low]` `[patch]` Blind (also Verification row 1): no `data-theme` test. Same root as Verification row 1, patched there.
  - `[low]` `[patch]` Blind: test titles use matrix letters while the taps are options b/c. Renamed after the option values.
  - `[false]` `[reject]` Blind: the R15 fix covers only Visibility. AC2 names the visibility groups; Theme's and Language's names equal their own headings and collide with nothing.
  - `[low]` `[patch]` Blind: the `labelledBy` JSDoc sits on the union member. Moved onto the property.
  - `[false]` `[reject]` Blind: a failed value stays shown while an older call is in flight. That needs out-of-order settles, which Next.js's one-at-a-time actions do not produce, and the matrix (row 2) states it.
  - `[false]` `[reject]` Intent (a): row 2 ends on the older success, not the last tap. The literal "ignore" reading would leave the switch on a value the server does not hold, which is the harm R3 names; the story asks the switches to "show what is stored".
  - `[low]` `[patch]` Intent (b): the reachable in-order race (the first fails while the second is in flight) is untested. Added a case: the later tap stays, with no toast.
  - `[low]` `[patch]` Intent (c): only VisibilitySwitch is exercised. Same root as Verification row 1 (Theme). Language's refresh is rejected as in Verification row 2.
  - `[low]` `[reject]` Intent (d): "stored" is inferred from ok results, so a NO_CONNECTION after a server commit leaves the switch off the database value. The old code had the same issue; a fix would read state back from the server.
  - `[low]` `[patch]` Intent (e): AC2 has no test. Same root as Verification row 3, patched there.
  - `[false]` `[reject]` Intent (f): AC3 dismisses on any newer success on that control, and DisplayNameField is untouched. A newer success makes that control's error obsolete. The AC's Given names only the three switches, so DisplayNameField's part of the 3.44 item stays open (residual risk).

## Design Notes

Next.js runs a client's server actions one at a time, so settles normally arrive in tap order, and "show stored when the last call settles" is the same as "apply the latest". The in-flight rule also handles out-of-order settles. A late older success never replaces a newer success's stored value. A switch never ends on a value that was not saved.

Two `aria-labelledby` ids keep the visible label in the name (WCAG 2.5.3) without new strings.

## Verification

**Commands:**
- `npm run typecheck` -- clean
- `npm run lint` -- 0 errors
- `npx vitest run tests/unit/settingsSwitch.unit.spec.ts tests/unit/toastStore.unit.spec.ts tests/unit/raiseToast.unit.spec.ts` -- pass
- `npm run test:unit` -- pass

## Auto Run Result

Status: done

**Summary.** The Theme, Language and Visibility switches now go through one hook, `useSavedSwitch`. It keeps a call sequence per control, an in-flight count and the stored value, which is the newest success or else `initial`. While calls are in flight the switch shows the last tap; once the last call settles, it shows the stored value. Only the latest call's failure toasts, and a stale failure never reverts over a newer tap, which was the R3 race. Theme's `data-theme` follows the shown value through an effect that skips only the first run. A successful newer save withdraws the error toast that control raised, by id: the toast store's `show` returns the id, and the new `withdraw(id)` dismisses only while that toast is still on screen. Each visibility group is now named by `aria-labelledby` from its own visible label plus the Visibility heading ("Profile Visibility" / "Profiili Näkyvyys"), which fixes R15 without new strings.

**Files changed**
- `src/app/(frontend)/(sections)/settings/useSavedSwitch.ts` (new): the shared hook.
- `ThemeSwitch.tsx`, `LanguageSwitch.tsx`, `VisibilitySwitch.tsx`: use the hook. Theme syncs `data-theme`, Language refreshes in `onSaved`, and Visibility labels its group by its label and the heading.
- `settings/page.tsx`: the Visibility `<h2>` has the id `settings-visibility`.
- `components/TextSwitch.tsx`: takes `label` or `labelledBy`.
- `components/toast/store.ts`, `ToastProvider.tsx`: `show` returns the id; new `withdraw(id)`.
- `components/toast/RaiseToast.tsx`: the effect has a block body.
- `components/request.ts`: `reportFailure` / `useReportFailure` return the toast id, or `null`.
- `tests/unit/settingsSwitch.unit.spec.ts` (new): 9 cases covering matrix rows 1–5, the in-order race, two successes out of order, the group's accessible name, and Theme's `data-theme`.
- `tests/unit/toastStore.unit.spec.ts`: `withdraw` by id.
- `epic-4-context.md`: regenerated, because the spine had changed since the cached copy was written.

**Review findings.** 22 findings: 14 low, 8 false.
- **Patched (low, 10 rows across 7 fixes):**
  - Theme's mount skip is a first-run flag instead of a value comparison.
  - New tests: Theme `data-theme`, the in-order race, two successes out of order, and the AC2 group name.
  - Test titles renamed after the option values.
  - The `labelledBy` JSDoc moved onto the property.
- **Deferred:** none.
- **Rejected (reasons in the Review Triage Log):**
  - low:
    - no test for Language's refresh;
    - `onSaved` on stale successes (twice);
    - Language refresh flicker on quick taps, as before;
    - stored inferred from ok results.
  - false:
    - stale `initial` revert;
    - rethrow skipping `inFlight--`;
    - one-frame colour lag;
    - server answer ignored;
    - R15 for Theme/Language;
    - failed value shown while an older call is in flight;
    - row 2 ending on the older success;
    - AC3 breadth and DisplayNameField.

**Follow-up review:** not recommended. Only low entries were patched (10 low rows, no medium or high).

**Verification**
- `npm run typecheck` clean.
- `npx eslint --ignore-pattern '.claude/**' .`: 0 errors, 36 warnings, all there before. Plain `npm run lint` also picks up 66 errors from other stories' worktrees in `.claude/worktrees/*/.next`, not from this change.
- Prettier is clean on the touched files.
- `settingsSwitch`, `toastStore` and `raiseToast` specs: 32 passed. `npm run test:unit`: 43 files, 681 tests passed.

**Residual risks**
- DisplayNameField keeps the 3.44 lingering-toast behaviour. The AC named only the switches; with `withdraw(id)` in place it is a three-line fix.
- `npm run lint` in the main checkout fails while other worktrees hold generated `.next` types. An `.claude/**` ignore in the ESLint config would fix that.
- No browser check: screen-reader output and colours were not checked in a real browser.

