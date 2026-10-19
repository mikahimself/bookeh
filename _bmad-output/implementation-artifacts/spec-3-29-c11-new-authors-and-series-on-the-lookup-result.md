---
title: 'Story 3.29: [C11] New authors and series on the lookup result'
type: 'feature'
created: '2026-10-19'
baseline_revision: 'f0a69b3e50d55c221408beaa463887e78146f513'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '_bmad-output/implementation-artifacts/epic-3-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** The Answer must mark each author and series a save would create ("New author", "New series"), so a misspelt name is noticed before it lands (FR-13, EXPERIENCE.md → Answer). `lookupBook`'s `source` kind carries no `matches` yet, and the only matcher, `findOrCreateByName()`, cannot run without writing.

**Approach:** Split the read half out of `findOrCreateByName()` into an exported read-only matcher that both lookup and save use. `lookupBook` uses it in the shared scope to add `matches` for `candidates[pick]` to the `source` kind.

## Boundaries & Constraints

**Always:**
- One matcher. `src/lib/catalogue/findOrCreateByName.ts` exports `findByName(ctx, collection, scope, name): Promise<Author | Series | undefined>`. It normalises with `normaliseName`, keys with `toNameKey`, and runs the existing shared-then-own-private query pair with `overrideAccess: true` on `ctx.req`, after `assertLive(ctx)`. `findOrCreateByName()` calls it with `tx` inside its transaction instead of its local `match`. Its behaviour stays unchanged, including `sortName` refresh, create and `VALIDATION` on a blank name. Its existing tests pass unmodified.
- `findByName` writes nothing and opens no transaction. A blank name is not special-cased: its key matches no row and returns `undefined`.
- `lookupBook.ts` exports `Match = { name: string; id: number | null }`, where `null` means the save would create it. The `source` kind becomes `{ kind: 'source'; candidates: Draft[]; pick: number; matches: { authors: Match[]; series: Match | null } }`, with matches for `candidates[pick]` only.
- `matches.authors` has one entry per author of the picked candidate, in the same order, with that author's `name` as the source gave it. `matches.series` is `null` when the candidate has no `series`, else `{ name: series, id }`.
- The scope is `'shared'`. A `source` answer exists only when no shared Book and no own private Book has the ISBN, so its save creates a shared Book, which matches among shared records only (AD-5). The viewer's own private authors and another user's do not count as matches.
- Lookups run one after the other, never in parallel on one context (AD-16). Doc comments cite AD-5, AD-9 and FR-13.

**Never:**
- No `genres` in `matches`. `mapSubjectsToGenres` does not exist yet (Epic 9), and the AC names authors and series.
- No `matches` on other kinds and no change to `existing`, `none`, `unavailable`, the `pick` rule or `Draft`.
- No second matching implementation or query in `lookupBook.ts`, no new file in `lib/catalogue`, and no change to `lookupSources`, the collections, `src/fields`, or any surface code.
- No `sortName` in `Match`. No fuzzy or accent folding, since `nameKey` equality is the rule (AD-5).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Existing author, case differs | Shared author "Tove Jansson ‹run›" exists. The candidate's author is " tove JANSSON ‹run› ". | `matches.authors = [{ name: <as given>, id: <shared id> }]` | No error expected |
| New author | Candidate author with a run-unique name that matches no row. | `{ name, id: null }`, and the author count for that key is unchanged. | No error expected |
| New series | Candidate `series` is a run-unique name with no row. | `matches.series = { name, id: null }` | No error expected |
| Existing series | Shared series with that name exists. | `matches.series = { name, id: <shared id> }` | No error expected |
| No series | Candidate has no `series`. | `matches.series = null` | No error expected |
| Private records ignored | A's own private author and B's private author both have the candidate author's name, and no shared one exists. A looks up. | `id: null` | No error expected |
| Matches follow pick | Two candidates with different authors, `pick: 1`. | `matches.authors` holds candidate 1's authors. | No error expected |
| Reads only | Any `source` answer | No `authors` or `series` row created, and no `books` row. | No error expected |

</intent-contract>

## Code Map

- `src/lib/catalogue/findOrCreateByName.ts:62-88`: the local `match` closure, the `shared` and `own` `Where`s and the `row = shared ?? own` line move into `findByName`. Keep `assertLive` before each `find`, `limit: 1`, `pagination: false` and `depth: 0`. Normalising (`:54-56`) stays in `findOrCreateByName` for the blank check, and `findByName` normalises again, which is idempotent. The function keeps the `row` it gets for the `sortName` refresh at `:90-102`, which needs `sortName` and `name` from the returned doc.
- `src/lib/catalogue/lookupBook.ts:24-35`: the `LookupResult` union and the doc comment that says `matches` arrives with 3.29. Widen it and update the comment. `:95-98`, the `found` branch: compute `pick` first, then the matches for `candidates[pick]` from the `SourceResult`, not the `Draft`. Both carry the same `authors` and `series`.
- `src/fields/sortName.ts:4` `normaliseName`, `src/fields/nameKey.ts:7` `toNameKey`: already imported by the matcher.
- `src/lib/payload/transaction.ts:18` `assertLive`: passes on a context without a transaction that no `withTransaction` has suspended. `lookupBook` runs on such a context.
- `eslint.config.mjs:20-33`: the `catalogue` zone allows `books`, `metadata`, `payload` and `errors`. The change stays within it.
- `tests/int/lookupBook.int.spec.ts:37-46` `candidate()` defaults authors to `'Väinö Linna'`. Shared author names are global across runs, so that default would make `id` depend on leftover rows. Change it to a module-level run-unique name. `:158-185`, the `found` test asserts with `toEqual`, so add the expected `matches` there. `:187-194` uses `toMatchObject` and is unaffected.
- `tests/int/findOrCreateByName.int.spec.ts`: style for shared names (`unique()`) and the system reads of rows. Seed shared and private authors and series with `findOrCreateByName(ctx, …, scope, { name })`, the sanctioned writer.
- `_bmad-output/implementation-artifacts/sprint-status.yaml:101`: `3-29-c11-new-authors-and-series-on-the-lookup-result: backlog` becomes `in-progress` during the work and `done` at the end.

## Tasks & Acceptance

**Execution:**
- `src/lib/catalogue/findOrCreateByName.ts`: extract and export `findByName` as described under Always, and use it from `findOrCreateByName`. This makes lookup and save share one matcher (spine: "lookup and save both call it").
- `src/lib/catalogue/lookupBook.ts`: add `Match` and `matches` on `source`, built through `findByName(ctx, …, 'shared', …)` sequentially for the picked candidate. This is AC 1.
- `tests/int/lookupBook.int.spec.ts`: use a run-unique default author, update the `found` expectation, and add a `matches` describe that covers the matrix rows. Assert reads-only by counting `authors` and `series` rows by `nameKey`. This is AC 2.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: update the 3.29 status.

**Acceptance Criteria:**
- Given `npx eslint src tests`, `npm run typecheck`, `npm run test:unit` and `npm run test:int`, when they run, then all pass. `findOrCreateByName.int.spec.ts` passes unmodified.
- Given `lookupBook.ts`, when it is inspected, then it contains no `payload.find`, `gateway.find` on `authors` or `series`, or `nameKey` comparison of its own. All matching goes through `findByName`.

## Spec Change Log

## Review Triage Log

### 2026-10-19 — Review pass
- verdicts: 17 findings — high 0, medium 0, low 8, false 9, maybe-false 0
- findings:
  - `[low]` `[reject]` blind: `sprint-status.yaml` says `done` while the spec is `in-review`. The implementer set it early, and finalization commits both together. Nothing reads the pair in between, as in 3.25 and 3.28.
  - `[low]` `[reject]` blind: `Match.name` is the source's text, not the matched row's stored name, so a case-only difference is not shown. A case-only clash between a source and a stored author is uncommon. The spec pairs `matches.authors[i]` with `candidates[pick].authors[i]` for the Answer (3.45), so changing it means editing this build's spec.
  - `[false]` `[reject]` blind: `outcome.candidates[pick]!` throws on a `found` with no candidates. `lookupSources` yields `found` only when the first answering source has a non-empty list, so an empty `found` is never produced. A loud failure on an unreachable state is correct.
  - `[false]` `[reject]` blind: the `genres` narrowing is not recorded as a deferral. STORY-SLICING assigns `matches.genres` to G15 (line 224), so the planning tracks it. The doc comment and Design Notes name Epic 9.
  - `[low]` `[reject]` blind: authors differing only by case or spacing yield two `Match` entries. The entries mirror the candidate one to one, as the Answer's pairing needs. Both say `null` truthfully, because the save creates one row for both. It needs a source that lists one author twice in different case, and collapsing them would add a guard and break the pairing.
  - `[false]` `[reject]` blind: no test proves lookup leaves a derivable `sortName` alone. `findByName` has no write call (diff, `findOrCreateByName.ts` `findByName` body), so no bad outcome exists. This is a test-only ask without demonstrated risk (CLAUDE.md, Tests).
  - `[low]` `[reject]` blind: `findByName` returns `Author | Series`, so the `row as Author` cast stays. The cast predates this story (3.27), and the generic return type adds public-surface complexity for one internal cast.
  - `[low]` `[patch]` blind: the rewritten `findOrCreateByName` doc comment was awkward and duplicated `findByName`'s scope rules, which risks drift. Patched: the matching part now points to `findByName()`, and only writer-specific notes remain.
  - `[low]` `[patch]` blind: the `@/fields/*` imports in the test sat between `@/lib/*` imports. Patched: they moved above them.
  - `[low]` `[reject]` edge: duplicate case-only authors give two `null` matches. This has the same root cause as the blind row above, and the same disposition.
  - `[false]` `[reject]` edge: a blank `series` or author name gives `{ name: '', id: null }` while the save throws `VALIDATION`. The source contract (`src/lib/metadata/source.ts:55-56`) forbids `''` placeholders, and the adapters drop them, so the state is unreachable.
  - `[false]` `[reject]` intent (a): no UI renders "New author". C11 is a Service slice, and 3.45 [D16] renders the Answer from `matches`.
  - `[false]` `[reject]` intent (b): `genres` is absent from the spine's shape. This has the same refutation as the blind genres row: G15 owns it.
  - `[false]` `[reject]` intent (c): lookup calls `findByName`, not `findOrCreateByName`. There is one matching implementation, and `findOrCreateByName` runs through it. Calling the writer from lookup would write, which the AC forbids.
  - `[false]` `[reject]` intent (d): the shared-only scope is a chosen reading. A `source` answer's save creates a shared Book, which matches among shared rows only (AD-5, spine line 117), so it is the only reading consistent with "the save would create it".
  - `[low]` `[reject]` intent (e): bookkeeping status ahead of the spec. This has the same root cause as the blind sprint-status row, and the same disposition.
  - `[false]` `[reject]` intent (f): `existing` carries no `matches`. The AC limits `matches` to the `source` kind, and the auditor itself places it outside every reading.

## Design Notes

**Why the shared scope.** `findOrCreateByName`'s scope follows the Book the save will write. A `source` answer is reached only when the viewer can read no Book with the ISBN, and saving it ensures a shared Book (D1), whose authors match and create among shared rows (AD-5). Matching the viewer's own private author here would promise a link the save never makes.

**Why `genres` is absent.** The spine's `matches` includes `genres: Match[]`, but `mapSubjectsToGenres` lands in Epic 9 and the save creates no genres until then. This follows 3.28's precedent of narrowing the type to what the story's ACs name: Epic 9 widens it with the real mapping.

```ts
const best = outcome.candidates[pick]!
const authors: Match[] = []
for (const { name } of best.authors) {
  authors.push({ name, id: (await findByName(ctx, 'authors', 'shared', name))?.id ?? null })
}
```

## Verification

**Commands:**
- `npx eslint src tests`: expected 0 errors.
- `npm run typecheck`: expected clean.
- `npm run test:unit`: expected all pass, unchanged.
- `npm run test:int`: expected all pass, including `lookupBook` and `findOrCreateByName`. This needs the Postgres on `DATABASE_URL`, here `localhost:5438`.

## Auto Run Result

**Summary.** The `source` kind of `LookupResult` now carries `matches: { authors: Match[]; series: Match | null }` for `candidates[pick]`, with `Match = { name, id: number | null }`. `id` is `null` when the save would create the record. `src/lib/catalogue/findOrCreateByName.ts` exports `findByName(ctx, collection, scope, name)`, which holds the shared-then-own-private `nameKey` query pair. It reads with system privileges, writes nothing and opens no transaction. `findOrCreateByName()` now matches through it inside its transaction, so lookup and save share one matcher. `lookupBook` calls it in the `'shared'` scope, one name at a time (AD-16): a `source` answer always saves a shared Book, which matches among shared rows only (AD-5). `matches.authors` mirrors the candidate's authors in order, with each name as the source gave it. `genres` stays out until Epic 9 (G15).

**Files changed.**
- `src/lib/catalogue/findOrCreateByName.ts`: adds the exported read-only `findByName`. The writer matches through it, and its doc comment is trimmed to writer-specific notes.
- `src/lib/catalogue/lookupBook.ts`: adds `Match`, adds `matches` on the `source` kind and the `sharedMatch` helper, and updates the doc comments.
- `tests/int/lookupBook.int.spec.ts`: makes the default author run-unique, adds `matches` to the `found` expectation, and adds a `matches` describe with 4 tests.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: marks 3.29 done.

**Review.** The review produced 17 findings: 8 low and 9 false.

Patched 2, both low:
- The `findOrCreateByName` doc comment now points to `findByName()` and no longer repeats its scope rules.
- The test's `@/fields/*` imports now sit above `@/lib/*`.

Deferred 0. Rejected:
- **Sprint status `done` ahead of the spec (two rows):** finalization commits both together, as in earlier stories.
- **`Match.name` is the source's text, not the stored name:** case-only clashes are uncommon, and the spec pairs each match with the candidate's author for the Answer (3.45).
- **Empty `found` crashes on `candidates[pick]!`:** `lookupSources` never yields an empty `found`.
- **`genres` not recorded as deferred (two rows):** STORY-SLICING assigns it to G15.
- **Case-only duplicate authors give two `null` matches (two rows):** this is truthful one-to-one pairing, and collapsing would add a guard and break the pairing.
- **No test of the `sortName` write through lookup:** `findByName` has no write call, so this is a test-only ask without risk.
- **The `findByName` union return keeps a cast:** the cast predates this story, and the alternative is a conditional public type.
- **A blank series or author name:** the source contract forbids `''` placeholders.
- **Intent audit rows:** no UI here (3.45 renders it); lookup calls `findByName`, not the writer, which would write; the shared-only scope follows AD-5; `existing` has no `matches`, as the AC scopes.

**Follow-up review:** not recommended. Patched entries: high 0, medium 0, low 2.

**Verification.** Run in worktree `story-3-29-lookup-result`, with Postgres on `localhost:5438`, after the patches.
- `npx eslint src tests`: 0 errors. The 36 warnings are pre-existing, in generated migrations.
- `npm run typecheck`: clean.
- `npm run test:unit`: 520 passed. See the residual risks for an intermittent failure in `scanScreen.unit.spec.ts`.
- `npm run test:int`: 31 files passed and 1 skipped (`migrationSchema`, push on). `lookupBook` passed 15/15, and `findOrCreateByName` passed 6/6 with its spec unmodified.
- Matrix audit: every row has a passing test in `tests/int/lookupBook.int.spec.ts`. "No series" is covered by the `found` test and the private and pick tests.
- Playwright was not run, because this is a service story with no UI.

**Residual risks.**
- `tests/unit/scanScreen.unit.spec.ts`, in "pushes the Answer address on an ISBN barcode, once, and ignores other codes", failed 3 times in 10 runs. Each failure was a timeout at about 1 s with the push mock not yet called. That code and its test come from story 3.1, and this diff does not touch them, so it is flaky on main too and worth a look on its own.
- A matched author's `Match.name` is the source's spelling, so the Answer cannot show a case-only difference from the stored record.
- A source listing one author twice in different case gives two `null` entries for what the save creates as one row.

