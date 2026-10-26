'use client'

import { type CSSProperties, useState } from 'react'

/**
 * DESIGN.md, Colors: the cloths in five equal shares, each cloth with the
 * ink its title reads in: an accent, white, or one of the four base cloths
 * for the other three fifths.
 */
const ACCENTS = [
  'bg-cloth-yellow text-cloth-ink-dark',
  'bg-cloth-pink text-cloth-ink-dark',
] as const
const WHITE = 'bg-cloth-white text-cloth-ink-dark'
const BASE = [
  'bg-cloth-blue text-cloth-ink-light',
  'bg-cloth-cyan text-cloth-ink-dark',
  'bg-cloth-charcoal text-cloth-ink-light',
  'bg-cloth-gray text-cloth-ink-dark',
] as const

/** MurmurHash3's finaliser: spreads a weak hash over all 32 bits. */
function spread(h: number): number {
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  return (h ^ (h >>> 16)) >>> 0
}

/**
 * A title's cloth and the part of the noise tile it shows. Keyed on the title,
 * not the Book id, so a Book not saved yet (the Answer, the edition picker)
 * wears the cloth it will have on the shelf. The share comes from the high
 * bits, the cloth within it from a second draw, so the two are independent.
 */
function cloth(title: string): { className: string; style: CSSProperties } {
  let hash = 7
  for (const char of title) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  const first = spread(hash)
  const second = spread(first ^ 0x9e3779b9)
  const fifth = Math.floor((first / 2 ** 32) * 5)
  const className =
    fifth === 0
      ? ACCENTS[second % ACCENTS.length]
      : fifth === 1
        ? WHITE
        : BASE[second % BASE.length]
  const x = ((second >>> 8) % 5) * 25
  const y = ((second >>> 16) % 5) * 25
  return { className, style: { '--cover-noise-at': `${x}% ${y}%` } as CSSProperties }
}

/**
 * The title's hyphenation language: the Book's stored code (spine,
 * Conventions: ISO 639-1, else 639-2), or Finnish when it has none or an
 * override holds free text. A pattern, not `Intl`, so the server and the
 * browser always agree.
 */
const hyphenation = (language: string | null): string =>
  language !== null && /^[a-z]{2,3}$/.test(language) ? language : 'fi'

/**
 * DESIGN.md, Cover tile and Cover placeholder; spine, AD-10: a book's cover at
 * 2:3, filling its parent's width, with the cover frame. `src` is a
 * `coverUrl()` result, computed on the server, or a local `blob:` URL (Edit
 * book's preview of an upload).
 * Without one, or once that `src` failed to load, the cloth cover: a cloth
 * picked by the title, under the noise mottle, with the title alone in
 * `cover-title`, hyphenated in the Book's `language`, whose size follows the
 * cover's width (none in rows).
 * Decorative either way: the title is always shown beside a cover. A failed
 * `src` is kept rather than a flag, so a new `src` loads again.
 */
export function Cover({
  src,
  title,
  language,
}: {
  src: string | null
  title: string
  language: string | null
}) {
  const [failed, setFailed] = useState<string | null>(null)

  if (src !== null && src !== failed) {
    return (
      // AD-10: covers are our own URLs, served as stored; no `next/image`.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        loading="lazy"
        // An image that failed before hydration fired `error` before React listened.
        // A lazy image not yet requested has no `currentSrc` and has not failed.
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0 && img.currentSrc !== '') setFailed(src)
        }}
        onError={() => setFailed(src)}
        className="cover-frame block aspect-2/3 w-full object-cover"
      />
    )
  }

  const { className, style } = cloth(title)
  return (
    <div
      aria-hidden
      data-cover-cloth
      style={style}
      className={`cover-cloth cover-frame block aspect-2/3 w-full ${className}`}
    >
      {title && (
        <span lang={hyphenation(language)} className="cover-title">
          {title}
        </span>
      )}
    </div>
  )
}
