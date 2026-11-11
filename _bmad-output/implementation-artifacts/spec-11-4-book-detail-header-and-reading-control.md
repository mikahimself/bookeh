---
title: '11.4 Book detail header and reading control'
type: 'feature'
created: '2026-11-10'
baseline_revision: '36fe2ed104555600591aad5944f60bfe2c89badb'
status: 'done'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '{project-root}/CLAUDE.md'
  - '{project-root}/_bmad-output/implementation-artifacts/epic-11-context.md'
warnings: ['oversized']
deferred: []
---

<intent-contract>

## Intent

**Problem:** DESIGN.md and EXPERIENCE.md (amended 2026-11-10, bold Metro) give Book detail a 120 × 180 cover beside the title, the author, a muted "{pages} pages · {language}" line, the series and, once read, the Rating, and draw reading status as a filled Segmented control. Today the header has a 72px cover and a publisher · year · pages · language line, and the reading status is a plain Text switch with the Rating under its dates line.

**Approach:** Wrap Base UI's Toggle Group once in `components/ui` and build the Segmented control on it. Replace the reading Text switch with it. Rework `BookHeader`, which the wishlist entry shares, to the new cover size and lines. Move the Rating into the header's text column through a small context from `ReadAndRating`, so it still follows the switch live. Name the toggle group in the spine's UI primitives line.

## Boundaries & Constraints

**Always:**
- Segmented control (DESIGN.md → Segmented control):
  - three equal parts in a `stroke-button` `text` outline with `stroke-button` `text` dividers, 48px tall;
  - labels in `control` type, lowercase;
  - the chosen part filled `accent-fill` under white text.
- The outline and dividers read the token (`border-(length:--spacing-stroke-button)`), never a bare `border-2`.
- Exactly one part is pressed. Each part is a button exposed with `aria-pressed`. Tapping the chosen part does nothing. Arrow keys move between parts (EXPERIENCE.md → Segmented control). The group keeps the accessible name "Reading" / its Finnish string.
- The Toggle Group wrapper lives in `src/app/(frontend)/components/ui/ToggleGroup.tsx`. It is the only importer of `@base-ui/react/toggle-group` and `@base-ui/react/toggle`, and is unstyled beyond what every user needs, so 11.3's Icon switch can reuse it.
- Transitions, toasts, the dates line and its Picker are unchanged (FR-53, FR-54). Saving still goes through `useSavedSwitch`, and the Undo remount still resets the group and the Rating.
- Header lines, in order: the title (`heading-detail`), the authors (`title` type, Filter chips), "{pages} pages · {language}" (`meta`, `text-muted`; either part left out when empty, the line absent when both are), and the series with its number (Filter chip). Then the Rating while the switch shows read, saved at once as now (decision 2).
- Publisher and year leave the header. 11.5 brings them back in Description & details.
- Values come from tokens in `styles.css`: a 120px header cover, a 48px segmented height and a white `on-fill`, the same in both themes.

**Never:**
- No Folding sections, no Description & details group, no change to the copy lines or the foot (11.5, 11.6).
- No change to the Answer's or Edit book's 72px cover (`cover-detail`).
- No "Reading" heading over the control. The group stays unheaded as now; its name is its label.
- No `dark:` utilities, no inline style, no colour or size literals in components.
- No committed tests. No change to shared shapes, actions or ADs.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Unread → reading | tap "reading" | part filled, the others plain; "Since {today} · 0 days" under it; no toast | a failed save falls back to "unread" with the usual error toast |
| Reading → read | tap "read" | "Finished {title} · {n} days" toast; the Rating appears in the header under the series | as above |
| Read → unread | tap "unread" | the Rating leaves the header; the dates line goes | as above |
| Tap the chosen part | tap "read" while read | nothing: no save, still pressed | — |
| Keyboard | Tab to the group, ArrowRight / ArrowLeft | focus moves part to part, looping; Space or Enter chooses | — |
| No pages, no language | Book with both null | no meta line; the series follows the authors | — |
| Pages only | pages 476, language null | "476 pages" | — |
| Long title, phone | "Täällä Pohjantähden alla 1", 476 pages, Finnish, a series, at 390px | three-line title; the text column ends within 32px of the cover's foot, unread and read (with stars) | — |
| Narrow column, wide | the 360px panel (176px text column), read and rated, en and fi | the stars fit the column; Clear wraps under them; no sideways overflow | — |
| Wishlist entry | an opened entry | the same header (120px cover, new lines) with "On {list}" last; no Rating | — |

</intent-contract>

## Code Map

- `src/app/(frontend)/(sections)/BookHeader.tsx`. Async server component, shared by Book detail (`BookDetail.tsx:132`) and the opened wishlist entry (`wishlists/[listId]/EntryDetail.tsx:40`, children "On {list}").
  - `:27-34`: the `edition` line (publisher · year · pages · language). Becomes pages · language only. Keep `t('answer.pages', { pages })` and `languageName(book.language, await getLocale())`.
  - `:38`: `w-cover-detail` becomes the new header token.
  - `:43-62`: authors in `text-body`; change to `text-title`. Order becomes authors, the meta line, the series. `children` stay last.
  - The doc comment changes with it.
- `src/app/(frontend)/(sections)/ReadAndRating.tsx`.
  - `:49-68`: `ReadAndRating` remounts `Group` by `generation` after a toast Undo. Keep that, and add a `header: ReactNode` prop rendered by `Group` before the reading group.
  - `:70-108`: `Group` owns `state` and `rating` through `useSavedSwitch`. It provides a context to the header: whether the switch shows read, the rating, and `setRating`. It returns a fragment: the context provider around `{header}`, then the reading `div` (`ref={group}`, `tabIndex={-1}`, focus target after the Picker, `:129`).
  - `:141-150`: the `TextSwitch` becomes `SegmentedControl` with the same label, options and `onChange`.
  - `:170-182`: the Rating block moves into a new exported client component, `HeaderRating`. It reads the context, renders the sr-only label and `Rating` when read, and nothing outside a provider.
  - The doc comment is updated.
- `src/app/(frontend)/(sections)/BookDetail.tsx`.
  - `:132-133`: becomes a single `<ReadAndRating key={bookId} … header={<BookHeader book={book}><HeaderRating /></BookHeader>} />`. This works because a server-rendered element passed as a prop to a client component can hold a client child that reads the client provider.
  - `:41-81`: the doc comment mentions the header and "the read switch and Rating". Update that phrase.
- `src/app/(frontend)/components/Link.tsx:5-9`. `linkClass()` gives every Link `max-wide:min-h-tap`.
  - Add an exported `tapOutsideClass`: `relative` plus a phone-only `before:` box, `inset-x-0`, centred vertically (`top-1/2`, `-translate-y-1/2`), `h-tap`, empty content. It is the compact button's pattern (`Button.tsx:22`), centred rather than bottom-anchored. The control is drawn at its own height and its 44px tap area takes no layout room (DESIGN.md → Tap area: "by padding, whatever its drawn height").
  - `linkClass(destructive, tapOutside = false)`: with `tapOutside`, `tapOutsideClass` replaces `max-wide:min-h-tap`.
  - `TextLink` and `ActionLink` take an optional `tapOutside` and pass it through. Every other caller is unchanged.
- `src/app/(frontend)/(sections)/FilterChip.tsx:25-72`: an optional `tapOutside` passed to each `TextLink`. `BookHeader` sets it on the author and series chips. Copy-line and classification chips keep 44px heights.
- `src/app/(frontend)/components/Rating.tsx:32,43`.
  - The root `flex items-center gap-2` gains `flex-wrap`, so Clear goes under the stars in the panel's 176px column.
  - Star buttons `size-7 max-wide:size-tap` become `size-7 max-wide:h-tap`, so the five stars are 140px wide on the phone and fit its 214px column.
  - An optional `tapOutside` prop:
    - stars become `w-7 h-star` (drawn 22px) with `tapOutsideClass`;
    - Clear gets `tapOutside`;
    - the group gets `max-wide:mt-5` (with the column's `gap-1`, 24px above the stars), so the series' and the stars' tap areas meet without overlapping (series 20.3px line: 11.9px below; stars 22px: 11px above).
  - `HeaderRating` passes `tapOutside`. The Filter panel (`FilterPanel.tsx:322`) does not and keeps 44px-high stars.
- `src/app/(frontend)/components/TextSwitch.tsx`: still used by Settings, Layout, Size, Year and the loans order. Unchanged.
- New `src/app/(frontend)/components/ui/ToggleGroup.tsx`.
  - `ToggleGroup<V>`: Base UI `ToggleGroup` (`@base-ui/react/toggle-group`), controlled with `value={[value]}`. `onValueChange` passes the first value on and ignores `[]`, so the chosen one stays pressed and tapping it does nothing. It takes `aria-label`, `className` and `children`.
  - `ToggleGroupItem<V>`: Base UI `Toggle` (`@base-ui/react/toggle`) with `value`, `className`, `aria-label` and `children`. It sets `data-pressed` and `aria-pressed`.
  - Roving focus and arrow keys with `loopFocus` come from Base UI (docs: `node_modules/@base-ui/react/docs/react/components/toggle-group.md`).
  - Style it like `ui/Menu.tsx`: `'use client'`, a DESIGN.md doc comment.
- New `src/app/(frontend)/components/SegmentedControl.tsx`. The DESIGN.md component, with the `TextSwitch` API minus the extras: `label`, `value`, `options`, `onChange`. It builds on the wrapper:
  - root `grid grid-cols-3`, token outline in `border-text`;
  - parts `min-h-segmented-height`, `text-control ui-case text-text`, token left divider (none on the first), `data-pressed:bg-accent-fill data-pressed:text-on-fill`;
  - keyboard focus raised over the neighbours (`focus-visible:relative focus-visible:z-1`) so the global ring shows.
- `src/app/(frontend)/styles.css`.
  - `:44-53` (fills): add `--color-on-fill: #ffffff`, the white on `accent-fill`, the same in both themes, declared once (precedent: `accent-fill`).
  - `:131-132`: `cover-detail` now serves the Answer and Edit book. Add `--spacing-cover-header: 120px` (Book detail's and the entry's header, 120 × 180) and `--spacing-segmented-height: 48px`.
- `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md`.
  - Front matter colours (`:6-50`): add `on-fill: '#FFFFFF'` and `on-fill-dark: '#FFFFFF'`.
  - `:256`, `:262`, `:271`: the segmented-control and icon-switch `chosen-foreground` and the stats-tile `foreground` (`'#FFFFFF'`) become `'{colors.on-fill}'`.
  - Colours table (`:311` area): add an `on-fill` row ("White text and icons on `accent-fill`. Nothing else.").
- `_bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md:317`. UI primitives: "…the other overlays, and the toggle group, come from Base UI… The toggle group is not an overlay." 11.5 adds the accordion.
- `tests/e2e/reading.walk.spec.ts` (git-ignored) is the precedent for the walk: sign-in, books inserted with `pg`, the `Reading` group, the `Finished` toast, the dates Picker. `tests/e2e/boldTokens.walk.spec.ts` covers dark mode via `emulateMedia`.

## Tasks & Acceptance

**Execution:**
- [ ] `src/app/(frontend)/styles.css`: `on-fill`, `cover-header` and `segmented-height` tokens with comments; the `cover-detail` comment names its remaining users.
- [ ] `src/app/(frontend)/components/ui/ToggleGroup.tsx`: the wrapper as in the Code Map.
- [ ] `src/app/(frontend)/components/SegmentedControl.tsx`: the DESIGN.md Segmented control on the wrapper.
- [ ] `src/app/(frontend)/(sections)/ReadAndRating.tsx`: `SegmentedControl`, the `header` prop, the context and `HeaderRating`; doc comment.
- [ ] `src/app/(frontend)/(sections)/BookHeader.tsx`: cover token, lines and order, author type; doc comment.
- [ ] `src/app/(frontend)/(sections)/BookDetail.tsx`: header passed into `ReadAndRating` with `HeaderRating`; doc comment.
- [ ] `src/app/(frontend)/components/Link.tsx`, `(sections)/FilterChip.tsx`: `tapOutsideClass` and the opt-in `tapOutside`; doc comments.
- [ ] `src/app/(frontend)/components/Rating.tsx`: `flex-wrap`; phone stars `max-wide:h-tap`; the `tapOutside` prop; doc comment.
- [ ] `BookHeader.tsx`, `ReadAndRating.tsx`: `tapOutside` on the header's author and series chips and on `HeaderRating`'s Rating.
- [ ] `DESIGN.md`: the `on-fill` token (front matter, the three `#FFFFFF` foregrounds, the table row).
- [ ] `ARCHITECTURE-SPINE.md:317`: the toggle group in UI primitives.
- [ ] `tests/e2e/bookHeader.walk.spec.ts` (git-ignored, not committed): the walk under Verification.

**Acceptance Criteria:**
- Given Book detail in the sheet (390px) and the panel (1300px), when the header shows, then the cover is 120 × 180, then the title, the authors at 17px, a muted "{pages} pages · {language}" line and the series line, and no publisher or year appears anywhere in the header.
- Given a Book being read, when "read" is tapped, then the finish toast shows as before and the Rating appears in the header's text column under the series; when "unread" is tapped, it leaves; a star tap saves as now.
- Given the reading control, when it renders in light and dark, then it is three equal parts, 48px tall, in a 2px `text` outline with 2px dividers, read from `stroke-button` (an injected `--spacing-stroke-button: 3px` makes them 3px); the chosen part is `accent-fill` (`#D1432F`) with a white label and `aria-pressed="true"`, the others plain with `aria-pressed="false"`.
- Given focus on the control, when ArrowRight or ArrowLeft is pressed, then focus moves to the next or previous part, looping, and Tab leaves the group in one step.
- Given "Täällä Pohjantähden alla 1" with pages, language and a series at 390px, when Book detail opens unread and then read, then the title takes three lines and the text column's foot is within 32px of the cover's foot.
- Given the header at 390px, when the tap areas of the author chip, the series chip, the stars and Clear are measured (each control's `::before`), then each is 44px high, centred on its control, and no two overlap; at 1300px the header's controls draw no tap box.
- Given an opened wishlist entry, when it shows, then its header has the same cover and lines with "On {list}" last.
- Given `ARCHITECTURE-SPINE.md`, when the story is committed, then UI primitives names the toggle group as a Base UI wrapper in `components/ui` and says it is not an overlay.

## Spec Change Log

### 2026-11-10 — Mika's pick after the first build (option B)
- Trigger: the first build's walk measured the long-title column 76px past the cover's foot once read (28px unread). The author chip, the series chip and the stars each took a 44px phone height, against the I/O row's 32px. Mika chose option B from `ux-designs/ux-bookeh-2026-10-03/.working/detail-header-tap.html` (A: as built, B: tap areas outside the layout, C: stars under the cover).
- Amended: Code Map (`Link.tsx` `tapOutsideClass` and the opt-in `tapOutside`; `FilterChip.tsx`; `Rating.tsx`'s `tapOutside`), Execution, and one AC on the tap areas. The mock-up measures about 27px past the foot once read and 18px above unread.
- Avoids: header controls that take 44px of layout height, and overlapping tap areas between the series and the stars.
- KEEP: everything else from the first build: the `ToggleGroup` wrapper, `SegmentedControl`, the `ReadAndRating` context with `HeaderRating`, `BookHeader`'s lines and the 120px cover, the tokens, DESIGN.md's `on-fill`, the spine line, and the unit-harness changes (`serverTree.ts`, the three specs).
- Also decided by Mika, not this story: the reading dates line moves into Description & details in 11.5. 11.6's ⋯ gains "Add reading dates" for a read Book with no dates, and wide screens get a Link above the foot. 11.4 keeps the dates line under the control.

## Review Triage Log

### 2026-11-11 — Review pass
- verdicts: 25 findings — high 0, medium 7, low 13, false 5, maybe-false 0
- findings:
  - `[false]` `[reject]` Intent Alignment: the wishlist entry's header changes too — EXPERIENCE.md → Entry opened shows "the Book's header", so the shared `BookHeader` carrying the new cover and lines there is the intended surface.
  - `[low]` `[patch]` Intent Alignment: the Filter panel's phone stars narrow from 44 to 28px — same root cause as the Blind Hunter row below; fixed there.
  - `[false]` `[reject]` Intent Alignment: authors in `title` type, `on-fill`, the 48px height, the item `aria-label` and `mt-5` go beyond the intent — each comes from DESIGN.md (Typography: author in the detail header; Segmented control 48px), the spine's no-literals rule, 11.3's reuse named by the intent, or Mika's option B.
  - `[false]` `[reject]` Intent Alignment: "no tests" while four test files change — no test case was added; the existing specs and `serverTree` were adapted to the changed header and the `header` prop, which "no tests" does not forbid.
  - `[false]` `[reject]` Intent Alignment: the walk's figures are outside the diff — the intent asks for an uncommitted walk; it ran and its results are under Auto Run Result.
  - `[false]` `[reject]` Intent Alignment: the duplicate-build question is not settled in the diff — Mika settled it in conversation (this build goes forward; the worktree is left alone), which needs no code.
  - `[medium]` `[reject]` Verification Gap: no page-level test that `HeaderRating` renders inside Book detail's header — the intent says "no tests" (epics.md 11.4), so a committed test is out of scope by the intent; the walk covers the AC on the real surface.
  - `[low]` `[reject]` Verification Gap: the wrapper's tap-the-chosen-part guard is untested — out of scope by the intent's "no tests"; the walk confirmed no POST and an unchanged `updated_at`.
  - `[low]` `[patch]` Blind Hunter: `SegmentedControl` fixes `grid-cols-3` over any `options` — direct correction: `grid-flow-col auto-cols-fr`.
  - `[medium]` `[patch]` Blind Hunter: wrapped author lines overlap their tap boxes — geometry: 22px lines with 44px centred boxes, the later line's box covers the lower half of the earlier line's text; fixed: phone row gap of 24px between wrapped author lines.
  - `[medium]` `[patch]` Blind Hunter: Clear wrapped under the stars overlaps their tap boxes on the phone — fi "Tyhjennä" wraps at a 360px phone (184px column); fixed: `max-wide:gap-y-6` under `tapOutside`.
  - `[low]` `[reject]` Blind Hunter: `Rating`'s `max-wide:mt-5` depends on its surroundings and is idle under the meta line — the margin is needed whenever a chip (author or series) sits directly above; only a meta line above makes it idle, and a conditional would add branching for a few pixels.
  - `[low]` `[patch]` Blind Hunter: the Filter panel's phone stars narrowed for no remaining reason — fixed: the non-`tapOutside` branch back to `size-7 max-wide:size-tap`, doc corrected.
  - `[low]` `[reject]` Blind Hunter: the Rating comes before its trigger in reading and tab order — the intent (decision 2) places the Rating in the header, above the control; it reads in header order.
  - `[low]` `[reject]` Blind Hunter: the Undo remount now rebuilds the header too — the cover is cached and focus is on the toast when Undo is pressed; moving the provider above the keyed group would restructure the state for an effect nobody sees.
  - `[medium]` `[patch]` Blind Hunter: `epic-11-context.md` still sends the spine edit to 11.3 or 11.5 and 11.5's criteria do not name the accordion's spine update — CLAUDE.md: a deferral touching a spine rule goes into the next story's ACs; fixed: epics.md 11.5 gains the spine criterion, the context names 11.4 as the toggle group's builder.
  - `[low]` `[patch]` Blind Hunter: DESIGN.md's `segmented-control` block has no height, and `accent-fill` still says "white text" — fixed: `height: 48px`; the row and the `styles.css` comment point to `on-fill`.
  - `[low]` `[patch]` Blind Hunter: `onChange(chosen as V)` is an unchecked cast — fixed: the Base UI group typed with the wrapper's `V`, the cast dropped.
  - `[medium]` `[patch]` Edge Case Hunter: authors and series with no pages or language overlap their tap boxes by about 19px — fixed: the series line takes `max-wide:mt-5` when the meta line is absent.
  - `[medium]` `[patch]` Edge Case Hunter: wrapped author lines overlap their tap boxes — same root cause as the Blind Hunter row; same fix.
  - `[medium]` `[patch]` Edge Case Hunter: Clear wrapped under the stars overlaps them — same root cause as the Blind Hunter row; same fix.
  - `[low]` `[patch]` Edge Case Hunter: `grid-cols-3` with options of another length — same as the Blind Hunter row; same fix.
  - `[low]` `[reject]` Edge Case Hunter: Tab into the group lands on the first part, not the pressed one — confirmed in Base UI's `useCompositeRoot` (highlighted index starts at 0, not exposed by `ToggleGroup`); focus shows on that part and Space there is a deliberate choice; working around it needs a non-public API.
  - `[low]` `[patch]` Edge Case Hunter: the unchecked cast — same as the Blind Hunter row; same fix.
  - `[low]` `[reject]` Edge Case Hunter: the Undo remount rebuilds the header — same as the Blind Hunter row; rejected for the same reason.

## Design Notes

The Rating has to sit in the server-rendered header but follow the client switch. `BookDetail` therefore builds the header element with a `<HeaderRating />` inside and hands it to `ReadAndRating` as a prop. `Group` renders it inside its context provider, so `HeaderRating` reads the live state and shares the Undo remount:

```tsx
<ReadAndRating key={bookId} bookId={bookId} title={book.title} initial={state}
  header={<BookHeader book={book}><HeaderRating /></BookHeader>} />
```

The wrapper keeps the single choice in one place. Base UI's single-mode group reports `[]` when the pressed toggle is pressed again, and the wrapper drops it. Tapping the chosen part then does nothing, as the Text switch did.

## Verification

**Commands:**
- `npm run lint`: expected: no errors in committed files.
- `npm run typecheck`: expected: no errors.
- `npm run test:unit`: expected: all pass (no new tests).

**Manual checks:**
- Uncommitted walk `tests/e2e/bookHeader.walk.spec.ts` against the e2e server at 390 and 1300px, light and dark (`emulateMedia`), en, plus fi for the wide Rating column:
  - the three transitions with toasts and the Rating in the header;
  - tapping the chosen part;
  - arrow keys;
  - computed outline, divider, height and fill;
  - the 3px injection;
  - a Book with no pages or language, a pages-only Book;
  - the long title's column foot against the cover's;
  - the Rating at the panel width;
  - an opened wishlist entry.
- Screenshots go to `test-results/book-header-walk/`. Record what it saw under `## Auto Run Result`.
- `scanToSave` and `shopCheck` still pass (`--workers=1`).

## Auto Run Result

Walk `tests/e2e/bookHeader.walk.spec.ts` (uncommitted), 390 and 1300px, light and dark, en (fi for the panel Rating); passed. Screenshots and `result.json` in `test-results/book-header-walk/`.

- Header: cover 120 × 180 at both widths; lines title, authors (17px), "476 pages · Finnish" (13px, muted), series; no WSOY or 1959. Bare Book: title and author only. Pages only: "476 pages".
- Segmented control: outline 2px all sides, dividers 0 / 2 / 2px, parts 48px tall and equal (115.3px phone, 102.3px panel), outline `text` in both themes (rgb(31, 41, 51) / rgb(227, 232, 238)); chosen part rgb(209, 67, 47) under rgb(255, 255, 255) with `aria-pressed="true"`, others transparent with `"false"`. Injected 3px: outline and dividers 3px.
- Transitions: unread → reading shows "Since … · 1 day", no toast, no stars; reading → read shows "Finished … · 1 day" and the Rating as the header's last line under the series; a star saves (rating 4); read → unread removes the Rating and the dates line. Tapping the chosen part sends no POST and leaves `updated_at` unchanged.
- Keyboard: ArrowRight moves unread → reading → read → unread, ArrowLeft back to read; Tab leaves the group in one step; Space chooses.
- Long title at 390px (option B, re-walked): three lines. Text column foot vs cover foot: unread 18px above it, read and rated 28px past it, both within 32px (light and dark). At 1300px: 18px unread, 8px read, 34px read and rated (Clear wraps under the stars in the 175px column; the 32px rule is a phone row). Header controls at 390px draw at their own heights (author chip 22.1px, series chip 20.3px, stars 22px, Clear 18.2px), each with a `::before` tap box 44px high and centred on it (offset 0). No two boxes overlap: 3.4px between the author's and the series' boxes, 1.2px between the series' and the stars'. Stars' boxes are 28px wide and meet edge to edge. At 1300px none of these controls draws a box. Unchanged elsewhere: the copy line's location chip is 44px high with no box, and the Filter panel's five stars on the phone are 44px high with no box.
- Panel (175px column), read and rated, en and fi: stars within the column, Clear / Tyhjennä wraps under them, no sideways overflow.
- Wishlist entry, 390 and 1300px: 120 × 180 cover, title, author, "300 pages · Finnish", "On {list}" last, no Rating.

### Halt (2026-11-10)

Status: blocked
Blocking condition: duplicate build and intent gap.

- **Duplicate build.** The worktree `.claude/worktrees/story-11-4-book-detail-header-and-reading-control` (branch `story/11-4-book-detail-header-and-reading-control`, at `85e686cbc86af38610f46ec44c1fcfbeca3cf4b7`) holds an uncommitted build of this same story over the same files. This run did not start it. Which build goes forward is Mika's decision; this run's build is left uncommitted on `main`.
- **Intent gap.** The epic's criterion "the header text column ends near the cover's foot for a three-line title at phone width" cannot hold once the Book is read without changing a phone tap height. Measured: 28px unread, 76px read (256px column against a 180px cover), from three 44px-high controls: the author chip, the series chip and the stars (DESIGN.md → Tap area). Open question: keep the 44px layout heights and accept the longer column when read, or draw those tap areas outside the layout (as the compact button's `before:h-tap`, spacing the series and the stars so the areas do not overlap, about 27px past the foot), or another arrangement.
- Not reviewed. Lint (committed files), typecheck, unit tests (1400), the walk, `scanToSave` and `shopCheck` passed before the halt.

### Review patches (2026-11-11)

Walk `tests/e2e/bookHeader.walk.spec.ts` re-run after the review patches; passed (30s, warm server). Its own page-load wait went from 5s to 30s after a cold-server timeout in the first re-run.

- Tap boxes at 390 and 360px, en and fi, for the long title (read and rated), two wrapped authors and a series with no pages or language: no overlaps in any of the 12 cases; every box 44px, centred.
- Long title at 390px: column foot 28px past the cover's foot read and rated (18px above unread), en and fi. At 360px in Finnish, Clear wraps under the stars and the column ends 70px past (the 32px row is a 390px rule).
- Two authors: two rows, 24px apart on the phone. Series with no meta line: the series line drops 20px, author→series boxes 1.2px apart.
- Filter panel stars at 390px: 44 × 44 again, no tap box.
- `npm run typecheck` clean; ESLint clean on `src/app/(frontend)`, `tests/unit`, `tests/helpers`; `npm run test:unit` 104 files, 1400 tests pass; `scanToSave` and `shopCheck` pass (`--workers=1`).

### Finalize

**Summary.**
- Book detail's header shows a 120 × 180 cover. Then come the title, the authors in `title` type, a muted "{pages} pages · {language}" line and the series. The Rating sits under them once the Book is read.
- The header is shared, so the wishlist entry gets the same header.
- Reading status is a Segmented control on a new Base UI Toggle Group wrapper. The chosen part is filled `accent-fill` under the new `on-fill` white.
- The header's author and series chips, the stars and Clear keep 44px phone tap areas drawn outside the layout (Mika's option B), spaced so no two overlap.
- The spine's UI primitives line names the toggle group.

**Files changed.**
- `src/app/(frontend)/components/ui/ToggleGroup.tsx` (new): the Base UI Toggle Group wrapper, single choice.
- `src/app/(frontend)/components/SegmentedControl.tsx` (new): DESIGN.md's Segmented control.
- `src/app/(frontend)/(sections)/ReadAndRating.tsx`: the Segmented control, the `header` prop, the context and `HeaderRating`.
- `src/app/(frontend)/(sections)/BookHeader.tsx`: the cover, the lines and their order, wrapped authors 24px apart, the series spacing.
- `src/app/(frontend)/(sections)/BookDetail.tsx`: the header passed into `ReadAndRating`.
- `src/app/(frontend)/components/Link.tsx`: `tapOutsideClass` and the opt-in `tapOutside`.
- `src/app/(frontend)/(sections)/FilterChip.tsx`: passes `tapOutside` through.
- `src/app/(frontend)/components/Rating.tsx`: `tapOutside`, wrapping, the gaps.
- `src/app/(frontend)/styles.css`: `on-fill`, `cover-header` and `segmented-height`.
- `tests/helpers/serverTree.ts` and three unit specs: adapted to the `header` prop and the new meta line.
- `DESIGN.md`: `on-fill` and the Segmented control's height. `ARCHITECTURE-SPINE.md`: UI primitives.
- `epics.md`: 11.5 gains the accordion's spine criterion. `epic-11-context.md`: recompiled, toggle group noted.

**Review.** 25 findings.
- Patched 13 rows in 8 entries: medium 4 entries (wrapped authors, Clear wrapping, series without meta, the spine criterion for 11.5) and low 4 entries (Filter panel stars, the column count, the cast, DESIGN.md).
- Deferred 0.
- Rejected 12, each with its reason in the Review Triage Log: 5 false, and 7 that are out of scope by the intent's "no tests" or decision 2, or not worth a structural change (the Undo remount, the Tab stop, the idle margin).

**Follow-up review:** `true`. Four medium entries were patched. The unverified risk is the tap-area geometry on a real phone: the overlay boxes were measured in desktop Chromium at phone widths, never tapped on an iPhone or Android, and Finnish at 360px ends 70px past the cover.

**Residual risks.**
- At 360px in Finnish a rated Book's column ends 70px past the cover's foot, because Clear wraps under the stars.
- The Tab stop of the Segmented control starts on "unread", not on the chosen part (Base UI's composite root).
- A toast Undo remounts the whole header, cover included.
- Built beside the abandoned worktree `story/11-4-…`, which shares every file here. Mika chose this build, and the worktree is untouched.
