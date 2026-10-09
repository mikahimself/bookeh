---
name: bookeh
description: Type-led, line-only visual system for a personal book catalogue. White or dark slate ground, one coral accent used as lines, square corners, no fills, one soft shadow. Built with Tailwind CSS 4 tokens on headless primitives.
status: final
updated: 2026-10-06
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
typography:
  heading-section:
    fontFamily: 'Open Sans'
    fontSize: 44px
    fontWeight: '300'
    lineHeight: '1.1'
    letterSpacing: -0.015em
  heading-section-phone:
    fontFamily: 'Open Sans'
    fontSize: 38px
    fontWeight: '300'
    lineHeight: '1.1'
    letterSpacing: -0.015em
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
    fontSize: 15px
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
  panel-width: 360px
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
    border: '{spacing.stroke-control} solid {colors.accent}'
    radius: '{rounded.DEFAULT}'
    typography: '{typography.button}'
    transform: lowercase
  button-secondary:
    background: transparent
    foreground: '{colors.text}'
    border: '{spacing.stroke-control} solid {colors.text}'
    radius: '{rounded.DEFAULT}'
    typography: '{typography.button}'
    transform: lowercase
  button-destructive:
    background: transparent
    foreground: '{colors.text}'
    border: '{spacing.stroke-control} solid {colors.danger}'
    radius: '{rounded.DEFAULT}'
    typography: '{typography.button}'
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
  progress-line:
    height: '{spacing.stroke-control}'
    color: '{colors.accent}'
---

# bookeh — Design Spine

## Brand & Style

bookeh is a private catalogue of physical books, used on a phone in a bookshop and at a desk at home. It should feel calm: no glitz, nothing competing with the book covers, nothing decorative.

The visual language takes its notes from Microsoft's Metro. Type does the work that boxes and lines usually do. Section and screen names are large, light and lowercase. Content sits on a plain ground with whitespace between items instead of dividers. Corners are square. Colour is almost absent: slate text on white (or light text on dark slate), plus one coral that appears only as lines.

Three rules define the look more than any others:

- **No fills.** No area of the interface is filled with colour: no filled buttons, no tinted rows, no filled chips, no inverted segments, no filled stars. State and emphasis are shown with lines, weight and ink. The only solid marks are lines and the 8px marker. The only solid areas are the book covers and the {colors.scrim} behind a sheet or dialog.
- **One accent, as lines.** {colors.accent} is the only colour in normal use. It is a line, a bar, an outline or an underline, never an area. {colors.danger} appears only when something has gone wrong or is about to be removed, and follows the same rule.
- **One raised thing.** The look departs from Metro in one place on purpose: the book detail panel on wide screens has a dim border and a light shadow, because it is something extra that opens over the working view.

The system is built on Tailwind CSS 4 with tokens in `src/app/(frontend)/styles.css`, on unstyled headless primitives. Nothing is inherited from a component library's look.

→ Reference mock-ups, in the final tokens: [collection, wide](mockups/key-collection-wide.html) · [collection, phone](mockups/key-collection-phone.html) · [scan and answer](mockups/key-scan-phone.html) · [loans](mockups/key-loans.html) · [wishlists](mockups/key-wishlists.html) · [settings](mockups/key-settings.html). The spines win on any conflict with a mock-up. Earlier explorations, including the rejected options, are kept in `.working/`.

## Colors

Every colour has a light and a dark value. Dark tokens carry the `-dark` suffix here; that is a convention of this document. In code each colour is one variable whose value changes with the theme. The user picks light, dark or system in settings.

| Token | Light | Dark | Used for |
|---|---|---|---|
| `background` | `#FFFFFF` | `#14181D` | The only ground. Panels and sheets use it too; there is no separate surface colour. |
| `text` | `#1F2933` | `#E3E8EE` | All primary text, secondary button outlines, field underlines. |
| `text-muted` | `#5F6B78` | `#94A0AD` | Second lines, labels, group headings, locations. |
| `text-dim` | `#87919C` | `#626B76` | Inactive section headings and switch options; unrated stars; placeholder text and the underline of an empty field; disabled controls. |
| `border` | `#DDE2E7` | `#2C343D` | The detail panel's left border, and nothing else. It is too faint to carry meaning. |
| `accent` | `#F0604F` | `#FF8E7F` | Primary button outline, selection bar, link underline, lent marker, progress line. |
| `danger` | `#9B1C31` | `#E0566F` | Errors and destructive actions only: the destructive button's outline, the underline of a field with a mistake, the marker before an error message. |
| `scrim` | `#00000033` | `#00000066` | Dims what is behind a bottom sheet or a dialog. |
| `shadow` | `#1F293324` | `#00000073` | The detail panel's shadow, and nothing else. |

Rules for {colors.accent}:

- In light mode it is never text. Coral on white is about 3.2:1, enough for a line but not for text. In dark mode it may be text.
- It marks two things: what is selected or flagged (selection bar, lent marker), and the primary action (button outline, link underline).
- It outlines the primary button, and a layer has at most one (`EXPERIENCE.md` → Component Patterns).

Contrast against {colors.background}, approximate:

| Colour | Light | Dark | Good for |
|---|---|---|---|
| {colors.text} | 14.7:1 | 14.3:1 | Any text. |
| {colors.text-muted} | 5.4:1 | 6.6:1 | Any text. |
| {colors.danger} | 8.1:1 | 4.9:1 | Lines and text. |
| {colors.accent} | 3.2:1 | 8:1 | Lines. Text in dark mode only. |
| {colors.text-dim} | 3.2:1 | 3.3:1 | Large headings and lines. Small text only where it is the inactive option. |
| {colors.border} | 1.3:1 | 1.3:1 | Decoration only. |

{colors.accent} and {colors.text-dim} were strengthened to reach 3:1. The paler values in the early explorations under `.working/` are superseded; `.working/examples-contrast-red-filters.html` shows the difference.

Avoid: a second accent for anything but errors, status colours, tinted backgrounds, gradients, coloured text in light mode.

## Typography

One typeface: **Open Sans**, self-hosted, in weights 300 and 400. There is no bold in the interface; hierarchy comes from size and from the light weight. Book titles use the same typeface as everything else.

| Role | Token | Used for |
|---|---|---|
| Section heading | `heading-section` (44px / 300), `heading-section-phone` (38px / 300) | Section names (collection, loans, wishlists, settings) and full-screen screen names (scan, not in library). |
| Detail heading | `heading-detail` (26px / 300) | The book title in the detail panel and sheet. |
| Group heading | `heading-group` (20px / 300, muted) | Groups inside a panel or screen: your copies, lent before, genres and tags. |
| Title | `title` (17px / 400) | Book title in a row; author in the detail header. |
| Control | `control` (17px / 400) | Text switches: rows / covers, s / m / l, by person / by date. |
| Button | `button` (15px / 400) | Button labels. |
| Body | `body` (14px / 400) | Running text, values. |
| Meta | `meta` (13px / 400) | Second line of a row, locations, toasts. |
| Label | `label` (12px / 400) | Field labels, cover captions' second line. |

**Lowercase.** Section headings, screen headings, group headings and buttons are rendered lowercase with CSS `text-transform`, driven by one token or utility so the default can be changed in one place. Source strings are written in normal sentence case. Text switches follow the buttons and are lowercase too, except where the options are proper names, such as the languages. Labels, chips, messages and all book data (titles, authors, the user's own place names and tags) are shown as written. Text the user typed is never lowercased, even where it is a heading, such as a wishlist's name or a borrower's name.

Finnish text must render correctly at every size: å, ä and ö are letters, and Open Sans carries them in both weights.

## Layout & Spacing

A 4px base scale: {spacing.1} to {spacing.7}. Page margins are {spacing.page-margin} on wide screens and {spacing.page-margin-phone} on phones. Content aligns to the left margin; headings, search, rows and panel text share that edge.

Separation is whitespace. Rows in a list have no dividers between them. Groups are separated by a {typography.heading-group} heading and space.

| Where | Space |
|---|---|
| Inside a button | {spacing.2} above and below, {spacing.4} left and right |
| Between a row's cover, text and ending | {spacing.4} |
| Between section headings | {spacing.7}; {spacing.6} on the phone |
| Between controls in the tools row | {spacing.6} |
| Between buttons | {spacing.2} |
| Above a group heading | {spacing.4} |

The mock-ups were drawn before this table and are a pixel or two off it in places. The table wins.

Three stroke weights exist: {spacing.stroke-control} for button outlines, field underlines and the sheet's top edge; {spacing.stroke-selection} for the selection bar; and {spacing.stroke-hairline} for the detail panel's left border only.

**Collection density.** The collection has two layouts, each in three sizes. The size control is a text switch labelled s, m, l. s is the densest and l the roomiest.

| Layout | Size | Cover | Text | Spacing |
|---|---|---|---|---|
| Rows | l | 44 × 66px | Title, author, and year · publisher on three lines | 10px above and below |
| Rows | m | 32 × 48px | Title on one line; author · year · publisher on a second | 8px above and below |
| Rows | s | 16 × 24px | Title, author, year · publisher on one line | 3px above and below |
| Covers | l | Columns at least 160px wide | Title and author under the cover | 24px gap |
| Covers | m | Columns at least 116px wide | Title and author under the cover | 18px gap |
| Covers | s | Columns at least 76px wide | Title and author under the cover, at {typography.label} size | 10px gap |

Covers keep a 2:3 shape. What a row ends with is specified in `EXPERIENCE.md` → Collection controls.

On wide screens the detail panel is {spacing.panel-width} wide and sits beside the list, which narrows to make room.

→ Layout reference: [collection, wide](mockups/key-collection-wide.html) shows rows at m with both panels; [collection, phone](mockups/key-collection-phone.html) shows covers and rows at m. All three sizes of each layout are sketched in `.working/wireframes-density-and-detail.html` (options A and B).

## Elevation & Depth

One element is raised: the book detail panel on wide screens. It has a {spacing.stroke-hairline} {colors.border} line down its left edge and a light shadow falling to the left onto the list (`-10px 0 24px -14px` in {colors.shadow}). In dark mode the shadow is barely visible and the line does the separating.

Nothing else has a shadow or a raised surface, and there is no tonal layering. The filter panel is separated from the list by space. The bottom sheet is separated from the list by its {spacing.stroke-control} top edge and the {colors.scrim}. Toasts, dialogs and combobox popups are outlined boxes on the plain ground, with no shadow.

→ Reference: [collection, wide](mockups/key-collection-wide.html), light and dark.

## Shapes

Every corner is square: {rounded.DEFAULT} is 0px and there is no other radius. Buttons, fields, covers, checkboxes, the sheet and dialogs are all rectangles. The lent marker is a square, not a dot. There are no pills.

## Components

Visual specs. Behaviour lives in `EXPERIENCE.md` → Component Patterns.

| Component | Visual spec |
|---|---|
| Section heading | {typography.heading-section}, lowercase. The current section is {colors.text}; the others sit beside it in {colors.text-dim}. No underline, no box. |
| Text switch | Options side by side in {typography.control}. The chosen one is {colors.text}; the others are {colors.text-dim}. No outline, no underline, no fill. |
| Button, primary | Transparent, {colors.text} label, {spacing.stroke-control} {colors.accent} outline, square, lowercase. Full width when pinned at the bottom of a phone screen. |
| Button, secondary | As primary, with a {colors.text} outline. |
| Button, destructive | As primary, with a {colors.danger} outline. The label names the action. |
| Link | {colors.text} with a {spacing.stroke-control} {colors.accent} underline, offset 3px. |
| Link, destructive | A Link whose underline is {colors.danger}. Used wherever a Link removes something. |
| Back link | A Link in {typography.meta} above a screen heading, naming the section it returns to. Used on an opened wishlist. |
| List row | A name in {typography.title} with a count at the right in {typography.meta}, {colors.text-muted}. Used for the list of wishlists and the managed lists in settings. |
| Count line | {typography.meta} in {colors.text-muted}, directly under the search. "Clear" is a Link. |
| Empty state | A line in {typography.heading-group}, an optional line in {typography.body} and {colors.text-muted}, then the one action as a Link or the primary button. |
| Filter chip | A value on an opened book that can be tapped to filter (author, series, genre, tag, location). [ASSUMPTION: styled as a Link, with no outline or fill.] |
| Text field | {typography.label} label in {colors.text-muted} above the value. The value sits on a {spacing.stroke-control} {colors.text} underline; an empty field's underline is {colors.text-dim}; a field with a mistake has a {colors.danger} underline and a {typography.meta} message beneath. No box. The search field is the same without a label. |
| Book row | Cover, then title in {typography.title} and a {typography.meta} second line in {colors.text-muted}, then the location in {typography.meta}. No divider. Sizes per the density table. |
| Cover tile | Cover at 2:3, square corners, with title and author beneath. A lent copy has the 8px marker before its title. The open tile has the selection bar along the bottom edge of its cover. In select mode the checkbox sits before the title. [ASSUMPTION for these three states] |
| Cover placeholder | [ASSUMPTION: a book with no cover shows an outlined rectangle in {colors.text-dim} with the title inside in {colors.text-muted}.] |
| Selection bar | A {spacing.stroke-selection} {colors.accent} bar on the left edge of the open row. The row is not tinted. |
| Lent marker | An 8px {colors.accent} square before the text "Lent · {person}" in {colors.text}. |
| Detail panel | {spacing.panel-width} wide on the plain ground, with the left border and shadow described under Elevation & Depth. Cover 72 × 108px beside the {typography.heading-detail} title. Groups headed in {typography.heading-group}. Values in rows with the label left and the value right in {colors.text-muted}. Buttons at the foot. |
| Bottom sheet | Full width, plain ground, {spacing.stroke-control} {colors.text} top edge, {colors.scrim} over the list above. A short {spacing.stroke-control} line at the top centre is the handle. |
| Toast | An outlined box ({spacing.stroke-control} {colors.text}) above whatever is pinned to the bottom: message on the left, actions as Links and a Close (X) on the right. An error toast starts with an 8px {colors.danger} square. |
| Action bar | Full width along the bottom edge on the plain ground, with a {spacing.stroke-control} {colors.text} top edge. The count on the left, buttons on the right; Remove is a destructive button and Done the primary. On the phone it is two rows. |
| Checkbox | 20px square with a {spacing.stroke-control} {colors.text} outline. [ASSUMPTION: checked shows a tick drawn in {colors.text}; it is not filled.] |
| Rating | Five 22px star outlines. Rated stars are stroked in {colors.text}, the rest in {colors.text-dim}. No star is filled. A "Clear" Link in {typography.meta} sits beside the stars while a rating is set. |
| Option list | The values of a filter field, one per line in {typography.body}. A value that is switched on is {colors.text} with the 8px {colors.accent} marker before it; the others are {colors.text-muted}. |
| Combobox | A Text field. Its popup is an outlined box ({spacing.stroke-control} {colors.text}) directly under the field, as wide as the field. The highlighted option has the selection bar on its left; the chosen option has the 8px marker. [ASSUMPTION] |
| Date field | A Text field holding the platform's date control. |
| Picker | The Bottom sheet on the phone; the Dialog on wide screens. |
| Dialog | An outlined box ({spacing.stroke-control} {colors.text}) on the plain ground, centred, at most 400px wide, over the {colors.scrim}. Title in {typography.heading-group}, buttons right-aligned at the foot. [ASSUMPTION] |
| Progress line | [ASSUMPTION: a {spacing.stroke-control} {colors.accent} line moving across the top edge of the screen while something loads.] |
| Close (X) | Two {spacing.stroke-control} {colors.text} strokes forming an X, in the top right corner. No circle and no box around it. |
| Camera frame | A {spacing.stroke-control} {colors.text} rectangle around the camera view with a horizontal {colors.accent} guide line. |
| Corner crop | The photo full screen under the {colors.scrim}; the quadrilateral inside the four handles is undimmed and outlined in {spacing.stroke-control} {colors.text}. Four square handles at the corners, outlined in {spacing.stroke-control} {colors.text}, each with a 44px tap area; the hint in {typography.meta} above; Use (primary) and Cancel at the foot. [ASSUMPTION: handles 20px, like the checkbox.] |

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
| Show state with a line, a bar, weight or ink | Fill a button, chip, row or segment with colour |
| Use {colors.accent} as a line only | Use coral as text in light mode, or as an area anywhere |
| Separate with whitespace and headings | Add dividers between rows or boxes around groups |
| Keep the one shadow on the book detail panel | Give the filter panel, sheet, toasts or dialogs a shadow |
| Keep every corner square | Round anything, including chips and the sheet |
| Let large light lowercase headings carry the structure | Add icons, badges or bold text to do the same job |
| Let the covers carry the colour | Add status colours, or any accent beyond the coral and the error red |
| Lowercase through CSS, from one switch | Type interface strings in lowercase in the source |
