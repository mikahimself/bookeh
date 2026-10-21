import sharp from 'sharp'

import { DomainError } from '@/lib/errors'

/** Spine, Shared shapes: a point in an image's pixels, origin top left, y down. */
export type Point = { x: number; y: number }

/** Spine, Shared shapes: a cover's corners in the uploaded image's pixels, clockwise from top left. */
export type Corners = readonly [tl: Point, tr: Point, br: Point, bl: Point]

/** The projective map from the unit square to a quad: `(u, v)` → `(x, y)`. */
export type QuadMap = (u: number, v: number) => Point

/** A larger image is `IMAGE_TOO_LARGE` before it is decoded: a small file can hold a huge one. */
const MAX_INPUT_PIXELS = 50_000_000
/** Images larger than this on the long side are shrunk first. */
const MAX_SIDE = 2000
/** The tallest stored cover; its width is ⅔ of the height. */
const MAX_HEIGHT = 1200
const QUALITY = 85

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

const FORMATS = new Set(['jpeg', 'png', 'webp'])

/**
 * The image's size with its EXIF orientation applied, from its header:
 * `NOT_AN_IMAGE` unless JPEG, PNG or WebP, `IMAGE_TOO_LARGE` over
 * `MAX_INPUT_PIXELS`.
 */
async function orientedSize(bytes: Buffer): Promise<{ width: number; height: number }> {
  const metadata = await sharp(bytes)
    .metadata()
    .catch(() => undefined)
  if (!metadata?.format || !FORMATS.has(metadata.format)) throw new DomainError('NOT_AN_IMAGE')
  const { width, height } = metadata.autoOrient
  if (!width || !height) throw new DomainError('NOT_AN_IMAGE')
  if (width * height > MAX_INPUT_PIXELS) throw new DomainError('IMAGE_TOO_LARGE')
  return { width, height }
}

export type WarpedCover = { bytes: Buffer; width: number; height: number }

/**
 * Spine, AD-14: the uploaded image's quad `corners` as a 2:3 JPEG. Sniffs
 * the type with sharp (`NOT_AN_IMAGE` unless JPEG, PNG or WebP), checks the
 * corners against the oriented image (`INVALID_CORNERS`), then: EXIF
 * orientation applied, shrunk to `MAX_SIDE` on the long side (the corners
 * scaled with it), flattened onto white, raw RGB, warped straight to the
 * output size with bilinear sampling at pixel centres, clamped at the edges.
 * The output height is the longest quad edge, at most `MAX_HEIGHT` and a
 * multiple of 3, the width ⅔ of it. Encoded from raw pixels, so no metadata
 * survives.
 */
export async function warpCover(bytes: Buffer, corners: Corners): Promise<WarpedCover> {
  const size = await orientedSize(bytes)
  if (!checkCorners(corners, size)) throw new DomainError('INVALID_CORNERS')

  const scale = Math.min(1, MAX_SIDE / Math.max(size.width, size.height))
  const width = Math.max(1, Math.round(size.width * scale))
  const height = Math.max(1, Math.round(size.height * scale))
  const sx = width / size.width
  const sy = height / size.height
  const scaled = ({ x, y }: Point): Point => ({ x: x * sx, y: y * sy })
  const [tl, tr, br, bl] = corners
  const quad: Corners = [scaled(tl), scaled(tr), scaled(br), scaled(bl)]

  const src = await sharp(bytes)
    .rotate()
    .resize({ width, height, fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .toColourspace('srgb')
    .raw()
    .toBuffer({ resolveWithObject: true })
    .catch(() => {
      throw new DomainError('NOT_AN_IMAGE')
    })
  const { data, info } = src
  const channels = info.channels
  const w = info.width
  const h = info.height

  const longest = Math.max(
    ...quad.map((p, i) => {
      const q = quad[(i + 1) % 4]
      return Math.hypot(q.x - p.x, q.y - p.y)
    }),
  )
  const unit = Math.max(1, Math.floor(Math.min(MAX_HEIGHT, longest) / 3))
  const outH = unit * 3
  const outW = unit * 2

  const map = squareToQuad(quad)
  const out = Buffer.alloc(outW * outH * 3)
  const at = (x: number, y: number, c: number) => data[(y * w + x) * channels + c]
  for (let j = 0; j < outH; j++) {
    const v = (j + 0.5) / outH
    for (let i = 0; i < outW; i++) {
      const p = map((i + 0.5) / outW, v)
      // Pixel (x, y) covers [x, x+1); its centre is at x + 0.5.
      const fx = Math.min(Math.max(p.x - 0.5, 0), w - 1)
      const fy = Math.min(Math.max(p.y - 0.5, 0), h - 1)
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, w - 1)
      const y1 = Math.min(y0 + 1, h - 1)
      const tx = fx - x0
      const ty = fy - y0
      const o = (j * outW + i) * 3
      for (let c = 0; c < 3; c++) {
        const top = at(x0, y0, c) * (1 - tx) + at(x1, y0, c) * tx
        const bottom = at(x0, y1, c) * (1 - tx) + at(x1, y1, c) * tx
        out[o + c] = Math.round(top * (1 - ty) + bottom * ty)
      }
    }
  }

  const jpeg = await sharp(out, { raw: { width: outW, height: outH, channels: 3 } })
    .jpeg({ quality: QUALITY })
    .toBuffer()
  return { bytes: jpeg, width: outW, height: outH }
}
