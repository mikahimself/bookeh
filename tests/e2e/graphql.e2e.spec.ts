import { test, expect } from '@playwright/test'

const base = 'http://localhost:3000'

test.describe('GraphQL removed', () => {
  const cases = [
    { method: 'POST', path: '/api/graphql' },
    { method: 'GET', path: '/api/graphql' },
    { method: 'GET', path: '/api/graphql-playground' },
    { method: 'POST', path: '/api/graphql-playground' },
  ] as const

  for (const { method, path } of cases) {
    test(`${method} ${path} answers a JSON 404 from the REST catch-all`, async ({ request }) => {
      const response = await request.fetch(`${base}${path}`, {
        method,
        data: method === 'POST' ? { query: '{ __typename }' } : undefined,
      })
      expect(response.status()).toBe(404)
      expect(response.headers()['content-type']).toContain('application/json')
      const body = await response.json()
      expect(body.message).toMatch(/not found/i)
    })
  }

  test('REST still answers: GET /api/users/me is 200', async ({ request }) => {
    const response = await request.get(`${base}/api/users/me`)
    expect(response.status()).toBe(200)
  })
})
