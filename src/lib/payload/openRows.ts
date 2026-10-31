import type { Where } from 'payload'

/** A wishlist entry not yet closed (Bought, Ordered or a save). */
export const openEntry: Where = { closedAt: { exists: false } }

/** A loan not yet returned. */
export const openLoan: Where = { returnedOn: { exists: false } }
