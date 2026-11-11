import { fireEvent } from '@testing-library/react'

/** Opens every Folding section of Book detail, which starts with all closed. */
export function openSections(surface: HTMLElement): HTMLElement {
  for (const row of surface.querySelectorAll<HTMLElement>(
    '[data-fold-row][aria-expanded="false"]',
  )) {
    fireEvent.click(row)
  }
  return surface
}
