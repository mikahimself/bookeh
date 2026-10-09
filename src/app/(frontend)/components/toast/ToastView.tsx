import { CloseButton } from '../CloseButton'

export type ToastViewProps = {
  kind: 'success' | 'error'
  message: string
  closeLabel: string
  onClose: () => void
}

/**
 * DESIGN.md, Toast: an outlined box (2px `text`) on `background`, `meta`
 * typography, message on the left and the Close (X) on the right. An error
 * starts with the 8px `danger` square and is `role="alert"`, which announces
 * on insertion. A success carries no role of its own: it is announced by the
 * provider's persistent `role="status"` region, into which the provider
 * inserts this box keyed per show, so a repeated message is re-announced.
 */
export function ToastView({ kind, message, closeLabel, onClose }: ToastViewProps) {
  return (
    <div
      {...(kind === 'error' && { role: 'alert' })}
      className="flex items-center gap-4 border-2 border-text bg-background px-3 py-2 text-meta text-text"
    >
      {kind === 'error' && <span aria-hidden="true" className="size-2 shrink-0 bg-danger" />}
      <span className="mr-auto">{message}</span>
      <CloseButton label={closeLabel} onClick={onClose} />
    </div>
  )
}
