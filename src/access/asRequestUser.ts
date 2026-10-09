import type { PayloadRequest } from 'payload'

/**
 * Local API options that query as the requesting user (AD-3). Spread into
 * every Local API call made from a hook or access function:
 * `req.payload.find({ collection, ...asRequestUser(req) })`.
 *
 * The Local API defaults to `overrideAccess: true`; this turns it off. A
 * request without a user passes `user: null`, so access denies rather than
 * this helper throwing.
 */
export const asRequestUser = (
  req: PayloadRequest,
): { req: PayloadRequest; user: PayloadRequest['user']; overrideAccess: false } => ({
  req,
  user: req.user,
  overrideAccess: false,
})
