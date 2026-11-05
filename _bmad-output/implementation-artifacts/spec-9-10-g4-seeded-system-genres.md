---
title: '[G4] Seeded system genres'
type: 'feature'
created: '2026-11-05'
status: 'done'
baseline_revision: 'a98453b36cde03f66514821096fc011f1f794bf4'
review_loop_iteration: 0
followup_review_recommended: false
context: []
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** `genres` is empty, so no book can carry a system genre and Edit book's genre options and the Genre filter have nothing to list (FR-17, D-2).

**Approach:** A data-only migration seeds Google Books' top-level category vocabulary as system genres with Finnish names. English names are Google's category strings verbatim, so Story 9.11 matches them by `nameKey`.

## Boundaries & Constraints

**Always:** `name` is the Google category string verbatim (including `&`); `name_key` is `toNameKey(name)` (lower-case, NFC, collapsed spaces). Re-running the migration changes nothing about existing rows except filling a missing `name_fi`. `genreName()` is unchanged.

**Never:** No schema change, no `payload-types.ts` change. No overwriting an existing `name` or non-empty `name_fi`. No seeding in app code, scripts or `onInit`. No genre mapping on save (Story 9.11).

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Fresh database | `genres` empty | One row per vocabulary entry with `name`, `name_fi`, `name_key` | No error expected |
| Genre already present | A row with the same `name_key` (any case of the name), `name_fi` null | Row kept as is, `name_fi` filled from the seed | No error expected |
| Admin-edited | Same `name_key`, `name_fi` = "Oma" | Row untouched | No error expected |
| Re-run | Migration applied twice | Same row count, no duplicates | No error expected |

</intent-contract>

## Code Map

- `src/collections/Genres.ts` -- `name`, `nameFi`, unique `nameKey`; table `genres` (`name`, `name_fi`, `name_key`, unique index `genres_name_key_idx`).
- `src/fields/nameKey.ts` -- `toNameKey()`: the key the seed must equal (all seed names are plain ASCII, so lower-casing is enough in SQL).
- `src/lib/books/genreName.ts` -- Finnish name when set, else English; the "show in Finnish" AC rests on it.
- `src/migrations/20261104_151042_tags.ts`, `src/migrations/index.ts` -- latest migration and the registry to extend.
- `tests/int/tagsMigration.int.spec.ts` -- pattern for calling a migration's `up` inside a rolled-back transaction.

## Tasks & Acceptance

**Execution:**
- `src/migrations/20261105_090000_seed_system_genres.ts` -- `up` inserts the vocabulary below with `ON CONFLICT (name_key) DO UPDATE SET name_fi = EXCLUDED.name_fi WHERE genres.name_fi IS NULL OR btrim(genres.name_fi) = ''`; `down` deletes only seeded rows that no book uses and whose names still equal the seed -- migration history needs a down, and used genres must survive.
- `src/migrations/index.ts` -- register the migration.
- `tests/int/seededGenres.int.spec.ts` -- one test: `up` on top of the migrated database is a no-op for existing rows, fills a missing `name_fi`, keeps an edited one, and `genreName()` of a seeded row in `fi` is Finnish (AC names idempotence).

**Vocabulary (English = Google category; Finnish for Mika's review):**
Antiques & Collectibles = Antiikki ja keräily; Architecture = Arkkitehtuuri; Art = Taide; Bibles = Raamatut; Biography & Autobiography = Elämäkerrat ja omaelämäkerrat; Body, Mind & Spirit = Keho, mieli ja henki; Business & Economics = Liike-elämä ja talous; Comics & Graphic Novels = Sarjakuvat ja graafiset romaanit; Computers = Tietotekniikka; Cooking = Ruoanlaitto; Crafts & Hobbies = Käsityöt ja harrastukset; Design = Muotoilu; Drama = Näytelmät; Education = Kasvatus ja koulutus; Family & Relationships = Perhe ja ihmissuhteet; Fiction = Kaunokirjallisuus; Foreign Language Study = Vieraiden kielten opiskelu; Games & Activities = Pelit ja leikit; Gardening = Puutarhanhoito; Health & Fitness = Terveys ja kunto; History = Historia; House & Home = Koti ja asuminen; Humor = Huumori; Juvenile Fiction = Lasten ja nuorten kaunokirjallisuus; Juvenile Nonfiction = Lasten ja nuorten tietokirjat; Language Arts & Disciplines = Kielitiede ja kirjoittaminen; Law = Oikeustiede; Literary Collections = Kirjallisuuskokoelmat; Literary Criticism = Kirjallisuudentutkimus; Mathematics = Matematiikka; Medical = Lääketiede; Music = Musiikki; Nature = Luonto; Performing Arts = Esittävät taiteet; Pets = Lemmikit; Philosophy = Filosofia; Photography = Valokuvaus; Poetry = Runous; Political Science = Valtio-oppi; Psychology = Psykologia; Reference = Hakuteokset; Religion = Uskonto; Science = Luonnontieteet; Self-Help = Oman elämän kehittäminen; Social Science = Yhteiskuntatieteet; Sports & Recreation = Urheilu ja vapaa-aika; Study Aids = Opiskeluoppaat; Technology & Engineering = Tekniikka; Transportation = Liikenne ja kuljetus; Travel = Matkailu; True Crime = Tositarinat rikoksista; Young Adult Fiction = Nuortenkirjallisuus; Young Adult Nonfiction = Nuorten tietokirjat.

**Acceptance Criteria:**
- Given a migrated database, when the migration has run, then every vocabulary entry exists as a system genre with `name` and `nameFi`.
- Given a seeded genre, when `genreName()` is called with `fi`, then the Finnish name returns, and with `en` the English one.
- Given genres already present with the same name key, when the migration runs again, then no duplicate appears and no existing name or non-empty Finnish name changes.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 20 findings — high 0, medium 0, low 3, false 7, maybe-false 0 (10 rejected as test-only or out of scope below)
- findings:
  - `[low]` `patch` Seed presence and `toNameKey` equality unasserted (edge-case, verification-gap, blind x2: count >= length, ASCII comment) — test now checks every seed row's name, name_fi and `toNameKey` key.
  - `[low]` `reject` `down` only guards `books_rels` (edge-case, blind) — the other referencing table, `payload_locked_documents_rels`, cascades; no data lost.
  - `[low]` `reject` `down` skips seed rows whose `name_fi` was nulled (edge-case) — an edited row is deliberately kept.
  - `[low]` `reject` `down` untested (verification-gap, blind) — no AC names it; CLAUDE.md rejects test-only findings.
  - `[low]` `reject` blank `name_fi` branch untested (edge-case, verification-gap, blind) — same reason.
  - `[false]` `reject` Import `toNameKey` in migration (edge-case) — a migration stays frozen; the test now guards equality.
  - `[false]` `reject` Blank name_fi overwritten (edge-case claim) — the spec states it.
  - `[false]` `reject` No system marker on rows (blind, intent-alignment) — `genres` is system-only by AD-4; there is no owner column.
  - `[false]` `reject` Google category to seed mapping missing (blind) — Story 9.11.
  - `[false]` `reject` No UI surface tested for Finnish (intent-alignment) — `genreName()` is the named surface; consumers predate this story.
  - `[false]` `reject` Finnish names are drafts (blind, intent-alignment) — recorded below for Mika's review.
  - `[false]` `reject` `bookeh_test` might be pushed (verification-gap) — `scripts/test-db.ts` refuses a pushed DB.

## Verification

**Commands:**
- `npm run test:reset && npm run test:int` -- expected: all pass on a database built by migrations
- `npm run typecheck` and `npm run lint` -- expected: clean

**Manual checks (if no CLI):**
- Finnish names are a draft for Mika's review before release; the migration is not yet applied to production.

## Auto Run Result

Status: done

**Summary:** Data-only migration seeds 52 Google Books top-level categories as system genres with draft Finnish names; re-runs fill only a missing `name_fi`.

**Files:** `src/migrations/20261105_090000_seed_system_genres.ts` (seed, `up`/`down`), `src/migrations/index.ts` (registry), `tests/int/seededGenres.int.spec.ts` (idempotence, seed content, `genreName()`).

**Review:** 1 patch (low) applied, 0 deferred, rest rejected with reasons in the Triage Log. Follow-up review not recommended.

**Verification:** `npm run test:reset && npm run test:int` 763 passed; typecheck and lint clean; patched test re-run passes.

**Residual risks:** The Finnish names are a draft and need Mika's review before release (AC: "reviewed by Mika"); fixing one later takes a UI edit or a new migration, since re-runs never overwrite a non-empty name. Not applied to production. No screen was added or changed, so no Playwright walk.
