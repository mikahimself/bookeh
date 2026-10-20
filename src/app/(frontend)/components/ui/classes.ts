/** DESIGN.md, Combobox: the popup, an outlined box on the plain ground, no shadow. Shared with Menu. */
export const popupClass =
  'max-h-(--available-height) overflow-y-auto overscroll-contain border-2 border-text bg-background outline-none'

/** An option or menu item: the selection bar while highlighted, the row not tinted. Shared with Menu. */
export const optionClass =
  'flex cursor-default items-center gap-2 px-3 py-2 text-control text-text outline-none select-none max-wide:min-h-tap data-highlighted:selection-bar'

/** The 8px marker's slot: empty unless chosen, so the labels line up (Combobox, Picker). */
export const markerSlotClass = 'size-2 shrink-0'
