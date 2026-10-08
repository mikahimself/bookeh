import { getPayload, Payload } from 'payload'
import { beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

let payload: Payload

describe('Payload config', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  it('has GraphQL disabled', async () => {
    expect(payload.config.graphQL.disable).toBe(true)
  })
})
