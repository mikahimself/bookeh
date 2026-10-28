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

### 2026-10-28 — Review pass
- verdicts: 24 findings — high 0, medium 0, low 21, false 3, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: the delete dialog counts only the open entries shown, while `deleteWishlist()` also deletes closed ones; a list with only closed entries says "The list goes." — `deleteBody` is now count-free: "The list and its entries go." / "Lista ja sen kirjat poistuvat.".
  - `[low]` `[reject]` Blind: the page's "{n} books" can differ from the section's count when a Book is unreadable — an entry's Book is readable by the collection's `readableRelation`, so a gap needs a shared Book going away under an open entry; not everyday use, and the fix adds a second count.
  - `[low]` `[reject]` Blind: no `h1` while the rename field is open — transient during an edit the user started; keeping a hidden heading adds a branch for a moment nobody navigates by heading.
  - `[low]` `[patch]` Blind: Delete is enabled while renaming, so a tap blurs the field (sending the rename) and opens the dialog, racing both calls — Delete is now `disabled={pending || renaming}`.
  - `[low]` `[patch]` Blind: AC 1 and AC 8 (no section headings on the list, roots unchanged) have no test — same root as the verification-gap SectionNav row; covered by the new `sectionNav.unit.spec.ts`.
  - `[low]` `[patch]` Blind: the heading test asserts `className.includes('ui-case')`, which CLAUDE.md's Tests convention forbids — the assertion now checks the single h1's text only.
  - `[low]` `[reject]` Blind: `pathname !== current.href` is fragile for future nested routes, and the live region is absent on nested paths — no other nested path exists under `(sections)`; the doc comment states the rule for the next one, and a live region mounting with its text is not announced.
  - `[low]` `[reject]` Blind: `getWishlist` reads every open entry with no page — one user's list is tens to hundreds of entries; Loans reads the same way; paging adds a cursor no story asks for.
  - `[low]` `[patch]` Blind: a long "For {person}" is `shrink-0` and can squeeze the title on the phone — it now truncates within half the row.
  - `[low]` `[reject]` Blind: `NameField` and `typed` are imported from a Settings module — the spec chose this reuse; moving files grows the diff with no named caller that breaks.
  - `[low]` `[patch]` Blind: garbled doc-comment sentence in `page.tsx` — reworded.
  - `[low]` `[patch]` Edge: Delete during an open rename races — duplicate of the Delete-while-renaming row.
  - `[low]` `[patch]` Edge: the delete count understates what goes — duplicate of the delete-count row.
  - `[low]` `[reject]` Edge: `NOT_FOUND` on Delete is reported although the page then leaves — the spec reports every failure; "Not found." tells the user why the list vanished.
  - `[false]` `[reject]` Edge: a swipe on `/wishlists/{id}` still changes section — deliberate (Design Notes); it matches swiping with a Book open on Loans.
  - `[low]` `[patch]` Verification gap: `SectionNav`'s nested-path branch is rendered by no test — added `tests/unit/sectionNav.unit.spec.ts` (nested path: no heading, no nav; root: h1 and nav).
  - `[low]` `[patch]` Verification gap: Rename on one wishlist is not exercised — added a Rename case (action called with the id and name, `NAME_TAKEN` under the field, success restores the h1).
  - `[low]` `[patch]` Intent: the "no section headings"/"roots unchanged" ACs are not checked on their surface — duplicate of the SectionNav gap row.
  - `[low]` `[patch]` Intent: rename in place is not exercised — duplicate of the Rename gap row.
  - `[low]` `[patch]` Intent: the dialog's stated count is not what is deleted — duplicate of the delete-count row.
  - `[low]` `[reject]` Intent: a failure of the Book read is not exercised — both reads sit in the one `load().catch` the list-read test covers; a second case restates the same branch.
  - `[false]` `[reject]` Intent: Settings is checked only by existing suites — the `li className="py-1"` wrapper moved to the callers unchanged, and the Settings suites pass.
  - `[low]` `[reject]` Intent: the `SectionNav` rule is app-wide — duplicate of the fragility row.
  - `[false]` `[reject]` Intent: `sprint-status.yaml` says done while the spec says in-review — the spec is set to done at finalize, in the same commit.

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

## Auto Run Result

**Summary.** `/wishlists/[listId]` now opens one of the viewer's wishlists (FR-38, FR-39, UX-DR49):
- **Service.** `getWishlist(ctx, id)` in `lib/wishlists` returns the list with its open entries, newest first, each with its recipient's name. It returns `null` for a bad id or a list that isn't the viewer's (the admin included, FR-48). Closed entries are never listed.
- **Page.**
  - Top to bottom: a Back link "Wishlists", the list's name as typed as the `h1`, then "{n} books · Rename · Delete".
  - One row per entry: cover, title, authors and, when the entry has a recipient, "For {person}" at the end.
  - Empty list: "Nothing on this list.". Failed read: the Back link and "Couldn't load." with Try again.
  - A bad id or a list that isn't the viewer's redirects to `/wishlists`.
- **Rename and Delete.**
  - Rename swaps the heading for Settings' `NameField`, now exported. Enter or leaving the field saves; a taken name stays open with its message.
  - Delete is confirmed by a Dialog ("The list and its entries go."), then goes to `/wishlists`.
  - Both use the new `renameWishlistAction` and `deleteWishlistAction`.
- **Headings row.** On a path below a section root, `SectionNav` leaves out the section headings, so the list's name is the only `h1`.

**Files changed.**
- `src/lib/wishlists/wishlists.ts` -- `ListEntry`, `WishlistView`, `getWishlist`.
- `src/app/(frontend)/actions/wishlists.ts` -- `renameWishlistAction`, `deleteWishlistAction`; shared input checks.
- `src/app/(frontend)/(sections)/settings/ManagedList.tsx` -- `NameField` exported, its `li` lifted to the two callers.
- `src/app/(frontend)/components/SectionNav.tsx` -- no headings below a section root.
- `src/app/(frontend)/(sections)/wishlists/[listId]/page.tsx`, `ListHeading.tsx`, `EntryRow.tsx` -- new: the page, its heading with Rename and Delete, and the entry row.
- `messages/en.json`, `messages/fi.json` -- `wishlists.emptyList`, `forPerson`, `deleteTitle`, `deleteBody`.
- `tests/int/wishlistsService.int.spec.ts` -- two `getWishlist` cases.
- `tests/unit/wishlistPage.unit.spec.ts` -- new, 6 cases: heading and rows, empty list, Load failed, redirect, Rename, Delete.
- `tests/unit/sectionNav.unit.spec.ts` -- new: headings at a section root, none on a nested path.
- `ARCHITECTURE-SPINE.md` -- `ListEntry`, `WishlistView` shared shapes; `getWishlist` on the `wishlists/` source-tree line.
- `sprint-status.yaml` -- 7.11 done.

**Review.** One pass, 24 findings (low 21, false 3).
- Patched (7 low entries):
  - Delete is disabled while renaming.
  - The delete dialog no longer gives a count of open entries; it says "The list and its entries go.", since closed entries go too. This departs from the plural `deleteBody` wording in the intent contract, which the review may not edit.
  - "For {person}" truncates.
  - A doc comment was reworded.
  - The class-name assertion was dropped.
  - New tests cover Rename and `SectionNav`.
- Rejected, with reasons in the triage log:
  - The page and section counts can differ for unreadable Books.
  - The heading is missing while renaming.
  - `SectionNav`'s rule is not future-proof.
  - The list is not paged.
  - `NameField` lives in the Settings module.
  - `NOT_FOUND` is reported on Delete.
  - The swipe on a nested page is deliberate.
  - The Book-read failure has no case of its own.
  - Settings is covered by the existing suites.
  - The sprint-status order.
- Nothing deferred.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 7.

**Verification.** After the patches:
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (56 existing warnings).
- `npm run test:unit`: 982 passed (70 files).
- `npm run test:reset && npm run test:int`: 663 passed (78 files). Before the review, `shelfTiming`'s text search once went over its limit under load; it passed alone and passed in this run.
- Matrix audit: rows 1–4 are covered by the `getWishlist` int cases and the page's redirect case; row 5 by 7.5's existing `NAME_TAKEN` test plus the new Rename unit case.
- The manual check in a running app was not done: no browser run of `/wishlists/{id}`.

**Residual risks.**
- `SectionNav` hides the headings row on any path below a section root, so a future nested page under `(sections)` must bring its own `h1`.
- While the rename field is open, the page has no `h1`.
- The implementation subagent committed the code early (`ccb312e`) before review. The review patches, tests and finished spec land in a follow-up commit.
- Built in a cloud session against a locally created Postgres 16 cluster (ICU fi-FI), not the Docker Compose database. Not built beside other stories, so no shared files.
