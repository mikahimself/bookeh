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
