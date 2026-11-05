---
title: '9.16 [C13] Revalidate Google Books'
type: 'chore'
created: '2026-11-05'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '50e37a7'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: []
---

## Intent

Google Books `isbn:` search answers again (health ISBN 9780141439518 returns its volume on 2026-11-05). Story 8.3 had already recorded 29 of the 30 per-ISBN responses; 9789515782755 is present now, so `tests/fixtures/google/` holds one response per ISBN in `isbns.txt`.

## Tasks & Acceptance

- [x] `npm run fixtures` on 2026-11-05: 0 fixtures requested, report regenerated without a diff. REPORT.md already carries found by Google (18 of 30), covers per source, 5 Google results with `categories`, and the D-2 result: Google categories cover 5 of 30 books. That is under half, so Story 9.11 also maps Finna genre terms. No fixture file contains the key.
- [x] `tests/unit/google.unit.spec.ts`: the `lookupByIsbn` tests run on the recorded `isbn:` search answers (`recorded()`), not by-id volumes wrapped in a search body. The every-fixture test now asserts a result exactly when the answer holds a matching volume. Expectations moved to what Google answers today (A Game of Thrones: HarperCollins UK, 818 pages, subjects `['Fiction']`).
- By-id volumes stay for the `search` tests, `saveCopyAction.int.spec.ts`, and the one HTML-description test: no recorded search answer has an HTML description.

## Auto Run Result

Status: done. Unit tests for the Google adapter 79/79, tsc, eslint and prettier clean. No screen changed, so no walk.
