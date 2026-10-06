# Validation Report — bookeh

- **DESIGN.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/DESIGN.md`
- **EXPERIENCE.md:** `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/EXPERIENCE.md`
- **Run at:** 2026-10-05T16:39

## Overall verdict

The pair is well shaped, lean, and mechanically clean: every one of the 166 token references resolves, every colour has a hex value and a light/dark pair, the stated contrast figures check out, and every user decision in the memlog is reflected with none contradicted outright. The scan → answer → save path, the collection, and loans are committed well enough to build from.

It is not yet a safe contract. Eight high findings leave load-bearing decisions open or in conflict: whether a collection row is a Book or a copy, Undo promised far beyond what the architecture's receipt supports, a "one primary button" rule that the accepted mock-ups break on four screens, no owner for routes, and three surfaces a consumer cannot build from the text (Book detail, Lookup, and the dialog/combobox/picker overlays). No critical findings.

Finding counts: 0 critical, 8 high, 23 medium, 20 low.

The look is decided and the mock-ups are coherent, but the behaviour spine is not yet buildable story by story: it never says whether a collection row is a copy or a Book, the book detail has no way to do half of what FR-26, FR-28 and FR-29 require, and it promises Undo on every action while the architecture can only undo a save. Around that core sit a dozen places where the builder must invent a screen (Lookup, the filter panel, pickers and dialogs, phone select mode) or pick between two statements that disagree. Four decisions from Mika and one pass to add the missing controls and overlay specs would close most of it; the visual system itself needs only small repairs.

Counts: 4 critical, 12 high, 14 medium, 9 low.

Both reviews were run on the draft of 5 October 2026, before the final edits. Every critical and high finding was then either decided by Mika (one row per copy; copy actions on each copy's line; Undo for saves and simple reversals; outlined rating stars; the save toast goes when the next answer opens; the wishlist recipient is set on the entry; no Ordered button on the answer) or closed by the drafter in the spines and regenerated mock-ups. Drafter choices are tagged [ASSUMPTION] or listed under Open items in EXPERIENCE.md. Medium and low findings were applied where they were cheap; the rest stand as recorded below.

## Category verdicts

- Flow coverage — adequate
- Token completeness — adequate
- Component coverage — thin
- State coverage — adequate
- Visual reference coverage — adequate
- Bloat and overspecification — strong
- Inheritance discipline — thin
- Shape fit — strong

## Findings by severity

### Critical (4)

**[Adversarial]** — A collection row is never defined as a copy or a Book (EXPERIENCE § Information Architecture, § Component Patterns, § Select mode; DESIGN § Layout & Spacing)
The collection is "The user's copies"; a row "always ends with the copy's location"; Move "Applies to every selected copy". But tapping a row "opens Book detail", the bar "Marks the Book whose detail is showing", Read "Marks all selected Books read", the dialog asks "Remove 12 books from library?" and the count reads "14 books". The mock-ups disagree with each other: the wide mock opens *Täällä Pohjantähden alla 1* with two copies ("Tampere Owned", "Mökki Lent to Antti since 12 Sep") yet the list has one row for it, ending in plain "Mökki" with no lent marker, while `key-loans.html` lists the same title as out with Antti. The architecture returns copies (`ShelfPage = { items: { copyId, bookId }[] }`). *Why it hurts:* this decides the list key, what the count counts, whether two rows light up when one Book is open, what the opened address identifies, what Remove removes, and what a row for an ordered copy ends with (never stated). Every collection story depends on it.
Fix: OWNER DECISION. (a) One row per copy, as the architecture pages: a Book with two copies shows twice, the open-row bar and the address carry the copy, counts say what they count, an ordered row ends in "Ordered". (b) One row per Book with a summary ("Tampere +1"), which needs a grouped shelf query and is a change to AD-7. Recommend (a). Then fix the mock row and add the rule for ordered copies.

**[Adversarial]** — Copy-level actions sit on a Book-level panel with no way to say which copy (EXPERIENCE § Loans "Lend", § Edit book; DESIGN § Components "Detail panel … Buttons at the foot")
The foot has "Lend Move Edit". The approved mock shows a Book with two copies, one already lent, and a single Lend button. Edit book carries "status (owned / ordered / wishlist), location", both fields of one copy. Notes are per copy in the architecture (AD-8: "notes are on `copies`") but the panel has one "Notes" group. *Why it hurts:* Lend, Move, Edit's status and location, notes and removal cannot be wired for any Book with more than one copy, and the PRD says duplicates are real (FR-30).
Fix: OWNER DECISION, because memlog line 23 accepted "actions Lend / Move / Edit". (a) Move the copy actions onto each line of "Your copies" (Lend or Returned, Move, Received, Remove, that copy's note) and keep only Book-level actions at the foot (Edit, Add to wishlist). (b) Keep the foot and open a "which copy" picker when there is more than one. Recommend (a); it also removes status and location from Edit book.

**[Adversarial]** — Read, rating, notes, single-copy removal, Received and Returned have no control on an opened book (EXPERIENCE § Information Architecture "Book detail", § Edit book; PRD FR-26, FR-28, FR-29; memlog line 62)
FR-26 requires the detail to show copies, wishlist entries, loans, read flag, rating, notes and tags "and supports inline editing". The spine gives the detail three buttons, and Edit book's field list ("subtitle, authors, series, number in series, publisher, year, language, pages, genres, description" plus status, location, tags) contains no read flag, no rating and no notes. A rating can never be entered. Read can only be set through select mode. "Remove from library" is named as the destructive button but appears only in the bulk bar. "Received" exists only on the scan Answer, and "Returned" only on a Loans row. Loan history "in each book's detail panel" (memlog 62) and the Book's wishlist entries (FR-26) are not in the panel spec or the mock. `STORY-SLICING.md` has stories E9–E12, H8 and J4 for exactly these controls. None of this is in "Changes to the sources". *Why it hurts:* six stories have no screen to build.
Fix: specify the controls on the detail (a read / unread text switch, a rating control, an editable note per copy, Remove per copy, Received on an ordered copy, Returned on a lent copy, a loan-history group, a wishlist line), or list each omission in the changes table. OWNER DECISION on the rating's look: the mock's "★★★★☆" is a row of filled glyphs that Open Sans does not carry, against "No fills" and "Don't add icons".

**[Adversarial]** — Undo is promised for every action; the architecture can undo only a save (EXPERIENCE § Component Patterns "Toast", § Select mode, § Loans, § Wishlists, § State Patterns "Undo"; architecture AD-11, AD-18)
"After every save, move, lend or removal … other actions offer **Undo**", and bulk Move, Tag, Read and Remove, Returned, Bought, Ordered and wishlist Remove each say "Toast with Undo". AD-11's receipt "records the documents the save created and the entries it closed" and "never reverts changes to documents that existed before the save". AD-18: "deleting a copy deletes its loans". The spine's own definition, "Removes what the action created, per FR-15", has no meaning for a move, a read flag or a removal. Undo after an Edit-then-Save from the toast is not defined either (does it revert the edit or remove the book?). Not in the changes table. *Why it hurts:* a builder either invents an undo mechanism per action, including resurrecting a deleted copy with its loans and note, or ships toasts whose Undo does nothing.
Fix: OWNER DECISION. (a) Keep Undo only where AD-11 provides it (Add to library, Add to wishlist, Add another copy, Bought, Ordered). (b) Also give Move, Tag, Read, Lend and Returned an Undo that is a plain inverse action using the previous values, and state that. (c) For removals, either confirmation with no Undo, or a spine change (soft delete). Whatever is chosen, add a table: action, toast text, Undo yes or no, how it is undone, and carry it to the architecture.

### High (20)

**[Rubric: Flow coverage]** — Lookup by title or author (FR-20, UJ-1 step 2; the PRD Build Order says "Search is on the phone in this phase, because checks in webshops de
Lookup by title or author (FR-20, UJ-1 step 2; the PRD Build Order says "Search is on the phone in this phase, because checks in webshops depend on it") has one IA row (EXPERIENCE L42) and nothing else: no flow, no behaviour table, no states (searching, no results, sources unreachable while own results exist), no layout for own-collection versus outside results, no mock-up. The IA also contradicts itself on what tapping a lookup result does: Book detail (L32, L92) or Answer (L43).
Fix: add a "Lookup" subsection under Component Patterns, the missing states, and a short flow ("Webshop check by title"); pick one target for a result tap.

**[Rubric: Flow coverage]** — A wishlist entry's recipient cannot be set.
A wishlist entry's recipient cannot be set. FR-38 ("an entry can be marked as *for* a Person") is displayed (L172, L173) but no surface sets or changes it: the Wishlist picker only chooses a list (L39, L140) and the opened entry offers Bought, Ordered, Remove (L174–176).
Fix: say where the recipient is chosen (picker step, or a field on the opened entry) and whether it can be changed later.

**[Rubric: Component coverage]** — The three overlays besides the sheet and panel have no row in either file.
The three overlays besides the sheet and panel have no row in either file. **Dialog** carries every destructive confirmation and Change password (EXPERIENCE L86, L88, L123, L176, L182, L188, L189, L220, L245); DESIGN.md says only "outlined boxes on the plain ground" (L280) and reserves the scrim for the sheet (L197, L218). **Combobox** is named in Foundation (L20) and used for location, Person, tags and default location (L91, L185); its popup and highlighted option have no visual spec, and the no-fill, no-shadow rules make the default non-obvious. **Picker** is "a bottom sheet" on the phone (L95) and undefined on wide screens.
Fix: add Dialog, Combobox and Picker rows to both tables: position, width, scrim or not, option highlight, button order, keys, and the wide-screen form.

**[Rubric: Component coverage]** — Book detail has no behavioural spec.
Book detail has no behavioural spec. The IA row lists contents (EXPERIENCE L32) and DESIGN L310 gives the frame, but nothing says how read, rating and notes are edited (FR-26 "supports inline editing"), what the rating control is (no component; the mock-up prints "★★★★☆"), where loan history shows (memlog L62: "as well as in each book's detail panel"), where wishlist entries show (FR-26), or which actions exist. Lend / Move / Edit appear only in the mock-up (memlog L23); Returned, Received, Remove from library and Add to wishlist are not placed on the detail at all, though STORY-SLICING J4, H8 and E12 expect them there.
Fix: add a "Book detail" subsection like the others: groups, per-copy versus per-Book actions, edit-in-place rules, and a Rating row in both Components tables.

**[Rubric: Visual reference coverage]** — The accepted mock-ups break the one-primary rule on four screens.
The accepted mock-ups break the one-primary rule on four screens. DESIGN L225 ("At most one primary button per screen"), EXPERIENCE L86 and L48 ("Scan book is the one primary button on every section") against: wide collection (Scan book and Lend), phone sheet (Scan book and Lend), wishlist entry (Scan book and Bought), select mode (Scan book and Done — and EXPERIENCE L98 says the bar "replaces Scan book", which the wide mock-up does not do). Because the spines win, a consumer must demote Lend and Bought or hide Scan book, and neither is what Mika accepted (memlog L89, L93).
Fix: restate the rule as one primary per layer (section, panel or sheet, dialog, action bar), list Lend, Bought and Done under Button, primary, and say whether Scan book hides in select mode on wide screens.

**[Rubric: Inheritance discipline]** — Book versus copy is never settled for the collection.
Book versus copy is never settled for the collection. "The user's copies" (EXPERIENCE L31), "Pick several books" (L34), "every selected copy" (L120), "all selected Books" (L122), "Remove 12 books" (L123), "the Book whose detail is showing" (L99), "14 books" (L112); DESIGN L270 treats a row as a copy; AD-7 returns copy ids; the mock-ups show a Book. Undecided: what a row is, what the counts count, and what Lend, Move, Remove and Edit book's status and location act on when a Book has two copies (FR-30).
Fix: commit to one (for example: one row per copy, detail keyed by Book with per-copy actions in "your copies") and align the wording, counts and mock-up.

**[Rubric: Inheritance discipline]** — Undo is promised well beyond AD-11.
Undo is promised well beyond AD-11. A toast with Undo follows move, bulk tag, bulk read, bulk remove, lend, Returned, Bought, Ordered and entry Remove (EXPERIENCE L96, L120–123, L161, L174–176). AD-11's receipt records only what a save created and "never reverts changes to documents that existed before the save"; State Patterns L207 still defines Undo as "Removes what the action created, per FR-15". This is not in "Changes to the sources".
Fix: add the row for architecture, and define what Undo restores per action — or keep Undo for creations and removal only.

**[Rubric: Inheritance discipline]** — Nobody owns the routes.
Nobody owns the routes. The architecture defers them to UX ("The route list above may be renamed by them before the first screen story"); EXPERIENCE.md changes `/` and the meaning of `/books/new` (L288) and then hands routes back to architecture (Open item 6, L344). The IA table has no address column, yet L262 depends on addresses.
Fix: add an address per surface (`/`, `/login`, `/scan`, `/loans`, `/wishlists`, one wishlist, `/settings`, the open-book parameter), or get the architecture amended before the first screen story.

**[Adversarial]** — The scan loop will re-read the book that is still on the table, and the toast outlives its screen (EXPERIENCE § Component Patterns "Camera frame", "Toast"; § Answer screens; UJ-2 step 3)
"A read barcode goes straight to the Answer with no confirm tap", and Add to library "returns to Scan". The book just saved is still under the camera, so the next read is the same ISBN and the user lands on "In library". Meanwhile "It stays for about 8 seconds, or until the next result replaces it" and "He scans the next book while the toast is still there": the toast "Saved to Tampere · Edit · Undo" for book A is then on screen over book B's Answer, directly above or on top of B's pinned buttons, and Edit and Undo no longer refer to what the user is looking at. Also unstated: whether the camera keeps decoding while "Looking up" is in flight, whether the stream stays alive under Answer and Edit book ("released on exit" could mean either; restarting it on iOS costs a second or more per book), and what a non-ISBN EAN barcode does (the "Not an ISBN" state covers only the typed field).
Fix: ignore a just-handled ISBN until a different code is read or a few seconds pass; pause decoding during lookup and while Answer or Edit is up; keep the stream alive for the whole Scan task; treat a non-ISBN read as a quiet "Not an ISBN" on Scan. OWNER DECISION on the toast: dismiss it when a new Answer opens (Undo is lost early), or show it only on Scan and let it return if time remains.

**[Adversarial]** — The filter panel is named but not specified, and filter chips collide with it (EXPERIENCE § Collection controls "Filter"; § Component Patterns "Filter chip"; PRD FR-25)
The whole spec is "Fields per FR-25, combined with AND" plus sort "in the same panel". FR-25 lists twelve fields; the mock shows five short option lists and "Sort by Author Title Year Added". Not stated: whether options in one field are single-choice or multi-choice; if multi, whether two locations mean OR (AND would always be empty for location, status and read, but is meaningful for tags and genres); how author, series and publisher (hundreds of values) appear; how year, pages (FR-25: "as a range") and rating are entered; sort direction; the default sort; whether the phone sheet applies live or on close. For chips, "Tapping one adds that value to the collection's active filters; filters already active stay" does not say what happens when that field already has a different value (author Linna active, tap chip Jansson), nor what a chip does on a book opened from Loans, a wishlist or the Answer, where no collection list is on screen.
Fix: add a per-field table (control, single or multi, OR or AND within the field, URL parameter) and a sort rule. OWNER DECISION on within-field logic and on same-field chips (replace, or add as OR). State that a chip tapped outside the collection goes to the collection with only that filter.

**[Adversarial]** — Select mode is not thought through against the open book, filters, endless scroll or a phone (EXPERIENCE § Select mode; § Collection controls; key flow "Moving a box to the cottage")
(1) The flow contradicts the filter: "He filters to Tampere, and ticks the twelve … the twelve rows now end in 'Mökki'". With the Tampere filter still active those rows no longer match; nothing says whether they vanish or stay until the next query. (2) He "clicks **Select** … He filters to Tampere": nothing says whether changing a filter or the search keeps the selection, or whether rows filtered out of view stay selected and are counted in "12 selected". (3) There is no "select all", so moving the 31 Tampere books is 31 ticks; if it is added, it must say whether it covers rows not yet loaded. (4) Entering select mode with the detail panel open: does the panel close, and what does `Esc` do first? (5) The phone bar is "the count, then Move, Tag, Read, Remove, and Done", five outlined buttons and a count at 15px, roughly 480px of content on a 320 to 390px screen; there is no phone mock of select mode. (6) What the buttons do with nothing selected (see the missing disabled state). (7) A sideways swipe during select mode.
Fix: state that moved rows stay in place until the list is next queried (or leave, with the toast as the only trace); that the selection survives filter changes and is cleared only by Done; whether a select-all exists; that opening select mode closes the detail. OWNER DECISION on the phone bar: two rows, or Move and Done visible with the rest behind "More".

**[Adversarial]** — Lookup by title or author is one line, and contradicts itself on what a tap does (EXPERIENCE § Information Architecture; PRD FR-20; architecture AD-9, AD-14)
The only spec is "Search own collection and the outside sources by title or author". The IA table says Book detail is reached by "Tapping a book in … a lookup result" and also that Answer is reached by "a lookup result tapped"; Component Patterns says rows in "lookup results" open Book detail. Missing: whether it searches on typing or on submit (the lookup is rate-limited per user), how own books and source results are ordered and told apart, the loading, empty and sources-down states, what a source result with no ISBN does (`LookupResult` and `SaveInput` are keyed by ISBN or Book id), and where the Answer's "Back" goes ("Back only returns to the camera" loses the result list). Rows are specified with a cover, but AD-14 lets an unsaved cover load only "for an ISBN-13 from the lookup cache", which search results are not in. No mock exists. PRD Build Order calls this out as needed in Phase 1 "because checks in webshops depend on it".
Fix: specify the screen: submit on Enter; own books first under a heading, then source results; own result opens Answer "In library", source result opens Answer for its ISBN; Back from such an Answer returns to the results; placeholder covers for source results unless the architecture extends the cover route.

**[Adversarial]** — A wishlist entry's recipient can never be set, and lists cannot be managed (EXPERIENCE § Wishlists; § Answer screens; PRD FR-38)
FR-38: "An entry can be marked as *for* a Person". Add to wishlist "opens the Wishlist picker every time; the user taps a list" and returns to Scan; the opened entry offers only "Bought Ordered Remove". No step sets or changes "for {person}", yet the mock rows show "For Äiti". Also missing: renaming or deleting a wishlist (the destructive button's uses include "deleting a … wishlist" but no control exists), moving an entry to another list, what the picker shows with zero lists (the state of a fresh install, so UJ-1's variant fails on day one), and where "Add to wishlist anywhere" appears outside the Answer. Status "wishlist" on Edit book needs a list too (FR-13: "wishlist with a chosen list").
Fix: add an optional "For" combobox to the picker, or to the opened entry; put "New list" inside the picker; add Rename and Delete to an opened wishlist. OWNER DECISION on where the recipient is set: in the picker (one more optional field in the shop) or afterwards on the entry.

**[Adversarial]** — The Answer screens drop FR-28's "Ordered" and FR-20's "every chip that applies" without saying so (EXPERIENCE § Answer screens; PRD FR-20, FR-21, FR-28)
FR-28: "Users set **Ordered** from search, the book page or a wishlist entry, for example after buying online." "Not in library" offers "Add to wishlist · Add to library · Back"; the only route to an ordered copy is Add to library, Edit, change status. FR-20 wants every chip that applies; the headings are exclusive ("On wishlist: The Book is only on a wishlist"; "Ordered: The user's only copy is ordered"), so an owned Book that is also on the Christmas list for Äiti shows nothing about the list, and "In library" has no Add to wishlist for a gift copy. "Add another copy" has no stated result (toast, location, return to Scan). None of this is in the changes table.
Fix: keep the heading as the main answer and add one line per other fact ("Also on Christmas · for Äiti"). OWNER DECISION: add "Ordered" as a fourth button on "Not in library", or record in the changes table that ordering goes through Edit. State that Add another copy behaves exactly like Add to library.

**[Adversarial]** — Settings contradicts the architecture in four places, none listed (EXPERIENCE § Settings; architecture AD-18, AD-19, § Deferred)
(1) Delete "says what will lose its location, Person or tag", but AD-18: "a Person with loans or entries cannot be deleted". (2) "Merge … everything moves to it" exists nowhere in the architecture, which lists only deletes. (3) "Display name and email are Text fields saved on leaving the field", but email change (FR-6) is deferred to Phase 2, email is the sign-in name, and there is no reset link in Phase 1: one typo on blur locks the only user out of the app and the back office. (4) Renaming to a name that already exists hits the unique `(owner, nameKey)` constraint with no stated outcome. Also missing from the table but present in the mock: "Add location" and "Add person"; and whether the default-location combobox can be cleared.
Fix: for Person delete, OWNER DECISION: block with a message ("Antti has 2 loans. Merge instead."), or change AD-18. Add Merge and inline Rename to the changes table. Make email read-only in Phase 1, or give it an explicit Save with the current password. Offer Merge when a rename collides.

**[Adversarial]** — Routes, history and "Back" are left to open item 6, and they are the skeleton (EXPERIENCE § Responsive & Platform; § Changes to the sources; § Open items 6; § Interaction Primitives)
The spine removes `/books` and `/books/new`, says "An opened book has its own address … Opened directly, the address shows the collection with that book open", then leaves "How the open book and endless scrolling map onto routes and URL parameters" open. Unanswered: the address of a book opened from Loans or a wishlist (if it is `/books/[bookId]`, a reload moves the user to the collection); whether a section change adds a history entry; what the system Back does on Answer and on Scan (forty scans could mean eighty history entries); what Scan, Answer, Lookup and Edit book are called; how scroll position is restored after Back when the open row was on page 7. "Back" means three things: the system Back that "closes" the sheet, the Answer's Back button, and the "Back link" component. The phone swipe is under-specified too: "the current section's heading leads the row" implies a rotating, wrapping order (the settings mock shows "Settings Collection"), but whether a swipe wraps, whether the finger drags the content or a flick triggers the change, and how it coexists with the iOS and Android edge-swipe for Back, a half-open sheet, a text field and select mode are not stated.
Fix: add a route table to EXPERIENCE (address, parameters, what Back does) before the first screen story; for example the open book as `?book=<id>` on whichever section is showing, filters and sort as parameters, Scan and Answer replacing rather than pushing history. Ignore swipes that start within 20px of a screen edge, inside a sheet or in select mode. Rename the Answer button if "Back" stays ambiguous.

**[Adversarial]** — Dialogs, dropdowns, pickers and several controls have no visual spec, and the rules forbid the usual answers (DESIGN § Components, § Elevation & Depth; EXPERIENCE § Foundation)
The headless library is there "for the dialog, sheet, combobox and menu", and the behaviour relies on confirmation dialogs, a change-password dialog, location, tag, wishlist and Lend pickers, a date field and comboboxes. DESIGN's component table has none of them. The only guidance is "Toasts and dialogs are outlined boxes on the plain ground", with the scrim reserved ("The one exception is the {colors.scrim} behind the bottom sheet") and shadows forbidden. So: does a dialog dim the page; what is a combobox list (outlined box, and how is the highlighted option shown with no fill and no tint); what is a "picker" on a wide screen, where "Bottom sheet … pickers" does not apply; what does the date field look like. Also undefined: **disabled** (bulk buttons with nothing selected, Save in flight, Lend on a lent copy), which cannot borrow {colors.text-dim} because that is "Inactive section headings and inactive switch options only"; **focus**, which EXPERIENCE sets as an "outline in {colors.accent}" that is invisible on the primary button (already a 2px accent outline) and has no width or offset; a focused **text field**; and the **filter option**, which the mock draws with an 8px coral square that is also the lent marker.
Fix: add rows for Dialog (2px text outline, scrim allowed), Listbox option (highlighted option gets the 4px accent bar at its left, chosen option a tick), Picker (sheet on phone, dialog on wide), Date field, Disabled (state the token; needs one, for example text at 50% with a border-colour outline), Focus (2px accent, 2px offset, on every control) and Filter option. OWNER DECISION on the highlighted-option treatment and the disabled look.

**[Adversarial]** — Edit book still describes a pre-save review screen (EXPERIENCE § Edit book; § Changes to the sources; § Open items 4)
The changes table says "The review screen edits an already saved Book and copy", yet: "Location: Pre-set to the default location" (it must show the copy's current location, or opening Edit on a Mökki copy moves it to Tampere on Save); "a note for any author, series or genre that is new (FR-13)" (after the save they already exist, `SaveResult` carries no such flags, and from the detail weeks later the note is meaningless; the moment it protects, before a near-duplicate author is created, is the Answer screen, where `LookupResult.matches` has it); status "owned / ordered / wishlist" on a saved copy means deleting the copy and creating an entry on an unnamed list, which the spine leaves as open item 4. Also unstated: whether the title is editable (it is on the first screen but not in the "More details" list, and "Every field is editable" refers to that list); what X, Back or `Esc` does with unsaved changes; and the wide layout. Scan, Answer and Edit book are "Full screen" with no wide mock, although the desktop is "for tidying and bulk edits", so fixing one field hides the list and panel that were "nothing is hidden".
Fix: location shows the copy's value; move the "new author" note to the Answer screen; drop "wishlist" from the switch on a saved copy; list title among the editable fields; discard silently on X only if nothing changed, otherwise OWNER DECISION (ask, or keep a draft). OWNER DECISION on wide screens: Edit inside the detail panel, or full screen.

**[Adversarial]** — Errors and waits ignore the architecture's error model (EXPERIENCE § State Patterns; architecture § Consistency Conventions "Errors", AD-9, AD-10)
The spine has one failure string, "Couldn't save. Try again.", while the architecture maps each `ErrorCode` to the message key `errors.<CODE>` and returns `fields?: Record<string, ErrorCode>` for validation. No surface shows a field error except the ISBN field ("Title and author fields, both required" on Not found: how is a missing one shown?). "Sources unreachable: Treated as Not found, with 'Sources didn't answer'" needs a distinction that `LookupResult` (`existing | source | none`) does not carry, since a source "returns `SourceResult` or nothing and never throws". The lookup rate limit has no state. "No connection: Any: … in a toast" cannot hold for navigation, because with server components and no service worker a section change offline gives the browser's error page, not a toast. An error toast that disappears after 8 seconds is not addressed.
Fix: state that toast text comes from `errors.<CODE>` and give the copy per code; add a field-error rule for every form; ask the architecture for a fourth lookup outcome (for example `{ kind: 'none', sourcesFailed: true }`) or drop the distinction; limit "No connection" to actions; keep error toasts until dismissed.

**[Adversarial]** — "One primary button per screen" is broken by every approved mock (DESIGN § Colors "At most one primary button per screen"; EXPERIENCE § Component Patterns "One per screen at most", "Scan book … on every section")
Scan book is primary on every section, and the mocks add a second coral outline beside it: "Lend" in the detail panel and sheet, "Done" in the action bar (the wide mock keeps Scan book in the header although the spine says the bar "replaces Scan book while select mode is on"), "Bought" on the wishlist entry. EXPERIENCE's own list of primaries does not include Lend, Done or Bought. Mika approved the mocks "as shown". *Why it hurts:* a builder told "the spines win" will demote Lend, Done and Bought and get a screen the owner did not approve.
Fix: OWNER DECISION: restate the rule as one primary per surface (page, panel or sheet, dialog, bar) and list Lend, Done and Bought; or make them secondary and correct the mocks. Say whether Scan book stays visible at the top right on wide screens during select mode.

### Medium (37)

**[Rubric: Flow coverage]** — No Key Flow for wishlists (F7: FR-38, FR-39, and the bought/ordered rule in FR-28), although it is a Build Order item with its own section.
No Key Flow for wishlists (F7: FR-38, FR-39, and the bought/ordered rule in FR-28), although it is a Build Order item with its own section. A flow would have exposed the recipient gap above.
Fix: add "A gift for Äiti": add to Christmas for a Person, later tap Bought, no copy created.

**[Rubric: Flow coverage]** — "Lending a book and getting it back" has no failure path (L328–334).
"Lending a book and getting it back" has no failure path (L328–334).
Fix: add one: the copy is already lent, or Returned tapped on the wrong row and undone.

**[Rubric: Token completeness]** — EXPERIENCE L243 says "Text meets 4.5:1 … in both modes", but `text-dim` is text at 3.2:1 / 3.3:1.
EXPERIENCE L243 says "Text meets 4.5:1 … in both modes", but `text-dim` is text at 3.2:1 / 3.3:1. That passes for the 44/38px headings (large text) and fails for inactive Text switch options at 17px/400 (DESIGN L214, L241). The memlog decision (L69) was a 3:1 target.
Fix: state the exception in the Accessibility Floor, or darken `text-dim` for switches.

**[Rubric: Token completeness]** — `border` is 1.30:1 light and 1.41:1 dark, and no ratio is stated for it.
`border` is 1.30:1 light and 1.41:1 dark, and no ratio is stated for it. It is the only mark of an empty Text field (DESIGN L215, L304) and of the Cover placeholder (L307), which conflicts with "lines that carry meaning meet 3:1" (EXPERIENCE L243).
Fix: state the ratio and declare those lines decorative, or use `text-dim` for the empty underline.

**[Rubric: Token completeness]** — No focus state exists in DESIGN.md.
No focus state exists in DESIGN.md. EXPERIENCE L244 requires "a visible focus outline in {colors.accent}", but there is no token, width or offset, and a 2px accent outline on a focused secondary button is exactly the primary button's look.
Fix: add a `focus` component token and a Components row (offset outline, or a different mark).

**[Rubric: Token completeness]** — The spacing scale is defined but never assigned: `spacing.2` to `spacing.6` are referenced nowhere, and no component has padding, gap or hei
The spacing scale is defined but never assigned: `spacing.2` to `spacing.6` are referenced nowhere, and no component has padding, gap or height. Consumers will copy mock-up literals (button `6px 16px`, tools gap 26px, row gap 16px, heading gap 28/22px), several off the 4px scale.
Fix: add padding/gap keys to the component tokens.

**[Rubric: Component coverage]** — Filter panel is a surface with no DESIGN.md row (width, option appearance; the mock-up marks the active option with the 8px accent square, w
Filter panel is a surface with no DESIGN.md row (width, option appearance; the mock-up marks the active option with the 8px accent square, which the spine reserves for "lent" and errors) and thin behaviour (EXPERIENCE L111): no control per FR-25 field (ranges for year and pages, rating, a long author list), no rule for several values in one field, no default sort or direction, no way to close it on wide screens, no sheet behaviour on the phone.
Fix: a Filter panel row in DESIGN.md and a field table in EXPERIENCE.md.

**[Rubric: Component coverage]** — No state appearance for any component: hover, pressed, disabled and focus are absent (the DESIGN.md spec asks for "state appearance").
No state appearance for any component: hover, pressed, disabled and focus are absent (the DESIGN.md spec asks for "state appearance"). Disabled is needed for Not found with empty required fields, Lend on a lent copy, and the action bar at zero selected; with no fills the answer is not guessable.
Fix: one "States" line per interactive component, or a shared rule.

**[Rubric: Component coverage]** — Rows missing across the pair.
Rows missing across the pair. No EXPERIENCE.md row: Link destructive, Back link, List row (all used in L170–189). No DESIGN.md row: Active filters line, the sheet handle that EXPERIENCE L95 says is tapped, the tag input, the empty-state block.
Fix: add the rows or fold them explicitly into an existing one.

**[Rubric: Component coverage]** — The action bar is "pinned to the bottom on phone and wide screens alike: the count, then Move, Tag, Read, Remove, and Done" (EXPERIENCE L98)
The action bar is "pinned to the bottom on phone and wide screens alike: the count, then Move, Tag, Read, Remove, and Done" (EXPERIENCE L98). Six items at button size do not fit a 320–390px phone, there is no wrap or overflow rule, and no phone mock-up of select mode.
Fix: specify the phone arrangement.

**[Rubric: State coverage]** — Select mode: nothing selected (are actions disabled?), select all, whether the selection survives filtering and scrolling (the move flow at 
Select mode: nothing selected (are actions disabled?), select all, whether the selection survives filtering and scrolling (the move flow at L321–322 implies it does), Move with no locations, removing lent copies (AD-18 deletes their loans; the confirmation should say so), partial failure of a bulk action.
Fix: add rows.

**[Rubric: State coverage]** — Scan: the camera re-reading the same barcode right after returning from a save (UJ-2 scans "while the toast is still there"), a barcode that
Scan: the camera re-reading the same barcode right after returning from a save (UJ-2 scans "while the toast is still there"), a barcode that is not an ISBN (the "Not an ISBN" state covers the typed field only), lookup rate-limited (AD-9, slice C7), the first-time permission prompt.
Fix: add rows; state the same-code hold-off.

**[Rubric: State coverage]** — Wishlist picker with no lists (the first shop check before any list exists), "New list" with a name already used, and whether closed (bought
Wishlist picker with no lists (the first shop check before any list exists), "New list" with a name already used, and whether closed (bought) entries stay visible.
Fix: add rows.

**[Rubric: State coverage]** — Settings: rename to a name that exists, Merge when there is only one item, Change password errors, invalid email, empty managed lists, and w
Settings: rename to a name that exists, Merge when there is only one item, Change password errors, invalid email, empty managed lists, and what a toast says after rename / merge / delete.
Fix: add rows.

**[Rubric: State coverage]** — An opened book "has its own address" (L262), but there is no state for an address whose Book the user no longer has (removed, undone, or mis
An opened book "has its own address" (L262), but there is no state for an address whose Book the user no longer has (removed, undone, or mistyped; `runAction` maps it to NOT_FOUND).
Fix: one row: show the collection with a "Not in library" toast, or similar.

**[Rubric: State coverage]** — The ordered copy has no lifecycle outside the Answer: how it shows in a collection row (DESIGN L270 says a row "always ends with the copy's 
The ordered copy has no lifecycle outside the Answer: how it shows in a collection row (DESIGN L270 says a row "always ends with the copy's location, or the lent marker"), where Received is offered (Book detail, row), and which location it gets.
Fix: a row in the density rules and a line in Book detail.

**[Rubric: State coverage]** — Responsive & Platform (L254–262) has two widths and leaves two things open: how the full-screen tasks (Scan, Answer, Lookup, Edit book) are 
Responsive & Platform (L254–262) has two widths and leaves two things open: how the full-screen tasks (Scan, Answer, Lookup, Edit book) are laid out on a wide screen, and what happens between 900px and about 1100px, where the filter panel (220px in the mock-up), the 360px detail panel and the margins leave the list about 250px.
Fix: a row for full-screen tasks on wide; a minimum list width or "one side panel at a time below X".

**[Rubric: Visual reference coverage]** — Type values differ between mock-ups and spine: sheet title 22px against `heading-detail` 26px "in the detail panel and sheet" (DESIGN L238);
Type values differ between mock-ups and spine: sheet title 22px against `heading-detail` 26px "in the detail panel and sheet" (DESIGN L238); settings managed-row name 15px against List row's `title` 17px (L302); placeholder text in `text-dim`, which L214 limits to headings and switch options "only".
Fix: decide each and correct one side.

**[Rubric: Visual reference coverage]** — The collection mock-ups show one row per Book: "Täällä Pohjantähden alla 1" ends in "Mökki" while its detail lists two copies (Tampere, owne
The collection mock-ups show one row per Book: "Täällä Pohjantähden alla 1" ends in "Mökki" while its detail lists two copies (Tampere, owned; Mökki, lent to Antti) and the loans mock-up shows it out. That contradicts DESIGN L270 (location "or the lent marker and borrower"). See the granularity finding in 7.

**[Rubric: Visual reference coverage]** — No final-token mock-up for: Sign in, Lookup, Lend, Wishlist picker, location and tag pickers, any dialog, Filter panel on the phone, select 
No final-token mock-up for: Sign in, Lookup, Lend, Wishlist picker, location and tag pickers, any dialog, Filter panel on the phone, select mode on the phone, Edit book with "More details" open, the full-screen tasks on wide, the "Ordered" and "On wishlist" answers, and sizes s and l (DESIGN L274 points to `.working/wireframes-density-and-detail.html`, a greyscale file that also holds rejected options). The header comments of `key-wishlists.html` and `key-loans.html` claim "Wishlist picker" and "Lend", which they do not show.
Fix: mock the overlays at least; correct the headers.

**[Rubric: Inheritance discipline]** — Two contradictions with the sources are not in "Changes to the sources".
Two contradictions with the sources are not in "Changes to the sources". Settings Delete "says what will lose its location, Person or tag" (L189), but AD-18 and slice J6 say "a Person with loans or entries cannot be deleted". Email is an editable field and "Change password" opens a dialog (L182), but changing email is FR-6, Phase 2 (architecture, Deferred), and no FR covers changing a password.
Fix: follow the sources, or add both rows to the table.

**[Rubric: Inheritance discipline]** — Additions not listed in "Changes to the sources": Rename, Merge and Delete for locations, People and tags (memlog L64; no FR, no service, no
Additions not listed in "Changes to the sources": Rename, Merge and Delete for locations, People and tags (memlog L64; no FR, no service, no slice); the theme switch; new list and entry removal. STORY-SLICING is a listed source and is not addressed: E5 (home screen), D11–D14 (review before save), E6 (paged list), E8 (detail page) and K5 (profile screen) are removed or reshaped by this spine.
Fix: add the rows, including one per affected slice.

**[Rubric: Inheritance discipline]** — The product is "Bookie" in the PRD and the architecture and "bookeh" in both spines, the mock-ups and the UJ-1 flow (L298).
The product is "Bookie" in the PRD and the architecture and "bookeh" in both spines, the mock-ups and the UJ-1 flow (L298). No memlog entry or table row records a rename; the PWA manifest (slice K1), sign-in and page title need one name.
Fix: decide and record it.

**[Adversarial]** — Lowercase by CSS hits user data placed in headings (DESIGN § Typography "Lowercase"; EXPERIENCE § Loans, § Wishlists)
"the user's own place names and tags … are shown as written", but an opened wishlist's "heading is the list's name" and in Loans "Each borrower is a group heading"; both heading roles are lowercased. The mocks render "christmas", "antti", "leena".
Fix: exempt any heading whose text is user data (the mock CSS already has an unused `.gh.n` for it), or OWNER DECISION to accept lowercased names.

**[Adversarial]** — Message patterns that interpolate names cannot be written in Finnish (EXPERIENCE § Voice and Tone)
"Saved to Tampere", "Lent to Antti", "12 moved to Mökki", "Added to Me", "On Christmas · for Äiti" all need the inserted name inflected (Tampereelle, Antille, Mökille), which a message catalogue cannot do. "written natively" does not solve it.
Fix: define name-neutral patterns for both languages ("Saved · Tampere", "Lent · Antti"), which the lent marker already uses.

**[Adversarial]** — The accessibility floor contradicts DESIGN in three places (EXPERIENCE § Accessibility Floor; DESIGN § Colors, § Components)
(1) "Text meets 4.5:1": inactive switch options are 17px text in {colors.text-dim}, 3.2:1 in light and 3.3:1 in dark, and so is the placeholder in the mock. (2) "lines that carry meaning meet 3:1": an empty field's underline in {colors.border} is 1.3:1 in light and 1.4:1 in dark, and with "No box" it is the field's only shape. (3) "Sheets, panels and dialogs … focus moves in, is held while open" contradicts the wide panel, where "Clicking another book swaps the panel's content" and `Enter` opens the focused book: a focus trap would end keyboard browsing of the list.
Fix: exempt switch options explicitly or darken them; use {colors.text-dim} for the empty underline; make the wide panel non-modal with focus left in the list.

**[Adversarial]** — Tap targets: 44px is promised, the specified geometry gives 20 to 30px (EXPERIENCE § Accessibility Floor; DESIGN § Components)
"s m l" at 17px with about 14px between letters, toast actions "Edit" and "Undo" as 13px Links side by side, "Returned" inside a tappable row, "Rename Merge Delete" in one line, the 18px X. The costly one is Undo next to Edit on the cataloguing toast, used one-handed forty times in a row.
Fix: give each a minimum hit area and spacing in DESIGN; widen the switch gaps on the phone; separate Edit and Undo.

**[Adversarial]** — "No fills" is contradicted by its own components (DESIGN § Brand & Style)
"Nothing in the interface is a filled shape … never an area", with one exception, the scrim. But the lent marker is "An 8px {colors.accent} square", the error toast "starts with an 8px {colors.danger} square", the mock's rating is filled stars, and toast, sheet, action bar and panel must be opaque (the YAML gives them `background`). An agent reading the prose literally will make overlays transparent. The section also says "Two rules define the look" and lists three.
Fix: reword to "no tinted or coloured surfaces; overlays are opaque in {colors.background}; the 8px marker is the one solid mark".

**[Adversarial]** — In dark mode the danger outline cannot be told from the accent (DESIGN § Colors)
`#E0566F` against `#FF8E7F` is 1.65:1, two pinks. "Remove" beside "Done" in the action bar and "Delete" beside "Merge" in settings differ only by that hue, against "Nothing depends on colour alone".
Fix: OWNER DECISION: a redder dark danger, or a second cue for destructive controls (a dashed outline, say).

**[Adversarial]** — No locations and first run are only half specified (EXPERIENCE § State Patterns "No locations"; § Answer screens; PRD FR-31, FR-32)
The seeded user starts with no locations and no default. Unstated: the save toast's text ("Saved to …" what?), whether Move in the bar and the panel is hidden, and how the first location is ever created, since "Location: Hidden when the user has no locations" removes the inline-add combobox and "Add location" exists only in the settings mock. The same goes for locations existing with no default chosen.
Fix: toast "Saved"; hide Move; state that the first location is added in settings, or keep the combobox visible while there are none.

**[Adversarial]** — The covers layout is missing most of its states (DESIGN § Layout & Spacing, § Components "Cover tile", "Cover placeholder"; EXPERIENCE "Book row / Cover tile")
A tile shows "title and author beneath" only, so "A row always ends with the copy's location, or the lent marker" and "Shown on any copy with an open loan" do not hold in covers. Where the 4px bar sits on a tile and where the checkbox goes are not said. The placeholder ("the title inside") cannot work at the 16 × 24px of rows s. The approved phone mock shows three columns at m, about 84px each, against "Columns at least 116px wide". Rows at s put title, author, year, publisher and location on one line of a 320px screen with no rule for what gives way.
Fix: add tile rules for lent, open and select states; a plain outlined rectangle below a size threshold; OWNER DECISION on the phone column counts.

**[Adversarial]** — Where the count shows is contradictory (EXPERIENCE § Collection controls; UJ-2 step 6; wide mock)
The active-filters line appears "whenever a filter or search is active" and otherwise "The end of the list shows the total". UJ-2's climax is "the collection's count reads forty higher", and the dark mock shows "37 books" under the search with nothing active.
Fix: always show the count line; add the filter values and "Clear" when something is active.

**[Adversarial]** — The one-overlay rule cannot survive the specified pickers (EXPERIENCE § Interaction Primitives "Banned")
"a sheet may open a picker, and nothing opens on top of that", but Lend is a picker with a Person combobox (a popup) and a date, opened from the sheet; bulk Remove opens a dialog; Move's picker must allow a new location (FR-31).
Fix: say that a combobox list and a date popup are not counted as overlays.

**[Adversarial]** — Toast position is unspecified against everything else pinned to the bottom (DESIGN § Components "Toast"; EXPERIENCE "Scan book … pinned", "Action bar")
"above the bottom edge" competes with the pinned Scan book button, the action bar, the Answer's three stacked buttons and the half-open sheet.
Fix: state that the toast sits above whatever is pinned and above the sheet.

**[Adversarial]** — Token names will mislead a Tailwind 4 build (DESIGN front matter; § Layout & Spacing)
Colours come in `x` and `x-dark` pairs, inviting `bg-background dark:bg-background-dark` on every element instead of one set of variables switched by a theme attribute, which the mocks do and which the light / dark / system switch needs (so `dark:` must not follow the media query). Stroke widths and `panel-width` are filed under `spacing`. "A 4px base scale" is contradicted by the density table's 10px, 3px and 18px and the link's 3px offset, which an agent may round. The filter panel's width (220px in the mock) has no token.
Fix: state the mapping once: semantic variables redefined under `[data-theme=dark]`, strokes as their own variables, the listed values allowed as exceptions; add the filter width.

**[Adversarial]** — Motion asks for things the stack resists (EXPERIENCE § Motion; architecture § Conventions "No inline style objects")
"the list items sweep in from the right in quick succession" needs a per-item delay; "The headings row and the content slide sideways together" between server-rendered routes needs both sections mounted or view transitions; "never block input".
Fix: mark the sweep and the section slide as optional polish with a plain fallback, and cap the stagger at the first screenful.

**[Adversarial]** — Smaller behaviour gaps a builder will hit (EXPERIENCE, various)
The half-open sheet shows "the Book's header and copies", so Lend, used in the lending flow straight after "The sheet slides up", is off screen unless the buttons are pinned. On wide screens at 900px, a 220px filter panel plus the 360px detail leave the list about 320px, and four 44px headings plus Scan book do not fit in 900px. Layout, size and theme "remembered per device" need a cookie, not local storage, or the server renders the wrong one first. The sheet is to come "from the headless primitives", but a draggable two-stop sheet is not something every candidate library ships; check before choosing (open item 5). Whether the heading order also rotates on wide screens (the settings mock says yes) is not stated.

### Low (29)

**[Rubric: Flow coverage]** — No flow for an ordered copy becoming owned (FR-28 Received); the "Ordered" Answer row is still an [ASSUMPTION] (L134).
No flow for an ordered copy becoming owned (FR-28 Received); the "Ordered" Answer row is still an [ASSUMPTION] (L134).
Fix: a three-step flow or a variant under UJ-1.

**[Rubric: Flow coverage]** — Foundation says the desktop is "for tidying and bulk edits" (L18) but the only desktop flow is the bulk move; fixing metadata on a wide scre
Foundation says the desktop is "for tidying and bulk edits" (L18) but the only desktop flow is the bulk move; fixing metadata on a wide screen has no flow, and Edit book on a wide screen is not described at all (see 4).
Fix: a short "tidying" flow, or drop the claim.

**[Rubric: Flow coverage]** — FR-19 (admin re-fetch) is Phase 1 (F2) and STORY-SLICING E13 puts "the admin-only action on the detail page".
FR-19 (admin re-fetch) is Phase 1 (F2) and STORY-SLICING E13 puts "the admin-only action on the detail page". The spine is silent.
Fix: one line saying it lives in the back office, or add it to Book detail.

**[Rubric: Token completeness]** — No typography is assigned to Link, Text field value, the Active filters line, or the book title on Answer / Edit book.
No typography is assigned to Link, Text field value, the Active filters line, or the book title on Answer / Edit book. The mock-ups use 15px, 15px, 13px and 20px/400; 20px/400 is not a token.

**[Rubric: Token completeness]** — `typography.body` and `typography.heading-section-phone` are referenced by no component; `components.text-switch` has no `transform: lowerca
`typography.body` and `typography.heading-section-phone` are referenced by no component; `components.text-switch` has no `transform: lowercase` although DESIGN L247 says switches are lowercase; `components.marker` is called "Lent marker" in the table.

**[Rubric: Token completeness]** — Untokenised values a consumer needs: filter panel width (220px in the mock-up), the 900px breakpoint, motion durations, the density table va
Untokenised values a consumer needs: filter panel width (220px in the mock-up), the 900px breakpoint, motion durations, the density table values (10px, 18px, 3px are off the scale), cover sizes (72 × 108 and the Answer cover).

**[Rubric: Component coverage]** — Button, destructive lists "deleting a location, Person, personal tag or wishlist" (L88), but Settings Delete is a destructive Link (L189), a
Button, destructive lists "deleting a location, Person, personal tag or wishlist" (L88), but Settings Delete is a destructive Link (L189), and no surface offers deleting or renaming a wishlist.
Fix: correct the row; add wishlist rename/delete or say it is not in Phase 1.

**[Rubric: Component coverage]** — Buttons have no height.
Buttons have no height. The mock-up button is about 36px tall against the 44px floor (EXPERIENCE L248); Links in rows (Returned, Rename / Merge / Delete at 13px) and the 18–22px Close X have no hit-area rule.
Fix: a minimum hit area in DESIGN.md.

**[Rubric: State coverage]** — Edit book: closing with unsaved edits, required-field validation.
Edit book: closing with unsaved edits, required-field validation. Toast: Undo failing or unavailable after a restart (AD-11). Loans: no returned loans yet. Sign in: no forgotten-password path in Phase 1 (say so).

**[Rubric: State coverage]** — Answer headings are mutually exclusive (L130–136), while FR-20 says "every chip that applies": owned and also on a wishlist for a Person, or
Answer headings are mutually exclusive (L130–136), while FR-20 says "every chip that applies": owned and also on a wishlist for a Person, or ordered and on a wishlist, lose information.
Fix: allow a second line under the heading.

**[Rubric: State coverage]** — The Answer bullets (L138–143) do not say what "Add another copy" and "Received" do next (toast, return to Scan, location).
The Answer bullets (L138–143) do not say what "Add another copy" and "Received" do next (toast, return to Scan, location).

**[Rubric: Visual reference coverage]** — Details that exist only in mock-ups: lent wording in three forms ("Lent · Antti", "Lent to Antti since 12 Sep", "Mökki · lent to Antti") aga
Details that exist only in mock-ups: lent wording in three forms ("Lent · Antti", "Lent to Antti since 12 Sep", "Mökki · lent to Antti") against one in DESIGN L309; "Add location" and "Add person" Links in settings; the 8px accent square on the active filter option; "★" glyphs for rating; the count line under an opened wishlist's heading.

**[Rubric: Visual reference coverage]** — EXPERIENCE.md links the mock-ups only from the IA table; the Answer, Loans, Wishlists and Settings subsections do not link theirs inline.
EXPERIENCE.md links the mock-ups only from the IA table; the Answer, Loans, Wishlists and Settings subsections do not link theirs inline. DESIGN.md cites `.working/` files as references (L203, L227, L274); that folder is not part of the contract.

**[Rubric: Bloat and overspecification]** — Components are specified twice in DESIGN.md (frontmatter L96–184 and the table L292–317) and have already drifted: `marker` / "Lent marker",
Components are specified twice in DESIGN.md (frontmatter L96–184 and the table L292–317) and have already drifted: `marker` / "Lent marker", `text-switch` without its transform, five table rows with no frontmatter object (back link, filter chip, cover placeholder, close, camera frame). The shadow string appears at L163 and L278.
Fix: let the table carry rationale and anatomy only, or generate one from the other.

**[Rubric: Bloat and overspecification]** — The density table (L261–268) is pixel-specified with values off the 4px scale.
The density table (L261–268) is pixel-specified with values off the 4px scale. The numbers are load-bearing, so they are better as named tokens (`row-pad-s`, `cover-row-m`) than as prose.

**[Rubric: Bloat and overspecification]** — History in a contract: superseded colour values and `.working` pointers (DESIGN L227), the note on who accepted the flows (EXPERIENCE L294),
History in a contract: superseded colour values and `.working` pointers (DESIGN L227), the note on who accepted the flows (EXPERIENCE L294), "Two rules define the look" followed by three bullets (DESIGN L195–199).

**[Rubric: Inheritance discipline]** — Memlog L60 limits lowercase to "large headings and buttons only"; DESIGN L247 extends it to group headings and text switches, resting on moc
Memlog L60 limits lowercase to "large headings and buttons only"; DESIGN L247 extends it to group headings and text switches, resting on mock-up acceptance (L89) alone. Memlog L23 (detail contents, Move action) and L62 (loan history in the detail) live only in the mock-up.
Fix: record the extension; move L23 and L62 into spine text (see 3).

**[Rubric: Inheritance discipline]** — Terms: the PRD's "chips" (In library, Ordered, Wishlist) became headings and lines, while "Filter chip" names something styled as a Link in 
Terms: the PRD's "chips" (In library, Ordered, Wishlist) became headings and lines, while "Filter chip" names something styled as a Link in a system with "no filled chips"; "tags" and "personal tags" alternate (the Glossary term is personal tag); "books" is used for both Books and copies (see the first finding).
Fix: rename Filter chip or note the difference; use the Glossary terms.

**[Rubric: Shape fit]** — "Changes to the sources" sits between Inspiration & Anti-patterns and Key Flows; the examples end on Key Flows.
"Changes to the sources" sits between Inspiration & Anti-patterns and Key Flows; the examples end on Key Flows. Moving it, with Open items, to the end keeps the canonical run intact. Open items starts at 2; item 1 is missing or the list was not renumbered.

**[Rubric: Shape fit]** — Both files are `status: draft`.
Both files are `status: draft`. DESIGN.md frontmatter carries `status` and `updated`, which the spec does not define (harmless), and keeps stroke weights and the panel width under `spacing` (acceptable; the spec has no border key).

**[Adversarial]** — "Selection bar" marks the open row, not a selected one (DESIGN § Components; EXPERIENCE § Select mode)
Rename it "open-row bar" so an agent does not attach it to ticked rows.

**[Adversarial]** — The flow says a returned loan "drops to the returned list under today's date"
; the Returned group has no date headings, only "{person} · {from} to {to}".

**[Adversarial]** — The Returned group and wishlists have no paging or limit
; say "latest 20, then a Link".

**[Adversarial]** — "Sign out: A secondary button at the end of the first column"
refers to a three-column layout that only the mock describes; Tags has no "Add" in the mock, and the spine mentions no Add for any list.

**[Adversarial]** — Sizes used in the mocks that are not tokens:
the Answer's book title at 20px / 400, the sheet title at 22px (token says 26px), the sheet's handle, the placeholder colour.

**[Adversarial]** — Memlog line 37 says "no outlines except on buttons"
; toast, dialog, checkbox, camera frame and cover placeholder are outlined. Accepted through the mocks, but worth one line in DESIGN.

**[Adversarial]** — Memlog line 60 limits lowercase to "large headings and buttons only"
; DESIGN extends it to group headings and text switches without an `[ASSUMPTION]` tag.

**[Adversarial]** — "Filter" and "Select" are drawn as Links in the mocks
but are missing from the Link's list of uses, and memlog line 55 calls Select a "text button".

**[Adversarial]** — The product is "bookeh" here and "Bookie" in the PRD and architecture
; the open-items table starts at 2.

## Reviewer files

- `review-rubric.md`
- `review-adversarial.md`
