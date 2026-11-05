---
title: '9.6 G14 Genres, themes and tags on Book detail'
type: feature
created: '2026-11-05'
status: done
baseline_revision: 44b10ce0e3ea04e1af0bb2dedba1e0785bd30a70
review_loop_iteration: 0
followup_review_recommended: false
context:
  - /Users/mika/development/bookeh/CLAUDE.md
  - /Users/mika/development/bookeh/_bmad-output/implementation-artifacts/epic-9-context.md
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Book detail shows only system genres, leaving system themes and the viewer's private classifications invisible.

**Approach:** Show nonempty system genres, my genres, system themes, my themes and my tags groups as existing Filter chips. Each chip adds its classification to collection filters through the existing navigation behavior.

## Boundaries & Constraints

**Always:** Private labels are assigned to the viewer's Book state, shared across copies, and remain private including for admins. Missing state means no private labels. Use the localized system genre name already provided by EffectiveBook (Finnish with English fallback); private names and theme strings remain as stored. System genres use numeric genre values, private genres `tag:<id>`, themes use their names and ordinary tags numeric tag values. Preserve existing filters, search and sort on the collection, append rather than toggle, keep the wide Book open and close the phone sheet. From other sections navigate to the collection with only the selected filter. Omit empty kinds and keep classification before Description/source actions/the foot. Use existing tokens, FilterChip and translation patterns. Run an ignored fixture Playwright acceptance walk and record observations.

**Never:** Add pickers, mutations, schema changes, Settings, permanent browser tests or development-data changes. Do not override shared classification or expose another user's labels.

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx` — async shared detail content for phone sheet/wide panel; gates through heldBook, reads getUserBookState, currently renders system genres immediately before Description. Add separate nonempty groups here using existing section and joined chip pattern.
- `src/lib/books/userBookState.ts` — currently returns read/rating only, with depth 0. Extend to UserBookState with assigned tags populated or explicitly scoped through the gateway; enforce viewer ownership even on malformed references/admin reads. Missing/unpopulated or foreign labels are omitted; no state means tags empty. Preserve read/rating defaults.
- `src/lib/books/effectiveBook.ts` — UserBookState already declares tags with id/name/kind; EffectiveBook genres are localized via genreName using ctx.user.language. Reuse these shapes and update stale reader comments if touched.
- `src/collections/UserBooks.ts`, `Tags.ts`, `src/access/owner.ts` — owner-scoped collections and relationship guards. No schema changes.
- `src/app/(frontend)/(sections)/FilterChip.tsx` — generic ListedValue prop, existing append/sheet/wide/off-collection routing should work unchanged once theme allowed.
- `src/app/(frontend)/(sections)/filterToggle.ts` — ChipField currently author/series/genre/location/tag; add theme. addFilter already handles string and number values without removing a selected value.
- `src/lib/shelf/query.ts` — centralized URL codec already supports numeric/tag-prefixed genres, numeric tags and string themes (9.4/9.5); no contract extension required.
- `messages/en.json`, `messages/fi.json` — detail.genres exists; add headings for My genres, Themes, My themes and My tags with Finnish translations following existing wording.
- `tests/helpers/collectionPage.ts` — mocks getUserBookState with only read/rating; make assigned classifications configurable for surface tests, default empty.
- `tests/unit/bookDetail.unit.spec.ts`, `filterChip.unit.spec.ts`, `filterToggle.unit.spec.ts` — existing rendered detail and navigation tests; extend for all classification kinds, omission and append/navigation behavior.
- `tests/int/userBooks.int.spec.ts` and existing state/effectiveBook suites — reuse real database harness for reader owner isolation/defaults, including admin and malformed foreign relations where supported. Read existing fixtures before choosing the focused suite.
- `playwright.config.ts`, ignored `tests/e2e/theme-filter.walk.spec.ts` — fixture e2e server, bookeh_test-only setup and cleanup pattern. Add ignored `tests/e2e/book-classification.walk.spec.ts` covering actual detail chip navigation at both widths.
- Installed Next.js `node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md` — read before frontend edits; preserve server reads/client serializable chip props.
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story 9-6 status.

- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:458` — getUserBookState currently documents a read/rating-only return; update to UserBookState in the same commit (CLAUDE.md contract rule).

## Tasks & Acceptance

**Execution:**
- [x] Architecture spine — update getUserBookState return contract to include assigned private labels.
- [x] State reader and focused database test — return viewer-owned assigned labels with read/rating and safe defaults.
- [x] BookDetail, ChipField and translations — render all five nonempty classification kinds as typed filter chips.
- [x] Existing detail/navigation suites — verify displayed labels, absent empty groups and correct append/navigation.
- [x] Ignored browser walk, this spec and sprint-status — verify integrated fixture behavior, record evidence and completion.

**Acceptance Criteria:**
- Given the expanded state reader, when checking the architecture spine shared signatures, then getUserBookState documents its full UserBookState return in this same story.
- Given a held Book with all five classification kinds and duplicate copies, when detail opens at either width, then system genres, my genres, system themes, my themes and my tags appear once per Book in distinct nonempty groups before Description, using the localized system genre names with English fallback.
- Given missing Book state or empty classifications, when detail opens, then absent kinds have no heading/chips and the remaining detail behavior stays intact.
- Given assigned own and malformed foreign tags, when state is read as a user or admin, then only the viewer's assigned owned labels are returned with their kind; another user's state/labels remain private and missing state returns unread, unrated and no tags.
- Given existing collection filters/search/sort and a classification chip, when tapped, then its correctly encoded value appends to that field without removing existing selections or duplicating an already-selected value; other fields remain, wide detail stays open and phone detail closes.
- Given detail opened from loans or wishlists, when tapping a classification chip, then collection opens with that filter and no open Book, preserving established section navigation.

## Spec Change Log

## Review Triage Log

### 2026-11-05 — Review pass
- verdicts: 12 observations — high 0, medium 0, low 4, false 8, maybe-false 0
- findings:
  - `[false]` `[reject]` Blind: null relationship crashes the state reader — installed Payload relationshipPopulationPromise filters nulls from hasMany arrays before returning; unreadable tag targets remain numeric ids and are omitted. Tags has no custom population hook that introduces nulls. The reported input does not reach this reader.
  - `[low]` `[patch]` Blind: duplicate stored system themes produce repeated chips/keys — deduplicate exact theme strings before rendering; focused detail regression now asserts unique chips with valid names unchanged.
  - `[low]` `[reject]` Blind: differently capitalized selected themes can be added twice — existing theme URL/selection contract retains exact strings (9.5 review); case-insensitive matching remains correct. Manually supplied alternate capitalization is negligible and adding a comparison policy is not justified.
  - `[false]` `[reject]` Blind: privacy requires a mock with a populated foreign tag — gateway and ownerAccess prevent foreign tag objects from being populated, including for admins. The real database test inserts malformed foreign relations and verifies absence for both roles, directly guarding the privacy criterion. A mocked unreachable population bypass would mirror the additional defensive check without protecting another reachable behavior.
  - `[low]` `[patch]` Blind: partial classification omission lacked focused coverage — added one parameterized detail case for each missing private kind, retaining all other groups and asserting both headings and links.
  - `[false]` `[reject]` Blind: localization lacks real-reader evidence — existing effectiveBook integration tests assert Finnish names and English reader output, and genreName unit tests cover missing/blank Finnish fallback. Detail renders those names directly. Parent ran both existing suites alongside this story's surface checks.
  - `[low]` `[patch]` Edge: blank stored system themes render unnamed links — omit empty/whitespace-only system themes before mapping. Same rendering-input cause as duplicate themes; focused regression covers both.
  - `[false]` `[reject]` Intent: diff alone cannot establish workflow retry — invocation and tool history establish the rendered workflow execution; the previous Git failure was resolved through approved escalation. Product files need not encode tool history.
  - `[false]` `[reject]` Intent: original story is absent from reviewer context — parent read epics.md Story 9.6 (G14), which explicitly requires these five kinds as filter chips with empty kinds omitted. The spec and implementation implement that original acceptance.
  - `[false]` `[reject]` Intent: product expectations versus tested surfaces — rendered detail, actual database owner isolation, codec/navigation tests and the actual fixture browser walk jointly exercise the required behavior. No divergence was identified.
  - `[false]` `[reject]` Intent: browser walk implementation absent from tracked diff — deliberate project convention requires an ignored walk. Parent inspected the walk, reran it and inspected the desktop screenshot; observations are recorded here.
  - `[false]` `[reject]` Intent: review status and no commit message yet — correct intermediate review state. Finalization below marks done and creates a conventional commit containing 9.6, then verifies a clean tree.

## Verification

- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run typecheck` — passes.
- `npm run test:unit -- tests/unit/bookDetail.unit.spec.ts tests/unit/filterChip.unit.spec.ts tests/unit/filterToggle.unit.spec.ts` — passes; run any other touched state suites.
- `npm run test:int -- tests/int/userBooks.int.spec.ts` — passes; if reader coverage uses another focused suite, record and run it too.
- Scoped ESLint for changed TypeScript and `git diff --check` — passes.
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run test:e2e -- tests/e2e/book-classification.walk.spec.ts --reporter=line` — fixture browser walk passes; remain ignored and record observations under Auto Run Result.

## Auto Run Result

Implemented the full viewer-owned `UserBookState` reader, all five nonempty classification groups, theme chip typing and English/Finnish headings. Updated the spine reader signature and existing state mocks/assertions.

Verification on 2026-11-05:
- Typecheck passed with the specified SWC cache.
- Focused unit suites passed: Book detail, FilterChip, filterToggle and loans page (59 tests).
- Integration suites passed: userBooks and setRating (11 tests), including actual malformed foreign tag relations omitted for both ordinary user and admin, missing state defaults and private state isolation.
- Scoped ESLint and `git diff --check` passed.
- Ignored `tests/e2e/book-classification.walk.spec.ts` passed against fixture server and `bookeh_test` (Chromium, 9.8s). It remains ignored. At 1300px and 390px all five groups appeared once despite duplicate copies; chips encoded private genre/tag values correctly. A private theme appended alongside an existing theme while preserving search, sort and direction; the wide detail remained open, repeated selection stayed unique, and the phone sheet closed. Screenshots: `/private/tmp/bookeh-classification-1300.png` and `/private/tmp/bookeh-classification-390.png`. Temporary database records were removed in `finally`; development data was untouched.

Status: done

Files changed:
- BookDetail.tsx: all five classification groups, blank/duplicate system-theme cleanup and existing filter-chip navigation.
- filterToggle.ts: permits text theme chips.
- userBookState.ts and effectiveBook.ts: full viewer-owned assigned-label state and current type documentation.
- English/Finnish message files: classification headings.
- collectionPage helper and detail/chip/toggle/loans unit suites: state defaults, classification display/omission and navigation.
- userBooks and setRating integration suites: reader owner isolation, malformed foreign assignment filtering and expanded-state regressions.
- Architecture spine: full state-reader signature.
- This spec and sprint-status.yaml: implementation, review, verification and completion.

All four review layers completed. Platform capacity allowed three concurrent reviewers; the fourth started as soon as a slot freed. Twelve observations were individually triaged above. Two low patch groups (three observations) were fixed: theme input cleanup and independent omission coverage. No high/medium patches or deferrals; eight false observations and one negligible case-variant finding were rejected with recorded evidence. Verification-gap reviewer found no gaps. Follow-up review recommendation: false; no specific unverified implementation risk remains.

Parent verification after review fixes:
- `SWC_NATIVE_BINDING_CACHE=/private/tmp/bookeh-swc npm run typecheck`: passed. A new test initially used Playwright's unsupported `exact` option in Testing Library; removed that option and reran typecheck successfully.
- Unit suites bookDetail, filterChip, filterToggle, loansPage and genreName: 69 tests passed. Book detail's 31 tests reran successfully after the type-only test-option correction.
- Integration suites userBooks, setRating and effectiveBook: 19 tests passed against migrated bookeh_test, including the existing real-reader language behavior.
- Scoped ESLint and `git diff --check`: passed.
- Ignored fixture Chromium acceptance walk rerun: 1 passed (10.6s), covering all five groups at 1300px/390px, correct filter encodings, duplicate-copy independence, preserved address fields, repeated-selection uniqueness, wide-panel persistence and phone-sheet closing. Desktop screenshot inspected. Walk remains ignored.

Residual risks: manually supplied case-varied theme values can appear separately while matching correctly, consistent with story 9.5. Browser walk covers fixture Chromium; no physical-device verification. No schema/development-data changes, parallel worktrees or shared-file conflicts. Git metadata and local test-server/database restrictions were handled through approved escalations. No push performed.
