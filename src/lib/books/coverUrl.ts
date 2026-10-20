/**
 * Spine, AD-10/AD-14: the one producer of a cover URL. A saved cover is served
 * by Payload at `/api/media/file/<filename>`, the `url` it computes itself
 * (`generateFilePathOrURL`, relative as `serverURL` is unset); a Book not yet
 * saved has a preview at `/data/cover/<isbn13>`, with `?pick=<n>` for a
 * candidate other than the best, served by the handler in
 * `app/(frontend)/data/cover/[isbn13]/route.ts`, `isbn13` being a normalised
 * ISBN-13 as `SourceResult.isbn13` and `books.isbn13` carry it (callers
 * normalise, ISBN convention). Pure: no caller touches `media.url`, and the
 * int test pins the string against Payload's own, so a route change fails
 * loudly.
 */
export function coverUrl(cover: { filename: string } | { isbn13: string; pick?: number }): string {
  if ('filename' in cover) return `/api/media/file/${encodeURIComponent(cover.filename)}`
  const path = `/data/cover/${encodeURIComponent(cover.isbn13)}`
  return cover.pick === undefined ? path : `${path}?pick=${cover.pick}`
}
