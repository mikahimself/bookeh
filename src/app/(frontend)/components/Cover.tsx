'use client'

import { useState } from 'react'

/**
 * DESIGN.md, Cover placeholder; spine, AD-10: a book's cover at 2:3, filling
 * its parent's width. `src` is a `coverUrl()` result, computed on the server,
 * or a local `blob:` URL (Edit book's preview of an upload).
 * Without one, or once that `src` failed to load, an outlined box with the
 * title inside. Decorative either way: the title is always shown beside a
 * cover. A failed `src` is kept rather than a flag, so a new `src` loads again.
 */
export function Cover({ src, title }: { src: string | null; title: string }) {
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
        className="block aspect-2/3 w-full object-cover"
      />
    )
  }

  return (
    <div
      aria-hidden
      // Without a title (a row at s, 16px wide) the box has no padding to overflow it.
      className={`aspect-2/3 w-full overflow-hidden border border-text-dim text-label break-words text-text-muted${title ? ' p-2' : ''}`}
    >
      {title}
    </div>
  )
}
