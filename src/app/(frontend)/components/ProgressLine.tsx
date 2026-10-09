/**
 * DESIGN.md, Progress line: a `stroke-control` accent line moving across the
 * top edge of the screen while something loads. Still under reduce motion.
 */
export function ProgressLine({ label }: { label: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      className="fixed inset-x-0 top-0 z-20 h-stroke-control overflow-hidden"
    >
      <div className="h-full w-full animate-progress bg-accent motion-reduce:animate-none" />
    </div>
  )
}
