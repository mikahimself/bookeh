/**
 * A cover's corners, the rule they must meet and the map they define. Pure,
 * so client components may import it (spine, Design Paradigm): the crop step
 * disables Use with the same `checkCorners` the server applies, and Edit
 * book's preview warps with the server's own `squareToQuad`.
 */

/** Spine, Shared shapes: a point in an image's pixels, origin top left, y down. */
export type Point = { x: number; y: number }

/** Spine, Shared shapes: a cover's corners in the uploaded image's pixels, clockwise from top left. */
export type Corners = readonly [tl: Point, tr: Point, br: Point, bl: Point]

const isPoint = (p: unknown): p is Point =>
  typeof p === 'object' &&
  p !== null &&
  Number.isFinite((p as Point).x) &&
  Number.isFinite((p as Point).y)

/**
 * Whether `corners` form a cover in an image of `size`: four finite points
 * inside the image, clockwise on screen with every turn strictly convex, so
 * crossed, concave, collinear and counter-clockwise quads all fail. Checks
 * the shape at run time too, since corners come from a client.
 */
export function checkCorners(corners: Corners, size: { width: number; height: number }): boolean {
  if (!Array.isArray(corners) || corners.length !== 4 || !corners.every(isPoint)) return false
  if (!corners.every((p) => p.x >= 0 && p.x <= size.width && p.y >= 0 && p.y <= size.height)) {
    return false
  }
  return corners.every((p, i) => {
    const q = corners[(i + 1) % 4]
    const r = corners[(i + 2) % 4]
    return (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x) > 0
  })
}

/** The projective map from the unit square to a quad: `(u, v)` → `(x, y)`. */
export type QuadMap = (u: number, v: number) => Point

/**
 * Heckbert's closed-form square-to-quad mapping: (0,0), (1,0), (1,1), (0,1)
 * go to TL, TR, BR, BL. `x = (a·u + b·v + c) / (g·u + h·v + 1)`, `y` alike
 * with `d`, `e`, `f`; `g` and `h` are 0 for a parallelogram (affine).
 * `corners` must pass `checkCorners()`.
 */
export function squareToQuad(corners: Corners): QuadMap {
  const [p0, p1, p2, p3] = corners
  const sx = p0.x - p1.x + p2.x - p3.x
  const sy = p0.y - p1.y + p2.y - p3.y
  let g = 0
  let h = 0
  if (sx !== 0 || sy !== 0) {
    const dx1 = p1.x - p2.x
    const dx2 = p3.x - p2.x
    const dy1 = p1.y - p2.y
    const dy2 = p3.y - p2.y
    const den = dx1 * dy2 - dx2 * dy1
    g = (sx * dy2 - sy * dx2) / den
    h = (dx1 * sy - dy1 * sx) / den
  }
  const a = p1.x - p0.x + g * p1.x
  const b = p3.x - p0.x + h * p3.x
  const c = p0.x
  const d = p1.y - p0.y + g * p1.y
  const e = p3.y - p0.y + h * p3.y
  const f = p0.y
  return (u, v) => {
    const w = g * u + h * v + 1
    return { x: (a * u + b * v + c) / w, y: (d * u + e * v + f) / w }
  }
}
