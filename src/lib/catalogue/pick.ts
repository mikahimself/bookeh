/**
 * AD-9: the one rule for a candidate index, shared by the lookup, the cover
 * preview and download, and Book creation. `pick` when it indexes one of
 * `length` candidates; anything else, or none, is the best one (0).
 */
export const pickIndex = (pick: number | undefined, length: number): number =>
  pick !== undefined && Number.isInteger(pick) && pick >= 0 && pick < length ? pick : 0
