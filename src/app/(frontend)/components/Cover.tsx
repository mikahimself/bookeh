'use client'

import { type CSSProperties, useState } from 'react'

/** DESIGN.md, Colors: the six cloths, each with the ink its title reads in. */
const CLOTHS = [
  'bg-cloth-blue text-cloth-ink-light',
  'bg-cloth-pink text-cloth-ink-dark',
  'bg-cloth-green text-cloth-ink-light',
  'bg-cloth-yellow text-cloth-ink-dark',
  'bg-cloth-navy text-cloth-ink-light',
  'bg-cloth-red text-cloth-ink-light',
] as const

/**
 * A title's cloth and the part of the noise tile it shows. Keyed on the title,
 * not the Book id, so a Book not saved yet (the Answer, the edition picker)
 * wears the cloth it will have on the shelf.
 */
function cloth(title: string): { className: string; style: CSSProperties } {
  let hash = 7
  for (const char of title) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0
  const x = ((hash >>> 8) % 5) * 25
  const y = ((hash >>> 16) % 5) * 25
  return {
    className: CLOTHS[hash % CLOTHS.length],
    style: { '--cover-noise-at': `${x}% ${y}%` } as CSSProperties,
  }
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
