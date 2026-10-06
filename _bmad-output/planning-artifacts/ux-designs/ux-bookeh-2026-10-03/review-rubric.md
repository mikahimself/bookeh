# Spine Pair Review — bookeh

Reviewed 2026-10-05: `DESIGN.md`, `EXPERIENCE.md`, `.memlog.md`, the six files in `mockups/`, and the four sources in the EXPERIENCE.md frontmatter (PRD, PRD addendum, ARCHITECTURE-SPINE, STORY-SLICING). Scope: PRD Phase 1 only. Line numbers are `L<n>` in the named file.

## Overall verdict

The pair is well shaped, lean, and mechanically clean: every one of the 166 token references resolves, every colour has a hex value and a light/dark pair, the stated contrast figures check out, and every user decision in the memlog is reflected with none contradicted outright. The scan → answer → save path, the collection, and loans are committed well enough to build from.

It is not yet a safe contract. Eight high findings leave load-bearing decisions open or in conflict: whether a collection row is a Book or a copy, Undo promised far beyond what the architecture's receipt supports, a "one primary button" rule that the accepted mock-ups break on four screens, no owner for routes, and three surfaces a consumer cannot build from the text (Book detail, Lookup, and the dialog/combobox/picker overlays). No critical findings.

Finding counts: 0 critical, 8 high, 23 medium, 20 low.

## 1. Flow coverage — adequate

Extracted Phase 1 from the PRD Build Order: UJ-1, UJ-2 (UJ-3 is Phase 2); FR-1, FR-4, FR-10 to FR-22, FR-23 to FR-30 (less the friend part of FR-30), FR-31 to FR-39, FR-50, FR-51; NFR-1, NFR-2, NFR-7. Checked each against Key Flows (EXPERIENCE L292–334) and the behaviour tables.

Key Flows present: UJ-1, UJ-2, "Moving a box to the cottage" (UJ-2 step 6, FR-33), "Lending a book and getting it back" (FR-34 to FR-37). All four name Mika with a setting, have numbered steps and a marked climax. UJ-1, UJ-2 and the move flow have a failure path.

### Findings

- **high** Lookup by title or author (FR-20, UJ-1 step 2; the PRD Build Order says "Search is on the phone in this phase, because checks in webshops depend on it") has one IA row (EXPERIENCE L42) and nothing else: no flow, no behaviour table, no states (searching, no results, sources unreachable while own results exist), no layout for own-collection versus outside results, no mock-up. The IA also contradicts itself on what tapping a lookup result does: Book detail (L32, L92) or Answer (L43). *Fix:* add a "Lookup" subsection under Component Patterns, the missing states, and a short flow ("Webshop check by title"); pick one target for a result tap.
- **high** A wishlist entry's recipient cannot be set. FR-38 ("an entry can be marked as *for* a Person") is displayed (L172, L173) but no surface sets or changes it: the Wishlist picker only chooses a list (L39, L140) and the opened entry offers Bought, Ordered, Remove (L174–176). *Fix:* say where the recipient is chosen (picker step, or a field on the opened entry) and whether it can be changed later.
- **medium** No Key Flow for wishlists (F7: FR-38, FR-39, and the bought/ordered rule in FR-28), although it is a Build Order item with its own section. A flow would have exposed the recipient gap above. *Fix:* add "A gift for Äiti": add to Christmas for a Person, later tap Bought, no copy created.
- **medium** "Lending a book and getting it back" has no failure path (L328–334). *Fix:* add one: the copy is already lent, or Returned tapped on the wrong row and undone.
- **low** No flow for an ordered copy becoming owned (FR-28 Received); the "Ordered" Answer row is still an [ASSUMPTION] (L134). *Fix:* a three-step flow or a variant under UJ-1.
- **low** Foundation says the desktop is "for tidying and bulk edits" (L18) but the only desktop flow is the bulk move; fixing metadata on a wide screen has no flow, and Edit book on a wide screen is not described at all (see 4). *Fix:* a short "tidying" flow, or drop the claim.
- **low** FR-19 (admin re-fetch) is Phase 1 (F2) and STORY-SLICING E13 puts "the admin-only action on the detail page". The spine is silent. *Fix:* one line saying it lives in the back office, or add it to Book detail.

## 2. Token completeness — adequate

Parsed the DESIGN.md frontmatter (18 colour tokens = 9 pairs, 10 typography, 1 rounded, 13 spacing, 19 component objects) and extracted every `{path.to.token}` in both files: 159 in DESIGN.md (26 unique), 7 in EXPERIENCE.md (6 unique plus the literal `{path.to.token}` example at L20). All resolve. Every colour is a valid hex and has a `-dark` twin. Contrast recomputed: text 14.76 / 14.47, text-muted 5.44 / 6.70, text-dim 3.20 / 3.30, accent 3.24 / 8.00, danger 8.06 / 4.86 (light / dark) — all match DESIGN L227 within rounding.

### Findings

- **medium** EXPERIENCE L243 says "Text meets 4.5:1 … in both modes", but `text-dim` is text at 3.2:1 / 3.3:1. That passes for the 44/38px headings (large text) and fails for inactive Text switch options at 17px/400 (DESIGN L214, L241). The memlog decision (L69) was a 3:1 target. *Fix:* state the exception in the Accessibility Floor, or darken `text-dim` for switches.
- **medium** `border` is 1.30:1 light and 1.41:1 dark, and no ratio is stated for it. It is the only mark of an empty Text field (DESIGN L215, L304) and of the Cover placeholder (L307), which conflicts with "lines that carry meaning meet 3:1" (EXPERIENCE L243). *Fix:* state the ratio and declare those lines decorative, or use `text-dim` for the empty underline.
- **medium** No focus state exists in DESIGN.md. EXPERIENCE L244 requires "a visible focus outline in {colors.accent}", but there is no token, width or offset, and a 2px accent outline on a focused secondary button is exactly the primary button's look. *Fix:* add a `focus` component token and a Components row (offset outline, or a different mark).
- **medium** The spacing scale is defined but never assigned: `spacing.2` to `spacing.6` are referenced nowhere, and no component has padding, gap or height. Consumers will copy mock-up literals (button `6px 16px`, tools gap 26px, row gap 16px, heading gap 28/22px), several off the 4px scale. *Fix:* add padding/gap keys to the component tokens.
- **low** No typography is assigned to Link, Text field value, the Active filters line, or the book title on Answer / Edit book. The mock-ups use 15px, 15px, 13px and 20px/400; 20px/400 is not a token.
- **low** `typography.body` and `typography.heading-section-phone` are referenced by no component; `components.text-switch` has no `transform: lowercase` although DESIGN L247 says switches are lowercase; `components.marker` is called "Lent marker" in the table.
- **low** Untokenised values a consumer needs: filter panel width (220px in the mock-up), the 900px breakpoint, motion durations, the density table values (10px, 18px, 3px are off the scale), cover sizes (72 × 108 and the Answer cover).

## 3. Component coverage — thin

Extracted every component name from both files and the frontmatter.

- DESIGN.md → Components (22 rows): Section heading, Text switch, Button primary / secondary / destructive, Link, Link destructive, Back link, List row, Filter chip, Text field, Book row, Cover tile, Cover placeholder, Selection bar, Lent marker, Detail panel, Bottom sheet, Toast, Action bar, Checkbox, Progress line, Close (X), Camera frame.
- EXPERIENCE.md → Component Patterns (19 rows): the same less Link destructive, Back link, List row, Cover placeholder; Book row and Cover tile share a row.
- Used in the text with no row in either table: Dialog, Combobox, Picker (wishlist, location, tag, Person, date, merge target), Filter panel, Active filters line, sheet handle, rating, read toggle, tag input, empty-state block.

### Findings

- **high** The three overlays besides the sheet and panel have no row in either file. **Dialog** carries every destructive confirmation and Change password (EXPERIENCE L86, L88, L123, L176, L182, L188, L189, L220, L245); DESIGN.md says only "outlined boxes on the plain ground" (L280) and reserves the scrim for the sheet (L197, L218). **Combobox** is named in Foundation (L20) and used for location, Person, tags and default location (L91, L185); its popup and highlighted option have no visual spec, and the no-fill, no-shadow rules make the default non-obvious. **Picker** is "a bottom sheet" on the phone (L95) and undefined on wide screens. *Fix:* add Dialog, Combobox and Picker rows to both tables: position, width, scrim or not, option highlight, button order, keys, and the wide-screen form.
- **high** Book detail has no behavioural spec. The IA row lists contents (EXPERIENCE L32) and DESIGN L310 gives the frame, but nothing says how read, rating and notes are edited (FR-26 "supports inline editing"), what the rating control is (no component; the mock-up prints "★★★★☆"), where loan history shows (memlog L62: "as well as in each book's detail panel"), where wishlist entries show (FR-26), or which actions exist. Lend / Move / Edit appear only in the mock-up (memlog L23); Returned, Received, Remove from library and Add to wishlist are not placed on the detail at all, though STORY-SLICING J4, H8 and E12 expect them there. *Fix:* add a "Book detail" subsection like the others: groups, per-copy versus per-Book actions, edit-in-place rules, and a Rating row in both Components tables.
- **medium** Filter panel is a surface with no DESIGN.md row (width, option appearance; the mock-up marks the active option with the 8px accent square, which the spine reserves for "lent" and errors) and thin behaviour (EXPERIENCE L111): no control per FR-25 field (ranges for year and pages, rating, a long author list), no rule for several values in one field, no default sort or direction, no way to close it on wide screens, no sheet behaviour on the phone. *Fix:* a Filter panel row in DESIGN.md and a field table in EXPERIENCE.md.
- **medium** No state appearance for any component: hover, pressed, disabled and focus are absent (the DESIGN.md spec asks for "state appearance"). Disabled is needed for Not found with empty required fields, Lend on a lent copy, and the action bar at zero selected; with no fills the answer is not guessable. *Fix:* one "States" line per interactive component, or a shared rule.
- **medium** Rows missing across the pair. No EXPERIENCE.md row: Link destructive, Back link, List row (all used in L170–189). No DESIGN.md row: Active filters line, the sheet handle that EXPERIENCE L95 says is tapped, the tag input, the empty-state block. *Fix:* add the rows or fold them explicitly into an existing one.
- **medium** The action bar is "pinned to the bottom on phone and wide screens alike: the count, then Move, Tag, Read, Remove, and Done" (EXPERIENCE L98). Six items at button size do not fit a 320–390px phone, there is no wrap or overflow rule, and no phone mock-up of select mode. *Fix:* specify the phone arrangement.
- **low** Button, destructive lists "deleting a location, Person, personal tag or wishlist" (L88), but Settings Delete is a destructive Link (L189), and no surface offers deleting or renaming a wishlist. *Fix:* correct the row; add wishlist rename/delete or say it is not in Phase 1.
- **low** Buttons have no height. The mock-up button is about 36px tall against the 44px floor (EXPERIENCE L248); Links in rows (Returned, Rename / Merge / Delete at 13px) and the 18–22px Close X have no hit-area rule. *Fix:* a minimum hit area in DESIGN.md.

## 4. State coverage — adequate

Walked the 15 surfaces in Information Architecture against the 19 rows of State Patterns (EXPERIENCE L194–214). Well covered: Collection (first load, empty, no matches, loading more, load failed, end of list), Scan (no camera, bad ISBN, looking up), Answer (five headings, sources unreachable, duplicate), saves (failed, undo), Loans and Wishlists empty states, no locations, session ended, no connection, wrong password. "Permission denied" does not apply with one user, except as a stale address (below). Lookup states are covered by the high finding in 1.

### Findings

- **medium** Select mode: nothing selected (are actions disabled?), select all, whether the selection survives filtering and scrolling (the move flow at L321–322 implies it does), Move with no locations, removing lent copies (AD-18 deletes their loans; the confirmation should say so), partial failure of a bulk action. *Fix:* add rows.
- **medium** Scan: the camera re-reading the same barcode right after returning from a save (UJ-2 scans "while the toast is still there"), a barcode that is not an ISBN (the "Not an ISBN" state covers the typed field only), lookup rate-limited (AD-9, slice C7), the first-time permission prompt. *Fix:* add rows; state the same-code hold-off.
- **medium** Wishlist picker with no lists (the first shop check before any list exists), "New list" with a name already used, and whether closed (bought) entries stay visible. *Fix:* add rows.
- **medium** Settings: rename to a name that exists, Merge when there is only one item, Change password errors, invalid email, empty managed lists, and what a toast says after rename / merge / delete. *Fix:* add rows.
- **medium** An opened book "has its own address" (L262), but there is no state for an address whose Book the user no longer has (removed, undone, or mistyped; `runAction` maps it to NOT_FOUND). *Fix:* one row: show the collection with a "Not in library" toast, or similar.
- **medium** The ordered copy has no lifecycle outside the Answer: how it shows in a collection row (DESIGN L270 says a row "always ends with the copy's location, or the lent marker"), where Received is offered (Book detail, row), and which location it gets. *Fix:* a row in the density rules and a line in Book detail.
- **medium** Responsive & Platform (L254–262) has two widths and leaves two things open: how the full-screen tasks (Scan, Answer, Lookup, Edit book) are laid out on a wide screen, and what happens between 900px and about 1100px, where the filter panel (220px in the mock-up), the 360px detail panel and the margins leave the list about 250px. *Fix:* a row for full-screen tasks on wide; a minimum list width or "one side panel at a time below X".
- **low** Edit book: closing with unsaved edits, required-field validation. Toast: Undo failing or unavailable after a restart (AD-11). Loans: no returned loans yet. Sign in: no forgotten-password path in Phase 1 (say so).
- **low** Answer headings are mutually exclusive (L130–136), while FR-20 says "every chip that applies": owned and also on a wishlist for a Person, or ordered and on a wishlist, lose information. *Fix:* allow a second line under the heading.
- **low** The Answer bullets (L138–143) do not say what "Add another copy" and "Received" do next (toast, return to Scan, location).

## 5. Visual reference coverage — adequate

Files in `mockups/`: `key-collection-wide.html`, `key-collection-phone.html`, `key-scan-phone.html`, `key-loans.html`, `key-wishlists.html`, `key-settings.html` (byte-identical to their `.working/` copies). All six are linked from DESIGN.md (L203; two again at L274 and L282) and from EXPERIENCE.md with a "Shows" column (L52–59). "The spines win on any conflict" is stated in both (DESIGN L203, EXPERIENCE L50) and in each mock-up's header comment. No orphans.

### Findings

- **high** The accepted mock-ups break the one-primary rule on four screens. DESIGN L225 ("At most one primary button per screen"), EXPERIENCE L86 and L48 ("Scan book is the one primary button on every section") against: wide collection (Scan book and Lend), phone sheet (Scan book and Lend), wishlist entry (Scan book and Bought), select mode (Scan book and Done — and EXPERIENCE L98 says the bar "replaces Scan book", which the wide mock-up does not do). Because the spines win, a consumer must demote Lend and Bought or hide Scan book, and neither is what Mika accepted (memlog L89, L93). *Fix:* restate the rule as one primary per layer (section, panel or sheet, dialog, action bar), list Lend, Bought and Done under Button, primary, and say whether Scan book hides in select mode on wide screens.
- **medium** Type values differ between mock-ups and spine: sheet title 22px against `heading-detail` 26px "in the detail panel and sheet" (DESIGN L238); settings managed-row name 15px against List row's `title` 17px (L302); placeholder text in `text-dim`, which L214 limits to headings and switch options "only". *Fix:* decide each and correct one side.
- **medium** The collection mock-ups show one row per Book: "Täällä Pohjantähden alla 1" ends in "Mökki" while its detail lists two copies (Tampere, owned; Mökki, lent to Antti) and the loans mock-up shows it out. That contradicts DESIGN L270 (location "or the lent marker and borrower"). See the granularity finding in 7.
- **medium** No final-token mock-up for: Sign in, Lookup, Lend, Wishlist picker, location and tag pickers, any dialog, Filter panel on the phone, select mode on the phone, Edit book with "More details" open, the full-screen tasks on wide, the "Ordered" and "On wishlist" answers, and sizes s and l (DESIGN L274 points to `.working/wireframes-density-and-detail.html`, a greyscale file that also holds rejected options). The header comments of `key-wishlists.html` and `key-loans.html` claim "Wishlist picker" and "Lend", which they do not show. *Fix:* mock the overlays at least; correct the headers.
- **low** Details that exist only in mock-ups: lent wording in three forms ("Lent · Antti", "Lent to Antti since 12 Sep", "Mökki · lent to Antti") against one in DESIGN L309; "Add location" and "Add person" Links in settings; the 8px accent square on the active filter option; "★" glyphs for rating; the count line under an opened wishlist's heading.
- **low** EXPERIENCE.md links the mock-ups only from the IA table; the Answer, Loans, Wishlists and Settings subsections do not link theirs inline. DESIGN.md cites `.working/` files as references (L203, L227, L274); that folder is not part of the contract.

## 6. Bloat and overspecification — strong

Both files are lean, mostly tables, and do not restate the PRD. Nothing reads as a section no consumer would open.

### Findings

- **low** Components are specified twice in DESIGN.md (frontmatter L96–184 and the table L292–317) and have already drifted: `marker` / "Lent marker", `text-switch` without its transform, five table rows with no frontmatter object (back link, filter chip, cover placeholder, close, camera frame). The shadow string appears at L163 and L278. *Fix:* let the table carry rationale and anatomy only, or generate one from the other.
- **low** The density table (L261–268) is pixel-specified with values off the 4px scale. The numbers are load-bearing, so they are better as named tokens (`row-pad-s`, `cover-row-m`) than as prose.
- **low** History in a contract: superseded colour values and `.working` pointers (DESIGN L227), the note on who accepted the flows (EXPERIENCE L294), "Two rules define the look" followed by three bullets (DESIGN L195–199).

## 7. Inheritance discipline — thin

All four `sources` resolve. Checked 30 FR / NFR / UJ citations in EXPERIENCE.md against the PRD: all correct except FR-31 at L91, which covers locations only (People are FR-34, tags FR-17). Walked every "decision by user" and "override by user" in `.memlog.md` (L6–L93, later entries superseding): all are reflected and none is contradicted by spine text; the partial cases are listed below. The remaining [ASSUMPTION] tags match memlog L87 exactly.

### Findings

- **high** Book versus copy is never settled for the collection. "The user's copies" (EXPERIENCE L31), "Pick several books" (L34), "every selected copy" (L120), "all selected Books" (L122), "Remove 12 books" (L123), "the Book whose detail is showing" (L99), "14 books" (L112); DESIGN L270 treats a row as a copy; AD-7 returns copy ids; the mock-ups show a Book. Undecided: what a row is, what the counts count, and what Lend, Move, Remove and Edit book's status and location act on when a Book has two copies (FR-30). *Fix:* commit to one (for example: one row per copy, detail keyed by Book with per-copy actions in "your copies") and align the wording, counts and mock-up.
- **high** Undo is promised well beyond AD-11. A toast with Undo follows move, bulk tag, bulk read, bulk remove, lend, Returned, Bought, Ordered and entry Remove (EXPERIENCE L96, L120–123, L161, L174–176). AD-11's receipt records only what a save created and "never reverts changes to documents that existed before the save"; State Patterns L207 still defines Undo as "Removes what the action created, per FR-15". This is not in "Changes to the sources". *Fix:* add the row for architecture, and define what Undo restores per action — or keep Undo for creations and removal only.
- **high** Nobody owns the routes. The architecture defers them to UX ("The route list above may be renamed by them before the first screen story"); EXPERIENCE.md changes `/` and the meaning of `/books/new` (L288) and then hands routes back to architecture (Open item 6, L344). The IA table has no address column, yet L262 depends on addresses. *Fix:* add an address per surface (`/`, `/login`, `/scan`, `/loans`, `/wishlists`, one wishlist, `/settings`, the open-book parameter), or get the architecture amended before the first screen story.
- **medium** Two contradictions with the sources are not in "Changes to the sources". Settings Delete "says what will lose its location, Person or tag" (L189), but AD-18 and slice J6 say "a Person with loans or entries cannot be deleted". Email is an editable field and "Change password" opens a dialog (L182), but changing email is FR-6, Phase 2 (architecture, Deferred), and no FR covers changing a password. *Fix:* follow the sources, or add both rows to the table.
- **medium** Additions not listed in "Changes to the sources": Rename, Merge and Delete for locations, People and tags (memlog L64; no FR, no service, no slice); the theme switch; new list and entry removal. STORY-SLICING is a listed source and is not addressed: E5 (home screen), D11–D14 (review before save), E6 (paged list), E8 (detail page) and K5 (profile screen) are removed or reshaped by this spine. *Fix:* add the rows, including one per affected slice.
- **medium** The product is "Bookie" in the PRD and the architecture and "bookeh" in both spines, the mock-ups and the UJ-1 flow (L298). No memlog entry or table row records a rename; the PWA manifest (slice K1), sign-in and page title need one name. *Fix:* decide and record it.
- **low** Memlog L60 limits lowercase to "large headings and buttons only"; DESIGN L247 extends it to group headings and text switches, resting on mock-up acceptance (L89) alone. Memlog L23 (detail contents, Move action) and L62 (loan history in the detail) live only in the mock-up. *Fix:* record the extension; move L23 and L62 into spine text (see 3).
- **low** Terms: the PRD's "chips" (In library, Ordered, Wishlist) became headings and lines, while "Filter chip" names something styled as a Link in a system with "no filled chips"; "tags" and "personal tags" alternate (the Glossary term is personal tag); "books" is used for both Books and copies (see the first finding). *Fix:* rename Filter chip or note the difference; use the Glossary terms.

## 8. Shape fit — strong

DESIGN.md: all eight sections, in canonical order (Brand & Style, Colors, Typography, Layout & Spacing, Elevation & Depth, Shapes, Components, Do's and Don'ts). EXPERIENCE.md: Foundation, Information Architecture, Voice and Tone, Component Patterns, State Patterns, Interaction Primitives, Accessibility Floor and Key Flows are present, as are the two triggered sections, Responsive & Platform and Inspiration & Anti-patterns. Invented sections: Motion (earns its place: memlog L67), Changes to the sources (earns it; the most useful section for architecture), Open items (earns it).

### Findings

- **low** "Changes to the sources" sits between Inspiration & Anti-patterns and Key Flows; the examples end on Key Flows. Moving it, with Open items, to the end keeps the canonical run intact. Open items starts at 2; item 1 is missing or the list was not renumbered.
- **low** Both files are `status: draft`. DESIGN.md frontmatter carries `status` and `updated`, which the spec does not define (harmless), and keeps stroke weights and the panel width under `spacing` (acceptable; the spec has no border key).

## Mechanical notes

- **Token references:** 166 in total, 0 unresolved. `{path.to.token}` at EXPERIENCE L20 is the syntax example, not a reference. `{person}`, `{date}`, `{list}`, `{from}`, `{to}` are copy placeholders and share the brace syntax with tokens; consider `<person>`.
- **Frontmatter:** DESIGN.md has `name`, `description`, `colors`, `typography`, `rounded`, `spacing`, `components`. EXPERIENCE.md has `name`, `status`, `sources`, `updated`. Sources are repo-relative and all four exist. The background sources in memlog L6 (brief, SPEC.md) are not listed, which is fine.
- **Name mismatches between the files:** `marker` (frontmatter) / "Lent marker" (both tables) / "the marker before an error message" (DESIGN L217); "Book row / Cover tile" as one row in EXPERIENCE.md and two in DESIGN.md; "Close (X)" against "close button" (EXPERIENCE L94, L95); "Returned" for both a Link and a group (L161, L162); "Edit book" against "the review screen" (L44, L145); "Filter panel" against "filters" (L111); "Wishlist" (one list) against "Wishlists" (section) against "list of lists".
- **Frontmatter component objects with no table row:** none. **Table rows with no frontmatter object:** Back link, Filter chip, Cover placeholder, Close (X), Camera frame.
- **Unreferenced tokens:** `spacing.2`–`spacing.6`, `typography.body`, `typography.heading-section-phone` (the last two appear in the role table by name only).
- **Stated versus computed contrast:** dark text is stated as 14.3:1 and computes to 14.47:1; everything else matches.
- **Citations:** FR-31 at EXPERIENCE L91 should read FR-31, FR-34, FR-17. "Architecture AD on shelf paging" (L289) is AD-7; naming it would help.
- **Mock-up header comments:** `key-wishlists.html` lists "Wishlist picker" and `key-loans.html` lists "Lend"; neither is drawn.
- **`.working/` references from DESIGN.md** (L203, L227, L274) resolve today, but the folder is hidden and holds rejected options.
- **Review files:** no other review file exists in the workspace; this is the rubric lens only.
