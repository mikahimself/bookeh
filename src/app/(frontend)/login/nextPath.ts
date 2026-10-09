const base = new URL('http://bookeh.invalid')
const controlOrBackslash = /[\u0000-\u001f\u007f\\]/

/**
 * Spine, AD-2: where sign-in returns to. Only a same-origin path is honoured
 * (one leading `/`, no backslash, no control characters); anything else, and
 * `/login` itself, becomes `/`. Returns pathname, search and hash.
 */
export function safeNextPath(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return '/'
  if (controlOrBackslash.test(value)) return '/'
  let url: URL
  try {
    url = new URL(value, base)
  } catch {
    return '/'
  }
  // Dot segments resolve before the check: `/..//evil.example` becomes `//evil.example`.
  if (url.origin !== base.origin || url.pathname.startsWith('//')) return '/'
  if (url.pathname === '/login' || url.pathname === '/login/') return '/'
  return url.pathname + url.search + url.hash
}
