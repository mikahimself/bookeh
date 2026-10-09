/** The four sections, in their fixed order (EXPERIENCE.md, Navigation). */
export const SECTIONS = [
  { key: 'collection', href: '/' },
  { key: 'loans', href: '/loans' },
  { key: 'wishlists', href: '/wishlists' },
  { key: 'settings', href: '/settings' },
] as const

export type Section = (typeof SECTIONS)[number]
export type SectionKey = Section['key']

/**
 * The section a pathname belongs to: the one whose path equals it or is
 * followed in it by `/`. Anything else is the collection.
 */
export function sectionOf(pathname: string): Section {
  return (
    SECTIONS.find(
      ({ href }) => href !== '/' && (pathname === href || pathname.startsWith(`${href}/`)),
    ) ?? SECTIONS[0]
  )
}

/** The headings row: the current section first, the others in order, wrapping round. */
export function sectionRow(current: SectionKey): Section[] {
  const at = SECTIONS.findIndex(({ key }) => key === current)
  return [...SECTIONS.slice(at), ...SECTIONS.slice(0, at)]
}
