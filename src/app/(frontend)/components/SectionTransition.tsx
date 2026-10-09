import { ViewTransition, type ReactNode } from 'react'

/**
 * The section slide (EXPERIENCE.md, Motion): a section change carrying
 * `section-next` or `section-prev` slides the header and the content that
 * way (styles.css). Under any other transition the boundary stays unnamed,
 * so it neither animates nor disturbs the task slides. In a file of its own
 * so unit tests, which run a React without `ViewTransition`, can mock it.
 */
export function SectionTransition({ children }: { children: ReactNode }) {
  return (
    <ViewTransition
      update={{ 'section-next': 'section-next', 'section-prev': 'section-prev', default: 'none' }}
      default="none"
    >
      {children}
    </ViewTransition>
  )
}
