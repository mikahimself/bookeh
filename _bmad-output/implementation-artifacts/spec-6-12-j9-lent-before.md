---
title: '6.12 [J9] Lent before'
type: 'feature'
created: '2026-10-26'
baseline_revision: '878d2e739f5447c5cb204d6884e9c16107a3b7a4'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Book detail shows only the open loan on a copy line. A Book's past loans are visible only in the `/loans` returned group, mixed with every other Book, so "who has read my copy?" has no answer on the Book itself (FR-36, UX-DR43, epic story 6.12).

**Approach:** `returnedLoans(ctx)` gains an optional Book id that narrows it to the closed loans of the viewer's copies of that Book, in the same order. Book detail renders a "Lent before" group after Your copies, newest first, each line "{person} · {from} to {to}" (the `/loans` returned-row wording). With no closed loans there is no group.

## Boundaries & Constraints

**Always:**
- `returnedLoans(ctx: Context, book?: number): Promise<ReturnedLoan[]>` in `src/lib/loans/loans.ts`. Without `book`, its query, output and order are unchanged. With `book`: first read the viewer's copies of that Book (`gateway.find` on `copies`, `where` owner equals `ctx.user.id` and `book` equals `book`, `select: { id: true }` or `{}`, `depth: 0`, `pagination: false`); no copies → return `[]` without reading loans; otherwise add `{ copy: { in: copyIds } }` to the loans `where`. Order stays `-returnedOn, -lentOn, -id`; the owner filter and the `withCopyAndPerson` hydration stay. Update the doc comment.
- Book detail (`BookDetail.tsx`) reads `returnedLoans(ctx, bookId)` after the Book is known to be held. A failed read is logged (`logger().error({ err }, 'The loan history failed to load')`) and treated as no history, the same way a failed `lendingPeople` read is handled there. Only this group goes missing; Book detail still renders.
- The group sits right after the Your copies `<section>` and before Genres (UX-DR43 order). Markup follows the Genres group: `<section className="flex flex-col gap-2">` with `<h3 className="text-heading-group text-text-muted ui-case">{t('detail.lentBefore')}</h3>` and a `<ul className="flex flex-col gap-1">` with one `<li className="text-body text-text">` per loan, keyed by `loanId`, showing `t('loans.lentBetween', { person, from, to })`. Each date is `format.dateTime(new Date(`${date}T12:00:00Z`), { dateStyle: 'medium' })`, as the lent line above it does.
- Rendered only when the list is non-empty: no heading and no empty state otherwise. Lines are plain text, with no Links and no actions.
- New strings, namespace `detail`: `lentBefore`: en "Lent before", fi "Lainassa aiemmin". `loans.lentBetween` is reused, not copied.
- A Returned or Undo made in Book detail already refreshes the server render (`afterAction`; `ReadAndRating`'s `onUndone`), so the group updates with no new client code.
- ARCHITECTURE-SPINE.md: the `ReturnedLoan` line in Shared shapes names `returnedLoans(ctx, book?)` and says that `book` narrows it to the viewer's copies of that Book (Book detail's Lent before).
- Tokens only. The borrower's name is never lowercased; only the heading uses `ui-case`.

**Never:**
- No change to `/loans`, `openLoans`, `ReturnedLoan`'s shape, `getHoldings` / `CopyLine`, or the lend and return actions.
- No new `lib/loans` function, no schema change, no client fetch, no limit on the list.
- No per-copy grouping or location in the line: the line is "{person} · {from} to {to}" only.
- No People in Settings (6.13).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| History | Book 7, two copies. Closed loans: Antti 3 Mar–20 Apr 2026 (copy A), Leena 14 Jan–2 Feb 2026 (copy B). Another Book has a closed loan | Group "Lent before": "Antti · Mar 3, 2026 to Apr 20, 2026", then "Leena · Jan 14, 2026 to Feb 2, 2026" | — |
| None | Book with no closed loans (an open one at most) | No "Lent before" heading | — |
| Open and closed | Copy lent to Leena now, earlier lent to Antti and returned | Copy line shows "Lent to Leena since …"; Lent before shows Antti's loan only | — |
| Ownership | Another user and the admin hold copies of the same shared Book with closed loans | `returnedLoans(ctx, bookId)` returns only the viewer's | — |
| No copies | `returnedLoans(ctx, bookId)` for a Book the viewer holds no copy of | `[]` | — |
| Read fails | `returnedLoans(ctx, bookId)` throws | Book detail renders without the group; error logged | Logged, not shown |

</intent-contract>

## Code Map

- `src/lib/loans/loans.ts:237-275` -- `ReturnedLoan`, `returnedLoans`: add the optional `book` and its copies pre-read. `withCopyAndPerson` (`:277-310`) stays as it is. `idOf` comes from `@/lib/payload/ref`.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- `:69-80` holds the reads (the `lendingPeople` catch at `:75-78` is the pattern for the failed read); `:127-187` is Your copies, `:188-202` the Genres group to mirror; `:174-179` is the date formatting to reuse. Add a sentence on Lent before to the header doc comment (`:30-57`).
- `src/app/(frontend)/(sections)/loans/page.tsx:160-175` -- the returned group's `lentBetween` use; read only, for consistent wording.
- `messages/en.json:258`, `messages/fi.json:258` -- the `detail` namespace; add `lentBefore`. `tests/unit/messages.unit.spec.ts` checks key parity.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:519` -- the `ReturnedLoan` line.
- `tests/int/loansService.int.spec.ts:363-421` -- the `returnedLoans` test and its helpers (`lender`, `copyAs`, `personAs`, `createUser`, `contextFor`, `lendCopy`, `returnLoan`). Check how `copyAs` picks the Book, so the new test can put two of the viewer's copies on one Book and one on another.
- `tests/unit/loansPage.unit.spec.ts` -- already renders Book detail at `?book=7` (`:302-318`) with `returnedLoans` mocked (`:26`, `:77`). Page-level calls are `returnedLoans(ctx)`; Book detail's is `returnedLoans(ctx, 7)`. The mock implementation must tell them apart by the second argument, and existing tests must still pass. Widen the `vi.fn` type to `(ctx: unknown, book?: number)`.
- `tests/unit/collectionPage.unit.spec.ts:78-103` -- renders Book detail but does not mock `@/lib/loans/loans`. Add `vi.mock('@/lib/loans/loans', () => ({ returnedLoans: async () => [] }))`, so the real module (gateway, Payload) is never imported.

## Tasks & Acceptance

**Execution:**
- `src/lib/loans/loans.ts` -- the optional `book` on `returnedLoans`, with the doc comment updated -- the per-Book read Lent before needs, kept in the one reader.
- `src/app/(frontend)/(sections)/BookDetail.tsx` -- the read, the group and the doc comment -- the Lent before group.
- `messages/en.json`, `messages/fi.json` -- `detail.lentBefore`.
- `ARCHITECTURE-SPINE.md` -- the `ReturnedLoan` line -- spine contract change.
- `tests/int/loansService.int.spec.ts` -- one test: `returnedLoans(ctx, book)` returns only the viewer's closed loans on copies of that Book, newest return first. It leaves out an open loan, a closed loan on the viewer's copy of another Book, and another user's and the admin's closed loans on the same Book. It returns `[]` for a Book with no copies of the viewer's -- guards the owner filter (FR-48) and the AC's order.
- `tests/unit/loansPage.unit.spec.ts` -- one test: Book detail at `?book=7` with two closed loans for Book 7 shows "Lent before" and the two lines in the served order. With none, or with the read rejected, there is no "Lent before" heading -- the ACs on the outer surface.
- `tests/unit/collectionPage.unit.spec.ts` -- the `@/lib/loans/loans` mock only.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `6-12-j9-lent-before: done` when done.

**Acceptance Criteria:**
- Given an opened Book with returned loans, when Book detail renders, then a "Lent before" group after Your copies lists them newest first, each "{person} · {from} to {to}".
- Given an opened Book with no returned loans, when Book detail renders, then there is no "Lent before" group.
- Given Book detail with a lent copy, when I tap Returned, then after the refresh that loan is listed first under Lent before.
- Given this story, when it is committed, then ARCHITECTURE-SPINE.md describes `returnedLoans(ctx, book?)`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 11 findings — high 0, medium 0, low 7, false 4, maybe-false 0
- findings:
  - `[low]` `[reject]` Edge: two copies of the Book returned on the same day are ordered by `lentOn`, so the one just returned can come second (AC 3). The order is the spine's `returnedLoans` order, shared with `/loans` (6.11). Two copies of one Book returned on one day is rare. Changing the order is a spine change that goes beyond this story.
  - `[false]` `[reject]` Blind: `sprint-status.yaml` says done while the spec is still `in-review` and untracked. The spec was left out of the review diff on purpose. It is closed and committed with the story at finalization.
  - `[low]` `[reject]` Blind: AC 3 (the loan shows first under Lent before after Returned) has no test. The refresh after Returned is already tested (6.7, and 6.11's `loansPage` Returned test). The order is tested in the int test, and the render in the new unit test. A further test would only restate how these combine.
  - `[low]` `[reject]` Blind: `BookDetail` reads the viewer's copies again (holdings, the `returnedLoans` pre-read, the hydration), one call after another, and could skip the read when there are no copies or run the reads with `Promise.all`. A held Book always has copies until wishlists exist (Epic 7). Each read is one small query by key. Restructuring the reads adds branches and doesn't fix any defect a user would notice.
  - `[low]` `[patch]` Blind: `expect(returnedLoans).toHaveBeenCalledWith(expect.anything(), 7)` restates a mocked call (CLAUDE.md, Tests). Fixed: the assertion is deleted. The `forBook` mock already proves the argument through the rendered lines.
  - `[low]` `[patch]` Blind: `expect(logError).toHaveBeenCalled()` would pass on any earlier log in the same `it`. Fixed: it now asserts the call with `{ err: Error }` and 'The loan history failed to load'.
  - `[low]` `[patch]` Blind: the `ReturnedLoan` doc comment named only the Loans section's returned group. Fixed: it now also names Book detail's Lent before.
  - `[false]` `[reject]` Blind: the spine line leaves out the `[]` returned when the viewer holds no copy. Narrowing to the viewer's copies of that Book already means an empty result when there are none. Whether the loans query is skipped is an implementation detail, not part of the contract.
  - `[low]` `[reject]` Blind: the `day()` date helper is local to `BookDetail` and duplicates `/loans`' `day`. The two components each have one small helper, and the spine's Dates rule is the shared source. A shared formatter is a refactor of 6.11's code beyond this story.
  - `[false]` `[reject]` Intent: Lent before is rendered in tests only through `/loans`, not the collection page. Both pages render the same `BookDetail` component with the same props, so the collection page shows exactly the same output and no bad outcome follows.
  - `[false]` `[reject]` Intent: the "Open and closed" matrix row and the refresh after Returned are not tested on the rendered screen. The lent copy line is unchanged and tested since 6.7. The open loan being left out of the history is in the int test. The group renders exactly what the reader returns.

## Design Notes

**Why widen `returnedLoans` rather than filter in Book detail.** Filtering the full history on every Book detail open would read every closed loan the viewer has, every time. A separate reader would duplicate the query and its order. An optional `book` keeps one reader and one order, and changes only the call site.

**Why pre-read copies rather than query `copy.book`.** A nested relationship `where` relies on the adapter's join behaviour, which no other code here uses. The copies read is owner-filtered, matches `withCopyAndPerson`'s style and is one cheap query. Removing a copy removes its loans (6.4), so the viewer's current copies cover every closed loan of the Book.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass.
- `npm run test:int -- tests/int/loansService.int.spec.ts` -- expected: all pass (needs the test Postgres).

**Manual checks (if no CLI):**
- Phone sheet and wide panel, light and dark: the group under Your copies, Finnish wording "Lainassa aiemmin" and "{from}–{to}".

## Auto Run Result

Status: done

**Summary.** Book detail now has a "Lent before" group after Your copies. It lists the returned loans of the viewer's copies of that Book, the most recently returned first. Each line reads "{person} · {from} to {to}", worded and dated like the `/loans` returned rows. With no returned loans there is no group. If the read fails, the error is logged and only this group is left out. `returnedLoans(ctx, book?)` gains an optional Book id. With it, the reader first reads the viewer's copies of that Book (returning `[]` when there are none) and narrows the loans to those copies. The order, owner filter and hydration are unchanged, and `/loans` is unaffected. A Returned or Undo in Book detail already refreshes the server render, so the group keeps up with no new client code. The spine is updated.

**Files changed.**
- `src/lib/loans/loans.ts`: the optional `book` on `returnedLoans`; doc comments on the type and the function.
- `src/app/(frontend)/(sections)/BookDetail.tsx`: the history read, the Lent before group, and a local `day()` date helper, which the "Lent to … since" line also uses now.
- `messages/en.json`, `messages/fi.json`: `detail.lentBefore` ("Lent before" / "Lainassa aiemmin").
- `ARCHITECTURE-SPINE.md`: the `ReturnedLoan` line describes `returnedLoans(ctx, book?)`.
- `tests/int/loansService.int.spec.ts`: one test. Only the viewer's returned loans on copies of that Book come back, newest first. An open loan, another Book's loan, and another user's and the admin's loans are left out. A Book the viewer holds no copy of gives `[]`.
- `tests/unit/loansPage.unit.spec.ts`: one test of Book detail at `?book=7`: the lines in the served order, no group with none, and no group plus a logged error when the read fails.
- `tests/unit/collectionPage.unit.spec.ts`: a `@/lib/loans/loans` mock only.
- `sprint-status.yaml`: 6.12 is done.
- `epic-6-context.md`: regenerated, because the spine was newer than it.

**Review.** One pass found 11 findings: 7 low and 4 false.
- **Patched (all low):**
  - The mocked-call assertion is deleted.
  - The log assertion now checks the specific call.
  - The `ReturnedLoan` doc comment names Lent before.
- **Deferred:** none.
- **Rejected, with reasons in the triage log:**
  - The tie order for two returns on the same day (the spine's order).
  - A test for AC 3.
  - Duplicate copy reads and reads run one after another.
  - The `[]` case in the spine (false).
  - A shared `day()` formatter.
  - The spec state against the sprint state (false).
  - No render test through the collection page (false).
  - No screen test for the open-and-closed row (false).

**Follow-up review:** not recommended (`false`). Patched by verdict: 0 high, 0 medium, 3 low.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors (the 48 warnings were already there).
- `npm run test:int -- tests/int/loansService.int.spec.ts`: 16 pass.
- `npm run test:unit`: 960 pass in most runs. The first run after `typecheck` sometimes fails with 5 s timeouts in `collectionPage.unit.spec.ts`'s Book detail overlay tests. It happened 3 times in about 10 runs, and each test passes alone. The baseline (`878d2e7`, changes stashed) shows the same flake: 2 timeouts in its first run after `typecheck`, then clean. So the flake comes from the overlay tests, not from this story.
- No schema change.
- Not run in a browser.

**Residual risks.**
- **Unit-lane flake:** `collectionPage.unit.spec.ts`'s multi-step overlay tests still hit the 5 s Vitest test timeout under load, even after `cf3b559`. CI may go red on it now and then.
- **Not checked in a browser:** the phone sheet and the wide panel, light and dark, and the Finnish "Lainassa aiemmin" and "{from}–{to}". Mika may want to check the Finnish wording.
- **Unbounded history:** the list has no limit, as specified.
- **Same-day ties:** two copies of one Book returned on the same day follow `lentOn`, not the moment of return.
