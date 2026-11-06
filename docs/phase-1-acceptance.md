# Phase 1 acceptance

Measured on production (the LXC, the real catalogue) on 2026-11-05, by Mika. Story 9.15 (K13); metrics from the PRD, Success Metrics.

## Result

Phase 1 meets its success metrics. The counter-metric stays under its threshold and is not flagged.

| Metric | Target | Measured | Met |
| --- | --- | --- | --- |
| Collection in | ~200 books catalogued, locations set | 283 copies of 282 Books, every copy with a location | yes |
| "Where is it?" | under 10 s from the phone | 5 books, each found in 5-7 s (see note) | yes |
| Shop check (NFR-1) | 2 s on a held Book, 5 s from a source, on 4G | held: about 1-1.5 s; from a source: about 3-4 s | yes |
| Adding a book (NFR-2) | under 20 s per book | about 10-15 s | yes |
| Restore (NFR-6) | a backup brings the catalogue back | rehearsed, see below | yes |
| Counter-metric | at most 1 in 10 Books corrected after saving | 25 of 282 (8.9%) | not flagged |
| No duplicate purchases | none after cataloguing | not measured here; no duplicate was reported during acceptance | closed (2026-11-05, Mika): a use-over-time metric, not measurable at one date |

## "Where is it?"

Five books, timed on the phone from opening bookeh to seeing the location: all found in 5-7 s. The time includes searching with misspelt titles, so it is a worst case rather than a best case.

## Counter-metric

Books held: 282 (distinct Books with at least one copy; 283 copies, so one Book has two).

Query: Books held whose Book row changed more than a minute after creation, split by whether the change coincides (within 2 minutes) with the Book's cover being created.

| Touched after saving | Cover only (likely) | Other |
| --- | --- | --- |
| 216 | 191 | 25 |

- **Ratio: 25 / 282 = 8.9%**, below 1 in 10. Not flagged.
- Mika owns the only account and is the admin, so edits are written to the shared Book (AD-4) and `user_books.overridden` is empty for all Books (0 overrides). The ratio therefore comes from `books.updated_at`, not from overrides.
- The 25 are an upper bound: the query also counts bulk operations that touch Books. Mika's account of the real edits is that most were fixing an all-caps author name.
- 191 Books got a cover uploaded by hand, which is not a correction of fetched data. It does show that the sources often lack a cover for these (mostly Finnish) books.

## Measurements

- **NFR-1**, scan to Answer on the phone over 4G, a few books each: held 1-1.5 s (target 2 s), from a source 3-4 s (target 5 s).
- **NFR-2**, scan to save with no edits: about 10-15 s per book (target under 20 s). Estimated by Mika, not timed with a stopwatch on a batch.
- Fixture-backed figures from Story 8.2 remain in that story's spec as the baseline; the figures above are from the deployed app.

## Restore rehearsal (Story 4.10)

Run several times; the latest run, 2026-11-05, restored `/mnt/nas/bookeh/backups/20261105-164925`:

- Collation `icu/fi-FI`; every table's row count matched production: users 1, users_roles 2, books 286, books_rels 316, books_texts 2682, authors 208, series 45, genres 53, media 214, copies 283, user_books 105, user_books_rels 0, locations 1.
- Restored admin signed in; all 214 covers loaded through the app.
- Time taken: 48 s, a lower bound for a real restore onto the NAS (scratch database on tmpfs).
- Production held no test books, authors, series or covers before cataloguing began.
