---
title: 'Close X on the wishlist screen'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_revision: 'd0025ff6052a099ac51ea3c67496b1d1be155ac0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/CLAUDE.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** On a phone, leaving an opened wishlist depends on a Back link that is easy to miss.

**Approach:** Add an accessible Close X at the right end of the Back link row, returning to `/wishlists`, and document the behavior in the UX contract.

## Boundaries & Constraints

**Always:** Keep the Back link's text and place unchanged. The X uses DESIGN.md's Close strokes, has a target at least 44px square, and is labelled “Close” / “Sulje” through existing translations. Show it below 900px, including failed reads and while `?entry=` is open. Preserve heading and layer focus behavior. Update DESIGN.md or EXPERIENCE.md → Wishlists in the same commit. Verify through an ignored fixture-backed Playwright walk in `tests/e2e/*.walk.spec.ts`, recording observations in Auto Run Result.

**Never:** Show the wishlist X from 900px. Change the entry detail's own close, data access, modal behavior or navigation contracts. Add committed tests for this markup-only criterion. Push or merge. Make changes outside this story's worktree. Commit the walk or temporary browser setup.

</intent-contract>

## Code Map

All paths resolve from this spec's worktree root (`../..` from its directory), exclusively `/Users/mika/development/bookeh/.claude/worktrees/story-9-23-wishlist-close`.

- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx` — `WishlistPage`, lines 105–110: the BackLink container precedes the failed-read branch and entry layer, so adding X here covers every state. Existing load/redirect/people logic stays unchanged. BackLink currently sits at left in a `pt-2` row; keep its vertical geometry and text.
- `src/app/(frontend)/components/Link.tsx` — BackLink is a Next Link with meta text and phone minimum tap height. Preserve it unchanged.
- `src/app/(frontend)/components/CloseButton.tsx` — existing Close SVG reference: size-4, viewBox 0 0 16 16, path M2 2 L14 14 M14 2 L2 14, currentColor strokeWidth 2. A navigational X should use Next Link rather than nesting a button in an anchor. Keep this local for one usage unless a shared abstraction is justified.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryDetail.tsx`, `src/app/(frontend)/(sections)/BookDetailPanel.tsx` — existing modal sheet/panel and own close; read-only. The new X lives behind the modal when open and must not circumvent inert/focus trapping.
- `src/app/(frontend)/components/FullScreenTask.tsx` — existing close localization (`task.close`).
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md` — Wishlists table row at line 287 documents Back link; extend with phone X, breakpoint, failed-read/entry presence and separate entry close.
- `node_modules/next/dist/docs/01-app/03-api-reference/02-components/link.md` — installed version guide: native aria-label/className supported by Next Link. Read relevant guide before coding.
- `playwright.config.ts`, `tests/e2e/seed.ts`, `tests/e2e/account.ts`, existing e2e specs — fixture webServer at 3100, bookeh_test; seed resets wishlist data. Walk can create list and wish through real UI. For failed-read check use a reversible, local server-side fault scoped to the walk, then restore it. Do not substitute a fake DOM for the failed-read branch.

## Tasks & Acceptance

**Execution:**
- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx` — add the labelled phone X in the Back row with existing tokens and no autofocus; preserve Back link layout and entry code.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md` — update Wishlists row in the same change.
- `tests/e2e/wishlistClose.walk.spec.ts` — ignored walk: phone geometry, both navigation links, English/Finnish labels, 899/900px boundary, failed read and open entry focus/own close. Record commands, observations and any temporary setup in Auto Run Result; restore temporary code/config before final verification.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — mark only 9.23 done on completion.

**Acceptance Criteria:**
- Given `/wishlists/<listId>` below 900px, when rendered, then a Close X sits at the right end of the Back row, is labelled Close / Sulje, measures at least 44px in both directions and navigates to `/wishlists`.
- Given the same wishlist, when rendered at any width, then the Back link retains its text, left placement and destination; from 900px the new X is absent.
- Given a failed wishlist read or an open `?entry=` layer, when rendered on the phone, then the X remains in the Back row without stealing heading or layer focus, and the entry's own close retains its existing behavior.
- Given the finished story, when reviewing UX docs and recorded walk evidence, then Wishlists documents the X and the ignored fixture-backed phone walk covers the X, Back, entry sheet and failed read without new committed tests.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 10 findings/observations — high 0, medium 0, low 7, false 3, maybe-false 0. Edge-case layer returned no findings. All four review layers completed; platform capacity required launching intent alignment when the first of three reviewers finished, before triage.
- findings:
  - `[low]` `patch` Blind: context refresh drops Finna match-only / Google-first / deduplicated genre mapping — restored exact baseline cache, retaining these constraints.
  - `[low]` `patch` Blind: context refresh drops URL encoding and malformed/repeated-value rules — restored exact baseline cache, retaining these constraints.
  - `[low]` `patch` Blind: context refresh drops wishlist-only label eligibility — restored exact baseline cache, retaining this constraint.
  - `[low]` `patch` Blind: context refresh drops protection for existing private genres when a system genre later shares their name — restored exact baseline cache, retaining this constraint.
  - `[low]` `patch` Blind: context refresh drops untranslated themes and empty-field re-fetch — restored exact baseline cache, retaining these constraints.
  - `[low]` `patch` Blind: context refresh drops manual author keyboard/free-text/failure safeguards — restored exact baseline cache, retaining these constraints.
  - `[false]` `reject` Verification: no persistent Close regression test — the underlying absence is accurate, but story 9.23 explicitly requires an uncommitted walk and “no test beyond that, as the criterion is markup”; delivered verification follows that requirement, so this is not a defect or a deferral.
  - `[false]` `reject` Intent: diff cannot establish worktree, Git approvals, commit or sprint finalization — Git confirms the separate story branch/worktree, metadata writes use approved escalation, and commit/status finalization follows review. This is an evidence boundary of a pre-finalization diff.
  - `[false]` `reject` Intent: narrative browser evidence is not independently established by diff — expected for the explicitly ignored walk; the real fixture-backed Chromium run passed and its observations are recorded. No committed browser test is permitted by this story.
  - `[low]` `patch` Intent: incidental broad context rewrite exceeds wishlist scope — restored exact baseline cache; no unrelated planning-contract edits remain.
- All seven patched observations share one root cause (lossy generated-cache refresh) and one low entry; no product changes, no deferred items.

## Verification

**Commands:**
- `npx tsc --noEmit` — no type errors.
- `npm run lint` — no errors (existing migration warnings may remain).
- `npx playwright test tests/e2e/wishlistClose.walk.spec.ts --project chromium` — required ignored fixture walk passes; record actual observed outcomes.
- `git diff --check` — no whitespace errors.

## Residual risks

Parallel story worktrees may share `sprint-status.yaml`, `epic-9-context.md` and EXPERIENCE.md. Keep changes scoped; no automatic merge.

## Auto Run Result

- Loaded the full spec and its `context:` file, `CLAUDE.md`, before implementation; read the installed Next Link guide and the mapped navigation/overlay components.
- Added a local Next Link X to the existing Back row using `task.close`, DESIGN.md's 16px SVG / 2px strokes, `min-h-tap min-w-tap`, and `wide:hidden`; BackLink, load/navigation logic and entry detail components are unchanged. Updated EXPERIENCE.md → Wishlists.
- `npx playwright test tests/e2e/wishlistClose.walk.spec.ts --project chromium` — **1 passed (23.0s)** on the fixture-backed `bookeh_test` server at port 3100. The ignored walk creates the wishlist and entry through Scan's real fixture lookup and Add to wishlist UI.
- At 390×844, X measured **44×44px at (326,28)**; Back measured **53.046875×44px at (20,28)**. Both are aligned at the original row top; Back remains left and X is right. Both navigated to `/wishlists`. Initial focus remained on BODY; X did not autofocus, and the existing `section[tabindex="-1"]` containing the heading remained focusable.
- X visible at **899px**, hidden at **900px**, with Back visible. Switching the real profile setting to Suomi produced **Sulje**, which navigated to `/wishlists`; the walk restored English.
- Open `?entry=` retained X in the background DOM, excluded it from accessible links while the sheet was modal, and kept initial focus plus **14 successive Tabs** inside the entry dialog. The entry's own Close returned to the same wishlist without `?entry=`, exposing its X again. A diagnostic forced `HTMLElement.focus()` call can escape Base UI's existing modal behavior; this is not user keyboard navigation, and no overlay behavior was changed.
- A temporary server-side rejected load, scoped to `BOOKEH_SOURCES=fixture` plus `?walkFailed=1`, exercised the actual failed-read catch/render branch with `&entry=1`: **Couldn't load.**, Back and X rendered, no entry dialog appeared, X did not take focus, and X returned to `/wishlists`. No fake DOM was used. **Removed this temporary fault before final static verification.**
- Temporary browser setup: initial sandbox run could not create tsx's IPC socket, so the fixture walk ran with approved sandbox escalation. Turbopack rejected this worktree's external `node_modules` symlink; temporarily added `--webpack` to the Playwright webServer dev command. **Restored playwright.config.ts exactly afterward.** Earlier walk attempts corrected phone-only Scan navigation, expected phone margin (20px), existing heading focus behavior, profile switch button roles and existing failed-read copy; the final complete walk passed.
- The walk remains ignored by `/tests/e2e/*.walk.spec.ts`; no committed tests or temporary browser configuration were added. At implementation handoff, sprint status and static checks awaited parent review; final outcomes follow below.

- Parent verification: `npx tsc --noEmit` passed; `npm run lint` passed with 0 errors and 60 existing migration warnings; `git diff --check` passed. The ignored walk’s console diagnostics initially triggered lint, corrected with a walk-local no-console directive; no committed source changed. Fixture Chromium walk passed on the final product implementation; subsequent review repair only restores the generated context to baseline.
- Reviewed files: wishlist page adds the phone navigation X; EXPERIENCE.md documents it; this spec records plan, review and verification; sprint-status.yaml marks only 9.23 done. Generated epic context was compiled as required, then restored verbatim to prevent losing existing contracts; it has no final diff.
- Review: seven low observations repaired as one generated-cache correction, three rejected observations with reasons above; high 0, medium 0, low 1 patched root cause. Deferred items: none. Follow-up review recommended: false. Product implementation unchanged through review.
- Residual risks: shared documentation/status files may conflict when merging other story branches. Existing Base UI programmatic-focus behavior is unchanged; user keyboard focus remained in the entry sheet. Temporary server failure hook and webpack configuration are removed; the browser walk stays ignored.
- Status: done. Finalization creates the requested conventional commit with story number 9.23; no push or merge.
