import type { PayloadRequest } from 'payload'
import { describe, expect, it } from 'vitest'

import { asRequestUser } from '@/access/asRequestUser'
import { canEditShared, isAdmin, type RoleHolder } from '@/access/roles'

const signedOut: RoleHolder[] = [null, undefined]
const user: RoleHolder = { roles: ['user'] }
const admin: RoleHolder = { roles: ['admin', 'user'] }

describe.each([
  ['isAdmin', isAdmin],
  ['canEditShared', canEditShared],
])('%s', (_, helper) => {
  it.each(signedOut)('is false with no user (%s)', (u) => {
    expect(helper(u)).toBe(false)
  })

  it.each([{}, { roles: null }, { roles: [] }])('is false with no roles (%j)', (u) => {
    expect(helper(u)).toBe(false)
  })

  it('is false for a user', () => {
    expect(helper(user)).toBe(false)
  })

  it('is true for an admin', () => {
    expect(helper(admin)).toBe(true)
    expect(helper({ roles: ['admin'] })).toBe(true)
  })
})

describe('asRequestUser', () => {
  const reqWith = (u: RoleHolder) => ({ user: u }) as PayloadRequest

  it.each([
    ['no user', null],
    ['a user', user],
    ['an admin', admin],
  ])('passes the request, its user and overrideAccess: false for %s', (_, u) => {
    const req = reqWith(u)
    const options = asRequestUser(req)
    expect(options).toStrictEqual({ req, user: u, overrideAccess: false })
    expect(options.req).toBe(req)
  })
})
