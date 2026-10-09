// Exports the PNG app icons from public/icons/icon.svg (DESIGN.md, App Icon). Run: npm run icons
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'

const dir = new URL('../public/icons/', import.meta.url)
const svg = await readFile(new URL('icon.svg', dir))
// The SVG is 192 units at the default 72 dpi; scale the density to rasterise at each size.
const sizes = { 'icon-192.png': 192, 'icon-512.png': 512, 'apple-touch-icon.png': 180 }

for (const [name, size] of Object.entries(sizes)) {
  await sharp(svg, { density: (72 * size) / 192 })
    .resize(size, size)
    .flatten({ background: '#F0604F' })
    .png()
    .toFile(fileURLToPath(new URL(name, dir)))
}
