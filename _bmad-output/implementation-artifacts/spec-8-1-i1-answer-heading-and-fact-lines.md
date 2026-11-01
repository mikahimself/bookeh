---
title: '8.1 [I1] Answer heading and fact lines'
type: 'feature'
created: '2026-11-01'
status: 'in-review'
baseline_revision: '6dd674442723f94093ef55c00e5d247e06204223'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-8-context.md'
warnings: []
deferred: []
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
