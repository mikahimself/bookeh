/** How long the held ISBN must go unread before it counts as out of view. */
export const LEFT_VIEW_MS = 1500

export type ReadGate = {
  /**
   * One decode attempt: the ISBN read, or `null` for nothing decoded.
   * Returns the ISBN to act on, or `null` while it is the held one.
   */
  see: (isbn: string | null, now: number) => string | null
  /** Holds `isbn` as just handled, replacing any earlier hold. */
  hold: (isbn: string, now: number) => void
  /** The decode loop (re)starts: time without decoding does not count as out of view. */
  resume: (now: number) => void
}

/**
 * The one rule for "left the camera's view" (EXPERIENCE.md, Scan: the handled
 * ISBN is ignored until it leaves view). Holds at most one ISBN and when it
 * was last read; once it has gone unread for `leftViewMs` of decoding, the
 * hold is released. Time out of view, not missed attempts, so the wait is the
 * same on every phone. No clock of its own: `now` is always passed in.
 */
export function createReadGate(leftViewMs = LEFT_VIEW_MS): ReadGate {
  let held: string | null = null
  let lastSeen = 0

  return {
    see(isbn, now) {
      if (held !== null && now - lastSeen >= leftViewMs) held = null
      if (isbn === null) return null
      if (isbn === held) {
        lastSeen = now
        return null
      }
      return isbn
    },
    hold(isbn, now) {
      held = isbn
      lastSeen = now
    },
    resume(now) {
      if (held !== null) lastSeen = now
    },
  }
}
