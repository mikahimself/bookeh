/**
 * Request header carrying a page's path and search, set by `src/proxy.ts` and
 * read by `requireUser()`. Its own module so the proxy does not load the
 * Payload config.
 */
export const PATH_HEADER = 'x-bookeh-path'
