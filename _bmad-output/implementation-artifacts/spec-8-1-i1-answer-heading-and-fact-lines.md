---
title: '8.1 [I1] Answer heading and fact lines'
type: 'feature'
created: '2026-11-01'
status: 'done'
baseline_revision: '6dd674442723f94093ef55c00e5d247e06204223'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: []
deferred:
  - summary: >-
      No rule says which location the In library heading names when the viewer has copies at several locations.
    evidence: |-
      FR-20 gives the heading as "In library · {location}" (the location only if the user tracks one) and EXPERIENCE.md's Answer table shows the bare heading; `AnswerFacts` returns `heading: 'inLibrary'` and the copy lines, with no heading location, so the rule is unstated. Story 8.1's acceptance criteria enumerate the four heading values and nothing else, so this belongs with the Answer that renders them (Story 8.2) and with Lookup's rows (Story 8.8), which must not disagree.
    location: >-
      src/lib/catalogue/answerFacts.ts:6
    severity: low
---

<intent-contract>

## Intent

**Problem:** Heading precedence for the Answer is spread across `scan/answer.ts`: `inLibrary()` claims any Book with a copy (an ordered-only holding reads "In library"), `notInLibrary()` claims a Book held only through open wishlist entries, and neither names the Ordered or On wishlist headings. Nothing states the facts in one place, so Story 8.2's Answer and Story 8.8's Lookup rows would each re-derive them (FR-20, AD-9).

**Approach:** One pure function `answerFacts(holdings)` in `lib/catalogue` that turns `Holdings` into the heading — the first of In library, Ordered, On wishlist, Not in library that applies — and one line per remaining fact: every copy in holdings order, then every open entry. It returns structured lines, not text: the signature takes holdings alone, so the surfaces keep formatting and translation. Nothing is wired to it in this story; Story 8.2 mounts it.

## Boundaries & Constraints

**Always:**
- Heading precedence, in order: **In library** when at least one copy is `owned`; else **Ordered** when there is at least one copy (all of them ordered); else **On wishlist** when there is at least one entry; else **Not in library**.
- A lent copy is an owned copy, so it gives the In library heading.
- `Holdings.entries` already holds open entries only (`closedAt` unset, Story 7.3), the viewer's own and those for a Person alike; both give the On wishlist heading (Epic 7 retrospective decision 2). The function filters nothing.
- Lines are every copy, then every entry, each in `Holdings` order (oldest first, ties by id — `getHoldings()` sorts them). The heading consumes no line: under In library every copy still has its line, and under Ordered every ordered copy has one, which is what Story 8.2 hangs its Received Link on.
- Each line carries the whole `CopyLine` / `EntryLine` it came from, so the lent rule stays in `isLent()` on the surface and is not re-derived in `lib`.
- Pure and synchronous: no `ctx`, no read, no throw. Empty holdings are Not in library with no lines.
- Types exported from `lib/catalogue` and added to ARCHITECTURE-SPINE.md's Structural Seed (`src/lib/catalogue` block), since Stories 8.2 and 8.8 both consume them.

**Never:**
- No change to `src/app/(frontend)/scan/answer.ts`, to any Answer component, to Lookup or to Book detail: mounting `answerFacts`, the four Answers' buttons, the Received Link and the "a scan never resets silently" rule are Story 8.2's acceptance criteria, and the Lookup rows are Story 8.8's. The Story 7.3 deferral (a wish-only Book resets the scan silently) stays open until then.
- No message catalogue entries, no formatting, no `next-intl`: the function returns no text.
- No new reader of copies, loans or entries — `getHoldings()` stays the one reader (AD-9). `answerFacts` takes its output.
- No change to `Holdings`, `CopyLine`, `EntryLine`, `getHoldings()` or any collection; no migration.
- No integration or e2e test: the function touches no database and no screen.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Owned copy | one `owned` copy, nothing else | `inLibrary`; one copy line | — |
| Owned and ordered | one `owned`, one `ordered` copy | `inLibrary`; both copy lines, holdings order | — |
| Lent copy only | one `owned` copy with an open loan | `inLibrary`; its line, loan intact | — |
| Ordered only | two `ordered` copies, no entries | `ordered`; both copy lines | — |
| Ordered and wished | one `ordered` copy, one open entry | `ordered`; copy line, then entry line | — |
| Own wish only | one entry, `forPerson: null` | `onWishlist`; one entry line | — |
| Wish for a Person only | one entry with `forPerson` | `onWishlist`; one entry line | — |
| Two entries, no copies | two open entries on different lists | `onWishlist`; both entry lines in order | — |
| Everything | owned + lent + ordered copies and an entry | `inLibrary`; every copy line, then the entry line | — |
| Nothing held | `{ copies: [], entries: [] }` | `notInLibrary`; no lines | — |

</intent-contract>

## Code Map

- `src/lib/books/holdings.ts:14-28` -- `CopyLine` (`copyId`, `status`, `location: Named | null`, `note`, `loan`), `EntryLine` (`entryId`, `wishlist: Named`, `forPerson: Named | null`), `Holdings`. `:30-55` `getHoldings()` doc: copies oldest first ties by id, entries likewise, open entries only. Read-only — import the types.
- `src/lib/catalogue/` -- new `answerFacts.ts` lands here. `eslint.config.mjs:23` allows `catalogue` to import `books`.
- `src/app/(frontend)/scan/answer.ts:155-161` -- `inLibrary()` doc comment, which says an ordered-only holding shows In library "until the Ordered heading arrives (Story 8.2)". `:112-119` -- `notInLibrary()` doc, which says a wish-only Book answers there "until Story 8.2's On wishlist heading" and that "Epic 8's `answerFacts` takes over heading precedence". Both stay true after this story (nothing is wired yet) — read-only, do not edit.
- `src/app/(frontend)/isLent.ts` -- `isLent(copy)`: `status === 'owned' && loan !== null`, a type guard, in `app` because client components import it. Do not move it and do not duplicate its rule in `lib`; it is why a line carries the whole `CopyLine`.
- `src/lib/catalogue/pick.ts`, `src/lib/catalogue/handEnteredValues.ts` -- the shape to copy for a small pure module in this folder (exported types above the function, doc comment naming the spine rule).
- `tests/unit/answer.unit.spec.ts` -- the unit-lane conventions for this area (plain objects, `describe`/`it`, no Payload). New spec file beside it.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:458` -- `LookupTarget`, the last line of the `src/lib/catalogue` shared-shapes block before `BookEdits`; the new types go after it.
- `_bmad-output/planning-artifacts/epics.md:3458-3471` -- Story 8.1's acceptance criteria, verbatim source of the rules above.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/answerFacts.ts` -- new: export `AnswerHeading`, `AnswerFactLine`, `AnswerFacts` and `answerFacts(holdings)`; doc comment naming FR-20, AD-9 and the precedence order -- one place states the Answer's facts.
- `tests/unit/answerFacts.unit.spec.ts` -- new: table-driven heading assertions over every combination of owned, ordered, lent and wished, plus line content and order -- the story's acceptance criteria name the behaviour.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- add the three types to the `src/lib/catalogue` Structural Seed block after `LookupTarget` -- Stories 8.2 and 8.8 consume them (same-commit spine rule).
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- `8-1-i1-answer-heading-and-fact-lines: done` and `epic-8: in-progress` when the story is done.

**Acceptance Criteria:**
- Given holdings with at least one owned copy, when `answerFacts` runs, then the heading is `inLibrary`, whether or not that copy is lent and whether or not ordered copies or open entries exist alongside it.
- Given holdings whose only copies are ordered, when `answerFacts` runs, then the heading is `ordered`, even when open entries exist alongside them.
- Given holdings with no copies and at least one open entry, the viewer's own or for a Person, when `answerFacts` runs, then the heading is `onWishlist`.
- Given holdings with no copies and no entries, when `answerFacts` runs, then the heading is `notInLibrary` and there are no lines.
- Given any holdings, when `answerFacts` runs, then it returns one line per copy followed by one line per entry, each in holdings order, each carrying the source `CopyLine` or `EntryLine` unchanged, and the input is not mutated.
- Given the unit lane, when `npm run test:unit` runs, then the new spec covers all sixteen combinations of owned, ordered, lent and wished.

## Spec Change Log

## Review Triage Log

### 2026-11-01 — Review pass
- verdicts: 15 findings — high 0, medium 0, low 10, false 4, maybe-false 0
- findings:
  - `[low]` `[patch]` Blind: the `ordered` branch was `copies.length > 0`, right only because `CopyLine['status']` is a two-member union, so a third status would read as Ordered — now `copies.some((copy) => copy.status === 'ordered')`, which is the AC's "only ordered copies" once the owned check is past.
  - `[low]` `[patch]` Blind: the "rows unchanged" assertion compared `holdings` with a literal built from the same object references, so an in-place field write passed — the test now snapshots with `structuredClone()` before the call and compares against the snapshot.
  - `[low]` `[patch]` Blind: `toMatchObject({ copy: { loan: lentCopy.loan } })` compared `lentCopy.loan` with itself, restating the preceding `toEqual`, and called `answerFacts` twice — line deleted, one result reused.
  - `[false]` `[reject]` Blind: the for-a-Person test is subsumed by the multi-entry order test — it is not: the order test holds `ownEntry` as well, so its `onWishlist` could come from the own entry; the narrow test is the only one proving a Person entry alone gives `onWishlist` (Epic 7 retrospective decision 2).
  - `[low]` `[patch]` Blind: no case put an ordered copy before an owned one, so a `copies[0].status` implementation would have passed — added `copies: [orderedCopy, ownedCopy]` expecting `inLibrary` with both lines in order.
  - `[low]` `[defer]` Blind: FR-20's heading carries a location and nothing says which copy's location it names — not in this story's criteria, which enumerate the four heading values; recorded in `deferred` for Stories 8.2 and 8.8.
  - `[low]` `[patch]` Blind: the spine's `AnswerHeading` comment said only "first that applies", while 8.2 and 8.8 read the spine rather than the module — extended with the two easy-to-miss rules (a lent copy counts as owned; `ordered` means copies exist with none owned).
  - `[low]` `[patch]` Blind: the doc comment overclaimed FR-20, which also lists "In {friend}'s library" (Phase 2/3), while Not found and Couldn't look it up come from `LookupResult` — the comment now scopes the union to holdings-derived headings.
  - `[low]` `[patch]` Blind: `ScanOutcome.kind: 'inLibrary'` in `scan/answer.ts` keeps its old any-copy meaning and `AnswerLine`/`copyLines()` sit beside the new names, which Story 8.2 imports together — the doc comment now names both call sites 8.2 retires and the `CopyLine` vs `AnswerCopy` difference.
  - `[low]` `[reject]` Blind: type `lines` as `readonly AnswerFactLine[]` — the codebase's shared shapes use mutable arrays (`Holdings.copies`, `ShelfRows.rows`); matching them is worth more than the prose-to-type move, and no caller mutates.
  - `[low]` `[patch]` Blind: the spine's `catalogue/` source-tree comment was not extended — `answerFacts` added to that list.
  - `[low]` `[patch]` Edge: a future copy status would fall into `ordered` — same root cause and same fix as the first Blind row.
  - `[false]` `[reject]` Edge: the returned lines alias the caller's rows, so a surface mutating `line.copy` would mutate the `getHoldings()` rows — the pass-through is the story's stated contract ("each carrying the source `CopyLine` or `EntryLine` unchanged"), no mutator exists or is proposed, and the purity of this function is now pinned by the `structuredClone` snapshot; cloning would copy every row on every render for a demonstrated-by-nobody write.
  - `[low]` `[patch]` Verification gap: the non-mutation criterion shipped unpinned — the layer demonstrated it by mutating `note` inside `answerFacts` with all tests still green; same fix as the second Blind row.
  - `[false]` `[reject]` Intent: readings R2 (the function returns the line text "Ordered" and "On {list}") and R3 (one discriminated line kind per fact form) are unimplemented — `answerFacts(holdings)` takes holdings alone, so no catalogue or text function reaches it and localised text is not producible inside `lib`; Story 8.2's criteria say the Answer "uses `answerFacts`" and own the Received Link per ordered line, so R1 is the only reading compatible with both stories. Reading R4 (reach it from the Answer in this story) is 8.2's criteria verbatim.

## Design Notes

**Structured lines, not text.** The story's signature is `answerFacts(holdings)` — no catalogue, no text functions — so it cannot produce the localised strings ("Ordered", "On {list}", the lent marker). It classifies and orders; `copyLines()` and the Answer components keep the wording they have, and Story 8.2 maps the lines to them. This is also why a line carries the whole row rather than a projection: the lent rule lives in `isLent()`, which `lib` may not import.

```ts
export type AnswerHeading = 'inLibrary' | 'ordered' | 'onWishlist' | 'notInLibrary'
export type AnswerFactLine = { kind: 'copy'; copy: CopyLine } | { kind: 'entry'; entry: EntryLine }
export type AnswerFacts = { heading: AnswerHeading; lines: AnswerFactLine[] }
```

**Unused until 8.2.** Nothing imports `answerFacts` when this story lands; that is the slice the epic asked for, and the existing doc comments in `scan/answer.ts` already point at it.

## Verification

**Commands:**
- `npm run typecheck` -- expected: clean.
- `npm run lint` -- expected: 0 errors.
- `npm run test:unit` -- expected: all pass, including `tests/unit/answerFacts.unit.spec.ts`.

**Manual checks (if no CLI):**
- No screen changes, so no Playwright walk: the function is not mounted on any surface in this story.

## Auto Run Result

**Summary.** `answerFacts(holdings)` in `src/lib/catalogue/answerFacts.ts` is now the one place the Answer's facts are stated (FR-20, AD-9): the heading is the first that applies — `inLibrary` when a copy is owned (a lent copy is owned), else `ordered` when a copy is ordered and none is owned, else `onWishlist` when an open entry exists, else `notInLibrary` — and the lines are every copy, then every entry, in `Holdings` order, each carrying its source row unchanged. Pure and synchronous, no text: the signature takes holdings alone, so wording and the lent marker stay on the surface. Nothing imports it yet; Story 8.2 mounts it.

**Files changed.**
- `src/lib/catalogue/answerFacts.ts` -- new: `AnswerHeading`, `AnswerFactLine`, `AnswerFacts`, `answerFacts()`, with the precedence, the holdings-only scope of the heading union, and the `scan/answer.ts` call sites Story 8.2 retires in the doc comment.
- `tests/unit/answerFacts.unit.spec.ts` -- new: a 16-row table over every combination of owned, lent, ordered and wished asserting heading and lines, plus empty holdings, a for-a-Person entry alone, several ordered copies, two entries with no copies, an ordered copy before an owned one, and line order with a `structuredClone` snapshot proving the input is untouched. 22 tests.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md` -- the three types in the `src/lib/catalogue` Structural Seed (after `LookupTarget`) with the precedence rules, and `answerFacts` in the `catalogue/` source-tree listing.
- `_bmad-output/implementation-artifacts/epic-8-context.md` -- new: compiled epic context.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` -- 8.1 done, `epic-8: in-progress`.

**Review.** One pass, 15 findings (low 10, false 4 — no medium or high). Patched 9 rows in 8 fixes: the `ordered` branch expressed as "a copy is ordered" rather than "a copy exists"; three test fixes (a `structuredClone` snapshot for the non-mutation criterion, a self-comparing assertion deleted, an ordered-before-owned case added); three documentation fixes (the heading union scoped to holdings-derived headings, the superseded `ScanOutcome`/`copyLines()` call sites named, the spine's precedence rules); and `answerFacts` added to the spine's module listing. Deferred 1 (low: which location the In library heading names, for 8.2/8.8). Rejected 4: the for-a-Person test is not subsumed, the row pass-through is the story's own contract, `readonly` arrays would break with the codebase's shared shapes, and the text/discriminated-line readings of the intent are precluded by the signature and owned by Story 8.2 — each with its evidence in the triage log.

**Follow-up review:** not recommended. Patched entries this pass: high 0, medium 0, low 9.

**Verification.**
- Implementer: typecheck clean, lint 0 errors, unit lane 84 files / 1108 tests before the patches; after them, typecheck clean and the two edited files' tests green.
- Re-run here after the patches: `npm run typecheck` clean; `npm run lint` 0 errors (60 pre-existing warnings, all in migration files); `npm run test:unit` 84 files, 1111 tests passed.
- Matrix audit: all 10 rows covered by passing tests. Two rows (several ordered copies; two entries with no copies) were not instantiated by the implementer's first pass and were added here before review.
- No screen change, so no Playwright walk.

**Residual risks.**
- `answerFacts` has no importer until Story 8.2, so the two stopgaps stay live: `inLibrary()` in `scan/answer.ts` still claims an ordered-only holding and `notInLibrary()` still claims a wish-only Book, which means Story 7.3's deferral (a scan of a wish-only Book resets silently) is still open and is 8.2's acceptance criterion.
- The heading's location (FR-20's "In library · {location}") is unresolved and recorded in `deferred` for 8.2 and 8.8.
- `ARCHITECTURE-SPINE.md` changed, so nothing downstream is stale, but `epic-8-context.md` was compiled before that edit.
