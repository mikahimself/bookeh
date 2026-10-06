---
name: bookeh
status: final
sources:
  - _bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/prd.md
  - _bmad-output/planning-artifacts/prds/prd-bookeh-2026-10-02/addendum.md
  - _bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/ARCHITECTURE-SPINE.md
  - _bmad-output/planning-artifacts/architecture/architecture-bookeh-2026-10-03/STORY-SLICING.md
  - _bmad-output/planning-artifacts/epics.md
updated: 2026-10-06
---

# bookeh — Experience Spine

Covers Phase 1 of the PRD: one signed-in user, on the tailnet. Terms follow the PRD Glossary (Book, copy, wishlist entry, location, Person, personal tag). "bookeh" is the product's name in the interface; the PRD and the architecture call it Bookie.

Lines tagged `[ASSUMPTION]` were filled in by the drafter and not confirmed by Mika. Where this spine differs from the PRD or the architecture, the difference is listed under [Changes to the sources](#changes-to-the-sources).

## Foundation

One responsive web app, installed as a PWA on the phone and used in a desktop browser. The phone is for scanning, shop checks and looking things up. The desktop is for tidying and bulk edits.

Built with Next.js, Tailwind CSS 4 and Base UI's unstyled primitives (the architecture's choice) for the dialog, sheet, combobox and menu. All styling comes from the project's own tokens. `DESIGN.md` is the visual identity reference; this spine is the behaviour. Token references use `{path.to.token}` and resolve in `DESIGN.md`.

The interface is in English and Finnish (FR-51). There is no offline use and no service worker.

**One row is one copy.** Everywhere a list shows the user's books (collection, loans), a row is one copy. Two copies of the same Book are two rows. Counts count rows and are labelled "books". Book detail is keyed by Book and lists every copy of it.

## Information Architecture

Four sections, plus full-screen tasks that sit outside them.

| Surface | Address | Reached from | Purpose |
|---|---|---|---|
| Sign in | `/login` | Any address when signed out | Email and password (FR-1). |
| **Collection** (section) | `/` with search, filters and sort as parameters | Opening the app; its section heading | The user's copies. Search, filter, sort, layout and size, select several. The first screen; there is no home. |
| Book detail | `?book={bookId}` on the collection or loans | Tapping a row in the collection or loans; "Open book" on an Answer | One Book for this user (FR-26). A bottom sheet on the phone, a side panel on wide screens. |
| Filter panel | Part of the collection | "Filter" in the collection | Every filter field and the sort order (FR-25). |
| Select mode | Part of the collection | "Select" in the collection | Tick several copies, then act on them all. |
| **Loans** (section) | `/loans` | Its section heading | What is out now, by person or by date; returned loans below (FR-37). |
| **Wishlists** (section) | `/wishlists` | Its section heading | The list of wishlists, each with a count (FR-39). |
| Wishlist | `/wishlists/{listId}` | Tapping a list | That list's entries with their recipients. |
| Wishlist entry | `?entry={entryId}` on its wishlist | Tapping an entry | One entry: the Book, its list, the For field; Bought, Ordered, Remove. A bottom sheet on the phone, a side panel on wide screens. |
| **Settings** (section) | `/settings` | Its section heading | Profile, language, theme, profile and collection visibility, default location; manage locations, People, tags, my genres and my themes; for the admin, genres and the last backup; sign out. |
| Scan | `/scan` | "Scan book", present on every section | Full screen. Camera, ISBN entry, "Find by title or author" and "Add without ISBN". |
| Lookup | `/scan/find` | "Find by title or author" on Scan | Search by title or author for a shop check without a barcode (FR-20). |
| Answer | `/scan?isbn={isbn13}`, with `&pick={n}` for a chosen edition | A barcode read, an ISBN entered, or a Lookup result tapped | Full screen. Says whether the Book is in the library and offers the next step. |
| Edit book | `/books/{bookId}/edit` | "Edit" on a save toast; "Edit" in Book detail | Full screen. Book fields, the user's tags, genres and themes, and the cover where the user may change it. The review screen of the PRD, now after the save. |
| Pickers and dialogs | None | Lend, Move, Tag, Add to wishlist, confirmations | Short choices on top of a screen or a sheet. |

**Moving between sections.** The four section names are {typography.heading-section} headings set side by side. The current one is in full ink and leads the row; the others follow in their fixed order (collection, loans, wishlists, settings), wrapping round. On the phone the row runs off the right edge; tapping a heading or swiping the screen sideways changes section, and swiping wraps from the last section to the first. On wide screens the headings are clicked; where the window is too narrow for all four, the row clips at the right edge as it does on the phone.

**History.** The system Back button closes the topmost thing: a picker, then the sheet or panel, then a full-screen task. On an Answer it returns to Scan; on Scan it returns to the section. Each new Answer replaces the previous one in history, so scanning forty books does not leave forty steps to go back through.

**Scan book** is on every section: pinned to the bottom of the phone screen, and at the top right on wide screens.

Mock-ups, in the final tokens. The spines win on any conflict with a mock-up.

| Mock-up | Shows |
|---|---|
| [mockups/key-collection-wide.html](mockups/key-collection-wide.html) | Collection on a wide screen: Filter panel left, Book detail right; dark; select mode with the action bar. |
| [mockups/key-collection-phone.html](mockups/key-collection-phone.html) | Collection on the phone: covers, rows, the sheet half open and fully open. |
| [mockups/key-scan-phone.html](mockups/key-scan-phone.html) | Scan, the Answer screens, the save toast, Edit book, a mistyped ISBN. |
| [mockups/key-loans.html](mockups/key-loans.html) | Loans by person and by date, nothing lent. |
| [mockups/key-wishlists.html](mockups/key-wishlists.html) | The list of wishlists, one wishlist, an entry opened. |
| [mockups/key-settings.html](mockups/key-settings.html) | Settings on wide and phone. |

Not mocked, built from this spine alone: Sign in, Lookup, the Filter panel on the phone, pickers and dialogs, select mode on the phone, and sizes s and l. The Genres group in Settings and the Corner crop step are not mocked either; their stories start with a rendered mock-up choice.

## Voice and Tone

Microcopy. Visual voice lives in `DESIGN.md` → Brand & Style.

Terse facts in fragments. No pleasantries, no exclamation marks, no "successfully". Empty states may carry one dry remark; confirmations, errors, buttons and labels never do.

| Do | Don't |
|---|---|
| "Saved to Tampere" | "The book was saved successfully!" |
| "Not in library" | "You don't seem to own this book yet." |
| "No books match" | "Sorry, we couldn't find anything." |
| "Couldn't save. Try again." | "Oops! Something went wrong." |
| "Lent to Antti" | "You have lent this book to Antti." |
| "Nothing lent. Either everyone returns things or nobody asks." (empty state) | A joke on a confirmation, a button or a label |

- The dry remarks are examples of the register, for Mika to approve or replace.
- Finnish is written natively, not translated word for word. [ASSUMPTION] A message that includes a name the user typed (a location, a Person, a list) puts the name where it needs no inflection, for example after a separator: "Tallennettu · Tampere".
- Strings are stored in sentence case. Lowercase headings and buttons are a CSS matter (`DESIGN.md` → Typography). Text the user typed is never lowercased, including when it is a heading (a wishlist's name, a borrower's name).
- Failure messages come from the architecture's `errors.<CODE>` message keys. The English strings in this spine are the wording for the cases named here.

## Component Patterns

Behaviour. Visual specs live in `DESIGN.md` → Components.

| Component | Use | Behavioural rules |
|---|---|---|
| Section heading | Top of every section | Tap or click a heading to go to that section. Swiping sideways on the phone moves to the next or previous section. A swipe that starts within 24px of a screen edge is ignored, so the device's own back gesture still works. Swiping does nothing while a sheet, picker or full-screen task is open. |
| Text switch | Rows / covers; s / m / l; by person / by date; read / unread; status; language; theme | Exactly one option is chosen. Tapping another switches at once, with no confirm. |
| Button, primary | One per layer: Scan book on a section; Add to library or Back on an Answer; Save on Edit book; Bought on a wishlist entry; Done on the action bar; the confirming button of a dialog | A layer is a section, a sheet or panel, a full-screen task, the action bar, or a dialog. Each has at most one primary button. |
| Button, secondary | Every other button | Acts on tap. |
| Button, destructive | Remove in the action bar and on a wishlist entry; the confirming button of a removal dialog | Always confirmed by a dialog before it acts. No Undo afterwards. |
| Link | "Find by title or author", "More details", "Clear", "Filter", "Select", "Returned", "Lend", "Move", toast actions | Acts on tap. Not used to move between sections. |
| Link, destructive | Delete in settings; Remove on a copy's line; Delete on a wishlist | Always confirmed by a dialog. No Undo afterwards. |
| Back link | An opened wishlist | Returns to the list of wishlists. |
| Filter chip | Author, series, genre, theme, tag and location on an opened Book | Tapping one adds that value to the collection's filters; filters already active stay, and a second value in the same field widens that field (see Filter panel). The sheet closes on the phone. From loans or a wishlist it goes to the collection with that one filter. |
| Text field | Search, ISBN, Edit book, settings, notes | Search filters as the user types, after a short pause. A field that failed validation shows its message beneath it. |
| Combobox | Location, Person, tags, author, series, theme | Type to narrow the options. A value that does not exist can be created from the same field (FR-31, FR-34). Its popup is not an overlay for the one-level rule. |
| Date field | Lend | The platform's own date control. Defaults to today. |
| Book row / Cover tile | Collection, loans, wishlists, Lookup results | Tap opens Book detail (Lookup results open the Answer). In select mode, tap ticks it and does not open. |
| Cover placeholder | Any Book with no cover | Stands in for the cover everywhere a cover would show. |
| List row | The list of wishlists; the managed lists in settings | In wishlists, tap opens the list. In settings the row is not tappable; its Links act. |
| Selection bar | The open row or tile | Marks the copy whose Book is showing in the detail. It moves when another is opened and goes when the detail closes. |
| Lent marker | Rows, tiles, Book detail, Answer | Shown on any copy with an open loan, always with the borrower's name (FR-37). |
| Rating | Book detail; the Filter panel | Five stars. Tap a star to set that rating; tap another to change it; tapping the current star does nothing. A "Clear" Link beside the stars, shown only while a rating is set, clears it. Saved at once (FR-29). |
| Detail panel | Book detail on wide screens | Slides out on the right and the list narrows beside it. Clicking another row swaps its content without closing it. It is not modal: the list stays usable and focus is not trapped. X and `Esc` close it. |
| Bottom sheet | Book detail and a wishlist entry on the phone; the Filter panel on the phone [ASSUMPTION]; pickers on the phone | Slides up to a little over half the screen; the list stays visible above, dimmed. Dragging up or tapping the handle opens it fully. Tapping the dimmed list, dragging down, X or Back closes it. The list keeps its scroll position. Modal: focus is held inside. |
| Picker | Location (Move), tags (Tag), Person and date (Lend), wishlist (Add to wishlist) | A bottom sheet on the phone; a dialog on wide screens. One choice, then it closes. |
| Dialog | Confirmations of removals and merges; "Discard changes?"; New list | Centred, modal, with the screen behind dimmed. The confirming button is on the right. `Esc` and tapping outside cancel. |
| Toast | After a save or a reversible action | Sits above whatever is pinned to the bottom. Shows the result and its actions as Links. About 8 seconds, then gone; one at a time, a new one replacing the old. A toast raised on Scan goes the moment the next Answer opens. An error toast has no timer and stays until dismissed or replaced. Every toast has a close (X). Undo is hidden once its receipt has expired (30 minutes). |
| Action bar | Select mode | Pinned to the bottom. The count, then Move, Tag, Read, Remove, and Done. On the phone it takes the place of the pinned Scan book button and is two rows: the count and Done above, the four actions below. [ASSUMPTION] On wide screens Scan book stays in the header. Buttons other than Done are disabled while nothing is ticked. |
| Checkbox | Select mode | Appears on every row or tile when select mode starts. |
| Close (X) | Scan, Lookup, Answer, Edit book; the sheet and the panel | Closes the whole task or overlay in one tap and returns to the section underneath. |
| Progress line | Any wait | Shown while a lookup, save or next page is in flight. Nothing else blocks the screen. |
| Camera frame | Scan | Live camera with a guide line. A read barcode goes straight to the Answer with no confirm tap. |
| Corner crop | Cover upload on Edit book | A full-screen step: the photo with four corner handles joined by a 2px outline, starting as a 2:3 rectangle in the middle, the outside dimmed by the scrim, and the hint "Shoot it straight on". Drag each handle onto a corner of the cover; on wide screens Tab moves between handles and the arrow keys move the focused one. Use (primary) is disabled while the corners cross, fold or line up; Cancel returns nothing. Not mocked; its story starts with a rendered mock-up choice. |

### Undo

Undo is offered where the action has a plain opposite. Removals are confirmed first and cannot be undone.

| Action | Toast | Undo does |
|---|---|---|
| Add to library, Add another copy | "Saved to {location} · Edit · Undo" | Removes the copy, plus any Book, author or series it created that nothing else uses (FR-15). |
| Add to wishlist | "Added to {list} · Undo" | Removes the entry, and the Book on the same rule. |
| Move (one or many) | "{n} moved to {location} · Undo" | Puts each copy back where it was. |
| Tag (one or many, any kind) | "Tagged {n} · Undo" | Restores each Book's tags. |
| Read (one or many) | "Marked {n} read · Undo" | Restores each Book's read flag. |
| Lend | "Lent to {person} · Undo" | Removes the loan. |
| Returned | "Returned · Undo" | Reopens the loan. |
| Bought, Ordered (wishlist entry) | "Saved to {location} · Undo" | Removes the copy and reopens the entry. |
| Received | "Saved to {location} · Undo" | Sets the copy back to ordered. |
| Save on Edit book | "Saved" | No Undo. |
| Cover on Edit book | "Saved" | No Undo. |
| Look it up again | "Shared · from {source}" | No Undo. |
| Remove, Delete, Merge | None | Confirmed by a dialog first. |

### Collection controls

| Control | Behaviour |
|---|---|
| Search | Filters the user's own copies only, by title, author, series, ISBN and notes (FR-24). It never looks outside the collection; that is Lookup's job. |
| Layout | Rows or covers. Remembered per device. |
| Size | s, m, l, as specified in `DESIGN.md` → Layout & Spacing. Remembered per device. Size changes what fits on screen, not how much is fetched. |
| Filter | Opens and closes the Filter panel. |
| Count line | Always under the search. With nothing active: "{n} books". With a search or filter active: the active values, the count, and "Clear", for example "Tampere, unread · 14 books · Clear". |
| Select | Enters select mode. |
| Scrolling | Endless: the next page loads as the end approaches. |
| Row ending | The copy's location; or the lent marker and "Lent · {person}"; or "Ordered" for an ordered copy. Blank when the user has no locations. |

### Filter panel

Opens to the left of the list on wide screens and as a bottom sheet on the phone. [ASSUMPTION for the phone] Filters apply as they are changed; there is no Apply button.

| Field | Control | Notes |
|---|---|---|
| Location, status, read, genre, personal tag, language | A list of the values in use; tap to switch each on or off | Several values in one field mean "any of these". Genre lists the system genres in the user's language, then the user's own. |
| Author, series, publisher, theme | Combobox that adds values to a short list | Too many values to list. Several mean "any of these". Theme covers Finna's themes and the user's own. |
| Rating | The Rating component, meaning "at least" | Removed with its Clear Link. |
| Year, pages | From and to | Either end may be empty. |
| Sort by | Author, title, year, date added | Default is author. Tapping the chosen sort again reverses it. [ASSUMPTION] |

Fields combine with AND (FR-25); values within a field combine with OR. [ASSUMPTION for OR] Filtering and sorting use the user's overrides where they exist. Sorting is Finnish (NFR-7).

### Select mode and bulk actions

| Rule | Behaviour |
|---|---|
| Entering | Closes Book detail if it is open. Checkboxes appear. |
| What is selected | Only rows the user ticked. The selection survives searching, filtering and scrolling; the count shows all ticked rows, including ones no longer in view. There is no "select all". [ASSUMPTION] |
| Move | Location picker. Applies to every ticked copy (FR-33). Rows that no longer match the active filters leave the list. |
| Tag | Tag picker with two parts: add a tag to all, remove a tag from all. Tags belong to the Book, so both copies of a Book change together. |
| Read | Marks every ticked Book read, or unread if all are already read. |
| Remove | Dialog: "Remove 12 books from library?" with Remove and Cancel. If any are lent, the dialog says their loans go too. Removes those copies and their loans. |
| Failure | A bulk action applies to all ticked rows or to none. [ASSUMPTION] |
| Done | Leaves select mode and clears the selection. |

### Book detail

The same content in the panel and the sheet. Changes save at once; there is no Save button.

| Group | Content and behaviour |
|---|---|
| Header | Cover, title, author, series and number, edition line (publisher · year · pages · language). Author and series are Filter chips. |
| Read and rating | A read / unread Text switch and the Rating (FR-29). Both belong to the Book, not a copy. |
| Your copies | One line per copy: its location (a Filter chip) and its status. Each line has its own Links, by state: **owned** — Lend, Move, Remove; **lent** — the lent marker with "Lent to {person} since {date}", and Returned; **ordered** — "Ordered", and Received, which makes it owned at the default location (FR-28). A copy's note sits under its line and is edited in place. |
| Lent before | The closed loans of this Book's copies, newest first: "{person} · {from} to {to}" (FR-36). Absent when there are none. |
| On wishlists | One line per entry: "{list} · for {person}". Absent when there are none. |
| Classification | System genres (in the user's language), the user's genres, system themes, the user's themes and personal tags as Filter chips; empty kinds are absent. "Add tag" opens the picker for tags, genres and themes. |
| Look it up again | On the creator's own private Book with an ISBN: a Link that calls the sources. Found: the Book takes the source's values and becomes shared (the edition picker when there are several), toast "Shared · from {source}". None: toast "Still not found." Sources didn't answer: the toast names them. Without an ISBN the line reads "Add the ISBN on Edit book to look it up." Not undoable. |
| Re-fetch | Admin only, on a shared Book: fills empty fields, themes and the cover included; never overwrites. |
| Foot | Edit (opens Edit book) and Add to wishlist. No primary button. |

The half-open sheet shows the header, read and rating, and the first copies, so Lend and Returned are reachable without opening it fully.

### Scan

| Rule | Behaviour |
|---|---|
| Camera | Starts when Scan opens and stays on across Scan, Answer and back, until the task is closed. |
| Reading | Only ISBN barcodes count (EAN-13 starting 978 or 979); anything else is ignored. Reading pauses while a lookup is running and while an Answer is showing. |
| The same book twice | After an Answer closes, the ISBN just handled is ignored until it has left the camera's view. |
| ISBN field | Accepts ISBN-10 and ISBN-13 with hyphens or spaces (FR-10). Submitted with the keyboard's Go key. |
| No camera | The frame is replaced by "No camera. Type the ISBN." and the field takes focus. This is the normal state on a desktop. |
| Add without ISBN | A Link that opens the Not found Answer with an empty title field and no ISBN, so a book with no barcode can be catalogued. |

### Lookup

For a shop check with no barcode, including checks in a web shop from the desktop.

| Part | Behaviour |
|---|---|
| Field | One field for title or author. The search runs on Go, not as the user types. |
| Results | Two groups: "In your library" first (copies and wishlist entries that match), then "Elsewhere" (the outside sources). Rows show cover, title, author, and binding · year · publisher, so editions of one title can be told apart. |
| Tapping a result | Opens the Answer for that Book. Back from the Answer returns to the results. |
| Covers | Shown only where the architecture can serve them (AD-14); otherwise the Cover placeholder. |
| Nothing found | "Nothing found" and a Link, "Add by hand", which opens the Not found Answer with the typed text in the title field. |

### Answer screens

The Answer's heading is the answer. One set of buttons serves both the shop and the stack at home. Scan, Lookup and every Answer have an X in the top corner that leaves scanning altogether; Back only returns to the camera.

The heading is the first of these that applies. Every other fact that applies is listed under the Book as its own line, so nothing in FR-20 is hidden: each copy with its location, "Ordered", and "On {list}" for each wishlist.

| Heading | Shown when | Buttons |
|---|---|---|
| In library | The user owns at least one copy | Open book · Add another copy · **Back**; Look it up again on the creator's private Book |
| Ordered | The user's only copies are ordered | **Back**; each ordered copy's line carries its own Received Link |
| On wishlist | The Book is only on a wishlist | **Add to library** · Back [ASSUMPTION] |
| Not in library | None of the above | Add to wishlist · **Add to library** · Back |
| Not found | Every source answered and none has the ISBN (FR-12, FR-22) | Title and author fields, both required, then Add to wishlist · **Add to library** · Back |
| Couldn't look it up | Nothing in the library, and a source failed or timed out, so it is not known whether a source has the ISBN | **Try again** · Back, and an "Add by hand" Link |

Under the Book, the Answer names the source ("From Finna") and any author, series or genre that this save would create ("New author") (FR-13).

**Several editions.** When the sources hold several records for the ISBN, the Answer says "{n} editions found" under the Book, preselects the best and offers a picker listing each candidate's binding, year, publisher, pages and cover. Picking one re-renders the Answer with `?pick={n}`, replacing the history entry, with its cover and new-record notes; Add to library and Add to wishlist save the picked one, and the Book keeps the scanned ISBN. Nothing about editions is shown with one candidate or an existing shared Book.

- **Add to library** and **Add another copy** save an owned copy as fetched, at the default location, and return to Scan with the save toast. There is no review step in between. With no default location the copy has no location and the toast reads "Saved".
- **Edit** on the save toast opens Edit book for that Book, with the new copy's status and location on its first screen. This is also how a copy is marked ordered at the moment it is added.
- **Add to wishlist** opens the wishlist picker every time; the user taps a list. With exactly one list the picker is skipped. [ASSUMPTION] With no lists the picker offers only "New list". The recipient is set later, on the entry.
- **Open book** leaves scanning and shows that Book's detail in the collection.
- **Back** returns to Scan with nothing saved. Lookup is read-only: nothing is created until a button is pressed (FR-11).
- **Couldn't look it up** says which sources did not answer ("Finna and Google Books didn't answer."). **Try again** runs the lookup once more. **Add by hand** unfolds the title and author fields and the Not found buttons in place.

### Edit book

| Part | Behaviour |
|---|---|
| First screen | Cover, with "Add cover" or "Replace cover" and a destructive "Remove cover" beside it for the admin on a shared Book or the creator of a private Book, absent for anyone else; title, author, source. The user's tags, genres and themes. When opened from a save toast, also that copy's status (owned / ordered) and location, showing their saved values. **Save** is pinned at the bottom. |
| More details | A Link that unfolds the remaining fields in place: title, subtitle, authors, series, number in series, publisher, year, language, pages, description, system genres and themes. Every field is editable (FR-13) with three exceptions: on a shared Book, system genres are editable for the admin and read-only for others; themes are shown and never edited; ISBN is editable on the user's own private Book only. |
| Cover | Choosing a file (the camera is offered on the phone) opens the Corner crop; Use shows the straightened 2:3 preview in place of the cover until Save. A rejected file shows "Not an image." or "Image too large." under the cover. The cover changes on Save, with no Undo, like the rest of Edit book. |
| Saving | Returns to where the user came from, with the toast "Saved". A user's edits to a shared Book are stored as their overrides (FR-14); the admin's change the shared Book for everyone; edits to the user's own private Book change it. The screen does not explain this. |
| Leaving with changes | X or Back asks "Discard changes?". [ASSUMPTION] |
| On wide screens | A centred column no wider than a phone screen, like the other full-screen tasks. |

### Loans

| Part | Behaviour |
|---|---|
| Switch | By person or by date. Remembered per device. |
| By person | Each borrower's name is a group heading, shown as typed. Rows show the copy and "Since {date}". |
| By date | One list, longest out first. Rows show the copy and "{person} · since {date}". |
| Returned (Link on a row) | Closes the loan today (FR-36). The row moves to the returned group. |
| Returned (group) | Below the open loans in both orders. Rows show the copy and "{person} · {from} to {to}", newest first. |
| Tapping a row | Opens Book detail. |
| Lend | Started from an owned copy's line in Book detail. A picker for the Person (existing or new, FR-34) and the date. |

### Wishlists

| Part | Behaviour |
|---|---|
| List of lists | One List row per wishlist: its name and count. "New list" asks for a name; a name already in use is rejected under the field. |
| Wishlist | A Back link above the heading returns to the list of lists. The heading is the list's name as typed. Under it, Links: Rename, and Delete (destructive; removes the list and its entries). [ASSUMPTION] |
| Entry row | Cover, title, author, and "For {person}" at the end. No recipient means the entry is for the user (FR-38). |
| Entry opened | Tapping an entry opens it at `?entry={entryId}`: a sheet or panel with the Book's header, "On {list}", and a "For" combobox of People that can be set, changed or cleared at any time. It is the entry, not Book detail. |
| Closed entries | A bought, ordered or removed entry leaves the list. |
| Bought | Closes the entry. If it is for the user, an owned copy is created at the default location; if it is for someone else, no copy is created (FR-28). |
| Ordered | Closes the entry and creates an ordered copy, on the same rule. |
| Remove | Destructive. Removes the entry. |

### Settings

Two columns on wide screens: profile, language, theme, visibility, default location and Sign out in the first; the managed lists in the second. One column on the phone.

| Group | Behaviour |
|---|---|
| Profile | Display name is a Text field, saved on leaving it. Email is shown and cannot be changed in Phase 1 (FR-6). There is no password change in Phase 1. |
| Language | Text switch: English, Suomi. Takes effect at once (FR-51). Kept on the profile. |
| Theme | Text switch: light, dark, system. Per device. |
| Profile and collection visibility | Two Text switches: public / hidden and open / closed. Both on the profile, default hidden and closed; no effect until friends exist (FR-4). |
| Default location | Combobox of the user's locations; may be empty. |
| Locations, People, Tags, My genres, My themes | One List row each, with what uses it ("31 books", "2 loans"). Each row has Rename, Merge and Delete. On the phone these three sit on a second line. "Add location" and "Add person" add one; genres and themes are added from a Book. |
| Rename | Edits the name in place. Renaming to a name that already exists offers to merge instead. A user genre or theme may not take a system genre's or theme's name. |
| Merge | Picks another item of the same kind; everything that used this one moves to it. Confirmed by a dialog. |
| Delete | Confirmed by a dialog that says what will lose its location or tag. A Person who has loans, open or returned, or wishlist entries cannot be deleted; the dialog says so and offers Merge (AD-18). |
| Genres (admin only) | One List row per system genre in the user's language with its Book count and a "No Finnish name" mark where missing. The English and Finnish names are edited in place; "Add genre" adds one; Merge and Delete are confirmed by a dialog and have no Undo. Absent for other users. Not mocked; its story starts with a rendered mock-up choice. |
| Last backup (admin only) | "Last backup: {date}". Marked in {colors.danger} with "Backup is overdue." when the last successful backup is older than 48 hours, missing or failed. |
| Sign out | A secondary button at the end of the first column. |

## State Patterns

| State | Surface | Treatment |
|---|---|---|
| First load | Any section | The section heading appears at once; the progress line runs until the content arrives. No skeletons. [ASSUMPTION] |
| First run | Collection | "No books yet", one dry remark, and Scan book. No locations exist yet, so nothing mentions them. |
| No matches | Collection with search or filters | "No books match" and the "Clear" Link. |
| Loading more | Collection | Progress line; the list stays usable. |
| Load failed | Any list | "Couldn't load. Try again." with a Link that retries. |
| No camera or permission denied | Scan | A message replaces the camera frame and the ISBN field takes focus (see Scan). |
| Not an ISBN | Scan, ISBN field | The field is marked in {colors.danger} with "Not an ISBN. Thirteen digits, or ten." |
| Looking up | Between Scan and Answer | Scan stays visible with the progress line. NFR-1 sets the time. |
| Too many lookups | Scan | Toast: "Too many lookups. Wait a moment." |
| Searching | Lookup | Progress line. |
| Sources did not answer | Answer | The "Couldn't look it up" Answer, see Answer screens. |
| Duplicate | Answer, In library | The copies are listed; "Add another copy" is allowed (FR-16). |
| Save failed | Any save | Error toast with the message for the returned error code. The screen and its input stay as they were (FR-15). |
| Field rejected | Any form | The message for that field's error code, under the field. |
| Rejected cover file | Edit book | "Not an image." or "Image too large." under the cover. |
| Undo done | Toast | The toast becomes "Undone" for a moment. |
| Undo failed | Toast | "Couldn't undo." |
| Undo expired | Toast | The Undo Link is hidden once the receipt has expired. |
| Still not found | Book detail, after Look it up again | Toast "Still not found." |
| Nothing lent | Loans | "Nothing lent" and one dry remark. Returned loans still show below. |
| No wishlists | Wishlists; the wishlist picker | "No wishlists" and "New list". |
| Empty wishlist | Wishlist | "Nothing on this list." |
| No locations | Everywhere | Location fields, the location filter, Move, and the row ending are absent (FR-32). The first location is added in settings, which shows "No locations" and "Add location". |
| First use of the camera | Scan | The device asks for permission. Until it is given, Scan shows the no-camera state. |
| Book no longer there | An address with `?book=` for a Book the user has no copy or entry of | The section opens without the detail, with the toast "Not in library". |
| Book has left the list | Collection with Book detail open | If a change makes the open row stop matching the filters, the row goes and the detail stays open until closed. |
| Signed out or session ended | Any | Sign in, then back to the address the user wanted. |
| Wrong email or password | Sign in | "Wrong email or password." The response does not say which. |
| Action with no connection | Any | The failing action reports "No connection." in an error toast. Nothing is queued. |

## Interaction Primitives

**Touch (phone).** Tap to open or act. Swipe sideways to change section. Drag the sheet up to open it fully and down to close it. No long-press actions, no swipe actions on rows, no pull-to-refresh.

**Pointer and keyboard (wide screens).** Click to open. `Tab` follows reading order. `Enter` opens the focused row. `Esc` closes the topmost thing: dialog, then panel, then select mode. `/` focuses the search. [ASSUMPTION for `/`]

**One overlay deep.** A sheet or the panel may open one picker or dialog, and nothing opens on top of that. A combobox's popup does not count.

**Banned everywhere:** hover-only controls; a confirmation dialog for anything that has Undo; auto-playing or looping movement.

## Motion

Metro-style: movement shows where things come from, and sections arrive with some life.

| Moment | Movement |
|---|---|
| Changing section | The headings row and the content slide sideways together in the direction of travel. |
| A section opening | The heading settles first, then the list items sweep in from the right in quick succession. |
| Opening a book (phone) | The sheet slides up; the list dims. |
| Opening a book (wide) | The panel slides out from the right and the list narrows in step. |
| Scan, Lookup, Answer, Edit book | Slide in over the section; slide away on Back or X. |
| Toast | Slides up; fades out. |

Movements are short, about 200 to 300 ms, and never block input. [ASSUMPTION for the durations] With "reduce motion" set on the device, every slide and sweep becomes an immediate change. The section slide and the list sweep are enhancements: build them where the stack allows without blocking input, and leave them out otherwise. How any of this is built (CSS transitions, view transitions) is the implementation's choice.

## Accessibility Floor

Behavioural. Contrast figures live in `DESIGN.md` → Colors. Stakes are personal use, so this is a floor and not an audit target. [ASSUMPTION for the whole section]

- Body text, labels and values meet 4.5:1 in both modes. Lines that carry meaning meet 3:1.
- Known exception, chosen by Mika: inactive section headings and inactive switch options are about 3.2:1. That meets the 3:1 target for the large headings and falls short of 4.5:1 for the 17px switch options.
- Every control is reachable and operable by keyboard on wide screens, with the focus outline specified in `DESIGN.md`.
- The sheet, pickers and dialogs are modal: focus moves in, is held while open, and returns to the opener on close. The detail panel is not modal.
- Toasts are announced to screen readers. The section name is announced on a section change.
- Lowercase is visual only; assistive technology reads the stored string.
- On the phone every control has a tap area at least 44px high, whatever its drawn size. Rows at size s are the exception, chosen by the user for density.
- Nothing depends on colour alone: the lent marker always has its text, an error always has its message, and a destructive control always names its action. The accent and the error red are close in dark mode and are never the only difference between two controls.
- The page language attribute follows the user's interface language.

## Responsive & Platform

| Width | Behaviour |
|---|---|
| Phone, under 900px [ASSUMPTION for the value] | Headings row runs off the edge and swipes. Book detail, the Filter panel and pickers are bottom sheets. Scan book is pinned to the bottom. Page margin {spacing.page-margin-phone}. |
| Wide, 900px and up | All four headings fit. Book detail is the side panel on the right and the Filter panel opens on the left; the list narrows between them. Scan book sits at the top right. Page margin {spacing.page-margin}. |
| Wide but under 1200px [ASSUMPTION] | There is room for one side panel. Opening the Filter panel closes Book detail, and the other way round. |
| Full-screen tasks on wide screens | Scan, Lookup, the Answer and Edit book are a centred column no wider than a phone screen. |

- Installed PWA: runs standalone with no browser bars; pinned buttons respect the device's safe areas.
- The camera is used only inside the Scan task.
- Layout, size, theme, and the loans order are remembered per device. They must be known to the server when it renders, so the first paint is already right. Language follows the profile.
- A reload keeps the open Book, the filters and the sort, because they are in the address.

## Inspiration & Anti-patterns

- **Lifted from Metro:** type as structure; large light lowercase headings; sections as sideways headings; square outlined buttons; content with no chrome around it; lively section transitions.
- **Not lifted from Metro:** filled colour tiles, the pure black dark theme, circular icon buttons.
- **Deliberately not Metro:** the Book detail panel on wide screens has a dim border and a light shadow.
- **Lifted from the first colour round:** the cool slate greys ("Nordic slate"), on a ground moved to pure white.
- **Rejected — fills:** filled chips, tinted selected rows, inverted segments, filled buttons, filled rating stars.
- **Rejected — palettes:** warm paper, forest green, monochrome, clay; peach as the accent; a second bright colour beside the accent.
- **Rejected — collection:** a text-only "lines" layout; numbered pages or a "show more" button; one row per Book.
- **Rejected — opening a book:** a full-screen page or a covering panel on the phone; a panel that overlaps the list on wide screens.
- **Rejected — navigation:** a home screen of recent activity; a hub screen; a bottom tab bar; a menu screen.
- **Rejected — scanning:** a check / add switch on the scanner; a flow that depends on the book; a review step before saving; one long review form; an Ordered button on the Answer.
- **Rejected — type and build:** serif book titles; system fonts; shadcn/ui; hand-built overlays.

## Changes to the sources

Decisions here that differed from, or added to, the PRD and the architecture when this spine was written. They were carried back on 2026-10-05 and 2026-10-06: the PRD, the architecture spine and the story slicing now say the same. The table stays as the record of what moved.

| Source | Says | This spine says |
|---|---|---|
| PRD, architecture | The product is called Bookie | The interface calls it bookeh. |
| PRD FR-23, UJ-1 step 1 | A home screen with recent copies | The app opens in the collection. There is no home screen. |
| PRD UJ-2, FR-13, FR-15; CLAUDE.md primary flow | Scan, review, then save | Scan, Answer, and Add to library saves at once. The review screen (Edit book) is reached afterwards through Edit on the toast. New-author notes and the duplicate warning move to the Answer. |
| PRD FR-21 | "Mark bought" | Labelled "Add to library" and used for cataloguing as well as shop checks. |
| PRD FR-28 | Ordered can be set from search | Not on the Answer. Add to library, then Edit, then status ordered. |
| PRD FR-20 | Chips on the result | The first fact is the heading; the rest are lines under the Book. |
| PRD FR-33 | Bulk change of location | Bulk tag, read and remove as well. |
| PRD FR-25 | Filter and sort by any field | The same, plus Filter chips on an opened Book. |
| PRD FR-15; architecture AD-11 | Undo after a save | Undo also after move, tag, read, lend, returned, received, bought and ordered. Each needs its own reverse action in the services. |
| Architecture AD-18 and the settings slices | Rename and delete for locations, People and tags | Merge as well. |
| Architecture, routes | `/` home, `/books` collection, `/books/new` review, `/books/[bookId]` detail | The addresses in the Information Architecture table. Book detail is an overlay on a section, not a page; the architecture added `?entry=` for an opened wishlist entry. |
| Architecture AD-7 | One fixed page size; page in the URL | The page size stays as the fetch unit. Scrolling is endless, so the page number leaves the URL; search, filters and sort stay. |
| Architecture, lookup result | Found or not found | A third outcome, "the sources did not answer", shown as the "Couldn't look it up" Answer. |
| Architecture, stack | No component library; no font named | Adds a headless primitives library and self-hosted Open Sans. |
| Architecture, conventions | No per-device preferences | Layout, size, theme and loans order are per device and readable by the server at render (for example a cookie). |
| STORY-SLICING | Slices E5 (home), D11 to D14 (review before save), E6 and E8 (collection and detail pages) | Re-sliced on 2026-10-05. |

**Brought in from the epics on 2026-10-06** (Mika's rulings in the story review): the Rating's Clear Link; a close (X) on every toast and Undo hidden after 30 minutes; Received on each ordered copy's line of the Answer; "Add without ISBN" on Scan; the two-column Settings; the edition picker (D-7); Look it up again (D-8); system and user genres and themes (D-2, D-3, D-6); cover upload with the Corner crop (D-4); the visibility switches (D-1); the admin's last-backup line.

## Key Flows

Drafted from the PRD journeys and the decisions above. Mika is the PRD's protagonist; he has read and accepted these, with one change to UJ-1. UJ-3 (Partner joins) is Phase 2 and has no flow here.

### UJ-1: Shop check — "Do I already have this?" (Mika, in a bookshop, phone in one hand)

1. Mika opens bookeh from his home screen. The collection appears, in compact rows as he left it.
2. He taps **Scan book** at the bottom and points the camera at the barcode of a Finnish novel.
3. The barcode reads. The progress line runs for a moment.
4. **Climax:** the screen says "in library" in large light type, with the cover, and under it "Tampere · owned". He has it. He puts the book back on the shelf.
5. He taps the X in the corner. The scanner closes in one tap and he pockets the phone.

Variant, not owned: the heading is "not in library". He taps **Add to wishlist**, taps "Me" in the picker, and is back at Scan with "Added to Me · Undo".

Variant, no barcode: he taps "Find by title or author", types "kultarinta", and taps the first result under "Elsewhere". The Answer says "not in library".

Failure: no source knows the ISBN. The heading is "not found" with title and author fields. He types both and taps Add to wishlist.

### UJ-2: Cataloguing — "Getting the collection in" (Mika, at home in Tampere, a stack of forty books on the table)

1. He taps **Scan book** and scans the first barcode.
2. "Not in library", with the cover and "From Finna". He taps **Add to library**.
3. Scan is back at once, with "Saved to Tampere · Edit · Undo" at the bottom. He lifts the next book into view; the toast goes as its Answer opens.
4. The fifth book is part of a series and Finna has no number for it. After adding it he taps **Edit** on the toast, opens "More details", types the number, adds a tag, and taps **Save**. Scan is back.
5. One book reads "in library". He does own two; he taps **Add another copy**.
6. **Climax:** the stack is gone. He taps the X and the collection's count reads forty higher than it did half an hour ago, every row with its cover and "Tampere" at the end.

Variant, two editions: Finna lists the paperback and the hardcover for the ISBN. The Answer says "2 editions found" with the paperback preselected; he taps the hardcover, then Add to library.

Failure: a save fails. An error toast says "Couldn't save. Try again." and the Answer is still on screen; he taps Add to library again.

### Moving a box to the cottage (Mika, at his desk, wide screen)

1. In the collection he clicks **Filter** and switches on Tampere. The count line reads "Tampere · 31 books · Clear".
2. He clicks **Select**. Checkboxes appear. He ticks the twelve books he packed.
3. The bar at the bottom reads "12 selected". He clicks **Move** and picks "Mökki".
4. **Climax:** the twelve rows leave the list, the count line reads "Tampere · 19 books", and the toast reads "12 moved to Mökki · Undo". He clicks **Done**.

Failure: he moved the wrong ones. Undo puts all twelve back in Tampere and in the list.

### Lending a book and getting it back (Mika, at home, Antti at the door)

1. He searches the collection for "Taikatalvi" and taps it. The sheet slides up.
2. On the copy's line he taps **Lend**, types "Antti" (already in his People), leaves today's date, and confirms.
3. The row now ends with the lent marker and "Lent · Antti".
4. Weeks later he opens **Loans**, switches to "by date", and sees Taikatalvi near the top, out since September.
5. **Climax:** Antti hands it back. Mika taps **Returned** on the row; it drops to the returned group under today's date, and the collection row ends in "Tampere" again.

Failure: he tapped Returned on the wrong row. Undo on the toast reopens the loan.

### A gift for Äiti (Mika, at his desk in November, then in a bookshop)

1. Reading a review, he opens **Scan book**, taps "Find by title or author" and types "kultarinta".
2. He taps the result under "Elsewhere". "Not in library". He taps **Add to wishlist** and picks "Christmas".
3. In **Wishlists** he opens Christmas, taps the new entry, and sets "For" to Äiti.
4. In December he is in a bookshop with the book in his hand. He opens Christmas and sees "Kultarinta · For Äiti".
5. **Climax:** he buys it, taps the entry and taps **Bought**. The entry leaves the list, and nothing is added to his own collection, because it was never for him.

Failure: he tapped Bought on the wrong entry. Undo on the toast puts the entry back.

## Open items

| # | Item | Owner |
|---|---|---|
| 1 | Every `[ASSUMPTION]` above and in `DESIGN.md`. | Mika |
| 2 | The dry remarks and the Finnish strings. | Mika |
| 3 | In dark mode the error red and the coral are close (about 1.7:1 apart). Either accept that the label alone tells a destructive control apart, or give destructive controls a second cue. | Mika |

Closed on 2026-10-06: the addresses and the overlay-to-route mapping, the primitives library (Base UI), the reverse actions for Undo, Merge, the "sources did not answer" outcome and per-device preferences are all settled in the architecture spine; Change password is not in Phase 1; the stories were re-sliced.
