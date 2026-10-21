/**
 * A cover's corners and the rule they must meet. Pure, so client components
 * may import it (spine, Design Paradigm): the crop step disables Use with the
 * same `checkCorners` the server applies.
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
