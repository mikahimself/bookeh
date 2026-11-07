import { expect, test } from '@playwright/test'
import pg from 'pg'

import { testDatabaseUrl } from '../helpers/testDatabase'
import { E2E_EMAIL, E2E_KIRJASAMPO, E2E_PASSWORD } from './account'

test('Kirjasampo themes enrich a saved Finna edition', async ({ page }) => {
  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(E2E_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.locator('header').getByRole('link', { name: 'Add book' }).click()

  const start = performance.now()
  const field = page.getByLabel('Or type an ISBN', { exact: true })
  await field.fill(E2E_KIRJASAMPO)
  await field.press('Enter')
  await expect(page.getByRole('heading', { name: 'Not in library' })).toBeVisible()
  const answerMs = Math.round(performance.now() - start)
  expect(answerMs).toBeLessThan(5_000)
  await expect(page.getByText('From Finna', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Add to library' }).click()
  await expect(page.getByRole('heading', { name: 'Add book', exact: true })).toBeVisible()

  const client = new pg.Client({ connectionString: testDatabaseUrl(process.env.DATABASE_URL) })
  await client.connect()
  try {
    const book = await client.query<{
      id: number
      title: string
      publisher: string
      source: string
    }>('SELECT id, title, publisher, source FROM books WHERE isbn13 = $1', [E2E_KIRJASAMPO])
    expect(book.rows).toHaveLength(1)
    expect(book.rows[0]).toMatchObject({ title: 'Hytti nro 6', publisher: 'WSOY', source: 'finna' })
    const authors = await client.query<{ name: string }>(
      'SELECT a.name FROM books_rels r JOIN authors a ON a.id = r.authors_id WHERE r.parent_id = $1 AND r.path = \'authors\' ORDER BY r."order"',
      [book.rows[0].id],
    )
    expect(authors.rows.map((row) => row.name)).toContain('Rosa Liksom')
    const themes = await client.query<{ text: string }>(
      'SELECT text FROM books_texts WHERE parent_id = $1 AND path = \'themes\' ORDER BY "order"',
      [book.rows[0].id],
    )
    expect(themes.rows.map((row) => row.text)).toContain('sovinismi')
    expect(themes.rows.map((row) => row.text)).toContain('kerronta')
    test.info().annotations.push({ type: 'scan-to-Answer ms', description: String(answerMs) })
  } finally {
    await client.end()
  }
})
