---
title: '5.1 [E16] Shelf query parameters'
type: 'feature'
created: '2026-10-22'
status: 'done'
baseline_revision: '8969d1e314cdc2d8a42069a7fd12de358cbbb91c'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '{project-root}/_bmad-output/implementation-artifacts/epic-5-context.md'
warnings: []
deferred:
  - summary: >-
      No serializer for /data/shelf requests; a later story may build shelf params a second time.
    evidence: |-
      shelfHref always returns a path starting with "/". The client list (5.11) must send the ShelfQuery plus offset and limit to /data/shelf, and AD-7 says only query.ts writes shelf params. Export a search-string helper from query.ts when /data/shelf is built (5.8 or 5.11).
    location: >-
      src/lib/shelf/query.ts
    severity: low
  - summary: >-
      ShelfQuery genre values mix system genre ids and user genre tag ids from separate id sequences.
    evidence: |-
      The spine comment on ShelfQuery.filters.genre says "system genre ids and the user's genre tag ids". genres and tags have separate id sequences, so genre=11 can name either once Epic 9 adds genre tags. Settle the encoding (prefix, separate parameter, or tag param) in the spine before Epic 9's genre-tag filter.
    location: >-
      ARCHITECTURE-SPINE.md, Shared shapes, src/lib/shelf
    severity: medium
---

<intent-contract>

## Intent

**Problem:** The collection's search, filters, sort and open Book live in `/` search params (AD-7), but nothing names or parses them yet.

**Approach:** Add the pure module `src/lib/shelf/query.ts` exporting the spine's `ShelfQuery` type, `parseShelfQuery(searchParams)` and `shelfHref(query, { book })`, with unit tests that round-trip every field.

## Boundaries & Constraints

**Always:**
- `query.ts` has no imports at all except `import type` (client components import it; the eslint `clientLibImports` rule already allows `@/lib/shelf/query`).
- `ShelfQuery` is exactly the spine's shape (Structural Seed → Shared shapes → `src/lib/shelf`), including `tag` and `theme`, which later epics use.
- `parseShelfQuery` accepts both `URLSearchParams` (client `useSearchParams()`) and the page's awaited `Record<string, string | string[] | undefined>`, and returns `{ query: ShelfQuery; book: number | null }`, so the client list can key on `query` without `book`.
- Malformed input never throws: each bad value is dropped and its field falls back to the default (no filter; sort `author`; dir `asc`).
- `shelfHref` returns `/` plus a canonical query string: fixed parameter order, default sort and dir omitted, empty filters omitted, values deduplicated. The same `ShelfQuery` always gives the same string.
- The spine's Shared shapes gain the parse result type (named `ShelfAddress`) in the same commit.

**Never:**
- No page number or offset in the URL.
- No SQL, Drizzle or Payload; no `getShelfRows`, `visibleCopies` or screen code (Stories 5.2+).
- `q` is not trimmed or normalised beyond dropping an empty string; search semantics belong to Story 5.3.

## I/O & Edge-Case Matrix

Parameter names: `q`, `location`, `status`, `read`, `genre`, `tag`, `theme`, `language`, `author`, `series`, `publisher`, `rating`, `year`, `pages`, `sort`, `dir`, `book`. Multi-value fields repeat the parameter.

| Scenario | Input | Expected |
|----------|-------|----------|
| Empty | `{}` | `{ query: { filters: {}, sort: 'author', dir: 'asc' }, book: null }`; `shelfHref` → `/` |
| Several values | `author=3&author=7&publisher=WSOY&publisher=Otava` | `author: [3, 7]`, `publisher: ['WSOY', 'Otava']` |
| Ranges | `year=1990-2000`, `pages=-300`, `year=1990-` | `[1990, 2000]`, `[undefined, 300]`, `[1990, undefined]` |
| Read, rating | `read=true`, `read=false`, `rating=4` | `read: true`, `read: false`, `ratingMin: 4` |
| Sort | `sort=year&dir=desc` | `sort: 'year', dir: 'desc'` |
| Book | `book=12` | `book: 12` |
| Bad ids | `author=x&author=5&location=-1&location=2.5` | `author: [5]`; `location` absent |
| Bad enums | `status=lent&sort=price&dir=up&read=maybe` | no status, no read; `sort: 'author'`, `dir: 'asc'` |
| Bad numbers | `rating=0`, `rating=6`, `rating=x`, `year=2000-1990`, `year=-`, `pages=a-b` | field absent |
| Bad book | `book=0`, `book=abc` | `book: null` |
| Repeated single | `sort=title&sort=year`, `q=a&q=b` | first wins: `title`, `a` |
| Empty strings | `q=`, `theme=`, `language=` | absent |
| Unknown / page | `page=3&foo=1` | ignored; `shelfHref` never writes them |
| Text with symbols | `q=50% & _x\`, `publisher=Gummerus, Otava` | kept verbatim and round-trips |

</intent-contract>

## Code Map

- `eslint.config.mjs:86-111` -- `clientLibImports` already allows `lib/shelf/query` in client components. No change.
- `src/app/(frontend)/scan/answer.ts:236-251` -- `scanParams` / `first()`: the existing pattern for reading a Next page's searchParams record (first value of an array wins).
- `src/lib/catalogue/corners.ts` -- the existing pure, client-importable module: style for the module doc comment and "Spine, Shared shapes" type comments.
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:482-495` -- the `src/lib/shelf` shared shapes; `ShelfAddress` goes here.

## Tasks & Acceptance

**Execution:**
- `src/lib/shelf/query.ts` -- create: `ShelfQuery`, `ShelfAddress`, `parseShelfQuery`, `shelfHref`, following the I/O matrix -- one place that owns the URL (AD-7).
- `tests/unit/shelfQuery.unit.spec.ts` -- create: one round-trip test over a query with every filter field (several values where the field takes several), `q`, sort, dir and `book`, through both input shapes; one table test over the matrix's malformed rows; one test that defaults give `/` -- the story's named tests.
- `ARCHITECTURE-SPINE.md` -- add `type ShelfAddress = { query: ShelfQuery; book: number | null } // parseShelfQuery()` under `// src/lib/shelf` -- spine contract updated in the same commit.

**Acceptance Criteria:**
- Given `src/lib/shelf/query.ts`, when it is read, then its only imports are `import type` and it exports `ShelfQuery`, `parseShelfQuery` and `shelfHref`.
- Given any `ShelfQuery` with every filter field set and a `book`, when it goes through `shelfHref` and back through `parseShelfQuery` (as `URLSearchParams` and as a Next searchParams record), then the result equals the input.
- Given the malformed and unknown inputs in the matrix, when parsed, then nothing throws and each falls back as the matrix says.
- Given the default query and no book, when `shelfHref` builds it, then it returns `/`, with no page parameter in any output.

## Spec Change Log

## Review Triage Log

### 2026-10-22 — Review pass
- verdicts: 18 findings — high 0, medium 1, low 12, false 5, maybe-false 0
- findings:
  - `[low]` `[reject]` Blind: `shelfHref` keeps value order, so `author: [3, 7]` and `[7, 3]` give different URLs and list keys — real, but reaching the same filter in a different click order is rare and costs only the remembered scroll; sorting would add behaviour and break round-trip order.
  - `[low]` `[defer]` Blind: no serializer for `/data/shelf` requests, so a later story may write shelf params a second time — not caused by this change; `/data/shelf` belongs to Stories 5.8/5.11, which can export a search-string helper from `query.ts` then.
  - `[low]` `[reject]` Blind: `shelfHref` writes out-of-domain values (`ratingMin: 7`, ids ≤ 0, from > to) that parse drops — the Filter panel never builds them (5.16 validates ranges); guarding the writer adds branches for input no caller produces.
  - `[low]` `[patch]` Blind: the table test's `/page|foo/` assertion also matches `pages=` and can't fail for the reason it's there — replaced with a check on parameter names.
  - `[medium]` `[defer]` Blind: `genre: number[]` holds system genre ids and the user's genre tag ids from two id sequences, so `genre=11` is ambiguous once Epic 9 adds genre tags — pre-existing in the spine's `ShelfQuery`; Epic 9 needs to settle it.
  - `[low]` `[reject]` Blind: dedup is promised but no matrix row shows it — asks for a test only, and names no acceptance criterion or spine rule (CLAUDE.md tests convention).
  - `[low]` `[reject]` Edge: `shelfHref` writes values parse rejects — same root as the Blind out-of-domain finding; rejected on the same grounds.
  - `[low]` `[reject]` Edge: whitespace-only `q`, `theme`, `language`, `publisher` become active — `q` is kept verbatim by design (search semantics are Story 5.3's); whitespace-only filter values only come from hand-edited URLs.
  - `[low]` `[patch]` Edge: `/page|foo/` matches `pages=` — grouped with the Blind finding; same patch.
  - `[low]` `[reject]` Edge (claim): "any `ShelfQuery`" round-trips only for in-domain queries — same root as the out-of-domain finding; the AC's "every filter field set" means values the app builds.
  - `[low]` `[reject]` Verification gap: no test covers dedup on parse or write — a test-only finding with no named criterion or spine rule (CLAUDE.md tests convention).
  - `[false]` `[reject]` Intent: AD-7's "only reader and writer" isn't exercised at the URL surface — nothing reads the shelf URL yet; screens arrive from 5.10, and the eslint `clientLibImports` rule already routes client access through `query.ts`.
  - `[false]` `[reject]` Intent: the `ShelfAddress` return type grows the spine contract beyond the epic — the spine is updated in the same commit, as the convention requires; the split is needed for AD-7's list key without `book`.
  - `[false]` `[reject]` Intent: "fall back to defaults" could mean resetting the whole query — the epic says unknown or malformed *parameters* fall back; per parameter is the reading the text supports.
  - `[low]` `[reject]` Intent: closed range and `read=true` are only in the parse table, not the round-trip — both are covered by tests that ran; asks for test placement only.
  - `[false]` `[reject]` Intent: "no imports beyond types" isn't tested — the file has no imports, and the tests convention does not restate structure as tests.
  - `[low]` `[patch]` Intent: the "no page number" check is weak — grouped with the `/page|foo/` finding; same patch.
  - `[false]` `[reject]` Intent: work uncommitted and sprint status still `backlog` — finalization commits the story and updates the sprint status.

## Design Notes

URL shape, chosen here because the spine leaves names to this module: one parameter per field, named after the field (`ratingMin` shortens to `rating`), values repeated (`?author=3&author=7`) rather than comma-joined, since publishers and themes can contain commas. Ranges are `from-to` with either end empty; years and pages are non-negative integers, so `-` is unambiguous. A range with from > to is dropped (the Filter panel never writes one, Story 5.16). Ids are positive integers; `rating` is 1–5.

Canonical order in `shelfHref`: `q`, then filters in the order of the `ShelfQuery` type, then `sort`, `dir`, `book`. Encoding is `URLSearchParams.toString()`.

## Verification

**Commands:**
- `npm run test:unit -- tests/unit/shelfQuery.unit.spec.ts` -- expected: passes
- `npm run lint` -- expected: no errors
- `npm run typecheck` -- expected: no errors

## Auto Run Result

**Summary:** Added the pure module `src/lib/shelf/query.ts`, the collection's one URL reader and writer (AD-7). `parseShelfQuery` takes `URLSearchParams` or a Next searchParams record, never throws, and drops bad values one parameter at a time. `shelfHref` writes a canonical `/?…` string with defaults left out and no page number. The spine gains `ShelfAddress`.

**Files changed:**
- `src/lib/shelf/query.ts`: `ShelfQuery`, `ShelfAddress`, `ShelfParams`, `parseShelfQuery`, `shelfHref`; no imports.
- `tests/unit/shelfQuery.unit.spec.ts`: a round-trip of every field through both input shapes, a table over the matrix rows, and defaults give `/` (13 tests).
- `ARCHITECTURE-SPINE.md`: `type ShelfAddress` under `// src/lib/shelf`.

**Review findings:** 18 in all: 1 patch group (3 rows, all `low`), 2 deferred, 15 rejected. The reasons are in the Review Triage Log.
- **Patched:** the table test's `/page|foo/` regex, which also matched `pages=`. It now checks parameter names.
- **Deferred:**
  - a serializer for `/data/shelf` requests (`low`, Stories 5.8/5.11);
  - the spine's `genre` mixing genre and tag ids (`medium`, before Epic 9).
- **Rejected:**
  - value-order canonicalisation;
  - out-of-domain values in `shelfHref` (3 rows);
  - whitespace-only values;
  - dedup and test-placement asks, which are test-only and name no criterion;
  - 5 `false` intent-audit rows.

**Follow-up review recommendation:** false. Patched entries by verdict: high 0, medium 0, low 1.

**Verification:**
- `npm run test:unit -- tests/unit/shelfQuery.unit.spec.ts`: 13 passed.
- `npm run lint`: 0 errors (the 40 warnings were already there).
- `npm run typecheck`: exit 0.
- Matrix audit: every row is covered by a test that ran.

**Residual risks:** nothing uses the module yet; the screens arrive from Story 5.10. The URL parameter names are recorded only in this spec and the module's doc comment.
