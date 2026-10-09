import type { ReactNode } from 'react'

/** An error announced as an alert, led by the 8px danger square. */
export function ErrorMessage({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex items-center gap-2 text-meta">
      <span aria-hidden="true" className="size-2 shrink-0 bg-danger" />
      <span>{children}</span>
    </p>
  )
}
