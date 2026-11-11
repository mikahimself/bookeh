export type TileNumberStep = 'xl' | 'l' | 'm' | 's'

const STEPS: readonly [TileNumberStep, number][] = [
  ['xl', 64],
  ['l', 54],
  ['m', 44],
  ['s', 36],
]

/** A tile's inner width on a 390px phone: 171px minus 2 × 16px. The wide tiles are wider. */
const INNER_WIDTH = 139

/** Open Sans 300 widths in em, as the Stats canvas estimates them. */
function widthEm(value: string): number {
  let em = 0
  for (const c of value) em += c === ' ' || c === ' ' ? 0.26 : c === '.' || c === ',' ? 0.27 : 0.57
  return em
}

/** The largest step at which the widest value fits a tile's inner width, else `s`. */
export function tileNumberStep(values: string[]): TileNumberStep {
  const widest = Math.max(0, ...values.map(widthEm))
  return STEPS.find(([, px]) => widest * px <= INNER_WIDTH)?.[0] ?? 's'
}
