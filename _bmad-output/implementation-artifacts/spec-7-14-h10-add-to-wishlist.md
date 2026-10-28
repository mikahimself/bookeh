---
status: blocked
---

# 7.14 [H10] Add to wishlist

## Auto Run Result

Status: blocked
Blocking condition: awaiting Mika's mock-up pick. The story's first acceptance criterion requires Mika to pick how a list is created when the wishlist picker has none (within one overlay, from rendered mock-up options), with the pick recorded in EXPERIENCE.md before the screen is built. EXPERIENCE.md still lists it as not decided (Key screens note; Answer → Add to wishlist `[ASSUMPTION]`). An unattended run cannot make that pick.

**Done in this run.**
- Rendered the options: `_bmad-output/planning-artifacts/ux-designs/ux-bookeh-2026-10-03/.working/wishlist-picker-new-list.html`.
  - **A · Name field under the rows.** As Move's "New location": a "New list" field and a secondary Add under the rows. With no lists, only the field, focused.
  - **B · New list turns into a field.** "No wishlists" and a "New list" row. Tapping it swaps the picker's content, in the same overlay, for a name field, a primary Add and a Back link.
  - **C · Name prefilled.** A, but with no lists the field opens with "Wishlist" / "Toivelista" selected, so Add is one tap.
- All three keep the shared rules: the list is created in the save's transaction through a `{ create: name }` Ref, a taken name is rejected under the field, and Undo removes the entry but keeps the list.
- No code, spine or EXPERIENCE.md change.

**To resume.** Record the pick in EXPERIENCE.md (Answer → Add to wishlist, and the Key screens note), as `2b2840b` did for the lend picker. Then delete this file, or set it to `draft` and replace this body, and re-run `bmad-build-auto 7.14`.
