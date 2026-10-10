import { ValidationError, type Payload } from 'payload'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { seedFirstUser } from '@/lib/account/seedFirstUser'

const email = 'first.user@test.invalid'
const password = 'seed-secret-password'

// Next types NODE_ENV as required on ProcessEnv.
const env = (vars: Record<string, string | undefined> = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: 'test',
  ...vars,
})

function fakePayload(userCount: number) {
  const fake = {
    count: vi.fn(async () => ({ totalDocs: userCount })),
    create: vi.fn(async (_args: unknown) => ({ id: 1 })),
    logger: { warn: vi.fn(), info: vi.fn() },
  }
  return { fake, payload: fake as unknown as Payload }
}

let fake: ReturnType<typeof fakePayload>['fake']
let payload: Payload

const logCalls = () => [...fake.logger.warn.mock.calls, ...fake.logger.info.mock.calls]

describe('seedFirstUser', () => {
  beforeEach(() => {
    ;({ fake, payload } = fakePayload(0))
  })

  it('creates the first user as admin and user on an empty instance', async () => {
    await seedFirstUser(payload, env({ SEED_EMAIL: email, SEED_PASSWORD: password }))

    expect(fake.count).toHaveBeenCalledWith({ collection: 'users' })
    expect(fake.create).toHaveBeenCalledTimes(1)
    const [args] = fake.create.mock.calls[0]
    expect(args).toStrictEqual({
      collection: 'users',
      data: {
        email,
        password,
        roles: ['admin', 'user'],
        displayName: 'first.user',
        language: 'en',
        profileVisibility: 'hidden',
        collectionVisibility: 'closed',
      },
    })
    expect(args).not.toHaveProperty('overrideAccess')
    expect(fake.logger.info).toHaveBeenCalledWith(expect.stringContaining(email))
    expect(fake.logger.warn).not.toHaveBeenCalled()
  })

  it('takes the display name from before the last @', async () => {
    await seedFirstUser(payload, env({ SEED_EMAIL: '"a@b"@example.com', SEED_PASSWORD: password }))
    expect(fake.create.mock.calls[0][0]).toMatchObject({ data: { displayName: '"a@b"' } })
  })

  it.each([
    ['set', { SEED_EMAIL: email, SEED_PASSWORD: password }],
    ['unset', {}],
  ])('does nothing when users exist (variables %s)', async (_, vars) => {
    ;({ fake, payload } = fakePayload(1))
    await seedFirstUser(payload, env(vars))

    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.logger.warn).not.toHaveBeenCalled()
    expect(fake.logger.info).not.toHaveBeenCalled()
  })

  it.each([
    ['SEED_EMAIL unset', { SEED_PASSWORD: password }, ['SEED_EMAIL']],
    ["SEED_EMAIL ''", { SEED_EMAIL: '', SEED_PASSWORD: password }, ['SEED_EMAIL']],
    ['SEED_PASSWORD unset', { SEED_EMAIL: email }, ['SEED_PASSWORD']],
    ["SEED_PASSWORD ''", { SEED_EMAIL: email, SEED_PASSWORD: '' }, ['SEED_PASSWORD']],
    ['both unset', {}, ['SEED_EMAIL', 'SEED_PASSWORD']],
  ])('warns and creates nothing with %s', async (_, vars, missing) => {
    await expect(seedFirstUser(payload, env(vars))).resolves.toBeUndefined()

    expect(fake.create).not.toHaveBeenCalled()
    expect(fake.logger.warn).toHaveBeenCalledTimes(1)
    const [message] = fake.logger.warn.mock.calls[0]
    for (const name of missing) expect(message).toContain(name)
    for (const name of ['SEED_EMAIL', 'SEED_PASSWORD'].filter((n) => !missing.includes(n)))
      expect(message).not.toContain(name)
    expect(fake.logger.info).not.toHaveBeenCalled()
  })

  it('propagates the ValidationError for an invalid email', async () => {
    const error = new ValidationError({
      collection: 'users',
      errors: [{ message: 'Invalid email', path: 'email' }],
    })
    fake.create.mockRejectedValueOnce(error)

    await expect(
      seedFirstUser(payload, env({ SEED_EMAIL: 'not-an-email', SEED_PASSWORD: password })),
    ).rejects.toBe(error)
    expect(fake.logger.info).not.toHaveBeenCalled()
  })

  it('never logs the password', async () => {
    for (const vars of [
      { SEED_EMAIL: email, SEED_PASSWORD: password },
      { SEED_PASSWORD: password },
    ]) {
      ;({ fake, payload } = fakePayload(0))
      await seedFirstUser(payload, env(vars))
      expect(logCalls().length).toBeGreaterThan(0)
      expect(JSON.stringify(logCalls())).not.toContain(password)
    }
  })
})
