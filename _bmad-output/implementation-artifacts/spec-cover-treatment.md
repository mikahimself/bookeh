---
title: 'Cover treatment: cloth placeholders and a frame on every cover'
type: 'feature'
created: '2026-10-26'
status: 'done'
route: 'oneshot'
review_loop_iteration: 0
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** On the cover grid a placeholder prints the title and author on the cover and again in the caption beneath, which looks busy. Photo covers have no frame, so white and black covers lose their edge against the ground.

**Approach:** Implement the cover treatment Mika chose on 2026-10-26 (DESIGN.md → Colors, Typography, Components → Cover tile and Cover placeholder; mock-up `.working/cover-treatment-2.html` with its default settings). Layout C keeps the caption under every tile. The placeholder becomes a coloured cloth cover: one of six `cloth-*` colours (the mixtape palette with Lumon blue), the same in both themes, picked by a hash of the title; a Perlin-noise mottle (SVG `feTurbulence`, soft-light); the title only, in caps Trebuchet MS 600 (Open Sans 600 fallback), top-left at 13% / 11% insets, hyphenated in the Book's stored language (Finnish when it has none) for words of 9+ letters, sized by the cover's width (14 / 10.5 / 8.5px; cloth only under 48px, so every row size). On an ordered copy the title starts below the airmail band. Every cover, photos included, gets a 1px inset hairline frame.

</frozen-after-approval>

## Implementation Notes

- Hash key is the title, not the Book id: the answer screen and the edition picker show placeholders for Books that are not saved yet, and a title hash gives the same colour there as on the shelf afterwards. DESIGN.md is amended to say so. Editing a title can change its colour; accepted.
- One static noise tile lives in `styles.css`, not a per-book data URI (that would put ~600 bytes of inline SVG on every tile of a 10 000-copy shelf). Variety comes from `background-position`, picked by the same hash; the tile is drawn at 200% of the cover's width, so the mottle has the same scale on every cover size.
- Title sizes come from container queries on the placeholder, so no call site passes a size and rows (16/32/44px) get the cloth alone.
- Hyphenation language (Mika, 2026-10-26, amended into the same commit): the Book's stored `language` becomes the title's `lang` when it is a plain ISO 639 code (`/^[a-z]{2,3}$/`, the spine's stored form); none or free text falls back to `fi`. A pattern rather than `Intl`, so server and browser render the same attribute. `AnswerBook`, `AnswerEdition` and `EditionRow` carry `language`, so the Answer, both edition pickers and Edit book pass it too.
- Open Sans 600 is added to `next/font` as the fallback face for Trebuchet MS (missing on Android).
- Files: `styles.css` (cloth and frame tokens, `cover-frame`, `cover-cloth`, `cover-title`, the airmail band above a positioned placeholder and the title below it), `Cover.tsx` (cloth pick, no `author`), `CoverTile.tsx`, `BookRow.tsx` (passes the title at every size; rows hide it by container query), `layout.tsx` (Open Sans 600), DESIGN.md.
- Tests: the placeholder-author unit test and the collection test's author-on-cover assertion went with the behaviour. No new test: the change is markup and CSS (CLAUDE.md test rule).
- Verified with the real compiled `styles.css` and server-rendered `Cover` markup in Chromium, both themes: the title is 14px on a 171px cover, 10.5px on 105px, 8.5px on 80px and 72px, none on a 44px row.
- One unit run showed two failures that did not reproduce in three reruns (909/909); flaky, not this change.

## Residual risks

- Safari (the phone PWA) is unverified: whether it hyphenates Finnish, and it ignores `hyphenate-limit-chars`, so short words may hyphenate there. Paint cost on a large shelf is unverified (deferred).

## Review Triage Log

- Container queries measure the padded content box, so sizes switched late — medium, real (78% of the cover). Patched: thresholds 117 / 75 / 37px, measured after.
- `BookRow` at s passed `''`, so every coverless s row hashed to pink — medium, real. Patched: the title at every size; container query hides it.
- `lang="fi"` though Books store a language — low, real. First deferred as Mika's choice; Mika then asked for it in the same commit. Patched: the Book's language.
- DESIGN.md said no mid-word breaks, while `overflow-wrap` breaks; Safari ignores the limit — low, real. Patched the wording; Safari in Residual risks.
- DESIGN.md described a seeded noise, five lines everywhere, no letter-spacing steps — low, real. Patched.
- Cover frame had no colour token and box-shadow syntax in DESIGN.md — low, real. Patched: `cover-frame` / `cover-frame-dark`.
- Spec lacks Acceptance Criteria and Code Map — false: the one-shot route drops those sections by design; the two removed assertions guarded the removed author line.
- No paint-cost check for large shelves — maybe-false, medium if true. Deferred with what would settle it.
- 4.5:1 holds only on flat cloth — low, real (decorative, title repeated in caption). Patched the wording.
