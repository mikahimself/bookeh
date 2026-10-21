import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { checkCorners, squareToQuad, type Corners } from '@/lib/catalogue/corners'
import { warpCover } from '@/lib/catalogue/warpCover'

// The cover warp, AD-14: a hand-written square-to-quad map, a corner check
// that admits only convex clockwise quads inside the image, and output that
// carries no metadata.

const size = { width: 100, height: 150 }

describe('squareToQuad', () => {
  it('maps the unit square onto the corners of a non-parallelogram quad', () => {
    const corners: Corners = [
      { x: 10, y: 5 },
      { x: 90, y: 20 },
      { x: 80, y: 140 },
      { x: 5, y: 120 },
    ]
    const map = squareToQuad(corners)
    const unit = [map(0, 0), map(1, 0), map(1, 1), map(0, 1)]
    unit.forEach((p, i) => {
      expect(p.x).toBeCloseTo(corners[i].x, 9)
      expect(p.y).toBeCloseTo(corners[i].y, 9)
    })
  })
})

describe('checkCorners', () => {
  const convex: Corners = [
    { x: 10, y: 10 },
    { x: 90, y: 15 },
    { x: 85, y: 140 },
    { x: 5, y: 130 },
  ]

  it('accepts a convex clockwise quad inside the image', () => {
    expect(checkCorners(convex, size)).toBe(true)
  })

  const [tl, tr, br, bl] = convex
  it.each<[string, Corners]>([
    ['crossed', [tl, tr, bl, br]],
    ['concave', [tl, tr, { x: 30, y: 40 }, bl]],
    ['three collinear', [tl, { x: 50, y: 10 }, { x: 90, y: 10 }, bl]],
    ['counter-clockwise', [tl, bl, br, tr]],
    ['non-finite', [tl, tr, { x: Number.NaN, y: 140 }, bl]],
    ['outside the image', [tl, { x: 101, y: 15 }, br, bl]],
  ])('rejects a %s quad', (_, corners) => {
    expect(checkCorners(corners, size)).toBe(false)
  })
})

describe('warpCover', () => {
  it('strips EXIF and GPS data', async () => {
    const photo = await sharp({
      create: { width: 60, height: 90, channels: 3, background: { r: 30, g: 120, b: 200 } },
    })
      .withExif({
        IFD0: { Make: 'Phone', Model: 'Camera' },
        IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '60/1 10/1 0/1' },
      })
      .jpeg()
      .toBuffer()
    const exif = (await sharp(photo).metadata()).exif
    // The GPS IFD pointer tag, 0x8825, little-endian.
    expect(exif?.includes(Buffer.from([0x25, 0x88]))).toBe(true)

    const { bytes, width, height } = await warpCover(photo, [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 60, y: 90 },
      { x: 0, y: 90 },
    ])
    const metadata = await sharp(bytes).metadata()
    expect(metadata).toMatchObject({ format: 'jpeg', width, height })
    expect(width * 3).toBe(height * 2)
    expect(metadata.exif).toBeUndefined()
    expect(bytes.includes('Exif')).toBe(false)
  })

  it('warps the quad upright from an oriented, oversized photo into at most 800×1200', async () => {
    // As displayed: 2400×3600, quadrants red, green / yellow, blue. Stored
    // turned a quarter left with EXIF orientation 6, so only `.rotate()`
    // brings it upright; over 2000 px, so the corners are scaled.
    const tile = (r: number, g: number, b: number) =>
      sharp({ create: { width: 1200, height: 1800, channels: 3, background: { r, g, b } } })
        .png()
        .toBuffer()
    const displayed = await sharp({
      create: { width: 2400, height: 3600, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .composite([
        { input: await tile(0, 255, 0), left: 1200, top: 0 },
        { input: await tile(255, 255, 0), left: 0, top: 1800 },
        { input: await tile(0, 0, 255), left: 1200, top: 1800 },
      ])
      .png()
      .toBuffer()
    const turned = await sharp(displayed).rotate(-90).png().toBuffer()
    const photo = await sharp(turned).withMetadata({ orientation: 6 }).jpeg().toBuffer()

    const { bytes, width, height } = await warpCover(photo, [
      { x: 300, y: 300 },
      { x: 2100, y: 300 },
      { x: 2300, y: 3300 },
      { x: 100, y: 3300 },
    ])
    expect({ width, height }).toEqual({ width: 800, height: 1200 })

    const { data } = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
    const rgb = (x: number, y: number) => [
      ...data.subarray((y * 800 + x) * 3, (y * 800 + x) * 3 + 3),
    ]
    const near = (actual: number[], expected: number[]) =>
      actual.every((value, i) => Math.abs(value - expected[i]) < 40)
    expect(near(rgb(200, 300), [255, 0, 0])).toBe(true)
    expect(near(rgb(600, 300), [0, 255, 0])).toBe(true)
    expect(near(rgb(200, 900), [255, 255, 0])).toBe(true)
    expect(near(rgb(600, 900), [0, 0, 255])).toBe(true)
  })

  it('refuses an image over the pixel limit before decoding it', async () => {
    const huge = await sharp({
      create: { width: 8000, height: 8000, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .png()
      .toBuffer()
    await expect(
      warpCover(huge, [
        { x: 0, y: 0 },
        { x: 8000, y: 0 },
        { x: 8000, y: 8000 },
        { x: 0, y: 8000 },
      ]),
    ).rejects.toMatchObject({ code: 'IMAGE_TOO_LARGE' })
  })

  it('rejects corners that do not form a cover', async () => {
    const photo = await sharp({
      create: { width: 60, height: 90, channels: 3, background: { r: 30, g: 120, b: 200 } },
    })
      .png()
      .toBuffer()
    const crossed: Corners = [
      { x: 0, y: 0 },
      { x: 60, y: 0 },
      { x: 0, y: 90 },
      { x: 60, y: 90 },
    ]
    await expect(warpCover(photo, crossed)).rejects.toMatchObject({ code: 'INVALID_CORNERS' })
  })
})
