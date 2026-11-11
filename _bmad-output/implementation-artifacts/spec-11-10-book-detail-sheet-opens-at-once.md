---
title: '11.10 Book detail sheet opens at once'
type: 'feature'
created: '2026-11-11'
status: 'done'
baseline_revision: '6bff5bced599914b6e418fc00f6ae385cf965f2c'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** A non-prefetching row or cover link waits for its server-rendered detail before mounting the phone sheet. During that pause a tap can read as missed.

**Approach:** On phones, open the existing addressed sheet immediately with the displayed Book's cover, title and authors and pulsing square placeholder bars. Keep that same sheet mounted when server detail replaces the pending content. Preserve the desktop panel and navigation rules.

## Boundaries & Constraints

**Always:**
- Apply below 900px to collection rows, cover tiles, collection text search, Loans rows and wishlist entry rows. Wishlist addresses remain `?entry=` because entries are independently addressed; collection and Loans retain `?book=`. Keep Links, `prefetch={false}`, `scroll={false}` and push on first open / replace when swapping.
- A small client boundary inside each Link passes only the displayed cover, title, authors and cover language. `BookRow`, `CoverTile`, `LoanRow` and `EntryRow` stay hook-free/server-renderable. Preserve modified clicks/new tabs, keyboard activation and select-mode labels.
- Pending uses `title` type for the title, muted `meta` for authors, the existing cover-header geometry, and square `border` coloured placeholder bars with a gentle opacity pulse, including under reduced motion. Reconcile pending and real header typography/geometry so cover/title/authors do not move at handoff; keep wide BookHeader styling intact. No new tokens, colour literals, shadows or styling libraries.
- Pending and real content share ONE mounted addressed `BookDetailSheet`/`Sheet`. No extra overlay history entry, close/re-slide, snap-point reset, or content jump at handoff. The sheet remains modal with the normal dimmed scrim. Keep action/footer, toast, close, filter-chip and overlay contexts intact.
- X, Esc, scrim and downward drag close even while pending. Pending close supersedes the unfinished navigation without popping an unrelated history entry. No delayed reopen, duplicate sheet or duplicate history push; later taps start clean. Back/Forward retain one entry per successful open; direct addresses and reload work.
- A failed server detail read closes the sheet and displays the existing LoadFailed state with its retry. Handle async render failures explicitly, not by try/catch around unresolved JSX. Unreadable/missing Books and entries retain their existing NotInLibrary/NotOnList behavior.
- From 900px keep panel behavior and the Link Progress line. Supply any interface strings in English and Finnish. Document changed sheet/address rules in ARCHITECTURE-SPINE.md in the same story commit.
- Run the screen acceptance walk as ignored `tests/e2e/*.walk.spec.ts` against the fixture e2e server (`bookeh_test`), recording results in Auto Run Result. Cover both themes; rows and covers at all s/m/l sizes; fast, throttled and failed opens; pending cancellation; double tap; keyboard; Back/Forward; Loans/wishlists; wide panel; reduced motion.

**Never:** No schema/service changes, prefetching, alternate overlay library, duplicate pending sheet, or committed browser/component tests. Add a unit check for same-instance selection only if it falls naturally into a meaningful pure helper; do not create an artificial helper solely for a test. Do not change scan/find's LookupRow: it opens Answers, not Book detail.

</intent-contract>

## Code Map

All source paths below are relative to this worktree root, not the main checkout.
- `src/app/(frontend)/(sections)/layout.tsx` -- persistent section shell; a small pending-open context can live here. `components/ui/overlay.tsx` exports `useWide`, breakpoint 900px.
- `BookRow.tsx:109`, `CoverTile.tsx:94` under `(sections)` -- non-select Link children currently end in `LinkProgress`. `components/LinkProgress.tsx` uses `useLinkStatus`; installed Next docs `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/use-link-status.md` confirm true before history updates, false after, and it must live within Link. `Link` docs describe modified clicks and `onNavigate`.
- `(sections)/loans/LoanRow.tsx` and `wishlists/[listId]/EntryRow.tsx` -- distinct hook-free links need the same boundary; shelf rows/tiles alone do not cover these surfaces.
- `(sections)/page.tsx:121`, `loans/page.tsx:183`, `wishlists/[listId]/page.tsx:157` -- conditional async BookDetail/EntryDetail. Add an unconditionally mounted per-page slot at the existing detail position so it persists from pending through resolved props. Keep it inside the existing ShelfActions/Selection providers.
- `(sections)/BookDetailPanel.tsx:45` -- BookDetailFrame currently chooses panel or Sheet; in a hosted slot, phone Frame must render real children in the slot's existing Sheet. Avoid registering nodes into a layout host or portalling them outside page providers, which loses action/overlay contexts. Existing FooterContext and BookDetailFooter must keep the phone pinned bar working.
- `(sections)/BookDetailSheet.tsx:33` -- addressed wrapper owns open animation and `useTaskBack`; add pending-close override where needed. `components/ui/Sheet.tsx:72` owns Drawer snap points, sheet layering, swipe suspension and close-complete callback. Preserve its identity and snap state.
- `(sections)/BookDetail.tsx:58`, `wishlists/[listId]/EntryDetail.tsx:22` -- async server renders. Await them inside server result handling to catch failures; unresolved JSX is not caught. `(sections)/LoadFailed.tsx` is the existing retry UI; root `error.tsx` currently handles uncontained failures.
- `(sections)/BookHeader.tsx:26` -- shared real header: 120px cover, heading-detail title and title authors. Needs phone pending/real position agreement; retain author filter chips and wide typography. Pending seed comes from the row, not an additional read.
- `components/navigation.ts:289` -- useTaskBack consults tracked depth; it must only handle a committed open. While pending the URL has no new entry, so replace the originating list address to supersede navigation. `(sections)/NotInLibrary.tsx` and wishlist NotOnList retain existing behavior.
- `styles.css:615` -- sheet-motion already suppresses movement under reduced motion; add placeholder opacity animation separately so the pulse persists. Reuse current tokens/spacing.
- `playwright.config.ts`, `tests/e2e/{account,seed,scanToSave.spec,shopCheck.spec}.ts` -- test-server setup and existing flows. `node_modules` and env files are linked locally from main for tooling. Current host Node is 22.16.0 (package requests >=22.23.3); use an available suitable Node if needed.
- Continuity: completed story 11.8 changes Stats only; 11.6/11.7 already supply BookDetailFooter and copy-action picker. Those must survive the new persistent shell. Main also has unrelated active worktrees sharing row/header/sheet docs; list shared files under Residual risks.

## Tasks & Acceptance

**Execution:**
- [x] `(sections)/layout.tsx` and a new pending-open client context/boundary -- wire row seed and lifecycle without moving full rows onto client hooks.
- [x] `(sections)/BookRow.tsx`, `CoverTile.tsx`, `loans/LoanRow.tsx`, `wishlists/[listId]/EntryRow.tsx` -- pass seed inside existing Links; desktop progress and select semantics preserved.
- [x] New `(sections)/BookDetailSlot.tsx`, `BookDetailPanel.tsx`, `BookDetailSheet.tsx`, section/list pages and server detail result handling -- one persistent phone shell, real content handoff, cancellation, error state, address/direct-open/back rules, working pinned footer and contextual actions.
- [x] `(sections)/BookHeader.tsx`, `styles.css`, any needed `messages/{en,fi}.json` -- matching header placement and token-only pulsing placeholders.
- [x] `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- update UI primitives and address contract; sprint status -- mark final outcome.
- [x] `tests/e2e/bookOpen.walk.spec.ts` (ignored) -- walk the acceptance criteria, record observations; no committed browser test.

**Acceptance Criteria:**
- Given each phone list surface, when a row or cover is activated during a throttled server render, then the dimmed list is covered immediately by one sliding sheet with the row's cover/title/authors and square pulsing placeholders.
- Given a pending sheet, when real content arrives, then the same Sheet DOM instance and snap point remain, placeholders disappear, and cover/title/authors keep their position without a close, slide or jump; a fast render causes no placeholder flash after content has arrived.
- Given pending navigation, when X, Esc, scrim or drag closes or a second activation occurs, then close cancels the open, no late response reopens it, and at most one entry/sheet exists; a subsequent tap opens cleanly.
- Given a failed detail read, when the render settles, then the sheet is gone and LoadFailed offers retry; missing/unreadable data follows its existing notice behavior.
- Given an opened detail, when Back/Forward or direct URL/reload is used, then existing address/history rules hold with exactly one entry per open and all actions/footers still usable.
- Given wide screens, modified/keyboard clicks or select mode, when used, then panel/progress, native link behavior, keyboard access and checkbox behavior remain correct.
- Given either theme or reduced motion, when pending is shown, then semantic colours remain readable and placeholder opacity continues pulsing while slide motion respects the existing reduced-motion rule.

## Spec Change Log

## Review Triage Log

### 2026-11-11 — Review pass
- verdicts: 18 findings — high 0, medium 3, low 12, false 3, maybe-false 0
- findings (ordered by layer completion):
  - `[low]` `[reject]` Verification gap: pending lifecycle has no retained regression test — true; the named AC explicitly permits only a natural pure-helper check and an ignored screen walk, and the repository restricts committed Playwright to scan-to-save/shop check. The ignored walk ran and passed; no extra committed browser/component test is authorized by story 11.10.
  - `[low]` `[reject]` Verification gap: async detail failure lacks a retained test — true; the ignored awaited-failure/retry walk passed. A new retained component/browser test conflicts with the story's explicit test limit.
  - `[medium]` `[patch]` Edge case: old close completion can finish a new pending open — reproduced by the added ignored close/new-activation case; fixed with activation-scoped completion and a private activation key retained through handoff. Same root cause as Blind Hunter's close-race finding.
  - `[low]` `[reject]` Edge case: narrowing during an already-pending desktop Link hides progress without a pending sheet — the boundary samples width at activation, as code confirms. Rotating/resizing during one short navigation is uncommon; subscribing and branching solely for that transient case adds lifecycle complexity. The real result still opens correctly at the new width.
  - `[medium]` `[patch]` Blind Hunter: cancelled tombstone hides a legitimate Forward entry — reproduced by open/close, reload preserving Forward, delayed retry/cancel and Forward: URL contains book while no sheet renders. fixed by clearing pending state on popstate while keeping cancelled-response protection until an explicit traversal or new activation.
  - `[medium]` `[patch]` Blind Hunter: previous close callback can finish a later activation — reproduced in the ignored walk; same activation/completion fix as the Edge Case Hunter row above.
  - `[false]` `[reject]` Blind Hunter: an abandoned/failed client navigation necessarily leaves an indefinite pending sheet — ordinary async detail failures are caught and remove it; Next falls back to full document navigation when soft navigation cannot complete (installed segment-cache/navigation implementation), and an explicit pending dismissal supersedes it. No reachable terminating client failure with the claimed permanent sheet was established; a still-unanswered request remains legitimately loading.
  - `[low]` `[reject]` Blind Hunter: desktop-to-phone resize during pending lacks feedback — same verified transient case as the edge layer; uncommon and requires another media subscription/branch, while resolved behavior remains correct.
  - `[low]` `[patch]` Blind Hunter: wrapped author hit areas overlap — 13px × 1.4 + 24px = 42.2px centres for 44px pseudo-element targets. fixed with the existing 28px spacing step in both pending and real headers.
  - `[low]` `[patch]` Blind Hunter: cancelling drops an originating fragment — raw destination omits location.hash. fixed by including location.hash in the raw cancellation destination without changing canonical path/query comparison.
  - `[low]` `[reject]` Blind Hunter: a failed Cover is retried at handoff — distinct pending/real Cover instances do reset local failed-src state. A broken image can briefly retry with the same fixed dimensions; preserving that state needs shared image-failure state beyond this small handoff. This is unlikely with valid stored covers and causes no layout jump.
  - `[low]` `[patch]` Blind Hunter: loading label names a generic div without status semantics — fixed by giving the existing translated pending block role=status. Completion leaves the normal named modal and focus controls intact; no new string is needed.
  - `[low]` `[reject]` Blind Hunter: fast-open/double-tap observations do not continuously inspect all frames — exact final DOM identity/header/snap and cached/back/forward checks passed. The new close-race check addresses the demonstrated defect; continuous frame instrumentation adds complexity without another demonstrated visual failure.
  - `[false]` `[reject]` Intent alignment: diff alone cannot prove automation invocation or isolation — execution evidence does: the exact renderer command ran, the rendered steps were followed, and git worktree list identifies the separate story branch. This is a limit of a diff, not missing execution.
  - `[false]` `[reject]` Intent alignment: in-review/in-progress does not demonstrate completed automation — those statuses describe this required review stage; completion/commit follow triage and final verification.
  - `[low]` `[reject]` Intent alignment: browser-level evidence is prose and an ignored walk outside the diff — expected by the explicit no-committed-browser-tests criterion; the actual walk ran successfully in parent verification (21/21 before review fixes).
  - `[low]` `[reject]` Intent alignment: walk does not prove tap-to-first-frame latency or every transient frame — observed pending content before held requests release, stable DOM/header geometry and snap provide the functional acceptance evidence; exact timing/frame measurement is not a stated criterion.
  - `[low]` `[reject]` Intent alignment: physical iOS/Safari unobserved — recorded under Residual risks. Story 11.10 calls for a phone walk, which ran at phone viewport in both themes; it does not require a specific physical browser/device.

## Design Notes

Prefer an always-mounted slot at each page's current detail location. It can place the resolved async server subtree directly in the same Sheet using a context that makes BookDetailFrame's phone branch content-only. This preserves the page's action providers and Sheet's overlay contexts without portals or storing server nodes in a global host. Async result handling must distinguish failure/missing/closed from an ordinary pending open.

## Verification

**Commands:**
- `npm run lint` -- no new lint errors; focus changed files if an unrelated baseline issue is identified.
- `npm run typecheck` -- no type errors.
- `npm run test:unit` -- existing suite passes; add no unnecessary tests.
- `npm run test:e2e -- tests/e2e/bookOpen.walk.spec.ts tests/e2e/scanToSave.spec.ts tests/e2e/shopCheck.spec.ts --workers=1` -- ignored acceptance walk and the two committed end-to-end flows pass on fixture test database.

Record actual pass/fail counts and screen observations under Auto Run Result, including any checks unavailable in this environment. Never claim an unrun check passed.


## Auto Run Result

**Implementation.** Small `BookOpen` boundaries inside the four existing hook-free row/tile Links seed a persistent phone slot from displayed metadata. `BookDetailSlot` owns one addressed Sheet across pending and real content inside the original page providers. Hosted phone Frames keep the pinned footer, action, toast, filter-chip and overlay contexts. Pending cancellation supersedes uncommitted navigation with a replace to its originating list; committed detail keeps the existing Back/Forward rules. Explicit awaited server detail/header result handling distinguishes ready, missing and failed reads. Phone headers share cover geometry, title type and muted meta authors; token-coloured square bars pulse under reduced motion. Existing English/Finnish Loading and overlay labels suffice; no new interface strings or tokens. The spine documents the address and primitive contracts.

**Checks.** Final `npm run lint`: exit 0, no errors, 68 pre-existing unused-argument warnings in migration files. Final `npm run typecheck`: exit 0. Final `npm run test:unit`: 106 files, 1,404 tests passed; no new unit/component/browser test is committed. No natural pure same-instance helper was introduced.

**Screen observations.** Ignored `tests/e2e/bookOpen.walk.spec.ts` uses the fixture e2e server on port 3100 and asserts `bookeh_test` before preparing temporary walk data. All twelve light/dark × rows/covers × s/m/l combinations passed immediate pending modal display, one Sheet DOM identity, preserved full snap point, identical cover/title/author bounding boxes at handoff, one history push and usable pinned Edit. Screenshots were inspected in both themes, including reduced motion: dimmed scrim, 120px header cover, matching title/authors, square semantic border bars, and normal action bar. Cancellation through X/Esc/scrim/downward drag preserved the originating address/history and allowed a clean later/double tap. Keyboard Enter, cached Back/Forward, direct/reload, author-chip landing, Returned mutation and nested Move picker, collection text search, Loans and both independently addressed entries of one Book passed. Wide Progress/panel/replace, native modified click/new tab, select labels and reduced-motion opacity pulse passed. Awaited async failure showed LoadFailed and retry; missing Books/entries retained their notices. A real 1.8s server render was cancelled without late reopen; a later image-cover open preserved Sheet identity and the displayed image.

**Walk execution notes.** Initial harness-only failures were corrected: Open fully label; native delayed requests instead of buffering Next development RSC debug streams; visible wishlist links because Next retains hidden route copies; Returned acts immediately while Move opens its picker; explicit target=_blank plus modified-click assertions for headless native-link checks. Fault/delay source injection is confined to the ignored walk and restored in `finally`; injecting before sign-in avoids development-HMR session invalidation. The focused fault/delay rerun passed 2/2 in 20.3s. The required combined command passed 21/21 (19 ignored walk cases plus scanToSave and shopCheck) in 1.3m after these harness corrections. A final code-inspection fix normalizes the comparison form of the originating address while preserving its raw close destination, so a direct search URL using %20 instead of + does not prematurely clear pending state; parent verification follows this small fix. Tooling uses a local clone-copy of the linked node_modules because Turbopack rejects links outside its root; typecheck needs native SWC cache access. Node 22.16.0 successfully ran the checks despite the package engine requesting >=22.23.3.

**Residual risks.** Browser observations use Chromium at 390×844 and 1300×900, with emulated reduced motion; no physical iOS/Safari device walk was run. Concurrent worktrees share row/tile, BookHeader, BookDetailPanel/Sheet, section layout/pages, styles and ARCHITECTURE-SPINE.md, so merges require checking those shared files. The main checkout’s uncommitted context and mockup remain untouched; the updated epic context was carried into this worktree. Accepted minor risks are a transient feedback gap when resizing from wide to phone during a pending request, and a failed image being retried at handoff. Neither changes resolved detail behavior.


**Reviewed files.**
- `BookOpen.tsx` — displayed-metadata boundary, pending lifecycle, activation identity, cancellation and traversal reset.
- `BookDetailSlot.tsx` — persistent addressed phone shell, loading status and matching placeholders/header.
- `detailHost.ts` — hosted-frame and pinned-footer contexts.
- `detailResult.tsx` — awaited detail-failure result.
- `BookDetailSheet.tsx` — distinguish pending cancellation from committed-address close.
- `BookDetailPanel.tsx` — content-only hosted phone branch while retaining the wide panel.
- `BookDetail.tsx` and `wishlists/[listId]/EntryDetail.tsx` — awaited ready/missing detail results and headers.
- `BookHeader.tsx` — matching phone typography and 28px wrapped-author spacing.
- `BookRow.tsx`, `CoverTile.tsx`, `loans/LoanRow.tsx`, `wishlists/[listId]/EntryRow.tsx` — seed their existing Links without hooks in row components.
- Section `layout.tsx` — pending-open provider; collection, Loans and wishlist pages — persistent result slots.
- `styles.css` — token-coloured placeholder opacity pulse that remains under reduced motion.
- Architecture spine — pending/address/primitive contracts; epic context — current story requirements; sprint status and this spec — completion and evidence.

**Review outcome.** All four layers completed. Eighteen findings: 3 medium (two share one close-race root cause), 12 low and 3 false. Five correction entries were applied: 2 medium and 3 low; 0 high, 0 deferred. Twelve findings were rejected with their individual reasons in Review Triage Log. Parent reproduced both lifecycle bugs before patching; the focused checks passed afterward. No unrelated changes or committed test additions were introduced.

**Follow-up recommendation.** `true`, because this first pass patched two medium entries. The specific unverified risk is native Safari touch timing during rapid pending close/reopen; Chromium covers the reproduced sequence, but a physical Safari walk remains useful before another story mounts this surface.


**Final parent verification after review fixes.** `npm run lint`: exit 0, 0 errors and the same 68 existing migration warnings. `npm run typecheck`: exit 0. `npm run test:unit`: 106 files / 1,404 tests passed. The required combined browser command passed 23/23 in 1.5 minutes: 21 ignored acceptance checks (including the two reproduced lifecycle regressions) plus scan-to-save and shop check. Fault/delay injection was restored, and no source injection, temporary seed or committed browser test remains. Source diff: 411 added / 93 removed lines, kept as one cohesive lifecycle story. Sprint and spec are done; committed on the isolated story branch without pushing or merging.
