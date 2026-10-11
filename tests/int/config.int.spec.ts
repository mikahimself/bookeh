import { REST_GET, REST_POST } from '@payloadcms/next/routes'
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

  // The REST handlers behind `app/(payload)/api/[...slug]`: with GraphQL off
  // its routes do not exist, and Payload answers like any unknown route.
  it.each([
    [
      'POST /api/graphql',
      REST_POST(config),
      () =>
        new Request('http://localhost/api/graphql', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: '{ __typename }' }),
        }),
      ['graphql'],
    ],
    [
      'GET /api/graphql-playground',
      REST_GET(config),
      () => new Request('http://localhost/api/graphql-playground'),
      ['graphql-playground'],
    ],
  ])('%s answers a JSON 404', async (_, handler, request, slug) => {
    // Built per run: a POST body stream is consumed on first use.
    const response = await handler(request(), { params: Promise.resolve({ slug }) })
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await response.json()).toMatchObject({ message: expect.stringMatching(/not found/i) })
  })
})
