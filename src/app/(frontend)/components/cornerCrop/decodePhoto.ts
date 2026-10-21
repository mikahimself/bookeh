/** A decoded photo re-encoded as JPEG, and that JPEG's size in pixels. */
export type Photo = { image: Blob; width: number; height: number }

/** A photo longer than this on its long side is shrunk to it. */
const MAX_SIDE = 2000
const QUALITY = 0.9

/**
 * `file` decoded with its EXIF orientation applied, shrunk to `MAX_SIDE` on
 * the long side (never enlarged), flattened onto white and re-encoded as
 * JPEG; the crop step's corners are in this JPEG's pixels. `null` when the
 * browser can't decode it or the canvas fails.
 */
export async function decodePhoto(file: Blob): Promise<Photo | null> {
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    return null
  }
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
    const width = Math.max(1, Math.round(bitmap.width * scale))
    const height = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return null
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    const image = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    )
    return image ? { image, width, height } : null
  } catch {
    return null
  } finally {
    bitmap.close()
  }
}
