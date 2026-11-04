---
title: '9.20 Description on Book detail'
type: 'feature'
created: '2026-11-04'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: false
baseline_revision: '83913556d74d139330ce50d54ef5475223534eac'
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-9-context.md'
warnings: []
deferred: []
---

<intent-contract>

## Intent

**Problem:** Descriptions are already fetched, stored and editable, but Book detail does not display them. Reading a synopsis currently requires opening Edit book.

**Approach:** Add a conditional Description section to the existing Book detail server component using `book.description` from `heldBook`. Place it after classification and before source actions and the foot, keeping the half-open phone sheet's existing quick actions reachable.

## Boundaries & Constraints

**Always:** Preserve held-Book authorization and effective-value semantics, including cleared overrides. Render the full stored value as escaped plain text with preserved line breaks and long-word wrapping. Use `book.description?.trim()` only to decide visibility. Reuse design tokens and localized group headings. Phone and desktop share content.

**Never:** Add metadata requests, database fields, migrations, rich-text/HTML rendering, client state, truncation or an expand control. Change the Answer, wishlist entry detail or shared BookHeader. Add permanent Playwright coverage for this flow.

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookDetail.tsx` — add the conditional section after genres and before source actions; update the component documentation. Story 9.6 will add classification groups at this insertion point: keep description after all classification groups.
- `src/app/(frontend)/(sections)/BookDetailPanel.tsx` and `BookDetailSheet.tsx` — inspect scrolling and responsive frame for verification; no planned changes.
- `src/lib/books/effectiveBook.ts` and `src/app/(frontend)/heldBook.ts` — existing effective description and authorization; reuse without additional reads.
- `messages/en.json`, `messages/fi.json` — add `detail.description`: Description / Kuvaus.
- `tests/unit/bookDetail.unit.spec.ts`, `tests/helpers/collectionPage.ts` — reuse the detail harness and supply effective descriptions through its held-Book fixture.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md`, Book detail table — document the new group and order during implementation.
- `epics.md`, `epic-9-context.md`, `sprint-status.yaml` — story registration and progress. No dependency on the pending tagging model.

## Tasks & Acceptance

- [x] Add the localized conditional section and update EXPERIENCE.md.
- [x] Verify nonblank effective text displays in full, including an override; null, empty and whitespace-only values omit the whole section. A cleared effective value must not fall back to shared data.
- [x] Verify markup-like input displays literally and creates no HTML elements. Verify line breaks and long-token wrapping in the browser, without tests for CSS class names.
- [x] Confirm description follows classification and precedes source actions and Edit, from collection and loans at both widths. Preserve existing interactions.
- [x] Run the focused Book detail unit suite, typecheck and scoped ESLint.
- [x] Run one ignored, uncommitted Playwright walk against the fixture e2e server: phone and desktop, long multiline description and unbroken token, absent description, English and Finnish headings, Edit description then save and return, close and reopen detail. Record observations here; do not commit the walk.
- [x] Update story and sprint status after implementation and verification.

The acceptance criteria in `epics.md`, Story 9.20, define this slice. Unit coverage exercises effective values at the rendering boundary; reuse existing effective-Book tests for override resolution.

## Verification

- `npm run test:unit -- bookDetail.unit.spec.ts` — all 24 tests pass, including six new description cases.
- `npm run typecheck` — passes.
- `npx eslint 'src/app/(frontend)/(sections)/BookDetail.tsx' tests/unit/bookDetail.unit.spec.ts` — passes.
- `npm run test:e2e -- tests/e2e/description.walk.spec.ts --reporter=line` — one Chromium walk passes (latest strengthened run: 21.2 s). Required escalation because the sandbox blocks tsx IPC. Uses the configured isolated fixture server; walk stays ignored and uncommitted.

Browser observations: editing the saved Sapiens fixture description returned to Book detail with the new effective text. A long synopsis and 720-character token wrapped without horizontal overflow at 1300px and 390px. Markup-like text displayed literally; text used pre-wrap. Closing and reopening retained the value. Loans detail displayed the same description. Switching Settings to Suomi showed Kuvaus; English showed Description. Clearing the description through Edit hid the section after save and after reopening. Existing input normalization collapses whitespace on save. The strengthened walk therefore writes multiline fixture text only to the saved test Book’s effective override in guarded `bookeh_test`, then reloads both widths. Exact stored text is preserved, and DOM Range geometry confirms that the second line appears below the first. No development or production data is changed.


## Review Triage Log

### 2026-11-04 — Review pass
- verdicts: 5 findings — high 0, medium 0, low 2, false 3, maybe-false 0
- findings:
  - `[false]` `[reject]` Sprint status still ready-for-dev during review — this was a transient workflow state; finalization now marks both story and sprint done after successful verification.
  - `[false]` `[reject]` Unchecked tasks despite implementation — review had not completed; finalization checks each completed task and records the results below.
  - `[low]` `[patch]` Initial browser walk did not show actual stored line separation — strengthened the ignored walk with guarded test-database multiline fixture setup, exact stored-text assertion and DOM Range line-position comparison at 390px and 1300px; passed.
  - `[low]` `[patch]` Ordering assertions did not cover a visible source action — extended the existing admin Re-fetch test to include Description and assert that it precedes Re-fetch; targeted test and all 24 focused cases pass.
  - `[false]` `[reject]` Missing committed browser layout regression — the claim that this requires permanent coverage conflicts with the intent's explicit exclusion of permanent Playwright coverage and the spine Tests convention. Required browser verification is the ignored walk, which passed with geometry assertions; persistent unit coverage verifies exact stored text and omission.

Edge-case review returned no findings. Intent audit reported no contradictory behavior; its observations distinguish rendering tests from browser evidence and unchanged authorization/override-resolution paths. The existing effective-Book reader is reused, with no new access or data resolution path. Description is inserted after classification, so the existing half-open sheet's header/read/copy content remains before it; this story does not change the frame.

Scheduling: the platform allows three concurrent children. Three reviewers launched first; the fourth launched as soon as one slot became available, before triage or handling any review findings. All four completed before classification.

## Auto Run Result

Story 9.20 implemented, reviewed and verified; status: done.

Book detail now shows the full nonblank effective description after classification and before source actions and the foot. It uses escaped plain text, preserves stored line breaks and wraps long words. Null, empty, whitespace-only and explicitly cleared values omit the entire group. English uses Description; Finnish uses Kuvaus. Existing held-Book authorization, edit behavior, and shared phone/desktop content remain in place.

Files changed:
- `src/app/(frontend)/(sections)/BookDetail.tsx` — conditional description section and content documentation.
- `messages/en.json`, `messages/fi.json` — localized heading.
- `tests/unit/bookDetail.unit.spec.ts` — six description cases and a source-action ordering assertion.
- `EXPERIENCE.md` — group behavior and position.
- `sprint-status.yaml` — story done.
- This spec — progress, verification, review and final result.

Verification: parent independently passed all 24 Book detail unit cases, typecheck and scoped ESLint after the review patch. The ignored Chromium fixture walk passed after strengthening (21.2 seconds), covering long text without overflow at phone/desktop widths, actual stored multiline text with visible line separation, literal markup, Edit/save/return, clear/reopen, Loans detail and both locales. Walk observations are detailed in Verification above. The walk remains ignored and uncommitted as required.

Review: two low verification improvements applied; zero high/medium patches and zero deferred items. Three rejected findings and their individual reasons are recorded in Review Triage Log. Follow-up review recommended: false. No known residual implementation risk within this slice. Normalization of edited whitespace is existing behavior and is unchanged.
