---
title: 'Story 3.6: [C10] Finna adapter: series, themes and author sort names'
type: 'feature'
created: '2026-10-11'
baseline_revision: 'cb94d0061e46ab5f2c80f3da64e3b5039f0338aa'
status: 'done'
review_loop_iteration: 1
followup_review_recommended: false
context: []
warnings: ['oversized']
deferred:
  - summary: >-
      Series data on a lower-ranked Finna record of the same edition is lost, because ranking ignores series and merge reads one record per candidate.
    evidence: |-
      The ranking is cover, then themes, fixed by story 3.5's AC. Each Finna record is its own candidate, and the series of a library's record without a cover never reaches the top candidate. Collapsing one edition's records from several libraries is already a 3.5 residual risk owned by 3.9 (candidates) or 3.53 (picker).
    location: >-
      src/lib/metadata/sources/finna.ts (finna.lookupByIsbn ranking)
    severity: low
  - summary: >-
      mergeResults fills series and seriesIndex one field at a time, so Finna's series name without a number can be paired with another source's number.
    evidence: |-
      Story 3.6 is the first to emit series without seriesIndex (9789510397077 gives series Bon with no number). merge.ts (3.4) gap-fills each field independently from the first source with a value. No second source emits series yet; 3.7 (Google) and 3.9 (lookup) should merge series and number as a pair.
    location: >-
      src/lib/metadata/merge.ts (FIELDS gap-fill)
    severity: low
---

<intent-contract>

## Intent

**Problem:** The Finna adapter (3.5) emits core fields only. Series, series numbers, Finna's subject terms (themes, FR-17a / D-3) and authors' sort names have to be typed by hand, although the records carry them.

**Approach:** Extend `toResult` in `src/lib/metadata/sources/finna.ts`. Read `series` from the record's `series` list, and `themes` from its `subjects` headings. Give each author Finna's inverted form as `sortName`. Finna's `genres` are not read.

## Boundaries & Constraints

**Always:**
- The 3.5 rules hold: strings are NFC and trimmed, a missing value is left out (`themes` is `[]`), and the adapter never throws.
- `sortName` is `"Family, Given"` from the same Finna name `displayName` reads, with the trailing `(qualifier)` dropped. A name without a comma, or with an empty part, gets no `sortName`.
- `themes` keep Finna's order and Finna's wording, and repeats are dropped. Swedish, English and person-name headings are themes like any other.
- `subjects: []` stays. `raw.finna` is the response body, untouched.

**Never:**
- No theme or subject from `genres`, `majorGenres` or `subjectsExtended`.
- No change to `scripts/capture-fixtures.ts`, its `REPORT.md` or `tests/fixtures`.
- No `sources/index.ts`, merge or lookup changes (3.7, 3.9). No database or Payload value imports in `lib/metadata`. No `console.*`. No test reaches the network.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Numbered series | `9780007447831` (`{name:'A song of ice and fire', additional:'Book 2'}`) | `series:'A song of ice and fire'`, `seriesIndex:2` | — |
| Numbered entry after an unnumbered one | `9789520453589` (`Keltainen pokkari`, then `Keltainen kirjasto` `367`) | `series:'Keltainen kirjasto'`, `seriesIndex:367` | — |
| Trailing dot on the number | `9789518581041` (`Kirjokansi`, `223.`) | `series:'Kirjokansi'`, `seriesIndex:223` | — |
| No number anywhere | `9789510397077` (`Bon`, `WSOY pokkari`, `Bon-pokkarit`, `Bon`) | `series:'Bon'`, no `seriesIndex` | — |
| No series | `9789524035699` | no `series`, no `seriesIndex` | — |
| Themes | `9780007447831` | `themes` is these 13, in order: `Stark (fiktiivinen suku)`, `Lannister (fiktiivinen suku)`, `valtataistelu`, `taistelut`, `juonittelu`, `kosto`, `petos`, `ritarit`, `lohikäärmeet`, `yliluonnolliset olennot`, `sisällissodat`, `kuningaskunnat`, `Westeros (fiktiivinen paikka)` | — |
| Multi-part heading, comma repeat | `9780007447848` | includes `kuningaskunnat Seitsemän kuningaskuntaa`. `Stark` appears once (`["Stark"]` and `["Stark,"]` collapse). 18 themes | — |
| Genre terms untouched | `9789510397077` | `themes` has no `pienoisromaanit` (a `genres` term only). `subjects` is `[]`. `raw.finna` deep-equals the fixture file | — |
| No subjects | `9789524035699` with `subjects` removed from its record | `themes: []` | — |
| Inverted author name | `9789524035699` | `authors:[{name:'Yuval Noah Harari', sortName:'Harari, Yuval Noah'}]` | — |
| No inverted form | `9789524035699` with the author's `name` set to `Homeros` | `authors:[{name:'Homeros'}]`, no `sortName` | — |

</intent-contract>

## Code Map

- `src/lib/metadata/sources/finna.ts`: the adapter from 3.5.
  - The header comment (line 1) says series and themes are 3.6. Update it.
  - `clean`/`cleanIsbd`: lines 75-84.
  - `displayName`: lines 108-113. Already splits `Family, Given (qualifier)`. Reuse its split for `sortName`.
  - `authors`: lines 118-134. Deduplicates by display name; the first occurrence's `sortName` wins.
  - `toResult`: lines 181-204. It sets `subjects: []` and `themes: []`, and drops `undefined` keys.
  - The ranking in `finna.lookupByIsbn`, lines 250-264, scores subjects as `list(record.subjects).length > 0`. It may score `result.themes.length > 0` instead. The same tie test must keep passing.
- `src/lib/metadata/source.ts`: `SourceResult`, already with `series`, `seriesIndex`, `themes` and `authors[].sortName`. Read only.
- `tests/unit/finna.unit.spec.ts`: the 3.5 tests.
  - `serveFixtures(edit)` serves an edited copy of a fixture. Its `Body` type lists only `id` and `subjects`; widen it as the new edits need.
  - The Sapiens `toStrictEqual` (lines 44-65) must gain `sortName`.
  - The all-fixtures loop is at lines 131-149.
- `tests/fixtures/finna/*.json`: 30 recorded responses. Read only. Shapes in the matching records:
  - `series`: `[{name, additional?, issn?}]`. Repeats of one series are common.
  - `subjects`: `string[][]`, one heading per inner list, for example `["Stark,", "suku, (fiktiivinen hahmo)."]` or `["matkat","junat","Moskova","Ulan Bator"]`. Every matching record has subjects.
  - `nonPresenterAuthors[].name`: every author is inverted (`Harari, Yuval Noah`). The only qualifier is on a non-author (`Brunila, Mikael (tutkija)`).
- `scripts/capture-fixtures.ts:231-236`: `finnaSubjects` joins a heading's parts with a space for `REPORT.md`. The adapter's themes follow the same join. The script is not touched.

## Tasks & Acceptance

**Execution:**
- `src/lib/metadata/sources/finna.ts`:
  - Add `sortName` to `authors`.
  - Add `series(record)` returning `{ series?, seriesIndex? }`, and `themes(record)`.
  - Use them in `toResult`.
  - Update the header comment.
- `tests/unit/finna.unit.spec.ts`:
  - Cover every Matrix row and update the Sapiens strict-equal.
  - In the all-fixtures loop, assert that every `sortName` present matches `/^[^,]+, [^,]+$/`, and that `seriesIndex` appears only with `series`.
  - Pin the Design Notes rules the Matrix does not reach, each with one assertion:
    - Through `serveFixtures` edits of `9789524035699` (`helle.1637236`):
      - author name `Harari, Yuval Noah (historioitsija)` gives `[{name:'Yuval Noah Harari', sortName:'Harari, Yuval Noah'}]`
      - a series `{name:'Keltainen kirjasto (sarja)'}` gives `series:'Keltainen kirjasto'`
      - a series `{name:'Sarja', additional:'2,5'}` gives `seriesIndex: 2.5`
    - On the real fixtures:
      - `9789520408053` keeps the theme `Poverty.`
      - the `eepos.302394` result of `9789515789631` (binding `nidottu`) has the theme `minä (fiktiivinen hahmo)`
  - The no-subjects Matrix row removes `subjects` from every record of the body, so the asserted record does not depend on the ranking.

**Acceptance Criteria:**
- Given the change, when `npm run test:unit`, `npm run lint` and `npm run typecheck` run, then all pass, and `git status --short src/migrations src/payload-types.ts tests/fixtures scripts` is empty.

## Spec Change Log

### 2026-10-11 — Review pass 1 (bad_spec)
- **Triggers:**
  - edge 2 / blind 1: themes keep inner MARC commas. The `eepos.302394` record of `9789515789631` gave `minä, (fiktiivinen hahmo)`, beside `minä (fiktiivinen hahmo)` and `Stark (fiktiivinen suku)` in other records.
  - edge 6 / blind 7: a series named `Keltainen kirjasto (sarja)`, in jykdok records of `9789520410650` and `9789520436322`, would be emitted with its qualifier.
- **Amended:**
  - Design Notes, Themes: `cleanIsbd` runs on each part before the join, not on the joined text.
  - Design Notes, Series: the trailing `(…)` qualifier is dropped.
  - Tasks: added assertions for the qualifier rules, the kept `.`, the comma decimal, and the `minä` merge. The no-subjects row now removes `subjects` from every record.
- **Known-bad state avoided:**
  - Theme filter values that differ from the same heading in other records only by MARC punctuation.
  - A duplicate series created for a qualified series name.
- **KEEP:** the first attempt was right everywhere else. Re-derive it the same way:
  - `nameParts()` shared by `displayName` and `sortName`
  - `authors()` deduplicating through a `Map`, so the first occurrence's `sortName` wins
  - `series()` returning `Pick<SourceResult, 'series' | 'seriesIndex'>`, spread into `toResult`
  - ranking on `result.themes.length > 0`
  - the test helper `record(body, id)` and the widened `Body` type
  - the `it.each` series cases with `not.toHaveProperty` checks
  - the exact themes list for `9780007447831`
  - the Sapiens strict-equal with its 9 themes and `sortName`
  - the all-fixtures `sortName` and `seriesIndex` checks

## Review Triage Log

### 2026-10-11 — Review pass 1

The pass looped back on `bad_spec` (see Spec Change Log). Rows routed `patch` were folded into the amended Tasks, so the re-derivation includes them.

- **verdicts:** 26 findings. High 0, medium 0, low 11, false 15, maybe-false 0.
- **findings:**

Blind review:

- `[low]` `[bad_spec]` **(blind 1) Leftover punctuation inside themes.**
  - Real part: inner MARC commas survive, for example `Stark, suku, (fiktiivinen hahmo)` and `minä, (fiktiivinen hahmo)`.
  - Not real: the "three or four Stark tags". System themes are a text field on the Book (D-3), not tag records, and the Answer marks only new authors and series.
  - Amendment: `cleanIsbd` runs per part. The trailing `.` stays (see Design Notes).
- `[false]` `[reject]` **(blind 2) Genre terms come through `subjects`.** The AC keeps Finna's `genres` field out of themes. A term Finna lists under `subjects` is a subject term, and FR-17a takes those as given. The test asserts exactly that the `genres` field is not read.
- `[false]` `[reject]` **(blind 3) Joined chains give over-specific themes.** The intent contract's Matrix requires the joined form (`kuningaskunnat Seitsemän kuningaskuntaa`), and FR-17a says "as given". Themes are not tags, so no unused tag records arise.
- `[false]` `[reject]` **(blind 4) Swedish and Finnish duplicates.** The intent contract keeps Swedish headings as themes ("as given"). No tags are created from themes.
- `[false]` `[reject]` **(blind 5) Person-name headings with dates.** The intent contract says person-name headings are themes like any other. `Auvinen, Suvi, 1984-` is the heading as given.
- `[false]` `[reject]` **(blind 6) Unnumbered series such as `Bon` and `Like-pokkari` are emitted.** The AC returns series "where the record has them", and these records do. The comment's imprint reasoning only orders a numbered entry first.
- `[low]` `[bad_spec]` **(blind 7) Series names keep a `(sarja)` qualifier.** No matching fixture record has one, but jykdok records of the same works do. Amendment: drop a trailing `(…)` from series names. Grouped with edge 6.
- `[low]` `[defer]` **(blind 8) Ranking ignores series, so series data on lower-ranked Finna records is lost.** The cover-then-subjects ranking is fixed by 3.5's AC. Collapsing one edition's records from several libraries into one candidate is 3.9's or 3.53's job, as already noted in 3.5's residual risks.
- `[low]` `[patch]` **(blind 9) The no-subjects test depends on the edited record still ranking first.** Folded into Tasks: remove `subjects` from every record.
- `[low]` `[reject]` **(blind 10) `record()` uses a non-null assertion.** The fixtures are committed and are refreshed only on purpose. A missing id fails the test loudly anyway, and the guard adds a branch to a test helper.

Edge cases:

- `[false]` `[reject]` **(edge 1) Trailing `.` on themes makes duplicate tags.** Themes are not name-matched tag records. The `.` is Finna's given form, and stripping it would cut initials such as `R. R.`.
- `[low]` `[bad_spec]` **(edge 2) Inner heading parts keep trailing commas.** Grouped with blind 1. `9789515789631` has both `minä,` and `minä` with the same qualifier.
- `[false]` `[reject]` **(edge 3) Person-name subject with life dates.** As blind 5: the intent contract keeps person-name headings as given.
- `[low]` `[reject]` **(edge 4) A string-shaped `subjects` heading is dropped.** All headings in the 30 fixtures are arrays, and Finna's API returns `subjects` as a list of lists. Handling it adds a branch for a shape not seen.
- `[false]` `[reject]` **(edge 5) Case-only or dot-only repeats create two tag spellings.** Themes create no tags. Case-only repeats do not occur within a record in the fixtures.
- `[low]` `[bad_spec]` **(edge 6) Series qualifier `(sarja)`.** Grouped with blind 7.
- `[low]` `[reject]` **(edge 7) `additional` with a range or year (`1-2`, `1997:3`).** Every `additional` in the fixtures is a plain number, with or without `book`. An anchored pattern adds complexity and risks losing forms such as `nro 5`.

Verification gaps:

- `[low]` `[patch]` **(VG 1) Dropping the qualifier from `sortName` is never exercised.** Folded into Tasks: the `Harari, Yuval Noah (historioitsija)` edit.
- `[low]` `[patch]` **(VG 2) The kept trailing `.` is unpinned.** Folded into Tasks: `9789520408053` keeps `Poverty.`.
- `[low]` `[patch]` **(VG 3) The comma decimal series number is untested.** Without the replace, `2,5` would emit `seriesIndex: NaN`. Folded into Tasks: the `2,5` edit.
- `[false]` `[reject]` **(VG other) No `Number.isFinite` check on the series number.** The regex only matches digits, with an optional `[.,]` followed by digits. After the comma becomes a dot, `Number()` always gives a finite number.

Intent alignment:

- `[false]` `[reject]` **(intent 1) "Subject terms" read as joined headings, not single terms.** Splitting would emit qualifier fragments such as `(fiktiivinen suku)` as themes of their own. The joined heading is Finna's subject as given, and it is the form the 3.2 report used.
- `[false]` `[reject]` **(intent 2) The "without themes" and "without inverted name" cases use edited fixtures.** No real fixture lacks them. The edited bodies are recorded responses, and nothing reaches the network.
- `[false]` `[reject]` **(intent 3) The ranking change was not asked for.** The spec allows it, it is equivalent on the fixtures, and the tie test passes.
- `[false]` `[reject]` **(intent 4) No commit or sprint-status update.** Finalisation does both.
- `[false]` `[reject]` **(intent 5) There is no user-visible outcome yet.** The story is scoped to the adapter. Lookup, the Answer and saving are later stories.

### 2026-10-11 — Review pass 2

- **verdicts:** 25 findings. High 0, medium 1, low 11, false 13, maybe-false 0.
- **findings:**

Intent alignment:

- `[false]` `[reject]` **(intent 1) Joined headings instead of single terms.** Carried from pass 1, intent 1. The code still joins the parts of a heading.
- `[false]` `[reject]` **(intent 2) Partly normalised, not strictly "as given".** The intent contract keeps Finna's wording. Commas that close a MARC part and the `(sarja)` qualifier are encoding, not wording. The `.` and life dates stay, per the contract's person-name rule.
- `[false]` `[reject]` **(intent 3) The spine puts "a source's own categories" in `subjects`, but Finna `genres` go nowhere.** The story's AC says Finna's genre terms "stay in the raw response untouched". The epic context names Google's categories as the stored subjects.
- `[false]` `[reject]` **(intent 4) "Without" cases use edited fixtures.** Carried from pass 1, intent 2.
- `[false]` `[reject]` **(intent 5) The ranking key changed.** Carried from pass 1, intent 3.
- `[false]` `[reject]` **(intent 6) The series pick is the diff's own heuristic.** The AC returns series "where the record has them". Picking among several entries is a Design Notes choice, tested on `9789520453589`.
- `[low]` `[defer]` **(intent 7) Series data on lower-ranked records is lost.** Carried from pass 1, blind 8. It is already in `deferred`.
- `[false]` `[reject]` **(intent 8) No commit or sprint-status update.** Carried from pass 1, intent 4.
- `[false]` `[reject]` **(intent 9) The user-visible outcome is not reached.** Carried from pass 1, intent 5.

Verification gaps:

- `[low]` `[defer]` **(VG other) Merge can pair Finna's series name with another source's number.** `mergeResults` fills `series` and `seriesIndex` one field at a time (3.4). This story is the first to emit `series` without `seriesIndex`. No second source emits series yet. Grouped with blind 3. Deferred to 3.7/3.9.

Blind review:

- `[low]` `[reject]` **(blind 1) A later inverted form of a duplicate author loses its `sortName`.** In all 30 fixtures, every person in `nonPresenterAuthors` is inverted. Merging the later form adds a branch for a case not seen.
- `[low]` `[reject]` **(blind 2) `nameParts` drops a third comma part (`Jr.`, dates) and keeps an inner qualifier.** No author name in the fixtures has a third part or a qualifier before a comma. The split is 3.5's `displayName`, unchanged. Parsing suffixes adds complexity.
- `[low]` `[defer]` **(blind 3) Merge can pair series and number from different sources.** Grouped with VG other.
- `[false]` `[reject]` **(blind 4) The all-fixtures checks cannot fail and miss the punctuation bug class.** These are invariants, not proofs. The verification-gap layer traced that each regression of the qualifier, punctuation and decimal rules fails a focused test.
- `[false]` `[reject]` **(blind 5) The `themes()` doc example does not match the data.** `["Stark,", "suku, (fiktiivinen hahmo)."]` is the real heading of `helle.691753` in `9780007447855.json`.
- `[low]` `[patch]` **(blind 6) A series qualifier followed by a full stop is kept.** Not seen in the fixtures, but the fix is one regex. Fix sent: the series qualifier strip tolerates one trailing `.`.

Edge cases:

- `[medium]` `[patch]` **(edge 1) Preliminary records append `ENNAKKOTIETO` to every heading.** There are 148 such headings in jykdok records of `9789520408053` and others, all on other editions today. A new book whose best Finna record is preliminary would store themes like `Ranska ENNAKKOTIETO` on the shared Book. A re-fetch fills only empty fields, so they would stay. Fix sent: drop an `ENNAKKOTIETO` part before the join, with a test.
- `[false]` `[reject]` **(edge 2) The form subdivision `fiktio.` stays in themes.** It is part of Finna's heading. The intent contract keeps Finna's wording and person-name headings.
- `[false]` `[reject]` **(edge 3) Person-name subjects stay inverted and dated.** Carried from pass 1, edge 3.
- `[false]` `[reject]` **(edge 4) Case-only and dot-only repeats.** Carried from pass 1, edge 5.
- `[low]` `[reject]` **(edge 5) A string-shaped heading is dropped.** Carried from pass 1, edge 4.
- `[low]` `[reject]` **(edge 6) Three or more comma parts in a name.** Grouped with blind 2.
- `[low]` `[reject]` **(edge 7) A duplicate author first uninverted, later inverted.** Grouped with blind 1.
- `[low]` `[reject]` **(edge 8) `additional` with several numbers.** Carried from pass 1, edge 7.
- `[low]` `[patch]` **(edge 9) A series name ending in a full stop.** Grouped with blind 6.

## Design Notes

**Series.** Pick the first `series` entry whose `additional` holds a number. If no entry has one, take the first entry. A numbered entry is the series the book sits in. An unnumbered entry first in the list is usually a paperback imprint (`Keltainen pokkari`). `series` is `cleanIsbd(name)` with a trailing `(…)` qualifier dropped, as for person names: `Keltainen kirjasto (sarja)` gives `Keltainen kirjasto`. Otherwise the qualified form would become its own series at name matching. `seriesIndex` is the first number in `additional` (`/\d+(?:[.,]\d+)?/`, comma read as a dot), so `book 5.` gives 5 and `2,5` gives 2.5. An entry without a name is skipped.

**Themes.** For each `subjects` heading, apply `cleanIsbd` to each string part, drop empty parts, and join the rest with a single space. Then drop empty and repeated results, keeping first-seen order. The space join is the form the 3.2 report showed as "Finna subjects (themes)".

`cleanIsbd` per part removes the MARC separators that close each part (`/ : ; = ,`), and leaves Finna's wording alone. Examples:
- `["Stark,"]` gives `Stark`, the same as `["Stark"]`.
- `["minä,", "(fiktiivinen hahmo)"]` gives `minä (fiktiivinen hahmo)`, the same form as `Stark (fiktiivinen suku)` elsewhere.
- `["Stark,", "suku, (fiktiivinen hahmo)."]` gives `Stark suku (fiktiivinen hahmo).`

A trailing `.` stays, for two reasons:
- MARC and MeSH terms such as `Poverty.` are given that way (FR-17a: "as given").
- Stripping it would cut initials in person headings (`Martin, George R. R.`).

**sortName.** Split as `displayName` does: drop a trailing `(…)`, then split on `,`. With non-empty `family` and `given`, `sortName` is `` `${family}, ${given}` ``, cleaned. The spine says an adapter passes the source's inverted form when it has one. A derived sort name for uninverted names is `sortNameField`'s job (3.13).

## Verification

**Commands:**
- `npm run test:unit`: all pass.
- `npm run lint`: no errors.
- `npm run typecheck`: no errors.
- `git status --short src/migrations src/payload-types.ts tests/fixtures scripts`: empty.

## Auto Run Result

Status: done

**Summary.** `finna.lookupByIsbn` now fills in what core fields left out.

- **Series.** From the record's `series` list: the first entry with a number in `additional`, else the first entry.
  - The name loses MARC punctuation and a trailing `(…)` qualifier, also before a full stop. `Keltainen kirjasto (sarja)` gives `Keltainen kirjasto`.
  - The number is the first number in `additional`. `book 5.` gives 5, and `2,5` gives 2.5.
- **Themes.** From `subjects`. Each heading's parts lose their closing MARC separator. A `(qualifier)` inside a part counts as a part of its own. A preliminary record's `ENNAKKOTIETO` part is dropped. The parts are joined with a space, and repeats are dropped in Finna's order.
  - Examples: `Stark (fiktiivinen suku)`, `kuningaskunnat Seitsemän kuningaskuntaa`, `Poverty.`.
  - `genres`, `majorGenres` and `subjectsExtended` are not read. `subjects` stays `[]`, and `raw.finna` is the untouched body.
- **Author sort names.** Each author gets Finna's inverted form as `sortName`, `Family, Given`, with the qualifier dropped. A name without a comma gets none.
- **Ranking.** Cover first, then non-empty `themes`.

The first review pass looped back once (`bad_spec`):
- Inner MARC commas were left in themes.
- A `(sarja)` qualifier was left on series names.

The spec's Design Notes were amended, and the code was re-derived with the attempt's structure kept. The second pass patched two findings: the `ENNAKKOTIETO` mark and a qualifier before a full stop.

**Files changed.**
- `src/lib/metadata/sources/finna.ts`: `nameParts`/`sortName`, `series()`, `themes()`, the ranking key and the header comment.
- `tests/unit/finna.unit.spec.ts`: covers every Matrix row and each Design Notes rule (qualifiers, comma decimal, kept `.`, `minä` merge, `ENNAKKOTIETO`). The all-fixtures loop checks `sortName` shape and that `seriesIndex` comes with `series`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`: story 3.6 `done`.

**Review findings.** Pass 1 had 26 findings and pass 2 had 25. Each finding has its own row in the Review Triage Log.
- **Pass 1 bad_spec:**
  - blind 1 / edge 2: themes cleaned per part
  - blind 7 / edge 6: series qualifier dropped

  Its patch rows (VG 1–3, blind 9) were folded into the amended Tasks and are in the code.
- **Pass 2 patched:**
  - edge 1 (`medium`): `ENNAKKOTIETO` dropped from themes
  - blind 6 / edge 9 (`low`): series qualifier before a full stop
- **Deferred (2, both `low`, in frontmatter):**
  - series on lower-ranked records of one edition (3.9/3.53)
  - merge pairing series and number from different sources (3.7/3.9)
- **Rejected, false.** The finding misread the model or the intent: themes are a text field on the Book, not tags; FR-17a and the intent contract keep headings as given (joined chains, Swedish terms, person headings, form subdivisions, the trailing `.`); genre terms listed under `subjects` are subject terms; the all-fixtures invariants; the doc example; the ranking key, edited fixtures and process items.
- **Rejected, low.** Unseen in 30 fixtures, with a fix that adds branches:
  - string-shaped headings
  - several numbers in `additional`
  - third comma parts in names (`Jr.`, dates)
  - a duplicate author first uninverted
  - the `record()` non-null assertion

**Follow-up review recommendation:** false. Pass 2 patched high 0, medium 1, low 1. Pass 1 routed bad_spec, with no patches.

**Verification.**
- `npm run test:unit`: 25 files, 406 tests pass, 65 of them in `finna.unit.spec.ts`.
- `npm run lint`: 0 errors. The 8 warnings were already there, in old migrations.
- `npm run typecheck`: exit 0.
- Prettier is clean on both touched files.
- `git status --short src/migrations src/payload-types.ts tests/fixtures scripts`: empty.
- Matrix audit: every row has a passing test.

**Residual risks.**
- Themes are Finna's headings as given, so the theme filter will hold:
  - compound headings
  - Swedish twins of Finnish terms
  - person headings in catalogue form (`Auvinen, Suvi, 1984-`)

  If that proves noisy in use, it is an intent change to FR-17a, not a parser bug.
- An unnumbered first series entry is emitted as the series. This includes imprints such as `Bon` and `Like-pokkari`, which will become series records on save.
- The two deferred merge and ranking items above.
- The spec's Code Map line anchors describe the baseline file, not the result.

