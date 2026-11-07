import { expect, test, type Page } from '@playwright/test'

import { E2E_EMAIL, E2E_LOCATION, E2E_PASSWORD, E2E_SHOP_OWNED, E2E_SHOP_WISHED } from './account'

// Spine, Tests: the shop check in a browser, on the fixture source (BOOKEH_SOURCES=fixture)
// with typed ISBNs. The seed removed earlier runs' Books and the user's wishlists, so the
// wishlist picker offers only its "New list" field.

const LIST = 'Kauppalista'

async function enterIsbn(page: Page, isbn: string) {
  const field = page.getByLabel('Or type an ISBN', { exact: true })
  await field.fill(isbn)
  await field.press('Enter')
}

test('shop check: In library and On wishlist', async ({ page, context, baseURL }) => {
  const origin = new URL(baseURL!).origin
  const offOrigin: string[] = []
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'data:' || url.protocol === 'blob:') return
    if (url.origin !== origin) offOrigin.push(url.href)
  })

  const toast = page.locator('[data-toast-region]')
  const scanHeading = page.getByRole('heading', { name: 'Add book', exact: true })

  await page.goto('/login')
  await page.getByLabel('Email', { exact: true }).fill(E2E_EMAIL)
  await page.getByLabel('Password', { exact: true }).fill(E2E_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.locator('header').getByRole('link', { name: 'Add book' }).click()
  await expect(scanHeading).toBeVisible()

  // Book A: add it, then scan it again.
  await enterIsbn(page, E2E_SHOP_OWNED)
  await expect(page.getByRole('heading', { name: 'Not in library' })).toBeVisible()
  await page.getByRole('button', { name: 'Add to library' }).click()
  await expect(scanHeading).toBeVisible()
  await expect(toast).toContainText(`Saved to ${E2E_LOCATION}`)

  await enterIsbn(page, E2E_SHOP_OWNED)
  await expect(page.getByRole('heading', { name: 'In library' })).toBeVisible()
  await expect(page.getByText(`${E2E_LOCATION} · owned`)).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(scanHeading).toBeVisible()

  // Book B: wish for it through a new list, then scan it again.
  await enterIsbn(page, E2E_SHOP_WISHED)
  await expect(page.getByRole('heading', { name: 'Not in library' })).toBeVisible()
  await page.getByRole('button', { name: 'Add to wishlist' }).click()
  await page.getByLabel('New list', { exact: true }).fill(LIST)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(toast).toContainText(`Added to ${LIST}`)
  await expect(scanHeading).toBeVisible()

  await enterIsbn(page, E2E_SHOP_WISHED)
  await expect(page.getByRole('heading', { name: 'On wishlist' })).toBeVisible()
  await expect(page.getByText(`On ${LIST}`)).toBeVisible()

  expect(offOrigin).toEqual([])
})
