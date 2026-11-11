---
name: bookeh
description: Type-led, bold Metro visual system for a personal book catalogue. White or dark slate ground, one coral accent used as lines with a deeper coral fill in three chosen places, a slate app bar on the phone, square corners, one soft shadow. Built with Tailwind CSS 4 tokens on headless primitives.
status: final
updated: 2026-11-10
colors:
  # Light
  background: '#FFFFFF'
  text: '#1F2933'
  text-muted: '#5F6B78'
  text-dim: '#87919C'
  border: '#DDE2E7'
  accent: '#F0604F'
  scrim: '#00000033'
  danger: '#9B1C31'
  shadow: '#1F293324'
  accent-fill: '#D1432F'
  on-fill: '#FFFFFF'
  bar: '#1F2933'
  bar-ink: '#FFFFFF'
  bar-danger: '#E0566F'
  # Dark
  background-dark: '#14181D'
  text-dark: '#E3E8EE'
  text-muted-dark: '#94A0AD'
  text-dim-dark: '#626B76'
  border-dark: '#2C343D'
  accent-dark: '#FF8E7F'
  scrim-dark: '#00000066'
  danger-dark: '#E0566F'
  shadow-dark: '#00000073'
  accent-fill-dark: '#D1432F'
  on-fill-dark: '#FFFFFF'
  bar-dark: '#262E37'
  bar-ink-dark: '#E3E8EE'
  bar-danger-dark: '#E0566F'
  # Corner crop stage, the same in both themes
  crop-dim: '#00000099'
  crop-halo: '#0000008C'
  # Cover placeholder cloth, the same in both themes (Components → Cover placeholder)
  cloth-blue: '#012534'
  cloth-cyan: '#3B8EA5'
  cloth-charcoal: '#1C1C1C'
  cloth-gray: '#A3A7AA'
  cloth-white: '#FBFAF6'
  cloth-yellow: '#F7D117'
  cloth-pink: '#E56195'
  cloth-ink-light: '#F5F2EA'
  cloth-ink-dark: '#15171A'
  cover-frame: '#1F293324'
  cover-frame-dark: '#FFFFFF1F'
typography:
  heading-section:
    fontFamily: 'Open Sans'
    fontSize: 56px
    fontWeight: '300'
    lineHeight: '1.08'
    letterSpacing: -0.02em
  heading-section-phone:
    fontFamily: 'Open Sans'
    fontSize: 56px
    fontWeight: '300'
    lineHeight: '1.08'
    letterSpacing: -0.02em
  heading-detail:
    fontFamily: 'Open Sans'
    fontSize: 26px
    fontWeight: '300'
    lineHeight: '1.15'
  heading-group:
    fontFamily: 'Open Sans'
    fontSize: 20px
    fontWeight: '300'
    lineHeight: '1.3'
  title:
    fontFamily: 'Open Sans'
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.3'
  control:
    fontFamily: 'Open Sans'
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.3'
  button:
    fontFamily: 'Open Sans'
    fontSize: 17px
    fontWeight: '400'
    lineHeight: '1.3'
  body:
    fontFamily: 'Open Sans'
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.45'
  meta:
    fontFamily: 'Open Sans'
    fontSize: 13px
    fontWeight: '400'
    lineHeight: '1.4'
  label:
    fontFamily: 'Open Sans'
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.3'
  cover-title:
    fontFamily: "'Trebuchet MS', 'Open Sans'"
    fontWeight: '600'
    lineHeight: '1.15'
    letterSpacing: 0.08em
    textTransform: uppercase
rounded:
  DEFAULT: 0px
spacing:
  '1': 4px
  '2': 8px
  '3': 12px
  '4': 16px
  '5': 20px
  '6': 24px
  '7': 28px
  page-margin: 28px
  page-margin-phone: 20px
  stroke-hairline: 1px
  stroke-control: 2px
  stroke-selection: 4px
  stroke-button: 2px
  button-height: 54px
  panel-width: 360px
  filter-width: 220px
components:
  section-heading:
    typography: '{typography.heading-section}'
    foreground: '{colors.text}'
    foreground-inactive: '{colors.text-dim}'
    transform: lowercase
  text-switch:
    typography: '{typography.control}'
    foreground: '{colors.text}'
    foreground-inactive: '{colors.text-dim}'
  button-primary:
    background: transparent
    foreground: '{colors.text}'
    border: '{spacing.stroke-button} solid {colors.accent}'
    radius: '{rounded.DEFAULT}'
    typography: '{typography.button}'
    height: '{spacing.button-height}'
    transform: lowercase
  button-secondary:
    background: transparent
    foreground: '{colors.text}'
    border: '{spacing.stroke-button} solid {colors.text}'
    radius: '{rounded.DEFAULT}'
    typography: '{typography.button}'
    height: '{spacing.button-height}'
    transform: lowercase
  button-destructive:
    background: transparent
    foreground: '{colors.text}'
    border: '{spacing.stroke-button} solid {colors.danger}'
    radius: '{rounded.DEFAULT}'
    typography: '{typography.button}'
    height: '{spacing.button-height}'
    transform: lowercase
  text-field:
    border-bottom-error: '{spacing.stroke-control} solid {colors.danger}'
    label: '{typography.label}'
    label-foreground: '{colors.text-muted}'
    foreground: '{colors.text}'
    border-bottom: '{spacing.stroke-control} solid {colors.text}'
    border-bottom-empty: '{spacing.stroke-control} solid {colors.text-dim}'
  book-row:
    title: '{typography.title}'
    meta: '{typography.meta}'
    meta-foreground: '{colors.text-muted}'
    divider: none
  cover-tile:
    radius: '{rounded.DEFAULT}'
    caption-title: '{typography.meta}'
    caption-author: '{typography.label}'
    frame: '1px {colors.cover-frame} outline, inset by its own width'
  cover-placeholder:
    cloth: '{colors.cloth-*}, one per Book, picked by a hash of its title: accent 1/5, white 1/5, base 3/5'
    title: '{typography.cover-title}'
    texture: 'one Perlin-noise tile, soft-light, position picked by the same hash'
  selection-bar:
    width: '{spacing.stroke-selection}'
    color: '{colors.accent}'
  marker:
    size: 8px
    color: '{colors.accent}'
  link:
    foreground: '{colors.text}'
    underline: '{spacing.stroke-control} solid {colors.accent}'
  link-destructive:
    foreground: '{colors.text}'
    underline: '{spacing.stroke-control} solid {colors.danger}'
  list-row:
    name: '{typography.title}'
    count: '{typography.meta}'
    count-foreground: '{colors.text-muted}'
  detail-panel:
    width: '{spacing.panel-width}'
    background: '{colors.background}'
    border-left: '{spacing.stroke-hairline} solid {colors.border}'
    shadow: '-10px 0 24px -14px {colors.shadow}'
    title: '{typography.heading-detail}'
    group-heading: '{typography.heading-group}'
    group-heading-foreground: '{colors.text-muted}'
  bottom-sheet:
    background: '{colors.background}'
    border-top: '{spacing.stroke-control} solid {colors.text}'
    scrim: '{colors.scrim}'
  toast:
    background: '{colors.background}'
    border: '{spacing.stroke-control} solid {colors.text}'
    typography: '{typography.meta}'
  action-bar:
    background: '{colors.background}'
    border-top: '{spacing.stroke-control} solid {colors.text}'
  checkbox:
    size: 20px
    border: '{spacing.stroke-control} solid {colors.text}'
    radius: '{rounded.DEFAULT}'
  rating:
    star-size: 22px
    stroke-rated: '{colors.text}'
    stroke-unrated: '{colors.text-dim}'
    fill: none
  dialog:
    background: '{colors.background}'
    border: '{spacing.stroke-control} solid {colors.text}'
    scrim: '{colors.scrim}'
    max-width: 400px
  combobox-popup:
    background: '{colors.background}'
    border: '{spacing.stroke-control} solid {colors.text}'
  focus-ring:
    outline: '{spacing.stroke-control} solid {colors.text}'
    offset: 3px
  disabled:
    foreground: '{colors.text-dim}'
    border-color: '{colors.text-dim}'
  app-bar:
    background: '{colors.bar}'
    foreground: '{colors.bar-ink}'
    button-size: 44px
    button-ring: '{spacing.stroke-control} solid {colors.bar-ink}'
    button-ring-primary: '{colors.accent}'
    button-ring-destructive: '{colors.bar-danger}'
    radius-button: 50%
    label: '{typography.label}'
    transform: lowercase
  segmented-control:
    height: 48px
    border: '{spacing.stroke-button} solid {colors.text}'
    divider: '{spacing.stroke-button} solid {colors.text}'
    typography: '{typography.control}'
    chosen-background: '{colors.accent-fill}'
    chosen-foreground: '{colors.on-fill}'
    transform: lowercase
  icon-switch:
    size: 40px
    border: '{spacing.stroke-button} solid {colors.text}'
    chosen-background: '{colors.accent-fill}'
    chosen-foreground: '{colors.on-fill}'
  folding-section:
    divider: '{spacing.stroke-hairline} solid {colors.border}'
    title: '{typography.heading-group}'
    summary: '{typography.meta}'
    summary-foreground: '{colors.text-muted}'
    min-height: 58px
  stats-tile:
    background: '{colors.accent-fill}'
    foreground: '{colors.on-fill}'
    gap: 8px
    number-steps: 64px, 54px, 44px, 36px
    label: '{typography.title}'
  progress-line:
    height: '{spacing.stroke-control}'
    color: '{colors.accent}'
---

# bookeh — Design Spine

## Brand & Style

bookeh is a private catalogue of physical books, used on a phone in a bookshop and at a desk at home. It should feel calm: no glitz, nothing competing with the book covers, nothing decorative.

The visual language takes its notes from Microsoft's Metro. Type does the work that boxes and lines usually do. Section and screen names are large, light and lowercase. Content sits on a plain ground with whitespace between items instead of dividers. Corners are square. Colour is almost absent: slate text on white (or light text on dark slate), plus one coral: lines everywhere, and a deeper filled form in three chosen places.

Three rules define the look more than any others:

- **Fills, sparingly.** Areas are filled in three places only: the chosen part of a Segmented control or Icon switch and the Stats tiles, all in {colors.accent-fill} under white text; and the phone App bar, in {colors.bar}. Otherwise state and emphasis are shown with lines, weight and ink: buttons, rows, chips and stars are never filled. The other solid marks and areas stay as before: lines, the 8px marker (and the Stats by month squares), the book covers with the Cover placeholder's cloth, and the {colors.scrim} behind a sheet or dialog. Chosen 2026-11-10 from the bold Metro canvas (`mockups/bold-metro/`), replacing the earlier "No fills".
- **One accent.** {colors.accent} is the only colour in normal use. It is a line, a bar, a ring, a marker, an outline or an underline. {colors.accent-fill} is its filled form, deeper so white text on it is readable, used only in the places above. {colors.danger} appears only when something has gone wrong or is about to be removed, and is a line too ({colors.bar-danger} on the App bar).
- **One raised thing.** The look departs from Metro in one place on purpose: the book detail panel on wide screens has a dim border and a light shadow, because it is something extra that opens over the working view.

The system is built on Tailwind CSS 4 with tokens in `src/app/(frontend)/styles.css`, on unstyled headless primitives. Nothing is inherited from a component library's look.

→ Reference mock-ups, in the final tokens: [collection, wide](mockups/key-collection-wide.html) · [collection, phone](mockups/key-collection-phone.html) · [add book and answer](mockups/key-scan-phone.html) · [loans](mockups/key-loans.html) · [wishlists](mockups/key-wishlists.html) · [settings](mockups/key-settings.html) · [reading and stats](mockups/reading-options.html) (its Picked section) · [bold Metro canvas](mockups/bold-metro/README.md) (Mika, 2026-11-10), which wins over the others on look: headings, buttons, fills, the App bar, Book detail's header and sections, Stats and the Camera frame. The spines win on any conflict with a mock-up. Earlier explorations, including the rejected options, are kept in `.working/`.

## Colors

Every colour has a light and a dark value. Dark tokens carry the `-dark` suffix here; that is a convention of this document. In code each colour is one variable whose value changes with the theme. The user picks light, dark or system in settings.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `background` | `#FFFFFF` | `#14181D` | The only ground. Panels and sheets use it too; there is no separate surface colour. |
| `text` | `#1F2933` | `#E3E8EE` | All primary text, secondary button outlines, field underlines. |
| `text-muted` | `#5F6B78` | `#94A0AD` | Second lines, labels, group headings, locations. |
| `text-dim` | `#87919C` | `#626B76` | Inactive section headings and switch options; unrated stars; placeholder text and the underline of an empty field; disabled controls. |
| `border` | `#DDE2E7` | `#2C343D` | The detail panel's left border, the hairlines between Folding sections, and the empty-month dash in Stats by month. It is too faint to carry meaning. |
| `accent` | `#F0604F` | `#FF8E7F` | Primary button outline and the App bar's primary ring, selection bar, link underline, lent and reading markers, the Stats month markers, progress line. |
| `danger` | `#9B1C31` | `#E0566F` | Errors and destructive actions only: the destructive button's outline, the underline of a field with a mistake, the marker before an error message. |
| `accent-fill` | `#D1432F` | `#D1432F` | The filled form of the accent: the chosen part of a Segmented control or Icon switch, and the Stats tiles. Always under `on-fill` text. Nothing else. |
| `on-fill` | `#FFFFFF` | `#FFFFFF` | White text and icons on `accent-fill`. Nothing else. |
| `bar` | `#1F2933` | `#262E37` | The phone App bar's ground, and nothing else. |
| `bar-ink` | `#FFFFFF` | `#E3E8EE` | Labels, icons and rings on the App bar. |
| `bar-danger` | `#E0566F` | `#E0566F` | A destructive button's ring on the App bar. |
| `scrim` | `#00000033` | `#00000066` | Dims what is behind a bottom sheet or a dialog. |
| `shadow` | `#1F293324` | `#00000073` | The detail panel's shadow, and nothing else. |
| `crop-dim` | `#00000099` | `#00000099` | Dims the photo outside the four corners in the Corner crop, and nothing else. |
| `crop-halo` | `#0000008C` | `#0000008C` | The 4px line under the Corner crop's outline and handles, so they show on any photo. Nothing else. |
| `airmail-red` | `#D7282F` | `#D7282F` | The red stripes of the airmail band on an ordered copy's cover tile (Components → Cover tile). Nothing else. |
| `airmail-blue` | `#2251A3` | `#2251A3` | The blue stripes of the same band. Nothing else. |
| `airmail-white` | `#FFFFFF` | `#FFFFFF` | The white stripes of the same band, white in both themes. Nothing else. |
| `cover-frame` | `#1F293324` | `#FFFFFF1F` | The hairline inside every cover's edge (Components → Cover tile). Nothing else. |
| `cloth-blue` | `#012534` | `#012534` | Cover placeholder cloth, base (Components → Cover placeholder), title in `cloth-ink-light`. Nothing else. |
| `cloth-cyan` | `#3B8EA5` | `#3B8EA5` | The same, base, title in `cloth-ink-dark`. |
| `cloth-charcoal` | `#1C1C1C` | `#1C1C1C` | The same, base, title in `cloth-ink-light`. |
| `cloth-gray` | `#A3A7AA` | `#A3A7AA` | The same, base, title in `cloth-ink-dark`. |
| `cloth-white` | `#FBFAF6` | `#FBFAF6` | The same, white, title in `cloth-ink-dark`. |
| `cloth-yellow` | `#F7D117` | `#F7D117` | The same, accent, title in `cloth-ink-dark`. |
| `cloth-pink` | `#E56195` | `#E56195` | The same, accent, title in `cloth-ink-dark`. |
| `cloth-ink-light` | `#F5F2EA` | `#F5F2EA` | The cover title on blue and charcoal cloth. Nothing else. |
| `cloth-ink-dark` | `#15171A` | `#15171A` | The cover title on every other cloth. Nothing else. |

Rules for {colors.accent}:

- In light mode it is never text. Coral on white is about 3.2:1, enough for a line but not for text. In dark mode it may be text.
- It marks two things: what is selected or flagged (selection bar, lent and reading markers, one marker per finished book in Stats), and the primary action (button outline, link underline).
- Its filled form, {colors.accent-fill}, is deeper than {colors.accent} so that white text on it reaches 4.6:1; {colors.accent} itself is never filled, and {colors.accent-fill} is never a line.
- It outlines the primary button, and a layer has at most one (`EXPERIENCE.md` → Component Patterns).

Contrast against {colors.background}, approximate:

| Colour | Light | Dark | Good for |
|---|---|---|---|
| {colors.text} | 14.7:1 | 14.3:1 | Any text. |
| {colors.text-muted} | 5.4:1 | 6.6:1 | Any text. |
| {colors.danger} | 8.1:1 | 4.9:1 | Lines and text. |
| {colors.accent} | 3.2:1 | 8:1 | Lines. Text in dark mode only. |
| White on {colors.accent-fill} | 4.6:1 | 4.6:1 | Any text on a fill. |
| {colors.bar-ink} on {colors.bar} | 14.8:1 | 11.2:1 | Any text on the App bar. |
| {colors.accent} on {colors.bar} | 4.6:1 | 6.2:1 | The primary ring. |
| {colors.bar-danger} on {colors.bar} | 4.0:1 | 3.7:1 | The destructive ring, always with its label. |
| {colors.text-dim} | 3.2:1 | 3.3:1 | Large headings and lines. Small text only where it is the inactive option. |
| {colors.border} | 1.3:1 | 1.3:1 | Decoration only. |

{colors.accent} and {colors.text-dim} were strengthened to reach 3:1. The paler values in the early explorations under `.working/` are superseded; `.working/examples-contrast-red-filters.html` shows the difference.

The cloth colours are the palette of `.working/cover-treatment-4.html` (Mika, 2026-10-26), after a first, all-bold palette looked too colourful on a real shelf. Base: the blue of Iida Rauma's *Hävitys* (sampled from the cover), a pacific cyan, a near-black charcoal and a light gray after Saana Airtola's *Musta aalto*. White: the warm white of a plain paperback. Accents: the yellow and, slightly faded, the pink of the earlier mixtape (after Plur1bus and Pontus Purokuru's *Mikä internetiä vaivaa*). A Book falls in the accents one time in five, in white one time in five and in the base the other three, evenly across each group's colours. They are the same in both themes; on the dark ground the charcoal is set off only by the cover frame. They are cover art, not interface colour: they never mark state or appear outside a placeholder. Every title ink reaches at least 4.5:1 on its flat cloth; the mottle moves that a little either way, which is acceptable because the placeholder is decorative and the caption repeats the title.

Avoid: a second accent for anything but errors, status colours, tinted backgrounds, fills outside the three places of Brand & Style, gradients, coloured text in light mode.

## Typography

One typeface: **Open Sans**, self-hosted, in weights 300 and 400. There is no bold in the interface; hierarchy comes from size and from the light weight. Book titles use the same typeface as everything else. The one exception is the Cover placeholder, which is cover art, not interface: its title is set in {typography.cover-title}.

| Role | Token | Used for |
|---|---|---|
| Section heading | `heading-section` and `heading-section-phone`, both 56px / 300 (2026-11-10; two tokens so the phone can differ again) | Section names (collection, loans, wishlists, stats, settings) and full-screen screen names (add book, not in library). |
| Detail heading | `heading-detail` (26px / 300) | The book title in the detail panel and sheet. |
| Group heading | `heading-group` (20px / 300, muted) | Groups inside a panel or screen: your copies, lent before, genres and tags. |
| Title | `title` (17px / 400) | Book title in a row; author in the detail header. |
| Control | `control` (17px / 400) | Text switches: rows / covers, s / m / l, by person / by date. |
| Button | `button` (17px / 400) | Button labels. |
| Body | `body` (14px / 400) | Running text, values. |
| Meta | `meta` (13px / 400) | Second line of a row, locations, toasts. |
| Label | `label` (12px / 400) | Field labels, cover captions' second line. |
| Cover title | `cover-title` (Trebuchet MS 600, caps, 0.08em; Open Sans 600 where Trebuchet is missing) | The title printed on a Cover placeholder, and nothing else. Size by the cover's width, under Components → Cover placeholder. |

**Lowercase.** Section headings, screen headings, group headings and buttons are rendered lowercase with CSS `text-transform`, driven by one token or utility so the default can be changed in one place. Source strings are written in normal sentence case. Text switches follow the buttons and are lowercase too, except where the options are proper names, such as the languages. Labels, chips, messages and all book data (titles, authors, the user's own place names and tags) are shown as written, except the title printed on a Cover placeholder, which is in caps. Text the user typed is never lowercased, even where it is a heading, such as a wishlist's name or a borrower's name.

Finnish text must render correctly at every size: å, ä and ö are letters, and Open Sans carries them in both weights.

## Layout & Spacing

A 4px base scale: {spacing.1} to {spacing.7}. Page margins are {spacing.page-margin} on wide screens and {spacing.page-margin-phone} on phones. Content aligns to the left margin; headings, search, rows and panel text share that edge.

Separation is whitespace. Rows in a list have no dividers between them. Groups are separated by a {typography.heading-group} heading and space.

| Where | Space |
|---|---|
| Inside a button | {spacing.button-height} tall, {spacing.4} left and right; the compact button is the exception (Components) |
| Between a row's cover, text and ending | {spacing.4} |
| Between section headings | {spacing.7}; {spacing.6} on the phone |
| Between controls in the tools row | {spacing.6} |
| Between buttons | {spacing.2} |
| Above a group heading | {spacing.4} |

The mock-ups were drawn before this table and are a pixel or two off it in places. The table wins.

Four stroke weights exist: {spacing.stroke-button} for button outlines, the Segmented control and the Icon switch (2px; set it to 3px for heavier buttons, the one place to change); {spacing.stroke-control} for field underlines, the sheet's top edge and the App bar's rings; {spacing.stroke-selection} for the selection bar; and {spacing.stroke-hairline} for the detail panel's left border and the Folding section's dividers.

**Collection density.** The collection has two layouts, each in three sizes. The size control is a text switch labelled s, m, l. s is the densest and l the roomiest.

| Layout | Size | Cover | Text | Spacing |
|---|---|---|---|---|
| Rows | l | 44 × 66px | Title, author, and year · publisher on three lines | 10px above and below |
| Rows | m | 32 × 48px | Title on one line; author · year · publisher on a second | 8px above and below |
| Rows | s | 16 × 24px | Title, author, year · publisher on one line | 3px above and below |
| Covers | l | Columns at least 150px wide | Title and author under the cover | 24px gap |
| Covers | m | Columns at least 96px wide | Title and author under the cover | 18px gap |
| Covers | s | Columns at least 70px wide | Title and author under the cover, at {typography.label} size | 10px gap |

Covers keep a 2:3 shape. Cover columns auto-fill the width at these minimums, so a 375–390px phone shows 4 / 3 / 2 columns at s / m / l (Epic 5 retrospective, decision 3). What a row ends with is specified in `EXPERIENCE.md` → Collection controls.

On wide screens the detail panel is {spacing.panel-width} wide and sits beside the list, which narrows to make room.

→ Layout reference: [collection, wide](mockups/key-collection-wide.html) shows rows at m with both panels; [collection, phone](mockups/key-collection-phone.html) shows covers and rows at m. All three sizes of each layout are sketched in `.working/wireframes-density-and-detail.html` (options A and B).

## Elevation & Depth

One element is raised: the book detail panel on wide screens. It has a {spacing.stroke-hairline} {colors.border} line down its left edge and a light shadow falling to the left onto the list (`-10px 0 24px -14px` in {colors.shadow}). In dark mode the shadow is barely visible and the line does the separating.

Nothing else has a shadow or a raised surface, and there is no tonal layering. The phone App bar is a {colors.bar} band along the bottom edge, not a raised surface: it has no shadow. The filter panel is {spacing.filter-width} wide on wide screens and is separated from the list by space. The bottom sheet is separated from the list by its {spacing.stroke-control} top edge and the {colors.scrim}. Toasts, dialogs and combobox popups are outlined boxes on the plain ground, with no shadow.

→ Reference: [collection, wide](mockups/key-collection-wide.html), light and dark.

## Shapes

Every corner is square: {rounded.DEFAULT} is 0px and there is no other radius. Buttons, fields, covers, checkboxes, the sheet and dialogs are all rectangles. The lent marker is a square, not a dot. There are no pills. One exception: the App bar's buttons are 44px circles, after Windows Phone's app bar (2026-11-10).

## Components

Visual specs. Behaviour lives in `EXPERIENCE.md` → Component Patterns.

| Component | Visual spec |
|---|---|
| Section heading | {typography.heading-section}, lowercase. The current section is {colors.text}; the others sit beside it in {colors.text-dim}. No underline, no box. |
| Text switch | Options side by side in {typography.control}. The chosen one is {colors.text}; the others are {colors.text-dim}. No outline, no underline, no fill. |
| Button, primary | Transparent, {colors.text} label in {typography.button} (17px), {spacing.stroke-button} {colors.accent} outline, {spacing.button-height} tall, square, lowercase. Full width when pinned at the bottom of a phone screen. |
| Button, secondary | As primary, with a {colors.text} outline. |
| Button, destructive | As primary, with a {colors.danger} outline. The label names the action. |
| Button, compact | A secondary button that is not {spacing.button-height} tall, with {spacing.1} above and below and {spacing.3} left and right, so it is drawn under the tap height; the tap area is still 44px. Used for "find" beside the ISBN field, aligned to its underline. Chosen 2026-10-27 (`phone-polish-options.html`, option A). |
| Back to top | Removed 2026-11-10: on the phone it is the App bar's "top" button (EXPERIENCE.md → Collection controls). |
| Link | {colors.text} with a {spacing.stroke-control} {colors.accent} underline, offset 3px. |
| Link, destructive | A Link whose underline is {colors.danger}. Used wherever a Link removes something. |
| Back link | A Link in {typography.meta} above a screen heading, naming the section it returns to. Used on an opened wishlist. |
| List row | A name in {typography.title} with a count at the right in {typography.meta}, {colors.text-muted}. Used for the list of wishlists and the managed lists in settings. |
| Count line | {typography.meta} in {colors.text-muted}, directly under the search. "Clear" is a Link. |
| Empty state | A line in {typography.heading-group}, an optional line in {typography.body} and {colors.text-muted}, then the one action as a Link or the primary button. |
| Filter chip | A value on an opened book that can be tapped to filter (author, series, genre, tag, location). [ASSUMPTION: styled as a Link, with no outline or fill.] |
| Text field | {typography.label} label in {colors.text-muted} above the value. The value sits on a {spacing.stroke-control} {colors.text} underline; an empty field's underline is {colors.text-dim}; a field with a mistake has a {colors.danger} underline and a {typography.meta} message beneath. No box. The search field is the same without a label. A single-line field with text ends in a clear X: the Close (X) strokes drawn at 12px instead of 16px, at the right end of the underline in a 44px tap area; the browser's own search clear is hidden. Chosen 2026-10-27 from rendered options (`phone-polish-options.html`, option A). |
| Book row | Cover, then title in {typography.title} and a {typography.meta} second line in {colors.text-muted}, then the location in {typography.meta}. No divider. Sizes per the density table. |
| Cover tile | Cover at 2:3, square corners, with title and author beneath, for every cover, photo or placeholder. Every cover has the cover frame: a 1px {colors.cover-frame} hairline inside its edge, so a white or black cover still has an edge. A lent copy has the 8px marker before its title and "Lent · {person}" after the authors. An ordered copy's tile carries a red-white-blue airmail band across the top-left corner of its cover: a 10px strip of {colors.airmail-red}, {colors.airmail-white}, {colors.airmail-blue}, {colors.airmail-white} stripes at 45°, clipped by the cover's box, no word (the row layout still ends the row with "Ordered"). The open tile has the selection bar along the bottom edge of its cover. In select mode the checkbox sits before the title. [ASSUMPTION for the lent, open and select states] |
| Cover placeholder | A book with no cover shows a cloth cover: one of the seven `cloth-*` colours in the shares under Colors, picked by a hash of the title, so a Book wears the same cloth before it is saved (the Answer, the edition picker) and after, under a Perlin-noise mottle (one SVG `feTurbulence` fractal-noise tile at twice the cover's width, blended soft-light; the same hash picks which part shows) and the cover frame. The title only, never the author, in {typography.cover-title} in the cloth's ink, top-left, inset 13% of the cover's width at the top and 11% at the sides. Long words hyphenate in the Book's language (its stored code as `lang`; Finnish when it has none or holds free text; where the browser supports the limit, only words of nine letters or more, at least four letters each side); a word still too wide for the cover breaks where it must. By cover width: from 150px, 14px, 0.08em, at most five lines; from 96px, 10.5px, 0.06em, four lines; below that, 8.5px, 0.04em, three lines; under 48px wide (every row) the cloth alone. On an ordered copy the title starts below the airmail band, at least 40px down. → `.working/cover-treatment-2.html` |
| Reading marker | The 8px {colors.accent} square with "Reading" in {colors.text}, ending the row of a Book being read in place of its location, as the lent marker does. |
| Reading dates line | One {typography.meta} line in {colors.text-muted} under the reading switch in Book detail; each date, and "Add dates", is a Link in {colors.text}. The copy line's "Acquired {date} · €{price}" is the same, under the copy's line. |
| Currently reading strip | Above the count line: a {typography.heading-group} heading, then cover tiles at the covers-s width (76px in the mock-up's frame: at least 70px) with the title in {typography.label} and "since {date}" in {typography.label} {colors.text-muted}, {spacing.3} apart, in one row that scrolls sideways. No divider, no box; the space below it and the count line separate it. |
| Stats tiles | Four equal squares, {spacing.2} apart, filled {colors.accent-fill}: two by two on the phone, four in a row on wide screens. In each, {spacing.4} inside, the number in Open Sans 300 on the first line and its label in {typography.title} on the second, both white and neither wrapping. All four numbers share one size: the largest of 64, 54, 44 and 36px at which the longest value fits the tile. |
| Stats by month | A 12-column chart: one 16px {colors.accent} square per finished Book, 3px apart, stacked upward from a shared baseline; a month with none shows a 16px {spacing.stroke-control} {colors.border} dash; months after today in the current year are left empty and their labels are {colors.text-dim}. Single-letter month labels in {typography.label} {colors.text-muted} under the columns. The squares are markers, not bars. |
| Stats facts | Pages a day and Days a book as two medium numbers, Open Sans 300 at 38px, each with a {typography.meta} muted label, side by side. Then one row per other stat, {spacing.4} apart: a 26px {colors.accent} line icon (2px strokes) centred vertically on the three lines, then the label in {typography.meta} {colors.text-muted}, the title in {typography.title}, and the value in {typography.meta} {colors.text-muted}, on three lines. By year stays a grid of label and muted value. |
| Selection bar | A {spacing.stroke-selection} {colors.accent} bar on the left edge of the open row. The row is not tinted. |
| Lent marker | An 8px {colors.accent} square, with the text "Lent · {person}" in {colors.text}. On a Cover tile the square sits before the title and the text after the authors. |
| Detail panel | {spacing.panel-width} wide on the plain ground, with the left border and shadow described under Elevation & Depth. Header: the cover at 120 × 180px beside the {typography.heading-detail} title, the author, a {typography.meta} muted "{pages} pages · {language}" line, the series line and, once the Book is read, the Rating; the text column ends near the cover's foot. Below the reading control, groups are Folding sections. Values in rows with the label left and the value right in {colors.text-muted}. Buttons at the foot. The bottom sheet holds the same content. |
| Bottom sheet | Full width, plain ground, {spacing.stroke-control} {colors.text} top edge, {colors.scrim} over the list above. A short {spacing.stroke-control} line at the top centre is the handle. |
| Toast | An outlined box ({spacing.stroke-control} {colors.text}) above whatever is pinned to the bottom: message on the left, actions as Links and a Close (X) on the right. An error toast starts with an 8px {colors.danger} square. |
| Action bar | Full width along the bottom edge on the plain ground, with a {spacing.stroke-control} {colors.text} top edge. The count on the left, buttons on the right; Remove is a destructive button and Done the primary. On the phone it is two rows and takes the App bar's place. |
| App bar | The phone only. A {colors.bar} band along the bottom edge, above the safe area, about 84px before it. Its buttons sit centred, {spacing.5}–{spacing.7} apart: each a 44px circle with a {spacing.stroke-control} {colors.bar-ink} ring and a 20–22px inline line icon, over a {typography.label} lowercase label in {colors.bar-ink}; a label may wrap to two lines. The layer's primary has an {colors.accent} ring, a destructive button a {colors.bar-danger} ring. A ⋯ (three 4px dots) sits at the top right when the bar has a menu. The circles are the one rounded shape (Shapes). |
| Segmented control | Three equal parts in a {spacing.stroke-button} {colors.text} outline with {spacing.stroke-button} dividers, 48px tall, labels in {typography.control}, lowercase. The chosen part is filled {colors.accent-fill} with a white label; the others are on the plain ground. Used for reading status. |
| Icon switch | Two 40px squares, {spacing.1}–6px apart, each a {spacing.stroke-button} {colors.text} outline around a line icon. The chosen one is filled {colors.accent-fill}, its outline the same colour, its icon white. Used for rows / covers, right of the size switch. |
| Folding section | A full-width row at least 58px tall: the title in {typography.heading-group}, lowercase; a summary at the right in {typography.meta} {colors.text-muted}; then a chevron (2px strokes) that turns over when open. Rows are divided by {spacing.stroke-hairline} {colors.border} lines, one above the first. Open content sits under its row, {spacing.4} below. |
| Checkbox | 20px square with a {spacing.stroke-control} {colors.text} outline. [ASSUMPTION: checked shows a tick drawn in {colors.text}; it is not filled.] |
| Rating | Five 22px star outlines. Rated stars are stroked in {colors.text}, the rest in {colors.text-dim}. No star is filled. A "Clear" Link in {typography.meta} sits beside the stars while a rating is set. |
| Option list | The values of a filter field, one per line in {typography.body}. A value that is switched on is {colors.text} with the 8px {colors.accent} marker before it; the others are {colors.text-muted}. |
| Combobox | A Text field. Its popup is an outlined box ({spacing.stroke-control} {colors.text}) directly under the field, as wide as the field. The highlighted option has the selection bar on its left; the chosen option has the 8px marker. [ASSUMPTION] |
| Date field | A Text field holding the platform's date control. |
| Picker | The Bottom sheet on the phone; the Dialog on wide screens. Location ends with a "New location" Text field under the rows and a secondary button beside it, disabled while the field is blank. The wishlist picker ends the same way with "New list" and Add. |
| Dialog | An outlined box ({spacing.stroke-control} {colors.text}) on the plain ground, centred, at most 400px wide, over the {colors.scrim}. Title in {typography.heading-group}, buttons right-aligned at the foot. [ASSUMPTION] |
| Progress line | [ASSUMPTION: a {spacing.stroke-control} {colors.accent} line moving across the top edge of the screen while something loads.] |
| Close (X) | Two {spacing.stroke-control} {colors.text} strokes forming an X, in the top right corner. No circle and no box around it. |
| Camera frame | The camera view, edge to edge in the page margins, with four corner brackets: 40px arms in a 4px white line, inset from the view's edges, and a horizontal {spacing.stroke-control} {colors.accent} guide line across the middle. A {typography.meta} hint in light ink at the foot of the view. |
| Corner crop | Always in the dark palette, whatever the theme: chosen 2026-10-21 from rendered options (`.working/corner-crop.html`, option B). The photo fills the screen on the dark {colors.background}. Outside the quadrilateral inside the four handles, {colors.crop-dim} dims the photo; inside, it is undimmed. Each side of the quadrilateral is outlined in {spacing.stroke-control} {colors.text} (dark value); a side within 1° of vertical or horizontal is drawn {spacing.stroke-selection} {colors.accent} instead, over a 6px halo (chosen 2026-11-05, `.working/corner-crop-straight.html` option A). Four 24px square handles sit at the corners, outlined the same way, each with a 44px tap area; a 16px diamond handle at each side's midpoint, outlined the same way, also has a 44px tap area. The outline and the handles are drawn over a 4px {colors.crop-halo} line. The hint in {typography.meta} {colors.text-muted} above; Use (primary) and Cancel at the foot, over a {spacing.stroke-control} {colors.text} top edge. The focused handle carries the focus ring. Disabled Use follows Disabled. |

States that apply to every control:

| State | Visual spec |
|---|---|
| Focus | Keyboard focus is a {spacing.stroke-control} {colors.text} outline, 3px outside the control. It is never the accent, so it cannot be mistaken for a primary button. [ASSUMPTION] |
| Disabled | Label and outline in {colors.text-dim}. [ASSUMPTION] |
| Tap area | On the phone every control's tap area is at least 44px high, by padding, whatever its drawn height. |

## App Icon & Theme Colour

Chosen 2026-10-09 from rendered options (`.working/icon-and-theme-colour.html`, option A3 and T1).

**Icon.** A lowercase b in Open Sans 300, white (`#FFFFFF`), on a full-bleed coral ground ({colors.accent} light value, `#F0604F`), with a slate bar ({colors.text} light value, `#1F2933`) under it. The icon lives outside the interface, so it is the one place where coral fills an area. In a 192-unit square:

| Part | Geometry |
|---|---|
| Ground | The whole square, with no rounded corners and no transparency. The platform applies its own mask. |
| b | Font size 124, centred on x = 96, baseline at y = 128. Converted to a path in the source SVG, so the icon does not depend on the font. |
| Underline | x 66–126, y 142–148 (60 × 6). |

The mark stays inside the central 80% circle, so one image serves as both `any` and `maskable`. The icon is exported from that SVG at 192, 512 and 180 px (the 180 px size is the Apple touch icon).

**Theme colour.** `theme-color` is the {colors.background} of the theme in use: `#FFFFFF` in light, `#14181D` in dark. The layout emits the value for the theme saved on the device. When the theme follows the system, it emits a light and dark pair with `media`. The manifest takes a single `theme_color` and `background_color`, both `#FFFFFF`.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Show state with a line, a bar, weight or ink; fill only the three places in Brand & Style | Fill a button, chip, row or star, or anything outside those places |
| Use {colors.accent} as a line and {colors.accent-fill} as the fill | Use coral as text in light mode, or fill with {colors.accent} |
| Separate with whitespace and headings; hairlines only between Folding sections | Add dividers between rows or boxes around groups |
| Keep the one shadow on the book detail panel | Give the filter panel, sheet, toasts or dialogs a shadow |
| Keep every corner square | Round anything but the App bar's buttons, including chips and the sheet |
| Let large light lowercase headings carry the structure | Add icons, badges or bold text to do the same job |
| Let the covers carry the colour | Add status colours, or any accent beyond the coral and the error red |
| Lowercase through CSS, from one switch | Type interface strings in lowercase in the source |
