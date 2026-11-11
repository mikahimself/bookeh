'use client'

import { Accordion as BaseAccordion } from '@base-ui/react/accordion'
import type { ReactNode } from 'react'

/** Marks an item and its row, for `focusSectionRow`. */
const ITEM = 'data-fold-item'
const ROW = 'data-fold-row'

/**
 * DESIGN.md, Folding section: the list of rows, several open at once, all
 * closed at first. Not an overlay. Unstyled beyond `className`; the items
 * draw their own rows.
 */
export function Accordion({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <BaseAccordion.Root multiple className={className}>
      {children}
    </BaseAccordion.Root>
  )
}

/**
 * One Folding section: a full-width row at least `fold-row` tall (the title
 * lowercase in `heading-group`, the muted `summary` at the right, a chevron
 * that turns over while open) under a hairline, and its panel, mounted only
 * while open, `spacing-4` under the row. The row is a button with
 * `aria-expanded`; `rowId` names it for `focus()` from elsewhere.
 */
export function AccordionItem({
  value,
  title,
  summary,
  rowId,
  children,
}: {
  value: string
  title: string
  summary?: string
  rowId?: string
  children: ReactNode
}) {
  return (
    <BaseAccordion.Item
      value={value}
      {...{ [ITEM]: '' }}
      className="border-t-(length:--spacing-stroke-hairline) border-border"
    >
      <BaseAccordion.Header className="m-0">
        <BaseAccordion.Trigger
          id={rowId}
          {...{ [ROW]: '' }}
          className="group flex min-h-fold-row w-full items-center justify-between gap-4 bg-transparent text-left text-heading-group text-text ui-case"
        >
          <span>{title}</span>
          <span className="flex shrink-0 items-center gap-3 text-meta font-normal text-text-muted normal-case">
            {summary}
            <svg
              aria-hidden="true"
              viewBox="0 0 16 16"
              className="size-4 fill-none stroke-current stroke-2 transition-transform group-data-panel-open:rotate-180 motion-reduce:transition-none"
            >
              <path d="M2 5.5l6 6 6-6" />
            </svg>
          </span>
        </BaseAccordion.Trigger>
      </BaseAccordion.Header>
      <BaseAccordion.Panel>
        <div className="py-4">{children}</div>
      </BaseAccordion.Panel>
    </BaseAccordion.Item>
  )
}

/** Focuses the row of the Folding section `element` is in; false when it is in none. */
export function focusSectionRow(element: Element | null | undefined): boolean {
  const row = element?.closest(`[${ITEM}]`)?.querySelector<HTMLElement>(`[${ROW}]`)
  row?.focus()
  return row != null
}
