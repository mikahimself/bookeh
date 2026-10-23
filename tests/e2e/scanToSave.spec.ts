import { expect, test, type Page } from '@playwright/test'

import { E2E_EMAIL, E2E_ISBN_TYPED, E2E_LOCATION, E2E_PASSWORD } from './account'

// Spine, Tests: the primary flow in a browser, on the fixture source (BOOKEH_SOURCES=fixture)
// with a typed ISBN. The seed has removed earlier runs' Book, so the first Answer is
// "Not in library".

async function enterIsbn(page: Page) {
  const field = page.getByLabel('Or type an ISBN')
  await field.fill(E2E_ISBN_TYPED)
  await field.press('Enter')
}

test('scan to save, undo, save again', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const offOrigin: string[] = []
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') return
    if (url.origin !== origin) offOrigin.push(url.href)
  })

  const toast = page.locator('[data-toast-region]')
  const scanHeading = page.getByRole('heading', { name: 'Scan', exact: true })
  const notInLibrary = page.getByRole('heading', { name: 'Not in library' })
  const addToLibrary = page.getByRole('button', { name: 'Add to library' })

  await page.goto('/login')
  await page.getByLabel('Email').fill(E2E_EMAIL)
  await page.getByLabel('Password').fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  // The header copy: an empty shelf draws a second Scan book in the content.
  await page.locator('header').getByRole('link', { name: 'Scan book' }).click()
  await expect(scanHeading).toBeVisible()

  await enterIsbn(page)
  await expect(notInLibrary).toBeVisible()
  await expect(page.getByText('From fixture', { exact: true })).toBeVisible()
  const cover = page.locator('img[src^="/data/cover/"]')
  await expect(cover).toBeVisible()
  await expect
    .poll(() => cover.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth))
    .toBeGreaterThan(0)

  await addToLibrary.click()
  await expect(scanHeading).toBeVisible()
  await expect(toast).toContainText(`Saved to ${E2E_LOCATION}`)

  await toast.getByRole('button', { name: 'Undo' }).click()
  await expect(toast).toContainText('Undone')

  // The Undo removed the Book too, so the source answers again.
  await enterIsbn(page)
  await expect(notInLibrary).toBeVisible()
  await addToLibrary.click()
  await expect(scanHeading).toBeVisible()
  await expect(toast).toContainText(`Saved to ${E2E_LOCATION}`)

  // 3.46: the held save toast stays on Scan and is gone at the next Answer.
  await enterIsbn(page)
  await expect(page.getByRole('heading', { name: 'In library' })).toBeVisible()
  await expect(toast).not.toContainText('Saved to')

  // 3.51: Back returns to Scan, and browser Back from Scan to the section.
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(scanHeading).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(`${origin}/`)

  // 5.20: Open book leaves Scan for that Book's detail; closing it lands on the section.
  await page.locator('header').getByRole('link', { name: 'Scan book' }).click()
  await expect(scanHeading).toBeVisible()
  await enterIsbn(page)
  await expect(page.getByRole('heading', { name: 'In library' })).toBeVisible()
  await page.getByRole('button', { name: 'Open book' }).click()
  await expect(page).toHaveURL(/\/\?book=\d+$/)
  // Desktop Chrome is wide: Book detail is the side panel, named by the title.
  const detail = page.getByRole('complementary', { name: /Sapiens/ })
  await expect(detail).toBeVisible()
  await detail.getByRole('button', { name: 'Close' }).click()
  await expect(page).toHaveURL(`${origin}/`)
  await expect(scanHeading).not.toBeVisible()

  expect(offOrigin).toEqual([])
})
