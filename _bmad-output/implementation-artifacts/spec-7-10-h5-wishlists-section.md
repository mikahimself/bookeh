---
title: '7.10 [H5] Wishlists section'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '06b783051b3aed8f584a7bfc93f817a28dc04eba'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `/wishlists` is a stub that renders nothing, so the user can neither see their wishlists nor create one from the frontend (FR-39, UX-DR49).

**Approach:** A read service `listWishlists(ctx)` in `lib/wishlists` answers the viewer's lists with their open-entry counts. The page renders one tappable List row per list (name, "{n} books") linking to `/wishlists/{id}`, a "New list" Link that opens a Dialog with a name field calling `createWishlist()` through a new server action, the "No wishlists" empty state, and the shared Load failed state.

## Boundaries & Constraints

**Always:**
- `listWishlists(ctx: Context): Promise<WishlistLine[]>` in `src/lib/wishlists/wishlists.ts`, with `export type WishlistLine = { id: number; name: string; count: number }` declared there (see Design Notes). Both reads filter `owner = ctx.user.id` explicitly as well as through access (FR-48, as `ownsWishlist` does). Lists sorted by `name` in the database collation (as `listLocations`). `count` = the list's **open** entries (`closedAt` empty); closed entries never count (spine AD-18, "a wishlist's is its open entries"). Two reads (lists, then open entries with `select: { wishlist: true }`), counted in memory; no N+1.
- Server action `createWishlistAction(name: unknown)` in new `src/app/(frontend)/actions/wishlists.ts`, shaped like `createLocationAction`: non-string → `VALIDATION`; calls `createWishlist(ctx, name)`; answers `null`. No Undo, no toast (Settings precedent).
- Page `src/app/(frontend)/(sections)/wishlists/page.tsx`: server component, `requireUser()`, `listWishlists` in a `.catch` that logs and yields `null` → `<LoadFailed />` ("Couldn't load." + Try again Link). With lists: a `ul` of List rows, each the whole row a link to `/wishlists/{id}`; name as typed (never lowercased), count in muted `meta` via the existing `collection.count` plural ("5 books" / "5 kirjaa"); then the "New list" Link. With none: "No wishlists" (`text-heading-group`, as Nothing lent) and the "New list" Link under it. Page padding as the Loans page.
- `ListRow` (`components/ListRow.tsx`) gains an optional `href`: given it, the title and count are one `next/link` filling the row (`max-wide:min-h-tap`), and the row is tappable; without it, unchanged (Settings).
- "New list" client component (`wishlists/NewList.tsx`): an `ActionLink` opening the `Dialog` (all widths; EXPERIENCE.md lists New list under Dialog), title "New list", a form with one `TextField` "Name" (`maxLength={limits.name}`, autofocus, `autoComplete="off"`), confirm Button primary "Create" (`type="submit" form={formId}`), disabled while the name is blank or the call runs. On submit: `settleAction(createWishlistAction(name))`. ok → close the dialog and `router.refresh()` in a transition. `NAME_TAKEN` → `errors.NAME_TAKEN` under the field, dialog stays. `VALIDATION` with `fields.name === 'TOO_LONG'` → `errors.TOO_LONG`; other `VALIDATION` on `name` → `settings.nameRequired`; both under the field. Anything else → `useReportFailure()` and the dialog closes. Typing clears the field error. The field resets at each open.
- i18n `wishlists` namespace in `messages/en.json` and `messages/fi.json`: `empty` "No wishlists" / "Ei toivelistoja"; `newList` "New list" / "Uusi lista"; `create` "Create" / "Luo". Reuse `settings.name`, `settings.nameRequired`, `collection.count`, `errors.*`. Terse voice, sentence case.
- Spine in this commit: the `wishlists/` source-tree line gains `listWishlists`; a `// src/lib/wishlists` group in Shared shapes gains `type WishlistLine = Named & { count: number } // listWishlists(ctx): the viewer's lists by name, count = open entries`.
- Design tokens only; accessibility floor (dialog focus handled by `Dialog`; rows are real links).

**Never:**
- No `/wishlists/[listId]` page, Rename, Delete or entry rows (7.11+). No new writer of `wishlists` or `wishlist-entries`; the action calls `createWishlist()` only. No migration or collection change. No client-side REST. No navigation to the new list after create. No Playwright test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Lists with counts | A has "Me" (2 open, 1 closed entry), "Christmas" (no entries) | `listWishlists(A)` = `[Christmas 0, Me 2]`, name order | — |
| Other users | B and the admin have lists; A has lists | A's answer holds only A's; the admin's holds only the admin's | — |
| No lists | a user with none | `[]` | — |
| Name taken | `createWishlist` "  me " with "Me" existing | no write | `NAME_TAKEN` + `conflictId` (7.5's existing test) |

Screen-only behaviour (rows, dialog messages, empty and Load failed states) is in the Acceptance Criteria and the manual checks, not this matrix: CLAUDE.md keeps Playwright to scan-to-save and shop check.

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/wishlists/page.tsx` -- current stub (`requireUser`, `return null`); replace.
- `src/app/(frontend)/(sections)/loans/page.tsx` -- golden page: `.catch` → `logger().error` → `null` → `<LoadFailed />`; outer `div` padding `px-page-margin-phone wide:px-page-margin`; empty state `text-heading-group` block.
- `src/app/(frontend)/(sections)/LoadFailed.tsx` -- reuse as is.
- `src/app/(frontend)/components/ListRow.tsx` -- add `href`; Settings' `ManagedList` keeps using it without.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx` -- `NameField.fieldFailure` shows the error mapping to mirror (`TOO_LONG`, `nameRequired`, `NAME_TAKEN`).
- `src/app/(frontend)/(sections)/LendPicker.tsx:183,284` -- form inside a `Dialog` with `confirm` = submit Button `form={formId}`.
- `src/app/(frontend)/components/ui/Dialog.tsx` -- `open`, `onOpenChange`, `title`, `confirm`, `onClosed`.
- `src/app/(frontend)/components/request.ts` -- `settleAction`, `useReportFailure`.
- `src/app/(frontend)/components/Link.tsx` -- `ActionLink`, `linkClass`.
- `src/app/(frontend)/(sections)/settings/actions.ts:31` -- `createLocationAction` pattern (`runAction`, `requireUserOrThrow`, string check).
- `src/lib/wishlists/wishlists.ts` -- `createWishlist` (exists), `ownsWishlist` explicit owner filter pattern; add `listWishlists`.
- `src/lib/copies/locations.ts:73` -- `listLocations` read shape (`sort: 'name'`, `select`, `pagination: false`).
- `src/fields/limits.ts` -- `limits.name`.
- `tests/int/wishlistsService.int.spec.ts` -- 7.5's service suite; add `listWishlists` cases here.
- `messages/en.json`, `messages/fi.json` -- new `wishlists` namespace.
- `ARCHITECTURE-SPINE.md:~488,601` -- Shared shapes group and `wishlists/` source-tree line.

## Tasks & Acceptance

**Execution:**
- `src/lib/wishlists/wishlists.ts` -- add `WishlistLine` type and `listWishlists(ctx)` with doc comment (AD-18, FR-39, FR-48).
- `src/app/(frontend)/actions/wishlists.ts` -- new `'use server'` file with `createWishlistAction`.
- `src/app/(frontend)/components/ListRow.tsx` -- optional `href` making the row a link.
- `src/app/(frontend)/(sections)/wishlists/NewList.tsx` -- new client component: Link + Dialog form.
- `src/app/(frontend)/(sections)/wishlists/page.tsx` -- the section as above, doc comment naming EXPERIENCE.md Wishlists and FR-39.
- `messages/en.json`, `messages/fi.json` -- `wishlists` keys.
- `tests/int/wishlistsService.int.spec.ts` -- `listWishlists`: name order and open-entry counts (closed entry not counted, empty list 0); B's and the admin's lists never in A's answer and A's never in the admin's.
- `ARCHITECTURE-SPINE.md` -- as above.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-10-h5-wishlists-section: done` when done.

**Acceptance Criteria:**
- Given my wishlists, when `/wishlists` opens, then each is a List row with its name as typed and its open-entry count, in name order, and tapping a row goes to `/wishlists/{id}`.
- Given `/wishlists`, when I tap "New list", type a name and Create, then the list is created through `createWishlist()` and appears; a name in use keeps the dialog open with "That name is already in use." under the field.
- Given no wishlists, when `/wishlists` opens, then it shows "No wishlists" and "New list".
- Given the read fails, when `/wishlists` opens, then it shows "Couldn't load." with a Try again Link.
- Given another user's or the admin's lists, when `listWishlists` runs for me, then none of theirs appear (FR-48).
- Given the existing suites, when run, then they pass; Settings' List rows look and behave as before.

## Spec Change Log

## Review Triage Log

### 2026-10-28 — Review pass
- verdicts: 19 findings — high 0, medium 0, low 14, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: rows link to `/wishlists/{id}`, which 404s until 7.11 — real only between this commit and 7.11, whose first AC builds that route; a stub page would add a route 7.11 replaces. Recorded as a residual risk.
  - `[low]` `[patch]` Blind: `NewList` rendered in two branches, so creating the first list unmounts the dialog's focus-return trigger — `NewList` now renders once at a stable position after the empty/list content.
  - `[low]` `[reject]` Blind: the dialog can be cancelled while a create is pending, losing a late field error or creating a list after Cancel — a sub-second window; `LendPicker` behaves the same, and refusing a close fights `useCloseOnBack`'s history handling.
  - `[false]` `[reject]` Blind: borrowed keys `settings.name`, `settings.nameRequired`, `collection.count` — the spec reuses them deliberately: the same word in the same voice, so a rewording should follow everywhere; no bad outcome occurs.
  - `[false]` `[reject]` Blind: no dry remark on the empty state — EXPERIENCE.md says empty states *may* carry one; its States row for No wishlists names only "No wishlists" and "New list".
  - `[low]` `[reject]` Blind: `listWishlists` reads every open entry and runs two reads outside a transaction — one user's open entries are hundreds at most; a count skewed by a close between two reads self-corrects on the next render. Not worth a grouped query.
  - `[low]` `[patch]` Blind: `ListRow`'s link aligns with `items-center` while plain rows use `items-baseline` — the link now uses `items-baseline content-center`. (The half asking for a spine entry is false: the spine lists no components.)
  - `[low]` `[patch]` Blind: the dialog's error mapping is untested — same root as the verification-gap NewList finding; covered by the new unit test.
  - `[false]` `[reject]` Blind: no 7.10 spec in the diff — the spec exists at `_bmad-output/implementation-artifacts/spec-7-10-h5-wishlists-section.md`; it was left out of the review diff on purpose.
  - `[low]` `[reject]` Edge: NAME_TAKEN/VALIDATION result set on a closed dialog after Cancel — duplicate of the pending-Cancel row, same grounds.
  - `[low]` `[reject]` Edge: Cancel doesn't abort an in-flight create — duplicate of the pending-Cancel row.
  - `[low]` `[reject]` Edge: row link 404 — duplicate of the first Blind row.
  - `[low]` `[reject]` Edge: a concurrent same-name create surfaces the unique index's `ValidationError` as INTERNAL — documented behaviour of `createWishlist` (7.5); needs one user creating the same name twice at once.
  - `[false]` `[reject]` Edge: `collection.count` coupling — duplicate of the borrowed-keys row.
  - `[low]` `[reject]` Edge (claim): "tapping goes to `/wishlists/{id}`" passes only as navigation — duplicate of the 404 row.
  - `[low]` `[patch]` Verification gap: no test renders the page's rows, empty state or Load failed — added `tests/unit/wishlistsPage.unit.spec.ts` on the `loansPage.unit.spec.ts` pattern (named ACs, CLAUDE.md Tests).
  - `[low]` `[patch]` Verification gap: NewList's NAME_TAKEN-under-the-field and success paths untested — cases added to the same unit spec.
  - `[false]` `[reject]` Intent: R3 divergence (the tapped row's page is missing) — not a separate defect; duplicate of the 404 row, and 7.11 owns the route.
  - `[low]` `[patch]` Intent: the ACs are checked only at the service level — same root as the verification-gap rows; fixed by the unit spec.

## Design Notes

**Local row type, not `Counted`.** `Counted<T>` lives in `lib/shelf`; `wishlists` may not import `shelf` (spine import rules), so `WishlistLine` is declared in `lib/wishlists` with the same shape.

**Create stays on the list of lists.** The AC asks only that New list asks for a name; staying put shows the new row and its 0 count, and `/wishlists/[listId]` does not exist until 7.11.

**"Couldn't load. Try again."** The existing `LoadFailed` renders exactly that ("Couldn't load." + the Try again Link), shared with Collection and Loans.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:reset && npm run test:int` -- expected: all pass, including the new `listWishlists` cases.

**Manual checks:**
- Run the app, open `/wishlists`: empty state, create a list, duplicate name error under the field, row links to `/wishlists/{id}`.

## Auto Run Result

**Summary.** `/wishlists` now lists the viewer's wishlists (FR-39, UX-DR49). `listWishlists(ctx)` in `lib/wishlists` answers `WishlistLine[]`: the lists by name in the database collation, each with its open entries counted (closed ones never count). Both reads filter on `owner` explicitly as well as through access, so the admin sees only their own lists (FR-48). The page shows one tappable List row per list, with the name as typed, "{n} books", and a link to `/wishlists/{id}`. "New list" sits under the rows, or under "No wishlists" when there are none. It opens a Dialog with a Name field that calls `createWishlist()` through `createWishlistAction`. A taken, blank or too-long name keeps the dialog open with its message under the field. Success closes the dialog and refreshes the list. A failed read shows the shared Load failed ("Couldn't load." with Try again).

**Files changed.**
- `src/lib/wishlists/wishlists.ts` -- `WishlistLine`, `listWishlists`.
- `src/app/(frontend)/actions/wishlists.ts` -- new: `createWishlistAction`.
- `src/app/(frontend)/components/ListRow.tsx` -- optional `href` makes the row one link; Settings rows unchanged.
- `src/app/(frontend)/(sections)/wishlists/NewList.tsx` -- new: the New list Link and Dialog.
- `src/app/(frontend)/(sections)/wishlists/page.tsx` -- the section, replacing the stub.
- `messages/en.json`, `messages/fi.json` -- `wishlists.empty`, `newList`, `create`.
- `tests/int/wishlistsService.int.spec.ts` -- two `listWishlists` cases: order and open-entry counts; own lists only, admin included.
- `tests/unit/wishlistsPage.unit.spec.ts` -- new, 5 cases: rows, empty state, Load failed, NAME_TAKEN under the field, create success.
- `ARCHITECTURE-SPINE.md` -- `// src/lib/wishlists` shared shape `WishlistLine`; `listWishlists` on the `wishlists/` source-tree line.
- `epic-7-context.md` -- recompiled at the start of the run to include 7.9's spine change.
- `sprint-status.yaml` -- 7.10 done.

**Review.** One pass, 19 findings (low 14, false 5).
- Patched (5 low entries):
  - `NewList` is now rendered once at a stable position, so focus returns after the first create.
  - The `ListRow` link uses baseline alignment, like Settings rows.
  - The unit spec covers the screen's acceptance criteria: rows, empty state, Load failed and the dialog's NAME_TAKEN and success paths.
- Rejected, with reasons in the triage log:
  - The row link 404s until 7.11 builds `/wishlists/[listId]`.
  - The dialog can be cancelled while a create is still pending; `LendPicker` behaves the same.
  - Shared strings are reused on purpose.
  - The empty state has no dry remark; EXPERIENCE.md makes one optional.
  - Two reads with in-memory counts.
  - A concurrent same-name create surfaces as INTERNAL (7.5's documented behaviour).
  - The spec was left out of the review diff on purpose.
- Nothing deferred.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 5.

**Verification.** After the patches:
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (56 existing warnings).
- `npm run test:unit`: 974 passed (68 files).
- `npm run test:reset && npm run test:int`: 661 passed (78 files). During the implementation run, `shelfTiming`'s text search once took 2.9 s against its 1 s limit under load. It passed alone and passed in this full run, and the shelf code is untouched.
- Matrix audit: rows 1–3 are covered by the new `listWishlists` int cases; row 4 by 7.5's existing NAME_TAKEN test, plus the new unit case for the dialog.
- The manual check in a running app was not done: no browser run of `/wishlists`.

**Residual risks.**
- Tapping a row leads to a 404 until 7.11 adds `/wishlists/[listId]`; that route is 7.11's first acceptance criterion.
- The New list dialog can be closed while a create is pending. The list may then appear without its dialog, or a field error may be lost.
- The implementation subagent committed the code early (`13e4e47`) before review. The review patches, tests and finished spec land in a follow-up commit.
- Built in a cloud session against a locally created Postgres 16 cluster (ICU fi-FI), not the Docker Compose database. Not built beside other stories, so no shared files.
