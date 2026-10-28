---
title: '7.11 [H11] One wishlist'
type: 'feature'
created: '2026-10-28'
status: 'done'
baseline_revision: '08fefe745cb73c52f9afcdb3a7116071ffd8d766'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-7-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** Rows in `/wishlists` link to `/wishlists/{id}`, which does not exist, so the user cannot open a list, see its entries and who they are for, or rename or delete it (FR-38, FR-39, UX-DR49).

**Approach:** A read service `getWishlist(ctx, id)` in `lib/wishlists` returns one of the viewer's lists with its open entries. A new page `/wishlists/[listId]` shows a Back link, the list's name as its heading, then "{n} books · Rename · Delete", then one entry row per open entry. Rename edits the heading in place through Settings' `NameField`. Delete is confirmed by a Dialog and calls `deleteWishlist()`. Both go through new server actions.

## Boundaries & Constraints

**Always:**
- `getWishlist(ctx, id: number): Promise<WishlistView | null>` in `src/lib/wishlists/wishlists.ts`, declaring `export type ListEntry = { entryId: number; bookId: number; forPerson: Named | null }` and `export type WishlistView = Named & { entries: ListEntry[] }` (with a local `type Named = { id: number; name: string }`, as `entries.ts`). It returns `null` when `id` is not a row id or not the viewer's list. Every read filters `owner = ctx.user.id` explicitly as well as through access, so the admin is held to their own (FR-48, the `ownsWishlist` pattern). Entries are **open only** (`closedAt` empty), sorted `['-createdAt', '-id']` (newest first; not on any Book field, spine AD-7). The recipient names come from one `people` read of the distinct ids. A recipient missing from that read gives `forPerson: null`, as `getHoldings` does. Three reads at most, no N+1, no transaction.
- Server actions in `src/app/(frontend)/actions/wishlists.ts`: `renameWishlistAction(id: unknown, name: unknown)` and `deleteWishlistAction(id: unknown)`. A non-row id (`isRowId`) or non-string name fails with `VALIDATION`. They call `renameWishlist` / `deleteWishlist` and answer `null`. No Undo, no toast (the Settings precedent).
- Page `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx`, a server component:
  - `requireUser()`. `params` is a Promise in this Next version. A `listId` that is not a row id, or `getWishlist` answering `null`, goes to `redirect('/wishlists')`.
  - Books come from `getEffectiveBooks(ctx, distinct bookIds)`; an entry whose Book is missing is left out (Loans precedent).
  - A thrown read, of the list or of the Books, is logged and shows the Back link and `<LoadFailed />`.
  - Otherwise, top to bottom:
    - `BackLink` to `/wishlists` labelled `sections.wishlists`.
    - An `h1` with the name as typed: the section-heading type (`text-heading-section-phone wide:text-heading-section`), **without** `ui-case`.
    - A muted `meta` line: `collection.count` of the rows shown, then the Links Rename and Delete (destructive).
    - The rows, or "Nothing on this list." when there are none.
  - Padding matches the Loans page.
- `SectionNav`: on a path below a section (`pathname !== current.href`) it renders no headings, no nav and no live region, only the empty `flex-1` slot, so the page's own `h1` is the only one and the wide Scan book stays right. Every section root renders exactly as before.
- Entry row `wishlists/[listId]/EntryRow.tsx`, server-rendered, an `li`, laid out like `LoanRow`: cover (`w-cover-row`), title in `title`, authors joined by ", " in muted `meta` when there are any. At the end, outside the text column, "For {person}" (`wishlists.forPerson`) in muted `meta`, `shrink-0`, only when `forPerson` is set. Not a link: 7.12 makes rows open the entry.
- Heading client component `wishlists/[listId]/ListHeading.tsx` (`id`, `name`, `count` props) holds the heading, the meta line and the dialog:
  - **Rename** swaps the `h1` for `NameField` (initial = name, save = `renameWishlistAction(id, ·)`, no `mergeInto`). The heading returns on done. `NAME_TAKEN` shows "That name is already in use." under the field.
  - **Delete** opens a `Dialog` titled `wishlists.deleteTitle`, with `wishlists.deleteBody` (count = open entries shown) and a destructive confirm Button `settings.delete`. Confirm closes it and calls the action. Success or `NOT_FOUND` → `router.replace('/wishlists')`. Any failure is reported with `useReportFailure()`.
- `ManagedList.tsx`: export `NameField`. It no longer renders its own `li`; the two Settings call sites wrap it in `<li className="py-1">`, so Settings is unchanged. Its `NOT_FOUND` refresh then lands on the redirect.
- i18n, in `messages/en.json` and `fi.json` under `wishlists`:
  - `emptyList`: "Nothing on this list." / "Tällä listalla ei ole mitään."
  - `forPerson`: "For {person}" / "Kenelle: {person}"
  - `deleteTitle`: "Delete <typed>{name}</typed>?" / "Poistetaanko <typed>{name}</typed>?" (rendered with `typed`)
  - `deleteBody`: "{count, plural, =0 {The list goes.} one {The list and its # book go.} other {The list and its # books go.}}" / "{count, plural, =0 {Lista poistuu.} one {Lista ja sen # kirja poistuvat.} other {Lista ja sen # kirjaa poistuvat.}}"
  - Reuse `sections.wishlists`, `settings.rename`, `settings.delete`, `collection.count`, `errors.*`.
- Spine, same commit:
  - The `// src/lib/wishlists` Shared shapes group gains `type ListEntry = { entryId: number; bookId: number; forPerson: Named | null }` and `type WishlistView = Named & { entries: ListEntry[] } // getWishlist(ctx, id): one of the viewer's lists with its open entries, newest first; null when not theirs`.
  - The `wishlists/` source-tree line gains `getWishlist`.
- Design tokens only. The accessibility floor: one `h1`; the Back link and Links are real controls; the Dialog holds and returns focus.

**Never:**
- No `?entry=` handling, no tappable rows, no Bought, Ordered or Remove (7.12, 7.13).
- No new writer of `wishlists` or `wishlist-entries`.
- No migration or collection change.
- No client-side REST.
- No merge offer on rename: wishlists have no merge.
- No toast or Undo on Rename or Delete.
- No Playwright test.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open entries | A's "Christmas": entry 1 for Äiti, entry 2 for A, entry 3 closed | `getWishlist(A, id)` = name "Christmas", entries `[2 (null), 1 (Äiti)]` newest first; 3 absent | — |
| Same Book twice | two open entries of one Book on the list | both listed, each with its own `entryId` | — |
| Foreign list | B's list id; or A's list for the admin | `null` | page redirects to `/wishlists` |
| Not a row id | `id` = 0, -1, 1.5 | `null`, no read | — |
| Rename taken | rename onto another list's name | no write | `NAME_TAKEN` under the field (7.5 tests the service) |

</intent-contract>

## Code Map

- `src/lib/wishlists/wishlists.ts` -- add `getWishlist` after `listWishlists`; reuse `isRowId`, `idOf`, the explicit-owner filter pattern (`ownsWishlist`:49, `listWishlists`:105).
- `src/lib/books/holdings.ts:95-125` -- read shape for open entries with `forPerson` (select, `closedAt: { exists: false }`, `namesOf`); mirror, do not import (`wishlists` may not import `books`).
- `src/app/(frontend)/actions/wishlists.ts` -- add the two actions beside `createWishlistAction`; id check as `settings/actions.ts:11,40` (`isRowId`, `runAction`, `requireUserOrThrow`).
- `src/app/(frontend)/(sections)/loans/page.tsx` -- golden page: `.catch` → `logger().error` → `null` → `LoadFailed`; `getEffectiveBooks` hydration with missing Books dropped (30-41); padding `px-page-margin-phone wide:px-page-margin`.
- `src/app/(frontend)/(sections)/loans/LoanRow.tsx` -- row layout and Cover usage to copy for `EntryRow`.
- `src/app/(frontend)/(sections)/wishlists/page.tsx` -- rows already link to `/wishlists/{id}`; unchanged.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx:74-172` -- `NameField`, which moves its `li` to the callers (260, 263) and gets exported; `typed` (32) for rich titles; delete Dialog (340-361) to mirror.
- `src/app/(frontend)/components/SectionNav.tsx` -- add the nested-path branch; `sections.ts` `sectionOf`.
- `src/app/(frontend)/(sections)/layout.tsx` -- header around `SectionNav` (read-only context: the `flex-1` slot keeps the wide Scan book right).
- `src/app/(frontend)/components/Link.tsx` -- `BackLink`, `ActionLink` (`destructive`).
- `src/app/(frontend)/components/ui/Dialog.tsx`, `components/Button.tsx` (`variant="destructive"`), `components/request.ts` (`settleAction`, `useReportFailure`).
- `src/app/(frontend)/(sections)/LoadFailed.tsx` -- reuse.
- `tests/int/wishlistsService.int.spec.ts` -- add `getWishlist` cases.
- `tests/unit/wishlistsPage.unit.spec.ts` -- mocking pattern (next-intl, navigation, context, errors) for the new page spec.
- `messages/en.json:331`, `messages/fi.json` -- `wishlists` namespace.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:518-519,604` -- Shared shapes and source tree.

## Tasks & Acceptance

**Execution:**
- `src/lib/wishlists/wishlists.ts` -- `ListEntry`, `WishlistView`, `getWishlist` with a doc comment (AD-7, AD-18, FR-38, FR-48).
- `src/app/(frontend)/actions/wishlists.ts` -- `renameWishlistAction`, `deleteWishlistAction`; widen the header comment.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx` -- export `NameField`, lift its `li` into the two callers.
- `src/app/(frontend)/components/SectionNav.tsx` -- no headings below a section root; doc comment says why.
- `src/app/(frontend)/(sections)/wishlists/[listId]/EntryRow.tsx` -- new.
- `src/app/(frontend)/(sections)/wishlists/[listId]/ListHeading.tsx` -- new client component: heading, Rename, Delete dialog.
- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx` -- new page, doc comment naming EXPERIENCE.md Wishlists, States, FR-38, FR-39.
- `messages/en.json`, `messages/fi.json` -- new keys.
- `tests/int/wishlistsService.int.spec.ts` -- `getWishlist`: open entries only, newest first, recipient names, same Book twice; B's list and A's list for the admin answer `null`.
- `tests/unit/wishlistPage.unit.spec.ts` -- new: heading as typed with Back link; rows with "For {person}" only when set; "Nothing on this list."; Load failed; Delete confirms, calls the action, and replaces to `/wishlists`.
- `ARCHITECTURE-SPINE.md` -- as above.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `7-11-h11-one-wishlist: done` when done.

**Acceptance Criteria:**
- Given my list, when `/wishlists/{id}` opens, then a Back link "Wishlists" returns to `/wishlists`, the `h1` is the list's name as typed (not lowercased) with no section headings above it, and "{n} books", Rename and Delete (destructive) sit under it.
- Given open and closed entries, when the list opens, then each open entry is a row with cover, title, author and, when it has a recipient, "For {person}" at the end; closed entries are not listed.
- Given Rename, when I type a new name and press Enter or leave the field, then the list is renamed and the heading shows it; a name in use keeps the field open with "That name is already in use.".
- Given Delete, when I confirm the dialog saying its entries go too, then the list and its entries are deleted through `deleteWishlist()` and I am on `/wishlists`.
- Given a list with no open entries, when it opens, then it shows "Nothing on this list.".
- Given the read fails, when the list opens, then it shows "Couldn't load." with a Try again Link.
- Given another user's list id, or a list id that is gone, when I open it, then I land on `/wishlists`, and nothing of theirs is shown (FR-48).
- Given the existing suites, when run, then they pass; Settings' rename fields and every section root's headings row are unchanged.

## Spec Change Log

## Review Triage Log

## Design Notes

**No section headings on a nested page.** The mock-up (`key-wishlists.html`, "One list opened") replaces the headings row with the Back link and the list's name as the screen heading. The page lives under `(sections)` so the pinned Scan book stays, as the mock-up shows. `SectionNav` therefore steps aside on paths below a section root. Swiping still moves to the neighbouring section, which needs no change.

**Redirect, not 404.** A missing or foreign list is indistinguishable from a deleted one (FR-48). `redirect('/wishlists')` sends both to the lists. It also makes `NameField`'s existing `NOT_FOUND` → `router.refresh()` land somewhere sensible. The app has no frontend 404 page.

**Newest first.** The spine forbids sorting a non-copy list on Book fields, so the order comes from the entries. Newest first puts a just-added wish (7.14) at the top.

**`NameField` reuse.** Lifting the `li` out is the smallest change that lets the heading use the same Enter, blur and Esc rules and error mapping. Wishlists have no merge, so `mergeInto` stays unset.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including the new page spec.
- `npm run test:reset && npm run test:int` -- expected: all pass, including the `getWishlist` cases.

**Manual checks:**
- Open a list from `/wishlists`: Back link, heading as typed, rows with For, Rename in place, Delete back to `/wishlists`; the section roots still show their headings row.
