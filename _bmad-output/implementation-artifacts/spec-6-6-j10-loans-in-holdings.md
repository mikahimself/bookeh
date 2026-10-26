---
title: '6.6 [J10] Loans in holdings'
type: 'feature'
created: '2026-10-26'
status: 'done'
baseline_revision: 'c209ad4346946d0bfd6c63d6911886142a7d60a0'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-6-context.md'
warnings: []
deferred:
  - summary: >-
      Holdings can now return an ordered copy with an open loan, which Book detail's copy-line rules do not cover.
    evidence: |-
      `setStatus` in `lib/copies` can still set a lent copy to ordered (rejected in 6.5, listed under Known open items in epic-6-context.md). Before 6.6 `CopyLine.loan` was always null, so the state never reached a screen; `getHoldings` now reports it faithfully as `{ status: 'ordered', loan: {...} }`. Pre-existing in `setStatus`, not caused by this story; 6.7 builds the copy line that would meet it.
    location: >-
      src/lib/copies (setStatus); src/lib/books/holdings.ts
    severity: low
---

<intent-contract>

## Intent

**Problem:** `getHoldings` returns `loan: null` on every `CopyLine`, so rows, Book detail, the removal dialogs and the Answer cannot tell who has a lent book, even though `lib/loans` (6.5) now opens and closes loans (FR-37, AD-9).

**Approach:** After it reads the viewer's copies, `getHoldings` reads the open loans of those copies and their People through the gateway. It fills `CopyLine.loan` as `{ loanId, person: { id, name }, since }`, where `since` is the lending date as `YYYY-MM-DD`. A two-user test and the spine's `CopyLine` comment record the rule.

## Boundaries & Constraints

**Always:**
- `lib/books` imports no other service (spine, Design Paradigm; lint `import/no-restricted-paths`). `holdings.ts` reads `loans` and `people` through `@/lib/payload/gateway` itself and does not import `@/lib/loans` or `@/lib/people`.
- Only open loans (`returnedOn` null, `{ returnedOn: { exists: false } }`) fill `loan`. A copy whose loans are all returned has `loan: null`. A copy has at most one open loan (AD-19 index), so the copy-to-loan map needs no tie-break.
- Reads follow the existing holdings pattern: `depth: 0`, `select` only the needed fields, `pagination: false`, and an `in` filter on the ids read so far. People come from one read of the distinct person ids, as locations do. There is no read when there are no copies, and no People read when there are no open loans.
- No `owner` condition: `ownerAccess` on `loans` and `people` gives every role, the admin included, only their own rows. A loan's copy is an `ownedRelation`, so the open loans of the viewer's copies are the viewer's own.
- `since` is the UTC calendar date of the stored `lentOn` (spine, Dates: stored at 12:00 UTC, read back by its UTC date), as `lentOn.slice(0, 10)`, the same read-back `returnLoan` uses.

**Never:**
- No screens, markers, strings, actions or `/loans` page (6.7–6.13). No change to `lib/loans`, `lib/people`, the collections, migrations or `payload-types.ts`.
- No change to `CopyLine`'s type, to holdings callers, or to the removal dialogs: they already read `CopyLine.loan`.
- No returned-loan history in holdings ("Lent before" is 6.12).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Open loan | A's owned copy lent to A's Person "Liisa K" on 2026-10-01 | `loan: { loanId, person: { id, name: 'Liisa K' }, since: '2026-10-01' }`; other fields unchanged | — |
| Not lent | A's copy with no loans | `loan: null` | — |
| Returned only | A's copy whose only loan is returned | `loan: null` | — |
| Lent again | Returned loan, then a new open loan | `loan` is the new loan with its own `since` | — |
| Two users | B's copy of the same Book lent by B | A's holdings show only A's copies and loans; B's show B's loan | — |
| Admin | Admin reads holdings of that Book | `{ copies: [], entries: [] }` | — |
| Two copies | A has two copies of one Book, one lent | Only the lent line carries `loan` | — |

</intent-contract>

## Code Map

- `src/lib/books/holdings.ts:9-19` -- `CopyLine` with `loan` already typed; the doc comment says it "stays `null` until the loans reader arrives (J10, Epic 6)". Rewrite that sentence as current behaviour.
- `src/lib/books/holdings.ts:31-45` -- `getHoldings`'s doc comment: the gateway reaching own rows only, `depth: 0`, locations from one read of distinct ids. Add the loans and People reads in the same words.
- `src/lib/books/holdings.ts:59-75` -- the locations read: the pattern to copy for `people` (`where: { id: { in } }`, `select: { name: true }`). `:77-89` is the line build that sets `loan: null`.
- `src/collections/Loans.ts:105-106` -- `copy` and `person` are `ownedRelation`s. `lentOn` is required and `returnedOn` optional; both are stored at 12:00 UTC by `toNoonUtc`. Read-only.
- `src/payload-types.ts:297-306` -- `Loan`: `copy: number | Copy`, `person: number | Person`, `lentOn: string`. Use `idOf()` from `@/lib/payload/ref` on the relations.
- `src/lib/loans/dates.ts:3-5` -- comment "6.6 adds the read-back here". `lib/books` may not import `lib/loans`, so the read-back lives in holdings. Rewrite the comment to say so.
- `src/lib/loans/loans.ts` -- `lendCopy(ctx, copyId, person: Ref, lentOn?)` and `returnLoan(ctx, loanId, returnedOn?)` return `Undone<…>` with `.data`. The test uses them to make loans.
- `tests/int/holdings.int.spec.ts` -- the existing suite: users A, B and the admin; Books `x`, `y` and `p`; `copyAs`, `locationOfA`; `ownedByA`, `orderedByA`, `ownedByB` on `x`. Its first test expects exact lines with `loan: null`, so lending one of those copies would break it. The new tests use fresh Books.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:434-440` -- `type CopyLine` in Shared shapes.
- Callers (read-only, no change): `src/lib/shelf/getShelfRows.ts:27`, `src/lib/catalogue/lookupBook.ts:97`, `src/app/(frontend)/(sections)/BookDetail.tsx:62,144`, `src/app/(frontend)/(sections)/CollectionList.tsx:87`, `src/app/(frontend)/books/[bookId]/edit/savedCopy.ts:24`.

## Tasks & Acceptance

**Execution:**
- `src/lib/books/holdings.ts` -- after the locations read, read open loans: `gateway.find` on `loans`, `where: { copy: { in: copyIds }, returnedOn: { exists: false } }`, `select: { copy: true, person: true, lentOn: true }`, `depth: 0`, `pagination: false`. If there are any, read the `people` of their distinct person ids (`select: { name: true }`). Build `Map<copyId, CopyLine['loan']>` and set `loan` from it (default `null`). `since: loan.lentOn.slice(0, 10)`, with a comment naming the spine Dates convention. Update both doc comments.
- `src/lib/loans/dates.ts` -- replace "6.6 adds the read-back here" with: the read-back is the stored value's UTC date (`slice(0, 10)`), done where a date is read (`getHoldings` in `lib/books`, which imports no other service).
- `tests/int/holdings.int.spec.ts` -- a new `describe('loans')` with fresh Books. (1) A has two copies; one is lent with `lendCopy` to a Person by name on a given date. That line's `loan` equals `{ loanId, person: { id, name }, since }`, and the other line's `loan` is `null`. (2) Two users: B lends B's copy of the same Book. A's lines carry only A's loan, B's carry only B's, and the admin sees empty holdings. (3) Return with `returnLoan`: `loan` is `null`. Lend again: `loan` is the new loan with its own `since`.
- `ARCHITECTURE-SPINE.md` -- `CopyLine.loan`: trailing comment `// open loan only; since: lending date as YYYY-MM-DD`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- set `6-6-j10-loans-in-holdings: done` when the story is done.

**Acceptance Criteria:**
- Given `getHoldings`, when a copy of the viewer's has an open loan, then its `CopyLine.loan` holds the loan id, the Person (id and name) and the lending date as `YYYY-MM-DD`, and every other copy line has `loan: null`.
- Given two users who each lent their own copy of the same Book, when each reads holdings for it, then neither sees the other's loans or copies, and the admin sees none.
- Given a copy whose loans are all returned, when holdings are read, then its `loan` is `null`.
- Given the spine, when this story merges, then `CopyLine.loan` in Shared shapes states it is the open loan with `since` as `YYYY-MM-DD`.

## Spec Change Log

## Review Triage Log

### 2026-10-26 — Review pass
- verdicts: 16 findings — high 0, medium 0, low 10, false 6, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: the `if (person)` guard silently drops a loan whose Person is missing, so a lent copy shows as not lent — unreachable: `loans.person_id` is NOT NULL with `ON DELETE set null` (migration), so a Person with a loan cannot be deleted; `deletePerson` refuses with `PERSON_IN_USE`; `person` is an `ownedRelation` of the loan's owner, who is the viewer, and the People read runs as the viewer.
  - `[low]` `[patch]` Blind: the `dates.ts` comment names only `getHoldings` as the read-back site, while `returnLoan` (`loans.ts:150`) also does `lentOn.slice(0, 10)` — the comment now names both sites.
  - `[low]` `[patch]` Blind: epic-6-context.md still says 6.6 adds a read-back helper and that 6.9 needs it — both sentences corrected: inline read-back in `getHoldings` and `returnLoan`, no shared helper; 6.9 needs 6.6's holdings. Nothing is deferred to 6.9: no criterion of this story asked for a helper.
  - `[low]` `[defer]` Blind: holdings can now return an ordered copy with an open loan, which no screen handles — pre-existing: `setStatus` allows it (rejected in 6.5, listed as a Known open item); holdings only reports it now. Added to `deferred`.
  - `[low]` `[reject]` Blind: the admin assertion in the two-user loans test checks nothing new, since the admin has no copies and `openLoansOf` never runs — it observes the criterion "the admin sees none" at the outermost surface. Copy scoping, not `ownerAccess`, is what keeps foreign loans out, and the doc comment's `ownerAccess` statement is still true. The assertion is harmless.
  - `[low]` `[patch]` Blind: spine prose (AD-8) does not say `getHoldings` is where copies' open loans come from — AD-8's `getHoldings` sentence now names their open loans.
  - `[false]` `[reject]` Blind: sprint-status says done while the spec says in-review and the spec file is untracked — this is how the workflow runs: finalization sets the spec to done and commits it with the diff.
  - `[low]` `[reject]` Blind: the removal dialogs' loan line and select mode's lent tracking switch on with no manual check — the finding asks only for verification. Those reads of `CopyLine.loan` were built and tested in 6.4 and 5.27, and no criterion of this story names them (CLAUDE.md, Tests).
  - `[low]` `[patch]` Blind: the `CopyLine` doc comment can be read as `since` being null — reworded so that `loan` is null when the copy is not lent and `since` is its lending date.
  - `[false]` `[reject]` Edge: an open loan whose Person is absent from the People read is silently dropped — same refutation as the first Blind row: the state is unreachable.
  - `[low]` `[patch]` Edge: the `dates.ts` claim names only `getHoldings` — same root cause as the second Blind row; fixed there.
  - `[low]` `[reject]` Verification gap: no test that more than 10 open loans or borrowers on one shelf page all come back (`pagination: false` on the two new reads) — the code sets `pagination: false` on both reads. The finding asks only for a test and names the spec's Boundaries, not an acceptance criterion or a spine rule (CLAUDE.md, Tests).
  - `[false]` `[reject]` Intent: the consumers named in "so that" (rows, Book detail, the Answer) are not tested for the loan — they forward `CopyLine` unchanged: `getShelfRows` puts the line in `row.copy`, `lookupBook` returns `Holdings` as `mine`, and Book detail destructures `loan`. The loan reaches them; drawing it is 6.7 and 6.8.
  - `[low]` `[reject]` Intent: the isolation test proves the outcome, not the access scoping of the `loans` and `people` reads — same group as the Blind admin-assertion row. "Never appear" is an observable outcome, and the test observes it.
  - `[false]` `[reject]` Intent: a missing Person leaves `loan: null` instead of failing — same refutation as the first Blind row.
  - `[false]` `[reject]` Intent: the read-back is inline, not in `lib/loans/dates.ts` as the old comment promised — deliberate: `lib/books` imports no other service (spine, line 60, lint-enforced). The diff rewrites the comment, and Design Notes record why.

## Design Notes

**Why the read-back is inline.** The epic context put the loan-date read-back in `lib/loans/dates.ts`. `lib/books` imports no other service (spine, Design Paradigm), so `getHoldings` cannot import it. The read-back is a one-line `slice(0, 10)` on Payload's ISO string, which `returnLoan` already does. A shared helper would need a new home outside both services for one line, so this story does not add one. 6.9, in `lib/loans`, can add a helper there for itself.

```ts
const loanByCopy = new Map<number, NonNullable<CopyLine['loan']>>()
for (const loan of loans) {
  const person = personById.get(idOf(loan.person))
  if (person) loanByCopy.set(idOf(loan.copy), { loanId: loan.id, person, since: loan.lentOn.slice(0, 10) })
}
```

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass.
- `npm run test:reset && npm run test:int` -- expected: all pass, including `holdings.int.spec.ts` and `getShelfRows.int.spec.ts`.

## Auto Run Result

**Summary.** `getHoldings` now fills `CopyLine.loan` with the copy's open loan: `{ loanId, person: { id, name }, since }`, where `since` is the lending date as `YYYY-MM-DD`. Copies that are not lent, or whose loans are all returned, keep `loan: null`. The loans and People are read through the gateway in two extra reads, and only when needed. `lib/books` still imports no other service. Rows, Book detail, the removal dialogs and the Answer get the loan with no change of their own. The removal dialogs' "its loans go too" line and select mode's lent tracking now see real data.

**Files changed.**
- `src/lib/books/holdings.ts` -- `openLoansOf` reads the open loans on the copy ids and their People; the line's `loan` is filled from it; the doc comments are updated.
- `src/lib/loans/dates.ts` -- the header comment says where the read-back happens (`returnLoan`, `getHoldings`).
- `tests/int/holdings.int.spec.ts` -- `describe('loans')` with three tests: only the lent line carries the loan; two users and the admin; returned, then lent again.
- `ARCHITECTURE-SPINE.md` -- `CopyLine.loan` comment (open loan only, `since` as `YYYY-MM-DD`), and AD-8 names open loans as coming from `getHoldings`.
- `_bmad-output/implementation-artifacts/epic-6-context.md` -- recompiled after the 6.5 spine change. The read-back and 6.9 dependency sentences are corrected.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 6.6 done.

**Review.** One pass found 16 findings: 10 low and 6 false.

Four low entries were patched, all wording:
- The `dates.ts` comment names both read-back sites.
- The `CopyLine` doc comment no longer reads as if `since` could be `null`.
- AD-8 names open loans.
- Two stale sentences in the epic context are fixed.

Deferred: an ordered copy with an open loan, which `setStatus` still allows, now reaches holdings. This is pre-existing and low.

Rejected, with the reasons in the triage log:
- The silent drop of a loan whose Person is missing (three rows). It cannot happen: `person_id` is NOT NULL with `ON DELETE set null`, and `PERSON_IN_USE` refuses the delete.
- The admin assertion that checks nothing new (two rows). It observes the criterion at its surface.
- A manual check of the dialogs. It only asks for verification.
- A test for more than 10 loans per page. It only asks for a test, and both reads set `pagination: false`.
- The bookkeeping order, which is how the workflow runs.
- The consumers not being tested for the loan. They pass `CopyLine` through.
- The read-back being inline. The import rule requires it.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 4.

**Verification.**
- `npm run typecheck`: clean.
- `npm run lint`: 0 errors. The 48 warnings are all in existing generated migrations.
- `npm run test:unit`: 931 passed.
- `npm run test:reset && npm run test:int`: 593 passed in 70 files, including `holdings.int.spec.ts` (10).
- Matrix audit: all 7 rows are covered by passing tests.
- There is no schema change, so no migration or production-dump check was needed.

**Residual risks.**
- `setStatus` can still make a lent copy ordered, and holdings now reports that state. The copy line in 6.7 should not assume "ordered" means not lent. See `deferred`.
- The new tests lend on fixed dates in September and October 2026, which `lendCopy` accepts only because they are not in the future. A test clock set before October 2026 would make them fail.
- There is no shared loan-date read-back helper. The read-back is `slice(0, 10)` in `getHoldings` and `returnLoan`; 6.9 may add one in `lib/loans` for itself.
