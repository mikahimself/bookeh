---
title: '9.20 Description on Book detail'
type: 'feature'
created: '2026-11-04'
status: 'ready-for-dev'
baseline_revision: '9d5222fd5959f0f15d706376de980cd6d5788586'
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

- [ ] Add the localized conditional section and update EXPERIENCE.md.
- [ ] Verify nonblank effective text displays in full, including an override; null, empty and whitespace-only values omit the whole section. A cleared effective value must not fall back to shared data.
- [ ] Verify markup-like input displays literally and creates no HTML elements. Verify line breaks and long-token wrapping in the browser, without tests for CSS class names.
- [ ] Confirm description follows classification and precedes source actions and Edit, from collection and loans at both widths. Preserve existing interactions.
- [ ] Run the focused Book detail unit suite, typecheck and scoped ESLint.
- [ ] Run one ignored, uncommitted Playwright walk against the fixture e2e server: phone and desktop, long multiline description and unbroken token, absent description, English and Finnish headings, Edit description then save and return, close and reopen detail. Record observations here; do not commit the walk.
- [ ] Update story and sprint status after implementation and verification.

The acceptance criteria in `epics.md`, Story 9.20, define this slice. Unit coverage exercises effective values at the rendering boundary; reuse existing effective-Book tests for override resolution.

## Verification

Pending implementation. No application code changed when preparing this story.
