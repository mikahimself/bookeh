import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'

import { ICONS, THEME_COLORS, themeColorFor } from '../../src/app/(frontend)/pwa'
import manifest from '../../src/app/manifest'

const read = (path: string) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8')
const iconPath = (name: string) =>
  fileURLToPath(new URL(`../../public/icons/${name}`, import.meta.url))

/** The first value of `name` after `header` in the raw `styles.css`. */
function tokenAfter(css: string, header: string, name: string): string {
  const start = css.indexOf(header)
  if (start === -1) throw new Error(`No "${header}"`)
  const value = css.slice(start).match(new RegExp(`${name}:\\s*([^;]+);`))?.[1]
  if (value === undefined) throw new Error(`No ${name} after "${header}"`)
  return value.trim()
}

const coral = [0xf0, 0x60, 0x4f]

describe('manifest', () => {
  it('describes bookeh as a standalone app with each icon once per purpose', () => {
    const icon = (src: string, sizes: string, purpose: string) => ({
      src,
      sizes,
      type: 'image/png',
      purpose,
    })
    expect(manifest()).toEqual({
      id: '/',
      name: 'bookeh',
      short_name: 'bookeh',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      theme_color: '#FFFFFF',
      background_color: '#FFFFFF',
      icons: [
        icon('/icons/icon-192.png', '192x192', 'any'),
        icon('/icons/icon-192.png', '192x192', 'maskable'),
        icon('/icons/icon-512.png', '512x512', 'any'),
        icon('/icons/icon-512.png', '512x512', 'maskable'),
      ],
    })
  })
})

describe('themeColorFor', () => {
  it('gives one colour for a fixed theme', () => {
    expect(themeColorFor('light')).toBe('#FFFFFF')
    expect(themeColorFor('dark')).toBe('#14181D')
  })

  it('gives a light and dark pair following the OS for system', () => {
    expect(themeColorFor('system')).toEqual([
      { media: '(prefers-color-scheme: light)', color: '#FFFFFF' },
      { media: '(prefers-color-scheme: dark)', color: '#14181D' },
    ])
  })

  it('uses the --color-background tokens of styles.css', () => {
    const css = read('../../src/app/(frontend)/styles.css')
    expect(THEME_COLORS.light.toLowerCase()).toBe(
      tokenAfter(css, '@theme static', '--color-background').toLowerCase(),
    )
    expect(THEME_COLORS.dark.toLowerCase()).toBe(
      tokenAfter(css, ":root[data-theme='dark']", '--color-background').toLowerCase(),
    )
  })
})

describe('app icon', () => {
  it('is a 192-unit SVG with the b as a path, the coral ground, white b and slate bar', () => {
    const svg = read('../../public/icons/icon.svg')
    expect(svg).toContain('viewBox="0 0 192 192"')
    expect(svg).not.toContain('<text')
    expect(svg).toContain('<rect width="192" height="192" fill="#F0604F"/>')
    expect(svg).toMatch(/<path [^>]*fill="#FFFFFF"/)
    expect(svg).toContain('<rect x="66" y="142" width="60" height="6" fill="#1F2933"/>')
  })

  it.each([
    [ICONS.icon192, 192],
    [ICONS.icon512, 512],
    [ICONS.apple, 180],
  ])('%s is an opaque %ipx PNG on the coral ground', async (src, size) => {
    const image = sharp(iconPath(src.replace('/icons/', '')))
    const meta = await image.metadata()
    expect(meta).toMatchObject({ width: size, height: size, format: 'png', hasAlpha: false })
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true })
    expect(info.channels).toBe(3)
    expect([...data.subarray(0, 3)]).toEqual(coral)
  })

  it.each([
    ['icon-192.png', 192],
    ['icon-512.png', 512],
    ['apple-touch-icon.png', 180],
  ])('%s matches icon.svg rendered as scripts/export-icons.mjs does', async (name, size) => {
    const svg = readFileSync(iconPath('icon.svg'))
    const fresh = await sharp(svg, { density: (72 * size) / 192 })
      .resize(size, size)
      .flatten({ background: '#F0604F' })
      .png()
      .toBuffer()
    const expected = await sharp(fresh).raw().toBuffer()
    const committed = await sharp(iconPath(name)).raw().toBuffer()
    expect(committed.length).toBe(expected.length)
    let off = 0
    for (let i = 0; i < expected.length; i++) if (Math.abs(committed[i] - expected[i]) > 2) off++
    expect(off).toBe(0)
  })

  it.each(['icon-192.png', 'icon-512.png'])(
    '%s keeps the mark, white b and slate bar, inside the maskable safe zone',
    async (name) => {
      const { data, info } = await sharp(iconPath(name)).raw().toBuffer({ resolveWithObject: true })
      const centre = info.width / 2
      const radius = 0.4 * info.width
      const near = (i: number, rgb: number[]) => rgb.every((c, k) => Math.abs(data[i + k] - c) <= 2)
      const off: string[] = []
      let white = 0
      let slate = 0
      for (let y = 0; y < info.height; y++) {
        for (let x = 0; x < info.width; x++) {
          const i = (y * info.width + x) * info.channels
          if (Math.hypot(x + 0.5 - centre, y + 0.5 - centre) <= radius) {
            if (near(i, [0xff, 0xff, 0xff])) white++
            if (near(i, [0x1f, 0x29, 0x33])) slate++
          } else if (!near(i, coral)) off.push(`${x},${y}`)
        }
      }
      expect(off).toEqual([])
      expect(white).toBeGreaterThan(0)
      expect(slate).toBeGreaterThan(0)
    },
  )
})
