import { squareToQuad, type Corners } from '@/lib/catalogue/corners'

const WIDTH = 400
const HEIGHT = 600
const QUALITY = 0.85

/**
 * Edit book's preview of an upload: `corners` of `image` (the crop step's
 * JPEG, corners in its pixels) straightened to a 400 × 600 JPEG with the
 * server's own `squareToQuad`, nearest-pixel sampling at pixel centres,
 * clamped at the edges. Only a preview: the stored cover is `warpCover()`'s.
 * `null` when the browser can't decode `image` or the canvas fails.
 */
export async function warpPreview(image: Blob, corners: Corners): Promise<Blob | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(image)
  } catch {
    return null
  }
  const source = document.createElement('canvas')
  const target = document.createElement('canvas')
  try {
    const { width: w, height: h } = bitmap
    source.width = w
    source.height = h
    const sourceContext = source.getContext('2d')
    if (!sourceContext) return null
    sourceContext.drawImage(bitmap, 0, 0)
    const src = sourceContext.getImageData(0, 0, w, h).data

    target.width = WIDTH
    target.height = HEIGHT
    const targetContext = target.getContext('2d')
    if (!targetContext) return null
    const out = targetContext.createImageData(WIDTH, HEIGHT)
    const map = squareToQuad(corners)
    for (let j = 0; j < HEIGHT; j++) {
      const v = (j + 0.5) / HEIGHT
      for (let i = 0; i < WIDTH; i++) {
        const p = map((i + 0.5) / WIDTH, v)
        const x = Math.min(Math.max(Math.floor(p.x), 0), w - 1)
        const y = Math.min(Math.max(Math.floor(p.y), 0), h - 1)
        const from = (y * w + x) * 4
        const to = (j * WIDTH + i) * 4
        out.data[to] = src[from]
        out.data[to + 1] = src[from + 1]
        out.data[to + 2] = src[from + 2]
        out.data[to + 3] = 255
      }
    }
    targetContext.putImageData(out, 0, 0)
    return await new Promise<Blob | null>((resolve) =>
      target.toBlob(resolve, 'image/jpeg', QUALITY),
    )
  } catch {
    return null
  } finally {
    bitmap.close()
    // Released at once: iOS Safari caps the total canvas memory.
    for (const canvas of [source, target]) {
      canvas.width = 0
      canvas.height = 0
    }
  }
}
